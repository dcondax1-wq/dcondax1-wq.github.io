// NQ LIVE screen (day-livedash 2026-11-26). The rules live in livecore.js (pure, node-tested); this file fetches and draws.
// Reads ../home.json, ../business/accounts.json, ../business/payday.json once, the PC's public status post (../pc_feed.js fetchLatest)
// every 22 s and its chart post (nqbars.js) every 60 s, only while the screen is visible. Text only through textContent / createElement;
// the chart is SVG made with createElementNS. Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests and screenshots only).
import * as D from './nqdesk.js?v=8';
import * as K7 from './clock7.js?v=4';
import * as A from './acctcore.js?v=3';
import * as B from './nqbars.js?v=b2';
import * as L from './livecore.js?v=2';

const $ = (id) => document.getElementById(id);
const S = { home: null, lite: null, biz: null, payday: null, bars: null, feed: null, model: null, ready: false, loaded: false, polls: 0, barsAt: 0, seen: new Set(), fresh: new Map(), seenOnce: false };
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
async function getPost(force) {
  const Q = window.NQ_FEED;                                  // the shared NQ feed (nqfeed.js): one read for every widget / tab
  if (Q && Q.latest) { try { return await Promise.race([Q.latest({ force: !!force }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { /* the old path */ } }
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
  side.append(el('span', O.side === 'LONG' ? 'long' : 'short', O.side), document.createTextNode(`\u00a0 ${O.qty || '?'} MNQ · ${O.botName}`));
  $('tradeWho').textContent = `${O.accounts.map((a) => a.name + (a.qty ? ` (${a.qty})` : '')).join(' · ')}${O.others ? ` · +${O.others} other open` : ''} · in for ${L.dur(O.inFor)}`;
  const u = $('tradeUsd'); u.textContent = O.usd === null ? '-' : L.usd(O.usd, true); u.className = signCls(O.usd);
  $('tradeR').textContent = O.r === null ? '' : `${L.rTxt(O.r)} · ${O.pts === null ? '' : ((O.pts >= 0 ? '+' : '-') + L.ptsTxt(O.pts)).replace(/ /g, '\u00a0')}`;   // "+18 pts" never splits
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
  const W = 360, H = 170, pl = 4, pr = 66, pt = 10, pb = 10;
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
    svg.appendChild(sv('rect', { x: W - pr + 2, y: y(p) - 9, width: pr - 4, height: 18, rx: 4, fill: color }));
    svg.appendChild(sv('text', { x: W - pr / 2, y: y(p) + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: '#000' }, label));
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

// ------------------------------------------------------------------------------------------------ night-nq-live 2026-11-27
// a key seen for the first time AFTER the first full load = a new fill: its card / row / pin pulses once (never on the first paint)
// (it stays "new" for FRESH_MS across the 5 s redraws, so a redraw never cuts the pulse short)
const FRESH_MS = 2500;
function isNew(key) {
  if (!key) return false;
  const at = S.fresh.get(key);
  if (at !== undefined) return Date.now() - at < FRESH_MS;
  if (S.seenOnce && !S.seen.has(key)) { S.fresh.set(key, Date.now()); return true; }
  return false;
}
function remember(keys) { for (const k of keys) if (k) S.seen.add(k); }

function drawOpens(M) {
  const box = $('opens'), grid = $('ogrid'); grid.textContent = '';
  box.hidden = !M.opens.length;
  $('opensSum').textContent = M.opens.length ? `${M.opens.length} account${M.opens.length > 1 ? 's' : ''}` : '';
  for (const o of M.opens) {
    const c = el('article', 'lv-oc'); c.dataset.side = o.side; c.dataset.sign = o.usd === null ? '' : o.usd > 0 ? 'up' : o.usd < 0 ? 'down' : '';
    c.dataset.key = o.key; if (isNew('open:' + o.key)) c.classList.add('lv-new');
    const hd = el('div', 'lv-ohd'); hd.append(el('h3', null, o.name), el('span', 'lv-side ' + (o.side === 'LONG' ? 'long' : 'short'), `${o.side} ${o.qty || '?'}`));
    c.appendChild(hd);
    const pn = el('div', 'lv-opnl'), u = el('b', signCls(o.usd), o.usd === null ? '-' : L.usd(o.usd, true));
    pn.append(u, el('span', null, `${o.r === null ? '' : L.rTxt(o.r)}${o.planR ? ` of ${L.rTxt(o.planR).replace('+', '')}` : ''}`));
    c.appendChild(pn);
    // the bar: stop (red) -> entry (gold) -> target (mint), the price as a glowing marker
    if (o.bar) {
      const b = el('div', 'lv-prog'); b.setAttribute('role', 'img');
      b.setAttribute('aria-label', `price ${o.bar.now === null ? 'unknown' : Math.round(o.bar.now * 100) + '% of the way from the stop to the target'}`);
      const risk = el('i', 'risk'); risk.style.width = `${o.bar.entry * 100}%`;
      const rew = el('i', 'rew'); rew.style.left = `${o.bar.entry * 100}%`; rew.style.width = `${(1 - o.bar.entry) * 100}%`;
      const ent = el('i', 'ent'); ent.style.left = `${o.bar.entry * 100}%`;
      b.append(risk, rew, ent);
      if (o.bar.now !== null) {
        const fill = el('i', 'fill ' + (o.bar.now >= o.bar.entry ? 'up' : 'down'));
        fill.style.left = `${Math.min(o.bar.now, o.bar.entry) * 100}%`; fill.style.width = `${Math.abs(o.bar.now - o.bar.entry) * 100}%`;
        const now = el('i', 'now'); now.style.left = `${o.bar.now * 100}%`;
        b.append(fill, now);
      }
      const ends = el('div', 'lv-pends');
      ends.append(el('span', 'bad', `SL ${L.pxTxt(o.stop)}${o.be ? ' (BE)' : ''}`), el('span', 'gold', `IN ${L.pxTxt(o.entry)}`), el('span', 'ok', `TP ${L.pxTxt(o.target)}`));
      c.append(b, ends);
    }
    const kv = el('dl', 'lv-okv');
    const cell = (k, v) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); kv.appendChild(d); };
    cell('In for', L.dur(o.inFor)); cell('Entered', o.at ? `${o.at} ET` : '-');
    cell('Risk', o.riskUsd === null ? '-' : L.usd(o.riskUsd)); cell('At target', o.targetUsd === null ? '-' : '+' + L.usd(o.targetUsd));
    c.appendChild(kv);
    const f = el('p', 'lv-ofoot'); const chip = el('span', 'lv-chip', o.pxAge === null ? 'price unknown' : `price ${L.ago(o.pxAge)}`); chip.dataset.level = o.lvl;
    f.append(chip, el('small', null, o.botName)); c.appendChild(f);
    grid.appendChild(c);
  }
  remember(M.opens.map((o) => 'open:' + o.key));
}

function drawTimeline(M) {
  const box = $('tl'); box.textContent = '';
  const T = M.timeline; if (!T) return;
  const W = 360, H = 84, Y = 42, x = (f) => 10 + f * (W - 20);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const defs = sv('defs'), g = sv('linearGradient', { id: 'lvTlG', x1: 0, x2: 1 });
  g.append(sv('stop', { offset: '0', 'stop-color': '#4d2e76' }), sv('stop', { offset: '1', 'stop-color': '#9d59ee' }));
  defs.appendChild(g); svg.appendChild(defs);
  svg.appendChild(sv('rect', { x: 10, y: Y - 2, width: W - 20, height: 4, rx: 2, fill: '#2a2140' }));
  if (T.now !== null) svg.appendChild(sv('rect', { x: 10, y: Y - 2, width: Math.max(0, x(T.now) - 10), height: 4, rx: 2, fill: 'url(#lvTlG)' }));
  svg.appendChild(sv('text', { x: 10, y: Y + 24, 'font-size': 12, fill: '#8a7da3' }, '18:00'));
  for (const m of T.marks) {
    if (m.x === null) continue;
    svg.appendChild(sv('line', { x1: x(m.x), x2: x(m.x), y1: Y - 7, y2: Y + 7, stroke: '#4d2e76', 'stroke-width': 1 }));
    svg.appendChild(sv('text', { x: x(m.x), y: Y + 24, 'text-anchor': 'middle', 'font-size': 12, fill: '#a99cc0' }, m.label));
  }
  const col = (p) => (p.open ? '#f1c14b' : p.usd === null ? '#a99cc0' : p.usd > 0 ? '#77db89' : p.usd < 0 ? '#ff5d6c' : '#a99cc0');
  const pins = T.pins.filter((p) => p.x0 !== null).sort((a, b) => a.x0 - b.x0);
  for (const p of pins) {
    if (p.x1 !== null && p.x1 > p.x0) svg.appendChild(sv('rect', { x: x(p.x0), y: Y - 5, width: Math.max(2, x(p.x1) - x(p.x0)), height: 10, rx: 3, fill: col(p), opacity: 0.5 }));
    svg.appendChild(sv('circle', { cx: x(p.x0), cy: Y, r: 5, fill: col(p), stroke: '#000', 'stroke-width': 1.5, class: isNew('tl:' + p.key) ? 'lv-pin lv-new' : 'lv-pin' }));
  }
  // one label a cluster of pins (closer than 12% of the session): "2 OPEN", or the cluster's closed $ (never overlapping text)
  const groups = [];
  for (const p of pins) { const g0 = groups[groups.length - 1]; if (g0 && p.x0 - g0[g0.length - 1].x0 < 0.12) g0.push(p); else groups.push([p]); }
  for (const g1 of groups) {
    const open = g1.filter((p) => p.open).length, closed = g1.filter((p) => !p.open && p.usd !== null), sum = closed.reduce((s, p) => s + p.usd, 0);
    const parts = [];
    if (open) parts.push(`${open > 1 ? open + ' ' : ''}OPEN`);
    if (closed.length) parts.push(L.usd(sum, true));
    const cx = Math.min(W - 44, Math.max(44, x(g1.reduce((s, p) => s + p.x0, 0) / g1.length)));
    svg.appendChild(sv('text', { x: cx, y: Y - 14, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800,
      fill: open && closed.length ? '#f3eefc' : col(g1[0]) }, parts.join(' · ') || g1[0].side));
  }
  if (T.now !== null) {
    svg.appendChild(sv('line', { x1: x(T.now), x2: x(T.now), y1: Y - 9, y2: Y + 9, stroke: '#f3eefc', 'stroke-width': 1.4 }));
    svg.appendChild(sv('text', { x: x(T.now), y: H - 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#f3eefc' }, 'now'));
  }
  box.appendChild(svg);
  remember(T.pins.map((p) => 'tl:' + p.key));
}

function drawJournal(M) {
  const ol = $('jr'), st = $('streak'); ol.textContent = ''; st.textContent = '';
  const J = M.journal, K = M.streak;
  $('jrCount').textContent = J.length ? `last ${J.length}` : '';
  if (!J.length) ol.appendChild(el('li', 'empty', S.lite ? 'No closed trade in the PC\'s report yet.' : 'Waiting for the PC\'s report.'));
  if (K.count) {
    const chip = (cls, big, small) => { const d = el('div', 'lv-sk ' + cls); d.append(el('b', null, big), el('small', null, small)); st.appendChild(d); };
    chip(K.kind === 'W' ? 'ok' : K.kind === 'L' ? 'bad' : '', K.kind ? `${K.n} ${K.kind === 'W' ? 'win' : 'loss'}${K.n > 1 ? (K.kind === 'W' ? 's' : 'es') : ''}` : '-', 'in a row now');
    chip('', `${K.wins}W · ${K.losses}L`, K.winRate === null ? 'win rate -' : `win rate ${Math.round(K.winRate * 100)}%`);
    chip(signCls(K.total), L.usd(K.total, true), `${K.count} trades`);
  }
  for (const t of J) {
    const li = el('li'); li.dataset.sign = t.usd > 0 ? 'up' : t.usd < 0 ? 'down' : '';
    if (isNew('jr:' + t.key)) li.classList.add('lv-new');
    const top = el('div', 'lv-jt');
    top.append(el('span', 'lv-side ' + (t.side === 'LONG' ? 'long' : 'short'), t.side), el('span', 'n', `${t.name}${t.qty ? ' · ' + t.qty : ''}`));
    const u = el('b', 'u ' + signCls(t.usd), L.usd(t.usd, true)); top.appendChild(u);
    li.appendChild(top);
    const m = el('div', 'lv-jm');
    m.appendChild(el('span', null, `${t.day.slice(5).replace('-', '/')} ${t.at}${t.xAt ? '→' + t.xAt : ''}`));
    if (t.r !== null) m.appendChild(el('span', 'r ' + signCls(t.r), L.rTxt(t.r)));
    if (t.why) m.appendChild(el('span', 'why', t.why));
    if (t.slip && t.slip.entry !== null) {
      const q = el('span', 'q ' + t.slip.grade, `entry ${t.slip.entry > 0 ? '+' : ''}${t.slip.entry} tick${Math.abs(t.slip.entry) === 1 ? '' : 's'}`);
      q.title = 'Entry quality: ticks worse than the backtest\'s fill (from the PC\'s fill check)'; m.appendChild(q);
    }
    li.appendChild(m);
    ol.appendChild(li);
  }
  remember(J.map((t) => 'jr:' + t.key));
  $('jrNote').textContent = 'Real trades only, newest first, from your PC\'s report (it carries each account\'s newest trades; the list grows as it trades). '
    + (M.fills ? 'Entry quality = ticks worse than the backtest\'s fill, from the PC\'s own fill check (last 36 h).' : 'Entry quality shows once the PC\'s report carries its fill check.');
}

function render() {
  const t = nowS(), M = model(t); S.model = M;
  drawHealth(M); drawTrade(M); drawOpens(M); drawAccounts(M); drawSetups(M); drawToday(M); drawTimeline(M); drawJournal(M);
  if (S.loaded) S.seenOnce = true;
  $('app').dataset.live = M.pc.level === 'ok' ? '1' : '0';
  S.ready = true;
}

async function load(first, force) {
  if (first) {
    const [home, biz, payday] = await Promise.all([getJSON('../home.json'), getJSON('../business/accounts.json'), getJSON('../business/payday.json')]);
    S.home = home; S.biz = biz; S.payday = payday;
    render();
  }
  const wantBars = first || Date.now() - S.barsAt > BARS_MS - 1000;
  const [lite, bars] = await Promise.all([getPost(force), wantBars ? getBars() : Promise.resolve(undefined)]);
  if (lite) S.lite = lite;
  if (bars) S.bars = bars;
  if (wantBars) S.barsAt = Date.now();
  S.polls++;
  render();
}

window.NQ_LIVE = { S, model, ready: () => S.ready && S.loaded === true, refresh: () => load(false, true) };
const NQF = window.NQ_FEED;                                  // instant first paint from the kept post (shown with its real age), then every newer one
if (NQF) {
  try { const c = NQF.cached(); if (c && !S.lite) S.lite = c; } catch (_) { /* none */ }
  NQF.on((l) => { if (l && (!S.lite || +l.t >= +S.lite.t)) { S.lite = l; if (S.home) { try { render(); } catch (_) { /* keeps the last screen */ } } } });
}
load(true).then(() => { S.loaded = true; }).catch(() => { S.loaded = true; try { render(); } catch (_) { /* nothing */ } });
setInterval(() => { if (document.visibilityState !== 'hidden') { try { render(); } catch (_) { /* keeps the last screen */ } } }, 5000);   // ages + time in trade move on
setInterval(() => { if (document.visibilityState !== 'hidden') load(false, true).catch(() => {}); }, L.POLL_MS);   // the live screen reads fresh every 22 s (past the shared feed's 60 s cache)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.loaded) load(false).catch(() => {}); });
