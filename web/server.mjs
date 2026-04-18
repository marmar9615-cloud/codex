// Codex Web — JSON-RPC bridge to the Rust `codex app-server`.
//
// The gateway is a TRANSPARENT JSON-RPC 2.0 proxy. Every byte that crosses
// the WebSocket is a single canonical app-server-protocol JSON-RPC frame.
// The gateway never invents methods, never renames fields, and never wraps
// payloads. Operational metadata (backend kind, workdir) is exposed via
// HTTP only (`/api/whoami`); spawn/exit/log information stays on the server
// (stderr / process logs).
//
// Per WebSocket the gateway:
//   1. authenticates the cookie session,
//   2. spawns one `codex app-server` (or the bundled mock) bound to that
//      session's auth + workdir,
//   3. on spawn, if an API key is set, sends a single canonical
//      `loginApiKey` JSON-RPC request to the child (still inside the
//      protocol; no custom envelope),
//   4. then pipes raw JSON-RPC frames between the WS and the child stdio
//      until either side closes.
//
// Backend selection:
//   - real:  $CODEX_BIN exists. Spawns `$CODEX_BIN app-server`. The browser
//            then drives auth via canonical methods (`loginApiKey`,
//            `account/login/start`).
//   - mock:  $CODEX_BIN is unset or missing. Spawns the bundled JS mock
//            which speaks the same JSON-RPC subset for development.
//
// Credentials never leave the server: API key + OAuth token are held in an
// in-memory session map keyed by an http-only, secure session cookie.

import express from "express";
import cookieParser from "cookie-parser";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);
const HOST = "0.0.0.0";
const PUBLIC_DIR = join(__dirname, "public");
const WORKDIR_ROOT = resolve(process.env.CODEX_WEB_WORKDIR_ROOT ?? join(__dirname, ".workdirs"));
const CODEX_BIN = process.env.CODEX_BIN ?? "";
const MOCK_BIN = join(__dirname, "mock-codex.mjs");
const IS_PROD = process.env.NODE_ENV === "production";

mkdirSync(WORKDIR_ROOT, { recursive: true });

// -------- session store (in-memory) --------
// session: {
//   id, apiKey?, oauth?, createdAt, lastSeenAt, workdir,
//   threads: Map<conversationId, { id, name, lastActive, lastTurnText? }>,
//   activeConversationId?,
// }
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX = 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - (s.lastSeenAt ?? s.createdAt) > SESSION_TTL_MS) sessions.delete(id);
  }
  if (sessions.size > SESSION_MAX) {
    const sorted = [...sessions.entries()].sort((a, b) => (a[1].lastSeenAt ?? 0) - (b[1].lastSeenAt ?? 0));
    while (sessions.size > SESSION_MAX) sessions.delete(sorted.shift()[0]);
  }
}, 60 * 60 * 1000).unref();

function touchSession(s) { if (s) s.lastSeenAt = Date.now(); }

function makeSession(id) {
  const workdir = join(WORKDIR_ROOT, id);
  mkdirSync(workdir, { recursive: true });
  return {
    id, apiKey: undefined, oauth: undefined,
    createdAt: Date.now(), lastSeenAt: Date.now(), workdir,
    threads: new Map(),
    activeConversationId: undefined,
  };
}

function isSecureRequest(req) {
  // Trust the standard reverse-proxy header used by Replit and most
  // production fronts. Falls back to the encrypted-socket flag.
  const fwd = req.headers["x-forwarded-proto"];
  if (typeof fwd === "string" && fwd.split(",")[0].trim() === "https") return true;
  return Boolean(req.socket && req.socket.encrypted);
}

function getOrCreateSession(req, res) {
  let id = req.cookies?.codexsid;
  if (id && sessions.has(id)) { touchSession(sessions.get(id)); return sessions.get(id); }
  id = randomUUID();
  const session = makeSession(id);
  sessions.set(id, session);
  res.cookie("codexsid", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req) || IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
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

function sameOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const u = new URL(origin);
    if (u.host === req.headers.host) return next();
  } catch {}
  res.status(403).json({ error: "cross-origin request rejected" });
}

