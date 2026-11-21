// NQ desk (nqdash3 2026-11-20, owner: "NQ dashboard: accounts, info, phone notifications exactly when a trade is taken AND closed with results;
// clean, cool effects, quality checks" and "thinking process before and through trades, news, bias"). ES module, shared by nq/ and trading/.
//   accounts(home, biz, nowS)          -> every MFFU account in the owner's order (business/accounts.json): balance, room left, to pass / to payout,
//                                         today's $, a live / stale / plan dot from the PC's 15-minute report
//   thinking(home, news, file, nowS)   -> per bot: "Before the trade" (lean, today's news, key levels, the window, what it waits for), "In the trade"
//                                         (entry, stop, target, R so far, time in trade), "After" (result $ and R, the reel link)
//   quality(home, file, news, nowS)    -> the checks: data freshness, PC heartbeat age, last trade alert, PC-vs-backtest twin mismatches
//   draw.accounts / draw.thinking / draw.quality(el, model)  -> the cards (textContent / createElement only)
// Only what the PC and the cloud already publish: home.json with the PC post laid over it (../pc_feed.js homeOver: accounts, board, live.pc.glance =
// engine/brain_glance, live.reporter), ./news_week.json, ../trading/trades.json. A field that is not there says so; nothing is made up. BLITZ never shows.
// Read only: it sends nothing. Node-tested (tests/test_nq_desk.py).

export const FRESH_S = 20 * 60;          // the PC posts every 15 minutes: older than 20 = stale (pc_feed.js FRESH_S)
export const BEAT_STALE_S = 15 * 60;      // the bot beats every 5 minutes (tools/pc_report.py HB_STALE_S)
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (x) => (Array.isArray(x) ? x : []);

