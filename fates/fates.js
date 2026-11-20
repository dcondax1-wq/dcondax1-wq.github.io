// FATES: the page. Threads of fate spun from a spindle at "today", flowing away into the future. Gold threads reach the
// target (the golden gate above), red ones snap at the floor (the abyss below), violet ones are still undecided.
//   data     fates.json (python -X utf8 -m tools.fates.build), else fixture.json (DEMO)
//   numbers  fates-core.js (no DOM, no WebGL; the tests import it)      scene  fates-scene.js (three.js only)
//   live     live.json (the PC's heartbeat publish, the file Jarvis reads), polled every 5 min while the page is open:
//            today's eval state and the odds re-weighted to it (fates-core liveOdds). ?live=<url> points it elsewhere (tests).
// One top bar (scenario + sample), one bottom bar (Spin / Next 10), one bottom sheet (a followed future or the next 10 sessions).
import * as C from './fates-core.js';
import { createScene, Y1 } from './fates-scene.js';
import { createLab } from './fates-lab.js';

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil, themes
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
const LIVE_URL = 'https://raw.githubusercontent.com/demetrades2000-coder/nq-dashboard/live/live.json';
const LIVE_EVERY = 5 * 60e3;
const S = {
  data: null, demo: false, route: C.parseRoute(location.hash),
  // ?lite=1 / ?full=1 win (tests); else the owner's OLYMPUS choice (Jarvis ⋯ → 3D); auto LITE only when nobody chose
  lite: Q.get('lite') === '1' || (Q.get('full') !== '1' && !!(O && O.lite())), forcedFull: Q.get('full') === '1' || !!(O && O.chosen() && !O.lite()),
  reduced: O ? O.reduced() : RM.matches, threads: [], sel: -1, follow: null, sheet: null, ready: false, webgl: false, errors: [], hud: null,
  frames: 0, live: null, liveAt: 0, odds: null, theme: null,
};
window.__fates = S;                                 // read by tests/test_fates.py
let sc = null, MAP = null, clock0 = 0, lab = null;

// ------------------------------------------------------------------------------------------------ data
async function getJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
async function loadData() {
  for (const [file, demo] of [['fates.json', false], ['fixture.json', true]]) {
    const j = await getJson(file);
    if (j && j.scenarios) return { j, demo };
  }
  return null;
}
// live.json: the demo only reads it when a test points ?live= at a file; the real page polls the PC's feed: ../pc_feed.js (the ntfy report
// the PC posts every 15 min, the same cards: board.lit / board.atlas). The old GitHub copy (LIVE_URL) is on the suspended account (a 404
// on every poll, night-bugsweep 2026-11-19): asked only when this site has no PC feed at all.
async function pcFeed() {
  const F = window.PC_FEED;
  if (!F || typeof F.fetchLatest !== 'function' || typeof F.toLive !== 'function') return undefined;
  try { const lite = await F.fetchLatest({ feedUrl: '../status_feed.json' }); return lite ? F.toLive(lite, null) : null; } catch (_) { return null; }
}
async function pollLive() {
  const own = Q.get('live');
  if ((!own && S.demo) || (O ? O.hidden() : document.hidden)) return;
  let j = own ? await getJson(own) : await pcFeed();
  if (j === undefined) j = await getJson(LIVE_URL);
  if (j && j.board) { S.live = j; S.liveAt = Date.now(); renderLive(); }
}

