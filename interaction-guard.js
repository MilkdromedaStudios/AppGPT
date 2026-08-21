// AppGPT emergency compatibility cleanup.
// Deliberately does NOT reload, intercept pointer events, or alter button behavior.

cleanupLegacyAppCache();

async function cleanupLegacyAppCache(){
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      const here=new URL('./',location.href).href;
      for(const reg of regs){
        if(reg.scope.startsWith(here)||here.startsWith(reg.scope)){
          try{await reg.unregister()}catch{}
        }
      }
    }

    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith('appgpt-shell-')).map(key=>caches.delete(key)));
    }
  }catch(error){
    console.warn('AppGPT legacy cache cleanup skipped',error);
  }
}
