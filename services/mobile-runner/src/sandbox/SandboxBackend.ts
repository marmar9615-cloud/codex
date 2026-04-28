import type {
  BuildArtifact,
  BuildJobRequest,
  BuildJobResult,
  RunnerLogEvent,
  SandboxBackend as SandboxBackendName,
  SandboxCommandKind,
} from "@codex/mobile-protocol";

export type SandboxCommandSpec = {
  sessionId: string;
  jobId: string;
  workspaceRoot: string;
  backend: SandboxBackendName;
  commandKind: SandboxCommandKind;
  command: string[];
  workingDirectory: string;
  artifactPaths: string[];
  timeoutMs: number;
  maxWorkspaceBytes: number;
  maxLogBytes: number;
  maxArtifactBytes: number;
  networkMode: "none" | "bridge";
  createdAt: string;
};

export type SandboxRunCallbacks = {
  now: () => string;
  nextSequence: () => number;
  nextArtifactId: () => string;
  onLog: (event: RunnerLogEvent) => void;
};

export type SandboxRunResult = BuildJobResult & {
  logsTruncated?: boolean;
};

export interface SandboxBackend {
  readonly name: SandboxBackendName;
  prepareWorkspace?(request: BuildJobRequest): Promise<void>;
  runCommand(spec: SandboxCommandSpec, callbacks: SandboxRunCallbacks): Promise<SandboxRunResult>;
  cancelJob(jobId: string): Promise<void>;
  cleanup(jobId: string): Promise<void>;
}

export class SandboxBackendError extends Error {
  constructor(
    message: string,
    readonly code:
      | "docker_missing"
      | "docker_daemon_unavailable"
      | "image_pull_failure"
      | "command_timeout"
      | "nonzero_exit_code"
      | "artifact_too_large"
      | "workspace_rejected"
      | "command_rejected_by_policy"
      | "sandbox_backend_unavailable",
    readonly status = 400,
  ) {
    super(message);
    this.name = "SandboxBackendError";
  }
}

export function buildSandboxLog(
  spec: Pick<SandboxCommandSpec, "sessionId" | "jobId" | "backend">,
  callbacks: SandboxRunCallbacks,
  message: string,
  options: Partial<Pick<RunnerLogEvent, "stream" | "level" | "category">> = {},
): RunnerLogEvent {
  return {
    type: "runner.log",
    sessionId: spec.sessionId,
    jobId: spec.jobId,
    sequence: callbacks.nextSequence(),
    stream: options.stream ?? "system",
    level: options.level ?? "info",
    category: options.category ?? "system",
    message,
    createdAt: callbacks.now(),
  };
}

export function sandboxResultFromArtifacts(
  spec: SandboxCommandSpec,
  status: "succeeded" | "failed" | "cancelled",
  exitCode: number | undefined,
  durationMs: number,
  artifacts: BuildArtifact[],
): SandboxRunResult {
  return {
    sessionId: spec.sessionId,
    jobId: spec.jobId,
    backend: spec.backend,
    commandKind: spec.commandKind,
    status,
    exitCode,
    durationMs,
    artifacts,
  };
}
