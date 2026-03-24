const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  conversations: [],
  activeConversationId: null,
  authMode: "login",
  sending: false,
  theme: localStorage.getItem("theme") || "dark",
};

const els = {
  app: document.getElementById("app"),
  sidebar: document.getElementById("sidebar"),
  newChatBtn: document.getElementById("newChatBtn"),
  conversationList: document.getElementById("conversationList"),
  messages: document.getElementById("messages"),
  inputBox: document.getElementById("inputBox"),
  sendBtn: document.getElementById("sendBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  userBadge: document.getElementById("userBadge"),
  mobileMenuBtn: document.getElementById("mobileMenuBtn"),
  themeBtn: document.getElementById("themeBtn"),

  authModal: document.getElementById("authModal"),
  authForm: document.getElementById("authForm"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  tabLogin: document.getElementById("tabLogin"),
  tabRegister: document.getElementById("tabRegister"),

  adminBtn: document.getElementById("adminBtn"),
  adminModal: document.getElementById("adminModal"),
  adminForm: document.getElementById("adminForm"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelInput: document.getElementById("modelInput"),
  closeAdminBtn: document.getElementById("closeAdminBtn"),

  toast: document.getElementById("toast"),
};

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2200);
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  state.theme = next;
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  els.themeBtn.textContent = next === "dark" ? "浅色模式" : "深色模式";
}

function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

function setAuthMode(mode) {
  state.authMode = mode;
  els.tabLogin.classList.toggle("active", mode === "login");
  els.tabRegister.classList.toggle("active", mode === "register");
  els.authSubmitBtn.textContent = mode === "login" ? "登录" : "注册";
}

function setAuthenticated(ok) {
  els.authModal.classList.toggle("hidden", ok);
  els.app.classList.toggle("hidden", !ok);
}

function saveToken(token) {
  state.token = token;
  localStorage.setItem("token", token);
}

function clearToken() {
  state.token = "";
  localStorage.removeItem("token");
}

function escapeHtml(text) {
  const value = String(text ?? "");
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(markup) {
  const inlineCodes = [];
  let text = markup.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.push(code) - 1;
    return `@@ICODE_${idx}@@`;
  });

  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  text = text.replace(/@@ICODE_(\d+)@@/g, (_, idx) => {
    return `<code>${inlineCodes[Number(idx)]}</code>`;
  });

  return text;
}

function markdownToHtml(source) {
  const normalized = String(source ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const codeBlocks = [];
  let text = normalized.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx =
      codeBlocks.push({
        lang: lang || "",
        code: escapeHtml(code.replace(/\n$/, "")),
      }) - 1;
    return `@@CODE_${idx}@@`;
  });

  text = escapeHtml(text);
  const lines = text.split("\n");
  const html = [];
  let para = [];
  let inUl = false;
  let inOl = false;

  const flushPara = () => {
    if (!para.length) {
      return;
    }
    const body = renderInline(para.join("<br>"));
    html.push(`<p>${body}</p>`);
    para = [];
  };

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    const codeMatch = line.match(/^@@CODE_(\d+)@@$/);
    if (codeMatch) {
      flushPara();
      closeLists();
      const block = codeBlocks[Number(codeMatch[1])];
      const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      html.push(`<pre><code${langClass}>${block.code}</code></pre>`);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      closeLists();
      continue;
    }

    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      html.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    const bq = trimmed.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      closeLists();
      html.push(`<blockquote>${renderInline(bq[1])}</blockquote>`);
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    closeLists();
    para.push(trimmed);
  }

  flushPara();
  closeLists();
  return html.join("\n");
}

function renderMathForElement(element) {
  if (!window.MathJax || !window.MathJax.typesetPromise) {
    return;
  }
  window.MathJax.typesetPromise([element]).catch(() => {});
}

function setAssistantHtml(box, content, shouldTypesetMath = true) {
  box.innerHTML = markdownToHtml(content);
  if (shouldTypesetMath) {
    renderMathForElement(box);
  }
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token && options.auth !== false) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { detail: raw };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      doLogout();
    }
    throw new Error(data?.detail || `请求失败（${response.status}）`);
  }

  return data;
}

function renderUser() {
  if (!state.user) {
    els.userBadge.textContent = "";
    els.adminBtn.classList.add("hidden");
    return;
  }

  const roleName = state.user.role === "admin" ? "管理员" : "用户";
  els.userBadge.textContent = `${state.user.username} · ${roleName}`;
  els.adminBtn.classList.toggle("hidden", state.user.role !== "admin");
}

