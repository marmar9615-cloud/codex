import { Stack } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useProject } from "@/project/ProjectContext";
import { colors, spacing } from "@/theme";

export function GitPublishScreen() {
  const {
    activeProject,
    files,
    gitStatus,
    gitCommitResult,
    gitPushResult,
    pullRequestPlan,
    runnerCapabilities,
    error,
    commitActiveWorkspace,
    pushActiveBranch,
    createPullRequestPlan,
  } = useProject();
  const [message, setMessage] = useState("Apply mobile Codex changes");
  const gitAvailable = runnerCapabilities?.supportsCommit === true && runnerCapabilities.gitProviderAvailable === true;
  const canPush = gitAvailable && runnerCapabilities?.supportsPush === true && gitCommitResult !== null;
  const canPlan = gitAvailable && runnerCapabilities?.supportsPullRequestPlan === true && gitPushResult !== null;

  return (
    <>
      <Stack.Screen options={{ title: "Git" }} />
      <Screen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill label={`provider: ${runnerCapabilities?.gitProvider ?? "unknown"}`} tone={gitAvailable ? "ready" : "warning"} />
          <StatusPill label={runnerCapabilities?.secretsInMobile === false ? "no mobile tokens" : "check config"} tone="ready" />
          <StatusPill label={`branch: ${activeProject?.branchName ?? activeProject?.workspaceSource?.branch ?? "none"}`} tone="muted" />
          <StatusPill label={activeProject?.dirty ? "dirty" : "clean"} tone={activeProject?.dirty ? "warning" : "ready"} />
        </View>

        <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
          GitHub production access uses a server-side GitHub App. The mobile app does not collect GitHub passwords,
          personal access tokens, installation tokens, private keys, or service credentials.
        </Text>

        {!gitAvailable ? (
          <Text selectable style={{ color: colors.warning, lineHeight: 20 }}>
            Commit/push is unavailable for the active provider. Fake mode supports the full local demo; real GitHub remains gated until the server-side GitHub App flow is implemented.
          </Text>
        ) : null}

        {error ? (
          <Text selectable style={{ color: colors.danger, lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}

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
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Changed files</Text>
          {(gitStatus.length > 0 ? gitStatus : files.map((file) => ({ path: file.path, status: activeProject?.dirty ? "modified" : "unchanged" }))).map((change) => (
            <Text key={`${change.path}-${change.status}`} selectable style={{ color: colors.muted, lineHeight: 20 }}>
              {change.status}: {change.path}
            </Text>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Commit message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            accessibilityLabel="Git commit message"
            testID="mobile-git-commit-message"
            style={{
              minHeight: 72,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              padding: spacing.md,
              color: colors.text,
              backgroundColor: colors.surface,
            }}
          />
          <ActionButton
            tone="primary"
            disabled={!gitAvailable}
            accessibilityLabel="Commit to feature branch"
            testID="mobile-git-commit"
            onPress={() => {
              void commitActiveWorkspace(message);
            }}
          >
            Commit to Branch
          </ActionButton>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton
            disabled={!canPush}
            accessibilityLabel="Push feature branch"
            testID="mobile-git-push"
            onPress={() => {
              void pushActiveBranch();
            }}
          >
            Push Branch
          </ActionButton>
          <ActionButton
            disabled={!canPlan}
            accessibilityLabel="Prepare pull request plan"
            testID="mobile-git-pr-plan"
            onPress={() => {
              void createPullRequestPlan();
            }}
          >
            Prepare PR Plan
          </ActionButton>
        </View>

        {gitCommitResult ? (
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Commit: {gitCommitResult.commitSha} on {gitCommitResult.branchName}
          </Text>
        ) : null}
        {gitPushResult ? (
          <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
            Push: {gitPushResult.remoteName}/{gitPushResult.branchName} {gitPushResult.remoteUrl ?? ""}
          </Text>
        ) : null}
        {pullRequestPlan ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
              {pullRequestPlan.title}
            </Text>
            <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
              {pullRequestPlan.body}
            </Text>
            {pullRequestPlan.deepLinkUrl ? (
              <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
                {pullRequestPlan.deepLinkUrl}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Screen>
    </>
  );
}
