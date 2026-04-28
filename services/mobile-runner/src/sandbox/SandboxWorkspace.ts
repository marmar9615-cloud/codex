import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { SandboxBackendError } from "./SandboxBackend.js";

export async function assertWorkspaceWithinLimit(workspaceRoot: string, maxWorkspaceBytes: number): Promise<void> {
  const bytes = await directorySize(workspaceRoot);
  if (bytes > maxWorkspaceBytes) {
    throw new SandboxBackendError(`Workspace exceeds max size ${maxWorkspaceBytes} bytes.`, "workspace_rejected", 413);
  }
}

async function directorySize(absolutePath: string): Promise<number> {
  const stat = await lstat(absolutePath);
  if (stat.isSymbolicLink()) {
    return 0;
  }
  if (stat.isFile()) {
    return stat.size;
  }
  if (!stat.isDirectory()) {
    return 0;
  }
  let total = 0;
  for (const entry of await readdir(absolutePath)) {
    total += await directorySize(path.join(absolutePath, entry));
  }
  return total;
}
