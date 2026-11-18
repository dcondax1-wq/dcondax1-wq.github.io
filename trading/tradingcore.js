// TRADING core (ES module, pure: no DOM, no network, no storage). The numbers of the Trading page (tools/web_public/trading/), node-tested by tests/test_trading_page.py.
// Input: ./trades.json (tools/trading_export.py: every 2026 trade, src backtest / paper / live), ../home.json board.trades (the PC's newest), the canonical accounts of
// olympus/truth.js accountsOf(home), ../ledger/rules.json limits, ../business/accounts.json rules, and the clock. BLITZ is hidden (owner 2026-11-15) and always left out.
//   merge(file, home, lite, nowS)     -> rows (file rows + home.json's + the fresh PC feed's, one per trade and account), newest last
//   feedRows(lite, nowS)              -> LIVE rows of the PC's ntfy feed (pc_feed.js: board_trades + "at" per account) when it is fresh
//   pick(rows, {bot, src, acct})      -> the rows of one bot ('all' | 'LIT' | 'ATLAS'), one source ('live' | 'paper' | 'backtest'), one account
//   liveAccounts(rows) / liveStats(rows)   the LIVE accounts with trades (Zlarior 50K, Zlarior 25K #2, ATLAS funded 25K, Rapid 25K) and their numbers
//   daily(rows) / months(rows) / monthGrid(ym, rows)   the calendar (weekdays only: the bots trade Mon-Fri)
//   stats(rows, from, to) / halves(rows)               trades/week, win %, PF, avg win / loss $, best / worst day, max DD $, streaks; 2026 H1 vs H2
//   hours(rows) / weekdays(rows)      the time-of-day and weekday bars;  equity(rows) the curve per bot
//   flatClock(nowS)                   MFFU: flat by 16:10 ET, no orders 16:10-18:00 ET, weekend closed Fri 16:10 - Sun 18:00
//   todayCards(A, rows, home, nowS) / rulesCheck(A, rows, rules, biz) / twins(rows) / lastLive(rows, ages)
export const BOTS = { LIT: { bot: 'LIT', acct: 'zlarior', ak: 'z50k', name: 'Zlarior', plan: 'builder_50k', size: '50K' }, ATLAS: { bot: 'ATLAS', acct: 'atlas', ak: 'atlas25f', name: 'ATLAS', plan: 'builder_25k', size: '25K' } };
const mainLive = (r, bot) => r.src === 'live' && r.bot === bot && (r.ak || BOTS[bot].ak) === BOTS[bot].ak;   // the bot's own account (the cards' account)
export const SRC = { live: 'LIVE', paper: 'PAPER', backtest: 'BACKTEST' };
// the LIVE accounts (tools/live_trades.py ACCOUNTS, the same keys): key -> name, bot (null = from the trade), the PC / ledger ids that mean it
export const ACCTS = {
  z50k: { name: 'Zlarior 50K', bot: 'LIT', ids: ['zlarior', 'mffu50k_eval', 'lit', 'main'] },
  z25k2: { name: 'Zlarior 25K #2', bot: 'LIT', ids: ['b25k_2'] },
  atlas25f: { name: 'ATLAS funded 25K', bot: 'ATLAS', ids: ['atlas', 'acctb', 'account_b'] },
  rapid25: { name: 'Rapid 25K', bot: null, ids: ['rapid', 'acctr', 'rapid25k', 'rapid_25k', 'rapideod', 'rapid_eod'] },
};
export const FEED_FRESH_S = 36 * 3600;   // a PC feed older than this is not read for trades (the same 36 hours the banner calls stale)
export const REPLAY_LATER = 'Replay after tonight\'s data upload';
export const SRC_WORDS = { live: 'LIVE from the PC (the real MFFU eval)', paper: 'PAPER (the cloud\'s practice twin)', backtest: 'BACKTEST (a replay of the rules, not money made)' };
export const FLAT_MOD = 970, OPEN_MOD = 1080;          // 16:10 and 18:00 ET (research/lit/mffu_rules.json trading_hours; ledger/rules.json flat_by_mod / open_mod)
export const RAPID = { cons: 0.3, target: 3000, minDays: 4 };   // the Rapid EOD 50K evaluation (business/accounts.json rules: "no single day over 30% of it", "at least 4 days")
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n || 80);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ATLAS_RX = /atlas|ema|macd|sr_/;
/** a PC / ledger account id -> the account key (z50k, z25k2, atlas25f, rapid25, or a new account's own id); null = hidden or junk */
export function acctKey(id, bot) {
  const a = String(id == null ? '' : id).trim().toLowerCase().split('/').pop();
  if (!a) return bot === 'ATLAS' ? 'atlas25f' : bot === 'LIT' ? 'z50k' : null;
  if (/blitz|acctc|acct_c|atlas_v2/.test(a)) return null;
  for (const k of Object.keys(ACCTS)) if (ACCTS[k].ids.includes(a) || (k === 'rapid25' && a.startsWith('rapid'))) return k;
  return /^[a-z0-9_]{2,24}$/.test(a) ? a : null;
}
export const acctName = (k) => (ACCTS[k] ? ACCTS[k].name : `Account ${str(k, 24)}`);

