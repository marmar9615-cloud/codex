import type { WorkspaceGrant } from "@codex/mobile-protocol";

export async function requestIosSecurityScopedWorkspace(): Promise<WorkspaceGrant> {
  if (process.env.EXPO_OS !== "ios") {
    throw new Error("Security-scoped bookmarks are only available on iOS.");
  }
  throw new Error("iOS security-scoped bookmark access is a native-provider TODO for the publishable app.");
}
