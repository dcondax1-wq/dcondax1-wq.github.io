// The landmarks of the Cities hub: 14 small hand-built monuments (3 to 9 meshes each), chosen by a city spec's landmark.kind.
// PBR parts (the render core's night environment reflects in them) plus additive beams. Everything is sized by `u` (one unit of
// the city's pitch), built once per city and disposed with it. userData.spin lists the parts that turn.
import * as THREE from '../jarvis/three.module.min.js';

const std = (color, em = 0, emI = 0, metal = 0.7, rough = 0.28) => new THREE.MeshStandardMaterial({ color, emissive: em || color, emissiveIntensity: emI, metalness: metal, roughness: rough });
const beamMat = (color, o = 0.22) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
const dark = (c) => new THREE.Color(c).multiplyScalar(0.16);

function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
/** repeated parts (columns, spokes, beads) are ONE instanced draw: items = [{ p, r?, s?, c? }] */
function inst(geo, mat, items) {
  const m = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D();
  items.forEach((it, i) => {
    d.position.set(...it.p); d.rotation.set(...(it.r || [0, 0, 0])); d.scale.set(...(it.s || [1, 1, 1])); d.updateMatrix();
    m.setMatrixAt(i, d.matrix); if (it.c) m.setColorAt(i, it.c);
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return m;
}

const BUILDERS = {
  obelisk(g, u, c, add) {
    add(mesh(new THREE.BoxGeometry(2.4 * u, 0.5 * u, 2.4 * u), std(dark(c), c, 0.15), 0, 0.25 * u, 0));
    add(mesh(new THREE.CylinderGeometry(0.28 * u, 0.7 * u, 5.4 * u, 4), std(dark(c), c, 0.35, 0.85, 0.2), 0, 3.2 * u, 0)).rotation.y = Math.PI / 4;
    const tip = add(mesh(new THREE.ConeGeometry(0.28 * u, 0.9 * u, 4), std(c, c, 2.2, 0.2, 0.3), 0, 6.35 * u, 0)); tip.rotation.y = Math.PI / 4;
    add(mesh(new THREE.CylinderGeometry(0.06 * u, 0.5 * u, 14 * u, 12, 1, true), beamMat(c, 0.07), 0, 13 * u, 0));
  },
  beacon(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(0.35 * u, 0.65 * u, 4.6 * u, 10), std(dark(c), c, 0.25), 0, 2.3 * u, 0));
    add(mesh(new THREE.CylinderGeometry(0.75 * u, 0.5 * u, 0.5 * u, 10), std(dark(c), c, 0.6), 0, 4.85 * u, 0));
    add(mesh(new THREE.SphereGeometry(0.62 * u, 16, 12), std(c, c, 3, 0.1, 0.2), 0, 5.55 * u, 0));
    add(mesh(new THREE.ConeGeometry(2.2 * u, 22 * u, 20, 1, true), beamMat(c, 0.06), 0, 17 * u, 0)).rotation.x = Math.PI;
    const r = add(mesh(new THREE.TorusGeometry(1.5 * u, 0.06 * u, 8, 40), beamMat(c, 0.7), 0, 5.55 * u, 0)); r.rotation.x = Math.PI / 2; g.userData.spin.push([r, 0.8, 'z']);
  },
  ring(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(0.7 * u, 1.1 * u, 1.2 * u, 12), std(dark(c), c, 0.3), 0, 0.6 * u, 0));
    [[2.4, 0.9, 0.0], [3.2, 0.7, 0.9], [4.0, 0.6, 2.0]].forEach(([r, sp, tilt], i) => {
      const t = add(mesh(new THREE.TorusGeometry(r * u, 0.11 * u, 10, 64), std(c, c, 1.6 + i * 0.3, 0.9, 0.2), 0, 4.2 * u, 0));
      t.rotation.set(Math.PI / 2 + tilt * 0.35, 0, tilt); g.userData.spin.push([t, sp * (i % 2 ? -1 : 1), 'z']);
    });
    add(mesh(new THREE.IcosahedronGeometry(0.7 * u, 1), std(c, c, 2.6, 0.2, 0.2), 0, 4.2 * u, 0));
  },
  pyramid(g, u, c, add) {
    for (let i = 0; i < 4; i++) add(mesh(new THREE.BoxGeometry((5 - i * 1.1) * u, 0.9 * u, (5 - i * 1.1) * u), std(dark(c), c, 0.2 + i * 0.12, 0.8, 0.3), 0, (0.45 + i * 0.9) * u, 0));
    const cap = add(mesh(new THREE.OctahedronGeometry(0.85 * u), std(c, c, 2.6, 0.3, 0.2), 0, 5.2 * u, 0)); g.userData.spin.push([cap, 0.9, 'y']);
    add(mesh(new THREE.CylinderGeometry(0.04 * u, 0.4 * u, 12 * u, 10, 1, true), beamMat(c, 0.12), 0, 11 * u, 0));
  },
  dome(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(3.6 * u, 3.8 * u, 0.5 * u, 32), std(dark(c), c, 0.15), 0, 0.25 * u, 0));
    add(inst(new THREE.CylinderGeometry(0.18 * u, 0.22 * u, 2.4 * u, 10), std(0xe8e6f0, c, 0.12, 0.2, 0.5), Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return { p: [Math.cos(a) * 3.1 * u, 1.7 * u, Math.sin(a) * 3.1 * u] }; })));
    add(mesh(new THREE.CylinderGeometry(3.5 * u, 3.5 * u, 0.3 * u, 32), std(dark(c), c, 0.2), 0, 3 * u, 0));
    add(mesh(new THREE.SphereGeometry(3.2 * u, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(c, c, 0.55, 0.9, 0.18), 0, 3.1 * u, 0));
    add(mesh(new THREE.SphereGeometry(0.35 * u, 12, 10), std(c, c, 3), 0, 6.5 * u, 0));
  },
  tree(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(0.4 * u, 0.8 * u, 3.2 * u, 8), std(0x2a1d14, c, 0.1, 0.1, 0.8), 0, 1.6 * u, 0));
    [[2.9, 2.6, 3.2], [2.3, 2.3, 5.1], [1.6, 2.0, 6.8], [0.9, 1.6, 8.2]].forEach(([r, h, y], i) => add(mesh(new THREE.ConeGeometry(r * u, h * u, 12), std(c, c, 0.5 + i * 0.35, 0.1, 0.55), 0, y * u, 0)));
    const s = add(mesh(new THREE.IcosahedronGeometry(0.5 * u, 1), std(c, c, 3), 0, 9.4 * u, 0)); g.userData.spin.push([s, 1.2, 'y']);
  },
  anvil(g, u, c, add) {
    add(mesh(new THREE.BoxGeometry(3 * u, 0.9 * u, 2 * u), std(0x15161c, c, 0.12, 0.9, 0.4), 0, 0.45 * u, 0));
    add(mesh(new THREE.CylinderGeometry(0.8 * u, 1.3 * u, 1.4 * u, 8), std(0x1b1c24, c, 0.12, 0.9, 0.4), 0, 1.6 * u, 0));
    add(mesh(new THREE.BoxGeometry(4.4 * u, 1.1 * u, 1.9 * u), std(0x20212b, c, 0.18, 0.95, 0.3), 0, 2.85 * u, 0));
    add(mesh(new THREE.ConeGeometry(0.95 * u, 1.9 * u, 4), std(0x20212b, c, 0.18, 0.95, 0.3), 3.0 * u, 2.85 * u, 0)).rotation.z = -Math.PI / 2;
    add(mesh(new THREE.BoxGeometry(3.6 * u, 0.12 * u, 1.5 * u), std(c, c, 3.2, 0.1, 0.4), 0, 3.46 * u, 0));
    add(mesh(new THREE.CylinderGeometry(0.1 * u, 1.2 * u, 7 * u, 12, 1, true), beamMat(c, 0.14), 0, 7 * u, 0));
  },
  crown(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(2.2 * u, 2.5 * u, 1 * u, 5), std(0x15161c, c, 0.2, 0.95, 0.3), 0, 0.5 * u, 0));
    const pr = Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2 + 0.3);
    add(inst(new THREE.ConeGeometry(0.55 * u, 3.4 * u, 5), std(c, c, 0.8, 0.95, 0.22), pr.map((a) => ({ p: [Math.cos(a) * 2 * u, 2.7 * u, Math.sin(a) * 2 * u] }))));
    add(inst(new THREE.SphereGeometry(0.28 * u, 12, 10), std(c, c, 3), pr.map((a) => ({ p: [Math.cos(a) * 2 * u, 4.5 * u, Math.sin(a) * 2 * u] }))));
    const gem = add(mesh(new THREE.OctahedronGeometry(0.9 * u), std(c, c, 2.6, 0.2, 0.2), 0, 3.6 * u, 0)); g.userData.spin.push([gem, 1, 'y']);
  },
  gate(g, u, c, add) {
    [-2.4, 2.4].forEach((x) => add(mesh(new THREE.BoxGeometry(1.1 * u, 7 * u, 1.1 * u), std(dark(c), c, 0.3, 0.85, 0.3), x * u, 3.5 * u, 0)));
    add(mesh(new THREE.BoxGeometry(7 * u, 1.1 * u, 1.3 * u), std(dark(c), c, 0.45, 0.85, 0.3), 0, 7.4 * u, 0));
    add(mesh(new THREE.PlaneGeometry(3.7 * u, 6.8 * u), beamMat(c, 0.32), 0, 3.5 * u, 0));
    add(mesh(new THREE.BoxGeometry(2.4 * u, 0.4 * u, 1.5 * u), std(c, c, 2.4, 0.2, 0.4), 0, 8.2 * u, 0));
  },
  crystal(g, u, c, add) {
    const core = add(mesh(new THREE.OctahedronGeometry(1.7 * u), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.88 }), 0, 4.4 * u, 0));
    core.scale.set(1, 2.2, 1); g.userData.spin.push([core, 0.7, 'y']);
    for (let i = 0; i < 3; i++) { const o = add(mesh(new THREE.OctahedronGeometry(0.38 * u), std(c, c, 2.6, 0.2, 0.2), Math.cos(i * 2.1) * 3.2 * u, (3 + i) * u, Math.sin(i * 2.1) * 3.2 * u)); g.userData.spin.push([o, 1.5 + i * 0.4, 'y']); }
    add(mesh(new THREE.CylinderGeometry(1.8 * u, 2.4 * u, 0.7 * u, 6), std(dark(c), c, 0.3), 0, 0.35 * u, 0));
  },
  helix(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(0.2 * u, 0.28 * u, 9 * u, 8), std(dark(c), c, 0.5), 0, 4.5 * u, 0));
    const grp = new THREE.Group(); add(grp);
    const A = [], B = [];
    for (let i = 0; i < 28; i++) { const a = i * 0.62, y = (0.5 + i * 0.3) * u; A.push({ p: [Math.cos(a) * 1.5 * u, y, Math.sin(a) * 1.5 * u] }); B.push({ p: [Math.cos(a + Math.PI) * 1.5 * u, y, Math.sin(a + Math.PI) * 1.5 * u] }); }
    grp.add(inst(new THREE.SphereGeometry(0.2 * u, 10, 8), std(c, c, 2.4, 0.2, 0.3), A), inst(new THREE.SphereGeometry(0.15 * u, 8, 6), std(0xffffff, 0xffffff, 1.4, 0.2, 0.3), B));
    g.userData.spin.push([grp, 0.6, 'y']);
  },
  wheel(g, u, c, add) {
    add(mesh(new THREE.CylinderGeometry(0.5 * u, 0.9 * u, 3 * u, 8), std(dark(c), c, 0.3), 0, 1.5 * u, 0));
    const w = new THREE.Group(); w.position.set(0, 5.4 * u, 0); add(w);
    w.add(mesh(new THREE.TorusGeometry(2.8 * u, 0.14 * u, 10, 64), std(c, c, 1.5, 0.9, 0.2)));
    const an = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
    w.add(inst(new THREE.BoxGeometry(0.06 * u, 2.8 * u, 0.06 * u), std(c, c, 1.1, 0.9, 0.3), an.map((a) => ({ p: [Math.cos(a) * 1.4 * u, Math.sin(a) * 1.4 * u, 0], r: [0, 0, a - Math.PI / 2] }))));
    w.add(inst(new THREE.SphereGeometry(0.18 * u, 8, 6), std(c, c, 3), an.map((a) => ({ p: [Math.cos(a) * 2.8 * u, Math.sin(a) * 2.8 * u, 0] }))));
    w.add(mesh(new THREE.SphereGeometry(0.4 * u, 14, 10), std(c, c, 2.6, 0.2, 0.2)));
    g.userData.spin.push([w, 0.35, 'z']);
  },
  monolith(g, u, c, add) {
    const m = add(mesh(new THREE.BoxGeometry(1.7 * u, 7.5 * u, 0.55 * u), std(0x050508, c, 0.1, 1, 0.12), 0, 3.75 * u, 0));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: c, fog: false })); m.add(e);
    const r = add(mesh(new THREE.TorusGeometry(1.7 * u, 0.06 * u, 8, 48), beamMat(c, 0.85), 0, 8.8 * u, 0)); r.rotation.x = Math.PI / 2; g.userData.spin.push([r, 0.5, 'z']);
    add(mesh(new THREE.CylinderGeometry(0.9 * u, 0.9 * u, 0.3 * u, 4), std(dark(c), c, 0.3), 0, 0.15 * u, 0));
  },
  lighthouse(g, u, c, add) {
    for (let i = 0; i < 5; i++) add(mesh(new THREE.CylinderGeometry((0.9 - i * 0.1) * u, (1.05 - i * 0.1) * u, 1 * u, 12), std(i % 2 ? 0xf3f1f6 : dark(c), c, i % 2 ? 0.08 : 0.4, 0.3, 0.5), 0, (0.5 + i) * u, 0));
    add(mesh(new THREE.CylinderGeometry(0.75 * u, 0.55 * u, 0.4 * u, 12), std(dark(c), c, 0.5), 0, 5.2 * u, 0));
    add(mesh(new THREE.SphereGeometry(0.5 * u, 14, 10), std(c, c, 3.4, 0.1, 0.2), 0, 5.8 * u, 0));
    const sweep = new THREE.Group(); sweep.position.set(0, 5.8 * u, 0); add(sweep);
    const cone = mesh(new THREE.ConeGeometry(1.2 * u, 16 * u, 16, 1, true), beamMat(c, 0.2)); cone.rotation.z = -Math.PI / 2; cone.position.x = 8 * u; sweep.add(cone);
    g.userData.spin.push([sweep, 0.9, 'y']);
  },
};

/** The landmark group for a kind, tinted by the city's accent. u = the site's scale (generator: site.scale, 7..24). */
export function buildLandmark(kind, hex, u) {
  const g = new THREE.Group();
  g.userData.spin = [];
  const c = new THREE.Color(hex);
  const add = (m) => { g.add(m); return m; };
  (BUILDERS[kind] || BUILDERS.obelisk)(g, u / 2.2, c, add);
  g.userData.kind = kind;
  return g;
}

export function spinLandmark(g, dt) {
  for (const [obj, speed, axis] of g.userData.spin || []) obj.rotation[axis] += dt * speed;
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

export const LANDMARK_KINDS = Object.keys(BUILDERS);