// ------------------------------------------------------------------------------------------------ the top bar and the HUD
const scen = () => S.data.scenarios[C.scenKey(S.route)];
function renderHud() {
  const h = C.hud(S.data, S.route);
  S.hud = h;
  if (!h) return;
  for (const t of h.tiles) {
    const el = document.querySelector(`.tile[data-id="${t.id}"]`);
    if (!el) continue;
    el.querySelector('.l').textContent = t.label;
    el.querySelector('.v').textContent = t.value;
    el.querySelector('.s').textContent = t.sub;
  }
  $('sub').textContent = h.title + (h.mode === 'money' ? ' · $ to you (estimate)' : ' · odds it passes (estimate)');
  renderStory(h);
  // the caption: the legend + the one caveat that matters (the live strip already says where the eval stands)
  $('cap').innerHTML = '<span class="k g">gold</span> pass · <span class="k r">red</span> fail · <span class="k v">stone</span> still open · tap a thread' +
    (h.note ? `<br>${esc(h.note)}` : '');
  $('weak').hidden = !h.weak;
  $('acctsRow').hidden = S.route.scen !== 'money';
  $('next10').hidden = S.route.scen === 'money';
  for (const b of document.querySelectorAll('#scen button')) b.setAttribute('aria-selected', String(b.dataset.scen === S.route.scen));
  for (const b of document.querySelectorAll('#period button')) {
    b.setAttribute('aria-selected', String(b.dataset.period === S.route.period));
    b.hidden = !S.data.scenarios[C.scenKey({ ...S.route, period: b.dataset.period })];
  }
  for (const b of document.querySelectorAll('#accts button')) b.classList.toggle('on', +b.dataset.n === S.route.accts);
  for (const b of document.querySelectorAll('#span button')) b.classList.toggle('on', b.dataset.span === S.route.span);
  renderVerdict();
  renderLive();
}
// the honest line: the same eval on all three samples, side by side, so 2026 is never read alone

// the money story (plain words, money first) and the p10-p90 range bar under the monthly tile
function renderStory(h) {
  const el = $('story'); if (!el) return;
  const m = h.tiles.find((t) => t.id === 'money'), rng = $('rng');
  if (m && rng && m.p90 != null && m.p10 != null) {
    const lo = Math.min(0, m.p10), hi = Math.max(1, m.p90), x = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    const u = rng.querySelector('u'), k = rng.querySelector('s');
    u.style.left = x(m.p10) + '%'; u.style.width = Math.max(2, x(m.p90) - x(m.p10)) + '%'; k.style.left = x(m.p50) + '%';
    rng.hidden = false;
  } else if (rng) rng.hidden = true;
  let t = '';
  if (h.mode === 'eval') {
    const cp = C.costPerPass(scen());
    t = cp && cp.perPass != null ? `An eval costs ${C.fmtUsd(cp.price)}. At this pass rate you pay about ${C.fmtUsd(cp.perPass)} for each pass` + (m && m.p50 != null ? `, then a typical funded month pays ${C.fmtUsd(m.p50)}.` : '.') : '';
  } else if (m && m.p50 != null) t = `A typical month pays ${C.fmtUsd(m.p50)} after every eval fee; a bad one (1 in 10) ${C.fmtUsd(m.p10)}, a good one ${C.fmtUsd(m.p90)}.`;
  el.textContent = t; el.hidden = !t;
}

