// DIONYSUS core (ES module, no DOM, no network): the Kalshi desk. The Kalshi bot's numbers (the public kalshi.json feed shape, or the site's own kalshicity/edges.json mirror, or the DEMO fixture), a guard check,
// a what-if backtest and the scan highlights. SUGGESTIONS ONLY: nothing here places, changes or stops a bet. Pure, so the tests call it in node.
// Money words: a Kalshi account is small, so dollars show cents ($55.81). 1R = the bot's average bet (its stake), so every dollar has an R next to it; a bet's own R is its result over what it risked.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120);
export function usd(x) { const v = num(x); if (v == null) return '$0.00'; const a = Math.abs(v); return (v < 0 && Math.round(a * 100) !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function usdS(x) { const v = num(x); if (v == null) return '$0.00'; const m = usd(v); return v > 0 && Math.round(v * 100) !== 0 ? '+' + m : m; }
export function rWord(usdv, risk) { const u = num(usdv), k = num(risk); if (u == null || !k || k <= 0) return '0.0R'; const r = Math.round((u / k) * 10) / 10; return (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R'; }
export const both = (usdv, risk) => `${usdS(usdv)} (${rWord(usdv, risk)})`;
export const cents = (x) => { const v = num(x); return v == null ? '' : (v < 0 ? '-' : v > 0 ? '+' : '') + Math.abs(v * 100).toFixed(1) + '¢'; };
export const pct = (x, d) => { const v = num(x); return v == null ? '' : (v * 100).toFixed(d == null ? 0 : d) + '%'; };
/** an edge label from the scan: "95-97c" -> "95–97¢" (plain words) */
export function labelWords(s) { return str(String(s == null ? '' : s).replace(/^at (.+)$/, '$1 bets').replace(/(\d+)-(\d+)c\b/g, '$1–$2¢').replace(/<(\d+)c\b/g, 'under $1¢').replace(/(\d+)c\+/g, '$1¢ and up').replace(/(\d+)c\b/g, '$1¢'), 80); }

// ------------------------------------------------------------------------------------------------ the bot's book
function cleanDays(a) { return (Array.isArray(a) ? a : []).filter((d) => Array.isArray(d) && /^\d{4}-\d{2}-\d{2}$/.test(String(d[0])) && num(d[1]) != null).map((d) => [d[0], r2(num(d[1]))]).slice(-60); }
export function sumDays(days, n) { return r2(days.slice(-n).reduce((s, d) => s + d[1], 0)); }
/** the public feed (kalshi.json, contract docs/KALSHI_PUBLISH.md) -> a book, or null when it is not a feed */
export function normFeed(j) {
  if (!isObj(j) || num(j.balance) == null) return null;
  const days = cleanDays(j.days);
  const positions = (Array.isArray(j.positions) ? j.positions : []).filter(isObj).slice(0, 12).map((p) => {
    const n = num(p.contracts) || 0, px = num(p.avg_price != null ? p.avg_price : p.price) || 0; return { title: str(p.title || p.ticker, 80), side: str(p.side, 4).toLowerCase(), contracts: n, price: px, risk: r2(n * px) };
  });
  const trades = (Array.isArray(j.trades) ? j.trades : []).filter((t) => isObj(t) && num(t.pnl) != null).slice(-40).map((t) => {
    const n = num(t.contracts) || 0, px = num(t.price) || 0, risk = r2(n * px); return { t: num(t.t) || 0, title: str(t.title || t.ticker, 80), side: str(t.side, 4).toLowerCase(), contracts: n, price: px, pnl: r2(num(t.pnl)), risk, strategy: str(t.strategy, 40) };
  }).sort((a, b) => b.t - a.t);
  const staked = num(j.stats && j.stats.staked), nT = num(j.stats && j.stats.trades);
  const stake = staked && nT ? r2(staked / nT) : trades.length ? r2(trades.reduce((s, t) => s + t.risk, 0) / trades.length) : null;
  return { src: 'feed', name: str(j.name, 40) || 'Kalshi bot', mode: str(j.mode, 12), running: j.running === true, status: str(j.status, 24), balance: r2(num(j.balance)), today: num(j.today_pnl) || 0, week: num(j.week_pnl) || 0, total: num(j.total_pnl) || 0,
    stake, days, positions, trades, t: num(j.t) || 0, strategies: (Array.isArray(j.strategies) ? j.strategies : []).filter(isObj).slice(0, 6).map((s) => ({ name: str(s.name, 40), total: num(s.total_pnl) || 0, trades: num(s.trades) || 0 })) };
}
/** the site's own mirror (kalshicity/edges.json "book") when the feed itself is unreachable */
export function bookFromEdges(e) {
  const b = isObj(e) && isObj(e.book) ? e.book : null; if (!b || num(b.balance) == null) return null;
  return { src: 'site', name: str(b.name, 40) || 'Kalshi bot', mode: str(b.mode, 12), running: b.running === true, status: str(b.status, 24), balance: r2(num(b.balance)), today: num(b.today) || 0, week: num(b.week) || 0, total: num(b.total) || 0, stake: num(b.stake_avg),
    days: cleanDays(b.days), positions: [], trades: [], t: num(b.feed_t) || num(e.t) || 0, strategies: [], pnl7: num(b.pnl7), worst: num(b.worst_day), best: num(b.best_day), note: str(b.note, 60) };
}
/** the book to show: the live feed, else the site's mirror, else the labelled demo */
export function chooseBook(feed, edges, fixture) {
  const f = normFeed(feed); if (f) return f;
  const s = bookFromEdges(edges); if (s) return s;
  const d = normFeed(isObj(fixture) ? fixture.feed : null); return d ? { ...d, src: 'demo' } : null;
}
export function ageWord(tSec, nowSec) {
  const t = num(tSec), n = num(nowSec); if (!t || !n) return 'time unknown';
  const m = Math.max(0, Math.round((n - t) / 60)); return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

// ------------------------------------------------------------------------------------------------ the guard
/** one plain verdict on the last 7 days. regime = edges.regime when the site has it; else the same rule from the feed's own days. */
export function guard(book, regime) {
  const p7 = isObj(regime) && num(regime.pnl7) != null ? num(regime.pnl7) : book.pnl7 != null ? book.pnl7 : book.days.length ? sumDays(book.days, 7) : null;
  const risk = book.stake || 10, paused = isObj(regime) ? !!regime.paused : book.running === false && book.status === 'Paused';
  if (p7 == null) return { level: 'off', title: 'No guard reading yet', text: 'The last 7 days are not in the feed yet.', p7: null };
  if (p7 < 0) return { level: paused ? 'bad' : 'warn', title: paused ? 'The guard has the bot resting' : 'A losing week', p7, text: `The last 7 days lost ${usd(-p7)} (${rWord(p7, risk)}).${paused ? ' The bot is paused until the week turns.' : ' The bot is still betting: this is what the guard watches.'}` };
  return { level: 'ok', title: 'The guard is calm', p7, text: `The last 7 days made ${both(p7, risk)}. Nothing to do.` };
}
export function betR(b) { return rWord(b.pnl, b.risk); }

// ------------------------------------------------------------------------------------------------ what if (a backtest of past bets)
export function normWhatIf(w) {
  const x = isObj(w) && isObj(w.what_if) ? w.what_if : null; if (!x || !Array.isArray(x.sets) || !x.sets.length) return null;
  const sets = x.sets.filter((s) => isObj(s) && num(s.net) != null).map((s) => ({ id: str(s.id, 8), name: str(s.name, 60), bets: num(s.bets) || 0, net: r2(num(s.net)), dip: num(s.dip) || 0, ruin: num(s.ruin) || 0, half: num(s.half) || 0 }));
  if (!sets.length) return null;
  const base = sets.find((s) => s.id === 'asis') || sets[0];
  return { n: num(x.n) || 0, enough: x.enough !== false, balance: num(x.balance), pick: str(x.pick, 8), recommend: str(x.recommend, 400), typical: num(x.typical_bet), why: isObj(w.why) ? str(w.why.text, 300) : '',
    sets: sets.map((s) => ({ ...s, gain: r2(s.net - base.net), ruinPct: Math.round(s.ruin * 100), halfPct: Math.round(s.half * 100), isBase: s === base, isPick: s.id === str(x.pick, 8) })) };
}

// ------------------------------------------------------------------------------------------------ scan highlights
export function highlights(e) {
  if (!isObj(e) || !Array.isArray(e.edges) || !isObj(e.lists)) return null;
  const by = new Map(e.edges.filter((x) => isObj(x) && typeof x.id === 'string').map((x) => [x.id, x]));
  const pick = (ids, n) => (Array.isArray(ids) ? ids : []).map((id) => by.get(id)).filter(Boolean).slice(0, n).map((x) => ({ label: labelWords(x.label), n: num(x.n) || 0, ev: num(x.ev), pnl: num(x.pnl) || 0, status: str(x.status, 12), w: num(x.w), p: num(x.p) }));
  const L = e.lists, out = { more: pick(L.do_more, 3), stop: pick(L.stop, 3), watch: pick(L.watch, 3), proven: isObj(e.counts) ? num(e.counts.proven) : null, edges: isObj(e.counts) ? num(e.counts.edges) : null, headline: str(e.headline, 160) };
  return out.more.length || out.stop.length || out.watch.length ? out : null;
}
export function edgeLine(h) { return `${h.label}: ${h.ev == null ? 'n/a' : cents(h.ev)} per $1 over ${h.n} bets (${usdS(h.pnl)} so far)`; }

export function jarvisCard(book, g) {
  const lvl = g.level;
  return { v: 1, name: 'Dionysus', status: { level: lvl, label: str(g.title, 48) }, kpis: [{ label: 'Balance', value: usd(book.balance) }, { label: 'Today', value: usdS(book.today) }, { label: 'Week', value: usdS(book.week) }],
    lines: [str(g.text, 118), str('Suggestions only: nothing here changes a bet.', 118)], t: 1793394000, theme: '#14110e' };
}

// ------------------------------------------------------------------------------------------------ K8 today (day-kalshi 2026-11-20)
// The site's ../kalshi/k8.json (Kalshi's PUBLIC results at the K8 bot's +20 s price: the strategy's health, not our bets). The 3 live legs
// with today's New York time, the fair (break-even) price, the last 10 W / L; the pool's win rate last 30 / 60 vs the 58% OFF line; the
// noise sentence. Not an object, or no live leg = null (the panel hides). nowMs picks the day for the time (London legs move with the clocks).
const K8_ET = (y, mo, d, h, mi, tz) => {   // the epoch (ms) of a wall time in a time zone, no library
  let g = Date.UTC(y, mo, d, h, mi);
  for (let k = 0; k < 2; k++) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g))) p[x.type] = +x.value || 0;
    g += Date.UTC(y, mo, d, h, mi) - Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
  }
  return g;
};
export function k8Panel(j, nowMs) {
  if (!isObj(j) || !Array.isArray(j.legs)) return null;
  const now = num(nowMs) == null ? Date.now() : num(nowMs), p = {};
  try { for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))) p[x.type] = +x.value; } catch (_) { return null; }
  const legs = j.legs.filter((x) => isObj(x) && x.live === true).slice(0, 5).map((x) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(x.open || '')), tz = x.tz === 'Europe/London' ? 'Europe/London' : 'America/New_York';
    let at = '';
    if (m) { try { at = new Date(K8_ET(p.year, p.month - 1, p.day, +m[1], +m[2], tz)).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (_) { at = ''; } }
    const name = str(x.name, 60).replace(/\s*\d{1,2}:\d{2}(-\d{1,2}:\d{2})?\s*ET\s*$/, '') || 'K8 leg', fair = num(x.fair_c);
    return { name, at, fair: fair == null ? null : Math.round(fair), last10: String(x.last10 || '').replace(/[^WL]/g, '').slice(-10), rate: num(x.rate), n: num(x.n) };
  });
  if (!legs.length) return null;
  const pool = isObj(j.pool) ? j.pool : {}, min = isObj(j.rule) && num(j.rule.min_win) != null ? num(j.rule.min_win) : 0.58;
  const r30 = num(pool.r30), r60 = num(pool.r60), W = min * 100;
  const lv = (x) => (x == null ? '' : x * 100 < W ? 'off' : x * 100 < W + 5 ? 'watch' : 'ok');
  const worst = [lv(r30), lv(r60)].indexOf('off') >= 0 ? 'off' : [lv(r30), lv(r60)].indexOf('watch') >= 0 ? 'watch' : r30 == null && r60 == null ? '' : 'ok';
  return { legs, r30, r60, min, l30: lv(r30), l60: lv(r60), level: worst, verdict: { ok: 'Healthy', watch: 'Watch', off: 'OFF line crossed', '': 'No numbers yet' }[worst],
    noise: str(isObj(j.noise) ? j.noise.plain : '', 300), through: str(j.through, 10) };
}

