// ODEON app: wires the modules together and runs the clock.
//   data.js      trades.json (tools/odeon_export.py) or the demo fixture
//   timeline.js  where a trade stands at market time T (pure)
//   scene.js     the 3D theater (three.js) | flat.js the 2D fallback without WebGL
//   director.js  the camera shots and beats
//   captions.js  the caption track, transcript, speech, callouts
//   ui.js        the reels gallery, transport, stats card
// Market time T runs at speed x 60 market seconds per real second (1x = one 1m bar a second), with a slow-motion time ramp
// on the sweep, the entry and the exit (director.js: a letterbox closes in while it lasts). Film effects over the canvas:
// bokeh depth of field (scene.js) and a focus falloff around the free band, a lens flare on the entry, grain and vignette
// (off on LITE / reduced motion). Highlights: the five best trades by $, back to back. Routes: #reels (the gallery), #reel=<id> (play that reel),
// #trade=<day>_<HHMM>_<side> (Oracle's link: the reel of that trade, any source), #highlights. ?demo=1 the fixture,
// The library (2026-11-04): filters (win / loss, setup, session, month, R bin), a histogram of R, Play all / Best 5 / Worst 5 queues, compare two
// trades, the trade's numbers on the stage, a share card (PNG). ?lite=1|0. applyTheme(tokens) takes an OLYMPUS theme (window.OLYMPUS.theme() / onTheme, when the kit has them).
import { loadReels, demoBundle, fmtUsd, fmtR, fmtPx, dayLabel, hhmm } from './data.js';
import { phase, openPnl, stopAt } from './timeline.js';
import { Captions, Callouts } from './captions.js?v=odescrub1';
import { Reels, Transport, SPEEDS, fillStats, sortReels, StageStats } from './ui.js';
import { TradeStrip } from './strip.js';
import { Compare } from './compare.js';
import { drawCard, shareTrade } from './share.js';
import { queueOf, applyFilters, statsOf, histogram, runStats } from './library.js';

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil
const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
const reduced = O ? O.reduced() : mq('(prefers-reduced-motion: reduce)');
const liteParam = qs.get('lite');

const S = {
  trades: [], demo: false, tr: null, T: 0, playing: false, ended: false, speed: Number(qs.get('speed')) || 10,
  // ?lite= wins (tests, screenshots); else the owner's OLYMPUS choice; else the frame rate decides (auto LITE)
  lite: liteParam != null ? liteParam === '1' : !!(O && O.lite()), autoLite: liteParam == null && !(O && O.chosen()), statsAt: 0, wall: 0, stage: null, three: null, camera: null, dir: null,
  fps: { n: 0, sum: 0, slow: 0 }, statsShown: false, crossed: [], slow: 1, hl: null,
};
const HL_N = 5, HL_GAP = 2.8;          // highlights: the five best trades; seconds on each stats card before the next
if (SPEEDS.indexOf(S.speed) < 0) S.speed = 10;

const canvas = $('#stage');
const cc = new Captions({ line: $('#cc'), transcript: $('#transcript'), reduced });
const callouts = new Callouts($('#callouts'));
const reels = new Reels($('#reels'), (id) => { S.hl = null; openReel(id, true); showReels(false); });
const onstage = new StageStats($('#onstage'));
const compare = new Compare($('#compare'), { play: (id) => { S.hl = null; openReel(id, true); showReels(false); }, closed: () => setCompareMode(false) });
reels.onCompare = (a, b) => compare.show(a, b);
const strip = new TradeStrip($('#strip'), (id) => { S.hl = null; openReel(id, true); });
const transport = new Transport($('#transport'), {
  toggle: () => (S.ended ? restart() : setPlaying(!S.playing)),
  speed: (x) => setSpeed(x),
  seek: (T) => seek(T),
  restart: () => restart(),
});

