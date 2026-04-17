# OpenAI Codex TUI - Replit Setup

## Project Overview
This is the OpenAI Codex CLI project — a Rust-based terminal coding agent with a TUI (Terminal User Interface). It contains:
- `codex-rs/` — Rust workspace with 80+ crates, the core logic and TUI binary
- `codex-cli/` — Node.js/TypeScript wrapper CLI (managed with pnpm)

## Running the App
The workflow "Start application" builds and tests the binary. Since this is a TUI app, it runs in the console (not a web browser).

**Built binary location:** `codex-rs/target/debug/codex-tui`

To use it interactively, open the Shell and run:
```bash
cd codex-rs && ./target/debug/codex-tui --help
```

## Architecture Notes

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
