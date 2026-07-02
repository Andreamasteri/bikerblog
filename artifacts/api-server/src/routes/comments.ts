import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, postsTable, commentsTable, commentLikesTable } from "@workspace/db";
import {
  ListPostCommentsParams,
  CreatePostCommentParams,
  CreatePostCommentBody,
  LikeCommentParams,
} from "@workspace/api-zod";
import {
  createLikeRateLimiter,
  getClientIp,
  hashIp,
} from "../lib/like-rate-limit";

// A single post can carry many comments, so an engaged reader legitimately
// likes more comments per minute than they'd ever like whole posts. The
// ceiling is higher than the post-like limiter (see posts.ts) but still
// bounded, and tracked in its own bucket so a comment-liking burst can never
// consume a visitor's post-like budget or vice versa.
const COMMENT_LIKE_RATE_WINDOW_MS = 60_000;
const COMMENT_LIKE_RATE_MAX = 20;
const checkLikeRateLimit = createLikeRateLimiter({
  windowMs: COMMENT_LIKE_RATE_WINDOW_MS,
  max: COMMENT_LIKE_RATE_MAX,
});

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
  const clientIp = getClientIp(req);
  if (!checkLikeRateLimit(clientIp)) {
    req.log.warn(
      { slug: parsed.data.slug, commentId: parsed.data.commentId },
      "comment like rate limit exceeded",
    );
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }
  const ipHash = hashIp(clientIp);
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
