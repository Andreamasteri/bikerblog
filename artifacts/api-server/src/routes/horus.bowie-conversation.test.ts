import assert from "node:assert/strict";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import express from "express";
import pinoHttp from "pino-http";
import type { HorusMessage, HorusRawResult, HorusChatOptions } from "@workspace/horus";
import { createBowieConversationHandler, type BowieConversationDeps, type ConvoAgentConfig } from "./horus.js";

/**
 * Regressione per il flusso "retry dopo dropout" di /horus/bowie-conversation
 * (vedi Task #126): l'evento `error` deve portare con sé l'agente che stava
 * rispondendo a metà turno più la trascrizione già completata, e una
 * richiesta successiva con `resumeTranscript` deve continuare l'alternanza
 * dei turni dal punto giusto (non ripartire da Horus). Un refactor futuro del
 * loop dei turni potrebbe rompere silenziosamente una di queste due cose
 * senza che nessun test se ne accorga.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-bowie-conversation";

type ConvoAgent = "horus" | "bowie";

function makeScriptedChatRaw(
  replies: Array<{ content: string } | { throws: string }>
): (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult> {
  let call = 0;
  return async (_messages, _options = {}) => {
    const reply = replies[call];
    call++;
    if (!reply) {
      throw new Error("scripted chatRaw called more times than expected");
    }
    if ("throws" in reply) {
      throw new Error(reply.throws);
    }
    return { content: reply.content, toolCalls: [] };
  };
}

interface SlowChatRawController {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  lastSignal: AbortSignal | undefined;
  callCount: number;
}

/**
 * Simula un turno che resta "in volo" fino a quando il segnale non viene
 * abortito (o scade un timeout di sicurezza) — serve a riprodurre un
 * disconnect reale del client a metà del PRIMO turno, prima che quel turno
 * abbia mai emesso `turn_end`.
 */
function makeSlowChatRaw(opts: { onToken?: () => void } = {}): SlowChatRawController {
  const controller: SlowChatRawController = {
    lastSignal: undefined,
    callCount: 0,
    chatRaw: async (_messages, options = {}) => {
      controller.callCount++;
      controller.lastSignal = options.signal;
      options.onToken?.("tok0");
      opts.onToken?.();
      // Attende l'abort, ma con un tetto massimo di sicurezza: se il wiring
      // dell'abort dovesse regredire, il test deve fallire deterministicamente
      // invece di restare appeso per sempre.
      const deadline = Date.now() + 5_000;
      while (!options.signal?.aborted && Date.now() < deadline) {
        await sleep(10);
      }
      return { content: "", toolCalls: [] };
    },
  };
  return controller;
}

/** chatRaw che non dovrebbe mai essere invocato: fallisce il test se lo è. */
function makeUncalledChatRaw(
  label: string
): { chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>; callCount: number } {
  const state = { callCount: 0 };
  return {
    get callCount() {
      return state.callCount;
    },
    chatRaw: async () => {
      state.callCount++;
      throw new Error(`${label} chatRaw should never be called after a mid-turn client disconnect`);
    },
  };
}

function makeDeps(overrides: Partial<BowieConversationDeps>): BowieConversationDeps {
  const savedConversations: Array<{
    topic: string;
    transcript: unknown;
    status: "complete" | "interrupted";
    conversationId?: number;
  }> = [];
  let nextId = 1;
  return {
    horusChatRaw: makeScriptedChatRaw([{ content: "horus-default" }]),
    bowieChatRaw: makeScriptedChatRaw([{ content: "bowie-default" }]),
    isBowieConfigured: () => true,
    saveBowieConversation: async (topic, transcript, options) => {
      const id = options.conversationId ?? nextId++;
      savedConversations.push({ topic, transcript, status: options.status, conversationId: id });
      return id;
    },
    ...overrides,
  };
}

