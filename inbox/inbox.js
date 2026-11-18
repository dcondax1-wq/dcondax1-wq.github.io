// OLYMPUS INBOX page (ES module): gathers every source (inboxcore.js has the rules), draws the list, keeps read / pin / mute in 'inbox.read.v1'.
// Text only through textContent. Read-only on everything it reads; the last fetches are cached ('inbox.cache.v1') so it opens offline.
// window.INBOX is the test hook.
import * as K from './inboxcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const mem = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
const LS = (() => { try { localStorage.setItem('inbox.probe', '1'); localStorage.removeItem('inbox.probe'); return localStorage; } catch (_) { return mem; } })();
const KALSHI_RAW = 'https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json';
const CARD_APPS = ['forum', 'labyrinth', 'ares', 'argus', 'bridge', 'pantheon', 'arena', 'plutus', 'athena', 'kalshicity', 'mind', 'chronos'];
const nowS = () => Math.floor(Date.now() / 1000);
const mq = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (_) { return false; } };
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const jget = (k, d) => { try { const v = JSON.parse(LS.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } };
const jset = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); } catch (_) { /* not kept */ } };

const S = { items: [], st: K.readState(LS), filter: 'all', ids: new Set(), first: true, busy: false, offline: false, feeds: jget(K.CACHE_KEY, { feeds: {} }).feeds || {} };

