import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  beginChatActivity,
  __resetChatActivityForTests,
} from "./chat-activity.js";

/**
 * Test dell'orchestrazione del CODER pesante on-demand (Task #222, Fase 2d)
 * SENZA toccare il TC reale.
 *
 * Il coder riusa lo slot heavy di Ares (stesso modello devstral, stesso lock),
 * ma con eviction GATED sull'attività di chat. Gli invarianti chiave verificati:
 *  1. CONCORRENZA (deliverable esplicito): se c'è una chat ATTIVA il coder è
 *     rifiutato dal gate SENZA sfrattare nulla (zero unload); appena la chat si
 *     libera, lo stesso trigger gira ed esegue l'eviction.
 *  2. happy path admin: sfratta la lineup → analizza → unload coder → ripristina.
 *  3. rollback temporizzato: se il ripristino supera `CODER_RESTORE_TIMEOUT_MS`,
 *     `restoreTimedOut` è true (il sentinel finisce in `restoreFailures`).
 *  4. ripristino fallito: un warmup KO finisce in `restoreFailures`.
 *  5. gate idle per trigger NON admin (es. escalation Quebracho).
 *
 * `chat-activity.js` è importato SENZA cache-bust: è lo STESSO modulo cached che
 * `ares.js` (cache-bustato) importa via `./chat-activity.js`, quindi il
 * `beginChatActivity()` chiamato qui è visto dal gate del coder. Si azzera con
 * `__resetChatActivityForTests()` tra un test e l'altro.
 *
 * `./client.js`, `./tools.js`, `./supervision-backlog.js` sono sostituiti via
 * `mock.module` (richiede `--experimental-test-module-mocks`); `global.fetch`
 * intercetta /api/ps, /api/generate (unload keep_alive:0 / warmup keep_alive:-1).
 */

process.env["ARES_OLLAMA_MODEL"] = "devstral:test";
process.env["HORUS_OLLAMA_URL"] = "http://tc.test";

interface FetchCall {
  url: string;
  body: Record<string, unknown> | null;
}

type ChatRaw = (
  history?: unknown,
  opts?: { tools?: Array<{ function: { name: string } }> }
) => Promise<{ content: string; toolCalls: [] }>;

let importCounter = 0;

async function setup(opts: {
  chatRaw: ChatRaw;
  residentModels?: string[];
  isConfigured?: boolean;
  /** Env `CODER_RESTORE_TIMEOUT_MS` per questo import (ms). */
  restoreTimeoutMs?: number;
  /** Env `CODER_MIN_IDLE_MS` per questo import (ms). */
  minIdleMs?: number;
  /** Ritarda le risposte di warmup (keep_alive:-1) di N ms. */
  warmupDelayMs?: number;
  /** Modelli per cui il warmup deve fallire (HTTP non-ok). */
  failWarmupFor?: string[];
}): Promise<{
  coder: typeof import("./ares.js");
  fetchCalls: FetchCall[];
  restore: () => void;
}> {
  const realClient = await import("./client.js");
  const realTools = await import("./tools.js");
  const realBacklog = await import("./supervision-backlog.js");

  const fakeClient = {
    chatRaw: opts.chatRaw,
    chat: async () => "",
    isConfigured: () => opts.isConfigured ?? true,
    checkHealth: async () => ({ status: "ok", model: "devstral:test" }) as const,
  };

  const mClient = mock.module("./client.js", {
    namedExports: { ...realClient, createOllamaAgentClient: () => fakeClient },
  });
  const mTools = mock.module("./tools.js", {
    namedExports: {
      ...realTools,
      getHorusTools: async () => [],
      executeHorusTool: async () => "",
      capToolResult: (s: string) => s,
    },
  });
  const mBacklog = mock.module("./supervision-backlog.js", {
    namedExports: { ...realBacklog },
  });

  const fetchCalls: FetchCall[] = [];
  const resident = opts.residentModels ?? ["qwen3:4b", "qwen3:1.7b"];
  const failWarmup = new Set(opts.failWarmupFor ?? []);
  const originalFetch = global.fetch;
  global.fetch = (async (url: string, init?: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    fetchCalls.push({ url: String(url), body });
    if (String(url).endsWith("/api/ps")) {
      return {
        ok: true,
        json: async () => ({ models: resident.map((name) => ({ name })) }),
      } as Response;
    }
    // Warmup: /api/generate (keep_alive:-1) con fallback su /api/embeddings.
    // Per simulare un warmup KO va fatto fallire ENTRAMBI gli endpoint per il
    // modello, altrimenti il fallback embeddings lo riporterebbe residente.
    const isWarmupGenerate = String(url).endsWith("/api/generate") && body?.["keep_alive"] === -1;
    const isWarmupEmbeddings = String(url).endsWith("/api/embeddings") && body?.["keep_alive"] === -1;
    if (isWarmupGenerate || isWarmupEmbeddings) {
      if (opts.warmupDelayMs) {
        await new Promise((r) => setTimeout(r, opts.warmupDelayMs));
      }
      if (failWarmup.has(String(body?.["model"]))) {
        return { ok: false, status: 500, json: async () => ({}), text: async () => "" } as Response;
      }
    }
    return { ok: true, json: async () => ({}), text: async () => "" } as Response;
  }) as typeof global.fetch;

  // Env letti a livello di modulo in ares.ts: impostati PRIMA dell'import
  // cache-bustato, ripristinati nel restore().
  const prevRestore = process.env["CODER_RESTORE_TIMEOUT_MS"];
  const prevIdle = process.env["CODER_MIN_IDLE_MS"];
  if (opts.restoreTimeoutMs !== undefined) {
    process.env["CODER_RESTORE_TIMEOUT_MS"] = String(opts.restoreTimeoutMs);
  }
  if (opts.minIdleMs !== undefined) {
    process.env["CODER_MIN_IDLE_MS"] = String(opts.minIdleMs);
  }

  const coder = (await import(`./ares.js?t=${importCounter++}`)) as typeof import("./ares.js");

  return {
    coder,
    fetchCalls,
    restore: () => {
      mClient.restore();
      mTools.restore();
      mBacklog.restore();
      global.fetch = originalFetch;
      if (prevRestore === undefined) delete process.env["CODER_RESTORE_TIMEOUT_MS"];
      else process.env["CODER_RESTORE_TIMEOUT_MS"] = prevRestore;
      if (prevIdle === undefined) delete process.env["CODER_MIN_IDLE_MS"];
      else process.env["CODER_MIN_IDLE_MS"] = prevIdle;
    },
  };
}

