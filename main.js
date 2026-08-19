import { PROVIDERS, callProvider } from "./providers.js";
import { DONATION_CONFIG } from "./config.js";
import { saveChat, getChat, listChats, deleteChat, getLastChatId, setLastChatId, saveApiKey, loadApiKey } from "./storage.js";

const $ = (id) => document.getElementById(id);
const els = {
  pageTitle: $("pageTitle"), providerBadge: $("providerBadge"), prompt: $("promptInput"), build: $("buildBtn"),
  modelSummary: $("modelSummary"), previewFrame: $("previewFrame"), previewEmpty: $("previewEmpty"), previewTitle: $("previewTitle"),
  openPreview: $("openPreviewBtn"), download: $("downloadBtn"), editInput: $("editInput"), editBtn: $("editBtn"),
  providerSelect: $("providerSelect"), modelInput: $("modelInput"), apiKey: $("apiKeyInput"), baseUrl: $("baseUrlInput"),
  rememberKey: $("rememberKey"), toggleKey: $("toggleKeyBtn"), testProvider: $("testProviderBtn"), saveProvider: $("saveProviderBtn"),
  providerStatus: $("providerStatus"), providerCards: $("providerCards"), chatGrid: $("chatGrid"), chatsEmpty: $("chatsEmpty"),
  publishProjectName: $("publishProjectName"), publishDownload: $("publishDownloadBtn"), toast: $("toast"), newChat: $("newChatBtn"),
  sessionMessages: $("sessionMessages"), sessionName: $("sessionName"), sessionMeta: $("sessionMeta"),
  starAmounts: $("starAmounts"), tonAmounts: $("tonAmounts"), cardDonate: $("cardDonateBtn"), donationStatus: $("donationStatus")
};

const STORAGE_CONFIG = "appgpt_provider_config";
let currentChat = null;
let busy = false;

const telegram = window.Telegram?.WebApp;
if (telegram) {
  try { telegram.ready(); telegram.expand(); } catch {}
}

init();

async function init() {
  fillProviders();
  await restoreConfig();
  renderProviderCards();
  bindNavigation();
  bindActions();
  renderDonationOptions();
  updateProviderUI();
  await restoreLastSession();
  await renderChats();
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
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  const titles = { build:"Build a Telegram app", chats:"Your chats", settings:"Connect an AI provider", donate:"Support AppGPT", publish:"Publish your app" };
  els.pageTitle.textContent = titles[name] || "AppGPT";
  if (name === "chats") renderChats();
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
  els.build.addEventListener("click", generateApp);
  els.editBtn.addEventListener("click", editApp);
  els.download.addEventListener("click", downloadCurrent);
  els.publishDownload.addEventListener("click", downloadCurrent);
  els.openPreview.addEventListener("click", openPreviewWindow);
  els.newChat.addEventListener("click", newChat);
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    const map = {
      "Study assistant":"Build a polished study assistant with flashcards, quiz mode, streak tracking, and an optional AI tutor. Use a modern dark glass interface.",
      "AI image helper":"Build an AI image prompt helper where users choose a visual style and turn a rough idea into a detailed image prompt. Include history and copy buttons.",
      "Habit tracker":"Build a beautiful habit tracker with daily check-ins, streaks, weekly progress, and local persistence. Make it feel native inside Telegram.",
      "Game leaderboard":"Build a game leaderboard Mini App with player cards, ranks, score filters, mock friends data, and a futuristic competitive design."
    };
    els.prompt.value = map[chip.textContent.trim()] || chip.textContent.trim();
  }));
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
  toast(els.rememberKey.checked && telegram?.isVersionAtLeast?.("9.0") ? "Provider saved with Telegram secure storage" : "Provider settings saved");
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
    setProviderStatus(`Connected successfully — ${response.trim().slice(0,60)}`, "ok");
    await saveConfig();
  } catch (err) { setProviderStatus(err.message, "error"); }
  finally { toggleBusy(els.testProvider, false, "Test connection"); }
}

