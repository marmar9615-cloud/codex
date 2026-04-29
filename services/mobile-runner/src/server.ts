import {
  assertBuildArtifact,
  assertBuildJobRequest,
  assertBuildJobResult,
  assertCreateSessionRequest,
  assertGitCommitRequest,
  assertGitImportRequest,
  assertGitPushRequest,
  assertGitRepositorySummary,
  assertGitCapabilities,
  assertPatchProposal,
  assertReceivePatchRequest,
  assertRunnerCapabilitiesResponse,
  assertRunnerJob,
  assertStartJobRequest,
  assertUploadSnapshotRequest,
  normalizeWorkspaceRelativePath,
  parseUnifiedDiffToPatchProposal,
} from "@codex/mobile-protocol";
import type {
  ArtifactListResponse,
  BuildJobRequest,
  BuildJobResult,
  BuildArtifact,
  CreateSessionResponse,
  GitBranchSummary,
  GitCapabilities,
  GitChangeSummary,
  GitCommitResult,
  GitImportResult,
  GitPushResult,
  GitRepositorySummary,
  GetJobResponse,
  GetPatchResponse,
  GetSessionResponse,
  MobileSession,
  PatchProposal,
  PullRequestPlan,
  ProjectSnapshot,
  ReceivePatchResponse,
  RunnerCapabilitiesResponse,
  RunnerError,
  RunnerJob,
  RunnerLogEvent,
  SandboxCommandKind,
  StartBuildJobResponse,
  StartJobResponse,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";
import http from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexAppServerBridge } from "./codex/CodexAppServerBridge.js";
import { CodexAppServerBridgeError } from "./codex/AppServerProcessManager.js";
import {
  capabilitiesFromConfig,
  getCodexBridgePreflightError,
  getCloudRunnerPreflightError,
  getGitProviderPreflightError,
  getSandboxPreflightError,
  loadMobileRunnerConfig,
} from "./config.js";
import type { MobileRunnerConfig } from "./config.js";
import { sanitizeForRunnerLog } from "./codex/jsonRpc.js";
import { DevAuthProvider } from "./auth/DevAuthProvider.js";
import { createAuthPolicy, RunnerAuthPolicyError } from "./auth/AuthPolicy.js";
import { InMemoryArtifactStore } from "./cloud/ArtifactStore.js";
import { InMemoryAuditLogStore } from "./cloud/AuditLogStore.js";
import { CloudJobDispatcher } from "./cloud/CloudJobDispatcher.js";
import { FakeCloudRunnerProvider } from "./cloud/FakeCloudRunnerProvider.js";
import { QuotaPolicyError } from "./cloud/QuotaPolicy.js";
import { FakeGitProvider } from "./git/FakeGitProvider.js";
import { GitProviderError } from "./git/GitProvider.js";
import { GitSecurityPolicyError, assertFeatureBranch } from "./git/GitSecurityPolicy.js";
import { GitHubAppProvider } from "./git/GitHubAppProvider.js";
import { materializeGitSnapshot } from "./git/GitWorkspaceManager.js";
import { LocalGitCliProvider } from "./git/LocalGitCliProvider.js";
import { FakeSandboxBackend } from "./sandbox/FakeSandboxBackend.js";
import { LocalDockerSandboxBackend } from "./sandbox/LocalDockerSandboxBackend.js";
import { resolveSandboxCommand } from "./sandbox/SandboxCommandPolicy.js";
import { SandboxBackendError } from "./sandbox/SandboxBackend.js";
import type { ResolvedSandboxCommand } from "./sandbox/SandboxCommandPolicy.js";
import type { SandboxBackend, SandboxCommandSpec } from "./sandbox/SandboxBackend.js";
import type { CloudRunnerProvider } from "./cloud/CloudRunnerProvider.js";
import type { GitProvider } from "./git/GitProvider.js";
import type { RunnerAuthProvider } from "./auth/RunnerAuth.js";

type ServerState = {
  sessions: Map<string, MobileSession>;
  snapshots: Map<string, ProjectSnapshot>;
  jobs: Map<string, RunnerJob>;
  artifacts: Map<string, BuildArtifact[]>;
  patches: Map<string, PatchProposal>;
  workspaces: Map<string, string>;
  jobPrompts: Map<string, string>;
  sandboxBuildRequests: Map<string, ResolvedSandboxCommand>;
  sandboxBuildResults: Map<string, BuildJobResult>;
  gitProvider: GitProvider;
  cloudProvider: CloudRunnerProvider;
  cloudDispatcher: CloudJobDispatcher;
  auditLog: InMemoryAuditLogStore;
  artifactStore: InMemoryArtifactStore;
  authProvider: RunnerAuthProvider;
  config: MobileRunnerConfig;
  nextSession: number;
  nextJob: number;
  nextPatch: number;
  nextArtifact: number;
};

export type MobileRunnerServerOptions = {
  now?: () => string;
  config?: MobileRunnerConfig;
};

export type StartMobileRunnerOptions = MobileRunnerServerOptions & {
  port?: number;
  host?: string;
};

