import assert from "node:assert/strict";
import { test } from "node:test";
import type { HorusToolSpec } from "./client.js";
import { getHorusTools, selectRelevantTools } from "./tools.js";

/**
 * Copertura per la selezione contestuale dei tool (Task #178): un messaggio
 * conversazionale non deve allegare alcun tool (prefill minimo → nessun 524 su
 * CPU), mentre un messaggio che richiede una capacità deve allegare solo il
 * sottoinsieme MINIMO pertinente. Il gating per capacità (tool non disponibili
 * perché il servizio non è configurato) resta valido SOPRA quello contestuale.
 */

const ALL_TOOL_NAMES = [
  "web_search",
  "github_read",
  "remember_note",
  "read_blog",
  "typecheck_repo",
  "lint_repo",
  "search_code",
  "git_log",
  "architect",
  "sonar_scan",
  "search_manual",
] as const;

// Tool set disponibile per Bowie (agente secondario): include i tool di delega
// inter-agente ma NON call_ares (admin-only).
const BOWIE_TOOL_NAMES = [
  ...ALL_TOOL_NAMES,
  "call_horus",
  "call_quebracho",
] as const;

function makeTools(names: readonly string[]): HorusToolSpec[] {
  return names.map((name) => ({
    type: "function",
    function: {
      name,
      description: `test tool ${name}`,
      parameters: { type: "object", properties: {} },
    },
  }));
}

function selectedNames(message: string, available = makeTools(ALL_TOOL_NAMES)): string[] {
  return selectRelevantTools(message, available)
    .map((tool) => tool.function.name)
    .sort();
}

test("a plain conversational message attaches no tools at all", () => {
  for (const msg of ["Ciao", "Come stai?", "Grazie mille!", "Raccontami una barzelletta"]) {
    assert.deepEqual(selectedNames(msg), [], `"${msg}" non deve allegare alcun tool`);
  }
});

test("a fresh-info / web request attaches only web_search", () => {
  assert.deepEqual(selectedNames("cerca online le ultime notizie sulla MotoGP"), ["web_search"]);
  assert.deepEqual(selectedNames("cosa dicono le previsioni meteo per domani?"), ["web_search"]);
  assert.deepEqual(selectedNames("quanto costa una Ducati Panigale?"), ["web_search"]);
});

test("a code-reading request attaches only github_read", () => {
  assert.deepEqual(selectedNames("leggi il codice di bikerlink e spiegami come funziona"), ["github_read"]);
});

test("a source-search request attaches github_read + search_code", () => {
  assert.deepEqual(selectedNames("cerca nel codice dove viene usata la funzione embed"), [
    "github_read",
    "search_code",
  ]);
});

test("a blog request attaches only read_blog", () => {
  assert.deepEqual(selectedNames("cosa ho scritto sul blog a proposito di enduro?"), ["read_blog"]);
  assert.deepEqual(selectedNames("leggi i commenti dei lettori sull'ultimo post"), ["read_blog"]);
});

test("a remember request attaches only remember_note", () => {
  assert.deepEqual(selectedNames("ricorda che preferisco le risposte brevi"), ["remember_note"]);
});

test("a semantic-search request attaches only search_manual", () => {
  assert.deepEqual(selectedNames("cerca per significato nella base di conoscenza cosa avevamo detto"), [
    "search_manual",
  ]);
});

test("typecheck / lint / commit / sonar / architect map to their own analysis tool", () => {
  assert.deepEqual(selectedNames("fai il typecheck del repo bikerblog"), ["typecheck_repo"]);
  assert.deepEqual(selectedNames("fai il lint del repo"), ["lint_repo"]);
  assert.deepEqual(selectedNames("mostrami gli ultimi commit del repo"), ["git_log"]);
  assert.deepEqual(selectedNames("lancia una scansione sonar per trovare code smell"), ["sonar_scan"]);
  assert.deepEqual(selectedNames("come implementeresti questa feature nel repo?"), ["architect"]);
});

