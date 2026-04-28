import type { CloudQuotaLimits } from "@codex/mobile-protocol";

export class QuotaPolicyError extends Error {
  constructor(
    message: string,
    readonly code = "quota_exceeded",
  ) {
    super(message);
    this.name = "QuotaPolicyError";
  }
}

export type QuotaUsage = {
  jobsForSession: number;
  concurrentJobs: number;
  requestedDurationMs: number;
  workspaceBytes: number;
  artifactBytes: number;
};

export class QuotaPolicy {
  constructor(readonly limits: CloudQuotaLimits) {}

  assertAllowed(usage: QuotaUsage): void {
    if (usage.jobsForSession >= this.limits.maxJobsPerSession) {
      throw new QuotaPolicyError("Session job quota exceeded.");
    }
    if (usage.concurrentJobs >= this.limits.maxConcurrentJobs) {
      throw new QuotaPolicyError("Concurrent job quota exceeded.");
    }
    if (usage.requestedDurationMs > this.limits.maxDurationMs) {
      throw new QuotaPolicyError("Requested job duration exceeds quota.");
    }
    if (usage.workspaceBytes > this.limits.maxWorkspaceBytes) {
      throw new QuotaPolicyError("Workspace size exceeds quota.");
    }
    if (usage.artifactBytes > this.limits.maxArtifactBytes) {
      throw new QuotaPolicyError("Artifact size exceeds quota.");
    }
  }
}
