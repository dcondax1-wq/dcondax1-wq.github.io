// STOA 3D scene (optional ES module): a real stoa, the long porch of the agora: six fluted Doric columns on a stepped marble stylobate, an
// architrave and triglyph frieze, a terracotta tiled roof, a plastered back wall with an oxblood dado and a painted key band. Each column
// is one of the six things STOA watches (bots, drawdown, today, deals, feeds, alerts), named on the step under it. A LIT column (something
// needs you) has a bronze brazier burning in front of it (gold flame; terracotta when it is bad); a calm column's brazier is cold.
// QA Round 6 bug 8: env-kit marble / plaster / roof-tile scans and HDRI light via olympus/hero-stage.js, dusk sky, contact shadows.
// No neon, no bloom. Registers window.STOA3D = { mount(box, cols), update(cols), dispose() } and fires 'stoa3d'.
// stoa.js draws the 2D columns first and hides them only when mount() returns true (WebGL present).
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, mat4 } from '../olympus/hero-stage.js';

const GOLD = 0xe0b060, TERRA = 0xc96a4a;
const GAP = 2.2, CH = 3.4;
let R = null;

function apply(g, c) { const u = g.userData; u.lit = !!(c && c.lit); u.tone = c && c.tone === 'bad' ? TERRA : GOLD; }

/** the names under the columns, cut into the top step: one painted strip */
function nameStrip(g, w, h, names) {
  g.fillStyle = '#e6dccb'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,100,70,0.12)'; for (let i = 0; i < 300; i++) g.fillRect((i * 97) % w, (i * 41) % h, 3, 1);
  g.fillStyle = '#5a3a22'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 ' + Math.round(h * 0.5) + 'px Georgia, "Times New Roman", serif';
  names.forEach((s, i) => g.fillText(String(s || '').toUpperCase(), ((i + 0.5) * w) / names.length, h * 0.55));
}

function mount(box, cols) {
  if (R) dispose();
  const list = (cols || []).slice(0, 6), n = Math.min(6, list.length);
  const W = GAP * (Math.max(1, n) - 1) + 2.0;
  const H = createStage(box, { palette: 'dusk', hdri: 'golden', fit: { center: [0, 2.45, -0.1], size: [W + 1.2, 5.6, 4.6], pitch: 0.12, margin: 1.02 }, fov: 30, sway: 0.13, sunDir: [0.75, 0.5, 0.5], shadowExt: 9, sky: { sunX: 0.86, sunY: 0.8, templeX: 0.1 }, fogNear: 18, fogFar: 44 });
  if (!H) return false;
  const { kit, B } = H;
  H.ground({ mat: 'paving', color: '#93826a' });
  // the stylobate: three steps, the top one carries the names
  const sh = 0.17, steps = 3, D0 = 3.1, top = steps * sh;
  B.steps({ x: 0, z: 0, w: W, d: D0, n: steps, h: top, run: 0.3, mat: 'marble:uv', color: '#d9cfbd' });
  kit.painted('paint:names', 1024, 64, (g, w, h) => nameStrip(g, w, h, list.map((c) => c.label || c.id)), { rough: 0.7 });
  const strip = new THREE.PlaneGeometry(W, sh * 0.8); B.add('paint:names', strip, mat4(0, top - sh / 2, D0 / 2 + 0.004));
  // the columns, the entablature, the roof
  const xs = []; for (let i = 0; i < n; i++) xs.push((i - (n - 1) / 2) * GAP);
  const zc = 0.75;
  xs.forEach((x) => B.column({ x, y: top, z: zc, h: CH, r: 0.3, flutes: 20, color: '#ece4d5' }));
  B.entablature({ x: 0, y: top + CH, z: zc - 0.35, w: W + 0.3, d: 1.5, ah: 0.36, fh: 0.38, ch: 0.14, bay: GAP / 2, color: '#e8e0d0', metope: '#b5563c', triglyph: '#3d4152' });
  B.roof({ x: 0, y: top + CH + 0.88, z: -0.55, w: W + 0.5, d: 3.4, h: 0.9, over: 0.25, color: '#b3633a', pedColor: '#e6ddcc' });
  // the back wall: stone plinth, oxblood dado, plaster, a key band under the beams
  const zb = -1.3;
  B.box('ashlar:uv', 0, top + 0.18, zb, W + 0.2, 0.36, 0.3, 0, '#c4b398');
  B.box('plaster:uv', 0, top + 0.36 + 0.5, zb, W + 0.2, 1.0, 0.28, 0, '#7a3122');
  B.box('plaster:uv', 0, top + 1.36 + (CH - 1.36 + 0.4) / 2, zb, W + 0.2, CH - 1.36 + 0.4, 0.28, 0, '#d6c39f');
  H.paint('meander', { bg: '#e2d2b0', fg: '#7a3122', tag: 'w' });
  const band = new THREE.PlaneGeometry(W + 0.2, 0.28); { const uv = band.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (W + 0.2) / (0.28 * 8)); }
  B.add('paint:meanderw', band, mat4(0, top + 1.36 + 0.12, zb + 0.145));
  // braziers in front of every column (bronze tripods; the coals glow only when lit)
  const bz = zc + 0.95;
  xs.forEach((x) => B.brazier({ x, z: bz, h: 0.62 + top, r: 0.2 }));
  H.build(H.root);
  const groups = list.map((c, i) => { const g = { userData: { lit: false, tone: GOLD, k: 0 }, position: { x: xs[i] } }; apply(g, c); g.userData.k = g.userData.lit ? 1 : 0; return g; });
  const fl = H.flames(xs.map((x) => [x, top + 0.62 + 0.04, bz]), { size: 0.62, glow: 70 });
  const blobs = xs.map((x) => [x, zc, 0.5, 1, top + 0.012]).concat(xs.map((x) => [x, bz, 0.3, 1, top + 0.012]));
  H.blobs(blobs, { opacity: 0.45 });
  const embers = H.motes({ n: 36, center: [0, top + 1.6, bz], box: [W, 2.2, 1.6], color: '#ffb46a', size: 3.5, alpha: 0.45 });
  R = { H, groups, fl, dead: false };
  const reduce = H.reduce;
  H.start((dt, t) => {
    let moving = false;
    groups.forEach((g, i) => {
      const u = g.userData, want = u.lit ? 1 : 0, d = want - u.k;
      if (Math.abs(d) > 0.01) { u.k += d * (reduce ? 1 : Math.min(1, dt * 3)); moving = true; } else u.k = want;
      const flick = reduce || !u.lit ? 0 : Math.sin(t * 7.1 + g.position.x) * 0.07 + Math.sin(t * 12.3 + g.position.x * 3) * 0.04;
      fl.set(i, u.k, flick, u.tone);
    });
    fl.commit(); embers.tick(t);
    return moving;
  });
  return true;
}

function update(cols) {
  if (!R) return;
  (cols || []).slice(0, 6).forEach((c, i) => { if (R.groups[i]) apply(R.groups[i], c); });
  R.H.poke(1500);
}

function dispose() {
  if (!R) return;
  R.dead = true;
  try { R.H.dispose(); } catch (_) { /* nothing */ }
  R = null;
}

window.STOA3D = { mount, update, dispose, frames: () => (R ? R.H.frames : 0), lit: () => (R ? R.groups.map((g) => (g.userData.lit ? 1 : 0)) : []), stats: () => (R ? R.H.stats() : null) };
window.__heroStats = () => (R ? R.H.stats() : null);
window.dispatchEvent(new Event('stoa3d'));
