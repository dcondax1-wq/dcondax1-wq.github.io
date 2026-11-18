// MOIRAI core (ES module, no DOM, no network): the three fates, a seeded Monte-Carlo of an MFFU challenge (Builder 50K, ATLAS 25K, BLITZ 25K). Pure, so tests/test_moirai_page.py runs it in node.
// SIMULATION, NOT A FORECAST. Each session (one trading day) has up to `max_trades` slots; each slot fires with chance (trades a week / 5) / slots, so the average is the same whatever the slots. A trade is a win
// (average win R), a break-even (0R) or a loss (average loss R). 1R = risk % of the account, never more than the daily loss limit. Rules modelled, from research/lit/mffu_rules.json:
//   trailing floor  the highest end-of-day balance minus the max loss, locking at start + $100; touching it busts the path
//   daily loss      a SOFT limit: once a day's closed loss reaches it, no more trades that session (counted as blocked trades); next session resumes
//   minimum days    MFFU's pages disagree (1 or 2 trading days): the default is 2, so a target hit on day 1 waits for a second trading day
//   best-day (consistency)  MFFU's Builder EVAL has none (confirmed); the payout rule is 50%. A switch applies it to the eval as a stress test: pass needs the best day <= 50% of the profit
// Every path is also run with those three rules switched off (same random draws), so the page can say how much they delay or block. Costs are already inside the R's; intraday swings are not modelled.
// Same seed, same numbers: every path has its own seed, so chunking never changes a result.

