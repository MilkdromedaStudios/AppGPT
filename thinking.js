import { PROVIDERS, callProvider } from "./providers.js";

const $ = (id) => document.getElementById(id);
const tg = window.Telegram?.WebApp;
let activeRun = 0;
let timers = [];

injectStyles();
const panel = createPanel();
wireBuildThinking();

function createPanel() {
  const section = document.createElement("section");
  section.className = "panel glass thinking-panel";
  section.innerHTML = `
    <div class="panel-head thinking-head">
      <div>
        <p class="kicker">AI BUILD NOTES</p>
        <h2>Watch AppGPT build</h2>
      </div>
      <span id="thinkingState" class="pill">Idle</span>
    </div>
    <div class="thinking-disclaimer">Shows concise implementation notes and progress — not private hidden chain-of-thought.</div>
    <div id="thinkingGoal" class="thinking-goal">Start a build to see the plan and progress here.</div>
    <div id="thinkingSteps" class="thinking-steps"></div>
  `;
  const sessionPanel = document.querySelector("#view-build .session-panel");
  if (sessionPanel) sessionPanel.before(section);
  else $("view-build")?.append(section);
  return section;
}

function wireBuildThinking() {
  $("buildBtn")?.addEventListener("click", () => {
    const prompt = $("promptInput")?.value?.trim();
    if (prompt) startRun("build", prompt);
  });

  $("confirmCreateAppBtn")?.addEventListener("click", () => {
    const name = $("appNameInput")?.value?.trim();
    const description = $("appDescriptionInput")?.value?.trim();
    const style = $("appStyleInput")?.value || "Telegram native";
    if (!name || !description) return;
    startRun("build", `App name: ${name}\nPurpose: ${description}\nStyle: ${style}`);
  });

  $("editBtn")?.addEventListener("click", () => {
    const request = $("editInput")?.value?.trim();
    if (request) startRun("edit", request);
  });

  $("previewFrame")?.addEventListener("load", () => {
    if (!activeRun) return;
    addStep("Preview loaded successfully", "done");
    finishRun();
  });

  const messages = $("sessionMessages");
  if (messages) {
    new MutationObserver(() => {
      if (!activeRun) return;
      if (/index\.html/i.test(messages.textContent || "")) {
        addStep("Saved the new index.html artifact into this chat", "done");
      }
    }).observe(messages, { childList:true, subtree:true });
  }
}

async function startRun(mode, request) {
  const runId = ++activeRun;
  clearTimers();
  const steps = $("thinkingSteps");
  if (steps) steps.innerHTML = "";
  setState(mode === "edit" ? "Editing" : "Building");
  setGoal(request);

  const localSteps = mode === "edit" ? [
    [0, "Reading the current HTML artifact and your requested change"],
    [750, "Preserving working Telegram behavior while planning the edit"],
    [1700, "Rebuilding the complete single-file HTML document"],
    [3200, "Checking that the response can be extracted as index.html"],
    [5200, "Validating document structure and preparing a new version"]
  ] : [
    [0, "Understanding the app goal and required interactions"],
    [700, "Planning a Telegram-native mobile layout and navigation"],
    [1600, "Selecting useful Telegram.WebApp APIs with browser fallbacks"],
    [2900, "Assembling HTML, CSS, and JavaScript into one index.html"],
    [4800, "Checking the output for a complete HTML document"],
    [6800, "Preparing the file artifact, preview, and saved chat version"]
  ];

  localSteps.forEach(([delay, text]) => {
    timers.push(setTimeout(() => {
      if (activeRun === runId) addStep(text, "active");
    }, delay));
  });

  requestVisiblePlan(runId, mode, request).catch(() => {});
}

