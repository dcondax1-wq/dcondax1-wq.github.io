// ARBITER core (ES module, no DOM, no network): the spread and funding finder's maths for the page. Paper only.
// The numbers come from tools/money/arbiter.py (published as ../money/arbiter.json, or this folder's fixture.json). This file cleans them, builds the balance-scale geometry,
// marks the owner's hypothetical (paper) positions and writes the Jarvis card. Pure, so tests/test_arbiter_page.py calls it in node.
// Every number is an estimate and says so. Nothing here can place an order or ask for a key.

export const BENCH_APR = 4;
export const KINDS = { funding: 'Funding', peg: 'Pegs', venues: 'Two venues' };
export const KIND_ORDER = ['funding', 'peg', 'venues'];
export const TRACK_CAPITAL = 1000;
export const MAX_POSITIONS = 12;

export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,%\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const str = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n) : '');
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function money2(x) { const v = num(x); if (v == null) return '$0.00'; return (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(2); }
export function pct(x, d) { const v = num(x); if (v == null) return '0%'; return (Math.abs(v) < 0.005 ? 0 : v).toFixed(d == null ? 1 : d) + '%'; }
export function aprText(x) { const v = num(x); return v == null ? '0% a year' : `${v >= 100 ? Math.round(v) : v.toFixed(1)}% a year`; }
export const riskWord = (r) => ({ low: 'Lower risk', med: 'Medium risk', high: 'High risk' }[r] || 'Unknown risk');
export function daysText(d) { const v = num(d); if (v == null) return '0 days'; const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v); return `${r} day${r === 1 ? '' : 's'}`; }
export function ago(asof, nowMs) {
  const t = Date.parse(asof); if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return 'time unknown';
  const m = Math.max(0, Math.round((nowMs - t) / 60000));
  return m < 2 ? 'just now' : m < 90 ? `${m} minutes ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
}

// ---- clean a published arbiter.json (or the fixture) into what the page shows; junk never throws ----
export function cleanItem(x) {
  if (!isObj(x)) return null;
  const kind = KIND_ORDER.includes(x.kind) ? x.kind : null;
  const net = num(x.net_apr), usd = num(x.usd), title = str(x.title, 110);
  if (!kind || net == null || usd == null || !title) return null;
  const risk = ['low', 'med', 'high'].includes(x.risk) ? x.risk : 'high';
  const cap = clamp(num(x.capital_usd) || 1000, 100, 1e6);
  const hold = clamp(num(x.hold_days) || 1, 1, 400);
  return {
    kind, title, detail: str(x.detail, 360), usd, net_apr: net, gross_apr: num(x.gross_apr) || 0, hurdle_apr: num(x.hurdle_apr) != null ? num(x.hurdle_apr) : BENCH_APR + 4,
    score: clamp(Math.round(num(x.score) || 0), 0, 100), risk, risk_score: clamp(Math.round(num(x.risk_score) || 0), 0, 100), hold_days: hold, capital_usd: cap,
    gain_pct: num(x.gain_pct) || 0, cost_pct: Math.max(0, num(x.cost_pct) || 0), gain_usd: Math.max(0, num(x.gain_usd) || 0), cost_usd: Math.max(0, num(x.cost_usd) || 0),
    exposed_usd: Math.max(0, num(x.exposed_usd) != null ? num(x.exposed_usd) : cap), why: str(x.why, 420), warning: str(x.warning, 420),
  };
}
export function clean(raw) {
  const o = isObj(raw) ? raw : {};
  const items = (Array.isArray(o.items) ? o.items : []).map(cleanItem).filter(Boolean).slice(0, 12);
  const h = isObj(o.headline) ? o.headline : {};
  const status = ['ok', 'stale', 'sample'].includes(o.status) ? o.status : 'sample';
  return {
    status, demo: o.demo === true || status === 'sample', asof: str(o.asof, 40), headline: str(h.text, 260) || 'No ideas yet.', usd_month: num(h.usd_month), items,
    notes: (Array.isArray(o.notes) ? o.notes : []).map((n) => str(n, 360)).filter(Boolean).slice(0, 8), note: str(o.note, 200),
  };
}
export function filterItems(items, kind) { return kind && kind !== 'all' ? items.filter((i) => i.kind === kind) : items.slice(); }
export function beats(it) { return it.net_apr > it.hurdle_apr; }
export function verdict(it) {
  if (!it) return 'Pick an idea to weigh it.';
  return beats(it) ? `It beats the bar: ${aprText(it.net_apr)} against ${aprText(it.hurdle_apr)}. Weigh the warning before anything else.`
    : `It does not clear the bar: ${aprText(it.net_apr)} against ${aprText(it.hurdle_apr)} (a ${BENCH_APR}% savings rate plus an allowance for the risk). Skip it.`;
}

// ---- the balance scale: the heavier pan goes down; the beam tilts up to 14 degrees ----
export const MAX_TILT = 14;
export function beamPoints(angle, cx, cy, half) {
  const a = ((num(angle) || 0) * Math.PI) / 180, hf = half || 70, X = cx == null ? 0 : cx, Y = cy == null ? 0 : cy;
  return { left: { x: X - hf * Math.cos(a), y: Y + hf * Math.sin(a) }, right: { x: X + hf * Math.cos(a), y: Y - hf * Math.sin(a) } };
}
export function scaleGeo(left, right, cx, cy, half) {
  const L = Math.max(0, num(left) || 0), R = Math.max(0, num(right) || 0), m = Math.max(L, R);
  const angle = m > 0 ? clamp((L - R) / m, -1, 1) * MAX_TILT : 0;          // positive = left side down
  const coins = (w) => (m > 0 && w > 0 ? clamp(Math.round((w / m) * 8), 1, 8) : 0);
  return {
    angle, ...beamPoints(angle, cx, cy, half),
    coinsL: coins(L), coinsR: coins(R), heavier: L === R ? 'even' : L > R ? 'left' : 'right',
  };
}
// scale A: what one hold earns against what it costs (in dollars on the capital); scale B: the net APR against the bar
export function scalesFor(it) {
  if (!it) return null;
  const earn = Math.max(0, it.gain_usd), cost = Math.max(0, it.cost_usd);
  return {
    a: { left: earn, right: cost, labelL: `Earns ${money2(earn)}`, labelR: `Costs ${money2(cost)}`, title: 'Pay against cost', line: `Over one ${daysText(it.hold_days)} hold on ${money(it.capital_usd)}: earns about ${money2(earn)} (estimate), fees and slippage take ${money2(cost)}.` },
    b: { left: Math.max(0, it.net_apr), right: Math.max(0, it.hurdle_apr), labelL: `Idea ${Math.round(it.net_apr)}%`, labelR: `Bar ${Math.round(it.hurdle_apr)}%`, title: 'Idea against the bar', line: verdict(it) },
  };
}

// ---- paper positions: hypothetical, kept on this device only; marked from the entry numbers and today's scan ----
export function newPosition(it, nowMs, capital) {
  if (!it) return null;
  const cap = clamp(num(capital) || TRACK_CAPITAL, 100, 1e6), k = cap / it.capital_usd;
  return { title: it.title, kind: it.kind, opened: Math.round(nowMs), capital: cap, gain_pct: it.gain_pct, cost_pct: it.cost_pct, hold_days: it.hold_days, entry_apr: it.net_apr, exposed: Math.round(it.exposed_usd * k * 100) / 100 };
}
export function cleanPositions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((p) => isObj(p) && typeof p.title === 'string' && num(p.opened) != null && num(p.capital) > 0).slice(0, MAX_POSITIONS).map((p) => ({
    title: str(p.title, 110), kind: KIND_ORDER.includes(p.kind) ? p.kind : 'funding', opened: num(p.opened), capital: clamp(num(p.capital), 100, 1e6), gain_pct: num(p.gain_pct) || 0, cost_pct: Math.max(0, num(p.cost_pct) || 0),
    hold_days: clamp(num(p.hold_days) || 1, 1, 400), entry_apr: num(p.entry_apr) || 0, exposed: Math.max(0, num(p.exposed) || num(p.capital)),
  }));
}
export function markPosition(p, items, nowMs) {
  const days = Math.max(0, (nowMs - p.opened) / 86400000), frac = Math.min(1, days / p.hold_days);
  const earned = (p.capital * p.gain_pct * frac) / 100, cost = (p.capital * p.cost_pct) / 100, net = earned - cost;
  const cur = (items || []).find((i) => i.title === p.title) || null;
  let state = 'open', words = 'Still there.';
  if (!cur) { state = 'gone'; words = 'The spread is gone from today\'s scan. Close it on paper.'; }
  else if (cur.net_apr <= 0) { state = 'gone'; words = 'It no longer beats its costs. Close it on paper.'; }
  else if (cur.net_apr < p.entry_apr * 0.5) { state = 'narrow'; words = `The spread has narrowed: ${aprText(cur.net_apr)} now, ${aprText(p.entry_apr)} when opened.`; }
  else words = `Still there: ${aprText(cur.net_apr)} now, ${aprText(p.entry_apr)} when opened.`;
  return { days, frac, earned, cost, net, state, words, nowApr: cur ? cur.net_apr : null, done: frac >= 1 };
}
export function totals(positions, items, nowMs) {
  let net = 0, exposed = 0;
  for (const p of positions) { net += markPosition(p, items, nowMs).net; exposed += p.exposed; }
  return { net, exposed, n: positions.length };
}

export function jarvisCard(c, nowSec) {
  const best = c && c.items.length ? c.items.slice().sort((a, b) => b.score - a.score)[0] : null;
  return {
    v: 1, name: 'Arbiter', status: { level: c && c.demo ? 'off' : best ? 'ok' : 'warn', label: c && c.demo ? 'Demo data' : best ? 'Paper ideas' : 'Nothing beats costs' },
    kpis: [{ label: 'Ideas', value: String(c ? c.items.length : 0) }, { label: 'Best a year', value: best ? `${Math.round(best.net_apr)}%` : '0%' }, { label: 'Best a month', value: best ? money(best.usd) : '$0' }],
    lines: ['Paper only. Estimates after fees and slippage.', best ? `${best.title}`.slice(0, 100) : 'No idea beats its costs right now.'], t: Math.round(nowSec), open: '#', theme: '#14110e', stale_after: 86400,
  };
}
