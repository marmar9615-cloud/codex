import { Link, Stack } from "expo-router";
import { Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function EditorScreen() {
  const { activeProject, files, activeFile, activePath, setActivePath, updateActiveFile, saveActiveFile, error } = useProject();

  return (
    <>
      <Stack.Screen options={{ title: "Editor" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Link href="/chat" asChild>
            <ActionButton tone="primary" accessibilityLabel="Open agent chat" testID="mobile-editor-open-agent">Agent</ActionButton>
          </Link>
          <Link href="/diff" asChild>
            <ActionButton accessibilityLabel="Open diff review" testID="mobile-editor-open-diff">Diff</ActionButton>
          </Link>
          <Link href="/build" asChild>
            <ActionButton accessibilityLabel="Open build runner" testID="mobile-editor-open-build">Build</ActionButton>
          </Link>
          <Link href="/git" asChild>
            <ActionButton accessibilityLabel="Open Git publish" testID="mobile-editor-open-git">Git</ActionButton>
          </Link>
          <ActionButton
            accessibilityLabel="Save active file"
            testID="mobile-editor-save"
            onPress={() => {
              void saveActiveFile();
            }}
            disabled={!activeFile}
          >
            Save
          </ActionButton>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <StatusPill label={activeProject?.name ?? "No project"} tone={activeProject ? "ready" : "warning"} />
          <StatusPill label={activePath} tone="muted" />
        </View>

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        <View testID="mobile-editor-file-tree" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {files.map((file) => (
            <ActionButton
              key={file.path}
              tone={file.path === activePath ? "primary" : "secondary"}
              accessibilityLabel={`Open file ${file.path}`}
              testID={`mobile-editor-file-${file.path.replace(/[^A-Za-z0-9_-]/g, "-")}`}
              onPress={() => setActivePath(file.path)}
            >
              {file.path}
            </ActionButton>
          ))}
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{activeFile?.path ?? "No file selected"}</Text>
          </View>
          <TextInput
            multiline
            accessibilityLabel="Active file editor"
            testID="mobile-editor-text-input"
            value={activeFile?.text ?? ""}
            onChangeText={updateActiveFile}
            editable={Boolean(activeFile)}
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            style={{
              minHeight: 300,
              padding: spacing.md,
              backgroundColor: colors.codeBg,
              color: colors.codeText,
              fontFamily: "Menlo",
              fontSize: 14,
              lineHeight: 20,
            }}
          />
        </View>
      </Screen>
    </>
  );
}
