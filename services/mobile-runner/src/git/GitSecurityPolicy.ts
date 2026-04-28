import { normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { GitPushRequest } from "@codex/mobile-protocol";

export class GitSecurityPolicyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "git_path_rejected"
      | "git_branch_rejected"
      | "git_force_push_rejected"
      | "git_provider_unavailable",
    readonly status = 400,
  ) {
    super(message);
    this.name = "GitSecurityPolicyError";
  }
}

const protectedBranches = new Set(["main", "master", "trunk", "develop"]);

export function assertSafeGitPath(value: string): string {
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new GitSecurityPolicyError(`Git path must be workspace-relative: ${value}`, "git_path_rejected");
  }
  try {
    return normalizeWorkspaceRelativePath(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Git path escapes workspace: ${value}`;
    throw new GitSecurityPolicyError(message, "git_path_rejected");
  }
}

export function assertFeatureBranch(branchName: string): string {
  const trimmed = branchName.trim();
  if (trimmed.length === 0 || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.endsWith("/")) {
    throw new GitSecurityPolicyError(`Unsafe branch name: ${branchName}`, "git_branch_rejected");
  }
  if (protectedBranches.has(trimmed)) {
    throw new GitSecurityPolicyError(`Direct changes to protected branch are disabled: ${branchName}`, "git_branch_rejected");
  }
  return trimmed;
}

export function assertSafePushRequest(request: GitPushRequest): GitPushRequest {
  if (request.force) {
    throw new GitSecurityPolicyError("Force push is disabled for mobile Git workflows.", "git_force_push_rejected");
  }
  return {
    ...request,
    branchName: assertFeatureBranch(request.branchName),
    force: false,
  };
}
