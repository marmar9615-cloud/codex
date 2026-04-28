# Codex Mobile MVP

This is the first mobile scaffold for Codex. It is an Expo React Native app with route-based navigation, placeholder Codex workflows, secure storage/file provider abstractions, and a runner API client shape.

## What Works

- Mobile navigation and placeholder screens:
  - Project list
  - Project import
  - Editor
  - Agent chat
  - Diff review
  - Build runner
  - Settings/Auth
- Secure storage abstraction using `expo-secure-store`.
- App-sandbox workspace helper using `expo-file-system`.
- Document-picker import helper using `expo-document-picker`.
- Auth state machine with production ChatGPT/Codex account auth disabled by default.
- Dev API-key auth flag separated from production auth.
- Diff review shell backed by shared patch-apply utility tests.
- Stateful sample-project flow from project list/import to editor, runner job, SSE logs, patch review, and artifact metadata.
- Runner client methods for capabilities, session creation, snapshot upload, job start/status, SSE parsing, patch fetch, and artifact fetch.
- Developer display for fake vs `codex-app-server` runner mode.

## What Is Stubbed

- Production ChatGPT/Codex account sign-in. It is blocked until OpenAI confirms a supported mobile OAuth/device-code flow for this client class.
- Android SAF directory access. The provider shape exists, but full directory-tree access likely needs a native module or verified Expo API support.
- iOS security-scoped bookmarks. The provider shape exists, but persistent external-folder access likely needs a native module.
- GitHub clone/import and commit/push.
- The runner behavior defaults to fake/deterministic. `RUNNER_MODE=codex-app-server` is a developer-gated bridge prototype for Codex app-server thread/turn streaming; package managers, compilers, tests, and real sandbox execution remain future runner work.

## Run Locally

From the repository root:

```bash
corepack enable --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
pnpm install
pnpm --filter @codex/mobile-protocol build
pnpm --filter @codex/mobile test
pnpm --filter @codex/mobile start
```

To run the fake runner:

```bash
pnpm --filter @codex/mobile-runner dev
```

Then start the app and use `New Sample` -> `Agent` -> `Run Agent` to exercise the fake end-to-end session.

To try the gated app-server bridge from the runner:

```bash
CODEX_APP_SERVER_BIN=/absolute/path/to/codex \
RUNNER_MODE=codex-app-server \
CODEX_APP_SERVER_TRANSPORT=stdio \
pnpm --filter @codex/mobile-runner dev
```

The mobile app still talks only to the runner. It does not expose app-server directly to the phone.

For physical-device development, start with Expo Go. Add an Expo development client only when native SAF/security-scoped bookmark modules or other custom native code are introduced.
Metro currently reports `exp://127.0.0.1:8081` and `http://localhost:8081` when started with `pnpm --filter @codex/mobile exec expo start --localhost`.

## Auth Flags

Default production behavior:

```bash
APP_PUBLIC_CODEX_CHATGPT_AUTH_ENABLED=false
APP_PUBLIC_CODEX_DEV_API_KEY_AUTH=false
```

Local developer API-key testing:

```bash
APP_PUBLIC_CODEX_DEV_API_KEY_AUTH=true pnpm --filter @codex/mobile start
```

This does not change the final product requirement. Normal users must use supported ChatGPT/Codex account sign-in once OpenAI provides or confirms the production mobile auth flow.
