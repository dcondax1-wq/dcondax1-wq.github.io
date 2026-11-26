// TRADING page (ES module): every trade in one place. Reads ./trades.json (tools/trading_export.py), ../home.json (+ the PC's 15-minute feed via olympus/truth.js),
// ../ledger/rules.json, ../business/accounts.json and ./fixture.json (DEMO, never blank). Read only: it sends nothing and keeps nothing. Text only through textContent /
// createElementNS. window.TRADING is the test hook. ?demo=1 = the example; ?src=live|paper|backtest and ?bot=LIT|ATLAS open on that filter; ?month=2026-10 on that month;
// ?acct=z25k2 opens LIVE on one account. LIVE rows per account: trades.json (the PC's data branch, tools/trading_export.py) + the PC's 15-minute ntfy feed
// (../pc_feed.js: board_trades + "at", read here once per refresh, used for trades only while it is fresh: C.feedRows).
import * as C from './tradingcore.js?v=5';
import * as T from '../olympus/truth.js';
import * as DK from '../nq/nqdesk.js?v=8';
import * as NB from '../nq/nqbars.js?v=b1';
import * as PR from '../nq/payready.js?v=2';
import * as MG from './merged.js?v=1';     // round 3: Odeon reels + the Why study as cards   // nqdash3 round 2: payout readiness per funded account   // the PC's chart post (le-bars): an open trade's stop as it is now and the last price   // nqdash3: the accounts strip (the same cards as the NQ page)

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { file: null, home: null, lite: null, rules: null, biz: null, fixture: null, demo: false, forced: false, rows: [], bot: 'all', src: 'backtest', acct: 'all', month: '', ready: false, sheet: false, last: null };

async function getJSON(url, ms) {
  const E = window.TR_EARLY;                            // perf: the page head started these fetches already (index.html); used once
  if (E && E[url]) { const p = E[url]; delete E[url]; try { return await p; } catch (_) { return null; } }
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
/** the fixture keeps ages, not dates: every "..._ago_min" becomes a real time counted back from now */
function agesToTimes(x, nowS) {
  const f = JSON.parse(JSON.stringify(x || {}));
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'number' && k.slice(-8) === '_ago_min') { o[k.slice(0, -8)] = nowS - Math.round(v * 60); delete o[k]; } else walk(v); } };
  walk(f); return f;
}
const nowS = () => Math.floor(Date.now() / 1000);
/** the PC's ntfy feed (../pc_feed.js, the same file and version olympus/truth.js loads): the lite status, or null. Never throws, ~3 s at most. */
let feedLib = null;
function loadFeedLib() {
  if (window.PC_FEED) return Promise.resolve(window.PC_FEED);
  if (!feedLib) feedLib = new Promise((res) => { try { const sc = document.createElement('script'); sc.src = '../pc_feed.js?v=n9'; sc.async = true; sc.onload = () => res(window.PC_FEED || null); sc.onerror = () => res(null); document.head.appendChild(sc); } catch (_) { res(null); } });
  return feedLib;
}
async function withFeed(home) {
  try {
    const F = await loadFeedLib(); if (!F) return home;
    const lite = await Promise.race([F.fetchLatest({ feedUrl: '../status_feed.json' }), new Promise((r) => setTimeout(() => r(null), 3000))]);
    if (!lite) return home;
    S.lite = lite;
    // the numbers go through overlayHome (as truth.js does); the trades come in through C.feedRows (fresh feeds only, per account)
    const noTrades = { ...lite, board: lite.board && typeof lite.board === 'object' ? { ...lite.board, trades: undefined } : lite.board };
    return home && typeof home === 'object' ? F.overlayHome(home, noTrades) : home;
  } catch (_) { return home; }
}
function model() {
  const real = !S.forced && S.file && Array.isArray(S.file.trades) && S.file.trades.length > 0;
  S.demo = !real;
  const file = real ? S.file : (S.fixture && S.fixture.trades) || { trades: [] };
  const home = real ? S.home : agesToTimes(S.fixture && S.fixture.home, nowS());
  S.view = { file, home: home && typeof home === 'object' ? home : null };
  S.rows = C.merge(file, S.view.home, real ? S.lite : null, nowS());
  S.A = S.view.home ? T.accountsOf(S.view.home) : {};
  S.ages = S.view.home ? T.agesOf(S.view.home, nowS()) : null;
}

