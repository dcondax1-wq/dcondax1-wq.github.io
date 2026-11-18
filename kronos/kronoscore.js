// KRONOS core (ES module, no DOM, no network): the calendar of money. The owner's daily P&L from the site's odeon/trades.json (real and paper trades; the backtest on request), a month grid,
// the best and worst weekday and hour in $ with n, a "what a normal bad week looks like" band from his own weeks (honest percentiles, n shown), and the sundial's shadow. Pure, so the tests call it in node.
// Every dollar has its R next to it: 1R = the average risk of a trade in the chosen set ($ risk_usd). Nothing here places or changes an order.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80);
export function usd0(x) { const v = num(x); if (v == null) return '$0'; const a = Math.round(Math.abs(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function usd0S(x) { const v = num(x); if (v == null) return '$0'; return v > 0 && Math.round(v) !== 0 ? '+' + usd0(v) : usd0(v); }
export function rWord(usdv, risk) { const u = num(usdv), k = num(risk); if (u == null || !k || k <= 0) return '0.0R'; const r = Math.round((u / k) * 10) / 10; return (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R'; }
export const both = (usdv, risk) => `${usd0S(usdv)} (${rWord(usdv, risk)})`;
export const MIN_WEEKS = 8, MIN_BUCKET = 3;
export const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------------------------------------ dates (strings only, no time zones: the file's own trade day)
const ms = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
export const ymdOf = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
export const addDays = (ymd, n) => ymdOf(ms(ymd) + n * 86400000);
export const dowOf = (ymd) => (new Date(ms(ymd)).getUTCDay() + 6) % 7;             // 0 = Monday
export const mondayOf = (ymd) => addDays(ymd, -dowOf(ymd));
export const monthOf = (ymd) => ymd.slice(0, 7);
export const addMonths = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const monthWord = (ym) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const dayWord = (ymd) => `${MONTHS[+ymd.slice(5, 7) - 1].slice(0, 3)} ${+ymd.slice(8, 10)}`;
/** the New York hour (0-23) of an epoch second; null when the runtime has no time zone data */
export function etHour(tSec) {
  const t = num(tSec); if (!t) return null;
  try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t * 1000)).find((x) => x.type === 'hour'); const h = p ? parseInt(p.value, 10) : NaN; return Number.isFinite(h) ? h % 24 : null; } catch (_) { return null; }
}
/** the New York calendar day (YYYY-MM-DD) of an epoch second */
export function etDay(tSec) {
  const t = num(tSec); if (!t) return null;
  try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; } catch (_) { return ymdOf(t * 1000); }
}
export const hourWord = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

// ------------------------------------------------------------------------------------------------ the trades
/** odeon/trades.json (or the fixture) -> trades { day, usd, risk, t, src }. set: 'live' = real + paper trades, 'back' = the backtest */
export function normTrades(j, set) {
  const list = isObj(j) && Array.isArray(j.trades) ? j.trades : [], out = [];
  for (const t of list) {
    if (!isObj(t) || !YMD.test(String(t.day || ''))) continue;
    const u = num(t.usd); if (u == null) continue;
    const src = str(t.src, 10) || 'real', isBack = src === 'backtest';
    if ((set === 'back') !== isBack) continue;
    out.push({ day: t.day, usd: r2(u), risk: num(t.risk_usd), t: num(t.entry && t.entry.t) || num(t.t) || 0, src });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.t - b.t));
}
/** 1R of the set: the average risk of a trade (null when the file has none) */
export function unitR(trades) { const r = trades.map((t) => t.risk).filter((x) => x && x > 0); return r.length ? r2(r.reduce((s, x) => s + x, 0) / r.length) : null; }
export function daily(trades) {
  const m = new Map();
  for (const t of trades) { const d = m.get(t.day) || { day: t.day, usd: 0, n: 0 }; d.usd = r2(d.usd + t.usd); d.n += 1; m.set(t.day, d); }
  return m;
}
/** a typical day's size: the average of |P&L| over days with a trade */
export function typicalDay(dm) { const v = [...dm.values()]; return v.length ? r2(v.reduce((s, d) => s + Math.abs(d.usd), 0) / v.length) : 0; }

// ------------------------------------------------------------------------------------------------ the month grid
export function monthGrid(dm, ym, unit) {
  const first = ym + '-01', last = addDays(addMonths(ym, 1) + '-01', -1), start = mondayOf(first), cells = [];
  for (let d = start; d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) {
    const x = dm.get(d), inM = monthOf(d) === ym;
    cells.push({ day: d, dom: +d.slice(8, 10), inMonth: inM, usd: inM && x ? x.usd : null, n: inM && x ? x.n : 0, word: inM && x ? both(x.usd, unit) : '' });
  }
  const mon = [...dm.values()].filter((d) => monthOf(d.day) === ym);
  const total = r2(mon.reduce((s, d) => s + d.usd, 0)), days = mon.length, green = mon.filter((d) => d.usd > 0).length;
  return { ym, label: monthWord(ym), cells, weeks: cells.length / 7, total, days, green, red: mon.filter((d) => d.usd < 0).length, trades: mon.reduce((s, d) => s + d.n, 0) };
}
/** the months that hold data, oldest to newest (the page's prev / next stop there) */
export function monthsWithData(dm, ym) { const s = new Set([...dm.keys()].map(monthOf)); if (ym) s.add(ym); return [...s].sort(); }

// ------------------------------------------------------------------------------------------------ best and worst weekday / hour (in $, with n)
function bucketRows(keyed, keys, label) {
  const rows = keys.map((k) => { const l = keyed.filter((x) => x.k === k); return { k, label: label(k), n: l.length, usd: r2(l.reduce((s, x) => s + x.usd, 0)), avg: l.length ? r2(l.reduce((s, x) => s + x.usd, 0) / l.length) : 0, wins: l.filter((x) => x.usd > 0).length }; });
  return rows;
}
function bestWorst(rows) {
  const ok = rows.filter((r) => r.n >= MIN_BUCKET);
  if (ok.length < 2) return { best: null, worst: null, enough: false };
  const s = [...ok].sort((a, b) => b.usd - a.usd);
  return { best: s[0], worst: s[s.length - 1].usd < s[0].usd ? s[s.length - 1] : null, enough: true };
}
export function byWeekday(trades) { const rows = bucketRows(trades.map((t) => ({ k: dowOf(t.day), usd: t.usd })), [0, 1, 2, 3, 4], (k) => DOW[k]); return { rows, ...bestWorst(rows) }; }
export function byHour(trades) {
  const keyed = trades.map((t) => ({ k: etHour(t.t), usd: t.usd })).filter((x) => x.k != null);
  const hrs = [...new Set(keyed.map((x) => x.k))].sort((a, b) => a - b), rows = bucketRows(keyed, hrs, hourWord);
  return { rows, ...bestWorst(rows), known: keyed.length };
}
export const bucketWord = (b, unit) => (b ? `${b.label}: ${both(b.usd, unit)} over ${b.n} trade${b.n === 1 ? '' : 's'}` : 'not enough trades yet');

// ------------------------------------------------------------------------------------------------ what a normal bad week looks like
export function weekTotals(dm) {
  const m = new Map();
  for (const d of dm.values()) { const k = mondayOf(d.day); m.set(k, r2((m.get(k) || 0) + d.usd)); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, usd]) => ({ week, usd }));
}
/** percentile with linear interpolation on the sorted values (p in 0..1) */
export function pct(sorted, p) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r2(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)); }
export function weekBand(dm) {
  const w = weekTotals(dm), n = w.length, vals = w.map((x) => x.usd).sort((a, b) => a - b);
  if (n < MIN_WEEKS) return { enough: false, n, need: MIN_WEEKS, worst: n ? vals[0] : null, best: n ? vals[n - 1] : null, weeks: w };
  const losing = w.filter((x) => x.usd < 0).length;
  return { enough: true, n, worst: vals[0], p10: pct(vals, 0.1), p20: pct(vals, 0.2), p50: pct(vals, 0.5), p80: pct(vals, 0.8), best: vals[n - 1], losing, weeks: w };
}
export function bandLines(b, unit) {
  if (!b.enough) return [`Only ${b.n} week${b.n === 1 ? '' : 's'} with a trade so far (n=${b.n}). A band needs at least ${b.need}: no claim is made.` + (b.n ? ` The ${b.n === 1 ? 'one' : 'worst'} week was ${both(b.worst, unit)}.` : '')];
  return [`Out of ${b.n} weeks with a trade (n=${b.n}), ${b.losing} lost money.`,
    `A normal bad week (1 in 5) was ${both(b.p20, unit)}. A rough one (1 in 10) was ${both(b.p10, unit)}. The worst so far was ${both(b.worst, unit)}.`,
    `A middle week made ${both(b.p50, unit)}; a good one (1 in 5) ${both(b.p80, unit)}.`];
}

