// OLYMPUS FX, surfaces, panels and one-shots for three.js scenes (tools/web_public/olympus/fx-surface.js; docs/OLYMPUS_FX.md). ES module.
//   caustics  marbleFloor  waterSurface  lavaCracks  glassPanel  hologram  glowOutline  shockwave  lightTrails
import { THREE, FX, ADD, parts, pal, hdr, vec, rng, NOISE } from './fx-three.js';
import { marble, glass } from './materials.js';

const def = (name, desc, make, extra) => FX.define(name, Object.assign({ kind: 'scene', group: 'surfaces', desc, make }, extra || {}));
const noiseDefs = (ctx) => ({ NOCT: ctx.pick(5, 4, 2) });
const floorGeo = (size, seg) => { const g = new THREE.PlaneGeometry(size, size, seg || 1, seg || 1); g.rotateX(-Math.PI / 2); return g; };
const PLAIN_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const keepTextures = (m) => { for (const k in m) if (m[k] && m[k].isTexture) m[k].__olyKeep = true; return m; };

// ------------------------------------------------------------------ caustics floor
const CFS = `
#define TAU 6.28318530718
uniform float uTime, uPower, uScale; uniform vec3 uColor; varying vec2 vUv;
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * TAU, TAU) - 250.0, i = p; float c = 1.0, inten = 0.005;
  for (int n = 0; n < MAXIT; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= float(MAXIT); c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main() {
  float edge = smoothstep(0.5, 0.12, length(vUv - 0.5));
  float c = caustic(vUv * uScale, uTime * 0.5 + 23.0);
  gl_FragColor = vec4(uColor * c * uPower * edge, 1.0);
}`;
def('caustics', 'rippling water-light caustics dancing on a floor (additive, themed)', (t, o, ctx) => {
  const p = parts(t, o), size = o.size || 40, pl = pal();
  const mat = new THREE.ShaderMaterial(Object.assign({ fog: false, defines: { MAXIT: ctx.pick(5, 4, 3) },
    uniforms: { uTime: { value: 0 }, uPower: { value: o.intensity || 0.55 }, uScale: { value: size / 9 }, uColor: { value: new THREE.Color(o.color || '#' + pl.bloom.clone().lerp(new THREE.Color('#7fa6bd'), 0.5).getHexString()) } },
    vertexShader: PLAIN_VS, fragmentShader: CFS }, ADD));
  const m = new THREE.Mesh(floorGeo(size), mat); m.position.copy(vec(o.position, [0, 0.03, 0])); m.renderOrder = 1;
  ctx.scene(p.scene, m);
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; });
  return {};
});

