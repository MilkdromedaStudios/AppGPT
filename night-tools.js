import { S, latest, toast, download } from './app-state.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PREF = 'appgpt_night_tools_v1';
const state = { prefs: loadPrefs(), palette: false, find: false, previewSize: 'phone', rotated: false };

boot();

function boot(attempt = 0) {
  if (!$('#workspaceApp')) {
    if (attempt < 80) setTimeout(() => boot(attempt + 1), 50);
    return;
  }
  mountPalette();
  mountCodeTools();
  mountPreviewTools();
  mountDebugTools();
  mountStatus();
  wireDrafts();
  wireShortcuts();
  applyPrefs();
  sync();
  window.addEventListener('appgpt-chat-changed', sync);
}

function loadPrefs() {
  try { return { wrap: true, font: 12, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; }
  catch { return { wrap: true, font: 12 }; }
}
function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(state.prefs)); } catch {} }

function mountPalette() {
  const host = document.createElement('div');
  host.id = 'nightPalette';
  host.className = 'night-palette-backdrop';
  host.hidden = true;
  host.innerHTML = `<section class="night-palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="night-palette-search"><span>⌘</span><input id="nightCommandSearch" autocomplete="off" placeholder="Type a command…"><kbd>Esc</kbd></div>
    <div id="nightCommandList" class="night-command-list"></div>
    <footer><span>↑↓ navigate</span><span>Enter run</span><span>Ctrl/⌘ K open</span></footer>
  </section>`;
  document.body.append(host);
  host.addEventListener('click', e => { if (e.target === host) closePalette(); });
  $('#nightCommandSearch').addEventListener('input', renderCommands);
  $('#nightCommandSearch').addEventListener('keydown', paletteKeys);
  $('#nightCommandList').addEventListener('click', e => e.target.closest('[data-command]') && runCommand(e.target.closest('[data-command]').dataset.command));
  renderCommands();
}

const commands = [
  ['new','＋','New chat','Ctrl/⌘ N',() => $('#newChatBtn')?.click()],
  ['content','◫','Open Content tab','Alt 1',() => tab('content')],
  ['code','⌘','Open Code tab','Alt 2',() => tab('code')],
  ['preview','◉','Open Preview tab','Alt 3',() => tab('preview')],
  ['debug','⌁','Open Debug tab','Alt 4',() => tab('debug')],
  ['sidebar','☰','Toggle chats sidebar','Ctrl/⌘ B',() => $('#workspaceSidebarToggle')?.click()],
  ['composer','✎','Focus AI edit box','Ctrl/⌘ L',focusComposer],
  ['chatsearch','⌕','Search chats','Ctrl/⌘ Shift F',focusChatSearch],
  ['theme','◐','Toggle light / dark','Ctrl/⌘ Shift L',() => $('#themeToggleBtn')?.click()],
  ['find','⌕','Find in code','Ctrl/⌘ F',openFind],
  ['refresh','↻','Reload preview','Ctrl/⌘ R in Preview',refreshPreview],
  ['fullscreen','⛶','Fullscreen preview','',fullscreenPreview],
  ['phone','▯','Preview: phone','',() => setPreview('phone')],
  ['tablet','▭','Preview: tablet','',() => setPreview('tablet')],
  ['desktop','▰','Preview: desktop','',() => setPreview('desktop')],
  ['rotate','↔','Rotate preview','',rotatePreview],
  ['wrap','↩','Toggle code wrapping','',toggleWrap],
  ['fontup','A+','Increase code font','',() => font(1)],
  ['fontdown','A−','Decrease code font','',() => font(-1)],
  ['diagnostics','↓','Download diagnostics','',downloadDiagnostics],
  ['copydiag','⧉','Copy diagnostics','',copyDiagnostics],
  ['clearerrors','×','Clear runtime errors','',clearRuntime],
  ['provider','⚙','Open AI provider','',() => openUtility('settings')],
  ['templates','▦','Open Templates','',() => openUtility('templates')],
  ['publish','↗','Open Publish','',() => openUtility('publish')]
];
let selectedCommand = 0;
function renderCommands() {
  const q = $('#nightCommandSearch')?.value.toLowerCase().trim() || '';
  const shown = commands.filter(c => !q || `${c[2]} ${c[3]}`.toLowerCase().includes(q));
  selectedCommand = Math.min(selectedCommand, Math.max(0, shown.length - 1));
  $('#nightCommandList').innerHTML = shown.map((c,i) => `<button data-command="${c[0]}" class="${i === selectedCommand ? 'selected' : ''}"><span class="night-command-icon">${c[1]}</span><strong>${c[2]}</strong>${c[3] ? `<kbd>${c[3]}</kbd>` : ''}</button>`).join('') || '<div class="night-command-empty">No matching commands</div>';
}
function paletteKeys(e) {
  const q = $('#nightCommandSearch')?.value.toLowerCase().trim() || '';
  const shown = commands.filter(c => !q || `${c[2]} ${c[3]}`.toLowerCase().includes(q));
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedCommand = Math.min(shown.length - 1, selectedCommand + 1); renderCommands(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedCommand = Math.max(0, selectedCommand - 1); renderCommands(); }
  if (e.key === 'Enter' && shown[selectedCommand]) { e.preventDefault(); runCommand(shown[selectedCommand][0]); }
  if (e.key === 'Escape') closePalette();
}
function openPalette() { state.palette = true; $('#nightPalette').hidden = false; selectedCommand = 0; $('#nightCommandSearch').value = ''; renderCommands(); setTimeout(() => $('#nightCommandSearch').focus(), 0); }
function closePalette() { state.palette = false; $('#nightPalette').hidden = true; }
function runCommand(id) { const c = commands.find(x => x[0] === id); closePalette(); c?.[4]?.(); }

