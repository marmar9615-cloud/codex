import type { RunnerIdentity } from "@codex/mobile-protocol";

export interface RunnerAuthProvider {
  authenticate(headers: Record<string, string | string[] | undefined>): RunnerIdentity;
}

export class RunnerAuthError extends Error {
  constructor(
    message: string,
    readonly code = "runner_unauthorized",
  ) {
    super(message);
    this.name = "RunnerAuthError";
  }
}
