# CLIProxyAPI

Local proxy that routes Anthropic API calls through a Claude Code Max OAuth subscription — no API key needed.

## Architecture

```
Client (OpenClaw / Anthropic SDK / etc.)
    ↓
wrapper.js :8318   ← Node.js throttle + rate-limit rewrite
    ↓
cli-proxy-api :8317  ← CLIProxy Go binary (Claude Max OAuth)
    ↓
Claude Max API (claude-sonnet-4-6 / opus-4-6)
```

## Components

### cli-proxy-api (Go binary)

The core proxy — handles OAuth authentication with Claude Max, credential rotation, and request routing. Supports multiple providers:

- **Claude** (OAuth + API key)
- **Gemini** (API key + OAuth via gemini-cli/vertex/aistudio)
- **Codex** (API key + OAuth)
- **OpenAI-compatible** (OpenRouter, etc.)
- **Vertex API**
- **Amp integration**

Config: `config.yaml` (see `config.example.yaml` for all options).

### wrapper.js (Node.js throttle layer)

HTTP proxy on port 8318 that sits in front of cli-proxy-api:

- **Throttles** `/v1/messages` — minimum 1s between requests, max queue of 8
- **Rewrites** CLIProxy `400` rate-limit errors → `429` for proper client handling
- **60s cooldown** after rate limit to let the OAuth session recover

### patches/ (OpenClaw fixes)

Patches for OpenClaw's node_modules:

- **anthropic.js** — Non-streaming fix for cliproxy/copilot-proxy/gh-proxy providers (CLIProxy has an SSE bug that drops `tool_use` blocks)
- **agent-loop.js** — Cleaned debug logging

See `patches/README.md` for apply instructions.

## Deployment

### Docker (recommended)

```bash
# Edit config.yaml first
docker compose up -d
```

Exposes ports 8317 (direct) and 8318 (throttled). Config is mounted read-only; auth dir is persisted via volume.

### Systemd

```bash
cp cliproxyapi.service /etc/systemd/system/
systemctl enable --now cliproxyapi.service
```

Runs both cli-proxy-api and wrapper.js via `docker-entrypoint.sh`.

### Manual

```bash
./cli-proxy-api &
node wrapper.js
```

## Client setup

Point your Anthropic SDK client at `http://<host>:8318` with an API key from `config.yaml`.

## Files

| File | Description |
|------|-------------|
| `cli-proxy-api` | Go binary — core proxy |
| `wrapper.js` | Node.js throttle layer |
| `config.yaml` | Runtime config (gitignored) |
| `config.example.yaml` | Config template |
| `Dockerfile` | Container image build |
| `docker-compose.yml` | Docker deployment |
| `docker-entrypoint.sh` | Runs both processes |
| `cliproxyapi.service` | Systemd unit |
| `patches/` | OpenClaw patches |
| `static/` | Management UI assets |