function mountCodeTools() {
  const card = $('.workspace-code-card');
  if (!card || $('#nightCodeToolbar')) return;
  const bar = document.createElement('div');
  bar.id = 'nightCodeToolbar';
  bar.className = 'night-code-toolbar';
  bar.innerHTML = `<div class="night-code-left"><button id="nightFindBtn" title="Find in code">⌕ Find</button><button id="nightWrapBtn" title="Toggle wrapping">↩ Wrap</button></div><div class="night-code-right"><button id="nightFontDown" title="Smaller text">A−</button><span id="nightFontLabel">12px</span><button id="nightFontUp" title="Larger text">A+</button></div>`;
  card.insertBefore(bar, $('#workspaceCodeEditor'));
  const find = document.createElement('div');
  find.id = 'nightFindBar'; find.className = 'night-find-bar'; find.hidden = true;
  find.innerHTML = `<input id="nightFindInput" placeholder="Find"><span id="nightFindCount">0</span><button id="nightFindPrev" title="Previous">↑</button><button id="nightFindNext" title="Next">↓</button><input id="nightReplaceInput" placeholder="Replace"><button id="nightReplaceOne">Replace</button><button id="nightReplaceAll">All</button><button id="nightFindClose">×</button>`;
  card.insertBefore(find, $('#workspaceCodeEditor'));
  $('#nightFindBtn').onclick = openFind; $('#nightWrapBtn').onclick = toggleWrap; $('#nightFontDown').onclick = () => font(-1); $('#nightFontUp').onclick = () => font(1);
  $('#nightFindClose').onclick = closeFind; $('#nightFindNext').onclick = () => findStep(1); $('#nightFindPrev').onclick = () => findStep(-1);
  $('#nightFindInput').oninput = updateFindCount; $('#nightFindInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') closeFind(); };
  $('#nightReplaceOne').onclick = replaceOne; $('#nightReplaceAll').onclick = replaceAll;
}
function openFind() { tab('code'); state.find = true; $('#nightFindBar').hidden = false; setTimeout(() => { const i = $('#nightFindInput'); i.focus(); i.select(); updateFindCount(); }, 0); }
function closeFind() { state.find = false; if ($('#nightFindBar')) $('#nightFindBar').hidden = true; $('#workspaceCodeEditor')?.focus(); }
function matches() { const e = $('#workspaceCodeEditor'), q = $('#nightFindInput')?.value || ''; if (!e || !q) return []; const out=[]; let i=0; while ((i=e.value.indexOf(q,i)) !== -1) { out.push(i); i += Math.max(1,q.length); if(out.length>5000)break; } return out; }
function updateFindCount() { const m = matches(); $('#nightFindCount').textContent = `${m.length}`; }
function findStep(dir) { const e=$('#workspaceCodeEditor'), q=$('#nightFindInput')?.value||'', m=matches(); if(!e||!q||!m.length)return; const pos=e.selectionStart; let target=dir>0?m.find(x=>x>pos):[...m].reverse().find(x=>x<pos); if(target==null)target=dir>0?m[0]:m[m.length-1]; e.focus(); e.setSelectionRange(target,target+q.length); const before=e.value.slice(0,target).split('\n').length; e.scrollTop=Math.max(0,(before-5)*parseFloat(getComputedStyle(e).lineHeight||18)); }
function replaceOne() { const e=$('#workspaceCodeEditor'),q=$('#nightFindInput')?.value||'',r=$('#nightReplaceInput')?.value||''; if(!e||!q)return; if(e.value.slice(e.selectionStart,e.selectionEnd)!==q)findStep(1); if(e.value.slice(e.selectionStart,e.selectionEnd)===q){e.setRangeText(r,e.selectionStart,e.selectionEnd,'end');e.dispatchEvent(new Event('input',{bubbles:true}));updateFindCount();} }
function replaceAll() { const e=$('#workspaceCodeEditor'),q=$('#nightFindInput')?.value||'',r=$('#nightReplaceInput')?.value||''; if(!e||!q)return; const count=matches().length; if(!count)return; e.value=e.value.split(q).join(r);e.dispatchEvent(new Event('input',{bubbles:true}));updateFindCount();toast(`Replaced ${count} occurrence${count===1?'':'s'}`); }
function toggleWrap() { state.prefs.wrap=!state.prefs.wrap; savePrefs(); applyPrefs(); }
function font(delta) { state.prefs.font=Math.max(9,Math.min(22,(state.prefs.font||12)+delta));savePrefs();applyPrefs(); }
function applyPrefs() { const e=$('#workspaceCodeEditor'); if(e){e.classList.toggle('night-nowrap',!state.prefs.wrap);e.style.fontSize=`${state.prefs.font}px`;} if($('#nightWrapBtn'))$('#nightWrapBtn').classList.toggle('active',state.prefs.wrap);if($('#nightFontLabel'))$('#nightFontLabel').textContent=`${state.prefs.font}px`; }

