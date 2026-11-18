// EPILOGUE scene (ES module, optional): the week's scroll unrolling across a marble writing desk. The papyrus carries the seven days (Mon to Sun) in ink,
// a gold ribbon runs along it, and seven wax seals sit on the ribbon, one for each day of the week (olive = a winning day, terracotta = a losing day,
// bronze = no trade). Turned ivory rollers with gold finials, a bronze oil lamp and an inkwell with a reed pen on the desk, a lamp-lit archive behind.
// QA Round 6 bug 8: env-kit marble / wood / bronze and HDRI light, a painted hall backdrop (olympus/hero-stage.js createStage on the page's canvas).
// Warm 3000 K key light, warm fog, no bloom. If WebGL is missing the canvas is hidden and the page works without it. Reduced motion or LITE draws the
// scroll already unrolled (still frames only); a hidden tab draws nothing. three.js is Jarvis's copy.
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, mat4 } from '../olympus/hero-stage.js';

const O = window.OLYMPUS || null;
const cv = document.getElementById('stage'), box = cv ? cv.parentElement : null;
const W = 5.2, H = 2.6, R = 0.3, DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const st = { H: null, paper: null, ribbon: null, rollL: null, rollR: null, knots: [], k: 0, t0: 0, still: false, dead: false, ready: false, days: 0 };

function paintPaper(g, w, h) {
  const pg = g.createLinearGradient(0, 0, 0, h); pg.addColorStop(0, '#efe2c2'); pg.addColorStop(0.5, '#f5ead0'); pg.addColorStop(1, '#e6d4ac'); g.fillStyle = pg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(140,100,50,0.07)'; for (let i = 0; i < 1600; i++) g.fillRect((i * 97) % w, (i * 61) % h, 8, 1);
  g.strokeStyle = 'rgba(120,80,30,0.45)'; g.lineWidth = 3; g.strokeRect(20, 18, w - 40, h - 36);
  g.fillStyle = '#4a3218'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 ' + Math.round(h * 0.085) + 'px Georgia, "Times New Roman", serif';
  DAYS.forEach((d, i) => { const x = w * 0.1 + (w * 0.8 * i) / 6; g.fillText(d, x, h * 0.26); });
  g.fillStyle = 'rgba(74,50,24,0.35)'; for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) { const x = w * 0.1 + (w * 0.8 * i) / 6; g.fillRect(x - w * 0.045, h * (0.68 + r * 0.07), w * 0.09 * (0.5 + ((i * 7 + r * 3) % 5) / 10), 3); }
}

function build() {
  const lite = !!(O && O.lite && O.lite()), reduced = !!(O && O.reduced && O.reduced());
  st.still = lite || reduced;
  const Hs = createStage(box, { canvas: cv, reduce: st.still, tier: lite ? 'low' : undefined, palette: 'hall', hdri: 'golden', envI: 0.8, fit: { center: [0, 0.05, 0], size: [W + 1.2, H + 0.7, 1.4], pitch: 0.16, margin: 1.02 }, fov: 34,
    sway: 0.06, swayPeriod: 40, sunDir: [-0.45, 0.6, 0.7], key: 2.3, shadowExt: 5, sky: { sunX: 0.5, sunY: 0.5, temple: false, cypress: false, disc: false } });
  if (!Hs) throw new Error('no WebGL');
  const { kit, B } = Hs, scene = Hs.scene;
  Hs.key.color.setHex(0xffd7a0);                                    // the warm (about 3000 K) key light
  scene.fog = new THREE.Fog(scene.fog.color.getHex(), 9, 20);
  // the desk: a marble top on the ground plane behind the scroll, a bronze lamp, an inkwell and a reed pen
  const y0 = -H / 2 - 0.36;
  B.box('marble:uv', 0, y0 - 0.1, -0.3, W + 2.6, 0.2, 2.2, 0, '#e2d8c6');
  B.box('wood:uv', 0, y0 - 0.65, -0.3, W + 2.3, 0.9, 1.9, 0, '#5e3f26');
  B.lathe('bronze', [[0.0001, 0], [0.16, 0], [0.12, 0.05], [0.06, 0.1], [0.24, 0.16], [0.3, 0.2], [0.26, 0.24], [0.0001, 0.22]], W / 2 + 0.75, y0, -0.6, 1, 20);
  B.lathe('ink', [[0.0001, 0], [0.13, 0], [0.15, 0.1], [0.12, 0.2], [0.06, 0.22], [0.06, 0.26], [0.0001, 0.26]], -W / 2 - 0.75, y0, -0.5, 1, 18, '#2a1e18');
  B.add('wood', new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), mat4(-W / 2 - 0.68, y0 + 0.5, -0.5, 0, 1, 0.5, -0.35), '#c8b088');
  Hs.build(Hs.root);
  const marble = kit.mat('marble', { color: '#efe8da' }), gold = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.7 });
  const bronze = kit.mat('bronze');
  const sheet = kit.painted('paint:week', 1024, 512, paintPaper, { rough: 0.8, side: THREE.DoubleSide });
  // the paper: a plane that grows from the left roll to the right (its texture is cropped, never squashed)
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, H), sheet); paper.receiveShadow = Hs.shadows; Hs.root.add(paper); st.paper = paper;
  // two rolls with gold finials
  const roll = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H + 0.24, 28), marble));
    for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.07, 28), bronze); cap.position.y = s * (H / 2 + 0.15); g.add(cap);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), gold); fin.position.y = s * (H / 2 + 0.3); g.add(fin); } Hs.shade(g); Hs.root.add(g); return g; };
  st.rollL = roll(); st.rollR = roll();
  // the gold ribbon along the middle and seven wax seals
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.03), gold); Hs.root.add(ribbon); st.ribbon = ribbon;
  const seal = new THREE.CylinderGeometry(0.17, 0.19, 0.08, 24).rotateX(Math.PI / 2);
  const tones = { up: new THREE.MeshStandardMaterial({ color: 0x7f8a52, roughness: 0.45, metalness: 0.1 }), down: new THREE.MeshStandardMaterial({ color: 0xc96a4a, roughness: 0.45, metalness: 0.1 }), none: bronze };
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(seal, tones.none); m.castShadow = Hs.shadows; Hs.root.add(m); st.knots.push(m); }
  st.tones = tones; st.H = Hs;
  Hs.tune();
  Hs.blobs([[0, -0.1, W * 0.55, 0.6, y0 + 0.01, 0.5]], { opacity: 0.35 });
  layout(st.still ? 1 : 0);
}

