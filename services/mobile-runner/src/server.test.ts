import assert from "node:assert/strict";
import test from "node:test";
import { startMobileRunner } from "./server.js";
import type { CreateSessionResponse, StartJobResponse } from "@codex/mobile-protocol";

test("runner API creates session, streams logs, stores artifacts, and accepts patches", async () => {
  const { server, url } = await startMobileRunner({ port: 0 });
  try {
    const sessionResponse = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        projectName: "Codex Mobile",
        sourceKind: "appWorkspace",
      }),
    });
    assert.equal(sessionResponse.status, 201);
    const created = (await sessionResponse.json()) as CreateSessionResponse;

    const snapshotResponse = await fetch(`${url}/v1/sessions/${created.session.id}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "README.md", contentsBase64: Buffer.from("hello").toString("base64") }],
      }),
    });
    assert.equal(snapshotResponse.status, 200);

    const jobResponse = await fetch(`${url}/v1/sessions/${created.session.id}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "test", command: ["npm", "test"] }),
    });
    assert.equal(jobResponse.status, 202);
    const started = (await jobResponse.json()) as StartJobResponse;

    const logsResponse = await fetch(`${url}${started.logStreamUrl}`);
    assert.equal(logsResponse.status, 200);
    const logs = await logsResponse.text();
    assert.match(logs, /event: log/);
    assert.match(logs, /fake mobile-runner executing: npm test/);
    assert.match(logs, /event: jobStatus/);

    const patchResponse = await fetch(`${url}/v1/sessions/${created.session.id}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unifiedDiff: "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n",
      }),
    });
    assert.equal(patchResponse.status, 202);
    assert.equal((await patchResponse.json()).filesChanged, 1);

    const artifactsResponse = await fetch(`${url}/v1/sessions/${created.session.id}/artifacts`);
    assert.equal(artifactsResponse.status, 200);
    const artifacts = await artifactsResponse.json();
    assert.equal(artifacts.artifacts.length, 1);
  } finally {
    server.close();
  }
});
