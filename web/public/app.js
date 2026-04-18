// Codex Web — browser front-end.
// Talks to the gateway over /ws using `app-server-protocol` JSON-RPC 2.0
// (the same protocol the Rust `codex app-server` speaks). Every frame on
// the wire is a JSON-RPC envelope. The gateway is a transparent proxy.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- session state ----------
const state = {
  ws: null,
  reconnectAttempts: 0,
  whoami: null,
  threads: [],
  activeThreadId: null,
  activeTurnId: null,
  inFlight: false,
  initialized: false,
  // pending JSON-RPC requests sent by the browser, awaiting server response
  pending: new Map(), // requestId -> { resolve, reject, method }
  nextReqId: 1,
  // current turn's items keyed by id, in order
  itemsById: new Map(),
  itemOrder: [],
  // settings
  settings: load("settings", {
    model: "gpt-5-codex",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    networkAccessEnabled: false,
    modelReasoningEffort: "medium",
    webSearchMode: "disabled",
  }),
  // slash commands (mirrors codex-tui slash command set)
  slashCommands: [
    { name: "/new", desc: "Start a fresh conversation" },
    { name: "/resume", desc: "Resume a previous thread (use sidebar)" },
    { name: "/model", desc: "Choose the model for this session" },
    { name: "/approvals", desc: "Change approval policy" },
    { name: "/sandbox", desc: "Change sandbox policy" },
    { name: "/reasoning", desc: "Set reasoning effort (low/medium/high)" },
    { name: "/web-search", desc: "Toggle web search mode" },
    { name: "/network", desc: "Toggle network access in sandbox" },
    { name: "/status", desc: "Show current account, model, and policy" },
    { name: "/login", desc: "Sign in with an OpenAI API key" },
    { name: "/logout", desc: "Sign out and clear the API key" },
    { name: "/clear", desc: "Clear the current transcript" },
    { name: "/reset", desc: "Reset the current conversation context" },
    { name: "/compact", desc: "Compact the conversation history" },
    { name: "/mcp", desc: "Manage MCP servers" },
    { name: "/help", desc: "Show available commands" },
  ],
};

// Expose for end-to-end tests (transport-drop simulation, etc.).
if (typeof window !== "undefined") window.state = state;

function load(key, fallback) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? "{}")) }; }
  catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- bootstrap ----------
async function bootstrap() {
  await refreshWhoAmI();
  await refreshThreads();
  connectWs();
  bindUi();
  updateStatusBar();
}

async function refreshWhoAmI() {
  const r = await fetch("/api/whoami");
  state.whoami = await r.json();
  renderAccount();
}
async function refreshThreads() {
  const r = await fetch("/api/threads");
  const data = await r.json();
  state.threads = data.threads;
  renderThreads();
}

function renderAccount() {
  const w = state.whoami;
  const status = $("#account-status");
  const btn = $("#account-btn");
  if (!w) { status.textContent = "—"; return; }
  if (w.hasOauth) {
    status.textContent = `ChatGPT: ${w.account?.email ?? w.account ?? "signed in"}`;
    status.classList.remove("muted");
    btn.textContent = "Sign out";
  } else if (w.hasApiKey) {
    status.textContent = "API key set";
    status.classList.remove("muted");
    btn.textContent = "Sign out";
  } else {
    status.textContent = w.realBinaryConfigured ? "not signed in" : "mock mode";
    status.classList.add("muted");
    btn.textContent = "Sign in";
  }
}

function renderThreads() {
  const nav = $("#threads");
  nav.innerHTML = "";
  if (state.threads.length === 0) {
    nav.innerHTML = `<div class="muted" style="padding:10px;font-size:12px">No saved threads yet.</div>`;
    return;
  }
  for (const t of state.threads) {
    const el = document.createElement("div");
    el.className = "thread-item" + (t.id === state.activeThreadId ? " active" : "");
    const when = new Date(t.lastActive).toLocaleString();
    el.innerHTML = `<div>${escapeHtml(t.name ?? t.id)}</div><div class="thread-time">${when}</div>`;
    el.addEventListener("click", () => openThread(t.id));
    nav.appendChild(el);
  }
}

async function openThread(id) {
  state.activeThreadId = id;
  state.activeTurnId = null;
  $("#thread-title").textContent = id;
  $("#transcript").innerHTML = "";
  state.itemsById.clear();
  state.itemOrder = [];
  renderThreads();
  try {
    // Canonical v2 ThreadResumeParams: { threadId, persistExtendedHistory }.
    await rpcCall("thread/resume", { threadId: id, persistExtendedHistory: false });
    appendSystem(`Resumed thread ${id}.`);
  } catch (e) {
    appendSystem(`Could not resume ${id}: ${e.message}`, "error");
  }
}

function newThread() {
  // Best-effort interrupt of an in-flight turn before discarding the thread.
  if (state.activeThreadId && state.activeTurnId) {
    rpcCall("turn/interrupt", {
      threadId: state.activeThreadId,
      turnId: state.activeTurnId,
    }).catch(() => {});
  }
  state.activeThreadId = null;
  state.activeTurnId = null;
  $("#thread-title").textContent = "New conversation";
  $("#transcript").innerHTML = "";
  state.itemsById.clear();
  state.itemOrder = [];
  renderThreads();
}

