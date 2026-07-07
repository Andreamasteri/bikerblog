#!/usr/bin/env tsx
/**
 * horus:review-task — review one-shot di un task plan con Horus in modalità architetto.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run horus:review-task -- <percorso-task.md>
 *
 * Exit code: 0 se il giudizio finale è APPROVATO, 1 se RICHIEDE MODIFICHE o RIFIUTATO.
 *
 * Il tool loop usa il set completo di tool disponibili (analisi statica, search_code,
 * github_read, ecc.) così Horus può verificare le assunzioni sul codice prima di
 * emettere il giudizio.
 */

import { readFileSync } from "node:fs";
import {
  horusChatRaw,
  getHorusTools,
  executeHorusTool,
  capToolResult,
  ARCHITECT_SYSTEM_PROMPT,
  type HorusMessage,
} from "@workspace/horus";

const MAX_TOOL_ITERATIONS = 6;

function checkEnv(): void {
  if (!process.env["HORUS_OLLAMA_URL"]) {
    console.error(
      "❌ HORUS_OLLAMA_URL non configurato — impossibile contattare Horus.\n" +
        "   Esegui questo comando in un workflow con l'ambiente corretto."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  checkEnv();

  const taskFile = process.argv[2];
  if (!taskFile) {
    console.error(
      "Usage: pnpm --filter @workspace/scripts run horus:review-task -- <percorso-task.md>"
    );
    process.exit(1);
  }

  let taskContent: string;
  try {
    taskContent = readFileSync(taskFile, "utf-8");
  } catch (err) {
    console.error(`❌ Impossibile leggere il file: ${taskFile}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.error(`📋 Analisi di: ${taskFile}`);
  console.error("🔍 Horus in modalità architetto — avvio tool loop...\n");

  const systemPrompt: HorusMessage = { role: "system", content: ARCHITECT_SYSTEM_PROMPT };
  const conversation: HorusMessage[] = [
    systemPrompt,
    {
      role: "user",
      content: `Analizza il seguente task plan e produci la review strutturata:\n\n${taskContent}`,
    },
  ];

  let finalReply = "";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Passa il contenuto del task come "messaggio" per la selezione contestuale
    // dei tool: così search_code, typecheck_repo ecc. vengono inclusi se rilevanti.
    // getHorusTools() senza argomenti restituisce il set completo — usiamo
    // il testo del task come hint per l'euristica di selezione.
    const tools = await getHorusTools(`typecheck search_code lint git_log ${taskContent.slice(0, 300)}`);

    const { content, toolCalls } = await horusChatRaw(conversation, {
      tools: tools.length > 0 ? tools : undefined,
      onToken: (token) => {
        process.stdout.write(token);
      },
    });

    if (toolCalls.length === 0) {
      if (!content && !finalReply) {
        // Nessun contenuto e nessun tool: risposta vuota inattesa.
        console.error("\n⚠️  Horus non ha prodotto risposta.");
        process.exit(1);
      }
      finalReply = content || finalReply;
      break;
    }

    // C'è almeno un tool call: non stampare il content parziale
    // (potrebbe essere vuoto o un'intro prima del tool).
    conversation.push({ role: "assistant", content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const toolName = call.function.name;
      process.stderr.write(`\n  ↳ [tool: ${toolName}(${JSON.stringify(call.function.arguments)})...] `);

      let result: string;
      try {
        result = await executeHorusTool(toolName, call.function.arguments);
      } catch (err) {
        result = `Errore nell'esecuzione del tool ${toolName}: ${err instanceof Error ? err.message : String(err)}`;
      }

      process.stderr.write("fatto\n");
      conversation.push({ role: "tool", name: toolName, content: capToolResult(result) });
    }
  }

  if (!finalReply) {
    // Il loop si è esaurito senza una risposta finale senza tool_calls:
    // chiedi una risposta conclusiva senza tool.
    process.stderr.write("\n[Iterazioni esaurite — richiesta sintesi finale]\n");
    const { content } = await horusChatRaw(conversation);
    finalReply = content;
    process.stdout.write(finalReply);
  }

  process.stdout.write("\n");

  // Exit code: 0 solo se il giudizio è esplicitamente APPROVATO.
  const upper = finalReply.toUpperCase();
  if (
    upper.includes("APPROVATO") &&
    !upper.includes("RICHIEDE MODIFICHE") &&
    !upper.includes("RIFIUTATO")
  ) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Errore fatale:", err instanceof Error ? err.message : err);
  process.exit(1);
});
