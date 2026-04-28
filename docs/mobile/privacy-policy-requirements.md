# Privacy Policy Requirements

Status: requirements checklist only. This is not legal advice and is not a privacy policy.

## Likely Data Topics To Evaluate

- Account identifiers if production ChatGPT/Codex account auth becomes officially supported.
- Dev-only API key storage during local testing, if enabled by a developer flag.
- Project metadata such as workspace names, file names, repo names, and runner session IDs.
- Source file contents uploaded to a remote sandbox runner.
- Runner logs, build/test results, patch proposals, and artifact metadata.
- Diagnostics, crash logs, and device/app metadata if analytics or crash reporting are later added.
- Git provider identity, repository metadata, branch names, commit metadata, and PR-plan metadata if GitHub import/push is enabled.
- Audit logs, quota records, artifact records, and cleanup metadata if cloud runner control-plane persistence is enabled.

## What Codex Can Automate

- Inventory app code and dependencies for data flows.
- Produce a privacy-policy drafting checklist.
- Compare App Store App Privacy answers and Google Play Data Safety answers against implemented data flows.
- Flag UI copy or docs that overpromise privacy or local-only execution.

## What You Must Do Manually

- Publish a real privacy policy at `PRIVACY_POLICY_URL`.
- Decide the legal entity, contact, retention practices, deletion process, and jurisdiction-specific language.
- Complete Apple App Privacy answers in App Store Connect.
- Complete Google Play Data Safety answers in Play Console.
- Keep privacy answers current when auth, analytics, runner hosting, GitHub integration, or crash reporting changes.
- Confirm whether GitHub App installation data, repository contents, branch names, commit metadata, and PR links are stored or retained by the runner.

## Values To Provide Later

- `PRIVACY_POLICY_URL`
- `SUPPORT_EMAIL`
- Legal entity / publisher name.
- Data retention and deletion process.
- Runner hosting provider and region choices.
- GitHub App data retention and deletion process, if enabled.
- Cloud runner artifact storage provider and retention period, if enabled.
- Analytics/crash reporting provider choices, if any.

## What Must Not Be Faked

- Do not invent a privacy policy URL.
- Do not say no data is collected if source snapshots or logs are uploaded to a runner.
- Do not omit third-party SDK data flows.
- Do not treat dev-only API-key mode as the normal user auth flow.
- Do not claim local-only execution while remote runner upload is enabled.
- Do not claim mobile stores no GitHub data if repository metadata, branch names, or PR-plan metadata are displayed or cached.
- Do not imply cloud runner audit/artifact records are ephemeral unless cleanup and retention are actually implemented.
