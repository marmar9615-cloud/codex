import assert from "node:assert/strict";
import test from "node:test";
import { DevAuthProvider } from "./DevAuthProvider.js";
import { createAuthPolicy } from "./AuthPolicy.js";

test("dev runner auth creates local identity while future production modes fail closed", () => {
  const devIdentity = createAuthPolicy("dev").authenticate(new DevAuthProvider(), {});
  assert.equal(devIdentity.actorId, "dev-local-user");
  assert.equal(devIdentity.devMode, true);
  assert.throws(() => createAuthPolicy("jwt").authenticate(new DevAuthProvider(), {}), /not implemented/);
  assert.throws(() => createAuthPolicy("session").authenticate(new DevAuthProvider(), {}), /not implemented/);
});
