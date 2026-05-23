#!/usr/bin/env tsx
/**
 * daily-pipeline — pipeline notturna BikerBlog (23:30)
 *
 * 1. inbox:fetch   — scarica la chat di BikerLink
 * 2. cluster:tasks — raggruppa i task MERGED per giornata
 * 3. genera bozza  — produce inbox/drafts/YYYY-MM-DD.md
 *
 * Variabili d'ambiente richieste:
 *   INBOX_URL    — endpoint chat-export di BikerLink
 *   INBOX_TOKEN  — token Bearer per l'endpoint
 *   INBOX_SOURCE — nome sorgente (default: bikerlink)
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "..");
const INBOX = resolve(ROOT, "inbox");
const DRAFTS = resolve(INBOX, "drafts");

function run(cmd: string): string {
  console.log(`[daily-pipeline] $ ${cmd}`);
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    if (out) process.stdout.write(out);
    return out;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    throw new Error(`Command failed: ${cmd}\n${e.message ?? ""}`);
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àáâã]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõ]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractChatHighlights(chatMd: string): string[] {
  const lines = chatMd.split("\n");
  const highlights: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      highlights.push(trimmed.replace(/^#{2,3}\s+/, ""));
    }
  }
  return highlights.slice(0, 10);
}

function extractClusterSections(clusterMd: string): Array<{ date: string; tasks: string[] }> {
  const sections: Array<{ date: string; tasks: string[] }> = [];
  const blocks = clusterMd.split(/\n## 📅 /);
  for (const block of blocks.slice(1)) {
    const firstLine = block.split("\n")[0] ?? "";
    const dateMatch = firstLine.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    const tasks: string[] = [];
    for (const line of block.split("\n")) {
      const m = line.match(/^- [✅📋🔄❌❓] \*\*([^*]+)\*\* — (.+)$/);
      if (m) tasks.push(`${m[1]}: ${m[2].trim()}`);
    }
    sections.push({ date, tasks });
  }
  return sections;
}

function buildDraft(date: string, chatMd: string | null, clusterMd: string | null): string {
  const highlights = chatMd ? extractChatHighlights(chatMd) : [];
  const clusters = clusterMd ? extractClusterSections(clusterMd) : [];

  const todayClusters = clusters.filter((c) => c.date === date);
  const taskLines = todayClusters.flatMap((c) => c.tasks);

  const titleSuffix = taskLines.length > 0
    ? taskLines[0].replace(/^[A-Z0-9#-]+:\s*/, "").slice(0, 60)
    : "aggiornamento del giorno";

  const title = `BikerLink — ${titleSuffix}`;
  const tags = ["bikerlink", "daily", "recap"];

  const frontmatter = [
    "---",
    `title: "${title}"`,
    `date: "${date}"`,
    `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`,
    `draft: true`,
    "---",
    "",
  ].join("\n");

  const intro = [
    `# ${title}`,
    "",
    `> Bozza generata automaticamente il ${date}. Revisionare prima della pubblicazione.`,
    "",
  ].join("\n");

  let taskSection = "";
  if (taskLines.length > 0) {
    taskSection = [
      "## Task completati oggi",
      "",
      ...taskLines.map((t) => `- ${t}`),
      "",
    ].join("\n");
  } else {
    taskSection = [
      "## Task completati oggi",
      "",
      "_Nessun task MERGED trovato per questa data._",
      "",
    ].join("\n");
  }

  let chatSection = "";
  if (highlights.length > 0) {
    chatSection = [
      "## Highlights dalla chat",
      "",
      ...highlights.map((h) => `- ${h}`),
      "",
    ].join("\n");
  } else {
    chatSection = [
      "## Highlights dalla chat",
      "",
      "_Nessun highlight estratto dalla chat di oggi._",
      "",
    ].join("\n");
  }

  const closing = [
    "## Note editoriali",
    "",
    "_Aggiungere contesto, foto, link esterni prima di pubblicare._",
    "",
  ].join("\n");

  return frontmatter + intro + taskSection + chatSection + closing;
}

async function main(): Promise<void> {
  const date = todayISO();
  console.log(`[daily-pipeline] avvio pipeline per ${date}`);

  const inboxUrl = process.env.INBOX_URL;
  const inboxToken = process.env.INBOX_TOKEN;
  const inboxSource = process.env.INBOX_SOURCE ?? "bikerlink";

  if (!inboxUrl) {
    console.warn("[daily-pipeline] INBOX_URL non impostata — skip inbox:fetch");
  } else {
    try {
      const tokenFlag = inboxToken ? ` --token "${inboxToken}"` : "";
      run(
        `pnpm --filter @workspace/scripts run inbox:fetch --source "${inboxSource}" --url "${inboxUrl}"${tokenFlag}`
      );
    } catch (err) {
      console.warn("[daily-pipeline] inbox:fetch fallito (endpoint non disponibile?):", (err as Error).message.split("\n")[0]);
      console.warn("[daily-pipeline] la pipeline continua senza dati di chat");
    }
  }

  const clusterOutPath = resolve(INBOX, "clusters-merged-by-day.md");
  try {
    run(
      `pnpm --filter @workspace/scripts run cluster:tasks --state MERGED --by day --out inbox/clusters-merged-by-day.md`
    );
  } catch (err) {
    console.warn("[daily-pipeline] cluster:tasks fallito (possibile mancanza di dati):", (err as Error).message.split("\n")[0]);
  }

  const chatLatest = resolve(INBOX, `${inboxSource}-chat-latest.md`);
  const chatMd = existsSync(chatLatest) ? readFileSync(chatLatest, "utf8") : null;
  const clusterMd = existsSync(clusterOutPath) ? readFileSync(clusterOutPath, "utf8") : null;

  if (!chatMd) console.warn("[daily-pipeline] chat latest non trovata — la bozza avrà sezioni vuote");
  if (!clusterMd) console.warn("[daily-pipeline] cluster file non trovato — la bozza avrà sezioni vuote");

  mkdirSync(DRAFTS, { recursive: true });

  const slug = slugify(`bikerlink-${date}`);
  const draftPath = resolve(DRAFTS, `${date}.md`);
  const draft = buildDraft(date, chatMd, clusterMd);

  writeFileSync(draftPath, draft, "utf8");
  console.log(`[daily-pipeline] bozza scritta: ${draftPath}`);
  console.log(`[daily-pipeline] pipeline completata per ${date}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
