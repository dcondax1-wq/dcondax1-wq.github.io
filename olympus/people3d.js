// PEOPLE OF OLYMPUS in 3D, figure v2 (docs/PERSONA_API.md "Figure API v2"). Our own friendly stylised Olympus people: a big expressive head, a soft sculpted body,
// cel (toon) shading with a warm rim light and a thin ink outline. Original designs, everything made in code: no images, no downloaded models.
//
//   import { spec, figure, figureInstanced, setMouth, setExpression, setTalking, animate, play, lookAt, POSE_NAMES, WORK_POSES, VISEMES, EXPRESSIONS } from '../olympus/people3d.js';
//   const f = figure(THREE, spec('scanner:sibyl'), { lite, seated, scale });   // Object3D about 1 unit tall, feet at y = 0, facing +z
//   play(f, 'weigh', { loop: true });  lookAt(f, camera.position);  setExpression(f, 'happy');  setTalking(f, true);  setMouth(f, 'O', 0.8);  animate(f, dt);
//   f.userData.pose(name) / lookAt / tick(dt, t) / dispose() are the v1 calls and still work.
//   const crowd = figureInstanced(THREE, specs, { lite, seated });   // any number of people in 2 draw calls, the same look at a distance
//
// One figure = 2 draw calls (the body with its face, and the ink outline sharing the same vertex buffers), 2 shared materials. The body is one SkinnedMesh on a small
// skeleton (hips, spine, chest, head, arms, legs, the face: eyes, lids, brows, mouth; the props). The mouth has 6 morph targets (the visemes). Budgets are measured by
// tests/test_people.py. THREE is passed in: this module imports no three.js of its own and never touches the DOM (it runs in node for the tests).
import * as C from './people-core.js';

/** the character sheet for an id, a person or a ready spec (unchanged from v1) */
export function spec(id, over) {
  if (C.isObj(id) && id.hairStyle && id.skin) return over ? C.spec({ seed: id.seed }, { ...id, ...over }) : id;
  try { if (typeof window !== 'undefined' && window.OLYMPUS_PEOPLE && typeof window.OLYMPUS_PEOPLE.spec === 'function') return window.OLYMPUS_PEOPLE.spec(id, over); } catch (_) { /* fall through */ }
  return C.spec(C.isObj(id) ? id : { id: String(id || 'someone'), kind: String(id || '').split(':')[0] }, over);
}

const INK = '#2a2019', IVORY = '#f6efe2', BRONZE = '#b98a4a', GOLD = '#d9b25a', TERRA = '#c96a4a', SANDAL = '#6b4a2a', LEATHER = '#7a5230', WOOD = '#8a5a32', IRON = '#5c574f', LEAF = '#8f9a4a', MOUTH = '#5a2a22', TONGUE = '#c46a5c';
// the skeleton in the bind pose (standing, feet at y = 0, facing +z; +x is the figure's "R" side as in v1)
const HEAD = { y: 0.755, rx: 0.212, ry: 0.205, rz: 0.198 }, NECK_Y = 0.565, HIP_Y = 0.27, SHO_Y = 0.505, UPPER = 0.115, FORE = 0.105, LEG_X = 0.066, THIGH = 0.125;
const R = 0.21;
// detail levels: segments of the round parts, the head, the small spheres, capsule caps, face strip columns and rows
const DET = {
  high: { seg: 9, hw: 20, hh: 14, small: 7, smallH: 5, cap: 2, face: 9, rows: 3 },
  lite: { seg: 7, hw: 15, hh: 10, small: 6, smallH: 4, cap: 1, face: 7, rows: 2, lite: true },
  crowd: { seg: 7, hw: 12, hh: 9, small: 5, smallH: 3, cap: 1, face: 6, rows: 2, lite: true, lo: true },
  crowdLite: { seg: 6, hw: 9, hh: 7, small: 4, smallH: 3, cap: 1, face: 5, rows: 2, lite: true, lo: true },
};                       // v1 head radius (kept for callers that used it for label heights)
export const VISEMES = ['rest', 'A', 'E', 'O', 'MBP', 'smile', 'frown'];
const MORPHS = VISEMES.slice(1);
export const EXPRESSIONS = ['neutral', 'happy', 'proud', 'worried', 'thinking', 'surprised', 'sheepish'];
/** which job each kind shows when it works (scenes: play(f, WORK_POSES[kind])) */
export const WORK_POSES = { builder: 'hammer', scanner: 'weigh', bot: 'type', mind: 'write', keeper: 'telescope', champion: 'read', villager: 'carry', owner: 'read' };
export function workPose(x) { const k = C.isObj(x) ? (x.kind || ({ hammer: 'builder', pouch: 'scanner', helmet: 'bot', scroll: 'mind', owl: 'mind', torch: 'builder', key: 'keeper', laurel: 'champion' })[x.accessory]) : String(x || '').split(':')[0]; return WORK_POSES[k] || 'carry'; }

// ------------------------------------------------------------------------------------------------ materials (one set per THREE, shared by every figure)
const MATS = new WeakMap();
function gradient(THREE) {
  const t = new THREE.DataTexture(new Uint8Array([118, 118, 118, 255, 196, 196, 196, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
const RIM_GLSL = 'float rimD = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\noutgoingLight += uRim * smoothstep(0.58, 0.92, rimD) * (0.35 + 0.65 * diffuseColor.rgb);\n#include <opaque_fragment>';
function toonMaterial(THREE, extra) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient(THREE) });
  const rim = { value: new THREE.Color('#ffd7a0').multiplyScalar(0.32) };
  m.userData.rim = rim;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;').replace('#include <opaque_fragment>', RIM_GLSL);
    if (extra) extra(sh);
  };
  return m;
}
function outlineMaterial(THREE, width, extra) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const w = { value: width };
  m.userData.width = w;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = w;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uOutline;');
    if (extra) extra(sh);
    else sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\ntransformed += normalize(objectNormal) * uOutline;\n#else\ntransformed += normalize(normal) * uOutline;\n#endif');
  };
  return m;
}
/** the shared toon + outline materials of the hero figures (exported so a scene can tune the rim colour or the line width in one place) */
export function materials(THREE) {
  let m = MATS.get(THREE);
  if (!m) { m = { toon: toonMaterial(THREE), line: outlineMaterial(THREE, 0.0085) }; m.toon.name = 'olympus-person'; m.line.name = 'olympus-person-ink'; MATS.set(THREE, m); }
  return m;
}

// ------------------------------------------------------------------------------------------------ the look: what to draw for a spec (shared with the 2D portrait)
const look = (s) => C.drawLook(s);

