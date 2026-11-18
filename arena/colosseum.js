// The outer Olympian citadel. Six batched meshes, no extra lights, render passes or frame loop.
// The illustrated arena uses the same architectural vocabulary when 3D is unavailable.
import * as THREE from '../jarvis/three.module.min.js';
const TAU = Math.PI * 2;
export const CITADEL_LIMITS = Object.freeze({ calls: 6, triangles: 6500 });

export function citadel(scene, { lite = false } = {}) {
  const group = new THREE.Group(); group.name = 'Olympian citadel';
  const stone = new THREE.MeshStandardMaterial({ color: '#b1a99f', roughness: 0.62, metalness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0a060', roughness: 0.32, metalness: 0.88 });
  const night = new THREE.MeshStandardMaterial({ color: '#1a2a35', roughness: 0.78, metalness: 0.18 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e0a060').multiplyScalar(1.8), fog: true });
  const pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 4.2, 8), stone, 48);
  const capital = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.28, 1.0), gold, 48);
  const arch = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.13, 3, 8, Math.PI), stone, 24);
  const gate = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, 24);
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), night, 40);
  const inlay = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.025, 5.4), glow, 48);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  function place(mesh, i, x, y, z, yaw = 0, scale = [1, 1, 1]) {
    p.set(x, y, z); q.setFromEuler(e.set(0, yaw, 0)); s.set(...scale); m.compose(p, q, s); mesh.setMatrixAt(i, m);
  }
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU, x = Math.cos(a) * 28.8, z = Math.sin(a) * 28.8;
    place(pillar, i, x, 11.0, z); place(capital, i, x, 13.2, z, -a);
    place(inlay, i, Math.cos(a) * 12.3, 0.035, Math.sin(a) * 12.3, -a + Math.PI / 2);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i + 0.5) / 24 * TAU;
    place(arch, i, Math.cos(a) * 28.8, 12.2, Math.sin(a) * 28.8, -a + Math.PI / 2, [2.7, 1, 1]);
  }
  // Four monumental portals, six blocks each. Their silhouette is visible above the bowl.
  for (let side = 0; side < 4; side++) {
    const a = side / 4 * TAU, normal = [Math.cos(a), Math.sin(a)], tangent = [-normal[1], normal[0]];
    [[-2.6, 5.8, 1.0, 10.4], [2.6, 5.8, 1.0, 10.4], [0, 11.2, 6.8, 0.8], [0, 12.1, 5.6, 0.7], [-2.6, 12.9, 1.2, 1.0], [2.6, 12.9, 1.2, 1.0]].forEach(([off, y, w, h], j) => {
      place(gate, side * 6 + j, normal[0] * 26.2 + tangent[0] * off, y, normal[1] * 26.2 + tangent[1] * off, -a + Math.PI / 2, [w, h, 1.35]);
    });
  }
  // A distant, deterministic city provides scale without particles or individual buildings.
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * TAU, h = 5 + ((i * 17) % 13), r = 61 + (i % 3) * 4;
    place(city, i, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, -a, [2.3 + i % 3, h, 3.1]);
  }
  group.add(pillar, capital, arch, gate, city, inlay);
  group.children.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  scene.add(group);
  const counts = group.children.map((mesh) => mesh.count);
  function setLite(on) { city.count = on ? 20 : 40; arch.visible = !on; }
  setLite(lite);
  return {
    group, setLite,
    stats() { return { calls: group.children.filter((x) => x.visible).length, triangles: group.children.reduce((n, x) => n + (x.visible ? x.geometry.index.count / 3 * x.count : 0), 0), instances: counts.reduce((a, b) => a + b, 0) }; },
    dispose() { scene.remove(group); group.children.forEach((x) => x.geometry.dispose()); [stone, gold, night, glow].forEach((x) => x.dispose()); },
  };
}


