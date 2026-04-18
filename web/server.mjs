// Codex Web — JSON-RPC bridge to the Rust `codex app-server`.
//
// The gateway is a TRANSPARENT JSON-RPC 2.0 proxy. Every byte that crosses
// the WebSocket is a single canonical app-server-protocol JSON-RPC frame.
// The gateway never invents methods, never renames fields, and never wraps
// payloads. Operational metadata (backend kind, workdir) is exposed via
// HTTP only (`/api/whoami`); spawn/exit/log information stays on the server
// (stderr / process logs).
//
// The backend `codex app-server` child is owned by the SESSION, not by an
// individual WebSocket. A transient WS drop simply detaches; the child
// (and its in-flight turn) keeps running. On reconnect the gateway
// replays the most recent backend → client JSON-RPC frames so the UI
// can resume mid-turn without losing streamed content. Children are
// idle-killed only when no WS has been attached for a few minutes, and
// they are FORCE killed immediately on `/api/logout` so credentials
// can never serve a subsequent turn after the user signs out.
//
// Backend selection:
//   - real:  $CODEX_BIN exists. Spawns `$CODEX_BIN app-server`. The browser
//            drives auth via the canonical `account/login/start` method.
//   - mock:  $CODEX_BIN is unset or missing. Spawns the bundled JS mock
//            which speaks the same JSON-RPC v2 subset for development.
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
//   threads: Map<threadId, { id, name, lastActive, lastTurnText? }>,
//   activeThreadId?,
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
    activeThreadId: undefined,
    // Per-session backend child + reconnect bookkeeping.
    backend: null, // { child, kind, buf, outFrames: string[], attachedWs, idleTimer }
  };
}

// Maximum number of recent backend → client JSON-RPC frames kept per session
// for transparent replay on WS reconnect.
const REPLAY_RING_SIZE = 500;
// Time a backend may sit idle (no attached WS) before it is recycled.
const BACKEND_IDLE_MS = 5 * 60 * 1000;

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
  // SECURITY: any in-flight backend child was spawned with the now-revoked
  // credentials in its env. Force-kill it so it cannot serve any further
  // authenticated turns. The next WS message will spawn a fresh,
  // unauthenticated child.
  killBackend(s, "logout");
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
    ws.close(4401, "no session");
    return;
  }
  attachWs(session, ws);
});

// ---------- per-session backend lifecycle ----------

