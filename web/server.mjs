// Codex Web — browser-based front-end for Codex CLI.
//
// The browser is a thin client. It talks to this gateway over a WebSocket.
// For each browser session, this gateway spawns a backend agent process that
// emits Codex's JSONL event stream (the same protocol used by
// `codex exec --experimental-json` and the official TypeScript SDK).
//
// Two backends are supported:
//   - `real`: spawn the real `codex` binary located at $CODEX_BIN.
//   - `mock`: spawn the bundled mock-codex.mjs which emits realistic
//             JSONL events for end-to-end demonstration without OpenAI keys.
//
// Selection rules:
//   - If session has an apiKey AND $CODEX_BIN points at an executable,
//     the real binary is used.
//   - Otherwise, the mock backend runs.
//
// Credentials never leave the server: the API key is stored in an in-memory
// session map keyed by an http-only session cookie. The browser only ever
// sees the session id.

import express from "express";
import cookieParser from "cookie-parser";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);
const HOST = "0.0.0.0";
const PUBLIC_DIR = join(__dirname, "public");
const WORKDIR_ROOT = resolve(process.env.CODEX_WEB_WORKDIR_ROOT ?? join(__dirname, ".workdirs"));
const CODEX_BIN = process.env.CODEX_BIN ?? "";
const MOCK_BIN = join(__dirname, "mock-codex.mjs");

mkdirSync(WORKDIR_ROOT, { recursive: true });

// -------- session store (in-memory) --------
// session: { id, apiKey?, createdAt, lastSeenAt, workdir, threads: Map<threadId, {name, lastActive}> }
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days idle
const SESSION_MAX = 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - (s.lastSeenAt ?? s.createdAt) > SESSION_TTL_MS) {
      // Purge in-memory credentials & metadata; the workdir on disk is left
      // intact so users can recover files if they re-authenticate.
      sessions.delete(id);
    }
  }
  // Hard cap to bound memory.
  if (sessions.size > SESSION_MAX) {
    const sorted = [...sessions.entries()].sort((a, b) => (a[1].lastSeenAt ?? 0) - (b[1].lastSeenAt ?? 0));
    while (sessions.size > SESSION_MAX) sessions.delete(sorted.shift()[0]);
  }
}, 60 * 60 * 1000).unref();

function touchSession(s) { if (s) s.lastSeenAt = Date.now(); }

function getOrCreateSession(req, res) {
  let id = req.cookies?.codexsid;
  if (id && sessions.has(id)) return sessions.get(id);
  id = randomUUID();
  const workdir = join(WORKDIR_ROOT, id);
  mkdirSync(workdir, { recursive: true });
  const session = {
    id,
    apiKey: undefined,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    workdir,
    threads: new Map(),
  };
  sessions.set(id, session);
  res.cookie("codexsid", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // proxy strips TLS at the edge
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return session;
}

function getSessionFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const m = /(?:^|;\s*)codexsid=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  const s = sessions.get(m[1]) ?? null;
  touchSession(s);
  return s;
}

// Lightweight same-origin guard for credential-bearing endpoints.
function sameOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser caller (e.g. curl) — no cookie auth was used
  const host = req.headers.host;
  try {
    const u = new URL(origin);
    if (u.host === host) return next();
  } catch {}
  res.status(403).json({ error: "cross-origin request rejected" });
}

// -------- HTTP app --------
const app = express();
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// Disable cache in development so the browser always sees fresh JS/CSS.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

app.get("/api/whoami", (req, res) => {
  const s = getOrCreateSession(req, res);
  res.json({
    sessionId: s.id,
    hasApiKey: Boolean(s.apiKey),
    backend: backendKindFor(s),
    realBinaryConfigured: Boolean(CODEX_BIN && existsSync(CODEX_BIN)),
    workdir: s.workdir,
    threadCount: s.threads.size,
  });
});

app.post("/api/login", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  const { apiKey } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }
  s.apiKey = apiKey.trim();
  res.json({ ok: true, backend: backendKindFor(s) });
});

app.post("/api/logout", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  s.apiKey = undefined;
  res.json({ ok: true });
});

app.get("/api/threads", (req, res) => {
  const s = getOrCreateSession(req, res);
  const items = [...s.threads.entries()]
    .map(([id, meta]) => ({ id, ...meta }))
    .sort((a, b) => b.lastActive - a.lastActive);
  res.json({ threads: items });
});

