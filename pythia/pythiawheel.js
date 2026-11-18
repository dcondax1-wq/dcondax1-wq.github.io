// PYTHIA's marble wheel of days (three.js r160 from ../jarvis/, the OLYMPUS render core + the hero stage kit): Delphi's round altar of fourteen days.
// A stepped marble plinth with a Greek-key band carries a painted marble dial: fourteen sectors, one for each of the next 14 days, each with its weekday
// and date in gold-brown numerals, today's sector gilded, the closed days washed in lapis. In each sector stands a fluted pillar of coloured marble:
//   rosso antico (red) and tall = a big release, giallo antico (ochre) = a medium day, verde antico (green) and short = a light day,
//   a bronze stub = a calm day, lapis (blue) = the market is closed.  Every pillar wears a gilded capital; the selected day's pillar rises and its capital
// glows. Today stands at the top of the dial (the far side, as on the flat twin) and the days run clockwise; the wheel sways a little and never
// turns over, so the numbers stay upright.
// At the centre the Delphic omphalos (the navel stone, wrapped in its knotted fillet) under the Pythia's bronze tripod, and a gold hand points at today.
// QA Round 7 (team W): the Round 6 wheel (plain coloured cylinders on a bronze disc) did not impress; this is the hero-stage bar (env-kit marble scans,
// HDRI light, real props, the meaning painted on the dial). Budget: <= 20 draws, < 40k triangles. LITE (OLYMPUS.lite() or the low tier): the one-tap
// surfaces, a gradient light, fewer segments; reduced motion (RM): it stays still and draws only on change. No WebGL / render core -> the page draws the flat twin.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, shaftGeo, latheGeo, boxGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const GOLD = '#c8a24a';
// the coloured marbles (a tint over the white marble scan): the same risk colours as the flat twin and the day buttons, in stone
const MARBLE = { high: '#c45a40', med: '#d9b05a', low: '#8a9a5a', calm: '#9c6b3c', closed: '#5b84a6' };
const HEIGHT = { high: 1.5, med: 0.95, low: 0.55, calm: 0.2, closed: 0.35 };
const R_PIL = 1.62, DIAL = 2.42, LIFT = 0.28;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** the painted dial (transparent outside the paint): sector lines, a weekday + date per sector, today's sector gilded, closed days in lapis, a key rim */
function paintDial(g, W, days) {
  const N = days.length || 14, c = W / 2, k = W / (DIAL * 2), at = (a, r) => [c + Math.sin(a) * r * k, c - Math.cos(a) * r * k];   // canvas up = the far side
  const half = Math.PI / N;
  g.clearRect(0, 0, W, W);
  const wash = (i, col) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; g.fillStyle = col; g.beginPath(); g.arc(c, c, 2.3 * k, a - half, a + half); g.arc(c, c, 0.62 * k, a + half, a - half, true); g.closePath(); g.fill(); };
  days.forEach((d, i) => { if (d && d.risk === 'closed') wash(i, 'rgba(70,110,150,0.22)'); });
  wash(0, 'rgba(214,170,70,0.42)');                                          // today (the wheel starts at today)
  // the rings and the sector lines
  g.strokeStyle = 'rgba(96,66,28,0.7)'; g.lineWidth = 0.022 * k;
  for (const r of [0.62, 1.2, 2.3]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 0.016 * k; g.strokeStyle = 'rgba(96,66,28,0.5)';
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + half, p0 = at(a, 0.62), p1 = at(a, 2.3); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
  // the weekday and the date of each sector, upright for a reader outside the ring
  g.textAlign = 'center'; g.textBaseline = 'middle';
  days.forEach((d, i) => {
    const a = (i / N) * Math.PI * 2, p = at(a, 2.03), ymd = String((d && d.ymd) || ''), day = +ymd.slice(8, 10) || '', dw = d && d.dow != null ? DOW[d.dow] || '' : '';
    g.save(); g.translate(p[0], p[1]);                                        // upright for the reader in front (the wheel only sways, it never turns over)
    g.fillStyle = i === 0 ? '#6a4310' : 'rgba(92,62,24,0.95)'; g.font = '700 ' + Math.round(0.29 * k) + 'px Georgia, "Times New Roman", serif'; g.fillText(String(day), 0, 0.02 * k);
    g.fillStyle = i === 0 ? '#7a4f14' : 'rgba(110,78,34,0.85)'; g.font = '700 ' + Math.round(0.15 * k) + 'px Georgia, serif'; g.fillText(i === 0 ? 'TODAY' : dw.toUpperCase(), 0, -0.24 * k);
    g.restore();
    // a small dot per event in the inner ring (how many releases that day)
    const n = Math.min(4, (d && d.events && d.events.length) || 0);
    for (let j = 0; j < n; j++) { const aa = a + (j - (n - 1) / 2) * 0.07, pp = at(aa, 0.9); g.fillStyle = 'rgba(140,60,36,0.8)'; g.beginPath(); g.arc(pp[0], pp[1], 0.035 * k, 0, Math.PI * 2); g.fill(); }
  });
  // the key rim near the edge
  g.strokeStyle = 'rgba(122,58,34,0.75)'; g.lineWidth = 0.03 * k; const r0 = 2.33, r1 = 2.4, n = 56;
  g.beginPath(); for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const P = [at(a0, r0), at(a0, r1), at(a1, r1), at(a1, (r0 + r1) / 2), at(a2 - 0.02, (r0 + r1) / 2)]; g.moveTo(P[0][0], P[0][1]); for (let j = 1; j < P.length; j++) g.lineTo(P[j][0], P[j][1]); }
  g.stroke();
}
/** the omphalos' knotted fillet (agrenon): a net of raised bands over the marble egg, painted on its own texture (u round, v up) */
function paintNet(g, w, h) {
  g.fillStyle = '#e7dfcf'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150,120,70,0.9)'; g.lineWidth = w / 110;
  for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo((i * w) / 8, h); g.lineTo(((i + 4) * w) / 8, 0); g.stroke(); g.beginPath(); g.moveTo((i * w) / 8, 0); g.lineTo(((i + 4) * w) / 8, h); g.stroke(); }
  g.fillStyle = 'rgba(200,162,74,0.95)'; for (let i = 0; i < 16; i++) for (let j = 1; j < 4; j++) { g.beginPath(); g.arc(((i + (j % 2) * 0.5) * w) / 8, (j * h) / 4, w / 70, 0, Math.PI * 2); g.fill(); }
}

