import type { MobileProject } from "@codex/mobile-protocol";
import { sampleWorkspaceFiles } from "./sample-files";
import { ensureAppWorkspace, writeWorkspaceText } from "./workspace-provider";

export async function createSampleWorkspaceProject(): Promise<{ project: MobileProject; filesWritten: number }> {
  const projectId = "sample-codex-mobile";
  const workspaceUri = await ensureAppWorkspace(projectId);
  for (const file of sampleWorkspaceFiles) {
    await writeWorkspaceText(workspaceUri, file.path, file.text);
  }
  return {
    project: {
      id: projectId,
      name: "Codex Mobile Sample",
      sourceKind: "appWorkspace",
      workspaceUri,
      lastOpenedAt: new Date().toISOString(),
    },
    filesWritten: sampleWorkspaceFiles.length,
  };
}
