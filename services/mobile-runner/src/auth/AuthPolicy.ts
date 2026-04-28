import type { RunnerAuthMode, RunnerIdentity } from "@codex/mobile-protocol";
import type { RunnerAuthProvider } from "./RunnerAuth.js";

export class RunnerAuthPolicyError extends Error {
  constructor(
    message: string,
    readonly code = "runner_unauthorized",
    readonly status = 401,
  ) {
    super(message);
    this.name = "RunnerAuthPolicyError";
  }
}

export type RunnerAuthPolicy = {
  authenticate(provider: RunnerAuthProvider, headers: Record<string, string | string[] | undefined>): RunnerIdentity;
};

export function createAuthPolicy(mode: RunnerAuthMode): RunnerAuthPolicy {
  if (mode === "dev") {
    return {
      authenticate: (provider, headers) => provider.authenticate(headers),
    };
  }
  return {
    authenticate: () => {
      throw new RunnerAuthPolicyError(
        `RUNNER_AUTH_MODE=${mode} is reserved for production auth integration and is not implemented in this milestone.`,
      );
    },
  };
}
