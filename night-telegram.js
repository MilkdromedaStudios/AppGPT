import { S, latest, toast, download } from './app-state.js';
import { auditHtml } from './preview-tools.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={ready:false,html:''};
boot();

function boot(attempt=0){
  if(!$('#workspaceApp')){if(attempt<120)setTimeout(()=>boot(attempt+1),50);return}
  if(state.ready)return;state.ready=true;
  mount();wire();refresh();
  window.addEventListener('appgpt-chat-changed',refresh);
}

function mount(){
  const debug=$('#workspace-tab-debug');if(!debug||$('#nightTelegramLab'))return;
  const card=document.createElement('section');card.id='nightTelegramLab';card.className='night-tg-card';
  card.innerHTML=`<header><div><span>TELEGRAM LAB</span><h3>Mini App readiness</h3><p>Check Telegram integration, security, accessibility, and install metadata before publishing.</p></div><div class="night-tg-score"><strong id="nightTgScore">—</strong><small>score</small></div></header><div class="night-tg-actions"><button id="nightTgRefresh">↻ Recheck</button><button id="nightTgReport">↓ Report</button><button id="nightTgManifest">＋ Manifest</button></div><div class="night-tg-grid" id="nightTgGrid"></div><details class="night-tg-details"><summary>Telegram capabilities detected <span id="nightTgCapsCount">0</span></summary><div id="nightTgCaps" class="night-tg-caps"></div></details>`;
  debug.prepend(card);
}

function wire(){
  $('#nightTgRefresh')?.addEventListener('click',()=>{refresh();toast('Telegram readiness rechecked')});
  $('#nightTgReport')?.addEventListener('click',report);
  $('#nightTgManifest')?.addEventListener('click',manifest);
}

function refresh(){
  const f=latest(), html=f?.content||'';state.html=html;
  const grid=$('#nightTgGrid'),score=$('#nightTgScore');if(!grid||!score)return;
  if(!html){score.textContent='—';grid.innerHTML='<div class="night-tg-empty">Generate an app to run Telegram readiness checks.</div>';caps([]);return}
  const checks=analyze(html), total=checks.reduce((n,x)=>n+x.weight,0), earned=checks.reduce((n,x)=>n+(x.pass?x.weight:0),0), pct=Math.round(earned/total*100);
  score.textContent=pct;score.dataset.level=pct>=90?'great':pct>=72?'good':'warn';
  grid.innerHTML=checks.map(x=>`<article class="night-tg-check ${x.pass?'pass':'miss'}"><i>${x.pass?'✓':'!'}</i><div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div></article>`).join('');
  caps(detectCapabilities(html));
}