function renderVerdict() {
  const el = $('verdict'), sc0 = S.data.scenarios, r = S.route;
  if (r.scen === 'money') {
    const b = (p) => sc0[`money:${p}`] && sc0[`money:${p}`].books[String(r.accts)];
    const a = b('2026'), y = b('2021-25');
    el.className = 'verdict ' + (y && y['12m'] && y['12m'].pm_p50 > 0 ? 'ok' : 'warn');
    el.innerHTML = `<b>Verdict</b> ${r.accts} account${r.accts > 1 ? 's' : ''}: ${esc(C.fmtUsd(a && a['12m'] && a['12m'].pm_p50))}/mo on 2026 · ` +
      `${esc(C.fmtUsd(y && y['12m'] && y['12m'].pm_p50))}/mo in a 2021-25 market`;
    return;
  }
  const p = (per) => { const s = sc0[`eval:${r.scen}:${per}`]; return s ? s.summary.pass : null; };
  const a = p('2026'), h2 = p('H2'), y = p('2021-25');
  el.className = 'verdict ' + (y != null && y >= 50 ? 'ok' : 'warn');
  el.innerHTML = `<b>Verdict</b> ${esc(C.BOTS[r.scen])} passes <b class="g">${esc(C.fmtPct(a))}</b> on 2026` +
    (h2 != null ? ` · <b class="g">${esc(C.fmtPct(h2))}</b> Jul-Oct` : '') + ` · <b class="r">${esc(C.fmtPct(y))}</b> in 2021-25 markets`;
}
// today's live state: from the build (fates.json live) until live.json answers; then the odds re-weighted to it
function renderLive() {
  const el = $('live'), s = scen();
  if (!el || !s) return;
  if (s.kind !== 'eval') {
    const L = S.data.live || {};
    el.className = 'live';
    const slot = (s.slots || [])[S.route.accts - 1];                // the account the last tap added
    el.innerHTML = `<i class="dot"></i><span>From today's evals (${esc(L.source || 'build')}${L.t ? ', ' + esc(C.ago(L.t)) : ''}) → funded → payouts` +
      (slot ? ` · account ${S.route.accts}: ${esc(slot.label)}` : '') + '</span>';
    S.odds = null;
    renderGauge(null);
    return;
  }
  const bot = S.route.scen, fromFeed = S.live ? C.liveBot(S.live, bot, s.rules) : null;
  const st = fromFeed || { profit: s.start.profit, room: s.start.room, toTarget: s.start.to_target, session: s.start.session,
    quiet: s.start.quiet_days, status: 'open', t: (S.data.live || {}).t, floor: s.start.floor };
  const odds = C.liveOdds(s, st);
  S.odds = odds;
  renderGauge(C.gaugeOf(s, st, odds), st);
  const fresh = fromFeed ? 'live' : 'built';
  const state = `session ${(st.session || 0) + 1} next · room ${C.fmtUsd(st.room)} · ${C.fmtUsd(st.toTarget)} to go` +
    (st.quiet ? ` · ${st.quiet} quiet day${st.quiet > 1 ? 's' : ''}` : '');
  let txt;
  if (!odds) txt = `${state} · too few futures near this state: rebuild for the odds`;
  else if (odds.done) txt = `this eval is ${odds.done.toUpperCase()}`;
  else if (odds.sync) txt = `${state} · odds above are for exactly this state`;
  else txt = `${state} · <b>now ${C.fmtPct(odds.pass)} pass · ${C.fmtPct(odds.fail)} fail</b> (the ${odds.k} futures nearest today)`;
  el.className = 'live ' + fresh + (odds && !odds.sync && !odds.done ? ' moved' : '');
  el.innerHTML = `<i class="dot"></i><span><b class="tag-live">${fromFeed ? 'LIVE' : 'TODAY'}</b> ${txt}` +
    `${st.t ? ` <em>${esc(C.ago(st.t))}</em>` : ''}</span>`;
}
// the eval gauge (2026-11-03): the real MFFU numbers (Builder 50K: $3,000 target, $2,000 trailing drawdown, $1,000 daily loss limit,
// $91.80 fee) beside the odds: the DOM strip under the live line, and the same three numbers standing in the 3D loom (sc.gauge)
function renderGauge(g, st) {
  S.gauge = g;
  const box = $('gauge');
  if (!box) return;
  box.hidden = !g;
  if (!g) { S.gaugeScene = null; sc?.gauge(null); return; }
  const f = C.fmtUsd, set = (id, v, sub, pct, warn) => {
    const c = box.querySelector(`[data-id="${id}"]`);
    c.querySelector('.v').textContent = v; c.querySelector('.s').textContent = sub;
    c.querySelector('u').style.width = Math.round(pct * 100) + '%'; c.dataset.warn = warn ? '1' : '0';
  };
  set('dd', f(g.ddLeft), `of ${f(g.ddOf)} · max loss today ${f(g.dailyLeft)}${g.locked ? ' · floor locked' : ''}`, g.ddPct, g.ddWarn);
  set('tgt', f(g.toTarget), `to the ${f(g.target)} target · profit ${f(g.profit, true)}`, g.tgtPct, false);
  const odds = g.pass == null ? '—' : C.fmtPct(g.pass);
  set('odds', odds, g.done ? `this eval is ${g.done.toUpperCase()}` : `fail ${C.fmtPct(g.fail)}` + (g.costPerPass ? ` · ${f(g.fee)} fee ≈ ${f(g.costPerPass)} per pass` : ''),
    (g.pass || 0) / 100, g.pass != null && g.pass < 40);
  const floor = st && st.floor != null ? +st.floor : g.profit - g.ddLeft;
  S.gaugeScene = { p0: (g.profit - floor) / Math.max(1, g.target - floor), pass: g.pass, roomText: f(g.ddLeft), goText: f(g.toTarget), passText: odds };
  sc?.gauge(S.gaugeScene);
}
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function go(patch, respin = true) {
  S.route = { ...S.route, ...patch };
  if (!S.data.scenarios[C.scenKey(S.route)]) S.route.period = '2026';
  const h = C.routeHash(S.route);
  if (location.hash !== h) history.replaceState(null, '', h);
  renderHud();
  resize();                                         // the HUD's height changes with the scenario: re-centre the scene
  if (respin) { closeSheet(); S.labThread = null; build(); spin(); }
  if (lab) lab.refresh();
}
function wire() {
  const on = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b); });
  on('scen', (b) => go({ scen: b.dataset.scen }));
  on('period', (b) => go({ period: b.dataset.period }));
  on('accts', (b) => go({ accts: +b.dataset.n }));
  on('span', (b) => go({ span: b.dataset.span }, false));
  $('spin').addEventListener('click', () => { closeSheet(); sc?.reseed(); build(); spin(); });
  $('next10').addEventListener('click', () => (S.sheet === 'next10' ? closeSheet() : openNext10()));
  $('fClose').addEventListener('click', closeSheet);
  lab = createLab({ el: $('lab'), scen, route: () => S.route, go: (p) => go(p), selected: () => (S.follow ? S.follow.th : S.labThread || null) });
  S.lab = lab;
  $('labBtn').addEventListener('click', () => { if (lab.isOpen()) closeLab(); else { if (S.follow) S.labThread = S.follow.th; closeSheet(); lab.open(); $('labBtn').setAttribute('aria-expanded', 'true'); } });
  $('labClose').addEventListener('click', closeLab);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); closeLab(); } });
  addEventListener('hashchange', () => { const r = C.parseRoute(location.hash); go({ scen: r.scen, period: r.period, accts: r.accts }); });
  RM.addEventListener && RM.addEventListener('change', (e) => { S.reduced = e.matches; spin(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.liveAt > LIVE_EVERY) pollLive(); });
}

