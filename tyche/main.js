// TYCHE: the Kalshi bot's bets as a 3D wheel of fortune (owner 2026-11-03). Read-only: it never trades, never writes.
// Boot, the feed schedule, the frame loop, Jarvis's card.
//   The feed: kalshi.json every minute while the page is visible (data.js Feed). A 404 = the bot is not linked yet: the demo,
//   labelled "Not linked yet: demo", and the next try 10 min later (doubling to an hour): one request per page load.
//   Older than 15 min: LAST SEEN with the bot's last numbers. ?demo=1: the demo, no request at all.
//   Quality: HD, or LITE (lower resolution, fewer particles), picked by the owner or switched on once by itself when frames run
//   slow; prefers-reduced-motion: a still scene, redrawn 4 times a second for the countdowns.
import * as THREE from '../jarvis/three.module.min.js';
import { Feed, normalize, STALE_S } from './data.js';
import { demoFeed } from './demo.js';
import { categoryColors, usd, pct, countdown } from './fmt.js';
import { FortuneScene } from './scene.js';
import { Hud, KELLY_STOPS } from './hud.js';
import { FortunePanel } from './fortunepanel.js';
import { CashPanel } from './cashpanel.js';
import { startSceneFx, startAtmosphere, ceremony } from './tychefx.js';

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil
const QUALITY_KEY = 'tyche.quality', VIEW_KEY = 'tyche.view';   // quality: the old per-app key, read only without the kit
const THEME = '#14110e';
const reduced = O ? O.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const forced = params.has('demo');
const VIEWS = ['wheel', 'pools', 'scales', 'bank', 'fortune', 'cash'];     // fortune: the leaderboard / streak / fortune / compare / replay panel (the wheel stays behind it)

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode: this visit only */ } },
};
const savedQ = O ? (O.chosen() ? (O.lite() ? 'low' : 'high') : null) : store.get(QUALITY_KEY), hashView = location.hash.slice(1), savedView = store.get(VIEW_KEY);
const state = {
  mode: 'loading', model: null, raw: '', colors: new Map(), quality: savedQ === 'low' || savedQ === 'high' ? savedQ : O && O.lite() ? 'low' : 'high',
  chosen: savedQ === 'low' || savedQ === 'high', fps: 0, card: '', view: VIEWS.indexOf(hashView) >= 0 ? hashView : VIEWS.indexOf(savedView) >= 0 ? savedView : 'wheel',
  kelly: 0, selected: null, feed: new Feed(), timer: 0, demoAt: 0,
};
const nowS = () => Date.now() / 1000;

// ------------------------------------------------------------------ the pieces
const hud = new Hud({
  view: (v) => setView(v),
  kelly: (i) => setKelly(i),
  select: (k) => select(k),
  quality: () => setQuality(state.quality === 'high' ? 'low' : 'high', true),
});
hud.quality(state.quality);
const fortune = new FortunePanel(document.getElementById('p-fortune'), { reduced });
const cash = new CashPanel(document.getElementById('p-cash'), { reduced, now: nowS });     // the money view: break-even, at risk, pace, hours
let scene = null;
try {
  scene = new FortuneScene(THREE, document.getElementById('gl'), { quality: state.quality, reduced });
  O?.track(scene.renderer);
  O?.themeScene?.({ scene: scene.scene, renderer: scene.renderer });   // OLYMPUS theme: fog + sky follow it
  startSceneFx(scene, { lite: state.quality === 'low' });                // caustics + gold motes from the effects library (never needed)
  startAtmosphere(scene, { lite: state.quality === 'low', reduced });      // light shafts + rising sparks from the atmosphere kit (never needed)
} catch (e) {
  console.warn('tyche: 3D unavailable', e && e.message);
  document.getElementById('nogl').hidden = false;
  document.body.classList.add('no-webgl');
  O?.ready();                                  // the numbers above still update: the page is up
}
O?.mode(state.quality === 'low');

