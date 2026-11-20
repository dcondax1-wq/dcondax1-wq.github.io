// CHRONOS page (ES module): loads the LIT trades the site already publishes, lets you pick a day and replays it on the clock tower (scene.js).
// The maths and the words live in chroncore.js. Text only through textContent (no data ever becomes HTML). window.CHR is the test hook.
import { SPEEDS, BARS_PER_SEC, parseTrades, dayList, bestWorst, lastMonth, sameWeekday, layout, timeAt, steps, stepsBy, phase, dayVerdict, usd, sgn, clock, prettyDay } from './chroncore.js';

import * as X from './extras.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'chronos.v1';
const S = { trades: [], days: [], bw: { best: null, worst: null }, demo: true, di: -1, ti: 0, trade: null, L: null, u: 0, playing: false, speed: 1, view: '', scene: null, ready: false, error: null,
  ended: false, seen: 0, last: 0, jump: '', stepsN: -1, queue: [] };

const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
async function getJSON(url, ms = 8000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}

const day = () => S.days[S.di] || null;
const tt = () => (S.L ? timeAt(S.L, S.u) : 0);

// ------------------------------------------------------------------------------------------------ the replay
function loadTrade(ti, { play = true } = {}) {
  const d = day();
  if (!d) return;
  S.ti = Math.max(0, Math.min(d.trades.length - 1, ti));
  S.trade = d.trades[S.ti];
  S.L = layout(S.trade);
  S.u = 0; S.ended = false; S.stepsN = -1;
  S.playing = !!play && !reduced();
  if (S.scene) S.scene.setTrade(S.trade, S.L);
  if (S.view === 'verdict') openSheet('verdict');
  refresh(true);
}
function pickDay(dayStr, opts) {
  const i = S.days.findIndex((x) => x.day === dayStr);
  if (i < 0) return false;
  S.di = i;
  buildTradeChips();
  $('daySel').value = dayStr;
  loadTrade(0, opts);
  history.replaceState(null, '', S.view ? '#' + S.view : '#' + dayStr);
  persist();
  return true;
}
function seek(u) {
  S.u = Math.max(0, Math.min(1, u));
  if (S.u >= 1) onEnd(); else S.ended = false;
  refresh(false);
}
function onEnd() {
  S.playing = false;
  if (S.ended) return;
  S.ended = true;
  if (S.queue.length) { const next = S.queue.shift(); setTimeout(() => { pickDay(next, { play: true }); updateNav(); }, 1100); return; }   // a reel in a row: the next day, no verdict sheet
  openSheet('verdict');
}
function advance(dt) {
  if (!S.playing || !S.L) return;
  const span = Math.max(60, S.L.T1 - S.L.T0);
  S.u = Math.min(1, S.u + (dt * BARS_PER_SEC * S.speed * 60) / span);
  if (S.u >= 1) onEnd();
  refresh(false);
}
let raf = 0;
function tick(now) {
  raf = requestAnimationFrame(tick);
  if (window.OLYMPUS ? window.OLYMPUS.hidden() : document.hidden) { S.last = now; return; }      // hidden / covered: nothing advances
  const gap = window.OLYMPUS && window.OLYMPUS.frameGap ? window.OLYMPUS.frameGap() : 0;          // idle / saver / 3D Off (docs/OLYMPUS_PERF.md)
  if (gap && now - (S.gapAt || 0) < gap - 3) return;
  S.gapAt = now;
  const dt = Math.min(0.1, (now - (S.last || now)) / 1000);
  S.last = now;
  advance(dt);
}

