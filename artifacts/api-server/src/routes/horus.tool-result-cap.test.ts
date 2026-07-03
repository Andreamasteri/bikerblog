import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetedToolResult } from "./horus.js";

/**
 * Regressione (Task multi-tool): cappare ogni SINGOLO risultato non basta —
 * più tool in un turno accumulano risultati nel prompt e possono comunque far
 * superare al prefill il tetto di ~100s del tunnel Cloudflare → HTTP 524.
 * `budgetedToolResult` applica un budget TOTALE per turno: la somma dei
 * risultati reinseriti resta limitata. (Il cap del singolo risultato,
 * `capToolResult`, vive ora in `@workspace/horus` ed è testato lì in
 * `lib/horus/src/tools.test.ts`.)
 */

const CAP = 4000;
const TOTAL = 8000;

test("budgetedToolResult limita la somma dei risultati sotto il budget totale del turno", () => {
  const big = "z".repeat(CAP * 3);
  let used = 0;
  const chunks: string[] = [];
  // Simula 3 tool grandi consecutivi nello stesso turno.
  for (let i = 0; i < 3; i++) {
    const out = budgetedToolResult(big, used);
    used += out.charsUsed;
    chunks.push(out.content);
  }
  assert.equal(used, chunks.join("").length, "charsUsed deve corrispondere al contenuto reinserito");
  // Il budget limita il contenuto grezzo; ogni risultato aggiunge una breve nota
  // di troncamento (~200 char) come overhead fisso, quindi si tollera un piccolo
  // margine per fino a MAX_TOOL_ITERATIONS note. Resta comunque ben sotto il ~12k
  // del caso peggiore precedente (nessun budget totale).
  assert.ok(
    used <= TOTAL + 800,
    `la somma dei risultati deve restare vicino al budget totale (era ${used} caratteri)`
  );
});

test("budgetedToolResult restringe il cap del risultato quando il budget si esaurisce", () => {
  const big = "z".repeat(CAP * 3);
  const first = budgetedToolResult(big, 0);
  const second = budgetedToolResult(big, first.charsUsed);
  assert.ok(first.charsUsed <= CAP + 200, "il primo risultato usa il cap singolo pieno");
  assert.ok(
    second.charsUsed < first.charsUsed,
    "il secondo risultato deve essere più corto perché il budget residuo è minore"
  );
});

test("budgetedToolResult restituisce solo una nota quando il budget è esaurito", () => {
  const big = "z".repeat(CAP);
  const out = budgetedToolResult(big, TOTAL);
  assert.match(out.content, /limite complessivo/i, "deve segnalare il budget totale esaurito");
  assert.ok(out.content.length < 600, "la nota di budget esaurito deve essere breve");
});

test("budgetedToolResult non tocca risultati piccoli che stanno nel budget", () => {
  const small = "risultato breve";
  const out = budgetedToolResult(small, 0);
  assert.equal(out.content, small);
  assert.equal(out.charsUsed, small.length);
});
