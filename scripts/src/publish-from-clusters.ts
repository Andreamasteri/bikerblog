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
import { db, pool, postsTable, authorsTable } from "@workspace/db";

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

export async function publishFromClusters(
  clustersPath?: string
): Promise<void> {
  const root = resolve(process.cwd(), "..");
  const filePath =
    clustersPath ??
    resolve(root, "inbox", "clusters-merged-by-day.md");

  if (!existsSync(filePath)) {
    console.warn(
      `[publish-from-clusters] File non trovato: ${filePath} — skip`
    );
    return;
  }

  const markdown = readFileSync(filePath, "utf8");
  const clusters = parseClusters(markdown);

  if (clusters.length === 0) {
    console.log("[publish-from-clusters] Nessun cluster trovato — skip");
    return;
  }

  const authorId = await getFirstAuthorId();
  let published = 0;
  let skipped = 0;

  for (const cluster of clusters) {
    const slug = `recap-${cluster.date}`;
    const title = `Recap del ${formatDateIt(cluster.date)}`;
    const content = buildPostContent(cluster);
    const excerpt = buildExcerpt(cluster);
    const coverImageUrl = pickCover(cluster.date);
    const readingMinutes = Math.max(2, Math.ceil(cluster.taskCount * 0.5));

    const result = await db
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
      })
      .onConflictDoNothing({ target: postsTable.slug });

    const inserted = (result.rowCount ?? 0) > 0;
    if (inserted) {
      console.log(`[publish-from-clusters] pubblicato: ${slug}`);
      published++;
    } else {
      skipped++;
    }
  }

  console.log(
    `[publish-from-clusters] done — pubblicati: ${published}, già presenti: ${skipped}`
  );
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