// ------------------------------------------------------------------------------------------------ geometry helpers
function M(THREE, x, y, z, rx, ry, rz, sx, sy, sz) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
}
const lathe = (THREE, pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
const sphere = (THREE, r, w, h, a, b, c, d) => new THREE.SphereGeometry(r, w, h, a, b, c, d);
function flip(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } const n = g.getAttribute('normal'); for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; }
/** the head surface: an ellipsoid with a softer, narrower jaw. dir = unit vector from the head centre -> [x, y, z] */
function surf(dx, dy, dz) {
  let x = dx * HEAD.rx, y = dy * HEAD.ry, z = dz * HEAD.rz;
  if (dy < 0) { const k = -dy; x *= 1 - 0.14 * k * k; z *= 1 - 0.05 * k * k; y *= 1 - 0.04 * k; }
  if (dz < 0) z *= 1.04;
  return [x, y, z];
}
/** a point on the face: yaw ax and pitch ay (radians from the front), lifted off the skin by `lift` (fraction of the radius) -> { p:[x,y,z], n:[x,y,z] } head-local */
function wrap(ax, ay, lift) {
  const ca = Math.cos(ay), dx = Math.sin(ax) * ca, dy = Math.sin(ay), dz = Math.cos(ax) * ca, p = surf(dx, dy, dz), k = 1 + (lift || 0);
  let nx = p[0] / (HEAD.rx * HEAD.rx), ny = p[1] / (HEAD.ry * HEAD.ry), nz = p[2] / (HEAD.rz * HEAD.rz); const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  return { p: [p[0] * k, p[1] * k, p[2] * k], n: [nx, ny, nz] };
}
function headGeo(THREE, w, h) {
  const g = new THREE.SphereGeometry(1, w, h), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1, s = surf(x / l, y / l, z / l); p.setXYZ(i, s[0], s[1], s[2]); }
  g.computeVertexNormals(); return g;
}
/** a flat shape painted on the face: a strip between top(x) and bot(x) for x in [-1, 1] (angles, around cx, cy), wrapped on the head. variants: [[top, bot], ...] -> morphs */
function faceStrip(THREE, n, w, cx, cy, lift, shapes, rows) {
  const xs = [], nr = rows || 4; for (let i = 0; i < n; i++) xs.push(-Math.cos((Math.PI * i) / (n - 1)));
  const make = (top, bot, ww) => { const pos = [], nor = []; for (const x of xs) { const t = top(x), b = bot(x); for (let r = 0; r < nr; r++) { const v = wrap(cx + x * ww, cy + t + (b - t) * (r / (nr - 1)), lift); pos.push(v.p[0], v.p[1], v.p[2]); nor.push(v.n[0], v.n[1], v.n[2]); } } return [pos, nor]; };
  const [s0, ...rest] = shapes, [pos, nor] = make(s0[0], s0[1], s0[2] == null ? w : s0[2]), idx = [];
  for (let i = 0; i < n - 1; i++) for (let r = 0; r < nr - 1; r++) { const t = i * nr + r, b = t + 1, t1 = t + nr, b1 = t1 + 1; idx.push(t, b, t1, b, b1, t1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  if (rest.length) { g.userData.morph = rest.map((sh) => new Float32Array(make(sh[0], sh[1], sh[2] == null ? w : sh[2])[0])); g.userData.base = new Float32Array(pos); }
  return g;
}
const ell = (rx, ry) => [(x) => ry * Math.sqrt(Math.max(0, 1 - x * x)), (x) => -ry * Math.sqrt(Math.max(0, 1 - x * x)), rx];

// ------------------------------------------------------------------------------------------------ the parts
// A part: { g: geometry (head-local or body space), m: Matrix4 or null, bone: name, col: '#hex' | [slot, shade], key: variant key | null, face: true (no ink line) }
// slots: skin, hair, outfit, accent (the person's own colours); the crowd colours them per person in the shader, the hero bakes them.
const SK = (k) => ['skin', k == null ? 1 : k], HR = (k) => ['hair', k == null ? 1 : k], OU = (k) => ['outfit', k == null ? 1 : k], AC = (k) => ['accent', k == null ? 1 : k];
const FAT = { slim: 0.9, round: 1.13, broad: 1.06 };
const SHO_X = { slim: 0.136, round: 0.152, broad: 0.157 };
/** every part of a person. ctx: { det, want(key), add(part) }. Parts behind a key are built only when want(key) says so. */
function gen(THREE, s, L, ctx) {
  const d = ctx.det, seg = d.seg, add = (key, mk, bone, col, opt) => { if (key && !ctx.want(key)) return; const r = mk(); if (!r) return; ctx.add({ g: r[0], m: r[1] || null, bone, col, key: key || null, face: !!(opt && opt.face), noInk: !!(opt && opt.noInk) }); };
  const lo = !!d.lo, ni = { noInk: true };
  const fat = FAT[s.build] || 1, hy = HEAD.y;
  // ---- head, neck, ears, nose
  add(null, () => [headGeo(THREE, d.hw, d.hh), M(THREE, 0, hy, 0)], 'head', SK());
  add(null, () => [new THREE.CylinderGeometry(0.046, 0.05, 0.1, seg, 1, true), M(THREE, 0, 0.585, -0.005)], 'head', SK(0.9));
  for (const e of [-1, 1]) add(null, () => [sphere(THREE, 0.046, d.small, d.smallH), M(THREE, e * HEAD.rx * 0.95, hy - 0.012, -0.012, 0, e * 0.3, 0, 0.42, 0.78, 0.62)], 'head', SK(0.93));
  { const v = wrap(0, -0.2, 0.03); add(null, () => [sphere(THREE, 0.026, d.small, d.smallH), M(THREE, v.p[0], hy + v.p[1], v.p[2], -0.3, 0, 0, 1.05, 0.85, 0.9)], 'head', SK(0.96)); }
  // ---- torso: chest (outfit) on the chest bone, the skirt on the hips
  const up = [[0.112, 0.37], [0.116, 0.41], [0.128, 0.46], [0.133, 0.495], [0.125, 0.525], [0.098, 0.553], [0.05, 0.572], [0.0, 0.58]];
  add(null, () => [lathe(THREE, up, seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.86)], 'chest', OU());
  if (!lo && s.build === 'round') add(null, () => [sphere(THREE, 0.11, d.small, d.smallH), M(THREE, 0, 0.39, 0.025, 0, 0, 0, 1.05, 0.95, 0.9)], 'spine', OU());
  const skirt = (hem, rHem) => [[rHem, hem], [rHem - 0.005, hem + 0.02], [0.15, 0.24], [0.135, 0.3], [0.122, 0.35], [0.115, 0.4], [0.112, 0.44]];
  add('g:skirt', () => [lathe(THREE, skirt(0.165, 0.163), seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.88)], 'hips', OU());
  add('g:skirt', () => [lathe(THREE, [[0.163, 0.155], [0.168, 0.168], [0.164, 0.18]], seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.88)], 'hips', AC());
  add('g:long', () => [lathe(THREE, skirt(0.06, 0.17), seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.88)], 'hips', OU());
  add('g:long', () => [lathe(THREE, [[0.169, 0.05], [0.174, 0.062], [0.17, 0.074]], seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.88)], 'hips', AC());
  add(null, () => [new THREE.TorusGeometry(0.117, 0.013, 3, seg + 2), M(THREE, 0, 0.405, 0, Math.PI / 2, 0, 0, fat, fat * 0.87, 1)], 'spine', AC(0.92), ni);
  if (!lo) add(null, () => [sphere(THREE, 0.014, 6, 4), M(THREE, 0.07 * fat, 0.525, 0.085 * fat)], 'chest', GOLD, ni);
  // ---- garb extras
  add('g:cloak', () => [new THREE.CylinderGeometry(0.135 * fat, 0.2 * fat, 0.4, seg, 1, true, Math.PI - 1.75, 3.5), M(THREE, 0, 0.355, -0.012, 0.06, 0, 0, 1, 1, 0.8)], 'chest', AC());
  if (!lo) add('g:cloak', () => [flip(new THREE.CylinderGeometry(0.13 * fat, 0.194 * fat, 0.4, seg, 1, true, Math.PI - 1.75, 3.5)), M(THREE, 0, 0.355, -0.012, 0.06, 0, 0, 1, 1, 0.8)], 'chest', AC(0.7));
  add('g:cloak', () => [new THREE.TorusGeometry(0.105 * fat, 0.022, 4, seg + 2, Math.PI * 1.2), M(THREE, 0, 0.54, -0.01, Math.PI / 2 + 0.25, 0, Math.PI * 1.4, 1, 0.82, 1)], 'chest', AC(0.9));
  if (!lo) add('g:cloak', () => [sphere(THREE, 0.02, 6, 4), M(THREE, -0.08 * fat, 0.53, 0.08 * fat)], 'chest', GOLD, ni);
  add('g:apron', () => [new THREE.CylinderGeometry(0.142 * fat, 0.172 * fat, 0.3, Math.max(6, seg - 2), 1, true, -0.95, 1.9), M(THREE, 0, 0.33, 0.004, 0, 0, 0, 1, 1, 0.9)], 'spine', LEATHER);
  if (!lo) add('g:apron', () => [new THREE.BoxGeometry(0.07, 0.05, 0.012), M(THREE, 0.0, 0.3, 0.158 * fat)], 'spine', '#6a4626', ni);
  add('g:apron', () => [new THREE.TorusGeometry(0.075, 0.008, 3, 10, Math.PI), M(THREE, 0, 0.5, 0.06, -0.5, 0, 0)], 'chest', LEATHER);
  add('g:armour', () => [lathe(THREE, [[0.118, 0.37], [0.124, 0.4], [0.138, 0.46], [0.142, 0.495], [0.133, 0.53], [0.108, 0.55], [0.08, 0.557]], seg), M(THREE, 0, 0, 0, 0, 0, 0, fat, 1, fat * 0.88)], 'chest', BRONZE);
  if (!lo && ctx.want('g:armour')) for (let i = 0; i < (d.lite ? 6 : 10); i++) { const a = (i / (d.lite ? 6 : 10)) * Math.PI * 2; add('g:armour', () => [new THREE.BoxGeometry(0.05, 0.085, 0.012), M(THREE, Math.sin(a) * 0.137 * fat, 0.33, Math.cos(a) * 0.137 * fat * 0.88, 0.1, a, 0)], 'hips', LEATHER); }
  for (const e of [-1, 1]) add('g:armour', () => [sphere(THREE, 0.064, d.small, d.smallH, 0, Math.PI * 2, 0, Math.PI / 2), M(THREE, 0, 0.005, 0, 0, 0, e * 0.35)], e < 0 ? 'shoulderL' : 'shoulderR', BRONZE);
  add('g:sash', () => [new THREE.TorusGeometry(0.15 * fat, 0.028, lo ? 3 : 5, seg + 4), M(THREE, 0, 0, 0, Math.PI / 2, 0, 0, 1, 0.84, 1).premultiply(M(THREE, 0, 0, 0, 0, 0, 0.62)).premultiply(M(THREE, 0, 0.44, 0.0))], 'chest', AC(1.04));
  if (!lo) add('g:sash', () => [sphere(THREE, 0.05, d.small, d.smallH), M(THREE, -0.1 * fat, 0.53, 0.0, 0, 0, 0.4, 1.0, 0.7, 1.2)], 'chest', AC(1.04));
  // ---- arms: a sleeve, the upper arm, the forearm, a soft mitten hand with a thumb
  for (const e of [-1, 1]) {
    const S = e < 0 ? 'L' : 'R';
    if (!lo) add(null, () => [sphere(THREE, 0.054, d.small, d.smallH), M(THREE, 0, -0.005, 0)], 'shoulder' + S, OU());
    add(null, () => [new THREE.CylinderGeometry(0.052, 0.047, 0.07, seg, 1, true), M(THREE, 0, -0.04, 0)], 'shoulder' + S, OU());
    add(null, () => [new THREE.CapsuleGeometry(0.034, 0.075, d.cap, seg), M(THREE, 0, -0.07, 0)], 'shoulder' + S, SK());
    add(null, () => [new THREE.CapsuleGeometry(0.032, 0.065, d.cap, seg), M(THREE, 0, -0.05, 0)], 'elbow' + S, SK());
    add(null, () => [sphere(THREE, 0.043, d.small, d.smallH), M(THREE, 0, -0.03, 0.004, 0, 0, 0, 0.82, 1.08, 0.78)], 'hand' + S, SK());
    if (!lo) add(null, () => [sphere(THREE, 0.017, 6, 4), M(THREE, -e * 0.02, -0.012, 0.03, 0.4, 0, 0, 0.9, 1.3, 0.9)], 'hand' + S, SK(0.96), ni);
  }
  // ---- legs and sandals
  for (const e of [-1, 1]) {
    const S = e < 0 ? 'L' : 'R';
    add(null, () => [new THREE.CapsuleGeometry(0.044, 0.08, d.cap, seg), M(THREE, 0, -0.058, 0)], 'thigh' + S, SK());
    add(null, () => [new THREE.CapsuleGeometry(0.039, 0.07, d.cap, seg), M(THREE, 0, -0.05, 0)], 'knee' + S, SK());
    add(null, () => [sphere(THREE, 0.048, d.small, d.smallH), M(THREE, 0, -0.12, 0.022, 0, 0, 0, 0.9, 0.55, 1.45)], 'knee' + S, SANDAL);
    if (!d.lite) add(null, () => [new THREE.TorusGeometry(0.039, 0.007, 3, 10), M(THREE, 0, -0.095, 0, Math.PI / 2, 0, 0)], 'knee' + S, SANDAL, ni);
  }
  // ---- hair (a cap under every cut, then the cut's own shapes), head-local around the head centre
  const H = (key, mk, col) => add(key, () => { const r = mk(); r[1] = new THREE.Matrix4().makeTranslation(0, hy, 0).multiply(r[1] || new THREE.Matrix4()); return r; }, 'head', col || HR());
  const capR = 1.075;
  H('h:cap', () => [sphere(THREE, 1, d.hw, Math.max(5, d.hh >> 1), 0, Math.PI * 2, 0, Math.PI * 0.56), M(THREE, 0, 0.012, -0.012, -0.42, 0, 0, HEAD.rx * capR, HEAD.ry * capR, HEAD.rz * capR)]);
  for (let i = 0; i < (lo ? 3 : 5); i++) { const a = (i - (lo ? 1 : 2)) * (lo ? 0.42 : 0.3), v = wrap(a, 0.62 - Math.abs(i - 2) * 0.05, 0.05); H('h:fringe', () => [sphere(THREE, 0.05, Math.max(5, d.small - 1), 4), M(THREE, v.p[0], v.p[1], v.p[2], -0.5, a, 0, 1.05, 0.62, 0.55)], HR(i % 2 ? 1 : 1.08)); }
  { const v = wrap(-0.2, 0.6, 0.06); H('h:swoop', () => [sphere(THREE, 0.13, d.small + 2, d.smallH), M(THREE, v.p[0] + 0.02, v.p[1] - 0.005, v.p[2] - 0.02, -0.5, 0.2, -0.35, 1.25, 0.42, 0.62)]); }
  for (let i = 0; i < (lo ? 4 : 7); i++) { const a = (i / (lo ? 4 : 7)) * Math.PI * 2, rr = i === 0 ? 0 : 0.11; H('h:spikes', () => [new THREE.ConeGeometry(0.045, 0.11, 5), M(THREE, Math.sin(a) * rr * 0.8, HEAD.ry * 0.98 + (i ? -0.03 : 0.01), Math.cos(a) * rr * 0.6 - 0.03, -0.5 + Math.cos(a) * 0.5 * (i ? 1 : 0), 0, -Math.sin(a) * 0.55 * (i ? 1 : 0))], HR(i % 2 ? 1 : 1.1)); }
  for (let i = 0; i < (lo ? 6 : 11); i++) { const a = -2.6 + (i / (lo ? 5 : 10)) * 5.2, el = i % 2 ? 0.55 : 0.32, v = wrap(a, el, 0.08); H('h:puffs', () => [sphere(THREE, 0.062, d.small, d.smallH), M(THREE, v.p[0], v.p[1], v.p[2])], HR(i % 3 === 0 ? 1.1 : i % 3 === 1 ? 0.94 : 1)); }
  H('h:puffs', () => [sphere(THREE, 0.075, d.small, d.smallH), M(THREE, 0, HEAD.ry * 0.98, -0.02)], HR(1.05));
  H('h:afro', () => [sphere(THREE, 1, d.hw, d.hh), M(THREE, 0, 0.075, -0.065, 0, 0, 0, HEAD.rx * 1.38, HEAD.ry * 1.2, HEAD.rz * 1.12)]);
  H('h:bun', () => [sphere(THREE, 0.082, d.small + 2, d.smallH + 1), M(THREE, 0, HEAD.ry * 0.95, -HEAD.rz * 0.55)]);
  if (!lo) H('h:bun', () => [new THREE.TorusGeometry(0.06, 0.012, 3, 10), M(THREE, 0, HEAD.ry * 0.86, -HEAD.rz * 0.48, -0.95, 0, 0)], AC());
  H('h:knot', () => [sphere(THREE, 0.06, d.small, d.smallH), M(THREE, 0, HEAD.ry * 1.18, -0.025, 0, 0, 0, 0.85, 1.25, 0.85)]);
  if (!lo) H('h:knot', () => [new THREE.CylinderGeometry(0.035, 0.04, 0.03, 8), M(THREE, 0, HEAD.ry * 1.05, -0.022)], GOLD);
  H('h:long', () => [sphere(THREE, 1, d.hw, Math.max(5, d.hh >> 1), Math.PI * 1.06, Math.PI * 0.88, Math.PI * 0.22, Math.PI * 0.6), M(THREE, 0, -0.02, -0.01, 0, 0, 0, HEAD.rx * 1.1, HEAD.ry * 1.45, HEAD.rz * 1.1)]);
  for (const e of [-1, 1]) H('h:long', () => [new THREE.CapsuleGeometry(0.035, 0.16, d.cap, d.small), M(THREE, e * HEAD.rx * 0.92, -0.1, -0.02, 0.1, 0, e * 0.08, 1, 1, 0.7)]);
  H('h:tail', () => [new THREE.CapsuleGeometry(0.042, 0.16, d.cap, d.small), M(THREE, 0, -0.08, -HEAD.rz * 1.08, 0.3, 0, 0)]);
  if (!lo) H('h:tail', () => [new THREE.TorusGeometry(0.036, 0.01, 3, 10), M(THREE, 0, 0.0, -HEAD.rz * 1.07, Math.PI / 2 + 0.3, 0, 0)], AC());
  H('h:bob', () => [sphere(THREE, 1, d.hw, Math.max(5, d.hh >> 1), Math.PI * 0.9, Math.PI * 1.2, Math.PI * 0.18, Math.PI * 0.5), M(THREE, 0, -0.005, -0.006, 0, 0, 0, HEAD.rx * 1.1, HEAD.ry * 1.12, HEAD.rz * 1.1)]);
  for (const e of [-1, 1]) for (let i = 0; i < (lo ? 2 : 3); i++) { const v = wrap(e * (1.25 + i * 0.25), 0.15 - i * 0.28, 0.06); H('h:waves', () => [sphere(THREE, 0.062, d.small, d.smallH), M(THREE, v.p[0], v.p[1], v.p[2], 0, 0, e * 0.4, 0.75, 1.15, 0.9)], HR(i % 2 ? 1.08 : 1)); }
  { const v = wrap(0.05, 0.75, 0.05); H('h:quiff', () => [sphere(THREE, 0.1, d.small + 2, d.smallH), M(THREE, v.p[0], v.p[1] + 0.02, v.p[2] - 0.03, -0.9, 0, 0.1, 1.05, 0.7, 0.85)]); }
  for (const e of [-1, 1]) { const v = wrap(e * 1.45, 0.12, 0.05); H('h:tufts', () => [sphere(THREE, 0.055, d.small, d.smallH), M(THREE, v.p[0], v.p[1], v.p[2] - 0.03, 0, 0, 0, 0.6, 1.0, 1.25)]); }
  // ---- beards, glasses (the glasses carry no ink line: they are thin)
  H('b:short', () => [sphere(THREE, 1, d.hw, Math.max(4, d.hh >> 1), Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.56, Math.PI * 0.36), M(THREE, 0, -0.004, 0.002, 0, 0, 0, HEAD.rx * 1.045, HEAD.ry * 1.03, HEAD.rz * 1.05)]);
  H('b:full', () => [sphere(THREE, 1, d.hw, Math.max(4, d.hh >> 1), Math.PI * 0.02, Math.PI * 0.96, Math.PI * 0.5, Math.PI * 0.42), M(THREE, 0, -0.012, 0.004, 0, 0, 0, HEAD.rx * 1.07, HEAD.ry * 1.1, HEAD.rz * 1.08)]);
  if (!lo) H('b:full', () => [sphere(THREE, 0.07, d.small, d.smallH), M(THREE, 0, -HEAD.ry * 0.98, HEAD.rz * 0.55, 0, 0, 0, 1, 0.9, 0.8)]);
  for (const e of [-1, 1]) { const v = wrap(e * 0.1, -0.3, 0.05); H('b:mous', () => [sphere(THREE, 0.034, d.small, d.smallH), M(THREE, v.p[0], v.p[1], v.p[2], 0, 0, e * 0.35, 1.25, 0.55, 0.6)]); }
  if (!lo) for (const e of [-1, 1]) { const v = wrap(e * L.eyeX, L.eyeY, 0.19); H('glasses', () => { const g = new THREE.TorusGeometry(0.044, 0.0055, 4, 14), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v.n)); return [g, new THREE.Matrix4().compose(new THREE.Vector3(...v.p), q, new THREE.Vector3(1, 0.92, 1))]; }, SANDAL); }
  if (!lo) { const v = wrap(0, L.eyeY + 0.03, 0.2); H('glasses', () => [new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), M(THREE, v.p[0], v.p[1], v.p[2], 0, 0, Math.PI / 2)], SANDAL); }
  // ---- head accessories
  if (lo) H('a:laurel', () => [new THREE.TorusGeometry(1, 0.11, 3, 12, Math.PI * 1.7), M(THREE, 0, 0.05, -0.02, Math.PI / 2 - 0.35, 0, Math.PI * 0.65, HEAD.rx * 1.06, HEAD.rz * 1.06, 0.2)], LEAF);
  if (!lo) for (let i = 0; i < 14; i++) {
    const side = i < 7 ? -1 : 1, k = i % 7, a = side * (0.5 + k * 0.36), v = wrap(a, 0.52 - k * 0.07, 0.08);
    H('a:laurel', () => [sphere(THREE, 1, 6, 4), new THREE.Matrix4().compose(new THREE.Vector3(...v.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, a + side * 0.9, side * 0.6)), new THREE.Vector3(0.036, 0.012, 0.017))], k % 2 ? GOLD : LEAF);
  }
  H('a:helmet', () => [sphere(THREE, 1, d.hw, Math.max(5, d.hh >> 1), 0, Math.PI * 2, 0, Math.PI * 0.6), M(THREE, 0, 0.004, -0.008, -0.3, 0, 0, HEAD.rx * 1.12, HEAD.ry * 1.1, HEAD.rz * 1.12)], BRONZE);
  if (!lo) H('a:helmet', () => [new THREE.TorusGeometry(HEAD.rx * 1.12, 0.012, 4, d.hw, Math.PI * 2), M(THREE, 0, 0.012, -0.012, Math.PI / 2 - 0.3, 0, 0, 1, HEAD.rz / HEAD.rx, 1)], '#8e6a36');
  H('a:helmet', () => [new THREE.TorusGeometry(HEAD.ry * 1.05, 0.034, lo ? 3 : 5, lo ? 9 : 16, Math.PI * 1.05), M(THREE, 0, 0.065, -0.03, 0, Math.PI / 2, -0.02, 1, 1.05, 0.42)], TERRA);
  if (!lo) for (const e of [-1, 1]) H('a:helmet', () => [sphere(THREE, 0.07, d.small, d.smallH), M(THREE, e * HEAD.rx * 0.98, -0.07, 0.03, 0, 0, e * -0.15, 0.32, 1.1, 0.9)], BRONZE);
  // ---- body accessories
  add('a:pouch', () => [sphere(THREE, 0.048, d.small, d.smallH), M(THREE, 0.1 * fat, 0.37, 0.095 * fat, 0, 0, 0, 1, 1.1, 0.75)], 'hips', LEATHER);
  add('a:pouch', () => [new THREE.CylinderGeometry(0.02, 0.02, 0.006, 10), M(THREE, 0.1 * fat, 0.37, 0.132 * fat, Math.PI / 2)], 'hips', GOLD);
  if (!lo) add('a:key', () => [new THREE.TorusGeometry(0.026, 0.008, 4, 10), M(THREE, -0.085 * fat, 0.37, 0.11 * fat)], 'hips', GOLD);
  if (!lo) add('a:key', () => [new THREE.BoxGeometry(0.01, 0.06, 0.01), M(THREE, -0.085 * fat, 0.33, 0.11 * fat)], 'hips', GOLD);
  add('a:owl', () => [sphere(THREE, 0.05, d.small, d.smallH), M(THREE, 0, 0, 0, 0, 0, 0, 0.92, 1.12, 0.88)], 'p_owl', '#9c6b3c');
  add('a:owl', () => [sphere(THREE, 0.034, d.small, d.smallH), M(THREE, 0, -0.012, 0.022, 0, 0, 0, 1, 1.1, 0.7)], 'p_owl', '#d9c08a');
  if (!lo) for (const e of [-1, 1]) { add('a:owl', () => [new THREE.CircleGeometry(0.016, 8), M(THREE, e * 0.018, 0.018, 0.046)], 'p_owl', IVORY, { face: true }); add('a:owl', () => [new THREE.CircleGeometry(0.008, 6), M(THREE, e * 0.018, 0.018, 0.048)], 'p_owl', INK, { face: true }); add('a:owl', () => [new THREE.ConeGeometry(0.012, 0.025, 4), M(THREE, e * 0.026, 0.05, -0.004, 0, 0, -e * 0.3)], 'p_owl', '#8a5a32'); }
  if (!lo) add('a:owl', () => [new THREE.ConeGeometry(0.008, 0.018, 4), M(THREE, 0, 0.002, 0.05, Math.PI / 2)], 'p_owl', GOLD);
  // ---- props in the hands (each on its own bone: shown and hidden by the pose)
  const P = (key, bone, mk, col) => add(key, mk, bone, col);
  P('a:hammer', 'p_hammer', () => [new THREE.CylinderGeometry(0.01, 0.011, 0.2, 6), M(THREE, 0, 0, 0.07, Math.PI / 2)], WOOD);
  P('a:hammer', 'p_hammer', () => [new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), M(THREE, 0, 0, 0.17, 0, 0, Math.PI / 2)], IRON);
  P('a:torch', 'p_torch', () => [new THREE.CylinderGeometry(0.013, 0.01, 0.2, 6), M(THREE, 0, 0, 0.06, Math.PI / 2)], WOOD);
  P('a:torch', 'p_torch', () => [new THREE.ConeGeometry(0.034, 0.1, 7), M(THREE, 0, 0, 0.2, Math.PI / 2)], '#e0b060');
  if (!lo) P('a:torch', 'p_torch', () => [new THREE.ConeGeometry(0.02, 0.06, 6), M(THREE, 0, 0, 0.21, Math.PI / 2)], TERRA);
  P('a:scroll', 'p_scroll', () => [new THREE.CylinderGeometry(0.024, 0.024, 0.16, 8), M(THREE, 0, 0, 0.02, 0, 0, Math.PI / 2)], '#e9dfc9');
  if (!lo) for (const e of [-1, 1]) P('a:scroll', 'p_scroll', () => [new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), M(THREE, e * 0.09, 0, 0.02, 0, 0, Math.PI / 2)], WOOD);
  P('a:lantern', 'p_lantern', () => [new THREE.CylinderGeometry(0.03, 0.034, 0.07, 6), M(THREE, 0, -0.07, 0.0)], '#f0d79a');
  P('a:lantern', 'p_lantern', () => [new THREE.ConeGeometry(0.04, 0.035, 6), M(THREE, 0, -0.02, 0.0)], BRONZE);
  if (!lo) P('a:lantern', 'p_lantern', () => [new THREE.CylinderGeometry(0.04, 0.036, 0.012, 6), M(THREE, 0, -0.108, 0.0)], BRONZE);
  if (ctx.work) {
    P('w:hammer', 'p_whammer', () => [new THREE.CylinderGeometry(0.01, 0.011, 0.2, 6), M(THREE, 0, 0, 0.07, Math.PI / 2)], WOOD);
    P('w:hammer', 'p_whammer', () => [new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), M(THREE, 0, 0, 0.17, 0, 0, Math.PI / 2)], IRON);
    P('w:anvil', 'p_anvil', () => [new THREE.BoxGeometry(0.11, 0.12, 0.09), M(THREE, 0, 0.09, 0)], IRON);
    P('w:anvil', 'p_anvil', () => [new THREE.BoxGeometry(0.22, 0.05, 0.1), M(THREE, 0, 0.17, 0)], '#6c665d');
    P('w:anvil', 'p_anvil', () => [new THREE.ConeGeometry(0.035, 0.09, 6), M(THREE, -0.15, 0.17, 0, 0, 0, Math.PI / 2)], '#6c665d');
    P('w:anvil', 'p_anvil', () => [new THREE.BoxGeometry(0.16, 0.04, 0.12), M(THREE, 0, 0.02, 0)], WOOD);
    P('w:quill', 'p_quill', () => [sphere(THREE, 1, 6, 4), M(THREE, 0, 0.05, 0.0, 0, 0, 0.0, 0.012, 0.075, 0.005)], IVORY);
    P('w:quill', 'p_quill', () => [new THREE.ConeGeometry(0.005, 0.03, 4), M(THREE, 0, -0.03, 0, Math.PI)], INK);
    P('w:tablet', 'p_tablet', () => [new THREE.BoxGeometry(0.16, 0.012, 0.115), M(THREE, 0, 0, 0)], WOOD);
    P('w:tablet', 'p_tablet', () => [new THREE.BoxGeometry(0.135, 0.004, 0.09), M(THREE, 0, 0.007, 0)], '#3d3226');
    P('w:scrollOpen', 'p_scrollOpen', () => [new THREE.BoxGeometry(0.2, 0.13, 0.004), M(THREE, 0, 0, 0)], '#efe5cf');
    for (const e of [-1, 1]) P('w:scrollOpen', 'p_scrollOpen', () => [new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), M(THREE, e * 0.105, 0, 0.004)], '#e0d4b8');
    for (let i = 0; i < 4; i++) P('w:scrollOpen', 'p_scrollOpen', () => [new THREE.BoxGeometry(0.13 - (i % 2) * 0.04, 0.007, 0.002), M(THREE, -0.01, 0.035 - i * 0.024, 0.004)], '#9a8f7d');
    P('w:scales', 'p_scales', () => [new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), M(THREE, 0, 0.06, 0)], BRONZE);
    P('w:scales', 'p_beam', () => [new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), M(THREE, 0, 0, 0, 0, 0, Math.PI / 2)], BRONZE);
    for (const e of [-1, 1]) { P('w:scales', 'p_beam', () => [new THREE.CylinderGeometry(0.003, 0.003, 0.08, 3), M(THREE, e * 0.095, -0.04, 0)], BRONZE); P('w:scales', 'p_beam', () => [sphere(THREE, 0.04, 8, 3, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M(THREE, e * 0.095, -0.05, 0)], GOLD); }
    P('w:coin', 'p_coin', () => [new THREE.CylinderGeometry(0.018, 0.018, 0.006, 10), M(THREE, 0, 0, 0.03, Math.PI / 2)], GOLD);
    P('w:telescope', 'p_telescope', () => [new THREE.CylinderGeometry(0.02, 0.03, 0.26, 8), M(THREE, 0, 0, 0.06, Math.PI / 2)], BRONZE);
    P('w:telescope', 'p_telescope', () => [new THREE.CylinderGeometry(0.033, 0.033, 0.03, 8), M(THREE, 0, 0, 0.18, Math.PI / 2)], WOOD);
    P('w:slate', 'p_slate', () => [new THREE.BoxGeometry(0.15, 0.012, 0.105), M(THREE, 0, 0, 0)], BRONZE);
    P('w:slate', 'p_slate', () => [new THREE.BoxGeometry(0.13, 0.004, 0.085), M(THREE, 0, 0.007, 0)], '#e8dcbf');
    for (let i = 0; i < 3; i++) P('w:slate', 'p_slate', () => [new THREE.BoxGeometry(0.09 - i * 0.02, 0.002, 0.008), M(THREE, -0.01, 0.01, -0.025 + i * 0.022)], '#9c6b3c');
    P('w:crate', 'p_crate', () => [new THREE.BoxGeometry(0.22, 0.15, 0.15), M(THREE, 0, 0, 0)], WOOD);
    for (const e of [-1, 1]) P('w:crate', 'p_crate', () => [new THREE.BoxGeometry(0.228, 0.025, 0.158), M(THREE, 0, e * 0.05, 0)], '#6b4426');
  }
}

