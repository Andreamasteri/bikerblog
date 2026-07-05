import assert from "node:assert/strict";
import { test } from "node:test";
import { capToolResult, executeHorusTool, getHorusTools, MAX_TOOL_RESULT_CHARS } from "./tools.js";

/**
 * Copertura di regressione per `sonar_scan` e per l'inoltro di `extraContext`
 * in `architect` (lib/horus/src/tools.ts). Il servizio di analisi reale gira
 * solo su TC (mai in questo ambiente), quindi qui mocchiamo `fetch` per
 * verificare la forma della richiesta e la validazione degli argomenti senza
 * toccare la rete, sullo stesso modello di
 * artifacts/api-server/src/routes/horus.sse.test.ts.
 */

// Sovrascriviamo sempre (non `??=`): l'ambiente reale può già avere
// HORUS_ANALYSIS_URL/ANALYSIS_GATE_TOKEN impostati per il servizio di
// analisi vero su TC, e questo test deve restare isolato da quel valore.
process.env["HORUS_ANALYSIS_URL"] = "https://analysis.example.test";
process.env["ANALYSIS_GATE_TOKEN"] = "test-gate-token";

interface CapturedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function mockAnalysisFetch(
  t: import("node:test").TestContext,
  responseBody: unknown
): CapturedFetchCall[] {
  const calls: CapturedFetchCall[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

test("sonar_scan rejects an invalid repo name without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("sonar_scan", { repo: "not-a-real-repo" });

  assert.match(result, /sconosciuto/i);
  assert.equal(calls.length, 0);
});

test("sonar_scan calls /sonar with the repo body and returns the mocked result", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "mocked sonar findings" });

  const result = await executeHorusTool("sonar_scan", { repo: "bikerlink" });

  assert.equal(result, "mocked sonar findings");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/sonar$/);
  assert.equal(call.init?.method, "POST");
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["X-Analysis-Gate-Token"], "test-gate-token");
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { repo: "bikerlink" });
});

test("architect forwards extraContext when provided", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "plan with sonar context" });

  const result = await executeHorusTool("architect", {
    repo: "bikerlink",
    mode: "plan",
    task: "fix the flaky test",
    extraContext: "sonar_scan found 3 code smells in server/ai/assistant",
  });

  assert.equal(result, "plan with sonar context");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/architect$/);
  const body = JSON.parse(String(call.init?.body));
  assert.equal(body.repo, "bikerlink");
  assert.equal(body.mode, "plan");
  assert.equal(body.task, "fix the flaky test");
  assert.equal(body.extraContext, "sonar_scan found 3 code smells in server/ai/assistant");
});

test("architect omits extraContext when not provided", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "plan without extra context" });

  const result = await executeHorusTool("architect", {
    repo: "bikerlink",
    mode: "debug",
    task: "find the root cause",
  });

  assert.equal(result, "plan without extra context");
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.extraContext, undefined);
});

test("architect rejects an invalid mode without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("architect", {
    repo: "bikerlink",
    mode: "not-a-real-mode",
    task: "anything",
  });

  assert.match(result, /sconosciuta/i);
  assert.equal(calls.length, 0);
});

test("typecheck_repo rejects an invalid repo name without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("typecheck_repo", { repo: "not-a-real-repo" });

  assert.match(result, /sconosciuto/i);
  assert.equal(calls.length, 0);
});

test("typecheck_repo calls /typecheck with the repo body", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "no type errors" });

  const result = await executeHorusTool("typecheck_repo", { repo: "bikerblog" });

  assert.equal(result, "no type errors");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/typecheck$/);
  assert.equal(call.init?.method, "POST");
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { repo: "bikerblog" });
});

test("lint_repo rejects an invalid repo name without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("lint_repo", { repo: "not-a-real-repo" });

  assert.match(result, /sconosciuto/i);
  assert.equal(calls.length, 0);
});

test("lint_repo calls /lint with the repo body", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "no lint issues" });

  const result = await executeHorusTool("lint_repo", { repo: "bikerweb" });

  assert.equal(result, "no lint issues");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/lint$/);
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { repo: "bikerweb" });
});

