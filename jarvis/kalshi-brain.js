// Jarvis x Kalshi (owner 2026-11-04): Jarvis knows the Kalshi bot AND what the Kalshi City engine learned about its edges. One ES module:
// no imports, no DOM, no network. READ ONLY: nothing here places, sizes or changes an order; every size it mentions is a "suggestion, your
// call". The design is bots.js's (a snapshot kept on the phone, a diff of two snapshots into events, a rate-limited spoken queue, the
// ask-anything answers, the "Think for me" items). iPhone Safari 16: plain ES2020 (no lookbehind, no optional chaining).
//
//   import { createKalshiBrain } from './kalshi-brain.js';
//   const kb = createKalshiBrain({ storage?, speak(text) -> 'spoken'|'pending'|'off'|'hidden'|'none', busy() -> bool, hidden() -> bool, onEvent(ev) });
//   kb.setData({ edges, log, learned })   edges.json + learning_log.json (the engine, tools/kalshi_edges.py) + learned.json (the research), as fetched by the shell
//   kb.tick(feed, nowMs?)                 every minute and on every kalshi.json change: diff against the last snapshot, queue the alerts, flush the queue
//   kb.answer(raw, q, feed, now)          how is Kalshi / is it running / what to stop / best edge / risks / how much to bet / what did it learn / alert switches
//   kb.items(feed, now)                   the "Think for me" items (modes.js reads them from the brain's digest as D.kalshiBrain.items)
//   kb.line(feed, now)                    one line for the Kalshi tile on the Money cards
//   kb.settings() / kb.set({ on, floor, dayLoss, quiet })    alerts on by default; floor = the balance below which she tells you ($40); dayLoss = 10%
//
// Alerts (diff of two kalshi.json snapshots; the first look says nothing, never a burst of old news): the bot paused / resumed, the balance
// under the floor, a daily loss over 10% of the day's opening balance, a big loss (a favourite at 90c or more lost $2 or more), a new DO MORE /
// STOP lesson in learning_log.json, the risk of ruin moving between low / medium / high. Speaking: never over the mic or another reply (busy()),
// at least 30 s between two, at most 8 an hour (a pause, the floor, a daily loss or a big loss still gets through), one event once ever (keys kept
// on the phone), one repeating warning per cooldown, quiet hours (optional), news older than 5 minutes dropped, one voice line for up to 3 events.

