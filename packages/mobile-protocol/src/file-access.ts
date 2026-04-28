export type WorkspaceAccessKind = "appSandbox" | "documentPicker" | "androidSaf" | "iosSecurityScoped";

export type WorkspaceGrant = {
  kind: WorkspaceAccessKind;
  rootUri: string;
  displayName: string;
  persisted: boolean;
};

export type WorkspaceFileEntry = {
  path: string;
  uri: string;
  isDirectory: boolean;
  sizeBytes?: number;
};

export interface WorkspaceProvider {
  readonly kind: WorkspaceAccessKind;
  listFiles(rootUri: string): Promise<WorkspaceFileEntry[]>;
  readText(uri: string): Promise<string>;
  writeText(uri: string, text: string): Promise<void>;
}

export function normalizeWorkspaceRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").split("/").filter(Boolean);
  const out: string[] = [];
  for (const segment of normalized) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (out.length === 0) {
        throw new Error(`path escapes workspace: ${path}`);
      }
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

export function joinWorkspaceUri(rootUri: string, relativePath: string): string {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const root = rootUri.endsWith("/") ? rootUri.slice(0, -1) : rootUri;
  return normalized.length === 0 ? root : `${root}/${normalized}`;
}
