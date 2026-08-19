import { PROVIDERS, callProvider } from "./providers.js";

const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
let activeRun = 0;
let progress = 0;
let startedAt = 0;
let creepTimer = null;
let clockTimer = null;
let artifactSaved = false;
let failed = false;

injectStyles();
createPanel();
wire();

function createPanel() {
  const section = document.createElement("section");
  section.className = "panel glass thinking-panel";
  section.innerHTML = `
    <div class="panel-head thinking-head">
      <div><p class="kicker">BUILD PROGRESS</p><h2>Watch AppGPT build</h2></div>
      <span id="thinkingState" class="pill">Idle</span>
    </div>
    <div class="progress-summary">
      <div><strong id="progressPhase">Ready</strong><span id="progressDetail">Start a build to see live progress.</span></div>
      <div class="progress-numbers"><strong id="progressPercent">0%</strong><span id="progressElapsed">0s</span></div>
    </div>
    <div class="build-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div id="buildProgressFill" class="build-progress-fill"></div>
      <div id="buildProgressPulse" class="build-progress-pulse"></div>
    </div>
    <div id="progressHint" class="progress-hint">During the AI request, progress moves inside a bounded generating zone. Real processing milestones take over as soon as the response arrives.</div>
    <div id="thinkingGoal" class="thinking-goal">No active build.</div>
    <div id="thinkingSteps" class="thinking-steps"></div>
  `;
  const session = document.querySelector("#view-build .session-panel");
  if (session) session.before(section); else $("view-build")?.append(section);
}

function wire() {
  $("buildBtn")?.addEventListener("click", () => {
    const text = $("promptInput")?.value?.trim();
    if (text) begin("build", text);
  });
  $("confirmCreateAppBtn")?.addEventListener("click", () => {
    const name=$("appNameInput")?.value?.trim(), desc=$("appDescriptionInput")?.value?.trim();
    if (name && desc) begin("build", `${name}: ${desc}`);
  });
  $("editBtn")?.addEventListener("click", () => {
    const text=$("editInput")?.value?.trim(); if(text) begin("edit",text);
  });

  window.addEventListener("appgpt:build-progress", e => handleMilestone(e.detail || {}));

  $("previewFrame")?.addEventListener("load", () => {
    if (!activeRun || !artifactSaved || failed) return;
    setProgress(100, "Preview ready", "The generated Mini App loaded successfully.", true);
    addStep("Preview loaded — build complete", "done");
    finishSoon();
  });
}

function begin(mode, request) {
  activeRun++;
  progress=0; artifactSaved=false; failed=false; startedAt=Date.now();
  stopTimers();
  $("thinkingSteps").innerHTML="";
  setGoal(request);
  setState(mode === "edit" ? "Editing" : "Building");
  setProgress(2, mode === "edit" ? "Starting edit" : "Starting build", "Creating a durable build session…");
  addStep(mode === "edit" ? "Starting a new saved edit operation" : "Starting a new saved build operation");
  clockTimer=setInterval(updateClock,250);
  requestVisiblePlan(activeRun, mode, request).catch(()=>{});
}

