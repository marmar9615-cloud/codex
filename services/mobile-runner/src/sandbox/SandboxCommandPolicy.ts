import { normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { BuildJobRequest, ResourceLimits, SandboxCommandKind } from "@codex/mobile-protocol";
import { SandboxBackendError } from "./SandboxBackend.js";

export type CommandPolicyOptions = {
  unsafeCustomCommandsEnabled: boolean;
  dockerNetworkMode: "none" | "bridge";
  resourceLimits: ResourceLimits;
};

export type ResolvedSandboxCommand = {
  commandKind: SandboxCommandKind;
  command: string[];
  workingDirectory: string;
  artifactPaths: string[];
  requiresNetwork: boolean;
  networkMode: "none" | "bridge";
  timeoutMs: number;
  maxLogBytes: number;
  maxArtifactBytes: number;
};

export const allowedArtifactRoots = ["dist", "build", "coverage", "test-results", "mobile-build-output"] as const;

const shellBinaries = new Set(["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh"]);

const commandMap: Record<Exclude<SandboxCommandKind, "custom">, { command: string[]; requiresNetwork: boolean }> = {
  npm_install: { command: ["npm", "install"], requiresNetwork: true },
  npm_test: { command: ["npm", "test"], requiresNetwork: false },
  npm_build: { command: ["npm", "run", "build"], requiresNetwork: false },
  pnpm_install: { command: ["pnpm", "install"], requiresNetwork: true },
  pnpm_test: { command: ["pnpm", "test"], requiresNetwork: false },
  pnpm_build: { command: ["pnpm", "build"], requiresNetwork: false },
  yarn_install: { command: ["yarn", "install"], requiresNetwork: true },
  yarn_test: { command: ["yarn", "test"], requiresNetwork: false },
  yarn_build: { command: ["yarn", "build"], requiresNetwork: false },
  expo_export_or_check: { command: ["npx", "expo", "config", "--type", "public", "--json"], requiresNetwork: false },
};

export function resolveSandboxCommand(request: BuildJobRequest, options: CommandPolicyOptions): ResolvedSandboxCommand {
  const workingDirectory = normalizePolicyPath(request.workingDirectory ?? ".", "workingDirectory");
  const artifactPaths = (request.artifactPaths && request.artifactPaths.length > 0 ? request.artifactPaths : [...allowedArtifactRoots]).map((artifactPath) =>
    normalizeArtifactPath(artifactPath),
  );

  if (request.commandKind === "custom") {
    if (!options.unsafeCustomCommandsEnabled) {
      throw new SandboxBackendError("Custom sandbox commands are disabled by policy.", "command_rejected_by_policy");
    }
    if (!request.command || request.command.length === 0) {
      throw new SandboxBackendError("Custom sandbox commands require a non-empty command array.", "command_rejected_by_policy");
    }
    rejectShellCommand(request.command);
    return {
      commandKind: "custom",
      command: request.command,
      workingDirectory,
      artifactPaths,
      requiresNetwork: false,
      networkMode: "none",
      timeoutMs: options.resourceLimits.maxJobDurationMs,
      maxLogBytes: options.resourceLimits.maxLogBytes,
      maxArtifactBytes: options.resourceLimits.maxArtifactBytes,
    };
  }

  if (request.command) {
    throw new SandboxBackendError("Raw command arrays are accepted only for dev-only custom commands.", "command_rejected_by_policy");
  }

  const mapped = commandMap[request.commandKind];
  const networkMode = mapped.requiresNetwork && options.dockerNetworkMode === "bridge" ? "bridge" : "none";
  return {
    commandKind: request.commandKind,
    command: mapped.command,
    workingDirectory,
    artifactPaths,
    requiresNetwork: mapped.requiresNetwork,
    networkMode,
    timeoutMs: options.resourceLimits.maxJobDurationMs,
    maxLogBytes: options.resourceLimits.maxLogBytes,
    maxArtifactBytes: options.resourceLimits.maxArtifactBytes,
  };
}

export function normalizePolicyPath(value: string, field: string): string {
  if (value.trim().length === 0 || value === ".") {
    return ".";
  }
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new SandboxBackendError(`${field} must be relative to the runner workspace.`, "command_rejected_by_policy");
  }
  try {
    return normalizeWorkspaceRelativePath(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : `${field} escapes workspace`;
    throw new SandboxBackendError(message, "command_rejected_by_policy");
  }
}

export function normalizeArtifactPath(value: string): string {
  const normalized = normalizePolicyPath(value, "artifactPaths");
  const root = normalized.split(/[\\/]/)[0] ?? normalized;
  if (!allowedArtifactRoots.includes(root as (typeof allowedArtifactRoots)[number])) {
    throw new SandboxBackendError(`Artifact path is not allowlisted: ${value}`, "command_rejected_by_policy");
  }
  return normalized;
}

function rejectShellCommand(command: string[]): void {
  const executable = command[0]?.toLowerCase() ?? "";
  if (shellBinaries.has(executable)) {
    throw new SandboxBackendError("Shell execution is disabled by sandbox command policy.", "command_rejected_by_policy");
  }
  if (command.some((part) => /(?:&&|\|\||;|`|\$\()/.test(part))) {
    throw new SandboxBackendError("Shell metacharacters are disabled by sandbox command policy.", "command_rejected_by_policy");
  }
}
