---
name: Valhalla elevation build quirks (bikerlink/valhalla image)
description: Non-obvious gotchas hit while running valhalla_build_elevation -t against the self-hosted bikerlink Valhalla stack — read before any future elevation/full-option rebuild.
---

## `-t` (tile-derived extent) needs the raw tile directory populated, not just the tile_extract tar

The self-host compose setup keeps built tiles in two places:
- a bind-mounted `valhalla_tiles.tar` (tile_extract, used by the live server for fast startup)
- a separate **named Docker volume** (`<project>_valhalladata`) mounted at the tile_dir path, holding loose `.gph` files

`valhalla_build_elevation -t` reads tile geometry from the tile_dir (loose `.gph` files) to compute which elevation tiles are needed — it does **not** read the tile_extract tar. If the last build only produced the tar (or the volume was pruned/recreated), the tile_dir will be empty and `-t` silently reports "Downloaded 0 tiles. Exiting." with no error.

**Fix:** extract the tar into the tile_dir volume first (`tar -xf valhalla_tiles.tar -C <tile_dir>`, paths inside the tar already match the tile hierarchy, e.g. `0/001/914.gph`) before running `-t`. Safe to leave extracted alongside a future full rebuild since tile paths are deterministic and get overwritten in place.

**Why:** cost ~10 min of debugging a silent "0 tiles" exit before checking actual volume contents via `docker compose run ... find`.

## lz4 elevation compression is unavailable in the `bikerlink/valhalla:latest` image

`valhalla_build_elevation`'s lz4 path goes through Python (`import lz4`), and this image's Python 3.12 environment does not have the `lz4` module installed. Requesting `-z` (lz4) makes **every single tile** fail with `CRITICAL: Could not import lz4. Please install lz4 or use another compression format.` — the job still "runs" and exits, so it looks like it worked unless you grep the log for CRITICAL.

**Fix:** use gzip compression (drop the `-z` flag) — no extra dependency needed, works out of the box. Only switch back to lz4 if the image is rebuilt with `python3-lz4` (or the pip package) installed.

**Why:** user had asked for lz4 specifically for space efficiency; had to make a pragmatic deviation to gzip to unblock the actual elevation download. Revisit if/when a custom image build becomes worthwhile.