// ------------------------------------------------------------------------------------------------ the face of a hero: eyes with lids, brows, a mouth with visemes (one bone each)
const mouthShapes = (w0) => C.mouthShapes(w0);
function teethShapes(w0, sh) {
  return VISEMES.map((v) => { const [t, b, w] = sh[v], k = w / w0, open = t(0) - b(0); const th = v === 'A' || v === 'E' || v === 'smile' ? Math.min(0.034, open * 0.32) : 0; return [(x) => t(x * 0.62) - 0.004, (x) => t(x * 0.62) - 0.004 - th * (1 - 0.3 * x * x), w * 0.62 / k * k]; });
}
function tongueShapes(w0, sh) {
  return VISEMES.map((v) => { const [t, b, w] = sh[v], open = t(0) - b(0), on = v === 'A' || v === 'O' || v === 'smile' || v === 'E' ? 1 : 0, cy = b(0) + open * 0.3, ry = open * 0.24 * on; return [(x) => cy + ry * Math.sqrt(Math.max(0, 1 - x * x)), (x) => cy - ry * 0.55 * Math.sqrt(Math.max(0, 1 - x * x)), w * 0.42]; });
}
function faceGen(THREE, s, L, ctx) {
  const n = ctx.det.face, FS = (a, b, c2, d2, e2, f2) => faceStrip(THREE, a, b, c2, d2, e2, f2, ctx.det.rows), hy = HEAD.y, F = (bone, g, col, at) => ctx.add({ g, m: new THREE.Matrix4().makeTranslation(0, hy, 0), bone, col, key: null, face: true, at });
  const mlift = L.beard === 'full' ? 0.11 : L.beard === 'short' ? 0.08 : 0.012;
  for (const e of [-1, 1]) {
    const S = e < 0 ? 'L' : 'R', cx = e * L.eyeX, cy = L.eyeY, E = L.eye;
    F('head', FS(n, E.rx + 0.022, cx, cy, 0.008, [ell(E.rx + 0.022, E.ry + 0.022)]), INK);
    F('head', FS(n, E.rx, cx, cy, 0.013, [ell(E.rx, E.ry)]), IVORY);
    F('eye' + S, FS(n, E.ir, cx, cy - 0.005, 0.019, [ell(E.ir, E.iry)]), E.iris);
    if (E.pupil) F('eye' + S, FS(n, E.pupil, cx, cy - 0.005, 0.024, [ell(E.pupil, E.pupil * 1.1)]), INK);
    F('eye' + S, FS(Math.max(5, n - 4), E.hl, cx + E.ir * 0.36, cy + E.iry * 0.36, 0.03, [ell(E.hl, E.hl)]), '#fffaf0');
    F('eye' + S, FS(5, E.hl * 0.5, cx - E.ir * 0.3, cy - E.iry * 0.4, 0.03, [ell(E.hl * 0.5, E.hl * 0.5)]), '#fffaf0');
    // lids: skin, anchored at the top (upper) and the bottom (lower) of the eye, scaled along the face by the bone (a crowd blinks by squashing the eye instead)
    const lw = E.rx + 0.034, lh = E.ry + 0.04;
    if (!ctx.crowdFace) {
    F('lidU' + S, FS(n, lw, cx, cy, 0.055, [[(x) => lh * Math.sqrt(Math.max(0, 1 - x * x)) * 0.35 + 0.012, (x) => -lh * Math.sqrt(Math.max(0, 1 - x * x)), lw]]), SK(0.97));
    F('lidU' + S, FS(n, lw * 0.98, cx, cy, 0.06, [[(x) => -lh * Math.sqrt(Math.max(0, 1 - x * x)) + 0.026, (x) => -lh * Math.sqrt(Math.max(0, 1 - x * x)), lw * 0.98]]), INK);
    F('lidL' + S, FS(n, lw, cx, cy, 0.052, [[(x) => lh * Math.sqrt(Math.max(0, 1 - x * x)), (x) => -lh * Math.sqrt(Math.max(0, 1 - x * x)) * 0.3 - 0.012, lw]]), SK(0.99));
    }
    // brow
    const bw = 0.12, bt = L.browThick, arch = L.browArch;
    F('brow' + S, FS(n, bw, cx, cy + E.ry + 0.1, 0.035, [[(x) => arch * (1 - x * x) + bt * 0.5 * (1 - 0.45 * x * x) + (e * x > 0 ? -0.008 : 0.006) * Math.abs(x), (x) => arch * (1 - x * x) - bt * 0.5 * (1 - 0.6 * x * x) + (e * x > 0 ? -0.008 : 0.006) * Math.abs(x), bw]]), L.browCol);
    // blush
    F('head', FS(Math.max(5, n - 4), 0.085, e * 0.55, -0.27, 0.006, [ell(0.085, 0.05)]), L.blush);
  }
  if (L.freckles) for (const [x, y] of [[-0.5, -0.17], [-0.42, -0.22], [0.42, -0.22], [0.5, -0.17]]) F('head', FS(5, 0.013, x, y, 0.009, [ell(0.013, 0.013)]), SK(0.8));
  // mouth: a dark shape, the top teeth and the tongue, all with the same 6 morph targets
  const w0 = 0.13, sh = mouthShapes(w0), my = -0.43;
  if (ctx.crowdFace) { const g = FS(n, w0, 0, my, mlift, VISEMES.map((v) => sh[v])), pa = g.getAttribute('position'), wt = ctx.crowdFace; g.userData.morph.forEach((arr, t) => { const k = wt[MORPHS[t]] || 0; if (k) for (let i = 0; i < arr.length; i++) pa.array[i] += (arr[i] - g.userData.base[i]) * k; }); delete g.userData.morph; F('mouth', g, MOUTH); return; }
  F('mouth', FS(n + 2, w0, 0, my, mlift, VISEMES.map((v) => sh[v])), MOUTH);
  F('mouth', FS(n, w0, 0, my, mlift + 0.006, teethShapes(w0, sh)), IVORY);
  F('mouth', FS(n, w0, 0, my, mlift + 0.008, tongueShapes(w0, sh)), TONGUE);
}
/** the face bones: at their feature, oriented with local z out of the face and local y up the face */
function faceBones(THREE, L) {
  const out = [], at = (name, ax, ay) => { const v = wrap(ax, ay, 0.03), n = new THREE.Vector3(...v.n), x = new THREE.Vector3(0, 1, 0).cross(n).normalize(), y = n.clone().cross(x).normalize(); const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n)); out.push({ name, pos: new THREE.Vector3(v.p[0], v.p[1] + (HEAD.y - NECK_Y), v.p[2]), q }); };
  const E = L.eye;
  for (const e of [-1, 1]) { const S = e < 0 ? 'L' : 'R', cx = e * L.eyeX; at('eye' + S, cx, L.eyeY); at('lidU' + S, cx, L.eyeY + E.ry + 0.04); at('lidL' + S, cx, L.eyeY - E.ry - 0.04); at('brow' + S, cx, L.eyeY + E.ry + 0.1); }
  at('mouth', 0, -0.43);
  return out;
}

