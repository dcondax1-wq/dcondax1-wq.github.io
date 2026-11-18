// OLYMPUS INBOX, the pure part (tools/web_public/inbox/inboxcore.js, 2026-11-04): turns what the phone and the site already keep into one list of
// plain-sentence items (newest first), and keeps the read / pin / mute state. No DOM, no network: it runs in node (tests/test_inbox_page.py)
// and on the phone (inbox.js). Read-only on every source: it never writes anything but its own 'inbox.*' keys. No secrets: text is cut and
// anything that looks like a key or token is dropped.

export const READ_KEY = 'inbox.read.v1';      // { all: seconds (everything older is read), ids: { id: seconds }, pins: { id: 1 }, muted: { source: 1 } }
export const KALSHI_KEY = 'inbox.kalshi.v1';  // { last: { running, status }, log: [{ t, text }] }: the bot's status changes, kept by this app
export const CACHE_KEY = 'inbox.cache.v1';    // { t, feeds: { name: json } }: the last fetches, so it opens offline

// the sources: id, name, glyph, colour (the app's own), where "Open" goes
export const SOURCES = [
  { id: 'bots', name: 'Bots', icon: '◎', color: '#c8a24a', href: '../' },
  { id: 'argus', name: 'Argus', icon: 'Α', color: '#4b7a99', href: '../argus/' },
  { id: 'kalshi', name: 'Kalshi', icon: 'K', color: '#c96a4a', href: '../kalshi/' },
  { id: 'bridge', name: 'Bridge', icon: 'Β', color: '#7f8a52', href: '../bridge/' },
  { id: 'mind', name: 'Jarvis learned', icon: 'Ω', color: '#e0b060', href: '../jarvis/' },
  { id: 'arena', name: 'Arena', icon: 'Α', color: '#9c6b3c', href: '../arena/' },
  { id: 'system', name: 'System', icon: '⚙', color: '#9a8f7d', href: '../argus/' },
];
export const SRC = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const SECRETY = /(gsk_[\w-]{6,}|ghp_[\w]{6,}|sk-[\w-]{10,}|AIza[\w-]{10,}|token\s*[:=]|api[_-]?key\s*[:=]|password\s*[:=]|bearer\s+[\w.-]{10,})/i;
/** one plain line: whitespace squeezed, cut, and "" when it looks like a secret */
export function clean(v, n = 180) {
  const s = (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim();
  return SECRETY.test(s) ? '' : s.slice(0, n);
}
const secs = (v) => { const x = num(v); if (x != null) return x > 1e12 ? Math.floor(x / 1000) : x; if (typeof v === 'string') { const m = Date.parse(v.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2')); return Number.isFinite(m) ? Math.floor(m / 1000) : null; } return null; };
const dayT = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) / 1000) : null; };

export function ago(t, now) {
  const s = Math.max(0, (now == null ? Date.now() / 1000 : now) - t);
  return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
}
const dur = (s) => (s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d');

/** a prefix + a cleaned value, or '' when the value is empty or looks like a secret (so a dropped text never leaves a bare prefix) */
const pre = (p, v, n) => { const c = clean(v, n); return c ? p + c : ''; };

function item(src, key, t, text, o = {}) {
  const tx = clean(text);
  if (!tx || t == null) return null;
  const s = SRC[src];
  return { id: src + ':' + clean(key, 90), src, app: o.app || src, icon: s.icon, color: o.color || s.color, text: tx, t, level: o.level || 'info', href: o.href || s.href, ongoing: !!o.ongoing };
}

/** S = { bots: [events], argus: hist, kalshiLog: [{ t, text }], learning: json, bridge: json, learned: [], brief: {}, arena: [], cards: { app: card }, live: json }
 *  -> items, newest first (pinned items are sorted by the view, not here) */
export function collect(S, now) {
  const out = [], add = (x) => { if (x) out.push(x); };
  // (a) bot events: Jarvis's bots module (jarvis.bots.log.v1, 200 events; falls back to the older 30)
  for (const e of arr(S.bots).filter(isObj)) {
    const lv = e.level === 'bad' || e.level === 'warn' ? e.level : 'info', bot = clean(e.bot, 12);
    add(item('bots', e.key || e.t + ':' + e.text, secs(e.t), pre(bot ? bot.toUpperCase() + ': ' : '', e.text), { level: lv }));
  }
  // (b) Argus: lights that are red now (ongoing) and incidents that were fixed
  const ah = isObj(S.argus) ? S.argus : {};
  for (const [id, o] of Object.entries(isObj(ah.open) ? ah.open : {})) {
    const since = secs(isObj(o) ? o.since : null);
    if (since != null) add(item('argus', 'open:' + id + ':' + since, since, `Still red: ${clean(isObj(o) ? o.label : id, 80) || id}, for ${dur(Math.max(60, now - since))}`, { level: 'bad', ongoing: true }));
  }
  for (const r of arr(ah.reds).filter(isObj).slice(-20)) {
    const from = secs(r.from), to = secs(r.to);
    if (to != null) add(item('argus', 'red:' + clean(r.id, 40) + ':' + to, to, `${clean(r.label, 80) || clean(r.id, 40)} was red for ${dur(Math.max(60, (to - (from || to))))} and is fixed`, { level: 'info' }));
  }
  // (c) Kalshi: its learning log (kalshicity/learning_log.json) and the bot's status changes kept by this app
  const ll = isObj(S.learning) ? (Array.isArray(S.learning.entries) ? S.learning.entries : Array.isArray(S.learning.log) ? S.learning.log : []) : arr(S.learning);
  for (const e of ll.filter((x) => isObj(x) || typeof x === 'string').slice(-30)) {
    const t = isObj(e) ? secs(e.t != null ? e.t : e.time != null ? e.time : e.day) || dayT(e.day) : null, tx = isObj(e) ? e.text || e.note || e.line || e.lesson : e;
    add(item('kalshi', 'learn:' + t + ':' + clean(tx, 40), t, pre('Kalshi learned: ', tx), { href: '../kalshicity/' }));
  }
  for (const e of arr(S.kalshiLog).filter(isObj)) add(item('kalshi', 'status:' + e.t + ':' + clean(e.text, 30), secs(e.t), clean(e.text), { level: /stopp|error|bad/i.test(e.text) ? 'warn' : 'info' }));
  // (d) Bridge: ChatGPT jobs that wait for you or finished, and what was delivered
  const b = isObj(S.bridge) ? S.bridge : {};
  for (const [id, j] of Object.entries(isObj(b.jobs) ? b.jobs : {})) {
    if (!isObj(j)) continue;
    const st = clean(j.status, 20).toLowerCase(), t = secs(j.t != null ? j.t : j.updated) || secs(b.t);
    if (st === 'question') add(item('bridge', 'q:' + id, t, `ChatGPT has a question for you: ${clean(j.title || id, 90)}`, { level: 'warn', ongoing: true }));
    else if (st === 'done') add(item('bridge', 'done:' + id, t, `ChatGPT finished: ${clean(j.title || id, 90)}`));
  }
  const qn = num(isObj(b.counts) ? b.counts.question : null);
  if (qn && qn > 0 && !Object.keys(isObj(b.jobs) ? b.jobs : {}).length) add(item('bridge', 'qn:' + qn, secs(b.t), `${qn} ChatGPT question${qn === 1 ? '' : 's'} waiting for you`, { level: 'warn', ongoing: true }));
  // Git merge commits are repository bookkeeping, not a ChatGPT delivery. Only Bridge jobs marked done are Inbox items.
  // (e) what Jarvis learned (the Obsidian vault notes it saved) and the daily brief
  for (const l of arr(S.learned).filter(isObj).slice(0, 30)) add(item('mind', 'learn:' + l.t, secs(l.t), pre('Jarvis learned: ', l.text)));
  const br = isObj(S.brief) ? S.brief : {};
  if (br.day && (br.shown || br.spoken)) add(item('mind', 'brief:' + br.day, secs(br.spoken) || secs(br.shown) || dayT(br.day), 'Your morning briefing for ' + clean(br.day, 12) + ' is ready', { href: '../jarvis/' }));
  // (f) Arena: achievements and boss results this phone has seen
  for (const e of arr(S.arena).filter(isObj).slice(-25)) {
    const t = secs(e.t) || dayT(e.day), kind = clean(e.kind, 24), what = clean(e.note, 120) || kind;
    add(item('arena', 'a:' + clean(e.id, 60), t, pre(/boss/i.test(kind) ? 'Boss result: ' : /labou?r|achiev|rank|level/i.test(kind) ? 'Achievement: ' : 'Arena: ', what)));
  }
  // (g) system notices: an app whose numbers have gone stale, the PC's red lines
  for (const [app, c] of Object.entries(isObj(S.cards) ? S.cards : {})) {
    if (!isObj(c)) continue;
    const t = secs(c.t), after = num(c.stale_after);
    if (t != null && after && now - t > after && !/demo/i.test(clean(isObj(c.status) ? c.status.label : '', 30))) add(item('system', 'stale:' + app + ':' + Math.floor(t / 3600), t + after, `${clean(c.name, 30) || app} has not refreshed for ${dur(now - t)} (it should every ${dur(after)})`, { level: 'warn', app, href: '../' + app + '/' }));
  }
  const ph = isObj(S.live) && isObj(S.live.pc_health) ? S.live.pc_health : null;
  if (ph) for (const l of arr(ph.lines).filter(isObj)) if (l.level === 'bad' || l.level === 'warn') add(item('system', 'pc:' + clean(l.key, 20) + ':' + l.level, secs(ph.t) || now, `PC ${clean(l.label, 30) || clean(l.key, 20)}: ${clean(l.text, 110)}`, { level: l.level, ongoing: true, href: '../pc/' }));
  const seen = new Set();
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((a, b) => b.t - a.t);
}

// ------------------------------------------------------------------------------------------------ read / pin / mute
export const emptyState = () => ({ all: 0, ids: {}, pins: {}, muted: {} });
export function readState(storage) {
  let s = null;
  try { s = JSON.parse(storage.getItem(READ_KEY) || 'null'); } catch (_) { s = null; }
  const o = emptyState();
  if (isObj(s)) { o.all = num(s.all) || 0; for (const k of ['ids', 'pins', 'muted']) if (isObj(s[k])) o[k] = { ...s[k] }; }
  return o;
}
export function saveState(storage, st, now) {
  const keep = {}, cut = (now || Date.now() / 1000) - 60 * 86400;                     // read marks older than 60 days are dropped (their items are older than "all" anyway)
  for (const [k, t] of Object.entries(st.ids)) if (!(num(t) < cut)) keep[k] = t;
  const o = { all: st.all, ids: keep, pins: st.pins, muted: st.muted };
  try { storage.setItem(READ_KEY, JSON.stringify(o)); } catch (_) { /* not kept */ }
  return o;
}
export const isRead = (it, st) => it.t <= st.all || !!st.ids[it.id];
export function markRead(st, id, now) { st.ids[id] = Math.floor(now || Date.now() / 1000); return st; }
export function markAll(st, items, now) { const t = Math.floor(now || Date.now() / 1000); st.all = Math.max(st.all, t, ...arr(items).map((it) => it.t || 0)); st.ids = {}; return st; }   // a day-only time (noon UTC) can be ahead of now
export function togglePin(st, id) { if (st.pins[id]) delete st.pins[id]; else st.pins[id] = 1; return !!st.pins[id]; }
export function toggleMute(st, src) { if (st.muted[src]) delete st.muted[src]; else st.muted[src] = 1; return !!st.muted[src]; }

/** the list for a filter ('all' | 'unread' | 'pinned' | a source id): muted sources are hidden (except under their own filter), pinned first, then newest */
export function view(items, st, filter) {
  const f = filter || 'all';
  const list = items.filter((it) => {
    if (f === 'pinned') return !!st.pins[it.id];
    if (f === 'unread') return !st.muted[it.src] && !isRead(it, st);
    if (f === 'needs') return !st.muted[it.src] && !isRead(it, st) && (it.level === 'bad' || it.level === 'warn');   // AGORA: what needs you
    if (f === 'money') return !st.muted[it.src] && /\$\s?\d/.test(it.text);                                              // AGORA: items that name dollars
    if (SRC[f]) return it.src === f;
    return !st.muted[it.src];
  });
  return list.sort((a, b) => (st.pins[b.id] ? 1 : 0) - (st.pins[a.id] ? 1 : 0) || b.t - a.t);
}
export const unread = (items, st) => items.filter((it) => !st.muted[it.src] && !isRead(it, st)).length;
export const counts = (items, st) => { const o = {}; for (const s of SOURCES) o[s.id] = items.filter((it) => it.src === s.id && !st.muted[s.id] && !isRead(it, st)).length; return o; };
export const badge = (n) => (n > 0 ? `${n} new` : 'All quiet');
export const titleFor = (n) => (n > 0 ? `(${n}) Inbox` : 'Inbox');
/** items that are new since the page last drew (for the sparkle) */
export const fresh = (items, prevIds) => items.filter((it) => !prevIds.has(it.id));
/** the Jarvis card for this app: the unread count as the status and the first KPI */
export function card(items, st, now) {
  const n = unread(items, st), c = counts(items, st), top = items.filter((it) => !st.muted[it.src]).slice(0, 2).map((it) => clean(it.text, 100));
  const worst = items.some((it) => !st.muted[it.src] && !isRead(it, st) && it.level === 'bad') ? 'bad' : n ? 'warn' : 'ok';
  return { v: 1, name: 'Inbox', status: { level: worst, label: badge(n) }, kpis: [{ label: 'New', value: String(n) }, { label: 'Bots', value: String(c.bots) }, { label: 'System', value: String(c.system + c.argus) }],
    lines: top.length ? top : ['All quiet: your bots are fine.'], t: Math.floor(now), open: '#inbox', theme: '#13100d', stale_after: 86400 };
}
