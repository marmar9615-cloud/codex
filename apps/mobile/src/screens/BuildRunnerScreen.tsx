import { Stack } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { colors, spacing } from "@/theme";

const initialLogs = ["runner: idle", "artifact store: empty"];

export function BuildRunnerScreen() {
  const [logs, setLogs] = useState(initialLogs);
  const [status, setStatus] = useState<"idle" | "running" | "succeeded">("idle");

  return (
    <>
      <Stack.Screen options={{ title: "Runner" }} />
      <Screen>
        <StatusPill label={status} tone={status === "succeeded" ? "ready" : status === "running" ? "warning" : "muted"} />
        <View
          style={{
            backgroundColor: colors.codeBg,
            borderRadius: 8,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          {logs.map((line, index) => (
            <Text key={`${index}-${line}`} selectable style={{ color: colors.codeText, fontFamily: "Menlo", lineHeight: 19 }}>
              {line}
            </Text>
          ))}
        </View>
        <ActionButton
          tone="primary"
          onPress={() => {
            setStatus("running");
            setLogs(["runner: creating session", "runner: syncing snapshot", "runner: fake npm test", "runner: completed"]);
            setTimeout(() => setStatus("succeeded"), 250);
          }}
        >
          Start Fake Test
        </ActionButton>
      </Screen>
    </>
  );
}
