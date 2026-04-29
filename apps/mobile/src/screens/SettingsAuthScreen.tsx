import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { reduceMobileAuthState } from "@codex/mobile-protocol";
import type { MobileAuthState } from "@codex/mobile-protocol";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { authFeatureFlags } from "@/config/features";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function SettingsAuthScreen() {
  const { runnerCapabilities, refreshRunnerCapabilities, job } = useProject();
  const [state, setState] = useState<MobileAuthState>({ status: "signedOut" });
  const [devKey, setDevKey] = useState("");
  const statusTone = useMemo(() => {
    if (state.status === "authenticated") {
      return "ready";
    }
    if (state.status === "blocked") {
      return "warning";
    }
    if (state.status === "error") {
      return "danger";
    }
    return "muted";
  }, [state.status]);

  return (
    <>
      <Stack.Screen options={{ title: "Auth" }} />
      <Screen>
        <View style={{ gap: spacing.sm }}>
          <StatusPill label={state.status} tone={statusTone} />
          <Text testID="mobile-auth-gated-status" selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Production ChatGPT/Codex sign-in status: gated.
          </Text>
          <Text selectable style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
            ChatGPT/Codex account
          </Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Production OAuth remains disabled until OpenAI confirms a supported public ChatGPT/Codex mobile flow.
            This app will not scrape ChatGPT, collect passwords, reuse browser cookies, or call private endpoints.
          </Text>
          {state.status === "blocked" ? (
            <Text selectable style={{ color: colors.warning, lineHeight: 20 }}>
              {state.reason}
            </Text>
          ) : null}
          <ActionButton
            tone="primary"
            accessibilityLabel="Continue with ChatGPT Codex account"
            testID="mobile-auth-continue"
            onPress={() =>
              setState((current) => reduceMobileAuthState(current, { type: "startChatgpt" }, authFeatureFlags))
            }
          >
            Continue
          </ActionButton>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
            Dev API key
          </Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Local testing only. Normal users should not need this.
          </Text>
          <TextInput
            value={devKey}
            onChangeText={setDevKey}
            placeholder="sk-..."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 44,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: spacing.md,
              color: colors.text,
            }}
          />
          <ActionButton
            accessibilityLabel="Enable dev API key mode"
            testID="mobile-auth-enable-dev-key"
            onPress={() =>
              setState((current) => reduceMobileAuthState(current, { type: "enableDevApiKey" }, authFeatureFlags))
            }
          >
            Enable Dev Mode
          </ActionButton>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
            Developer runner
          </Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            The runner defaults to fake mode. Local Codex app-server mode is enabled on the runner with RUNNER_MODE=codex-app-server and never exposes app-server directly to the phone.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <StatusPill label={`active: ${runnerCapabilities?.activeMode ?? "unknown"}`} tone={runnerCapabilities?.activeMode === "codex-app-server" ? "warning" : "muted"} />
            <StatusPill label={`job: ${job?.mode ?? "none"}`} tone={job?.mode === "codex-app-server" ? "warning" : "muted"} />
            <StatusPill label={`sandbox: ${runnerCapabilities?.activeSandboxBackend ?? "unknown"}`} tone={runnerCapabilities?.remoteSandboxExecution ? "ready" : "warning"} />
            <StatusPill label={runnerCapabilities?.productionOAuthEnabled ? "oauth enabled" : "oauth gated"} tone="warning" />
          </View>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Bridge transports: {runnerCapabilities?.supportedTransports.join(", ") ?? "unavailable"}. Sandbox backends: {runnerCapabilities?.sandboxBackends.join(", ") ?? "unavailable"}. Phone-side execution: no.
          </Text>
          <ActionButton accessibilityLabel="Refresh runner capabilities" testID="mobile-auth-refresh-capabilities" onPress={() => void refreshRunnerCapabilities()}>Refresh Capabilities</ActionButton>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
            GitHub workspace provider
          </Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Production GitHub connect requires a server-side GitHub App. The mobile app does not collect GitHub
            passwords or personal access tokens, and it does not store installation tokens.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <StatusPill label={`provider: ${runnerCapabilities?.gitProvider ?? "unknown"}`} tone={runnerCapabilities?.gitProviderAvailable ? "ready" : "warning"} />
            <StatusPill label={runnerCapabilities?.gitHubAppConfigured ? "app configured" : "app gated"} tone={runnerCapabilities?.gitHubAppConfigured ? "ready" : "warning"} />
            <StatusPill label={runnerCapabilities?.secretsInMobile === false ? "no mobile secrets" : "check secrets"} tone="ready" />
          </View>
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            The default workflow creates a feature branch, requires explicit commit/push approval, and prepares PR metadata instead of pushing to main.
          </Text>
        </View>
      </Screen>
    </>
  );
}
