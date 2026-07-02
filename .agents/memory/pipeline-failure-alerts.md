---
name: Pipeline failure alerts
description: How the nightly pipeline notifies on failure/silent runs, and the design constraints for that notify module.
---

The nightly pipeline (`cluster:daily`) sends an alert only on failure or an
unexpectedly silent run (0 posts published and 0 audio generated despite
running actionable steps) — never on success.

**Why:** the pipeline runs unattended overnight; a hard failure or a "did
nothing" run can otherwise go unnoticed until someone checks the blog the
next morning.

**How to apply:**
- Notification channels (email/Slack/Telegram or similar) should be
  configured purely via env vars, fan out to *all* configured channels
  (not just the first available), and must never throw or exit non-zero —
  a broken notification channel must never take down the pipeline itself.
  Missing config for all channels is a no-op with a logged warning, not
  an error.
- When adding new pipeline steps that produce "supposed to have done X but
  did 0" signals, feed those counts into the same alert decision rather
  than creating a second parallel notification path.
- Any step's error-handling catch block must set a failure flag and fall
  through to the end-of-run finalize/notify block — never `throw`/`exit`
  early from inside a step's catch. An early throw skips the alert entirely,
  silently defeating the whole point of the notification system.
- The cron process runs separately from the api-server workflow, so any step
  that needs to prove a *real* external dependency works (e.g. a tunnel to a
  self-hosted service) must hit the public production URL, not localhost —
  localhost only proves the cron process itself is alive, not the dependency.
  Feed the failure into the same `criticalWarnings` array other soft-failing
  steps use, rather than inventing a parallel alert path.
