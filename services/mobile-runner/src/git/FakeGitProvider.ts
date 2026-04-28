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
import { Buffer } from "node:buffer";
import { assertFeatureBranch, assertSafePushRequest } from "./GitSecurityPolicy.js";
import { GitProviderError } from "./GitProvider.js";
import type { GitImportWorkspaceResult, GitProvider, GitProviderSession } from "./GitProvider.js";

type FakeSessionState = {
  repository: GitRepositorySummary;
  baseBranch: GitBranchSummary;
  branchName: string;
  commitSha?: string;
  pushed: boolean;
  changes: GitChangeSummary[];
};

const fakeRepository: GitRepositorySummary = {
  id: "fake-repo-codex-mobile-sample",
  owner: "openai",
  name: "codex-mobile-sample",
  fullName: "openai/codex-mobile-sample",
  defaultBranch: "main",
  private: false,
  htmlUrl: "https://github.com/openai/codex-mobile-sample",
};

const fakeBranches: GitBranchSummary[] = [
  { name: "main", sha: "abc123fake", protected: true },
  { name: "demo/mobile-workspace", sha: "def456fake", protected: false },
];

export class FakeGitProvider implements GitProvider {
  readonly mode = "fake" as const;
  private sessions = new Map<string, FakeSessionState>();
  private nextCommit = 1;

  capabilities(): GitCapabilities {
    return {
      provider: "fake",
      available: true,
      gitHubAppConfigured: false,
      supportsRepoImport: true,
      supportsCommit: true,
      supportsPush: true,
      supportsPullRequestPlan: true,
      secretsInMobile: false,
    };
  }

  async listRepositories(): Promise<GitRepositorySummary[]> {
    return [fakeRepository];
  }

  async listBranches(owner: string, repo: string): Promise<GitBranchSummary[]> {
    this.requireRepo(owner, repo);
    return fakeBranches;
  }

  async importRepository(session: GitProviderSession, request: GitImportRequest): Promise<GitImportWorkspaceResult> {
    this.requireRepo(request.owner, request.repo);
    const branch = fakeBranches.find((candidate) => candidate.name === (request.branch ?? fakeRepository.defaultBranch));
    if (!branch) {
      throw new GitProviderError(`Unknown fake branch: ${request.branch}`, "git_branch_not_found", 404);
    }
    this.sessions.set(session.sessionId, {
      repository: fakeRepository,
      baseBranch: branch,
      branchName: `codex/mobile-${session.sessionId}`,
      pushed: false,
      changes: [],
    });
    const snapshot = {
      files: [
        { path: "package.json", contentsBase64: encode(`{"scripts":{"test":"node --test","build":"echo build"}}\n`) },
        { path: "README.md", contentsBase64: encode("# Codex Mobile Sample\n\nImported through fake Git provider.\n") },
        { path: "src/App.tsx", contentsBase64: encode("export function App() {\n  return 'Codex Mobile Sample';\n}\n") },
      ],
    };
    return {
      sessionId: session.sessionId,
      repository: fakeRepository,
      branch,
      workspaceSource: { kind: "github", repository: fakeRepository, branch: branch.name, commitSha: branch.sha },
      importedFiles: snapshot.files.length,
      snapshot,
    };
  }

  async createBranch(session: GitProviderSession, branchName: string): Promise<GitBranchSummary> {
    const state = this.requireSession(session.sessionId);
    const safeBranch = assertFeatureBranch(branchName);
    state.branchName = safeBranch;
    return { name: safeBranch, sha: state.commitSha ?? state.baseBranch.sha, protected: false };
  }

  async status(session: GitProviderSession, snapshotFiles: string[]): Promise<GitChangeSummary[]> {
    const state = this.requireSession(session.sessionId);
    const changes = snapshotFiles.length > 0 ? snapshotFiles.map((path) => ({ path, status: "modified" as const })) : state.changes;
    state.changes = changes;
    return changes;
  }

  async commit(session: GitProviderSession, request: GitCommitRequest, changes: GitChangeSummary[]): Promise<GitCommitResult> {
    const state = this.requireSession(session.sessionId);
    const branchName = assertFeatureBranch(request.branchName ?? state.branchName);
    state.branchName = branchName;
    state.changes = changes;
    state.commitSha = `fakecommit${this.nextCommit.toString().padStart(4, "0")}`;
    this.nextCommit += 1;
    return {
      sessionId: session.sessionId,
      commitSha: state.commitSha,
      branchName,
      message: request.message,
      changedFiles: changes,
    };
  }

  async push(session: GitProviderSession, request: GitPushRequest): Promise<GitPushResult> {
    const state = this.requireSession(session.sessionId);
    const safe = assertSafePushRequest(request);
    state.branchName = safe.branchName;
    state.pushed = true;
    return {
      sessionId: session.sessionId,
      branchName: safe.branchName,
      remoteName: "origin",
      pushed: true,
      commitSha: state.commitSha,
      remoteUrl: `https://github.com/${state.repository.fullName}/tree/${encodeURIComponent(safe.branchName)}`,
    };
  }

  async pullRequestPlan(session: GitProviderSession): Promise<PullRequestPlan> {
    const state = this.requireSession(session.sessionId);
    return {
      sessionId: session.sessionId,
      title: `Mobile Codex changes for ${state.repository.name}`,
      body: "Fake Git provider PR plan. Real PR creation requires the server-side GitHub App provider.",
      headBranch: state.branchName,
      baseBranch: state.repository.defaultBranch,
      deepLinkUrl: `https://github.com/${state.repository.fullName}/compare/${state.repository.defaultBranch}...${encodeURIComponent(state.branchName)}?quick_pull=1`,
      provider: "fake",
      ready: state.pushed,
    };
  }

  private requireRepo(owner: string, repo: string): void {
    if (owner !== fakeRepository.owner || repo !== fakeRepository.name) {
      throw new GitProviderError(`Unknown fake repository: ${owner}/${repo}`, "git_repository_not_found", 404);
    }
  }

  private requireSession(sessionId: string): FakeSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new GitProviderError(`No Git workspace has been imported for session: ${sessionId}`, "git_repository_not_found", 404);
    }
    return state;
  }
}

function encode(contents: string): string {
  return Buffer.from(contents).toString("base64");
}
