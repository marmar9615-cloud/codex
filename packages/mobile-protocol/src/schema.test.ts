import assert from "node:assert/strict";
import test from "node:test";
import { mobileProtocolSchemas } from "./schema.js";

test("schemas expose the MVP runner contract", () => {
  assert.deepEqual(mobileProtocolSchemas.mobileSession.required, [
    "id",
    "projectId",
    "projectName",
    "sourceKind",
    "status",
    "createdAt",
    "updatedAt",
  ]);
  assert.deepEqual(mobileProtocolSchemas.createSessionRequest.required, ["projectId", "projectName", "sourceKind"]);
  assert.deepEqual(mobileProtocolSchemas.startJobRequest.required, ["kind", "command"]);
  assert.deepEqual(mobileProtocolSchemas.buildJobRequest.required, ["commandKind"]);
  assert.deepEqual(mobileProtocolSchemas.runnerJob.required, [
    "id",
    "sessionId",
    "kind",
    "command",
    "mode",
    "status",
    "createdAt",
    "updatedAt",
  ]);
  assert.deepEqual(mobileProtocolSchemas.runnerLogEvent.required, [
    "type",
    "sessionId",
    "jobId",
    "sequence",
    "stream",
    "level",
    "message",
    "createdAt",
  ]);
  assert.deepEqual(mobileProtocolSchemas.runnerCapabilitiesResponse.required, [
    "defaultMode",
    "activeMode",
    "fakeRunner",
    "codexAppServerBridge",
    "supportedTransports",
    "sandboxBackends",
    "activeSandboxBackend",
    "commandKinds",
    "maxWorkspaceBytes",
    "maxArtifactBytes",
    "maxJobDurationMs",
    "maxLogBytes",
    "unsafeCustomCommandsEnabled",
    "productionOAuthEnabled",
    "remoteSandboxExecution",
    "phoneSideExecution",
  ]);
  assert.deepEqual(mobileProtocolSchemas.patchProposal.required, [
    "id",
    "sessionId",
    "summary",
    "unifiedDiff",
    "files",
    "createdAt",
  ]);
  assert.deepEqual(mobileProtocolSchemas.buildArtifact.required, ["id", "sessionId", "kind", "title", "createdAt"]);
  assert.deepEqual(mobileProtocolSchemas.buildJobResult.required, [
    "sessionId",
    "jobId",
    "backend",
    "commandKind",
    "status",
    "durationMs",
    "artifacts",
  ]);
  assert.deepEqual(mobileProtocolSchemas.commandPolicyViolation.required, ["code", "message"]);
  assert.deepEqual(mobileProtocolSchemas.runnerError.required, ["error"]);
  assert.deepEqual(mobileProtocolSchemas.receivePatchRequest.required, ["unifiedDiff"]);
});
