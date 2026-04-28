import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { applyPatchProposalToTextWorkspace, normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type {
  BuildArtifact,
  BuildJobRequest,
  GitChangeSummary,
  GitCommitResult,
  GitPushResult,
  GitRepositorySummary,
  MobileProject,
  MobileSession,
  PatchProposal,
  PullRequestPlan,
  RunnerCapabilitiesResponse,
  RunnerJob,
  SandboxCommandKind,
} from "@codex/mobile-protocol";
import { fakeGitWorkspaceFiles, findWorkspaceTextFile, makeProjectSnapshot, sampleWorkspaceFiles, updateWorkspaceTextFile } from "@/file/sample-files";
import type { WorkspaceTextFile } from "@/file/sample-files";
import { createSampleWorkspaceProject } from "@/file/sample-workspace";
import { deleteWorkspacePath, ensureAppWorkspace, writeWorkspaceText } from "@/file/workspace-provider";
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
  runnerCapabilities: RunnerCapabilitiesResponse | null;
  gitRepositories: GitRepositorySummary[];
  gitStatus: GitChangeSummary[];
  gitCommitResult: GitCommitResult | null;
  gitPushResult: GitPushResult | null;
  pullRequestPlan: PullRequestPlan | null;
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
  runBuildJob(commandKind: SandboxCommandKind): Promise<RunnerFlowResult | null>;
  refreshRunnerCapabilities(): Promise<void>;
  refreshGitRepositories(): Promise<void>;
  importGitHubRepository(owner: string, repo: string, branch?: string): Promise<MobileProject | null>;
  commitActiveWorkspace(message: string): Promise<GitCommitResult | null>;
  pushActiveBranch(): Promise<GitPushResult | null>;
  createPullRequestPlan(): Promise<PullRequestPlan | null>;
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
  const [runnerCapabilities, setRunnerCapabilities] = useState<RunnerCapabilitiesResponse | null>(null);
  const [gitRepositories, setGitRepositories] = useState<GitRepositorySummary[]>([]);
  const [gitStatus, setGitStatus] = useState<GitChangeSummary[]>([]);
  const [gitCommitResult, setGitCommitResult] = useState<GitCommitResult | null>(null);
  const [gitPushResult, setGitPushResult] = useState<GitPushResult | null>(null);
  const [pullRequestPlan, setPullRequestPlan] = useState<PullRequestPlan | null>(null);
  const [runnerLogs, setRunnerLogs] = useState<string[]>(["runner: idle"]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Open the sample project, edit files locally, then ask the runner for a safe build/test pass." },
  ]);
  const [flowStatus, setFlowStatus] = useState<RunnerFlowStatus>("idle");
  const [patchDecision, setPatchDecision] = useState<"pending" | "accepted" | "rejected">("pending");
  const [error, setError] = useState<string | null>(null);

  const activeFile = useMemo(() => findWorkspaceTextFile(files, activePath) ?? files[0] ?? null, [activePath, files]);

  const refreshRunnerCapabilities = useCallback(async () => {
    try {
      setRunnerCapabilities(await runnerClient.getCapabilities());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown runner capabilities error";
      setRunnerCapabilities(null);
      setRunnerLogs((current) => [...current, `runner capabilities unavailable: ${message}`]);
    }
  }, [runnerClient]);

  const refreshGitRepositories = useCallback(async () => {
    try {
      const capabilities = await runnerClient.getGitCapabilities();
      if (!capabilities.available || !capabilities.supportsRepoImport) {
        setGitRepositories([]);
        return;
      }
      setGitRepositories(await runnerClient.listGitRepositories());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown Git provider error";
      setGitRepositories([]);
      setRunnerLogs((current) => [...current, `git provider unavailable: ${message}`]);
    }
  }, [runnerClient]);

  useEffect(() => {
    void refreshRunnerCapabilities();
    void refreshGitRepositories();
  }, [refreshGitRepositories, refreshRunnerCapabilities]);

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
    setGitStatus([]);
    setGitCommitResult(null);
    setGitPushResult(null);
    setPullRequestPlan(null);
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
      markProjectDirty(activeProject?.id, setProjects, setActiveProject);
    },
    [activeFile, activeProject],
  );

  const saveActiveFile = useCallback(async () => {
    if (!activeProject || !activeFile) {
      return;
    }
    await writeWorkspaceText(activeProject.workspaceUri, activeFile.path, activeFile.text);
    setRunnerLogs((current) => [...current, `workspace: saved ${activeFile.path}`]);
    markProjectDirty(activeProject.id, setProjects, setActiveProject);
  }, [activeFile, activeProject]);

  const importGitHubRepository = useCallback(
    async (owner: string, repo: string, branch?: string): Promise<MobileProject | null> => {
      setError(null);
      try {
        await refreshRunnerCapabilities();
        const projectId = `github-${owner}-${repo}`;
        const workspaceUri = await ensureAppWorkspace(projectId);
        const created = await runnerClient.createSession({
          projectId,
          projectName: `${owner}/${repo}`,
          sourceKind: "github",
        });
        const imported = await runnerClient.importGitHubRepository(created.session.id, { owner, repo, branch });
        const featureBranch = await runnerClient.createGitBranch(created.session.id, `codex/mobile-${created.session.id}`);
        const importedFiles = cloneFakeGitFiles();
        await Promise.all(importedFiles.map((file) => writeWorkspaceText(workspaceUri, file.path, file.text)));
        const project: MobileProject = {
          id: projectId,
          name: imported.repository.fullName,
          sourceKind: "github",
          workspaceUri,
          lastOpenedAt: new Date().toISOString(),
          runnerSessionId: created.session.id,
          workspaceSource: {
            ...imported.workspaceSource,
            branch: featureBranch.name,
          },
          branchName: featureBranch.name,
          dirty: false,
        };
        setProjects((current) => upsertProject(current, project));
        setActiveProject(project);
        setFiles(importedFiles);
        setActivePath("src/App.tsx");
        setSession(created.session);
        setJob(null);
        setPatch(null);
        setArtifacts([]);
        setGitStatus([]);
        setGitCommitResult(null);
        setGitPushResult(null);
        setPullRequestPlan(null);
        setRunnerLogs((current) => [
          ...current,
          `git: imported ${imported.repository.fullName} from ${imported.branch.name}`,
          `git: created feature branch ${featureBranch.name}`,
        ]);
        return project;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "unknown Git import error";
        setError(message);
        setRunnerLogs((current) => [...current, `git import error: ${message}`]);
        return null;
      }
    },
    [refreshRunnerCapabilities, runnerClient],
  );

  const runRunnerFlow = useCallback(
    async (prompt: string): Promise<RunnerFlowResult | null> => {
      setError(null);
      setPatchDecision("pending");
      setFlowStatus("syncing");
      setRunnerLogs(["runner: creating or reusing session"]);
      setChatMessages((current) => [...current, { role: "user", text: prompt }]);

      try {
        await refreshRunnerCapabilities();
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
          prompt,
        });
        setJob(started.job);
        setChatMessages((current) => [
          ...current,
          { role: "agent", text: `Remote runner job started in ${started.job.mode} mode.` },
        ]);

        const events = await runnerClient.streamJobLogs(currentSession.id, started.job.id, (event) => {
          if (event.type === "runner.log") {
            const line = `[${event.stream}] ${event.message}`;
            setRunnerLogs((current) => [...current, line]);
            setChatMessages((current) => [...current, { role: "agent", text: line }]);
          } else if (event.type === "runner.jobStatus") {
            setJob(event.job);
          } else if (event.type === "runner.patch") {
            setChatMessages((current) => [...current, { role: "agent", text: `Patch update: ${event.summary}` }]);
          } else if (event.type === "runner.approvalRequest") {
            setChatMessages((current) => [...current, { role: "agent", text: `Approval required but not implemented: ${event.summary}` }]);
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
    [activeProject, createSampleProject, files, refreshRunnerCapabilities, runnerClient, session],
  );

  const runBuildJob = useCallback(
    async (commandKind: SandboxCommandKind): Promise<RunnerFlowResult | null> => {
      setError(null);
      setPatchDecision("pending");
      setPatch(null);
      setArtifacts([]);
      setFlowStatus("syncing");
      setRunnerLogs([`runner: preparing ${commandKind}`]);

      try {
        await refreshRunnerCapabilities();
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
        const started = await runnerClient.startJob(currentSession.id, {
          kind: runnerKindForSandboxCommand(commandKind),
          command: ["sandbox", commandKind],
        });
        const buildRequest: BuildJobRequest = {
          commandKind,
          artifactPaths: ["dist", "build", "coverage", "test-results", "mobile-build-output"],
        };
        const build = await runnerClient.startBuildJob(currentSession.id, started.job.id, buildRequest);
        setJob(build.job);
        setFlowStatus("running");
        setChatMessages((current) => [
          ...current,
          { role: "user", text: `Run ${commandKind} in the runner sandbox.` },
          { role: "agent", text: `Sandbox job started on ${build.job.sandboxBackend ?? "unknown"} backend.` },
        ]);

        const streamedArtifacts: BuildArtifact[] = [];
        const events = await runnerClient.streamJobLogs(currentSession.id, started.job.id, (event) => {
          if (event.type === "runner.log") {
            const line = `[${event.stream}] ${event.message}`;
            setRunnerLogs((current) => [...current, line]);
          } else if (event.type === "runner.jobStatus") {
            setJob(event.job);
          } else if (event.type === "runner.artifact") {
            streamedArtifacts.push(event.artifact);
            setArtifacts((current) => upsertArtifact(current, event.artifact));
          }
        });

        const latestJob = getLatestJob(events) ?? (await runnerClient.getJob(currentSession.id, started.job.id)).job;
        const artifactResponse = await runnerClient.getArtifacts(currentSession.id);
        const nextArtifacts = artifactResponse.artifacts.length > 0 ? artifactResponse.artifacts : streamedArtifacts;
        setJob(latestJob);
        setArtifacts(nextArtifacts);
        setFlowStatus(latestJob.status === "succeeded" ? "succeeded" : "failed");
        setChatMessages((current) => [
          ...current,
          {
            role: "agent",
            text: `Sandbox ${commandKind} finished with status ${latestJob.status}${latestJob.exitCode === undefined ? "" : `, exit ${latestJob.exitCode}`}.`,
          },
        ]);
        return {
          job: latestJob,
          patch: null,
          artifacts: nextArtifacts,
          events,
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "unknown sandbox runner error";
        setError(message);
        setFlowStatus("failed");
        setRunnerLogs((current) => [...current, `sandbox error: ${message}`]);
        setChatMessages((current) => [...current, { role: "agent", text: `Sandbox error: ${message}` }]);
        return null;
      }
    },
    [activeProject, createSampleProject, files, refreshRunnerCapabilities, runnerClient, session],
  );

  const commitActiveWorkspace = useCallback(
    async (message: string): Promise<GitCommitResult | null> => {
      setError(null);
      if (!activeProject || !session) {
        setError("Import or open a runner-backed project before committing.");
        return null;
      }
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        setError("Commit message is required.");
        return null;
      }
      try {
        await runnerClient.uploadSnapshot(session.id, makeProjectSnapshot(files));
        const changes = await runnerClient.getGitStatus(session.id);
        setGitStatus(changes);
        const result = await runnerClient.commitGitChanges(session.id, {
          message: trimmedMessage,
          branchName: activeProject.branchName ?? `codex/mobile-${session.id}`,
        });
        setGitCommitResult(result);
        setGitPushResult(null);
        setPullRequestPlan(null);
        setProjects((current) =>
          current.map((project) =>
            project.id === activeProject.id
              ? withGitCommitMetadata(project, result)
              : project,
          ),
        );
        setActiveProject((current) =>
          current && current.id === activeProject.id
            ? withGitCommitMetadata(current, result)
            : current,
        );
        setRunnerLogs((current) => [...current, `git: committed ${result.changedFiles.length} file(s) to ${result.branchName}`]);
        return result;
      } catch (caught) {
        const errorMessage = caught instanceof Error ? caught.message : "unknown Git commit error";
        setError(errorMessage);
        setRunnerLogs((current) => [...current, `git commit error: ${errorMessage}`]);
        return null;
      }
    },
    [activeProject, files, runnerClient, session],
  );

  const pushActiveBranch = useCallback(async (): Promise<GitPushResult | null> => {
    setError(null);
    if (!activeProject || !session) {
      setError("Import or open a runner-backed project before pushing.");
      return null;
    }
    const branchName = activeProject.branchName ?? activeProject.workspaceSource?.branch;
    if (!branchName) {
      setError("Create or select a feature branch before pushing.");
      return null;
    }
    try {
      const result = await runnerClient.pushGitBranch(session.id, { branchName, force: false });
      setGitPushResult(result);
      setRunnerLogs((current) => [...current, `git: pushed ${result.branchName}`]);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown Git push error";
      setError(message);
      setRunnerLogs((current) => [...current, `git push error: ${message}`]);
      return null;
    }
  }, [activeProject, runnerClient, session]);

  const createPullRequestPlan = useCallback(async (): Promise<PullRequestPlan | null> => {
    setError(null);
    if (!session) {
      setError("Import or open a runner-backed project before preparing a PR plan.");
      return null;
    }
    try {
      const plan = await runnerClient.createPullRequestPlan(session.id);
      setPullRequestPlan(plan);
      setRunnerLogs((current) => [...current, `git: prepared PR plan for ${plan.headBranch}`]);
      return plan;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown PR plan error";
      setError(message);
      setRunnerLogs((current) => [...current, `git PR plan error: ${message}`]);
      return null;
    }
  }, [runnerClient, session]);

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
      if (patch.files.length === 0 || patch.status === "none") {
        setError("No file changes were produced.");
        return;
      }
      if (patch.status === "unsupported" || (patch.unsupportedChanges ?? 0) > 0) {
        setError("This patch includes unsupported changes and cannot be applied on mobile yet.");
        return;
      }
      try {
        const result = applyPatchProposalToTextWorkspace(files, patch, { workspaceRootPresent: activeProject !== null });
        if (!result.ok) {
          throw new Error(result.error);
        }
        const changedPaths = new Set(patch.files.map((change) => normalizeWorkspaceRelativePath(change.changeKind === "deleted" ? change.oldPath : change.newPath)));
        setFiles(result.files);
        if (activeProject) {
          for (const workspaceFile of result.files) {
            if (changedPaths.has(workspaceFile.path)) {
              await writeWorkspaceText(activeProject.workspaceUri, workspaceFile.path, workspaceFile.text);
            }
          }
          for (const backup of result.backups) {
            if (!result.files.some((workspaceFile) => workspaceFile.path === backup.path)) {
              await deleteWorkspacePath(activeProject.workspaceUri, backup.path);
            }
          }
        }
        markProjectDirty(activeProject?.id, setProjects, setActiveProject);
        setPatchDecision("accepted");
        setActivePath(result.files.find((file) => changedPaths.has(file.path))?.path ?? activePath);
        setChatMessages((current) => [...current, { role: "agent", text: `Patch applied to ${changedPaths.size} file(s).` }]);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "unknown patch error";
        setError(message);
        setPatchDecision("pending");
      }
    },
    [activePath, activeProject, files, patch],
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
      runnerCapabilities,
      gitRepositories,
      gitStatus,
      gitCommitResult,
      gitPushResult,
      pullRequestPlan,
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
      runBuildJob,
      refreshRunnerCapabilities,
      refreshGitRepositories,
      importGitHubRepository,
      commitActiveWorkspace,
      pushActiveBranch,
      createPullRequestPlan,
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
      runnerCapabilities,
      gitRepositories,
      gitStatus,
      gitCommitResult,
      gitPushResult,
      pullRequestPlan,
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
      runBuildJob,
      refreshRunnerCapabilities,
      refreshGitRepositories,
      importGitHubRepository,
      commitActiveWorkspace,
      pushActiveBranch,
      createPullRequestPlan,
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

function cloneFakeGitFiles(): WorkspaceTextFile[] {
  return fakeGitWorkspaceFiles.map((file) => ({ ...file }));
}

function upsertProject(projects: MobileProject[], project: MobileProject): MobileProject[] {
  const existing = projects.some((candidate) => candidate.id === project.id);
  if (existing) {
    return projects.map((candidate) => (candidate.id === project.id ? project : candidate));
  }
  return [project, ...projects];
}

function upsertArtifact(artifacts: BuildArtifact[], artifact: BuildArtifact): BuildArtifact[] {
  const existing = artifacts.some((candidate) => candidate.id === artifact.id);
  if (existing) {
    return artifacts.map((candidate) => (candidate.id === artifact.id ? artifact : candidate));
  }
  return [...artifacts, artifact];
}

function markProjectDirty(
  projectId: string | undefined,
  setProjects: Dispatch<SetStateAction<MobileProject[]>>,
  setActiveProject: Dispatch<SetStateAction<MobileProject | null>>,
): void {
  if (!projectId) {
    return;
  }
  setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, dirty: true } : project)));
  setActiveProject((current) => (current && current.id === projectId ? { ...current, dirty: true } : current));
}

function withGitCommitMetadata(project: MobileProject, result: GitCommitResult): MobileProject {
  return {
    ...project,
    branchName: result.branchName,
    workspaceSource: {
      kind: project.workspaceSource?.kind ?? project.sourceKind,
      repository: project.workspaceSource?.repository,
      branch: result.branchName,
      commitSha: result.commitSha,
    },
    dirty: false,
  };
}

function runnerKindForSandboxCommand(commandKind: SandboxCommandKind): "build" | "test" {
  return commandKind.endsWith("_test") ? "test" : "build";
}