// ------------------------------------------------------------------------------------------------ words and numbers
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rFmt(r) { const v = num(r); if (v == null) return ''; const k = Math.round(v * 10) / 10; return (k > 0 ? '+' : k < 0 ? '-' : '') + Math.abs(k).toFixed(1) + 'R'; }
export function px(x) { const v = num(x); return v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function dayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); if (!m) return str(day, 12);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WD[d.getUTCDay()]} ${+m[3]} ${MON[+m[2] - 1]}`;
}
export function longDay(day) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? `${dayLabel(day)} ${m[1]}` : ''; }
export function monthLabel(ym) { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '')); return m ? `${MONTH_FULL[+m[2] - 1]} ${m[1]}` : ''; }
export function ageWords(sec) {
  const s = Math.max(0, Math.floor(num(sec) || 0));
  if (s < 60) return 'less than a minute';
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return plural(d, 'day') + (h ? ' ' + plural(h, 'hour') : '');
}
const inWords = (mins) => { const m = Math.max(0, Math.round(mins)), h = Math.floor(m / 60), r = m % 60; return h ? `${plural(h, 'hour')}${r ? ' ' + plural(r, 'minute') : ''}` : plural(r, 'minute'); };
/** New York wall time of an epoch in seconds: { day, hm, wd (0 = Sun), mod (minutes after midnight) } */
export function etParts(t) {
  const v = num(t); if (v == null) return null;
  try {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(v * 1000))) p[x.type] = x.value;
    const hh = p.hour === '24' ? '00' : p.hour;
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${hh}:${p.minute}`, wd: WD.indexOf(p.weekday), mod: parseInt(hh, 10) * 60 + parseInt(p.minute, 10) };
  } catch (_) { return null; }
}
const wdOf = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : -1; };
const addDays = (day, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

// ------------------------------------------------------------------------------------------------ rows
const hidden = (x) => /blitz/i.test(`${x.bot || ''} ${x.acct || ''} ${x.key || ''} ${x.name || ''}`);
function clean(x) {
  if (!isObj(x) || hidden(x)) return null;
  const bot = x.bot === 'ATLAS' ? 'ATLAS' : x.bot === 'LIT' ? 'LIT' : null, src = SRC[x.src] ? x.src : null, t = num(x.t);
  if (!bot || !src || t == null || !isDay(x.day)) return null;
  const usd = num(x.usd);
  return { id: str(x.id, 80), bot, acct: BOTS[bot].acct, src, m: str(x.m, 8), day: x.day, hm: /^\d{2}:\d{2}$/.test(String(x.hm)) ? x.hm : (etParts(t) || {}).hm || '', t, xt: num(x.xt),
    side: x.side === 'SHORT' ? 'SHORT' : 'LONG', q: num(x.q), e: num(x.e), s: num(x.s), tg: num(x.tg), x: num(x.x), k: str(x.k, 12).toUpperCase(), usd: usd == null ? 0 : usd, r: num(x.r), risk: num(x.risk),
    odeon: typeof x.odeon === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(x.odeon) ? x.odeon : null, twin: isObj(x.twin) ? x.twin : null, open: x.open === true,
    ...(src === 'live' ? liveAcct(x, bot) : {}), feed: x.feed === true };
}
/** a LIVE row's account: its key ("ak"), name and last 4 digits only ("a4"); a row without one = the bot's own account */
function liveAcct(x, bot) {
  const k = typeof x.ak === 'string' && /^[a-z0-9_]{2,24}$/.test(x.ak) ? x.ak : acctKey('', bot);
  return { ak: k, an: acctName(k), a4: /^\d{4}$/.test(String(x.a4 || '')) ? String(x.a4) : null };
}
/** the futures session day of an ET time: from 18:00 ET it is the next day's session, and a weekend lands on Monday (the calendar is Mon-Fri) */
export function sessionDay(p) {
  if (!p || !isDay(p.day)) return '';
  let d = p.mod >= OPEN_MOD ? addDays(p.day, 1) : p.day;
  while (wdOf(d) === 0 || wdOf(d) === 6) d = addDays(d, 1);
  return d;
}
/** the PC's trades in home.json board.trades -> rows (src live / paper) */
export function homeRows(home) {
  const out = [];
  for (const x of arr(obj(obj(home).board).trades)) {
    if (!isObj(x) || hidden(x)) continue;
    const s = String(x.acct || x.key || '').toLowerCase(), bot = ATLAS_RX.test(s) ? 'ATLAS' : 'LIT', t = num(x.entry_t) != null ? num(x.entry_t) : num(x.exit_t);
    if (t == null) continue;
    const p = etParts(t) || {}, side = String(x.side || (num(x.dir) != null ? (num(x.dir) > 0 ? 'LONG' : 'SHORT') : '')).toUpperCase(), src = String(x.src || '') === 'paper' ? 'paper' : 'live';
    const ak = src === 'live' ? acctKey(x.aid || (bot === 'ATLAS' ? 'atlas' : 'zlarior'), bot) : null;
    const r = clean({ id: `${src}.home.${ak || bot.toLowerCase()}.${t}`, bot, src, ak, m: str(x.member, 8), day: isDay(x.day) ? x.day : sessionDay(p), hm: p.hm, t, xt: num(x.exit_t), side, q: num(x.qty),
      e: num(x.entry != null ? x.entry : x.entry_px), s: num(x.stop != null ? x.stop : x.stop_px), tg: num(x.target != null ? x.target : x.target_px), x: num(x.exit_px),
      k: typeof x.exit === 'string' ? x.exit : x.exit_kind, usd: num(x.usd != null ? x.usd : x.pnl), r: num(x.r != null ? x.r : x.R), open: x.open === true || String(x.exit || '').toUpperCase() === 'OPEN', feed: x.feed === true });
    if (r) out.push(r);
  }
  return out;
}
/** when the PC feed was made (the ext's time, else the reporter's look, else the heartbeat), epoch s; null = none */
export function feedT(lite) { const l = obj(lite); return num(l.ext_t) || num(obj(l.reporter).t) || num(l.t); }
/** the PC feed's trades (pc_feed.js parseLatest: board.trades = the ext's board_trades, "at" = every real account's last trades) as rows,
 *  only when the feed is fresh (FEED_FRESH_S). A board row with src "paper" stays PAPER; the "at" rows are LIVE per account. */
export function feedRows(lite, nowS) {
  const l = obj(lite), ft = feedT(l), now = num(nowS);
  if (ft == null || (now != null && now - ft > FEED_FRESH_S)) return [];
  const out = homeRows({ board: { trades: arr(obj(l.board).trades).map((x) => (isObj(x) ? { ...x, feed: true } : x)) } });
  for (const a of arr(obj(l.at).a)) {
    if (!isObj(a) || hidden(a)) continue;
    for (const v of arr(a.tr)) {
      if (!Array.isArray(v) || num(v[0]) == null) continue;
      const [t, xt, d, q, e, s, tg, k, usd, r] = v, bot0 = ACCTS[acctKey(a.id)] ? ACCTS[acctKey(a.id)].bot : null;
      const ak = acctKey(a.id, bot0 || 'LIT'); if (!ak) continue;
      const bot = bot0 || 'LIT', p = etParts(t) || {};
      const row = clean({ id: `live.feed.${ak}.${t}`, bot, src: 'live', ak, a4: a.l4, day: sessionDay(p), hm: p.hm, t, xt: num(xt), side: num(d) < 0 ? 'SHORT' : 'LONG', q: num(q),
        e: num(e), s: num(s), tg: num(tg), x: null, k: k || '', usd: num(usd), r: num(r), open: num(xt) == null, feed: true });
      if (row) out.push(row);
    }
  }
  return out;
}
/** the same trade: one source and entry minute, and for LIVE one account (two accounts trade the same signal = two rows); else one bot + member */
const tradeKey = (r) => (r.src === 'live' ? `live|${r.ak}|${Math.floor(r.t / 60)}` : `${r.src}|${r.bot}|${r.m}|${Math.floor(r.t / 60)}`);
/** the file's rows plus the PC's newer ones (home.json board.trades, the fresh feed): a trade already in the file keeps the file's row
 *  (it has the twin and the replay); a feed row of a closed trade replaces an earlier open copy */
export function merge(file, home, lite, nowS) {
  const rows = [], at = {};
  const add = (r) => {
    if (!r) return;
    const k = tradeKey(r), i = at[k];
    if (i == null) { at[k] = rows.length; rows.push(r); return; }
    const old = rows[i];
    if (old.open && !r.open) rows[i] = { ...r, a4: r.a4 || old.a4 };
    else if (!old.a4 && r.a4) rows[i] = { ...old, a4: r.a4 };
  };
  for (const x of arr(obj(file).trades)) add(clean(x));
  for (const r of homeRows(home)) add(r);
  for (const r of feedRows(lite, nowS)) add(r);
  rows.sort((a, b) => a.t - b.t || (a.bot < b.bot ? -1 : a.bot > b.bot ? 1 : 0) || (String(a.ak || '') < String(b.ak || '') ? -1 : 1));
  return rows;
}
export function pick(rows, f) {
  const o = obj(f), bot = o.bot || 'all', src = o.src || 'backtest', acct = o.acct || 'all';
  return arr(rows).filter((r) => r.src === src && (bot === 'all' || r.bot === bot) && (acct === 'all' || src !== 'live' || r.ak === acct) && !r.open);
}
/** the LIVE accounts that have closed trades, in the owner's order (the 4 known first, a new account after): [{ k, name, bot, n, a4 }] */
export function liveAccounts(rows) {
  const by = {};
  for (const r of arr(rows)) if (r.src === 'live' && !r.open && r.ak) { const x = by[r.ak] || (by[r.ak] = { k: r.ak, name: r.an || acctName(r.ak), bot: r.bot, n: 0, a4: null }); x.n += 1; x.a4 = r.a4 || x.a4; }
  const order = Object.keys(ACCTS);
  return Object.values(by).sort((a, b) => ((order.indexOf(a.k) + 1 || 99) - (order.indexOf(b.k) + 1 || 99)) || (a.k < b.k ? -1 : 1));
}
/** LIVE numbers per account: trades, net $, win %, PF, best day, last day, $ today (the session day of nowS) */
export function liveStats(rows, nowS) {
  const today = sessionDay(etParts(nowS));
  return liveAccounts(rows).map((a) => {
    const R = pick(rows, { src: 'live', acct: a.k }), s = stats(R);
    return { ...a, s, today: Math.round(R.filter((r) => r.day === today).reduce((x, r) => x + r.usd, 0) * 100) / 100, todayN: R.filter((r) => r.day === today).length, last: R.length ? R[R.length - 1].day : '' };
  });
}
/** the source to open on: LIVE when there is any live trade, else BACKTEST */
export function defaultSrc(rows) { return arr(rows).some((r) => r.src === 'live') ? 'live' : 'backtest'; }
export function counts(rows) { const c = { live: 0, paper: 0, backtest: 0 }; for (const r of arr(rows)) c[r.src] += 1; return c; }

// ------------------------------------------------------------------------------------------------ the calendar
export function daily(rows) {
  const d = {};
  for (const r of arr(rows)) { const x = d[r.day] || (d[r.day] = { day: r.day, usd: 0, n: 0, trades: [] }); x.usd += r.usd; x.n += 1; x.trades.push(r); }
  for (const k in d) d[k].usd = Math.round(d[k].usd * 100) / 100;
  return d;
}
export function months(rows) { const s = {}; for (const r of arr(rows)) s[r.day.slice(0, 7)] = 1; return Object.keys(s).sort(); }
/** one month, Mon-Fri, whole weeks: [{ day, d, inMonth, usd, n, level (-3..3), label }] rows of 5 */
export function monthGrid(ym, rows) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '')); if (!m) return { weeks: [], total: 0, days: 0, wins: 0, label: '' };
  const D = daily(rows), first = `${ym}-01`, last = new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10);
  let start = first; while (wdOf(start) !== 1) start = addDays(start, wdOf(start) === 0 ? 1 : -1);
  const inMonth = Object.keys(D).filter((k) => k.slice(0, 7) === ym), big = Math.max(1, ...inMonth.map((k) => Math.abs(D[k].usd)));
  const weeks = []; let total = 0, days = 0, wins = 0;
  for (let w = start; w <= last; w = addDays(w, 7)) {
    const row = [];
    for (let i = 0; i < 5; i++) {
      const day = addDays(w, i), x = D[day], inM = day.slice(0, 7) === ym, usd = x ? x.usd : 0, n = x ? x.n : 0;
      if (inM && n) { total += usd; days += 1; if (usd > 0.5) wins += 1; }
      const level = !n || Math.abs(usd) < 0.5 ? 0 : Math.max(-3, Math.min(3, Math.sign(usd) * Math.max(1, Math.ceil((Math.abs(usd) / big) * 3))));
      row.push({ day, d: +day.slice(8, 10), inMonth: inM, usd, n, level: inM ? level : 0, label: `${dayLabel(day)}: ${n ? `${moneyS(usd)}, ${plural(n, 'trade')}` : 'no trade'}` });
    }
    weeks.push(row);
  }
  return { weeks, total: Math.round(total * 100) / 100, days, wins, label: monthLabel(ym) };
}

