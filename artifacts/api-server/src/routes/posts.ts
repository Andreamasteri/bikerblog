import { createHash } from "crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  postsTable,
  authorsTable,
  commentsTable,
  postLikesTable,
} from "@workspace/db";
import {
  ListPostsQueryParams,
  ListPopularPostsQueryParams,
  GetPostParams,
  LikePostParams,
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

type PostRow = typeof postsTable.$inferSelect;
type AuthorRow = typeof authorsTable.$inferSelect;

async function commentCounts(
  postIds: number[],
): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: commentsTable.postId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(commentsTable)
    .where(
      sql`${commentsTable.postId} = ANY(${sql.raw(
        `ARRAY[${postIds.join(",")}]::int[]`,
      )})`,
    )
    .groupBy(commentsTable.postId);
  return new Map(rows.map((r) => [r.postId, Number(r.count)]));
}

function shapePost(
  p: PostRow,
  a: AuthorRow,
  commentCount: number,
): Record<string, unknown> {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    coverImageUrl: p.coverImageUrl,
    category: p.category,
    tags: p.tags ?? [],
    author: {
      id: a.id,
      name: a.name,
      avatarUrl: a.avatarUrl,
      bio: a.bio,
      location: a.location,
      bike: a.bike,
    },
    publishedAt: p.publishedAt.toISOString(),
    readingMinutes: p.readingMinutes,
    likeCount: p.likeCount,
    commentCount,
    location: p.location,
    bike: p.bike,
    dailyMaxim: p.dailyMaxim,
    audioUrl: p.audioUrl ?? null,
  };
}

async function fetchPostsShaped(
  whereClause: ReturnType<typeof and> | undefined,
  order: "recent" | "popular" = "recent",
  limit?: number,
): Promise<Record<string, unknown>[]> {
  let q = db
    .select({ post: postsTable, author: authorsTable })
    .from(postsTable)
    .innerJoin(authorsTable, eq(postsTable.authorId, authorsTable.id))
    .$dynamic();
  if (whereClause) q = q.where(whereClause);
  q =
    order === "popular"
      ? q.orderBy(desc(postsTable.likeCount), desc(postsTable.publishedAt))
      : q.orderBy(desc(postsTable.publishedAt));
  if (limit) q = q.limit(limit);
  const rows = await q;
  const counts = await commentCounts(rows.map((r) => r.post.id));
  return rows.map((r) =>
    shapePost(r.post, r.author, counts.get(r.post.id) ?? 0),
  );
}

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tag, category, search } = parsed.data;
  const conditions = [] as ReturnType<typeof eq>[];
  if (tag) {
    conditions.push(sql`${tag} = ANY(${postsTable.tags})` as never);
  }
  if (category) {
    conditions.push(eq(postsTable.category, category));
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        ilike(postsTable.title, like),
        ilike(postsTable.excerpt, like),
        ilike(postsTable.content, like),
      ) as never,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const data = await fetchPostsShaped(where);
  res.json(data);
});

router.get("/posts/featured", async (_req, res): Promise<void> => {
  const [row] = await db
    .select({ post: postsTable, author: authorsTable })
    .from(postsTable)
    .innerJoin(authorsTable, eq(postsTable.authorId, authorsTable.id))
    .orderBy(desc(postsTable.featured), desc(postsTable.publishedAt))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "No posts yet" });
    return;
  }
  const counts = await commentCounts([row.post.id]);
  res.json(shapePost(row.post, row.author, counts.get(row.post.id) ?? 0));
});

router.get("/posts/popular", async (req, res): Promise<void> => {
  const parsed = ListPopularPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = parsed.data.limit ?? 5;
  const data = await fetchPostsShaped(undefined, "popular", limit);
  res.json(data);
});

router.get("/posts/:slug", async (req, res): Promise<void> => {
  const parsed = GetPostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .select({ post: postsTable, author: authorsTable })
    .from(postsTable)
    .innerJoin(authorsTable, eq(postsTable.authorId, authorsTable.id))
    .where(eq(postsTable.slug, parsed.data.slug));
  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const counts = await commentCounts([row.post.id]);
  res.json(shapePost(row.post, row.author, counts.get(row.post.id) ?? 0));
});

router.post("/posts/:slug/like", async (req, res): Promise<void> => {
  const parsed = LikePostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.slug, parsed.data.slug));
  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const connectionIp = req.socket.remoteAddress ?? "unknown";
  if (!checkLikeRateLimit(connectionIp)) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }
  const ip = req.ip ?? connectionIp;
  const ipHash = hashIp(ip);
  let updated: typeof postsTable.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(postLikesTable).values({ postId: row.id, ipHash });
      const [u] = await tx
        .update(postsTable)
        .set({ likeCount: sql`${postsTable.likeCount} + 1` })
        .where(eq(postsTable.slug, parsed.data.slug))
        .returning();
      updated = u;
    });
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "23505") {
      res.status(429).json({ error: "You already liked this post." });
    } else {
      req.log.error({ err, slug: parsed.data.slug }, "like transaction failed");
      res.status(500).json({ error: "Failed to record like." });
    }
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [author] = await db
    .select()
    .from(authorsTable)
    .where(eq(authorsTable.id, updated.authorId));
  const counts = await commentCounts([updated.id]);
  res.json(shapePost(updated, author!, counts.get(updated.id) ?? 0));
});

export default router;
