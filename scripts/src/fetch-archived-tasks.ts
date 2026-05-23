#!/usr/bin/env tsx
/**
 * fetch-archived-tasks — recupera i task archiviati da BikerLink e li salva
 * in inbox/bikerlink-archived-tasks.json, pronti per la generazione di post.
 *
 * Modalità remote (default):
 *   pnpm --filter @workspace/scripts run fetch:archived-tasks \
 *     --url https://<bikerlink-domain>/api/admin/archived-tasks \
 *     --token <ARCHIVED_TASKS_TOKEN>
 *
 * Oppure tramite env vars:
 *   ARCHIVED_TASKS_URL=https://... \
 *   ARCHIVED_TASKS_TOKEN=... \
 *   pnpm --filter @workspace/scripts run fetch:archived-tasks
 *
 * Modalità locale (usa l'export già presente in inbox/bikerlink-history/):
 *   pnpm --filter @workspace/scripts run fetch:archived-tasks --local
 *
 * L'endpoint BikerLink previsto:
 *   GET /api/admin/archived-tasks?page=<n>&pageSize=<n>
 *   Authorization: Bearer <token>
 *   → { tasks: ArchivedTask[], total: number, page: number, pageSize: number }
 *
 * Struttura ArchivedTask attesa:
 *   { taskRef, title, state, createdAt, updatedAt, description }
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

interface PagedResponse {
  tasks: ArchivedTask[];
  total: number;
  page: number;
  pageSize: number;
}

type Args = {
  url?: string;
  token?: string;
  local?: boolean;
  localFile?: string;
  pageSize?: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--local") out.local = true;
    else if (a === "--local-file") out.localFile = argv[++i];
    else if (a === "--page-size") out.pageSize = parseInt(argv[++i], 10);
  }
  return out;
}

async function fetchPage(
  url: string,
  token: string | undefined,
  page: number,
  pageSize: number
): Promise<PagedResponse> {
  const pageUrl = `${url}?page=${page}&pageSize=${pageSize}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  console.log(`[fetch-archived-tasks] GET ${pageUrl}`);
  const res = await fetch(pageUrl, { headers });

  if (!res.ok) {
    const body = await res.text();
    console.error(
      `[fetch-archived-tasks] HTTP ${res.status} ${res.statusText}`
    );
    console.error(body.slice(0, 500));
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as unknown;

  if (Array.isArray(json)) {
    return {
      tasks: json as ArchivedTask[],
      total: (json as ArchivedTask[]).length,
      page,
      pageSize,
    };
  }

  return json as PagedResponse;
}

async function fetchAllRemote(
  url: string,
  token: string | undefined,
  pageSize: number
): Promise<ArchivedTask[]> {
  const all: ArchivedTask[] = [];
  let page = 1;

  const first = await fetchPage(url, token, page, pageSize);
  all.push(...first.tasks);

  const total = first.total ?? first.tasks.length;
  const pages = Math.ceil(total / pageSize);

  console.log(
    `[fetch-archived-tasks] total=${total}, pages=${pages}, pageSize=${pageSize}`
  );

  while (page < pages) {
    page++;
    const next = await fetchPage(url, token, page, pageSize);
    all.push(...next.tasks);
    console.log(`[fetch-archived-tasks] fetched page ${page}/${pages} (${all.length}/${total})`);
  }

  return all;
}

function loadLocal(localFile: string): ArchivedTask[] {
  console.log(`[fetch-archived-tasks] loading local file: ${localFile}`);
  const raw = readFileSync(localFile, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Local file is not a JSON array");
  }
  return parsed as ArchivedTask[];
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  const useLocal = cli.local ?? false;
  const url = cli.url ?? process.env.ARCHIVED_TASKS_URL;
  const token = cli.token ?? process.env.ARCHIVED_TASKS_TOKEN;
  const pageSize = cli.pageSize ?? 100;

  const root = resolve(process.cwd(), "..");
  const inboxDir = resolve(root, "inbox");
  mkdirSync(inboxDir, { recursive: true });

  const outPath = resolve(inboxDir, "bikerlink-archived-tasks.json");

  let tasks: ArchivedTask[];

  if (useLocal) {
    const localFile =
      cli.localFile ??
      resolve(root, "inbox", "bikerlink-history", "tasks-meta.json");
    tasks = loadLocal(localFile);
  } else {
    if (!url) {
      console.error(
        "Missing --url or ARCHIVED_TASKS_URL.\n" +
          "Use --local to import from inbox/bikerlink-history/tasks-meta.json instead."
      );
      process.exit(1);
    }
    tasks = await fetchAllRemote(url, token, pageSize);
  }

  tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const meta = {
    fetchedAt: new Date().toISOString(),
    source: useLocal ? "local:inbox/bikerlink-history/tasks-meta.json" : url,
    total: tasks.length,
    byState: tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.state] = (acc[t.state] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const out = { meta, tasks };
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`[fetch-archived-tasks] wrote ${outPath}`);
  console.log(`  total: ${meta.total}`);
  console.log(`  by state: ${JSON.stringify(meta.byState)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
