/**
 * Servizio di analisi codice per Horus — da eseguire su TC (ThinkCentre),
 * mai su Replit. Mantiene cloni locali persistenti di bikerlink/bikerblog/
 * bikerweb (aggiornati via `git fetch` + reset ad ogni chiamata) ed espone
 * endpoint HTTP che eseguono davvero typecheck/lint/ricerca/git log, così
 * Horus può fare analisi statica reale invece di limitarsi a leggere file
 * uno alla volta (vedi github_read).
 *
 * Protetto da un token condiviso (header X-Analysis-Gate-Token), stesso
 * pattern del gate nginx già usato per SearXNG (SEARXNG_GATE_TOKEN).
 *
 * Setup: vedi README.md in questa cartella.
 */

const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4600;
const GATE_TOKEN = process.env.ANALYSIS_GATE_TOKEN;
const WORKDIR = process.env.ANALYSIS_WORKDIR || path.join(__dirname, "repos");
const EXEC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minuti: npm install + typecheck su repo grandi può richiedere tempo
const MAX_OUTPUT_CHARS = 12000;

// --- Config del tool "architetto" (analisi/pianificazione/debug profondo) ---
// Gira interamente su TC: usa Ollama in locale (NON il tunnel Cloudflare usato
// da HORUS_OLLAMA_URL per Replit->TC — qui la chiamata è TC->TC), quindi niente
// problema di timeout del tunnel per il round-trip verso il modello. La
// richiesta HTTP che Replit fa VERSO questo endpoint, invece, passa comunque
// dal tunnel: per questo l'handler scrive heartbeat mentre aspetta la
// generazione (vedi architectHandler più sotto), come già fa horusChat con lo
// streaming NDJSON lato client Replit.
const ARCHITECT_OLLAMA_URL = process.env.ARCHITECT_OLLAMA_URL || "http://localhost:11434";
const ARCHITECT_MODEL = process.env.ARCHITECT_OLLAMA_MODEL || "bikerlink:latest";
const ARCHITECT_TIMEOUT_MS = Number(process.env.ARCHITECT_TIMEOUT_MS) || 8 * 60 * 1000; // 8 minuti
const ARCHITECT_MAX_PATHS = 8;
const ARCHITECT_MAX_FILE_CHARS = 6000;
const ARCHITECT_MAX_CONTEXT_CHARS = 30000;
const ARCHITECT_MAX_TASK_CHARS = 4000;
const ARCHITECT_MAX_OUTPUT_TOKENS = 2048;
const ARCHITECT_MODES = {
  plan: "Pianificazione: proponi un piano di implementazione concreto e ordinato in step, con i file probabilmente coinvolti, le dipendenze tra step e i rischi principali.",
  debug: "Debug/root cause: analizza il problema descritto e il contesto fornito per identificare la causa più probabile, come verificarla e una direzione di fix.",
  evaluate: "Valutazione: analizza lo stato o l'implementazione esistente descritta, evidenziando qualità, rischi, gap e possibili miglioramenti.",
};

// --- Config del tool "sonar_scan" (analisi SonarQube reale, non tsc/eslint) ---
// SonarQube gira anch'esso su TC (Docker), fuori dalla portata di Replit.
// Come per /architect, questo endpoint può richiedere molto più di 100s
// (scanner + attesa del Compute Engine task), quindi usa lo stesso pattern
// di heartbeat per non far scadere il tunnel Cloudflare.
const SONARQUBE_URL = (process.env.SONARQUBE_URL || "http://localhost:9000").replace(/\/$/, "");
const SONARQUBE_TOKEN = process.env.SONARQUBE_TOKEN;
const SONAR_SCANNER_TIMEOUT_MS = Number(process.env.SONAR_SCANNER_TIMEOUT_MS) || 15 * 60 * 1000; // 15 minuti
const SONAR_TASK_TIMEOUT_MS = Number(process.env.SONAR_TASK_TIMEOUT_MS) || 10 * 60 * 1000; // 10 minuti
const SONAR_TASK_POLL_INTERVAL_MS = 3000;