function unloadModels(calls: FetchCall[]): string[] {
  return calls
    .filter((c) => c.url.endsWith("/api/generate") && c.body?.["keep_alive"] === 0)
    .map((c) => String(c.body?.["model"]));
}
function warmupModels(calls: FetchCall[]): string[] {
  return calls
    .filter((c) => c.url.endsWith("/api/generate") && c.body?.["keep_alive"] === -1)
    .map((c) => String(c.body?.["model"]));
}

test("CONCORRENZA: chat attiva → coder gated, ZERO eviction; poi rilascio → gira", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "Diagnosi + Fix + Rischi", toolCalls: [] }),
  });
  try {
    // Una chat è in corso: anche un trigger ADMIN non deve sfrattare nulla.
    const releaseChat = beginChatActivity();
    const gatedResult = await coder.runCoderTask("bug nel parser", { adminTrigger: true });

    assert.equal(gatedResult.gated, true, "con chat attiva il coder deve essere gated");
    assert.equal(gatedResult.ok, false);
    assert.match(gatedResult.error ?? "", /chat attiva|Riprova/i);
    // Invariante centrale del task: nessuna eviction mentre una chat è viva.
    assert.equal(unloadModels(fetchCalls).length, 0, "gated → nessun modello sfrattato");
    assert.equal(coder.isCoderRunning(), false);

    // Liberata la chat, lo STESSO trigger ora gira ed esegue l'eviction.
    releaseChat();
    const okResult = await coder.runCoderTask("bug nel parser", { adminTrigger: true });

    assert.equal(okResult.ok, true, okResult.error);
    assert.match(okResult.proposal ?? "", /Fix/);
    const unloaded = unloadModels(fetchCalls);
    assert.ok(unloaded.includes("qwen3:4b") && unloaded.includes("qwen3:1.7b"), "lineup sfrattata dopo il rilascio");
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("admin happy path: sfratta la lineup, propone il fix, unload coder, ripristina", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "1. Diagnosi ... 2. Fix proposto ... 4. Alternative", toolCalls: [] }),
  });
  try {
    const result = await coder.runCoderTask("race condition nel lock", { adminTrigger: true });

    assert.equal(result.ok, true, result.error);
    assert.equal(result.gated, undefined);
    assert.match(result.proposal ?? "", /Fix proposto/);
    assert.deepEqual(result.snapshot, ["qwen3:4b", "qwen3:1.7b"]);
    assert.deepEqual(result.restoreFailures, []);
    assert.equal(result.restoreTimedOut, false);
    assert.equal(coder.coderModel(), "devstral:test");

    // Eviction della lineup + unload del coder stesso (keep_alive:0).
    const unloaded = unloadModels(fetchCalls);
    assert.ok(unloaded.includes("qwen3:4b") && unloaded.includes("qwen3:1.7b"), "lineup sfrattata");
    assert.ok(unloaded.includes("devstral:test"), "coder scaricato a fine ciclo");

    // Ripristino della lineup (keep_alive:-1); il coder NON resta residente.
    const warmed = warmupModels(fetchCalls).sort();
    assert.deepEqual(warmed, ["qwen3:1.7b", "qwen3:4b"]);
    assert.ok(!warmed.includes("devstral:test"), "il coder non deve restare residente");

    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("rollback temporizzato: ripristino oltre il timeout → restoreTimedOut true", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "proposta", toolCalls: [] }),
    restoreTimeoutMs: 5, // timeout aggressivo
    warmupDelayMs: 50, // il warmup impiega più del timeout
  });
  try {
    const result = await coder.runCoderTask("qualcosa", { adminTrigger: true });

    // Il lavoro è andato a buon fine; è il RIPRISTINO ad aver superato il timeout.
    assert.equal(result.ok, true, result.error);
    assert.equal(result.restoreTimedOut, true, "il ripristino oltre il timeout deve essere segnalato");
    assert.ok(
      result.restoreFailures.includes("__restore_timeout__"),
      "il sentinel di timeout deve finire in restoreFailures"
    );
    // L'eviction è comunque avvenuta prima del timeout di ripristino.
    assert.ok(unloadModels(fetchCalls).includes("qwen3:4b"));
    // Il ripristino è ancora in corso in background: il lock a ciclo singolo
    // resta ALZATO finché non termina, così un secondo trigger non può correre
    // in parallelo mentre unload/warmup stanno ancora mutando la residenza.
    assert.equal(coder.isCoderRunning(), true, "lock tenuto durante il restore in background");
    // Attende che il restore in background si concluda (due warmup sequenziali
    // da warmupDelayMs l'uno + health check), con margine per il timing di CI.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(coder.isCoderRunning(), false, "lock rilasciato quando il restore termina");
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("timeout di ripristino: un secondo trigger è respinto (busy) mentre il restore gira ancora", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "proposta", toolCalls: [] }),
    restoreTimeoutMs: 5,
    warmupDelayMs: 60, // restore in background più lungo del timeout
  });
  try {
    // Primo ciclo: torna al timeout con il restore ancora in corso.
    const first = await coder.runCoderTask("primo", { adminTrigger: true });
    assert.equal(first.restoreTimedOut, true);
    assert.equal(coder.isCoderRunning(), true, "restore ancora in corso → lock alzato");

    const unloadsBefore = unloadModels(fetchCalls).length;
    // Secondo trigger mentre il restore del primo è ancora in flight: DEVE essere
    // respinto come "busy" (non gated) e NON deve sfrattare di nuovo la lineup.
    const second = await coder.runCoderTask("secondo", { adminTrigger: true });
    assert.equal(second.ok, false, "un secondo ciclo concorrente non deve girare");
    assert.equal(second.gated, undefined, "è un conflitto di lock (busy), non un gate");
    assert.equal(second.error, coder.ARES_BUSY_MESSAGE);
    assert.equal(
      unloadModels(fetchCalls).length,
      unloadsBefore,
      "il trigger respinto non deve eseguire una nuova eviction"
    );

    // Concluso il restore del primo, il lock si libera e un nuovo ciclo può girare.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("ripristino fallito: un warmup KO finisce in restoreFailures", async () => {
  __resetChatActivityForTests();
  const { coder, restore } = await setup({
    chatRaw: async () => ({ content: "proposta", toolCalls: [] }),
    failWarmupFor: ["qwen3:1.7b"],
  });
  try {
    const result = await coder.runCoderTask("qualcosa", { adminTrigger: true });

    assert.equal(result.ok, true, result.error);
    assert.ok(
      result.restoreFailures.includes("qwen3:1.7b"),
      "il modello non ripristinato deve essere segnalato"
    );
    assert.equal(result.restoreTimedOut, false);
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("gate idle: trigger NON admin poco dopo una chat → gated, nessuna eviction", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "proposta", toolCalls: [] }),
    // idle richiesto alto: subito dopo una chat l'idle è ~0 < soglia → gated.
    minIdleMs: 60_000,
  });
  try {
    // Chat conclusa or ora: idle basso.
    beginChatActivity()();
    const result = await coder.runCoderTask("problema escalato da quebracho", { adminTrigger: false });

    assert.equal(result.gated, true, "escalation non-admin con chat troppo recente deve essere gated");
    assert.equal(result.ok, false);
    assert.equal(unloadModels(fetchCalls).length, 0, "gated → nessuna eviction");
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("trigger NON admin senza alcuna chat mai avvenuta → gira (idle infinito)", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "proposta", toolCalls: [] }),
  });
  try {
    // Nessuna chat mai in questo processo di test → chatIdleMs = +Infinity.
    const result = await coder.runCoderTask("problema notturno", { adminTrigger: false });

    assert.equal(result.gated, undefined);
    assert.equal(result.ok, true, result.error);
    assert.ok(unloadModels(fetchCalls).includes("qwen3:4b"), "senza chat il coder gira ed esegue l'eviction");
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});

test("problema vuoto: errore, nessuna eviction", async () => {
  __resetChatActivityForTests();
  const { coder, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "non dovrebbe essere chiamato", toolCalls: [] }),
  });
  try {
    const result = await coder.runCoderTask("   \n  ", { adminTrigger: true });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /vuoto/);
    assert.equal(unloadModels(fetchCalls).length, 0, "preflight fallito → nessuna eviction");
    assert.equal(coder.isCoderRunning(), false);
  } finally {
    restore();
    __resetChatActivityForTests();
  }
});
