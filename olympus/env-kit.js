// OLYMPUS environment kit (tools/web_public/olympus/env-kit.js, 2026-11-11, the environment art pass; docs/ASSETS_LICENSES.md).
// ES module on three r160 (../jarvis/three.module.min.js). Real CC0 art for every OLYMPUS place, shared by all scenes:
//   - PBR SURFACES from Poly Haven photo scans (assets/tex/<name>_c|_n|_l.webp): albedo + AO, normal + roughness, a LITE albedo.
//     World-space TRIPLANAR projection (procedural boxes, instanced or not, never stretch) or mesh UVs in metres ('uv' mode);
//     instance / vertex colours re-tint a surface (the texture is stored mean-normalised, so the colour IS the mean colour).
//   - HDRI LIGHT (assets/env/hdri/<time>.hdr, 256 x 128 RGBE): PMREM image-based light, rotated so the sky's sun sits where the
//     scene's sun is; LITE uses a tiny gradient made in code (no download).
//   - PROPS: KayKit (Kay Lousberg) packs in one .glb each (one shared palette texture) merged into ONE draw per pack per scene,
//     Poly Haven hero models (busts, vases, goblets ...) instanced (one draw per kind).
//   - ARCHITECTURE: a Doric column with real fluting and entasis, echinus + abacus capital, an entablature (architrave, triglyph
//     frieze, cornice), steps, a gable roof of terracotta tiles with pediments, an arch, walls of plaster with stone trim, a couch
//     (kline), a three-legged table, a tripod brazier, an anvil. A Builder merges every part by material: one draw per material.
//   - CONTACT SHADOWS: one instanced draw of soft blobs under props and people.
// Every load is optional: a scene builds at once with plain colours and the art arrives when the files do (a missing file keeps
// the colour). Nothing here schedules a frame.
//
//   const kit = envKit({ renderer, scene, tier: 'high' | 'low' | ..., rc })
//   kit.mat('marble', { color, scale, rough, uv: true })    a cached MeshStandardMaterial (triplanar unless uv)
//   kit.builder() -> B; B.column({...}); B.box('plaster', ...); ...; B.build(parent)   one mesh per material
//   kit.env('golden', { sunDir })  kit.place(parent, 'dungeon', [[name, x, y, z, ry, s], ...])  kit.hero(parent, 'bust', [[x, y, z, ry, s], ...])
//   kit.blobs(parent, [[x, z, r, a], ...])  kit.stats()  kit.dispose()
import * as THREE from '../jarvis/three.module.min.js';
import { mergeGeometries } from './three-addons/BufferGeometryUtils.js';

export const VERSION = 'env-kit 1 (2026-11-11)';
const ROOT = (() => { try { return new URL('../assets/', import.meta.url).href; } catch (e) { return '../assets/'; } })();
export const assetUrl = (rel) => ROOT + rel;

/** the surfaces: mean colour (sRGB) and roughness of each scan (tex.json), so a scene looks right before the files arrive */
export const TEX = Object.freeze({
  marble: { color: '#d8cfbf', rough: 0.506, scale: 0.45, src: 'marble_01' },
  mosaic: { color: '#816d5e', rough: 0.727, scale: 0.5, src: 'marble_mosaic_tiles' },
  plaster: { color: '#d8cdbb', rough: 0.919, scale: 0.4, src: 'painted_plaster_wall' },
  roof: { color: '#a65a32', rough: 0.915, scale: 0.6, src: 'clay_roof_tiles_02' },
  terracotta: { color: '#8a4a32', rough: 0.751, scale: 0.5, src: 'terracotta_floor_tiles' },
  cobble: { color: '#8f826e', rough: 0.731, scale: 0.5, src: 'cobblestone_floor_01' },
  paving: { color: '#a59886', rough: 0.785, scale: 0.35, src: 'seaworn_stone_tiles' },
  ashlar: { color: '#c4b59e', rough: 0.529, scale: 0.4, src: 'white_sandstone_blocks_02' },
  sand: { color: '#cdb487', rough: 0.988, scale: 0.35, src: 'sand_01' },
  ground: { color: '#8a7d68', rough: 0.825, scale: 0.3, src: 'rock_ground' },
  wood: { color: '#8a5f3e', rough: 0.442, scale: 0.8, src: 'oak_wood_planks' },
  cloth: { color: '#b8a98f', rough: 0.659, scale: 1.6, src: 'rough_linen' },
  grass: { color: '#6b6a3a', rough: 0.943, scale: 0.3, src: 'sparse_grass' },
});
export const TEX_NAMES = Object.freeze(Object.keys(TEX));
/** materials with no scan: metal and paint made from numbers (the env light makes them read) */
export const PLAIN = Object.freeze({
  bronze: { color: '#9c6b3c', rough: 0.36, metal: 0.9 }, gold: { color: '#c8a24a', rough: 0.3, metal: 1 }, iron: { color: '#4a4440', rough: 0.5, metal: 0.85 },
  ink: { color: '#2a2018', rough: 0.8, metal: 0 }, paint: { color: '#ffffff', rough: 0.75, metal: 0 },
});
export const HDRI = Object.freeze({
  golden: { file: 'env/hdri/golden.hdr', sun: [0.598, 0.391], src: 'qwantani_late_afternoon_puresky' },
  day: { file: 'env/hdri/day.hdr', sun: [0.594, 0.227], src: 'kloofendal_48d_partly_cloudy_puresky' },
  overcast: { file: 'env/hdri/overcast.hdr', sun: [0.582, 0.367], src: 'kloofendal_overcast_puresky' },
  dusk: { file: 'env/hdri/dusk.hdr', sun: [0.605, 0.438], src: 'qwantani_dusk_2_puresky' },
  night: { file: 'env/hdri/night.hdr', sun: [0.621, 0.492], src: 'qwantani_night_puresky' },
});
/** the time of day (fx-cine's grade names) -> the HDRI that lights it */
export const HDRI_FOR = Object.freeze({ dawn: 'dusk', golden: 'golden', day: 'day', dusk: 'dusk', night: 'night' });
/** prop packs: one .glb each; scale = metres per glTF unit */
export const PACKS = Object.freeze({
  dungeon: { file: 'env/kay_dungeon.glb', scale: 0.5, src: 'KayKit Dungeon Remastered 1.0 (Kay Lousberg)' },
  camp: { file: 'env/kay_camp.glb', scale: 4, src: 'KayKit Medieval Hexagon Pack 1.0 (Kay Lousberg)' },
});
/** hero models (Poly Haven), each its own .glb with 3 textures; h = the height in metres they are scaled to */
export const HEROES = Object.freeze({
  bust: { file: 'env/ph_marble_bust_01.glb', h: 0.72 }, amphora: { file: 'env/ph_ceramic_vase_02.glb', h: 0.62 }, jug: { file: 'env/ph_ceramic_vase_04.glb', h: 0.42 },
  goblets: { file: 'env/ph_brass_goblets.glb', h: 0.2 }, pomegranate: { file: 'env/ph_food_pomegranate_01.glb', h: 0.09 }, ewer: { file: 'env/ph_brass_vase_02.glb', h: 0.4 },
  pot: { file: 'env/ph_planter_pot_clay.glb', h: 0.45 }, firepit: { file: 'env/ph_stone_fire_pit.glb', h: 0.38 }, plate: { file: 'env/ph_carved_wooden_plate.glb', h: 0.05 },
  bookshelf: { file: 'env/ph_wooden_bookshelf_worn.glb', h: 1.9 }, horse: { file: 'env/ph_horse_statue_01.glb', h: 1.2 }, lion: { file: 'env/ph_lion_head.glb', h: 0.6 },
});
/** phone budgets (Round 4/5): whole-scene draw calls / triangles, and the most texture memory a scene may hold */
export const BUDGET = Object.freeze({ high: { draws: 45, tris: 160000, texMB: 40 }, low: { draws: 28, tris: 80000, texMB: 12 } });

