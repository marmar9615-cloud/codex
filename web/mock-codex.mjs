#!/usr/bin/env node
// mock-codex — emits realistic Codex `exec --experimental-json` events so the
// web UI can be exercised end-to-end without the Rust binary or an API key.
//
// Reads the user prompt on stdin (one shot), emits JSONL events on stdout.
// Out-of-band approval requests/responses use a custom envelope so the
// gateway can intercept them.

import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import readline from "node:readline";

const out = (obj) => { process.stdout.write(JSON.stringify(obj) + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const APPROVAL_POLICY = process.env.MOCK_APPROVAL_POLICY ?? "on-request";
const WORKDIR = process.env.MOCK_WORKDIR ?? process.cwd();
const MODEL = process.env.MOCK_MODEL ?? "mock-gpt";
const RESUME_THREAD_ID = process.env.MOCK_THREAD_ID || "";

// Single line-based protocol on stdin:
//   {type:"prompt", text:"..."}        — kicks off the turn (sent once)
//   {type:"approval.response", approval_id, decision}
const approvalWaiters = new Map();
let promptResolver = null;
function readPrompt() {
  return new Promise((resolve) => { promptResolver = resolve; });
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.type === "prompt" && promptResolver) {
    const r = promptResolver; promptResolver = null;
    r(String(m.text ?? ""));
  } else if (m.type === "approval.response") {
    const cb = approvalWaiters.get(m.approval_id);
    if (cb) { approvalWaiters.delete(m.approval_id); cb(m.decision); }
  }
});

function requestApproval(request) {
  return new Promise((resolve) => {
    const id = randomUUID();
    approvalWaiters.set(id, resolve);
    out({ type: "approval.request", approval_id: id, request });
  });
}

async function streamAgentMessage(text) {
  const id = randomUUID();
  out({ type: "item.started", item: { id, type: "agent_message", text: "" } });
  let acc = "";
  // emit roughly word-by-word
  const tokens = text.split(/(\s+)/);
  for (const tok of tokens) {
    acc += tok;
    out({ type: "item.updated", item: { id, type: "agent_message", text: acc } });
    await sleep(15 + Math.floor(Math.random() * 30));
  }
  out({ type: "item.completed", item: { id, type: "agent_message", text: acc } });
}

async function commandExec(command, output, exitCode = 0) {
  const id = randomUUID();
  out({ type: "item.started", item: { id, type: "command_execution", command, aggregated_output: "", status: "in_progress" } });
  let acc = "";
  for (const line of output.split("\n")) {
    acc += line + "\n";
    out({ type: "item.updated", item: { id, type: "command_execution", command, aggregated_output: acc, status: "in_progress" } });
    await sleep(40);
  }
  out({
    type: "item.completed",
    item: {
      id, type: "command_execution", command, aggregated_output: acc.trimEnd(),
      exit_code: exitCode, status: exitCode === 0 ? "completed" : "failed",
    },
  });
}

async function fileChange(changes, status = "completed") {
  const id = randomUUID();
  out({ type: "item.started", item: { id, type: "file_change", changes, status: "completed" } });
  out({ type: "item.completed", item: { id, type: "file_change", changes, status } });
}

async function reasoning(text) {
  const id = randomUUID();
  out({ type: "item.started", item: { id, type: "reasoning", text: "" } });
  let acc = "";
  for (const tok of text.split(/(\s+)/)) {
    acc += tok;
    out({ type: "item.updated", item: { id, type: "reasoning", text: acc } });
    await sleep(8);
  }
  out({ type: "item.completed", item: { id, type: "reasoning", text: acc } });
}

