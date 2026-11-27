// THE BOT'S EDGE page (ES module; MNEMOSYNE's second page, night-botgap 2026-11-18). The maths is edgecore.js (pure, node-tested); this file only reads the published
// files (edge.json, ../trading/trades.json, ../odeon/trades.json), the PC's public status feed (../pc_feed.js, at most 3 s) and draws. Text only through textContent /
// createElementNS. It never sends anything and never trades. localStorage 'journal.edge.v1' keeps only the chosen bot / set / grouping on this phone.
// window.EDGE is the test hook. ?at=<ISO time> fixes "now" (tests), ?bot=ATLAS / ?set=H2 / ?by=session open a view.
import * as C from './edgecore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const KEY = 'journal.edge.v1';
const Q = new URLSearchParams(location.search);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const nowS = () => { const a = Q.get('at'); const t = a ? Date.parse(a) : NaN; return Math.floor((Number.isFinite(t) ? t : Date.now()) / 1000); };
const ago = (s) => (s == null ? '' : s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`);

const S = { edge: null, trading: null, odeon: null, lite: null, rows: [], real: [], bot: 'LIT', set: '2026', by: 'setup', ready: false, feedDone: false, renders: 0 };
(function prefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { p = {}; }
  const bot = Q.get('bot') || p.bot, set = Q.get('set') || p.set, by = Q.get('by') || p.by;
  if (C.BOTS[bot]) S.bot = bot;
  if (C.SETS.some((s) => s[0] === set)) S.set = set;
  if (['setup', 'session', 'weekday', 'exit'].includes(by)) S.by = by;
})();
function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify({ bot: S.bot, set: S.set, by: S.by })); } catch (_) { /* private mode: the view is not remembered */ } }

async function getJSON(url, ms = 8000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
let feedLib = null;
/** the PC's ntfy status (../pc_feed.js, the same file and version the Trading page loads), or null; never throws, ~3 s at most */
function pcFeed() {
  if (!feedLib) feedLib = window.PC_FEED ? Promise.resolve(window.PC_FEED) : new Promise((res) => { try { const sc = document.createElement('script'); sc.src = '../pc_feed.js?v=n10'; sc.async = true; sc.onload = () => res(window.PC_FEED || null); sc.onerror = () => res(null); document.head.appendChild(sc); } catch (_) { res(null); } });
  return feedLib.then((F) => (F && F.fetchLatest ? Promise.race([F.fetchLatest({ feedUrl: '../status_feed.json' }), new Promise((r) => setTimeout(() => r(null), 3000))]) : null)).catch(() => null);
}

// ------------------------------------------------------------------------------------------------ the chips
function seg(el, items, cur, on) {
  clear(el);
  for (const [k, label] of items) {
    const b = h('button', '', label); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(k === cur)); b.dataset.k = k; b.dataset.olyCue = 'tap';
    b.addEventListener('click', () => { on(k); savePrefs(); render(); });
    el.appendChild(b);
  }
}
const SET_CHIPS = [['2026', '2026'], ['H1', 'Jan-Jun'], ['H2', 'Jul-Oct'], ['old', '2021-25'], ['real', 'Real']];
const BY = [['setup', 'Setup'], ['session', 'Session'], ['weekday', 'Weekday'], ['exit', 'Exit']];
const BY_WORD = { setup: 'setup', session: 'session window', weekday: 'weekday', exit: 'exit type' };

function name() { return C.BOTS[S.bot].name; }
function cur() { return C.pick(S.rows.concat(S.real), { bot: S.bot, set: S.set }); }
function realBot() { return S.real.filter((x) => x.bot === S.bot); }
function dollarsAt(rows) {
  const k = C.riskNow(realBot());
  if (k) return { k, word: `at your recent real size (${C.money(k)} a trade)` };
  const s = C.stats(rows);
  return { k: s.risk || (S.edge && S.edge.risk ? S.edge.risk[C.BOTS[S.bot].key] : null), word: `at the backtest's ${C.money(s.risk || 0)} a trade` };
}

