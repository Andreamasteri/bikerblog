import assert from "node:assert/strict";
import { test } from "node:test";
import { createOllamaAgentClient, quebrachoChatRawResilient } from "./client.js";

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