// ------------------------------------------------------------------------------------------------ the skeleton
function skeletonDef(s, L, seatedUnused, crowd) {
  const sx = SHO_X[s.build] || 0.145;
  return [
    ['root', null, 0, 0, 0], ['hips', 'root', 0, HIP_Y, 0], ['spine', 'hips', 0, 0.09, 0], ['chest', 'spine', 0, 0.1, 0], ['head', 'chest', 0, NECK_Y - 0.46, 0],
    ['shoulderL', 'chest', -sx, SHO_Y - 0.46, 0], ['elbowL', 'shoulderL', 0, -UPPER, 0], ['handL', 'elbowL', 0, -FORE, 0],
    ['shoulderR', 'chest', sx, SHO_Y - 0.46, 0], ['elbowR', 'shoulderR', 0, -UPPER, 0], ['handR', 'elbowR', 0, -FORE, 0],
    ['thighL', 'hips', -LEG_X, 0, 0], ['kneeL', 'thighL', 0, -THIGH, 0], ['thighR', 'hips', LEG_X, 0, 0], ['kneeR', 'thighR', 0, -THIGH, 0],
    ['p_owl', 'chest', -sx - 0.005, 0.135, -0.01],
    ['p_hammer', 'handR', 0, -0.035, 0.0], ['p_torch', 'handR', 0, -0.035, 0.0], ['p_whammer', 'handR', 0, -0.035, 0.0], ['p_quill', 'handR', 0, -0.03, 0.02], ['p_coin', 'handR', 0, -0.04, 0.0], ['p_telescope', 'handR', 0, -0.035, 0.0],
    ['p_scroll', 'handL', 0, -0.035, 0.0], ['p_lantern', 'handL', 0, -0.03, 0.0], ['p_tablet', 'handL', 0, -0.05, 0.03], ['p_scales', 'handL', 0, -0.03, 0.0], ['p_beam', 'p_scales', 0, 0.14, 0], ['p_slate', 'handL', 0, -0.05, 0.03],
    ['p_scrollOpen', 'chest', 0, -0.02, 0.2], ['p_crate', 'chest', 0, -0.08, 0.2], ['p_anvil', 'root', sx + 0.02, 0, 0.3],
  ];
}
const PROPS = ['p_hammer', 'p_torch', 'p_whammer', 'p_quill', 'p_coin', 'p_telescope', 'p_scroll', 'p_lantern', 'p_tablet', 'p_scales', 'p_slate', 'p_scrollOpen', 'p_crate', 'p_anvil'];
const IDLE_PROP = { hammer: ['R', 'p_hammer'], torch: ['R', 'p_torch'], scroll: ['L', 'p_scroll'], key: ['L', 'p_lantern'] };
const PROP_HAND = { p_hammer: 'R', p_torch: 'R', p_whammer: 'R', p_quill: 'R', p_coin: 'R', p_telescope: 'R', p_scroll: 'L', p_lantern: 'L', p_tablet: 'L', p_scales: 'L', p_slate: 'L' };

const LOCAL = /^(shoulder|elbow|hand|thigh|knee|p_)/;
/** parts on arm / leg / prop bones are built in that bone's own space: move them to the bind pose (the skeleton's rest positions) */
function localize(THREE, parts, def, skip) {
  const world = {};
  for (const [name, parent, x, y, z] of def) world[name] = new THREE.Vector3(x, y, z).add(parent ? world[parent] : new THREE.Vector3());
  for (const p of parts) { if (!LOCAL.test(p.bone) || (skip && skip(p))) continue; const w = world[p.bone]; if (w) p.m = new THREE.Matrix4().makeTranslation(w.x, w.y, w.z).multiply(p.m || new THREE.Matrix4()); }
}

// ------------------------------------------------------------------------------------------------ merge parts into one skinned geometry (+ the outline index)
function merge(THREE, parts, boneIndex, colourOf, withTags) {
  let nv = 0; for (const p of parts) nv += p.g.getAttribute('position').count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), tag = withTags ? new Float32Array(nv * 4) : null;
  const idx = [], line = [], morphs = MORPHS.map(() => new Float32Array(nv * 3)), c = new THREE.Color();
  let o = 0, hasMorph = false;
  for (const p of parts) {
    const g = p.g; if (!g.index) { const n = g.getAttribute('position').count, a = []; for (let i = 0; i < n; i++) a.push(i); g.setIndex(a); }
    const base = p.m ? p.m : null;
    const P0 = g.getAttribute('position').array.slice();
    if (base) g.applyMatrix4(base);
    const pa = g.getAttribute('position'), na = g.getAttribute('normal'), n = pa.count, b = boneIndex(p.bone), cc = colourOf(p, c);
    for (let i = 0; i < n; i++) {
      const k = o + i;
      pos[k * 3] = pa.getX(i); pos[k * 3 + 1] = pa.getY(i); pos[k * 3 + 2] = pa.getZ(i);
      nor[k * 3] = na.getX(i); nor[k * 3 + 1] = na.getY(i); nor[k * 3 + 2] = na.getZ(i);
      col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2];
      si[k * 4] = b; sw[k * 4] = 1;
      if (tag) { tag[k * 4] = cc[3]; tag[k * 4 + 1] = cc[4]; tag[k * 4 + 2] = cc[5]; tag[k * 4 + 3] = p.face ? 1 : 0; }
    }
    if (g.userData.morph) { hasMorph = true; g.userData.morph.forEach((arr, t) => { for (let i = 0; i < n * 3; i++) morphs[t][o * 3 + i] = arr[i] - P0[i]; }); }
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) { idx.push(ix[i] + o); if (!p.face && !p.noInk) line.push(ix[i] + o); }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (tag) out.setAttribute('aTag', new THREE.BufferAttribute(tag, 4));
  out.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (hasMorph) { out.morphAttributes.position = morphs.map((a, i) => { const at = new THREE.BufferAttribute(a, 3); at.name = MORPHS[i]; return at; }); out.morphTargetsRelative = true; }
  const ol = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight'].concat(tag ? ['aTag'] : [])) ol.setAttribute(k, out.getAttribute(k));
  ol.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(line, 1) : new THREE.Uint16BufferAttribute(line, 1));
  out.userData.triangles = idx.length / 3; ol.userData.triangles = line.length / 3;
  return [out, ol];
}

