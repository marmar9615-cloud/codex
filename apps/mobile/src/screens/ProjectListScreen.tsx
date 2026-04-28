import { Link, Stack, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function ProjectListScreen() {
  const router = useRouter();
  const { projects, activeProject, createSampleProject, openProject, flowStatus, error } = useProject();

  return (
    <>
      <Stack.Screen options={{ title: "Projects" }} />
      <Screen>
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>Codex Mobile</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 21 }}>
            Edit app-workspace files on device, then send builds/tests to the remote runner.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <ActionButton
            tone="primary"
            onPress={() => {
              void createSampleProject().then(() => router.push("/editor"));
            }}
          >
            New Sample
          </ActionButton>
          <Link href="/import" asChild>
            <ActionButton>Import</ActionButton>
          </Link>
          <Link href="/settings-auth" asChild>
            <ActionButton>Auth</ActionButton>
          </Link>
          <Link href="/build" asChild>
            <ActionButton>Runner</ActionButton>
          </Link>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <StatusPill label={`runner ${flowStatus}`} tone={flowStatus === "succeeded" ? "ready" : flowStatus === "failed" ? "danger" : "muted"} />
          {activeProject ? <StatusPill label={activeProject.name} tone="ready" /> : null}
        </View>

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: spacing.md }}>
          {projects.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => {
                openProject(project.id);
                router.push("/editor");
              }}
              style={({ pressed }) => ({
                backgroundColor: colors.surface,
                borderColor: activeProject?.id === project.id ? colors.accent : colors.border,
                borderWidth: 1,
                borderRadius: 8,
                padding: spacing.md,
                gap: spacing.sm,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
                <Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: "800" }}>{project.name}</Text>
                <StatusPill label={project.sourceKind} tone={project.runnerSessionId ? "ready" : "muted"} />
              </View>
              <Text selectable style={{ color: colors.muted, fontSize: 13 }}>
                {project.workspaceUri}
              </Text>
            </Pressable>
          ))}
        </View>
      </Screen>
    </>
  );
}
