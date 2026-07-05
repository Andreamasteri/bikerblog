import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRepoInventory,
  selectKeyFiles,
  buildComparisonMarkdown,
  type GithubTreeEntry,
} from "./generate-bikerlink-manuals.js";

function tree(entries: [string, "blob" | "tree", number?][]): GithubTreeEntry[] {
  return entries.map(([path, type, size]) => ({ path, type, sha: `sha-${path}`, size }));
}

test("buildRepoInventory: identifica schermate, navigazione e screenshot da un albero misto", () => {
  const t = tree([
    ["src", "tree"],
    ["src/screens", "tree"],
    ["src/screens/HomeScreen.tsx", "blob", 100],
    ["src/screens/ProfilePage.tsx", "blob", 120],
    ["src/navigation", "tree"],
    ["src/navigation/AppNavigator.tsx", "blob", 90],
    ["src/App.tsx", "blob", 50],
    ["assets", "tree"],
    ["assets/screenshots", "tree"],
    ["assets/screenshots/home.png", "blob", 2000],
    ["assets/logo.svg", "blob", 300],
    ["README.md", "blob", 500],
    ["package.json", "blob", 400],
  ]);

  const inv = buildRepoInventory(t);

  assert.equal(inv.totalFiles, 8);
  assert.equal(inv.totalDirs, 5);
  assert.deepEqual(inv.topLevelDirs, ["assets", "src"]);
  assert.ok(inv.screenFiles.includes("src/screens/HomeScreen.tsx"));
  assert.ok(inv.screenFiles.includes("src/screens/ProfilePage.tsx"));
  assert.ok(inv.navigationFiles.includes("src/navigation/AppNavigator.tsx"));
  assert.ok(inv.navigationFiles.includes("src/App.tsx"));
  assert.ok(inv.imageAssets.includes("assets/logo.svg"));
  assert.deepEqual(inv.screenshotAssets, ["assets/screenshots/home.png"]);
});

test("buildRepoInventory: nessuno screenshot/asset → liste vuote, nessun crash", () => {
  const t = tree([
    ["index.ts", "blob", 10],
    ["src", "tree"],
    ["src/main.ts", "blob", 20],
  ]);
  const inv = buildRepoInventory(t);
  assert.equal(inv.imageAssets.length, 0);
  assert.equal(inv.screenshotAssets.length, 0);
  assert.equal(inv.screenFiles.length, 0);
});

test("selectKeyFiles: include sempre README/package.json e limita schermate/navigazione", () => {
  const manyScreens: [string, "blob"][] = Array.from({ length: 20 }, (_, i) => [
    `src/screens/S${i}Screen.tsx`,
    "blob",
  ]);
  const t = tree([
    ...manyScreens,
    ["src/navigation/A.tsx", "blob"],
    ["README.md", "blob"],
    ["package.json", "blob"],
  ]);
  const inv = buildRepoInventory(t);
  const keys = selectKeyFiles(inv);

  assert.ok(keys.includes("README.md"));
  assert.ok(keys.includes("package.json"));
  assert.ok(keys.length <= 20);
  const screenCount = keys.filter((k) => k.includes("Screen.tsx")).length;
  assert.ok(screenCount <= 12, `expected at most 12 screen files, got ${screenCount}`);
});

test("selectKeyFiles: deterministico a parità di inventario", () => {
  const t = tree([
    ["src/screens/HomeScreen.tsx", "blob"],
    ["src/screens/ProfileScreen.tsx", "blob"],
    ["README.md", "blob"],
  ]);
  const inv = buildRepoInventory(t);
  assert.deepEqual(selectKeyFiles(inv), selectKeyFiles(inv));
});

test("buildComparisonMarkdown: entrambi gli agenti presenti — segnala differenze di sezioni e lunghezza", () => {
  const md = buildComparisonMarkdown("2026-07-05", {
    "Horus-testuale": {
      agent: "Horus",
      format: "testuale",
      content: "## Accesso\nTesto uno due tre.\n## Profilo\nAltro testo.",
      flagged: false,
      flaggedTerms: [],
    },
    "Quebracho-testuale": {
      agent: "Quebracho",
      format: "testuale",
      content: "## Accesso\nTesto diverso.\n## Notifiche\nTesto notifiche qui.",
      flagged: false,
      flaggedTerms: [],
    },
  });

  assert.match(md, /Confronto bozze manuali BikerLink — 2026-07-05/);
  assert.match(md, /Formato "testuale"/);
  assert.match(md, /Sezioni presenti solo in Horus: Profilo/);
  assert.match(md, /Sezioni presenti solo in Quebracho: Notifiche/);
  assert.match(md, /Formato "ricco"/);
  assert.match(md, /Nessuna delle due bozze è stata generata/);
});

test("buildComparisonMarkdown: un solo agente disponibile — nota l'assenza dell'altro invece di fallire", () => {
  const md = buildComparisonMarkdown("2026-07-05", {
    "Horus-ricco": {
      agent: "Horus",
      format: "ricco",
      content: "## Sezione unica\nTesto.",
      flagged: false,
      flaggedTerms: [],
    },
  });

  assert.match(md, /Quebracho non ha generato una bozza/);
});

test("buildComparisonMarkdown: bozza flaggata dall'audit viene riportata nel confronto", () => {
  const md = buildComparisonMarkdown("2026-07-05", {
    "Horus-testuale": {
      agent: "Horus",
      format: "testuale",
      content: "## Sezione\nSELECT * FROM matches WHERE id = 1",
      flagged: true,
      flaggedTerms: ["SELECT * FROM matches"],
    },
    "Quebracho-testuale": {
      agent: "Quebracho",
      format: "testuale",
      content: "## Sezione\nTesto pulito.",
      flagged: false,
      flaggedTerms: [],
    },
  });

  assert.match(md, /Horus ⚠ FLAGGED/);
  assert.match(md, /Quebracho ok/);
});
