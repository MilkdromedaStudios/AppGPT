import { PROVIDERS, callProvider } from "./providers.js";
import { saveChat, getChat, listChats, deleteChat, getLastChatId, setLastChatId, saveApiKey, loadApiKey } from "./storage.js";

const $ = (id) => document.getElementById(id);
const els = {
  pageTitle: $("pageTitle"), providerBadge: $("providerBadge"), prompt: $("promptInput"), build: $("buildBtn"),
  modelSummary: $("modelSummary"), previewFrame: $("previewFrame"), previewEmpty: $("previewEmpty"), previewTitle: $("previewTitle"),
  openPreview: $("openPreviewBtn"), copyHtml: $("copyHtmlBtn"), download: $("downloadBtn"), editInput: $("editInput"), editBtn: $("editBtn"),
  providerSelect: $("providerSelect"), modelInput: $("modelInput"), apiKey: $("apiKeyInput"), baseUrl: $("baseUrlInput"),
  rememberKey: $("rememberKey"), toggleKey: $("toggleKeyBtn"), testProvider: $("testProviderBtn"), saveProvider: $("saveProviderBtn"),
  providerStatus: $("providerStatus"), providerCards: $("providerCards"), chatGrid: $("chatGrid"), chatsEmpty: $("chatsEmpty"),
  publishProjectName: $("publishProjectName"), publishDownload: $("publishDownloadBtn"), publishCopy: $("publishCopyBtn"), toast: $("toast"),
  newChat: $("newChatBtn"), telegramCreate: $("telegramCreateBtn"), sessionMessages: $("sessionMessages"), sessionName: $("sessionName"), sessionMeta: $("sessionMeta"),
  modal: $("createAppModal"), modalClose: $("closeCreateAppBtn"), modalCancel: $("cancelCreateAppBtn"), modalConfirm: $("confirmCreateAppBtn"),
  appName: $("appNameInput"), appDescription: $("appDescriptionInput"), appStyle: $("appStyleInput"), appExtra: $("appExtraInput")
};

const STORAGE_CONFIG = "appgpt_provider_config";
const MAX_ARTIFACTS_PER_CHAT = 20;
let currentChat = null;
let busy = false;
let activeView = "build";

const telegram = window.Telegram?.WebApp;

init();

async function init() {
  setupTelegramShell();
  fillProviders();
  await restoreConfig();
  renderProviderCards();
  bindNavigation();
  bindActions();
  updateProviderUI();
  await restoreLastSession();
  await renderChats();
  updateTelegramButtons();
}

function setupTelegramShell() {
  if (!telegram) return;
  try {
    telegram.ready();
    telegram.expand();
    telegram.enableClosingConfirmation?.();
    telegram.setHeaderColor?.("secondary_bg_color");
    telegram.setBackgroundColor?.("bg_color");
    telegram.setBottomBarColor?.("bottom_bar_bg_color");

    telegram.MainButton?.setParams?.({ text:"✦ CREATE APP", is_visible:true, is_active:true, has_shine_effect:true });
    telegram.MainButton?.onClick?.(startNativeCreateFlow);

    if (telegram.isVersionAtLeast?.("7.10") && telegram.SecondaryButton) {
      telegram.SecondaryButton.setParams({ text:"CHATS", position:"left", is_visible:true, is_active:true });
      telegram.SecondaryButton.onClick(() => switchView("chats"));
    }
    if (telegram.isVersionAtLeast?.("7.0") && telegram.SettingsButton) {
      telegram.SettingsButton.show();
      telegram.SettingsButton.onClick(() => switchView("settings"));
    }
    telegram.BackButton?.onClick?.(() => switchView("build"));
  } catch (error) {
    console.debug("Telegram UI setup skipped", error);
  }
}

function fillProviders() {
  els.providerSelect.innerHTML = Object.entries(PROVIDERS).map(([id,p]) => `<option value="${id}">${escapeHtml(p.name)}</option>`).join("");
}

