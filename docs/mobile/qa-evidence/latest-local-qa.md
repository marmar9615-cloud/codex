# Latest Local Mobile QA Evidence

- Generated: 2026-04-29T01:58:53.286Z
- Git branch: main
- Git commit: 948906df8328ea8809124a4590f516437e970109
- Host: darwin arm64
- Node: v25.9.0
- Overall status: pass

## Commands

| Command | Status | Duration |
| --- | --- | --- |
| `pnpm install` | pass | 8370ms |
| `pnpm test:mobile:all` | pass | 42201ms |

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
sdk/typescript prepare: ESM ⚡️ Build success in 36ms
sdk/typescript prepare: DTS Build start
sdk/typescript prepare: DTS ⚡️ Build success in 2831ms
sdk/typescript prepare: DTS dist/index.d.ts 9.64 KB
sdk/typescript prepare: Done
Done in 8s using pnpm v10.33.0
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

✔ blocks ChatGPT auth until official mobile support is enabled (3.4695ms)
✔ keeps dev API-key mode behind its own flag (0.382542ms)
✔ normalizes safe workspace paths (1.050334ms)
✔ rejects traversal outside workspace (0.346792ms)
✔ allows safe runner job transitions and rejects terminal rewrites (2.079041ms)
✔ allows safe patch lifecycle transitions (0.323458ms)
✔ applies a simple unified patch (3.997334ms)
✔ reports context mismatches (0.350042ms)
✔ applies modify, add, and delete file patches to a text workspace (15.465917ms)
✔ rejects unsupported patches and missing workspace root (0.24525ms)
✔ rejects traversal paths while applying (0.416ms)
✔ parses modified files with multiple hunks (1.548709ms)
✔ parses added and deleted files (0.1835ms)
✔ keeps hunk lines that look like file headers (0.119709ms)
✔ marks binary diffs as unsupported (0.087083ms)
✔ handles empty diffs (1.099875ms)
✔ rejects malicious patch paths (0.463ms)
✔ 
...
ose stable QA test IDs for critical flows (7.806458ms)
✔ auth and Git UI copy stays gated and does not render server-only secret placeholders (0.909542ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 709.551958

$ pnpm --filter @codex/mobile typecheck

> @codex/mobile@0.0.0 typecheck /Users/marmar/Desktop/CodexMobile/apps/mobile
> tsc -p tsconfig.json --noEmit


$ pnpm --filter @codex/mobile exec expo config --type public --json
{"name":"Codex Mobile","slug":"codex-mobile","scheme":"codexmobile","version":"0.1.0","orientation":"portrait","userInterfaceStyle":"automatic","newArchEnabled":true,"plugins":["expo-router","expo-secure-store","expo-document-picker"],"ios":{"bundleIdentifier":"IOS_BUNDLE_IDENTIFIER","buildNumber":"1","supportsTablet":true},"android":{"package":"GOOGLE_PLAY_PACKAGE_NAME","versionCode":1},"extra":{"chatgptAccountAuthEnabled":false,"devApiKeyAuthEnabled":false,"runnerBaseUrl":"http://127.0.0.1:8787","privacyPolicyUrl":"PRIVACY_POLICY_URL","supportEmail":"SUPPORT_EMAIL","marketingUrl":"MARKETING_URL","router":{}},"sdkVersion":"55.0.0","platforms":["ios","android","web"]}
$ node -e JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8')); console.log('eas.json valid')
eas.json valid

$ node scripts/mobile-docs-sanity.mjs
mobile docs/config sanity passed

$ git diff --check

mobile verification passed
```




## Skipped Optional Tests

| Test | Reason |
| --- | --- |
| Optional live Docker sandbox | Skipped unless ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 and Docker daemon is available. |
| Live GitHub App | Skipped unless ENABLE_LIVE_GITHUB_APP_TESTS=1 and all GitHub App env values point at a test repo/branch. |
| Live cloud runner | Skipped unless ENABLE_LIVE_CLOUD_RUNNER_TESTS=1 and a real provider adapter is configured. |
| Maestro local device run | Maestro CLI is not installed. |
| EAS cloud workflows | Not run locally; requires EAS project credentials and explicit human trigger. |
| Codex browser/computer-use manual QA | Not run by this script; use docs/mobile/codex-computer-use-qa-checklist.md when an interactive browser/simulator is available. |

## Next QA Gaps

- Run Maestro flows on a real simulator/emulator build.
- Add live Docker evidence when Docker daemon is available.
- Add live GitHub App evidence against a test repository after server-side provider implementation.
- Add production cloud runner evidence after a real provider adapter exists.
- Capture manual browser/computer-use screenshots only when that environment is available.
