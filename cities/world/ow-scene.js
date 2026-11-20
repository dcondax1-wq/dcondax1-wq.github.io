// Olympus World scene (cities/world/, night-worlds 2026-11-19): the one giant city in three.js r160 on the OLYMPUS render core
// (../../olympus/render.js: ACES, HDR buffers, bloom, tiers, the phone governor, context-loss and hidden-tab safety).
// Draw calls: buildings 1 + their wet-street mirror 1 + ground 1 + sky 1 + halos 1 + traffic 1 + beams 1 + rings 1 + warp 1 + a few
// pooled pulses: thousands of buildings in about a dozen calls. Everything that moves is computed on the GPU from uTime.
import * as THREE from '../../jarvis/three.module.min.js';
import { createRenderer } from '../../olympus/render.js';
import * as SH from './ow-shaders.js?v=w4';
import { poseToCam, lerpPose, ease, warpCurve, clampPose, homePose, overviewPose, districtPose, placePose, clamp, hex, rng, skyFor } from './ow-core.js?v=w5';

const MOON = new THREE.Vector3(0.28, 0.2, -1).normalize();



function prism(box) {
  // revamp-cities (2026-11-20): one prism for every building piece. 8 walls round a square whose corners are cut by the instance's
  // chamfer (0 = a box: the 4 corner walls have no width and are skipped in the shader; 0.3 = an octagon) + a roof fan; the taper
  // narrows the top (1 = a pyramid). aCorner = (sx, sz, which side of the cut: 0 the x wall, 1 the z wall, 2 the roof's centre),
  // aFace = (wall kind: 0 x, 1 z, 2 corner, 3 roof; the share along the wall). 48 vertices, 32 triangles.
  const ring = [[1, -1, 0], [1, 1, 0], [1, 1, 1], [-1, 1, 1], [-1, 1, 0], [-1, -1, 0], [-1, -1, 1], [1, -1, 1]];
  const kinds = [0, 2, 1, 2, 0, 2, 1, 2];                                   // the wall from ring[k] to ring[k+1]
  const at = (v, c) => (v[2] === 0 ? [v[0] * 0.5, v[1] * (0.5 - c)] : v[2] === 1 ? [v[0] * (0.5 - c), v[1] * 0.5] : [0, 0]);
  const P = [], A = [], F = [], I = [];
  const vert = (v, y, kind, along) => { P.push(0, y, 0); A.push(v[0], v[1], v[2]); F.push(kind, along); return P.length / 3 - 1; };
  const tri = (a, b, c, va, vb, vc, ya, yb, yc, out) => {
    // wind each triangle so its normal points out (checked on a sample chamfer of 0.2)
    const p = (v, y) => { const q = at(v, 0.2); return [q[0], y, q[1]]; };
    const pa = p(va, ya), pb = p(vb, yb), pc = p(vc, yc);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) I.push(a, b, c); else I.push(a, c, b);
  };
  for (let k = 0; k < 8; k++) {
    if (box && kinds[k] === 2) continue;                                    // a plain box: no corner walls (20 vertices, 10 triangles)
    const va = ring[k], vb = ring[(k + 1) % 8], kind = kinds[k];
    const a0 = vert(va, 0, kind, 0), b0 = vert(vb, 0, kind, 1), b1 = vert(vb, 1, kind, 1), a1 = vert(va, 1, kind, 0);
    const qa = at(va, 0.2), qb = at(vb, 0.2), mid = [(qa[0] + qb[0]) / 2, 0, (qa[1] + qb[1]) / 2];
    tri(a0, b0, b1, va, vb, vb, 0, 0, 1, mid); tri(a0, b1, a1, va, vb, va, 0, 1, 1, mid);
  }
  if (box) {
    const rv = [0, 2, 4, 6].map((k) => vert(ring[k], 1, 3, 0)), rk = [0, 2, 4, 6].map((k) => ring[k]);
    tri(rv[0], rv[1], rv[2], rk[0], rk[1], rk[2], 1, 1, 1, [0, 1, 0]); tri(rv[0], rv[2], rv[3], rk[0], rk[2], rk[3], 1, 1, 1, [0, 1, 0]);
  } else {
    const c0 = vert([0, 0, 2], 1, 3, 0);
    const rv = ring.map((v) => vert(v, 1, 3, 0));
    for (let k = 0; k < 8; k++) tri(c0, rv[k], rv[(k + 1) % 8], [0, 0, 2], ring[k], ring[(k + 1) % 8], 1, 1, 1, [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(A, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(F, 2));
  g.setIndex(I);
  return g;
}
function instanced(base, attrs, count) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
  for (const [k, arr, size] of attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, size));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

export function createWorld(opts) {
  const { canvas, world, plan } = opts;
  const reduced = !!opts.reduced;
  const manual = !!opts.manual;
  let vnow = 0;
  const now = () => (manual ? vnow : performance.now());
  const R = plan.R, C = plan.C, PL = plan.PL, N = plan.places.length;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000);
  const rc = createRenderer({ canvas, scene, camera, env: 'none', bloomMax: 0.8, maxDpr: 2, quality: opts.quality || undefined,
    bloom: { strength: 0.5, radius: 0.55, threshold: 0.95 }, grade: { vignette: 0.3, grain: 0.014, saturation: 1.06, aberration: 0.0005 } });
  // ---- shared uniforms
  const U = { uTime: { value: 0 }, uMoonDir: { value: MOON }, uFogDensity: { value: 0.0016 }, uDay: { value: 1e4 }, uWarp: { value: 0 }, uDusk: { value: 0 }, uNoon: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.42, 0.075, -1).normalize() }, uLightDir: { value: new THREE.Vector3() }, uLightCol: { value: new THREE.Vector3() } };
  // the sky follows the market clock (revamp-cities): the NQ cash session = golden hour, the hours round it = blue hour, else night
  let dusk = skyFor(opts.sky), duskTo = dusk;
  const SUN0 = new THREE.Vector3(0.42, 0.075, -1).normalize(), SUN1 = new THREE.Vector3(0.5, 0.62, -0.62).normalize();
  const LC0 = new THREE.Vector3(0.12, 0.15, 0.26), LC1 = new THREE.Vector3(1.25, 0.66, 0.34), LC2 = new THREE.Vector3(1.7, 1.52, 1.28);
  const setLightK = (v) => {   // cities3: 0 night .. 1 golden .. 2 day; the sun, the key light's direction and colour once here, not per pixel
    const dk = Math.min(1, v), nn = Math.max(0, Math.min(1, v - 1));
    U.uDusk.value = dk; U.uNoon.value = nn;
    U.uSunDir.value.copy(SUN0).lerp(SUN1, nn).normalize();
    U.uLightDir.value.copy(U.uMoonDir.value).normalize().lerp(U.uSunDir.value, dk).normalize();
    U.uLightCol.value.copy(LC0).lerp(LC1, dk).lerp(LC2, nn);
  };
  setLightK(dusk);
  const TW = 64, TH = Math.max(1, Math.ceil(plan.slots / TW));
  const tex = new Uint8Array(TW * TH * 4);
  const placeTex = new THREE.DataTexture(tex, TW, TH, THREE.RGBAFormat);
  placeTex.magFilter = placeTex.minFilter = THREE.NearestFilter; placeTex.generateMipmaps = false; placeTex.needsUpdate = true;
  const PU = { uPlaces: { value: placeTex }, uPlacesSize: { value: new THREE.Vector2(TW, TH) } };
  // per place: grow (0..1), pulse (0..1), selected (0..1), light level (x2); index N = the plaza, N+1.. = the districts
  const grow = new Float32Array(plan.slots).fill(reduced ? 1 : 0), pulse = new Float32Array(plan.slots), selv = new Float32Array(plan.slots);
  const light = new Float32Array(plan.slots).fill(1);
  plan.places.forEach((p, i) => { light[i] = p.light; });
  let texDirty = true;
  function writeTex() {
    for (let i = 0; i < plan.slots; i++) {
      tex[i * 4] = Math.round(clamp(grow[i], 0, 1) * 255); tex[i * 4 + 1] = Math.round(clamp(pulse[i], 0, 1) * 255);
      tex[i * 4 + 2] = Math.round(clamp(selv[i], 0, 1) * 255); tex[i * 4 + 3] = Math.round(clamp(light[i] / 2, 0, 1) * 255);
    }
    placeTex.needsUpdate = true; texDirty = false;
  }
  // ---- buildings and their reflection in the wet streets / the sea
  // two batches (revamp-cities perf): plain boxes (10 triangles) and shaped pieces (octagons, tapers, caps: 32), each one draw + its mirror
  const shp = plan.shape || new Float32Array(plan.n * 2);
  const split = [[], []];
  for (let k = 0; k < plan.n; k++) split[shp[k * 2] > 0.004 || shp[k * 2 + 1] > 0.004 ? 1 : 0].push(k);
  const pick = (arr, size, ids) => { const o = new Float32Array(ids.length * size); ids.forEach((k, j) => { for (let c = 0; c < size; c++) o[j * size + c] = arr[k * size + c]; }); return o; };
  const bGeos = split.map((ids, kind) => instanced(prism(kind === 0), [['iPos', pick(plan.pos, 3, ids), 3], ['iSize', pick(plan.size, 3, ids), 3], ['iInfo', pick(plan.info, 4, ids), 4],
    ['iTint', pick(plan.tint, 3, ids), 3], ['iMisc', pick(plan.misc, 4, ids), 4], ['iShape', pick(shp, 2, ids), 2]], ids.length));
  const STREET = new THREE.Color(0.95, 0.5, 0.2);                            // sodium
  const bU = { ...U, ...PU, uStreet: { value: STREET } };
  const bMat = new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS, uniforms: bU, extensions: { derivatives: true } });
  const mMat = new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS, uniforms: bU, defines: { MIRROR: 1 }, side: THREE.BackSide, extensions: { derivatives: true } });
  const buildings = new THREE.Group(), mirror = new THREE.Group();
  for (const g of bGeos) {
    const b = new THREE.Mesh(g, bMat), m = new THREE.Mesh(g, mMat);
    b.frustumCulled = m.frustumCulled = false; m.renderOrder = -2;
    buildings.add(b); mirror.add(m);
  }
  scene.add(mirror, buildings);
  // ---- the ground: one plane, streets and glow drawn by its shader from a small light map of the city
  const E = R + 60, S = opts.tier === 'low' ? 512 : 1024;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = S;
  paintGlow(glowCanvas.getContext('2d'), world, plan, E, S);
  const glowTex = new THREE.CanvasTexture(glowCanvas); glowTex.flipY = false; glowTex.colorSpace = THREE.SRGBColorSpace;
  const landCanvas = document.createElement('canvas'); landCanvas.width = landCanvas.height = 256;
  paintLand(landCanvas.getContext('2d'), plan, E, 256);
  const landTex = new THREE.CanvasTexture(landCanvas); landTex.flipY = false;
  const border = (world.districts || []).map((d, k, all) => { const a = hex(d.hue), b = hex(all[(k + all.length - 1) % all.length].hue); return new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); });
  while (border.length < 4) border.push(new THREE.Vector3());
  const arcs = (world.districts || []).map((d) => d.a0); while (arcs.length < 4) arcs.push(99);
  const townVecs = Array.from({ length: 18 }, (_, k) => { const t = (plan.towns || [])[k]; return t ? new THREE.Vector4(t[0], t[1], t[2], 1) : new THREE.Vector4(0, 0, 0, 0); });
  const gMat = new THREE.ShaderMaterial({ vertexShader: SH.GROUND_VS, fragmentShader: SH.GROUND_FS, transparent: true, extensions: { derivatives: true },
    uniforms: { ...U, uStreet: { value: STREET }, uTowns: { value: townVecs }, uGlow: { value: glowTex }, uLand: { value: landTex }, uGlowRect: { value: new THREE.Vector4(-E, -E, 2 * E, 2 * E) }, uCell: { value: C }, uPlaza: { value: PL }, uR: { value: R },
      uArcs: { value: new THREE.Vector4(...arcs.slice(0, 4)) }, uBorder: { value: border.slice(0, 4) } } });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200).rotateX(-Math.PI / 2), gMat);
  ground.renderOrder = 1; ground.frustumCulled = false;
  scene.add(ground);
  // ---- the sky
  const skyU = { ...U, uAurora: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), new THREE.ShaderMaterial({ vertexShader: SH.SKY_VS, fragmentShader: SH.SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  // ---- the far shore: other towns and hills on the horizon, one draw
  const far = new THREE.Mesh(new THREE.CylinderGeometry(1500, 1500, 70, 256, 1, true).translate(0, 35, 0),
    new THREE.ShaderMaterial({ vertexShader: SH.FAR_VS, fragmentShader: SH.FAR_FS, uniforms: { ...U }, side: THREE.BackSide, depthWrite: false }));
  far.renderOrder = -9; far.frustumCulled = false;
  scene.add(far);
  // ---- halos: each place's light in the haze
  const hn = plan.halos.length, hA = new Float32Array(hn * 4), hC = new Float32Array(hn * 4), hP = new Float32Array(hn);
  plan.halos.forEach((h, k) => { hA.set([h[0], h[1], h[2], h[3]], k * 4); hC.set([h[4], h[5], h[6], h[7]], k * 4); hP[k] = h[8]; });
  const halos = new THREE.Mesh(instanced(new THREE.PlaneGeometry(2, 2), [['aHalo', hA, 4], ['aCol', hC, 4], ['aPlace', hP, 1]], hn),
    new THREE.ShaderMaterial({ vertexShader: SH.HALO_VS, fragmentShader: SH.HALO_FS, uniforms: { ...U, ...PU }, ...additive }));
  halos.renderOrder = 2; halos.frustumCulled = false;
  scene.add(halos);
  // ---- traffic on the streets and data flowing out along the district boulevards
  const tMax = opts.tier === 'low' ? 700 : 2600;
  const tLine = new Float32Array(tMax * 4), tCol = new Float32Array(tMax * 3);
  const tr = rng(99), kmax = Math.floor(R / C);
  const head = hex('#fff1d6'), tail = hex('#ff3a1e');
  for (let k = 0; k < tMax; k++) {
    if (k % 7 === 6 && arcs[0] !== 99) {
      const d = (world.districts || [])[k % (world.districts || []).length];
      const c = hex(d ? d.hue : '#ffffff');
      tLine.set([2, arcs[(k >> 3) % 4] + (tr() - 0.5) * 0.004, tr(), 16 + tr() * 18], k * 4);
      tCol.set([c[0] * 3, c[1] * 3, c[2] * 3], k * 3);
      continue;
    }
    let line = (Math.floor(tr() * (2 * kmax + 1)) - kmax + 0.5) * C;
    if (tr() < 0.45) line = Math.round(line / (4 * C)) * 4 * C + 0.5 * C;      // avenues are busier
    const dir = tr() < 0.5 ? -1 : 1, white = tr() < 0.5;
    tLine.set([tr() < 0.5 ? 0 : 1, line, tr(), dir * (5 + tr() * 9)], k * 4);
    const c = white ? head : tail, g = white ? 2.2 : 1.6;
    tCol.set([c[0] * g, c[1] * g, c[2] * g], k * 3);
  }
  const tU = { ...U, uR: { value: R }, uPlaza: { value: PL }, uSize: { value: 1.0 } };
  const traffic = new THREE.Mesh(instanced(new THREE.PlaneGeometry(1, 1), [['aLine', tLine, 4], ['aCol', tCol, 3]], tMax),
    new THREE.ShaderMaterial({ vertexShader: SH.TRAFFIC_VS, fragmentShader: SH.TRAFFIC_FS, uniforms: tU, ...additive }));
  traffic.renderOrder = 3; traffic.frustumCulled = false;
  scene.add(traffic);
  // ---- searchlights
  const bn = plan.beams.length, bBase = new Float32Array(bn * 4), bBeam = new Float32Array(bn * 4), bCol = new Float32Array(bn * 3);
  plan.beams.forEach((b, k) => { bBase.set([b[0], b[1], b[2], b[3]], k * 4); bBeam.set([b[4], b[5], b[6], b[7]], k * 4); bCol.set(b[8], k * 3); });
  const beams = new THREE.Mesh(instanced(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0), [['aBase', bBase, 4], ['aBeam', bBeam, 4], ['aCol', bCol, 3]], bn),
    new THREE.ShaderMaterial({ vertexShader: SH.BEAM_VS, fragmentShader: SH.BEAM_FS, uniforms: { ...U }, side: THREE.DoubleSide, ...additive }));
  beams.renderOrder = 4; beams.frustumCulled = false;
  scene.add(beams);
  // ---- rings (+1 slot: the selection marker on the ground)
  const rn = plan.rings.length + 1, rA = new Float32Array(rn * 4), rB = new Float32Array(rn * 4), rC = new Float32Array(rn * 4), rP = new Float32Array(rn);
  plan.rings.forEach((r, k) => { rA.set([r[0], r[1], r[2], r[3]], k * 4); rB.set([r[4], r[5], r[6], r[7]], k * 4); rC.set([r[8][0], r[8][1], r[8][2], r[9]], k * 4); rP[k] = r[10]; });
  const ringGeo = instanced(new THREE.RingGeometry(0.8, 1, 96, 1), [['aRing', rA, 4], ['aArc', rB, 4], ['aCol', rC, 4], ['aPlace', rP, 1]], rn);
  const rings = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({ vertexShader: SH.RING_VS, fragmentShader: SH.RING_FS, uniforms: { ...U, ...PU }, side: THREE.DoubleSide, ...additive }));
  rings.renderOrder = 3; rings.frustumCulled = false;
  scene.add(rings);
  // ---- LED displays: ticker bands round the tallest towers (the Gate, ZEUS, the Kalshi bot, Business); text = setDisplay(row, line)
  const ROWS = 4, TXW = 3072, TXH = 128;   // cities3: 3072 wide = about 72 letters a row (the live district lines)
  const txt = document.createElement('canvas'); txt.width = TXW; txt.height = TXH * ROWS;
  const tg = txt.getContext('2d');
  tg.fillStyle = '#000'; tg.fillRect(0, 0, TXW, TXH * ROWS);
  const txtTex = new THREE.CanvasTexture(txt); txtTex.flipY = false; txtTex.minFilter = txtTex.magFilter = THREE.NearestFilter; txtTex.generateMipmaps = false;
  const bandSpec = [];
  const byHref = (h) => plan.places.findIndex((p) => p.href === h);
  const gold = [1.0, 0.72, 0.32];
  bandSpec.push({ x: 0, y: 29.0, z: 0, r: 3.8, h: 2.0, row: 0, col: gold, place: N });   // clear of the corners (a 5.2 square: 3.68)
  for (const [href, row] of [['hub/zeus.html', 1], ['kalshi/', 2], ['business/', 3]]) {
    const i = byHref(href);
    if (i < 0) continue;
    const p = plan.places[i], fw = 2.7 + 1.5 * clamp(((p.raw.b || [])[0] || 120) / 255, 0, 1);
    bandSpec.push({ x: p.x, y: p.top * 0.42, z: p.z, r: fw * 0.74, h: Math.max(1.2, p.top * 0.06), row, col: p.hue.map((v) => Math.min(1, v * 1.25 + 0.1)), place: i });
  }
  const dn = bandSpec.length, dA = new Float32Array(dn * 4), dB = new Float32Array(dn * 4), dC = new Float32Array(dn * 3), dP = new Float32Array(dn);
  bandSpec.forEach((b, k) => {
    const circ = 2 * Math.PI * b.r, rep = Math.max(1, Math.round(circ / (b.h * 24)));
    dA.set([b.x, b.y, b.z, b.r], k * 4); dB.set([b.h, b.row, rep, reduced ? 0 : 0.035 / rep], k * 4);            // reduced motion: the text stands still
    dC.set(b.col, k * 3); dP[k] = b.place;                                                                // cities3: this line sat inside the comment above (black bands)
  });
  const bandGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
  const bands = new THREE.Mesh(instanced(bandGeo, [['aBand', dA, 4], ['aBand2', dB, 4], ['aCol', dC, 3], ['aPlace', dP, 1]], dn),
    new THREE.ShaderMaterial({ vertexShader: SH.BAND_VS, fragmentShader: SH.BAND_FS, uniforms: { ...U, ...PU, uText: { value: txtTex }, uRows: { value: ROWS }, uTexW: { value: TXW } }, side: THREE.DoubleSide, extensions: { derivatives: true } }));
  bands.frustumCulled = false; bands.renderOrder = 2;
  scene.add(bands);
  const shown = new Array(ROWS).fill('');
  function setDisplay(row, text) {
    const r = Math.max(0, Math.min(ROWS - 1, row | 0));
    let t = String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (t.length > 72) t = t.slice(0, 72).replace(/\s+\S*$/, '') + ' \u2026';                // one row holds about 48 letters
    if (!t || shown[r] === t) return false;
    shown[r] = t;
    tg.fillStyle = '#000'; tg.fillRect(0, r * TXH, TXW, TXH);
    tg.font = '700 72px -apple-system, "SF Pro Display", system-ui, "Helvetica Neue", Arial, sans-serif';
    tg.textBaseline = 'middle'; tg.fillStyle = '#fff';
    const unit = t + '   \u2022   ', w = Math.max(1, tg.measureText(unit).width), n = Math.max(1, Math.round(TXW / w));
    tg.save(); tg.setTransform(TXW / (n * w), 0, 0, 1, 0, 0);                   // a whole number of repeats, stretched a little: a seamless loop
    for (let k = 0; k < n; k++) tg.fillText(unit, k * w, r * TXH + TXH * 0.54);
    tg.restore();
    txtTex.needsUpdate = true;
    return true;
  }
  setDisplay(0, 'OLYMPUS   ' + N + ' PLACES LEARNING');
  // ---- pooled pulses: a shock wave on the ground and a pillar of light
  const pool = [];
  for (let k = 0; k < 4; k++) {
    const su = { uCol: { value: new THREE.Color() }, uK: { value: 1 } }, pu = { uCol: { value: new THREE.Color() }, uK: { value: 1 } };
    const shock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: SH.FX_VS, fragmentShader: SH.SHOCK_FS, uniforms: su, side: THREE.DoubleSide, ...additive }));
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({ vertexShader: SH.FX_VS, fragmentShader: SH.PILLAR_FS, uniforms: pu, side: THREE.DoubleSide, ...additive }));
    shock.renderOrder = pillar.renderOrder = 5; shock.visible = pillar.visible = false;
    scene.add(shock, pillar);
    pool.push({ shock, pillar, su, pu, t: 1, dur: 1, r: 10, h: 60 });
  }
  // ---- aircraft: a few nav-light pairs and strobes crossing the sky on slow orbits (revamp-cities)
  const pn = opts.tier === 'low' ? 3 : 6, pA = new Float32Array(pn * 3 * 4), pK = new Float32Array(pn * 3), pr = rng(77);
  for (let k = 0; k < pn; k++) {
    const pl = [R + 120 + pr() * 700, 90 + pr() * 170, (pr() < 0.5 ? -1 : 1) * (0.012 + pr() * 0.02), pr() * 6.28];
    for (let j = 0; j < 3; j++) { pA.set(pl, (k * 3 + j) * 4); pK[k * 3 + j] = j; }
  }
  const planes = new THREE.Mesh(instanced(new THREE.PlaneGeometry(1, 1), [['aPlane', pA, 4], ['aKind', pK, 1]], pn * 3),
    new THREE.ShaderMaterial({ vertexShader: SH.PLANE_VS, fragmentShader: SH.PLANE_FS, uniforms: { ...U }, ...additive }));
  planes.renderOrder = 6; planes.frustumCulled = false; planes.visible = !reduced;
  scene.add(planes);
  // ---- warp streaks (view space)
  const wn = opts.tier === 'low' ? 220 : 480, wS = new Float32Array(wn * 4), wC = new Float32Array(wn * 3), wr = rng(5);
  for (let k = 0; k < wn; k++) {
    const a = wr() * Math.PI * 2, rr = 1.6 + Math.pow(wr(), 0.6) * 9;
    wS.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.8, wr() * 90, 0.6 + wr() * 0.8], k * 4);
    const c = wr() < 0.3 ? hex('#ffd27a') : wr() < 0.5 ? hex('#9fd8ff') : hex('#ffffff');
    wC.set(c, k * 3);
  }
  const warpMesh = new THREE.Mesh(instanced(new THREE.PlaneGeometry(1, 1), [['aS', wS, 4], ['aCol', wC, 3]], wn),
    new THREE.ShaderMaterial({ vertexShader: SH.WARP_VS, fragmentShader: SH.WARP_FS, uniforms: { ...U }, depthTest: false, ...additive }));
  warpMesh.renderOrder = 20; warpMesh.frustumCulled = false; warpMesh.visible = false;
  scene.add(warpMesh);

  // ------------------------------------------------------------------------------------------------ tiers
  function applyTier(l) {
    const lowT = l === 'low' || l === 'off';
    mirror.visible = !lowT;
    traffic.geometry.instanceCount = lowT ? Math.min(tMax, 700) : tMax;
    skyU.uAurora.value = l === 'ultra' || l === 'high' ? 1 : 0;
  }
  applyTier(rc.quality());
  rc.onTier(applyTier);

  // ------------------------------------------------------------------------------------------------ the camera
  let pose = clampPose(reduced ? homePose(world) : { ...overviewPose(world), dist: R * 3.9, yaw: -1.25, pitch: 1.2 }, world);
  let tween = null, vel = { yaw: 0, pitch: 0 }, lastInput = now(), introT = reduced ? -1 : 0, introAt = 0, warp = 0, fovKick = 0;
  let tour = null, history = null;
  const baseFov = () => (camera.aspect < 0.8 ? 60 : camera.aspect < 1.2 ? 52 : 44);
  let focus = 0, focusTo = 0;
  function applyCam() {
    const c = poseToCam(pose);
    camera.position.set(c.pos[0], Math.max(c.pos[1], 1.2), c.pos[2]);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);
    camera.fov = baseFov() + fovKick;
    const cw = canvas.clientWidth || 390, ch = canvas.clientHeight || 844;
    if (focus > 0.002) camera.setViewOffset(cw, ch, 0, Math.round(focus * ch), cw, ch); else if (camera.view) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    U.uFogDensity.value = 0.0024 / (1 + camera.position.y / 110);
  }
  /** fly to a pose: {ms, warp: true = the world-to-world dash (streaks, FOV punch, a rise and a dive), done} */
  function flyTo(to, o) {
    const oo = o || {};
    const ms = reduced ? 1 : oo.ms != null ? oo.ms : 900;
    tween = { from: { ...pose }, to: clampPose(to, world), t0: now(), ms, warp: !!oo.warp && !reduced, done: oo.done || null, lift: oo.lift != null ? oo.lift : 0.35 };
    if (introT >= 0) { introT = -1; grow.fill(1); texDirty = true; }                // a flight during the opening: the whole city is there
  }
  function stepTween(now) {
    if (!tween) return;
    const k = clamp((now - tween.t0) / Math.max(1, tween.ms), 0, 1), e = ease(k);
    const p = lerpPose(tween.from, tween.to, e);
    if (tween.warp) {
      const wc = warpCurve(k);
      p.dist *= 1 + tween.lift * wc;
      warp = wc; fovKick = 24 * wc;
    }
    pose = clampPose(p, world);
    if (k >= 1) {
      const t = tween; tween = null; warp = 0; fovKick = 0;
      if (t.done) t.done();
    }
  }
  // ------------------------------------------------------------------------------------------------ input: drag = orbit, pinch = zoom, two fingers = pan
  const ptrs = new Map();
  let gesture = null, lastTap = 0;
  const box0 = () => canvas.getBoundingClientRect();
  function stopAuto() { lastInput = now(); if (introT >= 0) { introT = -1; grow.fill(1); texDirty = true; } tween = null; warp = 0; fovKick = 0; if (tour) stopTour(); if (opts.onUser) opts.onUser(); }
  function groundAt(x, y) {
    const b = box0(), v = new THREE.Vector3(((x - b.left) / b.width) * 2 - 1, -((y - b.top) / b.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    if (v.y > -1e-3) return null;
    const t = -camera.position.y / v.y;
    return [camera.position.x + v.x * t, camera.position.z + v.z * t];
  }
  function onDown(e) {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    gesture = ptrs.size === 1 ? { kind: e.button === 2 || e.shiftKey ? 'pan' : 'orbit', moved: 0 } : { kind: 'pinch', moved: 99 };
    stopAuto(); vel.yaw = vel.pitch = 0;
    e.preventDefault();
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1 && gesture) {
      gesture.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.kind === 'orbit') {
        const ky = 0.0055, kp = 0.0042;
        pose.yaw -= dx * ky; pose.pitch = clamp(pose.pitch + dy * kp, 0.1, 1.45);
        vel.yaw = -dx * ky; vel.pitch = dy * kp;
      } else panBy(dx, dy);
      p.x = e.clientX; p.y = e.clientY;
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y), mx0 = (a.x + b.x) / 2, my0 = (a.y + b.y) / 2;
      p.x = e.clientX; p.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y), mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2;
      if (before > 4 && after > 4) pose.dist *= before / after;
      panBy(mx1 - mx0, my1 - my0);
    }
    pose = clampPose(pose, world);
    lastInput = now();
  }
  function panBy(dx, dy) {
    const k = pose.dist * 0.0021, s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
    pose.tx -= (dx * c + dy * s / Math.max(0.35, Math.sin(pose.pitch))) * k;
    pose.tz -= (-dx * s + dy * c / Math.max(0.35, Math.sin(pose.pitch))) * k;
  }
  function onUp(e) {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p) return;
    const tUp = performance.now();
    if (gesture && gesture.kind !== 'pinch' && gesture.moved < 9 && tUp - p.t0 < 450 && ptrs.size === 0) {
      if (tUp - lastTap < 320) {                                             // a double tap: zoom in there
        const gp = groundAt(e.clientX, e.clientY);
        if (gp) flyTo({ ...pose, tx: gp[0], tz: gp[1], dist: pose.dist * 0.5 }, { ms: 450 });
        lastTap = 0;
      } else {
        lastTap = tUp;
        const b = box0();
        if (opts.onTap) opts.onTap(e.clientX - b.left, e.clientY - b.top);
      }
      vel.yaw = vel.pitch = 0;
    }
    if (ptrs.size === 0) gesture = null;
  }
  function onWheel(e) { e.preventDefault(); stopAuto(); pose.dist *= Math.exp(clamp(e.deltaY, -200, 200) * 0.0013); pose = clampPose(pose, world); }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const noMenu = (e) => e.preventDefault();
  canvas.addEventListener('contextmenu', noMenu);

  // ------------------------------------------------------------------------------------------------ effects
  function burst(i, o) {
    const p = i >= 0 && i < N ? plan.places[i] : { x: 0, z: 0, r: 22, top: 46, hue: hex('#ffd890') };
    const fx = pool.reduce((a, b) => (b.t > a.t ? b : a), pool[0]);
    const c = (o && o.color) || p.hue;
    fx.t = 0; fx.dur = (o && o.dur) || 1.4; fx.r = Math.max(8, p.r * 2.6); fx.h = 70 + p.top * 1.5;
    fx.shock.position.set(p.x, 0.25, p.z); fx.pillar.position.set(p.x, 0, p.z);
    fx.su.uCol.value.setRGB(c[0], c[1], c[2]); fx.pu.uCol.value.setRGB(c[0], c[1], c[2]);
    fx.shock.visible = fx.pillar.visible = true;
    if (i >= 0) { pulse[i] = 1; texDirty = true; }
  }
  function stepFx(dt) {
    for (const f of pool) {
      if (f.t >= 1) continue;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = f.t;
      f.su.uK.value = k; f.pu.uK.value = k;
      const s = 2 + f.r * ease(Math.min(1, k * 1.4)) * 2;
      f.shock.scale.set(s, 1, s);
      f.pillar.scale.set(Math.max(0.6, f.r * 0.16) * (1 - k * 0.6), f.h * Math.min(1, k * 3), Math.max(0.6, f.r * 0.16) * (1 - k * 0.6));
      if (f.t >= 1) f.shock.visible = f.pillar.visible = false;
    }
  }
  // the selection marker ring (the last ring slot) and the place glow
  let selected = -1;
  function select(i) {
    if (selected >= 0) selv[selected] = 0;
    selected = i >= 0 && i < N ? i : -1;
    const k = rn - 1, attr = ringGeo.attributes;
    if (selected >= 0) {
      const p = plan.places[selected];
      selv[selected] = 1;
      attr.aRing.array.set([p.x, 0.35, p.z, p.r + 2.5], k * 4);
      attr.aArc.array.set([1, 0.25, 0.08, 0], k * 4);
      attr.aCol.array.set([p.hue[0], p.hue[1], p.hue[2], 2.2], k * 4);
      attr.aPlace.array[k] = selected;
    } else attr.aRing.array[k * 4 + 3] = 0;
    attr.aRing.needsUpdate = attr.aArc.needsUpdate = attr.aCol.needsUpdate = attr.aPlace.needsUpdate = true;
    texDirty = true;
  }
  const trading = new Set();
  function setTrading(i, on) { if (i < 0) return; if (on) trading.add(i); else trading.delete(i); light[i] = on ? 1.6 : plan.places[i].light; texDirty = true; }
  function setLight(i, v) { if (i >= 0 && i < plan.slots) { light[i] = v; texDirty = true; } }

  // ------------------------------------------------------------------------------------------------ the loop
  const INTRO = 3.6;
  const startPose = { ...pose };
  let frames = 0, fps = 0, tPrevFrame = 0, bloomNow = 0.5, skyAt = 0;
  const works = new Float32Array(60);
  const dists = plan.places.map((p) => Math.hypot(p.x, p.z) / R);
  function frame(dt, t) {
    const t0 = now(), tReal = performance.now();
    U.uTime.value = t;
    // the opening flyover: the city rises from the plaza outward while the camera dives in
    if (introT >= 0) {
      if (!introAt) introAt = t0;
      introT = (t0 - introAt) / 1000;                                         // wall clock: a slow phone still lands on time
      const k = clamp(introT / INTRO, 0, 1);
      pose = clampPose(lerpPose(startPose, homePose(world), ease(k)), world);
      pose.yaw += (1 - ease(k)) * 0.0;
      const T = clamp(introT / (INTRO * 0.8), 0, 1) * 1.5;
      for (let i = 0; i < N; i++) grow[i] = clamp((T - dists[i] * 1.05) / 0.32, 0, 1);
      grow[N] = clamp(T / 0.3, 0, 1);
      for (let i = N + 1; i < plan.slots; i++) grow[i] = clamp((T - 0.3) / 0.6, 0, 1);
      texDirty = true;
      if (k >= 1) { introT = -1; grow.fill(1); if (opts.onIntroDone) opts.onIntroDone(); }
    }
    if (history) stepHistory(dt);
    if (tour) stepTour(t0);
    stepTween(t0);
    if (!tween && introT < 0 && ptrs.size === 0) {
      if (Math.abs(vel.yaw) + Math.abs(vel.pitch) > 1e-4) {                   // inertia after a fling
        pose.yaw += vel.yaw; pose.pitch = clamp(pose.pitch + vel.pitch, 0.1, 1.45);
        vel.yaw *= 0.92; vel.pitch *= 0.85;
      } else if (!reduced && t0 - lastInput > 7000 && !tour) pose.yaw += dt * 0.022;   // idle: the city turns slowly
      pose = clampPose(pose, world);
    }
    // pulses fade; a bot in a trade keeps pulsing
    let any = false;
    for (let i = 0; i < plan.slots; i++) if (pulse[i] > 0) { pulse[i] = Math.max(0, pulse[i] - dt * 0.55); any = true; }
    for (const i of trading) { pulse[i] = 0.35 + 0.35 * Math.sin(t * 3.2); any = true; }
    if (selected >= 0) any = true;
    if (any) texDirty = true;
    if (texDirty) writeTex();
    stepFx(dt);
    focus += (focusTo - focus) * (1 - Math.exp(-Math.min(dt, 0.1) * 7));
    U.uWarp.value = warp;
    if (t0 - skyAt > 30000) { skyAt = t0; duskTo = skyFor(opts.sky); }        // the market clock, checked every 30 s
    if (Math.abs(duskTo - dusk) > 1e-4) { dusk += (duskTo - dusk) * (1 - Math.exp(-Math.min(dt, 0.1) * 0.8)); setLightK(dusk); }
    warpMesh.visible = warp > 0.01;
    const bs = 0.5 - 0.3 * U.uNoon.value + warp * 0.18;   // daylight: less glow, the city reads as buildings
    if (Math.abs(bs - bloomNow) > 0.004) { bloomNow = bs; rc.setBloom({ strength: bs }); }
    applyCam();
    if (opts.onFrame) opts.onFrame(dt, t);
    frames++;
    const real = performance.now();                                          // the real render speed (fps), whatever the clock
    if (tPrevFrame) { const ms = real - tPrevFrame; fps = fps ? fps * 0.9 + (1000 / Math.max(1, ms)) * 0.1 : 1000 / Math.max(1, ms); }
    tPrevFrame = real;
    works[frames % works.length] = real - tReal;                            // the JavaScript of this frame (the median is reported)
    if (!manual) rc.render();
  }

  // ------------------------------------------------------------------------------------------------ history: watch the city learn
  function startHistory(onDay, onEnd) {
    const days = Math.max(1, +world.days || 30);
    history = { t: 0, dur: reduced ? 0.01 : 9, days, onDay, onEnd };
    flyTo({ ...overviewPose(world), yaw: pose.yaw }, { ms: reduced ? 1 : 1600 });
  }
  function stepHistory(dt) {
    const h = history;
    const nowH = now();
    if (!h.at) h.at = nowH;
    h.t = (nowH - h.at) / 1000;
    const k = clamp(h.t / h.dur, 0, 1);
    const day = k * (h.days + 1);
    U.uDay.value = day;
    plan.places.forEach((p, i) => { grow[i] = clamp((day - (+p.raw.day || 0)) * 0.9, 0, 1); });
    texDirty = true;
    if (!tween) pose.yaw += dt * 0.05;
    if (h.onDay) h.onDay(day, k);
    if (k >= 1) { history = null; U.uDay.value = 1e4; grow.fill(1); texDirty = true; if (h.onEnd) h.onEnd(); }
  }
  function stopHistory() { if (!history) return; const h = history; history = null; U.uDay.value = 1e4; grow.fill(1); texDirty = true; if (h.onEnd) h.onEnd(true); }
  // ------------------------------------------------------------------------------------------------ the tour: hop from place to place
  function startTour(stops, onStop) { tour = { stops, k: -1, next: now(), onStop }; }
  function stepTour(now) {
    if (!tour || now < tour.next || tween) return;
    tour.k = (tour.k + 1) % tour.stops.length;
    const s = tour.stops[tour.k];
    tour.next = now + 4600;
    if (tour.onStop) tour.onStop(s, tour.k);
  }
  function stopTour() { if (tour && tour.onStop) tour.onStop(null, -1); tour = null; }

  // ------------------------------------------------------------------------------------------------ projection for picking and labels
  const v3 = new THREE.Vector3();
  function project(x, y, z) {
    v3.set(x, y, z).project(camera);
    const b = canvas.clientWidth, h = canvas.clientHeight;
    const front = v3.z > -1 && v3.z < 1;
    const depth = Math.hypot(camera.position.x - x, camera.position.y - y, camera.position.z - z);
    return { sx: (v3.x * 0.5 + 0.5) * b, sy: (-v3.y * 0.5 + 0.5) * h, front, depth, focal: h / 2 / Math.tan((camera.fov * Math.PI) / 360) };
  }
  function candidates() {
    applyCam();
    camera.updateMatrixWorld();
    return plan.places.map((p) => {
      const q = project(p.x, p.top * 0.55, p.z);
      return { i: p.i, sx: q.sx, sy: q.sy, front: q.front && grow[p.i] > 0.2, rpx: (p.r + p.top * 0.3) * q.focal / Math.max(1, q.depth), kind: p.kind, depth: q.depth };
    });
  }

  applyCam();
  if (!reduced) for (let i = 0; i < plan.slots; i++) grow[i] = 0;
  writeTex();
  if (!manual) rc.start(frame);

  const api = {
    THREE, rc, scene, camera, plan,
    flyTo, burst, select, setTrading, setLight, setDisplay, project, candidates, startHistory, stopHistory, startTour, stopTour, groundAt,
    pose: () => ({ ...pose }),
    setPose(p) { tween = null; introT = -1; pose = clampPose(p, world); grow.fill(1); texDirty = true; },
    flyToPlace(i, o) { const p = plan.places[i]; if (p) flyTo(placePose(p, pose), { warp: true, ms: 950, ...(o || {}), done: () => { burst(i); if (o && o.done) o.done(); } }); },
    flyToDistrict(d, o) { flyTo(districtPose(world, d), { warp: true, ms: 1000, lift: 0.5, ...(o || {}) }); },
    home(o) { flyTo(homePose(world), { warp: true, ms: 900, ...(o || {}) }); },
    overview(o) { flyTo(overviewPose(world), { warp: true, ms: 1000, lift: 0.2, ...(o || {}) }); },
    /** ?clock=manual: advance the clock by ms and draw that frame now (frame-by-frame capture: smooth video on a machine without a GPU) */
    step(ms, noDraw) { if (!manual) return false; vnow += ms; frame(Math.min(ms, 100) / 1000, vnow / 1000); if (!noDraw) rc.draw(); return true; },
    /** the share of the screen height the subject moves up (a card covers the bottom): 0..0.3 */
    /** the sky: 'night' | 'blue' | 'dusk' (golden hour) | 'auto' (the market clock) */
    setSky(k) { opts.sky = k; duskTo = skyFor(k); if (reduced || manual) { dusk = duskTo; setLightK(dusk); } },
    setFocus(f, now) { focusTo = clamp(+f || 0, 0, 0.3); if (reduced || now) focus = focusTo; },
    skipIntro() { if (introT >= 0) { introT = -1; grow.fill(1); texDirty = true; pose = clampPose(homePose(world), world); } },
    state() {
      const st = rc.stats();
      const ws = Array.from(works.slice(0, Math.min(frames, works.length))).sort((a, b) => a - b), jsMs = ws.length ? ws[ws.length >> 1] : 0;
      const p95 = ws.length ? ws[Math.min(ws.length - 1, Math.floor(ws.length * 0.95))] : 0;   // olympus2: the slow end of the frames too
      return { frames, fps: Math.round(fps * 10) / 10, jsMs: Math.round(jsMs * 100) / 100, jsP95: Math.round(p95 * 100) / 100, tier: rc.quality(), calls: st.calls, triangles: st.triangles,
        instances: plan.n, places: N, selected, intro: introT >= 0, warp, tween: !!tween, tour: !!tour, history: !!history, pose: { ...pose },
        mirror: mirror.visible, traffic: traffic.geometry.instanceCount, dusk: Math.round(dusk * 100) / 100, dpr: st.dpr, bloom: st.bloom, compiled: st.compiled };
    },
    /** olympus2: leaving the World: the render loop stops at once so the jump / the next page get the whole phone (no disposal work here) */
    halt() { try { rc.stop(); } catch (e) { /* already stopped */ } },
    /** back from the back-forward cache: the loop runs again */
    resume() { if (!manual) try { rc.start(frame); } catch (e) { /* the page reloads instead */ } },
    dispose() {
      rc.stop();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', noMenu);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      placeTex.dispose(); glowTex.dispose(); landTex.dispose(); txtTex.dispose(); rc.dispose();
    },
  };
  return api;
}

