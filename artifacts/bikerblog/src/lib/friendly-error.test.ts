import { describe, it, expect } from "vitest";
import { friendlyChatErrorMessage } from "./friendly-error";

const CONNECTION_INTERRUPTED =
  "La risposta sta impiegando troppo tempo o la connessione con il server è stata interrotta. Riprova tra qualche istante.";

describe("friendlyChatErrorMessage", () => {
  it("returns an empty string on user abort (so the UI shows nothing)", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(friendlyChatErrorMessage(abort)).toBe("");
  });

  // Il bug centrale di Task #181: quando lo stream SSE del 2° messaggio va in
  // timeout sul tunnel, Chrome fa fallire reader.read() con
  // `TypeError: network error` — che NON contiene "fetch", quindi prima veniva
  // mostrato grezzo all'utente. Tutte le varianti per browser devono ora dare
  // il messaggio italiano, mai la stringa grezza inglese.
  it.each([
    ["Chrome mid-stream body interruption", "network error"],
    ["Chrome initial fetch failure", "Failed to fetch"],
    ["Firefox", "NetworkError when attempting to fetch resource."],
    ["Safari", "Load failed"],
  ])("maps the %s TypeError to the Italian connection message", (_label, message) => {
    const result = friendlyChatErrorMessage(new TypeError(message));
    expect(result).toBe(CONNECTION_INTERRUPTED);
    expect(result).not.toContain("network error");
    expect(result).not.toContain("Load failed");
  });

  it("maps a non-TypeError network-drop Error to the Italian connection message", () => {
    for (const msg of ["terminated", "other side closed", "fetch failed"]) {
      expect(friendlyChatErrorMessage(new Error(msg))).toBe(CONNECTION_INTERRUPTED);
    }
  });

  it("maps gateway-timeout HTTP statuses to the timeout message", () => {
    for (const status of [408, 504, 524]) {
      expect(friendlyChatErrorMessage(new Error(`HTTP ${status}`))).toBe(
        "Il server ha impiegato troppo tempo a rispondere (timeout). Riprova tra qualche istante."
      );
    }
  });

  it("maps other 5xx HTTP statuses to the temporary-error message", () => {
    expect(friendlyChatErrorMessage(new Error("HTTP 500"))).toBe(
      "Il server ha risposto con un errore temporaneo. Riprova tra qualche istante."
    );
  });

  it("passes through an already-friendly Italian server message unchanged", () => {
    const serverMsg =
      "Horus non ha risposto in tempo: la richiesta è stata interrotta dal tunnel. Riprova.";
    expect(friendlyChatErrorMessage(new Error(serverMsg))).toBe(serverMsg);
  });

  it("returns a generic connection message for non-Error values", () => {
    expect(friendlyChatErrorMessage("boom")).toBe(
      "Errore di connessione. Riprova tra qualche istante."
    );
  });
});
