#!/usr/bin/env tsx
/**
 * generate-daily-diary — genera un post blog per ogni giorno dal 12 mar al 23 mag 2026.
 *
 * Fase 1 — Segmentazione chat:
 *   Divide le 785 sessioni di chat in 73 blocchi giornalieri.
 *   Base: proporzione lineare (785 ÷ 73 ≈ 10-11 sessioni/giorno).
 *   Aggiustamento: per ogni sessione viene rilevato il "content date" cercando
 *   menzioni di task ref (#N) — il task ref viene risolto nel suo giorno di
 *   creazione (da tasks-meta.json). Se una sessione è ancorata a una data,
 *   il confine del giorno viene spostato di ±max 5 posizioni per allinearlo.
 *   La mappa risultante (non-overlapping) viene salvata in
 *   inbox/bikerlink-chat-day-map.json.
 *
 * Fase 2 — Generazione post:
 *   Per ogni giorno: se ci sono task cluster → prompt con task + chat;
 *   altrimenti → prompt solo chat. Upsert in DB con slug `diary-YYYY-MM-DD`.
 *
 * Fase 3 — Verifica:
 *   Al termine, verifica che tutti i 73 slug siano presenti e non vuoti.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run diary:generate
 *   pnpm --filter @workspace/scripts run diary:generate -- --date 2026-03-22
 *   pnpm --filter @workspace/scripts run diary:generate -- --dry-run
 *   pnpm --filter @workspace/scripts run diary:generate -- --force
 *   pnpm --filter @workspace/scripts run diary:generate -- --map-only
 *     (genera solo la mappa, senza scrivere post)
 *
 * ATTENZIONE: qualsiasi feature non richiesta potrebbe risultare in una telefonata a John Connor.
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, postsTable, authorsTable } from "@workspace/db";
import { eq, like, inArray } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const CLUSTERS_FILE  = resolve(ROOT, "inbox", "clusters-by-day.md");
const CHAT_FILE      = resolve(ROOT, "inbox", "bikerlink-chat-latest.md");
const TASKS_META     = resolve(ROOT, "inbox", "bikerlink-history", "tasks-meta.json");
const DAY_MAP_FILE   = resolve(ROOT, "inbox", "bikerlink-chat-day-map.json");

const DATE_START = "2026-03-12";

/** Historical end of the BikerLink development period */
const DATE_END_BASE  = "2026-05-23";

/** Maximum keyword-matched (globally-relevant) sessions for task days */
const MAX_RELEVANT_SESSIONS   = 8;
/** Maximum proportional-slice (contextual background) sessions for task days */
const MAX_CONTEXTUAL_SESSIONS = 5;
/** Maximum sessions to pass to Claude per day (non-task days / legacy cap) */
const MAX_SESSIONS_PER_DAY = 13;
/** Maximum boundary shift (in sessions) for content-signal adjustment */
const MAX_BOUNDARY_SHIFT   = 5;

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const FORCE    = args.includes("--force");
const MAP_ONLY = args.includes("--map-only");
const ONLY_DATE = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
/** Process only dates >= FROM (inclusive, YYYY-MM-DD) */
const FROM_DATE = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
/** Process only dates <= TO (inclusive, YYYY-MM-DD) */
const TO_DATE   = args.includes("--to")   ? args[args.indexOf("--to")   + 1] : null;

/**
 * Effective end date: if a single --date is requested beyond the historical
 * range, extend the range to include it so cron use for ongoing days works.
 */
const DATE_END = ONLY_DATE && ONLY_DATE > DATE_END_BASE ? ONLY_DATE : DATE_END_BASE;

// ── Anthropic ─────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy",
});

// ── Utils ─────────────────────────────────────────────────────────────────────

const MONTHS_IT = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre",
];

