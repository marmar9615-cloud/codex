#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const requiredFiles = [
  "docs/mobile/qa-test-matrix.md",
  "docs/mobile/codex-computer-use-qa-checklist.md",
  "docs/mobile/mobile-app-roadmap.md",
  "docs/mobile/app-review-risk-checklist.md",
  "docs/mobile/release-ios-app-store.md",
  "docs/mobile/release-android-google-play.md",
  "apps/mobile/eas.json",
  "apps/mobile/app.json",
];

const forbiddenClaims = [
  "edit any phone file",
  "full local terminal on iPhone",
  "build and install iOS apps entirely on device",
  "unrestricted filesystem access",
];

const forbiddenMobileSecretNames = [
  "GITHUB_APP_PRIVATE_KEY_BASE64",
  "GITHUB_APP_PRIVATE_KEY_PATH",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_WEBHOOK_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_JSON_PATH",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    fail(`missing required mobile QA/release file: ${file}`);
  }
}

const docs = requiredFiles
  .filter((file) => file.endsWith(".md"))
  .map((file) => [file, readFileSync(file, "utf8")]);

for (const [file, contents] of docs) {
  const lower = contents.toLowerCase();
  for (const claim of forbiddenClaims) {
    if (lower.includes(claim.toLowerCase())) {
      fail(`${file} contains forbidden store-safety claim: ${claim}`);
    }
  }
}

const mobileSources = [
  "apps/mobile/app.json",
  ...["apps/mobile/src", "apps/mobile/app"].flatMap((root) => listFiles(root)),
];

for (const file of mobileSources) {
  const contents = readFileSync(file, "utf8");
  for (const secretName of forbiddenMobileSecretNames) {
    if (contents.includes(secretName)) {
      fail(`${file} references server-only secret placeholder ${secretName}`);
    }
  }
}

console.log("mobile docs/config sanity passed");

function listFiles(root) {
  const output = [];
  for (const entry of readdirSync(root)) {
    const path = `${root}/${entry}`;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      output.push(...listFiles(path));
    } else if (/\.(ts|tsx|json)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path)) {
      output.push(path);
    }
  }
  return output;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
