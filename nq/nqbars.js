// NQ chart feed (ES module, pure: no DOM, no network, no storage; node-tested by tests/test_pc_bars.py d and tests/test_nq_chart.py).
// The PC's "le-bars" post (tools/pc_report.py pack_bars: the latest NQ 5-minute bars from its NinjaTrader + every open trade and today's
// closed trades per account, by label, never an id) on its own public ntfy topic (status_feed.json "bars_topic", else the status topic
// + "-bars"), read the way pc_feed.js polls ntfy (/json?poll=1). nqchart.js draws what model() says with TradingView Lightweight Charts.
//   feedUrls(feed)            -> the poll URLs: since=latest (the newest post only, ~4 KB), then a 12-hour window (ntfy keeps 12 hours)
//   parse(ndjsonText)         -> the newest valid le-bars post of an ntfy /json?poll=1 answer, or null
//   unpack(post)              -> [[t, open, high, low, close], ...] oldest first (t = the bar's open, unix seconds); [] for junk
//   model(post, acct, nowS)   -> everything the card shows: candles (times shifted to New York wall time), markers, price lines,
//                                the trades list, the chips' counts, the "as of" line, the state (none / ok / old) and its message
// Never fake data: no post = state 'none' and the plain sentence; nothing is ever invented.
export const KIND = 'le-bars';
export const TF = 300;
export const FRESH_S = 80 * 60;          // newer than this = live (the PC sends candles about hourly in the bots' hours); older = "the PC's last bars"
export const VIEW_BARS = 78;             // the first view: the last 6.5 hours (the scroll and the pinch reach the rest)
export const ACCTS = [                   // the owner's filter (2026-11-18): All / Zlarior 50K / Zlarior 25K #2 / ATLAS funded
  { k: 'all', name: 'All' },
  { k: 'z50k', name: 'Zlarior 50K', tag: 'Z50', color: 'gold' },
  { k: 'z25k2', name: 'Zlarior 25K #2', tag: 'Z25 #2', color: 'aegean' },
  { k: 'atlas25f', name: 'ATLAS funded', tag: 'ATLAS', color: 'mauve' },
];
const OTHER_COLORS = ['sand', 'olive', 'rose'];
// the PC's pace (tools/pc_report.py, at most 24 posts a day: ntfy's free cap): candles about hourly while the bots trade, the trades at once
export const EVERY = 'New bars come from its NinjaTrader about every hour while the bots trade (01:50-16:10 ET) and right after each entry or exit';
const WHY = { TARGET: 'Target hit', STOP: 'Stop hit', BE: 'Break-even stop', TIME: 'Time exit', EOD: 'Flat by the close', FLAT: 'Flat by the close',
  TRAIL: 'Trailing stop', LIT: 'Closed for a LIT trade', DLL: 'Daily loss limit', DAILY: 'Daily loss limit', MANUAL: 'Closed by hand', KILL: 'Closed by the kill switch' };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const int = (v) => { const x = num(v); return x == null ? null : Math.round(x); };
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 40);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------------------------------------ the feed
export function feedUrls(feed) {
  if (!isObj(feed)) return [];
  const base = String(feed.ntfy || 'https://ntfy.sh').replace(/\/+$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(base)) return [];
  let topic = String(feed.bars_topic || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    const t = String(feed.topic || '');
    if (!/^[A-Za-z0-9_-]{1,59}$/.test(t)) return [];
    topic = t + '-bars';
  }
  const e = encodeURIComponent(topic);
  return [`${base}/${e}/json?poll=1&since=latest`, `${base}/${e}/json?poll=1&since=12h`];
}

