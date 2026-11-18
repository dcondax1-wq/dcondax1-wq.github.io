// OLYMPUS FX, light and sky for three.js scenes (tools/web_public/olympus/fx-sky.js; docs/OLYMPUS_FX.md). ES module.
//   godRays  aurora  nebulaDome  volumetricFog  heatShimmer  starWarp  lensFlare
// All additive / soft: no post-processing pass, so they sit on top of any scene and the render core's bloom does the rest.
import { THREE, FX, ADD, parts, pal, hdr, vec, rng, glowTexture, NOISE } from './fx-three.js';

const def = (name, desc, make, extra) => FX.define(name, Object.assign({ kind: 'scene', group: 'sky', desc, make }, extra || {}));
const noiseDefs = (ctx) => ({ NOCT: ctx.pick(5, 4, 2) });

// ------------------------------------------------------------------ god rays: soft cones of light from a source
const GVS = `varying vec2 vUv; varying float vFace;
void main() { vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFace = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const GFS = `uniform float uTime, uPower, uSeed; uniform vec3 uColor; varying vec2 vUv; varying float vFace;
void main() {
  float along = 1.0 - vUv.y;
  float core = pow(vFace, 1.5);
  float streak = 0.62 + 0.38 * sin(vUv.x * 18.8496 + uSeed + uTime * 0.3) * sin(vUv.x * 31.4159 - uTime * 0.2 + uSeed * 2.0);
  float fall = pow(1.0 - along, 1.3) * smoothstep(0.0, 0.04, along);
  gl_FragColor = vec4(uColor * core * streak * fall * uPower, 1.0);
}`;
def('godRays', 'volumetric light shafts falling from a source (soft additive cones that sway)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 9, 6, 3), r = rng(o.seed || 4), L = o.length || 15;
  const src = vec(o.position, [0, 14, -4]), group = new THREE.Group(), mats = [];
  const col = new THREE.Color(o.color || '#' + pal().bloom.clone().lerp(new THREE.Color('#fff4d6'), 0.55).getHexString());
  for (let i = 0; i < n; i++) {
    const rad = L * (0.07 + 0.1 * r()), geo = new THREE.ConeGeometry(rad, L, ctx.pick(32, 24, 14), 1, true);
    geo.translate(0, -L / 2, 0);
    const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uPower: { value: (o.intensity || 0.55) * (0.6 + 0.6 * r()) }, uSeed: { value: r() * 6 }, uColor: { value: col.clone() } },
      vertexShader: GVS, fragmentShader: GFS }, ADD));
    const m = new THREE.Mesh(geo, mat), az = (i / n) * Math.PI * 2 + r(), tilt = (o.spread === undefined ? 0.28 : o.spread) * (0.3 + r());
    m.rotation.set(Math.cos(az) * tilt, 0, Math.sin(az) * tilt); m.userData = { rx: m.rotation.x, rz: m.rotation.z, ph: r() * 6 };
    m.renderOrder = 2; group.add(m); mats.push(mat);
  }
  group.position.copy(src); group.frustumCulled = false;
  ctx.scene(p.scene, group);
  ctx.tick((dt, tm) => {
    mats.forEach((m) => { m.uniforms.uTime.value = tm; });
    group.children.forEach((m) => { const u = m.userData; m.rotation.x = u.rx + Math.sin(tm * 0.21 + u.ph) * 0.05; m.rotation.z = u.rz + Math.cos(tm * 0.17 + u.ph) * 0.05; });
  });
  return {};
});

// ------------------------------------------------------------------ aurora curtains
const AVS = `uniform float uTime, uSeed, uBend; varying vec2 vUv;
void main() { vUv = uv; vec3 p = position;
  p.z += sin(p.x * 0.07 + uSeed + uTime * 0.15) * uBend + sin(p.x * 0.19 - uTime * 0.2 + uSeed * 3.0) * uBend * 0.3;
  p.y += sin(p.x * 0.11 + uTime * 0.1 + uSeed) * 1.5 * uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const AFS = `${NOISE}
uniform float uTime, uSeed, uPower; uniform vec3 uC1, uC2, uC3; varying vec2 vUv;
void main() {
  float h = vUv.y;
  float band = fxFbm(vec3(vUv.x * 5.0 + uSeed, uTime * 0.11, uSeed));
  float rays = 0.5 + 0.5 * sin(vUv.x * 90.0 + band * 9.0 + uTime * 0.5);
  float curtain = smoothstep(0.0, 0.08, h) * pow(1.0 - h, 1.5);
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float a = curtain * (0.25 + 0.9 * band) * (0.45 + 0.55 * rays) * edge;
  vec3 c = mix(uC1, uC2, smoothstep(0.0, 0.55, h + band * 0.35)); c = mix(c, uC3, smoothstep(0.55, 1.0, h + band * 0.3));
  gl_FragColor = vec4(c * a * uPower, 1.0);
}`;
def('aurora', 'aurora borealis curtains rippling across the sky, in the theme\'s colours', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.pick(4, 3, 2), pl = pal(), r = rng(o.seed || 8), W = o.width || 90, H = o.height || 22;
  const cols = o.colors ? o.colors.map((c) => new THREE.Color(c)) : [new THREE.Color('#7f8a52'), pl.bloom.clone(), pl.accent.clone()];
  const mats = [], g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const geo = new THREE.PlaneGeometry(W, H, ctx.pick(120, 90, 40), 1), mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false,
      defines: noiseDefs(ctx), uniforms: { uTime: { value: 0 }, uSeed: { value: r() * 20 }, uBend: { value: 5 + 5 * r() }, uPower: { value: (o.intensity || 1.1) * (1 - i * 0.12) },
        uC1: { value: cols[0] }, uC2: { value: cols[1 % cols.length] }, uC3: { value: cols[2 % cols.length] } }, vertexShader: AVS, fragmentShader: AFS }, ADD));
    const m = new THREE.Mesh(geo, mat); m.position.set((r() - 0.5) * 30, 0, -i * 9); m.rotation.y = (r() - 0.5) * 0.4;
    g.add(m); mats.push(mat);
  }
  g.position.copy(vec(o.position, [0, 20, -44])); g.renderOrder = -3;
  ctx.scene(p.scene, g);
  ctx.tick((dt, tm) => { mats.forEach((m) => { m.uniforms.uTime.value = tm; }); });
  return {};
});

