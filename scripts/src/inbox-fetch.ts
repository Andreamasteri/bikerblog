#!/usr/bin/env tsx
/**
 * inbox-fetch — pull a chat-export from another Replit project's
 * public endpoint and save it under inbox/ for the agent to read.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run inbox:fetch \
 *     --source bikerlink \
 *     --url https://<repl-domain>/api/_internal/chat-export \
 *     --token <CHAT_EXPORT_TOKEN>
 *
 * Or via env vars:
 *   INBOX_SOURCE=bikerlink \
 *   INBOX_URL=https://... \
 *   INBOX_TOKEN=... \
 *   pnpm --filter @workspace/scripts run inbox:fetch
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Args = { source?: string; url?: string; token?: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.source = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--token") out.token = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const source = cli.source ?? process.env.INBOX_SOURCE ?? "external";
  const url = cli.url ?? process.env.INBOX_URL;
  const token = cli.token ?? process.env.INBOX_TOKEN;

  if (!url) {
    console.error("Missing --url or INBOX_URL");
    process.exit(1);
  }

  const headers: Record<string, string> = { Accept: "text/markdown, text/plain, */*" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  console.log(`[inbox-fetch] GET ${url}`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`[inbox-fetch] HTTP ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  const body = await res.text();
  const inboxDir = resolve(process.cwd(), "inbox");
  mkdirSync(inboxDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const latestPath = resolve(inboxDir, `${source}-chat-latest.md`);
  const stampedPath = resolve(inboxDir, `${source}-chat-${stamp}.md`);

  writeFileSync(latestPath, body, "utf8");
  writeFileSync(stampedPath, body, "utf8");

  console.log(`[inbox-fetch] wrote ${latestPath} (${body.length} bytes)`);
  console.log(`[inbox-fetch] wrote ${stampedPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