function createWheel(canvas, days, opts) {
  const o = opts || {}, O = window.OLYMPUS || null, RM = o.reduced === true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a140e');
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 40); camera.position.set(0, 4.5, 6.5); camera.lookAt(0, 0.42, 0);
  const rc = createRenderer({ canvas, scene, camera, maxDpr: 1.5, tint: GOLD, theme: { sky: '#2b2018', fog: '#2a2018', emissive: GOLD, bloom: '#e0b060', accent: GOLD }, bloom: { strength: 0.18, radius: 0.4, threshold: 1.0 } });
  let oLite = false; try { oLite = !!(O && O.lite && O.lite()); } catch (_) { oLite = false; }
  const lite = oLite || rc.quality() === 'low' || rc.quality() === 'off';
  const D = dress({ rc, scene, camera, tier: lite ? 'low' : undefined, palette: 'dusk', hdri: 'golden', envI: 0.95, sunDir: [-0.55, 0.7, 0.5], key: 2.5, hemi: 0.55, shadowExt: 3.6, metalEnv: 1.8,
    sky: { sunX: 0.2, sunY: 0.78, templeX: 0.82, horizon: 0.42 }, fogNear: 10, fogFar: 24 });
  const { kit, B } = D, seg = lite ? 40 : 72;
  // ---- the static set: the paved ground, the stepped marble plinth with its key band and gold fillet, two bronze braziers at the back
  D.ground({ mat: 'paving', color: '#8a7860', y: -0.37, r: 22 });
  const top = D.plinth({ r: 2.5, y: -0.37, steps: 2, stepH: 0.12, run: 0.26, drum: 0.2 });
  for (const sx of [-1, 1]) B.brazier({ x: sx * 3.9, z: -1.6, h: 0.95, r: 0.26 });
  D.build(scene);
  // ---- the turning wheel: the painted dial face, the omphalos and the tripod at the centre, the pillars, the today ring and the hand
  const root = new THREE.Group(); root.position.y = top; scene.add(root);
  const face = kit.painted('paint:pythia-dial', 1024, 1024, (g, w) => paintDial(g, w, days), { rough: 0.5 });
  face.transparent = true; face.depthWrite = false; face.polygonOffset = true; face.polygonOffsetFactor = -2;
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(DIAL * 2, DIAL * 2).rotateX(-Math.PI / 2), face); facePlane.position.y = 0.003; facePlane.renderOrder = 2; facePlane.receiveShadow = D.shadows; root.add(facePlane);
  const W = kit.builder();
  W.add('marble:uv', new THREE.CylinderGeometry(0.62, 0.66, 0.08, seg), mat4(0, 0.04, 0), '#d9cfbd');                      // the centre boss
  kit.painted('paint:pythia-net', 256, 128, paintNet, { rough: 0.55 });
  W.add('paint:pythia-net', latheGeo([[0.0001, 0], [0.34, 0], [0.4, 0.12], [0.39, 0.28], [0.3, 0.44], [0.16, 0.54], [0.0001, 0.57]], lite ? 18 : 32), mat4(0, 0.08, 0));   // the omphalos
  W.add('gold', new THREE.TorusGeometry(0.4, 0.02, 6, lite ? 24 : 48), mat4(0, 0.2, 0, 0, 1, Math.PI / 2));
  // the Pythia's bronze tripod over the stone: three legs, a shallow cauldron with ring handles
  for (let k2 = 0; k2 < 3; k2++) { const a = k2 * 2.094 + 0.5; W.add('bronze', new THREE.CylinderGeometry(0.018, 0.026, 0.95, 6), mat4(Math.sin(a) * 0.36, 0.55, Math.cos(a) * 0.36, 0, 1, -Math.cos(a) * 0.17, Math.sin(a) * 0.17)); }
  W.add('bronze', latheGeo([[0.0001, 0], [0.12, 0.01], [0.3, 0.1], [0.36, 0.2], [0.38, 0.22], [0.34, 0.22]], lite ? 14 : 28), mat4(0, 0.92, 0));
  for (const s of [-1, 1]) W.add('bronze', new THREE.TorusGeometry(0.08, 0.012, 5, 12), mat4(s * 0.36, 1.2, 0, Math.PI / 2));
  W.build(root); D.shade(root, true, true);
  // the pillars: fluted marble shafts in the coloured marbles and gilded capitals (two instanced draws); the selected one's capital glows
  const N = days.length;
  const shaftG = shaftGeo({ h: 1, r: 0.13, flutes: 12, lite: kit.geoLite, rows: 1, taper: 0.9 });
  const capG = mergeParts([[latheGeo([[0.115, 0], [0.135, 0.035], [0.16, 0.06], [0.0001, 0.06]], 12)], [boxGeo(0.29, 0.045, 0.29), mat4(0, 0.082, 0)]]);
  const baseG = latheGeo([[0.0001, 0], [0.19, 0], [0.19, 0.03], [0.16, 0.05], [0.15, 0.07], [0.0001, 0.07]], 12);
  const shafts = new THREE.InstancedMesh(shaftG, kit.mat('marble', { color: '#ffffff' }), Math.max(1, N));
  const capGold = new THREE.MeshStandardMaterial({ color: lite ? '#e6c26a' : '#d4ae58', roughness: 0.32, metalness: lite ? 0.35 : 0.95, envMapIntensity: 1.8 });
  const caps = new THREE.InstancedMesh(capG, capGold, Math.max(1, N)), bases = new THREE.InstancedMesh(baseG, kit.mat('bronze'), Math.max(1, N));
  const goldLit = new THREE.MeshStandardMaterial({ color: '#ffd77a', roughness: 0.28, metalness: 0.85, emissive: '#c88a30', emissiveIntensity: 0.6, envMapIntensity: 1.2 });
  const litCap = new THREE.Mesh(capG, goldLit); litCap.visible = false;
  [shafts, caps, bases, litCap].forEach((m) => { m.frustumCulled = false; m.castShadow = D.shadows; root.add(m); });
  const tint = new THREE.Color(), base = new THREE.Color('#d8cfbf');            // the marble scan's mean colour (env-kit TEX.marble)
  const pillars = days.map((d, i) => {
    const a = (i / N) * Math.PI * 2, h = HEIGHT[d.risk] || 0.2, x = Math.sin(a) * R_PIL, z = -Math.cos(a) * R_PIL;         // today at the top of the dial (the far side), the days clockwise like the flat twin
    const c = new THREE.Color(MARBLE[d.risk] || MARBLE.calm); tint.setRGB(Math.min(4, c.r / Math.max(0.01, base.r)), Math.min(4, c.g / Math.max(0.01, base.g)), Math.min(4, c.b / Math.max(0.01, base.b)));
    shafts.setColorAt(i, tint); bases.setMatrixAt(i, mat4(x, 0, z));
    return { i, h, x, z, a, y: 0 };
  });
  bases.instanceMatrix.needsUpdate = true; if (shafts.instanceColor) shafts.instanceColor.needsUpdate = true;
  // today's gold ring round its pillar's foot, the gold hand from the omphalos to today
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 32), kit.mat('gold')); ring.rotation.x = Math.PI / 2; ring.position.set(pillars[0] ? pillars[0].x : 0, 0.02, pillars[0] ? pillars[0].z : -R_PIL); root.add(ring);
  const hand = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.45 - 0.62), goldLit); hand.position.y = 0.09; root.add(hand);
  const glow = new THREE.PointLight('#ffc060', 0, 2.4, 1.6); root.add(glow);
  D.blobs([[0, 0, 3.4, 0.7, -0.36]], { opacity: 0.45 });
  const motes = lite ? null : D.motes({ n: 26, center: [0, 1.2, 0], box: [5, 2, 4], size: 3.2, alpha: 0.32 });
  D.tune();

  let sel = -1, spin = 0, dirty = true, disposed = false, t0 = performance.now();
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const yOf = (p) => (p.i === sel ? LIFT : 0);
  function place(snap) {
    let moving = false;
    for (const p of pillars) {
      const to = yOf(p), d = to - p.y; if (Math.abs(d) > 0.003 && !snap && !RM) { p.y += d * 0.25; moving = true; } else p.y = to;
      shafts.setMatrixAt(p.i, mat4(p.x, p.y + 0.07, p.z, p.a, [1, p.h, 1])); caps.setMatrixAt(p.i, mat4(p.x, p.y + 0.07 + p.h, p.z, p.a, p.i === sel ? 0.0001 : 1));
      if (p.i === sel) { litCap.position.set(p.x, p.y + 0.07 + p.h, p.z); litCap.rotation.y = p.a; litCap.visible = true; glow.position.set(p.x * 1.05, p.y + p.h + 0.5, p.z * 1.05); glow.intensity = 2.2; }
    }
    if (sel < 0) { litCap.visible = false; glow.intensity = 0; }
    shafts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    return moving;
  }
  function apply(snap) { root.rotation.y = spin; return place(snap); }
  function resize() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || 210; camera.aspect = w / h; const far = w / h < 1.3 ? 1 + (1.3 - w / h) * 0.6 : 1; camera.position.set(0, 4.5 * far, 6.5 * far); camera.lookAt(0, 0.42, 0); camera.updateProjectionMatrix(); rc.resize(w, h); D.backdrop(w, h); dirty = true; }
  D.envReady.then(() => { dirty = true; });
  setTimeout(() => { dirty = true; }, 1500); setTimeout(() => { dirty = true; }, 4000);              // the scans arrive later: draw again (reduced motion too)
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  function pick(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1)); ray.setFromCamera(ptr, camera);
    root.updateMatrixWorld(true);
    const hit = ray.intersectObjects([shafts, caps, litCap], false)[0];
    if (!hit) return;
    let i = hit.instanceId; if (hit.object === litCap) i = sel;
    if (i != null && i >= 0 && o.onPick) o.onPick(i);
  }
  canvas.addEventListener('pointerup', pick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas);
  resize(); apply(true);

  let last = performance.now(), lastTick = 0;
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const gap = O && O.frameGap ? O.frameGap() : 0;
    if ((O ? O.hidden() : document.hidden) || (gap && now - lastTick < gap - 3)) return;
    lastTick = now;
    if (!RM) { spin = Math.sin(((now - t0) / 1000) * (Math.PI * 2 / 36)) * 0.16; dirty = true; if (motes) motes.tick(now / 1000); }   // a slow sway: today stays at the top, the numbers stay upright
    const moving = apply(false); if (dirty || moving) { rc.render(); dirty = moving; }
  }
  requestAnimationFrame(loop);
  return {
    lite, count: pillars.length, quality: () => rc.quality(), passes: () => rc.passes(),
    select(i) { sel = i; dirty = true; }, get selected() { return sel; },
    screenOf(i) { const p = pillars[i]; if (!p) return null; root.updateMatrixWorld(true); const v = new THREE.Vector3(p.x, p.y + 0.07 + p.h / 2, p.z).applyMatrix4(root.matrixWorld); v.project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 }; },
    stats: () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls }),
    dispose() { disposed = true; canvas.removeEventListener('pointerup', pick); if (ro) ro.disconnect(); try { scene.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); goldLit.dispose(); capGold.dispose(); D.dispose(); rc.dispose(); } catch (_) { /* gone */ } },
  };
}
window.PYTHIA_WHEEL = { createWheel };   // read by pythia.js (a second module tag, so a failed 3D load never stops the page)
