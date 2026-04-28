import { normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { BuildArtifact } from "@codex/mobile-protocol";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { SandboxBackendError } from "./SandboxBackend.js";
import { normalizeArtifactPath } from "./SandboxCommandPolicy.js";

export type CollectSandboxArtifactsOptions = {
  sessionId: string;
  jobId: string;
  workspaceRoot: string;
  artifactPaths: string[];
  maxArtifactBytes: number;
  now: () => string;
  nextArtifactId: () => string;
};

export async function collectSandboxArtifacts(options: CollectSandboxArtifactsOptions): Promise<BuildArtifact[]> {
  const artifacts: BuildArtifact[] = [];
  for (const requestedPath of options.artifactPaths) {
    const artifactPath = normalizeArtifactPath(requestedPath);
    const absolutePath = resolveWorkspacePath(options.workspaceRoot, artifactPath);
    const summary = await summarizePath(absolutePath);
    if (!summary.exists) {
      continue;
    }
    if (summary.bytes > options.maxArtifactBytes) {
      throw new SandboxBackendError(`Artifact ${artifactPath} exceeds max size ${options.maxArtifactBytes} bytes.`, "artifact_too_large", 413);
    }
    artifacts.push({
      id: options.nextArtifactId(),
      sessionId: options.sessionId,
      jobId: options.jobId,
      kind: artifactKindForPath(artifactPath),
      title: `Sandbox artifact: ${artifactPath}`,
      metadata: {
        sandboxPath: artifactPath,
        bytes: String(summary.bytes),
        fileCount: String(summary.fileCount),
      },
      createdAt: options.now(),
    });
  }
  return artifacts;
}

async function summarizePath(absolutePath: string): Promise<{ exists: boolean; bytes: number; fileCount: number }> {
  let stat;
  try {
    stat = await lstat(absolutePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return { exists: false, bytes: 0, fileCount: 0 };
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    return { exists: true, bytes: 0, fileCount: 0 };
  }
  if (stat.isFile()) {
    return { exists: true, bytes: stat.size, fileCount: 1 };
  }
  if (!stat.isDirectory()) {
    return { exists: true, bytes: 0, fileCount: 0 };
  }
  let bytes = 0;
  let fileCount = 0;
  for (const entry of await readdir(absolutePath)) {
    const child = await summarizePath(path.join(absolutePath, entry));
    bytes += child.bytes;
    fileCount += child.fileCount;
  }
  return { exists: true, bytes, fileCount };
}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const absolute = path.resolve(workspaceRoot, normalized);
  const rootWithSeparator = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
  if (absolute !== workspaceRoot && !absolute.startsWith(rootWithSeparator)) {
    throw new SandboxBackendError(`Artifact path escapes workspace: ${relativePath}`, "workspace_rejected");
  }
  return absolute;
}

function artifactKindForPath(artifactPath: string): BuildArtifact["kind"] {
  if (artifactPath.startsWith("coverage") || artifactPath.startsWith("test-results")) {
    return "testReport";
  }
  if (artifactPath.startsWith("dist") || artifactPath.startsWith("build")) {
    return "webPreview";
  }
  return "other";
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
