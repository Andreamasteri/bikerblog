#!/usr/bin/env tsx
/**
 * podcast-generate — genera audio TTS per i post del blog.
 *
 * Flusso:
 *   1. Legge i post dal DB senza audio_url
 *   2. Per ognuno, chiama ElevenLabs TTS → ottiene bytes MP3
 *   3. Invia i bytes all'endpoint interno /api/_internal/podcast-store
 *      che usa il sidecar GCS dell'api-server per caricare su GCS e aggiorna il DB
 *
 * Richiede:
 *   ELEVENLABS_API_KEY  — API key ElevenLabs
 *   SESSION_SECRET      — già impostato (usato per derivare il token interno)
 *   DATABASE_URL        — Postgres
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run podcast:generate
 *   pnpm --filter @workspace/scripts run podcast:generate -- --slug recap-2026-03-12
 *   pnpm --filter @workspace/scripts run podcast:generate -- --dry-run
 *   pnpm --filter @workspace/scripts run podcast:generate -- --force
 */

import { createHmac } from "crypto";
import { db, pool, postsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George — warm storyteller, eleven_multilingual_v2
const MODEL_ID = "eleven_multilingual_v2";

const API_BASE = process.env["API_BASE_URL"] ?? "http://localhost:8080";
const STORE_ENDPOINT = `${API_BASE}/api/_internal/podcast-store`;

function getInternalToken(): string {
  if (process.env["INBOX_TOKEN"]) return process.env["INBOX_TOKEN"];
  if (process.env["SESSION_SECRET"]) {
    return createHmac("sha256", process.env["SESSION_SECRET"])
      .update("internal-api-token-v1")
      .digest("hex");
  }
  throw new Error("SESSION_SECRET (o INBOX_TOKEN) non impostato — impossibile autenticarsi all'API server");
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY_SLUG = args[args.indexOf("--slug") + 1] ?? null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

function buildNarrationText(title: string, content: string): string {
  const clean = stripMarkdown(content).slice(0, 4500);
  return `${title}.\n\n${clean}`;
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

async function generateTtsBytes(text: string): Promise<Buffer> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY non impostato. " +
        "Imposta la variabile d'ambiente con la tua API key ElevenLabs.",
    );
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
        speed: 0.95,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Store via API server (usa sidecar GCS) ────────────────────────────────────

async function storeAudio(slug: string, audioBytes: Buffer): Promise<string> {
  const token = getInternalToken();

  const res = await fetch(`${STORE_ENDPOINT}?slug=${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "audio/mpeg",
    },
    body: audioBytes,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`podcast-store error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { audioUrl: string };
  return data.audioUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let query = db.select().from(postsTable).$dynamic();

  if (ONLY_SLUG) {
    query = query.where(eq(postsTable.slug, ONLY_SLUG));
  } else if (!FORCE) {
    query = query.where(isNull(postsTable.audioUrl));
  }

  const posts = await query;

  if (posts.length === 0) {
    console.log("[podcast] Nessun post da processare. Usa --force per rigenerare tutto.");
    return;
  }

  console.log(`[podcast] Post da processare: ${posts.length}${DRY_RUN ? " (DRY RUN)" : ""}`);

  let ok = 0;
  let fail = 0;
  let totalChars = 0;

  for (const post of posts) {
    const { slug } = post;
    console.log(`[podcast] ▶ ${slug} — ${post.title.slice(0, 55)}...`);

    try {
      const text = buildNarrationText(post.title, post.content);
      totalChars += text.length;

      if (DRY_RUN) {
        console.log(`[podcast]   ${text.length} chars — DRY RUN, skip`);
        ok++;
        continue;
      }

      const audioBytes = await generateTtsBytes(text);
      console.log(`[podcast]   TTS ok — ${(audioBytes.length / 1024).toFixed(0)} KB`);

      const publicUrl = await storeAudio(slug, audioBytes);
      console.log(`[podcast] ✓ ${slug} → ${publicUrl}`);
      ok++;

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(
        `[podcast] ✗ ${slug} —`,
        err instanceof Error ? err.message : err,
      );
      fail++;
    }
  }

  const estimatedCost = (totalChars / 1000) * 0.3;
  console.log(`\n[podcast] ✅ ok: ${ok}, falliti: ${fail}`);
  console.log(`[podcast] Caratteri totali: ${totalChars} (~$${estimatedCost.toFixed(2)} stima ElevenLabs)`);
}

try {
  await main();
} finally {
  await pool.end();
}