async function startTestServer(deps: BowieConversationDeps): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.post("/test/bowie-conversation", express.json(), createBowieConversationHandler(deps));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/test/bowie-conversation`,
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

async function postConversation(
  url: string,
  body: Record<string, unknown>
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
        collectSseEvents(res, {
          onEvent: (event, data) => events.push({ event, data }),
        })
          .then(resolve)
          .catch(reject);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
  return events;
}

async function postConversationRaw(
  url: string,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolve, reject) => {
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
        let raw = "";
        res.on("data", (chunk) => (raw += chunk.toString("utf8")));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: raw }));
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("bowie-conversation attributes a mid-turn error to the agent that was speaking and includes the transcript so far", async () => {
  // Turno 0 (Horus) risponde normalmente, turno 1 (Bowie) esplode a metà.
  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw([{ content: "Ciao, io sono Horus." }]),
    bowieChatRaw: makeScriptedChatRaw([{ throws: "tunnel dropped" }]),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, { topic: "moto elettriche", maxTurns: 4 });

    const turnEndEvents = events.filter((e) => e.event === "turn_end");
    assert.equal(turnEndEvents.length, 1, "only Horus's turn should have completed before Bowie's failure");
    assert.deepEqual(turnEndEvents[0]!.data, { agent: "horus", content: "Ciao, io sono Horus." });

    const errorEvent = events.find((e) => e.event === "error");
    assert.ok(errorEvent, `expected an "error" event, got: ${events.map((e) => e.event).join(", ")}`);
    const errorData = errorEvent!.data as { agent?: ConvoAgent; message?: string; transcript?: unknown };

    assert.equal(errorData.agent, "bowie", "error must be attributed to the agent that was mid-turn (Bowie), not Horus");
    assert.ok(
      typeof errorData.message === "string" && errorData.message.includes("tunnel dropped"),
      `error message should surface the underlying failure, got: ${errorData.message}`
    );
    assert.deepEqual(
      errorData.transcript,
      [{ agent: "horus", content: "Ciao, io sono Horus." }],
      "error event must carry the transcript completed before the dropout, not an empty one"
    );

    // Non deve esserci un evento "done" dopo un errore.
    assert.ok(!events.some((e) => e.event === "done"), "a failed run must not also emit done");
  } finally {
    await server.close();
  }
});

test("bowie-conversation resumes turn alternation from resumeTranscript instead of restarting from Horus", async () => {
  // Il client ripassa una trascrizione di 2 turni già completati (Horus poi
  // Bowie): il prossimo turno atteso è di nuovo Horus (turno index 2, pari),
  // seguito da Bowie (turno index 3).
  const resumeTranscript = [
    { agent: "horus", content: "Prima battuta di Horus." },
    { agent: "bowie", content: "Prima replica di Bowie." },
  ];

  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw([{ content: "Seconda battuta di Horus." }]),
    bowieChatRaw: makeScriptedChatRaw([{ content: "Seconda replica di Bowie." }]),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, {
      topic: "moto elettriche",
      maxTurns: 4,
      resumeTranscript,
    });

    const turnStarts = events.filter((e) => e.event === "turn_start").map((e) => (e.data as { agent: string }).agent);
    assert.deepEqual(
      turnStarts,
      ["horus", "bowie"],
      "resuming after 2 completed turns must continue alternation (horus, bowie), not restart from horus at index 0"
    );

    const turnEnds = events.filter((e) => e.event === "turn_end").map((e) => e.data);
    assert.deepEqual(turnEnds, [
      { agent: "horus", content: "Seconda battuta di Horus." },
      { agent: "bowie", content: "Seconda replica di Bowie." },
    ]);

    assert.ok(events.some((e) => e.event === "done"), "conversation should complete successfully after resuming");
  } finally {
    await server.close();
  }
});

test("bowie-conversation rejects a resumeTranscript with a broken alternation instead of scrambling turn attribution", async () => {
  // Trascrizione manomessa/corrotta: due turni "horus" di fila. Se il server
  // si fidasse solo di `transcript.length % 2`, continuerebbe silenziosamente
  // ad alternare da lì (bowie, poi horus...) su un presupposto già sbagliato.
  const malformedResumeTranscript = [
    { agent: "horus", content: "Prima battuta di Horus." },
    { agent: "horus", content: "Seconda battuta, ma di nuovo Horus." },
  ];

  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw([{ content: "non dovrebbe mai essere chiamato" }]),
    bowieChatRaw: makeScriptedChatRaw([{ content: "non dovrebbe mai essere chiamato" }]),
  });
  const server = await startTestServer(deps);

  try {
    const response = await postConversationRaw(server.url, {
      topic: "moto elettriche",
      maxTurns: 4,
      resumeTranscript: malformedResumeTranscript,
    });

    assert.equal(response.statusCode, 400, `expected a 400 rejection, got ${response.statusCode}: ${response.body}`);
    const parsed = JSON.parse(response.body) as { error?: string };
    assert.ok(
      typeof parsed.error === "string" && parsed.error.length > 0,
      "response body should explain why the resume was rejected"
    );
  } finally {
    await server.close();
  }
});

/**
 * Regressione per Task #130: la conversazione deve fermarsi esattamente al
 * numero di turni richiesto (ed emettere `done`), non proseguire oltre né
 * fermarsi prima. Un refactor futuro della clamping math in `totalTurns`
 * (il combo `Math.max`/`Math.min` su `MAX_ALLOWED_TURNS`, `maxTurns` e
 * `transcript.length`) potrebbe rompere silenziosamente questo invariante.
 */
test("bowie-conversation stops after exactly maxTurns turns and emits done", async () => {
  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw([{ content: "horus-1" }, { content: "horus-2" }]),
    bowieChatRaw: makeScriptedChatRaw([{ content: "bowie-1" }]),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, { topic: "moto elettriche", maxTurns: 3 });

    const turnStarts = events.filter((e) => e.event === "turn_start").map((e) => (e.data as { agent: string }).agent);
    const turnEnds = events.filter((e) => e.event === "turn_end").map((e) => (e.data as { agent: string }).agent);

    assert.deepEqual(turnStarts, ["horus", "bowie", "horus"], "expected exactly 3 alternating turn_start events");
    assert.deepEqual(turnEnds, ["horus", "bowie", "horus"], "expected exactly 3 alternating turn_end events");

    const doneIndex = events.findIndex((e) => e.event === "done");
    assert.ok(doneIndex !== -1, "expected a done event after the 3rd turn");
    assert.equal(
      events.slice(doneIndex + 1).length,
      0,
      "no further turn_start/turn_end events should be emitted after done"
    );
  } finally {
    await server.close();
  }
});

test("bowie-conversation clamps maxTurns to MAX_ALLOWED_TURNS (20) instead of running unbounded", async () => {
  // 25 richiesto ma il server deve fermarsi a 20 turni totali (10 coppie horus/bowie).
  const horusReplies = Array.from({ length: 10 }, (_, i) => ({ content: `horus-${i}` }));
  const bowieReplies = Array.from({ length: 10 }, (_, i) => ({ content: `bowie-${i}` }));
  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw(horusReplies),
    bowieChatRaw: makeScriptedChatRaw(bowieReplies),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, { topic: "moto elettriche", maxTurns: 25 });

    const turnEnds = events.filter((e) => e.event === "turn_end");
    assert.equal(turnEnds.length, 20, "conversation must be clamped to MAX_ALLOWED_TURNS (20), not the requested 25");
    assert.ok(events.some((e) => e.event === "done"), "clamped conversation should still complete with done");
  } finally {
    await server.close();
  }
});

/**
 * Regressione per il Task #137: se il visitatore chiude il browser (o
 * naviga altrove) a metà di una conversazione Horus↔Bowie, la connessione
 * TCP viene chiusa e `res.on("close")` deve abortire il turno in corso,
 * impedendo che vengano emessi ulteriori `turn_start`/`turn_end`/`done` e
 * che i turni successivi vengano eseguiti. Riusa il pattern del test
 * analogo per la chat singola in `horus.sse.test.ts` (vero server HTTP,
 * `req.destroy()` per simulare un disconnect reale, non un mock).
 */
test("bowie-conversation stops the loop and emits no further events when the client actually disconnects mid-turn", async () => {
  const horus = makeSlowChatRaw();
  const bowie = makeUncalledChatRaw("bowie");
  const deps = makeDeps({ horusChatRaw: horus.chatRaw, bowieChatRaw: bowie.chatRaw });
  const server = await startTestServer(deps);

  try {
    const events: Array<{ event: string; data: unknown }> = [];

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
              events.push({ event, data });
              if (event === "token") {
                // Il "browser" si chiude a metà del primo turno.
                req.destroy();
              }
            },
          })
            .then(resolve)
            .catch(() => resolve());
        }
      );
      req.on("error", () => resolve());
      req.end(JSON.stringify({ topic: "moto elettriche", maxTurns: 4 }));
    });

    await sleep(150);

    assert.equal(
      horus.lastSignal?.aborted,
      true,
      "a real client disconnect must abort the in-flight turn via res.on('close')"
    );
    const eventNames = events.map((e) => e.event);
    const turnStarts = eventNames.filter((name) => name === "turn_start");
    assert.equal(
      turnStarts.length,
      1,
      `exactly one turn_start (Horus's, before the disconnect) should have been emitted, got: ${eventNames.join(", ")}`
    );
    assert.ok(!eventNames.includes("turn_end"), `no turn should complete after a mid-turn disconnect, got: ${eventNames.join(", ")}`);
    assert.ok(!eventNames.includes("done"), "a disconnected conversation must not emit done");
    assert.ok(!eventNames.includes("error"), "a client-initiated disconnect must not be reported as a server error");
    assert.equal(
      bowie.callCount,
      0,
      "the loop must not proceed to Bowie's turn after Horus's turn is aborted mid-flight by a disconnect"
    );
  } finally {
    await server.close();
  }
});

