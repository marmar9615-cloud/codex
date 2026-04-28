import type {
  BuildArtifact,
  AppServerTransport,
  CreateSessionRequest,
  MobileSession,
  PatchFileChange,
  PatchHunk,
  PatchLine,
  PatchProposal,
  PatchFileChangeKind,
  PatchLifecycleStatus,
  PatchSource,
  ProjectSnapshot,
  ProjectSourceKind,
  ReceivePatchRequest,
  RunnerError,
  RunnerEventCategory,
  RunnerEvent,
  RunnerCapabilitiesResponse,
  RunnerJob,
  RunnerJobStatus,
  RunnerLogEvent,
  RunnerMode,
  StartJobRequest,
  UploadSnapshotRequest,
} from "./types.js";

const projectSourceKinds = new Set<ProjectSourceKind>([
  "appWorkspace",
  "github",
  "documentPicker",
  "androidSaf",
  "iosSecurityScoped",
]);

const commandKinds = new Set(["build", "test", "preview", "custom"]);
const sessionStatuses = new Set(["created", "syncing", "ready", "running", "failed", "closed"]);
const jobStatuses = new Set<RunnerJobStatus>([
  "queued",
  "running",
  "awaitingApproval",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
]);
const runnerModes = new Set<RunnerMode>(["fake", "codex-app-server"]);
const appServerTransports = new Set<AppServerTransport>(["stdio", "unix", "local-ws"]);
const logStreams = new Set(["stdout", "stderr", "system"]);
const logLevels = new Set(["debug", "info", "warn", "error"]);
const logCategories = new Set<RunnerEventCategory>(["agentText", "plan", "diff", "approval", "tool", "error", "completion", "system"]);
const artifactKinds = new Set(["webPreview", "testReport", "apk", "aab", "iosBuildLog", "other"]);
const patchLineKinds = new Set(["context", "add", "remove"]);
const patchFileChangeKinds = new Set<PatchFileChangeKind>(["added", "modified", "deleted", "unsupported"]);
const patchSources = new Set<PatchSource>(["fake", "codex-app-server"]);
const patchLifecycleStatuses = new Set<PatchLifecycleStatus>(["none", "available", "unsupported", "applied", "rejected", "failedToApply"]);

export class ProtocolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

export function assertCreateSessionRequest(value: unknown): CreateSessionRequest {
  const object = expectRecord(value, "create session request");
  const sourceKind = expectString(object.sourceKind, "sourceKind");
  if (!projectSourceKinds.has(sourceKind as ProjectSourceKind)) {
    throw new ProtocolValidationError(`unsupported sourceKind: ${sourceKind}`);
  }
  return {
    projectId: expectString(object.projectId, "projectId"),
    projectName: expectString(object.projectName, "projectName"),
    sourceKind: sourceKind as ProjectSourceKind,
  };
}

export function assertProjectSnapshot(value: unknown): ProjectSnapshot {
  const object = expectRecord(value, "upload snapshot request");
  return {
    files: expectArray(object.files, "files").map((file, index) => {
      const entry = expectRecord(file, `files[${index}]`);
      return {
        path: expectString(entry.path, `files[${index}].path`),
        contentsBase64: expectString(entry.contentsBase64, `files[${index}].contentsBase64`),
        mode: optionalString(entry.mode, `files[${index}].mode`),
        sha256: optionalString(entry.sha256, `files[${index}].sha256`),
      };
    }),
    deletedPaths: optionalStringArray(object.deletedPaths, "deletedPaths"),
  };
}

export function assertUploadSnapshotRequest(value: unknown): UploadSnapshotRequest {
  return assertProjectSnapshot(value);
}

export function assertStartJobRequest(value: unknown): StartJobRequest {
  const object = expectRecord(value, "start job request");
  const kind = expectString(object.kind, "kind");
  if (!commandKinds.has(kind)) {
    throw new ProtocolValidationError(`unsupported command kind: ${kind}`);
  }
  if (!Array.isArray(object.command) || object.command.length === 0) {
    throw new ProtocolValidationError("command must be a non-empty string array");
  }
  return {
    kind: kind as StartJobRequest["kind"],
    command: expectArray(object.command, "command").map((part, index) => expectString(part, `command[${index}]`)),
    prompt: optionalString(object.prompt, "prompt"),
    cwd: optionalString(object.cwd, "cwd"),
    environmentId: optionalString(object.environmentId, "environmentId"),
  };
}

export function assertReceivePatchRequest(value: unknown): ReceivePatchRequest {
  const object = expectRecord(value, "receive patch request");
  return {
    patchId: optionalString(object.patchId, "patchId"),
    unifiedDiff: expectString(object.unifiedDiff, "unifiedDiff"),
    summary: optionalString(object.summary, "summary"),
  };
}

