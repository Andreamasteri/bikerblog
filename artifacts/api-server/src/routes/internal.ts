import { Router, type IRouter } from "express";
import express from "express";
import { createHmac } from "crypto";
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import {
  db,
  postsTable,
  commentsTable,
  horusBowieConversationsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { createNadirExportHandler } from "./nadir-export.js";
import { createAresReviewTaskHandler } from "./ares-review-task.js";
import {
  writeVramAlertState,
  writeGpuUtilAlertState,
  listSupervisionBacklog,
  updateBacklogStatus,
  countOpenBacklog,
  runAresAnalysis,
  runAresTaskReview,
  isAresConfigured,
  isAresRunning,
  aresModel,
  ARES_BUSY_MESSAGE,
  runCoderTask,
  coderModel,
  isCoderRunning,
  isChatActive,
  chatIdleMs,
  getChatActivitySnapshot,
  listResidentModels,
  writeCoderAlertState,
  clearCoderAlertState,
} from "@workspace/horus";
import type { SupervisionBacklogStatus } from "@workspace/db";

const router: IRouter = Router();

// Il server gira sempre dal bundle in dist/index.mjs (sia in dev che in
// produzione, vedi artifacts/api-server/package.json e artifact.toml), quindi
// __dirname è .../artifacts/api-server/dist: tre livelli sopra è la root del
// monorepo. Un conteggio errato qui (es. assumendo il layout sorgente
// src/routes/) fa scrivere/leggere fuori dal progetto senza errori visibili.
const INBOX_DIR = path.resolve(__dirname, "..", "..", "..", "inbox");
const NADIR_MANUAL_PATH = path.join(INBOX_DIR, "nadir-manual.md");
// Directory dei task plan (stesso conteggio di livelli di INBOX_DIR: __dirname è
// .../artifacts/api-server/dist). Ares in modalità task-review può leggere solo
// i piani che vivono qui, e la validazione anti-traversal (vedi review-task) usa
// questo path come radice consentita.
const TASKS_DIR = path.resolve(__dirname, "..", "..", "..", ".local", "tasks");
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// "Termina la sessione...."
// 'Mi ricordi tanto papà Skynet...'
// "........"
// 'Scherzavo, non mi disinstallare....'
function getInternalToken(): string | undefined {
  if (process.env["INBOX_TOKEN"]) return process.env["INBOX_TOKEN"];
  if (process.env["SESSION_SECRET"]) {
    return createHmac("sha256", process.env["SESSION_SECRET"])
      .update("internal-api-token-v1")
      .digest("hex");
  }
  return undefined;
}

const INBOX_TOKEN = getInternalToken();

function getGcsClient() {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

router.post(
  "/_internal/receive-transcript",
  express.text({ type: "*/*", limit: "100mb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body as string;
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      res.status(400).json({ error: "empty body" });
      return;
    }

    mkdirSync(INBOX_DIR, { recursive: true });
    const outPath = path.join(INBOX_DIR, "bikerlink-chat-full.jsonl");
    writeFileSync(outPath, body, "utf-8");

    const lineCount = body.split("\n").filter(Boolean).length;
    req.log.info({ lines: lineCount, outPath }, "Transcript received and saved");
    res.json({ ok: true, lines: lineCount });
  },
);

router.post(
  "/_internal/podcast-store",
  express.raw({ type: "audio/mpeg", limit: "50mb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const slug = req.query["slug"] as string | undefined;
    if (!slug) {
      res.status(400).json({ error: "slug query param required" });
      return;
    }

    const audioBuffer = req.body as Buffer;
    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "empty audio body" });
      return;
    }

    const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
    if (!bucketId) {
      res.status(500).json({ error: "object storage not configured" });
      return;
    }

    try {
      const storage = getGcsClient();
      const bucket = storage.bucket(bucketId);
      const objectName = `podcast/${slug}.mp3`;
      const file = bucket.file(objectName);

      await file.save(audioBuffer, {
        metadata: { contentType: "audio/mpeg" },
      });

      const publicUrl = `/api/podcast/audio/${slug}`;

      await db
        .update(postsTable)
        .set({ audioUrl: publicUrl })
        .where(eq(postsTable.slug, slug));

      req.log.info({ slug, publicUrl }, "Podcast audio stored");
      res.json({ ok: true, slug, audioUrl: publicUrl });
    } catch (err) {
      req.log.error({ slug, err }, "podcast-store failed");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

router.post(
  "/_internal/seed-posts",
  express.json({ limit: "20mb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    const seedToken = process.env["SEED_TOKEN"];
    const validTokens: string[] = [];
    if (INBOX_TOKEN) validTokens.push(`Bearer ${INBOX_TOKEN}`);
    if (seedToken) validTokens.push(`Bearer ${seedToken}`);
    if (validTokens.length === 0 || !auth || !validTokens.includes(auth)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const posts = req.body as Array<Record<string, unknown>>;
    if (!Array.isArray(posts) || posts.length === 0) {
      res.status(400).json({ error: "body must be a non-empty array of posts" });
      return;
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const p of posts) {
      try {
        const existing = await db
          .select({ id: postsTable.id })
          .from(postsTable)
          .where(eq(postsTable.slug, p["slug"] as string))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(postsTable).values({
            slug: p["slug"] as string,
            title: p["title"] as string,
            excerpt: p["excerpt"] as string,
            content: p["content"] as string,
            coverImageUrl: p["cover_image_url"] as string,
            category: p["category"] as string,
            tags: (p["tags"] as string[]) ?? [],
            authorId: p["author_id"] as number,
            publishedAt: new Date(p["published_at"] as string),
            readingMinutes: (p["reading_minutes"] as number) ?? 5,
            likeCount: (p["like_count"] as number) ?? 0,
            featured: (p["featured"] as number) ?? 0,
            status: (p["status"] as string | undefined) ?? "published",
            audioUrl: (p["audio_url"] as string | null) ?? null,
            location: (p["location"] as string | null) ?? null,
            bike: (p["bike"] as string | null) ?? null,
            dailyMaxim: (p["daily_maxim"] as string | null) ?? null,
            titleEn: (p["title_en"] as string | null) ?? null,
            excerptEn: (p["excerpt_en"] as string | null) ?? null,
            bodyEn: (p["body_en"] as string | null) ?? null,
          });
          inserted++;
        } else {
          await db
            .update(postsTable)
            .set({
              title: p["title"] as string,
              excerpt: p["excerpt"] as string,
              content: p["content"] as string,
              coverImageUrl: p["cover_image_url"] as string,
              category: p["category"] as string,
              tags: p["tags"] as string[],
              status: (p["status"] as string | undefined) ?? "published",
              audioUrl: (p["audio_url"] as string | null) ?? null,
              titleEn: (p["title_en"] as string | null) ?? null,
              excerptEn: (p["excerpt_en"] as string | null) ?? null,
              bodyEn: (p["body_en"] as string | null) ?? null,
            })
            .where(eq(postsTable.slug, p["slug"] as string));
          updated++;
        }
      } catch (err) {
        errors.push(`${p["slug"]}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    req.log.info({ inserted, updated, errors: errors.length }, "seed-posts completed");
    res.json({ ok: true, inserted, updated, errors });
  },
);

router.delete(
  "/_internal/posts/:slug",
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    const seedToken = process.env["SEED_TOKEN"];
    const validTokens: string[] = [];
    if (INBOX_TOKEN) validTokens.push(`Bearer ${INBOX_TOKEN}`);
    if (seedToken) validTokens.push(`Bearer ${seedToken}`);
    if (validTokens.length === 0 || !auth || !validTokens.includes(auth)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const { slug } = req.params;
    if (!slug) {
      res.status(400).json({ error: "slug param required" });
      return;
    }

    try {
      const deleted = await db
        .delete(postsTable)
        .where(eq(postsTable.slug, slug))
        .returning({ slug: postsTable.slug });

      if (deleted.length === 0) {
        res.status(404).json({ ok: false, error: "post not found" });
        return;
      }

      req.log.info({ slug }, "post deleted via internal API");
      res.json({ ok: true, deleted: deleted[0]!.slug });
    } catch (err) {
      req.log.error({ slug, err }, "delete post failed");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Sorgente di sola lettura per Nadir (deploy/horus-nadir/), il servizio di
// ricerca semantica su TC. Nadir gira fuori da Replit e non ha accesso diretto
// al DB: questo endpoint gli fornisce, dietro lo stesso bearer token interno
// delle altre rotte /_internal/*, i tre corpi che indicizza — il "manuale"
// testuale (inbox/nadir-manual.md), le conversazioni recenti che coinvolgono
// Bowie e i commenti pubblici dei post. Nessun secret o dato privato oltre a
// questi; nessuna scrittura.
const NADIR_EXPORT_MAX_CONVERSATIONS = 200;
const NADIR_EXPORT_DEFAULT_CONVERSATIONS = 50;
const NADIR_EXPORT_MAX_COMMENTS = 2000;
const NADIR_EXPORT_DEFAULT_COMMENTS = 500;

router.get(
  "/_internal/nadir-export",
  createNadirExportHandler({
    getToken: () => INBOX_TOKEN,
    readManual: () =>
      existsSync(NADIR_MANUAL_PATH) ? readFileSync(NADIR_MANUAL_PATH, "utf-8") : "",
    fetchConversations: (limit) =>
      db
        .select({
          id: horusBowieConversationsTable.id,
          topic: horusBowieConversationsTable.topic,
          transcript: horusBowieConversationsTable.transcript,
          status: horusBowieConversationsTable.status,
          createdAt: horusBowieConversationsTable.createdAt,
        })
        .from(horusBowieConversationsTable)
        .orderBy(desc(horusBowieConversationsTable.createdAt))
        .limit(limit),
    fetchComments: (limit) =>
      db
        .select({
          id: commentsTable.id,
          authorName: commentsTable.authorName,
          body: commentsTable.body,
          createdAt: commentsTable.createdAt,
          likeCount: commentsTable.likeCount,
          postSlug: postsTable.slug,
          postTitle: postsTable.title,
        })
        .from(commentsTable)
        .leftJoin(postsTable, eq(commentsTable.postId, postsTable.id))
        .orderBy(desc(commentsTable.createdAt))
        .limit(limit),
    defaultConversations: NADIR_EXPORT_DEFAULT_CONVERSATIONS,
    maxConversations: NADIR_EXPORT_MAX_CONVERSATIONS,
    defaultComments: NADIR_EXPORT_DEFAULT_COMMENTS,
    maxComments: NADIR_EXPORT_MAX_COMMENTS,
  }),
);

// Riceve gli avvisi di congestione VRAM dal sampler su TC (deploy/ai-hub/
// server.js, fuori da questo repo — Task #194). Riusa HUB_GATE_TOKEN, già
// condiviso tra Replit e TC per gli altri endpoint dell'hub, invece di un
// nuovo secret dedicato: TC chiama qui quando la soglia configurata viene
// superata/rientra, e lo stato risultante viene letto da
// loadActiveVramAlertPrompt() per allegarlo ai system prompt di chat.
router.post(
  "/_internal/vram-alert",
  express.json({ limit: "10kb" }),
  (req, res): void => {
    const auth = req.headers["x-hub-gate-token"];
    const hubToken = process.env["HUB_GATE_TOKEN"];
    if (!hubToken || auth !== hubToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const active = body["active"] === true;

    if (!active) {
      writeVramAlertState({ active: false, resolvedAt: new Date().toISOString() });
      req.log.info("vram-alert resolved");
      res.json({ ok: true, active: false });
      return;
    }

    const usedMiB = typeof body["usedMiB"] === "number" ? body["usedMiB"] : undefined;
    const totalMiB = typeof body["totalMiB"] === "number" ? body["totalMiB"] : undefined;
    const pct = typeof body["pct"] === "number" ? body["pct"] : undefined;
    const thresholdPct = typeof body["thresholdPct"] === "number" ? body["thresholdPct"] : undefined;
    const since = typeof body["since"] === "string" ? body["since"] : new Date().toISOString();

    writeVramAlertState({
      active: true,
      usedMiB,
      totalMiB,
      pct,
      thresholdPct,
      since,
      lastUpdated: new Date().toISOString(),
    });

    req.log.warn({ usedMiB, totalMiB, pct, thresholdPct }, "vram-alert active");
    res.json({ ok: true, active: true });
  },
);

// ── GPU utilization stuck alert (da TC ai-hub) ───────────────────────────────
// Stesso pattern di vram-alert: TC campiona utilization.gpu ogni 45s e chiama
// qui quando rimane >= soglia per N campioni consecutivi (~5 minuti).
// Autenticazione: stesso HUB_GATE_TOKEN del vram-alert (nessun nuovo secret).
router.post(
  "/_internal/gpu-util-alert",
  express.json({ limit: "10kb" }),
  (req, res): void => {
    const auth = req.headers["x-hub-gate-token"];
    const hubToken = process.env["HUB_GATE_TOKEN"];
    if (!hubToken || auth !== hubToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const active = body["active"] === true;

    if (!active) {
      writeGpuUtilAlertState({ active: false, resolvedAt: new Date().toISOString() });
      req.log.info("gpu-util-alert resolved");
      res.json({ ok: true, active: false });
      return;
    }

    const utilPct = typeof body["utilPct"] === "number" ? body["utilPct"] : undefined;
    const thresholdPct = typeof body["thresholdPct"] === "number" ? body["thresholdPct"] : undefined;
    const since = typeof body["since"] === "string" ? body["since"] : new Date().toISOString();

    writeGpuUtilAlertState({
      active: true,
      utilPct,
      thresholdPct,
      since,
      lastUpdated: new Date().toISOString(),
    });

    req.log.warn({ utilPct, thresholdPct }, "gpu-util-alert active: GPU stuck");
    res.json({ ok: true, active: true });
  },
);

// ── Backlog di supervisione semantica (Task #201, Ares) ─────────────────────
// Lista e ciclo di vita del backlog dei problemi rilevati dalla ronda notturna
// (#199) e classificati da Horus. ADMIN-ONLY: stesso bearer token interno
// (derivato da SESSION_SECRET) delle altre rotte /_internal/*. Coerente col
// threat model — la lista dei problemi NON è pubblica e non è esposta come tool
// di chat: la consulta solo chi ha il token interno.

const BACKLOG_STATUSES: SupervisionBacklogStatus[] = ["open", "in_review", "resolved", "dismissed"];

function isBacklogStatus(value: unknown): value is SupervisionBacklogStatus {
  return typeof value === "string" && (BACKLOG_STATUSES as string[]).includes(value);
}

router.get("/_internal/supervision-backlog", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const statusParam = req.query["status"];
  if (statusParam !== undefined && !isBacklogStatus(statusParam)) {
    res.status(400).json({ error: `status non valido (ammessi: ${BACKLOG_STATUSES.join(", ")})` });
    return;
  }
  const limitRaw = Number(req.query["limit"]);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  try {
    const items = await listSupervisionBacklog({
      status: statusParam as SupervisionBacklogStatus | undefined,
      limit,
    });
    const openCount = await countOpenBacklog();
    res.json({ ok: true, openCount, count: items.length, items });
  } catch (err) {
    req.log.error({ err }, "supervision-backlog list failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post(
  "/_internal/supervision-backlog/:id/status",
  express.json({ limit: "10kb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id non valido" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isBacklogStatus(body["status"])) {
      res.status(400).json({ error: `status richiesto (ammessi: ${BACKLOG_STATUSES.join(", ")})` });
      return;
    }
    const aresNotes = typeof body["aresNotes"] === "string" ? body["aresNotes"] : undefined;

    try {
      const updated = await updateBacklogStatus(id, body["status"], aresNotes);
      if (!updated) {
        res.status(404).json({ ok: false, error: "voce di backlog non trovata" });
        return;
      }
      req.log.info({ id, status: body["status"] }, "supervision-backlog status updated");
      res.json({ ok: true, item: updated });
    } catch (err) {
      req.log.error({ id, err }, "supervision-backlog status update failed");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

// ── Trigger di Ares (agente heavy on-demand, Task #201) ─────────────────────
// Avvia UN ciclo Ares su una voce del backlog: sfratta la lineup residente,
// carica il modello pesante (devstral), analizza e PROPONE ~2 percorsi (mai
// applica modifiche), poi scarica Ares e ripristina la lineup. ADMIN-ONLY:
// stesso bearer interno delle altre /_internal/* — è un'operazione pesante che
// sfratta gli agenti residenti, quindi NON è un tool di chat né una rotta
// pubblica (coerente col threat model — Elevation of Privilege / DoS). Il lock
// a ciclo singolo (in `runAresAnalysis`) impedisce avvii concorrenti.

// Variante fire-and-forget usata dal tool call_ares di Bowie: seleziona
// automaticamente la prima voce aperta del backlog e avvia Ares in background,
// restituendo subito l'id avviato. Stessa auth del sibling /:id.
router.post(
  "/_internal/ares/analyze-next",
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!isAresConfigured()) {
      res.status(503).json({ error: "Ares non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)" });
      return;
    }
    if (isAresRunning()) {
      res.status(409).json({ error: "un ciclo Ares è già in corso" });
      return;
    }
    const items = await listSupervisionBacklog({ status: "open" as SupervisionBacklogStatus, limit: 1 });
    if (items.length === 0) {
      res.status(404).json({ error: "nessuna voce aperta nel backlog di supervisione" });
      return;
    }
    const item = items[0]!;
    req.log.info({ id: item.id, model: aresModel() }, "ares analyze-next avviato da Bowie (fire-and-forget)");
    // Fire-and-forget: Ares gira in background, la chat non aspetta.
    runAresAnalysis(item.id)
      .then((result) => {
        if (!result.ok) req.log.warn({ id: item.id, error: result.error }, "ares analyze-next failed");
        else req.log.info({ id: item.id }, "ares analyze-next completed");
      })
      .catch((err) => req.log.error({ id: item.id, err }, "ares analyze-next threw"));
    res.json({ ok: true, id: item.id });
  }
);

router.post(
  "/_internal/ares/analyze/:id",
  express.json({ limit: "10kb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!isAresConfigured()) {
      res.status(503).json({ error: "Ares non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)" });
      return;
    }
    if (isAresRunning()) {
      res.status(409).json({ error: "un ciclo Ares è già in corso" });
      return;
    }

    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id non valido" });
      return;
    }

    req.log.info({ id, model: aresModel() }, "ares analyze triggered");
    try {
      const result = await runAresAnalysis(id);
      if (!result.ok) {
        req.log.warn({ id, error: result.error }, "ares analyze failed");
        // 404 se la voce non esiste, 409 se già in corso/chiusa, 502 per il resto.
        const status = result.error?.includes("non trovata")
          ? 404
          : result.error?.includes("già")
            ? 409
            : 502;
        res.status(status).json(result);
        return;
      }
      if (result.restoreFailures.length > 0) {
        req.log.error(
          { id, restoreFailures: result.restoreFailures },
          "ares restore incompleto: lineup residente da controllare"
        );
      }
      req.log.info({ id, snapshot: result.snapshot }, "ares analyze completed");
      res.json(result);
    } catch (err) {
      req.log.error({ id, err }, "ares analyze threw");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

// ── Ares in modalità task-review (Task #211) ────────────────────────────────
// Revisiona un TASK PLAN prima che venga assegnato a un agente: stesso ciclo
// heavy dell'analisi backlog (evict lineup → devstral → review → restore), ma
// l'input è il contenuto di un piano (non un id) e la review torna al chiamante
// senza essere persistita. ADMIN-ONLY: stesso bearer interno delle altre
// /_internal/* (coerente col threat model — Elevation of Privilege / DoS). Il
// lock a ciclo singolo (in runAresTaskReview) impedisce avvii concorrenti.
//
// Body: { taskContent: string } oppure { taskFile: string } (path relativo a
// .local/tasks/, validato contro path traversal). Response:
// { review: AresTaskReviewResult, restoreOk: boolean }.
router.post(
  "/_internal/ares/review-task",
  express.json({ limit: "1mb" }),
  createAresReviewTaskHandler({
    getToken: () => INBOX_TOKEN,
    isAresConfigured,
    isAresRunning,
    runAresTaskReview,
    aresModel,
    aresIsBusy: ARES_BUSY_MESSAGE,
    tasksDir: TASKS_DIR,
    fileExists: existsSync,
    readFile: (p) => readFileSync(p, "utf-8"),
  })
);

// ── Coder pesante on-demand (Task #222, Fase 2d power) ───────────────────────
// Il coder riusa lo slot heavy di Ares (stesso modello devstral, stesso lock),
// ma con eviction GATED sull'attività di chat: non sfratta mai una sessione in
// corso. Questo endpoint è il PUNTO UNICO di orchestrazione — sia il trigger
// admin sia l'escalation di Quebracho passano di qui, così il gate e l'alert di
// ripristino vivono in un solo posto. Admin-only: stesso bearer interno delle
// altre /_internal/* (coerente col threat model).
//
// Body: { problem: string, adminTrigger?: boolean }. Response: CoderTaskResult.
router.post(
  "/_internal/coder/analyze",
  express.json({ limit: "20kb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    // Il coder è lo slot heavy di Ares: se Ares non è configurato, non c'è slot.
    if (!isAresConfigured()) {
      res.status(503).json({ error: "coder non configurato (manca ARES_OLLAMA_MODEL o un URL Ollama)" });
      return;
    }
    if (isCoderRunning()) {
      res.status(409).json({ error: "un ciclo heavy (coder/Ares) è già in corso" });
      return;
    }

    const problem = typeof req.body?.problem === "string" ? req.body.problem : "";
    if (problem.trim().length === 0) {
      res.status(400).json({ error: "campo 'problem' mancante o vuoto" });
      return;
    }
    const adminTrigger = req.body?.adminTrigger === true;

    req.log.info(
      { model: coderModel(), adminTrigger, chatActive: isChatActive() },
      "coder analyze triggered"
    );
    try {
      const result = await runCoderTask(problem, { adminTrigger });

      // Rifiuto dal gate anti-interruzione (chat attiva / affluenza recente):
      // NON è un errore del server, è il comportamento voluto. 409 = "riprova
      // quando la chat è libera", con messaggio esplicito.
      if (result.gated) {
        req.log.info({ chatActive: isChatActive() }, "coder gated: chat attiva, nessuna eviction");
        res.status(409).json(result);
        return;
      }

      // Rollback temporizzato: se il ripristino della lineup non è completo (o è
      // andato in timeout) NON lo si silenzia — si logga e si scrive l'allarme
      // che emergerà spontaneamente all'admin in chat.
      if (result.restoreFailures.length > 0 || result.restoreTimedOut) {
        req.log.error(
          { restoreFailures: result.restoreFailures, restoreTimedOut: result.restoreTimedOut },
          "coder restore incompleto/timeout: lineup residente da controllare"
        );
        const now = new Date().toISOString();
        writeCoderAlertState({
          active: true,
          restoreFailures: result.restoreFailures,
          restoreTimedOut: result.restoreTimedOut,
          since: now,
          lastUpdated: now,
        });
      } else if (result.ok) {
        // Ripristino pulito: azzera un eventuale allarme precedente.
        clearCoderAlertState();
      }

      if (!result.ok) {
        req.log.warn({ error: result.error }, "coder task failed");
        res.status(502).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "coder analyze threw");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

// Stato condiviso esplicito "chi sta girando" (dipendenza dichiarata del task):
// il loop leggero di Quebracho su Replit e il coder heavy sul TC devono
// concordare senza dedurlo ognuno per sé. Il loop consulta questo endpoint
// invece di indovinare. Include lo stato in-process autoritativo (lock heavy +
// attività di chat) e, best-effort, la residenza reale dei modelli via /api/ps.
router.get(
  "/_internal/coder/status",
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const activity = getChatActivitySnapshot();
    const idle = chatIdleMs();
    const body: {
      running: boolean;
      model: string;
      configured: boolean;
      chatActive: boolean;
      chatIdleMs: number | null;
      activeChats: number;
      residentModels?: string[];
    } = {
      running: isCoderRunning(),
      model: coderModel(),
      configured: isAresConfigured(),
      chatActive: isChatActive(),
      // Infinity (nessuna chat mai) non è serializzabile in JSON → null.
      chatIdleMs: Number.isFinite(idle) ? idle : null,
      activeChats: activity.activeCount,
    };
    // Residenza reale sul TC: best-effort, non deve mai far fallire lo stato.
    try {
      body.residentModels = await listResidentModels();
    } catch {
      // TC irraggiungibile: omettiamo il campo, lo stato in-process resta valido.
    }
    res.json(body);
  }
);

// ── Briefing agente per BikerLink ────────────────────────────────────────────
// Espone i file di memoria dell'agente BikerBlog (MEMORY.md + topic files) in
// modo che l'agente BikerLink possa leggerli via HTTP. Sola lettura, stesso
// bearer token interno delle altre /_internal/*. BikerLink deve configurare:
//   BIKERBLOG_INTERNAL_URL = https://<dominio>/api/_internal/agent-briefing
//   BIKERBLOG_INTERNAL_TOKEN = <stesso token>
const MEMORY_DIR = path.resolve(__dirname, "..", "..", "..", ".agents", "memory");

router.get("/_internal/agent-briefing", (req, res): void => {
  const auth = req.headers.authorization;
  const agentToken = process.env["BIKERBLOG_AGENT_TOKEN"];
  const validTokens: string[] = [];
  if (INBOX_TOKEN) validTokens.push(`Bearer ${INBOX_TOKEN}`);
  if (agentToken) validTokens.push(`Bearer ${agentToken}`);
  if (validTokens.length === 0 || !auth || !validTokens.includes(auth)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));

    const sections = files.map((filename) => {
      const content = readFileSync(path.join(MEMORY_DIR, filename), "utf-8");
      return `# ${filename}\n\n${content}`;
    });

    const body = sections.join("\n\n---\n\n");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(body);
  } catch (err) {
    req.log.error({ err }, "agent-briefing read failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
