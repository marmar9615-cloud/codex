# Latest Local Mobile QA Evidence

- Generated: 2026-04-29T02:50:04.062Z
- Git branch: main
- Git commit: eab626f69edb94952e12c71b4165393947097365
- Host: darwin arm64
- Node: v25.9.0
- Overall status: pass

## Commands

| Command | Status | Blocking | Duration |
| --- | --- | --- | --- |
| `pnpm install` | pass | yes | 4081ms |
| `pnpm test:mobile:all` | pass | yes | 15031ms |
| `pnpm test:mobile:e2e:eas:validate` | pass | yes | 392ms |
| `pnpm test:mobile:e2e:web` | pass | no | 8132ms |
| `pnpm test:mobile:e2e:maestro:check` | skipped | no | 652ms |

## Optional QA Path Status

| Path | Status | Re-run command |
| --- | --- | --- |
| Expo web smoke | pass | `pnpm test:mobile:e2e:web` |
| Maestro local E2E | skipped | `RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=<app-id> pnpm test:mobile:e2e:maestro:check` |
| Codex browser/computer-use manual QA | pass | `Follow docs/mobile/codex-computer-use-qa-checklist.md` |
| EAS workflow path/profile validation | pass | `pnpm test:mobile:e2e:eas:validate` |

## Command Output Notes

### pnpm install

Status: pass

Stdout excerpt:

```text
Scope: all 7 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 0, reused 1, downloaded 0, added 0
Packages: -84
--------------------------------------------------------------------------------
Progress: resolved 0, reused 84, downloaded 0, added 0, done

sdk/typescript prepare$ pnpm run build
sdk/typescript prepare: > @openai/codex-sdk@0.0.0-dev build /Users/marmar/Desktop/CodexMobile/sdk/typescript
sdk/typescript prepare: > tsup
sdk/typescript prepare: CLI Building entry: src/index.ts
sdk/typescript prepare: CLI Using tsconfig: tsconfig.json
sdk/typescript prepare: CLI tsup v8.5.0
sdk/typescript prepare: CLI Using tsup config: /Users/marmar/Desktop/CodexMobile/sdk/typescript/tsup.config.ts
sdk/typescript prepare: CLI Target: node18
sdk/typescript prepare: CLI Cleaning output folder
sdk/typescript prepare: ESM Build start
sdk/typescript prepare: ESM dist/index.js     13.97 KB
sdk/typescript prepare: ESM dist/index.js.map 27.90 KB
sdk/typescript prepare: ESM ⚡️ Build success in 15ms
sdk/typescript prepare: DTS Build start
sdk/typescript prepare: DTS ⚡️ Build success in 998ms
sdk/typescript prepare: DTS dist/index.d.ts 9.64 KB
sdk/typescript prepare: Done
Done in 3.9s using pnpm v10.33.0
```



### pnpm test:mobile:all

Status: pass

Stdout excerpt:

