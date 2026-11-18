// Architectural scenery: stepped crowns and a civic orbital promenade, never data.
import * as THREE from '../jarvis/three.module.min.js';

export function skylinePorts(towers, extent) {
  const group = new THREE.Group(), selected = towers.map((s, i) => ({ ...s, index: i })).filter((s) => s.seed > 0.94);
  const spired = selected.filter((s) => s.seed > 0.972), haloed = selected.filter((s) => s.seed > 0.988);
  const crowns = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#9c6b3c', metalness: 0.7, roughness: 0.25, emissive: '#436f91', emissiveIntensity: 0.5 }), selected.length * 3);
  const spires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.34, 1, 6), new THREE.MeshStandardMaterial({ color: '#b9a98c', emissive: '#4b7da3', emissiveIntensity: 0.65, metalness: 0.82, roughness: 0.2 }), spired.length);
  const halos = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.07, 4, 14), new THREE.MeshBasicMaterial({ color: '#d79e64', transparent: true, opacity: 0.72 }), haloed.length);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  selected.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    for (let tier = 0; tier < 3; tier++) {
      const width = 0.9 - tier * (0.18 + s.seed * 0.055), tierH = 2.4 + s.seed * 1.7;
      mat.compose(new THREE.Vector3(s.x, s.h + tierH * (tier + 0.5), s.z), q, new THREE.Vector3(s.w * width, tierH, s.d * width));
      crowns.setMatrixAt(i * 3 + tier, mat);
      crowns.setColorAt(i * 3 + tier, new THREE.Color(tier === 2 ? '#daa56f' : '#b9a98c'));
    }
  });
  spired.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    mat.compose(new THREE.Vector3(s.x, s.h + 12, s.z), q, new THREE.Vector3(1, 18 + s.seed * 11, 1));
    spires.setMatrixAt(i, mat);
  });
  haloed.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    mat.compose(new THREE.Vector3(s.x, s.h + 8.2, s.z), q, new THREE.Vector3(Math.max(2.2, s.w * 0.7), Math.max(2.2, s.d * 0.7), 1));
    halos.setMatrixAt(i, mat);
  });
  for (const mesh of [crowns, spires, halos]) { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; group.add(mesh); }
  const path = [], rad = extent + 36;
  for (let i = 0; i < 160; i++) {
    const a = i / 160 * Math.PI * 2, b = (i + 1) / 160 * Math.PI * 2;
    for (const r of [rad - 1.5, rad + 1.5]) path.push(Math.cos(a) * r, 7, Math.sin(a) * r, Math.cos(b) * r, 7, Math.sin(b) * r);
    if (i % 5 === 0) path.push(Math.cos(a) * rad, 0.1, Math.sin(a) * rad, Math.cos(a) * rad, 7, Math.sin(a) * rad);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(path, 3));
  const rail = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#304862', transparent: true, opacity: 0.12 })); group.add(rail);
  return { group, setTier(count) {
    crowns.count = selected.filter((s) => s.index < count).length * 3;
    spires.count = spired.filter((s) => s.index < count).length;
    halos.count = haloed.filter((s) => s.index < count).length;
    rail.visible = count > 250;
  } };
}