// ---------- WebSocket / JSON-RPC client ----------
function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws = ws;
  ws.addEventListener("open", async () => {
    state.reconnectAttempts = 0;
    // First frame on every WS connection is the canonical
    // app-server-protocol `initialize` request. No gateway preamble.
    await initializeRpcSession();
    // If we had an active thread when the socket dropped, transparently
    // resume it via the canonical `thread/resume` request.
    if (state.activeThreadId) {
      try {
        await rpcCall("thread/resume", {
          threadId: state.activeThreadId,
          persistExtendedHistory: false,
        });
      } catch (e) { console.warn("thread/resume failed", e.message); }
    }
    // Push current client settings to the backend via canonical
    // `config/value/write` so they are applied for subsequent turns.
    pushSettingsToBackend().catch(() => {});
    window.dispatchEvent(new CustomEvent("codex:ready"));
  });
  ws.addEventListener("message", (e) => {
    try { onJsonRpc(JSON.parse(e.data)); }
    catch (err) { console.error("bad rpc frame", err, e.data); }
  });
  ws.addEventListener("close", (ev) => {
    state.ws = null; state.initialized = false; setInFlight(false);
    if (ev.code === 4401) { appendSystem("Session expired. Reload the page.", "error"); return; }
    appendSystem(`Disconnected${ev.reason ? ` (${ev.reason})` : ""}. Reconnecting…`);
    setTimeout(connectWs, Math.min(5000, 500 * 2 ** state.reconnectAttempts++));
  });
  ws.addEventListener("error", () => ws.close());
}

async function pushSettingsToBackend() {
  if (!state.initialized) return;
  const s = state.settings;
  // Canonical v2 ConfigValueWriteParams: { keyPath, value, mergeStrategy }.
  // keyPath is a single dotted string per the schema.
  const writes = [
    ["model", s.model],
    ["model_reasoning_effort", s.modelReasoningEffort],
    ["approval_policy", s.approvalPolicy],
    ["sandbox_mode", s.sandboxMode],
    ["tools.web_search", s.webSearchMode !== "disabled"],
  ];
  await Promise.all(writes.map(([keyPath, value]) =>
    rpcCall("config/value/write", { keyPath, value, mergeStrategy: "replace" })
      .catch(() => {})
  ));
}

function rpcRaw(obj) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj));
  }
}

function rpcNotify(method, params) {
  rpcRaw({ jsonrpc: "2.0", method, params });
}

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const id = `c${state.nextReqId++}`;
    state.pending.set(id, { resolve, reject, method });
    rpcRaw({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (state.pending.has(id)) {
        state.pending.delete(id);
        reject(new Error(`rpc timeout: ${method}`));
      }
    }, 60_000);
  });
}

// Reply to a server-initiated JSON-RPC request (e.g. an approval prompt).
function rpcReply(id, result) {
  rpcRaw({ jsonrpc: "2.0", id, result });
}

// Route an incoming JSON-RPC frame (notification, response, or
// server-initiated request) into the existing UI event pipeline.
function onJsonRpc(msg) {
  if (!msg || typeof msg !== "object") return;

  // Response to a browser-issued request
  if (msg.id !== undefined && msg.method === undefined) {
    const pending = state.pending.get(String(msg.id));
    if (pending) {
      state.pending.delete(String(msg.id));
      if (msg.error) pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
    }
    return;
  }

  // Server-initiated request expecting a reply (approvals, MCP elicitations)
  if (msg.id !== undefined && msg.method !== undefined) {
    onServerRequest(msg);
    return;
  }

  // Notification
  onNotification(msg.method, msg.params ?? {});
}

function onServerRequest(msg) {
  switch (msg.method) {
    case "item/commandExecution/requestApproval": {
      const p = msg.params ?? {};
      // v2 CommandExecutionRequestApprovalParams.command is a string.
      const command = typeof p.command === "string"
        ? p.command
        : Array.isArray(p.command) ? p.command.join(" ") : "";
      renderApproval({
        request: { kind: "exec", command, cwd: p.cwd, reason: p.reason },
        onDecision: (decision) => rpcReply(msg.id, { decision: mapDecision(decision) }),
      });
      return;
    }
    case "item/fileChange/requestApproval": {
      const p = msg.params ?? {};
      // v2 FileChangeRequestApprovalParams carries only metadata; the real
      // file diff lives in the matching item/started notification.
      const item = state.itemsById.get(p.itemId)?.item;
      const files = (item?.changes ?? []).map((c) => ({
        path: c.path, kind: patchKind(c.kind), diff: c.diff,
      }));
      renderApproval({
        request: {
          kind: "apply_patch",
          summary: files.length ? `${files.length} file(s)` : (p.reason ?? "patch"),
          files,
        },
        onDecision: (decision) => rpcReply(msg.id, { decision: mapDecision(decision) }),
      });
      return;
    }
    default:
      // Unknown server request — reject so it doesn't deadlock.
      rpcRaw({ jsonrpc: "2.0", id: msg.id,
               error: { code: -32601, message: `unsupported server method: ${msg.method}` } });
  }
}

