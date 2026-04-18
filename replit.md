# OpenAI Codex — Web App (browser parity with TUI)

## Project Overview
This repo is the upstream OpenAI Codex CLI project (a Rust-based coding agent) plus a new browser front-end under `web/` that brings the TUI experience into a hosted web app.

- `web/` — **active workspace.** Node.js Express + WebSocket gateway and single-page browser UI.
- `codex-rs/` — original Rust workspace with the core agent and the `codex-tui` binary.
- `codex-cli/` — original Node.js wrapper CLI (managed with pnpm).
- `sdk/typescript/` — official TypeScript SDK; the gateway speaks the same `codex exec --experimental-json` JSONL protocol it uses.

## Running the App
The workflow "Start application" launches the web app gateway on port 5000 (`cd web && npm start`). The browser UI is served at `/`.

**Built binary location:** `codex-rs/target/debug/codex-tui`

To use it interactively, open the Shell and run:
```bash
cd codex-rs && ./target/debug/codex-tui --help
```

## Architecture Notes

### Web App (web/)
- **Gateway:** `web/server.mjs` — Express + `ws`. **Transparent JSON-RPC 2.0 pass-through.** Per WebSocket it spawns the real Rust `codex app-server` (or `web/mock-codex.mjs`) and pipes raw JSON-RPC frames in both directions. The gateway does not rename or rewrap any methods. The only HTTP endpoints it owns are session/auth bookkeeping (`/api/whoami`, `/api/login`, `/api/logout`, `/api/oauth/chatgpt/start`).
- **Backend selection:** if `$CODEX_BIN` is set, the gateway spawns `$CODEX_BIN app-server` per WebSocket. Otherwise it runs `web/mock-codex.mjs`, which speaks the same `app-server-protocol` JSON-RPC subset (initialize, thread/start, turn/start, turn/interrupt, mcpServerStatus/list, account/login/start, loginApiKey, item/* notifications, item/*/requestApproval server-initiated requests).
- **Auth:** API key via `POST /api/login`; ChatGPT OAuth via `POST /api/oauth/chatgpt/start` followed by the canonical `account/login/start` JSON-RPC request. Sessions are isolated per HTTP-only `codexsid` cookie; each WebSocket spawns its own child app-server with that user's auth env. Credentials never leave the server.
- **Approvals:** Real server-initiated JSON-RPC requests. The child app-server sends `item/commandExecution/requestApproval` / `item/fileChange/requestApproval`; the browser renders an approval card and replies with `decision: approved | approved_for_session | denied`. The child's `approval_policy` (set via `config/value/write` or config.toml) is honored by app-server itself — the gateway does not bypass it.
- **MCP servers:** `/mcp` slash command opens a panel that calls `mcpServerStatus/list`, `config/mcpServer/reload`, and `config/value/write` — exactly the methods the TUI uses.
- **Browser UI:** `web/public/{index.html,app.js,styles.css}` — vanilla ES module, no build step. JSON-RPC 2.0 client with full request/response/notification routing; dark theme; sessions sidebar with thread resume; streaming agent messages; tool-call cards for shell/apply_patch/mcp/web_search/plan; inline approval prompts; slash-command palette with `/` autocomplete; `@`-file autocomplete via `/api/file-search`; settings/login/MCP modals; reconnecting WebSocket.
- **Per-session workdir:** `web/.workdirs/<sessionId>/`.
- **End-to-end test:** `web/tests/e2e.spec.mjs` is a Playwright spec covering ChatGPT sign-in, exec+patch approvals, streamed agent message, and MCP listing. Run with `cd web && npx playwright install chromium && BASE_URL=http://localhost:5000 npx playwright test`.

### Rust Workspace (codex-rs/)
- **Target binary:** `codex-tui` (in `codex-rs/tui/`)
- **Build command:** `cd codex-rs && cargo build -p codex-tui --bin codex-tui --ignore-rust-version`
- **Rust version:** Replit provides rustc 1.88.0 (project requires ≥1.89 for some unstable features)

### Compatibility Patches Applied
The project requires Rust 1.89+ features not available in Replit's 1.88.0. The following patches were applied:

1. **smol_str-0.3.5** (registry cache): `[0; _]` → `[0; INLINE_CAP]` — const array length inference
2. **asynk-strim-0.1.5** (registry cache): `NonNull::from_mut()` → `NonNull::new_unchecked()` — stabilized in 1.89
3. **rama-net-0.3.0-alpha.4** (registry cache): `Duration::from_hours()` → `Duration::from_secs()` conversion
4. **codex-rs/execpolicy/src/amend.rs**: `File::lock()` → libc `flock()` (unstable in 1.88)
5. **codex-rs/arg0/src/lib.rs**: `File::try_lock()` → libc `flock(LOCK_NB)` (unstable in 1.88)
6. **codex-rs/core/src/message_history.rs**: `File::try_lock()` / `try_lock_shared()` → libc flock
7. **codex-rs/core/src/installation_id.rs**: `File::lock()` → libc `flock(LOCK_EX)` (unstable in 1.88)

All patches use `--ignore-rust-version` flag to bypass the workspace's `rust-version` requirement.

### Dependencies
- `libc` crate added to: `codex-rs/execpolicy/Cargo.toml`, `codex-rs/arg0/Cargo.toml`
- `libc` was already in: `codex-rs/core/Cargo.toml`

### Registry Cache Location
`$CARGO_HOME` = `/home/runner/workspace/.local/share/.cargo`
Patched cached crates at: `.local/share/.cargo/registry/src/index.crates.io-*/`

## Build Time
Initial build takes ~8-10 minutes (includes V8 JavaScript engine compilation via `gn`/`ninja`). Incremental rebuilds are much faster.

## Workflow
- **Name:** "Start application"
- **Type:** console (TUI app, not web)
- **Command:** `cd codex-rs && cargo build -p codex-tui --bin codex-tui --ignore-rust-version 2>&1 && echo 'Build complete' && ./target/debug/codex-tui --help`
