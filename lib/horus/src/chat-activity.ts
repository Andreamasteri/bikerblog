/**
 * Registro in-process delle sessioni di chat ATTIVE (Task #222, Fase 2d power).
 *
 * Il coder pesante on-demand (vedi `ares.ts`, modalità coder) sfratta la lineup
 * residente (Horus/Bowie/Quebracho/Nadir) per entrare in VRAM. L'eviction è
 * "gated": NON deve mai interrompere una conversazione in corso. Questo modulo
 * è il segnale di via libera autoritativo: ogni handler di chat streaming
 * (chat diretta, conversazione a tre) apre una "attività" all'inizio del turno
 * e la chiude nel `finally`. Il gate del coder legge `isChatActive()` PRIMA di
 * toccare la GPU e, se c'è una chat in corso, rifiuta il ciclo senza sfrattare
 * nulla.
 *
 * È volutamente in-process: l'api-server è un singolo processo e orchestra sia
 * gli handler di chat sia il ciclo del coder, quindi lo stato è condiviso senza
 * bisogno di persistenza. Gli altri processi (es. il loop notturno di Quebracho
 * negli script) NON leggono questo modulo direttamente: consultano lo stato via
 * l'endpoint `GET /_internal/coder/status`, così i due lati concordano su "chi
 * sta girando" (dipendenza dichiarata del task) invece di dedurlo ognuno per sé.
 */

let activeCount = 0;
let lastActivityAt = 0;

/**
 * Segna l'inizio di un turno di chat attivo e restituisce una funzione di
 * rilascio idempotente (chiamarla più volte è un no-op). Chiamare SEMPRE il
 * release nel `finally` dell'handler, così una disconnessione o un errore non
 * lascia il contatore "appeso" e non blocca per sempre il coder.
 */
export function beginChatActivity(): () => void {
  activeCount += 1;
  lastActivityAt = Date.now();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCount = Math.max(0, activeCount - 1);
    lastActivityAt = Date.now();
  };
}

/** True se c'è almeno una sessione di chat attualmente in corso. */
export function isChatActive(): boolean {
  return activeCount > 0;
}

/**
 * Millisecondi trascorsi dall'ultima attività di chat. 0 se una chat è in corso
 * ora (attività "in questo istante"); +Infinity se non c'è mai stata attività
 * dall'avvio del processo (nessuna chat da sfrattare → via libera immediata).
 */
export function chatIdleMs(): number {
  if (activeCount > 0) return 0;
  if (lastActivityAt === 0) return Number.POSITIVE_INFINITY;
  return Date.now() - lastActivityAt;
}

/** Snapshot dello stato di attività (per l'endpoint di stato condiviso). */
export function getChatActivitySnapshot(): { activeCount: number; lastActivityAt: number | null } {
  return { activeCount, lastActivityAt: lastActivityAt || null };
}

/** Reset del registro — solo per i test (lo stato è a livello di modulo). */
export function __resetChatActivityForTests(): void {
  activeCount = 0;
  lastActivityAt = 0;
}
