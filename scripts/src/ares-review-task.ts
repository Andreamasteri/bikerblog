#!/usr/bin/env tsx
/**
 * ares:review-task — review one-shot di un task plan con Ares (heavy agent).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run ares:review-task -- --file .local/tasks/<nome>.md
 *   pnpm --filter @workspace/scripts run ares:review-task -- --file .local/tasks/<nome>.md --content "..." (inline)
 *
 * Ares è l'agente heavy on-demand (devstral). Alla chiamata:
 *   1. Sfratta la lineup residente dalla VRAM (Horus/Bowie/Quebracho/Nadir)
 *   2. Carica il modello pesante, analizza il task plan con tool read-only
 *   3. Propone una review strutturata
 *   4. Si scarica e ripristina la lineup (SEMPRE, anche in errore)
 *
 * ⚠  Può richiedere diversi minuti. Ares propone, l'admin decide — nessuna
 *    autocorrezione o modifica al codice viene eseguita.
 *
 * Exit code: 0 se ok, 1 se errore o Ares non configurato/occupato.
 *
 * Richiede:
 *   ARES_OLLAMA_MODEL  — modello pesante (es. devstral)
 *   HORUS_OLLAMA_URL   — URL dell'istanza Ollama sul TC
 */

import { readFileSync } from "node:fs";
import {
  runAresTaskReview,
  isAresConfigured,
} from "@workspace/horus";

function checkEnv(): void {
  if (!isAresConfigured()) {
    console.error(
      "❌ Ares non configurato — manca ARES_OLLAMA_MODEL o HORUS_OLLAMA_URL.\n" +
        "   Imposta entrambe le variabili d'ambiente e riprova."
    );
    process.exit(1);
  }
}

function parseArgs(): { taskContent: string; label: string } {
  const args = process.argv.slice(2);

  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1];
    if (!filePath) {
      console.error("Usage: ares:review-task -- --file <percorso>");
      process.exit(1);
    }
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      console.error(`❌ Impossibile leggere: ${filePath}`);
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return { taskContent: content, label: filePath };
  }

  const contentIdx = args.indexOf("--content");
  if (contentIdx !== -1) {
    const content = args[contentIdx + 1];
    if (!content) {
      console.error("Usage: ares:review-task -- --content \"<testo del task plan>\"");
      process.exit(1);
    }
    return { taskContent: content, label: "(inline)" };
  }

  console.error("Usage: ares:review-task -- --file <percorso> | --content \"<testo>\"");
  process.exit(1);
}

async function main(): Promise<void> {
  checkEnv();

  const { taskContent, label } = parseArgs();

  if (taskContent.trim().length === 0) {
    console.error("❌ Task plan vuoto.");
    process.exit(1);
  }

  console.error(`🔩 Ares — review del task plan: ${label}`);
  console.error("⚠  Ares è il modello heavy on-demand: la VRAM sarà temporaneamente dedicata.");
  console.error("   Attendi il completamento (può richiedere qualche minuto)...\n");

  const result = await runAresTaskReview(taskContent);

  if (!result.ok) {
    console.error(`\n❌ Ares ha fallito: ${result.error ?? "errore sconosciuto"}`);
    if (result.restoreFailures.length > 0) {
      console.error(`⚠  Lineup non completamente ripristinata: ${result.restoreFailures.join(", ")}`);
    }
    process.exit(1);
  }

  if (result.restoreFailures.length > 0) {
    console.error(`⚠  Lineup non completamente ripristinata: ${result.restoreFailures.join(", ")}`);
  }

  console.log(result.review ?? "(nessuna review prodotta)");
  console.error(`\n✅ Ares completato. restoreOk: ${result.restoreFailures.length === 0}`);
  if (result.snapshot.length > 0) {
    console.error(`   Modelli ripristinati: ${result.snapshot.join(", ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Errore fatale:", err instanceof Error ? err.message : err);
  process.exit(1);
});
