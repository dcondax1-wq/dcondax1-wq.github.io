// PEOPLE OF OLYMPUS v3: the studio. One small offscreen WebGL renderer that photographs a person's rigged 3D character (people-rig.js, the KayKit cast)
// for the 2D places: the round portraits (head and shoulders, any face and mouth) and the crowd's impostor sprites (a whole person, standing or seated,
// at rest and talking). Every photo is cached in memory, the portraits also in IndexedDB (try/catch: private mode just skips it). The SVG portrait of
// people-core.js is always drawn first and stays when there is no WebGL, no cast, LITE, or anything fails: the photo is laid over it when ready.
//   import * as ST from './people-studio.js';
//   ST.ready() -> Promise<bool>;  ST.bust(spec, { px, expr, mouth, blink }) -> dataURL | null (sync, cache);  ST.bustAsync(spec, opts) -> Promise<dataURL | null>
//   ST.decorate(svgEl, spec, opts)   lays the photo over a people-core portrait SVG (same circle, under its status ring)
//   ST.atlas(specs, { seated, cell: [w, h], lite }) -> Promise<{ texture canvas, cols, cellW, cellH, frames: 2, frame: [w, h] in figure units, foot }>
import * as THREE from '../jarvis/three.module.min.js';
import * as R from './people-rig.js';

export const STUDIO_VERSION = 'st3';
const CAST_URL = (() => { try { return new URL('../assets/people/cast.glb?v=3', import.meta.url).href; } catch (_) { return '../assets/people/cast.glb?v=3'; } })();
const S = { p: null, cast: null, r: null, scene: null, cam: null, ok: false, mem: new Map(), queue: [], busy: false, db: null };

