# App Review Risk Checklist

Status: review-prep checklist. It is intentionally conservative.

## iOS Risks

- Guideline 2.5.2 risk: avoid local execution of arbitrary downloaded code. Builds/tests must run remotely.
- Filesystem risk: do not claim unrestricted file access. Use app workspace and user-selected document flows.
- Transport risk: do not expose `codex app-server` directly to a mobile device over an unauthenticated network listener. The runner bridge must stay server-side and prefer stdio/unix socket or authenticated localhost-only transport.
- Patch risk: never apply agent-generated diffs automatically. Every app-server `turn/diff/updated` patch must be shown for user review, and unsupported or unsafe paths must block apply.
- Approval risk: app-server approval requests must fail closed until the mobile app has an explicit approve/deny UI.
- Sandbox risk: review notes must distinguish EAS builds of Codex Mobile from runner-side sandbox builds of user projects.
- GitHub risk: mobile must not receive GitHub App private keys, installation tokens, service-account credentials, passwords, or personal access tokens.
- Branch risk: default Git workflow must create a feature branch and must not force push or push directly to protected branches.
- Auth risk: do not scrape ChatGPT, collect passwords, use cookies, or call private endpoints.
- Privacy risk: disclose source snapshot uploads, logs, account data, and diagnostics if shipped.
- Export compliance risk: answer encryption questions based on the actual shipped network/auth/storage behavior.
- Metadata risk: screenshots and copy must match implemented features.

## Android Risks

- Scoped storage risk: app-specific storage by default; SAF for user-selected documents/folders.
- Permission risk: avoid broad all-files access unless a future feature has a specific approved justification.
- Data Safety risk: disclose runner uploads, logs, account data, and diagnostics if shipped.
- Auth risk: keep production ChatGPT/Codex sign-in gated until officially supported.
- Runner risk: keep heavy build/test execution and Codex app-server integration in the runner; the Android app remains a client using app storage plus SAF/user grants.
- Sandbox risk: local Docker is a development backend only. Do not describe it as production cloud sandboxing.
- GitHub risk: describe real GitHub import/push only after the server-side GitHub App provider is implemented and tested.
- Cloud risk: cloud runner control-plane interfaces are not the same as deployed production cloud infrastructure.
- Patch risk: require explicit user approval before applying agent patches, and keep path traversal checks in the shared protocol helper.
- Metadata risk: store listing must not promise unavailable GitHub, auth, local terminal, or full filesystem features.

## What Codex Can Automate

- Search UI copy and docs for forbidden claims.
- Run tests/typechecks and Expo config checks.
- Verify release placeholders are replaced before a real build/upload.
- Generate review-note drafts that explain sandboxed remote execution and explicit patch approval.
- Verify `RUNNER_MODE=fake` remains the safe default and `RUNNER_MODE=codex-app-server` is clearly developer-gated.
- Verify app-server diffs are converted to reviewable `PatchProposal` objects and are never applied without an explicit user action.
- Verify sandbox build/test actions use allowlisted command kinds and do not expose raw shell UI.
- Verify artifact metadata uses sandbox-relative paths and does not expose runner host paths.
- Verify Git endpoints do not return tokens or secrets and reject force push/protected-branch pushes.
- Verify cloud runner provider placeholders fail honestly until implemented.

## What You Must Do Manually

- Confirm the app's real data practices.
- Confirm store-account settings, app records, legal declarations, screenshots, and review notes.
- Decide whether to proceed from internal testing to external testing or production.

## Values To Provide Later

- Store account IDs and app record IDs.
- Final privacy and data safety answers.
- Final review notes.
- Final screenshots and assets.
- Final supported auth mode.

## What Must Not Be Faked

- Store credentials, team IDs, app IDs, service account paths, screenshots, and privacy URLs.
- Production submissions without explicit confirmation.
- Official ChatGPT/Codex mobile auth support.
- A production-ready remote sandbox runner, until it exists and is tested.
- A production GitHub App workflow, until install/token/clone/commit/push/PR operations exist and are tested.
- Local execution capabilities that mobile OS rules do not permit.
- Automatic approval of app-server command, write, network, or permission requests.
- Direct Docker access from the phone or store metadata implying Docker runs on device.
- Claims that EAS app-store builds and user-project sandbox builds are the same system.
- Claims that a provider-neutral cloud control-plane skeleton is deployed cloud infrastructure.