const isLite = (tier) => tier === 'low' || tier === 'off';
const SRGB_HALF = 0.21404114;                          // the linear value of sRGB 0.5: the mean every stored albedo channel is normalised to
const C = (h) => new THREE.Color(h);

// ------------------------------------------------------------------ the surface shader (a patch on MeshStandardMaterial)
const VS_HEAD = 'varying vec3 vEkPos; varying vec3 vEkN; varying vec2 vEkUv;\n';
const VS_BODY = `
  vec4 ekP = vec4(transformed, 1.0); vec3 ekN0 = objectNormal;
  #ifdef USE_INSTANCING
    ekP = instanceMatrix * ekP; ekN0 = mat3(instanceMatrix) * ekN0;
  #endif
  ekP = modelMatrix * ekP; vEkPos = ekP.xyz; vEkN = normalize(mat3(modelMatrix) * ekN0); vEkUv = uv;`;
const FS_HEAD = `varying vec3 vEkPos; varying vec3 vEkN; varying vec2 vEkUv;
uniform sampler2D tEkC; uniform sampler2D tEkN; uniform float uEkScale, uEkGain, uEkNormal, uEkRough, uEkAO;
#ifdef EK_DUAL
uniform sampler2D tEkC2; uniform float uEkScale2;
#endif
vec3 ekW() { vec3 w = pow(abs(normalize(vEkN)), vec3(4.0)); return w / (w.x + w.y + w.z); }
`;
// albedo (+ AO): triplanar on HD, the dominant axis only on LITE (one tap), or the mesh UV
const FS_MAP = `
  vec4 ekAlb;
  #ifdef EK_UV
    ekAlb = texture2D(tEkC, vEkUv * uEkScale);
  #else
    vec3 ekw = ekW(); vec3 ekp = vEkPos * uEkScale;
    #ifdef EK_LITE
      vec2 ekuv = ekw.x > ekw.y && ekw.x > ekw.z ? ekp.zy : (ekw.y > ekw.z ? ekp.xz : ekp.xy);
      ekAlb = texture2D(tEkC, ekuv);
      #if defined(EK_DUAL) && defined(USE_COLOR)
        // a second scan where the vertex colour is terracotta (roofs): the palette picks the surface, one more tap
        float ekRoof = 1.0 - smoothstep(0.3, 0.48, vColor.g / max(vColor.r, 0.001));
        vec3 ekq = vEkPos * uEkScale2; vec2 ekuv2 = ekw.x > ekw.y && ekw.x > ekw.z ? ekq.zy : (ekw.y > ekw.z ? ekq.zx : ekq.xy);
        ekAlb = mix(ekAlb, texture2D(tEkC2, ekuv2), ekRoof);
      #endif
    #else
      ekAlb = texture2D(tEkC, ekp.zy) * ekw.x + texture2D(tEkC, ekp.xz + 0.37) * ekw.y + texture2D(tEkC, ekp.xy + 0.71) * ekw.z;
    #endif
  #endif
  diffuseColor.rgb *= ekAlb.rgb * uEkGain * mix(1.0, ekAlb.a, uEkAO);`;
const FS_ROUGH = `
  #ifndef EK_LITE
    #ifdef EK_UV
      vec4 ekNr = texture2D(tEkN, vEkUv * uEkScale);
    #else
      vec4 ekNx = texture2D(tEkN, ekp.zy), ekNy = texture2D(tEkN, ekp.xz + 0.37), ekNz = texture2D(tEkN, ekp.xy + 0.71);
      vec4 ekNr = ekNx * ekw.x + ekNy * ekw.y + ekNz * ekw.z;
    #endif
    roughnessFactor = clamp(ekNr.b * uEkRough, 0.04, 1.0);
  #endif`;
const FS_NORMAL = `
  #ifndef EK_LITE
  {
    vec3 ekn = normalize(vEkN);
    #ifdef EK_UV
      vec2 t = (ekNr.xy * 2.0 - 1.0) * uEkNormal;
      vec3 dp1 = dFdx(vEkPos), dp2 = dFdy(vEkPos); vec2 du1 = dFdx(vEkUv), du2 = dFdy(vEkUv);
      vec3 T = dp2 * du1.y - dp1 * du2.y, B = dp2 * du1.x - dp1 * du2.x;      // the cotangent frame (no tangents needed)
      float s = max(dot(T, T), dot(B, B)); float inv = s > 0.0 ? inversesqrt(s) : 0.0;
      vec3 wn = normalize(ekn + (T * -t.x + B * t.y) * inv);
    #else
      vec2 nx = (ekNx.xy * 2.0 - 1.0) * uEkNormal, ny = (ekNy.xy * 2.0 - 1.0) * uEkNormal, nz = (ekNz.xy * 2.0 - 1.0) * uEkNormal;
      vec3 sg = sign(ekn);
      vec3 wn = normalize(ekn + vec3(0.0, nx.y, nx.x * sg.x) * ekw.x + vec3(ny.x * sg.y, 0.0, ny.y) * ekw.y + vec3(nz.x * sg.z, nz.y, 0.0) * ekw.z);
    #endif
    normal = normalize(mat3(viewMatrix) * wn) * faceDirection;
  }
  #endif`;

const fallback = new Map();
function pixel(key, r, g, b, a, srgb) {
  if (fallback.has(key)) return fallback.get(key);
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; t.__ekShared = true; fallback.set(key, t);
  return t;
}