export const SNAP_KEY = 'jarvis.kalshi.snap';
export const SEEN_KEY = 'jarvis.kalshi.seen';
export const SET_KEY = 'jarvis.kalshi.set';
export const LOG_KEY = 'jarvis.kalshi.log';
export const SPOKEN_KEY = 'jarvis.kalshi.spoken';
export const MIN_GAP_S = 30, PER_HOUR = 8, TTL_S = 300, BATCH = 3;
export const STALE_S = 15 * 60;
export const DEF = { on: true, floor: 40, dayLoss: 0.1, quiet: { on: false, from: '23:00', to: '06:00' } };
const BIG_LOSS = 2, FAVOURITE = 0.9;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + 's'}`;
const lines = (...a) => a.filter((x) => x != null && x !== '').join('\n');
export const usd = (v, sign) => { const x = num(v); if (x == null) return null; return (sign && x > 0.004 ? '+' : x < -0.004 ? '-' : '') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: Math.abs(x) < 1000 ? 2 : 0, maximumFractionDigits: Math.abs(x) < 1000 ? 2 : 0 }); };
const pc = (x, d) => (num(x) == null ? null : `${(x * 100).toFixed(d == null ? 0 : d)}%`);
const sayAmt = (v) => { const x = num(v); if (x == null) return null; const w = Math.abs(Math.round(x)); return `${w.toLocaleString('en-US')} dollar${w === 1 ? '' : 's'}`; };
const saySigned = (v) => { const x = num(v); if (x == null) return null; if (Math.abs(x) < 0.5) return 'flat'; return (x > 0 ? 'up ' : 'down ') + sayAmt(x); };
const ageText = (s) => { s = Math.max(0, Math.round(s)); return s < 90 ? `${s} seconds` : s < 5400 ? `${Math.round(s / 60)} minutes` : s < 172800 ? `${(s / 3600).toFixed(1).replace(/\.0$/, '')} hours` : `${Math.round(s / 86400)} days`; };
const p2 = (n) => String(n).padStart(2, '0');

const ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
export function etOf(ms) {
  const p = {};
  for (const x of ETF.formatToParts(new Date(ms))) p[x.type] = x.value;
  const h = +p.hour % 24, m = +p.minute;
  return { y: +p.year, mo: +p.month, d: +p.day, h, m, min: h * 60 + m, ymd: `${p.year}-${p2(+p.month)}-${p2(+p.day)}` };
}

// ------------------------------------------------------------------------------------------------ the snapshot
const tradeKey = (t) => [num(t.t) || '', str(t.ticker, 80), str(t.side, 8).toLowerCase(), num(t.contracts) != null ? num(t.contracts) : ''].join('|');
const band = (r) => (r == null ? '' : r >= 0.5 ? 'high' : r >= 0.15 ? 'medium' : 'low');
const RUIN_WORD = { low: 'low', medium: 'medium', high: 'high' };
/** feed = kalshi.json (or null); data = { edges, log, learned } as given to setData. Everything is optional: no engine files = the feed's own numbers. */
export function snapshot(feed, data, now) {
  const f = isObj(feed) ? feed : null, d = isObj(data) ? data : {}, E = isObj(d.edges) ? d.edges : null, bk = E && isObj(E.book) ? E.book : {};
  if (!f && !E) return { ok: false, now };
  const t = f ? num(f.t) : E ? num(E.t) : null, status = f ? str(f.status, 60) : str(bk.status, 60);
  const running = f ? (f.running === false ? false : f.running === true ? true : null) : typeof bk.running === 'boolean' ? bk.running : null;
  const paused = running === false || /paus|stop/i.test(status);
  const balance = f ? num(f.balance) : num(bk.balance), today = f ? num(f.today_pnl) : num(bk.today);
  const edges = E ? arr(E.edges).filter((e) => isObj(e) && typeof e.id === 'string') : [];
  const byId = {};
  for (const e of edges) byId[e.id] = e;
  const L = E && isObj(E.lists) ? E.lists : {};
  const pick = (ids) => arr(ids).map((id) => byId[id]).filter(Boolean).map((e) => ({ id: e.id, label: str(e.label, 100), n: num(e.n), w: num(e.w), p: num(e.p), ev: num(e.ev), pnl: num(e.pnl), stake: num(e.stake), kq: num(e.kelly_q), status: str(e.status, 12), advice: str(e.advice, 10), lo: num(e.lo), pts: num(e.pts) }));
  const log = isObj(d.log) ? arr(d.log.entries) : arr(d.log);
  const lessons = log.filter((x) => isObj(x) && (x.kind === 'learned' || x.kind === 'changed') && (x.advice === 'do_more' || x.advice === 'stop') && str(x.text, 200)).slice(-40)
    .map((x) => ({ ek: str(x.ek, 120) || str(x.text, 80), text: str(x.text, 200), advice: x.advice, d: str(x.d, 10), id: x.id || null }));
  const today_ymd = E ? str(E.day, 10) : '';
  const ruin = num(bk.ruin_now), open = today != null && balance != null ? balance - today : null;
  const trades = f ? arr(f.trades).filter(isObj) : [];
  const dayLossFrac = today != null && today < 0 && open > 0 ? -today / open : 0;
  return {
    ok: true, now, t, age: t != null ? Math.max(0, now / 1000 - t) : null, stale: t != null && now / 1000 - t > STALE_S, live: !!f,
    running, paused, status, mode: f ? str(f.mode, 12).toLowerCase() : str(bk.mode, 12).toLowerCase(), balance, today, week: f ? num(f.week_pnl) : num(bk.week), total: f ? num(f.total_pnl) : num(bk.total),
    positions: f ? arr(f.positions).filter(isObj).length : arr(bk.positions).length, dayLossFrac,
    trades: trades.map(tradeKey),
    losses: trades.filter((x) => num(x.pnl) != null && num(x.pnl) <= -BIG_LOSS).map((x) => ({ key: tradeKey(x), pnl: num(x.pnl), price: num(x.price) > 1 ? num(x.price) / 100 : num(x.price), title: str(x.title, 100) || str(x.ticker, 60), market: str(x.category, 30) })),
    ruin, ruinBand: band(ruin), ruinKelly: num(bk.ruin_kelly), stakeFrac: num(bk.stake_frac), stakeAvg: num(bk.stake_avg), kellyBook: num(bk.kelly_book), w: num(bk.w), p: num(bk.p), ev: num(bk.ev),
    worstDay: num(bk.worst_day), pnl7: num(bk.pnl7), regime: E && isObj(E.regime) ? str(E.regime.state, 12) : '', regimeWhy: E && isObj(E.regime) ? str(E.regime.why, 160) : '',
    doMore: pick(L.do_more), stop: pick(L.stop), watch: pick(L.watch), board: pick(L.board), counts: E && isObj(E.counts) ? { doMore: num(E.counts.do_more) || 0, stop: num(E.counts.stop) || 0, watch: num(E.counts.watch) || 0, proven: num(E.counts.proven) || 0, edges: num(E.counts.edges) || 0 } : null,
    ledger: E && isObj(E.ledger) ? { n: num(E.ledger.n), total: num(E.ledger.bets_total) } : null, engineDay: today_ymd, lessons, learned: isObj(d.learned) ? d.learned : null,
    todayLessons: log.filter((x) => isObj(x) && x.d === today_ymd && (x.kind === 'learned' || x.kind === 'changed') && str(x.text, 200)).map((x) => ({ text: str(x.text, 200), advice: x.advice || null, id: x.id || null })),
    ymd: etOf(now).ymd,
  };
}
function compact(s) { return { ok: s.ok, t: s.t, paused: s.paused, balance: s.balance, dayLossFrac: s.dayLossFrac, trades: s.trades, ruinBand: s.ruinBand, ek: s.lessons.map((x) => x.ek), eng: !!s.counts, ymd: s.ymd }; }

// ------------------------------------------------------------------------------------------------ the diff: two snapshots -> alerts
const EV = (kind, level, p, key, text, say, extra) => Object.assign({ kind, bot: 'kalshi', level, p, key, group: 'kalshi:' + kind, cool: 0, text, say: say || text }, extra || {});
export function diff(prev, cur, now, settings) {
  if (!cur || !cur.ok || !cur.live) return [];                         // only a live reading speaks (an engine copy alone says nothing about the bot)
  const P = prev && prev.ok ? prev : null;
  if (!P) return [];                                                   // the first look: a baseline, never a burst of old news
  const S = Object.assign({}, DEF, isObj(settings) ? settings : {});
  const out = [], ymd = cur.ymd;
  if (!P.paused && cur.paused) out.push(EV('paused', 'warn', 2.0, `paused:${cur.t}`, `The Kalshi bot paused${cur.status ? ` (${cur.status})` : ''}.`, 'The Kalshi bot just paused.', { cool: 600 }));
  if (P.paused && !cur.paused) out.push(EV('resumed', 'ok', 3.2, `resumed:${cur.t}`, 'The Kalshi bot is running again.', 'The Kalshi bot is running again.', { cool: 600 }));
  const fl = num(S.floor);
  if (fl != null && cur.balance != null && P.balance != null && P.balance >= fl && cur.balance < fl)
    out.push(EV('floor', 'bad', 2.1, `floor:${fl}:${ymd}`, `Kalshi balance ${usd(cur.balance)} is under your ${usd(fl)} floor.`, `Kalshi is under your floor. Balance ${sayAmt(cur.balance)}.`, { cool: 3600 }));
  const dl = num(S.dayLoss);
  if (dl != null && cur.dayLossFrac >= dl && (P.dayLossFrac || 0) < dl)
    out.push(EV('dayloss', 'bad', 2.2, `dayloss:${ymd}`, `Kalshi is down ${pc(cur.dayLossFrac)} today (${usd(cur.today, true)}): over your ${pc(dl)} daily limit.`, `Kalshi is down ${pc(cur.dayLossFrac)} today. That is over your daily limit.`, { cool: 6 * 3600 }));
  const known = new Set(arr(P.trades));
  for (const l of cur.losses) {
    if (known.has(l.key) || l.price == null || l.price < FAVOURITE) continue;
    const c = Math.round(l.price * 100);
    out.push(EV('bigloss', 'bad', 2.3, `bigloss:${l.key}`, `A ${c}c favourite lost: ${l.title}: ${usd(l.pnl, true)}.`, `Kalshi: a ${c} cent favourite just lost. Down ${sayAmt(l.pnl)}.`, { cool: 600 }));
  }
  const seenEk = new Set(arr(P.ek)), fresh = P.eng ? cur.lessons.filter((x) => !seenEk.has(x.ek)) : [];       // a baseline taken before the engine's files loaded must not call the whole log new
  if (fresh.length) {
    const first = fresh[0], more = fresh.length - 1;
    out.push(EV('lesson', first.advice === 'stop' ? 'warn' : 'ok', 3.5, `lesson:${first.ek}`, `Kalshi learned something new: ${first.text}${more ? ` (and ${plural(more, 'more lesson')})` : ''}.`,
      `Kalshi learned something new. ${first.advice === 'stop' ? 'Stop' : 'Do more'}: ${lessonSay(first)}.${more ? ` And ${plural(more, 'more lesson')}.` : ''}`, { cool: 900 }));
  }
  if (P.ruinBand && cur.ruinBand && P.ruinBand !== cur.ruinBand) {
    const up = ['low', 'medium', 'high'].indexOf(cur.ruinBand) > ['low', 'medium', 'high'].indexOf(P.ruinBand);
    out.push(EV('ruin', up ? 'warn' : 'ok', 3.0, `ruin:${cur.ruinBand}:${ymd}`, `Kalshi's risk of ruin went ${up ? 'up' : 'down'} to ${RUIN_WORD[cur.ruinBand]} (about ${pc(cur.ruin)} chance of losing half at this bet size).`,
      `Kalshi's risk of ruin went ${up ? 'up' : 'down'} to ${RUIN_WORD[cur.ruinBand]}.`, { cool: 6 * 3600 }));
  }
  return out;
}
const lessonSay = (x) => String(x.text || '').replace(/^(Learned|Update|Crumbled|Fading|Growing|Steady):\s*/, '').replace(/\s*:\s*(DO MORE|STOP|KEEP|WATCH)\s*$/, '').replace(/EV [+-]\$[\d.]+ per \$1 over/, 'over').replace(/ · /g, ', ');

