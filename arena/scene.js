// ARENA scene (ES module): the colosseum, drawn by the OLYMPUS render core (docs/OLYMPUS_RENDER.md: ACES, environment light,
// bloom, MSAA, grain / vignette, quality tiers, hidden-tab pause). three.js is Jarvis's copy (../jarvis/three.module.min.js).
//   the bowl           marble seating tiers, an arcade of 56 arches with gold capitals, braziers, a starfield sky
//   the rank ladder    a 5-step marble ziggurat in the middle: every step reached glows in its rank's colour, a flame marks
//                      the step you stand on, the crown + column of light above it show the progress to the next rank
//   the 12 Labours     marble statues in a ring, stone until earned, then gold with a halo (a tap calls onPick(id))
//   the trophy ring    one cup per trophy on its pedestal: dark glass until earned, then bronze / silver / gold / legend
//                      (a tap calls onPick('trophy:<id>'))
//   the boss           the week's boss floats over the bowl as a glass crystal with its HP pips (a tap: 'boss:<id>');
//                      slain it shatters into gold
//   level-up / rank-up lightning + a gold burst; a RANK-UP is a ceremony: the camera dollies in, three shockwave rings, the
//                      column surges, bloom flares, the flame climbs a step, petals fall (about 4 s; none under reduced motion)
// createScene(canvas, { O }) -> { setState(s), levelUp({ rank, hold }), endHold(), onPick(cb), onQuality(cb), stats(), lite(), dispose() }
// Performance: the render core owns pixel ratio, tiers and the automatic step down; instanced meshes for everything repeated;
// no frame while the tab is hidden; reduced motion = a still scene redrawn on input, data or an effect.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as SC from '../olympus/scenery.js';
import { dress } from './dress.js';
import { citadel } from './colosseum.js?v=c2';

const TAU = Math.PI * 2;
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(1 + (k - 1) * 0.45);      // AGORA: warm light, a little above 1 only (bloom <= 0.25)
const calmNeon = (o) => M.neon(Object.assign({}, o, { intensity: (o.intensity || 1) * 0.5 }));
const AGORA3D = { sky: '#2b2018', fog: '#2a2018', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' };
const TIER_COLOR = { bronze: '#e0a060', silver: '#f3ece0', gold: '#c8a24a', legend: '#b08064' };
const STEP_R = [3.5, 2.9, 2.3, 1.7, 1.1], STEP_H = 0.5;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(243, 236, 224,1)'); r.addColorStop(0.25, 'rgba(243, 236, 224,.75)'); r.addColorStop(1, 'rgba(200, 162, 74,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function lightColumnMaterial(color, power = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: power } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;' +
      'void main(){ float fade = pow(max(1.0 - vUv.y, 0.0001), 0.7);' +
      'float band = 0.75 + 0.25 * sin(uTime * 2.4 - vUv.y * 18.0);' +
      'gl_FragColor = vec4(uColor * (1.1 + 0.5 * band), fade * 0.38 * band * uPower); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function createScene(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2018');
  scene.fog = new THREE.FogExp2(0x2a2018, 0.009);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  let lite = false, dirty = true, qcb = null, dr = null;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', tint: '#c8a24a', theme: AGORA3D, exposure: 1.0, maxDpr: 1.75,
    bloom: { strength: 0.22, radius: 0.5, threshold: 1.0 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; applyLite(); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';
  const cit = citadel(scene, { lite });
  const glow = glowTexture();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), s3 = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();

  // ---- light
  scene.add(new THREE.HemisphereLight('#ffe2b8', '#3a2a1a', 0.75));
  const moon = new THREE.DirectionalLight('#ffd9a0', 1.5); moon.position.set(-9, 16, 10); scene.add(moon);      // the sun
  const crownLight = new THREE.PointLight('#e0b060', 30, 30, 1.6); crownLight.position.set(0, 5.4, 0); scene.add(crownLight);
  const rimLight = new THREE.PointLight('#e0a060', 10, 40, 1.8); rimLight.position.set(0, 12, -14); scene.add(rimLight);

  // ---- sky
  const stars = M.starfield({ count: 260, radius: 170, size: 1.6 }); scene.add(stars);
  const neb = M.nebula({ colors: ['#e0b060', '#9c6b3c', '#4b7a99', '#c96a4a'], count: 8, radius: 90, size: 95, opacity: 0.1 }); neb.position.y = 18; scene.add(neb);

  // ---- the floor: sand, a marble disc under the ladder, a gold ring, a marble plaza ring
  const sand = new THREE.Mesh(new THREE.CircleGeometry(15.5, 72), new THREE.MeshStandardMaterial({ color: '#392716', roughness: 0.96, metalness: 0 }));
  sand.rotation.x = -Math.PI / 2; scene.add(sand);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.1, 64), M.marble({ color: '#b5aea5', gold: true, scale: 0.9 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; scene.add(disc);
  const ringGold = new THREE.Mesh(new THREE.TorusGeometry(5.15, 0.05, 6, 96), calmNeon({ color: '#e0a060', intensity: 2.2 }));
  ringGold.rotation.x = Math.PI / 2; ringGold.position.y = 0.05; scene.add(ringGold);
  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(15.4, 0.08, 6, 120), calmNeon({ color: '#e0a060', intensity: 1.6, fog: true }));
  ringOuter.rotation.x = Math.PI / 2; ringOuter.position.y = 0.06; scene.add(ringOuter);

  // ---- the bowl: four seating tiers (riser + seat surface), marble
  let riser = new THREE.MeshStandardMaterial({ color: '#8f8477', roughness: 0.55, metalness: 0.05 });     // the big surfaces are plain stone: the marble shader is for the hero pieces
  let seats = new THREE.MeshStandardMaterial({ color: '#726455', roughness: 0.7, metalness: 0.05 });
  try { riser = SC.stone({ color: '#a1988d', repeat: [36, 1], blocks: 4, bump: 2 }); seats = SC.stone({ color: '#8a7a68', repeat: [9, 9], blocks: 8, cracks: false, bump: 1 }); } catch (e) { /* the plain stone stays */ }
  for (let k = 0; k < 4; k++) {
    const R = 16.2 + k * 2.2, h = 1.5, y0 = k * h;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 72, 1, true), riser);
    wall.material.side = THREE.DoubleSide; wall.position.y = y0 + h / 2; scene.add(wall);
    const top = new THREE.Mesh(new THREE.RingGeometry(R, R + 2.2, 72), seats);
    top.rotation.x = -Math.PI / 2; top.position.y = y0 + h; scene.add(top);
  }
  // the arcade at the back: 56 piers with gold capitals, an arch between each pair, a gold cornice
  const NP = 56, RP = 25.4, PH = 8.5, pierMat = M.marble({ color: '#c4bdb6', gold: false, scale: 0.35, roughness: 0.38 });
  // 2026-11-04 (docs/OLYMPUS_PERF.md): the arcade, cornice and rings carry fewer segments (the Arena was 64k triangles before the crowd; ~49k now)
  const piers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, PH, 10), pierMat, NP);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.42, 1.15), M.metal({ kind: 'gold' }), NP);
  const arches = new THREE.InstancedMesh(new THREE.TorusGeometry(1.0, 0.2, 4, 8, Math.PI), pierMat, NP);
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * TAU, x = Math.cos(a) * RP, z = Math.sin(a) * RP;
    m4.makeTranslation(x, PH / 2, z); piers.setMatrixAt(i, m4);
    q.setFromEuler(e3.set(0, -a, 0)); p3.set(x, PH + 0.2, z); m4.compose(p3, q, s3); caps.setMatrixAt(i, m4);
    const b = a + TAU / NP / 2, bx = Math.cos(b) * RP, bz = Math.sin(b) * RP;       // the arch springs from this pier to the next
    q.setFromEuler(e3.set(0, -b + Math.PI / 2, 0)); p3.set(bx, PH - 1.2, bz); s3.set(1.28, 1, 1); m4.compose(p3, q, s3); arches.setMatrixAt(i, m4); s3.set(1, 1, 1);
  }
  scene.add(piers, caps, arches);
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(RP, 0.16, 6, 120), M.metal({ kind: 'gold' }));
  cornice.rotation.x = Math.PI / 2; cornice.position.y = PH + 0.7; scene.add(cornice);
  const frieze = new THREE.Mesh(new THREE.CylinderGeometry(RP + 0.1, RP + 0.1, 1.1, 96, 1, true), pierMat);
  frieze.material.side = THREE.DoubleSide; frieze.position.y = PH + 0.2; scene.add(frieze);
  const glowBand = new THREE.Mesh(new THREE.TorusGeometry(RP - 0.2, 0.05, 4, 120), calmNeon({ color: '#e0a060', intensity: 2.4, fog: true }));
  glowBand.rotation.x = Math.PI / 2; glowBand.position.y = PH + 1.15; scene.add(glowBand);

  // braziers on the plaza ring: a metal bowl and a flickering flame
  const NB = 14, brazMat = (() => { try { return SC.bronze({ color: '#b0763c', patina: 0.55, rough: 0.5 }); } catch (e) { return M.metal({ kind: 'gunmetal', color: '#5a5044' }); } })();
  const braz = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.22, 0.6, 12), brazMat, NB);
  const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 1.5, 8), brazMat, NB);
  const flames = [];
  for (let i = 0; i < NB; i++) {
    const a = ((i + 0.5) / NB) * TAU, x = Math.cos(a) * 15.7, z = Math.sin(a) * 15.7;
    m4.makeTranslation(x, 1.6, z); braz.setMatrixAt(i, m4); m4.makeTranslation(x, 0.75, z); legs.setMatrixAt(i, m4);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#e0a060', 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    f.position.set(x, 2.3, z); f.scale.set(1.5, 2.0, 1); f.userData.ph = i * 1.7; scene.add(f); flames.push(f);
  }
  scene.add(braz, legs);

  // ---- the rank ladder: five marble steps, a neon edge in each rank's colour
  const ladder = [], RANK_TINT = ['#afa79d', '#e0a060', '#f3ece0', '#c8a24a', '#e0a060'];
  for (let i = 0; i < 5; i++) {
    const stepMat = M.marble({ color: new THREE.Color('#bbb4ac').lerp(new THREE.Color(RANK_TINT[i]), 0.35), gold: false, scale: 0.8, roughness: 0.25 });
    const g = new THREE.Mesh(new THREE.CylinderGeometry(STEP_R[i], STEP_R[i] + 0.08, STEP_H, 48), stepMat);
    g.position.y = STEP_H * i + STEP_H / 2 + 0.02; scene.add(g);
    const nm = calmNeon({ color: '#afa79d', intensity: 0.4 });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(STEP_R[i] + 0.04, 0.04, 4, 64), nm);
    edge.rotation.x = Math.PI / 2; edge.position.y = STEP_H * (i + 1) + 0.03; scene.add(edge);
    ladder.push({ nm, edge, top: STEP_H * (i + 1) + 0.03, r: STEP_R[i] + 0.04 });
  }
  const TOP = STEP_H * 5 + 0.05;
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 24), M.metal({ kind: 'gold' }));
  altar.position.y = TOP + 0.25; scene.add(altar);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), calmNeon({ color: '#f3ece0', intensity: 5 }));
  const markerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#c8a24a', 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  markerGlow.scale.set(1.3, 1.3, 1); marker.add(markerGlow); scene.add(marker);

  // ---- the crown above the ladder, the column of light
  const crown = new THREE.Group(); crown.position.set(0, TOP + 2.2, 0); crown.rotation.x = 0.55; scene.add(crown);
  const gold = M.metal({ kind: 'gold' });
  const NL = 15, leafGeo = new THREE.SphereGeometry(1, 6, 4); leafGeo.scale(0.09, 0.03, 0.26);
  const leaves = new THREE.InstancedMesh(leafGeo, gold, NL * 4);
  let li = 0;
  for (const side of [-1, 1]) for (let i = 0; i < NL; i++) for (const row of [0, 1]) {
    const a = Math.PI / 2 + side * (0.22 + (i / (NL - 1)) * 2.7), r = 1.2 + (row ? 0.12 : -0.1);
    p3.set(Math.cos(a) * r, (row ? 0.06 : -0.04), Math.sin(a) * r);
    e3.set(0, -a + (row ? 0.75 : -0.75) * side + Math.PI / 2, row ? 0.25 : -0.25);
    q.setFromEuler(e3); m4.compose(p3, q, s3); leaves.setMatrixAt(li++, m4);
  }
  crown.add(leaves);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 64, TAU - 0.44), gold);
  band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI / 2 + 0.22; crown.add(band);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#c8a24a', 1.1), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(5.2, 5.2, 1); halo.position.copy(crown.position); scene.add(halo);
  const colMat = lightColumnMaterial('#c8a24a'), coreMat = lightColumnMaterial('#f3ece0'), ghostMat = lightColumnMaterial('#c8a24a', 0.16);
  const colGeo = new THREE.CylinderGeometry(0.55, 0.55, 1, 32, 1, true); colGeo.translate(0, 0.5, 0);
  const column = new THREE.Mesh(colGeo, colMat), core = new THREE.Mesh(colGeo, coreMat), ghost = new THREE.Mesh(colGeo, ghostMat);
  column.position.y = core.position.y = ghost.position.y = TOP + 0.5; core.scale.set(0.35, 1, 0.35); ghost.scale.set(1.02, 12, 1.02);
  scene.add(column, core, ghost);
  const NM = 150, mp = new Float32Array(NM * 3), mv = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { const a = Math.random() * TAU, r = Math.random() * 0.5; mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = Math.random() * 10; mp[i * 3 + 2] = Math.sin(a) * r; mv[i] = 0.6 + Math.random() * 1.4; }
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mp, 3)),
    new THREE.PointsMaterial({ map: glow, color: hdr('#f0dca0', 1.3), size: 0.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.position.y = TOP + 0.5; scene.add(motes);

  // ---- the 12 Labour statues (ring r = 9)
  const profile = [[0, 0], [0.3, 0], [0.34, 0.14], [0.23, 0.28], [0.2, 0.95], [0.31, 1.25], [0.23, 1.45], [0.08, 1.52], [0, 1.53]].map(([x, y]) => new THREE.Vector2(x, y));
  const bodyGeo = new THREE.LatheGeometry(profile, 16), headGeo = new THREE.SphereGeometry(0.17, 14, 10), baseGeo = new THREE.BoxGeometry(0.95, 0.6, 0.95);
  const stoneMat = M.marble({ color: '#a49a8f', vein: '#6b5f51', scale: 1.6, roughness: 0.42 });
  const plinth = M.marble({ color: '#b3aca3', gold: true, scale: 1.1 });
  const goldStatue = M.metal({ kind: 'gold' });
  const statues = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2, g = new THREE.Group();
    g.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9); g.lookAt(0, 0, 0); g.scale.setScalar(1.25);
    const base = new THREE.Mesh(baseGeo, plinth); base.position.y = 0.3;
    const body = new THREE.Mesh(bodyGeo, stoneMat); body.position.y = 0.6;
    const head = new THREE.Mesh(headGeo, stoneMat); head.position.y = 2.28;
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#c8a24a', 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    h.scale.set(2.6, 3.4, 1); h.position.y = 1.6;
    g.add(base, body, head, h); scene.add(g);
    statues.push({ g, body, head, halo: h, id: null, earned: false, i });
  }

  // ---- the trophy ring (r = 6.3): a pedestal and a cup each; earned cups take their tier's metal and a spark of light
  const NT = 28, tInfo = [];
  const cupProfile = [[0, 0], [0.16, 0], [0.18, 0.04], [0.06, 0.1], [0.05, 0.22], [0.2, 0.3], [0.27, 0.5], [0.24, 0.6], [0.2, 0.52], [0.13, 0.36], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  const cupGeo = new THREE.LatheGeometry(cupProfile, 14);
  const cupMat = M.metal({ kind: 'chrome', color: '#f3ece0', roughness: 0.16 });
  const cups = new THREE.InstancedMesh(cupGeo, cupMat, NT);
  const peds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 14), plinth, NT);
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), calmNeon({ color: '#f3ece0', intensity: 5 }), NT);
  const dark = new THREE.Color('#352e27');
  const cupPos = [];
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * TAU - Math.PI / 2, x = Math.cos(a) * 6.5, z = Math.sin(a) * 6.5;
    cupPos.push([x, z]);
    m4.makeTranslation(x, 0.37, z); peds.setMatrixAt(i, m4);
    m4.makeTranslation(x, 0.72, z); cups.setMatrixAt(i, m4); cups.setColorAt(i, dark);
    m4.makeScale(0, 0, 0); sparks.setMatrixAt(i, m4);
  }
  cups.instanceColor.needsUpdate = true; cups.userData.pick = 'trophy';
  scene.add(peds, cups, sparks);

  // ---- the boss: a glass crystal with a neon core, HP pips on a ring, shards when it is slain
  const boss = new THREE.Group(); boss.position.set(0, 5, -12.5); scene.add(boss);
  const bossShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), M.glass({ color: '#f3ece0', rim: '#c96a4a', opacity: 0.28 }));
  const bossCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), calmNeon({ color: '#c96a4a', intensity: 4 }));
  const bossWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 0), new THREE.MeshBasicMaterial({ color: hdr('#c96a4a', 1.6), wireframe: true, transparent: true, opacity: 0.5 }));
  const bossHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#c96a4a', 1.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  bossHalo.scale.set(6, 6, 1);
  boss.add(bossShell, bossCore, bossWire, bossHalo);
  bossShell.userData.boss = bossCore.userData.boss = bossWire.userData.boss = true;
  const pips = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), calmNeon({ color: '#c96a4a', intensity: 4 }));
    p.position.set(Math.cos(a) * 1.8, -1.9, Math.sin(a) * 1.8); boss.add(p); pips.push(p);
  }
  const shards = new THREE.Group(); scene.add(shards);
  const bossLight = new THREE.PointLight('#c96a4a', 0, 26, 1.6); bossLight.position.copy(boss.position); scene.add(bossLight);

  // ---- effects: lightning, the burst, shockwave rings, petals
  const fx = { bolts: [], burst: null, rings: [], petals: null, t0: 0, rank: false, hold: false, on: false };
  function bolt(x0, z0) {
    const pts = [], n = 16, top = new THREE.Vector3(x0, 22, z0), end = new THREE.Vector3(0, TOP + 2.2, 0);
    for (let i = 0; i <= n; i++) {
      const p = top.clone().lerp(end, i / n);
      if (i && i < n) { p.x += (Math.random() - 0.5) * 1.8; p.z += (Math.random() - 0.5) * 1.8; }
      pts.push(p);
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07, 5, false),
      new THREE.MeshBasicMaterial({ color: hdr('#f3ece0', 2.6), transparent: true, opacity: 1, fog: false }));
    scene.add(mesh);
    return mesh;
  }
  function burst(n) {
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, u = Math.random() * 0.9 + 0.1, s = 2.5 + Math.random() * 6;
      pos[i * 3 + 1] = TOP + 2.2;
      vel[i * 3] = Math.cos(a) * s * u; vel[i * 3 + 1] = 3 + Math.random() * 7; vel[i * 3 + 2] = Math.sin(a) * s * u;
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ map: glow, color: hdr('#c8a24a', 1.4), size: 0.36, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(pts);
    return { pts, vel, age: 0, n };
  }
  function shockRing(delay, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 4, 64), new THREE.MeshBasicMaterial({ color: hdr(color, 2), transparent: true, opacity: 0, fog: false, depthWrite: false }));
    m.rotation.x = Math.PI / 2; m.position.y = 0.3; m.visible = false; scene.add(m);
    return { m, delay };
  }
  function petals(n, color) {
    const pos = new Float32Array(n * 3), spd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, r = Math.random() * 12; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 12 + Math.random() * 10; pos[i * 3 + 2] = Math.sin(a) * r; spd[i] = 1.4 + Math.random() * 2; }
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ map: glow, color: hdr(color, 1.2), size: 0.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(pts);
    return { pts, spd, n };
  }
  function dispose3(o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  function clearFx() {
    fx.bolts.forEach(dispose3); fx.bolts = [];
    if (fx.burst) { dispose3(fx.burst.pts); fx.burst = null; }
    fx.rings.forEach((r) => dispose3(r.m)); fx.rings = [];
    if (fx.petals) { dispose3(fx.petals.pts); fx.petals = null; }
    fx.on = false; cam.zoom = 1; cam.lift = 0; rc.setBloom({ strength: 0.22 });
  }

  // ---- state
  const st = { progress: 0, shown: 0, color: new THREE.Color('#c8a24a'), labours: [], rank: 0, ranks: [], marker: 0, trophies: [], boss: null };
  let pick = null, levelups = 0;
  const bossColor = new THREE.Color('#c96a4a');
  function applyBoss() {
    const b = st.boss;
    boss.visible = !!b;
    if (!b) return;
    bossColor.set(b.color || '#c96a4a');
    bossCore.material.color.copy(bossColor).multiplyScalar(b.state === 'slain' ? 5 : 4);
    bossWire.material.color.copy(bossColor).multiplyScalar(1.6);
    bossHalo.material.color.copy(bossColor).multiplyScalar(1.2);
    bossShell.material.userData.rim && bossShell.material.userData.rim.uRim.value.copy(bossColor).multiplyScalar(1.4);
    const max = Math.max(1, Math.min(6, b.max | 0)), left = Math.max(0, Math.min(max, (b.max | 0) - (b.hits | 0)));
    pips.forEach((p, i) => { p.visible = i < max; p.material.color.copy(i < left ? bossColor.clone().multiplyScalar(4) : new THREE.Color('#312b24')); });
    bossShell.visible = bossWire.visible = b.state !== 'slain' || !b.shattered;
    if (b.state === 'slain') { bossCore.material.color.set('#c8a24a').multiplyScalar(5); bossHalo.material.color.set('#c8a24a').multiplyScalar(1.3); }
    boss.userData.state = b.state;
  }
  function shatter() {
    shards.children.slice().forEach(dispose3);
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.22 + Math.random() * 0.2), new THREE.MeshBasicMaterial({ color: hdr('#c8a24a', 2.5), transparent: true, opacity: 1 }));
      s.position.copy(boss.position); s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5); s.userData.age = 0;
      shards.add(s);
    }
    if (dr) dr.bossFight();
    dirty = true;
  }
  function setState(s) {
    st.progress = Math.max(0.03, Math.min(1, +s.progress || 0));
    st.color.set(s.color || '#c8a24a');
    halo.material.color.copy(st.color).multiplyScalar(1.1); crownLight.color.copy(st.color); markerGlow.material.color.copy(st.color).multiplyScalar(1.6);
    (s.labours || []).forEach((l, i) => {
      const x = statues[i]; if (!x) return;
      x.id = l.id; x.earned = !!l.earned;
      x.body.material = x.head.material = x.earned ? goldStatue : stoneMat;
      x.halo.material.opacity = x.earned ? 0.5 : 0;
      x.body.userData.labour = x.head.userData.labour = l.id;
    });
    if (Array.isArray(s.ranks)) {
      st.ranks = s.ranks; st.rank = Math.max(0, Math.min(4, s.rankIndex | 0));
      ladder.forEach((L, i) => {
        const rk = s.ranks[i]; if (rk && rk.color) L.nm.color.set(rk.color);
        L.base = i <= st.rank ? 4 : i === st.rank + 1 ? 1.1 : 0.25;
        L.nm.color.multiplyScalar(L.base);
      });
      if (st.marker == null || reduced() || !st.markerSet) { st.marker = st.rank; st.markerSet = true; }
    }
    if (Array.isArray(s.trophies)) {
      st.trophies = s.trophies;
      for (let i = 0; i < NT; i++) {
        const t = s.trophies[i];
        const c = t && t.earned ? new THREE.Color(TIER_COLOR[t.tier] || '#c8a24a') : dark;
        cups.setColorAt(i, c);
        const [x, z] = cupPos[i];
        m4.makeScale(t && t.earned ? 1 : 0, t && t.earned ? 1 : 0, t && t.earned ? 1 : 0).setPosition(x, 1.42, z); sparks.setMatrixAt(i, m4);
        m4.makeScale(t ? 1.1 : 0.001, t ? 1.1 : 0.001, t ? 1.1 : 0.001).setPosition(x, 0.72, z); cups.setMatrixAt(i, m4);
        m4.makeScale(t ? 1 : 0.001, t ? 1 : 0.001, t ? 1 : 0.001).setPosition(x, 0.37, z); peds.setMatrixAt(i, m4);
      }
      cups.instanceColor.needsUpdate = true; cups.instanceMatrix.needsUpdate = true; sparks.instanceMatrix.needsUpdate = true; peds.instanceMatrix.needsUpdate = true;
    }
    if (s.boss !== undefined) {
      const was = st.boss && st.boss.state, nb = s.boss;
      st.boss = nb;
      if (nb && nb.state === 'slain' && was && was !== 'slain') nb.shattered = true;
      applyBoss();
      if (nb && nb.shattered) shatter();
    }
    if (reduced()) st.shown = st.progress;
    dirty = true;
  }
  function levelUp({ rank = false, hold = false } = {}) {       // hold: freeze at the peak (screenshots)
    levelups++;
    clearFx();
    const nb = reduced() ? 1 : rank ? 6 : 3;
    for (let i = 0; i < nb; i++) { const a = Math.random() * TAU; fx.bolts.push(bolt(Math.cos(a) * 6, Math.sin(a) * 6)); }
    fx.burst = burst((lite ? 200 : 520) * (rank ? 1.6 : 1) | 0);
    if (dr && rank) dr.cheer(4400);
    if (rank) {
      const c = '#' + st.color.getHexString();
      fx.rings = [shockRing(0.35, c), shockRing(0.85, '#c8a24a'), shockRing(1.35, '#f3ece0')];
      fx.petals = petals(lite ? 70 : 180, c);
    }
    fx.t0 = performance.now(); fx.rank = rank; fx.hold = !!hold; fx.on = true;
    fx.len = rank ? 4.4 : 2.8;
    fx.markerFrom = st.marker;
    dirty = true;
  }

  // ---- camera: a slow orbit (none under reduced motion), drag to turn, tap a statue / cup / the boss
  const cam = { theta: 0.35, phi: 0.6, dist: 30, zoom: 1, lift: 0, drag: null, shake: 0 };
  function placeCamera() {
    const r = cam.dist * cam.zoom, ph = Math.max(0.2, cam.phi - cam.lift * 0.35);
    camera.position.set(Math.sin(cam.theta) * Math.cos(ph) * r, 1.8 + Math.sin(ph) * r, Math.cos(cam.theta) * Math.cos(ph) * r);
    if (cam.shake) camera.position.add(p3.set((Math.random() - 0.5) * cam.shake, (Math.random() - 0.5) * cam.shake, 0));
    camera.lookAt(0, 2.8 + cam.lift * 1.4, 0);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (e) => { cam.drag = { x: e.clientX, y: e.clientY, t: cam.theta, p: cam.phi, moved: 0 }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!cam.drag) return;
    const dx = e.clientX - cam.drag.x, dy = e.clientY - cam.drag.y;
    cam.drag.moved = Math.max(cam.drag.moved, Math.abs(dx) + Math.abs(dy));
    cam.theta = cam.drag.t - dx * 0.008;
    cam.phi = Math.max(0.25, Math.min(1.1, cam.drag.p + dy * 0.004));
    dirty = true;
  });
  const up = (e) => {
    const d = cam.drag; cam.drag = null;
    if (!d || d.moved > 8) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...statues.flatMap((s) => [s.body, s.head]), cups, bossShell, bossCore], false)[0];
    let id = null;
    if (hit) {
      if (hit.object === cups) { const t = st.trophies[hit.instanceId]; id = t ? 'trophy:' + t.id : null; }
      else if (hit.object.userData.boss) id = st.boss ? 'boss:' + st.boss.id : null;
      else id = hit.object.userData.labour || null;
    }
    if (pick) pick(id);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { cam.drag = null; });

  function applyLite() {
    motes.geometry.setDrawRange(0, lite ? 50 : NM);
    flames.forEach((f, i) => { f.visible = !lite || i % 2 === 0; });
    if (dr) dr.setLite(lite);
    if (typeof cit !== 'undefined') cit.setLite(lite);
  }
  applyLite();
  try { dr = dress({ scene, camera, rc, boss, bossLight, lite }); if (dr.sand) sand.material = dr.sand; } catch (e) { dr = null; /* the plain colosseum */ }

  // ---- the frame loop
  let last = performance.now(), frames = 0, raf = 0, stopped = false, drew = 0;
  let gapAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (O && O.hidden())) return;                            // hidden / covered: no JS, no frame (docs/OLYMPUS_PERF.md)
    const gap = O && O.frameGap ? O.frameGap() : 0;                       // idle 30 / 15 fps, battery saver, 3D Off 2 fps; a touch = full rate
    if (gap && now - gapAt < gap - 3) return;
    gapAt = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const still = reduced();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    cam.dist = aspect < 0.6 ? 33 : aspect < 1 ? 28 : 21;
    const shardsOn = shards.children.length > 0;
    const busy = fx.on || shardsOn || Math.abs(st.shown - st.progress) > 0.001 || Math.abs(st.marker - markerPos) > 0.01;
    if (still && !busy && !dirty) return;
    const t = now / 1000;
    if (!still) { cam.theta += cam.drag || fx.on ? 0 : dt * 0.05; crown.rotation.z = Math.sin(t * 0.5) * 0.08; crown.rotation.y += dt * (fx.on && fx.rank ? 2.2 : 0.25); }
    st.shown += (st.progress - st.shown) * Math.min(1, dt * (still ? 60 : 1.6));
    const surge = fx.on && fx.rank ? 1.2 : 1;
    column.scale.y = core.scale.y = (0.4 + st.shown * 11) * surge;
    column.scale.x = column.scale.z = surge > 1 ? 1.25 : 1;
    colMat.uniforms.uTime.value = coreMat.uniforms.uTime.value = ghostMat.uniforms.uTime.value = t;
    halo.material.opacity = 0.45 + (still ? 0 : Math.sin(t * 2) * 0.1);
    stars.update(t, rc.renderer.getPixelRatio()); neb.update(t);
    // the flame on the step you stand on; it climbs when the rank rises
    markerPos += (st.marker - markerPos) * Math.min(1, dt * (still ? 60 : 2.2));
    const mi = Math.max(0, Math.min(4, markerPos)), lo = Math.floor(mi), hi = Math.min(4, lo + 1), f = mi - lo;
    const ang = still ? 0.9 : t * 0.9, mr = ladder[lo].r * (1 - f) + ladder[hi].r * f, my = ladder[lo].top * (1 - f) + ladder[hi].top * f;
    marker.position.set(Math.cos(ang) * mr, my + 0.22 + Math.sin(t * 3) * (still ? 0 : 0.04), Math.sin(ang) * mr);
    ladder.forEach((L, i) => { const k = i === st.rank + 1 && !still ? 0.75 + 0.25 * Math.sin(t * 2.2) : 1; L.nm.color.copy(new THREE.Color(st.ranks[i] ? st.ranks[i].color : '#afa79d')).multiplyScalar((L.base || 0.3) * k); });
    flames.forEach((fl) => { const ph = fl.userData.ph; fl.scale.set(1.4 + (still ? 0 : Math.sin(t * 7 + ph) * 0.18), 1.9 + (still ? 0 : Math.sin(t * 9 + ph * 2) * 0.3), 1); });
    if (!still) {
      const arr = motes.geometry.attributes.position.array, top = 0.4 + st.shown * 11;
      for (let i = 0; i < NM; i++) { arr[i * 3 + 1] += mv[i] * dt; if (arr[i * 3 + 1] > top) arr[i * 3 + 1] = 0; }
      motes.geometry.attributes.position.needsUpdate = true;
      statues.forEach((s) => { if (s.earned) s.halo.material.opacity = 0.42 + Math.sin(t * 1.5 + s.i) * 0.1; });
      boss.rotation.y += dt * 0.6; bossWire.rotation.x += dt * 0.4; bossCore.rotation.y -= dt * 1.2;
      boss.position.y = 5 + Math.sin(t * 1.1) * 0.35;
    }
    // slain boss: shards fly and fade
    if (shardsOn) {
      shards.children.slice().forEach((s) => {
        s.userData.age += dt; s.position.addScaledVector(s.userData.v, dt); s.userData.v.y -= 6 * dt; s.rotation.x += dt * 3; s.rotation.y += dt * 2;
        s.material.opacity = Math.max(0, 1 - s.userData.age / 1.8);
        if (s.userData.age > 1.8) dispose3(s);
      });
    }
    if (fx.on) {
      const age = fx.hold ? (fx.rank ? 1.0 : 0.12) : (now - fx.t0) / 1000, len = fx.len;
      for (const b of fx.bolts) b.material.opacity = age < 0.9 ? (Math.sin(age * 40) > -0.2 ? 1 : 0.15) * (1 - age / 0.9) : 0;
      crownLight.intensity = 40 + (age < 0.9 ? 160 * (1 - age / 0.9) : 0);
      if (fx.rank) {
        const k = age < 0.5 ? age / 0.5 : age < 2.4 ? 1 : Math.max(0, 1 - (age - 2.4) / 1.6);        // dolly in, hold, ease out
        if (!still) { cam.zoom = 1 - 0.38 * k; cam.lift = k; cam.shake = age < 1.1 ? (1 - age / 1.1) * 0.5 : 0; }
        rc.setBloom({ strength: 0.22 + 0.2 * Math.max(0, 1 - Math.abs(age - 0.9) / 1.3) });
        fx.rings.forEach((r) => {
          const a = age - r.delay;
          r.m.visible = a > 0 && a < 1.8;
          if (r.m.visible) { r.m.scale.setScalar(1 + a * 15); r.m.material.opacity = Math.max(0, 1 - a / 1.8); }
        });
        if (age > 1.2 && st.marker !== st.rank) st.marker = st.rank;              // the flame climbs once the light has struck
        if (fx.petals) {
          const P = fx.petals, arr = P.pts.geometry.attributes.position.array;
          for (let i = 0; i < P.n; i++) { arr[i * 3 + 1] -= P.spd[i] * dt * (fx.hold ? 0 : 1); arr[i * 3] += Math.sin(t * 2 + i) * dt * 0.6; if (arr[i * 3 + 1] < 0.2) arr[i * 3 + 1] = 20; }
          P.pts.geometry.attributes.position.needsUpdate = true;
          P.pts.material.opacity = age < 3.4 ? 1 : Math.max(0, 1 - (age - 3.4));
        }
      }
      if (fx.burst) {
        const B = fx.burst, a = B.pts.geometry.attributes.position.array;
        const step = fx.hold ? (B.age > 0.45 ? 0 : 0.09) : dt;
        B.age += step;
        for (let i = 0; i < B.n; i++) { a[i * 3] += B.vel[i * 3] * step; a[i * 3 + 1] += B.vel[i * 3 + 1] * step; a[i * 3 + 2] += B.vel[i * 3 + 2] * step; B.vel[i * 3 + 1] -= 6 * step; }
        B.pts.geometry.attributes.position.needsUpdate = true;
        B.pts.material.opacity = Math.max(0, 1 - B.age / 2.8);
      }
      if (!fx.hold && age > len) { clearFx(); crownLight.intensity = 40; cam.shake = 0; if (reduced()) st.marker = st.rank; }
      dirty = true;
    }
    if (dr) { try { if (dr.update(t, dt, still)) dirty = true; } catch (e) { dr = null; } }
    placeCamera();
    if (rc.render()) drew++;
    frames++;
    dirty = false;
  }
  let markerPos = 0;
  placeCamera();
  raf = requestAnimationFrame(frame);

  return {
    setState, levelUp,
    bossFight() { if (dr) dr.bossFight(); dirty = true; },
    endHold() { clearFx(); crownLight.intensity = 40; cam.shake = 0; st.marker = st.rank; dirty = true; },
    onPick(cb) { pick = typeof cb === 'function' ? cb : null; },
    onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; },
    lite: () => lite,
    quality: () => rc.quality(),
    stats: () => ({ levelups, lite, quality: rc.quality(), passes: rc.passes().length, bolts: fx.bolts.length, burst: !!fx.burst, rings: fx.rings.length, ceremony: fx.on && fx.rank,
      frames, drawn: drew, statues: statues.filter((s) => s.earned).length, trophies: st.trophies.filter((t) => t.earned).length, steps: st.rank + 1,
      boss: st.boss ? st.boss.state : null, dress: dr ? dr.stats() : null, citadel: cit.stats() }),
    dispose() { stopped = true; cancelAnimationFrame(raf); clearFx(); if (dr) dr.dispose(); cit.dispose(); rc.dispose(); },
  };
}

