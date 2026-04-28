import type { CloudQuotaLimits, CloudRunnerCapabilities } from "@codex/mobile-protocol";
import type { CloudJobRecord, CloudRunnerProvider } from "./CloudRunnerProvider.js";

export class FakeCloudRunnerProvider implements CloudRunnerProvider {
  readonly mode = "fake" as const;
  private jobs = new Map<string, CloudJobRecord>();

  constructor(private readonly limits: CloudQuotaLimits) {}

  capabilities(): CloudRunnerCapabilities {
    return {
      provider: "fake",
      available: true,
      limits: this.limits,
    };
  }

  async dispatch(record: CloudJobRecord): Promise<CloudJobRecord> {
    this.jobs.set(record.id, record);
    return record;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, status: "cancelled", updatedAt: new Date().toISOString() });
    }
  }
}
