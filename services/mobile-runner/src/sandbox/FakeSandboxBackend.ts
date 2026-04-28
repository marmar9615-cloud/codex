import type { BuildArtifact } from "@codex/mobile-protocol";
import { buildSandboxLog, sandboxResultFromArtifacts } from "./SandboxBackend.js";
import type { SandboxBackend, SandboxCommandSpec, SandboxRunCallbacks, SandboxRunResult } from "./SandboxBackend.js";

export class FakeSandboxBackend implements SandboxBackend {
  readonly name = "fake" as const;
  private cancelled = new Set<string>();

  async runCommand(spec: SandboxCommandSpec, callbacks: SandboxRunCallbacks): Promise<SandboxRunResult> {
    const started = Date.now();
    const emit = (message: string, stream: "system" | "stdout" = "system") => {
      callbacks.onLog(
        buildSandboxLog(spec, callbacks, message, {
          stream,
          level: "info",
          category: stream === "system" ? "system" : "tool",
        }),
      );
    };

    emit(`sandbox(fake): prepared isolated workspace for ${spec.commandKind}`);
    emit(`sandbox(fake): would run ${spec.command.join(" ")}`, "stdout");
    emit(`sandbox(fake): network=${spec.networkMode}, artifacts=${spec.artifactPaths.join(", ")}`);
    await delay(5);

    if (this.cancelled.has(spec.jobId)) {
      return sandboxResultFromArtifacts(spec, "cancelled", undefined, Date.now() - started, []);
    }

    const artifacts: BuildArtifact[] = [
      {
        id: callbacks.nextArtifactId(),
        sessionId: spec.sessionId,
        jobId: spec.jobId,
        kind: "testReport",
        title: `Fake sandbox result for ${spec.commandKind}`,
        metadata: {
          backend: "fake",
          commandKind: spec.commandKind,
          note: "Deterministic fake sandbox artifact. Use SANDBOX_BACKEND=local-docker for real local execution.",
        },
        createdAt: callbacks.now(),
      },
    ];
    emit("sandbox(fake): completed successfully", "stdout");
    return sandboxResultFromArtifacts(spec, "succeeded", 0, Date.now() - started, artifacts);
  }

  async cancelJob(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
  }

  async cleanup(jobId: string): Promise<void> {
    this.cancelled.delete(jobId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