export function createMobileRunnerServer(options: MobileRunnerServerOptions = {}): http.Server {
  const now = options.now ?? (() => new Date().toISOString());
  const config = options.config ?? loadMobileRunnerConfig();
  const cloudProvider = createCloudRunnerProvider(config);
  const state: ServerState = {
    sessions: new Map(),
    snapshots: new Map(),
    jobs: new Map(),
    artifacts: new Map(),
    patches: new Map(),
    workspaces: new Map(),
    jobPrompts: new Map(),
    sandboxBuildRequests: new Map(),
    sandboxBuildResults: new Map(),
    gitProvider: createGitProvider(config),
    cloudProvider,
    cloudDispatcher: new CloudJobDispatcher(cloudProvider, config.cloudLimits),
    auditLog: new InMemoryAuditLogStore(),
    artifactStore: new InMemoryArtifactStore(),
    authProvider: new DevAuthProvider(),
    config,
    nextSession: 1,
    nextJob: 1,
    nextPatch: 1,
    nextArtifact: 1,
  };

  return http.createServer(async (request, response) => {
    if (state.config.runnerAuthMode === "dev") {
      applyDevCorsHeaders(response);
    }
    if (request.method === "OPTIONS" && state.config.runnerAuthMode === "dev") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      await routeRequest(request, response, state, now);
    } catch (error) {
      const status = errorStatus(error);
      const code = errorCode(error);
      const message = error instanceof Error ? sanitizeForRunnerLog(error.message) : "unknown runner error";
      writeJson<RunnerError>(response, status, {
        error: message,
        code,
        sessionId: error instanceof HttpError ? error.sessionId : undefined,
        jobId: error instanceof HttpError ? error.jobId : undefined,
      });
    }
  });
}

function applyDevCorsHeaders(response: http.ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-request-id");
}

