import{S,latest,toast,slug,download,id}from'./app-state.js';
import{saveChat}from'./storage.js';
import{publishFilesToGithubPages}from'./github-publish.js';

const KEY='appgpt_deploy_profiles_v1',HISTORY='appgpt_publish_history_v1';
const $=s=>document.querySelector(s);
const state={chat:'',busy:false};
requestAnimationFrame(()=>boot(0));

function boot(n){
  const host=$('#view-publish .publish-card');
  if(!host){if(n<80)setTimeout(()=>boot(n+1),80);return;}
  if($('#nightDeployKit'))return;
  const panel=document.createElement('section');
  panel.id='nightDeployKit';
  panel.className='night-deploy panel glass';
  panel.innerHTML=`
    <div class="night-deploy-head"><div><p class="kicker">DEPLOYMENT KIT</p><h2>Ship a complete Mini App</h2><p>Preflight the current build, create web metadata, publish a Pages-ready bundle, and generate the Telegram launch URL.</p></div><span class="pill" id="nightDeployBadge">Not checked</span></div>
    <div class="night-deploy-grid">
      <label>App title<input id="nightDeployTitle" maxlength="80"></label>
      <label>Theme color<input id="nightDeployColor" type="color" value="#6657e8"></label>
      <label class="night-wide">Description<input id="nightDeployDescription" maxlength="180" placeholder="A Telegram Mini App built with AppGPT"></label>
      <label>Bot username<input id="nightDeployBot" placeholder="my_bot"></label>
      <label>Start parameter<input id="nightDeployStart" maxlength="128" placeholder="app"></label>
    </div>
    <div class="night-deploy-actions">
      <button class="ghost-btn" id="nightDeploySync">↻ Sync from chat</button>
      <button class="ghost-btn" id="nightDeployCheck">✓ Run preflight</button>
      <button class="primary-btn" id="nightDeployPublish">↗ Publish full kit</button>
    </div>
    <div class="night-deploy-checks" id="nightDeployChecks"></div>
    <div class="night-deploy-files">
      <div><strong>Generated deployment files</strong><span>Published versions are generated from the current artifact without overwriting your saved source.</span></div>
      <div class="night-deploy-file-actions">
        <button class="ghost-btn" data-deploy-download="manifest">Manifest</button>
        <button class="ghost-btn" data-deploy-download="readme">README</button>
        <button class="ghost-btn" data-deploy-download="404">404 fallback</button>
        <button class="ghost-btn" data-deploy-download="meta">Deploy JSON</button>
      </div>
    </div>
    <div class="night-launch-card">
      <div><strong>Telegram launch link</strong><span id="nightLaunchUrl">Add a bot username to generate a launch link.</span></div>
      <div><button class="ghost-btn" id="nightLaunchCopy">Copy</button><button class="ghost-btn" id="nightLaunchOpen">Open</button></div>
    </div>
    <div class="night-publish-result" id="nightPublishResult" hidden></div>`;
  host.insertAdjacentElement('afterend',panel);
  wire();sync(true);
}

function wire(){
  ['nightDeployTitle','nightDeployDescription','nightDeployColor','nightDeployBot','nightDeployStart'].forEach(x=>$('#'+x).addEventListener('input',()=>{saveProfile();renderLaunch();renderChecks(false)}));
  $('#nightDeploySync').onclick=()=>syncFromChat(true);
  $('#nightDeployCheck').onclick=()=>renderChecks(true);
  $('#nightDeployPublish').onclick=publishKit;
  $('#nightLaunchCopy').onclick=()=>copy(launchUrl(),'Launch link copied');
  $('#nightLaunchOpen').onclick=()=>{const u=launchUrl();if(!u)return toast('Add a valid bot username first.');window.open(u,'_blank','noopener,noreferrer')};
  $('#nightDeployKit').addEventListener('click',e=>{const k=e.target.closest('[data-deploy-download]')?.dataset.deployDownload;if(k)downloadAsset(k)});
  window.addEventListener('appgpt-chat-changed',()=>sync(false));
  const status=$('#githubStatus');if(status)new MutationObserver(renderPublished).observe(status,{childList:true,subtree:true,characterData:true});
}

function sync(force){
  const cid=S.chat?.id||'';
  if(cid!==state.chat||force){state.chat=cid;loadProfile();}
  renderLaunch();renderChecks(false);renderPublished();
}