// ------------------------------------------------------------------------------------------------ stats
/** max drawdown in $ of a list of $ results (peak to trough of the running sum), <= 0 */
export function maxDD(list) { let cum = 0, peak = 0, dd = 0; for (const v of list) { cum += v; if (cum > peak) peak = cum; if (cum - peak < dd) dd = cum - peak; } return Math.round(dd * 100) / 100; }
export function stats(rows, from, to) {
  const R = arr(rows).filter((r) => (!from || r.day >= from) && (!to || r.day <= to));
  const n = R.length, wins = R.filter((r) => r.usd > 0.5), losses = R.filter((r) => r.usd < -0.5);
  const gw = wins.reduce((s, r) => s + r.usd, 0), gl = -losses.reduce((s, r) => s + r.usd, 0), net = R.reduce((s, r) => s + r.usd, 0);
  const D = Object.values(daily(R)).sort((a, b) => (a.day < b.day ? -1 : 1));
  const a = from || (n ? R[0].day : ''), z = to || (n ? R[n - 1].day : ''), weeks = a && z ? Math.max(1, (daysBetween(a, z) + 1) / 7) : 1;
  let sw = 0, sl = 0, cw = 0, cl = 0;
  for (const r of R) { if (r.usd > 0.5) { cw += 1; cl = 0; } else if (r.usd < -0.5) { cl += 1; cw = 0; } else { cw = 0; cl = 0; } sw = Math.max(sw, cw); sl = Math.max(sl, cl); }
  const best = D.reduce((b, d) => (!b || d.usd > b.usd ? d : b), null), worst = D.reduce((b, d) => (!b || d.usd < b.usd ? d : b), null);
  return { n, from: a, to: z, perWeek: n ? Math.round((n / weeks) * 100) / 100 : 0, win: n ? Math.round((wins.length / n) * 1000) / 10 : 0, pf: gl > 0 ? Math.round((gw / gl) * 100) / 100 : (gw > 0 ? Infinity : 0),
    net: Math.round(net * 100) / 100, avgWin: wins.length ? Math.round(gw / wins.length) : 0, avgLoss: losses.length ? -Math.round(gl / losses.length) : 0,
    best: best ? { day: best.day, usd: best.usd } : null, worst: worst ? { day: worst.day, usd: worst.usd } : null, dd: maxDD(R.map((r) => r.usd)), streakW: sw, streakL: sl, days: D.length,
    perMonth: n ? Math.round(net / (weeks / (52 / 12))) : 0 };
}
export const pfText = (pf) => (pf === Infinity ? 'no losses' : pf ? pf.toFixed(2) : '-');
/** 2026 H1 (Jan-Jun: LIT was picked on it) vs H2 (Jul on: the check) per bot */
export function halves(rows) {
  const out = [];
  for (const bot of ['LIT', 'ATLAS']) {
    const R = arr(rows).filter((r) => r.bot === bot), last = R.length ? R[R.length - 1].day : '';
    if (!R.length) continue;
    out.push({ bot, name: BOTS[bot].name, h1: stats(R, '2026-01-02', '2026-06-30'), h2: stats(R, '2026-07-01', last > '2026-07-01' ? last : '2026-07-01') });
  }
  return out;
}
export function statLines(s) {
  return [['Trades a week', s.n ? s.perWeek.toFixed(1) : '-'], ['Win rate', s.n ? `${s.win}%` : '-'], ['Profit factor', s.n ? pfText(s.pf) : '-'], ['Net', moneyS(s.net)],
    ['Average win', s.avgWin ? moneyS(s.avgWin) : '-'], ['Average loss', s.avgLoss ? money(s.avgLoss) : '-'], ['Best day', s.best ? `${moneyS(s.best.usd)} (${dayLabel(s.best.day)})` : '-'],
    ['Worst day', s.worst ? `${moneyS(s.worst.usd)} (${dayLabel(s.worst.day)})` : '-'], ['Max drawdown', money(s.dd)], ['Longest streak', s.n ? `${s.streakW} wins / ${s.streakL} losses` : '-']];
}

