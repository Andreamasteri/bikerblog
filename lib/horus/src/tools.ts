/**
 * Tool disponibili per Horus durante la chat interattiva (function calling
 * nativo di Ollama — confermato supportato da bikerlink:latest). Usato sia
 * dalla chat CLI (`scripts/src/horus-chat.ts`) sia dalla chat web
 * (`artifacts/api-server/src/routes/horus.ts`).
 *
 * Importante: l'esecuzione dei tool avviene sempre lato client (qui), mai sul
 * server Ollama/TC. Quando il modello richiede un tool_call, noi eseguiamo la
 * chiamata reale (fetch web, GitHub API, scrittura su file) e rimandiamo il
 * risultato al modello come messaggio role:"tool".
 *
 * Tool disponibili:
 *  - web_search    — ricerca sul web, con backend a cascata (dal più al meno
 *                     preferito): (1) HORUS_SEARXNG_URL — istanza self-hosted
 *                     di SearXNG su TC (motore di meta-ricerca open source e
 *                     gratuito, aggrega Google/Bing/DDG), la stessa già usata
 *                     dall'ecosistema AI di BikerLink; protetta da un gate
 *                     nginx via header `X-Searxng-Key` + SEARXNG_GATE_TOKEN
 *                     (non Cloudflare Access); (2) SERPER_API_KEY — risultati
 *                     reali di Google via serper.dev, usato se SearXNG non è
 *                     configurato o fallisce la singola richiesta; (3)
 *                     fallback keyless sulla DuckDuckGo Instant Answer API
 *                     (limitata a contenuti enciclopedici) se nessuna delle
 *                     due sopra è disponibile.
 *  - github_read   — lettura file/cartelle da uno dei repo del progetto
 *                     (Andreamasteri/Bikerlink, Andreamasteri/bikerblog,
 *                     Andreamasteri/bikerweb). SOLO lettura: il token usato è
 *                     un fine-grained PAT dedicato a Horus, con permessi
 *                     Contents/Metadata read-only — mai il token
 *                     dell'integrazione GitHub di Replit (che ha permessi
 *                     push/admin su questo progetto). Ogni repo dichiara una
 *                     lista ordinata di env var candidate: se in futuro viene
 *                     aggiunto un token più specifico (es.
 *                     GITHUB_TOKEN_BIKERLINK), basta impostarlo — ha priorità
 *                     automaticamente, senza altre modifiche al codice. Se
 *                     nessun token è configurato per un repo, si ricade in
 *                     lettura anonima (rate limit pubblico più basso, stesso
 *                     comportamento funzionale).
 *  - remember_note — salva una nota permanente in inbox/horus-memory.md, decisa
 *                     autonomamente dal modello quando ritiene qualcosa degno di
 *                     essere ricordato tra una sessione e l'altra
 *  - read_blog     — legge i contenuti PUBBLICATI di BikerBlog (non il codice)
 *                     tramite gli endpoint pubblici e di sola lettura
 *                     dell'api-server (GET /posts, /posts/:slug,
 *                     /posts/featured, /posts/popular). Usato da Horus per
 *                     studiare stile e argomenti già trattati prima di
 *                     proporre bozze di nuovi post. Nessuna scrittura né
 *                     pubblicazione: solo lettura di ciò che è già visibile
 *                     pubblicamente sul sito. Nessun nuovo secret richiesto
 *                     (endpoint già pubblici); opzionale API_BASE_URL per
 *                     puntare a un'istanza diversa da quella locale.
 *  - typecheck_repo, lint_repo, search_code, git_log — analisi statica REALE
 *                     del codice (non solo lettura file), delegata a un
 *                     servizio dedicato che gira su TC (mai su Replit o sul
 *                     server Ollama), vedi deploy/horus-analysis/. Il
 *                     servizio mantiene cloni locali persistenti dei tre
 *                     repo e li aggiorna via git fetch prima di ogni analisi.
 *                     Richiede HORUS_ANALYSIS_URL + ANALYSIS_GATE_TOKEN; se
 *                     non configurati, questi tool non vengono esposti al
 *                     modello (nessun errore, semplicemente non compaiono
 *                     nella lista strumenti).
 */

import type { HorusToolSpec } from "./client.js";
import { appendHorusMemory } from "./client.js";

const GITHUB_API = "https://api.github.com";

type HorusGithubRepoKey = "bikerlink" | "bikerblog" | "bikerweb";

