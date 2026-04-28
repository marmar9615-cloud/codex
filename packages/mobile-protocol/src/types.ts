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

export type RunnerSession = {
  id: string;
  projectId: string;
  projectName: string;
  status: RunnerSessionStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

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

export type UploadSnapshotRequest = {
  files: ProjectSnapshotFile[];
  deletedPaths?: string[];
};

export type UploadSnapshotResponse = {
  session: RunnerSession;
  acceptedFiles: number;
  acceptedDeletedPaths: number;
};

export type RunnerCommandKind = "build" | "test" | "preview" | "custom";

export type StartJobRequest = {
  kind: RunnerCommandKind;
  command: string[];
  cwd?: string;
  environmentId?: string;
};

export type RunnerJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type RunnerJob = {
  id: string;
  sessionId: string;
  kind: RunnerCommandKind;
  command: string[];
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
  message: string;
  createdAt: IsoTimestamp;
};

export type ArtifactKind = "webPreview" | "testReport" | "apk" | "aab" | "iosBuildLog" | "other";

export type RunnerArtifact = {
  id: string;
  sessionId: string;
  jobId?: string;
  kind: ArtifactKind;
  title: string;
  url?: string;
  metadata?: Record<string, string>;
  createdAt: IsoTimestamp;
};

export type ArtifactListResponse = {
  artifacts: RunnerArtifact[];
};

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

export type PatchFile = {
  oldPath: string;
  newPath: string;
  hunks: PatchHunk[];
};

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
  patchId: string;
  summary: string;
  unifiedDiff: string;
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
  artifact: RunnerArtifact;
};

export type RunnerEvent = RunnerLogEvent | RunnerPatchEvent | RunnerJobStatusEvent | RunnerArtifactEvent;

export type MobileAuthProvider = "chatgpt" | "devApiKey";

export type MobileAuthConfig = {
  chatgptAccountAuthEnabled: boolean;
  devApiKeyAuthEnabled: boolean;
};
