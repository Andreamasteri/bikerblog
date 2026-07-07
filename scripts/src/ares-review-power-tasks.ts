#!/usr/bin/env tsx
/**
 * ares:review-power-tasks — revisiona in sequenza i 3 task power-mode con Ares.
 *
 * Salva ogni review in inbox/ares-review-<nome>.md.
 * Script one-shot: esce dopo aver completato (o tentato) tutti e 3.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { isAresConfigured, runAresTaskReview } from "@workspace/horus";
import { readFileSync } from "node:fs";

const TASKS = [
  {
    name: "fase2b-motore-chat-tc-power",
    file: ".local/tasks/fase2b-motore-chat-tc-power.md",
    label: "Fase 2b — motore chat AI Hub + memoria condivisa",
  },
  {
    name: "fase-2d-power-coder-fallback",
    file: ".local/tasks/fase-2d-power-coder-fallback.md",
    label: "Fase 2d — coder pesante on-demand + eviction gated",
  },
  {
    name: "fase-2e-power-whisper-route",
    file: ".local/tasks/fase-2e-power-whisper-route.md",
    label: "Fase 2e — Whisper STT + route planning su Horus",
  },
] as const;

function saveResult(name: string, content: string): void {
  mkdirSync("inbox", { recursive: true });
  writeFileSync(`inbox/ares-review-${name}.md`, content, "utf-8");
}

async function main(): Promise<void> {
  console.log("🔩 Ares review batch — 3 task power-mode");
  console.log("⚠  Ogni review sfratta Horus/Bowie dalla VRAM e ripristina al termine.");
  console.log("   I risultati vengono salvati in inbox/ares-review-<nome>.md\n");

  if (!isAresConfigured()) {
    console.error("❌ Ares non configurato — manca ARES_OLLAMA_MODEL o HORUS_OLLAMA_URL.");
    process.exit(1);
  }

  let exitCode = 0;

  for (const task of TASKS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 Task: ${task.label}`);
    console.log(`   File: ${task.file}`);

    let content: string;
    try {
      content = readFileSync(task.file, "utf-8");
    } catch (err) {
      console.error(`❌ Impossibile leggere ${task.file}: ${err instanceof Error ? err.message : String(err)}`);
      exitCode = 1;
      continue;
    }

    console.log("   🚀 Avvio Ares...");
    const result = await runAresTaskReview(content);

    if (!result.ok) {
      console.error(`❌ Ares ha fallito: ${result.error ?? "errore sconosciuto"}`);
      if (result.restoreFailures.length > 0) {
        console.error(`⚠  Lineup non ripristinata: ${result.restoreFailures.join(", ")}`);
      }
      const errContent = `# Ares review — FALLITA\n\n**Task:** ${task.label}\n**Errore:** ${result.error ?? "sconosciuto"}\n`;
      saveResult(task.name, errContent);
      exitCode = 1;
      continue;
    }

    if (result.restoreFailures.length > 0) {
      console.error(`⚠  Lineup non completamente ripristinata: ${result.restoreFailures.join(", ")}`);
    }

    const reviewContent = result.review ?? "(nessuna review prodotta)";
    const markdown = `# Ares review — ${task.label}\n\n${reviewContent}\n\n---\n*Modelli ripristinati: ${result.snapshot.join(", ")}*\n`;
    saveResult(task.name, markdown);

    console.log(`✅ Review completata → inbox/ares-review-${task.name}.md`);
    console.log(`   Modelli ripristinati: ${result.snapshot.join(", ")}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🏁 Batch completato. Risultati in inbox/ares-review-*.md`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("❌ Errore fatale:", err instanceof Error ? err.message : err);
  process.exit(1);
});
