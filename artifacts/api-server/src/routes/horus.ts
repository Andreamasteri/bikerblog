import { Router, type IRouter } from "express";
import express from "express";
import { desc, eq, lt, and, sql } from "drizzle-orm";
import { db, horusBowieConversationsTable, type HorusConversationTurn } from "@workspace/db";
import {
  horusChatRaw,
  bowieChatRaw,
  quebrachoChatRaw,
  isBowieConfigured,
  isQuebrachoConfigured,
  checkHorusHealth,
  checkBowieHealth,
  checkQuebrachoHealth,
  getHorusTools,
  executeHorusTool,
  BOWIE_AGENT_NAME,
  QUEBRACHO_AGENT_NAME,
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

// Le chat dirette (Horus, Bowie, Quebracho) hanno accesso agli stessi tool
// della CLI (github_read, web_search, remember_note, search_manual/Nadir,
// ecc. — vedi getHorusTools()/executeHorusTool in @workspace/horus), non più
// "sempre dirette senza tool" come in origine: l'utente chatta solo dalla web
// UI (non usa la CLI), quindi capacità come "leggi il codice di BikerLink su
// GitHub e scrivi un manuale" devono funzionare da qui. Le conversazioni sono
// comunque salvate nello storico/log a prescindere dai tool.
function buildDirectChatSystemPrompt(agentName: string): HorusMessage {
  return {
    role: "system",
    content:
      `Questa è una conversazione libera con l'utente, non generazione di contenuti per il blog BikerBlog/BikerLink. Ti chiami ${agentName}. ` +
      "Rispondi come un assistente generico, competente e diretto, sull'argomento che l'utente porta. " +
      "NON riportare la conversazione su BikerLink, sviluppo software, moto o sul blog a meno che sia l'utente stesso a parlarne esplicitamente. " +
      "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink. " +
      `Rispondi in modo breve, diretto e conciso quando la domanda è semplice (poche frasi, senza premesse o ripetizioni); ` +
      "quando invece l'utente chiede esplicitamente qualcosa di lungo o articolato (es. un manuale, una guida completa, un riassunto esteso), rispondi con tutto il testo necessario, senza tagliarlo per brevità. " +
      "Hai a disposizione dei tool: usa web_search quando ti serve un'informazione aggiornata o che non conosci con certezza; " +
      "usa github_read per leggere file o cartelle dal codice sorgente reale di bikerlink, bikerblog o bikerweb quando l'utente chiede di codice, struttura del progetto, " +
      "come funziona una feature, o per scrivere manuali/documentazione basati sul codice reale — è sempre sola lettura, non puoi scrivere né eseguire nulla; " +
      "se disponibile, usa search_manual per cercare per significato dentro la base di conoscenza di Nadir; " +
      "usa remember_note ogni volta che l'utente ti comunica qualcosa di importante da ricordare in futuro (preferenze, correzioni, fatti su di sé o sul progetto), " +
      "anche se non te lo chiede esplicitamente — non serve chiedere conferma, salvala e basta; " +
      "se disponibili, hai anche typecheck_repo, lint_repo, search_code e git_log per analisi statica REALE del codice (non una tua stima). " +
      "Se un tool che ti serve non compare nella lista disponibile, dillo esplicitamente invece di rispondere con un generico disclaimer da 'modello linguistico'.",
  };
}

// Le risposte brevi restano il default per domande semplici, per tenere
// bassa la latenza su hardware CPU quando non serve altro. `MAX_REPLY_CHARS`/
// `MAX_REPLY_TOKENS` si applicano SOLO finché in questo turno non è ancora
// stato usato nessun tool: una volta che il modello ha invocato un tool (es.
// github_read per scrivere un manuale), il turno passa ai limiti "estesi"
// (`_WITH_TOOLS`) perché il compito è evidentemente più corposo di una
// battuta di chat — altrimenti un manuale generato da github_read verrebbe
// tagliato a poche frasi, vanificando il motivo per cui il tool è stato
// chiamato. `MAX_TOOL_ITERATIONS` limita quante volte il modello può
// invocare tool in sequenza nello stesso turno (stesso valore della CLI).
const MAX_REPLY_CHARS = 400;
const MAX_REPLY_TOKENS = 220;
const MAX_REPLY_CHARS_WITH_TOOLS = 6000;
const MAX_REPLY_TOKENS_WITH_TOOLS = 1600;
const MAX_TOOL_ITERATIONS = 5;

/** Taglia una risposta al limite di caratteri applicabile (esteso se in
 * questo turno sono stati usati dei tool), spezzando su uno spazio quando
 * possibile invece che a metà parola, e segnalando il taglio con "…". */
function truncateReply(content: string, usedTools: boolean): string {
  const limit = usedTools ? MAX_REPLY_CHARS_WITH_TOOLS : MAX_REPLY_CHARS;
  if (content.length <= limit) return content;
  const cut = content.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const safeCut = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut.trimEnd()}…`;
}

// Ogni messaggio rimanda l'intera cronologia a Ollama, che la rielabora da
// zero (nessun riuso del contesto tra richieste HTTP separate). Su hardware
// CPU questo tempo di "prompt processing" cresce con la lunghezza della
// conversazione: 1 solo messaggio precedente rendeva le AI "senza memoria"
// (non ricordavano nulla di prima), quindi la finestra è stata riportata a 5
// messaggi precedenti come compromesso tra continuità della conversazione e
// velocità di risposta. Le conversazioni restano comunque salvate per intero
// nello storico/log a prescindere da questo limite.
const MAX_HISTORY_MESSAGES = 5;

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
 * Handler generico per la chat diretta a un agente (Horus, Bowie o
 * Quebracho): stessi eventi SSE e stessa gestione di abort per tutti. Solo il
 * client Ollama (chatRaw), il system prompt e il nome dell'agente cambiano —
 * questo evita di duplicare la logica di streaming quando aggiungiamo un
 * nuovo agente con chat diretta a pari livello.
 *
 * Le risposte usano tool-calling nativo di Ollama (stesso registry della CLI
 * — github_read, web_search, remember_note, search_manual/Nadir, ecc. — via
 * getHorusTools()/executeHorusTool), con lo stesso loop "chiama modello →
 * eventuali tool_calls → esegui tool → richiama modello" della CLI
 * (`scripts/src/horus-chat.ts`), fino a MAX_TOOL_ITERATIONS. Il client SSE
 * riceve eventi `tool_call`/`tool_progress`/`tool_result` per mostrare le
 * badge dei tool in corso (vedi `agent-chat-panel.tsx`).
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
    // interrompe lo stream chiudendo la request.
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
      const tools = await getHorusTools();
      let usedTools = false;
      let finalReply = "";

      for (
        let iteration = 0;
        iteration < MAX_TOOL_ITERATIONS && !abortController.signal.aborted;
        iteration++
      ) {
        const { content, toolCalls } = await config.chatRaw(conversation, {
          tools,
          maxTokens: usedTools ? MAX_REPLY_TOKENS_WITH_TOOLS : MAX_REPLY_TOKENS,
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

        usedTools = true;
        conversation.push({ role: "assistant", content, tool_calls: toolCalls });

        for (const call of toolCalls) {
          if (abortController.signal.aborted) break;

          const toolName = call.function.name;
          sendEvent(res, "tool_call", { name: toolName });

          const toolStartedAt = Date.now();
          const progressTimer = setInterval(() => {
            sendEvent(res, "tool_progress", { name: toolName, elapsedMs: Date.now() - toolStartedAt });
          }, 4_000);

          let result: string;
          try {
            result = await executeHorusTool(toolName, call.function.arguments, abortController.signal);
          } finally {
            clearInterval(progressTimer);
          }

          if (abortController.signal.aborted) break;

          sendEvent(res, "tool_result", { name: toolName, elapsedMs: Date.now() - toolStartedAt });
          conversation.push({ role: "tool", name: toolName, content: result });
        }
      }

      const finalContent = truncateReply(finalReply, usedTools);

      if (abortController.signal.aborted) {
        // Connessione già chiusa dal client: non ha senso scrivere altro sullo
        // stream (fallirebbe comunque).
      } else if (!finalContent) {
        sendEvent(res, "error", {
          message: `${config.agentName} non ha restituito una risposta. Riprova con un'altra domanda.`,
        });
      } else {
        sendEvent(res, "done", { content: finalContent });
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
        model: health.model,
      });
      return;
    }

    res.json({ status: "ok", model: health.model });
  };
}

