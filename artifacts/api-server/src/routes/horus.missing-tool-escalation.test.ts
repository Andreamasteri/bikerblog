import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import type { HorusMessage, HorusRawResult, HorusChatOptions, OllamaAgentHealth } from "@workspace/horus";
import { createDirectChatHandler } from "./horus.js";

/**
 * Copertura per Task #179: se il modello dichiara di aver bisogno di un tool
 * che la selezione contestuale (Task #178) non aveva allegato, il turno deve
 * essere rieseguito automaticamente con l'intero set di tool, SENZA mostrare
 * all'utente né il tag interno `[TOOL_MANCANTE: ...]` né il tentativo
 * fallito — solo la risposta finale della riprova.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-sse-smoke-check";

interface FakeChatRawController {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  callCount: number;
}

/** Prima chiamata: streamma SOLO il sentinel (nessun altro testo). Seconda
 * chiamata (la riprova): streamma una risposta reale normale. */
function makeSentinelThenRealReplyChatRaw(sentinel: string, realReply: string): FakeChatRawController {
  const controller: FakeChatRawController = {
    callCount: 0,
    chatRaw: async (_messages, options = {}) => {
      controller.callCount++;
      const text = controller.callCount === 1 ? sentinel : realReply;
      for (const ch of text) {
        options.onToken?.(ch);
      }
      return { content: text, toolCalls: [] };
    },
  };
  return controller;
}

async function startTestServer(
  chatRaw: FakeChatRawController["chatRaw"],
  checkHealth: () => Promise<OllamaAgentHealth> = async () => ({ status: "ok", model: "test-model" })
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  // In produzione `req.log` è attaccato da pino-http; qui basta un no-op.
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, () => void> }).log = {
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    next();
  });
  app.post(
    "/test/chat",
    express.json(),
    createDirectChatHandler({
      agentName: "TestAgent",
      systemPrompt: { role: "system", content: "test" },
      chatRaw,
      isConfigured: () => true,
      checkHealth,
      notConfiguredMessage: "not configured",
      logLabel: "test chat failed",
    })
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/test/chat`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function collectSseEvents(
  res: http.IncomingMessage,
  opts: { onEvent: (event: string, data: unknown) => void }
): Promise<void> {
  let buffer = "";
  for await (const chunk of res) {
    buffer += (chunk as Buffer).toString("utf8");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine && dataLine) {
        opts.onEvent(eventLine.slice("event: ".length), JSON.parse(dataLine.slice("data: ".length)));
      }
    }
  }
}

async function postChat(url: string, message: string): Promise<Array<{ event: string; data: unknown }>> {
  const events: Array<{ event: string; data: unknown }> = [];
  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Horus-Password": process.env["HORUS_CHAT_PASSWORD"]!,
        },
      },
      (res) => {
        collectSseEvents(res, { onEvent: (event, data) => events.push({ event, data }) })
          .then(resolve)
          .catch(reject);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify({ message, history: [] }));
  });
  return events;
}

test("missing-tool sentinel triggers one silent retry with the full tool set", async () => {
  const fake = makeSentinelThenRealReplyChatRaw(
    "[TOOL_MANCANTE: github_read]",
    "Ecco la risposta vera, ottenuta dopo la riprova."
  );
  const server = await startTestServer(fake.chatRaw);

  try {
    const events = await postChat(server.url, "raccontami qualcosa di insolito");

    assert.equal(fake.callCount, 2, "expected the handler to retry exactly once after the sentinel");

    const tokenText = events
      .filter((e) => e.event === "token")
      .map((e) => (e.data as { token: string }).token)
      .join("");
    assert.ok(
      !tokenText.includes("TOOL_MANCANTE"),
      `the internal sentinel must never reach the client, got tokens: ${JSON.stringify(tokenText)}`
    );

    const done = events.find((e) => e.event === "done");
    assert.ok(done, "expected a final done event");
    assert.equal(
      (done!.data as { content: string }).content,
      "Ecco la risposta vera, ottenuta dopo la riprova."
    );
  } finally {
    await server.close();
  }
});

test("a normal reply that never mentions the sentinel is streamed once, unmodified", async () => {
  const fake = makeSentinelThenRealReplyChatRaw("(sentinel mai usato)", "risposta normale al primo colpo");
  // Forziamo la prima risposta a essere quella "normale": nessun sentinel in gioco.
  fake.callCount = 0;
  const realOnlyChatRaw: FakeChatRawController["chatRaw"] = async (messages, options) => {
    fake.callCount++;
    const text = "risposta normale al primo colpo";
    for (const ch of text) options?.onToken?.(ch);
    return { content: text, toolCalls: [] };
  };
  const server = await startTestServer(realOnlyChatRaw);

  try {
    const events = await postChat(server.url, "ciao");

    assert.equal(fake.callCount, 1, "no retry should happen when the model never signals a missing tool");
    const done = events.find((e) => e.event === "done");
    assert.equal((done!.data as { content: string }).content, "risposta normale al primo colpo");
  } finally {
    await server.close();
  }
});

test("a reply that happens to start with '[' but isn't the sentinel is streamed normally", async () => {
  const text = "[nota] questa risposta inizia con una parentesi quadra ma non è il sentinel";
  let callCount = 0;
  const chatRaw: FakeChatRawController["chatRaw"] = async (_messages, options) => {
    callCount++;
    for (const ch of text) options?.onToken?.(ch);
    return { content: text, toolCalls: [] };
  };
  const server = await startTestServer(chatRaw);

  try {
    const events = await postChat(server.url, "domanda qualsiasi");

    assert.equal(callCount, 1, "a false-positive '[' prefix must not trigger a retry");
    const done = events.find((e) => e.event === "done");
    assert.equal((done!.data as { content: string }).content, text);
  } finally {
    await server.close();
  }
});
