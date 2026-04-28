import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBuildArtifact,
  assertBuildJobRequest,
  assertBuildJobResult,
  assertCloudRunnerCapabilities,
  assertCommandPolicyViolation,
  assertCreateSessionRequest,
  assertGitAuditEvent,
  assertGitAuthState,
  assertGitCapabilities,
  assertGitCommitRequest,
  assertGitCommitResult,
  assertGitImportRequest,
  assertGitImportResult,
  assertGitInstallState,
  assertGitProviderError,
  assertGitPushRequest,
  assertGitPushResult,
  assertGitRepositorySummary,
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
  assertPullRequestPlan,
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
      gitProvider: "fake",
      gitProviderAvailable: true,
      gitHubAppConfigured: false,
      supportsRepoImport: true,
      supportsCommit: true,
      supportsPush: true,
      supportsPullRequestPlan: true,
      secretsInMobile: false,
      cloudRunnerProvider: "fake",
      cloudRunnerAvailable: true,
      cloudLimits: {
        maxJobsPerSession: 20,
        maxConcurrentJobs: 2,
        maxDurationMs: 120000,
        maxWorkspaceBytes: 52428800,
        maxArtifactBytes: 10485760,
      },
      runnerAuthMode: "dev",
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
      gitProvider: "fake",
      gitProviderAvailable: true,
      gitHubAppConfigured: false,
      supportsRepoImport: true,
      supportsCommit: true,
      supportsPush: true,
      supportsPullRequestPlan: true,
      secretsInMobile: false,
      cloudRunnerProvider: "fake",
      cloudRunnerAvailable: true,
      cloudLimits: {
        maxJobsPerSession: 20,
        maxConcurrentJobs: 2,
        maxDurationMs: 120000,
        maxWorkspaceBytes: 52428800,
        maxArtifactBytes: 10485760,
      },
      runnerAuthMode: "dev",
      productionOAuthEnabled: false,
      remoteSandboxExecution: false,
      phoneSideExecution: false,
    },
  );
});

test("validates git provider payloads", () => {
  const repo = assertGitRepositorySummary({
    id: "repo_1",
    owner: "openai",
    name: "codex-mobile-sample",
    fullName: "openai/codex-mobile-sample",
    defaultBranch: "main",
    private: false,
    htmlUrl: "https://github.com/openai/codex-mobile-sample",
  });
  assert.equal(repo.fullName, "openai/codex-mobile-sample");
  assert.equal(
    assertGitCapabilities({
      provider: "fake",
      available: true,
      gitHubAppConfigured: false,
      supportsRepoImport: true,
      supportsCommit: true,
      supportsPush: true,
      supportsPullRequestPlan: true,
      secretsInMobile: false,
    }).secretsInMobile,
    false,
  );
  assert.equal(assertGitImportRequest({ owner: "openai", repo: "codex-mobile-sample", branch: "main" }).branch, "main");
  assert.equal(
    assertGitImportResult({
      sessionId: "mrs_0001",
      repository: repo,
      branch: { name: "main", sha: "abc123", protected: true },
      workspaceSource: { kind: "github", repository: repo, branch: "main", commitSha: "abc123" },
      importedFiles: 3,
    }).workspaceSource.kind,
    "github",
  );
  assert.equal(assertGitCommitRequest({ message: "Update app", branchName: "codex/mobile-update" }).message, "Update app");
  assert.equal(
    assertGitCommitResult({
      sessionId: "mrs_0001",
      commitSha: "def456",
      branchName: "codex/mobile-update",
      message: "Update app",
      changedFiles: [{ path: "src/App.tsx", status: "modified" }],
    }).changedFiles[0]?.status,
    "modified",
  );
  assert.equal(assertGitPushRequest({ branchName: "codex/mobile-update", force: false }).force, false);
  assert.equal(
    assertGitPushResult({
      sessionId: "mrs_0001",
      branchName: "codex/mobile-update",
      remoteName: "origin",
      pushed: true,
      commitSha: "def456",
    }).pushed,
    true,
  );
  assert.equal(
    assertPullRequestPlan({
      sessionId: "mrs_0001",
      title: "Update app",
      body: "Review the mobile patch.",
      headBranch: "codex/mobile-update",
      baseBranch: "main",
      provider: "fake",
      ready: true,
    }).ready,
    true,
  );
  assert.equal(assertGitProviderError({ error: "missing env", code: "git_provider_unavailable", provider: "github-app" }).provider, "github-app");
  assert.equal(assertGitAuthState({ provider: "github-app", configured: false, authenticated: false, secretsInMobile: false }).secretsInMobile, false);
  assert.equal(assertGitInstallState({ provider: "fake", installed: true, ownerAllowlist: ["openai"] }).installed, true);
  assert.equal(
    assertGitAuditEvent({
      id: "audit_1",
      type: "commit.created",
      sessionId: "mrs_0001",
      actorId: "dev-user",
      message: "Commit created",
      createdAt: timestamp,
      metadata: { branch: "codex/mobile-update" },
    }).type,
    "commit.created",
  );
});

test("validates cloud runner capabilities", () => {
  assert.equal(
    assertCloudRunnerCapabilities({
      provider: "fake",
      available: true,
      limits: {
        maxJobsPerSession: 20,
        maxConcurrentJobs: 2,
        maxDurationMs: 120000,
        maxWorkspaceBytes: 52428800,
        maxArtifactBytes: 10485760,
      },
    }).provider,
    "fake",
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
        gitProvider: "fake",
        gitProviderAvailable: true,
        gitHubAppConfigured: false,
        supportsRepoImport: true,
        supportsCommit: true,
        supportsPush: true,
        supportsPullRequestPlan: true,
        secretsInMobile: false,
        cloudRunnerProvider: "fake",
        cloudRunnerAvailable: true,
        cloudLimits: {
          maxJobsPerSession: 20,
          maxConcurrentJobs: 2,
          maxDurationMs: 120000,
          maxWorkspaceBytes: 52428800,
          maxArtifactBytes: 10485760,
        },
        runnerAuthMode: "dev",
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