// Map UI decisions to the canonical v2 approval decision enums.
// CommandExecutionApprovalDecision: "accept" | "acceptForSession" | "decline" | "cancel" | …
// FileChangeApprovalDecision:        "accept" | "acceptForSession" | "decline" | "cancel"
function mapDecision(uiDecision) {
  if (uiDecision === "approve") return "accept";
  if (uiDecision === "approve-session") return "acceptForSession";
  return "decline";
}

// Translate JSON-RPC notification methods into the existing event shape used
// by handleEvent / upsertItem / renderItem so the rendering layer stays put.
function onNotification(method, params) {
  switch (method) {
    case "thread/started":
      // v2 ThreadStartedNotification: { thread: Thread }
      state.activeThreadId = params.thread?.id ?? state.activeThreadId;
      $("#thread-title").textContent = params.thread?.name ?? params.thread?.id ?? "thread";
      refreshThreads();
      return;
    case "turn/started":
      // v2 TurnStartedNotification: { threadId, turn }
      state.activeTurnId = params.turn?.id ?? null;
      return;
    case "turn/completed": {
      // v2 TurnCompletedNotification: { threadId, turn }
      state.activeTurnId = null;
      setInFlight(false);
      const ms = params.turn?.durationMs;
      appendSystem(`Turn complete${ms != null ? ` · ${ms} ms` : ""}`);
      return;
    }
    case "turn/failed":
      // Older notification kept for compatibility.
      state.activeTurnId = null;
      setInFlight(false);
      appendSystem(`✗ ${params.error?.message ?? "turn failed"}`, "error");
      return;

    case "item/started":
      // v2 ItemStartedNotification: { item, threadId, turnId }
      upsertItem(params.item, true, false);
      return;
    case "item/agentMessage/delta": {
      // v2 AgentMessageDeltaNotification: { threadId, turnId, itemId, delta }
      const existing = state.itemsById.get(params.itemId);
      const text = (existing?.item?.text ?? "") + (params.delta ?? "");
      upsertItem(
        { id: params.itemId, type: "agentMessage", text, phase: null, memoryCitation: null },
        !existing, false,
      );
      return;
    }
    case "item/completed":
      upsertItem(params.item, false, true);
      return;
    case "thread/compacted":
      appendSystem("History compacted.");
      return;

    case "account/updated": {
      // v2 AccountUpdatedNotification: { authMode, planType }
      const authMode = params.authMode ?? null;
      const planType = params.planType ?? null;
      const hasOauth = authMode === "chatgpt" || authMode === "chatgptAuthTokens";
      const hasApiKey = authMode === "apikey";
      state.whoami = {
        ...(state.whoami ?? {}),
        authMethod: authMode,
        account: hasOauth ? `chatgpt${planType ? ` (${planType})` : ""}` : null,
        hasOauth, hasApiKey: state.whoami?.hasApiKey || hasApiKey,
      };
      renderAccount();
      updateStatusBar();
      if (hasOauth) {
        appendSystem(`Signed in with ChatGPT${planType ? ` (${planType})` : ""}`);
        window.dispatchEvent(new CustomEvent("codex:signedIn"));
      } else if (hasApiKey) {
        appendSystem("API key login confirmed by backend.");
      } else if (authMode === null) {
        appendSystem("Signed out by backend.");
      }
      return;
    }
    case "account/login/completed":
      if (params?.success === false) {
        appendSystem(`Login failed: ${params.error ?? "unknown error"}`, "error");
      }
      return;

    case "mcpServer/startupStatus/updated":
      if (typeof window.__mcpRefresh === "function") window.__mcpRefresh();
      return;

    default:
      console.debug("unhandled notification", method, params);
  }
}

async function initializeRpcSession() {
  try {
    await rpcCall("initialize", {
      clientInfo: { name: "codex-web", title: "Codex Web", version: "0.1.0" },
      capabilities: { experimentalApi: false },
    });
    state.initialized = true;
  } catch (e) {
    console.error("initialize failed", e);
  }
}

// ---------- transcript item upsert ----------
function upsertItem(item, isStart, isComplete = false) {
  const transcript = $("#transcript");
  let entry = state.itemsById.get(item.id);
  if (!entry) {
    entry = { item, el: renderItem(item, isComplete) };
    state.itemsById.set(item.id, entry);
    state.itemOrder.push(item.id);
    transcript.appendChild(entry.el);
  } else {
    entry.item = item;
    const replacement = renderItem(item, isComplete);
    entry.el.replaceWith(replacement);
    entry.el = replacement;
  }
  scrollToBottom();
}

function renderItem(item, isComplete) {
  // v2 ThreadItem `type` discriminator. See
  // codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts.
  switch (item.type) {
    case "agentMessage": return renderAgentMessage(item);
    case "reasoning": return renderReasoning(item);
    case "commandExecution": return renderCommandExec(item);
    case "fileChange": return renderFileChange(item);
    case "mcpToolCall": return renderMcp(item);
    case "plan": return renderPlan(item);
    default: return renderUnknown(item);
  }
}

function renderAgentMessage(item) {
  const cell = el("div", { class: "cell assistant" });
  const bubble = el("div", { class: "bubble" });
  bubble.innerHTML = renderMarkdownish(item.text ?? "");
  cell.appendChild(bubble);
  return cell;
}

