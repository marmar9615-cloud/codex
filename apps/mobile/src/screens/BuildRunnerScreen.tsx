import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function BuildRunnerScreen() {
  const { runnerLogs, flowStatus, job, artifacts, runRunnerFlow, error, runnerCapabilities } = useProject();
  const busy = flowStatus === "syncing" || flowStatus === "running";

  return (
    <>
      <Stack.Screen options={{ title: "Runner" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill label={flowStatus} tone={flowStatus === "succeeded" ? "ready" : flowStatus === "failed" ? "danger" : busy ? "warning" : "muted"} />
          <StatusPill label={`mode: ${job?.mode ?? runnerCapabilities?.activeMode ?? "unknown"}`} tone={job?.mode === "codex-app-server" ? "warning" : "muted"} />
          {job ? <StatusPill label={job.status} tone={job.status === "succeeded" ? "ready" : job.status === "failed" ? "danger" : "warning"} /> : null}
        </View>

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        <View
          style={{
            backgroundColor: colors.codeBg,
            borderRadius: 8,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          {runnerLogs.map((line, index) => (
            <Text key={`${index}-${line}`} selectable style={{ color: colors.codeText, fontFamily: "Menlo", lineHeight: 19 }}>
              {line}
            </Text>
          ))}
        </View>

        <ActionButton
          tone="primary"
          disabled={busy}
          onPress={() => {
            void runRunnerFlow("Build/test this project and propose a fix if needed.");
          }}
        >
          Start Runner Flow
        </ActionButton>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Artifacts</Text>
          {artifacts.length === 0 ? (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              No artifacts yet. Run the fake build/test flow to receive placeholder preview, APK, build log, and iOS handoff metadata.
            </Text>
          ) : (
            artifacts.map((artifact) => (
              <View
                key={artifact.id}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: spacing.md,
                  gap: spacing.xs,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "800" }}>{artifact.title}</Text>
                {artifact.webPreviewUrl ? <Text selectable style={{ color: colors.muted }}>{artifact.webPreviewUrl}</Text> : null}
                {artifact.buildLogUrl ? <Text selectable style={{ color: colors.muted }}>{artifact.buildLogUrl}</Text> : null}
                {artifact.apkUrl ? <Text selectable style={{ color: colors.muted }}>{artifact.apkUrl}</Text> : null}
                {artifact.iosInstructions ? (
                  <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
                    {artifact.iosInstructions}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </Screen>
    </>
  );
}
