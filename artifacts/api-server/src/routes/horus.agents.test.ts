import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import horusRouter from "./horus.js";

/**
 * Regressione per Task #162: `GET /horus/agents` è l'unica fonte di verità
 * da cui il frontend costruisce sia il gate di raggiungibilità sia la
 * configurazione della conversazione osservata (Task #156, vedi
 * `useAgentRegistry` in `horus-chat.tsx`). Senza un test dedicato, un
 * refactor di `AGENT_DEFINITIONS` potrebbe silenziosamente:
 *  - rimuovere/rinominare un agente atteso (Horus o Bowie),
 *  - restituire un `healthEndpoint` che non corrisponde più a nessuna route
 *    reale montata dallo stesso router,
 * rompendo la chat pubblica senza che nessun test se ne accorga.
 *
 * Il router reale viene montato in un vero server HTTP (stesso pattern degli
 * altri test in questo file) e interrogato per davvero: prima si legge la
 * lista degli agenti, poi si verifica che ogni `healthEndpoint` dichiarato
 * risponda (e non 404) sullo stesso router.
 */

process.env["HORUS_CHAT_PASSWORD"] ??= "test-password-for-agents-registry";

async function startTestServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  // Il router reale registra le sue route come "/horus/..." e nell'app di
  // produzione viene montato sotto "/api" (vedi routes/index.ts + app.ts:
  // `app.use("/api", router)`). Qui lo montiamo alla radice: i path restano
  // identici a meno del prefisso "api/", che `healthEndpoint` include
  // esplicitamente e che togliamo prima di interrogare il path relativo.
  app.use(horusRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function getJson(url: string): Promise<{ statusCode: number; body: unknown }> {
  return await new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: "GET", headers: { "X-Horus-Password": process.env["HORUS_CHAT_PASSWORD"]! } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk.toString("utf8")));
        res.on("end", () => {
          const contentType = res.headers["content-type"] ?? "";
          const body = contentType.includes("application/json") && raw ? JSON.parse(raw) : raw;
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Elenco atteso dei tre agenti registrati (Task #142: Horus, Bowie,
// Quebracho). Deliberatamente un elenco chiuso ed esplicito, non solo
// "contiene almeno horus e bowie": se un agente viene rimosso o rinominato
// per errore, questo test deve fallire, non restare silenziosamente verde.
const EXPECTED_AGENTS = [
  { id: "horus", displayName: "Horus", healthEndpoint: "api/horus/health" },
  { id: "bowie", displayName: "Bowie", healthEndpoint: "api/horus/bowie-health" },
  { id: "quebracho", displayName: "Quebracho", healthEndpoint: "api/horus/quebracho-health" },
];

test("GET /horus/agents returns exactly the expected agents with correct id/displayName/healthEndpoint shape", async () => {
  const server = await startTestServer();

  try {
    const { statusCode, body } = await getJson(`${server.url}/horus/agents`);
    assert.equal(statusCode, 200);
    assert.ok(Array.isArray(body), `expected an array, got: ${JSON.stringify(body)}`);

    const agents = body as Array<{ id?: unknown; displayName?: unknown; healthEndpoint?: unknown }>;

    for (const agent of agents) {
      assert.equal(typeof agent.id, "string", `agent.id must be a string, got: ${JSON.stringify(agent)}`);
      assert.equal(
        typeof agent.displayName,
        "string",
        `agent.displayName must be a string, got: ${JSON.stringify(agent)}`
      );
      assert.equal(
        typeof agent.healthEndpoint,
        "string",
        `agent.healthEndpoint must be a string, got: ${JSON.stringify(agent)}`
      );
    }

    // Set esatto degli id: intercetta sia un agente mancante sia uno extra
    // non documentato, non solo la presenza dei due storici (Horus/Bowie).
    assert.deepEqual(
      agents.map((a) => a.id).sort(),
      EXPECTED_AGENTS.map((a) => a.id).sort(),
      `expected exactly the agent ids ${EXPECTED_AGENTS.map((a) => a.id).join(", ")}, got: ${agents.map((a) => a.id).join(", ")}`
    );

    const byId = new Map(agents.map((a) => [a.id, a]));
    for (const expected of EXPECTED_AGENTS) {
      const actual = byId.get(expected.id);
      assert.ok(actual, `expected an agent with id "${expected.id}"`);
      assert.equal(
        actual!.displayName,
        expected.displayName,
        `wrong displayName for agent "${expected.id}"`
      );
      assert.equal(
        actual!.healthEndpoint,
        expected.healthEndpoint,
        `wrong healthEndpoint for agent "${expected.id}"`
      );
    }
  } finally {
    await server.close();
  }
});

test("GET /horus/agents rejects requests without the correct password", async () => {
  const server = await startTestServer();

  try {
    const { statusCode } = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const req = http.request(`${server.url}/horus/agents`, { method: "GET" }, (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0 }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(statusCode, 401);
  } finally {
    await server.close();
  }
});

test("every healthEndpoint returned by GET /horus/agents matches a live route on the same router", async () => {
  const server = await startTestServer();

  try {
    const { body } = await getJson(`${server.url}/horus/agents`);
    const agents = body as Array<{ id: string; healthEndpoint: string }>;
    assert.ok(agents.length > 0, "expected at least one agent to verify against live routes");

    for (const agent of agents) {
      // `healthEndpoint` is exposed with the "api/" prefix the client is
      // expected to add on top of the shared proxy base; the router here is
      // mounted at the root, so we strip that one prefix segment to reach
      // the same relative path the real router registered.
      assert.ok(
        agent.healthEndpoint.startsWith("api/"),
        `healthEndpoint for "${agent.id}" should start with "api/", got: ${agent.healthEndpoint}`
      );
      const relativePath = agent.healthEndpoint.slice("api/".length);

      const { statusCode, body: healthBody } = await getJson(`${server.url}/${relativePath}`);
      assert.equal(
        statusCode,
        200,
        `expected healthEndpoint "${agent.healthEndpoint}" for agent "${agent.id}" to resolve to a live route, got ${statusCode}: ${JSON.stringify(healthBody)}`
      );
      assert.ok(
        healthBody && typeof healthBody === "object" && "status" in (healthBody as Record<string, unknown>),
        `expected a health payload with a "status" field from "${agent.healthEndpoint}", got: ${JSON.stringify(healthBody)}`
      );
    }
  } finally {
    await server.close();
  }
});