function formatDateIt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_IT[m - 1]} ${y}`;
}

function getAllDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T12:00:00Z");
  const fin = new Date(end   + "T12:00:00Z");
  while (cur <= fin) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const COVER_BY_DOW = [
  "https://images.unsplash.com/photo-1568772585407-9f217076d0bb?w=1600&q=80",
  "https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=1600&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80",
  "https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=1600&q=80",
  "https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=1600&q=80",
  "https://images.unsplash.com/photo-1505209498127-5efee99bbd5e?w=1600&q=80",
  "https://images.unsplash.com/photo-1526948531399-320e7e40f0ca?w=1600&q=80",
];
function pickCover(isoDate: string): string {
  return COVER_BY_DOW[new Date(isoDate).getDay()] ?? COVER_BY_DOW[0];
}

// ── Tipi ──────────────────────────────────────────────────────────────────────

interface Cluster {
  date:          string;
  taskCount:     number;
  taskRefs:      string[];
  taskTitles:    string[];
  detailsContent: string;
}

/** Persisted day→session mapping artifact */
interface DayMapEntry {
  /** Inclusive 0-based index into the sessions array */
  sessionStart: number;
  /** Exclusive 0-based index into the sessions array */
  sessionEnd:   number;
  sessionCount: number;
  /** How many positions the boundary was shifted by content signals */
  boundaryShiftApplied: number;
  contentAnchors: string[]; // dates detected via task-ref signals
}
type DayMap = Record<string, DayMapEntry>;

// ── Task-ref → date lookup ────────────────────────────────────────────────────

function buildTaskRefDateMap(tasksMetaPath: string): Map<number, string> {
  const result = new Map<number, string>();
  if (!existsSync(tasksMetaPath)) return result;
  try {
    const raw: { taskRef?: string; createdAt?: string }[] = JSON.parse(
      readFileSync(tasksMetaPath, "utf8")
    );
    for (const t of raw) {
      const m = t.taskRef?.match(/^#(\d+)$/);
      if (m && t.createdAt) {
        result.set(parseInt(m[1], 10), t.createdAt.slice(0, 10));
      }
    }
  } catch {
    // ignore parse errors
  }
  return result;
}

// ── Parser cluster ────────────────────────────────────────────────────────────

function parseClusters(md: string): Map<string, Cluster> {
  const map = new Map<string, Cluster>();
  const sections = md.split(/(?=^## 📅 \d{4}-\d{2}-\d{2})/m).filter((s) =>
    s.startsWith("## 📅")
  );
  for (const section of sections) {
    const header = section.match(/^## 📅 (\d{4}-\d{2}-\d{2}) \((\d+) task\)/);
    if (!header) continue;
    const date      = header[1];
    const taskCount = parseInt(header[2], 10);

    const taskRefs: string[] = [];
    const taskTitles: string[] = [];
    for (const line of section.split("\n")) {
      const m = line.match(/^- [✅📋🔄❌❓] \*\*(#\d+)\*\* — (.+)$/);
      if (m) { taskRefs.push(m[1]); taskTitles.push(m[2].trim()); }
    }
    const detailsMatch = section.match(
      /<details>[\s\S]*?<summary>Dettaglio task<\/summary>([\s\S]*?)<\/details>/
    );
    map.set(date, {
      date, taskCount, taskRefs, taskTitles,
      detailsContent: detailsMatch ? detailsMatch[1].trim() : "",
    });
  }
  return map;
}

// ── Parser sessioni chat ──────────────────────────────────────────────────────

function parseChatSessions(chatMd: string): string[] {
  const parts = chatMd.split(/(?=^## Sessione \d)/m);
  // Include ALL sessions from the chat — do not drop any based on length.
  // Even very short sessions are kept so the day partition covers the full corpus.
  return parts
    .filter((p) => p.startsWith("## Sessione"))
    .map((p) => p.replace(/^## Sessione \d+\n\n?/, "").trim());
}

// ── Content-signal detection ──────────────────────────────────────────────────

/**
 * Detects the most likely date for a session using task-ref mentions.
 * Returns the modal date across all #N mentions found, or null if ambiguous.
 */
function detectSessionContentDate(
  sessionBody: string,
  taskRefDateMap: Map<number, string>
): string | null {
  const refs = sessionBody.match(/#(\d+)/g) ?? [];
  if (refs.length === 0) return null;

  const dateCounts = new Map<string, number>();
  for (const ref of refs) {
    const num  = parseInt(ref.slice(1), 10);
    const date = taskRefDateMap.get(num);
    if (date) dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
  }
  if (dateCounts.size === 0) return null;

  // Return date with highest count (if it has > 50% of votes = clear signal)
  let best = "", bestCount = 0, total = 0;
  for (const [d, c] of dateCounts) {
    total += c;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return bestCount / total >= 0.5 ? best : null;
}

// ── Day-map builder ───────────────────────────────────────────────────────────

/**
 * Builds a non-overlapping, contiguous mapping from dates to session index ranges.
 *
 * Algorithm:
 *  1. Proportional baseline: boundary[i] = floor(i * total / totalDays)
 *  2. Content-signal adjustment: for each boundary between day[i] and day[i+1],
 *     look at sessions near the boundary for content anchors. If the dominant
 *     anchor suggests the boundary should shift left or right, move it by up to
 *     MAX_BOUNDARY_SHIFT positions (clamped to preserve monotonicity).
 *  3. Emit DayMapEntry for each date with final start/end indices.
 */
function buildDayMap(
  allDates: string[],
  sessions: string[],
  taskRefDateMap: Map<number, string>
): DayMap {
  const D = allDates.length;
  const N = sessions.length;

  // Step 1: proportional baseline boundaries (D+1 values, boundaries[i] = start of day i)
  const boundaries = Array.from({ length: D + 1 }, (_, i) =>
    Math.floor((i * N) / D)
  );

  // Step 2: pre-compute content anchors for all sessions in one pass
  const sessionAnchor: (string | null)[] = sessions.map((s) =>
    detectSessionContentDate(s, taskRefDateMap)
  );

  // Step 3: adjust each internal boundary
  for (let b = 1; b < D; b++) {
    const leftDate  = allDates[b - 1];  // day to the left of this boundary
    const rightDate = allDates[b];       // day to the right
    const cur       = boundaries[b];     // current boundary position

    // Look at sessions in window [cur - MAX_BOUNDARY_SHIFT, cur + MAX_BOUNDARY_SHIFT)
    const winStart = Math.max(boundaries[b - 1] + 1, cur - MAX_BOUNDARY_SHIFT);
    const winEnd   = Math.min(boundaries[b + 1] - 1, cur + MAX_BOUNDARY_SHIFT);

    let shiftLeft = 0, shiftRight = 0;
    for (let s = winStart; s <= winEnd; s++) {
      const anchor = sessionAnchor[s];
      if (!anchor) continue;
      if (anchor === leftDate)  shiftLeft++;
      if (anchor === rightDate) shiftRight++;
    }

    let shift = 0;
    if (shiftLeft !== shiftRight) {
      // Positive shift = move boundary right (give more sessions to leftDate)
      // Negative shift = move boundary left (give more sessions to rightDate)
      const rawShift = shiftLeft > shiftRight
        ? Math.min(shiftLeft,  MAX_BOUNDARY_SHIFT)
        : -Math.min(shiftRight, MAX_BOUNDARY_SHIFT);

      const candidate = cur + rawShift;
      // Clamp: must keep at least 1 session per day on both sides
      const minB = boundaries[b - 1] + 1;
      const maxB = boundaries[b + 1] - 1;
      const clamped = Math.max(minB, Math.min(maxB, candidate));
      shift = clamped - cur;
      boundaries[b] = clamped;
    }
  }

  // Step 4: build final map
  const dayMap: DayMap = {};
  for (let i = 0; i < D; i++) {
    const start = boundaries[i];
    const end   = boundaries[i + 1]; // exclusive
    const anchorsInRange = sessionAnchor
      .slice(start, end)
      .filter((a): a is string => a !== null);
    const uniqueAnchors = [...new Set(anchorsInRange)];

    dayMap[allDates[i]] = {
      sessionStart:          start,
      sessionEnd:            end,
      sessionCount:          end - start,
      boundaryShiftApplied:  boundaries[i] - Math.floor((i * N) / D),
      contentAnchors:        uniqueAnchors,
    };
  }
  return dayMap;
}

// ── Semantic session selection ────────────────────────────────────────────────

interface SelectedSessions {
  /** Globally keyword-matched sessions — directly mention the day's task refs or title words */
  relevant:   string[];
  /** Proportional-slice sessions from the day map — provide temporal background context */
  contextual: string[];
}

/**
 * For days WITH task clusters: selects sessions by semantic relevance.
 *   1. Build keywords: task refs (#N) + significant words from task titles (len > 4, max 3/title)
 *   2. Score every session in the full corpus by keyword hit count
 *   3. Take the top MAX_RELEVANT_SESSIONS as "relevant"
 *   4. Take up to MAX_CONTEXTUAL_SESSIONS from the proportional day-map slice
 *      that are NOT already in the relevant set, as temporal background
 *
 * For days WITHOUT task clusters: falls back to the proportional slice only
 * (returned as contextual, relevant is empty).
 */
function selectSessionsForDay(
  cluster:      Cluster | undefined,
  sessions:     string[],
  dayMapEntry:  DayMapEntry,
): SelectedSessions {
  // Non-task days: proportional slice only
  if (!cluster) {
    return {
      relevant:   [],
      contextual: sessions
        .slice(dayMapEntry.sessionStart, dayMapEntry.sessionEnd)
        .slice(0, MAX_SESSIONS_PER_DAY),
    };
  }

  // Build keyword list (same strategy as enrich-posts-with-ai.ts)
  const keywords: string[] = [
    ...cluster.taskRefs, // "#123", "#45", …
    ...cluster.taskTitles.flatMap((title) =>
      title.split(/\s+/).filter((w) => w.length > 4).slice(0, 3)
    ),
  ];

  // Score each session in the FULL corpus
  const scored: { idx: number; score: number }[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const lower = sessions[i].toLowerCase();
    const score = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (score > 0) scored.push({ idx: i, score });
  }
  // Sort descending by relevance score, then ascending by position (stable tiebreak)
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const relevantIdxSet = new Set(
    scored.slice(0, MAX_RELEVANT_SESSIONS).map((s) => s.idx)
  );
  // Re-order relevant sessions chronologically
  const relevantIdxs = [...relevantIdxSet].sort((a, b) => a - b);
  const relevant = relevantIdxs.map((i) => sessions[i]);

  // Contextual: from proportional day-map slice, skip those already in relevant
  const contextual: string[] = [];
  for (
    let i = dayMapEntry.sessionStart;
    i < dayMapEntry.sessionEnd && contextual.length < MAX_CONTEXTUAL_SESSIONS;
    i++
  ) {
    if (!relevantIdxSet.has(i)) contextual.push(sessions[i]);
  }

  return { relevant, contextual };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const PERSONA = `Sei il ghostwriter del blog BikerLink, scritto in prima persona da un programmatore italiano appassionato di moto.