/**
 * Definizione canonica di un agente conversazionale (Task #156): unica fonte
 * di verità da cui derivano SIA le route di health-check/chat diretta qui
 * sotto SIA il registry della conversazione osservata (`buildConvoAgentRegistry`
 * più in basso). Prima di questo refactor le due liste (route hardcoded qui,
 * registry della conversazione più sotto) potevano divergere in silenzio —
 * es. un terzo agente aggiunto a una lista ma non all'altra, o un messaggio
 * "non raggiungibile" aggiornato in un posto e non nell'altro. `healthPath`/
 * `chatPath` sono relativi (senza "/api", aggiunto dal client) e vengono
 * esposti al frontend da `GET /horus/agents` così anche la UI non deve avere
 * un elenco di endpoint scritto a mano (vedi `useAgentRegistry` nel client).
 */
interface AgentDefinition {
  id: string;
  displayName: string;
  healthPath: string;
  chatPath: string;
  checkHealth: () => Promise<OllamaAgentHealth>;
  chatRaw: typeof horusChatRaw;
  isConfigured: () => boolean;
  /** Usato per l'health check e per la chat diretta (risposta 503). */
  notConfiguredMessage: string;
  /** Usato solo dentro l'evento "error" della conversazione osservata. */
  conversationNotConfiguredMessage: string;
  /** Opzioni passate a `chatRaw` per questo agente in conversazione (es. Horus usa skipMemory). */
  conversationChatOptions: { skipMemory?: boolean };
  /** Nota aggiunta in coda al system prompt della conversazione (es. Horus: nessun tool in questa modalità). */
  conversationToolsNote: string;
  logLabel: string;
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "horus",
    displayName: "Horus",
    healthPath: "horus/health",
    chatPath: "horus/chat",
    checkHealth: checkHorusHealth,
    chatRaw: horusChatRaw,
    isConfigured: () => true,
    notConfiguredMessage: "Horus non è configurato su questo ambiente.",
    conversationNotConfiguredMessage: "Horus non è configurato su questo ambiente.",
    conversationChatOptions: { skipMemory: true },
    conversationToolsNote: " Non hai accesso a strumenti in questa modalità.",
    logLabel: "horus chat failed",
  },
  {
    id: "bowie",
    displayName: BOWIE_AGENT_NAME,
    healthPath: "horus/bowie-health",
    chatPath: "horus/bowie-chat",
    checkHealth: checkBowieHealth,
    chatRaw: bowieChatRaw,
    isConfigured: isBowieConfigured,
    notConfiguredMessage: `${BOWIE_AGENT_NAME} non è configurato su questo ambiente — manca BOWIE_OLLAMA_MODEL. Aggiungilo dalla scheda Secrets per abilitare la chat diretta con Bowie.`,
    conversationNotConfiguredMessage: `${BOWIE_AGENT_NAME} non è configurato su questo ambiente — manca BOWIE_OLLAMA_MODEL. Aggiungilo dalla scheda Secrets per abilitare la conversazione Horus↔Bowie.`,
    conversationChatOptions: {},
    conversationToolsNote: "",
    logLabel: "bowie chat failed",
  },
  {
    id: "quebracho",
    displayName: QUEBRACHO_AGENT_NAME,
    healthPath: "horus/quebracho-health",
    chatPath: "horus/quebracho-chat",
    checkHealth: checkQuebrachoHealth,
    chatRaw: quebrachoChatRaw,
    isConfigured: isQuebrachoConfigured,
    notConfiguredMessage: `${QUEBRACHO_AGENT_NAME} non è configurato su questo ambiente — manca QUEBRACHO_OLLAMA_MODEL. Aggiungilo dalla scheda Secrets per abilitare la conversazione con Quebracho.`,
    conversationNotConfiguredMessage:
      `${QUEBRACHO_AGENT_NAME} non è configurato su questo ambiente — manca QUEBRACHO_OLLAMA_MODEL. ` +
      "Aggiungilo dalla scheda Secrets per abilitare la conversazione a tre.",
    conversationChatOptions: {},
    conversationToolsNote: "",
    logLabel: "quebracho chat failed",
  },
];

