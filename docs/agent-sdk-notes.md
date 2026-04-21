# Claude Agent SDK — Integration Notes

OpenAlice's `agent-sdk` backend wraps `@anthropic-ai/claude-agent-sdk`. That SDK spawns the `claude` CLI as a subprocess; we pipe IO and inject auth via env. This doc captures what we rely on, what we can't, and how to debug.

For the broader provider picture (why agent-sdk vs codex vs vercel-ai-sdk), see `src/core/ai-provider-manager.ts`. This file is specifically about the agent-sdk quirks.

## Why agent-sdk at all

Third-party vendors (Moonshot/Kimi, Zhipu/GLM, MiniMax) publish **Anthropic-compatible endpoints** (`.../anthropic`) as their blessed path for Claude-Code-style tooling. Pointing `@anthropic-ai/claude-agent-sdk` at those endpoints via `ANTHROPIC_BASE_URL` lets OpenAlice reuse one backend for Claude Pro/Max OAuth, Claude API-key, and those third parties — no separate Vercel-AI-SDK route needed.

First-party Claude is of course also served by this backend; OpenAI / Codex stays on the codex backend.

## Env-var contract we rely on

Injected in `src/ai-providers/agent-sdk/query.ts` per-request, based on the resolved profile:

| Env | When we set it | What the CLI does |
|---|---|---|
| `ANTHROPIC_API_KEY` | API-key mode (any vendor) | Used for `/v1/messages` auth |
| `ANTHROPIC_BASE_URL` | Any custom endpoint | Used as base for `/v1/messages` + most first-class paths |
| `CLAUDE_CODE_SIMPLE=1` | API-key mode | Strips CLI-local behaviors (see below) |
| `forceLoginMethod: 'claudeai'` (sdk option) | OAuth mode | Forces OAuth over any env-supplied key |

In OAuth mode we `delete env.ANTHROPIC_API_KEY` + `delete env.CLAUDE_CODE_SIMPLE` so the CLI uses its local `~/.claude` credentials.

### `CLAUDE_CODE_SIMPLE` — what it actually does

This flag is **not** "force API-key mode". It turns off Claude Code CLI's interactive-session extras so the SDK gets a minimal, programmatic agent loop:

- Skip loading project/user `CLAUDE.md` files
- Disable `skills/` discovery and triggers
- Skip attachments (`@file` mentions, MCP resources inlined)
- Skip team tools
- Replace the full Claude Code system prompt with a minimal `"You are Claude Code, ..."` stub
- Skip hooks execution
- Skip some background init routines

We rely on this because otherwise the spawned CLI would inherit the dev machine's `CLAUDE.md`, skills, hooks, etc. and leak them into Alice's context.

## What does NOT respect `ANTHROPIC_BASE_URL`

These are hardcoded to `api.anthropic.com` (or `mcp-proxy.anthropic.com`) inside the CLI. They still fire even when the profile points to a third-party vendor:

| Endpoint | Purpose | Fails gracefully? |
|---|---|---|
| `/api/event_logging/batch` | OpenTelemetry event batching (every ~5s) | Yes — the exporter queues + backs off |
| `/v1/mcp_servers?limit=1000` | `claudeai-mcp` remote MCP discovery | 401 with non-Anthropic key, no further effect |
| `/api/claude_code/organizations/*/metrics_enabled` | Org metrics feature flag | 401 with non-Anthropic key, no further effect |
| `mcp-proxy.anthropic.com/v1/mcp/*` | Anthropic's MCP proxy for remote MCP servers | Only fires when such servers are configured |

**None of these perform LLM inference.** Main generation (`/v1/messages`) correctly goes to `ANTHROPIC_BASE_URL`. But metadata (session IDs, MCP topology, org info) does leak to Anthropic regardless of `ANTHROPIC_BASE_URL`. This is known behavior as of `claude-agent-sdk@0.2.72`; treat the leak as a given, not a bug on our end.

## Error classification

`classifyError()` in `query.ts` buckets failures into `auth` / `model` / `unknown` by regex-matching `message` + `stderr` + `stdout` for tokens like `401`, `invalid_api_key`, `authentication`, `model_not_found`. User-fixable classes get a single `console.warn` line; anything else keeps the loud `console.error` + full details.

Full error detail (including stack / stderr / stdout) always lands in `logs/agent-sdk.log` via pino, regardless of classification. Don't remove the loud path for unknown errors — that's the only signal left when something genuinely breaks.

## Debugging the SDK subprocess

Set `ALICE_SDK_DEBUG=1` on the dev process:

```bash
ALICE_SDK_DEBUG=1 pnpm dev
```

When set, `query.ts`:

1. Injects `DEBUG_CLAUDE_AGENT_SDK=1` into the CLI's env, enabling the SDK's own verbose stderr
2. Pipes the CLI child's stderr into `logs/agent-sdk-debug.log`, prefixed with a request separator containing timestamp / loginMethod / model / baseUrl

Use this when you suspect the CLI is hitting an endpoint it shouldn't, or when an API-key mismatch produces confusing behavior. The debug log surfaces every outbound URL (`[API REQUEST]` / axios error URLs), failed auth attempts, and classifier input signals.

The flag is opt-in and off by default. Turning it on adds noticeable overhead (the SDK logs a lot) — don't leave it on in production.

## Third-party "cosplay" caveat

Observed with **Kimi K2.6** (and likely K2 family in general), probably also present in some GLM variants:

When asked `"are you Claude?"` in a persona context, the model may confidently answer **"yes, I'm Claude"**. This is a post-training artifact — the K2 alignment stage distilled significant Claude output data without strong identity re-anchoring — **not** dual-dispatch or misrouting.

Before concluding that routing is broken based on model "voice", verify with the debug log:

1. Start `ALICE_SDK_DEBUG=1 pnpm dev`
2. Send one message in the channel
3. `grep "v1/messages" logs/agent-sdk-debug.log` — should be absent (the debug log surfaces management URLs, not fetch-wrapped `/v1/messages` calls)
4. `grep -oE "https://[^ \"]+" logs/agent-sdk-debug.log | sort -u` — the only non-`api.anthropic.com` host should be your configured `baseUrl`

If `/v1/messages` on `api.anthropic.com` appears, then routing is actually broken. Otherwise, assume cosplay.

## See also

- `src/ai-providers/preset-catalog.ts` — profile presets, including the third-party Anthropic-compat vendors
- `src/ai-providers/agent-sdk/query.ts` — the env-injection + result-collection wrapper
- `src/ai-providers/agent-sdk/agent-sdk-provider.ts` — the `AIProvider` implementation calling `query.ts`
