import assert from "node:assert/strict";
import test from "node:test";
import { mobileProtocolSchemas } from "./schema.js";

test("schemas expose the MVP runner contract", () => {
  assert.deepEqual(mobileProtocolSchemas.createSessionRequest.required, ["projectId", "projectName", "sourceKind"]);
  assert.deepEqual(mobileProtocolSchemas.startJobRequest.required, ["kind", "command"]);
  assert.deepEqual(mobileProtocolSchemas.receivePatchRequest.required, ["unifiedDiff"]);
});
