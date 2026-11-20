// Jarvis data layer (2026-11-10, JARVIS BRAIN): reads the published JSON of the whole site and turns it into plain numbers with
// their source and age. One ES module, no imports, no DOM. Pure functions over a `sources` object (so node can test them), plus
// loadSources() that fetches the files (polite: one GET each, 8 s limit, never throws, no keys).
//
//   sources = { home, money, odeon, rules, pythia, planner, journal, ledger, compassState, at: { home: ms, ... } }
//     home    ../home.json            { accounts: [{ name, kind, conn:{connected}, eval:{balance, room, mll, dll, dll_used, target, to_target}, pnl:{today}, paused }], t }
//     money   ../money/index.json     { streams: [{ id, status, items: [{ title, detail, usd, score, expires, picked, n, win, break_even, stake_usd }], headline:{text, usd_month} }] }
//     odeon   ../odeon/trades.json    { trades: [{ id, day, usd, r, risk_usd, side, strat, entry, exit, mfe_r, mae_r, held_min, target, stop }], upto }
//     rules   ../ledger/rules.json    { limits: { builder_50k: {...} }, accounts, source: { built } }
//     pythia  ../pythia/events.json   { events: [{ date, time, kind, title, impact, verify }], updated }
//     planner this phone's 'planner.agora.v1' state · journal 'journal.v1' · ledger 'ledger.v1' · compassState 'compass.state.v1'
//   Any of them may be null: every function says so ("I don't have that") instead of guessing.
//
// Every function returns plain data; money is always in dollars, and R is dollars / the owner's usual 1R (the median risk of his
// last trades from odeon, shown with the $ it was computed from), or null when it cannot be known.

export const FILES = {
  home: '../home.json', money: '../money/index.json', odeon: '../odeon/trades.json', rules: '../ledger/rules.json', pythia: '../pythia/events.json',
};
// the Kalshi City engine's own published files (the live feed kalshi.json comes from the brain's facts: sources.kalshi)
export const KFILES = { kalshiEdges: '../kalshicity/edges.json', kalshiLog: '../kalshicity/learning_log.json', kalshiLearned: '../kalshicity/learned.json', kalshiLedger: '../kalshicity/ledger.json' };
// small cards other apps publish for Jarvis (the money copilot reads Fates' pass odds from it); day = your calendars' day, made by the PC
// (tools/calendar_sync.py); household = your bank exports' summary (tools/money_import.py): both served only on the PC's own link
// (missing on the public site: the cards leave the Work line out and the household answers say: I don't have that)
// health = your Apple Watch days (tools/me_health.py, the Me hub's me/health.json): also served only on the PC's own link
export const XFILES = { fatesCard: '../fates/jarvis.json', day: '../day/day.json', household: '../money/household.json', health: '../me/health.json' };
// the PC's private link serves the site under /site/ (engine/live_site.py; the Gate's ON_PC test): only there are day / household /
// health asked for. On the public site they never exist, so asking was a 404 in the console on every Jarvis start (phone QA 2026-11-16).
// No page (node tests) = ask for everything; opts.private overrides.
export const PRIVATE_X = ['day', 'household', 'health'];
export const onPrivateLink = () => typeof location === 'undefined' || !location || /^\/site\//.test(String(location.pathname || ''));
export const STALE_H = { home: 36, odeon: 72, money: 6, pythia: 24 * 14, rules: 24 * 30 };
const FETCH_MS = 8000;

