/**
 * Shared translation helper for blog posts (IT → EN).
 *
 * Used by: translate-posts.ts, generate-daily-diary.ts, publish-from-clusters.ts
 *
 * Model: claude-haiku-4-5 (fast, cost-effective for translation)
 * Client: Replit AI Integrations proxy (AI_INTEGRATIONS_ANTHROPIC_* env vars)
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy",
});

export interface TranslationResult {
  titleEn:   string;
  excerptEn: string;
  bodyEn:    string;
}

/**
 * Translates an Italian motorcycle blog post to English.
 *
 * @param title   - Italian post title
 * @param excerpt - Italian post excerpt
 * @param body    - Italian post body (Markdown)
 * @param slug    - Optional slug used in error/warning messages
 * @returns Translated fields. On JSON parse failure, falls back to the
 *          original Italian values and logs a warning.
 */
export async function translatePostToEn(
  title:   string,
  excerpt: string,
  body:    string,
  slug?:   string,
): Promise<TranslationResult> {
  const label = slug ? `[translate:${slug}]` : "[translate]";

  const prompt = `Translate the following Italian motorcycle dev-blog post into English. Be faithful but natural — use motorcycle enthusiast language for the narrative parts.

Return ONLY a valid JSON object with exactly these three keys: "title", "excerpt", "content".
No explanation, no markdown wrapper, no extra text.

---
TITLE: ${title}
---
EXCERPT: ${excerpt}
---
CONTENT:
${body}
---`;

  const message = await anthropic.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 4096,
    messages:   [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  const text  = block.type === "text" ? block.text.trim() : "{}";

  try {
    const parsed = JSON.parse(text) as {
      title?:   string;
      excerpt?: string;
      content?: string;
    };
    return {
      titleEn:   parsed.title   ?? title,
      excerptEn: parsed.excerpt ?? excerpt,
      bodyEn:    parsed.content ?? body,
    };
  } catch {
    console.warn(`${label} ⚠ translatePostToEn — JSON parse failed, using IT fallback`);
    return { titleEn: title, excerptEn: excerpt, bodyEn: body };
  }
}