test("bowie-conversation resuming near MAX_ALLOWED_TURNS extends the bound by exactly one more turn, then stops", async () => {
  // 19 turni già completati (alternanza horus/bowie a partire da horus).
  // transcript.length + 1 = 20 = MAX_ALLOWED_TURNS, quindi deve fare esattamente
  // un altro turno (index 19 -> bowie) e poi fermarsi, anche con maxTurns basso.
  const resumeTranscript: Array<{ agent: ConvoAgent; content: string }> = Array.from({ length: 19 }, (_, i) => ({
    agent: i % 2 === 0 ? "horus" : "bowie",
    content: `turn-${i}`,
  }));

  const deps = makeDeps({
    horusChatRaw: makeScriptedChatRaw([{ content: "should-not-be-called" }]),
    bowieChatRaw: makeScriptedChatRaw([{ content: "final-bowie-turn" }]),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, {
      topic: "moto elettriche",
      maxTurns: 2,
      resumeTranscript,
    });

    const turnStarts = events.filter((e) => e.event === "turn_start").map((e) => (e.data as { agent: string }).agent);
    assert.deepEqual(turnStarts, ["bowie"], "resuming at 19/20 turns must run exactly one more turn (bowie)");

    const turnEnds = events.filter((e) => e.event === "turn_end").map((e) => e.data);
    assert.deepEqual(turnEnds, [{ agent: "bowie", content: "final-bowie-turn" }]);

    assert.ok(events.some((e) => e.event === "done"), "conversation must still reach done after hitting the bound");
  } finally {
    await server.close();
  }
});

