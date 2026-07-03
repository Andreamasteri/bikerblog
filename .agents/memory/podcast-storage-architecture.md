---
name: Podcast audio storage architecture
description: Why podcast MP3s are private GCS objects streamed through an API route instead of public URLs, and the token used for script→server uploads.
---

## Design

Generated podcast MP3s are uploaded to a GCS bucket with public access prevention enabled (private objects, no public URL). The frontend never gets a direct GCS link — it plays `GET /api/podcast/audio/:slug`, an api-server route that streams the object through the Replit GCS sidecar and sets the appropriate audio content-type/headers.

**Why:** keeping the bucket private avoids exposing bucket internals/object paths publicly and keeps all access auditable through one server-controlled route, consistent with the threat model's stance on object-storage write/read boundaries.

**How to apply:** any new consumer of podcast audio (RSS feed, download link, etc.) must go through the same `/api/podcast/audio/:slug` route rather than constructing a GCS URL directly.

## Upload path constraint

The GCS sidecar client only works inside the api-server workflow process — it is not available from a plain bash shell or from the `code_execution` sandbox. Scripts that generate audio (e.g. `podcast:generate`) cannot upload directly; they call `POST /api/_internal/podcast-store` on the running api-server, which does the actual GCS write.

**Why:** the sidecar auth/credentials are wired into the workflow's runtime environment, not available as ambient env vars a standalone script process can use.

**How to apply:** any future script that needs to write to GCS must add/reuse an internal API route on the api-server rather than trying to call the GCS client directly from the script process.
