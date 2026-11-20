// Kalshi page service worker (tools/web_public/kalshi/, scope ./), from the Jarvis hub's v3 worker (tools/web_public/jarvis/sw.js):
// the page opens offline or when the site answers badly, never on a browser error page or GitHub's 404.
// - each shell file is saved on its own (one missing file cannot stop the rest);
// - a navigation waits on the network at most NAV_WAIT_MS when a saved copy exists; a late answer still refreshes the copy;
// - a non-OK or failed answer is replaced by the saved copy; with no copy, a small dark page with a Retry button;
// - the page's own versioned files (kalshi.css / kalshi.js ?v=) answer from their exact saved copy at once, refreshed behind;
//   kit.json (the pin of the server script, written by the site build) is network first like the page;
// - only its own 'kalshi-*' caches are ever deleted; only same-origin files inside this folder are handled, so kalshi.json
//   (raw.githubusercontent.com / api.github.com) is never touched or cached;
// - Jarvis's fonts (../jarvis/*.woff2, the page's @font-face) and its three.js (the 3D header, korb.js) are saved here too and
//   answered from the copy first, so the page keeps its Orbitron / Rajdhani look and its orb offline.
const CACHE = 'kalshi-k43';                      // = 'kalshi-' + the ?v= of kalshi.css / kalshi.js (index.html, SHELL): a new version, a new cache
const NAV_WAIT_MS = 3500;
const SHELL = ['./', './index.html', './kalshi.css?v=k42', './kalshi.js?v=k42', './kfx.js?v=k26', './kit.json', '../olympus/warp.css?v=w2', '../olympus/warp.js?v=w2'];
const FONTS = ['../jarvis/orbitron.woff2', '../jarvis/rajdhani-400.woff2', '../jarvis/rajdhani-500.woff2', '../jarvis/rajdhani-600.woff2',
  '../jarvis/rajdhani-700.woff2', '../jarvis/three.module.min.js'];   // + the 3D header's three.js (korb.js): offline, and never a hung fetch
const FONT_URLS = FONTS.map((f) => new URL(f, self.registration.scope).href);
let probed = 0;

async function fonts(force) {                       // fetch the fonts the cache does not hold yet (at most every 10 min)
  if (!force && Date.now() - probed < 600e3) return;
  probed = Date.now();
  const c = await caches.open(CACHE);
  await Promise.all(FONTS.map(async (u) => {
    const url = new URL(u, self.registration.scope).href;
    if (await c.match(url)) return;
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r && r.ok) await c.put(url, r); } catch (_) { /* not on the site yet */ }
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => fonts(true)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Old copies go only once the new one holds the page.
    if (await (await caches.open(CACHE)).match('./index.html')) {
      for (const k of await caches.keys()) if (k.startsWith('kalshi-') && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});
async function saved(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit || req.mode !== 'navigate') return hit;
  return (await caches.match(new URL('./index.html', self.registration.scope).href)) || (await caches.match(self.registration.scope));
}
const OFFLINE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<meta name="theme-color" content="#000000"><title>Kalshi</title><style>html,body{height:100%;margin:0;background:#000;color:#ece9f2;'
  + 'font:16px/1.45 -apple-system,system-ui,sans-serif}main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px}'
  + 'p{color:#8a8499;margin:8px 0 18px}button{height:44px;padding:0 24px;border-radius:999px;border:1px solid #a855f7;background:rgba(168,85,247,.14);'
  + 'color:#c084fc;font:inherit;font-weight:650;letter-spacing:.08em;box-shadow:0 0 14px rgba(168,85,247,.35)}'
  + '</style></head><body><main><div><b>Kalshi can’t reach the internet</b><p>Check your connection, then try again.</p>'
  + '<button onclick="location.reload()">Retry</button></div></main></body></html>';
const offlinePage = () => new Response(OFFLINE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const store = (req, r) => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)).catch(() => null); } return r; };
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (req.method === 'GET' && FONT_URLS.indexOf(u.origin + u.pathname) >= 0) {    // Jarvis's fonts: the saved copy first (offline too)
    e.respondWith(caches.match(u.origin + u.pathname).then((hit) => hit || fetch(req).then((r) => store(new Request(u.origin + u.pathname), r))));
    return;
  }
  if (req.method !== 'GET' || u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const net = fetch(req).then((r) => store(req, r));
      net.catch(() => null);
      e.waitUntil(net.catch(() => null).then(() => fonts(false)).catch(() => null));   // a late answer still refreshes the copy
      const copy = await saved(req);
      const slow = new Promise((ok) => setTimeout(() => ok('slow'), copy ? NAV_WAIT_MS : 25000));
      try {
        const r = await Promise.race([net, slow]);
        if (r !== 'slow' && r && r.ok) return r;
        if (copy) return copy;
        if (r !== 'slow' && r) return r;                           // no copy yet: the site's own answer
        return await net;
      } catch (_) {
        return copy || offlinePage();
      }
    })().catch(() => offlinePage()));
    return;
  }
  e.respondWith((async () => {
    // kalshi.css / kalshi.js / kfx.js / korb.js are versioned (?v=): the exact saved copy answers at once, so a page drawn from
    // its saved copy after NAV_WAIT_MS never waits again on a slow site for its own files. A versioned file never changes (a
    // new version is a new ?v= and a new cache), so nothing is fetched behind it: no extra requests holding the phone's few
    // connections to a slow site.
    // Everything else here (kit.json: the server script's pin) is network first, the saved copy only when the site fails.
    if (u.searchParams.has('v')) {
      const hit = await caches.match(req);
      if (hit) return hit;
    }
    try {
      // network first, but a dead site (a dropped connection the browser retries) never outwaits the page's own 3 s: after
      // 2 s the saved copy answers, and a late answer still refreshes it
      const net = fetch(req).then((x) => store(req, x));
      net.catch(() => null);
      const copy = await saved(req);
      const r = copy ? await Promise.race([net, new Promise((ok) => setTimeout(() => ok(null), 2000))]) : await net;
      if (!r) { e.waitUntil(net.catch(() => null)); return copy; }
      if (r && r.ok) return r;
      return (await saved(req)) || r;
    } catch (_) {
      return (await saved(req)) || Response.error();
    }
  })());
});
