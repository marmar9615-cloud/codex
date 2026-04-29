# Latest Maestro Local QA

- Generated: 2026-04-29T02:50:43.345Z
- Status: skipped
- Command: `RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=<app-id> pnpm test:mobile:e2e:maestro:check`

## Detected Environment

- Maestro: not installed
- iOS Simulator tooling: unavailable
- Android adb: unavailable
- Android emulator CLI: unavailable
- MAESTRO_APP_ID set: no
- RUN_MAESTRO_E2E=1: no

## Flows

- `.maestro/fake_agent_patch_flow.yml`
- `.maestro/fake_build_runner_flow.yml`
- `.maestro/fake_git_publish_flow.yml`
- `.maestro/sample_project_flow.yml`

## Result

- Maestro CLI is not installed.
- No usable iOS Simulator or Android Emulator tooling was detected.
- MAESTRO_APP_ID is not set.
- RUN_MAESTRO_E2E is not 1.

## Commands To Run Locally

```bash
# Install Maestro if needed:
curl -Ls "https://get.maestro.mobile.dev" | bash

# Build or install an app target first, then run:
RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=codexmobile pnpm test:mobile:e2e:maestro:check
```

## Expected Pass Criteria

- All four Maestro flows launch the app.
- Sample project opens the editor.
- Fake agent logs appear and an approved patch succeeds.
- Fake build runner shows logs/artifacts.
- Fake Git publish flow reaches PR-plan metadata.


