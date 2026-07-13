import assert from "node:assert/strict";
import { test } from "node:test";
import { createOllamaAgentClient, quebrachoChatRawResilient } from "./client.js";
import { getHorusTools } from "./tools.js";

/**
 * Regressione: quando il gateway/tunnel (Cloudflare) interrompe una
 * richiesta prima che Ollama risponda, la risposta non-OK arriva con uno
 * status tipico di gateway timeout (es. 524) e un corpo HTML invece di
 * testo/JSON da Ollama. Prima del fix questo HTML grezzo finiva incollato
 * nel messaggio d'errore e veniva mostrato così com'è in chat (web e CLI,
 * che condividono lo stesso `Error` lanciato da `chatRaw`).
 */

const HTML_ERROR_BODY =
  "<!DOCTYPE html><html><head><title>524: A timeout occurred</title></head><body>Cloudflare gateway timeout</body></html>";

function mockFetchResponse(t: import("node:test").TestContext, status: number, statusText: string, body: string) {
  t.mock.method(globalThis, "fetch", async () => {
    return new Response(body, { status, statusText });
  });
}

function makeTestClient() {
  return createOllamaAgentClient({
    agentName: "TestAgent",
    ollamaUrl: "https://ollama.example.test",
    model: "test-model",
    cfAccessClientId: undefined,
    cfAccessClientSecret: undefined,
    useHorusMemoryByDefault: false,
  });
}

test("chatRaw surfaces a friendly Italian message for a 524 gateway timeout with an HTML body", async (t) => {
  mockFetchResponse(t, 524, "A timeout occurred", HTML_ERROR_BODY);
  const client = makeTestClient();

  await assert.rejects(
    () => client.chatRaw([{ role: "user", content: "ciao" }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.doesNotMatch(err.message, /<!DOCTYPE|<html/i, "raw HTML must never reach the error message");
      assert.match(err.message, /524/, "should still reference the gateway status code");
      assert.match(
        err.message,
        /tunnel|tempo|riprova/i,
        "should contain a friendly Italian explanation, not the raw body"
      );
      return true;
    }
  );
});

test("chatRaw applies the same friendly rewrite for other gateway statuses (502/503/504) with HTML bodies", async (t) => {
  for (const status of [502, 503, 504]) {
    mockFetchResponse(t, status, "Bad Gateway", "<html><body>gateway error</body></html>");
    const client = makeTestClient();
    await assert.rejects(
      () => client.chatRaw([{ role: "user", content: "ciao" }]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /<html/i);
        return true;
      }
    );
  }
});

test("chatRaw still surfaces the real error message for non-HTML failures", async (t) => {
  mockFetchResponse(t, 401, "Unauthorized", JSON.stringify({ error: "invalid api key" }));
  const client = makeTestClient();

  await assert.rejects(
    () => client.chatRaw([{ role: "user", content: "ciao" }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /401/);
      assert.match(err.message, /invalid api key/);
      return true;
    }
  );
});

test("chatRaw does not rewrite a 500 with an HTML body (only known gateway-timeout statuses)", async (t) => {
  mockFetchResponse(t, 500, "Internal Server Error", "<html><body>internal error</body></html>");
  const client = makeTestClient();

  await assert.rejects(
    () => client.chatRaw([{ role: "user", content: "ciao" }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /500/);
      return true;
    }
  );
});

/**
 * Regressione (Task #197, Fase 2d): `quebrachoChatRawResilient` deve passare
 * alla riserva cloud SOLO quando (a) il TC non è raggiungibile/configurato e
 * (b) la riserva cloud stessa è configurata e (c) non sono richiesti tool
 * (niente parità di function-calling — vedi commento nel sorgente). In
 * QUALUNQUE altro caso il comportamento deve restare identico a
 * `quebrachoChatRaw` di sempre (nessuna regressione silenziosa quando la
 * riserva non è disponibile).
 *
 * Nota: gli env HORUS_OLLAMA_URL/QUEBRACHO_* possono risultare presenti in
 * modo incoerente nella sessione dell'agente (vedi gotcha in replit.md), per
 * cui questi test non assumono "not_configured": mockano `fetch` per
 * simulare un TC irraggiungibile (`unreachable`) in ogni scenario, così il
 * comportamento è deterministico indipendentemente da quali env var
 * risultino impostate in un dato momento. Il ramo "TC raggiungibile ma la
 * generazione fallisce a metà" condivide lo stesso codice di fallback di
 * "TC irraggiungibile" (stessa chiamata a `quebrachoCloudChatRaw`), quindi
 * la copertura qui vale per entrambi.
 */
function mockFetchUnreachable(t: import("node:test").TestContext) {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
}

