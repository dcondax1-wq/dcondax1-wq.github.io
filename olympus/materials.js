// OLYMPUS materials (tools/web_public/olympus/materials.js, 2026-11-03; docs/OLYMPUS_RENDER.md): the premium surfaces for the
// render core. All procedural (shader noise, a 128 px generated texture at most), theme-aware (the default colours come from
// OLYMPUS.theme(), or the app's own colour on the default theme), and built for the core's HDR + bloom: what should glow is
// brighter than 1, what should not stays below. Every factory takes an options object and returns a three.js material or
// object; animated ones have update(t) (t in seconds).
//
//   marble({ color, vein, gold })       polished stone with veins (and optional gold seams), clear-coated
//   metal({ kind: 'gold' | 'chrome' | 'gunmetal', color })   brushed metal: physical, clear-coated, a noise roughness map
//   glass({ color, rim, transmission }) holographic glass: env reflections, iridescence, a fresnel rim (no extra scene pass
//                                       unless transmission: true)
//   neon({ color, intensity })          an emissive line / tube that blooms
//   fresnelRim(material, { color, power, strength })   adds a glowing rim to any Standard / Physical material
//   nebula({ colors, count, radius, size })            soft volumetric cloud sprites (a THREE.Group with update(t))
//   starfield({ count, radius, size, color })          twinkling stars (THREE.Points with update(t))
//   energyBeam({ color, length, radius, speed })       an animated energy beam (THREE.Mesh with update(t))

import * as THREE from '../jarvis/three.module.min.js';
import { palette } from './render.js';

/** the current theme's 3D colours ({ sky, fog, emissive, bloom, accent }), the app's own colour on the default theme */
export function colors() {
  const O = (typeof window !== 'undefined' && window.OLYMPUS) || null;
  return palette(O ? O.theme() : null, O ? O.color : undefined);
}
const color = (c, fallback) => new THREE.Color(c !== undefined && c !== null ? c : fallback);

