/**
 * CLI per aggiungere una nota permanente alla memoria di Horus.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run horus:remember -- "Non inventare mai fatti se mancano le fonti"
 */

import { appendHorusMemory, loadHorusMemory } from "@workspace/horus";

const note = process.argv.slice(2).join(" ").trim();

if (!note) {
  console.error('Usage: pnpm --filter @workspace/scripts run horus:remember -- "nota da ricordare"');
  process.exit(1);
}

appendHorusMemory(note);
console.log(`✅ Nota salvata nella memoria di Horus: "${note}"`);
console.log("\n--- Memoria attuale ---");
console.log(loadHorusMemory());
