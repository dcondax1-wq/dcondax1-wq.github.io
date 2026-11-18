// ODEON timeline: where a trade stands at market time T. Pure functions, no DOM, no three.js.
//   barsAt(tr, T)   -> { done, forming, frac }: bars fully closed by T, the bar forming at T and how far into it
//   formingBar(...) -> the partial OHLC of a forming bar (open -> first extreme -> second extreme -> close)
//   priceAt(tr, T)  -> the traded price at T (the forming bar's path, else the last close)
//   eventsUpTo(tr, T) -> how many caption rows are known at T (row.t <= T)
//   phase(tr, T)    -> 'pre' (before the entry) | 'in' (in the trade) | 'post' (after the exit)

export function barsAt(tr, T) {
  const B = tr.B;
  // binary search: the last bar whose start <= T
  let lo = 0, hi = B.n - 1, k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (B.t[m] <= T) { k = m; lo = m + 1; } else hi = m - 1;
  }
  if (k < 0) return { done: 0, forming: -1, frac: 0 };
  const end = B.t[k] + B.s;
  if (T >= end) return { done: k + 1, forming: -1, frac: 1 };
  return { done: k, forming: k, frac: (T - B.t[k]) / B.s };
}

/** the price path inside a bar: open -> the extreme nearer the open's side first -> the other -> close */
function path(o, h, l, c) {
  const upFirst = c < o; // a red bar usually tags its high first
  return upFirst ? [o, h, l, c] : [o, l, h, c];
}

export function formingBar(tr, i, frac) {
  const B = tr.B;
  const o = B.o[i], h = B.h[i], l = B.l[i], c = B.c[i];
  const p = path(o, h, l, c);
  const f = Math.max(0, Math.min(1, frac)) * 3;
  const seg = Math.min(2, Math.floor(f));
  const u = f - seg;
  const cur = p[seg] + (p[seg + 1] - p[seg]) * u;
  let hi = o, lo = o;
  for (let j = 0; j <= seg; j++) { hi = Math.max(hi, p[j]); lo = Math.min(lo, p[j]); }
  hi = Math.max(hi, cur); lo = Math.min(lo, cur);
  return { o, h: hi, l: lo, c: cur };
}

export function priceAt(tr, T) {
  const st = barsAt(tr, T);
  if (st.forming >= 0) return formingBar(tr, st.forming, st.frac).c;
  if (st.done > 0) return tr.B.c[st.done - 1];
  return tr.B.o[0];
}

export function eventsUpTo(tr, T) {
  const E = tr.events;
  let n = 0;
  while (n < E.length && E[n].t <= T) n++;
  return n;
}

export function phase(tr, T) {
  if (T < tr.entry.t) return 'pre';
  if (T < tr.exit.t_end) return 'in';
  return 'post';
}

/** the stop in force at T (breakeven move included) */
export function stopAt(tr, T) {
  if (tr.be && tr.be.t != null) {
    const be = tr.events.find((e) => e.k === 'be');
    if (be && T >= be.t) return be.price != null ? be.price : tr.be.px;
  }
  return tr.stop;
}

/** open P&L in $ and R at T (0 outside the trade) */
export function openPnl(tr, T) {
  if (T < tr.entry.t) return { usd: 0, r: 0, live: false };
  if (T >= tr.exit.t_end) return { usd: tr.usd, r: tr.r, live: false };
  const p = priceAt(tr, T);
  const pts = (p - tr.entry.px) * tr.d;
  return { usd: pts * 2 * (tr.qty || 1), r: tr.risk_pts ? pts / tr.risk_pts : 0, live: true };
}

/** the bar index (fractional) at T, for the scene's x axis: bar steps since the first bar */
export function stepAt(tr, T) {
  const B = tr.B;
  return (T - B.t[0]) / B.s;
}
