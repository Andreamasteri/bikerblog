#!/usr/bin/env tsx
/**
 * generate-bikerlink-manuals — Task #195.
 *
 * Genera BOZZE di manuale per BikerLink, analizzando il codice sorgente reale
 * del repo `Andreamasteri/Bikerlink` (accesso in sola lettura via GitHub API,
 * stesso meccanismo del tool `github_read` di Horus/Bowie/Quebracho) con due
 * agenti indipendenti — Horus e Quebracho — ciascuno dei quali produce due
 * formati:
 *   1. "testuale"  — testo semplice, pensato per l'indicizzazione semantica
 *      di Nadir (poco markup, frasi dirette).
 *   2. "ricco"     — manuale esteso con più dettaglio e riferimenti a
 *      screenshot/asset ESISTENTI nel repo (mai inventati).
 *
 * Le 4 bozze + un file di confronto vengono salvate in una cartella NUOVA,
 * separata dall'archivio ufficiale (`docs/MANUALI BIKERLINK/`) e dal manuale
 * usato da Nadir (`inbox/nadir-manual.md`): questo script non scrive MAI in
 * nessuno dei due.
 *
 * Non fa parte della pipeline notturna (`cluster:daily`) — è pensato per
 * essere lanciato manualmente quando serve confrontare come i due agenti
 * "leggono" il codice di BikerLink.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run manuals:bikerlink
 *   pnpm --filter @workspace/scripts run manuals:bikerlink -- --agent horus
 *   pnpm --filter @workspace/scripts run manuals:bikerlink -- --agent quebracho
 *   pnpm --filter @workspace/scripts run manuals:bikerlink -- --dry-run
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  horusChatRaw,
  isHorusConfigured,
  quebrachoChatRaw,
  isQuebrachoConfigured,
  type HorusMessage,
} from "@workspace/horus";
import { auditContent } from "./content-audit.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const agentIdx = args.indexOf("--agent");
const AGENT_ARG = (agentIdx !== -1 ? args[agentIdx + 1] : "both") as
  | "horus"
  | "quebracho"
  | "both";

if (!["horus", "quebracho", "both"].includes(AGENT_ARG)) {
  console.error(`[manuals] --agent non valido: "${AGENT_ARG}" (valori ammessi: horus, quebracho, both)`);
  process.exit(1);
}

// ── GitHub read-only access (stesso repo/token del tool github_read) ────────

const GITHUB_API = "https://api.github.com";
const BIKERLINK_REPO = "Andreamasteri/Bikerlink";
const BIKERLINK_TOKEN_ENV_VARS = ["GITHUB_TOKEN_BIKERLINK", "GITHUB_TOKEN_BIKERBLOG"];

function normalizeGithubToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed && !/^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.test(trimmed)) {
    // Alcuni fine-grained PAT incollati come secret perdono il prefisso
    // "github_pat_" — vedi memoria Horus/GitHub. Non possiamo "indovinare"
    // il prefisso perso con certezza, quindi qui ci limitiamo a passare il
    // valore così com'è: la chiamata fallirà con 401 in modo esplicito
    // invece di corrompere silenziosamente il token.
    return trimmed;
  }
  return trimmed;
}

function resolveGithubToken(): string | undefined {
  for (const envVar of BIKERLINK_TOKEN_ENV_VARS) {
    const raw = process.env[envVar];
    if (raw && raw.trim()) return normalizeGithubToken(raw);
  }
  return undefined;
}

function githubHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "BikerlinkManualsBot",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface GithubTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

async function fetchDefaultBranch(token: string | undefined): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${BIKERLINK_REPO}`, { headers: githubHeaders(token) });
  if (!res.ok) {
    throw new Error(`Impossibile leggere il repo ${BIKERLINK_REPO} (HTTP ${res.status}). Verifica GITHUB_TOKEN_BIKERLINK/GITHUB_TOKEN_BIKERBLOG.`);
  }
  const data = (await res.json()) as { default_branch?: string };
  if (!data.default_branch) throw new Error(`Branch di default non trovato per ${BIKERLINK_REPO}.`);
  return data.default_branch;
}

async function fetchRepoTree(branch: string, token: string | undefined): Promise<GithubTreeEntry[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${BIKERLINK_REPO}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) {
    throw new Error(`Impossibile leggere l'albero del repo ${BIKERLINK_REPO}@${branch} (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { tree?: GithubTreeEntry[]; truncated?: boolean };
  if (data.truncated) {
    console.warn(
      `[manuals] ⚠ L'albero del repo ${BIKERLINK_REPO} è stato troncato da GitHub (repo molto grande) — l'inventario userà comunque ciò che è arrivato.`
    );
  }
  return data.tree ?? [];
}

async function fetchFileContent(path: string, token: string | undefined): Promise<string | null> {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const res = await fetch(`${GITHUB_API}/repos/${BIKERLINK_REPO}/contents/${encodedPath}`, {
    headers: githubHeaders(token),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { type?: string; encoding?: string; content?: string };
  if (data.type !== "file" || data.encoding !== "base64" || !data.content) return null;
  return Buffer.from(data.content, "base64").toString("utf-8");
}

// ── Inventory (funzioni pure, testabili senza rete) ──────────────────────────

export interface RepoInventory {
  totalFiles: number;
  totalDirs: number;
  topLevelDirs: string[];
  byExtension: Record<string, number>;
  screenFiles: string[];
  navigationFiles: string[];
  imageAssets: string[];
  screenshotAssets: string[];
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);
const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx"]);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function buildRepoInventory(tree: GithubTreeEntry[]): RepoInventory {
  const files = tree.filter((e) => e.type === "blob");
  const dirs = tree.filter((e) => e.type === "tree");

  const topLevelDirs = Array.from(
    new Set(
      dirs
        .map((d) => d.path)
        .filter((p) => !p.includes("/"))
    )
  ).sort();

  const byExtension: Record<string, number> = {};
  const screenFiles: string[] = [];
  const navigationFiles: string[] = [];
  const imageAssets: string[] = [];
  const screenshotAssets: string[] = [];

  const screenPattern = /\/(screens?|pages?|views?)\//i;
  const screenSuffixPattern = /(Screen|Page|View)\.(tsx|jsx|ts|js)$/;
  const navigationPattern = /navigation|router/i;
  const rootAppPattern = /^(src\/)?App\.(tsx|jsx|ts|js)$/;

  for (const file of files) {
    const ext = extensionOf(file.path);
    byExtension[ext] = (byExtension[ext] ?? 0) + 1;

    if (CODE_EXTENSIONS.has(ext)) {
      if (screenPattern.test(file.path) || screenSuffixPattern.test(file.path)) {
        screenFiles.push(file.path);
      }
      if (navigationPattern.test(file.path) || rootAppPattern.test(file.path)) {
        navigationFiles.push(file.path);
      }
    }

    if (IMAGE_EXTENSIONS.has(ext)) {
      imageAssets.push(file.path);
      if (/screenshot/i.test(file.path)) {
        screenshotAssets.push(file.path);
      }
    }
  }

  return {
    totalFiles: files.length,
    totalDirs: dirs.length,
    topLevelDirs,
    byExtension,
    screenFiles: screenFiles.sort(),
    navigationFiles: navigationFiles.sort(),
    imageAssets: imageAssets.sort(),
    screenshotAssets: screenshotAssets.sort(),
  };
}

const MAX_KEY_FILES = 20;
const MAX_SCREEN_FILES = 12;
const MAX_NAV_FILES = 3;

/**
 * Sceglie un sottoinsieme limitato di file "chiave" da scaricare per intero e
 * passare come contesto agli agenti. Deterministico (stesso input → stesso
 * output) così l'inventario è riproducibile a parità di stato del repo.
 */
