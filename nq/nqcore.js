// NQ core (ES module, no DOM, no network): "the NQ bots, right now". Pure, so the tests call it in node.
// Input: the site's home.json (board.lit, board.atlas, board.trades, live.pc with its blitz / second blocks, results.periods) and the clock.
// Output: three bots (Zlarior / LIT 50K, ATLAS 25K, BLITZ 25K) with an honest status (running / waiting for the PC / stale, with the exact age),
// "Drawdown left $X of $max loss", the day's P&L in $ with its R, the eval progress, the last 10 trades with the rule that closed each, the plan in one sentence,
// the backtest facts with their dates, and the banner shown when the PC has not reported for more than 20 minutes.
// Money words: every dollar result carries its R (a ~ means an estimate from the usual risk, because the report had no R).

export const FRESH_S = 20 * 60;          // a bot "reported" when its last report is at most 20 minutes old: only then its flame burns
// the PC's status post (ntfy, every 15 minutes; board.report_t, pc_feed.js boardOver): fresh for 30 minutes, the ZEUS card's rule (night-feedsB)
export const POST_FRESH_S = 30 * 60;
export const STALE_S = 36 * 3600;        // older than this the numbers are called stale (a once-a-day publish stays "waiting")
export const ORDER = ['lit', 'atlas', 'blitz'];
export const BOTS = {
  lit: { key: 'lit', name: 'Zlarior', bot: 'LIT', size: '50K', plan: 'MFFU Builder 50K eval', start: 50000, mll: 2000, target: 3000, risk: 425, paper: false },
  atlas: { key: 'atlas', name: 'ATLAS', bot: 'ATLAS', size: '25K', plan: 'MFFU Builder 25K eval', start: 25000, mll: 1000, target: 1500, risk: 150, paper: false },
  blitz: { key: 'blitz', name: 'BLITZ', bot: 'BLITZ', size: '25K', plan: 'MFFU Builder 25K rules, paper', start: 25000, mll: 1000, target: 1500, risk: 120, paper: true },
};
export const PLAN_RULE = 'LIT looks for one trade between 02:00 and 15:30 ET and is flat by 15:55 ET.';
export const SILENT_LINE = 'The bots may still be trading; this page just is not hearing from them.';
// the headline backtest facts (run lit_live, costs in), used when home.json has no results block
export const FACTS_BUILTIN = {
  '2026 H2 (check)': { from: '2026-07-01', to: '2026-10-16', trades: 40, pf: 2.91, net: 9918.78, per_month: 2670 },
  '2026 YTD': { from: '2026-01-02', to: '2026-10-16', trades: 120, pf: 4.19, net: 43819.78, per_month: 4467 },
  '2021-25 (reference)': { from: '2021-11-08', to: '2025-12-31', trades: 511, pf: 1.01, net: 1264.94, per_month: 25 },
};

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const first = (...xs) => { for (const x of xs) { const v = num(x); if (v != null) return v; } return null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/</g, '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rFmt(r, est) { const v = num(r); if (v == null) return ''; const k = Math.round(v * 10) / 10; return (est ? '~' : '') + (k > 0 ? '+' : k < 0 ? '-' : '') + Math.abs(k).toFixed(1) + 'R'; }
/** "$ (R)": the R is the report's own, else an estimate (~) from the usual risk */
export function both(usd, r, risk) {
  const u = num(usd) || 0, has = num(r) != null;
  const rr = has ? num(r) : risk ? u / risk : 0;
  return `${moneyS(u)} (${rFmt(rr, !has && Math.round(u) !== 0) || '0.0R'})`;
}
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------------------------------------ time
/** the exact age in plain words: "47 minutes", "5 hours 12 minutes", "4 days 3 hours" */
export function ageWords(sec) {
  const s = Math.max(0, Math.floor(num(sec) || 0));
  if (s < 60) return 'less than a minute';
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return plural(d, 'day') + (h ? ' ' + plural(h, 'hour') : '');
}
export const ageText = (sec) => `${ageWords(sec)} ago`;
/** New York wall time of an epoch in seconds: { day: '2026-11-06', hm: '15:56', label: 'Fri 6 Nov' } */
export function etParts(t) {
  const v = num(t); if (v == null) return null;
  try {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(v * 1000))) p[x.type] = x.value;
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(p.month, 10) - 1] || '';
    const hh = p.hour === '24' ? '00' : p.hour;
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${hh}:${p.minute}`, label: `${p.weekday} ${parseInt(p.day, 10)} ${mon}` };
  } catch (_) { return null; }
}
/** the CME trading day of an epoch (seconds), as the board counts "today" (engine/live_board.trading_day): 18:00 ET starts the next day's
 *  session, so a trade at 23:30 ET and the 00:40 report after it are the same day (polish2 2026-11-19: the calendar day split them, and
 *  the page called the R of that day's trades an estimate "~" every night between midnight and the first hours of the session) */
export function tradingDay(t) { const v = num(t); if (v == null) return ''; const p = etParts(v + 6 * 3600); return p ? p.day : ''; }
function dayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); if (!m) return str(day, 12);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]}`;
}

