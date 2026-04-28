import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { colors, spacing } from "@/theme";

const importRows = [
  ["App workspace", "ready", "Creates a project inside app sandbox storage."],
  ["Files app picker", "ready", "Imports user-selected files into the app workspace."],
  ["GitHub repo", "warning", "Runner-backed clone flow is pending."],
  ["Android SAF folder", "warning", "Native directory provider is pending."],
  ["iOS security-scoped folder", "warning", "Native bookmark provider is pending."],
] as const;

export function ProjectImportScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Import" }} />
      <Screen>
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
            <ActionButton tone={tone === "ready" ? "primary" : "secondary"}>Select</ActionButton>
          </View>
        ))}
      </Screen>
    </>
  );
}