// ------------------------------------------------------------------ reflective marble floor (planar reflection on ultra / high)
const RVS = 'uniform mat4 uTex; varying vec4 vProj; varying vec2 vUv; void main() { vUv = uv; vProj = uTex * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RFS = `uniform sampler2D tRefl; uniform float uStrength; varying vec4 vProj; varying vec2 vUv;
void main() {
  vec3 c = texture2DProj(tRefl, vProj).rgb;
  float edge = smoothstep(0.5, 0.3, length(vUv - 0.5));
  gl_FragColor = vec4(c * uStrength * edge, 1.0);
}`;
def('marbleFloor', 'a polished veined-marble floor; on ultra / high it also mirrors the scene (planar reflection, needs opts.renderer or a { scene, camera, renderer } target)', (t, o, ctx) => {
  const p = parts(t, o), size = o.size || 26, y = o.y === undefined ? 0 : o.y;
  const base = new THREE.Mesh(floorGeo(size), keepTextures(marble({ gold: o.gold !== false, color: o.color || '#34303f', vein: '#9a93b8' })));
  base.position.y = y; base.receiveShadow = true;
  ctx.scene(p.scene, base);
  const r = p.renderer;
  if (!r || ctx.tier === 'low') return {};
  const res = ctx.pick(512, 384), rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, samples: 0 });
  rt.texture.name = 'fx.marble.reflection';
  const u = { tRefl: { value: rt.texture }, uTex: { value: new THREE.Matrix4() }, uStrength: { value: o.reflect === undefined ? 0.5 : o.reflect } };
  const mat = new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: RVS, fragmentShader: RFS, fog: false }, ADD));
  const mirror = new THREE.Mesh(floorGeo(size), mat); mirror.position.y = y + 0.004; mirror.renderOrder = 1;
  ctx.scene(p.scene, mirror); ctx.add(() => rt.dispose());
  const rp = new THREE.Vector3(), cp = new THREE.Vector3(), rot = new THREE.Matrix4(), nrm = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3(), look = new THREE.Vector3(),
    q = new THREE.Vector4(), clip = new THREE.Vector4(), plane = new THREE.Plane(), vcam = new THREE.PerspectiveCamera(), tm = new THREE.Matrix4();
  let skip = 0;
  mirror.onBeforeRender = (renderer, scene, camera) => {
    if (renderer.getRenderTarget() === rt || (ctx.tier === 'high' && (skip++ & 1))) return;
    rp.setFromMatrixPosition(mirror.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(mirror.matrixWorld); nrm.set(0, 1, 0).applyMatrix4(rot);
    view.subVectors(rp, cp);
    if (view.dot(nrm) > 0) return;
    view.reflect(nrm).negate().add(rp);
    rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cp);
    target.subVectors(rp, look).reflect(nrm).negate().add(rp);
    vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm); vcam.lookAt(target);
    vcam.far = camera.far; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mirror.matrixWorld);
    u.uTex.value.copy(tm);
    plane.setFromNormalAndCoplanarPoint(nrm, rp).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vcam.projectionMatrix, e = pm.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0]; q.y = (Math.sign(clip.y) + e[9]) / e[5]; q.z = -1; q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    const cur = renderer.getRenderTarget(), xr = renderer.xr.enabled, sh = renderer.shadowMap.autoUpdate, vis = mirror.visible;
    mirror.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, vcam);
    renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sh; renderer.setRenderTarget(cur); mirror.visible = vis;
  };
  return {};
});

// ------------------------------------------------------------------ water surface
const WVS = `uniform float uTime, uAmp; varying vec3 vN, vW;
float hgt(vec2 p) { return sin(p.x * 0.35 + uTime * 0.9) * 0.5 + sin(p.y * 0.5 - uTime * 0.7) * 0.4 + sin((p.x + p.y) * 0.8 + uTime * 1.3) * 0.2 + sin(p.x * 1.7 - p.y * 1.3 + uTime * 2.1) * 0.08; }
void main() {
  vec3 p = position; float e = 0.06, d = hgt(p.xy), dx = hgt(p.xy + vec2(e, 0.0)) - d, dy = hgt(p.xy + vec2(0.0, e)) - d;
  p.z += d * uAmp;
  vN = normalize(mat3(modelMatrix) * normalize(vec3(-dx / e * uAmp, -dy / e * uAmp, 1.0)));
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WFS = `uniform vec3 uDeep, uSky, uSun; uniform float uOpacity, uR; varying vec3 vN, vW;
void main() {
  vec3 V = normalize(cameraPosition - vW), N = normalize(vN), R = reflect(-V, N);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 sky = mix(uDeep * 1.4, uSky, smoothstep(-0.1, 0.8, R.y));
  float sun = pow(max(dot(R, normalize(uSun)), 0.0), 320.0);
  vec3 c = mix(uDeep * 0.45, sky, 0.12 + 0.88 * fres) + vec3(1.0, 0.95, 0.85) * sun * 1.6;
  gl_FragColor = vec4(c, uOpacity * smoothstep(uR, uR * 0.55, length(vW.xz)));
}`;
def('waterSurface', 'a rolling water surface with wave normals, sky reflection and a sun glint', (t, o, ctx) => {
  const p = parts(t, o), size = o.size || 60, pl = pal();
  const geo = new THREE.PlaneGeometry(size, size, ctx.pick(160, 110, 50), ctx.pick(160, 110, 50)); // wave height along local z; the mesh lies flat
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: true, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uAmp: { value: o.amplitude || 0.35 }, uOpacity: { value: o.opacity || 0.94 }, uR: { value: size / 2 },
      uDeep: { value: new THREE.Color(o.color || '#' + pl.fog.clone().lerp(new THREE.Color('#0a3a5a'), 0.6).getHexString()) },
      uSky: { value: pl.sky.clone().lerp(pl.bloom, 0.35).multiplyScalar(0.9) }, uSun: { value: vec(o.sun, [0.4, 0.5, -1]) } },
    vertexShader: WVS, fragmentShader: WFS });
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.copy(vec(o.position, [0, -0.1, 0]));
  ctx.scene(p.scene, m);
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; });
  return {};
});