Il blog racconta lo sviluppo di **BikerLink** — un'app moto italiana — giorno per giorno, con tono diaristico: diretto, tecnico ma leggibile, a tratti ironico, sempre onesto. Ogni post racconta cosa è stato costruito quel giorno, i problemi incontrati, le decisioni prese, i momenti interessanti.`;

function buildPromptWithTasks(
  date: string,
  cluster: Cluster,
  relevant:   string[],
  contextual: string[],
): string {
  const taskList = cluster.taskTitles
    .map((t, i) => `- ${cluster.taskRefs[i]}: ${t}`)
    .join("\n");

  const cleanDetails = cluster.detailsContent
    .replace(/```[\s\S]*?```/g, "[codice]")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 2800);

  let chatSection = "";

  if (relevant.length > 0) {
    chatSection +=
      `\n\n### Sessioni rilevanti ai task (${relevant.length} — trovate per keyword matching)\n` +
      relevant
        .slice(0, 8)
        .map((s, i) => `\n**[R${i + 1}]** ${s.slice(0, 600)}`)
        .join("\n\n")
        .slice(0, 3200);
  }

  if (contextual.length > 0) {
    chatSection +=
      `\n\n### Sessioni di contesto (${contextual.length} — segmento proporzionale del giorno)\n` +
      contextual
        .slice(0, 5)
        .map((s, i) => `\n**[C${i + 1}]** ${s.slice(0, 400)}`)
        .join("\n\n")
        .slice(0, 1500);
  }

  return `${PERSONA}

## Dati del giorno: ${date} (${formatDateIt(date)})

### Task completati/aperti (${cluster.taskCount})
${taskList}

### Descrizioni tecniche dei task
${cleanDetails}${chatSection}

## Istruzioni
Scrivi un post blog in **italiano** di circa **450-550 parole** con questo formato:

1. **Apertura narrativa** (1-2 frasi): cattura l'atmosfera del giorno senza iniziare con "Oggi" o "Questa settimana"
2. **Il lavoro vero** (3-5 paragrafi): cosa è stato fatto, in ordine logico. Usa i dettagli tecnici reali dei task. Se dalle sessioni rilevanti emergono momenti interessanti (bug, decisioni, discussioni), usali — preferisci quelle [R*] ai generici contesti [C*].
3. **Un momento specifico** (1 paragrafo): il task o la conversazione più interessante, approfondita
4. **Chiusura** (1 frase): una nota personale su dove sta andando il progetto

Regole:
- Prima persona singolare ("ho", "sto", "mi")
- Tono: diretto, tecnico ma leggibile, con personalità — non corporate
- NON usare emoji nel testo
- Usa "BikerLink" (non "l'app" genericamente)
- Restituisci SOLO il testo del post, senza intestazioni markdown aggiuntive`;
}

