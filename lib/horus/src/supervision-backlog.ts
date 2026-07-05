/**
 * Backlog persistente della supervisione semantica (Task #201, Ares).
 *
 * La ronda notturna di Quebracho (#199, `scripts/src/semantic-supervision.ts`)
 * produce solo un alert effimero su file. Qui invece le stesse anomalie
 * diventano un backlog DURATURO nel DB (`supervision_backlog`), CLASSIFICATO
 * da Horus (dove/cosa/perché), consultabile su richiesta admin e consumato
 * dall'agente heavy on-demand Ares.
 *
 * Confine invariante del progetto: nessuna autocorrezione. Questo modulo
 * conserva/classifica diagnosi; NON applica mai modifiche. Ares (altrove)
 * potrà solo PROPORRE.
 *
 * Sicurezza (coerente con #199, tracing e threat model — Information
 * Disclosure): solo metadata/estratti minimi (id traccia, motivo breve,
 * classificazione sintetica). Mai il dump della conversazione né segreti.
 *
 * DB caricato in modo lazy (come `tracing.ts`) così l'import di
 * `@workspace/horus` non fallisce dove `DATABASE_URL` non è impostata (test).
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  supervisionBacklogTable,
  type SupervisionBacklogRow,
  type SupervisionBacklogStatus,
  type SupervisionBacklogSeverity,
} from "@workspace/db/schema";
import { horusChatRaw, isHorusConfigured } from "./client.js";
import { extractJson } from "./client.js";
import type { HorusMessage } from "./client.js";

/** Anomalia in ingresso dalla ronda di supervisione (#199). */
export interface SupervisionBacklogAnomaly {
  traceId: number;
  agent: string;
  reason: string;
}

let dbModulePromise: Promise<typeof import("@workspace/db")> | null = null;
function loadDb(): Promise<typeof import("@workspace/db")> {
  if (!dbModulePromise) dbModulePromise = import("@workspace/db");
  return dbModulePromise;
}

/** Categorie di classificazione ammesse (allineate ai criteri del giudice #199). */
export const BACKLOG_CATEGORIES = ["pertinenza", "uso_tool", "invenzione", "tono", "altro"] as const;
export type BacklogCategory = (typeof BACKLOG_CATEGORIES)[number];

const VALID_SEVERITIES: SupervisionBacklogSeverity[] = ["low", "medium", "high"];

/**
 * Persiste in modo IDEMPOTENTE le anomalie della ronda nel backlog. Un solo
 * record per `traceId` (unique index): se la stessa traccia è già in backlog
 * non crea duplicati e non resuscita voci già `resolved`/`dismissed`.
 * Non lancia: un fallimento DB non deve far fallire la pipeline notturna.
 */