// ------------------------------------------------------------------------------------------------ the words
let cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
function refresh(force) {
  const t = S.trade;
  if (!t) return;
  const now = tt();
  if (S.scene) S.scene.setU(S.u, now, t);
  setText('phase', phase(t, now));
  setText('clock', clock(now, t.off) + ' ET');
  setText('meta', `${t.side} ${t.qty} micro${t.qty === 1 ? '' : 's'}`);
  const done = stepsBy(t, now), last = done[done.length - 1];
  setText('step', last ? last.text : 'Watching the LIT levels. The first step appears when price sweeps one.');
  const sv = String(Math.round(S.u * 1000));
  if (force || $('scrub').value !== sv) $('scrub').value = sv;
  $('play').textContent = S.playing ? 'Pause' : S.u >= 1 ? 'Replay' : 'Play';
  $('play').setAttribute('aria-pressed', String(S.playing));
  document.querySelectorAll('#speeds button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.s === S.speed)));
  if ((S.view === 'steps' && done.length !== S.stepsN) || force) { S.stepsN = done.length; if (S.view === 'steps') openSheet('steps'); }
}

function buildDays() {
  kids($('daySel'), S.days.map((d) => { const o = h('option', '', `${prettyDay(d.day)} (${d.day.slice(5)}) - ${d.trades.length} trade${d.trades.length > 1 ? 's' : ''}`); o.value = d.day; return o; }));
}
function buildTradeChips() {
  const d = day(), box = $('trades');
  box.hidden = !d || d.trades.length < 2;
  if (box.hidden) { kids(box); return; }
  kids(box, d.trades.map((t, i) => {
    const b = h('button', '', `Trade ${i + 1}: ${clock(t.entry.t, t.off)} ${t.side.toLowerCase()}`);
    b.type = 'button'; b.dataset.i = String(i); b.setAttribute('aria-pressed', String(i === S.ti));
    b.addEventListener('click', () => { loadTrade(i); markChips(); });
    return b;
  }));
}
function markChips() { document.querySelectorAll('#trades button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === S.ti))); }
/** AGORA (2026-11-09): the day's money in one big number, what was left on the table, and the month so far (every R next to its $). */
function dayMoney(d) {
  const card = document.querySelector('.daycard'); if (!card) return;
  let box = $('dayMoney');
  if (!box) { box = h('div', 'daymoney'); box.id = 'dayMoney'; card.insertBefore(box, card.firstChild); }
  if (!d) { box.replaceChildren(h('p', 'dm-line', 'Pick a day to see what the bot made.')); return; }
  const R = d.trades.reduce((x, t) => x + (t.r || 0), 0), gap = Math.max(0, d.best - d.usd), mo = d.day.slice(0, 7), md = S.days.filter((x) => x.day.slice(0, 7) === mo), mt = md.reduce((x, y) => x + y.usd, 0), won = md.filter((x) => x.usd > 0).length;
  const big = h('b', 'dm-big ' + (d.usd >= 0 ? 'pos' : 'neg'), sgn(d.usd)), r = h('span', 'dm-r', `${R >= 0 ? '+' : '-'}${Math.abs(R).toFixed(2)}R`);
  const top = h('div', 'dm-top'); top.append(big, r);
  const bar = h('span', 'dm-bar'), bi = h('i'); bi.style.width = d.best > 0 ? Math.max(2, Math.min(100, Math.round((Math.max(0, d.usd) / d.best) * 100))) + '%' : '0%'; bar.append(bi);
  box.replaceChildren(top, bar, h('p', 'dm-line', gap > 0 ? `Best possible ${sgn(d.best)}: ${usd(gap)} was left on the table.` : `Best possible ${sgn(d.best)}: the bot got all of it.`),
    h('p', 'dm-line dim', `${mo} so far: ${sgn(mt)} over ${md.length} day${md.length === 1 ? '' : 's'}, ${won} won.`));
}
function updateNav() {
  const d = day();
  dayMoney(d);
  $('prev').disabled = S.di <= 0; $('next').disabled = S.di >= S.days.length - 1;
  const j = { month: d && lastMonth(S.days, d.day), weekday: d && sameWeekday(S.days, d.day), best: S.bw.best, worst: S.bw.worst };
  S.targets = j;
  document.querySelectorAll('#jumps button').forEach((b) => { const k = b.dataset.j; b.disabled = !j[k] || (d && j[k] === d.day); b.setAttribute('aria-pressed', String(!!d && j[k] === d.day && (k === 'best' || k === 'worst'))); });
}

const TITLES = { steps: 'The bot\'s steps', verdict: 'Verdict', lab: 'The lab', about: 'What you are looking at' };
function labBody() {
  try {
    return X.labView({ days: S.days, trades: S.trades, day, demo: S.demo, close: closeSheet, pickDay: (d, o) => { pickDay(d, o); updateNav(); }, playReel: (list) => { S.queue = list.slice(1); pickDay(list[0], { play: true }); updateNav(); } });
  } catch (e) { return h('p', '', 'The lab could not open: ' + ((e && e.message) || e)); }
}
function stepsView() {
  const t = S.trade, now = tt(), ul = h('ul', 'stepsl');
  for (const e of steps(t)) {
    const li = h('li', e.t <= now ? '' : 'future'), b = h('button'), tm = h('span', 't', e.clock), box = h('span');
    b.type = 'button'; b.style.display = 'grid';
    box.append(h('span', 'n', e.name), h('span', 'x', e.text));
    b.append(tm, box);
    b.addEventListener('click', () => { S.playing = false; seek(Math.max(0, Math.min(1, S.L.x(e.t)))); });
    li.append(b); ul.append(li);
  }
  return [h('p', 'strong', 'Tap a step to jump to its moment. Steps not yet reached are dim.'), ul];
}
function verdictView() {
  const d = day();
  if (!d) return [h('p', '', 'No day picked.')];
  if (!S.ended) {
    const b = h('button', 'again', 'Skip to the end');
    b.type = 'button'; b.addEventListener('click', () => { S.playing = false; seek(1); });
    return [h('p', 'strong', 'The verdict appears when the replay reaches the end of the trade.'), b];
  }
  const v = dayVerdict(d), again = h('button', 'again', 'Replay'), many = d.trades.length > 1;
  again.type = 'button'; again.addEventListener('click', () => { closeSheet(); loadTrade(S.ti); });
  return [h('p', 'head' + (v.bot < 0 ? ' loss' : ''), v.head),
    h('p', '', `${prettyDay(d.day)}. ${v.note}${many ? ` Shown: trade ${S.ti + 1} of ${d.trades.length}; the verdict covers the whole day.` : ''}`),
    h('h3', '', 'What would have changed the day'), (() => { const ul = h('ul', 'what'); v.what.forEach((x) => ul.append(h('li', '', x))); return ul; })(),
    h('p', '', v.fine), again];
}
function aboutView() {
  const n = S.days.length, f = S.days[0] ? S.days[0].day : '-', l = S.days[n - 1] ? S.days[n - 1].day : '-';
  return [h('p', 'strong', 'Pick a day the bot traded and watch it happen again.'),
    h('p', '', 'The ribbon is the 1-minute price path of each LIT trade the site publishes: from about two hours before the entry to the exit. It is not the whole trading day, and days with no bot trade are not listed.'),
    h('p', '', `${n} days, ${f} to ${l}. Most are backtest trades (what the bot would have done); a few are paper or real fills.`),
    h('p', '', 'The tower clock shows New York time. Violet lines are LIT levels, the green line is the entry, red the stop, gold the target. Jewels mark the sweep, inducement, CISD and the other steps.'),
    h('p', '', 'Best possible = a perfect exit on the same entry, from the best price the trade ever reached at the size traded. It is hindsight, not a promise.'),
    S.demo ? h('p', '', 'DEMO: the site data was not reachable, so this is a recorded copy of a few trades.') : null,
    h('p', '', 'Read-only. It never places or changes an order.'),
    festivalPlace()];
}
// the festival calendar (olympus/polis-life.js): the market days ahead, as the city keeps them; stays hidden when nothing is published
function festivalPlace() {
  const el = h('section', 'pl-place chronos-fest');
  el.setAttribute('data-polis-life', 'festivals'); el.setAttribute('aria-label', 'Festival calendar: the market days ahead'); el.hidden = true;
  return el;
}
function openSheet(view) {
  S.view = view;
  $('sheetTitle').textContent = TITLES[view];
  kids($('sheetBody'), view === 'steps' ? stepsView() : view === 'verdict' ? verdictView() : view === 'lab' ? labBody() : aboutView());
  if (view === 'about' && window.OLYMPUS_POLIS_LIFE && window.OLYMPUS_POLIS_LIFE.place) window.OLYMPUS_POLIS_LIFE.place($('sheetBody'));
  $('sheet').hidden = false;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  history.replaceState(null, '', '#' + view);
}
function closeSheet() {
  S.view = ''; $('sheet').hidden = true;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  history.replaceState(null, '', day() ? '#' + day().day : location.pathname + location.search);
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const bw = S.bw, byDay = (x) => S.days.find((d) => d.day === x), b = byDay(bw.best), w = byDay(bw.worst);
  return { v: 1, name: 'Chronos', status: { level: S.demo ? 'off' : 'ok', label: S.demo ? 'Demo data' : `${S.days.length} days to replay` },
    kpis: [{ label: 'Days', value: String(S.days.length) }, { label: 'Best day', value: b ? sgn(b.usd) : '-' }, { label: 'Worst day', value: w ? sgn(w.usd) : '-' }],
    lines: [`Replay any day the bot traded: ${S.days.length} days, ${S.days[0] ? S.days[0].day : '-'} to ${S.days.length ? S.days[S.days.length - 1].day : '-'}.`.slice(0, 120), 'The 1-minute path of each trade, the bot\'s steps and a plain verdict.'],
    t: Math.floor(Date.now() / 1000), open: '', theme: '#13100d', stale_after: 604800 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io')); } catch (_) { /* not inside Jarvis */ }
}
function persist() { store.write({ speed: S.speed }); }

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createChronos } = await import('./scene.js');
    S.scene = createChronos($('tower'), { O });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}
function jump(k) {
  const target = S.targets && S.targets[k];
  if (target) { S.jump = k; pickDay(target); updateNav(); }
}
function wire() {
  $('daySel').addEventListener('change', (e) => { pickDay(e.target.value); updateNav(); });
  $('prev').addEventListener('click', () => { if (S.di > 0) { pickDay(S.days[S.di - 1].day); updateNav(); } });
  $('next').addEventListener('click', () => { if (S.di < S.days.length - 1) { pickDay(S.days[S.di + 1].day); updateNav(); } });
  document.querySelectorAll('#jumps button').forEach((b) => b.addEventListener('click', () => jump(b.dataset.j)));
  $('play').addEventListener('click', () => {
    if (S.u >= 1) { loadTrade(S.ti); return; }
    S.playing = !S.playing; refresh(false);
  });
  document.querySelectorAll('#speeds button').forEach((b) => b.addEventListener('click', () => { S.speed = SPEEDS.includes(+b.dataset.s) ? +b.dataset.s : 1; persist(); refresh(false); }));
  $('scrub').addEventListener('input', (e) => { S.playing = false; seek(+e.target.value / 1000); });
  document.querySelectorAll('#pills button').forEach((b) => b.addEventListener('click', () => (S.view === b.dataset.view ? closeSheet() : openSheet(b.dataset.view))));
  $('close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const fit = () => document.documentElement.style.setProperty('--dock-h', Math.ceil($('dock').getBoundingClientRect().height) + 'px');
  fit(); addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe($('dock'));
}

async function main() {
  const scene = startScene();
  const tr = await getJSON('../odeon/trades.json');
  let trades = parseTrades(tr);
  S.demo = trades.length < 6;
  if (S.demo) {                                                          // the site data is not there: the recorded copy (DEMO)
    const fx = await getJSON('fixture.json');
    if (fx) trades = parseTrades(fx);
  }
  S.trades = trades; S.days = dayList(trades); S.bw = bestWorst(S.days);
  const sv = store.read();
  if (SPEEDS.includes(+sv.speed)) S.speed = +sv.speed;
  $('demo').hidden = !S.demo;
  await scene;
  buildDays();
  wire();
  const hash = location.hash.slice(1), want = S.days.some((d) => d.day === hash) ? hash : S.days.length ? S.days[S.days.length - 1].day : null;
  if (want) pickDay(want, { play: !/^(steps|verdict|lab|about)$/.test(hash) });
  else { setText('step', 'No bot trades to replay yet.'); $('play').disabled = $('scrub').disabled = true; }
  updateNav();
  if (/^(steps|about|lab)$/.test(hash)) openSheet(hash);
  S.ready = true;
  document.body.dataset.ready = '1';
  postCard();
  raf = requestAnimationFrame(tick);
}

window.CHR = {
  state: () => ({ ready: S.ready, demo: S.demo, nTrades: S.trades.length, nDays: S.days.length, day: day() && day().day, ti: S.ti, nInDay: day() ? day().trades.length : 0, u: S.u, playing: S.playing,
    speed: S.speed, ended: S.ended, view: S.view, phase: S.trade ? phase(S.trade, tt()) : null, best: S.bw.best, worst: S.bw.worst, targets: S.targets || null,
    scene: S.scene ? S.scene.stats() : null, error: S.error, id: S.trade && S.trade.id }),
  step(dt) { advance(dt); return window.CHR.state(); },
  play() { S.playing = true; refresh(false); }, pause() { S.playing = false; refresh(false); },
  seek(u) { S.playing = false; seek(u); return window.CHR.state(); },
  day(d) { const ok = pickDay(d, { play: false }); updateNav(); return ok; },
  jump(k) { jump(k); return window.CHR.state(); },
  lab: () => { openSheet('lab'); return window.CHR.state(); },
  card,
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });
