import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { createAresReviewTaskHandler, type AresReviewTaskDeps } from "./ares-review-task.js";
import type { AresTaskReviewResult } from "@workspace/horus";

/**
 * Test route-level per POST /_internal/ares/review-task.
 *
 * Copre il mapping outcome → HTTP status dichiarato nel handler:
 *  - 401 senza/token sbagliato (e 401 se il token non è configurato)
 *  - 503 Ares non configurato
 *  - 409 ciclo già in corso (isAresRunning) + 409 via ARES_BUSY_MESSAGE
 *  - 400 body mancante di taskContent e taskFile
 *  - 400 taskFile con path traversal (../)
 *  - 400 taskContent vuoto
 *  - 404 taskFile non trovato
 *  - 200 happy path con taskContent inline
 *  - 200 happy path con taskFile risolto correttamente
 *  - 502 quando runAresTaskReview ritorna ok:false con errore generico
 *
 * Usa dependency injection (AresReviewTaskDeps) — nessun TC reale,
 * nessun DB, nessun filesystem reale.
 */

const TOKEN = "test-internal-token-ares";
const BUSY_MSG = "Un ciclo Ares è già in corso — riprova quando ha finito";
const FAKE_TASKS_DIR = "/fake/tasks";

function makeOkReview(overrides: Partial<AresTaskReviewResult> = {}): AresTaskReviewResult {
  return {
    ok: true,
    review: "## Giudizio finale\nAPPROVATO",
    snapshot: ["horus", "bowie"],
    restoreFailures: [],
    ...overrides,
  };
}

function makeBaseDeps(overrides: Partial<AresReviewTaskDeps> = {}): AresReviewTaskDeps {
  return {
    getToken: () => TOKEN,
    isAresConfigured: () => true,
    isAresRunning: () => false,
    runAresTaskReview: async () => makeOkReview(),
    aresModel: () => "devstral:test",
    aresIsBusy: BUSY_MSG,
    tasksDir: FAKE_TASKS_DIR,
    fileExists: () => true,
    readFile: () => "# Task plan\n\nContenuto del task.",
    ...overrides,
  };
}

// ------- helpers -------

function noopLog(): Record<string, (...args: unknown[]) => void> {
  const noop = (): void => {};
  return { info: noop, warn: noop, error: noop };
}

async function startServer(deps: AresReviewTaskDeps): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use((_req, _res, next) => {
    (_req as unknown as { log: ReturnType<typeof noopLog> }).log = noopLog();
    next();
  });
  app.post(
    "/_internal/ares/review-task",
    express.json({ limit: "1mb" }),
    createAresReviewTaskHandler(deps)
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind");
  return {
    url: `http://127.0.0.1:${address.port}/_internal/ares/review-task`,
    close: () => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))),
  };
}

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// ------- tests -------

test("returns 401 without Authorization header", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(url, { taskContent: "piano" });
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: "unauthorized" });
  } finally {
    await close();
  }
});

test("returns 401 with wrong token", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(url, { taskContent: "piano" }, { Authorization: "Bearer wrong" });
    assert.equal(r.status, 401);
  } finally {
    await close();
  }
});

test("returns 401 when no token is configured (getToken returns undefined)", async () => {
  const { url, close } = await startServer(makeBaseDeps({ getToken: () => undefined }));
  try {
    const r = await post(url, { taskContent: "piano" }, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 401);
  } finally {
    await close();
  }
});

test("returns 503 when Ares is not configured", async () => {
  const { url, close } = await startServer(makeBaseDeps({ isAresConfigured: () => false }));
  try {
    const r = await post(url, { taskContent: "piano" }, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 503);
    assert.ok(
      (r.body as { error: string }).error.toLowerCase().includes("ares"),
      "error should mention Ares"
    );
  } finally {
    await close();
  }
});

