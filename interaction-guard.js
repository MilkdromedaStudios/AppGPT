const $=s=>document.querySelector(s);
const OPERA_RECOVERY_KEY='appgpt_opera_recovery_20260820_v1';

start();

async function start(){
  if(isOpera()){
    const reloading=await repairOperaCache();
    if(reloading)return;
  }
  boot();
}

function isOpera(){
  return /\bOPR\//.test(navigator.userAgent||'') || /Opera/i.test(navigator.userAgent||'');
}

async function repairOperaCache(){
  try{
    if(sessionStorage.getItem(OPERA_RECOVERY_KEY)==='done')return false;
    sessionStorage.setItem(OPERA_RECOVERY_KEY,'done');

    let changed=false;
    const appRoot=new URL('./',location.href).href;

    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){
        if(reg.scope.startsWith(appRoot)||appRoot.startsWith(reg.scope)){
          try{changed=(await reg.unregister())||changed}catch{}
        }
      }
    }

    if('caches' in window){
      const keys=await caches.keys();
      for(const key of keys){
        if(key.startsWith('appgpt-shell-')){
          try{changed=(await caches.delete(key))||changed}catch{}
        }
      }
    }

    // Opera GX can keep a page in its back/forward cache even after the
    // service worker is removed. A one-time cache-busting navigation makes
    // the next document and modules come directly from GitHub Pages.
    if(changed||navigator.serviceWorker?.controller){
      const url=new URL(location.href);
      url.searchParams.set('_appgpt_fresh',Date.now().toString());
      location.replace(url.toString());
      return true;
    }
  }catch(error){
    console.warn('AppGPT Opera cache recovery skipped',error);
  }
  return false;
}

function boot(){
  const style=document.createElement('style');
  style.textContent=`
    [hidden]{display:none!important;pointer-events:none!important}
    button,.workspace-tab,.nav-item{touch-action:manipulation}
    button.appgpt-pressed,.workspace-tab.appgpt-pressed{transform:scale(.97)!important;opacity:.86}
  `;
  document.head.append(style);

  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button,[role="button"],.workspace-tab');
    if(!b||b.disabled)return;
    b.classList.add('appgpt-pressed');
    setTimeout(()=>b.classList.remove('appgpt-pressed'),180);
  },true);

  document.addEventListener('pointercancel',clearPressed,true);
  document.addEventListener('pointerup',clearPressed,true);

  setInterval(clearStaleLayers,1200);
  addEventListener('pageshow',e=>{
    clearStaleLayers();
    // BFCache restores can preserve stale open/closed states in Chromium.
    if(e.persisted)setTimeout(clearStaleLayers,0);
  });
  addEventListener('focus',clearStaleLayers);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')clearStaleLayers()});
}

function clearPressed(){
  document.querySelectorAll('.appgpt-pressed').forEach(x=>x.classList.remove('appgpt-pressed'));
}

function clearStaleLayers(){
  const utility=$('#workspaceUtility');
  const utilityScrim=$('#workspaceUtilityScrim');
  if(utilityScrim&&!utility?.classList.contains('open')) utilityScrim.hidden=true;

  const sidebar=$('#workspaceSidebar');
  const sidebarScrim=$('#workspaceSidebarScrim');
  if(sidebarScrim&&!sidebar?.classList.contains('open')) sidebarScrim.hidden=true;

  const more=$('#workspaceMoreMenu');
  if(more&&!$('#workspaceMoreBtn')) more.hidden=true;

  const palette=$('#nightPalette');
  if(palette&&!palette.querySelector('.night-palette')) palette.hidden=true;

  const reliability=$('#reliabilityBackdrop');
  if(reliability&&!reliability.querySelector('.reliability-panel')) reliability.hidden=true;
}
