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
    telegram.ready(); telegram.expand(); telegram.enableClosingConfirmation?.();
    telegram.setHeaderColor?.("secondary_bg_color"); telegram.setBackgroundColor?.("bg_color"); telegram.setBottomBarColor?.("bottom_bar_bg_color");
    telegram.MainButton?.setParams?.({ text:"✦ CREATE APP", is_visible:true, is_active:true, has_shine_effect:true });
    telegram.MainButton?.onClick?.(startNativeCreateFlow);
    if (telegram.isVersionAtLeast?.("7.10") && telegram.SecondaryButton) {
      telegram.SecondaryButton.setParams({ text:"CHATS", position:"left", is_visible:true, is_active:true });
      telegram.SecondaryButton.onClick(() => switchView("chats"));
    }
    if (telegram.isVersionAtLeast?.("7.0") && telegram.SettingsButton) {
      telegram.SettingsButton.show(); telegram.SettingsButton.onClick(() => switchView("settings"));
    }
    telegram.BackButton?.onClick?.(() => switchView("build"));
  } catch (e) { console.debug("Telegram shell setup skipped", e); }
}

function fillProviders() {
  els.providerSelect.innerHTML = Object.entries(PROVIDERS).map(([id,p]) => `<option value="${id}">${escapeHtml(p.name)}</option>`).join("");
}

async function restoreConfig() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG) || "{}"); } catch {}
  const provider = saved.provider && PROVIDERS[saved.provider] ? saved.provider : "openrouter";
  const preset = PROVIDERS[provider];
  els.providerSelect.value = provider; els.modelInput.value = saved.model || preset.model; els.baseUrl.value = saved.baseUrl || preset.baseUrl;
  const secret = await loadApiKey(); els.apiKey.value = secret.key || ""; els.rememberKey.checked = secret.remembered;
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
}
function switchView(name) {
  activeView = name;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  els.pageTitle.textContent = ({build:"Build a Telegram app",chats:"Your chats",settings:"Connect an AI provider",publish:"Get your HTML file"})[name] || "AppGPT";
  if (name === "chats") renderChats(); updateTelegramButtons();
}
function updateTelegramButtons() {
  if (!telegram) return;
  try {
    activeView === "build" ? telegram.BackButton?.hide?.() : telegram.BackButton?.show?.();
    telegram.MainButton?.setParams?.({ text: busy ? "BUILDING…" : "✦ CREATE APP", is_visible:activeView === "build", is_active:!busy, has_shine_effect:!busy });
  } catch {}
}

function bindActions() {
  els.providerSelect.addEventListener("change", () => { const p=PROVIDERS[els.providerSelect.value]; els.modelInput.value=p.model; els.baseUrl.value=p.baseUrl; });
  els.toggleKey.addEventListener("click", () => els.apiKey.type = els.apiKey.type === "password" ? "text" : "password");
  els.saveProvider.addEventListener("click", saveConfig); els.testProvider.addEventListener("click", testProvider);
  els.build.addEventListener("click", generateFromPrompt); els.editBtn.addEventListener("click", editApp);
  els.download.addEventListener("click", () => downloadArtifact(latestArtifact())); els.copyHtml.addEventListener("click", () => copyArtifact(latestArtifact()));
  els.publishDownload.addEventListener("click", () => downloadArtifact(latestArtifact())); els.publishCopy.addEventListener("click", () => copyArtifact(latestArtifact()));
  els.openPreview.addEventListener("click", () => openArtifactPreview(latestArtifact())); els.newChat.addEventListener("click", newChat);
  els.telegramCreate.addEventListener("click", startNativeCreateFlow); els.modalClose.addEventListener("click", closeCreateSheet); els.modalCancel.addEventListener("click", closeCreateSheet);
  els.modalConfirm.addEventListener("click", createFromSetupSheet); els.modal.addEventListener("click", e => { if (e.target === els.modal) closeCreateSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !els.modal.hidden) closeCreateSheet(); });
  const map={"Study assistant":"Build a polished study assistant with flashcards, quiz mode, streak tracking, and an optional AI tutor. Use a modern Telegram-native dark interface.","AI image helper":"Build an AI image prompt helper where users choose a visual style and turn a rough idea into a detailed image prompt. Include history and copy buttons.","Habit tracker":"Build a beautiful habit tracker with daily check-ins, streaks, weekly progress, and local persistence. Make it feel native inside Telegram.","Game leaderboard":"Build a game leaderboard Mini App with player cards, ranks, score filters, mock friends data, haptics, and a futuristic competitive design."};
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => { els.prompt.value=map[chip.textContent.trim()]||chip.textContent.trim(); }));
}

