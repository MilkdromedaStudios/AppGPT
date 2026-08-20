import { BUILTIN_TEMPLATES, validateTemplate } from './templates.js';
import { listCustomTemplates, saveCustomTemplate } from './storage.js';
import { toast } from './app-state.js';

const FAVORITES_KEY='appgpt_template_favorites_v1';
const USAGE_KEY='appgpt_template_usage_v1';
const PREFS_KEY='appgpt_template_library_prefs_v1';
const $=s=>document.querySelector(s);
let favorites=read(FAVORITES_KEY,[]);
let usage=read(USAGE_KEY,{});
let prefs=read(PREFS_KEY,{category:'all',favorites:false,sort:'default'});
let enhancing=false;

requestAnimationFrame(waitForLibrary);

function waitForLibrary(){
  const grid=$('#templateGrid');
  if(!grid){setTimeout(waitForLibrary,120);return}
  mountToolbar();
  mountCreator();
  grid.addEventListener('click',onGridClick,true);
  new MutationObserver(()=>enhance()).observe(grid,{childList:true,subtree:true});
  enhance();
}

function mountToolbar(){
  if($('#nightTemplateTools'))return;
  const grid=$('#templateGrid');
  const bar=document.createElement('div');
  bar.id='nightTemplateTools';
  bar.className='night-template-tools';
  bar.innerHTML=`
    <div class="night-template-toolrow">
      <label><span>Category</span><select id="nightTemplateCategory"><option value="all">All categories</option></select></label>
      <label><span>Sort</span><select id="nightTemplateSort"><option value="default">Recommended</option><option value="recent">Recently used</option><option value="used">Most used</option><option value="name">A → Z</option></select></label>
      <button id="nightTemplateFavorites" class="night-template-toggle" type="button" aria-pressed="false">☆ Favorites</button>
      <button id="nightTemplateSurprise" class="night-template-action" type="button">🎲 Surprise me</button>
      <button id="nightTemplateCreate" class="night-template-action primary" type="button">＋ New template</button>
    </div>
    <div class="night-template-summary" id="nightTemplateSummary"></div>`;
  grid.before(bar);
  $('#nightTemplateCategory').value=prefs.category||'all';
  $('#nightTemplateSort').value=prefs.sort||'default';
  $('#nightTemplateFavorites').setAttribute('aria-pressed',String(Boolean(prefs.favorites)));
  $('#nightTemplateFavorites').classList.toggle('active',Boolean(prefs.favorites));
  $('#nightTemplateCategory').onchange=e=>{prefs.category=e.target.value;savePrefs();enhance()};
  $('#nightTemplateSort').onchange=e=>{prefs.sort=e.target.value;savePrefs();enhance()};
  $('#nightTemplateFavorites').onclick=()=>{prefs.favorites=!prefs.favorites;savePrefs();const b=$('#nightTemplateFavorites');b.setAttribute('aria-pressed',String(prefs.favorites));b.classList.toggle('active',prefs.favorites);enhance()};
  $('#nightTemplateSurprise').onclick=surprise;
  $('#nightTemplateCreate').onclick=()=>openCreator();
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='t'){e.preventDefault();openCreator()}});
}

function mountCreator(){
  if($('#nightTemplateModal'))return;
  const modal=document.createElement('div');
  modal.id='nightTemplateModal';
  modal.className='night-template-modal';
  modal.hidden=true;
  modal.innerHTML=`<div class="night-template-dialog" role="dialog" aria-modal="true" aria-labelledby="nightTemplateDialogTitle">
    <div class="night-template-dialog-head"><div><span>PERSONAL TEMPLATE</span><strong id="nightTemplateDialogTitle">Create reusable template</strong></div><button id="nightTemplateClose" type="button" aria-label="Close">×</button></div>
    <div class="night-template-form">
      <label>Name<input id="nightTemplateName" maxlength="80" placeholder="My awesome app"></label>
      <label>Emoji<input id="nightTemplateEmoji" maxlength="8" value="✨"></label>
      <label>Category<input id="nightTemplateNewCategory" maxlength="40" placeholder="Utilities"></label>
      <label>Visual style<select id="nightTemplateStyle"><option>Telegram native</option><option>Modern glass</option><option>Minimal clean</option><option>Playful colorful</option><option>Futuristic dark</option></select></label>
      <label class="wide">Short description<input id="nightTemplateDescription" maxlength="220" placeholder="What makes this starter useful?"></label>
      <label class="wide">Build instructions<textarea id="nightTemplatePrompt" rows="8" maxlength="6000" placeholder="Build a Telegram Mini App that..."></textarea></label>
    </div>
    <div class="night-template-dialog-foot"><span>Tip: Ctrl/Cmd + Shift + T opens this creator.</span><div><button id="nightTemplateCancel" type="button">Cancel</button><button id="nightTemplateSave" class="primary" type="button">Save template</button></div></div>
  </div>`;
  document.body.append(modal);
  $('#nightTemplateClose').onclick=closeCreator;
  $('#nightTemplateCancel').onclick=closeCreator;
  modal.onclick=e=>{if(e.target===modal)closeCreator()};
  $('#nightTemplateSave').onclick=saveCreator;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeCreator()});
}