/** the patched material: o = { tex (a TEX name or null), color, scale, rough, metal, normal, ao, uv, lite, vertexColors, side, emissive, envI } */
function surface(o) {
  const T = o.tex ? TEX[o.tex] : null, P = o.plain ? PLAIN[o.plain] : null;
  const base = { color: C(o.color || (T && T.color) || (P && P.color) || '#ffffff'), vertexColors: !!o.vertexColors, side: o.side || THREE.FrontSide,
    emissive: o.emissive ? C(o.emissive) : C('#000000'), emissiveIntensity: o.emissiveIntensity ?? 1, transparent: !!o.transparent, opacity: o.opacity ?? 1, fog: o.fog !== false };
  // lambert: a scene on its own plain renderer keeps its Lambert look and only gains the scan's albedo (flat mode)
  const m = o.lambert ? new THREE.MeshLambertMaterial(base) : new THREE.MeshStandardMaterial(Object.assign(base, { roughness: o.rough ?? (T ? T.rough : P ? P.rough : 0.8),
    metalness: o.metal ?? (P ? P.metal : 0), envMapIntensity: o.envI ?? 1 }));
  m.name = 'ek:' + (o.tex || o.plain || 'paint');
  if (!T) return m;
  const rough = o.rough ?? T.rough;
  const u = { tEkC: { value: pixel('c', 128, 128, 128, 255, true) }, tEkN: { value: pixel('n' + T.rough, 128, 128, Math.round(T.rough * 255), 255, false) },
    uEkScale: { value: o.scale ?? T.scale }, uEkGain: { value: 1 / SRGB_HALF }, uEkNormal: { value: o.normal ?? 1 }, uEkRough: { value: rough / Math.max(0.05, T.rough) },
    uEkAO: { value: o.lite ? 0 : o.ao ?? 0.8 } };
  if (o.dual && TEX[o.dual]) { u.tEkC2 = { value: pixel('c', 128, 128, 128, 255, true) }; u.uEkScale2 = { value: o.scale2 ?? TEX[o.dual].scale }; }
  m.userData.ek = u;
  m.defines = Object.assign(m.defines || {}, o.uv ? { EK_UV: '' } : {}, o.lite || o.flat || o.lambert ? { EK_LITE: '' } : {}, o.dual && TEX[o.dual] ? { EK_DUAL: '' } : {});
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = VS_HEAD + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + VS_BODY);
    s.fragmentShader = FS_HEAD + s.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>' + FS_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + FS_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + FS_NORMAL);
  };
  if (o.lambert) o.flat = true;
  m.customProgramCacheKey = () => 'ek' + (o.uv ? 'u' : 't') + (o.lite || o.flat ? 'l' : 'h') + (o.dual ? 'd' : '') + (o.lambert ? 'L' : '');
  return m;
}

// ------------------------------------------------------------------ geometry helpers (every part: position + normal + uv (metres) + color)
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
/** a matrix from x, y, z, rotation y (and x, z), scale (number or [sx, sy, sz]) */
export function mat4(x, y, z, ry, s, rx, rz) {
  tmpE.set(rx || 0, ry || 0, rz || 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
  if (Array.isArray(s)) tmpS.set(s[0], s[1], s[2]); else tmpS.setScalar(s == null ? 1 : s);
  return new THREE.Matrix4().compose(tmpV.set(x || 0, y || 0, z || 0), tmpQ, tmpS);
}
/** a copy with every attribute as plain Float32 (quantized glTF attributes are Int16 normalised: a transform would clip them) */
function toFloat(g) {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k], n = a.itemSize, arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) arr[i * n + j] = a.getComponent ? a.getComponent(i, j) : [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)][j];
    out.setAttribute(k, new THREE.BufferAttribute(arr, n));
  }
  if (g.index) out.setIndex(Array.from(g.index.array));
  return out;
}
/** a tint for a part of a material: the vertex colour that makes the part's mean colour `color` (the material's own colour is the scan's mean) */
function tintFor(key, color) {
  const name = String(key).split(':')[0], base = C((TEX[name] && TEX[name].color) || (PLAIN[name] && PLAIN[name].color) || '#ffffff'), c = C(color);
  return new THREE.Color(Math.min(6, c.r / Math.max(0.004, base.r)), Math.min(6, c.g / Math.max(0.004, base.g)), Math.min(6, c.b / Math.max(0.004, base.b)));
}
/** make a geometry mergeable: Float32 position / normal / uv / color only, always indexed */
function norm(g, color) {
  const out = new THREE.BufferGeometry();
  const f32 = (a, n) => { const arr = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) { arr[i * n] = a.getX(i); if (n > 1) arr[i * n + 1] = a.getY(i); if (n > 2) arr[i * n + 2] = a.getZ(i); } return new THREE.BufferAttribute(arr, n); };
  const p = g.getAttribute('position'); out.setAttribute('position', f32(p, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  out.setAttribute('normal', f32(g.getAttribute('normal'), 3));
  out.setAttribute('uv', g.getAttribute('uv') ? f32(g.getAttribute('uv'), 2) : new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  const c = new Float32Array(p.count * 3), col = color ? (color.isColor ? color : C(color)) : null, gc = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) { c[i * 3] = col ? col.r : gc ? gc.getX(i) : 1; c[i * 3 + 1] = col ? col.g : gc ? gc.getY(i) : 1; c[i * 3 + 2] = col ? col.b : gc ? gc.getZ(i) : 1; }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g.index) out.setIndex(Array.from(g.index.array)); else { const ix = new Array(p.count); for (let i = 0; i < p.count; i++) ix[i] = i; out.setIndex(ix); }
  return out;
}
/** UVs in metres on a box (each face mapped from its own two axes), so 'uv' materials keep their scale on any box size */
export function boxGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz), p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i)); else if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}
/** a lathe from a profile [[r, y], ...] with UVs in metres (u = arc length round, v = along the profile) */
export function latheGeo(profile, seg) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0001, p[0]), p[1]));
  const g = new THREE.LatheGeometry(pts, seg || 24), p = g.getAttribute('position'), uv = g.getAttribute('uv');
  const rMax = Math.max(...profile.map((q) => q[0]));
  let len = 0; const along = [0]; for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); along.push(len); }
  for (let i = 0; i < p.count; i++) { const k = i % pts.length, u = uv.getX(i); uv.setXY(i, u * Math.PI * 2 * rMax, along[k]); }
  return g;
}
/** a Doric column shaft: `flutes` concave flutes with sharp arrises, entasis (a slight swell), UVs in metres */
export function shaftGeo(o) {
  const h = o.h ?? 4, r0 = o.r ?? 0.3, r1 = r0 * (o.taper ?? 0.8), fl = o.flutes ?? 20, per = o.lite ? 2 : 4, seg = fl * per, rows = o.rows ?? (o.lite ? 1 : 3), depth = o.depth ?? 0.07;
  const pos = [], uvs = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = v * h, swell = Math.sin(v * Math.PI) * 0.018 * r0, R = r0 + (r1 - r0) * v + swell;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, f = (i % per) / per, d = Math.sin(f * Math.PI) * depth * R;   // 0 at each arris, deepest mid-flute
      const rr = R - d;
      pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr); uvs.push((i / seg) * Math.PI * 2 * r0, y);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a gable roof (terracotta tiles): two sloped slabs with UVs running down the slope; w along the ridge (x), d across (z) */
