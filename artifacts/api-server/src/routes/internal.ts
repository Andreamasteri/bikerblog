import { Router, type IRouter } from "express";
import express from "express";
import { createHmac } from "crypto";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
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
import { writeVramAlertState } from "@workspace/horus";

const router: IRouter = Router();

// Il server gira sempre dal bundle in dist/index.mjs (sia in dev che in
// produzione, vedi artifacts/api-server/package.json e artifact.toml), quindi
// __dirname è .../artifacts/api-server/dist: tre livelli sopra è la root del
// monorepo. Un conteggio errato qui (es. assumendo il layout sorgente
// src/routes/) fa scrivere/leggere fuori dal progetto senza errori visibili.
const INBOX_DIR = path.resolve(__dirname, "..", "..", "..", "inbox");
const NADIR_MANUAL_PATH = path.join(INBOX_DIR, "nadir-manual.md");
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

export default router;