function backendKindFor() {
  return CODEX_BIN && existsSync(CODEX_BIN) ? "real" : "mock";
}

// -------- HTTP --------
const app = express();
app.set("trust proxy", true);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  if (!IS_PROD) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(PUBLIC_DIR));

app.get("/api/whoami", (req, res) => {
  const s = getOrCreateSession(req, res);
  res.json({
    sessionId: s.id,
    hasApiKey: Boolean(s.apiKey),
    hasOauth: Boolean(s.oauth?.token),
    account: s.oauth?.account ?? null,
    authMethod: s.oauth?.token ? "chatgpt" : (s.apiKey ? "apikey" : null),
    backend: backendKindFor(),
    realBinaryConfigured: Boolean(CODEX_BIN && existsSync(CODEX_BIN)),
    workdir: s.workdir,
  });
});

app.post("/api/login", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  const { apiKey } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    res.status(400).json({ error: "apiKey is required" }); return;
  }
  s.apiKey = apiKey.trim();
  s.oauth = undefined;
  res.json({ ok: true, backend: backendKindFor() });
});

app.post("/api/logout", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  s.apiKey = undefined; s.oauth = undefined;
  res.json({ ok: true });
});

// ChatGPT OAuth/device-code seed. The browser then drives the canonical
// `account/login/start` JSON-RPC request over the WebSocket. The token is
// persisted in the session by the gateway when the child returns it.
app.post("/api/oauth/chatgpt/start", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  s.oauth = { ...(s.oauth ?? {}), pending: true };
  res.json({ useJsonRpc: true });
});

app.get("/api/threads", (req, res) => {
  const s = getOrCreateSession(req, res);
  const threads = [...s.threads.values()].sort((a, b) => b.lastActive - a.lastActive);
  res.json({ threads });
});

app.post("/api/file-search", sameOriginOnly, async (req, res) => {
  const s = getOrCreateSession(req, res);
  const { query } = req.body ?? {};
  if (typeof query !== "string") { res.status(400).json({ error: "query required" }); return; }
  res.json({ results: await searchWorkdir(s.workdir, query) });
});

async function searchWorkdir(root, query) {
  const out = []; const q = query.toLowerCase(); const limit = 25;
  async function walk(dir, rel) {
    if (out.length >= limit) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(full, r);
      else if (e.name.toLowerCase().includes(q) || r.toLowerCase().includes(q)) out.push(r);
    }
  }
  await walk(root, "");
  return out;
}

// -------- WebSocket: JSON-RPC pass-through --------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

server.on("upgrade", (req) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.host !== req.headers.host) req.destroy();
    } catch { req.destroy(); }
  }
});

wss.on("connection", (ws, req) => {
  const session = getSessionFromCookie(req.headers.cookie);
  if (!session) {
    // No protocol payload — close with a clear code so the client reconnects.
    ws.close(4401, "no session");
    return;
  }
  new BridgeConnection(ws, session);
});

class BridgeConnection {
  constructor(ws, session) {
    this.ws = ws;
    this.session = session;
    this.kind = backendKindFor();
    this.child = null;
    this.buf = "";
    this.spawn();
    ws.on("message", (raw) => this.onWsMessage(raw));
    ws.on("close", () => this.killChild());
    ws.on("error", () => this.killChild());
  }

