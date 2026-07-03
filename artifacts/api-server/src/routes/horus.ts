import { Router, type IRouter } from "express";
import express from "express";
import { desc, eq, lt, and, sql } from "drizzle-orm";
import { db, horusBowieConversationsTable, type HorusConversationTurn } from "@workspace/db";
import {
  horusChatRaw,
  bowieChatRaw,
  isBowieConfigured,
  checkHorusHealth,
  checkBowieHealth,
  BOWIE_AGENT_NAME,
  getHorusTools,
  executeHorusTool,
  type HorusMessage,
  type OllamaAgentHealth,
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

function buildDirectChatSystemPrompt(agentName: string): HorusMessage {
  return {
    role: "system",
    content:
      `Questa è una conversazione libera con l'utente, non generazione di contenuti per il blog BikerBlog/BikerLink. Ti chiami ${agentName}. ` +
      "Rispondi come un assistente generico, competente e diretto, sull'argomento che l'utente porta. " +
      "NON riportare la conversazione su BikerLink, sviluppo software, moto o sul blog a meno che sia l'utente stesso a parlarne esplicitamente. " +
      "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink. " +
      "Hai a disposizione dei tool: usa web_search quando ti serve un'informazione aggiornata o che non conosci con certezza; " +
      "usa github_read per leggere file o cartelle dal codice sorgente reale di bikerlink, bikerblog o bikerweb quando l'utente chiede di codice, struttura del progetto, " +
      "come funziona una feature, o quando vuoi proporre idee di nuovi task o contenuti basate su cosa esiste già nel codice — è sempre sola lettura, non puoi scrivere né eseguire nulla, " +
      "e qualsiasi idea o proposta va detta a parole in chat, mai eseguita autonomamente; " +
      "usa remember_note ogni volta che l'utente ti comunica qualcosa di importante da ricordare in futuro (preferenze, correzioni, fatti su di sé o sul progetto), " +
      "anche se non te lo chiede esplicitamente con un comando — non serve chiedere conferma, salvala e basta " +
      `(le tue note vengono salvate nella memoria condivisa taggate come tue, così non si confondono con quelle dell'altro agente); ` +
      "se disponibili, hai anche typecheck_repo, lint_repo, search_code e git_log: usali quando ti chiedono di trovare errori, bug, typo o problemi nel codice, o di cercare un pattern in tutto il repo — " +
      "sono analisi statica REALE (tsc/eslint/grep eseguiti davvero), non una tua stima. Se questi tool non compaiono nella lista disponibile, di' esplicitamente che l'analisi statica del codice non è configurata in questo momento, invece di rispondere con un generico disclaimer da 'modello linguistico'. " +
      "Se disponibile, hai anche architect: usalo (non i tool leggeri sopra) quando ti chiedono un'analisi architetturale approfondita, di pianificare l'implementazione di una feature/modifica non banale, o di trovare la causa radice di un bug complesso — passagli i percorsi dei file più rilevanti come contesto quando li conosci. È solo analisi (mai scrittura/esecuzione di codice) e può richiedere qualche minuto: avvisa l'utente che ci vorrà un po' prima di invocarlo.",
  };
}

const CHAT_SYSTEM_PROMPT: HorusMessage = buildDirectChatSystemPrompt("Horus");
const BOWIE_CHAT_SYSTEM_PROMPT: HorusMessage = buildDirectChatSystemPrompt("Bowie");

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

export interface DirectChatAgentConfig {
  agentName: string;
  systemPrompt: HorusMessage;
  chatRaw: typeof horusChatRaw;
  isConfigured: () => boolean;
  notConfiguredMessage: string;
  logLabel: string;
}

/**
 * Handler generico per la chat diretta a un agente (Horus o Bowie): stesso
 * loop di tool-calling, stessi eventi SSE e stessa gestione di abort per
 * entrambi. Solo il client Ollama (chatRaw), il system prompt e il nome
 * dell'agente cambiano — questo evita di duplicare la logica di streaming
 * quando aggiungiamo un secondo agente con chat diretta a pari livello.
 */
export function createDirectChatHandler(config: DirectChatAgentConfig) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    if (!requireHorusPassword(req, res)) return;

    const { message, history } = req.body as {
      message?: unknown;
      history?: unknown;
    };

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    if (!config.isConfigured()) {
      res.status(503).json({ error: "agent_not_configured", message: config.notConfiguredMessage });
      return;
    }

    const priorHistory: ChatRequestMessage[] = isValidHistory(history)
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : [];

    const conversation: HorusMessage[] = [
      config.systemPrompt,
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

    // Segnale di abort collegato sia alla chiusura della connessione (l'utente
    // chiude la tab o naviga altrove) sia al pulsante "Stop" lato client, che
    // interrompe lo stream chiudendo la request. Il segnale viene propagato
    // sia alla chiamata a Ollama sia all'esecuzione del tool in corso (es.
    // architect), per non lasciar girare inutilmente un'analisi che nessuno
    // leggerà più.
    // NB: si ascolta "close" su `res` (ServerResponse), non su `req`
    // (IncomingMessage): quest'ultimo emette "close" quasi subito dopo che
    // express.json() ha finito di consumare il body della richiesta — molto
    // prima che il client si disconnetta davvero — il che abortiva
    // silenziosamente ogni chat SSE ancora prima del primo token. `res`
    // emette "close" solo quando la connessione sottostante si chiude
    // realmente.
    const abortController = new AbortController();
    res.on("close", () => abortController.abort());

    try {
      let finalReply = "";

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS && !abortController.signal.aborted; iteration++) {
        const { content, toolCalls } = await config.chatRaw(conversation, {
          tools: await getHorusTools(),
          signal: abortController.signal,
          onToken: (token) => {
            sendEvent(res, "token", { token });
          },
        });

        if (abortController.signal.aborted) break;

        if (toolCalls.length === 0) {
          finalReply = content;
          break;
        }

        conversation.push({ role: "assistant", content, tool_calls: toolCalls });

        for (const call of toolCalls) {
          if (abortController.signal.aborted) break;

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
            result = await executeHorusTool(
              toolName,
              call.function.arguments,
              abortController.signal,
              config.agentName
            );
          } finally {
            clearInterval(progressInterval);
          }

          if (abortController.signal.aborted) break;

          sendEvent(res, "tool_result", { name: toolName, elapsedMs: Date.now() - toolStartedAt });
          conversation.push({ role: "tool", name: toolName, content: result });
        }
      }

      if (abortController.signal.aborted) {
        // Connessione già chiusa dal client: non ha senso scrivere altro sullo
        // stream (fallirebbe comunque).
      } else if (!finalReply) {
        sendEvent(res, "error", {
          message: "Troppe chiamate a strumenti senza una risposta finale. Riprova con un'altra domanda.",
        });
      } else {
        sendEvent(res, "done", { content: finalReply });
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        req.log.error({ err }, config.logLabel);
        sendEvent(res, "error", {
          message: err instanceof Error ? err.message : `Errore imprevisto contattando ${config.agentName}.`,
        });
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  };
}