/**
 * Regressione per Task #142 (generalizzazione a N interlocutori): il
 * turn-taking non deve più essere vincolato a esattamente due agenti. Con un
 * registry di TRE agenti l'alternanza deve girare per parità modulo N
 * (agent0 → agent1 → agent2 → agent0 …), l'apertura deve valere solo per il
 * primo turno e la ripresa da `resumeTranscript` deve continuare dal punto
 * giusto della rotazione a tre. Se un refactor futuro reintroducesse un
 * `i % 2` nascosto, questo test lo intercetterebbe.
 */
function makeThreeAgentRegistry(chatRaws: {
  agent0: BowieConversationDeps["horusChatRaw"];
  agent1: BowieConversationDeps["horusChatRaw"];
  agent2: BowieConversationDeps["horusChatRaw"];
}): (deps: BowieConversationDeps) => ConvoAgentConfig[] {
  return () => [
    {
      id: "agent0",
      displayName: "Agent0",
      chatRaw: chatRaws.agent0,
      chatOptions: {},
      toolsNote: "",
      isConfigured: () => true,
      notConfiguredMessage: "agent0 not configured",
    },
    {
      id: "agent1",
      displayName: "Agent1",
      chatRaw: chatRaws.agent1,
      chatOptions: {},
      toolsNote: "",
      isConfigured: () => true,
      notConfiguredMessage: "agent1 not configured",
    },
    {
      id: "agent2",
      displayName: "Agent2",
      chatRaw: chatRaws.agent2,
      chatOptions: {},
      toolsNote: "",
      isConfigured: () => true,
      notConfiguredMessage: "agent2 not configured",
    },
  ];
}

