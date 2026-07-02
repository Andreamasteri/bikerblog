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
import { horusChatRaw, appendHorusMemory, type HorusMessage } from "./horus-client.js";
import { HORUS_TOOLS, executeHorusTool } from "./horus-tools.js";

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
    "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink. " +
    "Hai a disposizione dei tool: usa web_search quando ti serve un'informazione aggiornata o che non conosci con certezza; " +
    "usa github_read per leggere file o cartelle dal codice sorgente reale di bikerlink, bikerblog o bikerweb quando l'utente chiede di codice, struttura del progetto, " +
    "come funziona una feature, o quando vuoi proporre idee di nuovi task o contenuti basate su cosa esiste già nel codice — è sempre sola lettura, non puoi scrivere né eseguire nulla, " +
    "e qualsiasi idea o proposta va detta a parole in chat, mai eseguita autonomamente; " +
    "usa remember_note ogni volta che l'utente ti comunica qualcosa di importante da ricordare in futuro (preferenze, correzioni, fatti su di sé o sul progetto), " +
    "anche se non te lo chiede esplicitamente con un comando — non serve chiedere conferma, salvala e basta.",
};

const MAX_TOOL_ITERATIONS = 5;

// Nota tecnica: il tool remember_note (function calling) è disponibile, ma
// nei test il modello a volte "racconta" a parole di aver salvato una nota
// senza emettere davvero un tool_call. Per rendere l'auto-apprendimento
// affidabile aggiungiamo anche questo controllo deterministico: dopo ogni
// scambio, una chiamata leggera e separata chiede al modello se c'è qualcosa
// da ricordare, e se sì lo salviamo direttamente (senza passare dal tool
// loop). Le due strade sono complementari, non in conflitto: se il modello ha
// già chiamato remember_note in modo corretto durante il turno, questo
// controllo viene saltato.
const MEMORY_CLASSIFIER_PROMPT =
  "Sei un classificatore silenzioso. Leggi lo scambio tra utente e assistente qui sotto. " +
  "Se contiene un'informazione che vale la pena ricordare in modo permanente per le conversazioni future " +
  "(una preferenza personale dell'utente, un fatto su di sé, una correzione, una convenzione da rispettare), " +
  'rispondi SOLO con una riga nel formato: MEMORIZE: <nota breve, in terza persona, es. "L\'utente si chiama Marco e ha una Ducati Multistrada 2021">. ' +
  "Se non c'è nulla di rilevante da ricordare, rispondi SOLO con: NONE. Non aggiungere altro testo, non commentare.";

async function maybeAutoRemember(userInput: string, assistantReply: string): Promise<void> {
  try {
    const { content } = await horusChatRaw(
      [
        { role: "system", content: MEMORY_CLASSIFIER_PROMPT },
        { role: "user", content: `Utente: ${userInput}\nAssistente: ${assistantReply}` },
      ],
      { skipMemory: true, maxTokens: 80, timeoutMs: 150_000 }
    );
    const match = content.match(/MEMORIZE:\s*(.+)/is);
    if (match) {
      const note = match[1].trim();
      if (note) {
        appendHorusMemory(note);
        stdout.write(`🧠 [memorizzato: ${note}]\n`);
      }
    }
  } catch {
    // Best-effort: un fallimento della classificazione di memoria non deve
    // interrompere la chat né essere mostrato come errore all'utente.
  }
}

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
    try {
      let finalReply = "";
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let replied = "";
        const { content, toolCalls } = await horusChatRaw(history, {
          tools: HORUS_TOOLS,
          onToken: (token) => {
            stdout.write(token);
            replied += token;
          },
        });

        if (toolCalls.length === 0) {
          finalReply = content;
          if (!replied && content) stdout.write(content);
          break;
        }

        history.push({ role: "assistant", content, tool_calls: toolCalls });

        for (const call of toolCalls) {
          const toolName = call.function.name;
          stdout.write(`\n  ↳ [tool: ${toolName}(${JSON.stringify(call.function.arguments)})...] `);
          const result = await executeHorusTool(toolName, call.function.arguments);
          stdout.write("fatto\n");
          history.push({ role: "tool", name: toolName, content: result });
        }
        stdout.write("horus> ");
      }

      stdout.write("\n\n");
      if (finalReply) {
        history.push({ role: "assistant", content: finalReply });
        await maybeAutoRemember(userInput, finalReply);
      } else {
        // Troppe iterazioni di tool senza risposta finale: evita di sporcare la cronologia.
        console.error("⚠ Troppe chiamate a tool senza risposta finale.\n");
      }
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