export async function startMobileRunner(
  options: StartMobileRunnerOptions = {},
): Promise<{ server: http.Server; url: string }> {
  const server = createMobileRunnerServer(options);
  const port = options.port ?? 8787;
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}` };
}

async function routeRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  state: ServerState,
  now: () => string,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = normalizeApiPath(url.pathname);
  const authPolicy = createAuthPolicy(state.config.runnerAuthMode);
  const identity = authPolicy.authenticate(state.authProvider, request.headers);

  if (request.method === "GET" && path === "/healthz") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && path === "/capabilities") {
    writeJson<RunnerCapabilitiesResponse>(response, 200, capabilitiesForState(state));
    return;
  }

  if (request.method === "GET" && path === "/git/capabilities") {
    writeJson<GitCapabilities>(response, 200, assertGitCapabilities(state.gitProvider.capabilities()));
    return;
  }

  if (request.method === "GET" && path === "/git/repositories") {
    writeJson<{ repositories: GitRepositorySummary[] }>(response, 200, {
      repositories: (await state.gitProvider.listRepositories()).map(assertGitRepositorySummary),
    });
    return;
  }

  const branchesMatch = /^\/git\/repositories\/([^/]+)\/([^/]+)\/branches$/.exec(path);
  if (request.method === "GET" && branchesMatch) {
    writeJson<{ branches: GitBranchSummary[] }>(response, 200, {
      branches: await state.gitProvider.listBranches(decodeURIComponent(branchesMatch[1] ?? ""), decodeURIComponent(branchesMatch[2] ?? "")),
    });
    return;
  }

  if (request.method === "POST" && path === "/sessions") {
    const params = assertCreateSessionRequest(await readJson(request));
    const timestamp = now();
    const session: MobileSession = {
      id: formatId("mrs", state.nextSession++),
      projectId: params.projectId,
      projectName: params.projectName,
      sourceKind: params.sourceKind,
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
      snapshotVersion: 0,
    };
    state.sessions.set(session.id, session);
    state.auditLog.record(
      {
        type: "session.created",
        sessionId: session.id,
        actorId: identity.actorId,
        message: `Created mobile runner session for ${params.projectName}`,
      },
      now,
    );
    writeJson<CreateSessionResponse>(response, 201, { session });
    return;
  }

  const sessionMatch = /^\/sessions\/([^/]+)$/.exec(path);
  if (request.method === "GET" && sessionMatch) {
    const session = requireSession(state, sessionMatch[1] ?? "");
    writeJson<GetSessionResponse>(response, 200, { session });
    return;
  }

  const gitImportMatch = /^\/sessions\/([^/]+)\/import\/github$/.exec(path);
  if (request.method === "POST" && gitImportMatch) {
    const session = requireSession(state, gitImportMatch[1] ?? "");
    const params = assertGitImportRequest(await readJson(request));
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    const result = await state.gitProvider.importRepository({ sessionId: session.id, workspaceRoot }, params);
    validateSnapshotPaths(result.snapshot, state.config.resourceLimits.maxWorkspaceBytes);
    await materializeGitSnapshot(workspaceRoot, result.snapshot);
    state.snapshots.set(session.id, result.snapshot);
    const updated: MobileSession = {
      ...session,
      sourceKind: "github",
      status: "ready",
      updatedAt: now(),
      snapshotVersion: (session.snapshotVersion ?? 0) + 1,
    };
    state.sessions.set(session.id, updated);
    state.auditLog.record(
      {
        type: "repo.imported",
        sessionId: session.id,
        actorId: identity.actorId,
        message: `Imported ${result.repository.fullName} into runner workspace`,
        metadata: { provider: state.gitProvider.mode, branch: result.branch.name },
      },
      now,
    );
    const publicResult: GitImportResult = {
      sessionId: result.sessionId,
      repository: result.repository,
      branch: result.branch,
      workspaceSource: result.workspaceSource,
      importedFiles: result.importedFiles,
    };
    writeJson<GitImportResult>(response, 201, publicResult);
    return;
  }

  const gitBranchMatch = /^\/sessions\/([^/]+)\/git\/branch$/.exec(path);
  if (request.method === "POST" && gitBranchMatch) {
    const session = requireSession(state, gitBranchMatch[1] ?? "");
    const body = expectRequestRecord(await readJson(request));
    const branchName = assertFeatureBranch(expectRequestString(body.branchName, "branchName"));
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    writeJson<{ branch: GitBranchSummary }>(response, 201, {
      branch: await state.gitProvider.createBranch({ sessionId: session.id, workspaceRoot }, branchName),
    });
    return;
  }

  const gitStatusMatch = /^\/sessions\/([^/]+)\/git\/status$/.exec(path);
  if (request.method === "GET" && gitStatusMatch) {
    const session = requireSession(state, gitStatusMatch[1] ?? "");
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    writeJson<{ changes: GitChangeSummary[] }>(response, 200, {
      changes: await state.gitProvider.status({ sessionId: session.id, workspaceRoot }, state.snapshots.get(session.id)?.files.map((file) => file.path) ?? []),
    });
    return;
  }

  const gitCommitMatch = /^\/sessions\/([^/]+)\/git\/commit$/.exec(path);
  if (request.method === "POST" && gitCommitMatch) {
    const session = requireSession(state, gitCommitMatch[1] ?? "");
    const params = assertGitCommitRequest(await readJson(request));
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    const changes = await state.gitProvider.status({ sessionId: session.id, workspaceRoot }, state.snapshots.get(session.id)?.files.map((file) => file.path) ?? []);
    const result = await state.gitProvider.commit({ sessionId: session.id, workspaceRoot }, params, changes);
    state.auditLog.record(
      {
        type: "commit.created",
        sessionId: session.id,
        actorId: identity.actorId,
        message: `Created commit on ${result.branchName}`,
        metadata: { provider: state.gitProvider.mode, commitSha: result.commitSha },
      },
      now,
    );
    writeJson<GitCommitResult>(response, 201, result);
    return;
  }

  const gitPushMatch = /^\/sessions\/([^/]+)\/git\/push$/.exec(path);
  if (request.method === "POST" && gitPushMatch) {
    const session = requireSession(state, gitPushMatch[1] ?? "");
    const params = assertGitPushRequest(await readJson(request));
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    state.auditLog.record(
      {
        type: "push.requested",
        sessionId: session.id,
        actorId: identity.actorId,
        message: `Push requested for ${params.branchName}`,
        metadata: { provider: state.gitProvider.mode },
      },
      now,
    );
    try {
      const result = await state.gitProvider.push({ sessionId: session.id, workspaceRoot }, params);
      state.auditLog.record(
        {
          type: "push.completed",
          sessionId: session.id,
          actorId: identity.actorId,
          message: `Pushed branch ${result.branchName}`,
          metadata: { provider: state.gitProvider.mode },
        },
        now,
      );
      writeJson<GitPushResult>(response, 201, result);
      return;
    } catch (caught) {
      state.auditLog.record(
        {
          type: "push.failed",
          sessionId: session.id,
          actorId: identity.actorId,
          message: caught instanceof Error ? sanitizeForRunnerLog(caught.message) : "Push failed",
          metadata: { provider: state.gitProvider.mode },
        },
        now,
      );
      throw caught;
    }
  }

  const gitPrPlanMatch = /^\/sessions\/([^/]+)\/git\/pr-plan$/.exec(path);
  if (request.method === "POST" && gitPrPlanMatch) {
    const session = requireSession(state, gitPrPlanMatch[1] ?? "");
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    writeJson<PullRequestPlan>(response, 200, await state.gitProvider.pullRequestPlan({ sessionId: session.id, workspaceRoot }));
    return;
  }

  const snapshotMatch = /^\/sessions\/([^/]+)\/snapshots$/.exec(path);
  const legacySnapshotMatch = /^\/sessions\/([^/]+)\/snapshot$/.exec(path);
  if ((request.method === "POST" && snapshotMatch) || (request.method === "PUT" && legacySnapshotMatch)) {
    const sessionId = snapshotMatch?.[1] ?? legacySnapshotMatch?.[1] ?? "";
    const session = requireSession(state, sessionId);
    const params = assertUploadSnapshotRequest(await readJson(request));
    validateSnapshotPaths(params, state.config.resourceLimits.maxWorkspaceBytes);
    await materializeSnapshot(await ensureSessionWorkspace(state, session.id), params);
    state.snapshots.set(session.id, params);
    const updated = {
      ...session,
      status: "ready" as const,
      updatedAt: now(),
      snapshotVersion: (session.snapshotVersion ?? 0) + 1,
    };
    state.sessions.set(updated.id, updated);
    writeJson<UploadSnapshotResponse>(response, 200, {
      session: updated,
      acceptedFiles: params.files.length,
      acceptedDeletedPaths: params.deletedPaths?.length ?? 0,
    });
    return;
  }

  const jobCollectionMatch = /^\/sessions\/([^/]+)\/jobs$/.exec(path);
  if (request.method === "POST" && jobCollectionMatch) {
    const session = requireSession(state, jobCollectionMatch[1] ?? "");
    const params = assertStartJobRequest(await readJson(request));
    validateJobCwd(params.cwd);
    const preflightError = getCodexBridgePreflightError(state.config);
    if (preflightError) {
      throw new HttpError(503, "codex_app_server_unavailable", preflightError, session.id);
    }
    const timestamp = now();
    const job: RunnerJob = {
      id: formatId("mrj", state.nextJob++),
      sessionId: session.id,
      kind: params.kind,
      command: params.command,
      mode: state.config.runnerMode,
      appServerTransport: state.config.runnerMode === "codex-app-server" ? state.config.codexAppServerTransport : undefined,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.jobs.set(job.id, job);
    state.jobPrompts.set(job.id, params.prompt ?? promptFromCommand(params.command));
    state.sessions.set(session.id, { ...session, status: "running", updatedAt: timestamp });
    writeJson<StartJobResponse>(response, 202, {
      job,
      logStreamUrl: `/sessions/${session.id}/jobs/${job.id}/logs`,
    });
    return;
  }

  const jobMatch = /^\/sessions\/([^/]+)\/jobs\/([^/]+)$/.exec(path);
  if (request.method === "GET" && jobMatch) {
    requireSession(state, jobMatch[1] ?? "");
    const job = requireJob(state, jobMatch[2] ?? "", jobMatch[1] ?? "");
    writeJson<GetJobResponse>(response, 200, { job });
    return;
  }

  const buildMatch = /^\/sessions\/([^/]+)\/jobs\/([^/]+)\/builds$/.exec(path);
  if (request.method === "POST" && buildMatch) {
    const session = requireSession(state, buildMatch[1] ?? "");
    const job = requireJob(state, buildMatch[2] ?? "", session.id);
    const requestBody = assertBuildJobRequest(await readJson(request));
    const preflightError = getSandboxPreflightError(state.config);
    if (preflightError) {
      throw new HttpError(503, "sandbox_backend_unavailable", preflightError, session.id, job.id);
    }
    const resolved = resolveBuildRequest(requestBody, state.config);
    state.sandboxBuildRequests.set(job.id, resolved);
    const updated = assertRunnerJob({
      ...job,
      sandboxBackend: state.config.sandboxBackend,
      sandboxCommandKind: resolved.commandKind,
      updatedAt: now(),
    });
    state.jobs.set(job.id, updated);
    writeJson<StartBuildJobResponse>(response, 202, {
      job: updated,
      logStreamUrl: `/sessions/${session.id}/jobs/${job.id}/logs`,
    });
    return;
  }

  const logsMatch = /^\/sessions\/([^/]+)\/jobs\/([^/]+)\/logs$/.exec(path);
  if (request.method === "GET" && logsMatch) {
    const session = requireSession(state, logsMatch[1] ?? "");
    const job = requireJob(state, logsMatch[2] ?? "", session.id);
    if (state.sandboxBuildRequests.has(job.id)) {
      await streamSandboxBuildLogs(response, state, session, job, now);
    } else if (job.mode === "codex-app-server") {
      await streamCodexAppServerLogs(response, state, session, job, now);
    } else {
      await streamFakeLogs(response, state, session, job, now);
    }
    return;
  }

  const patchMatch = /^\/sessions\/([^/]+)\/patch$/.exec(path);
  if (request.method === "GET" && patchMatch) {
    const session = requireSession(state, patchMatch[1] ?? "");
    writeJson<GetPatchResponse>(response, 200, {
      patch: state.patches.get(session.id) ?? null,
    });
    return;
  }

  const legacyPatchMatch = /^\/sessions\/([^/]+)\/patches$/.exec(path);
  if (request.method === "POST" && legacyPatchMatch) {
    const session = requireSession(state, legacyPatchMatch[1] ?? "");
    const params = assertReceivePatchRequest(await readJson(request));
    const patch = assertPatchProposal({
      id: params.patchId ?? formatId("mrp", state.nextPatch++),
      sessionId: session.id,
      summary: params.summary ?? "Accepted patch proposal",
      unifiedDiff: params.unifiedDiff,
      files: [],
      createdAt: now(),
    });
    state.patches.set(session.id, patch);
    writeJson<ReceivePatchResponse>(response, 202, {
      patchId: patch.id,
      accepted: true,
      filesChanged: countFilesChanged(params.unifiedDiff),
    });
    return;
  }

  const artifactsMatch = /^\/sessions\/([^/]+)\/artifacts$/.exec(path);
  if (request.method === "POST" && artifactsMatch) {
    const session = requireSession(state, artifactsMatch[1] ?? "");
    const artifact = createArtifactFromRequest(state, session.id, await readJson(request), now());
    appendArtifact(state, session.id, artifact);
    writeJson(response, 201, { artifact });
    return;
  }
  if (request.method === "GET" && artifactsMatch) {
    const session = requireSession(state, artifactsMatch[1] ?? "");
    writeJson<ArtifactListResponse>(response, 200, {
      artifacts: state.artifacts.get(session.id) ?? [],
    });
    return;
  }

  throw new HttpError(404, "not_found", "not found");
}

async function streamFakeLogs(
  response: http.ServerResponse,
  state: ServerState,
  session: MobileSession,
  job: RunnerJob,
  now: () => string,
): Promise<void> {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const running = assertRunnerJob({ ...job, status: "running", updatedAt: now() });
  state.jobs.set(job.id, running);

  const messages = [
    "mobile-runner accepted project snapshot",
    `mobile-runner executing deterministic fake command: ${job.command.join(" ")}`,
    "codex fake agent inspected src/App.tsx",
    "codex fake agent proposed one patch",
    "fake build/test completed successfully",
  ];

  for (let index = 0; index < messages.length; index += 1) {
    const event: RunnerLogEvent = {
      type: "runner.log",
      sessionId: session.id,
      jobId: job.id,
      sequence: index + 1,
      stream: index === 2 ? "stderr" : "stdout",
      level: index === 2 ? "warn" : "info",
      message: messages[index] ?? "",
      createdAt: now(),
    };
    response.write("event: log\n");
    response.write(`data: ${JSON.stringify(event)}\n\n`);
    await delay(5);
  }

  const completed = assertRunnerJob({ ...running, status: "succeeded", updatedAt: now() });
  state.jobs.set(job.id, completed);
  state.sessions.set(session.id, { ...session, status: "ready", updatedAt: completed.updatedAt });
  const patch = createFakePatch(state, session.id, now());
  state.patches.set(session.id, patch);
  appendArtifact(state, session.id, createFakeArtifact(state, session.id, job.id, now()));

  response.write("event: patch\n");
  response.write(`data: ${JSON.stringify(patchEventFromProposal(patch))}\n\n`);
  response.write("event: jobStatus\n");
  response.write(`data: ${JSON.stringify({ type: "runner.jobStatus", sessionId: session.id, job: completed })}\n\n`);
  response.end();
}

async function streamSandboxBuildLogs(
  response: http.ServerResponse,
  state: ServerState,
  session: MobileSession,
  job: RunnerJob,
  now: () => string,
): Promise<void> {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const request = state.sandboxBuildRequests.get(job.id);
  if (!request) {
    throw new HttpError(404, "build_request_not_found", `unknown build request for job: ${job.id}`, session.id, job.id);
  }

  const running = assertRunnerJob({
    ...job,
    status: "running",
    sandboxBackend: state.config.sandboxBackend,
    sandboxCommandKind: request.commandKind,
    updatedAt: now(),
  });
  state.jobs.set(job.id, running);

  let sequence = 0;
  const backend = createSandboxBackend(state.config);
  try {
    const workspaceRoot = await ensureSessionWorkspace(state, session.id);
    const spec: SandboxCommandSpec = {
      sessionId: session.id,
      jobId: job.id,
      workspaceRoot,
      backend: state.config.sandboxBackend,
      commandKind: request.commandKind,
      command: request.command,
      workingDirectory: request.workingDirectory,
      artifactPaths: request.artifactPaths,
      timeoutMs: request.timeoutMs,
      maxWorkspaceBytes: state.config.resourceLimits.maxWorkspaceBytes,
      maxLogBytes: request.maxLogBytes,
      maxArtifactBytes: request.maxArtifactBytes,
      networkMode: request.networkMode,
      createdAt: now(),
    };
    const result = assertBuildJobResult(
      await backend.runCommand(spec, {
        now,
        nextSequence: () => {
          sequence += 1;
          return sequence;
        },
        nextArtifactId: () => formatId("mra", state.nextArtifact++),
        onLog: (event) => writeSse(response, "log", event),
      }),
    );
    state.sandboxBuildResults.set(job.id, result);
    for (const artifact of result.artifacts) {
      appendArtifact(state, session.id, artifact);
      writeSse(response, "artifact", { type: "runner.artifact", sessionId: session.id, artifact });
    }
    const completed = assertRunnerJob({
      ...running,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      updatedAt: now(),
    });
    state.jobs.set(job.id, completed);
    state.sessions.set(session.id, { ...session, status: completed.status === "succeeded" ? "ready" : "failed", updatedAt: completed.updatedAt });
    writeSse(response, "jobStatus", { type: "runner.jobStatus", sessionId: session.id, job: completed });
  } catch (caught) {
    const code = caught instanceof SandboxBackendError ? caught.code : "sandbox_backend_unavailable";
    const status = caught instanceof SandboxBackendError ? caught.status : 500;
    const message = caught instanceof Error ? caught.message : "unknown sandbox backend failure";
    const failed = assertRunnerJob({
      ...running,
      status: "failed",
      sandboxBackend: state.config.sandboxBackend,
      sandboxCommandKind: request.commandKind,
      updatedAt: now(),
    });
    state.jobs.set(job.id, failed);
    state.sessions.set(session.id, { ...session, status: "failed", updatedAt: failed.updatedAt });
    writeSse<RunnerLogEvent>(response, "log", {
      type: "runner.log",
      sessionId: session.id,
      jobId: job.id,
      sequence: sequence + 1,
      stream: "stderr",
      level: "error",
      category: "error",
      message: `Sandbox backend failed (${code}, ${status}): ${sanitizeForRunnerLog(message)}`,
      createdAt: now(),
    });
    writeSse(response, "jobStatus", { type: "runner.jobStatus", sessionId: session.id, job: failed });
  } finally {
    await backend.cleanup(job.id);
    response.end();
  }
}

async function streamCodexAppServerLogs(
  response: http.ServerResponse,
  state: ServerState,
  session: MobileSession,
  job: RunnerJob,
  now: () => string,
): Promise<void> {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const running = assertRunnerJob({ ...job, status: "running", updatedAt: now() });
  state.jobs.set(job.id, running);

  try {
    const cwd = await ensureSessionWorkspace(state, session.id);
    const bridge = new CodexAppServerBridge({
      bin: state.config.codexAppServerBin,
      transport: state.config.codexAppServerTransport,
      timeoutMs: state.config.codexAppServerTimeoutMs,
      now,
    });
    const result = await bridge.runTurn({
      sessionId: session.id,
      jobId: job.id,
      cwd,
      prompt: state.jobPrompts.get(job.id) ?? promptFromCommand(job.command),
      onLogEvent: (event) => writeSse(response, "log", event),
      onDiffUpdate: (diff) => {
        const patch = createCodexAppServerPatch(state, session.id, job.id, diff, now());
        state.patches.set(session.id, patch);
        writeSse(response, "patch", patchEventFromProposal(patch));
      },
      onApprovalRequest: (event) => {
        const awaitingApproval = assertRunnerJob({ ...running, status: "awaitingApproval", updatedAt: now() });
        state.jobs.set(job.id, awaitingApproval);
        writeSse(response, "approvalRequest", event);
        writeSse(response, "jobStatus", { type: "runner.jobStatus", sessionId: session.id, job: awaitingApproval });
      },
    });
    const completed = assertRunnerJob({
      ...running,
      status: result.status,
      updatedAt: now(),
      appServerThreadId: result.appServerThreadId,
      appServerTurnId: result.appServerTurnId,
      appServerTransport: state.config.codexAppServerTransport,
    });
    state.jobs.set(job.id, completed);
    state.sessions.set(session.id, { ...session, status: completed.status === "succeeded" ? "ready" : "failed", updatedAt: completed.updatedAt });
    appendArtifact(state, session.id, createCodexAppServerArtifact(state, session.id, job.id, now()));
    writeSse(response, "jobStatus", { type: "runner.jobStatus", sessionId: session.id, job: completed });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown Codex app-server bridge failure";
    const code = caught instanceof CodexAppServerBridgeError ? caught.code : "codex_app_server_bridge_error";
    const failed = assertRunnerJob({ ...running, status: "failed", updatedAt: now(), appServerTransport: state.config.codexAppServerTransport });
    state.jobs.set(job.id, failed);
    state.sessions.set(session.id, { ...session, status: "failed", updatedAt: failed.updatedAt });
    writeSse<RunnerLogEvent>(response, "log", {
      type: "runner.log",
      sessionId: session.id,
      jobId: job.id,
      sequence: 1,
      stream: "stderr",
      level: "error",
      message: `Codex app-server bridge failed (${code}): ${message}`,
      createdAt: now(),
    });
    writeSse(response, "jobStatus", { type: "runner.jobStatus", sessionId: session.id, job: failed });
  } finally {
    response.end();
  }
}

function createFakePatch(state: ServerState, sessionId: string, timestamp: string): PatchProposal {
  return assertPatchProposal({
    id: formatId("mrp", state.nextPatch++),
    sessionId,
    source: "fake",
    summary: "Update the sample app title from Codex to Codex Mobile Runner.",
    unifiedDiff: `--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,6 +1,6 @@
 import React from "react";
 import { Text } from "react-native";
 
 export function App() {
-  return <Text>Codex</Text>;
+  return <Text>Codex Mobile Runner</Text>;
 }
