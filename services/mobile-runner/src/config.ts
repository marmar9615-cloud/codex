import type {
  AppServerTransport,
  CloudQuotaLimits,
  CloudRunnerProviderMode,
  GitProviderMode,
  ResourceLimits,
  RunnerAuthMode,
  RunnerCapabilitiesResponse,
  RunnerMode,
  SandboxBackend,
  SandboxCommandKind,
} from "@codex/mobile-protocol";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export type MobileRunnerConfig = {
  defaultMode: RunnerMode;
  runnerMode: RunnerMode;
  codexAppServerBin: string;
  codexAppServerTransport: AppServerTransport;
  codexAppServerTimeoutMs: number;
  supportedTransports: AppServerTransport[];
  sandboxBackend: SandboxBackend;
  dockerImage: string;
  dockerNetworkMode: "none" | "bridge";
  enableUnsafeCustomCommands: boolean;
  commandKinds: SandboxCommandKind[];
  resourceLimits: ResourceLimits;
  gitProvider: GitProviderMode;
  gitHubAppConfigured: boolean;
  gitAllowedOwnerAllowlist: string[];
  cloudRunnerProvider: CloudRunnerProviderMode;
  cloudLimits: CloudQuotaLimits;
  runnerAuthMode: RunnerAuthMode;
};

const runnerModes = new Set<RunnerMode>(["fake", "codex-app-server"]);
const appServerTransports = new Set<AppServerTransport>(["stdio", "unix", "local-ws"]);
const gitProviders = new Set<GitProviderMode>(["fake", "local-git", "github-app"]);
const cloudRunnerProviders = new Set<CloudRunnerProviderMode>(["fake", "none", "aws-fargate", "gcp-cloud-run-jobs", "fly-machines", "kubernetes"]);
const runnerAuthModes = new Set<RunnerAuthMode>(["dev", "jwt", "session"]);
const sandboxBackends = new Set<SandboxBackend>(["fake", "local-docker"]);
export const defaultSandboxCommandKinds: SandboxCommandKind[] = [
  "npm_install",
  "npm_test",
  "npm_build",
  "pnpm_install",
  "pnpm_test",
  "pnpm_build",
  "yarn_install",
  "yarn_test",
  "yarn_build",
  "expo_export_or_check",
];

export const defaultResourceLimits: ResourceLimits = {
  maxWorkspaceBytes: 50 * 1024 * 1024,
  maxArtifactBytes: 10 * 1024 * 1024,
  maxJobDurationMs: 120_000,
  maxLogBytes: 1024 * 1024,
};

export const defaultCloudLimits: CloudQuotaLimits = {
  maxJobsPerSession: 20,
  maxConcurrentJobs: 2,
  maxDurationMs: 120_000,
  maxWorkspaceBytes: defaultResourceLimits.maxWorkspaceBytes,
  maxArtifactBytes: defaultResourceLimits.maxArtifactBytes,
};

