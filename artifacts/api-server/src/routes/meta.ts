import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  postsTable,
  authorsTable,
  commentsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/tags", async (_req, res): Promise<void> => {
  const rows = await db.execute<{ tag: string; count: number }>(
    sql`SELECT unnest(${postsTable.tags}) AS tag, COUNT(*)::int AS count
        FROM ${postsTable}
        GROUP BY tag
        ORDER BY count DESC, tag ASC`,
  );
  res.json(rows.rows.map((r) => ({ tag: r.tag, count: Number(r.count) })));
});

router.get("/stats", async (_req, res): Promise<void> => {
  const [postsAgg] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      totalLikes: sql<number>`cast(coalesce(sum(${postsTable.likeCount}), 0) as int)`,
    })
    .from(postsTable);
  const [commentsAgg] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(commentsTable);
  const [authorsAgg] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(authorsTable);
  const categoryRows = await db
    .select({
      category: postsTable.category,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(postsTable)
    .groupBy(postsTable.category);

  res.json({
    totalPosts: Number(postsAgg?.total ?? 0),
    totalComments: Number(commentsAgg?.total ?? 0),
    totalLikes: Number(postsAgg?.totalLikes ?? 0),
    totalAuthors: Number(authorsAgg?.total ?? 0),
    categories: categoryRows.map((r) => ({
      category: r.category,
      count: Number(r.count),
    })),
  });
});

router.get("/authors", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: authorsTable.id,
      name: authorsTable.name,
      avatarUrl: authorsTable.avatarUrl,
      bio: authorsTable.bio,
      location: authorsTable.location,
      bike: authorsTable.bike,
      postCount: sql<number>`cast(count(${postsTable.id}) as int)`,
    })
    .from(authorsTable)
    .leftJoin(postsTable, eq(postsTable.authorId, authorsTable.id))
    .groupBy(authorsTable.id)
    .orderBy(desc(sql`count(${postsTable.id})`));
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatarUrl: r.avatarUrl,
      bio: r.bio,
      location: r.location,
      bike: r.bike,
      postCount: Number(r.postCount),
    })),
  );
});

export default router;
