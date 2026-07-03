#!/usr/bin/env tsx
/**
 * update-sync-changelog — aggiorna automaticamente docs/bikerlink-sync-changelog.md.
 *
 * Il file ha una parte scritta a mano (intro + "Backfill iniziale") e una parte
 * gestita da questo script, delimitata da due marcatori:
 *
 *   <!-- AUTO-CHANGELOG:START -->
 *   ...contenuto rigenerato ogni volta...
 *   <!-- AUTO-CHANGELOG:END -->
 *
 * Ogni esecuzione RIGENERA da zero la sezione tra i marcatori a partire da:
 *   1. i COMMIT git successivi a un commit "baseline" (l'ultimo incluso nel
 *      backfill scritto a mano), e
 *   2. i TASK COMPLETATI, rilevati sia dai commit (ogni merge di un task lascia
 *      un commit con "Task #NNN" nel messaggio) sia — se presente — da una
 *      sorgente task esterna opzionale con lo stesso schema usato dagli altri
 *      script (inbox/completed-tasks.json, forma ArchivedTask[]).
 *
 * Per ogni giorno la sezione mostra due sotto-elenchi:
 *   - "Task completati": una riga per task (deduplicata per numero di task),
 *     così un task che passa a completato compare esplicitamente anche se ha
 *     avuto più commit o un messaggio non standard;
 *   - "Altre modifiche": i commit rilevanti che non sono associati a un task.
 *
 * L'approccio è deterministico e idempotente: eseguirlo più volte senza nuovi
 * commit/task non cambia nulla.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run changelog:sync
 *   pnpm --filter @workspace/scripts run changelog:sync -- --dry-run
 *
 * Non richiede env. Se git non è disponibile o non ci sono novità, esce senza
 * errori (0) lasciando il file invariato.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const changelogPath = resolve(projectRoot, "docs", "bikerlink-sync-changelog.md");
/** Optional task source (same ArchivedTask[] shape used by cluster-tasks). */
const externalTasksPath = resolve(projectRoot, "inbox", "completed-tasks.json");

export const START_MARKER = "<!-- AUTO-CHANGELOG:START -->";
export const END_MARKER = "<!-- AUTO-CHANGELOG:END -->";

/**
 * Ultimo commit incluso nel backfill scritto a mano. La sezione automatica
 * copre solo i commit SUCCESSIVI a questo. Se il commit non esiste più (es.
 * history riscritta), si usa il fallback per data qui sotto.
 */
export const BASELINE_COMMIT = "e8c92e605d4a8852d5af25aa09613613194353fb";
/** Fallback: se il baseline non è raggiungibile, si prendono i commit da questa data. */
export const BASELINE_SINCE = "2026-07-03T13:00:00Z";
/** States considered "completed" when reading the optional external task source. */
const COMPLETED_STATES = new Set(["MERGED", "COMPLETE", "COMPLETED", "DONE"]);

export const EMPTY_AUTO_SECTION =
  "_Nessun aggiornamento automatico ancora registrato. La prima esecuzione notturna\ndella pipeline popolerà questa sezione._";

export interface Commit {
  hash: string;
  shortHash: string;
  isoDate: string; // full ISO commit date
  day: string; // YYYY-MM-DD (committer date, UTC)
  subject: string;
}

/** A completed-task event, from a commit or from the external task source. */
export interface CompletedTask {
  taskNumber: number;
  title: string;
  day: string; // YYYY-MM-DD
  time?: string; // HH:MM (only when derived from a commit)
  shortHash?: string;
}

/** Shape of the optional external task source (same as cluster-tasks ArchivedTask). */
interface ArchivedTask {
  taskRef?: string;
  title?: string;
  state?: string;
  updatedAt?: string;
  createdAt?: string;
}

/** Runs git and returns stdout, or null if git failed. */
function git(args: string[]): string | null {
  const res = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  if (res.status !== 0 || res.error) return null;
  return res.stdout;
}

/** Returns true if the baseline commit is reachable in the current history. */
function baselineReachable(): boolean {
  const res = spawnSync("git", ["cat-file", "-e", `${BASELINE_COMMIT}^{commit}`], {
    cwd: projectRoot,
  });
  return res.status === 0;
}

/**
 * Commit messages that are pure platform noise and should never appear in a
 * human-readable changelog.
 */
