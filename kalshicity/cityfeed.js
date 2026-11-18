// KALSHI CITY data layer (pure ES module: no DOM, no three.js, runs in node for the tests).
// Inputs: edges.json (tools/kalshi_edges.py: the learning engine's output), learning_log.json, and optionally the live kalshi.json feed
// (the bot's own numbers, read only). Output: one plain Model the layout, the scene and the page read. Junk in -> safe defaults, never a throw.

export const RAW = 'https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json';
export const MIN_N = 30;
export const BOT_FEED_MAX_AGE_S = 15 * 60; // match the Kalshi feed page: old running/paused bits cannot describe the bot now
/**
 * Jarvis freshness follows the older of the published edge snapshot and the bot report.
 * Missing or stale bot verification stays warning-level and never gets a fresh page-time stamp.
 */
export function cardFreshness(model, demo = false, now = Date.now() / 1000) {
  const book = model && model.book ? model.book : {};
  const valid = (t) => Number.isFinite(t) && t > 0 && t <= now + 300;
  const edgeT = valid(model && model.t) ? model.t : null;
  const feedT = valid(book.feedT) ? book.feedT : null;
  const sourceT = edgeT != null && feedT != null ? Math.min(edgeT, feedT) : null;
  const age = sourceT == null ? Infinity : Math.max(0, now - sourceT);
  const fresh = !demo && book.statusFresh === true && sourceT != null && age <= BOT_FEED_MAX_AGE_S;
  const regime = model && model.regime ? model.regime.state : '';
  const warning = regime === 'rain' || regime === 'storm';
  const counts = model && model.counts ? model.counts : {};
  const label = demo ? 'Demo data' : !fresh ? 'Source unverified' : `${counts.doMore || 0} do more · ${counts.stop || 0} stop`;
  return {
    status: { level: demo ? 'off' : (!fresh || warning ? 'warn' : 'ok'), label },
    t: demo || sourceT == null ? 0 : Math.floor(Math.min(now, sourceT)),
    stale_after: BOT_FEED_MAX_AGE_S,
    sourceVerified: fresh,
  };
}

/** Mention bot state only as a dated/verified report, never as an unqualified live claim. */
export function cardBotStatus(book, sourceVerified, demo = false) {
  if (demo) return 'Demo fixture; no current bot status';
  const reported = book && (book.lastStatus || (book.status && book.status !== 'Status unverified' ? book.status : '') || book.mode);
  const status = reported || 'unavailable';
  return sourceVerified
    ? `Latest verified bot status report: ${status}`
    : `Last reported bot status: ${status} (current state not confirmed by this snapshot)`;
}