function renderPick() {
  seg($('bots'), Object.keys(C.BOTS).map((k) => [k, C.BOTS[k].name]), S.bot, (k) => { S.bot = k; });
  seg($('sets'), SET_CHIPS, S.set, (k) => { S.set = k; });
  const e = S.edge, key = C.BOTS[S.bot].key;
  let note;
  if (S.set === 'real') {
    const n = realBot().length, lt = S.lite && S.lite.reporter ? S.lite.reporter.t : null;
    note = `Real MFFU trades and the paper twin, one row per signal (${n} for ${name()}): the site's files${S.trading && S.trading.upto && S.trading.upto.live_lit ? ` (to ${C.dayWord(S.trading.upto.live_lit, true)})` : ''} and ${S.lite ? `the PC's live feed (${ago(nowS() - (lt || S.lite.t))})` : 'no PC feed right now'}.`;
  } else if (e && e.sources) {
    const up = S.bot === 'LIT' ? e.upto && e.upto.lit : e.upto && e.upto.atlas;
    note = `${C.str(e.sources[key], 260)} Data to ${C.dayWord(up, true)}; list built ${C.dayWord(String(e.built || '').slice(0, 10), true)}.`;
  } else note = 'The trade list (edge.json) did not load; the real trades still show under Real.';
  $('srcNote').textContent = note;
}

function tile(label, value, sub) { const t = h('div', 'tile'); t.appendChild(h('small', '', label)); t.appendChild(h('b', '', value)); t.appendChild(h('span', 'r', sub)); return t; }
function renderSummary(rows) {
  const s = C.stats(rows), T = $('tiles'); clear(T);
  T.appendChild(tile('Trades', String(s.n), s.perWeek != null ? `${s.perWeek} a week` : 'no trades'));
  const t2 = tile('Per trade', C.moneyS(s.exp), `${C.rWord(s.expR)} a trade`); t2.querySelector('b').className = sign(s.exp); T.appendChild(t2);
  T.appendChild(tile('Made money', s.winPct == null ? '-' : s.winPct + '%', `of the trades · PF ${C.pfWord(s.pf)} · ${s.scratches} near breakeven`));
  const t4 = tile('Net', C.moneyS(s.net), `${C.rWord(s.netR, 1)}${s.sqn != null ? ` · SQN ${s.sqn}` : ''}`); t4.querySelector('b').className = sign(s.net); T.appendChild(t4);
  const mo = s.exp != null && s.perWeek != null ? s.exp * s.perWeek * 4.33 : null;
  if (!s.n) { $('sumLine').textContent = `No ${name()} trades in this set yet.`; return; }
  if (S.set === 'real') {
    const re = C.stats(rows.filter((x) => x.src === 'live')), pa = C.stats(rows.filter((x) => x.src === 'paper'));
    $('sumLine').textContent = `Real money: ${re.n} trade${re.n === 1 ? '' : 's'}, ${C.both(re.net, re.netR)}. Paper twin: ${pa.n} trade${pa.n === 1 ? '' : 's'}, ${C.both(pa.net, pa.netR)} (paper runs its own size and is not money). Too few trades to judge the edge; the backtest sets show it.`;
    return;
  }
  $('sumLine').textContent = `In the backtest ${name()} made ${C.both(s.exp, s.expR)} a trade at ${s.perWeek} trades a week${mo != null ? `: about ${C.moneyS(mo)} a month at ${C.money(s.risk || 0)} a trade` : ''}. Expectancy = the average result of one trade; SQN above 2 is a good system, above 3 an excellent one.`;
}

