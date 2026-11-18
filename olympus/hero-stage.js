// OLYMPUS hero stage (tools/web_public/olympus/hero-stage.js, 2026-11-11, QA Round 6 bug 8: the crude hero scenes).
// ES module on three r160 (../jarvis/three.module.min.js) + the environment kit (./env-kit.js: CC0 PBR scans, HDRI light, the builder).
// One shared stage for the small 3D hero of every app, so each scene only builds its own subject (the thing that carries the number):
//   - a painted backdrop (a dusk / golden / hall / sea / night sky with a sun glow, distant hills, cypresses and a far temple, a soft
//     vignette) drawn once per size into scene.background: no extra draw;
//   - the light: the env-kit HDRI (image-based light and reflections; LITE: a gradient made in code), a warm key light (soft shadows on HD
//     with a GPU, contact blobs everywhere), a cool rim and a hemisphere fill;
//   - set pieces built with the env-kit builder (merged by material: one draw per material): a round or square marble plinth with steps,
//     a painted Greek-key band, a paved or marble ground that fades into the sky, fluted columns, laurel wreaths, coins, flames;
//   - dust motes drifting in the light (one draw, still under reduced motion), a composed camera that sways a little, a frame counter;
//   - the loop pauses while the tab is hidden or the scene is off screen; reduced motion draws only when something changes.
//
//   const H = createStage(box, { palette: 'dusk', hdri: 'golden', target: [0, 1.5, 0], dist: 9, height: 3, fov: 34 });
//   if (!H) -> no WebGL: the page keeps its 2D picture.
//   H.kit (env-kit), H.B (a builder), H.scene, H.camera, H.renderer, H.lite, H.reduce, H.root (a group for the subject)
//   H.plinth({...}) / H.ground({...}) / H.band({...}) / H.motes({...}) / H.label(text, {...}) ...; H.B.build(H.root)
//   H.start((dt, t) => { ... return movingBool })  H.poke()  H.stats() -> { draws, tris, tier }  H.dispose()
// With an existing OLYMPUS render core (olympus/render.js) the dressing works the same: dress({ rc, scene, camera, tier }) -> the same helpers.
// Perf v2 (2026-11-14, team P2, docs/OLYMPUS_PERF.md): the pixel ratio comes from the page's render-scale governor (./render-scale.js: full device
// ratio up to 3 on Ultra 4K, climbing toward it on Auto while frames keep full rate, stepped down smoothly when they do not); the loop sleeps while
// the scene is off screen, the tab hidden or a sheet covers it (OLYMPUS.hidden()), keeps the kit's idle frame cap (OLYMPUS.frameGap()), and the
// shaders compile in the background before the first frame (compileAsync) instead of holding the page.
import * as THREE from '../jarvis/three.module.min.js';
import { envKit, mat4, latheGeo, boxGeo, ringGeo, discGeo, bandGeo, shaftGeo, measure } from './env-kit.js';
import { mergeGeometries } from './three-addons/BufferGeometryUtils.js';
import { governor, range as rqRange, compileQuietly, parallelCompile } from './render-scale.js';

export const VERSION = 'hero-stage 1 (2026-11-11)';

/** the skies: top of the sky, the band at the horizon, the sun's glow, the far hills, the ground fog, the key light */
export const PALETTES = Object.freeze({
  dusk: { top: '#1c1510', mid: '#5a3a24', horizon: '#d7955a', glow: '#ffd59a', hills: '#4a3424', hills2: '#6e4a30', fog: '#7a5236', key: '#ffd2a0', rim: '#9fb3d8', hemiTop: '#ffe2bc', hemiBot: '#3a2a1c', exposure: 1.0 },
  golden: { top: '#3d4a5e', mid: '#a88466', horizon: '#f1c68e', glow: '#fff0c8', hills: '#7a6450', hills2: '#a08468', fog: '#cfa478', key: '#ffe0b0', rim: '#b8c8e8', hemiTop: '#fff0d8', hemiBot: '#5a4632', exposure: 1.0 },
  hall: { top: '#120d09', mid: '#2e2116', horizon: '#5c4128', glow: '#c99a5a', hills: null, hills2: null, fog: '#2a1e14', key: '#ffd6a6', rim: '#8aa0c8', hemiTop: '#f2dcc0', hemiBot: '#2a1e14', exposure: 1.05 },
  night: { top: '#0b0f1c', mid: '#1c2438', horizon: '#4a4a5c', glow: '#cfd8f0', hills: '#141a26', hills2: '#1e2534', fog: '#1e2434', key: '#c8d4f0', rim: '#e0b070', hemiTop: '#a8b8e0', hemiBot: '#1a1810', exposure: 1.0, stars: true },
  sea: { top: '#2c3a52', mid: '#8c7c78', horizon: '#f0c494', glow: '#fff0cc', hills: '#5a5a62', hills2: null, fog: '#b89878', key: '#ffe2b8', rim: '#a8c0e8', hemiTop: '#f8ecd8', hemiBot: '#3a4a58', exposure: 1.0, sea: '#3e5a6e' },
});

const isLiteTier = (t) => t === 'low' || t === 'off';
const C = (h) => new THREE.Color(h);
/** the OLYMPUS look's tokens on this page (null on the default AGORA: the kit's theme() says so) */
function lookNow() { try { const O = window.OLYMPUS; return O && typeof O.theme === 'function' ? O.theme() : null; } catch (e) { return null; } }
/** a sky leaned toward a look (2026-11-14, team T2): the sky and the far colours toward its sky / fog, the light toward its bloom, the rim toward
 *  its accent, each by the look's 'mix' (0: the palette itself, so the default and a look without a tint change nothing) */
