import * as FileSystem from "expo-file-system/legacy";
import { joinWorkspaceUri } from "@codex/mobile-protocol";

const workspaceRoot = `${FileSystem.documentDirectory ?? ""}workspaces`;

export async function ensureAppWorkspace(projectId: string): Promise<string> {
  const uri = joinWorkspaceUri(workspaceRoot, projectId);
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  return uri;
}

export async function writeWorkspaceText(rootUri: string, relativePath: string, text: string): Promise<string> {
  const uri = joinWorkspaceUri(rootUri, relativePath);
  const parent = uri.slice(0, uri.lastIndexOf("/"));
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  await FileSystem.writeAsStringAsync(uri, text);
  return uri;
}

export async function readWorkspaceText(rootUri: string, relativePath: string): Promise<string> {
  return FileSystem.readAsStringAsync(joinWorkspaceUri(rootUri, relativePath));
}

export async function listWorkspaceEntries(rootUri: string): Promise<string[]> {
  return FileSystem.readDirectoryAsync(rootUri);
}
