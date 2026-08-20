import { PROVIDERS } from './providers.js';
import { toast } from './app-state.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY='appgpt_provider_toolbox_v1';
const state=load();
requestAnimationFrame(init);

function init(){
  const settings=$('#view-settings .settings-card');
  const provider=$('#providerSelect'), model=$('#modelInput'), base=$('#baseUrlInput'), key=$('#apiKeyInput');
  if(!settings||!provider||!model||!base||!key||$('#providerToolbox')) return;
  const box=document.createElement('section');
  box.id='providerToolbox'; box.className='provider-toolbox';
  box.innerHTML=`
    <div class="provider-toolbox-head"><div><p class="kicker">PROVIDER TOOLBOX</p><h3>Profiles & model shortcuts</h3></div><div class="provider-toolbox-actions"><button data-pt="export">Export</button><label class="provider-import">Import<input data-pt-file type="file" accept="application/json,.json"></label></div></div>
    <div class="provider-health" id="providerHealth"></div>
    <div class="provider-profile-row"><select id="providerProfileSelect"><option value="">Saved profile…</option></select><input id="providerProfileName" maxlength="40" placeholder="Profile name"><button data-pt="save-profile">Save</button><button data-pt="load-profile">Load</button><button data-pt="delete-profile">Delete</button></div>
    <div class="provider-model-tools">
      <div class="provider-tool-line"><strong>Favorite models</strong><button data-pt="favorite">☆ Save current</button></div><div id="providerFavorites" class="provider-chips"></div>
      <div class="provider-tool-line"><strong>Recent models</strong><button data-pt="clear-recents">Clear</button></div><div id="providerRecents" class="provider-chips"></div>
      <div id="providerRouting" class="provider-routing" hidden><span>Hugging Face routing</span><button data-route="fastest">:fastest</button><button data-route="cheapest">:cheapest</button><button data-route="preferred">:preferred</button><button data-route="none">No suffix</button></div>
    </div>
    <div class="provider-test-row"><button data-pt="latency">⚡ Test connection + latency</button><span id="providerLatency">Not tested</span></div>`;
  settings.append(box);

  box.addEventListener('click',onClick);
  box.querySelector('[data-pt-file]').addEventListener('change',importProfiles);
  provider.addEventListener('change',()=>{rememberModel();render()});
  model.addEventListener('change',()=>{rememberModel();render()});
  model.addEventListener('blur',()=>{rememberModel();render()});
  base.addEventListener('input',renderHealth);
  key.addEventListener('input',renderHealth);
  new MutationObserver(renderHealth).observe($('#providerStatus'),{childList:true,subtree:true,characterData:true});
  render();
}

