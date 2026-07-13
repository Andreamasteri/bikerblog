/**
 * bowie-readiness-check — verifica che Bowie sia raggiungibile e in grado di
 * generare testo PRIMA che la pipeline esegua step che dipendono da lui.
 *
 * Motivazione: la logica di eviction VRAM (Horus/Bowie/Quebracho 4-way
 * coexistence) può lasciare Bowie scaricato se Ares o Coder hanno girato in
 * precedenza. Se un Bowie generation call viene eseguito con il modello non
 * caricato, Ollama può impiegare 300s+ per ricaricarlo dal disco prima ancora
 * di iniziare a generare — o silenziare l'errore con una risposta vuota. Questo
 * check rende il problema esplicito prima che la pipeline ne dipenda, invece di
 * lasciarlo emergere ore dopo come un post vuoto o mancante.
 *
 * Due fasi:
 *   1. Health ping leggero — GET /api/version su Ollama (6s timeout): verifica
 *      che il server sia raggiungibile. Non carica il modello.
 *   2. Inference probe — una singola richiesta di generazione con un prompt
 *      minimo (1-2 token di output): verifica che il modello risponda davvero.
 *      Usa un timeout molto breve (BOWIE_READINESS_TIMEOUT_MS, default 45s)
 *      perché un caricamento cold da disco può richiedere 15-30s — se supera
 *      la soglia il modello non è in stato operativo per la pipeline.
 *
 * Esiti:
 *   "skipped" — BOWIE_OLLAMA_MODEL non impostato (Bowie opzionale, nessun alert)
 *   "ok"      — health + inference entrambi passati (nessun output)
 *   "warn"    — health o inference falliti: il chiamante deve pushare in
 *               criticalWarnings così scatta sendPipelineAlert
 *
 * Non lancia mai: ogni percorso di fallimento produce un warn strutturato.
 *
 * Env:
 *   BOWIE_OLLAMA_MODEL    — richiesto per abilitare Bowie
 *   BOWIE_OLLAMA_URL      — opzionale, default HORUS_OLLAMA_URL
 *   BOWIE_CF_ACCESS_CLIENT_ID / BOWIE_CF_ACCESS_CLIENT_SECRET — opzionale
 *   BOWIE_READINESS_TIMEOUT_MS — timeout inference probe, default 45000
 *
 * Usage (CLI manuale):
 *   pnpm --filter @workspace/scripts run bowie:readiness-check
 */

import { isBowieConfigured, checkBowieHealth, bowieChatRaw } from "@workspace/horus";
import type { OllamaAgentHealth, HorusMessage, HorusChatOptions, HorusRawResult } from "@workspace/horus";

export interface BowieReadinessResult {
  status: "ok" | "skipped" | "warn";
  detail: string;
  /** Fase che ha fallito, se status === "warn". */
  failedPhase?: "health" | "inference";
}

/**
 * Dipendenze iniettabili per checkBowieReadiness — usate nei test per
 * sostituire le chiamate reali senza ricorrere a module mocking.
 */
export interface BowieReadinessDeps {
  isBowieConfigured: () => boolean;
  checkBowieHealth: () => Promise<OllamaAgentHealth>;
  bowieChatRaw: (msgs: HorusMessage[], opts?: HorusChatOptions) => Promise<HorusRawResult>;
}

const DEFAULT_INFERENCE_TIMEOUT_MS = 45_000;

/**
 * Implementazione core con dipendenze iniettabili.
 * Testabile direttamente senza module mocking.
 */