function valid(j) {
  return isObj(j) && j.kind === KIND && int(j.n) > 0 && Array.isArray(j.b) && j.b.length === 4 * int(j.n) && num(j.t0) != null && num(j.p0) != null;
}
// INTEGRITY (day-security2 2026-11-20): anyone can post to the public chart topic. A post dated more than SKEW_S ahead is never
// believed; with status_feed.json "vk" (tools/status_sign.py), parseVerified keeps only the PC's signed posts. A phone that cannot
// check at all (no WebCrypto, the key does not import) reads the chart exactly as before.
export const SKEW_S = 600;
const SIG_FIELD = ',"sg":"', SIG_RX = /^[A-Za-z0-9_-]{86}$/, VK_RX = /^[A-Za-z0-9_-]{87}$/;
const tooNew = (j, m, now) => [j.t, j.rt, j.t0, obj(m).time].some((x) => num(x) != null && num(x) > now + SKEW_S);
export function parse(text, nowS) {
  let best = null, bestT = -1;
  const now = num(nowS) != null ? num(nowS) : Date.now() / 1000;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let m, j;
    try { m = JSON.parse(line); } catch (e) { continue; }
    if (!isObj(m) || (m.event && m.event !== 'message') || typeof m.message !== 'string') continue;
    try { j = JSON.parse(m.message); } catch (e) { continue; }
    if (!valid(j) || tooNew(j, m, now)) continue;
    const t = num(j.rt) || num(m.time) || num(j.t) || 0;
    if (t >= bestT) { best = j; bestT = t; }
  }
  return best;
}