// ------------------------------------------------------------------ shared GLSL
const NOISE = `
float olyHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float olyNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(olyHash(i), olyHash(i + vec3(1, 0, 0)), f.x), mix(olyHash(i + vec3(0, 1, 0)), olyHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(olyHash(i + vec3(0, 0, 1)), olyHash(i + vec3(1, 0, 1)), f.x), mix(olyHash(i + vec3(0, 1, 1)), olyHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float olyFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * olyNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

/** chain a shader patch onto a material (several patches compose; the program cache key follows) */
function patch(material, key, fn) {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) { prev.call(this, shader, renderer); fn(shader); };
  material.customProgramCacheKey = () => prevKey() + '|' + key;
  return material;
}

// ------------------------------------------------------------------ small generated textures (made once, shared)
let brushedTex = null, cloudTex = null;
/** a 128 px roughness map of fine horizontal streaks (G channel, as three reads roughnessMap) */
function brushed() {
  if (brushedTex) return brushedTex;
  const n = 128, data = new Uint8Array(n * n * 4);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = Array.from({ length: n }, () => 0.55 + 0.45 * rnd());
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = Math.round(255 * Math.min(1, rows[y] * (0.82 + 0.18 * rnd()))), i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  brushedTex = new THREE.DataTexture(data, n, n);
  brushedTex.wrapS = brushedTex.wrapT = THREE.RepeatWrapping;
  brushedTex.repeat.set(1, 6);
  brushedTex.magFilter = THREE.LinearFilter; brushedTex.minFilter = THREE.LinearMipmapLinearFilter; brushedTex.generateMipmaps = true;
  brushedTex.needsUpdate = true;
  return brushedTex;
}
/** a soft 128 px cloud puff (fbm in a radial falloff) for the nebula sprites */
function cloud() {
  if (cloudTex) return cloudTex;
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = h(i, j), b = h(i + 1, j), cc = h(i, j + 1), d = h(i + 1, j + 1);
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return a + (b - a) * su + (cc - a) * sv + (a - b - cc + d) * su * sv;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x / n * 4, py = y / n * 4, f = 0.5 * vn(px, py) + 0.25 * vn(px * 2, py * 2) + 0.125 * vn(px * 4, py * 4);
    const r = Math.hypot(x / n - 0.5, y / n - 0.5) * 2, fall = Math.max(0, 1 - r) ** 1.8;
    const a = Math.min(1, fall * (0.35 + 1.1 * f * f)), i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  cloudTex = new THREE.CanvasTexture(c);
  return cloudTex;
}

// ------------------------------------------------------------------ surfaces
/** polished marble: procedural veins in object space (instanced meshes get their own offset), clear coat, veins a bit rougher */
export function marble(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: color(o.color, '#eceae4'), roughness: o.roughness ?? 0.3, metalness: 0,
    clearcoat: o.clearcoat ?? 0.65, clearcoatRoughness: 0.14, envMapIntensity: o.envMapIntensity ?? 1 });
  const u = { uVein: { value: color(o.vein, '#6d6878') }, uSeam: { value: color(o.gold === false ? null : o.gold, '#e9b75a') },
    uSeamOn: { value: o.gold ? 1 : 0 }, uScale: { value: o.scale ?? 1.2 } };
  return patch(m, 'oly-marble', (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vOlyP;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vOlyP = position;
      #ifdef USE_INSTANCING
        vOlyP += instanceMatrix[3].xyz * 1.7;
      #endif`);
    s.fragmentShader = 'varying vec3 vOlyP; uniform vec3 uVein, uSeam; uniform float uSeamOn, uScale;\n' + NOISE + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 mp = vOlyP * uScale;
        float warp = olyFbm(mp * 0.9), fine = olyFbm(mp * 3.1 + 3.0);
        float band = abs(sin((mp.y * 1.1 + mp.x * 0.45 + mp.z * 0.3 + warp * 1.5 + fine * 0.25) * 3.14159));   // long diagonal veins
        float vein = (1.0 - smoothstep(0.0, 0.07, band)) * (0.45 + 0.55 * fine);           // thin, branching dark veins
        float haze = 1.0 - smoothstep(0.0, 0.35, band);                                     // a soft halo around them
        float cloudy = olyFbm(mp * 5.0 + 7.0);
        diffuseColor.rgb *= 0.93 + 0.1 * cloudy;
        diffuseColor.rgb = mix(diffuseColor.rgb, uVein, vein * 0.8 + haze * 0.12);
        float seamBand = abs(sin((mp.y * 0.32 - mp.z * 0.4 + warp * 1.8) * 3.14159));
        float seam = uSeamOn * (1.0 - smoothstep(0.0, 0.03, seamBand));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSeam, seam);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + vein * 0.2 - seam * 0.15, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = max(metalnessFactor, seam);`);
  });
}

const METALS = { gold: ['#ffc76a', 0.3, 0.55], chrome: ['#f2f4f8', 0.12, 0.3], gunmetal: ['#3a3844', 0.38, 0.2] };
/** brushed metal: gold, chrome or gunmetal (a noise roughness map gives the brushed streaks) */
export function metal(o = {}) {
  const [c, rough, coat] = METALS[o.kind] || METALS.gold;
  return new THREE.MeshPhysicalMaterial({ color: color(o.color, c), metalness: 1, roughness: o.roughness ?? rough,
    roughnessMap: o.brushed === false ? null : brushed(), clearcoat: o.clearcoat ?? coat, clearcoatRoughness: 0.06,
    envMapIntensity: o.envMapIntensity ?? 1.25 });
}

/** a glowing fresnel rim on any Standard / Physical material: bright at the silhouette, nothing face-on */
export function fresnelRim(material, o = {}) {
  const u = { uRim: { value: color(o.color, colors().accent).multiplyScalar(o.strength ?? 1.6) }, uRimPow: { value: o.power ?? 2.6 },
    uRimAlpha: { value: o.alpha ?? 0 } };
  material.userData.rim = u;
  return patch(material, 'oly-rim', (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = 'uniform vec3 uRim; uniform float uRimPow, uRimAlpha;\n' + s.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float olyRim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), uRimPow);
        totalEmissiveRadiance += uRim * olyRim;
        diffuseColor.a = mix(diffuseColor.a, 1.0, olyRim * uRimAlpha);`);
  });
}

/** holographic glass: sharp env reflections, a thin-film iridescence and a fresnel rim. Cheap by default (no transmission
 *  pass, which re-renders the scene); transmission: true gives real refraction for a hero object on HD. */
export function glass(o = {}) {
  const tr = !!o.transmission;
  const m = new THREE.MeshPhysicalMaterial({ color: color(o.color, '#ffffff'), metalness: 0, roughness: o.roughness ?? 0.04,
    clearcoat: 1, clearcoatRoughness: 0.02, iridescence: o.iridescence ?? 0.9, iridescenceIOR: 1.35, iridescenceThicknessRange: [160, 560],
    envMapIntensity: o.envMapIntensity ?? 1.6, transparent: !tr, opacity: tr ? 1 : o.opacity ?? 0.16, depthWrite: tr,
    transmission: tr ? 1 : 0, thickness: tr ? o.thickness ?? 0.8 : 0, ior: 1.45, side: THREE.FrontSide });
  return o.rim === false ? m : fresnelRim(m, { color: o.rim, strength: o.rimStrength ?? 1.2, power: 2.2, alpha: 0.7 });
}

