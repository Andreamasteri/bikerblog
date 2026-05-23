import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, postsTable, commentsTable } from "@workspace/db";
import {
  ListPostCommentsParams,
  CreatePostCommentParams,
  CreatePostCommentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  res.json(
    rows.map((c) => ({
      id: c.id,
      postId: c.postId,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
  );
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
  res.status(201).json({
    id: inserted.id,
    postId: inserted.postId,
    authorName: inserted.authorName,
    body: inserted.body,
    createdAt: inserted.createdAt.toISOString(),
  });
});

export default router;
