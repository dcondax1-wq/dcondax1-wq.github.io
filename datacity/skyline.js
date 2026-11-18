// The Data City's buildings, built to scale to 25-40k: one InstancedMesh per tile (TILE x TILE blocks of one district,
// frustum-culled by three.js with its bounding sphere), its wet-street reflection when near, and far away one impostor per
// block (a 3 x 3 cluster of towers with the block's heights, all blocks in ONE instanced draw). Monuments and ships are
// "landmarks", always drawn in full. Per-building state (search dim, the Today layer, watch / selected) lives in instanced
// attributes, written only when it changes, never per frame.
import * as THREE from '../jarvis/three.module.min.js';
import * as SH from './shaders.js';
import { ARCH } from './kinds.js';
import { PROFILES } from './caps.js';

export const LOD = { hq: 170, lq: 125 };        // a tile nearer than this (to its edge) draws every building
export const RICH = { hq: 70, lq: 0 };          // and nearer than this it draws the 8-sided towers (round glass, real drums); further, 4-sided ones
const MIRROR_NEAR = { hq: 100, lq: 0 };
const MAX_FULL = { hq: 22, lq: 12 };           // at most this many tiles drawn in full (the nearest)
const MIRRORS = 4;                             // at most this many reflected tiles (each is a draw call)
const golden = (i) => (i * 0.6180339) % 1;

/** A building: three stacked prisms (tier 0, 1, 2) of `sides` sides. The vertex shader reshapes them per building type (steps, taper, a spire,
 *  round or square), so one geometry makes every type. position = the square outline in unit space, aRad = the vertex's direction (the round
 *  version), aTier = which prism. 4 sides = 30 triangles, 8 sides = 66. */
export function towerGeo(sides) {
  const pos = [], nor = [], uv = [], tier = [], rad = [], idx = [];
  const ang = (k) => (sides === 4 ? Math.PI / 4 + (k * Math.PI) / 2 : (k * Math.PI * 2) / sides);
  const sq = (a) => { const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s)); return [(c / m) * 0.5, (s / m) * 0.5]; };
  const vert = (a, y, n, t, centre) => {
    const [x, z] = centre ? [0, 0] : sq(a);
    pos.push(x, y, z); nor.push(...n); uv.push(0, y); tier.push(t); rad.push(centre ? 0 : Math.cos(a), centre ? 0 : Math.sin(a));
    return pos.length / 3 - 1;
  };
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < sides; k++) {
      const a0 = ang(k), a1 = ang(k + 1), am = (a0 + a1) / 2;
      const n = Math.abs(Math.cos(am)) > Math.abs(Math.sin(am)) ? [Math.sign(Math.cos(am)), 0, 0] : [0, 0, Math.sign(Math.sin(am))];
      const bl = vert(a0, 0, n, t), br = vert(a1, 0, n, t), tr = vert(a1, 1, n, t), tl = vert(a0, 1, n, t);
      idx.push(bl, tr, br, bl, tl, tr);
    }
    if (sides === 4) {                                           // the plain version: a roof of two triangles
      const r = [0, 1, 2, 3].map((k) => vert(ang(k), 1, [0, 1, 0], t));
      idx.push(r[0], r[2], r[1], r[0], r[3], r[2]);
      continue;
    }
    const c = vert(0, 1, [0, 1, 0], t, true), ring = [];
    for (let k = 0; k < sides; k++) ring.push(vert(ang(k), 1, [0, 1, 0], t));
    for (let k = 0; k < sides; k++) idx.push(c, ring[(k + 1) % sides], ring[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTier', new THREE.Float32BufferAttribute(tier, 1));
  g.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 2));
  g.setIndex(idx);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.5, 0.5));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.0);
  return g;
}

/** the building-type tables as uniforms (kinds.js ARCH: y1 y2 crown round | scales | scales glass rough) */
export function archUniforms() {
  const a = [], b = [], c = [];
  for (let i = 0; i < 16; i++) {                                 // the shader's tables hold 16: pad with the plain block
    const r = ARCH[Math.min(i, ARCH.length - 1)];
    a.push(new THREE.Vector4(r[0], r[1], r[2], r[3])); b.push(new THREE.Vector4(r[4], r[5], r[6], r[7])); c.push(new THREE.Vector4(r[8], r[9], r[10], r[11]));
  }
  return { uArchA: { value: a }, uArchB: { value: b }, uArchC: { value: c } };
}

/** share the instanced attributes of one geometry with another (the near, 8-sided version of a tile) */
function shareInstanced(from, to) {
  for (const k of ['aColor', 'aData', 'aState', 'aSeed', 'aLook']) to.setAttribute(k, from.getAttribute(k));
}

