import assert from "node:assert/strict";
import http from "node:http";
import { test, mock } from "node:test";
import express from "express";
import type { HorusMessage, HorusRawResult, HorusChatOptions, HorusToolCall } from "@workspace/horus";

/**
 * Regressione (Task #169): il test di `budgetedToolResult` in isolamento
 * (`horus.tool-result-cap.test.ts`) copre solo la funzione pura, non il loop
 * vero di `createDirectChatHandler`. Questo test guida l'handler reale con un
 * `chatRaw` finto che emette più tool call su più iterazioni (stesso schema
 * server-HTTP-reale di `horus.sse.test.ts`), per verificare che il budget
 * TOTALE per turno (`toolResultCharsUsed`) sia davvero accumulato tra tutte
 * le iterazioni/tool call — e non azzerato o ricalcolato per errore — e che,
 * una volta esaurito, la nota "budget esaurito" venga effettivamente
 * reinserita nella conversation invece del testo grezzo del tool.
 *
 * `getHorusTools`/`executeHorusTool` vengono sostituiti via `mock.module`
 * (richiede `--experimental-test-module-mocks`, vedi script "test" del
 * package) perché sono importati direttamente in `horus.ts` (non iniettabili
 * via `DirectChatAgentConfig` come invece lo è `chatRaw`): il mock preserva
 * tutti gli altri export reali del pacchetto e sostituisce solo questi due,
 * restituendo un tool fittizio che produce risultati grandi e deterministici
 * senza toccare rete/filesystem reali.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-multi-tool-budget";

const BIG_TOOL_NAME = "big_tool";
// Più grande del cap del singolo risultato (4000) così ogni chiamata da sola
// spingerebbe il budget totale (8000) verso l'esaurimento entro 2-3 chiamate.
const BIG_RESULT_CHARS = 5000;

async function setupMocks(): Promise<{
  restore: () => void;
  executedToolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}> {
  const real = await import("@workspace/horus");
  const executedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const fakeTools = [
    {
      type: "function",
      function: {
        name: BIG_TOOL_NAME,
        description: "test-only tool returning a large deterministic payload",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  const mocked = mock.module("@workspace/horus", {
    namedExports: {
      ...real,
      getHorusTools: async () => fakeTools,
      executeHorusTool: async (name: string, args: Record<string, unknown>) => {
        executedToolCalls.push({ name, args });
        return "z".repeat(BIG_RESULT_CHARS);
      },
    },
  });

  return { restore: () => mocked.restore(), executedToolCalls };
}

function toolCall(id: string): HorusToolCall {
  return { id, function: { name: BIG_TOOL_NAME, arguments: {} } };
}

/**
 * Simula un modello che chiama il tool grande due volte nella 1a iterazione,
 * di nuovo nella 2a (continuando ad accumulare budget), e infine risponde
 * senza altri tool nella 3a (ultima consentita da MAX_TOOL_ITERATIONS).
 */
function makeMultiToolChatRaw(): (
  messages: HorusMessage[],
  options?: HorusChatOptions
) => Promise<HorusRawResult> {
  let iteration = 0;
  return async (_messages, _options = {}) => {
    const current = iteration;
    iteration += 1;
    if (current === 0) {
      return { content: "", toolCalls: [toolCall("call-1a"), toolCall("call-1b")] };
    }
    if (current === 1) {
      return { content: "", toolCalls: [toolCall("call-2a")] };
    }
    return { content: "Ecco il riepilogo finale.", toolCalls: [] };
  };
}

async function startTestServer(
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createDirectChatHandler } = await import("./horus.js");
  const app = express();
  app.post(
    "/test/chat",
    express.json(),
    createDirectChatHandler({
      agentName: "TestAgent",
      systemPrompt: { role: "system", content: "test" },
      chatRaw,
      isConfigured: () => true,
      checkHealth: async () => ({ status: "ok", model: "test-model" }),
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
    req.end(JSON.stringify({ message: "genera qualcosa di grande usando il tool", history: [] }));
  });
  return events;
}

