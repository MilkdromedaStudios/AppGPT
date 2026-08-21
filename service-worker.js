// AppGPT service worker kill switch.
// Offline/PWA caching is temporarily disabled so the app always uses fresh GitHub Pages assets.

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith('appgpt-shell-')).map(key=>caches.delete(key)));
    }catch{}
    try{await self.registration.unregister()}catch{}
    try{await self.clients.claim()}catch{}
  })());
});

self.addEventListener('fetch',()=>{});
