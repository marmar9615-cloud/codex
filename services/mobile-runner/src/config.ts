import type { AppServerTransport, RunnerCapabilitiesResponse, RunnerMode } from "@codex/mobile-protocol";
import { existsSync } from "node:fs";
import path from "node:path";

export type MobileRunnerConfig = {
  defaultMode: RunnerMode;
  runnerMode: RunnerMode;
  codexAppServerBin: string;
  codexAppServerTransport: AppServerTransport;
  codexAppServerTimeoutMs: number;
  supportedTransports: AppServerTransport[];
};

const runnerModes = new Set<RunnerMode>(["fake", "codex-app-server"]);
const appServerTransports = new Set<AppServerTransport>(["stdio", "unix", "local-ws"]);

export function loadMobileRunnerConfig(env: NodeJS.ProcessEnv = process.env): MobileRunnerConfig {
  const runnerMode = parseRunnerMode(env.RUNNER_MODE ?? "fake");
  const codexAppServerTransport = parseAppServerTransport(env.CODEX_APP_SERVER_TRANSPORT ?? "stdio");
  return {
    defaultMode: "fake",
    runnerMode,
    codexAppServerBin: env.CODEX_APP_SERVER_BIN ?? "codex",
    codexAppServerTransport,
    codexAppServerTimeoutMs: parsePositiveInt(env.CODEX_APP_SERVER_TIMEOUT_MS, 30_000),
    supportedTransports: ["stdio"],
  };
}

export function capabilitiesFromConfig(config: MobileRunnerConfig): RunnerCapabilitiesResponse {
  return {
    defaultMode: config.defaultMode,
    activeMode: config.runnerMode,
    fakeRunner: true,
    codexAppServerBridge: config.runnerMode === "codex-app-server" && getCodexBridgePreflightError(config) === null,
    supportedTransports: config.supportedTransports,
    productionOAuthEnabled: false,
    remoteSandboxExecution: false,
  };
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