function load(){
  try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function ensure(){state.profiles ||= []; state.favorites ||= {}; state.recents ||= {};}
function current(){
  const p=$('#providerSelect')?.value||'custom';
  return {provider:p,model:$('#modelInput')?.value.trim()||'',baseUrl:$('#baseUrlInput')?.value.trim()||''};
}
function render(){ensure();renderProfiles();renderModels();renderHealth();}
function renderProfiles(){
  const s=$('#providerProfileSelect'); if(!s)return;
  const value=s.value;
  s.innerHTML='<option value="">Saved profile…</option>'+state.profiles.map((p,i)=>`<option value="${i}">${esc(p.name)} · ${esc(PROVIDERS[p.provider]?.name||p.provider)}</option>`).join('');
  if(value && state.profiles[+value]) s.value=value;
}
function renderModels(){
  const p=$('#providerSelect')?.value||'';
  const favorites=state.favorites[p]||[], recents=state.recents[p]||[];
  renderChips('#providerFavorites',favorites,'favorite-model');
  renderChips('#providerRecents',recents,'recent-model');
  $('#providerRouting').hidden=p!=='huggingface';
}
function renderChips(sel,items,type){
  const h=$(sel); if(!h)return;
  h.innerHTML=items.length?items.map(x=>`<button title="Use ${esc(x)}" data-model-kind="${type}" data-model="${attr(x)}">${esc(short(x))}</button>`).join(''):'<span class="provider-empty">None yet</span>';
}
function renderHealth(){
  const h=$('#providerHealth');if(!h)return;
  const c=current(), def=PROVIDERS[c.provider]||{};
  let urlOk=false;try{const u=new URL(c.baseUrl);urlOk=/^https?:$/.test(u.protocol)}catch{}
  const key=$('#apiKeyInput')?.value.trim()||'';
  const items=[
    [!!c.model,'Model',c.model||'Missing'],
    [urlOk,'Endpoint',urlOk?'Valid URL':'Check URL'],
    [!!key,'API key',key?'Present':'Missing'],
    [def.vision!==false,'Vision',def.vision===false?'Text only':'Supported'],
  ];
  h.innerHTML=items.map(([ok,name,val])=>`<span class="provider-health-item ${ok?'ok':'warn'}"><i></i><b>${name}</b><em>${esc(val)}</em></span>`).join('');
}
function rememberModel(){
  ensure(); const {provider,model}=current(); if(!provider||!model)return;
  const arr=state.recents[provider]||[]; state.recents[provider]=[model,...arr.filter(x=>x!==model)].slice(0,8);save();
}
function onClick(e){
  const modelBtn=e.target.closest('[data-model]');
  if(modelBtn){setModel(modelBtn.dataset.model);return;}
  const route=e.target.closest('[data-route]');
  if(route){routeModel(route.dataset.route);return;}
  const a=e.target.closest('[data-pt]')?.dataset.pt;if(!a)return;
  if(a==='save-profile')saveProfile();
  if(a==='load-profile')loadProfile();
  if(a==='delete-profile')deleteProfile();
  if(a==='favorite')favorite();
  if(a==='clear-recents')clearRecents();
  if(a==='export')exportProfiles();
  if(a==='latency')latencyTest();
}
function setModel(v){
  const m=$('#modelInput');if(!m)return;m.value=v;m.dispatchEvent(new Event('change',{bubbles:true}));m.focus();toast(`Model set to ${short(v)}`);
}
function routeModel(route){
  const m=$('#modelInput');if(!m)return;
  const raw=m.value.trim().replace(/:(fastest|cheapest|preferred)$/,'');
  m.value=route==='none'?raw:`${raw}:${route}`;m.dispatchEvent(new Event('change',{bubbles:true}));
}
function saveProfile(){
  ensure();const name=$('#providerProfileName')?.value.trim();if(!name)return toast('Name this provider profile first.');
  const c=current();if(!c.model||!c.baseUrl)return toast('Choose a model and endpoint first.');
  const item={name,...c,updatedAt:new Date().toISOString()};
  const i=state.profiles.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
  if(i>=0)state.profiles[i]=item;else state.profiles.unshift(item);
  state.profiles=state.profiles.slice(0,20);save();renderProfiles();toast(`Saved provider profile “${name}”`);
}
function loadProfile(){
  ensure();const i=+($('#providerProfileSelect')?.value);const p=state.profiles[i];if(!p)return toast('Choose a saved profile.');
  const ps=$('#providerSelect');ps.value=p.provider;ps.dispatchEvent(new Event('change',{bubbles:true}));
  setTimeout(()=>{const m=$('#modelInput'),b=$('#baseUrlInput');m.value=p.model;b.value=p.baseUrl;m.dispatchEvent(new Event('change',{bubbles:true}));b.dispatchEvent(new Event('input',{bubbles:true}));$('#providerProfileName').value=p.name;render();},0);
  toast(`Loaded “${p.name}”`);
}
function deleteProfile(){
  ensure();const s=$('#providerProfileSelect'),i=+s.value;if(!s.value||!state.profiles[i])return toast('Choose a saved profile.');
  const name=state.profiles[i].name;state.profiles.splice(i,1);save();renderProfiles();toast(`Deleted “${name}”`);
}
function favorite(){
  ensure();const {provider,model}=current();if(!model)return toast('Enter a model first.');
  const a=state.favorites[provider]||[];
  state.favorites[provider]=a.includes(model)?a.filter(x=>x!==model):[model,...a].slice(0,12);save();renderModels();toast(a.includes(model)?'Removed from favorites':'Model saved to favorites');
}
function clearRecents(){ensure();state.recents[current().provider]=[];save();renderModels();}
async function latencyTest(){
  const btn=$('#testProviderBtn'),status=$('#providerStatus'),out=$('#providerLatency');if(!btn||!status||!out)return;
  out.textContent='Testing…';const start=performance.now();let done=false;
  const obs=new MutationObserver(()=>{const t=status.textContent.trim();if(!t||done)return;done=true;obs.disconnect();const ms=Math.round(performance.now()-start);out.textContent=`${ms} ms · ${t}`;out.dataset.state=status.classList.contains('ok')?'ok':'error';});
  obs.observe(status,{childList:true,subtree:true,characterData:true});btn.click();
  setTimeout(()=>{if(!done){done=true;obs.disconnect();out.textContent='No result after 30s';out.dataset.state='error'}},30000);
}
function exportProfiles(){
  ensure();const blob=new Blob([JSON.stringify({type:'appgpt-provider-profiles',version:1,profiles:state.profiles,favorites:state.favorites},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='appgpt-provider-profiles.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importProfiles(e){
  const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.type!=='appgpt-provider-profiles'||!Array.isArray(d.profiles))throw new Error('Not an AppGPT provider profile file');ensure();
    const by=new Map(state.profiles.map(x=>[x.name.toLowerCase(),x]));d.profiles.forEach(x=>{if(x?.name&&x?.provider&&x?.model&&x?.baseUrl)by.set(String(x.name).toLowerCase(),x)});state.profiles=[...by.values()].slice(0,20);
    for(const [p,list] of Object.entries(d.favorites||{})){state.favorites[p]=[...(state.favorites[p]||[]),...list].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,12)}save();render();toast('Provider profiles imported');
  }catch(x){toast(x.message||'Could not import profiles')}finally{e.target.value=''}
}
function short(v){return v.length>30?'…'+v.slice(-29):v}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attr(v=''){return esc(v)}
