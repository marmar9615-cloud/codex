import {
  assertBuildArtifact,
  assertGitBranchSummary,
  assertGitCapabilities,
  assertGitChangeSummary,
  assertGitCommitResult,
  assertGitImportResult,
  assertGitPushResult,
  assertGitRepositorySummary,
  assertMobileSession,
  assertPatchProposal,
  assertPullRequestPlan,
  assertRunnerCapabilitiesResponse,
  assertRunnerError,
  assertRunnerEvent,
  assertRunnerJob,
} from "@codex/mobile-protocol";
import type {
  ArtifactListResponse,
  BuildArtifact,
  BuildJobRequest,
  CreateSessionRequest,
  CreateSessionResponse,
  GitBranchSummary,
  GitCapabilities,
  GitChangeSummary,
  GitCommitRequest,
  GitCommitResult,
  GitImportRequest,
  GitImportResult,
  GitPushRequest,
  GitPushResult,
  GitRepositorySummary,
  GetJobResponse,
  GetPatchResponse,
  GetSessionResponse,
  PatchProposal,
  PullRequestPlan,
  RunnerCapabilitiesResponse,
  RunnerEvent,
  RunnerJob,
  StartBuildJobResponse,
  StartJobRequest,
  StartJobResponse,
  UploadSnapshotRequest,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";

const defaultRunnerBaseUrl = process.env.APP_PUBLIC_CODEX_RUNNER_URL ?? "http://127.0.0.1:8787";

export class RunnerClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RunnerClientError";
  }
}

export class MobileRunnerClient {
  constructor(private readonly baseUrl = defaultRunnerBaseUrl) {}

  async getCapabilities(): Promise<RunnerCapabilitiesResponse> {
    return assertRunnerCapabilitiesResponse(await this.get<RunnerCapabilitiesResponse>("/capabilities"));
  }

  async getGitCapabilities(): Promise<GitCapabilities> {
    return assertGitCapabilities(await this.get<GitCapabilities>("/git/capabilities"));
  }

  async listGitRepositories(): Promise<GitRepositorySummary[]> {
    const response = await this.get<{ repositories: GitRepositorySummary[] }>("/git/repositories");
    return response.repositories.map((repository) => assertGitRepositorySummary(repository));
  }

