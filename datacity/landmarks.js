// The Data City's landmarks, Greek-futuristic, drawn with the OLYMPUS render core's physically based materials (marble with
// gold seams, brushed gold, holographic glass, neon that blooms) and lit by three real lights (sun, moon, a hearth) plus the
// core's environment. All instanced or merged: about a dozen draw calls in total.
//   TEMPLE      a peripteral temple on a terraced acropolis west of the city, a hologram oracle and a sky beam over it
//   FORUM       a colonnade round the plaza (the gaps are the boulevards), a gold entablature ring, the four heralds
//   PHAROS      the harbor's lighthouse with two sweeping beams, and the GATE OF POSEIDON (its lantern is the weather: colour
//               and pulse from the VIX), both on the quay
//   GATES       a propylon (two columns, a gold lintel, a neon bar in the district's colour) where each boulevard enters a district
// Every landmark has an invisible proxy volume for taps: pick(ray) -> { key } (city.js opens its card with real stats).
// No DOM. Decor only: nothing here is data except what the cards read.
import * as THREE from '../jarvis/three.module.min.js';
import { marble, metal, glass, neon, fresnelRim } from '../olympus/materials.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const TAU = Math.PI * 2;
const cache = new Map();

/** brushed gold with a warm self-glow, so it reads as gold even in the dark (the night environment is dim) */
function gold() {
  const m = metal({ kind: 'gold', color: (NEON ? '#ffd98a' : '#dcaa78'), envMapIntensity: 3.4, roughness: 0.24 });
  m.emissive = new THREE.Color((NEON ? '#8a5410' : '#af6f2d')); m.emissiveIntensity = 0.55;
  return m;
}

/** one geometry per key: the landmarks share them (and dispose them once) */
function geo(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

function inst(g, m, mats, shadowless = true) {
  const mesh = new THREE.InstancedMesh(g, m, mats.length);
  mats.forEach((mx, i) => mesh.setMatrixAt(i, mx));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  void shadowless;
  return mesh;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const at = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => M4.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, ry), S.set(sx, sy, sz)).clone();

/** a hidden proxy volume the taps hit (three's raycaster ignores `visible`, so it costs no draw) */
function proxy(geometry, key, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  m.position.set(x, y, z); m.rotation.y = ry; m.visible = false; m.userData.landmark = key;
  m.updateMatrixWorld(true);
  return m;
}

export class Landmarks {
  /** L: layout(); quality 'hq' | 'lq' */
  constructor(L, quality) {
    this.L = L;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    this.proxies = [];
    this.spots = {};                                 // key -> { x, z, r, h, name } for the camera and the cards
    this.neons = [];                                 // { mat, base, day } glow materials dimmed by daylight
    this.spin = [];
    this.lights = {};
    this.quality = quality;
    const b = L.bounds, spanZ = b.z1 - b.z0;
    this.site = { x: b.x0 - 135, z: b.z0 + spanZ * 0.62 };            // the acropolis, west of the city, the harbor's side
    this._lights();
    this._acropolis();
    this._forum();
    this._harbor();
    this._gates();
    this.envMats = [];
    this.group.traverse((o) => { if (o.material && o.material.envMapIntensity !== undefined) this.envMats.push(o.material); });
    this.merged = /[?&]nomerge/.test(location.search) ? { before: 0, after: 0 } : this._mergeStatic();        // ?nomerge=1: the unmerged landmarks (A/B checks)
  }

