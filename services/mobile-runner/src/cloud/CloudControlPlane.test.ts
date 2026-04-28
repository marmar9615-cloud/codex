import assert from "node:assert/strict";
import test from "node:test";
import { assertBuildArtifact } from "@codex/mobile-protocol";
import { InMemoryArtifactStore } from "./ArtifactStore.js";
import { InMemoryAuditLogStore } from "./AuditLogStore.js";
import { CleanupPolicy } from "./CleanupPolicy.js";
import { FakeCloudRunnerProvider } from "./FakeCloudRunnerProvider.js";
import { QuotaPolicy } from "./QuotaPolicy.js";
import { CloudJobDispatcher } from "./CloudJobDispatcher.js";

const limits = {
  maxJobsPerSession: 1,
  maxConcurrentJobs: 1,
  maxDurationMs: 100,
  maxWorkspaceBytes: 1000,
  maxArtifactBytes: 100,
};

test("quota policy accepts safe usage and rejects excessive jobs and artifacts", () => {
  const policy = new QuotaPolicy(limits);
  policy.assertAllowed({
    jobsForSession: 0,
    concurrentJobs: 0,
    requestedDurationMs: 50,
    workspaceBytes: 10,
    artifactBytes: 10,
  });
  assert.throws(
    () =>
      policy.assertAllowed({
        jobsForSession: 1,
        concurrentJobs: 0,
        requestedDurationMs: 50,
        workspaceBytes: 10,
        artifactBytes: 10,
      }),
    /Session job quota/,
  );
  assert.throws(
    () =>
      policy.assertAllowed({
        jobsForSession: 0,
        concurrentJobs: 0,
        requestedDurationMs: 50,
        workspaceBytes: 10,
        artifactBytes: 101,
      }),
    /Artifact size/,
  );
});

test("artifact store rejects traversal and oversized artifacts", () => {
  const store = new InMemoryArtifactStore();
  const artifact = assertBuildArtifact({
    id: "mra_0001",
    sessionId: "mrs_0001",
    kind: "testReport",
    title: "Coverage",
    metadata: { bytes: "90", sandboxPath: "coverage/index.html" },
    createdAt: "2026-04-28T20:00:00.000Z",
  });
  assert.equal(store.put(artifact, 100).id, "mra_0001");
  assert.equal(store.list("mrs_0001").length, 1);
  assert.throws(
    () =>
      store.put(
        assertBuildArtifact({
          ...artifact,
          id: "mra_0002",
          metadata: { bytes: "101", sandboxPath: "coverage/index.html" },
        }),
        100,
      ),
    /max size/,
  );
  assert.throws(
    () =>
      store.put(
        assertBuildArtifact({
          ...artifact,
          id: "mra_0003",
          metadata: { bytes: "1", sandboxPath: "../secret.txt" },
        }),
        100,
      ),
    /workspace-relative/,
  );
});

test("audit log, cleanup policy, and fake cloud dispatch record durable-ish control-plane state", async () => {
  const audit = new InMemoryAuditLogStore();
  const event = audit.record(
    {
      type: "job.started",
      sessionId: "mrs_0001",
      actorId: "dev-local-user",
      message: "Started cloud runner job",
    },
    () => "2026-04-28T20:00:00.000Z",
  );
  assert.equal(event.id, "audit_0001");
  assert.equal(audit.list("mrs_0001").length, 1);

  const cleanup = new CleanupPolicy({ workspaceTtlMs: 1000, artifactTtlMs: 2000, jobTtlMs: 3000 });
  assert.deepEqual(cleanup.expiredWorkspaces([{ id: "workspace-1", updatedAtMs: 0 }], 1000), [
    { id: "workspace-1", updatedAtMs: 0 },
  ]);
  assert.deepEqual(cleanup.expiredArtifacts([{ id: "artifact-1", updatedAtMs: 1500 }], 3000), []);

  const provider = new FakeCloudRunnerProvider(limits);
  const dispatcher = new CloudJobDispatcher(provider, { ...limits, maxJobsPerSession: 2, maxConcurrentJobs: 2 });
  const dispatched = await dispatcher.dispatch("mrs_0001", () => "2026-04-28T20:00:00.000Z");
  assert.equal(dispatched.status, "queued");
  assert.equal(provider.capabilities().provider, "fake");
});