interface GithubRepoConfig {
  repo: string;
  /**
   * Env var candidate per il token, in ordine di priorità. La prima
   * impostata e non vuota viene usata. `GITHUB_TOKEN_BIKERBLOG` è un
   * fine-grained PAT dedicato a Horus che oggi copre già i tre repo
   * bikerlink/bikerblog/bikerweb; se in futuro arriva un token più
   * specifico per un singolo repo, aggiungerlo qui gli dà precedenza.
   */
  tokenEnvVars: string[];
}

const GITHUB_REPOS: Record<HorusGithubRepoKey, GithubRepoConfig> = {
  bikerlink: {
    repo: "Andreamasteri/Bikerlink",
    tokenEnvVars: ["GITHUB_TOKEN_BIKERLINK", "GITHUB_TOKEN_BIKERBLOG"],
  },
  bikerblog: {
    repo: "Andreamasteri/bikerblog",
    tokenEnvVars: ["GITHUB_TOKEN_BIKERBLOG"],
  },
  bikerweb: {
    repo: "Andreamasteri/bikerweb",
    tokenEnvVars: ["GITHUB_TOKEN_BIKERWEB", "GITHUB_TOKEN_BIKERBLOG"],
  },
};

/**
 * Alcuni fine-grained PAT GitHub finiscono salvati come secret senza il
 * prefisso "github_pat_" (es. se solo la parte finale viene incollata).
 * Normalizziamo qui per tollerare entrambi i casi senza richiedere
 * all'utente di rigenerare il token.
 */
function normalizeGithubToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("github_pat_") || trimmed.startsWith("ghp_")) {
    return trimmed;
  }
  return `github_pat_${trimmed}`;
}

function resolveGithubToken(repoKey: HorusGithubRepoKey): string | undefined {
  for (const envVar of GITHUB_REPOS[repoKey].tokenEnvVars) {
    const value = process.env[envVar];
    if (value && value.trim()) {
      return normalizeGithubToken(value);
    }
  }
  return undefined;
}

const BASE_HORUS_TOOLS: HorusToolSpec[] = [
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
        "Legge un file o elenca il contenuto di una cartella da uno dei repository GitHub del progetto: " +
        `"bikerlink" (${GITHUB_REPOS.bikerlink.repo}), "bikerblog" (${GITHUB_REPOS.bikerblog.repo}, questa stessa app) ` +
        `o "bikerweb" (${GITHUB_REPOS.bikerweb.repo}). Usalo per studiare il codice reale e spiegare all'utente come funziona ` +
        "l'app, o per proporre idee di nuovi task o contenuti basate su cosa esiste già. Solo lettura: non puoi scrivere, " +
        "committare o modificare nulla. Qualsiasi idea o proposta va detta a parole in chat, non eseguita autonomamente.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo leggere: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
          path: {
            type: "string",
            description:
              'Percorso nel repo (es. "package.json" o "src/"). Usa "" o "." per la root.',
          },
        },
        required: ["repo", "path"],
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
  {
    type: "function",
    function: {
      name: "read_blog",
      description:
        "Legge i contenuti GIA' PUBBLICATI di BikerBlog (questo stesso sito), non il codice sorgente. Usalo per studiare stile, argomenti e categorie già trattate prima di proporre a parole una bozza di nuovo post, o per rispondere a domande sui contenuti del blog. Sola lettura: non puoi creare, modificare o pubblicare nulla con questo tool.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              '"list" per elencare i post pubblicati (con filtri opzionali), "get" per leggere il dettaglio di un post per slug, "featured" per il post in evidenza in home, "popular" per i post più apprezzati.',
            enum: ["list", "get", "featured", "popular"],
          },
          slug: {
            type: "string",
            description: 'Slug del post da leggere. Richiesto solo per action="get".',
          },
          tag: {
            type: "string",
            description: 'Filtra per tag esatto. Usabile solo con action="list".',
          },
          category: {
            type: "string",
            description: 'Filtra per categoria esatta. Usabile solo con action="list".',
          },
          search: {
            type: "string",
            description: 'Cerca un testo in titolo/estratto/corpo. Usabile solo con action="list".',
          },
          limit: {
            type: "number",
            description: 'Numero massimo di post da restituire (default 5, max 20). Usabile solo con action="popular".',
          },
        },
        required: ["action"],
      },
    },
  },
];