/** Nine thin boxes in a unit square, each vertex tagged with its box (aSub): the impostor of one block. */
function clusterGeo() {
  const pos = [], nor = [], uv = [], sub = [], idx = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.BoxGeometry(0.29, 1, 0.29);
    g.translate(-0.333 + (i % 3) * 0.333, 0.5, -0.333 + Math.floor(i / 3) * 0.333);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (let k = 0; k < g.attributes.position.count; k++) sub.push(i);
    for (const k of g.index.array) idx.push(base + k);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('aSub', new THREE.Float32BufferAttribute(sub, 1));
  out.setIndex(idx);
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

export class Skyline {
  /** L: layout(); U: the scene's shared uniforms; quality 'hq' | 'lq' */
  constructor(L, U, quality, caps) {
    this.L = L; this.U = U; this.quality = quality;
    this.caps = caps || PROFILES[quality === 'lq' ? 'lite' : 'full'];
    this.group = new THREE.Group();
    this.box = towerGeo(4);                 // far / mid: 4-sided prisms; near: 8-sided (round towers round)
    this.rich = towerGeo(8);
    const arch = archUniforms();
    const mat = (mirror) => new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS,
      uniforms: { ...pick(U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay', 'uToday', 'uWet', 'uGrow', 'uDusk', 'uCloud', 'uSun', 'uAccent', 'uFlash'), ...arch,
                  uMirror: { value: mirror ? 1 : 0 } },
      ...(mirror ? { transparent: true, depthWrite: false, side: THREE.DoubleSide } : {}) });
    this.mat = mat(false); this.mirrorMat = mat(true);
    this.where = new Int32Array(L.items.length * 2).fill(-1);       // item -> [mesh index, local index]
    this.meshes = [];
    const landmarks = [];
    L.items.forEach((it, i) => { if (it.tile < 0) landmarks.push(i); });
    this.tiles = L.tiles.map((t) => this._mesh(t.items, t));
    this.landmarks = landmarks.length ? this._mesh(landmarks, null) : null;
    this._impostors();
    this.lodDirty = true;
  }

  _mesh(list, tile) {
    const L = this.L, n = list.length, g = this.box.clone();
    g.boundingBox = this.box.boundingBox; g.boundingSphere = this.box.boundingSphere;
    const aColor = new Float32Array(n * 3), aData = new Float32Array(n * 4), aState = new Float32Array(n * 4), aSeed = new Float32Array(n), aLook = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const mesh = new THREE.InstancedMesh(g, this.mat, n);
    list.forEach((i, k) => {
      const it = L.items[i];
      m4.makeScale(it.kind === 'ship' ? 0.9 : it.w, it.h, it.w).setPosition(it.x, 0, it.z);
      mesh.setMatrixAt(k, m4);
      col.setHex(it.color);
      aColor.set([col.r, col.g, col.b], k * 3);
      aData.set([it.h, it.lit, it.pulse, 0], k * 4);
      aState[k * 4 + 2] = 1;                                   // the height scale of the timeline (1 = the idea as it stands now)
      aLook.set([it.arch ?? 11, it.steady ?? 0.5, 0, 0], k * 4);
      aSeed[k] = golden(i);
      this.where[i * 2] = this.meshes.length; this.where[i * 2 + 1] = k;
    });
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(aData, 4));
    g.setAttribute('aState', new THREE.InstancedBufferAttribute(aState, 4));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    g.setAttribute('aLook', new THREE.InstancedBufferAttribute(aLook, 4));
    const gr = this.rich.clone();
    gr.boundingBox = this.rich.boundingBox; gr.boundingSphere = this.rich.boundingSphere;
    shareInstanced(g, gr);
    const near = new THREE.InstancedMesh(gr, this.mat, n);
    near.instanceMatrix = mesh.instanceMatrix;
    near.visible = false; near.renderOrder = 2;
    mesh.computeBoundingSphere();
    near.boundingSphere = mesh.boundingSphere;
    mesh.renderOrder = 2;
    const mirror = new THREE.InstancedMesh(g, this.mirrorMat, n);
    mirror.instanceMatrix = mesh.instanceMatrix;
    mirror.frustumCulled = false;
    mirror.visible = false;
    mirror.renderOrder = 1;
    const rec = { mesh, mirror, near, list, tile, detail: true, nearOn: false };
    mesh.userData.rec = this.meshes.length;
    near.userData.rec = this.meshes.length;
    this.meshes.push(rec);
    this.group.add(mesh, near, mirror);
    return rec;
  }

  _impostors() {
    const L = this.L, B = L.blocks, n = B.length;
    if (!n) { this.imp = null; return; }
    const geo = clusterGeo();
    const ha = new Float32Array(n * 4), hb = new Float32Array(n * 4), hc = new Float32Array(n), color = new Float32Array(n * 3);
    this.impMeta = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    this.imp = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: SH.IMP_VS, fragmentShader: SH.IMP_FS,
      uniforms: pick(this.U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay', 'uToday', 'uGrow') }), n);
    B.forEach((b, k) => {
      const hs = new Array(9).fill(0.05), w = Math.max(1e-6, b.x1 - b.x0), d = Math.max(1e-6, b.z1 - b.z0);
      let r = 0, g = 0, bl = 0, wt = 0, lit = 0;
      for (const i of b.items) {
        const it = L.items[i];
        const sx = Math.min(2, Math.floor((3 * (it.x - b.x0)) / w)), sz = Math.min(2, Math.floor((3 * (it.z - b.z0)) / d));
        hs[sz * 3 + sx] = Math.max(hs[sz * 3 + sx], it.h);
        c.setHex(it.color);
        const q = it.h * it.h;
        r += c.r * q; g += c.g * q; bl += c.b * q; wt += q; lit += it.lit;
      }
      ha.set(hs.slice(0, 4), k * 4); hb.set(hs.slice(4, 8), k * 4); hc[k] = hs[8];
      color.set([r / wt, g / wt, bl / wt], k * 3);
      this.impMeta.set([lit / b.items.length, 0, 0, 0], k * 4);
      m4.makeScale(w + 0.4, 1, d + 0.4).setPosition((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      this.imp.setMatrixAt(k, m4);
    });
    geo.setAttribute('aHa', new THREE.InstancedBufferAttribute(ha, 4));
    geo.setAttribute('aHb', new THREE.InstancedBufferAttribute(hb, 4));
    geo.setAttribute('aHc', new THREE.InstancedBufferAttribute(hc, 1));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    this.impAttr = new THREE.InstancedBufferAttribute(this.impMeta, 4);
    geo.setAttribute('aMeta', this.impAttr);
    this.imp.frustumCulled = false;                 // one draw for the whole far city
    this.imp.renderOrder = 2;
    this.group.add(this.imp);
  }

  setQuality(q, caps) { this.quality = q; if (caps) this.caps = caps; this.lodDirty = true; }

  /** LOD: each tile in full near the camera, as impostor blocks far away. Cheap: ~100 distance tests a frame. */
  update(camera) {
    const C = this.caps, p = camera.position, lod = C.lod, near = C.mirrorNear;
    let changed = this.lodDirty;
    const mir = [], dists = this._d || (this._d = new Float32Array(this.tiles.length));
    this.tiles.forEach((rec, k) => { const t = rec.tile; dists[k] = Math.hypot(p.x - t.cx, p.y - t.hmax * 0.4, p.z - t.cz) - t.r; });
    // never more than MAX_FULL tiles in full (the nearest ones): a hard ceiling on draw calls and triangles whatever the camera does
    const order = this._o || (this._o = this.tiles.map((_, k) => k));
    order.sort((a, b) => dists[a] - dists[b]);
    // and (a phone, caps fullTris) never more full-detail triangles than its budget: the city grows with the data, the phone does not
    // and the 8-sided near towers (66 triangles a building, 30 for the 4-sided) stop at caps.richTris, nearest first: a clear night over the
    // densest district had 13 tiles inside the rich radius and drew 706k triangles (budget 700k); further tiles keep the 4-sided towers.
    // Each tile is counted at the geometry it will really draw.
    const full = new Set(), rich = this._rich || (this._rich = new Set()), capT = C.fullTris || Infinity, capR = C.richTris || Infinity;
    const triOf = (k, g) => (g.index ? g.index.count : g.attributes.position.count) / 3 * this.tiles[k].mesh.count;
    let tris = 0, richT = 0;
    rich.clear();
    for (const k of order.slice(0, C.maxFull)) {
      if (!(dists[k] < lod)) continue;
      // rich 0 (LITE, a phone) means never: dist is negative with the camera inside a tile's radius, so `dist < 0` alone let the 8-sided
      // towers through on LITE wherever an earlier fly-to had parked the camera over a tile (the test-order leak, 2026-11-17)
      const nr = triOf(k, this.rich), isRich = C.rich > 0 && dists[k] < C.rich && richT + nr <= capR;
      const n = isRich ? nr : triOf(k, this.box);
      if (full.size && tris + n > capT) break;
      full.add(k); tris += n;
      if (isRich) { rich.add(k); richT += nr; }
    }
    this.fullTris = tris;
    this.tiles.forEach((rec, k) => {
      const t = rec.tile, dist = dists[k], detail = full.has(k), isRich = rich.has(k);
      if (detail !== rec.detail || this.lodDirty) {
        rec.detail = detail;
        for (const b of t.blocks) this.impMeta[b * 4 + 3] = detail ? 0 : 1;
        changed = true;
      }
      rec.mesh.visible = detail && !isRich;
      rec.near.visible = isRich;
      rec.mirror.visible = false;
      if (detail && near > 0 && dist < near) mir.push([dist, rec]);
    });
    mir.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(C.mirrors, mir.length); k++) mir[k][1].mirror.visible = true;
    if (this.landmarks) { this.landmarks.near.visible = this.quality === 'hq' && C.rich > 0; this.landmarks.mesh.visible = !this.landmarks.near.visible; this.landmarks.mirror.visible = near > 0 && C.mirrors >= 4; }
    if (changed && this.imp) this.impAttr.needsUpdate = true;
    this.lodDirty = false;
  }

  /** Per-building state: dim(i) (search), today(i) 0 / 1 armed / 2 fired, mark(i) 0 / 1 watched / 2 selected. */
  apply(dim, today, mark) {
    const L = this.L, agg = this.imp ? new Float32Array(L.blocks.length * 3) : null;      // block: today max, dim count
    for (const rec of this.meshes) {
      const data = rec.mesh.geometry.getAttribute('aData'), st = rec.mesh.geometry.getAttribute('aState');
      rec.list.forEach((i, k) => {
        const dm = dim ? (dim(i) ? 1 : 0) : 0, td = today(i), mk = mark(i);
        data.array[k * 4 + 3] = dm;
        st.array[k * 4] = td; st.array[k * 4 + 1] = mk;
        const b = L.items[i].block;
        if (agg && b >= 0) { agg[b * 3] = Math.max(agg[b * 3], td); agg[b * 3 + 1] += dm; agg[b * 3 + 2]++; }
      });
      data.needsUpdate = true; st.needsUpdate = true;
    }
    if (agg) {
      for (let b = 0; b < L.blocks.length; b++) {
        this.impMeta[b * 4 + 1] = agg[b * 3];
        this.impMeta[b * 4 + 2] = agg[b * 3 + 2] && agg[b * 3 + 1] === agg[b * 3 + 2] ? 1 : 0;
      }
      this.impAttr.needsUpdate = true;
    }
  }

  /** The building (or far block) under a ray: { item } / { block } / null. */
  pick(ray) {
    const vis = this.meshes.flatMap((r) => [r.mesh, r.near]).filter((m) => m.visible);
    const hit = ray.intersectObjects(vis, false)[0];
    let best = hit ? { item: this.meshes[hit.object.userData.rec].list[hit.instanceId], distance: hit.distance } : null;
    if (this.imp) {
      for (const h of ray.intersectObject(this.imp, false)) {
        if (this.impMeta[h.instanceId * 4 + 3] < 0.5) continue;          // that block is drawn in full right now
        if (!best || h.distance < best.distance) best = { block: h.instanceId, distance: h.distance };
        break;
      }
    }
    return best;
  }

  /** The timeline: scale(i) -> 0..1 height of item i (1 = as it stands now); written when it changes, never per frame. */
  setScales(scale) {
    for (const rec of this.meshes) {
      const st = rec.mesh.geometry.getAttribute('aState');
      rec.list.forEach((i, k) => { st.array[k * 4 + 2] = scale ? scale(i) : 1; });
      st.needsUpdate = true;
    }
  }

  /** The timeline for some buildings only: entries [[item, scale]]; only the tiles they live in are re-sent. */
  scaleItems(entries) {
    const dirty = new Set();
    for (const [i, v] of entries) {
      const w = this.where[i * 2], k = this.where[i * 2 + 1];
      if (w < 0) continue;
      this.meshes[w].mesh.geometry.getAttribute('aState').array[k * 4 + 2] = v;
      dirty.add(w);
    }
    for (const w of dirty) this.meshes[w].mesh.geometry.getAttribute('aState').needsUpdate = true;
  }

  /** A celebration glow on one building (fireworks over a gold idea), 0..1. */
  flash(i, v) {
    const w = this.where[i * 2], k = this.where[i * 2 + 1];
    if (w < 0) return;
    const st = this.meshes[w].mesh.geometry.getAttribute('aState');
    st.array[k * 4 + 3] = v;
    st.needsUpdate = true;
  }

  /** What the camera sees now: tiles in full, impostor blocks shown (for the HUD and the tests). */
  info() {
    const full = this.tiles.filter((r) => r.detail).length;
    let blocks = 0;
    if (this.imp) for (let b = 0; b < this.L.blocks.length; b++) blocks += this.impMeta[b * 4 + 3] > 0.5 ? 1 : 0;
    return { tiles: this.tiles.length, tilesFull: full, blocks: this.L.blocks.length, impostors: blocks,
             mirrors: this.meshes.filter((r) => r.mirror.visible).length };
  }
}

export function pick(U, ...names) { return Object.fromEntries(names.map((n) => [n, U[n]])); }