function renderReasoning(item) {
  const cell = el("div", { class: "cell assistant" });
  const r = el("div", { class: "reasoning" });
  r.textContent = item.text ?? "";
  cell.appendChild(r);
  return cell;
}

function renderCommandExec(item) {
  // v2 commandExecution: { command, status: "inProgress"|"completed"|"failed"|"declined",
  //                         aggregatedOutput, exitCode, durationMs, ... }
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${escapeHtml(item.status)}"></span>
      <span class="badge">shell</span>
      <span>${escapeHtml(item.status)}${item.exitCode != null ? ` · exit ${item.exitCode}` : ""}</span>
    </div>
    <div class="tc-cmd">$ ${escapeHtml(item.command ?? "")}</div>
  `;
  if (item.aggregatedOutput) {
    const pre = el("pre");
    pre.textContent = item.aggregatedOutput;
    card.appendChild(pre);
  }
  cell.appendChild(card);
  return cell;
}

// v2 PatchChangeKind is a tagged union: { type: "add" | "delete" | "update", … }.
// Older payloads may still carry a plain string; tolerate both for safety.
function patchKind(k) {
  if (!k) return "update";
  if (typeof k === "string") return k;
  return k.type ?? "update";
}

function renderFileChange(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  const counts = item.changes?.reduce((acc, c) => {
    const kind = patchKind(c.kind);
    acc[kind] = (acc[kind] ?? 0) + 1; return acc;
  }, {}) ?? {};
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${escapeHtml(item.status)}"></span>
      <span class="badge">apply_patch</span>
      <span>${escapeHtml(item.status)}${summary ? ` · ${summary}` : ""}</span>
    </div>
  `;
  for (const c of item.changes ?? []) {
    const kind = patchKind(c.kind);
    const file = el("div", { class: "diff-file" });
    file.innerHTML = `
      <header>
        <span class="kind ${escapeHtml(kind)}">${escapeHtml(kind)}</span>
        <span>${escapeHtml(c.path)}</span>
      </header>
      ${c.diff ? `<div class="diff-body">${renderDiff(c.diff)}</div>` : ""}
    `;
    card.appendChild(file);
  }
  cell.appendChild(card);
  return cell;
}

function renderDiff(diff) {
  return diff.split("\n").map((line) => {
    const safe = escapeHtml(line);
    if (line.startsWith("+") && !line.startsWith("+++")) return `<div class="add">${safe}</div>`;
    if (line.startsWith("-") && !line.startsWith("---")) return `<div class="del">${safe}</div>`;
    return `<div>${safe}</div>`;
  }).join("");
}

function renderMcp(item) {
  // v2 mcpToolCall: { server, tool, status, arguments, result, error, durationMs }
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${escapeHtml(item.status)}"></span>
      <span class="badge">mcp</span>
      <span>${escapeHtml(item.server ?? "")} · ${escapeHtml(item.tool ?? "")} · ${escapeHtml(item.status ?? "")}</span>
    </div>
    <details><summary>arguments</summary><pre>${escapeHtml(JSON.stringify(item.arguments, null, 2))}</pre></details>
    ${item.result ? `<details><summary>result</summary><pre>${escapeHtml(JSON.stringify(item.result, null, 2))}</pre></details>` : ""}
    ${item.error ? `<div class="tc-meta" style="color:var(--danger)">${escapeHtml(item.error.message ?? JSON.stringify(item.error))}</div>` : ""}
  `;
  cell.appendChild(card);
  return cell;
}

function renderPlan(item) {
  // v2 plan item: { id, text }
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot completed"></span>
      <span class="badge">plan</span>
    </div>
    <pre>${escapeHtml(item.text ?? "")}</pre>
  `;
  cell.appendChild(card);
  return cell;
}