function buildPromptChatOnly(date: string, sessions: string[]): string {
  const snippetsText = sessions
    .slice(0, 12)
    .map((s, i) => `\n**[Scambio ${i + 1}]**\n${s.slice(0, 650)}`)
    .join("\n\n")
    .slice(0, 4000);

  return `${PERSONA}

## Giorno: ${date} (${formatDateIt(date)})

Non ci sono task formali registrati per questo giorno. Di seguito sono riportati gli scambi della chat di sviluppo.

### Estratti dalla chat di sviluppo (${sessions.length} scambi)
${snippetsText}

## Istruzioni
Analizza gli scambi della chat e scrivi un post blog in **italiano** di circa **400-500 parole** che racconta cosa stava succedendo quel giorno nello sviluppo di BikerLink.

La chat contiene code snippets, commenti dell'agente, richieste dell'utente. Da questo materiale deduci:
- Quale funzionalità o problema era al centro del lavoro
- Quali decisioni tecniche emergono dagli scambi
- Qual era lo stato dell'app in quel momento

Formato:
1. **Apertura narrativa** (1-2 frasi): cattura il momento senza iniziare con "Oggi" o "Questa settimana"
2. **Il lavoro del giorno** (3-4 paragrafi): cosa stava succedendo, basato sugli estratti di chat
3. **Un dettaglio** (1 paragrafo): qualcosa di specifico emerso dagli scambi
4. **Chiusura** (1 frase): dove sta andando il progetto

Regole:
- Prima persona singolare ("ho", "sto", "mi")
- Tono diaristico, diretto, con personalità — non corporate
- NON inventare fatti non presenti nella chat
- NON usare emoji nel testo
- Usa "BikerLink" (non "l'app" genericamente)
- Se la chat è scarna, scrivi un post breve e onesto su quello che riesci a dedurre
- Restituisci SOLO il testo del post, senza intestazioni markdown aggiuntive`;
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function generatePost(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 8192,
    messages:   [{ role: "user", content: prompt }],
  });
  const block = message.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getFirstAuthorId(): Promise<number> {
  const author = await db.query.authorsTable.findFirst({
    columns:  { id: true },
    orderBy: (t, { asc }) => [asc(t.id)],
  });
  if (!author) throw new Error("[diary] Nessun autore nel DB");
  return author.id;
}