function profile(){return{
  title:$('#nightDeployTitle').value.trim(),description:$('#nightDeployDescription').value.trim(),color:$('#nightDeployColor').value||'#6657e8',bot:cleanBot($('#nightDeployBot').value),start:cleanStart($('#nightDeployStart').value)
}}
function profiles(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return{}}}
function saveProfile(){if(!S.chat?.id)return;const all=profiles();all[S.chat.id]=profile();try{localStorage.setItem(KEY,JSON.stringify(all))}catch{}}
function loadProfile(){
  const p=S.chat?.id?profiles()[S.chat.id]:null;
  const title=S.chat?.project?.name||S.chat?.title||'Telegram Mini App';
  $('#nightDeployTitle').value=p?.title||title;
  $('#nightDeployDescription').value=p?.description||`${title} — Telegram Mini App created with AppGPT`;
  $('#nightDeployColor').value=/^#[0-9a-f]{6}$/i.test(p?.color||'')?p.color:'#6657e8';
  $('#nightDeployBot').value=p?.bot||'';$('#nightDeployStart').value=p?.start||slug(title).slice(0,64);
}
function syncFromChat(notify){
  const title=S.chat?.project?.name||S.chat?.title||'Telegram Mini App';
  $('#nightDeployTitle').value=title;$('#nightDeployDescription').value=`${title} — Telegram Mini App created with AppGPT`;$('#nightDeployStart').value=slug(title).slice(0,64);saveProfile();renderLaunch();renderChecks(false);if(notify)toast('Deployment details synced from this chat');
}