const unb64u = (x) => { const t = String(x), b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const KEYS = new Map();
async function importVk(vk) {
  const S = (typeof crypto !== 'undefined' && crypto.subtle) || null;
  if (!S || !VK_RX.test(String(vk || ''))) return null;
  try {
    if (!KEYS.has(vk)) KEYS.set(vk, S.importKey('raw', unb64u(vk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
    return { S, key: await KEYS.get(vk) };
  } catch (e) { KEYS.delete(vk); return null; }
}
/** true when the message text carries the PC's signature under vk (the exact bytes before ,"sg":"...") */
export async function verifyText(text, vk) {
  const k = await importVk(vk), t = String(text || '');
  if (!k || !t.endsWith('"}')) return false;
  const i = t.lastIndexOf(SIG_FIELD), sig = i > 0 ? t.slice(i + SIG_FIELD.length, -2) : '';
  if (!SIG_RX.test(sig)) return false;
  try { return await k.S.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.key, unb64u(sig), new TextEncoder().encode('le-status-v1\n' + t.slice(0, i) + '}')); } catch (e) { return false; }
}
/** parse() over the signed lines only, when the feed pins a vk; otherwise (or on a phone that cannot check) parse() as before */
export async function parseVerified(text, feed, nowS) {
  const vk = obj(feed).vk;
  if (!vk || !(await importVk(vk))) return parse(text, nowS);
  const keep = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch (e) { continue; }
    if (isObj(m) && typeof m.message === 'string' && await verifyText(m.message, vk)) keep.push(line);
  }
  return parse(keep.join('\n'), nowS);
}

export function unpack(post) {
  if (!valid(post)) return [];
  const p = post, n = int(p.n), tf = int(p.tf) || TF, tick = num(p.tick) || 0.25, b = p.b, gaps = new Map();
  for (const g of arr(p.g)) if (Array.isArray(g) && g.length >= 2 && int(g[0]) != null && int(g[1]) != null) gaps.set(int(g[0]), int(g[1]));
  const out = [];
  let prev = int(p.p0), t = int(p.t0);
  for (let i = 0; i < n; i += 1) {
    const d = [b[4 * i], b[4 * i + 1], b[4 * i + 2], b[4 * i + 3]].map(int);
    if (d.some((x) => x == null)) return [];
    if (i) t = gaps.has(i) ? gaps.get(i) : t + tf;
    const o = prev + d[0];
    out.push([t, o * tick, (o + d[1]) * tick, (o - d[2]) * tick, (o + d[3]) * tick]);
    prev = o + d[3];
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ words, time
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function px(x) { const v = num(x); return v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function ageWords(sec) {
  const s = Math.max(0, Math.floor(num(sec) || 0));
  if (s < 60) return 'less than a minute';
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return plural(d, 'day') + (h ? ' ' + plural(h, 'hour') : '');
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let ETF = null;
function etFmt() {
  if (ETF === null) {
    try { ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }); } catch (e) { ETF = false; }
  }
  return ETF;
}
/** New York wall time of an epoch in seconds: { day, hm, wd, off (seconds to add to UTC to get New York time) } */
export function et(t) {
  const v = num(t); if (v == null) return null;
  const f = etFmt();
  if (f) {
    try {
      const p = {}; for (const x of f.formatToParts(new Date(v * 1000))) p[x.type] = x.value;
      const hh = p.hour === '24' ? '00' : p.hour;
      const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +hh, +p.minute, +p.second) / 1000;
      return { day: `${p.year}-${p.month}-${p.day}`, hm: `${hh}:${p.minute}`, wd: WD.indexOf(p.weekday), off: Math.round(wall - Math.floor(v)) };
    } catch (e) { /* the fallback below */ }
  }
  const off = usOffset(v), d = new Date((v + off) * 1000), z = (n) => String(n).padStart(2, '0');   // no Intl time zones: US rules
  return { day: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`, hm: `${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`, wd: d.getUTCDay(), off };
}
function usOffset(t) {          // New York: -4 h from the 2nd Sunday of March 07:00 UTC to the 1st Sunday of November 06:00 UTC, else -5 h
  const y = new Date(t * 1000).getUTCFullYear(), sun = (m, k) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + 7 * (k - 1); };
  const a = Date.UTC(y, 2, sun(2, 2), 7) / 1000, b = Date.UTC(y, 10, sun(10, 1), 6) / 1000;
  return t >= a && t < b ? -4 * 3600 : -5 * 3600;
}
const dayWord = (t, nowS) => { const a = et(t), b = et(nowS); if (!a) return ''; return b && a.day === b.day ? '' : `${WD[a.wd] || ''} `; };
export const hm = (t, nowS) => { const p = et(t); return p ? `${dayWord(t, nowS)}${p.hm} ET` : '-'; };

// ------------------------------------------------------------------------------------------------ accounts
function accounts(post) {
  const ac = obj(post && post.ac), out = {};
  let x = 0;
  for (const a of ACCTS) if (a.k !== 'all') out[a.k] = { ...a, badge: null, inFeed: false };
  for (const [k, v] of Object.entries(ac)) {
    if (!/^[a-z0-9_]{1,24}$/.test(k)) continue;
    const label = str(Array.isArray(v) ? v[0] : '', 32), bot = str(Array.isArray(v) ? v[1] : '', 8), badge = str(Array.isArray(v) ? v[2] : '', 6);
    if (out[k]) { out[k].inFeed = true; out[k].bot = bot || null; out[k].badge = /^(LIVE|SIM|PAPER)$/.test(badge) ? badge : null; continue; }
    out[k] = { k, name: label || `Account ${k}`, tag: (label || k).replace(/^Account\s*/, 'Acct ').slice(0, 10), color: OTHER_COLORS[x++ % OTHER_COLORS.length], bot: bot || null,
      badge: /^(LIVE|SIM|PAPER)$/.test(badge) ? badge : null, inFeed: true };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the model
function barIndex(bars, t) {                 // the bar holding t (the last one opening at or before t); -1 before the first
  const v = num(t); if (v == null || !bars.length || v < bars[0][0]) return -1;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid][0] <= v) lo = mid; else hi = mid - 1; }
  return lo;
}
function cleanTrade(r, open) {
  if (!isObj(r) || !/^[a-z0-9_]{1,24}$/.test(String(r.k || '')) || num(r.t) == null) return null;
  const e = num(r.e);
  if (e == null) return null;
  const s = num(r.s) === -1 ? -1 : 1;
  return open
    ? { k: r.k, s, q: int(r.q), t: num(r.t), e, sl: num(r.sl), tp: num(r.tp), be: !!r.be, open: true }
    : { k: r.k, s, q: int(r.q), t: num(r.t), e, xt: num(r.xt), x: num(r.x), usd: num(r.usd), r: num(r.r), why: str(r.why, 12).toUpperCase(), open: false };
}
export function whyText(w) { const k = String(w || '').toUpperCase(); return WHY[k] || (k ? `Closed (${k.toLowerCase()})` : 'Closed'); }

/** what the card shows for one account filter ('all' or a key) at nowS (seconds) */
export function model(post, acct, nowS) {
  const now = num(nowS) != null ? num(nowS) : Date.now() / 1000;
  const want = acct && acct !== 'all' ? String(acct) : 'all';
  const A = accounts(post), bars = unpack(post);
  const chips = [{ k: 'all', name: 'All', n: 0, color: null }, ...Object.values(A).filter((a) => ACCTS.some((x) => x.k === a.k) || a.inFeed).map((a) => ({ k: a.k, name: a.name, n: 0, color: a.color }))];
  if (!bars.length) {
    return { state: 'none', acct: want, chips, candles: [], markers: [], lines: [], list: [], asOf: '', age: null, view: null, last: null,
      message: `The PC has not sent chart bars yet (it needs the new update first). ${EVERY}.` };
  }
  const opens = arr(post.open).map((r) => cleanTrade(r, true)).filter(Boolean), closed = arr(post.closed).map((r) => cleanTrade(r, false)).filter(Boolean);
  for (const r of [...opens, ...closed]) { if (!A[r.k]) A[r.k] = { k: r.k, name: `Account ${r.k}`, tag: r.k.slice(0, 8), color: 'sand', inFeed: true }; }
  for (const c of chips) c.n = c.k === 'all' ? opens.length + closed.length : opens.filter((r) => r.k === c.k).length + closed.filter((r) => r.k === c.k).length;
  for (const k of Object.keys(A)) if (!chips.some((c) => c.k === k)) chips.push({ k, name: A[k].name, color: A[k].color, n: opens.filter((r) => r.k === k).length + closed.filter((r) => r.k === k).length });
  const pick = (r) => want === 'all' || r.k === want;
  const op = opens.filter(pick), cl = closed.filter(pick);
  const tag = (k) => (A[k] ? A[k].tag : k), color = (k) => (A[k] ? A[k].color : 'sand');
  const off = (t) => { const p = et(t); return p ? p.off : 0; };
  const candles = bars.map(([t, o, h, l, c]) => ({ time: t + off(t), open: o, high: h, low: l, close: c }));
  const markers = [];
  const entry = (r) => {
    const i = barIndex(bars, r.t); if (i < 0) return;
    markers.push({ time: candles[i].time, position: r.s > 0 ? 'atPriceTop' : 'atPriceBottom', price: r.e, shape: r.s > 0 ? 'arrowUp' : 'arrowDown', color: color(r.k), size: 1.4,
      text: '', kind: 'entry', k: r.k, id: `e:${r.k}:${r.t}` });
  };
  for (const r of op) entry(r);
  for (const r of cl) {
    entry(r);
    const i = barIndex(bars, r.xt);
    // the exit: a dot over the bar for a long (it sold), under it for a short (it bought), so its $ reads clear of the candles
    if (i >= 0) markers.push({ time: candles[i].time, position: r.s > 0 ? 'aboveBar' : 'belowBar', shape: 'circle', color: (r.usd || 0) >= 0 ? 'good' : 'bad', size: 1.1,
      text: r.usd != null ? moneyS(r.usd) : '', kind: 'exit', k: r.k, id: `x:${r.k}:${r.t}` });
  }
  markers.sort((a, b) => a.time - b.time || (a.kind === b.kind ? 0 : a.kind === 'entry' ? -1 : 1));
  // the open trades' lines: one per price and kind (the 50K and the 25K #2 take the same signal: one stop line says "Z50 + Z25 #2 stop")
  const L = new Map();
  for (const r of op) {
    for (const [kind, p, c] of [['entry', r.e, color(r.k)], ['stop', r.sl, 'bad'], ['target', r.tp, 'good']]) {
      if (p == null) continue;
      const key = `${kind}:${p}`, it = L.get(key) || { kind, price: p, color: c, keys: [] };
      if (!it.keys.includes(r.k)) it.keys.push(r.k);
      L.set(key, it);
    }
  }
  const groups = new Set([...L.values()].map((x) => x.keys.join('+'))), tagged = groups.size > 1;
  const word = (x) => (x.kind === 'stop' && op.some((r) => r.be && r.sl === x.price) ? 'Stop (BE)' : x.kind === 'stop' ? 'Stop' : x.kind === 'target' ? 'Target' : 'Entry');
  const lines = [...L.values()].map((x) => ({ ...x, title: `${tagged ? x.keys.map(tag).join(' + ') + ' ' : ''}${word(x)}`, style: x.kind === 'entry' ? 'dashed' : 'solid' }));
  const prices = lines.map((x) => x.price);
  const extent = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  // the trades list, newest first: what each one did, in $
  const list = [...op.map((r) => ({ ...r, last: r.t })), ...cl.map((r) => ({ ...r, last: r.xt || r.t }))].sort((a, b) => b.last - a.last).map((r) => {
    const side = r.s > 0 ? 'Long' : 'Short', size = r.q ? ` ${plural(r.q, 'micro')}` : '';
    return { k: r.k, name: A[r.k] ? A[r.k].name : r.k, tag: tag(r.k), color: color(r.k), open: r.open, t: r.t, xt: r.xt || null, s: r.s,
      head: `${side}${size} at ${px(r.e)}`, when: r.open ? `Opened ${hm(r.t, now)}` : `${hm(r.t, now)} to ${r.xt ? hm(r.xt, now) : '?'}`,
      detail: r.open ? `Stop ${px(r.sl)}${r.be ? ' (break-even)' : ''} · target ${px(r.tp)}` : `${whyText(r.why)} at ${px(r.x)}`,
      usd: r.open ? null : r.usd, money: r.open ? 'Open' : moneyS(r.usd), sign: r.open ? '' : (r.usd || 0) > 0.5 ? 'pos' : (r.usd || 0) < -0.5 ? 'neg' : '',
      bi: barIndex(bars, r.t), bx: r.xt != null ? barIndex(bars, r.xt) : -1, onChart: barIndex(bars, r.t) >= 0 || (r.xt != null && barIndex(bars, r.xt) >= 0) };
  });
  // the first view: the last 6.5 hours, stretched back to an open trade's entry (never wider than every bar)
  const n = bars.length;
  let from = Math.max(0, n - VIEW_BARS);
  for (const r of op) { const i = barIndex(bars, r.t); if (i >= 0) from = Math.min(from, Math.max(0, i - 6)); }
  if (want !== 'all') for (const r of cl) { const i = barIndex(bars, r.t), j = barIndex(bars, r.xt); const k = i >= 0 ? i : j; if (k >= 0) from = Math.min(from, Math.max(0, k - 16)); }
  const dataT = num(post.t) || bars[n - 1][0] + TF, age = Math.max(0, now - dataT), state = age <= FRESH_S ? 'ok' : 'old';
  const tt = num(post.tt), lagged = tt != null && dataT - tt > 20 * 60;
  const sym = str(post.sym, 24);
  let asOf = `As of ${hm(dataT, now)}, from the PC (${age < 90 ? 'just now' : ageWords(age) + ' ago'})${sym ? ` · ${sym}` : ''}.`;
  if (lagged) asOf += ` Trades as of ${hm(tt, now)} (the bot's last report).`;
  const lastC = bars[n - 1][4];
  const message = state === 'ok' ? '' : `These are the PC's last bars (${hm(dataT, now)}, ${ageWords(age)} ago). ${EVERY}.`;
  const none = !op.length && !cl.length ? (want === 'all' ? 'No trade today yet. Quiet days are normal: the plan is 2 to 4 trades a week.'
    : `No trade on ${A[want] ? A[want].name : 'this account'} today.`) : '';
  return { state, acct: want, chips, candles, markers, lines, extent, list, asOf, age, dataT, message, none, last: lastC, forming: num(post.f) === 1,
    view: { from, to: n - 1 }, n, first: bars[0][0], open: op.length, closed: cl.length,
    label: `NQ 5-minute chart, ${n} bars from ${hm(bars[0][0], now)} to ${hm(bars[n - 1][0] + TF, now)}, last price ${px(lastC)}. ${plural(op.length, 'open trade')}, ${plural(cl.length, 'closed trade')}${want === 'all' ? '' : ' on ' + (A[want] ? A[want].name : want)}.` };
}
