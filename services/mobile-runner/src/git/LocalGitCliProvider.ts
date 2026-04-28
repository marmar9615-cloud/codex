import type {
  GitBranchSummary,
  GitCapabilities,
  GitChangeSummary,
  GitCommitRequest,
  GitCommitResult,
  GitImportRequest,
  GitPushRequest,
  GitPushResult,
  GitRepositorySummary,
  PullRequestPlan,
} from "@codex/mobile-protocol";
import { GitProviderError } from "./GitProvider.js";
import type { GitImportWorkspaceResult, GitProvider, GitProviderSession } from "./GitProvider.js";

export class LocalGitCliProvider implements GitProvider {
  readonly mode = "local-git" as const;

  constructor(private readonly available: boolean) {}

  capabilities(): GitCapabilities {
    return {
      provider: "local-git",
      available: this.available,
      gitHubAppConfigured: false,
      supportsRepoImport: false,
      supportsCommit: this.available,
      supportsPush: false,
      supportsPullRequestPlan: false,
      secretsInMobile: false,
    };
  }

  async listRepositories(): Promise<GitRepositorySummary[]> {
    throw this.unavailable();
  }

  async listBranches(): Promise<GitBranchSummary[]> {
    throw this.unavailable();
  }

  async importRepository(_session: GitProviderSession, _request: GitImportRequest): Promise<GitImportWorkspaceResult> {
    throw this.unavailable();
  }

  async createBranch(): Promise<GitBranchSummary> {
    throw this.unavailable();
  }

  async status(): Promise<GitChangeSummary[]> {
    throw this.unavailable();
  }

  async commit(_session: GitProviderSession, _request: GitCommitRequest): Promise<GitCommitResult> {
    throw this.unavailable();
  }

  async push(_session: GitProviderSession, _request: GitPushRequest): Promise<GitPushResult> {
    throw this.unavailable();
  }

  async pullRequestPlan(): Promise<PullRequestPlan> {
    throw this.unavailable();
  }

  private unavailable(): GitProviderError {
    return new GitProviderError(
      this.available
        ? "Local git provider is reserved for configured safe local repositories and is not enabled for arbitrary host paths."
        : "git CLI is not available on PATH.",
      "git_provider_unavailable",
      503,
    );
  }
}