// ------------------------------------------------------------------------------------------------ edges and the curve
export function hours(rows) {
  const b = {}; for (const r of arr(rows)) { const h = parseInt(String(r.hm).slice(0, 2), 10); if (!(h >= 0)) continue; const x = b[h] || (b[h] = { k: h, label: `${String(h).padStart(2, '0')}:00`, usd: 0, n: 0, wins: 0 }); x.usd += r.usd; x.n += 1; if (r.usd > 0.5) x.wins += 1; }
  return Object.values(b).sort((a, z) => a.k - z.k).map((x) => ({ ...x, usd: Math.round(x.usd) }));
}
export function weekdays(rows) {
  const b = [1, 2, 3, 4, 5].map((k) => ({ k, label: WD[k], usd: 0, n: 0, wins: 0 }));
  for (const r of arr(rows)) { const w = wdOf(r.day); if (w >= 1 && w <= 5) { const x = b[w - 1]; x.usd += r.usd; x.n += 1; if (r.usd > 0.5) x.wins += 1; } }
  return b.map((x) => ({ ...x, usd: Math.round(x.usd) }));
}
/** the running $ per bot by trade day: { lines: [{ bot, name, pts: [{day, cum}], net, dd }], from, to } */
export function equity(rows) {
  const lines = [], all = arr(rows); let from = '', to = '';
  for (const bot of ['LIT', 'ATLAS']) {
    const D = Object.values(daily(all.filter((r) => r.bot === bot))).sort((a, b) => (a.day < b.day ? -1 : 1));
    if (!D.length) continue;
    let cum = 0; const pts = D.map((d) => { cum += d.usd; return { day: d.day, cum: Math.round(cum * 100) / 100 }; });
    lines.push({ bot, name: BOTS[bot].name, pts, net: Math.round(cum * 100) / 100, dd: maxDD(D.map((d) => d.usd)) });
    if (!from || D[0].day < from) from = D[0].day; if (D[D.length - 1].day > to) to = D[D.length - 1].day;
  }
  return { lines, from, to };
}
/** SVG geometry for the curve: polyline points per line in a w x h box with a zero line */
export function equityPath(eq, w, h, pad) {
  const P = pad == null ? 6 : pad, L = obj(eq).lines || []; if (!L.length) return { paths: [], zero: null };
  const span = Math.max(1, daysBetween(eq.from, eq.to)), vals = [0]; for (const l of L) for (const p of l.pts) vals.push(p.cum);
  const lo = Math.min(...vals), hi = Math.max(...vals), dv = hi - lo || 1;
  const X = (day) => P + (daysBetween(eq.from, day) / span) * (w - 2 * P), Y = (v) => P + (1 - (v - lo) / dv) * (h - 2 * P);
  return { paths: L.map((l) => ({ bot: l.bot, d: [{ day: eq.from, cum: 0 }].concat(l.pts).map((p, i) => `${i ? 'L' : 'M'}${X(p.day).toFixed(1)} ${Y(p.cum).toFixed(1)}`).join(' ') })), zero: Y(0), lo, hi };
}

