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

## Production deployment and post-publication checks (2026-11-19)

The exact Worker source from commit `15ba0bb396584403f27fdd1ab201fdc7cd3e0041` was deployed after a clean detached worktree passed `node --check`. Its SHA-256 is `f7ae9f5c251e6335ff72cfd5949b5579c11ff5198108bfba80469cc35e9ce9ee` and its size is 902,394 bytes. The production deployment is `8ae534fb-5622-4871-b186-4b57b2704556`, version `0592e5d9-5648-4340-9f8d-3e27bf5511c7`, at 100%. The existing hostname remains attached to `bikerblog-recovery`; `BLOG_MEDIA` still binds to the private `bikerblog-media` bucket. No DNS, domain or R2 configuration was changed.

Production returned 200 for the home (Italian and English), archive, diary, timeline, category, tag, authors, gallery, memorial (Italian and English), podcast (Italian and English), origin article, representative diary article, sitemap, robots, health endpoint, featured-post API and stats API. `/api/posts` still returns 253 records, including 235 diary entries; all 253 slugs are unique. The 235 diary article pages returned 200 and have unique server-rendered titles. The post list, featured post, stats and health endpoints match the pre-publication contract and counts. Sitemap XML parses with 261 URLs: all 257 original URLs plus four translated static variants. The public robots file still references that sitemap.

The first post-publication OpenSEO root crawl read 50/50 pages with no blocked, rate-limited or failed fetches. Its 50 URLs exactly match the original 50-page sample. The earlier sample reported 48 short descriptions and 38 long titles; the new sample reports none of those issues and no duplicate titles. The only content issue in that sample is the 72-word memorial, which remains a concise dedication. Across 20 production crawls (seven capped at 50 pages and 13 targeted at 10 pages), the deduplicated union covers 58/261 sitemap URLs, plus 9 routes not listed in the sitemap: 0 blocked, 0 rate-limited, 0 errors and 203 sitemap URLs not reached. The crawler repeatedly returned to the same recent article links, so repeated rows are not counted as added coverage. Other short-page flags concern the memorial and brief utility pages whose missing factual content was not padded.

OpenSEO reported one 1,851 ms response for `/posts/diario-2026-11-04`; three immediate production rechecks returned 112–227 ms. This was transient. The author-filter URLs canonicalize to `/diario`, as intended. All 33 allowed media paths returned 200 after publication; the two unassigned R2 objects remain private and their public paths return 404. The bucket still has 35 objects, its `r2.dev` domain is disabled and no custom domains are attached.

## Diary aside revision and current rollback point (2026-11-19)

The production Worker is version 10, deployment `8ae534fb-5622-4871-b186-4b57b2704556`, serving 100% traffic. Its source is commit `15ba0bb396584403f27fdd1ab201fdc7cd3e0041`, SHA-256 `f7ae9f5c251e6335ff72cfd5949b5579c11ff5198108bfba80469cc35e9ce9ee`. Cloudflare's live source hash matched the checked-in file before this revision.

`pre-editorial-revision-state-2026-11-19.json` captures the current version, source commit and hash, production hostname, R2 binding, private-bucket status and inventory. The source is recoverable from the named Git commit; Cloudflare also retains version `0592e5d9-5648-4340-9f8d-3e27bf5511c7`. To roll back, create a 100% deployment with that `version_id` at `/accounts/{account_id}/workers/scripts/bikerblog-recovery/deployments`, using the JSON body recorded in the metadata file. This restores the exact pre-revision code without changing the domain or R2 objects. Verify `/healthz`, `/api/posts`, the 261-URL sitemap, robots, an assigned cover and the R2 private-domain setting after rollback.

Before revision, all 235 diary entries used the same “Commento non richiesto dalla redazione” heading. The section contained 21 distinct lines; nine repeated between 14 and 28 times. The edit removes the repeated heading, keeps the 12 one-off comments and one context-selected instance of each recurring line, and removes 214 duplicate occurrences. Technical narratives, sources, metadata, article paths, cover assignments and the memorial remain unchanged. `scripts/revise-bikerblog-asides.mjs` reproduces and checks the editorial transformation.

## Completing the OpenSEO sitemap crawl

The last 18 audits read 58 distinct sitemap URLs out of 261. Their 50-page runs repeatedly returned to recent articles from the same navigation links; 203 sitemap URLs were not reached, with no blocked, rate-limited or failed fetches.

The crawl plan uses six disjoint groups: five groups of 49 sitemap URLs and one group of 16. A temporary, unlisted `noindex,follow` seed page supplies one exact group per audit, so each run stays within OpenSEO's 50-page cap (one seed plus at most 49 targets). The seed pages are tested on the isolated preview first. On production, compare the union of the crawled URL set with the 261 exact `<loc>` entries, record each audit ID and fetch class, then remove the temporary route and deploy the reviewed Worker. Final checks confirm the seed route returns 404 and the public sitemap, robots, page canonicals, APIs and R2 behavior are unchanged.
