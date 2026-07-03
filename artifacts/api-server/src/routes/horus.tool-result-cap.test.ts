import assert from "node:assert/strict";
import { test } from "node:test";
import { capToolResult } from "./horus.js";

/**
 * Regressione (Horus/Bowie chat che si bloccava dal 2° messaggio in poi):
 * un risultato di tool troppo grande, reinserito interamente nel prompt
 * dell'iterazione successiva, faceva superare al prefill (silenzioso) il tetto
 * di ~100s del tunnel Cloudflare → HTTP 524 → freeze/"network error". Ogni
 * risultato deve quindi essere cappato prima di tornare nel prompt.
 */

const CAP = 4000;

test("capToolResult lascia intatti i risultati sotto il limite", () => {
  const small = "risultato breve del tool";
  assert.equal(capToolResult(small), small);

  const exact = "x".repeat(CAP);
  assert.equal(capToolResult(exact), exact);
});

test("capToolResult tronca i risultati oltre il limite e avvisa il modello", () => {
  const big = "y".repeat(CAP * 3);
  const out = capToolResult(big);

  assert.ok(out.length < big.length, "il risultato troncato deve essere più corto dell'originale");
  assert.ok(
    out.length <= CAP + 200,
    `il troncamento deve restare vicino al cap (era ${out.length} caratteri)`
  );
  assert.match(out, /troncato/i, "il modello deve essere avvisato che il risultato è stato tagliato");
});

test("capToolResult spezza su un a-capo quando è ragionevolmente vicino alla fine", () => {
  const line = "riga di contenuto\n";
  const big = line.repeat(Math.ceil((CAP * 2) / line.length));
  const out = capToolResult(big);

  const body = out.split("\n\n[")[0]!;
  assert.ok(!body.endsWith("riga di conten"), "non deve tagliare a metà riga se può spezzare su \\n");
});
