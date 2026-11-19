// MNEMOSYNE EDGE core (ES module, no DOM, no network; night-botgap 2026-11-18, research/writeups/bot-gap-2026-11-18.md): what the best trade journals and
// strategy reports show (Tradervue, TradesViz, Edgewonk, NinjaTrader Trade Performance, TradingView's strategy report) and our journal apps did not:
//   rowsFrom(edge)              journal/edge.json (tools/journal_edge_build.py: the Why app's Zlarior + ATLAS backtest trades with their MAE / MFE) -> rows
//   realRows(trading, odeon, lite, nowS)   the real and paper trades: ../trading/trades.json, ../odeon/trades.json and the PC's live feed ("at" + board trades)
//   pick(rows, {bot, set})      one bot, one set: '2026' | 'H1' | 'H2' | 'old' (2021-25) | 'all' | 'real'
//   stats(rows)                 expectancy in $ and R, win %, profit factor, payoff, SQN (Van Tharp, n capped at 100), trades a week
//   groups(rows, by)            the same per setup / session window / weekday / exit, with "holds in both 2026 halves"
//   heat(rows)                  the weekday x entry-hour map ($, R, n per cell; under 3 trades no claim)
//   curve(rows)                 the equity curve, the drawdown under it, the 3 deepest drawdowns with their recovery, the longest time under water
//   excursion(rows)             MAE / MFE: how far winners went against us first, how far losers were up, the share of the best move kept, the give-back
//   runs(outcomes) / streak(history, real, opts)   is this losing run normal? (the backtest's own 40-trade stretches + a seeded bootstrap)
//   fills(lite, nowS)           the PC's fill check ("fq", engine/feed_fills.compact) in plain words, or null
// Money rule: every R sits next to its dollars. Read only: it never places, sizes or changes anything.

export const VERSION = 1;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (a) => (Array.isArray(a) ? a : []);
export const num = (v) => { const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80);

