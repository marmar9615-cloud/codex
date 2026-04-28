import assert from "node:assert/strict";
import test from "node:test";
import { approvalKindForMethod, failClosedApprovalResponse } from "./CodexAppServerBridge.js";

test("classifies app-server approval requests", () => {
  assert.equal(approvalKindForMethod("item/commandExecution/requestApproval"), "command");
  assert.equal(approvalKindForMethod("item/fileChange/requestApproval"), "fileChange");
  assert.equal(approvalKindForMethod("item/permissions/requestApproval"), "permissions");
  assert.equal(approvalKindForMethod("mcpServer/elicitation/request"), "mcp");
  assert.equal(approvalKindForMethod("unknown/request"), null);
});

test("approval responses fail closed", () => {
  assert.deepEqual(failClosedApprovalResponse("item/commandExecution/requestApproval"), { decision: "decline" });
  assert.deepEqual(failClosedApprovalResponse("applyPatchApproval"), { decision: "denied" });
  assert.deepEqual(failClosedApprovalResponse("mcpServer/elicitation/request"), { action: "decline", content: null });
});
