# GitHub Workspace Lifecycle

Status: Milestone 6 foundation.

## Provider Modes

```bash
GIT_PROVIDER=fake
GIT_PROVIDER=local-git
GIT_PROVIDER=github-app
```

`fake` is the default and works without network or credentials.

`local-git` is reserved for safe local development against explicitly configured runner workspaces. It rejects arbitrary host paths.

`github-app` is server-side only. It is gated by:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY_PATH` or `GITHUB_APP_PRIVATE_KEY_BASE64`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- optional `GITHUB_APP_INSTALLATION_ID`
- optional `GITHUB_ALLOWED_OWNER_ALLOWLIST`

Missing env returns a structured provider-unavailable error.

## Mobile Security Model

- No GitHub passwords in the mobile app.
- No personal access token collection in the production mobile flow.
- No GitHub App private key in the mobile app.
- No installation tokens returned to mobile.
- No GitHub secrets in `EXPO_PUBLIC_*`.
- No force push.
- No direct push to protected default branches by default.

## API Shape

- `GET /git/capabilities`
- `GET /git/repositories`
- `GET /git/repositories/:owner/:repo/branches`
- `POST /sessions/:sessionId/import/github`
- `POST /sessions/:sessionId/git/branch`
- `GET /sessions/:sessionId/git/status`
- `POST /sessions/:sessionId/git/commit`
- `POST /sessions/:sessionId/git/push`
- `POST /sessions/:sessionId/git/pr-plan`

## Current Behavior

Fake mode exposes a sample GitHub-style repository. Import materializes a runner-owned workspace snapshot, creates a feature branch, and lets the mobile app commit, push, and prepare a PR deep-link plan. This is real API/UI flow with fake provider state.

The GitHub App provider is a gated skeleton. It reports capability state and fails honestly until live GitHub operations are implemented.

## What Remains

- GitHub App installation UX.
- Server-side installation token minting and refresh.
- Clone/fetch/commit/push implementation.
- Webhook validation.
- Real PR creation.
- Audit export and durable storage.