// ------------------------------------------------------------------------------------------------ status
/** t = the bot's last report (epoch seconds), running = what that report said, nowS = the clock (seconds) */
export function status(t, running, nowS, freshS) {
  const v = num(t);
  if (v == null || v <= 0) return { code: 'none', level: 'off', label: 'No report yet', age: null, ageText: 'never', flame: false, line: 'No report from the PC yet.' };
  const age = Math.max(0, Math.floor(nowS - v)), at = ageText(age);
  if (age <= (num(freshS) || FRESH_S)) {
    return running === false
      ? { code: 'stopped', level: 'warn', label: 'Stopped on the PC', age, ageText: at, flame: true, line: `The PC reported ${at}: the bot is stopped there.` }
      : { code: 'running', level: 'ok', label: 'Running', age, ageText: at, flame: true, line: `Reported ${at}.` };
  }
  if (age <= STALE_S) return { code: 'waiting', level: 'warn', label: 'Waiting for the PC', age, ageText: at, flame: false, line: `Last report ${at}.` };
  return { code: 'stale', level: 'bad', label: 'Stale', age, ageText: at, flame: false, line: `Last report ${at}. These are old numbers.` };
}

// ------------------------------------------------------------------------------------------------ the three bots
function findAccount(home, re) { for (const a of Array.isArray(home.accounts) ? home.accounts : []) { if (isObj(a) && !a.error && re.test([a.id, a.name, a.plan, a.source].join(' ').toLowerCase())) return a; } return null; }
// the site's home.json is a CLOUD build: its board cards are the cloud's paper twin (badge PAPER, source "cloud paper": "$1,900 left" on
// old bars) and its 50K row is badged PAPER. Never shown as Zlarior's or ATLAS's account, late post or not (night-feedsB 2026-11-19, the
// rule of olympus/truth.js): no number beats a wrong one. A cloud build relaying the PC's own cards (badge LIVE, source "PC bot") still counts.
const paperish = (x) => isObj(x) && (/^paper$/i.test(String(x.badge || '')) || /\bcloud\b/i.test(String(x.source || '')));
export const cloudCopy = (home) => String(obj(obj(home).board).where || '').toLowerCase() === 'cloud' && num(obj(obj(home).board).report_t) == null;
function evalBlock(key, home) {
  const board = obj(home.board), pc = obj(obj(home.live).pc);
  if (key === 'lit') {
    if (isObj(board.lit) && num(board.lit.room) != null && !paperish(board.lit)) return { e: board.lit, today: board.lit.today_pnl, wait: board.lit.waiting };
    const a = findAccount(home, /mffu50k|zlarior|builder 50k/); const src = a && String(a.source || '') !== 'cloud' && !paperish(a) ? a : null;
    return src ? { e: obj(src.eval), today: first(obj(src.pnl).today, obj(src.eval).today), wait: obj(src.eval).clock_text } : null;
  }
  if (key === 'atlas') {
    if (isObj(board.atlas) && num(board.atlas.room) != null && !paperish(board.atlas)) return { e: board.atlas, today: board.atlas.today_pnl, wait: board.atlas.waiting };
    const b = obj(obj(home.second).account_b); return isObj(b.eval) ? { e: b.eval, today: first(b.eval.today, b.day_pnl), wait: '' } : null;
  }
  const bl = obj(pc.blitz); return isObj(bl.eval) ? { e: bl.eval, today: bl.eval.today, wait: obj(bl.state).text } : null;
}
function reportTime(key, home) {
  const board = obj(home.board), pc = obj(obj(home.live).pc), rt = num(board.report_t);
  // the PC's status post carries every real account at once (Zlarior, ATLAS, the extra ones): its own time, never an older per-bot block
  if (rt != null && key !== 'blitz') return Math.max(rt, first(pc.t, board.data_t) || 0);
  if (key === 'atlas') return first(obj(pc.second).t, pc.t, obj(home.second).pc_t, board.data_t);
  if (key === 'blitz') return first(obj(pc.blitz).t, isObj(pc.blitz) ? pc.t : null);
  return first(pc.t, board.data_t);
}
const postFresh = (home) => (num(obj(obj(home).board).report_t) != null ? POST_FRESH_S : FRESH_S);
// an account the PC routes besides Zlarior's and ATLAS's own cards (board "accounts": the Zlarior 25K #2 ...): LIT trades it
function extraBot(c) {
  const big = num(c.mll) >= 2000, size = big ? '50K' : '25K';
  return { key: 'x_' + str(c.id, 24).replace(/[^A-Za-z0-9_]/g, ''), name: str(c.name, 40) || 'Account', bot: 'LIT', size, plan: `MFFU Builder ${size} eval`, start: big ? 50000 : 25000,
    mll: big ? 2000 : 1000, target: big ? 3000 : 1500, risk: big ? 425 : 212, paper: false, extra: true };
}
export function botView(key, home, nowS, trades, P0, blk0) {
  const P = P0 || BOTS[key], h = obj(home), pc = obj(obj(h.live).pc), blk = blk0 || evalBlock(key, h), t = reportTime(P0 ? 'lit' : key, h);
  const running = typeof pc.running === 'boolean' ? pc.running : typeof obj(h.board).running === 'boolean' ? h.board.running : null;
  const st = status(blk ? t : null, running, nowS, key === 'blitz' ? FRESH_S : postFresh(h)), rep = etParts(t) ? tradingDay(t) : null, now = tradingDay(nowS);
  const tag = (P.bot === 'LIT' ? 'LIT ' : '') + P.size;
  const base = { key, name: P.name, bot: P.bot, size: P.size, tag, plan: P.plan, paper: P.paper, has: false, status: st, t: blk ? t : null, mll: P.mll, target: P.target, room: null, roomFrac: null, today: 0, todayText: both(0, 0),
    dayLabel: 'Today', profit: null, toTarget: null, progress: 0, balance: null, waiting: '', ddLine: 'Drawdown not reported yet', progLine: 'No eval numbers yet' };
  if (!blk) return base;
  const e = blk.e, start = first(e.start_balance, P.start), mll = first(e.mll, P.mll), room = num(e.room) == null ? null : Math.max(0, num(e.room));
  // a FUNDED account has no pass target: its line is the payout coach's (the ZEUS card's words, pc_feed.js payoutLines), never "$X to go"
  if (/funded/i.test(String(e.status || ''))) {
    const bal = num(e.balance), prof = first(e.profit, bal != null ? bal - start : null), need = num(e.to_target), today = num(blk.today) || 0;
    return { ...base, has: true, tag: `${P.size} funded`, plan: P.plan.replace(/\beval\b/, 'funded'), mll, room, roomFrac: room != null && mll > 0 ? Math.max(0, Math.min(1, room / mll)) : null, today,
      todayText: both(today, null, P.risk), dayLabel: rep && now && rep === now ? 'Today' : rep ? `${dayLabel(rep)} (the last report)` : 'Last report', profit: prof, toTarget: need, balance: bal,
      progress: need != null && prof != null && prof + need > 0 ? Math.max(0, Math.min(1, prof / (prof + need))) : 0, waiting: str(blk.wait, 180), funded: true,
      ddLine: room != null ? drawdownLine(room, mll) : 'Drawdown not reported yet',
      progLine: str(e.payout_text, 160) || (need != null ? `Funded: ${money(need)} to a payout` : 'Funded: the payout line is on the ZEUS page') };
  }
  const tb = first(e.target_balance, e.target), target = tb != null && tb > start ? tb - start : P.target;
  const balance = num(e.balance), profit = first(e.profit, balance != null ? balance - start : null), toTarget = first(e.to_target, profit != null ? target - profit : null);
  const progress = profit != null && target > 0 ? Math.max(0, Math.min(1, profit / target)) : 0, today = num(blk.today) || 0;
  // the day's R: the sum of the R of that bot's trades on the report day; with no trade in the list it is an estimate from the usual risk (~)
  const day = rep || null, mine = (trades || []).filter((x) => x.key === key && !x.open && x.day === day && x.r != null);
  const dayR = mine.length ? mine.reduce((s, x) => s + x.r, 0) : null;
  const sameDay = !!(rep && now && rep === now);
  const passed = toTarget != null && toTarget <= 0;
  return { ...base, has: true, mll, target, room, roomFrac: room != null && mll > 0 ? Math.max(0, Math.min(1, room / mll)) : null, today, todayText: both(today, dayR, P.risk),
    dayLabel: sameDay ? 'Today' : rep ? `${dayLabel(rep)} (the last report)` : 'Last report', profit, toTarget, progress, balance, waiting: str(blk.wait, 180),
    ddLine: room != null ? drawdownLine(room, mll) : 'Drawdown not reported yet',
    progLine: toTarget == null ? 'No eval numbers yet' : passed ? `Target of ${money(target)} reached` : `${money(toTarget)} to go to the ${money(target)} target (${Math.round(progress * 100)}% done)` };
}

