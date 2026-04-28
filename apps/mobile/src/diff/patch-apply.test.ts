import assert from "node:assert/strict";
import test from "node:test";
import { applyUnifiedPatchToText } from "@codex/mobile-protocol";

test("diff shell can preview a user-approved text patch", () => {
  const result = applyUnifiedPatchToText("a\nb\n", "@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
  assert.deepEqual(result, { ok: true, text: "a\nc\n", appliedHunks: 1 });
});
