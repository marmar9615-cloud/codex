import type { PatchLifecycleStatus, RunnerJobStatus } from "./types.js";

const runnerJobTransitions: Record<RunnerJobStatus, RunnerJobStatus[]> = {
  queued: ["running", "failed", "cancelled", "canceled"],
  running: ["awaitingApproval", "completed", "succeeded", "failed", "cancelled", "canceled"],
  awaitingApproval: ["running", "failed", "cancelled", "canceled"],
  completed: [],
  succeeded: [],
  failed: [],
  cancelled: [],
  canceled: [],
};

const patchTransitions: Record<PatchLifecycleStatus, PatchLifecycleStatus[]> = {
  none: ["available", "unsupported"],
  available: ["applied", "rejected", "failedToApply"],
  unsupported: ["rejected"],
  applied: [],
  rejected: [],
  failedToApply: ["available", "rejected"],
};

export function canTransitionRunnerJobStatus(from: RunnerJobStatus, to: RunnerJobStatus): boolean {
  return from === to || runnerJobTransitions[from].includes(to);
}

export function transitionRunnerJobStatus(from: RunnerJobStatus, to: RunnerJobStatus): RunnerJobStatus {
  if (!canTransitionRunnerJobStatus(from, to)) {
    throw new Error(`invalid runner job transition: ${from} -> ${to}`);
  }
  return to;
}

export function canTransitionPatchStatus(from: PatchLifecycleStatus, to: PatchLifecycleStatus): boolean {
  return from === to || patchTransitions[from].includes(to);
}

export function transitionPatchStatus(from: PatchLifecycleStatus, to: PatchLifecycleStatus): PatchLifecycleStatus {
  if (!canTransitionPatchStatus(from, to)) {
    throw new Error(`invalid patch transition: ${from} -> ${to}`);
  }
  return to;
}
