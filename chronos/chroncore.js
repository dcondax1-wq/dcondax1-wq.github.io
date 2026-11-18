// CHRONOS core (ES module, pure: no DOM, no network). Reads the shape of the site's ../odeon/trades.json (OLYMPUS Odeon) and turns the LIT
// trades into days you can replay: the price path around each trade, the bot's steps in time order, and the plain verdict.
//   What the site publishes: per TRADE (not per day) the 1-minute bars from about two hours before the entry to the exit, the LIT levels,
//   the engine's step events (sweep, inducement, displacement, CISD, limit, entry, breakeven, exit), stop, target, $, R and the best
//   favourable move (mfe_usd). So a "day" here is the day's bot trades; a day with no bot trade has nothing to show.
// Prices are stored as quarter-point ticks from p0: price = (p0 + v) / 4. Times are epoch seconds; off is the New York offset in seconds.

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const RANK = { real: 3, paper: 2, backtest: 1 };

export const SPEEDS = [1, 2, 4, 8];
export const BARS_PER_SEC = 16;          // 1x: sixteen 1-minute bars a second

/** "$1,235" / "-$50" */
export function usd(v) { const n = Math.round(+v || 0); return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US'); }
/** "+$1,235" / "-$50" */
export function sgn(v) { const n = Math.round(+v || 0); return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US'); }
/** the New York clock "HH:MM" of an epoch second, given the trade's own offset */
export function clock(t, off = -14400) {
  const s = ((Math.floor(t + off) % 86400) + 86400) % 86400, hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
/** the weekday name of a YYYY-MM-DD */
export function weekday(day) { return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(day + 'T12:00:00Z').getUTCDay()]; }
export function prettyDay(day) {
  const d = new Date(day + 'T12:00:00Z');
  return `${weekday(day).slice(0, 3)} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}

function bars(b) {
  if (!b || typeof b !== 'object') return null;
  const p0 = num(b.p0), t0 = num(b.t0), s = num(b.s) || 60, dt = arr(b.dt), o = arr(b.o), h = arr(b.h), l = arr(b.l), c = arr(b.c);
  const n = Math.min(dt.length, o.length, h.length, l.length, c.length);
  if (p0 == null || t0 == null || n < 5) return null;
  const px = (v) => (p0 + v) / 4, out = { t: [], o: [], h: [], l: [], c: [] };
  for (let i = 0; i < n; i++) {
    const t = t0 + (+dt[i]) * s, v = [px(+o[i]), px(+h[i]), px(+l[i]), px(+c[i])];
    if (!Number.isFinite(t) || v.some((x) => !Number.isFinite(x))) continue;
    out.t.push(t); out.o.push(v[0]); out.h.push(v[1]); out.l.push(v[2]); out.c.push(v[3]);
  }
  return out.t.length >= 5 ? out : null;
}

/** one raw trade -> the trade Chronos replays, or null when it cannot be replayed (not LIT, no day, no entry, no bars) */
export function parseTrade(x) {
  if (!x || typeof x !== 'object' || (x.strat && x.strat !== 'LIT')) return null;
  const day = typeof x.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.day) ? x.day : null;
  const entry = x.entry && num(x.entry.t) != null && num(x.entry.px) != null ? { t: +x.entry.t, px: +x.entry.px } : null;
  const usdv = num(x.usd), b = bars(x.bars);
  if (!day || !entry || usdv == null || !b) return null;
  const ex = x.exit && num(x.exit.t) != null ? x.exit : null;
  const exit = ex ? { t: +ex.t, px: num(ex.px) != null ? +ex.px : entry.px, kind: String(ex.kind || ''), outcome: String(ex.outcome || (usdv >= 0 ? 'win' : 'loss')) }
    : { t: b.t[b.t.length - 1], px: b.c[b.c.length - 1], kind: 'END', outcome: usdv >= 0 ? 'win' : 'loss' };
  const side = String(x.side || '').toUpperCase() === 'LONG' ? 'LONG' : 'SHORT', qty = num(x.qty) || 1;
  const mfe = Math.max(0, num(x.mfe_usd) || 0);
  const events = arr(x.events).filter((e) => e && num(e.t) != null && typeof e.k === 'string')
    .map((e) => ({ k: e.k, t: +e.t, px: num(e.price), text: String(e.text || '').slice(0, 240), levels: arr(e.levels).map(String) })).sort((p, q) => p.t - q.t);
  const levels = arr(x.levels).filter((v) => v && num(v.px) != null && num(v.t) != null).map((v) => ({ k: String(v.k || ''), name: String(v.name || v.label || 'Level'), px: +v.px, t: +v.t }));
  const tw = x.twin && typeof x.twin === 'object' && num(x.twin.usd) != null ? { qty: num(x.twin.qty), usd: +x.twin.usd, src: String(x.twin.src || '') } : null;
  return { id: String(x.id || `${day}_${entry.t}`), day, src: RANK[x.src] ? x.src : 'backtest', side, qty, usd: usdv, r: num(x.r) || 0, mfe, mfeR: num(x.mfe_r) || 0,
    maeR: num(x.mae_r) || 0, held: num(x.held_min), rr: num(x.plan_rr), off: num(x.off) == null ? -14400 : +x.off, entry, exit, stop: num(x.stop), target: num(x.target),
    be: x.be && num(x.be.t) != null ? { t: +x.be.t, px: num(x.be.px) } : null, events, levels, twin: tw, bars: b };
}

/** the doc -> LIT trades, one per real fill (the same entry in the real, paper and backtest ledgers counts once, the real one wins), oldest first */
export function parseTrades(doc) {
  const raw = doc && Array.isArray(doc.trades) ? doc.trades : [];
  const best = new Map();
  for (const x of raw) {
    const t = parseTrade(x);
    if (!t) continue;
    const key = `${t.day}|${t.entry.t}|${t.side}`, cur = best.get(key);
    if (!cur || RANK[t.src] > RANK[cur.src]) best.set(key, t);
  }
  return [...best.values()].sort((a, b) => a.entry.t - b.entry.t);
}

/** the trades grouped into days, oldest first: { day, trades, usd, best } where best = a perfect exit on every entry that day */
export function dayList(trades) {
  const by = new Map();
  for (const t of trades) { if (!by.has(t.day)) by.set(t.day, []); by.get(t.day).push(t); }
  return [...by.keys()].sort().map((day) => {
    const ts = by.get(day).sort((a, b) => a.entry.t - b.entry.t);
    return { day, trades: ts, usd: ts.reduce((s, t) => s + t.usd, 0), best: ts.reduce((s, t) => s + Math.max(t.usd, t.mfe), 0) };
  });
}

/** { best, worst } day strings by the bot's $ (null when there are no days) */
export function bestWorst(days) {
  if (!days.length) return { best: null, worst: null };
  let b = days[0], w = days[0];
  for (const d of days) { if (d.usd > b.usd) b = d; if (d.usd < w.usd) w = d; }
  return { best: b.day, worst: w.day };
}

const ms = (day) => Date.parse(day + 'T12:00:00Z');
/** this day, one month earlier: the day with a trade nearest to that date (within 7 days), or null */
export function lastMonth(days, day) {
  const d = new Date(ms(day)), y = d.getUTCFullYear(), m = d.getUTCMonth() - 1, dd = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), goal = Date.UTC(y, m, Math.min(dd, last), 12);
  let pick = null, gap = Infinity;
  for (const x of days) { if (x.day >= day) continue; const g = Math.abs(ms(x.day) - goal); if (g < gap) { gap = g; pick = x.day; } }
  return pick && gap <= 7 * 86400e3 ? pick : null;
}
/** the same weekday, the nearest earlier day with a trade (within 5 weeks), or null */
export function sameWeekday(days, day) {
  const wd = new Date(ms(day)).getUTCDay();
  for (let i = days.length - 1; i >= 0; i--) {
    const x = days[i];
    if (x.day >= day) continue;
    if (ms(day) - ms(x.day) > 35 * 86400e3) return null;
    if (new Date(ms(x.day)).getUTCDay() === wd) return x.day;
  }
  return null;
}

/** the picture of one trade: time span, price span (the target only when it is near), and the x / y helpers (0..1) */
export function layout(t) {
  const b = t.bars, n = b.t.length, T0 = b.t[0], T1 = Math.max(b.t[n - 1], t.exit.t);
  let lo = Math.min(...b.l, t.entry.px, t.exit.px), hi = Math.max(...b.h, t.entry.px, t.exit.px);
  if (t.stop != null) { lo = Math.min(lo, t.stop); hi = Math.max(hi, t.stop); }
  const span = Math.max(hi - lo, 1);
  const targetShown = t.target != null && t.target >= lo - span * 0.45 && t.target <= hi + span * 0.45;
  if (targetShown) { lo = Math.min(lo, t.target); hi = Math.max(hi, t.target); }
  const pad = Math.max(hi - lo, 1) * 0.08;
  lo -= pad; hi += pad;
  return { n, T0, T1, lo, hi, targetShown, x: (tt) => (tt - T0) / Math.max(1, T1 - T0), y: (p) => (p - lo) / (hi - lo) };
}
/** the playhead 0..1 -> the epoch second */
export const timeAt = (L, u) => L.T0 + Math.max(0, Math.min(1, u)) * (L.T1 - L.T0);
/** the close at a time (linear between bars) */
export function priceAt(t, tt) {
  const b = t.bars, n = b.t.length;
  if (tt <= b.t[0]) return b.c[0];
  if (tt >= b.t[n - 1]) return b.c[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b.t[m] <= tt) lo = m; else hi = m; }
  const f = (tt - b.t[lo]) / Math.max(1, b.t[hi] - b.t[lo]);
  return b.c[lo] + (b.c[hi] - b.c[lo]) * f;
}
/** how many bars have printed by a time */
export function barsBy(t, tt) { const b = t.bars.t; let k = 0; while (k < b.length && b[k] <= tt) k++; return k; }

const LABEL = { level: 'Level', levels: 'Levels', session: 'Session', setup: 'Setup', sweep: 'Sweep', idm: 'Inducement', disp: 'Displacement', cisd5: '5m CISD', limit: 'Limit armed',
  tap: 'Limit tapped', cisd1: '1m CISD', entry: 'Entry', be: 'Breakeven', exit: 'Exit' };
export const label = (k) => LABEL[k] || k;
/** the bot's steps in time order (those with something to say) */
export function steps(t) { return t.events.filter((e) => e.text && e.k !== 'levels').map((e) => ({ ...e, name: label(e.k), clock: clock(e.t, t.off) })); }
/** the steps that have happened by a time */
export function stepsBy(t, tt) { return steps(t).filter((e) => e.t <= tt); }
/** the phase name at a time, for the big label */
export function phase(t, tt) {
  if (tt >= t.exit.t) return 'Done';
  if (tt >= t.entry.t) return 'In the trade';
  const s = stepsBy(t, tt).filter((e) => ['sweep', 'idm', 'disp', 'cisd5', 'limit', 'tap', 'cisd1'].includes(e.k));
  return s.length ? label(s[s.length - 1].k) : 'Watching';
}

/** the plain words for one trade, and what would have changed it (hindsight on the numbers the site publishes) */
export function tradeVerdict(t) {
  const best = Math.max(t.usd, t.mfe), gap = Math.max(0, best - t.usd), k = t.exit.kind, out = [];
  const R = (x) => (Math.round(x * 10) / 10).toString();
  if (k === 'TARGET') out.push(gap <= Math.max(60, best * 0.04) ? 'It held to the target and was paid in full. Nothing needed to change.' : `It held to the target. Price ran a little further, about ${usd(gap)} more.`);
  else if (k === 'BE') out.push(t.mfeR >= 2 ? `Price ran to ${R(t.mfeR)}R (about ${usd(t.mfe)}) and then came back, so the stop at breakeven closed it near zero. Taking part of the profit earlier would have kept some of it.`
    : 'Price reached 1R, the stop moved to breakeven, and the move faded. The trade cost almost nothing.');
  else if (k === 'STOP') out.push(t.mfeR < 0.5 ? `Price never really went the bot's way (best ${sgn(t.mfe)}), so the stop was hit. Only skipping this setup or a smaller size would have changed the day.`
    : t.mfeR < 1 ? `Price got part of the way (best ${sgn(t.mfe)}, ${(Math.floor(t.mfeR * 100) / 100).toFixed(2)}R) but not to 1R, so there was no breakeven protection and the stop was hit.` : `Price reached ${R(t.mfeR)}R, then reversed through the stop.`);
  else if (k === 'CUT_T15') out.push(`The 15-minute cut closed it: the trade had not moved enough in 15 minutes${gap > 50 ? `, though price later reached ${sgn(t.mfe)} at best` : ''}.`);
  else if (k === 'EOD') out.push('The clock closed it at 15:55, not the stop or the target.');
  else out.push(`It closed on ${k || 'its exit rule'}.`);
  if (t.twin && t.twin.qty != null && t.twin.qty !== t.qty) out.push(`The paper twin traded ${t.twin.qty} micros (${sgn(t.twin.usd)}); this fill was ${t.qty} (${sgn(t.usd)}).`);
  return out;
}

/** the day: the headline "Bot made +$X; best possible would be +$Y", and what would have changed it */
export function dayVerdict(d) {
  const bot = d.usd, best = d.best, n = d.trades.length;
  const head = `${bot >= 0 ? `Bot made ${sgn(bot)}` : `Bot lost ${usd(-bot)}`}; best possible would be ${sgn(best)}.`;
  const what = [];
  for (const t of d.trades) for (const l of tradeVerdict(t)) what.push(n > 1 ? `Trade at ${clock(t.entry.t, t.off)}: ${l}` : l);
  return { head, note: `${n} trade${n > 1 ? 's' : ''} that day.`, gap: Math.max(0, best - bot), what,
    fine: 'Best possible = a perfect exit on the same entry (the best price the trade ever reached, at the size traded). Nobody hits it every time.', bot, best };
}
