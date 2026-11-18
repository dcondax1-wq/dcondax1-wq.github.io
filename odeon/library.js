// ODEON library (2026-11-04): the trade library's logic. Pure: no DOM, no three.js (the test imports it in the browser).
//   setupOf(t) / hourOf(t) / monthOf(t)     the three things a trade is filed under: LIT or the ATLAS setup, the session of its entry, its month
//   applyFilters(trades, f)                 f = { f: all|lit|atlas|win|loss, setup, hour, month, r: [lo, hi] | null } ('all' = no filter)
//   statsOf(trades)                         { n, wins, losses, winPct, net, avgR, bestR, worstR, pf }
//   histogram(trades)                       the R multiples in 8 bins: [{ i, lo, hi, label, n, net, tone }]
//   runStats(tr, T)                         what the trade has done by time T: { live, r, mfeR, maeR, heldMin }
//   rPath(tr)                               the trade as R over minutes since the entry: [{ m, r }] (bar closes, ending on the exit)
//   queueOf(trades, kind)                   the order a reel queue plays in: 'best' (5 best $), 'worst' (5 worst $), 'all' (as given)
// R is always in units of the trade's own risk (the distance to the stop); $ is the trade's net after costs.
import { outcomeOf, hhmm } from './data.js';
import { barsAt, formingBar } from './timeline.js';

export const setupOf = (t) => (t.bot === 'ATLAS' ? t.strat || 'ATLAS' : 'LIT');
export const monthOf = (t) => String(t.day || '').slice(0, 7);

/** Asia 18:00-02:00 ET, London 02:00-08:00, NY AM 08:00-12:00, NY PM 12:00-18:00 (by the entry's ET hour) */
export function hourOf(t) {
  const h = +hhmm(t.entry.t, t.off).slice(0, 2);
  return h >= 18 || h < 2 ? 'Asia' : h < 8 ? 'London' : h < 12 ? 'NY AM' : 'NY PM';
}

export function applyFilters(trades, f) {
  const o = f || {};
  return trades.filter((t) => {
    const out = outcomeOf(t);
    if (o.f === 'lit' && t.bot !== 'LIT') return false;
    if (o.f === 'atlas' && t.bot !== 'ATLAS') return false;
    if (o.f === 'win' && out !== 'win') return false;
    if (o.f === 'loss' && out !== 'loss') return false;
    if (o.setup && o.setup !== 'all' && setupOf(t) !== o.setup) return false;
    if (o.hour && o.hour !== 'all' && hourOf(t) !== o.hour) return false;
    if (o.month && o.month !== 'all' && monthOf(t) !== o.month) return false;
    if (o.r && !(t.r >= o.r[0] && t.r < o.r[1])) return false;
    return true;
  });
}

export function statsOf(trades) {
  const n = trades.length, wins = trades.filter((t) => outcomeOf(t) === 'win').length, losses = trades.filter((t) => outcomeOf(t) === 'loss').length;
  const net = trades.reduce((a, t) => a + t.usd, 0), gw = trades.filter((t) => t.usd > 0).reduce((a, t) => a + t.usd, 0), gl = -trades.filter((t) => t.usd < 0).reduce((a, t) => a + t.usd, 0);
  return { n, wins, losses, winPct: n ? Math.round((100 * wins) / n) : 0, net, avgR: n ? trades.reduce((a, t) => a + t.r, 0) / n : 0,
    bestR: n ? Math.max(...trades.map((t) => t.r)) : 0, worstR: n ? Math.min(...trades.map((t) => t.r)) : 0, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0 };
}

const EDGES = [-Infinity, -0.75, -0.25, 0.25, 1, 2, 3, 5, Infinity];
const LABELS = ['≤ −0.75R', '−0.75 to −0.25', 'about 0', '0.25 to 1', '1 to 2', '2 to 3', '3 to 5', '5R +'];
export function histogram(trades) {
  const bins = LABELS.map((label, i) => ({ i, lo: EDGES[i], hi: EDGES[i + 1], label, n: 0, net: 0, tone: i < 2 ? 'loss' : i === 2 ? 'be' : 'win' }));
  for (const t of trades) {
    const b = bins.find((x) => t.r >= x.lo && t.r < x.hi);
    if (b) { b.n++; b.net += t.usd; }
  }
  return bins;
}

/** The trade at time T: open R, the best and worst R it has been (MFE / MAE, counted from the entry), the minutes held. */
export function runStats(tr, T) {
  const dir = tr.side === 'LONG' ? 1 : -1, risk = Math.max(1e-6, tr.risk_pts), ep = tr.entry.px;
  const live = T >= tr.entry.t && T < tr.exit.t_end;
  if (T < tr.entry.t) return { live: false, started: false, r: 0, mfeR: 0, maeR: 0, heldMin: 0 };
  const done = T >= tr.exit.t_end, upto = done ? tr.exit.t_end : T;
  const st = barsAt(tr, upto), B = tr.B;
  let hi = ep, lo = ep, last = ep;
  for (let i = 0; i < B.n; i++) {
    if (B.t[i] + B.s <= tr.entry.t) continue;
    if (i >= st.done && i !== st.forming) break;
    const bar = i === st.forming ? formingBar(tr, i, st.frac) : { h: B.h[i], l: B.l[i], c: B.c[i] };
    hi = Math.max(hi, bar.h); lo = Math.min(lo, bar.l); last = bar.c;
  }
  const fav = (dir > 0 ? hi - ep : ep - lo) / risk, adv = (dir > 0 ? ep - lo : hi - ep) / risk;
  return { live, started: true, done, r: done ? tr.r : (dir * (last - ep)) / risk, mfeR: Math.max(0, fav), maeR: Math.max(0, adv), heldMin: (upto - tr.entry.t) / 60 };
}

export function rPath(tr) {
  const dir = tr.side === 'LONG' ? 1 : -1, risk = Math.max(1e-6, tr.risk_pts), B = tr.B, out = [{ m: 0, r: 0 }];
  for (let i = 0; i < B.n; i++) {
    const t = B.t[i] + B.s;
    if (t <= tr.entry.t) continue;
    if (t > tr.exit.t_end) break;
    out.push({ m: (t - tr.entry.t) / 60, r: (dir * (B.c[i] - tr.entry.px)) / risk });
  }
  out.push({ m: Math.max(out[out.length - 1].m, (tr.exit.t - tr.entry.t) / 60), r: tr.r });
  return out;
}

export function queueOf(trades, kind) {
  const byUsd = trades.slice().sort((a, b) => b.usd - a.usd || b.entry.t - a.entry.t);
  if (kind === 'best') return byUsd.filter((t) => t.usd > 0).slice(0, 5);
  if (kind === 'worst') return byUsd.filter((t) => t.usd < 0).reverse().slice(0, 5);
  return trades.slice();
}