async function allTemplates(){return [...await listCustomTemplates(),...BUILTIN_TEMPLATES]}

async function enhance(){
  if(enhancing)return;
  enhancing=true;
  try{
    const all=await allTemplates();
    populateCategories(all);
    const byId=new Map(all.map(x=>[x.id,x]));
    const cards=[...document.querySelectorAll('#templateGrid .template-card')];
    cards.forEach(card=>{
      const id=card.querySelector('[data-template][data-id]')?.dataset.id;
      if(!id)return;
      card.dataset.templateId=id;
      const t=byId.get(id);
      if(t)card.dataset.category=t.category||'Other';
      let tools=card.querySelector('.night-template-card-tools');
      if(!tools){
        tools=document.createElement('div');
        tools.className='night-template-card-tools';
        tools.innerHTML=`<button type="button" data-night-template="favorite" title="Favorite" aria-label="Favorite template">☆</button><button type="button" data-night-template="copy" title="Copy prompt" aria-label="Copy template prompt">⧉</button><button type="button" data-night-template="duplicate" title="Duplicate" aria-label="Duplicate template">＋</button>`;
        card.append(tools);
      }
      const fav=favorites.includes(id);
      const star=tools.querySelector('[data-night-template="favorite"]');
      star.textContent=fav?'★':'☆';star.classList.toggle('active',fav);star.setAttribute('aria-pressed',String(fav));
      const u=usage[id];
      let meta=card.querySelector('.night-template-use-meta');
      if(u?.count){if(!meta){meta=document.createElement('span');meta.className='night-template-use-meta';card.append(meta)}meta.textContent=`Used ${u.count}×`}
      else meta?.remove();
    });
    applyFilterAndSort(cards);
    updateSummary(cards,all.length);
  }finally{enhancing=false}
}