// ------------------------------------------------------------------------------------------------ merged from Kalshi City + Sibyl (day-kalshi 2026-11-20)
// AUDIT 2026-11-20: Dionysus is the one Kalshi desk; the useful parts of kalshicity/ (learned.json fees + ruin, suggestions.json) and sibyl/ (money/sibyl.json
// picks, money/sibyl_forward.json paper record) show here as plain cards. All of it comes from the OLD crypto bot's study (retired 2026-11-19): history, never live.
// Not the expected shape = null (the card hides).
const OLD = 'old bot (retired)';
export const OLD_WORD = OLD;
const c2 = (x) => Math.round(x * 10000) / 100;                       // dollars -> cents, 2 dp
/** learned.json fees -> Kalshi's fee per contract and the break-even win rate at each price (the same fee rule for any Kalshi bet, K8 too) */
export function feeTable(L) {
  const f = isObj(L) && isObj(L.fees) ? L.fees : null; if (!f || !Array.isArray(f.rows)) return null;
  const rows = f.rows.filter(isObj).map((r) => ({ price: num(r.price), fee: num(r.fee_per_contract), be: num(r.breakeven_win_rate) }))
    .filter((r) => r.price != null && r.price > 0 && r.price < 1 && r.fee != null && r.fee >= 0 && r.be != null && r.be > 0 && r.be <= 1).slice(0, 12)
    .map((r) => ({ price: Math.round(r.price * 100), fee: c2(r.fee), be: Math.round(r.be * 1000) / 10 }));
  if (!rows.length) return null;
  const src = isObj(L.source) ? L.source : {};
  return { rows, total: num(f.total), staked: num(f.staked), gross: num(f.pnl_gross), net: num(f.pnl_net), day: str(src.generated_utc, 10), bets: num(src.bets) };
}
/** learned.json headline + suggestions.json stop / pause rows -> what the old bot taught */
export function oldLessons(L, S) {
  const head = isObj(L) ? str(L.headline, 240) : '';
  const items = (isObj(S) && Array.isArray(S.items) ? S.items : []).filter((i) => isObj(i) && (i.verdict === 'stop' || i.verdict === 'pause') && num(i.net_usd) != null && str(i.kind, 60))
    .slice(0, 5).map((i) => ({ verdict: i.verdict, kind: str(i.kind, 60), net: r2(num(i.net_usd)), n: Math.max(0, Math.round(num(i.n) || 0)), rule: str(i.rule, 200) }));
  const notes = (isObj(S) && Array.isArray(S.not_proven) ? S.not_proven : []).map((x) => str(x, 240)).filter(Boolean).slice(0, 3);
  if (!head && !items.length) return null;
  const src = isObj(L) && isObj(L.source) ? L.source : {};
  return { head, items, notes, bets: num(src.bets), day: str(src.generated_utc, 10) };
}
/** learned.json ruin -> how often a small bankroll was wiped out at each bet size (90-day simulation of the old bot's late favourite) */
export function ruinTable(L) {
  const r = isObj(L) && isObj(L.ruin) ? L.ruin : null; if (!r || !Array.isArray(r.rows) || num(r.bankroll) == null) return null;
  const rows = r.rows.filter(isObj).map((x) => ({ policy: str(x.policy, 40), ruin: num(x.p_ruin), half: num(x.p_below_half), median: num(x.median_end) }))
    .filter((x) => x.policy && x.ruin != null && x.ruin >= 0 && x.ruin <= 1).slice(0, 8);
  if (!rows.length) return null;
  return { rows, bank: r2(num(r.bankroll)), floor: num(r.floor), days: num(r.horizon_days), perDay: num(r.bets_per_day) };
}
/** Sibyl's scanner file (money/sibyl.json) + its own paper ledger (money/sibyl_forward.json) -> the picks and the forward record. A 'sample' (demo) file is ignored. */
export const SIBYL_MIN = 30;
export function sibylView(sib, fwd) {
  let picks = null, counts = null, head = '', asof = '';
  if (isObj(sib) && sib.id === 'sibyl' && Array.isArray(sib.items) && sib.status !== 'sample' && sib.demo !== true) {
    picks = sib.items.filter((i) => isObj(i) && i.picked === true && str(i.title, 60)).slice(0, 3)
      .map((i) => ({ title: str(i.title, 60), n: Math.max(0, Math.round(num(i.n) || 0)), edge: num(i.edge_c), win: num(i.win), be: num(i.break_even) }));
    counts = { edges: isObj(sib.counts) ? Math.round(num(sib.counts.edges) || 0) : sib.items.length, worthy: isObj(sib.counts) ? Math.round(num(sib.counts.worthy) || 0) : picks.length };
    head = isObj(sib.headline) ? str(sib.headline.text, 300) : ''; asof = str(sib.asof, 10);
  }
  let own = null;
  if (isObj(fwd) && fwd.kind === 'sibyl-forward' && Array.isArray(fwd.bets)) {
    const bets = fwd.bets.filter((b) => isObj(b) && num(b.stake_usd) > 0);
    const done = bets.filter((b) => (b.status === 'won' || b.status === 'lost') && num(b.pnl_usd) != null), wins = done.filter((b) => b.status === 'won').length;
    own = { start: str(fwd.start_day, 10), recorded: bets.length, open: bets.filter((b) => !['won', 'lost', 'void'].includes(b.status)).length, n: done.length, wins, claim: done.length >= SIBYL_MIN,
      net: done.length >= SIBYL_MIN ? r2(done.reduce((s, b) => s + num(b.pnl_usd), 0)) : null };
  }
  if (!picks && !own) return null;
  return { picks: picks || [], counts, head, asof, own };
}