export function assertMobileSession(value: unknown): MobileSession {
  const object = expectRecord(value, "mobile session");
  const sourceKind = expectString(object.sourceKind, "sourceKind");
  if (!projectSourceKinds.has(sourceKind as ProjectSourceKind)) {
    throw new ProtocolValidationError(`unsupported sourceKind: ${sourceKind}`);
  }
  const status = expectString(object.status, "status");
  if (!sessionStatuses.has(status)) {
    throw new ProtocolValidationError(`unsupported session status: ${status}`);
  }
  return {
    id: expectString(object.id, "id"),
    projectId: expectString(object.projectId, "projectId"),
    projectName: expectString(object.projectName, "projectName"),
    sourceKind: sourceKind as ProjectSourceKind,
    status: status as MobileSession["status"],
    createdAt: expectString(object.createdAt, "createdAt"),
    updatedAt: expectString(object.updatedAt, "updatedAt"),
    snapshotVersion: optionalNumber(object.snapshotVersion, "snapshotVersion"),
  };
}

export function assertRunnerJob(value: unknown): RunnerJob {
  const object = expectRecord(value, "runner job");
  const kind = expectString(object.kind, "kind");
  if (!commandKinds.has(kind)) {
    throw new ProtocolValidationError(`unsupported command kind: ${kind}`);
  }
  const mode = expectString(object.mode, "mode");
  if (!runnerModes.has(mode as RunnerMode)) {
    throw new ProtocolValidationError(`unsupported runner mode: ${mode}`);
  }
  const status = expectString(object.status, "status");
  if (!jobStatuses.has(status as RunnerJobStatus)) {
    throw new ProtocolValidationError(`unsupported job status: ${status}`);
  }
  const appServerTransport = optionalAppServerTransport(object.appServerTransport, "appServerTransport");
  return {
    id: expectString(object.id, "id"),
    sessionId: expectString(object.sessionId, "sessionId"),
    kind: kind as RunnerJob["kind"],
    command: expectArray(object.command, "command").map((part, index) => expectString(part, `command[${index}]`)),
    mode: mode as RunnerMode,
    appServerThreadId: optionalString(object.appServerThreadId, "appServerThreadId"),
    appServerTurnId: optionalString(object.appServerTurnId, "appServerTurnId"),
    appServerTransport,
    status: status as RunnerJobStatus,
    createdAt: expectString(object.createdAt, "createdAt"),
    updatedAt: expectString(object.updatedAt, "updatedAt"),
  };
}

export function assertRunnerCapabilitiesResponse(value: unknown): RunnerCapabilitiesResponse {
  const object = expectRecord(value, "runner capabilities response");
  const defaultMode = expectRunnerMode(object.defaultMode, "defaultMode");
  const activeMode = expectRunnerMode(object.activeMode, "activeMode");
  return {
    defaultMode,
    activeMode,
    fakeRunner: expectLiteral(object.fakeRunner, true, "fakeRunner"),
    codexAppServerBridge: expectBoolean(object.codexAppServerBridge, "codexAppServerBridge"),
    supportedTransports: expectArray(object.supportedTransports, "supportedTransports").map((entry, index) =>
      expectAppServerTransport(entry, `supportedTransports[${index}]`),
    ),
    productionOAuthEnabled: expectLiteral(object.productionOAuthEnabled, false, "productionOAuthEnabled"),
    remoteSandboxExecution: expectLiteral(object.remoteSandboxExecution, false, "remoteSandboxExecution"),
  };
}

export function assertRunnerLogEvent(value: unknown): RunnerLogEvent {
  const object = expectRecord(value, "runner log event");
  const type = expectString(object.type, "type");
  if (type !== "runner.log") {
    throw new ProtocolValidationError(`unsupported event type: ${type}`);
  }
  const stream = expectString(object.stream, "stream");
  if (!logStreams.has(stream)) {
    throw new ProtocolValidationError(`unsupported log stream: ${stream}`);
  }
  const level = expectString(object.level, "level");
  if (!logLevels.has(level)) {
    throw new ProtocolValidationError(`unsupported log level: ${level}`);
  }
  return {
    type: "runner.log",
    sessionId: expectString(object.sessionId, "sessionId"),
    jobId: expectString(object.jobId, "jobId"),
    sequence: expectNumber(object.sequence, "sequence"),
    stream: stream as RunnerLogEvent["stream"],
    level: level as RunnerLogEvent["level"],
    category: optionalLogCategory(object.category, "category"),
    message: expectString(object.message, "message"),
    createdAt: expectString(object.createdAt, "createdAt"),
  };
}

