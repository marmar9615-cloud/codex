# Codex Web

A browser-based front-end for the Codex CLI agent with parity to `codex-tui`.

The browser is a thin client. It talks to a Node.js gateway over a WebSocket; the gateway spawns a backend agent process per session and bridges Codex's JSONL event stream (`thread.started`, `turn.started`, `item.started/updated/completed`, `turn.completed/failed`) up to the UI.

## Run

```bash
cd web
npm install
npm start                # listens on http://0.0.0.0:5000
```

By default the gateway uses a bundled mock backend (`mock-codex.mjs`) that emits realistic JSONL events for every item type. Try prompts containing **plan**, **write**, **search**, or **error** to exercise the matching tool-call cards. No API key required.

## Real Codex backend

To use the real Codex agent, build the `codex` CLI binary and point the gateway at it:

```bash
# in this repo:
cargo build -p codex-cli --bin codex --release --manifest-path codex-rs/Cargo.toml
export CODEX_BIN="$PWD/codex-rs/target/release/codex"
cd web && npm start
```

Then click **Sign in** in the sidebar and paste an OpenAI API key. The key is stored only in the gateway's in-memory session map keyed by an http-only `codexsid` cookie — the browser never sees it again.

The gateway invokes `codex exec --experimental-json --skip-git-repo-check --cd <session-workdir> ...`, the same JSONL interface used by the official TypeScript SDK.

## Architecture

```
browser ── WebSocket /ws ─► Node gateway (server.mjs)
                                │
                                ├─ mock backend (mock-codex.mjs)        — default
                                └─ real backend ($CODEX_BIN exec ...)   — when API key set
```

Per-session working directories live under `web/.workdirs/<sessionId>/`.

## Limitations vs. TUI

- **Interactive approvals only fire in mock mode.** `codex exec --experimental-json` does not surface approval prompts on its JSONL stream — those are part of the JSON-RPC `app-server` protocol, which this MVP gateway does not bridge. The real backend is therefore launched with `approval_policy=never`.
- **OAuth (ChatGPT) login is not implemented.** Only API-key auth.
- **MCP server management UI** is not exposed; configure MCP servers in `~/.codex/config.toml` as usual.

## Files

- `server.mjs` — Express + ws gateway, session/cookie store, child-process bridge.
- `mock-codex.mjs` — bundled mock backend that emits the Codex JSONL event stream.
- `public/index.html`, `public/app.js`, `public/styles.css` — single-page UI (no build step).
