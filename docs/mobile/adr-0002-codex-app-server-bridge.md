# ADR 0002: Runner-Side Codex App-Server Bridge

Status: accepted for Milestone 3 prototype.

## Context

The mobile app needs Codex-like thread and turn streaming, but iOS and Android must remain sandboxed clients. The phone cannot be treated as an unrestricted workstation, cannot execute arbitrary downloaded code locally, and must not receive raw Codex app-server access over an unauthenticated transport.

The repository's app-server documentation defines the stable local protocol as newline-delimited JSON-RPC over `stdio://`. Websocket transport exists, but is experimental and explicitly not a production dependency. Unix socket transport is local-control-plane oriented and remains a reasonable future option.

## Decision

`services/mobile-runner` owns a `CodexAppServerBridge` behind:

```text
RUNNER_MODE=fake
RUNNER_MODE=codex-app-server
```

The default remains `RUNNER_MODE=fake`. In `codex-app-server` mode, the runner starts or connects to `codex app-server` over stdio and performs:

1. `initialize`
2. `initialized`
3. `thread/start`
4. `turn/start`
5. streamed notification mapping into `RunnerLogEvent`
6. terminal `turn/completed` detection

The mobile app never connects directly to app-server. It only talks to `services/mobile-runner` through `packages/mobile-protocol`.

## Consequences

- Fake mode stays deterministic for normal tests and demos.
- Codex app-server mode can fail honestly with structured `RunnerError` responses.
- App-server credentials, tokens, and stderr are redacted before runner logs are sent to mobile.
- The bridge passes only the materialized runner workspace snapshot as `cwd`.
- App-server approval requests are not granted automatically in this prototype.
- Real remote sandbox infrastructure, GitHub clone/push, and production ChatGPT/Codex mobile auth remain separate milestones.

## Non-Goals

- No direct mobile-to-app-server websocket.
- No unauthenticated remote app-server listener.
- No local phone-side arbitrary code execution.
- No ChatGPT scraping, cookie auth, password collection, or private endpoints.
