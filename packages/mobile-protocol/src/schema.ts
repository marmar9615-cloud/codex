export type JsonSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
};

const sessionProperties = {
  id: { type: "string" },
  projectId: { type: "string" },
  projectName: { type: "string" },
  sourceKind: {
    type: "string",
    enum: ["appWorkspace", "github", "documentPicker", "androidSaf", "iosSecurityScoped"],
  },
  status: { type: "string", enum: ["created", "syncing", "ready", "running", "failed", "closed"] },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
  snapshotVersion: { type: "number" },
} as const satisfies Record<string, JsonSchema>;

const snapshotFileSchema = {
  type: "object",
  required: ["path", "contentsBase64"],
  properties: {
    path: { type: "string" },
    contentsBase64: { type: "string" },
    mode: { type: "string" },
    sha256: { type: "string" },
  },
} as const satisfies JsonSchema;

const runnerJobProperties = {
  id: { type: "string" },
  sessionId: { type: "string" },
  kind: { type: "string", enum: ["build", "test", "preview", "custom"] },
  command: { type: "array", items: { type: "string" } },
  mode: { type: "string", enum: ["fake", "codex-app-server"] },
  sandboxBackend: { type: "string", enum: ["fake", "local-docker"] },
  sandboxCommandKind: {
    type: "string",
    enum: [
      "npm_install",
      "npm_test",
      "npm_build",
      "pnpm_install",
      "pnpm_test",
      "pnpm_build",
      "yarn_install",
      "yarn_test",
      "yarn_build",
      "expo_export_or_check",
      "custom",
    ],
  },
  exitCode: { type: "number" },
  durationMs: { type: "number" },
  appServerThreadId: { type: "string" },
  appServerTurnId: { type: "string" },
  appServerTransport: { type: "string", enum: ["stdio", "unix", "local-ws"] },
  status: {
    type: "string",
    enum: ["queued", "running", "awaitingApproval", "completed", "succeeded", "failed", "cancelled", "canceled"],
  },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
} as const satisfies Record<string, JsonSchema>;

