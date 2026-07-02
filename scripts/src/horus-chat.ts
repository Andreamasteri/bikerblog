#!/usr/bin/env tsx
/**
 * horus-chat — CLI interattiva per chattare direttamente con Horus dal terminale.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run horus:chat
 *
 * Comandi durante la chat:
 *   /reset   — svuota la cronologia della conversazione corrente
 *   /exit    — esce (anche Ctrl+D quando non c'è una richiesta in corso)
 *   Ctrl+C   — se Horus sta rispondendo o eseguendo un tool (es. architect,
 *              che può richiedere alcuni minuti su hardware CPU), interrompe
 *              solo la richiesta in corso e torna al prompt; se non c'è
 *              nulla in corso, esce dalla chat come prima.
 *
 * Nota: usa la stessa memoria persistente (inbox/horus-memory.md) di tutte
 * le altre chiamate a Horus, quindi eredita le note/correzioni già salvate.
 * Le note scritte durante questa chat NON vengono salvate automaticamente
 * in memoria — per farlo usa `pnpm --filter @workspace/scripts run horus:remember`.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  horusChatRaw,
  appendHorusMemory,
  getHorusTools,
  executeHorusTool,
  type HorusMessage,
} from "@workspace/horus";

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
    "anche se non te lo chiede esplicitamente con un comando — non serve chiedere conferma, salvala e basta; " +
    "se disponibili, hai anche typecheck_repo, lint_repo, search_code e git_log: usali quando ti chiedono di trovare errori, bug, typo o problemi nel codice, o di cercare un pattern in tutto il repo — " +
    "sono analisi statica REALE (tsc/eslint/grep eseguiti davvero), non una tua stima. Se questi tool non compaiono nella lista disponibile, di' esplicitamente che l'analisi statica del codice non è configurata in questo momento, invece di rispondere con un generico disclaimer da 'modello linguistico'. " +
    "Se disponibile, hai anche architect: usalo (non i tool leggeri sopra) quando ti chiedono un'analisi architetturale approfondita, di pianificare l'implementazione di una feature/modifica non banale, o di trovare la causa radice di un bug complesso — passagli i percorsi dei file più rilevanti come contesto quando li conosci. È solo analisi (mai scrittura/esecuzione di codice) e può richiedere qualche minuto: avvisa l'utente che ci vorrà un po' prima di invocarlo.",
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

// Impostato solo mentre c'è una richiesta a Horus (o un tool) in corso, in
// modo che l'handler di Ctrl+C sappia se deve annullare la richiesta o
// uscire dal programma. `null` significa "nessuna richiesta attiva".
let activeRequestController: AbortController | null = null;

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

  // Comportamento di default: se non c'è nessuna richiesta in corso, Ctrl+C
  // esce dalla chat esattamente come prima (readline chiude e usciamo dal
  // ciclo). Se invece c'è una richiesta/tool in corso, la interrompiamo e
  // torniamo al prompt invece di far crashare/uscire il processo.
  process.on("SIGINT", () => {
    if (activeRequestController) {
      activeRequestController.abort();
      return;
    }
    rl.close();
  });

  console.log("🔥 Horus — chat interattiva (bikerlink:latest)");
  console.log(
    '   Comandi: "/reset" per svuotare la cronologia, "/exit" per uscire, Ctrl+C per interrompere una risposta in corso.\n'
  );

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

    // Un nuovo AbortController per ogni turno: se l'utente preme Ctrl+C
    // mentre questo turno è in corso, la richiesta a Horus (o il tool in
    // esecuzione) viene interrotta senza chiudere la chat.
    const requestController = new AbortController();
    activeRequestController = requestController;

    stdout.write("horus> ");
    try {
      let finalReply = "";
      for (
        let iteration = 0;
        iteration < MAX_TOOL_ITERATIONS && !requestController.signal.aborted;
        iteration++
      ) {
        let replied = "";
        const { content, toolCalls } = await horusChatRaw(history, {
          tools: getHorusTools(),
          signal: requestController.signal,
          onToken: (token) => {
            stdout.write(token);
            replied += token;
          },
        });

        if (requestController.signal.aborted) break;

        if (toolCalls.length === 0) {
          finalReply = content;
          if (!replied && content) stdout.write(content);
          break;
        }

        history.push({ role: "assistant", content, tool_calls: toolCalls });

        for (const call of toolCalls) {
          if (requestController.signal.aborted) break;

          const toolName = call.function.name;
          stdout.write(`\n  ↳ [tool: ${toolName}(${JSON.stringify(call.function.arguments)})...] `);

          // Tool come architect possono girare per diversi minuti su
          // hardware CPU: senza un segnale periodico il terminale sembra
          // bloccato. Stampiamo un promemoria con il tempo trascorso finché
          // il tool non ha terminato.
          const toolStartedAt = Date.now();
          const progressTimer = setInterval(() => {
            const elapsedSec = Math.round((Date.now() - toolStartedAt) / 1000);
            stdout.write(`(ancora al lavoro… ${elapsedSec}s) `);
          }, 10_000);

          let result: string;
          try {
            result = await executeHorusTool(toolName, call.function.arguments, requestController.signal);
          } finally {
            clearInterval(progressTimer);
          }

          if (requestController.signal.aborted) {
            stdout.write("interrotto\n");
            break;
          }

          stdout.write("fatto\n");
          history.push({ role: "tool", name: toolName, content: result });
        }
        if (!requestController.signal.aborted) stdout.write("horus> ");
      }

      if (requestController.signal.aborted) {
        stdout.write("\n\n⚠ Interrotto dall'utente (Ctrl+C).\n\n");
        // Rimuove il messaggio utente del turno interrotto per non sporcare
        // la cronologia con una risposta parziale/mancante.
        history.pop();
      } else {
        stdout.write("\n\n");
        if (finalReply) {
          history.push({ role: "assistant", content: finalReply });
          await maybeAutoRemember(userInput, finalReply);
        } else {
          // Troppe iterazioni di tool senza risposta finale: evita di sporcare la cronologia.
          console.error("⚠ Troppe chiamate a tool senza risposta finale.\n");
        }
      }
    } catch (err) {
      if (requestController.signal.aborted) {
        stdout.write("\n\n⚠ Interrotto dall'utente (Ctrl+C).\n\n");
      } else {
        console.error(
          `\n⚠ Errore: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
      // Rimuove il messaggio utente fallito per non sporcare la cronologia.
      history.pop();
    } finally {
      activeRequestController = null;
    }
  }

  rl.close();
  console.log("\n👋 Chat terminata.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
