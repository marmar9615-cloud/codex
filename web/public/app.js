// Codex Web — browser front-end.
// Talks to the gateway over /ws using the Codex JSONL event protocol
// (mirrors codex exec --experimental-json + a small approval extension).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- session state ----------
const state = {
  ws: null,
  reconnectAttempts: 0,
  whoami: null,
  threads: [],
  activeThreadId: null,
  inFlight: false,
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
    { name: "/help", desc: "Show available commands" },
  ],
};

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
  if (!w) {
    status.textContent = "—";
    return;
  }
  if (w.hasApiKey) {
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

function openThread(id) {
  state.activeThreadId = id;
  $("#thread-title").textContent = id;
  $("#transcript").innerHTML = "";
  state.itemsById.clear();
  state.itemOrder = [];
  renderThreads();
  appendSystem(`Resumed thread ${id}. Send a message to continue.`);
}

function newThread() {
  state.activeThreadId = null;
  $("#thread-title").textContent = "New conversation";
  $("#transcript").innerHTML = "";
  state.itemsById.clear();
  state.itemOrder = [];
  renderThreads();
}

// ---------- WebSocket ----------
function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws = ws;
  ws.addEventListener("open", () => {
    state.reconnectAttempts = 0;
  });
  ws.addEventListener("message", (e) => {
    try { handleEvent(JSON.parse(e.data)); }
    catch (err) { console.error("bad event", err, e.data); }
  });
  ws.addEventListener("close", () => {
    state.ws = null;
    setInFlight(false);
    appendSystem("Disconnected. Reconnecting…");
    setTimeout(connectWs, Math.min(5000, 500 * 2 ** state.reconnectAttempts++));
  });
  ws.addEventListener("error", () => ws.close());
}
function send(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(msg));
  }
}