  async listGitBranches(owner: string, repo: string): Promise<GitBranchSummary[]> {
    const response = await this.get<{ branches: GitBranchSummary[] }>(
      `/git/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    );
    return response.branches.map((branch) => assertGitBranchSummary(branch));
  }

  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await this.post<CreateSessionResponse>("/sessions", request);
    return { session: assertMobileSession(response.session) };
  }

  async getSession(sessionId: string): Promise<GetSessionResponse> {
    const response = await this.get<GetSessionResponse>(`/sessions/${sessionId}`);
    return { session: assertMobileSession(response.session) };
  }

  async uploadSnapshot(sessionId: string, request: UploadSnapshotRequest): Promise<UploadSnapshotResponse> {
    return this.post(`/sessions/${sessionId}/snapshots`, request);
  }

  async startJob(sessionId: string, request: StartJobRequest): Promise<StartJobResponse> {
    const response = await this.post<StartJobResponse>(`/sessions/${sessionId}/jobs`, request);
    return { job: assertRunnerJob(response.job), logStreamUrl: response.logStreamUrl };
  }

  async startBuildJob(sessionId: string, jobId: string, request: BuildJobRequest): Promise<StartBuildJobResponse> {
    const response = await this.post<StartBuildJobResponse>(`/sessions/${sessionId}/jobs/${jobId}/builds`, request);
    return { job: assertRunnerJob(response.job), logStreamUrl: response.logStreamUrl };
  }

  async getJob(sessionId: string, jobId: string): Promise<GetJobResponse> {
    const response = await this.get<GetJobResponse>(`/sessions/${sessionId}/jobs/${jobId}`);
    return { job: assertRunnerJob(response.job) };
  }

  async getPatch(sessionId: string): Promise<GetPatchResponse> {
    const response = await this.get<GetPatchResponse>(`/sessions/${sessionId}/patch`);
    return {
      patch: response.patch === null ? null : assertPatchProposal(response.patch),
    };
  }

  async getArtifacts(sessionId: string): Promise<ArtifactListResponse> {
    const response = await this.get<ArtifactListResponse>(`/sessions/${sessionId}/artifacts`);
    return {
      artifacts: response.artifacts.map((artifact) => assertBuildArtifact(artifact)),
    };
  }

  async importGitHubRepository(sessionId: string, request: GitImportRequest): Promise<GitImportResult> {
    return assertGitImportResult(await this.post<GitImportResult>(`/sessions/${sessionId}/import/github`, request));
  }

  async createGitBranch(sessionId: string, branchName: string): Promise<GitBranchSummary> {
    const response = await this.post<{ branch: GitBranchSummary }>(`/sessions/${sessionId}/git/branch`, { branchName });
    return assertGitBranchSummary(response.branch);
  }

  async getGitStatus(sessionId: string): Promise<GitChangeSummary[]> {
    const response = await this.get<{ changes: GitChangeSummary[] }>(`/sessions/${sessionId}/git/status`);
    return response.changes.map((change) => assertGitChangeSummary(change));
  }

  async commitGitChanges(sessionId: string, request: GitCommitRequest): Promise<GitCommitResult> {
    return assertGitCommitResult(await this.post<GitCommitResult>(`/sessions/${sessionId}/git/commit`, request));
  }

  async pushGitBranch(sessionId: string, request: GitPushRequest): Promise<GitPushResult> {
    return assertGitPushResult(await this.post<GitPushResult>(`/sessions/${sessionId}/git/push`, request));
  }

  async createPullRequestPlan(sessionId: string): Promise<PullRequestPlan> {
    return assertPullRequestPlan(await this.post<PullRequestPlan>(`/sessions/${sessionId}/git/pr-plan`, {}));
  }

  async streamJobLogs(
    sessionId: string,
    jobId: string,
    onEvent?: (event: RunnerEvent) => void,
  ): Promise<RunnerEvent[]> {
    const response = await this.fetchWithErrors(`/sessions/${sessionId}/jobs/${jobId}/logs`);
    const text = await response.text();
    const events = parseRunnerSseText(text);
    events.forEach((event) => onEvent?.(event));
    return events;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchWithErrors(path);
    return (await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithErrors(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  }

  private async fetchWithErrors(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network error";
      throw new RunnerClientError(`runner offline: ${message}`);
    }
    if (!response.ok) {
      throw new RunnerClientError(`runner request failed: ${response.status}: ${await readRunnerErrorMessage(response)}`, response.status);
    }
    return response;
  }
}

async function readRunnerErrorMessage(response: Response): Promise<string> {
  try {
    const parsed = assertRunnerError(await response.json());
    return parsed.code ? `${parsed.code}: ${parsed.error}` : parsed.error;
  } catch {
    return response.statusText || "unknown runner error";
  }
}

export function parseRunnerSseText(text: string): RunnerEvent[] {
  const events: RunnerEvent[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const trimmed = block.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());
    if (dataLines.length === 0) {
      throw new RunnerClientError("malformed runner SSE: missing data line");
    }
    try {
      events.push(assertRunnerEvent(JSON.parse(dataLines.join("\n"))));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown parse error";
      throw new RunnerClientError(`malformed runner SSE: ${message}`);
    }
  }
  return events;
}

export function getLatestJob(events: RunnerEvent[]): RunnerJob | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "runner.jobStatus") {
      return event.job;
    }
  }
  return null;
}

export function getPatchEventSummary(events: RunnerEvent[]): string | null {
  const patch = events.find((event) => event.type === "runner.patch");
  return patch?.type === "runner.patch" ? patch.summary : null;
}

export type RunnerFlowResult = {
  job: RunnerJob;
  patch: PatchProposal | null;
  artifacts: BuildArtifact[];
  events: RunnerEvent[];
};