export function assertPatchProposal(value: unknown): PatchProposal {
  const object = expectRecord(value, "patch proposal");
  return {
    id: expectString(object.id, "id"),
    sessionId: expectString(object.sessionId, "sessionId"),
    jobId: optionalString(object.jobId, "jobId"),
    source: optionalPatchSource(object.source, "source"),
    appServerThreadId: optionalString(object.appServerThreadId, "appServerThreadId"),
    appServerTurnId: optionalString(object.appServerTurnId, "appServerTurnId"),
    summary: expectString(object.summary, "summary"),
    unifiedDiff: expectAnyString(object.unifiedDiff, "unifiedDiff"),
    files: expectArray(object.files, "files").map(assertPatchFileChange),
    filesChanged: optionalNumber(object.filesChanged, "filesChanged"),
    unsupportedChanges: optionalNumber(object.unsupportedChanges, "unsupportedChanges"),
    status: optionalPatchLifecycleStatus(object.status, "status"),
    metadata: optionalStringRecord(object.metadata, "metadata"),
    createdAt: expectString(object.createdAt, "createdAt"),
  };
}

export function assertBuildArtifact(value: unknown): BuildArtifact {
  const object = expectRecord(value, "build artifact");
  const kind = expectString(object.kind, "kind");
  if (!artifactKinds.has(kind)) {
    throw new ProtocolValidationError(`unsupported artifact kind: ${kind}`);
  }
  return {
    id: expectString(object.id, "id"),
    sessionId: expectString(object.sessionId, "sessionId"),
    jobId: optionalString(object.jobId, "jobId"),
    kind: kind as BuildArtifact["kind"],
    title: expectString(object.title, "title"),
    webPreviewUrl: optionalString(object.webPreviewUrl, "webPreviewUrl"),
    buildLogUrl: optionalString(object.buildLogUrl, "buildLogUrl"),
    apkUrl: optionalString(object.apkUrl, "apkUrl"),
    iosInstructions: optionalString(object.iosInstructions, "iosInstructions"),
    metadata: optionalStringRecord(object.metadata, "metadata"),
    createdAt: expectString(object.createdAt, "createdAt"),
  };
}

export function assertRunnerError(value: unknown): RunnerError {
  const object = expectRecord(value, "runner error");
  return {
    error: expectString(object.error, "error"),
    code: optionalString(object.code, "code"),
    sessionId: optionalString(object.sessionId, "sessionId"),
    jobId: optionalString(object.jobId, "jobId"),
  };
}

export function assertRunnerEvent(value: unknown): RunnerEvent {
  const object = expectRecord(value, "runner event");
  const type = expectString(object.type, "type");
  if (type === "runner.log") {
    return assertRunnerLogEvent(object);
  }
  if (type === "runner.jobStatus") {
    return {
      type: "runner.jobStatus",
      sessionId: expectString(object.sessionId, "sessionId"),
      job: assertRunnerJob(object.job),
    };
  }
  if (type === "runner.patch") {
    return {
      type: "runner.patch",
      sessionId: expectString(object.sessionId, "sessionId"),
      patchId: expectString(object.patchId, "patchId"),
      jobId: optionalString(object.jobId, "jobId"),
      source: optionalPatchSource(object.source, "source"),
      summary: expectString(object.summary, "summary"),
      unifiedDiff: expectString(object.unifiedDiff, "unifiedDiff"),
      filesChanged: optionalNumber(object.filesChanged, "filesChanged"),
      unsupportedChanges: optionalNumber(object.unsupportedChanges, "unsupportedChanges"),
      status: optionalPatchLifecycleStatus(object.status, "status"),
      createdAt: expectString(object.createdAt, "createdAt"),
    };
  }
  if (type === "runner.artifact") {
    return {
      type: "runner.artifact",
      sessionId: expectString(object.sessionId, "sessionId"),
      artifact: assertBuildArtifact(object.artifact),
    };
  }
  if (type === "runner.approvalRequest") {
    return {
      type: "runner.approvalRequest",
      sessionId: expectString(object.sessionId, "sessionId"),
      jobId: expectString(object.jobId, "jobId"),
      requestId: expectStringOrNumber(object.requestId, "requestId"),
      approvalId: optionalString(object.approvalId, "approvalId"),
      approvalKind: expectApprovalKind(object.approvalKind, "approvalKind"),
      summary: expectString(object.summary, "summary"),
      createdAt: expectString(object.createdAt, "createdAt"),
    };
  }
  throw new ProtocolValidationError(`unsupported event type: ${type}`);
}

