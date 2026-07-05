import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { SupervisionBacklogRow } from "@workspace/db";

/**
 * Test dell'orchestrazione di Ares (Task #201) SENZA toccare il TC reale.
 *
 * Non potendo caricare devstral né sfrattare la VRAM da qui, verifichiamo gli
 * INVARIANTI dell'orchestrazione con transport e DB finti:
 *  1. happy path: snapshot → eviction (keep_alive:0) → analisi → unload Ares →
 *     ripristino (keep_alive:-1); la proposta è salvata e lo stato passa a
 *     in_review; l'analisi NON applica modifiche (solo setAresNotes + status).
 *  2. il ripristino della lineup è SEMPRE tentato anche se l'analisi fallisce
 *     (blocco finally), e il lock viene rilasciato.
 *  3. lock a ciclo singolo: un secondo trigger mentre uno è in corso è respinto.
 *
 * `./client.js`, `./tools.js`, `./supervision-backlog.js` sono sostituiti via
 * `mock.module` (richiede `--experimental-test-module-mocks`, vedi script
 * "test"); `global.fetch` è sostituito per intercettare /api/ps e /api/generate.
 */

process.env["ARES_OLLAMA_MODEL"] = "devstral:test";
process.env["HORUS_OLLAMA_URL"] = "http://tc.test";

interface FetchCall {
  url: string;
  body: Record<string, unknown> | null;
}

function makeItem(overrides: Partial<SupervisionBacklogRow> = {}): SupervisionBacklogRow {
  return {
    id: 42,
    traceId: 1000,
    agent: "Bowie",
    reason: "risposta fuori tema",
    category: "pertinenza",
    classification: "non risponde alla domanda sull'olio catena",
    severity: "medium",
    status: "open",
    aresNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  } as SupervisionBacklogRow;
}

interface ChatRawOpts {
  tools?: Array<{ function: { name: string } }>;
}
type ChatRaw = (
  history?: unknown,
  opts?: ChatRawOpts
) => Promise<{ content: string; toolCalls: [] }>;

function toolSpec(name: string): { type: "function"; function: { name: string } } {
  return { type: "function", function: { name } };
}

// Contatore per cache-bustare l'import di ./ares.js: è un modulo con stato a
// livello di modulo (il lock `aresRunningSince`) e un client legato al momento
// del load, quindi ogni test ne importa una copia fresca bound ai suoi mock.
let importCounter = 0;

async function setup(opts: {
  chatRaw: ChatRaw;
  residentModels?: string[];
  item?: SupervisionBacklogRow | null;
  horusTools?: Array<{ type: "function"; function: { name: string } }>;
}): Promise<{
  ares: typeof import("./ares.js");
  fetchCalls: FetchCall[];
  dbCalls: { setAresNotes: unknown[]; updateStatus: unknown[] };
  restore: () => void;
}> {
  const realClient = await import("./client.js");
  const realTools = await import("./tools.js");
  const realBacklog = await import("./supervision-backlog.js");

  const fakeClient = {
    chatRaw: opts.chatRaw,
    chat: async () => "",
    isConfigured: () => true,
    checkHealth: async () => ({ status: "ok", model: "devstral:test" }) as const,
  };

  const mClient = mock.module("./client.js", {
    namedExports: { ...realClient, createOllamaAgentClient: () => fakeClient },
  });
  const mTools = mock.module("./tools.js", {
    namedExports: {
      ...realTools,
      getHorusTools: async () => opts.horusTools ?? [],
      executeHorusTool: async () => "",
      capToolResult: (s: string) => s,
    },
  });

  const dbCalls = { setAresNotes: [] as unknown[], updateStatus: [] as unknown[] };
  const mBacklog = mock.module("./supervision-backlog.js", {
    namedExports: {
      ...realBacklog,
      getSupervisionBacklogItem: async () =>
        opts.item === undefined ? makeItem() : opts.item,
      setAresNotes: async (id: number, notes: string) => {
        dbCalls.setAresNotes.push({ id, notes });
        return makeItem({ aresNotes: notes });
      },
      updateBacklogStatus: async (id: number, status: string) => {
        dbCalls.updateStatus.push({ id, status });
        return makeItem({ status: status as SupervisionBacklogRow["status"] });
      },
    },
  });

  const fetchCalls: FetchCall[] = [];
  const resident = opts.residentModels ?? ["qwen3:4b", "qwen3:1.7b"];
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
    return { ok: true, json: async () => ({}), text: async () => "" } as Response;
  }) as typeof global.fetch;

  const ares = (await import(`./ares.js?t=${importCounter++}`)) as typeof import("./ares.js");
  return {
    ares,
    fetchCalls,
    dbCalls,
    restore: () => {
      mClient.restore();
      mTools.restore();
      mBacklog.restore();
      global.fetch = originalFetch;
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

test("happy path: sfratta la lineup, analizza (propose-only), unload Ares, ripristina", async () => {
  const { ares, fetchCalls, dbCalls, restore } = await setup({
    chatRaw: async () => ({ content: "Diagnosi + percorso A + percorso B + raccomandazione", toolCalls: [] }),
  });
  try {
    const result = await ares.runAresAnalysis(42);

    assert.equal(result.ok, true, result.error);
    assert.match(result.proposal ?? "", /percorso A/);
    assert.deepEqual(result.snapshot, ["qwen3:4b", "qwen3:1.7b"]);
    assert.deepEqual(result.restoreFailures, []);

    // Eviction della lineup + unload di Ares stesso (keep_alive:0).
    const unloaded = unloadModels(fetchCalls);
    assert.ok(unloaded.includes("qwen3:4b") && unloaded.includes("qwen3:1.7b"), "lineup sfrattata");
    assert.ok(unloaded.includes("devstral:test"), "Ares scaricato a fine ciclo");

    // Ripristino della lineup (keep_alive:-1) — Ares NON viene ri-warmato.
    const warmed = warmupModels(fetchCalls);
    assert.deepEqual(warmed.sort(), ["qwen3:1.7b", "qwen3:4b"]);
    assert.ok(!warmed.includes("devstral:test"), "Ares non deve restare residente");

    // Propose-only: le UNICHE mutazioni sono la nota di Ares + lo stato in_review.
    assert.equal(dbCalls.setAresNotes.length, 1);
    assert.deepEqual(dbCalls.updateStatus, [{ id: 42, status: "in_review" }]);

    // Lock rilasciato.
    assert.equal(ares.isAresRunning(), false);
  } finally {
    restore();
  }
});

test("il ripristino della lineup è tentato anche se l'analisi fallisce, e il lock si rilascia", async () => {
  const { ares, fetchCalls, dbCalls, restore } = await setup({
    chatRaw: async () => {
      throw new Error("devstral non risponde");
    },
  });
  try {
    const result = await ares.runAresAnalysis(42);

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /ciclo Ares fallito/);

    // Nonostante il fallimento, la lineup è stata ripristinata (finally).
    const warmed = warmupModels(fetchCalls).sort();
    assert.deepEqual(warmed, ["qwen3:1.7b", "qwen3:4b"]);

    // Nessuna proposta salvata, nessun avanzamento di stato.
    assert.equal(dbCalls.setAresNotes.length, 0);
    assert.equal(dbCalls.updateStatus.length, 0);

    // Lock rilasciato anche in errore.
    assert.equal(ares.isAresRunning(), false);
  } finally {
    restore();
  }
});

test("lock a ciclo singolo: un secondo trigger concorrente è respinto", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const { ares, restore } = await setup({
    chatRaw: async () => {
      await gate; // tiene il primo ciclo in corso finché non lo rilasciamo
      return { content: "proposta", toolCalls: [] };
    },
  });
  try {
    const run1 = ares.runAresAnalysis(42);
    // lascia che run1 superi il fetch della voce e alzi il lock
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ares.isAresRunning(), true, "il primo ciclo dovrebbe aver alzato il lock");

    const run2 = await ares.runAresAnalysis(43);
    assert.equal(run2.ok, false);
    assert.match(run2.error ?? "", /già in corso/);

    release();
    const result1 = await run1;
    assert.equal(result1.ok, true, result1.error);
    assert.equal(ares.isAresRunning(), false);
  } finally {
    restore();
  }
});

