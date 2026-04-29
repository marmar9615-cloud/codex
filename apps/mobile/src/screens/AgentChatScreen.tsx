import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function AgentChatScreen() {
  const router = useRouter();
  const { chatMessages, flowStatus, runRunnerFlow, patch, error, job, runnerCapabilities } = useProject();
  const [draft, setDraft] = useState("Build/fix this sample project.");
  const busy = flowStatus === "syncing" || flowStatus === "running";

  return (
    <>
      <Stack.Screen options={{ title: "Agent" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill label={flowStatus} tone={flowStatus === "succeeded" ? "ready" : flowStatus === "failed" ? "danger" : busy ? "warning" : "muted"} />
          <StatusPill label={`runner: ${job?.mode ?? runnerCapabilities?.activeMode ?? "unknown"}`} tone={job?.mode === "codex-app-server" ? "warning" : "muted"} />
          {patch ? <StatusPill label="patch ready" tone="ready" /> : null}
        </View>

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        <View testID="mobile-agent-chat-logs" style={{ gap: spacing.sm }}>
          {chatMessages.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                backgroundColor: message.role === "user" ? colors.accent : message.role === "system" ? colors.warningSoft : colors.surface,
                borderColor: colors.border,
                borderWidth: message.role === "user" ? 0 : 1,
                borderRadius: 8,
                padding: spacing.md,
              }}
            >
              <Text selectable style={{ color: message.role === "user" ? "#ffffff" : colors.text, lineHeight: 20 }}>
                {message.text}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          multiline
          accessibilityLabel="Agent prompt"
          testID="mobile-agent-prompt"
          value={draft}
          onChangeText={setDraft}
          style={{
            minHeight: 96,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing.md,
            color: colors.text,
            textAlignVertical: "top",
          }}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton
            tone="primary"
            disabled={busy || draft.trim().length === 0}
            accessibilityLabel="Start fake agent job"
            testID="mobile-agent-start-fake-job"
            onPress={() => {
              const prompt = draft.trim();
              setDraft("");
              void runRunnerFlow(prompt).then((result) => {
                if (result?.patch) {
                  router.push("/diff");
                }
              });
            }}
          >
            Run Agent
          </ActionButton>
          <ActionButton accessibilityLabel="Review agent patch" testID="mobile-agent-review-patch" disabled={!patch} onPress={() => router.push("/diff")}>
            Review Patch
          </ActionButton>
        </View>
      </Screen>
    </>
  );
}
