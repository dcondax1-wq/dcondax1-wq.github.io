// DAPHNE 3D: the strategy tree as a living laurel tree on the OLYMPUS render core (tools/web_public/olympus/render.js).
//   const g = await startTree3d(glCanvas, S, { onState })      null when the core / WebGL cannot load (glow.js, then the 2D tree, stay)
//   g.frame(now, t)   draw one frame: t = the playback clock in ms (branches and leaves appear when their node does)
//   g.pick(x, y) -> node | null     g.orbit(dx, dy)     g.zoom(f)     g.on     g.passes     g.stats()
// Draw calls: ONE merged bark mesh (every branch a tapered tube, bark-gold), ONE merged glow mesh (thin additive tubes: living
// branches green, the BEST path gold and thicker), ONE instanced leaf mesh (green = positive in train and test, amber = in one,
// grey = dead end), one Points (fireflies; new tests are the bright tips of the growing branches), a ground and a trunk flare.
// The search grows by drawRange / instance count (nodes are stored in playback order), so growing costs no rebuild.
// On low / off tiers and under reduced motion it stands down (the 2D tree draws). Reads the layout of core.js, changes no data.
// 2026-11-04: real bark (a grain texture with relief on the tubes), veined leaves, WIND (branches sway in the vertex shader, the leaves
// follow on the CPU with a gusting breeze), SEASONS (S.season = auto | spring | summer | autumn | winter: the leaves, the light and the
// weather change; auto = spring while the search sprouts, summer on the TRAIN lens, autumn on the TEST lens), light shafts from above and
// weather from the OLYMPUS effects (olympus/fx-*.js: godRays, petals, laurelFall, snow), each one optional.
import * as THREE from '../jarvis/three.module.min.js';
import * as C from './core.js?v=d3';
import * as AT from '../olympus/fx-atmos.js';        // JOB 47: pollen drifting through the light and a soft shadow at the foot of the trunk

const H = 7, SIDES = 5, SEG = 3, MAX_LEAVES = 1600, FLIES = 70;
const hash = C.hash01;

/** the 3D place of a node: the fan of core.js opened all the way round the trunk (u -> azimuth, depth -> height and lean) */
export function place3(n) {
  const phi = n.u * 2.6 + (hash(n.id, 5) - 0.5) * 0.3 * (1 - n.r);
  const psi = 0.2 + 0.62 * Math.pow(n.r, 0.8) * (0.55 + 0.45 * Math.abs(Math.sin(n.u * 9 + 1)));
  const d = n.r * H;
  return new THREE.Vector3(Math.sin(psi) * Math.cos(phi) * d, Math.cos(psi) * d, Math.sin(psi) * Math.sin(phi) * d);
}

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const grad = g.createLinearGradient(-30, 0, 30, 0);                    // a laurel leaf: lighter in the middle, darker at the rim, side veins, a midrib
  grad.addColorStop(0, 'rgba(196, 190, 184,1)'); grad.addColorStop(0.5, 'rgba(243, 236, 224,1)'); grad.addColorStop(1, 'rgba(196, 190, 184,1)');
  g.fillStyle = grad; g.beginPath(); g.moveTo(0, -60); g.quadraticCurveTo(36, -14, 0, 60); g.quadraticCurveTo(-36, -14, 0, -60); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.6;
  for (let k = -44; k <= 40; k += 14) { g.beginPath(); g.moveTo(0, k); g.quadraticCurveTo(14, k - 8, 25 - Math.abs(k) * 0.2, k - 22); g.moveTo(0, k); g.quadraticCurveTo(-14, k - 8, -25 + Math.abs(k) * 0.2, k - 22); g.stroke(); }
  g.lineWidth = 2.4; g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo(0, -54); g.lineTo(0, 56); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function barkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#614325'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {                                         // long vertical furrows and flecks, a seeded scatter
    const x = hash(i, 71) * 128, w = 1 + hash(i, 72) * 4, y = hash(i, 73) * 256, h = 30 + hash(i, 74) * 140;
    g.fillStyle = `rgba(${hash(i, 75) > 0.5 ? '16,12,8' : '176,118,60'},${(0.18 + hash(i, 76) * 0.3).toFixed(2)})`; g.fillRect(x, y, w, h);
    g.fillRect(x - 128, y, w, h); g.fillRect(x + 128, y, w, h);          // wrap around the seam
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// the breeze: one formula for the shader (branches) and the CPU (leaves), so a leaf stays on its twig
const gustAt = (secs) => Math.max(0.15, 0.7 + 0.35 * Math.sin(secs * 0.23) + 0.25 * Math.sin(secs * 0.61 + 1.3));
const WIND_GLSL = `float hh = clamp(position.y / ${H}.0, 0.0, 1.0); float kk = hh * hh * uGust;
  transformed.x += sin(uTime * 0.9 + position.y * 0.7 + position.z * 0.4) * 0.07 * kk; transformed.z += cos(uTime * 0.7 + position.y * 0.6 + position.x * 0.4) * 0.05 * kk;`;
