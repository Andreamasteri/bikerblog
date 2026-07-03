import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import {
  createNadirExportHandler,
  type NadirConversationRow,
  type NadirCommentRow,
} from "./nadir-export.js";

/**
 * Regressione per `GET /_internal/nadir-export` (routes/internal.ts, logica
 * estratta in routes/nadir-export.ts). Due garanzie critiche:
 *  1. senza il bearer token interno corretto la rotta risponde 401 e NON
 *     legge il manuale né interroga il DB (nessun dato interno esposto);
 *  2. con il token corretto restituisce la forma attesa
 *     {manual, conversations, comments}, con le conversazioni proiettate a
 *     {id, topic, status, createdAt, turns:[{agent, content}]}.
 *
 * Usiamo dependency injection (come createDirectChatHandler in horus.ts) per
 * fornire manuale/DB finti: il test non apre Postgres né tocca il filesystem.
 */

const TOKEN = "test-internal-token";

interface FakeDeps {
  readManualCalls: number;
  fetchConversationsCalls: number[];
  fetchCommentsCalls: number[];
}

function fakeConversationRows(): NadirConversationRow[] {
  return [
    {
      id: 1,
      topic: "Manutenzione catena",
      transcript: [
        { agent: "horus", content: "Come si lubrifica la catena?" },
        { agent: "bowie", content: "Con grasso spray dedicato." },
      ],
      status: "complete",
      createdAt: new Date("2026-01-02T10:00:00.000Z"),
    },
  ];
}

function fakeCommentRows(): NadirCommentRow[] {
  return [
    {
      id: 10,
      authorName: "Lettore",
      body: "Ottimo consiglio!",
      createdAt: new Date("2026-01-03T09:00:00.000Z"),
      likeCount: 3,
      postSlug: "manutenzione-catena",
      postTitle: "Manutenzione della catena",
    },
  ];
}

function startTestServer(overrides?: {
  getToken?: () => string | undefined;
}): Promise<{ url: string; deps: FakeDeps; close: () => Promise<void> }> {
  const deps: FakeDeps = {
    readManualCalls: 0,
    fetchConversationsCalls: [],
    fetchCommentsCalls: [],
  };

  const app = express();
  // Fornisce un req.log no-op (in produzione arriva da pino-http).
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: () => void } }).log = { error: () => {} };
    next();
  });
  app.get(
    "/_internal/nadir-export",
    createNadirExportHandler({
      getToken: overrides?.getToken ?? (() => TOKEN),
      readManual: () => {
        deps.readManualCalls++;
        return "MANUALE DI NADIR";
      },
      fetchConversations: async (limit) => {
        deps.fetchConversationsCalls.push(limit);
        return fakeConversationRows();
      },
      fetchComments: async (limit) => {
        deps.fetchCommentsCalls.push(limit);
        return fakeCommentRows();
      },
      defaultConversations: 50,
      maxConversations: 200,
      defaultComments: 500,
      maxComments: 2000,
      now: () => new Date("2026-01-04T00:00:00.000Z"),
    }),
  );

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to bind test server");
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/_internal/nadir-export`,
        deps,
        close: () =>
          new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

async function getJson(
  url: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test("nadir-export returns 401 and touches no data source without a bearer token", async () => {
  const { url, deps, close } = await startTestServer();
  try {
    const noAuth = await getJson(url);
    assert.equal(noAuth.status, 401);
    assert.deepEqual(noAuth.body, { error: "unauthorized" });

    const wrongToken = await getJson(url, { Authorization: "Bearer wrong-token" });
    assert.equal(wrongToken.status, 401);

    assert.equal(deps.readManualCalls, 0, "manual must not be read on a 401");
    assert.equal(
      deps.fetchConversationsCalls.length,
      0,
      "the DB must not be queried on a 401",
    );
    assert.equal(deps.fetchCommentsCalls.length, 0, "the DB must not be queried on a 401");
  } finally {
    await close();
  }
});

test("nadir-export returns 401 when no internal token is configured, even with a Bearer header", async () => {
  const { url, deps, close } = await startTestServer({ getToken: () => undefined });
  try {
    const res = await getJson(url, { Authorization: "Bearer anything" });
    assert.equal(res.status, 401);
    assert.equal(deps.fetchConversationsCalls.length, 0);
  } finally {
    await close();
  }
});

test("nadir-export returns the {manual, conversations, comments} shape with the correct token", async () => {
  const { url, deps, close } = await startTestServer();
  try {
    const res = await getJson(url, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 200);

    assert.deepEqual(Object.keys(res.body).sort(), [
      "comments",
      "conversations",
      "generatedAt",
      "manual",
    ]);

    assert.equal(res.body.manual, "MANUALE DI NADIR");

    assert.equal(res.body.conversations.length, 1);
    assert.deepEqual(res.body.conversations[0], {
      id: 1,
      topic: "Manutenzione catena",
      status: "complete",
      createdAt: "2026-01-02T10:00:00.000Z",
      turns: [
        { agent: "horus", content: "Come si lubrifica la catena?" },
        { agent: "bowie", content: "Con grasso spray dedicato." },
      ],
    });

    assert.equal(res.body.comments.length, 1);
    assert.equal(res.body.comments[0].postSlug, "manutenzione-catena");

    // Con la query di default, i limiti clamped devono corrispondere ai default.
    assert.deepEqual(deps.fetchConversationsCalls, [50]);
    assert.deepEqual(deps.fetchCommentsCalls, [500]);
  } finally {
    await close();
  }
});

test("nadir-export clamps out-of-range limits from the query string", async () => {
  const { url, deps, close } = await startTestServer();
  try {
    // conversations oltre il massimo (200) → clamped a 200; comments negativo →
    // fallback al default (500).
    const res = await getJson(`${url}?conversations=9999&comments=-5`, {
      Authorization: `Bearer ${TOKEN}`,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(deps.fetchConversationsCalls, [200]);
    assert.deepEqual(deps.fetchCommentsCalls, [500]);
  } finally {
    await close();
  }
});

test("nadir-export returns 500 (not a crash) when a data source throws", async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: () => void } }).log = { error: () => {} };
    next();
  });
  app.get(
    "/_internal/nadir-export",
    createNadirExportHandler({
      getToken: () => TOKEN,
      readManual: () => "",
      fetchConversations: async () => {
        throw new Error("db down");
      },
      fetchComments: async () => [],
      defaultConversations: 50,
      maxConversations: 200,
      defaultComments: 500,
      maxComments: 2000,
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("bind failed");
  const url = `http://127.0.0.1:${address.port}/_internal/nadir-export`;
  try {
    const res = await getJson(url, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "db down");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