export const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export const usd = (x, sign) => { const v = num(x); if (v == null) return '$0'; if (Math.abs(v) < 10 && Math.abs(v) >= 0.005 && Math.round(v) !== v) return (v < 0 ? '-' : sign ? '+' : '') + '$' + Math.abs(v).toFixed(2); const a = Math.abs(Math.round(v)); const s = v < 0 && a !== 0 ? '-' : sign && v > 0 ? '+' : ''; return s + '$' + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export const rtxt = (r, sign) => { const v = num(r); if (v == null) return ''; const small = Math.abs(v) < 0.1 && v !== 0, x = small ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10; return (x > 0 ? (sign === false ? '' : '+') : x < 0 ? '-' : '') + Math.abs(x).toFixed(small ? 2 : 1) + 'R'; };
export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ------------------------------------------------------------------------------------------------ time (New York)
let ETF = null;          // one formatter, made once (night-fitperf 2026-11-19: a new one per call was a real share of Jarvis's start)
export function etParts(ms) {
  try {
    const f = (ETF || (ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }))).formatToParts(new Date(ms));
    const g = (t) => (f.find((p) => p.type === t) || {}).value;
    const h = Number(g('hour')) % 24, wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
    return { day: `${g('year')}-${g('month')}-${g('day')}`, h, m: Number(g('minute')), mod: h * 60 + Number(g('minute')), dow: wd };
  } catch (_) { const d = new Date(ms); return { day: d.toISOString().slice(0, 10), h: d.getUTCHours(), m: d.getUTCMinutes(), mod: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() }; }
}
export const dowOfDay = (day) => { const [y, m, d] = String(day).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayMs = (d) => { const [y, m, dd] = String(d).split('-').map(Number); return Date.UTC(y, m - 1, dd); };
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
export function agoText(ms, now) {
  if (ms == null) return 'age unknown';
  const s = Math.max(0, (now - ms) / 1000);
  return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
}
/** when a file says it was made: its own time field (epoch s / ms or ISO), else when it was fetched */
export function fileTime(obj, fetchedAt) {
  if (isObj(obj)) for (const k of ['t', 'generated_at', 'asof', 'updated', 'upto']) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
    if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return Date.parse(v);
  }
  return fetchedAt != null ? fetchedAt : null;
}
/** the source tag of an answer: "home.json, 6 min ago" */
export function srcTag(S, name, now) {
  const file = { home: 'home.json', money: 'money/index.json', odeon: 'odeon/trades.json', rules: 'ledger/rules.json', pythia: 'pythia/events.json', kalshi: 'kalshi.json', kalshiEdges: 'kalshicity/edges.json', kalshiLog: 'kalshicity/learning_log.json', kalshiLedger: 'kalshicity/ledger.json', day: 'day/day.json (your calendars)', household: 'money/household.json', health: 'me/health.json (your Apple Watch)' }[name] || name;
  const t = S && isObj(S[name]) ? fileTime(S[name], S.at && S.at[name]) : null;
  return { file, ms: t, text: `${file}, ${agoText(t, now)}` };
}

