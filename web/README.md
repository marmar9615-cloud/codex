# Codex Web

A browser front-end for the Codex CLI with parity to `codex-tui`. The UI is a
thin client over the **canonical Rust `app-server` JSON-RPC 2.0 protocol**
defined in `codex-rs/app-server-protocol`.

## Architecture

```
┌──────────────┐    HTTP /api/*            ┌────────────────────────┐
│              │ ───────────────────────►  │                        │
│  Browser     │                           │  web/server.mjs         │
│  (app.js     │    WebSocket /ws          │  (Node gateway)        │
│   speaks     │ ◄──────────────────────►  │                        │
│   JSON-RPC)  │  raw JSON-RPC frames      │  spawns one child per   │
│              │                           │  WebSocket:            │
└──────────────┘                           │   $CODEX_BIN app-server │
                                           │   (or mock-codex.mjs)  │
                                           └────────────────────────┘
```

* `web/server.mjs` is a **transparent JSON-RPC pass-through**. It does not
  rewrap or rename methods. It forwards every browser frame straight to the
  child `codex app-server` process's stdin and pipes the child's stdout back
  out to the WebSocket. The only HTTP endpoints it owns are session/auth
  bookkeeping (`/api/whoami`, `/api/login`, `/api/logout`,
  `/api/oauth/chatgpt/start`).
* `web/public/app.js` is a JSON-RPC 2.0 client. It implements the request /
  response / notification routing, including server-initiated requests for
  approvals (`item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/applyPatchApproval/...`).
* `web/mock-codex.mjs` is a small Node process that speaks the same
  app-server-protocol subset for development when the Rust binary is not
  available. Set `CODEX_BIN=/path/to/codex` to use the real one.

## Auth

Two methods, both exercised by `tests/e2e.spec.mjs`:

* **OpenAI API key** — `POST /api/login { apiKey }`. Stored only on the
  server, keyed by an HTTP-only session cookie. Forwarded to the child
  process as `OPENAI_API_KEY`.
* **ChatGPT OAuth** — Browser calls `POST /api/oauth/chatgpt/start` to
  seed the session, then issues the canonical `account/login/start`
  JSON-RPC request. The child app-server completes the device-code flow
  and emits `account/updated`, which the UI uses to flip into the
  signed-in state.

Sessions are isolated per cookie. Each WebSocket spawns its own child
app-server with that user's auth env, so users never share auth or
conversation state.

## Approvals

Approvals are real server-initiated JSON-RPC **requests**, not custom
notifications. The child process sends e.g.

```json
{ "jsonrpc": "2.0", "id": 42, "method": "item/commandExecution/requestApproval",
  "params": { "command": "ls -la", "cwd": "..." } }
```

The browser renders an approval card with **Approve once / Approve for
session / Deny** and replies with the matching `id` and a result of
`{ "decision": "approved" | "approved_for_session" | "denied" }`. The
child's `approval_policy` (set via `config/value/write` or
`~/.codex/config.toml`) is honored by app-server itself — the gateway
does not bypass it.

## MCP servers

The `/mcp` slash command opens a panel that calls
`mcpServerStatus/list`, `config/mcpServer/reload`, and
`config/value/write` (under the `mcp_servers` key) — exactly the methods
the TUI uses.

## Running

```bash
cd web
npm install
npm start     # serves on $PORT (default 5000)
```

To use the real Rust app-server, build it once:

```bash
cargo build -p codex-cli --release --bin codex
CODEX_BIN=$(pwd)/target/release/codex npm start
```

## End-to-end test

A Playwright spec in `tests/e2e.spec.mjs` covers:

1. ChatGPT (mock device-code) sign-in via `account/login/start`.
2. Triggering an exec approval and a patch approval, approving both.
3. Verifying the streamed agent message arrives.
4. Listing MCP servers via `mcpServerStatus/list`.

Run it against a running gateway:

```bash
cd web
npm install --no-save @playwright/test
npx playwright install chromium
BASE_URL=http://localhost:5000 npx playwright test
```