// ------------------------------------------------------------------------------------------------ the trades
/** the rule that closed a trade, in plain words */
export function ruleText(kind, key, exitT) {
  const k = String(kind || '').toUpperCase(), lit = key === 'lit', et = etParts(exitT);
  if (k === 'STOP') return lit ? 'Stop hit: 1 tick beyond the sweep extreme' : 'Stop hit';
  if (k === 'TARGET') return lit ? 'Target reached: the VIX-band objective, banked at 8R' : 'Target reached';
  if (k === 'BE') return lit ? 'Breakeven stop: moved to entry after +1R' : 'Breakeven stop';
  if (k === 'TIME') return lit ? (et && et.hm >= '15:50' ? 'Flat by 15:55 ET rule' : 'Time rule: the 15-minute cut') : 'Time exit: the end of its window';
  if (k === 'LIT') return 'Closed because LIT entered';
  if (k === 'FLAT' || k === 'EOD') return 'Flat by the end of the day';
  if (k === 'DLL' || k === 'DAILY') return 'Daily loss limit';
  return k ? `Closed: ${str(k, 24).toLowerCase()}` : 'Closed';
}
function tradeRow(x, keyHint) {
  if (!isObj(x)) return null;
  const s = String(x.acct || x.key || keyHint || '').toLowerCase(), key = keyHint || (/blitz/.test(s) ? 'blitz' : /atlas|ema|macd|sr_/.test(s) ? 'atlas' : 'lit');
  const P = BOTS[key], usd = num(x.usd != null ? x.usd : x.pnl), exitT = num(x.exit_t), entryT = num(x.entry_t), t = exitT != null ? exitT : entryT;
  if (usd == null && num(x.r) == null) return null;
  const open = x.open === true, r = num(x.r != null ? x.r : x.R), kind = str(x.exit_kind || (typeof x.exit === 'string' ? x.exit : ''), 24);
  const side = str(x.side || (num(x.dir) != null ? (num(x.dir) > 0 ? 'LONG' : 'SHORT') : ''), 8).toUpperCase(), et = etParts(t);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(x.day || '')) ? x.day : et ? tradingDay(t) : '';   // the board's own day, else the CME day
  const src = P.paper || String(x.src || '') === 'paper' ? 'paper' : 'eval account';
  return { key, name: P.name, member: str(x.member, 12), day, dayLabel: dayLabel(day), t: t || 0, side: side === 'LONG' ? 'Long' : side === 'SHORT' ? 'Short' : '', usd: usd || 0, r, open,
    text: both(usd || 0, r, P.risk), rule: open ? 'Still open' : ruleText(kind, key, exitT), src, sign: (usd || 0) > 0.5 ? 'pos' : (usd || 0) < -0.5 ? 'neg' : '' };
}
/** the last n trades of the three bots, newest first */
export function lastTrades(home, n) {
  const h = obj(home), rows = [], seen = {};
  const push = (x, hint) => { const r = tradeRow(x, hint); if (!r) return; const id = `${r.key}|${r.t}|${Math.round(r.usd)}|${r.src}`; if (!seen[id]) { seen[id] = 1; rows.push(r); } };
  for (const x of Array.isArray(obj(h.board).trades) ? h.board.trades : []) push(x, null);
  const bl = obj(obj(obj(h.live).pc).blitz);
  for (const x of Array.isArray(bl.today) ? bl.today : []) push(x, 'blitz');
  for (const x of Array.isArray(bl.trades) ? bl.trades : []) push(x, 'blitz');
  rows.sort((a, b) => b.t - a.t || (a.key < b.key ? -1 : 1));
  return rows.slice(0, n || 10);
}

