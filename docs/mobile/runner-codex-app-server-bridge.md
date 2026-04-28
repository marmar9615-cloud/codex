# Mobile Runner Codex App-Server Bridge

Status: Milestone 4 prototype. Fake runner remains the default.

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
8. Runner maps app-server notifications into typed mobile runner events, patch proposals, and final job status.

## Event Mapping

- `thread/started` becomes a system log and captures `appServerThreadId`.
- `turn/started` becomes a system log and captures `appServerTurnId`.
- `item/agentMessage/delta` becomes an `agentText` log event.
- `item/commandExecution/outputDelta` and `command/exec/outputDelta` become `tool` log events.
- `turn/diff/updated` becomes a `diff` log event and updates the current mobile `PatchProposal`.
- `turn/plan/updated` becomes a `plan` log event.
- Approval request methods become `approval` events and fail closed.
- `turn/completed` becomes a `completion` log event and final job status.
- `error` becomes an error log and failed job status.

## Diff To Patch Mapping

The app-server protocol documents `turn/diff/updated` as an aggregated unified diff with:

- `threadId`
- `turnId`
- `diff`

The runner parses the aggregated unified diff into `PatchProposal`:

- `source: "codex-app-server"`
- `appServerThreadId`
- `appServerTurnId`
- `jobId`
- `sessionId`
- `filesChanged`
- `unsupportedChanges`
- `status: "available" | "unsupported" | "none"`

The parser accepts normal text unified diffs for modified, added, and deleted files. It rejects absolute paths, path traversal, and workspace escapes. Binary diffs and unsupported operations such as rename-only changes are represented as unsupported file changes, which blocks mobile apply until a safer handler exists.

`GET /sessions/:sessionId/patch` now returns the latest parsed app-server patch for `RUNNER_MODE=codex-app-server` when a diff was emitted. If a turn completes without a diff, the runner returns the current no-patch/error response instead of inventing a patch.

## Patch Review And Apply

The mobile app must always show a diff review step before applying agent output. App-server diffs are not applied automatically. The mobile `DiffReviewScreen` shows the patch source, lifecycle status, changed files, change type, hunk count, unsupported-change count, and raw diff preview.

Apply is allowed only when:

- the patch exists,
- the patch has supported text changes,
- the user taps apply,
- the target path is inside the active workspace root,
- the patch helper can apply all hunks cleanly.

Reject keeps the workspace unchanged and moves the patch lifecycle to `rejected`.

## Approval Requests

The bridge detects app-server JSON-RPC approval-style requests, including command approval, patch approval, elicitation, and permission approval methods. Milestone 4 does not implement an interactive mobile approval UI for those requests.

Current behavior is fail closed:

- no request is auto-approved,
- the runner emits an approval event/log,
- the job status moves to `awaitingApproval` and then fails cleanly,
- the bridge sends a denial/decline response where a response is required,
- no command, write, network, or secret access is granted without explicit future UI support.

## Optional Live Smoke

```bash
pnpm --filter @codex/mobile-runner build
ENABLE_LIVE_CODEX_APP_SERVER_TESTS=1 \
RUNNER_MODE=codex-app-server \
CODEX_APP_SERVER_BIN=/absolute/path/to/codex \
pnpm --filter @codex/mobile-runner smoke:live-codex-app-server
```

The live smoke asks Codex to make a harmless README change in a temp runner workspace, waits for app-server SSE/log completion, and verifies a `codex-app-server` `PatchProposal` if a diff is emitted. It skips cleanly when the opt-in flag, binary, build output, or auth prerequisites are missing. It is not part of normal CI and must not require a live OpenAI or ChatGPT account for routine tests.

## What Remains Blocked

- Production ChatGPT/Codex mobile account sign-in remains gated pending a supported public mobile auth flow.
- Real remote sandbox execution infrastructure is not implemented yet.
- Unix socket and authenticated local websocket bridge transports are not implemented yet.
- App-server approval requests are fail-closed only; mobile approve/deny UI is future work.
- Real build/test execution remains future work and should be implemented as the next remote sandbox milestone.

## Safety Constraints

- The phone remains a client.
- The runner uses only the uploaded/synced project snapshot as app-server cwd.
- The app does not claim unrestricted phone filesystem access.
- iOS remains app sandbox plus user-selected documents.
- Android remains app storage plus SAF/user-selected documents.
- Heavy builds/tests remain runner-side.
- The next milestone should build the real remote sandbox build/test backend and keep it separate from phone-side execution.