// ------------------------------------------------------------------------------------------------ the MFFU clock
/** MFFU trading hours: flat by 16:10 ET (no orders 16:10-18:00 ET), reopens 18:00 ET; weekend Fri 16:10 - Sun 18:00. Holidays are not in here. */
export function flatClock(nowS) {
  const p = etParts(nowS); if (!p) return { open: null, code: 'unknown', text: 'The ET clock is not readable on this device.', hm: '' };
  const wd = p.wd, mod = p.mod;
  const toFlat = FLAT_MOD - mod, toOpen = OPEN_MOD - mod;
  if (wd === 6 || (wd === 5 && mod >= FLAT_MOD) || (wd === 0 && mod < OPEN_MOD)) {
    const mins = wd === 0 ? toOpen : wd === 6 ? 1440 - mod + OPEN_MOD : 1440 - mod + 1440 + OPEN_MOD;
    return { open: false, code: 'weekend', hm: p.hm, text: `Weekend: closed. No orders until Sunday 18:00 ET (in ${inWords(mins)}).` };
  }
  if (mod >= FLAT_MOD && mod < OPEN_MOD) return { open: false, code: 'closed', hm: p.hm, text: `Closed: no orders 16:10-18:00 ET. Reopens at 18:00 ET (in ${inWords(toOpen)}).` };
  if (mod >= OPEN_MOD) return { open: true, code: 'evening', hm: p.hm, text: `Open (evening session). Flat by 16:10 ET tomorrow (in ${inWords(1440 - mod + FLAT_MOD)}).` };
  return { open: true, code: 'open', hm: p.hm, text: `Open. Flat by 16:10 ET (in ${inWords(toFlat)}). After that, no orders until 18:00 ET.` };
}

