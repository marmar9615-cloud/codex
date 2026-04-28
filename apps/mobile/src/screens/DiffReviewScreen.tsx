import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { sampleUnifiedDiff } from "@/diff/sample-diff";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function DiffReviewScreen() {
  const { patch, patchDecision, applyPatchDecision, error } = useProject();
  const unifiedDiff = patch?.unifiedDiff ?? sampleUnifiedDiff;

  return (
    <>
      <Stack.Screen options={{ title: "Diff" }} />
      <Screen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
          <StatusPill label={patchDecision} tone={patchDecision === "accepted" ? "ready" : patchDecision === "rejected" ? "danger" : "warning"} />
          <StatusPill label={patch ? "Runner patch" : "Sample diff"} tone={patch ? "ready" : "muted"} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{patch?.summary ?? "No runner patch yet"}</Text>
          {patch ? (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              Changed files: {patch.files.map((file) => file.newPath).join(", ")}
            </Text>
          ) : (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              Run the agent or build flow to fetch a real fake-runner patch proposal.
            </Text>
          )}
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
            gap: 3,
          }}
        >
          {unifiedDiff.split("\n").map((line, index) => (
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
          <ActionButton
            tone="primary"
            disabled={!patch || patchDecision === "accepted"}
            onPress={() => {
              void applyPatchDecision(true);
            }}
          >
            Accept
          </ActionButton>
          <ActionButton
            tone="danger"
            disabled={!patch || patchDecision === "rejected"}
            onPress={() => {
              void applyPatchDecision(false);
            }}
          >
            Reject
          </ActionButton>
        </View>
      </Screen>
    </>
  );
}
