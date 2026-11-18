// PEOPLE OF OLYMPUS v3: the rigged character system (docs/PERSONA_API.md "Figure API v3"). Real modelled, rigged and animated bodies from the KayKit
// Adventurers 1.0 pack (CC0, Kay Lousberg; assets/people/cast.glb, built by tools/people_cast_build.mjs, docs/ASSETS_LICENSES.md), dressed as OUR people:
// every person picks a face, a hair cut, a body (armour, robe, tunic, apron), a cape or a hood from their own seed, wears their own colours (skin, hair,
// outfit, accent from people-core.js spec(); metal is bronze or gold, leather warm, linen ivory) and carries their own Greek accessory (laurel, crested
// helmet, hammer, scroll, coin pouch, lantern staff, owl on the shoulder, torch). Faces are ours too: a mouth with 6 visemes, blinking eyes with a
// highlight, brows that move, eyes that glance (13 morph targets on a small face mesh). The pack's 22 animations (idle, walk, run, cheer, sit, chop,
// interact...) play through an AnimationMixer with crossfades; the poses the pack does not have (wave, talk, nod, shrug, think, slump and the work
// loops write / read / weigh / telescope / type / carry) are layered on top of its clips by aiming the arm bones and turning the head and chest.
//
// Pure module: THREE and the loaders are passed in (people3d.js passes the site's three.js r160 and ./three-addons/), no DOM; it runs in node for the tests.
//   const cast = await loadCast({ THREE, GLTFLoader, MeshoptDecoder }, url | arrayBuffer);   // once per page (cached by URL)
//   const ch = character(THREE, cast, spec, { lite, seated, work, props });                   // ch.object: Object3D, feet at y = 0, faces +z, about 1 unit tall
//   ch.play('wave', { then: 'idle' }); ch.lookAt(v3); ch.setExpression('happy'); ch.setTalking(true); ch.setMouth('O', 0.8); ch.tick(dt); ch.dispose();
// One person = 2 draw calls (the body with its hair, clothes and props; the face with its morphs), one shared material for everybody.
import * as C from './people-core.js';

export const RIG_VERSION = 3;
export const SLOTS = ['fixed', 'skin', 'hair', 'eye', 'brow', 'outfit', 'outfit2', 'accent', 'leather', 'metal', 'boots', 'linen'];
const SL = Object.fromEntries(SLOTS.map((s, i) => [s, i]));
export const MORPHS = ['blink', 'wide', 'browUp', 'browSad', 'browAngry', 'eyeX', 'eyeY', 'A', 'E', 'O', 'MBP', 'smile', 'frown'];
const VIS = ['A', 'E', 'O', 'MBP', 'smile', 'frown'];
const MI = Object.fromEntries(MORPHS.map((m, i) => [m, i]));
/** figure units per pack unit: the pack's people are about 2.25 tall, ours about 1 */
export const UNIT = 0.44;
const SEAT_BUTT = 0.226;      // where the seat is, in figure units above the feet, for a seated person (the hall's couches; same as figure v2)

// ------------------------------------------------------------------------------------------------ colours
const INK = '#2a2019', IVORY = '#efe6d3', BRONZE = '#b5874a', GOLD = '#d4ad55', LEATHER = '#8a6440', SANDAL = '#7a5a3a', WOOD = '#8a5a32', IRON = '#4f4a44', LEAF = '#7f8a45', TERRA = '#b5563c', WAX = '#4a3a2a', FEATHER = '#f3ede0', FLAME = '#ffbf5a';
function lin(THREE, hex) { return new THREE.Color(hex); }      // THREE.Color.set converts sRGB hex to the renderer's linear working space
function shadeHex(hex, k) { const n = parseInt(String(hex).slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1); }
/** the per-person colour of each slot (linear THREE.Color), from the spec and look; metal bronze (gold for champions and the Mind) */
export function palette(THREE, s, L) {
  const kind = String(s.kind || ''), gold = s.accessory === 'laurel' || s.accessory === 'owl' || kind === 'champion';
  const dark = (h, k) => lin(THREE, shadeHex(h, k));
  // the clothes must read against the skin: an outfit too close to the skin tone swaps with the accent (or turns to linen)
  const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }, dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  let outHex = s.outfit, accHex = s.accent;
  if (dist(outHex, s.skin) < 0.2) { if (dist(accHex, s.skin) >= 0.2) { outHex = s.accent; accHex = s.outfit; } else outHex = IVORY; }
  s = { ...s, outfit: outHex, accent: accHex };
  return {
    skin: lin(THREE, s.skin), hair: lin(THREE, s.hair), brow: lin(THREE, L.browCol || shadeHex(s.hair, -0.3)), eye: lin(THREE, '#1e1712'),
    outfit: lin(THREE, s.outfit), outfit2: dark(s.outfit, -0.42), accent: lin(THREE, s.accent), leather: lin(THREE, LEATHER), metal: lin(THREE, gold ? GOLD : BRONZE),
    boots: lin(THREE, SANDAL), linen: lin(THREE, IVORY),
  };
}

// ------------------------------------------------------------------------------------------------ the cast (one per page)
const CASTS = new Map();
/** load and prepare the cast once (cached by url). src: a URL string, or an ArrayBuffer (node / tests). Resolves to the cast, rejects when it cannot load. */
export function loadCast(deps, src, key) {
  const k = key || (typeof src === 'string' ? src : 'buffer');
  if (CASTS.has(k)) return CASTS.get(k).p;
  const ent = { cast: null, p: null };
  ent.p = new Promise((ok, no) => {
    const { THREE, GLTFLoader, MeshoptDecoder } = deps, loader = new GLTFLoader();
    if (MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
    const done = (g) => { try { ent.cast = prepare(THREE, g); ok(ent.cast); } catch (e) { no(e); } };
    if (typeof src === 'string') loader.load(src, done, undefined, no); else loader.parse(src, '', done, no);
  });
  ent.p.catch(() => CASTS.delete(k));
  CASTS.set(k, ent);
  return ent.p;
}
/** the cast if it is already loaded (sync), else null */
export function castNow(key) { const e = CASTS.get(key); return e ? e.cast : null; }

function prepare(THREE, gltf) {
  const parts = {}, clips = {}, scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let rootBone = null, bindNames = null, ibm = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh || !/^P_/.test(o.name)) return;
    const name = o.name.slice(2), sk = o.skeleton, ri = sk.bones.findIndex((b) => b.name === 'root');
    if (!rootBone) { rootBone = sk.bones[ri]; bindNames = sk.bones.map((b) => b.name); }
    // the meshes are quantised: their skin's root inverse-bind matrix holds the dequantisation (the root's own is identity). Bring every part to model space.
    const D = sk.boneInverses[ri].clone(), Dinv = D.clone().invert();
    if (!ibm) ibm = sk.boneInverses.map((m) => m.clone().multiply(Dinv));
    const g = o.geometry, n = g.getAttribute('position').count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3), J = new Uint16Array(n * 4), W = new Float32Array(n * 4), S = new Uint8Array(n);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(D), map = sk.bones.map((b) => bindNames.indexOf(b.name));
    const pa = g.getAttribute('position'), na = g.getAttribute('normal'), ca = g.getAttribute('color'), ja = g.getAttribute('skinIndex'), wa = g.getAttribute('skinWeight'), sa = g.getAttribute('_slot');
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(D); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z;
      Cc[i * 3] = ca.getX(i); Cc[i * 3 + 1] = ca.getY(i); Cc[i * 3 + 2] = ca.getZ(i);
      let ws = 0; for (let k = 0; k < 4; k++) { J[i * 4 + k] = Math.max(0, map[ja.getComponent(i, k)]); W[i * 4 + k] = wa.getComponent(i, k); ws += W[i * 4 + k]; }
      if (ws > 0) for (let k = 0; k < 4; k++) W[i * 4 + k] /= ws;
      S[i] = sa ? sa.getX(i) : 0;
    }
    const I = Uint32Array.from(g.index.array);
    // per slot: the mean luminance of the pack's colour, so a new colour keeps the pack's own shading (its gradients)
    const lum = new Float32Array(SLOTS.length), cnt = new Float32Array(SLOTS.length);
    for (let i = 0; i < n; i++) { lum[S[i]] += 0.2126 * Cc[i * 3] + 0.7152 * Cc[i * 3 + 1] + 0.0722 * Cc[i * 3 + 2]; cnt[S[i]]++; }
    for (let s = 0; s < SLOTS.length; s++) lum[s] = cnt[s] ? lum[s] / cnt[s] : 1;
    parts[name] = { name, n, P, N, C: Cc, J, W, S, I, lum, tris: I.length / 3 };
  });
  if (!rootBone) throw new Error('cast: no parts');
  for (const a of gltf.animations || []) clips[a.name] = a;
  // the rest pose of every bone (model space) for the props and the seated offset
  const restWorld = {}; rootBone.updateWorldMatrix(true, true); rootBone.traverse((b) => { restWorld[b.name] = b.matrixWorld.clone(); });
  const faceInfo = {}; for (const f of ['face_a', 'face_b', 'face_c']) if (parts[f]) faceInfo[f] = analyseFace(parts[f], parts.beard);
  return { THREE, parts, clips, rootBone, bindNames, ibm, restWorld, faceInfo, v: RIG_VERSION, bytes: 0 };
}

