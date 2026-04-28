import { normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { BuildArtifact } from "@codex/mobile-protocol";

export class ArtifactStoreError extends Error {
  constructor(
    message: string,
    readonly code = "artifact_rejected",
  ) {
    super(message);
    this.name = "ArtifactStoreError";
  }
}

export class InMemoryArtifactStore {
  private artifacts = new Map<string, BuildArtifact[]>();

  put(artifact: BuildArtifact, maxArtifactBytes: number): BuildArtifact {
    const bytes = Number.parseInt(artifact.metadata?.bytes ?? "0", 10);
    if (bytes > maxArtifactBytes) {
      throw new ArtifactStoreError("Artifact exceeds configured max size.");
    }
    const sandboxPath = artifact.metadata?.sandboxPath;
    if (sandboxPath) {
      if (sandboxPath.startsWith("/") || sandboxPath.includes("..")) {
        throw new ArtifactStoreError("Artifact path is not workspace-relative.");
      }
      normalizeWorkspaceRelativePath(sandboxPath);
    }
    this.artifacts.set(artifact.sessionId, [...(this.artifacts.get(artifact.sessionId) ?? []), artifact]);
    return artifact;
  }

  list(sessionId: string): BuildArtifact[] {
    return this.artifacts.get(sessionId) ?? [];
  }
}
