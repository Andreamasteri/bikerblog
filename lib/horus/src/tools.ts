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
 *                     /posts/featured, /posts/popular,
 *                     /posts/:slug/comments). Usato da Horus per studiare
 *                     stile e argomenti già trattati, capire se un post ha
 *                     già un episodio podcast (campo audioUrl, incluso nelle
 *                     azioni "list"/"get"/"featured"/"popular") e leggere il
 *                     riscontro dei lettori nei commenti (azione "comments")
 *                     prima di proporre bozze di nuovi post. Nessuna
 *                     scrittura né pubblicazione: solo lettura di ciò che è
 *                     già visibile pubblicamente sul sito. Nessun nuovo
 *                     secret richiesto (endpoint già pubblici); opzionale
 *                     API_BASE_URL per puntare a un'istanza diversa da
 *                     quella locale.
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
 *  - search_manual — ricerca semantica (per significato, non per parole
 *                     esatte) su un "manuale" testuale + le conversazioni
 *                     recenti che coinvolgono Bowie + i commenti pubblici,
 *                     delegata al servizio Nadir su TC (embedding all-minilm
 *                     via Ollama, indice file-based con similarità del coseno),
 *                     vedi deploy/horus-nadir/. Agnostico rispetto all'agente:
 *                     Horus, Bowie o un eventuale terzo agente lo usano allo
 *                     stesso modo. Richiede NADIR_URL + NADIR_GATE_TOKEN; se
 *                     non configurati, il tool non viene esposto al modello.
 *  - save_file, read_file, list_files — cartella condivisa su TC
 *                     ("agent-shared") accessibile a tutti gli agenti AI
 *                     (Horus, Bowie, futuri Ares/Nadir/Quebracho), servita dal
 *                     servizio horus-hub (repo GitHub "ai", versionato
 *                     indipendentemente). Path relativi alla root condivisa,
 *                     mai assoluti né con `..` (validato lato hub). Richiede
 *                     HORUS_HUB_URL + HUB_GATE_TOKEN; se non configurati,
 *                     questi tool non vengono esposti al modello.
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
        "Legge i contenuti GIA' PUBBLICATI di BikerBlog (questo stesso sito), non il codice sorgente: post, presenza di episodi podcast e commenti dei lettori. Usalo per studiare stile, argomenti e categorie già trattate, per capire se un post ha già un episodio audio, o per vedere cosa dicono i lettori nei commenti prima di proporre a parole una bozza di nuovo post. Per i post con molti commenti, action=\"comments\" restituisce automaticamente anche un riepilogo di sentiment/tono (positivo/negativo/neutro) e il trend nel tempo, così non devi leggere ogni commento per farti un'idea del gradimento dei lettori. Sola lettura: non puoi creare, modificare o pubblicare nulla con questo tool.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              '"list" per elencare i post pubblicati (con filtri opzionali, include se hanno un episodio podcast), "get" per leggere il dettaglio di un post per slug (include se ha un episodio podcast), "featured" per il post in evidenza in home, "popular" per i post più apprezzati, "comments" per leggere i commenti dei lettori su un post (include sempre un riepilogo di sentiment/trend; il testo integrale dei commenti compare solo se non sono troppi, altrimenti mostra solo i più recenti).',
            enum: ["list", "get", "featured", "popular", "comments"],
          },
          slug: {
            type: "string",
            description: 'Slug del post da leggere. Richiesto per action="get" e action="comments".',
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
            description:
              'Numero massimo di risultati da restituire. Con action="popular": default 5, max 20. Con action="comments": default 20, max 50 — numero massimo di commenti integrali/evidenziati mostrati (il riepilogo di sentiment invece considera sempre tutti i commenti).',
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
        "Solo analisi: non scrive, non modifica, non esegue codice. Può richiedere alcuni minuti su hardware CPU. " +
        "Collabora con sonar_scan: se hai già girato sonar_scan sullo stesso repo in questa conversazione e l'utente chiede di pianificare o " +
        "debuggare un problema di qualità del codice (debito tecnico, duplicazioni, code smell, hotspot di sicurezza), incolla gli esiti " +
        "rilevanti di sonar_scan nel campo extraContext invece di rilanciare l'analisi da zero.",
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
          extraContext: {
            type: "string",
            description:
              "Contesto aggiuntivo già raccolto da altri tool nella stessa conversazione (es. l'output di sonar_scan, typecheck_repo o lint_repo) " +
              "da passare all'architetto come input, invece di rieseguire quell'analisi. Opzionale.",
          },
        },
        required: ["repo", "mode", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sonar_scan",
      description:
        "Lancia una vera scansione SonarQube su uno dei repo del progetto e restituisce bug, code smell, vulnerabilità, security hotspot e " +
        "duplicazioni trovati — segnali di qualità/debito tecnico più profondi di quelli di typecheck_repo/lint_repo (che coprono solo errori " +
        "di tipo e regole di stile). Usalo quando l'utente chiede un'analisi di qualità del codice più approfondita, duplicazioni, problemi " +
        "di sicurezza o debito tecnico. Può richiedere alcuni minuti (scanner + attesa dell'analisi lato server). Dopo una scansione, se " +
        "l'utente chiede un piano di fix, passa gli esiti rilevanti al tool architect (campo extraContext) invece di ripetere l'analisi.",
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
];