// ------------------------------------------------------------------------------------------------ the scene
function mapping(s) {
  if (s.kind === 'eval') {
    return { H: s.horizon, tPow: 0.62, yOf: (p) => Math.min(1.12, p) * Y1, gateY: Y1, floorY: 0, money: false,
      gateText: `TARGET ${C.fmtUsd(s.rules.target, true)}`, abyssText: 'FLOOR', spread: 4.6 };
  }
  const bandTop = s.bands[String(S.route.accts)].v[4];
  const top = Math.max(s.goal * 1.15, bandTop[bandTop.length - 1] * 1.05, 1);
  const yOf = (v) => 0.55 + (v / top) * (Y1 - 0.55);         // $0 a little above the floor, so the spindle sits higher
  return { H: s.horizon, tPow: 0.85, yOf, gateY: yOf(s.goal), floorY: null, money: true, gateText: C.fmtK(s.goal), abyssText: '$0', spread: 4.8 };
}
const currentThreads = () => { const s = scen(); return s.kind === 'eval' ? C.evalThreads(s) : C.moneyThreads(s, S.route.accts); };
const DUR = () => (S.route.scen === 'money' ? 6.5 : 5.0);
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 2.2);
const kAt = (sec) => MAP.H * ease(sec / DUR());
function secAt(k) { let lo = 0, hi = DUR(); for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (kAt(m) < k) lo = m; else hi = m; } return hi; }