// ------------------------------------------------------------------------------------------------ the sections
/** "last live data: date" from the PC report age (truth agesOf) and the newest LIVE row */
export function lastLive(rows, ages, nowS) {
  const pcT = num(obj(obj(ages).pc).t), lastRow = arr(rows).filter((r) => r.src === 'live').reduce((b, r) => (!b || r.t > b.t ? r : b), null);
  const pcDay = pcT != null ? (etParts(pcT) || {}).day : '', age = pcT != null && num(nowS) != null ? Math.max(0, num(nowS) - pcT) : null;
  const silent = age == null || age > 20 * 60;
  const head = pcT != null ? `Last live data: ${longDay(pcDay)} (${ageWords(age)} ago).` : lastRow ? `Last live data: ${longDay(lastRow.day)} (the last LIVE trade in the file; no PC report loaded).` : 'Last live data: none yet.';
  return { pcT, pcDay, age, silent, stale: age == null || age > 36 * 3600, head, lastTrade: lastRow ? lastRow.day : '' };
}
/** one card per shown account: $ today, open trade, drawdown left, $ to pass */
export function todayCards(A, rows, home, nowS) {
  const out = [], today = (etParts(nowS) || {}).day || '';
  for (const bot of ['LIT', 'ATLAS']) {
    const M = BOTS[bot], a = obj(obj(A)[bot === 'LIT' ? 'lit' : 'atlas']);
    const open = arr(obj(obj(home).board).trades).filter((x) => isObj(x) && x.open === true && !hidden(x) && (/atlas|ema|macd|sr_/.test(String(x.acct || x.key || '').toLowerCase()) ? 'ATLAS' : 'LIT') === bot);
    const repDay = num(a.t) != null ? (etParts(a.t) || {}).day : '';
    const fresh = repDay && repDay === today;
    const todayLive = arr(rows).filter((r) => mainLive(r, bot) && r.day === today);
    const o = open[0] ? { side: String(open[0].side || '').toUpperCase() === 'SHORT' ? 'Short' : 'Long', usd: num(open[0].usd), r: num(open[0].r) } : null;
    out.push({ bot, name: M.name, size: M.size, has: !!a.has,
      today: a.has ? num(a.today) || 0 : null, todayTrades: todayLive.length,
      dayWord: a.has ? (fresh ? 'Today' : repDay ? `On ${dayLabel(repDay)} (the last report)` : 'Today') : 'Today',
      room: a.has ? num(a.room) : null, mll: num(a.mll), toTarget: a.has ? num(a.toTarget) : null, target: num(a.target), profit: a.has ? num(a.profit) : null, balance: a.has ? num(a.balance) : null,
      status: str(a.status, 30), open: o, ddLine: a.has && num(a.room) != null ? `Drawdown left ${money(a.room)} of ${money(a.mll)}` : 'No numbers from the PC yet',
      passLine: a.has && num(a.toTarget) != null ? (num(a.toTarget) <= 0 ? 'Target reached' : `${money(a.toTarget)} to pass (target +${money(a.target)})`) : '' });
  }
  return out;
}
const lim = (rules, plan) => obj(obj(obj(rules).limits)[plan]);
/** best day vs the 30% (Rapid) / 50% (Builder funded) consistency rules, days traded, the next payout line */
export function rulesCheck(A, rows, rules, biz) {
  const out = [], bizRules = {};
  for (const r of arr(obj(biz).rules)) if (Array.isArray(r) && typeof r[0] === 'string') bizRules[r[0]] = str(r[1], 400);
  for (const bot of ['LIT', 'ATLAS']) {
    const M = BOTS[bot], a = obj(obj(A)[bot === 'LIT' ? 'lit' : 'atlas']), L = lim(rules, M.plan);
    const live = arr(rows).filter((r) => mainLive(r, bot) && !r.open), D = Object.values(daily(live));
    const best = D.reduce((b, d) => (!b || d.usd > b.usd ? d : b), null), liveNet = live.reduce((s, r) => s + r.usd, 0);
    const profit = a.has && num(a.profit) != null ? num(a.profit) : Math.round(liveNet * 100) / 100;
    const cons = num(L.cons) || 0.5, buffer = num(L.buffer), payMin = num(L.pay_min), split = num(L.split), start = num(a.start) || (bot === 'LIT' ? 50000 : 25000);
    const share = best && best.usd > 0 && profit > 0 ? best.usd / profit : null;
    const verdict = (c) => {
      if (!best || best.usd <= 0) return { ok: null, text: 'No winning day yet: nothing to check.' };
      if (profit <= 0) return { ok: false, text: `Best day ${moneyS(best.usd)}, but the total is ${moneyS(profit)}: a payout needs the total to be at least ${money(best.usd / c)}.` };
      if (share <= c) return { ok: true, text: `OK: best day ${moneyS(best.usd)} is ${Math.round(share * 100)}% of ${money(profit)} (limit ${Math.round(c * 100)}%).` };
      return { ok: false, text: `Too big: best day ${moneyS(best.usd)} is ${Math.round(share * 100)}% of ${money(profit)}. You need ${money(best.usd / c - profit)} more profit on other days.` };
    };
    const bt = arr(rows).filter((r) => r.src === 'backtest' && r.bot === bot && r.day >= '2026-07-01'), btD = Object.values(daily(bt)), btNet = bt.reduce((s, r) => s + r.usd, 0);
    const btBest = btD.reduce((b, d) => (!b || d.usd > b.usd ? d : b), null);
    out.push({ bot, name: M.name, size: M.size, profit, profitSrc: a.has ? 'the PC report' : 'the LIVE trades in the file', days: D.length, best: best ? { day: best.day, usd: best.usd } : null,
      builder: verdict(cons), rapid: verdict(RAPID.cons), cons,
      payout: buffer != null && payMin != null ? `Once funded: first payout when the profit is at least ${money(buffer + payMin)} (balance ${money(start + buffer + payMin)}), no day over ${Math.round(cons * 100)}% of it; you keep ${Math.round((split || 0.8) * 100)}%.` : '',
      pass: a.has && num(a.toTarget) != null ? (num(a.toTarget) <= 0 ? 'The eval target is reached.' : `Eval: ${money(a.toTarget)} more to pass (+${money(a.target)} target).`) : `Eval target: +${money(num(L.target) || (bot === 'LIT' ? 3000 : 1500))}.`,
      backtest: btBest && btNet > 0 ? `Backtest Jul-Oct: best day ${moneyS(btBest.usd)} = ${Math.round((btBest.usd / btNet) * 100)}% of ${money(btNet)}.` : '',
      ruleText: bizRules[`Builder ${M.size}`] || '' });
  }
  return { accounts: out, rapidText: bizRules['Rapid EOD 50K'] || '' };
}
/** LIVE trades next to their twins (the cloud's PAPER trade at the same minute; the BACKTEST trade within 10 minutes) */
export function twins(rows) {
  const R = arr(rows), out = [];
  for (const r of R.filter((x) => x.src === 'live').slice(-10).reverse()) {
    const tw = obj(r.twin), pick2 = (src) => { if (isObj(tw[src])) return tw[src]; const z = R.find((x) => x.src === src && x.bot === r.bot && Math.abs(x.t - r.t) <= (src === 'paper' ? 60 : 600)); return z ? { usd: z.usd, r: z.r, k: z.k, q: z.q, side: z.side } : null; };
    const p = pick2('paper'), b = pick2('backtest'), twin = b || p, src = b ? 'backtest' : p ? 'paper' : '';
    let verdict, level;
    if (!twin) { verdict = 'No twin: the backtest file ends before this day and the cloud took no paper trade.'; level = 'warn'; }
    else if (twin.side !== r.side) { verdict = `Different side: live ${r.side.toLowerCase()}, ${src} ${String(twin.side).toLowerCase()}.`; level = 'bad'; }
    else if (String(twin.k || '') !== r.k) { verdict = `Same entry, different exit: live ${r.k || '?'}, ${src} ${twin.k || '?'}.`; level = 'warn'; }
    else { const dr = num(twin.r) != null && r.r != null ? Math.abs(num(twin.r) - r.r) : 0; verdict = dr <= 0.15 ? `Match: same side, same exit (${r.k}), R within ${dr.toFixed(2)}.` : `Same exit, R differs by ${dr.toFixed(2)}.`; level = dr <= 0.15 ? 'ok' : 'warn'; }
    out.push({ day: r.day, hm: r.hm, bot: r.bot, name: BOTS[r.bot].name, side: r.side, live: `${moneyS(r.usd)} ${rFmt(r.r)}`.trim(), q: r.q, twinSrc: src ? SRC[src] : '',
      twin: twin ? `${moneyS(twin.usd)} ${rFmt(twin.r)}`.trim() + (num(twin.q) != null ? ` (${twin.q} micros)` : '') : '-', verdict, level });
  }
  return out;
}
/** one trade's line for the list and the day sheet */
export function tradeView(r) {
  const side = r.side === 'SHORT' ? 'Short' : 'Long';
  const bot = r.bot === 'ATLAS' ? `ATLAS${r.m ? ' · ' + r.m : ''}` : 'Zlarior · LIT';
  const who = r.src === 'live' && r.ak ? `${r.an || acctName(r.ak)}${r.a4 ? ' ...' + r.a4 : ''} · ${r.bot === 'ATLAS' ? bot : 'LIT'}` : bot;
  return { id: r.id, day: r.day, dayLabel: dayLabel(r.day), hm: r.hm, bot: r.bot, who, ak: r.ak || '', src: SRC[r.src], srcKey: r.src, side,
    replayLater: r.src === 'live' && !r.odeon ? REPLAY_LATER : '',
    plan: `Entry ${px(r.e)} · Stop ${px(r.s)} · Target ${px(r.tg)}`, usd: moneyS(r.usd), r: rFmt(r.r), exit: r.k ? `Exit: ${r.k.toLowerCase()}` : '', q: r.q,
    sign: r.usd > 0.5 ? 'pos' : r.usd < -0.5 ? 'neg' : '', odeon: r.odeon ? `../odeon/#reel=${encodeURIComponent(r.odeon)}` : '' };
}
export function recent(rows, f, n) { return pick(rows, f).slice(-(n || 30)).reverse().map(tradeView); }