// Nadir è il servizio di ricerca semantica su TC (deploy/horus-nadir/):
// indicizza il "manuale" testuale, le conversazioni recenti che coinvolgono
// Bowie e i commenti pubblici, e risponde a query in linguaggio naturale con i
// frammenti più pertinenti (embedding all-minilm + similarità del coseno). Il
// tool è deliberatamente agnostico rispetto all'agente: Horus, Bowie o un
// eventuale terzo agente lo interrogano tutti allo stesso modo — basta che
// abbiano accesso a questa lista di tool.
const NADIR_TOOL_SPECS: HorusToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_manual",
      description:
        "Cerca per significato (ricerca semantica, non per parole esatte) dentro la base di conoscenza di Nadir: un \"manuale\" testuale, " +
        "le conversazioni recenti che coinvolgono Bowie e i commenti pubblici dei lettori. Usalo quando ti serve recuperare qualcosa di già " +
        "detto o annotato — una procedura, una convenzione, una risposta data in passato, il parere dei lettori — anche se non ricordi le " +
        "parole precise. Restituisce i frammenti più pertinenti con la loro origine (manuale/conversazione/commento). Sola lettura.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Cosa cercare, espresso in linguaggio naturale (per significato, non per parole chiave esatte).",
          },
          limit: {
            type: "number",
            description: "Numero massimo di frammenti da restituire (default 5, massimo 20).",
          },
        },
        required: ["query"],
      },
    },
  },
];

