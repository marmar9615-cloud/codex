import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultResourceLimits } from "../config.js";
import { FakeSandboxBackend } from "./FakeSandboxBackend.js";
import { LocalDockerSandboxBackend } from "./LocalDockerSandboxBackend.js";

test("fake sandbox backend streams logs and returns a structured result", async () => {
  const logs: string[] = [];
  const backend = new FakeSandboxBackend();
  const result = await backend.runCommand(
    {
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      workspaceRoot: "/tmp/workspace",
      backend: "fake",
      commandKind: "npm_test",
      command: ["npm", "test"],
      workingDirectory: ".",
      artifactPaths: ["coverage"],
      timeoutMs: defaultResourceLimits.maxJobDurationMs,
      maxWorkspaceBytes: defaultResourceLimits.maxWorkspaceBytes,
      maxLogBytes: defaultResourceLimits.maxLogBytes,
      maxArtifactBytes: defaultResourceLimits.maxArtifactBytes,
      networkMode: "none",
      createdAt: "2026-04-28T20:00:00.000Z",
    },
    {
      now: () => "2026-04-28T20:00:00.000Z",
      nextSequence: makeCounter(),
      nextArtifactId: () => "mra_0001",
      onLog: (event) => logs.push(event.message),
    },
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.exitCode, 0);
  assert.equal(result.artifacts.length, 1);
  assert.ok(logs.some((line) => line.includes("sandbox(fake)")));
});

test("fake sandbox backend supports cancellation", async () => {
  const backend = new FakeSandboxBackend();
  await backend.cancelJob("mrj_0001");
  const result = await backend.runCommand(
    {
      sessionId: "mrs_0001",
      jobId: "mrj_0001",
      workspaceRoot: "/tmp/workspace",
      backend: "fake",
      commandKind: "npm_test",
      command: ["npm", "test"],
      workingDirectory: ".",
      artifactPaths: ["coverage"],
      timeoutMs: defaultResourceLimits.maxJobDurationMs,
      maxWorkspaceBytes: defaultResourceLimits.maxWorkspaceBytes,
      maxLogBytes: defaultResourceLimits.maxLogBytes,
      maxArtifactBytes: defaultResourceLimits.maxArtifactBytes,
      networkMode: "none",
      createdAt: "2026-04-28T20:00:00.000Z",
    },
    {
      now: () => "2026-04-28T20:00:00.000Z",
      nextSequence: makeCounter(),
      nextArtifactId: () => "mra_0001",
      onLog: () => {},
    },
  );
  assert.equal(result.status, "cancelled");
});

test("local Docker sandbox reports missing Docker as a structured error", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "codex-mobile-docker-missing-"));
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const backend = new LocalDockerSandboxBackend({ image: "node:22-bookworm-slim" });
    await assert.rejects(
      () =>
        backend.runCommand(
          {
            sessionId: "mrs_0001",
            jobId: "mrj_0001",
            workspaceRoot: workspace,
            backend: "local-docker",
            commandKind: "npm_test",
            command: ["npm", "test"],
            workingDirectory: ".",
            artifactPaths: ["coverage"],
            timeoutMs: 100,
            maxWorkspaceBytes: defaultResourceLimits.maxWorkspaceBytes,
            maxLogBytes: defaultResourceLimits.maxLogBytes,
            maxArtifactBytes: defaultResourceLimits.maxArtifactBytes,
            networkMode: "none",
            createdAt: "2026-04-28T20:00:00.000Z",
          },
          {
            now: () => "2026-04-28T20:00:00.000Z",
            nextSequence: makeCounter(),
            nextArtifactId: () => "mra_0001",
            onLog: () => {},
          },
        ),
      /Docker CLI is not available/,
    );
  } finally {
    process.env.PATH = originalPath;
    await rm(workspace, { recursive: true, force: true });
  }
});

test("live Docker sandbox smoke is opt-in", async (context) => {
  if (process.env.ENABLE_LIVE_DOCKER_SANDBOX_TESTS !== "1") {
    context.skip("ENABLE_LIVE_DOCKER_SANDBOX_TESTS is not 1");
  }
});

function makeCounter(): () => number {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
}