for (const def of AGENT_DEFINITIONS) {
  router.get(
    `/${def.healthPath}`,
    createHealthHandler({
      agentName: def.displayName,
      checkHealth: def.checkHealth,
      notConfiguredMessage: def.notConfiguredMessage,
    })
  );

  router.post(
    `/${def.chatPath}`,
    express.json({ limit: "1mb" }),
    createDirectChatHandler({
      agentName: def.displayName,
      systemPrompt: buildDirectChatSystemPrompt(def.displayName),
      chatRaw: def.chatRaw,
      isConfigured: def.isConfigured,
      notConfiguredMessage: def.notConfiguredMessage,
      logLabel: def.logLabel,
    })
  );
}

/**
 * Elenco degli agenti e dei relativi endpoint di health-check, così il
 * frontend può costruire il gate di raggiungibilità (chat diretta e
 * conversazione osservata) senza avere un elenco di path scritto a mano —
 * vedi `useAgentRegistry` in `horus-chat.tsx`. Protetto dalla stessa password
 * delle altre route Horus: non è un dato sensibile, ma resta coerente con il
 * resto della superficie `/horus/*` che richiede sempre autenticazione.
 */
router.get("/horus/agents", (req, res) => {
  if (!requireHorusPassword(req, res)) return;
  res.json(
    AGENT_DEFINITIONS.map((def) => ({
      id: def.id,
      displayName: def.displayName,
      healthEndpoint: `api/${def.healthPath}`,
    }))
  );
});