// Cartella file condivisa su TC (horus-hub, deploy/horus-hub/), fase 1 della
// migrazione descritta in .agents/memory: uno spazio dove Horus, Bowie e
// futuri agenti (Ares, Nadir, Quebracho) possono leggere/scrivere file
// persistenti in comune, senza passare da Replit. Agnostico rispetto
// all'agente, come search_manual. Richiede HORUS_HUB_URL + HUB_GATE_TOKEN; se
// non configurati, questi tool non vengono esposti al modello.
const HUB_TOOL_SPECS: HorusToolSpec[] = [
  {
    type: "function",
    function: {
      name: "save_file",
      description:
        "Salva un file di testo nella cartella condivisa su TC, visibile a tutti gli agenti (Horus, Bowie, futuri agenti). Usalo per " +
        "persistere qualcosa che deve sopravvivere a questa conversazione ed essere leggibile da un altro agente, non per note personali " +
        "brevi (per quelle usa remember_note). Sovrascrive se il percorso esiste già.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Percorso relativo del file dentro la cartella condivisa (es. \"notes/idea.md\"). Le sottocartelle vengono create automaticamente.",
          },
          content: {
            type: "string",
            description: "Contenuto testuale da scrivere nel file.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Legge un file di testo dalla cartella condivisa su TC, eventualmente scritto da un altro agente (Horus, Bowie, futuri agenti).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Percorso relativo del file dentro la cartella condivisa (es. \"notes/idea.md\").",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Elenca file e sottocartelle in un percorso della cartella condivisa su TC (radice se non specificato).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Percorso relativo della cartella da elencare (default: radice della cartella condivisa).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_vram_usage",
      description:
        "Restituisce il carico di VRAM (memoria video) attuale sulla GPU di TC, il picco massimo registrato nelle ultime " +
        "24 ore e, quando disponibile, quanto ne sta usando ciascuna IA residente (Horus, Bowie, Quebracho, Nadir). Usalo " +
        "per capire se c'è margine per un'operazione pesante o per rispondere a domande dell'utente sul carico della GPU.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

function isAnalysisServiceConfigured(): boolean {
  return Boolean(process.env["HORUS_ANALYSIS_URL"] && process.env["ANALYSIS_GATE_TOKEN"]);
}

function isNadirConfigured(): boolean {
  return Boolean(process.env["NADIR_URL"] && process.env["NADIR_GATE_TOKEN"]);
}

function isHubConfigured(): boolean {
  return Boolean(process.env["HORUS_HUB_URL"] && process.env["HUB_GATE_TOKEN"]);
}

// SONARQUBE_TOKEN vive solo lato servizio su TC — invisibile a Replit — quindi
// non possiamo decidere localmente se sonar_scan va mostrato. Interroghiamo
// /capabilities per saperlo, con una cache breve (60s) per non aggiungere una
// richiesta di rete a ogni turno di chat, e un timeout stretto: se il
// servizio non risponde in tempo, il tool resta nascosto per quel turno
// invece di rallentare la chat.
const SONAR_CAPABILITY_CACHE_MS = 60_000;
const SONAR_CAPABILITY_TIMEOUT_MS = 3_000;
let sonarCapabilityCache: { value: boolean; expiresAt: number } | undefined;

async function isSonarAvailable(): Promise<boolean> {
  const now = Date.now();
  if (sonarCapabilityCache && sonarCapabilityCache.expiresAt > now) {
    return sonarCapabilityCache.value;
  }
  const baseUrl = process.env["HORUS_ANALYSIS_URL"];
  const gateToken = process.env["ANALYSIS_GATE_TOKEN"];
  if (!baseUrl || !gateToken) return false;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/capabilities`, {
      headers: { "X-Analysis-Gate-Token": gateToken },
      signal: AbortSignal.timeout(SONAR_CAPABILITY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`capabilities check fallito (HTTP ${res.status})`);
    const data = (await res.json()) as { sonarAvailable?: boolean };
    const value = Boolean(data.sonarAvailable);
    sonarCapabilityCache = { value, expiresAt: now + SONAR_CAPABILITY_CACHE_MS };
    return value;
  } catch {
    // Servizio irraggiungibile o capabilities non implementato: non mostrare
    // il tool piuttosto che rischiare un'invocazione destinata a fallire.
    sonarCapabilityCache = { value: false, expiresAt: now + SONAR_CAPABILITY_CACHE_MS };
    return false;
  }
}

const SONAR_SCAN_TOOL_NAME = "sonar_scan";

/**
 * Selezione contestuale dei tool (Task #178). Su CPU, allegare a Ollama
 * l'intero blocco di tool (schemi JSON verbosi) a ogni chiamata gonfia il
 * prompt di ~2.500-3.000 token: il prefill silenzioso di quel contesto su CPU
 * supera i ~100s che il tunnel Cloudflare concede prima del primo byte → 524,
 * anche per un banale "Ciao".
 *
 * Questa funzione deduce dal SOLO messaggio dell'utente (analisi leggera per
 * parole chiave, nessun round-trip aggiuntivo al modello) quale sottoinsieme
 * MINIMO di tool sia pertinente, e restituisce solo quelli — intersecati con
 * `available` (che è già filtrato per capacità: gating "sopra" il contestuale).
 * Per un messaggio conversazionale non ritorna alcun tool, così il prefill è
 * minimo e la risposta è immediata anche su CPU.
 *
 * Deliberatamente conservativa: mappa intenti diversi su sottoinsiemi diversi
 * (non un unico pacchetto) e, in caso di dubbio, preferisce allegare il singolo
 * tool più probabile. Se il modello si accorge di aver bisogno di un tool non
 * allegato, il system prompt gli chiede di dichiararlo esplicitamente.
 */
export function selectRelevantTools(
  message: string,
  available: HorusToolSpec[]
): HorusToolSpec[] {
  const text = message.toLowerCase();
  const has = (re: RegExp): boolean => re.test(text);
  const wanted = new Set<string>();

  // Contesto "codice": presenza di uno dei repo o di lessico da sorgente.
  const codeContext =
    /\bcodice\b|sorgent|reposit|\brepo\b|github|\bfile\b|funzione|classe|metodo|implementaz|struttura del progetto|typescript|refactor|bikerlink|bikerblog|bikerweb/;
  const isCode = has(codeContext);

  // remember_note — l'utente comunica qualcosa da ricordare.
  if (has(/ricord|memorizz|non dimenticare|tieni a mente|segnati|prendi nota|appunta/)) {
    wanted.add("remember_note");
  }

  // read_blog — contenuti già pubblicati del blog (post, commenti, podcast).
  if (has(/\bblog\b|\bpost\b|articol|commenti|lettori|episodi|podcast|pubblicat|in evidenza/)) {
    wanted.add("read_blog");
  }

  // search_manual (Nadir) — ricerca semantica / knowledge base / cosa già detto.
  if (
    has(
      /per significato|semantic|knowledge base|base di conoscenza|\bmanuale\b|cosa (ti )?avevo detto|ne avevamo (già )?parlato|come avevamo detto/
    )
  ) {
    wanted.add("search_manual");
  }

  // Tool di analisi statica reale (gated a monte per servizio disponibile).
  if (has(/typecheck|type check|errori di tipo|controllo dei tipi/)) wanted.add("typecheck_repo");
  if (has(/\blint\b|eslint|stile del codice/)) wanted.add("lint_repo");
  if (has(/\bcommit\b|git log|cronologia dei commit|ultime modifiche al codice|cosa è cambiato/)) {
    wanted.add("git_log");
  }
  if (has(/sonar|code smell|duplicazion|debito tecnico|vulnerabilit|security hotspot|qualità del codice/)) {
    wanted.add("sonar_scan");
  }
  if (
    has(
      /come (lo )?implementeresti|come implemento|pianific|piano di|root cause|causa (del|di questo|radice)|valuta (questa|l'implementazione|l')|architettura|progett(a|are|azione)|\bdebug\b/
    )
  ) {
    wanted.add("architect");
  }

  // Codice: lettura (github_read) e/o ricerca full-text nel sorgente (search_code).
  // Se l'intento è già un'analisi specifica (typecheck/lint/git_log/sonar/
  // architect) NON aggiungere anche github_read: la parola "repo"/nome-repo è
  // naturalmente presente in quelle richieste ma l'intento non è "leggi il
  // codice". Così "fai il typecheck del repo bikerblog" allega solo
  // typecheck_repo, non anche github_read.
  const analysisIntent = ["typecheck_repo", "lint_repo", "git_log", "sonar_scan", "architect"].some(
    (name) => wanted.has(name)
  );
  if (isCode) {
    if (has(/cerc|trova|occorrenz|grep|dove (viene|è|sono)|quante volte/)) wanted.add("search_code");
    if (!analysisIntent) wanted.add("github_read");
    // "trova bug/errori nel codice" senza un tool esplicito → typecheck è il
    // segnale più utile.
    if (has(/\bbug\b|\berrore\b|errori|non funziona/) && !wanted.has("typecheck_repo")) {
      wanted.add("typecheck_repo");
    }
  }

  // web_search — informazioni aggiornate o ricerca generica sul web, ma non
  // quando la ricerca è chiaramente su codice/manuale/blog.
  const freshInfo =
    /notizi|ultim\w*\s+(notizi|novità|nov)|recent|aggiornat|attual|\boggi\b|\bieri\b|meteo|previsioni|prezzo|quanto costa|quotazion|\binternet\b|\bweb\b|google|in rete|classifica|risultat/;
  if (has(freshInfo)) wanted.add("web_search");
  if (has(/cerca (online|sul web|su internet|in rete)|ricerca (online|sul web|su internet)/)) {
    wanted.add("web_search");
  }
  // "cerca/cercami/ricerca" nudo → web solo se non è già una ricerca mirata.
  if (
    has(/\bcerca\b|\bcercami\b|\bricerca\b/) &&
    !wanted.has("search_code") &&
    !wanted.has("search_manual") &&
    !wanted.has("read_blog")
  ) {
    wanted.add("web_search");
  }

  // save_file/read_file/list_files — cartella condivisa su TC tra agenti.
  if (has(/cartella condivisa|file condivis|salva (il )?file|leggi (il )?file|elenca (i )?file|scrivi (un )?file/)) {
    if (has(/salva|scrivi/)) wanted.add("save_file");
    if (has(/leggi/)) wanted.add("read_file");
    if (has(/elenca|lista|quali file/)) wanted.add("list_files");
    if (!wanted.has("save_file") && !wanted.has("read_file") && !wanted.has("list_files")) {
      wanted.add("list_files");
    }
  }

  // check_vram_usage — carico GPU/VRAM su TC.
  if (has(/\bvram\b|memoria video|\bgpu\b|scheda video|quanta memoria (sta )?usa|carico della gpu/)) {
    wanted.add("check_vram_usage");
  }

  if (wanted.size === 0) return [];
  return available.filter((tool) => wanted.has(tool.function.name));
}

/**
 * Restituisce i tool disponibili per la chat.
 *
 * Se `message` è fornito, applica la selezione contestuale (Task #178):
 * allega solo il sottoinsieme minimo di tool pertinente al messaggio (o nessun
 * tool per un messaggio conversazionale). Se `message` è omesso, restituisce
 * l'intero set disponibile (comportamento storico, es. per chi vuole tutti i
 * tool a prescindere dal contesto).
 *
 * Il gating per capacità resta SOPRA quello contestuale: i tool di analisi
 * (typecheck/lint/search_code/git_log/architect/sonar_scan) e search_manual
 * compaiono solo se il rispettivo servizio TC/Nadir è configurato, e sonar_scan
 * solo se il capability-check live conferma la sua disponibilità — pagato solo
 * quando sonar_scan sopravvive alla selezione contestuale, così un messaggio
 * semplice non paga alcun round-trip di rete.
 */
export async function getHorusTools(message?: string): Promise<HorusToolSpec[]> {
  // search_manual (Nadir) è gated solo sulla presenza delle env var: a
  // differenza di sonar_scan non serve un capability-check live, perché non ci
  // sono sotto-configurazioni che possano variare indipendentemente.
  const nadirTools = isNadirConfigured() ? NADIR_TOOL_SPECS : [];
  const analysisCandidates = isAnalysisServiceConfigured() ? ANALYSIS_TOOL_SPECS : [];
  const hubTools = isHubConfigured() ? HUB_TOOL_SPECS : [];

  // Insieme candidato PRIMA del capability-check live di sonar_scan.
  const candidates = [...BASE_HORUS_TOOLS, ...nadirTools, ...analysisCandidates, ...hubTools];
  const contextual = message === undefined ? candidates : selectRelevantTools(message, candidates);

  // sonar_scan richiede un capability-check live (il token vive solo su TC):
  // interrogalo solo se sonar_scan è effettivamente tra i tool selezionati,
  // così un messaggio che non lo richiede non aggiunge una richiesta di rete.
  const hasSonar = contextual.some((tool) => tool.function.name === SONAR_SCAN_TOOL_NAME);
  if (!hasSonar) return contextual;

  const sonarAvailable = await isSonarAvailable();
  return sonarAvailable
    ? contextual
    : contextual.filter((tool) => tool.function.name !== SONAR_SCAN_TOOL_NAME);
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
  audioUrl?: string | null;
}

interface BlogComment {
  id?: number;
  authorName?: string;
  body?: string;
  createdAt?: string;
  likeCount?: number;
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
  }, pubblicato: ${p.publishedAt ?? "?"}, tag: ${(p.tags ?? []).join(", ") || "nessuno"}, podcast: ${
    p.audioUrl ? "sì" : "no"
  })\n  Estratto: ${p.excerpt ?? ""}`;
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
    `Episodio podcast: ${p.audioUrl ? "sì, disponibile" : "no, questo post non ha audio"}\n` +
    `Estratto: ${p.excerpt ?? ""}\n\n` +
    `Corpo:\n${truncateBody(p.content)}`
  );
}

function formatBlogComment(c: BlogComment): string {
  const likes = c.likeCount ?? 0;
  const likeSuffix = likes > 0 ? ` [${likes} like]` : "";
  return `- ${c.authorName ?? "Anonimo"} (${c.createdAt ?? "?"})${likeSuffix}: ${c.body ?? ""}`;
}

type CommentSentiment = "positivo" | "negativo" | "neutro";

/**
 * Parole chiave italiane (con qualche variante di genere/numero) usate per un
 * punteggio di sentiment leggero e deterministico, senza chiamare Horus/un
 * modello per ogni commento (costerebbe una chiamata AI per commento, troppo
 * lento/costoso). Non è un vero NLP: è pensato solo per dare a Horus un
 * segnale rapido di tono aggregato su thread lunghi, non un'analisi precisa
 * commento per commento.
 */
const POSITIVE_KEYWORDS = [
  "grazie", "bellissimo", "bellissima", "bello", "bella", "ottimo", "ottima",
  "fantastico", "fantastica", "adoro", "amo", "top", "grande", "stupendo",
  "stupenda", "consiglio", "consigliato", "utilissimo", "utile", "perfetto",
  "perfetta", "spettacolare", "meraviglioso", "meravigliosa", "complimenti",
  "bravo", "brava", "bravi", "super", "incredibile", "adorabile", "genio",
];

const NEGATIVE_KEYWORDS = [
  "brutto", "brutta", "pessimo", "pessima", "male", "peggio", "delusione",
  "deludente", "sbagliato", "sbagliata", "errore", "problema", "problemi",
  "odio", "orribile", "schifo", "inutile", "noioso", "noiosa", "falso",
  "falsa", "truffa", "vergogna", "basta", "no grazie", "non funziona",
  "rotto", "rotta", "scam", "spam",
];

function classifyCommentSentiment(text: string): CommentSentiment {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_KEYWORDS) {
    if (normalized.includes(word)) score += 1;
  }
  for (const word of NEGATIVE_KEYWORDS) {
    if (normalized.includes(word)) score -= 1;
  }
  if (score > 0) return "positivo";
  if (score < 0) return "negativo";
  return "neutro";
}

const COMMENTS_FULL_LIST_THRESHOLD = 12;
const COMMENTS_HIGHLIGHT_COUNT = 5;

/**
 * Riepilogo leggero di engagement/sentiment su un thread di commenti: conteggio
 * totale, distribuzione di tono (positivo/negativo/neutro), trend "ultimi 7
 * giorni vs prima" e i commenti più recenti come highlight. Pensato per far
 * capire a Horus il gradimento dei lettori senza dover leggere ogni singolo
 * commento (costoso in contesto su thread lunghi).
 */
function buildCommentsEngagementSummary(comments: BlogComment[]): string {
  const total = comments.length;
  const sentiments = comments.map((c) => classifyCommentSentiment(c.body ?? ""));
  const positive = sentiments.filter((s) => s === "positivo").length;
  const negative = sentiments.filter((s) => s === "negativo").length;
  const neutral = total - positive - negative;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentCount = comments.filter((c) => {
    const ts = c.createdAt ? Date.parse(c.createdAt) : NaN;
    return !Number.isNaN(ts) && ts >= sevenDaysAgo;
  }).length;

  const pct = (n: number): string => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

  let tono: string;
  if (positive > negative && positive > neutral) {
    tono = "prevalentemente positivo";
  } else if (negative > positive && negative > neutral) {
    tono = "prevalentemente negativo";
  } else if (negative > 0 && negative >= positive) {
    tono = "misto, con una quota di critiche non trascurabile";
  } else {
    tono = "prevalentemente neutro/informativo";
  }

  const topLiked = [...comments]
    .filter((c) => (c.likeCount ?? 0) > 0)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, COMMENTS_HIGHLIGHT_COUNT);

  const topLikedBlock =
    topLiked.length > 0
      ? `\n- Più apprezzati:\n${topLiked.map(formatBlogComment).join("\n")}`
      : "\n- Più apprezzati: nessun commento ha ancora ricevuto like";

  return (
    `Riepilogo engagement (${total} commenti totali, tono ${tono}):\n` +
    `- Positivi: ${positive} (${pct(positive)}) — Negativi: ${negative} (${pct(negative)}) — Neutri/altro: ${neutral} (${pct(neutral)})\n` +
    `- Ultimi 7 giorni: ${recentCount} commenti nuovi su ${total} totali` +
    topLikedBlock
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

  if (action === "comments") {
    const slug = String(args.slug ?? "").trim();
    if (!slug) {
      return 'action="comments" richiede uno slug (es. slug: "il-mio-post").';
    }
    const result = await fetchBlogApi(`/posts/${encodeURIComponent(slug)}/comments`);
    if (!result.ok) {
      return result.message === "not_found"
        ? `Nessun post pubblicato trovato con slug "${slug}".`
        : result.message;
    }
    const comments = result.data as BlogComment[];
    if (!Array.isArray(comments) || comments.length === 0) {
      return `Nessun commento su "${slug}".`;
    }
    const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 50) : 20;
    const summary = buildCommentsEngagementSummary(comments);

    if (comments.length <= COMMENTS_FULL_LIST_THRESHOLD) {
      const recent = comments.slice(-limit).reverse();
      return (
        `${summary}\n\n` +
        `Commenti su "${slug}" (i più recenti prima, mostrati ${recent.length} di ${comments.length}):\n\n${recent
          .map(formatBlogComment)
          .join("\n")}`
      );
    }

    const highlightCount = Math.min(COMMENTS_HIGHLIGHT_COUNT, limit);
    const highlights = comments.slice(-highlightCount).reverse();
    return (
      `${summary}\n\n` +
      `Thread lungo: mostrati solo i ${highlights.length} commenti più recenti su ${comments.length} totali ` +
      `su "${slug}" (usa il riepilogo sopra per il tono generale; aumenta "limit" se ti servono più commenti integrali):\n\n${highlights
        .map(formatBlogComment)
        .join("\n")}`
    );
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

  return `Azione "${action}" sconosciuta per read_blog. Valori validi: "list", "get", "featured", "popular", "comments".`;
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
  signal?: AbortSignal,
  extraContext?: string
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
  // extraContext permette di incatenare i tool (es. "scansiona con sonar_scan
  // poi passa gli esiti all'architetto per un piano di fix") senza dover
  // rieseguire l'analisi grezza: viene semplicemente aggiunto al prompt del
  // modello lato servizio, non cambia il contratto degli altri campi.
  const trimmedExtraContext =
    typeof extraContext === "string" && extraContext.trim() ? extraContext.trim().slice(0, 8000) : undefined;
  return callAnalysisService(
    "/architect",
    { repo: repoKey, mode, task, paths: pathList, extraContext: trimmedExtraContext },
    signal
  );
}

async function sonarScanTool(repoArg: string, signal?: AbortSignal): Promise<string> {
  const repoKey = repoArg.trim().toLowerCase();
  if (!isHorusGithubRepoKey(repoKey)) {
    return `Repo "${repoArg}" sconosciuto. Valori validi: "bikerlink", "bikerblog", "bikerweb".`;
  }
  return callAnalysisService("/sonar", { repo: repoKey }, signal);
}

interface NadirServiceResponse {
  result?: string;
  error?: string;
}

/**
 * Chiama il servizio di ricerca semantica Nadir su TC (deploy/horus-nadir/).
 * Come per callAnalysisService, l'embedding e la ricerca girano tutti su TC,
 * mai su Replit: qui inviamo solo la query e riceviamo i frammenti pertinenti.
 */
async function callNadirService(
  query: string,
  limit: number | undefined,
  signal?: AbortSignal
): Promise<string> {
  const baseUrl = process.env["NADIR_URL"];
  const gateToken = process.env["NADIR_GATE_TOKEN"];
  if (!baseUrl || !gateToken) {
    return "Servizio di ricerca semantica Nadir non configurato (NADIR_URL/NADIR_GATE_TOKEN mancanti).";
  }
  if (!query.trim()) {
    return "Query di ricerca mancante.";
  }

  const timeoutSignal = AbortSignal.timeout(60 * 1000);
  const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nadir-Gate-Token": gateToken,
      },
      body: JSON.stringify({ query: query.trim(), ...(limit !== undefined ? { limit } : {}) }),
      signal: combinedSignal,
    });
  } catch (err) {
    if (signal?.aborted) {
      return "Ricerca interrotta dall'utente.";
    }
    throw err;
  }

  const data = (await res.json().catch(() => ({}))) as NadirServiceResponse;
  if (!res.ok || data.error) {
    return `Il servizio Nadir ha risposto con errore (HTTP ${res.status}): ${data.error ?? "errore sconosciuto"}.`;
  }
  return data.result ?? "Nadir non ha restituito alcun risultato.";
}