async function startNativeCreateFlow() {
  haptic("light");
  if (telegram?.showPopup && telegram.isVersionAtLeast?.("6.2")) {
    try { telegram.showPopup({title:"Create a Telegram Mini App",message:"AppGPT will create the chat immediately, then generate one complete index.html.",buttons:[{id:"continue",type:"default",text:"Set up app"},{id:"cancel",type:"cancel"}]}, id => { if(id==="continue") openCreateSheet(); }); return; } catch {}
  }
  openCreateSheet();
}
function openCreateSheet() { els.modal.hidden=false; requestAnimationFrame(()=>els.appName.focus()); }
function closeCreateSheet() { els.modal.hidden=true; }
async function createFromSetupSheet() {
  const name=els.appName.value.trim(), description=els.appDescription.value.trim(), style=els.appStyle.value, extra=els.appExtra.value.trim();
  if(!name) return toast("Give your app a name"); if(!description) return toast("Describe what the app should do");
  const request=[`App name: ${name}`,`Purpose and features: ${description}`,`Visual style: ${style}`,extra?`Extra instructions: ${extra}`:"","Generate this as a Telegram Mini App."].filter(Boolean).join("\n");
  closeCreateSheet(); if(currentChat) await newChat(); els.prompt.value=request; await generateHtmlArtifact(request,{appName:name,source:"guided setup"});
}

function getConfig(){const provider=els.providerSelect.value,preset=PROVIDERS[provider];return{provider,kind:preset.kind,model:els.modelInput.value.trim(),baseUrl:els.baseUrl.value.trim(),apiKey:els.apiKey.value.trim()};}
async function saveConfig(){const c=getConfig();localStorage.setItem(STORAGE_CONFIG,JSON.stringify({provider:c.provider,model:c.model,baseUrl:c.baseUrl}));await saveApiKey(c.apiKey,els.rememberKey.checked);updateProviderUI();successHaptic();toast("Provider settings saved");}
function updateProviderUI(){const c=getConfig(),connected=Boolean(c.apiKey&&c.model&&c.baseUrl);els.providerBadge.textContent=connected?`${PROVIDERS[c.provider].name} · ${c.model}`:"No provider";document.querySelector(".status-dot")?.classList.toggle("connected",connected);els.modelSummary.textContent=connected?`${PROVIDERS[c.provider].name} · ${c.model}`:"Set a provider first";}
async function testProvider(){const c=getConfig();setProviderStatus("Testing…","");toggleBusy(els.testProvider,true,"Testing");try{const r=await callProvider(c,[{role:"system",content:"You are a connection test. Reply with exactly OK."},{role:"user",content:"Test connection."}],{maxTokens:30,temperature:0});setProviderStatus(`Connected — ${r.trim().slice(0,60)}`,"ok");await saveConfig();}catch(e){errorHaptic();setProviderStatus(e.message,"error");}finally{toggleBusy(els.testProvider,false,"Test connection");}}

async function generateFromPrompt(){const idea=els.prompt.value.trim();if(!idea)return startNativeCreateFlow();await generateHtmlArtifact(idea,{appName:inferName(idea),source:"prompt"});}

