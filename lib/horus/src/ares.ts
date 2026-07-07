/**
 * Ares — agente HEAVY on-demand (Task #201, "POWER mode").
 *
 * Ares NON è residente in VRAM come gli altri quattro (Horus/Bowie/Quebracho/
 * Nadir): è il coltellino svizzero pesante che si carica SOLO su richiesta
 * admin, gira il modello grosso (`devstral` 24B via env `ARES_OLLAMA_MODEL`) e
 * poi si scarica ripristinando la lineup economy. Sequenza di un ciclo:
 *
 *   1. lock a ciclo singolo (un solo Ares alla volta);
 *   2. snapshot dei modelli residenti (`GET /api/ps`);
 *   3. eviction dell'intera lineup (unload di ciascun modello);
 *   4. carica Ares e analizza UNA voce del backlog di supervisione, usando i
 *      tool READ-ONLY condivisi con Horus, e PROPONE ~2 percorsi di
 *      risoluzione (mai applica modifiche, mai installa nulla);
 *   5. unload di Ares;
 *   6. ripristino della lineup (warmup dei modelli dello snapshot), SEMPRE
 *      tentato anche in caso di errore (blocco `finally`);
 *   7. health check post-run; in caso di fallimento l'errore è restituito al
 *      chiamante (endpoint admin) e loggato — mai un fallimento silenzioso.
 *
 * Invariante di progetto: "Ares propone, l'admin decide". Nessuna
 * autocorrezione, nessuna auto-install. Il trigger è admin-only (endpoint
 * `/_internal/*`, bearer derivato da `SESSION_SECRET`).
 *
 * Sicurezza (threat model — Elevation of Privilege / DoS): il ciclo è pesante e
 * sfratta gli agenti residenti, quindi NON è esposto come tool di chat pubblico
 * né come rotta anonima; solo chi ha il token interno può avviarlo, e il lock a
 * ciclo singolo impedisce avvii concorrenti che saturerebbero la GPU.
 */

import { createOllamaAgentClient, type HorusMessage, type OllamaAgentHealth } from "./client.js";
import { getHorusTools, executeHorusTool, capToolResult } from "./tools.js";
import {
  getSupervisionBacklogItem,
  setAresNotes,
  updateBacklogStatus,
} from "./supervision-backlog.js";

export const ARES_AGENT_NAME = "Ares";

/**
 * Client di Ares. Come Bowie/Quebracho riusa di default il tunnel/credenziali
 * di Horus, salvo env dedicate:
 *   ARES_OLLAMA_MODEL            — richiesto per abilitarlo (es. "devstral:24b")
 *   ARES_OLLAMA_URL              — opzionale, default HORUS_OLLAMA_URL
 *   ARES_CF_ACCESS_CLIENT_ID     — opzionale, default CF_ACCESS_CLIENT_ID
 *   ARES_CF_ACCESS_CLIENT_SECRET — opzionale, default CF_ACCESS_CLIENT_SECRET
 * Ares gira su GPU (è il modello pesante): NON forceCpu. Entra in VRAM solo
 * dopo che la lineup residente è stata sfrattata (vedi orchestrazione sotto).
 */
const aresClient = createOllamaAgentClient({
  agentName: ARES_AGENT_NAME,
  ollamaUrl: process.env.ARES_OLLAMA_URL || process.env.HORUS_OLLAMA_URL,
  cfAccessClientId: process.env.ARES_CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID,
  cfAccessClientSecret:
    process.env.ARES_CF_ACCESS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET,
  model: process.env.ARES_OLLAMA_MODEL ?? "",
  useHorusMemoryByDefault: false,
});

/** True se Ares è configurato (ARES_OLLAMA_MODEL impostato e un URL disponibile). */
export function isAresConfigured(): boolean {
  return aresClient.isConfigured();
}

/** Controllo di raggiungibilità leggero per Ares (stesso schema degli altri agenti). */
export function checkAresHealth(): Promise<OllamaAgentHealth> {
  return aresClient.checkHealth();
}

/** Nome del modello Ares (per messaggi/health), vuoto se non configurato. */
export function aresModel(): string {
  return process.env.ARES_OLLAMA_MODEL ?? "";
}

// ── Primitive di gestione modelli Ollama (snapshot/unload/warmup) ────────────
// Non esistevano in questo repo: nessun agente aveva mai bisogno di sfrattare
// gli altri. Sono chiamate dirette a /api/ps e /api/generate sullo stesso
// endpoint/credenziali CF Access di Ares.

interface AresNetwork {
  url: string;
  headers: Record<string, string>;
}