// ---------- event handling ----------
function handleEvent(evt) {
  switch (evt.type) {
    case "ready":
      state.whoami = { ...(state.whoami ?? {}), backend: evt.backend, workdir: evt.workdir };
      updateStatusBar();
      return;
    case "turn.queued":
      setInFlight(true);
      return;
    case "thread.started":
      state.activeThreadId = evt.thread_id;
      $("#thread-title").textContent = evt.thread_id;
      refreshThreads();
      return;
    case "turn.started":
      // already in_flight, nothing else to do
      return;
    case "item.started":
    case "item.updated":
      upsertItem(evt.item, evt.type === "item.started");
      return;
    case "item.completed":
      upsertItem(evt.item, false, true);
      return;
    case "turn.completed":
      setInFlight(false);
      if (evt.usage) {
        appendSystem(`Turn complete · ${evt.usage.input_tokens} in / ${evt.usage.output_tokens} out tokens`);
      }
      return;
    case "turn.failed":
      setInFlight(false);
      appendSystem(`✗ ${evt.error?.message ?? "turn failed"}`, "error");
      return;
    case "approval.request":
      renderApproval(evt);
      return;
    case "error":
      appendSystem(`✗ ${evt.message}`, "error");
      return;
    case "log":
      console.log("[backend]", evt.line);
      return;
    default:
      console.warn("unknown event", evt);
  }
}

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
  switch (item.type) {
    case "agent_message": return renderAgentMessage(item);
    case "reasoning": return renderReasoning(item);
    case "command_execution": return renderCommandExec(item);
    case "file_change": return renderFileChange(item);
    case "mcp_tool_call": return renderMcp(item);
    case "web_search": return renderWebSearch(item);
    case "todo_list": return renderTodoList(item);
    case "error": return renderErrorItem(item);
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
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${item.status}"></span>
      <span class="badge">shell</span>
      <span>${escapeHtml(item.status)}${item.exit_code != null ? ` · exit ${item.exit_code}` : ""}</span>
    </div>
    <div class="tc-cmd">$ ${escapeHtml(item.command ?? "")}</div>
  `;
  if (item.aggregated_output) {
    const pre = el("pre");
    pre.textContent = item.aggregated_output;
    card.appendChild(pre);
  }
  cell.appendChild(card);
  return cell;
}

function renderFileChange(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  const counts = item.changes?.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] ?? 0) + 1; return acc; }, {}) ?? {};
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${item.status}"></span>
      <span class="badge">apply_patch</span>
      <span>${escapeHtml(item.status)}${summary ? ` · ${summary}` : ""}</span>
    </div>
  `;
  for (const c of item.changes ?? []) {
    const file = el("div", { class: "diff-file" });
    file.innerHTML = `
      <header>
        <span class="kind ${c.kind}">${c.kind}</span>
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
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot ${item.status}"></span>
      <span class="badge">mcp</span>
      <span>${escapeHtml(item.server)} · ${escapeHtml(item.tool)} · ${escapeHtml(item.status)}</span>
    </div>
    <details><summary>arguments</summary><pre>${escapeHtml(JSON.stringify(item.arguments, null, 2))}</pre></details>
    ${item.result ? `<details><summary>result</summary><pre>${escapeHtml(JSON.stringify(item.result, null, 2))}</pre></details>` : ""}
    ${item.error ? `<div class="tc-meta" style="color:var(--danger)">${escapeHtml(item.error.message)}</div>` : ""}
  `;
  cell.appendChild(card);
  return cell;
}

function renderWebSearch(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot completed"></span>
      <span class="badge">web_search</span>
    </div>
    <div class="tc-cmd">${escapeHtml(item.query ?? "")}</div>
  `;
  cell.appendChild(card);
  return cell;
}

function renderTodoList(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot completed"></span>
      <span class="badge">plan</span>
    </div>
  `;
  const ul = el("ul", { class: "todo-list" });
  for (const t of item.items ?? []) {
    const li = el("li", { class: t.completed ? "done" : "" });
    li.append(t.text);
    ul.appendChild(li);
  }
  card.appendChild(ul);
  cell.appendChild(card);
  return cell;
}

function renderErrorItem(item) {
  const cell = el("div", { class: "cell assistant" });
  const card = el("div", { class: "tool-card" });
  card.innerHTML = `
    <div class="tc-head">
      <span class="status-dot failed"></span>
      <span class="badge">error</span>
    </div>
    <pre>${escapeHtml(item.message ?? "")}</pre>
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
function renderApproval(evt) {
  const transcript = $("#transcript");
  const card = el("div", { class: "approval-card", "data-approval-id": evt.approval_id });
  const r = evt.request ?? {};
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
    send({ type: "approval.respond", approvalId: evt.approval_id, decision: btn.dataset.decision });
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
  $("#cancel-btn").addEventListener("click", () => send({ type: "turn.interrupt" }));
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
    send({ type: "turn.interrupt" });
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
  send({
    type: "turn.start",
    input: [{ type: "text", text }],
    threadId: state.activeThreadId,
    model: state.settings.model,
    sandboxMode: state.settings.sandboxMode,
    approvalPolicy: state.settings.approvalPolicy,
    networkAccessEnabled: state.settings.networkAccessEnabled,
    modelReasoningEffort: state.settings.modelReasoningEffort,
    webSearchMode: state.settings.webSearchMode,
  });
  t.value = ""; autoGrowReset(t);
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

function onAccountClick() {
  if (state.whoami?.hasApiKey) doLogout();
  else openLogin();
}

function openLogin() {
  modal(`
    <h2>Sign in to Codex</h2>
    <p>Paste an OpenAI API key. It is stored only on the server, tied to your session cookie. The browser never sees it again.</p>
    <div class="modal-row"><label>OpenAI API key</label><input id="apikey" type="password" placeholder="sk-…" autofocus /></div>
    <div class="modal-actions">
      <button id="cancel" class="ghost">Cancel</button>
      <button id="save" class="primary">Sign in</button>
    </div>
  `, (m) => {
    m.querySelector("#cancel").addEventListener("click", closeModal);
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
        appendSystem("Signed in.");
        closeModal();
      } else {
        const data = await r.json().catch(() => ({}));
        appendSystem(`Login failed: ${data.error ?? r.status}`, "error");
      }
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
    m.querySelector("#save").addEventListener("click", () => {
      for (const k of ["model","approvalPolicy","sandboxMode","modelReasoningEffort","webSearchMode"]) {
        const node = m.querySelector(`[name="${k}"]`);
        if (node) state.settings[k] = node.value;
      }
      state.settings.networkAccessEnabled = m.querySelector(`[name="networkAccessEnabled"]`).checked;
      save("settings", state.settings);
      updateStatusBar();
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
