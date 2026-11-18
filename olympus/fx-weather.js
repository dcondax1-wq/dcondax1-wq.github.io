// OLYMPUS FX, weather and particles for three.js scenes (tools/web_public/olympus/fx-weather.js; docs/OLYMPUS_FX.md). ES module.
//   lightning  rain  snow  embers  petals  fireflies  dust  laurelFall  fire
// Every one takes (scene | { scene, camera?, renderer? }, opts). opts.box = [w, h, d] and opts.center = [x, y, z] place the volume.
import { THREE, FX, ADD, parts, pal, hdr, vec, rng, pixelRatio, particles } from './fx-three.js';

const def = (name, desc, make, extra) => FX.define(name, Object.assign({ kind: 'scene', group: 'weather', desc, make }, extra || {}));
const light = (c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.45);

// ------------------------------------------------------------------ the simple GPU particle effects
def('snow', 'soft snow flakes drifting down through a box around the scene (GPU, one buffer)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 1400, 800, 260);
  particles(ctx, p, { mode: 'snow', n, additive: false, box: o.box || [26, 14, 20], center: o.center || [0, 6, -2], vel: [0.1, -0.8, 0], size: o.size || 0.16,
    sway: [0.5, 0.0, 0.4], color: o.color || '#eef3ff', seed: 11 });
  return {};
});
def('dust', 'slow glittering dust motes floating in the air (GPU, one buffer)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 900, 520, 180);
  particles(ctx, p, { mode: 'dust', n, box: o.box || [24, 10, 18], center: o.center || [0, 4, -2], vel: [0.03, 0.05, 0.02], size: o.size || 0.1,
    sway: [0.6, 0.35, 0.6], color: o.color || light(pal().bloom), seed: 5 });
  return {};
});
def('fireflies', 'glowing fireflies that wander and pulse (HDR, so they bloom)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 90, 60, 28), pl = pal();
  particles(ctx, p, { mode: 'firefly', n, box: o.box || [22, 5, 16], center: o.center || [0, 2.2, -1], vel: [0.0, 0.0, 0.0], size: o.size || 0.34,
    sway: [1.6, 0.9, 1.6], color: o.color || '#b8ff5a', color2: o.color2 || '#' + pl.bloom.getHexString(), seed: 17 });
  return {};
});
def('embers', 'glowing embers rising and cooling from orange to red', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 420, 260, 90);
  particles(ctx, p, { mode: 'ember', n, box: o.box || [10, 12, 10], center: o.center || [0, 5, 0], vel: [0.2, 1.1, 0], size: o.size || 0.16,
    sway: [0.8, 0.0, 0.8], color: o.color || '#ff3a0f', color2: o.color2 || '#ffc25a', seed: 23 });
  return {};
});
def('petals', 'rose petals tumbling down on the breeze', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 160, 100, 40);
  particles(ctx, p, { mode: 'petal', n, additive: false, box: o.box || [24, 12, 16], center: o.center || [0, 6, -1], vel: [0.5, -0.7, 0], size: o.size || 0.34,
    sway: [1.2, 0.2, 1.0], color: o.color || '#ff9bb5', color2: o.color2 || '#ffe3ec', seed: 31 });
  return {};
});
def('laurelFall', 'gold laurel leaves falling for a win (victory moments)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 130, 80, 34);
  particles(ctx, p, { mode: 'laurel', n, additive: false, box: o.box || [22, 12, 14], center: o.center || [0, 6, -1], vel: [0.2, -0.85, 0], size: o.size || 0.5,
    sway: [1.0, 0.2, 0.9], color: o.color || '#c9a227', color2: o.color2 || '#fff0a8', seed: 41 });
  return {};
});
def('fire', 'a flame: rising, cooling particles with a flickering light', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 420, 260, 100), pos = vec(o.position, [0, 0, 0]), h = o.height || 3.2;
  const sys = particles(ctx, p, { mode: 'fire', n, box: [o.radius ? o.radius * 2 : 1.2, h, o.radius ? o.radius * 2 : 1.2], center: [pos.x, pos.y + h / 2, pos.z], vel: [0, 1.5, 0], size: o.size || 0.5,
    sway: [0.35, 0, 0.35], color: o.color || '#ff6a14', color2: o.color2 || '#ffe08a', seed: 53 });
  const lamp = new THREE.PointLight(o.color || '#ff7a28', 0, 14, 2); lamp.position.set(pos.x, pos.y + 0.9, pos.z);
  ctx.scene(p.scene, lamp);
  const r = rng(9);
  ctx.tick((dt, tm) => { lamp.intensity = (o.light === undefined ? 7 : o.light) * (0.75 + 0.25 * Math.sin(tm * 13) * Math.sin(tm * 7.3) + 0.1 * (r() - 0.5)); });
  return {};
});

// ------------------------------------------------------------------ rain (line segments, the shader does all the motion)
const RVS = `attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uLen; uniform vec3 uBox, uCenter, uVel; varying float vA;
void main() {
  float sp = 0.75 + 0.5 * aSeed.x;
  vec3 pp = fract(position + uVel * sp * uTime / uBox);
  vec3 w = (pp - 0.5) * uBox + uCenter;
  w -= normalize(uVel) * uLen * aEnd * (0.7 + 0.6 * aSeed.y);
  vA = (1.0 - aEnd * 0.85) * smoothstep(0.0, 0.06, pp.y) * smoothstep(1.0, 0.94, pp.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
}`;
const RFS = `uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor * vA, 1.0); }`;
def('rain', 'slanted rain streaks falling through a box around the scene (GPU line segments)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 1500, 900, 300), r = rng(7);
  const pos = new Float32Array(n * 6), seed = new Float32Array(n * 8), end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = r(), y = r(), z = r(), s = [r(), r(), r(), r()];
    for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); seed.set(s, (i * 2 + k) * 4); end[i * 2 + k] = k; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const u = { uTime: { value: 0 }, uLen: { value: o.length || 0.9 }, uBox: { value: vec(o.box, [26, 14, 20]) }, uCenter: { value: vec(o.center, [0, 6, -2]) },
    uVel: { value: vec(o.vel, [-2.2, -22, 0]) }, uColor: { value: new THREE.Color(o.color || '#7fa6bd').multiplyScalar(0.75) } };
  const mat = new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: RVS, fragmentShader: RFS, fog: false }, ADD));
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; lines.name = 'fx-rain';
  ctx.scene(p.scene, lines);
  ctx.tick((dt, tm) => { u.uTime.value = tm; });
  return {};
});

