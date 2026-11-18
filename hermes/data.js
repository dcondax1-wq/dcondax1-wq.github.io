// HERMES data: formatting, wrapped.json (tools/hermes/build.py) and the peers it tells stories about. Read-only.
//   loadWrapped(demo)  -> {w, demo}: wrapped.json, else demo.json (the fixture, shown with a DEMO badge)
//   loadPeers()        -> {fates, discovery, kalshi, planner}: each null when missing; never throws, 4 s per file
// Peers: ../fates/jarvis.json (pass odds), ../datacity/discoveries.json, the Kalshi bot's kalshi.json (its own public repo,
// raw first, the GitHub API second, like kalshi/kalshi.js) and the Planner's localStorage on this phone (same site).
// Safari 16 safe: no lookbehind, no Array copy methods, no AbortSignal.timeout.

export const TZ = 'America/New_York';
const MINUS = '−';
const KALSHI = ['../kalshi.json', 'https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json',
  'https://api.github.com/repos/demetrades2000-coder/kalshi-feed/contents/kalshi.json?ref=main'];

// ------------------------------------------------------------------------------------------------ helpers
export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const x = +v.replace(/[$,%\s]/g, '');
  return Number.isFinite(x) ? x : null;
};
export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const arr = (v) => (Array.isArray(v) ? v : []);
export const txt = (v, n = 200) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** '+$1,234.50' / '−$56.00' (real minus); cents=false rounds to whole dollars. */
export function usd(v, { sign = true, cents = true } = {}) {
  const x = num(v);
  if (x == null) return '—';
  const d = cents ? 2 : 0, r = Math.round(Math.abs(x) * 10 ** d) / 10 ** d;
  const s = '$' + r.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return r === 0 ? s : x < 0 ? MINUS + s : sign ? '+' + s : s;
}
export const tone = (v) => { const x = num(v); return x == null || Math.abs(x) < 0.005 ? 'flat' : x > 0 ? 'up' : 'down'; };
export const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
export function dayLabel(iso, opts = { month: 'short', day: 'numeric' }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}
export const span = (p) => `${dayLabel(p.from)} – ${dayLabel(p.to)}`;

