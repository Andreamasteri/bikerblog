"use strict";

/**
 * Nadir — servizio di ricerca semantica per Horus e Bowie.
 *
 * Gira sulla macchina personale dell'utente ("TC"), la stessa che ospita
 * Ollama e il servizio di analisi codice (deploy/horus-analysis/). Segue lo
 * stesso pattern: un piccolo server Express standalone (fuori dal monorepo,
 * niente TypeScript), protetto da un gate token, raggiunto da Replit tramite
 * il tunnel Cloudflare.
 *
 * Cosa fa: costruisce un indice vettoriale file-based (JSON, nessun database
 * vettoriale) su tre corpi di testo —
 *   1. un "manuale" testuale (inbox/nadir-manual.md, lato repo);
 *   2. le conversazioni recenti che coinvolgono Bowie;
 *   3. i commenti pubblici dei post del blog;
 * ottenuti in un colpo solo dall'endpoint di sola lettura dell'api-server
 * (GET /api/_internal/nadir-export). Gli embedding sono calcolati localmente
 * da Ollama con il modello `all-minilm`. La ricerca è una similarità del
 * coseno in memoria.
 *
 * È volutamente agnostico rispetto all'agente: Horus, Bowie e un eventuale
 * terzo agente ("Quebracho") interrogano lo stesso endpoint /search allo
 * stesso modo. Nadir non sa né gli importa quale agente stia chiamando.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const SERVICE_NAME = "Nadir";
const EMBED_MODEL = process.env.NADIR_EMBED_MODEL || "all-minilm";

const PORT = Number(process.env.PORT) || 4700;
const GATE_TOKEN = process.env.NADIR_GATE_TOKEN;
const OLLAMA_URL = (process.env.NADIR_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const INDEX_FILE = process.env.NADIR_INDEX_FILE || path.join(__dirname, "nadir-index.json");

// Da dove Nadir prende i dati da indicizzare: l'api-server di BikerBlog, dietro
// lo stesso bearer token interno delle altre rotte /_internal/*.
const EXPORT_URL = (process.env.BLOG_EXPORT_URL || "").replace(/\/$/, "");
const EXPORT_TOKEN = process.env.BLOG_EXPORT_TOKEN;

const EMBED_BATCH_SIZE = Number(process.env.NADIR_EMBED_BATCH_SIZE) || 32;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const MAX_DOC_CHARS = 2000;
const MANUAL_MIN_CHUNK_CHARS = 20;

function log(...args) {
  // Servizio standalone fuori dal monorepo: console.log è il canale di log
  // previsto qui (a differenza dell'api-server, dove si usa il logger).
  console.log(`[${SERVICE_NAME}/${EMBED_MODEL}]`, ...args);
}

/** Stato dell'indice in memoria, ricaricato dal file all'avvio. */
let indexState = {
  builtAt: null,
  embedModel: EMBED_MODEL,
  docs: [], // { id, source, text, ref, embedding: number[] }
};

function loadIndexFromDisk() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const raw = fs.readFileSync(INDEX_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.docs)) {
        indexState = {
          builtAt: parsed.builtAt || null,
          embedModel: parsed.embedModel || EMBED_MODEL,
          docs: parsed.docs,
        };
        log(`Indice caricato da ${INDEX_FILE}: ${indexState.docs.length} documenti.`);
      }
    }
  } catch (err) {
    log(`Impossibile caricare l'indice esistente (${err.message}). Si parte da vuoto.`);
  }
}

function saveIndexToDisk() {
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(indexState), "utf-8");
  fs.renameSync(tmp, INDEX_FILE);
}

