---
name: Weak-model textual tool calls
description: Small Ollama models can emit a tool call as JSON text in the reply content instead of a native tool_calls field; the direct-chat handler must detect and execute it rather than showing the raw JSON to the user.
---

## The problem

Horus/Bowie/Quebracho direct chats run a tool loop (`createDirectChatHandler` in
`artifacts/api-server/src/routes/horus.ts`) that only ever checked the native
Ollama `message.tool_calls` field. `bikerlink:latest` (Horus) supports this
reliably, but Bowie's `llama3.2:3b` sometimes doesn't invoke the tool
mechanism at all — instead it writes the tool call out as plain JSON text in
the reply, e.g.:

```
{"name": "remember_note", "parameters": {"note": "..."}}
```

Since `toolCalls` was empty, the loop treated that JSON text as the final
reply and streamed it straight to the user as a raw, ugly blob — the tool was
never actually executed.

**Why:** smaller/quantized models are less reliable at native function-calling
even when the tools are correctly passed in the request; they "describe" the
call in text instead of using the structured mechanism. This is a known class
of behavior, not specific to one prompt.

## The fix

`tryParseTextualToolCall(content, tools)` (same file) is a fallback: when the
native `toolCalls` array is empty, it tries to find a `{ "name": ..., "parameters"|"arguments": {...} }`
JSON blob in the content and, only if the name matches an actually-available
tool, converts it into a synthetic tool call so the loop executes it for real.
If it doesn't match a known tool name/shape, it returns `null` and the
original text-as-final-reply behavior is preserved (so normal conversational
replies that happen to contain `{ }` aren't misdetected).

**How to apply:** any new agent chat surface (web or CLI) that offers tools to
a model without confirmed reliable native function-calling should run this
same fallback before treating `content` as the final answer. If a future
model shows a different textual pattern (e.g. wrapped in markdown code
fences, or using `<tool_call>` tags), extend the detection here rather than
adding a second parallel mechanism.
