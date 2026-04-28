import assert from "node:assert/strict";
import test from "node:test";
import { MobileRunnerClient, RunnerClientError, getLatestJob, parseRunnerSseText } from "./runner-client";

test("parses runner SSE events and finds final job status", () => {
  const events = parseRunnerSseText(
    [
      "event: log",
      'data: {"type":"runner.log","sessionId":"mrs_0001","jobId":"mrj_0001","sequence":1,"stream":"stdout","level":"info","message":"hello","createdAt":"2026-04-28T20:00:00.000Z"}',
      "",
      "event: jobStatus",
      'data: {"type":"runner.jobStatus","sessionId":"mrs_0001","job":{"id":"mrj_0001","sessionId":"mrs_0001","kind":"test","command":["npm","test"],"mode":"fake","status":"succeeded","createdAt":"2026-04-28T20:00:00.000Z","updatedAt":"2026-04-28T20:00:00.000Z"}}',
      "",
      "event: patch",
      'data: {"type":"runner.patch","sessionId":"mrs_0001","jobId":"mrj_0001","patchId":"mrp_0001","source":"codex-app-server","summary":"Patch ready","unifiedDiff":"--- a/README.md\\n+++ b/README.md\\n","filesChanged":1,"unsupportedChanges":0,"status":"available","createdAt":"2026-04-28T20:00:00.000Z"}',
      "",
    ].join("\n"),
  );
  assert.equal(events.length, 3);
  assert.equal(getLatestJob(events)?.status, "succeeded");
});

test("rejects malformed runner SSE", () => {
  assert.throws(() => parseRunnerSseText("event: log\ndata: not-json\n\n"), /malformed runner SSE/);
  assert.throws(() => parseRunnerSseText("event: log\n\n"), /missing data line/);
});

test("runner client reports offline and HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("connection refused");
    };
    await assert.rejects(
      () =>
        new MobileRunnerClient("http://runner.invalid").createSession({
          projectId: "project-1",
          projectName: "Codex",
          sourceKind: "appWorkspace",
        }),
      /runner offline/,
    );

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "bad" }), { status: 500 });
    await assert.rejects(
      () =>
        new MobileRunnerClient("http://runner.invalid").createSession({
          projectId: "project-1",
          projectName: "Codex",
          sourceKind: "appWorkspace",
        }),
      (error) => error instanceof RunnerClientError && error.status === 500,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runner client validates capabilities response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          defaultMode: "fake",
          activeMode: "codex-app-server",
          fakeRunner: true,
          codexAppServerBridge: true,
          supportedTransports: ["stdio"],
          sandboxBackends: ["fake"],
          activeSandboxBackend: "fake",
          commandKinds: ["npm_install", "npm_test", "npm_build"],
          maxWorkspaceBytes: 52428800,
          maxArtifactBytes: 10485760,
          maxJobDurationMs: 120000,
          maxLogBytes: 1048576,
          unsafeCustomCommandsEnabled: false,
          productionOAuthEnabled: false,
          remoteSandboxExecution: false,
          phoneSideExecution: false,
        }),
        { status: 200 },
      );
    const capabilities = await new MobileRunnerClient("http://runner.invalid").getCapabilities();
    assert.equal(capabilities.activeMode, "codex-app-server");
    assert.deepEqual(capabilities.supportedTransports, ["stdio"]);
    assert.equal(capabilities.activeSandboxBackend, "fake");
    assert.deepEqual(capabilities.commandKinds, ["npm_install", "npm_test", "npm_build"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runner client starts sandbox build jobs", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /npm_test/);
      return new Response(
        JSON.stringify({
          job: {
            id: "mrj_0001",
            sessionId: "mrs_0001",
            kind: "test",
            command: ["sandbox", "npm_test"],
            mode: "fake",
            sandboxBackend: "fake",
            sandboxCommandKind: "npm_test",
            status: "queued",
            createdAt: "2026-04-28T20:00:00.000Z",
            updatedAt: "2026-04-28T20:00:00.000Z",
          },
          logStreamUrl: "/sessions/mrs_0001/jobs/mrj_0001/logs",
        }),
        { status: 202 },
      );
    };
    const started = await new MobileRunnerClient("http://runner.invalid").startBuildJob("mrs_0001", "mrj_0001", {
      commandKind: "npm_test",
    });
    assert.equal(started.job.sandboxCommandKind, "npm_test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