function assertPatchFileChange(value: unknown, index: number): PatchFileChange {
  const object = expectRecord(value, `files[${index}]`);
  return {
    oldPath: expectString(object.oldPath, `files[${index}].oldPath`),
    newPath: expectString(object.newPath, `files[${index}].newPath`),
    changeKind: optionalPatchFileChangeKind(object.changeKind, `files[${index}].changeKind`),
    unsupportedReason: optionalString(object.unsupportedReason, `files[${index}].unsupportedReason`),
    hunks: expectArray(object.hunks, `files[${index}].hunks`).map(assertPatchHunk),
  };
}

function assertPatchHunk(value: unknown, index: number): PatchHunk {
  const object = expectRecord(value, `hunks[${index}]`);
  return {
    oldStart: expectNumber(object.oldStart, `hunks[${index}].oldStart`),
    oldLines: expectNumber(object.oldLines, `hunks[${index}].oldLines`),
    newStart: expectNumber(object.newStart, `hunks[${index}].newStart`),
    newLines: expectNumber(object.newLines, `hunks[${index}].newLines`),
    lines: expectArray(object.lines, `hunks[${index}].lines`).map(assertPatchLine),
  };
}

function assertPatchLine(value: unknown, index: number): PatchLine {
  const object = expectRecord(value, `lines[${index}]`);
  const kind = expectString(object.kind, `lines[${index}].kind`);
  if (!patchLineKinds.has(kind)) {
    throw new ProtocolValidationError(`unsupported patch line kind: ${kind}`);
  }
  return {
    kind: kind as PatchLine["kind"],
    text: expectAnyString(object.text, `lines[${index}].text`),
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProtocolValidationError(`${label} must be an array`);
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function expectAnyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ProtocolValidationError(`${label} must be a string`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolValidationError(`${label} must be a finite number`);
  }
  return value;
}

function expectStringOrNumber(value: unknown, label: string): string | number {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new ProtocolValidationError(`${label} must be a non-empty string or finite number`);
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProtocolValidationError(`${label} must be a boolean`);
  }
  return value;
}

function expectLiteral<T extends boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new ProtocolValidationError(`${label} must be ${expected}`);
  }
  return expected;
}

function expectRunnerMode(value: unknown, label: string): RunnerMode {
  const mode = expectString(value, label);
  if (!runnerModes.has(mode as RunnerMode)) {
    throw new ProtocolValidationError(`unsupported runner mode: ${mode}`);
  }
  return mode as RunnerMode;
}

function expectAppServerTransport(value: unknown, label: string): AppServerTransport {
  const transport = expectString(value, label);
  if (!appServerTransports.has(transport as AppServerTransport)) {
    throw new ProtocolValidationError(`unsupported app-server transport: ${transport}`);
  }
  return transport as AppServerTransport;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectString(value, label);
}

function optionalLogCategory(value: unknown, label: string): RunnerEventCategory | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const category = expectString(value, label);
  if (!logCategories.has(category as RunnerEventCategory)) {
    throw new ProtocolValidationError(`unsupported runner log category: ${category}`);
  }
  return category as RunnerEventCategory;
}

function optionalPatchFileChangeKind(value: unknown, label: string): PatchFileChangeKind | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const kind = expectString(value, label);
  if (!patchFileChangeKinds.has(kind as PatchFileChangeKind)) {
    throw new ProtocolValidationError(`unsupported patch file change kind: ${kind}`);
  }
  return kind as PatchFileChangeKind;
}

function optionalPatchSource(value: unknown, label: string): PatchSource | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const source = expectString(value, label);
  if (!patchSources.has(source as PatchSource)) {
    throw new ProtocolValidationError(`unsupported patch source: ${source}`);
  }
  return source as PatchSource;
}

function optionalPatchLifecycleStatus(value: unknown, label: string): PatchLifecycleStatus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const status = expectString(value, label);
  if (!patchLifecycleStatuses.has(status as PatchLifecycleStatus)) {
    throw new ProtocolValidationError(`unsupported patch status: ${status}`);
  }
  return status as PatchLifecycleStatus;
}

function expectApprovalKind(value: unknown, label: string): "command" | "fileChange" | "permissions" | "tool" | "mcp" | "auth" | "legacy" | "unknown" {
  const kind = expectString(value, label);
  if (
    kind !== "command" &&
    kind !== "fileChange" &&
    kind !== "permissions" &&
    kind !== "tool" &&
    kind !== "mcp" &&
    kind !== "auth" &&
    kind !== "legacy" &&
    kind !== "unknown"
  ) {
    throw new ProtocolValidationError(`unsupported approval kind: ${kind}`);
  }
  return kind;
}

function optionalAppServerTransport(value: unknown, label: string): AppServerTransport | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectAppServerTransport(value, label);
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProtocolValidationError(`${label} must be a string array`);
  }
  return value.map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectNumber(value, label);
}

function optionalStringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = expectRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, expectString(entry, `${label}.${key}`)]),
  );
}
