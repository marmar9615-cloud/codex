# ADR 0001: Mobile Codex Uses a Hybrid Phone App and Remote Runner

Date: 2026-04-28

Status: Accepted for MVP foundation

## Context

Codex CLI/TUI/Desktop assumes a desktop or server environment that can read a project directory, run subprocesses, apply patches, watch files, and use platform sandboxing. iOS and Android apps run inside mobile OS sandboxes and must respect app-store rules around filesystem access and executable code.

Apple App Review Guideline 2.5.2 is especially important: a publishable app cannot download, install, or execute code that changes app functionality, and it cannot read or write outside its designated container except through supported user-granted document flows. Android similarly expects app-specific storage by default and Storage Access Framework grants for user-selected shared files.

The repository already has a good rich-client seam in `codex-rs/app-server-protocol` and `codex-rs/app-server`. It also has `codex-rs/core`, `codex-rs/exec`, `codex-rs/sandboxing`, `codex-rs/state`, and `codex-rs/thread-store` pieces that are powerful but not mobile-sandbox-safe as an on-device runtime.

## Decision

Build Codex Mobile as a hybrid system:

- The phone app is a React Native/Expo app for project selection, editing, chat, streaming output, diff review, secure storage, and safe preview surfaces.
- The runner is a remote sandbox service that performs clone/sync, Codex execution, build/test commands, artifact generation, and app-server/core orchestration.
- The shared contract between the phone and runner lives in `packages/mobile-protocol`.
- The MVP runner lives in `services/mobile-runner` and initially streams fake logs while preserving the production API shape.
- The mobile app starts in `apps/mobile` with placeholder screens and honest feature flags.

## Consequences

Positive:

- Keeps mobile publishability constraints central instead of retrofitting them later.
- Avoids unsafe local terminal behavior on phones.
- Reuses Codex app-server concepts without forcing mobile assumptions into `codex-core`.
- Creates an API seam that can later bind to Codex cloud, app-server, or a dedicated runner.
- Lets iOS builds happen on a Mac/Xcode runner or CI pipeline, not on an iPhone.

Negative:

- Requires a hosted runner before real build/test workflows work.
- Offline editing is limited to local workspace copies and cannot run arbitrary tests.
- Auth has a real blocker: production ChatGPT/Codex account sign-in needs officially supported mobile client details before it can be enabled.
- Git credentials and project sync need careful threat modeling.

## On-Device Execution Policy

Allowed on device:

- Rendering/editing source text within app storage or user-granted file scopes.
- Applying user-approved text patches to app-contained project snapshots.
- Previewing static content or remote preview URLs in WebView.
- Running UI-only validation and local metadata transforms.

Not allowed on device:

- Running arbitrary downloaded executables.
- Running package scripts, compilers, test suites, Gradle, Xcode builds, or shell commands.
- Escaping app storage into arbitrary filesystem paths.
- Treating browser cookies or scraped ChatGPT pages as credentials.

## Runner Execution Policy

The runner must:

- Execute code only in sandboxed environments.
- Stream stdout/stderr and structured events back to the phone.
- Return artifact metadata rather than opaque host filesystem paths.
- Separate project workspaces by user/session.
- Store secrets server-side with a real secret backend and short-lived credentials.
- Eventually bridge to `codex app-server` v2 for thread/turn semantics.

## Auth Position

The app may include a UI shell for ChatGPT/Codex account auth, but production auth is disabled until OpenAI confirms a public supported mobile flow for this client class. Dev-only API-key mode is allowed for local testing behind an explicit flag and must not be presented as the final user flow.

