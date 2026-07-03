/**
 * Client generico per un "agente Ollama" raggiunto tramite tunnel Cloudflare
 * (URL + Cloudflare Access Service Token) sullo stesso server ThinkCentre
 * "TC" di BikerLink. Usato sia da Horus (`bikerlink:latest`, generazione
 * contenuti + chat interattiva) sia da Bowie (chat osservabile Horus↔Bowie).
 *
 * Horus resta il client di default esportato da questo modulo (stesso
 * comportamento e stessi export di sempre): sostituisce Claude per
 * generazione post diario e traduzioni IT→EN, ed è anche il client usato
 * dalla chat interattiva (CLI e web).
 *
 * Env richiesti per Horus:
 *   HORUS_OLLAMA_URL        — URL Cloudflare del server Ollama (es. https://ollama-tc.biker-link.net)
 *   CF_ACCESS_CLIENT_ID     — Service Token Cloudflare Access (Client ID)
 *   CF_ACCESS_CLIENT_SECRET — Service Token Cloudflare Access (Client Secret)
 *
 * Env per Bowie (vedi `getBowieClient()`):
 *   BOWIE_OLLAMA_MODEL          — nome del modello Ollama di Bowie (richiesto per abilitarlo)
 *   BOWIE_OLLAMA_URL            — opzionale, default HORUS_OLLAMA_URL (stesso tunnel)
 *   BOWIE_CF_ACCESS_CLIENT_ID   — opzionale, default CF_ACCESS_CLIENT_ID
 *   BOWIE_CF_ACCESS_CLIENT_SECRET — opzionale, default CF_ACCESS_CLIENT_SECRET
 *
 * Nota: il server è un Ollama consumer-grade (CPU), le risposte possono richiedere
 * da alcune decine di secondi a qualche minuto per prompt lunghi (es. traduzione
 * di un intero post). Timeout di default generoso per questo motivo.
 *
 * Memoria persistente: Ollama non ricorda nulla tra una richiesta e l'altra.
 * Per dare a Horus continuità, ogni chiamata allega automaticamente il contenuto
 * di inbox/horus-memory.md come messaggio di sistema (note, correzioni, convenzioni
 * imparate nel tempo). Usa `appendHorusMemory()` per aggiungere una nota, oppure
 * `pnpm --filter @workspace/scripts run horus:remember -- "nota"`. Bowie non
 * condivide questa memoria (è un agente distinto con la propria identità).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib/horus/src -> lib/horus -> lib -> root -> inbox
const MEMORY_FILE = resolve(__dirname, "..", "..", "..", "inbox", "horus-memory.md");

const MEMORY_HEADER = `# Memoria di Horus

Note persistenti, correzioni e convenzioni da rispettare sempre nella
generazione di contenuti per BikerBlog. Aggiunte con:
\`pnpm --filter @workspace/scripts run horus:remember -- "nota"\`
`;

export const HORUS_MODEL = "bikerlink:latest";

/** Legge la memoria persistente di Horus (vuota se il file non esiste ancora). */
export function loadHorusMemory(): string {
  if (!existsSync(MEMORY_FILE)) return "";
  try {
    const content = readFileSync(MEMORY_FILE, "utf-8").trim();
    return content === MEMORY_HEADER.trim() ? "" : content;
  } catch {
    return "";
  }
}

/** Aggiunge una nota permanente alla memoria di Horus (con data). */
export function appendHorusMemory(note: string): void {
  mkdirSync(dirname(MEMORY_FILE), { recursive: true });
  if (!existsSync(MEMORY_FILE)) {
    writeFileSync(MEMORY_FILE, MEMORY_HEADER, "utf-8");
  }
  const date = new Date().toISOString().slice(0, 10);
  appendFileSync(MEMORY_FILE, `\n- [${date}] ${note}\n`, "utf-8");
}

export interface HorusMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Solo per messaggi role:"tool" — nome del tool a cui questo risultato risponde. */
  name?: string;
  /** Solo per messaggi role:"assistant" che hanno richiesto dei tool. */
  tool_calls?: HorusToolCall[];
}

export interface HorusToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface HorusToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: string;
          description?: string;
          enum?: string[];
          items?: { type: string };
        }
      >;
      required?: string[];
    };
  };
}

