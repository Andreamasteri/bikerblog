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
            audioUrl: (p["audio_url"] as string | null) ?? null,
            location: (p["location"] as string | null) ?? null,
            bike: (p["bike"] as string | null) ?? null,
            dailyMaxim: (p["daily_maxim"] as string | null) ?? null,
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
              audioUrl: (p["audio_url"] as string) ?? null,
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

export default router;