```text
> codex-monorepo@ test:mobile:all /Users/marmar/Desktop/CodexMobile
> node scripts/mobile-test-all.mjs


$ pnpm --filter @codex/mobile-protocol build

> @codex/mobile-protocol@0.0.0 build /Users/marmar/Desktop/CodexMobile/packages/mobile-protocol
> tsc -p tsconfig.json


$ pnpm --filter @codex/mobile-protocol test

> @codex/mobile-protocol@0.0.0 test /Users/marmar/Desktop/CodexMobile/packages/mobile-protocol
> tsx --test src/*.test.ts src/**/*.test.ts

✔ blocks ChatGPT auth until official mobile support is enabled (3.586834ms)
✔ keeps dev API-key mode behind its own flag (0.121334ms)
✔ normalizes safe workspace paths (0.80875ms)
✔ rejects traversal outside workspace (0.27175ms)
✔ allows safe runner job transitions and rejects terminal rewrites (1.16225ms)
✔ allows safe patch lifecycle transitions (0.136208ms)
✔ applies a simple unified patch (2.211084ms)
✔ reports context mismatches (0.191542ms)
✔ applies modify, add, and delete file patches to a text workspace (16.215667ms)
✔ rejects unsupported patches and missing workspace root (0.20125ms)
✔ rejects traversal paths while applying (0.367083ms)
✔ parses modified files with multiple hunks (1.53075ms)
✔ parses added and deleted files (0.197834ms)
✔ keeps hunk lines that look like file headers (0.12275ms)
✔ marks binary diffs as unsupported (0.113083ms)
✔ handles empty diffs (1.042875ms)
✔ rejects malicious patch paths (0.735708m
...
 duration_ms 446.33775

$ pnpm --filter @codex/mobile typecheck

> @codex/mobile@0.0.0 typecheck /Users/marmar/Desktop/CodexMobile/apps/mobile
> tsc -p tsconfig.json --noEmit


$ pnpm --filter @codex/mobile exec expo config --type public --json
{"name":"Codex Mobile","slug":"codex-mobile","scheme":"codexmobile","version":"0.1.0","orientation":"portrait","userInterfaceStyle":"automatic","newArchEnabled":true,"plugins":["expo-router","expo-secure-store","expo-document-picker"],"ios":{"bundleIdentifier":"IOS_BUNDLE_IDENTIFIER","buildNumber":"1","supportsTablet":true},"android":{"package":"GOOGLE_PLAY_PACKAGE_NAME","versionCode":1},"extra":{"chatgptAccountAuthEnabled":false,"devApiKeyAuthEnabled":false,"runnerBaseUrl":"http://127.0.0.1:8787","privacyPolicyUrl":"PRIVACY_POLICY_URL","supportEmail":"SUPPORT_EMAIL","marketingUrl":"MARKETING_URL","router":{}},"sdkVersion":"55.0.0","platforms":["ios","android","web"]}
$ node -e JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8')); console.log('eas.json valid')
eas.json valid

$ node scripts/mobile-eas-workflow-validate.mjs
mobile EAS E2E workflow validation passed
Run later with:
  npx eas-cli@latest workflow:run .eas/workflows/e2e-android.yml
  npx eas-cli@latest workflow:run .eas/workflows/e2e-ios.yml

$ node scripts/mobile-docs-sanity.mjs
mobile docs/config sanity passed

$ git diff --check

mobile verification passed
```



### pnpm test:mobile:e2e:eas:validate

Status: pass

Stdout excerpt:

```text
> codex-monorepo@ test:mobile:e2e:eas:validate /Users/marmar/Desktop/CodexMobile
> node scripts/mobile-eas-workflow-validate.mjs

mobile EAS E2E workflow validation passed
Run later with:
  npx eas-cli@latest workflow:run .eas/workflows/e2e-android.yml
  npx eas-cli@latest workflow:run .eas/workflows/e2e-ios.yml
```



### pnpm test:mobile:e2e:web

Status: pass

Stdout excerpt:

```text
> codex-monorepo@ test:mobile:e2e:web /Users/marmar/Desktop/CodexMobile
> pnpm --filter @codex/mobile test:e2e:web


> @codex/mobile@0.0.0 test:e2e:web /Users/marmar/Desktop/CodexMobile/apps/mobile
> node ../../scripts/mobile-web-smoke.mjs

Expo web browser smoke passed at http://localhost:8099
```



### pnpm test:mobile:e2e:maestro:check

Status: skipped

Stdout excerpt:

```text
> codex-monorepo@ test:mobile:e2e:maestro:check /Users/marmar/Desktop/CodexMobile
> node scripts/mobile-maestro-check.mjs

Maestro flows: .maestro/fake_agent_patch_flow.yml, .maestro/fake_build_runner_flow.yml, .maestro/fake_git_publish_flow.yml, .maestro/sample_project_flow.yml
Maestro local E2E skipped: Maestro CLI is not installed. No usable iOS Simulator or Android Emulator tooling was detected. MAESTRO_APP_ID is not set. RUN_MAESTRO_E2E is not 1.
```




## Skipped Optional Tests

| Test | Reason |
| --- | --- |
| Optional live Docker sandbox | Skipped unless ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 and Docker daemon is available. |
| Live GitHub App | Skipped unless ENABLE_LIVE_GITHUB_APP_TESTS=1 and all GitHub App env values point at a test repo/branch. |
| Live cloud runner | Skipped unless ENABLE_LIVE_CLOUD_RUNNER_TESTS=1 and a real provider adapter is configured. |
| EAS cloud workflow execution | Not run locally; requires EAS project credentials and explicit human trigger. |
| Maestro local E2E | Skipped by script; see docs/mobile/qa-evidence/latest-maestro-local-qa.md for missing tools/build target. |

## Next QA Gaps

- Run Maestro flows on a real simulator/emulator build after Maestro and app target are available.
- Add live Docker evidence when Docker daemon is available.
- Add live GitHub App evidence against a test repository after server-side provider implementation.
- Add production cloud runner evidence after a real provider adapter exists.
- Re-run Codex browser/computer-use QA when a browser/simulator target is available.
