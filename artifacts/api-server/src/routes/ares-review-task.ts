/**
 * Factory `createAresReviewTaskHandler` — estratta da internal.ts per
 * consentire i test senza aprire Postgres, GCS o il TC reale.
 *
 * Il router internal.ts la monta direttamente con le dipendenze reali;
 * il test la usa con stub iniettati via deps.
 */
import express from "express";
import path from "path";
import type { AresTaskReviewResult } from "@workspace/horus";

export interface AresReviewTaskDeps {
  /** Restituisce il token interno attivo, o `undefined` se non configurato. */
  getToken: () => string | undefined;
  isAresConfigured: () => boolean;
  isAresRunning: () => boolean;
  runAresTaskReview: (content: string) => Promise<AresTaskReviewResult>;
  aresModel: () => string;
  /** Valore di `ARES_BUSY_MESSAGE` (stringa esatta, confrontata con `===`). */
  aresIsBusy: string;
  /** Path assoluto della directory .local/tasks/ (anti-traversal root). */
  tasksDir: string;
  fileExists: (p: string) => boolean;
  readFile: (p: string) => string;
}

export function createAresReviewTaskHandler(deps: AresReviewTaskDeps): express.RequestHandler {
  return async (req, res): Promise<void> => {
    const token = deps.getToken();
    const auth = req.headers.authorization;
    if (!token || auth !== `Bearer ${token}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!deps.isAresConfigured()) {
      res.status(503).json({ error: "Ares non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)" });
      return;
    }
    if (deps.isAresRunning()) {
      res.status(409).json({ error: "un ciclo Ares è già in corso" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawContent = typeof body["taskContent"] === "string" ? body["taskContent"] : undefined;
    const taskFile = typeof body["taskFile"] === "string" ? body["taskFile"] : undefined;

    if (!rawContent && !taskFile) {
      res.status(400).json({ error: "richiesto taskContent (stringa) oppure taskFile (path relativo)" });
      return;
    }

    let taskContent = rawContent ?? "";
    if (taskFile) {
      const resolved = path.resolve(deps.tasksDir, taskFile);
      if (resolved !== deps.tasksDir && !resolved.startsWith(deps.tasksDir + path.sep)) {
        res.status(400).json({ error: "taskFile deve essere sotto .local/tasks/" });
        return;
      }
      if (!deps.fileExists(resolved)) {
        res.status(404).json({ error: "taskFile non trovato" });
        return;
      }
      try {
        taskContent = deps.readFile(resolved);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }

    if (taskContent.trim().length === 0) {
      res.status(400).json({ error: "task plan vuoto" });
      return;
    }

    const log = (req as unknown as { log: Record<string, (...args: unknown[]) => void> }).log;
    log.info({ taskFile, model: deps.aresModel() }, "ares review-task triggered");
    try {
      const review = await deps.runAresTaskReview(taskContent);
      if (!review.ok) {
        log.warn({ error: review.error }, "ares review-task failed");
        const status = review.error === deps.aresIsBusy ? 409 : 502;
        res.status(status).json({ review, restoreOk: review.restoreFailures.length === 0 });
        return;
      }
      if (review.restoreFailures.length > 0) {
        log.error({ restoreFailures: review.restoreFailures }, "ares restore incompleto: lineup residente da controllare");
      }
      log.info({ snapshot: review.snapshot }, "ares review-task completed");
      res.json({ review, restoreOk: review.restoreFailures.length === 0 });
    } catch (err) {
      log.error({ err }, "ares review-task threw");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
