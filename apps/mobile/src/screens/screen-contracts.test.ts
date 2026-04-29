import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile screens expose stable QA test IDs for critical flows", () => {
  const requiredIds = [
    "mobile-project-list-new-sample",
    "mobile-import-git-${repository.owner}-${repository.name}",
    "mobile-editor-file-tree",
    "mobile-editor-save",
    "mobile-agent-start-fake-job",
    "mobile-agent-chat-logs",
    "mobile-diff-apply-patch",
    "mobile-diff-reject-patch",
    "mobile-build-start-${action.commandKind}",
    "mobile-git-commit",
    "mobile-git-push",
    "mobile-git-pr-plan",
    "mobile-auth-gated-status",
  ];
  const source = readScreens();
  for (const id of requiredIds) {
    assert.ok(source.includes(id), `missing QA test ID: ${id}`);
  }
});

test("auth and Git UI copy stays gated and does not render server-only secret placeholders", () => {
  const source = readScreens();
  assert.match(source, /Production ChatGPT\/Codex sign-in status: gated/);
  assert.match(source, /personal access tokens, installation tokens, private keys/);
  for (const forbidden of [
    "GITHUB_APP_PRIVATE_KEY_BASE64",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_WEBHOOK_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_JSON_PATH",
  ]) {
    assert.ok(!source.includes(forbidden), `mobile source must not render ${forbidden}`);
  }
});

function readScreens(): string {
  return [
    "src/screens/ProjectListScreen.tsx",
    "src/screens/ProjectImportScreen.tsx",
    "src/screens/EditorScreen.tsx",
    "src/screens/AgentChatScreen.tsx",
    "src/screens/DiffReviewScreen.tsx",
    "src/screens/BuildRunnerScreen.tsx",
    "src/screens/GitPublishScreen.tsx",
    "src/screens/SettingsAuthScreen.tsx",
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}