// ------------------------------------------------------------------ lava with glowing cracks
const LFS = `${NOISE}
uniform float uTime, uPower; uniform vec3 uHot, uMid; varying vec2 vUv;
vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
void main() {
  vec2 uv = vUv * 9.0;
  uv += (vec2(fxFbm(vec3(uv * 0.5, uTime * 0.08)), fxFbm(vec3(uv * 0.5 + 9.0, uTime * 0.08))) - 0.5) * 1.4;
  vec2 n = floor(uv), f = fract(uv); float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = h2(n + g); o = 0.5 + 0.5 * sin(uTime * 0.25 + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float edge = d2 - d1, crack = 1.0 - smoothstep(0.0, 0.16, edge);
  float crust = fxFbm(vec3(vUv * 26.0, 1.0)), pulse = 0.75 + 0.25 * sin(uTime * 1.6 + d1 * 9.0);
  vec3 rock = vec3(0.035, 0.022, 0.02) * (0.5 + crust);
  vec3 lava = mix(uMid, uHot, smoothstep(0.0, 1.0, crack * pulse)) * (1.0 + 2.2 * crack) * uPower;
  float edgeFade = smoothstep(0.5, 0.38, length(vUv - 0.5));
  gl_FragColor = vec4((rock + lava * crack * (0.6 + 0.8 * crust)) * edgeFade, 1.0);
}`;
def('lavaCracks', 'a dark crust with glowing lava cracks that flow and pulse (HDR, so the cracks bloom)', (t, o, ctx) => {
  const p = parts(t, o), size = o.size || 30;
  const mat = new THREE.ShaderMaterial({ fog: false, defines: noiseDefs(ctx),
    uniforms: { uTime: { value: 0 }, uPower: { value: o.intensity || 0.7 }, uHot: { value: new THREE.Color(o.hot || '#ffd27a') }, uMid: { value: new THREE.Color(o.color || '#ff3d0a') } },
    vertexShader: PLAIN_VS, fragmentShader: LFS });
  const m = new THREE.Mesh(floorGeo(size), mat); m.position.copy(vec(o.position, [0, 0.01, 0]));
  ctx.scene(p.scene, m);
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; });
  return {};
});

// ------------------------------------------------------------------ glass refraction panel
function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
def('glassPanel', 'a thick glass pane that refracts what is behind it (transmission on ultra only, a tinted reflective pane on high and low) with a lit edge', (t, o, ctx) => {
  const p = parts(t, o), w = o.width || 4, h = o.height || 2.6, pl = pal();
  const geo = new THREE.ExtrudeGeometry(rounded(w, h, 0.28), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: ctx.pick(5, 3, 1), curveSegments: ctx.pick(16, 10, 5) });
  geo.center();
  const rim = '#' + pl.accent.getHexString();
  const mat = keepTextures(glass({ color: o.color || '#cfe8ff', rim, transmission: ctx.tier === 'ultra' }));
  const m = new THREE.Mesh(geo, mat), g = new THREE.Group();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 40), new THREE.LineBasicMaterial(Object.assign({ color: hdr(pl.accent, 2.2), fog: false }, ADD)));
  g.add(m); g.add(edges); g.position.copy(vec(o.position, [0, 2.2, 3]));
  ctx.scene(p.scene, g);
  const base = g.position.y;
  ctx.tick((dt, tm) => { g.position.y = base + Math.sin(tm * 0.8) * 0.08; g.rotation.y = Math.sin(tm * 0.35) * 0.25; g.rotation.x = Math.sin(tm * 0.27) * 0.06; });
  return { group: g };
});

