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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`horus-analysis-service in ascolto sulla porta ${PORT}`);
});
