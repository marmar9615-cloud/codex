import assert from "node:assert/strict";
import test from "node:test";
import {
  createJsonRpcNotification,
  createJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponseFor,
  parseJsonRpcLine,
  sanitizeForRunnerLog,
  serializeJsonRpcMessage,
} from "./jsonRpc.js";

test("serializes newline-delimited JSON-RPC messages for app-server stdio", () => {
  const request = createJsonRpcRequest(1, "initialize", { clientInfo: { name: "test" } });
  assert.equal(serializeJsonRpcMessage(request), '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"test"}}}\n');
  assert.deepEqual(parseJsonRpcLine('{"id":1,"result":{"ok":true}}'), { id: 1, result: { ok: true } });
  assert.ok(isJsonRpcResponseFor(parseJsonRpcLine('{"id":1,"result":{}}'), 1));
});

test("parses notifications separately from requests", () => {
  const notification = createJsonRpcNotification("initialized");
  const parsed = parseJsonRpcLine(serializeJsonRpcMessage(notification).trim());
  assert.ok(isJsonRpcNotification(parsed));
  assert.equal(parsed.method, "initialized");
});

test("redacts common token shapes before runner logging", () => {
  const redacted = sanitizeForRunnerLog(
    "OPENAI_API_KEY=sk-secret123456789 Bearer abcdefghijklmnopqrstuvwxyz access_token=\"super-secret\"",
  );
  assert.doesNotMatch(redacted, /sk-secret/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(redacted, /super-secret/);
  assert.match(redacted, /redacted/);
});