// ------------------------------------------------------------------ hologram scanlines (on a target, or a small projector scene)
const HVS = `uniform float uTime; varying vec3 vW, vN, vV;
void main() {
  vec3 p = position; vec4 w0 = modelMatrix * vec4(p, 1.0);
  float g = step(0.965, fract(uTime * 0.27)); p.x += g * sin(w0.y * 30.0 + uTime * 40.0) * 0.06;
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HFS2 = `uniform float uTime, uLines; uniform vec3 uColor; varying vec3 vW, vN, vV;
void main() {
  float scan = 0.5 + 0.5 * sin(vW.y * uLines - uTime * 3.0);
  float band = pow(0.5 + 0.5 * sin(vW.y * 1.4 - uTime * 1.3), 8.0);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float flick = 0.9 + 0.1 * sin(uTime * 41.0) * sin(uTime * 13.0);
  vec3 c = uColor * (0.12 + fres * 0.9 + band * 0.5) * (0.45 + 0.55 * scan) * flick;
  gl_FragColor = vec4(c, 1.0);
}`;
function holoMaterial(ctx, color) {
  return new THREE.ShaderMaterial(Object.assign({ uniforms: { uTime: { value: 0 }, uLines: { value: ctx.pick(90, 70, 40) }, uColor: { value: new THREE.Color(color) } },
    vertexShader: HVS, fragmentShader: HFS2, side: THREE.DoubleSide, fog: false }, ADD));
}
/** a child mesh on every mesh of `target` that shares its geometry; undone on stop (the geometry is never freed) */
function overlay(ctx, target, material) {
  const kids = [];
  const meshes = []; target.traverse((n) => { if (n.isMesh && !n.userData.fxOverlay) meshes.push(n); });
  for (const m of meshes) { const k = new THREE.Mesh(m.geometry, material); k.userData.fxOverlay = true; k.renderOrder = 3; m.add(k); kids.push(k); }
  ctx.add(() => { kids.forEach((k) => k.parent && k.parent.remove(k)); material.dispose(); });
  return kids;
}
def('hologram', 'scanlines, a rolling light band, fresnel glow and flicker: on opts.target (any Object3D) or as a small hologram projector', (t, o, ctx) => {
  const p = parts(t, o), mat = holoMaterial(ctx, o.color || '#' + pal().bloom.clone().lerp(new THREE.Color('#7fa6bd'), 0.6).getHexString());
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; });
  if (o.target) { overlay(ctx, o.target, mat); return {}; }
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.17, ctx.pick(160, 110, 60), ctx.pick(18, 12, 8)), mat);
  body.position.y = 2.1;
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 8, 64), new THREE.MeshBasicMaterial(Object.assign({ color: hdr(pal().bloom, 2.5), fog: false }, ADD)));
  baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.05;
  g.add(body); g.add(baseRing); g.position.copy(vec(o.position, [0, 0, 2]));
  ctx.scene(p.scene, g);
  ctx.tick((dt, tm) => { body.rotation.y = tm * 0.6; body.rotation.x = tm * 0.25; body.position.y = 2.1 + Math.sin(tm) * 0.08; });
  return {};
});

// ------------------------------------------------------------------ glow outline (inverted hull) on a target
const OVS = `uniform float uThick; varying float vF; void main() {
  vec3 p = position + normalize(normal) * uThick; vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vF = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const OFS = `uniform vec3 uColor; uniform float uPulse; varying float vF; void main() { gl_FragColor = vec4(uColor * uPulse * (0.55 + 0.9 * vF), 1.0); }`;
def('glowOutline', 'a pulsing glow outline around opts.target (any Object3D), drawn as a shell behind it so it blooms', (t, o, ctx) => {
  const p = parts(t, o);
  if (!o.target) return {};
  const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.BackSide, fog: false, uniforms: { uThick: { value: o.thickness || 0.04 }, uPulse: { value: 1 }, uColor: { value: new THREE.Color(o.color || '#' + pal().accent.getHexString()) } },
    vertexShader: OVS, fragmentShader: OFS }, ADD));
  overlay(ctx, o.target, mat);
  ctx.tick((dt, tm) => { mat.uniforms.uPulse.value = 0.8 + 0.5 * Math.sin(tm * 2.4); });
  void p;
  return {};
});

