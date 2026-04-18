// Codex Web — JSON-RPC bridge to the Rust `codex app-server`.
//
// Architecture:
//   browser  <— WebSocket (raw JSON-RPC frames) —>  this gateway
//   this gateway  <— stdio (newline-delimited JSON-RPC frames) —>  `codex app-server`
//
// The gateway is a minimal authenticated transport. Every WebSocket frame is
// a single JSON-RPC 2.0 message conforming to `app-server-protocol`
// (`codex-rs/app-server-protocol`). The gateway does not invent new methods,
// rename fields, or translate envelopes — it only:
//   - terminates the WebSocket and authenticates the session cookie,
//   - spawns one `codex app-server --transport stdio` subprocess per session
//     (or the bundled mock-codex.mjs that speaks the same protocol subset
//     when no real binary or API key is available),
//   - injects credentials into the child's environment / `loginApiKey` call,
//   - pipes raw JSON-RPC frames back and forth.
//
// Backend selection (per WebSocket connection):
//   - real:  $CODEX_BIN exists AND the session has either an API key set or
//            ChatGPT auth tokens cached. Spawns `$CODEX_BIN app-server`.
//   - mock:  otherwise. Spawns the bundled mock app-server in JS, which
//            implements the same JSON-RPC method names so the UI can be
//            exercised end-to-end (including the approval flow) without
//            OpenAI keys.
//
// Credentials never leave the server: the API key and any OAuth tokens are
// stored in an in-memory session map keyed by an http-only session cookie.

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

mkdirSync(WORKDIR_ROOT, { recursive: true });

// -------- session store (in-memory) --------
// session: { id, apiKey?, oauth?, createdAt, lastSeenAt, workdir }
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

function getOrCreateSession(req, res) {
  let id = req.cookies?.codexsid;
  if (id && sessions.has(id)) { touchSession(sessions.get(id)); return sessions.get(id); }
  id = randomUUID();
  const workdir = join(WORKDIR_ROOT, id);
  mkdirSync(workdir, { recursive: true });
  const session = {
    id, apiKey: undefined, oauth: undefined,
    createdAt: Date.now(), lastSeenAt: Date.now(), workdir,
  };
  sessions.set(id, session);
  res.cookie("codexsid", id, {
    httpOnly: true, sameSite: "lax", secure: false,
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

function sameOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const u = new URL(origin);
    if (u.host === req.headers.host) return next();
  } catch {}
  res.status(403).json({ error: "cross-origin request rejected" });
}

function backendKindFor(s) {
  if (CODEX_BIN && existsSync(CODEX_BIN) && (s.apiKey || s.oauth)) return "real";
  return "mock";
}

// -------- HTTP --------
const app = express();
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  if (process.env.NODE_ENV !== "production") res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(PUBLIC_DIR));

