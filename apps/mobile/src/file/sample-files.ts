import { normalizeWorkspaceRelativePath } from "@codex/mobile-protocol";
import type { ProjectSnapshot } from "@codex/mobile-protocol";

export type WorkspaceTextFile = {
  path: string;
  text: string;
};

export const sampleWorkspaceFiles: WorkspaceTextFile[] = [
  {
    path: "package.json",
    text: `{
  "name": "codex-mobile-sample",
  "private": true,
  "scripts": {
    "test": "echo \\"fake runner test\\""
  }
}
`,
  },
  {
    path: "src/App.tsx",
    text: `import React from "react";
import { Text } from "react-native";

export function App() {
  return <Text>Codex</Text>;
}
`,
  },
  {
    path: "README.md",
    text: `# Codex Mobile Sample

This sample project lives inside the app workspace. Build and test commands run in the remote runner stub.
`,
  },
];

export function makeProjectSnapshot(files: WorkspaceTextFile[]): ProjectSnapshot {
  return {
    files: files.map((file) => ({
      path: normalizeWorkspaceRelativePath(file.path),
      contentsBase64: encodeUtf8Base64(file.text),
    })),
  };
}

export function updateWorkspaceTextFile(
  files: WorkspaceTextFile[],
  path: string,
  text: string,
): WorkspaceTextFile[] {
  const normalizedPath = normalizeWorkspaceRelativePath(path);
  return files.map((file) => (file.path === normalizedPath ? { ...file, text } : file));
}

export function findWorkspaceTextFile(files: WorkspaceTextFile[], path: string): WorkspaceTextFile | undefined {
  const normalizedPath = normalizeWorkspaceRelativePath(path);
  return files.find((file) => file.path === normalizedPath);
}

export function encodeUtf8Base64(input: string): string {
  const bytes = encodeUtf8(input);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return output;
}

function encodeUtf8(input: string): number[] {
  const bytes: number[] = [];
  for (const char of input) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}
