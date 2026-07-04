import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import {
  OllamaGatewayTimeoutError,
  type HorusMessage,
  type HorusRawResult,
  type HorusChatOptions,
  type OllamaAgentHealth,
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
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>,
  checkHealth: () => Promise<OllamaAgentHealth> = async () => ({ status: "ok", model: "test-model" })
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createDirectChatHandler, __clearDirectReplyCacheForTests } = await import("./horus.js");
  // Task #185: azzera la cache best-effort delle risposte tra un test e
  // l'altro (tutti usano lo stesso agente/messaggio: senza reset il 2° test
  // troverebbe la risposta del 1° in cache e salterebbe la generazione).
  __clearDirectReplyCacheForTests();
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

async function runChatRequest(
  url: string,
  // Messaggio che, con la selezione contestuale dei tool (Task #178), allega
  // davvero un tool (web_search): serve al primo test per esercitare il ramo
  // "tentativo con tool → 524 → fallback senza tool". I test #176 passano un
  // body esplicito e non dipendono da questo default.
  body: unknown = { message: "cerca online le ultime notizie", history: [] }
): Promise<Array<{ event: string; data: unknown }>> {
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
    req.end(JSON.stringify(body));
  });
  return events;
}

/** chatRaw finto per i test #176: il primo tentativo (con tool) lancia sempre
 * un gateway timeout 524; il secondo (il fallback senza tool) o scade a sua
 * volta o risponde, a seconda di `fallback`. Registra ogni chiamata così i
 * test possono ispezionare il prompt e le opzioni del fallback. */
function makeGatewayTimeoutThenFake(opts: { fallback: "timeout" | "success" }): {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  calls: Array<{ messages: HorusMessage[]; options: HorusChatOptions }>;
} {
  const calls: Array<{ messages: HorusMessage[]; options: HorusChatOptions }> = [];
  return {
    calls,
    chatRaw: async (messages, options = {}) => {
      calls.push({ messages, options });
      if (calls.length === 1) {
        throw new OllamaGatewayTimeoutError("gateway timeout with tools", 524);
      }
      if (opts.fallback === "timeout") {
        throw new OllamaGatewayTimeoutError("gateway timeout fallback", 524);
      }
      options.onToken?.("ok-fallback");
      return { content: "risposta di fallback", toolCalls: [] };
    },
  };
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

/**
 * Regressione Task #176 — "il fallback-senza-tool scade a sua volta".
 *
 * Il Task #171 (sopra) aggiungeva il retry-senza-tool, ma in produzione il
 * fallback scadeva a sua volta: tentativo con-tool 524 (~125s) + fallback 524
 * (~125s) = l'utente aspettava ~250s per lo stesso errore generico. Il fix:
 * prima del fallback un ping veloce di raggiungibilità (se il server è giù,
 * niente secondo round-trip → fail veloce), e se è raggiungibile un retry con
 * prompt MINIMO (niente cronologia) e un timeout dedicato ben sotto il tetto
 * ~100s del tunnel, così un fallback destinato a fallire si arrende in fretta
 * con un messaggio chiaro.
 */

test("Task #176: gateway timeout + agente non raggiungibile → fail veloce senza un secondo round-trip", async () => {
  // Il fallback SAREBBE un successo, ma non deve nemmeno essere tentato: il
  // ping dice che l'agente è irraggiungibile, quindi niente seconda attesa.
  const fake = makeGatewayTimeoutThenFake({ fallback: "success" });
  const server = await startTestServer(fake.chatRaw, async () => ({
    status: "unreachable",
    detail: "HTTP 000",
  }));

  try {
    const events = await runChatRequest(server.url, { message: "ciao", history: [] });

    assert.equal(
      fake.calls.length,
      1,
      "il fallback deve essere SALTATO quando il ping di raggiungibilità fallisce (niente seconda attesa piena)"
    );
    const errorEvent = events.find((e) => e.event === "error");
    assert.ok(errorEvent, `atteso un evento "error", ricevuti: ${events.map((e) => e.event).join(", ")}`);
    assert.match(
      (errorEvent!.data as { message?: string }).message ?? "",
      /sovraccarico o troppo lento/,
      "atteso il messaggio chiaro di sovraccarico, non un timeout grezzo"
    );
    assert.ok(!events.some((e) => e.event === "done"), "nessun evento done sul fail veloce");
  } finally {
    await server.close();
  }
});

test("Task #176: gateway timeout due volte → fallback con timeout limitato e un solo errore chiaro", async () => {
  const fake = makeGatewayTimeoutThenFake({ fallback: "timeout" });
  const server = await startTestServer(fake.chatRaw);

  try {
    const events = await runChatRequest(server.url, { message: "ciao", history: [] });

    assert.equal(
      fake.calls.length,
      2,
      "atteso esattamente un fallback senza-tool dopo il 524 con i tool"
    );
    const fallbackOptions = fake.calls[1]!.options;
    assert.ok(
      typeof fallbackOptions.timeoutMs === "number" && fallbackOptions.timeoutMs <= 60_000,
      `il fallback deve usare un timeout limitato ben sotto il tetto ~100s del tunnel, ricevuto ${String(
        fallbackOptions.timeoutMs
      )}`
    );
    const errorEvents = events.filter((e) => e.event === "error");
    assert.equal(errorEvents.length, 1, "esattamente un evento error chiaro (niente doppio errore generico)");
    assert.match(
      (errorEvents[0]!.data as { message?: string }).message ?? "",
      /sovraccarico o troppo lento/
    );
    assert.ok(!events.some((e) => e.event === "done"), "nessun done quando anche il fallback fallisce");
  } finally {
    await server.close();
  }
});

test("Task #176: gateway timeout con tool → fallback senza tool con prompt MINIMO (niente cronologia)", async () => {
  const fake = makeGatewayTimeoutThenFake({ fallback: "success" });
  const server = await startTestServer(fake.chatRaw);

  try {
    const events = await runChatRequest(server.url, {
      message: "ciao",
      history: [
        { role: "user", content: "vecchio-messaggio-1" },
        { role: "assistant", content: "vecchia-risposta-1" },
      ],
    });

    assert.equal(fake.calls.length, 2);
    const fallbackMessages = fake.calls[1]!.messages;
    assert.equal(
      fallbackMessages.length,
      2,
      `il prompt di fallback deve essere minimo (system + user), ricevuti ${fallbackMessages.length} messaggi`
    );
    assert.equal(fallbackMessages[0]!.role, "system");
    assert.equal(fallbackMessages[1]!.role, "user");
    assert.equal(fallbackMessages[1]!.content, "ciao");
    assert.ok(
      !fallbackMessages.some(
        (m) => m.content.includes("vecchio-messaggio") || m.content.includes("vecchia-risposta")
      ),
      "il prompt di fallback NON deve trascinarsi la cronologia (tiene il prefill minimo)"
    );
    const doneEvent = events.find((e) => e.event === "done");
    assert.ok(doneEvent, "atteso un evento done quando il fallback riesce");
    assert.match((doneEvent!.data as { content?: string }).content ?? "", /fallback/);
  } finally {
    await server.close();
  }
});
