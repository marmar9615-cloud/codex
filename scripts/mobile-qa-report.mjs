#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outputPath = "docs/mobile/qa-evidence/latest-local-qa.md";
const commands = [
  { label: "pnpm install", command: "pnpm", args: ["install"], blocking: true },
  { label: "pnpm test:mobile:all", command: "pnpm", args: ["test:mobile:all"], blocking: true },
  { label: "pnpm test:mobile:e2e:eas:validate", command: "pnpm", args: ["test:mobile:e2e:eas:validate"], blocking: true },
  { label: "pnpm test:mobile:e2e:web", command: "pnpm", args: ["test:mobile:e2e:web"], blocking: false },
  { label: "pnpm test:mobile:e2e:maestro:check", command: "pnpm", args: ["test:mobile:e2e:maestro:check"], blocking: false },
];

const startedAt = new Date();
const commit = runText("git", ["rev-parse", "HEAD"]).trim();
const branch = runText("git", ["branch", "--show-current"]).trim();
const rows = [];
let failed = false;

for (const item of commands) {
  const started = Date.now();
  const result = spawnSync(item.command, item.args, { encoding: "utf8", env: process.env });
  const durationMs = Date.now() - started;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const status = result.status === 0 ? statusFromOutput(item.label, output) : "fail";
  rows.push({
    command: item.label,
    status,
    blocking: item.blocking,
    durationMs,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  });
  if (result.status !== 0) {
    failed = true;
  }
  if (result.status !== 0 && item.blocking) {
    break;
  }
}

const optionalStatuses = [
  ["Expo web smoke", rowStatus("pnpm test:mobile:e2e:web"), "pnpm test:mobile:e2e:web"],
  ["Maestro local E2E", rowStatus("pnpm test:mobile:e2e:maestro:check"), "RUN_MAESTRO_E2E=1 MAESTRO_APP_ID=<app-id> pnpm test:mobile:e2e:maestro:check"],
  ["Codex browser/computer-use manual QA", computerUseStatus(), "Follow docs/mobile/codex-computer-use-qa-checklist.md"],
  ["EAS workflow path/profile validation", rowStatus("pnpm test:mobile:e2e:eas:validate"), "pnpm test:mobile:e2e:eas:validate"],
];

const report = `# Latest Local Mobile QA Evidence

- Generated: ${startedAt.toISOString()}
- Git branch: ${branch}
- Git commit: ${commit}
- Host: ${process.platform} ${process.arch}
- Node: ${process.version}
- Overall status: ${failed ? "fail" : "pass"}

## Commands

| Command | Status | Blocking | Duration |
| --- | --- | --- | --- |
${rows.map((row) => `| \`${row.command}\` | ${row.status} | ${row.blocking ? "yes" : "no"} | ${row.durationMs}ms |`).join("\n")}

## Optional QA Path Status

| Path | Status | Re-run command |
| --- | --- | --- |
${optionalStatuses.map(([name, status, command]) => `| ${name} | ${status} | \`${command}\` |`).join("\n")}

## Command Output Notes

${rows
  .map(
    (row) => `### ${row.command}

Status: ${row.status}

${row.stdout ? `Stdout excerpt:\n\n\`\`\`text\n${row.stdout}\n\`\`\`\n` : ""}
${row.stderr ? `Stderr excerpt:\n\n\`\`\`text\n${row.stderr}\n\`\`\`\n` : ""}
`,
  )
  .join("\n")}

## Skipped Optional Tests

| Test | Reason |
| --- | --- |
${skippedRows().map(([name, reason]) => `| ${name} | ${reason} |`).join("\n")}

## Next QA Gaps

- Run Maestro flows on a real simulator/emulator build after Maestro and app target are available.
- Add live Docker evidence when Docker daemon is available.
- Add live GitHub App evidence against a test repository after server-side provider implementation.
- Add production cloud runner evidence after a real provider adapter exists.
- Re-run Codex browser/computer-use QA when a browser/simulator target is available.
`;

mkdirSync("docs/mobile/qa-evidence", { recursive: true });
writeFileSync(outputPath, report);
console.log(`wrote ${outputPath}`);
process.exit(failed ? 1 : 0);

function rowStatus(command) {
  return rows.find((row) => row.command === command)?.status ?? "not run";
}

function computerUseStatus() {
  const file = "docs/mobile/qa-evidence/latest-computer-use-qa.md";
  if (!existsSync(file)) {
    return "skipped";
  }
  const text = readFileSync(file, "utf8").toLowerCase();
  if (text.includes("status: pass")) {
    return "pass";
  }
  if (text.includes("status: fail")) {
    return "fail";
  }
  return "skipped";
}

function skippedRows() {
  const rows = [
    ["Optional live Docker sandbox", "Skipped unless ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 and Docker daemon is available."],
    ["Live GitHub App", "Skipped unless ENABLE_LIVE_GITHUB_APP_TESTS=1 and all GitHub App env values point at a test repo/branch."],
    ["Live cloud runner", "Skipped unless ENABLE_LIVE_CLOUD_RUNNER_TESTS=1 and a real provider adapter is configured."],
    ["EAS cloud workflow execution", "Not run locally; requires EAS project credentials and explicit human trigger."],
  ];
  if (rowStatus("pnpm test:mobile:e2e:web") === "skipped") {
    rows.push(["Expo web smoke", "Skipped by script; see docs/mobile/qa-evidence/latest-web-smoke-qa.md for the exact local blocker."]);
  }
  if (rowStatus("pnpm test:mobile:e2e:maestro:check") === "skipped") {
    rows.push(["Maestro local E2E", "Skipped by script; see docs/mobile/qa-evidence/latest-maestro-local-qa.md for missing tools/build target."]);
  }
  if (computerUseStatus() === "skipped") {
    rows.push(["Codex browser/computer-use manual QA", "Skipped unless an interactive browser/simulator target is available."]);
  }
  return rows;
}

function statusFromOutput(label, output) {
  const lower = output.toLowerCase();
  if (label.includes("e2e:web") && lower.includes("expo web smoke skipped")) {
    return "skipped";
  }
  if (label.includes("maestro") && lower.includes("maestro local e2e skipped")) {
    return "skipped";
  }
  return "pass";
}

function runText(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function trimOutput(value) {
  const text = (value ?? "").trim();
  if (text.length <= 3000) {
    return text;
  }
  return `${text.slice(0, 1400)}\n...\n${text.slice(-1400)}`;
}