/** an emissive surface that blooms: colour x intensity is HDR (> 1), tone mapped like everything else */
export function neon(o = {}) {
  const c = color(o.color, colors().emissive).multiplyScalar(o.intensity ?? 3);
  return new THREE.MeshBasicMaterial({ color: c, fog: o.fog ?? false, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1 });
}

// ------------------------------------------------------------------ atmosphere
const ADDITIVE = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

/** soft volumetric clouds: a few large additive sprites that drift and turn slowly */
export function nebula(o = {}) {
  const pal = colors(), cols = (o.colors || [pal.emissive, pal.sky, pal.bloom]).map((c) => new THREE.Color(c));
  const g = new THREE.Group(), n = o.count ?? 7, R = o.radius ?? 18, S = o.size ?? 22;
  let seed = o.seed ?? 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial(Object.assign({ map: cloud(), color: cols[i % cols.length], opacity: (o.opacity ?? 0.32) * (0.6 + 0.4 * rnd()),
      fog: false, rotation: rnd() * Math.PI * 2 }, ADDITIVE));
    const s = new THREE.Sprite(m), a = rnd() * Math.PI * 2;
    s.position.set(Math.cos(a) * R * (0.4 + 0.6 * rnd()), (rnd() - 0.4) * R * 0.6, -R * (0.5 + 0.5 * rnd()));
    s.scale.setScalar(S * (0.6 + 0.7 * rnd()));
    s.userData.spin = (rnd() - 0.5) * 0.04;
    g.add(s);
  }
  g.renderOrder = -1;
  g.update = (t) => { for (const s of g.children) s.material.rotation += s.userData.spin * 0.016; void t; };
  g.dispose = () => g.children.forEach((s) => s.material.dispose());
  return g;
}

/** twinkling stars on a shell around the camera (no fog, additive, sized in pixels) */
export function starfield(o = {}) {
  const n = o.count ?? 1400, R = o.radius ?? 70, pos = new Float32Array(n * 3), seedA = new Float32Array(n);
  let seed = o.seed ?? 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = R * (0.75 + 0.25 * rnd()), s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3); seedA[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1));
  const mat = new THREE.ShaderMaterial(Object.assign({
    uniforms: { uTime: { value: 0 }, uSize: { value: o.size ?? 2.2 }, uColor: { value: color(o.color, '#dfe6ff') }, uPix: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uSize, uPix; varying float vA;
      void main() { vA = (0.55 + 0.45 * sin(uTime * (0.6 + 2.0 * aSeed) + aSeed * 40.0)) * (0.35 + 0.65 * aSeed * aSeed);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPix * (0.5 + 1.5 * aSeed * aSeed * aSeed); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor * vA * a * a * 1.8, 1.0); }`,
  }, ADDITIVE));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.update = (t, pixelRatio) => { mat.uniforms.uTime.value = t; if (pixelRatio) mat.uniforms.uPix.value = pixelRatio; };
  return pts;
}

/** an energy beam along +Y: a hot core, a soft sheath and pulses flowing up (HDR, so it blooms) */
export function energyBeam(o = {}) {
  const L = o.length ?? 4, r = o.radius ?? 0.12;
  const geo = new THREE.CylinderGeometry(r, r * (o.taper ?? 1), L, 20, 1, true);
  geo.translate(0, L / 2, 0);
  const mat = new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: color(o.color, colors().emissive) }, uPower: { value: o.intensity ?? 3 }, uSpeed: { value: o.speed ?? 1.4 } },
    vertexShader: `varying vec2 vUv; varying float vFace;
      void main() { vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFace = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uPower, uSpeed; uniform vec3 uColor; varying vec2 vUv; varying float vFace;
      void main() { float core = pow(vFace, 3.0), sheath = pow(vFace, 0.8) * 0.35;
        float flow = 0.6 + 0.4 * sin((vUv.y * 9.0 - uTime * uSpeed) * 6.2832);
        float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        vec3 c = mix(uColor, vec3(1.0), core * 0.6) * (core + sheath) * flow * ends * uPower;
        gl_FragColor = vec4(c, 1.0); }`,
  }, ADDITIVE));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}