export async function checkBowieReadinessWithDeps(
  deps: BowieReadinessDeps,
  inferenceTimeoutMs = DEFAULT_INFERENCE_TIMEOUT_MS,
): Promise<BowieReadinessResult> {
  if (!deps.isBowieConfigured()) {
    return {
      status: "skipped",
      detail: "BOWIE_OLLAMA_MODEL non configurato — Bowie non abilitato in questo ambiente",
    };
  }

  // ── Fase 1: health ping ────────────────────────────────────────────────────
  let health: OllamaAgentHealth;
  try {
    health = await deps.checkBowieHealth();
  } catch (err) {
    return {
      status: "warn",
      detail: `Bowie health check ha lanciato un'eccezione inattesa: ${err instanceof Error ? err.message : String(err)}`,
      failedPhase: "health",
    };
  }

  if (health.status === "not_configured") {
    return {
      status: "skipped",
      detail: "Bowie non configurato (health: not_configured)",
    };
  }

  if (health.status === "unreachable") {
    const modelTag = health.model ? ` (modello: ${health.model})` : "";
    return {
      status: "warn",
      detail:
        `Bowie non raggiungibile via Ollama${modelTag}: ${health.detail ?? "nessun dettaglio"} — ` +
        `il server TC è spento, il tunnel Cloudflare è interrotto, o il modello è in fase di caricamento/eviction`,
      failedPhase: "health",
    };
  }

  // health.status === "ok" — il server risponde, il modello potrebbe essere
  // non caricato in VRAM. Passiamo alla prova di inferenza.

  // ── Fase 2: inference probe ────────────────────────────────────────────────
  const probeAbort = new AbortController();
  const probeTimer = setTimeout(() => probeAbort.abort(), inferenceTimeoutMs);

  let inferenceContent = "";
  try {
    const result = await deps.bowieChatRaw(
      [{ role: "user", content: "Rispondi con una sola parola: pronto" }],
      {
        maxTokens: 8,
        timeoutMs: inferenceTimeoutMs,
        skipMemory: true,
        signal: probeAbort.signal,
      },
    );
    inferenceContent = result.content.trim();
  } catch (err) {
    clearTimeout(probeTimer);
    const isTimeout =
      (err instanceof Error && err.name === "AbortError") ||
      (err instanceof Error && /timeout/i.test(err.message));
    return {
      status: "warn",
      detail: isTimeout
        ? `Bowie inference probe è scaduto dopo ${inferenceTimeoutMs}ms — il modello probabilmente non è caricato in VRAM (cold-load in corso o eviction recente)`
        : `Bowie inference probe fallito: ${err instanceof Error ? err.message : String(err)}`,
      failedPhase: "inference",
    };
  } finally {
    clearTimeout(probeTimer);
  }

  if (!inferenceContent) {
    return {
      status: "warn",
      detail:
        "Bowie ha risposto alla probe ma con contenuto vuoto — possibile problema di configurazione del modello (think:false non applicato o risposta anomala)",
      failedPhase: "inference",
    };
  }

  return {
    status: "ok",
    detail: `Bowie operativo — health ok, inference probe superata (risposta: "${inferenceContent.slice(0, 60)}")`,
  };
}

/**
 * Verifica che Bowie sia raggiungibile e operativo con una doppia prova:
 * health ping (server up?) + inference probe (modello caricato?).
 * Non lancia mai — ogni errore diventa un warn strutturato.
 */
export async function checkBowieReadiness(): Promise<BowieReadinessResult> {
  const inferenceTimeoutMs =
    Number(process.env["BOWIE_READINESS_TIMEOUT_MS"] ?? DEFAULT_INFERENCE_TIMEOUT_MS) ||
    DEFAULT_INFERENCE_TIMEOUT_MS;

  return checkBowieReadinessWithDeps(
    { isBowieConfigured, checkBowieHealth, bowieChatRaw },
    inferenceTimeoutMs,
  );
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const result = await checkBowieReadiness();
  if (result.status === "skipped") {
    console.log(`[bowie-readiness-check] SKIP — ${result.detail}`);
  } else if (result.status === "ok") {
    console.log(`[bowie-readiness-check] OK — ${result.detail}`);
  } else {
    console.error(`[bowie-readiness-check] WARN (fase: ${result.failedPhase ?? "sconosciuta"}) — ${result.detail}`);
    process.exit(1);
  }
}
