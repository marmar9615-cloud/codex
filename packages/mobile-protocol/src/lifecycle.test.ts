import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionPatchStatus,
  canTransitionRunnerJobStatus,
  transitionPatchStatus,
  transitionRunnerJobStatus,
} from "./lifecycle.js";

test("allows safe runner job transitions and rejects terminal rewrites", () => {
  assert.equal(canTransitionRunnerJobStatus("queued", "running"), true);
  assert.equal(canTransitionRunnerJobStatus("running", "awaitingApproval"), true);
  assert.equal(canTransitionRunnerJobStatus("awaitingApproval", "failed"), true);
  assert.equal(transitionRunnerJobStatus("running", "completed"), "completed");
  assert.throws(() => transitionRunnerJobStatus("completed", "running"), /invalid runner job transition/);
});

test("allows safe patch lifecycle transitions", () => {
  assert.equal(transitionPatchStatus("none", "available"), "available");
  assert.equal(transitionPatchStatus("available", "applied"), "applied");
  assert.equal(canTransitionPatchStatus("unsupported", "applied"), false);
  assert.throws(() => transitionPatchStatus("rejected", "applied"), /invalid patch transition/);
});