function off() { try { return window.OLYMPUS_RIG === false || /[?&]rig=0\b/.test(location.search) || document.documentElement.getAttribute('data-oly-lite') === '1'; } catch (_) { return true; } }
/** the cast and a renderer: true when photos can be taken */
export function ready() {
  if (S.p) return S.p;
  S.p = (async () => {
    if (off() || typeof document === 'undefined') return false;
    const [G, M] = await Promise.all([import('./three-addons/GLTFLoader.js'), import('./three-addons/meshopt_decoder.module.js')]);
    S.cast = await R.loadCast({ THREE, GLTFLoader: G.GLTFLoader, MeshoptDecoder: M.MeshoptDecoder }, CAST_URL, CAST_URL);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.02; r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    // a soft three-point light: neutral key (no orange cast), a cool fill, an ivory rim from behind
    scene.add(new THREE.HemisphereLight('#fff7ec', '#6d5f52', 1.25));
    const key = new THREE.DirectionalLight('#fff3e2', 2.1); key.position.set(1.6, 2.4, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight('#dfe7f5', 0.7); fill.position.set(-2.5, 1.2, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight('#fff1dc', 1.3); rim.position.set(-1.0, 2.0, -2.6); scene.add(rim);
    S.r = r; S.scene = scene; S.cam = new THREE.PerspectiveCamera(22, 1, 0.05, 60); S.ok = true;
    return true;
  })().catch(() => { S.ok = false; return false; });
  return S.p;
}
export function status() { return S.ok ? 'ready' : S.p ? 'loading' : 'off'; }

// ------------------------------------------------------------------------------------------------ taking a photo
function person(sp, o) {
  const ch = R.character(THREE, S.cast, sp, { seated: !!o.seated, work: false, pose: o.pose || 'idle', idle: 'Unarmed_Idle' });
  S.scene.add(ch.object);
  if (o.pose && o.pose !== 'idle') ch.play(o.pose, { loop: true });
  if (o.expr) ch.setExpression(o.expr, 1);
  ch.lookAt(o.look || null);
  for (let i = 0; i < (o.frames || 10); i++) { if (o.mouth && o.mouth !== 'rest') ch.setMouth(o.mouth, 1); ch.tick(0.03); }
  if (o.blink) { const f = ch.face(); const i = R.MORPHS.indexOf('blink'); if (f && f.morphTargetInfluences) f.morphTargetInfluences[i] = 1; }
  return ch;
}
function shoot(w, h) { S.r.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); S.r.render(S.scene, S.cam); return S.r.domElement; }
const key = (sp, o) => [STUDIO_VERSION, sp.seed >>> 0, sp.skin, sp.hair, sp.outfit, sp.accent, sp.accessory, sp.hairStyle, sp.build, sp.face && sp.face.beard, o.expr || sp.mood || '', o.mouth || '', o.blink ? 1 : 0, o.px].join('|');

/** head and shoulders, looking at you, as a PNG data URL (px square). Sync: the cached photo or null. */
export function bust(sp, o) { const k = key(sp, { px: 128, ...(o || {}) }); return S.mem.get(k) || null; }
export function bustAsync(sp, opts) {
  const o = { px: 128, ...(opts || {}) }, k = key(sp, o);
  if (S.mem.has(k)) return Promise.resolve(S.mem.get(k));
  return new Promise((ok) => { S.queue.push({ k, sp, o, ok }); pump(); });
}
async function pump() {
  if (S.busy) return; S.busy = true;
  try {
    if (!(await ready())) { for (const j of S.queue.splice(0)) j.ok(null); return; }
    while (S.queue.length) {
      const j = S.queue.shift();
      if (S.mem.has(j.k)) { j.ok(S.mem.get(j.k)); continue; }
      const cached = await idbGet(j.k);
      if (cached) { S.mem.set(j.k, cached); j.ok(cached); continue; }
      let url = null;
      try {
        const sp = j.sp, o = j.o, h = sp.height || 1;
        const ch = person(sp, { expr: o.expr, mouth: o.mouth, blink: o.blink, look: new THREE.Vector3(0.25, 0.75 * h, 3) });
        const hy = 0.735 * h;
        S.cam.position.set(0.18, hy + 0.05, 1.72 * Math.max(0.9, h)); S.cam.lookAt(0, hy - 0.075 * h, 0); S.cam.fov = 21;
        shoot(o.px, o.px); url = S.r.domElement.toDataURL('image/png');
        ch.dispose();
      } catch (e) { url = null; }
      if (url) { S.mem.set(j.k, url); idbPut(j.k, url); }
      j.ok(url);
      await new Promise((r) => setTimeout(r, 0));      // one photo per task: the page stays responsive
    }
  } finally { S.busy = false; }
}

/** lay the photo over a people-core portrait SVG (inside its circle, under its status ring). opts as bust(); the SVG stays if anything fails. */
export function decorate(svg, sp, opts) {
  try {
    if (!svg || off()) return;
    const o = opts || {}, px = Math.min(256, Math.max(64, Math.round((o.size || 44) * Math.min(2, window.devicePixelRatio || 1) / 32) * 32));
    const put = (url) => {
      if (!url || svg.__ph === url) return;
      const g = svg.querySelector('g[clip-path]'); if (!g) return;
      const NS = 'http://www.w3.org/2000/svg', old = g.querySelector('.pp-photo'); if (old) old.remove();
      const ph = document.createElementNS(NS, 'g'); ph.setAttribute('class', 'pp-photo');
      const bg = g.firstElementChild && g.firstElementChild.getAttribute('fill');
      const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '50'); c.setAttribute('fill', bg || '#3a2e22'); ph.appendChild(c);
      const im = document.createElementNS(NS, 'image'); im.setAttribute('href', url); im.setAttribute('x', '0'); im.setAttribute('y', '0'); im.setAttribute('width', '100'); im.setAttribute('height', '100'); im.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      ph.appendChild(im); g.appendChild(ph); svg.__ph = url; svg.setAttribute('data-photo', '3d');
    };
    const req = { px, expr: o.expr, mouth: o.mouth, blink: o.blink };
    const now = bust(sp, req); if (now) { put(now); return; }
    bustAsync(sp, req).then(put, () => {});
  } catch (_) { /* the SVG stays */ }
}

