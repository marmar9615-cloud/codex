export type UnifiedPatchApplyResult =
  | { ok: true; text: string; appliedHunks: number }
  | { ok: false; error: string; failedHunk: number };

type ParsedHunk = {
  oldStart: number;
  lines: string[];
};

const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function applyUnifiedPatchToText(original: string, unifiedDiff: string): UnifiedPatchApplyResult {
  const hunks = parseHunks(unifiedDiff);
  const { lines: originalLines, trailingNewline } = splitText(original);
  const output: string[] = [];
  let originalIndex = 0;

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
    const hunk = hunks[hunkIndex];
    const copyUntil = hunk.oldStart - 1;
    if (copyUntil < originalIndex) {
      return { ok: false, error: "overlapping or out-of-order hunk", failedHunk: hunkIndex };
    }

    while (originalIndex < copyUntil) {
      output.push(originalLines[originalIndex] ?? "");
      originalIndex += 1;
    }

    for (const rawLine of hunk.lines) {
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
