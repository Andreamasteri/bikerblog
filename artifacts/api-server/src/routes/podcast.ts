import { Router, type IRouter } from "express";
import { isNotNull } from "drizzle-orm";
import { desc, eq } from "drizzle-orm";
import { db, postsTable } from "@workspace/db";
import { Storage } from "@google-cloud/storage";

const router: IRouter = Router();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

router.get("/podcast/audio/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;

  const [post] = await db
    .select({ audioUrl: postsTable.audioUrl })
    .from(postsTable)
    .where(eq(postsTable.slug, slug))
    .limit(1);

  if (!post?.audioUrl) {
    res.status(404).json({ error: "audio non disponibile per questo post" });
    return;
  }

  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucketId) {
    res.status(500).json({ error: "object storage non configurato" });
    return;
  }

  try {
    const storage = getGcsClient();
    const objectName = `podcast/${slug}.mp3`;
    const file = storage.bucket(bucketId).file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "file audio non trovato" });
      return;
    }

    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (metadata.size) {
      res.setHeader("Content-Length", String(metadata.size));
    }
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${slug}.mp3"`,
    );

    file.createReadStream().pipe(res);
  } catch (err) {
    req.log.error({ slug, err }, "podcast audio stream failed");
    res.status(500).json({ error: "errore durante il recupero dell'audio" });
  }
});

router.get("/podcast/feed.xml", async (req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(postsTable)
    .where(isNotNull(postsTable.audioUrl))
    .orderBy(desc(postsTable.publishedAt));

  const domains = process.env["REPLIT_DOMAINS"] ?? "localhost";
  const baseUrl = `https://${domains.split(",")[0].trim()}`;

  const podcastUrl = `${baseUrl}/api/podcast/feed.xml`;
  const imageUrl = `${baseUrl}/podcast-cover.jpg`;

  const items = posts
    .map((p) => {
      const plain = escapeXml(stripMarkdown(p.content).slice(0, 500));
      const title = escapeXml(p.title);
      const pubDate = new Date(p.publishedAt).toUTCString();
      const audioUrl = `${baseUrl}${p.audioUrl!}`;
      const duration = (p.readingMinutes ?? 5) * 60;

      return `    <item>
      <title>${title}</title>
      <link>${escapeXml(baseUrl)}/posts/${escapeXml(p.slug)}</link>
      <guid isPermaLink="false">${escapeXml(p.slug)}</guid>
      <description>${plain}</description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" length="0" type="audio/mpeg"/>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:summary>${plain}</itunes:summary>
      <itunes:explicit>no</itunes:explicit>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>BikerBlog Podcast — Il Diario di BikerLink</title>
    <link>${escapeXml(baseUrl)}</link>
    <language>it</language>
    <description>Il diario quotidiano di sviluppo di BikerLink, narrato episodio per episodio. Un progetto dedicato a Mauri.</description>
    <itunes:author>BikerBlog</itunes:author>
    <itunes:summary>Il diario quotidiano di sviluppo di BikerLink, narrato episodio per episodio.</itunes:summary>
    <itunes:explicit>no</itunes:explicit>
    <itunes:image href="${escapeXml(imageUrl)}"/>
    <itunes:category text="Technology"/>
    <image>
      <url>${escapeXml(imageUrl)}</url>
      <title>BikerBlog Podcast</title>
      <link>${escapeXml(baseUrl)}</link>
    </image>
    <atom:link href="${escapeXml(podcastUrl)}" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom"/>
${items}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});

export default router;
