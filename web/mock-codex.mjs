#!/usr/bin/env node
// Mock `codex app-server` — speaks a strict subset of the canonical
// `app-server-protocol` v2 JSON-RPC over stdio so the web UI can be
// exercised end-to-end without the real Rust binary or an OpenAI API key.
//
// Wire format: newline-delimited JSON-RPC 2.0 messages on stdin/stdout,
// matching `codex app-server --transport stdio`. The browser sends
// `ClientRequest` envelopes; this process replies with `ClientResponse`
// envelopes and emits `ServerNotification` / `ServerRequest` envelopes for
// thread/turn lifecycle events and approval prompts.
//
// All shapes track the v2 schema in
// `codex-rs/app-server-protocol/schema/typescript/v2`. Any divergence is
// a contract bug — the real backend will reject it.

import readline from "node:readline";
import { randomUUID } from "node:crypto";

const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const notify = (method, params) => out({ jsonrpc: "2.0", method, params });
const respond = (id, result) => out({ jsonrpc: "2.0", id, result });
const respondErr = (id, code, message) =>
  out({ jsonrpc: "2.0", id, error: { code, message } });

const CWD = process.env.MOCK_WORKDIR || process.cwd();

let nextServerReqId = 1;
const pendingServerRequests = new Map(); // id -> {resolve}
const sessionApprovals = new Set();      // commands accepted-for-session
const mcpServers = [
  {
    name: "demo-fs",
    startupState: "running",
    tools: [{ name: "read_file" }, { name: "write_file" }, { name: "list_dir" }],
  },
];
const threads = new Map(); // id -> Thread

const rl = readline.createInterface({ input: process.stdin });

