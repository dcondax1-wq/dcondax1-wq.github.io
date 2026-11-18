// OLYMPUS atmosphere kit (tools/web_public/olympus/fx-atmos.js, 2026-11-04, JOB 4+5): the pieces that turn a flat scene into a lit
// room. ES module on the render core's three r160 (../jarvis/three.module.min.js). All shader or tiny generated textures, no files,
// no fetch. Each factory returns an object with `.object` (add it to the scene), `.update(t)` and `.setQuality(level)`; every one
// is ONE draw call (the shafts and the sparks are single merged geometries), so a scene stays inside the OLYMPUS draw budget.
//
//   dust({ count, box, color, size, drift })            motes drifting through the room, soft round, twinkling (Points)
//   embers({ count, origin, points, spread, rise, colors })  sparks / embers rising from a point, a line or several points, hot to dark (Points)
//   shafts({ count, from, to, width, color, strength }) god rays: a fan of soft additive light shafts through the haze (Mesh)
//   contactAO({ radius, strength })                     a soft round contact shadow plane to lay under an object (Mesh)
//   polishedFloor({ size, color, y, roughness })        a reflective stone floor: clear-coated, env-reflecting, faint scuffs (Mesh)
//   bronze(o) / forgedIron(o)                           PBR metals the kit lacked (bronze with verdigris, iron that glows with heat)
//   threadGlow({ color, strength })                     a fibre-glow material for ribbons / tubes (fresnel + a travelling pulse)
//   QUALITY                                             what each tier keeps: { ultra, high, low, off } -> particle fraction, shafts on
//
// Quality: setQuality('ultra'|'high'|'low'|'off') sets the particle fraction (1 / .8 / .35 / 0) and hides the shafts on low / off.
// Reduced motion: call update(0) once and never again (the scene's own loop does that): everything is a function of t.
import * as THREE from '../jarvis/three.module.min.js';

export const QUALITY = Object.freeze({
  ultra: { particles: 1, shafts: true, ao: true },
  high: { particles: 0.8, shafts: true, ao: true },
  low: { particles: 0.35, shafts: false, ao: true },
  off: { particles: 0, shafts: false, ao: false },
});
// additive light that leaves the alpha channel alone: scenes on a transparent canvas (Plutus, Ares) otherwise show dark halos where the particles' alpha builds up
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const tier = (l) => QUALITY[l] || QUALITY.high;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const col = (c, k = 1) => new THREE.Color(c).multiplyScalar(k);

const SOFT_POINT = `
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d); a *= a;
`;

