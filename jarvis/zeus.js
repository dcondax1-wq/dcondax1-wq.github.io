// ZEUS today (night-voice 2026-11-18, owner: "back to how it was: all of it"). The six questions the owner asks Jarvis every day,
// answered from TODAY's real data: the PC feed (../pc_feed.js lite live.json, laid into data.js liveView as .raw: pc, reporter,
// pc_verdict, board.lit / board.atlas, accounts[] with the new 25K eval), the published Board (../board/board.json) when the PC
// feed is missing, and the plan (../business/accounts.json: names, stages, payout estimates). ZEUS = the trading system (Zlarior
// = LIT, ATLAS and the engine). Read only: nothing here arms, pauses, orders or writes. Account ids never leave this file.
//   "how are my accounts"   one line per account: balance, today, $ to pass (evals) / $ to the payout line (funded), room
//   "did ZEUS trade today"  this session's trades (the CME day starts 18:00 ET), else the last ones and what it waits for
//   "how much to pass"      each eval's $ to its target (and the room under it)
//   "when is my payout"     funded first (the $27,100 / full $1,000 line), then each eval: pass first, then the plan's estimate
//   "is the PC on"          its last check-in (every 5 min), bot running, NinjaTrader, LIVE / Sim; only from the PC feed
//   "pause ZEUS"            where the buttons are (Pause until tomorrow / LE STOP BOT); Jarvis never presses them
// night-zask 2026-11-18 (owner: "what's on what account, what's it trading, average trades/week"):
//   "what's trading"        each account -> its bot (Zlarior = LIT, ATLAS), stage, balance, room, $ to pass / to the payout line
//   "trades per week"       per bot, the last 40 sessions: trades/week, win %, PF, $/month (../edge.json "bots", tools/edge_health.py)
//   "health"                the edge light (the newer of the PC's "eh" and ../edge.json) + "PC reported X min ago"
// iPhone Safari 16: plain ES2020, no optional chaining, no regex lookbehind.
//   import { createZeus, kindOf, alias, scrubIds } from './zeus.js';
//   const z = createZeus({ getPlan: async () => accountsJson | null, getBoard: async () => boardJson | null, getEdge: async () => edgeJson | null, hidden: () => bool });
//   await z.answer(raw, q, live, nowMs) -> { text, speak, intent: 'zeus_*', cards? } | null (not one of the six, or no data for it)

const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);

// the owner's real prop plans (same numbers as business/payoutcoach.js PLANS): the first payout line = start + buffer + the full ask
export const PAYOUT = {
  '25K': { start: 25000, buffer: 1100, ask: 1000, min: 250, split: 0.8 },
  '50K': { start: 50000, buffer: 2100, ask: 2000, min: 500, split: 0.8 },
};
export const TAX = 0.30;
const FRESH_S = 20 * 60, MAYBE_S = 3 * 3600;           // the PC reports every 5 minutes

// ------------------------------------------------------------------------------------------------ words
export function usd(v) { const n = num(v); if (n == null) return '-'; const r = Math.round(n); return (r < 0 ? '−$' : '$') + Math.abs(r).toLocaleString('en-US'); }
export function susd(v) { const n = num(v); if (n == null) return '-'; return (Math.round(n) > 0 ? '+' : '') + usd(n); }
const sayUsd = (v) => { const n = num(v); if (n == null) return 'unknown'; const r = Math.round(n); return (r < 0 ? 'minus ' : '') + Math.abs(r).toLocaleString('en-US') + ' dollars'; };
export function ago(sec) {
  const s = Math.max(0, Math.round(num(sec) || 0));
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 48 * 3600) { const h = Math.round(s / 360) / 10; return (h % 1 ? h.toFixed(1) : String(h)) + ' h ago'; }
  return Math.round(s / 86400) + ' days ago';
}
const sayAgo = (sec) => ago(sec).replace(/\bmin\b/, 'minutes').replace(/(\d) h ago/, '$1 hours ago');
function etParts(ms) {
  try {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { ymd: p.year + '-' + p.month + '-' + p.day, hour: +p.hour % 24, wd: p.weekday };
  } catch (_) { const d = new Date(ms); return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours(), wd: '' }; }
}
/** the CME trading day of a moment: the session that opens at 18:00 ET belongs to the next day */
export function tradingDay(ms) { const e = etParts(ms); return e.hour >= 18 ? etParts(ms + 6 * 3600e3).ymd : e.ymd; }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWords(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); return DOW[d.getUTCDay()] + ' ' + MON[+m[2] - 1] + ' ' + (+m[3]); }

