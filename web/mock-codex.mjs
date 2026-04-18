#!/usr/bin/env node
// Mock `codex app-server` — speaks a subset of `app-server-protocol` JSON-RPC
// over stdio so the web UI can be exercised end-to-end without the real
// Rust binary or an OpenAI API key.
//
// Wire format: newline-delimited JSON-RPC 2.0 messages on stdin/stdout,
// matching `codex app-server --transport stdio`. The browser sends
// `ClientRequest` envelopes; this process replies with `ClientResponse`
// envelopes and emits `ServerNotification` / `ServerRequest` envelopes for
// thread/turn lifecycle events and approval prompts.
//
// Implemented methods (subset):
//   initialize, thread/start, turn/start, turn/interrupt,
//   mcpServerStatus/list, account/login/start, account/logout,
//   loginApiKey, item/* request approvals (server -> client requests),
//   thread/list (returns []), serverRequest/resolved (no-op).

import readline from "node:readline";
import { randomUUID } from "node:crypto";

const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const notify = (method, params) => out({ jsonrpc: "2.0", method, params });
const respond = (id, result) => out({ jsonrpc: "2.0", id, result });
const respondErr = (id, code, message) => out({ jsonrpc: "2.0", id, error: { code, message } });

let nextServerReqId = 1;
let pendingServerRequests = new Map(); // id -> {resolve}
const sessionApprovals = new Set();    // commands approved-for-session
const mcpServers = [
  { name: "demo-fs", status: "connected", tools: ["read_file", "write_file", "list_dir"] },
];
const threads = new Map(); // id -> {name, lastActive}

const rl = readline.createInterface({ input: process.stdin });

function ts() { return new Date().toISOString(); }