// ------------------------------------------------------------------------------------------------ words
export function money(v, sign) {
  const n = num(v); if (n === null) return '-';
  const a = Math.round(Math.abs(n)), s = a.toLocaleString('en-US');
  if (a === 0) return '$0';
  return (n < 0 ? '-' : sign ? '+' : '') + '$' + s;
}
export const rText = (v) => { const n = num(v); return n === null ? '' : `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}R`; };
export const px = (v) => { const n = num(v); return n === null ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
export function ageText(s) {
  const n = num(s); if (n === null) return 'unknown';
  if (n < 90) return 'just now';
  if (n < 3600) return `${Math.round(n / 60)} min ago`;
  if (n < 48 * 3600) { const h = Math.floor(n / 3600), m = Math.round((n % 3600) / 60); return m && h < 6 ? `${h} h ${m} min ago` : `${h} h ago`; }
  return `${Math.round(n / 86400)} days ago`;
}
/** data freshness in the site-wide words (../age.js: "updated 4 min ago"); ageText stays for the time since an event */
export const updated = (s) => (num(s) === null ? 'age unknown' : num(s) < 90 ? 'updated just now' : 'updated ' + ageText(s));
export const AGE_LIMITS = { pc: [20 * 60, 60 * 60], bars: [80 * 60, 3 * 3600], daily: [26 * 3600, 3 * 86400] };   // = age.js LIMITS (tests/test_truth_check)
export function ageLevel(s, kind) { const n = num(s), L = AGE_LIMITS[kind] || AGE_LIMITS.daily; return n === null ? 'warn' : n > L[1] ? 'bad' : n > L[0] ? 'warn' : 'ok'; }
export function etParts(tS) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date(tS * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: p.weekday };
  } catch (_) { const d = new Date(tS * 1000).toISOString(); return { day: d.slice(0, 10), hm: d.slice(11, 16), wd: '' }; }
}
const hmET = (tS) => { const n = num(tS); if (!n) return ''; const p = etParts(n), h = +p.hm.slice(0, 2), m = p.hm.slice(3); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'} ET`; };
export function mins(s) { const n = Math.max(0, Math.round((num(s) || 0) / 60)); return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`; }

// ------------------------------------------------------------------------------------------------ the PC feed's age
export function feedAge(home, nowS) {
  const pf = isObj(home) && isObj(home.pc_feed) ? home.pc_feed : null, live = isObj(home) && isObj(home.live) ? home.live : {};
  const rt = num(pf && (pf.report_t || pf.t)) || num(isObj(live.reporter) && live.reporter.t);
  const bt = num(isObj(live.pc) && live.pc.t);
  return { report: rt ? Math.max(0, nowS - rt) : null, beat: bt ? Math.max(0, nowS - bt) : null, fromPc: !!rt };
}
function dotOf(age) { if (age === null) return 'off'; const l = ageLevel(age, 'pc'); return l === 'ok' ? 'live' : l === 'warn' ? 'stale' : 'old'; }

// ------------------------------------------------------------------------------------------------ the PC's chart post (le-bars): the open trades
// chart = { opens: post.open (rows {k, s, q, t, e, sl, tp, be}), last: the last bar's close, t: the post's data time } (the page decodes the bars
// with nqbars.js and hands this in). The freshest word on an open trade: its stop as it is NOW (a moved stop), and the $ at the last bar.
const CHART_ACCT = { z50k: 'zlarior', z25k2: 'fresh25', atlas25f: 'atlas', rapid25: 'rapid1', rapid: 'rapid1' };
export function chartOpen(chart, pick, nowS) {
  if (!isObj(chart)) return null;
  const r = arr(chart.opens).find((x) => isObj(x) && pick(String(x.k || '')) && num(x.e) !== null && num(x.t) !== null);
  if (!r) return null;
  const dir = num(r.s) < 0 ? -1 : 1, q = num(r.q) || 1, e = num(r.e), sl = num(r.sl), tp = num(r.tp), last = num(chart.last);
  const moved = !!r.be || (sl !== null && (dir > 0 ? sl >= e : sl <= e));
  return { k: r.k, side: dir > 0 ? 'LONG' : 'SHORT', qty: q, entry: e, stop: sl, target: tp, stopMoved: moved,
    locked: moved && sl !== null ? (sl - e) * dir * q * 2 : null, target_usd: tp !== null ? Math.abs(tp - e) * q * 2 : null,
    now: last !== null ? (last - e) * dir * q * 2 : null, last, lastAge: num(chart.t) ? Math.max(0, nowS - chart.t) : null,
    since: Math.max(0, nowS - r.t) };
}

// ------------------------------------------------------------------------------------------------ 1. the accounts strip
// MFFU's own view of a SIM-FUNDED account (owner 2026-11-20: "our current balance for the funded account sims start at 0"): the balance is the
// profit since it was funded (ATLAS $401, not $25,401), the floor in the same terms (-$1,000 end-of-day trailing, stops at +$100). PC_FEED.mffuView
// (pc_feed.js: the one place for every page) when the page has it; the same arithmetic here otherwise (node tests).
function mffuOf(bal, room, mll, p) {
  if (bal === null) return null;
  const F = typeof globalThis !== 'undefined' && globalThis.PC_FEED && typeof globalThis.PC_FEED.mffuView === 'function' ? globalThis.PC_FEED : null;
  const size = (mll || 0) >= 2000 || /50k/i.test(String((p && (p.plan || p.name)) || '')) ? '50K' : '25K', start = size === '50K' ? 50000 : 25000;
  if (F) { const v = F.mffuView({ kind: 'funded', size, balance: bal, start, room }); if (v && v.funded) return { balance: v.balance, floor: v.floor }; }
  const b = Math.round((bal > start / 2 ? bal - start : bal) * 100) / 100;
  return { balance: b, floor: room !== null ? Math.min(Math.round((b - room) * 100) / 100, 100) : -(mll || 1000) };
}
const PLAN = { zlarior: ['mffu50k_eval', 'lit'], fresh25: ['b25k_2'], atlas: ['atlas', 'acct_b'], rapid1: ['rapid'] };
const SHORT = { zlarior: 'Zlarior 50K', fresh25: 'Zlarior 25K #2', atlas: 'ATLAS 25K', rapid1: 'Rapid EOD 25K' };
const BOARD_OF = { zlarior: 'lit', atlas: 'atlas' };

export function accounts(home, biz, nowS, chart) {
  const h = isObj(home) ? home : {}, board = isObj(h.board) ? h.board : {}, list = arr(h.accounts).filter(isObj);
  const plan = arr(isObj(biz) ? biz.accounts : null).filter((a) => isObj(a) && !/blitz/i.test(String(a.key) + a.name));
  const order = plan.length ? plan : Object.keys(PLAN).map((key) => ({ key, name: SHORT[key], pc: PLAN[key] }));
  const fa = feedAge(h, nowS), out = [], used = new Set();
  for (const p of order) {
    const ids = arr(p.pc).length ? arr(p.pc) : (PLAN[p.key] || []);
    const acc = list.find((a) => ids.includes(a.id) && a.source !== 'cloud' && a.live) || null;
    const card = BOARD_OF[p.key] && isObj(board[BOARD_OF[p.key]]) && fa.fromPc ? board[BOARD_OF[p.key]] : null;
    const ev = acc && isObj(acc.eval) ? acc.eval : {};
    const funded = /funded/i.test(String(p.stage || '') + (card && card.status) + (ev.status || ''));
    const bal = num(ev.balance) ?? num(card && card.balance), room = num(ev.room) ?? num(card && card.room), mll = num(ev.mll) ?? num(card && card.mll);
    const today = num(ev.today) ?? num(acc && isObj(acc.pnl) && acc.pnl.today) ?? num(card && card.today_pnl);
    const goal = funded ? (num(card && card.to_target) ?? num(ev.to_target)) : (num(ev.to_target) ?? num(card && card.to_target));
    const has = bal !== null;
    const mv = funded ? mffuOf(bal, room, mll, p) : null;   // MFFU's own terms (owner 2026-11-20): a sim-funded account shows its profit as the balance
    if (acc) used.add(acc.id);
    const connT = num(acc && isObj(acc.conn) && acc.conn.t);
    const age = has ? Math.max(connT ? nowS - connT : 0, fa.report ?? 0, 0) : null;     // an old report makes every number in it old
    const planned = !has && /buying|planned|plan/i.test(String(p.status || '') + (p.stage || ''));
    out.push({
      key: p.key, name: SHORT[p.key] || p.name || p.key, plan: p.plan || '', stage: funded ? 'Funded' : 'Eval',
      has, balance: mv ? mv.balance : bal, room, mll, floor: mv ? mv.floor : null, mffu: !!mv, roomFrac: room !== null && mll ? Math.max(0, Math.min(1, room / mll)) : null, today,
      goalLabel: funded ? 'To payout' : 'To pass', goal, goalText: goal === null ? (funded && card && card.payout_text ? 'see payout line' : '-') : goal <= 0 ? (funded ? 'Payout ready' : 'Target reached') : money(goal),
      payoutText: funded && card && card.payout_text ? String(card.payout_text) : '',
      dot: has ? dotOf(age) : planned ? 'plan' : 'off', ageText: has ? updated(age) : planned ? 'plan only: no PC numbers yet' : 'no PC numbers', ageS: age,
      open: chartOpen(chart, (k) => CHART_ACCT[k] === p.key, nowS),
    });
  }
  out.sort((a, b) => (a.dot === 'plan') - (b.dot === 'plan'));
  // an account the PC lists that the plan file does not name yet (a new extra account): it still shows, after the planned ones
  for (const a of list) {
    if (used.has(a.id) || !a.live || a.source === 'cloud' || /blitz/i.test(String(a.id) + a.name) || !isObj(a.eval)) continue;
    if (Object.values(PLAN).some((ids) => ids.includes(a.id))) continue;
    const e = a.eval, connT = num(isObj(a.conn) && a.conn.t), age = Math.max(connT ? nowS - connT : 0, fa.report ?? 0, 0);
    out.push({ key: a.id, name: String(a.name || a.id), plan: a.plan || '', stage: /funded/i.test(e.status || '') ? 'Funded' : 'Eval', has: num(e.balance) !== null,
      balance: num(e.balance), room: num(e.room), mll: num(e.mll), roomFrac: num(e.room) !== null && num(e.mll) ? Math.max(0, Math.min(1, e.room / e.mll)) : null,
      today: num(e.today), goalLabel: 'To pass', goal: num(e.to_target), goalText: num(e.to_target) === null ? '-' : money(e.to_target), payoutText: '',
      dot: dotOf(age), ageText: updated(age) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the pre-market brief (./brief.json, docs/BRIEF.md v 1)
// Built by tools/premarket_brief.py (helper day-brief). Read when present, never needed. Contract rules followed: any field may be null, unknown
// fields ignored, v must be 1, data.stale lines shown, a bias call with context_only = true is shown grey as context, never as advice.
// -> { bias: {side LONG|SHORT|NONE, text, context, verdict} | null, levels, news, waiting, recap, stale[], headline, day }
const pickArr = (o, ...ks) => { for (const k of ks) if (Array.isArray(o && o[k])) return o[k]; return []; };
const pickStr = (o, ...ks) => { for (const k of ks) { const v = o && o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
export function briefFor(brief, botId, nowS) {
  if (!isObj(brief) || (brief.v !== undefined && brief.v !== 1)) return null;
  const day = pickStr(brief, 'day'), today = nowS ? etParts(nowS).day : '';
  // the brief's day is the CME trading day (after 18:00 ET it is tomorrow's): today's or a day up to 3 ahead is current, an older one is not
  if (day && today && (day < today || (Date.parse(day) - Date.parse(today)) / 86400000 > 3)) return null;
  const legs = pickArr(brief, 'bots').filter((x) => isObj(x) && String(x.id || '').toLowerCase().startsWith(botId) && x.state !== 'off_today');
  const B = isObj(brief.bias) ? brief.bias : null, call = String((B && B.call) || '').toLowerCase();
  const bias = B ? { side: call === 'up' ? 'LONG' : call === 'down' ? 'SHORT' : 'NONE', context: B.context_only !== false,
    text: call === 'up' || call === 'down' ? pickStr(B, 'verdict', 'rule') : `no call: ${pickStr(B, 'why_none') || 'none today'}`, verdict: pickStr(B, 'verdict') } : null;
  const mk = isObj(brief.market) ? brief.market : {};
  let levels = [];
  for (const l of legs) for (const w of pickArr(l, 'watch')) if (isObj(w) && num(w.price) !== null && !levels.some((x) => x.label === w.name)) levels.push({ label: String(w.name || ''), px: num(w.price), dist: null });
  const last = num(mk.last);
  if (!levels.length) levels = pickArr(mk, 'levels').filter(isObj).map((x) => ({ label: String(x.name || ''), px: num(x.price), dist: num(x.dist_pts) }));
  levels = levels.filter((x) => x.px !== null).map((x) => ({ ...x, dist: x.dist ?? (last !== null ? Math.round((x.px - last) * 10) / 10 : null) })).slice(0, 6);
  const hm = nowS ? etParts(nowS).hm : '';
  const news = pickArr(isObj(brief.news) ? brief.news : null, 'today').filter(isObj)
    .map((e) => ({ time: String(e.time || ''), title: `${e.event || ''}${num(e.tier) === 1 ? ' (Tier 1)' : ''}`, past: !!(e.time && hm && day === today && e.time < hm) })).filter((e) => e.title.trim());
  const waiting = legs.length > 1 ? legs.map((l) => `${String(l.name || l.id).replace(/^ATLAS /, '')}: ${String(l.waiting_for || '').slice(0, 110)}`).join(' · ')
    : legs.length ? String(legs[0].waiting_for || '') : '';
  const R = isObj(brief.recap) ? brief.recap : null;
  return { bias, levels, news, waiting, recap: R ? pickStr(R, 'traded') : '', stale: pickArr(isObj(brief.data) ? brief.data : null, 'stale').map(String).slice(0, 3),
    headline: pickStr(brief, 'headline'), day };
}

// ------------------------------------------------------------------------------------------------ 2. the thinking, per bot
const BOTS = [{ id: 'lit', name: 'Zlarior', what: 'LIT', acct: ['lit', 'zlarior'] }, { id: 'atlas', name: 'ATLAS', what: 'EMA · MACD · S/R', acct: ['atlas'] }];

export function todayNews(news, nowS) {
  const d = etParts(nowS), hm = d.hm;
  return arr(isObj(news) ? news.events : null).filter((e) => isObj(e) && e.date === d.day && /high/i.test(e.impact || 'high'))
    .map((e) => ({ time: e.time || '', title: String(e.title || ''), past: !!e.time && e.time < hm }));
}
export function nextNews(news, nowS) {
  const d = etParts(nowS).day;
  return arr(isObj(news) ? news.events : null).filter((e) => isObj(e) && e.date > d && /high/i.test(e.impact || 'high')).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))[0] || null;
}
/** the lean: the side of the setup it has armed (engine/brain_glance "arm"), else the side its own words name; never guessed */
export function lean(g, card) {
  const a = arr(g && g.arm).find((x) => isObj(x) && /LONG|SHORT/i.test(x.side || ''));
  if (a) return a.text === 'forming' ? { side: a.side.toUpperCase(), why: `setup forming: ${a.trig || ''}`.trim(), trig: '' }
    : { side: a.side.toUpperCase(), why: `setup armed: ${a.text || ''}`.trim(), trig: a.trig || '' };
  const w = `${(g && g.wait) || ''} ${(card && card.waiting) || ''}`, m = /\b(long|short)\b/i.exec(w);
  if (m) return { side: m[1].toUpperCase(), why: 'from what it says it is waiting for', trig: '' };
  return { side: null, why: 'No lean yet: it waits for a sweep before it picks a side.', trig: '' };
}

function tradesOf(home, bot) {
  return arr(isObj(home) && isObj(home.board) ? home.board.trades : null).filter((t) => isObj(t) && bot.acct.includes(String(t.acct || t.key || '').toLowerCase()) && t.src !== 'paper');
}
function reelOf(file, bot, entryT) {
  const rows = arr(isObj(file) ? file.trades : null).filter((r) => isObj(r) && r.src === 'live' && r.bot === (bot.id === 'lit' ? 'LIT' : 'ATLAS') && Math.abs((+r.t || 0) - entryT) <= 600);
  const r = rows.find((x) => x.odeon) || rows[0];
  return r && r.odeon ? '../odeon/#reel=' + encodeURIComponent(r.odeon) : '';
}

export function thinking(home, news, file, nowS, chart, brief) {
  const h = isObj(home) ? home : {}, live = isObj(h.live) ? h.live : {}, board = isObj(h.board) ? h.board : {};
  const glance = isObj(live.pc) && isObj(live.pc.glance) ? live.pc.glance : null, fa = feedAge(h, nowS);
  const day = etParts(nowS).day, tn = todayNews(news, nowS), nx = nextNews(news, nowS);
  const nd = (d) => { const t = Date.parse(d + 'T12:00:00Z'); return isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }); };
  return BOTS.map((bot) => {
    const g = glance ? arr(glance.bots).find((b) => isObj(b) && b.id === bot.id) || null : null;
    const card = fa.fromPc && isObj(board[bot.id]) ? board[bot.id] : null;
    const tr = tradesOf(h, bot), open = tr.find((t) => t.open), closed = tr.filter((t) => !t.open && num(t.exit_t)).sort((a, b) => b.exit_t - a.exit_t);
    const last = closed.find((t) => etParts(t.exit_t).day === day) || null;
    const pos = g && isObj(g.pos) ? g.pos : null;
    const co = chartOpen(chart, (k) => (bot.id === 'atlas' ? /^atlas/.test(k) : /^z/.test(k)), nowS);
    const L = lean(g, card), bf = briefFor(brief, bot.id, nowS);
    const lv = arr(g && g.lv).slice(0, 6).filter((x) => Array.isArray(x) && num(x[1]) !== null).map((x) => ({ label: String(x[0] || ''), px: num(x[1]), dist: num(x[2]) }));
    const before = {
      lean: L, news: tn.length || !bf ? tn : bf.news, next: nx ? `${nd(nx.date)} ${nx.time} ET, ${nx.title}` : '',
      bias: bf && bf.bias ? bf.bias : null, recap: bf ? bf.recap : '', briefHead: bf && bot.id === 'lit' ? bf.headline : '', stale: bf && bot.id === 'lit' ? bf.stale : [],
      levels: lv.length ? lv : bf ? bf.levels : [],
      window: String((card && isObj(card.window) && card.window.text) || (card && isObj(card.window) && card.window.open ? 'In its entry window now' : '') || ''),
      windowOpen: !!(card && isObj(card.window) && card.window.open),
      waiting: String((g && g.wait) || (card && card.waiting) || (bf && bf.waiting) || ''), why: String((g && g.why) || ''),
      log: arr(g && g.log).slice(0, 3).filter(Array.isArray).map((x) => `${x[0] ? x[0] + ' ' : ''}${x[1] || ''}`),
    };
    let inTrade = null;
    if (co) {                                  // the chart post: the stop as it is now and the $ at the last bar
      const risk = num(pos && pos.risk_usd);
      inTrade = { ...co, risk, r: risk && co.now !== null ? co.now / risk : null, src: 'chart' };
      if (inTrade.since === null && open) inTrade.since = Math.max(0, nowS - (+open.entry_t || nowS));
    } else if (pos || open) {
      const p = pos || {}, side = String(p.side || (open && open.side) || '').toUpperCase();
      const risk = num(p.risk_usd), now = num(p.now_usd) ?? num(open && open.usd), et = num(open && open.entry_t);
      inTrade = { side, qty: num(p.qty), entry: num(p.entry), stop: num(p.stop), target: num(p.target), risk, target_usd: num(p.tgt_usd), now,
        r: risk && now !== null ? now / risk : num(open && open.r), since: et ? Math.max(0, nowS - et) : null, stopMoved: false, locked: null, lastAge: null };
    }
    if (inTrade && inTrade.side) before.lean = { side: inTrade.side, why: 'in this trade now.', trig: '' };
    const after = last ? { usd: num(last.usd), r: num(last.r), exit: String(last.exit || ''), side: String(last.side || '').toUpperCase(), at: hmET(last.exit_t),
      reel: reelOf(file, bot, +last.entry_t || 0) } : null;
    const phase = inTrade ? 'in' : after ? 'after' : 'before';
    return { id: bot.id, name: bot.name, what: bot.what, phase, has: !!(g || card), on: g ? !!g.on : null, mode: g && g.mode ? String(g.mode) : '',
      age: fa.report, before, inTrade, after };
  });
}

// ------------------------------------------------------------------------------------------------ 4. quality checks
const lvl = (ok, warn) => (ok ? 'ok' : warn ? 'warn' : 'bad');
export function twinCheck(file) {
  const live = arr(isObj(file) ? file.trades : null).filter((r) => isObj(r) && r.src === 'live');
  let match = 0, miss = 0, none = 0; const bad = [];
  for (const r of live) {
    const tw = isObj(r.twin) ? (r.twin.backtest || r.twin.paper) : null;
    if (!isObj(tw)) { none++; continue; }
    if (tw.side === r.side && tw.k === r.k) match++; else { miss++; bad.push(`${r.day} ${r.an || r.bot}: live ${r.side} ${r.k}, twin ${tw.side} ${tw.k}`); }
  }
  return { n: live.length, match, miss, none, bad };
}
export function quality(home, file, news, nowS, edge, chart) {
  const h = isObj(home) ? home : {}, fa = feedAge(h, nowS), live = isObj(h.live) ? h.live : {}, rep = isObj(live.reporter) ? live.reporter : {};
  const rows = [];
  rows.push({ k: 'report', label: 'PC report', value: fa.report === null ? 'not received on this page' : updated(fa.report),
    level: fa.report === null ? 'bad' : ageLevel(fa.report, 'pc'), note: 'every 15 min from your PC' });
  rows.push({ k: 'beat', label: 'Bot heartbeat', value: fa.beat === null ? 'unknown' : updated(fa.beat),
    level: fa.beat === null ? 'warn' : lvl(fa.beat <= BEAT_STALE_S, fa.beat <= 3600), note: 'the bot beats every 5 min' });
  const built = h.built ? Date.parse(h.built) / 1000 : null;
  const tDay = isObj(file) && isObj(file.data_branch) ? file.data_branch.to : null;
  const fileAge = tDay ? Math.max(0, (Date.parse(etParts(nowS).day) - Date.parse(tDay)) / 86400) : null;
  rows.push({ k: 'data', label: 'Site data', value: `${built ? 'home.json ' + ageText(nowS - built) : 'home.json date unknown'}${tDay ? ` · trades to ${tDay}` : ' · no data-branch upload in trades.json'}`,
    level: lvl(built !== null && nowS - built < 6 * 3600 && fileAge !== null && fileAge <= 3, true), note: 'the cloud build + the nightly trade upload' });
  const na = num(rep.na);
  let alertT = na, how = 'the PC says';
  if (!alertT) {
    const tt = arr(isObj(h.board) ? h.board.trades : null).filter((t) => isObj(t) && t.src !== 'paper').flatMap((t) => [num(t.entry_t), num(t.exit_t)]).filter((x) => x);
    alertT = tt.length ? Math.max(...tt) : null; how = 'the newest entry / exit the PC reported (an alert goes out then)';
  }
  rows.push({ k: 'alert', label: 'Last trade alert', value: alertT ? `${ageText(nowS - alertT)} (${hmET(alertT)})` : 'none in the last report', level: alertT ? 'ok' : 'warn', note: how });
  const tw = twinCheck(file);
  rows.push({ k: 'twin', label: 'PC vs backtest twin', value: tw.n ? `${tw.match} match · ${tw.miss} differ · ${tw.none} no twin yet` : 'no LIVE trade in trades.json',
    level: tw.miss ? 'bad' : tw.n && tw.match ? 'ok' : 'warn', note: tw.bad[0] || 'same side and same exit as the replay = the bot does what the backtest does', bad: tw.bad });
  const news0 = isObj(news) && news.to ? news.to : null;
  rows.push({ k: 'news', label: 'News calendar', value: news0 ? `covers to ${news0}` : 'missing', level: news0 && news0 >= etParts(nowS).day ? 'ok' : 'warn', note: "the bot's high-impact US list" });
  // the chart candles (the PC's le-bars post): about hourly while the bots trade (01:50-16:10 ET weekdays), at once on an entry / exit / stop move
  if (isObj(chart) && num(chart.t)) {
    const ca = Math.max(0, nowS - chart.t), p = etParts(nowS), inHours = !/Sat|Sun/.test(p.wd) && p.hm >= '01:50' && p.hm <= '16:10';
    rows.push({ k: 'bars', label: 'Chart candles', value: `last bar ${ageText(ca)} (${hmET(chart.t)})`, level: !inHours || ca <= 80 * 60 ? 'ok' : ca <= 3 * 3600 ? 'warn' : 'bad',
      note: inHours ? 'the PC sends candles about hourly while the bots trade, and at once on each entry, exit or stop move' : 'outside the bots\' hours the candles rest' });
  }
  // the edge check's inputs (../edge.json, tools/edge_health.py): LIT re-runs on the newest bars; ATLAS reads a stored backtest run that stops when it
  // was made (2026-11-20: Oct 16, LEAD_WIRES nqdash3 F), so its "last 40 sessions" are not the latest 40
  const eh = isObj(edge) && isObj(edge.eh) ? edge.eh : null;
  if (eh) {
    const today = etParts(nowS).day, old = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : null);
    const ad = Array.isArray(eh.a) ? eh.a[3] : null, lo = old(eh.d), ao = old(ad), worstD = Math.max(lo ?? 99, ao ?? 99);
    rows.push({ k: 'edge', label: 'Edge check data', value: `LIT to ${eh.d || '?'}${ad ? ` · ATLAS to ${ad}` : ''}`, level: worstD <= 4 ? 'ok' : worstD <= 10 ? 'warn' : 'bad',
      note: ao !== null && ao > 4 ? `ATLAS's edge light uses a backtest that stops ${ao} days ago: read its PF as old` : 'the ZEUS edge chip on Trading reads this' });
  }
  const worst = rows.some((r) => r.level === 'bad') ? 'bad' : rows.some((r) => r.level === 'warn') ? 'warn' : 'ok';
  return { rows, level: worst, okN: rows.filter((r) => r.level === 'ok').length };
}