test("createDirectChatHandler threads the per-turn tool-result budget across multiple iterations and tool calls", async () => {
  const { restore, executedToolCalls } = await setupMocks();

  try {
    const server = await startTestServer(makeMultiToolChatRaw());
    try {
      const events = await runChatRequest(server.url);

      // Il loop deve davvero aver eseguito 3 chiamate al tool grande (2 nella
      // 1a iterazione, 1 nella 2a) prima di rispondere nella 3a senza tool.
      assert.equal(
        executedToolCalls.length,
        3,
        `expected 3 real tool executions across iterations, got ${executedToolCalls.length}`
      );

      const toolCallEvents = events.filter((e) => e.event === "tool_call");
      assert.equal(toolCallEvents.length, 3, "client should see one tool_call event per executed tool");

      const doneEvent = events.find((e) => e.event === "done");
      assert.ok(doneEvent, `expected a final "done" event, got: ${events.map((e) => e.event).join(", ")}`);
      assert.equal((doneEvent!.data as { content: string }).content, "Ecco il riepilogo finale.");
    } finally {
      await server.close();
    }
  } finally {
    restore();
  }
});

test("budgeted tool results actually reach the model conversation shrunk/replaced, not raw", async () => {
  // Stesso scenario, ma questa volta ispezioniamo direttamente cosa il
  // handler ha effettivamente rimandato al modello come messaggi role:"tool",
  // intercettando `conversation` tramite gli argomenti passati a chatRaw ad
  // ogni iterazione (il "prompt" che l'handler ricostruisce con i risultati
  // già budgettizzati).
  const { restore } = await setupMocks();
  const seenConversations: HorusMessage[][] = [];

  const chatRaw = (() => {
    let iteration = 0;
    return async (messages: HorusMessage[]) => {
      seenConversations.push(messages.map((m) => ({ ...m })));
      const current = iteration;
      iteration += 1;
      if (current === 0) {
        return { content: "", toolCalls: [toolCall("call-1a"), toolCall("call-1b")] };
      }
      if (current === 1) {
        return { content: "", toolCalls: [toolCall("call-2a")] };
      }
      return { content: "Fatto.", toolCalls: [] };
    };
  })();

  try {
    const server = await startTestServer(chatRaw);
    try {
      await runChatRequest(server.url);

      // La 3a chiamata a chatRaw (ultima iterazione, indice 2) vede l'intera
      // cronologia accumulata fino a quel punto, incluso il risultato del
      // 3° tool eseguito nell'iterazione precedente.
      assert.equal(seenConversations.length, 3, "chatRaw should be invoked once per loop iteration");

      const finalPromptToolMessages = seenConversations[2]!.filter((m) => m.role === "tool");
      assert.equal(
        finalPromptToolMessages.length,
        3,
        "all 3 tool results from prior iterations must still be present in the prompt"
      );

      const totalToolCharsInPrompt = finalPromptToolMessages.reduce((sum, m) => sum + m.content.length, 0);
      // Budget totale = 8000; con l'overhead delle eventuali note di
      // troncamento/esaurimento tollerato dallo stesso margine usato in
      // horus.tool-result-cap.test.ts.
      assert.ok(
        totalToolCharsInPrompt <= 8000 + 800,
        `cumulative tool-result text in the prompt must stay within the per-turn budget (was ${totalToolCharsInPrompt})`
      );

      // Ogni singolo risultato grezzo era 5000 caratteri: se il budget non
      // fosse applicato correttamente, la somma sarebbe ~15000 (3x5000).
      assert.ok(
        totalToolCharsInPrompt < 3 * BIG_RESULT_CHARS,
        "raw unbudgeted tool text must not reach the model unshrunk across iterations"
      );

      // L'ultimo risultato (3° chiamata) deve essere stato o accorciato
      // rispetto al cap singolo pieno, oppure sostituito dalla nota di
      // "budget esaurito", perché a quel punto il budget residuo è già
      // stato eroso dalle prime due chiamate da 4000 caratteri l'una.
      const lastToolMessage = finalPromptToolMessages[2]!;
      const looksLikeExhaustedNote = /limite complessivo/i.test(lastToolMessage.content);
      const isShrunk = lastToolMessage.content.length < BIG_RESULT_CHARS;
      assert.ok(
        looksLikeExhaustedNote || isShrunk,
        "the 3rd tool result must be shrunk or replaced by the budget-exhausted note, not the raw 5000-char payload"
      );
    } finally {
      await server.close();
    }
  } finally {
    restore();
  }
});
