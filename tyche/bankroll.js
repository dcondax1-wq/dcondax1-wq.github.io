// TYCHE bankroll: the bankroll curve and the risk of ruin, from the bot's own settled bets (no DOM, no WebGL, pure numbers).
//   bankCurve(model)  -> { src, pts: [[unix s, balance], ...] }  what the bankroll did (the feed's equity, else the settled bets)
//   simulate(model)   -> { ok, n, bank, share, hit, avgR, ruin, half, p10, p50, p90, fan, sizes }
// The simulation resamples the bot's real settled bets (the return on each stake, fees in) with a fixed seed, so the same feed
// always gives the same answer: 600 paths of the next 60 bets, each stake a fixed share of the bankroll at that moment (the
// bot's median stake over its bankroll, times a size factor). "Ruin" = the bankroll falls to 20% of where it is now (down 80%);
// "lose half" = it touches 50%. sizes = the same odds if every stake were x0.5, x1 (now), x2 (the question a Kelly dial asks).
// It is a picture of the past repeating, not a forecast: a short or lucky history will look safer than it is.

export const HORIZON = 60, PATHS = 600, RUIN_AT = 0.2, HALF_AT = 0.5, MIN_BETS = 8, SIZES = [0.5, 1, 2];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const median = (a) => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

/** What the bankroll did: the feed's equity points, else the running sum of the settled bets ending at the balance. */
export function bankCurve(model) {
  if (!model) return { src: 'none', pts: [] };
  const eq = model.equity && model.equity.pts ? model.equity.pts.filter((p) => p[1] != null) : [];
  if (eq.length >= 2) return { src: model.equity.src, pts: eq.slice(-200) };
  const S = (model.settled || []).filter((s) => s.pnl != null && s.t != null);
  if (S.length >= 2 && model.balance != null) {
    let v = model.balance - S.reduce((a, s) => a + s.pnl, 0);
    const pts = [[S[0].t - 3600, v]];
    S.forEach((s) => { v += s.pnl; pts.push([s.t, v]); });
    return { src: 'bets', pts };
  }
  return { src: 'none', pts: model.balance != null ? [[model.t || 0, model.balance]] : [] };
}

/** One batch of paths at one size factor: the fraction that ever touched RUIN_AT / HALF_AT, and (if keep) every path's values. */
function run(rs, share, size, H, N, seed, keep) {
  const rand = rng(seed), vals = keep ? Array.from({ length: H + 1 }, () => new Float64Array(N)) : null;
  let ruin = 0, half = 0;
  for (let p = 0; p < N; p++) {
    let v = 1, lo = 1;
    if (keep) vals[0][p] = 1;
    for (let h = 1; h <= H; h++) {
      v += v * share * size * rs[Math.floor(rand() * rs.length)];
      if (v < 0) v = 0;
      if (v < lo) lo = v;
      if (keep) vals[h][p] = v;
    }
    if (lo <= RUIN_AT) ruin++;
    if (lo <= HALF_AT) half++;
  }
  return { ruin: ruin / N, half: half / N, vals };
}

export function simulate(model, o = {}) {
  const H = o.horizon || HORIZON, N = o.paths || PATHS, seed = o.seed || 7;
  const S = model ? (model.settled || []).filter((s) => s.pnl != null && s.staked > 0) : [];
  const bank = model && model.balance > 0 ? model.balance : null;
  if (S.length < MIN_BETS || !bank) return { ok: false, n: S.length, need: MIN_BETS, bank };
  const rs = S.map((s) => Math.max(-1, Math.min(3, s.pnl / s.staked)));
  const share = Math.max(0.002, Math.min(0.25, median(S.map((s) => s.staked)) / bank));
  const main = run(rs, share, 1, H, N, seed, true);
  const pct = (h, q) => { const a = Array.from(main.vals[h]).sort((x, y) => x - y); return a[Math.min(N - 1, Math.floor(q * N))]; };
  const fan = [];
  for (let h = 0; h <= H; h += 2) fan.push([h, pct(h, 0.1), pct(h, 0.5), pct(h, 0.9)]);
  if (fan[fan.length - 1][0] !== H) fan.push([H, pct(H, 0.1), pct(H, 0.5), pct(H, 0.9)]);
  const sizes = SIZES.map((k) => { const r = k === 1 ? main : run(rs, share, k, H, N, seed + k * 13, false); return { k, ruin: r.ruin, half: r.half }; });
  const wins = rs.filter((r) => r > 0).length;
  return { ok: true, n: S.length, bank, share, hit: wins / rs.length, avgR: rs.reduce((a, b) => a + b, 0) / rs.length, horizon: H, paths: N,
    ruin: main.ruin, half: main.half, p10: pct(H, 0.1) * bank, p50: pct(H, 0.5) * bank, p90: pct(H, 0.9) * bank, fan, sizes };
}
