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
 */

const OLLAMA_URL = process.env.HORUS_OLLAMA_URL;
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

export const HORUS_MODEL = "bikerlink:latest";

export interface HorusMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HorusChatOptions {
  maxTokens?: number;
  timeoutMs?: number;
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

  const timeoutMs = options.timeoutMs ?? 5 * 60_000; // 5 minuti default (CPU lenta)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
        messages,
        stream: false,
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

    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
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