// ------------------------------------------------------------------------------------------------ the sundial
/** today's P&L against a typical day. z = today / typical; a strong day = the sun high = a short shadow. shadow in 0.18..2.2 (1 = a flat day) */
export function sundial(todayUsd, typical, unit) {
  const t = num(todayUsd), k = num(typical);
  if (t == null || !k || k <= 0) return { z: 0, shadow: 1, tone: 'none', word: 'No trades today yet: the shadow rests at its middle length.' };
  const z = Math.max(-3, Math.min(3, t / k)), shadow = Math.max(0.18, Math.min(2.2, 1 - 0.4 * z));
  const tone = t > 0 ? 'gain' : t < 0 ? 'loss' : 'flat';
  const word = `Today ${both(t, unit)} against a typical day of ${usd0(k)}: ` + (z >= 1 ? 'a strong day, a short shadow.' : z > 0.15 ? 'a good day, a shortening shadow.' : z >= -0.15 ? 'about flat, a middle shadow.' : z > -1 ? 'a down day, a lengthening shadow.' : 'a hard day, a long shadow.');
  return { z: Math.round(z * 100) / 100, shadow: Math.round(shadow * 100) / 100, tone, word };
}
/** the dial's shadow direction from the New York clock: noon = straight down, morning to the left (radians, for the 3D scene and the flat twin) */
export function shadowAngle(hour24) { const h = Math.max(6, Math.min(18, num(hour24) == null ? 12 : num(hour24))); return ((h - 12) / 6) * 1.1; }

