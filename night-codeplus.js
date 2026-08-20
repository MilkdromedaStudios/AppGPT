import { S, toast } from './app-state.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DRAFT_PREFIX = 'appgpt_code_draft_v1:';
const state = { ready:false, outlineTimer:0, draftTimer:0, restoredFor:'' };

const SNIPPETS = [
  ['Telegram init', `const tg = window.Telegram?.WebApp;\ntg?.ready();\ntg?.expand();`],
  ['Haptic', `window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');`],
  ['Main button', `const mainButton = window.Telegram?.WebApp?.MainButton;\nmainButton?.setParams({ text: 'CONTINUE', is_visible: true, is_active: true });\nmainButton?.onClick(() => {\n  // action\n});`],
  ['Back button', `const backButton = window.Telegram?.WebApp?.BackButton;\nbackButton?.show();\nbackButton?.onClick(() => history.back());`],
  ['Safe storage', `const load = (key, fallback = null) => {\n  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }\n};\nconst save = (key, value) => localStorage.setItem(key, JSON.stringify(value));`],
  ['Toast', `function showToast(message) {\n  const el = document.createElement('div');\n  el.textContent = message;\n  Object.assign(el.style,{position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',padding:'10px 14px',borderRadius:'12px',background:'rgba(20,24,36,.92)',color:'#fff',zIndex:9999});\n  document.body.append(el);\n  setTimeout(() => el.remove(), 2200);\n}`],
  ['Glass card', `.glass-card {\n  background: rgba(255,255,255,.08);\n  border: 1px solid rgba(255,255,255,.12);\n  backdrop-filter: blur(20px) saturate(1.2);\n  -webkit-backdrop-filter: blur(20px) saturate(1.2);\n  border-radius: 18px;\n}`],
  ['Telegram colors', `:root {\n  --tg-bg: var(--tg-theme-bg-color, #10131a);\n  --tg-text: var(--tg-theme-text-color, #f7f8fb);\n  --tg-hint: var(--tg-theme-hint-color, #8b93a7);\n  --tg-button: var(--tg-theme-button-color, #6d7cff);\n  --tg-button-text: var(--tg-theme-button-text-color, #fff);\n}`]
];

boot();
function boot(){
  const timer = setInterval(() => {
    const editor = $('#workspaceCodeEditor');
    const card = $('.workspace-code-card');
    if (!editor || !card) return;
    clearInterval(timer);
    mount(card, editor);
  }, 80);
  setTimeout(() => clearInterval(timer), 15000);
}

function mount(card, editor){
  if ($('#nightCodePlus')) return;
  const bar = document.createElement('div');
  bar.id = 'nightCodePlus';
  bar.className = 'night-codeplus';
  bar.innerHTML = `<div class="night-codeplus-row"><button data-cp="outline">☷ Outline</button><button data-cp="snippets">＋ Snippets</button><button data-cp="goto">⌖ Go to line</button><button data-cp="lint">✓ Check code</button><span id="nightCursorPos">Ln 1, Col 1</span><span id="nightDraftState">Draft safe</span></div><div class="night-codeplus-panel" id="nightCodePanel" hidden></div><div class="night-draft-banner" id="nightDraftBanner" hidden><span>Unsaved code draft recovered for this chat.</span><div><button data-draft="restore">Restore</button><button data-draft="discard">Discard</button></div></div>`;
  card.insertBefore(bar, card.children[1] || null);
  editor.addEventListener('input', () => { scheduleOutline(editor); scheduleDraft(editor); cursor(editor); });
  ['click','keyup','select'].forEach(ev => editor.addEventListener(ev, () => cursor(editor)));
  bar.addEventListener('click', e => click(e, editor));
  window.addEventListener('appgpt-chat-changed', () => setTimeout(() => chatChanged(editor), 50));
  window.addEventListener('beforeunload', e => { if (hasUnsavedDraft(editor)) { e.preventDefault(); e.returnValue=''; } });
  document.addEventListener('keydown', e => shortcuts(e, editor));
  new MutationObserver(() => chatChanged(editor)).observe($('#workspaceChatTitle') || document.body,{childList:true,subtree:true,characterData:true});
  state.ready = true;
  scheduleOutline(editor); cursor(editor); chatChanged(editor);
}