async function requestVisiblePlan(runId, mode, request) {
  const config = getProviderConfig();
  if (!config?.apiKey || !config.model || !config.baseUrl) return;

  try {
    const response = await callProvider(config, [
      {
        role:"system",
        content:"You are the visible build-notes assistant for a Telegram Mini App builder. Give a short implementation plan that is safe to show to the user. Do NOT reveal hidden chain-of-thought or private reasoning. Return exactly 3 to 5 concise bullet points describing design decisions, Telegram APIs/features to consider, and how the single-file index.html will be assembled. No code."
      },
      {
        role:"user",
        content:`${mode === "edit" ? "We are editing an existing Telegram Mini App." : "We are creating a new Telegram Mini App."}\nRequest:\n${request}`
      }
    ], { temperature:0.25, maxTokens:320 });

    if (activeRun !== runId) return;
    const notes = response.split(/\r?\n/).map(x => x.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0,5);
    if (!notes.length) return;
    const box = document.createElement("div");
    box.className = "ai-plan-box";
    box.innerHTML = `<strong>AI implementation plan</strong>${notes.map(n => `<div>• ${escapeHtml(n)}</div>`).join("")}`;
    $("thinkingSteps")?.prepend(box);
  } catch (error) {
    console.debug("Visible build-plan request skipped", error);
  }
}

function getProviderConfig() {
  const provider = $("providerSelect")?.value;
  const preset = PROVIDERS[provider];
  if (!preset) return null;
  return {
    provider,
    kind:preset.kind,
    model:$("modelInput")?.value?.trim(),
    baseUrl:$("baseUrlInput")?.value?.trim(),
    apiKey:$("apiKeyInput")?.value?.trim()
  };
}

function setGoal(request) {
  const goal = $("thinkingGoal");
  if (!goal) return;
  const compact = request.replace(/\s+/g, " ").trim();
  goal.innerHTML = `<strong>Goal</strong><span>${escapeHtml(compact.slice(0, 260))}${compact.length > 260 ? "…" : ""}</span>`;
}

function addStep(text, state = "active") {
  const steps = $("thinkingSteps");
  if (!steps) return;
  const row = document.createElement("div");
  row.className = `thinking-step ${state}`;
  row.innerHTML = `<span class="thinking-dot"></span><span>${escapeHtml(text)}</span>`;
  steps.append(row);
  row.scrollIntoView({ block:"nearest", behavior:"smooth" });
}

function finishRun() {
  setState("Ready");
  addStep("Build complete — the generated file is ready to preview, copy, or download", "done");
  try { tg?.HapticFeedback?.notificationOccurred?.("success"); } catch {}
  clearTimers();
  const finished = activeRun;
  setTimeout(() => { if (activeRun === finished) activeRun = 0; }, 1200);
}

function setState(text) {
  const el = $("thinkingState");
  if (el) el.textContent = text;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .thinking-panel{margin-top:18px;overflow:hidden}.thinking-head{margin-bottom:8px}.thinking-disclaimer{font-size:12px;opacity:.64;margin-bottom:14px}.thinking-goal{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.035);font-size:13px;line-height:1.5}.thinking-goal strong{white-space:nowrap}.thinking-steps{display:grid;gap:9px;margin-top:12px;max-height:320px;overflow:auto;padding-right:3px}.thinking-step{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.025);font-size:13px;line-height:1.45;animation:thinkingIn .22s ease}.thinking-dot{width:8px;height:8px;margin-top:5px;border-radius:999px;background:currentColor;opacity:.55;flex:0 0 auto}.thinking-step.active{opacity:.8}.thinking-step.done{opacity:1}.thinking-step.done .thinking-dot{box-shadow:0 0 0 4px rgba(255,255,255,.05)}.ai-plan-box{padding:13px 14px;border-radius:14px;border:1px solid rgba(130,120,255,.22);background:rgba(120,110,255,.07);font-size:13px;line-height:1.55}.ai-plan-box strong{display:block;margin-bottom:6px}.ai-plan-box div{opacity:.84}@keyframes thinkingIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}`;
  document.head.append(style);
}
