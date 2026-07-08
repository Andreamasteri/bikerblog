/**
 * nadir-search-smoke — verifica che Nadir stia davvero servendo ricerche
 * semantiche in produzione, non solo che l'indicizzazione notturna (step 7.5,
 * `reindex-nadir.ts`) sia andata a buon fine.
 *
 * Motivazione (Task #147): oggi, se Nadir va giù dopo un reindex riuscito (o
 * non è mai stato raggiungibile per /search pur avendo NADIR_URL/
 * NADIR_GATE_TOKEN configurati), `search_manual` restituisce silenziosamente
 * una stringa di errore "amichevole" all'agente (Horus/Bowie) — nessun
 * operatore se ne accorge. Questo check colpisce lo stesso endpoint /search
 * usato da `callNadirService` (vedi `lib/horus/src/tools.ts`) con una query
 * innocua, così un'interruzione diventa un alert invece di un degrado muto.
 *
 * Task #153: oltre a verificare HTTP 200 e l'assenza di {error}, controlla
 * anche che la risposta contenga un campo `result` non vuoto. Un Nadir
 * degradato (indice svuotato, modello di embedding rotto, risposta garbage)
 * passa la verifica HTTP ma non quella del contenuto — e deve comunque
 * generare un warn.
 *
 * Stessa tolleranza degli altri step opzionali della pipeline:
 *   - env non configurate → "skipped" (nessun fetch, nessun alert)
 *   - HTTP error, body {error}, network throw, timeout → "warn" (mai throw)
 *   - risposta valida ma senza risultati → "warn"
 *   - risposta valida con risultati non vuoti → "ok"
 *
 * Il chiamante (`run-cluster-daily.ts`) decide se instradare "warn" verso
 * `sendPipelineAlert`, esattamente come fa già per il check SSE di
 * Horus/Bowie (step 9).
 */

export interface NadirSearchSmokeResult {
  status: "ok" | "skipped" | "warn";
  detail: string;
}

const SMOKE_QUERY = "moto";
const SEARCH_TIMEOUT_MS = 15_000;

/**
 * Chiama POST /search su Nadir con una query di prova. Non lancia mai:
 * ogni percorso (env mancanti, HTTP error, body {error}, risultati vuoti,
 * network throw, timeout) ritorna un NadirSearchSmokeResult, così un'outage
 * o un degrado di Nadir non può far fallire la pipeline notturna — può solo
 * generare un warning che il chiamante instrada verso l'alert.
 */
export async function checkNadirSearch(): Promise<NadirSearchSmokeResult> {
  const baseUrl = process.env["NADIR_URL"];
  const gateToken = process.env["NADIR_GATE_TOKEN"];
  if (!baseUrl || !gateToken) {
    return { status: "skipped", detail: "NADIR_URL/NADIR_GATE_TOKEN non configurati" };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nadir-Gate-Token": gateToken,
      },
      body: JSON.stringify({ query: SMOKE_QUERY, limit: 1 }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || data.error) {
      return {
        status: "warn",
        detail: `Nadir /search ha risposto con errore (HTTP ${res.status}): ${data.error ?? "errore sconosciuto"}`,
      };
    }
    // Verify the response actually contains a plausible (non-empty) result.
    // A degraded Nadir (empty index, broken embedding model, garbage response)
    // can return HTTP 200 with no useful content — that must also be a warn.
    if (typeof data.result !== "string" || data.result.trim().length === 0) {
      return {
        status: "warn",
        detail: `Nadir /search ha risposto con HTTP 200 ma senza risultati utili per la query di prova "${SMOKE_QUERY}" (result: ${JSON.stringify(data.result)})`,
      };
    }
    return { status: "ok", detail: "Nadir /search ha risposto correttamente alla query di prova" };
  } catch (err) {
    return {
      status: "warn",
      detail: `Nadir /search irraggiungibile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