export function loadMobileRunnerConfig(env: NodeJS.ProcessEnv = process.env): MobileRunnerConfig {
  const runnerMode = parseRunnerMode(env.RUNNER_MODE ?? "fake");
  const codexAppServerTransport = parseAppServerTransport(env.CODEX_APP_SERVER_TRANSPORT ?? "stdio");
  const sandboxBackend = parseSandboxBackend(env.SANDBOX_BACKEND ?? "fake");
  const enableUnsafeCustomCommands = env.ENABLE_UNSAFE_CUSTOM_COMMANDS === "1";
  const gitProvider = parseGitProvider(env.GIT_PROVIDER ?? "fake");
  const cloudRunnerProvider = parseCloudRunnerProvider(env.CLOUD_RUNNER_PROVIDER ?? "fake");
  const runnerAuthMode = parseRunnerAuthMode(env.RUNNER_AUTH_MODE ?? "dev");
  const gitHubAppConfigured = isGitHubAppConfigured(env);
  return {
    defaultMode: "fake",
    runnerMode,
    codexAppServerBin: env.CODEX_APP_SERVER_BIN ?? "codex",
    codexAppServerTransport,
    codexAppServerTimeoutMs: parsePositiveInt(env.CODEX_APP_SERVER_TIMEOUT_MS, 30_000),
    supportedTransports: ["stdio"],
    sandboxBackend,
    dockerImage: env.SANDBOX_DOCKER_IMAGE ?? "node:22-bookworm-slim",
    dockerNetworkMode: env.SANDBOX_DOCKER_NETWORK === "bridge" ? "bridge" : "none",
    enableUnsafeCustomCommands,
    commandKinds: enableUnsafeCustomCommands ? [...defaultSandboxCommandKinds, "custom"] : defaultSandboxCommandKinds,
    resourceLimits: {
      maxWorkspaceBytes: parsePositiveInt(env.SANDBOX_MAX_WORKSPACE_BYTES, defaultResourceLimits.maxWorkspaceBytes),
      maxArtifactBytes: parsePositiveInt(env.SANDBOX_MAX_ARTIFACT_BYTES, defaultResourceLimits.maxArtifactBytes),
      maxJobDurationMs: parsePositiveInt(env.SANDBOX_MAX_JOB_DURATION_MS, defaultResourceLimits.maxJobDurationMs),
      maxLogBytes: parsePositiveInt(env.SANDBOX_MAX_LOG_BYTES, defaultResourceLimits.maxLogBytes),
    },
    gitProvider,
    gitHubAppConfigured,
    gitAllowedOwnerAllowlist: parseCsv(env.GITHUB_ALLOWED_OWNER_ALLOWLIST),
    cloudRunnerProvider,
    cloudLimits: {
      maxJobsPerSession: parsePositiveInt(env.CLOUD_MAX_JOBS_PER_SESSION, defaultCloudLimits.maxJobsPerSession),
      maxConcurrentJobs: parsePositiveInt(env.CLOUD_MAX_CONCURRENT_JOBS, defaultCloudLimits.maxConcurrentJobs),
      maxDurationMs: parsePositiveInt(env.CLOUD_MAX_DURATION_MS, defaultCloudLimits.maxDurationMs),
      maxWorkspaceBytes: parsePositiveInt(env.CLOUD_MAX_WORKSPACE_BYTES, defaultCloudLimits.maxWorkspaceBytes),
      maxArtifactBytes: parsePositiveInt(env.CLOUD_MAX_ARTIFACT_BYTES, defaultCloudLimits.maxArtifactBytes),
    },
    runnerAuthMode,
  };
}

export function capabilitiesFromConfig(config: MobileRunnerConfig): RunnerCapabilitiesResponse {
  return {
    defaultMode: config.defaultMode,
    activeMode: config.runnerMode,
    fakeRunner: true,
    codexAppServerBridge: config.runnerMode === "codex-app-server" && getCodexBridgePreflightError(config) === null,
    supportedTransports: config.supportedTransports,
    sandboxBackends: config.sandboxBackend === "local-docker" && isBinaryResolvable("docker") ? ["fake", "local-docker"] : ["fake"],
    activeSandboxBackend: config.sandboxBackend,
    commandKinds: config.commandKinds,
    maxWorkspaceBytes: config.resourceLimits.maxWorkspaceBytes,
    maxArtifactBytes: config.resourceLimits.maxArtifactBytes,
    maxJobDurationMs: config.resourceLimits.maxJobDurationMs,
    maxLogBytes: config.resourceLimits.maxLogBytes,
    unsafeCustomCommandsEnabled: config.enableUnsafeCustomCommands,
    gitProvider: config.gitProvider,
    gitProviderAvailable: getGitProviderPreflightError(config) === null,
    gitHubAppConfigured: config.gitHubAppConfigured,
    supportsRepoImport: getGitProviderPreflightError(config) === null,
    supportsCommit: getGitProviderPreflightError(config) === null,
    supportsPush: getGitProviderPreflightError(config) === null,
    supportsPullRequestPlan: getGitProviderPreflightError(config) === null,
    secretsInMobile: false,
    cloudRunnerProvider: config.cloudRunnerProvider,
    cloudRunnerAvailable: getCloudRunnerPreflightError(config) === null,
    cloudLimits: config.cloudLimits,
    runnerAuthMode: config.runnerAuthMode,
    productionOAuthEnabled: false,
    remoteSandboxExecution: config.sandboxBackend === "local-docker" && getSandboxPreflightError(config) === null,
    phoneSideExecution: false,
  };
}

export function getGitProviderPreflightError(config: MobileRunnerConfig): string | null {
  if (config.gitProvider === "fake") {
    return null;
  }
  if (config.gitProvider === "local-git") {
    return isBinaryResolvable("git") ? null : "git CLI is not available on PATH";
  }
  if (config.gitProvider === "github-app") {
    return config.gitHubAppConfigured ? null : "GitHub App env is incomplete";
  }
  return `unsupported GIT_PROVIDER: ${config.gitProvider}`;
}

