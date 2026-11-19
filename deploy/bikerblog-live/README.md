# BikerBlog: live Worker backup and integration

This directory separates the exact Cloudflare production snapshot from its reviewed successor. The snapshot is the recovery source; `worker.mjs` is the integration candidate. Neither file is the older `recovery/cloudflare-bikerblog-worker.mjs` checked into the repository.

## Captured production state

- Worker: `bikerblog-recovery`
- Active version: `11fa7928-fdcd-4d18-bbda-fbf46597ef5a` (version 8)
- Active deployment: `d87a13a5-1490-4b72-9ade-fd4d3c64bfec`
- Snapshot: `worker-v8-live-snapshot-2026-11-19.mjs`
- Snapshot size: 885,436 bytes
- Snapshot SHA-256: `f50ac3c61e2368cb05e98ed937583edef1979620a9c82243593dc65e1c1f4c81`
- Hostname: `bikerblog.biker-link.net`, Cloudflare Worker Domain in zone `biker-link.net`
- Binding: `BLOG_MEDIA` → private R2 bucket `bikerblog-media`
- Worker secrets: none
- `workers.dev` and R2 `r2.dev` are disabled on production; the bucket has no custom domains
- R2 inventory: 35 objects (33 editorial WebP + 2 pre-existing illustrations), 3,342,460 bytes

`backup-metadata.json` records the active deployment, route/domain, binding and R2 object metadata without secrets. `media-manifest.json` records all 31 article-cover assignments, the 2 gallery illustrations, the 2 unused editorial objects and the R2 inventory. The source and manifests were verified against Cloudflare; the production archive contains 253 posts (235 diary entries), four authors and six comments.

## Architecture choice

Two options were evaluated:

- **A — React build in front of the Worker:** the existing React SPA expects API shapes the live Worker does not provide and its seed data contains only 18 original posts. A direct deployment would omit the 235 live diary entries. Its metadata changes happen after JavaScript runs, and its current copy shifts BikerBlog toward generic rides and routes.
- **B — retain the live Worker and update its server-rendered templates:** this keeps the 253 article records, current API contracts, public paths, archive and R2 assignments in one runtime. It also sends titles, descriptions, canonical links, language alternates and social metadata in the initial HTML.

**Chosen: B.** The live Worker remains the application and source of truth. The React files from PR #4 are not deployed. PR #4's editorial direction and components were reviewed; its generic travel framing and client-only metadata are not used.

## Reviewed successor

`worker.mjs` is based byte-for-byte on the captured Worker archive, with targeted template and route changes:

- Home introduces BikerLink through the verified March 3, 2026 origin story and describes the blog as a development journal.
- The diary now says “235 voci” rather than “235 giorni”; the retrospective and narrative-reconstruction note remains.
- The memorial text is unchanged in Italian. The English page is a concise translation of that dedication.
- The English UI is server-rendered on `?lang=en` for the home, gallery, podcast and memorial only. Italian articles remain Italian and have no false English `hreflang` alternate.
- Server-rendered page titles, descriptions, canonical links, Open Graph and Twitter metadata are emitted in the first HTML response. Search results and 404s are `noindex`.
- Image alt text describes the actual R2 illustration; the gallery labels its artwork as narrative mockups.
- `/media/` uses an exact allowlist of the 31 assigned editorial covers plus the 2 gallery illustrations. The 2 unassigned editorial objects remain in private R2 and return 404 through this Worker.
- Existing routes, archive data, API response shapes and all 257 original sitemap URLs are retained. Four translated static variants are added to the sitemap with matching `hreflang` links.
- Requests on `*.workers.dev` receive `X-Robots-Tag: noindex, nofollow` for preview safety; the production custom domain does not.

## Backup verification and restore

Verify the immutable production snapshot before any restore:

```sh
sha256sum worker-v8-live-snapshot-2026-11-19.mjs
node --check worker-v8-live-snapshot-2026-11-19.mjs
```

The SHA-256 must match the value above and `snapshot.sourceSha256` in `backup-metadata.json`. The original source was also checked against the Cloudflare export and parsed with Node. The R2 object inventory is recorded separately; restoring code does not modify bucket contents.

To restore production, use a Cloudflare API token stored only in the shell environment. It needs permission to edit Workers and read the bound R2 bucket. Never commit the token.

1. Check out the commit containing this backup and verify the snapshot SHA-256.
2. Save a temporary `worker-metadata.json` with:

   ```json
   {
     "main_module": "worker.mjs",
     "compatibility_date": "2026-11-01",
     "bindings": [
       {
         "type": "r2_bucket",
         "name": "BLOG_MEDIA",
         "bucket_name": "bikerblog-media"
       }
     ]
   }
   ```

3. Upload the exact snapshot to the existing production script (do not use the stale repository recovery source):

   ```sh
   curl --fail-with-body --silent --show-error \
     -X PUT \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -F "metadata=@worker-metadata.json;type=application/json" \
     -F "worker.mjs=@worker-v8-live-snapshot-2026-11-19.mjs;type=application/javascript+module" \
     "https://api.cloudflare.com/client/v4/accounts/d116d3d97b133c543d02934be4bc98d2/workers/scripts/bikerblog-recovery"
   ```

4. Confirm the new deployment serves 100% traffic, the Worker Domain still targets `bikerblog-recovery`, `BLOG_MEDIA` still binds to `bikerblog-media`, and `/healthz`, APIs, sitemap, robots, the memorial and representative R2 objects return successfully. Confirm R2 `r2.dev` is still disabled.

Cloudflare keeps prior Worker versions and deployments, but this repository snapshot is the portable rollback source. The production hostname and bucket were not changed while creating this backup.

## Pre-preview checks

The local Worker passed `node --check`. A direct comparison against the captured Worker confirmed 253 posts, all 253 slugs, the featured-post response and API stats are unchanged. The route and metadata review covered the home, archive, diary, timeline, category, tag, author, article, gallery, memorial, podcast, sitemap, robots and APIs. The generated sitemap parses as XML and contains 261 URLs: all 257 original URLs plus four translated pages. Across the 257 Italian pages, titles are at most 60 characters, descriptions are at least 70 characters with no duplicates, and every image has an `alt` attribute. Mocked R2 checks returned 200 for assigned/used keys and 404 for unassigned or unknown keys.

The isolated Cloudflare preview deployment, visual desktop/mobile checks and production/post-deployment SEO crawl are recorded in the PR after those steps complete.