interface HealthAgentConfig {
  agentName: string;
  checkHealth: () => Promise<OllamaAgentHealth>;
  notConfiguredMessage: string;
}

/**
 * Handler generico per il controllo di raggiungibilità di un agente (Horus o
 * Bowie), chiamato dal frontend all'apertura della tab di chat diretta prima
 * ancora che l'utente scriva un messaggio. Distingue esplicitamente "non
 * configurato" (env var mancanti, da correggere nei Secrets) da "configurato
 * ma non risponde ora" (tunnel/Ollama giù sul server dell'utente), invece di
 * lasciare che l'utente scopra il problema solo dopo aver inviato un messaggio.
 */
function createHealthHandler(config: HealthAgentConfig) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    if (!requireHorusPassword(req, res)) return;

    const health = await config.checkHealth();

    if (health.status === "not_configured") {
      res.json({ status: "not_configured", message: config.notConfiguredMessage });
      return;
    }

    if (health.status === "unreachable") {
      res.json({
        status: "unreachable",
        message:
          `${config.agentName} sembra configurato ma non risponde in questo momento ` +
          "(server o tunnel non raggiungibile). Riprova tra poco.",
      });
      return;
    }

    res.json({ status: "ok" });
  };
}

router.get(
  "/horus/health",
  createHealthHandler({
    agentName: "Horus",
    checkHealth: checkHorusHealth,
    notConfiguredMessage: "Horus non è configurato su questo ambiente.",
  })
);

router.get(
  "/horus/bowie-health",
  createHealthHandler({
    agentName: BOWIE_AGENT_NAME,
    checkHealth: checkBowieHealth,
    notConfiguredMessage: `${BOWIE_AGENT_NAME} non è configurato su questo ambiente — manca BOWIE_OLLAMA_MODEL. Aggiungilo dalla scheda Secrets per abilitare la chat diretta con Bowie.`,
  })
);