export function roofGeo(w, d, h, over, thick) {
  const o = over ?? 0.3, t = thick ?? 0.12, hw = w / 2 + o, hd = d / 2 + o, slope = Math.hypot(hd, h);
  const g = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  const quad = (a, b, c, e, ua) => { const k = pos.length / 3; pos.push(...a, ...b, ...c, ...e); uv.push(...ua); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  for (const s of [-1, 1]) {
    // top face of one slab (ridge at z = 0, eave at z = s * hd)
    const r0 = [-hw, h, 0], r1 = [hw, h, 0], e1 = [hw, -o * h / hd, s * hd], e0 = [-hw, -o * h / hd, s * hd];
    if (s > 0) quad(r0, e0, e1, r1, [0, 0, 0, slope, w + 2 * o, slope, w + 2 * o, 0]); else quad(r1, e1, e0, r0, [w + 2 * o, 0, w + 2 * o, slope, 0, slope, 0, 0]);
    // the eave's edge (thickness)
    const d0 = [e0[0], e0[1] - t, e0[2]], d1 = [e1[0], e1[1] - t, e1[2]];
    if (s > 0) quad(e0, d0, d1, e1, [0, 0, 0, t, w, t, w, 0]); else quad(e1, d1, d0, e0, [0, 0, 0, t, w, t, w, 0]);
    // the underside
    const u0 = [-hw, h - t, 0], u1 = [hw, h - t, 0];
    if (s > 0) quad(u1, d1, d0, u0, [0, 0, 0, slope, w, slope, w, 0]); else quad(u0, d0, d1, u1, [0, 0, 0, slope, w, slope, w, 0]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** the triangular pediment (gable end) as a prism, base w on z, height h, depth t */
export function pedimentGeo(w, h, t) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2);
  return g;
}
/** a round arch (a wall with a round-headed opening): w x h, opening ow x oh, depth t */
export function archGeo(w, h, ow, oh, t) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-ow / 2, 0); s.lineTo(-ow / 2, oh - ow / 2); s.absarc(0, oh - ow / 2, ow / 2, Math.PI, 0, true);
  s.lineTo(ow / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -t / 2);
  return g;
}
/** a soft-edged cushion / mattress: a rounded box */
export function cushionGeo(w, h, d, r) {
  const rr = Math.min(r ?? 0.05, h / 2 - 0.001, w / 2, d / 2), s = new THREE.Shape(), x = w / 2 - rr, z = d / 2 - rr;
  s.moveTo(-x, -d / 2); s.lineTo(x, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -z); s.lineTo(w / 2, z); s.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  s.lineTo(-x, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, z); s.lineTo(-w / 2, -z); s.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * rr), bevelEnabled: true, bevelThickness: rr, bevelSize: rr * 0.6, bevelSegments: 2, curveSegments: 3 });
  g.rotateX(-Math.PI / 2); g.translate(0, rr, 0);
  return g;
}

