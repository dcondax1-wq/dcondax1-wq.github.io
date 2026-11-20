// HERMES, the messenger god: OLYMPUS Wrapped. Full-screen stories over wrapped.json (tools/hermes/build.py).
// Tap the right side or swipe left = next, tap the left side or swipe right = back, hold = pause, arrows / space on a
// keyboard, a tap on the progress bar jumps to that story, the ❚❚ button pauses. Routes: #week (default), #month, #all;
// add ",demo" (e.g. #week,demo) for the demo data. "Share" makes the card on screen an image; "Share the week" on the
// last story makes the whole recap one image.
// Inside Jarvis it posts its card (jarvis.json) to Jarvis. window.HERMES is a small handle for tests and Jarvis.
// Themes: applyTheme(theme) restyles the page; it follows olympus.js's theme (OLYMPUS.theme() / onTheme) when the kit has one.
import { loadWrapped, loadPeers, plannerPeriod } from './data.js';
import { deck, animateCounts } from './cards.js';
import { createFx } from './fx.js';
import { renderPNG, renderWeekPNG, share } from './share.js';

const JARVIS_ORIGIN = (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io');   // Jarvis is on the same origin as the app; the old address only when opened from a file
const PERIODS = [['week', 'Week'], ['month', 'Month'], ['all', 'All time']];
const PEERS_WAIT_MS = 1500;
const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil
const still = O ? O.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);

const S = { w: null, demo: false, key: 'week', peers: {}, cards: [], i: -1, el: null, html: '', t0: 0, held: 0, paused: false, stopCount: null, raf: 0, lastShare: null };
const lite = O ? O.lite() : false;
const fx = createFx($('#bg'), $('#fx'), { still, lite });
O?.mode(lite);                              // LITE: a smaller shader buffer, fewer particles, 1.5 px per CSS px (fx.js)
// a theme's colour names -> this page's CSS custom properties (hermes.css :root)
const THEME_KEYS = { accent: '--gold', gold: '--gold', bg: '--bg', background: '--bg', text: '--text', dim: '--text2', line: '--line', up: '--up', down: '--down' };

function route() {
  const parts = decodeURIComponent(location.hash.slice(1)).split(/[,/]/);
  return { key: PERIODS.some(([k]) => k === parts[0]) ? parts[0] : 'week', demo: parts.includes('demo') };
}

// ------------------------------------------------------------------------------------------------ the chrome
function chrome() {
  $('#periods').innerHTML = PERIODS.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === S.key}">${n}</button>`).join('');
  $('#prog').innerHTML = S.cards.map(() => '<span><i></i></span>').join('');
  $('#demo').hidden = !S.demo;
  document.documentElement.dataset.period = S.key;
}

function setPaused(v) {
  S.paused = !!v;
  const b = $('#play');
  if (b) { b.setAttribute('aria-pressed', String(S.paused)); b.setAttribute('aria-label', S.paused ? 'Play' : 'Pause'); }
}

function progress(frac) {
  const segs = $('#prog').children;
  for (let j = 0; j < segs.length; j++) segs[j].firstChild.style.transform = `scaleX(${j < S.i ? 1 : j > S.i ? 0 : frac})`;
}

// ------------------------------------------------------------------------------------------------ the stories
function show(i, dir = 1) {
  if (!S.cards.length) return;
  i = Math.max(0, Math.min(S.cards.length - 1, i));
  const c = S.cards[i];
  if (S.stopCount) S.stopCount();
  const old = S.el;
  const el = document.createElement('section');
  el.className = `card c-${c.id}${still ? ' on' : ''}`;
  el.dataset.id = c.id;
  el.setAttribute('aria-label', `${i + 1} of ${S.cards.length}`);
  el.innerHTML = `<div class="tilt">${c.html}</div>`;
  S.html = c.html;
  el.style.setProperty('--dir', dir);
  $('#stage').appendChild(el);
  fit(el);
  if (old) {
    old.classList.remove('on');
    old.classList.add('leave');
    setTimeout(() => old.remove(), still ? 0 : 450);
  }
  if (!still) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  S.el = el; S.i = i; S.t0 = performance.now(); S.held = 0;
  fx.palette(c.colors, c.mode);
  S.stopCount = animateCounts(el, still);
  setTimeout(() => { if (S.el === el) c.enter(el, fx, still); }, still ? 0 : 380);
  $('#pos').replaceChildren(Object.assign(document.createElement('b'), { textContent: `${i + 1}/${S.cards.length}` }), document.createTextNode(c.name || ''));
  document.querySelector('meta[name="theme-color"]').content = c.colors[0];
  progress(still ? 1 : 0);
  tick();
}
// a card taller than its space (a small phone, a long lesson) is scaled to fit: never cut, never in the orb's corner
function fit(el) {
  const t = el.querySelector('.tilt'), room = el.clientHeight, need = t.scrollHeight;
  if (need > room && room > 0) { el.classList.add('fit'); el.style.setProperty('--fit', (room / need).toFixed(4)); }
}
const next = () => (S.i < S.cards.length - 1 ? show(S.i + 1, 1) : (setPaused(true), progress(1)));
const prev = () => show(S.i - 1, -1);