function build() {
  const all = currentThreads();
  if (!sc) { S.threads = all; return; }
  MAP = mapping(scen());
  S.threads = all.slice(0, S.lite ? 160 : all.length);
  sc.build(S.threads, MAP, secAt);
  if (S.gaugeScene) sc.gauge(S.gaugeScene);
}
function resize() {
  if (!sc) return;
  const h = window.innerHeight;
  O?.mode(S.lite);
  // the free band between the top bar + HUD (measured on resize only, never per frame) and the bottom bar
  sc.resize(($('cap').getBoundingClientRect().bottom || h * 0.35) + 8, $('spin').getBoundingClientRect().top || h * 0.92);
}
function spin() {
  clock0 = performance.now() - (S.reduced ? 1e6 : 0);
  S.spinning = true;
  S.perf = [];
}
let gapAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!sc || (O ? O.hidden() : document.hidden)) return;     // hidden / covered tab: no frame (the battery)
  let gap = O && O.frameGap ? O.frameGap() : 0;              // idle 30 / 15 fps, battery saver, 3D Off 2 fps (docs/OLYMPUS_PERF.md)
  if (S.reduced && O && O.idle && O.idle()) gap = Math.max(gap, 500);    // reduced / 3D Off: an idle scene redraws twice a second at most
  if (gap) { if (now - gapAt < gap - 3) return; S.perf = []; }   // a deliberate cap is not a slow phone: no auto LITE from capped frames
  gapAt = now;
  const sec = (now - clock0) / 1000;
  const k = S.reduced ? MAP.H + 1 : Math.min(MAP.H + 1, kAt(sec) + (sec >= DUR() ? 1 : 0));
  if (S.follow) stepFollow(now);
  sc.frame(now, { k, sec, dur: DUR(), sel: S.sel, reduced: S.reduced, focus: S.sheet === 'next10' ? 10.5 : -1 });
  S.frames++;
  // auto LITE: a slow first spin on this device -> fewer threads, fewer motes, a smaller canvas
  if (S.spinning && !S.lite && !S.forcedFull && !S.reduced) {
    S.perf.push(now);
    if (S.perf.length === 90 && (S.perf[89] - S.perf[30]) / 59 > 21) {
      S.lite = true; $('lite').hidden = false; sc.setLite(true); resize(); build(); spin(); return;
    }
  }
  if (sec > DUR() + 2) S.spinning = false;
}