test("search_code rejects an invalid repo name without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("search_code", { repo: "not-a-real-repo", query: "foo" });

  assert.match(result, /sconosciuto/i);
  assert.equal(calls.length, 0);
});

test("search_code rejects an empty query without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("search_code", { repo: "bikerlink", query: "   " });

  assert.match(result, /mancante/i);
  assert.equal(calls.length, 0);
});

test("search_code calls /search with the repo and query body", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "3 matches found" });

  const result = await executeHorusTool("search_code", { repo: "bikerlink", query: "TODO" });

  assert.equal(result, "3 matches found");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/search$/);
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { repo: "bikerlink", query: "TODO" });
});

test("git_log rejects an invalid repo name without calling the analysis service", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const result = await executeHorusTool("git_log", { repo: "not-a-real-repo" });

  assert.match(result, /sconosciuto/i);
  assert.equal(calls.length, 0);
});

test("git_log calls /git-log with the repo and limit body", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "5 recent commits" });

  const result = await executeHorusTool("git_log", { repo: "bikerlink", limit: 5 });

  assert.equal(result, "5 recent commits");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/git-log$/);
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { repo: "bikerlink", limit: 5 });
});

test("git_log omits limit when not provided", async (t) => {
  const calls = mockAnalysisFetch(t, { result: "10 recent commits" });

  const result = await executeHorusTool("git_log", { repo: "bikerlink" });

  assert.equal(result, "10 recent commits");
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.deepEqual(body, { repo: "bikerlink" });
});

/**
 * Regressione (Horus/Bowie chat che si bloccava dal 2° messaggio in poi): un
 * risultato di tool troppo grande, reinserito interamente nel prompt
 * dell'iterazione successiva, faceva superare al prefill (silenzioso) il
 * tetto di ~100s del tunnel Cloudflare → HTTP 524 → freeze/"network error".
 * Ogni risultato deve quindi essere cappato prima di tornare nel prompt.
 * Questa copertura vive qui, accanto all'helper condiviso, così non dipende
 * da un eventuale re-export lato api-server.
 */

test("capToolResult lascia intatti i risultati sotto il limite", () => {
  const small = "risultato breve del tool";
  assert.equal(capToolResult(small), small);

  const exact = "x".repeat(MAX_TOOL_RESULT_CHARS);
  assert.equal(capToolResult(exact), exact);
});

test("capToolResult tronca i risultati oltre il limite e avvisa il modello", () => {
  const big = "y".repeat(MAX_TOOL_RESULT_CHARS * 3);
  const out = capToolResult(big);

  assert.ok(out.length < big.length, "il risultato troncato deve essere più corto dell'originale");
  assert.ok(
    out.length <= MAX_TOOL_RESULT_CHARS + 200,
    `il troncamento deve restare vicino al cap (era ${out.length} caratteri)`
  );
  assert.match(out, /troncato/i, "il modello deve essere avvisato che il risultato è stato tagliato");
});

test("capToolResult spezza su un a-capo quando è ragionevolmente vicino alla fine", () => {
  const line = "riga di contenuto\n";
  const big = line.repeat(Math.ceil((MAX_TOOL_RESULT_CHARS * 2) / line.length));
  const out = capToolResult(big);

  const body = out.split("\n\n[")[0]!;
  assert.ok(!body.endsWith("riga di conten"), "non deve tagliare a metà riga se può spezzare su \\n");
});

/**
 * Copertura per il capability-gating di `getHorusTools()`: la disponibilità
 * di `sonar_scan` è cache-ata per 60s (SONAR_CAPABILITY_CACHE_MS), quindi
 * ogni test qui sotto avanza l'orologio mockato di oltre 60s rispetto al
 * precedente per evitare di leggere un valore di cache lasciato da un test
 * precedente nello stesso processo.
 */

const ANALYSIS_ONLY_TOOL_NAMES = ["typecheck_repo", "lint_repo", "search_code", "git_log", "architect"];
const BASE_TOOL_NAMES = ["web_search", "github_read", "remember_note", "read_blog"];

