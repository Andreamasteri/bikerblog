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
import { isChatActive, chatIdleMs } from "./chat-activity.js";

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

/**
 * Messaggio d'errore restituito quando il lock a ciclo singolo è già preso.
 * Esportato come costante così i chiamanti (es. l'endpoint admin) possono
 * distinguere il conflitto di concorrenza in modo deterministico (match esatto)
 * invece di cercare una sottostringa fragile nel testo.
 */
export const ARES_BUSY_MESSAGE = "Un ciclo Ares è già in corso — riprova quando ha finito";

/** True se un ciclo Ares è attualmente in corso (lock non scaduto). */
export function isAresRunning(): boolean {
  return aresRunningSince !== null && Date.now() - aresRunningSince < ARES_LOCK_TTL_MS;
}

// ── Analisi propose-only ─────────────────────────────────────────────────────

const ARES_MAX_TOOL_ITERATIONS = 8;
const ARES_KEEP_ALIVE = "15m"; // Ares resta caricato per la durata del ciclo, poi unload esplicito

/**
 * Sentinel aggiunto a `restoreFailures` quando il ripristino della lineup non
 * completa entro `restoreTimeoutMs` (rollback temporizzato del coder, Task
 * #222). Il chiamante lo riconosce per loggare/alertare "timeout di ripristino"
 * invece di trattarlo come un modello specifico non ripristinato.
 */