// ------------------------------------------------------------------------------------------------ drawing (DOM only from here)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
const DOT = { live: 'Live: the PC reported in the last 20 min', stale: 'Getting old: no PC report for over 20 min', old: 'Old: no PC report for over an hour', plan: 'Planned: no PC numbers yet', off: 'No PC numbers' };

function drawAccounts(box, list) {
  clear(box);
  for (const a of list) {
    const c = el('article', 'dk-acct'); c.dataset.key = a.key; c.dataset.dot = a.dot;
    const top = el('div', 'dk-row'); const n = el('b', 'dk-name', a.name);
    const d = el('span', 'dk-dot ' + a.dot); d.setAttribute('role', 'img'); d.setAttribute('aria-label', DOT[a.dot]); d.title = DOT[a.dot];
    top.appendChild(d); top.appendChild(n); top.appendChild(el('span', 'dk-stage', a.stage)); c.appendChild(top);
    if (!a.has) { c.appendChild(el('p', 'dk-none', a.ageText)); box.appendChild(c); continue; }
    c.appendChild(el('p', 'dk-bal ag-num', money(a.balance)));
    if (a.mffu) c.appendChild(el('p', 'dk-mffu', `MFFU view: profit since funded · floor ${money(a.floor)}`));
    const kv = el('dl', 'dk-kv');
    const add = (k, v, cls) => { kv.appendChild(el('dt', '', k)); kv.appendChild(el('dd', 'ag-num ' + (cls || ''), v)); };
    add('Today', money(a.today, true), a.today > 0.5 ? 'pos' : a.today < -0.5 ? 'neg' : '');
    add('Room left', money(a.room), a.roomFrac !== null && a.roomFrac < 0.3 ? 'neg' : '');
    add(a.goalLabel, a.goalText);
    c.appendChild(kv);
    if (a.roomFrac !== null) {
      const m = el('div', 'dk-meter'); m.setAttribute('role', 'img'); m.setAttribute('aria-label', `${Math.round(a.roomFrac * 100)} percent of the max loss left`);
      const i = el('i', a.roomFrac < 0.3 ? 'bad' : a.roomFrac < 0.55 ? 'warn' : 'ok'); i.style.setProperty('--w', `${Math.round(a.roomFrac * 100)}%`); m.appendChild(i); c.appendChild(m);
    }
    if (a.open) {
      const o = a.open, t = el('p', 'dk-open');
      t.appendChild(el('b', 'dk-side ' + o.side.toLowerCase(), `${o.side} ${o.qty}`));
      t.appendChild(document.createTextNode(` @ ${px(o.entry)}${o.now !== null ? ` · ${money(o.now, true)}` : ''}${o.stopMoved ? ' · stop at break-even' : ''}`));
      c.appendChild(t);
    }
    c.appendChild(el('p', 'dk-age', a.ageText));
    box.appendChild(c);
  }
}

