import { Router, type IRouter } from "express";
import express from "express";
import { createHmac } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db, postsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const INBOX_DIR = path.resolve(__dirname, "..", "..", "..", "..", "inbox");
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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

export default router;
