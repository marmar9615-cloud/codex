#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outputPath = "docs/mobile/qa-evidence/latest-local-qa.md";
const commands = [
  ["pnpm install", ["pnpm", ["install"]]],
  ["pnpm test:mobile:all", ["pnpm", ["test:mobile:all"]]],
];

const startedAt = new Date();
const commit = runText("git", ["rev-parse", "HEAD"]).trim();
const branch = runText("git", ["branch", "--show-current"]).trim();
const rows = [];
let failed = false;

for (const [label, [command, args]] of commands) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env });
  const durationMs = Date.now() - started;
  rows.push({
    command: label,
    status: result.status === 0 ? "pass" : "fail",
    durationMs,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  });
  if (result.status !== 0) {
    failed = true;
    break;
  }
}

const skipped = [
  ["Optional live Docker sandbox", "Skipped unless ENABLE_LIVE_DOCKER_SANDBOX_TESTS=1 and Docker daemon is available."],
  ["Live GitHub App", "Skipped unless ENABLE_LIVE_GITHUB_APP_TESTS=1 and all GitHub App env values point at a test repo/branch."],
  ["Live cloud runner", "Skipped unless ENABLE_LIVE_CLOUD_RUNNER_TESTS=1 and a real provider adapter is configured."],
  ["Maestro local device run", hasCommand("maestro") ? "Maestro CLI is installed; still skipped by this normal report unless a simulator/emulator/app build is supplied." : "Maestro CLI is not installed."],
  ["EAS cloud workflows", "Not run locally; requires EAS project credentials and explicit human trigger."],
  ["Codex browser/computer-use manual QA", "Not run by this script; use docs/mobile/codex-computer-use-qa-checklist.md when an interactive browser/simulator is available."],
];

const report = `# Latest Local Mobile QA Evidence

- Generated: ${startedAt.toISOString()}
- Git branch: ${branch}
- Git commit: ${commit}
- Host: ${process.platform} ${process.arch}
- Node: ${process.version}
- Overall status: ${failed ? "fail" : "pass"}

## Commands

| Command | Status | Duration |
| --- | --- | --- |
${rows.map((row) => `| \`${row.command}\` | ${row.status} | ${row.durationMs}ms |`).join("\n")}

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
${skipped.map(([name, reason]) => `| ${name} | ${reason} |`).join("\n")}

## Next QA Gaps

- Run Maestro flows on a real simulator/emulator build.
- Add live Docker evidence when Docker daemon is available.
- Add live GitHub App evidence against a test repository after server-side provider implementation.
- Add production cloud runner evidence after a real provider adapter exists.
- Capture manual browser/computer-use screenshots only when that environment is available.
`;

mkdirSync("docs/mobile/qa-evidence", { recursive: true });
writeFileSync(outputPath, report);
console.log(`wrote ${outputPath}`);
process.exit(failed ? 1 : 0);

function runText(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function hasCommand(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
  return result.status === 0;
}

function trimOutput(value) {
  const text = (value ?? "").trim();
  if (text.length <= 3000) {
    return text;
  }
  return `${text.slice(0, 1400)}\n...\n${text.slice(-1400)}`;
}