// the face: where the eyes and brows are (for the blink and brow morphs) and the surface in front of the mouth
function analyseFace(part, beard) {
  const { P, S, n } = part, eyes = [[], []], brows = [[], []], cen = { eye: [[0, 0, 0, 0], [0, 0, 0, 0]], brow: [[0, 0, 0, 0], [0, 0, 0, 0]] };
  for (let i = 0; i < n; i++) {
    const s = S[i], side = P[i * 3] >= 0 ? 0 : 1;      // 0 = +x (the person's left), 1 = their right
    if (s === SL.eye) { eyes[side].push(i); const c = cen.eye[side]; c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; }
    if (s === SL.brow) { brows[side].push(i); const c = cen.brow[side]; c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; }
  }
  const avg = (c) => (c[3] ? [c[0] / c[3], c[1] / c[3], c[2] / c[3]] : [0, 0, 0]);
  const eyeC = cen.eye.map(avg), browC = cen.brow.map(avg);
  let eyeH = 0; for (const s of [0, 1]) for (const i of eyes[s]) eyeH = Math.max(eyeH, Math.abs(P[i * 3 + 1] - eyeC[s][1]));
  // the skin in front: z of the face at (x, y), from the nearest skin (and beard) vertices
  const pts = []; for (let i = 0; i < n; i++) if (S[i] === SL.skin && P[i * 3 + 2] > 0.2) pts.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  const bpts = []; if (beard) for (let i = 0; i < beard.n; i++) if (beard.P[i * 3 + 2] > 0.2) bpts.push([beard.P[i * 3], beard.P[i * 3 + 1], beard.P[i * 3 + 2]]);
  const zAt = (list) => (x, y) => { let best = [], k = 6; for (const p of list) { const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if (best.length < k) best.push([d, p[2]]); else if (d < best[k - 1][0]) best[k - 1] = [d, p[2]]; best.sort((a, b) => a[0] - b[0]); } let ws = 0, z = 0; for (const [d, pz] of best) { const w = 1 / (d + 1e-4); ws += w; z += w * pz; } return ws ? z / ws : 0.45; };
  return { eyes, brows, eyeC, browC, eyeH, zSkin: zAt(pts), zBeard: bpts.length ? zAt(bpts) : null };
}

// ------------------------------------------------------------------------------------------------ geometry accumulation
class Acc {
  constructor() { this.P = []; this.N = []; this.C = []; this.J = []; this.W = []; this.M = []; this.I = []; this.n = 0; this.tags = []; }
  /** a cast part with per-person colours. slotCol: slot -> THREE.Color (null = keep the pack's) */
  part(p, slotCol, opts) {
    const o = opts || {}, base = this.n, ov = o.slotMap || null;
    for (let i = 0; i < p.n; i++) {
      this.P.push(p.P[i * 3], p.P[i * 3 + 1], p.P[i * 3 + 2]); this.N.push(p.N[i * 3], p.N[i * 3 + 1], p.N[i * 3 + 2]);
      let s = p.S[i]; if (ov && ov[s] != null) s = ov[s];
      const col = slotCol[SLOTS[s]], r0 = p.C[i * 3], g0 = p.C[i * 3 + 1], b0 = p.C[i * 3 + 2];
      if (col && s !== SL.fixed) { const L0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0, k = Math.max(0.55, Math.min(1.4, L0 / (p.lum[p.S[i]] || 1))); this.C.push(col.r * k, col.g * k, col.b * k); }
      else this.C.push(r0, g0, b0);
      for (let k = 0; k < 4; k++) { this.J.push(p.J[i * 4 + k]); this.W.push(p.W[i * 4 + k]); }
      this.M.push(s === SL.metal ? 1 : s === SL.eye ? 0.5 : 0);
    }
    for (const ix of p.I) this.I.push(base + ix);
    this.tags.push([p.name, base, p.n]); this.n += p.n;
    return base;
  }
  /** a three.js geometry (in a bone's frame -> placed by the matrix m into model space), rigid on joint j */
  geo(THREE, g, m, col, j, metal, tag) {
    const gg = g.index ? g : g; const pa = gg.getAttribute('position'), na = gg.getAttribute('normal'), base = this.n, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); this.P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); this.N.push(v.x, v.y, v.z);
      this.C.push(col.r, col.g, col.b); this.J.push(j, 0, 0, 0); this.W.push(1, 0, 0, 0); this.M.push(metal || 0);
    }
    if (gg.index) for (const ix of gg.index.array) this.I.push(base + ix); else for (let i = 0; i < pa.count; i++) this.I.push(base + i);
    this.n += pa.count; if (tag) this.tags.push([tag, base, pa.count]);
    g.dispose();
    return base;
  }
  build(THREE, morphs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.J, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.W, 4));
    g.setAttribute('aMetal', new THREE.Float32BufferAttribute(this.M, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    if (morphs) { g.morphAttributes.position = morphs.map((arr, k) => { const a = new THREE.Float32BufferAttribute(arr, 3); a.name = MORPHS[k]; return a; }); g.morphTargetsRelative = true; }
    g.computeBoundingSphere(); g.boundingSphere.radius *= 1.7;
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ the shared materials (one per THREE and tier)
const MATS = new WeakMap();
const RIM = 'float rimD = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\noutgoingLight += uRim * smoothstep(0.55, 0.95, rimD) * (0.4 + 0.6 * diffuseColor.rgb);\n#include <opaque_fragment>';
/** the material every person shares: vertex colours, a soft cool-ivory rim (no orange cast), bronze that shines a little (aMetal). lite: Lambert. */
export function rigMaterial(THREE, lite) {
  let m = MATS.get(THREE); if (!m) { m = {}; MATS.set(THREE, m); }
  const k = lite ? 'lite' : 'high'; if (m[k]) return m[k];
  const rim = { value: new THREE.Color('#e9f0ff').multiplyScalar(lite ? 0.18 : 0.26) };
  const mat = lite ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  mat.name = 'olympus-person-v3' + (lite ? '-lite' : ''); mat.userData.rim = rim;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMetal;\nvarying float vMetal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nvarying float vMetal;');
    if (!lite) fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.36, step(0.75, vMetal)) - 0.25 * step(0.25, vMetal) * step(vMetal, 0.75);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = 0.62 * step(0.75, vMetal);');
    sh.fragmentShader = fs.replace('#include <opaque_fragment>', RIM);
  };
  mat.customProgramCacheKey = () => 'olympus-person-v3' + (lite ? '-lite' : '');
  m[k] = mat; return mat;
}

// ------------------------------------------------------------------------------------------------ what a person wears (deterministic from the seed)
const BODY_OF = { armour: 'armour', toga: 'robe', chiton: 'tunic', cloak: 'tunic', apron: 'apron' };
const HAIR_OF = { crop: 'hair_swept', sidepart: 'hair_swept', spiky: 'hair_swept', swept: 'hair_swept', quiff: 'hair_swept', curly: 'hair_bob', afro: 'hair_bob', bob: 'hair_bob', wavy: 'hair_long', long: 'hair_long', ponytail: 'hair_long', bun: 'hair_bob', topknot: 'hair_swept', bald: null, shaved: null, helmet: null };
/** the outfit of a spec: { face, hair, body, cape, hood, helmet, beard, earring, bun, topknot, accessory, metal } (plain data, deterministic) */
export function outfit(s, L) {
  const r = C.rng(((s.seed >>> 0) ^ 0x7f4a7c15) >>> 0), beard = L.beard === 'short' || L.beard === 'full';
  const cut = L.cut, hood = !beard && (L.garb === 'cloak' && s.accessory !== 'helmet' && r() < 0.34);
  const bald = cut === 'bald' || cut === 'shaved';
  const face = beard || (bald && !hood) ? 'face_c' : ['bob', 'long', 'ponytail', 'bun', 'wavy', 'curly'].includes(cut) ? (r() < 0.8 ? 'face_b' : 'face_a') : (r() < 0.75 ? 'face_a' : 'face_b');
  return {
    face, beard, hood, body: BODY_OF[L.garb] || 'tunic', cape: L.garb === 'cloak' || (L.garb === 'toga' && r() < 0.4) || (L.garb === 'armour' && r() < 0.5),
    hair: hood || cut === 'helmet' ? null : HAIR_OF[cut] === undefined ? 'hair_swept' : HAIR_OF[cut], helmet: s.accessory === 'helmet', earring: !hood && cut !== 'helmet' && r() < 0.22,
    bun: cut === 'bun', topknot: cut === 'topknot', moustache: L.beard === 'moustache', glasses: !!(s.face && s.face.glasses), accessory: s.accessory || 'none',
  };
}