// ---------------------------------------------------------------- the stage (3D, or 2D without WebGL)
async function makeStage() {
  try {
    const probe = document.createElement('canvas');
    const ok = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
    if (!ok || qs.get('flat') === '1') throw new Error('no webgl');
    const [{ Theater }, { Director }, THREE] = await Promise.all([import('./scene.js'), import('./director.js'), import('../jarvis/three.module.min.js')]);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 1500);
    const th = new Theater(canvas, { lite: S.lite, reduced, camera: cam });
    th.cam = cam;
    O?.track(th.renderer);
    O?.themeScene?.({ scene: th.scene, renderer: th.renderer });   // OLYMPUS theme: fog + clear colour follow it
    S.three = THREE; S.camera = cam; S.dir = new Director(cam, { reduced });
    S.stage = th;
    S.project = (a) => {
      const v = th.pos(a.t, a.price).project(cam);
      if (v.z > 1 || v.z < -1) return null;
      return { x: ((v.x + 1) / 2) * S.w, y: ((1 - v.y) / 2) * S.h };
    };
    document.body.dataset.gl = 'webgl';
  } catch (e) {
    const { FlatStage } = await import('./flat.js');
    S.stage = new FlatStage(canvas);
    S.project = (a) => S.stage.project(a);
    document.body.dataset.gl = 'flat';
  }
  resize();
}

function measureBand() {
  // the free band of the screen: below the top bar, above the dock (the captions and the controls)
  const head = document.querySelector('.top'), dock = document.getElementById('dock');
  const top = head.getBoundingClientRect().bottom + 2;
  const dockTop = dock.getBoundingClientRect().top;
  const bottom = dockTop - 8;
  const band = { top, bottom: Math.max(top + 80, bottom) };
  const moved = !S.band || Math.abs(S.band.top - band.top) > 1 || Math.abs(S.band.bottom - band.bottom) > 1;
  if (moved) {                                // the film layers (depth of field, letterbox) and the sheets follow the band
    const r = document.documentElement.style;
    r.setProperty('--band-top', Math.round(band.top) + 'px');
    r.setProperty('--band-bot', Math.round(band.bottom) + 'px');
    r.setProperty('--dock-h', Math.round(S.h - dockTop) + 'px');
  }
  S.band = band;
  if (S.stage) S.stage.band = band;
  S.fill = Math.max(0.3, Math.min(1, (band.bottom - band.top) / S.h));
  return moved;
}

function lens() {
  if (!S.camera) return;
  S.camera.aspect = S.w / S.h;
  // centre the shot on the free band: shift the lens so the look-at point lands in its middle
  const shift = S.h / 2 - (S.band.top + S.band.bottom) / 2;
  S.camera.setViewOffset(S.w, S.h, 0, shift, S.w, S.h);
  S.camera.updateProjectionMatrix();
}

function resize() {
  S.w = window.innerWidth; S.h = window.innerHeight;
  measureBand();
  if (S.stage) S.stage.resize(S.w, S.h);
  lens();
}

// ---------------------------------------------------------------- playback
function setPlaying(on) {
  S.playing = !!on && !!S.tr;
  if (S.playing && S.T >= S.tr.tEnd) restart();
  transport.setPlaying(S.playing, S.ended);
  document.body.dataset.playing = String(S.playing);
}

function setSpeed(x) {
  S.speed = x;
  transport.setSpeed(x);
}

function seek(T) {
  if (!S.tr) return;
  S.T = Math.max(S.tr.tStart, Math.min(S.tr.tEnd, T));
  S.ended = S.T >= S.tr.tEnd;
  showStats(S.ended);
  cc.sync(S.T, false);
  callouts.clear();
  transport.setPlaying(S.playing, S.ended);
  onstage.set(S.tr, S.T, 0, true);
}

function restart() {
  if (!S.tr) return;
  S.ended = false;
  seek(S.tr.tStart);
  if (S.dir) S.dir.reset();
  setPlaying(true);
}