// ------------------------------------------------------------------------------------------------ the bottom sheet
function fillRows(rows, cls) {
  const ol = $('fRows');
  ol.textContent = '';
  ol.className = cls || '';
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = r.tone || '';
    li.dataset.k = r.k;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = r.text;
    const m = document.createElement('span'); m.className = 'm';
    if (r.bar) {                                     // pass / fail / open, as one stacked bar
      const bar = document.createElement('i'); bar.className = 'stack';
      for (const [c, w] of [['g', r.bar[0]], ['r', r.bar[1]], ['v', r.bar[2]]]) { const x = document.createElement('b'); x.className = c; x.style.width = w.toFixed(1) + '%'; bar.appendChild(x); }
      m.append(bar, document.createTextNode(r.move));
    } else m.textContent = r.move;
    const b = document.createElement('span'); b.className = 'b'; b.textContent = r.bal;
    if (r.room) { const sm = document.createElement('small'); sm.textContent = r.room; b.appendChild(sm); }
    li.append(d, m, b);
    ol.appendChild(li);
  }
}
function showSheet(kind, title, end, tone) {
  S.sheet = kind;
  $('fTitle').textContent = title;
  $('fEnd').textContent = end;
  const box = $('follow');
  box.className = 'sheet follow ' + (tone || '');
  box.dataset.kind = kind;
  box.hidden = false;
  $('next10').setAttribute('aria-expanded', String(kind === 'next10'));
}
function openFollow(i) {
  const th = S.threads.find((t) => t.id === i);
  if (!th) return;
  const s = scen();
  const f = s.kind === 'eval' ? C.followEval(S.data, s, th) : C.followMoney(S.data, s, th);
  closeLab();
  S.sel = i;
  S.follow = { th, f, t0: performance.now(), row: -1 };
  fillRows(f.rows.map((r) => ({ ...r, room: r.room ? `room ${r.room}` : '' })));
  showSheet('follow', f.title, f.end, f.tone);
  sc?.bead(th, 0);
}
function openNext10() {
  const s = scen();
  if (!s || s.kind !== 'eval') return;
  closeLab(); closeSheet();
  const n = C.nextSessions(S.data, s, 10);
  fillRows(n.rows.map((r) => ({ k: r.k, text: r.text, bar: [r.pass, r.fail, r.open],
    move: `${C.fmtPct(r.pass)} pass · ${C.fmtPct(r.fail)} fail`, bal: r.p50 == null ? '—' : C.fmtUsd(r.p50, true),
    room: r.p10 == null ? '' : `${C.fmtUsd(r.p10, true)} … ${C.fmtUsd(r.p90, true)}`, tone: '' })), 'next');
  showSheet('next10', 'Your next 10 sessions', `${s.name} · ${n.threads} threads drawn; all ${Number(n.paths).toLocaleString('en-US')} futures: ` +
    `${C.fmtPct(n.p10)} pass / ${C.fmtPct(n.f10)} fail by session 10 · $ = the open ones' median (p10 … p90)`, 'violet');
}
function stepFollow(now) {
  const F = S.follow, th = F.th;
  const rate = S.route.scen === 'money' ? 24 : 5;                 // sessions a second
  const kEnd = th.pts[th.pts.length - 1][0];
  const k = S.reduced ? kEnd : Math.min(kEnd, (now - F.t0) / 1000 * rate);
  sc?.bead(th, k);
  const rows = F.f.rows;
  let r = -1;
  for (let j = 0; j < rows.length; j++) if (rows[j].k <= k - (S.route.scen === 'money' ? 0 : 1)) r = j;
  if (r !== F.row) {
    F.row = r;
    const lis = $('fRows').children;
    for (let j = 0; j < lis.length; j++) lis[j].classList.toggle('now', j === r);
    if (r >= 0 && lis[r] && !S.reduced) lis[r].scrollIntoView({ block: 'nearest' });
  }
}
function closeLab() { if (lab) lab.close(); $('labBtn').setAttribute('aria-expanded', 'false'); }
function closeSheet() {
  S.sel = -1; S.follow = null; S.sheet = null;
  $('follow').hidden = true;
  $('next10').setAttribute('aria-expanded', 'false');
  sc?.bead(null);
}
function onTap(e) {
  if (!sc || !S.threads.length) return;
  const best = sc.pick(S.threads, e.clientX, e.clientY, sc.probe().k);
  if (best >= 0) { closeSheet(); openFollow(best); } else if (S.sheet) closeSheet();
}
// where thread `id` is on screen (CSS px) at its i-th point, for the page test's tap
S.pointOf = (id, i = 2) => (sc ? sc.pointOf(S.threads.find((t) => t.id === id), i) : null);
S.probe = () => (sc ? sc.probe() : { k: null, calls: 0 });

