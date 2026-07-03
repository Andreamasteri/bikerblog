import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { reindexNadir } from "./reindex-nadir.js";

// ── Test harness ─────────────────────────────────────────────────────────────
// reindexNadir() reads NADIR_URL/NADIR_GATE_TOKEN from the environment and calls
// the global fetch. We stub both so we can drive every branch deterministically
// and, critically, assert that NONE of them ever throw — that is the whole point
// of the task: a Nadir outage must never crash the nightly pipeline.

const originalFetch = globalThis.fetch;
const originalUrl = process.env["NADIR_URL"];
const originalToken = process.env["NADIR_GATE_TOKEN"];

function setEnv(url: string | undefined, token: string | undefined): void {
  if (url === undefined) delete process.env["NADIR_URL"];
  else process.env["NADIR_URL"] = url;
  if (token === undefined) delete process.env["NADIR_GATE_TOKEN"];
  else process.env["NADIR_GATE_TOKEN"] = token;
}

/** Replace global fetch with a stub returning the given response-like object. */
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

// (a) env not configured → "skipped", no fetch attempted
test("reindexNadir: unset NADIR_URL/NADIR_GATE_TOKEN → skipped (no fetch)", async () => {
  setEnv(undefined, undefined);
  let fetchCalled = false;
  stubFetch(() => {
    fetchCalled = true;
    throw new Error("fetch should not be called when unconfigured");
  });

  const result = await reindexNadir();
  assert.equal(result.status, "skipped");
  assert.equal(fetchCalled, false);
  assert.match(result.detail, /non configurati/);
});

test("reindexNadir: only NADIR_URL set (token missing) → skipped", async () => {
  setEnv("https://nadir.example", undefined);
  stubFetch(() => {
    throw new Error("fetch should not be called when token missing");
  });
  const result = await reindexNadir();
  assert.equal(result.status, "skipped");
});

test("reindexNadir: only NADIR_GATE_TOKEN set (url missing) → skipped", async () => {
  setEnv(undefined, "secret");
  stubFetch(() => {
    throw new Error("fetch should not be called when url missing");
  });
  const result = await reindexNadir();
  assert.equal(result.status, "skipped");
});

// (b) HTTP error → "warn"
test("reindexNadir: HTTP error status → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({ ok: false, status: 500, json: () => ({}) })
  );
  const result = await reindexNadir();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /HTTP 500/);
});

// (b') 200 OK but {error} in body → "warn"
test("reindexNadir: 200 OK with {error} body → warn", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({
      ok: true,
      status: 200,
      json: () => ({ error: "index locked" }),
    })
  );
  const result = await reindexNadir();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /index locked/);
});

// (c) network throw / timeout → "warn"
test("reindexNadir: network throw → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const result = await reindexNadir();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /irraggiungibile/);
  assert.match(result.detail, /ECONNREFUSED/);
});

test("reindexNadir: timeout (AbortError) → warn (does not throw)", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    throw err;
  });
  const result = await reindexNadir();
  assert.equal(result.status, "warn");
  assert.match(result.detail, /irraggiungibile/);
});

// (d) success → "ok" with indexed count parsed
test("reindexNadir: success → ok with parsed indexed count", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({
      ok: true,
      status: 200,
      json: () => ({ result: { indexed: 42 } }),
    })
  );
  const result = await reindexNadir();
  assert.equal(result.status, "ok");
  assert.match(result.detail, /42 documenti/);
});

test("reindexNadir: success with missing indexed → ok, defaults to 0", async () => {
  setEnv("https://nadir.example", "secret");
  stubFetch(() =>
    fakeResponse({ ok: true, status: 200, json: () => ({ result: {} }) })
  );
  const result = await reindexNadir();
  assert.equal(result.status, "ok");
  assert.match(result.detail, /0 documenti/);
});

test("reindexNadir: success with unparseable body → ok, defaults to 0", async () => {
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
  const result = await reindexNadir();
  assert.equal(result.status, "ok");
  assert.match(result.detail, /0 documenti/);
});

// Cross-cutting guarantee: no branch ever throws or returns "failed".
test("reindexNadir: no branch throws or produces a hard failure", async () => {
  const scenarios: Array<() => void> = [
    () => setEnv(undefined, undefined),
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() => fakeResponse({ ok: false, status: 503, json: () => ({}) }));
    },
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() => {
        throw new Error("boom");
      });
    },
    () => {
      setEnv("https://nadir.example", "secret");
      stubFetch(() =>
        fakeResponse({ ok: true, status: 200, json: () => ({ result: { indexed: 7 } }) })
      );
    },
  ];

  for (const setup of scenarios) {
    setup();
    const result = await reindexNadir();
    // Only the three tolerant statuses are ever returned — never "failed".
    assert.ok(["ok", "skipped", "warn"].includes(result.status));
  }
});
