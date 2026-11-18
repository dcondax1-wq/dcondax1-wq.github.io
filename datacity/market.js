// "What is moving the market right now": the card the Data City answers on first open (pure: no DOM, no three.js).
// Everything comes from JSON the site already publishes, nothing is fetched here:
//   the city's own model  (city.json / fixture.json): the Today layer (which ideas fired on the last session), their $ per trade per MNQ micro after costs
//   the dashboard's LIT state (../data.json, the phone dashboard): the price and today's untaken LIT levels (parseLit), optional
// A district "moves" when ideas of it fired on the last session and hold in both periods: ranked by the dollars those ideas pay.
// Dollars: the ideas are measured per MNQ micro ($2 a point); one NQ contract ($20 a point) is ten micros. Never blank: with nothing fired the
// strongest holding ideas stand in (marked), with no data at all the demo sample does (marked DEMO). Paper only: backtests, not a forecast.
import { holdOf } from './kinds.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

export const MNQ_PT = 2, NQ_PT = 20, NEAR_PTS = 60;

/** the dashboard's data.json -> { price, levels: [{ price, side: 'H' | 'L', label }], date } or null (no LIT levels published) */
export function parseLit(D) {
  if (!D || typeof D !== 'object') return null;
  const lv = D.live || {}, X = D.lit_extra || {};
  const raw = X.levels || lv.levels || lv.pools || [];
  const price = Number.isFinite(+lv.price) ? +lv.price : null;
  const levels = (Array.isArray(raw) ? raw : []).filter((l) => l && Number.isFinite(+l.price)).map((l) => ({
    price: +l.price, side: l.side === 'H' || l.side === 'L' ? l.side : price !== null ? (+l.price > price ? 'H' : 'L') : 'H', label: String(l.label || l.kind || (l.side === 'H' ? 'high' : 'low')).slice(0, 40) }));
  if (!levels.length && price === null) return null;
  return { price, levels, date: lv.last_run ? String(lv.last_run).slice(0, 10) : null };
}

/** a clearly marked sample for the demo city (the fixture has no LIT state) */
export const DEMO_LIT = { price: 21000, date: null, demo: true, levels: [
  { price: 20940, side: 'L', label: 'PDL' }, { price: 20985, side: 'L', label: 'London low' }, { price: 21052, side: 'H', label: 'London high' }, { price: 21160, side: 'H', label: 'PDH' }] };

/** 'long' | 'short' from the plain-language label of an idea */
export function sideOf(label) {
  const s = ' ' + String(label || '').toLowerCase() + ' ';
  return s.includes(' long ') ? 'long' : s.includes(' short ') ? 'short' : null;
}

