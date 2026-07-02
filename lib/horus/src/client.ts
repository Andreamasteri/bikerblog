/**
 * Horus — client per il modello Ollama locale (server ThinkCentre "TC" di BikerLink,
 * raggiunto tramite tunnel Cloudflare + Cloudflare Access Service Token).
 *
 * Sostituisce Claude per generazione post diario e traduzioni IT→EN, ed è
 * anche il client usato dalla chat interattiva (CLI e web).
 *
 * Env richiesti:
 *   HORUS_OLLAMA_URL        — URL Cloudflare del server Ollama (es. https://ollama-tc.biker-link.net)
 *   CF_ACCESS_CLIENT_ID     — Service Token Cloudflare Access (Client ID)
 *   CF_ACCESS_CLIENT_SECRET — Service Token Cloudflare Access (Client Secret)
 *
 * Nota: il server è un Ollama consumer-grade (CPU), le risposte possono richiedere
 * da alcune decine di secondi a qualche minuto per prompt lunghi (es. traduzione
 * di un intero post). Timeout di default generoso per questo motivo.
 *
 * Memoria persistente: Ollama non ricorda nulla tra una richiesta e l'altra.
 * Per dare a Horus continuità, ogni chiamata allega automaticamente il contenuto
 * di inbox/horus-memory.md come messaggio di sistema (note, correzioni, convenzioni
 * imparate nel tempo). Usa `appendHorusMemory()` per aggiungere una nota, oppure
 * `pnpm --filter @workspace/scripts run horus:remember -- "nota"`.
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

const OLLAMA_URL = process.env.HORUS_OLLAMA_URL;
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

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
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
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

function assertConfigured(): void {
  if (!OLLAMA_URL) {
    throw new Error(
      "HORUS_OLLAMA_URL non configurato — impossibile contattare Horus (Ollama su TC)."
    );
  }
}

/**
 * Invia una conversazione a Horus e restituisce sia il testo che eventuali
 * tool_calls richiesti dal modello (function calling nativo di Ollama).
 * Non lancia errore se il contenuto è vuoto (caso normale quando il modello
 * chiede solo un tool_call, senza testo).
 */
export async function horusChatRaw(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<HorusRawResult> {
  assertConfigured();

  const memory = options.skipMemory ? "" : loadHorusMemory();
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

  try {
    // Streaming: senza questo, Cloudflare Tunnel chiude la connessione dopo
    // ~100s di silenzio (errore 524) mentre Ollama genera in CPU. Con lo
    // streaming i byte arrivano di continuo e la connessione resta viva anche
    // per generazioni di diversi minuti. Confermato che i tool_calls arrivano
    // regolarmente anche con stream:true (in un chunk con done:false).
    const res = await fetch(`${OLLAMA_URL!.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CF_CLIENT_ID && CF_CLIENT_SECRET
          ? {
              "CF-Access-Client-Id": CF_CLIENT_ID,
              "CF-Access-Client-Secret": CF_CLIENT_SECRET,
            }
          : {}),
      },
      body: JSON.stringify({
        model: HORUS_MODEL,
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
      throw new Error(
        `Horus request failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`
      );
    }

    if (!res.body) {
      throw new Error("Horus: risposta senza body (stream non disponibile)");
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
          throw new Error(`Horus streaming error: ${chunk.error}`);
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
      throw new Error(`Horus request timeout dopo ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invia una conversazione a Horus e restituisce il testo della risposta.
 * Lancia un errore se la richiesta fallisce o la risposta è vuota.
 * Per conversazioni con tool calling usa `horusChatRaw`.
 */
export async function horusChat(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<string> {
  const { content } = await horusChatRaw(messages, options);
  if (!content) {
    throw new Error("Horus: risposta vuota");
  }
  return content;
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