/** Chiama Ollama per calcolare gli embedding di uno o più testi. */
async function embed(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // keep_alive: -1 tiene il modello di embedding residente in RAM a tempo
    // indeterminato (Task #178, richiesta esplicita dell'utente): senza questo
    // Ollama lo scarica dopo ~5 minuti di inattività e ogni reindex/ricerca
    // successiva paga il ricaricamento da disco. Si scarica solo con un'azione
    // manuale sul server TC.
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, keep_alive: -1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama /api/embed ha risposto HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}. ` +
        `Verifica che Ollama sia in esecuzione su ${OLLAMA_URL} e che il modello "${EMBED_MODEL}" sia scaricato (ollama pull ${EMBED_MODEL}).`
    );
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.embeddings)) {
    throw new Error("Risposta di embedding inattesa da Ollama (manca il campo 'embeddings').");
  }
  return data.embeddings;
}

async function embedBatched(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embed(batch);
    for (const v of vectors) out.push(v);
  }
  return out;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function clampText(text) {
  const trimmed = String(text || "").trim();
  return trimmed.length > MAX_DOC_CHARS ? trimmed.slice(0, MAX_DOC_CHARS) : trimmed;
}

/**
 * Trasforma l'export dell'api-server nell'elenco piatto di documenti da
 * indicizzare. Ogni documento porta con sé la sua origine (`source`) e un
 * riferimento leggibile (`ref`) usato per contestualizzare i risultati.
 */
function buildDocsFromExport(exportData) {
  const docs = [];

  // 1. Manuale: un frammento per paragrafo (blocco separato da riga vuota).
  const manual = String(exportData.manual || "");
  const paragraphs = manual
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MANUAL_MIN_CHUNK_CHARS && !p.startsWith("<!--"));
  paragraphs.forEach((p, i) => {
    docs.push({
      id: `manual:${i}`,
      source: "manual",
      text: clampText(p),
      ref: "Manuale",
    });
  });

  // 2. Conversazioni: un frammento per turno.
  const conversations = Array.isArray(exportData.conversations) ? exportData.conversations : [];
  for (const conv of conversations) {
    const turns = Array.isArray(conv.turns) ? conv.turns : [];
    turns.forEach((turn, i) => {
      const content = clampText(turn.content);
      if (!content) return;
      const speaker = turn.agent === "bowie" ? "Bowie" : "Horus";
      docs.push({
        id: `conversation:${conv.id}:${i}`,
        source: "conversation",
        text: `${speaker}: ${content}`,
        ref: `Conversazione «${conv.topic || "senza titolo"}»`,
      });
    });
  }

  // 3. Commenti pubblici.
  const comments = Array.isArray(exportData.comments) ? exportData.comments : [];
  for (const c of comments) {
    const body = clampText(c.body);
    if (!body) continue;
    docs.push({
      id: `comment:${c.id}`,
      source: "comment",
      text: body,
      ref: `Commento di ${c.authorName || "anonimo"} su «${c.postTitle || c.postSlug || "post"}»`,
    });
  }

  return docs;
}

async function fetchExport() {
  if (!EXPORT_URL || !EXPORT_TOKEN) {
    throw new Error(
      "Sorgente dati non configurata: imposta BLOG_EXPORT_URL e BLOG_EXPORT_TOKEN " +
        "(base URL dell'api-server BikerBlog e il bearer token interno)."
    );
  }
  const res = await fetch(`${EXPORT_URL}/api/_internal/nadir-export`, {
    headers: { Authorization: `Bearer ${EXPORT_TOKEN}`, Accept: "application/json" },
  });
  if (res.status === 401) {
    throw new Error("Export non autorizzato (401): BLOG_EXPORT_TOKEN non combacia con il token interno dell'api-server.");
  }
  if (!res.ok) {
    throw new Error(`Export fallito (HTTP ${res.status}) da ${EXPORT_URL}/api/_internal/nadir-export.`);
  }
  return res.json();
}

async function reindex() {
  const exportData = await fetchExport();
  const docs = buildDocsFromExport(exportData);

  if (docs.length === 0) {
    indexState = { builtAt: new Date().toISOString(), embedModel: EMBED_MODEL, docs: [] };
    saveIndexToDisk();
    return { indexed: 0, bySource: { manual: 0, conversation: 0, comment: 0 } };
  }

  const embeddings = await embedBatched(docs.map((d) => d.text));
  const embeddedDocs = docs.map((d, i) => ({ ...d, embedding: embeddings[i] }));

  indexState = {
    builtAt: new Date().toISOString(),
    embedModel: EMBED_MODEL,
    docs: embeddedDocs,
  };
  saveIndexToDisk();

  const bySource = { manual: 0, conversation: 0, comment: 0 };
  for (const d of embeddedDocs) bySource[d.source] = (bySource[d.source] || 0) + 1;
  return { indexed: embeddedDocs.length, bySource };
}

async function search(query, limit) {
  if (indexState.docs.length === 0) {
    return "L'indice di Nadir è vuoto: esegui prima una indicizzazione (POST /reindex).";
  }
  const [queryEmbedding] = await embed([query]);
  const scored = indexState.docs
    .map((d) => ({ doc: d, score: cosineSimilarity(queryEmbedding, d.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const lines = scored.map((s, i) => {
    const pct = `${Math.round(s.score * 100)}%`;
    return `${i + 1}. [${s.doc.source} · ${s.doc.ref} · similarità ${pct}]\n   ${s.doc.text}`;
  });

  return (
    `Risultati più pertinenti per "${query}" (indice ${SERVICE_NAME}, modello ${EMBED_MODEL}):\n\n` +
    lines.join("\n\n")
  );
}

const app = express();
app.use(express.json({ limit: "256kb" }));

// Liveness/diagnostica: non richiede il gate token, così un probe può
// verificare che il servizio sia su e con quale modello di embedding gira.
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    embedModel: EMBED_MODEL,
    indexed: indexState.docs.length,
    builtAt: indexState.builtAt,
  });
});

// Da qui in poi tutto è protetto dal gate token, come il servizio di analisi.
app.use((req, res, next) => {
  const provided = req.headers["x-nadir-gate-token"];
  if (!GATE_TOKEN || provided !== GATE_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

app.post("/search", async (req, res) => {
  const { query } = req.body || {};
  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query mancante" });
  }
  let limit = DEFAULT_SEARCH_LIMIT;
  if (typeof (req.body || {}).limit === "number" && Number.isFinite(req.body.limit)) {
    limit = Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(req.body.limit)));
  }
  try {
    const result = await search(query.trim(), limit);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// La reindicizzazione (fetch export + embedding di tutti i documenti) può
// superare i ~100s di silenzio dopo cui il tunnel Cloudflare chiude la
// connessione: scriviamo heartbeat (spazi bianchi, ignorati da JSON.parse)
// mentre lavoriamo, poi chiudiamo con il JSON vero. Stesso pattern di
// /architect nel servizio di analisi.
app.post("/reindex", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let finished = false;
  const heartbeat = setInterval(() => {
    if (!finished) res.write(" ");
  }, 15_000);

  reindex()
    .then((summary) => {
      finished = true;
      clearInterval(heartbeat);
      res.statusCode = 200;
      res.end(JSON.stringify({ result: summary }));
    })
    .catch((err) => {
      finished = true;
      clearInterval(heartbeat);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
});

loadIndexFromDisk();
app.listen(PORT, () => {
  log(`${SERVICE_NAME} in ascolto sulla porta ${PORT} (embedding: ${EMBED_MODEL}, Ollama: ${OLLAMA_URL}).`);
});
