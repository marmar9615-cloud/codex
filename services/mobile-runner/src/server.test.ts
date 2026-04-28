import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArtifactListResponse,
  CreateSessionResponse,
  GetJobResponse,
  GetPatchResponse,
  GetSessionResponse,
  RunnerCapabilitiesResponse,
  StartBuildJobResponse,
  StartJobResponse,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";
import { defaultResourceLimits, defaultSandboxCommandKinds } from "./config.js";
import { startMobileRunner } from "./server.js";

test("runner API covers session, snapshot, job, logs, patch, and artifacts endpoints", async () => {
  const { server, url } = await startMobileRunner({
    port: 0,
    now: () => "2026-04-28T20:00:00.000Z",
  });
  try {
    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    assert.equal(created.session.id, "mrs_0001");
    assert.equal(created.session.status, "created");

    const capabilities = await get<RunnerCapabilitiesResponse>(url, "/capabilities");
    assert.equal(capabilities.defaultMode, "fake");
    assert.equal(capabilities.activeMode, "fake");
    assert.equal(capabilities.fakeRunner, true);
    assert.equal(capabilities.activeSandboxBackend, "fake");
    assert.deepEqual(capabilities.sandboxBackends, ["fake"]);
    assert.equal(capabilities.phoneSideExecution, false);
    assert.equal(capabilities.productionOAuthEnabled, false);

    const loaded = await get<GetSessionResponse>(url, `/sessions/${created.session.id}`);
    assert.equal(loaded.session.projectName, "Codex Mobile");

    const uploaded = await post<UploadSnapshotResponse>(url, `/sessions/${created.session.id}/snapshots`, {
      files: [
        { path: "package.json", contentsBase64: Buffer.from("{}").toString("base64") },
        { path: "src/App.tsx", contentsBase64: Buffer.from("export default null;").toString("base64") },
      ],
    });
    assert.equal(uploaded.acceptedFiles, 2);
    assert.equal(uploaded.session.snapshotVersion, 1);

    const started = await post<StartJobResponse>(url, `/sessions/${created.session.id}/jobs`, {
      kind: "test",
      command: ["npm", "test"],
    });
    assert.equal(started.job.id, "mrj_0001");
    assert.equal(started.job.mode, "fake");
    assert.equal(started.logStreamUrl, `/sessions/${created.session.id}/jobs/${started.job.id}/logs`);

    const queued = await get<GetJobResponse>(url, `/sessions/${created.session.id}/jobs/${started.job.id}`);
    assert.equal(queued.job.status, "queued");

    const logsResponse = await fetch(`${url}${started.logStreamUrl}`);
    assert.equal(logsResponse.status, 200);
    const logs = await logsResponse.text();
    assert.match(logs, /event: log/);
    assert.match(logs, /deterministic fake command: npm test/);
    assert.match(logs, /event: patch/);
    assert.match(logs, /event: jobStatus/);

    const completed = await get<GetJobResponse>(url, `/sessions/${created.session.id}/jobs/${started.job.id}`);
    assert.equal(completed.job.status, "succeeded");
    assert.equal(completed.job.mode, "fake");

    const patch = await get<GetPatchResponse>(url, `/sessions/${created.session.id}/patch`);
    assert.equal(patch.patch?.id, "mrp_0001");
    assert.equal(patch.patch?.source, "fake");
    assert.equal(patch.patch?.status, "available");
    assert.equal(patch.patch?.filesChanged, 1);
    assert.equal(patch.patch?.files[0]?.newPath, "src/App.tsx");
    assert.equal(patch.patch?.files[0]?.changeKind, "modified");
    assert.match(patch.patch?.unifiedDiff ?? "", /Codex Mobile Runner/);

    const artifact = await post<{ artifact: unknown }>(url, `/sessions/${created.session.id}/artifacts`, {
      kind: "webPreview",
      title: "Manual preview",
      webPreviewUrl: "https://example.invalid/manual-preview",
    });
    assert.deepEqual(artifact.artifact, {
      id: "mra_0002",
      sessionId: created.session.id,
      kind: "webPreview",
      title: "Manual preview",
      webPreviewUrl: "https://example.invalid/manual-preview",
      createdAt: "2026-04-28T20:00:00.000Z",
    });

    const artifacts = await get<ArtifactListResponse>(url, `/sessions/${created.session.id}/artifacts`);
    assert.equal(artifacts.artifacts.length, 2);
    assert.equal(artifacts.artifacts[0]?.apkUrl, `https://example.invalid/mobile-runner/${created.session.id}/app-debug.apk`);
    assert.match(artifacts.artifacts[0]?.iosInstructions ?? "", /Mac\/Xcode runner/);
  } finally {
    server.close();
  }
});

