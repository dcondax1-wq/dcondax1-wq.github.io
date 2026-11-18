// The Citadel: a deterministic night city around the Arena. One draw for towers and one for windows.
import * as THREE from '../jarvis/three.module.min.js';

const TAU = Math.PI * 2;
// a box without its floor face (BoxGeometry groups: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z) and a flat top face
function noFloor(g) {
  const idx = g.index.array, keep = [];
  for (const gr of g.groups) if (gr.materialIndex !== 3) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]);
  g.setIndex(keep); g.clearGroups(); return g;
}
const topFace = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const seed = (n) => { let x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };

export function createCitadel(scene, lite = false) {
  const group = new THREE.Group();
  group.name = 'Arena Citadel';
  scene.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: '#2d251c', roughness: 0.82, metalness: 0.14 });
  const towerMat = new THREE.MeshStandardMaterial({ color: '#f3ece0', roughness: 0.48, metalness: 0.35, vertexColors: false });
  const windowMat = new THREE.MeshBasicMaterial({ color: '#f3ece0', toneMapped: false });
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#b0763c', toneMapped: false });
  const ground = new THREE.Mesh(new THREE.RingGeometry(27.7, 94, 96), stone);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.14;
  group.add(ground);

  const N = 176, WINDOWS = 8;
  // the same city in fewer triangles (phone budget 2026-11-16, tests/test_olympus_kit.py arena 75,000): a tower has no floor face
  // (10 triangles, not 12), a window strip (0.055 deep) is its lit face only and a cap / a street (a quarter of a unit thick) its top
  // face only (2, not 12): about 17,000 triangles fewer, the same picture
  const towers = new THREE.InstancedMesh(noFloor(new THREE.BoxGeometry(1, 1, 1)), towerMat, N);
  windowMat.side = THREE.DoubleSide;
  const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), windowMat, N * WINDOWS);
  const cap = new THREE.InstancedMesh(topFace(), edgeMat, N);
  const mat = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) {
    // Golden-angle placement keeps LITE's first 80 towers spread around the entire skyline.
    const a = i * 2.3999632, ring = i % 3;
    // The outer district sits beyond the separate Colosseum PR's 61-69 radius skyline.
    const r = ring === 2 ? 76 + seed(i + 9) * 6 : 34 + ring * 13 + seed(i + 9) * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const width = 1.7 + seed(i + 30) * 2.6;
    const depth = 1.8 + seed(i + 60) * 2.8;
    const height = 8 + seed(i + 101) * 16 + (i % 13 === 0 ? 11 : 0);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 - a);
    pos.set(x, height / 2, z); scale.set(width, height, depth);
    mat.compose(pos, quat, scale); towers.setMatrixAt(i, mat);
    tint.set(i % 7 === 0 ? '#4b5231' : i % 3 === 0 ? '#b0763c' : '#514639');
    towers.setColorAt(i, tint);
    pos.y = height + 0.29; scale.set(width + 0.3, 1, depth + 0.3);              // the 0.26 cap's top face
    mat.compose(pos, quat, scale); cap.setMatrixAt(i, mat);
    for (let j = 0; j < WINDOWS; j++) {
      // A vertical illuminated spine faces the Arena; the windows make depth legible at phone scale.
      const y = 2 + (j + 0.5) * (height - 2) / WINDOWS;
      const faceR = r - depth / 2 - 0.03;
      pos.set(Math.cos(a) * faceR, y, Math.sin(a) * faceR);
      scale.set(width * 0.57, 0.13 + seed(i * 7 + j) * 0.13, 1);                // the strip's lit face
      mat.compose(pos, quat, scale); windows.setMatrixAt(i * WINDOWS + j, mat);
      windows.setColorAt(i * WINDOWS + j, tint.set(i % 7 === 0 ? '#9bab63' : i % 3 === 0 ? '#e0a060' : '#e0a060'));
    }
  }
  towers.instanceMatrix.needsUpdate = windows.instanceMatrix.needsUpdate = cap.instanceMatrix.needsUpdate = true;
  towers.instanceColor.needsUpdate = windows.instanceColor.needsUpdate = true;
  group.add(towers, windows, cap);

  // Four broad causeways lead toward the colosseum; the eye follows them into the live rank altar.
  const roads = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const road = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.11, 38), stone);
    road.position.set(Math.sin(a) * 45, 0.01, Math.cos(a) * 45);
    road.rotation.y = a; group.add(road); roads.push(road);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.015, 38), edgeMat);
    line.position.copy(road.position); line.position.y = 0.08; line.rotation.y = a; group.add(line); roads.push(line);
  }
  // One batched luminous street circuit ties the inner, middle and outer districts together.
  // A complete 16-sided circuit and all radial links come first, so LITE still has continuous routes.
  const ROUTES = 112, LITE_ROUTES = 64;
  const routes = new THREE.InstancedMesh(topFace(),
    new THREE.MeshBasicMaterial({ color: '#f3ece0', toneMapped: false }), ROUTES);
  const routeTint = new THREE.Color(), radii = [44, 58, 72], routeHeight = 0.16;
  let routeIndex = 0;
  function route(x0, z0, x1, z1, color) {
    const dx = x1 - x0, dz = z1 - z0;
    pos.set((x0 + x1) / 2, routeHeight + 0.0225, (z0 + z1) / 2);                 // the street's top face
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
    scale.set(0.17, 1, Math.hypot(dx, dz));
    mat.compose(pos, quat, scale); routes.setMatrixAt(routeIndex, mat);
    routes.setColorAt(routeIndex++, routeTint.set(color));
  }
  for (let sector = 0; sector < 16; sector++) {
    const a = sector * TAU / 16, b = (sector + 1) * TAU / 16;
    for (let j = 0; j < 3; j++) {
      const r = radii[j];
      route(Math.sin(a) * r, Math.cos(a) * r, Math.sin(b) * r, Math.cos(b) * r,
        j === 1 ? '#e0a060' : '#6f9bb8');
    }
    if (sector % 2 === 0) for (let j = 0; j < 2; j++) {
      route(Math.sin(a) * radii[j], Math.cos(a) * radii[j],
        Math.sin(a) * radii[j + 1], Math.cos(a) * radii[j + 1], '#e0a060');
    }
  }
  // The high tier adds short local streets leading from each circuit to its adjacent buildings.
  for (let sector = 0; sector < 16; sector++) {
    const a = (sector + 0.5) * TAU / 16;
    for (let j = 0; j < 3; j++) {
      const end = [40, 53, 78][j];
      route(Math.sin(a) * radii[j], Math.cos(a) * radii[j],
        Math.sin(a) * end, Math.cos(a) * end, '#6f9bb8');
    }
  }
  routes.instanceMatrix.needsUpdate = routes.instanceColor.needsUpdate = true;
  group.add(routes);
  // Illuminated skybridges echo the Data City night arcs. These are decorative connections,
  // never live order routes or claims about trade data. One batched draw, no animation loop.
  const ARCS = 36, LITE_ARCS = 12;
  const arcs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#f3ece0', toneMapped: false }), ARCS);
  const up = new THREE.Vector3(0, 0, 1), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let arc = 0; arc < 3; arc++) {
    const a = arc * TAU / 3, b = (arc + 1) * TAU / 3, radius = 78;
    for (let j = 0; j < 12; j++) {
      const point = (t, out) => out.set(
        Math.sin(a) * radius * (1 - t) + Math.sin(b) * radius * t,
        2 + 23 * Math.sin(Math.PI * t),
        Math.cos(a) * radius * (1 - t) + Math.cos(b) * radius * t);
      point(j / 12, p0); point((j + 1) / 12, p1);
      dir.subVectors(p1, p0); pos.copy(p0).add(p1).multiplyScalar(0.5);
      quat.setFromUnitVectors(up, dir.clone().normalize()); scale.set(0.13, 0.13, dir.length());
      mat.compose(pos, quat, scale); arcs.setMatrixAt(arc * 12 + j, mat);
      arcs.setColorAt(arc * 12 + j, tint.set(arc === 0 ? '#9bab63' : arc === 1 ? '#e0a060' : '#6f9bb8'));
    }
  }
  arcs.instanceMatrix.needsUpdate = arcs.instanceColor.needsUpdate = true;
  group.add(arcs);
  function setLite(on) {
    towers.count = cap.count = on ? 80 : N; windows.count = on ? 80 * WINDOWS : N * WINDOWS;
    routes.count = on ? LITE_ROUTES : ROUTES; arcs.count = on ? LITE_ARCS : ARCS;
  }
  setLite(lite);
  return {
    setLite,
    stats: () => ({ towers: towers.count, windows: windows.count, causeways: 4, routes: routes.count, arcs: arcs.count }),
    dispose() {
      scene.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      stone.dispose(); towerMat.dispose(); windowMat.dispose(); edgeMat.dispose(); arcs.material.dispose();
    },
  };
}

