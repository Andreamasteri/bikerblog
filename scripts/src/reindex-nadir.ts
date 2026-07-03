/**
 * reindex-nadir — helper per lo step 7.5 della pipeline notturna.
 *
 * Estratto da run-cluster-daily.ts in un modulo separato così può essere
 * importato dai test senza eseguire l'intera pipeline (che gira a livello
 * top-level in run-cluster-daily.ts).
 */

export interface NadirReindexResult {
  status: "ok" | "skipped" | "warn";
  detail: string;
}

/**
 * Chiama POST /reindex su Nadir per ricostruire l'indice semantico dai
 * contenuti pubblicati. Tollerante come gli altri step opzionali: se
 * NADIR_URL/NADIR_GATE_TOKEN non sono configurati lo step è "skipped"; se
 * Nadir è irraggiungibile o risponde con errore è "warn" (non blocca la
 * pipeline, non genera alert). Il servizio scrive heartbeat di spazi bianchi
 * durante il lavoro (ignorati da JSON.parse), quindi res.json() gestisce
 * comunque il body finale anche per reindicizzazioni lunghe.
 *
 * Contratto garantito (vedi reindex-nadir.test.ts): questa funzione non lancia
 * MAI. Ogni percorso — env mancanti, HTTP error, body {error}, network throw,
 * timeout — ritorna un NadirReindexResult, così un'outage di Nadir non può
 * far fallire la pipeline notturna.
 */
export async function reindexNadir(): Promise<NadirReindexResult> {
  const baseUrl = process.env["NADIR_URL"];
  const gateToken = process.env["NADIR_GATE_TOKEN"];
  if (!baseUrl || !gateToken) {
    return { status: "skipped", detail: "NADIR_URL/NADIR_GATE_TOKEN non configurati" };
  }

  // 5 min: l'embedding di tutti i documenti può essere lento; il tunnel resta
  // vivo grazie agli heartbeat scritti da Nadir durante il lavoro.
  const REINDEX_TIMEOUT_MS = 5 * 60 * 1000;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/reindex`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nadir-Gate-Token": gateToken,
      },
      body: "{}",
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: { indexed?: number };
      error?: string;
    };
    if (!res.ok || data.error) {
      return {
        status: "warn",
        detail: `Nadir /reindex ha risposto con errore (HTTP ${res.status}): ${data.error ?? "errore sconosciuto"}`,
      };
    }
    const indexed = data.result?.indexed ?? 0;
    return { status: "ok", detail: `indice ricostruito — ${indexed} documenti` };
  } catch (err) {
    return {
      status: "warn",
      detail: `Nadir /reindex irraggiungibile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
