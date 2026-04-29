# Mobile QA Test Matrix

Status: Milestone 6.6 QA execution pass.

Normal CI should run `pnpm test:mobile:all`. Optional live/device tests are evidence boosters, not required for the reliable gate.

| Flow | Test type | Command | Expected result | Required environment | CI blocking | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| Protocol schema validation | Unit/contract | `pnpm --filter @codex/mobile-protocol test` | Valid payloads pass, invalid payloads fail | Node/pnpm | Yes | Implemented |
| Unified diff parsing | Unit | `pnpm --filter @codex/mobile-protocol test` | Modified/added/deleted/unsupported diffs parse safely | Node/pnpm | Yes | Implemented |
| Patch lifecycle | Unit | `pnpm --filter @codex/mobile-protocol test` | Invalid transitions rejected | Node/pnpm | Yes | Implemented |
| Runner fake mode | Contract/integration | `pnpm --filter @codex/mobile-runner test` | Session/job/log/patch/artifact fake flow passes | Node/pnpm | Yes | Implemented |
| Codex app-server missing binary path | Contract | `pnpm --filter @codex/mobile-runner test` | Structured unavailable error | Node/pnpm | Yes | Implemented |
| Fake Git lifecycle | Unit/contract | `pnpm --filter @codex/mobile-runner test` | List/import/branch/status/commit/push/PR plan works | Node/pnpm | Yes | Implemented |
| Git security policy | Unit | `pnpm --filter @codex/mobile-runner test` | Traversal, force push, protected branch writes rejected | Node/pnpm | Yes | Implemented |
| Cloud runner fake provider | Unit | `pnpm --filter @codex/mobile-runner test` | Fake dispatch, quota, audit, cleanup models pass | Node/pnpm | Yes | Implemented |
| Sandbox command policy | Unit | `pnpm --filter @codex/mobile-runner test` | Raw shell/traversal/custom commands rejected by default | Node/pnpm | Yes | Implemented |
| Local Docker backend unavailable path | Unit | `pnpm --filter @codex/mobile-runner test` | Missing Docker returns structured error | Node/pnpm, no Docker required | Yes | Implemented |
| Optional live Docker backend | Optional live | `ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 pnpm --filter @codex/mobile-runner test` | Container runs allowlisted command | Docker daemon | No | Skipped by default |
| Mobile project import | Unit/source contract + Maestro/browser | `pnpm --filter @codex/mobile test`; optional `pnpm test:mobile:e2e:maestro:check`; browser QA evidence | Stable fake import test ID exists; fake repo imports in browser QA | Node/pnpm; optional Maestro/device or browser | Source contract yes, device no | Implemented; browser pass; Maestro skipped locally |
| Mobile sample editor/save | Unit/source contract + Maestro/browser | `pnpm --filter @codex/mobile test`; `pnpm test:mobile:e2e:web`; optional Maestro sample flow | Editor/save controls are addressable and web workspace fallback saves | Node/pnpm; optional Maestro/device | Source contract yes, web yes, device no | Implemented; web pass; Maestro skipped locally |
| Mobile AgentChat fake runner flow | Maestro/manual browser QA | `.maestro/fake_agent_patch_flow.yml`; `docs/mobile/qa-evidence/latest-computer-use-qa.md` | Logs appear and patch review opens | Runner, app build, Maestro/simulator or Expo web/browser | No | Browser pass; Maestro skipped locally |
| Mobile DiffReview accept/reject flow | Unit/source contract + Maestro | `pnpm --filter @codex/mobile test`; optional Maestro | Apply/reject controls exist and patch helpers enforce safety | Node/pnpm; optional Maestro/device | Source contract yes, device no | Implemented plus optional |
| Mobile BuildRunner install/test/build flow | Source contract + Maestro/browser | `pnpm --filter @codex/mobile test`; `.maestro/fake_build_runner_flow.yml`; browser QA evidence | Safe action controls exist and fake artifacts show | Node/pnpm; optional Maestro/device or browser | Source contract yes, browser yes, device no | Implemented; browser pass; Maestro skipped locally |
| Mobile Git publish fake flow | Source contract + Maestro/browser | `pnpm --filter @codex/mobile test`; `.maestro/fake_git_publish_flow.yml`; browser QA evidence | Commit/push/PR controls exist; fake provider reaches PR plan | Node/pnpm; optional Maestro/device or browser | Source contract yes, browser yes, device no | Implemented; browser pass; Maestro skipped locally |
| Settings/Auth gated messaging | Unit/source contract | `pnpm --filter @codex/mobile test` | Production OAuth copy remains gated | Node/pnpm | Yes | Implemented |
| App Store safety copy | Docs/config sanity | `node scripts/mobile-docs-sanity.mjs` | Forbidden filesystem/local terminal claims absent | Node | Yes | Implemented |
| EAS config validation | Config | `pnpm --filter @codex/mobile exec expo config --type public --json`; `node -e 'JSON.parse(...)'` | Expo public config and EAS JSON parse | Node/pnpm | Yes | Implemented |
| Store release docs sanity | Docs/config sanity | `node scripts/mobile-docs-sanity.mjs` | Required release/QA docs exist | Node | Yes | Implemented |
| No secrets exposed to mobile | Source/config sanity | `node scripts/mobile-docs-sanity.mjs`; `pnpm --filter @codex/mobile test` | Server-only secret placeholders absent from mobile source | Node | Yes | Implemented |
| Expo web smoke | Web smoke | `pnpm test:mobile:e2e:web` | Starts fake runner + Expo web, opens browser, verifies ProjectList, sample save, auth gated copy, and runner UI | Node/pnpm, free local ports, Playwright Chromium | No | Implemented and passing locally |
| Maestro E2E scaffolding | Device E2E | `RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=... pnpm test:mobile:e2e:maestro:check` | Maestro runs all flows | Maestro, app build, simulator/emulator | No | Added; skipped locally because CLI/simulator/app target missing |
| EAS Android E2E workflow | Cloud E2E validation | `pnpm test:mobile:e2e:eas:validate`; later `npx eas-cli@latest workflow:run .eas/workflows/e2e-android.yml` | Workflow references real Maestro flows and E2E profile | Node/pnpm; EAS credentials only for cloud execution | Validation yes, cloud no | Path/profile validation passing locally; cloud not run |
| EAS iOS E2E workflow | Cloud E2E validation | `pnpm test:mobile:e2e:eas:validate`; later `npx eas-cli@latest workflow:run .eas/workflows/e2e-ios.yml` | Workflow references real Maestro flows and iOS simulator profile | Node/pnpm; EAS credentials only for cloud execution | Validation yes, cloud no | Path/profile validation passing locally; cloud not run |

## Normal Gate

```bash
pnpm test:mobile:all
```

This command intentionally does not require Docker, GitHub App credentials, EAS credentials, iOS Simulator, Android Emulator, Maestro, or store credentials.