const REPOS = {
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

if (!GATE_TOKEN) {
  console.error("ANALYSIS_GATE_TOKEN non impostato — il servizio rifiuterà tutte le richieste.");
}

fs.mkdirSync(WORKDIR, { recursive: true });

// Mutex per-repo: evita clone/install concorrenti sullo stesso repo se
// arrivano due richieste ravvicinate.
const repoLocks = new Map();
function withRepoLock(repoKey, fn) {
  const prev = repoLocks.get(repoKey) || Promise.resolve();
  const next = prev.then(fn, fn);
  repoLocks.set(
    repoKey,
    next.catch(() => {})
  );
  return next;
}

function normalizeGithubToken(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("github_pat_") || trimmed.startsWith("ghp_")) return trimmed;
  return `github_pat_${trimmed}`;
}

function resolveToken(repoKey) {
  for (const envVar of REPOS[repoKey].tokenEnvVars) {
    const value = process.env[envVar];
    if (value && value.trim()) return normalizeGithubToken(value);
  }
  return undefined;
}

function run(cmd, args, cwd, timeoutMs = EXEC_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout: stdout || "",
          stderr: stderr || (error ? error.message : ""),
          timedOut: Boolean(error && error.killed),
        });
      }
    );
  });
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (troncato, output più lungo di ${MAX_OUTPUT_CHARS} caratteri)`;
}

async function ensureRepo(repoKey) {
  const { repo } = REPOS[repoKey];
  const token = resolveToken(repoKey);
  const dir = path.join(WORKDIR, repoKey);
  const remote = token
    ? `https://${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.rmSync(dir, { recursive: true, force: true });
    const cloneRes = await run("git", ["clone", "--depth", "1", remote, dir], WORKDIR);
    if (cloneRes.code !== 0) {
      throw new Error(`git clone fallito per ${repo}: ${cloneRes.stderr.slice(0, 500)}`);
    }
    return dir;
  }

  // Repo già clonato: allinea alla remote invece di riclonare da zero.
  await run("git", ["remote", "set-url", "origin", remote], dir);
  const fetchRes = await run("git", ["fetch", "--depth", "1", "origin"], dir);
  if (fetchRes.code !== 0) {
    throw new Error(`git fetch fallito per ${repo}: ${fetchRes.stderr.slice(0, 500)}`);
  }
  const headRes = await run("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], dir);
  const defaultRef = headRes.stdout.trim().replace(/^origin\//, "") || "main";
  await run("git", ["reset", "--hard", `origin/${defaultRef}`], dir);
  return dir;
}

function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

async function ensureDeps(dir) {
  if (fs.existsSync(path.join(dir, "node_modules"))) return { code: 0, stdout: "", stderr: "" };
  const pm = detectPackageManager(dir);
  if (pm === "pnpm") return run("pnpm", ["install", "--frozen-lockfile"], dir);
  if (pm === "yarn") return run("yarn", ["install", "--frozen-lockfile"], dir);
  return run("npm", ["install", "--no-audit", "--no-fund"], dir);
}

function readPackageJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

async function typecheckRepo(repoKey) {
  const dir = await ensureRepo(repoKey);
  const pkg = readPackageJson(dir);
  const installRes = await ensureDeps(dir);
  if (installRes.code !== 0) {
    return `Installazione dipendenze fallita in ${repoKey}:\n${truncate(installRes.stderr)}`;
  }

  const pm = detectPackageManager(dir);
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm";

  if (pkg && pkg.scripts && pkg.scripts.typecheck) {
    const res = await run(runner, ["run", "typecheck"], dir);
    return formatCheckResult("typecheck", repoKey, res);
  }

  if (fs.existsSync(path.join(dir, "tsconfig.json"))) {
    const res = await run("npx", ["tsc", "--noEmit"], dir);
    return formatCheckResult("tsc --noEmit", repoKey, res);
  }

  return `Nessun setup TypeScript trovato in ${repoKey} (né script "typecheck" né tsconfig.json in root).`;
}

async function lintRepo(repoKey) {
  const dir = await ensureRepo(repoKey);
  const pkg = readPackageJson(dir);
  const installRes = await ensureDeps(dir);
  if (installRes.code !== 0) {
    return `Installazione dipendenze fallita in ${repoKey}:\n${truncate(installRes.stderr)}`;
  }

  const pm = detectPackageManager(dir);
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm";

  if (pkg && pkg.scripts && pkg.scripts.lint) {
    const res = await run(runner, ["run", "lint"], dir);
    return formatCheckResult("lint", repoKey, res);
  }

  const hasEslintConfig = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ].some((f) => fs.existsSync(path.join(dir, f)));

  if (hasEslintConfig) {
    const res = await run("npx", ["eslint", "."], dir);
    return formatCheckResult("eslint", repoKey, res);
  }

  return `Nessun setup lint trovato in ${repoKey} (né script "lint" né config ESLint in root).`;
}

