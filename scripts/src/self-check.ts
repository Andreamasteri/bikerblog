#!/usr/bin/env tsx
/**
 * self-check — verifica che la produzione sia allineata con il DB dev
 * e ripara automaticamente le differenze.
 *
 * Per ogni post pubblicato negli ultimi N giorni (default 7) controlla:
 *   - esiste in produzione?
 *   - ha la traduzione EN (body_en)?
 *   - ha l'audio (audio_url)?
 *   - il contenuto è aggiornato (excerpt uguale a dev)?
 *
 * Se qualcosa manca o è obsoleto rispetto al dev DB, fa un push verso
 * /_internal/seed-posts con SEED_TOKEN. Verifica di nuovo dopo il push.
 *
 * Stampa un report finale. Exit code != 0 solo se restano gap dopo il fix.
 *
 * Env:
 *   - DATABASE_URL (richiesta) — dev DB
 *   - SEED_TOKEN (richiesta per il fix) — token per seed-posts
 *   - PROD_URL (opzionale, default https://bikerlink-blog.replit.app)
 *   - SELF_CHECK_DAYS (opzionale, default 7)
 */
import { pool, db, postsTable } from "@workspace/db";
import { gte } from "drizzle-orm";

const PROD_URL   = process.env["PROD_URL"] ?? "https://bikerlink-blog.replit.app";
const SEED_TOKEN = process.env["SEED_TOKEN"];
const DAYS       = Math.max(1, Number(process.env["SELF_CHECK_DAYS"] ?? 7) || 7);

type DevPost = typeof postsTable.$inferSelect;

interface Gap {
  slug: string;
  missing: boolean;
  missingEn: boolean;
  missingAudio: boolean;
  staleContent: boolean;
}

interface ProdPost {
  slug?: string;
  excerpt?: string | null;
  bodyEn?: string | null;
  body_en?: string | null;
  audioUrl?: string | null;
  audio_url?: string | null;
}

async function fetchProdPost(slug: string): Promise<ProdPost | null> {
  try {
    const r = await fetch(`${PROD_URL}/api/posts/${slug}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return (await r.json()) as ProdPost;
  } catch {
    return null;
  }
}

function checkGap(dev: DevPost, prod: ProdPost | null): Gap {
  if (!prod) {
    return {
      slug: dev.slug,
      missing: true,
      missingEn: !!dev.bodyEn,
      missingAudio: !!dev.audioUrl,
      staleContent: false,
    };
  }
  const prodBodyEn = prod.bodyEn ?? prod.body_en ?? null;
  const prodAudio  = prod.audioUrl ?? prod.audio_url ?? null;
  const stale      = !!prod.excerpt && prod.excerpt !== dev.excerpt;
  return {
    slug: dev.slug,
    missing: false,
    missingEn: !!dev.bodyEn && !prodBodyEn,
    missingAudio: !!dev.audioUrl && !prodAudio,
    staleContent: stale,
  };
}

function devPostToSeedPayload(p: DevPost): Record<string, unknown> {
  return {
    slug:             p.slug,
    title:            p.title,
    excerpt:          p.excerpt,
    content:          p.content,
    cover_image_url:  p.coverImageUrl,
    category:         p.category,
    tags:             p.tags,
    author_id:        p.authorId,
    published_at:     p.publishedAt.toISOString(),
    reading_minutes:  p.readingMinutes,
    like_count:       p.likeCount,
    featured:         p.featured,
    audio_url:        p.audioUrl,
    title_en:         p.titleEn,
    excerpt_en:       p.excerptEn,
    body_en:          p.bodyEn,
    location:         p.location,
    bike:             p.bike,
    daily_maxim:      p.dailyMaxim,
  };
}

async function pushToProd(posts: DevPost[]): Promise<{ ok: boolean; message: string }> {
  if (!SEED_TOKEN) {
    return { ok: false, message: "SEED_TOKEN non impostato — impossibile fare push" };
  }
  const payload = posts.map(devPostToSeedPayload);
  try {
    const r = await fetch(`${PROD_URL}/api/_internal/seed-posts`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${SEED_TOKEN}`,
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const body = (await r.json()) as {
      ok?: boolean; inserted?: number; updated?: number;
      error?: string; errors?: string[];
    };
    if (!r.ok || !body.ok) {
      return { ok: false, message: `HTTP ${r.status}: ${body.error ?? JSON.stringify(body)}` };
    }
    return {
      ok: true,
      message: `inserted=${body.inserted} updated=${body.updated} errors=${body.errors?.length ?? 0}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function gapLabel(gap: Gap): string {
  return [
    gap.missing       ? "MANCANTE"  : null,
    gap.staleContent  ? "STALE"     : null,
    gap.missingEn     ? "no-EN"     : null,
    gap.missingAudio  ? "no-AUDIO"  : null,
  ].filter(Boolean).join(", ");
}

async function main() {
  console.log(`[self-check] avvio — controllo ultimi ${DAYS} giorni vs ${PROD_URL}`);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS);

  const recentPosts = await db
    .select()
    .from(postsTable)
    .where(gte(postsTable.publishedAt, since));

  console.log(`[self-check] ${recentPosts.length} post recenti nel DB dev`);

  const gaps: Array<{ gap: Gap; dev: DevPost }> = [];
  for (const dev of recentPosts) {
    const prod = await fetchProdPost(dev.slug);
    const gap  = checkGap(dev, prod);
    if (gap.missing || gap.missingEn || gap.missingAudio || gap.staleContent) {
      gaps.push({ gap, dev });
    }
  }

  if (gaps.length === 0) {
    console.log("[self-check] ✓ tutto allineato — nessun gap rilevato");
    await pool.end();
    return;
  }

  console.log(`[self-check] ⚠ ${gaps.length} post con gap:`);
  for (const { gap } of gaps) {
    console.log(`  - ${gap.slug}: ${gapLabel(gap)}`);
  }

  console.log("[self-check] tentativo di riparazione via /_internal/seed-posts...");
  const pushResult = await pushToProd(gaps.map((g) => g.dev));
  console.log(
    `[self-check] push result: ${pushResult.ok ? "OK" : "FAIL"} — ${pushResult.message}`
  );

  if (!pushResult.ok) {
    console.error("[self-check] ✗ riparazione fallita");
    await pool.end();
    process.exit(1);
  }

  console.log("[self-check] verifica post-push...");
  const remaining: Gap[] = [];
  for (const { dev } of gaps) {
    const prod = await fetchProdPost(dev.slug);
    const gap  = checkGap(dev, prod);
    if (gap.missing || gap.missingEn || gap.missingAudio || gap.staleContent) {
      remaining.push(gap);
    }
  }

  if (remaining.length === 0) {
    console.log("[self-check] ✓ tutti i gap risolti");
    await pool.end();
    return;
  }

  console.error(`[self-check] ✗ ${remaining.length} gap rimasti dopo il push:`);
  for (const gap of remaining) {
    console.error(`  - ${gap.slug}: ${gapLabel(gap)}`);
  }
  await pool.end();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("[self-check] errore fatale:", err);
  await pool.end();
  process.exit(1);
});
