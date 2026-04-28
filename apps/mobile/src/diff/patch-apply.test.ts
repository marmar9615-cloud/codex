import assert from "node:assert/strict";
import test from "node:test";
import { applyPatchProposalToTextWorkspace, applyUnifiedPatchToText, parseUnifiedDiffToPatchProposal } from "@codex/mobile-protocol";

test("diff shell can preview a user-approved text patch", () => {
  const result = applyUnifiedPatchToText("a\nb\n", "@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
  assert.deepEqual(result, { ok: true, text: "a\nc\n", appliedHunks: 1 });
});

test("mobile patch helper applies added and deleted files only after approval", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/added.txt b/added.txt
--- /dev/null
+++ b/added.txt
@@ -0,0 +1 @@
+hello
diff --git a/deleted.txt b/deleted.txt
--- a/deleted.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt: "2026-04-28T20:00:00.000Z" },
  );
  const result = applyPatchProposalToTextWorkspace([{ path: "deleted.txt", text: "bye\n" }], patch);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.files.find((file) => file.path === "added.txt")?.text, "hello");
    assert.equal(result.files.find((file) => file.path === "deleted.txt"), undefined);
  }
});

test("mobile patch helper rejects unsupported changes", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt: "2026-04-28T20:00:00.000Z" },
  );
  assert.deepEqual(applyPatchProposalToTextWorkspace([], patch), {
    ok: false,
    error: "patch includes unsupported changes",
  });
});
