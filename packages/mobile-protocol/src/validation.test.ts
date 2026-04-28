import assert from "node:assert/strict";
import test from "node:test";
import { assertCreateSessionRequest, assertStartJobRequest } from "./validation.js";

test("validates create session request", () => {
  assert.deepEqual(
    assertCreateSessionRequest({
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "github",
    }),
    {
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "github",
    },
  );
});

test("rejects empty command", () => {
  assert.throws(
    () =>
      assertStartJobRequest({
        kind: "test",
        command: [],
      }),
    /command must be a non-empty string array/,
  );
});