interface HubWriteResponse {
  ok?: boolean;
  path?: string;
  error?: string;
}

interface HubReadResponse {
  ok?: boolean;
  path?: string;
  content?: string;
  error?: string;
}

interface HubListEntry {
  name: string;
  type: "file" | "dir";
}

interface HubListResponse {
  ok?: boolean;
  path?: string;
  entries?: HubListEntry[];
  error?: string;
}

/**
 * Chiama il servizio horus-hub su TC (deploy/horus-hub/) per leggere/scrivere
 * nella cartella condivisa tra agenti. Come per callAnalysisService/
 * callNadirService, tutto l'I/O reale (filesystem) avviene su TC, mai su
 * Replit: qui inviamo solo la richiesta e riceviamo il risultato.
 */
async function callHubService(
  path: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const timeoutSignal = AbortSignal.timeout(30 * 1000);
  const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  const baseUrl = process.env["HORUS_HUB_URL"] as string;
  const gateToken = process.env["HUB_GATE_TOKEN"] as string;

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        "X-Hub-Gate-Token": gateToken,
      },
      signal: combinedSignal,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new Error("__aborted__");
    }
    throw err;
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

async function saveFileTool(relPath: string, content: string, signal?: AbortSignal): Promise<string> {
  if (!isHubConfigured()) {
    return "Cartella condivisa su TC non configurata (HORUS_HUB_URL/HUB_GATE_TOKEN mancanti).";
  }
  if (!relPath.trim()) {
    return "Percorso file mancante.";
  }
  try {
    const { ok, status, data } = await callHubService(
      "/files/write",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath.trim(), content }),
      },
      signal
    );
    const parsed = data as HubWriteResponse;
    if (!ok || parsed.error) {
      return `La cartella condivisa ha risposto con errore (HTTP ${status}): ${parsed.error ?? "errore sconosciuto"}.`;
    }
    return `File salvato nella cartella condivisa: ${parsed.path ?? relPath.trim()}.`;
  } catch (err) {
    if (err instanceof Error && err.message === "__aborted__") return "Salvataggio interrotto dall'utente.";
    throw err;
  }
}

