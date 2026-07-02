import { createHash } from "crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, postsTable, commentsTable, commentLikesTable } from "@workspace/db";
import {
  ListPostCommentsParams,
  CreatePostCommentParams,
  CreatePostCommentBody,
  LikeCommentParams,
} from "@workspace/api-zod";

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

const LIKE_RATE_WINDOW_MS = 60_000;
const LIKE_RATE_MAX = 10;
const likeRateMap = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - LIKE_RATE_WINDOW_MS;
  for (const [key, timestamps] of likeRateMap) {
    const remaining = timestamps.filter((t) => t > cutoff);
    if (remaining.length === 0) likeRateMap.delete(key);
    else likeRateMap.set(key, remaining);
  }
}, 5 * 60_000).unref();

function checkLikeRateLimit(connectionIp: string): boolean {
  const now = Date.now();
  const cutoff = now - LIKE_RATE_WINDOW_MS;
  const bucket = (likeRateMap.get(connectionIp) ?? []).filter(
    (t) => t > cutoff,
  );
  if (bucket.length >= LIKE_RATE_MAX) return false;
  bucket.push(now);
  likeRateMap.set(connectionIp, bucket);
  return true;
}

const router: IRouter = Router();

function shapeComment(c: typeof commentsTable.$inferSelect): Record<string, unknown> {
  return {
    id: c.id,
    postId: c.postId,
    authorName: c.authorName,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    likeCount: c.likeCount,
  };
}

router.get("/posts/:slug/comments", async (req, res): Promise<void> => {
  const parsed = ListPostCommentsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.slug, parsed.data.slug));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const rows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.postId, post.id))
    .orderBy(asc(commentsTable.createdAt));
  res.json(rows.map(shapeComment));
});

router.post("/posts/:slug/comments", async (req, res): Promise<void> => {
  const params = CreatePostCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreatePostCommentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.slug, params.data.slug));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [inserted] = await db
    .insert(commentsTable)
    .values({
      postId: post.id,
      authorName: body.data.authorName,
      body: body.data.body,
    })
    .returning();
  res.status(201).json(shapeComment(inserted));
});

router.post("/posts/:slug/comments/:commentId/like", async (req, res): Promise<void> => {
  const parsed = LikeCommentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .select({ id: commentsTable.id })
    .from(commentsTable)
    .innerJoin(postsTable, eq(commentsTable.postId, postsTable.id))
    .where(
      and(
        eq(commentsTable.id, parsed.data.commentId),
        eq(postsTable.slug, parsed.data.slug),
        eq(postsTable.status, "published"),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  const connectionIp = req.socket.remoteAddress ?? "unknown";
  if (!checkLikeRateLimit(connectionIp)) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }
  const ip = req.ip ?? connectionIp;
  const ipHash = hashIp(ip);
  let updated: typeof commentsTable.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(commentLikesTable).values({ commentId: row.id, ipHash });
      const [u] = await tx
        .update(commentsTable)
        .set({ likeCount: sql`${commentsTable.likeCount} + 1` })
        .where(eq(commentsTable.id, row.id))
        .returning();
      updated = u;
    });
  } catch (err) {
    const pgCode =
      (err as { code?: string }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      res.status(429).json({ error: "You already liked this comment." });
    } else {
      req.log.error(
        { err, slug: parsed.data.slug, commentId: parsed.data.commentId },
        "comment like transaction failed",
      );
      res.status(500).json({ error: "Failed to record like." });
    }
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.json(shapeComment(updated));
});

export default router;