router.post(
  "/horus/chat",
  express.json({ limit: "1mb" }),
  createDirectChatHandler({
    agentName: "Horus",
    systemPrompt: CHAT_SYSTEM_PROMPT,
    chatRaw: horusChatRaw,
    isConfigured: () => true,
    notConfiguredMessage: "Horus non è configurato su questo ambiente.",
    logLabel: "horus chat failed",
  })
);

router.post(
  "/horus/bowie-chat",
  express.json({ limit: "1mb" }),
  createDirectChatHandler({
    agentName: BOWIE_AGENT_NAME,
    systemPrompt: BOWIE_CHAT_SYSTEM_PROMPT,
    chatRaw: bowieChatRaw,
    isConfigured: isBowieConfigured,
    notConfiguredMessage: `${BOWIE_AGENT_NAME} non è configurato su questo ambiente — manca BOWIE_OLLAMA_MODEL. Aggiungilo dalla scheda Secrets per abilitare la chat diretta con Bowie.`,
    logLabel: "bowie chat failed",
  })
);

/**
 * Costruisce il system prompt per la conversazione osservabile Horus↔Bowie.
 * `isOpening` distingue il caso del primo turno (nessuno dei due ha ancora
 * detto nulla) da quello di una risposta: prima del fix, il prompt diceva
 * sempre "rispondi a ciò che l'altro ha appena detto" anche al primo turno,
 * quando il transcript è ancora vuoto — questo induceva il modello ad
 * allucinare una battuta dell'altra IA mai realmente pronunciata, invece di
 * aprire la discussione sull'argomento proposto dall'utente.
 */
function buildConvoSystemPrompt(self: "horus" | "bowie", isOpening: boolean): HorusMessage {
  const selfName = self === "horus" ? "Horus" : "Bowie";
  const otherName = self === "horus" ? "Bowie" : "Horus";
  const intro =
    `Stai partecipando a una conversazione osservabile tra due IA, tu (${selfName}) e ${otherName}, ` +
    "un'altra IA installata sullo stesso ThinkCentre. Un utente umano ha proposto un argomento iniziale e vuole " +
    "guardarvi discuterne a turni.";
  const body = isOpening
    ? `Sei tu ad aprire la discussione: ${otherName} non ha ancora detto nulla. Presenta la tua opinione o ` +
      "prospettiva sull'argomento proposto dall'utente, in modo naturale e conciso (pochi paragrafi al massimo), " +
      `ponendo le basi per il confronto con ${otherName}. Non inventare né riassumere battute di ${otherName} che ` +
      "non sono ancora avvenute."
    : `Rispondi in modo naturale e conciso (pochi paragrafi al massimo) a ciò che ${otherName} ha appena detto, ` +
      `portando avanti la discussione con opinioni, domande o osservazioni tue. Non ripetere semplicemente quello ` +
      `che ha detto ${otherName}, e non chiudere subito la conversazione: contribuisci con qualcosa di nuovo.`;
  const toolsNote = self === "horus" ? " Non hai accesso a strumenti in questa modalità." : "";
  return { role: "system", content: `${intro} ${body}${toolsNote}` };
}

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

export interface BowieConversationDeps {
  horusChatRaw: typeof horusChatRaw;
  bowieChatRaw: typeof bowieChatRaw;
  isBowieConfigured: () => boolean;
  saveBowieConversation: (
    topic: string,
    transcript: ConvoTurn[],
    options: { status: "complete" | "interrupted"; conversationId?: number }
  ) => Promise<number>;
}

const defaultBowieConversationDeps: BowieConversationDeps = {
  horusChatRaw,
  bowieChatRaw,
  isBowieConfigured,
  saveBowieConversation,
};

/**
 * Estratto in una factory (invece di un handler inline sulla route) così i
 * test di regressione possono iniettare `chatRaw` finti e un `saveBowieConversation`
 * finto, riusando lo stesso pattern di `createDirectChatHandler` sopra, senza
 * dover mockare il modulo `@workspace/horus` o toccare il DB.
 */
