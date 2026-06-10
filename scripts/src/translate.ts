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

const PRIVACY_SYSTEM_PROMPT = `You are a professional translator specializing in Italian motorcycle enthusiast content.

MANDATORY PRIVACY RULE — matching engine:
BikerLink has a proprietary matching engine. In all translations, NEVER reveal:
- The internal logic of the matching algorithm (formulas, weights, numerical criteria, SQL, specific GPS functions)
- The names of database tables related to matching (e.g. join table names, internal state columns)
- Numerical values of match types or internal states (e.g. numerical codes, internal enums)
- Details on how GPS distance or search radius is calculated
- Source file names or internal code paths of the matching engine
Describe matching in an anecdotal, user-impact way: "improved the matching", "the system now recognizes similar bikes", "fixed a bug in the match flow". NEVER the internal technical how.`;

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
    system:     PRIVACY_SYSTEM_PROMPT,
    messages:   [{ role: "user", content: prompt }],
  });

  const block   = message.content[0];
  const rawText = block.type === "text" ? block.text.trim() : "{}";
  // Claude sometimes wraps JSON in ```json ... ``` fences despite instructions — strip them
  const text = rawText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/,           "")
    .trim();

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