// ------------------------------------------------------------------------------------------------ the whole view
/** the numbers for one set, as of `today` (a YYYY-MM-DD). Never null: empty sets give zeros and words that say so. */
export function view(trades, today) {
  const dm = daily(trades), unit = unitR(trades), typ = typicalDay(dm), td = dm.get(today);
  const wk = byWeekday(trades), hr = byHour(trades), band = weekBand(dm);
  const net = r2(trades.reduce((s, t) => s + t.usd, 0));
  return { n: trades.length, days: dm.size, net, unit, typical: typ, today: td ? td.usd : null, todayN: td ? td.n : 0, dm, wk, hr, band, dial: sundial(td ? td.usd : null, typ, unit), from: trades.length ? trades[0].day : '', to: trades.length ? trades[trades.length - 1].day : '' };
}
export function chooseData(real, fixture) {
  if (isObj(real) && Array.isArray(real.trades) && normTrades(real, 'live').length + normTrades(real, 'back').length) return { src: 'file', json: real, today: null, demo: false };
  if (isObj(fixture) && Array.isArray(fixture.trades) && fixture.trades.length) return { src: 'demo', json: fixture, today: YMD.test(String(fixture.today)) ? fixture.today : null, demo: true };
  return null;
}
export function headline(v, set) {
  if (!v.n) return set === 'back' ? 'No backtest trades in the file.' : 'No real or paper trades in the file yet. The calendar fills in as the bot trades; switch to the backtest to see how it looked in history.';
  const t = v.today == null ? 'No trade today yet' : `Today ${both(v.today, v.unit)}`;
  return `${t}. ${v.days} trading day${v.days === 1 ? '' : 's'} so far (${v.n} trade${v.n === 1 ? '' : 's'}): net ${both(v.net, v.unit)}. A typical day moves ${usd0(v.typical)}.`;
}
export function jarvisCard(v, set) {
  const lvl = !v.n ? 'off' : v.today == null ? 'off' : v.today > 0 ? 'ok' : v.today < 0 ? 'warn' : 'off';
  return { v: 1, name: 'Kronos', status: { level: lvl, label: str(v.today == null ? 'No trade today' : v.today >= 0 ? 'A green day' : 'A red day', 48) },
    kpis: [{ label: 'Today', value: v.today == null ? 'none' : usd0S(v.today) }, { label: 'Net', value: usd0S(v.net) }, { label: 'Days', value: String(v.days) }],
    lines: [str(v.dial.word, 118), str(set === 'back' ? 'Backtest numbers: history, not a promise.' : 'Real and paper trades only.', 118)], t: 1793394000, theme: '#14110e' };
}
