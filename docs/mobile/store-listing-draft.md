# Store Listing Draft

Status: draft copy only. Store metadata must be reviewed and edited before use.

## Draft App Name

Codex Mobile

## Draft Subtitle / Short Description

Mobile coding-agent workspace

## Draft Long Description

Codex Mobile brings a coding-agent workflow to iPhone and Android while respecting mobile platform sandboxing. Create app-contained project workspaces, import files you choose, edit source files, chat with an agent, review diffs, approve or reject patches, and monitor remote build/test jobs.

Heavy commands such as package installs, compilers, test suites, Gradle, and Xcode-related workflows run in a remote sandbox runner. The app does not provide an on-device shell for arbitrary project commands and does not claim broad phone filesystem access.

GitHub-style workflows use server-side provider integration. The app prepares branch-first commit, push, and PR-plan flows and does not store GitHub App private keys, installation tokens, passwords, or personal access tokens on device.

Production ChatGPT/Codex account sign-in is enabled only when an officially supported public mobile auth flow is available. Dev API-key mode is for local testing only.

## Suggested Keywords / Tags

- coding
- developer tools
- agent
- IDE
- git
- review
- diff

## Screenshot Ideas

- Project list with sample app workspace.
- Editor showing `src/App.tsx`.
- Agent chat streaming runner logs.
- Diff review with accept/reject controls.
- Build runner artifacts screen.
- Git publish screen showing branch-first commit/push/PR plan.
- Settings/Auth screen showing gated production sign-in.

## What Codex Can Automate

- Generate copy drafts.
- Check copy for forbidden claims.
- Generate screenshot checklist names.
- Verify that placeholder URLs and contacts are not left in final metadata.

## What You Must Do Manually

- Approve final app name, subtitle, descriptions, screenshots, and category.
- Provide real support, marketing, and privacy URLs.
- Confirm the listing accurately describes the shipped build.

## Values To Provide Later

- `PRIVACY_POLICY_URL`
- `SUPPORT_EMAIL`
- `MARKETING_URL`
- Final screenshots and app icon.
- Final category and age/content declarations.

## What Must Not Be Faked

- Do not fake screenshots from flows that do not exist.
- Do not claim broad phone file editing.
- Do not claim an on-device iPhone shell for arbitrary project commands.
- Do not claim on-device iOS build/install workflows.
- Do not claim production ChatGPT/Codex auth unless officially supported.
- Do not claim production GitHub App integration until it is implemented and tested server-side.
- Do not claim production cloud runner infrastructure until a real provider is deployed and tested.