function handleMilestone({stage, percent, label, provider}) {
  if (!activeRun) {
    activeRun++;
    startedAt=Date.now();
    clockTimer=setInterval(updateClock,250);
  }
  if (stage === "error") {
    failed=true; stopCreep();
    setState("Failed");
    setProgress(Math.max(progress, 12), "Build failed", label || "The provider returned an error.", true, true);
    addStep(label || "Generation failed", "error");
    return;
  }
  const map={
    "chat-saved":[8,"Chat saved",label||"Your session is already safe, even while the AI is working."],
    "request-sent":[14,"Generating with AI",label||`Waiting for ${provider||"the provider"}…`],
    "response":[72,"Response received",label||"The model finished generating."],
    "extract":[80,"Extracting HTML",label||"Pulling the complete HTML document out of the response."],
    "validate":[88,"Validating app",label||"Checking the generated file structure."],
    "saved":[96,"Saving artifact",label||"Attaching index.html to the chat."]
  };
  const item=map[stage]; if(!item)return;
  if(stage==="request-sent") startCreep(); else if(stage==="response") stopCreep();
  if(stage==="saved") artifactSaved=true;
  setProgress(Math.max(percent||0,item[0]),item[1],item[2],stage!=="request-sent");
  addStep(item[2], stage==="saved"?"done":"active");
  if(stage==="saved") {
    setTimeout(()=>{
      if(activeRun && artifactSaved && !failed && progress<100){
        setProgress(100,"Build complete","index.html is saved and ready to preview, copy, or download.",true);
        addStep("index.html is ready", "done");
        finishSoon();
      }
    },700);
  }
}

function startCreep() {
  stopCreep();
  const fill=$("buildProgressFill"); fill?.classList.add("generating");
  creepTimer=setInterval(()=>{
    if(!activeRun||failed||progress>=68)return;
    // Slow down as we approach the cap so a long Gemini request never pretends to be almost finished.
    const remaining=68-progress;
    const step=Math.max(.15, remaining*.018);
    setProgress(Math.min(68,progress+step),"Generating with AI",waitingDetail(),false);
  },650);
}
function stopCreep(){if(creepTimer)clearInterval(creepTimer);creepTimer=null;$("buildProgressFill")?.classList.remove("generating");}
function waitingDetail(){
  const provider=$("providerSelect")?.value; const name=PROVIDERS[provider]?.name||"AI";
  const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
  if(seconds<10)return `${name} is planning and generating the single-file app…`;
  if(seconds<30)return `${name} is still generating. Larger apps can take a while.`;
  if(seconds<60)return `Still waiting for ${name}. Your chat is already saved, so this build won't disappear.`;
  return `${name} is taking longer than usual. The request is still active and your session is safe.`;
}

function setProgress(value, phase, detail, exact=false, isError=false) {
  progress=Math.max(0,Math.min(100,value));
  const rounded=Math.round(progress);
  $("buildProgressFill").style.width=`${progress}%`;
  $("progressPercent").textContent=exact?`${rounded}%`:`~${rounded}%`;
  $("progressPhase").textContent=phase;
  $("progressDetail").textContent=detail;
  const track=document.querySelector(".build-progress-track"); track?.setAttribute("aria-valuenow",String(rounded));
  track?.classList.toggle("error",isError);
  if(progress>=100) $("buildProgressFill")?.classList.add("complete"); else $("buildProgressFill")?.classList.remove("complete");
}
function updateClock(){if(!startedAt)return;const s=Math.floor((Date.now()-startedAt)/1000);$("progressElapsed").textContent=formatElapsed(s);if(progress>=14&&progress<69&&!failed)$("progressDetail").textContent=waitingDetail();}
function formatElapsed(s){return s<60?`${s}s`:`${Math.floor(s/60)}m ${String(s%60).padStart(2,"0")}s`;}
function setState(t){$("thinkingState").textContent=t;}
function setGoal(request){const compact=String(request).replace(/\s+/g," ").trim();$("thinkingGoal").innerHTML=`<strong>Goal</strong><span>${escapeHtml(compact.slice(0,260))}${compact.length>260?"…":""}</span>`;}
function addStep(text,state="active"){const row=document.createElement("div");row.className=`thinking-step ${state}`;row.innerHTML=`<span class="thinking-dot"></span><span>${escapeHtml(text)}</span>`;$("thinkingSteps").append(row);row.scrollIntoView({block:"nearest",behavior:"smooth"});}
function finishSoon(){setState("Ready");stopCreep();try{tg?.HapticFeedback?.notificationOccurred?.("success");}catch{}const id=activeRun;setTimeout(()=>{if(activeRun===id){activeRun=0;stopTimers();}},1300);}
function stopTimers(){stopCreep();if(clockTimer)clearInterval(clockTimer);clockTimer=null;}