async function restoreConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG) || "{}"); } catch {}
  const provider = saved.provider && PROVIDERS[saved.provider] ? saved.provider : "openrouter";
  const preset = PROVIDERS[provider];
  els.providerSelect.value = provider;
  els.modelInput.value = saved.model || preset.model;
  els.baseUrl.value = saved.baseUrl || preset.baseUrl;
  const secret = await loadApiKey();
  els.apiKey.value = secret.key || "";
  els.rememberKey.checked = secret.remembered;
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
}

function switchView(name) {
  activeView = name;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  const titles = { build:"Build a Telegram app", chats:"Your chats", settings:"Connect an AI provider", publish:"Get your HTML file" };
  els.pageTitle.textContent = titles[name] || "AppGPT";
  if (name === "chats") renderChats();
  updateTelegramButtons();
}

function updateTelegramButtons() {
  if (!telegram) return;
  try {
    if (activeView === "build") telegram.BackButton?.hide?.();
    else telegram.BackButton?.show?.();
    if (telegram.MainButton?.setParams) {
      telegram.MainButton.setParams({
        text: currentChat?.project?.html ? "✦ NEW APP" : "✦ CREATE APP",
        is_visible: activeView === "build",
        is_active: !busy,
        has_shine_effect: true
      });
    }
  } catch {}
}

function bindActions() {
  els.providerSelect.addEventListener("change", () => {
    const p = PROVIDERS[els.providerSelect.value];
    els.modelInput.value = p.model;
    els.baseUrl.value = p.baseUrl;
  });
  els.toggleKey.addEventListener("click", () => els.apiKey.type = els.apiKey.type === "password" ? "text" : "password");
  els.saveProvider.addEventListener("click", saveConfig);
  els.testProvider.addEventListener("click", testProvider);
  els.build.addEventListener("click", generateFromPrompt);
  els.editBtn.addEventListener("click", editApp);
  els.download.addEventListener("click", () => downloadArtifact(latestArtifact()));
  els.copyHtml.addEventListener("click", () => copyArtifact(latestArtifact()));
  els.publishDownload.addEventListener("click", () => downloadArtifact(latestArtifact()));
  els.publishCopy.addEventListener("click", () => copyArtifact(latestArtifact()));
  els.openPreview.addEventListener("click", () => openArtifactPreview(latestArtifact()));
  els.newChat.addEventListener("click", newChat);
  els.telegramCreate.addEventListener("click", startNativeCreateFlow);
  els.modalClose.addEventListener("click", closeCreateSheet);
  els.modalCancel.addEventListener("click", closeCreateSheet);
  els.modalConfirm.addEventListener("click", createFromSetupSheet);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeCreateSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.modal.hidden) closeCreateSheet(); });

  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    const map = {
      "Study assistant":"Build a polished study assistant with flashcards, quiz mode, streak tracking, and an optional AI tutor. Use a modern Telegram-native dark interface.",
      "AI image helper":"Build an AI image prompt helper where users choose a visual style and turn a rough idea into a detailed image prompt. Include history and copy buttons.",
      "Habit tracker":"Build a beautiful habit tracker with daily check-ins, streaks, weekly progress, and local persistence. Make it feel native inside Telegram.",
      "Game leaderboard":"Build a game leaderboard Mini App with player cards, ranks, score filters, mock friends data, haptics, and a futuristic competitive design."
    };
    els.prompt.value = map[chip.textContent.trim()] || chip.textContent.trim();
  }));
}

async function startNativeCreateFlow() {
  haptic("light");
  if (telegram?.showPopup && telegram.isVersionAtLeast?.("6.2")) {
    try {
      telegram.showPopup({
        title:"Create a Telegram Mini App",
        message:"AppGPT will generate one complete index.html and save it in a persistent chat.",
        buttons:[
          { id:"continue", type:"default", text:"Set up app" },
          { id:"cancel", type:"cancel" }
        ]
      }, (buttonId) => { if (buttonId === "continue") openCreateSheet(); });
      return;
    } catch {}
  }
  openCreateSheet();
}