// ------------------------------------------------------------------------------------------------ banner + today
function renderBanner() {
  const L = C.lastLive(S.rows, S.ages, nowS());
  $('bannerTitle').textContent = L.head;
  $('banner').dataset.level = L.stale ? 'bad' : L.silent ? 'warn' : 'ok';
  $('bannerText').textContent = L.stale
    ? `The PC has not reported for ${L.age != null ? C.ageWords(L.age) : 'a while'}. Everything marked LIVE stops on that day; the bots may still be trading, this page just is not hearing from them.`
    : L.silent ? 'The PC reported in the last 36 hours, but not in the last 20 minutes.' : 'The PC reported in the last 20 minutes.';
  S.live = L;
}
function kv(dl, k, v, cls) { dl.appendChild(h('dt', '', k)); dl.appendChild(h('dd', cls || '', v)); }
// night-feedsA 2026-11-18: the Today cards = EVERY real account, the same as the ZEUS card: the two bot cards + the PC's other accounts
// (truth.js extraOf: Zlarior 25K #2), and a funded account shows its payout line (the ZEUS card's words) instead of a "to pass" it does not have
function extraAccts() {
  const ho = S.view && S.view.home;
  if (!ho || S.demo) return [];
  const l = S.lite && Array.isArray(S.lite.accounts) ? { ...ho, pc_accounts: S.lite.accounts, pc_accounts_t: S.lite.t } : ho;
  try { return T.extraOf(l); } catch (_) { return []; }
}
let zeusP = null;
function zeusRows() {                       // olympus/zeus_core.js (the ZEUS card's one summary), loaded once after the first draw
  if (zeusP) return zeusP;
  zeusP = new Promise((res) => {
    const go = () => { try { window.ZEUS_CORE.fetchAll().then((d) => res(window.ZEUS_CORE.summary(d).rows || []), () => res([])); } catch (_) { res([]); } };
    if (window.ZEUS_CORE) { go(); return; }
    try { const sc = document.createElement('script'); sc.src = '../olympus/zeus_core.js?v=11'; sc.async = true; sc.onload = () => (window.ZEUS_CORE ? go() : res([])); sc.onerror = () => res([]); document.head.appendChild(sc); } catch (_) { res([]); }
  });
  return zeusP;
}
function payLine(key) { const r = (S.zrows || []).find((x) => x && x.key === key && x.cls === 'funded'); return r ? r.goal : ''; }
function renderToday() {
  const clk = C.flatClock(nowS());
  $('clock').textContent = `${clk.hm ? clk.hm + ' ET now. ' : ''}${clk.text}`;
  $('clock').dataset.open = clk.open ? '1' : '0';
  const box = $('accts'); clear(box);
  for (const c of C.todayCards(S.A, S.rows, S.view.home, nowS())) {
    const card = h('article', 'acct'); card.dataset.bot = c.bot;
    card.appendChild(h('h3', '', `${c.name} `)).appendChild(h('small', '', `MFFU ${c.size}`));
    const dl = h('dl', 'kv');
    kv(dl, c.dayWord, c.today == null ? (c.has ? '$0' : '-') : C.moneyS(c.today), c.today > 0.5 ? 'pos' : c.today < -0.5 ? 'neg' : '');
    kv(dl, 'Open trade', c.open ? `${c.open.side}${c.open.usd != null ? ', ' + C.moneyS(c.open.usd) : ''}` : 'None');
    kv(dl, 'Room left', c.room == null ? '-' : C.money(c.room) + ' of ' + C.money(c.mll));
    const funded = !S.demo && (S.A[c.bot === 'LIT' ? 'lit' : 'atlas'] || {}).kind === 'funded';
    if (funded) kv(dl, 'Payout', payLine(c.bot === 'LIT' ? 'zlarior' : 'atlas') || 'Funded: no target to pass');
    else kv(dl, 'To pass', c.toTarget == null ? '-' : c.toTarget <= 0 ? 'Target reached' : C.money(c.toTarget));
    card.appendChild(dl);
    box.appendChild(card);
  }
  for (const x of extraAccts()) {
    const card = h('article', 'acct'); card.dataset.bot = x.bot; card.dataset.acct = x.id;
    card.appendChild(h('h3', '', `${x.name} `)).appendChild(h('small', '', `MFFU ${x.size} ${x.kind === 'funded' ? 'funded' : 'eval'}`.trim()));
    const dl = h('dl', 'kv');
    kv(dl, 'Today', C.moneyS(x.today), x.today > 0.5 ? 'pos' : x.today < -0.5 ? 'neg' : '');
    kv(dl, 'Room left', x.room == null ? '-' : C.money(x.room) + ' of ' + C.money(x.mll));
    if (x.kind === 'funded') kv(dl, 'Payout', payLine(x.id) || 'Funded: no target to pass');
    else kv(dl, 'To pass', x.toTarget == null ? '-' : x.toTarget <= 0 ? 'Target reached' : C.money(x.toTarget));
    card.appendChild(dl);
    box.appendChild(card);
  }
  if (!S.demo && !S.zrows && !S.zwait) { S.zwait = true; zeusRows().then((rows) => { S.zrows = rows; if (rows.length) renderToday(); }); }
  $('todaySrc').textContent = S.demo ? 'Example numbers (fixture.json), not real.' : S.ages ? `Source: LIVE, home.json from the PC. ${S.ages.line}` : 'Source: no home.json loaded, so no account numbers.';
}