/** Costruisce URL + header CF Access per le chiamate admin a Ollama, o null se non configurato. */
function aresNetwork(): AresNetwork | null {
  const url = process.env.ARES_OLLAMA_URL || process.env.HORUS_OLLAMA_URL;
  if (!url) return null;
  const id = process.env.ARES_CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.ARES_CF_ACCESS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (id && secret) {
    headers["CF-Access-Client-Id"] = id;
    headers["CF-Access-Client-Secret"] = secret;
  }
  return { url: url.replace(/\/$/, ""), headers };
}

const OLLAMA_ADMIN_TIMEOUT_MS = 60_000;

async function ollamaFetch(
  net: AresNetwork,
  path: string,
  body: Record<string, unknown> | null,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_ADMIN_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(`${net.url}${path}`, {
      method: body === null ? "GET" : "POST",
      headers: net.headers,
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Modelli attualmente residenti (`GET /api/ps`). È la base dello snapshot: si
 * ripristina esattamente ciò che c'era, senza codificare la lineup a mano.
 */
export async function listResidentModels(signal?: AbortSignal): Promise<string[]> {
  const net = aresNetwork();
  if (!net) throw new Error("Ares non configurato: manca ARES_OLLAMA_URL/HORUS_OLLAMA_URL");
  const res = await ollamaFetch(net, "/api/ps", null, signal);
  if (!res.ok) throw new Error(`GET /api/ps ha risposto ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
  const names = (data.models ?? [])
    .map((m) => m.name || m.model || "")
    .filter((n): n is string => n.length > 0);
  return Array.from(new Set(names));
}

/** Scarica un modello dalla VRAM (`keep_alive: 0`). Best-effort: ritorna true/false. */
export async function unloadModel(model: string, signal?: AbortSignal): Promise<boolean> {
  const net = aresNetwork();
  if (!net) return false;
  try {
    const res = await ollamaFetch(net, "/api/generate", { model, keep_alive: 0 }, signal);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ricarica un modello e lo tiene residente a tempo indeterminato
 * (`keep_alive: -1`, numero — vedi nota in HorusChatOptions). Best-effort: i
 * modelli di embedding (es. all-minilm) possono rifiutare /api/generate; in tal
 * caso si ripiega su /api/embeddings così Nadir torna comunque residente.
 */
export async function warmupModel(model: string, signal?: AbortSignal): Promise<boolean> {
  const net = aresNetwork();
  if (!net) return false;
  try {
    const res = await ollamaFetch(net, "/api/generate", { model, keep_alive: -1 }, signal);
    if (res.ok) return true;
  } catch {
    /* passa al fallback embeddings */
  }
  try {
    const res = await ollamaFetch(
      net,
      "/api/embeddings",
      { model, input: "", keep_alive: -1 },
      signal
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Lock a ciclo singolo ─────────────────────────────────────────────────────
// Un solo ciclo Ares alla volta (evita di sfrattare la lineup due volte in
// parallelo e saturare la GPU). Lock in-process con timestamp: se un ciclo va
// in crash lasciando il lock alzato, scade dopo ARES_LOCK_TTL_MS e un nuovo
// trigger può ripartire. api-server è un singolo processo, quindi in-memory
// basta; il TTL copre il caso del processo che riparte tra un ciclo e l'altro.

const ARES_LOCK_TTL_MS = 20 * 60_000; // 20 minuti: tetto largo per un ciclo heavy
let aresRunningSince: number | null = null;

/** True se un ciclo Ares è attualmente in corso (lock non scaduto). */
export function isAresRunning(): boolean {
  return aresRunningSince !== null && Date.now() - aresRunningSince < ARES_LOCK_TTL_MS;
}

// ── Analisi propose-only ─────────────────────────────────────────────────────

const ARES_MAX_TOOL_ITERATIONS = 8;
const ARES_KEEP_ALIVE = "15m"; // Ares resta caricato per la durata del ciclo, poi unload esplicito

/**
 * Allowlist READ-ONLY dei tool concessi ad Ares. È un'allowlist esplicita (non
 * una denylist) per far rispettare l'invariante "Ares propone, l'admin decide"
 * a livello di CAPACITÀ e non solo di prompt: qualsiasi tool che scrive/muta
 * stato (`remember_note`, `save_file`, `write_pdf`, ...) o un tool aggiunto in
 * futuro NON è raggiungibile da Ares finché non è aggiunto qui deliberatamente.
 * Restano solo tool di lettura/analisi utili a diagnosticare le anomalie del
 * backlog di supervisione. La capability-gating di `getHorusTools()` (es.
 * sonar_scan visibile solo se il servizio TC è raggiungibile) resta rispettata:
 * filtriamo il set che essa restituisce.
 */
const ARES_READONLY_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  "web_search",
  "github_read",
  "read_blog",
  "typecheck_repo",
  "lint_repo",
  "search_code",
  "git_log",
  "sonar_scan",
  "search_manual",
  "read_file",
  "list_files",
  "read_pdf",
  "check_vram_usage",
]);

const ARES_SYSTEM_PROMPT = [
  "Sei Ares, l'agente di analisi pesante di BikerBlog (un blog di moto).",
  "Ti attivi SOLO su richiesta e per un problema alla volta, preso dal backlog di",
  "supervisione (anomalie rilevate dalla ronda notturna e classificate da Horus).",
  "",
  "REGOLA ASSOLUTA — 'Ares propone, l'admin decide':",
  "- NON applichi mai modifiche, NON scrivi file, NON installi nulla, NON esegui comandi",
  "  che cambiano lo stato del sistema. Solo diagnosi e PROPOSTE.",
  "- Se pensi servirebbe un nuovo tool o una nuova dipendenza, PROPONILO a parole:",
  "  non tentare di installarlo o usarlo.",
  "",
  "Hai a disposizione tool READ-ONLY (ricerca nel codice, typecheck, lint, git log,",
  "lettura del blog pubblicato, ricerca web/manuali). Usali per capire la causa reale",
  "del problema prima di proporre soluzioni. Non inventare: se un tool non conferma",
  "un'ipotesi, dillo.",
  "",
  "Al termine produci una risposta in ITALIANO così strutturata:",
  "1. Diagnosi: causa probabile del problema, con le evidenze raccolte dai tool.",
  "2. Percorsi di risoluzione: proponi TIPICAMENTE DUE percorsi alternativi (A e B),",
  "   per ciascuno: cosa comporta, pro/contro, rischio, e sforzo indicativo.",
  "3. Raccomandazione: quale percorso suggerisci e perché — ma la decisione resta",
  "   all'admin.",
  "Sii conciso e concreto. Niente codice applicato, solo proposte.",
].join("\n");

/** Esito di un ciclo Ares completo. */
export interface AresAnalysisResult {
  ok: boolean;
  backlogId: number;
  /** Proposta testuale di Ares (salvata anche in aresNotes), se prodotta. */
  proposal?: string;
  /** Modelli sfrattati e poi ripristinati. */
  snapshot: string[];
  /** Modelli il cui warmup di ripristino è fallito (lineup da controllare). */
  restoreFailures: string[];
  /** Messaggio d'errore se il ciclo è fallito prima di produrre la proposta. */
  error?: string;
}

/**
 * Esegue il tool loop di analisi di Ares su un problema già formattato.
 * Bounded a ARES_MAX_TOOL_ITERATIONS. Ritorna il testo finale della proposta.
 * Estratto come funzione a sé per poter essere testato in isolamento.
 */
async function runAresToolLoop(problem: string, signal?: AbortSignal): Promise<string> {
  // Solo i tool dell'allowlist read-only: nessun tool che muta stato può
  // finire nel loop di Ares, a prescindere da cosa restituisce getHorusTools().
  const tools = (await getHorusTools()).filter((t) =>
    ARES_READONLY_TOOL_ALLOWLIST.has(t.function.name)
  );
  const history: HorusMessage[] = [
    { role: "system", content: ARES_SYSTEM_PROMPT },
    { role: "user", content: problem },
  ];

  let finalText = "";
  for (let i = 0; i < ARES_MAX_TOOL_ITERATIONS && !signal?.aborted; i++) {
    const { content, toolCalls } = await aresClient.chatRaw(history, {
      tools,
      keepAlive: ARES_KEEP_ALIVE,
      skipMemory: true,
      signal,
    });
    if (!toolCalls || toolCalls.length === 0) {
      finalText = content;
      break;
    }
    history.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const toolName = call.function.name;
      let result: string;
      try {
        result = await executeHorusTool(toolName, call.function.arguments, signal);
      } catch (err) {
        result = `Errore nell'esecuzione del tool ${toolName}: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
      history.push({ role: "tool", name: toolName, content: capToolResult(result) });
    }
  }

  if (!finalText.trim()) {
    // Ha esaurito le iterazioni continuando a chiamare tool: chiediamo la sintesi
    // finale senza tool, così il ciclo produce comunque una proposta.
    history.push({
      role: "user",
      content:
        "Hai raccolto abbastanza informazioni. Ora scrivi la proposta finale (diagnosi + due percorsi + raccomandazione), senza usare altri tool.",
    });
    const { content } = await aresClient.chatRaw(history, {
      keepAlive: ARES_KEEP_ALIVE,
      skipMemory: true,
      signal,
    });
    finalText = content;
  }

  return finalText.trim();
}

function formatProblem(item: {
  id: number;
  traceId: number;
  agent: string;
  reason: string;
  category: string | null;
  classification: string | null;
  severity: string | null;
}): string {
  return [
    `Problema da analizzare (voce di backlog #${item.id}, traccia LLM #${item.traceId}):`,
    `- Agente coinvolto: ${item.agent}`,
    `- Motivo grezzo (dal giudice): ${item.reason}`,
    item.category ? `- Categoria (Horus): ${item.category}` : null,
    item.classification ? `- Classificazione (Horus): ${item.classification}` : null,
    item.severity ? `- Severità: ${item.severity}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ciclo Ares completo su UNA voce del backlog. Admin-only (il chiamante è
 * l'endpoint interno). Sfratta la lineup residente, carica Ares, analizza,
 * scarica Ares, ripristina la lineup (sempre, anche in errore).
 *
 * Non lancia: ritorna sempre un `AresAnalysisResult`; gli errori sono nel
 * campo `error` così l'endpoint può loggarli e mostrarli all'admin (nessun
 * fallimento silenzioso).
 */
export async function runAresAnalysis(
  backlogId: number,
  options: { signal?: AbortSignal } = {}
): Promise<AresAnalysisResult> {
  const { signal } = options;
  const base: AresAnalysisResult = {
    ok: false,
    backlogId,
    snapshot: [],
    restoreFailures: [],
  };

  if (!isAresConfigured()) {
    return { ...base, error: "Ares non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)" };
  }
  // Acquisizione del lock ATOMICA: il check e il set devono stare insieme senza
  // alcun `await` in mezzo, altrimenti due trigger concorrenti potrebbero
  // passare entrambi il check prima che uno alzi il lock e finire per sfrattare
  // la lineup due volte. Da qui in poi ogni return passa dal `finally` che
  // rilascia il lock.
  if (isAresRunning()) {
    return { ...base, error: "Un ciclo Ares è già in corso — riprova quando ha finito" };
  }
  aresRunningSince = Date.now();

  let snapshot: string[] = [];
  const restoreFailures: string[] = [];
  const model = aresModel();
  // Diventa true solo quando stiamo per toccare la GPU: se usciamo prima (voce
  // inesistente/chiusa, lettura fallita) NON eseguiamo unload/restore.
  let touchedGpu = false;

  try {
    // Carica la voce PRIMA di toccare la GPU: se non esiste, non sfrattiamo nulla.
    let item;
    try {
      item = await getSupervisionBacklogItem(backlogId);
    } catch (err) {
      return {
        ...base,
        error: `lettura backlog fallita: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!item) return { ...base, error: `voce di backlog #${backlogId} non trovata` };
    if (item.status === "resolved" || item.status === "dismissed") {
      return { ...base, error: `voce #${backlogId} già chiusa (status=${item.status})` };
    }

    // 1. snapshot dei residenti (esclude Ares stesso, per sicurezza)
    touchedGpu = true;
    snapshot = (await listResidentModels(signal)).filter((m) => m !== model);

    // 2. eviction lineup
    for (const m of snapshot) {
      await unloadModel(m, signal);
    }

    // 3. analisi (carica Ares implicitamente alla prima chatRaw)
    const proposal = await runAresToolLoop(formatProblem(item), signal);

    // 4. persiste la proposta e fa avanzare lo stato a in_review (Ares ha preso
    //    in carico; la chiusura resta una decisione admin)
    await setAresNotes(backlogId, proposal);
    if (item.status === "open") {
      await updateBacklogStatus(backlogId, "in_review");
    }

    return { ok: true, backlogId, proposal, snapshot, restoreFailures };
  } catch (err) {
    return {
      ...base,
      snapshot,
      restoreFailures,
      error: `ciclo Ares fallito: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (touchedGpu) {
      // 5. unload Ares — sempre, così non resta lui a occupare la VRAM al posto
      //    della lineup economy.
      await unloadModel(model);
      // 6. ripristino lineup — sempre tentato, anche se l'analisi è fallita.
      for (const m of snapshot) {
        const ok = await warmupModel(m);
        if (!ok) restoreFailures.push(m);
      }
      // 7. health check post-run: verifica che i modelli dello snapshot siano
      //    effettivamente residenti dopo il warmup. warmupModel restituisce true
      //    se la chiamata HTTP ha avuto successo, ma non garantisce che il modello
      //    sia già caricato in VRAM (Ollama carica in background). Un secondo
      //    GET /api/ps conferma la residenza effettiva; i modelli mancanti vengono
      //    aggiunti a restoreFailures così il chiamante non riceve mai un "ok"
      //    silenzioso con la lineup parzialmente assente.
      try {
        const nowResident = await listResidentModels();
        for (const m of snapshot) {
          if (!nowResident.includes(m) && !restoreFailures.includes(m)) {
            restoreFailures.push(m);
          }
        }
      } catch {
        // /api/ps irraggiungibile: impossibile verificare — segnala come
        // failure generica di restore piuttosto che silenziare l'errore.
        restoreFailures.push("__health_check_failed__");
      }
    }
    aresRunningSince = null;
  }
}
