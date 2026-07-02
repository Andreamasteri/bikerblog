---
name: Content audit / draft status
description: How the automatic forbidden-terms audit and the posts "status" column interact — read before touching any post read/write path.
---

## What exists

- `scripts/src/content-audit.ts` exports `FORBIDDEN_TERMS` (a versioned list of
  strings/regexes: raw SQL keywords, `LEAST(`/`GREATEST(`, `tipo \d+`,
  matching-engine/task-tracking jargon, internal snake_case DB column/table
  names) plus `auditContent()` / `auditPost()` helpers.
- `postsTable` has a `status` text column, default `"published"`, values are
  `"published"` or `"draft"`.
- Both write paths that can publish a post — `publish-from-clusters.ts` and
  `generate-daily-diary.ts` — run `auditPost()` before insert/update. If
  flagged, the post is written with `status: "draft"` instead of
  `"published"`, and a warning (with matched terms) is logged.

## The rule

**Every public-facing post query must filter `status = "published"`, not just
the write path that sets it.** It's easy to add a new read route (or a feed/
export endpoint) that forgets this filter and leaks draft content.

**Why:** the whole point of the audit is that flagged posts must never become
publicly reachable. A single unfiltered read endpoint defeats it silently —
there's no error, the draft post just quietly appears in an RSS feed, a
comments lookup, an audio stream, etc.

**How to apply:** when adding or auditing a route that reads from
`postsTable` for public consumption (list, detail, featured, podcast feed,
podcast audio stream, sitemap, comments-by-slug, etc.), add
`eq(postsTable.status, "published")` to the `where` clause alongside any
other filters. Internal/automation routes (`/_internal/*`, self-check DB
sync) are the only places allowed to see or move `"draft"` posts, and
self-check must never push a `"draft"` post to production.

## Reporting drafts from a subprocess-based pipeline step

If a pipeline step that can flag posts runs as a `spawnSync` subprocess
(rather than a direct function import), you can't easily get its flagged-slug
list back into the parent's structured report. Simplest fix: after all steps
run, do one final DB query for `status = 'draft'` across all posts (not just
"this run's slugs") and surface it as a summary warning step — it makes the
report correct regardless of which step id created the draft.
