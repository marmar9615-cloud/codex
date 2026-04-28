import assert from "node:assert/strict";
import test from "node:test";
import { applyUnifiedPatchToText } from "./patch.js";

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