function windy(mat, wind) {                                              // add the sway to a stock material's vertex shader
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uGust = wind.uGust;
    sh.vertexShader = 'uniform float uTime; uniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_GLSL);
  };
  return mat;
}

// seasons: how the leaves, the light and the ground look; `frac` = the share of leaves still on the tree
const SEASONS = {
  spring: { tint: [0.9, 1.25, 0.9], both: [0.62, 1.0, 0.42], one: [1.0, 0.62, 0.82], dead: [0.2, 0.22, 0.18], k: 2.3, hemi: 0xc8f0d0, key: 0xffe8c0, ground: 0x0a1a10, ring: [0.6, 1.2, 0.6], frac: 1 },
  summer: { tint: [1, 1, 1], both: [0.2, 1.0, 0.5], one: [1.0, 0.62, 0.12], dead: [0.16, 0.17, 0.16], k: 2.4, hemi: 0x9fd8c0, key: 0xffd9a0, ground: 0x07140d, ring: [1.2, 0.8, 0.3], frac: 1 },
  autumn: { tint: [3.5, 0.5, 0.1], both: [1.0, 0.55, 0.1], one: [0.9, 0.18, 0.08], dead: [0.2, 0.13, 0.08], k: 2.3, hemi: 0xffd9a0, key: 0xffb870, ground: 0x180f07, ring: [1.3, 0.6, 0.15], frac: 0.85 },
  winter: { tint: [1.2, 1.5, 3.5], both: [0.72, 0.88, 1.0], one: [0.5, 0.62, 0.85], dead: [0.2, 0.22, 0.26], k: 1.8, hemi: 0xa8c8ff, key: 0xc8e0ff, ground: 0x0d1420, ring: [0.5, 0.8, 1.3], frac: 0.45 },
};
export const SEASON_NAMES = ['auto', 'spring', 'summer', 'autumn', 'winter'];

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.v = 0; this.len = 0; }
  tube(pts, radii, color, sides = SIDES) {
    const n = pts.length, t = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), ref = new THREE.Vector3(0, 0, 1);
    let along = this.len;
    for (let i = 0; i < n; i++) {
      if (i) along += pts[i].distanceTo(pts[i - 1]);
      t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      n1.crossVectors(t, Math.abs(t.z) > 0.9 ? ref.set(1, 0, 0) : ref.set(0, 0, 1)).normalize(); ref.set(0, 0, 1);
      n2.crossVectors(t, n1).normalize();
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2, cx = Math.cos(a), sx = Math.sin(a);
        const nx = n1.x * cx + n2.x * sx, ny = n1.y * cx + n2.y * sx, nz = n1.z * cx + n2.z * sx;
        this.pos.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
        this.nor.push(nx, ny, nz); this.col.push(color[0], color[1], color[2]); this.uv.push((s / sides) * 2, along * 1.6);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = this.v + i * sides + s, b = this.v + i * sides + ((s + 1) % sides), c = a + sides, d = b + sides;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    this.v += n * sides; this.len = along;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.idx);
    return g;
  }
}