function openReel(id, play) {
  const tr = S.trades.find((t) => t.id === id) || S.trades[0];
  if (S.hl && S.hl.ids[S.hl.i] !== tr.id) S.hl = null;         // a reel picked by hand ends the highlights
  if (!tr) return;
  S.tr = tr;
  S.T = tr.tStart;
  S.ended = false;
  S.crossed = [];
  showStats(false);
  S.stage.load(tr);
  if (S.dir) S.dir.reset();
  cc.load(tr);
  callouts.clear();
  transport.load(tr);
  fillStats($('#stats'), tr);
  onstage.set(tr, S.T, 0, true);
  reels.mark(tr.id);
  strip.mark(tr.id);
  $('#title').textContent = `${tr.bot === 'ATLAS' ? 'ATLAS · ' + tr.strat : 'LIT'} · ${tr.side}`;
  $('#sub').textContent = `${dayLabel(tr.day)} · ${hhmm(tr.entry.t, tr.off)} ET`;
  const src = $('#srcBadge');
  src.textContent = ({ backtest: 'REPLAY', pc: 'PC BARS' })[tr.src] || tr.src.toUpperCase();
  src.dataset.src = tr.src;
  src.hidden = S.demo;
  document.body.dataset.outcome = '';
  document.body.dataset.reel = tr.id;
  const want = '#reel=' + encodeURIComponent(tr.id);
  if (location.hash !== want && !S.demo) history.replaceState(null, '', want);
  cc.sync(S.T, false);
  setPlaying(!!play);
  if (play) titleCard(tr);
  hlBadge();
}

// ---------------------------------------------------------------- highlights: the five best trades by $, back to back
function startHighlights() { startQueue('best'); }

/** back to back: 'best' = the five best trades by $ (Highlights), 'worst' = the five worst, 'all' = every reel the library shows now */
function startQueue(kind) {
  const ids = (kind === 'all' ? sortReels(reels.current(), reels.sort) : queueOf(S.trades, kind)).map((t) => t.id);
  if (!ids.length) { reels.say(kind === 'worst' ? 'No losing trade to show.' : 'No reel to play.'); return; }
  reels.say('');
  S.hl = { ids, i: 0, at: null, kind };
  showReels(false);
  openReel(ids[0], true);
}

function setCompareMode(on) {
  reels.setCompare(on);
  $('#cmpBtn').setAttribute('aria-pressed', String(!!on));
  $('#cmpHint').hidden = !on;
}

function nextHighlight() {
  if (!S.hl) return;
  if (S.hl.i + 1 >= S.hl.ids.length) { S.hl = null; hlBadge(); showReels(true); return; }
  S.hl.i++;
  S.hl.at = null;
  openReel(S.hl.ids[S.hl.i], true);
}

function hlBadge() {
  const b = $('#hlBadge');
  b.hidden = !S.hl;
  if (S.hl) b.textContent = `${({ best: 'HIGHLIGHT', worst: 'WORST', all: 'REEL' })[S.hl.kind] || 'REEL'} ${S.hl.i + 1}/${S.hl.ids.length}`;
  $('#stNext').textContent = S.hl ? (S.hl.i + 1 < S.hl.ids.length ? (S.hl.kind === 'best' ? 'Next highlight' : 'Next in the queue') : 'All reels') : 'Next reel';
}

/** Oracle's link (#trade=<day>_<HHMM>_<side>): the reel of that trade from any source, else the closest one that day. */
function findTrade(key) {
  const exact = S.trades.find((t) => t.id.split('.').slice(1).join('.') === key);
  if (exact) return exact;
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_(long|short)$/.exec(key);
  if (!m) return null;
  const want = (+m[2]) * 60 + (+m[3]);
  const near = S.trades.filter((t) => t.day === m[1] && t.side === m[4].toUpperCase())
    .map((t) => { const [h, mi] = hhmm(t.entry.t, t.off).split(':').map(Number); return [Math.abs(h * 60 + mi - want), t]; })
    .filter(([d]) => d <= 30).sort((a, b) => a[0] - b[0]);
  return near.length ? near[0][1] : null;
}