const PH = { before: 'Before the trade', in: 'In the trade', after: 'After the trade' };
function drawThinking(box, bots, opts) {
  clear(box);
  for (const b of bots) {
    const c = el('article', 'dk-bot'); c.dataset.bot = b.id; c.dataset.phase = b.phase;
    const top = el('div', 'dk-row'); const t = el('h3', 'dk-h', b.name + ' '); t.appendChild(el('small', '', b.what)); top.appendChild(t);
    top.appendChild(el('span', 'dk-phase ' + b.phase, PH[b.phase])); c.appendChild(top);
    const steps = el('ol', 'dk-steps'); steps.setAttribute('aria-label', 'Where it is in the trade');
    for (const k of ['before', 'in', 'after']) { const s = el('li', k === b.phase ? 'on' : '', PH[k].replace(' the trade', '')); if (k === b.phase) s.setAttribute('aria-current', 'step'); steps.appendChild(s); }
    c.appendChild(steps);
    if (!b.has) { c.appendChild(el('p', 'dk-none', "No word from the PC yet: its thinking shows here once the 15-minute report arrives.")); box.appendChild(c); continue; }
    // before (always: it is the plan the trade came from)
    const bf = el('section', 'dk-sec'); bf.appendChild(el('p', 'dk-eye', PH.before));
    const L = b.before.lean, ln = el('p', 'dk-lean'); ln.appendChild(el('b', 'dk-side ' + (L.side ? L.side.toLowerCase() : 'none'), L.side ? `Lean ${L.side}` : 'No lean'));
    ln.appendChild(document.createTextNode(' ' + L.why)); bf.appendChild(ln);
    if (L.trig) bf.appendChild(el('p', 'dk-note', L.trig));
    if (b.before.briefHead) bf.appendChild(el('p', 'dk-line dk-brief', b.before.briefHead));
    if (b.before.bias) { const z = b.before.bias, p = el('p', 'dk-line' + (z.context ? ' dk-ctx' : '')); p.appendChild(el('b', '', z.context ? 'Morning brief (context, no better than a coin): ' : 'Morning brief: '));
      if (z.side !== 'NONE') p.appendChild(el('span', 'dk-side ' + (z.context ? 'none' : z.side.toLowerCase()), z.side === 'LONG' ? 'UP' : 'DOWN'));
      p.appendChild(document.createTextNode(' ' + (z.text || ''))); bf.appendChild(p); }
    for (const st of b.before.stale || []) bf.appendChild(el('p', 'dk-note warn', 'Brief data: ' + st));
    if (b.before.waiting) { const w = el('p', 'dk-line'); w.appendChild(el('b', '', 'Waiting for: ')); w.appendChild(document.createTextNode(b.before.waiting)); bf.appendChild(w); }
    if (b.before.window) { const w = el('p', 'dk-line'); w.appendChild(el('b', '', b.before.windowOpen ? 'Window: open now. ' : 'Window: ')); w.appendChild(document.createTextNode(b.before.window)); bf.appendChild(w); }
    const nw = el('p', 'dk-line'); nw.appendChild(el('b', '', 'News today: '));
    nw.appendChild(document.createTextNode(b.before.news.length ? b.before.news.map((n) => `${n.time} ${n.title}${n.past ? ' (over)' : ''}`).join(' · ') : `none high-impact${b.before.next ? `. Next: ${b.before.next}` : ''}`)); bf.appendChild(nw);
    if (b.before.levels.length) {
      const ul = el('ul', 'dk-levels'); ul.setAttribute('aria-label', 'Key levels it watches');
      for (const l of b.before.levels) { const li = el('li'); li.appendChild(el('span', '', l.label)); li.appendChild(el('b', 'ag-num', px(l.px))); if (l.dist !== null) li.appendChild(el('small', 'ag-num', `${l.dist > 0 ? '+' : ''}${l.dist} pt`)); ul.appendChild(li); }
      bf.appendChild(ul);
    } else bf.appendChild(el('p', 'dk-note', 'Key levels: not in this report (the PC sends them with its brain glance).'));
    if (b.before.why) bf.appendChild(el('p', 'dk-note', 'Last decision: ' + b.before.why));
    c.appendChild(bf);
    if (b.inTrade) {
      const x = b.inTrade, s = el('section', 'dk-sec live'); s.appendChild(el('p', 'dk-eye', PH.in));
      const big = el('p', 'dk-big ag-num ' + (x.now > 0 ? 'pos' : x.now < 0 ? 'neg' : '')); big.textContent = `${x.side} ${x.now !== null ? money(x.now, true) : ''} ${x.r !== null ? rText(x.r) : ''}`.replace(/\s+/g, ' ').trim(); s.appendChild(big);
      const kv = el('dl', 'dk-kv');
      const stopTxt = x.stopMoved ? `${px(x.stop)} · moved to break-even${x.locked !== null && Math.abs(x.locked) >= 1 ? ` (${money(x.locked, true)} locked)` : ''}`
        : `${px(x.stop)}${x.risk !== null ? ` (-${money(x.risk)})` : ''}`;
      for (const [k, v] of [['Size', x.qty ? `${x.qty} MNQ` : '-'], ['Entry', px(x.entry)], ['Stop', stopTxt], ['Target', `${px(x.target)}${x.target_usd !== null ? ` (+${money(x.target_usd)})` : ''}`],
        ['Open $', x.now !== null ? `${money(x.now, true)}${x.last !== undefined && x.last !== null ? ` at ${px(x.last)}` : ''}` : '-'], ['In trade', x.since !== null ? mins(x.since) : '-']]) { kv.appendChild(el('dt', '', k)); kv.appendChild(el('dd', 'ag-num' + (k === 'Stop' && x.stopMoved ? ' pos' : ''), v)); }
      s.appendChild(kv);
      if (x.lastAge !== null) s.appendChild(el('p', 'dk-note', `Open $ is at the last chart bar from the PC (${ageText(x.lastAge)}); the close alert brings the final $ and R.`));
      c.appendChild(s);
    }
    if (b.after) {
      const x = b.after, s = el('section', 'dk-sec'); s.appendChild(el('p', 'dk-eye', PH.after));
      s.appendChild(el('p', 'dk-big ag-num ' + (x.usd > 0 ? 'pos' : x.usd < 0 ? 'neg' : ''), `${money(x.usd, true)} ${rText(x.r)}`.trim()));
      s.appendChild(el('p', 'dk-note', `${x.side} closed by ${x.exit.toLowerCase() || 'the bot'} at ${x.at}.`));
      if (b.before.recap) s.appendChild(el('p', 'dk-note', b.before.recap));
      if (x.reel) { const a = el('a', 'dk-reel', 'Watch the replay'); a.href = x.reel; s.appendChild(a); } else s.appendChild(el('p', 'dk-note', "Replay after tonight's data upload."));
      c.appendChild(s);
    }
    box.appendChild(c);
  }
  if (opts && opts.age != null) box.dataset.age = String(opts.age);
}