const ANALYSIS_TOOL_SPECS: HorusToolSpec[] = [
  {
    type: "function",
    function: {
      name: "typecheck_repo",
      description:
        "Esegue davvero il typecheck TypeScript (tsc/typecheck) su uno dei repo del progetto e restituisce gli errori reali trovati, non una stima. Usalo quando l'utente chiede di trovare bug, errori di tipo o problemi nel codice.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo analizzare: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
        },
        required: ["repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lint_repo",
      description:
        "Esegue davvero il linter (ESLint) su uno dei repo del progetto e restituisce warning/errori reali di stile e qualità del codice.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo analizzare: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
        },
        required: ["repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description:
        "Cerca un testo o pattern in TUTTO il codice sorgente di un repo (ricerca full-text tipo grep), utile per trovare typo, occorrenze di una funzione/variabile, o pattern ripetuti senza dover leggere i file uno per uno con github_read.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo cercare: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
          query: {
            type: "string",
            description: "Testo o pattern da cercare nel codice sorgente.",
          },
        },
        required: ["repo", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_log",
      description:
        "Mostra la cronologia dei commit recenti (con file modificati) di un repo, utile per capire cosa è cambiato di recente prima di rispondere a domande sul codice.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
          limit: {
            type: "number",
            description: "Numero di commit da mostrare (default 10, massimo 50).",
          },
        },
        required: ["repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "architect",
      description:
        "Analisi profonda di architettura, pianificazione di una modifica/feature, o debug di root cause su uno dei repo del progetto. " +
        "A differenza di typecheck_repo/lint_repo/search_code/git_log (segnali grezzi), questo tool ragiona sul contesto che gli fornisci " +
        "(file/cartelle rilevanti + commit recenti) e restituisce un report scritto strutturato. Usalo per richieste tipo \"come lo implementeresti\", " +
        "\"qual è la causa di questo bug\", \"valuta questa implementazione\" — non per typo o errori sintattici semplici, per quelli usa gli altri tool. " +
        "Solo analisi: non scrive, non modifica, non esegue codice. Può richiedere alcuni minuti su hardware CPU.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: 'Quale repo analizzare: "bikerlink", "bikerblog" o "bikerweb".',
            enum: ["bikerlink", "bikerblog", "bikerweb"],
          },
          mode: {
            type: "string",
            description:
              '"plan" per pianificare una nuova feature/modifica, "debug" per trovare la causa radice di un problema, "evaluate" per valutare uno stato/implementazione esistente.',
            enum: ["plan", "debug", "evaluate"],
          },
          task: {
            type: "string",
            description: "Descrizione chiara del compito, del bug o di cosa valutare.",
          },
          paths: {
            type: "array",
            description:
              "Percorsi di file o cartelle nel repo rilevanti per l'analisi (fino a 8), usati come contesto grezzo. Opzionale ma consigliato.",
            items: { type: "string" },
          },
        },
        required: ["repo", "mode", "task"],
      },
    },
  },
];

function isAnalysisServiceConfigured(): boolean {
  return Boolean(process.env["HORUS_ANALYSIS_URL"] && process.env["ANALYSIS_GATE_TOKEN"]);
}

export function getHorusTools(): HorusToolSpec[] {
  return isAnalysisServiceConfigured()
    ? [...BASE_HORUS_TOOLS, ...ANALYSIS_TOOL_SPECS]
    : BASE_HORUS_TOOLS;
}

/** @deprecated usa `getHorusTools()` — mantenuto per compatibilità, non include i tool di analisi condizionali. */
export const HORUS_TOOLS = BASE_HORUS_TOOLS;

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
 * DuckDuckGo/altri), la stessa già usata dall'ecosistema AI di BikerLink
 * (Horus/Ares/Bowie, vedi server/ai/assistant/web-search.ts nel repo
 * bikerlink). Richiede HORUS_SEARXNG_URL; l'istanza è protetta da un gate
 * nginx che richiede l'header `X-Searxng-Key` con SEARXNG_GATE_TOKEN (non
 * Cloudflare Access — le credenziali CF_ACCESS_CLIENT_ID/SECRET sono per
 * Ollama, non per questo hostname).
 */