  spawn() {
    const env = { ...process.env, CODEX_HOME: join(this.session.workdir, ".codex") };
    if (this.session.apiKey) env.OPENAI_API_KEY = this.session.apiKey;
    if (this.session.oauth?.token) env.CODEX_AUTH_TOKEN = this.session.oauth.token;

    let bin, args;
    if (this.kind === "real") {
      bin = CODEX_BIN;
      args = ["app-server"];
    } else {
      bin = process.execPath;
      args = [MOCK_BIN];
      env.MOCK_WORKDIR = this.session.workdir;
      env.MOCK_HAS_AUTH = (this.session.apiKey || this.session.oauth?.token) ? "1" : "0";
    }
    try {
      this.child = spawn(bin, args, { env, cwd: this.session.workdir, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      console.error("[codex-web] failed to spawn backend:", err.message);
      // Close the WS with a non-1000 code; the client reconnects.
      try { this.ws.close(4500, `spawn failed: ${err.message}`); } catch {}
      return;
    }

    this.child.stdout.on("data", (chunk) => this.onChildData(chunk));
    this.child.stderr.on("data", (chunk) => {
      // Surface backend stderr only to the gateway's own log.
      process.stderr.write(`[codex backend ${this.session.id.slice(0,8)}] ${chunk}`);
    });
    this.child.on("exit", (code, signal) => {
      this.child = null;
      try { this.ws.close(4502, `backend exited code=${code ?? "?"} signal=${signal ?? "?"}`); } catch {}
    });
    this.child.on("error", (err) => {
      console.error("[codex-web] child error:", err.message);
      try { this.ws.close(4500, `child error: ${err.message}`); } catch {}
    });

    // Pre-seed auth via canonical JSON-RPC. Still strictly app-server-protocol.
    if (this.session.apiKey) {
      this.writeChild({
        jsonrpc: "2.0", id: `gw-${randomUUID()}`,
        method: "loginApiKey",
        params: { apiKey: this.session.apiKey },
      });
    }
  }

  onChildData(chunk) {
    this.buf += chunk.toString("utf8");
    let nl;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch {
        // Non-JSON output from the child is a backend log — keep it server-side.
        process.stderr.write(`[codex backend ${this.session.id.slice(0,8)} stdout] ${line}\n`);
        continue;
      }
      if (!parsed || (parsed.jsonrpc !== "2.0" && parsed.jsonrpc !== undefined)) continue;
      // Forward verbatim — no rewriting.
      try { if (this.ws.readyState === this.ws.OPEN) this.ws.send(line); } catch {}
      this.observeForSession(parsed);
    }
  }

  // Server-side observers that update session bookkeeping (thread list,
  // OAuth token cache). They do NOT modify or replace the forwarded frame.
  observeForSession(msg) {
    if (msg.method === "thread/started" && msg.params?.conversationId) {
      const id = msg.params.conversationId;
      const existing = this.session.threads.get(id) ?? { id, name: id, lastActive: Date.now() };
      existing.lastActive = Date.now();
      this.session.threads.set(id, existing);
      this.session.activeConversationId = id;
    }
    if (msg.method === "account/updated" && msg.params?.account) {
      const acc = msg.params.account;
      this.session.oauth = {
        ...(this.session.oauth ?? {}),
        account: typeof acc === "string" ? acc : (acc.email ?? acc.id ?? "chatgpt"),
        token: msg.params.authToken ?? this.session.oauth?.token ?? "oauth-set",
        pending: false,
      };
    }
  }

  onWsMessage(raw) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) return;
    let s;
    try { s = raw.toString("utf8"); } catch { return; }
    // Validate it's a JSON-RPC frame. Drop anything else — strict protocol.
    let parsed;
    try { parsed = JSON.parse(s); } catch { return; }
    if (!parsed || parsed.jsonrpc !== "2.0") return;
    // Track outgoing turn intent so we can name the thread on first user turn.
    if (parsed.method === "turn/start" && this.session.activeConversationId) {
      const t = this.session.threads.get(this.session.activeConversationId);
      if (t) {
        const text = (parsed.params?.input ?? []).map((p) => p?.text ?? "").join(" ").trim();
        if (text && (!t.name || t.name === t.id)) t.name = text.slice(0, 48);
        t.lastActive = Date.now();
      }
    }
    try { this.child.stdin.write(s + "\n"); } catch {}
  }

  writeChild(obj) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) return;
    try { this.child.stdin.write(JSON.stringify(obj) + "\n"); } catch {}
  }

  killChild() {
    const c = this.child;
    if (c && !c.killed) {
      try { c.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { if (!c.killed) c.kill("SIGKILL"); } catch {} }, 3000).unref();
    }
    this.child = null;
  }
}

server.listen(PORT, HOST, () => {
  console.log(`[codex-web] listening on http://${HOST}:${PORT}`);
  console.log(`[codex-web] codex binary: ${CODEX_BIN || "(not set — mock-only)"}`);
  console.log(`[codex-web] workdir root: ${WORKDIR_ROOT}`);
});