// ------------------------------------------------------------------------------------------------ loading
async function getJson(fetchFn, url) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const tm = ac ? setTimeout(() => ac.abort(), FETCH_MS) : 0;
  try {
    const r = await fetchFn(url, ac ? { signal: ac.signal, cache: 'no-cache' } : { cache: 'no-cache' });
    if (!r || !r.ok) return null;
    const j = await r.json();
    return isObj(j) ? j : null;
  } catch (_) { return null; } finally { clearTimeout(tm); }
}
/** fetch every published file (all at once; a missing one is null). base: where '../' resolves from, default the page. */
// one fetch for callers at the same moment (day-jarvis 2026-11-20, PERF: the brain's skills and the copilot card each loaded every file on
// open: odeon/trades.json, 128 KB gz, twice): in a page, calls within 20 s with the same base share one load (each gets its own copy).
// Node tests (no document) and opts.fresh are never shared.
const SHARED = new Map();
export async function loadSources(opts) {
  const o0 = isObj(opts) ? opts : {};
  if (typeof document !== 'undefined' && !o0.fresh && !o0.raw) {
    const key = (typeof o0.base === 'string' ? o0.base : '') + '|' + String(o0.private);
    const hit = SHARED.get(key);
    if (hit && Date.now() - hit.t < 20000) { const S = await hit.p; return { ...S, at: { ...S.at } }; }
    const p = loadSourcesNow(o0); SHARED.set(key, { t: Date.now(), p });
    const S = await p; return { ...S, at: { ...S.at } };
  }
  return loadSourcesNow(o0);
}
async function loadSourcesNow(opts) {
  const o = isObj(opts) ? opts : {};
  const fetchFn = typeof o.fetch === 'function' ? o.fetch : (typeof fetch === 'function' ? fetch : null);
  const now = typeof o.now === 'function' ? (+o.now() || Date.now()) : Date.now();
  const S = { home: null, money: null, odeon: null, rules: null, pythia: null, at: {} };
  if (!fetchFn) return S;
  const base = typeof o.base === 'string' ? o.base : '';
  await Promise.all(Object.keys(KFILES).map(async (k) => { const j = await getJson(fetchFn, base + KFILES[k]); if (j) { S[k] = j; S.at[k] = now; } }));
  const priv = typeof o.private === 'boolean' ? o.private : onPrivateLink();
  await Promise.all(Object.keys(XFILES).filter((k) => priv || !PRIVATE_X.includes(k)).map(async (k) => { const j = await getJson(fetchFn, base + XFILES[k]); if (j) { S[k] = j; S.at[k] = now; } }));
  await Promise.all(Object.keys(FILES).map(async (k) => { const j = await getJson(fetchFn, base + FILES[k]); if (j) { S[k] = j; S.at[k] = now; } }));
  // SYNC (night A 2026-11-16): home.json through olympus/truth.js like the Gate, the hubs, Aegis and Helios: the PC feed laid over when it is
  // newer (withPcFeed), then the canonical account rows (canonHome), so every Jarvis answer says the same drawdown / today's $ / balance
  if (isObj(S.home) && !o.raw) {
    try { const T = await import('../olympus/truth.js'); S.home = T.canonHome(await T.withPcFeed(S.home), now / 1000); } catch (_) { /* raw home.json */ }
  }
  return S;
}
export const PEOPLE_FILE = '../olympus/people.json';               // the roster of the People kit (docs/PERSONA_API.md), when it is built
export const BUILDERS_FILE = '../ergasterion/builders.json';       // who is building what (the workshop's own file, when it is published)
/** one of Jarvis' own built files, next to the page (search-index.json, strategy-facts.json): a bare file name only, null when missing */
export async function loadJson(name, opts) {
  const o = isObj(opts) ? opts : {};
  const fetchFn = typeof o.fetch === 'function' ? o.fetch : (typeof fetch === 'function' ? fetch : null);
  if (!fetchFn || !(/^[a-z0-9][a-z0-9-]{0,40}\.json$/.test(String(name)) || name === BUILDERS_FILE || name === PEOPLE_FILE)) return null;
  return getJson(fetchFn, (typeof o.base === 'string' ? o.base : '') + name);
}
/** what this phone keeps (read only): planner, journal, ledger, compass state */
export function readLocal(storage) {
  const out = { planner: null, journal: null, ledger: null, compassState: null };
  const rd = (k) => { try { const v = storage && storage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
  out.planner = rd('planner.agora.v1'); out.journal = rd('journal.v1'); out.ledger = rd('ledger.v1'); out.compassState = rd('compass.state.v1');
  return out;
}

// ------------------------------------------------------------------------------------------------ accounts
export function accounts(S) {
  const list = isObj(S && S.home) && Array.isArray(S.home.accounts) ? S.home.accounts : [];
  return list.filter((a) => isObj(a) && !a.error).map((a) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, conn = isObj(a.conn) ? a.conn : {};
    return { name: str(a.name || a.id, 40) || 'Account', funded: String(a.kind || '').toLowerCase() === 'funded', balance: num(ev.balance), room: num(ev.room), mll: num(ev.mll), dll: num(ev.dll), dllUsed: num(ev.dll_used) || 0,
      target: num(ev.target), toTarget: num(ev.to_target), today: num(pnl.today) != null ? num(pnl.today) : num(ev.today), connected: typeof conn.connected === 'boolean' ? conn.connected : null, paused: !!a.paused,
      // a paper ledger (the cloud monitor's "Paper (cloud)", BLITZ's paper rows): never a real account (2026-11-18: its low room read like a real emergency)
      paper: String(a.kind || '').toLowerCase() === 'paper' || String(a.source || '').toLowerCase() === 'cloud' || String(a.badge || '').toUpperCase() === 'PAPER' || /\bcloud\b|^cloud_paper$/i.test(String(a.id || '') + ' ' + String(a.name || '')) };
  });
}
export const worstAccount = (accts) => accts.filter((a) => a.room != null && a.mll).sort((x, y) => x.room / x.mll - y.room / y.mll)[0] || null;

// ------------------------------------------------------------------------------------------------ trades
export function trades(S) {
  const list = isObj(S && S.odeon) && Array.isArray(S.odeon.trades) ? S.odeon.trades : [];
  return list.filter((t) => isObj(t) && /^\d{4}-\d{2}-\d{2}/.test(String(t.day || '')) && num(t.usd) != null).map((t) => ({ ...t, usd: num(t.usd), r: num(t.r), risk: num(t.risk_usd) }))
    .sort((a, b) => (a.day === b.day ? (num(a.entry && a.entry.t) || 0) - (num(b.entry && b.entry.t) || 0) : a.day < b.day ? -1 : 1));
}
/** the owner's usual 1R in dollars: the median risk of his last 30 trades (null when none) */
export function usualR(S) {
  const r = trades(S).slice(-30).map((t) => t.risk).filter((x) => x != null && x > 0).sort((a, b) => a - b);
  return r.length ? r[Math.floor(r.length / 2)] : null;
}
export const asR = (usdv, S) => { const u = usualR(S); return u && num(usdv) != null ? Math.round((usdv / u) * 10) / 10 : null; };
/** "$1,420 (3.3R)" when 1R is known, else "$1,420" */
export function both(usdv, S, sign) { const r = asR(usdv, S); return usd(usdv, sign) + (r != null ? ` (${rtxt(r, !!sign)})` : ''); }

/** best / worst weekday: buckets of Monday..Friday with n, net $, net R, average $. */
export function byWeekday(S) {
  const b = {};
  for (const t of trades(S)) { const d = dowOfDay(t.day); const k = b[d] || (b[d] = { dow: d, name: DOW[d], n: 0, usd: 0, r: 0, rn: 0, wins: 0 }); k.n++; k.usd += t.usd; if (t.r != null) { k.r += t.r; k.rn++; } if (t.usd > 0) k.wins++; }
  return Object.values(b).filter((x) => x.dow >= 1 && x.dow <= 5).map((x) => ({ ...x, avg: x.usd / x.n, avgR: x.rn ? x.r / x.rn : null }));
}
export function stats(list) {
  const n = list.length; if (!n) return null;
  const wins = list.filter((t) => t.usd > 0), losses = list.filter((t) => t.usd < 0);
  const gw = wins.reduce((s, t) => s + t.usd, 0), gl = -losses.reduce((s, t) => s + t.usd, 0);
  const rs = list.map((t) => t.r).filter((x) => x != null);
  return { n, wins: wins.length, losses: losses.length, winRate: wins.length / n, net: list.reduce((s, t) => s + t.usd, 0), pf: gl > 0 ? gw / gl : null, avgR: rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null, netR: rs.length ? rs.reduce((s, x) => s + x, 0) : null };
}

// ------------------------------------------------------------------------------------------------ money streams, deals
export function streams(S) { return isObj(S && S.money) && Array.isArray(S.money.streams) ? S.money.streams.filter((s) => isObj(s) && str(s.id)) : []; }
export function expiresMs(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return null;
  const t = v.trim(), ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T23:59:59Z' : t);
  return Number.isFinite(ms) ? ms : null;
}
/** dated deals still running, soonest first: [{ title, usd, hours, stream, sample }] */
export function deals(S, now) {
  const out = [];
  for (const s of streams(S)) for (const i of Array.isArray(s.items) ? s.items : []) {
    if (!isObj(i) || !str(i.title)) continue;
    const em = expiresMs(i.expires); if (em == null || em < now) continue;
    out.push({ title: str(i.title, 90), usd: num(i.usd), hours: (em - now) / 3600000, stream: str(s.id, 20), sample: s.status === 'sample', score: num(i.score) });
  }
  return out.sort((a, b) => a.hours - b.hours);
}

// ------------------------------------------------------------------------------------------------ calendar (Pythia)
export const EVENT_WORDS = { cpi: /\bcpi\b|consumer price/i, fomc: /\bfomc\b|fed (rate|decision)|rate decision|powell/i, nfp: /\bnfp\b|non-?farm|jobs report|payroll/i, ppi: /\bppi\b|producer price/i, gdp: /\bgdp\b/i, pce: /\bpce\b/i, opex: /\bopex\b|options expir|expiry|triple witching/i, claims: /jobless|claims/i };
export function events(S) {
  const list = isObj(S && S.pythia) && Array.isArray(S.pythia.events) ? S.pythia.events : [];
  return list.filter((e) => isObj(e) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))).map((e) => ({ date: e.date, time: str(e.time, 12), kind: str(e.kind, 20), title: str(e.title, 100), impact: str(e.impact, 10).toLowerCase(), verify: !!e.verify }))
    .sort((a, b) => (a.date === b.date ? (a.time < b.time ? -1 : 1) : a.date < b.date ? -1 : 1));
}
export function nextEvents(S, now, word, n) {
  const today = etParts(now).day;
  const p = etParts(now), hmNow = String(p.h).padStart(2, '0') + ':' + String(p.m).padStart(2, '0');
  let list = events(S).filter((e) => e.date > today || (e.date === today && (!/^\d{2}:\d{2}/.test(e.time) || e.time.slice(0, 5) >= hmNow)));
  if (word && EVENT_WORDS[word]) list = list.filter((e) => EVENT_WORDS[word].test(e.title + ' ' + e.kind));
  return list.slice(0, n || 3).map((e) => ({ ...e, inDays: daysBetween(today, e.date) }));
}

// ------------------------------------------------------------------------------------------------ journal
export function ratedIds(journal) {
  const s = new Set();
  if (isObj(journal) && isObj(journal.entries)) for (const [id, e] of Object.entries(journal.entries).slice(0, 5000)) if (isObj(e) && ['plan', 'hesitated', 'interfered'].includes(e.rating)) s.add(String(id));
  return s;
}
export function unrated(S, now, days) {
  const from = new Date(now - (days || 14) * 86400000).toISOString().slice(0, 10), rated = ratedIds(S && S.journal);
  return trades(S).filter((t) => t.day >= from && !rated.has(String(t.id)));
}

// ------------------------------------------------------------------------------------------------ feeds
/** [{ name, file, ageH, stale, missing }] */
export function feedHealth(S, now) {
  const out = [];
  for (const k of Object.keys(FILES)) {
    const present = isObj(S && S[k]);
    const t = present ? fileTime(S[k], S.at && S.at[k]) : null;
    const ageH = t != null ? Math.max(0, (now - t) / 3600000) : null;
    out.push({ name: k, file: srcTag(S, k, now).file, ageH, missing: !present, stale: present && ageH != null && ageH > STALE_H[k] });
  }
  return out;
}