function openTrade(key) {
  const t = findTrade(key);
  if (t) { showReels(false); reels.say(''); openReel(t.id, true); return true; }
  reels.say(`No film of the ${key.replace(/_/g, ' ')} trade yet: the reels are the replays and the published trades.`);
  showReels(true);
  return false;
}

// ---------------------------------------------------------------- the lens flare on the entry (DOM ghosts, no draw call)
const FLARE = [0, 0, 1, 0.55, 0.2, -0.25, -0.6, -1.05];   // core, streak, ring at the light; the ghosts along the axis
function flare(p) {
  if (!p || reduced) return;
  const f = $('#flare'), cx = S.w / 2, cy = (S.band.top + S.band.bottom) / 2;
  [...f.children].forEach((g, i) => {
    const k = i < 3 ? 1 : FLARE[i];
    g.style.transform = `translate3d(${(cx + (p.x - cx) * k).toFixed(1)}px, ${(cy + (p.y - cy) * k).toFixed(1)}px, 0)`;
  });
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  clearTimeout(flare.t);
  flare.t = setTimeout(() => f.classList.remove('go'), 1800);      // off the compositor once it has faded
}

// the opening title of a reel (never the result: that is the film's ending)
function titleCard(tr) {
  $('#tcMain').textContent = `${tr.bot === 'ATLAS' ? 'ATLAS · ' + tr.strat : 'LIT'} · ${tr.side}`;
  $('#tcSub').textContent = `${dayLabel(tr.day)} · ${hhmm(tr.entry.t, tr.off)} ET · ${tr.qty} micro${tr.qty === 1 ? '' : 's'}`;
  const c = $('#titleCard');
  c.classList.remove('go');
  void c.offsetWidth;
  c.classList.add('go');
}

function showStats(on) {
  S.statsShown = !!on;
  const card = $('#stats');
  card.hidden = !on;
  card.classList.toggle('in', !!on);
  document.body.dataset.ended = String(!!on);
  if (on) document.body.dataset.outcome = card.dataset.outcome || '';
}

function showReels(on) {
  $('#reels').hidden = !on;
  $('#reelsBtn').setAttribute('aria-expanded', String(!!on));
  if (on) $('#reels').scrollTop = 0;                 // the gallery opens on its best posters
}

// ---------------------------------------------------------------- the frame loop
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (O ? O.hidden() : document.hidden) { last = now; return; }     // hidden / covered tab: no frame (the battery)
  const gap = O && O.frameGap ? O.frameGap() : 0;                    // idle 30 / 15 fps, battery saver, 3D Off 2 fps (docs/OLYMPUS_PERF.md)
  if (gap && last && now - last < gap - 3) return;
  const rawDt = last ? (now - last) / 1000 : 1 / 60;
  const dt = Math.min(0.1, rawDt);
  last = now;
  S.wall += dt;
  if (!S.tr || !S.stage) return;
  const wall = S.wall;
  if (S.playing) {
    const slow = S.dir ? S.dir.slowmo(wall) : 1;
    if ((slow < 0.6) !== (S.slow < 0.6)) document.body.dataset.slowmo = String(slow < 0.6);   // the letterbox, on change only
    S.slow = slow;
    S.T = Math.min(S.tr.tEnd, S.T + dt * S.speed * 60 * slow);
    const fresh = cc.sync(S.T, true);
    for (const e of fresh) cue(e, wall);
    if (S.T >= S.tr.tEnd) {
      S.playing = false;
      S.ended = true;
      S.statsAt = wall + (reduced ? 0.4 : 1.4);
      transport.setPlaying(false, true);
      document.body.dataset.playing = 'false';
    }
  }
  if (S.ended && !S.statsShown && wall >= S.statsAt) showStats(true);
  if (S.hl && S.statsShown && !reduced) {                       // highlights: the next one after a look at the card
    if (S.hl.at == null) S.hl.at = wall;
    else if (wall - S.hl.at > HL_GAP) nextHighlight();
  }
  if (!S.playing && S.slow < 1) { S.slow = 1; document.body.dataset.slowmo = 'false'; }
  if ((S.frameN = (S.frameN || 0) + 1) % 20 === 0 && measureBand()) lens();  // the HUD / captions changed height
  S.stage.update(S.T, dt, wall);
  $('#cc').classList.toggle('rest', wall - (S.ccAt || 0) > 7);
  if (S.dir) {
    S.dir.update(dt, wall, { b: S.stage.bounds(S.T), head: S.stage.head, phase: phase(S.tr, S.T), aspect: S.w / S.h, dx: S.stage.dx, fill: S.fill });
    // depth of field, faked: the fog thickens with the shot's distance so the far tape melts into the dark
    if (S.dir.s) { S.stage.scene.fog.density = 0.55 / Math.max(8, S.dir.s.d + 4); S.stage.setFocus(S.dir.s.d); }
  }
  S.stage.render(S.camera);
  callouts.update(wall, S.project, S.w, S.h, S.band.top, S.band.bottom);
  transport.sync(S.T, openPnl(S.tr, S.T));
  onstage.set(S.tr, S.T, wall);
  edgeMarks();
  watchFps(rawDt);
}

