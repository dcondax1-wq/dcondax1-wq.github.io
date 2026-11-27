// NQ chart FEED (eager, small; day-livechart 2026-11-27, perf: the NQ page's eager JS under 600 KB). The data side of the live chart:
// the PC's "le-bars" post (nqbars.js feedUrls, ntfy /json?poll=1) every 2 minutes + the PC's status post (pc_feed.js), kept in
// window.NQCHART.S (nq.js's desk cards read S.post / S.model) and announced with the 'nq-bars' event. The VIEW (nqchart.js: the
// chart, the overlay, the live layer, lcmodel.js) loads when the card comes near the screen or when the page is idle after load,
// whichever comes first. Read only: it sends nothing, stores nothing, places nothing.
import * as B from './nqbars.js?v=b2';

const POLL_MS = 120000, TIMEOUT_MS = 7000, VIEW = './nqchart.js?v=d3';
const S = { lite: null, priv: null, privSeen: [], privOn: false, privFails: 0, brief: null, ofroom: null, live: null, replay: null, playing: 0, sweepSeen: null, glLines: [], emaS: null,
  feed: undefined, post: null, why: '', acct: 'all', model: null, lib: null, libTried: false, chart: null, series: null, marks: null, lines: [],
  whole: false, want: null, mode: 'default', viewKey: '', drawnN: 0, ready: false, fetchedAt: 0, busy: false, err: '' };

async function getText(url, ms, cache) {
  const E = window.NQ_EARLY && window.NQ_EARLY.text;  // perf: the page head started the feed file and the chart post (index.html); used once
  if (E && E[url]) { const p = E[url]; delete E[url]; try { const t = await p; if (t != null) return t; } catch (e) { /* ask again below */ } }
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache, ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.text() : null; } catch (e) { return null; } finally { clearTimeout(timer); }
}
async function fetchPost() {
  if (S.feed === undefined || S.feed === null) {
    const t = await getText('../status_feed.json', 6000, 'no-cache');
    try { S.feed = t ? JSON.parse(t) : null; } catch (e) { S.feed = null; }
  }
  const urls = B.feedUrls(S.feed);
  if (!urls.length) return { post: null, why: 'nofeed' };
  let reached = false;
  for (const u of urls) {
    const t = await getText(u, TIMEOUT_MS, 'no-store');
    if (t == null) continue;
    reached = true;
    const p = B.parse(t);
    if (p) return { post: p, why: '' };
  }
  return { post: null, why: reached ? 'none' : 'offline' };
}
async function pcPrice() {
  const F = window.PC_FEED;                          // index.html loads ../pc_feed.js (its fetches are shared with the rest of the page)
  if (!F || !F.fetchLatest) return;
  try {
    const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]);
    if (lite) S.lite = lite;
    const p = B.pcNow(lite); if (p) S.pc = p;
  } catch (e) { /* the bars alone */ }
}
function render() { if (C.view) C.view.render(); else S.model = B.model(S.post, S.acct, Date.now() / 1000); }
async function refresh(force) {
  if (S.busy || (!force && (document.hidden || Date.now() - S.fetchedAt < POLL_MS / 2))) return;
  S.busy = true;
  try {
    const [r] = await Promise.all([fetchPost(), pcPrice()]);
    S.fetchedAt = Date.now();
    if (r.post || !S.post) { S.post = r.post; S.why = r.why; }       // a failed poll keeps the last good bars on the screen
    render();
    try { window.dispatchEvent(new Event('nq-bars')); } catch (e) { /* the desk cards redraw on their own minute */ }
  } finally { S.busy = false; }
}
function loadView() {
  if (S.viewLoad) return; S.viewLoad = true;
  const t = document.createElement('script'); t.type = 'module'; t.src = new URL(VIEW, import.meta.url).href;
  t.onerror = () => { S.libTried = true; S.ready = true; const m = document.getElementById('chartMsg'); if (m) { m.textContent = 'This phone could not load the chart. The trades are listed in the Trades card.'; m.hidden = false; } };
  document.head.appendChild(t);
}
const C = window.NQCHART = { S, B, view: null, getText, pcPrice, refresh: (f) => refresh(f === undefined ? true : f), render, loadView,
  ready: () => S.ready && S.libTried && S.fetchedAt > 0, setAcct: (k) => { S.acct = k; S.mode = 'default'; render(); } };

const a = new URLSearchParams(location.search).get('acct');
if (a && /^[a-z0-9_]{1,24}$/.test(a)) S.acct = a;
refresh(true);
setInterval(() => refresh(false), POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
window.addEventListener('nq-refresh', () => refresh(true));
// the view: on first view of the card (400 px ahead), else once the page is idle after load (the chart is ready before a scroll gets there)
const card = document.getElementById('chartCard');
if (card && typeof IntersectionObserver === 'function') {
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadView(); } }, { rootMargin: '400px 0px' });
  io.observe(card);
}
const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(loadView, { timeout: 2500 }) : setTimeout(loadView, 1500));
if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