// ------------------------------------------------------------------------------------------------ the crowd's impostors
/** every person photographed whole (front, 3/4 turned towards the middle), at rest (frame 0) and talking (frame 1), in one canvas atlas.
 *  opts.views (2026-11-11, the towns): 5 frames a person instead of 2: + 2 from behind, 3 and 4 walking seen from the side (facing screen right, two strides),
 *  so a town crowd of sprites can show a back or a walking profile (layout: ['rest', 'talk', 'back', 'sideA', 'sideB']). */
export async function atlas(specs, opts) {
  const o = opts || {};
  if (!(await ready())) return null;
  const n = specs.length, cw = (o.cell && o.cell[0]) || 128, chh = (o.cell && o.cell[1]) || 160, frames = o.views ? 5 : 2, cols = Math.max(1, Math.min(16, Math.floor(2048 / cw))), rows = Math.ceil((n * frames) / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * chh; const g2 = cv.getContext('2d');
  const FW = 1.0, FH = 1.25, foot = -0.04;      // the frame in figure units (height 1): x -0.5..0.5, y foot..foot + FH
  for (let i = 0; i < n; i++) {
    const sp = specs[i];
    let ch = null;
    try {
      // one character, two photos: at rest, then talking (the talk gestures and an open mouth). An orthographic-ish photo: a long lens far away.
      ch = person(sp, { seated: !!o.seated, pose: 'idle', frames: 8, look: new THREE.Vector3(0, 0.7, 4) });
      const d = 24; S.cam.fov = 2 * Math.atan((FH / 2) / d) * 180 / Math.PI; S.cam.position.set(0, foot + FH / 2, d); S.cam.lookAt(0, foot + FH / 2, 0);
      for (let f = 0; f < frames; f++) {
        if (f === 1) { ch.play('talk'); for (let t = 0; t < 14; t++) { ch.setMouth('A', 1); ch.tick(0.03); } }
        if (f === 2) { ch.setTalking(false); ch.play('idle'); ch.lookAt(null); for (let t = 0; t < 12; t++) { ch.setMouth('rest', 0); ch.tick(0.03); } ch.object.rotation.y = Math.PI; }
        if (f === 3) { ch.object.rotation.y = Math.PI / 2; ch.play('walk'); for (let t = 0; t < 12; t++) ch.tick(0.03); }
        if (f === 4) { const b = S.cast.clips[ch.state().base], half = b ? b.duration / 2 : 0.5; for (let t = 0; t < 10; t++) ch.tick(half / 10); }
        const c = shoot(cw, chh), k = i * frames + f; g2.drawImage(c, (k % cols) * cw, Math.floor(k / cols) * chh, cw, chh);
      }
    } catch (e) { /* those cells stay empty */ }
    if (ch) ch.dispose();
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  return { canvas: cv, cols, rows, cellW: cw, cellH: chh, frames, frame: [FW, FH], foot, n, layout: o.views ? ['rest', 'talk', 'back', 'sideA', 'sideB'] : ['rest', 'talk'] };
}

// ------------------------------------------------------------------------------------------------ IndexedDB (best effort)
function db() {
  if (S.db) return S.db;
  S.db = new Promise((ok) => {
    try {
      const rq = indexedDB.open('olympus-people', 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore('photos'); } catch (_) { /* exists */ } };
      rq.onsuccess = () => ok(rq.result); rq.onerror = () => ok(null); rq.onblocked = () => ok(null);
    } catch (_) { ok(null); }
  });
  return S.db;
}
async function idbGet(k) { try { const d = await db(); if (!d) return null; return await new Promise((ok) => { try { const rq = d.transaction('photos', 'readonly').objectStore('photos').get(k); rq.onsuccess = () => ok(rq.result || null); rq.onerror = () => ok(null); } catch (_) { ok(null); } }); } catch (_) { return null; } }
async function idbPut(k, v) { try { const d = await db(); if (!d) return; d.transaction('photos', 'readwrite').objectStore('photos').put(v, k); } catch (_) { /* private mode */ } }