// An optional file that answered 404 is not asked again for 6 hours: a browser logs every 404 as a console error, this keeps it to one per phone.
const GONE_KEY = 'opt404.', GONE_MS = 6 * 3600e3;
const wasGone = (u) => { try { const t = +localStorage.getItem(GONE_KEY + u); return !!t && Date.now() - t < GONE_MS; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem(GONE_KEY + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function getJSON(url, ms = 4000, opts = {}) {
  const optional = !!opts.optional;
  if (optional) { opts = { ...opts }; delete opts.optional; if (wasGone(url)) return null; }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-cache', ...opts, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) { if (optional && r.status === 404) markGone(url); return null; }
    return await r.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------------------------------------ wrapped.json
export const validWrapped = (w) => isObj(w) && w.kind === 'olympus-wrapped' && isObj(w.periods) && isObj(w.periods.week);

export async function loadWrapped(forceDemo) {
  if (!forceDemo) {
    const w = await getJSON('wrapped.json?t=' + Math.floor(Date.now() / 60e3), 6000);
    if (validWrapped(w)) return { w, demo: !!w.demo };
  }
  const d = await getJSON('demo.json', 6000);
  return validWrapped(d) ? { w: d, demo: true } : { w: null, demo: true };
}

// ------------------------------------------------------------------------------------------------ peers
/** Pass odds from the Fates app's Jarvis card (a kpi whose label says pass / odds). */
export function fatesOdds(j) {
  if (!isObj(j)) return null;
  for (const k of arr(j.kpis)) {
    if (isObj(k) && /pass|odds/i.test(txt(k.label)) && txt(k.value)) return { label: txt(k.label, 20), value: txt(k.value, 24), status: txt((j.status || {}).label, 48) };
  }
  return null;
}

/** The newest Data City discovery: a list, or {discoveries | items | list: [...]}; any of the usual text keys. */
export function discovery(j) {
  const list = Array.isArray(j) ? j : isObj(j) ? arr(j.discoveries || j.items || j.list || j.top) : [];
  const rows = list.filter(isObj).map((d) => ({
    title: txt(d.title || d.headline || d.name, 90),
    text: txt(d.text || d.detail || d.summary || d.insight || d.body || d.why, 260),
    usd: num(d.usd != null ? d.usd : d.dollars != null ? d.dollars : d.edge_usd != null ? d.edge_usd : d.value_usd),
    stat: txt(d.stat || d.metric || d.value, 40),
    t: num(d.t) || num(d.ts) || (Date.parse(txt(d.date || d.day || d.when)) / 1000) || 0,
  })).filter((d) => d.title || d.text);
  if (!rows.length) return null;
  rows.sort((a, b) => b.t - a.t);
  return rows[0];
}

const days = (k) => {
  const out = [];
  if (Array.isArray(k.days)) for (const d of k.days) {
    if (Array.isArray(d) && num(d[1]) != null) out.push([txt(d[0], 10), num(d[1])]);
    else if (isObj(d) && num(d.pnl) != null) out.push([txt(d.day || d.date, 10), num(d.pnl)]);
  } else if (isObj(k.days)) for (const [d, v] of Object.entries(k.days)) if (num(v) != null) out.push([d.slice(0, 10), num(v)]);
  return out;
};
/** The Kalshi bot's numbers for one period of wrapped ({from, to, key}). */
export function kalshiPeriod(k, p) {
  if (!isObj(k)) return null;
  const D = days(k), inP = D.filter(([d]) => d >= p.from && d <= p.to);
  const net = p.key === 'week' && num(k.week_pnl) != null && p.label === 'This week' ? num(k.week_pnl)
    : p.key === 'all' && num(k.total_pnl) != null ? num(k.total_pnl) : inP.reduce((s, [, v]) => s + v, 0);
  const strat = arr(k.strategies).filter(isObj);
  const wins = strat.reduce((s, x) => s + (num(x.wins) || 0), 0), losses = strat.reduce((s, x) => s + (num(x.losses) || 0), 0);
  const top = strat.slice().sort((a, b) => (num(b.total_pnl) || 0) - (num(a.total_pnl) || 0))[0];
  return { net: Math.round(net * 100) / 100, balance: num(k.balance), days: inP, wins, losses, running: k.running !== false,
    name: txt(k.name, 40) || 'Kalshi', top: top ? { name: txt(top.name, 40), pnl: num(top.total_pnl) } : null, t: num(k.t) };
}

async function kalshiFeed() {
  for (const [i, u] of KALSHI.entries()) {
    let j = await getJSON(/api\.github\.com/.test(u) ? u : u + '?t=' + Date.now(), 4000, /api\.github\.com/.test(u) ? { headers: { Accept: 'application/vnd.github.raw+json' } } : {});
    if (j && j.encoding === 'base64' && typeof j.content === 'string') {
      try { j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)))); } catch (_) { j = null; }
    }
    if (isObj(j) && (num(j.balance) != null || Array.isArray(j.days) || num(j.total_pnl) != null)) return j;
  }
  return null;
}

const LS = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
const dateOf = (v) => { const s = txt(v, 30); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const x = num(v); return x ? new Date(x > 1e12 ? x : x * 1000).toISOString().slice(0, 10) : ''; };
/** The Planner's tasks and habits on this phone for one period: done, still open, habit check-ins. null without a Planner. */
export function plannerPeriod(p, S = LS('planner.v1') || LS('planner.hosted.v1')) {
  if (!isObj(S)) return null;
  const tasks = arr(S.tasks).filter(isObj), habits = arr(S.habits).filter(isObj);
  const inP = (d) => d && d >= p.from && d <= p.to;
  const done = tasks.filter((t) => t.done && inP(dateOf(t.doneAt || t.done_at || t.completed || t.date)));
  const open = tasks.filter((t) => !t.done && dateOf(t.date) && dateOf(t.date) <= p.to);
  const H = habits.map((h) => {
    const log = Array.isArray(h.log || h.done || h.days) ? (h.log || h.done || h.days).map(dateOf)
      : isObj(h.log || h.done || h.days) ? Object.keys(h.log || h.done || h.days).filter((k) => (h.log || h.done || h.days)[k]).map(dateOf) : [];
    return { name: txt(h.name || h.title, 40), n: log.filter(inP).length };
  }).filter((h) => h.name);
  const events = arr(S.events).filter((e) => isObj(e) && inP(dateOf(e.date))).length;
  if (!done.length && !open.length && !H.length && !events) return null;
  return { done: done.length, open: open.length, events, habits: H.sort((a, b) => b.n - a.n).slice(0, 4),
    top: done.slice(-3).map((t) => txt(t.title || t.name, 60)).filter(Boolean) };
}

export async function loadPeers() {
  const [fates, dc, kalshi] = await Promise.all([getJSON('../fates/jarvis.json'), getJSON('../datacity/discoveries.json', 4000, { optional: true }), kalshiFeed()]);
  return { fates: fatesOdds(fates), discovery: discovery(dc), kalshi };
}
