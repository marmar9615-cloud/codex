import { Stack, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

const importRows = [
  ["App workspace", "ready", "Creates a sample project inside app sandbox storage."],
  ["Files app picker", "ready", "Imports user-selected files into the app workspace before runner sync."],
  ["GitHub repo", "warning", "Coming next: runner-backed clone with explicit review before commit/push."],
  ["Android SAF folder", "warning", "Coming next: user-granted directory access through Storage Access Framework."],
  ["iOS security-scoped folder", "warning", "Coming next: user-granted document access, likely with a native bookmark module."],
] as const;

export function ProjectImportScreen() {
  const router = useRouter();
  const { createSampleProject } = useProject();

  return (
    <>
      <Stack.Screen options={{ title: "Import" }} />
      <Screen>
        <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
          The app starts with app-contained sample workspaces. GitHub clone, Android SAF folders, and iOS persistent
          document grants remain intentionally stubbed until the native/provider flows are implemented.
        </Text>
        {importRows.map(([title, tone, body]) => (
          <View
            key={title}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: "800" }}>{title}</Text>
              <StatusPill label={tone === "ready" ? "Ready" : "Stub"} tone={tone} />
            </View>
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              {body}
            </Text>
            {title === "App workspace" ? (
              <ActionButton
                tone="primary"
                onPress={() => {
                  void createSampleProject().then(() => router.push("/editor"));
                }}
              >
                Create Sample
              </ActionButton>
            ) : (
              <ActionButton disabled>Coming Next</ActionButton>
            )}
          </View>
        ))}
      </Screen>
    </>
  );
}
