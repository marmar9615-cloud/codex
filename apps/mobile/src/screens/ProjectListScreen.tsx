import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { mockProjects } from "@/data/mock-projects";
import { colors, spacing } from "@/theme";

export function ProjectListScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Projects" }} />
      <Screen>
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>Codex Mobile</Text>
          <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 21 }}>
            Account auth is gated; runner execution is remote.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Link href="/import" asChild>
            <ActionButton tone="primary">Import</ActionButton>
          </Link>
          <Link href="/settings-auth" asChild>
            <ActionButton>Auth</ActionButton>
          </Link>
          <Link href="/build" asChild>
            <ActionButton>Runner</ActionButton>
          </Link>
        </View>

        <View style={{ gap: spacing.md }}>
          {mockProjects.map((project) => (
            <Link key={project.id} href="/editor" asChild>
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
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: "800" }}>{project.name}</Text>
                  <StatusPill label={project.sourceKind} tone={project.runnerSessionId ? "ready" : "muted"} />
                </View>
                <Text selectable style={{ color: colors.muted, fontSize: 13 }}>
                  {project.workspaceUri}
                </Text>
              </View>
            </Link>
          ))}
        </View>
      </Screen>
    </>
  );
}