test("getHorusTools returns only the base tools when the analysis/nadir/hub service env vars are unset", async (t) => {
  const originalUrl = process.env["HORUS_ANALYSIS_URL"];
  const originalToken = process.env["ANALYSIS_GATE_TOKEN"];
  const originalNadirUrl = process.env["NADIR_URL"];
  const originalNadirToken = process.env["NADIR_GATE_TOKEN"];
  const originalAiHubUrl = process.env["AI_HUB_URL"];
  const originalHubToken = process.env["HUB_GATE_TOKEN"];
  const originalNominatimUrl = process.env["NOMINATIM_URL"];
  const originalValhallaUrl = process.env["VALHALLA_URL"];
  const originalWhisperUrl = process.env["WHISPER_URL"];
  delete process.env["HORUS_ANALYSIS_URL"];
  delete process.env["ANALYSIS_GATE_TOKEN"];
  delete process.env["NADIR_URL"];
  delete process.env["NADIR_GATE_TOKEN"];
  delete process.env["AI_HUB_URL"];
  delete process.env["HUB_GATE_TOKEN"];
  delete process.env["NOMINATIM_URL"];
  delete process.env["VALHALLA_URL"];
  delete process.env["WHISPER_URL"];
  t.after(() => {
    process.env["HORUS_ANALYSIS_URL"] = originalUrl;
    process.env["ANALYSIS_GATE_TOKEN"] = originalToken;
    process.env["NADIR_URL"] = originalNadirUrl;
    process.env["NADIR_GATE_TOKEN"] = originalNadirToken;
    process.env["AI_HUB_URL"] = originalAiHubUrl;
    process.env["HUB_GATE_TOKEN"] = originalHubToken;
    process.env["NOMINATIM_URL"] = originalNominatimUrl;
    process.env["VALHALLA_URL"] = originalValhallaUrl;
    process.env["WHISPER_URL"] = originalWhisperUrl;
  });
  const calls = mockAnalysisFetch(t, { result: "should not be reached" });

  const tools = await getHorusTools();
  const names = tools.map((tool) => tool.function.name);

  assert.deepEqual(names, BASE_TOOL_NAMES);
  assert.equal(calls.length, 0);
});

test("getHorusTools includes sonar_scan when capabilities reports sonarAvailable: true", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  t.after(() => t.mock.timers.reset());
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ sonarAvailable: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );

  const tools = await getHorusTools();
  const names = tools.map((tool) => tool.function.name);

  for (const name of [...BASE_TOOL_NAMES, ...ANALYSIS_ONLY_TOOL_NAMES, "sonar_scan"]) {
    assert.ok(names.includes(name), `expected "${name}" to be included, got: ${names.join(", ")}`);
  }
});

test("getHorusTools omits sonar_scan (but keeps the rest) when capabilities reports sonarAvailable: false", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_100_000 });
  t.after(() => t.mock.timers.reset());
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ sonarAvailable: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );

  const tools = await getHorusTools();
  const names = tools.map((tool) => tool.function.name);

  assert.ok(!names.includes("sonar_scan"), `expected "sonar_scan" to be omitted, got: ${names.join(", ")}`);
  for (const name of [...BASE_TOOL_NAMES, ...ANALYSIS_ONLY_TOOL_NAMES]) {
    assert.ok(names.includes(name), `expected "${name}" to be included, got: ${names.join(", ")}`);
  }
});

test("getHorusTools omits sonar_scan (but keeps the rest) when the capabilities check fails or times out", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_200_000 });
  t.after(() => t.mock.timers.reset());
  // Simula sia un errore di rete sia un abort per timeout: entrambi finiscono
  // nello stesso ramo `catch` di isSonarAvailable() in tools.ts.
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("The operation was aborted", "TimeoutError");
  });

  const tools = await getHorusTools();
  const names = tools.map((tool) => tool.function.name);

  assert.ok(!names.includes("sonar_scan"), `expected "sonar_scan" to be omitted, got: ${names.join(", ")}`);
  for (const name of [...BASE_TOOL_NAMES, ...ANALYSIS_ONLY_TOOL_NAMES]) {
    assert.ok(names.includes(name), `expected "${name}" to be included, got: ${names.join(", ")}`);
  }
});
