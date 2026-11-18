// KAIROS scene (ES module): a marble horizontal sundial on a stepped round plinth. The dial face is a marble scan with the hours painted in
// (gold numerals, hour lines, the bots' entry window 02:00 to 15:30 as a gilded arc, a Greek-key rim). Twenty-four small fluted marble
// pillars with gilded capitals stand round the ring, one for each New York hour, midnight at the far side and clockwise like the 2D ring;
// the entry hours stand a little taller. The current hour's pillar is solid lit gold (goldLit, taller) with a warm light; the bronze
// gnomon's shadow and a gold hand point at the minute. The sky behind follows the New York hour (night, dawn, day, dusk).
// QA Round 6 bug 8: env-kit marble scans and HDRI light via olympus/hero-stage.js. No bloom, still on reduced motion, LITE (lite()) = the
// one-tap surfaces, a gradient light and fewer segments. No WebGL -> createSundial returns null (the page then shows the flat ring only).
// createSundial(canvas, { O }) -> { set(mod), hour(), lit(), frames(), dispose() }   mod = minutes since midnight New York
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, shaftGeo, latheGeo, boxGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

export const hourOf = (mod) => Math.floor((((mod % 1440) + 1440) % 1440) / 60);
export const pillarHeight = (h) => (h >= 2 && h < 16 ? 0.95 : 0.6);          // the entry hours (02:00 to 15:30) stand taller
const skyFor = (h) => (h < 5 || h >= 20 ? 'night' : h < 8 || h >= 17 ? 'dusk' : 'golden');
const RING = 2.72, DIAL = 3.45;

/** the painted dial (transparent outside the lines): hour lines, numerals, the entry window, a key rim */
function paintDial(g, W) {
  const c = W / 2, k = W / (DIAL * 2), at = (a, r) => [c + Math.sin(a) * r * k, c - Math.cos(a) * r * k];
  g.clearRect(0, 0, W, W);
  // the entry window 02:00 -> 15:30: a gilded band
  g.lineWidth = 0.2 * k; g.strokeStyle = 'rgba(200,160,70,0.55)'; g.beginPath(); g.arc(c, c, 2.25 * k, (2 / 24) * Math.PI * 2 - Math.PI / 2, (15.5 / 24) * Math.PI * 2 - Math.PI / 2); g.stroke();
  g.lineWidth = 0.02 * k; g.strokeStyle = 'rgba(120,80,30,0.7)'; for (const r of [2.14, 2.36]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
  // hour lines from the centre ring to the numerals, half hours shorter
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, full = i % 2 === 0, p0 = at(a, full ? 0.75 : 1.6), p1 = at(a, 2.1);
    g.strokeStyle = full ? 'rgba(90,60,25,0.55)' : 'rgba(90,60,25,0.3)'; g.lineWidth = (full ? 0.022 : 0.014) * k; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
  }
  // numerals (every hour, the big four larger)
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2, p = at(a, 1.86), big = h % 6 === 0;
    g.save(); g.translate(p[0], p[1]); g.rotate(a); g.fillStyle = big ? '#7a5418' : 'rgba(110,76,28,0.9)';
    g.font = '700 ' + Math.round((big ? 0.3 : 0.2) * k) + 'px Georgia, "Times New Roman", serif'; g.fillText(String(h).padStart(2, '0'), 0, 0); g.restore();
  }
  // the key rim near the edge
  g.strokeStyle = 'rgba(122,58,34,0.75)'; g.lineWidth = 0.035 * k; const r0 = 3.05, r1 = 3.3, n = 72;
  g.beginPath(); for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const P = [at(a0, r0), at(a0, r1), at(a1, r1), at(a1, (r0 + r1) / 2), at(a2 - 0.02, (r0 + r1) / 2)]; g.moveTo(P[0][0], P[0][1]); for (let j = 1; j < P.length; j++) g.lineTo(P[j][0], P[j][1]); }
  g.stroke();
  for (const r of [2.98, 3.37]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
}

