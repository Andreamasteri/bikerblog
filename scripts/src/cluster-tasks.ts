#!/usr/bin/env tsx
/**
 * cluster-tasks — raggruppa i task archiviati di BikerLink per giornata o
 * settimana e genera un file markdown pronto per la revisione editoriale.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run cluster:tasks
 *   pnpm --filter @workspace/scripts run cluster:tasks --by week
 *   pnpm --filter @workspace/scripts run cluster:tasks --state MERGED
 *   pnpm --filter @workspace/scripts run cluster:tasks \
 *     --input inbox/bikerlink-history/tasks-meta.json \
 *     --by day --state MERGED --out inbox/clusters-merged-by-day.md
 *
 * Il file di output contiene cluster ordinati cronologicamente.
 * Ogni cluster è un candidato naturale per un post del blog.
 * Il filtro editoriale (scegliere quali cluster diventano post) resta umano.
 *
 * Input accettato:
 *   - inbox/bikerlink-archived-tasks.json  (output di fetch-archived-tasks)
 *   - inbox/bikerlink-history/tasks-meta.json  (export grezzo, array piatto)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ArchivedTask {
  taskRef: string;
  title: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  description: string;
}

type GroupBy = "day" | "week";

type Args = {
  input?: string;
  out?: string;
  by?: GroupBy;
  state?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--by") out.by = argv[++i] as GroupBy;
    else if (a === "--state") out.state = argv[++i];
  }
  return out;
}

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

function isoWeek(iso: string): string {
  const d = new Date(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function groupKey(task: ArchivedTask, by: GroupBy): string {
  return by === "week" ? isoWeek(task.createdAt) : isoDate(task.createdAt);
}

function stateEmoji(state: string): string {
  switch (state) {
    case "MERGED":
      return "✅";
    case "PROPOSED":
      return "📋";
    case "IN_PROGRESS":
      return "🔄";
    case "CANCELLED":
      return "❌";
    default:
      return "❓";
  }
}

function renderCluster(
  key: string,
  tasks: ArchivedTask[],
  by: GroupBy
): string {
  const label = by === "week" ? `Settimana ${key}` : key;
  const taskList = tasks
    .map((t) => `- ${stateEmoji(t.state)} **${t.taskRef}** — ${t.title}`)
    .join("\n");

  const details = tasks
    .map((t) => {
      const descPreview = t.description
        ? t.description.split("\n").slice(0, 6).join("\n").trim() + "\n\n_(…)_"
        : "_nessuna descrizione_";
      return `### ${stateEmoji(t.state)} ${t.taskRef} — ${t.title}\n\n_Creato: ${isoDate(t.createdAt)} · Aggiornato: ${isoDate(t.updatedAt)} · Stato: ${t.state}_\n\n${descPreview}`;
    })
    .join("\n\n---\n\n");

  return [
    `## 📅 ${label} (${tasks.length} task)`,
    "",
    taskList,
    "",
    "<details>",
    `<summary>Dettaglio task</summary>`,
    "",
    details,
    "",
    "</details>",
  ].join("\n");
}

function loadTasks(inputPath: string): ArchivedTask[] {
  const raw = readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as ArchivedTask[];
  }

  const wrapped = parsed as { tasks?: ArchivedTask[] };
  if (wrapped.tasks && Array.isArray(wrapped.tasks)) {
    return wrapped.tasks;
  }

  throw new Error(
    `Cannot parse tasks from ${inputPath}. Expected array or {tasks: [...]} object.`
  );
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));

  const root = resolve(process.cwd(), "..");
  const defaultInput = resolve(root, "inbox", "bikerlink-archived-tasks.json");
  const fallbackInput = resolve(
    root,
    "inbox",
    "bikerlink-history",
    "tasks-meta.json"
  );

  let inputPath = cli.input ? resolve(root, cli.input) : defaultInput;

  try {
    readFileSync(inputPath);
  } catch {
    if (!cli.input) {
      console.warn(
        `[cluster-tasks] ${inputPath} not found, falling back to ${fallbackInput}`
      );
      inputPath = fallbackInput;
    } else {
      console.error(`[cluster-tasks] Input file not found: ${inputPath}`);
      process.exit(1);
    }
  }

  const by: GroupBy = cli.by === "week" ? "week" : "day";
  const filterState = cli.state?.toUpperCase();

  let tasks = loadTasks(inputPath);

  if (filterState) {
    tasks = tasks.filter((t) => t.state === filterState);
  }

  tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const groups = new Map<string, ArchivedTask[]>();
  for (const task of tasks) {
    const key = groupKey(task, by);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const stateLabel = filterState ? ` · filtro: ${filterState}` : "";
  const header = [
    `# Cluster task BikerLink — per ${by === "week" ? "settimana" : "giornata"}${stateLabel}`,
    "",
    `> **${tasks.length} task** in **${groups.size} cluster**`,
    `> Generato il: ${new Date().toISOString()}`,
    `> Sorgente: ${inputPath}`,
    "",
    "Ogni sezione rappresenta un cluster candidato per un post del blog.",
    "Seleziona i cluster più significativi e scrivi il post con l'agente.",
    "",
    "---",
    "",
  ].join("\n");

  const body = [...groups.entries()]
    .map(([key, ts]) => renderCluster(key, ts, by))
    .join("\n\n---\n\n");

  const outName =
    cli.out ??
    `inbox/clusters-${filterState ? filterState.toLowerCase() + "-" : ""}by-${by}.md`;
  const outPath = resolve(root, outName);
  mkdirSync(resolve(outPath, ".."), { recursive: true });

  writeFileSync(outPath, header + body, "utf8");

  console.log(`[cluster-tasks] wrote ${outPath}`);
  console.log(`  tasks: ${tasks.length}, clusters: ${groups.size}, by: ${by}`);
  if (filterState) console.log(`  state filter: ${filterState}`);
}

main();