function renderUnknown(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head"><span class="badge">${escapeHtml(item.type)}</span></div>
    <pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>`;
  cell.appendChild(card);
  return cell;
}

// ---------- approval modal (inline in transcript) ----------
// Driven by server-initiated JSON-RPC requests. `onDecision` is invoked with
// "approve" | "approve-session" | "deny" and is responsible for replying.
function renderApproval({ request: r, onDecision }) {
  const transcript = $("#transcript");
  const card = el("div", { class: "approval-card" });
  const head = r.kind === "apply_patch" ? "Apply patch?" : r.kind === "exec" ? "Run command?" : "Approval requested";
  let body;
  if (r.kind === "exec") {
    body = `<div class="tc-cmd">$ ${escapeHtml(r.command ?? "")}</div>
            ${r.cwd ? `<div class="tc-meta">cwd: ${escapeHtml(r.cwd)}</div>` : ""}
            ${r.reason ? `<div class="tc-meta">${escapeHtml(r.reason)}</div>` : ""}`;
  } else if (r.kind === "apply_patch") {
    body = `<div class="tc-meta">${escapeHtml(r.summary ?? "")}</div>
            <ul class="todo-list">${(r.files ?? []).map((f) => `<li class="done">${escapeHtml(f.kind)} ${escapeHtml(f.path)}</li>`).join("")}</ul>`;
  } else {
    body = `<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`;
  }
  card.innerHTML = `
    <div class="ap-head">⚠ ${head}</div>
    <div class="ap-body">${body}</div>
    <div class="ap-actions">
      <button class="primary" data-decision="approve">Approve once</button>
      <button data-decision="approve-session">Approve for session</button>
      <button class="danger" data-decision="deny">Deny</button>
    </div>`;
  card.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-decision]");
    if (!btn) return;
    onDecision(btn.dataset.decision);
    card.querySelectorAll("button").forEach((b) => (b.disabled = true));
    card.querySelector(".ap-head").textContent = `→ ${btn.dataset.decision}`;
  });
  transcript.appendChild(card);
  scrollToBottom();
}

// ---------- composer & autocomplete ----------
let acState = { kind: null, items: [], selected: 0, anchorStart: 0 };

function bindUi() {
  $("#composer").addEventListener("submit", onSubmit);
  $("#cancel-btn").addEventListener("click", interruptTurn);
  $("#new-thread").addEventListener("click", newThread);
  $("#account-btn").addEventListener("click", onAccountClick);
  $("#settings-btn").addEventListener("click", openSettings);

  const input = $("#input");
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  autoGrow(input);
}

function autoGrow(t) {
  const update = () => {
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 200) + "px";
  };
  t.addEventListener("input", update); update();
}

async function onInput(e) {
  const t = e.target;
  const pos = t.selectionStart;
  const upto = t.value.slice(0, pos);
  // slash command at start of line
  const slashMatch = /(^|\n)(\/[A-Za-z\-]*)$/.exec(upto);
  if (slashMatch) {
    const q = slashMatch[2];
    const items = state.slashCommands.filter((c) => c.name.startsWith(q));
    showAutocomplete({ kind: "slash", items, anchorStart: pos - q.length });
    return;
  }
  const atMatch = /(^|\s)@([A-Za-z0-9_\-./]*)$/.exec(upto);
  if (atMatch) {
    const q = atMatch[2];
    try {
      const r = await fetch("/api/file-search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await r.json();
      const items = (data.results ?? []).map((p) => ({ name: "@" + p, desc: "file" }));
      showAutocomplete({ kind: "file", items, anchorStart: pos - q.length - 1 });
    } catch { hideAutocomplete(); }
    return;
  }
  hideAutocomplete();
}

function showAutocomplete({ kind, items, anchorStart }) {
  const ac = $("#autocomplete");
  if (items.length === 0) { hideAutocomplete(); return; }
  acState = { kind, items, selected: 0, anchorStart };
  ac.innerHTML = items.map((it, i) =>
    `<div class="ac-item ${i === 0 ? "selected" : ""}" data-idx="${i}">${escapeHtml(it.name)}<span class="ac-desc">${escapeHtml(it.desc ?? "")}</span></div>`
  ).join("");
  ac.hidden = false;
  ac.querySelectorAll(".ac-item").forEach((node) => {
    node.addEventListener("click", () => {
      acState.selected = Number(node.dataset.idx);
      acceptAutocomplete();
    });
  });
}

function hideAutocomplete() {
  const ac = $("#autocomplete");
  ac.hidden = true; ac.innerHTML = "";
  acState = { kind: null, items: [], selected: 0, anchorStart: 0 };
}

function acceptAutocomplete() {
  const it = acState.items[acState.selected];
  if (!it) return;
  const t = $("#input");
  const before = t.value.slice(0, acState.anchorStart);
  const after = t.value.slice(t.selectionStart);
  t.value = before + it.name + (it.name.startsWith("/") ? " " : " ") + after;
  const newPos = (before + it.name + " ").length;
  t.setSelectionRange(newPos, newPos);
  hideAutocomplete();
  t.focus();
}

function onKeyDown(e) {
  const ac = $("#autocomplete");
  if (!ac.hidden) {
    if (e.key === "ArrowDown") {
      e.preventDefault(); moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); moveSelection(-1);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault(); acceptAutocomplete();
    } else if (e.key === "Escape") {
      e.preventDefault(); hideAutocomplete();
    }
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#composer").requestSubmit();
  } else if (e.key === "Escape" && state.inFlight) {
    e.preventDefault();
    interruptTurn();
  }
}

function moveSelection(delta) {
  const items = $$("#autocomplete .ac-item");
  acState.selected = (acState.selected + delta + items.length) % items.length;
  items.forEach((n, i) => n.classList.toggle("selected", i === acState.selected));
}

function onSubmit(e) {
  e.preventDefault();
  const t = $("#input");
  const text = t.value.trim();
  if (!text) return;
  if (text.startsWith("/")) {
    handleSlash(text);
    t.value = ""; autoGrowReset(t);
    return;
  }
  appendUser(text);
  startTurn(text);
  t.value = ""; autoGrowReset(t);
}

async function startTurn(text) {
  setInFlight(true);
  try {
    let threadId = state.activeThreadId;
    if (!threadId) {
      // Canonical v2 ThreadStartParams: `sandbox` (not `sandboxMode`),
      // `approvalPolicy`, `experimentalRawEvents`, `persistExtendedHistory`
      // are required by the schema. The response is { thread: Thread, ... }.
      const r = await rpcCall("thread/start", {
        cwd: state.whoami?.workdir,
        model: state.settings.model,
        sandbox: state.settings.sandboxMode,
        approvalPolicy: state.settings.approvalPolicy,
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      });
      threadId = r?.thread?.id ?? null;
      if (threadId) state.activeThreadId = threadId;
    }
    // Canonical v2 TurnStartParams: { threadId, input: UserInput[] }.
    // UserInput "text" requires `text_elements` per the schema.
    await rpcCall("turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
    });
  } catch (e) {
    setInFlight(false);
    appendSystem(`✗ ${e.message}`, "error");
  }
}

async function interruptTurn() {
  if (!state.activeThreadId || !state.activeTurnId) return;
  // Canonical v2 TurnInterruptParams: { threadId, turnId }.
  try {
    await rpcCall("turn/interrupt", {
      threadId: state.activeThreadId,
      turnId: state.activeTurnId,
    });
  } catch {}
}

function autoGrowReset(t) { t.style.height = "auto"; }

function appendUser(text) {
  const cell = el("div", { class: "cell user" });
  const bubble = el("div", { class: "bubble" });
  bubble.textContent = text;
  cell.appendChild(bubble);
  $("#transcript").appendChild(cell);
  scrollToBottom();
}

function appendSystem(text, kind = "info") {
  const cell = el("div", { class: "cell system" });
  const bubble = el("div", { class: "bubble" });
  bubble.textContent = text;
  if (kind === "error") bubble.style.color = "var(--danger)";
  cell.appendChild(bubble);
  $("#transcript").appendChild(cell);
  scrollToBottom();
}

function setInFlight(v) {
  state.inFlight = v;
  $("#cancel-btn").hidden = !v;
  $("#send-btn").disabled = v;
}

function scrollToBottom() {
  const t = $("#transcript");
  t.scrollTop = t.scrollHeight;
}

// ---------- slash commands ----------
function handleSlash(text) {
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (cmd) {
    case "/new": newThread(); return;
    case "/clear":
      $("#transcript").innerHTML = "";
      state.itemsById.clear(); state.itemOrder = [];
      return;
    case "/help":
      appendSystem("Commands: " + state.slashCommands.map((c) => c.name).join(", "));
      return;
    case "/status": {
      const w = state.whoami ?? {};
      appendSystem(
        `backend=${w.backend ?? "?"} · model=${state.settings.model} · ` +
        `approvals=${state.settings.approvalPolicy} · sandbox=${state.settings.sandboxMode} · ` +
        `network=${state.settings.networkAccessEnabled} · workdir=${w.workdir ?? "?"}`
      );
      return;
    }
    case "/login": openLogin(); return;
    case "/logout": doLogout(); return;
    case "/mcp": openMcpModal(); return;
    case "/model":
      if (arg) { state.settings.model = arg; save("settings", state.settings); updateStatusBar(); appendSystem(`model → ${arg}`); }
      else openSettings("model");
      return;
    case "/approvals":
      if (["never","on-request","on-failure","untrusted"].includes(arg)) {
        state.settings.approvalPolicy = arg; save("settings", state.settings); updateStatusBar(); appendSystem(`approvals → ${arg}`);
      } else openSettings("approvalPolicy");
      return;
    case "/sandbox":
      if (["read-only","workspace-write","danger-full-access"].includes(arg)) {
        state.settings.sandboxMode = arg; save("settings", state.settings); updateStatusBar(); appendSystem(`sandbox → ${arg}`);
      } else openSettings("sandboxMode");
      return;
    case "/reasoning":
      if (["minimal","low","medium","high","xhigh"].includes(arg)) {
        state.settings.modelReasoningEffort = arg; save("settings", state.settings); appendSystem(`reasoning → ${arg}`);
      } else openSettings("modelReasoningEffort");
      return;
    case "/web-search":
      if (["disabled","cached","live"].includes(arg)) {
        state.settings.webSearchMode = arg; save("settings", state.settings); appendSystem(`web search → ${arg}`);
      } else openSettings("webSearchMode");
      return;
    case "/network":
      state.settings.networkAccessEnabled = !state.settings.networkAccessEnabled;
      save("settings", state.settings);
      appendSystem(`network access → ${state.settings.networkAccessEnabled ? "on" : "off"}`);
      return;
    case "/resume":
      appendSystem("Pick a thread from the sidebar to resume.");
      return;
    case "/reset":
      // Canonical reset: interrupt any in-flight turn and start a fresh
      // thread on the next user turn. Mirrors codex-tui's /reset.
      if (state.activeThreadId && state.activeTurnId) {
        rpcCall("turn/interrupt", {
          threadId: state.activeThreadId,
          turnId: state.activeTurnId,
        }).catch(() => {});
      }
      newThread();
      appendSystem("Conversation reset.");
      return;
    case "/compact":
      // Canonical compaction: ask the backend to summarize and prune
      // conversation history. Mirrors codex-tui's /compact.
      if (!state.activeThreadId) { appendSystem("No active thread to compact.", "error"); return; }
      rpcCall("thread/compact/start", { threadId: state.activeThreadId })
        .then(() => appendSystem("Compact requested."))
        .catch((e) => appendSystem(`compact failed: ${e.message}`, "error"));
      return;
    default:
      appendSystem(`unknown command: ${cmd}`, "error");
  }
}

function updateStatusBar() {
  const w = state.whoami ?? {};
  const backendPill = $("#backend-pill");
  backendPill.textContent = `backend: ${w.backend ?? "?"}`;
  backendPill.className = "pill " + (w.backend === "real" ? "ok" : "warn");
  $("#model-pill").textContent = `model: ${state.settings.model}`;
  $("#approval-pill").textContent = `approvals: ${state.settings.approvalPolicy}`;
  $("#sandbox-pill").textContent = `sandbox: ${state.settings.sandboxMode}`;
}

// ---------- modals: login / settings ----------
function modal(html, onMount) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  root.querySelector(".modal-backdrop").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  });
  if (onMount) onMount(root.querySelector(".modal"));
}
function closeModal() { $("#modal-root").innerHTML = ""; }

function waitForReady(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN && state.initialized) return resolve();
    const t = setTimeout(() => { window.removeEventListener("codex:ready", on); resolve(); }, timeoutMs);
    function on() { clearTimeout(t); window.removeEventListener("codex:ready", on); resolve(); }
    window.addEventListener("codex:ready", on);
  });
}

function onAccountClick() {
  if (state.whoami?.hasApiKey || state.whoami?.hasOauth) doLogout();
  else openLogin();
}

function openLogin() {
  modal(`
    <h2>Sign in to Codex</h2>
    <p>Choose a sign-in method. Credentials are stored only on the server, tied to your session cookie.</p>
    <div class="modal-row">
      <button id="chatgpt" class="primary" style="width:100%">Sign in with ChatGPT</button>
    </div>
    <div class="modal-row" style="opacity:.6;text-align:center;font-size:12px">— or —</div>
    <div class="modal-row"><label>OpenAI API key</label><input id="apikey" type="password" placeholder="sk-…" autofocus /></div>
    <div class="modal-actions">
      <button id="cancel" class="ghost">Cancel</button>
      <button id="save" class="primary">Use API key</button>
    </div>
    <div id="oauth-status" class="muted" style="font-size:12px;margin-top:8px"></div>
  `, (m) => {
    m.querySelector("#cancel").addEventListener("click", closeModal);
    m.querySelector("#chatgpt").addEventListener("click", async () => {
      const status = m.querySelector("#oauth-status");
      status.textContent = "Starting ChatGPT sign-in…";
      try {
        // Seed gateway-side OAuth bookkeeping, then drive the canonical
        // `account/login/start` JSON-RPC request. The gateway forwards it
        // verbatim and intercepts the `account/updated` notification to
        // persist the resulting token in the session.
        await fetch("/api/oauth/chatgpt/start", { method: "POST" });
        // Canonical v2 LoginAccountParams: { type: "chatgptDeviceCode" }.
        // Response is { type: "chatgptDeviceCode", loginId, verificationUrl, userCode }.
        const r = await rpcCall("account/login/start", { type: "chatgptDeviceCode" });
        const verificationUrl = r?.verificationUrl ?? r?.authUrl;
        const userCode = r?.userCode;
        status.innerHTML = userCode
          ? `Open <a href="${escapeHtml(verificationUrl)}" target="_blank" rel="noopener">${escapeHtml(verificationUrl)}</a> and enter code <code>${escapeHtml(userCode)}</code>.`
          : `Open <a href="${escapeHtml(verificationUrl)}" target="_blank" rel="noopener">${escapeHtml(verificationUrl)}</a> to continue.`;
        // The mock backend resolves the OAuth flow via an `account/updated`
        // notification; that handler closes the modal.
        const onSignedIn = () => { closeModal(); window.removeEventListener("codex:signedIn", onSignedIn); };
        window.addEventListener("codex:signedIn", onSignedIn);
      } catch (e) {
        status.textContent = `OAuth failed: ${e.message}`;
      }
    });
    m.querySelector("#save").addEventListener("click", async () => {
      const key = m.querySelector("#apikey").value.trim();
      if (!key) return;
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      if (r.ok) {
        await refreshWhoAmI();
        updateStatusBar();
        appendSystem("Signed in with API key.");
        closeModal();
        // Reconnect WS so the new auth is in the child env.
        if (state.ws) state.ws.close();
      } else {
        const data = await r.json().catch(() => ({}));
        appendSystem(`Login failed: ${data.error ?? r.status}`, "error");
      }
    });
  });
}

async function openMcpModal() {
  modal(`
    <h2>MCP servers</h2>
    <p>Servers configured via <code>~/.codex/config.toml</code> (and added here for this session).</p>
    <div id="mcp-list"><div class="muted">Loading…</div></div>
    <div class="modal-row" style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <label>Add a new server</label>
      <input id="mcp-name" placeholder="server name" />
      <input id="mcp-cmd" placeholder="command (e.g. npx -y @modelcontextprotocol/server-filesystem /tmp)" style="margin-top:6px" />
    </div>
    <div class="modal-actions">
      <button id="add" class="primary">Add</button>
      <button id="reload">Reload</button>
      <button id="close" class="ghost">Close</button>
    </div>
  `, async (m) => {
    const refresh = async () => {
      try {
        // v2 ListMcpServerStatusResponse: { data: McpServerStatus[], nextCursor }.
        const r = await rpcCall("mcpServerStatus/list", {});
        const list = m.querySelector("#mcp-list");
        const servers = r?.data ?? r?.servers ?? [];
        if (servers.length === 0) {
          list.innerHTML = `<div class="muted">No MCP servers configured.</div>`;
        } else {
          list.innerHTML = servers.map((s) => {
            const startup = s.startupState ?? s.status ?? "?";
            const ok = startup === "running" || startup === "connected";
            const tools = (s.tools ?? []).map((t) => t.name ?? t).filter(Boolean);
            return `
            <div class="tool-card" style="margin-bottom:8px">
              <div class="tc-head">
                <span class="status-dot ${ok ? "completed" : "failed"}"></span>
                <strong>${escapeHtml(s.name)}</strong>
                <span class="muted">${escapeHtml(startup)}</span>
              </div>
              ${tools.length ? `<div class="tc-meta">tools: ${escapeHtml(tools.join(", "))}</div>` : ""}
            </div>`;
          }).join("");
        }
      } catch (e) {
        m.querySelector("#mcp-list").innerHTML = `<div class="muted">Error: ${escapeHtml(e.message)}</div>`;
      }
    };
    window.__mcpRefresh = refresh;
    await refresh();
    m.querySelector("#close").addEventListener("click", () => { window.__mcpRefresh = null; closeModal(); });
    m.querySelector("#reload").addEventListener("click", async () => {
      await rpcCall("config/mcpServer/reload", {}).catch(() => {});
      await refresh();
    });
    m.querySelector("#add").addEventListener("click", async () => {
      const name = m.querySelector("#mcp-name").value.trim();
      const cmd  = m.querySelector("#mcp-cmd").value.trim();
      if (!name || !cmd) return;
      // Canonical v2 ConfigValueWriteParams: { keyPath, value, mergeStrategy }.
      await rpcCall("config/value/write", {
        keyPath: `mcp_servers.${name}`,
        value: { command: cmd.split(" ")[0], args: cmd.split(" ").slice(1) },
        mergeStrategy: "upsert",
      }).catch(() => {});
      await rpcCall("config/mcpServer/reload", {}).catch(() => {});
      await refresh();
    });
  });
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  await refreshWhoAmI();
  updateStatusBar();
  appendSystem("Signed out.");
}

function openSettings(focus) {
  const s = state.settings;
  const sel = (name, options) =>
    `<select name="${name}">${options.map((o) => `<option value="${o}" ${s[name] === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  modal(`
    <h2>Settings</h2>
    <p>Mirrors the TUI's <code>/model</code>, <code>/approvals</code>, and <code>/sandbox</code> menus.</p>
    <div class="modal-row"><label>Model</label><input name="model" value="${escapeHtml(s.model)}" /></div>
    <div class="modal-row"><label>Approval policy</label>${sel("approvalPolicy", ["never","on-request","on-failure","untrusted"])}</div>
    <div class="modal-row"><label>Sandbox</label>${sel("sandboxMode", ["read-only","workspace-write","danger-full-access"])}</div>
    <div class="modal-row"><label>Reasoning effort</label>${sel("modelReasoningEffort", ["minimal","low","medium","high","xhigh"])}</div>
    <div class="modal-row"><label>Web search</label>${sel("webSearchMode", ["disabled","cached","live"])}</div>
    <div class="modal-row"><label><input type="checkbox" name="networkAccessEnabled" ${s.networkAccessEnabled ? "checked" : ""} /> Allow network access in sandbox</label></div>
    <div class="modal-row"><label>Server working directory</label><input value="${escapeHtml(state.whoami?.workdir ?? "")}" disabled /></div>
    <div class="modal-actions">
      <button id="cancel" class="ghost">Cancel</button>
      <button id="save" class="primary">Save</button>
    </div>
  `, (m) => {
    if (focus) {
      const f = m.querySelector(`[name="${focus}"]`);
      if (f) f.focus();
    }
    m.querySelector("#cancel").addEventListener("click", closeModal);
    m.querySelector("#save").addEventListener("click", async () => {
      for (const k of ["model","approvalPolicy","sandboxMode","modelReasoningEffort","webSearchMode"]) {
        const node = m.querySelector(`[name="${k}"]`);
        if (node) state.settings[k] = node.value;
      }
      state.settings.networkAccessEnabled = m.querySelector(`[name="networkAccessEnabled"]`).checked;
      save("settings", state.settings);
      updateStatusBar();
      // Push to the backend over the canonical config/value/write method so
      // settings actually take effect on the next turn.
      await pushSettingsToBackend();
      closeModal();
    });
  });
}

// ---------- helpers ----------
function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  return node;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function renderMarkdownish(text) {
  // Very small subset: code fences, inline code, bold, italic, links.
  // Keeps the bundle dependency-free while showing reasonable formatting.
  let out = escapeHtml(text);
  out = out.replace(/```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre><code>${code}</code></pre>`);
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return out;
}

bootstrap();