function setQuality(q, chosen) {
  state.quality = q;
  if (chosen) { state.chosen = true; if (O) O.setFx(q === 'high' ? 'high' : 'low'); else store.set(QUALITY_KEY, q); }
  O?.mode(q === 'low');
  hud.quality(q);
  if (scene) scene.setQuality(q);
}
function setView(v) {
  if (VIEWS.indexOf(v) < 0) return;
  state.view = v;
  store.set(VIEW_KEY, v);
  if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  if (v !== 'wheel') select(null);
  hud.setView(v);
  if (v === 'fortune') fortune.draw();
  if (v === 'cash') cash.draw();
  if (scene) scene.setView(v === 'fortune' || v === 'cash' ? 'wheel' : v);
  fit();
}
function setKelly(i) {
  state.kelly = Math.max(0, Math.min(KELLY_STOPS.length - 1, i | 0));
  hud.setKelly(state.kelly);
  if (scene) scene.setKelly(KELLY_STOPS[state.kelly]);
}
function select(key) {
  state.selected = key;
  hud.select(key);
  if (scene) scene.select(hud.selected);
  fit();
}
function fit() {
  hud.measure();
  if (scene) scene.setBand(hud.band());
}
addEventListener('resize', () => requestAnimationFrame(fit));
if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(document.getElementById('top')); ro.observe(document.getElementById('dock')); }
addEventListener('hashchange', () => setView(location.hash.slice(1)));

// ------------------------------------------------------------------ the data in
/** A feed (or the demo) on screen. Unchanged JSON = nothing redrawn (open sheets, coins in flight stay). */

// An honest, usable market board when WebGL fails. It reads exactly the same normalized feed as the 3D scene.
function renderFallback(model) {
  if (scene || !model) return;
  const host = document.getElementById('nogl-list');
  if (!host) return;
  host.replaceChildren();
  const items = model.open.slice().sort((a, b) => (a.closes ?? Infinity) - (b.closes ?? Infinity)).slice(0, 5);
  const label = document.createElement('h2'); label.textContent = 'Open bets'; host.append(label);
  if (!items.length) {
    const empty = document.createElement('p'); empty.textContent = 'No open bets in this feed. The Bank, Fortune and Cash tabs still work below.'; host.append(empty);
    return;
  }
  for (const p of items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'nogl-market';
    const title = document.createElement('strong'); title.textContent = p.title;
    const sub = document.createElement('span');
    sub.textContent = [p.side ? p.side.toUpperCase() : '', p.cost == null ? '' : 'Cost ' + usd(p.cost),
      p.pnl == null ? '' : 'Open P&L ' + usd(p.pnl, true)].filter(Boolean).join(' · ');
    button.append(title, sub);
    button.addEventListener('click', () => select(p.key));
    host.append(button);
  }
  if (model.open.length > items.length) {
    const more = document.createElement('p');
    more.textContent = `Showing the next ${items.length} of ${model.open.length} open bets. Kalshi shows the full list.`;
    host.append(more);
  }
}

function show(raw, mode) {
  const key = JSON.stringify(raw);
  const same = key === state.raw;
  state.raw = key;
  const m = normalize(raw, nowS());
  if (!m) return;
  const was = state.mode;
  state.mode = mode === 'live' && m.age != null && m.age > STALE_S ? 'stale' : mode;
  if (!same || !state.model) {
    state.model = m;
    state.colors = categoryColors(m.order);
    hud.render(m, state.colors);
    renderFallback(m);
    if (scene) scene.setModel(m, state.colors);
    fortune.setModel(m);
    cash.setModel(m);
  } else state.model.age = m.age;
  if (!same || was !== state.mode) hud.mode(state.mode, state.model);
  hud.tick(nowS());
  postCard();
  document.body.dataset.ready = '1';
  fit();
}

const isDemo = () => state.mode !== 'live' && state.mode !== 'stale';
/** The demo, made as of now (so its countdowns run); remade every 2 min while it shows. */
function showDemo(mode) {
  state.demoAt = nowS();
  show(demoFeed(state.demoAt), mode);
}

async function poll() {
  clearTimeout(state.timer);
  const r = await state.feed.poll();
  if (r.state === 'ok') show(r.raw, 'live');
  else if (!state.model || isDemo()) showDemo(r.state === 'unlinked' ? 'unlinked' : 'offline');
  else hud.mode(state.mode, state.model);              // a failed poll keeps the last real numbers (LAST SEEN / LIVE)
  schedule();
}
function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { if (!document.hidden) poll(); else schedule(); }, state.feed.delay());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || forced) return;
  // back in view: a fresh poll when the bot is linked (or the last try failed); never inside the 404 backoff
  if (state.feed.last === 'ok' || state.feed.last === 'error') poll();
});