export interface HorusChatOptions {
  maxTokens?: number;
  timeoutMs?: number;
  /** Chiamato per ogni frammento di testo ricevuto in streaming (es. per stampa live in una CLI). */
  onToken?: (token: string) => void;
  /** Tool disponibili (function calling nativo di Ollama). */
  tools?: HorusToolSpec[];
  /** Se true, non allega la memoria persistente come system message (usato quando il chiamante la gestisce da sé). */
  skipMemory?: boolean;
  /** Segnale di abort esterno (es. per interrompere una conversazione multi-turno su richiesta dell'utente). */
  signal?: AbortSignal;
  /**
   * Per quanto tempo Ollama tiene il modello caricato in RAM dopo questa
   * richiesta (formato Ollama, es. "30m", "-1" per sempre). Se il modello
   * viene scaricato tra un messaggio e l'altro (default Ollama: 5 minuti di
   * inattività), ogni nuovo messaggio paga il costo di ricaricarlo da disco
   * prima ancora di iniziare a generare — è spesso la causa principale di
   * lentezza percepita in una chat con pause tra i messaggi.
   */
  keepAlive?: string;
}

export interface HorusRawResult {
  content: string;
  toolCalls: HorusToolCall[];
}

/**
 * Esito di un controllo di raggiungibilità leggero verso un agente Ollama,
 * distinto in tre stati: env var mancanti ("not_configured", errore di setup
 * da correggere), configurato ma non risponde ("unreachable", es. tunnel o
 * Ollama giù sul server dell'utente), oppure raggiungibile ("ok"). Usato per
 * mostrare all'utente un messaggio chiaro prima ancora che apra la chat,
 * invece di un pannello vuoto che sembra pronto ma non lo è.
 */
export type OllamaAgentHealth =
  | { status: "not_configured" }
  | { status: "ok"; model: string }
  | { status: "unreachable"; detail?: string; model?: string };

/** Configurazione di un agente Ollama generico (Horus, Bowie, o altri in futuro). */
export interface OllamaAgentConfig {
  /** Nome leggibile dell'agente, usato solo nei messaggi di errore. */
  agentName: string;
  ollamaUrl: string | undefined;
  cfAccessClientId: string | undefined;
  cfAccessClientSecret: string | undefined;
  model: string;
  /** Se true, allega la memoria persistente di Horus (inbox/horus-memory.md) di default. */
  useHorusMemoryByDefault: boolean;
}

export interface OllamaAgentClient {
  chatRaw: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<HorusRawResult>;
  chat: (messages: HorusMessage[], options?: HorusChatOptions) => Promise<string>;
  isConfigured: () => boolean;
  checkHealth: () => Promise<OllamaAgentHealth>;
}

/** Timeout per il controllo di raggiungibilità: deve essere molto più corto
 * del timeout di chat (5 minuti) perché qui vogliamo solo sapere in fretta
 * se il server risponde, non aspettare una generazione. */
const HEALTH_CHECK_TIMEOUT_MS = 6_000;

/** Status code tipici di un gateway/tunnel che ha interrotto la richiesta
 * prima che Ollama potesse rispondere (es. Cloudflare Tunnel 524 dopo un
 * timeout su una generazione molto pesante). */
const GATEWAY_TIMEOUT_STATUSES = new Set([502, 503, 504, 524]);

/**
 * Errore lanciato quando il gateway/tunnel (tipicamente il Cloudflare Tunnel
 * verso il server TC dell'utente) interrompe la richiesta prima che Ollama
 * risponda — HTTP 502/503/504/524, oppure la connessione chiusa a metà stream.
 * È distinto da un `Error` generico apposta: il chiamante (es. la chat web in
 * `createDirectChatHandler`) può riconoscerlo con `isGatewayTimeoutError` e
 * reagire con un fallback dedicato (riprovare senza tool, con un prompt più
 * piccolo che genera in fretta e resta sotto il tetto ~100s del tunnel) invece
 * di trattarlo come un errore fatale qualsiasi.
 */
export class OllamaGatewayTimeoutError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OllamaGatewayTimeoutError";
    this.status = status;
  }
}

/**
 * Vero se l'errore è un timeout del gateway/tunnel: sia il caso "pulito" (un
 * vero HTTP 524/502/503/504 → `OllamaGatewayTimeoutError`) sia il caso in cui
 * il tunnel chiude la connessione a metà stream, che `fetch` riporta come un
 * `TypeError` con "terminated"/"other side closed"/"fetch failed" invece di uno
 * status HTTP. Entrambi indicano lo stesso problema (la richiesta non ha retto
 * fino alla risposta) e giustificano lo stesso fallback best-effort.
 */
