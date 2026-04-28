import assert from "node:assert/strict";
import test from "node:test";
import { reduceMobileAuthState } from "@codex/mobile-protocol";

test("mobile auth state shell keeps production auth blocked by default", () => {
  assert.equal(
    reduceMobileAuthState(
      { status: "signedOut" },
      { type: "startChatgpt" },
      { chatgptAccountAuthEnabled: false, devApiKeyAuthEnabled: false },
    ).status,
    "blocked",
  );
});
