# ADR 0003: Runner-Side Sandbox Build/Test Backend

Status: accepted for Milestone 5 local-development backend.

## Context

Codex Mobile needs real build/test feedback, but iOS and Android cannot be treated as unrestricted developer workstations. The phone must remain a client for editing, review, and approval. Package installation, tests, generated commands, and build tooling belong in runner-side contained environments.

The project already has `services/mobile-runner` as the mobile protocol boundary. That service owns synced workspace snapshots and can safely add a sandbox backend without exposing Docker, app-server, or host paths to the mobile app.

## Decision

`services/mobile-runner` now has a sandbox backend abstraction behind:

```bash
SANDBOX_BACKEND=fake
SANDBOX_BACKEND=local-docker
```

The default remains `fake`. `local-docker` is opt-in and intended for local development only. It runs allowlisted commands inside Docker containers using a runner-owned workspace mount. The mobile app never talks to Docker directly and never runs project commands on the phone.

Allowed commands are represented by typed command kinds such as `npm_test`, `pnpm_build`, and `yarn_install`. Raw custom commands remain disabled unless `ENABLE_UNSAFE_CUSTOM_COMMANDS=1` is set for local development.

## Consequences

- The fake backend remains deterministic for normal tests and demos.
- The local Docker backend can run real project commands when Docker is installed and explicitly selected.
- Docker failures are structured errors, not silent fallback to fake execution.
- Containers are not privileged, do not mount the Docker socket, and receive only the runner-owned workspace.
- Artifact metadata exposes allowlisted workspace-relative paths only.
- Production cloud sandboxing is not complete. A production backend still needs isolation, tenancy, auth, quotas, audit logs, artifact storage, and cleanup outside a developer laptop.

## Non-Goals

- No phone-side shell.
- No broad phone filesystem access.
- No direct Docker or app-server access from the mobile app.
- No production cloud runner claim for the local Docker adapter.
- No automatic use of secrets inside sandbox containers.