function mountPreviewTools() {
  const panel = $('.workspace-tab-panel[data-panel="preview"] .preview-panel');
  if (!panel || $('#nightPreviewToolbar')) return;
  const bar=document.createElement('div');bar.id='nightPreviewToolbar';bar.className='night-preview-toolbar';
  bar.innerHTML=`<div class="night-segment"><button data-size="phone" class="active">Phone</button><button data-size="tablet">Tablet</button><button data-size="desktop">Desktop</button></div><div><button id="nightRotatePreview" title="Rotate">↔</button><button id="nightRefreshPreview" title="Reload preview">↻</button><button id="nightFullscreenPreview" title="Fullscreen">⛶</button></div>`;
  const wrap=panel.querySelector('.phone-wrap');panel.insertBefore(bar,wrap);
  bar.onclick=e=>{const b=e.target.closest('[data-size]');if(b)setPreview(b.dataset.size)};
  $('#nightRotatePreview').onclick=rotatePreview;$('#nightRefreshPreview').onclick=refreshPreview;$('#nightFullscreenPreview').onclick=fullscreenPreview;
}
function setPreview(size){state.previewSize=size;state.rotated=false;const p=$('.workspace-tab-panel[data-panel="preview"] .phone');if(!p)return;p.dataset.previewSize=size;p.classList.remove('night-rotated');$$('#nightPreviewToolbar [data-size]').forEach(b=>b.classList.toggle('active',b.dataset.size===size));}
function rotatePreview(){const p=$('.workspace-tab-panel[data-panel="preview"] .phone');if(!p)return;state.rotated=!state.rotated;p.classList.toggle('night-rotated',state.rotated);}
function refreshPreview(){const f=$('#previewFrame');if(!f)return;const src=f.srcdoc;f.srcdoc='';requestAnimationFrame(()=>f.srcdoc=src);toast('Preview reloaded');}
async function fullscreenPreview(){const panel=$('#workspace-tab-preview');try{if(document.fullscreenElement)await document.exitFullscreen();else await panel?.requestFullscreen?.();}catch{toast('Fullscreen is unavailable here');}}