async function main() {
  const prompt = (await readPrompt()).trim();

  const threadId = RESUME_THREAD_ID || `mock-${randomUUID().slice(0, 8)}`;
  out({ type: "thread.started", thread_id: threadId });
  out({ type: "turn.started" });

  const lower = prompt.toLowerCase();

  // simulate reasoning
  await reasoning(`The user said: "${prompt.slice(0, 120)}". I will ${pickIntent(lower)}.`);

  // Branch on intent so the UI exercises every item type.
  if (lower.includes("error") || lower.includes("fail")) {
    await streamAgentMessage("I'll try to run a failing command to demonstrate error handling.");
    await commandExec("ls /nonexistent-path", "ls: cannot access '/nonexistent-path': No such file or directory", 2);
    await streamAgentMessage("As expected, the command failed with exit code 2.");
  } else if (lower.includes("write") || lower.includes("create") || lower.includes("make a file")) {
    await streamAgentMessage("I'll create a small file to show the diff viewer.");
    if (APPROVAL_POLICY !== "never") {
      const decision = await requestApproval({
        kind: "apply_patch",
        summary: "Create example.txt",
        files: [{ path: "example.txt", kind: "add" }],
      });
      if (decision !== "approve" && decision !== "approve-session") {
        await streamAgentMessage("OK, I won't make that change.");
        out({ type: "turn.completed", usage: { input_tokens: 42, cached_input_tokens: 0, output_tokens: 24 } });
        return;
      }
    }
    const path = "example.txt";
    await mkdir(dirname(join(WORKDIR, path)), { recursive: true }).catch(() => {});
    await writeFile(join(WORKDIR, path), "Hello from Codex Web!\n");
    await fileChange([{ path, kind: "add" }]);
    await streamAgentMessage("Done — created `example.txt` in the working directory.");
  } else if (lower.includes("search") || lower.includes("web")) {
    const id = randomUUID();
    out({ type: "item.started", item: { id, type: "web_search", query: prompt.slice(0, 80) } });
    await sleep(400);
    out({ type: "item.completed", item: { id, type: "web_search", query: prompt.slice(0, 80) } });
    await streamAgentMessage("I searched the web and synthesized the results above.");
  } else if (lower.includes("plan") || lower.includes("todo")) {
    const id = randomUUID();
    const items = [
      { text: "Investigate the request", completed: true },
      { text: "Draft an approach", completed: true },
      { text: "Implement the change", completed: false },
      { text: "Verify and report back", completed: false },
    ];
    out({ type: "item.started", item: { id, type: "todo_list", items } });
    out({ type: "item.completed", item: { id, type: "todo_list", items } });
    await streamAgentMessage("Here's my plan. I'll proceed step by step.");
  } else {
    if (APPROVAL_POLICY !== "never") {
      const decision = await requestApproval({
        kind: "exec",
        command: "ls -la",
        cwd: WORKDIR,
        reason: "List files to understand the working directory",
      });
      if (decision === "approve" || decision === "approve-session") {
        await commandExec("ls -la", "total 8\ndrwxr-xr-x 2 user user 4096 Apr 18 14:50 .\ndrwxr-xr-x 4 user user 4096 Apr 18 14:50 ..\n", 0);
      } else {
        await streamAgentMessage("OK, skipping the exec.");
      }
    } else {
      await commandExec("echo hello", "hello", 0);
    }
    await streamAgentMessage(
      `Hi! I'm running in mock mode (model: \`${MODEL}\`). ` +
      "Try prompts that contain words like *write*, *plan*, *search*, or *error* " +
      "to see different tool-call cards. Set the `CODEX_BIN` env var on the server " +
      "and sign in to use the real Codex backend."
    );
  }

  out({ type: "turn.completed", usage: { input_tokens: 128, cached_input_tokens: 0, output_tokens: 256 } });
}

function pickIntent(p) {
  if (p.includes("error")) return "demonstrate an error";
  if (p.includes("write") || p.includes("create")) return "create a file";
  if (p.includes("search")) return "search the web";
  if (p.includes("plan") || p.includes("todo")) return "draft a plan";
  return "respond conversationally and run a small shell command";
}

main().then(() => process.exit(0)).catch((err) => {
  out({ type: "error", message: err?.message ?? String(err) });
  process.exit(1);
});