// ------------------------------------------------------------------------------------------------ the plan, the facts, the banner
export function planLine(home, st) {
  const lit = obj(obj(obj(home).board).lit), live = st && (st.code === 'running' || st.code === 'stopped');
  const now = live ? str(lit.waiting || obj(lit.window).text, 200) : '';
  return { rule: PLAN_RULE, now, note: live ? (now ? '' : 'The bot has not said more than that yet.') : 'These are the rules. What the bot is doing this minute is not known while the PC is silent.' };
}
function factDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : ''; }
export function facts(home) {
  const per = obj(obj(obj(home).results).periods);
  const row = (id, title, why) => {
    const p = isObj(per[id]) && num(per[id].pf) != null ? per[id] : FACTS_BUILTIN[id];
    return { id, title, why, pf: (Math.round(num(p.pf) * 100) / 100).toFixed(2), net: moneyS(p.net), month: `about ${money(p.per_month)} a month`, trades: num(p.trades), dates: `${factDate(p.from)} to ${factDate(p.to)}`,
      line: `PF ${(Math.round(num(p.pf) * 100) / 100).toFixed(2)}, ${moneyS(p.net)}, about ${money(p.per_month)} a month` };
  };
  return [row('2026 H2 (check)', 'The check: second half of 2026', 'The rules were picked on January to June and checked here. Quote this one.'),
    row('2026 YTD', 'All of 2026', 'Includes the months the rules were picked on, so it flatters.'),
    row('2021-25 (reference)', 'Five years before, 2021 to 2025', 'Reference only: about break-even. LIT is tuned on 2026.')];
}
/** null while the PC reported in the last 20 minutes */
export function banner(st) {
  if (!st || st.code === 'running' || st.code === 'stopped') return null;
  if (st.code === 'none') return { level: 'bad', title: 'No report from your PC yet.', text: SILENT_LINE };
  return { level: st.level, title: `Last report from your PC: ${st.ageText}.`, text: SILENT_LINE };
}

