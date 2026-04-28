import { Link, Stack } from "expo-router";
import { Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/theme";

const sampleCode = `export function greet(name: string) {
  return \`Hello, \${name}\`;
}
`;

export function EditorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Editor" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Link href="/chat" asChild>
            <ActionButton tone="primary">Chat</ActionButton>
          </Link>
          <Link href="/diff" asChild>
            <ActionButton>Diff</ActionButton>
          </Link>
          <Link href="/build" asChild>
            <ActionButton>Build</ActionButton>
          </Link>
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
            <Text style={{ color: colors.text, fontWeight: "800" }}>src/example.ts</Text>
          </View>
          <TextInput
            multiline
            defaultValue={sampleCode}
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            style={{
              minHeight: 260,
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
