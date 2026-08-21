const VERSION='appgpt-shell-v2';
const OFFLINE='./index.html';
const SHELL=[
  './','./index.html','./styles.css','./workspace.css','./appearance.css',
  './main.js','./app-state.js','./storage.js','./providers.js','./templates.js','./build-engine.js','./preview-tools.js','./github-publish.js','./prompts.js','./thinking.js','./appearance.js','./workspace-ui.js',
  './night-tools.css','./night-tools.js','./night-data.css','./night-data.js','./night-history.css','./night-history.js','./night-appearance.css','./night-appearance.js','./night-codeplus.css','./night-codeplus.js','./night-telegram.css','./night-telegram.js','./night-provider.css','./night-provider.js','./night-templates.css','./night-templates.js','./night-publish.css','./night-publish.js','./night-reliability.css','./night-reliability.js',
  './app.webmanifest','./app-icon.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    const results=await Promise.allSettled(SHELL.map(url=>cache.add(new Request(url,{cache:'reload'}))));
    const failed=results.filter(x=>x.status==='rejected').length;
    if(failed) console.warn('AppGPT precache skipped',failed,'assets');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('appgpt-shell-')&&k!==VERSION).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data?.type==='CLEAR_RUNTIME') event.waitUntil(clearRuntime());
});

async function clearRuntime(){
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('appgpt-shell-')&&k!==VERSION).map(k=>caches.delete(k)));
}

async function networkFirst(req,fallbackKey=req){
  const cache=await caches.open(VERSION);
  try{
    const fresh=await fetch(new Request(req,{cache:'no-store'}));
    if(fresh?.ok) cache.put(fallbackKey,fresh.clone()).catch(()=>{});
    return fresh;
  }catch{
    return (await cache.match(fallbackKey))||(await caches.match(fallbackKey))||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(VERSION);
      try{
        const fresh=await fetch(new Request(req,{cache:'no-store'}));
        if(fresh?.ok) cache.put(OFFLINE,fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await cache.match(OFFLINE))||(await caches.match(OFFLINE))||Response.error();
      }
    })());
    return;
  }

  const isCode=/\.(?:js|mjs|css|html)$/i.test(url.pathname);
  if(isCode){
    event.respondWith(networkFirst(req,req));
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    const cached=await cache.match(req);
    if(cached) return cached;
    try{
      const fresh=await fetch(req);
      if(fresh?.ok) cache.put(req,fresh.clone()).catch(()=>{});
      return fresh;
    }catch{
      return Response.error();
    }
  })());
});
