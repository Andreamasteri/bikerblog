#!/usr/bin/env tsx
/**
 * enrich-posts-with-ai — riscrive i post recap usando Claude + la chat di BikerLink.
 *
 * Per ogni giornata dei cluster:
 *   1. Estrae i task (titoli + descrizioni) da clusters-merged-by-day.md
 *   2. Cerca nella chat i passaggi rilevanti (menzioni di #N o parole chiave)
 *   3. Chiama Claude per generare un post narrativo in italiano
 *   4. Aggiorna il DB (upsert su slug)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run enrich:posts
 *   pnpm --filter @workspace/scripts run enrich:posts -- --date 2026-03-12   (solo un giorno)
 *   pnpm --filter @workspace/scripts run enrich:posts -- --dry-run           (stampa senza salvare)
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, postsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const CLUSTERS_FILE = resolve(ROOT, "inbox", "clusters-merged-by-day.md");
const CHAT_FILE = resolve(ROOT, "inbox", "bikerlink-chat-latest.md");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_DATE = args[args.indexOf("--date") + 1] ?? null;

// ── Anthropic ────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy",
});

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface Cluster {
  date: string;
  taskCount: number;
  taskRefs: string[];   // ["#1", "#2", ...]
  taskTitles: string[]; // ["SOS Biker", ...]
  detailsContent: string;
}

// ── Parser cluster ────────────────────────────────────────────────────────────

function parseClusters(md: string): Cluster[] {
  const clusters: Cluster[] = [];
  const sections = md.split(/(?=^## 📅 \d{4}-\d{2}-\d{2})/m).filter((s) =>
    s.startsWith("## 📅")
  );

  for (const section of sections) {
    const header = section.match(/^## 📅 (\d{4}-\d{2}-\d{2}) \((\d+) task\)/);
    if (!header) continue;
    const date = header[1];
    const taskCount = parseInt(header[2], 10);

    const taskRefs: string[] = [];
    const taskTitles: string[] = [];
    for (const line of section.split("\n")) {
      const m = line.match(/^- [✅📋🔄❌❓] \*\*(#\d+)\*\* — (.+)$/);
      if (m) {
        taskRefs.push(m[1]);
        taskTitles.push(m[2].trim());
      }
    }

    const detailsMatch = section.match(
      /<details>[\s\S]*?<summary>Dettaglio task<\/summary>([\s\S]*?)<\/details>/
    );
    const detailsContent = detailsMatch ? detailsMatch[1].trim() : "";

    clusters.push({ date, taskCount, taskRefs, taskTitles, detailsContent });
  }
  return clusters;
}

// ── Estrazione chat rilevante ─────────────────────────────────────────────────

function extractRelevantChat(chatMd: string, cluster: Cluster): string {
  // Dividi per sessioni
  const sessions = chatMd.split(/(?=^## Sessione \d+)/m).filter((s) =>
    s.startsWith("## Sessione")
  );

  const keywords = [
    ...cluster.taskRefs,
    ...cluster.taskTitles.flatMap((t) =>
      t.split(/\s+/).filter((w) => w.length > 5).slice(0, 3)
    ),
  ];

  const relevant: string[] = [];

  for (const session of sessions) {
    const lower = session.toLowerCase();
    const matches = keywords.filter((kw) =>
      lower.includes(kw.toLowerCase())
    );
    if (matches.length >= 1) {
      // Prendi le prime 800 chars della sessione
      const snippet = session.replace(/^## Sessione \d+\n\n?/, "").slice(0, 800).trim();
      if (snippet.length > 50) {
        relevant.push(snippet);
      }
    }
    if (relevant.length >= 8) break; // max 8 snippet
  }

  return relevant.join("\n\n---\n\n");
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(cluster: Cluster, chatSnippets: string): string {
  const taskList = cluster.taskTitles.map((t, i) => `- ${cluster.taskRefs[i]}: ${t}`).join("\n");

  // Pulisci il dettaglio dai blocchi di codice grandi
  const cleanDetails = cluster.detailsContent
    .replace(/```[\s\S]*?```/g, "[codice]")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 3000);

  const chatSection = chatSnippets
    ? `\n\n### Estratti dalla chat di sviluppo\n${chatSnippets.slice(0, 2000)}`
    : "";

  return `Sei il ghostwriter del blog BikerLink, scritto in prima persona da un programmatore italiano appassionato di moto.

Il blog racconta lo sviluppo di **BikerLink** — un'app moto italiana — giorno per giorno, con tono diretto, a tratti ironico, sempre onesto. Ogni post è un diario tecnico: racconta cosa è stato fatto, perché, quali problemi sono emersi, cosa ha funzionato e cosa no.

## Dati del giorno: ${cluster.date}

### Task completati (${cluster.taskCount})
${taskList}

### Descrizioni tecniche
${cleanDetails}${chatSection}

## Istruzioni
Scrivi un post blog in **italiano** di circa **400-500 parole** con questo formato:

1. **Apertura narrativa** (1-2 frasi): cattura l'atmosfera del giorno, non il solito "oggi ho lavorato su..."
2. **Il lavoro vero** (3-5 paragrafi): racconta cosa è stato fatto, in ordine logico. Usa i dettagli tecnici reali, non essere vago. Se dalla chat emergono momenti interessanti (bug, discussioni, decisioni), usali.
3. **Un momento specifico** (1 paragrafo): scegli il task o la conversazione più interessante e approfondiscila.
4. **Chiusura** (1 frase): una nota personale o un pensiero su dove sta andando il progetto.

Regole:
- Scrivi in prima persona singolare ("ho", "sto", "mi")
- Tono: diretto, tecnico ma leggibile, con personalità — non corporate
- NON usare emoji nel testo
- NON iniziare con "Oggi" o "Questa settimana"
- Usa il termine "BikerLink" (non "l'app" o "il progetto" in modo generico)
- Restituisci SOLO il testo del post, senza intestazioni markdown aggiuntive`;
}

// ── Mese italiano ─────────────────────────────────────────────────────────────

const MONTHS_IT = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre",
];
function formatDateIt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_IT[m - 1]} ${y}`;
}

// ── Generazione post ──────────────────────────────────────────────────────────

async function generatePost(cluster: Cluster, chatMd: string): Promise<string> {
  const chatSnippets = extractRelevantChat(chatMd, cluster);
  const prompt = buildPrompt(cluster, chatSnippets);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(CLUSTERS_FILE)) {
    console.error(`[enrich] File cluster non trovato: ${CLUSTERS_FILE}`);
    process.exit(1);
  }

  const clustersMd = readFileSync(CLUSTERS_FILE, "utf8");
  let clusters = parseClusters(clustersMd);

  if (ONLY_DATE) {
    clusters = clusters.filter((c) => c.date === ONLY_DATE);
    if (clusters.length === 0) {
      console.error(`[enrich] Nessun cluster per la data: ${ONLY_DATE}`);
      process.exit(1);
    }
  }

  const chatMd = existsSync(CHAT_FILE)
    ? readFileSync(CHAT_FILE, "utf8")
    : "";

  if (!chatMd) {
    console.warn("[enrich] ⚠ Chat non trovata — genero i post solo dai task");
  } else {
    console.log(`[enrich] Chat caricata — ${chatMd.split("\n").length} righe`);
  }

  console.log(`[enrich] Cluster da processare: ${clusters.length}`);
  if (DRY_RUN) console.log("[enrich] DRY RUN — nessuna scrittura su DB");

  let ok = 0;
  let fail = 0;

  // Processo 2 alla volta per non stressare il rate limit
  for (let i = 0; i < clusters.length; i += 2) {
    const batch = clusters.slice(i, i + 2);
    await Promise.all(
      batch.map(async (cluster) => {
        const slug = `recap-${cluster.date}`;
        try {
          console.log(`[enrich] ▶ ${slug} (${cluster.taskCount} task)...`);
          const content = await generatePost(cluster, chatMd);

          if (!content) {
            console.warn(`[enrich] ⚠ ${slug} — risposta vuota`);
            fail++;
            return;
          }

          const excerpt = content.split("\n").find((l) => l.trim().length > 40)?.slice(0, 200) ?? "";

          if (!DRY_RUN) {
            await db
              .update(postsTable)
              .set({ content, excerpt })
              .where(eq(postsTable.slug, slug));
          } else {
            console.log(`\n--- ${slug} ---\n${content.slice(0, 300)}...\n`);
          }

          console.log(`[enrich] ✓ ${slug}`);
          ok++;
        } catch (err) {
          console.error(`[enrich] ✗ ${slug} —`, err instanceof Error ? err.message : err);
          fail++;
        }
      })
    );

    // Pausa tra batch per rispettare rate limit
    if (i + 2 < clusters.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n[enrich] ✅ fatto — ok: ${ok}, falliti: ${fail}`);
}

try {
  await main();
} finally {
  await pool.end();
}