// ------------------------------------------------------------------------------------------------ poses (procedural: a function of time -> bone targets)
const Z3 = () => [0, 0, 0];
const BODY = ['hips', 'spine', 'chest', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'thighL', 'kneeL', 'thighR', 'kneeR', 'p_owl', 'p_beam'];
function base(P) { for (const b of BODY) P[b] = Z3(); P.shoulderL = [0.04, 0, -0.13]; P.shoulderR = [0.04, 0, 0.13]; P.elbowL = [-0.16, 0, 0]; P.elbowR = [-0.16, 0, 0]; P.hipY = 0; P.hipX = 0; P.shrug = 0; return P; }
const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => u * u * (3 - 2 * u);
function legsWalk(P, ph, k) { P.thighL = [-0.5 * k * sin(ph), 0, 0]; P.thighR = [0.5 * k * sin(ph), 0, 0]; P.kneeL = [k * (0.1 + 0.75 * max(0, sin(ph + 2.2))), 0, 0]; P.kneeR = [k * (0.1 + 0.75 * max(0, sin(ph + 2.2 + Math.PI))), 0, 0]; P.hipY = 0.011 * k * (cos(2 * ph) * 0.5 + 0.5); P.hips[1] = 0.12 * k * sin(ph); P.chest[1] = -0.1 * k * sin(ph); }
const POSES = {
  idle: { loop: true, fn: (t, P) => { P.hips[2] = 0.028 * sin(t * 0.55); P.hipX = 0.008 * sin(t * 0.55); P.spine[2] = -0.02 * sin(t * 0.55); P.chest[0] = 0.015 * sin(t * 0.9); P.shoulderL[2] -= 0.03 * sin(t * 0.9); P.shoulderR[2] += 0.03 * sin(t * 0.9); }, wander: 1 },
  walk: { loop: true, fn: (t, P) => { const ph = t * 2 * Math.PI * 1.55; legsWalk(P, ph, 1); P.shoulderL = [0.42 * sin(ph), 0, -0.12]; P.shoulderR = [-0.42 * sin(ph), 0, 0.12]; P.elbowL = [-0.35 - 0.2 * max(0, -sin(ph)), 0, 0]; P.elbowR = [-0.35 - 0.2 * max(0, sin(ph)), 0, 0]; P.chest[0] = 0.05; }, seatedOk: false },
  wave: { loop: false, dur: 2.2, expr: 'happy', fn: (t, P) => { const k = ease(min(1, t * 3)) * (t > 1.9 ? max(0, 1 - (t - 1.9) * 3.3) : 1); P.shoulderR = [-0.25 * k, 0, 0.13 + 2.42 * k]; P.elbowR = [-0.2, 0, 0.3 + 0.38 * sin(t * 9) * k]; P.handR = [0, 0, 0.2 * sin(t * 9 + 0.6) * k]; P.head[2] = -0.1 * k; P.spine[2] = -0.04 * k; } },
  talk: { loop: true, fn: (t, P) => { P.shoulderR = [-0.5 + 0.16 * sin(t * 2.3), 0, 0.22 + 0.06 * sin(t * 1.1)]; P.elbowR = [-0.95 + 0.32 * sin(t * 3.1), 0, 0]; P.handR = [0.2 * sin(t * 3.1 + 1), 0.3, 0]; P.shoulderL = [-0.3 + 0.12 * sin(t * 1.7 + 1), 0, -0.2]; P.elbowL = [-0.75 + 0.25 * sin(t * 2.6), 0, 0]; P.handL = [0, -0.3, 0]; P.head[0] = 0.05 * sin(t * 4.2); P.head[1] = 0.06 * sin(t * 1.3); P.chest[1] = 0.05 * sin(t * 0.9); }, look: 1 },
  cheer: { loop: false, dur: 2.4, expr: 'happy', fn: (t, P) => { const k = ease(min(1, t * 4)) * (t > 2.1 ? max(0, 1 - (t - 2.1) * 3.3) : 1); P.shoulderL = [-0.1, 0, -0.13 - 2.5 * k - 0.15 * sin(t * 8) * k]; P.shoulderR = [-0.1, 0, 0.13 + 2.5 * k + 0.15 * sin(t * 8) * k]; P.elbowL = [-0.3 * k, 0, 0]; P.elbowR = [-0.3 * k, 0, 0]; P.hipY = 0.045 * abs(sin(t * 6)) * k; P.head[0] = -0.2 * k; P.kneeL[0] = P.kneeR[0] = 0.2 * abs(sin(t * 6)) * k; } },
  slump: { loop: true, expr: 'worried', fn: (t, P) => { P.chest[0] = 0.24; P.spine[0] = 0.1; P.head[0] = 0.42 + 0.02 * sin(t * 0.8); P.shoulderL = [0.18, 0, -0.07]; P.shoulderR = [0.18, 0, 0.07]; P.elbowL[0] = P.elbowR[0] = -0.05; P.hipY = -0.004; }, look: 0.3 },
  nod: { loop: false, dur: 1.6, fn: (t, P) => { P.head[0] = 0.3 * max(0, sin(t * 7.5)) * (1 - t / 1.6); } },
  shrug: { loop: false, dur: 1.9, expr: 'sheepish', fn: (t, P) => { const k = ease(min(1, t * 4)) * (t > 1.5 ? max(0, 1 - (t - 1.5) * 2.5) : 1); P.shoulderL = [-0.25 * k, 0, -0.13 - 0.5 * k]; P.shoulderR = [-0.25 * k, 0, 0.13 + 0.5 * k]; P.elbowL = [-1.2 * k, 0.6 * k, 0]; P.elbowR = [-1.2 * k, -0.6 * k, 0]; P.handL = [0, 0, -0.6 * k]; P.handR = [0, 0, 0.6 * k]; P.shrug = 0.022 * k; P.head[2] = 0.18 * k; P.head[1] = 0.1 * k; } },
  think: { loop: true, expr: 'thinking', fn: (t, P) => { P.shoulderR = [-1.05, 0, -0.42]; P.elbowR = [-2.15, 0, 0]; P.handR = [0.5, 0, 0]; P.shoulderL = [-0.3, 0, 0.32]; P.elbowL = [-1.45, 0, 0]; P.head[2] = 0.13; P.head[0] = -0.08 + 0.03 * sin(t * 0.7); P.hips[2] = 0.02; }, eyes: [0.5, 0.55], look: 0.4 },
  // ---- work poses
  hammer: { loop: true, work: true, props: { R: 'p_whammer', ground: 'p_anvil' }, expr: 'thinking', fn: (t, P) => { const u = (t % 1.0) / 1.0, up = u < 0.62 ? ease(u / 0.62) : u < 0.72 ? 1 - ease((u - 0.62) / 0.1) : 0; P.shoulderR = [-0.55 - 1.75 * up, 0, 0.05]; P.elbowR = [-0.35 - 0.5 * up, 0, 0]; P.handR = [0.9 - 0.9 * up, 0, 0]; P.chest[0] = 0.18 - 0.12 * up; P.spine[0] = 0.04; P.head[0] = 0.32; P.head[1] = 0.12; P.shoulderL = [-0.35, 0, -0.35]; P.elbowL = [-1.0, 0, 0]; P.hipY = -0.006 * (1 - up); }, look: 0.25, eyes: [0.2, -0.6] },
  write: { loop: true, work: true, props: { R: 'p_quill', L: 'p_tablet' }, expr: 'thinking', fn: (t, P) => { P.shoulderL = [-0.62, 0, 0.18]; P.elbowL = [-1.25, 0, 0]; P.handL = [-0.2, 0, -0.1]; P.shoulderR = [-0.48 + 0.03 * sin(t * 1.7), 0, -0.1]; P.elbowR = [-1.38, 0, 0]; P.handR = [0.25 + 0.12 * sin(t * 11), 0.18 * sin(t * 7), 0]; P.head[0] = 0.34; P.head[1] = -0.06; P.chest[0] = 0.06; }, look: 0.2, eyes: [-0.1, -0.7] },
  read: { loop: true, work: true, props: { chest: 'p_scrollOpen', L: false, R: false }, expr: 'neutral', fn: (t, P) => { P.shoulderL = [-0.78, 0, 0.12]; P.elbowL = [-0.72, 0, 0]; P.handL = [0, 0, -0.3]; P.shoulderR = [-0.78, 0, -0.12]; P.elbowR = [-0.72, 0, 0]; P.handR = [0, 0, 0.3]; P.head[0] = 0.26 + 0.05 * max(0, sin(t * 0.9)); P.chest[0] = 0.03; }, look: 0.2, eyes: (t) => [0.55 * sin(t * 1.4), -0.55] },
  weigh: { loop: true, work: true, props: { L: 'p_scales', R: 'p_coin' }, expr: 'thinking', fn: (t, P) => { P.shoulderL = [-1.05, 0, 0.0]; P.elbowL = [-0.75, 0, 0]; P.handL = [0.0, 0, 0]; P.p_beam = [0, 0, 0.22 * sin(t * 1.3)]; const dip = max(0, sin(t * 2.1)); P.shoulderR = [-0.75 - 0.15 * dip, 0, -0.18]; P.elbowR = [-1.05 + 0.2 * dip, 0, 0]; P.head[1] = -0.26; P.head[0] = -0.04; P.chest[1] = -0.08; }, look: 0.2, eyes: [-0.7, 0.2] },
  telescope: { loop: true, work: true, props: { R: 'p_telescope' }, expr: 'thinking', fn: (t, P) => { P.shoulderR = [-1.32, 0, -0.5]; P.elbowR = [-1.75, 0, 0]; P.handR = [0.6, 0, 0]; P.shoulderL = [-1.15, 0, 0.55]; P.elbowL = [-1.25, 0, 0]; P.head[0] = -0.18; P.head[1] = 0.12; P.chest[1] = 0.22 * sin(t * 0.35); P.chest[0] = -0.06; }, look: 0, eyes: [0.3, 0.4] },
  type: { loop: true, work: true, props: { L: 'p_slate', R: false }, expr: 'thinking', fn: (t, P) => { const tap = max(0, sin(t * 10)), tap2 = max(0, sin(t * 10 + 2)); P.shoulderL = [-0.55, 0, 0.15]; P.elbowL = [-1.2, 0, 0]; P.handL = [-0.25, 0, -0.1]; P.shoulderR = [-0.5, 0, -0.18]; P.elbowR = [-1.25 + 0.1 * tap - 0.06 * tap2, 0, 0]; P.handR = [0.35 * tap, 0, 0]; P.head[0] = 0.32; P.chest[0] = 0.05; }, look: 0.2, eyes: (t) => [0.25 * sin(t * 0.8), -0.75] },
  carry: { loop: true, work: true, props: { chest: 'p_crate', L: false, R: false }, expr: 'neutral', fn: (t, P) => { const ph = t * 2 * Math.PI * 1.3; legsWalk(P, ph, 0.75); P.shoulderL = [-0.95, 0, 0.22]; P.elbowL = [-0.55, 0, 0]; P.shoulderR = [-0.95, 0, -0.22]; P.elbowR = [-0.55, 0, 0]; P.handL = [0, 0, -0.4]; P.handR = [0, 0, 0.4]; P.chest[0] = -0.07; P.head[0] = -0.04; }, seatedOk: false },
};
// v3 pose names (people-rig.js plays them from the cast's clips); the v2 figure draws something close
POSES.run = { loop: true, fn: (t, P) => { POSES.walk.fn(t * 1.7, P); P.chest[0] = 0.14; }, seatedOk: false };
POSES.sit = { loop: true, fn: POSES.idle.fn, wander: 1 };
POSES.interact = { loop: false, dur: 1.3, fn: (t, P) => { const k = ease(min(1, t * 3)) * (t > 1.0 ? max(0, 1 - (t - 1.0) * 3.3) : 1); P.shoulderR = [-1.2 * k, 0, 0.15]; P.elbowR = [-0.3 * k, 0, 0]; P.chest[0] = 0.12 * k; } };
POSES.pickup = { loop: false, dur: 1.3, fn: (t, P) => { const k = sin(min(1, t / 1.3) * Math.PI); P.chest[0] = 0.5 * k; P.spine[0] = 0.3 * k; P.shoulderR = [-0.9 * k, 0, 0.13]; P.shoulderL = [-0.9 * k, 0, -0.13]; P.kneeL[0] = 0.6 * k; P.kneeR[0] = 0.6 * k; P.thighL[0] = -0.5 * k; P.thighR[0] = -0.5 * k; P.hipY = -0.05 * k; }, seatedOk: false };
POSES.jump = { loop: false, dur: 1.2, expr: 'happy', fn: (t, P) => { POSES.cheer.fn(t * 2, P); P.hipY = 0.09 * max(0, sin(min(1, t / 1.2) * Math.PI)); } };
POSES.surprised = { loop: false, dur: 0.9, expr: 'surprised', fn: (t, P) => { const k = sin(min(1, t / 0.9) * Math.PI); P.chest[0] = -0.12 * k; P.head[0] = -0.12 * k; P.shoulderL = [-0.3 * k, 0, -0.13 - 0.4 * k]; P.shoulderR = [-0.3 * k, 0, 0.13 + 0.4 * k]; } };
export const POSE_NAMES = Object.keys(POSES);
export const WORK_POSE_NAMES = POSE_NAMES.filter((n) => POSES[n].work);

const EXPR = C.EXPR_FACE, MOOD_EXPR = C.MOOD_EXPR, RESTING_MOUTH = C.RESTING_MOUTH;

// ------------------------------------------------------------------------------------------------ the hero figure
/** one v2 character (made in code): a SkinnedMesh with a face, its ink outline, and the animation state. opts: { lite, seated, scale, work (true: build the work props now; false: never; default: on the first work pose), material }.
 *  figure() below returns this as the instant placeholder (and the fallback when the v3 cast cannot load). */