function mountDebugTools(){const p=$('#workspace-tab-debug');if(!p||$('#nightDebugTools'))return;const bar=document.createElement('div');bar.id='nightDebugTools';bar.className='night-debug-tools';bar.innerHTML=`<button id="nightCopyDiagnostics">⧉ Copy diagnostics</button><button id="nightDownloadDiagnostics">↓ Download report</button><button id="nightClearRuntime">× Clear runtime</button>`;p.prepend(bar);$('#nightCopyDiagnostics').onclick=copyDiagnostics;$('#nightDownloadDiagnostics').onclick=downloadDiagnostics;$('#nightClearRuntime').onclick=clearRuntime;}
function diagnostics(){const staticIssues=$$('#debugIssues .issue').map(x=>x.innerText.trim()),runtime=$$('#runtimeIssues .issue').map(x=>x.innerText.trim());return [`AppGPT diagnostics`,`Chat: ${S.chat?.title||'Untitled'}`,`Status: ${S.chat?.status||'none'}`,`Artifact: ${latest()?.filename||'none'}${latest()?` v${latest().version}`:''}`,`Generated: ${new Date().toISOString()}`,'',`STATIC (${staticIssues.length})`,...(staticIssues.length?staticIssues:['No static issues']),'',`RUNTIME (${runtime.length})`,...(runtime.length?runtime:['No runtime issues'])].join('\n');}
async function copyDiagnostics(){try{await navigator.clipboard.writeText(diagnostics());toast('Diagnostics copied')}catch{toast('Clipboard access was blocked')}}
function downloadDiagnostics(){download(`appgpt-diagnostics-${Date.now()}.txt`,diagnostics(),'text/plain;charset=utf-8');}
function clearRuntime(){if(!S.runtime?.length){toast('No runtime errors to clear');return}S.runtime.length=0;$('#rerunAuditBtn')?.click();toast('Runtime errors cleared');}

function mountStatus(){const h=$('.workspace-header');if(!h||$('#nightStatus'))return;const s=document.createElement('div');s.id='nightStatus';s.className='night-status';s.innerHTML=`<span id="nightSaveState">Saved</span><span class="night-status-dot">•</span><button id="nightPaletteButton" title="Command palette">⌘K</button>`;h.querySelector('.workspace-header-actions')?.prepend(s);$('#nightPaletteButton').onclick=openPalette;}
function sync(){const f=latest(),save=$('#nightSaveState');if(save)save.textContent=S.chat?.status==='building'?'Building…':f?`v${f.version} saved`:'Draft';restoreDrafts();}

function draftKey(kind){return `appgpt_draft_${kind}_${S.chat?.id||'new'}`}
function wireDrafts(){[['#promptInput','prompt'],['#editInput','edit']].forEach(([sel,kind])=>{const el=$(sel);if(!el)return;let timer;el.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{try{localStorage.setItem(draftKey(kind),el.value)}catch{}},250)});});}
function restoreDrafts(){[['#promptInput','prompt'],['#editInput','edit']].forEach(([sel,kind])=>{const el=$(sel);if(!el||el.value)return;try{const v=localStorage.getItem(draftKey(kind));if(v)el.value=v}catch{}});}

function wireShortcuts(){document.addEventListener('keydown',e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();state.palette?closePalette():openPalette();return}if(state.palette)return;if(e.altKey&&['1','2','3','4'].includes(e.key)){e.preventDefault();tab(['content','code','preview','debug'][+e.key-1]);return}if(mod&&e.key.toLowerCase()==='b'){e.preventDefault();$('#workspaceSidebarToggle')?.click();return}if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();$('#newChatBtn')?.click();return}if(mod&&e.key.toLowerCase()==='l'){e.preventDefault();focusComposer();return}if(mod&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();focusChatSearch();return}if(mod&&e.shiftKey&&e.key.toLowerCase()==='l'){e.preventDefault();$('#themeToggleBtn')?.click();return}if(mod&&e.key.toLowerCase()==='f'&&$('#workspace-tab-code')?.classList.contains('active')){e.preventDefault();openFind();return}if(mod&&e.key.toLowerCase()==='r'&&$('#workspace-tab-preview')?.classList.contains('active')){e.preventDefault();refreshPreview();return}});}
function tab(name){document.querySelector(`[data-worktab="${name}"]`)?.click();}
function focusComposer(){tab('content');setTimeout(()=>($('#editInput')?.offsetParent?$('#editInput'):$('#promptInput'))?.focus(),0)}
function focusChatSearch(){const toggle=$('#workspaceSidebarToggle');if(matchMedia('(max-width:760px)').matches)toggle?.click();setTimeout(()=>$('#workspaceChatSearch')?.focus(),80)}
function openUtility(name){const more=$('#workspaceMoreBtn');more?.click();setTimeout(()=>document.querySelector(`#workspaceMoreMenu [data-util="${name}"]`)?.click(),0)}