async function readFileTool(relPath: string, signal?: AbortSignal): Promise<string> {
  if (!isHubConfigured()) {
    return "Cartella condivisa su TC non configurata (HORUS_HUB_URL/HUB_GATE_TOKEN mancanti).";
  }
  if (!relPath.trim()) {
    return "Percorso file mancante.";
  }
  try {
    const { ok, status, data } = await callHubService(
      `/files/read?path=${encodeURIComponent(relPath.trim())}`,
      { method: "GET" },
      signal
    );
    const parsed = data as HubReadResponse;
    if (!ok || parsed.error) {
      return `La cartella condivisa ha risposto con errore (HTTP ${status}): ${parsed.error ?? "errore sconosciuto"}.`;
    }
    return parsed.content ?? "";
  } catch (err) {
    if (err instanceof Error && err.message === "__aborted__") return "Lettura interrotta dall'utente.";
    throw err;
  }
}

async function listFilesTool(relPath: string, signal?: AbortSignal): Promise<string> {
  if (!isHubConfigured()) {
    return "Cartella condivisa su TC non configurata (HORUS_HUB_URL/HUB_GATE_TOKEN mancanti).";
  }
  try {
    const { ok, status, data } = await callHubService(
      `/files/list?path=${encodeURIComponent(relPath.trim())}`,
      { method: "GET" },
      signal
    );
    const parsed = data as HubListResponse;
    if (!ok || parsed.error) {
      return `La cartella condivisa ha risposto con errore (HTTP ${status}): ${parsed.error ?? "errore sconosciuto"}.`;
    }
    const entries = parsed.entries ?? [];
    if (entries.length === 0) {
      return `Nessun file in "${parsed.path ?? relPath.trim() ?? "."}".`;
    }
    return `Contenuto di "${parsed.path ?? "."}":\n${entries
      .map((e) => `- ${e.name}${e.type === "dir" ? "/" : ""}`)
      .join("\n")}`;
  } catch (err) {
    if (err instanceof Error && err.message === "__aborted__") return "Elenco interrotto dall'utente.";
    throw err;
  }
}

