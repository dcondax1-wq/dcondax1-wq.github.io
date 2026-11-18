// KAIROS core (ES module, no DOM, no network): "the right moment". The trading day in New York time, the windows the bots work in, what they do now, today's trades on the clock and the history of
// dollars by hour. Pure, so tests/test_kairos_page.py runs it in node. Every time is America/New_York wall-clock time, so the 02:00 London start and the 15:30 last entry never move when the clocks change;
// the clocks DO change the length of the day (Sun 1 Nov 2026 has 25 hours, Sun 8 Mar 2026 has 23), so durations are measured on the real timeline, never by subtracting wall-clock times.
// Read only: it shows what the bots do, it never places or changes anything. Money words: every dollar sits next to its R. No claim is made about an hour with fewer than 3 trades.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.floor(x * 100 + 0.5) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120);
export const money = (x) => { const v = r2(num(x) == null ? 0 : x); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
export const moneyS = (x) => { const v = num(x) == null ? 0 : x; return (r2(v) > 0 ? '+' : '') + money(v); };
export const rS = (r) => { const x = Math.round(r * 10) / 10; return (x > 0 ? '+' : x < 0 ? '-' : '') + Math.abs(x).toFixed(1) + 'R'; };
/** a dollar result with its R: "+$437 (+1.0R)"; the R is marked ~ when it is worked out from a typical risk instead of the trade's own */
export const both = (usd, r, riskUsd) => (r != null ? `${moneyS(usd)} (${rS(r)})` : riskUsd > 0 ? `${moneyS(usd)} (~${rS(usd / riskUsd)})` : `${moneyS(usd)} (~${rS(usd / TYPICAL_RISK)})`);
export const TYPICAL_RISK = 300;
export const hhmm = (mod) => `${String(Math.floor(mod / 60) % 24).padStart(2, '0')}:${String(mod % 60).padStart(2, '0')}`;
export const duration = (mins) => { if (mins == null) return ''; const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60; return d >= 1 ? `${d} day${d === 1 ? '' : 's'} ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };

// ------------------------------------------------------------------ the New York clock
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function etParts(date) {
  const o = {}; for (const p of fmt.formatToParts(date)) o[p.type] = p.value;
  const h = parseInt(o.hour, 10) % 24, m = parseInt(o.minute, 10);
  return { wd: WD[o.weekday], h, m, mod: h * 60 + m, ymd: `${o.year}-${o.month}-${o.day}`, hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** the real instant of 00:00 New York time on a date */
export function etMidnight(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  for (const h of [4, 5]) { const t = Date.UTC(y, m - 1, d, h, 0, 0); const e = etParts(new Date(t)); if (e.ymd === ymd && e.mod === 0) return t; }
  return Date.UTC(y, m - 1, d, 5, 0, 0);
}
/** minutes in a New York calendar day: 1440, except 1500 when the clocks go back and 1380 when they go forward */
export const dayMinutes = (ymd) => Math.round((etMidnight(addDays(ymd, 1)) - etMidnight(ymd)) / 60000);
export function dstInfo(ymd) {
  const n = dayMinutes(ymd);
  if (n === 1500) return { kind: 'back', minutes: n, text: 'The clocks go back today: 01:00 to 02:00 happens twice and the day is 25 hours long. The bots use New York wall-clock time, so 02:00 London entries and the 15:30 last entry stay where they are.' };
  if (n === 1380) return { kind: 'forward', minutes: n, text: 'The clocks go forward today: 02:00 to 03:00 does not exist and the day is 23 hours long. The bots use New York wall-clock time, so the 15:30 last entry stays where it is.' };
  return { kind: 'none', minutes: n, text: '' };
}

// ------------------------------------------------------------------ the day's windows (minutes since midnight, New York)
export const WINDOWS = [
  { id: 'asia', label: 'Asia slot', from: 1080, to: 120, who: 'paper copy only', tone: 'info', note: 'LIT\'s Asia slot, simulated; never a real order' },
  { id: 'london', label: 'London entries', from: 120, to: 480, who: 'LIT', tone: 'ok', note: 'LIT looks for a sweep; most trades come here' },
  { id: 'nyam', label: 'New York morning', from: 480, to: 720, who: 'LIT, BLITZ paper from 11:00', tone: 'ok', note: 'LIT can still enter; BLITZ (paper) starts checking at 11:00' },
  { id: 'nypm', label: 'New York afternoon', from: 720, to: 930, who: 'LIT, BLITZ paper', tone: 'ok', note: 'entries stop at 15:30' },
  { id: 'winddown', label: 'No new trades', from: 930, to: 955, who: 'LIT closes open trades', tone: 'warn', note: 'last entry was 15:30; open trades are closed at 15:55' },
  { id: 'flat', label: 'Flat time', from: 955, to: 970, who: 'everything closed', tone: 'warn', note: 'flat at 15:55; MFFU needs flat by 16:10' },
  { id: 'idle', label: 'Quiet', from: 970, to: 1020, who: 'nothing', tone: 'off', note: 'flat, waiting for the CME break' },
  { id: 'break', label: 'CME break', from: 1020, to: 1080, who: 'no prices', tone: 'off', note: 'the exchange pauses; nothing trades' },
];
export const MARKS = [[120, '02:00', 'London entries start'], [930, '15:30', 'Last entry'], [955, '15:55', 'Bots flat'], [970, '16:10', 'MFFU flat'], [1020, '17:00', 'CME break'], [1080, '18:00', 'Market reopens']];
export const PHASE_TEXT = {
  closed: 'The futures market is closed. No bot trades; they restart when it reopens, Sunday 18:00 New York time.',
  break: 'CME maintenance break, 17:00 to 18:00. There are no prices, so nothing trades and the bots wait.',
  asia: 'Evening and Asia hours. LIT itself waits for 02:00. Only its paper Asia-slot copy may trade now, and it never places a real order.',
  london: 'London morning. LIT is watching the key levels for a sweep and takes at most one trade a day. Most entries happen now.',
  nyam: 'New York morning. LIT can still enter if it has not traded today. BLITZ (paper) starts checking at 11:00.',
  nypm: 'New York afternoon. LIT can still enter until 15:30. BLITZ (paper) checks every 30 minutes until 15:30.',
  winddown: 'No new entries since 15:30. Anything still open is closed at 15:55.',
  flat: 'Flat time. The bots close everything at 15:55 and MFFU needs the accounts flat by 16:10.',
  idle: 'Flat and quiet. The bots do not trade until the market reopens at 18:00, after the CME break at 17:00.',
};
export const PHASE_LABEL = { closed: 'Market closed', break: 'CME break', asia: 'Asia slot (paper)', london: 'London entries', nyam: 'New York morning', nypm: 'New York afternoon', winddown: 'No new trades', flat: 'Flat time', idle: 'Quiet' };
/** which window is it at this moment (wd = 0 Sunday .. 6 Saturday, mod = minutes since midnight New York)? The week: Fri 17:00 -> Sun 18:00 is closed. */
export function phaseAt(wd, mod) {
  if (wd === 6 || (wd === 0 && mod < 1080) || (wd === 5 && mod >= 1020)) return 'closed';
  if (mod >= 1020 && mod < 1080) return 'break';
  if (mod >= 1080 || mod < 120) return 'asia';
  if (mod < 480) return 'london';
  if (mod < 720) return 'nyam';
  if (mod < 930) return 'nypm';
  if (mod < 955) return 'winddown';
  if (mod < 970) return 'flat';
  return 'idle';
}
/** the moment in plain words: the window, what the bots do, and the next change (counted on the real timeline, so a clock change cannot shift it) */
export function nowState(date) {
  const e = etParts(date), id = phaseAt(e.wd, e.mod);
  let next = null, mins = null;
  const t0 = Math.floor(date.getTime() / 300000) * 300000;
  for (let i = 1; i <= 8 * 24 * 12; i++) {
    const t = t0 + i * 300000, q = etParts(new Date(t));
    if (phaseAt(q.wd, q.mod) !== id) { next = phaseAt(q.wd, q.mod); mins = Math.max(1, Math.ceil((t - date.getTime()) / 60000)); break; }
  }
  const entries = id === 'london' || id === 'nyam' || id === 'nypm';
  return { id, label: PHASE_LABEL[id], text: PHASE_TEXT[id], entries, et: e, day: DAYS[e.wd], next, nextLabel: next ? PHASE_LABEL[next] : '', mins,
    until: mins == null ? '' : `${PHASE_LABEL[next]} in ${duration(mins)}` };
}
/** the windows of a date with their state relative to `date` ('now' | 'past' | 'next' | 'later') */
export function windowsFor(date) {
  const e = etParts(date), cur = phaseAt(e.wd, e.mod), ns = nowState(date).next;
  return WINDOWS.map((w) => {
    let state;
    if (w.id === cur) state = 'now'; else if (w.id === ns) state = 'next'; else if (cur === 'closed') state = 'later';
    else if (w.id === 'asia') state = e.mod >= 120 && e.mod < 1080 ? 'past' : 'later'; else state = w.to <= e.mod ? 'past' : 'later';
    return { ...w, range: `${hhmm(w.from)} to ${hhmm(w.to)}`, state };
  });
}

// ------------------------------------------------------------------ the ring
export const angle = (mod) => (mod / 1440) * Math.PI * 2;                    // 00:00 at the top, clockwise
export const polar = (cx, cy, r, mod) => [cx + r * Math.sin(angle(mod)), cy - r * Math.cos(angle(mod))];
/** an SVG arc band between radii r0 < r1 from minute a to minute b (wraps over midnight) */
export function arcPath(cx, cy, r0, r1, a, b) {
  if (b <= a) b += 1440;
  const big = b - a > 720 ? 1 : 0, f = (n) => n.toFixed(2);
  const [x0, y0] = polar(cx, cy, r1, a), [x1, y1] = polar(cx, cy, r1, b % 1440 === 0 ? 1439.999 : b % 1440), [x2, y2] = polar(cx, cy, r0, b % 1440 === 0 ? 1439.999 : b % 1440), [x3, y3] = polar(cx, cy, r0, a);
  return `M${f(x0)},${f(y0)} A${r1},${r1} 0 ${big} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r0},${r0} 0 ${big} 0 ${f(x3)},${f(y3)} Z`;
}

// ------------------------------------------------------------------ trades
/** odeon/trades.json -> plain trades; a real trade and its paper twin are one signal, so only one of them counts (the real one) */
export function normTrades(odeon) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [];
  const out = [];
  for (const t of list) {
    if (!isObj(t) || !isDate(String(t.day || ''))) continue;
    const usd = num(t.usd), at = num(t.entry && t.entry.t); if (usd == null || at == null) continue;
    const e = etParts(new Date(at * 1000));
    out.push({ id: str(t.id, 80), day: t.day, t: at, mod: e.mod, hour: e.h, side: str(t.side, 8).toUpperCase(), bot: str(t.bot || t.strat, 12) || 'LIT', src: str(t.src, 8), usd: r2(usd), r: num(t.r), risk: num(t.risk_usd), held: num(t.held_min), exit: str(t.exit && t.exit.kind, 12) });
  }
  const seen = new Map();
  for (const x of out.sort((a, b) => (a.src === 'real' ? 0 : 1) - (b.src === 'real' ? 0 : 1) || a.t - b.t)) { const k = `${x.day}|${x.bot}|${x.side}|${Math.round(x.t / 600)}`; if (!seen.has(k)) seen.set(k, x); }
  return [...seen.values()].sort((a, b) => b.t - a.t);
}
/** the example trades of the fixture ({off: days back, mod, usd, r}) turned into real instants relative to `today` (a New York date) */
export function demoTrades(fixture, today) {
  const rows = isObj(fixture) && Array.isArray(fixture.trades) ? fixture.trades : [];
  const out = [];
  for (const x of rows) {
    const off = num(x.off), mod = num(x.mod), usd = num(x.usd); if (off == null || mod == null || usd == null) continue;
    const day = addDays(today, -Math.abs(Math.trunc(off)));
    let t = Math.floor((etMidnight(day) + mod * 60000) / 1000);
    for (const d of [0, -3600, 3600]) { const q = etParts(new Date((t + d) * 1000)); if (q.ymd === day && q.mod === mod) { t += d; break; } }       // a clock-change day: find the instant that really reads this wall-clock minute
    const e = etParts(new Date(t * 1000));
    out.push({ id: `demo.${day}.${mod}`, day, t, mod: e.mod, hour: e.h, side: str(x.side, 8).toUpperCase() || 'LONG', bot: str(x.bot, 12) || 'LIT', src: 'demo', usd: r2(usd), r: num(x.r), risk: num(x.risk), held: num(x.held), exit: '' });
  }
  return out.sort((a, b) => b.t - a.t);
}
/** today's trades; when there are none, the most recent trading day (labelled) */
export function tradesFor(trades, ymd) {
  const today = trades.filter((t) => t.day === ymd);
  if (today.length) return { day: ymd, label: 'Today', list: today.slice().sort((a, b) => a.t - b.t) };
  const last = trades.length ? trades[0].day : null;
  return { day: last, label: last ? 'Last trading day' : 'No trades yet', list: last ? trades.filter((t) => t.day === last).sort((a, b) => a.t - b.t) : [] };
}
export const MIN_N = 3;
/** dollars by New York hour of entry: 24 buckets; an hour is only judged when it holds at least 3 trades (MIN_N) */
export function heat(trades) {
  const B = Array.from({ length: 24 }, (_, h) => ({ h, n: 0, usd: 0, rs: 0, rn: 0, wins: 0, shown: false }));
  for (const t of trades) { const b = B[t.hour]; b.n++; b.usd += t.usd; if (t.usd > 0) b.wins++; const r = t.r != null ? t.r : t.risk > 0 ? t.usd / t.risk : t.usd / TYPICAL_RISK; b.rs += r; b.rn++; }
  for (const b of B) { b.shown = b.n >= MIN_N; b.usd = r2(b.usd); b.avg = b.n ? r2(b.usd / b.n) : 0; b.avgR = b.n ? Math.round((b.rs / b.n) * 100) / 100 : 0; b.win = b.n ? b.wins / b.n : 0; }
  return B;
}
export function heatWords(B) {
  const ok = B.filter((b) => b.shown);
  if (!ok.length) return 'No hour has 3 trades yet, so nothing is said about any hour.';
  const best = ok.reduce((a, b) => (b.avg > a.avg ? b : a)), worst = ok.reduce((a, b) => (b.avg < a.avg ? b : a));
  const w = (b) => `${hhmm(b.h * 60)} (${b.n} trades, ${moneyS(b.avg)} (${rS(b.avgR)}) each on average)`;
  return best === worst ? `Only ${w(best)} has 3 or more trades. Past results, small samples: not a promise.` : `Best hour so far: ${w(best)}. Weakest: ${w(worst)}. Past results, small samples: not a promise.`;
}
export function jarvisCard(now, trades, nowSec) {
  return { v: 1, name: 'Kairos', status: { level: now.entries ? 'ok' : 'off', label: now.label.slice(0, 40) }, kpis: [{ label: 'ET now', value: now.et.hhmm }, { label: 'Entries', value: now.entries ? 'Open' : 'Closed' }, { label: 'Today', value: String(trades.length) }],
    lines: [now.text.slice(0, 118), now.until.slice(0, 118)], t: nowSec | 0, open: '#', theme: '#14110e', stale_after: 86400 };
}
