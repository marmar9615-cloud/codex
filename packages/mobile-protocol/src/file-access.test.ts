import assert from "node:assert/strict";
import test from "node:test";
import { joinWorkspaceUri, normalizeWorkspaceRelativePath } from "./file-access.js";

test("normalizes safe workspace paths", () => {
  assert.equal(normalizeWorkspaceRelativePath("./src/../README.md"), "README.md");
  assert.equal(joinWorkspaceUri("file:///workspace/", "src/App.tsx"), "file:///workspace/src/App.tsx");
});

test("rejects traversal outside workspace", () => {
  assert.throws(() => normalizeWorkspaceRelativePath("../secrets"), /path escapes workspace/);
});