export const mobileProtocolSchemas = {
  mobileSession: {
    type: "object",
    required: ["id", "projectId", "projectName", "sourceKind", "status", "createdAt", "updatedAt"],
    properties: sessionProperties,
  },
  createSessionRequest: {
    type: "object",
    required: ["projectId", "projectName", "sourceKind"],
    properties: {
      projectId: { type: "string" },
      projectName: { type: "string" },
      sourceKind: {
        type: "string",
        enum: ["appWorkspace", "github", "documentPicker", "androidSaf", "iosSecurityScoped"],
      },
    },
  },
  uploadSnapshotRequest: {
    type: "object",
    required: ["files"],
    properties: {
      files: {
        type: "array",
        items: snapshotFileSchema,
      },
    },
  },
  projectSnapshot: {
    type: "object",
    required: ["files"],
    properties: {
      files: { type: "array", items: snapshotFileSchema },
      deletedPaths: { type: "array", items: { type: "string" } },
    },
  },
  startJobRequest: {
    type: "object",
    required: ["kind", "command"],
    properties: {
      kind: { type: "string", enum: ["build", "test", "preview", "custom"] },
      command: { type: "array", items: { type: "string" } },
      prompt: { type: "string" },
      cwd: { type: "string" },
      environmentId: { type: "string" },
    },
  },
  buildJobRequest: {
    type: "object",
    required: ["commandKind"],
    properties: {
      commandKind: {
        type: "string",
        enum: [
          "npm_install",
          "npm_test",
          "npm_build",
          "pnpm_install",
          "pnpm_test",
          "pnpm_build",
          "yarn_install",
          "yarn_test",
          "yarn_build",
          "expo_export_or_check",
          "custom",
        ],
      },
      packageManager: { type: "string", enum: ["npm", "pnpm", "yarn"] },
      workingDirectory: { type: "string" },
      artifactPaths: { type: "array", items: { type: "string" } },
      command: { type: "array", items: { type: "string" } },
    },
  },
  runnerJob: {
    type: "object",
    required: ["id", "sessionId", "kind", "command", "mode", "status", "createdAt", "updatedAt"],
    properties: runnerJobProperties,
  },
  runnerCapabilitiesResponse: {
    type: "object",
    required: [
      "defaultMode",
      "activeMode",
      "fakeRunner",
      "codexAppServerBridge",
      "supportedTransports",
      "sandboxBackends",
      "activeSandboxBackend",
      "commandKinds",
      "maxWorkspaceBytes",
      "maxArtifactBytes",
      "maxJobDurationMs",
      "maxLogBytes",
      "unsafeCustomCommandsEnabled",
      "productionOAuthEnabled",
      "remoteSandboxExecution",
      "phoneSideExecution",
    ],
    properties: {
      defaultMode: { type: "string", enum: ["fake", "codex-app-server"] },
      activeMode: { type: "string", enum: ["fake", "codex-app-server"] },
      fakeRunner: { type: "boolean" },
      codexAppServerBridge: { type: "boolean" },
      supportedTransports: { type: "array", items: { type: "string", enum: ["stdio", "unix", "local-ws"] } },
      sandboxBackends: { type: "array", items: { type: "string", enum: ["fake", "local-docker"] } },
      activeSandboxBackend: { type: "string", enum: ["fake", "local-docker"] },
      commandKinds: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "npm_install",
            "npm_test",
            "npm_build",
            "pnpm_install",
            "pnpm_test",
            "pnpm_build",
            "yarn_install",
            "yarn_test",
            "yarn_build",
            "expo_export_or_check",
            "custom",
          ],
        },
      },
      maxWorkspaceBytes: { type: "number" },
      maxArtifactBytes: { type: "number" },
      maxJobDurationMs: { type: "number" },
      maxLogBytes: { type: "number" },
      unsafeCustomCommandsEnabled: { type: "boolean" },
      productionOAuthEnabled: { type: "boolean" },
      remoteSandboxExecution: { type: "boolean" },
      phoneSideExecution: { type: "boolean" },
    },
  },
  runnerLogEvent: {
    type: "object",
    required: ["type", "sessionId", "jobId", "sequence", "stream", "level", "message", "createdAt"],
    properties: {
      type: { type: "string", enum: ["runner.log"] },
      sessionId: { type: "string" },
      jobId: { type: "string" },
      sequence: { type: "number" },
      stream: { type: "string", enum: ["stdout", "stderr", "system"] },
      level: { type: "string", enum: ["debug", "info", "warn", "error"] },
      category: { type: "string", enum: ["agentText", "plan", "diff", "approval", "tool", "error", "completion", "system"] },
      message: { type: "string" },
      createdAt: { type: "string" },
    },
  },
  patchHunk: {
    type: "object",
    required: ["oldStart", "oldLines", "newStart", "newLines", "lines"],
    properties: {
      oldStart: { type: "number" },
      oldLines: { type: "number" },
      newStart: { type: "number" },
      newLines: { type: "number" },
      lines: {
        type: "array",
        items: {
          type: "object",
          required: ["kind", "text"],
          properties: {
            kind: { type: "string", enum: ["context", "add", "remove"] },
            text: { type: "string" },
          },
        },
      },
    },
  },
  patchFileChange: {
    type: "object",
    required: ["oldPath", "newPath", "hunks"],
    properties: {
      oldPath: { type: "string" },
      newPath: { type: "string" },
      changeKind: { type: "string", enum: ["added", "modified", "deleted", "unsupported"] },
      unsupportedReason: { type: "string" },
      hunks: { type: "array", items: { type: "object" } },
    },
  },
  patchProposal: {
    type: "object",
    required: ["id", "sessionId", "summary", "unifiedDiff", "files", "createdAt"],
    properties: {
      id: { type: "string" },
      sessionId: { type: "string" },
      jobId: { type: "string" },
      source: { type: "string", enum: ["fake", "codex-app-server"] },
      appServerThreadId: { type: "string" },
      appServerTurnId: { type: "string" },
      summary: { type: "string" },
      unifiedDiff: { type: "string" },
      files: { type: "array", items: { type: "object" } },
      filesChanged: { type: "number" },
      unsupportedChanges: { type: "number" },
      status: { type: "string", enum: ["none", "available", "unsupported", "applied", "rejected", "failedToApply"] },
      metadata: { type: "object" },
      createdAt: { type: "string" },
    },
  },
  buildArtifact: {
    type: "object",
    required: ["id", "sessionId", "kind", "title", "createdAt"],
    properties: {
      id: { type: "string" },
      sessionId: { type: "string" },
      jobId: { type: "string" },
      kind: { type: "string", enum: ["webPreview", "testReport", "apk", "aab", "iosBuildLog", "other"] },
      title: { type: "string" },
      webPreviewUrl: { type: "string" },
      buildLogUrl: { type: "string" },
      apkUrl: { type: "string" },
      iosInstructions: { type: "string" },
      metadata: { type: "object" },
      createdAt: { type: "string" },
    },
  },
  buildJobResult: {
    type: "object",
    required: ["sessionId", "jobId", "backend", "commandKind", "status", "durationMs", "artifacts"],
    properties: {
      sessionId: { type: "string" },
      jobId: { type: "string" },
      backend: { type: "string", enum: ["fake", "local-docker"] },
      commandKind: {
        type: "string",
        enum: [
          "npm_install",
          "npm_test",
          "npm_build",
          "pnpm_install",
          "pnpm_test",
          "pnpm_build",
          "yarn_install",
          "yarn_test",
          "yarn_build",
          "expo_export_or_check",
          "custom",
        ],
      },
      status: {
        type: "string",
        enum: ["queued", "running", "awaitingApproval", "completed", "succeeded", "failed", "cancelled", "canceled"],
      },
      exitCode: { type: "number" },
      durationMs: { type: "number" },
      artifacts: { type: "array", items: { type: "object" } },
    },
  },
  commandPolicyViolation: {
    type: "object",
    required: ["code", "message"],
    properties: {
      code: {
        type: "string",
        enum: [
          "command_rejected_by_policy",
          "raw_shell_disabled",
          "working_directory_rejected",
          "artifact_path_rejected",
          "unsafe_custom_command_disabled",
        ],
      },
      message: { type: "string" },
      field: { type: "string" },
    },
  },
  runnerError: {
    type: "object",
    required: ["error"],
    properties: {
      error: { type: "string" },
      code: { type: "string" },
      sessionId: { type: "string" },
      jobId: { type: "string" },
    },
  },
  receivePatchRequest: {
    type: "object",
    required: ["unifiedDiff"],
    properties: {
      patchId: { type: "string" },
      unifiedDiff: { type: "string" },
      summary: { type: "string" },
    },
  },
} as const satisfies Record<string, JsonSchema>;