export async function startTree3d(glCanvas, S, { onState } = {}) {
  const forced = new URLSearchParams(location.search).get('q');
  let mod;
  try { mod = await import('../olympus/render.js'); } catch (_) { return null; }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rc = null, on = false, dead = false, built = null;
  glCanvas.hidden = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  const cam = { yaw: 0.6, pitch: 0.3, dist: 15, auto: !reduced, idle: 0 };
  const target = new THREE.Vector3(0, H * 0.36, 0);
  let bark = null, glow = null, leaves = null, flies = null, ground = null, trunk = null, hemi = null, keyLight = null, ringMesh = null;
  const wind = { uTime: { value: 0 }, uGust: { value: 1 } };
  let atm = [], leafKind = [], leafBase = [], leafQuat = [], curSeason = '', fx = [], fxNames = [], weather = null, FX = null;
  let edgeAppear = [], edgeIdx = [], glowAppear = [], glowIdx = [], leafAppear = [], nodePos = new Map(), leafNodes = [], tipNodes = [];
  try {
    rc = mod.createRenderer({ canvas: glCanvas, scene, camera, env: 'night', tint: '#c8a24a', theme: { sky: '#2b2018', fog: '#2a2018', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, exposure: 1.1, maxDpr: 2, fitCamera: false,
      quality: ['ultra', 'high', 'low', 'off'].includes(forced) ? forced : undefined,
      bloom: { strength: 0.85, radius: 0.6, threshold: 0.9 }, grade: { grain: 0.03, vignette: 0.3, aberration: 0.0015, saturation: 1.08 },
      onQuality: (l) => set(l === 'ultra' || l === 'high') });
    hemi = new THREE.HemisphereLight(0x9fd8c0, 0x120c06, 0.55); scene.add(hemi);
    keyLight = new THREE.PointLight(0xffd9a0, 40, 24, 1.6); keyLight.position.set(2, 2.2, 3); scene.add(keyLight);
    ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: 0x07140d, roughness: 0.55, metalness: 0.4 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    ringMesh = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.02, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 0.3) }));
    ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 0.01; scene.add(ringMesh);
    const bk = barkTexture(); bk.repeat.set(1, 1);
    trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xc8a070, map: bk, bumpMap: bk, bumpScale: 1.5, roughness: 0.7, metalness: 0.1 }));
    trunk.position.y = 0.4; scene.add(trunk);
  } catch (_) { try { rc && rc.dispose(); } catch (e) { /* nothing to free */ } return null; }

  function set(want) {
    if (dead) return;
    want = want && !reduced;
    if (want === on) return;
    on = want; glCanvas.hidden = !on;
    if (on) rc.resize();
    if (typeof onState === 'function') onState(on);
  }
  set(rc.quality() === 'ultra' || rc.quality() === 'high');

  function disposeMeshes() {
    for (const m of [bark, glow, leaves, flies]) if (m) { scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    bark = glow = leaves = flies = null;
  }

  /** (re)build every mesh from the layout of the tree on screen; called when the root (or the data) changes */
  function build(tree) {
    disposeMeshes();
    nodePos = new Map(); edgeAppear = []; edgeIdx = []; glowAppear = []; glowIdx = []; leafAppear = []; leafNodes = []; tipNodes = [];
    const B = new Builder(), G = new Builder(), nodes = tree.nodes;
    for (const n of nodes) nodePos.set(n.id, place3(n));
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), ctl = new THREE.Vector3();
    for (const n of nodes) {
      const p = tree.byId.get(n.parent);
      if (!p) continue;
      const a = nodePos.get(p.id), b = nodePos.get(n.id), len = a.distanceTo(b);
      side.crossVectors(up, side.subVectors(b, a)).normalize().multiplyScalar(n.bend * 0.35 * len);
      ctl.addVectors(a, b).multiplyScalar(0.5).addScaledVector(up, 0.18 * len).add(side);
      const pts = [], rad = [], radG = [];
      const w0 = 0.055 * (p.width || 1) * (1.2 - 0.08 * p.depth), w1 = n.kids.length ? 0.055 * (n.width || 1) * (1.2 - 0.08 * n.depth) : 0.012;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, u = 1 - t;
        pts.push(new THREE.Vector3(u * u * a.x + 2 * u * t * ctl.x + t * t * b.x, u * u * a.y + 2 * u * t * ctl.y + t * t * b.y, u * u * a.z + 2 * u * t * ctl.z + t * t * b.z));
        rad.push(Math.max(0.008, w0 + (w1 - w0) * t));
      }
      const cut = n.status === C.CUT, tone = cut ? [0.3, 0.28, 0.26] : n.best ? [1.15, 0.88, 0.42] : [0.9, 0.62, 0.36];
      B.tube(pts, rad, tone); edgeAppear.push(n.appear); edgeIdx.push(B.idx.length);
      if (!cut) {
        const k = n.best ? 2 : 1;
        G.tube(pts, rad.map((r) => r * 0.45 * k + 0.003), n.best ? [3.2, 2.2, 0.7] : [0.1, 0.62, 0.3], 4);
        glowAppear.push(n.appear); glowIdx.push(G.idx.length);
      }
      if (!n.kids.length) leafNodes.push(n);
    }
    const bt = barkTexture();
    bark = new THREE.Mesh(B.geometry(), windy(new THREE.MeshStandardMaterial({ vertexColors: true, map: bt, bumpMap: bt, bumpScale: 1.2, roughness: 0.66, metalness: 0.2 }), wind));
    glow = new THREE.Mesh(G.geometry(), windy(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), wind));
    bark.frustumCulled = glow.frustumCulled = false; scene.add(bark, glow);
    // leaves: the surviving tips and the dead ends, strongest first when there are too many, kept in playback order
    if (leafNodes.length > MAX_LEAVES) leafNodes = leafNodes.sort((x, y) => (y.score || 0) - (x.score || 0)).slice(0, MAX_LEAVES).sort((x, y) => x.id - y.id);
    leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: leafTexture(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, depthWrite: false }), Math.max(1, leafNodes.length));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), col = new THREE.Color();
    leafKind = []; leafBase = []; leafQuat = [];
    leafNodes.forEach((n, i) => {
      const alive = n.status !== C.CUT && ((n.score || 0) > 0 || (n.oos || 0) > 0), both = (n.score || 0) > 0 && (n.oos || 0) > 0;
      e.set(hash(n.id, 21) * 6.28, hash(n.id, 22) * 6.28, hash(n.id, 23) * 6.28); q.setFromEuler(e);
      const s = alive ? 0.85 + 0.6 * Math.min(1, (n.score || 0) / (S.maxScore || 1)) : 0.6;
      M.compose(nodePos.get(n.id), q, sc.set(s, s, s)); leaves.setMatrixAt(i, M);
      leafKind.push(!alive ? 0 : both ? 2 : 1); leafBase.push(s); leafQuat.push(q.clone()); leafAppear.push(n.appear);
      leaves.setColorAt(i, col.setRGB(0.2, 1, 0.5));
    });
    leaves.instanceColor.needsUpdate = true; leaves.frustumCulled = false; scene.add(leaves);
    curSeason = '';                                                      // the next frame paints the leaves for the season
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    fg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(FLIES), 1));
    flies = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: { uPx: { value: 2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aA; uniform float uPx; varying float vA; void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * (1.0 + 2.2 * aA) * 14.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float k = max(0.0, 1.0 - dot(d, d) * 4.0); k *= k; gl_FragColor = vec4(vec3(0.7, 1.0, 0.6) * 2.4 * k * vA, k * vA); }' }));
    flies.frustumCulled = false; scene.add(flies);
    built = tree;
  }

  /** recolour the leaves and relight the scene for a season; swap the weather (petals, falling gold, snow) */
  function applySeason(name) {
    const P = SEASONS[name] || SEASONS.summer, col = new THREE.Color();
    curSeason = name;
    for (let i = 0; i < leafKind.length; i++) {
      const c = leafKind[i] === 2 ? P.both : leafKind[i] === 1 ? P.one : P.dead, k = leafKind[i] ? P.k : 1;
      leaves.setColorAt(i, col.setRGB(c[0] * k, c[1] * k, c[2] * k));
    }
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    glow.material.color.setRGB(P.tint[0], P.tint[1], P.tint[2]); hemi.color.setHex(P.hemi); keyLight.color.setHex(P.key); ground.material.color.setHex(P.ground); ringMesh.material.color.setRGB(P.ring[0], P.ring[1], P.ring[2]);
    setWeather(name);
  }
  function setWeather(name) {
    if (weather) { try { weather.stop(); } catch (_) { /* already gone */ } weather = null; }
    if (!FX || reduced) return;
    const kind = { spring: 'petals', autumn: 'laurelFall', winter: 'snow' }[name];
    if (kind && typeof FX[kind] === 'function') { try { weather = FX[kind](scene, kind === 'snow' ? { count: 500 } : {}); fxNames.push(kind); } catch (_) { weather = null; } }
  }
  async function fxStart() {
    FX = window.OLYMPUS_FX;
    if (!FX || reduced) return;
    try { await FX.load('3d'); } catch (_) { return; }
    try { if (typeof FX.godRays === 'function') { fx.push(FX.godRays(scene, { position: [3, 11, -3], intensity: 0.5 })); fxNames.push('godRays'); } } catch (_) { /* optional */ }
    setWeather(curSeason || 'summer');
  }
  fxStart();
  // the atmosphere (fx-atmos, a draw call each) joins 0.9 s after the first paint; ?noatmos=1 is the perf probe
  setTimeout(() => {
    if (dead || /[?&]noatmos=1/.test(location.search)) return;
    try {
      const ao = AT.contactAO({ radius: 2.6, strength: 0.8 }); ao.object.position.y = 0.012; scene.add(ao.object);
      const pollen = AT.dust({ count: 120, box: [13, 9, 13], color: '#9bab63', size: 4.5, drift: 0.4, seed: 47 }); pollen.object.position.y = 0.4; scene.add(pollen.object);
      atm = [ao, pollen]; AT.setQuality(atm, rc.quality() === 'ultra' ? 'ultra' : 'high');
    } catch (_) { atm = []; }
  }, 900);

  const count = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };
  const tmp = new THREE.Vector3(), wPos = new THREE.Vector3(), wS = new THREE.Vector3(), wQ = new THREE.Quaternion(), wEul = new THREE.Euler(), wM = new THREE.Matrix4();
  let frameNo = 0;

  function fit() {
    const w = glCanvas.clientWidth || 390, h = glCanvas.clientHeight || 844, asp = w / h, tf = Math.tan((camera.fov * Math.PI) / 360);
    camera.aspect = asp; camera.updateProjectionMatrix();
    cam.fit = Math.max((H * 0.5) / tf, 6.4 / (tf * asp));
  }

  return {
    get on() { return on; },
    get mode() { return '3d'; },
    get passes() { return rc.passes(); },
    get season() { return curSeason; },
    get fx() { return fxNames.slice(); },
    quality: () => rc.quality(),
    stats() { return { ...rc.stats(), leaves: leafNodes.length, edges: edgeAppear.length }; },
    orbit(dx, dy) { cam.yaw -= dx * 0.008; cam.pitch = Math.max(-0.1, Math.min(0.95, cam.pitch + dy * 0.006)); cam.idle = performance.now(); },
    zoom(f) { cam.zoom = Math.max(0.55, Math.min(1.8, (cam.zoom || 1) / f)); },
    /** the node nearest a tap (CSS px in the canvas): leaves and the lit path win close calls */
    pick(x, y, t) {
      if (!on || !built) return null;
      const w = glCanvas.clientWidth, h = glCanvas.clientHeight;
      let best = null, bd = 34 * 34;
      for (const n of built.nodes) {
        if (n.appear > t) continue;
        tmp.copy(nodePos.get(n.id)).project(camera);
        if (tmp.z > 1) continue;
        const d = ((tmp.x + 1) / 2 * w - x) ** 2 + ((1 - tmp.y) / 2 * h - y) ** 2, k = n.best ? 0.4 : !n.kids.length ? 0.8 : 1;
        if (d * k < bd) { bd = d * k; best = n; }
      }
      return best;
    },
    frame(now, t) {
      if (!on || dead) return false;
      if (built !== S.tree) build(S.tree);
      const tt = reduced ? 1e9 : t;
      bark.geometry.setDrawRange(0, edgeIdx[count(edgeAppear, tt) - 1] || 0);
      glow.geometry.setDrawRange(0, glowIdx[count(glowAppear, tt) - 1] || 0);
      const want = S.season && S.season !== 'auto' ? S.season : (tt < 2200 ? 'spring' : S.lens === 'test' ? 'autumn' : 'summer');
      if (want !== curSeason) applySeason(want);
      leaves.count = Math.floor(count(leafAppear, tt) * SEASONS[curSeason].frac);
      // wind: a gusting breeze sways the branches in the shader; the leaves follow on the CPU (every other frame)
      const secs0 = now / 1000, gust = reduced ? 0 : gustAt(secs0);
      wind.uTime.value = secs0; wind.uGust.value = gust;
      if (!reduced && (frameNo++ & 1) === 0 && leaves.count) {
        for (let i = 0; i < leaves.count; i++) {
          const b = nodePos.get(leafNodes[i].id), hh = Math.min(1, Math.max(0, b.y / H)), kk = hh * hh * gust;
          wPos.set(b.x + Math.sin(secs0 * 0.9 + b.y * 0.7 + b.z * 0.4) * 0.07 * kk, b.y, b.z + Math.cos(secs0 * 0.7 + b.y * 0.6 + b.x * 0.4) * 0.05 * kk);
          wEul.set(Math.sin(secs0 * 1.7 + i) * 0.25 * kk, 0, Math.cos(secs0 * 1.3 + i * 2) * 0.25 * kk); wQ.setFromEuler(wEul).premultiply(leafQuat[i]);
          wM.compose(wPos, wQ, wS.setScalar(leafBase[i])); leaves.setMatrixAt(i, wM);
        }
        leaves.instanceMatrix.needsUpdate = true;
      }
      if (cam.auto && now - cam.idle > 2500) cam.yaw += 0.0016;
      fit();
      const d = (cam.fit || 15) * (cam.zoom || 1);
      camera.position.set(target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, target.y + Math.sin(cam.pitch) * d, target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d);
      camera.lookAt(target);
      // fireflies: ambient ones drift among the leaves, the rest ride the tips of the branches that are growing right now
      const P = flies.geometry.attributes.position.array, A = flies.geometry.attributes.aA.array, secs = now / 1000;
      const lo = count(edgeAppear, tt - 500), hi = count(edgeAppear, tt);
      for (let i = 0; i < FLIES; i++) {
        if (i < 40 && leafNodes.length) {
          const n = leafNodes[(i * 37) % leafNodes.length], p = nodePos.get(n.id);
          P[i * 3] = p.x + Math.sin(secs * 0.6 + i) * 0.5; P[i * 3 + 1] = p.y + 0.3 + Math.sin(secs * 0.4 + i * 2) * 0.4; P[i * 3 + 2] = p.z + Math.cos(secs * 0.5 + i) * 0.5;
          A[i] = 0.35 + 0.35 * Math.sin(secs * 1.7 + i * 3);
        } else {
          const k = lo + (i - 40), nodeI = k < hi ? built.nodes[k + 1] : null, p = nodeI && nodePos.get(nodeI.id);
          if (p) { P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; A[i] = 1; } else A[i] = 0;
        }
      }
      flies.geometry.attributes.position.needsUpdate = true; flies.geometry.attributes.aA.needsUpdate = true;
      flies.material.uniforms.uPx.value = rc.renderer.getPixelRatio();
      if (atm.length) AT.update(atm, reduced ? 0 : secs, rc.renderer.getPixelRatio());
      return rc.render();
    },
    dispose() { dead = true; on = false; atm.forEach((a) => { try { scene.remove(a.object); a.object.geometry.dispose(); a.material.dispose(); } catch (_) { /* gone */ } }); glCanvas.hidden = true; for (const e of [weather, ...fx]) { try { e && e.stop(); } catch (_) { /* gone */ } } disposeMeshes(); rc.dispose(); },
  };
}