export function figureV2(THREE, sp, opts) {
  const o = opts || {}, s = spec(sp), lite = !!o.lite, L = look(s), mats = materials(THREE);
  const det = lite ? DET.lite : DET.high;
  // bones
  const def = skeletonDef(s, L, !!o.seated, false), bones = [], byName = {};
  for (const [name, parent, x, y, z] of def) { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); (parent ? byName[parent] : null)?.add(b); byName[name] = b; bones.push(b); }
  const faceDef = faceBones(THREE, L);
  for (const f of faceDef) { const b = new THREE.Bone(); b.name = f.name; b.position.copy(f.pos); b.quaternion.copy(f.q); byName.head.add(b); byName[f.name] = b; bones.push(b); f.bone = b; }
  const index = {}; bones.forEach((b, i) => { index[b.name] = i; });
  // parts (the work props are built the first time a work pose plays, so a figure that never works carries none)
  const keys = new Set(L.keys), colours = { skin: new THREE.Color(s.skin), hair: new THREE.Color(s.hair), outfit: new THREE.Color(s.outfit), accent: new THREE.Color(s.accent) };
  const colourOf = (p, c) => { if (Array.isArray(p.col)) { c.copy(colours[p.col[0]]).multiplyScalar(p.col[1]); } else c.set(p.col); return [c.r, c.g, c.b]; };
  function build(work) {
    const parts = [], ctx = { det, want: (k) => !k || keys.has(k) || (k.startsWith('w:') && work), add: (p) => parts.push(p), work };
    gen(THREE, s, L, ctx); faceGen(THREE, s, L, ctx); localize(THREE, parts, def);
    for (const p of parts) if ((p.g.index ? p.g.index.count : p.g.getAttribute('position').count) < 100) p.noInk = true;      // tiny bits (pins, thumbs, coins) carry no ink line
    return merge(THREE, parts, (n) => (index[n] == null ? 0 : index[n]), colourOf, false);
  }
  let hasWork = o.work === true;
  const [geo, lineGeo] = build(hasWork);
  const root = new THREE.Group(); root.name = 'person';
  root.add(byName.root);
  const body = new THREE.SkinnedMesh(geo, o.material || mats.toon), line = new THREE.SkinnedMesh(lineGeo, mats.line);
  body.name = 'body'; line.name = 'ink';
  root.add(body, line);
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  body.bind(skel, body.matrixWorld); line.bind(skel, line.matrixWorld);
  const bs = new THREE.Sphere(new THREE.Vector3(0, 0.55, 0.05), 0.8); body.boundingSphere = bs; line.boundingSphere = bs.clone();
  const k = (o.scale || 1) * (s.height || 1);
  root.scale.setScalar(k);
  // the animation state
  const rest = {}; for (const b of bones) rest[b.name] = { p: b.position.clone(), q: b.quaternion.clone() };
  const faceAxes = {}; for (const f of faceDef) faceAxes[f.name] = { x: new THREE.Vector3(1, 0, 0).applyQuaternion(f.q), y: new THREE.Vector3(0, 1, 0).applyQuaternion(f.q) };
  const restMouth = RESTING_MOUTH[s.face && s.face.mouth] || {};
  const st = {
    name: 'idle', start: 0, loop: true, after: 'idle', speed: 1, t: 0, ticked: false, phase: ((s.seed >>> 0) % 628) / 100, seated: !!o.seated, talking: false,
    cur: {}, look: null, lookV: null, expr: MOOD_EXPR[s.mood] || 'neutral', exprK: 1, face: { browY: [0, 0], browR: [0, 0], lidU: [0.12, 0.12], lidL: [0, 0], eye: [0, 0], head: [0, 0] },
    mouth: MORPHS.map(() => 0), speech: null, blinkAt: 1.5 + ((s.seed >>> 3) % 300) / 100, blink: 0, props: {}, rng: C.rng((s.seed ^ 0x5bd1e995) >>> 0), syl: { t: 0, v: 'rest', k: 0 }, glance: [0, 0], glanceAt: 2,
  };
  for (const b of BODY) st.cur[b] = [0, 0, 0];
  st.cur.hipY = 0; st.cur.hipX = 0; st.cur.shrug = 0;
  for (const p of PROPS) st.props[p] = 0;
  const v3 = new THREE.Vector3(), eul = new THREE.Euler(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  function poseDef() { return POSES[st.name] || POSES.idle; }
  function targets(time) {
    const P = base({}), D = poseDef(); D.fn(time * st.speed, P, st);
    if (st.talking && (st.name === 'idle')) { POSES.talk.fn(time, P, st); }
    if (st.seated && D.seatedOk !== false) { P.thighL = [-1.5, 0, 0.06]; P.thighR = [-1.5, 0, -0.06]; P.kneeL = [1.42, 0, 0]; P.kneeR = [1.42, 0, 0]; P.hipY = 0; P.hips = [0, 0, 0]; P.hipX = 0; }
    return P;
  }
  function applyBones(P, ex) {
    const c = st.cur;
    for (const b of BODY) { const r = c[b], bn = byName[b]; if (!bn) continue; bn.rotation.set(r[0] + (ex && ex[b] ? ex[b][0] : 0), r[1] + (ex && ex[b] ? ex[b][1] : 0), r[2] + (ex && ex[b] ? ex[b][2] : 0)); }
    byName.hips.position.set(rest.hips.p.x + c.hipX, rest.hips.p.y + c.hipY, rest.hips.p.z);
    byName.shoulderL.position.y = rest.shoulderL.p.y + c.shrug; byName.shoulderR.position.y = rest.shoulderR.p.y + c.shrug;
  }
  function propsTarget() {
    const D = poseDef(), pr = D.props || {}, want = {};
    for (const p of PROPS) want[p] = 0;
    for (const side of ['R', 'L']) {
      const w = pr[side];
      if (w) want[w] = 1;
      else if (w !== false) { const ip = IDLE_PROP[s.accessory]; if (ip && ip[0] === side) want[ip[1]] = 1; }
    }
    if (pr.chest) want[pr.chest] = 1; if (pr.ground) want[pr.ground] = 1;
    return want;
  }
  function applyProps(a) { const w = propsTarget(); for (const p of PROPS) { st.props[p] += (w[p] - st.props[p]) * a; const v = st.props[p] < 0.02 ? 0 : st.props[p]; byName[p].scale.setScalar(Math.max(1e-4, v)); } }
  function faceTargets(time) {
    const D = poseDef(), name = D.expr && st.name !== 'idle' ? D.expr : st.expr, E = EXPR[name] || EXPR.neutral, k = st.exprK;
    const split = E.browSplit || 0;
    const F = { browY: [E.brow[0] * k + split * k, E.brow[0] * k - split * k], browR: [E.brow[1] * k, E.brow[1] * k], lidU: [E.lid[0] * k + 0.1 * (1 - k), E.lid[0] * k + 0.1 * (1 - k)], lidL: [E.lid[1] * k + L.lidBias * (1 - k * 0.5), E.lid[1] * k + L.lidBias * (1 - k * 0.5)], head: [E.head[0] * k, E.head[1] * k], mouth: {} };
    for (const m of MORPHS) F.mouth[m] = (E.mouth[m] || 0) * k + (restMouth[m] || 0) * (1 - k * (Object.keys(E.mouth).length ? 1 : 0));
    let ey = D.eyes ? (typeof D.eyes === 'function' ? D.eyes(time) : D.eyes) : null;
    if (st.lookV && (D.look == null || D.look > 0.1) && !ey) ey = st.lookV;
    F.eye = ey ? [ey[0], ey[1]] : [st.glance[0], st.glance[1]];
    return F;
  }
  function speechMouth(dt) {
    // external visemes win for 0.3 s after the last setMouth; otherwise talking makes its own syllables
    if (st.speech && st.t - st.speech.t < 0.3) { const out = {}; if (st.speech.v !== 'rest') out[st.speech.v] = st.speech.k; return { w: 1, m: out }; }
    if (!st.talking) return null;
    const sy = st.syl; sy.t -= dt;
    if (sy.t <= 0) { const r = st.rng(); sy.v = r < 0.3 ? 'A' : r < 0.5 ? 'E' : r < 0.66 ? 'O' : r < 0.8 ? 'MBP' : 'rest'; sy.k = 0.55 + st.rng() * 0.45; sy.t = 0.09 + st.rng() * 0.11; }
    const out = {}; if (sy.v !== 'rest') out[sy.v] = sy.k; return { w: 1, m: out };
  }
  function applyFace(F, a, dt) {
    const c = st.face, blend = (arr, tg) => { arr[0] += (tg[0] - arr[0]) * a; arr[1] += (tg[1] - arr[1]) * a; };
    blend(c.browY, F.browY); blend(c.browR, F.browR); blend(c.lidU, F.lidU); blend(c.lidL, F.lidL); blend(c.eye, F.eye); blend(c.head, F.head);
    const E = L.eye, bl = st.blink;
    ['L', 'R'].forEach((S, i) => {
      const e = S === 'L' ? -1 : 1;
      const b = byName['brow' + S], fa = faceAxes['brow' + S], r = rest['brow' + S];
      b.position.copy(r.p).addScaledVector(fa.y, c.browY[i] * R); b.quaternion.copy(r.q).multiply(qz.setFromAxisAngle(zAxis, -e * c.browR[i]));
      const u = byName['lidU' + S], lo = byName['lidL' + S];
      u.scale.set(1, Math.max(0.02, Math.min(1, c.lidU[i] + bl * (1 - c.lidU[i]))), 1); lo.scale.set(1, Math.max(0.02, Math.min(1, c.lidL[i] * (1 - bl))), 1);
      const ey = byName['eye' + S], ea = faceAxes['eye' + S], er = rest['eye' + S], mx = (E.rx - E.ir) * R * 0.9, myy = (E.ry - E.iry) * R * 0.9;
      ey.position.copy(er.p).addScaledVector(ea.x, clamp(c.eye[0], -1, 1) * mx).addScaledVector(ea.y, clamp(c.eye[1], -1, 1) * myy);
    });
    // mouth: expression base + speech on top
    const sp = speechMouth(dt), inf = body.morphTargetInfluences;
    if (inf) MORPHS.forEach((m, i) => { const base0 = F.mouth[m] || 0, tg = sp ? (sp.m[m] || 0) + base0 * 0.25 : base0; st.mouth[i] += (Math.min(1, tg) - st.mouth[i]) * Math.min(1, a * (sp ? 2.2 : 1)); inf[i] = st.mouth[i]; });
  }
  function lookAngles() {
    const D = poseDef(), w = D.look == null ? 1 : D.look; if (!st.look || w <= 0) return [0, 0, 0];
    root.updateWorldMatrix(true, false);
    const l = root.worldToLocal(v3.copy(st.look)), dy = l.y - HEAD.y, d = Math.hypot(l.x, l.z) || 1e-6;
    const yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(l.x, l.z))), pitch = Math.max(-0.45, Math.min(0.45, -Math.atan2(dy, d)));
    // the eyes lead: what the head does not turn, the eyes do
    st.lookV = [clamp(Math.atan2(l.x, l.z) * 1.6, -1, 1), clamp(Math.atan2(dy, d) * 1.6, -1, 1)];
    return [pitch * w, yaw * w, w];
  }
  function snap() { const D0 = poseDef(), P = targets(D0.loop === false ? (D0.dur || 1) * 0.5 : st.t - st.start); for (const b of BODY) st.cur[b] = P[b].slice(); st.cur.hipY = P.hipY; st.cur.hipX = P.hipX; st.cur.shrug = P.shrug; const la = lookAngles(); st.cur.head[0] += la[0]; st.cur.head[1] += la[1]; applyBones(P); applyProps(1); applyFace(faceTargets(0), 1, 0); root.updateMatrixWorld(true); skel.update(); }
  function play(name, po) {
    const p = po || {}, D = POSES[name] ? POSES[name] : POSES.idle, nm = POSES[name] ? name : 'idle';
    if (D.work) ensureWork();
    if (D.loop === false && st.name !== nm) st.after = POSES[st.name] && POSES[st.name].loop !== false ? st.name : st.after;
    st.name = nm; st.start = st.t; st.loop = p.loop != null ? !!p.loop : D.loop !== false; st.speed = p.speed || 1; if (p.then) st.after = POSES[p.then] ? p.then : 'idle';
    if (!st.ticked) snap();
    return D.dur || 0;
  }
  function pose(name, instant) { play(name, {}); if (instant !== false && !st.ticked) snap(); return root; }
  function lookAt(v) { if (!v) { st.look = null; st.lookV = null; } else { st.look = (st.look || new THREE.Vector3()).set(v.x, v.y, v.z); } if (!st.ticked) snap(); }
  function tick(dt, t) {
    dt = Math.min(0.1, Math.max(0, dt || 0)); st.ticked = true; st.t = t == null ? st.t + dt : t;
    const D = poseDef(); let pt = st.t - st.start;
    if (!st.loop && D.dur && pt > D.dur) { st.name = st.after || 'idle'; st.start = st.t; st.loop = true; pt = 0; }
    const T = pt + st.phase, P = targets(T), a = 1 - Math.exp(-dt * (D.work ? 16 : 11)), c = st.cur;
    const la = lookAngles(); P.head[0] += la[0]; P.head[1] += la[1];
    const F = faceTargets(T); P.head[0] += F.head[0]; P.head[2] += F.head[1];
    if (!st.look && poseDef().wander) { P.head[1] += 0.14 * sin(st.t * 0.43 + st.phase); P.head[0] += 0.04 * sin(st.t * 0.31 + st.phase * 2); }
    if (st.talking && st.name !== 'idle') { P.head[0] += 0.04 * sin(st.t * 4.4); P.head[1] += 0.04 * sin(st.t * 1.7); }
    for (const b of BODY) { const r = c[b], g = P[b]; r[0] += (g[0] - r[0]) * a; r[1] += (g[1] - r[1]) * a; r[2] += (g[2] - r[2]) * a; }
    c.hipY += (P.hipY - c.hipY) * a; c.hipX += (P.hipX - c.hipX) * a; c.shrug += (P.shrug - c.shrug) * a;
    applyBones(P);
    byName.chest.scale.set(1 + 0.008 * sin(st.t * 2.2 + st.phase), 1 + 0.014 * sin(st.t * 2.2 + st.phase), 1 + 0.01 * sin(st.t * 2.2 + st.phase));
    if (s.accessory === 'owl') byName.p_owl.rotation.y = 0.5 * Math.sign(sin(st.t * 0.37 + st.phase)) * Math.min(1, abs(sin(st.t * 0.37 + st.phase)) * 4);
    applyProps(1 - Math.exp(-dt * 12));
    // blinks and small glances
    st.blinkAt -= dt; if (st.blinkAt <= 0) { st.blink = 1; st.blinkAt = 2.2 + st.rng() * 3.2 + (st.rng() < 0.15 ? -2 : 0); } else st.blink = Math.max(0, st.blink - dt * 9);
    st.glanceAt -= dt; if (st.glanceAt <= 0) { st.glance = st.rng() < 0.45 ? [0, 0] : [(st.rng() - 0.5) * 1.2, (st.rng() - 0.5) * 0.6]; st.glanceAt = 0.8 + st.rng() * 2.4; }
    applyFace(F, 1 - Math.exp(-dt * 12), dt);
  }
  function setMouth(v, amount) { const n = VISEMES.indexOf(v) >= 0 ? v : 'rest'; st.speech = { v: n, k: amount == null ? 1 : clamp(+amount || 0, 0, 1), t: st.t }; if (!st.ticked) { const inf = body.morphTargetInfluences; MORPHS.forEach((m, i) => { inf[i] = m === n ? st.speech.k : 0; st.mouth[i] = inf[i]; }); } }
  function setExpression(name, amount) { st.expr = EXPR[name] ? name : 'neutral'; st.exprK = amount == null ? 1 : clamp(+amount || 0, 0, 1); if (!st.ticked) snap(); }
  function setTalking(on) { st.talking = !!on; if (!on) st.speech = null; }
  function ensureWork() {
    if (hasWork || o.work === false) return; hasWork = true;
    const [g, lg] = build(true); body.geometry.dispose(); line.geometry.dispose(); body.geometry = g; line.geometry = lg; body.updateMorphTargets();
    const inf = body.morphTargetInfluences; if (inf) MORPHS.forEach((m, i) => { inf[i] = st.mouth[i]; });
    root.userData.triangles = g.userData.triangles + lg.userData.triangles; root.userData.bodyTriangles = g.userData.triangles;
  }
  function dispose() { body.geometry.dispose(); line.geometry.dispose(); skel.dispose(); if (root.parent) root.parent.remove(root); }
  const parts0 = { torso: byName.chest, head: byName.head, armL: byName.shoulderL, armR: byName.shoulderR, eyes: byName.eyeR, mouth: byName.mouth, bones: byName };
  root.userData = {
    spec: s, look: L, pose, play, lookAt, tick, animate: (dt) => tick(dt), setMouth, setExpression, setTalking, dispose, parts: parts0, skeleton: skel, body, ink: line,
    meshes: 2, drawCalls: 2, triangles: geo.userData.triangles + lineGeo.userData.triangles, bodyTriangles: geo.userData.triangles, height: k * (HEAD.y + HEAD.ry * 1.15), headY: k * HEAD.y, lite, v: 2,
    state: () => ({ pose: st.name, expression: st.expr, talking: st.talking, mouth: st.mouth.slice(), lids: [[byName.lidUL.scale.y, byName.lidUR.scale.y], [byName.lidLL.scale.y, byName.lidLR.scale.y]], props: PROPS.filter((p) => st.props[p] > 0.5) }),
  };
  play(s.mood === 'sheepish' ? 'slump' : 'idle', {});
  snap();
  return root;
}

