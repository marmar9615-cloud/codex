import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function DiffReviewScreen() {
  const { patch, patchDecision, applyPatchDecision, error } = useProject();
  const unifiedDiff = patch?.unifiedDiff ?? "";
  const unsupported = patch?.status === "unsupported" || (patch?.unsupportedChanges ?? 0) > 0;
  const hasChanges = (patch?.filesChanged ?? patch?.files.length ?? 0) > 0;

  return (
    <>
      <Stack.Screen options={{ title: "Diff" }} />
      <Screen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
          <StatusPill label={patchDecision} tone={patchDecision === "accepted" ? "ready" : patchDecision === "rejected" ? "danger" : "warning"} />
          <StatusPill label={patch?.source ?? "no patch"} tone={patch ? "ready" : "muted"} />
          {patch ? <StatusPill label={patch.status ?? "available"} tone={unsupported ? "danger" : "ready"} /> : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{patch?.summary ?? "No file changes were produced."}</Text>
          {patch ? (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              Changed files: {patch.filesChanged ?? patch.files.length}. Unsupported changes: {patch.unsupportedChanges ?? 0}.
            </Text>
          ) : (
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              Run the agent or build flow to fetch a runner patch proposal.
            </Text>
          )}
        </View>

        {patch ? (
          <View style={{ gap: spacing.sm }}>
            {patch.files.map((file) => (
              <View
                key={`${file.oldPath}-${file.newPath}`}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: unsupported || file.changeKind === "unsupported" ? colors.danger : colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: spacing.md,
                  gap: spacing.xs,
                }}
              >
                <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
                  {file.changeKind ?? "modified"}: {file.changeKind === "deleted" ? file.oldPath : file.newPath}
                </Text>
                <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
                  Hunks: {file.hunks.length}. {file.unsupportedReason ?? "Review every change before applying."}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

        {unsupported ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            This patch includes unsupported changes. Apply is blocked until a safer handler is implemented.
          </Text>
        ) : null}

        {hasChanges ? (
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
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            tone="primary"
            disabled={!patch || !hasChanges || unsupported || patchDecision === "accepted"}
            onPress={() => {
              void applyPatchDecision(true);
            }}
          >
            Apply Patch
          </ActionButton>
          <ActionButton
            tone="danger"
            disabled={!patch || patchDecision === "rejected"}
            onPress={() => {
              void applyPatchDecision(false);
            }}
          >
            Reject Patch
          </ActionButton>
          {patchDecision === "accepted" ? (
            <Link href="/git" asChild>
              <ActionButton>Commit to Branch</ActionButton>
            </Link>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