// ------------------------------------------------------------------------------------------------ the props (our own, made in code). Each sits in a bone's frame:
// the hand slots carry things along +y (out of the fist, like the pack's own swords); 'root' props stand on the ground in front of the person.
export const PROP_BONE = { hammer: 'handslotr', torch: 'handslotr', whammer: 'handslotr', quill: 'handslotr', coin: 'handslotr', telescope: 'handslotr', cup: 'handslotr',
  scroll: 'handslotl', lantern: 'handslotl', tablet: 'handslotl', scales: 'handslotl', slate: 'handslotl', book: 'handslotl', shield: 'handslotl',
  scrollOpen: 'chest', crate: 'chest', owl: 'chest', laurel: 'head', helmet: 'head', bun: 'head', topknot: 'head', glasses: 'head', pouch: 'hips', key: 'hips', anvil: 'root' };
const IDLE_PROPS = { hammer: ['hammer'], torch: ['torch'], scroll: ['scroll'], key: ['lantern', 'key'], pouch: ['pouch'], owl: ['owl'], laurel: ['laurel'], helmet: ['helmet'] };
export const WORK_PROPS = { hammer: ['whammer', 'anvil'], write: ['quill', 'tablet'], read: ['scrollOpen'], weigh: ['scales', 'coin'], telescope: ['telescope'], type: ['slate'], carry: ['crate'] };

function propGeo(THREE, name, pal, s) {
  const out = [], M = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
  const add = (g, m, col, metal) => out.push([g, m, typeof col === 'string' ? lin(THREE, col) : col, metal || 0]);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 10), box = (x, y, z) => new THREE.BoxGeometry(x, y, z), sph = (r, w, h) => new THREE.SphereGeometry(r, w || 10, h || 8);
  switch (name) {
    case 'hammer': case 'whammer': { const k = name === 'whammer' ? 1.15 : 0.95; add(cyl(0.028 * k, 0.032 * k, 0.5 * k), M(0, 0.12 * k, 0), WOOD); add(box(0.11 * k, 0.12 * k, 0.24 * k), M(0, 0.39 * k, 0.03 * k), IRON, 1); add(cyl(0.036 * k, 0.036 * k, 0.04 * k, 8), M(0, -0.14 * k, 0), pal.metal, 1); break; }
    case 'torch': add(cyl(0.03, 0.026, 0.5), M(0, 0.15, 0), WOOD); add(cyl(0.05, 0.035, 0.08), M(0, 0.42, 0), pal.metal, 1); add(new THREE.ConeGeometry(0.07, 0.2, 8), M(0, 0.55, 0), FLAME); add(sph(0.055, 8, 6), M(0, 0.49, 0), '#ffd27a'); break;
    case 'quill': add(cyl(0.006, 0.01, 0.3, 5), M(0, 0.12, 0), '#d8cbb0'); add(sph(1, 8, 6), M(0, 0.22, 0.012, 0, 0, 0, 0.035, 0.13, 0.008), FEATHER); break;
    case 'coin': add(cyl(0.05, 0.05, 0.012, 14), M(0, 0.05, 0, Math.PI / 2, 0, 0), GOLD, 1); break;
    case 'telescope': add(cyl(0.045, 0.055, 0.42, 12), M(0, 0.16, 0), pal.metal, 1); add(cyl(0.06, 0.06, 0.05, 12), M(0, 0.36, 0), pal.metal, 1); add(cyl(0.05, 0.05, 0.06, 12), M(0, -0.04, 0), LEATHER); break;
    case 'cup': add(new THREE.LatheGeometry([[0.0, 0], [0.05, 0.0], [0.03, 0.03], [0.03, 0.06], [0.12, 0.1], [0.13, 0.13], [0.0, 0.13]].map((p) => new THREE.Vector2(p[0], p[1])), 14), M(0.0, 0.05, 0.1, -Math.PI / 2, 0, 0), TERRA); break;
    case 'scroll': add(cyl(0.05, 0.05, 0.3, 12), M(0, 0.1, 0), IVORY); for (const e of [-1, 1]) add(sph(0.04, 8, 6), M(0, 0.1 + e * 0.17, 0), WOOD); add(cyl(0.052, 0.052, 0.03, 12), M(0, 0.1, 0), pal.accent); break;
    case 'lantern': add(cyl(0.022, 0.022, 0.9, 6), M(0, 0.25, 0), WOOD); add(box(0.15, 0.18, 0.15), M(0, 0.78, 0), '#ffd27a'); for (const y of [0.68, 0.88]) add(box(0.19, 0.03, 0.19), M(0, y, 0), pal.metal, 1); add(new THREE.ConeGeometry(0.12, 0.1, 4), M(0, 0.94, 0, 0, Math.PI / 4, 0), pal.metal, 1); break;
    case 'tablet': add(box(0.3, 0.02, 0.22), M(0, 0.08, 0.05, 0, 0, Math.PI / 2), WOOD); add(box(0.26, 0.024, 0.18), M(0, 0.08, 0.052, 0, 0, Math.PI / 2), WAX); break;
    case 'slate': add(box(0.34, 0.025, 0.26), M(0, 0.1, 0.04, 0, 0, Math.PI / 2), '#3d3a36'); add(box(0.36, 0.02, 0.28), M(-0.004, 0.1, 0.04, 0, 0, Math.PI / 2), WOOD); break;
    case 'scales': {
      add(cyl(0.016, 0.016, 0.32, 6), M(0, 0.18, 0), pal.metal, 1); add(cyl(0.012, 0.012, 0.5, 6), M(0, 0.34, 0, 0, 0, Math.PI / 2), pal.metal, 1);
      for (const e of [-1, 1]) { add(cyl(0.004, 0.004, 0.16, 4), M(e * 0.24, 0.26, 0), INK); add(cyl(0.09, 0.05, 0.03, 12), M(e * 0.24, 0.17, 0), pal.metal, 1); }
      add(cyl(0.035, 0.035, 0.02, 10), M(-0.24, 0.195, 0), GOLD, 1); break;
    }
    case 'book': case 'scrollOpen': {      // an open scroll held in front of the chest, two rolls and the sheet between them
      const z = 0.38, y = -0.02; add(box(0.46, 0.3, 0.012), M(0, y, z, -0.5, 0, 0), IVORY); for (const e of [-1, 1]) add(cyl(0.035, 0.035, 0.34, 10), M(e * 0.24, y, z, -0.5, 0, 0), IVORY);
      for (const e of [-1, 1]) for (const f of [-1, 1]) add(sph(0.03, 6, 5), M(e * 0.24, y + f * 0.17 * Math.cos(0.5), z - f * 0.17 * Math.sin(0.5) * -1, 0, 0, 0), WOOD);
      for (let i = 0; i < 4; i++) add(box(0.3 - (i % 2) * 0.08, 0.012, 0.004), M(-0.02, y + 0.08 - i * 0.05, z + 0.012, -0.5, 0, 0), '#8a7a62'); break;
    }
    case 'crate': add(box(0.52, 0.36, 0.38), M(0, -0.12, 0.42), WOOD); for (const x of [-0.2, 0.2]) add(box(0.06, 0.38, 0.4), M(x, -0.12, 0.42), '#6b4a2a'); add(sph(0.07, 8, 6), M(0.08, 0.08, 0.42), lin(THREE, '#9c3b2f')); add(sph(0.06, 8, 6), M(-0.06, 0.07, 0.38), lin(THREE, '#c8a24a')); break;
    case 'anvil': add(box(0.36, 0.1, 0.2), M(0, 0.5, 0.7), IRON, 1); add(new THREE.ConeGeometry(0.1, 0.18, 4), M(0.24, 0.5, 0.7, 0, Math.PI / 4, -Math.PI / 2, 1, 1, 0.6), IRON, 1); add(box(0.14, 0.3, 0.14), M(0, 0.3, 0.7), IRON, 1); add(cyl(0.2, 0.24, 0.16, 10), M(0, 0.08, 0.7), WOOD); break;
    case 'owl': {      // on the left shoulder (the person's +x), facing forward
      const x = 0.52, y = 0.3, z = -0.06, br = lin(THREE, '#8a6a48'), cream = lin(THREE, '#e9dcc0');
      add(sph(0.12, 12, 10), M(x, y, z, 0, 0, 0, 1, 1.15, 0.95), br); add(sph(0.075, 10, 8), M(x, y + 0.02, z + 0.06, 0, 0, 0, 1, 1.2, 0.7), cream);
      add(sph(0.1, 12, 10), M(x, y + 0.17, z + 0.01), br);
      for (const e of [-1, 1]) { add(sph(0.038, 10, 8), M(x + e * 0.042, y + 0.18, z + 0.085, 0, 0, 0, 1, 1, 0.5), GOLD); add(sph(0.018, 8, 6), M(x + e * 0.042, y + 0.18, z + 0.103), INK); add(new THREE.ConeGeometry(0.025, 0.06, 4), M(x + e * 0.06, y + 0.27, z, 0, 0, -e * 0.3), br); add(sph(0.06, 8, 6), M(x + e * 0.1, y - 0.01, z - 0.01, 0, 0, e * 0.2, 0.45, 1.1, 0.9), lin(THREE, '#6f5238')); }
      add(new THREE.ConeGeometry(0.018, 0.04, 4), M(x, y + 0.15, z + 0.1, Math.PI / 2 + 0.3, 0, 0), lin(THREE, '#d9a441')); break;
    }
    case 'laurel': {      // a wreath of leaves around the head, above the brows
      const N = 22, y = 0.6, rx = 0.47, rz = 0.49;
      for (let i = 0; i < N; i++) {
        const a = -Math.PI * 0.86 + (i / (N - 1)) * Math.PI * 1.72, side = Math.sign(a) || 1, x = Math.sin(a) * rx, z = Math.cos(a) * rz - 0.02;
        add(sph(1, 7, 5), new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.06 * Math.cos(a) * 0.3 + (i % 2 ? 0.035 : -0.01), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, a, side * (i % 2 ? 0.9 : -0.5))), new THREE.Vector3(0.075, 0.03, 0.034)), i % 3 === 0 ? lin(THREE, GOLD) : lin(THREE, LEAF), i % 3 === 0 ? 1 : 0);
      }
      add(new THREE.TorusGeometry(1, 0.03, 4, 28, Math.PI * 1.72), M(0, y, -0.02, Math.PI / 2, 0, Math.PI / 2 + Math.PI * 0.14, rx, rz, 1), lin(THREE, '#6b7038'));
      break;
    }
    case 'bun': add(sph(0.16, 12, 10), M(0, 0.86, -0.32), pal.hair); add(new THREE.TorusGeometry(0.11, 0.02, 5, 14), M(0, 0.82, -0.27, -1.0, 0, 0), pal.accent); break;
    case 'topknot': add(sph(0.12, 12, 10), M(0, 1.02, -0.05, 0, 0, 0, 0.9, 1.2, 0.9), pal.hair); add(cyl(0.07, 0.08, 0.05, 10), M(0, 0.92, -0.04), GOLD, 1); break;
    case 'glasses': for (const e of [-1, 1]) add(new THREE.TorusGeometry(0.082, 0.0065, 5, 20), M(e * 0.205, 0.37, 0.465, 0, e * 0.14, 0), lin(THREE, '#3a2a1c'), 0.3); add(cyl(0.005, 0.005, 0.07, 4), M(0, 0.385, 0.5, 0, 0, Math.PI / 2), lin(THREE, '#3a2a1c')); break;
    case 'pouch': add(sph(0.11, 10, 8), M(-0.3, 0.17, 0.2, 0, 0, 0, 0.9, 1.0, 0.8), LEATHER); add(cyl(0.05, 0.07, 0.05, 8), M(-0.3, 0.27, 0.2), lin(THREE, '#5f4026')); add(cyl(0.035, 0.035, 0.01, 10), M(-0.3, 0.31, 0.21, 0.4, 0, 0), GOLD, 1); add(cyl(0.035, 0.035, 0.01, 10), M(-0.27, 0.32, 0.2, 0.1, 0, 0.3), GOLD, 1); break;
    case 'key': add(new THREE.TorusGeometry(0.035, 0.01, 5, 12), M(0.28, 0.13, 0.22), GOLD, 1); add(cyl(0.01, 0.01, 0.12, 5), M(0.28, 0.05, 0.22), GOLD, 1); add(box(0.03, 0.02, 0.01), M(0.295, 0.0, 0.22), GOLD, 1); break;
    default: break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the face add-ons: our mouth (6 visemes), the eye highlights
