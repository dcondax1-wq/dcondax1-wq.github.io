// Jarvis money copilot (J1, 2026-11-13, owner: "find every edge in Jarvis ... make me money"). Offline and rule-based: no model, no
// paid service, no network. It answers the money questions from the published JSON the skills already load (home.json with the live
// board, odeon/trades.json, pythia/events.json, kalshi.json / kalshicity/edges.json, fates/jarvis.json), with the account numbers read
// through olympus/truth.js (the ONE place for drawdown left / balance / data age). Every answer names its sources and how old they are.
// Paper only: it reads, it never places, arms, sizes or changes anything. A missing number is said to be missing, never filled in.
//
//   import { createCopilot, match, verdict, lossBudget, pnlReport, passClose, changed, kalshiDay, cardFor, morningCard, dayCard } from './copilot.js';
//   const cp = createCopilot({ storage?, now? });
//   cp.match(text)            -> 'trade_today' | 'loss_budget' | 'pnl_report' | 'pass_close' | 'changed' | 'kalshi_day' | 'my_day' | null
//   my_day (team X2 2026-11-14): your work shift over the bot's windows + hours worked vs $ made trading, from S.day (../day/day.json, the PC's own
//   link only; olympus/day.js). The 01:45 / 10:45 plan cards and the 16:05 summary carry a Work line when the file is there.
//   cp.answer(id, S, now?)    -> reply { text, speak, intent: 'copilot_<id>', sources: ['home.json, 6 min ago', ...], app? (opened only on "open it", never by itself), verdict?, missing? }
//   cp.ask(text, S, now?)     -> reply | null           (match + answer; also keeps today's snapshot for "what changed")
//   cp.remember(S, now?)      keeps this ET day's snapshot on this phone ('jarvis.copilot.v1': the last 5 days) for "what changed"
//   cp.card(S, now?)          -> the home card due now: { slot: '01:45' | '10:45' | '16:05', title, kicker, verdict?, tone, rows: [{ text, tone, say }], foot, asof }
//   S = the skills' sources: { home, odeon, pythia, kalshi, kalshiEdges, fatesCard, at: { home: ms, ... } } (any may be missing)
// Plain ES2020, no regex lookbehind, no DOM (tests/test_jarvis_copilot.py runs it in node).

import { isObj, num, str, usd, etParts, srcTag, agoText, DOW } from './jdata.js';
import { accountsOf, agesOf, extraOf } from '../olympus/truth.js';
import * as Day from '../olympus/day.js';

