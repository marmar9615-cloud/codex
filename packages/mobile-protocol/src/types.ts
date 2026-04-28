export type IsoTimestamp = string;

export type ProjectSourceKind = "appWorkspace" | "github" | "documentPicker" | "androidSaf" | "iosSecurityScoped";

export type MobileProject = {
  id: string;
  name: string;
  sourceKind: ProjectSourceKind;
  workspaceUri: string;
  lastOpenedAt: IsoTimestamp;
  runnerSessionId?: string;
};

export type RunnerSessionStatus = "created" | "syncing" | "ready" | "running" | "failed" | "closed";

export type MobileSession = {
  id: string;
  projectId: string;
  projectName: string;
  sourceKind: ProjectSourceKind;
  status: RunnerSessionStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  snapshotVersion?: number;
};

export type RunnerSession = MobileSession;

export type CreateSessionRequest = {
  projectId: string;
  projectName: string;
  sourceKind: ProjectSourceKind;
};

export type CreateSessionResponse = {
  session: RunnerSession;
};

export type ProjectSnapshotFile = {
  path: string;
  contentsBase64: string;
  mode?: string;
  sha256?: string;
};

export type ProjectSnapshot = {
  files: ProjectSnapshotFile[];
  deletedPaths?: string[];
};

export type UploadSnapshotRequest = ProjectSnapshot;

export type UploadSnapshotResponse = {
  session: RunnerSession;
  acceptedFiles: number;
  acceptedDeletedPaths: number;
};

export type RunnerCommandKind = "build" | "test" | "preview" | "custom";

export type StartJobRequest = {
  kind: RunnerCommandKind;
  command: string[];
  prompt?: string;
  cwd?: string;
  environmentId?: string;
};

export type RunnerJobStatus =
  | "queued"
  | "running"
  | "awaitingApproval"
  | "completed"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "canceled";

export type RunnerMode = "fake" | "codex-app-server";

export type AppServerTransport = "stdio" | "unix" | "local-ws";

export type RunnerJob = {
  id: string;
  sessionId: string;
  kind: RunnerCommandKind;
  command: string[];
  mode: RunnerMode;
  appServerThreadId?: string;
  appServerTurnId?: string;
  appServerTransport?: AppServerTransport;
  status: RunnerJobStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type StartJobResponse = {
  job: RunnerJob;
  logStreamUrl: string;
};

export type RunnerLogLevel = "debug" | "info" | "warn" | "error";
export type RunnerLogStream = "stdout" | "stderr" | "system";

export type RunnerLogEvent = {
  type: "runner.log";
  sessionId: string;
  jobId: string;
  sequence: number;
  stream: RunnerLogStream;
  level: RunnerLogLevel;
  category?: RunnerEventCategory;
  message: string;
  createdAt: IsoTimestamp;
};

export type RunnerEventCategory = "agentText" | "plan" | "diff" | "approval" | "tool" | "error" | "completion" | "system";

export type ArtifactKind = "webPreview" | "testReport" | "apk" | "aab" | "iosBuildLog" | "other";

export type PatchLineKind = "context" | "add" | "remove";

export type PatchLine = {
  kind: PatchLineKind;
  text: string;
};

export type PatchHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: PatchLine[];
};

export type PatchFileChange = {
  oldPath: string;
  newPath: string;
  changeKind?: PatchFileChangeKind;
  unsupportedReason?: string;
  hunks: PatchHunk[];
};

export type PatchFileChangeKind = "added" | "modified" | "deleted" | "unsupported";

export type PatchFile = PatchFileChange;

export type PatchProposal = {
  id: string;
  sessionId: string;
  jobId?: string;
  source?: PatchSource;
  appServerThreadId?: string;
  appServerTurnId?: string;
  summary: string;
  unifiedDiff: string;
  files: PatchFileChange[];
  filesChanged?: number;
  unsupportedChanges?: number;
  status?: PatchLifecycleStatus;
  metadata?: Record<string, string>;
  createdAt: IsoTimestamp;
};

export type PatchSource = "fake" | "codex-app-server";

export type PatchLifecycleStatus = "none" | "available" | "unsupported" | "applied" | "rejected" | "failedToApply";

export type ReceivePatchRequest = {
  patchId?: string;
  unifiedDiff: string;
  summary?: string;
};

export type ReceivePatchResponse = {
  patchId: string;
  accepted: boolean;
  filesChanged: number;
};

export type RunnerPatchEvent = {
  type: "runner.patch";
  sessionId: string;
  jobId?: string;
  patchId: string;
  source?: PatchSource;
  summary: string;
  unifiedDiff: string;
  filesChanged?: number;
  unsupportedChanges?: number;
  status?: PatchLifecycleStatus;
  createdAt: IsoTimestamp;
};

export type RunnerApprovalRequestEvent = {
  type: "runner.approvalRequest";
  sessionId: string;
  jobId: string;
  requestId: string | number;
  approvalId?: string;
  approvalKind: "command" | "fileChange" | "permissions" | "tool" | "mcp" | "auth" | "legacy" | "unknown";
  summary: string;
  createdAt: IsoTimestamp;
};

export type RunnerJobStatusEvent = {
  type: "runner.jobStatus";
  sessionId: string;
  job: RunnerJob;
};

export type RunnerArtifactEvent = {
  type: "runner.artifact";
  sessionId: string;
  artifact: BuildArtifact;
};

export type RunnerEvent =
  | RunnerLogEvent
  | RunnerPatchEvent
  | RunnerJobStatusEvent
  | RunnerArtifactEvent
  | RunnerApprovalRequestEvent;

export type BuildArtifact = {
  id: string;
  sessionId: string;
  jobId?: string;
  kind: ArtifactKind;
  title: string;
  webPreviewUrl?: string;
  buildLogUrl?: string;
  apkUrl?: string;
  iosInstructions?: string;
  metadata?: Record<string, string>;
  createdAt: IsoTimestamp;
};

export type RunnerArtifact = BuildArtifact;

export type ArtifactListResponse = {
  artifacts: BuildArtifact[];
};

export type RunnerCapabilitiesResponse = {
  defaultMode: RunnerMode;
  activeMode: RunnerMode;
  fakeRunner: true;
  codexAppServerBridge: boolean;
  supportedTransports: AppServerTransport[];
  productionOAuthEnabled: false;
  remoteSandboxExecution: false;
};

export type GetSessionResponse = {
  session: MobileSession;
};

export type GetJobResponse = {
  job: RunnerJob;
};

export type GetPatchResponse = {
  patch: PatchProposal | null;
};

export type RunnerError = {
  error: string;
  code?: string;
  sessionId?: string;
  jobId?: string;
};

export type MobileAuthProvider = "chatgpt" | "devApiKey";

export type MobileAuthConfig = {
  chatgptAccountAuthEnabled: boolean;
  devApiKeyAuthEnabled: boolean;
};
