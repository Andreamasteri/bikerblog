#!/usr/bin/env tsx
/**
 * translate-backfill — traduce in inglese tutti i post senza titleEn/excerptEn/bodyEn.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run translate:backfill
 *   pnpm --filter @workspace/scripts run translate:backfill -- --slug diary-2026-03-12
 *   pnpm --filter @workspace/scripts run translate:backfill -- --dry-run
 *   pnpm --filter @workspace/scripts run translate:backfill -- --force
 *
 * Uses Horus (bikerlink:latest via Ollama, server TC) for bulk translation.
 */

import { db, postsTable } from "@workspace/db";
import { eq, isNull, or, sql } from "drizzle-orm";
import { horusChat } from "@workspace/horus";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const slugIdx = args.indexOf("--slug");
const TARGET_SLUG = slugIdx !== -1 ? args[slugIdx + 1] : null;

const PRIVACY_SYSTEM_PROMPT = `You are a professional translator specializing in Italian motorcycle enthusiast content.

MANDATORY PRIVACY RULE — matching engine:
BikerLink has a proprietary matching engine. In all translations, NEVER reveal:
- The internal logic of the matching algorithm (formulas, weights, numerical criteria, SQL, specific GPS functions)
- The names of database tables related to matching (e.g. join table names, internal state columns)
- Numerical values of match types or internal states (e.g. numerical codes, internal enums)
- Details on how GPS distance or search radius is calculated
- Source file names or internal code paths of the matching engine
Describe matching in an anecdotal, user-impact way: "improved the matching", "the system now recognizes similar bikes", "fixed a bug in the match flow". NEVER the internal technical how.`;

async function translatePost(post: {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
}): Promise<{ titleEn: string; excerptEn: string; bodyEn: string }> {
  const prompt = `Translate the following Italian motorcycle blog post into English. Be faithful but natural.

Return ONLY a valid JSON object with exactly these three keys: "titleEn", "excerptEn", "bodyEn".
Preserve all Markdown formatting in bodyEn. Keep proper nouns, model names, and technical terms unchanged.
No explanation, no markdown wrapper, no extra text outside the JSON object.

---
TITLE: ${post.title}
---
EXCERPT: ${post.excerpt}
---
BODY (Markdown):
${post.content}
---`;

  const rawText = await horusChat(
    [
      { role: "system", content: PRIVACY_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    { maxTokens: 4096 }
  );

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in Horus response for slug: ${post.slug}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    titleEn?: string;
    excerptEn?: string;
    bodyEn?: string;
  };

  if (!parsed.titleEn || !parsed.excerptEn || !parsed.bodyEn) {
    throw new Error(
      `Missing required fields in response for slug: ${post.slug}`
    );
  }

  return {
    titleEn: parsed.titleEn,
    excerptEn: parsed.excerptEn,
    bodyEn: parsed.bodyEn,
  };
}

async function main() {
  console.log(
    `translate-backfill: dry=${DRY_RUN} force=${FORCE} slug=${TARGET_SLUG ?? "all"}`
  );

  let posts: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    titleEn: string | null;
    excerptEn: string | null;
    bodyEn: string | null;
  }>;

  if (TARGET_SLUG) {
    posts = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        excerpt: postsTable.excerpt,
        content: postsTable.content,
        titleEn: postsTable.titleEn,
        excerptEn: postsTable.excerptEn,
        bodyEn: postsTable.bodyEn,
      })
      .from(postsTable)
      .where(eq(postsTable.slug, TARGET_SLUG));

    if (posts.length === 0) {
      console.error(`Post not found: ${TARGET_SLUG}`);
      process.exit(1);
    }
  } else if (FORCE) {
    posts = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        excerpt: postsTable.excerpt,
        content: postsTable.content,
        titleEn: postsTable.titleEn,
        excerptEn: postsTable.excerptEn,
        bodyEn: postsTable.bodyEn,
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
        excerptEn: postsTable.excerptEn,
        bodyEn: postsTable.bodyEn,
      })
      .from(postsTable)
      .where(
        or(
          isNull(postsTable.bodyEn),
          sql`trim(${postsTable.bodyEn}) = ''`,
        )
      );
  }

  const total = posts.length;
  console.log(`Found ${total} post(s) to translate.`);

  if (total === 0) {
    console.log("Nothing to do. All posts already have English content.");
    process.exit(0);
  }

  let translated = 0;
  let skipped    = 0;
  let failed     = 0;

  const CONCURRENCY = 5;

  async function processOne(post: typeof posts[number], idx: number) {
    const prefix = `[${idx + 1}/${total}] [${post.slug}]`;

    if (!FORCE && post.titleEn && post.excerptEn && post.bodyEn && post.bodyEn.trim().length > 0) {
      console.log(`${prefix} Already translated — skipped`);
      skipped++;
      return;
    }

    if (DRY_RUN) {
      console.log(`${prefix} [dry-run] Would translate: "${post.title}"`);
      skipped++;
      return;
    }

    console.log(`${prefix} Translating...`);

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

      console.log(`${prefix} ✓ "${translation.titleEn}"`);
      translated++;
    } catch (err) {
      console.error(
        `${prefix} ✗ Failed:`,
        err instanceof Error ? err.message : String(err)
      );
      failed++;
    }
  }

  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const chunk = posts.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((p, j) => processOne(p, i + j)));
  }

  console.log(
    `\nDone — translated: ${translated}, skipped: ${skipped}, failed: ${failed} (total: ${total})`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main();
