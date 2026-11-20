# BikerBlog: live Worker backup and integration

This directory separates the exact Cloudflare production snapshot from its reviewed successor. The snapshot is the recovery source; `worker.mjs` is the deployed successor. Neither file is the older `recovery/cloudflare-bikerblog-worker.mjs` checked into the repository.

## Original production snapshot (Worker version 8)

- Worker: `bikerblog-recovery`
- Captured version: `11fa7928-fdcd-4d18-bbda-fbf46597ef5a` (version 8)
- Captured deployment: `d87a13a5-1490-4b72-9ade-fd4d3c64bfec`
- Snapshot: `worker-v8-live-snapshot-2026-11-19.mjs`
- Snapshot size: 885,436 bytes
- Snapshot SHA-256: `f50ac3c61e2368cb05e98ed937583edef1979620a9c82243593dc65e1c1f4c81`
- Hostname: `bikerblog.biker-link.net`, Cloudflare Worker Domain in zone `biker-link.net`
- Binding: `BLOG_MEDIA` → private R2 bucket `bikerblog-media`
- Worker secrets: none
- `workers.dev` and R2 `r2.dev` are disabled on production; the bucket has no custom domains
- R2 inventory: 35 objects (33 editorial WebP + 2 pre-existing illustrations), 3,342,460 bytes

`backup-metadata.json` records the original v8 snapshot's deployment, domain, binding and R2 object metadata without secrets. `media-manifest.json` records all 31 article-cover assignments, the 2 gallery illustrations, the 2 unused editorial objects and the R2 inventory. The source and manifests were verified against Cloudflare; the production archive contains 253 posts (235 diary entries), four authors and six comments.

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

## Isolated preview verification (2026-11-19)

Before publication, the production domain served the captured v8 deployment. The initial successor preview was built from a clean detached worktree at commit `11beb5ca3944d14034f98db49e4b84a6f68c3b5e`; `node --check` and direct Worker requests passed. Source SHA-256: `f6632b4fb8a76c80a7b88e0515469a337ffeee0d6a66b37c5ebc145371cdcc86`.

The preview ran on the separate Worker `bikerblog-editorial-preview` at `bikerblog-editorial-preview.andreamasteri-nadir-radio.workers.dev`, deployment `b23e8c6b-89bb-4c08-a7ea-847906ec8245`, version `02959dc5-e590-4c52-a216-8514463e061d` at 100%. Every preview response had `X-Robots-Tag: noindex, nofollow`. No production route, domain, DNS record or bucket configuration was changed.

After OpenSEO identified duplicate titles among some diary entries, the final candidate from commit `15ba0bb396584403f27fdd1ab201fdc7cd3e0041` was staged on the same preview Worker as deployment `fcdfd03a-0237-4d88-af38-0bc9c259fa06`, version `927ba615-cdd4-41eb-81b4-15b8a0d0ed90`, at 100%. All 235 diary pages returned 200 with distinct server-rendered titles; API counts, sitemap count, routes and R2 access controls remained correct.

The route matrix returned 200 for the home, archive, diary, timeline, category, tag, authors, gallery (IT/EN), memorial (IT/EN), podcast (IT/EN), two representative articles, sitemap, robots, health endpoint and all three current APIs. Unknown routes returned 404. The initial HTML already contains its title, description, canonical, hreflang and social tags. The memorial's Italian text is unchanged; the English version was checked at desktop and mobile widths.

The full `/api/posts` response is byte-equivalent at the JSON-data level to the snapshot: all 253 records and slugs match, including 235 diary entries. The featured-post and stats APIs are unchanged. The original 257 sitemap URLs are all retained; XML parses and includes four additional translated static pages, for 261 URLs total. Across 261 rendered pages checked, no title exceeds 60 characters, no description is shorter than 70 characters, descriptions are unique, and no image lacks an `alt` attribute.

All 33 allowlisted R2 paths (31 assigned covers + 2 gallery illustrations) returned 200 through the preview; both unassigned editorial objects and an unknown key returned 404. The 31 article-to-cover mappings match the captured source exactly. The live bucket inventory still matches the backup on all 35 keys, sizes and ETags (3,342,460 bytes); `r2.dev` remains disabled and no custom domains are attached.

Playwright checks at 1440×1000 and 390×844 showed no horizontal overflow. All ten home-page images decoded successfully. The English home, English memorial, diary, podcast and origin article also rendered at desktop and mobile widths without overflow. Production deployment and the post-publication OpenSEO crawl were completed later; see below.

## Baseline production deployment before the diary revision (2026-11-19)

This section records the PR #5 baseline; the current deployment is documented below.