// ------------------------------------------------------------------------------------------------ the filters
function seg(box, items, cur, onPick) {
  clear(box);
  for (const it of items) {
    const b = h('button', 'segb', it.label); b.type = 'button'; b.setAttribute('aria-pressed', String(it.k === cur)); b.dataset.k = it.k;
    b.addEventListener('click', () => { onPick(it.k); try { if (O && O.sfx) O.sfx('tap'); } catch (_) { /* no sound */ } });
    box.appendChild(b);
  }
}
function renderFilters() {
  const n = C.counts(S.rows), LA = C.liveAccounts(S.rows);
  seg($('fBot'), [{ k: 'all', label: 'Both' }, { k: 'LIT', label: 'Zlarior' }, { k: 'ATLAS', label: 'ATLAS' }], S.bot, (k) => { S.bot = k; S.month = ''; renderFiltered(); renderFilters(); });
  seg($('fSrc'), ['live', 'paper', 'backtest'].map((k) => ({ k, label: `${C.SRC[k]} ${n[k]}` })), S.src, (k) => { S.src = k; S.month = ''; renderFiltered(); renderFilters(); });
  if (S.acct !== 'all' && !LA.some((a) => a.k === S.acct)) S.acct = 'all';
  const showAcct = S.src === 'live' && LA.length > 0;
  $('fAcctBox').hidden = !showAcct;
  if (showAcct) seg($('fAcct'), [{ k: 'all', label: `All ${LA.reduce((x, a) => x + a.n, 0)}` }].concat(LA.map((a) => ({ k: a.k, label: `${a.name} ${a.n}` }))), S.acct, (k) => { S.acct = k; S.month = ''; renderFiltered(); renderFilters(); });
  $('srcNote').textContent = `${C.SRC_WORDS[S.src]}. Applies to the calendar, the trades, the edges and the curve.${S.src === 'live' ? ' LIVE = every real account: the daily upload plus the PC\'s 15-minute report.' : ''}`;
}
const curAcct = () => (S.src === 'live' ? S.acct : 'all');
const F = () => ({ bot: S.bot, src: S.src, acct: curAcct() });
const srcTag = () => `${C.SRC[S.src]}${S.bot === 'all' ? '' : ' · ' + (S.bot === 'LIT' ? 'Zlarior' : 'ATLAS')}${curAcct() === 'all' ? '' : ' · ' + C.acctName(curAcct())}`;

// ------------------------------------------------------------------------------------------------ calendar
function renderCal() {
  const R = C.pick(S.rows, F()), M = C.months(R);
  if (!S.month || !M.includes(S.month)) S.month = M.length ? M[M.length - 1] : '';
  const i = M.indexOf(S.month);
  $('calSrc').textContent = srcTag();
  $('calPrev').disabled = i <= 0; $('calNext').disabled = i < 0 || i >= M.length - 1;
  const g = C.monthGrid(S.month, R), cal = $('cal'); clear(cal);
  $('calMonth').textContent = g.label || 'No trades';
  $('calSum').textContent = S.month ? `${C.moneyS(g.total)} in ${g.days} trading ${g.days === 1 ? 'day' : 'days'} (${g.wins} green). Month ${i + 1} of ${M.length} with trades.` : `No ${C.SRC[S.src]} trades for this choice yet.`;
  for (const w of g.weeks) {
    const row = h('div', 'calrow'); row.setAttribute('role', 'row');
    for (const c of w) {
      const cell = c.inMonth && c.n ? h('button', 'day') : h('div', 'day');
      cell.setAttribute('role', 'gridcell');
      if (c.inMonth && c.n) { cell.type = 'button'; cell.addEventListener('click', () => openDay(c.day, cell)); }
      cell.dataset.level = String(c.level); if (!c.inMonth) cell.dataset.out = '1';
      cell.setAttribute('aria-label', c.label);
      cell.appendChild(h('span', 'dn', c.inMonth ? c.d : ''));
      if (c.inMonth && c.n) cell.appendChild(h('span', 'dv', shortUsd(c.usd)));
      row.appendChild(cell);
    }
    cal.appendChild(row);
  }
}
function shortUsd(v) { const a = Math.abs(v), s = v < -0.5 ? '-' : v > 0.5 ? '+' : ''; return a >= 1000 ? `${s}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${s}${Math.round(a)}`; }
function stepMonth(d) {
  const M = C.months(C.pick(S.rows, F())), i = M.indexOf(S.month), j = i + d;
  if (j < 0 || j >= M.length) return; S.month = M[j]; renderCal(); say(`${C.monthLabel(S.month)}.`);
}