async function requestVisiblePlan(runId,mode,request){
  const config=getProviderConfig(); if(!config?.apiKey||!config.model||!config.baseUrl)return;
  try{
    const response=await callProvider(config,[{role:"system",content:"You are the visible build-notes assistant for a Telegram Mini App builder. Return exactly 3 to 5 short user-facing implementation bullets. Describe architecture, UI, useful Telegram APIs, and single-file assembly. Do not reveal private chain-of-thought. No code."},{role:"user",content:`${mode==="edit"?"Editing":"Creating"} a Telegram Mini App:\n${request}`}],{temperature:.2,maxTokens:260});
    if(activeRun!==runId)return;
    const notes=response.split(/\r?\n/).map(x=>x.replace(/^\s*[-*•]\s*/,"").trim()).filter(Boolean).slice(0,5); if(!notes.length)return;
    const box=document.createElement("div");box.className="ai-plan-box";box.innerHTML=`<strong>AI implementation plan</strong>${notes.map(n=>`<div>• ${escapeHtml(n)}</div>`).join("")}`;$("thinkingSteps").prepend(box);
  }catch(e){console.debug("Visible plan skipped",e);}
}
function getProviderConfig(){const provider=$("providerSelect")?.value,preset=PROVIDERS[provider];if(!preset)return null;return{provider,kind:preset.kind,model:$("modelInput")?.value?.trim(),baseUrl:$("baseUrlInput")?.value?.trim(),apiKey:$("apiKeyInput")?.value?.trim()};}
function escapeHtml(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}

function injectStyles(){
  const s=document.createElement("style");s.textContent=`
  .thinking-panel{margin-top:18px;overflow:hidden}.thinking-head{margin-bottom:12px}.progress-summary{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.progress-summary>div:first-child{display:grid;gap:4px}.progress-summary span{font-size:12px;opacity:.68}.progress-numbers{text-align:right;display:grid;gap:2px}.progress-numbers strong{font-size:22px;letter-spacing:-.04em}.build-progress-track{height:13px;margin-top:12px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.08)}.build-progress-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#6d63ff,#9d8cff,#63c7ff);transition:width .55s cubic-bezier(.22,.75,.2,1);position:relative;z-index:2}.build-progress-fill.generating:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);transform:translateX(-100%);animation:progressSweep 1.45s linear infinite}.build-progress-fill.complete{box-shadow:0 0 18px rgba(128,154,255,.45)}.build-progress-track.error .build-progress-fill{filter:saturate(.25)}.progress-hint{font-size:11px;opacity:.52;margin-top:7px;line-height:1.4}.thinking-goal{display:flex;gap:10px;padding:11px 13px;margin-top:13px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.03);font-size:12px;line-height:1.45}.thinking-goal strong{white-space:nowrap}.thinking-steps{display:grid;gap:8px;margin-top:11px;max-height:280px;overflow:auto}.thinking-step{display:flex;gap:9px;padding:9px 11px;border-radius:11px;background:rgba(255,255,255,.025);font-size:12px;line-height:1.4;animation:thinkingIn .2s ease}.thinking-dot{width:7px;height:7px;border-radius:50%;margin-top:5px;background:currentColor;opacity:.55;flex:0 0 auto}.thinking-step.done{opacity:1}.thinking-step.error{opacity:.8}.ai-plan-box{padding:12px 13px;border-radius:13px;border:1px solid rgba(130,120,255,.2);background:rgba(120,110,255,.065);font-size:12px;line-height:1.5}.ai-plan-box strong{display:block;margin-bottom:5px}.ai-plan-box div{opacity:.82}@keyframes progressSweep{to{transform:translateX(100%)}}@keyframes thinkingIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`;
  document.head.append(s);
}