function mouthShape(name) {      // [top(x), bottom(x), half width] in pack units around the mouth centre, x in [-1, 1]
  const q = (x) => x * x, r = (x, p) => Math.pow(Math.max(0, 1 - q(x)), p);
  switch (name) {
    case 'A': return [(x) => 0.01 + 0.008 * q(x), (x) => 0.004 * q(x) - 0.062 * r(x, 0.7), 0.046];
    case 'E': return [(x) => 0.008 + 0.012 * q(x), (x) => 0.012 * q(x) - 0.032 * r(x, 0.8), 0.066];
    case 'O': return [(x) => 0.026 * r(x, 0.5), (x) => -0.038 * r(x, 0.5), 0.03];
    case 'MBP': return [(x) => 0.0025, (x) => -0.0025, 0.05];
    case 'smile': return [(x) => 0.032 * q(x) + 0.002, (x) => 0.032 * q(x) - 0.04 * r(x, 0.9), 0.072];
    case 'frown': return [(x) => -0.022 * q(x) + 0.004, (x) => -0.022 * q(x) - 0.0045, 0.052];
    default: return [(x) => 0.013 * q(x) + 0.0035, (x) => 0.013 * q(x) - 0.005, 0.052];
  }
}
function buildFace(THREE, cast, ot, pal, faceAcc, headJ, extraHL) {
  const fp = cast.parts[ot.face], F = cast.faceInfo[ot.face], base = faceAcc.part(fp, { skin: pal.skin, eye: pal.eye, brow: pal.brow });
  const my = 1.355 + (ot.beard ? 0.0 : 0), nx = 11, ny = 3, zOf = (x, y) => Math.max(F.zSkin(x, y), F.zBeard && ot.beard ? F.zBeard(x, y) : -1) + 0.008;
  // the mouth strip: nx columns x ny rows, the rest shape, then one morph per viseme
  const shapeVerts = (sh) => { const v = []; for (let i = 0; i < nx; i++) { const x = -Math.cos((Math.PI * i) / (nx - 1)); const t = sh[0](x), b = sh[1](x); for (let r = 0; r < ny; r++) { const yy = my + t + (b - t) * (r / (ny - 1)), xx = x * sh[2]; v.push(xx, yy, zOf(xx, yy)); } } return v; };
  const rest = shapeVerts(mouthShape('rest')), mBase = faceAcc.n, mcol = lin(THREE, '#2b120e');
  for (let i = 0; i < rest.length; i += 3) { faceAcc.P.push(rest[i], rest[i + 1], rest[i + 2]); faceAcc.N.push(0, 0, 1); faceAcc.C.push(mcol.r, mcol.g, mcol.b); faceAcc.J.push(headJ, 0, 0, 0); faceAcc.W.push(1, 0, 0, 0); faceAcc.M.push(0); }
  for (let i = 0; i < nx - 1; i++) for (let r = 0; r < ny - 1; r++) { const a = mBase + i * ny + r, b = a + 1, c = a + ny, d = c + 1; faceAcc.I.push(a, b, c, b, d, c); }
  faceAcc.n += rest.length / 3;
  // eye highlights: a small ivory dot up and out on each eye
  const hl = [];
  for (const s of [0, 1]) {
    const c = F.eyeC[s], g = new THREE.CircleGeometry(0.019, 10), x = c[0] + (s === 0 ? 0.022 : -0.022) * (extraHL ? 1 : 1), y = c[1] + 0.028, z = F.zSkin(c[0], c[1]) + 0.032;
    const cnt = g.getAttribute('position').count; hl.push([faceAcc.geo(THREE, g, new THREE.Matrix4().makeTranslation(x, y, z), lin(THREE, '#fbf7ee'), headJ, 0), cnt]);
  }
  // the morphs (relative): dense arrays over the face mesh, filled at build()
  return { base, mBase, mN: rest.length / 3, rest, shapeVerts, hl, F, my };
}
function faceMorphs(faceAcc, fi) {
  const n = faceAcc.n, M = MORPHS.map(() => new Float32Array(n * 3)), P = faceAcc.P, F = fi.F;
  const set = (m, i, dx, dy, dz) => { const a = M[MI[m]]; a[i * 3] += dx; a[i * 3 + 1] += dy; a[i * 3 + 2] += dz || 0; };
  for (const s of [0, 1]) {
    const c = F.eyeC[s];
    for (const i0 of F.eyes[s]) { const i = fi.base + i0, dy = P[i * 3 + 1] - c[1]; set('blink', i, 0, -dy * 0.92 - 0.004, -0.01); set('wide', i, (P[i * 3] - c[0]) * 0.18, dy * 0.3, 0); set('eyeX', i, 0.022, 0, 0); set('eyeY', i, 0, 0.016, 0); }
    for (const i of fi.hl[s] ? range(fi.hl[s][0], fi.hl[s][1]) : []) { const dy = P[i * 3 + 1] - c[1]; set('blink', i, 0, -dy * 0.95, -0.03); set('eyeX', i, 0.022, 0, 0); set('eyeY', i, 0, 0.016, 0); set('wide', i, 0, 0.006, 0); }
    const bc = F.browC[s];
    for (const i0 of F.brows[s]) {
      const i = fi.base + i0, inner = 1 - Math.min(1, Math.abs(P[i * 3]) / Math.max(0.01, Math.abs(bc[0]) * 1.6)), dxIn = P[i * 3] - bc[0];
      set('browUp', i, 0, 0.04, 0.004); set('browSad', i, 0, 0.045 * inner - 0.012 * (1 - inner), 0); set('browAngry', i, 0, -0.04 * inner + 0.012 * (1 - inner), 0.006 * inner);
      set('blink', i, 0, -0.01, 0); set('wide', i, dxIn * 0.02, 0.02, 0);
    }
  }
  const rest = fi.rest;
  for (const v of VIS) { const sh = fi.shapeVerts(mouthShape(v)); for (let k = 0; k < fi.mN; k++) { const i = fi.mBase + k; set(v, i, sh[k * 3] - rest[k * 3], sh[k * 3 + 1] - rest[k * 3 + 1], sh[k * 3 + 2] - rest[k * 3 + 2]); } }
  return M;
}
function range(a, n) { const r = []; for (let i = 0; i < n; i++) r.push(a + i); return r; }

