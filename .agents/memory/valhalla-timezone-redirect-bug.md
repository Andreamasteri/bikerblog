---
name: Valhalla timezone build — stdout redirect + chattr timing
description: Root cause of timezones.sqlite "mysteriously disappearing" across multiple Valhalla tile rebuilds on TC, and the correct way to protect the file with chattr.
---

## The bug

`valhalla_build_timezones` does not write to a file — it streams the built
sqlite to **stdout**. The build wrapper script called it via
`docker compose run --entrypoint ... valhalla_build_timezones -c "$JSON"`
with no output redirection, so the binary sqlite content was silently
dumped into the build log instead of being written to
`/custom_files/valhalla_tiles/timezones.sqlite`. The file was never
reliably created in the right place — auditd/inotify tracing across
several rebuild attempts confirmed **zero filesystem events ever fired**
for that path, which is what proved the cause was "never written" rather
than "written then deleted by something else."

**Why:** three prior rebuild attempts all "lost" the timezone db and each
was chased as if it were an external race condition (permissions, a stale
watcher, a cleanup step). It was actually a missing shell redirect.

**How to apply:** when a `docker compose run` step is supposed to produce
a file but the container image's binary writes to stdout, redirect inside
the container's shell explicitly, e.g.:
`docker compose run --rm -T <svc> sh -c 'binary_name > "/path/inside/container/output.file"'`
Do not assume `--entrypoint`/bare `run` invocations write to the expected
mounted path — verify with `docker compose run --entrypoint cat` or an
inotify watch before trusting the pipeline.

## The chattr-timing trap (self-inflicted, while debugging)

A watcher meant to protect `timezones.sqlite` from being deleted after
creation used `chattr +i` on `inotifywait` events including `ATTRIB`/`CREATE`.
Since the file is created empty first (shell `>` truncates/creates it) and
then written to progressively as the container process streams to it,
applying `chattr +i` on the *first* event locked the file while still
empty — the container's own write to it then failed with
`Operation not permitted`, breaking that build attempt.

**Why:** immutability (`chattr +i`) blocks all writes, not just deletes;
triggering on file *appearance* instead of *write completion* protects an
empty stub, not the finished artifact.

**How to apply:** only apply `chattr +i` on `CLOSE_WRITE` (the writer
closed its file descriptor), never on `CREATE`/`ATTRIB`/`MODIFY`. Any
future "protect a file being built inside a container" watcher should key
off `close_write` exclusively.

## Leftover tar blocks the final extract step

`valhalla_build_extract` writes `/custom_files/valhalla_tiles.tar`, which
docker-compose maps to `infra/self-host/data/valhalla_tiles.tar` on the
host (a bind mount, NOT the `valhalladata` named volume that holds
`0/`,`1/`,`2/`,`admins.sqlite`,`timezones.sqlite`). It refuses to overwrite
an existing tar (`CRITICAL: File exists. Specify --overwrite`). A tar left
over from a prior, incomplete/wrong build attempt silently blocks this
final step on the next run.

**How to apply:** before the extract step (or when resuming after a
failed prior run), check/clear `infra/self-host/data/valhalla_tiles.tar`
on the host — it lives outside the volume that gets cleaned when you wipe
`0/1/2/*.sqlite`. If only this final step failed, you can safely rerun
just `docker compose run --rm -T valhalla valhalla_build_extract -c
/custom_files/valhalla.json -v` directly — no need to redo the multi-hour
`valhalla_build_tiles` stage.