const NOISE_SUBJECT_PATTERNS: RegExp[] = [
  /^Published your App$/i,
  /^Transitioned from Plan to Build mode$/i,
  /^Checkpoint\b/i,
  /^Merge branch\b/i,
  /^Merge pull request\b/i,
  /^Merge remote-tracking\b/i,
];

export function isNoise(subject: string): boolean {
  return NOISE_SUBJECT_PATTERNS.some((re) => re.test(subject.trim()));
}

/**
 * Extracts a task number from a commit subject, whether it appears as a leading
 * "Task #NNN:" prefix or a trailing "(Task #NNN)"/"(task-NNN)" marker.
 * Returns null when the subject isn't associated with a task.
 */
export function extractTaskNumber(subject: string): number | null {
  const leading = subject.match(/^Task\s*#(\d+)\b/i);
  if (leading) return parseInt(leading[1]!, 10);
  const trailing = subject.match(/\(task[\s\-#]*(\d+)\)\s*$/i);
  if (trailing) return parseInt(trailing[1]!, 10);
  return null;
}

/**
 * Turns a raw commit subject into a plain-language line, stripping any leading
 * "Task #NNN:" prefix and trailing "(Task #NNN)" marker (the task tag is
 * surfaced separately). Returns just the descriptive part, capitalized.
 */
export function humanize(subject: string): string {
  let s = subject.trim();
  const leading = s.match(/^Task\s*#(\d+)\s*[:\-–]?\s*/i);
  if (leading) s = s.slice(leading[0].length);
  const trailing = s.match(/\s*\(task[\s\-#]*(\d+)\)\s*$/i);
  if (trailing) s = s.slice(0, trailing.index).trim();
  if (s.length > 0) s = s[0]!.toUpperCase() + s.slice(1);
  return s;
}

const ITALIAN_MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** "2026-07-03" -> "3 luglio 2026" */
export function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return day;
  return `${d} ${ITALIAN_MONTHS[m - 1]} ${y}`;
}

/** Parses `git log` output (records separated by \x1f) into Commit[], dropping noise. */
export function parseGitLog(out: string): Commit[] {
  const commits: Commit[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [hash, shortHash, isoDate, subject] = line.split("\x1f");
    if (!hash || !isoDate || subject === undefined) continue;
    if (isNoise(subject)) continue;
    commits.push({
      hash,
      shortHash: shortHash ?? hash.slice(0, 7),
      isoDate,
      day: isoDate.slice(0, 10),
      subject,
    });
  }
  return commits;
}

function collectCommits(): Commit[] {
  const range = baselineReachable() ? [`${BASELINE_COMMIT}..HEAD`] : [`--since=${BASELINE_SINCE}`];
  const FMT = "%H\x1f%h\x1f%cI\x1f%s";
  const out = git(["log", ...range, `--pretty=format:${FMT}`]);
  if (out === null) return [];
  return parseGitLog(out);
}

/**
 * Reads the optional external task source and returns completed tasks not tied
 * to a specific commit. Missing/invalid file → empty list (never throws).
 */
export function loadExternalCompletedTasks(path: string): CompletedTask[] {
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  const arr: ArchivedTask[] = Array.isArray(parsed)
    ? (parsed as ArchivedTask[])
    : Array.isArray((parsed as { tasks?: ArchivedTask[] }).tasks)
      ? (parsed as { tasks: ArchivedTask[] }).tasks
      : [];

  const out: CompletedTask[] = [];
  for (const t of arr) {
    if (!t.state || !COMPLETED_STATES.has(t.state.toUpperCase())) continue;
    const num = t.taskRef ? parseInt(t.taskRef.replace(/[^\d]/g, ""), 10) : NaN;
    if (!Number.isFinite(num)) continue;
    const when = t.updatedAt ?? t.createdAt;
    if (!when) continue;
    out.push({
      taskNumber: num,
      title: (t.title ?? "").trim() || `Task #${num}`,
      day: when.slice(0, 10),
    });
  }
  return out;
}

/**
 * Splits commits into completed-task events (deduped by task number, newest
 * commit wins) and non-task "other" commits, then folds in external completed
 * tasks that aren't already covered by a commit. Deterministic ordering.
 */
export function buildEntries(
  commits: Commit[],
  externalTasks: CompletedTask[]
): { tasks: CompletedTask[]; others: Commit[] } {
  const taskByNumber = new Map<number, CompletedTask>();
  const others: Commit[] = [];

  // Commits are newest-first; the first commit seen for a task number is the
  // most recent (the merge), so we keep that one.
  for (const c of commits) {
    const num = extractTaskNumber(c.subject);
    if (num === null) {
      others.push(c);
      continue;
    }
    if (!taskByNumber.has(num)) {
      taskByNumber.set(num, {
        taskNumber: num,
        title: humanize(c.subject),
        day: c.day,
        time: c.isoDate.slice(11, 16),
        shortHash: c.shortHash,
      });
    }
  }

  // External tasks: add only those not already captured from a commit.
  for (const t of externalTasks) {
    if (!taskByNumber.has(t.taskNumber)) taskByNumber.set(t.taskNumber, t);
  }

  const tasks = Array.from(taskByNumber.values()).sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1; // newest day first
    return b.taskNumber - a.taskNumber; // higher task number first
  });

  return { tasks, others };
}

export function buildAutoSection(commits: Commit[], externalTasks: CompletedTask[]): string {
  const { tasks, others } = buildEntries(commits, externalTasks);
  if (tasks.length === 0 && others.length === 0) return EMPTY_AUTO_SECTION;

  // Collect every day that has content, newest first.
  const days = new Set<string>();
  for (const t of tasks) days.add(t.day);
  for (const o of others) days.add(o.day);
  const sortedDays = Array.from(days).sort().reverse();

  const blocks: string[] = [];
  for (const day of sortedDays) {
    const dayTasks = tasks.filter((t) => t.day === day);
    const dayOthers = others.filter((o) => o.day === day);
    const parts: string[] = [`### ${prettyDay(day)}`];

    if (dayTasks.length > 0) {
      const lines = dayTasks.map((t) => {
        const marker = t.shortHash ? ` <!-- ${t.shortHash} -->` : " <!-- external -->";
        return `- **Task #${t.taskNumber}** — ${t.title}${marker}`;
      });
      parts.push(`**Task completati:**\n\n${lines.join("\n")}`);
    }

    if (dayOthers.length > 0) {
      const lines = dayOthers.map((c) => {
        const time = c.isoDate.slice(11, 16);
        return `- **${time}** · ${humanize(c.subject)} <!-- ${c.shortHash} -->`;
      });
      parts.push(`**Altre modifiche:**\n\n${lines.join("\n")}`);
    }

    blocks.push(parts.join("\n\n"));
  }
  return blocks.join("\n\n");
}

/** Replaces the content between the two markers. Throws on missing markers. */
export function replaceAutoSection(original: string, autoSection: string): string {
  const startIdx = original.indexOf(START_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error("marcatori AUTO-CHANGELOG:START/END mancanti o invertiti");
  }
  const before = original.slice(0, startIdx + START_MARKER.length);
  const after = original.slice(endIdx);
  return `${before}\n${autoSection}\n${after}`;
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(changelogPath)) {
    console.error(
      `[changelog:sync] file non trovato: ${changelogPath} — crealo prima di eseguire lo script`
    );
    process.exit(1);
  }

  const original = readFileSync(changelogPath, "utf8");
  const commits = collectCommits();
  const externalTasks = loadExternalCompletedTasks(externalTasksPath);
  const autoSection = buildAutoSection(commits, externalTasks);

  let updated: string;
  try {
    updated = replaceAutoSection(original, autoSection);
  } catch (err) {
    console.error(
      `[changelog:sync] ${err instanceof Error ? err.message : String(err)} — nessuna modifica`
    );
    process.exit(1);
  }

  const { tasks } = buildEntries(commits, externalTasks);

  if (updated === original) {
    console.log(
      `[changelog:sync] nessuna modifica — ${commits.length} commit, ${tasks.length} task già registrati`
    );
    return;
  }

  if (dryRun) {
    console.log("[changelog:sync] --dry-run — anteprima sezione automatica:\n");
    console.log(autoSection);
    console.log(
      `\n[changelog:sync] (${commits.length} commit, ${tasks.length} task) — nessun file scritto`
    );
    return;
  }

  writeFileSync(changelogPath, updated, "utf8");
  console.log(
    `[changelog:sync] aggiornato docs/bikerlink-sync-changelog.md — ${commits.length} commit, ${tasks.length} task completati`
  );
}

// Esegui main() solo quando il file è lanciato direttamente (non quando è
// importato da un test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
