import { Router, type IRouter } from "express";
import express from "express";
import {
  horusChatRaw,
  getHorusTools,
  executeHorusTool,
  type HorusMessage,
} from "@workspace/horus";

const router: IRouter = Router();

const CHAT_SYSTEM_PROMPT: HorusMessage = {
  role: "system",
  content:
    "Questa è una conversazione libera con l'utente, non generazione di contenuti per il blog BikerBlog/BikerLink. " +
    "Rispondi come un assistente generico, competente e diretto, sull'argomento che l'utente porta. " +
    "NON riportare la conversazione su BikerLink, sviluppo software, moto o sul blog a meno che sia l'utente stesso a parlarne esplicitamente. " +
    "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink. " +
    "Hai a disposizione dei tool: usa web_search quando ti serve un'informazione aggiornata o che non conosci con certezza; " +
    "usa github_read per leggere file o cartelle dal codice sorgente reale di bikerlink, bikerblog o bikerweb quando l'utente chiede di codice, struttura del progetto, " +
    "come funziona una feature, o quando vuoi proporre idee di nuovi task o contenuti basate su cosa esiste già nel codice — è sempre sola lettura, non puoi scrivere né eseguire nulla, " +
    "e qualsiasi idea o proposta va detta a parole in chat, mai eseguita autonomamente; " +
    "usa remember_note ogni volta che l'utente ti comunica qualcosa di importante da ricordare in futuro (preferenze, correzioni, fatti su di sé o sul progetto), " +
    "anche se non te lo chiede esplicitamente con un comando — non serve chiedere conferma, salvala e basta; " +
    "se disponibili, hai anche typecheck_repo, lint_repo, search_code e git_log: usali quando ti chiedono di trovare errori, bug, typo o problemi nel codice, o di cercare un pattern in tutto il repo — " +
    "sono analisi statica REALE (tsc/eslint/grep eseguiti davvero), non una tua stima. Se questi tool non compaiono nella lista disponibile, di' esplicitamente che l'analisi statica del codice non è configurata in questo momento, invece di rispondere con un generico disclaimer da 'modello linguistico'.",
};

const MAX_TOOL_ITERATIONS = 5;
// Ogni messaggio rimanda l'intera cronologia a Ollama, che la rielabora da
// zero (nessun riuso del contesto tra richieste HTTP separate). Su hardware
// CPU questo tempo di "prompt processing" cresce con la lunghezza della
// conversazione, quindi teniamo la finestra inviata ragionevolmente corta
// per mantenere le risposte veloci anche in chat lunghe.
const MAX_HISTORY_MESSAGES = 16;

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

function isValidHistory(value: unknown): value is ChatRequestMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
  );
}

function sendEvent(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/horus/chat", express.json({ limit: "1mb" }), async (req, res): Promise<void> => {
  const password = process.env["HORUS_CHAT_PASSWORD"];
  const provided = req.headers["x-horus-password"];
  if (!password || provided !== password) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { message, history } = req.body as {
    message?: unknown;
    history?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const priorHistory: ChatRequestMessage[] = isValidHistory(history)
    ? history.slice(-MAX_HISTORY_MESSAGES)
    : [];

  const conversation: HorusMessage[] = [
    CHAT_SYSTEM_PROMPT,
    ...priorHistory.map((m) => ({ role: m.role, content: m.content }) satisfies HorusMessage),
    { role: "user", content: message },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);

  try {
    let finalReply = "";

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const { content, toolCalls } = await horusChatRaw(conversation, {
        tools: getHorusTools(),
        onToken: (token) => {
          sendEvent(res, "token", { token });
        },
      });

      if (toolCalls.length === 0) {
        finalReply = content;
        break;
      }

      conversation.push({ role: "assistant", content, tool_calls: toolCalls });

      for (const call of toolCalls) {
        const toolName = call.function.name;
        sendEvent(res, "tool_call", { name: toolName, arguments: call.function.arguments });
        const result = await executeHorusTool(toolName, call.function.arguments);
        sendEvent(res, "tool_result", { name: toolName });
        conversation.push({ role: "tool", name: toolName, content: result });
      }
    }

    if (!finalReply) {
      sendEvent(res, "error", {
        message: "Troppe chiamate a strumenti senza una risposta finale. Riprova con un'altra domanda.",
      });
    } else {
      sendEvent(res, "done", { content: finalReply });
    }
  } catch (err) {
    req.log.error({ err }, "horus chat failed");
    sendEvent(res, "error", {
      message: err instanceof Error ? err.message : "Errore imprevisto contattando Horus.",
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
