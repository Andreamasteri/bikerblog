import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import type { HorusMessage, HorusChatOptions, HorusRawResult, OllamaAgentHealth } from "@workspace/horus";

/**
 * Regressione (Task #238): il web chat route per Quebracho chiama
 * `getHorusTools` → `quebrachoChatRawResilient`. Se un refactor passasse
 * `tools: []` a `runChatTurn`, il guard di `quebrachoChatRawResilient`
 * (che rifiuta di usare il cloud quando ci sono tool attivi) verrebbe
 * bypassato silenziosamente: TC down + tool selezionati → risposta cloud
 * arriva come evento `done`, senza che l'utente o il caller se ne accorga.
 *
 * Questo test verifica l'invariante end-to-end a livello di route:
 *   1. TC irraggiungibile → la prima chiamata a `chatRaw` deve vedere i tool
 *      (= `options.tools` non vuoto) e lanciare un errore.
 *   2. Il risultato HTTP finale deve essere un evento SSE `error`, NON un
 *      evento `done` con una risposta cloud.
 *
 * Il `chatRaw` iniettato emula esattamente il comportamento di
 * `quebrachoChatRawResilient` in modalità "TC down + cloud disponibile":
 *   - se `options.tools` è non-vuoto → lancia (guard attivo)
 *   - se `options.tools` è vuoto o assente → restituisce una risposta cloud
 *     fasulla (non deve mai apparire nel test)
 *
 * Se un futuro refactor azzera il tools array prima di passarlo a
 * `runChatTurn`, il `chatRaw` risponderà con il testo cloud e il test
 * troverà un evento `done` invece dell'atteso `error`, fallendo esplicitamente.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-quebracho-tool-guard";

/** Simula quebrachoChatRawResilient: rifiuta quando i tool sono non-vuoti
 * (TC down, guard attivo); risponde con un testo cloud se tools è vuoto o
 * assente (non deve mai accadere in questo scenario). */
function makeQuebrachoChatRawMock(): {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  callLog: Array<{ toolCount: number }>;
} {
  const callLog: Array<{ toolCount: number }> = [];
  return {
    callLog,
    chatRaw: async (_messages: HorusMessage[], options: HorusChatOptions = {}) => {
      const toolCount = options.tools?.length ?? 0;
      callLog.push({ toolCount });
      if (toolCount > 0) {
        throw new Error(
          "quebrachoChatRawResilient: TC non raggiungibile e i tool sono attivi — " +
            "il cloud non può eseguire tool call in sicurezza (guard attivo)"
        );
      }
      // Questo ramo non deve essere raggiunto nel test: se compare nel `done`
      // significa che il route ha svuotato il tools array.
      options.onToken?.("risposta-cloud-non-attesa");
      return { content: "risposta-cloud-non-attesa", toolCalls: [] };
    },
  };
}

async function startTestServer(
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>,
  checkHealth: () => Promise<OllamaAgentHealth> = async () => ({ status: "unreachable", detail: "TC mock down" })
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createDirectChatHandler, __clearDirectReplyCacheForTests } = await import("./horus.js");
  __clearDirectReplyCacheForTests();

  const app = express();
  const noop = () => {};
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, () => void> }).log = {
      warn: noop,
      error: noop,
      info: noop,
      debug: noop,
    };
    next();
  });

  app.post(
    "/test/quebracho-chat",
    express.json({ limit: "1mb" }),
    createDirectChatHandler({
      agentName: "Quebracho",
      systemPrompt: { role: "system", content: "Sei Quebracho, il cane del progetto." },
      chatRaw,
      isConfigured: () => true,
      checkHealth,
      notConfiguredMessage: "Quebracho non configurato",
      logLabel: "quebracho test chat failed",
    })
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind test server");

  return {
    url: `http://127.0.0.1:${address.port}/test/quebracho-chat`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function runSseRequest(url: string, body: unknown): Promise<Array<{ event: string; data: unknown }>> {
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
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
            if (eventLine && dataLine) {
              events.push({
                event: eventLine.slice("event: ".length),
                data: JSON.parse(dataLine.slice("data: ".length)),
              });
            }
          }
        });
        res.on("end", resolve);
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
  return events;
}

