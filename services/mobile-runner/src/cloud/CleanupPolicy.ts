export type CleanupCandidate = {
  id: string;
  updatedAtMs: number;
};

export type CleanupPolicyOptions = {
  workspaceTtlMs: number;
  artifactTtlMs: number;
  jobTtlMs: number;
};

export class CleanupPolicy {
  constructor(private readonly options: CleanupPolicyOptions) {}

  expiredWorkspaces(candidates: CleanupCandidate[], nowMs: number): CleanupCandidate[] {
    return this.expired(candidates, nowMs, this.options.workspaceTtlMs);
  }

  expiredArtifacts(candidates: CleanupCandidate[], nowMs: number): CleanupCandidate[] {
    return this.expired(candidates, nowMs, this.options.artifactTtlMs);
  }

  expiredJobs(candidates: CleanupCandidate[], nowMs: number): CleanupCandidate[] {
    return this.expired(candidates, nowMs, this.options.jobTtlMs);
  }

  private expired(candidates: CleanupCandidate[], nowMs: number, ttlMs: number): CleanupCandidate[] {
    return candidates.filter((candidate) => nowMs - candidate.updatedAtMs >= ttlMs);
  }
}