// ------------------------------------------------------------------------------------------------ figure v3: the rigged cast (people-rig.js + assets/people/cast.glb)
// figure() returns a real modelled, rigged, animated character (KayKit Adventurers 1.0, CC0, dressed as our people) when the cast is loaded; the first time,
// it returns the v2 figure as an instant placeholder and swaps the rigged one in when the cast arrives (the same object: scenes keep their reference, every
// call keeps working, the state carries over). No cast (node, ?rig=0, window.OLYMPUS_RIG = false, a failed load, opts.rig === false) = the v2 figure, as before.
const RIG = { p: null, mod: null, cast: null, err: null, deps: null };
const CAST_URL = (() => { try { return new URL('../assets/people/cast.glb?v=3', import.meta.url).href; } catch (_) { return '../assets/people/cast.glb?v=3'; } })();
function rigOff(o) {
  if (o && o.rig === false) return true;
  if (RIG.err) return true;
  try { if (typeof window !== 'undefined' && (window.OLYMPUS_RIG === false || /[?&]rig=0\b/.test(window.location.search))) return true; } catch (_) { /* no window */ }
  return false;
}
/** load the cast once (browser): resolves to true when the rigged people are ready, false when they cannot be (the v2 figures stay) */
export function loadRig() {
  if (RIG.cast) return Promise.resolve(true);
  if (RIG.err || typeof fetch !== 'function' || typeof window === 'undefined') return Promise.resolve(false);
  if (!RIG.p) {
    RIG.p = Promise.all([import('./people-rig.js'), import('../jarvis/three.module.min.js'), import('./three-addons/GLTFLoader.js'), import('./three-addons/meshopt_decoder.module.js')])
      .then(([R, T, G, M]) => { RIG.mod = R; RIG.deps = { THREE: T, GLTFLoader: G.GLTFLoader, MeshoptDecoder: M.MeshoptDecoder }; return R.loadCast(RIG.deps, CAST_URL, CAST_URL); })
      .then((c) => { RIG.cast = c; try { window.dispatchEvent(new CustomEvent('olympus:people:rig', { detail: { ok: true } })); } catch (_) { /* no window */ } return true; },
        (e) => { RIG.err = e || new Error('cast'); try { window.dispatchEvent(new CustomEvent('olympus:people:rig', { detail: { ok: false, reason: String(e && e.message || e) } })); } catch (_) { /* no window */ } return false; });
  }
  return RIG.p;
}
/** tests / tools: hand the module a rig module and a loaded cast (node has no fetch); rigInstall(null) goes back to v2 */
export function rigInstall(mod, cast, pending) { RIG.mod = mod || null; RIG.cast = cast || null; RIG.err = null; RIG.p = cast ? Promise.resolve(true) : pending ? Promise.resolve(pending).then((c) => { RIG.cast = c; return !!c; }) : null; }
/** 'v3' when the rigged cast is loaded, 'loading', 'v2' (no cast: the made-in-code figures) */
export function rigStatus() { return RIG.cast ? 'v3' : RIG.p && !RIG.err ? 'loading' : 'v2'; }
export function rigCast() { return RIG.cast; }

/** the v3 userData of a rigged character (the same calls as v2) */
function rigData(ch, s, o) {
  const sc = o.scale || 1, b = ch.bones;
  return {
    spec: s, look: ch.look, outfit: ch.outfit, character: ch, rig: 3, v: 2, lite: !!o.lite,
    pose: (n) => { ch.pose(n); return ch.object.parent || ch.object; }, play: (n, po) => ch.play(n, po), lookAt: (v) => ch.lookAt(v), tick: (dt) => ch.tick(dt), animate: (dt) => ch.tick(dt),
    setMouth: (v, a) => ch.setMouth(v, a), setExpression: (n, a) => ch.setExpression(n, a), setTalking: (on) => ch.setTalking(on), setSeated: (on) => ch.setSeated(on),
    parts: { head: ch.anchor, torso: b.chest, armL: b.upperarml, armR: b.upperarmr, eyes: ch.anchor, mouth: ch.anchor, bones: b },
    get skeleton() { return ch.skeleton(); }, get body() { return ch.bodyMesh(); }, get ink() { return null; }, get faceMesh() { return ch.face(); },
    meshes: 2, drawCalls: 2, get triangles() { return ch.info().tris; }, get bodyTriangles() { return ch.info().tris; }, height: ch.height() * sc, headY: ch.headY() * sc,
    state: () => ch.state(), info: () => ch.info(),
  };
}
function rigFigure(THREE, s, o) {
  const ch = RIG.mod.character(THREE, RIG.cast, s, { lite: !!o.lite, seated: !!o.seated, work: o.work, workPose: workPose(s), material: o.rigMaterial, pose: s.mood === 'sheepish' ? 'slump' : 'idle' });
  const root = new THREE.Group(); root.name = 'person'; root.add(ch.object); root.scale.setScalar(o.scale || 1);
  const u = rigData(ch, s, o); u.dispose = () => { ch.dispose(); if (root.parent) root.parent.remove(root); };
  root.userData = u;
  return root;
}
/** swap a v2 placeholder for the rigged character in place (same object, same userData object, the state carried over) */
function upgrade(THREE, root, s, o, W) {
  const u = root.userData; if (!u || u.rig || u.gone) return;
  let ch; try { ch = RIG.mod.character(THREE, RIG.cast, s, { lite: !!o.lite, seated: !!o.seated, work: o.work, workPose: workPose(s), material: o.rigMaterial, pose: W.pose || 'idle' }); } catch (e) { return; }
  const old = { body: u.body, ink: u.ink, skel: u.skeleton };
  for (const c of root.children.slice()) root.remove(c);
  try { old.body.geometry.dispose(); old.ink.geometry.dispose(); old.skel.dispose(); } catch (_) { /* gone */ }
  root.add(ch.object); root.scale.multiplyScalar(1 / (s.height || 1));      // v2 put the height in the root scale (and a scene may have scaled it since); v3 has it in the model
  const n = rigData(ch, s, o); for (const k of Object.keys(u)) if (!(k in n) && k !== 'dispose') delete u[k];
  for (const k of Object.keys(n)) { const d = Object.getOwnPropertyDescriptor(n, k); Object.defineProperty(u, k, { ...d, configurable: true, enumerable: true }); }
  u.dispose = () => { u.gone = true; ch.dispose(); if (root.parent) root.parent.remove(root); };
  if (W.expr) ch.setExpression(W.expr[0], W.expr[1]);
  if (W.pose && W.pose !== 'idle') ch.play(W.pose, W.poseOpts || {});
  if (W.look) ch.lookAt(W.look);
  if (W.talking) ch.setTalking(true);
  try { if (typeof root.dispatchEvent === 'function') root.dispatchEvent({ type: 'rig' }); } catch (_) { /* nothing */ }
}
/** one person (Figure API v2 calls; docs/PERSONA_API.md). The rigged v3 character when the cast is loaded, else the v2 figure (upgraded in place when the cast arrives). */
export function figure(THREE, sp, opts) {
  const o = opts || {}, s = spec(sp);
  if (!rigOff(o) && RIG.cast && RIG.mod) { try { return rigFigure(THREE, s, o); } catch (e) { /* fall back to v2 */ } }
  const f = figureV2(THREE, s, o);
  if (rigOff(o) || typeof window === 'undefined') return f;
  // remember what the scene asks for while the cast loads, then swap
  const u = f.userData, W = { pose: null, expr: null, look: null, talking: false }, wrap = (k, fn) => { const orig = u[k]; u[k] = (...a) => { if (!u.rig) fn(...a); return orig(...a); }; };
  wrap('play', (n, po) => { if (POSE_NAMES.includes(n)) { const one = POSES[n] && POSES[n].loop === false; if (!one) W.pose = n; W.poseOpts = po; } });
  wrap('pose', (n) => { W.pose = n; });
  wrap('setExpression', (n, a) => { W.expr = [n, a]; });
  wrap('lookAt', (v) => { W.look = v ? { x: v.x, y: v.y, z: v.z } : null; });
  wrap('setTalking', (on) => { W.talking = !!on; });
  const d0 = u.dispose; u.dispose = () => { u.gone = true; d0(); };
  loadRig().then((ok) => { if (ok && !u.gone) upgrade(THREE, f, s, o, W); });
  return f;
}
// ------------------------------------------------------------------------------------------------ the v2 API (works on a figure; safe to call with anything)
const ud = (f) => (f && f.userData && f.userData.v === 2 ? f.userData : null);
export function setMouth(fig, viseme, amount) { const u = ud(fig); if (u) u.setMouth(viseme, amount); return fig; }
export function setExpression(fig, name, amount) { const u = ud(fig); if (u) u.setExpression(name, amount); return fig; }
export function setTalking(fig, on) { const u = ud(fig); if (u) u.setTalking(on); else if (fig && fig.userData && fig.userData.setTalking) fig.userData.setTalking(on); return fig; }
export function animate(fig, dt) { const u = fig && fig.userData; if (u && u.v === 2) u.tick(dt); else if (u && typeof u.tick === 'function') u.tick(dt); return fig; }
export function play(fig, pose, opts) { const u = ud(fig); return u ? u.play(pose, opts) : 0; }
export function lookAt(fig, v) { const u = fig && fig.userData; if (u && typeof u.lookAt === 'function') u.lookAt(v); return fig; }