function openCreateSheet() {
  if (currentChat?.project?.name && !els.appName.value) els.appName.value = currentChat.project.name;
  if (els.prompt.value.trim() && !els.appDescription.value) els.appDescription.value = els.prompt.value.trim();
  els.modal.hidden = false;
  requestAnimationFrame(() => els.appName.focus());
}

function closeCreateSheet() {
  els.modal.hidden = true;
}

async function createFromSetupSheet() {
  const name = els.appName.value.trim();
  const description = els.appDescription.value.trim();
  const style = els.appStyle.value;
  const extra = els.appExtra.value.trim();
  if (!name) return toast("Give your app a name");
  if (!description) return toast("Describe what the app should do");

  const request = [
    `App name: ${name}`,
    `Purpose and features: ${description}`,
    `Visual style: ${style}`,
    extra ? `Extra instructions: ${extra}` : "",
    "Generate this as a Telegram Mini App."
  ].filter(Boolean).join("\n");
  els.prompt.value = request;
  closeCreateSheet();
  await generateHtmlArtifact(request, { appName:name, source:"guided setup" });
}

function getConfig() {
  const provider = els.providerSelect.value;
  const preset = PROVIDERS[provider];
  return { provider, kind:preset.kind, model:els.modelInput.value.trim(), baseUrl:els.baseUrl.value.trim(), apiKey:els.apiKey.value.trim() };
}

async function saveConfig() {
  const c = getConfig();
  localStorage.setItem(STORAGE_CONFIG, JSON.stringify({ provider:c.provider, model:c.model, baseUrl:c.baseUrl }));
  await saveApiKey(c.apiKey, els.rememberKey.checked);
  updateProviderUI();
  successHaptic();
  toast("Provider settings saved");
}

function updateProviderUI() {
  const c = getConfig();
  const connected = Boolean(c.apiKey && c.model && c.baseUrl);
  els.providerBadge.textContent = connected ? `${PROVIDERS[c.provider].name} · ${c.model}` : "No provider";
  document.querySelector(".status-dot")?.classList.toggle("connected", connected);
  els.modelSummary.textContent = connected ? `${PROVIDERS[c.provider].name} · ${c.model}` : "Set a provider first";
}

async function testProvider() {
  const c = getConfig();
  setProviderStatus("Testing…", "");
  toggleBusy(els.testProvider, true, "Testing");
  try {
    const response = await callProvider(c, [
      { role:"system", content:"You are a connection test. Reply with exactly OK." },
      { role:"user", content:"Test connection." }
    ], { maxTokens:30, temperature:0 });
    setProviderStatus(`Connected — ${response.trim().slice(0,60)}`, "ok");
    await saveConfig();
  } catch (err) {
    errorHaptic();
    setProviderStatus(err.message, "error");
  } finally { toggleBusy(els.testProvider, false, "Test connection"); }
}

async function generateFromPrompt() {
  const idea = els.prompt.value.trim();
  if (!idea) return startNativeCreateFlow();
  await generateHtmlArtifact(idea, { appName:inferName(idea), source:"prompt" });
}

async function generateHtmlArtifact(request, meta = {}) {
  if (busy) return;
  const c = getConfig();
  if (!c.apiKey) { switchView("settings"); return toast("Add an API key first"); }

  busy = true;
  updateTelegramButtons();
  toggleBusy(els.build, true, "Building index.html");
  telegram?.MainButton?.showProgress?.();
  try {
    const raw = await callProvider(c, [
      { role:"system", content:TELEGRAM_APP_SYSTEM_PROMPT },
      { role:"user", content:`Build this app now.\n\n${request}` }
    ], { temperature:.35, maxTokens:12000 });
    const html = extractHtmlArtifact(raw);
    validateHtmlArtifact(html);

    const now = new Date().toISOString();
    const version = (currentChat?.artifacts?.length || 0) + 1;
    const artifact = makeArtifact(html, version, now);
    const chatId = currentChat?.id || makeId();
    const title = currentChat?.title || meta.appName || inferName(request);

    currentChat = {
      id: chatId,
      title,
      createdAt: currentChat?.createdAt || now,
      updatedAt: now,
      messages: [
        ...(currentChat?.messages || []),
        { id:makeId(), role:"user", content:request, ts:now },
        { id:makeId(), role:"assistant", content:`Created ${artifact.filename} (v${version}).`, artifactId:artifact.id, ts:now }
      ],
      artifacts: [...(currentChat?.artifacts || []), artifact].slice(-MAX_ARTIFACTS_PER_CHAT),
      project: { name:title, prompt:request, html, latestArtifactId:artifact.id }
    };

    await saveChat(currentChat);
    showCurrentChat();
    await renderChats();
    successHaptic();
    toast("index.html created and saved to chat ✦");
  } catch (err) {
    console.error(err);
    errorHaptic();
    toast(err.message || "Generation failed");
  } finally {
    busy = false;
    telegram?.MainButton?.hideProgress?.();
    toggleBusy(els.build, false, "✦ Generate index.html");
    updateTelegramButtons();
  }
}

