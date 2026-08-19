import { PROVIDERS, callProvider } from "./providers.js";

const $ = (id) => document.getElementById(id);
const els = {
  pageTitle: $("pageTitle"), providerBadge: $("providerBadge"), prompt: $("promptInput"), build: $("buildBtn"),
  modelSummary: $("modelSummary"), previewFrame: $("previewFrame"), previewEmpty: $("previewEmpty"), previewTitle: $("previewTitle"),
  openPreview: $("openPreviewBtn"), download: $("downloadBtn"), editInput: $("editInput"), editBtn: $("editBtn"),
  providerSelect: $("providerSelect"), modelInput: $("modelInput"), apiKey: $("apiKeyInput"), baseUrl: $("baseUrlInput"),
  rememberKey: $("rememberKey"), toggleKey: $("toggleKeyBtn"), testProvider: $("testProviderBtn"), saveProvider: $("saveProviderBtn"),
  providerStatus: $("providerStatus"), providerCards: $("providerCards"), projectGrid: $("projectGrid"), projectsEmpty: $("projectsEmpty"),
  publishProjectName: $("publishProjectName"), publishDownload: $("publishDownloadBtn"), toast: $("toast"), newProject: $("newProjectBtn")
};

const STORAGE_CONFIG = "appgpt_provider_config";
const STORAGE_KEY = "appgpt_provider_key";
const STORAGE_PROJECTS = "appgpt_projects";
let currentProject = null;
let busy = false;

const telegram = window.Telegram?.WebApp;
if (telegram) {
  try { telegram.ready(); telegram.expand(); } catch {}
}

init();

function init() {
  fillProviders();
  restoreConfig();
  renderProviderCards();
  renderProjects();
  bindNavigation();
  bindActions();
  updateProviderUI();
}

function fillProviders() {
  els.providerSelect.innerHTML = Object.entries(PROVIDERS).map(([id,p]) => `<option value="${id}">${escapeHtml(p.name)}</option>`).join("");
}

function restoreConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG) || "{}"); } catch {}
  const provider = saved.provider && PROVIDERS[saved.provider] ? saved.provider : "openrouter";
  const preset = PROVIDERS[provider];
  els.providerSelect.value = provider;
  els.modelInput.value = saved.model || preset.model;
  els.baseUrl.value = saved.baseUrl || preset.baseUrl;
  const persistentKey = localStorage.getItem(STORAGE_KEY) || "";
  const sessionKey = sessionStorage.getItem(STORAGE_KEY) || "";
  els.apiKey.value = sessionKey || persistentKey;
  els.rememberKey.checked = Boolean(persistentKey);
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
}

function switchView(name) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  const titles = { build:"Build a Telegram app", projects:"Your projects", settings:"Connect an AI provider", publish:"Publish your app" };
  els.pageTitle.textContent = titles[name] || "AppGPT";
  if (name === "projects") renderProjects();
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
  els.newProject.addEventListener("click", newProject);
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
  return {
    provider,
    kind: preset.kind,
    model: els.modelInput.value.trim(),
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim()
  };
}

function saveConfig() {
  const c = getConfig();
  localStorage.setItem(STORAGE_CONFIG, JSON.stringify({ provider:c.provider, model:c.model, baseUrl:c.baseUrl }));
  sessionStorage.setItem(STORAGE_KEY, c.apiKey);
  if (els.rememberKey.checked && c.apiKey) localStorage.setItem(STORAGE_KEY, c.apiKey);
  else localStorage.removeItem(STORAGE_KEY);
  updateProviderUI();
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
    setProviderStatus(`Connected successfully — ${response.trim().slice(0,60)}`, "ok");
    saveConfig();
  } catch (err) {
    setProviderStatus(err.message, "error");
  } finally { toggleBusy(els.testProvider, false, "Test connection"); }
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
    currentProject = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: inferName(idea),
      prompt: idea,
      html,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveProject(currentProject);
    showPreview(currentProject);
    toast("Mini App generated ✦");
  } catch (err) {
    console.error(err);
    toast(err.message || "Generation failed");
  } finally {
    busy = false;
    toggleBusy(els.build, false, "✦ Generate app");
  }
}

