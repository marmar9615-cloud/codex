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
  ["GitHub repo", "ready", "Runner-backed import uses server-side provider credentials. Mobile never stores GitHub tokens."],
  ["Android SAF folder", "warning", "Coming next: user-granted directory access through Storage Access Framework."],
  ["iOS security-scoped folder", "warning", "Coming next: user-granted document access, likely with a native bookmark module."],
] as const;

export function ProjectImportScreen() {
  const router = useRouter();
  const { createSampleProject, gitRepositories, runnerCapabilities, refreshGitRepositories, importGitHubRepository } = useProject();
  const gitAvailable = runnerCapabilities?.supportsRepoImport === true && runnerCapabilities.gitProviderAvailable === true;

  return (
    <>
      <Stack.Screen options={{ title: "Import" }} />
      <Screen>
        <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
          The app starts with app-contained sample workspaces. GitHub clone, Android SAF folders, and iOS persistent
          document grants remain intentionally scoped to app storage or user-selected files. Real GitHub production access
          requires a server-side GitHub App; this screen does not collect passwords or personal access tokens.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill label={`git: ${runnerCapabilities?.gitProvider ?? "unknown"}`} tone={gitAvailable ? "ready" : "warning"} />
          <StatusPill label={runnerCapabilities?.secretsInMobile === false ? "no mobile secrets" : "check config"} tone="ready" />
        </View>
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
            ) : title === "GitHub repo" ? (
              <View style={{ gap: spacing.sm }}>
                <ActionButton onPress={() => void refreshGitRepositories()}>Refresh Repos</ActionButton>
                {gitAvailable && gitRepositories.length > 0 ? (
                  gitRepositories.map((repository) => (
                    <ActionButton
                      key={repository.id}
                      tone="primary"
                      onPress={() => {
                        void importGitHubRepository(repository.owner, repository.name, repository.defaultBranch).then((project) => {
                          if (project) {
                            router.push("/editor");
                          }
                        });
                      }}
                    >
                      Import {repository.fullName}
                    </ActionButton>
                  ))
                ) : (
                  <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
                    Real GitHub import is gated unless the runner has a configured provider. Fake mode exposes a sample repo for local testing.
                  </Text>
                )}
              </View>
            ) : (
              <ActionButton disabled>Coming Next</ActionButton>
            )}
          </View>
        ))}
      </Screen>
    </>
  );
}