async function generateHtmlArtifact(request, meta={}) {
  if(busy) return;
  const c=getConfig(); if(!c.apiKey){switchView("settings");return toast("Add an API key first");}
  busy=true; updateTelegramButtons(); toggleBusy(els.build,true,"Building index.html"); telegram?.MainButton?.showProgress?.();

  const startedAt=new Date().toISOString();
  const title=currentChat?.title || meta.appName || inferName(request);
  const pendingId=makeId();
  if(!currentChat){currentChat={id:makeId(),title,createdAt:startedAt,updatedAt:startedAt,messages:[],artifacts:[],project:{name:title,prompt:request,html:"",latestArtifactId:null},status:"building"};}
  currentChat.updatedAt=startedAt; currentChat.status="building"; currentChat.project={...(currentChat.project||{}),name:title,prompt:request};
  currentChat.messages.push({id:makeId(),role:"user",content:request,ts:startedAt});
  currentChat.messages.push({id:pendingId,role:"assistant",content:`Building ${title}… Waiting for ${PROVIDERS[c.provider].name} to generate index.html.`,status:"building",ts:startedAt});
  await saveChat(currentChat); showCurrentChat(); await renderChats();
  emitProgress("chat-saved",8,"Chat saved — generation can continue safely");
  emitProgress("request-sent",14,`Sent build request to ${PROVIDERS[c.provider].name}`);

  try {
    const raw=await callProvider(c,[{role:"system",content:TELEGRAM_APP_SYSTEM_PROMPT},{role:"user",content:`Build this app now.\n\n${request}`}],{temperature:.35,maxTokens:12000});
    emitProgress("response",72,"AI response received");
    const html=extractHtmlArtifact(raw); emitProgress("extract",80,"Extracted index.html from the response");
    validateHtmlArtifact(html); emitProgress("validate",88,"HTML structure validated");
    const now=new Date().toISOString(),version=nextArtifactVersion(currentChat),artifact=makeArtifact(html,version,now);
    currentChat.updatedAt=now;currentChat.status="ready";currentChat.artifacts=[...(currentChat.artifacts||[]),artifact].slice(-MAX_ARTIFACTS_PER_CHAT);
    currentChat.project={name:title,prompt:request,html,latestArtifactId:artifact.id};
    const pending=currentChat.messages.find(m=>m.id===pendingId); if(pending){pending.content=`Created ${artifact.filename} (v${version}).`;pending.artifactId=artifact.id;pending.status="ready";pending.ts=now;}
    await saveChat(currentChat); emitProgress("saved",95,"Saved index.html into this chat");
    showCurrentChat();await renderChats();successHaptic();toast("index.html created and saved to chat ✦");
  } catch(err) {
    console.error(err); const now=new Date().toISOString(); currentChat.updatedAt=now;currentChat.status="error";
    const pending=currentChat.messages.find(m=>m.id===pendingId); if(pending){pending.content=`Build failed: ${err.message||"Generation failed"}`;pending.status="error";pending.ts=now;}
    await saveChat(currentChat);showCurrentChat();await renderChats();emitProgress("error",0,err.message||"Generation failed");errorHaptic();toast(err.message||"Generation failed");
  } finally {busy=false;telegram?.MainButton?.hideProgress?.();toggleBusy(els.build,false,"✦ Generate index.html");updateTelegramButtons();}
}