/** k = how much of the scroll is unrolled (0..1) */
function layout(k) {
  const e = k * k * (3 - 2 * k), half = W / 2;
  st.rollL.position.set(-half - 0.05, 0, 0); st.rollR.position.set(-half + W * e + 0.05, 0, 0);
  st.paper.scale.x = Math.max(0.001, W * e); st.paper.position.x = -half + (W * e) / 2;
  const map = st.paper.material.map; if (map) { map.repeat.set(Math.max(0.001, e), 1); map.offset.set(0, 0); }
  st.ribbon.scale.x = Math.max(0.001, W * e * 0.94); st.ribbon.position.set(-half + (W * e) / 2, 0, 0.03);
  st.knots.forEach((m, i) => { const x = -half + W * 0.1 + (W * 0.8 * i) / 6; m.visible = x <= -half + W * e - 0.05; m.position.set(x, 0, 0.08); });
}

function paint(days) {
  if (!st.H) return;
  const d = Array.isArray(days && days.perDay) ? days.perDay : [], tr = Array.isArray(days && days.traded) ? days.traded : [];
  st.knots.forEach((m, i) => { m.material = !tr[i] ? st.tones.none : d[i] > 0 ? st.tones.up : d[i] < 0 ? st.tones.down : st.tones.none; m.scale.setScalar(tr[i] ? 1.15 : 0.8); });
  st.H.poke(600);
}

function start() {
  if (!cv || !box) return;
  try { build(); } catch (_) { box.classList.add('off'); return; }
  window.addEventListener('epilogue:model', (e) => { try { st.days = (e.detail && e.detail.traded || []).filter(Boolean).length; paint(e.detail); } catch (_) { /* keep the last picture */ } });
  window.addEventListener('pagehide', () => { st.dead = true; try { st.H.dispose(); } catch (_) { /* gone */ } });
  const m = window.EPILOGUE;
  if (m && m.S && m.S.model) paint({ perDay: m.S.model.perDay, traded: m.S.model.traded });
  st.H.start((dt, t) => {
    if (!st.t0) st.t0 = t || 0.0001;
    st.k = st.still ? 1 : Math.min(1, (t - st.t0) / 2.6);
    layout(st.k);
    if (!st.ready) { st.ready = true; document.documentElement.setAttribute('data-stage', 'on'); }
    return st.k < 1;
  });
  window.EPILOGUE3D = { ready: () => st.ready, unrolled: () => st.k, days: () => st.days, still: () => st.still, stats: () => (st.H ? st.H.stats() : null) };
  window.__heroStats = () => (st.H ? st.H.stats() : null);
}
start();
