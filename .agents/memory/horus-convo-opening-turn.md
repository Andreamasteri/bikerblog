---
name: Multi-agent conversation opening-turn prompt
description: Why the Horus<->Bowie observable conversation needs a distinct "opening" system prompt for turn 1, separate from the "reply" prompt used afterward.
---

When two LLM agents take turns replying to each other from an empty transcript, a system prompt that unconditionally says "respond to what the other agent just said" will make the first speaker hallucinate a prior turn that never happened (confirmed live: Horus's opening line summarized "what Bowie said" before Bowie had spoken).

**Why:** the prompt's framing, not the model, causes this — the model has no way to distinguish "you're opening" from "you're replying" unless the prompt says so explicitly. Static single-purpose system prompts silently assume a reply-in-progress context that isn't true on turn 1.

**How to apply:** any turn-taking multi-agent flow needs (at least) two prompt variants selected by `transcript.length === 0` (or equivalent): an opening variant that reacts to the human-provided topic directly and explicitly says the other agent hasn't spoken yet, and a reply variant for all subsequent turns. Don't try to make one prompt cover both cases.