export function isGatewayTimeoutError(err: unknown): boolean {
  if (err instanceof OllamaGatewayTimeoutError) return true;
  if (err instanceof Error) {
    return /terminated|other side closed|fetch failed/i.test(err.message);
  }
  return false;
}

/** Vero se il corpo della risposta sembra una pagina HTML di errore
 * (tipica dei gateway/edge come Cloudflare) invece di testo/JSON da Ollama. */
function looksLikeHtmlErrorPage(body: string): boolean {
  const trimmed = body.trimStart().slice(0, 200).toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

/**
 * Costruisce il messaggio di errore per una risposta non-OK. Quando la
 * risposta è chiaramente un timeout del gateway/tunnel (status tipico +
 * corpo HTML invece di testo/JSON da Ollama), restituisce un messaggio breve
 * e comprensibile in italiano invece di incollare l'HTML grezzo nel
 * messaggio (che finirebbe altrimenti mostrato così com'è in chat).
 */
function buildRequestFailedMessage(
  agentName: string,
  status: number,
  statusText: string,
  body: string
): string {
  if (GATEWAY_TIMEOUT_STATUSES.has(status) && looksLikeHtmlErrorPage(body)) {
    return (
      `${agentName} non ha risposto in tempo: la richiesta è stata interrotta dal tunnel ` +
      `(timeout del gateway, HTTP ${status}). Probabilmente il compito era troppo pesante o lungo. ` +
      `Riprova con una richiesta più piccola o più specifica.`
    );
  }
  return `${agentName} request failed: ${status} ${statusText} — ${body.slice(0, 300)}`;
}

/**
 * Crea un client per un agente Ollama parametrico (URL, credenziali
 * Cloudflare Access, modello, keep-alive). Horus e Bowie sono entrambi
 * istanze di questo client con configurazioni diverse — la logica di
 * streaming/keep-alive/tool-calling non è duplicata.
 */
export function createOllamaAgentClient(config: OllamaAgentConfig): OllamaAgentClient {
  function isConfigured(): boolean {
    return Boolean(config.ollamaUrl && config.model);
  }

  function assertConfigured(): void {
    if (!config.ollamaUrl) {
      throw new Error(
        `${config.agentName}: URL Ollama non configurato — impossibile contattare l'agente.`
      );
    }
    if (!config.model) {
      throw new Error(`${config.agentName}: nome modello non configurato.`);
    }
  }

  async function chatRaw(
    messages: HorusMessage[],
    options: HorusChatOptions = {}
  ): Promise<HorusRawResult> {
    assertConfigured();

    const attachMemory = options.skipMemory === undefined
      ? config.useHorusMemoryByDefault
      : !options.skipMemory;
    const memory = attachMemory ? loadHorusMemory() : "";
    const finalMessages: HorusMessage[] = memory
      ? [
          {
            role: "system",
            content: `Memoria persistente di Horus — note e correzioni da rispettare sempre:\n\n${memory}`,
          },
          ...messages,
        ]
      : messages;

    const timeoutMs = options.timeoutMs ?? 5 * 60_000; // 5 minuti default (CPU lenta)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort);

    try {
      // Streaming: senza questo, Cloudflare Tunnel chiude la connessione dopo
      // ~100s di silenzio (errore 524) mentre Ollama genera in CPU. Con lo
      // streaming i byte arrivano di continuo e la connessione resta viva anche
      // per generazioni di diversi minuti. Confermato che i tool_calls arrivano
      // regolarmente anche con stream:true (in un chunk con done:false).
      const res = await fetch(`${config.ollamaUrl!.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.cfAccessClientId && config.cfAccessClientSecret
            ? {
                "CF-Access-Client-Id": config.cfAccessClientId,
                "CF-Access-Client-Secret": config.cfAccessClientSecret,
              }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: finalMessages,
          stream: true,
          keep_alive: options.keepAlive ?? "30m",
          ...(options.tools ? { tools: options.tools } : {}),
          options: {
            num_predict: options.maxTokens ?? 4096,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const message = buildRequestFailedMessage(config.agentName, res.status, res.statusText, body);
        if (GATEWAY_TIMEOUT_STATUSES.has(res.status)) {
          throw new OllamaGatewayTimeoutError(message, res.status);
        }
        throw new Error(message);
      }

      if (!res.body) {
        throw new Error(`${config.agentName}: risposta senza body (stream non disponibile)`);
      }

      let full = "";
      let buffer = "";
      const toolCalls: HorusToolCall[] = [];
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;

          let chunk: {
            message?: { content?: string; tool_calls?: HorusToolCall[] };
            done?: boolean;
            error?: string;
          };
          try {
            chunk = JSON.parse(line);
          } catch {
            continue;
          }
          if (chunk.error) {
            throw new Error(`${config.agentName} streaming error: ${chunk.error}`);
          }
          if (chunk.message?.content) {
            full += chunk.message.content;
            options.onToken?.(chunk.message.content);
          }
          if (chunk.message?.tool_calls?.length) {
            toolCalls.push(...chunk.message.tool_calls);
          }
        }
      }

      return { content: full.trim(), toolCalls };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (options.signal?.aborted) {
          throw new Error(`${config.agentName}: conversazione interrotta dall'utente`);
        }
        throw new Error(`${config.agentName} request timeout dopo ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  async function chat(messages: HorusMessage[], options: HorusChatOptions = {}): Promise<string> {
    const { content } = await chatRaw(messages, options);
    if (!content) {
      throw new Error(`${config.agentName}: risposta vuota`);
    }
    return content;
  }

  /**
   * Controllo di raggiungibilità leggero: distingue "non configurato" (env
   * var mancanti, errore di setup) da "configurato ma non risponde" (tunnel
   * Cloudflare o Ollama giù sul server dell'utente), usando l'endpoint più
   * economico di Ollama (/api/version) invece di /api/chat, che caricherebbe
   * inutilmente il modello in RAM solo per un ping.
   */
  async function checkHealth(): Promise<OllamaAgentHealth> {
    if (!isConfigured()) return { status: "not_configured" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${config.ollamaUrl!.replace(/\/$/, "")}/api/version`, {
        method: "GET",
        headers: {
          ...(config.cfAccessClientId && config.cfAccessClientSecret
            ? {
                "CF-Access-Client-Id": config.cfAccessClientId,
                "CF-Access-Client-Secret": config.cfAccessClientSecret,
              }
            : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { status: "unreachable", detail: `HTTP ${res.status}`, model: config.model };
      }
      return { status: "ok", model: config.model };
    } catch (err) {
      return {
        status: "unreachable",
        detail: err instanceof Error ? err.message : "errore sconosciuto",
        model: config.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { chatRaw, chat, isConfigured, checkHealth };
}

const horusClient = createOllamaAgentClient({
  agentName: "Horus",
  ollamaUrl: process.env.HORUS_OLLAMA_URL,
  cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID,
  cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
  model: HORUS_MODEL,
  useHorusMemoryByDefault: true,
});

/**
 * Invia una conversazione a Horus e restituisce sia il testo che eventuali
 * tool_calls richiesti dal modello (function calling nativo di Ollama).
 * Non lancia errore se il contenuto è vuoto (caso normale quando il modello
 * chiede solo un tool_call, senza testo).
 */
export function horusChatRaw(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<HorusRawResult> {
  return horusClient.chatRaw(messages, options);
}

/** True se Horus è configurato (HORUS_OLLAMA_URL impostato). */
export function isHorusConfigured(): boolean {
  return horusClient.isConfigured();
}

/** Controllo di raggiungibilità leggero per Horus, vedi `OllamaAgentHealth`. */
export function checkHorusHealth(): Promise<OllamaAgentHealth> {
  return horusClient.checkHealth();
}

/**
 * Invia una conversazione a Horus e restituisce il testo della risposta.
 * Lancia un errore se la richiesta fallisce o la risposta è vuota.
 * Per conversazioni con tool calling usa `horusChatRaw`.
 */
export function horusChat(messages: HorusMessage[], options: HorusChatOptions = {}): Promise<string> {
  return horusClient.chat(messages, options);
}

export const BOWIE_AGENT_NAME = "Bowie";

/**
 * Client di Bowie, la seconda IA più leggera installata sullo stesso TC di
 * Horus. Riusa lo stesso tunnel/credenziali di Horus per default (stesso
 * meccanismo di rete), a meno che non vengano configurate env var dedicate:
 *   BOWIE_OLLAMA_MODEL            — richiesto per abilitare Bowie
 *   BOWIE_OLLAMA_URL              — opzionale, default HORUS_OLLAMA_URL
 *   BOWIE_CF_ACCESS_CLIENT_ID     — opzionale, default CF_ACCESS_CLIENT_ID
 *   BOWIE_CF_ACCESS_CLIENT_SECRET — opzionale, default CF_ACCESS_CLIENT_SECRET
 * Bowie non allega la memoria persistente di Horus per default: è un agente
 * distinto con la propria identità, non un alter ego di Horus.
 */
const bowieClient = createOllamaAgentClient({
  agentName: BOWIE_AGENT_NAME,
  ollamaUrl: process.env.BOWIE_OLLAMA_URL || process.env.HORUS_OLLAMA_URL,
  cfAccessClientId: process.env.BOWIE_CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID,
  cfAccessClientSecret:
    process.env.BOWIE_CF_ACCESS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET,
  model: process.env.BOWIE_OLLAMA_MODEL ?? "",
  useHorusMemoryByDefault: false,
});

/** True se Bowie è configurato (BOWIE_OLLAMA_MODEL impostato e un URL disponibile). */
export function isBowieConfigured(): boolean {
  return bowieClient.isConfigured();
}

/** Controllo di raggiungibilità leggero per Bowie, vedi `OllamaAgentHealth`. */
export function checkBowieHealth(): Promise<OllamaAgentHealth> {
  return bowieClient.checkHealth();
}

/** Invia una conversazione a Bowie e restituisce testo + eventuali tool_calls. */
export function bowieChatRaw(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<HorusRawResult> {
  return bowieClient.chatRaw(messages, options);
}

export const QUEBRACHO_AGENT_NAME = "Quebracho";

/**
 * Client di Quebracho, il terzo interlocutore della conversazione osservabile
 * (dal cane dell'utente, uno dei "fondatori" del progetto — vedi
 * replit.md). Stessa architettura parametrica di Bowie: riusa di default il
 * tunnel/credenziali di Horus, a meno che non vengano configurate env var
 * dedicate:
 *   QUEBRACHO_OLLAMA_MODEL            — richiesto per abilitarlo
 *   QUEBRACHO_OLLAMA_URL              — opzionale, default HORUS_OLLAMA_URL
 *   QUEBRACHO_CF_ACCESS_CLIENT_ID     — opzionale, default CF_ACCESS_CLIENT_ID
 *   QUEBRACHO_CF_ACCESS_CLIENT_SECRET — opzionale, default CF_ACCESS_CLIENT_SECRET
 * Non allega la memoria persistente di Horus per default: è un agente
 * distinto con la propria identità, non un alter ego di Horus.
 */
const quebrachoClient = createOllamaAgentClient({
  agentName: QUEBRACHO_AGENT_NAME,
  ollamaUrl: process.env.QUEBRACHO_OLLAMA_URL || process.env.HORUS_OLLAMA_URL,
  cfAccessClientId: process.env.QUEBRACHO_CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID,
  cfAccessClientSecret:
    process.env.QUEBRACHO_CF_ACCESS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET,
  model: process.env.QUEBRACHO_OLLAMA_MODEL ?? "",
  useHorusMemoryByDefault: false,
});

/** True se Quebracho è configurato (QUEBRACHO_OLLAMA_MODEL impostato e un URL disponibile). */
export function isQuebrachoConfigured(): boolean {
  return quebrachoClient.isConfigured();
}

/** Controllo di raggiungibilità leggero per Quebracho, vedi `OllamaAgentHealth`. */
export function checkQuebrachoHealth(): Promise<OllamaAgentHealth> {
  return quebrachoClient.checkHealth();
}

/** Invia una conversazione a Quebracho e restituisce testo + eventuali tool_calls. */
export function quebrachoChatRaw(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<HorusRawResult> {
  return quebrachoClient.chatRaw(messages, options);
}

/**
 * Estrae il primo blocco JSON da un testo, tollerando eventuali fence markdown
 * o testo esplicativo intorno (i modelli locali sono meno disciplinati di Claude
 * nel rispettare "solo JSON, nessun altro testo").
 */
export function extractJson(text: string): string {
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Nessun JSON trovato nella risposta di Horus");
  }
  return match[0];
}
