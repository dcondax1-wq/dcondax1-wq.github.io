// Jarvis hub service worker: keeps the hub's own screen available offline. Network first for the hub's files; it never
// touches the dashboards it shows (they live outside this folder and keep their own service workers) or the live feed.
// v2 (2026-10-31, Jarvis would not open): each file is saved on its own (one missing file cannot stop the rest), and the saved
// copy answers whenever the site does not answer properly (offline, a 404 or a server error), never an error page.
// v3 (2026-11-01, "Jarvis is just a white screen"): an iPhone Home Screen app shows a blank white screen while its page loads
// or when the load fails. So opening Jarvis never waits on a slow network for more than NAV_WAIT_MS when a saved copy exists
// (the network answer still refreshes the copy for next time), and with no network and no copy it gets a small dark page
// with a Retry button instead of an error.
// v4 (2026-11-01, Jarvis + Zenith modes): the app is split into modules (data.js, jarvis.css and the parts built on their own:
// brain.js, core-visual.js, apps.js, zenith-mode.js, three.module.min.js). Each is saved on its own, so a part that is not on
// the site yet is skipped. The old Jarvis look came back with it: its fonts (Orbitron, Rajdhani; OFL.txt) are saved too.
// Only the navigation races the network (NAV_WAIT_MS): a page answered from the saved copy gets its own files from the saved
// copy at once (stale-while-revalidate: the network refreshes them for next time), so a slow network never stacks one wait per
// file (QA 2026-11-01: first paint 7 s instead of 3.6 s). A page fresh from the network gets fresh files (the same version),
// falling back to the saved copy after NAV_WAIT_MS. Fonts and images always come from the saved copy first.
// v5 (2026-11-01, "Jarvis isn't opening" on the iPhone): WebKit stops the old worker's downloads the moment a new worker takes
// over, so a worker swap in the middle of a start cut off Jarvis's files (tested in WebKit: "Service Worker context closed").
// A new worker now waits until Jarvis asks it to take over, which the page does only while it is out of sight
// ('jarvis:activate'), or until Jarvis is closed. Its saved copy is fetched past the browser's HTTP cache (cache: 'reload'),
// so it can never save the previous version's files.
// v6 (2026-11-01, "Just a black screen" on the iPhone): an iPhone Home Screen app is black while its page or its stylesheet is
// still on the way, and v5 still waited on the network without limit for a file it had no copy of (a weak signal = black for
// good). Now nothing waits longer than NET_MAX_MS: a page with no copy gets the dark "can't reach the internet" page with Retry,
// a file with no copy fails (the page shows without it and its start note says so). A file missing from this copy is taken from
// the previous Jarvis copy (OLD) while it is still here, and the previous copies go only once this one holds every CORE file.
// v7 (2026-11-01, the orb): switcher.js joins the saved parts.
// v8 (2026-11-02, the System view): jarvis.css?v=j5 (the System strip and panel), a fresh copy of data.js / brain.js / switcher.js.
// v9 (2026-11-02, every dashboard its own): jarvis.css?v=j6 (Jarvis's bar on the Jarvis screen only), a fresh index.html.
// v10 (2026-11-02, MFFU 7-day count): a fresh data.js (the System view warns from day 5 without a trade), apps.js (theme).
// v11 (2026-11-03, the name OLYMPUS): jarvis.css?v=j7, switcher.js (its header), index.html.
// v12 (2026-11-03, the OLYMPUS entrance): index.html (the opening is inline in the page: nothing more to fetch), jarvis.css?v=j8
// (quick actions, today's timeline, the core's satellites).
// v13 (2026-11-03, the OLYMPUS apps): Jarvis's new brain parts join the saved ones (obsidian.js: the owner's vault, memory.js:
// what Jarvis remembers, assist-ui.js: their screens), so they open offline too; jarvis.css?v=j9 (the OLYMPUS apps grid), a fresh
// index.html, apps.js (the nine OLYMPUS apps built in, by group) and switcher.js (groups, the most used apps on the ring).
// v14 (2026-11-03, voice mode): voice-mode.js joins the saved parts (the full-screen conversation opens offline too);
// jarvis.css?v=j10 (its quick-action tile), a fresh index.html and brain.js ("Jarvis, voice mode").
// v15 (2026-11-03, the OLYMPUS home-screen icon): icons and manifest ?v=j3 (name Olympus).
// v16 (2026-11-03 day sprint): themes (jarvis.css?v=j13), the assistant (assistant.js, tts.js), Pantheon + Arena built in.
// v18: the 3D home backdrop + portal jump on the OLYMPUS render core (backdrop.js, portal.js).
// v17 (2026-11-03 evening): smart-mode tools (tools.js), Jarvis talks by default (voice-out.js, jarvis.css?v=j13).
const CACHE = 'jarvis-v20';
const OLD = ['jarvis-v19', 'jarvis-v18', 'jarvis-v17', 'jarvis-v16', 'jarvis-v15', 'jarvis-v14', 'jarvis-v13', 'jarvis-v12', 'jarvis-v11', 'jarvis-v10', 'jarvis-v9', 'jarvis-v8', 'jarvis-v7', 'jarvis-v6', 'jarvis-v5', 'jarvis-v4'];
const NAV_WAIT_MS = 3500;
const NET_MAX_MS = 9000;
const SHELL = ['./', './index.html', './manifest.webmanifest?v=j4', './apple-touch-icon.png?v=j4', './icon-192.png?v=j4', './icon-512.png?v=j4',
  './jarvis.css?v=j13', './data.js', './brain.js', './core-visual.js', './apps.js', './zenith-mode.js', './switcher.js',
  './obsidian.js', './memory.js', './assist-ui.js', './voice-mode.js', './assistant.js', './tools.js', './tts.js', './voice-out.js', './modes.js', './intro-logo.webp', '../olympus/sfx.js?v=s1', './backdrop.js?v=b1', './portal.js?v=p1', './three.module.min.js', './orbitron.woff2', './rajdhani-400.woff2', './rajdhani-500.woff2', './rajdhani-600.woff2', './rajdhani-700.woff2'];
