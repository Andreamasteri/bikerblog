---
name: TC geo/STT services (Whisper, Nominatim, Valhalla) — auth & contracts
description: How the Fase 2e routing/geocoding/STT services on TC are exposed and authenticated, plus their real HTTP contracts and a known broken ingress.
---

## Auth scheme: Cloudflare Access, NOT nginx gate tokens

`whisper` / `nominatim` / `valhalla` on TC are exposed at
`<name>.biker-link.net` and protected by a **Cloudflare Access application**
(service token) — the SAME scheme as Ollama and SSH, NOT the nginx
`X-<Service>-Gate-Token` scheme used by Nadir/Hub/SearXNG/analysis.

**Why:** they are stock Docker images (`onerahmet/openai-whisper-asr-webservice`,
`mediagis/nominatim`, `bikerlink/valhalla`) with no gate-token capability, and
there is **no nginx/caddy** reverse proxy on TC in front of them — so the only
possible protection is CF Access at the edge. Auth uses the already-present
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`. No `*_GATE_TOKEN` secret is
needed for these three (setting one would just be an ignored extra header).

**How to verify auth for any new TC service** (the tunnel is a dashboard-managed
token tunnel — `cloudflared tunnel run --token …`, no local `config.yml`, so
ingress/Access config is NOT readable from the box, and `CLOUDFLARE_API_TOKEN`
is DNS-only so it can't read Zero Trust either): probe the public hostname twice
from Replit bash — once with no auth, once with `CF-Access-Client-Id/Secret`
headers. `403 → non-403` proves CF Access; a working gate-token service would
instead need its `X-…-Gate-Token`.

## Real HTTP contracts (verified live 2026-07-05)

- **Whisper** = `openai-whisper-asr-webservice`: `POST /asr` (NOT `/transcribe`),
  audio as **multipart field `audio_file`**, and `task`/`language`/`output`/
  `encode` as **query params**. `output=txt` returns the transcription as the
  plain-text body (not JSON). Real IT clip transcribed in ~5.8s.
- **Nominatim**: `GET /search?q=&format=jsonv2` and `/reverse` — standard. ~1.2s.
- **Valhalla**: `POST /route` with `{locations, costing, directions_options}`;
  `GET /status` for health.

## SSRF guard on `transcribe_audio` audio download

`transcribe_audio` downloads a model/user-supplied `audioUrl` before posting it
to Whisper — and the chat tool-loop is internet-reachable (see `threat_model`),
so an unrestricted fetch would be an SSRF into internal targets. Guard:
`validateAudioUrl()` allows **https only**, blocks IP literals / `localhost` /
private ranges, and requires the host to be in an **exact allowlist**
(`approvedAudioHosts()` = the configured AI Hub host today). CF Access
credentials are forwarded **only** to those allowlisted hosts — never by
`*.biker-link.net` suffix match. **Why:** the first cut forwarded CF creds by
domain suffix and fetched any URL, which the architect flagged as a blocking
SSRF/credential-leak. If audio ever needs to come from another origin, add its
exact host to the allowlist (and decide whether it needs CF creds).

## Graphs/datasets not yet generated on TC — root cause of geo failures

Live power-mode probe (2026-07-05) + user confirmation: **Valhalla and Nominatim
error not because of code or Cloudflare ingress, but because their graphs/data
have not been generated on TC yet.**

- **Valhalla** → `/route` AND `/status` both return **502** at the edge (Access
  passes, origin down): the container isn't serving because the **routing tiles
  (graph) are missing**. It won't answer until tiles are built on TC.
- **Nominatim** → reachable + authed (~0.5–1s) but loaded with only the
  **Andorra sample extract**, not IT/EU: "Milano"/"Roma" match Andorran streets,
  "Bormio"/"Stelvio" return 0 results, reverse-geocode of Italian coords returns
  just "Italia". Geocoding-by-name is unusable until the correct OSM extract is
  imported.
- **Whisper** works end-to-end (verified live, ~9.2s on a short IT clip).

**Why it matters:** don't re-diagnose this as a repo bug or a CF ingress
misconfig. The BikerBlog code is correct and degrades with a clear error (no
silent fallback). The fix is TC-side data provisioning (build Valhalla tiles,
import the right Nominatim extract) — outside this repo and the agent's reach
(DNS-only CF token). Re-run the geo end-to-end verification once graphs exist.

## GraphHopper — copertura regionale (probe 2026-07-07)

`GRAPHHOPPER_URL = https://gh.biker-link.net` è ora configurato come env var
su Replit (stesso pattern di `VALHALLA_URL`/`NOMINATIM_URL`). Il client e il
tool `route_via_graphhopper` esistono in `lib/horus/src/tools.ts` e si attivano
quando la variabile è presente.

**Probe regionale completa (2026-07-07)** — tutti i path e tutte le regioni:

| Zona | Path testato | Risultato |
|---|---|---|
| Arco Alpino (Mira VE → Cortina) | `/route` | 502 |
| Iberia (Barcellona → Madrid) | `/route` | 502 |
| Germania (Berlino → Monaco) | `/route` | 502 |
| Balcani (Ljubljana → Zagreb) | `/route` | 502 |
| Centro/Sud Italia (Roma → Napoli) | `/route` | 502 |
| Est (Wien → Budapest) | `/route` | 502 |
| Tutti i path variant | `/`, `/health`, `/info`, `/api/route`, `/v1/route` | 502 |

**CF Access funziona** (403 senza credenziali → corretto). Il 502 uniforme su
tutti i path e tutte le regioni indica che il backend (i container su TC) non è
raggiungibile via tunnel — stesso pattern di Valhalla (tiles mancanti/container
down). Non è un problema di codice o CF Access config.

**Copertura osservata:** non determinabile — service down. Non è possibile
distinguere "smart proxy" da "singolo container" senza accesso SSH a TC.

**Prossimo passo:** verificare su TC se i container `bikerlink-gh-*` sono up
(`docker ps | grep bikerlink-gh`) e se il CF Tunnel li raggiunge sulla porta
giusta. Una volta up, la probe va rieseguita.

## Routing engine choice is open (Valhalla vs GraphHopper)

TC runs BOTH `bikerlink-valhalla` AND 8 regional GraphHopper containers
(`bikerlink-gh-{germania-centro,arco-alpino,iberia,francia-benelux,est,balcani,
grecia,ecuador}` on 127.0.0.1:8990-8997). Fase 2e wired routing to Valhalla per
the task spec, but the regional GraphHopper fleet suggests routing may actually
be intended to run through GraphHopper. Confirm with the user before building
route composition on top of the atomic `route_directions` tool.
