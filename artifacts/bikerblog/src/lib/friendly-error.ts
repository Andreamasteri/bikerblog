/**
 * Traduce un errore di fetch/stream in un messaggio comprensibile per
 * l'utente finale della chat Horus/Bowie. Il tunnel Cloudflare verso il
 * server dell'utente ("TC") può chiudere connessioni lunghe (>~100s) prima
 * che Ollama finisca di generare: senza questo helper l'utente vedeva il
 * messaggio grezzo del browser ("Failed to fetch"), che non spiega cosa sia
 * successo né cosa fare.
 */
const CONNECTION_INTERRUPTED_MESSAGE =
  "La risposta sta impiegando troppo tempo o la connessione con il server è stata interrotta. Riprova tra qualche istante.";

// Un'interruzione di rete a basso livello del browser (fetch fallita o, più
// spesso qui, lo stream SSE del body chiuso a metà dal tunnel Cloudflare
// durante una generazione lunga) arriva SEMPRE come TypeError, ma il testo del
// messaggio cambia per browser e per momento del fallimento — e nessuna di
// queste stringhe grezze è adatta all'utente finale:
//   - Chrome, connessione iniziale fallita:          "Failed to fetch"
//   - Chrome, stream del body interrotto a metà:     "network error"
//   - Firefox:                    "NetworkError when attempting to fetch resource."
//   - Safari:                                        "Load failed"
// Alcuni drop del tunnel a metà stream arrivano invece come Error generico
// (non TypeError) con un messaggio comunque grezzo/inglese ("terminated",
// "other side closed", "fetch failed"). Questa regex copre entrambi i casi
// non-TypeError.
const RAW_NETWORK_ERROR_RE =
  /network\s?error|failed to fetch|load failed|terminated|other side closed|fetch failed|connection (?:reset|closed|refused|aborted)/i;

export function friendlyChatErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "";
  }

  // Prima il fix intercettava solo i TypeError con "fetch" nel messaggio, così
  // il "network error" di Chrome (stream del body interrotto a metà, sul 2°
  // messaggio che va in timeout sul tunnel) e il "Load failed" di Safari
  // finivano mostrati grezzi all'utente. In una chat via fetch+SSE ogni
  // TypeError è di fatto un'interruzione di rete/timeout, non un bug di
  // programmazione da esporre: trattali tutti allo stesso modo.
  if (err instanceof TypeError) {
    return CONNECTION_INTERRUPTED_MESSAGE;
  }

  if (err instanceof Error) {
    const match = /HTTP (\d+)/.exec(err.message);
    if (match) {
      const status = Number(match[1]);
      if (status === 504 || status === 524 || status === 408) {
        return "Il server ha impiegato troppo tempo a rispondere (timeout). Riprova tra qualche istante.";
      }
      if (status >= 500) {
        return "Il server ha risposto con un errore temporaneo. Riprova tra qualche istante.";
      }
    }
    if (RAW_NETWORK_ERROR_RE.test(err.message)) {
      return CONNECTION_INTERRUPTED_MESSAGE;
    }
    return err.message;
  }

  return "Errore di connessione. Riprova tra qualche istante.";
}
