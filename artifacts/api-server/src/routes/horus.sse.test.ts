import assert from "node:assert/strict";
import http from "node:http";
import { test, beforeEach } from "node:test";
import express from "express";
import type {
  HorusMessage,
  HorusRawResult,
  HorusChatOptions,
  OllamaAgentHealth,
} from "@workspace/horus";
import { createDirectChatHandler, __clearDirectReplyCacheForTests } from "./horus.js";

// Task #185: la cache best-effort delle risposte è a livello di modulo e i test
// usano tutti lo stesso agente + messaggio ("ciao") + cronologia vuota. Senza
// reset, il 2° test troverebbe la risposta del 1° in cache e salterebbe del
// tutto la generazione (nessun token, nessun abort), falsando l'asserzione.
beforeEach(() => {
  __clearDirectReplyCacheForTests();
});

/**
 * Regressione: /horus/chat, /horus/bowie-chat e /horus/bowie-conversation
 * devono abortire la generazione SOLO quando il client si disconnette
 * davvero (connessione TCP chiusa), non quando express.json() ha finito di
 * leggere il body della richiesta.
 *
 * Il bug storico: il codice ascoltava `req.on("close")` invece di
 * `res.on("close")`. `req` (IncomingMessage) emette "close" quasi subito
 * dopo che il body è stato consumato — molto prima che il client si
 * disconnetta — abortendo silenziosamente ogni chat SSE prima ancora del
 * primo token. Questo test usa un vero server HTTP (non mock) perché il bug
 * dipende dal comportamento reale di Node su req vs res, non riproducibile
 * con oggetti finti.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-sse-smoke-check";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeChatRawController {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  lastSignal: AbortSignal | undefined;
}

function makeFakeChatRaw(opts: { tokenCount: number; tokenDelayMs: number }): FakeChatRawController {
  const controller: FakeChatRawController = {
    lastSignal: undefined,
    chatRaw: async (_messages, options = {}) => {
      controller.lastSignal = options.signal;
      let emitted = 0;
      for (let i = 0; i < opts.tokenCount; i++) {
        if (options.signal?.aborted) break;
        await sleep(opts.tokenDelayMs);
        if (options.signal?.aborted) break;
        options.onToken?.(`tok${i}`);
        emitted++;
      }
      return { content: emitted > 0 ? "final-reply" : "", toolCalls: [] };
    },
  };
  return controller;
}

async function startTestServer(
  chatRaw: FakeChatRawController["chatRaw"],
  checkHealth: () => Promise<OllamaAgentHealth> = async () => ({ status: "ok", model: "test-model" })
): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  // In produzione `req.log` è attaccato da pino-http; qui basta un no-op.
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

/** Legge gli eventi SSE (`event: ...\ndata: ...\n\n`) man mano che arrivano. */
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

test("SSE chat handler streams real events instead of aborting immediately after the body is read", async () => {
  const fake = makeFakeChatRaw({ tokenCount: 3, tokenDelayMs: 50 });
  const server = await startTestServer(fake.chatRaw);

  try {
    const events: Array<{ event: string; data: unknown }> = [];
    let signalAbortedAtFirstToken: boolean | undefined;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        server.url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Horus-Password": process.env["HORUS_CHAT_PASSWORD"]!,
          },
        },
        (res) => {
          collectSseEvents(res, {
            onEvent: (event, data) => {
              if (event === "token" && signalAbortedAtFirstToken === undefined) {
                // Punto chiave della regressione: se il codice ascoltasse
                // req.on("close") invece di res.on("close"), il segnale
                // sarebbe già aborted qui (il body è già stato letto da
                // express.json prima che l'handler partisse).
                signalAbortedAtFirstToken = fake.lastSignal?.aborted ?? true;
              }
              events.push({ event, data });
            },
          })
            .then(resolve)
            .catch(reject);
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ message: "ciao", history: [] }));
    });

    const eventNames = events.map((e) => e.event);
    assert.ok(
      eventNames.includes("token"),
      `expected at least one "token" event, got: ${eventNames.join(", ") || "(none)"}`
    );
    assert.equal(
      signalAbortedAtFirstToken,
      false,
      "abort signal was already aborted by the time the first token arrived — the request-body-read is being " +
        "mistaken for a client disconnect (req.on('close') regression)"
    );
    assert.ok(eventNames.includes("done"), `expected a final "done" event, got: ${eventNames.join(", ")}`);
  } finally {
    await server.close();
  }
});

test("SSE chat handler still aborts generation when the client actually disconnects", async () => {
  const fake = makeFakeChatRaw({ tokenCount: 20, tokenDelayMs: 50 });
  const server = await startTestServer(fake.chatRaw);

  try {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        server.url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Horus-Password": process.env["HORUS_CHAT_PASSWORD"]!,
          },
        },
        (res) => {
          let firstTokenSeen = false;
          collectSseEvents(res, {
            onEvent: (event) => {
              if (event === "token" && !firstTokenSeen) {
                firstTokenSeen = true;
                // Il client si disconnette davvero a metà stream.
                req.destroy();
              }
            },
          })
            .then(resolve)
            .catch(() => resolve());
        }
      );
      req.on("error", () => resolve());
      req.end(JSON.stringify({ message: "ciao", history: [] }));
    });

    await sleep(150);
    assert.equal(
      fake.lastSignal?.aborted,
      true,
      "a real client disconnect should still abort generation via res.on('close')"
    );
  } finally {
    await server.close();
  }
});

/** Legge una richiesta completa e ritorna tutti gli eventi SSE. */
function runFullChatRequest(
  url: string,
  body: unknown
): Promise<Array<{ event: string; data: unknown }>> {
  return new Promise((resolve, reject) => {
    const events: Array<{ event: string; data: unknown }> = [];
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
          .then(() => resolve(events))
          .catch(reject);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("Task #185: an identical follow-up request is served from cache without re-generating", async () => {
  // chatRaw che conta quante volte viene davvero invocato: la seconda
  // richiesta identica NON deve rigenerare (deve arrivare dalla cache).
  let calls = 0;
  const chatRaw = (async (_messages, options = {}) => {
    calls++;
    options.onToken?.("tok");
    return { content: "risposta-generata", toolCalls: [] };
  }) as Parameters<typeof startTestServer>[0];

  const server = await startTestServer(chatRaw);
  try {
    const body = { message: "domanda unica del test cache", history: [] };

    const first = await runFullChatRequest(server.url, body);
    const firstDone = first.find((e) => e.event === "done");
    assert.ok(firstDone, "prima richiesta: atteso un evento done");
    assert.equal((firstDone!.data as { content: string }).content, "risposta-generata");
    assert.equal(calls, 1, "la prima richiesta deve generare (1 chiamata a chatRaw)");

    const second = await runFullChatRequest(server.url, body);
    const secondDone = second.find((e) => e.event === "done");
    assert.ok(secondDone, "seconda richiesta: atteso un evento done dalla cache");
    assert.equal(
      (secondDone!.data as { content: string }).content,
      "risposta-generata",
      "la risposta dalla cache deve essere identica a quella generata"
    );
    assert.equal(
      calls,
      1,
      "la seconda richiesta identica NON deve rigenerare: deve arrivare dalla cache (chatRaw invariato)"
    );
    // Servita dalla cache: nessun token in streaming, solo il done finale.
    assert.ok(
      !second.some((e) => e.event === "token"),
      "una risposta dalla cache non deve ri-streammare i token, solo emettere done"
    );
  } finally {
    await server.close();
  }
});