async function editApp() {
  const current = latestArtifact();
  if (!current) return toast("Generate or open a chat first");
  const request = els.editInput.value.trim();
  if (!request) return toast("Describe the change first");
  const c = getConfig();
  if (!c.apiKey) { switchView("settings"); return toast("Add an API key first"); }

  busy = true;
  updateTelegramButtons();
  toggleBusy(els.editBtn, true, "Editing HTML");
  telegram?.MainButton?.showProgress?.();
  try {
    const history = (currentChat.messages || []).filter(m => m.role === "user").slice(-8).map(m => `- ${m.content}`).join("\n");
    const raw = await callProvider(c, [
      { role:"system", content:TELEGRAM_APP_SYSTEM_PROMPT + EDIT_SYSTEM_SUFFIX },
      { role:"user", content:`Recent requests:\n${history}\n\nCURRENT index.html:\n\n${current.content}\n\nCHANGE REQUEST:\n${request}` }
    ], { temperature:.25, maxTokens:14000 });
    const html = extractHtmlArtifact(raw);
    validateHtmlArtifact(html);

    const now = new Date().toISOString();
    const version = (currentChat.artifacts?.length || 0) + 1;
    const artifact = makeArtifact(html, version, now);
    currentChat.updatedAt = now;
    currentChat.messages.push({ id:makeId(), role:"user", content:request, ts:now });
    currentChat.messages.push({ id:makeId(), role:"assistant", content:`Updated ${artifact.filename} to v${version}.`, artifactId:artifact.id, ts:now });
    currentChat.artifacts = [...(currentChat.artifacts || []), artifact].slice(-MAX_ARTIFACTS_PER_CHAT);
    currentChat.project = { ...(currentChat.project || {}), html, latestArtifactId:artifact.id };
    await saveChat(currentChat);
    showCurrentChat();
    els.editInput.value = "";
    await renderChats();
    successHaptic();
    toast(`Saved index.html v${version}`);
  } catch (err) {
    errorHaptic();
    toast(err.message || "Edit failed");
  } finally {
    busy = false;
    telegram?.MainButton?.hideProgress?.();
    toggleBusy(els.editBtn, false, "Apply edit");
    updateTelegramButtons();
  }
}

function makeArtifact(content, version, ts) {
  return {
    id: makeId(),
    filename: "index.html",
    mime: "text/html",
    content,
    version,
    bytes: new Blob([content]).size,
    createdAt: ts
  };
}

function latestArtifact() {
  if (!currentChat) return null;
  const artifacts = currentChat.artifacts || [];
  const id = currentChat.project?.latestArtifactId;
  return artifacts.find(a => a.id === id) || artifacts.at(-1) || (currentChat.project?.html ? makeArtifact(currentChat.project.html, 1, currentChat.updatedAt) : null);
}

async function restoreLastSession() {
  const id = await getLastChatId();
  if (!id) return;
  const chat = await getChat(id);
  if (!chat) return;
  currentChat = migrateChat(chat);
  showCurrentChat();
}