// ------------------------------------------------------------------------------------------------ the words
const edgeLine = (e) => `${e.label}: ${e.n} bets, won ${pc(e.w, 1)} against the market's ${pc(e.p, 1)}, ${e.ev == null ? '' : `${e.ev >= 0 ? '+' : '-'}$${Math.abs(e.ev).toFixed(Math.abs(e.ev) < 0.0095 ? 3 : 2)} per $1`}${e.pnl != null ? ` (${usd(e.pnl, true)} in all)` : ''}`;
const edgeSay = (e) => `${e.label.replace(/ · /g, ', ')}: ${e.n} bets, ${e.pnl != null ? saySigned(e.pnl) : 'no total'}`;
const SUGGEST = 'Suggestion, your call: I never place or change an order.';
const NEEDS = { text: 'I cannot see the Kalshi bot or its engine right now, so I will not guess. Open Kalshi City once and ask me again.', speak: 'I cannot see Kalshi right now.', intent: 'kalshi_nodata' };
function runWord(s) { return s.paused ? (/paus/i.test(s.status) ? 'paused' : 'stopped') : s.stale ? 'not updating' : 'running'; }
function card(s) {
  const kv = [['Bot', runWord(s)], ['Balance', usd(s.balance) || 'missing'], ['Today', usd(s.today, true) || 'missing']];
  if (s.counts) kv.push(['Edges', `${s.counts.doMore} do more · ${s.counts.stop} stop`]);
  if (s.ruin != null) kv.push(['Ruin risk', s.ruin >= 0.995 ? '~100%' : pc(s.ruin)]);
  return { title: 'Kalshi City', kv, open: 'kalshicity' };
}
function ruinText(s) {
  if (s.ruin == null) return null;
  return `At the average bet (${usd(s.stakeAvg)}${s.stakeFrac != null ? `, ${pc(s.stakeFrac)} of the bankroll` : ''}) the chance of losing half the bankroll is ${s.ruin >= 0.995 ? 'about 100%' : 'up to ' + pc(s.ruin)}${s.kellyBook != null && s.kellyBook <= 0 ? ': across everything the bot does, wins have not beaten the break-even rate after fees' : ''}.`;
}
function ruinRows(s) {
  const r = s.learned && isObj(s.learned.ruin) ? arr(s.learned.ruin.rows) : [];
  return r.filter((x) => isObj(x) && num(x.p_ruin) != null && /1 contract|3 contracts|6 contracts|2%|5%/.test(str(x.policy, 40)));
}
const norm = (raw) => String(raw == null ? '' : raw).toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9$&%'.:+\- ]+/g, ' ').replace(/\s+/g, ' ').replace(/[.:?!]+$/g, '').trim()
  .replace(/^(hey |hi |ok |okay |yo )?jarvis\s+(?=\S)/, '').replace(/\s+jarvis$/, '').replace(/^(please|can you|could you|would you|tell me|let me know|so)\s+(?=\S)/, '').replace(/\s+please$/, '').trim();
