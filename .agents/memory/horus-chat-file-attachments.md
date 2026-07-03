---
name: Horus/Bowie/Quebracho chat file attachments
description: How file send/receive was implemented for the admin web chat, and why it's client-side only.
---

The user asked for the AI chat (Horus/Bowie/Quebracho direct chat tabs, password-gated `/horus`) to
support sending and receiving files "of any type". None of the Ollama models used here
(`bikerlink:latest`, Bowie's/Quebracho's models) are multimodal — they can only consume text.

**Decision:** implement this entirely client-side in `AgentChatPanel`
(`artifacts/bikerblog/src/pages/agent-chat-panel.tsx`), no new backend route or storage:

- **Receiving a file**: on attach, the browser reads the file. If it looks texty (MIME `text/*`,
  a handful of known text MIME types, or a texty extension), its content (capped ~6000 chars) is
  prepended to the outgoing message as a `[File allegato: ...]` block. Otherwise only
  name/type/size are included, with an explicit note that binary content can't be read — never
  silently pretend to have read an image/PDF/etc.
- **Sending a file**: a "Scarica come file" button under each assistant bubble downloads that
  message's text as a `.txt` Blob client-side. There is no real file generation by the model.

**Why:** honesty about model capability (core principle: no silent fallbacks / fake capabilities)
plus scope minimization — a real upload/storage pipeline (object storage, DB refs, size limits
across the 1MB JSON body cap) wasn't needed since the model can't do anything useful with binary
content anyway, and history is already resent as plain text.

**How to apply:** if a future request wants the AI to actually *see* images or *generate* real
files (PDF, docx, etc.), that requires a genuinely different model in the pipeline
(a multimodal Ollama model or a different provider) — reuse the codegen/AGENT_DEFINITIONS pattern
in `artifacts/api-server/src/routes/horus.ts` but don't reuse the text-extraction shortcut above.