async function editApp() {
  if (!currentProject?.html) return toast("Generate or open a project first");
  const request = els.editInput.value.trim();
  if (!request) return toast("Describe the change first");
  const c = getConfig();
  if (!c.apiKey) { switchView("settings"); return toast("Add an API key first"); }
  toggleBusy(els.editBtn, true, "Editing");
  try {
    const html = cleanGeneratedHtml(await callProvider(c, [
      { role:"system", content:BUILDER_SYSTEM_PROMPT + "\nYou are editing an existing app. Preserve working features unless the user requests otherwise. Return the COMPLETE replacement HTML file only." },
      { role:"user", content:`Existing app:\n\n${currentProject.html}\n\nRequested change:\n${request}` }
    ], { temperature:.35, maxTokens:9000 }));
    if (!looksLikeHtml(html)) throw new Error("The model did not return complete HTML.");
    currentProject.html = html;
    currentProject.updatedAt = new Date().toISOString();
    saveProject(currentProject);
    showPreview(currentProject);
    els.editInput.value = "";
    toast("Edit applied");
  } catch (err) { toast(err.message || "Edit failed"); }
  finally { toggleBusy(els.editBtn, false, "Apply edit"); }
}

function showPreview(project) {
  currentProject = project;
  els.previewFrame.srcdoc = project.html;
  document.querySelector(".phone")?.classList.add("active");
  els.previewEmpty.style.display = "none";
  els.previewTitle.textContent = project.name;
  els.publishProjectName.textContent = project.name;
}

function newProject() {
  currentProject = null;
  els.prompt.value = "";
  els.editInput.value = "";
  els.previewFrame.srcdoc = "";
  document.querySelector(".phone")?.classList.remove("active");
  els.previewEmpty.style.display = "block";
  els.previewTitle.textContent = "Untitled app";
  els.publishProjectName.textContent = "Nothing generated yet";
  switchView("build");
}

function saveProject(project) {
  const projects = getProjects();
  const i = projects.findIndex(p => p.id === project.id);
  if (i >= 0) projects[i] = project; else projects.unshift(project);
  localStorage.setItem(STORAGE_PROJECTS, JSON.stringify(projects.slice(0,30)));
}
function getProjects() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PROJECTS) || "[]"); } catch { return []; }
}
function renderProjects() {
  const projects = getProjects();
  els.projectsEmpty.style.display = projects.length ? "none" : "block";
  els.projectGrid.innerHTML = projects.map(p => `
    <article class="project-card">
      <div class="project-card-top"><strong>${escapeHtml(p.name)}</strong><span class="pill">HTML</span></div>
      <p>${escapeHtml(p.prompt)}</p>
      <span class="tiny">Updated ${formatDate(p.updatedAt)}</span>
      <div class="project-card-actions">
        <button class="secondary-btn project-open" data-id="${p.id}">Open</button>
        <button class="ghost-btn project-delete" data-id="${p.id}">Delete</button>
      </div>
    </article>`).join("");
  document.querySelectorAll(".project-open").forEach(b => b.addEventListener("click", () => {
    const p = getProjects().find(x => x.id === b.dataset.id);
    if (p) { els.prompt.value = p.prompt; showPreview(p); switchView("build"); }
  }));
  document.querySelectorAll(".project-delete").forEach(b => b.addEventListener("click", () => {
    const next = getProjects().filter(x => x.id !== b.dataset.id);
    localStorage.setItem(STORAGE_PROJECTS, JSON.stringify(next));
    if (currentProject?.id === b.dataset.id) currentProject = null;
    renderProjects();
    toast("Project deleted");
  }));
}

function renderProviderCards() {
  els.providerCards.innerHTML = Object.values(PROVIDERS).map(p => `<div class="provider-card"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.hint)}</span></div>`).join("");
}

function downloadCurrent() {
  if (!currentProject?.html) return toast("Generate or open a project first");
  const blob = new Blob([currentProject.html], { type:"text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "index.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function openPreviewWindow() {
  if (!currentProject?.html) return toast("Generate or open a project first");
  const blob = new Blob([currentProject.html], { type:"text/html" });
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
}

function setProviderStatus(text, kind) { els.providerStatus.textContent = text; els.providerStatus.className = `inline-status ${kind || ""}`; }
function toggleBusy(button, on, label) { button.disabled = on; button.textContent = label; button.classList.toggle("loading", on); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove("show"), 2600); }
function inferName(prompt) { const clean = prompt.replace(/^(build|make|create)\s+(me\s+)?(a|an)?\s*/i, "").trim(); return clean.split(/[.!?\n]/)[0].split(/\s+/).slice(0,5).join(" ") || "New Mini App"; }
function formatDate(s) { try { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(s)); } catch { return "recently"; } }
function escapeHtml(s="") { return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function looksLikeHtml(s) { return /<!doctype html>|<html[\s>]/i.test(s) && /<\/html>/i.test(s); }
function cleanGeneratedHtml(raw) {
  let s = String(raw || "").trim();
  const fenced = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  const start = s.search(/<!doctype html>|<html[\s>]/i);
  if (start > 0) s = s.slice(start);
  return s.trim();
}

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
- Make the UI distinct, refined, accessible, and touch-friendly.
- The output must end with </html>.`;
