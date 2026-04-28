import type {
  CreateSessionRequest,
  CreateSessionResponse,
  StartJobRequest,
  StartJobResponse,
  UploadSnapshotRequest,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";
import { runnerBaseUrl } from "@/config/features";

export class MobileRunnerClient {
  constructor(private readonly baseUrl = runnerBaseUrl) {}

  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.post("/v1/sessions", request);
  }

  async uploadSnapshot(sessionId: string, request: UploadSnapshotRequest): Promise<UploadSnapshotResponse> {
    return this.put(`/v1/sessions/${sessionId}/snapshot`, request);
  }

  async startJob(sessionId: string, request: StartJobRequest): Promise<StartJobResponse> {
    return this.post(`/v1/sessions/${sessionId}/jobs`, request);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.send("POST", path, body);
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    return this.send("PUT", path, body);
  }

  private async send<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`runner request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
