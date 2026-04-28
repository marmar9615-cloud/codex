import { reduceMobileAuthState } from "@codex/mobile-protocol";
import type { AuthFeatureFlags, MobileAuthState } from "@codex/mobile-protocol";
import type { SecureTokenStore } from "@/storage/secure-store";

export async function restoreAuthState(store: SecureTokenStore): Promise<MobileAuthState> {
  const secret = await store.loadAuthSecret();
  if (!secret) {
    return { status: "signedOut" };
  }
  return {
    status: "authenticated",
    provider: secret.provider,
    accountLabel: secret.accountLabel,
  };
}

export async function requestChatgptAuth(flags: AuthFeatureFlags): Promise<MobileAuthState> {
  return reduceMobileAuthState({ status: "signedOut" }, { type: "startChatgpt" }, flags);
}

export async function enableDevApiKeyAuth(
  store: SecureTokenStore,
  flags: AuthFeatureFlags,
  apiKey: string,
): Promise<MobileAuthState> {
  const next = reduceMobileAuthState({ status: "signedOut" }, { type: "enableDevApiKey" }, flags);
  if (next.status === "authenticated") {
    await store.saveAuthSecret({
      provider: "devApiKey",
      accountLabel: "Local dev API key",
      tokenRef: apiKey,
    });
  }
  return next;
}
