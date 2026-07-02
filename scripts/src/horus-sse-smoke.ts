#!/usr/bin/env tsx
/**
 * horus-sse-smoke — smoke check che parla DAVVERO con Horus/Bowie
 * attraverso il tunnel Cloudflare (nessun `chatRaw` finto), per intercettare
 * regressioni di streaming/tunnel reale che il test mockato
 * (`artifacts/api-server/src/routes/horus.sse.test.ts`) non può vedere.
 *
 * Verifica, per ogni endpoint SSE configurato:
 *   - che arrivi almeno un evento reale (token, heartbeat ": ping" o
 *     turn_start) entro un timeout limitato — se il tunnel/Ollama fallisce
 *     silenziosamente, qui non arriva nulla e il check fallisce esplicitamente
 *     invece di restare a guardare uno stream vuoto.
 *
 * Skip (nessun fallimento) se:
 *   - HORUS_CHAT_PASSWORD non è impostata (impossibile autenticarsi)
 *   - Horus non è configurato (HORUS_OLLAMA_URL mancante)
 *   - Bowie non è configurato — solo il check di Bowie viene saltato, quello
 *     di Horus gira comunque
 *
 * La logica di controllo vive in `runHorusSseSmoke()`, riusabile sia dal CLI
 * qui sotto (uso manuale — "il tunnel funziona davvero adesso?") sia da
 * `run-cluster-daily.ts` come step schedulato che instrada i fallimenti
 * verso `sendPipelineAlert` (vedi "Pipeline failure alerts" in replit.md).
 *
 * Env:
 *   - API_BASE_URL (opzionale, default http://localhost:8080) — base
 *     dell'api-server, deve includere già /api implicito nelle route sotto
 *   - HORUS_CHAT_PASSWORD (richiesta) — stessa password della chat web
 *   - HORUS_SMOKE_TIMEOUT_MS (opzionale, default 45000) — quanto aspettare il
 *     primo evento reale prima di considerare l'endpoint silenziosamente rotto
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run horus:sse-smoke
 */
import { isHorusConfigured, isBowieConfigured } from "@workspace/horus";

const DEFAULT_API_BASE_URL = "http://localhost:8080";
const DEFAULT_TIMEOUT_MS = 45_000;

export interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SmokeRunOptions {
  /** Base URL of the api-server, e.g. http://localhost:8080 or https://bikerlink-blog.replit.app */
  apiBaseUrl?: string;
  /** X-Horus-Password header value. */
  password?: string;
  /** How long to wait for the first real SSE event before failing. */
  timeoutMs?: number;
}

export interface SmokeRunOutcome {
  /** True if the check was skipped entirely (no password / Horus not configured). */
  skipped: boolean;
  skipReason?: string;
  /** True if all executed checks succeeded (vacuously true when skipped). */
  ok: boolean;
  results: SmokeResult[];
}

/**
 * Legge lo stream SSE grezzo (righe `event: ...` / `data: ...` o commenti
 * `: ping`) finché non trova il primo segnale di vita reale, poi abortisce
 * subito la richiesta: non ci interessa aspettare la generazione completa
 * (può durare minuti su hardware CPU), solo dimostrare che la connessione
 * porta davvero dati end-to-end.
 */
