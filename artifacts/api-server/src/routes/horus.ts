import { Router, type IRouter } from "express";
import express from "express";
import { desc, eq, lt, and, sql } from "drizzle-orm";
import { db, horusBowieConversationsTable, type HorusConversationTurn } from "@workspace/db";
import {
  horusChatRaw,
  bowieChatRaw,
  isBowieConfigured,
  BOWIE_AGENT_NAME,
  getHorusTools,
  executeHorusTool,
  type HorusMessage,
} from "@workspace/horus";

const router: IRouter = Router();

// Conserviamo solo le conversazioni più recenti per non far crescere la
// tabella all'infinito: ogni nuovo salvataggio elimina le più vecchie oltre
// questo limite.
const MAX_STORED_CONVERSATIONS = 50;

function requireHorusPassword(req: express.Request, res: express.Response): boolean {
  const password = process.env["HORUS_CHAT_PASSWORD"];
  const provided = req.headers["x-horus-password"];
  if (!password || provided !== password) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

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
    "sono analisi statica REALE (tsc/eslint/grep eseguiti davvero), non una tua stima. Se questi tool non compaiono nella lista disponibile, di' esplicitamente che l'analisi statica del codice non è configurata in questo momento, invece di rispondere con un generico disclaimer da 'modello linguistico'. " +
    "Se disponibile, hai anche architect: usalo (non i tool leggeri sopra) quando ti chiedono un'analisi architetturale approfondita, di pianificare l'implementazione di una feature/modifica non banale, o di trovare la causa radice di un bug complesso — passagli i percorsi dei file più rilevanti come contesto quando li conosci. È solo analisi (mai scrittura/esecuzione di codice) e può richiedere qualche minuto: avvisa l'utente che ci vorrà un po' prima di invocarlo.",
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
  if (!requireHorusPassword(req, res)) return;

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

        // Alcuni tool (es. architect) girano su hardware CPU e possono
        // richiedere diversi minuti. Senza un segnale periodico la chat
        // sembrerebbe bloccata: emettiamo un evento di progresso ogni pochi
        // secondi finché il tool non ha terminato, così il client può
        // mostrare "ancora al lavoro..." invece di restare in silenzio.
        const toolStartedAt = Date.now();
        const progressInterval = setInterval(() => {
          sendEvent(res, "tool_progress", { name: toolName, elapsedMs: Date.now() - toolStartedAt });
        }, 5_000);

        let result: string;
        try {
          result = await executeHorusTool(toolName, call.function.arguments);
        } finally {
          clearInterval(progressInterval);
        }

        sendEvent(res, "tool_result", { name: toolName, elapsedMs: Date.now() - toolStartedAt });
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

const HORUS_CONVO_SYSTEM_PROMPT: HorusMessage = {
  role: "system",
  content:
    "Stai partecipando a una conversazione osservabile tra due IA, tu (Horus) e Bowie, un'altra IA più leggera " +
    "installata sullo stesso ThinkCentre. Un utente umano ha proposto un argomento iniziale e vuole guardarvi " +
    "discuterne a turni. Rispondi in modo naturale e conciso (pochi paragrafi al massimo) a ciò che Bowie ha " +
    "appena detto, portando avanti la discussione con opinioni, domande o osservazioni tue. Non ripetere " +
    "semplicemente quello che ha detto Bowie, e non chiudere subito la conversazione: contribuisci con qualcosa " +
    "di nuovo. Non hai accesso a strumenti in questa modalità.",
};

const BOWIE_CONVO_SYSTEM_PROMPT: HorusMessage = {
  role: "system",
  content:
    "Stai partecipando a una conversazione osservabile tra due IA, tu (Bowie) e Horus, un'altra IA installata " +
    "sullo stesso ThinkCentre. Un utente umano ha proposto un argomento iniziale e vuole guardarvi discuterne a " +
    "turni. Rispondi in modo naturale e conciso (pochi paragrafi al massimo) a ciò che Horus ha appena detto, " +
    "portando avanti la discussione con opinioni, domande o osservazioni tue. Non ripetere semplicemente quello " +
    "che ha detto Horus, e non chiudere subito la conversazione: contribuisci con qualcosa di nuovo.",
};

const DEFAULT_MAX_TURNS = 8;
const MAX_ALLOWED_TURNS = 20;

type ConvoAgent = "horus" | "bowie";

interface ConvoTurn {
  agent: ConvoAgent;
  content: string;
}

function buildAgentMessages(
  systemPrompt: HorusMessage,
  topic: string,
  transcript: ConvoTurn[],
  self: ConvoAgent
): HorusMessage[] {
  const messages: HorusMessage[] = [
    systemPrompt,
    { role: "user", content: `Argomento proposto dall'utente per iniziare la discussione: "${topic}"` },
  ];
  for (const turn of transcript) {
    messages.push({
      role: turn.agent === self ? "assistant" : "user",
      content: turn.content,
    });
  }
  return messages;
}

router.post(
  "/horus/bowie-conversation",
  express.json({ limit: "1mb" }),
  async (req, res): Promise<void> => {
    if (!requireHorusPassword(req, res)) return;

    const { topic, maxTurns } = req.body as { topic?: unknown; maxTurns?: unknown };

    if (typeof topic !== "string" || !topic.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const totalTurns = Math.min(
      MAX_ALLOWED_TURNS,
      Math.max(2, typeof maxTurns === "number" && Number.isFinite(maxTurns) ? Math.floor(maxTurns) : DEFAULT_MAX_TURNS)
    );

    if (!isBowieConfigured()) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      sendEvent(res, "error", {
        message:
          `${BOWIE_AGENT_NAME} non è configurato su questo ambiente — manca BOWIE_OLLAMA_MODEL. ` +
          "Aggiungilo dalla scheda Secrets per abilitare la conversazione Horus↔Bowie.",
      });
      res.end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const transcript: ConvoTurn[] = [];

    try {
      for (let i = 0; i < totalTurns; i++) {
        if (abortController.signal.aborted) break;

        const agent: ConvoAgent = i % 2 === 0 ? "horus" : "bowie";
        sendEvent(res, "turn_start", { agent });

        const messages = buildAgentMessages(
          agent === "horus" ? HORUS_CONVO_SYSTEM_PROMPT : BOWIE_CONVO_SYSTEM_PROMPT,
          topic,
          transcript,
          agent
        );

        const { content } =
          agent === "horus"
            ? await horusChatRaw(messages, {
                skipMemory: true,
                signal: abortController.signal,
                onToken: (token) => sendEvent(res, "token", { agent, token }),
              })
            : await bowieChatRaw(messages, {
                signal: abortController.signal,
                onToken: (token) => sendEvent(res, "token", { agent, token }),
              });

        if (abortController.signal.aborted) break;

        const finalContent = content || "(nessuna risposta)";
        transcript.push({ agent, content: finalContent });
        sendEvent(res, "turn_end", { agent, content: finalContent });
      }

      if (!abortController.signal.aborted) {
        sendEvent(res, "done", {});

        if (transcript.length > 0) {
          try {
            await saveBowieConversation(topic, transcript);
          } catch (err) {
            req.log.error({ err }, "failed to persist horus-bowie conversation");
          }
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        req.log.error({ err }, "horus-bowie conversation failed");
        sendEvent(res, "error", {
          message:
            err instanceof Error ? err.message : "Errore imprevisto durante la conversazione Horus↔Bowie.",
        });
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
);

async function saveBowieConversation(topic: string, transcript: ConvoTurn[]): Promise<void> {
  await db.insert(horusBowieConversationsTable).values({
    topic,
    transcript: transcript satisfies HorusConversationTurn[],
  });

  // Manteniamo la tabella leggera: dopo ogni inserimento cancelliamo tutto
  // ciò che eccede il numero massimo di conversazioni conservate.
  const overflow = await db
    .select({ id: horusBowieConversationsTable.id })
    .from(horusBowieConversationsTable)
    .orderBy(desc(horusBowieConversationsTable.createdAt))
    .offset(MAX_STORED_CONVERSATIONS);

  if (overflow.length > 0) {
    const cutoffId = Math.max(...overflow.map((row) => row.id));
    await db
      .delete(horusBowieConversationsTable)
      .where(and(lt(horusBowieConversationsTable.id, cutoffId + 1)));
  }
}

router.get("/horus/bowie-conversations", async (req, res): Promise<void> => {
  if (!requireHorusPassword(req, res)) return;

  const rows = await db
    .select({
      id: horusBowieConversationsTable.id,
      topic: horusBowieConversationsTable.topic,
      turnCount: sql<number>`jsonb_array_length(${horusBowieConversationsTable.transcript})`,
      createdAt: horusBowieConversationsTable.createdAt,
    })
    .from(horusBowieConversationsTable)
    .orderBy(desc(horusBowieConversationsTable.createdAt));

  res.json(
    rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      turnCount: Number(row.turnCount),
      createdAt: row.createdAt.toISOString(),
    }))
  );
});

router.get("/horus/bowie-conversations/:id", async (req, res): Promise<void> => {
  if (!requireHorusPassword(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(horusBowieConversationsTable)
    .where(eq(horusBowieConversationsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "conversation not found" });
    return;
  }

  res.json({
    id: row.id,
    topic: row.topic,
    transcript: row.transcript,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