function cue(e, wall) {
  S.crossed.push(e.k);
  S.ccAt = wall;
  S.stage.fire(e);
  if (S.dir) S.dir.beat(e.k, wall);
  const tr = S.tr;
  let at = { t: e.t - tr.B.s, price: e.price != null ? e.price : S.stage.head ? S.stage.head.price : tr.entry.px };
  if (e.k === 'entry') { at = { t: tr.entry.t, price: tr.entry.px }; flare(S.project(at)); }
  if (e.k === 'exit') at = { t: tr.exit.t, price: tr.exit.px };
  const extra = e.k === 'exit' ? `${fmtUsd(tr.usd)} · ${fmtR(tr.r)}` : null;
  callouts.add(e, at, wall, tr.off, extra);
  if (e.k === 'exit') document.body.dataset.outcome = e.outcome || '';
  if ((e.k === 'sweep' || e.k === 'exit') && !reduced) {
    const f = $('#flash');
    f.dataset.k = e.k === 'exit' ? e.outcome : 'sweep';
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
}

// auto LITE: the frame rate over the first seconds of play (and any long slump later) picks the light mode
function watchFps(dt) {
  if (!S.autoLite || S.lite || !S.playing || document.hidden || dt > 1) return;
  const F = S.fps;
  F.n++;
  F.sum += dt;
  if (F.sum < 0.5) { F.n = 0; F.t = 0; return; }       // skip the first half second (shaders compiling)
  F.t = (F.t || 0) + dt;
  if (!F.decided && F.t >= 2) {                          // the first 2 s of play: under 48 fps -> LITE
    F.decided = true;
    if (F.n / F.t < 48) setLite(true, 'auto');
  }
  if (F.decided) {                                       // later: a slump of 3 s under 38 fps -> LITE
    F.slow = dt > 1 / 38 ? (F.slow || 0) + dt : Math.max(0, (F.slow || 0) - dt * 0.5);
    if (F.slow > 3) setLite(true, 'auto');
  }
}

// the stop and the target when they are off screen: a pill at the edge of the shot (price, distance in R)
function edgeMarks() {
  const tr = S.tr, mk = [['#mkTarget', tr.target, 'TARGET'], ['#mkStop', stopAt(tr, S.T), 'STOP']];
  const live = S.T >= tr.entry.t && S.T < tr.exit.t_end;
  for (const [id, px, name] of mk) {
    const el = $(id);
    const p = live ? S.project({ t: S.T, price: px }) : null;
    const off = p && (p.y < S.band.top || p.y > S.band.bottom);
    el.hidden = !off;
    if (!off) continue;
    const up = p.y < S.band.top;
    const dist = Math.abs(px - S.stage.head.price) / Math.max(1e-6, tr.risk_pts);
    el.textContent = `${up ? '\u2191' : '\u2193'} ${name} ${fmtPx(px)} · ${dist.toFixed(1)}R away`;
    el.style.top = (up ? S.band.top + 4 : S.band.bottom - 34) + 'px';
  }
}

function setLite(on, why) {
  S.lite = !!on;
  if (S.stage) S.stage.setLite(S.lite);
  document.body.dataset.lite = S.lite ? why || 'on' : '';
  O?.mode(S.lite);
  $('#liteBadge').hidden = !S.lite;
}

// ---------------------------------------------------------------- touch: orbit / zoom the camera (director takes it back)
function bindCamera() {
  const pts = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p || !S.dir) return;
    if (pts.size === 1) {
      S.dir.orbit(-(e.clientX - p.x) * 0.006, (e.clientY - p.y) * 0.004, S.wall);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const [c, d] = [...pts.values()];
      const d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (pinch && d0 > 0) S.dir.zoom(d0 / d1, S.wall);
      pinch = d1;
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (S.dir) { e.preventDefault(); S.dir.zoom(Math.exp(e.deltaY * 0.001), S.wall); } }, { passive: false });
  canvas.addEventListener('dblclick', () => S.dir && S.dir.reset());
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|BUTTON/.test(e.target.tagName) && e.key === ' ') return;
    if (!S.tr) return;
    if (e.key === ' ') { e.preventDefault(); S.ended ? restart() : setPlaying(!S.playing); }
    if (e.key === 'ArrowRight') seek(S.T + 5 * S.tr.B.s);
    if (e.key === 'ArrowLeft') seek(S.T - 5 * S.tr.B.s);
    if (e.key === 'Escape') showReels(false);
  });
}