test("Quebracho: TC down + tool selezionati → SSE error, MAI un done con risposta cloud", async () => {
  const mock = makeQuebrachoChatRawMock();
  const server = await startTestServer(mock.chatRaw);

  try {
    // Messaggio che deve innescare la selezione di web_search in getHorusTools.
    const events = await runSseRequest(server.url, {
      message: "cerca online le ultime notizie MotoGP",
      history: [],
    });

    assert.ok(
      mock.callLog.length >= 1,
      `il mock chatRaw deve essere chiamato almeno una volta, invece ${mock.callLog.length} volte`
    );

    // Verifica invariante principale: la prima chiamata deve aver ricevuto
    // tools non vuoti. Se toolCount è 0, il route ha perso i tool lungo la
    // strada (bug di forwarding che questo test deve intercettare).
    const firstCall = mock.callLog[0]!;
    assert.ok(
      firstCall.toolCount > 0,
      `La prima chiamata a chatRaw deve ricevere tools non-vuoti (tool count: ${firstCall.toolCount}). ` +
        "Se toolCount è 0, il route ha svuotato il tools array prima di passarlo a runChatTurn."
    );

    // La risposta finale deve essere un evento error, non un done.
    const doneEvent = events.find((e) => e.event === "done");
    assert.equal(
      doneEvent,
      undefined,
      `NON ci deve essere un evento done (che indicherebbe una risposta cloud non autorizzata). ` +
        `Ricevuto: ${JSON.stringify(doneEvent)}. ` +
        `Tutti gli eventi: ${events.map((e) => e.event).join(", ")}`
    );

    const errorEvent = events.find((e) => e.event === "error");
    assert.ok(
      errorEvent,
      `Atteso un evento SSE error quando TC è down e i tool sono attivi. ` +
        `Ricevuti: ${events.map((e) => e.event).join(", ")}`
    );

    // Non deve comparire il testo della risposta cloud fasulla nemmeno nei
    // token intermedi.
    const tokenEvents = events.filter((e) => e.event === "token");
    for (const tok of tokenEvents) {
      const token = (tok.data as { token?: string }).token ?? "";
      assert.doesNotMatch(
        token,
        /risposta-cloud-non-attesa/,
        "nessun token della risposta cloud fasulla deve raggiungere il client"
      );
    }
  } finally {
    await server.close();
  }
});

test("Quebracho: TC down + messaggio senza tool → la risposta cloud raggiunge l'utente (fallback legittimo)", async () => {
  // Questo scenario verifica che il fallback cloud sia usato correttamente
  // quando non ci sono tool selezionati. Non è il comportamento rischioso
  // (quello ha i tool), è il fallback legittimo per messaggi conversazionali.
  const mock = makeQuebrachoChatRawMock();
  const server = await startTestServer(mock.chatRaw);

  try {
    // "Ciao" è conversazionale: getHorusTools non deve selezionare tool,
    // quindi il mock non lancia e la risposta cloud è valida.
    const events = await runSseRequest(server.url, {
      message: "ciao",
      history: [],
    });

    assert.ok(
      mock.callLog.length >= 1,
      `il mock deve essere chiamato almeno una volta, invece ${mock.callLog.length} volte`
    );

    // Per un messaggio conversazionale puro, la route può passare tools vuoti
    // e il mock non lancia (cloud è ok senza tool). Atteso un evento done.
    const errorEvent = events.find((e) => e.event === "error");
    const doneEvent = events.find((e) => e.event === "done");
    // Se la selezione è contestuale e ha selezionato tool anche per "ciao",
    // il mock lancerà e si avrà un error: accettiamo entrambi i casi, purché
    // non arrivi mai una risposta cloud quando i tool erano attivi.
    if (mock.callLog[0]!.toolCount > 0) {
      // Anche "ciao" ha tools: l'error è corretto (guard attivo).
      assert.ok(
        errorEvent,
        `con tool attivi atteso un error, ricevuti: ${events.map((e) => e.event).join(", ")}`
      );
    } else {
      // Nessun tool → cloud fallback legittimo: atteso un done con il testo
      // del mock (che simula la risposta cloud per messaggi conversazionali).
      assert.ok(
        doneEvent,
        `senza tool atteso un done (fallback cloud legittimo), ricevuti: ${events.map((e) => e.event).join(", ")}`
      );
    }
  } finally {
    await server.close();
  }
});