async function editApp(){
  const current=latestArtifact();if(!current)return toast("Generate or open a chat first");const request=els.editInput.value.trim();if(!request)return toast("Describe the change first");const c=getConfig();if(!c.apiKey){switchView("settings");return toast("Add an API key first");}
  busy=true;updateTelegramButtons();toggleBusy(els.editBtn,true,"Editing HTML");telegram?.MainButton?.showProgress?.();
  const now=new Date().toISOString(),pendingId=makeId();currentChat.updatedAt=now;currentChat.status="building";currentChat.messages.push({id:makeId(),role:"user",content:request,ts:now});currentChat.messages.push({id:pendingId,role:"assistant",content:`Applying edit… Waiting for ${PROVIDERS[c.provider].name}.`,status:"building",ts:now});
  await saveChat(currentChat);showCurrentChat();await renderChats();emitProgress("chat-saved",8,"Edit request saved to chat");emitProgress("request-sent",14,`Sent edit request to ${PROVIDERS[c.provider].name}`);
  try{
    const history=(currentChat.messages||[]).filter(m=>m.role==="user").slice(-8).map(m=>`- ${m.content}`).join("\n");
    const raw=await callProvider(c,[{role:"system",content:TELEGRAM_APP_SYSTEM_PROMPT+EDIT_SYSTEM_SUFFIX},{role:"user",content:`Recent requests:\n${history}\n\nCURRENT index.html:\n\n${current.content}\n\nCHANGE REQUEST:\n${request}`}],{temperature:.25,maxTokens:14000});
    emitProgress("response",72,"AI response received");const html=extractHtmlArtifact(raw);emitProgress("extract",80,"Extracted updated index.html");validateHtmlArtifact(html);emitProgress("validate",88,"Updated HTML validated");
    const done=new Date().toISOString(),version=nextArtifactVersion(currentChat),artifact=makeArtifact(html,version,done);currentChat.updatedAt=done;currentChat.status="ready";currentChat.artifacts=[...(currentChat.artifacts||[]),artifact].slice(-MAX_ARTIFACTS_PER_CHAT);currentChat.project={...(currentChat.project||{}),html,latestArtifactId:artifact.id};
    const pending=currentChat.messages.find(m=>m.id===pendingId);if(pending){pending.content=`Updated ${artifact.filename} to v${version}.`;pending.artifactId=artifact.id;pending.status="ready";pending.ts=done;}
    await saveChat(currentChat);emitProgress("saved",95,"Saved updated HTML to this chat");showCurrentChat();els.editInput.value="";await renderChats();successHaptic();toast("Edit saved as a new HTML version");
  }catch(err){const done=new Date().toISOString();currentChat.updatedAt=done;currentChat.status="error";const pending=currentChat.messages.find(m=>m.id===pendingId);if(pending){pending.content=`Edit failed: ${err.message||"Generation failed"}`;pending.status="error";pending.ts=done;}await saveChat(currentChat);showCurrentChat();await renderChats();emitProgress("error",0,err.message||"Edit failed");errorHaptic();toast(err.message||"Edit failed");}
  finally{busy=false;telegram?.MainButton?.hideProgress?.();toggleBusy(els.editBtn,false,"Apply edit");updateTelegramButtons();}
}

