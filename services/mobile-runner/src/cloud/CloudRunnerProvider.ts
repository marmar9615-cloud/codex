import type { CloudRunnerCapabilities, CloudRunnerProviderMode } from "@codex/mobile-protocol";

export type CloudJobRecord = {
  id: string;
  sessionId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export interface CloudRunnerProvider {
  readonly mode: CloudRunnerProviderMode;
  capabilities(): CloudRunnerCapabilities;
  dispatch(record: CloudJobRecord): Promise<CloudJobRecord>;
  cancel(jobId: string): Promise<void>;
}