function drawQuality(box, q) {
  clear(box);
  const ul = el('ul', 'dk-q');
  for (const r of q.rows) {
    const li = el('li', 'dk-qr ' + r.level); li.dataset.k = r.k;
    const ic = el('span', 'dk-qi ' + r.level, r.level === 'ok' ? '✓' : r.level === 'warn' ? '!' : '×'); ic.setAttribute('aria-label', r.level === 'ok' ? 'OK' : r.level === 'warn' ? 'Check' : 'Problem');
    li.appendChild(ic); const t = el('div', 'dk-qt'); t.appendChild(el('b', '', r.label)); t.appendChild(el('span', 'ag-num', r.value)); t.appendChild(el('small', '', r.note)); li.appendChild(t);
    ul.appendChild(li);
  }
  box.appendChild(ul);
}
export const draw = { accounts: drawAccounts, thinking: drawThinking, quality: drawQuality };

// ================================================================================================ round 3 (lead 2026-11-20: the audit's MERGE verdicts)
// Ares (GO / WAIT / HALT) -> gate(); Kairos (the bots' day timeline) -> dayLine(); Chronos (replay a past day) -> pastDays(). The old apps stay
// reachable (each card links to it); their doors move here via LEAD_WIRES.md.

// the trading day in New York time (Kairos's windows, the hidden paper bot left out). Minutes since midnight ET.
export const DAY = [
  { id: 'asia', from: 1080, to: 120, label: 'Evening / Asia', who: 'LIT waits for 02:00 (a paper copy may trade)' },
  { id: 'london', from: 120, to: 480, label: 'London entries', who: 'LIT looks for a sweep; ATLAS EMA 02:00-05:00' },
  { id: 'nyam', from: 480, to: 720, label: 'New York morning', who: 'LIT can still enter; ATLAS NY level reclaim' },
  { id: 'nypm', from: 720, to: 930, label: 'New York afternoon', who: 'entries until 15:30' },
  { id: 'winddown', from: 930, to: 955, label: 'No new trades', who: 'open trades closed at 15:55' },
  { id: 'flat', from: 955, to: 970, label: 'Flat time', who: 'MFFU needs flat by 16:10' },
  { id: 'idle', from: 970, to: 1020, label: 'Quiet', who: 'flat until the CME break' },
  { id: 'break', from: 1020, to: 1080, label: 'CME break', who: 'no prices' },
];
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function phase(nowS) {
  const p = etParts(nowS), wd = WD[p.wd] ?? new Date(nowS * 1000).getUTCDay(), mod = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3);
  if (wd === 6 || (wd === 0 && mod < 1080) || (wd === 5 && mod >= 1020)) return { id: 'closed', label: 'Market closed', who: 'reopens Sunday 18:00 ET', mod, wd };
  const w = DAY.find((x) => (x.from < x.to ? mod >= x.from && mod < x.to : mod >= x.from || mod < x.to));
  return { ...w, mod, wd };
}
/** the strip from 18:00 (yesterday) to 17:00: each window's share, the now marker, today's trades as dots */
export function dayLine(home, nowS) {
  const ph = phase(nowS), span = 23 * 60, pos = (m) => ((m - 1080 + 1440) % 1440) / span;
  const segs = DAY.filter((w) => w.id !== 'break').map((w) => ({ id: w.id, label: w.label, a: pos(w.from), b: w.to === 120 ? pos(120) : pos(w.to) || 1 }));
  const day = etParts(nowS).day, dots = [];
  for (const t of arr(isObj(home) && isObj(home.board) ? home.board.trades : null)) {
    if (!isObj(t) || t.src === 'paper' || /blitz/i.test(String(t.acct))) continue;
    const et = num(t.entry_t); if (!et) continue;
    const p = etParts(et), m = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3);
    if (p.day !== day && !(m >= 1080 && p.day < day)) continue;
    dots.push({ x: pos(m), bot: /atlas/i.test(String(t.acct)) ? 'ATLAS' : 'Zlarior', open: !!t.open, usd: num(t.usd), side: String(t.side || '') });
  }
  return { phase: ph, now: ph.id === 'closed' || ph.id === 'break' ? null : pos(ph.mod), segs, dots };
}