// ------------------------------------------------------------------------------------------------ trades
function tradeItem(v) {
  const li = h('li', 'trade'); li.dataset.src = v.srcKey;
  const inner = v.odeon ? h('a', 'tlink') : h('div', 'tlink');
  if (v.odeon) { inner.href = v.odeon; inner.setAttribute('aria-label', `${v.dayLabel} ${v.hm} ${v.who} ${v.side} ${v.usd}: open the replay in Odeon`); }
  const l = h('div', 'tl'), r = h('div', 'tr');
  l.appendChild(h('b', '', v.who)); l.appendChild(h('span', 'note', `${v.dayLabel} · ${v.hm} ET · ${v.side}${v.q ? ' · ' + v.q + ' micros' : ''}`)); l.appendChild(h('span', 'note', v.plan));
  r.appendChild(h('b', v.sign, v.usd)); r.appendChild(h('span', 'note', `${v.r}${v.exit ? ' · ' + v.exit : ''}`));
  const tag = h('span', 'pill src', v.src); tag.dataset.src = v.srcKey; r.appendChild(tag);
  if (v.odeon) r.appendChild(h('span', 'note replay', 'Replay ›'));
  else if (v.replayLater) r.appendChild(h('span', 'note later', v.replayLater));
  inner.appendChild(l); inner.appendChild(r); li.appendChild(inner);
  return li;
}
function renderTrades() {
  const list = $('trades'); clear(list);
  const V = C.recent(S.rows, F(), 30);
  $('tradesSrc').textContent = srcTag();
  $('tradesNote').textContent = V.length ? `The last ${V.length} ${C.SRC[S.src]} trades, newest first. A trade with "Replay" opens in Odeon.${S.src === 'live' ? ' A LIVE trade can be replayed once its day\'s bars are uploaded (after 17:05 ET).' : ''}` : `No ${C.SRC[S.src]} trades for this choice yet.`;
  for (const v of V) list.appendChild(tradeItem(v));
}

