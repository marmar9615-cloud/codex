import assert from "node:assert/strict";
import test from "node:test";
import { FakeGitProvider } from "./FakeGitProvider.js";

test("fake Git provider lists, imports, commits, pushes, and creates PR plans without secrets", async () => {
  const provider = new FakeGitProvider();
  const session = { sessionId: "mrs_0001", workspaceRoot: "/tmp/codex-mobile-test" };

  const repos = await provider.listRepositories();
  assert.equal(repos[0]?.fullName, "openai/codex-mobile-sample");

  const importResult = await provider.importRepository(session, {
    owner: "openai",
    repo: "codex-mobile-sample",
  });
  assert.equal(importResult.workspaceSource.kind, "github");
  assert.equal(importResult.snapshot.files.length, 3);

  const branch = await provider.createBranch(session, "codex/mobile-test");
  assert.equal(branch.name, "codex/mobile-test");

  const changes = await provider.status(session, ["src/App.tsx", "README.md"]);
  assert.equal(changes.length, 2);

  const commit = await provider.commit(session, { message: "Apply patch", branchName: "codex/mobile-test" }, changes);
  assert.match(commit.commitSha, /^fakecommit/);
  assert.equal(commit.changedFiles.length, 2);

  const push = await provider.push(session, { branchName: "codex/mobile-test" });
  assert.equal(push.pushed, true);

  const prPlan = await provider.pullRequestPlan(session);
  assert.equal(prPlan.ready, true);
  assert.ok(!JSON.stringify({ repos, importResult, branch, changes, commit, push, prPlan }).includes("token"));
});