/** does a LIT level sit where this idea's side would use it? A long wants an untaken LIT low below the price, a short a high above it. */
export function litMatch(side, lit) {
  if (!lit || !lit.levels?.length) return { ok: null, text: 'LIT levels are not published yet' };
  if (lit.price === null || lit.price === undefined) return { ok: null, text: `${lit.levels.length} LIT levels today, no price yet` };
  if (!side) return { ok: null, text: 'no side to match' };
  const want = side === 'long' ? 'L' : 'H', P = lit.price;
  const cand = lit.levels.filter((l) => l.side === want && (side === 'long' ? l.price <= P : l.price >= P)).sort((a, b) => Math.abs(a.price - P) - Math.abs(b.price - P))[0];
  if (!cand) return { ok: false, text: `no untaken LIT ${want === 'L' ? 'low below' : 'high above'} the price` };
  const pts = Math.abs(cand.price - P), r = { level: cand, pts: Math.round(pts), mnq: Math.round(pts * MNQ_PT), nq: Math.round(pts * NQ_PT) };
  const where = `${cand.label} ${cand.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return pts <= NEAR_PTS ? { ok: true, ...r, text: `matches LIT: ${where} is ${r.pts} pts away ($${r.mnq} per MNQ, $${r.nq} per NQ)` }
    : { ok: false, ...r, text: `nearest LIT level ${where} is ${r.pts} pts away: not close` };
}

const DEMO_ROWS = [
  { key: 'volatility', name: 'VOLATILITY', color: (NEON ? '#ffd36b' : '#d79e64'), fired: 12, paying: 5, best: { label: 'NY AM (09:30-11:30) short after a bearish displacement while the VIX is rising', e: 63, side: 'short' } },
  { key: 'gaps', name: 'GAPS', color: (NEON ? '#7fe9ff' : '#daa56f'), fired: 9, paying: 3, best: { label: 'any time long after a VWAP reclaim while gap up', e: 41, side: 'long' } },
  { key: 'orange', name: 'OPENING RANGE', color: (NEON ? '#ff9f43' : '#d1904e'), fired: 6, paying: 2, best: { label: 'London (02:00-07:00) long after a bullish IFVG while with VWAP', e: 28, side: 'long' } }];

/** model: data.js decode(); lit: parseLit() | null; opts: { demo, label(b) } -> { rows (always 3), day, vix, sky, fallback, demo, lit, text } */
export function marketNow(model, lit, opts = {}) {
  const label = opts.label || ((b) => b.lab || b.id || '');
  const by = new Map(), secs = new Map((model?.sections || []).map((s) => [s.key, s]));
  const fired = [], holding = [];
  for (const b of model?.buildings || []) {
    if (b.plugin || b.synthetic) continue;
    if (b.td === 2) fired.push(b);
    if ((b.cls === 'gold' || b.cls === 'green') && (b.e || 0) > 0) holding.push(b);
  }
  let fallback = false, pool = fired.filter((b) => (b.e || 0) > 0 && holdOf(b) === 'both');
  if (!pool.length) pool = fired.filter((b) => (b.e || 0) > 0);
  if (!pool.length) { pool = holding; fallback = pool.length > 0; }
  for (const b of pool) {
    const r = by.get(b.d) || { key: b.d, fired: 0, paying: 0, score: 0, best: null };
    r.fired++; r.paying++; r.score += Math.max(0, b.e || 0);
    if (!r.best || (b.e || 0) > (r.best.e || 0)) r.best = b;
    by.set(b.d, r);
  }
  const firedBy = new Map();
  for (const b of fired) firedBy.set(b.d, (firedBy.get(b.d) || 0) + 1);
  let rows = [...by.values()].sort((a, c) => c.score - a.score).slice(0, 3).map((r) => {
    const s = secs.get(r.key), text = label(r.best), side = sideOf(text);
    return { key: r.key, name: s?.name || String(r.key).toUpperCase(), color: s?.color || (NEON ? '#e9ecf6' : '#b2cadc'), fired: firedBy.get(r.key) || r.fired, paying: r.paying, id: r.best.id,
             best: { label: text, e: r.best.e || 0, side }, mnq: Math.round(r.best.e || 0), nq: Math.round((r.best.e || 0) * 10), score: Math.round(r.score) };
  });
  const sample = !rows.length;
  if (sample) rows = DEMO_ROWS.map((r) => ({ ...r, id: null, mnq: r.best.e, nq: r.best.e * 10, score: r.paying * r.best.e }));
  const L = opts.demo || sample ? (lit || DEMO_LIT) : lit;
  for (const r of rows) r.lit = litMatch(r.best.side, L);
  const t = model?.today || model?.today_layer, w = model?.weather || {};
  const names = rows.map((r) => r.name).join(', ');
  const top = rows[0];
  const text = `${fallback ? 'Nothing fired on the last session, so these are the districts with the strongest ideas. ' : ''}Most active: ${names}. `
    + `Best idea in ${top.name}: ${top.best.side || 'trade'} for about $${top.mnq} per MNQ micro ($${top.nq} per NQ contract) per trade after costs.`;
  return { rows, day: model?.today?.day || model?.last_day || null, vix: w.vix ?? null, sky: w.sky || null, fallback, sample, demo: !!(opts.demo || sample), lit: L, litLive: !!lit && !(opts.demo || sample),
           firedTotal: fired.length, text };
}
