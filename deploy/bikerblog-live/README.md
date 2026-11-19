# Verified BikerBlog live Worker snapshot

This is a byte-for-byte source capture of the active production Worker, read from Cloudflare on 2026-11-19. It is **not** the older `recovery/cloudflare-bikerblog-worker.mjs` checked into the repository.

- Worker: `bikerblog-recovery`
- Active version: `11fa7928-fdcd-4d18-bbda-fbf46597ef5a` (version 8)
- Active deployment: `d87a13a5-1490-4b72-9ade-fd4d3c64bfec`
- Source size: 885,436 bytes
- SHA-256: `f50ac3c61e2368cb05e98ed937583edef1979620a9c82243593dc65e1c1f4c81`
- Binding: `BLOG_MEDIA` → private R2 bucket `bikerblog-media`
- Worker secrets: none
- Hostname: `bikerblog.biker-link.net`, Cloudflare Worker Domain in zone `biker-link.net`
- R2 `r2.dev`: disabled; custom bucket domains: none
- R2 inventory: 35 objects (33 editorial WebP + 2 pre-existing illustrations), 3,342,460 bytes

The snapshot preserves the production `ARCHIVE` (253 posts, including 235 diary entries, four authors and six comments), all current route logic and the article-to-image assignments. The image objects stay in R2; their keys and integrity metadata are in `backup-metadata.json`.

## Verify this backup

From this directory:

```sh
sha256sum worker-v8-live-snapshot-2026-11-19.mjs
node --check worker-v8-live-snapshot-2026-11-19.mjs
```

Compare the SHA-256 output with the value above and `snapshot.sourceSha256` in `backup-metadata.json`. The R2 inventory can be compared with the same manifest; the bucket contents are not modified by restoring the Worker.

## Restore procedure

Keep a Cloudflare API token in the shell environment only. It needs permission to edit Workers and read the bound R2 bucket. Never add it to Git.

1. Check out the commit that introduced this snapshot, then verify its SHA-256.
2. Save a temporary `worker-metadata.json` with this configuration:

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

3. Upload the snapshot source as `worker.mjs` with the Cloudflare Workers multipart upload endpoint. The upload updates the existing `bikerblog-recovery` service; its Worker Domain stays attached.

   ```sh
   curl --fail-with-body --silent --show-error \
     -X PUT \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -F "metadata=@worker-metadata.json;type=application/json" \
     -F "worker.mjs=@worker-v8-live-snapshot-2026-11-19.mjs;type=application/javascript+module" \
     "https://api.cloudflare.com/client/v4/accounts/d116d3d97b133c543d02934be4bc98d2/workers/scripts/bikerblog-recovery"
   ```

4. Confirm the deployment is active at 100%, the Worker Domain still targets `bikerblog-recovery`, and `/healthz`, `/api/posts`, `/sitemap.xml`, `/robots.txt`, `/in-memoria` and representative `/media/` URLs return successfully. Confirm R2 `r2.dev` remains disabled.

The active version and domain metadata in `backup-metadata.json` are a record of the state captured here; do not substitute the stale Worker under `recovery/`.
