import type { WorkspaceGrant } from "@codex/mobile-protocol";

export async function requestAndroidSafWorkspace(): Promise<WorkspaceGrant> {
  if (process.env.EXPO_OS !== "android") {
    throw new Error("Android SAF is only available on Android.");
  }
  throw new Error("Android SAF directory access is a native-provider TODO for the publishable app.");
}
