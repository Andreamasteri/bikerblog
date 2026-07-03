import assert from "node:assert/strict";
import { test } from "node:test";
import { createOllamaAgentClient } from "./client.js";

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