`,
    files: [
      {
        oldPath: "src/App.tsx",
        newPath: "src/App.tsx",
        changeKind: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 6,
            newStart: 1,
            newLines: 6,
            lines: [
              { kind: "context", text: 'import React from "react";' },
              { kind: "context", text: 'import { Text } from "react-native";' },
              { kind: "context", text: "" },
              { kind: "context", text: "export function App() {" },
              { kind: "remove", text: "  return <Text>Codex</Text>;" },
              { kind: "add", text: "  return <Text>Codex Mobile Runner</Text>;" },
              { kind: "context", text: "}" },
            ],
          },
        ],
      },
    ],
    filesChanged: 1,
    unsupportedChanges: 0,
    status: "available",
    createdAt: timestamp,
  });
}

function resolveBuildRequest(request: BuildJobRequest, config: MobileRunnerConfig): ResolvedSandboxCommand {
  return resolveSandboxCommand(request, {
    unsafeCustomCommandsEnabled: config.enableUnsafeCustomCommands,
    dockerNetworkMode: config.dockerNetworkMode,
    resourceLimits: config.resourceLimits,
  });
}

function createSandboxBackend(config: MobileRunnerConfig): SandboxBackend {
  if (config.sandboxBackend === "local-docker") {
    return new LocalDockerSandboxBackend({ image: config.dockerImage });
  }
  return new FakeSandboxBackend();
}

function createGitProvider(config: MobileRunnerConfig): GitProvider {
  if (config.gitProvider === "github-app") {
    return new GitHubAppProvider(config.gitHubAppConfigured);
  }
  if (config.gitProvider === "local-git") {
    return new LocalGitCliProvider(getGitProviderPreflightError(config) === null);
  }
  return new FakeGitProvider();
}

function createCloudRunnerProvider(config: MobileRunnerConfig): CloudRunnerProvider {
  if (config.cloudRunnerProvider === "fake") {
    return new FakeCloudRunnerProvider(config.cloudLimits);
  }
  return {
    mode: config.cloudRunnerProvider,
    capabilities: () => ({
      provider: config.cloudRunnerProvider,
      available: false,
      limits: config.cloudLimits,
    }),
    dispatch: async () => {
      throw new HttpError(503, "cloud_runner_unavailable", getCloudRunnerPreflightError(config) ?? "cloud runner provider unavailable");
    },
    cancel: async () => {},
  };
}

function capabilitiesForState(state: ServerState): RunnerCapabilitiesResponse {
  const base = capabilitiesFromConfig(state.config);
  const git = state.gitProvider.capabilities();
  const cloud = state.cloudProvider.capabilities();
  return assertRunnerCapabilitiesResponse({
    ...base,
    gitProvider: git.provider,
    gitProviderAvailable: git.available,
    gitHubAppConfigured: git.gitHubAppConfigured,
    supportsRepoImport: git.supportsRepoImport,
    supportsCommit: git.supportsCommit,
    supportsPush: git.supportsPush,
    supportsPullRequestPlan: git.supportsPullRequestPlan,
    secretsInMobile: false,
    cloudRunnerProvider: cloud.provider,
    cloudRunnerAvailable: cloud.available,
    cloudLimits: cloud.limits,
  });
}

function createCodexAppServerPatch(
  state: ServerState,
  sessionId: string,
  jobId: string,
  diff: { threadId: string; turnId: string; unifiedDiff: string },
  timestamp: string,
): PatchProposal {
  return assertPatchProposal(
    parseUnifiedDiffToPatchProposal(diff.unifiedDiff, {
      id: formatId("mrp", state.nextPatch++),
      sessionId,
      jobId,
      source: "codex-app-server",
      appServerThreadId: diff.threadId,
      appServerTurnId: diff.turnId,
      createdAt: timestamp,
      metadata: {
        source: "codex-app-server",
        threadId: diff.threadId,
        turnId: diff.turnId,
        jobId,
      },
    }),
  );
}

function patchEventFromProposal(patch: PatchProposal) {
  return {
    type: "runner.patch" as const,
    sessionId: patch.sessionId,
    jobId: patch.jobId,
    patchId: patch.id,
    source: patch.source,
    summary: patch.summary,
    unifiedDiff: patch.unifiedDiff,
    filesChanged: patch.filesChanged,
    unsupportedChanges: patch.unsupportedChanges,
    status: patch.status,
    createdAt: patch.createdAt,
  };
}

function createFakeArtifact(state: ServerState, sessionId: string, jobId: string, timestamp: string): BuildArtifact {
  return assertBuildArtifact({
    id: formatId("mra", state.nextArtifact++),
    sessionId,
    jobId,
    kind: "testReport",
    title: "Fake build/test artifacts",
    webPreviewUrl: `https://example.invalid/mobile-runner/${sessionId}/preview`,
    buildLogUrl: `https://example.invalid/mobile-runner/${sessionId}/build.log`,
    apkUrl: `https://example.invalid/mobile-runner/${sessionId}/app-debug.apk`,
    iosInstructions: "Native iOS builds must run on a Mac/Xcode runner or CI. This placeholder represents a TestFlight handoff note.",
    createdAt: timestamp,
  });
}