export function createSundial(canvas, { O = null } = {}) {
  const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
  const H = createStage(canvas, { canvas, tier: lite() ? 'low' : undefined, reduce: reduced(), palette: 'golden', hdri: 'golden', fit: { center: [0, 0.75, 0], size: [8.4, 1.6, 8.4], pitch: 0.72, margin: 1.0 }, fov: 32, sway: 0.16, swayPeriod: 40, sunDir: [-0.55, 0.75, 0.45], shadowExt: 4.5, sky: { sunX: 0.24, sunY: 0.7, templeX: 0.8, horizon: 0.42 }, fogNear: 11, fogFar: 26 });
  if (!H) return null;
  const { kit, B } = H, seg = lite() ? 40 : 72;
  H.ground({ mat: 'grass', color: '#5a5a30', r: 26 });
  B.add('cobble:uv', new THREE.CircleGeometry(DIAL + 2.2, seg).rotateX(-Math.PI / 2), mat4(0, 0.01, 0), '#a49580');
  B.add('ashlar:uv', new THREE.RingGeometry(DIAL + 2.2, DIAL + 2.45, seg).rotateX(-Math.PI / 2), mat4(0, 0.02, 0), '#cfc0a4');
  // the dial body: a turned marble disc on two steps (one LatheGeometry), a bronze rim, the painted face
  B.add('marble:uv', new THREE.CylinderGeometry(DIAL + 0.75, DIAL + 0.8, 0.14, seg), mat4(0, 0.07, 0), '#cbbfa9');
  B.add('marble:uv', new THREE.CylinderGeometry(DIAL + 0.42, DIAL + 0.45, 0.14, seg), mat4(0, 0.21, 0), '#d6cbb6');
  const prof = [[0.5, 0], [DIAL, 0], [DIAL + 0.1, 0.12], [DIAL - 0.05, 0.3], [0.5, 0.3]].map(([r, y]) => new THREE.Vector2(r, y));
  B.add('marble:uv', new THREE.LatheGeometry(prof, seg), mat4(0, 0.28, 0), '#e6ddcc');
  B.add('marble:uv', new THREE.CircleGeometry(DIAL - 0.05, seg).rotateX(-Math.PI / 2), mat4(0, 0.581, 0), '#ece4d6');
  B.add('bronze', new THREE.TorusGeometry(DIAL + 0.02, 0.05, 8, seg), mat4(0, 0.47, 0, 0, 1, Math.PI / 2));
  H.build(H.root);
  const face = kit.painted('paint:dial', 1024, 1024, paintDial, { rough: 0.5 }); face.transparent = true; face.depthWrite = false; face.polygonOffset = true; face.polygonOffsetFactor = -2;
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(DIAL * 2, DIAL * 2).rotateX(-Math.PI / 2), face); facePlane.position.y = 0.584; facePlane.renderOrder = 2; facePlane.receiveShadow = H.shadows; H.root.add(facePlane);
  // the hour pillars: fluted marble shafts and gilded capitals (two instanced draws), the lit hour in solid gold
  const marble = kit.mat('marble', { color: '#efe8da' }), gold = kit.mat('gold');
  const shaftG = shaftGeo({ h: 1, r: 0.1, flutes: 12, lite: kit.geoLite, rows: 1 });
  const capG = mergeParts([[latheGeo([[0.085, 0], [0.12, 0.05], [0.14, 0.07], [0.0001, 0.07]], 12)], [boxGeo(0.3, 0.05, 0.3), mat4(0, 0.095, 0)]]);
  const shafts = new THREE.InstancedMesh(shaftG, marble, 24), caps = new THREE.InstancedMesh(capG, gold, 24);
  const goldLit = new THREE.MeshStandardMaterial({ color: '#ffd77a', roughness: 0.28, metalness: 0.85, emissive: '#c88a30', emissiveIntensity: 0.55, envMapIntensity: 1.1 });
  const litShaft = new THREE.Mesh(shaftGeo({ h: 1, r: 0.12, flutes: 12, lite: kit.geoLite, rows: 1 }), goldLit), litCap = new THREE.Mesh(capG, goldLit);
  [shafts, caps, litShaft, litCap].forEach((m) => { m.frustumCulled = false; m.castShadow = H.shadows; H.root.add(m); });
  const pillars = [];
  for (let h = 0; h < 24; h++) { const a = (h / 24) * Math.PI * 2, Hh = pillarHeight(h); pillars.push({ a, H: Hh, x: Math.sin(a) * RING, z: -Math.cos(a) * RING }); }
  // the gnomon (a bronze triangle on the centre boss), its shadow (a soft wedge) and the gold hand
  const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(1.25, 0); tri.lineTo(0, 1.05); tri.closePath();
  const gnoG = new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }); gnoG.translate(0, 0, -0.025);
  const gnomon = new THREE.Mesh(gnoG, kit.mat('bronze')); gnomon.position.y = 0.66; gnomon.rotation.y = Math.PI / 2; gnomon.castShadow = H.shadows; H.root.add(gnomon);       // points to the far side (midnight)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.14, 32), kit.mat('bronze')); hub.position.y = 0.65; H.root.add(hub);
  const wedgeShape = new THREE.Shape(); wedgeShape.moveTo(-0.06, 0); wedgeShape.lineTo(0.06, 0); wedgeShape.lineTo(0.22, 2.25); wedgeShape.lineTo(-0.22, 2.25); wedgeShape.closePath();
  const shadowCv = document.createElement('canvas'); shadowCv.width = 8; shadowCv.height = 64; { const sg = shadowCv.getContext('2d'), gr = sg.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0.05)'); sg.fillStyle = gr; sg.fillRect(0, 0, 8, 64); }
  const shTex = new THREE.CanvasTexture(shadowCv);
  const wedgeG = new THREE.ShapeGeometry(wedgeShape); { const p = wedgeG.getAttribute('position'), uv = wedgeG.getAttribute('uv'); for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, p.getY(i) / 2.25); }
  wedgeG.rotateX(-Math.PI / 2);
  const wedge = new THREE.Mesh(wedgeG, new THREE.MeshBasicMaterial({ map: shTex, color: '#2a1a0c', transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  wedge.position.y = 0.59; wedge.renderOrder = 3; H.root.add(wedge);
  const hand = new THREE.Mesh(new THREE.ConeGeometry(0.06, 2.0, 4).rotateX(-Math.PI / 2).translate(0, 0, -1.0), goldLit); hand.position.y = 0.74; H.root.add(hand);
  const glow = new THREE.PointLight('#ffc060', 0, 3.2, 1.6); H.root.add(glow);
  H.blobs([[0, 0, DIAL + 1.1, 0.7, 0.012]], { opacity: 0.35 });
  const motes = H.motes({ n: 32, center: [0, 1.6, 0], box: [7, 2.6, 6], size: 3.5, alpha: 0.35 });
  let mod = 0, lit = -1, sky = '';
  function placePillars() {
    pillars.forEach((p, h) => {
      const tall = h === lit ? p.H * 1.5 : p.H, show = h === lit ? 0 : 1;
      shafts.setMatrixAt(h, mat4(p.x, 0.58, p.z, p.a, [show, tall, show])); caps.setMatrixAt(h, mat4(p.x, 0.58 + tall, p.z, p.a, show));
    });
    shafts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    const p = pillars[lit], tall = p.H * 1.5; litShaft.position.set(p.x, 0.58, p.z); litShaft.scale.set(1, tall, 1); litCap.position.set(p.x, 0.58 + tall, p.z);
    glow.position.set(p.x * 1.05, 0.58 + tall + 0.45, p.z * 1.05); glow.intensity = 3.2;
  }
  function apply() {
    const h = hourOf(mod), a = (mod / 1440) * Math.PI * 2;
    if (h !== lit) { lit = h; placePillars(); const s = skyFor(h); if (s !== sky) { sky = s; H.setSky(s); } }
    wedge.rotation.y = -a; hand.rotation.y = -a;           // a = 0 -> the far side (midnight), clockwise from above
    H.poke(800);
  }
  apply();
  H.start((dt, t) => { motes.tick(t); return false; });
  return {
    set(m) { const v = typeof m === 'number' && Number.isFinite(m) ? m : 0; if (v !== mod) { mod = v; apply(); } },
    hour: () => hourOf(mod), lit: () => lit, frames: () => H.frames, stats: () => H.stats(),
    dispose() { try { shTex.dispose(); H.dispose(); } catch (_) { /* gone */ } },
  };
}
