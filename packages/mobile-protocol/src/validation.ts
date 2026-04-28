import type {
  CreateSessionRequest,
  ProjectSourceKind,
  ReceivePatchRequest,
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

export function assertUploadSnapshotRequest(value: unknown): UploadSnapshotRequest {
  const object = expectRecord(value, "upload snapshot request");
  if (!Array.isArray(object.files)) {
    throw new ProtocolValidationError("files must be an array");
  }
  return {
    files: object.files.map((file, index) => {
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
    command: object.command.map((part, index) => expectString(part, `command[${index}]`)),
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

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectString(value, label);
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
