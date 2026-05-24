#!/usr/bin/env tsx
/**
 * publish-from-clusters — legge inbox/clusters-merged-by-day.md e pubblica
 * ogni cluster come post del blog (upsert idempotente su slug).
 *
 * Usage (standalone):
 *   pnpm --filter @workspace/scripts run publish:from-clusters
 *
 * Viene anche richiamato da run-cluster-daily.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { db, pool, postsTable, authorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80";

const COVER_BY_DOW = [
  "https://images.unsplash.com/photo-1568772585407-9f217076d0bb?w=1600&q=80",
  "https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=1600&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80",
  "https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=1600&q=80",
  "https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=1600&q=80",
  "https://images.unsplash.com/photo-1505209498127-5efee99bbd5e?w=1600&q=80",
  "https://images.unsplash.com/photo-1526948531399-320e7e40f0ca?w=1600&q=80",
];

interface Cluster {
  date: string;
  taskCount: number;
  taskLines: string[];
  detailsContent: string;
}

function formatDateIt(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_IT[month - 1]} ${year}`;
}

function pickCover(isoDate: string): string {
  const dow = new Date(isoDate).getDay();
  return COVER_BY_DOW[dow] ?? DEFAULT_COVER;
}

function parseClusters(markdown: string): Cluster[] {
  const clusters: Cluster[] = [];

  const sectionSplitter =
    /(?=^## 📅 \d{4}-\d{2}-\d{2} \(\d+ task\))/m;
  const sections = markdown.split(sectionSplitter).filter((s) =>
    s.startsWith("## 📅")
  );

  for (const section of sections) {
    const headerMatch = section.match(
      /^## 📅 (\d{4}-\d{2}-\d{2}) \((\d+) task\)/
    );
    if (!headerMatch) continue;

    const date = headerMatch[1];
    const taskCount = parseInt(headerMatch[2], 10);

    const taskLines: string[] = [];
    for (const line of section.split("\n")) {
      if (/^- [✅📋🔄❌❓]/.test(line)) {
        const cleaned = line.replace(/^- [✅📋🔄❌❓] \*\*[^*]+\*\* — /, "");
        taskLines.push(cleaned.trim());
      }
    }

    const detailsMatch = section.match(
      /<details>[\s\S]*?<summary>Dettaglio task<\/summary>([\s\S]*?)<\/details>/
    );
    const detailsContent = detailsMatch
      ? detailsMatch[1].trim()
      : "_Nessun dettaglio disponibile._";

    clusters.push({ date, taskCount, taskLines, detailsContent });
  }

  return clusters;
}

function buildPostContent(cluster: Cluster): string {
  const { date, taskCount, taskLines, detailsContent } = cluster;
  const dateIt = formatDateIt(date);

  const taskList = taskLines.map((t) => `- ${t}`).join("\n");

  const cleanedDetails = detailsContent
    .replace(/### [✅📋🔄❌❓] /g, "### ")
    .replace(/\*\*([^*]+)\*\* — /g, "**$1** — ")
    .trim();

  return [
    `Ecco un riepilogo delle attività completate il **${dateIt}** su BikerLink.`,
    "",
    `## ${taskCount} task ${taskCount === 1 ? "completato" : "completati"}`,
    "",
    taskList,
    "",
    "---",
    "",
    "## Dettaglio",
    "",
    cleanedDetails,
    "",
    "---",
    "",
    "_Post generato automaticamente dal sistema di tracking di BikerLink._",
  ].join("\n");
}

function buildExcerpt(cluster: Cluster): string {
  const preview = cluster.taskLines.slice(0, 3).join(", ");
  const more =
    cluster.taskCount > 3 ? ` e altri ${cluster.taskCount - 3} task` : "";
  return `Recap del ${formatDateIt(cluster.date)}: ${preview}${more}.`;
}

async function getFirstAuthorId(): Promise<number> {
  const author = await db.query.authorsTable.findFirst({
    columns: { id: true },
    orderBy: (t, { asc }) => [asc(t.id)],
  });
  if (!author) throw new Error("[publish-from-clusters] Nessun autore nel DB");
  return author.id;
}

function contentHash(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy",
});

interface TranslationResult {
  titleEn: string;
  excerptEn: string;
  contentEn: string;
}

async function translateToEn(
  title: string,
  excerpt: string,
  content: string,
): Promise<TranslationResult> {
  const prompt = `Translate the following Italian motorcycle dev-blog post into English. Be faithful but natural.

Return ONLY a valid JSON object with exactly these three keys: "title", "excerpt", "content".
No explanation, no markdown wrapper, no extra text.

---
TITLE: ${title}
---
EXCERPT: ${excerpt}
---
CONTENT:
${content}
---`;

  const message = await anthropic.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 4096,
    messages:   [{ role: "user", content: prompt }],
  });
  const block = message.content[0];
  const text = block.type === "text" ? block.text.trim() : "{}";
  try {
    const parsed = JSON.parse(text) as { title?: string; excerpt?: string; content?: string };
    return {
      titleEn:   parsed.title   ?? title,
      excerptEn: parsed.excerpt ?? excerpt,
      contentEn: parsed.content ?? content,
    };
  } catch {
    console.warn("[publish-from-clusters] ⚠ translateToEn — JSON parse failed, using IT fallback");
    return { titleEn: title, excerptEn: excerpt, contentEn: content };
  }
}

/** Returns slugs whose audio was cleared because content changed (or was new). */
export async function publishFromClusters(
  clustersPath?: string
): Promise<string[]> {
  const root = resolve(process.cwd(), "..");
  const filePath =
    clustersPath ??
    resolve(root, "inbox", "clusters-merged-by-day.md");

  if (!existsSync(filePath)) {
    console.warn(
      `[publish-from-clusters] File non trovato: ${filePath} — skip`
    );
    return [];
  }

  const markdown = readFileSync(filePath, "utf8");
  const clusters = parseClusters(markdown);

  if (clusters.length === 0) {
    console.log("[publish-from-clusters] Nessun cluster trovato — skip");
    return [];
  }

  const authorId = await getFirstAuthorId();
  let published = 0;
  let skipped = 0;
  const audioCleared: string[] = [];

  for (const cluster of clusters) {
    const slug = `recap-${cluster.date}`;
    const title = `Recap del ${formatDateIt(cluster.date)}`;
    const content = buildPostContent(cluster);
    const excerpt = buildExcerpt(cluster);
    const coverImageUrl = pickCover(cluster.date);
    const readingMinutes = Math.max(2, Math.ceil(cluster.taskCount * 0.5));

    // Check if content has changed (to decide whether to clear audio_url and re-translate)
    const existing = await db
      .select({ content: postsTable.content, contentEn: postsTable.contentEn })
      .from(postsTable)
      .where(eq(postsTable.slug, slug))
      .limit(1);

    const contentChanged =
      existing.length === 0 || contentHash(existing[0].content) !== contentHash(content);
    const needsTranslation =
      contentChanged || !existing[0]?.contentEn;

    let translationResult: { titleEn: string; excerptEn: string; contentEn: string } | null = null;

    if (needsTranslation) {
      try {
        translationResult = await translateToEn(title, excerpt, content);
        console.log(`[publish-from-clusters] 🌐 tradotto EN: ${slug}`);
      } catch (err) {
        console.warn(
          `[publish-from-clusters] ⚠ traduzione EN fallita per ${slug}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const conflictSet: Record<string, unknown> = {
      title, excerpt, content, coverImageUrl, readingMinutes,
      tags: ["recap", "bikerlink", "daily"],
    };
    if (contentChanged) {
      conflictSet["audioUrl"] = null;
    }
    if (translationResult) {
      conflictSet["titleEn"]   = translationResult.titleEn;
      conflictSet["excerptEn"] = translationResult.excerptEn;
      conflictSet["contentEn"] = translationResult.contentEn;
    }

    await db
      .insert(postsTable)
      .values({
        slug,
        title,
        excerpt,
        content,
        coverImageUrl,
        category: "Recap",
        tags: ["recap", "bikerlink", "daily"],
        authorId,
        publishedAt: new Date(`${cluster.date}T23:30:00+02:00`),
        readingMinutes,
        featured: 0,
        titleEn: translationResult?.titleEn ?? null,
        excerptEn: translationResult?.excerptEn ?? null,
        contentEn: translationResult?.contentEn ?? null,
      })
      .onConflictDoUpdate({
        target: postsTable.slug,
        set: conflictSet,
      });

    if (contentChanged) {
      console.log(`[publish-from-clusters] upsert (content changed): ${slug}`);
      audioCleared.push(slug);
      published++;
    } else {
      skipped++;
    }
  }

  console.log(
    `[publish-from-clusters] done — aggiornati: ${published}, invariati: ${skipped}`
  );
  return audioCleared;
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("publish-from-clusters.ts") ||
    process.argv[1].endsWith("publish-from-clusters.js"))
) {
  try {
    await publishFromClusters();
  } finally {
    await pool.end();
  }
}