function populateCategories(all){
  const sel=$('#nightTemplateCategory');if(!sel)return;
  const current=prefs.category||'all';
  const cats=[...new Set(all.map(x=>x.category||'Other'))].sort((a,b)=>a.localeCompare(b));
  sel.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option value="${escAttr(c)}">${esc(c)}</option>`).join('');
  sel.value=cats.includes(current)?current:'all';
  if(sel.value!==current){prefs.category='all';savePrefs()}
}

function applyFilterAndSort(cards){
  const q=$('#templateSearch')?.value.trim().toLowerCase()||'';
  cards.forEach(card=>{
    const id=card.dataset.templateId||'';
    const category=card.dataset.category||'';
    const visible=(!prefs.favorites||favorites.includes(id))&&(prefs.category==='all'||category===prefs.category)&&(!q||card.textContent.toLowerCase().includes(q));
    card.hidden=!visible;
  });
  const grid=$('#templateGrid');
  const sorted=[...cards].sort((a,b)=>compareCards(a,b));
  sorted.forEach(x=>grid.append(x));
}

function compareCards(a,b){
  const ai=a.dataset.templateId||'',bi=b.dataset.templateId||'';
  const au=usage[ai]||{},bu=usage[bi]||{};
  if(prefs.sort==='recent')return (bu.last||0)-(au.last||0)||text(a).localeCompare(text(b));
  if(prefs.sort==='used')return (bu.count||0)-(au.count||0)||text(a).localeCompare(text(b));
  if(prefs.sort==='name')return text(a).localeCompare(text(b));
  return 0;
}
function text(card){return card.querySelector('strong')?.textContent||''}

async function onGridClick(e){
  const extra=e.target.closest('[data-night-template]');
  if(extra){e.preventDefault();e.stopPropagation();const card=extra.closest('.template-card'),id=card?.dataset.templateId;if(!id)return;const all=await allTemplates(),t=all.find(x=>x.id===id);if(!t)return;
    if(extra.dataset.nightTemplate==='favorite'){toggleFavorite(id);enhance();return}
    if(extra.dataset.nightTemplate==='copy'){try{await navigator.clipboard.writeText(t.prompt);toast('Template prompt copied')}catch{toast('Clipboard access was blocked')}return}
    if(extra.dataset.nightTemplate==='duplicate'){await duplicateTemplate(t);return}
  }
  const use=e.target.closest('[data-template="use"]');
  if(use){const id=use.dataset.id;usage[id]={count:(usage[id]?.count||0)+1,last:Date.now()};write(USAGE_KEY,usage)}
}

function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write(FAVORITES_KEY,favorites);toast(favorites.includes(id)?'Added to favorites':'Removed from favorites')}

async function duplicateTemplate(t){
  const copy=validateTemplate({...t,id:`custom-${crypto.randomUUID?.()||Date.now()}`,name:`${t.name} Copy`,custom:true});
  await saveCustomTemplate(copy);refreshBaseLibrary();toast('Template duplicated')
}

async function surprise(){
  const all=await allTemplates();
  const eligible=all.filter(t=>(prefs.category==='all'||t.category===prefs.category)&&(!prefs.favorites||favorites.includes(t.id)));
  if(!eligible.length){toast('No templates match this filter');return}
  const t=eligible[Math.floor(Math.random()*eligible.length)];
  const card=[...document.querySelectorAll('#templateGrid .template-card')].find(x=>x.dataset.templateId===t.id);
  if(card){card.hidden=false;card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('night-template-picked');setTimeout(()=>card.classList.remove('night-template-picked'),900)}
  setTimeout(()=>card?.querySelector('[data-template="use"]')?.focus(),350);
  toast(`Try ${t.emoji||'✦'} ${t.name}`)
}

function openCreator(seed=null){
  const modal=$('#nightTemplateModal');modal.hidden=false;document.body.classList.add('night-template-modal-open');
  $('#nightTemplateName').value=seed?.name||'';$('#nightTemplateEmoji').value=seed?.emoji||'✨';$('#nightTemplateNewCategory').value=seed?.category||'Custom';$('#nightTemplateStyle').value=seed?.style||'Telegram native';$('#nightTemplateDescription').value=seed?.description||'';$('#nightTemplatePrompt').value=seed?.prompt||'';setTimeout(()=>$('#nightTemplateName').focus(),30)
}
function closeCreator(){$('#nightTemplateModal').hidden=true;document.body.classList.remove('night-template-modal-open')}
async function saveCreator(){
  try{
    const t=validateTemplate({name:$('#nightTemplateName').value,emoji:$('#nightTemplateEmoji').value,category:$('#nightTemplateNewCategory').value,style:$('#nightTemplateStyle').value,description:$('#nightTemplateDescription').value,prompt:$('#nightTemplatePrompt').value});
    await saveCustomTemplate(t);closeCreator();refreshBaseLibrary();toast('Reusable template saved')
  }catch(e){toast(e.message||'Could not save template')}
}
function refreshBaseLibrary(){const s=$('#templateSearch');if(s)s.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(enhance,80)}
function updateSummary(cards,total){const visible=cards.filter(x=>!x.hidden).length;const fav=favorites.length;const uses=Object.values(usage).reduce((n,x)=>n+(x.count||0),0);const el=$('#nightTemplateSummary');if(el)el.innerHTML=`<span><b>${visible}</b> shown / ${total} total</span><span><b>${fav}</b> favorites</span><span><b>${uses}</b> launches</span>`}
function savePrefs(){write(PREFS_KEY,prefs)}
function read(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escAttr(v=''){return esc(v)}