async function waitForFirstRealEvent(
  url: string,
  body: unknown,
  password: string,
  timeoutMs: number
): Promise<{ sawEvent: boolean; firstLine: string | null; httpStatus: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Horus-Password": password,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sawEvent: false, firstLine: null, httpStatus: res.status, error: text.slice(0, 300) };
    }

    if (!res.body) {
      return { sawEvent: false, firstLine: null, httpStatus: res.status, error: "risposta senza body" };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Un evento SSE reale: una riga `event: ...`/`data: ...`, oppure un
        // commento di heartbeat `: ping` — entrambi provano che byte stanno
        // davvero arrivando dal server attraverso il tunnel.
        if (trimmed.startsWith("event:") || trimmed.startsWith("data:") || trimmed.startsWith(":")) {
          controller.abort();
          return { sawEvent: true, firstLine: trimmed.slice(0, 200), httpStatus: res.status };
        }
      }
    }

    return { sawEvent: false, firstLine: null, httpStatus: res.status, error: "stream terminato senza eventi" };
  } catch (err) {
    if (controller.signal.aborted) {
      // Se siamo qui è perché il timer ha scattato prima di ricevere nulla
      // (l'abort "di successo" dopo il primo evento fa già `return` sopra).
      return { sawEvent: false, firstLine: null, httpStatus: null, error: `timeout dopo ${timeoutMs}ms` };
    }
    return {
      sawEvent: false,
      firstLine: null,
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck(name: string, url: string, body: unknown, password: string, timeoutMs: number): Promise<SmokeResult> {
  const result = await waitForFirstRealEvent(url, body, password, timeoutMs);
  if (result.sawEvent) {
    return { name, ok: true, detail: `primo evento reale ricevuto: ${result.firstLine}` };
  }
  const statusPart = result.httpStatus !== null ? `HTTP ${result.httpStatus} — ` : "";
  return { name, ok: false, detail: `${statusPart}${result.error ?? "nessun evento ricevuto"}` };
}

/**
 * Esegue il controllo di connettività reale contro Horus (e Bowie, se
 * configurato) e restituisce un esito strutturato senza mai chiamare
 * `process.exit` — così può essere richiamato sia dal CLI di questo file
 * sia come step di `run-cluster-daily.ts`.
 */
export async function runHorusSseSmoke(options: SmokeRunOptions = {}): Promise<SmokeRunOutcome> {
  const apiBaseUrl = (options.apiBaseUrl ?? process.env["API_BASE_URL"] ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const password = options.password ?? process.env["HORUS_CHAT_PASSWORD"];
  const envTimeoutMs = Number(process.env["HORUS_SMOKE_TIMEOUT_MS"] ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? envTimeoutMs);

  if (!password) {
    return { skipped: true, skipReason: "HORUS_CHAT_PASSWORD non impostata, impossibile autenticarsi.", ok: true, results: [] };
  }

  if (!isHorusConfigured()) {
    return { skipped: true, skipReason: "Horus non configurato su questo ambiente (HORUS_OLLAMA_URL mancante).", ok: true, results: [] };
  }

  const checks: Array<Promise<SmokeResult>> = [
    runCheck(
      "POST /horus/chat",
      `${apiBaseUrl}/api/horus/chat`,
      { message: "Rispondi con una sola parola: ciao", history: [] },
      password,
      timeoutMs
    ),
  ];

  if (isBowieConfigured()) {
    checks.push(
      runCheck(
        "POST /horus/bowie-chat",
        `${apiBaseUrl}/api/horus/bowie-chat`,
        { message: "Rispondi con una sola parola: ciao", history: [] },
        password,
        timeoutMs
      ),
      runCheck(
        "POST /horus/bowie-conversation",
        `${apiBaseUrl}/api/horus/bowie-conversation`,
        { topic: "smoke test — ignora, nessun contenuto reale da salvare", maxTurns: 2 },
        password,
        timeoutMs
      )
    );
  }

  const results = await Promise.all(checks);
  const ok = results.every((r) => r.ok);
  return { skipped: false, ok, results };
}

async function main(): Promise<void> {
  const outcome = await runHorusSseSmoke();

  if (outcome.skipped) {
    console.log(`[horus-sse-smoke] SKIP — ${outcome.skipReason}`);
    return;
  }

  if (!isBowieConfigured()) {
    console.log("[horus-sse-smoke] Bowie non configurato — salto i check su bowie-chat e bowie-conversation.");
  }

  for (const r of outcome.results) {
    console.log(`[horus-sse-smoke] ${r.ok ? "OK  " : "FAIL"} ${r.name} — ${r.detail}`);
  }

  const failed = outcome.results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `[horus-sse-smoke] ${failed.length}/${outcome.results.length} endpoint SSE non hanno prodotto alcun evento reale.`
    );
    process.exit(1);
  }

  console.log(`[horus-sse-smoke] tutti i ${outcome.results.length} endpoint SSE reali hanno risposto correttamente.`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  await main();
}