function formatCheckResult(label, repoKey, res) {
  if (res.timedOut) {
    return `${label} su ${repoKey} interrotto per timeout (${EXEC_TIMEOUT_MS / 1000}s).`;
  }
  const output = truncate(`${res.stdout}\n${res.stderr}`.trim());
  if (res.code === 0) {
    return `${label} su ${repoKey}: OK, nessun errore.\n\n${output || "(nessun output)"}`;
  }
  return `${label} su ${repoKey}: TROVATI PROBLEMI (exit code ${res.code}).\n\n${output || "(nessun output, controlla manualmente)"}`;
}

async function searchCode(repoKey, query) {
  const dir = await ensureRepo(repoKey);
  const res = await run("git", ["grep", "-n", "-I", "--", query], dir);
  if (res.code === 1 && !res.stdout && !res.stderr) {
    return `Nessun risultato per "${query}" in ${repoKey}.`;
  }
  if (res.code > 1) {
    return `Ricerca fallita in ${repoKey}: ${truncate(res.stderr)}`;
  }
  return `Risultati per "${query}" in ${repoKey}:\n\n${truncate(res.stdout)}`;
}

async function gitLog(repoKey, limit) {
  const dir = await ensureRepo(repoKey);
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const res = await run(
    "git",
    ["log", "-n", String(n), "--stat", "--pretty=format:--- %h %ad %s ---", "--date=short"],
    dir
  );
  if (res.code !== 0) {
    return `git log fallito in ${repoKey}: ${truncate(res.stderr)}`;
  }
  return truncate(res.stdout || "(nessun commit trovato)");
}

/**
 * Legge un file (o elenca una cartella) dal clone locale del repo, restando
 * dentro la cartella del repo (niente path traversal via "..").
 */
function readRepoPath(dir, relPath, maxChars) {
  const cleaned = String(relPath || "").trim().replace(/^\/+/, "");
  const full = path.resolve(dir, cleaned || ".");
  const rootResolved = path.resolve(dir);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    return `"${cleaned}" è fuori dal repo, ignorato.`;
  }
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return `"${cleaned || "/"}" non trovato nel repo.`;
  }
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(full);
    return `[cartella "${cleaned || "/"}"] ${entries.join(", ") || "(vuota)"}`;
  }
  try {
    const content = fs.readFileSync(full, "utf-8");
    return content.length > maxChars
      ? `${content.slice(0, maxChars)}\n… (troncato ai primi ${maxChars} caratteri)`
      : content;
  } catch {
    return `"${cleaned}" non leggibile come testo (binario?).`;
  }
}

