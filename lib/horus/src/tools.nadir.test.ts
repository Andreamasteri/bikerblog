import assert from "node:assert/strict";
import { test } from "node:test";
import { executeHorusTool, getHorusTools } from "./tools.js";

/**
 * Copertura di regressione per il tool `search_manual` (Nadir) in
 * lib/horus/src/tools.ts. Due garanzie critiche:
 *  1. `getHorusTools()` espone `search_manual` SOLO quando sia NADIR_URL sia
 *     NADIR_GATE_TOKEN sono impostati (altrimenti Nadir sarebbe invisibile agli
 *     agenti, oppure esposto senza servizio dietro);
 *  2. `callNadirService` (via executeHorusTool) mappa i casi di errore a testo
 *     amichevole invece di lanciare: non configurato, richiesta interrotta,
 *     errore HTTP del servizio.
 *
 * Sta in un file separato da tools.test.ts di proposito: quest'ultimo imposta a
 * livello di modulo HORUS_ANALYSIS_URL/ANALYSIS_GATE_TOKEN, e node --test isola
 * ogni file in un processo distinto, così qui l'ambiente resta pulito e il
 * gating di Nadir è verificabile senza interferenze dai tool di analisi.
 */

const NADIR_TOOL_NAME = "search_manual";
const REAL_NADIR_URL = process.env["NADIR_URL"];
const REAL_NADIR_TOKEN = process.env["NADIR_GATE_TOKEN"];

function setNadirEnv(url: string | undefined, token: string | undefined): void {
  if (url === undefined) delete process.env["NADIR_URL"];
  else process.env["NADIR_URL"] = url;
  if (token === undefined) delete process.env["NADIR_GATE_TOKEN"];
  else process.env["NADIR_GATE_TOKEN"] = token;
}

function restoreNadirEnv(): void {
  setNadirEnv(REAL_NADIR_URL, REAL_NADIR_TOKEN);
}

test("getHorusTools includes search_manual only when both NADIR env vars are set", async (t) => {
  t.after(restoreNadirEnv);

  setNadirEnv("https://nadir.example.test", "nadir-gate-token");
  let names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(
    names.includes(NADIR_TOOL_NAME),
    `expected "${NADIR_TOOL_NAME}" when configured, got: ${names.join(", ")}`,
  );

  setNadirEnv(undefined, undefined);
  names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(
    !names.includes(NADIR_TOOL_NAME),
    `expected "${NADIR_TOOL_NAME}" to be absent when unset, got: ${names.join(", ")}`,
  );

  // Solo l'URL, senza token → resta nascosto.
  setNadirEnv("https://nadir.example.test", undefined);
  names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(
    !names.includes(NADIR_TOOL_NAME),
    "search_manual must stay hidden when only NADIR_URL is set",
  );

  // Solo il token, senza URL → resta nascosto.
  setNadirEnv(undefined, "nadir-gate-token");
  names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(
    !names.includes(NADIR_TOOL_NAME),
    "search_manual must stay hidden when only NADIR_GATE_TOKEN is set",
  );
});

test("search_manual returns the friendly not-configured string when NADIR env is unset", async (t) => {
  t.after(restoreNadirEnv);
  setNadirEnv(undefined, undefined);

  let fetchCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });

  const result = await executeHorusTool(NADIR_TOOL_NAME, { query: "come lubrifico la catena" });

  assert.match(result, /non configurat/i);
  assert.equal(fetchCalled, false, "must not hit the network when not configured");
});

test("search_manual calls /search with the gate header and returns the service result", async (t) => {
  t.after(restoreNadirEnv);
  setNadirEnv("https://nadir.example.test", "nadir-gate-token");

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ result: "frammenti pertinenti" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await executeHorusTool(NADIR_TOOL_NAME, {
    query: "manutenzione catena",
    limit: 3,
  });

  assert.equal(result, "frammenti pertinenti");
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/search$/);
  assert.equal(call.init?.method, "POST");
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["X-Nadir-Gate-Token"], "nadir-gate-token");
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body, { query: "manutenzione catena", limit: 3 });
});

test("search_manual maps an HTTP error from the service to a friendly string (no throw)", async (t) => {
  t.after(restoreNadirEnv);
  setNadirEnv("https://nadir.example.test", "nadir-gate-token");

  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ error: "index not ready" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
  );

  const result = await executeHorusTool(NADIR_TOOL_NAME, { query: "qualcosa" });

  assert.match(result, /errore/i);
  assert.match(result, /503/);
  assert.match(result, /index not ready/);
});

test("search_manual maps an aborted request to a friendly string (no throw)", async (t) => {
  t.after(restoreNadirEnv);
  setNadirEnv("https://nadir.example.test", "nadir-gate-token");

  // fetch riceve un segnale già/che diventa aborted e rifiuta con AbortError,
  // come farebbe la fetch reale su annullamento dell'utente.
  t.mock.method(globalThis, "fetch", async (_url: string | URL, init?: RequestInit) => {
    const err = new DOMException("The operation was aborted", "AbortError");
    void init;
    throw err;
  });

  const controller = new AbortController();
  controller.abort();

  const result = await executeHorusTool(
    NADIR_TOOL_NAME,
    { query: "qualcosa" },
    controller.signal,
  );

  assert.match(result, /interrott/i);
});
