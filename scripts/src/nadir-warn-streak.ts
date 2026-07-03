/**
 * nadir-warn-streak — conta da quante notti consecutive lo step 7.5 della
 * pipeline (Nadir semantic reindex) è in "warn".
 *
 * Un singolo guasto transitorio (Nadir irraggiungibile per una notte) resta
 * tollerato: lo step è "warn" ma non genera alert. Se però Nadir resta
 * irraggiungibile per più notti di fila l'indice di ricerca si ferma
 * silenziosamente e nessuno se ne accorge. Questo helper legge lo storico già
 * scritto su disco (`inbox/pipeline-history/*.json`) — nessuno stato aggiuntivo,
 * nessuna tabella DB — così la serie è ricostruita in modo idempotente ad ogni
 * run.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type StepStatus = "ok" | "warn" | "skipped" | "failed";

interface HistoryReport {
  date?: string;
  steps?: Array<{ step: number; status: StepStatus }>;
}

/** Step number of the Nadir semantic reindex step in the pipeline report. */
const NADIR_STEP = 7.5;

/**
 * Ritorna la lunghezza della serie di "warn" consecutivi dello step 7.5,
 * inclusa la run corrente passata come `currentStatus`.
 *
 * - Se la run corrente non è in "warn" ritorna 0 (nessuna serie in corso).
 * - Una singola notte in "warn" ritorna 1.
 * - La serie si interrompe al primo report precedente il cui step 7.5 non è
 *   "warn" (ok/skipped/failed/mancante) oppure è illeggibile: un reindex
 *   riuscito azzera lo stato di staleness.
 *
 * `currentDate` viene ignorato nello storico perché la run corrente è già
 * contata in memoria (il suo report viene scritto solo a fine pipeline, ma un
 * eventuale ri-run dello stesso giorno non deve contare due volte).
 */
export function nadirWarnStreak(
  currentStatus: StepStatus,
  currentDate: string,
  historyDir: string
): number {
  if (currentStatus !== "warn") return 0;

  let streak = 1;
  if (!existsSync(historyDir)) return streak;

  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  for (const f of files) {
    const date = f.replace(/\.json$/, "");
    if (date === currentDate) continue;

    let report: HistoryReport;
    try {
      report = JSON.parse(
        readFileSync(resolve(historyDir, f), "utf-8")
      ) as HistoryReport;
    } catch {
      break; // report illeggibile: interrompi la serie in modo conservativo
    }

    const step = report.steps?.find((s) => s.step === NADIR_STEP);
    if (step?.status === "warn") {
      streak++;
    } else {
      break; // ok/skipped/failed/mancante: serie interrotta
    }
  }

  return streak;
}
