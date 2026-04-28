import type { ProjectSnapshot } from "@codex/mobile-protocol";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeGitPath } from "./GitSecurityPolicy.js";

export async function materializeGitSnapshot(workspaceRoot: string, snapshot: ProjectSnapshot): Promise<void> {
  for (const deletedPath of snapshot.deletedPaths ?? []) {
    await rm(resolveGitWorkspacePath(workspaceRoot, deletedPath), { recursive: true, force: true });
  }
  for (const file of snapshot.files) {
    const absolutePath = resolveGitWorkspacePath(workspaceRoot, file.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(file.contentsBase64, "base64"));
  }
}

export function resolveGitWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const normalized = assertSafeGitPath(relativePath);
  const absolute = path.resolve(workspaceRoot, normalized);
  const rootWithSeparator = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
  if (absolute !== workspaceRoot && !absolute.startsWith(rootWithSeparator)) {
    throw new Error(`Git path escapes workspace: ${relativePath}`);
  }
  return absolute;
}