The exact Worker source from commit `15ba0bb396584403f27fdd1ab201fdc7cd3e0041` was deployed after a clean detached worktree passed `node --check`. Its SHA-256 is `f7ae9f5c251e6335ff72cfd5949b5579c11ff5198108bfba80469cc35e9ce9ee` and its size is 902,394 bytes. The production deployment is `8ae534fb-5622-4871-b186-4b57b2704556`, version `0592e5d9-5648-4340-9f8d-3e27bf5511c7`, at 100%. The existing hostname remains attached to `bikerblog-recovery`; `BLOG_MEDIA` still binds to the private `bikerblog-media` bucket. No DNS, domain or R2 configuration was changed.

Production returned 200 for the home (Italian and English), archive, diary, timeline, category, tag, authors, gallery, memorial (Italian and English), podcast (Italian and English), origin article, representative diary article, sitemap, robots, health endpoint, featured-post API and stats API. `/api/posts` still returns 253 records, including 235 diary entries; all 253 slugs are unique. The 235 diary article pages returned 200 and have unique server-rendered titles. The post list, featured post, stats and health endpoints match the pre-publication contract and counts. Sitemap XML parses with 261 URLs: all 257 original URLs plus four translated static variants. The public robots file still references that sitemap.

The first post-publication OpenSEO root crawl read 50/50 pages with no blocked, rate-limited or failed fetches. Its 50 URLs exactly match the original 50-page sample. The earlier sample reported 48 short descriptions and 38 long titles; the new sample reports none of those issues and no duplicate titles. The only content issue in that sample is the 72-word memorial, which remains a concise dedication. Across the 20 production crawls then available (seven capped at 50 pages and 13 targeted at 10 pages), the deduplicated union covered 58/261 sitemap URLs, plus 9 routes not listed in the sitemap: 0 blocked, 0 rate-limited, 0 errors and 203 sitemap URLs not reached. The crawler repeatedly returned to the same recent article links, so repeated rows are not counted as added coverage. Other short-page flags concern the memorial and brief utility pages whose missing factual content was not padded.

OpenSEO reported one 1,851 ms response for `/posts/diario-2026-11-04`; three immediate production rechecks returned 112–227 ms. This was transient. The author-filter URLs canonicalize to `/diario`, as intended. All 33 allowed media paths returned 200 after publication; the two unassigned R2 objects remain private and their public paths return 404. The bucket still has 35 objects, its `r2.dev` domain is disabled and no custom domains are attached.

## Diary aside revision and pre-revision rollback point (2026-11-19)

Immediately before the diary edit, the production Worker was version 10, deployment `8ae534fb-5622-4871-b186-4b57b2704556`, serving 100% traffic. Its source was commit `15ba0bb396584403f27fdd1ab201fdc7cd3e0041`, SHA-256 `f7ae9f5c251e6335ff72cfd5949b5579c11ff5198108bfba80469cc35e9ce9ee`. Cloudflare's live source hash matched the checked-in file before the revision.

`pre-editorial-revision-state-2026-11-19.json` captures that pre-revision version, source commit and hash, production hostname, R2 binding, private-bucket status and inventory. The source is recoverable from the named Git commit; Cloudflare also retains version `0592e5d9-5648-4340-9f8d-3e27bf5511c7`. To roll back, create a 100% deployment with that `version_id` at `/accounts/{account_id}/workers/scripts/bikerblog-recovery/deployments`, using the JSON body recorded in the metadata file. This restores the exact pre-revision code without changing the domain or R2 objects. Verify `/healthz`, `/api/posts`, the 261-URL sitemap, robots, an assigned cover and the R2 private-domain setting after rollback.

Before revision, all 235 diary entries used the same “Commento non richiesto dalla redazione” heading and only 21 distinct lines. The first production pass removed 214 duplicate occurrences. The follow-up editorial correction restores one context-specific aside to every entry: it keeps one occurrence of each of the 21 prior lines and adds 214 new, non-repeating lines. The repeated heading stays retired. All 235 diary entries now have a different aside; the article narratives, sources, metadata, routes, cover assignments and memorial text remain unchanged. `scripts/revise-bikerblog-asides.mjs` reproduces and checks the corrected version.

## OpenSEO crawl results (2026-11-19)

The production sitemap generated from the reviewed Worker contains 261 unique URLs. Across 40 completed OpenSEO audits on the public hostname, the deduplicated union read 58/261 sitemap URLs; 203 sitemap URLs were not reached directly on that hostname. The 975 sitemap-page rows were all HTTP 200 with `fetchClass=ok`; there were 0 blocked, 0 rate-limited and 0 failed fetches. The audits also reached 14 distinct URLs outside the sitemap, including APIs, utility routes, image routes, tags and author-filter URLs; these do not count toward sitemap coverage. Repeated visits to the recent diary pages were not counted as new URLs.