function assets(){
  const a=latest(),p=profile(),source=a?.content||'';
  const manifest=JSON.stringify({name:p.title||'Telegram Mini App',short_name:(p.title||'Mini App').slice(0,24),description:p.description,start_url:'./',scope:'./',display:'standalone',background_color:p.color,theme_color:p.color},null,2);
  const html=deployHtml(source,p.color);
  const readme=`# ${p.title||'Telegram Mini App'}\n\n${p.description||'Telegram Mini App generated with AppGPT.'}\n\n## Launch\n\n${launchUrl()||'Open the GitHub Pages URL after publishing.'}\n\n## Files\n\n- \`index.html\` — generated Mini App\n- \`manifest.webmanifest\` — install/display metadata\n- \`404.html\` — Pages fallback\n\nGenerated and deployed with AppGPT.\n`;
  return{html,manifest,readme,fallback:html,meta:JSON.stringify({app:p,chatId:S.chat?.id||null,artifactVersion:a?.version||null,generatedAt:new Date().toISOString(),launchUrl:launchUrl()||null},null,2)};
}
function deployHtml(source,color){
  let html=String(source||'');if(!html)return'';
  if(/<meta[^>]+name=["']theme-color["']/i.test(html))html=html.replace(/<meta[^>]+name=["']theme-color["'][^>]*>/i,`<meta name="theme-color" content="${color}">`);else html=html.replace(/<head([^>]*)>/i,`<head$1>\n<meta name="theme-color" content="${color}">`);
  if(!/<link[^>]+rel=["']manifest["']/i.test(html))html=html.replace(/<\/head>/i,'<link rel="manifest" href="manifest.webmanifest">\n</head>');
  return html;
}

function checks(){
  const a=latest(),html=a?.content||'',owner=$('#githubOwnerInput')?.value.trim()||'',repo=$('#githubRepoInput')?.value.trim()||slug(S.chat?.title||''),token=$('#githubTokenInput')?.value.trim()||'';
  const secret=/(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,})/.test(html);
  return[
    {ok:!!a,hard:true,label:'Generated artifact',detail:a?`index.html v${a.version}`:'Generate an app before publishing.'},
    {ok:!!token,hard:true,label:'GitHub token',detail:token?'Token is present in this browser session.':'Add or verify a GitHub token.'},
    {ok:/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner),hard:true,label:'GitHub owner',detail:owner||'Owner is missing.'},
    {ok:/^[A-Za-z0-9._-]{1,100}$/.test(repo),hard:true,label:'Repository name',detail:repo||'Repository is missing.'},
    {ok:/<meta[^>]+name=["']viewport["']/i.test(html),label:'Mobile viewport',detail:'Responsive Telegram layout metadata'},
    {ok:/telegram-web-app\.js/i.test(html),label:'Telegram SDK',detail:'Official Mini App SDK reference'},
    {ok:/<title>[^<]+<\/title>/i.test(html),label:'Document title',detail:'Browser and sharing title'},
    {ok:!secret,hard:true,label:'No obvious embedded secrets',detail:secret?'Potential API/token literal detected in generated HTML.':'No common secret token pattern detected.'}
  ];
}
function renderChecks(notify){
  const c=checks(),hard=c.filter(x=>x.hard&&!x.ok).length,warn=c.filter(x=>!x.hard&&!x.ok).length,box=$('#nightDeployChecks');
  box.innerHTML=c.map(x=>`<div class="night-check ${x.ok?'ok':x.hard?'bad':'warn'}"><i>${x.ok?'✓':x.hard?'!':'•'}</i><div><strong>${esc(x.label)}</strong><span>${esc(x.detail)}</span></div></div>`).join('');
  const badge=$('#nightDeployBadge');badge.textContent=hard?`${hard} blockers`:warn?`${warn} suggestions`:'Ready to ship';badge.dataset.state=hard?'bad':warn?'warn':'ok';
  $('#nightDeployPublish').disabled=state.busy||!!hard;
  if(notify)toast(hard?`Preflight found ${hard} blocker${hard===1?'':'s'}`:warn?`Preflight passed with ${warn} suggestion${warn===1?'':'s'}`:'Preflight passed — ready to publish');
}

async function publishKit(){
  const hard=checks().filter(x=>x.hard&&!x.ok);if(hard.length)return renderChecks(true);
  const a=assets(),button=$('#nightDeployPublish'),owner=$('#githubOwnerInput').value.trim(),repo=$('#githubRepoInput').value.trim()||slug(S.chat.title),token=$('#githubTokenInput').value.trim();
  state.busy=true;button.disabled=true;button.textContent='Publishing kit…';
  try{
    const r=await publishFilesToGithubPages({token,owner,repo,description:profile().description,files:{'index.html':a.html,'manifest.webmanifest':a.manifest,'404.html':a.fallback,'README.md':a.readme}});
    const now=new Date().toISOString();S.chat.publish={...r,publishedAt:now,mode:'deployment-kit'};S.chat.updatedAt=now;S.chat.messages.push({id:id(),role:'assistant',content:`Published deployment kit to ${r.pagesUrl}`,ts:now});await saveChat(S.chat);remember({...r,publishedAt:now,title:S.chat.title,version:latest()?.version||null});renderPublished();toast('Full deployment kit published ✦');
  }catch(e){toast(e.message||'Publishing failed');}
  finally{state.busy=false;button.textContent='↗ Publish full kit';renderChecks(false)}
}

function renderPublished(){
  const box=$('#nightPublishResult');if(!box)return;const p=S.chat?.publish;if(!p?.pagesUrl){box.hidden=true;return;}box.hidden=false;
  box.innerHTML=`<div><strong>Published</strong><span>${esc(p.pagesUrl)}</span><small>${p.publishedAt?new Date(p.publishedAt).toLocaleString():''}${p.files?.length?` · ${p.files.length} files`:''}</small></div><div><button class="ghost-btn" data-result="copy">Copy URL</button><button class="ghost-btn" data-result="open">Open Pages</button><button class="ghost-btn" data-result="repo">Repository</button></div>`;
  box.onclick=e=>{const k=e.target.closest('[data-result]')?.dataset.result;if(k==='copy')copy(p.pagesUrl,'Pages URL copied');if(k==='open')window.open(p.pagesUrl,'_blank','noopener,noreferrer');if(k==='repo'&&p.repoUrl)window.open(p.repoUrl,'_blank','noopener,noreferrer')};
}
function remember(entry){try{const h=JSON.parse(localStorage.getItem(HISTORY)||'[]');localStorage.setItem(HISTORY,JSON.stringify([entry,...h.filter(x=>x.pagesUrl!==entry.pagesUrl)].slice(0,20)))}catch{}}
function downloadAsset(k){const a=assets();if(!latest())return toast('Generate an app first.');if(k==='manifest')download('manifest.webmanifest',a.manifest,'application/manifest+json');if(k==='readme')download('README.md',a.readme,'text/markdown;charset=utf-8');if(k==='404')download('404.html',a.fallback,'text/html;charset=utf-8');if(k==='meta')download(`${slug(profile().title||'app')}.deployment.json`,a.meta,'application/json')}
function launchUrl(){const p=profile();if(!p.bot)return'';const u=new URL(`https://t.me/${p.bot}`);if(p.start)u.searchParams.set('startapp',p.start);return u.toString()}
function renderLaunch(){const u=launchUrl(),el=$('#nightLaunchUrl');el.textContent=u||'Add a bot username to generate a launch link.';$('#nightLaunchCopy').disabled=!u;$('#nightLaunchOpen').disabled=!u}
function cleanBot(v){return String(v||'').trim().replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,64)}
function cleanStart(v){return String(v||'').trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,128)}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function copy(text,msg){if(!text)return toast('Nothing to copy yet.');try{await navigator.clipboard.writeText(text);toast(msg)}catch{toast('Clipboard access was blocked')}}