export const STORE_KEY = 'jarvis.copilot.v1';
export const SLOTS = [{ id: '01:45', mod: 105 }, { id: '10:45', mod: 645 }, { id: '16:05', mod: 965 }];
const WIN_OPEN = 120, WIN_LAST = 930;                       // LIT entries 02:00-15:30 ET (CLAUDE.md), flat 15:55
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (isObj(x) ? x : {});
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + 's'}`;
const pct = (x) => (num(x) == null ? '' : (Math.round(num(x) * 10) / 10).toString().replace(/\.0$/, '') + '%');
const hm = (mod) => `${String(Math.floor(mod / 60)).padStart(2, '0')}:${String(mod % 60).padStart(2, '0')}`;
const RANK = { GO: 0, CAREFUL: 1, 'SIT OUT': 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
const nowOf = (n) => { const v = n instanceof Date ? n.getTime() : Number(n); return Number.isFinite(v) && v > 0 ? v : Date.now(); };
const N_RX = '(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)';
const sayMoney = (t) => String(t).replace(/•\s*/g, '').replace(new RegExp('[−-]\\$' + N_RX, 'g'), 'minus $1 dollars').replace(new RegExp('\\+\\$' + N_RX, 'g'), 'plus $1 dollars').replace(new RegExp('\\$' + N_RX, 'g'), '$1 dollars').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------------ what a phrase asks
const RX = {
  trade_today: [/\b(?:should|shall) (?:i|we|the bots?|zlarior|atlas) (?:even )?(?:trade|be trading|let (?:it|them|the bots?) trade|take trades?)\b(?!.*\b(?:now|right now|at the moment)\b)/, /\b(?:can|could|may|do) (?:i|we) (?:trade|be trading|take a trade) today\b/,
    /\b(?:go|no go|go no go|go or no go|go or wait|sit out|stand down)\b.*\b(?:today|this morning|tonight|tomorrow)\b/, /\bis (?:today|it|this) a (?:good |bad |safe )?(?:day|good day|bad day) (?:to|for) trad/,
    /^(?:trade today|trading today|today go or no go|go no go|should i sit out(?: today)?|do i sit out(?: today)?)$/, /\bshould i sit (?:today )?out\b/],
  loss_budget: [/\bhow much (?:more |money )?(?:can|could|may) (?:i|we|zlarior|atlas|blitz) (?:still |afford to )?lose\b/, /\bloss budget\b|\brisk budget\b|\bhow much (?:room|risk) (?:do i have |is there )?(?:today|this week)\b/,
    /\bhow much (?:can|could) (?:i|we) (?:go down|drop|lose) before\b/, /\bbefore (?:the|my|i) (?:eval )?(?:fails?|blow|bust)\b/],
  pass_close: [/\bhow (?:close|near|far) (?:am i|are we|is (?:zlarior|atlas|blitz|the eval)) (?:to|from) (?:passing|pass|being funded|funded|the payout)\b/, /\bwhen (?:will|do|could|can) (?:i|we|zlarior|atlas) pass\b/,
    /\b(?:odds|chances?|probability|likely|likelihood) (?:of |to |that (?:i|we) )?pass/, /\bhow many (?:more )?(?:trades|wins|winners|winning trades|days|sessions) (?:do i need (?:to )?|to |until (?:i )?|before (?:i )?)(?:pass|the target|funded|get funded)/, /\b(?:will|am) i (?:going to )?pass(?:ing)?\b/],
  pnl_report: [/\b(?:best|biggest|largest) (?:and worst )?(?:trade|win|winner)\b|\b(?:worst|biggest|largest) (?:trade|loss|loser)\b/, /\bper month\b|\ba month\b.*\b(?:make|making|earn|earning|pace)\b|\b(?:monthly|month) (?:pace|income|rate)\b|\b(?:make|making|earn|earning) (?:a|per|each) month\b/,
    /^(?:what(?: is|'s|s)? )?my (?:p and l|pnl|profit and loss|money report|p and l report)$/, /\b(?:p and l|pnl|profit and loss) (?:report|overall|so far|this week|this month|since (?:the )?start|total|all in)\b|\b(?:overall|total|all in) (?:p and l|pnl|profit)\b/,
    /\bhow am i doing (?:overall|so far|this week|this month|on the eval)\b|\bmoney report\b|\bmy numbers\b/],
  changed: [/\bwhat(?: has| have| is|'s|s)? (?:changed|moved|different|new|happened)\b.*\b(?:since|overnight|yesterday|last night|today|this morning)\b/, /\bsince yesterday\b|\bovernight\b.*\b(?:happen|change|new|move)/,
    /^(?:what(?: has|'s|s)? changed|what(?:'s|s| is) new|anything new|any changes|what did i miss overnight)$/],
  kalshi_day: [/\bkalshi\b.*\b(?:exposure|at risk|risk today|bets? today|today'?s bets|day report|copilot|bets and|open risk)\b/, /\b(?:exposure|at risk|open risk)\b.*\bkalshi\b/, /^kalshi (?:day|today in full|full day)$/],
  my_day: [/^(?:what(?: is|'s|s)? )?my day(?: today| look like| looking like)?$/, /\bwhat(?: is|'s|s)? my (?:work )?(?:day|schedule|shift)s?(?: today| this week| look like)?\b/, /\bwhen (?:do|am) i (?:work|working|start work|finish work|off work)\b/,
    /\bdo i (?:work|have work|have a shift) today\b/, /\bhours worked\b|\bwork(?:ing)? (?:vs|versus|against|compared to) trad|\btrading vs (?:work|my job|the job)\b|\bquit (?:my|the) job\b|\bpath to quit/],
};
const ORDER = ['kalshi_day', 'pass_close', 'loss_budget', 'changed', 'my_day', 'trade_today', 'pnl_report'];
const VETO = { trade_today: /\b(?:how many|micros?|contracts?|minis?|what size|how big|explain|why)\b/, loss_budget: /\bkalshi\b/, pnl_report: /\bkalshi\b|\bweekday\b/, pass_close: /\bkalshi\b|\bquiz\b/ };
const normQ = (s) => String(s == null ? '' : s).toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, ' and ').replace(/[?!.,]+/g, ' ').replace(/\bp ?n ?l\b|\bp and l\b|\bp\/l\b/g, 'p and l').replace(/^(?:hey |ok |okay |so |jarvis |please )+/g, '').replace(/\s+/g, ' ').trim();
export function match(text) {
  const q = normQ(text);
  if (!q || q.length > 160) return null;
  for (const id of ORDER) if (!(VETO[id] && VETO[id].test(q)) && RX[id].some((r) => r.test(q))) return id;
  return null;
}

// ------------------------------------------------------------------------------------------------ the data, read once per answer
const homeOf = (S) => (isObj(S && S.home) ? S.home : null);
const boardOf = (S) => obj(obj(homeOf(S)).board);
function accounts(S) {
  const h = homeOf(S); if (!h) return [];
  const A = accountsOf(h), b = boardOf(S), prog = obj(b.progress);
  return ['lit', 'atlas', 'blitz'].map((k) => A[k]).filter((a) => a && a.has).map((a) => {
    const bk = obj(b[a.key]), pg = obj(prog[a.key]);
    return { ...a, label: `${a.name} ${a.size}${a.paper ? ' (paper)' : ''}`, risk: riskOf(S, a.key), win: winOf(S, a.key), quiet: num(bk.quiet_days), status: String(bk.status || a.status || '').toLowerCase(),
      doneToday: !!bk.done_today, tradesToday: num(bk.trades_today), maxDay: num(bk.max_day), session: num(pg.session != null ? pg.session : bk.session), sessionsLeft: num(pg.sessions_left),
      goal: num(pg.sessions) || 10, maxS: num(pg.sessions_max) || 15, odds: obj(obj(pg.odds).rows), oddsSrc: str(obj(pg.odds).src, 140), expected: obj(pg.expected), actual: obj(pg.actual), pweek: obj(pg.week) };
  }).concat(extraOf(h).map((a) => ({ ...a, label: a.name, risk: null, win: null, quiet: null, status: a.kind === 'funded' ? 'funded' : String(a.status || '').toLowerCase(),
    doneToday: false, tradesToday: null, maxDay: null, session: null, sessionsLeft: null, goal: 10, maxS: 15, odds: {}, oddsSrc: '', expected: {}, actual: {}, pweek: {} })));   // the PC's other accounts (Zlarior 25K #2)
}
const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const BOT = { lit: /^(?:lit|zlarior)/i, atlas: /^atlas/i, blitz: /^blitz/i };
const odeon = (S) => arr(obj(S && S.odeon).trades).filter((t) => isObj(t) && num(t.usd) != null && /^\d{4}-\d{2}-\d{2}/.test(String(t.day || '')));
/** the $ of one full loss at the size the bot uses now: the live sizing (board.lit.micros.risk_usd), else the median risk of its last 30 trades */
function riskOf(S, key) {
  const m = obj(obj(boardOf(S)[key]).micros);
  if (num(m.risk_usd) > 0) return { usd: num(m.risk_usd), qty: num(m.qty), src: 'the live sizing' };
  const r = median(odeon(S).filter((t) => BOT[key].test(String(t.bot || t.strat || ''))).slice(-30).map((t) => num(t.risk_usd)).filter((x) => x > 0));
  return r ? { usd: r, qty: null, src: 'the median risk of its last trades' } : null;
}
/** the $ of one win at that size: the live sizing's target $, else the median winning trade */
function winOf(S, key) {
  const m = obj(obj(boardOf(S)[key]).micros);
  if (num(m.win_usd) > 0) return { usd: num(m.win_usd), src: 'the live sizing' };
  const w = median(odeon(S).filter((t) => BOT[key].test(String(t.bot || t.strat || '')) && num(t.usd) > 0).slice(-30).map((t) => num(t.usd)));
  return w ? { usd: w, src: 'its median winning trade' } : null;
}
const ACCT_OF = (x) => { const s = String(x || '').toLowerCase(); return /atlas|acctb/.test(s) ? 'atlas' : /blitz|acct_c/.test(s) ? 'blitz' : 'lit'; };
const NAME = { lit: 'Zlarior', atlas: 'ATLAS', blitz: 'BLITZ' };
/** every closed trade the published files hold, newest first: the board's real rows (src live), then its paper rows, then odeon's real / paper */
function allTrades(S) {
  const b = boardOf(S), out = [], seen = new Set();
  const add = (t, src, file) => {
    if (!isObj(t) || num(t.usd) == null || !/^\d{4}-\d{2}-\d{2}/.test(String(t.day || '')) || t.open) return;
    const acct = t.acct ? ACCT_OF(t.acct) : ACCT_OF(t.bot || t.strat || t.label), et = num(t.entry_t != null ? t.entry_t : obj(t.entry).t);
    const k = acct + '|' + (et || '') + '|' + t.day + '|' + Math.round(num(t.usd) * 100);
    if (seen.has(k)) return; seen.add(k);
    out.push({ acct, name: NAME[acct], src, file, day: String(t.day).slice(0, 10), usd: num(t.usd), r: num(t.r), side: str(t.side, 6), qty: num(t.qty), exit: str(isObj(t.exit) ? t.exit.kind : t.exit, 16), t: et || 0 });
  };
  for (const t of arr(obj(b.real).trades)) add(t, 'real', 'home.json');
  for (const t of arr(b.trades)) add(t, t.src === 'live' ? 'real' : 'paper', 'home.json');
  for (const t of odeon(S)) if (t.src === 'real' || t.src === 'paper') add({ ...t, entry_t: obj(t.entry).t }, t.src, 'odeon/trades.json');
  return out.sort((x, y) => (x.day === y.day ? y.t - x.t : x.day < y.day ? 1 : -1));
}
const pyEvents = (S) => arr(obj(S && S.pythia).events).filter((e) => isObj(e) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')));
function dayEvents(S, day) {
  return pyEvents(S).filter((e) => e.date === day).map((e) => ({ title: str(e.title, 90), time: str(e.time, 5), kind: str(e.kind, 12), impact: str(e.impact, 6).toLowerCase(), closed: e.closed === true, partial: e.partial === true, early: e.kind === 'early' ? str(e.close_et, 5) : '', verify: !!e.verify }))
    .sort((a, b) => (a.time < b.time ? -1 : 1));
}
function nextDay(day) { const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + 1)); return t.toISOString().slice(0, 10); }
function prevWeekday(day) { const [y, m, d] = day.split('-').map(Number); let t = Date.UTC(y, m - 1, d); do { t -= 86400000; } while ([0, 6].includes(new Date(t).getUTCDay())); return new Date(t).toISOString().slice(0, 10); }

// ------------------------------------------------------------------------------------------------ sources: where each number came from, and how old
function srcLine(S, names, now) {
  const tags = [], h = homeOf(S);
  for (const n of names) {
    if (n === 'home' && h) { const ag = agesOf(h, now / 1000); tags.push(`home.json, ${agoText(srcTag(S, 'home', now).ms, now)} (${ag.pc.t != null ? 'PC report ' + ag.pc.words + ' old' : 'no PC report yet'})`); continue; }
    if (n === 'fatesCard') { if (isObj(S && S.fatesCard)) { const t = num(S.fatesCard.t); tags.push(`fates/jarvis.json, ${agoText(t != null ? t * 1000 : S.at && S.at.fatesCard, now)}`); } continue; }
    if (isObj(S && S[n])) tags.push(srcTag(S, n, now).text);
  }
  return { tags, line: tags.length ? 'From ' + tags.join('; ') + '.' : '' };
}
const NO_HOME = (what) => ({ text: `I don't have that: ${what}. home.json has not loaded, so I will not guess.`, speak: `I don't have that. home.json has not loaded.`, missing: true, sources: [] });
function done(S, now, names, lines, extra) {
  const s = srcLine(S, names, now), body = lines.filter(Boolean).join('\n');
  const e = extra || {};
  return { ...e, text: body + (s.line ? '\n' + s.line : ''), speak: sayMoney(e.speak || lines.filter(Boolean).slice(0, 2).join(' ')), sources: s.tags };
}

// ------------------------------------------------------------------------------------------------ 1. should I trade today?  GO / CAREFUL / SIT OUT
export function verdict(S, nowIn) {
  const now = nowOf(nowIn), p = etParts(now), day = p.day, h = homeOf(S), why = [], per = [];
  let v = 'GO', global = '';
  const wk = p.dow >= 1 && p.dow <= 5, evToday = dayEvents(S, day), closed = evToday.find((e) => e.closed), early = evToday.find((e) => e.early);
  const big = evToday.filter((e) => e.impact === 'high' && !e.closed), med = evToday.filter((e) => e.impact === 'med' && !e.closed && !e.early && !e.partial), part = evToday.find((e) => e.partial && !e.closed);
  if (!wk) { v = 'SIT OUT'; global = `It is ${DOW[p.dow]}: no LIT entries on the weekend. Next entries Monday from 02:00 ET.`; }
  else if (closed) { v = 'SIT OUT'; global = `${closed.title}: no trading today.`; }
  else if (p.mod >= WIN_LAST) { v = 'SIT OUT'; global = `Today's entries are over: the last entry is 15:30 ET and it is ${hm(p.mod)} ET. Next entries tomorrow from 02:00 ET.`; }
  if (global) why.push(global);
  if (wk && !closed) {
    for (const e of big) { v = worse(v, 'CAREFUL'); why.push(`News today: ${e.title}${e.time ? ' at ' + e.time + ' ET' : ''} (high impact). Expect a fast market around it; the bot keeps its own rules.`); }
    if (early) { v = worse(v, 'CAREFUL'); why.push(`${early.title}: be flat before ${early.early} ET.`); }
    if (part) { v = worse(v, 'CAREFUL'); why.push(`${part.title}: thin holiday trading, check the CME hours first.`); }
    for (const e of med.slice(0, 1)) why.push(`Also today: ${e.title}${e.time ? ' at ' + e.time + ' ET' : ''} (medium impact).`);
  }
  // the bot: is it reporting, is it running
  if (!h) { v = worse(v, 'CAREFUL'); why.push('I do not have home.json, so I cannot see your accounts or the bot. Check the PC before trusting any number.'); }
  else {
    const ag = agesOf(h, now / 1000), pc = obj(obj(h.live).pc), b = boardOf(S);
    if (ag.pc.t == null) { v = worse(v, 'CAREFUL'); why.push('No report from the PC yet: I cannot tell whether the bot is running.'); }
    else if (ag.stale) { v = worse(v, 'SIT OUT'); why.push(`The bot's last report is ${ag.pc.words} old: check the PC (tools/bat/STATUS.bat) before any trade.`); }
    else if (ag.silent && wk && p.mod >= WIN_OPEN - 30 && p.mod < WIN_LAST) { v = worse(v, 'CAREFUL'); why.push(`The PC has been quiet for ${ag.pc.words} during trading hours: make sure the bot is running.`); }
    else why.push(`Bot reported ${ag.pc.words} ago${pc.running === false || b.running === false ? ', but it says it is stopped' : ''}.`);
    if ((pc.running === false || b.running === false) && !ag.stale) { v = worse(v, 'CAREFUL'); }
    for (const bl of arr(b.blocks).filter(isObj).slice(0, 2)) { v = worse(v, 'CAREFUL'); why.push(`${str(bl.text, 100).replace(/\.$/, '')}.${bl.fix ? ' Fix: ' + str(bl.fix, 100) : ''}`); }
  }
  // each account: drawdown left, the daily loss, the eval's state
  const acc = accounts(S), real = acc.filter((a) => !a.paper);
  for (const a of acc) {
    let lv = 'GO'; const bits = [];
    const dllLeft = a.dll ? Math.max(0, a.dll - a.dllUsed) : null;
    if (a.status === 'passed') { lv = 'SIT OUT'; bits.push('eval passed: wait for the funded account'); }
    else if (a.status === 'failed' || (a.room != null && a.room <= 0)) { lv = 'SIT OUT'; bits.push('eval failed (no drawdown left)'); }
    else {
      if (dllLeft != null && dllLeft <= 0) { lv = 'SIT OUT'; bits.push(`daily loss used up (${usd(a.dllUsed)} of ${usd(a.dll)})`); }
      else if (dllLeft != null && a.dllUsed / a.dll >= 0.8) { lv = worse(lv, 'CAREFUL'); bits.push(`only ${usd(dllLeft)} of today's ${usd(a.dll)} daily loss left`); }
      if (a.doneToday) { lv = worse(lv, 'SIT OUT'); bits.push(`already took its ${a.maxDay === 1 || a.maxDay == null ? 'one trade' : a.maxDay + ' trades'} today`); }
      if (a.room != null && a.mll) {
        const losses = a.risk && a.risk.usd ? Math.floor(a.room / a.risk.usd) : null;
        if (a.room / a.mll < 0.25 || (losses != null && losses < 2)) { lv = worse(lv, 'CAREFUL'); bits.push(`drawdown left ${usd(a.room)} of ${usd(a.mll)}${losses != null ? `: ${losses < 1 ? 'less than one' : losses === 1 ? 'one' : losses} full ${losses === 1 ? 'loss' : 'losses'} at ${usd(a.risk.usd)} each` : ''}`); }
        else bits.push(`drawdown left ${usd(a.room)} of ${usd(a.mll)}${losses != null ? ` (${losses} full losses at ${usd(a.risk.usd)})` : ''}`);
      }
      if (a.quiet != null && a.quiet >= 5 && !a.paper) bits.push(a.quiet >= 6 ? `${a.quiet} quiet days: MFFU closes the account after 7, a trade is needed now` : `${a.quiet} quiet days: a trade is needed before day 7`);
      if (a.sessionsLeft != null && !a.paper) bits.push(a.sessionsLeft > 0 ? `about ${plural(a.sessionsLeft, 'session')} left of the 2-week goal` : 'past the 2-week goal: still within the 3-week limit, keep the plan');
    }
    if (!a.paper) v = worse(v, lv === 'SIT OUT' && real.length > 1 ? 'CAREFUL' : lv);
    per.push({ key: a.key, name: a.label, paper: a.paper, level: lv, short: bits[0] || '', text: `${a.label}: ${lv}. ${bits.length ? bits[0].charAt(0).toUpperCase() + bits[0].slice(1) : 'No numbers yet'}${bits.length > 1 ? '; ' + bits.slice(1).join('; ') : ''}.` });
  }
  if (real.length > 1 && real.every((a) => (per.find((x) => x.key === a.key) || {}).level === 'SIT OUT')) v = 'SIT OUT';
  if (h && !acc.length) { v = worse(v, 'CAREFUL'); why.push('home.json has no account numbers, so I cannot check the loss limits.'); }
  return { verdict: v, day, why, per, global, events: evToday };
}
function tradeToday(S, now) {
  const r = verdict(S, now);
  const head = r.verdict === 'GO' ? 'GO: a normal day. Let the bot trade its plan.' : r.verdict === 'CAREFUL' ? 'CAREFUL: trade only the plan, at the bot\'s own size, and watch the points below.' : 'SIT OUT: no new trades today.';
  const lines = [head].concat(r.why, r.per.map((x) => x.text), ['The bot places its own trades; this is a read of the risk, not an order. Real money is always your decision.']);
  return done(S, now, ['home', 'pythia'], lines, { intent: 'copilot_trade_today', verdict: r.verdict, reasons: r.why.concat(r.per.map((x) => x.text)), app: 'ares', speak: `${head} ${r.global || r.why[0] || ''}` });
}