function createCodexAppServerArtifact(state: ServerState, sessionId: string, jobId: string, timestamp: string): BuildArtifact {
  return assertBuildArtifact({
    id: formatId("mra", state.nextArtifact++),
    sessionId,
    jobId,
    kind: "testReport",
    title: "Codex app-server turn metadata",
    metadata: {
      mode: "codex-app-server",
      note: "Real build artifacts still require the remote sandbox runner milestone.",
    },
    createdAt: timestamp,
  });
}

function createArtifactFromRequest(
  state: ServerState,
  sessionId: string,
  body: unknown,
  timestamp: string,
): BuildArtifact {
  const record = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  return assertBuildArtifact({
    id: typeof record.id === "string" ? record.id : formatId("mra", state.nextArtifact++),
    sessionId,
    jobId: record.jobId,
    kind: record.kind ?? "other",
    title: record.title ?? "Runner artifact",
    webPreviewUrl: record.webPreviewUrl,
    buildLogUrl: record.buildLogUrl,
    apkUrl: record.apkUrl,
    iosInstructions: record.iosInstructions,
    metadata: record.metadata,
    createdAt: record.createdAt ?? timestamp,
  });
}

function appendArtifact(state: ServerState, sessionId: string, artifact: BuildArtifact): void {
  state.artifactStore.put(artifact, state.config.resourceLimits.maxArtifactBytes);
  state.artifacts.set(sessionId, [...(state.artifacts.get(sessionId) ?? []), artifact]);
  state.auditLog.record(
    {
      type: "artifact.created",
      sessionId,
      jobId: artifact.jobId,
      message: `Stored artifact ${artifact.title}`,
      metadata: { kind: artifact.kind },
    },
    () => artifact.createdAt,
  );
}