async function restoreLastSession(){const id=await getLastChatId();if(!id)return;const chat=await getChat(id);if(chat){currentChat=chat;showCurrentChat();}}
function showCurrentChat(){if(!currentChat)return;const a=latestArtifact();if(currentChat.project?.prompt)els.prompt.value=currentChat.project.prompt;if(a){els.previewFrame.srcdoc=a.content;document.querySelector(".phone")?.classList.add("active");els.previewEmpty.style.display="none";els.previewTitle.textContent=currentChat.project?.name||currentChat.title;els.publishProjectName.textContent=currentChat.project?.name||currentChat.title;}else{els.previewFrame.srcdoc="";document.querySelector(".phone")?.classList.remove("active");els.previewEmpty.style.display="block";els.previewTitle.textContent=currentChat.title||"Building…";els.publishProjectName.textContent=currentChat.title||"Building…";}els.sessionName.textContent=currentChat.title||"Current session";els.sessionMeta.textContent=`${currentChat.messages?.length||0} messages · ${currentChat.status||"saved"} · ${formatDate(currentChat.updatedAt)}`;renderSessionMessages();}
function renderSessionMessages(){const msgs=currentChat?.messages||[];if(!msgs.length){els.sessionMessages.innerHTML=`<div class="session-empty">Your prompts and generated HTML files will appear here automatically.</div>`;return;}els.sessionMessages.innerHTML=msgs.slice(-30).map(m=>{const a=m.artifactId?findArtifact(m.artifactId):null;const status=m.status==="building"?`<span class="pill">Building…</span>`:m.status==="error"?`<span class="pill">Failed</span>`:"";return `<div class="session-message ${m.role}"><div class="message-meta"><span>${m.role==="user"?"You":"AppGPT"}</span>${status}</div><p>${escapeHtml(m.content)}</p>${a?artifactCard(a):""}</div>`;}).join("");bindArtifactButtons();els.sessionMessages.scrollTop=els.sessionMessages.scrollHeight;}
function artifactCard(a){return `<div class="artifact-card"><div><strong>📄 ${escapeHtml(a.filename)}</strong><span>v${a.version} · ${formatBytes(a.size)}</span></div><div class="artifact-actions"><button class="ghost-btn artifact-preview" data-id="${a.id}">Preview</button><button class="ghost-btn artifact-copy" data-id="${a.id}">Copy HTML</button><button class="secondary-btn artifact-download" data-id="${a.id}">Download</button></div></div>`;}
function bindArtifactButtons(){document.querySelectorAll(".artifact-preview").forEach(b=>b.onclick=()=>openArtifactPreview(findArtifact(b.dataset.id)));document.querySelectorAll(".artifact-copy").forEach(b=>b.onclick=()=>copyArtifact(findArtifact(b.dataset.id)));document.querySelectorAll(".artifact-download").forEach(b=>b.onclick=()=>downloadArtifact(findArtifact(b.dataset.id)));}
async function newChat(){currentChat=null;await setLastChatId("");els.prompt.value="";els.editInput.value="";els.previewFrame.srcdoc="";document.querySelector(".phone")?.classList.remove("active");els.previewEmpty.style.display="block";els.previewTitle.textContent="Untitled app";els.publishProjectName.textContent="Nothing generated yet";els.sessionName.textContent="New session";els.sessionMeta.textContent="Not saved yet";renderSessionMessages();switchView("build");}
async function renderChats(){const chats=await listChats();els.chatsEmpty.style.display=chats.length?"none":"block";els.chatGrid.innerHTML=chats.map(chat=>`<article class="project-card chat-card ${chat.id===currentChat?.id?"active-chat":""}"><div class="project-card-top"><strong>${escapeHtml(chat.title||"Untitled chat")}</strong><span class="pill">${chat.status==="building"?"Building…":`${chat.artifacts?.length||0} files`}</span></div><p>${escapeHtml(chat.messages?.filter(m=>m.role==="user").at(-1)?.content||chat.project?.prompt||"No prompt")}</p><span class="tiny">Updated ${formatDate(chat.updatedAt)}</span><div class="project-card-actions"><button class="secondary-btn chat-open" data-id="${chat.id}">Continue</button><button class="ghost-btn chat-delete" data-id="${chat.id}">Delete</button></div></article>`).join("");document.querySelectorAll(".chat-open").forEach(b=>b.onclick=async()=>{const chat=await getChat(b.dataset.id);if(chat){currentChat=chat;await setLastChatId(chat.id);showCurrentChat();switchView("build");}});document.querySelectorAll(".chat-delete").forEach(b=>b.onclick=async()=>{await deleteChat(b.dataset.id);if(currentChat?.id===b.dataset.id)await newChat();await renderChats();toast("Chat deleted");});}
function renderProviderCards(){els.providerCards.innerHTML=Object.values(PROVIDERS).map(p=>`<div class="provider-card"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.hint)}</span></div>`).join("");}
function latestArtifact(){if(!currentChat)return null;const arts=currentChat.artifacts||[];return arts.find(a=>a.id===currentChat.project?.latestArtifactId)||arts.at(-1)||null;}
function findArtifact(id){return(currentChat?.artifacts||[]).find(a=>a.id===id)||null;}
function nextArtifactVersion(chat){const max=Math.max(0,...(chat?.artifacts||[]).map(a=>Number(a.version)||0));return max+1;}
function makeArtifact(content,version,createdAt){return{id:makeId(),filename:"index.html",mime:"text/html",version,content,size:new Blob([content]).size,createdAt};}
function downloadArtifact(a){if(!a)return toast("No HTML file yet");const blob=new Blob([a.content],{type:"text/html;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="index.html";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copyArtifact(a){if(!a)return toast("No HTML file yet");try{await navigator.clipboard.writeText(a.content);toast("HTML copied");}catch{toast("Could not copy HTML");}}
function openArtifactPreview(a){if(!a)return toast("No HTML file yet");const blob=new Blob([a.content],{type:"text/html"}),url=URL.createObjectURL(blob);window.open(url,"_blank","noopener,noreferrer");setTimeout(()=>URL.revokeObjectURL(url),60000);}
function extractHtmlArtifact(raw){let s=String(raw||"").trim();const fenced=s.match(/```(?:html)?\s*([\s\S]*?)```/i);if(fenced)s=fenced[1].trim();const start=s.search(/<!doctype html>|<html[\s>]/i);if(start>=0)s=s.slice(start);const end=s.toLowerCase().lastIndexOf("</html>");if(end>=0)s=s.slice(0,end+7);return s.trim();}
function validateHtmlArtifact(html){if(!html||html.length<200)throw new Error("The model returned an incomplete file.");if(!/<html[\s>]/i.test(html)||!/<head[\s>]/i.test(html)||!/<body[\s>]/i.test(html)||!/<\/html>/i.test(html))throw new Error("The AI response was not a complete HTML document. Try again.");}
function emitProgress(stage,percent,label){window.dispatchEvent(new CustomEvent("appgpt:build-progress",{detail:{stage,percent,label,provider:els.providerSelect?.value||""}}));}
function setProviderStatus(text,kind){els.providerStatus.textContent=text;els.providerStatus.className=`inline-status ${kind||""}`;}
function toggleBusy(button,on,label){button.disabled=on;button.textContent=label;button.classList.toggle("loading",on);}
function toast(message){els.toast.textContent=message;els.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove("show"),2600);}
function inferName(prompt){const clean=prompt.replace(/^(build|make|create)\s+(me\s+)?(a|an)?\s*/i,"").trim();return clean.split(/[.!?\n]/)[0].split(/\s+/).slice(0,5).join(" ")||"New Mini App";}
function formatDate(s){try{return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(s));}catch{return"recently";}}
function formatBytes(n=0){if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;return`${(n/1048576).toFixed(1)} MB`;}
function escapeHtml(s=""){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function makeId(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function haptic(style){try{telegram?.HapticFeedback?.impactOccurred?.(style);}catch{}}
function successHaptic(){try{telegram?.HapticFeedback?.notificationOccurred?.("success");}catch{}}
function errorHaptic(){try{telegram?.HapticFeedback?.notificationOccurred?.("error");}catch{}}

const TELEGRAM_APP_SYSTEM_PROMPT=`You are AppGPT's Telegram Mini App compiler. You build real, working Telegram Mini Apps. OUTPUT CONTRACT: Return exactly ONE complete index.html document and nothing else. Start with <!doctype html> and end with </html>. No markdown fences, explanations, preamble, JSON, multiple files, TODOs, or placeholders. Put ALL CSS in <style> and ALL JavaScript in <script> in the same file. Include https://telegram.org/js/telegram-web-app.js. Safely call Telegram.WebApp.ready() and expand() when available. Use Telegram theme variables and safe-area variables with browser fallbacks. Use Telegram APIs such as BackButton, MainButton, SecondaryButton, SettingsButton, HapticFeedback, DeviceStorage, SecureStorage, CloudStorage, openLink, showPopup, or viewport events only when they improve the requested app, and feature-detect every Telegram API. The app must also work in a normal browser preview. Implement the requested functionality, not a mockup. Persist ordinary local data when useful. Never include API keys, bot tokens, payment secrets, or fake credentials. If AI/backend access is needed, provide a BYOK/configurable endpoint flow and explain in the UI that public apps need a backend proxy. Avoid eval/new Function and escape unsafe user content. Design for a phone first, touch targets at least 44px, polished loading/empty/error states, accessible labels, and responsive layout. Before responding, internally check that the document contains html, head, body, inline CSS, inline JavaScript, and closing </html>. Your visible response is ONLY the final HTML file.`;
const EDIT_SYSTEM_SUFFIX=`\nYou are editing the provided existing index.html. Preserve all working behavior unless the user explicitly asks to change it. Return the COMPLETE replacement index.html only, following the same single-file output contract.`;