const KAL = /\b(kalshi|kalshis|kal shi|kalshee|calshi|cal she|kal she|call she)\b/;
const NQ = /\b(nq|mnq|zlarior|atlas|blitz|micros?|eval|mffu|topstep|futures)\b/;

/** the ask-anything answers; null = not a Kalshi question. extra = { set, settings } for the alert switches. */
export function answer(raw, snap, now, extra) {
  const q = norm(raw), x = isObj(extra) ? extra : {};
  if (!q) return null;
  const kal = KAL.test(q), R = (text, speak, intent, s) => ({ text, speak, intent, cards: s && s.ok ? [card(s)] : undefined });
  // the alert switches
  if (kal && /\balerts?\b|\b(mute|unmute|silence|quiet)\b/.test(q) && typeof x.set === 'function') {
    const off = /\b(off|mute|silence|stop|quiet|disable|no more)\b/.test(q) && !/\b(on|unmute|enable|turn on|back)\b/.test(q);
    const m = /\bfloor\b.*?\$?(\d+(?:\.\d+)?)/.exec(q), d = /\bdaily (loss|limit).*?(\d+(?:\.\d+)?)\s*%/.exec(q);
    if (m) { x.set({ floor: +m[1] }); return R(`Done: I will tell you when Kalshi drops under $${+m[1]}.`, `Done. I will tell you when Kalshi drops under ${+m[1]} dollars.`, 'kalshi_alerts'); }
    if (d) { x.set({ dayLoss: +d[2] / 100 }); return R(`Done: a Kalshi daily loss over ${+d[2]}% will be flagged.`, `Done. A daily loss over ${+d[2]} percent will be flagged.`, 'kalshi_alerts'); }
    const s2 = x.set({ on: !off });
    return R(s2.on ? `Kalshi alerts are on: paused or resumed, the balance floor (${usd(s2.floor)}), a daily loss over ${pc(s2.dayLoss)}, a big loss, new lessons, the risk of ruin.` : 'Kalshi alerts are off. Say "turn Kalshi alerts on" to bring them back.', s2.on ? 'Kalshi alerts are on.' : 'Kalshi alerts are off.', 'kalshi_alerts');
  }
  const sizeQ = /\b(how much (should|do|can|would) (i|we) (bet|stake|put|risk|wager|trade)|how much to (bet|stake|risk)|bet size|stake size|position size|what size|how big (a |should)|kelly|how many contracts)\b/.test(q) && (kal || !NQ.test(q));
  const learnQ = /\b(learn|learned|learnt|lessons?|taught|discover\w*|found out)\b/.test(q) && (kal || /\b(city|engine|edges?)\b/.test(q)) && !NQ.test(q.replace(/kalshi/g, ''));
  const stopQ = (kal || /\bedges?\b/.test(q)) && /\b(stop|quit|drop|cut|avoid|kill|turn off|shut off|lose money|losing|worst)\b/.test(q) && !/\b(stop loss|stop order|stopped out)\b/.test(q);
  const bestQ = (kal || /\bedges?\b/.test(q)) && /\b(best|strongest|top|biggest|working|works|make money|makes money|earn|profitable|winning|edge)\b/.test(q) && !stopQ;
  const riskQ = kal && /\b(risks?|risky|ruin|bust|blow ?up|blown|safe|safety|danger\w*|lose it all|worried|worry|exposed|exposure)\b/.test(q);
  const runQ = kal && /\b(is|are|was)\b.*\b(running|trading|paused|on|up|live|working|alive|stopped|off|down|connected)\b/.test(q);
  const howQ = kal && /\b(how|status|doing|going|ok|okay|update|report|summary|state)\b/.test(q);
  if (!(sizeQ || learnQ || stopQ || bestQ || riskQ || runQ || howQ)) return null;
  if (!snap || !snap.ok) return Object.assign({}, NEEDS);
  const s = snap, note = s.live ? '' : ' (This is the engine\'s copy: the live feed is not answering.)';
  if (sizeQ) {
    const rows = ruinRows(s), top = s.doMore[0];
    const t = [];
    t.push(SUGGEST);
    if (s.balance != null) t.push(`Bankroll ${usd(s.balance)}. Your average bet is ${usd(s.stakeAvg) || 'unknown'}${s.stakeFrac != null ? ` (${pc(s.stakeFrac)} of it)` : ''}.`);
    if (rows.length) t.push('The research says the chance of busting (under $6) in 90 days is ' + rows.map((r) => `${pc(r.p_ruin, r.p_ruin < 0.01 ? 1 : 0)} at ${str(r.policy, 30).replace(/ \(today\)/, '').replace('fixed ', '')}`).join(', ') + '.');
    if (s.kellyBook != null && s.kellyBook <= 0) t.push('Across everything the bot does there is no edge after fees, so the Kelly size for the whole book is zero. Only proven edges deserve a stake.');
    if (top && top.stake > 0) t.push(`The strongest proven edge is ${top.label}: a quarter-Kelly stake is about ${usd(top.stake)} (${pc(top.kq, 1)} of the bankroll). Never more than that.`);
    else t.push('No edge is proven strongly enough for a Kelly stake yet, so the safe answer is the smallest bet you can make: 1 contract.');
    t.push('Rule of thumb from the research: 1 to 3 contracts (2% to 5% of the bankroll), and size down after losses, not up after wins.');
    const sp = `${top && top.stake > 0 ? `Suggestion, your call. The strongest edge, ${top.label.replace(/ · /g, ', ')}, supports about ${sayAmt(top.stake)} a bet. ` : 'Suggestion, your call. No edge is proven strongly enough for a Kelly stake yet, so stay small. '}The research says one to three contracts, two to five percent of the bankroll.`;
    return R(lines(...t), sp, 'kalshi_size', s);
  }
  if (learnQ) {
    const L = s.todayLessons;
    if (!L.length) return R(`The Kalshi City engine has no new lesson for ${s.engineDay || 'today'}.${s.counts ? ` It has proven ${s.counts.proven} edges: ${s.counts.doMore} to do more, ${s.counts.stop} to stop.` : ''}`, 'Nothing new learned today.', 'kalshi_learned', s);
    const top = L.filter((l) => l.advice === 'do_more' || l.advice === 'stop').concat(L.filter((l) => !(l.advice === 'do_more' || l.advice === 'stop'))).slice(0, 4);
    return R(lines(`What the Kalshi City engine learned (${s.engineDay}):`, ...top.map((l) => '• ' + l.text), L.length > top.length ? `…and ${L.length - top.length} more in the log.` : '', 'It is measuring the bot\'s own bets, not predicting markets.'),
      `The engine learned ${plural(L.length, 'thing')}. ${top.slice(0, 2).map((l) => lessonSay(l)).join('. ')}.`, 'kalshi_learned', s);
  }
  if (stopQ) {
    const st = s.stop.slice(0, 3), w = s.watch.length;
    const res = s.learned ? arr(s.learned.negative).filter((z) => /90-95c|XRP/.test(z)).slice(0, 2) : [];
    const t = [SUGGEST];
    if (st.length) t.push('Proven to lose money (stop):', ...st.map((e) => '• ' + edgeLine(e)));
    else t.push('Nothing is proven to lose yet.');
    if (w) t.push(`${plural(w, 'more edge')} ${w === 1 ? 'is' : 'are'} fading or losing without proof: do not add size there.`);
    if (res.length) t.push(`The research also found ${res.join(' and ')} negative after fees.`);
    return R(lines(...t), st.length ? `Suggestion, your call. Stop ${st.map((e) => edgeSay(e)).join('. And ')}.${w ? ` ${plural(w, 'more edge')} to watch.` : ''}` : `Suggestion, your call. Nothing is proven to lose yet.${w ? ` ${plural(w, 'edge')} to watch.` : ''}`, 'kalshi_stop', s);
  }
  if (bestQ) {
    const top = s.doMore.slice(0, 2), pool = top.length ? top : s.board.slice(0, 1), t = [];
    if (!pool.length) return R('No edge has 30 bets yet, so I cannot name a best one. The city is still collecting.' + note, 'No edge has enough bets yet.', 'kalshi_best', s);
    t.push(top.length ? 'Your best proven edge' + (top.length > 1 ? 's' : '') + ':' : 'Nothing is proven beyond luck yet. The leader so far:', ...pool.map((e) => '• ' + edgeLine(e) + (e.stake > 0 ? `; quarter-Kelly stake about ${usd(e.stake)}` : '')));
    t.push('It is a thin edge: fees are the whole story on Kalshi. ' + SUGGEST);
    return R(lines(...t) + note, `${top.length ? 'Your best proven edge is' : 'The leader so far, not proven, is'} ${edgeSay(pool[0])}. Suggestion, your call.`, 'kalshi_best', s);
  }
  if (riskQ) {
    const rr = ruinRows(s), t = ['Kalshi risks:'];
    const r1 = ruinText(s);
    if (r1) t.push('• ' + r1);
    if (s.paused) t.push(`• The bot is ${runWord(s)}.`);
    if (s.dayLossFrac >= 0.05) t.push(`• Today it is down ${pc(s.dayLossFrac)} of the day's opening balance.`);
    if (s.worstDay != null) t.push(`• Worst day so far ${usd(s.worstDay, true)}; the weather is ${s.regime || 'unknown'}${s.regimeWhy ? ` (${s.regimeWhy})` : ''}.`);
    if (rr.length) t.push('• The research: busting (under $6) within 90 days is ' + rr.map((r) => `${pc(r.p_ruin, r.p_ruin < 0.01 ? 1 : 0)} at ${str(r.policy, 30).replace(/ \(today\)/, '').replace('fixed ', '')}`).join(', ') + '.');
    t.push('One loss at 98c erases about 50 wins: the risk is the size of the loss, not how often it happens. ' + SUGGEST);
    return R(lines(...t) + note, `${s.ruin != null ? `The risk of losing half the bankroll is ${s.ruin >= 0.995 ? 'about one hundred percent' : 'up to ' + pc(s.ruin)} at the current bet size. ` : ''}${s.paused ? 'The bot is paused. ' : ''}One loss at 98 cents erases about 50 wins. Suggestion, your call: smaller bets.`, 'kalshi_risk', s);
  }
  if (runQ && !howQ || (runQ && /\b(running|paused|trading|on|stopped)\b/.test(q))) {
    const w = runWord(s), yes = w === 'running';
    const text = `${yes ? 'Yes' : 'No'}: the Kalshi bot is ${w}${s.status && w !== 'running' ? ` (status: ${s.status})` : ''}. Last update ${s.age != null ? ageText(s.age) + ' ago' : 'unknown'}.${s.mode ? ` Mode: ${s.mode.toUpperCase()}${s.mode === 'live' ? ' (real money)' : ''}.` : ''}${note}`;
    return R(text, `${yes ? 'Yes' : 'No'}, the Kalshi bot is ${w}.`, 'kalshi_running', s);
  }
  const lead = s.counts ? `${s.counts.doMore} edge${s.counts.doMore === 1 ? '' : 's'} to do more, ${s.counts.stop} to stop, ${s.counts.watch} to watch.` : '';
  const text = lines(`Kalshi${s.mode ? ' (' + s.mode.toUpperCase() + ')' : ''}: ${runWord(s)}, balance ${usd(s.balance) || 'missing'}, today ${usd(s.today, true) || 'missing'}${s.week != null ? `, this week ${usd(s.week, true)}` : ''}${s.total != null ? `, all time ${usd(s.total, true)}` : ''}.`,
    s.regime ? `Weather: ${s.regime}${s.regimeWhy ? ` (${s.regimeWhy})` : ''}.` : '', lead ? `Edges: ${lead}` : '', ruinText(s), s.headlineLesson || '') + note;
  const sp = `Kalshi is ${runWord(s)}. Balance ${sayAmt(s.balance) || 'missing'}, ${saySigned(s.today) === 'flat' ? 'flat today' : (saySigned(s.today) || 'today missing') + ' today'}. ${s.counts ? `The engine has ${plural(s.counts.doMore, 'edge')} to do more and ${s.counts.stop} to stop.` : ''}${s.ruin != null && s.ruin >= 0.5 ? ' The risk of ruin is high.' : ''}`;
  return R(text, sp.trim(), 'kalshi_status', s);
}