export function createBowieConversationHandler(deps: BowieConversationDeps = defaultBowieConversationDeps) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    if (!requireHorusPassword(req, res)) return;

    const { topic, maxTurns, resumeTranscript, resumeConversationId } = req.body as {
      topic?: unknown;
      maxTurns?: unknown;
      resumeTranscript?: unknown;
      resumeConversationId?: unknown;
    };

    if (typeof topic !== "string" || !topic.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    // Se il client ci ripassa la trascrizione già ottenuta (dopo un errore o
    // uno stallo a metà conversazione), riprendiamo da lì invece di ripartire
    // da zero: l'utente non deve perdere i turni già completati per un
    // singolo drop-out di uno dei due agenti.
    //
    // Il prossimo turno viene attribuito solo in base a `transcript.length %
    // 2` (vedi sotto), quindi una trascrizione manomessa o corrotta che non
    // alterni davvero horus/bowie a partire da horus farebbe silenziosamente
    // "scivolare" l'attribuzione dei turni successivi. Validiamo la forma
    // prima di fidarci della lunghezza: se non è una corretta alternanza
    // horus→bowie→horus…, rifiutiamo la richiesta con 400 invece di
    // proseguire su un presupposto corrotto.
    const rawResumeTranscript: ConvoTurn[] = Array.isArray(resumeTranscript)
      ? resumeTranscript.filter(
          (t): t is ConvoTurn =>
            typeof t === "object" &&
            t !== null &&
            (t.agent === "horus" || t.agent === "bowie") &&
            typeof t.content === "string"
        )
      : [];

    const isValidAlternation = (turns: ConvoTurn[]): boolean =>
      turns.every((t, i) => t.agent === (i % 2 === 0 ? "horus" : "bowie"));

    if (Array.isArray(resumeTranscript) && resumeTranscript.length > 0 && !isValidAlternation(rawResumeTranscript)) {
      res.status(400).json({
        error: "resumeTranscript is malformed: turns must strictly alternate starting with horus",
      });
      return;
    }

    const transcript: ConvoTurn[] = rawResumeTranscript;

    const totalTurns = Math.min(
      MAX_ALLOWED_TURNS,
      Math.max(
        transcript.length + 1,
        Math.max(2, typeof maxTurns === "number" && Number.isFinite(maxTurns) ? Math.floor(maxTurns) : DEFAULT_MAX_TURNS)
      )
    );

    if (!deps.isBowieConfigured()) {
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

    // Vedi il commento nel chat handler diretto sopra: si ascolta "close" su
    // `res`, non su `req`, per non abortire subito dopo che il body della
    // richiesta è stato consumato.
    const abortController = new AbortController();
    res.on("close", () => abortController.abort());

    // L'agente del prossimo turno si alterna sempre partendo da Horus al
    // turno 0, quindi se riprendiamo da una trascrizione esistente dobbiamo
    // continuare l'alternanza da dove si era fermata, non ripartire da Horus.
    let failingAgent: ConvoAgent | null = null;

    // Se il client ci ripassa l'id di una conversazione già salvata come
    // "interrupted" (da un drop-out precedente), aggiorniamo quella riga
    // invece di crearne una nuova ad ogni retry.
    const conversationId: number | undefined =
      typeof resumeConversationId === "number" &&
      Number.isInteger(resumeConversationId) &&
      resumeConversationId > 0
        ? resumeConversationId
        : undefined;
    // Diventa true non appena abbiamo tentato un salvataggio (riuscito o
    // meno) lungo un percorso esplicito (fine normale o errore gestito), per
    // evitare che il `finally` tenti un secondo salvataggio ridondante.
    let persisted = false;

    try {
      for (let i = transcript.length; i < totalTurns; i++) {
        if (abortController.signal.aborted) break;

        const agent: ConvoAgent = i % 2 === 0 ? "horus" : "bowie";
        failingAgent = agent;
        sendEvent(res, "turn_start", { agent });

        const messages = buildAgentMessages(
          buildConvoSystemPrompt(agent, transcript.length === 0),
          topic,
          transcript,
          agent
        );

        const { content } =
          agent === "horus"
            ? await deps.horusChatRaw(messages, {
                skipMemory: true,
                signal: abortController.signal,
                onToken: (token) => sendEvent(res, "token", { agent, token }),
              })
            : await deps.bowieChatRaw(messages, {
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
          persisted = true;
          try {
            await deps.saveBowieConversation(topic, transcript, { status: "complete", conversationId });
          } catch (err) {
            req.log.error({ err }, "failed to persist horus-bowie conversation");
          }
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        req.log.error({ err, agent: failingAgent }, "horus-bowie conversation failed");
        const agentName = failingAgent === "bowie" ? BOWIE_AGENT_NAME : failingAgent === "horus" ? "Horus" : null;
        const baseMessage =
          err instanceof Error ? err.message : "Errore imprevisto durante la conversazione Horus↔Bowie.";

        // Salviamo subito la trascrizione parziale come "interrupted", senza
        // aspettare che l'utente prema "Riprova": se chiude la tab o naviga
        // altrove prima di farlo, i turni già completati non vanno persi lo
        // stesso e restano recuperabili dalla Cronologia.
        let savedConversationId = conversationId;
        if (transcript.length > 0) {
          persisted = true;
          try {
            savedConversationId = await deps.saveBowieConversation(topic, transcript, {
              status: "interrupted",
              conversationId,
            });
          } catch (persistErr) {
            req.log.error({ err: persistErr }, "failed to persist interrupted horus-bowie conversation");
          }
        }

        // Attribuiamo l'errore all'agente che stava rispondendo in quel
        // momento (non genericamente "la conversazione"): il client usa
        // `agent` per mostrare a colpo d'occhio chi si è disconnesso e per
        // riprendere la discussione da lì, non da zero. `conversationId`
        // permette al client di aggiornare (invece di duplicare) questa
        // stessa riga se l'utente preme "Riprova" e la conversazione arriva
        // in fondo.
        sendEvent(res, "error", {
          agent: failingAgent,
          message: agentName ? `${agentName}: ${baseMessage}` : baseMessage,
          transcript,
          conversationId: savedConversationId ?? null,
        });
      }
    } finally {
      // Copre il caso di un vero drop di connessione (l'utente chiude la tab
      // o il tunnel cade a metà turno) senza che nessun evento "error" sia
      // mai stato inviabile al client: senza questo, i turni già completati
      // andrebbero persi in silenzio perché il ramo catch/then sopra non
      // viene raggiunto (il ciclo si limita a interrompersi controllando
      // `abortController.signal.aborted`, non lancia un'eccezione).
      if (!persisted && transcript.length > 0) {
        try {
          await deps.saveBowieConversation(topic, transcript, { status: "interrupted", conversationId });
        } catch (err) {
          req.log.error({ err }, "failed to persist dropped horus-bowie conversation");
        }
      }
      clearInterval(heartbeat);
      res.end();
    }
  };
}

router.post("/horus/bowie-conversation", express.json({ limit: "1mb" }), createBowieConversationHandler());

async function saveBowieConversation(
  topic: string,
  transcript: ConvoTurn[],
  options: { status: "complete" | "interrupted"; conversationId?: number }
): Promise<number> {
  if (options.conversationId) {
    const [updated] = await db
      .update(horusBowieConversationsTable)
      .set({
        topic,
        transcript: transcript satisfies HorusConversationTurn[],
        status: options.status,
      })
      .where(eq(horusBowieConversationsTable.id, options.conversationId))
      .returning({ id: horusBowieConversationsTable.id });
    if (updated) return updated.id;
    // La riga interrotta non esiste più (es. superata la retention di
    // MAX_STORED_CONVERSATIONS nel frattempo): la ricreiamo da zero invece
    // di perdere la trascrizione.
  }

  const [inserted] = await db
    .insert(horusBowieConversationsTable)
    .values({
      topic,
      transcript: transcript satisfies HorusConversationTurn[],
      status: options.status,
    })
    .returning({ id: horusBowieConversationsTable.id });

  // Manteniamo la tabella leggera: dopo ogni inserimento (non ad ogni
  // aggiornamento, che non fa crescere la tabella) cancelliamo tutto ciò che
  // eccede il numero massimo di conversazioni conservate.
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

  return inserted!.id;
}

router.get("/horus/bowie-conversations", async (req, res): Promise<void> => {
  if (!requireHorusPassword(req, res)) return;

  const rows = await db
    .select({
      id: horusBowieConversationsTable.id,
      topic: horusBowieConversationsTable.topic,
      turnCount: sql<number>`jsonb_array_length(${horusBowieConversationsTable.transcript})`,
      createdAt: horusBowieConversationsTable.createdAt,
      status: horusBowieConversationsTable.status,
    })
    .from(horusBowieConversationsTable)
    .orderBy(desc(horusBowieConversationsTable.createdAt));

  res.json(
    rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      turnCount: Number(row.turnCount),
      createdAt: row.createdAt.toISOString(),
      status: row.status,
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
    status: row.status,
  });
});

export default router;
