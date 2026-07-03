import assert from "node:assert/strict";
import http from "node:http";
import { test, mock } from "node:test";
import express from "express";
import type { HorusMessage, HorusRawResult, HorusChatOptions, HorusToolCall } from "@workspace/horus";

/**
 * Regressione (Task #170): Task #169 ha coperto solo il caso felice del loop
 * multi-tool (`horus.multi-tool-budget.test.ts`) e `horus.sse.test.ts` copre
 * solo la disconnessione mentre arrivano i token (nessun tool coinvolto).
 * Nessuno dei due esercita cosa succede se l'utente preme "Stop" (o chiude la
 * tab) MENTRE un tool è a metà esecuzione dentro il loop multi-iterazione: il
 * segnale di abort condiviso deve raggiungere davvero `executeHorusTool`, il
 * timer di `tool_progress` deve fermarsi (nessuna scrittura su una risposta
 * già chiusa — vedi la nota su sse-write-after-end che può abbattere l'intero
 * processo, non solo la singola chat), e l'handler deve uscire pulito senza
 * lanciare eccezioni non gestite né restare appeso.
 *
 * `getHorusTools`/`executeHorusTool` sono sostituiti via `mock.module` (stesso
 * schema di `horus.multi-tool-budget.test.ts`) con un tool finto che si
 * risolve SOLO quando il segnale di abort scatta (mai per timeout), cosà da
 * dimostrare che il segnale passato all'handler è realmente quello aborted
 * dalla disconnessione — non un finto sempre-risolto.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-tool-abort";

const SLOW_TOOL_NAME = "slow_tool";

interface SlowToolController {
  restore: () => void;
  capturedSignal: () => AbortSignal | undefined;
  executionCount: () => number;
  resolvedWithoutAbort: () => boolean;
}

async function setupSlowToolMocks(): Promise<SlowToolController> {
  const real = await import("@workspace/horus");
  let capturedSignal: AbortSignal | undefined;
  let executionCount = 0;
  let resolvedWithoutAbort = false;

  const fakeTools = [
    {
      type: "function",
      function: {
        name: SLOW_TOOL_NAME,
        description: "test-only tool that only settles when aborted",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  const mocked = mock.module("@workspace/horus", {
    namedExports: {
      ...real,
      getHorusTools: async () => fakeTools,
      executeHorusTool: async (
        _name: string,
        _args: Record<string, unknown>,
        signal?: AbortSignal
      ): Promise<string> => {
        executionCount++;
        capturedSignal = signal;
        return await new Promise<string>((resolve, reject) => {
          // Non si risolve mai da sola entro la finestra del test: si risolve
          // (con un reject, come farebbe un fetch/tool reale abortito) solo
          // quando il segnale di abort condiviso scatta davvero. Se il test
          // dovesse restare appeso qui, il timeout di node:test fallirebbe il
          // test invece di far restare appeso l'intero processo.
          const guard = setTimeout(() => {
            resolvedWithoutAbort = true;
            resolve("should-not-happen: resolved without abort");
          }, 10_000);
          signal?.addEventListener("abort", () => {
            clearTimeout(guard);
            reject(new Error("tool aborted"));
          });
        });
      },
    },
  });

  return {
    restore: () => mocked.restore(),
    capturedSignal: () => capturedSignal,
    executionCount: () => executionCount,
    resolvedWithoutAbort: () => resolvedWithoutAbort,
  };
}

function toolCall(id: string): HorusToolCall {
  return { id, function: { name: SLOW_TOOL_NAME, arguments: {} } };
}

function makeSingleToolChatRaw(): (
  messages: HorusMessage[],
  options?: HorusChatOptions
) => Promise<HorusRawResult> {
  return async () => ({ content: "", toolCalls: [toolCall("call-1")] });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("stopping the client mid-tool-execution actually aborts executeHorusTool and the handler exits cleanly", async () => {
  const mocks = await setupSlowToolMocks();

  let uncaught: unknown;
  const onUncaught = (err: unknown) => {
    uncaught = err;
  };
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUncaught);

  try {
    const server = await startTestServer(makeSingleToolChatRaw());
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
            let buffer = "";
            let destroyed = false;
            res.on("data", (chunk: Buffer) => {
              buffer += chunk.toString("utf8");
              if (!destroyed && buffer.includes("event: tool_call")) {
                // Il client "preme Stop" mentre il tool è ancora in corso
                // (l'unica cosa che può risolvere il tool finto è proprio
                // questa disconnessione).
                destroyed = true;
                req.destroy();
              }
            });
            res.on("close", resolve);
            res.on("end", resolve);
            res.on("error", () => resolve());
          }
        );
        req.on("error", () => resolve());
        req.end(JSON.stringify({ message: "usa il tool lento", history: [] }));
      });

      // Dare tempo all'handler server-side di reagire alla disconnessione
      // (il listener "close" su `res` e la reiezione del tool finto sono
      // entrambi asincroni).
      await sleep(200);

      assert.equal(mocks.executionCount(), 1, "the slow tool should have been invoked exactly once");

      const signal = mocks.capturedSignal();
      assert.ok(signal, "executeHorusTool should have received an AbortSignal");
      assert.equal(
        signal!.aborted,
        true,
        "the AbortSignal passed to executeHorusTool must actually be aborted after the client disconnects mid-tool-call"
      );
      assert.equal(
        mocks.resolvedWithoutAbort(),
        false,
        "the tool must have settled because of the abort, not because of its own unrelated timeout"
      );
      assert.equal(uncaught, undefined, `handler must not throw/crash on disconnect mid-tool-call: ${String(uncaught)}`);
    } finally {
      await server.close();
    }
  } finally {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUncaught);
    mocks.restore();
  }
});