async function getExistingSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await db
    .select({ slug: postsTable.slug })
    .from(postsTable)
    .where(inArray(postsTable.slug, slugs));
  return new Set(rows.map((r) => r.slug));
}

// ── Day-map consistency assertions ───────────────────────────────────────────

function assertDayMapConsistency(
  dayMap: DayMap,
  allDates: string[],
  totalSessions: number
): void {
  const errors: string[] = [];

  // 1. All expected dates are in the map
  for (const d of allDates) {
    if (!dayMap[d]) errors.push(`Date missing from map: ${d}`);
  }

  // 2. First entry starts at 0
  const firstEntry = dayMap[allDates[0]];
  if (firstEntry && firstEntry.sessionStart !== 0) {
    errors.push(`First day sessionStart is ${firstEntry.sessionStart}, expected 0`);
  }

  // 3. Last entry ends at totalSessions
  const lastEntry = dayMap[allDates[allDates.length - 1]];
  if (lastEntry && lastEntry.sessionEnd !== totalSessions) {
    errors.push(
      `Last day sessionEnd is ${lastEntry.sessionEnd}, expected ${totalSessions}`
    );
  }

  // 4. Entries are strictly contiguous (no gaps, no overlaps)
  for (let i = 0; i < allDates.length - 1; i++) {
    const a = dayMap[allDates[i]];
    const b = dayMap[allDates[i + 1]];
    if (a && b && a.sessionEnd !== b.sessionStart) {
      errors.push(
        `Gap/overlap between ${allDates[i]} (end=${a.sessionEnd}) and ${allDates[i + 1]} (start=${b.sessionStart})`
      );
    }
  }

  // 5. Sum of sessionCounts equals totalSessions
  const total = Object.values(dayMap).reduce((s, e) => s + e.sessionCount, 0);
  if (total !== totalSessions) {
    errors.push(`Sum of sessionCounts (${total}) ≠ total sessions (${totalSessions})`);
  }

  if (errors.length > 0) {
    console.error("[diary] ❌ Day-map consistency FAILED:");
    for (const e of errors) console.error(`       ${e}`);
    throw new Error(`Day-map consistency check failed (${errors.length} errors)`);
  }

  console.log(
    `[diary] ✅ Day-map OK — ${allDates.length} dates, ${totalSessions} sessions, contiguous, non-overlapping`
  );
}