function tick() {
  if (S.raf || still) return;
  const step = (now) => {
    S.raf = 0;
    if ((window.OLYMPUS ? window.OLYMPUS.hidden() : document.hidden) || !S.cards.length) return;
    const gap = window.OLYMPUS && window.OLYMPUS.frameGap ? window.OLYMPUS.frameGap() : 0;     // idle / saver / Off: the progress bar waits too
    if (gap && now - (S.tickAt || 0) < gap - 3) { S.raf = requestAnimationFrame(step); return; }
    S.tickAt = now;
    const c = S.cards[S.i];
    if (S.paused) { S.t0 = now - S.held; } else S.held = now - S.t0;
    progress(Math.min(1, S.held / c.ms));
    if (!S.paused && S.held >= c.ms) { next(); return; }
    S.raf = requestAnimationFrame(step);
  };
  S.raf = requestAnimationFrame(step);
}

function cardsFor(key) {
  return deck(S.w, key, { ...S.peers, planner: plannerPeriod(S.w.periods[key] || S.w.periods.week) });
}

function refresh() {
  const id = (S.cards[S.i] || {}).id;
  S.cards = cardsFor(S.key);
  S.i = Math.max(0, S.cards.findIndex((c) => c.id === id));
  chrome();
  progress(Math.min(1, S.held / S.cards[S.i].ms));
  const c = S.cards[S.i], t = S.el && S.el.querySelector('.tilt');
  if (t && S.el.dataset.id === c.id && S.html !== c.html) {          // the card on screen changed: redraw it in place
    if (S.stopCount) S.stopCount();
    t.innerHTML = S.html = c.html;
    S.stopCount = animateCounts(S.el, true);
    fit(S.el);
  }
}

function build(key) {
  S.key = key;
  S.cards = cardsFor(key);
  setPaused(false);
  chrome();
  show(0);
}

// ------------------------------------------------------------------------------------------------ input
function input() {
  const stage = $('#stage');
  let down = null, holdT = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    holdT = setTimeout(() => { setPaused(true); document.body.classList.add('held'); }, 260);
  });
  const end = (e, cancel) => {
    clearTimeout(holdT);
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t, wasHeld = document.body.classList.contains('held');
    down = null;
    document.body.classList.remove('held');
    if (wasHeld) setPaused(false);
    if (cancel) return;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { setPaused(false); dx < 0 ? next() : prev(); return; }
    if (wasHeld || dt > 260 || Math.abs(dy) > 40) return;
    setPaused(false);
    e.clientX < innerWidth * 0.3 ? prev() : next();
  };
  stage.addEventListener('pointerup', (e) => end(e, false));
  stage.addEventListener('pointercancel', (e) => end(e, true));
  stage.addEventListener('pointermove', (e) => {
    if (still || down || !S.el) return;
    S.el.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3));
    S.el.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3));
  });
  stage.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'replay') build(S.key);
    if (b && b.dataset.act === 'share-week') onShareWeek(b);
    if (b && b.dataset.act === 'copy-text') copyText(b);
  });
  // the progress bar: a tap on a segment jumps to that story
  $('#prog').addEventListener('click', (e) => {
    const r = $('#prog').getBoundingClientRect(), n = S.cards.length;
    if (!n || !r.width) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    setPaused(false);
    show(i, i >= S.i ? 1 : -1);
  });
  $('#play').addEventListener('click', () => { setPaused(!S.paused); if (!S.paused && S.i === S.cards.length - 1 && S.held >= S.cards[S.i].ms) show(0); });
  $('#periods').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    history.replaceState(null, '', '#' + b.dataset.k + (route().demo ? ',demo' : ''));
    build(b.dataset.k);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft') prev();
  });
  addEventListener('hashchange', () => { const r = route(); if (r.key !== S.key && S.w) build(r.key); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.t0 = performance.now() - S.held; tick(); } });
  $('#share').addEventListener('click', onShare);
  if (!still) fx.onFrame((t) => {                                       // the idle sway of the 3D tilt; a paused story rests (its buttons hold still under a finger)
    if (S.el && !S.paused) { S.el.style.setProperty('--sx', (Math.sin(t * 0.6) * 0.5).toFixed(3)); S.el.style.setProperty('--sy', (Math.cos(t * 0.45) * 0.5).toFixed(3)); }
  });
}

async function onShare() {
  const c = S.cards[S.i];
  if (!c) return;
  const btn = $('#share');
  btn.disabled = true;
  setPaused(true);
  try {
    const blob = await renderPNG(c.share(), fx.colors());
    S.lastShare = { type: blob.type, size: blob.size, card: c.id };
    dispatchEvent(new CustomEvent('hermes:share', { detail: S.lastShare }));
    const how = await share(blob, `olympus-wrapped-${S.key}-${c.id}.png`);
    toast(how === 'shared' ? 'Shared' : how === 'opened' ? 'Image opened: press and hold to save' : how === 'cancelled' ? 'Cancelled' : 'Could not share');
  } catch (e) {
    toast('Could not make the image');
  } finally {
    btn.disabled = false;
    setPaused(false);
  }
}

