import type { RequestHandler } from "express";
import type { HorusConversationTurn } from "@workspace/db";

/**
 * Handler estraibile e testabile per `GET /_internal/nadir-export`.
 *
 * Come `createDirectChatHandler` (routes/horus.ts), separiamo la logica della
 * rotta dalle sue dipendenze reali (token interno, lettura del manuale su
 * disco, query al DB) tramite dependency injection, così il test di
 * regressione può verificare il gating dell'auth (401) e la forma della
 * risposta ({manual, conversations, comments}) senza aprire una connessione
 * Postgres reale né toccare il filesystem. Il modulo importa solo TIPI da
 * `@workspace/db` (cancellati a runtime), quindi importarlo non istanzia il
 * pool del DB.
 */

export interface NadirConversationRow {
  id: number;
  topic: string;
  transcript: HorusConversationTurn[];
  status: "complete" | "interrupted";
  createdAt: Date;
}

export interface NadirCommentRow {
  id: number;
  authorName: string;
  body: string;
  createdAt: Date;
  likeCount: number;
  postSlug: string | null;
  postTitle: string | null;
}

export interface NadirExportDeps {
  /** Token interno atteso nell'header Authorization (Bearer). */
  getToken: () => string | undefined;
  /** Legge il "manuale" testuale; stringa vuota se assente. */
  readManual: () => string;
  fetchConversations: (limit: number) => Promise<NadirConversationRow[]>;
  fetchComments: (limit: number) => Promise<NadirCommentRow[]>;
  defaultConversations: number;
  maxConversations: number;
  defaultComments: number;
  maxComments: number;
  /** Sostituibile nei test per un timestamp deterministico. */
  now?: () => Date;
}

export function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function createNadirExportHandler(deps: NadirExportDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const token = deps.getToken();
    const auth = req.headers.authorization;
    if (!token || auth !== `Bearer ${token}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const conversationLimit = clampLimit(
      req.query["conversations"],
      deps.defaultConversations,
      deps.maxConversations,
    );
    const commentLimit = clampLimit(
      req.query["comments"],
      deps.defaultComments,
      deps.maxComments,
    );

    try {
      const manual = deps.readManual();

      const conversationRows = await deps.fetchConversations(conversationLimit);
      const conversations = conversationRows.map((row) => ({
        id: row.id,
        topic: row.topic,
        status: row.status,
        createdAt: row.createdAt,
        turns: row.transcript.map((t) => ({
          agent: t.agent,
          content: t.content,
        })),
      }));

      const comments = await deps.fetchComments(commentLimit);

      res.json({
        generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
        manual,
        conversations,
        comments,
      });
    } catch (err) {
      req.log.error({ err }, "nadir-export failed");
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
