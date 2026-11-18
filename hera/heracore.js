// HERA core (ES module, no DOM, no network): the 12-month money plan as a calm chart, the payout calendar, cash in and out, and the next account to buy.
// Input: plutus/roadmap.json (tools/money_roadmap.py, a study of 2026 paper results: not a promise) or fixture.json (a saved copy, labelled). Pure, so the tests call it in node.
// Money words: dollars rounded to whole dollars, "typical" = the middle path, "worst" = 1 path in 10, "best" = 1 path in 10 (the study's own words).

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }

export const NAMES = { lit50: 'Zlarior (LIT) 50K', atlas25: 'ATLAS 25K', blitz25: 'BLITZ 25K', L50: 'Zlarior (LIT) 50K', A25: 'ATLAS 25K', B25: 'BLITZ 25K' };
export const SHORT = { lit50: 'Zlarior', atlas25: 'ATLAS', blitz25: 'BLITZ', L50: 'Zlarior', A25: 'ATLAS', B25: 'BLITZ' };
export const PRICE = { L50: 91.8, A25: 43, B25: 63 };
export const VERSIONS = [['H2', 'Cautious', 'Jul to Oct 2026 results'], ['H1', 'Better half', 'Jan to Jun 2026 results']];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWord(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : ''; }
export function monthWord(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${m[1]}` : ''; }
export function daysBetween(a, b) { const x = Date.parse(a + 'T12:00:00Z'), y = Date.parse(b + 'T12:00:00Z'); return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null; }
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// ------------------------------------------------------------------------------------------------ the roadmap file, checked
/** { ok, road } : the file must have versions with 12 numeric months; everything else is optional and cleaned */
export function readRoadmap(raw) {
  if (!isObj(raw) || !isObj(raw.versions)) return null;
  const versions = {};
  for (const k of ['H1', 'H2']) {
    const v = raw.versions[k]; if (!isObj(v) || !Array.isArray(v.months)) continue;
    const months = v.months.filter((m) => isObj(m) && num(m.cum) != null && isDate(m.from)).map((m) => ({ m: num(m.m), from: m.from, to: isDate(m.to) ? m.to : m.from, in: num(m.in) || 0, out: num(m.out) || 0, net: num(m.net) || 0, cum: num(m.cum), lo: num(m.lo) != null ? num(m.lo) : num(m.cum), hi: num(m.hi) != null ? num(m.hi) : num(m.cum) }));
    if (months.length < 3) continue;
    versions[k] = { label: str(v.label, 60), mid: num(v.mid), lo: num(v.lo), hi: num(v.hi), in: num(v.in), out: num(v.out), worst: num(v.worst_path), months };
  }
  if (!Object.keys(versions).length) return null;
  const accounts = (Array.isArray(raw.accounts) ? raw.accounts : []).filter((a) => isObj(a) && typeof a.id === 'string').map((a) => {
    const per = {}; for (const k of ['H1', 'H2']) { const x = a[k]; if (isObj(x)) per[k] = { net12: num(x.net12), first: Array.isArray(x.first) ? x.first.filter(isDate) : [], payback: num(x.payback) }; }
    return { id: a.id, label: str(a.label, 60), price: num(a.price), per };
  });
  const order = isObj(raw.order) ? raw.order : {}, rebuy = isObj(order.rebuy) ? order.rebuy : {};
  return { title: str(raw.title, 80), updated: str(raw.updated, 12), conservative: raw.conservative === 'H1' ? 'H1' : 'H2', first_session: isDate(raw.first_session) ? raw.first_session : '', paid: num(raw.paid_already), headline: str(raw.headline, 300),
    versions, accounts, best: str(order.best, 160), rebuy: { H1: isObj(rebuy.H1) ? rebuy.H1 : {}, H2: isObj(rebuy.H2) ? rebuy.H2 : {} }, ifWaiting: isObj(order.if_waiting) ? order.if_waiting : {},
    todo: (Array.isArray(raw.todo) ? raw.todo : []).filter((x) => typeof x === 'string').map((x) => str(x, 240)).filter(Boolean).slice(0, 12), caveats: (Array.isArray(raw.caveats) ? raw.caveats : []).filter((x) => typeof x === 'string').map((x) => str(x, 240)).filter(Boolean).slice(0, 10),
    verdict: isObj(raw.verdict) ? Object.fromEntries(Object.entries(raw.verdict).filter(([, v]) => typeof v === 'string').map(([k, v]) => [str(k, 24), str(v, 600)])) : {} };
}
export function version(road, key) { return road && road.versions ? road.versions[key] || road.versions[road.conservative] || Object.values(road.versions)[0] : null; }

// ------------------------------------------------------------------------------------------------ the chart: cumulative cash to the owner, with the 1-in-10 band
/** an SVG geometry for a w x h box: the typical line, the band between the worst and best path, the zero line, a tick per month. y is cash, x is the month. */
export function chart(months, w, h, pad) {
  const p = { l: 44, r: 10, t: 12, b: 24, ...(pad || {}) };
  if (!months || !months.length) return null;
  const lo = Math.min(0, ...months.map((m) => m.lo)), hi = Math.max(0, ...months.map((m) => m.hi)), span = hi - lo || 1;
  const X = (i) => p.l + (months.length === 1 ? 0 : (i / (months.length - 1)) * (w - p.l - p.r)), Y = (v) => p.t + (1 - (v - lo) / span) * (h - p.t - p.b);
  const pts = months.map((m, i) => [Math.round(X(i) * 10) / 10, Math.round(Y(m.cum) * 10) / 10]);
  const top = months.map((m, i) => [Math.round(X(i) * 10) / 10, Math.round(Y(m.hi) * 10) / 10]), bot = months.map((m, i) => [Math.round(X(i) * 10) / 10, Math.round(Y(m.lo) * 10) / 10]).reverse();
  const L = (a) => a.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' ');
  const step = hi - lo > 12000 ? 5000 : hi - lo > 5000 ? 2500 : 1000, grid = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push({ v, y: Math.round(Y(v) * 10) / 10 });
  return { line: L(pts), band: L(top.concat(bot)) + ' Z', pts, zeroY: Math.round(Y(0) * 10) / 10, grid, lo, hi, x: (i) => Math.round(X(i) * 10) / 10, y: (v) => Math.round(Y(v) * 10) / 10, w, h, pad: p };
}
export function monthLabel(m) { return m && m.from ? MON[+m.from.slice(5, 7) - 1] : ''; }
/** the card of one month (1-based index into the list) */
export function monthInfo(months, i) {
  const m = months[Math.max(0, Math.min(months.length - 1, (num(i) || 1) - 1))];
  if (!m) return null;
  return { m: m.m, label: `${dayWord(m.from)} to ${dayWord(m.to)}`, in: m.in, out: m.out, net: m.net, cum: m.cum, lo: m.lo, hi: m.hi,
    text: `Cash in ${money(m.in)}, cash out ${money(m.out)}: ${moneyS(m.net)} this month. Running total ${money(m.cum)} (1 path in 10 below ${money(m.lo)}, 1 in 10 above ${money(m.hi)}).` };
}
export function headline(road, key) {
  const v = version(road, key); if (!v) return null;
  const last = v.months[v.months.length - 1], mid = v.mid != null ? v.mid : last.cum, lo = v.lo != null ? v.lo : last.lo, hi = v.hi != null ? v.hi : last.hi;
  return { mid, lo, hi, in: v.in, out: v.out, worst: v.worst, months: v.months.length, until: last.to, text: `Typical cash to you by ${monthWord(last.to)}: ${money(mid)}. A bad run (1 in 10): ${money(lo)}. A good run (1 in 10): ${money(hi)}. After every fee.` };
}

// ------------------------------------------------------------------------------------------------ the payout calendar
/** one row per account: the early / typical / late first-payout dates for the version, the days from today, bar positions 0..1 on a shared axis */
export function payoutRows(road, key, today) {
  const rows = [];
  for (const a of road ? road.accounts : []) {
    const per = a.per[key] || a.per[road.conservative]; if (!per || per.first.length < 3) continue;
    const [early, typical, late] = per.first;
    rows.push({ id: a.id, name: NAMES[a.id] || a.label || a.id, short: SHORT[a.id] || a.id, price: a.price, net12: per.net12, payback: per.payback, early, typical, late, days: daysBetween(today, typical), daysEarly: daysBetween(today, early), daysLate: daysBetween(today, late) });
  }
  rows.sort((x, y) => (x.typical < y.typical ? -1 : 1));
  if (!rows.length) return { rows, axis: null };
  const t0 = today && isDate(today) ? today : rows[0].early, min = t0 < rows[0].early ? t0 : rows.reduce((m, r) => (r.early < m ? r.early : m), rows[0].early), max = rows.reduce((m, r) => (r.late > m ? r.late : m), rows[0].late), span = Math.max(1, daysBetween(min, max));
  const pos = (d) => Math.max(0, Math.min(1, daysBetween(min, d) / span));
  for (const r of rows) { r.x0 = pos(r.early); r.x1 = pos(r.late); r.xt = pos(r.typical); }
  return { rows, axis: { min, max, today: pos(t0), span } };
}
/** the next dates in words, nearest first: "Dec 21: ATLAS 25K first payout (typical)" */
export function calendar(rows) {
  return rows.map((r) => ({ date: r.typical, text: `${dayWord(r.typical)}: ${r.short} first payout (typical)`, sub: r.days == null ? '' : r.days > 0 ? `in ${r.days} days; could be ${dayWord(r.early)} to ${dayWord(r.late)}` : 'due now', month: monthWord(r.typical) }));
}

// ------------------------------------------------------------------------------------------------ cash in / out and the next account to buy
export function cash(road, key) {
  const v = version(road, key); if (!v) return null;
  return { in: v.in, out: v.out, net: v.in != null && v.out != null ? v.in - v.out : null, paid: road.paid, mid: v.mid };
}
/** after an account has had its 5th payout (it moves to a live account), which eval pays most per dollar: ranking from the study's own "re-buy" numbers */
export function buyNext(road, key) {
  if (!road) return null;
  const k = key === 'H1' ? 'H1' : 'H2', rb = road.rebuy[k] || {}, rank = [];
  for (const id of Object.keys(rb)) { const gain = num(rb[id]); if (gain == null || !PRICE[id]) continue; rank.push({ id, name: NAMES[id], short: SHORT[id], price: PRICE[id], gain, per: Math.round(gain / PRICE[id]) }); }
  rank.sort((a, b) => b.gain - a.gain);
  const top = rank[0] || null;
  return { rank, top, now: road.best || '', todo: road.todo[0] || '', text: top ? `Next eval to buy once an account has had its 5th payout: ${top.name} at ${money(top.price)}. The study adds ${money(top.gain)} over the year for it (${money(top.per)} back for every $1 spent).` : '' };
}
export function jarvisCard(road, key, today) {
  const hd = headline(road, key), rows = payoutRows(road, key, today).rows, nx = rows[0];
  return { v: 1, name: 'Hera', status: { level: hd ? 'ok' : 'off', label: hd ? `Plan: ${money(hd.mid)} in 12 months`.slice(0, 48) : 'No plan yet' },
    kpis: [{ label: 'Typical 12 months', value: hd ? money(hd.mid) : 'n/a' }, { label: 'Bad run', value: hd ? money(hd.lo) : 'n/a' }, { label: 'First payout', value: nx ? dayWord(nx.typical) : 'n/a' }],
    lines: [str(hd ? hd.text : 'The money plan is not published yet.', 118), str(nx ? `Next: ${nx.short} first payout ${dayWord(nx.typical)} (typical).` : '', 118)].filter(Boolean), t: 1793394000, theme: '#14110e' };
}