test("runner API starts a sandbox build job through the fake backend", async () => {
  const { server, url } = await startMobileRunner({
    port: 0,
    now: () => "2026-04-28T20:00:00.000Z",
  });
  try {
    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    await post<UploadSnapshotResponse>(url, `/sessions/${created.session.id}/snapshots`, {
      files: [{ path: "package.json", contentsBase64: Buffer.from("{}").toString("base64") }],
    });
    const started = await post<StartJobResponse>(url, `/sessions/${created.session.id}/jobs`, {
      kind: "test",
      command: ["sandbox", "npm_test"],
    });
    const build = await post<StartBuildJobResponse>(url, `/sessions/${created.session.id}/jobs/${started.job.id}/builds`, {
      commandKind: "npm_test",
      artifactPaths: ["coverage"],
    });
    assert.equal(build.job.sandboxBackend, "fake");
    assert.equal(build.job.sandboxCommandKind, "npm_test");

    const logsResponse = await fetch(`${url}${build.logStreamUrl}`);
    assert.equal(logsResponse.status, 200);
    const logs = await logsResponse.text();
    assert.match(logs, /sandbox\(fake\): would run npm test/);
    assert.match(logs, /event: artifact/);
    assert.match(logs, /event: jobStatus/);

    const completed = await get<GetJobResponse>(url, `/sessions/${created.session.id}/jobs/${started.job.id}`);
    assert.equal(completed.job.status, "succeeded");
    assert.equal(completed.job.sandboxBackend, "fake");
    assert.equal(completed.job.exitCode, 0);

    const artifacts = await get<ArtifactListResponse>(url, `/sessions/${created.session.id}/artifacts`);
    assert.equal(artifacts.artifacts[0]?.metadata?.backend, "fake");
  } finally {
    server.close();
  }
});

test("codex-app-server mode reports missing binary as a structured runner error", async () => {
  const { server, url } = await startMobileRunner({
    port: 0,
    config: {
      defaultMode: "fake",
      runnerMode: "codex-app-server",
      codexAppServerBin: "/definitely/not/codex",
      codexAppServerTransport: "stdio",
      codexAppServerTimeoutMs: 100,
      supportedTransports: ["stdio"],
      sandboxBackend: "fake",
      dockerImage: "node:22-bookworm-slim",
      dockerNetworkMode: "none",
      enableUnsafeCustomCommands: false,
      commandKinds: defaultSandboxCommandKinds,
      resourceLimits: defaultResourceLimits,
    },
  });
  try {
    const capabilities = await get<RunnerCapabilitiesResponse>(url, "/capabilities");
    assert.equal(capabilities.activeMode, "codex-app-server");
    assert.equal(capabilities.codexAppServerBridge, false);

    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    await post<UploadSnapshotResponse>(url, `/sessions/${created.session.id}/snapshots`, {
      files: [{ path: "README.md", contentsBase64: Buffer.from("sample").toString("base64") }],
    });
    const response = await fetch(`${url}/sessions/${created.session.id}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "test", command: ["npm", "test"] }),
    });
    assert.equal(response.status, 503);
    assert.match(JSON.stringify(await response.json()), /codex_app_server_unavailable/);
  } finally {
    server.close();
  }
});

test("local-docker sandbox mode reports unavailable Docker before streaming", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  const { server, url } = await startMobileRunner({
    port: 0,
    config: {
      defaultMode: "fake",
      runnerMode: "fake",
      codexAppServerBin: "codex",
      codexAppServerTransport: "stdio",
      codexAppServerTimeoutMs: 100,
      supportedTransports: ["stdio"],
      sandboxBackend: "local-docker",
      dockerImage: "node:22-bookworm-slim",
      dockerNetworkMode: "none",
      enableUnsafeCustomCommands: false,
      commandKinds: defaultSandboxCommandKinds,
      resourceLimits: defaultResourceLimits,
    },
  });
  try {
    const capabilities = await get<RunnerCapabilitiesResponse>(url, "/capabilities");
    assert.equal(capabilities.activeSandboxBackend, "local-docker");
    assert.equal(capabilities.remoteSandboxExecution, false);

    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    const started = await post<StartJobResponse>(url, `/sessions/${created.session.id}/jobs`, {
      kind: "test",
      command: ["sandbox", "npm_test"],
    });
    const response = await fetch(`${url}/sessions/${created.session.id}/jobs/${started.job.id}/builds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandKind: "npm_test" }),
    });
    assert.equal(response.status, 503);
    assert.match(JSON.stringify(await response.json()), /sandbox_backend_unavailable/);
  } finally {
    process.env.PATH = originalPath;
    server.close();
  }
});

test("runner rejects sandbox build requests that violate command policy", async () => {
  const { server, url } = await startMobileRunner({ port: 0 });
  try {
    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    const started = await post<StartJobResponse>(url, `/sessions/${created.session.id}/jobs`, {
      kind: "test",
      command: ["sandbox", "npm_test"],
    });
    const response = await fetch(`${url}/sessions/${created.session.id}/jobs/${started.job.id}/builds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandKind: "npm_test", workingDirectory: "../../outside" }),
    });
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /command_rejected_by_policy/);
  } finally {
    server.close();
  }
});

test("runner rejects snapshots that escape the workspace", async () => {
  const { server, url } = await startMobileRunner({ port: 0 });
  try {
    const created = await post<CreateSessionResponse>(url, "/sessions", {
      projectId: "project-1",
      projectName: "Codex Mobile",
      sourceKind: "appWorkspace",
    });
    const response = await fetch(`${url}/sessions/${created.session.id}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "../../outside.txt", contentsBase64: Buffer.from("nope").toString("base64") }],
      }),
    });
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /path escapes workspace/);
  } finally {
    server.close();
  }
});

async function get<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return (await response.json()) as T;
}
