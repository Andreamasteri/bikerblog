#!/usr/bin/env tsx
/**
 * horus-sse-smoke — smoke check opt-in che parla DAVVERO con Horus/Bowie
 * attraverso il tunnel Cloudflare (nessun `chatRaw` finto), per intercettare
 * regressioni di streaming/tunnel reale che il test mockato
 * (`artifacts/api-server/src/routes/horus.sse.test.ts`) non può vedere.
 *
 * Colpisce l'api-server realmente in esecuzione (non uno mock in-process),
 * quindi va lanciato mentre il workflow dell'api-server è attivo — è lì che
 * le env var di Horus/Bowie sono presenti in modo affidabile (vedi nota in
 * replit.md sull'instabilità di queste env var nella sessione bash diretta
 * dell'agente).
 *
 * Verifica, per ogni endpoint SSE configurato:
 *   - che arrivi almeno un evento reale (token, heartbeat ": ping" o
 *     turn_start) entro un timeout limitato — se il tunnel/Ollama fallisce
 *     silenziosamente, qui non arriva nulla e il check fallisce esplicitamente
 *     invece di restare a guardare uno stream vuoto.
 *
 * Skip (exit 0, nessun errore) se:
 *   - HORUS_CHAT_PASSWORD non è impostata (impossibile autenticarsi)
 *   - Horus non è configurato (HORUS_OLLAMA_URL mancante)
 *   - Bowie non è configurato — solo il check di Bowie viene saltato, quello
 *     di Horus gira comunque
 *
 * Non è pensato per la pipeline notturna né per la CI: è un check manuale
 * "il tunnel funziona davvero adesso?", da lanciare quando si sospetta un
 * problema di rete reale.
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

const API_BASE_URL = (process.env["API_BASE_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
const HORUS_CHAT_PASSWORD = process.env["HORUS_CHAT_PASSWORD"];
const FIRST_EVENT_TIMEOUT_MS = Math.max(5_000, Number(process.env["HORUS_SMOKE_TIMEOUT_MS"] ?? 45_000) || 45_000);

interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
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
  timeoutMs: number
): Promise<{ sawEvent: boolean; firstLine: string | null; httpStatus: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Horus-Password": HORUS_CHAT_PASSWORD!,
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

async function runCheck(name: string, url: string, body: unknown): Promise<SmokeResult> {
  const result = await waitForFirstRealEvent(url, body, FIRST_EVENT_TIMEOUT_MS);
  if (result.sawEvent) {
    return { name, ok: true, detail: `primo evento reale ricevuto: ${result.firstLine}` };
  }
  const statusPart = result.httpStatus !== null ? `HTTP ${result.httpStatus} — ` : "";
  return { name, ok: false, detail: `${statusPart}${result.error ?? "nessun evento ricevuto"}` };
}

async function main(): Promise<void> {
  if (!HORUS_CHAT_PASSWORD) {
    console.log("[horus-sse-smoke] SKIP — HORUS_CHAT_PASSWORD non impostata, impossibile autenticarsi.");
    return;
  }

  if (!isHorusConfigured()) {
    console.log("[horus-sse-smoke] SKIP — Horus non configurato su questo ambiente (HORUS_OLLAMA_URL mancante).");
    return;
  }

  const checks: Array<Promise<SmokeResult>> = [
    runCheck("POST /horus/chat", `${API_BASE_URL}/api/horus/chat`, {
      message: "Rispondi con una sola parola: ciao",
      history: [],
    }),
  ];

  if (isBowieConfigured()) {
    checks.push(
      runCheck("POST /horus/bowie-chat", `${API_BASE_URL}/api/horus/bowie-chat`, {
        message: "Rispondi con una sola parola: ciao",
        history: [],
      }),
      runCheck("POST /horus/bowie-conversation", `${API_BASE_URL}/api/horus/bowie-conversation`, {
        topic: "smoke test — ignora, nessun contenuto reale da salvare",
        maxTurns: 2,
      })
    );
  } else {
    console.log("[horus-sse-smoke] Bowie non configurato — salto i check su bowie-chat e bowie-conversation.");
  }

  const results = await Promise.all(checks);

  for (const r of results) {
    console.log(`[horus-sse-smoke] ${r.ok ? "OK  " : "FAIL"} ${r.name} — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `[horus-sse-smoke] ${failed.length}/${results.length} endpoint SSE non hanno prodotto alcun evento reale entro ${FIRST_EVENT_TIMEOUT_MS}ms.`
    );
    process.exit(1);
  }

  console.log(`[horus-sse-smoke] tutti i ${results.length} endpoint SSE reali hanno risposto correttamente.`);
}

await main();