/** Ares's verdict for the BOTS, per account: HALT (market shut, floor reached, daily loss limit hit, eval target reached), WAIT (outside the entry
 * window, high-impact news within 30 minutes, data stale), GO (in its window with room). Only the posted numbers; the manual calculator stays in ../ares/. */
const DLL = { 'MFFU Builder 50K': 1000, 'MFFU Builder 25K': 600, 'MFFU Builder 25K (funded)': 600, 'MFFU Rapid EOD 25K': 500 };
export function gate(accts, home, news, nowS) {
  const ph = phase(nowS), hm = etParts(nowS).hm, soon = todayNews(news, nowS).find((n) => n.time && !n.past && minsBetween(hm, n.time) <= 30);
  return arr(accts).filter((a) => isObj(a) && a.dot !== 'plan').map((a) => {
    const why = [], halt = (t) => why.push({ level: 'halt', t }), wait = (t) => why.push({ level: 'wait', t });
    if (ph.id === 'closed' || ph.id === 'break') halt(`${ph.label}: ${ph.who}.`);
    if (a.has && a.room !== null && a.room <= 0) halt('At the drawdown floor: the account is over.');
    const dll = DLL[a.plan] ?? (a.mll >= 2000 ? 1000 : 600);
    if (a.has && a.today !== null && a.today <= -dll) halt(`Daily loss limit hit (${money(a.today)} of -${money(dll)}): MFFU pauses it for the day.`);
    if (a.has && a.stage === 'Eval' && a.goal !== null && a.goal <= 0) halt('Target reached: stop this eval and ask MFFU for the funded account.');
    if (!a.has) wait('No numbers from the PC for this account yet.');
    else if (a.dot === 'stale' || a.dot === 'old') wait(`The PC last reported ${ageText(a.ageS)} (it reports every 15 min): check the PC before trusting GO.`);
    if (['winddown', 'flat', 'idle'].includes(ph.id)) wait(`${ph.label} (${ph.who}).`);
    else if (ph.id === 'asia') wait('Before 02:00 ET: LIT takes no real entry yet.');
    if (soon) wait(`${soon.title} at ${soon.time} ET (within 30 min): spreads jump, stops slip.`);
    const level = why.some((x) => x.level === 'halt') ? 'halt' : why.length ? 'wait' : 'go';
    return { key: a.key, name: a.name, level, why: why.length ? why : [{ level: 'go', t: `${ph.label}: in its window, ${money(a.room)} of room left.` }] };
  });
}
function minsBetween(a, b) { return (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3)); }