function validateSnapshotPaths(snapshot: ProjectSnapshot, maxWorkspaceBytes: number): void {
  let totalBytes = 0;
  for (const file of snapshot.files) {
    validateWorkspacePath(file.path);
    totalBytes += Buffer.byteLength(file.contentsBase64, "base64");
  }
  for (const deletedPath of snapshot.deletedPaths ?? []) {
    validateWorkspacePath(deletedPath);
  }
  if (totalBytes > maxWorkspaceBytes) {
    throw new HttpError(413, "workspace_rejected", `workspace snapshot exceeds max size ${maxWorkspaceBytes} bytes`);
  }
}

function validateJobCwd(cwd: string | undefined): void {
  if (!cwd) {
    return;
  }
  validateWorkspacePath(cwd);
}

function validateWorkspacePath(path: string): void {
  try {
    normalizeWorkspaceRelativePath(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `path escapes workspace: ${path}`;
    throw new HttpError(400, "path_escapes_workspace", message);
  }
}

async function ensureSessionWorkspace(state: ServerState, sessionId: string): Promise<string> {
  const existing = state.workspaces.get(sessionId);
  if (existing) {
    return existing;
  }
  const workspace = await mkdtemp(path.join(os.tmpdir(), `codex-mobile-runner-${sessionId}-`));
  state.workspaces.set(sessionId, workspace);
  return workspace;
}

async function materializeSnapshot(workspaceRoot: string, snapshot: ProjectSnapshot): Promise<void> {
  for (const deletedPath of snapshot.deletedPaths ?? []) {
    await rm(resolveWorkspacePath(workspaceRoot, deletedPath), { recursive: true, force: true });
  }
  for (const file of snapshot.files) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, file.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(file.contentsBase64, "base64"));
  }
}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const absolute = path.resolve(workspaceRoot, normalized);
  const rootWithSeparator = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
  if (absolute !== workspaceRoot && !absolute.startsWith(rootWithSeparator)) {
    throw new HttpError(400, "path_escapes_workspace", `path escapes workspace: ${relativePath}`);
  }
  return absolute;
}

