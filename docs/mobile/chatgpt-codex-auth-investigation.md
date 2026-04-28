# ChatGPT/Codex Auth Investigation for Mobile

Status: production user auth is intentionally disabled in this MVP scaffold.

## What Was Checked

Local repository:

- `codex-rs/login/src/server.rs` implements the Codex CLI browser OAuth callback flow against `https://auth.openai.com` with PKCE and localhost redirect handling.
- `codex-rs/login/src/device_code_auth.rs` implements a ChatGPT device-code flow for Codex.
- `codex-rs/login/src/auth/manager.rs` supports API key auth, Codex-managed ChatGPT auth, externally supplied ChatGPT tokens, and agent identity auth.
- `codex-rs/login/src/auth/storage.rs` supports file, keyring, auto, and ephemeral auth storage for CLI/server environments.
- `codex-rs/app-server-protocol/src/protocol/v2.rs` exposes `account/login/start` variants for `apiKey`, `chatgpt`, `chatgptDeviceCode`, and `chatgptAuthTokens`.
- `chatgptAuthTokens` is explicitly marked unstable/internal-only in protocol comments and must not be used as a public mobile workaround.
- `codex-rs/app-server/src/codex_message_processor.rs` can start browser and device-code ChatGPT login flows and emits `account/login/completed` / `account/updated`.

Public docs:

- Codex CLI docs say first run prompts the user to authenticate with a ChatGPT account or API key: <https://developers.openai.com/codex/cli>.
- Codex cloud docs route users to ChatGPT/Codex and GitHub-connected cloud tasks: <https://developers.openai.com/codex/cloud>.
- OpenAI code-generation docs discuss Codex across IDE, CLI, web/mobile sites, and CI/CD SDK workflows: <https://developers.openai.com/api/docs/guides/code-generation>.

## Supported Today

Supported by this repository for CLI/app-server contexts:

- Codex-managed ChatGPT browser login.
- Codex-managed ChatGPT device-code login.
- API-key login.
- Secure-ish desktop/server storage through keyring-backed auth storage when configured.
- App-server account status and login notifications.

Supported by the MVP mobile scaffold:

- A typed auth state machine.
- A Settings/Auth screen.
- Secure storage abstraction backed by `expo-secure-store`, which maps to Keychain on iOS and Keystore-backed storage on Android.
- A production ChatGPT/Codex auth feature flag that defaults to disabled.
- A dev-only API-key mode feature flag that defaults to disabled and is labeled as local testing only.

## Not Supported or Not Yet Confirmed

Not confirmed as public supported production mobile auth:

- Reusing Codex CLI's OAuth client ID in a third-party mobile app.
- A public mobile redirect URI/client registration for ChatGPT/Codex account auth.
- A public statement that third-party mobile Codex clients may use the existing device-code endpoints.
- Supplying raw ChatGPT tokens from an external mobile host app to app-server.

Explicitly not allowed:

- Scraping ChatGPT.
- Asking users for OpenAI/ChatGPT email or password.
- Using browser cookies as hidden credentials.
- Reverse-engineering private endpoints.
- Hardcoding OAuth client secrets in the app.
- Treating `chatgptAuthTokens` as a public integration path.

## Production Gate

Production ChatGPT/Codex account sign-in must stay disabled until at least one of these is true:

- OpenAI publishes a supported third-party/mobile OAuth or device-code flow for Codex account auth.
- OpenAI documents app-server auth usage for mobile clients, including client ID, redirect URI, scopes, refresh behavior, and allowed storage expectations.
- This app becomes an official OpenAI-owned client with an approved public-client configuration.

When enabled, the implementation must use:

- ASWebAuthenticationSession on iOS.
- Chrome Custom Tabs/AppAuth on Android.
- PKCE.
- No embedded client secret.
- Keychain on iOS.
- Android Keystore/SecureStore on Android.
- A visible logout/revoke path.

## Dev-Only API-Key Mode

Dev API-key mode is permitted only for local development:

- It is off unless `APP_PUBLIC_CODEX_DEV_API_KEY_AUTH=true`.
- UI labels must state that it is not the final user flow.
- Stored values go through the same secure storage abstraction.
- It must not be required for normal users.

## Current Implementation Choice

This MVP creates the auth abstraction, UI shell, state machine, and secure storage surface now. It does not claim production ChatGPT/Codex account auth is complete. The production auth button reports the official-support blocker unless the feature flag is explicitly enabled and wired to a supported future flow.