/** Raccoglie il contesto (file/cartelle) per il tool "architetto", entro un budget totale di caratteri. */
function gatherArchitectContext(dir, paths) {
  const limitedPaths = (Array.isArray(paths) ? paths : []).slice(0, ARCHITECT_MAX_PATHS);
  if (limitedPaths.length === 0) return "";
  let budget = ARCHITECT_MAX_CONTEXT_CHARS;
  const parts = [];
  for (const p of limitedPaths) {
    if (budget <= 0) {
      parts.push("… (budget di contesto esaurito, altri percorsi ignorati)");
      break;
    }
    const perFileCap = Math.min(ARCHITECT_MAX_FILE_CHARS, budget);
    const content = readRepoPath(dir, p, perFileCap);
    parts.push(`--- ${p} ---\n${content}`);
    budget -= content.length;
  }
  return parts.join("\n\n");
}

/**
 * Chiama il modello Ollama IN LOCALE su TC (non il tunnel Cloudflare usato da
 * Replit) per produrre il report di analisi/pianificazione/debug. stream:false
 * va bene qui perché non c'è tunnel nel mezzo di questa chiamata specifica.
 */
/**
 * Errore con un `kind` esplicito così l'handler HTTP può distinguere
 * "Ollama irraggiungibile" da "modello mancante" da "timeout" invece di
 * far trapelare un errore fetch generico fino alla chat di Horus.
 */
class ArchitectError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "ArchitectError";
    this.kind = kind;
  }
}

async function callArchitectModel(systemPrompt, userPrompt, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${ARCHITECT_OLLAMA_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ARCHITECT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: { num_predict: ARCHITECT_MAX_OUTPUT_TOKENS },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ArchitectError(
        "timeout",
        `architetto: timeout dopo ${timeoutMs / 1000}s durante la generazione (modello lento o bloccato su TC).`
      );
    }
    const cause = err && err.cause ? err.cause : err;
    const code = cause && cause.code;
    throw new ArchitectError(
      "unreachable",
      `Ollama locale non raggiungibile su ${ARCHITECT_OLLAMA_URL} (${code || (err instanceof Error ? err.message : String(err))}). ` +
        "Verifica che Ollama sia installato e in esecuzione su TC (`ollama serve` o il servizio corrispondente), " +
        "e che ARCHITECT_OLLAMA_URL punti alla porta giusta (default http://localhost:11434)."
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const notFound =
      res.status === 404 ||
      /model .* not found/i.test(body) ||
      /no such model/i.test(body);
    if (notFound) {
      throw new ArchitectError(
        "model_not_found",
        `Modello "${ARCHITECT_MODEL}" non trovato su Ollama locale (TC). ` +
          `Esegui \`ollama pull ${ARCHITECT_MODEL}\` su TC oppure imposta ARCHITECT_OLLAMA_MODEL su un modello già installato ` +
          "(controlla con `ollama list`)."
      );
    }
    throw new ArchitectError(
      "http_error",
      `Ollama locale ha risposto ${res.status}: ${body.slice(0, 300)}`
    );
  }

  const data = await res.json();
  const content = data && data.message && data.message.content;
  if (!content) {
    throw new ArchitectError("empty_response", "Ollama locale ha restituito una risposta vuota.");
  }
  return truncate(content.trim());
}

async function architect({ repoKey, mode, task, paths, extraContext }) {
  const modeDesc = ARCHITECT_MODES[mode];
  const dir = await ensureRepo(repoKey);
  const fileContext = gatherArchitectContext(dir, paths);
  const logRes = await run(
    "git",
    ["log", "-n", "5", "--pretty=format:--- %h %ad %s ---", "--date=short"],
    dir
  );
  const recentLog = logRes.code === 0 ? logRes.stdout : "(git log non disponibile)";

  const systemPrompt =
    "Sei un architetto software senior che analizza codice reale per conto di un altro sviluppatore/agente. " +
    "Non scrivi né modifichi codice, non esegui comandi: produci solo un report scritto, chiaro e concreto. " +
    "Basati sui fatti forniti (file, commit recenti, compito, eventuali esiti di altre analisi come SonarQube); " +
    "se ti manca contesto essenziale, dillo esplicitamente invece di inventare dettagli sul codice che non hai visto.";
  const trimmedExtraContext = typeof extraContext === "string" ? extraContext.trim().slice(0, ARCHITECT_MAX_CONTEXT_CHARS) : "";
  const userPrompt =
    `Repo: ${repoKey}\n` +
    `Modalità richiesta: ${mode} — ${modeDesc}\n\n` +
    `Compito/domanda:\n${task}\n\n` +
    `Commit recenti:\n${recentLog}\n\n` +
    `File/cartelle di contesto forniti:\n${fileContext || "(nessuno fornito)"}\n\n` +
    `Contesto aggiuntivo da altre analisi (es. sonar_scan/typecheck/lint), se fornito:\n${trimmedExtraContext || "(nessuno fornito)"}\n\n` +
    "Rispondi con un report strutturato (usa un breve elenco puntato o step numerati dove utile), " +
    "concreto e diretto, coerente con la modalità richiesta.";

  return callArchitectModel(systemPrompt, userPrompt, ARCHITECT_TIMEOUT_MS);
}