// ------------------------------------------------------------------ dust
export function dust(o = {}) {
  const n = o.count || 220, box = o.box || [24, 12, 24], seed = o.seed || 5, r = rng(seed);
  const pos = new Float32Array(n * 3), ph = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * box[0]; pos[i * 3 + 1] = r() * box[1]; pos[i * 3 + 2] = (r() - 0.5) * box[2];
    ph[i * 2] = r() * 6.28; ph[i * 2 + 1] = 0.4 + r() * 0.9;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 2));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, ...ADD,
    uniforms: { uT: { value: 0 }, uPR: { value: 1 }, uBox: { value: new THREE.Vector3(...box) }, uColor: { value: col(o.color || '#ffd9a0', o.strength || 1) }, uSize: { value: o.size || 5 }, uDrift: { value: o.drift || 0.35 } },
    vertexShader: `uniform float uT, uPR, uSize, uDrift; uniform vec3 uBox; attribute vec2 ph; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uT * 0.21 * ph.y + ph.x) * 0.9 + uT * uDrift * ph.y * 0.3;
        p.y += sin(uT * 0.33 * ph.y + ph.x * 1.7) * 0.5 + uT * 0.05 * ph.y;
        p.z += cos(uT * 0.17 * ph.y + ph.x) * 0.9;
        p = mod(p + 0.5 * uBox * vec3(1.0, 0.0, 1.0), uBox * vec3(1.0, 1.0, 1.0)) - 0.5 * uBox * vec3(1.0, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * uPR * (6.0 / max(1.0, -mv.z)) * (0.6 + 0.4 * ph.y), 1.0, 28.0 * uPR);
        vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(uT * (0.8 + ph.y) + ph.x * 3.0)));
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main() { ${SOFT_POINT} gl_FragColor = vec4(uColor, a * vA * 0.55); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4;
  let q = 'high';
  return {
    object: pts, count: n,
    update(t, pr) { m.uniforms.uT.value = t; if (pr) m.uniforms.uPR.value = pr; },
    setQuality(l) { q = l; const f = tier(l).particles; g.setDrawRange(0, Math.floor(n * f)); pts.visible = f > 0; },
    quality: () => q, material: m,
  };
}

// ------------------------------------------------------------------ embers (rising sparks)
export function embers(o = {}) {
  const n = o.count || 160, spread = o.spread || [1.2, 0, 1.2], rise = o.rise || 6, seed = o.seed || 9, r = rng(seed);
  const org = o.origin || [0, 0, 0], colors = (o.colors || ['#fff3c4', '#ffb347', '#ff5a1f']).map((c) => new THREE.Color(c));
  const pos = new Float32Array(n * 3), sd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const pt = o.points && o.points.length ? o.points[Math.floor(r() * o.points.length) % o.points.length] : org;          // points: several sources (the braziers of a ring)
    pos[i * 3] = pt[0] + (r() - 0.5) * spread[0]; pos[i * 3 + 1] = pt[1]; pos[i * 3 + 2] = pt[2] + (r() - 0.5) * spread[2];
    sd[i * 4] = r(); sd[i * 4 + 1] = 0.35 + r() * 0.9; sd[i * 4 + 2] = r() * 6.28; sd[i * 4 + 3] = 0.5 + r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, ...ADD,
    uniforms: { uT: { value: 0 }, uPR: { value: 1 }, uRise: { value: rise }, uSize: { value: o.size || 7 }, uWind: { value: o.wind || 0.6 },
      uHot: { value: colors[0].clone().multiplyScalar(2.2) }, uMid: { value: colors[1 % colors.length].clone().multiplyScalar(1.6) }, uCool: { value: colors[2 % colors.length].clone() } },
    vertexShader: `uniform float uT, uPR, uRise, uSize, uWind; attribute vec4 sd; varying float vF;
      void main() {
        float f = fract(uT * 0.18 * sd.y + sd.x);
        vec3 p = position;
        p.y += f * uRise * sd.w;
        p.x += sin(uT * 1.3 * sd.y + sd.z) * 0.35 * f + uWind * f * f * 1.5;
        p.z += cos(uT * 1.1 * sd.y + sd.z) * 0.35 * f;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * uPR * (1.0 - f * 0.8) * (7.0 / max(1.0, -mv.z)), 1.0, 30.0 * uPR);
        vF = f;
      }`,
    fragmentShader: `uniform vec3 uHot, uMid, uCool; varying float vF;
      void main() { ${SOFT_POINT} vec3 c = mix(mix(uHot, uMid, smoothstep(0.0, 0.35, vF)), uCool, smoothstep(0.3, 0.9, vF)); gl_FragColor = vec4(c, a * (1.0 - vF) ); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5;
  return {
    object: pts, count: n,
    update(t, pr) { m.uniforms.uT.value = t; if (pr) m.uniforms.uPR.value = pr; },
    setQuality(l) { const f = tier(l).particles; g.setDrawRange(0, Math.floor(n * f)); pts.visible = f > 0; },
    material: m,
  };
}

