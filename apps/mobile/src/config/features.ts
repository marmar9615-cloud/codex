import Constants from "expo-constants";
import type { AuthFeatureFlags } from "@codex/mobile-protocol";

function readBoolean(name: string, extraName: string, fallback: boolean): boolean {
  const envValue = process.env[name];
  if (envValue === "true") {
    return true;
  }
  if (envValue === "false") {
    return false;
  }
  const extra = Constants.expoConfig?.extra?.[extraName];
  return typeof extra === "boolean" ? extra : fallback;
}

function readString(name: string, extraName: string, fallback: string): string {
  const envValue = process.env[name];
  if (envValue && envValue.trim().length > 0) {
    return envValue;
  }
  const extra = Constants.expoConfig?.extra?.[extraName];
  return typeof extra === "string" ? extra : fallback;
}

export const authFeatureFlags: AuthFeatureFlags = {
  chatgptAccountAuthEnabled: readBoolean(
    "APP_PUBLIC_CODEX_CHATGPT_AUTH_ENABLED",
    "chatgptAccountAuthEnabled",
    false,
  ),
  devApiKeyAuthEnabled: readBoolean("APP_PUBLIC_CODEX_DEV_API_KEY_AUTH", "devApiKeyAuthEnabled", false),
};

export const runnerBaseUrl = readString("APP_PUBLIC_CODEX_RUNNER_URL", "runnerBaseUrl", "http://127.0.0.1:8787");