async function searxngSearch(query: string, searxngUrl: string): Promise<string> {
  const gateToken = process.env["SEARXNG_GATE_TOKEN"];
  const url = `${searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; HorusBot/1.0)",
      ...(gateToken ? { "X-Searxng-Key": gateToken } : {}),
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

function isHorusGithubRepoKey(value: string): value is HorusGithubRepoKey {
  return value === "bikerlink" || value === "bikerblog" || value === "bikerweb";
}

async function githubRead(repoArg: string, path: string): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }

  const { repo } = GITHUB_REPOS[repoKey];
  const token = resolveGithubToken(repoKey);
  const cleanPath = path.trim().replace(/^\/+/, "");
  const apiPath = cleanPath && cleanPath !== "." ? `/${cleanPath}` : "";
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents${apiPath}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "HorusBot",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  if (res.status === 404) {
    return `Percorso "${cleanPath || "/"}" non trovato nel repo ${repo}.`;
  }
  if (res.status === 401 || res.status === 403) {
    return `Accesso negato al repo ${repo} (HTTP ${res.status}). Il token dedicato potrebbe non coprire questo repo o essere scaduto.`;
  }
  if (!res.ok) {
    return `Lettura GitHub fallita (HTTP ${res.status}) per "${cleanPath || "/"}" in ${repo}.`;
  }

  const data = (await res.json()) as
    | { type: string; name: string }[]
    | { type: string; encoding?: string; content?: string; size?: number };

  if (Array.isArray(data)) {
    const entries = data
      .map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    return `Contenuto della cartella "${cleanPath || "/"}" in ${repo}:\n${entries}`;
  }

  if (data.type === "file") {
    if (data.encoding === "base64" && data.content) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const truncated = content.length > 8000;
      return `File "${cleanPath}" in ${repo} (${data.size} bytes)${truncated ? " — troncato ai primi 8000 caratteri" : ""}:\n\n${content.slice(0, 8000)}`;
    }
    return `File "${cleanPath}" in ${repo} trovato ma non decodificabile (encoding: ${data.encoding}).`;
  }

  return `Percorso "${cleanPath || "/"}" in ${repo} non riconosciuto (tipo inatteso).`;
}

/**
 * Salva una nota permanente nella memoria condivisa (inbox/horus-memory.md).
 * Horus e Bowie condividono lo stesso file (nessun secondo sistema di
 * memoria da mantenere), ma le note scritte da Bowie vengono taggate con un
 * prefisso `[Bowie]` così non si confondono silenziosamente con quelle
 * scritte da Horus quando il file viene riletto (sia da un umano sia dal
 * modello stesso alla chiamata successiva).
 */
function rememberNote(note: string, agentName: string): string {
  const tagged = agentName === "Horus" ? note : `[${agentName}] ${note}`;
  appendHorusMemory(tagged);
  return `Nota salvata in memoria permanente: "${note}"`;
}

/** Base URL dell'api-server BikerBlog. Nessun nuovo secret richiesto: gli
 * endpoint letti sono già pubblici. Configurabile con API_BASE_URL se serve
 * puntare a un'istanza diversa da quella locale (default già usato altrove
 * nel progetto, vedi scripts/src/podcast-generate.ts). */
const BLOG_API_BASE = process.env["API_BASE_URL"] ?? "http://localhost:8080";

interface BlogPostSummary {
  slug?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  category?: string;
  tags?: string[];
  author?: { name?: string };
  publishedAt?: string;
  likeCount?: number;
  commentCount?: number;
}

const READ_BLOG_BODY_TRUNCATE_LEN = 4000;

function truncateBody(content: string | undefined): string {
  if (!content) return "";
  return content.length > READ_BLOG_BODY_TRUNCATE_LEN
    ? `${content.slice(0, READ_BLOG_BODY_TRUNCATE_LEN)}\n\n[... corpo troncato, ${content.length} caratteri totali]`
    : content;
}

function formatBlogPostSummary(p: BlogPostSummary): string {
  return `- "${p.title ?? "(senza titolo)"}" (slug: ${p.slug ?? "?"}, categoria: ${p.category ?? "?"}, autore: ${
    p.author?.name ?? "?"
  }, pubblicato: ${p.publishedAt ?? "?"}, tag: ${(p.tags ?? []).join(", ") || "nessuno"})\n  Estratto: ${
    p.excerpt ?? ""
  }`;
}

function formatBlogPostDetail(p: BlogPostSummary): string {
  return (
    `Titolo: ${p.title ?? "(senza titolo)"}\n` +
    `Slug: ${p.slug ?? "?"}\n` +
    `Categoria: ${p.category ?? "?"}\n` +
    `Tag: ${(p.tags ?? []).join(", ") || "nessuno"}\n` +
    `Autore: ${p.author?.name ?? "?"}\n` +
    `Pubblicato: ${p.publishedAt ?? "?"}\n` +
    `Like: ${p.likeCount ?? 0} — Commenti: ${p.commentCount ?? 0}\n` +
    `Estratto: ${p.excerpt ?? ""}\n\n` +
    `Corpo:\n${truncateBody(p.content)}`
  );
}

async function fetchBlogApi(path: string): Promise<
  { ok: true; data: unknown } | { ok: false; message: string }
> {
  let res: Response;
  try {
    res = await fetch(`${BLOG_API_BASE}/api${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return {
      ok: false,
      message: `Impossibile contattare l'API di BikerBlog (${BLOG_API_BASE}): ${
        err instanceof Error ? err.message : String(err)
      }.`,
    };
  }

  if (res.status === 404) {
    return { ok: false, message: "not_found" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message: `L'API di BikerBlog ha risposto con errore (HTTP ${res.status}) per "${path}".`,
    };
  }

  try {
    return { ok: true, data: await res.json() };
  } catch {
    return {
      ok: false,
      message: `Risposta non valida (non JSON) dall'API di BikerBlog per "${path}".`,
    };
  }
}