function renderRun() {
  const hist = C.pick(S.rows, { bot: S.bot, set: 'all' }), real = realBot();
  const st = C.streak(hist, real, { window: 40 }), k = C.riskNow(real) || (S.edge && S.edge.risk ? S.edge.risk[C.BOTS[S.bot].key] : null);
  const card = S.lite && S.lite.board ? S.lite.board[S.bot === 'LIT' ? 'lit' : 'atlas'] : null;
  const room = card && typeof card.room === 'number' ? card.room : null;
  const W = C.streakLines(st, name(), k, room);
  $('runHead').textContent = W.head; $('runHead').dataset.level = st.level;
  const L = $('runLines'); clear(L); for (const x of W.lines) L.appendChild(h('li', '', x));
  const svg = $('runBars'); clear(svg);
  const R = C.runs(hist.map((x) => C.outcome(x.r))), top = Math.max(st.longestAll || 0, st.longest || 0, st.current, 1), cnt = [];
  for (let i = 1; i <= top; i++) cnt.push(R.lens.filter((x) => x === i).length);
  const mx = Math.max(1, ...cnt), bw = Math.min(36, (330 - 10) / top - 4);
  cnt.forEach((c, i) => {
    const x = 10 + i * (bw + 4), hh = c ? Math.max(2, (c / mx) * 58) : 0, isCur = st.current === i + 1;
    svg.appendChild(sv('rect', { x, y: 66 - hh, width: bw, height: hh, rx: 3, fill: isCur ? '#e0b060' : 'rgba(201, 106, 74, .75)' }));
    svg.appendChild(sv('text', { x: x + bw / 2, y: 80, 'text-anchor': 'middle', fill: '#dcd1c2', 'font-size': 10 }, String(i + 1)));
    if (c) svg.appendChild(sv('text', { x: x + bw / 2, y: 62 - hh, 'text-anchor': 'middle', fill: '#c4bbac', 'font-size': 9 }, String(c)));
  });
  if (st.current > top) svg.appendChild(sv('text', { x: 330, y: 20, 'text-anchor': 'end', fill: '#e0b060', 'font-size': 11 }, `now: ${st.current}`));
  svg.appendChild(sv('text', { x: 10, y: 94, fill: '#c4bbac', 'font-size': 10 }, 'Losing runs, backtest 2021-26: how often each length came. Gold = now.'));
}

function renderFills() {
  const f = C.fills(S.lite, nowS()), L = $('fillLines'), R = $('fillChecks'); clear(L); clear(R);
  if (f && (f.audit || f.checks.length)) {
    $('fillHead').textContent = `From the PC's fill check${f.age != null ? `, ${ago(f.age)}` : ''}.`;
    for (const x of (f.audit && f.audit.lines) || []) L.appendChild(h('li', '', x));
    for (const m of (f.audit && f.audit.months) || []) {
      const li = h('li', m.slip < 0 || m.missed ? 'dn' : 'up'); li.appendChild(h('span', 'nm', C.dayWord(m.month + '-01', true).replace(' 1,', ''))); li.appendChild(h('span', 'v ' + sign(m.slip), C.moneyS(m.slip)));
      li.appendChild(h('span', 'meta', `${m.n} trade${m.n === 1 ? '' : 's'} checked · slippage ${C.moneyS(m.slip)} · ${m.missed ? `${m.missed} missed (${C.moneyS(m.missedUsd)} the backtest made)` : 'none missed'}`)); R.appendChild(li);
    }
    for (const c of f.checks) { const li = h('li', c.ok ? 'up' : 'warn'); li.appendChild(h('span', 'nm', `${c.name} · ${C.dayWord(c.day)}`)); li.appendChild(h('span', 'v', c.ok ? 'OK' : 'Check')); li.appendChild(h('span', 'meta', c.line)); R.appendChild(li); }
    $('fillNote').textContent = C.COSTS_LINE;
    return;
  }
  $('fillHead').textContent = "The PC checks every real fill, but it does not send the results to the phone yet.";
  for (const x of ['What it checks on every trade: the micros NinjaTrader filled, the stop in place at the broker, entry and stop slippage over 2 ticks, the bracket prices, costs above plan, an entry that never filled.',
    'A problem already reaches you at once as a phone alert; this card fills in by itself once the PC sends its checks (one line on the PC side, for the lead).', C.COSTS_LINE]) L.appendChild(h('li', '', x));
  const last = realBot().filter((x) => x.src === 'live').slice(-4).reverse();
  for (const x of last) {
    const li = h('li', x.usd >= 0 ? 'up' : 'dn'); li.appendChild(h('span', 'nm', `${C.dayWord(x.day)} ${x.hm} ${x.side}${x.qty ? ` · ${x.qty} micro${x.qty === 1 ? '' : 's'}` : ''}`));
    li.appendChild(h('span', 'v ' + sign(x.usd), C.both(x.usd, x.r))); li.appendChild(h('span', 'meta', `${x.exit === 'STOP' ? 'Stop' : x.exit === 'TARGET' ? 'Target' : x.exit} · real account · fill check on the PC only`)); R.appendChild(li);
  }
  $('fillNote').textContent = last.length ? `The newest real ${name()} trades from the PC's feed and the site's files.` : `No real ${name()} trade in the feed right now.`;
}

