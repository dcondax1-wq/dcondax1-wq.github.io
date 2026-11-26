// NQ LIVE screen (day-livedash 2026-11-26). The rules live in livecore.js (pure, node-tested); this file fetches and draws.
// Reads ../home.json, ../business/accounts.json, ../business/payday.json once, the PC's public status post (../pc_feed.js fetchLatest)
// every 22 s and its chart post (nqbars.js) every 60 s, only while the screen is visible. Text only through textContent / createElement;
// the chart is SVG made with createElementNS. Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests and screenshots only).
import * as D from './nqdesk.js?v=8';
import * as K7 from './clock7.js?v=2';
import * as A from './acctcore.js?v=1';
import * as B from './nqbars.js?v=b1';
import * as L from './livecore.js?v=1';

const $ = (id) => document.getElementById(id);
const S = { home: null, lite: null, biz: null, payday: null, bars: null, feed: null, model: null, ready: false, loaded: false, polls: 0, barsAt: 0 };
const AT = (() => { try { const v = new URLSearchParams(location.search).get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; } catch (_) { return null; } })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
const BARS_MS = 60000;

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getText(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-store', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.text() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getPost() {
  const F = window.PC_FEED;
  if (!F || !F.fetchLatest) return null;
  try { return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}
async function getBars() {
  if (!S.feed) S.feed = await getJSON('../status_feed.json');
  for (const u of B.feedUrls(S.feed)) {
    const t = await getText(u);
    if (t == null) continue;
    try { const p = await B.parseVerified(t, S.feed, nowS()); if (p) return p; } catch (_) { /* next */ }
  }
  return null;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const signCls = (v) => (L.num(v) === null || Math.round(v) === 0 ? '' : v > 0 ? 'ok' : 'bad');

function cards(t) {
  const home = S.home || {}, F = window.PC_FEED;
  const h = S.lite && F && F.homeOver ? F.homeOver(home, S.lite, t, window.PAYOUT_COACH || null) : home;
  try {
    const et = L.et(t);
    return A.build(D.accounts(h, S.biz, t), K7.rows(S.lite, t), { lite: S.lite, biz: S.biz, payday: S.payday, nowS: t, today: K7.tradingDay(t), minuteET: et ? +et.hm.slice(0, 2) * 60 + +et.hm.slice(3) : null, etDate: et && et.day }).cards;
  } catch (_) { return []; }
}
export function model(t) {
  const bars = S.bars ? { ...S.bars } : null;
  if (bars) { const u = B.unpack(bars); bars._last = u.length ? u[u.length - 1] : null; bars._u = u; }
  return L.build({ lite: S.lite, bars, cards: cards(t), nowS: t });
}

// ------------------------------------------------------------------------------------------------ draw
function drawHealth(M) {
  const H = M.health, box = $('health');
  box.dataset.level = H.level;
  $('healthTitle').textContent = H.title + (H.reason && H.level === 'ok' ? ` · ${H.reason}` : '');
  const ul = $('healthBots'); ul.textContent = '';
  for (const b of H.bots || []) ul.appendChild(el('li', b.state, `${b.name}: ${b.text}`));
  const ll = $('healthLines'); ll.textContent = '';
  for (const x of H.lines) ll.appendChild(el('li', x.level, x.text));
  const pc = $('pc'); pc.textContent = M.pc.text; pc.dataset.level = M.pc.level;
}

function drawTrade(M) {
  const O = M.open, box = $('trade'), flat = $('flat'), app = $('app');
  app.dataset.trade = O ? '1' : '0';
  box.hidden = !O; flat.hidden = !!O;
  if (!O) {
    const fa = $('flatAge'); fa.textContent = M.pc.ageS === null ? '' : `as of ${L.ago(M.pc.ageS)}`; fa.dataset.level = M.pc.level;
    const armed = M.accounts.filter((a) => a.state === 'armed').map((a) => a.name);
    const next = M.setups.find((s) => s.id === 'lit') || M.setups[0];
    $('flatText').textContent = !S.lite ? 'Waiting for the PC\'s report.'
      : `Flat right now. ${armed.length ? `Armed: ${armed.join(', ')}.` : 'No account is armed.'}${next && next.label ? ` ${next.name} is at step ${next.n ?? '?'}/${next.of}: ${next.label}.` : ''}`;
    $('chart').textContent = ''; $('chartNote').textContent = '';
    return;
  }
  box.dataset.sign = O.usd === null ? '' : O.usd > 0 ? 'up' : O.usd < 0 ? 'down' : '';
  const ta = $('tradeAge'); ta.textContent = O.pxAge === null ? 'price unknown' : `price ${L.ago(O.pxAge)}`; ta.dataset.level = O.lvl;
  const side = $('tradeSide'); side.textContent = '';
  side.append(el('span', O.side === 'LONG' ? 'long' : 'short', O.side), document.createTextNode(` ${O.qty || '?'} MNQ · ${O.botName}`));
  $('tradeWho').textContent = `${O.accounts.map((a) => a.name + (a.qty ? ` (${a.qty})` : '')).join(' · ')}${O.others ? ` · +${O.others} other open` : ''} · in for ${L.dur(O.inFor)}`;
  const u = $('tradeUsd'); u.textContent = O.usd === null ? '-' : L.usd(O.usd, true); u.className = signCls(O.usd);
  $('tradeR').textContent = O.r === null ? '' : `${L.rTxt(O.r)} · ${O.pts === null ? '' : (O.pts >= 0 ? '+' : '-') + L.ptsTxt(O.pts)}`;
  const g = $('tradeGrid'); g.textContent = '';
  const cell = (k, v, cls) => { const d = el('div'); d.append(el('dt', null, k), el('dd', cls || null, v)); g.appendChild(d); };
  cell('Entry', L.pxTxt(O.entry));
  cell(O.be ? 'Stop (BE)' : 'Stop', L.pxTxt(O.stop), 'bad');
  cell('Target', L.pxTxt(O.target), 'ok');
  cell('Price now', L.pxTxt(O.px));
  cell('To stop', O.toStop === null ? '-' : L.ptsTxt(O.toStop));
  cell('To target', O.toTarget === null ? '-' : L.ptsTxt(O.toTarget));
  cell('Risk', O.riskUsd === null ? '-' : L.usd(O.riskUsd));
  cell('Entered', L.et(O.t) ? `${L.et(O.t).hm} ET` : '-');
  cell('Price from', O.pxSrc || '-');
  drawChart(O);
}

const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); if (text != null) e.textContent = String(text); return e; }
function drawChart(O) {
  const box = $('chart'), note = $('chartNote'); box.textContent = '';
  const all = S.bars ? B.unpack(S.bars) : [];
  if (!all.length) { note.textContent = 'The chart fills in once the PC sends its candles (about hourly while the bots trade, and right after each entry).'; return; }
  const from = O.t - 12 * 300, bars = all.filter((b) => b[0] >= from).slice(-48);
  const use = bars.length >= 4 ? bars : all.slice(-36);
  const W = 360, H = 170, pl = 4, pr = 58, pt = 8, pb = 8;
  const lv = [O.entry, O.stop, O.target, O.px].filter((x) => L.num(x) !== null);
  let lo = Math.min(...use.map((b) => b[3]), ...lv), hi = Math.max(...use.map((b) => b[2]), ...lv);
  const pad = (hi - lo) * 0.06 || 2; lo -= pad; hi += pad;
  const y = (p) => pt + (hi - p) / (hi - lo) * (H - pt - pb), cw = (W - pl - pr) / Math.max(use.length, 1), x = (i) => pl + i * cw + cw / 2;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  // the trade's zones: entry -> target (mint), entry -> stop (red)
  if (L.num(O.target) !== null) svg.appendChild(sv('rect', { x: pl, width: W - pl - pr, y: Math.min(y(O.entry), y(O.target)), height: Math.abs(y(O.target) - y(O.entry)), fill: 'rgba(119,219,137,.10)' }));
  if (L.num(O.stop) !== null) svg.appendChild(sv('rect', { x: pl, width: W - pl - pr, y: Math.min(y(O.entry), y(O.stop)), height: Math.abs(y(O.stop) - y(O.entry)), fill: 'rgba(255,93,108,.12)' }));
  use.forEach((b, i) => {
    const up = b[4] >= b[1], c = up ? '#77db89' : '#ff5d6c';
    svg.appendChild(sv('line', { x1: x(i), x2: x(i), y1: y(b[2]), y2: y(b[3]), stroke: c, 'stroke-width': 1 }));
    const top = y(Math.max(b[1], b[4])), h = Math.max(1, Math.abs(y(b[1]) - y(b[4])));
    svg.appendChild(sv('rect', { x: x(i) - cw * 0.35, width: Math.max(1, cw * 0.7), y: top, height: h, fill: c, opacity: 0.9 }));
  });
  const line = (p, color, label, dash) => {
    if (L.num(p) === null) return;
    svg.appendChild(sv('line', { x1: pl, x2: W - pr, y1: y(p), y2: y(p), stroke: color, 'stroke-width': 1.2, ...(dash ? { 'stroke-dasharray': '4 3' } : {}) }));
    svg.appendChild(sv('rect', { x: W - pr + 2, y: y(p) - 8, width: pr - 4, height: 16, rx: 4, fill: color }));
    svg.appendChild(sv('text', { x: W - pr / 2, y: y(p) + 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#000' }, label));
  };
  line(O.target, '#77db89', 'TP ' + Math.round(O.target), false);
  line(O.stop, '#ff5d6c', 'SL ' + Math.round(O.stop), false);
  line(O.entry, '#f1c14b', 'IN ' + Math.round(O.entry), true);
  if (L.num(O.px) !== null) {
    line(O.px, '#c9b6ff', 'NOW', true);
    svg.appendChild(sv('circle', { cx: x(use.length - 1), cy: y(O.px), r: 4, fill: '#c9b6ff' }, null)).appendChild(sv('animate', { attributeName: 'r', values: '3;6;3', dur: '1.6s', repeatCount: 'indefinite' }));
  }
  const ei = use.findIndex((b) => b[0] <= O.t && O.t < b[0] + 300);
  if (ei >= 0) svg.appendChild(sv('path', { d: O.dir === 1 ? `M${x(ei)} ${y(O.entry) + 4} l-5 9 h10 z` : `M${x(ei)} ${y(O.entry) - 4} l-5 -9 h10 z`, fill: '#f1c14b' }));
  box.appendChild(svg);
  const last = use[use.length - 1], age = Math.max(0, nowS() - (last[0] + 300));
  note.textContent = `5-minute candles from the PC's NinjaTrader, last one ${L.ago(age)}. Gold = entry, red = stop, mint = target.`;
}

function bar(cls, frac) { const w = el('div', 'lv-bar ' + (cls || '')), i = el('i'); i.style.width = frac == null ? '0%' : `${Math.round(frac * 100)}%`; w.appendChild(i); return w; }
function drawAccounts(M) {
  const box = $('accts'); box.textContent = '';
  for (const a of M.accounts) {
    const c = el('article', 'lv-acct'); c.dataset.key = a.key; c.dataset.trade = a.inTrade ? '1' : '0'; c.id = 'lv-' + a.key;
    const hd = el('div', 'lv-an'); hd.append(el('h3', null, a.name), el('span', 'lv-st ' + (a.inTrade ? 'trade' : a.state), a.inTrade ? 'IN TRADE' : a.stateText)); c.appendChild(hd);
    const td = el('p', 'lv-today ' + (a.todayLvl === 'ok' ? 'ok' : a.todayLvl === 'bad' ? 'bad' : ''), a.today); td.appendChild(el('small', null, 'today')); c.appendChild(td);
    const mine = M.open && M.open.accounts.find((x) => (L.IDS_OF[a.key] || [a.key]).includes(x.id));
    if (mine && mine.usd !== null) { const o = el('p', 'lv-open ' + signCls(mine.usd), `${L.usd(mine.usd, true)} open`); o.dataset.open = '1'; c.appendChild(o); }
    const kv = (k, v) => { const d = el('div', 'lv-kv'); d.append(el('span', null, k), el('b', null, v)); return d; };
    c.appendChild(kv(a.stage === 'Funded' ? 'Profit (MFFU)' : 'Balance', a.balance));
    c.appendChild(kv('Room left', a.room)); c.appendChild(bar(a.roomLvl === 'none' ? '' : a.roomLvl, a.roomFrac));
    c.appendChild(kv(a.goal.label === 'To first payout' ? 'To payout' : a.goal.label, a.goal.text)); c.appendChild(bar('goal', a.goal.frac));
    const f = el('div', 'lv-af'), chip = el('span', 'lv-chip', a.ageText.replace(/^PC /, '')); chip.dataset.level = a.has ? a.ageLvl : 'bad';
    f.append(chip, el('small', null, a.bots)); c.appendChild(f);
    box.appendChild(c);
  }
  const armed = M.accounts.filter((a) => a.state === 'armed').length;
  $('acctSum').textContent = `${armed} of ${M.accounts.length} armed`;
}

function drawSetups(M) {
  const box = $('setups'); box.textContent = '';
  if (!M.setups.length) { box.appendChild(el('p', 'lv-note', S.lite ? 'The PC\'s report has no setup words yet.' : 'Waiting for the PC\'s report.')); }
  for (const s of M.setups) {
    const w = el('div', 'lv-setup'); w.dataset.bot = s.id;
    const h = el('div', 'lv-sh'), n = el('span', 'lv-n', s.n === null ? '?' : String(s.n)); n.appendChild(el('small', null, `/${s.of}`));
    h.append(el('b', null, `${s.name}${s.label ? ' · ' + s.label : ''}`), n); w.appendChild(h);
    const st = el('div', 'lv-steps');
    for (let i = 1; i <= s.of; i++) st.appendChild(el('i', s.n === null ? '' : i < s.n ? 'done' : i === s.n ? (s.n === s.of ? 'done' : 'now') : ''));
    w.appendChild(st);
    if (s.wait) w.appendChild(el('p', 'lv-wait', s.wait));
    const meta = el('p', 'lv-meta');
    if (s.dist !== null) meta.appendChild(el('span', null, `${L.ptsTxt(s.dist)} away${s.distTo ? ` (${s.distTo})` : ''}`));
    if (s.window) meta.appendChild(el('span', null, s.window));
    const chip = el('span', 'lv-chip', s.ageText); chip.dataset.level = s.lvl; meta.appendChild(chip);
    w.appendChild(meta); box.appendChild(w);
  }
  const src = $('setupSrc'); src.textContent = M.rich.bf ? 'Brain feed' : M.setups.length ? 'bot glance' : ''; src.dataset.level = 'ok';
}

function drawToday(M) {
  const ol = $('today'); ol.textContent = '';
  if (!M.today.length) ol.appendChild(el('li', 'empty', S.lite ? 'No trade yet today.' : 'Waiting for the PC\'s report.'));
  for (const t of M.today) {
    const li = el('li'); li.dataset.open = t.open ? '1' : '0';
    li.appendChild(el('span', 'a', `${t.side} ${t.qty || ''} · ${t.name}${t.member ? ' · ' + t.member : ''}`));
    const u = el('span', 'u ' + (t.open ? 'warn' : signCls(t.usd)), t.open ? 'OPEN' : L.usd(t.usd, true)); u.appendChild(el('small', null, t.open ? 'see above' : L.rTxt(t.r))); li.appendChild(u);
    li.appendChild(el('span', 'm', `${t.at} ET in at ${L.pxTxt(t.entry)}${t.open ? '' : ` · out ${t.xAt ? t.xAt + ' ET' : ''}${t.exit !== null ? ' at ' + L.pxTxt(t.exit) : ''}${t.why ? ' · ' + t.why.toLowerCase() : ''}`}`));
    ol.appendChild(li);
  }
  const s = $('todaySum'); s.textContent = M.today.some((t) => !t.open) ? L.usd(M.todayUsd, true) : ''; s.className = 'lv-tsum ' + signCls(M.todayUsd);
  const tb = $('per').tBodies[0]; tb.textContent = '';
  let partial = false;
  for (const a of M.accounts) {
    const tr = el('tr');
    tr.append(el('td', null, a.name), el('td', signCls(a.week), a.week === null ? '-' : L.usd(a.week, true)),
      el('td', signCls(a.month), a.month === null ? '-' : (a.monthPartial ? '≥ ' : '') + L.usd(a.month, true)));
    if (a.monthPartial) partial = true;
    tb.appendChild(tr);
  }
  $('perNote').textContent = 'Week = the PC\'s own number when it sends one, else the closed trades in its report; month = the closed trades in its report' + (partial ? ' (≥: the report keeps each account\'s newest 4, so there may be more).' : '.');
}

function render() {
  const t = nowS(), M = model(t); S.model = M;
  drawHealth(M); drawTrade(M); drawAccounts(M); drawSetups(M); drawToday(M);
  $('app').dataset.live = M.pc.level === 'ok' ? '1' : '0';
  S.ready = true;
}

async function load(first) {
  if (first) {
    const [home, biz, payday] = await Promise.all([getJSON('../home.json'), getJSON('../business/accounts.json'), getJSON('../business/payday.json')]);
    S.home = home; S.biz = biz; S.payday = payday;
    render();
  }
  const wantBars = first || Date.now() - S.barsAt > BARS_MS - 1000;
  const [lite, bars] = await Promise.all([getPost(), wantBars ? getBars() : Promise.resolve(undefined)]);
  if (lite) S.lite = lite;
  if (bars) S.bars = bars;
  if (wantBars) S.barsAt = Date.now();
  S.polls++;
  render();
}

window.NQ_LIVE = { S, model, ready: () => S.ready && S.loaded === true, refresh: () => load(false) };
load(true).then(() => { S.loaded = true; }).catch(() => { S.loaded = true; try { render(); } catch (_) { /* nothing */ } });
setInterval(() => { if (document.visibilityState !== 'hidden') { try { render(); } catch (_) { /* keeps the last screen */ } } }, 5000);   // ages + time in trade move on
setInterval(() => { if (document.visibilityState !== 'hidden') load(false).catch(() => {}); }, L.POLL_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.loaded) load(false).catch(() => {}); });