  /** Static merge (v3 perf): every landmark mesh that never moves is baked into ONE mesh per material (and per container: the temple, the Pharos
   *  and the rest, so the phone profile can still hide the first two). Instanced columns are baked instance by instance. Kept as they are: the
   *  animated parts (oracle, turning rings, sweeping beams, bobbing lamps), per-instance colours (the gate bars), hidden meshes and the invisible
   *  tap proxies. Returns { before, after } draw-call counts for the tests. */
  _mergeStatic() {
    const keep = new Set([this.oracle, ...(this.rings || []), ...(this.lamps || []), this.gateBars].filter(Boolean));
    const frozen = (o) => { for (let v = o; v; v = v.parent) if (keep.has(v) || v === this.sweep || v.userData?.landmark || v.isLight) return true; return false; };
    const roots = [this.templeG, this.pharosG].filter(Boolean), done = new Set(roots);
    const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), m = new THREE.Matrix4();
    this.group.updateMatrixWorld(true);
    let before = 0, after = 0;
    const run = (root, skipRoots) => {
      const buckets = new Map();
      root.traverse((o) => {
        if (!(o.isMesh) || o.parent === null || frozen(o) || !o.visible) return;
        for (let v = o; v && v !== root; v = v.parent) if (skipRoots.has(v)) return;
        const mat = o.material, g = o.geometry;
        if (Array.isArray(mat) || !g.attributes.position || !g.attributes.normal || !g.attributes.uv || o.isSkinnedMesh) return;
        const key = mat.uuid + '|' + o.renderOrder;
        if (!buckets.has(key)) buckets.set(key, { mat, order: o.renderOrder, list: [] });
        buckets.get(key).list.push(o);
      });
      inv.copy(root.matrixWorld).invert();
      for (const { mat, order, list } of buckets.values()) {
        const pos = [], nor = [], uv = [], idx = [];
        let n = 0;
        const add = (geom, matrix) => {
          const g = geom.clone();
          g.applyMatrix4(matrix);
          const base = pos.length / 3, count = g.attributes.position.count;
          pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
          if (g.index) for (const i of g.index.array) idx.push(base + i); else for (let i = 0; i < count; i++) idx.push(base + i);
          g.dispose();
          n++;
        };
        for (const o of list) {
          rel.multiplyMatrices(inv, o.matrixWorld);
          if (o.isInstancedMesh) {
            if (o.instanceColor) { n = -1; break; }
            for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m); add(o.geometry, new THREE.Matrix4().multiplyMatrices(rel, m)); }
          } else add(o.geometry, rel);
        }
        if (n < 0 || list.length < 2 && !list[0].isInstancedMesh) continue;
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        out.setIndex(idx);
        const mesh = new THREE.Mesh(out, mat);
        mesh.renderOrder = order; mesh.userData.merged = list.length;
        before += list.length; after++;
        root.add(mesh);
        for (const o of list) o.parent.remove(o);
      }
    };
    for (const r of roots) run(r, new Set());
    run(this.group, done);
    return { before, after };
  }

  _lights() {
    const g = this.group;
    this.lights.sun = new THREE.DirectionalLight((NEON ? 0xfff0d8 : 0xe4be97), 0);
    this.lights.moon = new THREE.DirectionalLight((NEON ? 0x8fa8ff : 0x99b8d0), 0.5);
    this.lights.hemi = new THREE.HemisphereLight((NEON ? 0x9bb4ff : 0x9dbbd2), 0x20182e, 0.5);
    this.lights.hearth = new THREE.PointLight((NEON ? 0xffc36a : 0xd9a26b), 40, 90, 1.6);             // the temple's inner fire
    g.add(this.lights.sun, this.lights.moon, this.lights.hemi, this.lights.hearth);
    g.add(this.lights.sun.target, this.lights.moon.target);
  }

  _neon(color, k) {
    const m = neon({ color, intensity: k });
    this.neons.push({ mat: m, base: new THREE.Color(color).multiplyScalar(k) });
    return m;
  }

  // ------------------------------------------------------------------------------------------------ the temple
  _acropolis() {
    const { x, z } = this.site, g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z) * 0 + 0.55;                      // the front turns toward the city's middle
    const rock = new THREE.MeshStandardMaterial({ color: 0x4a4468, roughness: 0.9, metalness: 0.05, envMapIntensity: 0.6 });
    fresnelRim(rock, { color: (NEON ? '#8a6bff' : '#8cafca'), strength: 0.35, power: 3 });
    const terr = [[64, 76, 9, 0], [50, 62, 8, 9], [40, 50, 8, 17]];      // [top r, bottom r, height, y]
    for (const [rt, rb, h, y] of terr) {
      const m = new THREE.Mesh(geo(`terr${rt}`, () => new THREE.CylinderGeometry(rt, rb, h, 40, 1)), rock);
      m.position.y = y + h / 2; g.add(m);
    }
    const Y = 25;                                                       // the plateau
    const stone = marble({ gold: true, scale: 0.6 }), pale = marble({ gold: false, scale: 0.9, color: '#dcd8cf' });
    const goldM = gold();
    // steps and stylobate
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo(`step${i}`, () => new THREE.BoxGeometry(60 - i * 3, 0.9, 34 - i * 3)), pale);
      m.position.y = Y + 0.45 + i * 0.9; g.add(m);
    }
    const Yb = Y + 2.7, CH = 15;
    // the colonnade: 8 x 5, doric (a tapering shaft, 16 flutes' worth of facets)
    const shaft = geo('shaft', () => { const c = new THREE.CylinderGeometry(1.15, 1.45, CH, 16, 1); c.translate(0, CH / 2, 0); return c; });
    const cap = geo('cap', () => new THREE.BoxGeometry(3.6, 0.9, 3.6));
    const cols = [], caps = [], W = 25.5, D = 12.5;
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { const px = -W + (i * 2 * W) / 7; cols.push(at(px, Yb, s * D)); caps.push(at(px, Yb + CH + 0.45, s * D)); }
    for (let i = 1; i < 5; i++) for (const s of [-1, 1]) { const pz = -D + (i * 2 * D) / 5; cols.push(at(s * W, Yb, pz)); caps.push(at(s * W, Yb + CH + 0.45, pz)); }
    g.add(inst(shaft, stone, cols), inst(cap, pale, caps));
    // the cella (the inner hall) with a glowing doorway and window strips
    const cella = new THREE.Mesh(geo('cella', () => new THREE.BoxGeometry(38, CH - 1, 15)), stone);
    cella.position.y = Yb + (CH - 1) / 2; g.add(cella);
    const warm = this._neon((NEON ? '#ffc36a' : '#d9a26b'), 1.15);
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(geo('door', () => new THREE.BoxGeometry(0.25, 8, 5)), warm);
      d.position.set(sx * 19.1, Yb + 4.2, 0); g.add(d);
    }
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(geo('win', () => new THREE.BoxGeometry(2.2, 5, 0.2)), warm);
      w.position.set(-12 + i * 6, Yb + 7, s * 7.55); g.add(w);
    }
    // entablature, gold frieze, pediments, the roof
    const ent = new THREE.Mesh(geo('ent', () => new THREE.BoxGeometry(58, 2.6, 30)), pale);
    ent.position.y = Yb + CH + 1.3 + 0.4; g.add(ent);
    const frieze = new THREE.Mesh(geo('frz', () => new THREE.BoxGeometry(58.4, 0.7, 30.4)), goldM);
    frieze.position.y = Yb + CH + 2.9 + 0.4; g.add(frieze);
    const tri = geo('ped', () => {
      const sh = new THREE.Shape(); sh.moveTo(-29, 0); sh.lineTo(29, 0); sh.lineTo(0, 7.5); sh.closePath();
      const e = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false }); e.translate(0, 0, -0.8); return e;
    });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(tri, pale); p.position.set(0, Yb + CH + 3.3 + 0.4, s * 14.6); g.add(p);
      const inl = new THREE.Mesh(geo('inlay', () => new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-23, 0.4); sh.lineTo(23, 0.4); sh.lineTo(0, 5.6); sh.closePath(); return sh; })())), this._neon((NEON ? '#7fe9ff' : '#daa56f'), 1.1));
      inl.position.set(0, Yb + CH + 3.3 + 0.4, s * 15.5); if (s < 0) inl.rotation.y = Math.PI; g.add(inl);
    }
    const roof = new THREE.Mesh(geo('roof', () => { const e = new THREE.CylinderGeometry(0.1, 1, 1, 4, 1); return e; }), pale);
    roof.scale.set(0.1, 0.1, 0.1); roof.visible = false; g.add(roof);
    const slab = new THREE.Mesh(geo('slab', () => new THREE.BoxGeometry(50, 0.8, 26)), goldM);
    slab.position.y = Yb + CH + 3.7 + 0.4 + 3.4; slab.rotation.z = 0; g.add(slab);
    // the oracle: a hologram prism over the roof, gold rings that turn, a beam into the sky
    const holo = new THREE.Mesh(geo('oracle', () => new THREE.OctahedronGeometry(5.2, 0)), glass({ rim: (NEON ? '#7fe9ff' : '#daa56f'), opacity: 0.35 }));
    holo.scale.y = 1.9; holo.position.y = Yb + CH + 22; g.add(holo);
    const ringGeo = geo('oring', () => new THREE.TorusGeometry(1, 0.07, 8, 64));
    this.rings = [];
    [[9, 0], [12.5, 1.1], [16, 2.2]].forEach(([r, ph], i) => {
      const m = new THREE.Mesh(ringGeo, i === 1 ? this._neon((NEON ? '#ffd36b' : '#d79e64'), 1.2) : goldM);
      m.scale.set(r, r, r); m.position.y = Yb + CH + 22; m.rotation.x = Math.PI / 2 + ph * 0.2; m.userData.ph = ph; g.add(m); this.rings.push(m);
    });
    const beamG = geo('tbeam', () => { const c = new THREE.CylinderGeometry(1.4, 6, 420, 16, 1, true); c.translate(0, 210, 0); return c; });
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color((NEON ? '#ffd98a' : '#dcaa78')).multiplyScalar(1.0), transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(beamG, this.beamMat); beam.position.y = Yb + CH + 10; g.add(beam);
    this.oracle = holo;
    this.lights.hearth.position.set(x, Yb + 7, z);
    this.templeG = g;
    this.group.add(g);
    this.temple = g;
    this.spots.temple = { x, z, r: 78, h: Yb + CH + 22, name: 'Temple of the Gold' };
    const hit = proxy(new THREE.CylinderGeometry(58, 70, Yb + CH + 14, 12), 'temple', x, (Yb + CH + 14) / 2, z);
    this.proxies.push(hit);
    this.group.add(hit);
  }

  /** ONE set of materials for the forum, the quay and the district gates (2026-11-17): they were made per landmark (three golds, three
   *  stones), so the static merge (one mesh per material) could not join them and the phone's far overview paid ~4 draw calls for it */
  _civic() {
    return this.civic || (this.civic = { stone: marble({ gold: true, scale: 1.2 }), pale: marble({ gold: false, color: '#dcd8cf', scale: 1.1 }), gold: gold() });
  }

  // ------------------------------------------------------------------------------------------------ the forum
  _forum() {
    const R = 31.5, N = 56, CH = 6.2;
    const gaps = this.L.districts.filter((d) => d.kind !== 'harbor').map((d) => Math.atan2(d.cz, d.cx));
    const keep = (a) => !gaps.some((q) => Math.abs(Math.atan2(Math.sin(a - q), Math.cos(a - q))) < 0.1);
    const stone = this._civic().stone, pale = this._civic().pale;
    const shaft = geo('fshaft', () => { const c = new THREE.CylinderGeometry(0.5, 0.62, CH, 12, 1); c.translate(0, CH / 2, 0); return c; });
    const base = geo('fbase', () => new THREE.BoxGeometry(1.7, 0.4, 1.7)), cap = geo('fcap', () => new THREE.BoxGeometry(1.8, 0.5, 1.8));
    const cols = [], bases = [], caps = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + 0.05;
      if (!keep(a)) continue;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      cols.push(at(x, 0.4, z)); bases.push(at(x, 0.2, z, -a)); caps.push(at(x, CH + 0.65, z, -a));
    }
    this.group.add(inst(shaft, stone, cols), inst(base, pale, bases), inst(cap, pale, caps));
    // a gold entablature ring, a neon band under it, a pale floor ring
    const ring = new THREE.Mesh(geo('fring', () => { const t = new THREE.TorusGeometry(R, 0.55, 8, 96); t.rotateX(Math.PI / 2); return t; }), this._civic().gold);
    ring.position.y = CH + 1.35; this.group.add(ring);
    const band = new THREE.Mesh(geo('fband', () => { const t = new THREE.TorusGeometry(R, 0.12, 6, 96); t.rotateX(Math.PI / 2); return t; }), this._neon((NEON ? '#7fe9ff' : '#daa56f'), 1.2));
    band.position.y = CH + 0.7; this.group.add(band);
    const floor = new THREE.Mesh(geo('ffloor', () => { const t = new THREE.RingGeometry(R - 1.6, R + 1.6, 96, 1); t.rotateX(-Math.PI / 2); return t; }), pale);
    floor.position.y = 0.06; this.group.add(floor);
    // the heralds: four gold pylons with a slow lantern, at the compass points inside the colonnade
    const lamp = geo('lamp', () => new THREE.OctahedronGeometry(0.9, 0));
    const hmat = metal({ kind: 'chrome' }), pyl = geo('pyl', () => { const c = new THREE.CylinderGeometry(0.28, 0.6, 5.4, 8, 1); c.translate(0, 2.7, 0); return c; });
    const lm = this._neon((NEON ? '#ffd36b' : '#d79e64'), 1.3);
    this.lamps = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, x = Math.cos(a) * 24, z = Math.sin(a) * 24;
      const p = new THREE.Mesh(pyl, hmat); p.position.set(x, 0, z); this.group.add(p);
      const l = new THREE.Mesh(lamp, lm); l.position.set(x, 6.4, z); this.group.add(l); this.lamps.push(l);
    }
    this.spots.forum = { x: 0, z: 0, r: 70, h: 8, name: 'The Forum' };
    const hit = proxy(new THREE.CylinderGeometry(33.5, 33.5, 8, 24, 1, true), 'forum', 0, 4, 0);
    hit.material.side = THREE.DoubleSide;
    this.proxies.push(hit);
    this.group.add(hit);
  }

  // ------------------------------------------------------------------------------------------------ the quay
  _harbor() {
    const h = this.L.harbor;
    if (!h) return;
    const { stone, gold: goldM, pale } = this._civic();
    // the Pharos: a tapering tower in three stages, a glass lantern, two sweeping beams
    const px = h.x1 - 12, pz = h.z0 - 7, g = new THREE.Group();
    g.position.set(px, 0, pz);
    const stages = [[7.5, 5.8, 22, 0], [5.4, 4.2, 17, 22], [3.8, 3, 12, 39]];
    for (const [rt, rb, ht, y] of stages) {
      const m = new THREE.Mesh(geo(`ph${rt}`, () => new THREE.CylinderGeometry(rt * 0.62, rb * 0.62, ht, 12, 1)), stone);
      m.position.y = y + ht / 2; g.add(m);
      const c = new THREE.Mesh(geo(`pc${rt}`, () => new THREE.CylinderGeometry(rt * 0.62 + 0.4, rt * 0.62 + 0.4, 0.8, 12)), goldM);
      c.position.y = y + ht + 0.1; g.add(c);
    }
    const base = new THREE.Mesh(geo('phb', () => new THREE.BoxGeometry(16, 3, 16)), pale); base.position.y = 1.5; g.add(base);
    const lantern = new THREE.Mesh(geo('lan', () => new THREE.CylinderGeometry(2.1, 2.1, 5, 12)), glass({ rim: (NEON ? '#ffd98a' : '#dcaa78'), opacity: 0.5 }));
    lantern.position.y = 54.6; g.add(lantern);
    const core = new THREE.Mesh(geo('core', () => new THREE.SphereGeometry(1.25, 14, 10)), this._neon((NEON ? '#fff0c0' : '#e5cd93'), 1.5));
    core.position.y = 54.6; g.add(core);
    const roof = new THREE.Mesh(geo('lroof', () => new THREE.ConeGeometry(2.8, 3.4, 12)), goldM); roof.position.y = 58.8; g.add(roof);
    this.sweep = new THREE.Group(); this.sweep.position.y = 54.6; g.add(this.sweep);
    this.sweepMat = new THREE.MeshBasicMaterial({ color: new THREE.Color((NEON ? '#ffe2a0' : '#deb081')).multiplyScalar(1.0), transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const sg = geo('sweep', () => { const c = new THREE.ConeGeometry(7, 190, 14, 1, true); c.rotateZ(-Math.PI / 2); c.translate(95, 0, 0); return c; });
    for (const a of [0, Math.PI]) { const b = new THREE.Mesh(sg, this.sweepMat); b.rotation.y = a; this.sweep.add(b); }
    this.pharosG = g;
    this.group.add(g);
    this.lights.pharos = new THREE.PointLight((NEON ? 0xffd98a : 0xdcaa78), 30, 70, 1.6);
    this.lights.pharos.position.set(px, 54.6, pz);
    this.group.add(this.lights.pharos);
    this.spots.pharos = { x: px, z: pz, r: 70, h: 60, name: 'Pharos' };
    const hit = proxy(new THREE.CylinderGeometry(7, 9, 62, 10), 'pharos', px, 31, pz);
    this.proxies.push(hit); this.group.add(hit);

    // the Gate of Poseidon (the weather gate): two pylons, a lintel, a trident whose lantern is the VIX
    const gx = h.x0 + 18, gz = h.z0 - 7, gg = new THREE.Group();
    gg.position.set(gx, 0, gz);
    const pylon = geo('pyl2', () => { const c = new THREE.CylinderGeometry(1.6, 2.1, 22, 12, 1); c.translate(0, 11, 0); return c; });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(pylon, stone); p.position.x = s * 9; gg.add(p); }
    const lin = new THREE.Mesh(geo('lin2', () => new THREE.BoxGeometry(22, 2.2, 3.2)), goldM); lin.position.y = 23; gg.add(lin);
    this.vixMat = neon({ color: (NEON ? '#7fe9ff' : '#daa56f'), intensity: 1.2 });
    const arch = new THREE.Mesh(geo('arch2', () => { const t = new THREE.TorusGeometry(7.2, 0.28, 8, 40, Math.PI); return t; }), this.vixMat);
    arch.position.y = 21.8; gg.add(arch);
    const tri = new THREE.Group();
    const pole = new THREE.Mesh(geo('tpole', () => { const c = new THREE.CylinderGeometry(0.22, 0.22, 11, 8, 1); c.translate(0, 5.5, 0); return c; }), goldM); tri.add(pole);
    for (const s of [-1, 0, 1]) { const t = new THREE.Mesh(geo('tprong', () => new THREE.ConeGeometry(0.34, 3.2, 8)), this.vixMat); t.position.set(s * 1.5, 12.2 + (s === 0 ? 0.8 : 0), 0); tri.add(t); }
    const prongBar = new THREE.Mesh(geo('tbar', () => new THREE.BoxGeometry(3.4, 0.28, 0.28)), goldM); prongBar.position.y = 11; tri.add(prongBar);
    tri.position.y = 24; gg.add(tri);
    this.group.add(gg);
    this.spots.poseidon = { x: gx, z: gz, r: 48, h: 26, name: 'Gate of Poseidon' };
    const hit2 = proxy(new THREE.BoxGeometry(24, 36, 8), 'poseidon', gx, 18, gz);
    this.proxies.push(hit2); this.group.add(hit2);
  }

  // ------------------------------------------------------------------------------------------------ district gates
  _gates() {
    const ds = this.L.districts.filter((d) => d.kind !== 'harbor');
    if (!ds.length) return;
    const { stone, gold: goldM } = this._civic();
    const col = geo('gcol', () => { const c = new THREE.CylinderGeometry(0.75, 0.95, 13, 12, 1); c.translate(0, 6.5, 0); return c; });
    const lin = geo('glin', () => new THREE.BoxGeometry(14, 1.1, 1.8));
    const bar = geo('gbar', () => new THREE.BoxGeometry(12.4, 0.5, 0.3));
    const cs = [], ls = [], bs = [], colors = [];
    ds.forEach((d) => {
      const len = Math.hypot(d.cx, d.cz) || 1, ux = -d.cx / len, uz = -d.cz / len;          // toward the plaza
      const edge = d.half / Math.max(Math.abs(ux), Math.abs(uz), 0.2) + 4.5;
      const x = d.cx + ux * edge, z = d.cz + uz * edge, ry = Math.atan2(ux, uz) + Math.PI / 2 * 0;
      const px = -uz, pz = ux;                                                               // across the boulevard
      cs.push(at(x + px * 6.4, 0, z + pz * 6.4, ry), at(x - px * 6.4, 0, z - pz * 6.4, ry));
      ls.push(at(x, 13.2, z, ry + Math.PI / 2)); bs.push(at(x, 12.4, z, ry + Math.PI / 2));
      colors.push(new THREE.Color(d.color));
      this.spots['gate:' + d.key] = { x, z, r: 40, h: 12, name: d.name + ' gate' };
    });
    this.group.add(inst(col, stone, cs), inst(lin, goldM, ls));
    const nm = neon({ color: '#ffffff', intensity: 1.3 });
    const bm = inst(bar, nm, bs);
    colors.forEach((c, i) => bm.setColorAt(i, c));
    bm.instanceColor.needsUpdate = true;
    this.group.add(bm);
    this.gateBars = bm;
    this.neons.push({ mat: nm, base: new THREE.Color(1, 1, 1).multiplyScalar(1.3) });
    // one proxy per gate (a box across the boulevard)
    for (const d of ds) {
      const s = this.spots['gate:' + d.key];
      const len = Math.hypot(d.cx, d.cz) || 1, ry = Math.atan2(-d.cx / len, -d.cz / len);
      const p = proxy(new THREE.BoxGeometry(15, 14, 3), 'gate:' + d.key, s.x, 7, s.z, ry + Math.PI / 2);
      this.proxies.push(p); this.group.add(p);
    }
  }

  setQuality(q) { this.quality = q; this.lights.hearth.visible = q === 'hq'; if (this.lights.pharos) this.lights.pharos.visible = q === 'hq'; }

  /** sun: sky.sunOf(); w: sky.weatherOf(); U: the scene's uniforms (uSun) */
  setSun(sun, w, U) {
    const L = this.lights, day = sun.day, night = 1 - day, dusk = sun.dusk, cloud = w.storm ? 0.6 : w.rain > 0 ? 0.35 : w.haze * 0.3;
    L.sun.position.copy(U.uSun.value).multiplyScalar(300);
    L.sun.color.setRGB(1, 0.86 + 0.14 * day - dusk * 0.2, 0.7 + 0.3 * day - dusk * 0.3);
    L.sun.intensity = (0.3 + 1.1 * day + 0.9 * dusk) * (1 - cloud);
    L.moon.position.set(-U.uSun.value.x * 200, 220, -U.uSun.value.z * 200 + 60);
    L.moon.intensity = 0.15 + 0.85 * night * (1 - cloud * 0.7);
    L.hemi.intensity = 0.3 + 0.3 * day + 0.1 * dusk;
    L.hemi.color.setRGB(0.55 + 0.1 * day, 0.66 + 0.1 * day, 1);
    L.hearth.intensity = 26 + 40 * night;
    if (L.pharos) L.pharos.intensity = 14 + 40 * night;
    const dim = 1 - day * 0.55;                                       // neon is for the night; by day it is a trim
    for (const n of this.neons) n.mat.color.copy(n.base).multiplyScalar(dim);
    for (const m of this.envMats) { m.userData.envBase ??= m.envMapIntensity; m.envMapIntensity = m.userData.envBase * (0.7 + 0.35 * day); }
    if (this.beamMat) this.beamMat.opacity = (0.06 + 0.2 * night + 0.1 * dusk) * (w.storm ? 0.6 : 1);
    if (this.sweepMat) this.sweepMat.opacity = 0.05 + 0.35 * night * (1 - cloud * 0.4);
    // the weather gate: the VIX's colour and pulse rate
    const vix = w.vix ?? 16, c = vix < 15 ? [0.3, 0.85, 1] : vix < 20 ? [1, 0.75, 0.3] : vix < 25 ? [0.35, 0.5, 1] : [1, 0.25, 0.3];
    this.vixBase = c; this.vixRate = 0.8 + Math.max(0, vix - 12) * 0.12;
  }

  /** the phone profile hides the temple and the Pharos (about 30 draw calls each) when the camera is further than C.lmLod */
  lod(p, C) {
    this.heralds ||= this.group.children.filter((o) => o.isMesh && o.geometry?.type === 'OctahedronGeometry' && o !== this.oracle);
    const hi = C.farAlt > 0 && p.y > C.farAlt;
    for (const h of this.heralds) h.visible = !hi;
    const far = (S) => S && C.lmLod > 0 && Math.hypot(p.x - S.x, p.z - S.z) > C.lmLod;
    if (this.templeG) this.templeG.visible = !far(this.spots.temple);
    if (this.pharosG) this.pharosG.visible = !far(this.spots.pharos);
  }

  update(t) {
    if (this.rings) this.rings.forEach((r, i) => { r.rotation.z = t * (0.3 + i * 0.17); r.rotation.x = Math.PI / 2 + Math.sin(t * 0.4 + i) * 0.35; });
    if (this.oracle) { this.oracle.rotation.y = t * 0.5; this.oracle.position.y += Math.sin(t * 1.2) * 0.003; }
    if (this.sweep) this.sweep.rotation.y = t * 0.7;
    if (this.lamps) this.lamps.forEach((l, i) => { l.rotation.y = t * 0.8 + i; l.position.y = 6.4 + Math.sin(t * 1.5 + i) * 0.25; });
    if (this.vixMat && this.vixBase) {
      const p = 0.75 + 0.35 * Math.sin(t * this.vixRate * 3), k = 1.15 * p;
      this.vixMat.color.setRGB(this.vixBase[0] * k, this.vixBase[1] * k, this.vixBase[2] * k);
    }
  }

  /** the landmark under a ray: { key, distance } or null */
  pick(ray) {
    const h = ray.intersectObjects(this.proxies, false)[0];
    return h ? { key: h.object.userData.landmark, distance: h.distance } : null;
  }
}