test("capability gating stays ABOVE contextual selection: an unavailable tool is never attached", () => {
  // search_manual (Nadir) non disponibile: anche una chiara richiesta semantica
  // non deve inventarlo.
  const withoutNadir = makeTools(ALL_TOOL_NAMES.filter((n) => n !== "search_manual"));
  assert.deepEqual(
    selectedNames("cerca per significato nella knowledge base", withoutNadir),
    [],
    "un tool non disponibile per servizio non configurato non deve mai essere allegato"
  );

  // Analisi non disponibile: "fai il typecheck" ha intento di analisi, non di
  // lettura, quindi non ripiega su github_read — non allega nulla e lascia che
  // il modello dichiari di non poterlo fare.
  const baseOnly = makeTools(["web_search", "github_read", "remember_note", "read_blog"]);
  assert.deepEqual(selectedNames("fai il typecheck del repo bikerblog", baseOnly), []);
});

// ─── Bowie agent-name detection (name-based fallback, Task #233) ──────────────
// Bowie è un modello piccolo (qwen3:1.7b) che può ignorare i tool allegati se
// non fortemente primed.  selectRelevantTools deve comunque allegare call_horus
// / call_quebracho quando il messaggio menziona il nome dell'agente, anche se
// la formulazione non corrisponde a nessuna delle frasi esplicite.

test("Bowie: menzione di 'Horus' nel messaggio seleziona call_horus", () => {
  const bowieTools = makeTools(BOWIE_TOOL_NAMES);
  // Formulazione interrogativa — "puoi parlare con Horus?"
  assert.deepEqual(
    selectedNames("puoi parlare con Horus?", bowieTools),
    ["call_horus"],
    '"puoi parlare con Horus?" deve allegare call_horus'
  );
  // Formulazione indiretta — "Horus lo sa?"
  assert.deepEqual(
    selectedNames("Horus lo sa?", bowieTools),
    ["call_horus"],
    '"Horus lo sa?" deve allegare call_horus'
  );
});

test("Bowie: 'coinvolgi Quebracho' seleziona call_quebracho", () => {
  const bowieTools = makeTools(BOWIE_TOOL_NAMES);
  assert.deepEqual(
    selectedNames("coinvolgi Quebracho in questa conversazione", bowieTools),
    ["call_quebracho"],
    '"coinvolgi Quebracho" deve allegare call_quebracho'
  );
});

test("Bowie: 'qq ne sa qualcosa?' seleziona call_quebracho via alias", () => {
  const bowieTools = makeTools(BOWIE_TOOL_NAMES);
  assert.deepEqual(
    selectedNames("qq ne sa qualcosa?", bowieTools),
    ["call_quebracho"],
    '"qq ne sa qualcosa?" deve allegare call_quebracho tramite l\'alias \\bqq\\b'
  );
});

test("Bowie: call_ares NON selezionato se non in available (admin gate preserved)", () => {
  // BOWIE_TOOL_NAMES non include call_ares → il gate admin è rispettato anche
  // se il messaggio menziona "ares" esplicitamente.
  const bowieTools = makeTools(BOWIE_TOOL_NAMES);
  assert.deepEqual(
    selectedNames("chiama ares per analizzare il problema", bowieTools),
    [],
    'call_ares non deve mai essere allegato se non è in available (admin-only)'
  );
  assert.deepEqual(
    selectedNames("ares", bowieTools),
    [],
    'la sola parola "ares" non deve selezionare call_ares quando non è disponibile'
  );
});

test("getHorusTools(message) applies contextual selection; a simple message yields no tools and no sonar ping", async (t) => {
  const originalUrl = process.env["HORUS_ANALYSIS_URL"];
  const originalToken = process.env["ANALYSIS_GATE_TOKEN"];
  const originalNadirUrl = process.env["NADIR_URL"];
  const originalNadirToken = process.env["NADIR_GATE_TOKEN"];
  process.env["HORUS_ANALYSIS_URL"] = "https://analysis.example";
  process.env["ANALYSIS_GATE_TOKEN"] = "tok";
  delete process.env["NADIR_URL"];
  delete process.env["NADIR_GATE_TOKEN"];
  t.after(() => {
    process.env["HORUS_ANALYSIS_URL"] = originalUrl;
    process.env["ANALYSIS_GATE_TOKEN"] = originalToken;
    process.env["NADIR_URL"] = originalNadirUrl;
    process.env["NADIR_GATE_TOKEN"] = originalNadirToken;
  });

  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ sonarAvailable: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const tools = await getHorusTools("Ciao, come stai?");
  assert.deepEqual(tools, [], "un messaggio conversazionale non deve allegare tool");
  assert.equal(fetchCalls, 0, "senza sonar_scan tra i selezionati non deve interrogare /capabilities");
});