function renderGroups(rows) {
  seg($('groupBy'), BY, S.by, (k) => { S.by = k; });
  const G = C.groups(rows, S.by), U = $('grpRows'); clear(U);
  $('grpLine').textContent = rows.length ? C.groupLine(G, BY_WORD[S.by]) : `No ${name()} trades in this set yet.`;
  for (const g of G) {
    const li = h('li', g.exp > 0 ? 'up' : g.exp < 0 ? 'dn' : ''), nm = h('span', 'nm', g.label);
    if (g.holds) nm.appendChild(h('span', 'badge ' + g.holds, g.holds === 'both' ? 'both 2026 halves +' : g.holds === 'mixed' ? 'one half only' : 'both halves -'));
    li.appendChild(nm); li.appendChild(h('span', 'v ' + sign(g.exp), `${C.moneyS(g.exp)} (${C.rWord(g.expR)})`));
    li.appendChild(h('span', 'meta', `${g.n} trades · ${g.winPct == null ? '-' : g.winPct + '% wins'} · PF ${C.pfWord(g.pf)} · total ${C.moneyS(g.net)}${g.enough ? '' : ' · under 5 trades: no claim'}`));
    U.appendChild(li);
  }
}

function renderHeat(rows) {
  const H = C.heat(rows), svg = $('heat'); clear(svg);
  const x0 = 34, y0 = 16, cw = (338 - x0) / H.hours.length, ch = 23;
  H.hours.forEach((hr, i) => { if (H.hours.length <= 16 || i % 2 === 0) svg.appendChild(sv('text', { x: x0 + i * cw + cw / 2, y: 11, 'text-anchor': 'middle', fill: '#c4bbac', 'font-size': 9.5 }, String(hr))); });
  H.cells.forEach((row, d) => {
    svg.appendChild(sv('text', { x: 0, y: y0 + d * ch + ch / 2 + 4, fill: '#dcd1c2', 'font-size': 11 }, C.DAYS[d]));
    row.forEach((c, i) => {
      const a = c.enough && H.max ? 0.18 + 0.72 * Math.min(1, Math.abs(c.usd) / H.max) : 0;
      const fill = !c.n ? 'rgba(255,255,255,.03)' : !c.enough ? 'rgba(255,255,255,.10)' : c.usd >= 0 ? `rgba(174, 184, 110, ${a.toFixed(2)})` : `rgba(201, 106, 74, ${a.toFixed(2)})`;
      svg.appendChild(sv('rect', { x: x0 + i * cw + 1, y: y0 + d * ch + 1, width: Math.max(1, cw - 2), height: ch - 2, rx: 3, fill }));
      if (c.n && cw >= 16) svg.appendChild(sv('text', { x: x0 + i * cw + cw / 2, y: y0 + d * ch + ch / 2 + 3.5, 'text-anchor': 'middle', fill: c.enough ? '#f3e7d6' : '#a89f92', 'font-size': 9 }, String(c.n)));
    });
  });
  svg.appendChild(sv('text', { x: x0, y: 147, fill: '#c4bbac', 'font-size': 9.5 }, 'Hour, New York (24 h) · number = trades · colour = $ (3+)'));
  const L = $('heatLines'); clear(L);
  if (!H.n) { L.appendChild(h('li', '', 'No trades in this set yet.')); return; }
  if (H.best) L.appendChild(h('li', '', `Best: ${C.cellWord(H.best)}.`));
  if (H.worst && H.worst !== H.best) L.appendChild(h('li', '', `Weakest: ${C.cellWord(H.worst)}.`));
  if (H.busy.length) L.appendChild(h('li', '', `Most trades start at ${H.busy.map(C.hourWord).join(', ')} New York time: the hours to be at the desk (MFFU wants the trader there).`));
}