test("returns 409 when Ares is already running (isAresRunning)", async () => {
  const { url, close } = await startServer(makeBaseDeps({ isAresRunning: () => true }));
  try {
    const r = await post(url, { taskContent: "piano" }, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 409);
  } finally {
    await close();
  }
});

test("returns 400 when both taskContent and taskFile are missing", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(url, {}, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 400);
    assert.ok(
      (r.body as { error: string }).error.includes("taskContent"),
      "error should mention taskContent"
    );
  } finally {
    await close();
  }
});

test("returns 400 when taskFile attempts path traversal", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(
      url,
      { taskFile: "../../../etc/passwd" },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 400);
    assert.ok(
      (r.body as { error: string }).error.includes(".local/tasks/"),
      "error should reference the allowed directory"
    );
  } finally {
    await close();
  }
});

test("returns 400 when taskContent is empty string", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(url, { taskContent: "   " }, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 400);
  } finally {
    await close();
  }
});

test("returns 404 when taskFile does not exist", async () => {
  const { url, close } = await startServer(makeBaseDeps({ fileExists: () => false }));
  try {
    const r = await post(
      url,
      { taskFile: "task-non-esiste.md" },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 404);
  } finally {
    await close();
  }
});

test("returns 200 with restoreOk:true on happy path (taskContent inline)", async () => {
  const { url, close } = await startServer(makeBaseDeps());
  try {
    const r = await post(
      url,
      { taskContent: "# Task\n\nContenuto." },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 200);
    const body = r.body as { review: AresTaskReviewResult; restoreOk: boolean };
    assert.equal(body.restoreOk, true);
    assert.ok(body.review.ok);
    assert.ok(typeof body.review.review === "string");
  } finally {
    await close();
  }
});

test("returns 200 with restoreOk:true when taskFile resolves inside tasksDir", async () => {
  const readCalls: string[] = [];
  const deps = makeBaseDeps({
    tasksDir: "/fake/tasks",
    fileExists: () => true,
    readFile: (p) => {
      readCalls.push(p);
      return "# Task dal file\n\nContenuto.";
    },
  });
  const { url, close } = await startServer(deps);
  try {
    const r = await post(
      url,
      { taskFile: "task-212.md" },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 200);
    // Il path risolto deve essere sotto tasksDir
    assert.ok(readCalls[0]?.startsWith("/fake/tasks"), "readFile called with resolved path");
  } finally {
    await close();
  }
});

test("returns 502 when runAresTaskReview returns ok:false with generic error", async () => {
  const { url, close } = await startServer(
    makeBaseDeps({
      runAresTaskReview: async () => ({
        ok: false,
        snapshot: [],
        restoreFailures: [],
        error: "modello non raggiungibile",
      }),
    })
  );
  try {
    const r = await post(
      url,
      { taskContent: "# Task\n\nContenuto." },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 502);
    const body = r.body as { review: AresTaskReviewResult; restoreOk: boolean };
    assert.equal(body.review.ok, false);
    assert.equal(body.restoreOk, true);
  } finally {
    await close();
  }
});

test("returns 409 when runAresTaskReview returns ok:false with ARES_BUSY_MESSAGE", async () => {
  const { url, close } = await startServer(
    makeBaseDeps({
      runAresTaskReview: async () => ({
        ok: false,
        snapshot: [],
        restoreFailures: [],
        error: BUSY_MSG,
      }),
    })
  );
  try {
    const r = await post(
      url,
      { taskContent: "# Task\n\nContenuto." },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 409);
  } finally {
    await close();
  }
});

test("restoreOk is false when restoreFailures is non-empty", async () => {
  const { url, close } = await startServer(
    makeBaseDeps({
      runAresTaskReview: async () => makeOkReview({ restoreFailures: ["bowie"] }),
    })
  );
  try {
    const r = await post(
      url,
      { taskContent: "# Task\n\nContenuto." },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert.equal(r.status, 200);
    assert.equal((r.body as { restoreOk: boolean }).restoreOk, false);
  } finally {
    await close();
  }
});
