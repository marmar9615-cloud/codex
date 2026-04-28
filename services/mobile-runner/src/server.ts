import {
  assertCreateSessionRequest,
  assertReceivePatchRequest,
  assertStartJobRequest,
  assertUploadSnapshotRequest,
} from "@codex/mobile-protocol";
import type {
  ArtifactListResponse,
  CreateSessionResponse,
  ReceivePatchResponse,
  RunnerArtifact,
  RunnerJob,
  RunnerLogEvent,
  RunnerSession,
  StartJobResponse,
  UploadSnapshotResponse,
} from "@codex/mobile-protocol";
import { randomUUID } from "node:crypto";
import http from "node:http";

type ServerState = {
  sessions: Map<string, RunnerSession>;
  jobs: Map<string, RunnerJob>;
  artifacts: Map<string, RunnerArtifact[]>;
  patches: Map<string, string[]>;
};

export type MobileRunnerServerOptions = {
  now?: () => string;
};

export type StartMobileRunnerOptions = MobileRunnerServerOptions & {
  port?: number;
  host?: string;
};

export function createMobileRunnerServer(options: MobileRunnerServerOptions = {}): http.Server {
  const now = options.now ?? (() => new Date().toISOString());
  const state: ServerState = {
    sessions: new Map(),
    jobs: new Map(),
    artifacts: new Map(),
    patches: new Map(),
  };

  return http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, state, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown runner error";
      writeJson(response, 500, { error: message });
    }
  });
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

  if (request.method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/sessions") {
    const params = assertCreateSessionRequest(await readJson(request));
    const timestamp = now();
    const session: RunnerSession = {
      id: `mrs_${randomUUID()}`,
      projectId: params.projectId,
      projectName: params.projectName,
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.sessions.set(session.id, session);
    writeJson<CreateSessionResponse>(response, 201, { session });
    return;
  }

  const snapshotMatch = /^\/v1\/sessions\/([^/]+)\/snapshot$/.exec(url.pathname);
  if (request.method === "PUT" && snapshotMatch) {
    const session = requireSession(state, snapshotMatch[1] ?? "");
    const params = assertUploadSnapshotRequest(await readJson(request));
    const updated = { ...session, status: "ready" as const, updatedAt: now() };
    state.sessions.set(updated.id, updated);
    writeJson<UploadSnapshotResponse>(response, 200, {
      session: updated,
      acceptedFiles: params.files.length,
      acceptedDeletedPaths: params.deletedPaths?.length ?? 0,
    });
    return;
  }

  const jobMatch = /^\/v1\/sessions\/([^/]+)\/jobs$/.exec(url.pathname);
  if (request.method === "POST" && jobMatch) {
    const session = requireSession(state, jobMatch[1] ?? "");
    const params = assertStartJobRequest(await readJson(request));
    const timestamp = now();
    const job: RunnerJob = {
      id: `mrj_${randomUUID()}`,
      sessionId: session.id,
      kind: params.kind,
      command: params.command,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.jobs.set(job.id, job);
    state.sessions.set(session.id, { ...session, status: "running", updatedAt: timestamp });
    writeJson<StartJobResponse>(response, 202, {
      job,
      logStreamUrl: `/v1/sessions/${session.id}/jobs/${job.id}/logs`,
    });
    return;
  }

  const logsMatch = /^\/v1\/sessions\/([^/]+)\/jobs\/([^/]+)\/logs$/.exec(url.pathname);
  if (request.method === "GET" && logsMatch) {
    const session = requireSession(state, logsMatch[1] ?? "");
    const job = requireJob(state, logsMatch[2] ?? "");
    await streamFakeLogs(response, state, session, job, now);
    return;
  }

  const patchMatch = /^\/v1\/sessions\/([^/]+)\/patches$/.exec(url.pathname);
  if (request.method === "POST" && patchMatch) {
    const session = requireSession(state, patchMatch[1] ?? "");
    const params = assertReceivePatchRequest(await readJson(request));
    const patchId = params.patchId ?? `mrp_${randomUUID()}`;
    const existing = state.patches.get(session.id) ?? [];
    existing.push(patchId);
    state.patches.set(session.id, existing);
    writeJson<ReceivePatchResponse>(response, 202, {
      patchId,
      accepted: true,
      filesChanged: countFilesChanged(params.unifiedDiff),
    });
    return;
  }

  const artifactsMatch = /^\/v1\/sessions\/([^/]+)\/artifacts$/.exec(url.pathname);
  if (request.method === "GET" && artifactsMatch) {
    const session = requireSession(state, artifactsMatch[1] ?? "");
    writeJson<ArtifactListResponse>(response, 200, {
      artifacts: state.artifacts.get(session.id) ?? [],
    });
    return;
  }

  writeJson(response, 404, { error: "not found" });
}

async function streamFakeLogs(
  response: http.ServerResponse,
  state: ServerState,
  session: RunnerSession,
  job: RunnerJob,
  now: () => string,
): Promise<void> {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const running = { ...job, status: "running" as const, updatedAt: now() };
  state.jobs.set(job.id, running);

  const messages = [
    "mobile-runner accepted job",
    `fake mobile-runner executing: ${job.command.join(" ")}`,
    "streaming stdout/stderr contract is live",
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
    response.write(`event: log\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
    await delay(5);
  }

  const completed = { ...running, status: "succeeded" as const, updatedAt: now() };
  state.jobs.set(job.id, completed);
  state.sessions.set(session.id, { ...session, status: "ready", updatedAt: completed.updatedAt });

  const artifact: RunnerArtifact = {
    id: `mra_${randomUUID()}`,
    sessionId: session.id,
    jobId: job.id,
    kind: job.kind === "preview" ? "webPreview" : "testReport",
    title: job.kind === "preview" ? "Preview URL" : "Fake test report",
    url: job.kind === "preview" ? "https://example.invalid/mobile-preview" : undefined,
    createdAt: now(),
  };
  state.artifacts.set(session.id, [...(state.artifacts.get(session.id) ?? []), artifact]);
  response.write(`event: jobStatus\n`);
  response.write(`data: ${JSON.stringify({ type: "runner.jobStatus", sessionId: session.id, job: completed })}\n\n`);
  response.end();
}

function requireSession(state: ServerState, sessionId: string): RunnerSession {
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }
  return session;
}

function requireJob(state: ServerState, jobId: string): RunnerJob {
  const job = state.jobs.get(jobId);
  if (!job) {
    throw new Error(`unknown job: ${jobId}`);
  }
  return job;
}

function countFilesChanged(unifiedDiff: string): number {
  return unifiedDiff.split(/\r?\n/).filter((line) => line.startsWith("+++ ")).length;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