interface HubVramBreakdownEntry {
  pid?: string;
  usedMiB?: number;
  model?: string | null;
  agent?: string | null;
}

interface HubVramResponse {
  ok?: boolean;
  current?: { usedMiB: number; totalMiB: number; pct: number };
  peak24h?: { usedMiB: number; totalMiB: number; pct: number; at: string | null };
  breakdown?: HubVramBreakdownEntry[];
  breakdownConfidence?: string;
  lastSampleAt?: string | null;
  error?: string;
}

async function checkVramUsageTool(signal?: AbortSignal): Promise<string> {
  if (!isHubConfigured()) {
    return "Monitor VRAM su TC non configurato (HORUS_HUB_URL/HUB_GATE_TOKEN mancanti).";
  }
  try {
    const { ok, status, data } = await callHubService("/vram", { method: "GET" }, signal);
    const parsed = data as HubVramResponse;
    if (!ok || parsed.error) {
      return `Il monitor VRAM ha risposto con errore (HTTP ${status}): ${parsed.error ?? "errore sconosciuto"}.`;
    }
    if (!parsed.current) {
      return "Il monitor VRAM non ha ancora un campione disponibile (servizio appena partito?).";
    }
    const lines: string[] = [
      `VRAM attuale su TC: ${parsed.current.usedMiB}MiB/${parsed.current.totalMiB}MiB (${parsed.current.pct.toFixed(0)}%).`,
    ];
    if (parsed.peak24h) {
      const at = parsed.peak24h.at ? new Date(parsed.peak24h.at).toLocaleString("it-IT") : "sconosciuto";
      lines.push(
        `Picco ultime 24h: ${parsed.peak24h.usedMiB}MiB/${parsed.peak24h.totalMiB}MiB (${parsed.peak24h.pct.toFixed(0)}%) alle ${at}.`
      );
    }
    if (parsed.breakdown && parsed.breakdown.length > 0) {
      const breakdownLines = parsed.breakdown.map((b) => {
        const label = b.agent ?? b.model ?? `pid ${b.pid ?? "?"}`;
        return `  - ${label}: ${b.usedMiB ?? "?"}MiB`;
      });
      lines.push(
        `Ripartizione per processo${parsed.breakdownConfidence === "heuristic-paired" ? " (stima)" : ""}:\n${breakdownLines.join("\n")}`
      );
    }
    return lines.join("\n");
  } catch (err) {
    if (err instanceof Error && err.message === "__aborted__") return "Controllo VRAM interrotto dall'utente.";
    throw err;
  }
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
          signal,
          typeof args.extraContext === "string" ? args.extraContext : undefined
        );
      case "sonar_scan":
        return await sonarScanTool(String(args.repo ?? ""), signal);
      case "search_manual":
        return await callNadirService(
          String(args.query ?? ""),
          typeof args.limit === "number" ? args.limit : undefined,
          signal
        );
      case "save_file":
        return await saveFileTool(String(args.path ?? ""), String(args.content ?? ""), signal);
      case "read_file":
        return await readFileTool(String(args.path ?? ""), signal);
      case "list_files":
        return await listFilesTool(String(args.path ?? ""), signal);
      case "check_vram_usage":
        return await checkVramUsageTool(signal);
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