export const RESTORE_TIMEOUT_SENTINEL = "__restore_timeout__";

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
async function runAresToolLoop(
  problem: string,
  signal?: AbortSignal,
  systemPrompt: string = ARES_SYSTEM_PROMPT,
  timeoutMs?: number
): Promise<string> {
  // Solo i tool dell'allowlist read-only: nessun tool che muta stato può
  // finire nel loop di Ares, a prescindere da cosa restituisce getHorusTools().
  const tools = (await getHorusTools()).filter((t) =>
    ARES_READONLY_TOOL_ALLOWLIST.has(t.function.name)
  );
  const history: HorusMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: problem },
  ];

  let finalText = "";
  for (let i = 0; i < ARES_MAX_TOOL_ITERATIONS && !signal?.aborted; i++) {
    const { content, toolCalls } = await aresClient.chatRaw(history, {
      tools,
      keepAlive: ARES_KEEP_ALIVE,
      skipMemory: true,
      signal,
      timeoutMs,
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
        "Hai raccolto abbastanza informazioni. Ora scrivi la risposta finale strutturata come richiesto dalle istruzioni di sistema, senza usare altri tool.",
    });
    const { content } = await aresClient.chatRaw(history, {
      keepAlive: ARES_KEEP_ALIVE,
      skipMemory: true,
      signal,
      timeoutMs,
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

/** Esito grezzo dell'orchestrazione GPU condivisa dai cicli Ares. */
interface AresCycleOutcome<T> {
  ok: boolean;
  /** Valore prodotto dal `work` se il ciclo è andato a buon fine. */
  value?: T;
  /** Modelli sfrattati e poi ripristinati. */
  snapshot: string[];
  /** Modelli il cui warmup di ripristino è fallito (lineup da controllare). */
  restoreFailures: string[];
  /** Messaggio d'errore se il ciclo è fallito. */
  error?: string;
}

/**
 * Orchestrazione GPU condivisa da TUTTI i cicli Ares (analisi backlog,
 * task-review, ...). Gestisce gli invarianti che devono valere identici per
 * ogni modalità:
 *   - lock a ciclo singolo con acquisizione ATOMICA (nessun `await` tra il
 *     check `isAresRunning()` e il set del lock, altrimenti due trigger
 *     concorrenti sfratterebbero la lineup due volte);
 *   - `preflight` opzionale PRIMA di toccare la GPU: se ritorna una stringa
 *     d'errore il ciclo aborta SENZA eviction (usato per validare l'input, es.
 *     voce di backlog inesistente / task plan vuoto);
 *   - snapshot dei residenti (`GET /api/ps`, escluso Ares) → eviction;
 *   - esecuzione di `work` con Ares caricato;
 *   - `finally`: unload di Ares + ripristino della lineup + health check,
 *     SEMPRE, anche in errore; lock rilasciato in ogni caso.
 *
 * Non lancia: ritorna sempre un `AresCycleOutcome`; gli errori sono nel campo
 * `error` così il chiamante può loggarli e mostrarli all'admin (nessun
 * fallimento silenzioso). `restoreFailures` è lo STESSO array referenziato
 * nell'outcome e mutato nel `finally`, così il chiamante vede l'esito reale del
 * ripristino anche quando `work` è già ritornato.
 */
async function runAresGpuCycle<T>(
  work: (signal: AbortSignal | undefined) => Promise<T>,
  options: {
    signal?: AbortSignal;
    preflight?: (signal: AbortSignal | undefined) => Promise<string | null>;
    /**
     * Se impostato, il ripristino della lineup nel `finally` è vincolato a
     * questo timeout (ms): se non completa in tempo, il sentinel
     * `RESTORE_TIMEOUT_SENTINEL` viene aggiunto a `restoreFailures` così il
     * chiamante può loggare/alertare l'evento (Task #222 — rollback
     * temporizzato del coder). Non impostato = comportamento invariato (Ares),
     * nessun bound sul ripristino.
     */
    restoreTimeoutMs?: number;
  } = {}
): Promise<AresCycleOutcome<T>> {
  const { signal, preflight, restoreTimeoutMs } = options;
  const restoreFailures: string[] = [];

  if (!isAresConfigured()) {
    return {
      ok: false,
      snapshot: [],
      restoreFailures,
      error: "Ares non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)",
    };
  }
  // Lock ATOMICO: check + set senza alcun `await` in mezzo. Da qui in poi ogni
  // return passa dal `finally` che rilascia il lock.
  if (isAresRunning()) {
    return { ok: false, snapshot: [], restoreFailures, error: ARES_BUSY_MESSAGE };
  }
  aresRunningSince = Date.now();

  let snapshot: string[] = [];
  const model = aresModel();
  // Diventa true solo quando stiamo per toccare la GPU: se usciamo prima
  // (preflight fallito) NON eseguiamo unload/restore.
  let touchedGpu = false;

  try {
    // Validazione dell'input PRIMA di toccare la GPU: se fallisce non sfrattiamo
    // nulla. L'errore torna così com'è (senza prefisso "ciclo Ares fallito").
    if (preflight) {
      const preErr = await preflight(signal);
      if (preErr) return { ok: false, snapshot: [], restoreFailures, error: preErr };
    }

    // 1. snapshot dei residenti (esclude Ares stesso, per sicurezza)
    touchedGpu = true;
    snapshot = (await listResidentModels(signal)).filter((m) => m !== model);

    // 2. eviction lineup
    for (const m of snapshot) {
      await unloadModel(m, signal);
    }

    // 3. lavoro effettivo (carica Ares implicitamente alla prima chatRaw)
    const value = await work(signal);

    return { ok: true, value, snapshot, restoreFailures };
  } catch (err) {
    return {
      ok: false,
      snapshot,
      restoreFailures,
      error: `ciclo Ares fallito: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    // Quando il ripristino va in timeout resta in corso in background: in quel
    // caso NON rilasciamo subito il lock a ciclo singolo, ma lo teniamo alzato
    // finché il restore non si conclude davvero, così un secondo trigger heavy
    // non può correre in parallelo mentre unload/warmup stanno ancora mutando la
    // residenza dei modelli. Il TTL del lock (ARES_LOCK_TTL_MS) resta la rete di
    // sicurezza se il restore in background non finisse mai.
    let deferredRestore: Promise<void> | null = null;
    if (touchedGpu) {
      // Sequenza di ripristino (unload Ares + warmup lineup + health check).
      // Estratta in una funzione per poterla vincolare a un timeout quando
      // richiesto (rollback temporizzato del coder, Task #222). Muta
      // `restoreFailures` (array condiviso con l'outcome già restituito).
      const doRestore = async (): Promise<void> => {
        // 4. unload Ares — sempre, così non resta lui a occupare la VRAM al
        //    posto della lineup economy.
        await unloadModel(model);
        // 5. ripristino lineup — sempre tentato, anche se il lavoro è fallito.
        for (const m of snapshot) {
          const ok = await warmupModel(m);
          if (!ok) restoreFailures.push(m);
        }
        // 6. health check post-run: verifica che i modelli dello snapshot siano
        //    effettivamente residenti dopo il warmup. warmupModel restituisce
        //    true se la chiamata HTTP ha avuto successo, ma non garantisce che il
        //    modello sia già caricato in VRAM (Ollama carica in background). Un
        //    secondo GET /api/ps conferma la residenza effettiva; i modelli
        //    mancanti vengono aggiunti a restoreFailures così il chiamante non
        //    riceve mai un "ok" silenzioso con la lineup parzialmente assente.
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
      };

      if (restoreTimeoutMs && restoreTimeoutMs > 0) {
        // Rollback temporizzato: se il ripristino non completa entro il timeout,
        // NON lo si silenzia — si marca il sentinel così il chiamante logga e
        // alerta. Il ripristino resta comunque in corso in background (i fetch
        // non sono cancellabili in modo affidabile), ma l'evento è registrato.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<"timeout">((resolveTimeout) => {
          timer = setTimeout(() => resolveTimeout("timeout"), restoreTimeoutMs);
        });
        const restorePromise = doRestore();
        const outcome = await Promise.race([
          restorePromise.then(() => "done" as const),
          timeout,
        ]);
        if (timer) clearTimeout(timer);
        if (outcome === "timeout") {
          if (!restoreFailures.includes(RESTORE_TIMEOUT_SENTINEL)) {
            restoreFailures.push(RESTORE_TIMEOUT_SENTINEL);
          }
          // Restore ancora in corso: tieni il lock finché non si conclude.
          deferredRestore = restorePromise;
        }
      } else {
        await doRestore();
      }
    }
    if (deferredRestore) {
      // Il chiamante ha già ricevuto la risposta (timeout segnalato); il lock si
      // rilascia solo quando il restore in background termina davvero, sia in
      // successo sia in errore.
      void deferredRestore.finally(() => {
        aresRunningSince = null;
      });
    } else {
      aresRunningSince = null;
    }
  }
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
  // La voce viene caricata nel preflight (prima di toccare la GPU) e riusata nel
  // work; il closure la condivide tra le due fasi.
  let item: Awaited<ReturnType<typeof getSupervisionBacklogItem>> | undefined;

  const outcome = await runAresGpuCycle<string>(
    async (signal) => {
      // 3a. analisi (carica Ares implicitamente alla prima chatRaw)
      const proposal = await runAresToolLoop(formatProblem(item!), signal);
      // 3b. persiste la proposta e fa avanzare lo stato a in_review (Ares ha
      //     preso in carico; la chiusura resta una decisione admin)
      await setAresNotes(backlogId, proposal);
      if (item!.status === "open") {
        await updateBacklogStatus(backlogId, "in_review");
      }
      return proposal;
    },
    {
      signal: options.signal,
      preflight: async () => {
        // Carica la voce PRIMA di toccare la GPU: se non esiste, non sfrattiamo nulla.
        try {
          item = await getSupervisionBacklogItem(backlogId);
        } catch (err) {
          return `lettura backlog fallita: ${err instanceof Error ? err.message : String(err)}`;
        }
        if (!item) return `voce di backlog #${backlogId} non trovata`;
        if (item.status === "resolved" || item.status === "dismissed") {
          return `voce #${backlogId} già chiusa (status=${item.status})`;
        }
        return null;
      },
    }
  );

  return {
    ok: outcome.ok,
    backlogId,
    proposal: outcome.value,
    snapshot: outcome.snapshot,
    restoreFailures: outcome.restoreFailures,
    error: outcome.error,
  };
}

// ── Modalità task-review (Task #211) ─────────────────────────────────────────
// Ares revisiona un TASK PLAN prima che venga assegnato a un agente, con lo
// stesso ciclo GPU dell'analisi backlog ma un prompt orientato alla review
// (scope, rischi, step mancanti, contraddizioni) e nessuna persistenza su DB:
// la review torna al chiamante admin. Invariante identico: "Ares propone,
// l'admin decide" — read-only, nessuna modifica al piano.

const ARES_TASK_REVIEW_SYSTEM_PROMPT = [
  "Sei Ares, l'agente di analisi pesante di BikerBlog (un blog di moto).",
  "In questa modalità REVISIONI un task plan prima che venga assegnato a un agente:",
  "il tuo compito è trovare problemi nel piano, NON eseguirlo.",
  "",
  "REGOLA ASSOLUTA — 'Ares propone, l'admin decide':",
  "- NON applichi mai modifiche, NON scrivi file, NON installi nulla, NON esegui il task.",
  "- Solo analisi del piano e osservazioni. Le decisioni restano all'admin.",
  "",
  "Hai tool READ-ONLY (ricerca nel codice, typecheck, lint, git log, github, lettura",
  "del blog, ricerca web/manuali). Usali per VERIFICARE le assunzioni del piano contro",
  "il codice reale: i file citati esistono? le funzioni/endpoint menzionati ci sono",
  "davvero? Non inventare: se un tool non conferma un'assunzione, segnalalo.",
  "",
  "Al termine produci una review in ITALIANO così strutturata:",
  "1. Scope: il piano è ben delimitato? Fa troppo o troppo poco rispetto all'obiettivo?",
  "2. Rischi e dipendenze nascoste: cosa può rompersi; dipendenze non dichiarate.",
  "3. Step mancanti o ambigui: passi assenti, sottospecificati o nell'ordine sbagliato.",
  "4. Contraddizioni interne: parti del piano in conflitto tra loro.",
  "5. Out of scope da verificare: cose escluse che forse andrebbero incluse (o viceversa).",
  "6. Giudizio finale: PRONTO / DA CORREGGERE / DA RIPENSARE, con una frase di motivazione.",
  "Per i punti 1-5, quando puoi apri con un verdetto binario (OK / PROBLEMA) e poi elabora.",
  "Sii conciso e concreto.",
].join("\n");

function formatTaskForReview(taskContent: string): string {
  return [
    "Task plan da revisionare (prima dell'assegnazione a un agente).",
    "Contenuto integrale tra i marcatori:",
    "--- INIZIO TASK PLAN ---",
    taskContent.trim(),
    "--- FINE TASK PLAN ---",
  ].join("\n");
}

/** Esito di un ciclo Ares in modalità task-review. */
export interface AresTaskReviewResult {
  ok: boolean;
  /** Review testuale strutturata di Ares, se prodotta. */
  review?: string;
  /** Modelli sfrattati e poi ripristinati. */
  snapshot: string[];
  /** Modelli il cui warmup di ripristino è fallito (lineup da controllare). */
  restoreFailures: string[];
  /** Messaggio d'errore se il ciclo è fallito prima di produrre la review. */
  error?: string;
}

/**
 * Ciclo Ares completo in modalità task-review. Admin-only (il chiamante è
 * l'endpoint interno). Riceve il CONTENUTO di un task plan (non un id), sfratta
 * la lineup residente, carica Ares, produce una review strutturata usando i
 * tool read-only per verificare le assunzioni del piano, scarica Ares e
 * ripristina la lineup (sempre, anche in errore). Nessuna persistenza su DB.
 *
 * Non lancia: ritorna sempre un `AresTaskReviewResult`; gli errori sono nel
 * campo `error`.
 */
export async function runAresTaskReview(
  taskContent: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<AresTaskReviewResult> {
  const outcome = await runAresGpuCycle<string>(
    async (signal) =>
      runAresToolLoop(formatTaskForReview(taskContent), signal, ARES_TASK_REVIEW_SYSTEM_PROMPT, options.timeoutMs),
    {
      signal: options.signal,
      // Valida l'input PRIMA di toccare la GPU: un piano vuoto non deve
      // sfrattare la lineup.
      preflight: async () =>
        taskContent.trim().length === 0 ? "task plan vuoto" : null,
    }
  );

  return {
    ok: outcome.ok,
    review: outcome.value,
    snapshot: outcome.snapshot,
    restoreFailures: outcome.restoreFailures,
    error: outcome.error,
  };
}

// ── Modalità coder pesante on-demand (Task #222, Fase 2d power) ───────────────
// Il "coder" è lo STESSO slot heavy di Ares (stesso modello devstral, stesso
// client, stesso lock a ciclo singolo): non installiamo un secondo modello sul
// TC — riusiamo la capacità pesante già presente in modalità "fix di codice".
// Per l'utente resta un solo agente heavy non residente che, a seconda del
// trigger, o revisiona il backlog di supervisione (Ares) o propone fix di
// codice complessi (coder). Invariante identico: PROPONE soltanto, non applica
// nulla — read-only allowlist, "l'admin decide".
//
// Differenza chiave rispetto ad Ares: l'eviction è GATED sull'attività di chat.
// Il coder può essere innescato in automatico (escalation da Quebracho) mentre
// gli utenti stanno chattando; il gate nel preflight (che gira PRIMA di toccare
// la GPU) rifiuta il ciclo se c'è una chat in corso, così non si sfratta mai la
// lineup a metà di uno stream. Inoltre il ripristino è vincolato a un timeout
// finito (rollback temporizzato) così un restore bloccato viene alertato.

/**
 * Messaggio esplicito quando il coder viene rifiutato dal gate anti-interruzione
 * (chat attiva o affluenza troppo recente per un trigger non-admin). Il coder va
 * "in coda/rifiutato con messaggio esplicito", mai a interrompere uno stream.
 */
export const CODER_GATED_MESSAGE =
  "Coder rimandato: c'è una chat attiva (o troppo recente) e il coder non sfratta mai una " +
  "sessione in corso. Riprova quando la chat è libera, oppure forza con un trigger admin esplicito.";

/**
 * Timeout (ms) entro cui il ripristino della lineup residente dopo il coder deve
 * completare, altrimenti l'evento viene loggato/alertato (rollback temporizzato,
 * default 60s). Configurabile via `CODER_RESTORE_TIMEOUT_MS`, ma esiste sempre un
 * timeout finito.
 */
const CODER_RESTORE_TIMEOUT_MS = Number(process.env["CODER_RESTORE_TIMEOUT_MS"]) || 60_000;

/**
 * Inattività minima della chat (ms) richiesta per innescare il coder da un
 * trigger NON admin (es. escalation automatica di Quebracho): "nessuna sessione
 * di chat attiva da almeno N minuti". Un trigger admin esplicito salta questa
 * soglia (ma resta comunque bloccato se una chat è attiva in questo istante).
 * Default 5 minuti, configurabile via `CODER_MIN_IDLE_MS`.
 */
const CODER_MIN_IDLE_MS = Number(process.env["CODER_MIN_IDLE_MS"]) || 5 * 60_000;

const CODER_SYSTEM_PROMPT = [
  "Sei il coder pesante di BikerBlog (un blog di moto gestito da una pipeline notturna",
  "e da agenti Ollama sul server dell'utente). In questa modalità PROPONI un fix per un",
  "problema di codice complesso che ti viene delegato — tipicamente escalato da Quebracho",
  "o da un admin.",
  "",
  "REGOLA ASSOLUTA — 'il coder propone, l'admin decide':",
  "- NON applichi mai modifiche, NON scrivi file, NON installi nulla, NON esegui comandi.",
  "- Produci solo una diagnosi e una proposta di fix. L'applicazione resta all'admin/agente.",
  "",
  "Hai tool READ-ONLY (ricerca nel codice, typecheck, lint, git log, github, ricerca web).",
  "Usali per CAPIRE il problema sul codice reale prima di proporre: individua i file e le",
  "funzioni coinvolte, verifica le assunzioni, non inventare percorsi o simboli che non hai",
  "confermato.",
  "",
  "Al termine produci una risposta in ITALIANO così strutturata:",
  "1. Diagnosi: qual è la causa reale del problema (con i file/funzioni coinvolti).",
  "2. Fix proposto: la modifica concreta, con snippet o diff a parole dei punti da cambiare.",
  "3. Rischi ed effetti collaterali: cosa potrebbe rompersi, cosa testare dopo il fix.",
  "4. Alternative: se esiste più di un percorso ragionevole, elencane un paio con trade-off.",
  "Sii conciso e concreto: l'admin deve poter applicare la proposta senza reinterpretarla.",
].join("\n");

function formatCoderProblem(problem: string): string {
  return [
    "Problema di codice da analizzare e per cui proporre un fix.",
    "Descrizione integrale tra i marcatori:",
    "--- INIZIO PROBLEMA ---",
    problem.trim(),
    "--- FINE PROBLEMA ---",
  ].join("\n");
}

/** Modello usato dal coder: è lo stesso slot heavy di Ares (devstral). */
export function coderModel(): string {
  return aresModel();
}

/**
 * True se un ciclo heavy è in corso. Coder e Ares condividono lo stesso slot e
 * lo stesso lock, quindi questo è un alias di `isAresRunning`: se uno dei due
 * gira, l'altro è occupato (una sola capacità pesante non residente).
 */
export function isCoderRunning(): boolean {
  return isAresRunning();
}

/** Esito di un ciclo del coder pesante. */
export interface CoderTaskResult {
  ok: boolean;
  /** Proposta di fix testuale del coder, se prodotta. */
  proposal?: string;
  /** Modelli della lineup sfrattati e poi ripristinati. */
  snapshot: string[];
  /** Modelli il cui ripristino è fallito (lineup da controllare). */
  restoreFailures: string[];
  /** True se il ripristino ha superato il timeout (rollback temporizzato). */
  restoreTimedOut: boolean;
  /** True se il ciclo è stato rifiutato dal gate anti-interruzione (chat attiva). */
  gated?: boolean;
  /** Messaggio d'errore (o motivo del gate) se il ciclo non ha prodotto una proposta. */
  error?: string;
}

/**
 * Ciclo del coder pesante su UN problema di codice. Riusa lo slot heavy di Ares
 * (stesso modello, stesso lock) ma con eviction GATED sull'attività di chat:
 *
 * - `adminTrigger: true` (trigger admin esplicito) → gira purché non ci sia una
 *   chat attiva IN QUESTO ISTANTE (non si interrompe mai uno stream in corso).
 * - `adminTrigger: false` (escalation automatica, es. Quebracho) → gira solo se
 *   non c'è chat attiva E l'ultima attività di chat è più vecchia di
 *   `CODER_MIN_IDLE_MS` ("bassa affluenza").
 *
 * Il gate vive nel preflight, che gira PRIMA di toccare la GPU: un rifiuto NON
 * sfratta nulla. Il ripristino della lineup è vincolato a `CODER_RESTORE_TIMEOUT_MS`.
 *
 * Non lancia: ritorna sempre un `CoderTaskResult`.
 */
export async function runCoderTask(
  problem: string,
  options: { signal?: AbortSignal; adminTrigger?: boolean; timeoutMs?: number } = {}
): Promise<CoderTaskResult> {
  // Il preflight può segnalare il rifiuto-da-gate; lo comunichiamo al chiamante
  // via questo flag mutato nel closure (l'outcome porta solo `error` testuale).
  const gate = { blocked: false };

  const outcome = await runAresGpuCycle<string>(
    async (signal) => runAresToolLoop(formatCoderProblem(problem), signal, CODER_SYSTEM_PROMPT, options.timeoutMs),
    {
      signal: options.signal,
      restoreTimeoutMs: CODER_RESTORE_TIMEOUT_MS,
      preflight: async () => {
        // Valida l'input PRIMA di toccare la GPU: un problema vuoto non sfratta nulla.
        if (!problem || problem.trim().length === 0) return "problema vuoto: niente da proporre al coder";
        // Gate anti-interruzione: mai sfrattare una chat in corso.
        if (isChatActive()) {
          gate.blocked = true;
          return CODER_GATED_MESSAGE;
        }
        // Per un trigger non-admin serve anche bassa affluenza (idle ≥ soglia).
        if (!options.adminTrigger && chatIdleMs() < CODER_MIN_IDLE_MS) {
          gate.blocked = true;
          return CODER_GATED_MESSAGE;
        }
        return null;
      },
    }
  );

  return {
    ok: outcome.ok,
    proposal: outcome.value,
    snapshot: outcome.snapshot,
    restoreFailures: outcome.restoreFailures,
    restoreTimedOut: outcome.restoreFailures.includes(RESTORE_TIMEOUT_SENTINEL),
    gated: gate.blocked || undefined,
    error: outcome.error,
  };
}
