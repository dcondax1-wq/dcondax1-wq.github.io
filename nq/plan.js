// TODAY'S BATTLE PLAN + ALERT HISTORY on nq/ (night-nq-main 2026-11-27). Its own deferred module (never blocks the first paint): reads
// ./brief.json, ./news_week.json and ../board/board.json once, takes the page's merged PC state from nq.js (window.NQ_HOME + the 'nq-home'
// event: the same post the hero shows, never a 2nd feed read), and draws #battle + #alertsDrawer (textContent / createElement only).
import * as P from './plancore.js?v=3';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
const S = { brief: null, news: null, board: null, st: null };
const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const pts = (v) => (v === null ? '' : `${v >= 0 ? '+' : '-'}${Math.abs(Math.round(v)).toLocaleString('en-US')} pts`);
const px = (v) => (v === null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const age = (s) => (s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 48 * 3600 ? `${Math.floor(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`);

function drawPlan() {
  const box = $('battle'); if (!box) return;
  const nowS = Date.now() / 1000, st = S.st || {}, M = P.plan(S.brief, S.news, st.home, nowS);
  clear(box); box.hidden = false;
  const hd = el('div', 'bp-head'); const h2 = el('h2', 'bp-h', "Today's battle plan"); h2.id = 'battleH'; hd.appendChild(h2);
  hd.appendChild(el('span', 'pill ' + (M.stale ? 'warn' : 'ok'), M.has ? (M.stale ? `from ${M.dayText}` : M.dayText) : 'NOT BUILT'));
  box.appendChild(hd);
  if (M.staleText) box.appendChild(el('p', 'bp-stale', M.staleText));
  if (!M.has) return;
  if (M.headline) box.appendChild(el('p', 'bp-lead', M.headline));
  // the session map
  const map = el('div', 'bp-map'); map.setAttribute('role', 'img');
  map.setAttribute('aria-label', `The trading day from 18:00 to 17:00 ET${M.early ? `, halting early at ${M.early}` : ''}: ${M.map.wins.map((w) => `${w.bot} ${w.from}-${w.to}`).join('; ')}`);
  const lane = el('div', 'bp-sess');
  for (const s of M.map.segs) { const d = el('i', 'bp-seg ' + s.id, s.label); d.style.left = `${s.a * 100}%`; d.style.width = `${Math.max(0, s.b - s.a) * 100}%`; lane.appendChild(d); }
  map.appendChild(lane);
  const rows = new Map();                         // one row per bot, all of its windows on it (ATLAS MACD has two)
  for (const w of M.map.wins) { if (!rows.has(w.bot)) rows.set(w.bot, []); rows.get(w.bot).push(w); }
  for (const [bot, ws] of rows) {
    const r = el('div', 'bp-win'); r.appendChild(el('span', 'bp-wl', bot)); const tr = el('div', 'bp-wt');
    for (const w of ws) {
      const b = el('i', 'bp-wb ' + (/atlas/i.test(bot) ? 'atlas' : /rapid/i.test(bot) ? 'rapid' : 'lit'));
      b.style.left = `${w.a * 100}%`; b.style.width = `${Math.max(0.01, w.b - w.a) * 100}%`; b.title = `${w.from}-${w.to} ET`; tr.appendChild(b);
    }
    r.appendChild(tr); map.appendChild(r);
  }
  const ov = el('div', 'bp-ov');                 // the markers sit over the time track only (not the bot labels)
  if (M.map.halt) { const hl = el('i', 'bp-halt'); hl.style.left = `${M.map.halt.x * 100}%`; hl.title = `CME halts at ${M.map.halt.at} ET`; ov.appendChild(hl); }
  if (M.map.now !== null) { const nl = el('i', 'bp-now'); nl.style.left = `${M.map.now * 100}%`; nl.title = 'now'; ov.appendChild(nl); }
  map.appendChild(ov);
  const ticks = el('div', 'bp-ticks'); for (const [t, m] of [['18:00', 1080], ['02:00', 120], ['08:00', 480], M.early ? [M.early, +M.early.slice(0, 2) * 60 + +M.early.slice(3)] : ['17:00', 1020]]) { const k = el('span', '', t); k.style.left = `${((m - 1080 + 1440) % 1440) / 1380 * 100}%`; ticks.appendChild(k); }
  map.appendChild(ticks);
  box.appendChild(map);
  if (M.early) box.appendChild(el('p', 'bp-note gold', `Short day: the CME halts at ${M.early} ET; every bot is flat before it.`));
  // the levels ladder + the market read side by side
  const grid = el('div', 'bp-grid');
  const lad = el('div', 'bp-ladder'); lad.appendChild(el('h3', '', 'Levels LIT watches'));
  const L = M.levels, ul = el('ol', 'bp-rungs'); let placed = false;
  for (const r of L.rows) {
    if (!placed && L.price !== null && r.px < L.price) { ul.appendChild(priceRow(L.price)); placed = true; }
    const li = el('li', 'bp-rung ' + (r.dist === null ? '' : r.dist >= 0 ? 'above' : 'below'));
    li.appendChild(el('b', '', r.name)); li.appendChild(el('span', 'ag-num', px(r.px))); li.appendChild(el('span', 'bp-dist ag-num', pts(r.dist))); ul.appendChild(li);
  }
  if (!placed && L.price !== null) ul.appendChild(priceRow(L.price));
  lad.appendChild(ul);
  lad.appendChild(el('p', 'bp-note', L.rows.length ? `Distance from ${L.priceSrc || 'the last price'}.` : 'No levels in the brief or the last PC report.'));
  grid.appendChild(lad);
  const rd = el('div', 'bp-read'); rd.appendChild(el('h3', '', 'Market read')); if (M.read.from) rd.appendChild(el('p', 'bp-note', `From ${M.read.from} (its own price, not the PC's):`));
  for (const t of [M.read.vix, M.read.where, M.read.bias, M.read.day]) if (t) rd.appendChild(el('p', '', t));
  grid.appendChild(rd);
  box.appendChild(grid);
  // news
  const nw = el('div', 'bp-news'); nw.appendChild(el('h3', '', 'News that moves NQ today'));
  if (!M.news.length) nw.appendChild(el('p', 'bp-note', M.stale ? 'No high-impact US release in that day\'s list.' : 'No high-impact US release today: every bot trades its normal window.'));
  for (const n of M.news) {
    const r = el('div', 'bp-ev' + (n.past ? ' past' : '')); r.appendChild(el('b', 'ag-num', n.time || '--:--')); const t = el('div'); t.appendChild(el('span', 'bp-evt', n.title));
    if (n.pause) t.appendChild(el('span', 'bp-evp', n.pause)); t.appendChild(el('span', 'bp-evb', n.builders)); r.appendChild(t); nw.appendChild(r);
  }
  box.appendChild(nw);
  // one line per bot
  const bw = el('div', 'bp-bots'); bw.appendChild(el('h3', '', 'What each bot needs today'));
  for (const b of M.bots) {
    const r = el('div', 'bp-bot'); const t = el('div', 'bp-bt'); t.appendChild(el('b', '', b.name)); t.appendChild(el('span', '', [b.window, b.state, b.max ? `max ${b.max} a day` : ''].filter(Boolean).join(' · ')));
    r.appendChild(t); r.appendChild(el('p', '', b.need)); bw.appendChild(r);
  }
  box.appendChild(bw);
}
function priceRow(v) { const li = el('li', 'bp-rung now'); li.appendChild(el('b', '', 'Price')); li.appendChild(el('span', 'ag-num', px(v))); li.appendChild(el('span', 'bp-dist', 'now')); return li; }

function drawAlerts() {
  const box = $('alertsDrawer'); if (!box) return;
  const nowS = Date.now() / 1000, st = S.st || {}, A = P.alerts(st.home, st.lite, S.board, nowS);
  let list = box.querySelector('ol');
  if (!box.querySelector('summary')) {
    const sm = el('summary'); sm.appendChild(el('b', '', 'Alert history')); sm.appendChild(el('span', 'bp-sum', '')); box.appendChild(sm);
    box.appendChild(el('p', 'bp-note', "The PC's event log, newest first: the same events that send your phone alerts (entries, exits, warnings, notes). It shows what the PC logged, not the messages themselves."));
    list = el('ol', 'bp-alerts'); box.appendChild(list);
  }
  box.hidden = false;
  box.querySelector('.bp-sum').textContent = A.length ? `${A.length} newest · last ${age(A[0].ageS)}` : 'none in the last report';
  clear(list);
  for (const a of A) {
    const li = el('li', 'bp-al ' + (a.tone || ''));
    li.appendChild(el('i', 'bp-ic', a.icon)); const t = el('div'); t.appendChild(el('span', 'bp-at', a.text));
    const d = new Date(a.t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    t.appendChild(el('span', 'bp-aw', `${d} ET · ${age(a.ageS)}${a.acct ? ' · ' + a.acct : ''}`)); li.appendChild(t); list.appendChild(li);
  }
  if (!A.length) list.appendChild(el('li', 'bp-note', 'No event in the last report or the published log yet.'));
}
function draw() { try { drawPlan(); } catch (_) { /* the page keeps the rest */ } try { drawAlerts(); } catch (_) { /* nothing */ } }

addEventListener('nq-home', (e) => { S.st = e.detail || null; draw(); });
Promise.all([get('./brief.json'), get('./news_week.json'), get('../board/board.json')]).then(([b, n, bd]) => {
  S.brief = b; S.news = n; S.board = bd; S.st = window.NQ_HOME || S.st; draw();
});
setInterval(() => { if (!document.hidden) draw(); }, 60000);
