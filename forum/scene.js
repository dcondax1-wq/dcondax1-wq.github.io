// FORUM scene (ES module): a Roman forum at the hour it really is in New York, on the OLYMPUS render core.
//   the sky       a dome that follows the New York clock (night, dawn, pre-market, day, dusk); the Council's verdict tints the horizon
//   the avenue    a marble way between two colonnades, six pillars with a glowing tablet each (the briefing), torches
//   the rostrum   a lectern with the glowing oath scroll
//   the temple    the Curia at the end of the way; its doors open when the oath is sealed (the day's gate to the market)
// createForum(canvas, { O }) -> { setScrolls(items), setClock({ h, tone }), focus(i), openGates(open), onPick(cb), onQuality(cb), lite(), quality(), stats(), dispose() }
// i: 0..5 a pillar, 6 the rostrum, -1 the overview. Reduced motion: the camera cuts instead of gliding, torches and stars hold still.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as FX from '../olympus/fx-atmos.js';        // JOB 4+5 follow-up: sun shafts, dust in them, torch embers, contact shadows, a polished avenue
const AG_THEME = { sky: '#3a2c1e', fog: '#2a2118', emissive: '#c8a24a', bloom: '#c8a24a', accent: '#c8a24a' };   // AGORA: warm dusk, no violet rims

const TAU = Math.PI * 2;
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const TONE = { calm: '#aeb86e', watch: '#e0b060', storm: '#c96a4a', info: '#8b7259' };
const PIL = [[-3.4, 3], [3.4, 3], [-3.4, -3], [3.4, -3], [-3.4, -9], [3.4, -9]];     // x, z of the six pillars
const ROSTRUM_Z = -14, TEMPLE_Z = -27;
// [hour, top, middle, horizon]: the sky colours through the New York day
const SKY = [[0, '#13100d', '#171410', '#2e2720'], [3, '#13100d', '#221d18', '#393028'], [5, '#302922', '#9c6b3c', '#c96a4a'], [7, '#8b7259', '#8b7259', '#e0b060'],
  [10, '#8b7259', '#8b7259', '#f3ece0'], [15, '#8b7259', '#8b7259', '#f3ece0'], [17, '#8b7259', '#c96a4a', '#e0b060'], [19, '#362e25', '#9c6b3c', '#c96a4a'], [21, '#13100d', '#221d18', '#393028'], [24, '#13100d', '#171410', '#2e2720']];
