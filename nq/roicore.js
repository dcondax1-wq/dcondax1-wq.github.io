// EVAL ECONOMICS core (day-evalroi 2026-11-27). Pure ES module: no DOM, no fetch (node-tested: tests/test_evalroi.py).
// model(roi, lite) -> { best, earned, spent, rows: [{ key, name, price, slot, lines[], good, bad, verdict, lvl }], caveat }
//   roi  = ./roi.json (tools/roi_build.py: the stored real-engine eval sims, the owner's real prices, MFFU's slots)
//   lite = the PC's newest status post (pc_feed.js): the payouts actually paid to you so far (mf rows' funded tracker "pt" / "pn")
// Plain words and $. Never made-up numbers: a missing field is "not simulated" / "not recorded".

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
export function usd(v, sign) {
  const n = num(v); if (n === null) return '-';
  const a = Math.abs(n), s = a >= 100 || Number.isInteger(a) ? Math.round(a).toLocaleString('en-US') : a.toFixed(2);
  return (n < 0 ? '-' : sign && n > 0 ? '+' : '') + '$' + s;
}
const per = (v) => { const n = num(v); return n === null ? '-' : n >= 10 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`; };
const pct = (v) => { const n = num(v); return n === null ? '-' : `${Math.round(n)}%`; };

/** the payouts already paid to you (the PC's funded trackers: pt = $ to you, pn = payouts taken) */
export function earned(lite) {
  const rows = arr(isObj(lite) && isObj(lite.mf) ? lite.mf.a : null).filter((r) => isObj(r) && isObj(r.f));
  const usdSum = rows.map((r) => num(r.f.pt)).filter((v) => v !== null).reduce((a, b) => a + b, 0);
  const n = rows.map((r) => num(r.f.pn)).filter((v) => v !== null).reduce((a, b) => a + b, 0);
  return { has: rows.length > 0, usd: usdSum, n };
}

export function row(r) {
  const M = isObj(r.markets) ? r.markets : {}, g = M.H2 || {}, b = M.Y25 || M.REF || {}, ref = M.REF || {};
  const lines = [
    `Pass ${pct(g.pass)} in 60 sessions, blown ${pct(g.blow)}, about ${num(g.days) ?? '-'} sessions to pass (2026-like market)`,
    `Every $1 of eval fees returns ${per(g.per_dollar)} in a 2026-like market, ${per(b.per_dollar)} in a 2025-like one`,
    `6 months: ${usd(g.net6, true)} (2026-like) · ${usd(b.net6, true)} (2025-like) · ${usd(ref.net6, true)} (2021-25 mix), after every fee and re-buy`,
    num(r.break_even_months) !== null ? `Pays back its $${Number(r.price).toFixed(2)} at the first payout, about ${r.break_even_months} months after buying (2026-like)` : 'Does not pay back on average in the tested markets',
  ];
  const slot = r.free > 0 ? `${r.free} free MFFU slot` : `MFFU slots full (${r.used} of ${r.cap}): a re-buy only if one of yours fails`;
  const good = num(g.net6) ?? 0, bad = num(b.net6) ?? 0;
  const lvl = good > 0 && bad >= 0 ? 'ok' : good > 0 ? 'warn' : 'bad';
  return { key: r.key, name: r.name, price: r.price, priceText: usd(r.price), slot, free: r.free > 0, lines, good, bad, lvl,
    goodPer: num(g.per_dollar), badPer: num(b.per_dollar), verdict: good > 0 && bad < 0 ? '+EV only in a 2026-like market' : good > 0 ? '+EV in every market tested' : '-EV' };
}

export function model(roi, lite) {
  const R = isObj(roi) ? roi : {}, rows = arr(R.rows).filter(isObj).map(row);
  const E = earned(lite), lo = num(R.spent_lo), hi = num(R.spent_hi);
  const spent = lo === null ? null : { lo, hi: hi ?? lo, text: hi && hi !== lo ? `${usd(lo)}-${usd(hi)}` : usd(lo), items: arr(R.spent) };
  const net = spent ? { lo: (E.usd || 0) - spent.hi, hi: (E.usd || 0) - spent.lo } : null;
  return {
    rows, best: isObj(R.best) ? R.best : null, spent, earned: E, net,
    earnedText: !E.has ? 'none recorded yet' : E.n ? `${usd(E.usd)} from ${E.n} payout${E.n === 1 ? '' : 's'}` : '$0 so far (no payout taken yet)',
    caveat: 'Honest caveat: in a 2025-like or 2021-25 market every eval here loses money (it passes 7-21% of the time and rarely reaches a payout). '
      + 'The plus numbers need LIT to keep trading like it did in 2026.',
    made: String(R.made || ''), src: String(R.src || ''), consfix: String(R.consfix || ''), markets: isObj(R.markets) ? R.markets : {},
  };
}