app.get("/api/whoami", (req, res) => {
  const s = getOrCreateSession(req, res);
  res.json({
    sessionId: s.id,
    hasApiKey: Boolean(s.apiKey),
    hasOauth: Boolean(s.oauth),
    authMethod: s.oauth ? "chatgpt" : (s.apiKey ? "apikey" : null),
    backend: backendKindFor(s),
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
  res.json({ ok: true, backend: backendKindFor(s) });
});

app.post("/api/logout", sameOriginOnly, (req, res) => {
  const s = getOrCreateSession(req, res);
  s.apiKey = undefined; s.oauth = undefined;
  res.json({ ok: true });
});

// ChatGPT OAuth/device-code flow: kicks off `account/login/start` via the
// dedicated WS channel and returns the verification URL + user code. The
// gateway holds the resulting access token in the session.
app.post("/api/oauth/chatgpt/start", sameOriginOnly, async (req, res) => {
  const s = getOrCreateSession(req, res);
  if (!CODEX_BIN || !existsSync(CODEX_BIN)) {
    // Mock backend simulates the device-code flow so the UI is exercisable.
    s.oauth = { pending: true, deviceCode: "MOCK-DEMO-CODE", verificationUri: "https://chat.openai.com/auth/device" };
    res.json({
      verificationUri: s.oauth.verificationUri,
      userCode: s.oauth.deviceCode,
      mock: true,
      message: "Demo flow — the mock backend will auto-complete sign-in in 3s.",
    });
    setTimeout(() => { s.oauth = { account: "demo@chatgpt", token: "mock-chatgpt-token" }; }, 3000);
    return;
  }
  // For the real backend, mark the session as having an OAuth attempt in
  // flight so the gateway will (re)spawn the real `codex app-server` for
  // the next WebSocket. The browser then drives `account/login/start` over
  // its existing JSON-RPC WebSocket; on success the child emits
  // `account/updated`, which the gateway intercepts to persist the token.
  s.oauth = { ...(s.oauth ?? {}), pending: true };
  res.json({ useJsonRpc: true, reconnect: true });
});

app.get("/api/threads", (req, res) => {
  // Real implementation will be served by the JSON-RPC `thread/list` method
  // through the WebSocket; this HTTP endpoint exists only so the sidebar can
  // render an empty list before the WS hands over.
  getOrCreateSession(req, res);
  res.json({ threads: [] });
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
    ws.send(JSON.stringify({ jsonrpc: "2.0", method: "gateway/error", params: { message: "no session; reload the page" } }));
    ws.close(); return;
  }
  new BridgeConnection(ws, session);
});

class BridgeConnection {
  constructor(ws, session) {
    this.ws = ws;
    this.session = session;
    this.kind = backendKindFor(session);
    this.child = null;
    this.buf = "";
    this.spawn();
    ws.on("message", (raw) => this.onWsMessage(raw));
    ws.on("close", () => this.killChild());
    ws.on("error", () => this.killChild());

    // Out-of-band: tell the UI which backend it's talking to. This is the
    // ONLY non-JSON-RPC frame the gateway emits, and it's clearly namespaced.
    this.sendWs({ jsonrpc: "2.0", method: "gateway/ready", params: {
      backend: this.kind,
      workdir: session.workdir,
      authMethod: session.oauth ? "chatgpt" : (session.apiKey ? "apikey" : null),
    }});
  }

  spawn() {
    const env = { ...process.env, CODEX_HOME: join(this.session.workdir, ".codex") };
    if (this.session.apiKey) env.OPENAI_API_KEY = this.session.apiKey;

    let bin, args;
    if (this.kind === "real") {
      bin = CODEX_BIN;
      args = ["app-server"];
    } else {
      bin = process.execPath;
      args = [MOCK_BIN];
      env.MOCK_WORKDIR = this.session.workdir;
      env.MOCK_HAS_AUTH = (this.session.apiKey || this.session.oauth) ? "1" : "0";
    }
    try {
      this.child = spawn(bin, args, { env, cwd: this.session.workdir, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      this.sendWs({ jsonrpc: "2.0", method: "gateway/error", params: { message: `failed to spawn backend: ${err.message}` } });
      return;
    }

    this.child.stdout.on("data", (chunk) => this.onChildData(chunk));
    this.child.stderr.on("data", (chunk) => {
      // Surface backend stderr as a gateway log notification (debug aid).
      this.sendWs({ jsonrpc: "2.0", method: "gateway/log", params: { stream: "stderr", line: chunk.toString("utf8") } });
    });
    this.child.on("exit", (code, signal) => {
      this.sendWs({ jsonrpc: "2.0", method: "gateway/exit", params: { code, signal } });
      this.child = null;
    });
    this.child.on("error", (err) => {
      this.sendWs({ jsonrpc: "2.0", method: "gateway/error", params: { message: err.message } });
    });
  }

  onChildData(chunk) {
    this.buf += chunk.toString("utf8");
    let nl;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      // Validate it's JSON-RPC; if not, surface as a log line and continue
      // (real codex app-server occasionally writes startup logs to stdout).
      try {
        const parsed = JSON.parse(line);
        if (parsed && (parsed.jsonrpc === "2.0" || parsed.jsonrpc === undefined)) {
          // Tag method notifications coming from the server side so the
          // browser knows whether something is a request, response, or
          // notification per the JSON-RPC 2.0 spec.
          this.ws.send(line);
          this.maybePersistAuth(parsed);
          continue;
        }
      } catch {}
      this.sendWs({ jsonrpc: "2.0", method: "gateway/log", params: { stream: "stdout", line } });
    }
  }

  // Watch for `account/login/start` responses so the gateway can persist
  // any returned tokens into the session map (so they survive WS reconnects).
  maybePersistAuth(msg) {
    if (msg && msg.result && typeof msg.result === "object") {
      if (typeof msg.result.authToken === "string") this.session.oauth = { ...(this.session.oauth ?? {}), token: msg.result.authToken };
      if (typeof msg.result.account === "object" && msg.result.account?.email) {
        this.session.oauth = { ...(this.session.oauth ?? {}), account: msg.result.account.email };
      }
    }
  }

  onWsMessage(raw) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) return;
    let s;
    try { s = raw.toString("utf8"); } catch { return; }
    // Gateway-internal control frames the browser may send (e.g.
    // refresh credentials after API-key login on a reconnect).
    try {
      const msg = JSON.parse(s);
      if (msg && msg.method === "gateway/refreshAuth") {
        if (this.session.apiKey && this.child) {
          try {
            this.child.stdin.write(JSON.stringify({
              jsonrpc: "2.0", id: `gw-${Date.now()}`,
              method: "loginApiKey",
              params: { apiKey: this.session.apiKey },
            }) + "\n");
          } catch {}
        }
        return;
      }
    } catch {}
    try { this.child.stdin.write(s + "\n"); } catch {}
  }

  sendWs(obj) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(obj));
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
