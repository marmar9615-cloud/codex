import assert from "node:assert/strict";
import test from "node:test";
import { defaultResourceLimits } from "../config.js";
import { normalizeArtifactPath, resolveSandboxCommand } from "./SandboxCommandPolicy.js";

const policyOptions = {
  unsafeCustomCommandsEnabled: false,
  dockerNetworkMode: "none" as const,
  resourceLimits: defaultResourceLimits,
};

test("command policy accepts known sandbox command kinds", () => {
  const resolved = resolveSandboxCommand({ commandKind: "npm_test" }, policyOptions);
  assert.deepEqual(resolved.command, ["npm", "test"]);
  assert.equal(resolved.networkMode, "none");
});

test("command policy rejects raw shell and disabled custom commands", () => {
  assert.throws(
    () => resolveSandboxCommand({ commandKind: "npm_test", command: ["npm", "test"] }, policyOptions),
    /Raw command arrays/,
  );
  assert.throws(
    () => resolveSandboxCommand({ commandKind: "custom", command: ["bash", "-lc", "npm test"] }, policyOptions),
    /Custom sandbox commands are disabled/,
  );
  assert.throws(
    () =>
      resolveSandboxCommand(
        { commandKind: "custom", command: ["bash", "-lc", "npm test"] },
        { ...policyOptions, unsafeCustomCommandsEnabled: true },
      ),
    /Shell execution is disabled/,
  );
});

test("command policy rejects unsafe working directories and artifact paths", () => {
  assert.throws(() => resolveSandboxCommand({ commandKind: "npm_test", workingDirectory: "../outside" }, policyOptions), /path escapes workspace/);
  assert.throws(() => resolveSandboxCommand({ commandKind: "npm_test", workingDirectory: "/tmp" }, policyOptions), /relative to the runner workspace/);
  assert.throws(() => normalizeArtifactPath("../outside"), /path escapes workspace/);
  assert.throws(() => normalizeArtifactPath("node_modules"), /not allowlisted/);
});
