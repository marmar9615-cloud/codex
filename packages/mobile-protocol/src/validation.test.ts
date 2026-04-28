import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBuildArtifact,
  assertBuildJobRequest,
  assertBuildJobResult,
  assertCommandPolicyViolation,
  assertCreateSessionRequest,
  assertMobileSession,
  assertPatchProposal,
  assertProjectSnapshot,
  assertRunnerError,
  assertRunnerCapabilitiesResponse,
  assertRunnerEvent,
  assertRunnerJob,
  assertRunnerLogEvent,
  assertSandboxError,
  assertStartJobRequest,
} from "./validation.js";

const timestamp = "2026-04-28T20:00:00.000Z";

test("validates create session request", () => {
  assert.deepEqual(
    assertCreateSessionRequest({
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "github",
    }),
    {
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "github",
    },
  );
});

test("validates runner session payloads", () => {
  assert.deepEqual(
    assertMobileSession({
      id: "mrs_0001",
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "appWorkspace",
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
      snapshotVersion: 1,
    }),
    {
      id: "mrs_0001",
      projectId: "project-1",
      projectName: "Codex",
      sourceKind: "appWorkspace",
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
      snapshotVersion: 1,
    },
  );
});

test("validates project snapshot payloads", () => {
  assert.deepEqual(
    assertProjectSnapshot({
      files: [{ path: "src/App.tsx", contentsBase64: "ZXhwb3J0" }],
      deletedPaths: ["old.txt"],
    }),
    {
      files: [{ path: "src/App.tsx", contentsBase64: "ZXhwb3J0", mode: undefined, sha256: undefined }],
      deletedPaths: ["old.txt"],
    },
  );
});

test("validates runner job and log payloads", () => {
  assert.equal(
    assertRunnerJob({
      id: "mrj_0001",
      sessionId: "mrs_0001",
      kind: "test",
      command: ["npm", "test"],
      mode: "fake",
      sandboxBackend: "fake",
      sandboxCommandKind: "npm_test",
      exitCode: 0,
      durationMs: 412,
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
    }).status,
    "running",
  );
  assert.equal(
    assertRunnerLogEvent({
      type: "runner.log",
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      sequence: 1,
      stream: "stdout",
      level: "info",
      category: "agentText",
      message: "hello",
      createdAt: timestamp,
    }).message,
    "hello",
  );
});

test("validates sandbox build requests and results", () => {
  assert.deepEqual(
    assertBuildJobRequest({
      commandKind: "pnpm_test",
      packageManager: "pnpm",
      workingDirectory: "packages/mobile-protocol",
      artifactPaths: ["coverage"],
    }),
    {
      commandKind: "pnpm_test",
      packageManager: "pnpm",
      workingDirectory: "packages/mobile-protocol",
      artifactPaths: ["coverage"],
      command: undefined,
    },
  );

  assert.equal(
    assertBuildJobResult({
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      backend: "fake",
      commandKind: "npm_test",
      status: "succeeded",
      exitCode: 0,
      durationMs: 25,
      artifacts: [
        {
          id: "mra_0001",
          sessionId: "mrs_0001",
          jobId: "mrj_0001",
          kind: "testReport",
          title: "Sandbox artifact",
          createdAt: timestamp,
        },
      ],
    }).backend,
    "fake",
  );
});

