import Anthropic from "@anthropic-ai/sdk";
import { db, postsTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";

const client = new Anthropic();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceAll = args.includes("--force");
const slugIdx = args.indexOf("--slug");
const targetSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

async function translatePost(post: {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
}): Promise<{ titleEn: string; excerptEn: string; bodyEn: string }> {
  const prompt = `You are a professional translator. Translate the following Italian motorcycle blog post to English.
Return ONLY a valid JSON object with exactly these three keys: "titleEn", "excerptEn", "bodyEn".
Preserve all Markdown formatting in bodyEn. Keep proper nouns, model names, and technical terms unchanged.
Do not add any explanation or wrapper text outside the JSON object.

Italian title: ${post.title}

Italian excerpt: ${post.excerpt}

Italian body (Markdown):
${post.content}`;

  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in Claude response for slug: ${post.slug}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    titleEn?: string;
    excerptEn?: string;
    bodyEn?: string;
  };

  if (!parsed.titleEn || !parsed.excerptEn || !parsed.bodyEn) {
    throw new Error(`Missing required fields in response for slug: ${post.slug}`);
  }

  return {
    titleEn: parsed.titleEn,
    excerptEn: parsed.excerptEn,
    bodyEn: parsed.bodyEn,
  };
}

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
      const translation = await translatePost(post);
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