function isSonarConfigured() {
  return Boolean(SONARQUBE_TOKEN);
}

function sonarAuthHeader() {
  return `Basic ${Buffer.from(`${SONARQUBE_TOKEN}:`).toString("base64")}`;
}

async function sonarApiGet(pathAndQuery) {
  const res = await fetch(`${SONARQUBE_URL}${pathAndQuery}`, {
    headers: { Authorization: sonarAuthHeader() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SonarQube API ${pathAndQuery} ha risposto ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function extractCeTaskId(scannerOutput) {
  const match = scannerOutput.match(/api\/ce\/task\?id=([\w-]+)/);
  return match ? match[1] : undefined;
}

async function waitForSonarTask(taskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await sonarApiGet(`/api/ce/task?id=${encodeURIComponent(taskId)}`);
    const status = data && data.task && data.task.status;
    if (status === "SUCCESS") return data.task;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Analisi SonarQube ${String(status).toLowerCase()} per il task ${taskId}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, SONAR_TASK_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timeout in attesa del completamento dell'analisi SonarQube (task ${taskId}) dopo ${timeoutMs / 1000}s.`
  );
}

const SONAR_MEASURE_LABELS = {
  duplicated_lines_density: "Duplicazione codice",
  duplicated_blocks: "Blocchi duplicati",
  sqale_index: "Debito tecnico (minuti stimati)",
  sqale_debt_ratio: "Debt ratio",
  sqale_rating: "Rating manutenibilità",
};

function formatSonarMeasures(measuresData) {
  const measures = (measuresData && measuresData.component && measuresData.component.measures) || [];
  if (measures.length === 0) return "(nessuna misura disponibile)";
  return measures
    .map((m) => `- ${SONAR_MEASURE_LABELS[m.metric] || m.metric}: ${m.value}`)
    .join("\n");
}

function formatSonarResult(repoKey, projectKey, issuesData, hotspotsData, measuresData) {
  const issues = (issuesData && issuesData.issues) || [];
  const hotspots = (hotspotsData && hotspotsData.hotspots) || [];
  const measuresSummary = formatSonarMeasures(measuresData);

  if (issues.length === 0 && hotspots.length === 0) {
    return (
      `SonarQube su ${repoKey}: nessun problema aperto trovato (progetto "${projectKey}").\n\n` +
      `Duplicazioni e debito tecnico:\n${measuresSummary}`
    );
  }

  const bySeverity = {};
  for (const issue of issues) {
    const key = `${issue.type} [${issue.severity}]`;
    bySeverity[key] = (bySeverity[key] || 0) + 1;
  }
  const summaryLines = Object.entries(bySeverity)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `- ${label}: ${count}`);

  const topIssues = issues
    .slice(0, 30)
    .map(
      (issue) =>
        `[${issue.type}/${issue.severity}] ${String(issue.component || "").split(":").pop()}:${issue.line ?? "?"} — ${issue.message}`
    );

  const hotspotLines = hotspots
    .slice(0, 20)
    .map(
      (h) =>
        `[SECURITY HOTSPOT/${h.vulnerabilityProbability}] ${String(h.component || "").split(":").pop()}:${h.line ?? "?"} — ${h.message}`
    );

  const parts = [
    `SonarQube su ${repoKey} (progetto "${projectKey}"): ${issues.length} problemi aperti, ${hotspots.length} security hotspot.`,
    `Riepilogo per tipo/severità:\n${summaryLines.join("\n")}`,
    `Duplicazioni e debito tecnico:\n${measuresSummary}`,
    `Problemi principali (max 30):\n${topIssues.join("\n") || "(nessuno)"}`,
  ];
  if (hotspots.length > 0) {
    parts.push(`Security hotspot (max 20):\n${hotspotLines.join("\n")}`);
  }
  return truncate(parts.join("\n\n"));
}

/**
 * Lancia una vera scansione SonarQube (code smell, duplicazioni,
 * vulnerabilità, security hotspot, debito tecnico) su uno dei repo — segnali
 * più profondi di typecheckRepo/lintRepo, che si fermano a errori di tipo e
 * regole di stile. L'analisi Sonar è asincrona (Compute Engine task): questa
 * funzione lancia lo scanner, attende il completamento del task, poi legge
 * gli issue trovati dalla Web API di SonarQube.
 */
async function sonarScan(repoKey) {
  if (!isSonarConfigured()) {
    return (
      "SonarQube non configurato su questo servizio (manca SONARQUBE_TOKEN). " +
      "Vedi README.md per il setup del server SonarQube su TC e la generazione del token."
    );
  }
  const dir = await ensureRepo(repoKey);
  const projectKey = `horus-${repoKey}`;
  const scanRes = await run(
    "sonar-scanner",
    [
      `-Dsonar.projectKey=${projectKey}`,
      `-Dsonar.projectBaseDir=${dir}`,
      `-Dsonar.host.url=${SONARQUBE_URL}`,
      `-Dsonar.token=${SONARQUBE_TOKEN}`,
      "-Dsonar.sources=.",
    ],
    dir,
    SONAR_SCANNER_TIMEOUT_MS
  );

  const combinedOutput = `${scanRes.stdout}\n${scanRes.stderr}`;
  if (scanRes.code === 127 || /command not found|not recognized as an internal/i.test(scanRes.stderr)) {
    return (
      "sonar-scanner non trovato su questa macchina (TC). Installa SonarScanner CLI e assicurati " +
      "che sia disponibile nel PATH del processo che esegue questo servizio — vedi README.md."
    );
  }

  const taskId = extractCeTaskId(combinedOutput);
  if (scanRes.code !== 0 || !taskId) {
    return `Scansione SonarQube fallita per ${repoKey} (exit code ${scanRes.code}):\n${truncate(combinedOutput.trim())}`;
  }

  await waitForSonarTask(taskId, SONAR_TASK_TIMEOUT_MS);

  const SONAR_MEASURE_METRICS = [
    "duplicated_lines_density",
    "duplicated_blocks",
    "sqale_index",
    "sqale_debt_ratio",
    "sqale_rating",
  ];
  const [issuesData, hotspotsData, measuresData] = await Promise.all([
    sonarApiGet(`/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&resolved=false&ps=100`),
    sonarApiGet(`/api/hotspots/search?projectKey=${encodeURIComponent(projectKey)}&ps=100`).catch(() => null),
    sonarApiGet(
      `/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${SONAR_MEASURE_METRICS.join(",")}`
    ).catch(() => null),
  ]);

  return formatSonarResult(repoKey, projectKey, issuesData, hotspotsData, measuresData);
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use((req, res, next) => {
  const provided = req.headers["x-analysis-gate-token"];
  if (!GATE_TOKEN || provided !== GATE_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

function isValidRepoKey(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(REPOS, value);
}

app.post("/typecheck", async (req, res) => {
  const { repo } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });
  try {
    const result = await withRepoLock(repo, () => typecheckRepo(repo));
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/lint", async (req, res) => {
  const { repo } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });
  try {
    const result = await withRepoLock(repo, () => lintRepo(repo));
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/search", async (req, res) => {
  const { repo, query } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });
  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query mancante" });
  }
  try {
    const result = await withRepoLock(repo, () => searchCode(repo, query));
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/git-log", async (req, res) => {
  const { repo, limit } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });
  try {
    const result = await withRepoLock(repo, () => gitLog(repo, limit));
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// L'analisi profonda dell'"architetto" può richiedere minuti su CPU. La
// richiesta arriva a questo servizio passando dal tunnel Cloudflare, che
// chiude la connessione dopo ~100s di silenzio: scriviamo quindi heartbeat
// (spazi bianchi, innocui per JSON.parse che ignora whitespace iniziale/
// finale) mentre aspettiamo il risultato, poi chiudiamo con il JSON vero.
app.post("/architect", (req, res) => {
  const { repo, mode, task, paths, extraContext } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });
  if (!Object.prototype.hasOwnProperty.call(ARCHITECT_MODES, mode)) {
    return res.status(400).json({ error: 'mode non valido, usa "plan", "debug" o "evaluate"' });
  }
  if (typeof task !== "string" || !task.trim()) {
    return res.status(400).json({ error: "task mancante" });
  }
  if (task.length > ARCHITECT_MAX_TASK_CHARS) {
    return res.status(400).json({
      error: `task troppo lungo (max ${ARCHITECT_MAX_TASK_CHARS} caratteri)`,
    });
  }
  if (paths !== undefined && !Array.isArray(paths)) {
    return res.status(400).json({ error: "paths deve essere un array di stringhe" });
  }
  if (extraContext !== undefined && typeof extraContext !== "string") {
    return res.status(400).json({ error: "extraContext deve essere una stringa" });
  }

  res.setHeader("Content-Type", "application/json");
  let finished = false;
  const heartbeat = setInterval(() => {
    if (!finished) res.write(" ");
  }, 15_000);

  withRepoLock(repo, () => architect({ repoKey: repo, mode, task, paths, extraContext }))
    .then((result) => {
      finished = true;
      clearInterval(heartbeat);
      res.statusCode = 200;
      res.end(JSON.stringify({ result }));
    })
    .catch((err) => {
      finished = true;
      clearInterval(heartbeat);
      const message = err instanceof Error ? err.message : String(err);
      const kind = err instanceof ArchitectError ? err.kind : undefined;
      const statusByKind = {
        timeout: 504,
        unreachable: 502,
        model_not_found: 502,
        http_error: 502,
        empty_response: 502,
      };
      res.statusCode = statusByKind[kind] || 500;
      res.end(JSON.stringify({ error: message, kind: kind || "unknown" }));
    });
});

// La scansione SonarQube (scanner + attesa del Compute Engine task) può
// richiedere più di 100s, come /architect: stesso pattern di heartbeat per
// non far scadere il tunnel Cloudflare durante l'attesa.
app.post("/sonar", (req, res) => {
  const { repo } = req.body || {};
  if (!isValidRepoKey(repo)) return res.status(400).json({ error: "repo non valido" });

  res.setHeader("Content-Type", "application/json");
  let finished = false;
  const heartbeat = setInterval(() => {
    if (!finished) res.write(" ");
  }, 15_000);

  withRepoLock(repo, () => sonarScan(repo))
    .then((result) => {
      finished = true;
      clearInterval(heartbeat);
      res.statusCode = 200;
      res.end(JSON.stringify({ result }));
    })
    .catch((err) => {
      finished = true;
      clearInterval(heartbeat);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
});

// Permette al client (lib/horus/src/tools.ts) di sapere, senza avere accesso
// diretto alle env var di TC, se SonarQube è configurato su questo servizio —
// usato per nascondere il tool sonar_scan quando non è disponibile, invece
// di esporlo sempre e fallire solo all'invocazione.
app.get("/capabilities", (_req, res) => {
  res.json({ sonarAvailable: isSonarConfigured() });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`horus-analysis-service in ascolto sulla porta ${PORT}`);
});