/** Unisce una lista di nomi in italiano: ["A"] → "A"; ["A","B"] → "A e B";
 * ["A","B","C"] → "A, B e C". Serve a generalizzare il prompt a N agenti
 * mantenendo però un output identico al caso a due agenti. */
function joinNamesIt(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]!}`;
}

function italianCountWord(n: number): string {
  if (n === 2) return "due";
  if (n === 3) return "tre";
  return String(n);
}

/**
 * Costruisce il system prompt per la conversazione osservabile a N agenti
 * (oggi Horus↔Bowie). `previousSpeakerName === null` distingue il caso del
 * primo turno (nessun altro ha ancora detto nulla) da quello di una risposta:
 * prima del fix, il prompt diceva sempre "rispondi a ciò che l'altro ha
 * appena detto" anche al primo turno, quando il transcript è ancora vuoto —
 * questo induceva il modello ad allucinare una battuta di un'altra IA mai
 * realmente pronunciata, invece di aprire la discussione sull'argomento
 * proposto dall'utente.
 *
 * Il testo è generalizzato per un numero arbitrario di interlocutori ma resta
 * byte-identico al comportamento storico quando gli agenti sono esattamente
 * due (un solo "altro" agente).
 */
function buildConvoSystemPrompt(opts: {
  selfName: string;
  otherNames: string[];
  previousSpeakerName: string | null;
  toolsNote: string;
}): HorusMessage {
  const { selfName, otherNames, previousSpeakerName, toolsNote } = opts;
  const totalAgents = otherNames.length + 1;
  const otherList = joinNamesIt(otherNames);
  const othersDescriptor =
    otherNames.length <= 1
      ? "un'altra IA installata sullo stesso ThinkCentre"
      : "altre IA installate sullo stesso ThinkCentre";
  // Con un solo "altro" agente usiamo il suo nome (output identico al caso a
  // due agenti); con più agenti ripieghiamo su una formula collettiva.
  const openingOthers = otherNames.length === 1 ? otherNames[0]! : "gli altri partecipanti";
  const intro =
    `Stai partecipando a una conversazione osservabile tra ${italianCountWord(totalAgents)} IA, tu (${selfName}) e ${otherList}, ` +
    `${othersDescriptor}. Un utente umano ha proposto un argomento iniziale e vuole ` +
    "guardarvi discuterne a turni.";
  const brevity = ` Resta breve e diretto: al massimo circa ${MAX_REPLY_CHARS} caratteri (poche frasi), mai un testo lungo o articolato.`;
  const body =
    previousSpeakerName === null
      ? `Sei tu ad aprire la discussione: ${openingOthers} non ha ancora detto nulla. Presenta la tua opinione o ` +
        "prospettiva sull'argomento proposto dall'utente, in modo naturale e conciso, " +
        `ponendo le basi per il confronto con ${openingOthers}. Non inventare né riassumere battute di ${openingOthers} che ` +
        "non sono ancora avvenute."
      : `Rispondi in modo naturale e conciso a ciò che ${previousSpeakerName} ha appena detto, ` +
        `portando avanti la discussione con opinioni, domande o osservazioni tue. Non ripetere semplicemente quello ` +
        `che ha detto ${previousSpeakerName}, e non chiudere subito la conversazione: contribuisci con qualcosa di nuovo.`;
  return { role: "system", content: `${intro} ${body}${brevity}${toolsNote}` };
}

// Ridotto da 8 a 6 (Task #157): con Bowie su llama3.2:3b la latenza reale è
// ~90-120s a turno (vedi .agents/memory/bowie-real-model-quality-check.md),
// quindi 8 turni potevano superare i 12-16 minuti per una conversazione che
// l'utente guarda dal vivo. 6 turni restano una discussione completa
// (apertura + repliche da entrambi i lati) ma tagliano il caso peggiore a
// circa 9-12 minuti. Non cambia la qualità né il turn-taking (già verificati
// nel Task #150), solo quanti turni avvengono di default.
const DEFAULT_MAX_TURNS = 6;
const MAX_ALLOWED_TURNS = 20;
// Stima usata SOLO per dare all'utente un'idea di durata prima/durante la
// conversazione (vedi evento turn_start più sotto): non è una garanzia, è la
// mediana osservata dal vivo per un turno di Bowie/Horus sul tunnel CPU
// condiviso.
const ESTIMATED_SECONDS_PER_TURN = 105;

// L'identificativo di un agente conversazionale è un `string` generico, non
// più un'unione fissa a due valori: la conversazione osservabile è
// generalizzata a N interlocutori (vedi il registry più in basso).
type ConvoAgent = string;

interface ConvoTurn {
  agent: ConvoAgent;
  content: string;
}

/**
 * Definizione statica di un agente conversazionale. Aggiungere un terzo
 * interlocutore in futuro (es. "Quebracho") richiede solo di aggiungere una
 * voce a questo registry — non un refactor della logica di turn-taking.
 */
export interface ConvoAgentConfig {
  id: string;
  displayName: string;
  chatRaw: typeof horusChatRaw;
  /** Opzioni passate a `chatRaw` per questo agente (es. Horus usa skipMemory). */
  chatOptions: { skipMemory?: boolean };
  /** Nota aggiunta in coda al system prompt (es. Horus: nessun tool in questa modalità). */
  toolsNote: string;
  isConfigured: () => boolean;
  /** Messaggio mostrato quando questo agente non è configurato. */
  notConfiguredMessage: string;
}

/**
 * Costruisce il registry ordinato degli agenti della conversazione a partire
 * dalle dipendenze iniettabili. L'ordine determina l'alternanza dei turni
 * (turno `i` → `agents[i % agents.length]`), quindi Horus resta il primo a
 * parlare (turno 0) come nel comportamento storico. Per aggiungere un terzo
 * agente basta appendere qui una voce (e la relativa `chatRaw` in `deps`).
 */
function buildConvoAgentRegistry(deps: BowieConversationDeps): ConvoAgentConfig[] {
  // `chatRaw`/`isConfigured` restano iniettabili tramite `deps` (usati dai
  // test per script/mock), ma nome, opzioni, nota tool e messaggio "non
  // configurato" vengono dalla stessa `AGENT_DEFINITIONS` che genera anche le
  // route di health-check/chat diretta sopra: un solo posto da aggiornare per
  // aggiungere un agente o cambiarne il testo.
  const chatRawById: Record<string, typeof horusChatRaw> = {
    horus: deps.horusChatRaw,
    bowie: deps.bowieChatRaw,
    quebracho: deps.quebrachoChatRaw,
  };
  const isConfiguredById: Record<string, () => boolean> = {
    horus: () => true,
    bowie: deps.isBowieConfigured,
    quebracho: deps.isQuebrachoConfigured,
  };
  return AGENT_DEFINITIONS.map((def) => ({
    id: def.id,
    displayName: def.displayName,
    chatRaw: chatRawById[def.id] ?? def.chatRaw,
    chatOptions: def.conversationChatOptions,
    toolsNote: def.conversationToolsNote,
    isConfigured: isConfiguredById[def.id] ?? def.isConfigured,
    notConfiguredMessage: def.conversationNotConfiguredMessage,
  }));
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
  quebrachoChatRaw: typeof quebrachoChatRaw;
  isQuebrachoConfigured: () => boolean;
  saveBowieConversation: (
    topic: string,
    transcript: ConvoTurn[],
    options: { status: "complete" | "interrupted"; conversationId?: number }
  ) => Promise<number>;
  /**
   * Override del registry degli agenti conversazionali. In produzione resta
   * `buildConvoAgentRegistry` (Horus + Bowie); i test lo sovrascrivono per
   * verificare che il turn-taking sia davvero generalizzato a N agenti senza
   * modifiche alla logica dell'handler.
   */
  buildAgentRegistry?: (deps: BowieConversationDeps) => ConvoAgentConfig[];
}

const defaultBowieConversationDeps: BowieConversationDeps = {
  horusChatRaw,
  bowieChatRaw,
  isBowieConfigured,
  quebrachoChatRaw,
  isQuebrachoConfigured,
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

    // Registry ordinato degli agenti della conversazione. L'ordine definisce
    // l'alternanza dei turni: turno `i` → `agents[i % agents.length]`. Con due
    // agenti (Horus, Bowie) questo equivale esattamente all'alternanza storica
    // che partiva da Horus.
    const agents = (deps.buildAgentRegistry ?? buildConvoAgentRegistry)(deps);
    const agentIds = new Set(agents.map((a) => a.id));

    // Se il client ci ripassa la trascrizione già ottenuta (dopo un errore o
    // uno stallo a metà conversazione), riprendiamo da lì invece di ripartire
    // da zero: l'utente non deve perdere i turni già completati per un
    // singolo drop-out di uno degli agenti.
    //
    // Il prossimo turno viene attribuito solo in base a `transcript.length %
    // agents.length` (vedi sotto), quindi una trascrizione manomessa o
    // corrotta che non rispetti davvero l'alternanza del registry a partire
    // dal primo agente farebbe silenziosamente "scivolare" l'attribuzione dei
    // turni successivi. Validiamo la forma prima di fidarci della lunghezza:
    // se non è la corretta alternanza (agents[0]→agents[1]→…→agents[0]…),
    // rifiutiamo la richiesta con 400 invece di proseguire su un presupposto
    // corrotto.
    const rawResumeTranscript: ConvoTurn[] = Array.isArray(resumeTranscript)
      ? resumeTranscript.filter(
          (t): t is ConvoTurn =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as ConvoTurn).agent === "string" &&
            agentIds.has((t as ConvoTurn).agent) &&
            typeof (t as ConvoTurn).content === "string"
        )
      : [];

    const isValidAlternation = (turns: ConvoTurn[]): boolean =>
      turns.every((t, i) => t.agent === agents[i % agents.length]!.id);

    if (Array.isArray(resumeTranscript) && resumeTranscript.length > 0 && !isValidAlternation(rawResumeTranscript)) {
      res.status(400).json({
        error: `resumeTranscript is malformed: turns must strictly alternate starting with ${agents[0]!.id}`,
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

    // Basta un solo agente non configurato per non poter tenere la
    // conversazione: segnaliamo il primo che manca con il suo messaggio
    // dedicato. Con Horus (sempre configurato) + Bowie questo equivale a
    // controllare che Bowie sia configurato, come prima.
    const unconfiguredAgent = agents.find((a) => !a.isConfigured());
    if (unconfiguredAgent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      sendEvent(res, "error", {
        message: unconfiguredAgent.notConfiguredMessage,
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

    // L'agente del prossimo turno si alterna secondo l'ordine del registry
    // partendo dal primo (Horus) al turno 0, quindi se riprendiamo da una
    // trascrizione esistente dobbiamo continuare l'alternanza da dove si era
    // fermata, non ripartire dal primo agente.
    let failingAgent: ConvoAgentConfig | null = null;

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

        const agentConfig = agents[i % agents.length]!;
        const agent = agentConfig.id;
        failingAgent = agentConfig;
        // `turnNumber`/`totalTurns`/`estimatedSecondsPerTurn` non guidano la
        // logica server-side (già decisa da `totalTurns` sopra): servono solo
        // al client per mostrare un'attesa realistica ("turno 2 di 6, circa
        // X min rimanenti") invece di far sembrare la conversazione bloccata
        // (Task #157).
        sendEvent(res, "turn_start", {
          agent,
          turnNumber: i + 1,
          totalTurns,
          estimatedSecondsPerTurn: ESTIMATED_SECONDS_PER_TURN,
        });

        // Nomi degli altri interlocutori e chi ha parlato per ultimo:
        // servono al system prompt per l'apertura vs. la risposta. Con due
        // agenti l'unico "altro" coincide sempre con chi ha appena parlato,
        // quindi l'output resta identico al comportamento storico.
        const otherNames = agents.filter((a) => a.id !== agent).map((a) => a.displayName);
        const lastTurn = transcript[transcript.length - 1];
        const previousSpeakerName =
          lastTurn === undefined
            ? null
            : (agents.find((a) => a.id === lastTurn.agent)?.displayName ?? lastTurn.agent);

        const messages = buildAgentMessages(
          buildConvoSystemPrompt({
            selfName: agentConfig.displayName,
            otherNames,
            previousSpeakerName,
            toolsNote: agentConfig.toolsNote,
          }),
          topic,
          transcript,
          agent
        );

        const { content } = await agentConfig.chatRaw(messages, {
          ...agentConfig.chatOptions,
          maxTokens: MAX_REPLY_TOKENS,
          signal: abortController.signal,
          onToken: (token) => sendEvent(res, "token", { agent, token }),
        });

        if (abortController.signal.aborted) break;

        const finalContent = truncateReply(content, false) || "(nessuna risposta)";
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
        req.log.error({ err, agent: failingAgent?.id ?? null }, "horus-bowie conversation failed");
        const agentName = failingAgent?.displayName ?? null;
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
          agent: failingAgent?.id ?? null,
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