// an optional file that answered 404 is not asked again for 30 minutes (a browser logs every 404 as a console error): once per phone, not on every open
const wasGone = (u) => { try { const t = +localStorage.getItem('inbox.opt404.' + u); return !!t && Date.now() - t < 1800e3; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem('inbox.opt404.' + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function getJSON(url, ms = 5000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { if (wasGone(url)) return null; const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.status === 404) markGone(url); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is read from this site first (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json); the old
// GitHub address is only the fallback. A host that answers a missing file with its index page gives HTML: not an object, so it falls through.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : getJSON(KALSHI_RAW, ms); }
const lite = () => (O && O.lite ? O.lite() : false) || mq('(prefers-reduced-motion: reduce)');

// ------------------------------------------------------------------------------------------------ gather
async function gather() {
  const names = ['bridge', 'learning'], urls = { bridge: '../bridge/status.json', learning: '../kalshicity/learning_log.json' };
  const got = await Promise.all([...names.map((n) => getJSON(urls[n])), getFeed(), ...CARD_APPS.map((a) => getJSON('../' + a + '/jarvis.json', 4000))]);
  const feeds = {}; let ok = 0;
  names.forEach((n, i) => { if (got[i]) { feeds[n] = got[i]; ok++; } else if (S.feeds[n]) feeds[n] = S.feeds[n]; });
  const cards = {};
  CARD_APPS.forEach((a, i) => { const c = got[3 + i]; if (c && typeof c === 'object') { cards[a] = c; ok++; } else if (S.feeds.cards && S.feeds.cards[a]) cards[a] = S.feeds.cards[a]; });
  feeds.cards = cards;
  const kj = got[2];
  if (kj && typeof kj === 'object') { ok++; kalshiStatus(kj); }
  S.offline = ok === 0 && typeof navigator !== 'undefined' && navigator.onLine === false;
  S.feeds = feeds;
  if (ok) jset(K.CACHE_KEY, { t: nowS(), feeds });
  return feeds;
}
// the Kalshi bot's status changes: this app keeps them (the feed itself only has "now")
function kalshiStatus(j) {
  const cur = { running: j.running !== false, status: String(j.status == null ? '' : j.status).slice(0, 60) }, st = jget(K.KALSHI_KEY, { last: null, log: [] });
  if (st.last && (st.last.running !== cur.running || st.last.status !== cur.status)) {
    st.log = [{ t: nowS(), text: 'Kalshi bot: ' + (cur.status || (cur.running ? 'Running' : 'Stopped')) }].concat(Array.isArray(st.log) ? st.log : []).slice(0, 50);
  }
  st.last = cur; jset(K.KALSHI_KEY, st);
}
function sources(feeds) {
  const bots = jget('jarvis.bots.log.v1', null), old = jget('jarvis.bots.log', []);
  const ar = jget('arena.v1', null);
  return { bots: Array.isArray(bots) && bots.length ? bots : (Array.isArray(old) ? old : []), argus: jget('argus.hist.v1', {}), kalshiLog: (jget(K.KALSHI_KEY, { log: [] }).log) || [], learning: feeds.learning || null,
    bridge: feeds.bridge || null, learned: jget('jarvis.vault.learned', []), brief: jget('jarvis.brief.v1', {}), arena: ar && Array.isArray(ar.events) ? ar.events : [], cards: feeds.cards || {}, live: null };
}

// ------------------------------------------------------------------------------------------------ draw
function sparkle(el) { try { const F = window.OLYMPUS_FX; if (F && F.sparkleBurst && !lite()) F.sparkleBurst(el, {}); } catch (_) { /* the effect is optional */ } }
function persist() { K.saveState(LS, S.st, nowS()); render(); }
function render() {
  const items = S.items, st = S.st, n = K.unread(items, st), cnt = K.counts(items, st);
  $('unread').textContent = String(n); $('unreadLbl').textContent = n === 1 ? 'new item' : 'new items';
  $('lead').textContent = n ? (items.some((it) => !st.muted[it.src] && !K.isRead(it, st) && it.level === 'bad') ? 'Something needs you. Red items first below.' : 'Here is what happened since you last looked.') : 'All quiet: your bots are fine. Nothing new needs you.';
  $('markAll').disabled = n === 0;
  document.title = K.titleFor(n);
  jset('inbox.card.v1', K.card(items, st, nowS()));
  // filters
  const f = $('filters'); clear(f);
  const defs = [['all', 'All'], ['needs', 'Needs you'], ['money', 'Money'], ['unread', 'Unread'], ['pinned', 'Pinned']].concat(K.SOURCES.map((s) => [s.id, s.name]));
  for (const [id, label] of defs) {
    const b = h('button', null, label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-f', id); b.setAttribute('aria-selected', String(S.filter === id));
    const c = id === 'unread' ? n : id === 'needs' ? K.view(items, st, 'needs').length : id === 'money' ? K.view(items, st, 'money').length : K.SRC[id] ? cnt[id] : 0;
    if (c > 0) b.appendChild(h('b', null, c));
    b.addEventListener('click', () => { S.filter = id; render(); });
    f.appendChild(b);
  }
  // the list: the calm card (with the last five) when nothing is unread under "All"
  const list = K.view(items, st, S.filter), calm = S.filter === 'all' && n === 0;
  $('list').hidden = calm; $('calm').hidden = !calm;
  const ul = $('list'); clear(ul);
  if (!calm) {
    if (!list.length) ul.appendChild(h('li', 'empty', S.filter === 'pinned' ? 'Nothing pinned yet. Tap Pin on an item to keep it here.' : S.filter === 'needs' ? 'Nothing needs you right now.' : S.filter === 'money' ? 'No item names dollars.' : S.filter === 'unread' ? 'Nothing unread.' : 'Nothing from this source yet.'));
    for (const it of list.slice(0, 80)) ul.appendChild(row(it));
  } else {
    $('calmText').textContent = items.length ? 'Your bots are fine. Nothing new needs you.' : 'Nothing has happened yet. Items from your bots, Argus, Kalshi, Bridge and Jarvis collect here.';
    const last = $('last'); clear(last);
    const five = K.view(items, st, 'all').slice(0, 5);
    if (!five.length) last.appendChild(h('li', 'empty', 'No items yet.'));
    for (const it of five) last.appendChild(row(it, true));
  }
  // sources (mute)
  const mc = $('muteChips'); clear(mc);
  for (const s of K.SOURCES) {
    const b = h('button', null, s.name); b.type = 'button'; b.style.setProperty('--c', s.color); b.setAttribute('aria-pressed', String(!!st.muted[s.id])); b.setAttribute('data-src', s.id);
    b.insertBefore(h('i'), b.firstChild); b.title = st.muted[s.id] ? 'Muted: tap to unmute' : 'Tap to mute';
    b.addEventListener('click', () => { K.toggleMute(S.st, s.id); persist(); });
    mc.appendChild(b);
  }
  S.ids = new Set(items.map((it) => it.id));
}
function row(it, plain) {
  const st = S.st, li = h('li', 'it ' + it.level + (K.isRead(it, st) ? '' : ' unread') + (st.pins[it.id] ? ' pin' : '') + (S.fresh && S.fresh.has(it.id) ? ' new' : '')), s = K.SRC[it.src];
  li.setAttribute('data-id', it.id); li.setAttribute('data-src', it.src); li.style.setProperty('--c', it.color);
  li.appendChild(h('span', 'ic', it.icon)); li.lastChild.setAttribute('aria-hidden', 'true');
  li.appendChild(h('p', 'tx', it.text));
  const meta = h('div', 'meta'); meta.appendChild(h('span', 'src', s.name)); meta.appendChild(h('span', null, K.ago(it.t, nowS()) + (it.ongoing ? ' · still open' : ''))); li.appendChild(meta);
  const r = h('div', 'row');
  const open = h('a', 'mini', 'Open'); open.href = it.href; open.addEventListener('click', () => { K.markRead(S.st, it.id, nowS()); K.saveState(LS, S.st, nowS()); }); r.appendChild(open);
  if (!K.isRead(it, st)) { const b = h('button', 'mini ghost', 'Mark read'); b.type = 'button'; b.addEventListener('click', () => { K.markRead(S.st, it.id, nowS()); persist(); }); r.appendChild(b); }
  const p = h('button', 'mini ghost', st.pins[it.id] ? 'Unpin' : 'Pin'); p.type = 'button'; p.addEventListener('click', () => { K.togglePin(S.st, it.id); persist(); }); r.appendChild(p);
  if (!plain) { const m = h('button', 'mini ghost', 'Mute ' + s.name); m.type = 'button'; m.addEventListener('click', () => { K.toggleMute(S.st, it.src); persist(); }); r.appendChild(m); }
  li.appendChild(r);
  return li;
}

async function refresh() {
  if (S.busy) return;
  S.busy = true; $('refresh').setAttribute('aria-busy', 'true');
  let feeds = S.feeds;
  try { feeds = await gather(); } catch (_) { /* the cached feeds stay */ }
  const prev = S.ids, items = K.collect(sources(feeds), nowS());
  S.items = items; S.fresh = S.first ? new Set() : new Set(items.filter((it) => !prev.has(it.id)).map((it) => it.id));
  render();
  if (S.fresh.size) setTimeout(() => { for (const li of document.querySelectorAll('#list .it.new, #last .it.new')) sparkle(li); }, 60);
  S.first = false; S.busy = false; $('refresh').setAttribute('aria-busy', 'false');
  $('off').hidden = !S.offline;
  const t = jget(K.CACHE_KEY, { t: 0 }).t; $('foot').textContent = 'Read-only: the Inbox never changes the things it reads.' + (t ? ' Last checked ' + K.ago(t, nowS()) + '.' : '');
}
$('markAll').addEventListener('click', () => { K.markAll(S.st, S.items, nowS()); persist(); });
$('refresh').addEventListener('click', () => refresh());
window.addEventListener('storage', (e) => { if (e.key === null || /^(jarvis\.|argus\.|arena\.|inbox\.)/.test(e.key)) { S.st = K.readState(LS); S.items = K.collect(sources(S.feeds), nowS()); render(); } });
window.addEventListener('online', () => refresh());
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
if (lite()) root.setAttribute('data-lite', '1');
if (O && O.onFx) O.onFx(() => { if (lite()) root.setAttribute('data-lite', '1'); else root.removeAttribute('data-lite'); $('lite').hidden = !lite(); });
$('lite').hidden = !lite();
// the first draw is from what this phone already has (so it is never blank and works offline), then the fetches
S.items = K.collect(sources(S.feeds), nowS()); render(); S.ids = new Set(S.items.map((it) => it.id));
try { if (window.OLYMPUS_FX && window.OLYMPUS_FX.wire) window.OLYMPUS_FX.wire(); } catch (_) { /* optional */ }
try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
refresh();
window.INBOX = { K, S, refresh, render, LS };
