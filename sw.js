const CACHE='campus-move-v7';
const SCOPE=self.registration.scope;
const ASSETS=['./','index.html','style.css','document.css','classroom.css','core.js','app.js','cloud-upload.js','mode.js','tiles.js','review.html','review.js','handout.html','guide.html','icon.svg'];
const ASSET_URLS=new Set(ASSETS.map(p=>new URL(p,SCOPE).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([...ASSET_URLS]))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('campus-move-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSET_URLS.has(u.origin+u.pathname))return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request))) });
