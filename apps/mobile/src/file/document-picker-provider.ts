import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { joinWorkspaceUri } from "@codex/mobile-protocol";

export type ImportedDocument = {
  name: string;
  sourceUri: string;
  workspaceUri: string;
};

export async function pickAndImportDocument(workspaceRootUri: string): Promise<ImportedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  const workspaceUri = joinWorkspaceUri(workspaceRootUri, asset.name);
  await FileSystem.copyAsync({ from: asset.uri, to: workspaceUri });
  return {
    name: asset.name,
    sourceUri: asset.uri,
    workspaceUri,
  };
}
