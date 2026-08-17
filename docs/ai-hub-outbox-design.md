# AI-Hub outbox design (not applied)

BikerBlog keeps its existing store and conversation tables. This document
describes the future transactional boundary; it is not a migration and does
not write to any database.

The transaction that records an AI intent should also append an outbox record
with source app, correlation/conversation/turn references, requested agent,
capability, an allowlisted payload and a unique idempotency key. A dispatcher
claims records with a lease, submits to AI-Hub and records hub_job_id,
attempts, retry timing, archive state and safe error metadata.

The future outbox must remain separate from BikerBlog's existing task/review
records and from ai_coordinator_jobs and ai_vps_jobs. It must never execute
commands from a prompt.

The audio capability is audio.create_soundtrack, labelled Crea colonna
sonora, assigned to Nadir. The actual mode is referenced as
nadir.audio_creation and remains replaceable configuration owned by Nadir.