function nowSecs() { return Math.floor(Date.now() / 1000); }
function newThread(extra = {}) {
  const id = "thr_" + randomUUID().replace(/-/g, "").slice(0, 16);
  const thread = {
    id,
    forkedFromId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: nowSecs(),
    updatedAt: nowSecs(),
    // v2 ThreadStatus is a tagged union; "idle" carries no extra fields.
    status: { type: "idle" },
    path: null,
    cwd: CWD,
    cliVersion: "mock-0.1",
    source: "appServer",
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...extra,
  };
  threads.set(id, thread);
  return thread;
}
function startResponse(thread) {
  return {
    thread,
    model: "gpt-5-mock",
    modelProvider: "openai",
    serviceTier: null,
    cwd: CWD,
    instructionSources: [],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    // v2 SandboxPolicy: tagged union. "workspaceWrite" requires writableRoots,
    // readOnlyAccess, networkAccess, excludeTmpdirEnvVar, excludeSlashTmp.
    sandbox: {
      type: "workspaceWrite",
      writableRoots: [CWD],
      readOnlyAccess: { paths: [] },
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
    reasoningEffort: "medium",
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startTurn(threadId, turnId, prompt) {
  const turn = { id: turnId, items: [], status: "inProgress", error: null,
                 startedAt: nowSecs(), completedAt: null, durationMs: null };
  notify("turn/started", { threadId, turn });

  const lower = String(prompt).toLowerCase();
  const wantPlan   = /\bplan\b/.test(lower);
  const wantApply  = /\bpatch\b|\bapply\b|\bedit\b/.test(lower);
  const wantExec   = /\brun\b|\bshell\b|\bexec\b/.test(lower);
  const wantSearch = /\bsearch\b|\bweb\b/.test(lower);
  const wantMcp    = /\bmcp\b|\bdemo[-_]?fs\b/.test(lower);
  const wantError  = /\berror\b|\bfail\b/.test(lower);

  const startedAt = Date.now();
  let p = Promise.resolve();
  if (wantPlan)   p = p.then(() => emitPlan(threadId, turnId));
  if (wantSearch) p = p.then(() => emitWebSearch(threadId, turnId));
  if (wantMcp)    p = p.then(() => emitMcp(threadId, turnId));
  if (wantExec)   p = p.then(() => emitExec(threadId, turnId));
  if (wantApply)  p = p.then(() => emitApply(threadId, turnId));
  if (wantError)  p = p.then(() => emitErrorItem(threadId, turnId));
  p = p.then(() => emitAgentMessage(threadId, turnId, prompt));
  p.then(() => {
    const completedTurn = {
      ...turn,
      status: "completed",
      completedAt: nowSecs(),
      durationMs: Date.now() - startedAt,
    };
    notify("turn/completed", { threadId, turn: completedTurn });
  });
}

async function emitAgentMessage(threadId, turnId, prompt) {
  const itemId = "msg_" + randomUUID().slice(0, 8);
  notify("item/started", {
    threadId, turnId,
    item: { type: "agentMessage", id: itemId, text: "", phase: null, memoryCitation: null },
  });
  const text = `Mock backend echo: I would help with "${(prompt ?? "").trim()}".`;
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    notify("item/agentMessage/delta", { threadId, turnId, itemId, delta: word });
    await sleep(20);
  }
  notify("item/completed", {
    threadId, turnId,
    item: { type: "agentMessage", id: itemId, text, phase: null, memoryCitation: null },
  });
}

async function emitPlan(threadId, turnId) {
  const itemId = "plan_" + randomUUID().slice(0, 6);
  notify("item/completed", {
    threadId, turnId,
    item: { type: "plan", id: itemId,
            text: "1. Read the request\n2. Draft a plan\n3. Execute the plan" },
  });
}

async function emitWebSearch(threadId, turnId) {
  const itemId = "ws_" + randomUUID().slice(0, 6);
  notify("item/completed", {
    threadId, turnId,
    item: {
      type: "mcpToolCall", id: itemId, server: "web", tool: "search",
      // v2 McpToolCallStatus: "inProgress" | "completed" | "failed".
      status: "completed",
      arguments: { query: "codex app-server protocol" },
      result: {
        content: [{ type: "text", text: "(mock results)" }],
        structuredContent: null,
        _meta: null,
      },
      error: null, durationMs: 12,
    },
  });
}

async function emitMcp(threadId, turnId) {
  const itemId = "mcp_" + randomUUID().slice(0, 6);
  notify("item/completed", {
    threadId, turnId,
    item: {
      type: "mcpToolCall", id: itemId, server: "demo-fs", tool: "list_dir",
      status: "completed",
      arguments: { path: "." },
      result: {
        content: [{ type: "text", text: "README.md\nsrc/\npackage.json" }],
        structuredContent: null,
        _meta: null,
      },
      error: null, durationMs: 8,
    },
  });
}

async function emitExec(threadId, turnId) {
  const itemId = "cmd_" + randomUUID().slice(0, 6);
  const cmd = "ls -la";
  notify("item/started", {
    threadId, turnId,
    item: {
      type: "commandExecution", id: itemId, command: cmd, cwd: CWD,
      processId: null, source: "agent", status: "inProgress",
      commandActions: [{ type: "listFiles", command: cmd, path: "." }],
      aggregatedOutput: null, exitCode: null, durationMs: null,
    },
  });
  const decision = await requestExecApproval(threadId, turnId, itemId, cmd);
  if (decision === "decline" || decision === "cancel") {
    notify("item/completed", {
      threadId, turnId,
      item: {
        type: "commandExecution", id: itemId, command: cmd, cwd: CWD,
        processId: null, source: "agent", status: "declined",
        commandActions: [{ type: "listFiles", command: cmd, path: "." }],
        aggregatedOutput: null, exitCode: null, durationMs: 0,
      },
    });
    return;
  }
  notify("item/completed", {
    threadId, turnId,
    item: {
      type: "commandExecution", id: itemId, command: cmd, cwd: CWD,
      processId: null, source: "agent", status: "completed",
      commandActions: [{ type: "listFiles", command: cmd, path: "." }],
      aggregatedOutput:
        "drwxr-xr-x  3 user  staff   96 Apr 18 12:00 .\n" +
        "drwxr-xr-x 12 user  staff  384 Apr 18 12:00 ..\n" +
        "-rw-r--r--  1 user  staff   42 Apr 18 12:00 README.md\n",
      exitCode: 0, durationMs: 18,
    },
  });
}

async function emitApply(threadId, turnId) {
  const itemId = "fc_" + randomUUID().slice(0, 6);
  // v2 PatchChangeKind is a tagged union; "update" carries optional move_path.
  const changes = [{
    path: "README.md",
    kind: { type: "update", move_path: null },
    diff: "--- a/README.md\n+++ b/README.md\n@@\n-Hello\n+Hello, Codex!\n",
  }];
  notify("item/started", {
    threadId, turnId,
    item: { type: "fileChange", id: itemId, changes, status: "inProgress" },
  });
  const decision = await requestPatchApproval(threadId, turnId, itemId);
  if (decision === "decline" || decision === "cancel") {
    notify("item/completed", {
      threadId, turnId,
      item: { type: "fileChange", id: itemId, changes, status: "declined" },
    });
    return;
  }
  notify("item/completed", {
    threadId, turnId,
    item: { type: "fileChange", id: itemId, changes, status: "completed" },
  });
}

async function emitErrorItem(threadId, turnId) {
  const itemId = "err_" + randomUUID().slice(0, 6);
  notify("item/completed", {
    threadId, turnId,
    item: {
      type: "agentMessage", id: itemId,
      text: "Simulated tool failure (mock)", phase: null, memoryCitation: null,
    },
  });
}

function requestExecApproval(threadId, turnId, itemId, command) {
  const key = "exec:" + command;
  if (sessionApprovals.has(key)) return Promise.resolve("accept");
  return serverRequest("item/commandExecution/requestApproval", {
    threadId, turnId, itemId, approvalId: null,
    reason: "mock backend would execute this command",
    command, cwd: CWD,
    commandActions: [{ type: "listFiles", command, path: "." }],
    availableDecisions: ["accept", "acceptForSession", "decline"],
  }).then((decision) => {
    if (decision === "acceptForSession") sessionApprovals.add(key);
    return decision;
  });
}

function requestPatchApproval(threadId, turnId, itemId) {
  return serverRequest("item/fileChange/requestApproval", {
    threadId, turnId, itemId,
    reason: "mock backend would write these files",
  }).then((decision) => decision);
}

function serverRequest(method, params) {
  return new Promise((resolve) => {
    const id = `srv-${nextServerReqId++}`;
    pendingServerRequests.set(id, { resolve });
    out({ jsonrpc: "2.0", id, method, params });
  });
}

function handleClientResponse(msg) {
  const pending = pendingServerRequests.get(msg.id);
  if (!pending) return;
  pendingServerRequests.delete(msg.id);
  pending.resolve(msg.result?.decision ?? "decline");
}

rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg || typeof msg !== "object") return;

  // Responses to server-initiated requests (approvals)
  if (msg.id !== undefined && msg.method === undefined) {
    handleClientResponse(msg);
    return;
  }

  switch (msg.method) {
    case "initialize":
      respond(msg.id, {
        userAgent: "codex-web-mock/0.2",
        codexHome: process.env.CODEX_HOME || ".codex",
      });
      return;

    case "account/login/start": {
      const p = msg.params ?? {};
      if (p.type === "apiKey") {
        respond(msg.id, { type: "apiKey" });
        setTimeout(() => notify("account/updated",
          { authMode: "apikey", planType: null }), 5);
        return;
      }
      if (p.type === "chatgpt" || p.type === "chatgptDeviceCode") {
        const loginId = "login_" + randomUUID().slice(0, 8);
        const verificationUrl = "https://chat.openai.com/auth/device";
        const userCode = "MOCK-" + Math.random().toString(36).slice(2, 6).toUpperCase();
        if (p.type === "chatgpt") {
          respond(msg.id, { type: "chatgpt", loginId, authUrl: verificationUrl });
        } else {
          respond(msg.id, { type: "chatgptDeviceCode", loginId, verificationUrl, userCode });
        }
        setTimeout(() => {
          notify("account/updated", { authMode: "chatgpt", planType: "pro" });
          notify("account/login/completed", { loginId, success: true, error: null });
        }, 1500);
        return;
      }
      if (p.type === "chatgptAuthTokens") {
        respond(msg.id, { type: "chatgptAuthTokens" });
        setTimeout(() => notify("account/updated",
          { authMode: "chatgptAuthTokens", planType: "pro" }), 5);
        return;
      }
      respondErr(msg.id, -32602, `unsupported login type: ${p.type}`);
      return;
    }

    case "account/logout":
      respond(msg.id, {});
      setTimeout(() => notify("account/updated", { authMode: null, planType: null }), 5);
      return;

    case "mcpServerStatus/list":
      respond(msg.id, { data: mcpServers, nextCursor: null });
      return;

    case "config/mcpServer/reload":
      respond(msg.id, { ok: true });
      mcpServers.forEach((s) =>
        notify("mcpServer/startupStatus/updated",
          { name: s.name, startupState: s.startupState }));
      return;

    case "config/value/write": {
      const p = msg.params ?? {};
      if (typeof p.keyPath !== "string" || !("value" in p) || !p.mergeStrategy) {
        respondErr(msg.id, -32602,
          "config/value/write requires { keyPath, value, mergeStrategy }");
        return;
      }
      respond(msg.id, {
        status: "written", version: String(Date.now()),
        filePath: `${process.env.CODEX_HOME || ".codex"}/config.toml`,
        overriddenMetadata: null,
      });
      return;
    }

    case "thread/list":
      // v2 ThreadListResponse: { data: Thread[], nextCursor }.
      respond(msg.id, {
        data: [...threads.values()].sort((a, b) => b.updatedAt - a.updatedAt),
        nextCursor: null,
      });
      return;

    case "thread/start": {
      const thread = newThread();
      respond(msg.id, startResponse(thread));
      notify("thread/started", { thread });
      return;
    }

    case "thread/resume": {
      const params = msg.params ?? {};
      const id = typeof params.threadId === "string" && params.threadId
        ? params.threadId : null;
      const thread = (id && threads.get(id)) || newThread(id ? { id } : {});
      thread.updatedAt = nowSecs();
      threads.set(thread.id, thread);
      respond(msg.id, startResponse(thread));
      notify("thread/started", { thread });
      return;
    }

    case "thread/compact/start": {
      const threadId = msg.params?.threadId;
      respond(msg.id, {});
      if (threadId) {
        setTimeout(() => notify("thread/compacted",
          { threadId, turnId: "compact_" + randomUUID().slice(0, 6) }), 5);
      }
      return;
    }

    case "turn/start": {
      const threadId = msg.params?.threadId;
      if (!threadId || !threads.has(threadId)) {
        respondErr(msg.id, -32602, "turn/start requires a known threadId");
        return;
      }
      const turnId = "trn_" + randomUUID().slice(0, 8);
      const input = msg.params?.input ?? [];
      const prompt = Array.isArray(input)
        ? input.filter((i) => i.type === "text").map((i) => i.text).join("\n\n")
        : String(input);
      const turn = { id: turnId, items: [], status: "inProgress", error: null,
                     startedAt: nowSecs(), completedAt: null, durationMs: null };
      respond(msg.id, { turn });
      queueMicrotask(() => startTurn(threadId, turnId, prompt));
      return;
    }

    case "turn/interrupt":
      respond(msg.id, {});
      return;

    case "serverRequest/resolved":
      // Notification from client about an approval — informational only.
      return;

    default:
      if (msg.id !== undefined)
        respondErr(msg.id, -32601, `method not supported in mock: ${msg.method}`);
  }
});

process.stderr.write("[mock-codex] ready (app-server-protocol v2 subset)\n");