// ---------------------------------------------------------------- Jarvis: the live card while ODEON is open
function postCard() {
  if (window.parent === window || !S.trades.length) return;
  const t = S.trades[0];
  const card = { v: 1, name: 'ODEON', status: { level: S.demo ? 'warn' : 'ok', label: S.demo ? 'Demo reel only' : `${S.trades.length} reels ready` },
    kpis: [{ label: 'Reels', value: String(S.trades.length) }, { label: 'Latest', value: dayLabel(t.day) }, { label: 'Last reel', value: fmtR(t.r), delta: fmtUsd(t.usd) }],
    lines: [`${t.bot} ${t.side.toLowerCase()} ${dayLabel(t.day)}: ${fmtUsd(t.usd)}`], t: Math.floor(Date.now() / 1000), open: '#reels', theme: '#14110e' };
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card }, (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io')); } catch (e) { /* not in Jarvis */ }
}

// ---------------------------------------------------------------- themes (OLYMPUS)
const OWN_ACCENT = '#c8a24a';
const hexOk = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
/** '#rrggbb' a blended toward b by t (0 = a untouched): the kit's own mix when it is there. */
function blend(a, b, t) {
  const TH = window.OLYMPUS_THEMES;
  if (TH && typeof TH.mix === 'function') return TH.mix(a, b, t);
  const n = (h, i) => parseInt(h.substr(i, 2), 16);
  return '#' + [1, 3, 5].map((i) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t).toString(16).padStart(2, '0')).join('');
}
/** An OLYMPUS theme's tokens onto the film's accent (the liquidity planes, the scrubber, the captions' edge). The kit's
    themes (they carry harmony / mix) lean the app's own blue toward the theme accent by `harmony` (the default theme
    changes nothing); the kit itself repaints --bg / --panel and the fog. Plain tokens ({accent, bg}) apply as they are. */
