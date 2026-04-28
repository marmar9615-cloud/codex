export type AuthFeatureFlags = {
  chatgptAccountAuthEnabled: boolean;
  devApiKeyAuthEnabled: boolean;
};

export type MobileAuthState =
  | { status: "signedOut" }
  | { status: "blocked"; reason: string }
  | { status: "waitingForChatgpt"; loginId: string; verificationUrl?: string; userCode?: string }
  | { status: "authenticated"; provider: "chatgpt" | "devApiKey"; accountLabel?: string }
  | { status: "error"; message: string };

export type MobileAuthAction =
  | { type: "startChatgpt" }
  | { type: "startChatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: "completeChatgpt"; accountLabel?: string }
  | { type: "enableDevApiKey" }
  | { type: "fail"; message: string }
  | { type: "logout" };

export const productionAuthBlockedReason =
  "ChatGPT/Codex account auth is waiting on official OpenAI mobile-client support.";

export function reduceMobileAuthState(
  state: MobileAuthState,
  action: MobileAuthAction,
  flags: AuthFeatureFlags,
): MobileAuthState {
  switch (action.type) {
    case "startChatgpt":
      if (!flags.chatgptAccountAuthEnabled) {
        return { status: "blocked", reason: productionAuthBlockedReason };
      }
      return { status: "waitingForChatgpt", loginId: "pending" };
    case "startChatgptDeviceCode":
      if (!flags.chatgptAccountAuthEnabled) {
        return { status: "blocked", reason: productionAuthBlockedReason };
      }
      return {
        status: "waitingForChatgpt",
        loginId: action.loginId,
        verificationUrl: action.verificationUrl,
        userCode: action.userCode,
      };
    case "completeChatgpt":
      return { status: "authenticated", provider: "chatgpt", accountLabel: action.accountLabel };
    case "enableDevApiKey":
      if (!flags.devApiKeyAuthEnabled) {
        return { status: "blocked", reason: "Dev API-key auth is disabled for this build." };
      }
      return { status: "authenticated", provider: "devApiKey", accountLabel: "Local dev API key" };
    case "fail":
      return { status: "error", message: action.message };
    case "logout":
      return { status: "signedOut" };
  }

  const _exhaustive: never = action;
  return state ?? _exhaustive;
}