app.post("/api/file-search", sameOriginOnly, async (req, res) => {
  const s = getOrCreateSession(req, res);
  const { query } = req.body ?? {};
  if (typeof query !== "string") {
    res.status(400).json({ error: "query required" });
    return;
  }
  const results = await searchWorkdir(s.workdir, query);
  res.json({ results });
});

function backendKindFor(s) {
  if (s.apiKey && CODEX_BIN && existsSync(CODEX_BIN)) return "real";
  return "mock";
}

async function searchWorkdir(root, query) {
  const out = [];
  const q = query.toLowerCase();
  const limit = 25;
  async function walk(dir, rel) {
    if (out.length >= limit) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(full, r);
      } else if (e.name.toLowerCase().includes(q) || r.toLowerCase().includes(q)) {
        out.push(r);
      }
    }
  }
  await walk(root, "");
  return out;
}

// -------- WebSocket gateway --------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

server.on("upgrade", (req) => {
  // Origin check on the WebSocket handshake. The 'ws' library will still
  // perform the upgrade; we validate here and let the normal handler reject.
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.host !== host) {
        req.destroy();
      }
    } catch { req.destroy(); }
  }
});

wss.on("connection", (ws, req) => {
  const session = getSessionFromCookie(req.headers.cookie);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", message: "no session; reload the page" }));
    ws.close();
    return;
  }
  const conn = new BridgeConnection(ws, session);
  ws.on("message", (raw) => conn.onMessage(raw));
  ws.on("close", () => conn.onClose());
  ws.on("error", () => conn.onClose());
  conn.send({ type: "ready", backend: backendKindFor(session), workdir: session.workdir });
});

class BridgeConnection {
  constructor(ws, session) {
    this.ws = ws;
    this.session = session;
    this.child = null;
    this.threadId = null;
    this.pendingApprovals = new Map(); // approvalId -> resolved decision
  }

