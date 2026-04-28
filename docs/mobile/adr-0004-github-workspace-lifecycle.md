# ADR 0004: GitHub Workspace Lifecycle

Status: accepted for Milestone 6 foundation.

## Context

Codex Mobile needs a GitHub-style project lifecycle without putting GitHub secrets in the mobile app. Users should be able to import a repo, work on a branch, review/apply patches, commit changes, push a branch, and prepare PR metadata.

Production GitHub access requires a server-side GitHub App. The app must not collect GitHub passwords, personal access tokens, app private keys, installation tokens, or webhook secrets.

## Decision

Add a runner-side Git provider abstraction:

- `fake` is the default test/demo provider.
- `local-git` is a future local dev provider for configured safe workspaces only.
- `github-app` is server-side only and gated by environment variables.

The default workflow is branch-first:

1. Import a repository into a runner-owned workspace.
2. Create a feature branch.
3. Apply accepted patches only inside that workspace root.
4. Commit to the feature branch after explicit user confirmation.
5. Push the feature branch without force push.
6. Return a pull-request plan or deep link.

## Consequences

- Mobile receives repository metadata and PR plans, not installation tokens.
- Direct pushes to `main`, `master`, `trunk`, and `develop` are rejected by default.
- Force push is rejected.
- Real GitHub operations remain gated until the GitHub App install/token flow is implemented and tested.
- Fake mode can exercise the complete UI and API lifecycle without network or credentials.

## Not Implemented Yet

- Real GitHub App installation flow.
- Installation token refresh.
- Webhook processing.
- Live clone/fetch/commit/push against GitHub.
- Real PR creation through GitHub APIs.