function click(e, editor){
  const action = e.target.closest('[data-cp]')?.dataset.cp;
  if (action === 'outline') showOutline(editor);
  if (action === 'snippets') showSnippets();
  if (action === 'goto') showGoto(editor);
  if (action === 'lint') showLint(editor);
  const line = e.target.closest('[data-line]')?.dataset.line;
  if (line) jumpLine(editor, +line);
  const snip = e.target.closest('[data-snip]')?.dataset.snip;
  if (snip != null) insertSnippet(editor, SNIPPETS[+snip][1]);
  const draft = e.target.closest('[data-draft]')?.dataset.draft;
  if (draft === 'restore') restoreDraft(editor);
  if (draft === 'discard') discardDraft();
  if (e.target.matches('#nightGotoBtn')) jumpLine(editor, +$('#nightGotoInput').value || 1);
}

function panel(html){ const p=$('#nightCodePanel'); p.innerHTML=html; p.hidden=false; }
function closePanel(){ const p=$('#nightCodePanel'); if(p) p.hidden=true; }

function showOutline(editor){
  const items = outline(editor.value);
  panel(`<div class="night-panel-head"><strong>HTML outline</strong><span>${items.length} landmarks</span><button data-close>×</button></div><div class="night-outline-list">${items.length?items.map(x=>`<button data-line="${x.line}"><span>${esc(x.label)}</span><em>line ${x.line}</em></button>`).join(''):'<p>No structural landmarks found.</p>'}</div>`);
  $('#nightCodePanel [data-close]')?.addEventListener('click', closePanel);
}
function outline(code){
  const out=[]; const lines=code.split(/\r?\n/); const rx=/<(h[1-6]|section|main|nav|header|footer|form|script|style|dialog)\b([^>]*)>([^<]{0,60})?/ig;
  lines.forEach((line,i)=>{ let m; while((m=rx.exec(line))){ const tag=m[1].toLowerCase(), attrs=m[2]||'', text=(m[3]||'').trim(); const id=attrs.match(/\bid=["']([^"']+)/i)?.[1]; const cls=attrs.match(/\bclass=["']([^"']+)/i)?.[1]?.split(/\s+/)[0]; out.push({line:i+1,label:`<${tag}> ${text||id?`#${id||''}`:''}${!text&&cls?'.'+cls:''} ${text}`.replace(/\s+/g,' ').trim()}); } });
  return out.slice(0,180);
}
function showSnippets(){ panel(`<div class="night-panel-head"><strong>Insert snippet</strong><span>at cursor</span><button data-close>×</button></div><div class="night-snippet-grid">${SNIPPETS.map((x,i)=>`<button data-snip="${i}"><strong>${esc(x[0])}</strong><span>${esc(x[1].split('\n')[0].slice(0,55))}</span></button>`).join('')}</div>`); $('#nightCodePanel [data-close]')?.addEventListener('click',closePanel); }
function showGoto(editor){ panel(`<div class="night-panel-head"><strong>Go to line</strong><span>${editor.value.split(/\r?\n/).length} lines</span><button data-close>×</button></div><div class="night-goto"><input id="nightGotoInput" type="number" min="1" value="1"><button id="nightGotoBtn">Go</button></div>`); $('#nightCodePanel [data-close]')?.addEventListener('click',closePanel); setTimeout(()=>$('#nightGotoInput')?.select(),0); }
function showLint(editor){
  const issues=lint(editor.value); const err=issues.filter(x=>x.level==='error').length;
  panel(`<div class="night-panel-head"><strong>Live code check</strong><span>${err} errors · ${issues.length-err} notes</span><button data-close>×</button></div><div class="night-lint-list">${issues.length?issues.map(x=>`<button data-line="${x.line}" class="${x.level}"><b>${x.level}</b><span>${esc(x.message)}</span><em>L${x.line}</em></button>`).join(''):'<div class="night-lint-ok">✓ No common structural/accessibility problems found.</div>'}</div>`);
  $('#nightCodePanel [data-close]')?.addEventListener('click',closePanel);
}
function lint(code){
  const issues=[], lines=code.split(/\r?\n/), ids=new Map();
  lines.forEach((line,i)=>{
    for(const m of line.matchAll(/\bid=["']([^"']+)["']/ig)){ if(ids.has(m[1])) issues.push({level:'error',line:i+1,message:`Duplicate id “${m[1]}” (first on line ${ids.get(m[1])}).`}); else ids.set(m[1],i+1); }
    if(/<img\b/i.test(line)&&!/<img\b[^>]*\balt=/i.test(line)) issues.push({level:'warn',line:i+1,message:'Image is missing alt text.'});
    if(/<button\b/i.test(line)&&!/<button\b[^>]*\btype=/i.test(line)) issues.push({level:'note',line:i+1,message:'Button has no explicit type; inside a form it may submit unexpectedly.'});
    if(/target=["']_blank["']/i.test(line)&&!(/rel=["'][^"']*noopener/i.test(line))) issues.push({level:'warn',line:i+1,message:'target="_blank" should include rel="noopener".'});
    if(/console\.log\s*\(/.test(line)) issues.push({level:'note',line:i+1,message:'console.log remains in generated app.'});
  });
  if(!/<meta\s+name=["']viewport["']/i.test(code)) issues.unshift({level:'warn',line:1,message:'Missing viewport meta tag for mobile layout.'});
  if(!/<html\b[^>]*\blang=/i.test(code)) issues.unshift({level:'note',line:1,message:'HTML document has no lang attribute.'});
  return issues.slice(0,120);
}
function jumpLine(editor,line){ const lines=editor.value.split(/\r?\n/); line=Math.max(1,Math.min(lines.length,line)); let pos=0; for(let i=0;i<line-1;i++)pos+=lines[i].length+1; editor.focus(); editor.setSelectionRange(pos,pos); const lh=parseFloat(getComputedStyle(editor).lineHeight)||18; editor.scrollTop=Math.max(0,(line-4)*lh); cursor(editor); }
function insertSnippet(editor,text){ const a=editor.selectionStart,b=editor.selectionEnd; const pad=a&&editor.value[a-1]!='\n'?'\n':''; editor.setRangeText(pad+text,a,b,'end'); editor.dispatchEvent(new Event('input',{bubbles:true})); editor.focus(); closePanel(); toast('Snippet inserted — save when ready'); }
function cursor(editor){ const pos=editor.selectionStart||0, before=editor.value.slice(0,pos), line=before.split(/\r?\n/).length, col=pos-(before.lastIndexOf('\n')+1)+1; const el=$('#nightCursorPos'); if(el)el.textContent=`Ln ${line}, Col ${col}`; }
function scheduleOutline(editor){ clearTimeout(state.outlineTimer); state.outlineTimer=setTimeout(()=>{ if(!$('#nightCodePanel')?.hidden && $('#nightCodePanel .night-outline-list')) showOutline(editor); },300); }
function draftKey(){ return S.chat?.id ? DRAFT_PREFIX+S.chat.id : ''; }
function scheduleDraft(editor){ clearTimeout(state.draftTimer); const el=$('#nightDraftState'); if(el)el.textContent='Saving draft…'; state.draftTimer=setTimeout(()=>saveDraft(editor),450); }
function saveDraft(editor){ const key=draftKey(); if(!key)return; const saved=S.chat?.project?.html||''; if(editor.value&&editor.value!==saved){ localStorage.setItem(key,JSON.stringify({value:editor.value,ts:Date.now()})); $('#nightDraftState').textContent='Draft saved'; } else { localStorage.removeItem(key); $('#nightDraftState').textContent='Draft safe'; } }
function hasUnsavedDraft(editor){ const key=draftKey(); if(!key)return false; try{return !!JSON.parse(localStorage.getItem(key)||'null')?.value && editor.value!==(S.chat?.project?.html||'');}catch{return false;} }
function chatChanged(editor){ const id=S.chat?.id||''; if(!id||state.restoredFor===id)return; state.restoredFor=id; const key=draftKey(); let d=null; try{d=JSON.parse(localStorage.getItem(key)||'null')}catch{} const banner=$('#nightDraftBanner'); if(d?.value && d.value!==(S.chat?.project?.html||'')){ banner.hidden=false; banner.dataset.value=d.value; } else banner.hidden=true; cursor(editor); }
function restoreDraft(editor){ const b=$('#nightDraftBanner'); if(!b?.dataset.value)return; editor.value=b.dataset.value; editor.dispatchEvent(new Event('input',{bubbles:true})); b.hidden=true; toast('Unsaved code draft restored'); }
function discardDraft(){ const key=draftKey(); if(key)localStorage.removeItem(key); const b=$('#nightDraftBanner'); if(b)b.hidden=true; $('#nightDraftState').textContent='Draft discarded'; }
function shortcuts(e,editor){ if(!(e.ctrlKey||e.metaKey))return; if(e.key.toLowerCase()==='g'){e.preventDefault();showGoto(editor)} if(e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();showOutline(editor)} if(e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();showSnippets()} }
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