function formatTitle(raw) {
  const value = (raw || "新对话").trim();
  if (!value || value === "New Chat") {
    return "新对话";
  }
  return value;
}

function renderConversationList() {
  els.conversationList.innerHTML = "";

  if (!state.conversations.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无对话，点击“新建对话”开始。";
    els.conversationList.appendChild(empty);
    return;
  }

  state.conversations.forEach((conv) => {
    const row = document.createElement("div");
    row.className = `conversation-item ${state.activeConversationId === conv.id ? "active" : ""}`;

    const title = document.createElement("div");
    title.className = "conversation-title";
    title.textContent = formatTitle(conv.title);

    const del = document.createElement("button");
    del.className = "conversation-delete";
    del.textContent = "×";
    del.title = "删除对话";
    del.onclick = async (e) => {
      e.stopPropagation();
      try {
        await removeConversation(conv.id);
      } catch (err) {
        showToast(err.message);
      }
    };

    row.onclick = () => selectConversation(conv.id);
    row.appendChild(title);
    row.appendChild(del);
    els.conversationList.appendChild(row);
  });
}

function appendMessage(role, content, temp = false) {
  const turn = document.createElement("div");
  turn.className = `turn ${role}`;
  if (temp) {
    turn.dataset.temp = "1";
  }

  const inner = document.createElement("div");
  inner.className = "turn-inner";

  const box = document.createElement("div");
  box.className = `msg ${role}`;

  if (temp) {
    box.classList.add("msg-typing");
    box.textContent = content;
  } else if (role === "assistant") {
    setAssistantHtml(box, content, true);
  } else {
    box.innerHTML = escapeHtml(content).replace(/\n/g, "<br>");
  }

  inner.appendChild(box);
  turn.appendChild(inner);
  els.messages.appendChild(turn);
  els.messages.scrollTop = els.messages.scrollHeight;
  return { turn, box };
}

function renderMessages(messages) {
  els.messages.innerHTML = "";

  if (!messages.length) {
    appendMessage(
      "assistant",
      "你好，我是你的 AI法律助手。\n\n你可以直接描述问题场景，我会给出结构化建议，并标注风险边界。",
      false
    );
    return;
  }

  messages.forEach((msg) => appendMessage(msg.role, msg.content, false));
}

async function loadMessages(conversationId) {
  const messages = await api(`/api/chat/conversations/${conversationId}/messages`);
  renderMessages(messages);
}

async function selectConversation(conversationId) {
  state.activeConversationId = conversationId;
  renderConversationList();
  await loadMessages(conversationId);

  if (window.innerWidth <= 900) {
    els.sidebar.classList.remove("open");
  }
}

async function loadConversations() {
  state.conversations = await api("/api/chat/conversations");
  renderConversationList();

  if (!state.conversations.length) {
    state.activeConversationId = null;
    renderMessages([]);
    return;
  }

  const exists = state.conversations.some((c) => c.id === state.activeConversationId);
  if (!exists) {
    state.activeConversationId = state.conversations[0].id;
  }

  await loadMessages(state.activeConversationId);
  renderConversationList();
}

async function refreshConversationListOnly() {
  state.conversations = await api("/api/chat/conversations");
  renderConversationList();
}

async function createConversation() {
  const conv = await api("/api/chat/conversations", { method: "POST" });
  await loadConversations();
  await selectConversation(conv.id);
  return conv;
}

async function removeConversation(conversationId) {
  await api(`/api/chat/conversations/${conversationId}`, { method: "DELETE" });
  if (state.activeConversationId === conversationId) {
    state.activeConversationId = null;
  }
  await loadConversations();
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split(/\r?\n/);
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) {
    return null;
  }
  const rawData = dataLines.join("\n");
  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
}

