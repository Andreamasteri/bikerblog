/**
 * bowie-readiness-check.test.ts
 *
 * Unit tests for checkBowieReadinessWithDeps() — the injectable-dependency
 * variant of checkBowieReadiness(), which lets each test case supply its own
 * fake health/inference stubs without module mocking.
 *
 * Orchestration contract verified here:
 *   • status "skipped"  → Bowie not configured: pipeline step 3.9 is "skipped",
 *                         pipelineHardFailed stays false, step 4 runs normally.
 *   • status "ok"       → Bowie healthy: pipeline step 3.9 is "ok",
 *                         pipelineHardFailed stays false, step 4 runs normally.
 *   • status "warn"     → Bowie unavailable: pipeline step 3.9 becomes "failed",
 *                         pipelineHardFailed = true (non-zero exit), step 4 skipped.
 *
 * The "warn" → failed/non-zero exit mapping is enforced by run-cluster-daily.ts;
 * these tests verify that every failure path in checkBowieReadiness surfaces
 * status "warn" so the orchestrator can act on it correctly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkBowieReadinessWithDeps } from "./bowie-readiness-check.js";
import type { BowieReadinessDeps } from "./bowie-readiness-check.js";
import type { HorusRawResult } from "@workspace/horus";

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPTY_TOOL_CALLS: HorusRawResult["toolCalls"] = [];

/** Build a BowieReadinessDeps stub with sensible happy-path defaults. */
function makeDeps(overrides: Partial<BowieReadinessDeps> = {}): BowieReadinessDeps {
  return {
    isBowieConfigured: () => true,
    checkBowieHealth: async () => ({ status: "ok" as const, model: "qwen3:1.7b" }),
    bowieChatRaw: async () => ({ content: "pronto", toolCalls: EMPTY_TOOL_CALLS }),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("checkBowieReadinessWithDeps()", () => {
  test("returns skipped when Bowie is not configured", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({ isBowieConfigured: () => false }),
    );
    assert.equal(result.status, "skipped");
    assert.ok(result.detail.length > 0, "detail should be non-empty");
    assert.equal(result.failedPhase, undefined, "failedPhase should be absent on skip");
  });

  test("returns skipped when health returns not_configured", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        checkBowieHealth: async () => ({ status: "not_configured" as const }),
      }),
    );
    assert.equal(result.status, "skipped");
  });

  test("returns warn with failedPhase=health when Ollama server is unreachable", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        checkBowieHealth: async () => ({
          status: "unreachable" as const,
          model: "qwen3:1.7b",
          detail: "connection refused",
        }),
      }),
    );
    assert.equal(result.status, "warn", "unreachable server must produce warn, not ok or skipped");
    assert.equal(result.failedPhase, "health");
    assert.ok(result.detail.includes("connection refused") || result.detail.length > 0);
  });

  test("returns warn with failedPhase=health when health check throws", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        checkBowieHealth: async () => {
          throw new Error("network drop");
        },
      }),
    );
    assert.equal(result.status, "warn");
    assert.equal(result.failedPhase, "health");
    assert.ok(result.detail.includes("network drop"));
  });

  test("returns warn with failedPhase=inference when inference times out", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        bowieChatRaw: (_msgs, opts): Promise<HorusRawResult> =>
          new Promise<HorusRawResult>((_resolve, reject) => {
            if (opts?.signal) {
              opts.signal.addEventListener("abort", () =>
                reject(new DOMException("The operation was aborted", "AbortError")),
              );
            }
            setTimeout(() => reject(new DOMException("The operation was aborted", "AbortError")), 60_000);
          }),
      }),
      100, // very short timeout so the abort fires immediately
    );
    assert.equal(result.status, "warn", "inference timeout must produce warn");
    assert.equal(result.failedPhase, "inference");
    assert.ok(result.detail.toLowerCase().includes("scaduto") || result.detail.length > 0);
  });

  test("returns warn with failedPhase=inference when inference throws a non-timeout error", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        bowieChatRaw: async () => {
          throw new Error("model not loaded");
        },
      }),
    );
    assert.equal(result.status, "warn");
    assert.equal(result.failedPhase, "inference");
    assert.ok(result.detail.includes("model not loaded"));
  });

  test("returns warn with failedPhase=inference when inference returns empty content", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        bowieChatRaw: async () => ({ content: "", toolCalls: EMPTY_TOOL_CALLS }),
      }),
    );
    assert.equal(result.status, "warn");
    assert.equal(result.failedPhase, "inference");
    assert.ok(result.detail.length > 0, "detail should explain the empty response");
  });

  test("returns warn with failedPhase=inference when inference returns whitespace only", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        bowieChatRaw: async () => ({ content: "   \n  ", toolCalls: EMPTY_TOOL_CALLS }),
      }),
    );
    assert.equal(result.status, "warn");
    assert.equal(result.failedPhase, "inference");
  });

  test("returns ok when health and inference both pass", async () => {
    const result = await checkBowieReadinessWithDeps(makeDeps());
    assert.equal(result.status, "ok");
    assert.equal(result.failedPhase, undefined, "failedPhase should be absent on success");
    assert.ok(result.detail.includes("pronto"), "detail should include the probe response");
  });

  test("ok result detail includes the probe response text", async () => {
    const result = await checkBowieReadinessWithDeps(
      makeDeps({
        bowieChatRaw: async () => ({ content: "eccomi", toolCalls: [] as [] }),
      }),
    );
    assert.equal(result.status, "ok");
    assert.ok(result.detail.includes("eccomi"));
  });

  test("never throws — all failure paths return a structured result", async () => {
    const scenarios: BowieReadinessDeps[] = [
      makeDeps({ isBowieConfigured: () => false }),
      makeDeps({ checkBowieHealth: async () => { throw new Error("boom"); } }),
      makeDeps({ checkBowieHealth: async () => ({ status: "unreachable" as const }) }),
      makeDeps({ bowieChatRaw: async () => { throw new Error("gone"); } }),
      makeDeps({ bowieChatRaw: async () => ({ content: "", toolCalls: EMPTY_TOOL_CALLS }) }),
    ];
    for (const deps of scenarios) {
      const result = await checkBowieReadinessWithDeps(deps);
      assert.ok(
        ["ok", "warn", "skipped"].includes(result.status),
        `status must be a known value, got: ${result.status}`,
      );
      assert.ok(result.detail.length > 0, "detail must be non-empty on every path");
    }
  });
});