async function readBlog(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action ?? "").trim().toLowerCase();

  if (action === "list") {
    const params = new URLSearchParams();
    if (typeof args.tag === "string" && args.tag.trim()) params.set("tag", args.tag.trim());
    if (typeof args.category === "string" && args.category.trim())
      params.set("category", args.category.trim());
    if (typeof args.search === "string" && args.search.trim())
      params.set("search", args.search.trim());
    const qs = params.toString();
    const result = await fetchBlogApi(`/posts${qs ? `?${qs}` : ""}`);
    if (!result.ok) {
      return result.message === "not_found"
        ? "Nessun post trovato con questi filtri."
        : result.message;
    }
    const posts = result.data as BlogPostSummary[];
    if (!Array.isArray(posts) || posts.length === 0) {
      return "Nessun post pubblicato trovato con questi filtri.";
    }
    return `${posts.length} post trovati:\n\n${posts.map(formatBlogPostSummary).join("\n\n")}`;
  }

  if (action === "get") {
    const slug = String(args.slug ?? "").trim();
    if (!slug) {
      return 'action="get" richiede uno slug (es. slug: "il-mio-post").';
    }
    const result = await fetchBlogApi(`/posts/${encodeURIComponent(slug)}`);
    if (!result.ok) {
      return result.message === "not_found"
        ? `Nessun post pubblicato trovato con slug "${slug}".`
        : result.message;
    }
    return formatBlogPostDetail(result.data as BlogPostSummary);
  }

  if (action === "featured") {
    const result = await fetchBlogApi("/posts/featured");
    if (!result.ok) {
      return result.message === "not_found"
        ? "Non c'è ancora nessun post in evidenza (nessun post pubblicato)."
        : result.message;
    }
    return `Post in evidenza (home):\n\n${formatBlogPostDetail(result.data as BlogPostSummary)}`;
  }

  if (action === "popular") {
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    const result = await fetchBlogApi(`/posts/popular${qs}`);
    if (!result.ok) {
      return result.message === "not_found"
        ? "Nessun post popolare trovato."
        : result.message;
    }
    const posts = result.data as BlogPostSummary[];
    if (!Array.isArray(posts) || posts.length === 0) {
      return "Nessun post popolare trovato.";
    }
    return `${posts.length} post più apprezzati:\n\n${posts.map(formatBlogPostSummary).join("\n\n")}`;
  }

  return `Azione "${action}" sconosciuta per read_blog. Valori validi: "list", "get", "featured", "popular".`;
}

interface AnalysisServiceResponse {
  result?: string;
  error?: string;
  kind?: string;
}

/**
 * Chiama il servizio di analisi codice su TC (deploy/horus-analysis/). Non
 * esegue nulla localmente: clone, npm install, tsc ed eslint girano tutti su
 * TC, mai su Replit o sul server Ollama.
 */