// ------------------------------------------------------------------------------------------------ poses: clips + layers
// base: a clip name, or 'idle' / 'walk' (the person's own variant; seated: sitting). over: a layer (below). dur: one-shot length (s) or the clip's.
export const POSES3 = {
  idle: { base: 'idle', loop: true },
  walk: { base: 'walk', loop: true, stand: true },
  run: { base: 'Running_A', loop: true, stand: true },
  wave: { base: 'idle', dur: 2.2, over: 'wave', expr: 'happy' },
  talk: { base: 'idle', loop: true, over: 'talk' },
  cheer: { base: 'Cheer', expr: 'happy', seatedOver: 'cheerSeated', dur: 2.4 },
  slump: { base: 'idle', loop: true, over: 'slump', expr: 'worried', look: 0.3 },
  nod: { base: 'idle', dur: 1.6, over: 'nod' },
  shrug: { base: 'idle', dur: 1.9, over: 'shrug', expr: 'sheepish' },
  think: { base: 'idle', loop: true, over: 'think', expr: 'thinking', eyes: [0.6, 0.8], look: 0.4 },
  sit: { base: 'Sit_Chair_Idle', loop: true, sit: true },
  interact: { base: 'Interact', dur: 1.3 },
  pickup: { base: 'PickUp', dur: 1.3, stand: true },
  jump: { base: 'Jump_Full_Short', dur: 1.2, expr: 'happy', stand: true },
  surprised: { base: 'Hit_A', dur: 0.9, expr: 'surprised' },
  hammer: { base: '1H_Melee_Attack_Chop', loop: true, work: true, expr: 'thinking', stand: true, speed: 0.85, look: 0 },
  write: { base: 'idle', loop: true, work: true, over: 'write', expr: 'thinking', look: 0.2 },
  read: { base: 'idle', loop: true, work: true, over: 'read', expr: 'neutral', look: 0.2, eyes: [0, -0.6] },
  weigh: { base: 'idle', loop: true, work: true, over: 'weigh', expr: 'thinking', look: 0.2 },
  telescope: { base: 'idle', loop: true, work: true, over: 'telescope', expr: 'thinking', look: 0, eyes: [0.3, 0.4] },
  type: { base: 'idle', loop: true, work: true, over: 'type', expr: 'thinking', look: 0.2 },
  carry: { base: 'walk', loop: true, work: true, over: 'carry', stand: true },
};
export const POSE3_NAMES = Object.keys(POSES3);
const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min, abs = Math.abs, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => u * u * (3 - 2 * u);
// a layer: (t, O, k) with O.arm(side 'l'|'r', upper dir, fore dir) in the person's own space (+z forward, +y up, +x their left), O.rot(bone, x, y, z) radians
// about their own axes, O.hips(dy); k = the fade (0..1) for one-shots
const LAYERS = {
  relax: (t, O) => { const b = 0.04 * sin(t * 1.3); O.arm('r', [-0.34, -1, 0.02 + b], [-0.14, -1, 0.16]); O.arm('l', [0.34, -1, 0.02 - b], [0.14, -1, 0.16]); },
  wave: (t, O, k) => { const s = sin(t * 9); O.arm('r', [-0.5, 0.82, 0.18], [-0.12 + 0.5 * s, 1, 0.28]); O.rot('head', 0, 0, -0.08 * k); O.rot('chest', 0, 0.05, 0); },
  talk: (t, O) => { O.arm('r', [-0.3, -0.84, 0.42 + 0.1 * sin(t * 2.3)], [0.15 + 0.3 * sin(t * 3.1), 0.25 + 0.25 * sin(t * 2.6 + 1), 1]); O.arm('l', [0.32, -0.88, 0.3 + 0.08 * sin(t * 1.7 + 1)], [-0.12, 0.05 + 0.18 * sin(t * 1.9 + 1), 1]); O.rot('head', 0.04 * sin(t * 4.2), 0.06 * sin(t * 1.3), 0.03 * sin(t * 0.9)); O.rot('chest', 0, 0.06 * sin(t * 1.1), 0); },
  cheerSeated: (t, O, k) => { const b = 0.15 * sin(t * 8) * k; O.arm('r', [-0.35, 1, 0.1], [-0.2 - b, 1, 0.05]); O.arm('l', [0.35, 1, 0.1], [0.2 + b, 1, 0.05]); O.rot('head', -0.2 * k, 0, 0); },
  slump: (t, O) => { O.rot('chest', 0.3, 0, 0); O.rot('head', 0.38 + 0.03 * sin(t * 0.8), 0, 0); O.arm('r', [-0.05, -1, 0.25], [0, -1, 0.35]); O.arm('l', [0.05, -1, 0.25], [0, -1, 0.35]); },
  nod: (t, O) => { O.rot('head', 0.32 * max(0, sin(t * 7.5)) * (1 - t / 1.6), 0, 0); },
  shrug: (t, O, k) => { O.arm('r', [-0.55, -0.7, 0.35], [-0.85, 0.35, 0.5]); O.arm('l', [0.55, -0.7, 0.35], [0.85, 0.35, 0.5]); O.rot('head', 0, 0, 0.16 * k); O.rot('chest', 0, 0, 0); O.hips(0.02 * k); },
  think: (t, O) => { O.arm('r', [-0.12, -0.55, 0.82], [0.32, 0.86, 0.32]); O.arm('l', [0.18, -0.85, 0.45], [-0.88, 0.05, 0.45]); O.rot('head', -0.06 + 0.03 * sin(t * 0.7), 0, 0.14); },
  write: (t, O) => { O.arm('l', [0.22, -0.65, 0.72], [-0.45, 0.25, 1]); O.arm('r', [-0.18, -0.62, 0.75], [0.45 + 0.06 * sin(t * 11), 0.05 + 0.05 * sin(t * 7), 1]); O.rot('head', 0.36, -0.08, 0); O.rot('chest', 0.08, 0, 0); },
  read: (t, O) => { O.arm('l', [0.18, -0.72, 0.65], [-0.2, 0.42, 0.9]); O.arm('r', [-0.18, -0.72, 0.65], [0.2, 0.42, 0.9]); O.rot('head', 0.3 + 0.05 * max(0, sin(t * 0.9)), 0, 0); },
  weigh: (t, O) => { const dip = max(0, sin(t * 2.1)); O.arm('l', [0.32, -0.45, 0.85], [0.05, 0.3, 1]); O.arm('r', [-0.28, -0.5 - 0.1 * dip, 0.8], [0.3, 0.25 + 0.2 * dip, 1]); O.rot('head', 0.12, 0.28, 0); O.rot('chest', 0, 0.12 * sin(t * 0.6), 0); },
  telescope: (t, O) => { O.arm('r', [-0.42, 0.12, 0.9], [0.62, 0.62, 0.45]); O.arm('l', [0.35, -0.2, 0.92], [-0.55, 0.45, 0.7]); O.rot('head', -0.2, 0.1, 0); O.rot('chest', -0.06, 0.2 * sin(t * 0.35), 0); },
  type: (t, O) => { const tap = max(0, sin(t * 10)); O.arm('l', [0.2, -0.62, 0.75], [-0.5, 0.25, 1]); O.arm('r', [-0.2, -0.6, 0.78], [0.42, 0.12 - 0.12 * tap, 1]); O.rot('head', 0.34, 0, 0); },
  carry: (t, O) => { O.arm('l', [0.22, -0.55, 0.8], [-0.12, 0.25, 1]); O.arm('r', [-0.22, -0.55, 0.8], [0.12, 0.25, 1]); O.rot('chest', -0.08, 0, 0); },
};