async function onShareWeek(btn) {
  if (!S.w) return;
  btn.disabled = true;
  setPaused(true);
  try {
    const blob = await renderWeekPNG(S.w, S.key, ['#19140e', '#6f9bb8', '#c8a24a']);
    S.lastShare = { type: blob.type, size: blob.size, card: 'week', key: S.key };
    dispatchEvent(new CustomEvent('hermes:share', { detail: S.lastShare }));
    const how = await share(blob, `olympus-wrapped-${S.key}.png`);
    toast(how === 'shared' ? 'Shared' : how === 'opened' ? 'Image opened: press and hold to save' : how === 'cancelled' ? 'Cancelled' : 'Could not share');
  } catch (e) {
    toast('Could not make the image');
  } finally {
    btn.disabled = false;
  }
}

/** Restyle the page from a theme: {accent, bg, text, up, down, ...} or CSS custom properties ('--x': value), flat or one
 * level down (e.g. {name, vars: {...}}). Unknown keys and unsafe values are ignored. Returns what it applied. */
function applyTheme(theme) {
  if (!theme || typeof theme !== 'object') return {};
  const known = (o) => Object.keys(o).some((k) => k.startsWith('--') || k in THEME_KEYS);
  const t = known(theme) ? theme : Object.values(theme).find((v) => v && typeof v === 'object' && !Array.isArray(v) && known(v));
  if (!t) return {};
  const root = document.documentElement.style, done = {};
  for (const [k, v] of Object.entries(t)) {
    const prop = k.startsWith('--') ? k : THEME_KEYS[k];
    if (prop && typeof v === 'string' && v.length < 200 && !/[;{}<>]/.test(v)) { root.setProperty(prop, v); done[prop] = v; }
  }
  return done;
}

function followTheme() {
  const api = window.OLYMPUS || window.Olympus || null;
  if (!api) return;
  try {
    if (typeof api.theme === 'function') { const t = api.theme(); if (t && typeof t === 'object') applyTheme(t); }
    if (typeof api.onTheme === 'function') api.onTheme((t) => applyTheme(t));
  } catch (_) { /* an older kit: the page's own look */ }
}

// "Copy as text" (the Summary card): the period in one plain line on the clipboard, with a toast; a textarea fallback for a phone that refuses the API
async function copyText(b) {
  const text = b.dataset.text || '';
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
    try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (__) { ok = false; }
  }
  toast(ok ? 'Copied: paste it anywhere' : 'Could not copy: select the text and copy it');
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('on'), 2200);
}

async function postToJarvis() {
  if (window.parent === window) return;
  try {
    const r = await fetch('jarvis.json', { cache: 'no-cache' });
    if (r.ok) window.parent.postMessage({ jarvis: 1, href: location.href, card: await r.json() }, JARVIS_ORIGIN);
  } catch (_) { /* Jarvis keeps its last card */ }
}

// ------------------------------------------------------------------------------------------------ start
async function start() {
  const r = route();
  const wait = (ms) => new Promise((ok) => setTimeout(() => ok({}), ms));
  const peers = loadPeers();
  const got = await loadWrapped(r.demo);
  if (!got.w) {
    $('#stage').innerHTML = '<section class="card on c-err"><div class="tilt"><p class="kicker">HERMES</p><h1 class="title">The recap could not load</h1><button type="button" class="btn" onclick="location.reload()">Try again</button></div></section>';
    fx.palette(['#100d0a', '#31231a', '#e0907a'], 0);
    O?.fail('the recap could not load');
    return;
  }
  S.w = got.w; S.demo = got.demo;
  S.peers = await Promise.race([peers, wait(PEERS_WAIT_MS)]);
  document.body.classList.remove('loading');
  const splash = $('.splash');
  if (splash) splash.remove();
  build(r.key);
  O?.ready();                               // the first card is on screen
  peers.then((p) => {                       // a peer that answered late: its card joins the deck, the story keeps its place
    const late = (p.kalshi && !S.peers.kalshi) || (p.discovery && !S.peers.discovery) || (p.fates && !S.peers.fates);
    S.peers = p;
    if (late) refresh();
  });
  postToJarvis();
}

window.HERMES = { next: () => next(), prev: () => prev(), go: (i) => show(i), state: () => ({ key: S.key, i: S.i, n: S.cards.length, id: (S.cards[S.i] || {}).id, ids: S.cards.map((c) => c.id), demo: S.demo, paused: S.paused, gl: fx.gl, still, particles: fx.count(), name: (S.cards[S.i] || {}).name }),
  get lastShare() { return S.lastShare; }, pause: (v = true) => setPaused(v), applyTheme: (t) => applyTheme(t) };
followTheme();
input();
start();