function analyze(html){
  const doc=new DOMParser().parseFromString(html,'text/html'), text=String(html), buttons=[...doc.querySelectorAll('button')], imgs=[...doc.querySelectorAll('img')];
  const hasSDK=/telegram\.org\/js\/telegram-web-app\.js/i.test(text), hasReady=/Telegram\.WebApp\.ready\s*\(|\btg\??\.ready\s*\(/.test(text), hasExpand=/\.expand\s*\(/.test(text);
  return [
    ['Telegram SDK',hasSDK,'Official Web App bridge is loaded.',14],
    ['ready()',hasReady,'Signals Telegram when the interface is ready.',9],
    ['expand()',hasExpand,'Uses available Mini App viewport space.',5],
    ['Mobile viewport',!!doc.querySelector('meta[name="viewport"]'),'Responsive viewport metadata is present.',9],
    ['Document language',!!doc.documentElement.getAttribute('lang'),'Helps accessibility and browser translation.',5],
    ['Page title',!!doc.querySelector('title')?.textContent.trim(),'Provides a meaningful browser/share title.',4],
    ['No exposed secrets',!/(\b\d{7,12}:[A-Za-z0-9_-]{25,}\b|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,})/.test(text),'No obvious bot token or provider key detected.',15],
    ['No dynamic eval',!/\beval\s*\(|new\s+Function\s*\(/.test(text),'Avoids unsafe dynamic JavaScript execution.',9],
    ['Accessible images',imgs.every(x=>x.hasAttribute('alt')),'Every image has alt text.',5],
    ['Button types',buttons.every(x=>x.hasAttribute('type')),'Buttons declare their behavior inside forms.',4],
    ['Secure new tabs',[...doc.querySelectorAll('a[target="_blank"]')].every(a=>/noopener/.test(a.rel)),'New-tab links prevent opener access.',4],
    ['Theme integration',/(themeParams|--tg-theme-|colorScheme)/.test(text),'Uses Telegram theme information or variables.',6],
    ['Safe area support',/(safe-area-inset|viewportStableHeight|viewportHeight)/.test(text),'Accounts for Telegram/mobile safe viewport areas.',5],
    ['Local persistence',/(localStorage|DeviceStorage|SecureStorage|indexedDB)/.test(text),'App can retain useful local state.',3],
    ['Haptics',/(HapticFeedback|impactOccurred|notificationOccurred|selectionChanged)/.test(text),'Provides Telegram-native tactile feedback.',3]
  ].map(([title,pass,detail,weight])=>({title,pass:Boolean(pass),detail,weight}));
}

function detectCapabilities(text){
  const defs=[['MainButton',/MainButton/],['SecondaryButton',/SecondaryButton/],['BackButton',/BackButton/],['Haptics',/HapticFeedback/],['CloudStorage',/CloudStorage/],['DeviceStorage',/DeviceStorage/],['SecureStorage',/SecureStorage/],['Biometric',/BiometricManager/],['QR scanner',/showScanQrPopup/],['Clipboard',/readTextFromClipboard/],['Share',/(shareToStory|shareMessage|switchInlineQuery)/],['Invoice',/openInvoice/],['Location',/LocationManager/],['Fullscreen',/(requestFullscreen|exitFullscreen)/],['Home shortcut',/addToHomeScreen/],['Emoji status',/setEmojiStatus/],['Accelerometer',/Accelerometer/],['Gyroscope',/Gyroscope/]];
  return defs.filter(x=>x[1].test(text)).map(x=>x[0]);
}

function caps(items){const host=$('#nightTgCaps'),count=$('#nightTgCapsCount');if(!host||!count)return;count.textContent=items.length;host.innerHTML=items.length?items.map(x=>`<span>${esc(x)}</span>`).join(''):'<small>No optional Telegram capabilities detected yet.</small>'}

function report(){
  if(!state.html)return toast('Generate an app first');
  const checks=analyze(state.html), issues=auditHtml(state.html), cap=detectCapabilities(state.html), passed=checks.filter(x=>x.pass).length;
  const body=[`# AppGPT Telegram Readiness Report`,``,`App: ${S.chat?.title||'Untitled'}`,`Generated: ${new Date().toISOString()}`,`Checks: ${passed}/${checks.length}`,``,`## Readiness`,...checks.map(x=>`- ${x.pass?'PASS':'FIX'} — ${x.title}: ${x.detail}`),``,`## Telegram capabilities`,...(cap.length?cap.map(x=>`- ${x}`):['- None detected']),``,`## AppGPT audit`,...(issues.length?issues.map(x=>`- ${String(x.severity).toUpperCase()} — ${x.title}: ${x.detail}`):['- No audit issues detected'])].join('\n');
  download(`${slug(S.chat?.title||'app')}-telegram-readiness.md`,body,'text/markdown;charset=utf-8');toast('Readiness report downloaded');
}

function manifest(){
  if(!state.html)return toast('Generate an app first');
  const doc=new DOMParser().parseFromString(state.html,'text/html'), title=doc.querySelector('title')?.textContent.trim()||S.chat?.title||'Telegram Mini App';
  const data={name:title,short_name:title.slice(0,24),start_url:'./',display:'standalone',background_color:'#0b1020',theme_color:'#0b1020',description:`${title} — Telegram Mini App`};
  download('manifest.webmanifest',JSON.stringify(data,null,2),'application/manifest+json');toast('Web app manifest downloaded');
}
function slug(v){return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'app'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

// Load the nightly Template Studio as a self-contained enhancement without touching production entry points.
if(!document.querySelector('link[data-night-templates]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./night-templates.css';l.dataset.nightTemplates='true';document.head.append(l)}
import('./night-templates.js').catch(error=>console.warn('Night template studio unavailable',error));
