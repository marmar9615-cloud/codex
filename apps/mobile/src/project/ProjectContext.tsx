import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { applyUnifiedPatchToText, normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { BuildArtifact, MobileProject, MobileSession, PatchProposal, RunnerJob } from "@codex/mobile-protocol";
import { findWorkspaceTextFile, makeProjectSnapshot, sampleWorkspaceFiles, updateWorkspaceTextFile } from "@/file/sample-files";
import type { WorkspaceTextFile } from "@/file/sample-files";
import { createSampleWorkspaceProject } from "@/file/sample-workspace";
import { writeWorkspaceText } from "@/file/workspace-provider";
import { getLatestJob, MobileRunnerClient } from "@/runner/runner-client";
import type { RunnerFlowResult } from "@/runner/runner-client";

export type ChatMessage = {
  role: "user" | "agent" | "system";
  text: string;
};

export type RunnerFlowStatus = "idle" | "syncing" | "running" | "succeeded" | "failed";

type ProjectContextValue = {
  projects: MobileProject[];
  activeProject: MobileProject | null;
  files: WorkspaceTextFile[];
  activePath: string;
  activeFile: WorkspaceTextFile | null;
  session: MobileSession | null;
  job: RunnerJob | null;
  patch: PatchProposal | null;
  artifacts: BuildArtifact[];
  runnerLogs: string[];
  chatMessages: ChatMessage[];
  flowStatus: RunnerFlowStatus;
  patchDecision: "pending" | "accepted" | "rejected";
  error: string | null;
  createSampleProject(): Promise<MobileProject>;
  openProject(projectId: string): void;
  setActivePath(path: string): void;
  updateActiveFile(text: string): void;
  saveActiveFile(): Promise<void>;
  runRunnerFlow(prompt: string): Promise<RunnerFlowResult | null>;
  applyPatchDecision(accepted: boolean): Promise<void>;
  clearError(): void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

const initialProjects: MobileProject[] = [
  {
    id: "sample-codex-mobile",
    name: "Codex Mobile Sample",
    sourceKind: "appWorkspace",
    workspaceUri: "app://sample-codex-mobile",
    lastOpenedAt: "2026-04-28T20:00:00.000Z",
  },
];

export function ProjectProvider({ children }: { children: ReactNode }) {
  const runnerClient = useMemo(() => new MobileRunnerClient(), []);
  const [projects, setProjects] = useState<MobileProject[]>(initialProjects);
  const [activeProject, setActiveProject] = useState<MobileProject | null>(initialProjects[0] ?? null);
  const [files, setFiles] = useState<WorkspaceTextFile[]>(cloneSampleFiles());
  const [activePath, setActivePath] = useState("src/App.tsx");
  const [session, setSession] = useState<MobileSession | null>(null);
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [patch, setPatch] = useState<PatchProposal | null>(null);
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>([]);
  const [runnerLogs, setRunnerLogs] = useState<string[]>(["runner: idle"]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Open the sample project, edit files locally, then ask the remote runner for a fake build/fix pass." },
  ]);
  const [flowStatus, setFlowStatus] = useState<RunnerFlowStatus>("idle");
  const [patchDecision, setPatchDecision] = useState<"pending" | "accepted" | "rejected">("pending");
  const [error, setError] = useState<string | null>(null);

  const activeFile = useMemo(() => findWorkspaceTextFile(files, activePath) ?? files[0] ?? null, [activePath, files]);

  const createSampleProject = useCallback(async (): Promise<MobileProject> => {
    setError(null);
    const { project } = await createSampleWorkspaceProject();
    const freshFiles = cloneSampleFiles();
    setProjects((current) => upsertProject(current, project));
    setActiveProject(project);
    setFiles(freshFiles);
    setActivePath("src/App.tsx");
    setSession(null);
    setJob(null);
    setPatch(null);
    setArtifacts([]);
    setRunnerLogs(["runner: sample workspace created"]);
    setPatchDecision("pending");
    return project;
  }, []);

  const openProject = useCallback(
    (projectId: string) => {
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) {
        setError(`Unknown project: ${projectId}`);
        return;
      }
      setActiveProject(project);
      setFiles((current) => (current.length > 0 ? current : cloneSampleFiles()));
      setActivePath("src/App.tsx");
      setError(null);
    },
    [projects],
  );

  const updateActiveFile = useCallback(
    (text: string) => {
      if (!activeFile) {
        return;
      }
      setFiles((current) => updateWorkspaceTextFile(current, activeFile.path, text));
    },
    [activeFile],
  );

  const saveActiveFile = useCallback(async () => {
    if (!activeProject || !activeFile) {
      return;
    }
    await writeWorkspaceText(activeProject.workspaceUri, activeFile.path, activeFile.text);
    setRunnerLogs((current) => [...current, `workspace: saved ${activeFile.path}`]);
  }, [activeFile, activeProject]);

  const runRunnerFlow = useCallback(
    async (prompt: string): Promise<RunnerFlowResult | null> => {
      setError(null);
      setPatchDecision("pending");
      setFlowStatus("syncing");
      setRunnerLogs(["runner: creating or reusing session"]);
      setChatMessages((current) => [...current, { role: "user", text: prompt }]);

      try {
        const project = activeProject ?? (await createSampleProject());
        const snapshotFiles = files.length > 0 ? files : cloneSampleFiles();
        let currentSession = session;
        if (!currentSession) {
          const created = await runnerClient.createSession({
            projectId: project.id,
            projectName: project.name,
            sourceKind: project.sourceKind,
          });
          currentSession = created.session;
          setSession(currentSession);
          setProjects((current) =>
            current.map((candidate) =>
              candidate.id === project.id ? { ...candidate, runnerSessionId: currentSession?.id } : candidate,
            ),
          );
        }

        await runnerClient.uploadSnapshot(currentSession.id, makeProjectSnapshot(snapshotFiles));
        setRunnerLogs((current) => [...current, `runner: uploaded ${snapshotFiles.length} files`]);
        setFlowStatus("running");

        const started = await runnerClient.startJob(currentSession.id, {
          kind: "test",
          command: ["npm", "test"],
        });
        setJob(started.job);
        setChatMessages((current) => [...current, { role: "agent", text: "Remote runner job started." }]);

        const events = await runnerClient.streamJobLogs(currentSession.id, started.job.id, (event) => {
          if (event.type === "runner.log") {
            const line = `[${event.stream}] ${event.message}`;
            setRunnerLogs((current) => [...current, line]);
            setChatMessages((current) => [...current, { role: "agent", text: line }]);
          } else if (event.type === "runner.jobStatus") {
            setJob(event.job);
          }
        });

        const latestJob = getLatestJob(events) ?? (await runnerClient.getJob(currentSession.id, started.job.id)).job;
        const patchResponse = await runnerClient.getPatch(currentSession.id);
        const artifactResponse = await runnerClient.getArtifacts(currentSession.id);
        setJob(latestJob);
        setPatch(patchResponse.patch);
        setArtifacts(artifactResponse.artifacts);
        setFlowStatus(latestJob.status === "succeeded" ? "succeeded" : "failed");
        setChatMessages((current) => [
          ...current,
          { role: "agent", text: patchResponse.patch ? `Patch ready: ${patchResponse.patch.summary}` : "Runner finished without a patch." },
        ]);
        return {
          job: latestJob,
          patch: patchResponse.patch,
          artifacts: artifactResponse.artifacts,
          events,
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "unknown runner error";
        setError(message);
        setFlowStatus("failed");
        setRunnerLogs((current) => [...current, `runner error: ${message}`]);
        setChatMessages((current) => [...current, { role: "agent", text: `Runner error: ${message}` }]);
        return null;
      }
    },
    [activeProject, createSampleProject, files, runnerClient, session],
  );

  const applyPatchDecision = useCallback(
    async (accepted: boolean) => {
      if (!accepted) {
        setPatchDecision("rejected");
        setChatMessages((current) => [...current, { role: "agent", text: "Patch rejected. Workspace was not changed." }]);
        return;
      }
      if (!patch) {
        setError("No patch proposal is available.");
        return;
      }
      const change = patch.files[0];
      if (!change) {
        setError("Patch proposal did not include changed files.");
        return;
      }
      try {
        const path = normalizeWorkspaceRelativePath(change.newPath);
        const target = findWorkspaceTextFile(files, path);
        if (!target) {
          throw new Error(`Patch target is not in the active workspace: ${path}`);
        }
        const result = applyUnifiedPatchToText(target.text, patch.unifiedDiff);
        if (!result.ok) {
          throw new Error(result.error);
        }
        const nextFiles = updateWorkspaceTextFile(files, path, result.text);
        setFiles(nextFiles);
        if (activeProject) {
          await writeWorkspaceText(activeProject.workspaceUri, path, result.text);
        }
        setPatchDecision("accepted");
        setActivePath(path);
        setChatMessages((current) => [...current, { role: "agent", text: `Patch applied to ${path}.` }]);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "unknown patch error";
        setError(message);
        setPatchDecision("pending");
      }
    },
    [activeProject, files, patch],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProject,
      files,
      activePath,
      activeFile,
      session,
      job,
      patch,
      artifacts,
      runnerLogs,
      chatMessages,
      flowStatus,
      patchDecision,
      error,
      createSampleProject,
      openProject,
      setActivePath,
      updateActiveFile,
      saveActiveFile,
      runRunnerFlow,
      applyPatchDecision,
      clearError: () => setError(null),
    }),
    [
      projects,
      activeProject,
      files,
      activePath,
      activeFile,
      session,
      job,
      patch,
      artifacts,
      runnerLogs,
      chatMessages,
      flowStatus,
      patchDecision,
      error,
      createSampleProject,
      openProject,
      updateActiveFile,
      saveActiveFile,
      runRunnerFlow,
      applyPatchDecision,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used inside ProjectProvider");
  }
  return context;
}

function cloneSampleFiles(): WorkspaceTextFile[] {
  return sampleWorkspaceFiles.map((file) => ({ ...file }));
}

function upsertProject(projects: MobileProject[], project: MobileProject): MobileProject[] {
  const existing = projects.some((candidate) => candidate.id === project.id);
  if (existing) {
    return projects.map((candidate) => (candidate.id === project.id ? project : candidate));
  }
  return [project, ...projects];
}