// ------------------------------------------------------------------------------------------------ 2. how much can I lose today / this week before the eval fails?
export function lossBudget(S, nowIn) {
  const now = nowOf(nowIn);
  return accounts(S).map((a) => {
    const dllLeft = a.dll ? Math.max(0, a.dll - a.dllUsed) : null, room = a.room;
    const today = dllLeft != null && room != null ? Math.min(dllLeft, room) : room != null ? room : dllLeft;
    const losses = a.risk && a.risk.usd && room != null ? Math.floor(room / a.risk.usd) : null;
    return { key: a.key, name: a.label, paper: a.paper, today, dllLeft, dll: a.dll, dllUsed: a.dllUsed, room, mll: a.mll, risk: a.risk, losses, todayCapped: dllLeft != null && room != null && room < dllLeft, now };
  });
}
function lossReply(S, now) {
  if (!homeOf(S)) return NO_HOME('your loss limits');
  const L = lossBudget(S, now);
  if (!L.length) return NO_HOME('your loss limits (home.json has no account numbers)');
  const lines = [];
  for (const x of L) {
    const t = x.today != null ? `today ${usd(x.today)} before the ${x.todayCapped ? 'eval fails (the drawdown is smaller than the daily limit)' : `daily limit (${usd(x.dll)}, ${usd(x.dllUsed)} used; MFFU's daily loss ends the day, not the eval)`}` : 'today: no daily-loss number';
    const w = x.room != null ? `this week and in total ${usd(x.room)} before the eval fails (drawdown left ${usd(x.room)} of ${usd(x.mll)} max loss; there is no weekly limit)` : 'no drawdown number';
    const n = x.losses != null ? ` That is ${x.losses < 1 ? 'less than one full loss' : plural(x.losses, 'full loss', 'full losses')} at ${usd(x.risk.usd)} (${x.risk.src}).` : '';
    lines.push(`${x.name}: ${t}; ${w}.${n}`);
  }
  const tight = L.filter((x) => x.room != null && x.mll && !x.paper).sort((a, b) => a.room / a.mll - b.room / b.mll)[0];
  if (tight && L.filter((x) => !x.paper).length > 1) lines.push(`Tightest: ${tight.name}.`);
  return done(S, now, ['home'], lines, { intent: 'copilot_loss_budget', app: 'demeter', speak: lines[0] });
}

// ------------------------------------------------------------------------------------------------ 3. P&L, best and worst trade, win rate, $ per month
export function pnlReport(S, nowIn) {
  const now = nowOf(nowIn), acc = accounts(S), all = allTrades(S), real = all.filter((t) => t.src === 'real');
  const pool = real.length ? real : all, kind = real.length ? 'real' : 'paper';
  const wins = pool.filter((t) => t.usd > 0), losses = pool.filter((t) => t.usd < 0), gw = wins.reduce((s, t) => s + t.usd, 0), gl = -losses.reduce((s, t) => s + t.usd, 0);
  const best = pool.slice().sort((a, b) => b.usd - a.usd)[0] || null, worst = pool.slice().sort((a, b) => a.usd - b.usd)[0] || null;
  const lit = acc.find((a) => a.key === 'lit');
  const pace = lit ? (num(lit.actual.per_month_pace) != null ? num(lit.actual.per_month_pace) : lit.profit != null && lit.session ? (lit.profit / lit.session) * 21 : null) : null;
  return { acc, pool, kind, n: pool.length, wins: wins.length, losses: losses.length, winRate: pool.length ? wins.length / pool.length : null, net: pool.reduce((s, t) => s + t.usd, 0), pf: gl > 0 ? gw / gl : null,
    best, worst, pace, paceSessions: lit ? lit.session : null, expected: lit ? num(lit.expected.per_month) : null, expectedTpw: lit ? num(lit.expected.trades_per_week) : null, now };
}
const tradeTxt = (t) => `${t.name} ${t.day}${t.side ? ' ' + t.side.toLowerCase() : ''}${t.qty ? ' ' + t.qty + ' micros' : ''}: ${usd(t.usd, true)}${t.r != null ? ` (${(t.r > 0 ? '+' : '') + (Math.round(t.r * 100) / 100)}R)` : ''}`;
function pnlReply(S, now) {
  const P = pnlReport(S, now);
  if (!homeOf(S) && !P.n) return NO_HOME('your P&L');
  const lines = [];
  for (const a of P.acc) lines.push(`${a.label}: today ${usd(a.today, true)}, this week ${usd(a.week, true)}${a.profit != null ? `, since the eval started ${usd(a.profit, true)}` : ''}.`);
  if (P.n) {
    lines.push(`${P.n} ${P.kind} ${P.n === 1 ? 'trade' : 'trades'} in the files: ${P.wins} won, ${P.losses} lost (${Math.round(P.winRate * 100)}% win rate), net ${usd(P.net, true)}${P.pf != null ? `, profit factor ${P.pf.toFixed(2)}` : ''}.`);
    if (P.best) lines.push(`Best trade: ${tradeTxt(P.best)}.`);
    if (P.worst && P.worst !== P.best) lines.push(`Worst trade: ${tradeTxt(P.worst)}.`);
    if (P.n < 10) lines.push(`Only ${plural(P.n, 'trade')}: too few to judge the bot on; the backtest is the better guide for now.`);
  } else lines.push('No closed trades in the published files yet.');
  if (P.pace != null) lines.push(`$ per month at Zlarior's pace so far: about ${usd(P.pace, true)} a month (over ${plural(P.paceSessions || 0, 'session')}).`);
  if (P.expected != null) lines.push(`The backtest expects about ${usd(P.expected, true)} a month at the live settings${P.expectedTpw != null ? ` (${Math.round(P.expectedTpw * 10) / 10} trades a week)` : ''}: an estimate, not a promise.`);
  return done(S, now, ['home', 'odeon'], lines, { intent: 'copilot_pnl_report', app: 'zenith', speak: lines.slice(0, 2).join(' ') });
}

// ------------------------------------------------------------------------------------------------ 4. how close am I to passing?
export function passClose(S, nowIn) {
  const now = nowOf(nowIn), P = pnlReport(S, now), wr = P.n >= 10 ? P.winRate : null;
  return accounts(S).filter((a) => a.toTarget != null).map((a) => {
    const left = Math.max(0, a.toTarget), w = a.win && a.win.usd ? a.win.usd : null, wins = w ? Math.max(left > 0 ? 1 : 0, Math.ceil(left / w)) : null;
    const h2 = obj(a.odds.H2), h1 = obj(a.odds.H1);
    return { key: a.key, name: a.label, paper: a.paper, target: a.target, left, profit: a.profit, done: a.target ? Math.max(0, Math.min(1, (a.target - left) / a.target)) : null, win: a.win, wins, trades: wins != null && wr ? Math.ceil(wins / wr) : null,
      winRate: wr, odds: num(h2.p10) != null ? { label: 'the 2026 H2 check', p10: num(h2.p10), f10: num(h2.f10), med: num(h2.pass_med) } : num(h1.p10) != null ? { label: '2026 H1', p10: num(h1.p10), f10: num(h1.f10), med: num(h1.pass_med) } : null,
      oddsSrc: a.oddsSrc, status: a.status, tpw: a.key === 'lit' ? P.expectedTpw : null };
  });
}
function fatesPct(S, name) {
  const k = arr(obj(S && S.fatesCard).kpis).find((x) => isObj(x) && new RegExp('^' + name, 'i').test(String(x.label || '')));
  const m = k && /(\d+(?:\.\d+)?)\s*%/.exec(String(k.value || ''));
  return m ? Number(m[1]) : null;
}
function passReply(S, now) {
  if (!homeOf(S)) return NO_HOME('your profit target');
  const L = passClose(S, now);
  if (!L.length) return NO_HOME('your profit target (home.json has no target numbers)');
  const lines = [];
  for (const x of L) {
    if (x.status === 'passed') { lines.push(`${x.name}: passed. Well done: the target is met.`); continue; }
    let s = `${x.name}: ${usd(x.left)} to go to the ${usd(x.target)} profit target (${x.profit != null ? `profit so far ${usd(x.profit, true)}, ` : ''}${Math.round((x.done || 0) * 100)}% done).`;
    if (x.wins != null && x.left > 0) s += ` At ${usd(x.win.usd)} a win (${x.win.src}) that is ${plural(x.wins, 'winning trade')}${x.trades != null ? `, about ${plural(x.trades, 'trade')} at a ${Math.round(x.winRate * 100)}% win rate` : ''}${x.trades != null && x.tpw ? ` (~${Math.max(1, Math.round(x.trades / x.tpw))} ${Math.round(x.trades / x.tpw) === 1 ? 'week' : 'weeks'} at ${Math.round(x.tpw * 10) / 10} a week)` : ''}.`;
    if (x.odds) s += ` Odds from the backtest (${x.odds.label}, live switches): ${pct(x.odds.p10)} pass within 10 sessions, ${pct(x.odds.f10)} fail${x.odds.med != null ? `, median pass after ${x.odds.med} sessions` : ''}.`;
    const f = fatesPct(S, x.name.split(' ')[0]);
    if (f != null && !x.paper) s += ` Fates' simulation from today: ${f}% pass.`;
    lines.push(s);
  }
  lines.push('Odds are simulations of past markets, not a promise.');
  return done(S, now, ['home', 'odeon', 'fatesCard'], lines, { intent: 'copilot_pass_close', app: 'fates', speak: lines[0] });
}

// ------------------------------------------------------------------------------------------------ 5. what changed since yesterday (this phone keeps one snapshot per ET day)
function snapOf(S, now) {
  const acc = {}, h = homeOf(S);
  for (const a of accounts(S)) acc[a.key] = { room: a.room, balance: a.balance, profit: a.profit, today: a.today };
  const k = kalshiSnap(S, now), tr = allTrades(S).slice(0, 30).map((t) => t.acct + '|' + t.day + '|' + t.t + '|' + Math.round(t.usd));
  const notes = arr(obj(obj(h).live).notices).map((n) => num(isObj(n) ? n.t : null)).filter((x) => x != null);
  return { day: etParts(now).day, t: Math.round(now / 1000), acc, trades: tr, noteT: notes.length ? Math.max(...notes) : null, kalshi: k ? { balance: k.balance, today: k.today } : null };
}
function loadStore(storage) { try { const v = storage && storage.getItem(STORE_KEY); const j = v ? JSON.parse(v) : null; return isObj(j) && isObj(j.days) ? j : { v: 1, days: {} }; } catch (_) { return { v: 1, days: {} }; } }
function saveSnap(storage, S, now) {
  if (!storage || !homeOf(S)) return null;
  const st = loadStore(storage), sn = snapOf(S, now);
  st.days[sn.day] = sn;
  const keep = Object.keys(st.days).sort().slice(-5), out = { v: 1, days: {} };
  for (const d of keep) out.days[d] = st.days[d];
  try { storage.setItem(STORE_KEY, JSON.stringify(out)); } catch (_) { /* private mode: "what changed" falls back to the files */ }
  return sn;
}
export function changed(S, nowIn, storage) {
  const now = nowOf(nowIn), day = etParts(now).day, st = loadStore(storage), prevDays = Object.keys(st.days).filter((d) => d < day).sort(), base = prevDays.length ? st.days[prevDays[prevDays.length - 1]] : null;
  const since = base ? base.t : Math.round(now / 1000) - 86400, yday = prevWeekday(day), out = { base, since, accounts: [], trades: [], alerts: [], kalshi: null, events: [] };
  for (const a of accounts(S)) {
    const b = base && isObj(base.acc) ? base.acc[a.key] : null;
    out.accounts.push({ name: a.label, room: a.room, mll: a.mll, today: a.today, was: b && num(b.room) != null ? num(b.room) : null, move: b && num(b.room) != null && a.room != null ? a.room - num(b.room) : null });
  }
  const known = new Set(base ? arr(base.trades) : []);
  out.trades = allTrades(S).filter((t) => (base ? !known.has(t.acct + '|' + t.day + '|' + t.t + '|' + Math.round(t.usd)) && t.day >= base.day : t.day >= yday)).slice(0, 6);
  out.alerts = arr(obj(obj(homeOf(S)).live).notices).filter((n) => isObj(n) && num(n.t) != null && num(n.t) > (base && base.noteT != null ? base.noteT : since)).sort((x, y) => y.t - x.t).slice(0, 4)
    .map((n) => ({ t: num(n.t), text: str(n.title || n.body || n.kind, 110) }));
  for (const l of arr(boardOf(S).lines).filter((x) => isObj(x) && x.level === 'bad').slice(0, 2)) out.alerts.push({ t: null, text: str(l.text, 120), open: true });
  const k = kalshiSnap(S, now);
  if (k) out.kalshi = { balance: k.balance, was: base && base.kalshi ? num(base.kalshi.balance) : null, today: k.today };
  out.events = dayEvents(S, day).filter((e) => e.impact !== 'low' || e.closed);
  return out;
}
function changedReply(S, now, storage) {
  if (!homeOf(S)) return NO_HOME('what changed (I compare the account numbers)');
  const C = changed(S, now, storage), lines = [];
  const when = C.base ? `since ${C.base.day === prevWeekday(etParts(now).day) || C.base.day === etParts(now - 86400000).day ? 'yesterday' : C.base.day} (${agoText(C.base.t * 1000, now)}, the last time this phone looked)` : 'since yesterday (from the published files: this phone keeps its own copy from today on)';
  lines.push(`What changed ${when}:`);
  for (const a of C.accounts) {
    if (a.move != null) lines.push(`• ${a.name}: drawdown left ${usd(a.room)} of ${usd(a.mll)}, ${Math.abs(a.move) < 1 ? 'unchanged' : (a.move > 0 ? 'up ' : 'down ') + usd(Math.abs(a.move))} (was ${usd(a.was)}).`);
    else if (a.room != null) lines.push(`• ${a.name}: drawdown left ${usd(a.room)} of ${usd(a.mll)}; today ${usd(a.today, true)}.`);
  }
  if (C.trades.length) lines.push(`• New trades: ${C.trades.map((t) => tradeTxt(t) + (t.src === 'paper' ? ' (paper)' : '')).join('; ')}.`);
  else lines.push('• No new trades.');
  if (C.alerts.length) lines.push(`• Alerts: ${C.alerts.map((a) => a.text.replace(/\.$/, '') + (a.open ? ' (still open)' : a.t ? ` (${agoText(a.t * 1000, now)})` : '')).join('; ')}.`);
  else lines.push('• No new alerts.');
  if (C.kalshi && C.kalshi.balance != null) lines.push(`• Kalshi: balance ${usd(C.kalshi.balance)}${C.kalshi.was != null ? ` (was ${usd(C.kalshi.was)})` : ''}${C.kalshi.today != null ? `, today ${usd(C.kalshi.today, true)}` : ''}.`);
  for (const e of C.events.slice(0, 2)) lines.push(`• Today: ${e.title}${e.time ? ' at ' + e.time + ' ET' : ''}.`);
  saveSnap(storage, S, now);
  return done(S, now, ['home', 'pythia'].concat(C.kalshi ? kNames(S) : []), lines, { intent: 'copilot_changed', app: 'inbox', speak: lines.slice(0, 3).join(' ') });
}

// ------------------------------------------------------------------------------------------------ 6. Kalshi today: bets, P&L, open exposure
const kNames = (S) => (isObj(S && S.kalshi) ? ['kalshi'] : []).concat(isObj(S && S.kalshiEdges) ? ['kalshiEdges'] : []);
function kalshiSnap(S, now) {
  const f = isObj(S && S.kalshi) ? S.kalshi : null, E = isObj(S && S.kalshiEdges) ? S.kalshiEdges : null, bk = obj(E && E.book);
  if (!f && !E) return null;
  const pos = arr(f ? f.positions : bk.positions).filter(isObj), rec = arr(f ? f.trades : bk.recent).filter(isObj), day = etParts(now).day;
  const today = rec.filter((t) => num(t.t) != null && etParts(num(t.t) * 1000).day === day && num(t.pnl) != null);
  const cost = (p) => { const c = num(p.cost != null ? p.cost : p.exposure); if (c != null) return Math.abs(c); const n = num(p.contracts != null ? p.contracts : p.count), pr = num(p.avg_price != null ? p.avg_price : p.price); return n != null && pr != null ? Math.abs(n) * (pr > 1 ? pr / 100 : pr) : null; };
  const exp = pos.map(cost), known = exp.filter((x) => x != null);
  return { live: !!f, t: num(f ? f.t : E.t), balance: num(f ? f.balance : bk.balance), today: num(f ? f.today_pnl : bk.today), week: num(f ? f.week_pnl : bk.week), paused: f ? f.running === false || /paus|stop/i.test(String(f.status || '')) : bk.running === false,
    status: str(f ? f.status : bk.status, 40), positions: pos, exposure: known.length ? known.reduce((s, x) => s + x, 0) : null, unknownCost: exp.length - known.length, settled: today, wins: today.filter((t) => t.pnl > 0).length,
    settledUsd: today.reduce((s, t) => s + num(t.pnl), 0) };
}
export function kalshiDay(S, nowIn) { return kalshiSnap(S, nowOf(nowIn)); }
// night-feedsA 2026-11-18: an engine copy older than 2 days is not "today" (the site's 15-day-old kalshicity/edges.json was read as
// "Kalshi: $0 today"); then the PC's PAPER tests (S.kpaper = data.js kalshiPaper: K1 rules + rewards, paper only) speak instead
const K_OLD_S = 2 * 86400;
function kalshiNow(S, now) {
  const k = kalshiSnap(S, now);
  return k && !k.live && k.t != null && now / 1000 - k.t > K_OLD_S ? null : k;
}
function kalshiPaperRow(S, now) {
  const p = isObj(S && S.kpaper) ? S.kpaper : null;
  if (!p) return null;
  const k1 = isObj(p.k1) ? p.k1 : null, rw = isObj(p.rewards) ? p.rewards : null, two = (v) => (num(v) == null ? '?' : (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(v).toFixed(2));
  return { text: `Kalshi: real money paused. Paper tests: ${k1 ? `K1 ${two(k1.net)} (${num(k1.sig) || 0} signals)` : 'K1 not running yet'}${rw ? `, rewards ${two(rw.net)}` : ''}${num(p.t) != null ? ` (${agoText(p.t * 1000, now)})` : ''}.`, tone: 'info', say: 'How is Kalshi doing?' };
}
function kalshiReply(S, now) {
  const k = kalshiSnap(S, now);
  if (!k) return { text: 'I don\'t have the Kalshi numbers: kalshi.json (the bot\'s live feed) and kalshicity/edges.json (the engine\'s copy) both did not load. I will not guess.', speak: 'I don\'t have the Kalshi numbers right now. Neither feed loaded.', intent: 'copilot_kalshi_day', missing: true, sources: [] };
  const lines = [];
  lines.push(`Kalshi today: ${k.today != null ? usd(k.today, true) : 'no P&L number'}${k.balance != null ? `, balance ${usd(k.balance)}` : ''}${k.week != null ? `, this week ${usd(k.week, true)}` : ''}${k.paused ? ' (the bot is paused)' : ''}.`);
  lines.push(k.settled.length ? `Settled today: ${plural(k.settled.length, 'bet')}, ${k.wins} won, ${usd(k.settledUsd, true)} together.` : 'No bet settled today in the data.');
  if (k.positions.length) lines.push(`Open: ${plural(k.positions.length, 'bet')}${k.exposure != null ? `, ${usd(k.exposure)} at risk (the most they can lose)` : ''}${k.unknownCost ? ` (${k.unknownCost} without a price)` : ''}: ${k.positions.slice(0, 3).map((p) => str(p.title || p.ticker, 50) + (p.side ? ' ' + str(p.side, 4) : '')).join('; ')}${k.positions.length > 3 ? '…' : ''}.`);
  else lines.push('No open bets: nothing at risk right now.');
  if (!k.live) lines.push('This is the engine\'s copy (kalshicity/edges.json): the bot\'s live feed is not answering, so today\'s bets may be missing.');
  lines.push('Read only: Jarvis never places a Kalshi bet.');
  return done(S, now, kNames(S), lines, { intent: 'copilot_kalshi_day', app: 'kalshicity', speak: lines.slice(0, 2).join(' ') });
}

// ------------------------------------------------------------------------------------------------ 7. my day: the work shift over the bot's windows, hours worked vs trading
function dayReply(S, now) {
  const v = Day.today(S && S.day, now);
  if (v.state === 'missing') return null;            // no calendar file (the public site): the older skills answer (the Planner's own day)
  const lines = [v.text].concat((v.notes || []).slice(0, 3));
  if (v.free && v.free.length) lines.push('Free: ' + v.free.slice(0, 3).map((f) => `${Day.said(f.start)}-${Day.said(f.end)}`).join(', ') + '.');
  if (v.week) lines.push(v.week);
  const bad = (v.calendars || []).filter((c) => !c.ok);
  if (bad.length && !v.demo) lines.push(`${bad.map((c) => c.name).join(', ')} could not be read this time${bad[0].cached ? ' (the last good copy is used)' : ''}.`);
  lines.push('Read only: change shifts in your own calendar app.');
  return done(S, now, ['day'], lines, { intent: 'copilot_my_day', app: 'planner', speak: lines.slice(0, 2).join(' ') });
}

// ------------------------------------------------------------------------------------------------ the home cards: 01:45 / 10:45 morning plan, 16:05 day summary
export function slotAt(nowIn) {
  const p = etParts(nowOf(nowIn)), wk = p.dow >= 1 && p.dow <= 5;
  if (!wk) return { id: '16:05', day: p.day, weekend: true };
  if (p.mod >= 965) return { id: '16:05', day: p.day };
  if (p.mod >= 645) return { id: '10:45', day: p.day };
  if (p.mod >= 105) return { id: '01:45', day: p.day };
  return { id: '16:05', day: prevWeekday(p.day), early: true };      // before 01:45 ET: yesterday's summary still stands
}
const TONE = { GO: 'ok', CAREFUL: 'warn', 'SIT OUT': 'bad' };
function mindPlans(S) {
  const pl = obj(obj(obj(obj(obj(homeOf(S)).live).pc).mind).plans);      // no plans published yet: none (was a TypeError that blanked the card)
  return ['lit', 'atlas', 'blitz'].map((k) => (isObj(pl[k]) ? { key: k, text: str(pl[k].headline, 140), t: num(pl[k].t) } : null)).filter((x) => x && x.text);
}
export function morningCard(S, nowIn, slot) {
  const now = nowOf(nowIn), V = verdict(S, now), L = lossBudget(S, now).filter((x) => !x.paper), rows = [];
  const hot = V.per.find((x) => !x.paper && x.level !== 'GO'), alarm = V.why.find((w) => /^News|^The PC|^The bot's|^No report|^I do not|^home\.json/.test(w));
  rows.push({ text: V.verdict + ' · ' + (V.global || alarm || (hot ? `${hot.name}: ${hot.short}` : 'a normal day: the bot trades its plan')).replace(/\.$/, '') + '.', tone: TONE[V.verdict], say: 'Should I trade today?' });
  const work = Day.copilotRow(S && S.day, now, slot);
  if (work) rows.push(work);
  for (const x of L.slice(0, 2)) if (x.today != null) rows.push({ text: `${x.name}: can lose ${usd(x.today)} today; ${x.room != null ? usd(x.room) + ' before the eval fails' : 'no drawdown number'}${x.losses != null ? ` (${x.losses} full ${x.losses === 1 ? 'loss' : 'losses'})` : ''}.`, tone: x.room != null && x.mll && x.room / x.mll < 0.25 ? 'warn' : 'ok', say: 'How much can I lose today?' });
  const plans = mindPlans(S).filter((m) => (slot === '10:45' ? m.key === 'blitz' || m.key === 'lit' : m.key !== 'blitz'));
  if (plans.length) rows.push({ text: plans[0].text, tone: 'info', say: 'What is the game plan?' });
  const ev = V.events.filter((e) => !e.closed && (e.impact === 'high' || e.impact === 'med') && (slot !== '10:45' || !e.time || e.time >= '10:45'));
  rows.push(ev.length ? { text: `News: ${ev.slice(0, 2).map((e) => e.title + (e.time ? ' ' + e.time : '')).join('; ')} ET.`, tone: ev.some((e) => e.impact === 'high') ? 'warn' : 'info', say: 'Is there any news today?' } : { text: isObj(S && S.pythia) ? 'No big news on the calendar today.' : 'No risk calendar loaded (pythia/events.json).', tone: 'info', say: 'Is there any news today?' });
  const k = kalshiNow(S, now), kp = k ? null : kalshiPaperRow(S, now);
  if (kp) rows.push(kp); else rows.push(k ? { text: `Kalshi: ${k.today != null ? usd(k.today, true) + ' today' : 'no P&L yet'}${k.positions.length ? `, ${plural(k.positions.length, 'open bet')}${k.exposure != null ? ' (' + usd(k.exposure) + ' at risk)' : ''}` : ', nothing open'}${k.live ? '' : ' (engine copy)'}.`, tone: k.paused ? 'warn' : 'info', say: 'Kalshi exposure today' } : { text: 'Kalshi: no feed loaded, so no Kalshi numbers.', tone: 'off', say: 'Kalshi exposure today' });
  return { slot, kind: 'morning', title: slot === '10:45' ? 'Midday plan' : 'Morning plan', kicker: `Money copilot · ${slot} ET`, verdict: V.verdict, tone: TONE[V.verdict], rows: rows.slice(0, work ? 7 : 6), foot: srcLine(S, ['home', 'pythia'].concat(k ? kNames(S) : []).concat(work ? ['day'] : []), now).line, asof: now };
}
export function dayCard(S, nowIn, day) {
  const now = nowOf(nowIn), d = day || etParts(now).day, acc = accounts(S), rows = [], all = allTrades(S), mine = all.filter((t) => t.day === d);
  const isToday = d === etParts(now).day;
  for (const a of acc.filter((x) => !x.paper)) rows.push({ text: `${a.label}${a.kind === 'funded' ? ' (funded)' : ''}: ${isToday ? usd(a.today, true) + ' today' : 'last session'}; drawdown left ${a.room != null ? usd(a.room) : '?'} of ${usd(a.mll)}${a.toTarget != null && a.kind !== 'funded' ? `; ${usd(Math.max(0, a.toTarget))} to the target` : ''}.`, tone: a.room != null && a.mll && a.room / a.mll < 0.25 ? 'warn' : a.today < 0 ? 'info' : 'ok', say: "What's my P&L?" });
  rows.push(mine.length ? { text: `${plural(mine.length, 'trade')} ${isToday ? 'today' : 'on ' + d}: ${mine.slice(0, 3).map((t) => tradeTxt(t) + (t.src === 'paper' ? ' (paper)' : '')).join('; ')}.`, tone: mine.reduce((s, t) => s + t.usd, 0) >= 0 ? 'ok' : 'info', say: 'What changed since yesterday?' } : { text: `No trade ${isToday ? 'today' : 'on ' + d}.${acc.some((a) => !a.paper && a.quiet >= 5) ? ' Quiet days are adding up: MFFU closes after 7.' : ''}`, tone: acc.some((a) => !a.paper && a.quiet >= 5) ? 'warn' : 'info', say: 'Why no trade today?' });
  const k = kalshiNow(S, now), kp = k ? null : kalshiPaperRow(S, now);
  if (kp) rows.push(kp);
  if (k) rows.push({ text: `Kalshi: ${k.today != null ? usd(k.today, true) + ' today' : 'no P&L'}, ${plural(k.settled.length, 'bet')} settled${k.positions.length ? `, ${k.positions.length} still open` : ''}.`, tone: k.today != null && k.today < 0 ? 'info' : 'ok', say: 'Kalshi exposure today' });
  const tm = isToday ? nextDay(d) : etParts(now).day, ev = dayEvents(S, tm).filter((e) => e.impact === 'high' || e.closed || e.early);
  if (ev.length) rows.push({ text: `${isToday ? 'Tomorrow' : 'Today'}: ${ev.map((e) => e.title + (e.time ? ' ' + e.time + ' ET' : '')).join('; ')}.`, tone: 'warn', say: 'Should I trade today?' });
  const sum = acc.filter((x) => !x.paper).reduce((s, a) => s + (a.today || 0), 0);
  const work = isToday ? Day.copilotRow(S && S.day, now, '16:05') : null;
  if (work) rows.push(work);
  return { slot: '16:05', kind: 'summary', title: isToday ? 'Day summary' : 'Last session', kicker: `Money copilot · ${isToday ? '16:05 ET' : d}`, tone: isToday ? (sum > 0 ? 'ok' : sum < 0 ? 'warn' : 'info') : 'info', total: isToday ? sum : null, rows: work ? rows.filter((r) => r !== work).slice(0, 5).concat([work]) : rows.slice(0, 5), foot: srcLine(S, ['home', 'odeon'].concat(k ? kNames(S) : []).concat(work ? ['day'] : []), now).line, asof: now };
}
export function cardFor(S, nowIn) {
  const now = nowOf(nowIn), s = slotAt(now);
  if (!homeOf(S)) return { slot: s.id, kind: 'missing', title: 'Money copilot', kicker: 'Money copilot', tone: 'off', rows: [{ text: 'Waiting for home.json: no account numbers yet, so no plan. Nothing is guessed.', tone: 'off', say: 'Are my feeds stale?' }], foot: '', asof: now };
  return s.id === '16:05' ? dayCard(S, now, s.day) : morningCard(S, now, s.id);
}

// ------------------------------------------------------------------------------------------------ the copilot
export function createCopilot(opts) {
  const o = isObj(opts) ? opts : {}, storage = o.storage || null, clock = () => nowOf(typeof o.now === 'function' ? o.now() : Date.now());
  const ANS = { trade_today: (S, n) => tradeToday(S, n), loss_budget: (S, n) => lossReply(S, n), pnl_report: (S, n) => pnlReply(S, n), pass_close: (S, n) => passReply(S, n), changed: (S, n) => changedReply(S, n, storage), kalshi_day: (S, n) => kalshiReply(S, n), my_day: (S, n) => dayReply(S, n) };
  function answer(id, S, now) {
    const n = now != null ? nowOf(now) : clock(), f = ANS[id];
    if (!f) return null;
    try { const r = f(isObj(S) ? S : { at: {} }, n); if (r && id !== 'changed') saveSnap(storage, S, n); if (r && !r.intent) r.intent = 'copilot_' + id; return r; } catch (_) { return null; }
  }
  return {
    match, answer, ids: Object.keys(ANS),
    ask(text, S, now) { const id = match(text); return id ? answer(id, S, now) : null; },
    remember: (S, now) => saveSnap(storage, S, now != null ? nowOf(now) : clock()),
    card: (S, now) => { try { const n = now != null ? nowOf(now) : clock(); const c = cardFor(isObj(S) ? S : { at: {} }, n); if (isObj(S)) saveSnap(storage, S, n); return c; } catch (_) { return null; } },
  };
}
export const HELP = { id: 'copilot', label: 'Money copilot', ex: ['should I trade today', 'how much can I lose today', 'how close am I to passing', 'what changed since yesterday', 'best and worst trade', 'kalshi exposure today', "what's my day"] };
export default createCopilot;
