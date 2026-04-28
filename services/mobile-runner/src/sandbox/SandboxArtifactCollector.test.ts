import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectSandboxArtifacts } from "./SandboxArtifactCollector.js";

test("artifact collector accepts allowlisted artifacts without exposing host paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "codex-mobile-artifacts-"));
  try {
    await mkdir(path.join(workspace, "coverage"), { recursive: true });
    await writeFile(path.join(workspace, "coverage", "summary.txt"), "ok");
    const artifacts = await collectSandboxArtifacts({
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      workspaceRoot: workspace,
      artifactPaths: ["coverage"],
      maxArtifactBytes: 1024,
      now: () => "2026-04-28T20:00:00.000Z",
      nextArtifactId: () => "mra_0001",
    });
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]?.metadata?.sandboxPath, "coverage");
    assert.equal(JSON.stringify(artifacts), JSON.stringify(artifacts).replaceAll(workspace, "[workspace]"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("artifact collector rejects traversal paths and oversized artifacts", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "codex-mobile-artifacts-"));
  try {
    await mkdir(path.join(workspace, "dist"), { recursive: true });
    await writeFile(path.join(workspace, "dist", "bundle.js"), "too big");
    await assert.rejects(
      () =>
        collectSandboxArtifacts({
          sessionId: "mrs_0001",
          jobId: "mrj_0001",
          workspaceRoot: workspace,
          artifactPaths: ["../outside"],
          maxArtifactBytes: 1024,
          now: () => "2026-04-28T20:00:00.000Z",
          nextArtifactId: () => "mra_0001",
        }),
      /path escapes workspace/,
    );
    await assert.rejects(
      () =>
        collectSandboxArtifacts({
          sessionId: "mrs_0001",
          jobId: "mrj_0001",
          workspaceRoot: workspace,
          artifactPaths: ["dist"],
          maxArtifactBytes: 2,
          now: () => "2026-04-28T20:00:00.000Z",
          nextArtifactId: () => "mra_0001",
        }),
      /exceeds max size/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
