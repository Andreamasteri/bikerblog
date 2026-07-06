---
name: TC host firewall (ufw) hardening
description: What the TC ufw ruleset looks like and why — dual LAN IP, dead internet-facing rules removed, SSH scoped to LAN.
---

TC is dual-homed on the LAN: `192.168.1.35` (wired `lan0`, static, no default route —
only up when an ethernet cable is connected) and `192.168.1.36` (wifi dongle
`wlxccbabdb51e2e`, static, currently the active path). Any firewall rule meant
to scope "TC's own LAN identity" or "the home LAN" must use the
`192.168.1.0/24` subnet, not a single host IP, since which of the two is live
varies.

Ufw (`sudo ufw status numbered`) had legacy "Anywhere" (0.0.0.0/0 + ::/0)
inbound rules for `80/tcp`, `443/tcp`, `6380/tcp` and `22/tcp` with nothing
actually listening on 80/443/6380 (verified via `ss -ltnp` + `docker ps` +
iptables NAT — no host process, no docker port mapping). These were removed
2026-07-06: real public exposure for every TC service already goes through
the Cloudflare Tunnel (services bind `127.0.0.1`, tunnel terminates to
loopback, unaffected by inbound ufw rules on external interfaces) — a raw
open port with nothing behind it today is only downside (accidental exposure
if something ever binds `0.0.0.0` there) with zero upside.

SSH (`22/tcp`) was narrowed from "Anywhere" to `192.168.1.0/24` only. This
does NOT affect the Cloudflare Access SSH path (`ssh.biker-link.net` →
`ssh://localhost:22`, reached via loopback from the outbound cloudflared
tunnel) or the existing `tailscale0` allow rule — both keep working. Verified
post-change by re-running an SSH command through the cloudflared ProxyCommand
path.

**Why:** minimize internet-facing attack surface on a home server whose only
intended public access path is the Cloudflare Tunnel + Access; dead open
ports are a common way an accidental future bind becomes an unauthenticated
internet-reachable service.

**How to apply:** any new *legitimate* need for external non-Cloudflare
access should be added back deliberately and scoped (LAN subnet, or a
specific docker-bridge subnet like the existing `3010`/`11434` rules), never
as a bare "Anywhere" rule.

**Tailscale is fully decommissioned on TC (2026-07-06)** — do not reference it
or re-add ufw rules for a `tailscale0` interface. It was removed at the
network level earlier, but the ufw `tailscale0` allow rules (v4+v6) and the
leftover `tailscale-archive-keyring` package + `/etc/apt/sources.list.d/tailscale.list`
apt source survived until this cleanup; all three are now gone. The only
remaining "tailscale" mentions on TC live inside the BikerLink app repo itself
(scripts, docs, a migration note `MIGRA-DA-TAILSCALE.md`) — that repo's code
is off-limits for the agent to edit directly (per user instruction), so those
are reported to the user rather than changed here.