// ------------------------------------------------------------------------------------------------ words
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.round(Math.abs(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; return v > 0 && Math.round(v) !== 0 ? '+' + money(v) : money(v); }
export function rWord(r, d = 2) { const v = num(r); if (v == null) return '0R'; const q = Number(v.toFixed(d)); return (q > 0 ? '+' : q < 0 ? '-' : '') + Math.abs(q).toFixed(d) + 'R'; }
/** "+$212 (+0.27R)": a dollar figure always with its R */
export const both = (usd, r, d = 2) => `${moneyS(usd)} (${rWord(r, d)})`;
export const pct = (x) => (num(x) == null ? '-' : Math.round(x) + '%');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const BOTS = { LIT: { name: 'Zlarior', key: 'L' }, ATLAS: { name: 'ATLAS', key: 'A' } };
export const SETS = [['2026', '2026'], ['H1', 'Jan-Jun 2026'], ['H2', 'Jul-Oct 2026'], ['old', '2021-25'], ['real', 'Real + paper']];
export const setWord = (k) => (SETS.find((s) => s[0] === k) || [0, k])[1];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DAY_WORDS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const hourWord = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWord(ymd, withYear) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}${withYear ? ', ' + m[1] : ''}` : ''; }
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const msOf = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
export const daysBetween = (a, b) => Math.round((msOf(b) - msOf(a)) / 86400000);
/** 0 = Monday .. 6 = Sunday of a YYYY-MM-DD (the trading day) */
export const dowOf = (ymd) => (new Date(msOf(ymd)).getUTCDay() + 6) % 7;

// the session windows, New York time (minutes after midnight); the same cut as tools/trade_intel.py "session"
export const SESSIONS = [['asia', 'Asia 18:00-02:00'], ['lon', 'London 02:00-05:00'], ['lon2', 'London late 05:00-08:00'], ['pre', 'NY pre-open 08:00-09:30'],
  ['am', 'NY morning 09:30-11:30'], ['mid', 'NY midday 11:30-13:30'], ['pm', 'NY afternoon 13:30-16:00']];
export function sessionOf(min) {
  const m = num(min); if (m == null) return null;
  if (m >= 1080 || m < 120) return 'asia';
  if (m < 300) return 'lon'; if (m < 480) return 'lon2'; if (m < 570) return 'pre'; if (m < 690) return 'am'; if (m < 810) return 'mid'; if (m < 960) return 'pm';
  return null;
}
export const sessionWord = (k) => (SESSIONS.find((s) => s[0] === k) || [0, 'Other hours'])[1];
const minOf = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };
export function spanOf(day) { if (!YMD.test(day || '')) return null; if (day >= '2026-07-01') return 'H2'; if (day >= '2026-01-01') return 'H1'; return 'old'; }
export const outcome = (r) => (num(r) == null ? null : r >= 0.5 ? 'W' : r <= -0.5 ? 'L' : 'S');

// ------------------------------------------------------------------------------------------------ the trade rows
/** edge.json -> rows, oldest first: {day, hm, min, wd, span, bot, setup, side, qty, risk, r, usd, mfe, mae, exit, held, src: 'backtest'} */
export function rowsFrom(edge) {
  if (!isObj(edge) || !Array.isArray(edge.rows)) return [];
  const S = isObj(edge.setups) ? edge.setups : {}, X = arr(edge.exits), out = [];
  for (const v of edge.rows) {
    if (!Array.isArray(v) || v.length < 12) continue;
    const [d, hm, b, s, sd, q, k, r, u, f, a, x, m] = v;
    if (!YMD.test(String(d)) || num(r) == null || num(u) == null || (b !== 'L' && b !== 'A')) continue;
    const bot = b === 'L' ? 'LIT' : 'ATLAS', min = minOf(hm), wd = dowOf(d);
    out.push({ day: d, hm: str(hm, 5), min, wd, span: spanOf(d), bot, setup: str(arr(S[b])[num(s)], 40) || 'Other', side: num(sd) < 0 ? 'SHORT' : 'LONG', qty: num(q), risk: num(k),
      r: num(r), usd: num(u), mfe: num(f), mae: num(a), exit: str(X[num(x)], 10) || 'OTHER', held: num(m), src: 'backtest' });
  }
  return out;
}

// the PC account ids (tools/live_trades.ACCOUNTS): which bot an account runs
const LIT_IDS = ['zlarior', 'mffu50k_eval', 'lit', 'main', 'fleet', 'b25k_2'], ATLAS_IDS = ['atlas', 'acctb', 'account_b'];
const HIDDEN = /blitz|acctc|acct_c|atlas_v2/i;
export function botOfAcct(id) { const a = String(id || '').toLowerCase(); if (!a || HIDDEN.test(a)) return null; if (ATLAS_IDS.includes(a)) return 'ATLAS'; if (LIT_IDS.includes(a) || a.startsWith('rapid') || a.startsWith('b25k') || a.startsWith('mffu')) return 'LIT'; return null; }
const etFmt = (() => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) { return null; } })();
/** an epoch second -> {day: the CME trading day (18:00 ET opens the next one), hm} in New York time */
export function etOf(t) {
  const x = num(t); if (x == null || !etFmt) return null;
  const p = {}; for (const q of etFmt.formatToParts(new Date(x * 1000))) p[q.type] = q.value;
  const h = +p.hour % 24, hm = `${String(h).padStart(2, '0')}:${p.minute}`;
  let day = `${p.year}-${p.month}-${p.day}`;
  if (h >= 18) { const d = new Date(msOf(day) + 86400000); day = d.toISOString().slice(0, 10); }
  return { day, hm };
}
const SETUP_OF_MEMBER = { EMA: 'EMA', MACD: 'MACD', 'S/R': 'S/R', ema_lon_vix: 'EMA', macd_sweep: 'MACD', sr_nyreclaim: 'S/R' };
const EXIT_WORD = (k) => { const s = String(k || '').toUpperCase(); return s.startsWith('STOP') ? 'STOP' : s.startsWith('TARGET') ? 'TARGET' : s === 'BE' ? 'BE' : /CUT|T15/.test(s) ? 'CUT' : s === 'HEDGE' ? 'HEDGE' : s ? 'FLAT' : 'OTHER'; };
function realRow(o) {
  if (!o.bot || !YMD.test(o.day || '') || num(o.r) == null || num(o.usd) == null) return null;
  const min = minOf(o.hm);
  return { day: o.day, hm: o.hm || '', min, wd: dowOf(o.day), span: spanOf(o.day), bot: o.bot, setup: o.setup || (o.bot === 'LIT' ? 'Live trade' : 'ATLAS'), side: o.side === 'SHORT' ? 'SHORT' : 'LONG',
    qty: num(o.qty), risk: num(o.risk) || (num(o.r) && Math.abs(o.r) > 0.05 ? Math.abs(o.usd / o.r) : null), r: num(o.r), usd: num(o.usd), mfe: num(o.mfe), mae: num(o.mae), exit: EXIT_WORD(o.exit),
    held: num(o.held), src: o.src === 'paper' ? 'paper' : 'live', t: num(o.t), acct: o.acct || null, feed: !!o.feed };
}
export const FEED_FRESH_S = 3 * 3600;
const feedT = (l) => num(isObj(l) && isObj(l.reporter) ? l.reporter.t : null) || num(isObj(l) ? l.t : null);
/** the real and paper trades, oldest first, ONE row per signal (the same Zlarior signal on the 50K and the 25K #2 = one row; a real fill wins over its paper twin) */
export function realRows(trading, odeon, lite, nowS) {
  const rows = [];
  for (const t of arr(isObj(trading) ? trading.trades : null)) {
    if (!isObj(t) || (t.src !== 'live' && t.src !== 'paper')) continue;
    const bot = t.bot === 'ATLAS' ? 'ATLAS' : t.bot === 'LIT' ? 'LIT' : null;
    rows.push(realRow({ bot, day: t.day, hm: str(t.hm, 5), side: t.side, qty: t.q, risk: t.risk, r: t.r, usd: t.usd, exit: t.k, src: t.src, t: t.t, acct: t.ak || t.acct, setup: bot === 'ATLAS' ? SETUP_OF_MEMBER[t.m] : null }));
  }
  for (const t of arr(isObj(odeon) ? odeon.trades : null)) {
    if (!isObj(t) || (t.src !== 'real' && t.src !== 'paper')) continue;
    const e = isObj(t.entry) ? num(t.entry.t) : null, p = etOf(e) || {};
    rows.push(realRow({ bot: t.bot === 'ATLAS' ? 'ATLAS' : 'LIT', day: t.day || p.day, hm: p.hm, side: t.side, qty: t.qty, risk: t.risk_usd, r: t.r, usd: t.usd, mfe: t.mfe_r, mae: t.mae_r,
      exit: isObj(t.exit) ? t.exit.kind : null, held: t.held_min, src: t.src === 'real' ? 'live' : 'paper', t: e }));
  }
  const l = isObj(lite) ? lite : null, ft = feedT(l), now = num(nowS);
  if (l && ft != null && (now == null || now - ft <= FEED_FRESH_S)) {
    for (const a of arr(isObj(l.at) ? l.at.a : null)) {
      const bot = isObj(a) ? botOfAcct(a.id) : null; if (!bot) continue;
      for (const v of arr(a.tr)) {
        if (!Array.isArray(v) || num(v[0]) == null || num(v[1]) == null) continue;      // an open trade has no result yet
        const [t, xt, d, q, , , , k, usd, r] = v, p = etOf(t) || {};
        rows.push(realRow({ bot, day: p.day, hm: p.hm, side: num(d) < 0 ? 'SHORT' : 'LONG', qty: q, r, usd, exit: k, src: 'live', t, held: (xt - t) / 60, acct: str(a.id, 24), feed: true }));
      }
    }
    for (const b of arr(isObj(l.board) ? l.board.trades : null)) {
      if (!isObj(b) || b.open || num(b.entry_t) == null) continue;
      const bot = botOfAcct(b.acct); if (!bot) continue;
      const p = etOf(b.entry_t) || {};
      rows.push(realRow({ bot, day: b.day || p.day, hm: p.hm, side: b.side, qty: b.qty, r: b.r, usd: b.usd, exit: b.exit, src: b.src === 'paper' ? 'paper' : 'live', t: b.entry_t,
        held: num(b.exit_t) && (b.exit_t - b.entry_t) / 60, acct: str(b.acct, 24), setup: bot === 'ATLAS' ? SETUP_OF_MEMBER[b.member] || SETUP_OF_MEMBER[b.key] : null, feed: true }));
    }
  }
  const best = new Map(), plain = (v) => !v || v === 'Live trade' || v === 'ATLAS';
  for (const x of rows) {
    if (!x) continue;
    const k = `${x.bot}|${x.t ? Math.floor(x.t / 60) : x.day + x.hm}`, o = best.get(k);
    if (!o) { best.set(k, x); continue; }
    if (o.src === 'paper' && x.src === 'live') { best.set(k, x); continue; }
    if (o.src === x.src) best.set(k, { ...o, setup: plain(o.setup) && !plain(x.setup) ? x.setup : o.setup, mfe: o.mfe ?? x.mfe, mae: o.mae ?? x.mae, acct: o.acct || x.acct, qty: o.qty ?? x.qty });
  }
  return [...best.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.t || 0) - (b.t || 0) || (a.min || 0) - (b.min || 0)));
}

/** one bot, one set */
export function pick(rows, o) {
  const bot = (o && o.bot) || 'LIT', set = (o && o.set) || '2026';
  return arr(rows).filter((x) => x && x.bot === bot && (set === 'real' ? x.src !== 'backtest' : x.src === 'backtest' && (set === 'all' || (set === '2026' ? x.span !== 'old' : x.span === set))));
}

// ------------------------------------------------------------------------------------------------ the numbers
/** expectancy and friends. winPct = the share of trades that made money (the Trading page's win %); wins / losses / scratches use R:
 *  a win is +0.5R or more, a loss -0.5R or worse, a scratch (a breakeven exit) in between */
export function stats(rows) {
  const R = arr(rows).filter((x) => x && num(x.r) != null && num(x.usd) != null), n = R.length;
  const out = { n, wins: 0, losses: 0, scratches: 0, winPct: null, net: 0, netR: 0, exp: null, expR: null, pf: null, avgWin: null, avgLoss: null, payoff: null, sqn: null, perWeek: null, from: null, to: null, risk: null };
  if (!n) return out;
  let gw = 0, gl = 0, nw = 0, nl = 0;
  for (const x of R) {
    const o = outcome(x.r); if (o === 'W') out.wins++; else if (o === 'L') out.losses++; else out.scratches++;
    out.net += x.usd; out.netR += x.r;
    if (x.usd > 0) { gw += x.usd; nw++; } else if (x.usd < 0) { gl -= x.usd; nl++; }
  }
  out.net = r2(out.net); out.netR = r2(out.netR);
  out.winPct = Math.round((100 * nw) / n);
  out.exp = r2(out.net / n); out.expR = r2(out.netR / n);
  out.pf = gl > 0 ? r2(gw / gl) : gw > 0 ? Infinity : null;
  out.avgWin = nw ? r2(gw / nw) : null; out.avgLoss = nl ? r2(-gl / nl) : null;
  out.payoff = out.avgWin != null && out.avgLoss ? r2(out.avgWin / -out.avgLoss) : null;
  const mean = out.netR / n, sd = n > 1 ? Math.sqrt(R.reduce((s, x) => s + (x.r - mean) ** 2, 0) / (n - 1)) : 0;
  out.sqn = sd > 0 && n >= 10 ? r2((mean / sd) * Math.sqrt(Math.min(n, 100))) : null;
  const days = R.map((x) => x.day).filter((d) => YMD.test(d)).sort();
  out.from = days[0] || null; out.to = days[days.length - 1] || null;
  if (out.from && out.to) { const wk = Math.max(1, (daysBetween(out.from, out.to) + 1) / 7); out.perWeek = r2(n / wk); }
  const risks = R.map((x) => num(x.risk)).filter((v) => v != null && v > 0).sort((a, b) => a - b);
  out.risk = risks.length ? Math.round(risks[Math.floor(risks.length / 2)]) : null;
  return out;
}
export const pfWord = (pf) => (pf == null ? '-' : pf === Infinity ? 'no losses' : pf.toFixed(2));
export const MIN_GROUP = 5;
const KEYS = { setup: (x) => x.setup, session: (x) => sessionOf(x.min), weekday: (x) => (x.wd >= 0 && x.wd <= 4 ? DAYS[x.wd] : null), exit: (x) => x.exit, side: (x) => x.side };
const LABEL = { setup: (k) => k, session: sessionWord, weekday: (k) => DAY_WORDS[DAYS.indexOf(k)] || k, exit: (k) => ({ STOP: 'Stop', TARGET: 'Target', BE: 'Breakeven', FLAT: 'Flat by the close', CUT: '15-minute check', HEDGE: 'Closed: Zlarior took the other side' }[k] || k), side: (k) => (k === 'LONG' ? 'Long' : 'Short') };
/** stats per group (setup | session | weekday | exit | side), most money first; holds = positive R per trade in both 2026 halves (5+ trades each) */
export function groups(rows, by) {
  const f = KEYS[by] || KEYS.setup, m = new Map();
  for (const x of arr(rows)) { const k = f(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  const out = [];
  for (const [k, L] of m) {
    const s = stats(L), h1 = stats(L.filter((x) => x.span === 'H1')), h2 = stats(L.filter((x) => x.span === 'H2'));
    const both2026 = h1.n >= MIN_GROUP && h2.n >= MIN_GROUP;
    out.push({ key: k, label: LABEL[by] ? LABEL[by](k) : k, ...s, enough: s.n >= MIN_GROUP, h1: h1.expR, h2: h2.expR, h1n: h1.n, h2n: h2.n,
      holds: both2026 ? (h1.expR > 0 && h2.expR > 0 ? 'both' : h1.expR <= 0 && h2.expR <= 0 ? 'neither' : 'mixed') : null });
  }
  return out.sort((a, b) => b.net - a.net || b.n - a.n);
}
/** one plain sentence about the best and the weakest group with enough trades */
export function groupLine(G, what) {
  const ok = arr(G).filter((g) => g.enough);
  if (!ok.length) return `Not enough trades in one ${what} yet to say (${MIN_GROUP}+ each); no claim is made.`;
  const best = ok.reduce((a, b) => (b.expR > a.expR ? b : a)), worst = ok.reduce((a, b) => (b.expR < a.expR ? b : a));
  let s = `${best.label} pays the most per trade: ${both(best.exp, best.expR)} over ${plural(best.n, 'trade')}`;
  if (best.holds === 'both') s += ', positive in both 2026 halves';
  else if (best.holds === 'mixed') s += ', but only one 2026 half was positive';
  s += '.';
  if (worst !== best) s += ` Weakest: ${worst.label}, ${both(worst.exp, worst.expR)} a trade (${plural(worst.n, 'trade')}).`;
  return s;
}

/** the weekday x entry-hour map: rows Mon-Fri, columns the hours that have trades (at least 02-15 ET when empty) */
export function heat(rows) {
  const R = arr(rows).filter((x) => x && x.wd >= 0 && x.wd <= 4 && num(x.min) != null);
  let h0 = 24, h1 = -1;
  for (const x of R) { const h = Math.floor(x.min / 60); if (h < h0) h0 = h; if (h > h1) h1 = h; }
  if (h1 < 0) { h0 = 2; h1 = 15; }
  const hours = []; for (let h = h0; h <= h1; h++) hours.push(h);
  const cells = DAYS.map((_, d) => hours.map((h) => ({ d, h, n: 0, usd: 0, r: 0, w: 0, l: 0 })));
  for (const x of R) { const c = cells[x.wd][Math.floor(x.min / 60) - h0]; c.n++; c.usd += x.usd; c.r += x.r; const o = outcome(x.r); if (o === 'W') c.w++; else if (o === 'L') c.l++; }
  let max = 0, best = null, worst = null;
  for (const row of cells) for (const c of row) {
    c.usd = r2(c.usd); c.r = r2(c.r); c.enough = c.n >= 3;
    if (c.enough) max = Math.max(max, Math.abs(c.usd));
    if (c.n >= MIN_GROUP) { if (!best || c.r / c.n > best.r / best.n) best = c; if (!worst || c.r / c.n < worst.r / worst.n) worst = c; }
  }
  const busy = hours.map((h, i) => ({ h, n: cells.reduce((s, row) => s + row[i].n, 0) })).sort((a, b) => b.n - a.n);
  return { hours, cells, max, best, worst, n: R.length, busy: busy.filter((b) => b.n > 0).slice(0, 3).map((b) => b.h).sort((a, b) => a - b) };
}
export const cellWord = (c) => (c ? `${DAY_WORDS[c.d]} ${hourWord(c.h)}: ${plural(c.n, 'trade')}${c.n ? `, ${both(c.usd, c.r)} in all, ${both(c.usd / c.n, c.r / c.n)} a trade` : ''}${c.n && !c.enough ? ' (under 3 trades: no claim)' : ''}` : '');

/** the equity curve and its drawdowns, in $ and R */
export function curve(rows) {
  const R = arr(rows).filter((x) => x && num(x.usd) != null);
  const pts = []; let cum = 0, cumR = 0, peak = 0, peakR = 0, peakDay = R.length ? R[0].day : null, maxDD = 0, maxDDR = 0;
  const dds = []; let cur = null;
  for (let i = 0; i < R.length; i++) {
    const x = R[i]; cum += x.usd; cumR += x.r || 0;
    if (cum >= peak) {
      if (cur) { cur.to = x.day; cur.days = daysBetween(cur.from, x.day); cur.recovered = true; dds.push(cur); cur = null; }
      peak = cum; peakR = cumR; peakDay = x.day;
    } else {
      const dd = cum - peak;
      if (!cur) cur = { from: peakDay, low: x.day, depth: 0, depthR: 0, to: null, days: null, recovered: false, trades: 0 };
      cur.trades++;
      if (dd < cur.depth) { cur.depth = r2(dd); cur.depthR = r2(cumR - peakR); cur.low = x.day; }
    }
    if (cum - peak < maxDD) { maxDD = cum - peak; maxDDR = cumR - peakR; }
    pts.push({ i, day: x.day, cum: r2(cum), dd: r2(cum - peak) });
  }
  if (cur) { cur.days = R.length ? daysBetween(cur.from, R[R.length - 1].day) : 0; dds.push(cur); }
  const top = dds.filter((d) => d.depth < 0).sort((a, b) => a.depth - b.depth).slice(0, 3);
  const longest = dds.reduce((a, d) => (d.days != null && d.days > (a ? a.days : -1) ? d : a), null);
  const net = r2(cum);
  return { pts, n: R.length, net, netR: r2(cumR), maxDD: r2(maxDD), maxDDR: r2(maxDDR), top, longest, under: cur ? { from: cur.from, depth: cur.depth, days: cur.days } : null,
    recovery: maxDD < 0 ? r2(net / -maxDD) : null };
}

/** MAE / MFE: how far trades went against us before they ended, and how far our way */
export function quant(list, q) { const a = arr(list).filter((v) => num(v) != null).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return r2(a[lo] + (a[hi] - a[lo]) * (i - lo)); }
export function excursion(rows) {
  const R = arr(rows).filter((x) => x && num(x.mae) != null && num(x.mfe) != null && num(x.r) != null);
  const W = R.filter((x) => outcome(x.r) === 'W'), L = R.filter((x) => outcome(x.r) === 'L'), up1 = R.filter((x) => x.mfe >= 1);
  const heat = W.map((x) => x.mae), up = L.map((x) => x.mfe);
  const avgMfe = R.length ? R.reduce((s, x) => s + x.mfe, 0) / R.length : null, avgR = R.length ? R.reduce((s, x) => s + x.r, 0) / R.length : null;
  return { n: R.length, wins: W.length, losses: L.length, heatMed: quant(heat, 0.5), heatP75: quant(heat, 0.75), heatP90: quant(heat, 0.9),
    deep: W.filter((x) => x.mae >= 0.75).length, upMed: quant(up, 0.5), upHalf: L.filter((x) => x.mfe >= 0.5).length,
    up1: up1.length, up1Won: up1.filter((x) => outcome(x.r) === 'W').length, up1Back: up1.filter((x) => outcome(x.r) === 'S').length,
    etd: avgMfe != null ? r2(avgMfe - avgR) : null, risk: stats(R).risk };
}
const rAbs = (r) => `${Math.abs(num(r) || 0).toFixed(2)}R`;
const mAbs = (r, k) => `${money(Math.abs(r * k))} (${rAbs(r)})`;
/** the sentences under the MAE / MFE card, in $ at the given size (1R = risk $) */
export function excursionLines(E, risk) {
  if (!E || E.n < 10) return ['Too few trades with MAE / MFE in this set to say (10+ needed); no claim is made.'];
  const k = num(risk) || E.risk || 0, L = [];
  if (E.wins) L.push(`Winners first went against you by ${mAbs(E.heatMed, k)} in the middle case; 1 in 4 went ${mAbs(E.heatP75, k)} or more against, and ${E.deep} of ${E.wins} went 0.75R or more against before winning. Being down that much is normal.`);
  if (E.losses) L.push(`Losers were up ${mAbs(E.upMed, k)} at most before the stop in the middle case; ${E.upHalf} of ${E.losses} were up half a risk or more first.`);
  if (E.up1) L.push(`Of the ${plural(E.up1, 'trade')} that were 1R up at some point, ${E.up1Won} ended as winners and ${E.up1Back} came back to breakeven (no loss: the stop had moved to the entry).`);
  if (E.etd != null) L.push(`From its best point a trade gave back ${mAbs(E.etd, k)} on average before it ended (NinjaTrader calls this ETD): the price of holding for the target.`);
  return L;
}

// ------------------------------------------------------------------------------------------------ is this losing run normal?
/** losing runs of an outcome list ('W' | 'L' | 'S'): scratches are skipped (a breakeven neither breaks nor adds to a run) */
export function runs(outs) {
  const lens = []; let cur = 0;
  for (const o of arr(outs)) { if (o === 'L') cur++; else if (o === 'W') { if (cur) lens.push(cur); cur = 0; } }
  const done = lens.slice(); if (cur) done.push(cur);
  return { lens: done, longest: done.length ? Math.max(...done) : 0, current: cur };
}
/** a small seeded random generator (mulberry32): the same numbers every time, for the tests and the page */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** history = the bot's backtest rows (all years; 2026 = the year its rules were picked and checked is the basis), real = its real + paper rows,
 *  oldest first. opts {window 40, draws 2000, seed 7}. The verdict compares the run now with a seeded reshuffle of 2026's wins and losses. */
export function streak(history, real, opts) {
  const o = { window: 40, draws: 2000, seed: 7, ...(opts || {}) };
  const WL = (L) => arr(L).map((x) => outcome(x && x.r)).filter((v) => v === 'W' || v === 'L');
  const all = WL(history), now26 = WL(arr(history).filter((x) => x && (x.span === 'H1' || x.span === 'H2'))), live = WL(real);
  const ra = runs(all), r26 = runs(now26), cur = runs(live).current;
  const out = { n: now26.length, nAll: all.length, longest: r26.longest, longestAll: ra.longest, current: cur, realN: live.length, enough: now26.length >= 30, window: o.window,
    lossRate: null, p50: null, p90: null, count: 0, countAll: 0, simShare: null, verdict: 'none', level: 'off' };
  if (!out.enough) return out;
  const lossN = now26.filter((v) => v === 'L').length, p = lossN / now26.length;
  out.lossRate = Math.round(100 * p);
  out.count = r26.lens.filter((k) => k >= Math.max(1, cur)).length; out.countAll = ra.lens.filter((k) => k >= Math.max(1, cur)).length;
  const rand = rng(o.seed), mx = [];
  for (let d = 0; d < o.draws; d++) { let c = 0, best = 0; for (let i = 0; i < o.window; i++) { if (rand() < p) { c++; if (c > best) best = c; } else c = 0; } mx.push(best); }
  out.p50 = quant(mx, 0.5); out.p90 = Math.round(quant(mx, 0.9));
  out.simShare = cur > 0 ? Math.round((100 * mx.filter((k) => k >= cur).length) / mx.length) : null;
  if (!cur) { out.verdict = 'none'; out.level = 'ok'; }
  else if (cur <= out.p50) { out.verdict = 'normal'; out.level = 'ok'; }
  else if (cur <= out.p90) { out.verdict = 'long'; out.level = 'ok'; }
  else if (cur <= Math.max(out.longest, out.longestAll)) { out.verdict = 'rare'; out.level = 'warn'; }
  else { out.verdict = 'new'; out.level = 'bad'; }
  return out;
}
/** the plain words of the streak card (name = the bot, risk = $ of 1R now, room = drawdown left $ or null) */
export function streakLines(s, name, risk, room) {
  const k = num(risk), L = [];
  if (!s || !s.enough) return { head: `Not enough 2026 history for ${name} to judge a losing run.`, lines: [] };
  const cost = (n) => (k ? ` (about ${money(n * k)} at ${money(k)} a trade)` : '');
  let head;
  if (!s.realN) head = `${name} has no real or paper trades in the feed yet.`;
  else if (!s.current) head = `${name}'s last real or paper trade that was not a breakeven was a win: no losing run now.`;
  else {
    const w = { normal: 'Normal', long: 'Normal, on the long side', rare: 'Rare, but it has happened before', new: 'Longer than anything in the backtest' }[s.verdict];
    head = `${w}: ${name} has lost ${plural(s.current, 'trade')} in a row${cost(s.current)}.`;
  }
  L.push(`In 2026, the year its rules were picked and checked, ${name} lost ${s.lossRate}% of the trades that did not end at breakeven; its longest losing run was ${s.longest}${cost(s.longest)}. Over 2021-26 the longest was ${s.longestAll}.`);
  L.push(`With that mix, the longest losing run in any ${s.window} trades is usually ${s.p50} or fewer, and ${s.p90} or fewer 9 times in 10 (a reshuffle of 2026's wins and losses).`);
  if (s.current) {
    L.push(`A run of ${s.current} or more came ${s.count} time${s.count === 1 ? '' : 's'} in 2026 and ${s.countAll} time${s.countAll === 1 ? '' : 's'} in 2021-26; ${s.simShare}% of reshuffled ${s.window}-trade stretches have one.`);
    if (s.verdict === 'new') L.push('This is past the history: open the Board and the circuit breaker before the next trade. Nothing changes by itself.');
    else L.push('Losing runs like this are part of the edge: the winners are few and big. Stepping in now (skipping or closing trades) is what Mnemosyne shows costs money.');
  }
  if (num(room) != null && k) L.push(`Drawdown left ${money(room)}: that is about ${Math.max(0, Math.floor(room / k))} losses at ${money(k)} a trade.`);
  return { head, lines: L };
}

