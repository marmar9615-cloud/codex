# Mobile Runner Sandbox

Status: Milestone 5 local-development backend.

## Purpose

The sandbox backend lets the mobile app request real build/test work against the synced runner workspace while keeping execution off the phone. The app sends typed build requests to `services/mobile-runner`; the runner chooses a backend, streams logs over SSE, and returns artifact metadata.

## Backends

```bash
SANDBOX_BACKEND=fake
SANDBOX_BACKEND=local-docker
```

`fake` is the default. It is deterministic and safe for tests, demos, and UI work.

`local-docker` is opt-in for local development. It uses the Docker CLI to run allowlisted commands in a container. It fails with structured errors when Docker is missing, the daemon is unavailable, an image cannot be pulled, a command times out, a command exits nonzero, an artifact is too large, or a workspace/command is rejected by policy.

## Enabling Local Docker

```bash
SANDBOX_BACKEND=local-docker \
SANDBOX_DOCKER_IMAGE=node:22-bookworm-slim \
SANDBOX_DOCKER_NETWORK=none \
pnpm --filter @codex/mobile-runner dev
```

Install commands can use Docker bridge networking only when explicitly configured:

```bash
SANDBOX_BACKEND=local-docker \
SANDBOX_DOCKER_NETWORK=bridge \
pnpm --filter @codex/mobile-runner dev
```

Normal tests do not require Docker. Optional live Docker tests are gated:

```bash
ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 pnpm --filter @codex/mobile-runner test
```

## Command Policy

The mobile app does not send raw shell text. Build requests use typed command kinds:

- `npm_install`
- `npm_test`
- `npm_build`
- `pnpm_install`
- `pnpm_test`
- `pnpm_build`
- `yarn_install`
- `yarn_test`
- `yarn_build`
- `expo_export_or_check`

`custom` is disabled by default and should remain dev-only:

```bash
ENABLE_UNSAFE_CUSTOM_COMMANDS=1
```

Policy rules:

- no shell by default,
- no privileged containers,
- no Docker socket mount,
- no arbitrary host path mounts,
- no host secrets passed into containers,
- working directory must stay inside the runner workspace,
- artifact paths must be allowlisted,
- resource and log limits are enforced.

## Resource Limits

Defaults:

- `SANDBOX_MAX_WORKSPACE_BYTES`: 52428800
- `SANDBOX_MAX_ARTIFACT_BYTES`: 10485760
- `SANDBOX_MAX_JOB_DURATION_MS`: 120000
- `SANDBOX_MAX_LOG_BYTES`: 1048576

These are local development defaults. Production cloud sandboxing needs stronger per-user quotas, persistence, tenancy isolation, observability, and abuse controls.

## Artifact Collection

Allowed artifact roots:

- `dist/`
- `build/`
- `coverage/`
- `test-results/`
- `mobile-build-output/`

Artifact metadata uses sandbox-relative paths and byte/file counts. It must not expose host temp directories or arbitrary host paths.

## Mobile Display

`BuildRunnerScreen` shows:

- active runner mode,
- active sandbox backend,
- available command kinds,
- job status,
- streamed logs,
- exit code,
- duration,
- artifact metadata.

If `local-docker` is selected but unavailable, the app shows that real sandbox execution is unavailable while the fake/demo flow remains usable.

## EAS Is Separate

EAS builds Codex Mobile itself for TestFlight and Google Play. The sandbox backend runs users' project commands in runner environments. These are separate systems and must not be conflated in review notes or UI copy.

## Still Gated

- Production ChatGPT/Codex mobile auth remains gated.
- Production cloud sandbox infrastructure is not complete; Milestone 6 only adds provider-neutral control-plane interfaces, quotas, audit logs, artifact-store policy, cleanup policy, and dev auth scaffolding.
- GitHub clone/push against the real GitHub API is not complete; fake Git provider flow is implemented for import, branch, commit, push, and PR-plan UI/API testing.
- Android SAF directory persistence and iOS security-scoped bookmarks remain future native work.