function applyTheme(tokens) {
  const t = tokens || {}, r = document.documentElement.style, kit = t.harmony != null || t.mix != null;
  let accent = t.accent || t['--oly-accent'] || t['--accent'];
  const bg = kit ? null : (t.bg || t.background || t['--bg']);
  if (kit) accent = hexOk(accent) ? blend(OWN_ACCENT, accent, +t.harmony || 0) : OWN_ACCENT;
  if (hexOk(accent)) r.setProperty('--blue', accent);
  if (hexOk(bg)) r.setProperty('--bg', bg);
  if (S.stage && S.stage.applyTheme) S.stage.applyTheme(hexOk(accent) ? accent : null, hexOk(bg) ? bg : null);
  return { accent: hexOk(accent) ? accent : null, bg: hexOk(bg) ? bg : null };
}
function hookTheme() {
  const K = O || window.Olympus || null;
  if (K && typeof K.onTheme === 'function') K.onTheme((tk) => applyTheme(tk));
  if (K && typeof K.theme === 'function') { try { const tk = K.theme(); if (tk && typeof tk === 'object') applyTheme(tk); } catch (e) { /* no theme */ } }
}

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'reels') { showReels(true); return; }
  if (h === 'highlights') { if (!S.hl) startHighlights(); return; }
  const k = /^trade=(.+)$/.exec(h);
  if (k) { openTrade(k[1]); return; }
  const m = /^reel=(.+)$/.exec(h);
  if (m && S.trades.some((t) => t.id === m[1]) && (!S.tr || S.tr.id !== m[1])) openReel(m[1], true);
}

// ---------------------------------------------------------------- start
async function start() {
  await makeStage();
  window.addEventListener('resize', resize);
  bindCamera();
  bindKeys();
  $('#reelsBtn').addEventListener('click', () => showReels($('#reels').hidden));
  $('#reelsClose').addEventListener('click', () => showReels(false));
  $('#scriptBtn').addEventListener('click', () => {
    const on = $('#script').hidden;
    $('#script').hidden = !on;
    $('#scriptBtn').setAttribute('aria-pressed', String(on));
  });
  $('#narrate').addEventListener('click', () => {
    const on = cc.setNarrate(!cc.narrate);
    $('#narrate').setAttribute('aria-pressed', String(on));
  });
  $('#stReplay').addEventListener('click', () => restart());
  $('#stNext').addEventListener('click', () => {
    if (S.hl) { nextHighlight(); return; }
    const i = S.trades.indexOf(S.tr);
    openReel((S.trades[(i + 1) % S.trades.length] || S.tr).id, true);
  });
  $('#hlBtn').addEventListener('click', () => startHighlights());
  $('#worstBtn').addEventListener('click', () => startQueue('worst'));
  $('#allBtn').addEventListener('click', () => startQueue('all'));
  $('#cmpBtn').addEventListener('click', () => setCompareMode(!reels.compare));
  $('#stShare').addEventListener('click', async () => {
    const b = $('#stShare'), r = await shareTrade(S.tr);
    b.textContent = r === 'failed' ? 'Could not share' : r === 'saved' ? 'Saved' : 'Shared';
    setTimeout(() => { b.textContent = 'Share'; }, 2200);
  });
  $('#stReels').addEventListener('click', () => { showStats(false); showReels(true); });
  setSpeed(S.speed);
  if (reduced) document.body.dataset.reduced = 'true';
  if (S.lite) setLite(true, liteParam === '1' ? 'param' : 'olympus');
  else O?.mode(false);
  const bundle = await loadReels('trades.json', { forceDemo: qs.get('demo') === '1' });
  const b = bundle.trades.length ? bundle : demoBundle();
  S.trades = b.trades;
  S.demo = b.demo;
  $('#demoBadge').hidden = !S.demo;
  reels.set(S.trades, S.demo);
  strip.set(S.trades);
  const h = decodeURIComponent(location.hash.slice(1));
  const m = /^reel=(.+)$/.exec(h);
  const first = m && S.trades.some((t) => t.id === m[1]) ? m[1] : S.trades[0].id;
  const tk = /^trade=(.+)$/.exec(h);
  if (h === 'highlights') startHighlights();
  else if (!(tk && openTrade(tk[1]))) openReel(first, qs.get('autoplay') !== '0' && !tk);
  if (h === 'reels') showReels(true);
  hookTheme();
  window.addEventListener('hashchange', route);
  postCard();
  document.body.dataset.ready = 'true';
  requestAnimationFrame(frame);
  if (document.body.dataset.gl === 'flat') O?.ready();             // the 2D stage: no three.js renderer to watch
}