function skyAt(h) {
  let i = 0; while (i < SKY.length - 2 && h >= SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  return [1, 2, 3].map((k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t));
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** a tablet's face: the glyph, the title and the reading, drawn once on a canvas (text from the page's own strings) */
function tabletTexture(item) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), col = TONE[item.tone] || TONE.info;
  g.fillStyle = 'rgba(21, 18, 15,.92)'; g.fillRect(0, 0, 512, 256);
  const grad = g.createLinearGradient(0, 0, 512, 256); grad.addColorStop(0, col + '33'); grad.addColorStop(1, col + '05'); g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(10, 10, 492, 236);
  g.fillStyle = item.color || col; g.font = '800 120px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(item.glyph || '', 92, 128);
  g.textAlign = 'left'; g.fillStyle = '#e6dbca'; g.font = '700 30px sans-serif'; g.fillText(String(item.title || '').toUpperCase().slice(0, 18), 170, 74);
  g.fillStyle = '#f3ece0'; let size = 56; g.font = `800 ${size}px sans-serif`;
  const stat = String(item.stat || '').slice(0, 20);
  while (g.measureText(stat).width > 320 && size > 26) { size -= 4; g.font = `800 ${size}px sans-serif`; }
  g.fillText(stat, 170, 142);
  g.fillStyle = col; g.font = '700 24px sans-serif'; g.fillText({ calm: 'CALM', watch: 'WATCH', storm: 'CAUTION', info: 'READ' }[item.tone] || 'READ', 170, 204);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createForum(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#13100d');
  scene.fog = new THREE.FogExp2(0x393028, 0.018);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  let fxList = [], lite = false, dirty = true, qcb = null, drawn = 0, frames = 0, stopped = false, raf = 0, pick = null;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', theme: AG_THEME, grade: { aberration: 0, saturation: 0.92 }, tint: '#aeb86e', exposure: 0.9, maxDpr: 1.75, bloom: { strength: 0.22, radius: 0.6, threshold: 0.95 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; flameN(); FX.setQuality(fxList, l); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';
  const glow = glowTexture();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);

  // ---- lights + the sky
  const hemi = new THREE.HemisphereLight('#8b7259', '#26201a', 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#e0b060', 1.4); scene.add(sun);
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.5, -1) }, sunCol: { value: new THREE.Color('#e0b060') }, glow: { value: 0.6 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor, sunDir, sunCol; uniform float glow; varying vec3 vD;
      void main(){ float y = clamp(vD.y, -0.2, 1.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.35, y)); c = mix(c, top, smoothstep(0.25, 0.9, y));
        float s = max(dot(normalize(vD), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 24.0) * 0.55 + pow(s, 6.0) * 0.18) * glow;
        gl_FragColor = vec4(c, 1.0); }` }));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#e0b060', 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunDisc.scale.set(46, 46, 1); scene.add(sunDisc);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#8b7259', 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  moon.scale.set(26, 26, 1); scene.add(moon);
  const stars = M.starfield({ count: 1300, radius: 250, size: 2.2, color: '#f0e2c4' }); scene.add(stars);

  // ---- the avenue: a marble way, a stone plaza, two colonnades
  const way = new THREE.Mesh(new THREE.PlaneGeometry(9, 80), M.marble({ color: '#c7bdaf', gold: true, scale: 0.7, roughness: 0.28 }));
  way.rotation.x = -Math.PI / 2; way.position.set(0, 0.01, -14); scene.add(way);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(90, 100), new THREE.MeshStandardMaterial({ color: '#322c26', roughness: 0.85 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -0.01, -14); scene.add(plaza);
  for (const x of [-4.55, 4.55]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 80), M.neon({ color: '#aeb86e', intensity: 1.8, fog: true })); edge.position.set(x, 0.05, -14); scene.add(edge);
  }
  const stone = M.marble({ color: '#c4bbac', gold: false, scale: 0.4, roughness: 0.36 });
  const NC = 9, colGeo = new THREE.CylinderGeometry(0.4, 0.46, 6.2, 14);
  const cols = new THREE.InstancedMesh(colGeo, stone, NC * 2), caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), M.metal({ kind: 'gold' }), NC * 2);
  const flames = [];
  let ci = 0;
  for (const x of [-6.6, 6.6]) for (let i = 0; i < NC; i++) {
    const z = 10 - i * 4.4;
    m4.makeTranslation(x, 3.1, z); cols.setMatrixAt(ci, m4); m4.makeTranslation(x, 6.4, z); caps.setMatrixAt(ci, m4); ci++;
    if (i % 2 === 0) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#e0b060', 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      f.position.set(x * 0.78, 2.7, z); f.scale.set(1.3, 1.8, 1); f.userData.ph = i * 1.9; scene.add(f); flames.push(f);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.34, 10), M.metal({ kind: 'gunmetal', color: '#8b7259' })); bowl.position.set(x * 0.78, 2.35, z); scene.add(bowl);
    }
  }
  scene.add(cols, caps);
  // the forum's air and light: shafts of sun through the colonnade, dust in them, embers off the torch bowls, a soft shadow under every column, a polished avenue
  setTimeout(() => {                                                // 0.9 s after the first paint
    const shafts = FX.shafts({ count: 5, from: [-9, 16, 4], to: [0, 0, -6], width: 5, spread: [10, 0, 22], color: '#e0b060', strength: 0.1, seed: 4 });
    const dust = FX.dust({ count: 240, box: [14, 7, 46], color: '#e0b060', size: 4, strength: 0.8, seed: 15 }); dust.object.position.set(0, 0, -12);
    const embers = FX.embers({ count: 140, origin: [-5.1, 2.5, -2], spread: [0.3, 0, 8], rise: 2.6, colors: ['#e0b060', '#e0b060', '#c96a4a'], size: 5.5, wind: 0.15, seed: 8 });
    const embers2 = FX.embers({ count: 140, origin: [5.1, 2.5, -2], spread: [0.3, 0, 8], rise: 2.6, colors: ['#e0b060', '#e0b060', '#c96a4a'], size: 5.5, wind: -0.15, seed: 19 });
    scene.add(shafts.object, dust.object, embers.object, embers2.object);
    fxList = [shafts, dust, embers, embers2];
    for (const x of [-6.6, 6.6]) for (let i = 0; i < NC; i += 2) { const ao = FX.contactAO({ radius: 0.9, strength: 0.7 }); ao.object.position.set(x, 0.03, 10 - i * 4.4); scene.add(ao.object); fxList.push(ao); }
    FX.setQuality(fxList, rc.quality()); dirty = true;
  }, 900);
  for (const x of [-6.6, 6.6]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 40), stone); beam.position.set(x, 6.9, -9); scene.add(beam); }
  const flameN = () => flames.forEach((f, i) => { f.visible = !lite || i % 2 === 0; });

  // ---- the six pillars and their tablets
  const plinth = M.marble({ color: '#d4cabb', gold: true, scale: 1.1 }), goldM = M.metal({ kind: 'gold' });
  const pillars = PIL.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), plinth); base.position.y = 0.22;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.2, 16), stone); col.position.y = 1.5;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9), goldM); cap.position.y = 2.7;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 40), new THREE.MeshBasicMaterial({ color: hdr('#8b7259', 2), transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    const tab = new THREE.Group(); tab.position.y = 4.1; tab.rotation.y = x < 0 ? 0.5 : -0.5;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.5, 0.12), goldM);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.28), new THREE.MeshBasicMaterial({ color: 0x14110e, toneMapped: true })); face.position.z = 0.07;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.4), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.scroll = i;
    tab.add(frame, face, hit);
    const beam = M.energyBeam({ color: '#8b7259', length: 1.35, radius: 0.1, intensity: 1.4, speed: 0.8 }); beam.position.y = 2.7;
    g.add(base, col, cap, ring, tab, beam); scene.add(g);
    return { g, tab, face, ring, beam, hit, item: null };
  });

  // ---- the rostrum: three steps, a lectern, the oath scroll
  const dais = new THREE.Group(); dais.position.set(0, 0, ROSTRUM_Z); scene.add(dais);
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * 0.55, 2.7 - i * 0.55, 0.3, 40), plinth); s.position.y = 0.15 + i * 0.3; dais.add(s); }
  const lect = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.7), stone); lect.position.y = 1.65; dais.add(lect);
  const scroll = new THREE.Group(); scroll.position.set(0, 2.9, 0); dais.add(scroll);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 20), new THREE.MeshStandardMaterial({ color: '#e0b060', roughness: 0.6, emissive: new THREE.Color('#e0b060'), emissiveIntensity: 0.9 }));
  roll.rotation.z = Math.PI / 2; scroll.add(roll);
  for (const sx of [-0.8, 0.8]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 20), goldM); cap.rotation.z = Math.PI / 2; cap.position.x = sx; scroll.add(cap); }
  const laurel = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.045, 8, 64), M.neon({ color: '#aeb86e', intensity: 2.4 })); laurel.position.y = 0; laurel.rotation.x = Math.PI / 2; scroll.add(laurel);
  const oathHit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); oathHit.userData.scroll = 6; scroll.add(oathHit);
  const oathLight = new THREE.PointLight('#e0b060', 14, 12, 1.6); oathLight.position.set(0, 3.4, ROSTRUM_Z + 0.6); scene.add(oathLight);

  // ---- the temple at the end of the way: steps, eight columns, a pediment, the doors
  const temple = new THREE.Group(); temple.position.set(0, 0, TEMPLE_Z); scene.add(temple);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(20 - i * 1.0, 0.35, 5 - i * 0.5), stone); s.position.set(0, 0.17 + i * 0.35, 2.4 - i * 0.2); temple.add(s); }
  const cella = new THREE.Mesh(new THREE.BoxGeometry(14, 8.6, 1), stone); cella.position.set(0, 5.7, -1.4); temple.add(cella);
  const tcols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.62, 7.4, 16), stone, 8);
  for (let i = 0; i < 8; i++) { m4.makeTranslation(-7.7 + i * 2.2, 5.1, 1.2); tcols.setMatrixAt(i, m4); }
  temple.add(tcols);
  const entab = new THREE.Mesh(new THREE.BoxGeometry(17.6, 1, 3), stone); entab.position.set(0, 9.2, 0.6); temple.add(entab);
  const gold1 = new THREE.Mesh(new THREE.BoxGeometry(17.7, 0.14, 3.1), goldM); gold1.position.set(0, 9.75, 0.6); temple.add(gold1);
  const ped = new THREE.Shape(); ped.moveTo(-8.8, 0); ped.lineTo(8.8, 0); ped.lineTo(0, 3.2); ped.lineTo(-8.8, 0);
  const pedMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 2.4, bevelEnabled: false }), stone); pedMesh.position.set(0, 9.8, -0.6); temple.add(pedMesh);
  const pedGlow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 40), M.neon({ color: '#e0b060', intensity: 3, fog: true })); pedGlow.position.set(0, 11.2, 1.85); temple.add(pedGlow);
  const doors = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 2.3, 0, 0.5);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.3, 6, 0.3), M.metal({ kind: 'gunmetal', color: '#362e26', roughness: 0.3 })); leaf.position.set(-s * 1.15, 3.35, 0);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.0, 5.7, 0.06), M.metal({ kind: 'gold', roughness: 0.4 })); trim.position.set(-s * 1.15, 3.35, 0.18);
    pivot.add(leaf, trim); temple.add(pivot); return { pivot, s };
  });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6), new THREE.MeshBasicMaterial({ color: hdr('#e0b060', 0.5), side: THREE.DoubleSide })); inner.position.set(0, 3.35, 0.2); temple.add(inner);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.9, 0.05), M.neon({ color: '#e0b060', intensity: 2.4, fog: true })); seam.position.set(0, 3.35, 0.7); temple.add(seam);
  const gateBeam = M.energyBeam({ color: '#e0b060', length: 18, radius: 1.9, taper: 1.6, intensity: 0.6, speed: 0.3 }); gateBeam.rotation.x = Math.PI / 2; gateBeam.position.set(0, 3.2, 0.6); gateBeam.visible = false; temple.add(gateBeam);
  const gateLight = new THREE.PointLight('#e0b060', 0, 40, 1.4); gateLight.position.set(0, 3.2, 3); temple.add(gateLight);

  // ---- petals when the gates open
  const petals = (() => {
    const n = 220, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glow, color: hdr('#aeb86e', 1.5), size: 0.34, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    pts.frustumCulled = false; scene.add(pts); return { pts, pos, vel, n, t: -1 };
  })();
  function bloomPetals() {
    const { pos, vel, n } = petals;
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 1.5 + Math.random() * 4; pos[i * 3] = (Math.random() - 0.5) * 3; pos[i * 3 + 1] = 2 + Math.random() * 3; pos[i * 3 + 2] = TEMPLE_Z + 1.5;
      vel[i * 3] = Math.cos(a) * s * 0.5; vel[i * 3 + 1] = Math.random() * 3; vel[i * 3 + 2] = 2 + Math.random() * 6; }
    petals.pts.geometry.attributes.position.needsUpdate = true; petals.t = 0; petals.pts.material.opacity = 1;
  }

  // ---- state: the scrolls, the clock, the gates, the camera
  const st = { items: [], focus: -1, gates: 0, gatesTarget: 0, h: 12, tone: 'watch' };
  const cam = { pos: new THREE.Vector3(0, 5.4, 16), look: new THREE.Vector3(0, 3.6, -8), tp: new THREE.Vector3(0, 5.4, 16), tl: new THREE.Vector3(0, 3.6, -8) };
  function overview() { cam.tp.set(0, 5.4, 16); cam.tl.set(0, 3.6, -8); }
  function setScrolls(items) {
    st.items = items;
    items.forEach((it, i) => {
      const P = pillars[i]; if (!P) return;
      P.item = it;
      if (P.face.material.map) P.face.material.map.dispose();
      P.face.material.map = tabletTexture(it); P.face.material.color.set(hdr('#f3ece0', 1.25)); P.face.material.needsUpdate = true;
      const c = new THREE.Color(TONE[it.tone] || TONE.info);
      P.ring.material.color.copy(c).multiplyScalar(2); P.beam.material.uniforms.uColor.value.copy(c);
    });
    dirty = true;
  }
  function setClock({ h, tone }) {
    st.h = h; if (tone) st.tone = tone;
    const [top, mid, hor] = skyAt(h);
    const tint = new THREE.Color(st.tone === 'calm' ? '#e0b060' : st.tone === 'storm' ? '#9c6b3c' : '#8b7259');
    hor.lerp(tint, h > 4 && h < 20 ? 0.22 : 0.08);
    skyU.top.value.copy(top); skyU.mid.value.copy(mid); skyU.hor.value.copy(hor);
    const t = (h - 6) / 12, up = t > 0 && t < 1, el = up ? Math.sin(Math.PI * t) : 0, az = Math.max(0, Math.min(1, t));
    const dir = new THREE.Vector3(Math.cos(Math.PI * (1 - az)) * 0.8, Math.max(0.02, el * 0.9), -0.9).normalize();
    skyU.sunDir.value.copy(dir); skyU.glow.value = up ? 0.9 : 0.1;
    sunDisc.position.copy(dir).multiplyScalar(260); sunDisc.visible = up; sun.position.copy(dir).multiplyScalar(40); sun.intensity = up ? 0.5 + 1.3 * el : 0.05;
    const warm = up && (el < 0.35) ? 1 : 0; sun.color.set(warm ? '#e0b060' : '#e0b060'); sunDisc.material.color.copy(hdr(warm ? '#e0b060' : '#e0b060', 2.2));
    moon.visible = !up; moon.position.set(-90, 120, -180);
    const night = up ? Math.max(0, 1 - el * 3) : 1;
    stars.material.uniforms.uColor.value.setScalar(0.9 * night); stars.visible = night > 0.05;
    hemi.intensity = 0.25 + 0.6 * (up ? el : 0); hemi.color.copy(top).lerp(new THREE.Color('#f3ece0'), 0.4); hemi.groundColor.copy(hor).multiplyScalar(0.25);
    scene.fog.color.copy(hor).multiplyScalar(0.55); scene.background.copy(hor);
    flames.forEach((f) => { f.material.opacity = 0.55 + 0.45 * night; });
    dirty = true;
  }
  function focus(i) {
    st.focus = i;
    if (i >= 0 && i < 6) { const [x, z] = PIL[i]; cam.tp.set(x * 0.2, 4.0, z + 7.2); cam.tl.set(x * 0.95, 3.9, z - 0.5); }
    else if (i === 6) { cam.tp.set(0, 3.6, ROSTRUM_Z + 6.8); cam.tl.set(0, 2.9, ROSTRUM_Z); }
    else overview();
    dirty = true;
  }
  function openGates(open) {
    const was = st.gatesTarget; st.gatesTarget = open ? 1 : 0;
    if (open && !was) { bloomPetals(); cam.tp.set(0, 3.3, ROSTRUM_Z + 2); cam.tl.set(0, 3.8, TEMPLE_Z); }
    else if (!open) overview();
    dirty = true;
  }
  function frameLive() { return !reduced(); }

  // ---- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    const d = down; down = null; if (!d || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 10) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...pillars.map((p) => p.hit), oathHit], false)[0];
    if (pick) pick(hit ? hit.object.userData.scroll : null);
  });

  let gapAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (window.OLYMPUS && window.OLYMPUS.hidden())) return;                       // hidden / covered: no JS, no frame
    const gap = (window.OLYMPUS && window.OLYMPUS.frameGap ? window.OLYMPUS.frameGap() : 0);                   // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
    if (gap && now - gapAt < gap - 3) return;
    gapAt = now;
    const live = frameLive(), t = now / 1000;
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.fov = a < 0.75 ? 62 : a < 1.2 ? 52 : 42; camera.updateProjectionMatrix();
    const moving = cam.pos.distanceToSquared(cam.tp) > 1e-4 || cam.look.distanceToSquared(cam.tl) > 1e-4 || Math.abs(st.gates - st.gatesTarget) > 0.001 || petals.t >= 0;
    if (!live && !moving && !dirty) return;
    const k = live ? 0.045 : 1;
    cam.pos.lerp(cam.tp, k); cam.look.lerp(cam.tl, k);
    st.gates += (st.gatesTarget - st.gates) * (live ? 0.03 : 1);
    stars.update(t, rc.renderer.getPixelRatio());
    FX.update(fxList, live ? t : 0, rc.renderer.getPixelRatio());
    const sway = live ? Math.sin(t * 0.3) * 0.18 : 0;
    camera.position.set(cam.pos.x + sway, cam.pos.y + (live ? Math.sin(t * 0.23) * 0.08 : 0), cam.pos.z); camera.lookAt(cam.look);
    doors.forEach((d) => { d.pivot.rotation.y = d.s * st.gates * 1.5; });
    inner.material.color.copy(hdr('#e0b060', 0.5 + 2.3 * st.gates)); seam.visible = st.gates < 0.5;
    gateBeam.visible = st.gates > 0.05; gateBeam.material.uniforms.uTime.value = t; gateBeam.material.uniforms.uPower.value = 0.9 * st.gates; gateLight.intensity = 120 * st.gates;
    laurel.material.color.copy(hdr(st.gatesTarget ? '#e0b060' : '#aeb86e', st.gatesTarget ? 3.4 : 2.4));
    scroll.rotation.y = live ? t * 0.6 : 0.4; scroll.position.y = 2.9 + (live ? Math.sin(t * 1.4) * 0.08 : 0); laurel.rotation.z = live ? t * 0.5 : 0;
    pillars.forEach((P, i) => { P.tab.position.y = 4.1 + (live ? Math.sin(t * 1.2 + i) * 0.06 : 0); P.beam.material.uniforms.uTime.value = t; const f = st.focus === i ? 1.6 : 1; P.tab.scale.setScalar(f); });
    flames.forEach((f) => { const ph = f.userData.ph; f.scale.set(1.2 + (live ? Math.sin(t * 7 + ph) * 0.16 : 0), 1.7 + (live ? Math.sin(t * 9 + ph * 2) * 0.28 : 0), 1); });
    if (petals.t >= 0) {
      const dt = Math.min(0.05, 1 / 30); petals.t += dt;
      const arr = petals.pts.geometry.attributes.position.array;
      for (let i = 0; i < petals.n; i++) { arr[i * 3] += petals.vel[i * 3] * dt; arr[i * 3 + 1] += petals.vel[i * 3 + 1] * dt; arr[i * 3 + 2] += petals.vel[i * 3 + 2] * dt; petals.vel[i * 3 + 1] -= 2.2 * dt; if (arr[i * 3 + 1] < 0.1) { arr[i * 3 + 1] = 0.1; petals.vel[i * 3 + 1] = 0; } }
      petals.pts.geometry.attributes.position.needsUpdate = true; petals.pts.material.opacity = Math.max(0, 1 - petals.t / 3.2);
      if (petals.t > 3.4) petals.t = -1;
    }
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  setClock({ h: 12, tone: 'watch' }); flameN();
  cam.pos.copy(cam.tp); cam.look.copy(cam.tl);
  raf = requestAnimationFrame(frame);
  return {
    setScrolls, setClock, focus, openGates, onPick(cb) { pick = typeof cb === 'function' ? cb : null; }, onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; },
    lite: () => lite, quality: () => rc.quality(), fxTarget: () => ({ scene, camera, renderer: rc.renderer, rc }),
    stats: () => ({ frames, drawn, quality: rc.quality(), passes: rc.passes().length, focus: st.focus, gates: Math.round(st.gates * 100) / 100, gatesOpen: st.gatesTarget === 1, h: st.h,
      tablets: pillars.filter((p) => p.item).length, night: stars.visible }),
    dispose() { stopped = true; cancelAnimationFrame(raf); rc.dispose(); },
  };
}
