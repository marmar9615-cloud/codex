import assert from "node:assert/strict";
import test from "node:test";
import { productionAuthBlockedReason, reduceMobileAuthState } from "./auth.js";
import type { AuthFeatureFlags } from "./auth.js";

const productionFlags: AuthFeatureFlags = {
  chatgptAccountAuthEnabled: false,
  devApiKeyAuthEnabled: false,
};

test("blocks ChatGPT auth until official mobile support is enabled", () => {
  assert.deepEqual(
    reduceMobileAuthState({ status: "signedOut" }, { type: "startChatgpt" }, productionFlags),
    { status: "blocked", reason: productionAuthBlockedReason },
  );
});

test("keeps dev API-key mode behind its own flag", () => {
  assert.deepEqual(
    reduceMobileAuthState({ status: "signedOut" }, { type: "enableDevApiKey" }, productionFlags),
    { status: "blocked", reason: "Dev API-key auth is disabled for this build." },
  );

  assert.deepEqual(
    reduceMobileAuthState(
      { status: "signedOut" },
      { type: "enableDevApiKey" },
      { ...productionFlags, devApiKeyAuthEnabled: true },
    ),
    { status: "authenticated", provider: "devApiKey", accountLabel: "Local dev API key" },
  );
});
