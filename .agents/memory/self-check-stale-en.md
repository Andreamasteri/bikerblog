---
name: self-check staleEn detection
description: self-check.ts detects stale body_en between dev and prod
---

## Rule
The `checkGap()` function now flags `staleContent: true` when:
- `staleIt`: prod.excerpt !== dev.excerpt (IT content changed)  
- `staleEn`: dev.bodyEn exists, prod.bodyEn exists, and they differ

**Why:** Previously only compared IT excerpt. After bulk translate-backfill, all 77 posts had new real EN translations in dev but old IT fallback in prod — self-check said "tutto allineato" and didn't push.

**How to apply:** Runs automatically on every `self-check` invocation. When translations are updated in dev, self-check will detect STALE and auto-push via `/_internal/seed-posts`.
