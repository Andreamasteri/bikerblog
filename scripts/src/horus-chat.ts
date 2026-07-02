#!/usr/bin/env tsx
/**
 * horus-chat — CLI interattiva per chattare direttamente con Horus dal terminale.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run horus:chat
 *
 * Comandi durante la chat:
 *   /reset   — svuota la cronologia della conversazione corrente
 *   /exit    — esce (anche Ctrl+C o Ctrl+D)
 *
 * Nota: usa la stessa memoria persistente (inbox/horus-memory.md) di tutte
 * le altre chiamate a Horus, quindi eredita le note/correzioni già salvate.
 * Le note scritte durante questa chat NON vengono salvate automaticamente
 * in memoria — per farlo usa `pnpm --filter @workspace/scripts run horus:remember`.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { horusChat, type HorusMessage } from "./horus-client.js";

// Il modello bikerlink:latest ha un system prompt di base orientato a
// BikerLink/BikerBlog (usato per diario, traduzioni, recap). In chat libera
// questo lo porta a ricondurre ogni argomento a BikerLink anche quando non
// c'entra. Questo override chiede esplicitamente di comportarsi come
// assistente generico, salvo che l'utente non parli lui stesso di BikerLink.
const CHAT_SYSTEM_PROMPT: HorusMessage = {
  role: "system",
  content:
    "Questa è una conversazione libera con l'utente, non generazione di contenuti per il blog BikerBlog/BikerLink. " +
    "Rispondi come un assistente generico, competente e diretto, sull'argomento che l'utente porta. " +
    "NON riportare la conversazione su BikerLink, sviluppo software, moto o sul blog a meno che sia l'utente stesso a parlarne esplicitamente. " +
    "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink.",
};

const history: HorusMessage[] = [CHAT_SYSTEM_PROMPT];

function checkEnv(): void {
  if (!process.env["HORUS_OLLAMA_URL"]) {
    console.error(
      "❌ HORUS_OLLAMA_URL non configurato — impossibile contattare Horus.\n" +
        "   Esegui questo comando in un workflow con l'ambiente corretto (es. non nella sessione bash dell'agente)."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  checkEnv();

  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("🔥 Horus — chat interattiva (bikerlink:latest)");
  console.log('   Comandi: "/reset" per svuotare la cronologia, "/exit" per uscire.\n');

  for (;;) {
    let userInput: string;
    try {
      userInput = (await rl.question("tu> ")).trim();
    } catch {
      break; // Ctrl+D / stream chiuso
    }

    if (!userInput) continue;

    if (userInput === "/exit") break;

    if (userInput === "/reset") {
      history.length = 0;
      history.push(CHAT_SYSTEM_PROMPT);
      console.log("↺ Cronologia svuotata.\n");
      continue;
    }

    history.push({ role: "user", content: userInput });

    stdout.write("horus> ");
    let replied = "";
    try {
      const reply = await horusChat(history, {
        onToken: (token) => {
          stdout.write(token);
          replied += token;
        },
      });
      // Se onToken non ha stampato nulla (es. edge case), stampa la risposta completa.
      if (!replied) stdout.write(reply);
      stdout.write("\n\n");
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      console.error(
        `\n⚠ Errore: ${err instanceof Error ? err.message : String(err)}\n`
      );
      // Rimuove il messaggio utente fallito per non sporcare la cronologia.
      history.pop();
    }
  }

  rl.close();
  console.log("\n👋 Chat terminata.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
