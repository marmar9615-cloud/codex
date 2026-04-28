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

test("runner client validates Git provider lifecycle responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/git/capabilities")) {
        return jsonResponse({
          provider: "fake",
          available: true,
          gitHubAppConfigured: false,
          supportsRepoImport: true,
          supportsCommit: true,
          supportsPush: true,
          supportsPullRequestPlan: true,
          secretsInMobile: false,
        });
      }
      if (url.endsWith("/git/repositories")) {
        return jsonResponse({
          repositories: [
            {
              id: "fake-repo",
              owner: "openai",
              name: "codex-mobile-sample",
              fullName: "openai/codex-mobile-sample",
              defaultBranch: "main",
              private: false,
            },
          ],
        });
      }
      if (url.endsWith("/branches")) {
        return jsonResponse({ branches: [{ name: "main", sha: "abc", protected: true }] });
      }
      if (url.endsWith("/import/github")) {
        return jsonResponse(
          {
            sessionId: "mrs_0001",
            repository: {
              id: "fake-repo",
              owner: "openai",
              name: "codex-mobile-sample",
              fullName: "openai/codex-mobile-sample",
              defaultBranch: "main",
              private: false,
            },
            branch: { name: "main", sha: "abc", protected: true },
            workspaceSource: { kind: "github", branch: "main" },
            importedFiles: 3,
          },
          201,
        );
      }
      if (url.endsWith("/git/branch")) {
        return jsonResponse({ branch: { name: "codex/mobile-test", sha: "abc", protected: false } }, 201);
      }
      if (url.endsWith("/git/status")) {
        return jsonResponse({ changes: [{ path: "src/App.tsx", status: "modified" }] });
      }
      if (url.endsWith("/git/commit")) {
        return jsonResponse(
          {
            sessionId: "mrs_0001",
            commitSha: "fakecommit0001",
            branchName: "codex/mobile-test",
            message: "Apply patch",
            changedFiles: [{ path: "src/App.tsx", status: "modified" }],
          },
          201,
        );
      }
      if (url.endsWith("/git/push")) {
        return jsonResponse(
          {
            sessionId: "mrs_0001",
            branchName: "codex/mobile-test",
            remoteName: "origin",
            pushed: true,
          },
          201,
        );
      }
      if (url.endsWith("/git/pr-plan")) {
        return jsonResponse({
          sessionId: "mrs_0001",
          title: "PR",
          body: "Plan",
          headBranch: "codex/mobile-test",
          baseBranch: "main",
          provider: "fake",
          ready: true,
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };
    const client = new MobileRunnerClient("http://runner.invalid");
    assert.equal((await client.getGitCapabilities()).provider, "fake");
    assert.equal((await client.listGitRepositories())[0]?.fullName, "openai/codex-mobile-sample");
    assert.equal((await client.listGitBranches("openai", "codex-mobile-sample"))[0]?.name, "main");
    assert.equal((await client.importGitHubRepository("mrs_0001", { owner: "openai", repo: "codex-mobile-sample" })).importedFiles, 3);
    assert.equal((await client.createGitBranch("mrs_0001", "codex/mobile-test")).name, "codex/mobile-test");
    assert.equal((await client.getGitStatus("mrs_0001"))[0]?.path, "src/App.tsx");
    assert.equal((await client.commitGitChanges("mrs_0001", { message: "Apply patch" })).commitSha, "fakecommit0001");
    assert.equal((await client.pushGitBranch("mrs_0001", { branchName: "codex/mobile-test" })).pushed, true);
    assert.equal((await client.createPullRequestPlan("mrs_0001")).ready, true);
    assert.ok(calls.some((call) => call.includes("/git/repositories/openai/codex-mobile-sample/branches")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

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