export const PLANS = {
  b50: { name: 'Builder 50K', start: 50000, target: 3000, mll: 2000, lock: 100, dll: 1000, price: 91.8 },
  atlas: { name: 'ATLAS 25K', start: 25000, target: 1500, mll: 1000, lock: 100, dll: 600, price: 43 },
  blitz: { name: 'BLITZ 25K', start: 25000, target: 1500, mll: 1000, lock: 100, dll: 600, price: 63 },
};
export const PLAN_ORDER = ['b50', 'atlas', 'blitz'];
export const RULES = { ...PLANS.b50, plan: 'Builder 50K', horizon: 30, min_days: 2, cons: 0.5 };
export const DEFAULTS = { win: 0.267, scratch: 0.292, avg_win_r: 4.49, avg_loss_r: 0.88, tpw: 3.08, risk_pct: 0.6, seed: 2026, paths: 1000, cons_on: 0, min_days: 2, max_trades: 1 };
export const NOTE = 'A simulation, not a forecast: it replays a coin-flip with the odds you set. Real trading has slippage, streaks and rules this does not model.';

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,%\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.floor(x * 100 + 0.5) / 100;
export const money = (v) => { const x = r2(v), s = Math.abs(x).toLocaleString('en-US', x === Math.trunc(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (x < 0 ? '-$' : '$') + s; };
export const moneyS = (v) => (r2(v) > 0 ? '+' : '') + money(v);
export const pct = (x, d) => (x * 100).toFixed(d == null ? 0 : d) + '%';
export const rS = (r) => { const x = Math.round(r * 10) / 10; return (x > 0 ? '+' : '') + x.toFixed(1) + 'R'; };
/** every R next to its dollars: "+4.5R (+$1,347)" */
export const both = (r, oneR) => `${rS(r)} (${moneyS(r * oneR)})`;

/** the rules of one plan; `over` may refine target / mll / lock / dll / price / horizon / cons from ledger/rules.json (bad values are ignored) */
export function rules(plan, over) {
  const key = Object.prototype.hasOwnProperty.call(PLANS, plan) ? plan : 'b50', o = { ...RULES, ...PLANS[key], plan: PLANS[key].name, key };
  const ov = over && typeof over === 'object' ? over : {};
  const pv = ov[key] && typeof ov[key] === 'object' ? ov[key] : ov;
  for (const k of ['start', 'target', 'mll', 'lock', 'dll', 'price', 'horizon', 'cons']) { const v = num(pv[k]); if (v != null && v > 0) o[k] = v; }
  o.horizon = Math.trunc(clamp(Math.floor(o.horizon), 5, 60)); o.cons = clamp(o.cons, 0.1, 1);
  return o;
}
/** clamp every input; win + break-even never exceed 100% */
export function clean(inp, over) {
  const d = { ...DEFAULTS }, i = inp && typeof inp === 'object' ? inp : {};
  for (const k of Object.keys(d)) { const v = num(i[k]); if (v != null) d[k] = v; }
  d.plan = Object.prototype.hasOwnProperty.call(PLANS, i.plan) ? i.plan : 'b50';
  const R = rules(d.plan, over);
  d.win = clamp(d.win, 0, 0.95); d.scratch = clamp(d.scratch, 0, 0.95 - d.win);
  d.avg_win_r = clamp(d.avg_win_r, 0.1, 20); d.avg_loss_r = clamp(d.avg_loss_r, 0.1, 3); d.tpw = clamp(d.tpw, 0.1, 5);
  d.risk_pct = clamp(d.risk_pct, 0.05, 5); d.seed = Math.trunc(clamp(Math.floor(d.seed), 0, 2147483647)); d.paths = Math.trunc(clamp(Math.floor(d.paths), 10, 5000));
  d.cons_on = d.cons_on >= 0.5 ? 1 : 0; d.min_days = Math.trunc(clamp(Math.floor(d.min_days), 1, 5)); d.max_trades = Math.trunc(clamp(Math.floor(d.max_trades), 1, 3));
  d.loss = r2(1 - d.win - d.scratch) < 0 ? 0 : 1 - d.win - d.scratch;
  d.oneR = Math.max(1, Math.min(R.dll, r2(d.risk_pct / 100 * R.start)));        // 1R in dollars, never more than the daily loss limit
  d.perDay = Math.min(1, d.tpw / 5); d.slotP = d.perDay / d.max_trades;
  d.rules = R;
  d.expR = d.win * d.avg_win_r - d.loss * d.avg_loss_r;
  return d;
}

// ------------------------------------------------------------------ the random numbers
export function mulberry32(a) {
  return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pathSeed = (seed, i) => (Math.imul(seed ^ 0x9E3779B9, 0x85EBCA6B) + Math.imul(i + 1, 0xC2B2AE35)) | 0;

/** one path: equity after every session until it passes or busts (then frozen). end = 'pass' | 'bust' | 'open'; day = the session it was decided on.
 *  relaxed = the same random draws with the minimum-days, best-day and daily-loss rules off (to measure what they cost). */
export function simPath(p, i, relaxed) {
  const R = p.rules, rnd = mulberry32(pathSeed(p.seed, i)), H = R.horizon, top = R.start + R.target;
  const minDays = relaxed ? 1 : p.min_days, consOn = relaxed ? false : p.cons_on === 1, lockOn = !relaxed;
  let eq = R.start, hwm = R.start, end = 'open', day = null, trades = 0, tradeDays = 0, best = 0, hit = null, hitWhy = null, blockedNow = null, lockBlocked = 0, lockDays = 0;
  const path = [eq];
  for (let d = 1; d <= H; d++) {
    if (end === 'open') {
      let dayPnl = 0, traded = false, locked = false;
      for (let s = 0; s < p.max_trades && end === 'open'; s++) {
        if (!(rnd() < p.slotP)) continue;
        const u = rnd();                                                   // always drawn, so the relaxed twin sees the same trades
        if (lockOn && dayPnl <= -R.dll) { lockBlocked++; locked = true; continue; }   // soft daily loss limit: the rest of the session is off
        const r = u < p.win ? p.avg_win_r : u < p.win + p.scratch ? 0 : -p.avg_loss_r;
        eq += r * p.oneR; dayPnl += r * p.oneR; trades++; traded = true;
        const floor = Math.min(R.start + R.lock, hwm - R.mll);
        if (eq <= floor) { end = 'bust'; day = d; eq = floor; }
      }
      if (locked) lockDays++;
      if (end === 'open') {
        if (traded) { tradeDays++; hwm = Math.max(hwm, eq); best = Math.max(best, dayPnl); }
        if (eq >= top) {
          const why = tradeDays < minDays ? 'mindays' : consOn && best > R.cons * (eq - R.start) ? 'consistency' : null;
          if (hit == null) { hit = d; hitWhy = why; }
          if (why == null) { end = 'pass'; day = d; } else blockedNow = why;
        } else blockedNow = null;
      }
    }
    path.push(r2(eq));
  }
  return { eq: path, end, day, trades, hit, hitWhy, blocked: end === 'open' && hit != null ? blockedNow : null, lockBlocked, lockDays };
}
export function simChunk(p, from, to, relaxed) { const out = []; for (let i = from; i < to; i++) out.push(simPath(p, i, relaxed)); return out; }

const quant = (sorted, q) => { const k = (sorted.length - 1) * q, lo = Math.floor(k), hi = Math.ceil(k); return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo); };
/** every number the page shows, from the path results (and the relaxed twins, when given) */
export function summarize(results, p, twins) {
  const n = results.length, H = p.rules.horizon, share = (f) => (n ? results.filter(f).length / n : 0);
  const passDay = results.filter((r) => r.end === 'pass').map((r) => r.day).sort((a, b) => a - b);
  const S = { n, horizon: H };
  for (const k of [10, 15]) { S['p' + k] = share((r) => r.end === 'pass' && r.day <= k); S['f' + k] = share((r) => r.end === 'bust' && r.day <= k); S['dec' + k] = S['p' + k] + S['f' + k]; }
  S.pass = share((r) => r.end === 'pass'); S.bust = share((r) => r.end === 'bust'); S.open = share((r) => r.end === 'open');
  S.slow_pass = passDay.length ? passDay.filter((d) => d > 15).length / passDay.length : 0;       // share of the passes that took longer than 15 sessions
  S.pass_med = passDay.length ? quant(passDay, 0.5) : null;
  S.trades_med = n ? quant(results.map((r) => r.trades).sort((a, b) => a - b), 0.5) : 0;
  S.bands = [];
  for (let d = 0; d <= H; d++) {
    const col = results.map((r) => r.eq[d]).sort((a, b) => a - b);
    S.bands.push(n ? [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => r2(quant(col, q))) : [p.rules.start, p.rules.start, p.rules.start, p.rules.start, p.rules.start]);
  }
  S.sample = results.slice(0, 24).map((r) => r.eq);
  S.expected = { r: p.expR, usd: p.expR * p.oneR, week: p.expR * p.oneR * p.tpw, month: p.expR * p.oneR * p.tpw * 52 / 12 };
  S.fees = S.pass > 0 ? p.rules.price / S.pass : null;      // expected eval fees to land one pass if every failed try is bought again (estimate)
  // which rule bit: counted per path, against what the same path does with the rules off
  const cnt = (f) => results.filter(f).length;
  S.rules = {
    hit: cnt((r) => r.hit != null),
    delayed_mindays: cnt((r) => r.end === 'pass' && r.hit != null && r.day > r.hit && r.hitWhy === 'mindays'),
    delayed_cons: cnt((r) => r.end === 'pass' && r.hit != null && r.day > r.hit && r.hitWhy === 'consistency'),
    blocked_mindays: cnt((r) => r.blocked === 'mindays'), blocked_cons: cnt((r) => r.blocked === 'consistency'),
    bust_after_hit: cnt((r) => r.end === 'bust' && r.hit != null),
    lock_trades: results.reduce((s, r) => s + r.lockBlocked, 0), lock_paths: cnt((r) => r.lockBlocked > 0), lock_days: results.reduce((s, r) => s + r.lockDays, 0),
    passes: cnt((r) => r.end === 'pass'),
  };
  if (twins && twins.length === n) {
    const t = (f) => twins.filter(f).length / Math.max(1, n);
    S.relaxed = { pass: t((r) => r.end === 'pass'), bust: t((r) => r.end === 'bust'), p10: t((r) => r.end === 'pass' && r.day <= 10), p15: t((r) => r.end === 'pass' && r.day <= 15) };
    S.overstated = { pass: S.relaxed.pass - S.pass, p10: S.relaxed.p10 - S.p10, p15: S.relaxed.p15 - S.p15 };      // points of pass chance the rules take away (>= 0 up to noise of busts after a delay)
  } else { S.relaxed = null; S.overstated = null; }
  return S;
}
/** the rules in plain words: which rule delayed or blocked how many passes */
export function rulesWords(S, p) {
  const r = S.rules, R = p.rules, out = [], n = S.n;
  const plural = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
  out.push(r.hit ? `${plural(r.hit, 'path')} of ${n} touched the ${money(R.target)} target; ${plural(r.passes, 'path')} passed.` : `No path reached the ${money(R.target)} target in ${S.horizon} sessions.`);
  if (p.min_days > 1) out.push(r.delayed_mindays + r.blocked_mindays === 0 ? `The ${p.min_days}-trading-day minimum delayed no pass (MFFU's pages say 1 or 2 days).` : `The ${p.min_days}-trading-day minimum delayed ${plural(r.delayed_mindays, 'pass')} and still held back ${plural(r.blocked_mindays, 'path')} at day ${S.horizon} (MFFU's pages say 1 or 2 days).`);
  if (p.cons_on) out.push(r.delayed_cons + r.blocked_cons === 0 ? `The 50% best-day rule (a stress test: MFFU's eval has none) delayed no pass.` : `The 50% best-day rule (a stress test: MFFU's eval has none) delayed ${plural(r.delayed_cons, 'pass')} and kept ${plural(r.blocked_cons, 'path')} from passing within ${S.horizon} sessions.`);
  else out.push("The 50% best-day rule is OFF: MFFU's Builder eval has none (it applies to payouts). Switch it on to stress-test.");
  out.push(r.lock_trades ? `The ${money(R.dll)} daily loss lockout blocked ${plural(r.lock_trades, 'trade')} in ${plural(r.lock_paths, 'path')}.` : p.max_trades === 1 ? `The ${money(R.dll)} daily loss lockout blocked nothing: with one trade a day a loss cannot lock the rest of the day (set 2 or 3 trades a day to see it).` : `The ${money(R.dll)} daily loss lockout blocked nothing on these odds.`);
  if (r.bust_after_hit) out.push(`${plural(r.bust_after_hit, 'path')} touched the target and then still busted before the rules let them pass.`);
  if (S.overstated) out.push(`Without these rules the pass chance would read ${pct(S.relaxed.pass, 1)} instead of ${pct(S.pass, 1)}: ignoring them overstates it by ${(Math.max(0, S.overstated.pass) * 100).toFixed(1)} points.`);
  return out;
}
export function runAll(p) {
  const res = simChunk(p, 0, p.paths), tw = needTwin(p) ? simChunk(p, 0, p.paths, true) : null;
  return summarize(res, p, tw);
}
const needTwin = (p) => p.min_days > 1 || p.cons_on === 1 || p.max_trades > 1;
/** the same run in small chunks so a phone never freezes: defer(fn) schedules the next chunk, onProgress(0..1), cancel() stops it. Resolves with the same summary as runAll. */
export function runChunked(p, { chunk = 100, defer = (f) => setTimeout(f, 0), onProgress = null } = {}) {
  let stop = false;
  const out = [], tw = [], twin = needTwin(p);
  const promise = new Promise((resolve) => {
    const step = () => {
      if (stop) { resolve(null); return; }
      const from = out.length, to = Math.min(p.paths, from + chunk);
      for (const r of simChunk(p, from, to)) out.push(r);
      if (twin) for (const r of simChunk(p, from, to, true)) tw.push(r);
      if (onProgress) onProgress(out.length / p.paths);
      if (out.length >= p.paths) resolve(summarize(out, p, twin ? tw : null)); else defer(step);
    };
    defer(step);
  });
  return { promise, cancel() { stop = true; } };
}
export const fates = (S) => [{ id: 'pass', label: 'Pass', share: S.pass }, { id: 'bust', label: 'Bust', share: S.bust }, { id: 'open', label: 'Still open', share: S.open }];

export function jarvisCard(S, p, nowSec) {
  return { v: 1, name: 'Moirai', status: { level: 'off', label: 'Simulation' }, kpis: [{ label: 'Pass in 15', value: pct(S.p15) }, { label: 'Bust in 15', value: pct(S.f15) }, { label: 'Median', value: S.pass_med == null ? '-' : Math.round(S.pass_med) + ' sessions' }],
    lines: ['A simulation, not a forecast.', `1R = ${money(p.oneR)}; ${rS(p.expR)} (${moneyS(p.expR * p.oneR)}) a trade on these odds.`], t: nowSec | 0, open: '#', theme: '#14110e', stale_after: 604800 };
}
