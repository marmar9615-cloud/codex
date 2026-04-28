import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArtifactListResponse,
  CreateSessionResponse,
  GetJobResponse,
  GetPatchResponse,
  GetSessionResponse,
  StartJobResponse,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";
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

    const patch = await get<GetPatchResponse>(url, `/sessions/${created.session.id}/patch`);
    assert.equal(patch.patch?.id, "mrp_0001");
    assert.equal(patch.patch?.files[0]?.newPath, "src/App.tsx");
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
