# Latest Browser / Computer-Use Mobile QA Evidence

- Generated: 2026-04-29T02:45:00Z
- Status: pass
- Target: Expo web at `http://localhost:8099`
- Runner: local fake mobile runner at `http://127.0.0.1:8787`
- Tooling: Codex in-app Browser runtime using stable mobile test IDs

## What Ran

- Opened the app in the Codex in-app browser.
- Verified the ProjectList screen rendered.
- Created a sample app-workspace project.
- Opened the editor and saved the active file.
- Ran the fake agent patch flow.
- Applied the reviewed patch explicitly from DiffReview.
- Imported the fake GitHub-style repository.
- Committed to a fake feature branch.
- Pushed the fake branch.
- Generated fake PR-plan metadata.
- Ran the fake Build Runner `pnpm_test` action and verified sandbox logs/artifact metadata.
- Verified Settings/Auth still says production ChatGPT/Codex OAuth is gated.

## Findings

- Expo web initially crashed when sample workspace creation called `expo-file-system.makeDirectoryAsync`; the workspace provider now uses a web-only in-memory app-workspace fallback for QA while keeping native app storage on iOS/Android.
- Browser fetches to the local runner initially failed because the runner did not answer CORS preflight requests; in dev auth mode the runner now returns CORS headers and handles `OPTIONS` for local web QA.
- The diff screen initially offered "Commit to Branch" after applying a patch to a non-Git sample workspace; that button is now only shown for runner-backed Git projects.

## Still Not Covered Here

- Native iOS Simulator click-through.
- Native Android Emulator click-through.
- Maestro device automation.
- EAS cloud workflow execution.

## Manual Re-run

```bash
PORT=8787 RUNNER_MODE=fake SANDBOX_BACKEND=fake GIT_PROVIDER=fake CLOUD_RUNNER_PROVIDER=fake RUNNER_AUTH_MODE=dev pnpm --filter @codex/mobile-runner dev
APP_PUBLIC_CODEX_RUNNER_URL=http://127.0.0.1:8787 pnpm --filter @codex/mobile exec expo start --web --localhost --port 8099
```

Then open `http://localhost:8099` and follow `docs/mobile/codex-computer-use-qa-checklist.md`.