export async function persistSupervisionAnomalies(
  anomalies: SupervisionBacklogAnomaly[]
): Promise<{ inserted: number; skipped: number }> {
  if (anomalies.length === 0) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  try {
    const { db } = await loadDb();
    for (const a of anomalies) {
      const rows = await db
        .insert(supervisionBacklogTable)
        .values({
          traceId: a.traceId,
          agent: a.agent,
          reason: a.reason,
        })
        .onConflictDoNothing({ target: supervisionBacklogTable.traceId })
        .returning({ id: supervisionBacklogTable.id });
      if (rows.length > 0) inserted++;
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- best-effort, nessun logger di route qui
    console.warn(
      "[supervision-backlog] persist fallita:",
      err instanceof Error ? err.message : err
    );
    return { inserted, skipped: anomalies.length - inserted };
  }
  return { inserted, skipped: anomalies.length - inserted };
}

const CLASSIFY_SYSTEM_PROMPT =
  "Sei Horus e classifichi problemi rilevati dalla ronda di supervisione su un blog di moto " +
  "(BikerBlog). Per ciascun problema (id + agente coinvolto + motivo grezzo) assegna: " +
  "(1) category, UNA tra: pertinenza, uso_tool, invenzione, tono, altro; " +
  "(2) classification, una frase sintetica in italiano che dica DOVE/COSA/PERCHÉ (max ~200 caratteri); " +
  "(3) severity, UNA tra: low, medium, high. " +
  "Rispondi SOLO con un oggetto JSON, nessun testo fuori dal JSON, in questo formato esatto: " +
  '{"items": [{"id": <id intero>, "category": "<categoria>", "classification": "<frase>", "severity": "<severità>"}]}.';

function coerceCategory(value: unknown): BacklogCategory {
  return typeof value === "string" && (BACKLOG_CATEGORIES as readonly string[]).includes(value)
    ? (value as BacklogCategory)
    : "altro";
}

function coerceSeverity(value: unknown): SupervisionBacklogSeverity {
  return typeof value === "string" && (VALID_SEVERITIES as string[]).includes(value)
    ? (value as SupervisionBacklogSeverity)
    : "medium";
}

interface ClassifyResponse {
  items?: Array<{ id?: unknown; category?: unknown; classification?: unknown; severity?: unknown }>;
}

/**
 * Fa classificare da Horus le voci di backlog ancora non classificate
 * (`category IS NULL`), in un solo turno di inferenza batch (job leggero).
 * Best-effort: se Horus non è configurato/raggiungibile o il verdetto non è
 * interpretabile, le voci restano non classificate (verranno riprovate alla
 * ronda successiva) e la funzione non lancia.
 */
export async function classifyOpenBacklogWithHorus(): Promise<{
  classified: number;
  detail: string;
}> {
  if (!isHorusConfigured()) {
    return { classified: 0, detail: "Horus non configurato — classificazione saltata" };
  }

  let pending: SupervisionBacklogRow[];
  try {
    const { db } = await loadDb();
    pending = await db
      .select()
      .from(supervisionBacklogTable)
      .where(and(eq(supervisionBacklogTable.status, "open"), isNull(supervisionBacklogTable.category)))
      .orderBy(desc(supervisionBacklogTable.createdAt))
      .limit(20);
  } catch (err) {
    return {
      classified: 0,
      detail: `lettura backlog fallita: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pending.length === 0) return { classified: 0, detail: "nessuna voce da classificare" };

  const listing = pending
    .map((r) => `- id=${r.id} agente=${r.agent} motivo: ${r.reason}`)
    .join("\n");
  const messages: HorusMessage[] = [
    { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
    { role: "user", content: `Classifica questi ${pending.length} problemi:\n\n${listing}` },
  ];

  let raw: string;
  try {
    const result = await horusChatRaw(messages, { skipMemory: true });
    raw = result.content;
  } catch (err) {
    return {
      classified: 0,
      detail: `Horus non raggiungibile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: ClassifyResponse;
  try {
    parsed = JSON.parse(extractJson(raw)) as ClassifyResponse;
  } catch (err) {
    return {
      classified: 0,
      detail: `verdetto di Horus non interpretabile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const byId = new Map(pending.map((r) => [r.id, r]));
  let classified = 0;
  try {
    const { db } = await loadDb();
    for (const item of items) {
      const id = typeof item.id === "number" ? item.id : Number(item.id);
      if (!byId.has(id)) continue; // id inventato dal modello → scartato
      const classification =
        typeof item.classification === "string" && item.classification.trim()
          ? item.classification.trim().slice(0, 400)
          : "classificazione non specificata";
      await db
        .update(supervisionBacklogTable)
        .set({
          category: coerceCategory(item.category),
          classification,
          severity: coerceSeverity(item.severity),
          updatedAt: new Date(),
        })
        .where(eq(supervisionBacklogTable.id, id));
      classified++;
    }
  } catch (err) {
    return {
      classified,
      detail: `scrittura classificazione fallita dopo ${classified}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { classified, detail: `${classified}/${pending.length} voci classificate` };
}

/** Opzioni di lettura del backlog (admin/tool). */
export interface ListBacklogOptions {
  status?: SupervisionBacklogStatus;
  limit?: number;
}

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

/** Legge le voci del backlog (per l'endpoint admin e il tool Horus). */
export async function listSupervisionBacklog(
  options: ListBacklogOptions = {}
): Promise<SupervisionBacklogRow[]> {
  const { db } = await loadDb();
  const limit = Math.min(Math.max(1, options.limit ?? LIST_DEFAULT_LIMIT), LIST_MAX_LIMIT);
  const base = db.select().from(supervisionBacklogTable);
  const query = options.status
    ? base.where(eq(supervisionBacklogTable.status, options.status))
    : base;
  return query.orderBy(desc(supervisionBacklogTable.createdAt)).limit(limit);
}

/** Legge una singola voce del backlog per id (per l'orchestrazione di Ares). */
export async function getSupervisionBacklogItem(
  id: number
): Promise<SupervisionBacklogRow | null> {
  const { db } = await loadDb();
  const rows = await db
    .select()
    .from(supervisionBacklogTable)
    .where(eq(supervisionBacklogTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Conta le voci in stato "open" (per riepiloghi rapidi). */
export async function countOpenBacklog(): Promise<number> {
  const { db } = await loadDb();
  const rows = await db
    .select({ id: supervisionBacklogTable.id })
    .from(supervisionBacklogTable)
    .where(eq(supervisionBacklogTable.status, "open"));
  return rows.length;
}

/**
 * Fa avanzare lo stato di una voce del backlog. `resolvedAt` viene valorizzato
 * quando si passa a `resolved`/`dismissed`, azzerato se si torna indietro.
 * Ritorna la riga aggiornata (o null se l'id non esiste).
 */
export async function updateBacklogStatus(
  id: number,
  status: SupervisionBacklogStatus,
  aresNotes?: string | null
): Promise<SupervisionBacklogRow | null> {
  const { db } = await loadDb();
  const isTerminal = status === "resolved" || status === "dismissed";
  const rows = await db
    .update(supervisionBacklogTable)
    .set({
      status,
      resolvedAt: isTerminal ? new Date() : null,
      ...(aresNotes !== undefined ? { aresNotes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(supervisionBacklogTable.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Salva le note di Ares su una voce (proposte, mai modifiche applicate). */
export async function setAresNotes(
  id: number,
  aresNotes: string
): Promise<SupervisionBacklogRow | null> {
  const { db } = await loadDb();
  const rows = await db
    .update(supervisionBacklogTable)
    .set({ aresNotes, updatedAt: new Date() })
    .where(eq(supervisionBacklogTable.id, id))
    .returning();
  return rows[0] ?? null;
}
