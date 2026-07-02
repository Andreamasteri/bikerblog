/**
 * Horus — client per il modello Ollama locale (server ThinkCentre "TC" di BikerLink,
 * raggiunto tramite tunnel Cloudflare + Cloudflare Access Service Token).
 *
 * Sostituisce Claude per generazione post diario e traduzioni IT→EN.
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
const MEMORY_FILE = resolve(__dirname, "..", "..", "inbox", "horus-memory.md");

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
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HorusChatOptions {
  maxTokens?: number;
  timeoutMs?: number;
  /** Chiamato per ogni frammento di testo ricevuto in streaming (es. per stampa live in una CLI). */
  onToken?: (token: string) => void;
}

function assertConfigured(): void {
  if (!OLLAMA_URL) {
    throw new Error(
      "HORUS_OLLAMA_URL non configurato — impossibile contattare Horus (Ollama su TC)."
    );
  }
}

/**
 * Invia una conversazione a Horus e restituisce il testo della risposta.
 * Lancia un errore se la richiesta fallisce o la risposta è vuota.
 */
export async function horusChat(
  messages: HorusMessage[],
  options: HorusChatOptions = {}
): Promise<string> {
  assertConfigured();

  const memory = loadHorusMemory();
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
    // per generazioni di diversi minuti.
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

        let chunk: { message?: { content?: string }; done?: boolean; error?: string };
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
      }
    }

    const text = full.trim();
    if (!text) {
      throw new Error("Horus: risposta vuota");
    }
    return text;
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
