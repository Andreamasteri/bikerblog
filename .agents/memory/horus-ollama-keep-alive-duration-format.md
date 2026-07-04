---
name: Ollama keep_alive duration format
description: Why keep_alive must be sent as a number, not the bare string "-1", when talking to Ollama's /api/chat.
---

`keep_alive` in Ollama's `/api/chat` body accepts either a duration string
WITH a unit suffix (e.g. `"30m"`, `"-1s"`) or a bare number of seconds (e.g.
`-1`). Sending the string `"-1"` with no unit gets forwarded to Go's
`time.ParseDuration`, which rejects it with `400 Bad Request — "time:
missing unit in duration \"-1\""`.

**Why:** the client (`lib/horus/src/client.ts`) needs `keep_alive: -1` to
keep the model resident in RAM indefinitely (user policy — avoid reload cost
after idle gaps), but the original code passed it as the string `"-1"`,
which worked for a while and then started failing 400 on every chat call
once something (Ollama version or path) started strictly validating the
duration string.

**How to apply:** when setting `keep_alive` (or any Ollama duration-like
field) to `-1`/"forever", always use the bare number `-1`, never the string
`"-1"`. If a string is needed for some reason, it must include a unit
(`"-1s"`). This applies to any future Ollama API caller in this repo, not
just the main Horus client (see also `deploy/horus-nadir/server.js`, which
already used the numeric form correctly).
