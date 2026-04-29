#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const evidencePath = "docs/mobile/qa-evidence/latest-maestro-local-qa.md";
const flowsDir = ".maestro";
if (!existsSync(flowsDir)) {
  fail("missing .maestro flow directory");
}

const flows = readdirSync(flowsDir)
  .filter((file) => file.endsWith(".yml"))
  .sort()
  .map((file) => `${flowsDir}/${file}`);
if (flows.length === 0) {
  fail("no Maestro flows found");
}

const maestro = commandOutput("maestro --version");
const simctl = commandOutput("xcrun simctl list devices available");
const adb = commandOutput("adb devices");
const emulator = commandOutput("emulator -list-avds");
const appId = process.env.MAESTRO_APP_ID ?? "";
const shouldRun = process.env.RUN_MAESTRO_E2E === "1";

const missing = [];
if (!maestro.ok) {
  missing.push("Maestro CLI is not installed.");
}
if (!simctl.ok && !adb.ok && !emulator.ok) {
  missing.push("No usable iOS Simulator or Android Emulator tooling was detected.");
}
if (!appId) {
  missing.push("MAESTRO_APP_ID is not set.");
}
if (!shouldRun) {
  missing.push("RUN_MAESTRO_E2E is not 1.");
}

console.log(`Maestro flows: ${flows.join(", ")}`);

if (missing.length > 0) {
  writeEvidence("skipped", missing, null);
  console.log(`Maestro local E2E skipped: ${missing.join(" ")}`);
  process.exit(0);
}

const result = spawnSync("maestro", ["test", ...flows], {
  stdio: "pipe",
  encoding: "utf8",
  env: process.env,
});
const passed = result.status === 0;
writeEvidence(passed ? "pass" : "fail", [], {
  stdout: trim(result.stdout),
  stderr: trim(result.stderr),
});
if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.status ?? 1);

function writeEvidence(status, reasons, output) {
  mkdirSync("docs/mobile/qa-evidence", { recursive: true });
  const markdown = `# Latest Maestro Local QA

- Generated: ${new Date().toISOString()}
- Status: ${status}
- Command: \`RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=<app-id> pnpm test:mobile:e2e:maestro:check\`

## Detected Environment

- Maestro: ${maestro.ok ? maestro.stdout.split("\n")[0] : "not installed"}
- iOS Simulator tooling: ${simctl.ok ? "available" : "unavailable"}
- Android adb: ${adb.ok ? "available" : "unavailable"}
- Android emulator CLI: ${emulator.ok ? "available" : "unavailable"}
- MAESTRO_APP_ID set: ${appId ? "yes" : "no"}
- RUN_MAESTRO_E2E=1: ${shouldRun ? "yes" : "no"}

## Flows

${flows.map((flow) => `- \`${flow}\``).join("\n")}

## Result

${status === "skipped" ? reasons.map((reason) => `- ${reason}`).join("\n") : "- Maestro command completed."}

## Commands To Run Locally

\`\`\`bash
# Install Maestro if needed:
curl -Ls "https://get.maestro.mobile.dev" | bash

# Build or install an app target first, then run:
RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=codexmobile pnpm test:mobile:e2e:maestro:check
\`\`\`

## Expected Pass Criteria

- All four Maestro flows launch the app.
- Sample project opens the editor.
- Fake agent logs appear and an approved patch succeeds.
- Fake build runner shows logs/artifacts.
- Fake Git publish flow reaches PR-plan metadata.

${output ? `## Output Excerpt\n\nStdout:\n\n\`\`\`text\n${output.stdout}\n\`\`\`\n\nStderr:\n\n\`\`\`text\n${output.stderr}\n\`\`\`\n` : ""}
`;
  writeFileSync(evidencePath, markdown);
}

function commandOutput(command) {
  const result = spawnSync("sh", ["-lc", command], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: trim(result.stdout),
    stderr: trim(result.stderr),
  };
}

function trim(value) {
  const text = (value ?? "").trim();
  if (text.length <= 3000) {
    return text;
  }
  return `${text.slice(0, 1400)}\n...\n${text.slice(-1400)}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
