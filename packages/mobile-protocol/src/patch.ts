import { normalizeWorkspaceRelativePath } from "./file-access.js";
import type { PatchHunk, PatchLine, PatchProposal } from "./types.js";

export type UnifiedPatchApplyResult =
  | { ok: true; text: string; appliedHunks: number }
  | { ok: false; error: string; failedHunk: number };

type ParsedHunk = {
  oldStart: number;
  lines: string[];
};

const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function applyUnifiedPatchToText(original: string, unifiedDiff: string): UnifiedPatchApplyResult {
  return applyPatchHunksToText(original, parseHunks(unifiedDiff));
}

export function applyPatchHunksToText(
  original: string,
  hunks: Array<{ oldStart: number; lines: string[] | PatchLine[] }>,
): UnifiedPatchApplyResult {
  const { lines: originalLines, trailingNewline } = splitText(original);
  const output: string[] = [];
  let originalIndex = 0;

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
    const hunk = hunks[hunkIndex];
    const copyUntil = Math.max(0, hunk.oldStart - 1);
    if (copyUntil < originalIndex) {
      return { ok: false, error: "overlapping or out-of-order hunk", failedHunk: hunkIndex };
    }

    while (originalIndex < copyUntil) {
      output.push(originalLines[originalIndex] ?? "");
      originalIndex += 1;
    }

    for (const patchLine of hunk.lines) {
      const rawLine =
        typeof patchLine === "string"
          ? patchLine
          : `${patchLine.kind === "context" ? " " : patchLine.kind === "add" ? "+" : "-"}${patchLine.text}`;
      if (rawLine.startsWith("\\")) {
        continue;
      }
      const operation = rawLine[0];
      const text = rawLine.slice(1);
      if (operation === " ") {
        if (originalLines[originalIndex] !== text) {
          return {
            ok: false,
            error: `context mismatch: expected ${JSON.stringify(text)}, got ${JSON.stringify(originalLines[originalIndex])}`,
            failedHunk: hunkIndex,
          };
        }
        output.push(text);
        originalIndex += 1;
      } else if (operation === "-") {
        if (originalLines[originalIndex] !== text) {
          return {
            ok: false,
            error: `remove mismatch: expected ${JSON.stringify(text)}, got ${JSON.stringify(originalLines[originalIndex])}`,
            failedHunk: hunkIndex,
          };
        }
        originalIndex += 1;
      } else if (operation === "+") {
        output.push(text);
      } else {
        return { ok: false, error: `unsupported patch line: ${rawLine}`, failedHunk: hunkIndex };
      }
    }
  }

  while (originalIndex < originalLines.length) {
    output.push(originalLines[originalIndex] ?? "");
    originalIndex += 1;
  }

  return { ok: true, text: joinText(output, trailingNewline), appliedHunks: hunks.length };
}

export type TextWorkspaceFile = {
  path: string;
  text: string;
};

export type TextWorkspaceBackup = {
  path: string;
  existed: boolean;
  text?: string;
};

export type PatchWorkspaceApplyResult =
  | { ok: true; files: TextWorkspaceFile[]; backups: TextWorkspaceBackup[] }
  | { ok: false; error: string };

export function applyPatchProposalToTextWorkspace(
  files: TextWorkspaceFile[],
  patch: PatchProposal,
  options: { workspaceRootPresent?: boolean } = {},
): PatchWorkspaceApplyResult {
  if (options.workspaceRootPresent === false) {
    return { ok: false, error: "workspace root is missing" };
  }
  if ((patch.unsupportedChanges ?? 0) > 0 || patch.files.some((file) => file.changeKind === "unsupported")) {
    return { ok: false, error: "patch includes unsupported changes" };
  }

  let nextFiles = files.map((file) => ({ path: normalizeWorkspaceRelativePath(file.path), text: file.text }));
  const backups: TextWorkspaceBackup[] = [];

  for (const change of patch.files) {
    const targetPath = normalizeWorkspaceRelativePath(change.changeKind === "deleted" ? change.oldPath : change.newPath);
    const existing = nextFiles.find((file) => file.path === targetPath);
    backups.push({ path: targetPath, existed: existing !== undefined, text: existing?.text });

    if (change.changeKind === "added") {
      if (existing) {
        return { ok: false, error: `cannot add file that already exists: ${targetPath}` };
      }
      const result = applyPatchHunksToText("", change.hunks);
      if (!result.ok) {
        return { ok: false, error: `failed to add ${targetPath}: ${result.error}` };
      }
      nextFiles = [...nextFiles, { path: targetPath, text: result.text }];
      continue;
    }

    if (!existing) {
      return { ok: false, error: `patch target is not in the active workspace: ${targetPath}` };
    }

    const result = applyPatchHunksToText(existing.text, change.hunks);
    if (!result.ok) {
      return { ok: false, error: `failed to patch ${targetPath}: ${result.error}` };
    }

    if (change.changeKind === "deleted") {
      nextFiles = nextFiles.filter((file) => file.path !== targetPath);
    } else {
      nextFiles = nextFiles.map((file) => (file.path === targetPath ? { ...file, text: result.text } : file));
    }
  }

  return { ok: true, files: nextFiles.sort((a, b) => a.path.localeCompare(b.path)), backups };
}

function parseHunks(unifiedDiff: string): ParsedHunk[] {
  const hunks: ParsedHunk[] = [];
  let current: ParsedHunk | null = null;

  for (const line of unifiedDiff.split(/\r?\n/)) {
    const match = hunkHeaderPattern.exec(line);
    if (match) {
      current = { oldStart: Number.parseInt(match[1] ?? "1", 10), lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.length === 0) {
      continue;
    }
    if (line[0] === " " || line[0] === "+" || line[0] === "-" || line[0] === "\\") {
      current.lines.push(line);
    }
  }

  return hunks;
}

function splitText(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text.length === 0) {
    return { lines: [], trailingNewline: false };
  }
  const trailingNewline = text.endsWith("\n");
  const lines = text.split(/\n/);
  if (trailingNewline) {
    lines.pop();
  }
  return { lines, trailingNewline };
}

function joinText(lines: string[], trailingNewline: boolean): string {
  const joined = lines.join("\n");
  return trailingNewline ? `${joined}\n` : joined;
}
