// NQ 3D scene (optional ES module): three fluted Doric marble columns on a stepped marble stylobate with a Greek-key band, one per bot,
// each crowned with a bronze tripod bowl. A gold flame burns in the bowl ONLY when that bot reported in the last 20 minutes (its column
// stands in warm light); a silent bot's column stands in the shade with a cold bowl of ash. Dusk sky, the env-kit marble / paving scans and
// HDRI light (olympus/hero-stage.js, QA Round 6 bug 8), contact shadows, embers drifting. No bloom, nothing emissive but the flame itself.
// Registers window.NQ3D = { mount(box, cols), update(cols), dispose() } and fires 'nq3d'.
// nq.js draws the 2D columns first and hides them only when mount() returns true (WebGL present, not LITE).
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, shaftGeo, latheGeo, boxGeo, mergeParts, flameMesh, mat4 } from '../olympus/hero-stage.js';

const WARM = new THREE.Color('#e6f6ff'), SHADE = new THREE.Color('#8f8678'), GOLD = 0x22d3ee;
const R0 = 0.42, SH = 3.7, GAP = 2.75;
let R = null;

function apply(u, c) { u.lit = !!(c && c.lit); }

function mount(box, cols) {
  if (R) dispose();
  const list = (cols || []).slice(0, 3), n = list.length;
  // a phone (or Save-Data): the LITE paving albedo and no HDR file (-293 KB on a phone; perf sweep 2026-11-20), the same look in gradient light
  const small = (() => { try { return matchMedia('(max-width: 600px)').matches || !!(navigator.connection && navigator.connection.saveData); } catch (_) { return false; } })();
  const H = createStage(box, { palette: 'dusk', hdri: 'dusk', ...(small ? { tier: 'low' } : {}), fit: { center: [0, 3.5, 0], size: [10.4, 7.2, 3.6], pitch: 0.1, margin: 1.03 }, fov: 32, sway: 0.16, sunDir: [-0.7, 0.42, 0.55], shadowExt: 6.5, key: 1.9, sky: { sunX: 0.18, sunY: 0.86, templeX: 0.8 }, fogNear: 16, fogFar: 40 });
  if (!H) return false;
  const { kit, B } = H;
  H.ground({ mat: 'paving', color: '#8d7b64' });
  const top = H.block({ w: GAP * (n - 1) + 2.4, d: 2.6, steps: 3, stepH: 0.17, run: 0.3, drum: 0.42, bandFg: '#6e2f1c' });
  H.build(H.root);
  const geo = kit.geoLite;
  // the columns: instanced (one draw per part): base (torus and plinth), fluted shaft, capital (echinus + abacus), a bronze bowl on three legs
  const baseG = mergeParts([[boxGeo(R0 * 2.9, 0.14, R0 * 2.9), mat4(0, 0.07, 0)], [latheGeo([[0.0001, 0], [R0 * 1.3, 0], [R0 * 1.3, 0.05], [R0 * 1.18, 0.12], [R0 * 1.06, 0.17], [0.0001, 0.17]], geo ? 12 : 24), mat4(0, 0.14, 0)]]);
  const capG = mergeParts([[latheGeo([[R0 * 0.8, 0], [R0 * 0.86, 0.05], [R0 * 1.02, 0.14], [R0 * 1.28, 0.25], [R0 * 1.36, 0.29], [0.0001, 0.29]], geo ? 12 : 24)], [boxGeo(R0 * 2.9, 0.18, R0 * 2.9), mat4(0, 0.38, 0)]]);
  const bowlG = mergeParts([[latheGeo([[0.0001, 0], [0.14, 0.01], [0.38, 0.12], [0.5, 0.26], [0.56, 0.3], [0.5, 0.3], [0.0001, 0.14]], geo ? 12 : 22), mat4(0, 0.3, 0)],
    ...[0, 1, 2].map((k) => [new THREE.CylinderGeometry(0.025, 0.035, 0.36, 6), mat4(Math.sin(k * 2.094) * 0.3, 0.17, Math.cos(k * 2.094) * 0.3, 0, 1, -Math.cos(k * 2.094) * 0.3, Math.sin(k * 2.094) * 0.3)])]);
  const marble = kit.mat('marble', { color: '#efe7d8' });
  const parts = {
    base: new THREE.InstancedMesh(baseG, marble, Math.max(1, n)),
    shaft: new THREE.InstancedMesh(shaftGeo({ h: SH, r: R0, flutes: 20, lite: geo, rows: 2 }), marble, Math.max(1, n)),
    cap: new THREE.InstancedMesh(capG, marble, Math.max(1, n)),
    bowl: new THREE.InstancedMesh(bowlG, kit.mat('bronze'), Math.max(1, n)),
    ash: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.4, 0.05, geo ? 12 : 20), kit.mat('iron', { color: '#2e241c', rough: 0.9, metal: 0 }), Math.max(1, n)),
  };
  const xs = list.map((c, i) => (i - (n - 1) / 2) * GAP);
  xs.forEach((x, i) => {
    parts.base.setMatrixAt(i, mat4(x, top, 0)); parts.shaft.setMatrixAt(i, mat4(x, top + 0.31, 0, i * 0.3));
    parts.cap.setMatrixAt(i, mat4(x, top + 0.31 + SH, 0)); parts.bowl.setMatrixAt(i, mat4(x, top + 0.31 + SH + 0.47, 0)); parts.ash.setMatrixAt(i, mat4(x, top + 0.31 + SH + 0.47 + 0.55, 0));
  });
  for (const k in parts) { const m = parts[k]; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = H.shadows; m.receiveShadow = H.shadows; H.root.add(m); }
  // the flames (only over a bot that reported) with their warm light
  const groups = list.map((c, i) => {
    const flame = flameMesh({ size: 1.05 }); flame.position.set(xs[i], top + 0.31 + SH + 0.47 + 0.55, 0); H.root.add(flame);
    const light = new THREE.PointLight(0xffb866, 0, 9, 1.6); light.position.set(xs[i], top + SH + 1.9, 0.5); H.root.add(light);
    const u = { flame, light, lit: false, k: 0 }; apply(u, c); u.k = u.lit ? 1 : 0;
    return { userData: u, position: { x: xs[i] } };
  });
  H.blobs(xs.map((x) => [x, 0, 0.85, 1, top + 0.012]), { opacity: 0.5 });
  const embers = H.motes({ n: 40, center: [0, top + SH + 1.6, 0.2], box: [GAP * 2 + 2, 2.6, 2], color: '#ffb46a', size: 4, alpha: 0.55 });
  const tint = () => { groups.forEach((g, i) => { const c = SHADE.clone().lerp(WARM, g.userData.k); parts.shaft.setColorAt(i, c); parts.base.setColorAt(i, c); parts.cap.setColorAt(i, c); }); for (const k of ['shaft', 'base', 'cap']) if (parts[k].instanceColor) parts[k].instanceColor.needsUpdate = true; };
  tint();
  R = { H, groups, parts, dead: false };
  const reduce = H.reduce;
  H.start((dt, t) => {
    let moving = false;
    for (const g of groups) {
      const u = g.userData, want = u.lit ? 1 : 0;
      const d = want - u.k; if (Math.abs(d) > 0.01) { u.k += d * (reduce ? 1 : Math.min(1, dt * 2.5)); moving = true; } else u.k = want;
      u.flame.visible = u.k > 0.05;
      const flick = reduce || !u.lit ? 0 : Math.sin(t * 7.3 + g.position.x) * 0.06 + Math.sin(t * 11.7 + g.position.x * 2) * 0.04;
      u.flame.scale.set(0.85 + 0.15 * u.k - flick * 0.5, (0.55 + 0.45 * u.k + flick) * 1.1, 0.85 + 0.15 * u.k);
      u.light.intensity = (5 + flick * 14) * u.k;
    }
    tint(); embers.tick(t);
    return moving;
  });
  return true;
}

function update(cols) {
  if (!R) return;
  (cols || []).slice(0, 3).forEach((c, i) => { if (R.groups[i]) apply(R.groups[i].userData, c); });
  R.H.poke(2000);
}

function dispose() {
  if (!R) return;
  R.dead = true;
  try { R.H.dispose(); } catch (_) { /* nothing */ }
  R = null;
}

window.NQ3D = { mount, update, dispose, frames: () => (R ? R.H.frames : 0), lit: () => (R ? R.groups.map((g) => (g.userData.lit ? 1 : 0)) : []), stats: () => (R ? R.H.stats() : null), gold: GOLD };
window.__heroStats = () => (R ? R.H.stats() : null);
window.dispatchEvent(new Event('nq3d'));
