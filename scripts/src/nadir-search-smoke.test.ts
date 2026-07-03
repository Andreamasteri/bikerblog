import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkNadirSearch } from "./nadir-search-smoke.js";

// ── Test harness ─────────────────────────────────────────────────────────────
// checkNadirSearch() reads NADIR_URL/NADIR_GATE_TOKEN from the environment and
// calls the global fetch. We stub both so every branch is deterministic and,
// critically, assert that NONE of them ever throw — a Nadir outage must only
// ever surface as a "warn" result the caller can route to sendPipelineAlert,
// never as a crash.

const originalFetch = globalThis.fetch;
const originalUrl = process.env["NADIR_URL"];
const originalToken = process.env["NADIR_GATE_TOKEN"];

function setEnv(url: string | undefined, token: string | undefined): void {
  if (url === undefined) delete process.env["NADIR_URL"];
  else process.env["NADIR_URL"] = url;
  if (token === undefined) delete process.env["NADIR_GATE_TOKEN"];
  else process.env["NADIR_GATE_TOKEN"] = token;
}

function stubFetch(impl: () => Promise<unknown> | unknown): void {
  globalThis.fetch = (async () => impl()) as unknown as typeof fetch;
}

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  json: () => unknown | Promise<unknown>;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.json(),
  } as unknown as Response;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  setEnv(originalUrl, originalToken);
});

test("checkNadirSearch: unset NADIR_URL/NADIR_GATE_TOKEN → skipped (no fetch)", async () => {
  setEnv(undefined, undefined);
  let fetchCalled = false;
  stubFetch(() => {
    fetchCalled = true;
    throw new Error("fetch should not be called when unconfigured");
  });

  const result = await checkNadirSearch();
  assert.equal(result.status, "skipped");
  assert.equal(fetchCalled, false);
  assert.match(result.detail, /non configurati/);
});

test("checkNadirSearch: only NADIR_URL set (token missing) → skipped", async () => {
  setEnv("https://nadir.example", undefined);
  stubFetch(() => {
    throw new Error("fetch should not be called when token missing");
  });
  const result = await checkNadirSearch();
  assert.equal(result.status, "skipped");
});

test("checkNadirSearch: only NADIR_GATE_TOKEN set (url missing) → skipped", async () => {
  setEnv(undefined, "secret");
  stubFetch(() => {
    throw new Error("fetch should not be called when url missing");
  });
  const result = await checkNadirSearch();
  assert.equal(result.status, "skipped");
});

test("checkNadirSearch: HTTP error status → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() => fakeResponse({ ok: false, status: 503, json: () => ({}) }));
  const result = await checkNadirSearch();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /HTTP 503/);
});

test("checkNadirSearch: 200 OK with {error} body → warn", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({ ok: true, status: 200, json: () => ({ error: "model not loaded" }) })
  );
  const result = await checkNadirSearch();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /model not loaded/);
});

test("checkNadirSearch: network throw → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const result = await checkNadirSearch();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /irraggiungibile/);
  assert.match(result.detail, /ECONNREFUSED/);
});

test("checkNadirSearch: timeout (AbortError) → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    throw err;
  });
  const result = await checkNadirSearch();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /irraggiungibile/);
});

test("checkNadirSearch: success → ok", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({ ok: true, status: 200, json: () => ({ result: "qualche estratto pertinente" }) })
  );
  const result = await checkNadirSearch();
  assert.equal(result.status, "ok");
});

test("checkNadirSearch: success with unparseable body → ok", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({
      ok: true,
      status: 200,
      json: () => {
        throw new Error("invalid json");
      },
    })
  );
  const result = await checkNadirSearch();
  assert.equal(result.status, "ok");
});

test("checkNadirSearch: no branch ever throws or produces a hard failure", async () => {
  const scenarios: Array<() => void> = [
    () => setEnv(undefined, undefined),
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() => fakeResponse({ ok: false, status: 500, json: () => ({}) }));
    },
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() => {
        throw new Error("boom");
      });
    },
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() => fakeResponse({ ok: true, status: 200, json: () => ({ result: "ok" }) }));
    },
  ];

  for (const setup of scenarios) {
    setup();
    const result = await checkNadirSearch();
    assert.ok(["ok", "skipped", "warn"].includes(result.status));
  }
});
