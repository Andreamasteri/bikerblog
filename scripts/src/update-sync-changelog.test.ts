import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  buildAutoSection,
  buildEntries,
  extractTaskNumber,
  humanize,
  isNoise,
  keyForTask,
  keyForOther,
  loadExternalCompletedTasks,
  loadItalianCache,
  saveItalianCache,
  ensureItalianForEntries,
  prettyDay,
  parseGitLog,
  replaceAutoSection,
  START_MARKER,
  END_MARKER,
  EMPTY_AUTO_SECTION,
  type Commit,
  type CompletedTask,
} from "./update-sync-changelog.js";

const US = "\x1f";
function logLine(hash: string, iso: string, subject: string): string {
  return [hash, hash.slice(0, 7), iso, subject].join(US);
}

test("isNoise filters platform noise commits", () => {
  assert.equal(isNoise("Published your App"), true);
  assert.equal(isNoise("Transitioned from Plan to Build mode"), true);
  assert.equal(isNoise("Merge branch 'main'"), true);
  assert.equal(isNoise("Task #42: real work"), false);
});

test("extractTaskNumber finds leading and trailing task refs", () => {
  assert.equal(extractTaskNumber("Task #130: Regression coverage"), 130);
  assert.equal(extractTaskNumber("Harden like rate limiting (Task #113)"), 113);
  assert.equal(extractTaskNumber("Add opt-in smoke check (task-104)"), 104);
  assert.equal(extractTaskNumber("Update default image for blog posts"), null);
});

test("humanize strips task tags and capitalizes", () => {
  assert.equal(humanize("Task #130: regression coverage"), "Regression coverage");
  assert.equal(humanize("harden like rate limiting (Task #113)"), "Harden like rate limiting");
  assert.equal(humanize("add read_blog tool"), "Add read_blog tool");
});

test("prettyDay renders Italian dates", () => {
  assert.equal(prettyDay("2026-07-03"), "3 luglio 2026");
  assert.equal(prettyDay("2026-01-09"), "9 gennaio 2026");
});

test("parseGitLog drops noise and parses records", () => {
  const out = [
    logLine("aaaaaaa1111", "2026-07-04T10:00:00Z", "Task #200: do a thing"),
    logLine("bbbbbbb2222", "2026-07-04T09:00:00Z", "Published your App"),
    logLine("ccccccc3333", "2026-07-03T20:00:00Z", "Plain change"),
  ].join("\n");
  const commits = parseGitLog(out);
  assert.equal(commits.length, 2);
  assert.equal(commits[0]!.subject, "Task #200: do a thing");
  assert.equal(commits[1]!.subject, "Plain change");
});

test("buildEntries dedupes a task across multiple commits (newest wins)", () => {
  const commits: Commit[] = [
    {
      hash: "new",
      shortHash: "new1234",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #50: final follow-up",
    },
    {
      hash: "old",
      shortHash: "old1234",
      isoDate: "2026-07-04T08:00:00Z",
      day: "2026-07-04",
      subject: "Task #50: first attempt",
    },
    {
      hash: "plain",
      shortHash: "pln1234",
      isoDate: "2026-07-04T07:00:00Z",
      day: "2026-07-04",
      subject: "A non-task change",
    },
  ];
  const { tasks, others } = buildEntries(commits, []);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.taskNumber, 50);
  assert.equal(tasks[0]!.title, "Final follow-up"); // newest commit wins
  assert.equal(others.length, 1);
  assert.equal(others[0]!.shortHash, "pln1234");
});

test("buildEntries folds in external tasks not covered by a commit", () => {
  const commits: Commit[] = [
    {
      hash: "c1",
      shortHash: "c1aaaaa",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #60: commit-backed task",
    },
  ];
  const external: CompletedTask[] = [
    { taskNumber: 60, title: "should be ignored (dup)", day: "2026-07-01" },
    { taskNumber: 99, title: "external only task", day: "2026-07-02" },
  ];
  const { tasks } = buildEntries(commits, external);
  assert.equal(tasks.length, 2);
  const t99 = tasks.find((t) => t.taskNumber === 99)!;
  assert.equal(t99.title, "external only task");
  const t60 = tasks.find((t) => t.taskNumber === 60)!;
  assert.equal(t60.title, "Commit-backed task"); // commit wins over external dup
});

