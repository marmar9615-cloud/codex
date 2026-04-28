import type { MobileProject } from "@codex/mobile-protocol";

export const mockProjects: MobileProject[] = [
  {
    id: "project-codex-mobile",
    name: "Codex Mobile",
    sourceKind: "appWorkspace",
    workspaceUri: "file:///codex-mobile",
    lastOpenedAt: "2026-04-28T18:00:00.000Z",
    runnerSessionId: "mrs_demo",
  },
  {
    id: "project-runner-demo",
    name: "Runner Demo",
    sourceKind: "github",
    workspaceUri: "github://marmar9615-cloud/codex",
    lastOpenedAt: "2026-04-28T18:15:00.000Z",
  },
];