test("conversation turn-taking generalizes to three agents (rotates by parity mod N)", async () => {
  const deps = makeDeps({
    buildAgentRegistry: makeThreeAgentRegistry({
      agent0: makeScriptedChatRaw([{ content: "a0-1" }, { content: "a0-2" }]),
      agent1: makeScriptedChatRaw([{ content: "a1-1" }, { content: "a1-2" }]),
      agent2: makeScriptedChatRaw([{ content: "a2-1" }, { content: "a2-2" }]),
    }),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, { topic: "moto elettriche", maxTurns: 6 });

    const turnStarts = events.filter((e) => e.event === "turn_start").map((e) => (e.data as { agent: string }).agent);
    assert.deepEqual(
      turnStarts,
      ["agent0", "agent1", "agent2", "agent0", "agent1", "agent2"],
      "three-agent conversation must rotate agent0 → agent1 → agent2 → agent0 …, not alternate between two"
    );

    const turnEnds = events.filter((e) => e.event === "turn_end").map((e) => e.data);
    assert.deepEqual(turnEnds, [
      { agent: "agent0", content: "a0-1" },
      { agent: "agent1", content: "a1-1" },
      { agent: "agent2", content: "a2-1" },
      { agent: "agent0", content: "a0-2" },
      { agent: "agent1", content: "a1-2" },
      { agent: "agent2", content: "a2-2" },
    ]);

    assert.ok(events.some((e) => e.event === "done"), "three-agent conversation should complete with done");
  } finally {
    await server.close();
  }
});

test("three-agent conversation resumes rotation from resumeTranscript at the right agent", async () => {
  // Quattro turni già completati: agent0, agent1, agent2, agent0. Il prossimo
  // turno atteso è agent1 (index 4 → 4 % 3 = 1), poi agent2.
  const resumeTranscript = [
    { agent: "agent0", content: "t0" },
    { agent: "agent1", content: "t1" },
    { agent: "agent2", content: "t2" },
    { agent: "agent0", content: "t3" },
  ];

  const deps = makeDeps({
    buildAgentRegistry: makeThreeAgentRegistry({
      agent0: makeScriptedChatRaw([{ content: "should-not-run" }]),
      agent1: makeScriptedChatRaw([{ content: "a1-resumed" }]),
      agent2: makeScriptedChatRaw([{ content: "a2-resumed" }]),
    }),
  });
  const server = await startTestServer(deps);

  try {
    const events = await postConversation(server.url, {
      topic: "moto elettriche",
      maxTurns: 6,
      resumeTranscript,
    });

    const turnStarts = events.filter((e) => e.event === "turn_start").map((e) => (e.data as { agent: string }).agent);
    assert.deepEqual(
      turnStarts,
      ["agent1", "agent2"],
      "resuming 4 turns into a three-agent rotation must continue at agent1, then agent2"
    );

    assert.ok(events.some((e) => e.event === "done"), "resumed three-agent conversation should complete with done");
  } finally {
    await server.close();
  }
});

test("three-agent conversation rejects a resumeTranscript that breaks the mod-N rotation", async () => {
  // Rotazione corrotta: agent0, agent0 (dovrebbe essere agent1 al secondo turno).
  const malformed = [
    { agent: "agent0", content: "t0" },
    { agent: "agent0", content: "t1" },
  ];

  const deps = makeDeps({
    buildAgentRegistry: makeThreeAgentRegistry({
      agent0: makeScriptedChatRaw([{ content: "never" }]),
      agent1: makeScriptedChatRaw([{ content: "never" }]),
      agent2: makeScriptedChatRaw([{ content: "never" }]),
    }),
  });
  const server = await startTestServer(deps);

  try {
    const response = await postConversationRaw(server.url, {
      topic: "moto elettriche",
      maxTurns: 6,
      resumeTranscript: malformed,
    });

    assert.equal(response.statusCode, 400, `expected a 400 rejection, got ${response.statusCode}: ${response.body}`);
    const parsed = JSON.parse(response.body) as { error?: string };
    assert.ok(
      typeof parsed.error === "string" && parsed.error.includes("agent0"),
      "rejection should name the expected first agent of the rotation"
    );
  } finally {
    await server.close();
  }
});
