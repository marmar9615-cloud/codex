#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflows = [
  {
    path: ".eas/workflows/e2e-android.yml",
    platform: "android",
    profile: "e2e-simulator",
    buildMarker: "Build Android APK for E2E",
  },
  {
    path: ".eas/workflows/e2e-ios.yml",
    platform: "ios",
    profile: "e2e-simulator",
    buildMarker: "Build iOS simulator app for E2E",
  },
];

const expectedFlows = [
  ".maestro/sample_project_flow.yml",
  ".maestro/fake_agent_patch_flow.yml",
  ".maestro/fake_build_runner_flow.yml",
  ".maestro/fake_git_publish_flow.yml",
];

const easConfig = JSON.parse(readFileSync("apps/mobile/eas.json", "utf8"));
const e2eProfile = easConfig.build?.["e2e-simulator"];
if (!e2eProfile) {
  fail("apps/mobile/eas.json is missing build.e2e-simulator");
}
if (e2eProfile.android?.buildType !== "apk") {
  fail("build.e2e-simulator.android.buildType must be apk for Maestro Android E2E");
}
if (e2eProfile.ios?.simulator !== true) {
  fail("build.e2e-simulator.ios.simulator must be true for Maestro iOS E2E");
}

for (const flow of expectedFlows) {
  if (!existsSync(flow)) {
    fail(`missing Maestro flow referenced by EAS workflows: ${flow}`);
  }
}

for (const workflow of workflows) {
  if (!existsSync(workflow.path)) {
    fail(`missing EAS workflow: ${workflow.path}`);
  }
  const text = readFileSync(workflow.path, "utf8");
  requireIncludes(text, "type: build", workflow.path);
  requireIncludes(text, "type: maestro", workflow.path);
  requireIncludes(text, `platform: ${workflow.platform}`, workflow.path);
  requireIncludes(text, `profile: ${workflow.profile}`, workflow.path);
  requireIncludes(text, workflow.buildMarker, workflow.path);
  for (const flow of expectedFlows) {
    requireIncludes(text, flow, workflow.path);
  }
}

console.log("mobile EAS E2E workflow validation passed");
console.log("Run later with:");
console.log("  npx eas-cli@latest workflow:run .eas/workflows/e2e-android.yml");
console.log("  npx eas-cli@latest workflow:run .eas/workflows/e2e-ios.yml");

function requireIncludes(text, needle, file) {
  if (!text.includes(needle)) {
    fail(`${file} does not include expected value: ${needle}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