// the ground's light map: every place's glow, the plaza's gold, the fabric's street light (an sRGB canvas the ground shader samples)
function paintGlow(g, world, plan, E, S) {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const px = (v) => ((v + E) / (2 * E)) * S;
  const css = (c, a) => `rgba(${Math.round(Math.pow(c[0], 1 / 2.2) * 255)},${Math.round(Math.pow(c[1], 1 / 2.2) * 255)},${Math.round(Math.pow(c[2], 1 / 2.2) * 255)},${a})`;
  const pool = (x, z, r, c, a) => {
    const gr = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), Math.max(1, (r / (2 * E)) * S));
    gr.addColorStop(0, css(c, a)); gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(px(x), px(z), Math.max(1, (r / (2 * E)) * S), 0, Math.PI * 2); g.fill();
  };
  for (const d of world.districts || []) {
    const c = hex(d.hue);
    g.fillStyle = css(c, 0.035);
    g.beginPath(); g.moveTo(px(0), px(0)); g.arc(px(0), px(0), ((plan.R + 4) / (2 * E)) * S, d.a0, d.a1); g.closePath(); g.fill();
  }
  const C = plan.C;
  for (const [i, j, lvl] of world.filler || []) {
    if (!lvl) { pool(i * C, j * C, C * 0.7, hex('#1f6b3a'), 0.18); continue; }
    pool(i * C, j * C, C * 1.0, hex('#ffb070'), 0.03 + lvl * 0.009);
  }
  const A = { live: 0.85, app: 0.5, bright: 0.55, growing: 0.45, testing: 0.3, planned: 0.3, data: 0.4, ruin: 0.22 };
  for (const p of plan.places) {
    const c = p.state === 'ruin' ? [1, 0.25, 0.08] : p.hue;
    pool(p.x, p.z, p.r * 1.5 + 4, c, (A[p.state] || 0.3) * 0.55 * (p.district === 'kalshi' && p.kind !== 'app' ? 0.6 : 1));
  }
  pool(0, 0, plan.PL * 1.5, hex('#ffd890'), 0.6);
}

// the land: the city's ground and a ragged coast round it (white = land), the sea beyond
function paintLand(g, plan, E, S) {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const px = (v) => ((v + E) / (2 * E)) * S;
  const r0 = plan.R + plan.C * 3.4, r = rng(31);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  g.fillStyle = '#fff'; g.beginPath();
  for (let k = 0; k <= 240; k++) {
    const a = (k / 240) * Math.PI * 2;
    const rr = r0 + plan.C * (1.1 * Math.sin(a * 3 + ph[0]) + 0.7 * Math.sin(a * 7 + ph[1]) + 0.45 * Math.sin(a * 13 + ph[2]) + 0.3 * Math.sin(a * 23 + ph[3]));
    const x = px(Math.cos(a) * rr), z = px(Math.sin(a) * rr);
    if (k) g.lineTo(x, z); else g.moveTo(x, z);
  }
  g.closePath(); g.fill();
}
