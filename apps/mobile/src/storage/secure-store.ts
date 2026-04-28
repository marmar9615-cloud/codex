import * as SecureStore from "expo-secure-store";

const authStateKey = "codex.mobile.authState.v1";

export type PersistedMobileAuthSecret = {
  provider: "chatgpt" | "devApiKey";
  accountLabel?: string;
  tokenRef?: string;
};

export interface SecureTokenStore {
  loadAuthSecret(): Promise<PersistedMobileAuthSecret | null>;
  saveAuthSecret(secret: PersistedMobileAuthSecret): Promise<void>;
  clearAuthSecret(): Promise<void>;
}

export class ExpoSecureTokenStore implements SecureTokenStore {
  async loadAuthSecret(): Promise<PersistedMobileAuthSecret | null> {
    const raw = await SecureStore.getItemAsync(authStateKey);
    return raw ? (JSON.parse(raw) as PersistedMobileAuthSecret) : null;
  }

  async saveAuthSecret(secret: PersistedMobileAuthSecret): Promise<void> {
    await SecureStore.setItemAsync(authStateKey, JSON.stringify(secret), {
      keychainService: "CodexMobileAuth",
    });
  }

  async clearAuthSecret(): Promise<void> {
    await SecureStore.deleteItemAsync(authStateKey);
  }
}
