import assert from "node:assert/strict";
import { test } from "node:test";
import { executeHorusTool } from "./tools.js";

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