async function callAnalysisService(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const baseUrl = process.env["HORUS_ANALYSIS_URL"];
  const gateToken = process.env["ANALYSIS_GATE_TOKEN"];
  if (!baseUrl || !gateToken) {
    return "Servizio di analisi codice non configurato (HORUS_ANALYSIS_URL/ANALYSIS_GATE_TOKEN mancanti).";
  }

  // Combiniamo il timeout interno (10 minuti, per analisi lunghe come
  // l'architect) con un eventuale segnale di abort esterno (l'utente che
  // annulla l'analisi da chat/CLI): AbortSignal.any si attiva su quale dei
  // due scatta per primo.
  const timeoutSignal = AbortSignal.timeout(10 * 60 * 1000);
  const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Analysis-Gate-Token": gateToken,
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (err) {
    if (signal?.aborted) {
      return "Analisi interrotta dall'utente.";
    }
    throw err;
  }

  const data = (await res.json().catch(() => ({}))) as AnalysisServiceResponse;

  if (!res.ok || data.error) {
    return `Servizio di analisi codice ha risposto con errore (HTTP ${res.status}): ${data.error ?? "errore sconosciuto"}.`;
  }

  return data.result ?? "Il servizio di analisi non ha restituito alcun risultato.";
}

async function typecheckRepoTool(repoArg: string, signal?: AbortSignal): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  return callAnalysisService("/typecheck", { repo: repoKey }, signal);
}

async function lintRepoTool(repoArg: string, signal?: AbortSignal): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  return callAnalysisService("/lint", { repo: repoKey }, signal);
}

async function searchCodeTool(repoArg: string, query: string, signal?: AbortSignal): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  if (!query.trim()) {
    return "Query di ricerca mancante.";
  }
  return callAnalysisService("/search", { repo: repoKey, query }, signal);
}

async function gitLogTool(
  repoArg: string,
  limit: number | undefined,
  signal?: AbortSignal
): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  return callAnalysisService("/git-log", { repo: repoKey, limit }, signal);
}

const ARCHITECT_MODES = ["plan", "debug", "evaluate"] as const;
type ArchitectMode = (typeof ARCHITECT_MODES)[number];

function isArchitectMode(value: string): value is ArchitectMode {
  return (ARCHITECT_MODES as readonly string[]).includes(value);
}

async function architectTool(
  repoArg: string,
  modeArg: string,
  task: string,
  paths: unknown,
  signal?: AbortSignal
): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  const mode = modeArg.trim().toLowerCase();
  if (!isArchitectMode(mode)) {
    return `Modalità "${modeArg}" sconosciuta. Valori validi: "plan", "debug", "evaluate".`;
  }
  if (!task.trim()) {
    return "Compito mancante: descrivi cosa vuoi pianificare, debuggare o valutare.";
  }
  const pathList = Array.isArray(paths)
    ? paths.filter((p): p is string => typeof p === "string").slice(0, 8)
    : undefined;
  return callAnalysisService("/architect", { repo: repoKey, mode, task, paths: pathList }, signal);
}

/**
 * Esegue un tool richiesto dal modello e restituisce il testo del risultato
 * da rimandare come messaggio role:"tool". `signal` è opzionale e permette al
 * chiamante (chat web o CLI) di annullare tool lenti come `architect` a metà
 * esecuzione (l'utente che clicca "Stop" o preme Ctrl+C). `agentName` indica
 * quale agente ("Horus" o "Bowie") sta chiamando il tool — usato solo da
 * `remember_note` per taggare la nota nella memoria condivisa.
 */
export async function executeHorusTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  agentName: string = "Horus"
): Promise<string> {
  try {
    switch (name) {
      case "web_search":
        return await webSearch(String(args.query ?? ""));
      case "github_read":
        return await githubRead(String(args.repo ?? ""), String(args.path ?? ""));
      case "remember_note":
        return rememberNote(String(args.note ?? ""), agentName);
      case "read_blog":
        return await readBlog(args);
      case "typecheck_repo":
        return await typecheckRepoTool(String(args.repo ?? ""), signal);
      case "lint_repo":
        return await lintRepoTool(String(args.repo ?? ""), signal);
      case "search_code":
        return await searchCodeTool(String(args.repo ?? ""), String(args.query ?? ""), signal);
      case "git_log":
        return await gitLogTool(
          String(args.repo ?? ""),
          typeof args.limit === "number" ? args.limit : undefined,
          signal
        );
      case "architect":
        return await architectTool(
          String(args.repo ?? ""),
          String(args.mode ?? ""),
          String(args.task ?? ""),
          args.paths,
          signal
        );
      default:
        return `Tool sconosciuto: "${name}".`;
    }
  } catch (err) {
    if (signal?.aborted) {
      return `Tool "${name}" interrotto dall'utente.`;
    }
    return `Errore nell'esecuzione del tool "${name}": ${err instanceof Error ? err.message : String(err)}`;
  }
}