const CORE = ['./index.html', './jarvis.css?v=j13', './data.js'];
const STATIC_RX = /\.(woff2|png|svg|jpg|webp|webmanifest)$/i;
// how each page was answered ('cache' | 'net'), by its client id; lastNav when the browser gives no client ids
const navFrom = new Map();
let lastNav = { from: 'net', at: 0 };
function markNav(e, from) {
  lastNav = { from, at: Date.now() };
  if (e.resultingClientId) { navFrom.set(e.resultingClientId, from); if (navFrom.size > 24) navFrom.delete(navFrom.keys().next().value); }
}
function pageFromCopy(e) {
  const f = e.clientId && navFrom.get(e.clientId);
  return f ? f === 'cache' : lastNav.from === 'cache' && Date.now() - lastNav.at < 30000;
}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
});
// the page asks while it is out of sight (or Jarvis is closed and the browser swaps it in by itself): never during a start
self.addEventListener('message', (e) => { if (e.data === 'jarvis:activate') self.skipWaiting(); });
// Old copies go only once the new one holds the page, its stylesheet and data.js. Run at activation and again after each
// page load: the previous worker can still save a late download into its own copy after this one took over.
async function tidy() {
  const c = await caches.open(CACHE);
  if (!(await Promise.all(CORE.map((u) => c.match(u, { ignoreSearch: true })))).every(Boolean)) return;
  for (const k of await caches.keys()) if (k.startsWith('jarvis-') && k !== CACHE) await caches.delete(k);
}
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { await tidy(); } catch (_) { /* next page load */ }
    await self.clients.claim();
  })());
});
// only Jarvis's own cache: any page of this origin can write CacheStorage, so an origin-wide lookup could be fed another
// page's copy (security review 2026-11-01)
async function savedIn(name, req) {                                    // by cache name: never origin-wide, never creates one
  const hit = await caches.match(req, { ignoreSearch: true, cacheName: name });
  if (hit || req.mode !== 'navigate') return hit || null;
  return (await caches.match('./index.html', { cacheName: name })) || (await caches.match('./', { cacheName: name })) || null;
}
async function saved(req) {
  for (const name of [CACHE, ...OLD]) {
    try { const hit = await savedIn(name, req); if (hit) return hit; } catch (_) { /* the next copy */ }
  }
  return null;
}
const OFFLINE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<meta name="theme-color" content="#000000"><title>Jarvis</title><style>html,body{height:100%;margin:0;background:#000;color:#ece9f2;'
  + 'font:16px/1.45 -apple-system,system-ui,sans-serif}main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px;'
  + 'background:radial-gradient(ellipse at 50% 40%,#140a24,#000 65%)}b{letter-spacing:.3em;color:#e9ddff;text-shadow:0 0 14px #a855f7}'
  + 'p{color:#8a8499;margin:10px 0 18px}button{height:44px;padding:0 22px;border-radius:14px;border:1px solid #a855f7;background:rgba(168,85,247,.25);color:#fff;'
  + 'font:inherit;font-weight:650;box-shadow:0 0 16px rgba(168,85,247,.45)}'
  + '</style></head><body><main><div><b>J.A.R.V.I.S.</b><p>Jarvis can’t load right now: no internet, or it is very slow. Check your connection, then try again.</p>'
  + '<button onclick="location.reload()">Retry</button></div></main></body></html>';
const offlinePage = () => new Response(OFFLINE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const store = (req, r) => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)).catch(() => null); } return r; };
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (req.method !== 'GET' || u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const net = fetch(req).then((r) => store(req, r));
      net.catch(() => null);
      e.waitUntil(net.catch(() => null));                         // a late answer still refreshes the saved copy
      e.waitUntil(net.then(() => tidy(), () => null).catch(() => null));
      const copy = await saved(req);
      const slow = new Promise((ok) => setTimeout(() => ok('slow'), copy ? NAV_WAIT_MS : NET_MAX_MS));
      try {
        const r = await Promise.race([net, slow]);
        if (r !== 'slow' && r && r.ok) { markNav(e, 'net'); return r; }
        if (copy) { markNav(e, 'cache'); return copy; }
        if (r !== 'slow' && r) return r;                           // no copy yet: the site's own answer
        return offlinePage();                                       // no copy, no answer in NET_MAX_MS: never a black screen
      } catch (_) {
        markNav(e, 'cache');
        return copy || offlinePage();
      }
    })().catch(() => offlinePage()));
    return;
  }
  e.respondWith((async () => {
    const net = fetch(req);
    net.then((r) => store(req, r)).catch(() => null);
    e.waitUntil(net.catch(() => null));                          // the saved copy is refreshed for next time
    const copy = await saved(req);
    // stale-while-revalidate: fonts and images, and every file of a page that came from the saved copy
    if (copy && (STATIC_RX.test(u.pathname) || pageFromCopy(e))) return copy;
    try {
      // a page fresh from the network: its files fresh too, the saved copy only if the network stalls
      // never an endless wait: with no copy, NET_MAX_MS at most (a stylesheet still on the way keeps the whole screen black)
      const r = await Promise.race([net, new Promise((ok) => setTimeout(() => ok(null), copy ? NAV_WAIT_MS : NET_MAX_MS))]);
      if (r && r.ok) return r;
      return copy || r || Response.error();
    } catch (_) {
      return copy || Response.error();
    }
  })());
});
