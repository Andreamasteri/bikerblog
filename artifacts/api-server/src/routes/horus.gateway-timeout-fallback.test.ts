import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import {
  OllamaGatewayTimeoutError,
  type HorusMessage,
  type HorusRawResult,
  type HorusChatOptions,
} from "@workspace/horus";

/**
 * Regressione (Task #171): la chat Horus/Bowie "si bloccava dopo il primo
 * messaggio" perché il 2° messaggio innescava un tool, e il prefill del prompt
 * post-tool superava il tetto ~100s del tunnel Cloudflare → HTTP 524 (vero,
 * confermato dai log di produzione). Ora `createDirectChatHandler`, quando il
 * turno con i tool fallisce con un timeout del gateway, riprova UNA volta senza
 * tool e col prompt pulito, così l'utente ottiene comunque una risposta
 * best-effort invece di un errore secco.
 *
 * Questi test guidano l'handler reale con un `chatRaw` finto (iniettato via
 * `DirectChatAgentConfig`, quindi senza `mock.module`), su un vero server HTTP
 * come in `horus.multi-tool-budget.test.ts`, e verificano che:
 *  - un gateway-timeout nel giro-tool produca comunque un evento `done` (con la
 *    risposta del fallback), e che il fallback sia chiamato SENZA tool;
 *  - se anche il fallback fallisce, l'utente riceva un evento `error`, non un
 *    `done` fasullo.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-gateway-timeout-fallback";

async function startTestServer(
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createDirectChatHandler } = await import("./horus.js");
  const app = express();
  // In produzione `req.log` è attaccato da pino-http; qui basta un no-op perché
  // il fallback logga un warn e il catch esterno un error.
  app.use((req, _res, next) => {
    const noop = () => {};
    (req as unknown as { log: Record<string, () => void> }).log = {
      warn: noop,
      error: noop,
      info: noop,
      debug: noop,
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

async function runChatRequest(url: string): Promise<Array<{ event: string; data: unknown }>> {
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
    req.end(JSON.stringify({ message: "domanda che innesca un tool", history: [] }));
  });
  return events;
}

test("un gateway timeout nel giro-tool ripiega su una risposta senza tool (evento done, non error)", async () => {
  const calls: Array<{ hadTools: boolean }> = [];
  const chatRaw = async (
    _messages: HorusMessage[],
    options: HorusChatOptions = {}
  ): Promise<HorusRawResult> => {
    const hadTools = Boolean(options.tools && options.tools.length > 0);
    calls.push({ hadTools });
    // Primo tentativo (con tool): simula l'HTTP 524 del tunnel Cloudflare.
    if (hadTools) {
      throw new OllamaGatewayTimeoutError("timeout del gateway, HTTP 524", 524);
    }
    // Fallback (senza tool): risponde in fretta con un best-effort.
    return { content: "Risposta di riserva senza strumenti.", toolCalls: [] };
  };

  const server = await startTestServer(chatRaw);
  try {
    const events = await runChatRequest(server.url);

    assert.equal(calls.length, 2, "deve esserci un tentativo con tool + un fallback senza tool");
    assert.equal(calls[0]!.hadTools, true, "il primo tentativo usa i tool");
    assert.equal(calls[1]!.hadTools, false, "il fallback deve girare SENZA tool");

    const errorEvent = events.find((e) => e.event === "error");
    assert.equal(errorEvent, undefined, `non deve esserci un evento error: ${JSON.stringify(errorEvent)}`);

    const doneEvent = events.find((e) => e.event === "done");
    assert.ok(doneEvent, `atteso un evento done, ricevuti: ${events.map((e) => e.event).join(", ")}`);
    assert.equal(
      (doneEvent!.data as { content: string }).content,
      "Risposta di riserva senza strumenti."
    );
  } finally {
    await server.close();
  }
});

test("se anche il fallback senza-tool fallisce, l'utente riceve un evento error", async () => {
  const chatRaw = async (
    _messages: HorusMessage[],
    _options: HorusChatOptions = {}
  ): Promise<HorusRawResult> => {
    // Sia il primo tentativo (con tool) sia il fallback (senza tool) muoiono
    // per timeout del tunnel: non c'è modo di produrre una risposta.
    throw new OllamaGatewayTimeoutError("timeout del gateway, HTTP 524", 524);
  };

  const server = await startTestServer(chatRaw);
  try {
    const events = await runChatRequest(server.url);

    const doneEvent = events.find((e) => e.event === "done");
    assert.equal(doneEvent, undefined, "non deve esserci un done se anche il fallback fallisce");

    const errorEvent = events.find((e) => e.event === "error");
    assert.ok(errorEvent, `atteso un evento error, ricevuti: ${events.map((e) => e.event).join(", ")}`);
    assert.match(
      (errorEvent!.data as { message: string }).message,
      /524|gateway|tunnel/i,
      "il messaggio d'errore finale deve spiegare il timeout del tunnel"
    );
  } finally {
    await server.close();
  }
});