// ── Verify ────────────────────────────────────────────────────────────────────

const MIN_POST_LENGTH = 200; // minimum chars to consider a post non-empty

async function verifyAllDays(allDates: string[]): Promise<boolean> {
  const slugs = allDates.map((d) => `diary-${d}`);

  // Fetch slug + content length for all recap posts
  const rows = await db
    .select({ slug: postsTable.slug, contentLen: postsTable.content })
    .from(postsTable)
    .where(inArray(postsTable.slug, slugs));

  const foundMap = new Map(rows.map((r) => [r.slug, r.contentLen.length]));

  const missing  = slugs.filter((s) => !foundMap.has(s));
  const tooShort = slugs.filter(
    (s) => foundMap.has(s) && (foundMap.get(s) ?? 0) < MIN_POST_LENGTH
  );

  let ok = true;

  if (missing.length > 0) {
    console.error(`[diary] ❌ Verifica FALLITA — ${missing.length} slug mancanti:`);
    for (const m of missing) console.error(`       ${m}`);
    ok = false;
  }

  if (tooShort.length > 0) {
    console.error(
      `[diary] ❌ Verifica FALLITA — ${tooShort.length} post troppo corti (< ${MIN_POST_LENGTH} chars):`
    );
    for (const s of tooShort) console.error(`       ${s} (${foundMap.get(s)} chars)`);
    ok = false;
  }

  if (ok) {
    console.log(
      `[diary] ✅ Verifica OK — tutti i ${allDates.length} giorni hanno un post non vuoto`
    );
  }
  return ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const allDates = getAllDates(DATE_START, DATE_END);

  if (ONLY_DATE && !allDates.includes(ONLY_DATE)) {
    console.error(`[diary] Data non nel range ${DATE_START}–${DATE_END}: ${ONLY_DATE}`);
    process.exit(1);
  }

  console.log(`[diary] Range: ${DATE_START} → ${DATE_END} (${allDates.length} giorni)`);
  if (DRY_RUN)  console.log("[diary] DRY RUN — nessuna scrittura su DB");
  if (FORCE)    console.log("[diary] FORCE — riscrive anche i post già esistenti");
  if (MAP_ONLY) console.log("[diary] MAP ONLY — genera solo la mappa sessioni");

  // 1. Parse clusters
  const clustersMd = existsSync(CLUSTERS_FILE)
    ? readFileSync(CLUSTERS_FILE, "utf8") : "";
  const clusterMap = parseClusters(clustersMd);
  console.log(`[diary] Cluster caricati: ${clusterMap.size} giorni con task`);

  // 2. Parse sessions
  const chatMd    = existsSync(CHAT_FILE) ? readFileSync(CHAT_FILE, "utf8") : "";
  const sessions  = parseChatSessions(chatMd);
  console.log(`[diary] Sessioni chat: ${sessions.length}`);

  // 3. Task-ref → date lookup
  const taskRefDateMap = buildTaskRefDateMap(TASKS_META);
  console.log(`[diary] Task-ref lookup: ${taskRefDateMap.size} entries`);

  // 4. Build and persist day map
  const dayMap = buildDayMap(allDates, sessions, taskRefDateMap);
  if (!DRY_RUN) {
    writeFileSync(DAY_MAP_FILE, JSON.stringify(dayMap, null, 2), "utf8");
    console.log(`[diary] Mappa scritta: ${DAY_MAP_FILE}`);
  }

  // Report segmentation stats
  const shifted = Object.values(dayMap).filter(e => e.boundaryShiftApplied !== 0).length;
  const anchored = Object.values(dayMap).filter(e => e.contentAnchors.length > 0).length;
  console.log(`[diary] Segmentazione: ${shifted} confini aggiustati per segnali, ${anchored} giorni con anchor da task-ref`);

  // Hard consistency assertion — fail fast if partition is broken
  assertDayMapConsistency(dayMap, allDates, sessions.length);

  if (MAP_ONLY) return;

  // 5. Determine which dates to process
  let targetDates = ONLY_DATE ? [ONLY_DATE] : allDates;
  if (FROM_DATE) targetDates = targetDates.filter((d) => d >= FROM_DATE);
  if (TO_DATE)   targetDates = targetDates.filter((d) => d <= TO_DATE);
  const allSlugs    = allDates.map((d) => `diary-${d}`);
  const existingSlugs = FORCE ? new Set<string>() : await getExistingSlugs(allSlugs);
  const toProcess   = targetDates.filter((d) => !existingSlugs.has(`diary-${d}`));

  if (!FORCE && existingSlugs.size > 0) {
    console.log(`[diary] Post già presenti: ${existingSlugs.size} (saltati; usa --force per riscrivere)`);
  }
  console.log(`[diary] Post da generare: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log("[diary] Niente da fare.");
    if (!ONLY_DATE) await verifyAllDays(allDates);
    return;
  }

  const authorId = await getFirstAuthorId();
  let ok = 0, fail = 0;

  // 6. Generate posts 2 at a time
  for (let i = 0; i < toProcess.length; i += 2) {
    const batch = toProcess.slice(i, i + 2);

    await Promise.all(batch.map(async (date) => {
      const slug    = `diary-${date}`;
      const entry   = dayMap[date];
      const cluster = clusterMap.get(date);

      const { relevant, contextual } = selectSessionsForDay(cluster, sessions, entry);

      const prompt = cluster
        ? buildPromptWithTasks(date, cluster, relevant, contextual)
        : buildPromptChatOnly(date, contextual);

      const kind = cluster
        ? `${cluster.taskCount} task, ${relevant.length} sess rilevanti + ${contextual.length} contesto`
        : `solo chat, ${contextual.length} sess`;
      console.log(`[diary] ▶ ${slug} (${kind})`);

      try {
        const content = await generatePost(prompt);
        if (!content) {
          console.warn(`[diary] ⚠ ${slug} — risposta vuota`);
          fail++;
          return;
        }

        const excerpt = content.split("\n").find((l) => l.trim().length > 40)?.slice(0, 220) ?? "";
        const title   = cluster
          ? `${formatDateIt(date)} — ${cluster.taskTitles[0] ?? "Giornata di sviluppo"}`
          : `${formatDateIt(date)} — Giornata di sviluppo`;
        const readingMinutes  = Math.max(2, Math.ceil(content.split(/\s+/).length / 200));
        const coverImageUrl   = pickCover(date);

        if (!DRY_RUN) {
          await db
            .insert(postsTable)
            .values({
              slug, title, excerpt, content, coverImageUrl,
              category:       "Diario",
              tags:           ["diario", "bikerlink", "daily"],
              authorId,
              publishedAt:    new Date(`${date}T23:30:00+02:00`),
              readingMinutes,
              featured:       0,
            })
            .onConflictDoUpdate({
              target: postsTable.slug,
              // Clear audioUrl so the post gets re-narrated after a rewrite
              set:    { title, excerpt, content, coverImageUrl, readingMinutes,
                        tags: ["diario", "bikerlink", "daily"], category: "Diario",
                        audioUrl: null },
            });
          console.log(`[diary] ✓ ${slug}`);
        } else {
          console.log(`\n--- ${slug} (${kind}) ---\n${content.slice(0, 380)}...\n`);
          ok++;
          return;
        }

        ok++;
      } catch (err) {
        console.error(`[diary] ✗ ${slug} —`, err instanceof Error ? err.message : String(err));
        fail++;
      }
    }));

    if (i + 2 < toProcess.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  console.log(`\n[diary] ✅ done — ok: ${ok}, falliti: ${fail}`);

  // 7. Final verification (full run only)
  if (!ONLY_DATE && !DRY_RUN) {
    await verifyAllDays(allDates);
  }
}

try {
  await main();
} finally {
  await pool.end();
}