// ------------------------------------------------------------------ nebula sky dome
const NVS = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const NFS = `${NOISE}
uniform float uTime, uPower; uniform vec3 uC1, uC2, uC3; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float a = fxFbm(d * 2.3 + vec3(uTime * 0.012, 0.0, uTime * 0.008));
  float b = fxFbm(d * 4.6 - vec3(0.0, uTime * 0.02, 5.0) + a * 1.4);
  float dust = smoothstep(0.35, 0.8, a);
  vec3 c = uC1 * pow(a, 2.2) * 1.3 + uC2 * pow(b, 3.0) * 1.7 * dust + uC3 * smoothstep(0.55, 0.95, a * b * 1.7) * 1.1;
  float horizon = 0.35 + 0.65 * smoothstep(-0.25, 0.5, d.y);
  gl_FragColor = vec4(c * uPower * horizon, 1.0);
}`;
def('nebulaDome', 'a full sky dome of drifting nebula clouds (procedural, follows the camera)', (t, o, ctx) => {
  const p = parts(t, o), pl = pal(), R = o.radius || 140;
  const geo = new THREE.SphereGeometry(R, ctx.pick(48, 32, 20), ctx.pick(24, 16, 10));
  const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.BackSide, fog: false, defines: noiseDefs(ctx),
    uniforms: { uTime: { value: 0 }, uPower: { value: o.intensity || 0.4 }, uC1: { value: pl.emissive.clone() }, uC2: { value: pl.bloom.clone() }, uC3: { value: pl.accent.clone() } },
    vertexShader: NVS, fragmentShader: NFS }, ADD, { depthTest: false }));
  const dome = new THREE.Mesh(geo, mat); dome.renderOrder = -10; dome.frustumCulled = false;
  ctx.scene(p.scene, dome);
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; if (p.camera) dome.position.copy(p.camera.position); });
  return {};
});