// ------------------------------------------------------------------------------------------------ "Think for me" items and the Money tile
export function items(s, now) {
  const out = [], add = (p, key, text, say, label, ask) => out.push({ p, mode: 'business', key: 'kalshi:' + key, text, say: say || text, label, action: { type: 'ask', value: ask } });
  if (!s || !s.ok) return out;
  if (s.live && s.paused) add(3.3, 'paused', `The Kalshi bot is ${runWord(s)}${s.status ? ` (${s.status})` : ''}. Nothing trades until you or its server chat resumes it.`, 'The Kalshi bot is paused.', 'Is it running?', 'Is the Kalshi bot running?');
  if (s.ruin != null && s.ruin >= 0.5) add(4.6, 'ruin', `Kalshi's bet size is too big for its bankroll: about ${s.ruin >= 0.995 ? '100%' : pc(s.ruin)} chance of losing half. Suggestion: 1 to 3 contracts.`, 'Kalshi bet size is too big for its bankroll. Suggestion, smaller bets.', 'Risks', 'What are the Kalshi risks?');
  if (s.stop.length) add(5.2, 'stop', `Kalshi: stop ${s.stop[0].label} (${usd(s.stop[0].pnl, true)} over ${s.stop[0].n} bets).${s.stop.length > 1 ? ` ${s.stop.length - 1} more to stop.` : ''}`, `Kalshi: stop ${s.stop[0].label.replace(/ · /g, ', ')}.`, 'What to stop', 'What should I stop doing on Kalshi?');
  if (s.doMore.length) add(5.8, 'best', `Kalshi's best proven edge: ${s.doMore[0].label} (${s.doMore[0].n} bets, ${s.doMore[0].ev != null ? (s.doMore[0].ev >= 0 ? '+' : '-') + '$' + Math.abs(s.doMore[0].ev).toFixed(3) : ''} per $1).`, `Kalshi's best edge is ${s.doMore[0].label.replace(/ · /g, ', ')}.`, 'Best edge', "What's my best Kalshi edge?");
  if (s.todayLessons.length) add(6.4, 'learned', `The Kalshi City engine learned ${plural(s.todayLessons.length, 'thing')} today.`, `The Kalshi engine learned ${plural(s.todayLessons.length, 'thing')} today.`, 'What it learned', 'What did Kalshi learn today?');
  return out.sort((a, b) => a.p - b.p);
}
export function line(s) {
  if (!s || !s.ok) return '';
  const bits = [];
  if (s.counts) bits.push(`${s.counts.doMore} do more · ${s.counts.stop} stop`);
  if (s.ruin != null) bits.push(`ruin risk ${s.ruin >= 0.995 ? '~100%' : pc(s.ruin)}`);
  return bits.join(' · ');
}