/** Chronos: the past days with a real or paper trade (../odeon/trades.json), newest first, each a link to its replay (../chronos/#YYYY-MM-DD) */
export function pastDays(odeon, n = 8) {
  const by = new Map();
  for (const t of arr(isObj(odeon) ? odeon.trades : null)) {
    if (!isObj(t) || !t.day || /blitz/i.test(String(t.bot) + t.label)) continue;
    const d = by.get(t.day) || { day: t.day, n: 0, usd: 0, real: false, bots: new Set() };
    d.n++; d.usd += num(t.usd) || 0; d.real = d.real || t.src === 'real'; d.bots.add(t.bot === 'LIT' ? 'Zlarior' : String(t.bot || ''));
    by.set(t.day, d);
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, n).map((d) => ({ day: d.day, n: d.n, usd: Math.round(d.usd), real: d.real, bots: [...d.bots].join(' + '), href: '../chronos/#' + d.day }));
}

function drawGate(box, G) {
  clear(box);
  const W = { go: 'GO', wait: 'WAIT', halt: 'HALT' };
  for (const g of G) {
    const r = el('div', 'dk-gate ' + g.level); r.dataset.key = g.key;
    r.appendChild(el('span', 'dk-gv ' + g.level, W[g.level]));
    const t = el('div', 'dk-gt'); t.appendChild(el('b', '', g.name)); for (const w of g.why.slice(0, 3)) t.appendChild(el('small', '', w.t)); r.appendChild(t);
    box.appendChild(r);
  }
  if (!G.length) box.appendChild(el('p', 'dk-none', 'No account numbers yet.'));
}
function drawDay(box, D) {
  clear(box);
  const bar = el('div', 'dk-day'); bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `The trading day from 18:00 to 17:00 New York time. Now: ${D.phase.label}, ${D.phase.who}.`);
  for (const s of D.segs) { const i = el('i', 'dk-seg ' + s.id); i.style.left = `${(s.a * 100).toFixed(2)}%`; i.style.width = `${(Math.max(0, s.b - s.a) * 100).toFixed(2)}%`; i.title = s.label; bar.appendChild(i); }
  for (const d of D.dots) { const i = el('b', 'dk-dotr ' + (d.open ? 'open' : (d.usd || 0) >= 0 ? 'win' : 'loss')); i.style.left = `${(d.x * 100).toFixed(2)}%`; i.title = `${d.bot} ${d.side} ${d.open ? 'open' : money(d.usd, true)}`; bar.appendChild(i); }
  if (D.now !== null) { const n = el('span', 'dk-now'); n.style.left = `${(D.now * 100).toFixed(2)}%`; bar.appendChild(n); }
  box.appendChild(bar);
  const ticks = el('div', 'dk-ticks'); for (const [x, t] of [[0, '18:00'], [8 / 23, '02:00'], [14 / 23, '08:00'], [18 / 23, '12:00'], [1, '17:00']]) { const s = el('span', '', t); s.style.left = `${(x * 100).toFixed(2)}%`; ticks.appendChild(s); }
  box.appendChild(ticks);
  const p = el('p', 'dk-line'); p.appendChild(el('b', '', `Now: ${D.phase.label}. `)); p.appendChild(document.createTextNode(D.phase.who + '.')); box.appendChild(p);
  if (D.dots.length) box.appendChild(el('p', 'dk-note', D.dots.map((d) => `${d.bot} ${d.side.toLowerCase()} ${d.open ? '(open)' : money(d.usd, true)}`).join(' · ')));
}
function drawPast(box, L) {
  clear(box);
  if (!L.length) { box.appendChild(el('p', 'dk-none', 'No replayable day yet.')); return; }
  const ul = el('ul', 'dk-past');
  for (const d of L) { const li = el('li'); const a = el('a', '', `${nice2(d.day)} · ${d.bots} · ${d.n} trade${d.n === 1 ? '' : 's'}`); a.href = d.href; li.appendChild(a); li.appendChild(el('span', 'ag-num ' + (d.usd > 0 ? 'pos' : d.usd < 0 ? 'neg' : ''), `${money(d.usd, true)}${d.real ? ' LIVE' : ''}`)); ul.appendChild(li); }
  box.appendChild(ul);
}
function nice2(d) { const t = Date.parse(d + 'T12:00:00Z'); return isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); }
draw.gate = drawGate; draw.day = drawDay; draw.past = drawPast;