function startTurn(conversationId, turnId, prompt) {
  notify("turn/started", { conversationId, turnId, startedAt: ts() });

  const lower = String(prompt).toLowerCase();
  const wantPlan   = /\bplan\b/.test(lower);
  const wantApply  = /\bpatch\b|\bapply\b|\bedit\b/.test(lower);
  const wantExec   = /\brun\b|\bshell\b|\bexec\b/.test(lower);
  const wantSearch = /\bsearch\b|\bweb\b/.test(lower);
  const wantMcp    = /\bmcp\b|\bdemo[-_]?fs\b/.test(lower);
  const wantError  = /\berror\b|\bfail\b/.test(lower);

  let p = Promise.resolve();
  if (wantPlan) p = p.then(() => emitPlan(conversationId));
  if (wantSearch) p = p.then(() => emitWebSearch(conversationId));
  if (wantMcp) p = p.then(() => emitMcp(conversationId));
  if (wantExec) p = p.then(() => emitExec(conversationId));
  if (wantApply) p = p.then(() => emitApply(conversationId));
  if (wantError) p = p.then(() => emitErrorItem(conversationId));
  p = p.then(() => emitAgentMessage(conversationId, prompt));
  p.then(() => {
    notify("turn/completed", {
      conversationId, turnId, completedAt: ts(),
      usage: { input_tokens: 42 + (prompt?.length ?? 0), output_tokens: 88 },
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function emitAgentMessage(conversationId, prompt) {
  const itemId = "msg-" + randomUUID().slice(0, 8);
  notify("item/started", {
    conversationId,
    item: { id: itemId, type: "agent_message", text: "", status: "in_progress" },
  });
  const text = `Mock backend echo: I would help with "${(prompt ?? "").trim()}".`;
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    notify("item/agentMessage/delta", { conversationId, itemId, delta: word });
    await sleep(20);
  }
  notify("item/completed", {
    conversationId,
    item: { id: itemId, type: "agent_message", text, status: "completed" },
  });
}

async function emitPlan(conversationId) {
  const itemId = "plan-" + randomUUID().slice(0, 6);
  const items = [
    { text: "Read the request", completed: true },
    { text: "Draft a plan",     completed: true },
    { text: "Execute the plan", completed: false },
  ];
  notify("item/completed", {
    conversationId,
    item: { id: itemId, type: "todo_list", items, status: "completed" },
  });
}

async function emitWebSearch(conversationId) {
  const itemId = "ws-" + randomUUID().slice(0, 6);
  notify("item/completed", {
    conversationId,
    item: { id: itemId, type: "web_search", query: "codex app-server protocol", status: "completed" },
  });
}

async function emitMcp(conversationId) {
  const itemId = "mcp-" + randomUUID().slice(0, 6);
  notify("item/completed", {
    conversationId,
    item: {
      id: itemId, type: "mcp_tool_call", server: "demo-fs", tool: "list_dir",
      arguments: { path: "." }, result: { entries: ["README.md", "src/", "package.json"] },
      status: "completed",
    },
  });
}

async function emitExec(conversationId) {
  const itemId = "cmd-" + randomUUID().slice(0, 6);
  const cmd = "ls -la";
  notify("item/started", {
    conversationId,
    item: { id: itemId, type: "command_execution", command: cmd, status: "pending_approval" },
  });
  const decision = await requestExecApproval(conversationId, itemId, cmd);
  if (decision === "denied") {
    notify("item/completed", {
      conversationId,
      item: { id: itemId, type: "command_execution", command: cmd, status: "rejected" },
    });
    return;
  }
  notify("item/completed", {
    conversationId,
    item: {
      id: itemId, type: "command_execution", command: cmd, status: "completed",
      exit_code: 0,
      aggregated_output: "drwxr-xr-x  3 user  staff   96 Apr 18 12:00 .\ndrwxr-xr-x 12 user  staff  384 Apr 18 12:00 ..\n-rw-r--r--  1 user  staff   42 Apr 18 12:00 README.md\n",
    },
  });
}

async function emitApply(conversationId) {
  const itemId = "fc-" + randomUUID().slice(0, 6);
  const changes = [{
    kind: "modify", path: "README.md",
    diff: "--- a/README.md\n+++ b/README.md\n@@\n-Hello\n+Hello, Codex!\n",
  }];
  notify("item/started", {
    conversationId,
    item: { id: itemId, type: "file_change", changes, status: "pending_approval" },
  });
  const decision = await requestPatchApproval(conversationId, itemId, changes);
  if (decision === "denied") {
    notify("item/completed", {
      conversationId,
      item: { id: itemId, type: "file_change", changes, status: "rejected" },
    });
    return;
  }
  notify("item/completed", {
    conversationId,
    item: { id: itemId, type: "file_change", changes, status: "completed" },
  });
}

async function emitErrorItem(conversationId) {
  const itemId = "err-" + randomUUID().slice(0, 6);
  notify("item/completed", {
    conversationId,
    item: { id: itemId, type: "error", message: "Simulated tool failure (mock)", status: "failed" },
  });
}

function requestExecApproval(conversationId, callId, command) {
  const key = "exec:" + command;
  if (sessionApprovals.has(key)) return Promise.resolve("approved");
  return serverRequest("item/commandExecution/requestApproval", {
    conversationId, callId, command: command.split(" "), cwd: process.env.MOCK_WORKDIR || ".",
    reason: "mock backend would execute this command",
    parsedCmd: [],
  }).then((decision) => {
    if (decision === "approved_for_session") sessionApprovals.add(key);
    return decision === "denied" ? "denied" : "approved";
  });
}

function requestPatchApproval(conversationId, callId, changes) {
  const file_changes = {};
  for (const c of changes) file_changes[c.path] = { kind: c.kind, diff: c.diff };
  return serverRequest("item/fileChange/requestApproval", {
    conversationId, callId, file_changes,
    reason: "mock backend would write these files",
  }).then((decision) => decision === "denied" ? "denied" : "approved");
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
  const decision = msg.result?.decision ?? "denied";
  pending.resolve(decision);
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
        userAgent: "codex-web-mock/0.1",
        codexHome: process.env.CODEX_HOME || ".codex",
        platformFamily: "unix",
        platformOs: process.platform,
      });
      return;

    case "loginApiKey":
      respond(msg.id, { ok: true });
      return;

    case "account/login/start": {
      // Device-code stub. In real backend this returns a verification URL
      // and resolves later via `account/updated` notification.
      const verificationUri = "https://chat.openai.com/auth/device";
      const userCode = "MOCK-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      respond(msg.id, { verificationUri, userCode, expiresIn: 600 });
      setTimeout(() => {
        notify("account/updated", {
          account: { email: "demo@chatgpt", plan: "pro" },
          authMethod: "chatgpt",
        });
      }, 2000);
      return;
    }

    case "account/logout":
      respond(msg.id, { ok: true });
      return;

    case "mcpServerStatus/list":
      respond(msg.id, { servers: mcpServers });
      return;

    case "config/mcpServer/reload":
      respond(msg.id, { ok: true });
      mcpServers.forEach((s) => notify("mcpServer/startupStatus/updated", { name: s.name, status: s.status }));
      return;

    case "thread/list":
      respond(msg.id, { threads: [...threads.entries()].map(([id, m]) => ({ conversationId: id, ...m })) });
      return;

    case "thread/start": {
      const conversationId = "thr-" + randomUUID().slice(0, 8);
      threads.set(conversationId, { name: null, lastActive: Date.now() });
      respond(msg.id, { conversationId });
      notify("thread/started", { conversationId, startedAt: ts() });
      return;
    }

    case "thread/resume": {
      const conversationId = msg.params?.conversationId ?? "thr-" + randomUUID().slice(0, 8);
      threads.set(conversationId, { name: null, lastActive: Date.now() });
      respond(msg.id, { conversationId });
      notify("thread/started", { conversationId, startedAt: ts(), resumed: true });
      return;
    }

    case "turn/start": {
      const conversationId = msg.params?.conversationId;
      const turnId = "trn-" + randomUUID().slice(0, 8);
      const input = msg.params?.input ?? [];
      const prompt = Array.isArray(input)
        ? input.filter((i) => i.type === "text").map((i) => i.text).join("\n\n")
        : String(input);
      respond(msg.id, { turnId });
      queueMicrotask(() => startTurn(conversationId, turnId, prompt));
      return;
    }

    case "turn/interrupt":
      respond(msg.id, { abortReason: "user_interrupt" });
      return;

    case "serverRequest/resolved":
      // Notification only; nothing to do here.
      return;

    default:
      if (msg.id !== undefined) respondErr(msg.id, -32601, `method not supported in mock: ${msg.method}`);
  }
});

// Greet the gateway with a banner so log-watchers see we're up.
process.stderr.write("[mock-codex] ready (app-server-protocol subset)\n");
