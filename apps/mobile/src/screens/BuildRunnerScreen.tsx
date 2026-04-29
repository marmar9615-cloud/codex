import { Stack } from "expo-router";
import { Text, View } from "react-native";
import type { SandboxCommandKind } from "@codex/mobile-protocol";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function BuildRunnerScreen() {
  const { runnerLogs, flowStatus, job, artifacts, runRunnerFlow, runBuildJob, error, runnerCapabilities } = useProject();
  const busy = flowStatus === "syncing" || flowStatus === "running";
  const availableCommands = new Set(runnerCapabilities?.commandKinds ?? []);
  const sandboxUnavailable =
    runnerCapabilities?.activeSandboxBackend === "local-docker" && runnerCapabilities.remoteSandboxExecution === false;
  const actions: Array<{ label: string; commandKind: SandboxCommandKind }> = [
    { label: "Install Dependencies", commandKind: firstAvailable(availableCommands, ["pnpm_install", "npm_install", "yarn_install"]) },
    { label: "Run Tests", commandKind: firstAvailable(availableCommands, ["pnpm_test", "npm_test", "yarn_test"]) },
    { label: "Build Project", commandKind: firstAvailable(availableCommands, ["pnpm_build", "npm_build", "yarn_build"]) },
  ];

  return (
    <>
      <Stack.Screen options={{ title: "Runner" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill label={flowStatus} tone={flowStatus === "succeeded" ? "ready" : flowStatus === "failed" ? "danger" : busy ? "warning" : "muted"} />
          <StatusPill label={`mode: ${job?.mode ?? runnerCapabilities?.activeMode ?? "unknown"}`} tone={job?.mode === "codex-app-server" ? "warning" : "muted"} />
          <StatusPill label={`sandbox: ${job?.sandboxBackend ?? runnerCapabilities?.activeSandboxBackend ?? "unknown"}`} tone={sandboxUnavailable ? "danger" : "ready"} />
          {job ? <StatusPill label={job.status} tone={job.status === "succeeded" ? "ready" : job.status === "failed" ? "danger" : "warning"} /> : null}
        </View>

        {runnerCapabilities ? (
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Commands: {runnerCapabilities.commandKinds.filter((kind) => kind !== "custom").join(", ")}
          </Text>
        ) : null}

        {sandboxUnavailable ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            Local Docker sandbox is selected but unavailable. Switch to the fake backend or start Docker before running real sandbox jobs.
          </Text>
        ) : null}

        {job?.exitCode !== undefined || job?.durationMs !== undefined ? (
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Exit: {job.exitCode ?? "n/a"} Duration: {job.durationMs ?? "n/a"}ms
          </Text>
        ) : null}

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        <View
          testID="mobile-build-runner-logs"
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

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {actions.map((action) => (
            <ActionButton
              key={action.commandKind}
              tone="primary"
              disabled={busy || !availableCommands.has(action.commandKind)}
              accessibilityLabel={`Start ${action.label}`}
              testID={`mobile-build-start-${action.commandKind}`}
              onPress={() => {
                void runBuildJob(action.commandKind);
              }}
            >
              {action.label}
            </ActionButton>
          ))}
          <ActionButton
            tone="secondary"
            disabled={busy}
            accessibilityLabel="Start agent fix pass"
            testID="mobile-build-agent-fix-pass"
            onPress={() => {
              void runRunnerFlow("Build/test this project and propose a fix if needed.");
            }}
          >
            Agent Fix Pass
          </ActionButton>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Artifacts</Text>
          {artifacts.length === 0 ? (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              No artifacts yet. Run a safe sandbox action to collect allowed build, coverage, or test output metadata.
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
                {artifact.metadata ? (
                  <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
                    {Object.entries(artifact.metadata)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join("  ")}
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

function firstAvailable(available: Set<string>, candidates: SandboxCommandKind[]): SandboxCommandKind {
  return candidates.find((candidate) => available.has(candidate)) ?? candidates[0] ?? "npm_test";
}