async function streamAssistantReply(conversationId, content, onToken) {
  const response = await fetch(`/api/chat/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const raw = await response.text();
    try {
      const data = JSON.parse(raw);
      throw new Error(data?.detail || "请求失败");
    } catch {
      throw new Error(raw || "请求失败");
    }
  }

  if (!response.body) {
    throw new Error("浏览器不支持流式读取");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const event = parseSseEvent(rawEvent);
      if (!event) {
        continue;
      }

      if (event.type === "token") {
        onToken(event.content || "");
      } else if (event.type === "error") {
        throw new Error(event.message || "流式输出失败");
      } else if (event.type === "done") {
        return;
      }
    }
  }
}

async function sendCurrentMessage() {
  const text = els.inputBox.value.trim();
  if (!text || state.sending) {
    return;
  }

  if (!state.activeConversationId) {
    try {
      await createConversation();
    } catch (err) {
      showToast(err.message);
      return;
    }
  }

  state.sending = true;
  els.sendBtn.disabled = true;
  els.inputBox.value = "";
  autoResizeInput();

  appendMessage("user", text);
  const streamed = appendMessage("assistant", "正在思考中...", true);

  let assistantText = "";
  try {
    await streamAssistantReply(state.activeConversationId, text, (chunk) => {
      if (!chunk) {
        return;
      }
      assistantText += chunk;
      streamed.turn.dataset.temp = "0";
      streamed.box.classList.remove("msg-typing");
      setAssistantHtml(streamed.box, assistantText, false);
      els.messages.scrollTop = els.messages.scrollHeight;
    });

    if (!assistantText.trim()) {
      assistantText = "抱歉，我暂时无法生成有效回答。";
    }

    streamed.turn.dataset.temp = "0";
    streamed.box.classList.remove("msg-typing");
    setAssistantHtml(streamed.box, assistantText, true);
    await refreshConversationListOnly();
  } catch (err) {
    if (!assistantText.trim()) {
      streamed.turn.remove();
    } else {
      streamed.turn.dataset.temp = "0";
      streamed.box.classList.remove("msg-typing");
      setAssistantHtml(streamed.box, assistantText, true);
    }
    showToast(err.message);
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

function autoResizeInput() {
  els.inputBox.style.height = "auto";
  els.inputBox.style.height = `${Math.min(els.inputBox.scrollHeight, 200)}px`;
}

async function doLogin(username, password) {
  const data = await api("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username, password },
  });

  saveToken(data.access_token);
  state.user = data.user;
  renderUser();
  setAuthenticated(true);
  await loadConversations();
}

async function doRegister(username, password) {
  await api("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username, password },
  });
  await doLogin(username, password);
}

function doLogout() {
  clearToken();
  state.user = null;
  state.conversations = [];
  state.activeConversationId = null;
  renderUser();
  setAuthenticated(false);
}

async function openAdminModal() {
  const config = await api("/api/admin/config");
  els.apiKeyInput.value = config.api_key || "";
  els.baseUrlInput.value = config.base_url || "";
  els.modelInput.value = config.model || "gpt-4o-mini";
  els.adminModal.classList.remove("hidden");
}

async function saveAdminConfig(e) {
  e.preventDefault();
  await api("/api/admin/config", {
    method: "PUT",
    body: {
      api_key: els.apiKeyInput.value,
      base_url: els.baseUrlInput.value,
      model: els.modelInput.value,
    },
  });
  els.adminModal.classList.add("hidden");
  showToast("配置已保存");
}

async function boot() {
  applyTheme(state.theme);
  setAuthMode("login");
  setAuthenticated(false);

  if (!state.token) {
    return;
  }

  try {
    state.user = await api("/api/auth/me");
    renderUser();
    setAuthenticated(true);
    await loadConversations();
  } catch {
    doLogout();
  }
}

els.tabLogin.onclick = () => setAuthMode("login");
els.tabRegister.onclick = () => setAuthMode("register");
els.logoutBtn.onclick = doLogout;
els.mobileMenuBtn.onclick = () => els.sidebar.classList.toggle("open");
els.themeBtn.onclick = toggleTheme;
els.sendBtn.onclick = sendCurrentMessage;
els.newChatBtn.onclick = async () => {
  try {
    await createConversation();
  } catch (err) {
    showToast(err.message);
  }
};
els.adminBtn.onclick = async () => {
  try {
    await openAdminModal();
  } catch (err) {
    showToast(err.message);
  }
};
els.closeAdminBtn.onclick = () => els.adminModal.classList.add("hidden");
els.adminForm.onsubmit = async (e) => {
  try {
    await saveAdminConfig(e);
  } catch (err) {
    showToast(err.message);
  }
};

els.authForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;

  try {
    if (state.authMode === "login") {
      await doLogin(username, password);
    } else {
      await doRegister(username, password);
    }
    els.authPassword.value = "";
  } catch (err) {
    showToast(err.message);
  }
};

els.inputBox.addEventListener("input", autoResizeInput);
els.inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
});

boot();