// ------------------------------------------------------------------------------------------------ fills vs plan (the PC's fill check)
const ACCT_NAME = { lit: 'Zlarior 50K', mffu50k_eval: 'Zlarior 50K', b25k_2: 'Zlarior 25K #2', atlas: 'ATLAS', acctb: 'ATLAS' };
const CODE_WORD = { size: 'size off', stop: 'NO STOP at the broker', slip_entry: 'entry slipped', slip_exit: 'stop slipped', stop_off: 'stop price off', target_off: 'target price off', costs: 'costs above plan', refused: 'entry never filled' };
const tk = (v) => { const x = num(v); return x == null ? null : `${Math.abs(x) % 1 ? Math.abs(x).toFixed(1) : Math.abs(x)} tick${Math.abs(x) === 1 ? '' : 's'} ${x > 0 ? 'worse' : x < 0 ? 'better' : ''}`.trim(); };
/** the "fq" block of the PC feed (engine/feed_fills.compact) in words; null when the feed has none (the PC does not send it yet) */
export function fills(lite, nowS) {
  const q = isObj(lite) && isObj(lite.fq) ? lite.fq : null;
  if (!q) return null;
  const t = num(q.t), age = t != null && num(nowS) != null ? Math.max(0, nowS - t) : null, out = { t, age, audit: null, checks: [] };
  const x = isObj(q.ex) ? q.ex : null;
  if (x) {
    const n = num(x.n) || 0, A = { from: str(x.fr, 10), to: str(x.to, 10), n, slip: num(x.sl), exec: num(x.ex), missed: num(x.mi) || 0, missedOn: num(x.mo) || 0, missedUsd: num(x.mu), extra: num(x.xt) || 0,
      extraUsd: num(x.xu), es: num(x.es), xs: num(x.xs), lat: num(x.la), slipped: num(x.sp) || 0, months: [] };
    for (const m of arr(x.m)) if (Array.isArray(m) && /^\d{4}-\d{2}$/.test(String(m[0]))) A.months.push({ month: m[0], n: num(m[1]) || 0, slip: num(m[2]), exec: num(m[3]), missed: num(m[4]) || 0, missedUsd: num(m[5]) });
    const L = [];
    L.push(n ? `${plural(n, 'Zlarior trade')} checked against the backtest on the same bars${A.from ? ` (${dayWord(A.from)} - ${dayWord(A.to)})` : ''}: slippage ${moneyS(A.slip)}${n ? ` (${moneyS(A.slip / n)} a trade)` : ''}.` : 'No Zlarior trade to check against the backtest yet.');
    if (A.es != null || A.xs != null) L.push(`Typical fill: entry ${tk(A.es) || '-'}, exit ${tk(A.xs) || '-'} than the backtest${A.lat != null ? `; the order went out ${A.lat} s after the signal` : ''}.`);
    if (A.missed) L.push(`${plural(A.missed, 'backtest trade')} not taken (${A.missedOn} while the PC was on): ${moneyS(A.missedUsd)} the backtest made on them.`);
    if (A.extra) L.push(`${plural(A.extra, 'extra trade')} the backtest did not take: ${moneyS(A.extraUsd)}.`);
    A.lines = L; out.audit = A;
  }
  for (const v of arr(q.fc)) {
    if (!Array.isArray(v) || num(v[1]) == null) continue;
    const [acct, et, d, plan, filled, se, sx, ex, codes, kind] = v, p = etOf(et) || {};
    const words = String(codes || '').split(/[ ,]+/).filter(Boolean).map((c) => CODE_WORD[c] || str(c, 20));
    const name = ACCT_NAME[String(acct)] || str(acct, 20);
    out.checks.push({ acct: str(acct, 20), name, t: num(et), day: p.day, hm: p.hm, side: num(d) < 0 ? 'SHORT' : 'LONG', plan: num(plan), filled: num(filled), se: num(se), sx: num(sx), exec: num(ex), ok: !words.length, flags: words,
      sim: kind === 'S',
      line: `${name}${kind === 'S' ? ' (Sim)' : ''} ${num(d) < 0 ? 'SHORT' : 'LONG'} ${p.hm || ''}: ${num(filled) != null ? `filled ${filled} of ${plan}` : 'not filled'}${num(se) != null ? `, entry ${tk(se)}` : ''}${num(sx) != null && sx !== 0 ? `, stop ${tk(sx)}` : ''}${num(ex) != null ? `, execution ${moneyS(ex)}` : ''}. ${words.length ? 'Check: ' + words.join('; ') + '.' : 'Fill check OK.'}` });
  }
  return out;
}
/** what the backtest already counts for costs (so the owner knows what "normal" is) */
export const COSTS_LINE = 'The backtest already counts 1 tick of slippage each way and $1.90 a micro in fees; anything above that is execution cost.';

// ------------------------------------------------------------------------------------------------ the size words
/** $ of 1R now for a bot: the risk of its newest real trade (|$ / R|: the size follows the room), else null */
export function riskNow(real) {
  const L = arr(real).filter((x) => x && x.src === 'live' && num(x.r) != null && Math.abs(x.r) >= 0.3 && num(x.usd) != null);
  return L.length ? Math.round(Math.abs(L[L.length - 1].usd / L[L.length - 1].r)) : null;
}
