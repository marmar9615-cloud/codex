import * as FileSystem from "expo-file-system/legacy";
import { joinWorkspaceUri } from "@codex/mobile-protocol";

const webWorkspaceRoot = "app://web-workspaces";
const workspaceRoot = isWebRuntime() ? webWorkspaceRoot : `${FileSystem.documentDirectory ?? ""}workspaces`;
const webWorkspaceStore = new Map<string, string>();

export async function ensureAppWorkspace(projectId: string): Promise<string> {
  const uri = joinWorkspaceUri(workspaceRoot, projectId);
  if (isWebRuntime()) {
    return uri;
  }
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  return uri;
}

export async function writeWorkspaceText(rootUri: string, relativePath: string, text: string): Promise<string> {
  const uri = joinWorkspaceUri(rootUri, relativePath);
  if (isWebRuntime()) {
    webWorkspaceStore.set(uri, text);
    return uri;
  }
  const parent = uri.slice(0, uri.lastIndexOf("/"));
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  await FileSystem.writeAsStringAsync(uri, text);
  return uri;
}

export async function readWorkspaceText(rootUri: string, relativePath: string): Promise<string> {
  if (isWebRuntime()) {
    const uri = joinWorkspaceUri(rootUri, relativePath);
    const text = webWorkspaceStore.get(uri);
    if (text === undefined) {
      throw new Error(`No web workspace file exists at ${relativePath}`);
    }
    return text;
  }
  return FileSystem.readAsStringAsync(joinWorkspaceUri(rootUri, relativePath));
}

export async function deleteWorkspacePath(rootUri: string, relativePath: string): Promise<void> {
  if (isWebRuntime()) {
    webWorkspaceStore.delete(joinWorkspaceUri(rootUri, relativePath));
    return;
  }
  await FileSystem.deleteAsync(joinWorkspaceUri(rootUri, relativePath), { idempotent: true });
}

export async function listWorkspaceEntries(rootUri: string): Promise<string[]> {
  if (isWebRuntime()) {
    const prefix = rootUri.endsWith("/") ? rootUri : `${rootUri}/`;
    return [...webWorkspaceStore.keys()]
      .filter((uri) => uri.startsWith(prefix))
      .map((uri) => uri.slice(prefix.length).split("/")[0])
      .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
  }
  return FileSystem.readDirectoryAsync(rootUri);
}

function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
