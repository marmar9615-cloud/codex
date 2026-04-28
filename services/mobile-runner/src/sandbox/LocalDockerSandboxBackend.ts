import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { sanitizeForRunnerLog } from "../codex/jsonRpc.js";
import { collectSandboxArtifacts } from "./SandboxArtifactCollector.js";
import { buildSandboxLog, sandboxResultFromArtifacts, SandboxBackendError } from "./SandboxBackend.js";
import type { SandboxBackend, SandboxCommandSpec, SandboxRunCallbacks, SandboxRunResult } from "./SandboxBackend.js";
import { assertWorkspaceWithinLimit } from "./SandboxWorkspace.js";

export type LocalDockerSandboxBackendOptions = {
  image: string;
};

export class LocalDockerSandboxBackend implements SandboxBackend {
  readonly name = "local-docker" as const;
  private children = new Map<string, ChildProcess>();

  constructor(private readonly options: LocalDockerSandboxBackendOptions) {}

  async runCommand(spec: SandboxCommandSpec, callbacks: SandboxRunCallbacks): Promise<SandboxRunResult> {
    const started = Date.now();
    await assertDockerAvailable();
    await assertWorkspaceWithinLimit(spec.workspaceRoot, spec.maxWorkspaceBytes);

    callbacks.onLog(
      buildSandboxLog(spec, callbacks, `sandbox(local-docker): starting ${spec.commandKind} in ${spec.workingDirectory}`, {
        stream: "system",
        level: "info",
        category: "system",
      }),
    );

    const args = dockerRunArgs(spec, this.options.image);
    const child = spawn("docker", args, {
      cwd: spec.workspaceRoot,
      env: minimalDockerEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.children.set(spec.jobId, child);

    let stdoutBytes = 0;
    let stderrText = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, spec.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= spec.maxLogBytes) {
        emitChunk(spec, callbacks, chunk, "stdout");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrText += chunk.toString("utf8");
      stdoutBytes += chunk.length;
      if (stdoutBytes <= spec.maxLogBytes) {
        emitChunk(spec, callbacks, chunk, "stderr");
      }
    });

    const exitCode = await waitForExit(child);
    clearTimeout(timer);
    this.children.delete(spec.jobId);

    const durationMs = Date.now() - started;
    if (timedOut) {
      throw new SandboxBackendError(`Sandbox command timed out after ${spec.timeoutMs}ms.`, "command_timeout", 408);
    }
    if (exitCode !== 0) {
      throw classifyDockerFailure(exitCode, stderrText);
    }

    const artifacts = await collectSandboxArtifacts({
      sessionId: spec.sessionId,
      jobId: spec.jobId,
      workspaceRoot: spec.workspaceRoot,
      artifactPaths: spec.artifactPaths,
      maxArtifactBytes: spec.maxArtifactBytes,
      now: callbacks.now,
      nextArtifactId: callbacks.nextArtifactId,
    });
    callbacks.onLog(
      buildSandboxLog(spec, callbacks, `sandbox(local-docker): completed with ${artifacts.length} artifact(s)`, {
        stream: "system",
        level: "info",
        category: "completion",
      }),
    );
    return sandboxResultFromArtifacts(spec, "succeeded", 0, durationMs, artifacts);
  }

  async cancelJob(jobId: string): Promise<void> {
    this.children.get(jobId)?.kill("SIGKILL");
  }

  async cleanup(jobId: string): Promise<void> {
    this.children.delete(jobId);
  }
}

function dockerRunArgs(spec: SandboxCommandSpec, image: string): string[] {
  const containerWorkdir = spec.workingDirectory === "." ? "/workspace" : `/workspace/${spec.workingDirectory}`;
  return [
    "run",
    "--rm",
    "--pull=missing",
    "--network",
    spec.networkMode,
    "--cpus",
    "2",
    "--memory",
    "1g",
    "--pids-limit",
    "256",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "-v",
    `${path.resolve(spec.workspaceRoot)}:/workspace:rw`,
    "-w",
    containerWorkdir,
    image,
    ...spec.command,
  ];
}

async function assertDockerAvailable(): Promise<void> {
  try {
    const result = await spawnCapture("docker", ["version", "--format", "{{.Server.Version}}"], 10_000);
    if (result.code !== 0) {
      throw classifyDockerFailure(result.code, result.stderr);
    }
  } catch (error) {
    if (error instanceof SandboxBackendError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Docker CLI failed";
    if (/ENOENT/.test(message)) {
      throw new SandboxBackendError("Docker CLI is not available on PATH.", "docker_missing", 503);
    }
    throw new SandboxBackendError(`Docker daemon is unavailable: ${message}`, "docker_daemon_unavailable", 503);
  }
}

function classifyDockerFailure(exitCode: number, stderr: string): SandboxBackendError {
  const sanitized = sanitizeForRunnerLog(stderr).trim();
  if (/Cannot connect to the Docker daemon|docker daemon/i.test(sanitized)) {
    return new SandboxBackendError(`Docker daemon is unavailable: ${sanitized}`, "docker_daemon_unavailable", 503);
  }
  if (/pull access denied|not found|manifest unknown|repository does not exist/i.test(sanitized)) {
    return new SandboxBackendError(`Docker image pull failed: ${sanitized}`, "image_pull_failure", 502);
  }
  return new SandboxBackendError(`Sandbox command exited with code ${exitCode}: ${sanitized}`, "nonzero_exit_code", 422);
}

function emitChunk(
  spec: Pick<SandboxCommandSpec, "sessionId" | "jobId" | "backend">,
  callbacks: SandboxRunCallbacks,
  chunk: Buffer,
  stream: "stdout" | "stderr",
): void {
  for (const rawLine of chunk.toString("utf8").split(/\r?\n/)) {
    if (rawLine.length === 0) {
      continue;
    }
    callbacks.onLog(
      buildSandboxLog(spec, callbacks, sanitizeForRunnerLog(rawLine), {
        stream,
        level: stream === "stderr" ? "warn" : "info",
        category: "tool",
      }),
    );
  }
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function spawnCapture(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: minimalDockerEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new SandboxBackendError(`Docker command timed out after ${timeoutMs}ms.`, "docker_daemon_unavailable", 503));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function minimalDockerEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
  };
}