// ------------------------------------------------------------------ shockwave ring
const SFS = `uniform float uAge[3]; uniform vec3 uColor; varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0, a = 0.0;
  for (int i = 0; i < 3; i++) {
    float t = uAge[i]; if (t < 0.0 || t > 1.0) continue;
    float R = 1.0 - pow(1.0 - t, 2.4), w = 0.035 + 0.05 * t;
    a += (smoothstep(w, 0.0, abs(r - R)) * 1.6 + smoothstep(R, R - 0.4, r) * step(r, R) * 0.22) * (1.0 - t) * (1.0 - t);
  }
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
def('shockwave', 'an expanding ring of light with a fading wake (a win, a hit, a portal); pulse() fires another, opts.every repeats it', (t, o, ctx) => {
  const p = parts(t, o), R = o.radius || 8, sec = o.seconds || 1.5;
  const u = { uAge: { value: [-1, -1, -1] }, uColor: { value: new THREE.Color(o.color || '#' + pal().bloom.clone().multiplyScalar(2.2).getHexString()) } };
  const mat = new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: PLAIN_VS, fragmentShader: SFS, side: THREE.DoubleSide, fog: false }, ADD));
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, 1, 1); if (!o.vertical) geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.copy(vec(o.position, [0, 0.06, 0])); m.renderOrder = 4;
  ctx.scene(p.scene, m);
  const ages = u.uAge.value; let next = o.every || 0;
  const pulse = () => { const i = ages.findIndex((a) => a < 0 || a > 1); ages[i < 0 ? 0 : i] = 0; };
  if (o.auto !== false) pulse();
  ctx.tick((dt) => {
    let live = false;
    for (let i = 0; i < 3; i++) if (ages[i] >= 0 && ages[i] <= 1) { ages[i] += dt / sec; live = true; }
    if (o.every) { next -= dt; if (next <= 0) { pulse(); next = o.every; } }
    else if (!live && o.auto !== false) ctx.finish();
  });
  return { pulse };
});

// ------------------------------------------------------------------ light trails
const TVS = `uniform float uTime; uniform vec3 uArea; attribute vec4 aSeed; attribute vec3 aQ; varying float vA, vH, vEnd;
void main() {
  float sp = 5.0 + 13.0 * aSeed.x, len = 1.5 + 5.5 * aSeed.z, hx = mod(aSeed.y * uArea.x + uTime * sp, uArea.x);
  float x = hx - uArea.x * 0.5 - (1.0 - aQ.x) * len;
  vec3 p = vec3(x, (aSeed.w - 0.5) * uArea.y, (fract(aSeed.x * 7.31 + aSeed.w * 3.7) - 0.5) * uArea.z);
  float wd = 0.025 + 0.05 * aSeed.z;
  p += aQ.z < 0.5 ? vec3(0.0, aQ.y * wd, 0.0) : vec3(0.0, 0.0, aQ.y * wd);
  vA = aQ.x; vH = fract(aSeed.w * 5.7); vEnd = smoothstep(0.0, 0.08, hx / uArea.x) * smoothstep(1.0, 0.92, hx / uArea.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const TFS = `uniform vec3 uC1, uC2; varying float vA, vH, vEnd; void main() { gl_FragColor = vec4(mix(uC1, uC2, vH) * pow(vA, 2.2) * 2.4 * vEnd, 1.0); }`;
def('lightTrails', 'streaks of light sliding past like traffic or data (GPU quads, themed colours)', (t, o, ctx) => {
  const p = parts(t, o), n = ctx.count(o.count || 70, 46, 20), r = rng(o.seed || 19), pl = pal();
  const aSeed = new Float32Array(n * 8 * 4), aQ = new Float32Array(n * 8 * 3), pos = new Float32Array(n * 8 * 3), idx = [];
  for (let i = 0; i < n; i++) {
    const s = [r(), r(), r(), r()];
    for (let q = 0; q < 2; q++) for (let k = 0; k < 4; k++) {
      const v = i * 8 + q * 4 + k;
      aSeed.set(s, v * 4); aQ.set([k < 2 ? 0 : 1, k % 2 ? 1 : -1, q], v * 3);
    }
    for (let q = 0; q < 2; q++) { const b = i * 8 + q * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4)); geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 3)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uArea: { value: vec(o.area, [44, 7, 14]) }, uC1: { value: new THREE.Color(o.color || '#' + pl.bloom.getHexString()) }, uC2: { value: new THREE.Color(o.color2 || '#ffcf8a') } },
    vertexShader: TVS, fragmentShader: TFS }, ADD));
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.position.copy(vec(o.position, [0, 3.5, -3]));
  ctx.scene(p.scene, m);
  ctx.tick((dt, tm) => { mat.uniforms.uTime.value = tm; });
  return {};
});