function ensureBackend(session) {
  if (session.backend && session.backend.child && !session.backend.child.killed) {
    return session.backend;
  }
  const kind = backendKindFor();
  const env = { ...process.env, CODEX_HOME: join(session.workdir, ".codex") };
  if (session.apiKey) env.OPENAI_API_KEY = session.apiKey;
  if (session.oauth?.token) env.CODEX_AUTH_TOKEN = session.oauth.token;

  let bin, args;
  if (kind === "real") {
    bin = CODEX_BIN;
    args = ["app-server"];
  } else {
    bin = process.execPath;
    args = [MOCK_BIN];
    env.MOCK_WORKDIR = session.workdir;
    env.MOCK_HAS_AUTH = (session.apiKey || session.oauth?.token) ? "1" : "0";
  }

  let child;
  try {
    child = spawn(bin, args, { env, cwd: session.workdir, stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    console.error("[codex-web] failed to spawn backend:", err.message);
    return null;
  }

  const backend = {
    child, kind, buf: "",
    // Ring buffer of recent backend → client JSON-RPC frames (raw strings).
    outFrames: [],
    attachedWs: null,
    idleTimer: null,
  };
  session.backend = backend;

  child.stdout.on("data", (chunk) => onChildData(session, chunk));
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[codex backend ${session.id.slice(0,8)}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    if (session.backend === backend) session.backend = null;
    const ws = backend.attachedWs;
    if (ws) {
      try { ws.close(4502, `backend exited code=${code ?? "?"} signal=${signal ?? "?"}`); } catch {}
    }
  });
  child.on("error", (err) => {
    console.error("[codex-web] child error:", err.message);
    if (session.backend === backend) session.backend = null;
  });

  // Pre-seed API-key auth via canonical JSON-RPC.
  if (session.apiKey) {
    writeChild(backend, {
      jsonrpc: "2.0", id: `gw-${randomUUID()}`,
      method: "account/login/start",
      params: { type: "apiKey", apiKey: session.apiKey },
    });
  }
  return backend;
}

function killBackend(session, reason) {
  const b = session.backend;
  if (!b) return;
  if (b.idleTimer) { clearTimeout(b.idleTimer); b.idleTimer = null; }
  const c = b.child;
  if (c && !c.killed) {
    process.stderr.write(`[codex-web] killing backend (${reason}) for session ${session.id.slice(0,8)}\n`);
    try { c.kill("SIGTERM"); } catch {}
    setTimeout(() => { try { if (!c.killed) c.kill("SIGKILL"); } catch {} }, 3000).unref();
  }
  if (b.attachedWs) {
    try { b.attachedWs.close(4001, `backend recycled: ${reason}`); } catch {}
  }
  session.backend = null;
}

function attachWs(session, ws) {
  const backend = ensureBackend(session);
  if (!backend) {
    try { ws.close(4500, "spawn failed"); } catch {}
    return;
  }
  // Detach any previous WS (typically already closed on the client).
  if (backend.attachedWs && backend.attachedWs !== ws) {
    try { backend.attachedWs.close(4000, "superseded"); } catch {}
  }
  backend.attachedWs = ws;
  if (backend.idleTimer) { clearTimeout(backend.idleTimer); backend.idleTimer = null; }

  // Replay buffered frames so the UI can resume mid-turn after a transport
  // drop. The client-side reducers are idempotent on item.id, so duplicate
  // notifications are harmless.
  for (const frame of backend.outFrames) {
    try { ws.send(frame); } catch {}
  }

  ws.on("message", (raw) => onWsMessage(session, backend, raw));
  ws.on("close", () => detachWs(session, backend, ws));
  ws.on("error", () => detachWs(session, backend, ws));
}

function detachWs(session, backend, ws) {
  if (backend.attachedWs !== ws) return;
  backend.attachedWs = null;
  // Don't kill the child immediately — let the in-flight turn keep running so
  // the next reconnect can replay it. Idle-kill after a few minutes.
  if (backend.idleTimer) clearTimeout(backend.idleTimer);
  backend.idleTimer = setTimeout(() => {
    if (session.backend === backend && !backend.attachedWs) {
      killBackend(session, "idle");
    }
  }, BACKEND_IDLE_MS).unref();
}

function onChildData(session, chunk) {
  const backend = session.backend;
  if (!backend) return;
  backend.buf += chunk.toString("utf8");
  let nl;
  while ((nl = backend.buf.indexOf("\n")) >= 0) {
    const line = backend.buf.slice(0, nl).trim();
    backend.buf = backend.buf.slice(nl + 1);
    if (!line) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch {
      process.stderr.write(`[codex backend ${session.id.slice(0,8)} stdout] ${line}\n`);
      continue;
    }
    if (!parsed || (parsed.jsonrpc !== "2.0" && parsed.jsonrpc !== undefined)) continue;
    // Buffer for replay, then forward verbatim — no rewriting.
    backend.outFrames.push(line);
    if (backend.outFrames.length > REPLAY_RING_SIZE) backend.outFrames.shift();
    const ws = backend.attachedWs;
    if (ws && ws.readyState === ws.OPEN) {
      try { ws.send(line); } catch {}
    }
    observeForSession(session, parsed);
  }
}

function observeForSession(session, msg) {
  if (msg.method === "thread/started" && msg.params?.thread?.id) {
    const t = msg.params.thread;
    const existing = session.threads.get(t.id)
      ?? { id: t.id, name: t.name ?? t.id, lastActive: Date.now() };
    existing.name = t.name ?? existing.name;
    existing.lastActive = Date.now();
    session.threads.set(t.id, existing);
    session.activeThreadId = t.id;
    // Resetting the replay ring at a new thread keeps the buffer focused on
    // the most recent turn so reconnects don't replay stale prior turns.
    if (session.backend) session.backend.outFrames = [];
  }
  if (msg.method === "account/updated") {
    const authMode = msg.params?.authMode ?? null;
    const planType = msg.params?.planType ?? null;
    if (authMode === "chatgpt" || authMode === "chatgptAuthTokens") {
      session.oauth = {
        ...(session.oauth ?? {}),
        account: planType ? `chatgpt:${planType}` : "chatgpt",
        token: session.oauth?.token ?? "oauth-set",
        authMode, planType, pending: false,
      };
    } else if (authMode === "apikey") {
      session.oauth = undefined;
    } else if (authMode === null) {
      session.oauth = undefined;
    }
  }
}

function onWsMessage(session, backend, raw) {
  if (!backend.child || !backend.child.stdin || backend.child.stdin.destroyed) return;
  let s;
  try { s = raw.toString("utf8"); } catch { return; }
  let parsed;
  try { parsed = JSON.parse(s); } catch { return; }
  if (!parsed || parsed.jsonrpc !== "2.0") return;
  const activeId = parsed.params?.threadId ?? session.activeThreadId;
  if (parsed.method === "turn/start" && activeId) {
    const t = session.threads.get(activeId);
    if (t) {
      const text = (parsed.params?.input ?? []).map((p) => p?.text ?? "").join(" ").trim();
      if (text && (!t.name || t.name === t.id)) t.name = text.slice(0, 48);
      t.lastActive = Date.now();
    }
  }
  try { backend.child.stdin.write(s + "\n"); } catch {}
}

function writeChild(backend, obj) {
  if (!backend.child || !backend.child.stdin || backend.child.stdin.destroyed) return;
  try { backend.child.stdin.write(JSON.stringify(obj) + "\n"); } catch {}
}

server.listen(PORT, HOST, () => {
  console.log(`[codex-web] listening on http://${HOST}:${PORT}`);
  console.log(`[codex-web] codex binary: ${CODEX_BIN || "(not set — mock-only)"}`);
  console.log(`[codex-web] workdir root: ${WORKDIR_ROOT}`);
});