/** account ids and their last digits never reach an answer ("routing to MFFUEVBLDR…6016" -> "routing to your account") */
export function scrubIds(s) {
  return String(s == null ? '' : s)
    .replace(/\b(?:MFFU|APEX|TPT|FTDY|LUC|TOPSTEP|TS|PA|S\d)[A-Z0-9-]*(?:…|\.\.\.)?\d{3,}\b/gi, 'your account')
    .replace(/\b[A-Z]{3,}[A-Z0-9]*(?:…|\.\.\.)\d{2,}\b/g, 'your account')
    .replace(/\b(?:account|acct)\s*(?:#|no\.?|number)?\s*\d{4,}\b/gi, 'your account');
}

// ------------------------------------------------------------------------------------------------ what was asked
const ZEUS_RX = /\bzeus'?s?\b/;
export const RX = {
  pause: /\b(?:pause|stop|halt|kill|freeze|turn off|switch off|shut (?:down|off)|disarm|disable)\b[^?]{0,30}\bzeus\b|\bzeus\b[^?]{0,20}\b(?:pause|stop|off)\b|\bhow (?:do|can) i (?:pause|stop|halt)\b|\bwhere(?:'s| is| are)? (?:the )?(?:pause|stop|kill)(?: bot| trading)? (?:button|switch)s?\b|\b(?:pause|stop) button\b/,
  accounts: /^(?:how are|how're|hows|how's|how is|how are things with|what about|check|status of|update on)? ?(?:all )?(?:my|the|our) accounts?(?: doing| looking| today| now| status| right now)*\??$|^accounts?(?: status| update| today)?$|\bhow (?:are|is) zeus(?: doing)?\b|^zeus(?: status| update| today)?$/,
  traded: /\b(?:did|has|have|was) zeus\b[^?]{0,30}\btrad|\bzeus\b[^?]{0,20}\btrades? today\b|\bdid (?:my|the) accounts? trade\b|\bany trades? (?:today|this session|yet)\b/,
  pass: /\bhow much (?:more )?(?:do i need |is left |left |till |until |to go )?(?:to|till|until|before i|before we) pass\b|\bhow much (?:more )?(?:to go )?(?:to|for) (?:the )?(?:eval|evals|target)\b|^(?:how much )?to pass\??$|\bhow far (?:to|from) (?:passing|the pass)\b/,
  payout: /\bwhen(?:'s| is| do i get| will i get| can i get| can i ask for| can i request| will| does)? (?:is )?(?:my |the |our )?(?:first |next )?(?:payout|pay ?day|paid|money out)\b|\b(?:first|next) payout\b|\bpayout (?:date|day|when|soon)\b|^(?:my )?payouts?\??$|\bwhen (?:do|will) (?:i|we) get paid\b/,
  trading: /\bwhat(?:'s| is| are)? (?:each |my |the )?(?:account|accounts) (?:is |are )?trading\b|\bwhat(?:'s| is| bot is| bots are)? (?:on|running on|trading on) (?:what|which|each|my|the) accounts?\b|\bwhich bots? (?:is |are )?(?:on|trades?|trading|runs?|running)\b|^what(?:'s| is) trading\b|\bwhat bots? (?:are|is) (?:on|running|trading)\b|\bwho(?:'s| is) trading (?:what|which|on)\b|\bwhat(?:'s| is) on (?:what|which|each) account\b|\bwhat(?:'s| is) (?:it|zeus) trading\b|^(?:bots|accounts) (?:and|&) (?:bots|accounts)$/,
  perf: /\b(?:average |avg |how many )?trades? (?:a |per |each |every |\/ ?)?week\b|\btrades? weekly\b|\bweekly trades\b|\bhow(?:'s| is| are) (?:it|they|zlarior|atlas|lit|zlarior and atlas|both bots)(?: been)? (?:doing|performing|going)\b|\b(?:zlarior|atlas|lit|zeus|bot|bots)(?:'s)? (?:stats|statistics|performance|numbers|win ?rate|win %|pf|profit factor|results|track record)\b|\b(?:stats|performance|win ?rate|win %|profit factor|track record) (?:of|for) (?:zlarior|atlas|lit|zeus|the bots?|each bot)\b|\b(?:\$|dollars?) (?:a|per) month\b[^?]{0,20}\b(?:zlarior|atlas|lit|zeus|bots?)\b|\bhow much (?:does|do|will) (?:zlarior|atlas|lit|zeus|the bots?|it|they) make (?:a|per) month\b/,
  health: /^(?:zeus |edge |bot |bots |the |system )?health\??$|\bedge (?:health|light|status)\b|^(?:the )?edge\??$|\b(?:zeus|zlarior|atlas|lit)(?:'s)? (?:health|edge)\b|\bhealth of (?:zeus|the edge|the bots?)\b|\bhow (?:healthy|is the edge|'s the edge)\b|\bhow(?:'s| is) (?:the )?edge\b|\bis (?:the |zeus'?s? )?edge (?:ok|okay|alive|still there|good|green|gone|working)\b|\bis zeus healthy\b/,
  pc: /\b(?:is|are) (?:the |my )?(?:pc|computer|surface|bot pc|trading pc|desktop|laptop)\b[^?]{0,20}\b(?:on|up|running|online|alive|awake|working|ok|okay|connected|reporting)\b|^(?:pc|the pc)(?: status| on| online)?\??$|\bpc (?:on|online|status)\b/,
};
/** which one (the six + trading / perf / health, or null): rules about rules / where pages are stay with the older answers */
export function kindOf(q) {
  const s = String(q || '').toLowerCase();
  if (!s || /\brules?\b/.test(s)) return null;
  for (const k of ['pause', 'pc', 'health', 'perf', 'trading', 'traded', 'pass', 'payout', 'accounts']) if (RX[k].test(s)) return k;
  return null;
}
/** "zeus" in any other question means the bots: "how is zeus", "arm zeus" (refused by the guard), "zeus today" */
export function alias(q) { return String(q == null ? '' : q).replace(/\bzeus'?s?\b/gi, 'the bots'); }
export const mentionsZeus = (q) => ZEUS_RX.test(String(q || '').toLowerCase());

// ------------------------------------------------------------------------------------------------ the accounts, one row each
const sizeOf = (s) => { const m = /\b(25|50|100|150)\s?k\b/i.exec(String(s || '')); return m ? m[1] + 'K' : ''; };
const stageOf = (x) => { const t = (str(x.status, 30) + ' ' + str(x.stage, 30) + ' ' + str(x.kind, 30) + ' ' + str(x.plan, 60)).toLowerCase(); return /funded/.test(t) ? 'funded' : /passed/.test(t) ? 'passed' : 'eval'; };
function planRow(plan, key, size, stage) {
  const L = arr(isObj(plan) ? plan.accounts : null).filter(isObj);
  return L.find((p) => p.key === key) || L.find((p) => p.status === 'live' && sizeOf(p.plan) === size && stageOf(p) === stage && p.key !== 'atlas' && p.key !== 'zlarior') || null;
}
/** the rows: the PC feed's cards (Zlarior, ATLAS) and its other accounts (the new 25K eval), else the published Board's rows */
export function rowsOf(live, plan, board, opt) {
  const o = isObj(opt) ? opt : {}, hidden = !!o.hidden;
  const full = isObj(live) && isObj(live.raw) ? live.raw : isObj(live) ? live : {};
  const b = isObj(full.board) && !full.board.error ? full.board : {};
  const rows = [];
  const card = (id, key, c) => {
    if (!isObj(c) || c.error || num(c.balance) == null) return;
    const size = sizeOf(c.plan) || (id === 'lit' ? '50K' : '25K'), stage = stageOf(c), p = planRow(plan, key, size, stage);
    rows.push({ id, key, name: str(c.name, 30) + ' ' + size, size, stage, balance: num(c.balance), today: num(c.today_pnl), room: num(c.room),
      to_pass: stage === 'eval' ? num(c.to_target) : 0, target: num(c.target_balance), trades_today: num(c.trades_today), max_day: num(c.max_day),
      window: isObj(c.window) ? str(c.window.text, 80) : '', plan: p, src: 'pc', badge: /^(LIVE|SIM)$/i.test(str(c.badge, 8)) ? str(c.badge, 8).toUpperCase() : '' });
  };
  card('lit', 'zlarior', b.lit || (isObj(live) ? live.lit : null));
  card('atlas', 'atlas', b.atlas || (isObj(live) ? live.atlas : null));
  if (!hidden) card('blitz', 'blitz', b.blitz);
  for (const a of arr(full.accounts).filter(isObj)) {
    const e = isObj(a.eval) ? a.eval : isObj(a.funded) ? a.funded : null;
    if (!e || num(e.balance) == null || (hidden && /blitz|scalp|acct_?c/i.test(str(a.id) + str(a.name)))) continue;
    const size = sizeOf(a.plan) || sizeOf(a.name), stage = stageOf(a);
    if (rows.some((r) => r.size === size && r.stage === stage)) continue;            // the same account as a card above
    const p = planRow(plan, '', size, stage);
    rows.push({ id: str(a.id, 30), key: p ? p.key : '', name: p ? str(p.name, 30) : str(a.name, 40).replace(/^MFFU\s+/i, '').replace(/\bBuilder\s+/i, ''), size, stage,
      balance: num(e.balance), today: num(isObj(a.pnl) ? a.pnl.today : e.today), room: num(e.room), to_pass: stage === 'eval' ? num(e.to_target) : 0,
      target: num(e.target_balance), trades_today: arr(a.trades).length ? null : 0, max_day: null, window: '', plan: p, src: 'pc' });
  }
  if (!rows.length && isObj(board)) {                       // no PC feed: the Board's own rows (the owner's typed numbers, the plan)
    for (const r of arr(board.accounts).filter(isObj)) {
      if (num(r.balance) == null || (hidden && r.key === 'blitz')) continue;
      const size = sizeOf(r.plan), stage = stageOf(r), p = planRow(plan, str(r.key, 30), size, stage);
      rows.push({ id: str(r.key, 30), key: str(r.key, 30), name: str(r.name, 30) + (size && !/\d+K\b/.test(str(r.name)) ? ' ' + size : ''), size, stage,
        balance: num(r.balance), today: null, room: num(r.room), to_pass: stage === 'eval' ? num(r.to_pass) : 0, target: num(r.target_balance),
        trades_today: null, max_day: null, window: '', plan: p, src: str(r.src, 40) || 'the Board' });
    }
  }
  return rows;
}
/** when the numbers are from: { t, age, src, pc } (pc: what the PC itself said, only from the PC feed) */
export function freshness(live, board, nowMs) {
  const full = isObj(live) && isObj(live.raw) ? live.raw : isObj(live) ? live : {};
  const rep = isObj(full.reporter) ? full.reporter : null, pc = isObj(full.pc) ? full.pc : null;
  const t = Math.max(num(rep && rep.t) || 0, num(pc && pc.t) || 0, num(full.t) || 0, num(isObj(full.board) ? full.board.data_t : null) || 0);
  const fromFeed = !!(rep || full.src === 'pc_feed' || full.src === 'pc_report');
  if (t) return { t, age: Math.max(0, nowMs / 1000 - t), src: fromFeed ? 'PC' : 'live feed', feed: fromFeed, rep, pc, verdict: isObj(full.pc_verdict) ? full.pc_verdict : null };
  const bt = num(isObj(board) ? board.t : null);
  return { t: bt, age: bt ? Math.max(0, nowMs / 1000 - bt) : null, src: 'the Board', feed: false, rep: null, pc: null, verdict: null };
}
const ageNote = (F) => (F.age == null ? '' : F.age <= FRESH_S ? F.src + ', ' + ago(F.age) : F.src + ' last report ' + ago(F.age) + ': may be old');

// ------------------------------------------------------------------------------------------------ the answers
function rowLine(r) {
  const parts = [r.stage === 'funded' ? funBal(r) : usd(r.balance)];
  if (r.today != null) parts.push('today ' + susd(r.today));
  if (r.stage === 'eval') { if (r.to_pass != null) parts.push(usd(r.to_pass) + ' to pass'); }
  else if (r.stage === 'funded') { const pl = payLine(r); if (pl) parts.push(pl.toGo > 0 ? usd(pl.toGo) + ' to the first ' + usd(pl.ask) + ' payout' : 'payout line reached'); }
  else if (r.stage === 'passed') parts.push('passed: waiting for the funded account');
  if (r.room != null) parts.push(usd(r.room) + ' room');
  return r.name + ' ' + (r.stage === 'eval' ? 'eval' : r.stage) + ': ' + parts.join(', ') + '.';
}
// a funded sim the way MFFU shows it (owner 2026-11-20, QA 2026-11-21): the balance starts at $0 and IS the profit (ATLAS "+$401", not
// $25,401); the full ask comes at buffer + ask (+$2,100 on a 25K), the earliest at buffer + the smallest payout (+$1,350). PC_FEED.mffuView
// (pc_feed.js, the one rule for every app) when the page has it, else the balance minus the plan's start (a balance already in MFFU terms is kept)
function mffuProfit(r) {
  const P = PAYOUT[r.size]; if (!P || r.balance == null) return null;
  try { const F = globalThis.PC_FEED; if (F && typeof F.mffuView === 'function') { const v = F.mffuView({ kind: 'funded', stage: 'funded', plan: r.size, name: r.name, balance: r.balance }); if (isObj(v) && num(v.profit) != null) return num(v.profit); } } catch (_) { /* the plan's rule below */ }
  return r.balance > P.start / 2 ? Math.round((r.balance - P.start) * 100) / 100 : r.balance;
}
function payLine(r) {
  const P = PAYOUT[r.size], profit = mffuProfit(r); if (!P || profit == null) return null;
  const line = P.buffer + P.ask, early = P.buffer + P.min;
  return { profit, line, toGo: Math.max(0, Math.round(line - profit)), early, min: P.min, toEarly: Math.max(0, Math.round(early - profit)), ask: P.ask, you: P.ask * P.split, net: P.ask * P.split * (1 - TAX) };
}
const funBal = (r) => { const pl = payLine(r); return pl ? susd(pl.profit) : usd(r.balance); };   // a funded account's balance in MFFU terms
function waitingLine(live) {
  const full = isObj(live) && isObj(live.raw) ? live.raw : isObj(live) ? live : {};
  const ms = str(full.model_state || (isObj(full.pc) ? full.pc.model_state : ''), 120);
  const lit = isObj(full.board) && isObj(full.board.lit) ? full.board.lit : null;
  const w = lit && isObj(lit.window) ? str(lit.window.text, 80) : '';
  if (ms) return 'ZEUS: ' + ms.replace(/^LIT:\s*/i, 'Zlarior ') + (w && !/\d{1,2}:\d{2}/.test(ms) ? ' (' + w + ')' : '') + '.';
  return w ? 'ZEUS: ' + w + '.' : '';
}

function accountsReply(rows, F, live) {
  if (!rows.length) return { text: 'I have no account numbers right now: the PC has not reported and the Board is not loaded. Open Business → My Accounts.', speak: 'I have no account numbers right now. Open My Accounts.', intent: 'zeus_accounts', open: null };
  const lines = ['Your accounts (' + ageNote(F) + '):'].concat(rows.map(rowLine));
  const wl = F.feed ? waitingLine(live) : ''; if (wl) lines.push(wl);
  const say = rows.map((r) => r.name.replace(/#(\d)/, 'number $1') + ' ' + (r.stage === 'eval' ? 'eval is at ' + sayUsd(r.balance) + (r.to_pass != null ? ', ' + sayUsd(r.to_pass) + ' to pass' : '')
    : r.stage === 'funded' ? 'funded is at ' + sayUsd(r.balance) : 'passed') + '.').join(' ');
  return { text: lines.join('\n'), speak: say + (F.age != null && F.age > FRESH_S ? ' These are from ' + sayAgo(F.age) + '.' : ''), intent: 'zeus_accounts', cards: [{ title: 'Accounts', lines: rows.map(rowLine) }] };
}
function passReply(rows, F) {
  const ev = rows.filter((r) => r.stage === 'eval' && r.to_pass != null);
  const done = rows.filter((r) => r.stage !== 'eval');
  if (!ev.length) return { text: 'No eval is waiting to pass right now' + (done.length ? ': ' + done.map((r) => r.name + ' is ' + r.stage).join(', ') : '') + '.', speak: 'No eval is waiting to pass right now.', intent: 'zeus_pass' };
  const lines = ev.map((r) => r.name + ': ' + usd(r.to_pass) + ' to pass' + (r.target != null ? ' (target ' + usd(r.target) + ')' : '') + (r.room != null ? ', ' + usd(r.room) + ' of room left' : '') + '.');
  for (const r of done) lines.push(r.name + ': ' + (r.stage === 'funded' ? 'already passed, funded now.' : 'passed.'));
  return { text: lines.join('\n') + '\n(' + ageNote(F) + ')', speak: ev.map((r) => r.name.replace(/#(\d)/, 'number $1') + ' needs ' + sayUsd(r.to_pass)).join('. ') + '.', intent: 'zeus_pass' };
}
function payoutReply(rows, plan, F) {
  const P = arr(isObj(plan) ? plan.accounts : null).filter(isObj);
  const lines = [], say = [];
  for (const r of rows.filter((x) => x.stage === 'funded')) {
    const pl = payLine(r); if (!pl) continue;
    const est = r.plan && str(r.plan.payout, 80).replace(/\s*\(estimate\)$/i, '');
    lines.push(r.name + ' (funded): at ' + susd(pl.profit) + ' (MFFU counts from $0); ' + (pl.toGo > 0 ? 'the ' + usd(pl.ask) + ' ask comes at +' + usd(pl.line) + ' (' + usd(pl.toGo) + ' to go)' : 'past +' + usd(pl.line) + ': you can ask the full ' + usd(pl.ask) + ' now')
      + ', ' + usd(pl.you) + ' to you, ' + usd(pl.net) + ' after the 30% tax pot.' + (pl.toGo > 0 ? ' Earliest: ' + usd(pl.min) + ' at +' + usd(pl.early) + (pl.toEarly > 0 ? ' (' + usd(pl.toEarly) + ' to go)' : ' (reached)') + ', but the goal is the full ' + usd(pl.ask) + ' (only 5 sim payouts).' : '')
      + ' MFFU also needs 2 traded days.' + (est ? ' Estimate: ' + est + '.' : ''));
    say.push(r.name + ' is at ' + (pl.profit < 0 ? 'minus ' : 'plus ') + sayUsd(Math.abs(pl.profit)) + '; the ' + sayUsd(pl.ask) + ' ask comes at plus ' + sayUsd(pl.line) + (pl.toGo > 0 ? ', ' + sayUsd(pl.toGo) + ' to go' : ': you can ask now') + (est ? ', ' + est.replace(/[~()]/g, '') : '') + '.');
  }
  for (const r of rows.filter((x) => x.stage === 'eval')) {
    const est = r.plan && str(r.plan.payout, 80);
    lines.push(r.name + ' (eval): pass first' + (r.to_pass != null ? ' (' + usd(r.to_pass) + ' to go)' : '') + (est ? '; ' + est : '') + '.');
    say.push(r.name.replace(/#(\d)/, 'number $1') + ' must pass first' + (est ? '; ' + est.replace(/[~()]/g, '') : '') + '.');
  }
  for (const r of rows.filter((x) => x.stage === 'passed')) lines.push(r.name + ': passed; the payout clock starts once MFFU gives the funded account.');
  if (!lines.length) {
    const est = P.filter((p) => p.status === 'live' && p.payout).map((p) => str(p.name, 30) + ': ' + str(p.payout, 80) + '.');
    if (!est.length) return null;
    return { text: 'From the plan (no live numbers right now):\n' + est.join('\n'), speak: est[0], intent: 'zeus_payout' };
  }
  return { text: lines.join('\n') + '\nPayout coach: Business → My Accounts.', speak: say.slice(0, 2).join(' '), intent: 'zeus_payout' };
}
function tradeName(acct, rows) {
  const a = str(acct, 30).toLowerCase();
  if (a === 'lit' || a === 'zlarior') return 'Zlarior';
  if (a === 'atlas') return 'ATLAS';
  if (a === 'blitz') return 'BLITZ';
  const r = rows.find((x) => x.id === acct || x.key === acct); return r ? r.name : 'ZEUS';
}
const tradeText = (x) => (str(x.side, 6).toLowerCase() || 'a trade') + (num(x.qty) ? ' ' + num(x.qty) + ' micro' + (num(x.qty) === 1 ? '' : 's') : '')
  + (x.open ? ', still open' : (x.exit ? ', ' + ({ STOP: 'stop', TARGET: 'target', TIME: 'time exit', EOD: 'end of day' }[str(x.exit, 10).toUpperCase()] || str(x.exit, 12).toLowerCase()) : '') + (num(x.usd) != null ? ', ' + susd(x.usd) : ''));
function tradedReply(rows, live, F, nowMs, hidden) {
  const full = isObj(live) && isObj(live.raw) ? live.raw : isObj(live) ? live : {};
  const b = isObj(full.board) ? full.board : {};
  const day = str(b.today, 10) || tradingDay(nowMs);
  const all = [];
  for (const x of arr(b.trades).concat(arr(isObj(live) ? live.trades : null)).filter(isObj)) all.push(x);
  for (const a of arr(full.accounts).filter(isObj)) for (const x of arr(a.trades).filter(isObj)) all.push({ acct: a.id, ...x });
  const seen = new Set(), T = [];
  for (const x of all) {
    if (hidden && /blitz/i.test(str(x.acct))) continue;
    const t = num(x.entry_t) || num(x.t) || 0, k = str(x.acct) + '|' + t + '|' + str(x.side);
    if (seen.has(k)) continue; seen.add(k);
    T.push({ ...x, _t: t, _day: str(x.day, 10) || (t ? tradingDay(t * 1000) : '') });
  }
  T.sort((p, q) => q._t - p._t);
  const today = T.filter((x) => x._day === day), counted = rows.reduce((s, r) => s + (num(r.trades_today) || 0), 0);
  const note = F.age != null && F.age > FRESH_S ? ' (' + ageNote(F) + ')' : '';
  if (today.length || counted > 0) {
    const sum = today.reduce((s, x) => s + (num(x.usd) || 0), 0), n = Math.max(today.length, counted);
    const lines = ['Yes: ZEUS took ' + n + ' trade' + (n === 1 ? '' : 's') + ' this session (' + dayWords(day) + ')' + (today.length ? ', ' + susd(sum) : '') + note + '.'];
    for (const x of today.slice(0, 4)) lines.push(tradeName(x.acct, rows) + ': ' + tradeText(x) + '.');
    return { text: lines.join('\n'), speak: 'Yes. ' + n + ' trade' + (n === 1 ? '' : 's') + ' this session' + (today.length ? ', ' + sayUsd(sum) : '') + '.', intent: 'zeus_traded' };
  }
  const lines = ['No: ZEUS has not traded yet this session (' + dayWords(day) + ')' + note + '.'];
  const wl = F.feed ? waitingLine(live) : ''; if (wl) lines.push(wl);
  const last = T.filter((x) => x._day && x._day < day);
  if (last.length) { const d0 = last[0]._day, L = last.filter((x) => x._day === d0); lines.push('Last trades, ' + dayWords(d0) + ': ' + L.slice(0, 3).map((x) => tradeName(x.acct, rows) + ' ' + tradeText(x)).join('; ') + '.'); }
  const sw = wl.replace(/^ZEUS:\s*/, '').replace(/\s*\(.*?\)/g, '').replace(/\bET\b/g, '').replace(/\s+([.,])/g, '$1').trim();
  return { text: lines.join('\n'), speak: 'No trade yet this session.' + (sw ? ' ' + sw : ''), intent: 'zeus_traded' };
}
function pcReply(F) {
  if (!F.feed) return null;                                            // no PC feed: the older rules answer (live.json / GitHub)
  const rep = F.rep || {}, pc = F.pc || {}, age = F.age;
  const probs = arr(rep.problems).map((p) => scrubIds(isObj(p) ? p.text || p.label : p)).filter(Boolean);
  const mode = str(rep.mode, 12).toUpperCase();
  if (age == null) return null;
  if (age > MAYBE_S) return { text: 'No: the PC has been silent for ' + ago(age).replace(/ ago$/, '') + ' (it reports every 5 min). Check it is on, awake and online; if it is, double-click tools/bat/PC_DOCTOR.bat.', speak: 'Probably not. The PC has been silent for ' + sayAgo(age).replace(/ ago$/, '') + '. Check it is on and online.', intent: 'zeus_pc' };
  if (age > FRESH_S) return { text: 'Not sure: its last check-in was ' + ago(age) + ' (it reports every 5 min), so it may be asleep or offline. Check the PC.', speak: 'Not sure. Its last check-in was ' + sayAgo(age) + '.', intent: 'zeus_pc' };
  if (rep.server === false) return { text: 'The PC is on (checked in ' + ago(age) + ') but the bot server is not answering: on the PC, open LE START.', speak: 'The PC is on, but the bot server is not answering. Open LE START on the PC.', intent: 'zeus_pc' };
  const bits = [pc.running === false ? 'the bot is STOPPED' : 'ZEUS is running' + (mode ? ' (' + mode + ')' : ''),
    rep.nt === false ? 'NinjaTrader is NOT connected' : rep.nt === true ? 'NinjaTrader connected' : '',
    pc.position === true ? 'a trade is open' : pc.position === false ? 'no open trade' : ''].filter(Boolean);
  const text = 'Yes: the PC checked in ' + ago(age) + '. ' + bits.join(', ') + '.' + (probs.length ? '\nFix: ' + probs[0] + '.' : '');
  return { text, speak: 'Yes. The PC checked in ' + sayAgo(age) + '. ' + (pc.running === false ? 'But the bot is stopped.' : rep.nt === false ? 'But NinjaTrader is not connected.' : 'ZEUS is running.'), intent: 'zeus_pc' };
}
export const PAUSE_TEXT = "I can't pause ZEUS: I only read, I never press its buttons. Here is where they are:\n"
  + '1. Pause new entries: on the PC open LE START → Bot page → "Pause until tomorrow" (no new entries today; an open trade keeps its stop and target). "Resume entries" is next to it.\n'
  + '2. Stop it fully: double-click LE STOP BOT on the PC desktop (it asks first).\n'
  + "The phone's Remote page sends the same Pause through GitHub, which has been down for the bot since Nov 8, so use the PC.";
function pauseReply() {
  return { text: PAUSE_TEXT, speak: "I can't pause ZEUS myself. On the PC, open LE START, then the Bot page, and press Pause until tomorrow. To stop it fully, use LE STOP BOT on the desktop.", intent: 'zeus_pause', refused: true };
}

// ------------------------------------------------------------------------------------------------ what each account trades (night-zask)
const BOT = { lit: 'Zlarior (LIT)', atlas: 'ATLAS', blitz: 'BLITZ' };
/** the bot on a row: the PC card it came from, else the plan's "bots" line, else the account's own name; '' = not known */
export function botOf(r) {
  if (BOT[r.id]) return BOT[r.id] + (r.badge ? ', ' + r.badge : '');
  const pb = r.plan ? scrubIds(str(r.plan.bots, 80)) : '';
  if (pb) return pb.replace(/^Zlarior(?! \(LIT\))/, 'Zlarior (LIT)');
  const n = str(r.name, 60).toLowerCase();
  return /zlarior|\blit\b/.test(n) ? 'Zlarior (LIT)' : /atlas/.test(n) ? 'ATLAS' : '';
}
function tradingReply(rows, F) {
  if (!rows.length) return { text: 'I have no account numbers right now: the PC has not reported and the Board is not loaded, so I cannot say which bot is on which account. Open Business → My Accounts.', speak: 'I have no account numbers right now.', intent: 'zeus_trading' };
  const lines = ['What each account trades (' + ageNote(F) + '):'], say = [];
  for (const r of rows) {
    const bot = botOf(r), parts = [r.stage === 'funded' ? funBal(r) : usd(r.balance)];
    if (r.stage === 'eval') { if (r.to_pass != null) parts.push(usd(r.to_pass) + ' to pass'); }
    else if (r.stage === 'funded') { const pl = payLine(r); if (pl) parts.push(pl.toGo > 0 ? usd(pl.toGo) + ' to the first ' + usd(pl.ask) + ' payout' : 'payout line reached'); }
    if (r.room != null) parts.push(usd(r.room) + ' room');
    lines.push(r.name + ' ' + r.stage + ' → ' + (bot || 'bot not reported') + ': ' + parts.join(', ') + '.');
    say.push(r.name.replace(/#(\d)/, 'number $1') + ' ' + r.stage + ' runs ' + (/zlarior/i.test(bot) ? 'Zlarior' : /atlas/i.test(bot) ? 'ATLAS' : bot ? bot.split(/[,(]/)[0].trim() : 'an unknown bot') + ', at ' + (r.stage === 'funded' && payLine(r) ? (payLine(r).profit < 0 ? 'minus ' : 'plus ') + sayUsd(Math.abs(payLine(r).profit)) : sayUsd(r.balance)) + '.');
  }
  return { text: lines.join('\n'), speak: say.join(' '), intent: 'zeus_trading', cards: [{ title: 'Accounts and bots', lines: lines.slice(1) }] };
}

// ------------------------------------------------------------------------------------------------ the edge: per-bot numbers + the light
const LIGHT = { G: 'GREEN', A: 'AMBER', R: 'RED' };
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const validEh = (eh) => (isObj(eh) && isDay(eh.d) && Array.isArray(eh.z) && eh.z.length >= 3 && LIGHT[eh.z[0]] ? eh : null);
/** the newer of the PC's "eh" (lite status) and ../edge.json's: the later data day wins, then the later build (same as edge_chip.js pick) */
export function pickEdge(site, live) {
  const full = isObj(live) && isObj(live.raw) ? live.raw : isObj(live) ? live : {};
  const s = validEh(isObj(site) ? site.eh : null), l = validEh(full.eh);
  if (!s || !l) return l ? { eh: l, src: 'PC' } : s ? { eh: s, src: 'site' } : null;
  if (l.d !== s.d) return l.d > s.d ? { eh: l, src: 'PC' } : { eh: s, src: 'site' };
  return (+l.t || 0) >= (+s.t || 0) ? { eh: l, src: 'PC' } : { eh: s, src: 'site' };
}
const pf1 = (v) => { const n = num(v); return n == null ? '?' : n >= 20 ? '20+' : (Math.round(n * 10) / 10).toFixed(1); };
const n1 = (v) => { const n = num(v); return n == null ? '?' : String(Math.round(n * 10) / 10); };
const md = (d) => (isDay(d) ? MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : '?');
const daysOld = (d, nowMs) => (isDay(d) ? Math.max(0, Math.floor((nowMs - Date.parse(d + 'T21:00:00Z')) / 86400000)) : null);
const oldNote = (d, nowMs) => { const k = daysOld(d, nowMs); return k != null && k > 7 ? ' (' + k + ' days old)' : ''; };
function perfReply(edge, nowMs, hidden) {
  const B = isObj(edge) && isObj(edge.bots) ? edge.bots : null;
  const bots = B ? ['lit', 'atlas'].concat(hidden ? [] : ['blitz']).map((k) => (isObj(B[k]) ? { k, ...B[k] } : null)).filter(Boolean) : [];
  if (!bots.length) {
    const why = !isObj(edge) ? 'the edge file (edge.json) did not load' : 'edge.json has no per-bot numbers yet (on a computer: python tools/edge_health.py)';
    return { text: 'I have no trades-per-week numbers right now: ' + why + '. I will not guess.', speak: 'I have no trades per week numbers right now, so I will not guess.', intent: 'zeus_perf', missing: true };
  }
  const lines = ['Last 40 sessions per bot (about 8 weeks):'], say = [];
  for (const b of bots) {
    const nm = b.k === 'lit' ? 'Zlarior (LIT)' : str(b.name, 20) || b.k.toUpperCase();
    const bits = [n1(b.tpw) + ' trades/week', num(b.win) != null ? Math.round(num(b.win)) + '% win' : 'win % missing', 'PF ' + pf1(b.pf),
      num(b.usd_month) != null ? 'about ' + usd(b.usd_month) + '/month' + (b.k === 'atlas' ? ' (eval size)' : '') : '$/month missing'];
    lines.push(nm + ': ' + bits.join(', ') + (b.light ? '. Edge ' + str(b.light, 8) : '') + '. Data to ' + md(b.to) + oldNote(b.to, nowMs) + '.');
    say.push(nm.replace(/\s*\(LIT\)/, '') + ' takes about ' + n1(b.tpw) + ' trades a week, wins ' + (num(b.win) != null ? Math.round(num(b.win)) + ' percent' : 'an unknown share') + (num(b.usd_month) != null ? ', about ' + sayUsd(b.usd_month) + ' a month' : '') + '.');
  }
  const ages = bots.map((b) => daysOld(b.to, nowMs)).filter((k) => k != null), oldest = ages.length ? Math.max.apply(null, ages) : 0;
  if (oldest > 7) say.push('These numbers are up to ' + oldest + ' days old.');
  lines.push('These are each bot\'s own rules on real futures bars (Zlarior re-run on the newest bars, ATLAS from its stored run at eval size), not your accounts\' fills. Past weeks do not promise the next ones.');
  return { text: lines.join('\n'), speak: say.join(' '), intent: 'zeus_perf', cards: [{ title: 'Last 40 sessions', lines: lines.slice(1, -1) }] };
}
const LIGHT_MEANS = { GREEN: 'looks like 2026, when it made money', AMBER: 'weaker than 2026 but still positive; nothing changes by itself', RED: 'looks like 2021-25 (about $0); nothing changes by itself, do not buy a new eval' };
function healthReply(edge, live, F, nowMs) {
  const p = pickEdge(edge, live), lines = [], say = [];
  if (p) {
    const z = p.eh.z, a = Array.isArray(p.eh.a) && LIGHT[p.eh.a[0]] ? p.eh.a : null;
    lines.push('Zlarior edge: ' + LIGHT[z[0]] + ' (' + LIGHT_MEANS[LIGHT[z[0]]] + '). Last 40 sessions PF ' + pf1(z[1]) + ' vs 2026 ' + pf1(z[2]) + ', data to ' + md(p.eh.d) + oldNote(p.eh.d, nowMs) + '.');
    say.push('Zlarior edge is ' + LIGHT[z[0]].toLowerCase() + '.');
    if (a) { lines.push('ATLAS edge: ' + LIGHT[a[0]] + ' (' + LIGHT_MEANS[LIGHT[a[0]]] + '). PF ' + pf1(a[1]) + ' vs 2026 ' + pf1(a[2]) + ' at a fixed size, data to ' + md(a[3]) + oldNote(a[3], nowMs) + '.'); say.push('ATLAS is ' + LIGHT[a[0]].toLowerCase() + '.'); }
    const old = [p.eh.d].concat(a ? [a[3]] : []).some((d) => (daysOld(d, nowMs) || 0) > 7);
    if (old) lines.push('The edge data is old: start the PC bot (it sends fresh bars) or export new TradingView NQ1! bars.');
  } else {
    lines.push('Edge light: missing (edge.json did not load and the PC sent none).'); say.push('The edge light is missing.');
  }
  if (F.feed && F.age != null) {
    const rep = F.rep || {}, pc = F.pc || {}, mode = str(rep.mode, 12).toUpperCase();
    const st = F.age > MAYBE_S ? 'silent, check it is on and online' : F.age > FRESH_S ? 'may be asleep or offline' : [pc.running === false ? 'the bot is STOPPED' : 'ZEUS running' + (mode ? ' (' + mode + ')' : ''), rep.nt === false ? 'NinjaTrader NOT connected' : rep.nt === true ? 'NinjaTrader connected' : ''].filter(Boolean).join(', ');
    lines.push('PC reported ' + ago(F.age) + ': ' + st + '.');
    say.push('The PC reported ' + sayAgo(F.age) + '.');
  } else {
    lines.push('PC: no report loaded (the PC feed is missing' + (F.age != null ? '; the Board is from ' + ago(F.age) : '') + '), so I cannot say if it is on.');
    say.push('I have no PC report.');
  }
  return { text: 'ZEUS health:\n' + lines.join('\n'), speak: say.join(' '), intent: 'zeus_health' };
}

// ------------------------------------------------------------------------------------------------ the skill
export function createZeus(opts) {
  const o = isObj(opts) ? opts : {};
  const cached = (fn) => { let v = null, at = 0, p = null; return async () => {
    if (typeof fn !== 'function') return null;
    if (v && Date.now() - at < 60000) return v;
    if (!p) p = Promise.race([Promise.resolve().then(fn), new Promise((ok) => setTimeout(() => ok(null), 2500))]).then((j) => { p = null; if (isObj(j)) { v = j; at = Date.now(); } return v; }, () => { p = null; return v; });
    return p;
  }; };
  const getPlan = cached(o.getPlan), getBoard = cached(o.getBoard), getEdge = cached(o.getEdge);
  const hidden = () => { try { return typeof o.hidden === 'function' ? !!o.hidden() : !!(globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has('blitz')); } catch (_) { return true; } };
  async function answer(raw, q, live, nowMs) {
    const k = kindOf(q || raw);
    if (!k) return null;
    const now = num(nowMs) || Date.now();
    if (k === 'pause') return pauseReply();
    if (k === 'perf') return perfReply(await getEdge(), now, hidden());
    const [plan, board] = await Promise.all([getPlan(), getBoard()]);
    const F = freshness(live, board, now);
    if (k === 'pc') return pcReply(F);
    if (k === 'health') return healthReply(await getEdge(), live, F, now);
    const rows = rowsOf(live, plan, board, { hidden: hidden() });
    if (k === 'accounts') return accountsReply(rows, F, live);
    if (k === 'trading') return tradingReply(rows, F);
    if (k === 'pass') return rows.length ? passReply(rows, F) : null;
    if (k === 'payout') return payoutReply(rows, plan, F);
    if (k === 'traded') return F.feed || rows.length ? tradedReply(rows, live, F, now, hidden()) : null;
    return null;
  }
  return { answer, kindOf, alias };
}
export default createZeus;