export function getCloudRunnerPreflightError(config: MobileRunnerConfig): string | null {
  if (config.cloudRunnerProvider === "fake") {
    return null;
  }
  if (config.cloudRunnerProvider === "none") {
    return "cloud runner provider is disabled";
  }
  return `cloud runner provider is not implemented yet: ${config.cloudRunnerProvider}`;
}

export function getCodexBridgePreflightError(config: MobileRunnerConfig): string | null {
  if (config.runnerMode !== "codex-app-server") {
    return null;
  }
  if (!config.supportedTransports.includes(config.codexAppServerTransport)) {
    return `codex app-server transport is not implemented in mobile-runner: ${config.codexAppServerTransport}`;
  }
  if (config.codexAppServerBin.trim().length === 0) {
    return "CODEX_APP_SERVER_BIN is empty";
  }
  if (path.isAbsolute(config.codexAppServerBin) && !existsSync(config.codexAppServerBin)) {
    return `CODEX_APP_SERVER_BIN does not exist: ${config.codexAppServerBin}`;
  }
  if (!path.isAbsolute(config.codexAppServerBin) && !isBinaryResolvable(config.codexAppServerBin)) {
    return `CODEX_APP_SERVER_BIN is not on PATH: ${config.codexAppServerBin}`;
  }
  return null;
}

export function getSandboxPreflightError(config: MobileRunnerConfig): string | null {
  if (config.sandboxBackend === "fake") {
    return null;
  }
  if (config.sandboxBackend !== "local-docker") {
    return `unsupported sandbox backend: ${config.sandboxBackend}`;
  }
  if (!isBinaryResolvable("docker")) {
    return "Docker CLI is not available on PATH";
  }
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    timeout: 5_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
    },
  });
  if (result.error) {
    return `Docker daemon is unavailable: ${result.error.message}`;
  }
  if (result.status !== 0) {
    return `Docker daemon is unavailable: ${(result.stderr || result.stdout || "docker version failed").trim()}`;
  }
  return null;
}

function parseRunnerMode(value: string): RunnerMode {
  if (!runnerModes.has(value as RunnerMode)) {
    throw new Error(`unsupported RUNNER_MODE: ${value}`);
  }
  return value as RunnerMode;
}

function parseAppServerTransport(value: string): AppServerTransport {
  if (!appServerTransports.has(value as AppServerTransport)) {
    throw new Error(`unsupported CODEX_APP_SERVER_TRANSPORT: ${value}`);
  }
  return value as AppServerTransport;
}

function parseSandboxBackend(value: string): SandboxBackend {
  if (!sandboxBackends.has(value as SandboxBackend)) {
    throw new Error(`unsupported SANDBOX_BACKEND: ${value}`);
  }
  return value as SandboxBackend;
}

function parseGitProvider(value: string): GitProviderMode {
  if (!gitProviders.has(value as GitProviderMode)) {
    throw new Error(`unsupported GIT_PROVIDER: ${value}`);
  }
  return value as GitProviderMode;
}

function parseCloudRunnerProvider(value: string): CloudRunnerProviderMode {
  if (!cloudRunnerProviders.has(value as CloudRunnerProviderMode)) {
    throw new Error(`unsupported CLOUD_RUNNER_PROVIDER: ${value}`);
  }
  return value as CloudRunnerProviderMode;
}

function parseRunnerAuthMode(value: string): RunnerAuthMode {
  if (!runnerAuthModes.has(value as RunnerAuthMode)) {
    throw new Error(`unsupported RUNNER_AUTH_MODE: ${value}`);
  }
  return value as RunnerAuthMode;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer timeout, received: ${value}`);
  }
  return parsed;
}

function isBinaryResolvable(command: string): boolean {
  if (command.includes(path.sep)) {
    return existsSync(command);
  }
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => existsSync(path.join(entry, command)));
}

function isGitHubAppConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.GITHUB_APP_ID &&
      (env.GITHUB_APP_PRIVATE_KEY_PATH || env.GITHUB_APP_PRIVATE_KEY_BASE64) &&
      env.GITHUB_APP_WEBHOOK_SECRET &&
      env.GITHUB_APP_CLIENT_ID &&
      env.GITHUB_APP_CLIENT_SECRET,
  );
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