test("quebrachoChatRawResilient falls through to the old error behavior when no cloud fallback is set up", async (t) => {
  delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  mockFetchUnreachable(t);

  await assert.rejects(
    () => quebrachoChatRawResilient([{ role: "user", content: "ciao" }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.doesNotMatch(err.message, /risposta dal cloud/i, "must never silently succeed via cloud");
      return true;
    }
  );
});

test("quebrachoChatRawResilient uses the cloud fallback when TC is not configured/reachable", async (t) => {
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = "https://openrouter.example.test";
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-key";
  t.after(() => {
    delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  });
  mockFetchUnreachable(t);

  async function* fakeStream() {
    yield { choices: [{ delta: { content: "risposta " } }] };
    yield { choices: [{ delta: { content: "dal cloud" } }] };
  }
  let createCalledWithModel: string | undefined;
  t.mock.module("@workspace/integrations-openrouter-ai", {
    namedExports: {
      openrouter: {
        chat: {
          completions: {
            create: async (body: { model: string }) => {
              createCalledWithModel = body.model;
              return fakeStream();
            },
          },
        },
      },
    },
  });

  const result = await quebrachoChatRawResilient([{ role: "user", content: "ciao" }]);
  assert.equal(result.content, "risposta dal cloud");
  assert.deepEqual(result.toolCalls, []);
  assert.equal(createCalledWithModel, "qwen/qwen3-coder:free");
});

test("quebrachoChatRawResilient uses the cloud fallback when options.tools is an empty array (real chat route shape)", async (t) => {
  // Regressione: la route reale (runChatTurn in artifacts/api-server) passa
  // sempre `tools: await getHorusTools(message)`, che per i messaggi senza
  // tool pertinenti è `[]` (array vuoto), non `undefined`. Un controllo tipo
  // `!options.tools` tratterebbe `[]` come "richiesti dei tool" perché un
  // array è sempre truthy, disabilitando il fallback cloud nel percorso di
  // chat reale — questo test lo blocca.
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = "https://openrouter.example.test";
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-key";
  t.after(() => {
    delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  });
  mockFetchUnreachable(t);

  async function* fakeStream() {
    yield { choices: [{ delta: { content: "risposta dal cloud" } }] };
  }
  t.mock.module("@workspace/integrations-openrouter-ai", {
    namedExports: {
      openrouter: {
        chat: {
          completions: {
            create: async () => fakeStream(),
          },
        },
      },
    },
  });

  const result = await quebrachoChatRawResilient([{ role: "user", content: "ciao" }], { tools: [] });
  assert.equal(result.content, "risposta dal cloud");
});

test("quebrachoChatRawResilient does NOT use the cloud fallback when tools are requested (no tool-call parity)", async (t) => {
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = "https://openrouter.example.test";
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-key";
  mockFetchUnreachable(t);
  try {
    await assert.rejects(
      () =>
        quebrachoChatRawResilient([{ role: "user", content: "ciao" }], {
          tools: [
            {
              type: "function",
              function: { name: "noop", description: "test", parameters: { type: "object", properties: {} } },
            },
          ],
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /risposta dal cloud/i, "must never silently succeed via cloud");
        return true;
      }
    );
  } finally {
    delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  }
});

/**
 * Test di integrazione end-to-end (Task #237): verifica che il percorso
 * completo getHorusTools(message) → quebrachoChatRawResilient(..., { tools })
 * non produca MAI una risposta cloud silenziosa quando il messaggio richiede
 * dei tool.
 *
 * La regressione che questi test proteggono: se la selezione dei tool
 * restituisce ≥1 voce ma l'array non viene passato correttamente a
 * quebrachoChatRawResilient (es. viene azzerato o ignorato), il fallback cloud
 * potrebbe rispondere silenziosamente senza eseguire alcun tool — l'utente
 * riceve una risposta vuota/inventata invece del risultato atteso (es. risultati
 * di ricerca web).
 *
 * Struttura comune:
 *  1. TC irraggiungibile (mockFetchUnreachable)
 *  2. Cloud configurato + mock openrouter che restituisce un sentinel
 *     riconoscibile ("silenzioso dal cloud") — se mai il cloud venisse
 *     raggiunto, l'asserzione lo rileva
 *  3. getHorusTools(message) → tools non vuoto
 *  4. quebrachoChatRawResilient(messages, { tools }) → DEVE lanciare
 */

/** Imposta il mock di OpenRouter con un sentinel riconoscibile e restituisce
 * il mock in modo che i test possano verificare se è stato effettivamente
 * invocato. */
function setupCloudFallbackEnv(t: import("node:test").TestContext): { wasCloudCalled(): boolean } {
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = "https://openrouter.example.test";
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-key";
  t.after(() => {
    delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  });

  let cloudCalled = false;
  async function* sentinelStream() {
    cloudCalled = true;
    yield { choices: [{ delta: { content: "silenzioso dal cloud" } }] };
  }
  t.mock.module("@workspace/integrations-openrouter-ai", {
    namedExports: {
      openrouter: {
        chat: {
          completions: {
            create: async () => sentinelStream(),
          },
        },
      },
    },
  });

  return { wasCloudCalled: () => cloudCalled };
}

/** Azzera le env var che potrebbero scatenare capability-check di rete
 * (sonar_scan) durante getHorusTools, così non interferiscono col mock fetch. */
function clearCapabilityEnv(t: import("node:test").TestContext) {
  const saved = {
    analysisUrl: process.env.HORUS_ANALYSIS_URL,
    analysisToken: process.env.ANALYSIS_GATE_TOKEN,
    nadirUrl: process.env.NADIR_URL,
    nadirToken: process.env.NADIR_GATE_TOKEN,
  };
  delete process.env.HORUS_ANALYSIS_URL;
  delete process.env.ANALYSIS_GATE_TOKEN;
  delete process.env.NADIR_URL;
  delete process.env.NADIR_GATE_TOKEN;
  t.after(() => {
    if (saved.analysisUrl !== undefined) process.env.HORUS_ANALYSIS_URL = saved.analysisUrl;
    if (saved.analysisToken !== undefined) process.env.ANALYSIS_GATE_TOKEN = saved.analysisToken;
    if (saved.nadirUrl !== undefined) process.env.NADIR_URL = saved.nadirUrl;
    if (saved.nadirToken !== undefined) process.env.NADIR_GATE_TOKEN = saved.nadirToken;
  });
}

test("integrazione: richiesta web — getHorusTools seleziona web_search e il cloud non risponde mai (TC down)", async (t) => {
  const message = "cerca online le ultime notizie MotoGP";
  clearCapabilityEnv(t);
  const cloud = setupCloudFallbackEnv(t);
  mockFetchUnreachable(t);

  const tools = await getHorusTools(message);
  assert.ok(
    tools.some((tool) => tool.function.name === "web_search"),
    "getHorusTools deve selezionare web_search per una richiesta web"
  );
  assert.ok(tools.length > 0, "la selezione deve essere non vuota");

  await assert.rejects(
    () => quebrachoChatRawResilient([{ role: "user", content: message }], { tools }),
    (err: unknown) => {
      assert.ok(err instanceof Error, "deve lanciare un errore, non rispondere silenziosamente");
      assert.doesNotMatch(
        err.message,
        /silenzioso dal cloud/i,
        "il cloud non deve mai essere raggiunto quando i tool sono non vuoti"
      );
      return true;
    }
  );

  assert.equal(cloud.wasCloudCalled(), false, "il mock OpenRouter non deve mai essere invocato");
});

test("integrazione: richiesta blog — getHorusTools seleziona read_blog e il cloud non risponde mai (TC down)", async (t) => {
  const message = "cosa ho scritto sul blog a proposito di enduro?";
  clearCapabilityEnv(t);
  const cloud = setupCloudFallbackEnv(t);
  mockFetchUnreachable(t);

  const tools = await getHorusTools(message);
  assert.ok(
    tools.some((tool) => tool.function.name === "read_blog"),
    "getHorusTools deve selezionare read_blog per una richiesta al blog"
  );
  assert.ok(tools.length > 0, "la selezione deve essere non vuota");

  await assert.rejects(
    () => quebrachoChatRawResilient([{ role: "user", content: message }], { tools }),
    (err: unknown) => {
      assert.ok(err instanceof Error, "deve lanciare un errore, non rispondere silenziosamente");
      assert.doesNotMatch(
        err.message,
        /silenzioso dal cloud/i,
        "il cloud non deve mai essere raggiunto quando i tool sono non vuoti"
      );
      return true;
    }
  );

  assert.equal(cloud.wasCloudCalled(), false, "il mock OpenRouter non deve mai essere invocato");
});

test("integrazione: richiesta di memoria — getHorusTools seleziona remember_note e il cloud non risponde mai (TC down)", async (t) => {
  const message = "ricorda che ho la patente A";
  clearCapabilityEnv(t);
  const cloud = setupCloudFallbackEnv(t);
  mockFetchUnreachable(t);

  const tools = await getHorusTools(message);
  assert.ok(
    tools.some((tool) => tool.function.name === "remember_note"),
    "getHorusTools deve selezionare remember_note per una richiesta di memoria"
  );
  assert.ok(tools.length > 0, "la selezione deve essere non vuota");

  await assert.rejects(
    () => quebrachoChatRawResilient([{ role: "user", content: message }], { tools }),
    (err: unknown) => {
      assert.ok(err instanceof Error, "deve lanciare un errore, non rispondere silenziosamente");
      assert.doesNotMatch(
        err.message,
        /silenzioso dal cloud/i,
        "il cloud non deve mai essere raggiunto quando i tool sono non vuoti"
      );
      return true;
    }
  );

  assert.equal(cloud.wasCloudCalled(), false, "il mock OpenRouter non deve mai essere invocato");
});