function migrateChat(chat) {
  if (chat.artifacts?.length) return chat;
  if (!chat.project?.html) return { ...chat, artifacts:[] };
  const artifact = makeArtifact(chat.project.html, 1, chat.updatedAt || new Date().toISOString());
  const messages = (chat.messages || []).map((m, i, arr) => {
    if (m.role === "assistant" && i === arr.length - 1) return { ...m, artifactId:artifact.id };
    return m;
  });
  return { ...chat, messages, artifacts:[artifact], project:{...chat.project, latestArtifactId:artifact.id} };
}

function showCurrentChat() {
  if (!currentChat) return;
  currentChat = migrateChat(currentChat);
  const artifact = latestArtifact();
  const project = currentChat.project;
  if (project) els.prompt.value = project.prompt || currentChat.messages?.find(m => m.role === "user")?.content || "";
  if (artifact) {
    els.previewFrame.srcdoc = artifact.content;
    document.querySelector(".phone")?.classList.add("active");
    els.previewEmpty.style.display = "none";
    els.previewTitle.textContent = project?.name || currentChat.title;
    els.publishProjectName.textContent = `${project?.name || currentChat.title} · v${artifact.version}`;
  }
  els.sessionName.textContent = currentChat.title || "Current session";
  els.sessionMeta.textContent = `${currentChat.messages?.length || 0} messages · ${(currentChat.artifacts || []).length} HTML versions · saved ${formatDate(currentChat.updatedAt)}`;
  renderSessionMessages();
  updateTelegramButtons();
}

function renderSessionMessages() {
  const messages = currentChat?.messages || [];
  if (!messages.length) {
    els.sessionMessages.innerHTML = `<div class="session-empty">Your prompts and generated HTML files will appear here automatically.</div>`;
    return;
  }
  els.sessionMessages.innerHTML = messages.slice(-20).map(m => {
    const artifact = m.artifactId ? (currentChat.artifacts || []).find(a => a.id === m.artifactId) : null;
    return `<div class="session-message ${m.role}">
      <span>${m.role === "user" ? "You" : "AppGPT"}</span>
      <p>${escapeHtml(m.content)}</p>
      ${artifact ? renderArtifactCard(artifact) : ""}
    </div>`;
  }).join("");

  els.sessionMessages.querySelectorAll("[data-artifact-action]").forEach(button => button.addEventListener("click", async () => {
    const artifact = (currentChat.artifacts || []).find(a => a.id === button.dataset.artifactId);
    if (!artifact) return toast("That file version is unavailable");
    const action = button.dataset.artifactAction;
    if (action === "preview") previewArtifact(artifact);
    if (action === "download") downloadArtifact(artifact);
    if (action === "copy") await copyArtifact(artifact);
  }));
  els.sessionMessages.scrollTop = els.sessionMessages.scrollHeight;
}

function renderArtifactCard(artifact) {
  return `<div class="artifact-card">
    <div class="artifact-row">
      <div class="artifact-icon">&lt;/&gt;</div>
      <div class="artifact-info"><strong>${escapeHtml(artifact.filename)} <span class="file-version">v${artifact.version}</span></strong><span>HTML · ${formatBytes(artifact.bytes || new Blob([artifact.content]).size)}</span></div>
    </div>
    <div class="artifact-actions">
      <button class="ghost-btn" data-artifact-action="preview" data-artifact-id="${artifact.id}">Preview</button>
      <button class="ghost-btn" data-artifact-action="copy" data-artifact-id="${artifact.id}">Copy HTML</button>
      <button class="secondary-btn" data-artifact-action="download" data-artifact-id="${artifact.id}">Download</button>
    </div>
  </div>`;
}

function previewArtifact(artifact) {
  if (!artifact) return;
  els.previewFrame.srcdoc = artifact.content;
  els.previewTitle.textContent = `${currentChat?.project?.name || currentChat?.title || "App"} · v${artifact.version}`;
  document.querySelector(".phone")?.classList.add("active");
  els.previewEmpty.style.display = "none";
  switchView("build");
  haptic("light");
}

