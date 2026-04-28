import type { GitChangeSummary, GitCommitRequest } from "@codex/mobile-protocol";
import { assertFeatureBranch } from "./GitSecurityPolicy.js";

export function makeDefaultBranchName(sessionId: string): string {
  return `codex/mobile-${sessionId}`;
}

export function planCommit(request: GitCommitRequest, sessionId: string, changes: GitChangeSummary[]): GitCommitRequest {
  const branchName = assertFeatureBranch(request.branchName ?? makeDefaultBranchName(sessionId));
  return {
    message: request.message.trim(),
    branchName,
  };
}
