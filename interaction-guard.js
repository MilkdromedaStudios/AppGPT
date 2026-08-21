const $=s=>document.querySelector(s);

boot();

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
  addEventListener('pageshow',clearStaleLayers);
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