/** a flat ring on the ground (facing up) from r0 to r1, angles a0..a1; UVs in metres (u round the middle circle, v outward) */
export function ringGeo(r0, r1, seg, a0, a1) {
  const A0 = a0 ?? 0, A1 = a1 ?? Math.PI * 2, n = seg || 64, rm = (r0 + r1) / 2, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) { const a = A0 + ((A1 - A0) * i) / n; for (const r of [r0, r1]) { pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(a * rm, r - r0); } }
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); if (g.getAttribute('normal').getY(0) < 0) { g.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))])); g.computeVertexNormals(); }
  return g;
}
/** a disc on the ground (facing up), UVs in metres */
export function discGeo(r, seg) { const g = new THREE.CircleGeometry(r, seg || 48); g.rotateX(-Math.PI / 2); const p = g.getAttribute('position'), uv = g.getAttribute('uv'); for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i)); return g; }
/** an upright round band (a curved wall face) of radius r from y0 to y0 + h, angles a0..a1, facing inward (in: true) or out; UVs in metres */
export function bandGeo(r, y0, h, seg, inward, a0, a1) {
  const A0 = a0 ?? 0, A1 = a1 ?? Math.PI * 2, n = seg || 64, pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= n; i++) { const a = A0 + ((A1 - A0) * i) / n, sx = Math.sin(a), cz = Math.cos(a); for (const y of [y0, y0 + h]) { pos.push(sx * r, y, cz * r); uv.push((inward ? -a : a) * r, y - y0); nor.push(inward ? -sx : sx, 0, inward ? -cz : cz); } }
  for (let i = 0; i < n; i++) { const k = i * 2; if (inward) idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ the builder: parts merged per material, one draw each
function makeBuilder(kit) {
  const parts = new Map();          // material key -> [geometry]
  const tris = { n: 0 };
  const B = {
    /** add a geometry (in local space) with a placement matrix and an optional tint */
    add(mat, geo, m, color) { const g = norm(geo, color ? tintFor(mat, color) : null); if (m) g.applyMatrix4(m); geo.dispose(); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); tris.n += g.index.count / 3; return B; },
    box(mat, x, y, z, sx, sy, sz, ry, color) { return B.add(mat, boxGeo(sx, sy, sz), mat4(x, y, z, ry), color); },
    cyl(mat, x, y, z, r0, r1, h, seg, ry, color) { const g = new THREE.CylinderGeometry(r0, r1, h, seg || 16); return B.add(mat, g, mat4(x, y, z, ry), color); },
    lathe(mat, profile, x, y, z, s, seg, color) { return B.add(mat, latheGeo(profile, seg), mat4(x, y, z, 0, s), color); },
    /** a Doric column standing on (x, y, z): fluted shaft, echinus, abacus; h = total height */
    column(o) {
      const h = o.h ?? 4, r = o.r ?? 0.3, mat = o.mat || 'marble:uv', capH = r * 0.9, lite = kit.geoLite;
      B.add(mat, shaftGeo({ h: h - capH, r, flutes: o.flutes ?? 20, lite }), mat4(o.x, o.y || 0, o.z, o.ry || 0), o.color);
      const y = (o.y || 0) + h - capH;
      B.add(mat, latheGeo([[r * 0.82, 0], [r * 0.86, capH * 0.12], [r * 1.0, capH * 0.3], [r * 1.22, capH * 0.52], [r * 1.3, capH * 0.6], [0.0001, capH * 0.6]], lite ? 12 : 24), mat4(o.x, y, o.z, 0), o.color);
      B.add(mat, boxGeo(r * 2.75, capH * 0.4, r * 2.75), mat4(o.x, y + capH * 0.8, o.z, o.ry || 0), o.color);
      if (o.base) B.add(mat, latheGeo([[0.0001, 0], [r * 1.3, 0], [r * 1.3, r * 0.18], [r * 1.12, r * 0.26], [r * 1.04, r * 0.36], [0.0001, r * 0.36]], lite ? 12 : 20), mat4(o.x, (o.y || 0) - r * 0.36, o.z, 0), o.color);
      return B;
    },
    /** steps: n steps rising to height h, a rectangular stylobate w x d centred on (x, y, z) (y = the ground) */
    steps(o) { const n = o.n ?? 3, sh = (o.h ?? 0.45) / n, run = o.run ?? 0.35; for (let i = 0; i < n; i++) B.box(o.mat || 'marble', o.x, (o.y || 0) + sh * (i + 0.5), o.z, o.w + (n - 1 - i) * run * 2, sh, o.d + (n - 1 - i) * run * 2, o.ry || 0, o.color); return B; },
    /** an entablature along x (length w, centred, at height y): architrave, a triglyph frieze (plain blocks + metopes), cornice */
    entablature(o) {
      const w = o.w, y = o.y, d = o.d ?? 0.8, ah = o.ah ?? 0.42, fh = o.fh ?? 0.42, ch = o.ch ?? 0.16, mat = o.mat || 'marble', ry = o.ry || 0;
      const at = (lx, ly, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c]; };
      let p = at(0, y + ah / 2, 0); B.box(mat, p[0], p[1], p[2], w, ah, d, ry, o.color);
      p = at(0, y + ah + fh / 2, 0); B.box(mat, p[0], p[1], p[2], w - 0.04, fh, d - 0.08, ry, o.metope || o.color);
      const nTri = Math.max(2, Math.round(w / (o.bay ?? 1.1)) + 1);
      for (let i = 0; i < nTri; i++) { const lx = -w / 2 + 0.16 + (i * (w - 0.32)) / (nTri - 1); for (const s of [1, -1]) { p = at(lx, y + ah + fh / 2, s * (d / 2 - 0.02)); B.box(o.triMat || mat, p[0], p[1], p[2], 0.26, fh, 0.06, ry, o.triglyph || '#4a4036'); } }
      p = at(0, y + ah + fh + ch / 2, 0); B.box(mat, p[0], p[1], p[2], w + 0.24, ch, d + 0.24, ry, o.color);
      return B;
    },
    /** a gable roof of terracotta tiles over a w x d plan (ridge along x after ry), eave at y, rise h; pediments at both ends */
    roof(o) {
      const ry = o.ry || 0, over = o.over ?? 0.3, h = o.h ?? Math.max(0.6, o.d * 0.28);
      B.add(o.mat || 'roof:uv', roofGeo(o.w, o.d, h, over, o.thick), mat4(o.x, o.y, o.z, ry), o.color);
      if (o.pediment !== false) for (const s of [-1, 1]) {
        const c = Math.cos(ry), sn = Math.sin(ry), lx = s * (o.w / 2 - 0.02);
        B.add(o.pedMat || 'marble', pedimentGeo(o.d, h - 0.02, 0.16), mat4(o.x + lx * c, o.y, o.z - lx * sn, ry + Math.PI / 2), o.pedColor);
      }
      const ridge = new THREE.CylinderGeometry(0.09, 0.09, o.w + over * 2, 8); ridge.rotateZ(Math.PI / 2);      // the ridge runs along local x
      return B.add(o.ridgeMat || 'roof:uv', ridge, mat4(o.x, o.y + h + 0.03, o.z, ry), o.ridgeColor);
    },
    /** a wall from (x0, z0) to (x1, z1): plaster with a stone plinth and a stone band on top; an optional door gap at t (0..1) */
    wall(o) {
      const dx = o.x1 - o.x0, dz = o.z1 - o.z0, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), h = o.h ?? 3, t = o.t ?? 0.3, y0 = o.y || 0;
      const seg = (a, b) => {
        if (b - a < 0.02) return;
        const m = (a + b) / 2, cx = o.x0 + dx * m / L, cz = o.z0 + dz * m / L, len = b - a, plinth = o.plinth ?? 0.45, band = o.band ?? 0.22;
        B.box(o.mat || 'plaster', cx, y0 + plinth + (h - plinth - band) / 2, cz, len, h - plinth - band, t, ry, o.color);
        B.box(o.trim || 'ashlar', cx, y0 + plinth / 2, cz, len, plinth, t + 0.06, ry, o.trimColor);
        B.box(o.trim || 'ashlar', cx, y0 + h - band / 2, cz, len, band, t + 0.08, ry, o.trimColor);
      };
      if (o.door) { const dc = o.door * L, dw = o.doorW ?? 1.6; seg(0, dc - dw / 2); seg(dc + dw / 2, L); const lint = o.doorH ?? 2.4; if (h > lint + 0.05) { const cx = o.x0 + dx * o.door, cz = o.z0 + dz * o.door; B.box(o.trim || 'ashlar', cx, y0 + lint + (h - lint) / 2, cz, dw + 0.3, h - lint, t + 0.04, ry, o.trimColor); } }
      else seg(0, L);
      return B;
    },
    /** a dining couch (kline): turned wooden legs, a frame, a linen mattress (top at h + 0.16), a bolster and a headboard at the -x end,
     *  a loose cushion (cushion: false for none) in `color` */
    kline(o) {
      const w = o.w ?? 1.9, d = o.d ?? 0.8, hgt = o.h ?? 0.42, ry = o.ry || 0, c = Math.cos(ry), s = Math.sin(ry), seg = kit.lite ? 5 : o.seg ?? 8, L = hgt - 0.05;
      const at = (lx, lz) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
      for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const lz of [-d / 2 + 0.08, d / 2 - 0.08]) { const p = at(lx, lz); B.lathe('wood:uv', [[0.03, 0], [0.045, L * 0.12], [0.026, L * 0.3], [0.05, L * 0.55], [0.028, L * 0.78], [0.042, L], [0.0001, L]], p[0], 0, p[1], 1, seg, o.wood); }
      let p = at(0, 0); B.add('wood:uv', boxGeo(w, 0.1, d), mat4(p[0], hgt - 0.05, p[1], ry), o.wood);
      B.add('cloth:uv', cushionGeo(w - 0.06, 0.16, d - 0.06, 0.06), mat4(p[0], hgt, p[1], ry), o.linen || '#e8dfcc');
      p = at(-w / 2 + 0.17, 0); B.add('cloth:uv', new THREE.CylinderGeometry(0.1, 0.1, d - 0.14, seg), mat4(p[0], hgt + 0.24, p[1], ry, 1, Math.PI / 2), o.color || '#c96a4a');
      p = at(-w / 2 + 0.05, 0); B.add('wood:uv', boxGeo(0.07, 0.42, d), mat4(p[0], hgt + 0.16, p[1], ry), o.wood);        // the headboard (fulcrum)
      if (o.cushion !== false) { p = at(w * 0.18, -d * 0.05); B.add('cloth:uv', cushionGeo(0.42, 0.1, 0.34, 0.05), mat4(p[0], hgt + 0.14, p[1], ry + 0.3), o.color2 || o.color || '#7f8a52'); }
      return B;
    },
    /** a low three-legged table (trapeza) with a round top */
    table(o) {
      const r = o.r ?? 0.45, h = o.h ?? 0.5, seg = kit.lite ? 16 : 32;
      B.cyl(o.mat || 'wood', o.x, h - 0.025, o.z, r, r * 0.97, 0.05, seg, 0, o.color);
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + (o.ry || 0); B.add(o.legMat || 'wood', new THREE.CylinderGeometry(0.03, 0.022, h - 0.05, 8), mat4(o.x + Math.sin(a) * r * 0.62, (h - 0.05) / 2, o.z + Math.cos(a) * r * 0.62, 0, 1, Math.cos(a) * 0.12, -Math.sin(a) * 0.12), o.color); }
      return B;
    },
    /** a bronze tripod brazier: three legs, a bowl, coals inside (the fire itself is fx-cine's) */
    brazier(o) {
      const h = o.h ?? 1.0, r = o.r ?? 0.32, seg = kit.lite ? 10 : 18;
      for (let k = 0; k < 3; k++) { const a = k * 2.094; B.add('bronze', new THREE.CylinderGeometry(0.022, 0.03, h, 6), mat4(o.x + Math.sin(a) * r * 0.55, h / 2, o.z + Math.cos(a) * r * 0.55, 0, 1, -Math.cos(a) * 0.2, Math.sin(a) * 0.2)); }
      B.lathe('bronze', [[0.0001, 0], [r * 0.45, 0.02], [r * 0.85, r * 0.3], [r, r * 0.55], [r * 1.08, r * 0.6], [r * 0.95, r * 0.6]], o.x, h - 0.05, o.z, 1, seg);
      B.cyl('bronze', o.x, h - 0.05 + r * 0.5, o.z, r * 0.88, r * 0.7, 0.06, seg, 0, '#2a1a10');
      return B;
    },
    /** a blacksmith's anvil on a wooden stump */
    anvil(o) {
      const s = o.s ?? 1, ry = o.ry || 0, y0 = o.y || 0;
      B.cyl(o.stump || 'wood', o.x, y0 + 0.28 * s, o.z, 0.22 * s, 0.25 * s, 0.56 * s, 12, ry, o.wood);
      const sh = new THREE.Shape(); sh.moveTo(-0.32, 0); sh.lineTo(0.2, 0); sh.lineTo(0.22, 0.06); sh.lineTo(0.12, 0.1); sh.lineTo(0.12, 0.2); sh.lineTo(0.3, 0.22);
      sh.quadraticCurveTo(0.44, 0.26, 0.5, 0.32); sh.lineTo(0.22, 0.34); sh.lineTo(-0.3, 0.34); sh.lineTo(-0.34, 0.26); sh.lineTo(-0.18, 0.2); sh.lineTo(-0.18, 0.1); sh.lineTo(-0.34, 0.06); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1 }); g.translate(0, 0, -0.09);
      B.add('iron', g, mat4(o.x, y0 + 0.56 * s, o.z, ry, s));
      return B;
    },
    /** a scroll (rolled papyrus) lying at (x, y, z) */
    scroll(o) { B.add('cloth', new THREE.CylinderGeometry(o.r ?? 0.035, o.r ?? 0.035, o.l ?? 0.32, 8), mat4(o.x, o.y + (o.r ?? 0.035), o.z, o.ry || 0, 1, 0, Math.PI / 2), o.color || '#e9dcbc'); return B; },
    /** merge and add: one mesh per material, all static. -> Group (userData.stats = { draws, tris }) */
    build(parent) {
      const grp = new THREE.Group(); grp.name = 'env-kit';
      for (const [key, list] of parts) {
        const g = mergeGeometries(list, false); list.forEach((x) => x.dispose());
        if (!g) continue;
        g.computeBoundingSphere();
        const pm = String(key).startsWith('paint:') ? kit.paintMat(key) : null, mesh = new THREE.Mesh(g, pm || kit.mat(key, { vertexColors: true }));
        mesh.name = 'ek:' + key; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        grp.add(mesh); kit._own.push(g);
      }
      parts.clear();
      grp.userData.stats = { draws: grp.children.length, tris: Math.round(tris.n) };
      if (parent) parent.add(grp);
      return grp;
    },
    get triangles() { return Math.round(tris.n); },
  };
  return B;
}

