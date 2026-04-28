import assert from "node:assert/strict";
import test from "node:test";
import { assertFeatureBranch, assertSafeGitPath, assertSafePushRequest } from "./GitSecurityPolicy.js";

test("Git security policy rejects traversal, absolute paths, protected branches, and force push", () => {
  assert.equal(assertSafeGitPath("src/App.tsx"), "src/App.tsx");
  assert.throws(() => assertSafeGitPath("../../outside.txt"), /path escapes workspace|escapes workspace/);
  assert.throws(() => assertSafeGitPath("/etc/passwd"), /workspace-relative/);
  assert.throws(() => assertSafeGitPath("a/../../outside.txt"), /path escapes workspace|escapes workspace/);

  assert.equal(assertFeatureBranch("codex/mobile-change"), "codex/mobile-change");
  assert.throws(() => assertFeatureBranch("main"), /protected branch/);
  assert.throws(() => assertFeatureBranch("feature/../main"), /Unsafe branch/);

  assert.deepEqual(assertSafePushRequest({ branchName: "codex/mobile-change" }), {
    branchName: "codex/mobile-change",
    force: false,
  });
  assert.throws(() => assertSafePushRequest({ branchName: "codex/mobile-change", force: true }), /Force push/);
});