// ------------------------------------------------------------------ volumetric fog (stacked drifting noise sheets)
const FVS = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FFS = `${NOISE}
uniform float uTime, uOpacity, uLayer; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
void main() {
  float n = fxFbm(vec3(vW.xz * 0.11 + vec2(uTime * 0.025 * (1.0 + uLayer * 0.4), uTime * 0.012), uTime * 0.04 + uLayer * 7.0));
  float edge = smoothstep(0.5, 0.18, length(vUv - 0.5));
  float a = smoothstep(0.3, 0.78, n) * edge * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;
def('volumetricFog', 'layers of drifting ground fog (stacked noise sheets, themed)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.pick(7, 5, 3), pl = pal(), size = o.size || 60, g = new THREE.Group(), mats = [];
  const col = new THREE.Color(o.color || '#' + pl.fog.clone().lerp(pl.bloom, 0.45).getHexString());
  for (let i = 0; i < n; i++) {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, defines: noiseDefs(ctx),
      uniforms: { uTime: { value: 0 }, uLayer: { value: i }, uOpacity: { value: (o.density || 0.5) * (1 - i / (n + 2)) }, uColor: { value: col.clone() } },
      vertexShader: FVS, fragmentShader: FFS });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.4 + i * (o.spacing || 0.55); m.renderOrder = 1;
    g.add(m); mats.push(mat);
  }
  g.position.copy(vec(o.position, [0, 0, -4]));
  ctx.scene(p.scene, g);
  ctx.tick((dt, tm) => { mats.forEach((m) => { m.uniforms.uTime.value = tm; }); });
  return {};
});

// ------------------------------------------------------------------ heat shimmer (rising warm haze)
const HFS = `${NOISE}
uniform float uTime, uPower; uniform vec3 uColor; varying vec2 vUv;
void main() {
  float x = vUv.x + 0.04 * sin(vUv.y * 14.0 - uTime * 2.2);
  float n = fxFbm(vec3(x * 6.0, vUv.y * 3.5 - uTime * 0.7, uTime * 0.25));
  float band = smoothstep(0.42, 0.72, n);
  float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.5, 0.1, abs(vUv.x - 0.5));
  gl_FragColor = vec4(uColor * band * fade * uPower, 1.0);
}`;
def('heatShimmer', 'rising heat haze: wavering warm wisps above a hot surface (a drawn haze, not a refraction pass)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.pick(3, 2, 1), g = new THREE.Group(), mats = [], w = o.width || 5, h = o.height || 5;
  for (let i = 0; i < n; i++) {
    const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false, defines: noiseDefs(ctx),
      uniforms: { uTime: { value: 0 }, uPower: { value: o.intensity || 0.35 }, uColor: { value: new THREE.Color(o.color || '#ffb078') } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: HFS }, ADD));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat); m.position.y = h / 2; m.rotation.y = (i / n) * Math.PI; g.add(m); mats.push(mat);
  }
  g.position.copy(vec(o.position, [0, 0, 0]));
  ctx.scene(p.scene, g);
  ctx.tick((dt, tm) => { mats.forEach((m) => { m.uniforms.uTime.value = tm + 3.7; }); });
  return {};
});

// ------------------------------------------------------------------ star warp (light-speed streaks)
def('starWarp', 'stars stream past the camera as streaks (hyperspace); speed() changes the rush', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 900, 600, 240), r = rng(o.seed || 6), far = o.far || 70, near = 1;
  const pos = new Float32Array(n * 6), colr = new Float32Array(n * 6), xy = new Float32Array(n * 2), z = new Float32Array(n), tint = new THREE.Color(o.color || '#cfe0ff');
  const place = (i, zz) => { const a = r() * 6.2832, rad = 1.2 + r() * (o.radius || 22); xy[i * 2] = Math.cos(a) * rad; xy[i * 2 + 1] = Math.sin(a) * rad; z[i] = zz; };
  for (let i = 0; i < n; i++) { place(i, -near - r() * far); const k = 0.5 + r(); colr.set([tint.r * k * 2, tint.g * k * 2, tint.b * k * 2, 0, 0, 0], i * 6); }
  const geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', pa); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const mat = new THREE.LineBasicMaterial(Object.assign({ vertexColors: true, fog: false }, ADD));
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false;
  ctx.scene(p.scene, lines);
  let speed = o.speed || 30;
  ctx.tick((dt) => {
    if (p.camera) { lines.position.copy(p.camera.position); lines.quaternion.copy(p.camera.quaternion); }
    const len = speed * 0.05 + 0.4;
    for (let i = 0; i < n; i++) {
      z[i] += speed * dt * (0.6 + 0.8 * ((i * 7) % 10) / 10);
      if (z[i] > -near) place(i, -far);
      const b = i * 6, x = xy[i * 2], y = xy[i * 2 + 1];
      pos[b] = x; pos[b + 1] = y; pos[b + 2] = z[i]; pos[b + 3] = x; pos[b + 4] = y; pos[b + 5] = z[i] - len;
    }
    pa.needsUpdate = true;
  });
  return { set: (v) => { speed = +v || 0; } };
});

// ------------------------------------------------------------------ lens flare
def('lensFlare', 'a bright glare with a chain of ghost rings across the screen (pass opts.camera or a { scene, camera } target for the ghosts)', (t, o, ctx) => {
  const p = parts(t, o), src = vec(o.position, [6, 9, -10]), col = new THREE.Color(o.color || '#ffe6b0'), g = new THREE.Group();
  const glow = glowTexture(), ring = glowTexture('ring'), streak = glowTexture('streak');
  ctx.add(() => { glow.dispose(); ring.dispose(); streak.dispose(); });
  const mk = (map, size, k, c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map, color: hdr(c || col, k), fog: false, depthTest: false, sizeAttenuation: false }, ADD)));
    s.scale.setScalar(size); s.renderOrder = 50; s.frustumCulled = false; g.add(s); return s;
  };
  const core = mk(glow, 0.42, 2.4), halo = mk(glow, 1.2, 0.55);
  const streakS = mk(streak, 1.6, 1.1); streakS.scale.set(1.6, 0.12, 1);
  const stops = [0.65, 0.3, -0.25, -0.6, -1.0, -1.5].slice(0, ctx.pick(6, 4, 2)), cs = ['#7fa6bd', '#e08a6b', '#aaffd0', '#ffd890', '#7fa6bd', '#ffffff'];
  const ghosts = stops.map((k, i) => ({ k, s: mk(i % 2 ? ring : glow, 0.12 + 0.14 * ((i * 5) % 4) / 3, 0.5, new THREE.Color(cs[i % cs.length])) }));
  g.userData.sprites = [core, halo, streakS].concat(ghosts.map((x) => x.s));
  ctx.scene(p.scene, g);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  ctx.tick(() => {
    if (!p.camera) { core.position.copy(src); halo.position.copy(src); streakS.position.copy(src); return; }
    v.copy(src).project(p.camera);
    const vis = v.z < 1 ? Math.max(0, 1 - Math.max(Math.abs(v.x), Math.abs(v.y)) * 0.75) : 0, show = vis > 0.001;
    g.userData.sprites.forEach((s) => { s.visible = show; });
    if (!show) return;
    [core, halo, streakS].forEach((s) => { s.position.copy(src); s.material.opacity = vis; });
    ghosts.forEach((gh) => { w.set(v.x * gh.k, v.y * gh.k, 0.5).unproject(p.camera); gh.s.position.copy(w); gh.s.material.opacity = vis * (0.35 + 0.65 * (1 - Math.abs(gh.k) * 0.4)); });
  });
  return {};
});
