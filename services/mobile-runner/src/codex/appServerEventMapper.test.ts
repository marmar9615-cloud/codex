import assert from "node:assert/strict";
import test from "node:test";
import { mapAppServerNotification } from "./appServerEventMapper.js";

const context = {
  sessionId: "mrs_0001",
  jobId: "mrj_0001",
  sequence: 1,
  now: () => "2026-04-28T20:00:00.000Z",
};

test("maps app-server turn and message notifications to runner logs", () => {
  const started = mapAppServerNotification(
    { method: "turn/started", params: { threadId: "thr_123", turn: { id: "turn_456" } } },
    context,
  );
  assert.equal(started.appServerThreadId, "thr_123");
  assert.equal(started.appServerTurnId, "turn_456");
  assert.match(started.log?.message ?? "", /turn started/);

  const delta = mapAppServerNotification(
    { method: "item/agentMessage/delta", params: { delta: "Hello from Codex." } },
    { ...context, sequence: 2 },
  );
  assert.equal(delta.log?.stream, "stdout");
  assert.equal(delta.log?.category, "agentText");
  assert.equal(delta.log?.message, "Hello from Codex.");
});

test("maps app-server diff notifications", () => {
  const mapped = mapAppServerNotification(
    {
      method: "turn/diff/updated",
      params: { threadId: "thr_123", turnId: "turn_456", diff: "--- a/README.md\n+++ b/README.md\n" },
    },
    context,
  );
  assert.equal(mapped.diffUpdate?.threadId, "thr_123");
  assert.equal(mapped.diffUpdate?.turnId, "turn_456");
  assert.match(mapped.diffUpdate?.unifiedDiff ?? "", /README/);
  assert.equal(mapped.log?.category, "diff");
});

test("detects app-server turn completion", () => {
  const completed = mapAppServerNotification(
    { method: "turn/completed", params: { turn: { id: "turn_456", status: "completed" } } },
    context,
  );
  assert.equal(completed.completed, true);
  assert.equal(completed.status, "succeeded");
});

test("redacts secrets from mapped logs", () => {
  const mapped = mapAppServerNotification(
    { method: "item/agentMessage/delta", params: { delta: "token sk-secret123456789" } },
    context,
  );
  assert.doesNotMatch(mapped.log?.message ?? "", /sk-secret/);
});