// ------------------------------------------------------------------------------------------------ one character
const Y = [0, 1, 0];
/** build a person from the cast. opts: { lite, seated, work (true: every work prop now; false: never), props: [extra prop names] }. Returns the controller. */
export function character(THREE, cast, sp, opts) {
  const o = opts || {}, s = sp, L = C.drawLook(s), ot = outfit(s, L), pal = palette(THREE, s, L), lite = !!o.lite;
  // ---- bones: a fresh copy of the cast's skeleton + one hide-able bone per prop
  const root = cast.rootBone.clone(true), byName = {}; root.traverse((b) => { if (b.isBone) byName[b.name] = b; });
  const bones = cast.bindNames.map((n) => byName[n]), ibm = cast.ibm.map((m) => m.clone()), J = (name) => cast.bindNames.indexOf(name);
  // the rest pose: every frame starts from it, so a bone a clip does not move (the head and chest in some clips) never collects the layers' turns
  const restPose = bones.map((b) => [b, b.position.clone(), b.quaternion.clone()]);
  const toRest = () => { for (const [b, p, q] of restPose) { b.position.copy(p); b.quaternion.copy(q); } };
  const propBone = {}, rest = cast.restWorld;
  // ---- what this person carries now (more are built on demand)
  const want = new Set(IDLE_PROPS[ot.accessory] || []); if (ot.bun) want.add('bun'); if (ot.topknot) want.add('topknot'); if (ot.glasses) want.add('glasses');
  if (o.work === true) for (const k of Object.keys(WORK_PROPS)) WORK_PROPS[k].forEach((p) => want.add(p)); else if (o.work !== false && o.workPose && WORK_PROPS[o.workPose]) WORK_PROPS[o.workPose].forEach((p) => want.add(p));
  for (const p of o.props || []) want.add(p);
  const st = { pose: 'idle', name: 'idle', then: null, t: 0, start: 0, expr: C.MOOD_EXPR[s.mood] || 'neutral', exprK: 1, talking: false, speech: null, look: null, lookCur: [0, 0], seated: !!o.seated,
    blinkAt: 1.2 + ((s.seed >>> 4) % 300) / 100, blink: 0, rng: C.rng(((s.seed >>> 0) ^ 0x51ed27) >>> 0), syl: { t: 0, v: 'rest', k: 0 }, glance: [0, 0], glanceAt: 2, mouth: VIS.map(() => 0),
    morph: MORPHS.map(() => 0), layers: [], base: null, baseName: '', props: {}, disposed: false, idleVar: o.idle || 'Unarmed_Idle',      // the pack's 'Idle' is a turned fighting stance: ours face you
    walkVar: ['Walking_A', 'Walking_B', 'Walking_C'][(s.seed >>> 9) % 3] };
  const model = new THREE.Group(); model.name = 'olympus-person-rig';
  const mat = o.material || rigMaterial(THREE, lite);
  let body = null, face = null, skel = null, built = null;
  function build() {
    // props need their bones first (the skeleton is rebuilt when a new prop is added)
    for (const p of want) if (!propBone[p]) { const pb = new THREE.Bone(); pb.name = 'x_' + p; const at = byName[PROP_BONE[p]] || byName.root; at.add(pb); propBone[p] = pb; }
    const extra = Object.keys(propBone), allBones = bones.concat(extra.map((p) => propBone[p])), allIbm = ibm.concat(extra.map((p) => ibm[J(PROP_BONE[p])] || new THREE.Matrix4()));
    const bodyA = new Acc(), faceA = new Acc(), cols = { skin: pal.skin, hair: pal.hair, brow: pal.brow, outfit: pal.outfit, outfit2: pal.outfit2, accent: pal.accent, leather: pal.leather, metal: pal.metal, boots: pal.boots, linen: pal.linen };
    const P = cast.parts, use = (n, map) => { if (P[n]) bodyA.part(P[n], cols, { slotMap: map }); };
    use('body_' + ot.body); use('arms_' + ot.body); use('legs_' + ot.body, { [SL.outfit2]: SL.skin });
    if (ot.hair) use(ot.hair); if (ot.beard) use('beard'); if (ot.hood) use('hood'); if (ot.cape) use('cape'); if (ot.earring) use('earring');
    if (ot.helmet && P.helmet) { const h0 = bodyA.n; use('helmet'); for (let i = h0; i < bodyA.n; i++) if (bodyA.P[i * 3 + 1] > 2.12 && Math.abs(bodyA.P[i * 3]) < 0.09) { bodyA.C[i * 3] = pal.accent.r; bodyA.C[i * 3 + 1] = pal.accent.g; bodyA.C[i * 3 + 2] = pal.accent.b; bodyA.M[i] = 0; } }
    if (ot.moustache) { const g = new THREE.SphereGeometry(1, 10, 6); for (const e of [-1, 1]) bodyA.geo(THREE, g.clone(), new THREE.Matrix4().compose(new THREE.Vector3(e * 0.05, 1.418, 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, e * 0.3)), new THREE.Vector3(0.052, 0.017, 0.024)), pal.hair, J('head'), 0); g.dispose(); }
    const headJ = J('head');
    for (const p of want) {
      const bi = allBones.indexOf(propBone[p]), bw = rest[PROP_BONE[p]] || new THREE.Matrix4();
      if (p === 'helmet') { if (!ot.helmet && P.helmet) bodyA.part(P.helmet, cols); }
      else if (p === 'shield' || p === 'book') { if (P[p]) { const k0 = bodyA.n; bodyA.part(P[p], cols); for (let i = k0; i < bodyA.n; i++) { bodyA.J[i * 4] = bi; bodyA.W[i * 4] = 1; for (let k = 1; k < 4; k++) { bodyA.J[i * 4 + k] = 0; bodyA.W[i * 4 + k] = 0; } } } }
      else if (p === 'cup' && P.cup) { const k0 = bodyA.n; bodyA.part(P.cup, { ...cols, fixed: lin(THREE, TERRA) }); for (let i = k0; i < bodyA.n; i++) { bodyA.J[i * 4] = bi; bodyA.W[i * 4] = 1; for (let k = 1; k < 4; k++) { bodyA.J[i * 4 + k] = 0; bodyA.W[i * 4 + k] = 0; } } }
      else for (const [g, m, col, metal] of propGeo(THREE, p, pal, s)) bodyA.geo(THREE, g, bw.clone().multiply(m), col, bi, metal, 'p:' + p);
    }
    const fi = buildFace(THREE, cast, ot, pal, faceA, headJ);
    const morphs = faceMorphs(faceA, fi);
    const bg = bodyA.build(THREE), fg = faceA.build(THREE, morphs);
    if (!skel) { skel = new THREE.Skeleton(allBones, allIbm); }
    else { skel.dispose(); skel = new THREE.Skeleton(allBones, allIbm); }
    const bind = new THREE.Matrix4();
    if (!body) {
      body = new THREE.SkinnedMesh(bg, mat); body.name = 'person-body'; body.add(root); body.frustumCulled = false; model.add(body);
      face = new THREE.SkinnedMesh(fg, mat); face.name = 'person-face'; face.frustumCulled = false; model.add(face);
    } else { body.geometry.dispose(); face.geometry.dispose(); body.geometry = bg; face.geometry = fg; }
    body.bind(skel, bind); face.bind(skel, bind);
    face.morphTargetInfluences = MORPHS.map((m, i) => st.morph[i] || 0); face.updateMorphTargets(); face.morphTargetInfluences.forEach((_, i) => { face.morphTargetInfluences[i] = st.morph[i] || 0; });
    built = { tris: (bg.index.count + fg.index.count) / 3, verts: bodyA.n + faceA.n, props: [...want], parts: bodyA.tags.map((t) => t[0]).concat(faceA.tags.map((t) => t[0])) };
    for (const p of Object.keys(propBone)) if (st.props[p] == null) st.props[p] = 0;
    if (typeof orientHeld === 'function' && st.ticked !== undefined) { /* oriented after the first snap */ }
  }
  build();
  const seatOff = (() => { if (!cast.clips.Sit_Chair_Idle) return 0.62; const tmp = new THREE.AnimationMixer(root); const a = tmp.clipAction(cast.clips.Sit_Chair_Idle); a.play(); tmp.update(0.01); model.updateWorldMatrix(true, true); const hy = byName.hips.getWorldPosition(new THREE.Vector3()).y; tmp.stopAllAction(); tmp.uncacheRoot(root); return hy; })();
  // ---- size, build (slim / round / broad), and where the seat is when seated
  const k = UNIT * (s.height || 1), fat = { slim: 0.94, round: 1.1, broad: 1.06 }[s.build] || 1;
  model.scale.set(k * fat, k, k * fat);
  const holder = new THREE.Group(); holder.name = 'olympus-person'; holder.add(model);
  // ---- animation
  const mixer = new THREE.AnimationMixer(model), actions = {};
  const clipOf = (name) => {
    if (name === 'idle') return st.seated ? 'Sit_Chair_Idle' : st.idleVar;
    if (name === 'walk') return st.walkVar;
    return name;
  };
  function action(name) {
    const cn = clipOf(name), clip = cast.clips[cn] || cast.clips.Idle; if (!clip) return null;
    let a = actions[clip.name]; if (!a) { a = actions[clip.name] = mixer.clipAction(clip); a.timeScale = 0.92 + ((s.seed >>> 11) % 17) / 100; }
    return a;
  }
  function setBase(name, def, loop) {
    const a = action(name); if (!a) return;
    if (st.base === a) { if (!loop) { a.reset(); a.play(); } return; }
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop; a.enabled = true;
    if (loop) a.time = ((s.seed >>> 3) % 1000) / 1000 * a.getClip().duration;
    a.timeScale = (def.speed || 1) * (0.92 + ((s.seed >>> 11) % 17) / 100);
    if (st.base && st.ticked) { a.play(); st.base.crossFadeTo(a, 0.28, false); } else { if (st.base) st.base.stop(); a.play(); }
    st.base = a; st.baseName = name;
  }
  function poseDef(n) { return POSES3[n] || POSES3.idle; }
  function play(name, po) {
    const opt = po || {}, n = POSES3[name] ? name : 'idle', def = poseDef(n);
    const seatedNow = st.seated && !def.stand;
    if (def.work) ensureProps(WORK_PROPS[n] || []);
    const isOne = !def.loop && opt.loop !== true;
    if (!isOne) st.pose = n; else st.then = opt.then && POSES3[opt.then] ? opt.then : st.pose;
    if (opt.then && !isOne && POSES3[opt.then]) st.then = null;
    st.name = n; st.start = st.t;
    const baseName = seatedNow && (def.base === 'Cheer' || def.base === 'Jump_Full_Short' || def.base === 'PickUp') ? 'idle' : def.base;
    setBase(baseName, def, !!def.loop || ['idle', 'walk', 'Sit_Chair_Idle', 'Running_A'].includes(baseName));
    const layer = seatedNow && def.seatedOver ? def.seatedOver : def.over || (n === 'idle' && !seatedNow ? 'relax' : null);
    for (const l of st.layers) l.goal = 0;
    if (layer) st.layers.push({ name: layer, w: 0, goal: 1, t0: st.t, dur: isOne ? (def.dur || 1) : 0 });
    if (!st.ticked) { toRest(); mixer.update(0); applyLayers(0, true); }
    const clip = cast.clips[clipOf(baseName)], len = isOne ? (def.dur || (clip ? clip.duration : 1)) : 0;
    st.oneEnd = isOne ? st.t + len : 0;
    return len;
  }
  function ensureProps(list) { let miss = false; for (const p of list) if (!want.has(p)) { want.add(p); miss = true; } if (miss) build(); }
  // ---- layers: aim the arms, turn the head and chest
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), mq = new THREE.Quaternion(), e0 = new THREE.Euler();
  function aim(bone, dir, w) {
    if (!bone || w <= 0.001) return;
    model.getWorldQuaternion(mq);
    bone.getWorldQuaternion(q0); v0.set(0, 1, 0).applyQuaternion(q0);
    v1.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(mq);
    q1.setFromUnitVectors(v0, v1).multiply(q0);                          // the new world rotation
    bone.parent.getWorldQuaternion(q2); q2.invert().multiply(q1);        // in the parent's frame
    bone.quaternion.slerp(q2, w); bone.updateMatrixWorld(true);
  }
  function rotOwn(bone, x, y, z, w) {
    if (!bone || w <= 0.001 || (!x && !y && !z)) return;
    model.getWorldQuaternion(mq); bone.getWorldQuaternion(q0);
    q1.setFromEuler(e0.set(x * w, y * w, z * w, 'YXZ')); q1.premultiply(mq).multiply(q2.copy(mq).invert());      // the person's own axes in world
    q1.multiply(q0); bone.parent.getWorldQuaternion(q2); q2.invert().multiply(q1); bone.quaternion.copy(q2); bone.updateMatrixWorld(true);
  }
  function applyLayers(dt, now) {
    holder.updateWorldMatrix(true, true);
    for (const l of st.layers) {
      l.w += (l.goal - l.w) * (now ? 1 : Math.min(1, dt * 6)); if (l.goal === 0 && l.w < 0.01) l.dead = true;
      const fn = LAYERS[l.name]; if (!fn || l.dead) continue;
      const lt = st.t - l.t0, kk = l.dur ? ease(min(1, lt * 4)) * (lt > l.dur - 0.3 ? max(0, (l.dur - lt) / 0.3) : 1) : 1, w = l.w * kk;
      const O = { arm: (side, up, fore) => { aim(byName['upperarm' + side], up, w * 0.95); aim(byName['lowerarm' + side], fore, w * 0.95); }, rot: (b, x, y, z) => rotOwn(byName[b], x, y, z, w), hips: (dy) => { byName.hips.position.y += dy * w / UNIT; } };
      fn(lt, O, kk);
    }
    st.layers = st.layers.filter((l) => !l.dead);
  }
  // ---- look at a point (head + a little chest), clamped
  const hv = new THREE.Vector3(), tv = new THREE.Vector3();
  function applyLook(dt, now) {
    const def = poseDef(st.name), k0 = def.look == null ? 1 : def.look;
    let yaw = 0, pitch = 0;
    if (st.look) {
      byName.head.getWorldPosition(hv); hv.y += 0.4 * UNIT * (s.height || 1);
      tv.copy(st.look); model.worldToLocal(tv); const hl = model.worldToLocal(hv.clone());
      const dx = tv.x - hl.x, dy = tv.y - hl.y, dz = tv.z - hl.z;
      yaw = clamp(Math.atan2(dx, dz), -1.0, 1.0) * k0; pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.4) * k0;
      if (dz < -0.2) yaw *= 0.5;
    } else { yaw = st.glance[0] * 0.35 * k0; pitch = st.glance[1] * -0.12 * k0; }
    const a = now ? 1 : Math.min(1, dt * 5);
    st.lookCur[0] += (yaw - st.lookCur[0]) * a; st.lookCur[1] += (pitch - st.lookCur[1]) * a;
    rotOwn(byName.chest, 0, st.lookCur[0] * 0.25, 0, 1); rotOwn(byName.head, st.lookCur[1], st.lookCur[0] * 0.75, 0, 1);
    return [yaw, pitch];
  }
  // ---- face: blink, glance, expression, the mouth
  function faceTick(dt, now) {
    const def = poseDef(st.name), ename = (st.oneEnd && def.expr) ? def.expr : st.exprSet ? st.expr : (def.expr || st.expr), E = C.EXPR_FACE[ename] || C.EXPR_FACE.neutral, kx = st.exprK;
    const tg = MORPHS.map(() => 0);
    // brows and lids from the shared face table (the same faces as the 2D portrait)
    tg[MI.browUp] = clamp(E.brow[0] / 0.034, 0, 1) * kx; const tilt = E.brow[1]; if (tilt > 0) tg[MI.browSad] = clamp(tilt / 0.38, 0, 1) * kx; else tg[MI.browAngry] = clamp(-tilt / 0.1, 0, 1) * 0.7 * kx;
    if (ename === 'surprised') tg[MI.wide] = 0.8 * kx;
    const lidBase = clamp((E.lid[0] - 0.12) * 0.8 + E.lid[1] * 0.35 + L.lidBias * 0.3, 0, 0.6) * kx;
    // blink
    if (!now) { st.blinkAt -= dt; if (st.blinkAt <= 0) { st.blink = 0.16; st.blinkAt = 2.2 + st.rng() * 3.6; if (st.rng() < 0.15) st.blinkAt = 0.25; } }
    let bl = 0; if (st.blink > 0) { st.blink = Math.max(0, st.blink - dt); bl = sin((1 - st.blink / 0.16) * Math.PI); }
    tg[MI.blink] = Math.max(lidBase, bl);
    // eyes glance
    if (!now) { st.glanceAt -= dt; if (st.glanceAt <= 0) { st.glance = st.look ? [0, 0] : [(st.rng() - 0.5) * 1.2, (st.rng() - 0.5) * 0.6]; st.glanceAt = 1.2 + st.rng() * 2.4; } }
    const eyes = def.eyes ? (typeof def.eyes === 'function' ? def.eyes(st.t) : def.eyes) : st.glance;
    tg[MI.eyeX] = clamp(eyes[0], -1, 1) * 0.8; tg[MI.eyeY] = clamp(eyes[1], -1, 1) * 0.7;
    // the mouth: speech (setMouth) > talking syllables > the expression's mouth, else the person's resting mouth
    const restM = C.RESTING_MOUTH[s.face && s.face.mouth] || {}, em = Object.keys(E.mouth).length ? E.mouth : restM;
    const sp = st.speech && st.t - st.speech.t < 0.3 ? st.speech : null;
    if (st.talking && !sp && !now) { st.syl.t -= dt; if (st.syl.t <= 0) { const r = st.rng(); st.syl.v = r < 0.3 ? 'A' : r < 0.5 ? 'E' : r < 0.66 ? 'O' : r < 0.82 ? 'MBP' : 'rest'; st.syl.k = 0.55 + st.rng() * 0.45; st.syl.t = 0.08 + st.rng() * 0.11; } }
    VIS.forEach((v, i) => {
      let w = (em[v] || 0) * kx;
      if (sp) w = (sp.v === v ? sp.k : 0) + w * 0.25; else if (st.talking) w = (st.syl.v === v ? st.syl.k : 0) + w * 0.3;
      tg[MI[v]] = Math.min(1, w);
    });
    const a = now ? 1 : Math.min(1, dt * 14), am = now ? 1 : Math.min(1, dt * (sp || st.talking ? 26 : 9));
    const inf = face.morphTargetInfluences;
    for (let i = 0; i < MORPHS.length; i++) { const m = MORPHS[i], rate = VIS.includes(m) ? am : m === 'blink' ? (bl > 0 ? 1 : a) : a; st.morph[i] += (tg[i] - st.morph[i]) * rate; if (inf) inf[i] = st.morph[i]; }
    VIS.forEach((v, i) => { st.mouth[i] = st.morph[MI[v]]; });
    // head: the expression's tilt, a bob while talking
    const head = E.head || [0, 0];
    rotOwn(byName.head, head[0] * kx + (st.talking ? 0.035 * sin(st.t * 9.5) : 0), 0, head[1] * kx, 1);
  }
  function propsTick(dt, now) {
    const def = poseDef(st.name), on = new Set(IDLE_PROPS[ot.accessory] || []);
    if (ot.bun) on.add('bun'); if (ot.topknot) on.add('topknot'); if (ot.glasses) on.add('glasses');
    if (def.work) { const wp = WORK_PROPS[st.name] || []; for (const p of wp) on.add(p); for (const p of ['hammer', 'torch', 'scroll', 'lantern']) if (!wp.includes(p) && (wp.length && PROP_BONE[p] && wp.some((x) => PROP_BONE[x] === PROP_BONE[p]))) on.delete(p); }
    if (def.over === 'wave' || st.name === 'cheer') { on.delete('scroll'); on.delete('lantern'); on.delete('torch'); on.delete('hammer'); }
    if (st.name === 'read' || st.name === 'carry') for (const p of ['hammer', 'torch', 'scroll', 'lantern', 'coin']) on.delete(p);
    for (const p of Object.keys(propBone)) { const g = on.has(p) ? 1 : 0; st.props[p] += (g - st.props[p]) * (now ? 1 : Math.min(1, dt * 8)); const v = st.props[p] < 0.02 ? 1e-4 : st.props[p]; propBone[p].scale.setScalar(v); }
  }
  function tick(dt) {
    if (st.disposed) return;
    dt = Math.min(0.1, Math.max(0, dt || 0)); st.t += dt;
    if (st.oneEnd && st.t >= st.oneEnd) { st.oneEnd = 0; const nx = st.then || st.pose || 'idle'; st.then = null; play(nx); }
    const def = poseDef(st.name), seatedNow = st.seated && !def.stand;
    if (st.seatedNow !== seatedNow) { st.seatedNow = seatedNow; }
    toRest(); mixer.update(dt); st.ticked = true;
    model.position.y = seatedNow ? seatY() : 0;
    applyLayers(dt, false); applyLook(dt, false); faceTick(dt, false); propsTick(dt, false);
  }
  function seatY() { return (SEAT_BUTT - (seatOff - 0.24) * UNIT) * (s.height || 1); }
  function snap() { toRest(); mixer.update(0); const def = poseDef(st.name); model.position.y = st.seated && !def.stand ? seatY() : 0; applyLayers(0, true); applyLook(0, true); faceTick(0, true); propsTick(0, true); }
  function lookAt(v) { if (!v) st.look = null; else st.look = (st.look || new THREE.Vector3()).set(v.x, v.y, v.z); if (!st.ticked) snap(); }
  function setMouth(v, amount) { const n = VIS.includes(v) ? v : 'rest'; st.speech = { v: n, k: amount == null ? 1 : clamp(+amount || 0, 0, 1), t: st.t }; if (!st.ticked) snap(); }
  function setExpression(name, amount) { st.expr = C.EXPR_FACE[name] ? name : 'neutral'; st.exprSet = true; st.exprK = amount == null ? 1 : clamp(+amount || 0, 0, 1); if (!st.ticked) snap(); }
  function setTalking(on) { st.talking = !!on; if (!on) st.speech = null; if (on && (st.pose === 'idle' || st.pose === 'sit') && st.name === st.pose) { st.talkAuto = st.pose; play('talk'); } else if (!on && st.talkAuto) { const back = st.talkAuto; st.talkAuto = null; if (st.name === 'talk') play(back); } }      // talking while idle brings the talk gestures; they stop with the talk (an explicit play('talk') stays)
  function setSeated(on) { st.seated = !!on; play(st.pose); }
  function dispose() {
    st.disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
    if (body) body.geometry.dispose(); if (face) face.geometry.dispose(); if (skel) skel.dispose();
    if (holder.parent) holder.parent.remove(holder);
  }
  const anchor = new THREE.Object3D(); anchor.name = 'head-anchor'; anchor.position.set(0, 0.42, 0.1); byName.head.add(anchor);
  play(o.pose || (st.seated ? 'idle' : 'idle')); snap();
  // the props held when idle point where they should with the arm relaxed (a lantern staff and a torch upright, a hammer hanging, a scroll forward)
  const HOLD = { lantern: [0.05, 1, 0.12], torch: [0.05, 1, 0.2], hammer: [0, -1, 0.25], scroll: [0, 0.25, 1] };
  function orientHeld() {
    if (st.seated) return;
    const was = st.layers.slice(); st.layers = [{ name: 'relax', w: 1, goal: 1, t0: st.t, dur: 0 }]; toRest(); mixer.update(0); applyLayers(0, true); st.layers = was;
    model.updateWorldMatrix(true, true); model.getWorldQuaternion(mq);
    for (const p of Object.keys(HOLD)) {
      const pb = propBone[p]; if (!pb) continue;
      pb.quaternion.identity(); pb.updateMatrixWorld(true); pb.getWorldQuaternion(q0);
      v1.set(...HOLD[p]).normalize().applyQuaternion(mq).applyQuaternion(q2.copy(q0).invert());      // the wanted direction in the bone's frame
      pb.quaternion.setFromUnitVectors(v0.set(0, 1, 0), v1);
    }
    snap();
  }
  orientHeld();
  const api = {
    object: holder, model, body, face: () => face, bodyMesh: () => body, skeleton: () => skel, bones: byName, anchor, outfit: ot, look: L, palette: pal, mixer,
    play, pose: (n) => { play(n); if (!st.ticked) snap(); return holder; }, lookAt, setMouth, setExpression, setTalking, setSeated, tick, snap, dispose,
    clips: () => Object.keys(cast.clips), info: () => ({ ...built, drawCalls: 2, bones: skel.bones.length }),
    height: () => k * 2.28, headY: () => k * 1.72,
    state: () => ({ pose: st.name, base: st.base ? st.base.getClip().name : '', expression: st.expr, talking: st.talking, mouth: st.mouth.slice(), morph: Object.fromEntries(MORPHS.map((m, i) => [m, +st.morph[i].toFixed(3)])),
      lids: [[+st.morph[MI.blink].toFixed(3), +st.morph[MI.blink].toFixed(3)], [0, 0]], props: Object.keys(st.props).filter((p) => st.props[p] > 0.5), layers: st.layers.map((l) => l.name), seated: st.seated, look: st.lookCur.slice() }),
  };
  return api;
}