// ------------------------------------------------------------------ lightning with a scene flash
def('lightning', 'a branching bolt every few seconds with a real flash of light on the scene (never on off/reduced motion); strike() fires one now', (t, o, ctx) => {
  const p = parts(t, o), scene = p.scene, pl = pal(), maxSeg = 96, r = rng(o.seed || 13);
  const top = vec(o.position, [0, 14, -6]), ground = o.ground === undefined ? 0 : o.ground, spread = o.spread || 5;
  const pos = new Float32Array(maxSeg * 12 * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, 0);
  const col = new THREE.Color(o.color || '#cfe0ff'), mat = new THREE.MeshBasicMaterial(Object.assign({ color: hdr(col, 3.5), side: THREE.DoubleSide, fog: false }, ADD));
  const bolt = new THREE.Mesh(geo, mat); bolt.frustumCulled = false; bolt.visible = false; bolt.name = 'fx-bolt';
  const lamp = new THREE.PointLight(col, 0, 90, 1.4), sky = new THREE.HemisphereLight(0xdfe8ff, 0x303a66, 0);
  lamp.position.copy(top); lamp.position.y -= 3;
  ctx.scene(scene, bolt); ctx.scene(scene, lamp); ctx.scene(scene, sky);
  const bg = scene.background && scene.background.isColor ? scene.background : null, bg0 = bg ? bg.clone() : null;
  const fog = scene.fog && scene.fog.color ? scene.fog.color : null, fog0 = fog ? fog.clone() : null;
  ctx.add(() => { if (bg) bg.copy(bg0); if (fog) fog.copy(fog0); });
  let nv = 0;
  const quad = (a, b, w) => {                       // two crossed ribbons along a -> b (so it reads from any side)
    const d = new THREE.Vector3().subVectors(b, a), s = new THREE.Vector3(1, 0, 0), q = new THREE.Vector3();
    if (Math.abs(d.clone().normalize().dot(s)) > 0.9) s.set(0, 0, 1);
    for (let k = 0; k < 2; k++) {
      q.crossVectors(d, s).normalize().multiplyScalar(w);
      const v = [a.clone().sub(q), a.clone().add(q), b.clone().add(q), b.clone().sub(q)], idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx) { if (nv >= maxSeg * 12) return; pos.set([v[i].x, v[i].y, v[i].z], nv * 3); nv++; }
      s.copy(q).normalize();
    }
  };
  const seg = (a, b, w, depth) => {
    if (depth === 0) { quad(a, b, w); return; }
    const m = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    m.x += (r() - 0.5) * len * 0.45; m.z += (r() - 0.5) * len * 0.45;
    seg(a, m, w, depth - 1); seg(m, b, w, depth - 1);
    if (depth >= 2 && depth <= 3 && r() < 0.5 && ctx.tier !== 'low') {      // a branch
      const e = m.clone().add(new THREE.Vector3((r() - 0.5) * 7, -len * (0.6 + r()), (r() - 0.5) * 5));
      seg(m, e, w * 0.55, depth - 2);
    }
  };
  let flash = 0, was = 0, age = 9, next = 1.5, peak = 0;
  const strike = () => {
    nv = 0;
    const a = top.clone().add(new THREE.Vector3((r() - 0.5) * spread, 0, (r() - 0.5) * spread));
    const b = new THREE.Vector3(a.x + (r() - 0.5) * spread * 1.4, ground, a.z + (r() - 0.5) * spread * 1.4);
    seg(a, b, o.width || 0.07, ctx.pick(5, 5, 4));
    geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, nv);
    bolt.visible = true; age = 0; peak = o.flash === undefined ? 1 : o.flash;
    lamp.position.set(a.x, a.y - 4, a.z);
    if (o.sound && window.OLYMPUS && window.OLYMPUS.sfx) ctx.timeout(() => window.OLYMPUS.sfx('thunder'), 380);
  };
  const lo = o.every ? o.every[0] : ctx.pick(3, 4, 7), hi = o.every ? o.every[1] : ctx.pick(8, 10, 14);
  ctx.tick((dt) => {
    age += dt; next -= dt;
    if (next <= 0 && o.auto !== false) { strike(); next = lo + r() * (hi - lo); }
    // the flash: a hard flicker (two peaks) that dies away in ~0.35 s
    const f = age > 0.5 ? 0 : peak * (age < 0.05 ? 1 : age < 0.09 ? 0.25 : age < 0.14 ? 0.9 : Math.exp(-(age - 0.14) * 9));
    flash = f; bolt.visible = age < 0.3; mat.opacity = 1;
    lamp.intensity = f * 900; sky.intensity = f * 2.2;
    if (bg) bg.copy(bg0).lerp(col, f * 0.18);
    if (fog) fog.copy(fog0).lerp(col, f * 0.25);
    if (typeof o.onFlash === 'function' && (f > 0.001 || was > 0.001)) o.onFlash(f);
    was = f;
  });
  return { strike, flash: () => flash };
});