function renderMae(rows) {
  const E = C.excursion(rows), D = dollarsAt(rows), L = $('maeLines'); clear(L);
  L.appendChild(h('li', '', `MAE = how far a trade went against you before it ended; MFE = how far it went your way. Dollars ${D.word}.`));
  for (const x of C.excursionLines(E, D.k)) L.appendChild(h('li', '', x));
  const svg = $('maeDots'); clear(svg);
  const x0 = 30, x1 = 334, y0 = 8, y1 = 150, rMin = -1.6, rMax = 6.5, Y = (r) => y1 - ((Math.max(rMin, Math.min(rMax, r)) - rMin) / (rMax - rMin)) * (y1 - y0), X = (m) => x0 + Math.max(0, Math.min(1, m)) * (x1 - x0);
  svg.appendChild(sv('line', { x1: x0, x2: x1, y1: Y(0), y2: Y(0), stroke: 'rgba(255,255,255,.25)', 'stroke-dasharray': '3 3' }));
  for (const [r, t] of [[6, '+6R'], [3, '+3R'], [0, '0'], [-1, '-1R']]) svg.appendChild(sv('text', { x: 0, y: Y(r) + 3.5, fill: '#c4bbac', 'font-size': 9.5 }, t));
  for (const [m, t] of [[0, '0'], [0.5, '0.5R'], [1, '1R = stop']]) svg.appendChild(sv('text', { x: X(m), y: 165, 'text-anchor': m === 1 ? 'end' : m === 0 ? 'start' : 'middle', fill: '#c4bbac', 'font-size': 9.5 }, t));
  for (const x of rows) {
    if (x.mae == null || x.r == null) continue;
    const o = C.outcome(x.r);
    svg.appendChild(sv('circle', { cx: X(x.mae).toFixed(1), cy: Y(x.r).toFixed(1), r: 2.4, fill: o === 'W' ? 'rgba(174, 184, 110, .75)' : o === 'L' ? 'rgba(201, 106, 74, .6)' : 'rgba(220, 209, 194, .45)' }));
  }
  const U = $('maeList'); clear(U);
  const last = rows.slice(-10).reverse();
  if (!last.length) U.appendChild(h('li', '', 'No trades in this set yet.'));
  for (const x of last) {
    const li = h('li', x.r >= 0.5 ? 'up' : x.r <= -0.5 ? 'dn' : '');
    li.appendChild(h('span', 'nm', `${C.dayWord(x.day, true)} ${x.hm} ${x.side === 'SHORT' ? 'Short' : 'Long'} · ${x.setup}`));
    li.appendChild(h('span', 'v ' + sign(x.usd), C.both(x.usd, x.r)));
    const k = x.risk || (x.r && Math.abs(x.r) > 0.05 ? Math.abs(x.usd / x.r) : 0);
    li.appendChild(h('span', 'meta', x.mae != null ? `Went ${C.money(x.mae * k)} (${(x.mae || 0).toFixed(2)}R) against first, best ${C.money((x.mfe || 0) * k)} (${(x.mfe || 0).toFixed(2)}R) · ${x.exit === 'STOP' ? 'stopped' : x.exit === 'TARGET' ? 'target' : x.exit === 'BE' ? 'breakeven' : x.exit === 'CUT' ? '15-minute check' : x.exit === 'HEDGE' ? 'closed for Zlarior' : 'flat by the close'}${x.src !== 'backtest' ? ` · ${x.src === 'live' ? 'real' : 'paper'}` : ''}`
      : `${x.src === 'live' ? 'Real' : 'Paper'} trade: how far it went against you is not in the feed`));
    U.appendChild(li);
  }
}

