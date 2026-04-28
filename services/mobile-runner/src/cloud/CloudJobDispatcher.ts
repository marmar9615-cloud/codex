import type { CloudQuotaLimits } from "@codex/mobile-protocol";
import type { CloudJobRecord, CloudRunnerProvider } from "./CloudRunnerProvider.js";
import { QuotaPolicy } from "./QuotaPolicy.js";

export class CloudJobDispatcher {
  private jobs = new Map<string, CloudJobRecord>();
  private nextJob = 1;
  readonly quota: QuotaPolicy;

  constructor(
    private readonly provider: CloudRunnerProvider,
    limits: CloudQuotaLimits,
  ) {
    this.quota = new QuotaPolicy(limits);
  }

  async dispatch(sessionId: string, now: () => string): Promise<CloudJobRecord> {
    const jobsForSession = [...this.jobs.values()].filter((job) => job.sessionId === sessionId).length;
    const concurrentJobs = [...this.jobs.values()].filter((job) => job.status === "running" || job.status === "queued").length;
    this.quota.assertAllowed({
      jobsForSession,
      concurrentJobs,
      requestedDurationMs: 1,
      workspaceBytes: 0,
      artifactBytes: 0,
    });
    const timestamp = now();
    const record: CloudJobRecord = {
      id: `cloud_job_${this.nextJob.toString().padStart(4, "0")}`,
      sessionId,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.nextJob += 1;
    this.jobs.set(record.id, record);
    return await this.provider.dispatch(record);
  }
}