// ------------------------------------------------------------------------------------------------ crowds: everyone in 2 draw calls (body + face, and the ink outline)
// Each person's own parts (their real cut, garb, beard, glasses, accessory, eyes) are baked once into ONE merged mesh; every vertex knows its person and its bone.
// A small float texture holds per person: where they are, and the pose (head turn, arms, lean, bob, blink, mouth). The vertex shader poses everyone at once.
// Only the triangles people really have are drawn. Same toon + rim + ink as the hero; the face is simpler (no lids: a blink squashes the eyes; the mouth is set by the mood).
const CROWD_BONE = { root: 0, hips: 1, spine: 1, chest: 1, thighL: 0, kneeL: 0, thighR: 0, kneeR: 0, head: 2, browL: 2, browR: 2, shoulderL: 3, elbowL: 3, handL: 3, shoulderR: 4, elbowR: 4, handR: 4, p_owl: 1, p_hammer: 4, p_torch: 4, p_scroll: 3, p_lantern: 3, eyeL: 5, eyeR: 5, mouth: 6 };
const CROWD_MOUTH = { calm: {}, proud: { smile: 0.45 }, busy: { MBP: 0.4 }, worried: { frown: 0.75 }, sheepish: { smile: 0.22, MBP: 0.2 } };
const TX = 5;          // texels per person: 0 place (x, y, z, ry), 1 (scale, visible, shoulder x, -), 2 (head yaw, head pitch, arm L z, arm R z), 3 (lean, bob, blink, mouth), 4 (arm L x, arm R x, head roll, -)
const CROWD_GLSL = `
uniform highp sampler2D uPeople;
attribute vec4 aTag;
vec4 pD(int k) { return texelFetch(uPeople, ivec2(k, int(aTag.y + 0.5)), 0); }
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool crowdOn() { return pD(1).y > 0.5; }
void crowdPose(inout vec3 p, inout vec3 n) {
  int bone = int(aTag.x + 0.5); vec4 T = pD(0); vec4 U = pD(1); vec4 A = pD(2); vec4 B = pD(3); vec4 Q = pD(4);
  vec3 hip = vec3(0.0, ${HIP_Y.toFixed(3)}, 0.0);
  if (bone == 3 || bone == 4) { float sg = bone == 3 ? -1.0 : 1.0; vec3 sh = vec3(sg * U.z, ${SHO_Y.toFixed(3)}, 0.0); mat3 r = rZ(bone == 3 ? A.z : A.w) * rX(bone == 3 ? Q.x : Q.y); p = sh + r * (p - sh); n = r * n; }
  if (bone == 5) { float ey = ${(HEAD.y - 0.006).toFixed(3)}; p.y = ey + (p.y - ey) * max(0.08, 1.0 - B.z); }
  if (bone == 6) { float my = ${(HEAD.y - 0.085).toFixed(3)}; p.y = my + (p.y - my) * (1.0 + B.w * 2.2); }
  if (bone == 2 || bone == 5 || bone == 6) { vec3 nk = vec3(0.0, ${NECK_Y.toFixed(3)}, 0.0); mat3 r = rY(A.x) * rX(A.y) * rZ(Q.z); p = nk + r * (p - nk); n = r * n; }
  if (bone >= 1) { mat3 r = rX(B.x); p = hip + r * (p - hip); n = r * n; p.y += B.y; }
  mat3 ry = rY(T.w); p = T.xyz + ry * (p * U.x); n = ry * n;
}
`;
function crowdMaterials(THREE, uni) {
  const inject = (sh, outline) => {
    sh.uniforms.uPeople = uni;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CROWD_GLSL);
    if (outline) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 cP = position; vec3 cN = normal; crowdPose(cP, cN); transformed = crowdOn() ? cP + normalize(cN) * uOutline * pD(1).x : vec3(0.0);');
    else sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 cP = position; vec3 cN = normal; crowdPose(cP, cN); objectNormal = cN;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = crowdOn() ? cP : vec3(0.0);');
  };
  const mat = toonMaterial(THREE, (sh) => inject(sh, false)), line = outlineMaterial(THREE, 0.0082, (sh) => inject(sh, true));
  mat.customProgramCacheKey = () => 'olympus-crowd-v2'; line.customProgramCacheKey = () => 'olympus-crowd-ink-v2'; mat.name = 'olympus-crowd'; line.name = 'olympus-crowd-ink';
  return { mat, line };
}
/** many people in 2 draw calls. Same API as v1: place / setActive / tick(t) / pick / headWorld / dispose; plus lookAt(i, v3 | null), lookAll(v3 | null), setVisible(i, on), setTalking(i, on), setPose(i, name) */
export function figureInstanced(THREE, specs, opts) {
  const o = opts || {}, lite = !!o.lite, seated = !!o.seated, n = specs.length, det = lite ? DET.crowdLite : DET.crowd;
  const SP = specs.map((x) => spec(x)), parts = [], sxOf = [];
  SP.forEach((s, person) => {
    const L = C.drawLook(s), keys = new Set(L.keys), mine = [], def = skeletonDef(s, L, false, true);
    const ctx = { det, want: (k) => !k || keys.has(k), add: (p) => mine.push(p), work: false, crowdFace: CROWD_MOUTH[s.mood] || {} };
    gen(THREE, s, L, ctx); faceGen(THREE, s, L, ctx);
    if (seated) for (const p of mine) if (/^(thigh|knee)/.test(p.bone)) { const e = p.bone.endsWith('L') ? -1 : 1, mT = new THREE.Matrix4().makeTranslation(e * LEG_X, HIP_Y, 0).multiply(new THREE.Matrix4().makeRotationX(-1.5)); p.m = p.bone.startsWith('thigh') ? mT.multiply(p.m || new THREE.Matrix4()) : mT.multiply(new THREE.Matrix4().makeTranslation(0, -THIGH, 0)).multiply(new THREE.Matrix4().makeRotationX(1.42)).multiply(p.m || new THREE.Matrix4()); }
    localize(THREE, mine, def, (p) => seated && /^(thigh|knee)/.test(p.bone));
    const cs = { skin: new THREE.Color(s.skin), hair: new THREE.Color(s.hair), outfit: new THREE.Color(s.outfit), accent: new THREE.Color(s.accent) };
    for (const p of mine) { p.person = person; p.cs = cs; if ((p.g.index ? p.g.index.count : p.g.getAttribute('position').count) < 210) p.noInk = true; parts.push(p); }      // the ink line follows the big shapes only
    sxOf.push(SHO_X[s.build] || 0.145);
  });
  const colourOf = (p, c) => { if (Array.isArray(p.col)) c.copy(p.cs[p.col[0]]).multiplyScalar(p.col[1]); else c.set(p.col); return [c.r, c.g, c.b, CROWD_BONE[p.bone] ?? 1, p.person, 0]; };
  const group = new THREE.Group(); group.name = 'people';
  const data = new Float32Array(TX * 4 * Math.max(1, n)), tex = new THREE.DataTexture(data, TX, Math.max(1, n), THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const uni = { value: tex }, M2 = crowdMaterials(THREE, uni);
  let geo = null, lineGeo = null, bodyM = null, inkM = null;
  if (parts.length) {
    [geo, lineGeo] = merge(THREE, parts, () => 0, colourOf, true);
    for (const g of [geo, lineGeo]) { g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); }
    geo.morphAttributes = {};
    bodyM = new THREE.Mesh(geo, M2.mat); inkM = new THREE.Mesh(lineGeo, M2.line);
    bodyM.name = 'people-body'; inkM.name = 'people-ink'; bodyM.frustumCulled = inkM.frustumCulled = false;
    group.add(bodyM, inkM);
  }
  const slots = SP.map((s) => ({ x: 0, y: 0, z: 0, ry: 0, k: s.height || 1, active: false, talk: false, visible: true, look: null, pose: 'idle', phase: ((s.seed >>> 0) % 628) / 100, blinkAt: 1 + ((s.seed >>> 5) % 400) / 100, blink: 0, cur: [0, 0, -0.12, 0.12, 0, 0, 0, 0, 0] }));
  function writeSlot(i) { const sl = slots[i], o4 = i * TX * 4; data[o4] = sl.x; data[o4 + 1] = sl.y; data[o4 + 2] = sl.z; data[o4 + 3] = sl.ry; data[o4 + 4] = sl.k; data[o4 + 5] = sl.visible ? 1 : 0; data[o4 + 6] = sxOf[i]; tex.needsUpdate = true; }
  function place(i, x, y, z, ry, scale) { const sl = slots[i]; if (!sl) return; sl.x = x; sl.y = y; sl.z = z; sl.ry = ry || 0; sl.k = (scale || 1) * (SP[i].height || 1); writeSlot(i); }
  function setActive(i, on) { if (slots[i]) slots[i].active = !!on; }
  function setTalking(i, on) { if (slots[i]) slots[i].talk = !!on; }
  function setVisible(i, on) { if (!slots[i]) return; slots[i].visible = !!on; writeSlot(i); }
  function setPose(i, name) { if (slots[i]) slots[i].pose = name || 'idle'; }
  function lookAt(i, p) { const sl = slots[i]; if (sl) sl.look = p ? (sl.look || new THREE.Vector3()).set(p.x, p.y, p.z) : null; }
  function lookAll(p) { for (let i = 0; i < n; i++) lookAt(i, p); }
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lastT = null;
  function tick(t) {
    const dt = lastT == null ? 0.016 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t; const a = 1 - Math.exp(-dt * 8);
    for (let i = 0; i < n; i++) {
      const sl = slots[i], T = t + sl.phase, o4 = i * TX * 4, s = SP[i], pose = sl.active ? 'talk' : sl.pose;
      let yaw = 0.12 * sin(T * 0.4), pitch = 0.03 * sin(T * 0.3), aL = -0.12, aR = 0.12, xL = 0, xR = 0, lean = s.mood === 'sheepish' ? 0.1 : 0, bob = 0.004 * sin(T * 2), roll = 0.04 * sin(T * 0.27), mouth = 0;
      if (sl.look) { tmp.set(sl.look.x - sl.x, 0, sl.look.z - sl.z).applyAxisAngle(up, -sl.ry); const dy = sl.look.y - (sl.y + HEAD.y * sl.k); yaw = clamp(Math.atan2(tmp.x, tmp.z), -0.95, 0.95); pitch = clamp(-Math.atan2(dy, Math.hypot(tmp.x, tmp.z) || 1e-3), -0.35, 0.35); }
      if (pose === 'talk') { xR = -0.5 + 0.2 * sin(T * 2.3); aR = 0.25; xL = -0.3 + 0.12 * sin(T * 1.7); aL = -0.2; bob = abs(sin(T * 5)) * 0.008; pitch += 0.05 * sin(T * 4.2); }
      if (sl.talk || sl.active) mouth = abs(sin(T * 11)) * 0.6 * (0.5 + 0.5 * sin(T * 2.9));
      if (pose === 'cheer') { aL = -2.5; aR = 2.5; bob = abs(sin(T * 6)) * 0.04; pitch -= 0.2; }
      if (pose === 'wave') { aR = 2.4 + 0.3 * sin(T * 8); }
      if (pose === 'slump') { lean = 0.16; pitch += 0.35; }
      if (pose === 'nod') pitch += 0.25 * max(0, sin(T * 6));
      const cur = sl.cur, tg = [yaw, pitch, aL, aR, lean, xL, xR, roll, mouth];
      for (let k = 0; k < 9; k++) cur[k] += (tg[k] - cur[k]) * (k === 8 ? Math.min(1, a * 3) : a);
      sl.blinkAt -= dt; if (sl.blinkAt <= 0) { sl.blink = 1; sl.blinkAt = 2 + ((Math.imul(i + 1, 2654435761) >>> 0) % 300) / 100 + (t % 1.7); } else sl.blink = max(0, sl.blink - dt * 9);
      data[o4 + 8] = cur[0]; data[o4 + 9] = cur[1]; data[o4 + 10] = cur[2]; data[o4 + 11] = cur[3];
      data[o4 + 12] = cur[4]; data[o4 + 13] = bob; data[o4 + 14] = sl.blink; data[o4 + 15] = cur[8];
      data[o4 + 16] = cur[5]; data[o4 + 17] = cur[6]; data[o4 + 18] = cur[7];
    }
    tex.needsUpdate = true;
  }
  /** the person under a ray: each person is a soft capsule (no per-vertex test: the shader poses the mesh). any: also people hidden for a close-up figure */
  const inv = new THREE.Matrix4(), ro = new THREE.Vector3(), rd = new THREE.Vector3(), A0 = new THREE.Vector3(), A1 = new THREE.Vector3(), w0 = new THREE.Vector3(), u = new THREE.Vector3(), pr = new THREE.Vector3(), pc = new THREE.Vector3();
  function pick(raycaster, any) {
    group.updateWorldMatrix(true, false); inv.copy(group.matrixWorld).invert();
    ro.copy(raycaster.ray.origin).applyMatrix4(inv); rd.copy(raycaster.ray.direction).transformDirection(inv);
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const sl = slots[i]; if (!sl.visible && !any) continue;
      A0.set(sl.x, sl.y + 0.18 * sl.k, sl.z); A1.set(sl.x, sl.y + 0.92 * sl.k, sl.z); u.copy(A1).sub(A0); w0.copy(ro).sub(A0);
      const aa = rd.dot(rd), bb = rd.dot(u), cc2 = u.dot(u), dd = rd.dot(w0), ee = u.dot(w0), den = aa * cc2 - bb * bb;
      const tc = clamp(den > 1e-9 ? (aa * ee - bb * dd) / den : 0, 0, 1), sc = Math.max(0, (bb * tc - dd) / aa);
      pr.copy(ro).addScaledVector(rd, sc); pc.copy(A0).addScaledVector(u, tc);
      if (pr.distanceTo(pc) < 0.2 * sl.k && sc < bd) { bd = sc; best = i; }
    }
    return best;
  }
  function headWorld(i, out) { const sl = slots[i], o2 = out || new THREE.Vector3(); if (!sl) return o2.set(0, 0, 0); o2.set(sl.x, sl.y + (HEAD.y + 0.36) * sl.k, sl.z); return group.localToWorld(o2); }      // just above the hair: a label there leaves the face free
  function dispose() { if (geo) { geo.dispose(); lineGeo.dispose(); } tex.dispose(); M2.mat.dispose(); M2.line.dispose(); if (group.parent) group.parent.remove(group); }
  for (let i = 0; i < n; i++) writeSlot(i);
  tick(0);
  const tri = geo ? geo.userData.triangles + lineGeo.userData.triangles : 0;
  group.userData = { count: n, specs: SP, place, setActive, setTalking, setVisible, setPose, lookAt, lookAll, tick, pick, headWorld, dispose, drawCalls: geo ? 2 : 0, triangles: n ? Math.round(tri / n) : 0, totalTriangles: tri, slots, impostors: false };
  if (n && o.impostors !== false && !rigOff(o) && typeof document !== 'undefined') impostors(THREE, group, SP, o);
  return group;
}

// ------------------------------------------------------------------------------------------------ v3 crowd: impostors photographed from the rigged characters
// The crowd keeps its v2 data (places, picks, heads); when the cast and the studio (people-studio.js) are ready, every person is photographed (at rest and
// talking) into one atlas, and the crowd is drawn as camera-facing sprites of their real 3D selves: 1 draw call for everyone, 2 triangles a person.
const IMP_VS_HEAD = 'attribute vec2 aCell;\nuniform float uTime;\nuniform vec4 uGrid;\n';
function impostors(THREE, group, SP, o) {
  const u = group.userData, n = SP.length;
  import('./people-studio.js').then((ST) => ST.atlas(SP, { seated: !!o.seated, cell: o.lite ? [96, 120] : [128, 160] })).then((A) => {
    if (!A || u.gone) return;
    const tex = new THREE.CanvasTexture(A.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; tex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); for (let i = 0; i < n; i++) cell.setXY(i, i * A.frames, 0); geo.setAttribute('aCell', cell);
    const uni = { uTime: { value: 0 }, uGrid: { value: new THREE.Vector4(A.cols, A.rows, 0, 0) }, uTint: { value: new THREE.Color(o.impostorTint || '#ffffff') } };
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = IMP_VS_HEAD + sh.vertexShader
        .replace('#include <uv_vertex>', `#include <uv_vertex>
  float fr = aCell.y > 0.5 ? step(0.5, fract(uTime * 4.5 + aCell.x * 0.37)) : 0.0;
  float k = aCell.x + fr; float col = mod(k, uGrid.x), row = floor(k / uGrid.x);
  vMapUv = vec2((col + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);`)
        .replace('#include <project_vertex>', `vec3 inst = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); camR.y = 0.0; camR = normalize(camR + vec3(1e-5, 0.0, 0.0));
  float breathe = 1.0 + 0.012 * sin(uTime * 1.7 + aCell.x * 1.3) + (aCell.y > 0.5 ? 0.02 * abs(sin(uTime * 5.0 + aCell.x)) : 0.0);
  vec4 wpos = modelMatrix * vec4(inst, 1.0) + vec4(camR * position.x * sx + vec3(0.0, position.y * sy * breathe, 0.0), 0.0);
  vec4 mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uTint;');
    };
    mat.customProgramCacheKey = () => 'olympus-impostor-v3';
    const im = new THREE.InstancedMesh(geo, mat, n); im.name = 'people-impostors'; im.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const put = (i) => { const sl = u.slots[i]; if (!sl) return; const k = sl.k; pv.set(sl.x, sl.y + A.foot * k, sl.z); sv.set(sl.visible ? A.frame[0] * k : 0, sl.visible ? A.frame[1] * k : 0, 1); im.setMatrixAt(i, m4.compose(pv, q, sv)); im.instanceMatrix.needsUpdate = true; };
    const act = (i) => { const sl = u.slots[i]; if (!sl) return; cell.setY(i, sl.active || sl.talk || sl.pose === 'talk' ? 1 : 0); cell.needsUpdate = true; };
    for (let i = 0; i < n; i++) { put(i); act(i); }
    for (const c of group.children) c.visible = false;
    group.add(im);
    const wrap = (k, after) => { const f = u[k]; u[k] = (...a) => { const r = f(...a); after(...a); return r; }; };
    wrap('place', (i) => put(i)); wrap('setVisible', (i) => put(i)); wrap('setActive', (i) => act(i)); wrap('setTalking', (i) => act(i)); wrap('setPose', (i) => act(i));
    wrap('tick', (t) => { uni.uTime.value = t || 0; });
    wrap('dispose', () => { geo.dispose(); mat.dispose(); tex.dispose(); });
    u.drawCalls = 1; u.triangles = 2; u.totalTriangles = 2 * n; u.impostors = true; u.atlas = { w: A.canvas.width, h: A.canvas.height, cell: [A.cellW, A.cellH] };
    try { group.dispatchEvent({ type: 'impostors' }); } catch (_) { /* nothing */ }
  }).catch(() => { /* the v2 crowd stays */ });
  const d0 = u.dispose; u.dispose = (...a) => { u.gone = true; return d0(...a); };
}
