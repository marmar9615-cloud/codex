import assert from "node:assert/strict";
import test from "node:test";
import { joinWorkspaceUri } from "@codex/mobile-protocol";
import { makeProjectSnapshot } from "./sample-files";

test("workspace URI helper keeps app-sandbox writes rooted", () => {
  assert.equal(joinWorkspaceUri("file:///app/workspaces", "src/App.tsx"), "file:///app/workspaces/src/App.tsx");
  assert.throws(() => joinWorkspaceUri("file:///app/workspaces", "../../outside"), /path escapes workspace/);
});

test("sample project snapshots reject traversal paths", () => {
  assert.throws(
    () => makeProjectSnapshot([{ path: "../../outside.txt", text: "nope" }]),
    /path escapes workspace/,
  );
});