test("validates runner capabilities payloads", () => {
  assert.deepEqual(
    assertRunnerCapabilitiesResponse({
      defaultMode: "fake",
      activeMode: "codex-app-server",
      fakeRunner: true,
      codexAppServerBridge: true,
      supportedTransports: ["stdio"],
      sandboxBackends: ["fake", "local-docker"],
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
    {
      defaultMode: "fake",
      activeMode: "codex-app-server",
      fakeRunner: true,
      codexAppServerBridge: true,
      supportedTransports: ["stdio"],
      sandboxBackends: ["fake", "local-docker"],
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
    },
  );
});

test("validates patch proposals and artifacts", () => {
  const patch = assertPatchProposal({
    id: "mrp_0001",
    sessionId: "mrs_0001",
    jobId: "mrj_0001",
    source: "codex-app-server",
    appServerThreadId: "thr_123",
    appServerTurnId: "turn_123",
    summary: "Update sample app title.",
    unifiedDiff: "--- a/src/App.tsx\n+++ b/src/App.tsx\n",
    createdAt: timestamp,
    filesChanged: 1,
    unsupportedChanges: 0,
    status: "available",
    metadata: { source: "codex-app-server" },
    files: [
      {
        oldPath: "src/App.tsx",
        newPath: "src/App.tsx",
        changeKind: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [{ kind: "add", text: "" }],
          },
        ],
      },
    ],
  });
  assert.equal(patch.files[0]?.newPath, "src/App.tsx");
  assert.equal(patch.source, "codex-app-server");

  const artifact = assertBuildArtifact({
    id: "mra_0001",
    sessionId: "mrs_0001",
    jobId: "mrj_0001",
    kind: "webPreview",
    title: "Preview URL",
    webPreviewUrl: "https://example.invalid/preview",
    buildLogUrl: "https://example.invalid/build.log",
    apkUrl: "https://example.invalid/app.apk",
    iosInstructions: "Open the build log and hand off to TestFlight.",
    createdAt: timestamp,
  });
  assert.equal(artifact.apkUrl, "https://example.invalid/app.apk");
});

test("validates approval request events", () => {
  assert.equal(
    assertRunnerEvent({
      type: "runner.approvalRequest",
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      requestId: 61,
      approvalId: "approval-1",
      approvalKind: "command",
      summary: "Approval required",
      createdAt: timestamp,
    }).type,
    "runner.approvalRequest",
  );
});

test("validates runner errors", () => {
  assert.deepEqual(assertRunnerError({ error: "missing session", code: "not_found" }), {
    error: "missing session",
    code: "not_found",
    sessionId: undefined,
    jobId: undefined,
  });
  assert.deepEqual(assertSandboxError({ error: "docker missing", code: "docker_missing", backend: "local-docker" }), {
    error: "docker missing",
    code: "docker_missing",
    sessionId: undefined,
    jobId: undefined,
    backend: "local-docker",
  });
  assert.deepEqual(assertCommandPolicyViolation({ code: "raw_shell_disabled", message: "No shell", field: "command" }), {
    code: "raw_shell_disabled",
    message: "No shell",
    field: "command",
  });
});

test("rejects empty command", () => {
  assert.throws(
    () =>
      assertStartJobRequest({
        kind: "test",
        command: [],
      }),
    /command must be a non-empty string array/,
  );
});

test("rejects invalid runner payloads", () => {
  assert.throws(
    () =>
      assertRunnerLogEvent({
        type: "runner.log",
        sessionId: "mrs_0001",
        jobId: "mrj_0001",
        sequence: 1,
        stream: "socket",
        level: "info",
        message: "bad",
        createdAt: timestamp,
      }),
    /unsupported log stream/,
  );
  assert.throws(
    () =>
      assertBuildArtifact({
        id: "mra_0001",
        sessionId: "mrs_0001",
        kind: "binary",
        title: "Unknown",
        createdAt: timestamp,
      }),
    /unsupported artifact kind/,
  );
  assert.throws(
    () =>
      assertRunnerJob({
        id: "mrj_0001",
        sessionId: "mrs_0001",
        kind: "test",
        command: ["npm", "test"],
        mode: "pretend-real",
        status: "running",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    /unsupported runner mode/,
  );
  assert.throws(
    () =>
      assertRunnerCapabilitiesResponse({
        defaultMode: "fake",
        activeMode: "fake",
        fakeRunner: true,
        codexAppServerBridge: false,
        supportedTransports: ["remote-ws"],
        sandboxBackends: ["fake"],
        activeSandboxBackend: "fake",
        commandKinds: ["npm_test"],
        maxWorkspaceBytes: 52428800,
        maxArtifactBytes: 10485760,
        maxJobDurationMs: 120000,
        maxLogBytes: 1048576,
        unsafeCustomCommandsEnabled: false,
        productionOAuthEnabled: false,
        remoteSandboxExecution: false,
        phoneSideExecution: false,
      }),
    /unsupported app-server transport/,
  );
  assert.throws(
    () =>
      assertBuildJobRequest({
        commandKind: "curl_everything",
      }),
    /unsupported sandbox command kind/,
  );
  assert.throws(
    () =>
      assertBuildJobRequest({
        commandKind: "npm_test",
        command: "npm test",
      }),
    /command must be an array/,
  );
});
