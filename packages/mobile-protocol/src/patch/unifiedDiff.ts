import { normalizeWorkspaceRelativePath } from "../file-access.js";
import type { PatchFileChange, PatchFileChangeKind, PatchHunk, PatchLine, PatchProposal, PatchSource } from "../types.js";

export type ParseUnifiedDiffOptions = {
  id: string;
  sessionId: string;
  createdAt: string;
  source?: PatchSource;
  jobId?: string;
  appServerThreadId?: string;
  appServerTurnId?: string;
  summary?: string;
  metadata?: Record<string, string>;
};

export class UnifiedDiffParseError extends Error {
  constructor(
    message: string,
    readonly code = "invalid_unified_diff",
  ) {
    super(message);
    this.name = "UnifiedDiffParseError";
  }
}

const diffGitPattern = /^diff --git\s+(.+?)\s+(.+)$/;
const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiffToPatchProposal(unifiedDiff: string, options: ParseUnifiedDiffOptions): PatchProposal {
  const files = parseUnifiedDiffFiles(unifiedDiff);
  const unsupportedChanges = files.filter((file) => file.changeKind === "unsupported").length;
  const filesChanged = files.length;
  const status = filesChanged === 0 ? "none" : unsupportedChanges > 0 ? "unsupported" : "available";
  return {
    id: options.id,
    sessionId: options.sessionId,
    jobId: options.jobId,
    source: options.source,
    appServerThreadId: options.appServerThreadId,
    appServerTurnId: options.appServerTurnId,
    summary: options.summary ?? summarizePatch(filesChanged, unsupportedChanges),
    unifiedDiff,
    files,
    filesChanged,
    unsupportedChanges,
    status,
    metadata: options.metadata,
    createdAt: options.createdAt,
  };
}

export function parseUnifiedDiffFiles(unifiedDiff: string): PatchFileChange[] {
  if (unifiedDiff.trim().length === 0) {
    return [];
  }

  const files: MutablePatchFile[] = [];
  let current: MutablePatchFile | null = null;
  let currentHunk: PatchHunk | null = null;

  const flushCurrent = () => {
    if (!current) {
      return;
    }
    finalizeCurrentFile(current);
    files.push(current);
    current = null;
    currentHunk = null;
  };

  for (const rawLine of unifiedDiff.split(/\r?\n/)) {
    if (current && currentHunk) {
      if (rawLine.startsWith("\\")) {
        continue;
      }
      const prefix = rawLine[0];
      if (prefix === " " || prefix === "+" || prefix === "-") {
        currentHunk.lines.push({
          kind: prefix === " " ? "context" : prefix === "+" ? "add" : "remove",
          text: rawLine.slice(1),
        });
        continue;
      }
    }

    const diffMatch = diffGitPattern.exec(rawLine);
    if (diffMatch) {
      flushCurrent();
      current = {
        oldPath: normalizeDiffPath(diffMatch[1] ?? ""),
        newPath: normalizeDiffPath(diffMatch[2] ?? ""),
        hunks: [],
      };
      continue;
    }

    if (rawLine.startsWith("--- ")) {
      if (!current) {
        current = { oldPath: "", newPath: "", hunks: [] };
      }
      current.oldPath = normalizeDiffPath(rawLine.slice(4));
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      if (!current) {
        current = { oldPath: "", newPath: "", hunks: [] };
      }
      current.newPath = normalizeDiffPath(rawLine.slice(4));
      continue;
    }

    if (!current) {
      continue;
    }

    if (rawLine.startsWith("Binary files ") || rawLine === "GIT binary patch") {
      current.changeKind = "unsupported";
      current.unsupportedReason = "Binary patch content is not supported by the mobile patch applier.";
      continue;
    }

    if (rawLine.startsWith("rename from ") || rawLine.startsWith("rename to ")) {
      current.changeKind = "unsupported";
      current.unsupportedReason = "Rename-only patches are not supported by the mobile patch applier yet.";
      continue;
    }

    const hunkMatch = hunkHeaderPattern.exec(rawLine);
    if (hunkMatch) {
      currentHunk = {
        oldStart: Number.parseInt(hunkMatch[1] ?? "0", 10),
        oldLines: parseCount(hunkMatch[2]),
        newStart: Number.parseInt(hunkMatch[3] ?? "0", 10),
        newLines: parseCount(hunkMatch[4]),
        lines: [],
      };
      current.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk || rawLine.length === 0 || rawLine.startsWith("\\")) {
      continue;
    }
  }

  flushCurrent();
  return files.map((file) => ({ ...file }));
}

function finalizeCurrentFile(file: MutablePatchFile): void {
  if (!file.oldPath && !file.newPath) {
    throw new UnifiedDiffParseError("diff file header did not include paths");
  }
  if (file.oldPath === "/dev/null") {
    file.oldPath = file.newPath;
    file.changeKind = file.changeKind ?? "added";
  } else if (file.newPath === "/dev/null") {
    file.newPath = file.oldPath;
    file.changeKind = file.changeKind ?? "deleted";
  } else {
    file.changeKind = file.changeKind ?? "modified";
  }
  if (file.changeKind !== "unsupported" && file.hunks.length === 0) {
    file.changeKind = "unsupported";
    file.unsupportedReason = "Unified diff did not include text hunks.";
  }
}

function normalizeDiffPath(rawPath: string): string {
  const trimmed = rawPath.trim().split(/\t/)[0]?.trim() ?? "";
  const unquoted = unquotePath(trimmed);
  if (unquoted === "/dev/null") {
    return "/dev/null";
  }
  if (unquoted.startsWith("/") || /^[A-Za-z]:[\\/]/.test(unquoted)) {
    throw new UnifiedDiffParseError(`absolute paths are not allowed in patches: ${rawPath}`, "patch_path_not_relative");
  }
  const withoutPrefix = unquoted.startsWith("a/") || unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted;
  if (withoutPrefix.length === 0) {
    throw new UnifiedDiffParseError("patch path is empty");
  }
  try {
    return normalizeWorkspaceRelativePath(withoutPrefix);
  } catch (error) {
    const message = error instanceof Error ? error.message : `path escapes workspace: ${rawPath}`;
    throw new UnifiedDiffParseError(message, "patch_path_escapes_workspace");
  }
}

function unquotePath(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1).replaceAll('\\"', '"');
  }
  return path;
}

function parseCount(value: string | undefined): number {
  return value === undefined ? 1 : Number.parseInt(value, 10);
}

function summarizePatch(filesChanged: number, unsupportedChanges: number): string {
  if (filesChanged === 0) {
    return "Codex app-server completed without file changes.";
  }
  if (unsupportedChanges > 0) {
    return `Codex app-server proposed ${filesChanged} file change(s), including ${unsupportedChanges} unsupported change(s).`;
  }
  return `Codex app-server proposed ${filesChanged} file change(s).`;
}

type MutablePatchFile = {
  oldPath: string;
  newPath: string;
  changeKind?: PatchFileChangeKind;
  unsupportedReason?: string;
  hunks: PatchHunk[];
};

export function patchFileLinePreview(file: PatchFileChange): PatchLine[] {
  return file.hunks.flatMap((hunk) => hunk.lines);
}
