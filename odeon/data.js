// ODEON data: load trades.json (tools/odeon_export.py), fall back to the demo fixture, decode bars, format numbers.
// Pure module: no DOM, no three.js. Every time is epoch seconds (UTC); `off` is the trade day's ET offset in seconds.
import { DEMO } from './fixture.js';

export const MICRO = 2; // $ per point per MNQ micro

/** Load the reels. Resolves { trades, demo, upto }; never throws (no data -> the fixture, marked demo). */
export async function loadReels(url, opts) {
  const o = opts || {};
  if (o.forceDemo) return demoBundle();
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), o.timeoutMs || 8000);
    const res = await fetch(url, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined });
    clearTimeout(timer);
    if (!res.ok) return demoBundle();
    const j = await res.json();
    const trades = (j && Array.isArray(j.trades) ? j.trades : []).map(prepare).filter(Boolean);
    if (!trades.length) return demoBundle();
    return { trades, demo: false, upto: j.upto || trades[0].day };
  } catch (e) {
    return demoBundle();
  }
}

export function demoBundle() {
  const t = prepare(JSON.parse(JSON.stringify(DEMO)));
  return { trades: t ? [t] : [], demo: true, upto: t ? t.day : '' };
}

/** Decode the packed bars and add the derived fields the theater needs; null when the trade is unusable. */
export function prepare(tr) {
  if (!tr || !tr.bars || !Array.isArray(tr.bars.dt) || !tr.bars.dt.length || !tr.entry || !tr.exit) return null;
  const b = tr.bars, n = b.dt.length, s = b.s || 60;
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = b.t0 + b.dt[i] * s;
    o[i] = (b.p0 + b.o[i]) / 4; h[i] = (b.p0 + b.h[i]) / 4; l[i] = (b.p0 + b.l[i]) / 4; c[i] = (b.p0 + b.c[i]) / 4;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (l[i] < lo) lo = l[i]; if (h[i] > hi) hi = h[i]; }
  for (const p of [tr.stop, tr.target, tr.entry.px]) if (isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const events = (tr.events || []).slice().sort((a, z) => a.t - z.t); // stable: the exporter's order for equal times
  return Object.assign({}, tr, {
    events,
    B: { n, s, t, o, h, l, c, step: b.dt.slice() },
    tStart: t[0],
    tEnd: t[n - 1] + s,
    lo, hi,
  });
}

// ---------------------------------------------------------------- formatting (shared by the HUD, the reels, the stats card)
const MINUS = '−';
export function fmtPx(x) {
  return Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtUsd(x, sign) {
  const v = Math.round(Math.abs(x) * 100) / 100;
  const s = v === 0 ? '' : x < 0 ? MINUS : sign === false ? '' : '+';
  return s + '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtR(r) {
  const v = Math.abs(r).toFixed(2);
  return (r > 0 ? '+' : r < 0 ? MINUS : '') + v + 'R';
}
export function hhmm(t, off) {
  const d = new Date((t + (off || 0)) * 1000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayLabel(day) {
  const p = String(day || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return String(day || '');
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return DOW[d.getUTCDay()] + ' ' + MON[p[1] - 1] + ' ' + p[2];
}
export function heldLabel(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
}
export function exitLabel(kind) {
  return ({ TARGET: 'Target hit', STOP: 'Stopped out', BE: 'Breakeven stop', EOD: 'Flat at the close', TIME: 'Flat at the close',
    CUT_T15: '15-minute cut' })[String(kind || '').toUpperCase()] || String(kind || 'Exit');
}
export function outcomeOf(tr) {
  return (tr.exit && tr.exit.outcome) || (String(tr.exit && tr.exit.kind).toUpperCase() === 'BE' ? 'be' : tr.r > 0 ? 'win' : tr.r < 0 ? 'loss' : 'be');
}
/** a few close prices for the reel's thumbnail line */
export function spark(tr, pts) {
  const B = tr.B, k = Math.max(1, Math.floor(B.n / (pts || 36)));
  const out = [];
  for (let i = 0; i < B.n; i += k) out.push(B.c[i]);
  out.push(B.c[B.n - 1]);
  return out;
}
