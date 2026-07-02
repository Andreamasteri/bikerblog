---
name: Background processes die between bash tool calls
description: Why `node server &` / nohup / setsid in one bash tool call is gone by the next call, and how to test a real server without a workflow.
---

Starting a long-running process with `&`, `disown`, `nohup`, or even `setsid` in one bash tool invocation does **not** keep it alive into the next tool invocation — it gets reaped when that shell session ends, even though `ps aux` shows it running right after the launch line in the same call.

**Why:** each bash tool call appears to run in its own session/cgroup; detaching from the immediate shell isn't enough to survive across tool call boundaries, unlike a real Replit workflow (which is a supervised long-lived process).

**How to apply:** to manually smoke-test a server that has no registered workflow (e.g. testing a change before a workflow exists, or hitting an artifact's real HTTP port instead of a mocked handler), start the process **and** run the test curl/script in the *same* bash tool call, e.g. `(PORT=8080 node dist/index.mjs &) ; sleep 3; curl ...`. Do not assume a background server started in a previous call is still up — always re-verify with `ps aux` inside the current call before relying on it.
