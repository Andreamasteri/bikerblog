---
name: translate-backfill auth fix
description: Why translate-backfill.ts must pass AI proxy env vars explicitly to Anthropic SDK
---

## Rule
Always initialize the Anthropic SDK with explicit env vars:
```typescript
const client = new Anthropic({
  baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
  apiKey:  process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "dummy",
});
```

**Why:** `new Anthropic()` without arguments looks for `ANTHROPIC_API_KEY` (standard), not the Replit AI proxy vars (`AI_INTEGRATIONS_ANTHROPIC_*`). Throws "Could not resolve authentication method" at module init, before any API call.

**How to apply:** Any new script that imports @anthropic-ai/sdk must use this pattern. Affects translate.ts (already correct), translate-backfill.ts (fixed), and any future scripts.
