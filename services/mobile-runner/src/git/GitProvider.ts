import type {
  GitBranchSummary,
  GitCapabilities,
  GitChangeSummary,
  GitCommitRequest,
  GitCommitResult,
  GitImportRequest,
  GitImportResult,
  GitProviderMode,
  GitPushRequest,
  GitPushResult,
  GitRepositorySummary,
  ProjectSnapshot,
  PullRequestPlan,
} from "@codex/mobile-protocol";

export type GitImportWorkspaceResult = GitImportResult & {
  snapshot: ProjectSnapshot;
};

export type GitProviderSession = {
  sessionId: string;
  workspaceRoot: string;
};

export interface GitProvider {
  readonly mode: GitProviderMode;
  capabilities(): GitCapabilities;
  listRepositories(): Promise<GitRepositorySummary[]>;
  listBranches(owner: string, repo: string): Promise<GitBranchSummary[]>;
  importRepository(session: GitProviderSession, request: GitImportRequest): Promise<GitImportWorkspaceResult>;
  createBranch(session: GitProviderSession, branchName: string): Promise<GitBranchSummary>;
  status(session: GitProviderSession, snapshotFiles: string[]): Promise<GitChangeSummary[]>;
  commit(session: GitProviderSession, request: GitCommitRequest, changes: GitChangeSummary[]): Promise<GitCommitResult>;
  push(session: GitProviderSession, request: GitPushRequest): Promise<GitPushResult>;
  pullRequestPlan(session: GitProviderSession): Promise<PullRequestPlan>;
}

export class GitProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "git_provider_unavailable"
      | "git_repository_not_found"
      | "git_branch_not_found"
      | "git_commit_rejected"
      | "git_push_rejected"
      | "git_pr_plan_unavailable",
    readonly status = 400,
  ) {
    super(message);
    this.name = "GitProviderError";
  }
}