export function lean(pal, t) {
  if (!pal || !t || !(t.mix > 0)) return pal;
  const TH = window.OLYMPUS_THEMES, m = (c, to, k) => (c && to ? (TH && TH.mix ? TH.mix(c, to, k) : '#' + C(c).lerp(C(to), k).getHexString()) : c), k = Math.min(1, t.mix);
  const q = Object.assign({}, pal);
  for (const n of ['top', 'mid']) q[n] = m(q[n], t.sky, k);
  for (const n of ['horizon', 'hills', 'hills2', 'fog', 'hemiBot', 'sea']) q[n] = m(q[n], t.fog, k * 0.85);
  for (const n of ['glow', 'key', 'hemiTop']) q[n] = m(q[n], t.bloom, k * 0.5);
  q.rim = m(q.rim, t.emissive, k * 0.5);
  return q;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
export function prefersReduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
/** the tier the owner chose (OLYMPUS.fx()), forced by ?q=, else high (low under reduced motion is NOT implied here: the scene decides) */
export function tierNow() {
  try { const q = new URLSearchParams(location.search).get('q'); if (['ultra', 'high', 'low', 'off'].indexOf(q) >= 0) return q; } catch (e) { /* none */ }
  try { const O = window.OLYMPUS; if (O && O.fx) return O.fx(); } catch (e) { /* none */ }
  return 'high';
}

// ------------------------------------------------------------------ painters (canvas 2D)
function rng(seed) { let s = (seed >>> 0) || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** the backdrop: sky gradient, a sun glow, two ranges of hills, cypresses and a small far temple on a hill, a vignette */
export function paintSky(g, w, h, pal, o) {
  const P = pal || PALETTES.dusk, opt = o || {}, hz = h * (opt.horizon ?? 0.62), R = rng(opt.seed || 11);
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, P.top); sky.addColorStop(0.55, P.mid); sky.addColorStop(1, P.horizon);
  g.fillStyle = sky; g.fillRect(0, 0, w, hz + 2);
  if (P.stars) { g.fillStyle = 'rgba(240,236,220,0.8)'; for (let i = 0; i < 140; i++) { const x = R() * w, y = R() * hz * 0.8, s = R() < 0.1 ? 1.6 : 0.8; g.globalAlpha = 0.25 + R() * 0.6; g.fillRect(x, y, s, s); } g.globalAlpha = 1; }
  // the sun (or moon) glow
  const sx = w * (opt.sunX ?? 0.66), sy = hz * (opt.sunY ?? 0.78), sr = Math.max(w, h) * 0.55;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
  glow.addColorStop(0, P.glow); glow.addColorStop(0.08, P.glow + 'cc'); glow.addColorStop(0.3, P.glow + '40'); glow.addColorStop(1, P.glow + '00');
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.fillStyle = glow; g.fillRect(0, 0, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (opt.disc !== false) { g.fillStyle = P.glow; g.globalAlpha = 0.85; g.beginPath(); g.arc(sx, sy, Math.max(4, w * 0.028), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  // thin clouds
  g.fillStyle = 'rgba(255,236,210,0.07)';
  for (let i = 0; i < 7; i++) { const cy = hz * (0.25 + R() * 0.5), cx = R() * w; g.beginPath(); g.ellipse(cx, cy, w * (0.12 + R() * 0.2), h * 0.008 + R() * h * 0.01, 0, 0, Math.PI * 2); g.fill(); }
  // the far hills, then the near range with a temple and cypresses
  const ridge = (base, amp, col, seed) => {
    if (!col) return; const r = rng(seed); g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    let y = base; for (let x = 0; x <= w + 8; x += 8) { y += (r() - 0.5) * amp * 0.5; y = clamp(y, base - amp, base + amp * 0.3); g.lineTo(x, y); }
    g.lineTo(w, h); g.closePath(); g.fill(); return r;
  };
  if (P.sea) { g.fillStyle = P.sea; g.fillRect(0, hz - 1, w, h - hz + 1); g.fillStyle = 'rgba(255,230,190,0.18)'; for (let i = 0; i < 40; i++) { const y = hz + (h - hz) * R() * 0.6; g.fillRect(sx - w * 0.15 + R() * w * 0.3, y, 10 + R() * 30, 1.2); } }
  ridge(hz - h * 0.035, h * 0.05, P.hills2, (opt.seed || 11) + 3);
  if (P.hills && opt.temple !== false) {
    // a small temple on the near hill, lit from the side
    const tx = w * (opt.templeX ?? 0.22), ty = hz - h * 0.03, tw = w * 0.11, th = tw * 0.42;
    g.fillStyle = P.hills; g.beginPath(); g.ellipse(tx, ty + h * 0.02, tw * 1.4, h * 0.04, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,226,180,0.55)';
    g.fillRect(tx - tw / 2, ty - th * 0.18, tw, th * 0.12);
    for (let i = 0; i < 6; i++) g.fillRect(tx - tw / 2 + tw * 0.04 + (i * tw * 0.92) / 5 - tw * 0.02, ty - th * 0.06 - th * 0.62, tw * 0.04, th * 0.62);
    g.fillRect(tx - tw * 0.54, ty - th * 0.8, tw * 1.08, th * 0.1);
    g.beginPath(); g.moveTo(tx - tw * 0.56, ty - th * 0.8); g.lineTo(tx, ty - th * 1.12); g.lineTo(tx + tw * 0.56, ty - th * 0.8); g.closePath(); g.fill();
  }
  ridge(hz + h * 0.01, h * 0.03, P.hills, (opt.seed || 11) + 9);
  if (P.hills && opt.cypress !== false) {
    g.fillStyle = 'rgba(20,16,10,0.55)';
    for (let i = 0; i < 9; i++) { const x = R() * w, b = hz + h * 0.012, ch = h * (0.04 + R() * 0.05); g.beginPath(); g.ellipse(x, b - ch / 2, ch * 0.13, ch / 2, 0, 0, Math.PI * 2); g.fill(); }
  }
  // the ground band under the horizon fades to the fog colour (the 3D ground takes over in front)
  const gr = g.createLinearGradient(0, hz, 0, h); gr.addColorStop(0, P.fog + '00'); gr.addColorStop(0.25, P.fog); gr.addColorStop(1, P.hemiBot);
  if (!P.sea) { g.fillStyle = gr; g.fillRect(0, hz, w, h - hz); }
  // vignette
  const v = g.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,6,3,0.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
}

/** a running Greek key (meander): dark key on a light field (or the colours given), tiles every h px along x */
export function paintMeander(g, w, h, o) {
  const opt = o || {}, bg = opt.bg || '#e6d8bb', fg = opt.fg || '#7a3a22';
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const u = h / 10; g.fillStyle = fg; g.fillRect(0, 0, w, u * 0.8); g.fillRect(0, h - u * 0.8, w, u * 0.8);
  g.strokeStyle = fg; g.lineWidth = u * 0.95; g.lineCap = 'square'; g.lineJoin = 'miter';
  for (let x0 = 0; x0 < w; x0 += h) {
    const pts = [[0, 8], [0, 2], [7, 2], [7, 7], [3, 7], [3, 4.5], [5, 4.5]], k = h / 10;
    g.beginPath(); pts.forEach((p, i) => { const X = x0 + (p[0] + 1) * k, Y = p[1] * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke();
    g.beginPath(); g.moveTo(x0 + 1 * k, 8 * k); g.lineTo(x0 + 11 * k, 8 * k); g.stroke();
  }
}
/** an egg-and-dart / bead moulding strip (gold on dark), tiles along x */
export function paintEggDart(g, w, h, o) {
  const opt = o || {}; g.fillStyle = opt.bg || '#3a2a1a'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += h) {
    const eg = g.createLinearGradient(x, 0, x + h, h); eg.addColorStop(0, '#f2d58a'); eg.addColorStop(1, '#8a6420');
    g.fillStyle = eg; g.beginPath(); g.ellipse(x + h * 0.38, h * 0.5, h * 0.24, h * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8c870'; g.beginPath(); g.moveTo(x + h * 0.82, h * 0.15); g.lineTo(x + h * 0.88, h * 0.5); g.lineTo(x + h * 0.82, h * 0.85); g.lineTo(x + h * 0.76, h * 0.5); g.fill();
  }
}
/** a black-figure amphora skin for a LatheGeometry (u around, v from the foot to the lip): terracotta, black foot and neck, rays at the
 *  base, a figure frieze (running horses and riders, black on orange), a key band on the shoulder */
export function paintAmphora(g, w, h) {
  const band = (v0, v1, col) => { g.fillStyle = col; g.fillRect(0, h - v1 * h, w, (v1 - v0) * h); };
  band(0, 1, '#c0683a');
  const grain = g.createLinearGradient(0, 0, w, 0); grain.addColorStop(0, 'rgba(0,0,0,0.05)'); grain.addColorStop(0.5, 'rgba(255,220,180,0.06)'); grain.addColorStop(1, 'rgba(0,0,0,0.05)'); g.fillStyle = grain; g.fillRect(0, 0, w, h);
  band(0, 0.1, '#1e1610'); band(0.72, 1, '#1e1610'); band(0.115, 0.125, '#1e1610'); band(0.6, 0.61, '#1e1610'); band(0.385, 0.395, '#1e1610');
  // rays rising from the foot
  g.fillStyle = '#1e1610'; for (let i = 0; i < 16; i++) { const x = (i + 0.5) * (w / 16); g.beginPath(); g.moveTo(x - w / 40, h - 0.13 * h); g.lineTo(x, h - 0.22 * h); g.lineTo(x + w / 40, h - 0.13 * h); g.fill(); }
  // the frieze: horses and riders, black on orange
  const fy = h - 0.39 * h, fh = 0.13 * h;
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (w / 4), k = fh / 30;
    g.beginPath(); g.ellipse(x, fy + fh * 0.62, 11 * k, 5 * k, 0, 0, Math.PI * 2); g.fill();                         // body
    g.beginPath(); g.moveTo(x + 9 * k, fy + fh * 0.5); g.lineTo(x + 15 * k, fy + fh * 0.18); g.lineTo(x + 18 * k, fy + fh * 0.24); g.lineTo(x + 12 * k, fy + fh * 0.62); g.fill();   // neck + head
    g.lineWidth = 1.6 * k; g.strokeStyle = '#1e1610';
    for (const lx of [-8, -5, 6, 9]) { g.beginPath(); g.moveTo(x + lx * k, fy + fh * 0.72); g.lineTo(x + (lx + (lx < 0 ? -2 : 2)) * k, fy + fh); g.stroke(); }
    g.beginPath(); g.arc(x, fy + fh * 0.22, 2.4 * k, 0, Math.PI * 2); g.fill(); g.fillRect(x - 1.5 * k, fy + fh * 0.28, 3 * k, 7 * k);   // the rider
  }
  // a key band on the shoulder
  const ky = h - 0.7 * h, kh = 0.08 * h, u = kh / 10; g.strokeStyle = '#1e1610'; g.lineWidth = u * 0.9;
  for (let x0 = 0; x0 < w; x0 += kh) { const P = [[0, 8], [0, 2], [7, 2], [7, 7], [3, 7], [3, 4.5], [5, 4.5]]; g.beginPath(); P.forEach((p, i) => { const X = x0 + (p[0] + 1) * u, Y = ky + p[1] * u; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke(); }
}
/** an owl tetradrachm face (the coin) on a disc: gold or silver relief, the edge darker */
export function paintCoin(g, w, h, o) {
  const opt = o || {}, cx = w / 2, cy = h / 2, r = w / 2;
  const base = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  base.addColorStop(0, opt.hi || '#fff0b8'); base.addColorStop(0.6, opt.mid || '#d8b050'); base.addColorStop(1, opt.lo || '#7a5a18');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70,45,10,0.6)'; g.lineWidth = r * 0.05; g.beginPath(); g.arc(cx, cy, r * 0.86, 0, Math.PI * 2); g.stroke();
  // the owl: body, two big eyes, ears, an olive sprig
  g.fillStyle = 'rgba(80,52,12,0.55)';
  g.beginPath(); g.ellipse(cx, cy + r * 0.12, r * 0.3, r * 0.42, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,240,190,0.55)';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.13, cy - r * 0.12, r * 0.11, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(60,40,8,0.8)'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.13, cy - r * 0.12, r * 0.045, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(80,52,12,0.55)'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * r * 0.08, cy - r * 0.3); g.lineTo(cx + s * r * 0.26, cy - r * 0.42); g.lineTo(cx + s * r * 0.24, cy - r * 0.22); g.fill(); }
  g.strokeStyle = 'rgba(80,52,12,0.6)'; g.lineWidth = r * 0.03; g.beginPath(); g.moveTo(cx + r * 0.35, cy - r * 0.45); g.quadraticCurveTo(cx + r * 0.55, cy - r * 0.2, cx + r * 0.5, cy + r * 0.1); g.stroke();
  g.fillStyle = 'rgba(80,52,12,0.5)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx + r * (0.4 + i * 0.03), cy - r * (0.35 - i * 0.12), r * 0.06, r * 0.025, 0.8, 0, Math.PI * 2); g.fill(); }
  g.font = 'bold ' + Math.round(r * 0.22) + 'px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(70,45,10,0.6)'; g.fillText('ΑΘΕ', cx - r * 0.42, cy + r * 0.55);
}

// ------------------------------------------------------------------ geometry
/** a laurel wreath as one geometry: two branches of leaves around a circle of radius r (in the XY plane, facing +z), open at the bottom */
export function laurelGeo(r, o) {
  const opt = o || {}, n = opt.leaves ?? 26, gap = opt.gap ?? 0.5, parts = [];
  const leaf = new THREE.SphereGeometry(1, 8, 4); leaf.scale(r * 0.07, r * 0.028, r * 0.022);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (const side of [-1, 1]) for (let i = 0; i < n / 2; i++) {
    const t = i / (n / 2 - 1), a = -Math.PI / 2 + side * (gap / 2 + t * (Math.PI - gap / 2 - 0.15));
    for (const off of [-1, 1]) {
      const rr = r + off * r * 0.06, ang = a + side * 0.04 * off;
      e.set(0, 0, a + side * Math.PI / 2 + off * 0.5 * side); q.setFromEuler(e);
      M.compose(v.set(Math.cos(ang) * rr, Math.sin(ang) * rr, off * r * 0.01), q, s.set(1 - t * 0.35, 1 - t * 0.3, 1));
      parts.push(leaf.clone().applyMatrix4(M));
    }
  }
  leaf.dispose();
  // the stems
  const stem = new THREE.TorusGeometry(r, r * 0.012, 4, 48, Math.PI * 2 - gap); stem.rotateZ(-Math.PI / 2 + gap / 2);
  parts.push(stem);
  return parts;
}
/** a round flame (a teardrop of two cones) material: warm core, no bloom, flickers by its scale (the scene animates it) */
export function flameMesh(o) {
  const opt = o || {}, g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: C(opt.color || '#ffb050').multiplyScalar(1.15), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  outer.geometry.scale(0.22, 0.5, 0.22); outer.geometry.translate(0, 0.38, 0); g.add(outer);
  const pos = outer.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = clamp((y - 0.1) / 0.8, 0, 1); pos.setX(i, pos.getX(i) * (1 - k * 0.75)); pos.setZ(i, pos.getZ(i) * (1 - k * 0.75)); }
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: C('#fff1c4').multiplyScalar(1.2), depthWrite: false, toneMapped: false }));
  inner.geometry.scale(0.1, 0.26, 0.1); inner.geometry.translate(0, 0.24, 0); g.add(inner);
  g.scale.setScalar(opt.size ?? 1);
  return g;
}

// ------------------------------------------------------------------ the dressing (works with a self-made renderer or the render core)
/**
 * dress({ renderer?, rc?, scene, camera, tier, palette, hdri, envI, sunDir }) -> D (the set-piece helpers; createStage returns the same plus a loop)
 */
export function dress(opts) {
  const o = opts || {}, scene = o.scene, renderer = o.renderer || (o.rc && o.rc.renderer);
  const tier = o.tier || (o.rc && o.rc.quality ? o.rc.quality() : tierNow()), lite = isLiteTier(tier);
  // the app's own sky; the OLYMPUS look (olympus/themes.js, 2026-11-14 team T2) leans it toward the look's sky, fog and light by the look's 'mix'
  // (the default AGORA: mix 0, the sky untouched), at start and on every change of look
  let appSky = typeof o.palette === 'object' && o.palette ? o.palette : PALETTES[o.palette] || PALETTES.dusk;
  let P = lean(appSky, lookNow());
  let D = null;
  const kit = envKit(Object.assign({ scene, tier, envI: o.envI ?? 0.75 }, o.rc ? { rc: o.rc } : { renderer }));
  const soft = kit.soft, own = [];
  const sunDir = new THREE.Vector3().fromArray(o.sunDir || [0.55, 0.62, 0.55]).normalize();
  // ---- light
  const hemi = new THREE.HemisphereLight(C(P.hemiTop), C(P.hemiBot), o.hemi ?? (lite ? 0.9 : 0.45)); scene.add(hemi);
  const key = new THREE.DirectionalLight(C(P.key), o.key ?? 2.3); key.position.copy(sunDir).multiplyScalar(14); scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(C(P.rim), o.rim ?? 0.7); rim.position.set(-sunDir.x * 10, 6, -Math.abs(sunDir.z) * 12 - 2); scene.add(rim);
  const shadows = !lite && !soft && o.shadows !== false && !!renderer;
  if (shadows) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    const sc = key.shadow.camera, ext = o.shadowExt ?? 6; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40; sc.updateProjectionMatrix();
  }
  // ---- the painted backdrop (scene.background) and the fog into it
  let bgTex = null, bgW = 0, bgH = 0;
  const backdrop = (w, h) => {
    if (o.backdrop === false) return;
    const W = Math.round(clamp(w, 64, 720)), Hh = Math.round(clamp(h, 64, 720));
    if (bgTex && Math.abs(W - bgW) < 24 && Math.abs(Hh - bgH) < 24) return;
    bgW = W; bgH = Hh;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; paintSky(cv.getContext('2d'), W, Hh, P, o.sky || {});
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    if (bgTex) bgTex.dispose(); bgTex = t; scene.background = t;
  };
  scene.fog = new THREE.Fog(C(P.fog), o.fogNear ?? 14, o.fogFar ?? 34);
  /** another sky (a palette name or object): repaints the backdrop, the fog and the light colours (the HDRI stays) */
  const paintPal = (NP, so) => {
    if (!NP || NP === P) return;
    P = NP; if (so) o.sky = Object.assign({}, o.sky || {}, so);
    scene.fog.color.set(P.fog); hemi.color.set(P.hemiTop); hemi.groundColor.set(P.hemiBot); key.color.set(P.key); rim.color.set(P.rim);
    if (bgTex) { bgTex.dispose(); bgTex = null; const w = bgW, h = bgH; bgW = bgH = 0; backdrop(w, h); }
    if (D) D.P = P;
  };
  const setSky = (name, so) => {
    const NP = typeof name === 'object' && name ? name : PALETTES[name]; if (!NP || NP === appSky) return;
    appSky = NP; paintPal(lean(appSky, lookNow()), so);
  };
  try {                                                // a new look (the Gate, Jarvis, another tab): the same sky, leaned toward it
    const O = window.OLYMPUS;
    if (O && typeof O.onTheme === 'function') O.onTheme((t) => paintPal(lean(appSky, t)));
    window.addEventListener('olympus:theme-default', () => paintPal(appSky));
  } catch (e) { /* no kit: the app's own sky */ }
  // ---- the HDRI
  const envReady = kit.env(lite ? 'gradient' : o.hdri || 'golden', { sunDir, top: P.top, horizon: P.horizon, ground: P.hemiBot, gain: lite ? 1.1 : o.gain || 1, tint: o.envTint || P.envTint || '#ffd9a8' });
  const B = kit.builder();
  D = {
    setSky, kit, B, scene, P, tier, lite, soft, shadows, key, rim, hemi, sunDir, envReady, backdrop,
    /** cast and receive shadows on a built group (HD only) */
    shade(obj, cast, receive) { if (!shadows || !obj) return obj; obj.traverse((x) => { if (x.isMesh) { x.castShadow = cast !== false; x.receiveShadow = receive !== false; } }); return obj; },
    /** a painted material by name (cached by the kit): 'meander' | 'eggdart' | 'coin' | 'silvercoin' */
    paint(name, po) {
      const q = po || {};
      if (name === 'meander') return kit.painted('paint:meander' + (q.tag || ''), 512, 64, (g, w, h) => paintMeander(g, w, h, q), { rough: 0.6 });
      if (name === 'eggdart') return kit.painted('paint:eggdart', 512, 64, (g, w, h) => paintEggDart(g, w, h, q), { rough: 0.35 });
      if (name === 'coin') return kit.painted('paint:coin', 128, 128, (g, w, h) => paintCoin(g, w, h, q), { rough: 0.32 });
      if (name === 'silvercoin') return kit.painted('paint:silvercoin', 128, 128, (g, w, h) => paintCoin(g, w, h, { hi: '#ffffff', mid: '#b8b4ac', lo: '#5a5650' }), { rough: 0.3 });
      return null;
    },
    /** the ground: a big disc of a scanned surface (paving, marble, mosaic, sand ...) that the fog melts into the sky */
    ground(go) { const g = go || {}; B.add((g.mat || 'paving') + ':uv', discGeo(g.r ?? 30, lite ? 32 : 64), mat4(0, g.y ?? 0, 0), g.color || '#7d6d58'); return D; },
    /** a round plinth: n steps of marble rising to h, top radius r, a painted key band on the top drum, a gold fillet */
    plinth(po) {
      const p = po || {}, r = p.r ?? 2.4, n = p.steps ?? 2, sh = p.stepH ?? 0.16, run = p.run ?? 0.32, x = p.x || 0, z = p.z || 0, seg = lite ? 40 : 72, mat = (p.mat || 'marble') + ':uv';
      for (let i = 0; i < n; i++) { const rr = r + (n - i) * run; B.add(mat, new THREE.CylinderGeometry(rr, rr + 0.02, sh, seg), mat4(x, (p.y || 0) + sh * (i + 0.5), z), p.stepColor || '#cfc5b4'); }
      const y0 = (p.y || 0) + n * sh, dh = p.drum ?? 0.42;
      if (p.band !== false) {
        D.paint('meander', { bg: p.bandBg, fg: p.bandFg, tag: p.bandTag });
        const g = bandGeo(r + 0.012, y0 + dh * 0.22, dh * 0.56, seg, false); uvScaleGeo(g, 1 / (dh * 0.56 * 8), 1 / (dh * 0.56));
        B.add('paint:meander' + (p.bandTag || ''), g, mat4(x, 0, z));
      }
      B.add(mat, new THREE.CylinderGeometry(r, r, dh, seg, 1, false), mat4(x, y0 + dh / 2, z), p.color || '#e4dccd');
      B.add(mat, new THREE.CylinderGeometry(r + 0.06, r + 0.04, 0.07, seg), mat4(x, y0 + dh + 0.035, z), p.capColor || '#efe8dc');
      if (p.fillet !== false) B.add('gold', new THREE.TorusGeometry(r + 0.065, 0.022, 6, seg), mat4(x, y0 + dh + 0.075, z, 0, 1, Math.PI / 2));
      return y0 + dh + 0.07;                          // the top surface
    },
    /** a square plinth (w x d), stepped, with a key band on its front face; -> the top y */
    block(po) {
      const p = po || {}, w = p.w ?? 4, d = p.d ?? 2.4, n = p.steps ?? 2, sh = p.stepH ?? 0.16, run = p.run ?? 0.28, x = p.x || 0, z = p.z || 0, mat = (p.mat || 'marble') + ':uv';
      for (let i = 0; i < n; i++) B.add(mat, boxGeo(w + (n - i) * run * 2, sh, d + (n - i) * run * 2), mat4(x, (p.y || 0) + sh * (i + 0.5), z), p.stepColor || '#cfc5b4');
      const y0 = (p.y || 0) + n * sh, dh = p.drum ?? 0.45;
      B.add(mat, boxGeo(w, dh, d), mat4(x, y0 + dh / 2, z), p.color || '#e4dccd');
      if (p.band !== false) {
        D.paint('meander', { bg: p.bandBg, fg: p.bandFg, tag: p.bandTag });
        const g = new THREE.PlaneGeometry(w * 0.96, dh * 0.5); uvScaleGeo(g, (w * 0.96) / (dh * 0.5 * 8), 1);
        B.add('paint:meander' + (p.bandTag || ''), g, mat4(x, y0 + dh / 2, z + d / 2 + 0.006));
      }
      B.add(mat, boxGeo(w + 0.1, 0.07, d + 0.1), mat4(x, y0 + dh + 0.035, z), p.capColor || '#efe8dc');
      return y0 + dh + 0.07;
    },
    /** a gold laurel wreath standing (facing +z) or lying (flat: true) */
    laurel(lo) {
      const l = lo || {}, parts = laurelGeo(l.r ?? 0.5, l), M = l.flat ? mat4(l.x || 0, l.y || 0, l.z || 0, l.ry || 0, 1, -Math.PI / 2) : mat4(l.x || 0, l.y || 0, l.z || 0, l.ry || 0);
      for (const g of parts) B.add(l.mat || 'gold', g, M, l.color);
      return D;
    },
    /** a painted black-figure amphora (lathe, terracotta with black bands, a key band and tongues; two black handles): x, y, z, s (height ~ 1 * s), ry */
    amphora(ao) {
      const a = ao || {}, s = a.s ?? 1, seg = lite ? 14 : 28;
      kit.painted('paint:amphora', 256, 256, paintAmphora, { rough: 0.45 });
      const prof = [[0.0001, 0], [0.13, 0], [0.12, 0.04], [0.16, 0.1], [0.27, 0.3], [0.31, 0.45], [0.29, 0.58], [0.2, 0.7], [0.11, 0.78], [0.1, 0.9], [0.14, 0.95], [0.13, 0.97], [0.0001, 0.97]];
      const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg);
      B.add('paint:amphora', g, mat4(a.x || 0, a.y || 0, a.z || 0, a.ry || 0, s));
      for (const sd of [-1, 1]) { const h = new THREE.TorusGeometry(0.1, 0.018, 6, 12, Math.PI); h.rotateZ(sd > 0 ? -Math.PI / 2 : Math.PI / 2); h.translate(sd * 0.17, 0.79, 0); B.add('ink', h, mat4(a.x || 0, a.y || 0, a.z || 0, a.ry || 0, s)); }
      return D;
    },
    /** dust motes drifting in the light: one draw. -> { points, tick(t) } */
    motes(mo) {
      const m = mo || {}, n = lite ? Math.round((m.n ?? 60) * 0.5) : m.n ?? 60, R = rng(m.seed || 5), box = m.box || [8, 5, 6], c = m.center || [0, 2.2, 0];
      const pos = new Float32Array(n * 3), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = c[0] + (R() - 0.5) * box[0]; pos[i * 3 + 1] = c[1] + (R() - 0.5) * box[1]; pos[i * 3 + 2] = c[2] + (R() - 0.5) * box[2]; ph[i] = R() * 6.28; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uT: { value: 0 }, uC: { value: C(m.color || '#ffe2b0') }, uS: { value: (m.size ?? 5) * Math.min(2, window.devicePixelRatio || 1) }, uA: { value: m.alpha ?? 0.5 } },
        vertexShader: 'attribute float ph; uniform float uT, uS; varying float vA; void main() { vec3 p = position; p.x += sin(uT * 0.21 + ph) * 0.35; p.y += sin(uT * 0.13 + ph * 1.7) * 0.4; p.z += cos(uT * 0.17 + ph) * 0.3;'
          + ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uS * 1.6, uS * (8.0 / max(1.0, -mv.z))); vA = 0.45 + 0.55 * sin(uT * 0.7 + ph * 3.0); }',
        fragmentShader: 'uniform vec3 uC; uniform float uA; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float k = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uC * k * uA * vA, 1.0); }' });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.name = 'hero-motes'; scene.add(pts); own.push(g, mat);
      return { points: pts, tick(t) { mat.uniforms.uT.value = t; } };
    },
    /** many flames in three draws (outer, core, a soft glow): positions [[x, y, z], ...]. -> { set(i, k 0..1, flick, color?), tick(t) } */
    flames(list, fo) {
      const f = fo || {}, n = Math.max(1, list.length), outerG = new THREE.SphereGeometry(1, 12, 10), innerG = new THREE.SphereGeometry(1, 10, 8);
      outerG.scale(0.22, 0.5, 0.22); outerG.translate(0, 0.38, 0); innerG.scale(0.1, 0.26, 0.1); innerG.translate(0, 0.24, 0);
      for (const g of [outerG, innerG]) { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = clamp((y - 0.1) / 0.8, 0, 1); p.setX(i, p.getX(i) * (1 - k * 0.75)); p.setZ(i, p.getZ(i) * (1 - k * 0.75)); } }
      const om = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false, fog: false });
      const im = new THREE.MeshBasicMaterial({ color: C('#fff1c4').multiplyScalar(1.15), depthWrite: false, toneMapped: false, fog: false });
      const outer = new THREE.InstancedMesh(outerG, om, n), inner = new THREE.InstancedMesh(innerG, im, n);
      const gp = new Float32Array(n * 3), gk = new Float32Array(n);
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('k', new THREE.BufferAttribute(gk, 1));
      const gm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uS: { value: (f.glow ?? 90) * Math.min(2, window.devicePixelRatio || 1) }, uC: { value: C(f.glowColor || '#ff9a40') } },
        vertexShader: 'attribute float k; uniform float uS; varying float vK; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uS * k * (6.0 / max(1.0, -mv.z)); vK = k; }',
        fragmentShader: 'uniform vec3 uC; varying float vK; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * 0.55 * vK; gl_FragColor = vec4(uC * a, 1.0); }' });
      const glow = new THREE.Points(gg, gm);
      [outer, inner, glow].forEach((x) => { x.frustumCulled = false; x.renderOrder = 4; scene.add(x); }); own.push(outerG, innerG, om, im, gg, gm);
      const base = C(f.color || '#ffb050'), tmp = new THREE.Color();
      const api = {
        outer, inner, glow,
        set(i, k, flick, color) {
          const p = list[i]; if (!p) return; const s = (f.size ?? 1) * Math.max(0.0001, k), fl = flick || 0;
          outer.setMatrixAt(i, mat4(p[0], p[1], p[2], 0, [s * (1 - fl * 0.5), s * (1 + fl), s])); inner.setMatrixAt(i, mat4(p[0], p[1], p[2], 0, [s, s * (1 + fl * 0.6), s]));
          outer.setColorAt(i, tmp.copy(color ? C(color) : base).multiplyScalar(1.2)); gp[i * 3] = p[0]; gp[i * 3 + 1] = p[1] + 0.35 * (f.size ?? 1); gp[i * 3 + 2] = p[2]; gk[i] = k * (1 + fl);
        },
        commit() { outer.instanceMatrix.needsUpdate = true; inner.instanceMatrix.needsUpdate = true; if (outer.instanceColor) outer.instanceColor.needsUpdate = true; gg.attributes.position.needsUpdate = true; gg.attributes.k.needsUpdate = true; },
      };
      for (let i = 0; i < n; i++) api.set(i, 0, 0); api.commit();
      return api;
    },
    /** a text plaque as a sprite (a number the scene must keep readable): gold serif on a dark bronze tablet. -> Sprite (set(text) to change) */
    label(text, lo) {
      const l = lo || {}, cv = document.createElement('canvas'), W = l.w ?? 256, Hh = l.h ?? 96; cv.width = W; cv.height = Hh;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
      const draw = (s, sub) => {
        const g = cv.getContext('2d'); g.clearRect(0, 0, W, Hh);
        if (l.plate !== false) {
          const rr = Hh * 0.22; g.fillStyle = l.bg || 'rgba(34,24,15,0.82)'; g.beginPath();
          g.moveTo(rr, 2); g.lineTo(W - rr, 2); g.quadraticCurveTo(W - 2, 2, W - 2, rr); g.lineTo(W - 2, Hh - rr); g.quadraticCurveTo(W - 2, Hh - 2, W - rr, Hh - 2); g.lineTo(rr, Hh - 2); g.quadraticCurveTo(2, Hh - 2, 2, Hh - rr); g.lineTo(2, rr); g.quadraticCurveTo(2, 2, rr, 2); g.closePath(); g.fill();
          g.strokeStyle = l.edge || 'rgba(200,162,74,0.75)'; g.lineWidth = 3; g.stroke();
        }
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = l.color || '#f0d48a';
        const fs = sub ? Hh * 0.42 : Hh * 0.56; g.font = (l.weight || '600') + ' ' + Math.round(fs) + 'px Georgia, "Times New Roman", serif';
        let size = fs; while (g.measureText(String(s)).width > W * 0.88 && size > 10) { size -= 2; g.font = (l.weight || '600') + ' ' + Math.round(size) + 'px Georgia, serif'; }
        g.fillText(String(s), W / 2, sub ? Hh * 0.38 : Hh / 2 + 2);
        if (sub) { g.fillStyle = l.subColor || 'rgba(236,220,188,0.85)'; g.font = Math.round(Hh * 0.24) + 'px Georgia, serif'; g.fillText(String(sub), W / 2, Hh * 0.76); }
        tex.needsUpdate = true;
      };
      draw(text, l.sub);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: l.depthTest ?? true, fog: false, toneMapped: false });
      const sp = new THREE.Sprite(mat); const sc = l.scale ?? 1; sp.scale.set(sc * W / Hh, sc, 1); sp.renderOrder = 5; sp.name = 'hero-label';
      sp.userData.set = (s, sub) => draw(s, sub); own.push(tex, mat);
      return sp;
    },
    /** contact shadows: [[x, z, r, a], ...] */
    blobs(list, bo) { return kit.blobs(scene, list, Object.assign({ opacity: 0.5 }, bo || {})); },
    /** finish: build the builder into the parent (shadows on), -> the group */
    build(parent, so) { const grp = B.build(parent || scene); D.shade(grp, so && so.cast, so && so.receive); D.tune(); return grp; },
    /** metals live on the environment light: give every metal material in the scene a stronger HDRI (gold and bronze read as metal, not grey) */
    tune(v) { const k = v ?? o.metalEnv ?? 1.7; scene.traverse((x) => { const ms = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : []; for (const m of ms) if (m && m.metalness >= 0.5 && !m.userData.heroTuned) { m.envMapIntensity = Math.max(m.envMapIntensity || 1, k); m.userData.heroTuned = true; } }); return D; },
    stats() { const m = measure(scene), k = kit.stats(); return { draws: m.draws, tris: m.tris, tier, lite, soft, shadows, texMB: k.texMB, env: k.env, failed: k.failed }; },
    dispose() { own.forEach((x) => x && x.dispose && x.dispose()); own.length = 0; if (bgTex) { bgTex.dispose(); bgTex = null; } kit.dispose(); },
  };
  return D;
}
function uvScaleGeo(g, sx, sy) { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return g; }
/** merge simple parts (each [geometry, matrix?]) into one geometry: position / normal / uv only, indexed */
export function mergeParts(list) {
  const gs = list.map((e) => {
    const g = Array.isArray(e) ? e[0] : e, m = Array.isArray(e) ? e[1] : null, out = new THREE.BufferGeometry(), n = g.getAttribute('position').count;
    for (const k of ['position', 'normal', 'uv']) if (g.getAttribute(k)) out.setAttribute(k, g.getAttribute(k).clone());
    if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    out.setIndex(g.index ? Array.from(g.index.array) : Array.from({ length: n }, (x, i) => i));
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    if (m) out.applyMatrix4(m); g.dispose(); return out;
  });
  const g = mergeGeometries(gs, false); gs.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g;
}
export { uvScaleGeo, mat4, latheGeo, boxGeo, ringGeo, discGeo, bandGeo, shaftGeo, measure };

