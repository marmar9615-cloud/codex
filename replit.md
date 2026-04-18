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
- **Gateway:** `web/server.mjs` — Express + `ws`. Per WebSocket connection it spawns a backend agent and bridges the JSONL event stream up to the browser. Sessions are kept in-memory keyed by an http-only `codexsid` cookie with a 7-day idle TTL; API keys never leave the server.
- **Backend selection:** if `$CODEX_BIN` points at the real `codex` binary AND the session has an API key set, the gateway runs `codex exec --experimental-json --skip-git-repo-check --cd <session-workdir> ...`. Otherwise it runs `web/mock-codex.mjs`, a bundled mock that emits realistic events for every item type (agent_message, reasoning, command_execution, file_change, web_search, todo_list) plus an out-of-band approval-request envelope so the UI's approval flow can be exercised end-to-end without OpenAI keys.
- **Stdin protocol with the mock:** JSON line `{"type":"prompt","text":"..."}` to start the turn, then `{"type":"approval.response","approval_id":"...","decision":"approve|approve-session|deny"}` interleaved as the user clicks. The real backend just receives the prompt on stdin (no JSON envelope), and is launched with `approval_policy=never` because interactive approvals live on the JSON-RPC app-server (out of scope for this gateway MVP).
- **Browser UI:** `web/public/{index.html,app.js,styles.css}` — vanilla ES module, no build step. Dark theme; sessions sidebar with thread resume; streaming agent messages; tool-call cards for shell/apply_patch/mcp/web_search/plan; inline approval prompts; slash-command palette (13 commands mirroring the TUI) with `/` autocomplete; `@`-file autocomplete via `/api/file-search`; settings/login modals; reconnecting WebSocket.
- **Per-session workdir:** `web/.workdirs/<sessionId>/`.
- **Limitations vs. TUI:** OAuth/ChatGPT login not implemented (API-key only); MCP server management UI not exposed (configure in `~/.codex/config.toml`); real-backend approvals require the JSON-RPC app-server bridge.

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
