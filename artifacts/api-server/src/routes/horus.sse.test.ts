import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import type { HorusMessage, HorusRawResult, HorusChatOptions } from "@workspace/horus";
import { createDirectChatHandler } from "./horus.js";

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

async function startTestServer(chatRaw: FakeChatRawController["chatRaw"]): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
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