// ------------------------------------------------------------------ a self-made stage (a scene with its own renderer)
/**
 * createStage(box, { palette, hdri, target: [x, y, z], dist, height, fov, yaw, sway, swayPeriod, tier, exposure, minW, minH, alpha })
 * -> H (dress()'s helpers + renderer, camera, root, start(fn), poke(), frames, dispose()) | null when there is no WebGL.
 */
export function createStage(box, opts) {
  const o = opts || {};
  if (!box || !webgl()) return null;
  let renderer;
  const own = !o.canvas;                                // an existing canvas (o.canvas) stays in the page; box is then the canvas itself
  try { renderer = new THREE.WebGLRenderer(Object.assign({ antialias: true, alpha: false, powerPreference: 'low-power' }, own ? {} : { canvas: o.canvas })); } catch (e) { return null; }
  if (!renderer.getContext || !renderer.getContext()) return null;
  const tier = o.tier || tierNow(), lite = isLiteTier(tier), reduce = o.reduce ?? prefersReduced();
  const RQ = governor(), K = () => window.OLYMPUS || null;
  const myRange = () => { const O = K(); return rqRange({ tier: ['ultra', 'high', 'low', 'off'].indexOf(tier) >= 0 ? tier : 'high', maxDpr: o.maxDpr || (lite ? 1.5 : 2),
    chosen: !!(O && O.chosen && O.chosen()) || !!o.tier, saver: !!(O && O.saver && O.saver()), software: lite }); };
  renderer.setPixelRatio(RQ.dpr(myRange()));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const P = typeof o.palette === 'object' && o.palette ? o.palette : PALETTES[o.palette] || PALETTES.dusk;
  renderer.toneMappingExposure = o.exposure ?? P.exposure ?? 1;
  if (own) { renderer.domElement.style.display = 'block'; renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; box.appendChild(renderer.domElement); }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(o.fov ?? 34, 1.6, 0.1, 120);
  const D = dress(Object.assign({}, o, { renderer, scene, camera, tier }));
  const root = new THREE.Group(); root.name = 'hero-root'; scene.add(root);
  const target = new THREE.Vector3().fromArray(o.target || [0, 1.5, 0]);
  const H = Object.assign(D, { renderer, camera, root, target, reduce, frames: 0, dist: o.dist ?? 10, height: o.height ?? 3, yaw: o.yaw ?? 0, sway: o.sway ?? 0.18, swayPeriod: o.swayPeriod ?? 34, aspectK: o.aspectK ?? 0.55, fit: o.fit || null });
  let raf = 0, dead = false, loop = null, t0 = performance.now(), tPrev = t0, onScreen = true, wakeUntil = 0, need = true, io = null, ro = null;
  const place = (t) => {
    const a = H.yaw + (reduce ? 0 : Math.sin((t * Math.PI * 2) / H.swayPeriod) * H.sway);
    if (H.fit) {                                       // frame a box (centre, size [w, h, d]) at a pitch: the distance that fits it whatever the aspect
      const F = H.fit, vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), pitch = F.pitch ?? 0.2, m = F.margin ?? 1.08;
      const sw = F.size[0] / 2, sd = F.size[2] / 2, shh = (F.size[1] / 2) * Math.cos(pitch) + sd * Math.sin(pitch);
      const d = Math.max(shh / Math.tan(vf / 2), sw / Math.tan(hf / 2)) * m + sd * Math.cos(pitch);
      target.fromArray(F.center); camera.position.set(target.x + Math.sin(a) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(a) * Math.cos(pitch) * d); camera.lookAt(target);
      return;
    }
    const asp = camera.aspect, k = asp < 1.45 ? 1 + (1.45 - asp) * H.aspectK : 1;           // narrower boxes step back so the subject fits
    camera.position.set(target.x + Math.sin(a) * H.dist * k, target.y + H.height * k, target.z + Math.cos(a) * H.dist * k); camera.lookAt(target);
  };
  let cssW = 0, cssH = 0;
  const size = (measure) => {
    if (measure !== false || !cssW) { cssW = Math.max(o.minW ?? 160, box.clientWidth || 320); cssH = Math.max(o.minH ?? 90, box.clientHeight || 180); }
    const w = cssW, h = cssH, d = RQ.dpr(myRange());
    // one resize of the drawing buffer (setPixelRatio + setSize reset the canvas twice, each a wait for the GPU); none when the size is the same
    const cv = renderer.domElement, bw = Math.floor(w * d), bh = Math.floor(h * d);
    if (cv.width !== bw || cv.height !== bh || renderer.getPixelRatio() !== d) renderer.setDrawingBufferSize(w, h, d); else renderer.setViewport(0, 0, w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix(); D.backdrop(w, h); need = true;
  };
  const leaveRQ = RQ.join({ range: myRange });
  const offRQ = RQ.on(() => { if (!dead && renderer.getPixelRatio() !== RQ.dpr(myRange())) { size(false); H.poke(200); } });
  const hidden = () => { const O = K(); try { return O && O.hidden ? O.hidden() : document.hidden; } catch (e) { return document.hidden; } };
  const gapNow = () => { const O = K(); try { return O && O.frameGap ? O.frameGap() : 0; } catch (e) { return 0; } };
  // the shaders compile in the background before the first frame (the first draw would compile them all synchronously)
  let compiled = typeof renderer.compile !== 'function' || !renderer.properties || !parallelCompile(renderer), compiling = false;   // a real GPU's parallel compile only
  const warm = () => {
    if (compiled || compiling || dead) return;
    compiling = true;
    const done = () => { compiled = true; compiling = false; if (!dead) schedule(); };
    try { compileQuietly(renderer, scene, camera, 8000).then(done, done); } catch (e) { done(); }      // bounded: three's compileAsync could poll for ever
    setTimeout(() => { if (!compiled) done(); }, 8000);
  };
  let lastDraw = 0, offT = 0, offDue = false;
  const frame = (now) => {
    raf = 0; if (dead) return;
    // hidden or covered (a sheet, an app over the page: OLYMPUS.hidden): nothing is drawn and no frame is asked for (visibility / the kit wake it)
    if (H.frames > 0 && hidden()) return;
    // off screen: no frame per vsync (it spun 60 rAF a second for one picture); about one picture a second on a timer, as before (the clock
    // and the frame counter still move), never a governor sample; the IntersectionObserver brings the frames back
    const off = H.frames > 0 && !onScreen;
    if (off && !offDue) { if (!offT) offT = setTimeout(() => { offT = 0; offDue = true; schedule(); }, Math.max(0, 1000 - (performance.now() - lastDraw))); return; }
    offDue = false;
    if (!compiled) { warm(); return; }
    const g = gapNow();                                 // the kit's idle cap (30 fps idle on high, battery saver): skip the frame, no JS, no draw
    if (!off && g && lastDraw && now - lastDraw < g - 3 && now >= wakeUntil) { schedule(); return; }
    const t = (now - t0) / 1000, dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now; lastDraw = now;
    let moving = false; if (loop) { try { moving = !!loop(dt, t); } catch (e) { moving = false; } }
    place(t); renderer.render(scene, camera); H.frames++; need = false;
    if (!off) RQ.frame(now, { gap: g, work: Math.max(0, performance.now() - now) });
    if (!reduce || moving || now < wakeUntil) schedule();
  };
  const schedule = () => { if (!raf && !dead && !document.hidden) raf = requestAnimationFrame(frame); };
  H.poke = (ms) => { wakeUntil = Math.max(wakeUntil, performance.now() + (ms ?? 600)); need = true; schedule(); };
  H.start = (fn) => { loop = fn || null; D.tune(); size(); H.poke(reduce ? 1200 : 0); schedule(); return H; };
  H.rq = () => ({ dpr: renderer.getPixelRatio(), range: myRange(), onScreen, compiled, state: RQ.state() });
  H.renderNow = () => { if (dead) return; place((performance.now() - t0) / 1000); renderer.render(scene, camera); H.frames++; };
  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else { tPrev = performance.now(); H.poke(300); } };
  document.addEventListener('visibilitychange', vis);
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { size(); H.poke(200); }); ro.observe(box); }
  if (typeof IntersectionObserver === 'function') { io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); if (onScreen) { tPrev = performance.now(); H.poke(300); } }); io.observe(box); }
  // textures and the HDRI arrive later: draw again when they do (reduced motion draws on demand only)
  // the HDRI changes every material's program (an environment map): those compile in the background too before the next frame
  D.envReady.then(() => { if (!compiling && typeof renderer.compile === 'function' && renderer.properties && parallelCompile(renderer)) compiled = false; H.poke(400); });
  setTimeout(() => H.poke(500), 1500); setTimeout(() => H.poke(500), 4000);
  const baseStats = D.stats;
  H.stats = () => Object.assign(baseStats(), { frames: H.frames, calls: renderer.info.render.calls });
  H.dispose = () => {
    if (dead) return; dead = true; cancelAnimationFrame(raf); if (offT) { clearTimeout(offT); offT = 0; }
    try { document.removeEventListener('visibilitychange', vis); if (ro) ro.disconnect(); if (io) io.disconnect(); leaveRQ(); offRQ(); } catch (e) { /* nothing */ }
    try { scene.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); D.dispose(); renderer.dispose(); if (own && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) { /* nothing */ }
  };
  size();
  return H;
}
