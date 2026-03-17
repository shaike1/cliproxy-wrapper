# OpenClaw Patches

These files patch openclaw's node_modules after install. Apply them after any openclaw upgrade.

## Files

- `anthropic.js` → `$(npm root -g)/openclaw/node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js`
- `agent-loop.js` → `$(npm root -g)/openclaw/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js`

## What's patched

**anthropic.js** — Adds non-streaming path for `model.provider === "cliproxy"`:
- CLIProxy has an SSE streaming bug that drops `tool_use` content blocks
- Fix: detect cliproxy provider and use `client.messages.create({ stream: false })` directly
- Tool calls are returned correctly every time

**agent-loop.js** — Removed debug logging only (no logic changes)

## Apply patches

```bash
OPENCLAW=$(npm root -g)/openclaw/node_modules
cp patches/anthropic.js $OPENCLAW/@mariozechner/pi-ai/dist/providers/anthropic.js
cp patches/agent-loop.js $OPENCLAW/@mariozechner/pi-agent-core/dist/agent-loop.js
systemctl restart openclaw-gateway.service
```