// ------------------------------------------------------------------------------------------------ stats, rules, edges, twins, curve
function renderLiveStats() {
  const box = $('liveStats'); clear(box);
  const L = C.liveStats(S.rows, nowS());
  if (!L.length) { box.appendChild(h('p', 'note', 'No LIVE trade in the files yet.')); return; }
  const tbl = h('table', 'st live'), head = h('tr');
  for (const t of ['Account', 'Trades', 'Net', 'Win', 'PF', 'Today']) head.appendChild(h('th', '', t));
  tbl.appendChild(h('thead')).appendChild(head);
  const body = h('tbody');
  for (const a of L) {
    const tr = h('tr'); tr.dataset.acct = a.k;
    tr.appendChild(h('th', '', `${a.name}${a.a4 ? ' ...' + a.a4 : ''}`)); tr.appendChild(h('td', '', String(a.s.n)));
    tr.appendChild(h('td', a.s.net > 0.5 ? 'pos' : a.s.net < -0.5 ? 'neg' : '', C.moneyS(a.s.net))); tr.appendChild(h('td', '', a.s.n ? `${a.s.win}%` : '-'));
    tr.appendChild(h('td', '', a.s.n ? C.pfText(a.s.pf) : '-')); tr.appendChild(h('td', '', a.todayN ? C.moneyS(a.today) : '-'));
    body.appendChild(tr);
  }
  tbl.appendChild(body); box.appendChild(tbl);
  const n = L.reduce((x, a) => x + a.s.n, 0);
  box.appendChild(h('p', 'note', `LIVE = the real MFFU accounts (last 4 digits only). ${n} ${n === 1 ? 'trade' : 'trades'} so far: too few to judge an edge; the backtest below is the yardstick.`));
}
function renderStats() {
  renderLiveStats();
  const box = $('stats'); clear(box);
  const H = C.halves(C.pick(S.rows, { bot: 'all', src: 'backtest' }));
  if (!H.length) { box.appendChild(h('p', 'note', 'No backtest trades in the file.')); return; }
  for (const x of H) {
    const card = h('article', 'stat'); card.dataset.bot = x.bot;
    card.appendChild(h('h3', '', x.bot === 'LIT' ? 'Zlarior · LIT' : 'ATLAS (3 members)'));
    const tbl = h('table', 'st'), head = h('tr');
    for (const t of ['', 'H1', 'H2']) { const th = h('th', '', t); if (!t) th.appendChild(h('span', 'ag-sr', 'Measure')); head.appendChild(th); }
    tbl.appendChild(h('thead')).appendChild(head);
    const body = h('tbody'), a = C.statLines(x.h1), b = C.statLines(x.h2);
    for (let i = 0; i < a.length; i++) { const tr = h('tr'); tr.appendChild(h('th', '', a[i][0])); tr.appendChild(h('td', '', a[i][1])); tr.appendChild(h('td', '', b[i][1])); body.appendChild(tr); }
    const tr = h('tr'); tr.appendChild(h('th', '', 'Trades')); tr.appendChild(h('td', '', `${x.h1.n} (${C.dayLabel(x.h1.from)} - ${C.dayLabel(x.h1.to)})`)); tr.appendChild(h('td', '', `${x.h2.n} (to ${C.dayLabel(x.h2.to)})`)); body.appendChild(tr);
    tbl.appendChild(body); card.appendChild(tbl);
    const live = C.pick(S.rows, { bot: x.bot, src: 'live' });
    if (live.length) { const s = C.stats(live); card.appendChild(h('p', 'note', `LIVE so far: ${s.n} ${s.n === 1 ? 'trade' : 'trades'}, ${C.moneyS(s.net)} (too few to judge).`)); }
    box.appendChild(card);
  }
  const ref = S.view.file && S.view.file.lit_ref;
  if (ref && ref.h1) box.appendChild(h('p', 'note', `LIT backtest file says H1 ${C.moneyS(ref.h1.net)} (PF ${ref.h1.pf}), H2 ${C.moneyS(ref.h2 ? ref.h2.net : 0)} (PF ${ref.h2 ? ref.h2.pf : '-'}): the same trades as above.`));
}
function renderRules() {
  const box = $('rules'); clear(box);
  const R = C.rulesCheck(S.A, S.rows, S.rules, S.biz);
  for (const a of R.accounts) {
    const card = h('article', 'rule'); card.dataset.bot = a.bot;
    card.appendChild(h('h3', '', `${a.name} (MFFU Builder ${a.size})`));
    const dl = h('dl', 'kv');
    kv(dl, 'Profit so far', C.moneyS(a.profit));
    kv(dl, 'Days traded (LIVE)', String(a.days));
    kv(dl, 'Best day (LIVE)', a.best && a.best.usd > 0.5 ? `${C.moneyS(a.best.usd)} (${C.dayLabel(a.best.day)})` : 'No green day yet');
    card.appendChild(dl);
    const v1 = h('p', 'verdict', `Builder funded (50%): ${a.builder.text}`); v1.dataset.ok = String(a.builder.ok); card.appendChild(v1);
    const v2 = h('p', 'verdict', `Rapid EOD (30%): ${a.rapid.text}`); v2.dataset.ok = String(a.rapid.ok); card.appendChild(v2);
    card.appendChild(h('p', 'lead small', a.pass));
    if (a.payout) card.appendChild(h('p', 'lead small', a.payout));
    if (a.backtest) card.appendChild(h('p', 'note', a.backtest));
    card.appendChild(h('p', 'note', `Profit from ${a.profitSrc}.`));
    box.appendChild(card);
  }
  $('rapidText').textContent = R.rapidText ? `Rapid EOD 50K: ${R.rapidText}` : '';
}
function bars(box, list, labelOf) {
  clear(box);
  const big = Math.max(1, ...list.map((x) => Math.abs(x.usd)));
  if (!list.some((x) => x.n)) { box.appendChild(h('p', 'note', 'No trades for this choice.')); return; }
  for (const x of list) {
    const row = h('div', 'bar'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', `${labelOf(x)}: ${C.moneyS(x.usd)} on ${x.n} trades`);
    row.appendChild(h('span', 'bl', labelOf(x)));
    const track = h('span', 'bt'), fill = h('i', x.usd > 0 ? 'pos' : x.usd < 0 ? 'neg' : '');
    fill.style.width = `${Math.round((Math.abs(x.usd) / big) * 100)}%`; track.appendChild(fill); row.appendChild(track);
    row.appendChild(h('span', 'bv', `${C.moneyS(x.usd)} · ${x.n}`));
    box.appendChild(row);
  }
}
function renderEdge() {
  const R = C.pick(S.rows, F());
  $('edgeSrc').textContent = srcTag();
  bars($('hours'), C.hours(R), (x) => x.label);
  bars($('wdays'), C.weekdays(R), (x) => x.label);
}
function renderTwins() {
  const list = $('twins'); clear(list);
  const V = C.twins(S.rows);
  if (!V.length) { list.appendChild(h('li', 'note', 'No LIVE trade yet, so nothing to compare.')); return; }
  for (const v of V) {
    const li = h('li', 'twin'); li.dataset.level = v.level;
    li.appendChild(h('b', '', `${C.dayLabel(v.day)} ${v.hm} ET · ${v.name} · ${v.side === 'SHORT' ? 'Short' : 'Long'}`));
    li.appendChild(h('span', 'note', `LIVE ${v.live}${v.q ? ' (' + v.q + ' micros)' : ''} · ${v.twinSrc || 'twin'} ${v.twin}`));
    li.appendChild(h('span', 'verdict', v.verdict));
    list.appendChild(li);
  }
  list.appendChild(h('li', 'note', 'The PC\'s own trade-watch check (tools/trade_watch.py) only sends phone alerts; it is not published to the site, so this list is built from the trades file.'));
}
function renderEquity() {
  const svg = $('eq'); clear(svg);
  const eq = C.equity(C.pick(S.rows, F())), g = C.equityPath(eq, 320, 150, 8), leg = $('eqLeg'); clear(leg);
  $('eqSrc').textContent = srcTag();
  if (!g.paths.length) { svg.appendChild(sv('text', { x: 160, y: 78, 'text-anchor': 'middle', class: 'eqt' }, 'No trades for this choice')); return; }
  svg.appendChild(sv('line', { x1: 8, x2: 312, y1: g.zero.toFixed(1), y2: g.zero.toFixed(1), class: 'eqz' }));
  for (const p of g.paths) svg.appendChild(sv('path', { d: p.d, class: `eql ${p.bot.toLowerCase()}`, fill: 'none' }));
  svg.appendChild(sv('text', { x: 10, y: 146, class: 'eqt' }, C.dayLabel(eq.from)));
  svg.appendChild(sv('text', { x: 310, y: 146, 'text-anchor': 'end', class: 'eqt' }, C.dayLabel(eq.to)));
  for (const l of eq.lines) {
    const x = h('p', `leg ${l.bot.toLowerCase()}`); x.appendChild(h('i')); x.appendChild(h('span', '', `${l.bot === 'LIT' ? 'Zlarior · LIT' : 'ATLAS'}: ${C.moneyS(l.net)}, max drawdown ${C.money(l.dd)}`));
    leg.appendChild(x);
  }
}

// ------------------------------------------------------------------------------------------------ the day sheet
function openDay(day, from) {
  const D = C.daily(C.pick(S.rows, F()))[day]; if (!D) return;
  S.last = from || null; S.sheet = true;
  $('sheetH').textContent = `${C.longDay(day)}: ${C.moneyS(D.usd)}`;
  const body = $('sheetBody'); clear(body);
  body.appendChild(h('p', 'note', `${D.n} ${C.SRC[S.src]} ${D.n === 1 ? 'trade' : 'trades'}.`));
  const ol = h('ol', 'trades'); for (const r of D.trades.slice().reverse()) ol.appendChild(tradeItem(C.tradeView(r))); body.appendChild(ol);
  $('sheet').hidden = false; $('veil').hidden = false; document.documentElement.classList.add('sheet-open');
  try { $('sheetClose').focus(); } catch (_) { /* nothing */ }
  say(`${C.longDay(day)} is open.`);
}
function closeSheet() {
  if (!S.sheet) return;
  S.sheet = false; $('sheet').hidden = true; $('veil').hidden = true; document.documentElement.classList.remove('sheet-open');
  try { if (S.last && S.last.focus) S.last.focus(); } catch (_) { /* nothing */ }
}

// ------------------------------------------------------------------------------------------------ start
// ------------------------------------------------------------------------------------------------ 9. deep dive (../nqdeep.js, night-nqdash2 2026-11-20)
function renderDeep() {
  const K = window.NQ_DEEP; if (!K || !$('deep')) return;
  const R = C.pick(S.rows, F()), t = K.core.tag(R, nowS()), D = K.draw;
  $('deepSrc').textContent = srcTag();
  const safe = (fn) => { try { fn(); } catch (e) { /* one box failing never blanks the page */ } };
  safe(() => D.underwater($('dUnder'), R, t));
  const bot = S.bot === 'ATLAS' ? 'ATLAS' : 'LIT', ak = curAcct() !== 'all' ? curAcct() : C.BOTS[bot].ak;
  safe(() => D.twin($('dTwin'), S.rows.filter((r) => r.bot === bot && !r.open), bot, ak, nowS()));
  safe(() => D.dist($('dDistR'), R, 'r', t)); safe(() => D.dist($('dDistUsd'), R, 'usd', t));
  safe(() => D.heat($('dHeat'), R, t)); safe(() => D.streaks($('dStreak'), R, t));
  safe(() => D.extremes($('dExt'), R, t)); safe(() => D.timeline($('dTime'), R, 6, t));
}
// nqdash3: the accounts strip. The PC's post laid over home.json the NQ way (pc_feed.js homeOver: the accounts, the payout line); DEMO = the NQ page's example
function renderAccts() {
  const box = $('acctStrip'); if (!box) return;
  try {
    const now = nowS(), F = window.PC_FEED;
    let home = S.demo ? agesToTimes(S.nqfx && S.nqfx.home, now) : S.home0;
    if (!S.demo && S.lite && F && F.homeOver) home = F.homeOver(S.home0, S.lite, now, window.PAYOUT_COACH || null);
    let chart = S.chart;
    if (S.demo && S.nqfx && S.nqfx.chart) { const cp = agesToTimes(S.nqfx.chart, now), b = NB.unpack(cp); chart = { opens: cp.open || [], last: b.length ? b[b.length - 1][4] : null, t: +cp.t || null }; }
    const A = DK.accounts(home, S.biz, now, chart);
    DK.draw.accounts(box, A);
    const n = A.filter((a) => a.dot === 'live').length, p = $('acctPill');
    if (p) { p.textContent = S.demo ? 'DEMO' : `${n} of ${A.filter((a) => a.dot !== 'plan').length} live`; p.className = 'pill ' + (S.demo ? 'warn' : n ? 'ok' : 'bad'); }
  } catch (_) { /* the rest of the page still draws */ }
}
// the chart post, read like the NQ page's live chart does (../status_feed.json -> ntfy "<topic>-bars"): only its open trades and last close are used here
async function fetchChart() {
  try {
    const feed = await getJSON('../status_feed.json');
    for (const u of NB.feedUrls(feed)) {
      const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 8000) : 0;
      let txt = null;
      try { const r = await fetch(u, { cache: 'no-store', ...(ac ? { signal: ac.signal } : {}) }); txt = r.ok ? await r.text() : null; } catch (_) { txt = null; } finally { clearTimeout(tm); }
      const p = txt ? NB.parse(txt) : null;
      if (p) { const b = NB.unpack(p); return { opens: Array.isArray(p.open) ? p.open : [], last: b.length ? b[b.length - 1][4] : null, t: +p.t || null }; }
    }
  } catch (_) { /* no chart post: the strip shows the report's numbers alone */ }
  return null;
}
// payout readiness (../nq/payready.js): the PC's funded tracker from its ntfy post (S.lite = mf + board), the coach's MFFU rules; DEMO = the NQ example
function renderPay() {
  const box = $('payReady'); if (!box) return;
  try {
    const td = C.etParts ? C.etParts(nowS()).day : new Date().toISOString().slice(0, 10);
    let lite = S.lite, src = "From your PC's 15-minute report (its funded tracker). MFFU's rules as the payout coach codes them.";
    if (S.demo) {
      lite = JSON.parse(JSON.stringify((S.nqfx && S.nqfx.payready_lite) || {})); src = 'EXAMPLE numbers (DEMO).';
      for (const r of (lite.mf && lite.mf.a) || []) if (typeof r.lt_days_ago === 'number') { const t = new Date(td + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - r.lt_days_ago); r.lt = t.toISOString().slice(0, 10); }
    } else if (!lite) src = "Your PC's report has not arrived on this page yet: the tracker fills in from it.";
    const L = PR.model(lite, S.demo ? null : S.home0, S.biz, window.PAYOUT_COACH || null, td);
    PR.draw(box, L);
    const p = $('payReadyPill'), ready = L.filter((a) => a.status === 'ready').length;
    if (p) { p.textContent = ready ? `${ready} READY` : L.length ? 'Not yet' : 'No funded account'; p.className = 'pill ' + (ready ? 'ok' : 'warn'); }
    const s2 = $('payReadySrc'); if (s2) s2.textContent = src;
  } catch (_) { /* the rest of the page still draws */ }
}
// round 3: the reels (Odeon, ~0.5 MB) and the Why study load once, when their card is about to show
function watchMerged() {
  if (S.mgWatch) return; S.mgWatch = true;
  // the Why study is small (~15 KB): drawn with the first paint (no jump); the reels file (~0.5 MB) waits for its card, whose list has a fixed height
  getJSON('../why/why.json').then((w) => { try { MG.drawWhy($('why'), MG.why(w)); } catch (_) { /* nothing */ } });
  const jobs = [['reelsCard', async () => { const o = await getJSON('../odeon/trades.json', 12000); MG.drawReels($('reels'), MG.reels(o), 8); }]];
  for (const [id, job] of jobs) {
    const card = $(id); if (!card) continue;
    const go = () => job().catch(() => {}).finally(() => card.classList.remove('mg-lazy'));
    if (!('IntersectionObserver' in window)) { go(); continue; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '400px 0px' });
    io.observe(card);
  }
}
function renderFiltered() { renderCal(); renderTrades(); renderEdge(); renderEquity(); renderDeep(); }
function render() {
  model();
  $('demo').hidden = !S.demo;
  if (!S.srcPicked) { S.src = C.defaultSrc(S.rows); S.srcPicked = true; }
  if (S.acct !== 'all' && !S.srcPicked2) { S.srcPicked2 = true; if (C.liveAccounts(S.rows).some((a) => a.k === S.acct)) S.src = 'live'; }
  renderBanner(); renderToday(); renderAccts(); renderPay(); watchMerged(); renderFilters(); renderFiltered(); renderStats(); renderRules(); renderTwins();
  const n = C.counts(S.rows);
  say(`${S.live.head} ${n.live} live, ${n.paper} paper and ${n.backtest} backtest trades.${S.demo ? ' Example numbers, not real.' : ''}`);
  S.ready = true;
  settleBoxes();
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
// no layout jump (night-polish 2026-11-20): trading.css holds the status line and the banner at their usual height and keeps the cards under them unseen
// until the first draw, and keeps the ZEUS edge chip's place until it has drawn (or given up); here they are let go
function settleBoxes() {
  const root = document.documentElement, chip = $('zeusEdge');
  root.classList.add('tr-drawn');
  if (!chip || S.edgeWatch) return;
  S.edgeWatch = true;
  const done = () => root.classList.add('tr-edge');
  if (chip.childElementCount) { done(); return; }
  try { new MutationObserver((m, ob) => { if (chip.childElementCount) { ob.disconnect(); done(); } }).observe(chip, { childList: true }); } catch (_) { done(); return; }
  setTimeout(done, 6000);                     // no edge data after 6 s (edge_chip.js waits up to ~4 s for the PC feed): the chip's place goes
}
async function refresh() {
  if (S.forced || document.hidden) return;
  const raw = await getJSON('../home.json'), home = await withFeed(raw);
  if (home) S.home = home;
  if (raw) S.home0 = raw;
  { const c = await fetchChart(); if (c) S.chart = c; }
  render();
}
async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  if (C.SRC[q.get('src')]) { S.src = q.get('src'); S.srcPicked = true; }
  if (q.get('bot') === 'LIT' || q.get('bot') === 'ATLAS') S.bot = q.get('bot');
  if (/^[a-z0-9_]{2,24}$/.test(q.get('acct') || '')) S.acct = q.get('acct');
  if (/^\d{4}-\d{2}$/.test(q.get('month') || '')) S.month = q.get('month');
  $('calPrev').addEventListener('click', () => stepMonth(-1)); $('calNext').addEventListener('click', () => stepMonth(1));
  let x0 = null, y0 = null;
  $('cal').addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  $('cal').addEventListener('touchend', (e) => { if (x0 == null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepMonth(dx < 0 ? 1 : -1); }, { passive: true });
  $('sheetClose').addEventListener('click', closeSheet); $('veil').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const [fx, file, home, rules, biz] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('./trades.json'), S.forced ? null : getJSON('../home.json'), getJSON('../ledger/rules.json'), getJSON('../business/accounts.json')]);
  S.fixture = fx; S.file = file; S.home = home; S.home0 = home; S.rules = rules; S.biz = biz;
  S.nqfx = (!file || S.forced) ? await getJSON('../nq/fixture.json') : null;
  render();
  if (!S.forced) fetchChart().then((c) => { if (c) { S.chart = c; renderAccts(); } });
  if (!S.forced) withFeed(home).then((hm) => { if ((hm !== home || S.lite) && !S.forced) { S.home = hm || S.home; render(); } });
  setInterval(() => { if (!document.hidden) { renderBanner(); renderToday(); } }, 60000);
  setInterval(refresh, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  const A = window.AGORA;
  if (A && A.pull) A.pull(async () => { await refresh(); if (A.toast) A.toast(S.forced ? 'Demo numbers: nothing to refresh' : 'Up to date'); });
}
// async module (perf): the kit's deferred scripts (the deep-dive charts nqdeep.js among them) may arrive after the first draw: draw those parts again then
window.addEventListener('load', () => { try { if (S.ready) renderFiltered(); } catch (_) { /* nothing */ } });
window.TRADING = { S, C, DK, ready: () => S.ready, render, openDay, closeSheet, stepMonth };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Trading could not start'); } catch (_) { /* nothing */ } });