test("buildAutoSection groups by day with task and other sub-lists", () => {
  const commits: Commit[] = [
    {
      hash: "a",
      shortHash: "aaaaaaa",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #70: shiny feature",
    },
    {
      hash: "b",
      shortHash: "bbbbbbb",
      isoDate: "2026-07-03T09:30:00Z",
      day: "2026-07-03",
      subject: "Tweak the footer",
    },
  ];
  const section = buildAutoSection(commits, []);
  assert.match(section, /### 4 luglio 2026/);
  assert.match(section, /\*\*Task completati:\*\*/);
  assert.match(section, /- \*\*Task #70\*\* — Shiny feature <!-- aaaaaaa -->/);
  assert.match(section, /### 3 luglio 2026/);
  assert.match(section, /\*\*Altre modifiche:\*\*/);
  assert.match(section, /- \*\*09:30\*\* · Tweak the footer <!-- bbbbbbb -->/);
  // Newest day appears first.
  assert.ok(section.indexOf("4 luglio") < section.indexOf("3 luglio"));
});

test("buildAutoSection returns the empty placeholder when nothing to show", () => {
  assert.equal(buildAutoSection([], []), EMPTY_AUTO_SECTION);
});

test("loadExternalCompletedTasks returns [] for a missing file", () => {
  assert.deepEqual(loadExternalCompletedTasks("/no/such/file.json"), []);
});

test("replaceAutoSection is idempotent for the same input", () => {
  const doc = [
    "# Title",
    "intro",
    START_MARKER,
    EMPTY_AUTO_SECTION,
    END_MARKER,
    "footer",
  ].join("\n");
  const commits: Commit[] = [
    {
      hash: "a",
      shortHash: "aaaaaaa",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #70: shiny feature",
    },
  ];
  const section = buildAutoSection(commits, []);
  const once = replaceAutoSection(doc, section);
  const twice = replaceAutoSection(once, section);
  assert.equal(once, twice); // running again with same data changes nothing
  assert.match(once, /Task #70/);
});

test("replaceAutoSection throws when markers are missing", () => {
  assert.throws(() => replaceAutoSection("no markers here", "x"));
});

test("keyForTask/keyForOther produce stable keys", () => {
  const commit: Commit = {
    hash: "h",
    shortHash: "abc1234",
    isoDate: "2026-07-04T12:00:00Z",
    day: "2026-07-04",
    subject: "Task #70: shiny feature",
  };
  assert.equal(keyForOther(commit), "c:abc1234");
  assert.equal(keyForTask({ taskNumber: 70, title: "x", day: "2026-07-04", shortHash: "abc1234" }), "c:abc1234");
  assert.equal(keyForTask({ taskNumber: 99, title: "x", day: "2026-07-02" }), "external-#99");
});

test("buildAutoSection keeps the technical text and appends the simple-Italian line", () => {
  const commits: Commit[] = [
    {
      hash: "a",
      shortHash: "aaaaaaa",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #70: shiny feature",
    },
    {
      hash: "b",
      shortHash: "bbbbbbb",
      isoDate: "2026-07-03T09:30:00Z",
      day: "2026-07-03",
      subject: "Tweak the footer",
    },
  ];
  const italian = new Map<string, string>([
    ["c:aaaaaaa", "Aggiunta una nuova funzione appariscente."],
    ["c:bbbbbbb", "Piccola modifica al piè di pagina."],
  ]);
  const section = buildAutoSection(commits, [], italian);
  // Technical text is preserved verbatim...
  assert.match(section, /- \*\*Task #70\*\* — Shiny feature <!-- aaaaaaa -->/);
  assert.match(section, /- \*\*09:30\*\* · Tweak the footer <!-- bbbbbbb -->/);
  // ...and the simple-Italian line is added underneath, not replacing it.
  assert.match(section, /_In parole semplici:_ Aggiunta una nuova funzione appariscente\./);
  assert.match(section, /_In parole semplici:_ Piccola modifica al piè di pagina\./);
});

test("buildAutoSection with no Italian map behaves exactly as before (technical only)", () => {
  const commits: Commit[] = [
    {
      hash: "a",
      shortHash: "aaaaaaa",
      isoDate: "2026-07-04T12:00:00Z",
      day: "2026-07-04",
      subject: "Task #70: shiny feature",
    },
  ];
  const section = buildAutoSection(commits, []);
  assert.match(section, /- \*\*Task #70\*\* — Shiny feature <!-- aaaaaaa -->/);
  assert.doesNotMatch(section, /In parole semplici/);
});

test("Italian cache round-trips and skips already-cached entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "changelog-it-"));
  const path = join(dir, "cache.json");
  try {
    assert.deepEqual([...loadItalianCache(path)], []); // missing file → empty

    const cache = new Map<string, string>([["c:aaaaaaa", "Frase in italiano."]]);
    saveItalianCache(path, cache);
    const reloaded = loadItalianCache(path);
    assert.equal(reloaded.get("c:aaaaaaa"), "Frase in italiano.");

    // ensureItalianForEntries must not touch entries that are already cached,
    // so it never calls Horus for them and reports no change.
    const tasks: CompletedTask[] = [
      { taskNumber: 70, title: "Shiny feature", day: "2026-07-04", shortHash: "aaaaaaa" },
    ];
    const changed = await ensureItalianForEntries(tasks, [], reloaded);
    assert.equal(changed, false);
    assert.equal(reloaded.get("c:aaaaaaa"), "Frase in italiano.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
