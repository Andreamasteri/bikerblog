import { db, postsTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";
import { translatePostToEn } from "./translate.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceAll = args.includes("--force");
const slugIdx = args.indexOf("--slug");
const targetSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

async function main() {
  console.log(`translate-posts: dry=${dryRun} force=${forceAll} slug=${targetSlug ?? "all"}`);

  let posts: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    titleEn: string | null;
  }>;

  if (targetSlug) {
    posts = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        excerpt: postsTable.excerpt,
        content: postsTable.content,
        titleEn: postsTable.titleEn,
      })
      .from(postsTable)
      .where(eq(postsTable.slug, targetSlug));

    if (posts.length === 0) {
      console.error(`Post not found: ${targetSlug}`);
      process.exit(1);
    }
  } else if (forceAll) {
    posts = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        excerpt: postsTable.excerpt,
        content: postsTable.content,
        titleEn: postsTable.titleEn,
      })
      .from(postsTable);
  } else {
    posts = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        excerpt: postsTable.excerpt,
        content: postsTable.content,
        titleEn: postsTable.titleEn,
      })
      .from(postsTable)
      .where(or(isNull(postsTable.titleEn), isNull(postsTable.excerptEn), isNull(postsTable.bodyEn)));
  }

  console.log(`Found ${posts.length} post(s) to translate.`);

  for (const post of posts) {
    console.log(`\n[${post.slug}] Translating...`);

    if (dryRun) {
      console.log(`  [dry-run] Would translate: "${post.title}"`);
      continue;
    }

    try {
      const translation = await translatePostToEn(post.title, post.excerpt, post.content, post.slug);
      await db
        .update(postsTable)
        .set({
          titleEn: translation.titleEn,
          excerptEn: translation.excerptEn,
          bodyEn: translation.bodyEn,
        })
        .where(eq(postsTable.id, post.id));

      console.log(`  ✓ Translated: "${translation.titleEn}"`);
    } catch (err) {
      console.error(`  ✗ Failed for ${post.slug}:`, err);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main();