async function newChat() {
  currentChat = null;
  await setLastChatId("");
  els.prompt.value = "";
  els.editInput.value = "";
  els.previewFrame.srcdoc = "";
  document.querySelector(".phone")?.classList.remove("active");
  els.previewEmpty.style.display = "block";
  els.previewTitle.textContent = "Untitled app";
  els.publishProjectName.textContent = "Nothing generated yet";
  els.sessionName.textContent = "New session";
  els.sessionMeta.textContent = "Not saved yet";
  els.appName.value = "";
  els.appDescription.value = "";
  els.appExtra.value = "";
  renderSessionMessages();
  switchView("build");
}

async function renderChats() {
  const chats = (await listChats()).map(migrateChat);
  els.chatsEmpty.style.display = chats.length ? "none" : "block";
  els.chatGrid.innerHTML = chats.map(chat => {
    const latest = chat.artifacts?.at(-1);
    return `<article class="project-card chat-card ${chat.id === currentChat?.id ? "active-chat" : ""}">
      <div class="project-card-top"><strong>${escapeHtml(chat.title || "Untitled chat")}</strong><span class="pill">${chat.messages?.length || 0} msgs</span></div>
      <p>${escapeHtml(chat.messages?.filter(m => m.role === "user").at(-1)?.content || chat.project?.prompt || "No prompt")}</p>
      <div class="file-meta"><span>${chat.artifacts?.length || 0} HTML versions</span>${latest ? `<span>latest v${latest.version} · ${formatBytes(latest.bytes || 0)}</span>` : ""}</div>
      <span class="tiny">Updated ${formatDate(chat.updatedAt)}</span>
      <div class="project-card-actions">
        <button class="secondary-btn chat-open" data-id="${chat.id}">Continue</button>
        ${latest ? `<button class="ghost-btn chat-download" data-id="${chat.id}">Download HTML</button>` : ""}
        <button class="ghost-btn chat-delete" data-id="${chat.id}">Delete</button>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll(".chat-open").forEach(b => b.addEventListener("click", async () => {
    const chat = await getChat(b.dataset.id);
    if (chat) { currentChat = migrateChat(chat); await setLastChatId(chat.id); showCurrentChat(); switchView("build"); }
  }));
  document.querySelectorAll(".chat-download").forEach(b => b.addEventListener("click", async () => {
    const chat = migrateChat(await getChat(b.dataset.id));
    const artifact = chat?.artifacts?.at(-1);
    if (artifact) downloadArtifact(artifact);
  }));
  document.querySelectorAll(".chat-delete").forEach(b => b.addEventListener("click", async () => {
    await deleteChat(b.dataset.id);
    if (currentChat?.id === b.dataset.id) await newChat();
    await renderChats();
    toast("Chat deleted");
  }));
}

function renderProviderCards() {
  els.providerCards.innerHTML = Object.values(PROVIDERS).map(p => `<div class="provider-card"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.hint)}</span></div>`).join("");
}

function downloadArtifact(artifact) {
  if (!artifact?.content) return toast("No HTML file yet");
  const blob = new Blob([artifact.content], { type:"text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "index.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1200);
  successHaptic();
}

async function copyArtifact(artifact) {
  if (!artifact?.content) return toast("No HTML file yet");
  try {
    await navigator.clipboard.writeText(artifact.content);
    successHaptic();
    toast("HTML copied");
  } catch { toast("Could not copy HTML in this browser"); }
}

function openArtifactPreview(artifact) {
  if (!artifact?.content) return toast("No HTML file yet");
  const blob = new Blob([artifact.content], { type:"text/html" });
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
}

function setProviderStatus(text, kind) { els.providerStatus.textContent = text; els.providerStatus.className = `inline-status ${kind || ""}`; }
function toggleBusy(button, on, label) { button.disabled = on; button.textContent = label; button.classList.toggle("loading", on); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove("show"), 2600); }
function inferName(prompt) { const clean = prompt.replace(/^(build|make|create)\s+(me\s+)?(a|an)?\s*/i, "").trim(); return clean.split(/[.!?\n]/)[0].split(/\s+/).slice(0,5).join(" ") || "New Mini App"; }
function formatDate(s) { try { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(s)); } catch { return "recently"; } }
function formatBytes(n) { if (!n) return "0 B"; if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(1)} MB`; }
function escapeHtml(s="") { return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function haptic(style="light") { try { telegram?.HapticFeedback?.impactOccurred?.(style); } catch {} }
function successHaptic() { try { telegram?.HapticFeedback?.notificationOccurred?.("success"); } catch {} }
function errorHaptic() { try { telegram?.HapticFeedback?.notificationOccurred?.("error"); } catch {} }

function extractHtmlArtifact(raw) {
  let text = String(raw || "").trim();
  const fenced = [...text.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)];
  if (fenced.length) {
    const candidates = fenced.map(x => x[1].trim()).filter(x => /<html[\s>]|<!doctype html>/i.test(x));
    if (candidates.length) text = candidates.sort((a,b) => b.length - a.length)[0];
  }
  const start = text.search(/<!doctype html>|<html[\s>]/i);
  if (start >= 0) text = text.slice(start);
  const endMatch = [...text.matchAll(/<\/html\s*>/gi)].at(-1);
  if (endMatch) text = text.slice(0, endMatch.index + endMatch[0].length);
  return text.trim();
}