To cover the complete sitemap path set, OpenSEO also crawled the isolated `bikerblog-editorial-preview` Worker in six groups, each within the 50-page cap. The clone used the same final Worker content and private R2 binding; only a noindex crawl index and preview-only robots handling were added. Groups 0–4 each listed 49 exact sitemap URLs. The final group listed the remaining 16 and was rerun after the English podcast title fix in PR #7. The union matched all 261 sitemap URLs with none missing. Across the six audits, all 300 page reads (including six noindex seed pages) were HTTP 200 and `fetchClass=ok`; 23 other unique, non-sitemap paths were also found. Audit IDs: `de2b3651`, `1c1ff7bc`, `1177c9f9`, `ac272b8c`, `0107dbb4` and final-code audit `d830fd79`.

The preview clone is not a 261-page crawl of the production hostname. OpenSEO on the public hostname continued to prioritize its discovered sitemap/navigation and repeated the same recent URLs despite the temporary seed links. The production result therefore remains 58/261 directly read and 203 not reached; the separate preview pass verifies that all sitemap paths render from the same reviewed application content. Preview-only `noindex`, canonicalization and the seeds' missing descriptions are expected and are not production SEO defects.

Across the full path set, OpenSEO found no duplicate titles or descriptions, missing titles/descriptions, titles over its length threshold, descriptions below its threshold, missing image alt text, blocked pages, rate limits or failed fetches. The 72-word memorial was flagged as thin content; it remains a concise dedication to Mauri and was not expanded for an SEO threshold. The duplicate title discovered between `/podcast` and `/podcast?lang=en` was corrected in PR #7; a final-code OpenSEO audit confirmed `Podcast | BikerBlog` and `Podcast in English | BikerBlog` are distinct.

## Production state before the gallery release (2026-11-19)

The exact source from GitHub `main` commit `a52c96113c21f38ef03004069c95d4581045b3a2` is deployed. `worker.mjs` is 872,148 bytes with SHA-256 `4dbc92c8dc51082475c1bad7633f6e0b66315230f581ff79be5644939714d95e`. Cloudflare version 13 (`04bd4255-6d3f-4760-bd31-4d9f5904ca52`) is deployed 100% by deployment `5cc66c0b-b120-456c-b59c-d51ba27db625`. The hostname `bikerblog.biker-link.net` still targets `bikerblog-recovery`; the `BLOG_MEDIA` binding still targets private bucket `bikerblog-media`. `workers.dev` is disabled, R2 `r2.dev` is disabled and no R2 custom domains are attached. No temporary OpenSEO route remains; the production route returns 404.

Post-deployment OpenSEO checks read the home and 50 linked sitemap pages at HTTP 200. `/api/posts`, `/api/meta/stats`, `/sitemap.xml` and `/robots.txt` returned 200. The API still contains 253 posts (235 diary entries) with 253 unique slugs; the generated sitemap has 261 URLs. The memorial and representative diary article returned 200. The English podcast returned 200 with its distinct title. One assigned image returned 200 through the Worker and an unassigned R2 image returned 404. The R2 inventory exactly matches the manifest: 35 objects and 3,342,460 bytes; the bucket was not modified by this release.

`current-live-state-2026-11-19.json` records the active deployment, source checksum, hostname, binding, privacy settings and R2 inventory. The clean source is recoverable from commit `a52c961...`; Cloudflare retains version 13. The pre-revision verified rollback remains version 10 `0592e5d9-5648-4340-9f8d-3e27bf5511c7`, with its source and deployment instructions in `pre-editorial-revision-state-2026-11-19.json`.

## Approved gallery and diary update (2026-11-19)

The user approved two new 1536×1024 WebP illustrations for `/galleria`: Mendo and masculine-coded AI co-pilot Rei in a programming garage with Quebracho and Nadir, plus a closer Quebracho/Nadir garage scene. Both depict computers, wiring and a working garage; Nadir rests away from the keyboard. Gallery copy and alt text identify the four residents and describe the images as editorial illustrations. The old low-resolution gallery illustrations remain in private R2 but are removed from the Worker allowlist, so their public paths return 404. The bucket stays private; `r2.dev` remains disabled and no custom R2 domain is attached. Article cover mappings are preserved; selected dated diary cards that used the former low-resolution fallback now use the approved high-resolution illustrations.

Before publication, `pre-gallery-release-state-2026-11-19.json` records the exact live version 13, deployment 100%, source checksum and commit, Worker Domain, R2 binding, privacy settings and full 37-object inventory (3,819,656 bytes). The source hash was checked against the clean main tree. Cloudflare confirmed version 13 remains available as a deployment target. To restore the pre-change Worker, POST the recorded deployment body to the recorded Cloudflare deployments endpoint; it sets version `04bd4255-6d3f-4760-bd31-4d9f5904ca52` to 100% without changing the hostname or R2 contents. Verify `/healthz`, `/api/posts`, `/sitemap.xml`, `/robots.txt`, a previously assigned cover and both old gallery-image paths after a restore.