// ------------------------------------------------------------------------------------------------ OLYMPUS themes
// applyTheme(tokens): the OLYMPUS theme tokens ({bg, glass, line, text, dim, accent, mix, harmony, ...}) or CSS variable
// names ('--x': value). bg blends into FATES's own night by the theme's `mix`, the accent into its gold by `harmony` (both
// 0 in the default theme: nothing changes; missing: the token as given). The scene re-tints its clear colour, fog, gate,
// motes and spindle. With the kit's themes (olympus.js theme / onTheme / themeScene) the kit paints the CSS tokens itself
// and themeScene keeps the scene's fog, clear colour and accent in step; without themeScene, theme() / onTheme feed this.
const OWN = { bg: '#14110e', accent: '#ffcf5a' };
const THEME_VARS = { text: '--txt', dim: '--mut', glass: '--panel', panel: '--panel', line: '--line' };
// '#rrggbb' a -> b by t (0 = a untouched); anything else: b when t > 0 (the OLYMPUS themes' own mix rule, kept local)
function mixHex(a, b, t) {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)) : null);
  const A = p(a), B = p(b);
  if (!(t > 0)) return a;
  if (!A || !B) return b;
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
}
export function applyTheme(tok) {
  if (!tok || typeof tok !== 'object') return;
  const root = document.documentElement.style, mix = typeof tok.mix === 'number' ? tok.mix : 1, har = typeof tok.harmony === 'number' ? tok.harmony : 1;
  const bg = tok.bg ? mixHex(OWN.bg, tok.bg, mix) : null, acc = tok.accent ? mixHex(OWN.accent, tok.accent, har) : null;
  if (bg && mix > 0) root.setProperty('--bg', bg);
  if (acc && har > 0) root.setProperty('--gold', acc);
  for (const [k, v] of Object.entries(tok)) {
    if (typeof v !== 'string') continue;
    if (k.startsWith('--')) root.setProperty(k, v); else if (THEME_VARS[k] && mix > 0) root.setProperty(THEME_VARS[k], v);
  }
  S.theme = tok;
  sc?.theme({ bg: mix > 0 ? bg : null, accent: har > 0 ? acc : null });
}
window.applyTheme = applyTheme;
function hookTheme() {
  if (!O) return;
  try {
    if (typeof O.themeScene === 'function' && sc) { O.themeScene({ scene: sc.scene, renderer: sc.R, emissive: [sc.accent] }); S.themeHook = 'themeScene'; return; }
    if (typeof O.theme === 'function') { applyTheme(O.theme()); S.themeHook = 'theme'; }
    if (typeof O.onTheme === 'function') O.onTheme(applyTheme);
  } catch (_) { /* a kit without themes */ }
}

// ------------------------------------------------------------------------------------------------ Jarvis's live card
function postCard() {
  try {
    const card = C.jarvisCard(S.data);
    if (card && !S.demo && window.parent !== window) window.parent.postMessage({ jarvis: 1, href: location.href, card }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io'));
  } catch (_) { /* outside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
window.addEventListener('error', (e) => S.errors.push(String(e.message || e)));
(async function main() {
  wire();
  const got = await loadData();
  if (!got) { $('sub').textContent = 'No data yet: run python -X utf8 -m tools.fates.build'; S.ready = true; O?.fail('no data yet'); return; }
  S.data = got.j; S.demo = got.demo;
  $('demo').hidden = !S.demo;
  if (S.lite) $('lite').hidden = false;
  if (!S.data.scenarios[C.scenKey(S.route)]) S.route.period = '2026';
  renderHud();
  sc = createScene($("scene"), { lite: S.lite });
  S.sc = sc;                                       // the scene, for the tests and the perf probe
  if (sc) {
    O?.track(sc.R);
    S.webgl = true;
    resize();
    addEventListener('resize', resize);
    $('scene').addEventListener('pointerup', onTap);
    build();
    spin();
    requestAnimationFrame(frame);
  } else {
    $('nogl').hidden = false; $('scene').hidden = true;
    S.threads = currentThreads();
    O?.ready();                                    // no 3D on this device: the numbers are the page
  }
  hookTheme();
  postCard();
  S.ready = true;
  pollLive();
  setInterval(pollLive, LIVE_EVERY);
})();
