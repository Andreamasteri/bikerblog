#!/usr/bin/env tsx
/**
 * seed-blog — versioned, idempotent seed for BikerBlog content.
 *
 * Restores authors, posts and comments from `seed-blog/data.json`
 * so the blog can be rebuilt from scratch after a DB reset or in a
 * fresh Repl. Re-running it does not duplicate rows: authors and
 * posts are upserted on stable keys (author id, post slug), and
 * comments are matched on (post_id, author_name, body).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:blog
 *
 * Requires DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  authorsTable,
  postsTable,
  commentsTable,
} from "@workspace/db";

type AuthorSeed = {
  id: number;
  name: string;
  avatar_url: string;
  bio: string;
  location: string | null;
  bike: string | null;
};

type PostSeed = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  category: string;
  tags: string[];
  author_id: number;
  published_at: string;
  reading_minutes: number;
  like_count: number;
  location: string | null;
  bike: string | null;
  featured: number;
};

type CommentSeed = {
  id: number;
  post_id: number;
  author_name: string;
  body: string;
  created_at: string;
};

type SeedData = {
  authors: AuthorSeed[];
  posts: PostSeed[];
  comments: CommentSeed[];
};

function loadData(): SeedData {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataPath = resolve(here, "seed-blog/data.json");
  return JSON.parse(readFileSync(dataPath, "utf8")) as SeedData;
}

async function seedAuthors(authors: AuthorSeed[]): Promise<void> {
  for (const a of authors) {
    await db
      .insert(authorsTable)
      .values({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatar_url,
        bio: a.bio,
        location: a.location,
        bike: a.bike,
      })
      .onConflictDoUpdate({
        target: authorsTable.id,
        set: {
          name: a.name,
          avatarUrl: a.avatar_url,
          bio: a.bio,
          location: a.location,
          bike: a.bike,
        },
      });
  }
  // Keep the serial sequence ahead of any explicit ids we inserted.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('authors', 'id'),
                     GREATEST((SELECT COALESCE(MAX(id), 1) FROM authors), 1))`,
  );
  console.log(`[seed-blog] upserted ${authors.length} authors`);
}

async function seedPosts(posts: PostSeed[]): Promise<Map<number, number>> {
  // Returns: seed post id -> actual DB post id (looked up by slug).
  const idMap = new Map<number, number>();
  for (const p of posts) {
    await db
      .insert(postsTable)
      .values({
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        coverImageUrl: p.cover_image_url,
        category: p.category,
        tags: p.tags,
        authorId: p.author_id,
        publishedAt: new Date(p.published_at),
        readingMinutes: p.reading_minutes,
        likeCount: p.like_count,
        location: p.location,
        bike: p.bike,
        featured: p.featured,
      })
      .onConflictDoUpdate({
        target: postsTable.slug,
        set: {
          title: p.title,
          excerpt: p.excerpt,
          content: p.content,
          coverImageUrl: p.cover_image_url,
          category: p.category,
          tags: p.tags,
          authorId: p.author_id,
          publishedAt: new Date(p.published_at),
          readingMinutes: p.reading_minutes,
          location: p.location,
          bike: p.bike,
          featured: p.featured,
        },
      });
    const found = await db.query.postsTable.findFirst({
      where: (t, { eq }) => eq(t.slug, p.slug),
      columns: { id: true },
    });
    if (!found) throw new Error(`Post not found after upsert: ${p.slug}`);
    idMap.set(p.id, found.id);
  }
  console.log(`[seed-blog] upserted ${posts.length} posts`);
  return idMap;
}

async function seedComments(
  comments: CommentSeed[],
  postIdMap: Map<number, number>,
): Promise<void> {
  let inserted = 0;
  for (const c of comments) {
    const realPostId = postIdMap.get(c.post_id);
    if (!realPostId) {
      console.warn(
        `[seed-blog] skipping comment for unknown post_id=${c.post_id}`,
      );
      continue;
    }
    const existing = await db.query.commentsTable.findFirst({
      where: (t, { and, eq }) =>
        and(
          eq(t.postId, realPostId),
          eq(t.authorName, c.author_name),
          eq(t.body, c.body),
        ),
      columns: { id: true },
    });
    if (existing) continue;
    await db.insert(commentsTable).values({
      postId: realPostId,
      authorName: c.author_name,
      body: c.body,
      createdAt: new Date(c.created_at),
    });
    inserted++;
  }
  console.log(
    `[seed-blog] inserted ${inserted} new comments (${comments.length - inserted} already present)`,
  );
}

async function main(): Promise<void> {
  const data = loadData();
  console.log(
    `[seed-blog] loaded ${data.authors.length} authors, ${data.posts.length} posts, ${data.comments.length} comments`,
  );
  await seedAuthors(data.authors);
  const postIdMap = await seedPosts(data.posts);
  await seedComments(data.comments, postIdMap);
  console.log("[seed-blog] done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