// ------------------------------------------------------------------ light shafts (god rays)
export function shafts(o = {}) {
  const n = o.count || 5, from = o.from || [0, 14, 4], to = o.to || [0, 0, 0], width = o.width || 2.4, spread = o.spread || [10, 0, 6], seed = o.seed || 3, r = rng(seed);
  const pos = [], uv = [], extra = [], idx = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const tx = to[0] + (r() - 0.5) * spread[0], tz = to[2] + (r() - 0.5) * spread[2], fx = from[0] + (r() - 0.5) * 3, fz = from[2] + (r() - 0.5);
    const w0 = width * (0.15 + r() * 0.2), w1 = width * (0.8 + r() * 0.8), ph = r() * 6.28, st = 0.5 + r() * 0.7;
    for (const [dx, dz] of [[1, 0], [0.45, 0.89]]) {                         // two crossed quads so a shaft reads from any side
      const a = [fx - dx * w0, from[1], fz - dz * w0], b = [fx + dx * w0, from[1], fz + dz * w0], c = [tx + dx * w1, to[1], tz + dz * w1], d = [tx - dx * w1, to[1], tz - dz * w1];
      [a, b, c, d].forEach((p, k) => { pos.push(...p); uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1); extra.push(ph, st); });
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('ex', new THREE.Float32BufferAttribute(extra, 2)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...ADD,
    uniforms: { uT: { value: 0 }, uColor: { value: col(o.color || '#ffd9a0', 1) }, uK: { value: o.strength == null ? 0.16 : o.strength } },
    vertexShader: `attribute vec2 ex; varying vec2 vUv; varying vec2 vEx; void main() { vUv = uv; vEx = ex; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uT, uK; uniform vec3 uColor; varying vec2 vUv; varying vec2 vEx;
      void main() {
        float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        float along = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.08, vUv.y);
        float shimmer = 0.75 + 0.25 * sin(uT * vEx.y + vEx.x + vUv.y * 5.0);
        gl_FragColor = vec4(uColor * edge * along * shimmer * uK, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
  return {
    object: mesh, count: n,
    update(t) { m.uniforms.uT.value = t; },
    setQuality(l) { mesh.visible = tier(l).shafts; },
    material: m,
  };
}

// ------------------------------------------------------------------ contact AO
let aoTex = null;
function aoTexture() {
  if (aoTex) return aoTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  aoTex = new THREE.CanvasTexture(c); aoTex.colorSpace = THREE.SRGBColorSpace;
  return aoTex;
}
export function contactAO(o = {}) {
  const radius = o.radius || 1.4, m = new THREE.MeshBasicMaterial({ map: aoTexture(), transparent: true, opacity: o.strength == null ? 0.7 : o.strength, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, (o.depth || radius) * 2), m);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1;
  return { object: mesh, update() {}, setQuality(l) { mesh.visible = tier(l).ao; }, material: m };
}

// ------------------------------------------------------------------ polished floor
let scuffTex = null;
function scuffs() {
  if (scuffTex) return scuffTex;
  const n = 64, d = new Uint8Array(n * n * 4), r = rng(77);
  for (let i = 0; i < n * n; i++) { const v = Math.round(120 + 110 * r() * r()); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  scuffTex = new THREE.DataTexture(d, n, n); scuffTex.wrapS = scuffTex.wrapT = THREE.RepeatWrapping; scuffTex.repeat.set(18, 18); scuffTex.needsUpdate = true;
  return scuffTex;
}
export function polishedFloor(o = {}) {
  const size = o.size || 220;
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color || '#0d0a14', metalness: o.metalness == null ? 0.55 : o.metalness, roughness: o.roughness == null ? 0.16 : o.roughness, roughnessMap: scuffs(),
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: o.env == null ? 1.15 : o.env,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = o.y == null ? 0 : o.y;
  return { object: mesh, update() {}, setQuality(l) { m.clearcoat = l === 'off' || l === 'low' ? 0.3 : 1; m.needsUpdate = true; }, material: m };
}

// ------------------------------------------------------------------ metals the kit lacked
function noiseTex(seed, n = 64) {
  const d = new Uint8Array(n * n * 4), r = rng(seed);
  for (let i = 0; i < n * n; i++) { const v = Math.round(255 * (0.55 + 0.45 * r())); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
}
/** bronze with a faint green patina in the pits (roughness map carries the pits) */
export function bronze(o = {}) {
  return new THREE.MeshPhysicalMaterial({ color: o.color || '#b4743a', metalness: 1, roughness: o.roughness == null ? 0.34 : o.roughness, roughnessMap: noiseTex(11), clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 1.3, emissive: o.emissive || '#000000' });
}
/** iron that heats: material.userData.heat(0..1) lerps the colour toward an orange glow (HDR, so it blooms) */
export function forgedIron(o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: o.color || '#2a2622', metalness: 0.9, roughness: 0.5, roughnessMap: noiseTex(23), emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 0, envMapIntensity: 1.0 });
  m.userData.heat = (h) => { m.emissiveIntensity = Math.max(0, Math.min(1, h)) * 2.4; m.color.set(o.color || '#2a2622').lerp(new THREE.Color('#7a2a10'), Math.max(0, Math.min(1, h)) * 0.7); };
  return m;
}

// ------------------------------------------------------------------ thread glow (fibre light)
export function threadGlow(o = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, ...ADD, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uColor: { value: col(o.color || '#ffc247', o.strength || 1.6) }, uSpeed: { value: o.speed || 0.6 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT, uSpeed; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8); float pulse = 0.55 + 0.45 * sin((vUv.x - uT * uSpeed) * 24.0); gl_FragColor = vec4(uColor * (0.25 + f) * (0.6 + 0.4 * pulse), 1.0); }`,
  });
  return { material: m, update(t) { m.uniforms.uT.value = t; } };
}

/** apply one quality tier to every fx at once */
export function setQuality(list, level) { list.forEach((f) => f && f.setQuality && f.setQuality(level)); }
/** update every fx in one call */
export function update(list, t, pr) { list.forEach((f) => f && f.update && f.update(t, pr)); }