// ------------------------------------------------------------------ the HDRI environment
const EQ_VS = 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const EQ_FS = `uniform sampler2D tEq; uniform float uRot, uClamp, uGain; uniform vec3 uTint; varying vec3 vDir;
void main() { vec3 d = normalize(vDir); float c = cos(uRot), s = sin(uRot); d = vec3(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 col = min(texture2D(tEq, uv).rgb * uGain, vec3(uClamp)) * uTint; gl_FragColor = vec4(col, 1.0); }`;
const GR_FS = `uniform vec3 uTop, uHor, uGround; varying vec3 vDir;
void main() { float y = normalize(vDir).y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(y, 0.6)) : mix(uHor, uGround, pow(-y, 0.4)); gl_FragColor = vec4(c, 1.0); }`;

let loaderMods = null;
async function loaders() {
  if (!loaderMods) loaderMods = Promise.all([import('./three-addons/GLTFLoader.js'), import('./three-addons/RGBELoader.js'), import('./three-addons/meshopt_decoder.module.js')])
    .then(([g, r, m]) => ({ GLTFLoader: g.GLTFLoader, RGBELoader: r.RGBELoader, MeshoptDecoder: m.MeshoptDecoder }));
  return loaderMods;
}
const gltfCache = new Map();
async function loadGltf(rel) {
  if (!gltfCache.has(rel)) gltfCache.set(rel, (async () => {
    const L = await loaders(); const ld = new L.GLTFLoader(); ld.setMeshoptDecoder(L.MeshoptDecoder);
    return await ld.loadAsync(assetUrl(rel));
  })());
  return gltfCache.get(rel);
}

/**
 * envKit({ renderer, scene, tier, rc?, envI? }) -> the kit for one scene (materials cached per scene, freed by dispose()).
 * tier: 'ultra' | 'high' | 'low' | 'off' (LITE = 'low' / 'off': the 256 px albedo only, one tap, no normal maps, a gradient env).
 */