The preview candidate Worker comes from commit `daf7393a77b3303dbd50957d5aac575a01cd51c9`; its source is 888,664 bytes with SHA-256 `4b9b964105494a1de85cbb9348b69b5dcbe3ebd5d3a3fb56989eb32f3099949c`. It was uploaded to the separate `bikerblog-editorial-preview` Worker as version `55e31687-1607-4ff8-b1bd-44583588dbe6`, deployment `d77ba418-60d8-4a2a-a371-aefd788f603c`, at 100%. The preview binds only to the same private `BLOG_MEDIA` bucket and sends `X-Robots-Tag: noindex, nofollow`.

On the preview, 20 page/API routes returned 200, including English and Italian gallery, podcast and memorial pages; the two new images returned 200 at their full 277,010 and 200,186 bytes. Both retired gallery keys and one unknown media key returned 404 through the Worker. `/api/posts` returned 253 records (235 diary entries, 253 unique slugs); each diary quote is unique. The sitemap parsed with 261 URLs and robots still references it. Chromium loaded both images at 1536×1024 at 1440×1000 desktop and 390×844 mobile viewports, in Italian and English, with no horizontal overflow, missing alt text or initial-HTML metadata. The English description names all four garage residents. The bucket still has 37 private objects (3,819,656 bytes), `r2.dev` disabled and no custom domains.

## Production release after image approval (2026-11-20)

PR #9 was squash-merged as `2cfaa37c88d76d7d2ae3b3657ccc2484060e4871`. The deployed Worker is Cloudflare version 16 (`e86c35b5-5d06-4bab-bbd7-c2f0ecffed9b`), 100% active by deployment `3ce57ff2-b676-44c5-b571-1dbeec82face`. The exact `worker.mjs` in that merge is 888,664 bytes, SHA-256 `4b9b964105494a1de85cbb9348b69b5dcbe3ebd5d3a3fb56989eb32f3099949c`; the upload was sourced from the isolated preview Worker only after its content hash matched the clean merge worktree. The hostname still targets `bikerblog-recovery` with binding `BLOG_MEDIA` to `bikerblog-media`. Cloudflare confirms the bucket's managed `r2.dev` domain is disabled and it has no custom domains.

Post-deploy checks against `https://bikerblog.biker-link.net` passed for 20 URLs: home, archive, diary, timeline, diary category, authors, Italian and English gallery/podcast/memorial, representative original and diary articles, sitemap, robots, posts/featured/stats APIs and health. All returned HTTP 200. The API reports 253 posts, 235 diary entries, 253 unique slugs and 4 authors; all 235 diary asides are distinct. The sitemap contains 261 URLs and `robots.txt` still references it. The two approved R2 images returned HTTP 200 at 277,010 and 200,186 bytes; the two old low-resolution gallery paths and an unlisted key returned 404 through the Worker. Italian and English initial HTML include title, description, canonical and language alternates. Chromium verified both images decode at 1536×1024 on desktop (1440×1000) and mobile (390×844), with no horizontal overflow or missing alt text.

As a separate availability check, each of the 261 exact `<loc>` URLs in the live sitemap was requested directly by browser navigation at four concurrent requests. All 261 returned HTTP 200; there were no network errors or non-200 responses. This confirms the 203 URLs OpenSEO did not reach are crawl-coverage gaps, not inaccessible pages.

The pre-release backup `pre-gallery-release-state-2026-11-19.json` records the prior version 13, its deployment, source hash, Worker Domain and binding. Rollback is a 100% deployment of retained version `04bd4255-6d3f-4760-bd31-4d9f5904ca52`; the exact API request body is in that file. This restores the pre-gallery Worker without changing the domain or R2 objects. The current live state is recorded in `current-live-state-2026-11-20.json`.

The latest live OpenSEO crawl remains 58 of 261 sitemap URLs read and 203 not reached. That result describes OpenSEO coverage only: the direct live check above reached all 261 sitemap URLs successfully. OpenSEO was not rerun for this image release.

## Daily editorial update

A daily ChatGPT automation titled **Diario quotidiano BikerBlog** is scheduled in `Europe/Rome` around 19:19. It checks official BikerLink development sources and publishes only a meaningful, verifiable update. It avoids filler on quiet days, varied Nadir asides, and changes to the memorial; it validates the public URLs and metadata before deployment and reports rather than publishing if a safety check fails. This schedule is an external automation, not a Cloudflare Cron trigger or GitHub Actions workflow.
