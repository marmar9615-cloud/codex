# iOS App Store / TestFlight Release Readiness

Status: planning and configuration prep only. Do not upload, submit, or modify real App Store Connect records from this project until explicitly requested.

## Release Path

1. Keep production ChatGPT/Codex account auth disabled unless OpenAI confirms a supported public mobile auth flow for this client class.
2. Replace placeholders in app config, EAS config, and store metadata.
3. Run the full local verification suite.
4. Build an iOS production artifact through EAS Build.
5. Upload to TestFlight first.
6. Complete internal testing.
7. Add external TestFlight testing only if needed.
8. Submit to App Review only after an explicit approval step.

## What Codex Can Automate

- Check that `apps/mobile/app.json` has the intended `ios.bundleIdentifier`, `ios.buildNumber`, and `expo.version`.
- Check that `apps/mobile/eas.json` has development, preview, and production profiles.
- Verify that `IOS_BUNDLE_IDENTIFIER`, `APP_STORE_CONNECT_APP_ID`, `APPLE_TEAM_ID`, `PRIVACY_POLICY_URL`, `SUPPORT_EMAIL`, and `MARKETING_URL` placeholders have been replaced before a real release.
- Run tests, typechecks, Expo config validation, and EAS config inspection.
- Prepare EAS Build commands.
- Generate review-note drafts and store-listing copy drafts.
- Prepare TestFlight-first upload commands after you confirm credentials are ready.

## What You Must Do Manually

- Maintain the Apple Developer account.
- Create or choose the App Store Connect app record.
- Register the bundle identifier and capabilities.
- Confirm the app name, subtitle, SKU, category, age rating, and availability.
- Provide a public privacy policy URL.
- Complete App Privacy answers in App Store Connect based on real data collection.
- Complete export compliance / encryption answers based on the shipped build.
- Upload screenshots and app icon/launch assets when final visuals are ready.
- Decide whether external TestFlight testing is needed.
- Press the final App Review submission controls.

## Values To Provide Later

- `IOS_BUNDLE_IDENTIFIER`
- `APP_STORE_CONNECT_APP_ID`
- `APPLE_TEAM_ID`
- `PRIVACY_POLICY_URL`
- `SUPPORT_EMAIL`
- `MARKETING_URL`
- Final app name, subtitle, SKU, primary category, and secondary category.
- Final screenshot set and app icon assets.
- Final privacy answers and export compliance answers.

## What Must Not Be Faked

- Do not fake an App Store Connect app ID, Apple Team ID, privacy policy URL, support contact, or screenshots.
- Do not claim production ChatGPT/Codex mobile auth is available unless it is officially supported.
- Do not scrape ChatGPT, collect user passwords, use browser cookies, or call private endpoints.
- Do not describe the app as an on-device shell for arbitrary project commands or a broad iPhone filesystem editor.
- Do not claim iOS builds run locally on the iPhone. Native iOS builds must go through EAS, CI, or a Mac/Xcode runner.
- Do not claim production GitHub App import/push or production cloud sandboxing until those server-side systems are implemented and tested.
- Do not include GitHub App private keys, installation tokens, service-account JSON, or cloud credentials in the mobile app or Expo public config.
- Do not submit for App Review without an explicit human confirmation.

## Review Notes Draft

Codex Mobile is a mobile coding-agent IDE. Users edit project files inside the app workspace or import files they choose through supported document flows. Agent patches are shown for review, and users approve or reject changes before they are applied. Heavy build and test commands run in runner-side sandbox environments; the app does not execute arbitrary downloaded code locally on iPhone. ChatGPT/Codex sign-in is either implemented through an officially supported public mobile auth flow or disabled behind a feature flag.

Important distinction: EAS Build creates Codex Mobile's own iOS app binary for TestFlight/App Store distribution. The mobile runner sandbox runs users' project build/test commands outside the phone. These are separate systems.

GitHub workflows are branch-first and server-mediated. The iOS app does not store GitHub installation tokens, private keys, passwords, personal access tokens, service-account JSON, or cloud runner credentials.

## EAS Build And TestFlight Commands

Run from `apps/mobile` after placeholders and credentials are ready:

```bash
pnpm dlx eas-cli@latest build -p ios --profile production
pnpm dlx eas-cli@latest submit -p ios --profile production
```

The submit command prepares App Store Connect/TestFlight upload through EAS Submit. It must not be run until the App Store Connect app record, Apple credentials, and placeholder replacement are complete.

The local Docker sandbox backend is for developer testing of user-project jobs only. It is not an App Store build mechanism and must not be described as iPhone-side execution.

## Final Codex Release Prompt

Use this future prompt only when the app is genuinely ready for store upload:

```text
You are preparing Codex Mobile for TestFlight and Google Play internal testing. Do not submit to production. First run all tests and typechecks. Verify Expo config and EAS config. Verify IOS_BUNDLE_IDENTIFIER, GOOGLE_PLAY_PACKAGE_NAME, APP_STORE_CONNECT_APP_ID, APPLE_TEAM_ID, GOOGLE_SERVICE_ACCOUNT_JSON_PATH, PRIVACY_POLICY_URL, SUPPORT_EMAIL, and MARKETING_URL placeholders are replaced with real approved values. Verify the privacy policy URL is reachable. Verify app icons, launch assets, and iPhone/Android screenshots are present. Verify production ChatGPT/Codex auth is officially supported or remains disabled/gated. Build iOS with EAS Build and prepare TestFlight upload. Build Android AAB with EAS Build and prepare Google Play internal testing upload. Refuse production submission unless I explicitly confirm production submission in this thread.
```
