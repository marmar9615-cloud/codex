# Mobile Runner Codex App-Server Bridge

Status: Milestone 3 prototype. Fake runner remains the default.

## Modes

```bash
RUNNER_MODE=fake
RUNNER_MODE=codex-app-server
CODEX_APP_SERVER_BIN=/absolute/path/to/codex
CODEX_APP_SERVER_TRANSPORT=stdio
ENABLE_LIVE_CODEX_APP_SERVER_TESTS=0
```

`RUNNER_MODE=fake` is deterministic and is the right default for CI, demos, and mobile UI work. `RUNNER_MODE=codex-app-server` attempts the real app-server bridge and returns structured errors if the binary or transport is unavailable.

## Why The Mobile App Does Not Connect Directly

`codex app-server` is a rich local control-plane API. The mobile app must not expose it directly over an unauthenticated network connection. The runner keeps app-server local to the backend process and normalizes output into the mobile runner protocol.

The safe shape is:

```text
Mobile app -> services/mobile-runner -> CodexAppServerBridge -> codex app-server over stdio
```

## Current Bridge Flow

1. Mobile uploads a project snapshot.
2. Runner materializes that snapshot inside a runner-owned temp workspace.
3. Mobile starts a job with a command and prompt.
4. Runner starts `codex app-server --listen stdio://`.
5. Runner sends `initialize` and then `initialized`.
6. Runner sends `thread/start` with the workspace cwd, `approvalPolicy: "never"`, and `sandbox: "workspace-write"`.
7. Runner sends `turn/start` with the user's prompt and a workspace-write sandbox policy rooted at that runner workspace.
8. Runner maps app-server notifications into `RunnerLogEvent` and final job status.

## Event Mapping

- `thread/started` becomes a system log and captures `appServerThreadId`.
- `turn/started` becomes a system log and captures `appServerTurnId`.
- `item/agentMessage/delta` becomes stdout log output.
- `item/commandExecution/outputDelta` and `command/exec/outputDelta` become stdout log output.
- `turn/diff/updated` becomes a system log for now. Structured diff-to-mobile-patch mapping remains future work.
- `turn/completed` becomes final job status.
- `error` becomes an error log and failed job status.

## What Remains Blocked

- Production ChatGPT/Codex mobile account sign-in remains gated pending a supported public mobile auth flow.
- Real remote sandbox execution infrastructure is not implemented yet.
- Unix socket and authenticated local websocket bridge transports are not implemented yet.
- App-server approval request handling is intentionally not auto-approved in this prototype.
- App-server diffs are not yet converted into the mobile `PatchProposal` model.

## Safety Constraints

- The phone remains a client.
- The runner uses only the uploaded/synced project snapshot as app-server cwd.
- The app does not claim unrestricted phone filesystem access.
- iOS remains app sandbox plus user-selected documents.
- Android remains app storage plus SAF/user-selected documents.
- Heavy builds/tests remain runner-side.
