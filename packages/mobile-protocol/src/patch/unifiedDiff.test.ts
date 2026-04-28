import assert from "node:assert/strict";
import test from "node:test";
import { parseUnifiedDiffFiles, parseUnifiedDiffToPatchProposal, UnifiedDiffParseError } from "./unifiedDiff.js";

const createdAt = "2026-04-28T20:00:00.000Z";

test("parses modified files with multiple hunks", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/src/App.tsx b/src/App.tsx
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,2 +1,2 @@
 old
-name
+mobile
@@ -10,2 +10,3 @@
 done
+again
`,
    { id: "mrp_0001", sessionId: "mrs_0001", jobId: "mrj_0001", source: "codex-app-server", createdAt },
  );
  assert.equal(patch.filesChanged, 1);
  assert.equal(patch.unsupportedChanges, 0);
  assert.equal(patch.status, "available");
  assert.equal(patch.files[0]?.changeKind, "modified");
  assert.equal(patch.files[0]?.hunks.length, 2);
});

test("parses added and deleted files", () => {
  const files = parseUnifiedDiffFiles(`diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+new
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-old
`);
  assert.equal(files.length, 2);
  assert.equal(files[0]?.changeKind, "added");
  assert.equal(files[0]?.oldPath, "new.txt");
  assert.equal(files[1]?.changeKind, "deleted");
  assert.equal(files[1]?.newPath, "old.txt");
});

test("keeps hunk lines that look like file headers", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 title
--- old marker
+++ new marker
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt: "2026-04-28T20:00:00.000Z" },
  );
  assert.equal(patch.files[0]?.hunks[0]?.lines[1]?.kind, "remove");
  assert.equal(patch.files[0]?.hunks[0]?.lines[1]?.text, "-- old marker");
  assert.equal(patch.files[0]?.hunks[0]?.lines[2]?.kind, "add");
  assert.equal(patch.files[0]?.hunks[0]?.lines[2]?.text, "++ new marker");
});

test("marks binary diffs as unsupported", () => {
  const patch = parseUnifiedDiffToPatchProposal(
    `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`,
    { id: "mrp_0001", sessionId: "mrs_0001", createdAt },
  );
  assert.equal(patch.status, "unsupported");
  assert.equal(patch.unsupportedChanges, 1);
  assert.equal(patch.files[0]?.changeKind, "unsupported");
});

test("handles empty diffs", () => {
  const patch = parseUnifiedDiffToPatchProposal("", { id: "mrp_0001", sessionId: "mrs_0001", createdAt });
  assert.equal(patch.filesChanged, 0);
  assert.equal(patch.status, "none");
  assert.deepEqual(patch.files, []);
});

test("rejects malicious patch paths", () => {
  const cases = ["../../outside.txt", "/etc/passwd", "a/../../outside.txt", "b/../../outside.txt", "nested/../../../outside.txt"];
  for (const path of cases) {
    assert.throws(
      () =>
        parseUnifiedDiffFiles(`diff --git a/good.txt b/good.txt
--- ${path}
+++ b/good.txt
@@ -1 +1 @@
-a
+b
`),
      UnifiedDiffParseError,
      path,
    );
  }
});
