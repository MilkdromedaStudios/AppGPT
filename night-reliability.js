import { S, toast, download } from './app-state.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY='appgpt_reliability_v1';
const state={autoWake:true,...load()};
let installPrompt=null, registration=null, wakeLock=null, updateReady=false;
boot();

function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
function boot(attempt=0){
  if(!$('#workspaceApp')){if(attempt<120)setTimeout(()=>boot(attempt+1),50);return}
  mountStatus(); mountPanel(); wire(); registerSW(); refresh();
}
function mountStatus(){
  const head=$('#workspaceHeaderActions'); if(!head||$('#reliabilityStatus'))return;
  const b=document.createElement('button'); b.id='reliabilityStatus'; b.className='reliability-status'; b.type='button'; b.innerHTML='<i></i><span>Checking…</span>'; b.onclick=openPanel;
  const more=$('#workspaceMoreBtn'); head.insertBefore(b,more||null);
  const menu=$('#workspaceMoreMenu');
  if(menu&&!menu.querySelector('[data-reliability]')){const x=document.createElement('button');x.dataset.reliability='1';x.innerHTML='<span>◌</span>Offline & reliability';x.onclick=e=>{e.stopPropagation();menu.hidden=true;openPanel()};menu.append(x)}
}
function mountPanel(){
  if($('#reliabilityBackdrop'))return;
  const host=document.createElement('div'); host.id='reliabilityBackdrop'; host.className='reliability-backdrop'; host.hidden=true;
  host.innerHTML=`<section class="reliability-panel" role="dialog" aria-modal="true" aria-labelledby="reliabilityTitle">
  <header><div><span>RELIABILITY CENTER</span><h2 id="reliabilityTitle">Offline, storage & recovery</h2></div><button id="reliabilityClose" aria-label="Close">×</button></header>
  <div class="reliability-body">
    <div class="reliability-grid">
      ${card('relNetwork','Connection','Checking connection…')}
      ${card('relOffline','Offline shell','Checking cache…')}
      ${card('relStorage','Local storage','Calculating usage…')}
      ${card('relWake','Build protection','Wake lock ready')}
    </div>
    <section class="reliability-section"><div><strong>Offline app shell</strong><small>Cache AppGPT itself so saved chats and code remain accessible during a connection outage. AI generation still requires internet.</small></div><div class="reliability-actions"><button data-rel="check-update">Check update</button><button data-rel="test-offline">Test cache</button><button data-rel="clear-cache">Refresh offline cache</button></div></section>
    <section class="reliability-section"><div><strong>Protect long builds</strong><small>Keep the screen awake while the model is actively generating, when supported by this device.</small></div><label class="reliability-switch"><input id="relAutoWake" type="checkbox"><i></i><span>Auto wake lock</span></label></section>
    <section class="reliability-section"><div><strong>Persistent local storage</strong><small>Ask the browser not to automatically evict AppGPT's IndexedDB chats and cached shell under storage pressure.</small></div><div class="reliability-actions"><button data-rel="persist">Request persistence</button><button data-rel="estimate">Refresh usage</button></div></section>
    <section class="reliability-section"><div><strong>Install AppGPT</strong><small>Install as a standalone app when your browser supports Progressive Web Apps.</small></div><div class="reliability-actions"><button data-rel="install" id="relInstallBtn">Install app</button><button data-rel="report">Copy system report</button><button data-rel="download-report">Download report</button></div></section>
    <div id="relMessage" class="reliability-message" aria-live="polite"></div>
  </div></section>`;
  document.body.append(host); $('#reliabilityClose').onclick=closePanel; host.onclick=e=>{if(e.target===host)closePanel()};
  $('#relAutoWake').checked=state.autoWake; $('#relAutoWake').onchange=e=>{state.autoWake=e.target.checked;save();syncWake()};
  host.addEventListener('click',actions);
}
function card(id,title,text){return`<article class="reliability-card" id="${id}"><i></i><div><strong>${title}</strong><span>${text}</span></div></article>`}
function wire(){
  addEventListener('online',()=>{refreshNetwork();message('Back online. AI calls are available again.');toast('Back online')});
  addEventListener('offline',()=>{refreshNetwork();message('Offline. Saved chats and cached AppGPT tools remain available.');toast('Offline mode — saved work is still available')});
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;refreshInstall()});
  addEventListener('appinstalled',()=>{installPrompt=null;message('AppGPT installed successfully.');refreshInstall()});
  addEventListener('appgpt-progress',()=>setTimeout(syncWake,0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncWake();else releaseWake()});
  navigator.connection?.addEventListener?.('change',refreshNetwork);
  addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='o'){e.preventDefault();openPanel()}});
}
async function registerSW(){
  if(!('serviceWorker' in navigator)){setCard('relOffline','bad','Offline shell unavailable','Service workers are not supported here.');return}
  try{
    registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});
    watchRegistration(registration);
    await navigator.serviceWorker.ready;
    setCard('relOffline','ok','Offline shell ready','App shell is cached for outages.');
    refreshStorage();
  }catch(e){setCard('relOffline','bad','Offline shell failed',e.message||'Registration failed')}
}
function watchRegistration(reg){
  if(reg.waiting){updateReady=true;showUpdate()}
  reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){updateReady=true;showUpdate()}})});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{updateReady=false;message('AppGPT updated. Reloading the latest shell…');setTimeout(()=>location.reload(),350)},{once:true});
}
function showUpdate(){message('A newer AppGPT shell is ready. Use “Apply update” to reload safely.');const b=$('[data-rel="check-update"]');if(b)b.textContent='Apply update'}
async function actions(e){
  const a=e.target.closest('[data-rel]')?.dataset.rel;if(!a)return;
  if(a==='check-update'){if(updateReady&&registration?.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});return}message('Checking for an AppGPT update…');try{await registration?.update();message(updateReady?'Update ready to apply.':'You already have the latest cached shell.')}catch(x){message('Update check failed: '+x.message)}}
  if(a==='test-offline') await testCache();
  if(a==='clear-cache') await refreshCache();
  if(a==='persist') await persistStorage();
  if(a==='estimate') await refreshStorage(true);
  if(a==='install') await installApp();
  if(a==='report') await copyReport();
  if(a==='download-report') download('appgpt-system-report.json',JSON.stringify(await report(),null,2),'application/json');
}
async function testCache(){
  if(!('caches' in window)){message('Cache API is unavailable in this browser.');return}
  const required=['./index.html','./main.js','./workspace-ui.js','./styles.css']; let found=0;
  for(const path of required) if(await caches.match(path))found++;
  setCard('relOffline',found===required.length?'ok':'warn',found===required.length?'Offline shell verified':'Offline cache incomplete',`${found}/${required.length} core assets cached`);
  message(found===required.length?'Offline readiness test passed.':'Some core files are not cached yet. Refresh the offline cache while online.');
}
async function refreshCache(){
  if(!navigator.onLine){message('Reconnect before refreshing the offline cache.');return}
  message('Refreshing offline cache…');
  try{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith('appgpt-shell-')).map(n=>caches.delete(n)));await registration?.update();const reg=await navigator.serviceWorker.ready;reg.active?.postMessage({type:'CLEAR_RUNTIME'});message('Offline cache refreshed. Reload once to finish warming the newest shell.');setCard('relOffline','ok','Offline cache refreshed','Newest app shell will be used.')}catch(e){message('Could not refresh cache: '+e.message)}
}
async function persistStorage(){
  if(!navigator.storage?.persist){message('Persistent storage is not supported by this browser.');return}
  try{const granted=await navigator.storage.persist();message(granted?'Persistent storage granted. Saved chats are less likely to be evicted automatically.':'The browser did not grant persistence; AppGPT will continue using normal IndexedDB storage.');await refreshStorage()}catch(e){message('Persistence request failed: '+e.message)}
}
async function refreshStorage(announce=false){
  try{const est=await navigator.storage?.estimate?.();const used=est?.usage||0, quota=est?.quota||0,pct=quota?used/quota*100:0;const persisted=await navigator.storage?.persisted?.();setCard('relStorage',pct>85?'warn':'ok',formatBytes(used)+' used',`${pct.toFixed(1)}% of ${formatBytes(quota)}${persisted?' · persistent':''}`);if(announce)message(`Local browser storage: ${formatBytes(used)} used of ${formatBytes(quota)}.`)}catch{setCard('relStorage','warn','Usage unavailable','Browser did not expose storage estimates.')}
}
function refreshNetwork(){const c=navigator.connection;const online=navigator.onLine;let detail=online?'AI calls available':'Cached workspace only';if(online&&c){const bits=[];if(c.effectiveType)bits.push(c.effectiveType);if(Number.isFinite(c.downlink))bits.push(`${c.downlink} Mb/s`);if(Number.isFinite(c.rtt))bits.push(`${c.rtt} ms RTT`);if(bits.length)detail=bits.join(' · ')}setCard('relNetwork',online?'ok':'bad',online?'Online':'Offline',detail);const b=$('#reliabilityStatus');if(b){b.classList.toggle('offline',!online);b.querySelector('span').textContent=online?'Online':'Offline'}}
async function syncWake(){
  const active=!!S.busy; if(!state.autoWake||!active||document.visibilityState!=='visible'){if(!active)releaseWake();refreshWake();return}
  if(!('wakeLock' in navigator)){refreshWake('unsupported');return}
  if(wakeLock)return;
  try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;refreshWake()});refreshWake()}catch{refreshWake('blocked')}
}
async function releaseWake(){try{await wakeLock?.release()}catch{}wakeLock=null;refreshWake()}
function refreshWake(reason=''){let title='Auto protection ready',detail=state.autoWake?'Activates during AI generation':'Disabled';let kind='ok';if(reason==='unsupported'){title='Wake lock unavailable';detail='This browser does not support screen wake lock.';kind='warn'}else if(reason==='blocked'){title='Wake lock blocked';detail='The browser denied the request.';kind='warn'}else if(wakeLock){title='Screen kept awake';detail='Active while the current AI request runs.'}setCard('relWake',kind,title,detail)}
async function installApp(){if(installPrompt){installPrompt.prompt();const r=await installPrompt.userChoice;message(r.outcome==='accepted'?'Install accepted.':'Install dismissed.');installPrompt=null;refreshInstall();return}if(matchMedia('(display-mode: standalone)').matches){message('AppGPT is already running as an installed app.');return}message('Install is not currently offered by this browser. You can still use the browser’s “Install app” / “Add to Home Screen” command if available.')}
function refreshInstall(){const b=$('#relInstallBtn');if(!b)return;b.disabled=!installPrompt&&matchMedia('(display-mode: standalone)').matches;b.textContent=matchMedia('(display-mode: standalone)').matches?'Installed':installPrompt?'Install AppGPT':'Install instructions'}
async function report(){const est=await navigator.storage?.estimate?.().catch?.(()=>null)||null;return{generatedAt:new Date().toISOString(),online:navigator.onLine,connection:navigator.connection?{effectiveType:navigator.connection.effectiveType,downlink:navigator.connection.downlink,rtt:navigator.connection.rtt,saveData:navigator.connection.saveData}:null,serviceWorker:{supported:'serviceWorker'in navigator,controlled:!!navigator.serviceWorker?.controller,updateReady},storage:est?{usage:est.usage,quota:est.quota,persisted:await navigator.storage?.persisted?.()}:null,wakeLock:{supported:'wakeLock'in navigator,auto:state.autoWake,active:!!wakeLock},installed:matchMedia('(display-mode: standalone)').matches,userAgent:navigator.userAgent}}
async function copyReport(){try{await navigator.clipboard.writeText(JSON.stringify(await report(),null,2));message('System report copied. It contains device/browser capability data but no API keys or chat contents.')}catch{message('Clipboard access was blocked. Use Download report instead.')}}
function setCard(id,kind,title,detail){const c=$('#'+id);if(!c)return;c.dataset.state=kind;c.querySelector('strong').textContent=title;c.querySelector('span').textContent=detail}
function message(text){const x=$('#relMessage');if(x)x.textContent=text}
function refresh(){refreshNetwork();refreshStorage();refreshWake();refreshInstall()}
function openPanel(){$('#reliabilityBackdrop').hidden=false;document.body.classList.add('night-modal-open');refresh();setTimeout(()=>$('#reliabilityClose')?.focus(),0)}
function closePanel(){$('#reliabilityBackdrop').hidden=true;document.body.classList.remove('night-modal-open')}
function formatBytes(n=0){if(!Number.isFinite(n)||n<=0)return'0 B';const u=['B','KB','MB','GB'],i=Math.min(u.length-1,Math.floor(Math.log(n)/Math.log(1024)));return`${(n/1024**i).toFixed(i?1:0)} ${u[i]}`}
