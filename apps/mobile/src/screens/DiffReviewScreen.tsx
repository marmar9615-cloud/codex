import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { applyUnifiedPatchToText } from "@codex/mobile-protocol";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { sampleUnifiedDiff } from "@/diff/sample-diff";
import { colors, spacing } from "@/theme";

export function DiffReviewScreen() {
  const [decision, setDecision] = useState<"pending" | "accepted" | "rejected">("pending");
  const preview = useMemo(
    () =>
      applyUnifiedPatchToText(
        'import React from "react";\nimport { Text } from "react-native";\n\nexport function App() {\n  return <Text>Codex</Text>;\n}\n',
        sampleUnifiedDiff,
      ),
    [],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Diff" }} />
      <Screen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
          <StatusPill label={decision} tone={decision === "accepted" ? "ready" : decision === "rejected" ? "danger" : "warning"} />
          <StatusPill label={preview.ok ? "Preview OK" : "Patch mismatch"} tone={preview.ok ? "ready" : "danger"} />
        </View>

        <View
          style={{
            backgroundColor: colors.codeBg,
            borderRadius: 8,
            padding: spacing.md,
            gap: 3,
          }}
        >
          {sampleUnifiedDiff.split("\n").map((line, index) => (
            <Text
              key={`${index}-${line}`}
              selectable
              style={{
                color: line.startsWith("+") ? "#86efac" : line.startsWith("-") ? "#fca5a5" : colors.codeText,
                fontFamily: "Menlo",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {line.length ? line : " "}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton tone="primary" onPress={() => setDecision("accepted")}>
            Accept
          </ActionButton>
          <ActionButton tone="danger" onPress={() => setDecision("rejected")}>
            Reject
          </ActionButton>
        </View>
      </Screen>
    </>
  );
}