// ------------------------------------------------------------------------------------------------ the instance
export function createKalshiBrain(opts) {
  const o = isObj(opts) ? opts : {};
  const store = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const lget = (k, d) => { try { const st = store(), v = st ? st.getItem(k) : null; return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lset = (k, v) => { try { const st = store(); if (st) st.setItem(k, JSON.stringify(v)); } catch (_) { /* not kept */ } };
  const clock = () => (typeof o.now === 'function' ? (o.now() instanceof Date ? o.now().getTime() : +o.now()) : Date.now());
  const call = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : undefined; } catch (_) { return undefined; } };
  let data = { edges: null, log: null, learned: null };
  const settings = () => {
    const s = lget(SET_KEY, null), q = isObj(s) && isObj(s.quiet) ? s.quiet : {};
    return { on: !isObj(s) || s.on !== false, floor: isObj(s) && num(s.floor) != null ? num(s.floor) : DEF.floor, dayLoss: isObj(s) && num(s.dayLoss) != null ? num(s.dayLoss) : DEF.dayLoss,
      quiet: { on: q.on === true, from: /^\d\d:\d\d$/.test(q.from) ? q.from : DEF.quiet.from, to: /^\d\d:\d\d$/.test(q.to) ? q.to : DEF.quiet.to } };
  };
  function set(patch) {
    const cur = settings(), p = isObj(patch) ? patch : {};
    const nx = { on: typeof p.on === 'boolean' ? p.on : cur.on, floor: num(p.floor) != null ? Math.max(0, num(p.floor)) : cur.floor, dayLoss: num(p.dayLoss) != null ? Math.min(1, Math.max(0.01, num(p.dayLoss))) : cur.dayLoss, quiet: { ...cur.quiet, ...(isObj(p.quiet) ? p.quiet : {}) } };
    lset(SET_KEY, nx);
    if (!nx.on) queue.length = 0;
    return settings();
  }
  const inQuiet = (nowMs) => {
    const q = settings().quiet;
    if (!q.on) return false;
    const m = (s) => +s.slice(0, 2) * 60 + +s.slice(3), a = m(q.from), b = m(q.to), t = etOf(nowMs).min;
    return a === b ? false : a < b ? t >= a && t < b : t >= a || t < b;
  };
  const queue = [];
  let last = { snap: null, events: [], reason: '' };
  const seenGet = (nowS) => { const s = lget(SEEN_KEY, {}), out = {}; for (const k of Object.keys(isObj(s) ? s : {})) if (nowS - s[k] < 3 * 86400) out[k] = s[k]; return out; };
  const spokenGet = () => { const s = lget(SPOKEN_KEY, {}); return { groups: isObj(s) && isObj(s.groups) ? s.groups : {}, hours: isObj(s) && Array.isArray(s.hours) ? s.hours.filter((x) => typeof x === 'number') : [], last: isObj(s) && num(s.last) != null ? num(s.last) : 0 }; };
  const maskSay = (s) => String(s || '').replace(/\b\d+(,\d{3})*(\.\d+)? dollars?/g, 'a hidden amount');
  const maskTxt = (s) => String(s || '').replace(/[+-]?\$\d[\d,]*(\.\d+)?/g, '$•••');
  const hidden = () => call(o.hidden) === true;
  const logAdd = (ev, nowMs) => { const log = lget(LOG_KEY, []); log.unshift({ key: ev.key, kind: ev.kind, level: ev.level, text: ev.text, say: ev.say, t: Math.floor(nowMs / 1000) }); lset(LOG_KEY, log.slice(0, 30)); };
  function flush(nowMs) {
    const now = num(nowMs) != null ? num(nowMs) : clock(), nowS = now / 1000, set0 = settings();
    for (let i = queue.length - 1; i >= 0; i--) if (nowS - queue[i].t > TTL_S) queue.splice(i, 1);
    if (!queue.length) return { spoken: [], reason: 'empty' };
    if (!set0.on) { queue.length = 0; return { spoken: [], reason: 'off' }; }
    if (inQuiet(now)) { queue.length = 0; return { spoken: [], reason: 'quiet' }; }
    if (call(o.busy) === true) return { spoken: [], reason: 'busy' };
    const sp = spokenGet();
    if (nowS - sp.last < MIN_GAP_S) return { spoken: [], reason: 'gap' };
    const hours = sp.hours.filter((s) => nowS - s < 3600);
    queue.sort((a, b) => a.ev.p - b.ev.p);
    let pick = queue.filter((it) => !(it.ev.cool && sp.groups[it.ev.group] && nowS - sp.groups[it.ev.group] < it.ev.cool));
    for (const it of queue) if (!pick.includes(it)) it.drop = true;
    if (hours.length >= PER_HOUR) pick = pick.filter((it) => it.ev.p < 2.7);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].drop) queue.splice(i, 1);
    if (!pick.length) return { spoken: [], reason: hours.length >= PER_HOUR ? 'hourly' : 'cooldown' };
    const take = pick.slice(0, BATCH), say = take.map((it) => it.ev.say).join(' ');
    const r = call(o.speak, hidden() ? maskSay(say) : say, { events: take.map((it) => it.ev) });
    if (r === 'hidden') return { spoken: [], reason: 'hidden' };
    for (const it of take) queue.splice(queue.indexOf(it), 1);
    if (r === 'spoken' || r === 'pending') {
      const groups = { ...sp.groups };
      for (const it of take) groups[it.ev.group] = nowS;
      for (const k of Object.keys(groups)) if (nowS - groups[k] > 86400) delete groups[k];
      lset(SPOKEN_KEY, { groups, hours: hours.concat([nowS]), last: nowS });
      return { spoken: take.map((it) => it.ev), reason: r };
    }
    return { spoken: [], reason: String(r || 'none') };
  }
  function offer(events, nowMs) {
    const nowS = nowMs / 1000, seen = seenGet(nowS), fresh = [];
    for (const ev of events) {
      if (seen[ev.key]) continue;
      seen[ev.key] = nowS; fresh.push(ev);
      logAdd(ev, nowMs);
      call(o.onEvent, hidden() ? { ...ev, text: maskTxt(ev.text), say: maskSay(ev.say) } : ev);
      queue.push({ ev, t: nowS });
    }
    lset(SEEN_KEY, seen);
    return fresh;
  }
  const snap = (feed, now) => snapshot(feed, data, num(now) != null ? num(now) : clock());
  function tick(feed, nowMs) {
    const now = num(nowMs) != null ? num(nowMs) : clock(), s = snap(feed, now);
    last.snap = s;
    let events = [];
    if (s.ok && s.live) {
      const prev = lget(SNAP_KEY, null);
      events = offer(diff(prev && prev.ok ? prev : null, s, now, settings()), now);
      lset(SNAP_KEY, compact(s));
    }
    last.events = events;
    const f = flush(now);
    last.reason = f.reason;
    return { snap: s, events, spoken: f.spoken, reason: f.reason };
  }
  return {
    setData(d) { const x = isObj(d) ? d : {}; data = { edges: isObj(x.edges) ? x.edges : data.edges, log: x.log != null ? x.log : data.log, learned: isObj(x.learned) ? x.learned : data.learned }; },
    data: () => data, tick, flush, settings, set, snapshot: snap, answer: (raw, q, feed, now) => { const t = num(now) != null ? num(now) : clock(); return answer(raw, snap(feed, t), t, { set, settings }); },
    items: (feed, now) => items(snap(feed, now), num(now) != null ? num(now) : clock()), line: (feed, now) => line(snap(feed, now)),
    log: () => lget(LOG_KEY, []), queued: () => queue.map((it) => it.ev), last: () => last,
    reset() { for (const k of [SNAP_KEY, SEEN_KEY, LOG_KEY, SPOKEN_KEY]) { try { const st = store(); if (st) st.removeItem(k); } catch (_) { /* nothing kept */ } } queue.length = 0; },
  };
}
export default createKalshiBrain;
