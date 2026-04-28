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

export class GitHubAppProvider implements GitProvider {
  readonly mode = "github-app" as const;

  constructor(private readonly configured: boolean) {}

  capabilities(): GitCapabilities {
    return {
      provider: "github-app",
      available: this.configured,
      gitHubAppConfigured: this.configured,
      supportsRepoImport: this.configured,
      supportsCommit: this.configured,
      supportsPush: this.configured,
      supportsPullRequestPlan: this.configured,
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
      this.configured
        ? "GitHub App provider skeleton is configured but live GitHub operations are not implemented in this milestone."
        : "GitHub App provider is unavailable because server-side app credentials are missing.",
      "git_provider_unavailable",
      503,
    );
  }
}