export function envKit(opts) {
  const o = opts || {}, renderer = o.renderer || (o.rc && o.rc.renderer), scene = o.scene || (o.rc && o.rc.scene);
  const tier = o.tier || (o.rc && o.rc.quality ? o.rc.quality() : 'high'), lite = isLite(tier);
  // a software GL (SwiftShader / llvmpipe: no GPU, e.g. the test machine) gets the one-tap surfaces (no normal maps): same look from afar,
  // a fraction of the cost; ?gpu=1 keeps the full surfaces there
  let soft = false; try { const gl = renderer && renderer.getContext(), e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    soft = !!e && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL))) && !/[?&]gpu=1/.test(location.search); } catch (err) { soft = false; }
  const aniso = renderer && renderer.capabilities && !soft ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
  const mats = new Map(), texs = new Map(), info = { files: 0, failed: [], bytes: 0, texels: 0, env: null };
  let dead = false, envTex = null, envSig = '';

  const loadTex = (rel, srgb) => {
    if (texs.has(rel)) return texs.get(rel);
    const p = new Promise((ok) => {
      new THREE.TextureLoader().load(assetUrl(rel), (t) => {
        if (dead) { t.dispose(); return ok(null); }
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = lite ? 1 : aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        const w = t.image ? t.image.width || 0 : 0, h = t.image ? t.image.height || 0 : 0; info.files++; info.texels += w * h;
        ok(t);
      }, undefined, () => { info.failed.push(rel); ok(null); });
    });
    texs.set(rel, p);
    return p;
  };
  const kit = {
    tier, lite, soft, _own: [],
    /** lighter geometry (fewer flutes and segments): LITE, and a software GL */
    get geoLite() { return lite || soft; },
    /** a material by key: 'marble' (triplanar), 'marble:uv' (mesh UVs in metres), a PLAIN name ('bronze'), or anything else = paint.
     *  opts: { color, scale, rough, metal, normal, vertexColors, side, envI } (same key + same opts -> the same material) */
    mat(key, mo) {
      const m0 = mo || {}, k = key + '|' + JSON.stringify(m0);
      if (mats.has(k)) return mats.get(k);
      const [name, mode] = String(key).split(':');
      const T = TEX[name], P = PLAIN[name];
      const m = surface(Object.assign({ tex: T ? name : null, plain: P ? name : null, uv: mode === 'uv', lite, envI: o.envI ?? 1 }, m0, soft && !lite ? { flat: true } : {}));
      if (T) {
        const u = m.userData.ek;
        loadTex('tex/' + name + (lite ? '_l.webp' : '_c.webp'), true).then((t) => { if (t && !dead) { u.tEkC.value = t; if (lite) u.uEkAO.value = 0; } });
        if (!lite && !m0.flat && !m0.lambert && !soft) loadTex('tex/' + name + '_n.webp', false).then((t) => { if (t && !dead) u.tEkN.value = t; });
        if (u.tEkC2) loadTex('tex/' + m0.dual + (lite ? '_l.webp' : '_c.webp'), true).then((t) => { if (t && !dead) u.tEkC2.value = t; });
      }
      mats.set(k, m);
      return m;
    },
    /** the image-based light: an HDRI name ('golden' | 'day' | 'overcast' | 'dusk' | 'night', or a time name via HDRI_FOR) or 'gradient';
     *  { sunDir: the scene's sun (Vector3 toward the sun) to line the sky's sun up with, rotate: radians instead, gain, tint,
     *    top / horizon / ground (gradient colours) }. LITE always takes the gradient. -> Promise<texture | null> */
    async env(name, eo) {
      const e = eo || {}, key = HDRI[name] ? name : HDRI_FOR[name] || 'golden';
      if (!renderer || dead) return null;
      const useGrad = lite || name === 'gradient' || o.hdri === false;
      let rot = e.rotate || 0;
      if (!useGrad && e.sunDir && HDRI[key]) { const phiH = (HDRI[key].sun[0] - 0.5) * Math.PI * 2, phiS = Math.atan2(e.sunDir.z, e.sunDir.x); rot = phiH - phiS; }
      const sig = (useGrad ? 'grad' + (e.top || '') + (e.horizon || '') : key) + '|' + rot.toFixed(2) + '|' + (e.gain || 1);
      if (sig === envSig && envTex) return envTex;
      let src = null, eq = null;
      try {
        const sc = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 32, 16);
        if (useGrad) {
          src = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: EQ_VS, fragmentShader: GR_FS,
            uniforms: { uTop: { value: C(e.top || '#7a8fb0').multiplyScalar(e.gain || 1) }, uHor: { value: C(e.horizon || '#f2c08c').multiplyScalar(e.gain || 1) }, uGround: { value: C(e.ground || '#5a4630').multiplyScalar(e.gain || 1) } } });
        } else {
          const L = await loaders();
          eq = await new L.RGBELoader().loadAsync(assetUrl(HDRI[key].file));
          if (dead) { eq.dispose(); return null; }
          info.files++;
          eq.minFilter = THREE.LinearFilter; eq.magFilter = THREE.LinearFilter; eq.generateMipmaps = false;
          src = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: EQ_VS, fragmentShader: EQ_FS,
            uniforms: { tEq: { value: eq }, uRot: { value: rot }, uClamp: { value: e.clamp ?? 24 }, uGain: { value: e.gain || 1 }, uTint: { value: C(e.tint || '#ffffff') } } });
        }
        sc.add(new THREE.Mesh(geo, src));
        const pm = new THREE.PMREMGenerator(renderer);
        const rt = pm.fromScene(sc, 0, 0.1, 100);
        pm.dispose(); geo.dispose(); src.dispose(); if (eq) eq.dispose();
        const tex = rt.texture; tex.dispose = () => rt.dispose();
        const old = envTex; envTex = tex; envSig = sig; info.env = useGrad ? 'gradient' : key;
        if (o.rc && o.rc.setEnvironment) o.rc.setEnvironment(tex); else if (scene) scene.environment = tex;
        if (old) old.dispose();
        return tex;
      } catch (err) {
        info.failed.push('env:' + key); if (src) src.dispose(); if (eq) eq.dispose();
        return null;
      }
    },
    /** follow fx-cine's clock: the HDRI of the time of day, its sun lined up with the scene's sun (call on start and when the time changes) */
    envFor(cine, eo) {
      try { const L = cine.time(), sun = cine.pieces && cine.pieces.sun ? cine.pieces.sun.dir : null; return kit.env(lite ? 'gradient' : HDRI_FOR[L.k < 0.5 ? L.a : L.b] || 'golden', Object.assign({ sunDir: sun, top: L.top, horizon: L.horizon, ground: L.ground }, eo || {})); }
      catch (e) { return kit.env(lite ? 'gradient' : 'golden', eo); }
    },
    /** keep the HDRI on fx-cine's clock: the time of day's sky (and its sun lined up) whenever the clock moves to another time of day */
    follow(cine, eo) {
      let last = '', tNext = 0;
      const check = (dt, t) => { if (dead || t < tNext) return; tNext = t + 2; let L = null; try { L = cine.time(); } catch (e) { return; }
        const key = lite ? 'gradient' + L.name : HDRI_FOR[L.k < 0.5 ? L.a : L.b] || 'golden'; if (key !== last) { last = key; kit.envFor(cine, eo); } };
      if (o.rc && o.rc.onFrame) kit._offFollow = o.rc.onFrame(check);
      check(0, 0);
      return kit;
    },
    builder() { return makeBuilder(kit); },
    /** KayKit props merged into ONE mesh per pack: list = [[propName, x, y, z, ry, scale], ...] (scale multiplies the pack's).
     *  The mesh is added to parent at once (empty) and filled when the pack arrives. -> Promise<Mesh | null> */
    async place(parent, pack, list, po) {
      const P = PACKS[pack]; if (!P || !list || !list.length) return null;
      const holder = new THREE.Group(); holder.name = 'ek-props:' + pack; if (parent) parent.add(holder);
      try {
        const gl = await loadGltf(P.file); if (dead) return null;
        info.files++;
        const byName = new Map(); let material = null;
        gl.scene.updateMatrixWorld(true);
        const put = (k, x) => { if (!k) return; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(x); };
        gl.scene.traverse((x) => { if (x.isMesh) { put(x.name, x); if (x.parent && x.parent !== gl.scene && x.parent.name !== x.name) put(x.parent.name, x); if (!material) material = x.material; } });
        const geos = [], miss = [];
        for (const e of list) {
          const parts = byName.get(e[0]) || [];
          if (!parts.length) { miss.push(e[0]); continue; }
          const s = (e[5] ?? 1) * P.scale, M = mat4(e[1], e[2], e[3], e[4] || 0, s, e[6] || 0, e[7] || 0);
          for (const x of parts) { const g = norm(x.geometry, e[8]); g.applyMatrix4(x.matrixWorld); g.applyMatrix4(M); geos.push(g); }
          for (const lid of byName.get(e[0] + '_lid') || []) { const g = norm(lid.geometry); g.applyMatrix4(lid.matrixWorld); g.applyMatrix4(M); geos.push(g); }
        }
        if (miss.length) info.failed.push(pack + ':' + miss.join(','));
        if (!geos.length) return null;
        const g = mergeGeometries(geos, false); geos.forEach((x) => x.dispose()); g.computeBoundingSphere();
        const m = material.clone(); m.vertexColors = true; m.envMapIntensity = (po && po.envI) ?? 0.8; m.roughness = (po && po.rough) ?? 0.62; m.metalness = 0;
        if (m.map) { m.map.anisotropy = lite ? 1 : aniso; }
        const mesh = new THREE.Mesh(g, m); mesh.name = 'ek-props:' + pack; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        kit._own.push(g, m); holder.add(mesh);
        if (po && po.shadows) mesh.castShadow = mesh.receiveShadow = true;
        if (po && po.onReady) po.onReady(mesh);
        return mesh;
      } catch (err) { info.failed.push(pack); return null; }
    },
    /** a Poly Haven hero model, instanced: list = [[x, y, z, ry, scale], ...] (scale x the model's set height). One draw per mesh of the model.
     *  { color: a tint (e.g. terracotta on the white vase), rough, metal, envI } -> Promise<Group | null> */
    async hero(parent, name, list, ho) {
      const H = HEROES[name]; if (!H || !list || !list.length) return null;
      const grp = new THREE.Group(); grp.name = 'ek-hero:' + name; if (parent) parent.add(grp);
      if ((lite || soft) && !(ho && ho.lite)) return grp;             // LITE (and a software GL): fewer props (the hero models stay home)
      try {
        const gl = await loadGltf(H.file); if (dead) return null;
        info.files++;
        gl.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gl.scene), size = box.getSize(new THREE.Vector3()), k = H.h / Math.max(0.0001, size.y);
        const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
        gl.scene.traverse((x) => {
          if (!x.isMesh) return;
          const g = toFloat(x.geometry); g.applyMatrix4(x.matrixWorld); g.applyMatrix4(base);
          const m = x.material.clone();
          if (ho && ho.color) m.color.set(ho.color); if (ho && ho.rough != null) m.roughness = ho.rough; if (ho && ho.metal != null) m.metalness = ho.metal;
          m.envMapIntensity = (ho && ho.envI) ?? 1;
          const im = new THREE.InstancedMesh(g, m, list.length);
          list.forEach((e, i) => im.setMatrixAt(i, mat4(e[0], e[1], e[2], e[3] || 0, e[4] ?? 1)));
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'ek-hero:' + name;
          kit._own.push(g, m); grp.add(im);
        });
        return grp;
      } catch (err) { info.failed.push('hero:' + name); return grp; }
    },
    /** soft contact shadows on the ground: [[x, z, radius, darkness 0..1, y?], ...] in ONE draw */
    blobs(parent, list, bo) {
      if (!list || !list.length) return null;
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(cv);
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: C((bo && bo.color) || '#2a1e14'), opacity: (bo && bo.opacity) ?? 0.55, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const im = new THREE.InstancedMesh(geo, m, list.length), c = new THREE.Color();
      list.forEach((e, i) => { im.setMatrixAt(i, mat4(e[0], e[4] ?? (bo && bo.y) ?? 0.012, e[1], e[6] || 0, [e[2] * 2, 1, (e[5] ?? e[2]) * 2])); });
      im.instanceMatrix.needsUpdate = true; void c; im.renderOrder = 1; im.name = 'ek-blobs'; im.frustumCulled = false;
      kit._own.push(geo, m, tex);
      if (parent) parent.add(im);
      return im;
    },
    /** a canvas-painted texture (frieze bands, inlays, signs) as a 'uv' material: paint(g, w, h) */
    painted(key, w, h, paint, po) {
      const k = String(key).startsWith('paint:') ? key : 'paint:' + key;
      if (mats.has(k)) return mats.get(k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; paint(cv.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = lite ? 1 : aniso;
      if (po && po.repeat) t.repeat.set(po.repeat[0], po.repeat[1]);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: (po && po.rough) ?? 0.8, metalness: 0, envMapIntensity: o.envI ?? 1, side: (po && po.side) || THREE.FrontSide });
      info.texels += w * h; kit._own.push(t, m); mats.set(k, m);
      return m;
    },
    /** a painted material made by painted() (vertex colours on, so builder tints work), or null */
    paintMat(k) { const m = mats.get(k); if (m && !m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; } return m || null; },
    /** set every kit material's env intensity (the HDRI's strength in this scene) */
    setEnvIntensity(v) { mats.forEach((m) => { m.envMapIntensity = v; }); },
    stats() {
      const texMB = (info.texels * 4 * 1.34) / 1048576 + (envTex ? 1.6 : 0);       // RGBA8 + mips; a 256 PMREM is about 1.6 MB of half floats
      return { tier, lite, soft, materials: mats.size, files: info.files, failed: info.failed.slice(), texMB: Math.round(texMB * 10) / 10, env: info.env };
    },
    dispose() {
      if (dead) return; dead = true; if (kit._offFollow) kit._offFollow();
      if (envTex) { if (o.rc && o.rc.setEnvironment) o.rc.setEnvironment(null); else if (scene && scene.environment === envTex) scene.environment = null; envTex.dispose(); envTex = null; }
      mats.forEach((m) => m.dispose()); mats.clear();
      texs.forEach((p) => p.then((t) => t && t.dispose())); texs.clear();
      kit._own.forEach((x) => x && x.dispose && x.dispose()); kit._own.length = 0;
    },
  };
  return kit;
}

/** count what a scene draws (meshes visible; instanced = one draw) and its triangles: the budget probe the tests use */
export function measure(root) {
  let draws = 0, tris = 0;
  root.traverse((x) => {
    if (!(x.isMesh || x.isPoints || x.isLine) || !x.visible) return;
    let p = x.parent, vis = true; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    draws += Array.isArray(x.material) ? x.material.length : 1;
    const g = x.geometry; if (!g || !x.isMesh) return;
    const c = g.index ? g.index.count : g.getAttribute('position') ? g.getAttribute('position').count : 0;
    tris += (c / 3) * (x.isInstancedMesh ? x.count : 1);
  });
  return { draws, tris: Math.round(tris) };
}