async function generateApp() {
  if (busy) return;
  const idea = els.prompt.value.trim();
  if (!idea) return toast("Describe the app you want first");
  const c = getConfig();
  if (!c.apiKey) { switchView("settings"); return toast("Add an API key first"); }

  busy = true;
  toggleBusy(els.build, true, "Building");
  try {
    const html = cleanGeneratedHtml(await callProvider(c, [
      { role:"system", content:BUILDER_SYSTEM_PROMPT },
      { role:"user", content:`Create this Telegram Mini App:\n\n${idea}` }
    ], { temperature:.45, maxTokens:8000 }));
    if (!looksLikeHtml(html)) throw new Error("The model did not return a complete HTML app. Try again or use a stronger coding model.");

    const now = new Date().toISOString();
    currentChat = {
      id: currentChat?.id || makeId(),
      title: currentChat?.title || inferName(idea),
      createdAt: currentChat?.createdAt || now,
      updatedAt: now,
      messages: [
        ...(currentChat?.messages || []),
        { role:"user", content:idea, ts:now },
        { role:"assistant", content:"Built the first working version of your Telegram Mini App.", ts:now }
      ],
      project: { name:inferName(idea), prompt:idea, html }
    };
    await saveChat(currentChat);
    showCurrentChat();
    await renderChats();
    toast("Mini App generated ✦");
  } catch (err) { console.error(err); toast(err.message || "Generation failed"); }
  finally { busy = false; toggleBusy(els.build, false, "✦ Generate app"); }
}

async function editApp() {
  if (!currentChat?.project?.html) return toast("Generate or open a chat first");
  const request = els.editInput.value.trim();
  if (!request) return toast("Describe the change first");
  const c = getConfig();
  if (!c.apiKey) { switchView("settings"); return toast("Add an API key first"); }
  toggleBusy(els.editBtn, true, "Editing");
  try {
    const priorRequests = (currentChat.messages || []).filter(m => m.role === "user").slice(-8).map(m => `- ${m.content}`).join("\n");
    const html = cleanGeneratedHtml(await callProvider(c, [
      { role:"system", content:BUILDER_SYSTEM_PROMPT + "\nYou are editing an existing app. Preserve working features unless the user requests otherwise. Return the COMPLETE replacement HTML file only." },
      { role:"user", content:`Previous requests in this session:\n${priorRequests}\n\nExisting app:\n\n${currentChat.project.html}\n\nRequested change:\n${request}` }
    ], { temperature:.35, maxTokens:9000 }));
    if (!looksLikeHtml(html)) throw new Error("The model did not return complete HTML.");
    const now = new Date().toISOString();
    currentChat.project.html = html;
    currentChat.updatedAt = now;
    currentChat.messages.push({ role:"user", content:request, ts:now });
    currentChat.messages.push({ role:"assistant", content:`Applied: ${request}`, ts:now });
    await saveChat(currentChat);
    showCurrentChat();
    els.editInput.value = "";
    await renderChats();
    toast("Edit applied and session saved");
  } catch (err) { toast(err.message || "Edit failed"); }
  finally { toggleBusy(els.editBtn, false, "Apply edit"); }
}

async function restoreLastSession() {
  const id = await getLastChatId();
  if (!id) return;
  const chat = await getChat(id);
  if (!chat) return;
  currentChat = chat;
  showCurrentChat();
}

function showCurrentChat() {
  const project = currentChat?.project;
  if (!project) return;
  els.prompt.value = project.prompt || currentChat.messages?.find(m => m.role === "user")?.content || "";
  els.previewFrame.srcdoc = project.html;
  document.querySelector(".phone")?.classList.add("active");
  els.previewEmpty.style.display = "none";
  els.previewTitle.textContent = project.name || currentChat.title;
  els.publishProjectName.textContent = project.name || currentChat.title;
  els.sessionName.textContent = currentChat.title || "Current session";
  els.sessionMeta.textContent = `${currentChat.messages?.length || 0} messages · saved ${formatDate(currentChat.updatedAt)}`;
  renderSessionMessages();
}

