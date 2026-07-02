/**
 * Tool disponibili per Horus durante la chat interattiva (function calling
 * nativo di Ollama — confermato supportato da bikerlink:latest).
 *
 * Importante: l'esecuzione dei tool avviene sempre lato client (qui), mai sul
 * server Ollama/TC. Quando il modello richiede un tool_call, noi eseguiamo la
 * chiamata reale (fetch web, GitHub API, scrittura su file) e rimandiamo il
 * risultato al modello come messaggio role:"tool".
 *
 * Tool disponibili:
 *  - web_search    — ricerca sul web, con backend a cascata (dal più al meno
 *                     preferito): (1) HORUS_SEARXNG_URL — istanza self-hosted
 *                     di SearXNG (motore di meta-ricerca open source e
 *                     gratuito, aggrega Google/Bing/DDG), se in futuro viene
 *                     installata su TC; (2) SERPER_API_KEY — risultati reali
 *                     di Google via serper.dev (attivo oggi); (3) fallback
 *                     keyless sulla DuckDuckGo Instant Answer API (limitata
 *                     a contenuti enciclopedici) se nessuna delle due sopra
 *                     è configurata.
 *  - github_read   — lettura file/cartelle dal repo pubblico Andreamasteri/Bikerlink
 *                     (SOLO lettura: nessun token con permessi push viene usato qui,
 *                     anche se l'integrazione GitHub connessa ne avrebbe la possibilità)
 *  - remember_note — salva una nota permanente in inbox/horus-memory.md, decisa
 *                     autonomamente dal modello quando ritiene qualcosa degno di
 *                     essere ricordato tra una sessione e l'altra
 */

import type { HorusToolSpec } from "./horus-client.js";
import { appendHorusMemory } from "./horus-client.js";

const GITHUB_REPO = "Andreamasteri/Bikerlink";
const GITHUB_API = "https://api.github.com";

export const HORUS_TOOLS: HorusToolSpec[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Cerca informazioni aggiornate sul web (notizie, fatti recenti, dati che non conosci). Restituisce una lista di risultati con titolo, URL e breve estratto.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La query di ricerca" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_read",
      description:
        `Legge un file o elenca il contenuto di una cartella dal repository pubblico GitHub ${GITHUB_REPO} (progetto BikerLink). Solo lettura.`,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Percorso nel repo (es. "package.json" o "src/"). Usa "" o "." per la root.',
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_note",
      description:
        "Salva una nota permanente nella tua memoria persistente, da ricordare anche nelle conversazioni future. Usalo quando l'utente ti dice qualcosa di importante da non dimenticare (una preferenza, una correzione, un'informazione su di sé o sul progetto), anche se non te lo chiede esplicitamente con un comando.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "Il testo della nota da ricordare, conciso e chiaro" },
        },
        required: ["note"],
      },
    },
  },
];

interface DdgRelatedTopic {
  Text?: string;
  FirstURL?: string;
}

interface DdgInstantAnswer {
  Abstract?: string;
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Answer?: string;
  Definition?: string;
  DefinitionSource?: string;
  Heading?: string;
  RelatedTopics?: DdgRelatedTopic[];
}

interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

/**
 * Ricerca via istanza self-hosted di SearXNG (gratuita, aggrega Google/Bing/
 * DuckDuckGo/altri). Richiede HORUS_SEARXNG_URL e opzionalmente le stesse
 * credenziali Cloudflare Access già usate per Ollama, se l'hostname è
 * protetto dalla stessa Access Application/Service Token.
 */
async function searxngSearch(query: string, searxngUrl: string): Promise<string> {
  const cfClientId = process.env["CF_ACCESS_CLIENT_ID"];
  const cfClientSecret = process.env["CF_ACCESS_CLIENT_SECRET"];
  const url = `${searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HorusBot/1.0)",
      ...(cfClientId && cfClientSecret
        ? { "CF-Access-Client-Id": cfClientId, "CF-Access-Client-Secret": cfClientSecret }
        : {}),
    },
  });
  if (!res.ok) {
    return `Ricerca SearXNG fallita (HTTP ${res.status}). Rispondi in base a quello che sai già, specificando che non hai potuto verificare online.`;
  }

  const data = (await res.json()) as SearxngResponse;
  const results = (data.results ?? []).slice(0, 5);
  if (results.length === 0) {
    return `Nessun risultato trovato per "${query}" tramite il motore di ricerca self-hosted.`;
  }

  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title ?? "(senza titolo)"}\n   ${r.url ?? ""}\n   ${(r.content ?? "").slice(0, 300)}`
    )
    .join("\n\n");
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperAnswerBox {
  title?: string;
  answer?: string;
  snippet?: string;
}

interface SerperKnowledgeGraph {
  title?: string;
  description?: string;
}

interface SerperResponse {
  answerBox?: SerperAnswerBox;
  knowledgeGraph?: SerperKnowledgeGraph;
  organic?: SerperOrganicResult[];
}

/**
 * Ricerca Google reale via serper.dev (API a pagamento con piano gratuito
 * limitato). Usata quando SERPER_API_KEY è configurata e non è disponibile
 * un'istanza SearXNG self-hosted (opzione gratuita preferita, vedi sopra).
 */
