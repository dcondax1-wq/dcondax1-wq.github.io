/* OWNER MANUAL offline copy (2026-11-20 day-manual). Scope = ./manual only (hub/manual.html, manual.css, manual.js): no other page,
   no other worker touched (the site's sw.js skips hub/, the Jarvis worker covers jarvis/ only). Network first (a fresh copy when
   online, so a new manual shows at once), the saved copy when offline or after 3 s. Same-origin GET only, nothing else cached.
   Bump VER with the ?v= of manual.css / manual.js. Off: delete this file + the register line in manual.js. */
const VER = 'm3';
const CACHE = 'olympus-manual-' + VER;
const FILES = ['./manual.html', './manual.css?v=' + VER, './manual.js?v=' + VER, './icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => null)); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('olympus-manual-') && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const name = url.pathname.split('/').pop();
  if (!/^(manual\.(html|css|js)|icon\.svg)$/.test(name)) return;
  const key = req.mode === 'navigate' ? './manual.html' : req;
  e.respondWith((async () => {
    const saved = () => caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: req.mode === 'navigate' }));
    const net = fetch(req).then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => null); }
      return r;
    });
    const slow = new Promise((ok) => setTimeout(ok, 3000)).then(saved);
    try {
      const r = await Promise.race([net, slow]);
      if (r) return r;
      return await net;
    } catch (err) {
      const s = await saved();
      if (s) return s;
      throw err;
    }
  })());
});