  send(msg) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }
    switch (msg.type) {
      case "turn.start":
        return this.startTurn(msg);
      case "turn.interrupt":
        return this.interrupt();
      case "approval.respond":
        return this.respondApproval(msg);
      default:
        this.send({ type: "error", message: `unknown client message: ${msg.type}` });
    }
  }

  onClose() {
    this.killChild();
  }

  killChild() {
    const c = this.child;
    if (c && !c.killed) {
      try { c.kill("SIGTERM"); } catch {}
      // Escalate to SIGKILL if the child doesn't exit promptly.
      setTimeout(() => { try { if (!c.killed) c.kill("SIGKILL"); } catch {} }, 3000).unref();
    }
    this.child = null;
  }

  interrupt() {
    if (this.child) {
      this.killChild();
      this.send({ type: "turn.failed", error: { message: "interrupted" } });
    }
  }

  respondApproval({ approvalId, decision }) {
    const cb = this.pendingApprovals.get(approvalId);
    if (cb) {
      this.pendingApprovals.delete(approvalId);
      cb(decision);
    }
  }

  startTurn(msg) {
    if (this.child) {
      this.send({ type: "error", message: "another turn is in progress" });
      return;
    }
    const {
      input,
      threadId,
      model,
      sandboxMode = "workspace-write",
      approvalPolicy = "on-request",
      networkAccessEnabled = false,
      modelReasoningEffort,
      webSearchMode,
    } = msg;

    const kind = backendKindFor(this.session);
    let bin, args, env = { ...process.env };

    if (kind === "real") {
      // The real `codex exec --experimental-json` path does not surface
      // interactive approvals over its JSONL stream — those come from the
      // separate JSON-RPC app-server, which this MVP gateway does not bridge.
      // Force `approval_policy=never` for the real backend so turns can't
      // deadlock waiting on a UI prompt that will never fire.
      const realApprovalPolicy = "never";
      bin = CODEX_BIN;
      args = ["exec", "--experimental-json", "--skip-git-repo-check"];
      if (model) args.push("--model", model);
      if (sandboxMode) args.push("--sandbox", sandboxMode);
      args.push("--cd", this.session.workdir);
      args.push("--config", `approval_policy="${realApprovalPolicy}"`);
      args.push("--config", `sandbox_workspace_write.network_access=${networkAccessEnabled}`);
      if (modelReasoningEffort) args.push("--config", `model_reasoning_effort="${modelReasoningEffort}"`);
      if (webSearchMode) args.push("--config", `web_search="${webSearchMode}"`);
      if (threadId || this.threadId) args.push("resume", threadId || this.threadId);
      env.CODEX_API_KEY = this.session.apiKey;
      if (approvalPolicy !== "never") {
        this.send({ type: "log", line: "[gateway] real backend forces approval_policy=never (see README)." });
      }
    } else {
      bin = process.execPath;
      args = [MOCK_BIN];
      env.MOCK_THREAD_ID = threadId || this.threadId || "";
      env.MOCK_WORKDIR = this.session.workdir;
      env.MOCK_APPROVAL_POLICY = approvalPolicy;
      env.MOCK_SANDBOX = sandboxMode;
      env.MOCK_MODEL = model || "mock-gpt";
    }

    this.send({ type: "turn.queued", backend: kind });

    let child;
    try {
      child = spawn(bin, args, { env, cwd: this.session.workdir });
    } catch (err) {
      this.send({ type: "turn.failed", error: { message: `failed to spawn backend: ${err.message}` } });
      return;
    }
    this.child = child;

    const inputText = typeof input === "string"
      ? input
      : (input ?? []).filter((it) => it.type === "text").map((it) => it.text).join("\n\n");

    // Send the prompt as the first line; keep stdin open so approval
    // responses can be forwarded as additional JSON lines while the turn runs.
    if (kind === "real") {
      // Real codex `exec --experimental-json` reads the prompt as raw stdin
      // (no JSON envelope) and exits when stdin is closed.
      child.stdin.write(inputText);
      child.stdin.end();
    } else {
      // Mock backend uses a JSON-line protocol so we can interleave approvals.
      child.stdin.write(JSON.stringify({ type: "prompt", text: inputText }) + "\n");
    }

    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        this.handleEventLine(line);
      }
    });
    const stderrChunks = [];
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("exit", (code, signal) => {
      this.child = null;
      if (buf.trim()) this.handleEventLine(buf.trim());
      if (code !== 0 && code !== null) {
        const detail = Buffer.concat(stderrChunks).toString("utf8").slice(-2000);
        this.send({
          type: "turn.failed",
          error: { message: `backend exited with code ${code}${signal ? ` (${signal})` : ""}: ${detail}` },
        });
      }
    });
    child.on("error", (err) => {
      this.send({ type: "turn.failed", error: { message: `backend error: ${err.message}` } });
    });
  }

  handleEventLine(line) {
    let evt;
    try { evt = JSON.parse(line); } catch {
      this.send({ type: "log", line });
      return;
    }

    // Out-of-band approval requests from the mock backend (real codex backend
    // surfaces approvals over the JSON-RPC app-server, which is out of scope
    // for this MVP gateway).
    if (evt.type === "approval.request") {
      this.handleApprovalRequest(evt);
      return;
    }

    if (evt.type === "thread.started" && evt.thread_id) {
      this.threadId = evt.thread_id;
      const meta = this.session.threads.get(evt.thread_id) ?? { name: null, lastActive: 0 };
      meta.lastActive = Date.now();
      this.session.threads.set(evt.thread_id, meta);
    }
    this.send(evt);
  }

  handleApprovalRequest(evt) {
    const id = evt.approval_id ?? randomUUID();
    this.send({ type: "approval.request", approval_id: id, request: evt.request });
    new Promise((resolve) => {
      this.pendingApprovals.set(id, resolve);
      setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          this.pendingApprovals.delete(id);
          resolve("deny");
        }
      }, 2 * 60 * 1000);
    }).then((decision) => {
      if (this.child && this.child.stdin && !this.child.stdin.destroyed) {
        try {
          this.child.stdin.write(
            JSON.stringify({ type: "approval.response", approval_id: id, decision }) + "\n",
          );
        } catch {}
      }
    });
  }
}

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[codex-web] listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[codex-web] backend: ${CODEX_BIN ? `real (${CODEX_BIN})` : "mock-only"}`);
  // eslint-disable-next-line no-console
  console.log(`[codex-web] workdir root: ${WORKDIR_ROOT}`);
});
