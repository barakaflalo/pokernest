/* ── AppNest · Cloudflare Pages fix (Oct 2026) ──
   Cloudflare redirects *.html to clean URLs (/index.html -> /). Chrome refuses a
   "redirected" response that a Service Worker hands to a page load (ERR_FAILED).
   This strips the redirect flag from every response the SW fetches or reads from cache. */
(function(){
  var NB={101:1,204:1,205:1,304:1};
  function clean(r){
    if(!r||!r.redirected||NB[r.status])return r;
    return r.blob().then(function(b){return new Response(b,{status:r.status,statusText:r.statusText,headers:r.headers});});
  }
  var _fetch=self.fetch.bind(self);
  self.fetch=function(input,init){
    if(input&&typeof input==='object'&&input.mode==='navigate')input=input.url;
    return _fetch(input,init).then(clean);
  };
  var cm=Cache.prototype.match;
  Cache.prototype.match=function(){return cm.apply(this,arguments).then(clean);};
  var sm=CacheStorage.prototype.match;
  CacheStorage.prototype.match=function(){return sm.apply(this,arguments).then(clean);};
})();

/* PokerNest service worker — network-first for pages, each shell file cached on its own,
   only the app root is ever stored as the page, other origins pass straight through. */
const VERSION = 'pokernest-v4';
const SHELL = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'privacy_policy.html', 'face-j.webp', 'face-q.webp', 'face-k.webp', 'back-1.webp', 'back-2.webp', 'av-01.webp', 'av-02.webp', 'av-03.webp', 'av-04.webp', 'av-05.webp', 'av-06.webp', 'av-07.webp', 'av-08.webp', 'av-09.webp', 'av-10.webp', 'av-11.webp', 'av-12.webp', 'felt-1.webp', 'table-logo.webp'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('pokernest-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PokerNest</title>' +
  '<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#070707;color:#f3efe4;font-family:system-ui;text-align:center;padding:24px">' +
  '<div style="font-size:54px">🂠</div><h2 style="margin:0">אין חיבור לאינטרנט · No connection</h2><p style="color:#a39d8c;max-width:320px">PokerNest ייפתח כשהחיבור יחזור.<br>PokerNest will open when you are back online.</p>' +
  '<button onclick="location.reload()" style="min-height:48px;padding:10px 22px;border-radius:12px;border:1.5px solid #d4a940;background:#d4a940;color:#140f02;font-size:16px;font-weight:700">נסה שוב · Try again</button></body>';

function timeout(ms, p) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); }); }
const scope = () => new URL(self.registration.scope);
const isRoot = url => { const u = new URL(url), s = scope(); return u.origin === s.origin && (u.pathname === s.pathname || u.pathname === s.pathname + 'index.html' || u.pathname === s.pathname + 'index'); };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                         // CDN, PeerJS, fonts: straight to the network
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await timeout(4000, fetch(req.url, { cache: 'no-store' }));
        if (r && r.ok && isRoot(req.url)) { const c = await caches.open(VERSION); await c.put('./', r.clone()); }
        return r;
      } catch (err) {
        const c = await caches.open(VERSION);
        const hit = isRoot(req.url) ? await c.match('./') : await c.match(url.pathname.split('/').pop() || './', { ignoreSearch: true });
        return hit || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const r = await fetch(req);
      if (r && r.ok) await c.put(req, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
