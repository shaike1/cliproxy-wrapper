# cliproxy-wrapper

Node.js HTTP throttle wrapper for [CLIProxyAPI](https://github.com/router-for-me/Cli-Proxy-API) — a local proxy that routes Anthropic API calls through a Claude Code Max OAuth subscription.

## Architecture

```
OpenClaw bot (or any Anthropic SDK client)
    ↓
wrapper.js :8318   ← throttle + rate-limit rewrite
    ↓
cli-proxy-api :8317  ← CLIProxy Go binary (Claude Max OAuth)
    ↓
Claude Max API (claude-sonnet-4-6 / opus-4-6)
```

## What wrapper.js does

- **Throttles** `/v1/messages` requests: 3s minimum between requests to CLIProxy, max queue depth of 8
- **Rewrites** CLIProxy `400` rate-limit errors → `429` so upstream clients handle them correctly
- **30s cooldown** after CLIProxy rate limit: sets `lastRequestTime = Date.now() + 27000` so the next queued request waits 30s, giving the OAuth session time to recover

## Why the 30s cooldown

CLIProxy uses a Claude Max OAuth token which has rate limits. When it returns a `400 {"error":{"message":"Error"}}`, the wrapper rewrites to `429` and applies a 30-second cooldown before the next upstream request. This prevents rapid retry loops from exhausting the quota.

## Setup

```bash
node wrapper.js
# Listens on :8318, forwards to :8317
```

Or use the included systemd service:

```bash
cp cliproxyapi.service /etc/systemd/system/
systemctl enable --now cliproxyapi.service
```

Configure your Anthropic client to point at `http://localhost:8318` with any API key that matches `config.yaml`.