// ------------------------------------------------------------------ Jarvis's live card (when Jarvis frames this page)
function postCard() {
  const m = state.model;
  if (window.parent === window || !m) return;
  const demo = isDemo();
  const card = {
    v: 1, name: 'Tyche', theme: THEME, open: '#wheel',
    status: demo ? { level: 'off', label: state.mode === 'unlinked' ? 'Not linked yet: demo' : 'Demo' }
      : state.mode === 'stale' ? { level: 'warn', label: 'Kalshi bot quiet' } : { level: 'ok', label: `${m.open.length} coins on the wheel` },
    kpis: [{ label: 'Balance', value: usd(m.balance) }, { label: 'Today', value: usd(m.today, true) }, { label: 'Win rate', value: pct(m.stats.winRate) }],
    lines: [m.next ? `Next: ${m.next.title}`.slice(0, 120) : 'No open bet'],
  };
  const key = JSON.stringify(card);
  if (key === state.card) return;
  state.card = key;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, t: Math.round(nowS()) } }, location.origin); } catch (_) { /* not Jarvis */ }
}

// ------------------------------------------------------------------ touch: drag to turn, pinch to zoom, tap a coin, double tap
const canvas = document.getElementById('gl');
const touch = { pts: new Map(), start: null, moved: 0, dist: 0, lastTap: 0 };
canvas.addEventListener('pointerdown', (e) => {
  touch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (touch.pts.size === 1) { touch.start = [e.clientX, e.clientY, performance.now()]; touch.moved = 0; }
  if (touch.pts.size === 2) { const [a, b] = Array.from(touch.pts.values()); touch.dist = Math.hypot(a[0] - b[0], a[1] - b[1]); }
});
canvas.addEventListener('pointermove', (e) => {
  const p = touch.pts.get(e.pointerId);
  if (!p || !scene) return;
  if (touch.pts.size === 1) { scene.drag(e.clientX - p[0]); touch.moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
  touch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (touch.pts.size === 2) {
    const [a, b] = Array.from(touch.pts.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (touch.dist) scene.pinch(d / touch.dist);
    touch.dist = d;
    touch.moved = 99;
  }
});
const up = (e) => {
  touch.pts.delete(e.pointerId);
  if (!touch.start || touch.pts.size || !scene) return;
  const quick = performance.now() - touch.start[2] < 450 && touch.moved < 10;
  touch.start = null;
  if (!quick) return;
  const t = performance.now();
  if (t - touch.lastTap < 320) { scene.reset(); touch.lastTap = 0; return; }
  touch.lastTap = t;
  const key = state.view === 'wheel' ? scene.pick(e.clientX, e.clientY) : null;
  select(key && key !== state.selected ? key : null);
  if (!key && state.view === 'wheel' && scene.onWheel(e.clientX, e.clientY)) { scene.wheel.kick(); ceremony(); }     // a tap on the wheel spins it (visual only), with a ring of gold light
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', (e) => { touch.pts.delete(e.pointerId); touch.start = null; });

// ------------------------------------------------------------------ the frame loop
const perf = { frames: 0, t: 0, slow: 0 };
let last = performance.now(), lastDraw = 0, lastTick = 0;
const labelLayer = document.getElementById('labels');
function frame(ts) {
  requestAnimationFrame(frame);
  if (O ? O.hidden() : document.hidden) { last = ts; return; }     // hidden tab: no frame (the battery)
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
  last = ts;
  if (ts - lastTick > 1000) {
    lastTick = ts;
    hud.tick(nowS());
    if (state.model && !isDemo() && state.model.t != null) {      // the bot's numbers age: LIVE turns LAST SEEN after 15 min
      state.model.age = Math.max(0, nowS() - state.model.t);
      if (state.mode === 'live' && state.model.age > STALE_S) { state.mode = 'stale'; postCard(); }
      if (state.mode === 'stale') hud.mode('stale', state.model);
    }
    if (state.model && isDemo() && nowS() - state.demoAt > 120) showDemo(state.mode);
  }
  const gap = O && O.frameGap ? O.frameGap() : 0;                           // idle 30 / 15 fps, battery saver, 3D Off 2 fps (docs/OLYMPUS_PERF.md)
  if (!scene || !state.model || (reduced && ts - lastDraw < 250) || (gap && ts - lastDraw < gap - 3)) return;
  scene.frame(ts / 1000, reduced ? 0 : Math.min(0.1, (ts - lastDraw) / 1000), nowS());
  lastDraw = ts;
  // the 3D labels wait for the intro camera move to land (no labels sliding about, no layout work while the camera flies)
  const flying = scene.intro < 1;
  if (labelLayer.classList.contains('wait') !== flying) labelLayer.classList.toggle('wait', flying);
  if (!flying) hud.labels(scene.labels(nowS(), state.quality === 'high' ? 14 : 8));
  autoLite(dt);
}
/** Two slow 2-second windows in a row on HD (and no saved choice): LITE, once. */
function autoLite(dt) {
  perf.frames++;
  perf.t += dt;
  if (perf.t < 2) return;
  state.fps = Math.round(perf.frames / perf.t);
  perf.slow = state.fps < 40 ? perf.slow + 1 : 0;
  perf.frames = perf.t = 0;
  if (perf.slow >= 2 && state.quality === 'high' && !state.chosen && !reduced) setQuality('low', false);
}

// ------------------------------------------------------------------ OLYMPUS themes
/** The page's one theme entry point: an OLYMPUS theme's tokens ({ accent, accent2, bg, text, muted } as #rrggbb) -> the HUD's
 *  colours (gold, mint, text, dim). Only plain hex colours are taken; null / {} = Tyche's own gold and mint again. The 3D scene
 *  keeps its gold: it is the fortune itself. Hooked to Olympus.theme() / onTheme when the kit has them. */
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i, THEME_VARS = { accent: '--gold', accent2: '--mint', text: '--text', muted: '--dim', bg: '--bg' };
function applyTheme(tokens) {
  const root = document.documentElement, out = {};
  Object.keys(THEME_VARS).forEach((k) => {
    const v = tokens && typeof tokens === 'object' ? (tokens[k] != null ? tokens[k] : tokens['--oly-' + k]) : null;
    if (typeof v === 'string' && HEX.test(v.trim())) { root.style.setProperty(THEME_VARS[k], v.trim()); out[k] = v.trim(); } else root.style.removeProperty(THEME_VARS[k]);
  });
  return out;
}
window.applyTheme = applyTheme;
try {
  if (O && typeof O.onTheme === 'function') O.onTheme(applyTheme);
  if (O && typeof O.theme === 'function') { const t = O.theme(); if (t && typeof t === 'object') applyTheme(t); }
} catch (_) { /* a kit without themes */ }

// ------------------------------------------------------------------ boot
window.tyche = {
  get mode() { return state.mode; },
  get model() { return state.model; },
  get quality() { return state.quality; },
  get fps() { return state.fps; },
  get requests() { return state.feed.requests; },
  get view() { return state.view; },
  get fortune() { return fortune; },
  get cash() { return cash; },
  get bank() { return hud.sim || null; },                   // the bankroll panel's simulation (risk of ruin ...)
  get passes() { return scene ? scene.rc.passes() : []; },    // the render core's passes this frame
  get tier() { return scene ? scene.rc.quality() : ''; },
  get intro() { return scene ? scene.intro : 1; },          // the intro camera move: 0 -> 1 (1 = done or skipped)
  get spin() { return scene ? scene.wheel.spinV : 0; },
  wheelAt() { if (!scene) return null; const v = new THREE.Vector3(0, 0.1, 0.6).project(scene.camera); return { x: ((v.x + 1) / 2) * scene.size.w, y: ((1 - v.y) / 2) * scene.size.h }; },
  get coins() { return scene ? scene.wheel.coins.size : 0; },
  get falling() { return scene ? scene.pools.falling.length + scene.pools.queue.length : 0; },
  kellyStake(key) { const c = scene && Array.from(scene.wheel.coins.values()).find((x) => x.key === key); return c && c.kelly ? c.kelly.stake : null; },
  /** A coin's centre on screen, for taps. */
  coinAt(key) {
    if (!scene) return null;
    const c = Array.from(scene.wheel.coins.values()).find((x) => x.key === key);
    if (!c) return null;
    const v = c.mesh.position.clone().project(scene.camera);
    return { x: ((v.x + 1) / 2) * scene.size.w, y: ((1 - v.y) / 2) * scene.size.h };
  },
  setView, setKelly, select, countdown,
};
setView(state.view);
setKelly(0);
if (forced) showDemo('demo');
else poll();
requestAnimationFrame(frame);