// ------------------------------------------------------------------------------------------------ all of it
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the published file says "hidden_bots" (top or board),
// the Zenith page's window.OLY_HIDDEN when there; a hidden BLITZ is left out
const hiddenOf = (h) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : null;
  return (k) => (L ? L.map(String).includes(k) : !!(globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has(k))); };
export function hasData(home) { const h = obj(home); return isObj(h.board) || isObj(obj(h.live).pc) || (Array.isArray(h.accounts) && h.accounts.length > 0); }
export function build(home, nowMs) {
  const nowS = Math.floor((num(nowMs) || 0) / 1000), h = obj(home), trades = lastTrades(h, 10);
  const hid = hiddenOf(h), bots = ORDER.filter((k) => !(k === 'blitz' && hid('blitz'))).map((k) => botView(k, h, nowS, trades));
  // the extra accounts of the PC's post (the Zlarior 25K #2 ...), after Zlarior and ATLAS, by the names the ZEUS card uses
  for (const c of Array.isArray(obj(h.board).accounts) ? h.board.accounts : []) {
    if (!isObj(c) || !c.id || num(c.balance) == null) continue;
    const P = extraBot(c);
    bots.push(botView(P.key, h, nowS, trades, P, { e: c, today: c.today_pnl, wait: c.waiting }));
  }
  // a cloud copy's board.data_t is the cloud's own bars (its paper twin), never a report from the PC: only live.pc.t counts there
  const rt = num(obj(h.board).report_t), pcT = cloudCopy(h) ? num(obj(obj(h.live).pc).t) : first(rt != null ? Math.max(rt, first(obj(obj(h.live).pc).t, 0) || 0) : null, obj(obj(h.live).pc).t, obj(h.board).data_t);
  const pc = status(pcT, null, nowS, postFresh(h));
  const lit = bots[0], burning = bots.filter((b) => b.status.flame).length, n = bots.length;
  const tight = bots.filter((b) => b.has && b.roomFrac != null).sort((a, b) => a.roomFrac - b.roomFrac)[0] || null;
  const headline = pc.code === 'none' ? (cloudCopy(h) ? "Waiting for your PC's status report: the cloud's copy has no account numbers." : 'No report from your PC yet.') : pc.code !== 'running' ? `Last report from your PC: ${pc.ageText}.`
    : rt != null ? (burning === n ? `All ${n} accounts reported ${pc.ageText} (your PC's status report).` : `${burning} of ${n} accounts reported in the last 30 minutes.`)
      : `${burning} of ${n} bots reported in the last 20 minutes.`;
  return { nowS, pc, bots, trades, plan: planLine(h, lit.status), facts: facts(h), banner: banner(pc), headline, burning, tight,
    columns: bots.map((b) => ({ key: b.key, label: b.name, lit: b.status.flame, level: b.status.level })) };
}

// ------------------------------------------------------------------------------------------------ the how-to sheet (howto.json, built from docs/NQ_BOT_BACK.md)
export function howto(j) {
  const o = obj(j), steps = (Array.isArray(o.steps) ? o.steps : []).filter(isObj).slice(0, 5).map((s, i) => ({ n: i + 1, title: str(s.title, 120), text: str(s.text, 600), code: str(s.code, 200) })).filter((s) => s.title || s.text);
  if (!steps.length) return null;
  return { title: str(o.title, 80) || 'How to bring reporting back', intro: str(o.intro, 400), steps, undo: str(o.undo, 200), limits: (Array.isArray(o.limits) ? o.limits : []).map((x) => str(x, 400)).filter(Boolean).slice(0, 6), updated: str(o.updated, 20) };
}
