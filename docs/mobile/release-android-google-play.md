# Android Google Play Release Readiness

Status: planning and configuration prep only. Do not upload, submit, or modify real Play Console records from this project until explicitly requested.

## Release Path

1. Replace Android placeholders in app config and EAS config.
2. Build an Android App Bundle for production through EAS Build.
3. Use Google Play internal testing first.
4. Move to closed/open testing only if needed.
5. Complete Play Console app content requirements.
6. Submit production only after explicit confirmation.

## What Codex Can Automate

- Check `apps/mobile/app.json` for `android.package`, `android.versionCode`, and `expo.version`.
- Check `apps/mobile/eas.json` for production Android `buildType: "app-bundle"`.
- Verify that `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`, `PRIVACY_POLICY_URL`, `SUPPORT_EMAIL`, and `MARKETING_URL` placeholders have been replaced before a real release.
- Run the local verification suite.
- Prepare EAS Build and EAS Submit commands.
- Generate Google Play review-note and store-listing drafts.
- Confirm the UI copy avoids broad filesystem or local terminal claims.

## What You Must Do Manually

- Maintain the Google Play Developer account.
- Create or choose the Play Console app record.
- Choose the permanent Android package name.
- Configure Play App Signing.
- Create or approve the service account JSON used for EAS Submit.
- Complete the Data Safety form using the real shipped data flows.
- Provide a public privacy policy URL.
- Complete content rating and target audience declarations.
- Upload store listing assets and screenshots.
- Approve internal testing release rollout.
- Approve any production release.

## Values To Provide Later

- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
- `PRIVACY_POLICY_URL`
- `SUPPORT_EMAIL`
- `MARKETING_URL`
- App title, short description, full description, category, tags, and contact details.
- Final Data Safety answers, content rating answers, and target audience declarations.
- Final screenshots, icon, feature graphic, and optional promo assets.

## What Must Not Be Faked

- Do not fake the Google Play package name, service account JSON path, privacy policy URL, screenshots, or Data Safety answers.
- Do not request broad all-files access by default.
- Do not claim broad phone filesystem access.
- Do not claim heavy builds/tests run locally on Android.
- Do not upload to Play internal testing or production without explicit confirmation.

## Review Notes Draft

Codex Mobile uses app-specific storage by default and user-selected files/folders through supported Android document access flows. The app does not request broad all-files access by default. Users review and approve every agent patch before workspace files are changed. Heavy builds, tests, package installation, and arbitrary shell commands run in a remote sandbox runner rather than on the phone.

## EAS Build And Internal Testing Commands

Run from `apps/mobile` after placeholders and credentials are ready:

```bash
pnpm dlx eas-cli@latest build -p android --profile production
pnpm dlx eas-cli@latest submit -p android --profile production
```

The production build profile produces an AAB. The submit profile targets the Play internal track as a draft-style first step. Do not run submit until the Play Console app, package name, service account, and Data Safety plan are ready.