// Un turno di chat con tool reinserisce il risultato del tool nel prompt
// dell'iterazione successiva. Se il risultato è grande, il prefill cresce e la
// generazione può superare il tetto di tempo del tunnel Cloudflare (~100-125s),
// che chiude la connessione con un HTTP 524. Cappiamo quindi ogni risultato
// prima di reinserirlo nella conversazione, così i turni consecutivi che usano
// tool non si bloccano più. Il modello viene avvisato esplicitamente del taglio
// e può richiamare il tool in modo più mirato se gli serve il resto.
export const MAX_TOOL_RESULT_CHARS = 4000;

/** Taglia un risultato di tool troppo grande prima di reinserirlo nel prompt
 * dell'iterazione successiva, spezzando su un a-capo quando possibile e
 * segnalando il taglio al modello. `maxChars` permette di stringere il cap
 * quando un budget totale del turno (gestito dal chiamante) si sta esaurendo;
 * di default usa `MAX_TOOL_RESULT_CHARS`. Vedi `MAX_TOOL_RESULT_CHARS` per il
 * perché (tetto di prefill del tunnel Cloudflare). Condiviso tra web chat e CLI. */
export function capToolResult(result: string, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  const cut = result.slice(0, maxChars);
  const lastNewline = cut.lastIndexOf("\n");
  const safeCut = lastNewline > maxChars * 0.6 ? cut.slice(0, lastNewline) : cut;
  return (
    `${safeCut.trimEnd()}\n\n[... risultato troncato a ${maxChars} caratteri ` +
    `per restare sotto il limite di tempo del tunnel: richiama il tool in modo più specifico ` +
    `(es. un percorso o una query più mirata) se ti serve il resto.]`
  );
}