/** A fresh published bot state only; a stopped bot is not a paused bot. */
export function worldBotLabel(book, demo = false) {
  if (demo) return 'DEMO DATA';
  if (!book || !book.statusFresh) return 'BOT STATUS UNKNOWN';
  if (book.running === true) return 'BOT RUNNING';
  if (book.running === false && /paus/i.test(book.status)) return 'BOT PAUSED';
  if (book.running === false && /stopp|off/i.test(book.status)) return 'BOT STOPPED';
  return book.running === false ? 'BOT NOT RUNNING' : 'BOT STATUS UNKNOWN';
}
export const STATUS = ['NEW', 'GROWING', 'HOLDING', 'DECAYING', 'DEAD'];
export const STATUS_COLOR = { NEW: '#b9a98c', GROWING: '#a0af6a', HOLDING: '#d9a26b', DECAYING: '#d49759', DEAD: '#ca785c' };
export const STATUS_WORD = {
  NEW: 'Too few bets to judge', GROWING: 'Getting stronger', HOLDING: 'Holding up', DECAYING: 'Fading or unproven', DEAD: 'No edge: stop',
};
export const ADVICE = {
  do_more: { word: 'DO MORE', color: '#a0af6a', text: 'Proven edge: this is where the bot earns. Worth more size, at the Kelly stake below, never more.' },
  keep: { word: 'KEEP', color: '#d9a26b', text: 'Positive so far, not proven beyond luck. Keep it small and keep counting.' },
  watch: { word: 'WATCH', color: '#d49759', text: 'Fading, or losing without proof yet. Do not add size; cut it if the next bets lose.' },
  stop: { word: 'STOP', color: '#ca785c', text: 'Proven to lose money (or losing in every window). The bot should stop doing this.' },
  collect: { word: 'COLLECT', color: '#b9a98c', text: 'Too few bets to say anything. No stake is suggested until it has 30.' },
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n = 80) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ------------------------------------------------------------------ formatting
export const usd = (x, d = 2) => (x == null ? '-' : `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const pct = (x, d = 1) => (x == null ? '-' : `${(x * 100).toFixed(d)}%`);
export const pts = (x) => (x == null ? '-' : `${x >= 0 ? '+' : '-'}${Math.abs(x * 100).toFixed(1)} pts`);
export const evf = (x) => (x == null ? '-' : `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(Math.abs(x) < 0.0095 ? 3 : 2)}`);
export const sgn = (x, d = 2) => (x == null ? '-' : `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(d)}`);

// ------------------------------------------------------------------ the New York clock (the city's day and night)
const ETF = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
export function etHour(ms = Date.now()) {
  if (!ETF) return ((ms / 3600000) % 24 + 24 - 5) % 24;
  const p = {}; ETF.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return (+p.hour % 24) + +p.minute / 60 + +p.second / 3600;
}
export const clockLabel = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 = deep night, 1 = full day, from the New York hour (sunrise about 06:30, sunset about 18:30; the city is a night city, so day is dusk-lit) */
export const dayFactor = (h) => sstep(5.5, 7.5, h) * (1 - sstep(17.5, 19.5, h));
export const phaseWord = (h) => (h < 5 ? 'Night' : h < 7.5 ? 'Dawn' : h < 17.5 ? 'Day' : h < 20 ? 'Dusk' : 'Night');

// ------------------------------------------------------------------ the model
function cleanEdge(e) {
  if (!isObj(e) || typeof e.id !== 'string' || !Array.isArray(e.dims) || e.dims.length !== 5) return null;
  const n = num(e.n) || 0;
  const w = (k) => { const x = isObj(e.win) && isObj(e.win[k]) ? e.win[k] : {}; return { n: num(x.n) || 0, w: num(x.w), ev: num(x.ev), pnl: num(x.pnl) }; };
  return {
    id: e.id, dims: e.dims.map((d) => str(d, 60)), label: str(e.label, 140) || e.id, kind: str(e.kind, 10), size: num(e.size) || 1, n, wins: num(e.wins) || 0,
    w: num(e.w), p: num(e.p), pts: num(e.pts), ev: num(e.ev), pnl: num(e.pnl), staked: num(e.staked), lo: num(e.lo), hi: num(e.hi), z: num(e.z), pv: num(e.pv), sig: str(e.sig, 1),
    win: { d7: w('d7'), d30: w('d30'), led: w('led') }, recent: e.recent || null, decay: num(e.decay),
    kelly: num(e.kelly), kellySafe: num(e.kelly_safe), kellyQ: num(e.kelly_q), stake: num(e.stake), ruin: num(e.ruin),
    status: STATUS.indexOf(e.status) >= 0 ? e.status : 'NEW', advice: ADVICE[e.advice] ? e.advice : 'collect', small: e.small === true || n < MIN_N,
    src: str(e.src, 10), pBasis: str(e.p_basis, 60), first: str(e.first, 10), since: str(e.since, 10), last: str(e.last, 10) || null,
  };
}

// ------------------------------------------------------------------ the research ideas (hypotheses.json: tools/kalshi_hypotheses.py, a paper score for each idea)
export const HYP_WORD = {
  COLLECTING: 'Collecting', 'NEEDS DATA': 'Needs data', PROMISING: 'Promising', WORKS: 'Works', 'NO HELP': 'No help', SAFER: 'Safer',
};
export const HYP_COLOR = { COLLECTING: '#b9a98c', 'NEEDS DATA': '#b9a98c', PROMISING: '#d9a26b', WORKS: '#a0af6a', 'NO HELP': '#ca785c', SAFER: '#a0af6a' };
const HYP_STATUS = { COLLECTING: 'NEW', 'NEEDS DATA': 'NEW', PROMISING: 'HOLDING', WORKS: 'GROWING', 'NO HELP': 'DEAD', SAFER: 'GROWING' };
export const HYP_PARTS = { back: 'Looking back', live: 'Live since the start', prog: 'Live bets collected' };
const cleanWin = (x) => {
  const o = isObj(x) ? x : {};
  return { nAll: num(o.n_all) || 0, nSkip: num(o.n_skip) || 0, gain: num(o.gain) || 0, pnlSkip: num(o.pnl_skip) || 0, w: num(o.w), p: num(o.p), ev: num(o.ev), z: num(o.z), sig: str(o.sig, 1),
    fees: num(o.fees), saved: num(o.saved), feesSkip: num(o.fees_skip), judge: str(o.judge, 12), scale: num(o.scale), total: num(o.total), after: num(o.after), ruinNow: num(o.ruin_now), ruinAfter: num(o.ruin_after),
    worstDay: num(o.worst_day), worstDayAfter: num(o.worst_day_after) };
};
function cleanHyp(h) {
  if (!isObj(h) || typeof h.id !== 'string') return null;
  const word = HYP_WORD[h.word] ? h.word : 'COLLECTING', back = cleanWin(h.back), live = cleanWin(h.live), kind = ['filter', 'fee', 'size', 'data'].indexOf(h.kind) >= 0 ? h.kind : 'filter';
  const judgeStatus = (w) => (HYP_STATUS[w.judge] ? HYP_STATUS[w.judge] : 'NEW');
  const needed = num(h.needed) || 0, nLive = kind === 'filter' ? live.nSkip : live.nAll;
  back.status = kind === 'filter' && back.judge ? (back.judge === 'WORKS' ? 'HOLDING' : judgeStatus(back)) : HYP_STATUS[word];       // looking back never reads WORKS
  live.status = kind === 'filter' && live.nSkip >= MIN_N ? judgeStatus(live) : 'NEW';
  return { id: h.id.slice(0, 24), name: str(h.name, 80) || h.id, short: str(h.short, 20) || str(h.name, 14).toUpperCase(), kind, src: str(h.src, 8), rule: str(h.rule, 260), word, status: HYP_STATUS[word],
    judgedLive: h.judged_live === true, verdict: str(h.verdict, 420), line: str(h.line, 220), needed, nLive, back, live, regDay: str(isObj(h.reg) ? h.reg.day : '', 10),
    hist: arr(h.hist).filter((x) => Array.isArray(x) && x.length >= 4).map((x) => [str(x[0], 10), num(x[1]) || 0, num(x[2]) || 0, num(x[3]) || 0]).slice(-90), covers: arr(h.covers).map((c) => str(c, 80)) };
}
/** hypotheses.json -> { hyps, pair, log, t, day, demo } or null. Junk in -> null / safe defaults. */
export function shapeHyps(doc, demo = false) {
  if (!isObj(doc) || !Array.isArray(doc.hyps)) return null;
  const hyps = doc.hyps.map(cleanHyp).filter(Boolean).slice(0, 12);
  if (!hyps.length) return null;
  const pk = (p) => (isObj(p) && num(p.pnl) != null ? { id: str(p.id, 80), label: str(p.label, 80), pnl: p.pnl, n: num(p.n) || 0, fix: typeof p.fix === 'string' && hyps.some((h) => h.id === p.fix) ? p.fix : null } : null);
  const P = isObj(doc.pair) ? doc.pair : {};
  const log = arr(doc.log).filter(isObj).map((x) => ({ d: str(x.d, 10), t: num(x.t) || 0, kind: str(x.kind, 10), id: str(x.id, 24), text: str(x.text, 240) })).filter((x) => x.text);
  return { hyps, byId: new Map(hyps.map((h) => [h.id, h])), pair: { best: pk(P.best), worst: pk(P.worst) }, log, t: num(doc.t) || 0, day: str(doc.day, 10), demo: !!demo };
}
/** Best edge so far / Worst leak in dollars. The engine's pair wins; without it the model's own proven single-slice edges make one, so it is never blank. */
export function pairOf(m) {
  const P = m.hyp && m.hyp.pair;
  if (P && (P.best || P.worst)) return P;
  const real = m.edges.filter((e) => e.size === 1 && !e.small && e.pnl != null);
  const pick = (e) => (e ? { id: e.id, label: e.label, pnl: e.pnl, n: e.n, fix: null } : null);
  return { best: pick(real.filter((e) => e.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0]), worst: pick(real.filter((e) => e.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0]) };
}
/** the learning ticker: plain-words lines, newest lessons first. `changes` are what moved since the viewer's last visit. */
export function tickerLines(m, changes = []) {
  const out = [...changes], H = m.hyp;
  if (H) {
    H.log.filter((x) => x.kind === 'live').slice(-2).reverse().forEach((x) => out.push(x.text));
    [...H.hyps].sort((a, b) => Math.abs(b.back.gain) - Math.abs(a.back.gain)).forEach((h) => { if (h.line) out.push(h.line); });
  }
  const seen = new Set();
  const lines = out.filter((t) => t && !seen.has(t) && seen.add(t)).map((t) => (H && H.demo ? `Demo: ${t}` : t));
  return lines.length ? lines : ['Nothing tested yet. The first ideas are registered on the next run.'];
}
/** What moved since last time: compares each idea's dollars with the ones the page stored on the previous visit. */
export function changesOf(m, prev) {
  const out = [];
  if (!m.hyp || !prev) return out;
  for (const h of m.hyp.hyps) {
    const a = prev[`${h.id}:live`], b = h.live.gain;
    if (a != null && Math.abs(b - a) >= 0.5) out.push(`Since you were last here, '${h.name}' ${b >= a ? 'grew' : 'shrank'} from ${money(a)} to ${money(b)} on live bets`);
  }
  return out.slice(0, 3);
}
const money = (x) => (x == null ? '-' : `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(2)}`);
/** the tap card of one lab building: part = back | live | prog */
export function hypCardOf(h, part) {
  const rows = [], b = h.back, l = h.live, tone = (x) => (x > 0 ? 'ok' : x < 0 ? 'bad' : 'dim');
  rows.push(['The idea', h.rule, '']);
  if (part === 'back' || part === 'prog') {
    if (h.kind === 'filter') {
      rows.push(['Bets it would skip', `${b.nSkip} of ${b.nAll} seen${b.nSkip < MIN_N ? ' (too few to trust)' : ''}`, b.nSkip < MIN_N ? 'dim' : '']);
      rows.push(['They made', `${money(b.pnlSkip)} after fees${b.feesSkip ? ` (fees on them about $${b.feesSkip.toFixed(2)})` : ''}`, tone(-b.pnlSkip)]);
      rows.push(['Looking back, the rule adds', money(b.gain), tone(b.gain)]);
      if (b.z != null) rows.push(['Is it luck?', b.sig === '-' ? `No: the skipped bets really lose (z ${sgn(b.z)})` : `Could be luck (z ${sgn(b.z)})`, b.sig === '-' ? 'ok' : '']);
    } else if (h.kind === 'fee') {
      rows.push(['Fees paid so far', b.fees == null ? '-' : `about $${b.fees.toFixed(2)}`, 'bad']);
      rows.push(['Could be saved', b.saved == null ? '-' : `up to $${b.saved.toFixed(2)} if every resting order filled`, 'dim']);
    } else if (h.kind === 'size') {
      rows.push(['Same bets, smaller size', `${money(b.after)} instead of ${money(b.total)}`, tone(b.gain)]);
      if (b.worstDayAfter != null) rows.push(['Worst day', `${usd(b.worstDayAfter)} instead of ${usd(b.worstDay)}`, 'ok']);
      if (b.ruinAfter != null) rows.push(['Chance of losing half', `${pct(b.ruinAfter, 0)} instead of ${pct(b.ruinNow, 0)}`, b.ruinAfter < 0.3 ? 'ok' : 'bad']);
    } else rows.push(['Why nothing yet', 'It needs free public spot candles joined to the bets; the feed does not carry them.', 'dim']);
  }
  if (part === 'live' || part === 'prog') {
    const n = h.kind === 'filter' ? l.nSkip : l.nAll;
    rows.push([`Live since ${h.regDay || 'the start'}`, h.kind === 'filter' ? `${l.nSkip} skipped bets of ${l.nAll} new` : `${l.nAll} new bets`, n < MIN_N ? 'dim' : '']);
    rows.push(['Live paper result', h.kind === 'filter' || h.kind === 'fee' || h.kind === 'size' ? `${money(l.gain)}${n < MIN_N && h.kind === 'filter' ? ' (too few to judge)' : ''}` : '-', tone(l.gain)]);
    if (h.needed) rows.push(['Live bets needed', `${n} of ${h.needed}${n >= h.needed ? ': enough' : ''}`, n >= h.needed ? 'ok' : 'dim']);
  }
  rows.push(['Where it comes from', h.src === 'feed' ? "the bot's own totals (looking back); live = what the totals grew by since the idea was registered" : h.src === 'ledger' ? 'the bets the engine read one by one' : 'no data yet', 'dim']);
  return { title: `${h.name}: ${HYP_PARTS[part].toLowerCase()}`, word: HYP_WORD[h.word], color: HYP_COLOR[h.word], rows, verdict: h.verdict,
    banner: h.judgedLive ? '' : 'Looking back only: the rule was picked after seeing these bets, so this alone proves nothing. Only live bets can.' };
}

/** edges.json (+ the learning log, + the live feed, + hypotheses.json) -> the Model. */
export function shape(edgesDoc, logDoc, live, now = Date.now() / 1000, hypDoc = null, hypDemo = false) {
  if (!isObj(edgesDoc) || !Array.isArray(edgesDoc.edges)) return null;
  const edges = edgesDoc.edges.map(cleanEdge).filter(Boolean);
  const byId = new Map(edges.map((e) => [e.id, e]));
  const b0 = isObj(edgesDoc.book) ? edgesDoc.book : {};
  const book = {
    name: str(b0.name, 40) || 'Kalshi bot', mode: str(b0.mode, 12), running: typeof b0.running === 'boolean' ? b0.running : null, status: str(b0.status, 80), note: str(b0.note, 80),
    feedT: num(b0.feed_t), balance: num(b0.balance), today: num(b0.today), week: num(b0.week), total: num(b0.total), pnl7: num(b0.pnl7), pnl30: num(b0.pnl30),
    winDays7: num(b0.win_days7), days7: num(b0.days7), worstDay: num(b0.worst_day), bestDay: num(b0.best_day), betsTotal: num(b0.bets_total) || 0,
    w: num(b0.w), p: num(b0.p), ev: num(b0.ev), stakeAvg: num(b0.stake_avg), stakeFrac: num(b0.stake_frac), kellyBook: num(b0.kelly_book), ruinNow: num(b0.ruin_now), ruinKelly: num(b0.ruin_kelly),
    days: arr(b0.days).filter((d) => Array.isArray(d)).map((d) => [str(d[0], 10), num(d[1]) || 0]),
    equity: arr(b0.equity).filter((q) => Array.isArray(q) && num(q[1]) != null).map((q) => [num(q[0]) || 0, q[1]]),
    positions: arr(b0.positions).filter(isObj).map((q) => ({ ticker: str(q.ticker, 64), title: str(q.title, 90), market: str(q.market, 40) || 'Other', strategy: str(q.strategy, 60), side: str(q.side, 8),
      contracts: num(q.contracts), price: num(q.price), closes: num(q.closes) })),
    recent: arr(b0.recent).filter(isObj).map((q) => ({ t: num(q.t) || 0, market: str(q.market, 40), strategy: str(q.strategy, 60), side: str(q.side, 8), price: num(q.price), pnl: num(q.pnl) || 0 })),
    calibration: arr(b0.calibration).filter(isObj).map((q) => ({ p: num(q.p), n: num(q.n) || 0, hit: num(q.hit) })),
  };
  const reg = isObj(edgesDoc.regime) ? edgesDoc.regime : {};
  const regime = { state: ['storm', 'rain', 'overcast', 'clear'].indexOf(reg.state) >= 0 ? reg.state : 'overcast', paused: reg.paused === true, why: str(reg.why, 160) };
  let liveUsed = false;
  if (isObj(live) && live.kind === 'kalshi' && (num(live.t) || 0) >= (book.feedT || 0)) {            // the bot's own fresher numbers win over the engine's copy
    liveUsed = true;
    book.balance = num(live.balance) != null ? live.balance : book.balance;
    book.feedT = num(live.t) || book.feedT;
    book.today = num(live.today_pnl) != null ? live.today_pnl : book.today;
    book.week = num(live.week_pnl) != null ? live.week_pnl : book.week;
    book.total = num(live.total_pnl) != null ? live.total_pnl : book.total;
    book.status = str(live.status, 80) || book.status;
    if (typeof live.running === 'boolean') book.running = live.running;
    book.positions = arr(live.positions).filter(isObj).slice(0, 20).map((q) => ({ ticker: str(q.ticker, 64), title: str(q.title, 90), market: str(q.category, 40) || 'Other', strategy: str(q.strategy, 60),
      side: str(q.side, 8).toLowerCase(), contracts: num(q.contracts), price: num(q.price) > 1 ? q.price / 100 : num(q.price), closes: typeof q.closes === 'number' ? q.closes : null }));
    regime.paused = book.running === false || /paus/i.test(book.status);
  }
  book.feedAge = book.feedT == null ? null : Math.max(0, now - book.feedT);
  book.statusFresh = book.feedAge != null && book.feedAge <= BOT_FEED_MAX_AGE_S && book.feedT <= now + 300;
  if (!book.statusFresh) {
    book.lastStatus = book.status;
    book.running = null;
    book.status = 'Status unverified';
    regime.paused = false; // stale evidence cannot say whether the bot is paused now
  }
  const L = isObj(edgesDoc.lists) ? edgesDoc.lists : {};
  const ids = (k) => arr(L[k]).filter((id) => byId.has(id));
  const entries = isObj(logDoc) ? arr(logDoc.entries) : arr(logDoc);
  const log = entries.filter(isObj).map((x) => ({ d: str(x.d, 10), t: num(x.t) || 0, kind: str(x.kind, 10), id: x.id || null, advice: ADVICE[x.advice] ? x.advice : null, text: str(x.text, 200) })).filter((x) => x.text);
  const counts = isObj(edgesDoc.counts) ? edgesDoc.counts : {};
  const proven = edges.filter((e) => !e.small);
  const evMax = Math.max(0.02, ...proven.map((e) => (e.ev == null ? 0 : e.ev)));
  return {
    t: num(edgesDoc.t) || now, day: str(edgesDoc.day, 10), edges, byId, book, regime, liveUsed, log,
    lists: { doMore: ids('do_more'), stop: ids('stop'), watch: ids('watch'), board: ids('board') },
    counts: { doMore: counts.do_more || 0, stop: counts.stop || 0, watch: counts.watch || 0, proven: counts.proven || proven.length, edges: edges.length },
    ledger: isObj(edgesDoc.ledger) ? edgesDoc.ledger : {}, headline: str(edgesDoc.headline, 200) || (log.length ? log[log.length - 1].text : ''), evMax,
    age: Math.max(0, now - (num(edgesDoc.t) || now)), hyp: shapeHyps(hypDoc, hypDemo),
  };
}

/** a lab building id: 'hyp:<idea>:<back|live|prog>' -> { h, part } or null */
export function hypOf(m, id) {
  const p = typeof id === 'string' ? id.split(':') : [];
  const h = p.length === 3 && p[0] === 'hyp' && m && m.hyp ? m.hyp.byId.get(p[1]) : null;
  return h && HYP_PARTS[p[2]] ? { h, part: p[2] } : null;
}

/** Days between an ISO date (YYYY-MM-DD) and the model's day (>= 0), or 999 when unknown. */
export function ageDays(iso, dayIso) {
  const a = Date.parse(`${iso}T12:00:00Z`), b = Date.parse(`${dayIso}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 999;
}

