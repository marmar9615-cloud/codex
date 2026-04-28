#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const enabled = process.env.ENABLE_LIVE_CODEX_APP_SERVER_TESTS === "1";
const bin = process.env.CODEX_APP_SERVER_BIN;

if (!enabled) {
  console.log("live codex app-server smoke skipped: ENABLE_LIVE_CODEX_APP_SERVER_TESTS is not 1");
  process.exit(0);
}

if (!bin) {
  console.log("live codex app-server smoke skipped: CODEX_APP_SERVER_BIN is not set");
  process.exit(0);
}

if (!path.isAbsolute(bin) || !existsSync(bin)) {
  console.log(`live codex app-server smoke skipped: CODEX_APP_SERVER_BIN must be an existing absolute path (${bin})`);
  process.exit(0);
}

const runnerRoot = fileURLToPath(new URL("..", import.meta.url));

if (!existsSync(path.join(runnerRoot, "dist/main.js"))) {
  console.log("live codex app-server smoke skipped: build services/mobile-runner first");
  process.exit(0);
}

const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: runnerRoot,
  env: {
    ...process.env,
    PORT: "0",
    RUNNER_MODE: "codex-app-server",
    CODEX_APP_SERVER_BIN: bin,
    CODEX_APP_SERVER_TRANSPORT: process.env.CODEX_APP_SERVER_TRANSPORT ?? "stdio",
    CODEX_APP_SERVER_TIMEOUT_MS: process.env.CODEX_APP_SERVER_TIMEOUT_MS ?? "45000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  const url = await waitForRunnerUrl(child);
  const capabilities = await getJson(`${url}/capabilities`);
  if (!capabilities.codexAppServerBridge) {
    console.log("live codex app-server smoke skipped: bridge capability is unavailable");
  } else {
    const created = await postJson(`${url}/sessions`, {
      projectId: "live-smoke-project",
      projectName: "Live Codex App-Server Smoke",
      sourceKind: "appWorkspace",
    });
    const sessionId = created.session.id;
    await postJson(`${url}/sessions/${sessionId}/snapshots`, {
      files: [{ path: "README.md", contentsBase64: Buffer.from("original\n").toString("base64") }],
    });
    const started = await postJson(`${url}/sessions/${sessionId}/jobs`, {
      kind: "custom",
      command: ["codex", "smoke"],
      prompt: "Change README.md so it says live smoke test. Do not run shell commands.",
    });

    const sse = await fetchText(`${url}${started.logStreamUrl}`);
    const patchResponse = await getJson(`${url}/sessions/${sessionId}/patch`);
    if (!patchResponse.patch) {
      console.log("live codex app-server smoke completed: no PatchProposal emitted");
      if (/auth|login|credential/i.test(sse + stderr)) {
        console.log("live smoke note: output suggests auth may be missing");
      }
    } else {
      if (patchResponse.patch.source !== "codex-app-server") {
        throw new Error(`expected codex-app-server patch source, got ${patchResponse.patch.source}`);
      }
      if (typeof patchResponse.patch.unifiedDiff !== "string") {
        throw new Error("expected PatchProposal.unifiedDiff to be a string");
      }
      console.log(
        `live codex app-server smoke passed: patch=${patchResponse.patch.id} files=${patchResponse.patch.filesChanged ?? patchResponse.patch.files.length}`,
      );
    }
  }
} finally {
  child.kill("SIGTERM");
}

async function waitForRunnerUrl(childProcess) {
  let output = "";
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("runner did not start within 10s")), 10_000);
    childProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = /mobile-runner listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    childProcess.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`runner exited before startup with code ${code}: ${stderr}`));
    });
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return await response.text();
}
