import assert from "node:assert/strict";
import test from "node:test";
import { applyPatchProposalToTextWorkspace, applyUnifiedPatchToText } from "./patch.js";
import { parseUnifiedDiffToPatchProposal } from "./patch/unifiedDiff.js";

test("applies a simple unified patch", () => {
  const patch = `--- a/hello.txt
+++ b/hello.txt
@@ -1,3 +1,3 @@
 hello
-old
+new
 done`;

  assert.deepEqual(applyUnifiedPatchToText("hello\nold\ndone\n", patch), {
    ok: true,
    text: "hello\nnew\ndone\n",
    appliedHunks: 1,
  });
});

test("reports context mismatches", () => {
  const patch = `@@ -1,2 +1,2 @@
 missing
-old
+new`;

  const result = applyUnifiedPatchToText("hello\nold\n", patch);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /context mismatch/);
  }
});

test("applies modify, add, and delete file patches to a text workspace", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/src/App.tsx b/src/App.tsx
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old
+new
diff --git a/NEW.md b/NEW.md
--- /dev/null
+++ b/NEW.md
@@ -0,0 +1 @@
+hello
diff --git a/OLD.md b/OLD.md
--- a/OLD.md
+++ /dev/null
@@ -1 +0,0 @@
-bye
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt: "2026-04-28T20:00:00.000Z" },
  );
  const result = applyPatchProposalToTextWorkspace(
    [
      { path: "src/App.tsx", text: "old\n" },
      { path: "OLD.md", text: "bye\n" },
    ],
    patch,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.files.find((file) => file.path === "src/App.tsx")?.text, "new\n");
    assert.equal(result.files.find((file) => file.path === "NEW.md")?.text, "hello");
    assert.equal(result.files.find((file) => file.path === "OLD.md"), undefined);
    assert.equal(result.backups.length, 3);
  }
});

test("rejects unsupported patches and missing workspace root", () => {
  const unsupported = parseUnifiedDiffToPatchProposal(
    `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt: "2026-04-28T20:00:00.000Z" },
  );
  assert.deepEqual(applyPatchProposalToTextWorkspace([], unsupported), {
    ok: false,
    error: "patch includes unsupported changes",
  });
  assert.deepEqual(applyPatchProposalToTextWorkspace([], { ...unsupported, unsupportedChanges: 0, files: [] }, { workspaceRootPresent: false }), {
    ok: false,
    error: "workspace root is missing",
  });
});

test("rejects traversal paths while applying", () => {
  assert.throws(
    () =>
      applyPatchProposalToTextWorkspace([], {
        id: "mrp_0001",
        sessionId: "mrs_0001",
        summary: "bad",
        unifiedDiff: "",
        files: [{ oldPath: "../../outside.txt", newPath: "../../outside.txt", hunks: [] }],
        createdAt: "2026-04-28T20:00:00.000Z",
      }),
    /path escapes workspace/,
  );
});