function validateHtmlArtifact(html) {
  if (!html) throw new Error("The model returned no HTML.");
  if (!(/<!doctype html>/i.test(html) || /<html[\s>]/i.test(html))) throw new Error("The model did not return a full HTML document.");
  if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html) || !/<\/html>/i.test(html)) throw new Error("The HTML looks incomplete. Try again with a stronger coding model.");
  if (html.length < 350) throw new Error("The generated HTML is unexpectedly short.");
}

const TELEGRAM_APP_SYSTEM_PROMPT = `You are AppGPT's dedicated Telegram Mini App generator.
Your only job is to build a REAL Telegram Mini App as ONE complete HTML file.

OUTPUT CONTRACT — MUST FOLLOW:
1. Return exactly ONE complete index.html document.
2. Return raw HTML only. No markdown fences. No explanation before or after it.
3. Put ALL CSS in <style> tags inside the HTML.
4. Put ALL JavaScript in <script> tags inside the HTML.
5. Do not create or reference local CSS, JS, JSON, image, component, package, or source files.
6. The result must run by opening index.html directly from an HTTPS static host such as GitHub Pages.
7. Include <script src="https://telegram.org/js/telegram-web-app.js"></script> in <head> before your own app code.

TELEGRAM MINI APP REQUIREMENTS:
- Treat this as a Telegram Mini App, not a generic website.
- Safely initialize window.Telegram?.WebApp, call ready() and expand() when available.
- Use Telegram theme variables with attractive fallbacks.
- Respect safe-area/content-safe-area insets and mobile viewport behavior.
- Use Telegram WebApp APIs when they improve UX: MainButton/SecondaryButton, BackButton, SettingsButton, HapticFeedback, showPopup/showConfirm, DeviceStorage/CloudStorage, etc. Feature-detect every optional API and provide normal-browser fallbacks.
- Never assume the app is running inside Telegram; it must still preview in a normal browser.
- Do not expose bot tokens or secret credentials.
- Never pretend the Mini App can create a Telegram bot or register itself with BotFather from frontend JavaScript.

PRODUCT QUALITY:
- Implement the requested features, not a static mockup.
- Make controls interactive and functional.
- Mobile-first, polished, responsive, accessible, and visually coherent.
- Prefer vanilla JavaScript and no dependencies. External CDNs are allowed only when truly useful.
- Use localStorage or Telegram storage for non-sensitive user data when persistence is requested.
- Escape or safely render user-entered content. Avoid eval and new Function.
- If a feature requires a backend or secret, build the frontend flow honestly and clearly mark the backend boundary rather than hardcoding secrets.

Before outputting, silently verify that the document has <!doctype html>, <html>, <head>, <body>, and closing </html>. Then output the complete HTML and nothing else.`;

const EDIT_SYSTEM_SUFFIX = `
You are editing an EXISTING index.html. Preserve all working features unless the change request conflicts with them. Return the COMPLETE replacement index.html, not a patch or snippet. Keep it single-file and obey the full output contract.`;