// test and debug handle (read-only views + the same controls the buttons use)
window.__odeon = {
  state: () => ({ T: S.T, playing: S.playing, ended: S.ended, speed: S.speed, id: S.tr && S.tr.id, demo: S.demo, lite: S.lite,
    stats: S.statsShown, captions: cc.texts(), crossed: S.crossed.slice(), tStart: S.tr && S.tr.tStart, tEnd: S.tr && S.tr.tEnd,
    gl: document.body.dataset.gl, n: S.trades.length, slow: S.slow, hl: S.hl && { i: S.hl.i, ids: S.hl.ids.slice(), kind: S.hl.kind } }),
  trade: () => S.tr,
  debug: () => {
    const b = S.stage && S.stage.bounds ? S.stage.bounds(S.T) : {};
    const L = b.local ? b.local(34) : null;
    return { shot: S.dir && S.dir.s, head: S.stage && S.stage.head, floorY: S.stage && S.stage.floorY, band: S.band, fill: S.fill,
      yStop: b.yStop, yEntry: b.yEntry, yTarget: b.yTarget, local: L, cam: S.camera && S.camera.position.toArray() };
  },
  /** the 2026-11-03 look pass, for the tests: the render core's passes, the arena, the R ruler and the live P&L tag */
  look: () => {
    const th = S.stage;
    if (!th || !th.rc) return null;
    const kinds = [];
    th.scene.traverse((o) => { if (o.isLight) kinds.push('light'); if (o.isInstancedMesh) kinds.push('instanced'); if (o.material && o.material.isMeshPhysicalMaterial) kinds.push('physical'); });
    return { passes: th.rc.passes(), quality: th.rc.quality(), stats: th.rc.stats(), arena: !!th.arena, kinds,
      rungs: (th.rungs || []).map((r) => ({ n: r.n, on: r.s.visible })), tag: th.pnlTag ? { on: th.pnlTag.visible, text: th.pnlTag.userData.text || '' } : null };
  },
  seek, play: () => setPlaying(true), pause: () => setPlaying(false), speed: setSpeed, open: (id, play) => openReel(id, play !== false),
  highlights: () => startHighlights(), queue: startQueue, applyTheme,
  /** the 2026-11-04 library, for the tests: what is shown, the filters, the histogram, the stage numbers, the share card, compare */
  library: () => ({ shown: reels.current().map((t) => t.id), more: reels.more, filter: reels.filter, stats: statsOf(reels.current()),
    hist: histogram(applyFilters(S.trades, { f: reels.filter, setup: reels.more.setup, hour: reels.more.hour, month: reels.more.month })).map((b) => b.n),
    onstage: S.tr ? runStats(S.tr, S.T) : null, compare: !$('#compare').hidden }),
  card: () => { const c = document.createElement('canvas'); drawCard(c, S.tr); return { w: c.width, h: c.height, bytes: c.toDataURL('image/png').length }; },
  compare: (a, b) => { const x = S.trades.find((t) => t.id === a), y = S.trades.find((t) => t.id === b); if (x && y) compare.show(x, y); }, find: (key) => { const t = findTrade(key); return t ? t.id : null; },
};

start().catch((e) => {
  document.body.dataset.ready = 'error';
  const n = $('#fatal');
  if (O) O.fail(e && e.message ? e.message : String(e));
  else if (n) { n.hidden = false; n.textContent = 'ODEON could not start: ' + (e && e.message ? e.message : e); }
  throw e;
});
