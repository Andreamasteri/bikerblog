---
name: Valhalla tile build on TC (no-downtime rebuild)
description: How to rebuild Valhalla tiles on the ThinkCentre with the custom image without taking the serve container down, and the root-owned-cleanup gotcha.
---

# Rebuilding Valhalla tiles on TC without downtime

The custom `bikerlink/valhalla` image is bare upstream (`ENTRYPOINT=null`,
`CMD=/bin/bash`) — it has NONE of the gis-ops auto-build entrypoint that read
`build_tiles`/`force_rebuild`/`serve_tiles` env vars. So a tile build with the
custom image is a **manual binary pipeline**, not a single `docker run` with env:

```
build_config → build_admins → build_timezones → build_tiles → build_extract
```
each invoked as `docker run --rm -v <builddir>:/custom_files -v <pbf>:/custom_files/<pbf> <img> valhalla_build_* ...`
(mirror the flags in `infra/self-host/build-valhalla-tiles.sh`).

**No-downtime pattern:** build **out-of-place** into a separate dir (e.g.
`~/valhalla-build/data`) so the serve container keeps serving the OLD graph the
whole time; then swap the resulting `valhalla_tiles.tar` into
`infra/self-host/data/` and restart serve at the end. `build-valhalla-tiles.sh`
is the tested path but builds **in-place** in `self-host/data` and `stop`s the
serve container for the entire build (hours of downtime) — avoid it when the
serve must stay up.

## Root-owned cleanup gotcha (costs real time)

Docker on TC runs as root, so all build output (tiles, `*.bin`, sqlite,
`valhalla_tiles.tar`) is **root-owned**. TC has **no passwordless sudo**, so
`andrea` cannot `rm` a previous build's output directly. Clean it with a
throwaway root container instead of host sudo:

```
docker run --rm -v /home/andrea/valhalla-build:/wd <img> rm -rf /wd/data
```

**Why the final swap still needs no sudo:** `infra/self-host/data/` is
world-writable (777, no sticky bit), so `andrea` can unlink the root-owned old
`valhalla_tiles.tar` and drop the new one in, even though the files are root-owned
(delete permission depends on the directory, not the file owner).

## Version-match note

Build tiles with the **same** image version the serve container runs (both
custom, currently 3.7.x) to avoid tile-format incompatibility. If you rebuild the
image from a newer master first, rebuild tiles with that same new image, then
swap — and always verify `/status` + a sample route on the restarted serve BEFORE
deleting the old graph, so a bad graph can be rolled back.

## Swap mechanics confirmed (2026-07-05)

The serve container's `tile_dir` (a docker volume) is essentially empty (4KB) —
serve actually reads from `tile_extract` (the tar) only. So the swap is just:
rename old `infra/self-host/data/valhalla_tiles.tar` to `.bak`, copy the new tar
in, `docker restart` the serve container (back to healthy in ~15s). `timezone`
config path (`/custom_files/timezone_data/timezones.sqlite`) is a **separate**
static/global file untouched by tile rebuilds — a build script bug that fails to
write `timezones.sqlite` into the build workdir is a red herring, not a real
blocker; don't waste time chasing it into the swap path.

**Always baseline-test the OLD graph before restarting** — in this run the old
95MB tar was already returning `"No suitable edges near location"` for a real
Milan-area route (pre-existing production breakage, not caused by the rebuild).
Without a pre-restart baseline you'd wrongly blame the new build for an old bug.