test("Ares riceve SOLO i tool read-only dell'allowlist (nessun mutatore)", async () => {
  // getHorusTools restituisce un mix di tool read-only, mutatori e un tool
  // "nuovo" sconosciuto: l'allowlist deve lasciar passare solo i read-only noti.
  const offered = [
    toolSpec("search_code"),
    toolSpec("git_log"),
    toolSpec("check_vram_usage"),
    toolSpec("remember_note"), // mutatore: scrive nella memoria
    toolSpec("save_file"), // mutatore: scrive un file
    toolSpec("write_pdf"), // mutatore: crea un pdf
    toolSpec("some_future_writer"), // sconosciuto: deve essere escluso di default
  ];
  let seenTools: string[] = [];
  const { ares, restore } = await setup({
    horusTools: offered,
    chatRaw: async (_history, opts) => {
      seenTools = (opts?.tools ?? []).map((t) => t.function.name);
      return { content: "Diagnosi + A + B + raccomandazione", toolCalls: [] };
    },
  });
  try {
    const result = await ares.runAresAnalysis(42);
    assert.equal(result.ok, true, result.error);

    // Nessun tool mutante o sconosciuto è arrivato al modello.
    for (const forbidden of ["remember_note", "save_file", "write_pdf", "some_future_writer"]) {
      assert.ok(!seenTools.includes(forbidden), `${forbidden} non deve essere offerto ad Ares`);
    }
    // I read-only noti sono passati.
    assert.deepEqual(seenTools.sort(), ["check_vram_usage", "git_log", "search_code"]);
  } finally {
    restore();
  }
});

test("due trigger concorrenti senza await in mezzo: il lock atomico ne fa entrare uno solo", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const { ares, fetchCalls, restore } = await setup({
    chatRaw: async () => {
      await gate;
      return { content: "proposta", toolCalls: [] };
    },
  });
  try {
    // Nessun await tra le due chiamate: run1 alza il lock in modo sincrono prima
    // di restituire la promise, così run2 viene respinto senza toccare la GPU.
    const run1 = ares.runAresAnalysis(42);
    const run2 = await ares.runAresAnalysis(43);

    assert.equal(run2.ok, false);
    assert.match(run2.error ?? "", /già in corso/);

    release();
    const result1 = await run1;
    assert.equal(result1.ok, true, result1.error);

    // Un solo ciclo ha sfrattato la lineup: qwen3:4b compare una volta sola.
    const evictions = unloadModels(fetchCalls).filter((m) => m === "qwen3:4b");
    assert.equal(evictions.length, 1, "solo un ciclo deve aver sfrattato la lineup");
    assert.equal(ares.isAresRunning(), false);
  } finally {
    restore();
  }
});

test("voce di backlog inesistente: errore, nessuna eviction", async () => {
  const { ares, fetchCalls, restore } = await setup({
    chatRaw: async () => ({ content: "x", toolCalls: [] }),
    item: null,
  });
  try {
    const result = await ares.runAresAnalysis(999);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /non trovata/);
    // Non deve aver toccato la GPU se la voce non esiste.
    assert.equal(unloadModels(fetchCalls).length, 0);
    assert.equal(ares.isAresRunning(), false);
  } finally {
    restore();
  }
});