/** The plain-words card of one edge (what a tap on a building shows). Rows are [label, value, tone] with tone ok | bad | dim | ''. */
export function cardOf(e, book) {
  const rows = [];
  const bal = book && book.balance;
  rows.push(['Bets', `${e.n}${e.n ? ` (${e.wins} won, ${e.n - e.wins} lost)` : ''}`, e.small ? 'dim' : '']);
  if (e.w != null) rows.push(['Win rate', `${pct(e.w)} against the market's ${pct(e.p)} (${pts(e.pts)})`, e.small ? 'dim' : e.pts >= 0 ? 'ok' : 'bad']);
  if (e.lo != null && e.n) rows.push(['95% range of the win rate', `${pct(e.lo)} to ${pct(e.hi)}`, e.small ? 'dim' : '']);
  rows.push(['Profit per $1 staked', e.ev == null ? '-' : `${evf(e.ev)} after fees (${usd(e.pnl)} total)`, e.small ? 'dim' : e.ev > 0 ? 'ok' : 'bad']);
  rows.push(['Is it luck?', e.z == null ? '-' : e.sig === '+' ? `No: wins beat the odds (z ${sgn(e.z)})` : e.sig === '-' ? `No: it really loses (z ${sgn(e.z)})` : `Could be luck (z ${sgn(e.z)})`, e.small ? 'dim' : e.sig === '+' ? 'ok' : e.sig === '-' ? 'bad' : '']);
  [['d7', 'Last 7 days'], ['d30', 'Last 30 days'], ['led', 'Bets read one by one']].forEach(([k, lab]) => {
    const x = e.win[k];
    rows.push([lab, x.n ? `${evf(x.ev)} per $1 over ${x.n} bets${x.n < MIN_N ? ' (too few)' : ''}` : 'none yet', x.n < MIN_N ? 'dim' : x.ev > 0 ? 'ok' : 'bad']);
  });
  if (e.decay != null) rows.push(['Change vs all time', `${evf(e.decay)} per $1 (${e.recent === '7d' ? 'last 7 days' : 'last 30 days'})`, e.decay < 0 ? 'bad' : 'ok']);
  if (e.small) rows.push(['Size to bet', 'None: needs 30 bets first', 'dim']);
  else if (e.kellySafe > 0) {
    rows.push(['Kelly size (safe, quarter)', `${pct(e.kellyQ)} of the bankroll${bal ? `, about ${usd(e.stake)} of ${usd(bal)}` : ''}`, 'ok']);
    rows.push(['Chance of losing half at that size', e.ruin == null ? '-' : `up to ${pct(e.ruin, 1)}`, e.ruin > 0.1 ? 'bad' : '']);
  } else rows.push(['Size to bet', 'None: no proven edge to size on', 'dim']);
  rows.push(['Where the numbers come from', e.src === 'feed' ? `the bot's own totals (${e.pBasis})` : 'bets the engine read one by one', 'dim']);
  rows.push(['Seen / status since', `${e.first || '-'} / ${e.since || '-'}`, 'dim']);
  return { title: e.label, status: e.status, statusWord: STATUS_WORD[e.status], advice: ADVICE[e.advice], small: e.small, rows,
    banner: e.small ? `Only ${e.n} bet${e.n === 1 ? '' : 's'}. That is too few to trust, so this building is grey. Keep collecting.` : '' };
}

/** One sentence for the headline of the page. */
export function headlineOf(m) {
  if (!m) return 'Reading the city...';
  if (m.headline) return m.headline;
  return m.edges.length ? `${m.counts.doMore} to do more, ${m.counts.stop} to stop, ${m.counts.proven} edges proven.` : 'No bets read yet.';
}