function requireSession(state: ServerState, sessionId: string): MobileSession {
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new HttpError(404, "session_not_found", `unknown session: ${sessionId}`);
  }
  return session;
}

function requireJob(state: ServerState, jobId: string, sessionId: string): RunnerJob {
  const job = state.jobs.get(jobId);
  if (!job || job.sessionId !== sessionId) {
    throw new HttpError(404, "job_not_found", `unknown job: ${jobId}`);
  }
  return job;
}

function countFilesChanged(unifiedDiff: string): number {
  return unifiedDiff.split(/\r?\n/).filter((line) => line.startsWith("+++ ")).length;
}

function promptFromCommand(command: string[]): string {
  return `Run the requested mobile runner job: ${command.join(" ")}`;
}

function writeSse<T>(response: http.ServerResponse, event: string, data: T): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function writeJson<T>(response: http.ServerResponse, status: number, body: T): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function errorStatus(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }
  if (error instanceof SandboxBackendError) {
    return error.status;
  }
  if (error instanceof GitProviderError || error instanceof GitSecurityPolicyError || error instanceof RunnerAuthPolicyError) {
    return error.status;
  }
  if (error instanceof QuotaPolicyError) {
    return 429;
  }
  return 500;
}

function errorCode(error: unknown): string {
  if (error instanceof HttpError || error instanceof SandboxBackendError || error instanceof GitProviderError || error instanceof GitSecurityPolicyError || error instanceof RunnerAuthPolicyError || error instanceof QuotaPolicyError) {
    return error.code;
  }
  return "runner_error";
}

function expectRequestRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", "request body must be an object");
  }
  return value as Record<string, unknown>;
}

function expectRequestString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "invalid_request", `${field} must be a non-empty string`);
  }
  return value;
}

function normalizeApiPath(path: string): string {
  return path.startsWith("/v1/") ? path.slice(3) : path;
}

function formatId(prefix: string, value: number): string {
  return `${prefix}_${value.toString().padStart(4, "0")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly sessionId?: string,
    readonly jobId?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