async function serperSearch(query: string, apiKey: string): Promise<string> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return `Ricerca Google (Serper) fallita (HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}). Rispondi in base a quello che sai già, specificando che non hai potuto verificare online.`;
  }

  const data = (await res.json()) as SerperResponse;
  const parts: string[] = [];

  if (data.answerBox) {
    const { title, answer, snippet } = data.answerBox;
    const text = answer ?? snippet;
    if (text) parts.push(`Risposta diretta${title ? ` (${title})` : ""}: ${text}`);
  }
  if (data.knowledgeGraph?.description) {
    parts.push(
      `${data.knowledgeGraph.title ? `${data.knowledgeGraph.title}: ` : ""}${data.knowledgeGraph.description}`
    );
  }
  if (data.organic?.length) {
    const results = data.organic
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title ?? "(senza titolo)"}\n   ${r.link ?? ""}\n   ${r.snippet ?? ""}`);
    parts.push(results.join("\n\n"));
  }

  if (parts.length === 0) {
    return `Nessun risultato trovato per "${query}" su Google. Rispondi in base a quello che sai già, specificando chiaramente questo limite.`;
  }

  return parts.join("\n\n");
}

/**
 * Ricerca keyless via DuckDuckGo Instant Answer API (endpoint pubblico
 * documentato, non scraping HTML — l'endpoint /html/ applica un anti-bot
 * challenge che blocca le richieste programmatiche). Copre bene domande
 * fattuali/enciclopediche; NON è una ricerca web completa (niente notizie
 * in tempo reale, niente risultati generici). Usata solo come ultima
 * risorsa quando né SearXNG né Serper sono configurati.
 */
async function duckDuckGoFallbackSearch(query: string): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HorusBot/1.0)" },
  });
  if (!res.ok) {
    return `Ricerca fallita (HTTP ${res.status}). Rispondi in base a quello che sai già, specificando che non hai potuto verificare online.`;
  }

  const data = (await res.json()) as DdgInstantAnswer;
  const parts: string[] = [];

  if (data.Answer) parts.push(`Risposta diretta: ${data.Answer}`);
  if (data.AbstractText) {
    parts.push(
      `${data.Heading ? `${data.Heading}: ` : ""}${data.AbstractText}${
        data.AbstractSource ? ` (fonte: ${data.AbstractSource}${data.AbstractURL ? `, ${data.AbstractURL}` : ""})` : ""
      }`
    );
  }
  if (data.Definition) {
    parts.push(`${data.Definition}${data.DefinitionSource ? ` (fonte: ${data.DefinitionSource})` : ""}`);
  }
  if (data.RelatedTopics?.length) {
    const related = data.RelatedTopics.filter((t) => t.Text)
      .slice(0, 5)
      .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
    if (related.length) parts.push(`Argomenti correlati:\n${related.join("\n")}`);
  }

  if (parts.length === 0) {
    return `Nessun risultato utile trovato per "${query}" tramite la ricerca disponibile (copre principalmente contenuti enciclopedici, non notizie in tempo reale). Rispondi in base a quello che sai già, specificando chiaramente questo limite se la domanda richiede dati aggiornati.`;
  }

  return parts.join("\n\n");
}

/**
 * Cerca sul web usando il miglior backend disponibile, in ordine di
 * preferenza: SearXNG self-hosted (gratuito) > Serper/Google (a pagamento,
 * attivo oggi) > DuckDuckGo Instant Answer (keyless, copertura limitata).
 */
async function webSearch(query: string): Promise<string> {
  const searxngUrl = process.env["HORUS_SEARXNG_URL"];
  if (searxngUrl) {
    return searxngSearch(query, searxngUrl);
  }

  const serperKey = process.env["SERPER_API_KEY"];
  if (serperKey) {
    return serperSearch(query, serperKey);
  }

  return duckDuckGoFallbackSearch(query);
}

async function githubRead(path: string): Promise<string> {
  const cleanPath = path.trim().replace(/^\/+/, "");
  const apiPath = cleanPath && cleanPath !== "." ? `/${cleanPath}` : "";
  const res = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents${apiPath}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "HorusBot",
      },
    }
  );

  if (res.status === 404) {
    return `Percorso "${cleanPath || "/"}" non trovato nel repo ${GITHUB_REPO}.`;
  }
  if (!res.ok) {
    return `Lettura GitHub fallita (HTTP ${res.status}) per "${cleanPath || "/"}".`;
  }

  const data = (await res.json()) as
    | { type: string; name: string }[]
    | { type: string; encoding?: string; content?: string; size?: number };

  if (Array.isArray(data)) {
    const entries = data
      .map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    return `Contenuto della cartella "${cleanPath || "/"}" in ${GITHUB_REPO}:\n${entries}`;
  }

  if (data.type === "file") {
    if (data.encoding === "base64" && data.content) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const truncated = content.length > 8000;
      return `File "${cleanPath}" (${data.size} bytes)${truncated ? " — troncato ai primi 8000 caratteri" : ""}:\n\n${content.slice(0, 8000)}`;
    }
    return `File "${cleanPath}" trovato ma non decodificabile (encoding: ${data.encoding}).`;
  }

  return `Percorso "${cleanPath || "/"}" non riconosciuto (tipo inatteso).`;
}

function rememberNote(note: string): string {
  appendHorusMemory(note);
  return `Nota salvata in memoria permanente: "${note}"`;
}

/**
 * Esegue un tool richiesto dal modello e restituisce il testo del risultato
 * da rimandare come messaggio role:"tool".
 */
export async function executeHorusTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "web_search":
        return await webSearch(String(args.query ?? ""));
      case "github_read":
        return await githubRead(String(args.path ?? ""));
      case "remember_note":
        return rememberNote(String(args.note ?? ""));
      default:
        return `Tool sconosciuto: "${name}".`;
    }
  } catch (err) {
    return `Errore nell'esecuzione del tool "${name}": ${err instanceof Error ? err.message : String(err)}`;
  }
}