export function selectKeyFiles(inventory: RepoInventory): string[] {
  const keyFiles = new Set<string>();
  keyFiles.add("README.md");
  keyFiles.add("package.json");
  keyFiles.add("app.json");

  for (const f of inventory.navigationFiles.slice(0, MAX_NAV_FILES)) keyFiles.add(f);
  for (const f of inventory.screenFiles.slice(0, MAX_SCREEN_FILES)) keyFiles.add(f);

  return Array.from(keyFiles).slice(0, MAX_KEY_FILES);
}

const MAX_FILE_CHARS = 3000;

async function fetchKeyFileContents(
  paths: string[],
  token: string | undefined
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  for (const path of paths) {
    try {
      const content = await fetchFileContent(path, token);
      if (content) {
        results.push({ path, content: content.slice(0, MAX_FILE_CHARS) });
      }
    } catch (err) {
      console.warn(`[manuals] ⚠ Impossibile leggere ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return results;
}

// ── Persona / privacy guard (matching engine — vedi translate.ts) ───────────

const PRIVACY_RULE = `REGOLA DI PRIVACY OBBLIGATORIA — motore di matching:
BikerLink ha un motore di matching proprietario. Nel manuale NON rivelare MAI:
- La logica interna dell'algoritmo di matching (formule, pesi, criteri numerici, SQL, funzioni GPS specifiche)
- Nomi di tabelle del database legate al matching
- Valori numerici di tipi/stati interni di match (codici, enum interni)
- Come viene calcolata la distanza GPS o il raggio di ricerca
- Nomi di file sorgente o percorsi interni del motore di matching
Descrivi il matching in modo funzionale, dal punto di vista dell'utente ("il sistema suggerisce moto e persone compatibili in base a interessi e posizione"), MAI il "come" tecnico interno.`;

function buildInventorySummary(inventory: RepoInventory): string {
  const extLines = Object.entries(inventory.byExtension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([ext, count]) => `  .${ext || "(senza estensione)"}: ${count}`)
    .join("\n");

  return `### Struttura del repo BikerLink (letta via GitHub API, sola lettura)
- File totali: ${inventory.totalFiles}
- Cartelle totali: ${inventory.totalDirs}
- Cartelle di primo livello: ${inventory.topLevelDirs.join(", ") || "(nessuna)"}
- Distribuzione per estensione (top 15):
${extLines}
- File identificati come schermate/pagine (${inventory.screenFiles.length}):
${inventory.screenFiles.slice(0, 30).map((f) => `  - ${f}`).join("\n") || "  (nessuno trovato)"}
- File di navigazione/routing (${inventory.navigationFiles.length}):
${inventory.navigationFiles.map((f) => `  - ${f}`).join("\n") || "  (nessuno trovato)"}`;
}

function buildScreenshotList(inventory: RepoInventory): string {
  if (inventory.screenshotAssets.length > 0) {
    return `### Screenshot ESISTENTI nel repo (percorsi reali — puoi citare SOLO questi)\n${inventory.screenshotAssets
      .map((f) => `- ${f}`)
      .join("\n")}`;
  }
  if (inventory.imageAssets.length > 0) {
    return `### Nessuno screenshot esplicito trovato, ma questi asset immagine esistono nel repo (percorsi reali — puoi citare SOLO questi, specificando che non sono necessariamente screenshot di schermate)\n${inventory.imageAssets
      .slice(0, 30)
      .map((f) => `- ${f}`)
      .join("\n")}`;
  }
  return `### Screenshot/asset immagine\nNessuno screenshot o asset immagine trovato nel repo. Nelle sezioni dove citeresti uno screenshot, scrivi esplicitamente "immagine non trovata nel repository" — NON inventare percorsi.`;
}

function buildKeyFilesSection(files: { path: string; content: string }[]): string {
  if (files.length === 0) return "### File sorgente letti\n(nessun file chiave è stato leggibile in questa run)";
  return `### File sorgente letti per intero (troncati a ${MAX_FILE_CHARS} caratteri ciascuno)\n${files
    .map((f) => `\n#### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n")}`;
}

function buildTextualPrompt(
  inventory: RepoInventory,
  keyFiles: { path: string; content: string }[]
): string {
  return `Sei un tecnico redattore che scrive documentazione per un motore di ricerca semantica interno (Nadir), NON per un lettore umano che sfoglia un manuale illustrato.

${PRIVACY_RULE}

${buildInventorySummary(inventory)}

${buildKeyFilesSection(keyFiles)}

## Istruzioni
Analizza il codice sorgente reale fornito sopra e scrivi un manuale UTENTE di BikerLink in **testo semplice**, in italiano, pensato per essere indicizzato e cercato per significato (Nadir). Regole:
- Niente markup complesso: evita tabelle, niente HTML, al massimo titoli semplici preceduti da "##" e liste puntate con "-".
- Frasi dirette, una idea per frase, terminologia consistente (usa sempre lo stesso nome per la stessa funzionalità).
- Copri le funzionalità reali che riesci a dedurre dai file letti (schermate, navigazione, flussi principali). Se non hai abbastanza materiale per una sezione, ometti la sezione invece di inventare.
- NON descrivere dettagli implementativi (nomi di variabili, hook, componenti React) — descrivi cosa vede e può fare l'UTENTE finale.
- Restituisci SOLO il testo del manuale, senza premesse tipo "Ecco il manuale".`;
}

function buildRichPrompt(
  inventory: RepoInventory,
  keyFiles: { path: string; content: string }[]
): string {
  return `Sei un tecnico redattore che scrive un manuale utente ESTESO e illustrato di BikerLink, con riferimenti a schermate/asset reali del repository.

${PRIVACY_RULE}

${buildInventorySummary(inventory)}

${buildScreenshotList(inventory)}

${buildKeyFilesSection(keyFiles)}

## Istruzioni
Analizza il codice sorgente reale fornito sopra e scrivi un manuale UTENTE **esteso** di BikerLink in **Markdown**, in italiano. Regole:
- Usa titoli (##), sottotitoli (###) e liste puntate liberamente — qui la leggibilità conta più della sinteticità.
- Per ogni sezione rilevante, se esiste uno screenshot/asset pertinente nella lista sopra, citalo con il suo percorso ESATTO (es. "Vedi: assets/screenshots/home.png"). Se non esiste un asset pertinente, scrivi esplicitamente "immagine non trovata nel repository" invece di inventare un percorso.
- Descrizioni più estese e discorsive di ogni funzionalità reale dedotta dai file letti (schermate, navigazione, flussi principali), ma sempre ancorate al codice fornito — non inventare funzionalità non presenti.
- NON descrivere dettagli implementativi interni (nomi di variabili, hook, componenti React) — descrivi cosa vede e può fare l'UTENTE finale.
- Restituisci SOLO il testo del manuale in Markdown, senza premesse tipo "Ecco il manuale".`;
}

// ── Chiamata agenti ───────────────────────────────────────────────────────────

type AgentName = "Horus" | "Quebracho";

async function callAgent(agent: AgentName, prompt: string): Promise<string> {
  const messages: HorusMessage[] = [{ role: "user", content: prompt }];
  const raw =
    agent === "Horus"
      ? await horusChatRaw(messages, { maxTokens: 8192 })
      : await quebrachoChatRaw(messages, { maxTokens: 8192 });
  const content = raw.content?.trim();
  if (!content) throw new Error(`${agent} ha restituito una risposta vuota`);
  return content;
}

interface ManualDraft {
  agent: AgentName;
  format: "testuale" | "ricco";
  content: string;
  flagged: boolean;
  flaggedTerms: string[];
}

function auditManual(agent: AgentName, format: ManualDraft["format"], content: string): ManualDraft {
  const audit = auditContent(content);
  if (audit.flagged) {
    console.warn(
      `[manuals] ⚠ AUDIT: bozza ${agent}/${format} contiene termini vietati (${audit.matches.join(", ")}) — controllare prima di usarla`
    );
  }
  return { agent, format, content, flagged: audit.flagged, flaggedTerms: audit.matches.map(String) };
}

// ── Confronto ─────────────────────────────────────────────────────────────────

function extractHeadings(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => /^#{1,3}\s+/.test(l.trim()))
    .map((l) => l.trim().replace(/^#{1,3}\s+/, ""));
}

function wordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

export function buildComparisonMarkdown(
  date: string,
  drafts: Partial<Record<`${AgentName}-${ManualDraft["format"]}`, ManualDraft>>
): string {
  const lines: string[] = [
    `# Confronto bozze manuali BikerLink — ${date}`,
    "",
    "Generato automaticamente da `manuals:bikerlink` (Task #195). Confronto puramente descrittivo:",
    "nessuna decisione automatica su quale versione sia \"migliore\" — la scelta resta editoriale/umana.",
    "",
  ];

  for (const format of ["testuale", "ricco"] as const) {
    lines.push(`## Formato "${format}"`, "");
    const horus = drafts[`Horus-${format}`];
    const quebracho = drafts[`Quebracho-${format}`];

    if (!horus && !quebracho) {
      lines.push("_Nessuna delle due bozze è stata generata in questa run._", "");
      continue;
    }
    if (!horus || !quebracho) {
      const missing = !horus ? "Horus" : "Quebracho";
      const present = !horus ? quebracho! : horus!;
      lines.push(
        `_${missing} non ha generato una bozza in questa run (agente non configurato o richiesta con --agent). Solo ${present.agent} è disponibile per il confronto._`,
        ""
      );
      continue;
    }

    const horusWords = wordCount(horus.content);
    const quebrachoWords = wordCount(quebracho.content);
    const horusHeadings = extractHeadings(horus.content);
    const quebrachoHeadings = extractHeadings(quebracho.content);
    const onlyHorus = horusHeadings.filter((h) => !quebrachoHeadings.includes(h));
    const onlyQuebracho = quebrachoHeadings.filter((h) => !horusHeadings.includes(h));

    lines.push(
      `- Lunghezza: Horus ${horusWords} parole, Quebracho ${quebrachoWords} parole (differenza ${Math.abs(horusWords - quebrachoWords)} parole).`,
      `- Sezioni individuate: Horus ${horusHeadings.length}, Quebracho ${quebrachoHeadings.length}.`,
      `- Audit contenuti sensibili: Horus ${horus.flagged ? `⚠ FLAGGED (${horus.flaggedTerms.join(", ")})` : "ok"}, Quebracho ${quebracho.flagged ? `⚠ FLAGGED (${quebracho.flaggedTerms.join(", ")})` : "ok"}.`
    );
    if (onlyHorus.length > 0) {
      lines.push(`- Sezioni presenti solo in Horus: ${onlyHorus.join("; ")}`);
    }
    if (onlyQuebracho.length > 0) {
      lines.push(`- Sezioni presenti solo in Quebracho: ${onlyQuebracho.join("; ")}`);
    }
    if (onlyHorus.length === 0 && onlyQuebracho.length === 0) {
      lines.push("- Le sezioni individuate dai due agenti coincidono (per titolo).");
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Output su disco ───────────────────────────────────────────────────────────

const OUTPUT_ROOT = resolve(process.cwd(), "../../docs/manuali-bikerlink-bozze");

function manualHeader(agent: AgentName, format: ManualDraft["format"], date: string): string {
  return `<!--
  BOZZA generata automaticamente — Task #195.
  Agente: ${agent}
  Formato: ${format}
  Data generazione: ${date}
  Fonte: repo Andreamasteri/Bikerlink (sola lettura via GitHub API)
  Questa è una bozza di lavoro, NON l'archivio ufficiale (docs/MANUALI BIKERLINK/)
  né il manuale usato da Nadir (inbox/nadir-manual.md). Nessuna decisione
  automatica è stata presa su quale bozza sia "corretta" — vedi il file di
  confronto nella stessa cartella.
-->

`;
}

function slugFormat(format: ManualDraft["format"]): string {
  return format === "testuale" ? "testuale" : "ricco";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const wantHorus = AGENT_ARG === "horus" || AGENT_ARG === "both";
  const wantQuebracho = AGENT_ARG === "quebracho" || AGENT_ARG === "both";

  if (wantHorus && !isHorusConfigured()) {
    if (AGENT_ARG === "horus") {
      console.error("[manuals] Horus non è configurato (HORUS_OLLAMA_URL mancante) e --agent horus è stato richiesto esplicitamente.");
      process.exit(1);
    }
    console.warn("[manuals] ⚠ Horus non è configurato — salto le sue bozze.");
  }
  if (wantQuebracho && !isQuebrachoConfigured()) {
    if (AGENT_ARG === "quebracho") {
      console.error("[manuals] Quebracho non è configurato (QUEBRACHO_OLLAMA_MODEL mancante) e --agent quebracho è stato richiesto esplicitamente.");
      process.exit(1);
    }
    console.warn("[manuals] ⚠ Quebracho non è configurato — salto le sue bozze.");
  }

  const runHorus = wantHorus && isHorusConfigured();
  const runQuebracho = wantQuebracho && isQuebrachoConfigured();

  if (!runHorus && !runQuebracho) {
    console.error("[manuals] Nessun agente disponibile per questa run — nulla da generare.");
    process.exit(1);
  }

  const token = resolveGithubToken();
  if (!token) {
    console.warn("[manuals] ⚠ Nessun token GitHub configurato (GITHUB_TOKEN_BIKERLINK/GITHUB_TOKEN_BIKERBLOG) — proseguo senza autenticazione (rate limit più basso, repo deve essere pubblico o accessibile).");
  }

  console.log(`[manuals] Leggo repo ${BIKERLINK_REPO} (sola lettura)...`);
  const branch = await fetchDefaultBranch(token);
  const tree = await fetchRepoTree(branch, token);
  const inventory = buildRepoInventory(tree);
  console.log(
    `[manuals] Inventario: ${inventory.totalFiles} file, ${inventory.screenFiles.length} schermate rilevate, ${inventory.imageAssets.length} asset immagine (${inventory.screenshotAssets.length} screenshot).`
  );

  const keyPaths = selectKeyFiles(inventory);
  console.log(`[manuals] Scarico ${keyPaths.length} file chiave per il contesto...`);
  const keyFiles = await fetchKeyFileContents(keyPaths, token);
  console.log(`[manuals] File chiave letti con successo: ${keyFiles.length}/${keyPaths.length}`);

  const textualPrompt = buildTextualPrompt(inventory, keyFiles);
  const richPrompt = buildRichPrompt(inventory, keyFiles);

  const drafts: Partial<Record<`${AgentName}-${ManualDraft["format"]}`, ManualDraft>> = {};

  for (const [agent, enabled] of [
    ["Horus", runHorus],
    ["Quebracho", runQuebracho],
  ] as const) {
    if (!enabled) continue;
    for (const [format, prompt] of [
      ["testuale", textualPrompt],
      ["ricco", richPrompt],
    ] as const) {
      console.log(`[manuals] ▶ ${agent} — manuale ${format}...`);
      try {
        const content = await callAgent(agent, prompt);
        const draft = auditManual(agent, format, content);
        drafts[`${agent}-${format}`] = draft;
        console.log(`[manuals] ✓ ${agent} — manuale ${format} generato (${wordCount(content)} parole)`);
      } catch (err) {
        console.error(`[manuals] ✗ ${agent} — manuale ${format} fallito: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const comparison = buildComparisonMarkdown(date, drafts);

  if (DRY_RUN) {
    console.log("\n[manuals] DRY RUN — nessuna scrittura su disco. Anteprime:\n");
    for (const [key, draft] of Object.entries(drafts)) {
      console.log(`\n--- ${key} (${wordCount(draft.content)} parole) ---\n${draft.content.slice(0, 400)}...\n`);
    }
    console.log(`\n--- confronto-manuali-${date}.md ---\n${comparison}`);
    return;
  }

  const outDir = resolve(OUTPUT_ROOT, date);
  mkdirSync(outDir, { recursive: true });

  for (const [key, draft] of Object.entries(drafts)) {
    const [agent, format] = key.split("-") as [AgentName, ManualDraft["format"]];
    const filename = `manuale-${slugFormat(format)}-${agent.toLowerCase()}.md`;
    const filePath = resolve(outDir, filename);
    writeFileSync(filePath, manualHeader(agent, format, date) + draft.content, "utf-8");
    console.log(`[manuals] 💾 ${filePath}`);
  }

  const comparisonPath = resolve(outDir, `confronto-manuali-${date}.md`);
  writeFileSync(comparisonPath, comparison, "utf-8");
  console.log(`[manuals] 💾 ${comparisonPath}`);

  console.log(`\n[manuals] ✅ done — bozze salvate in ${outDir}`);
}

// Esegui solo quando il file è lanciato direttamente (CLI), non quando le
// funzioni pure sopra vengono importate dal test di regressione.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  await main();
}
