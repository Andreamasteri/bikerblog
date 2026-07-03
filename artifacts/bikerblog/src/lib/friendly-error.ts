/**
 * Traduce un errore di fetch/stream in un messaggio comprensibile per
 * l'utente finale della chat Horus/Bowie. Il tunnel Cloudflare verso il
 * server dell'utente ("TC") può chiudere connessioni lunghe (>~100s) prima
 * che Ollama finisca di generare: senza questo helper l'utente vedeva il
 * messaggio grezzo del browser ("Failed to fetch"), che non spiega cosa sia
 * successo né cosa fare.
 */
export function friendlyChatErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "";
  }

  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return "La risposta sta impiegando troppo tempo o la connessione con il server è stata interrotta. Riprova tra qualche istante.";
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
    return err.message;
  }

  return "Errore di connessione. Riprova tra qualche istante.";
}
