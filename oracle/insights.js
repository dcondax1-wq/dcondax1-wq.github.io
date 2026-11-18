// ORACLE insights (2026-11-04): the day read from the World alone. Pure: no DOM, no three.js (the test imports it in the browser).
//   sweepCount(w)       levels swept today: { taken, open, highs, lows, logSweeps }
//   dayTypeOf(w, t)     the kind of day so far: { id, label, why } (sweep-reverse / trend-up / trend-down / range / quiet / forming)
//   heatHistory(w, n)   how hot the three hottest open levels were at each of the last n prices: [{ id, label, series, now, peak }]
//   alertsOf(w)         one timeline of what happened and what is hot now, newest first: [{ t, hm, kind, tone, text }]
// Everything is a function of the World (bars are [t, close] pairs, the log is the Brain's narration), so a replay at any second
// gives the same answer as the live page at that second.
import { heatRows, heatOf } from './heat.js';
import { etParts, etToUnix, hm } from './time.js';
import { familyOf } from './prophecy.js';

const isHigh = (l) => /_h$/.test(familyOf(l.label) || '') || /high|top/i.test(l.label);

export function sweepCount(w) {
  const taken = w ? w.levels.filter((l) => l.taken) : [];
  const highs = taken.filter(isHigh).length;
  return { taken: taken.length, open: w ? w.levels.length - taken.length : 0, highs, lows: taken.length - highs,
    logSweeps: w ? w.log.filter((r) => r.kind === 'sweep' && /✓|sweeps?/i.test(r.text)).length : 0 };
}

/** the futures day opens at 18:00 ET: the last such moment at or before t */
function sessionStart(t) {
  const p = etParts(t);
  return etToUnix(p.y, p.mo, p.d, 18, 0) - (p.h >= 18 ? 0 : 86400);
}

export function dayTypeOf(w) {
  if (!w) return { id: 'forming', label: 'Forming', why: 'No data yet' };
  const from = sessionStart(w.t || 0);
  const cs = (w.bars || []).filter((b) => b[0] >= from).map((b) => b[1]).filter(Number.isFinite);
  const swept = sweepCount(w).taken, atr = Math.max(2, w.atr || 12);
  if (cs.length < 6) return { id: 'forming', label: 'Forming', why: 'The session is young: fewer than 6 bars so far' };
  const hi = Math.max(...cs), lo = Math.min(...cs), range = hi - lo, net = cs[cs.length - 1] - cs[0];
  const rA = range / atr, trendy = range > 0 && Math.abs(net) / range >= 0.55;
  if (swept >= 1 && ['entry', 'trade', 'done'].includes(w.stage.key)) {
    return { id: 'sweep-reverse', label: 'Sweep and reverse', why: `${swept} level${swept === 1 ? '' : 's'} swept, then the bot took the turn (range ${rA.toFixed(1)} ATR)` };
  }
  if (rA >= 8 && trendy) {
    const up = net > 0;
    return { id: up ? 'trend-up' : 'trend-down', label: up ? 'Trend day up' : 'Trend day down',
      why: `${Math.abs(net).toFixed(0)} pts one way of a ${range.toFixed(0)} pt range (${rA.toFixed(1)} ATR)` };
  }
  if (rA < 5) return { id: 'quiet', label: 'Quiet', why: `The range is only ${rA.toFixed(1)} ATR so far` };
  return { id: 'range', label: 'Range day', why: `${rA.toFixed(1)} ATR of range, no clear direction (net ${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(0)} pts)` };
}

export function heatHistory(w, n = 24) {
  if (!w || !(w.bars || []).length) return [];
  const cs = w.bars.slice(-n).map((b) => b[1]).filter(Number.isFinite);
  if (cs.length < 3) return [];
  return heatRows(w).slice(0, 3).map((r) => {
    const series = cs.map((c) => Math.round(heatOf(r.price - c, w.atr) * 100) / 100);
    return { id: r.id, label: r.label, kind: r.kind, series, now: r.heat, peak: Math.max(...series) };
  });
}

const TONE = { sweep: 'sweep', entry: 'trade', exit: 'trade', cisd: 'step', armed: 'step', note: 'note' };

export function alertsOf(w, limit = 12) {
  if (!w) return [];
  const out = (w.log || []).map((r) => ({ t: r.t != null ? r.t : null, hm: r.hm, kind: r.kind, tone: TONE[r.kind] || 'note', text: r.text }));
  const hot = heatRows(w).filter((r) => r.heat >= 0.6).slice(0, 2);
  const now = w.t ? hm(w.t) : '';
  const live = hot.map((r) => ({ t: w.t, hm: now, kind: 'hot', tone: 'hot', text: `${r.label} is ${Math.abs(r.dist).toFixed(1)} pts ${r.dist > 0 ? 'above' : 'below'} price: hot (${Math.round(r.heat * 100)}%)` }));
  if (w.position) live.push({ t: w.t, hm: now, kind: 'position', tone: 'trade', text: `${w.position.side} ${w.position.qty} in trade${w.position.r != null ? `, ${w.position.r >= 0 ? '+' : '−'}${Math.abs(w.position.r).toFixed(2)}R` : ''}` });
  return [...live, ...out.slice().reverse()].slice(0, limit);
}