function renderSessionMessages() {
  const messages = currentChat?.messages || [];
  if (!messages.length) {
    els.sessionMessages.innerHTML = `<div class="session-empty">Your build conversation will be saved here automatically.</div>`;
    return;
  }
  els.sessionMessages.innerHTML = messages.slice(-12).map(m => `
    <div class="session-message ${m.role}">
      <span>${m.role === "user" ? "You" : "AppGPT"}</span>
      <p>${escapeHtml(m.content)}</p>
    </div>`).join("");
  els.sessionMessages.scrollTop = els.sessionMessages.scrollHeight;
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
  renderSessionMessages();
  switchView("build");
}

async function renderChats() {
  const chats = await listChats();
  els.chatsEmpty.style.display = chats.length ? "none" : "block";
  els.chatGrid.innerHTML = chats.map(chat => `
    <article class="project-card chat-card ${chat.id === currentChat?.id ? "active-chat" : ""}">
      <div class="project-card-top"><strong>${escapeHtml(chat.title || "Untitled chat")}</strong><span class="pill">${chat.messages?.length || 0} msgs</span></div>
      <p>${escapeHtml(chat.messages?.filter(m => m.role === "user").at(-1)?.content || chat.project?.prompt || "No prompt")}</p>
      <span class="tiny">Updated ${formatDate(chat.updatedAt)}</span>
      <div class="project-card-actions">
        <button class="secondary-btn chat-open" data-id="${chat.id}">Continue</button>
        <button class="ghost-btn chat-delete" data-id="${chat.id}">Delete</button>
      </div>
    </article>`).join("");
  document.querySelectorAll(".chat-open").forEach(b => b.addEventListener("click", async () => {
    const chat = await getChat(b.dataset.id);
    if (chat) { currentChat = chat; await setLastChatId(chat.id); showCurrentChat(); switchView("build"); }
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

function renderDonationOptions() {
  els.starAmounts.innerHTML = DONATION_CONFIG.starAmounts.map(n => `<button class="donate-amount" data-stars="${n}">⭐ ${n}</button>`).join("");
  els.tonAmounts.innerHTML = DONATION_CONFIG.tonAmounts.map(n => `<button class="donate-amount" data-ton="${n}">${n} TON</button>`).join("");
  document.querySelectorAll("[data-stars]").forEach(b => b.addEventListener("click", () => donateStars(Number(b.dataset.stars))));
  document.querySelectorAll("[data-ton]").forEach(b => b.addEventListener("click", () => donateTon(Number(b.dataset.ton))));
  els.cardDonate.addEventListener("click", donateCard);
}

async function donateStars(amount) {
  setDonationStatus(`Preparing ${amount} Stars…`, "");
  try {
    if (DONATION_CONFIG.starsEndpoint) {
      const res = await fetch(DONATION_CONFIG.starsEndpoint, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ amount, initData:telegram?.initData || "" })
      });
      const data = await res.json();
      if (!res.ok || !data.invoiceUrl) throw new Error(data?.error || "Could not create Stars invoice");
      if (telegram?.openInvoice) {
        telegram.openInvoice(data.invoiceUrl, status => setDonationStatus(status === "paid" ? `Thank you for the ${amount} Stars! ⭐` : `Invoice ${status}.`, status === "paid" ? "ok" : ""));
      } else window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (DONATION_CONFIG.botUsername) {
      openTelegramLink(`https://t.me/${DONATION_CONFIG.botUsername}?start=donate_${amount}`);
      setDonationStatus("Opened the bot to complete the Stars donation.", "ok");
      return;
    }
    throw new Error("Stars donations need a bot invoice endpoint or bot username in config.js.");
  } catch (e) { setDonationStatus(e.message, "error"); }
}

function donateTon(amount) {
  if (!DONATION_CONFIG.tonAddress) return setDonationStatus("Add your public TON receiving address in config.js to enable TON donations.", "error");
  const nano = Math.round(amount * 1e9);
  const url = `ton://transfer/${encodeURIComponent(DONATION_CONFIG.tonAddress)}?amount=${nano}&text=${encodeURIComponent("Support AppGPT")}`;
  try { window.location.href = url; setDonationStatus(`Opening wallet for ${amount} TON…`, "ok"); }
  catch { setDonationStatus("Could not open a TON wallet on this device.", "error"); }
}

function donateCard() {
  if (!DONATION_CONFIG.cardDonationUrl) return setDonationStatus("Add a public card/support URL in config.js to enable card donations.", "error");
  if (telegram?.openLink) telegram.openLink(DONATION_CONFIG.cardDonationUrl); else window.open(DONATION_CONFIG.cardDonationUrl, "_blank", "noopener,noreferrer");
  setDonationStatus("Opened the external donation page.", "ok");
}

function openTelegramLink(url) {
  if (telegram?.openTelegramLink) telegram.openTelegramLink(url); else window.open(url, "_blank", "noopener,noreferrer");
}
function setDonationStatus(text, kind) { els.donationStatus.textContent = text; els.donationStatus.className = `inline-status ${kind || ""}`; }

function downloadCurrent() {
  if (!currentChat?.project?.html) return toast("Generate or open a chat first");
  const blob = new Blob([currentChat.project.html], { type:"text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "index.html"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function openPreviewWindow() {
  if (!currentChat?.project?.html) return toast("Generate or open a chat first");
  const blob = new Blob([currentChat.project.html], { type:"text/html" });
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
}

function setProviderStatus(text, kind) { els.providerStatus.textContent = text; els.providerStatus.className = `inline-status ${kind || ""}`; }
function toggleBusy(button, on, label) { button.disabled = on; button.textContent = label; button.classList.toggle("loading", on); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove("show"), 2800); }
function inferName(prompt) { const clean = prompt.replace(/^(build|make|create)\s+(me\s+)?(a|an)?\s*/i, "").trim(); return clean.split(/[.!?\n]/)[0].split(/\s+/).slice(0,6).join(" ") || "New Mini App"; }
function formatDate(s) { try { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(s)); } catch { return "recently"; } }
function escapeHtml(s="") { return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function looksLikeHtml(s) { return /<!doctype html>|<html[\s>]/i.test(s) && /<\/html>/i.test(s); }
function cleanGeneratedHtml(raw) { let s=String(raw||"").trim(); const fenced=s.match(/```(?:html)?\s*([\s\S]*?)```/i); if(fenced)s=fenced[1].trim(); const start=s.search(/<!doctype html>|<html[\s>]/i); if(start>0)s=s.slice(start); return s.trim(); }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const BUILDER_SYSTEM_PROMPT = `You are AppGPT, an expert Telegram Mini App engineer and product designer.
Generate ONE complete, production-quality index.html file. Return raw HTML only — no markdown fences, no explanation.

Requirements:
- Everything must be contained in one HTML file: HTML, CSS, and JavaScript.
- Use modern responsive design that looks excellent on a phone inside Telegram.
- Include <script src="https://telegram.org/js/telegram-web-app.js"></script> and safely integrate Telegram.WebApp when available.
- Call Telegram.WebApp.ready() and expand() safely.
- Adapt to Telegram theme variables where practical, but include polished fallbacks so normal-browser preview looks great.
- Use localStorage for local persistence when useful.
- No build tools, npm packages, or server are required.
- External CDN libraries are allowed only if truly necessary; prefer vanilla JS.
- Implement the requested features, not just a mockup. Buttons and interactions should work.
- Do not include secrets, private API keys, bot tokens, or fake credentials.
- If the requested app needs AI, create a BYOK settings flow or a clearly configurable API endpoint. Never hardcode an API key. Explain inside the app UI that browser-side keys are visible to that user and a backend proxy is recommended for public/shared apps.
- Escape unsafe user-generated content and avoid eval/new Function.
- Make the app feel intentionally designed, not like a generic template.
- Return only the final HTML document.`;