function renderEquity(rows) {
  const cv = C.curve(rows), svg = $('eqSvg'); clear(svg);
  const D = dollarsAt(rows), x0 = 4, x1 = 336, top = 6, mid = 106, bot = 150;
  if (cv.n >= 2) {
    const lo = Math.min(0, ...cv.pts.map((p) => p.cum)), hi = Math.max(1, ...cv.pts.map((p) => p.cum)), dlo = Math.min(-1, cv.maxDD);
    const X = (i) => x0 + (i / (cv.n - 1)) * (x1 - x0), Y = (v) => mid - 6 - ((v - lo) / (hi - lo)) * (mid - 6 - top), YD = (v) => mid + 6 + (v / dlo) * (bot - mid - 6);
    svg.appendChild(sv('line', { x1: x0, x2: x1, y1: Y(0), y2: Y(0), stroke: 'rgba(255,255,255,.2)', 'stroke-dasharray': '3 3' }));
    svg.appendChild(sv('polyline', { points: cv.pts.map((p) => `${X(p.i).toFixed(1)},${Y(p.cum).toFixed(1)}`).join(' '), fill: 'none', stroke: '#e08a6b', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
    svg.appendChild(sv('polygon', { points: `${X(0).toFixed(1)},${YD(0).toFixed(1)} ` + cv.pts.map((p) => `${X(p.i).toFixed(1)},${YD(p.dd).toFixed(1)}`).join(' ') + ` ${X(cv.n - 1).toFixed(1)},${YD(0).toFixed(1)}`, fill: 'rgba(201, 106, 74, .45)', stroke: 'none' }));
    svg.appendChild(sv('text', { x: x0, y: mid + 2, fill: '#c4bbac', 'font-size': 9.5 }, `${C.dayWord(cv.pts[0].day, true)}`));
    svg.appendChild(sv('text', { x: x1, y: mid + 2, 'text-anchor': 'end', fill: '#c4bbac', 'font-size': 9.5 }, `${C.dayWord(cv.pts[cv.n - 1].day, true)}`));
    svg.appendChild(sv('text', { x: x1, y: bot + 9, 'text-anchor': 'end', fill: '#c4bbac', 'font-size': 9.5 }, `drawdown under the last high (deepest ${C.moneyS(cv.maxDD)})`));
  }
  const sc = D.k && cv.maxDDR ? ` At ${C.money(D.k)} a trade that deepest drawdown is about ${C.moneyS(cv.maxDDR * D.k)}.` : '';
  $('eqLine').textContent = !cv.n ? `No ${name()} trades in this set yet.`
    : `Net ${C.both(cv.net, cv.netR, 1)} over ${cv.n} trades. Deepest drawdown ${C.both(cv.maxDD, cv.maxDDR, 1)}${cv.recovery != null ? `; net is ${cv.recovery}x the deepest drawdown (recovery factor)` : ''}.${cv.longest && cv.longest.days ? ` Longest time under the last high: ${cv.longest.days} days.` : ''}${cv.under ? ` Now ${C.moneyS(cv.under.depth)} under the last high (${cv.under.days} days).` : ''}${sc}`;
  const U = $('ddRows'); clear(U);
  cv.top.forEach((d, i) => {
    const li = h('li', 'dn'); li.appendChild(h('span', 'nm', `${i + 1}. ${C.dayWord(d.from, true)} to ${C.dayWord(d.low, true)}`)); li.appendChild(h('span', 'v neg', C.both(d.depth, d.depthR, 1)));
    li.appendChild(h('span', 'meta', `${d.trades} trades under the high · ${d.recovered ? `back on ${C.dayWord(d.to, true)}, ${d.days} days after the high` : `not back yet (${d.days} days so far)`}`)); U.appendChild(li);
  });
}

function render() {
  S.renders++;
  const rows = cur();
  renderPick(); renderSummary(rows); renderRun(); renderFills(); renderGroups(rows); renderHeat(rows); renderMae(rows); renderEquity(rows);
  $('demo').hidden = !!(S.rows.length || S.real.length);
  $('live').hidden = !S.lite;
  const e = S.edge;
  $('foot').textContent = `Read only. Backtest = history on CME NQ futures bars${e && e.upto && e.upto.lit ? ` (to ${C.dayWord(e.upto.lit, true)})` : ''}, costs in, not money made. Real trades come from the PC. Nothing here changes the bot.`;
}

async function start() {
  const [edge, trading, odeon] = await Promise.all([getJSON('./edge.json'), getJSON('../trading/trades.json'), getJSON('../odeon/trades_lite.json').then((x) => x || getJSON('../odeon/trades.json'))]);   // the slim copy first (dogfood 2026-11-20)
  S.edge = edge; S.trading = trading; S.odeon = odeon;
  S.rows = C.rowsFrom(edge);
  S.real = C.realRows(trading, odeon, null, nowS());
  render();
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  const lite = await pcFeed();
  if (lite) { S.lite = lite; S.real = C.realRows(trading, odeon, lite, nowS()); render(); }
  S.feedDone = true;
  $('status').textContent = lite ? `PC feed read ${ago(nowS() - ((lite.reporter && lite.reporter.t) || lite.t))}.` : 'No fresh PC feed right now: showing the site’s files.';
}

window.EDGE = { S, C, ready: () => S.ready, feedDone: () => S.feedDone, render };
start().catch((e) => { $('status').textContent = 'Could not draw the page: ' + String(e && e.message || e).slice(0, 120); S.ready = true; try { if (O && O.ready) O.ready(); } catch (_) { /* */ } });
