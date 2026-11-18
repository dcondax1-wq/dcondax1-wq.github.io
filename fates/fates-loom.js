// FATES loom (2026-11-03, docs/OLYMPUS_RENDER.md): the arena of the Moirai on the OLYMPUS render core. Real surfaces instead of
// light only: two marble loom posts with gold capitals frame the spindle, a gold warp beam above and a gunmetal one below hold a
// sheet of glowing warp fibres, and a colonnade of marble columns runs away into the fog beside the threads. Lit by a warm key
// light, a point light in the golden gate and a violet one under the spindle, plus the render core's environment.
// Draw calls: 7 (columns 1, capitals 1, posts 1, post caps 1, two beams, the warp 1). Nothing here knows the data.
import * as THREE from '../jarvis/three.module.min.js';
import * as M from '../olympus/materials.js';

/** buildLoom({ lite, len, y1 }) -> { group, place(gateY, floorY), update(t), setAccent(color), parts } */
export function buildLoom({ lite = false, len = 34, y1 = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'loom';
  const parts = {};

  // lights: the key from above-left, the gate's own gold, a violet bounce under the spindle
  const key = new THREE.DirectionalLight(0xffe3b8, 2.2); key.position.set(-4, 9, 8);
  const gate = new THREE.PointLight(0xffc86a, 16, 20, 2); gate.position.set(0, y1, -5);
  const under = new THREE.PointLight(0xffb070, 8, 14, 2); under.position.set(0, 0.4, 2);
  group.add(key, gate, under);
  parts.lights = { key, gate, under };

  // the colonnade: marble shafts with gold capitals and bases, two rows running into the distance
  const per = lite ? 5 : 8, N = per * 2, H = y1 * 1.9;
  const shaftMat = M.marble({ color: '#efe8da', vein: '#8a6f4a', gold: true, scale: 0.8 });
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, H, lite ? 10 : 18, 1), shaftMat, N);
  const capMat = M.metal({ kind: 'gold', roughness: 0.28 });
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), capMat, N * 2);
  const at = new THREE.Object3D();
  parts.cols = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < per; i++) {
      const x = (side ? 1 : -1) * 4.6, z = -4 - i * (len / per) * 0.78;
      parts.cols.push([x, z]);
    }
  }
  group.add(shafts, caps);
  parts.shafts = shafts; parts.caps = caps;

  // the loom posts: two taller marble columns either side of the spindle, with a gold weaving beam across the top
  const postMat = M.marble({ color: '#f3ede2', vein: '#8a6f4a', gold: true, scale: 0.9, roughness: 0.22 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 1, lite ? 12 : 24, 1), postMat, 2);
  const postCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), capMat, 4);
  const beamTop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 16).rotateZ(Math.PI / 2), M.metal({ kind: 'gold', roughness: 0.2 }));
  const beamLow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 16).rotateZ(Math.PI / 2), M.metal({ kind: 'gunmetal', roughness: 0.25 }));
  group.add(posts, postCaps, beamTop, beamLow);
  Object.assign(parts, { posts, postCaps, beamTop, beamLow });

  // the warp: a sheet of fine glowing fibres between the beams (HDR, so the bloom lifts them), tinted gold to violet
  const FIB = lite ? 26 : 56, pos = new Float32Array(FIB * 6), col = new Float32Array(FIB * 6);
  const warp = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  warp.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  warp.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  warp.frustumCulled = false;
  group.add(warp);
  parts.warp = warp;
  const accent = new THREE.Color(1, 0.81, 0.35);

  const X = 2.1, Z = -1.8;                    // the posts' x and the loom plane's z
  function paint() {
    const c = warp.geometry.attributes.color;
    for (let i = 0; i < FIB; i++) {
      const u = i / (FIB - 1), hot = 0.55 + 0.45 * Math.sin(i * 12.9898);
      const r = accent.r * (1 - u) + 0.62 * u, g = accent.g * (1 - u) + 0.46 * u, b = accent.b * (1 - u) + 1.0 * u;
      const k = 0.55 + 0.9 * hot * hot;      // HDR: the brightest fibres cross the bloom threshold
      c.setXYZ(i * 2, r * k * 0.2, g * k * 0.2, b * k * 0.2);
      c.setXYZ(i * 2 + 1, r * k, g * k, b * k);   // dim at the floor beam, bright at the top beam
    }
    c.needsUpdate = true;
  }

  /** the gate and the floor move with the scenario: re-seat everything that stands between them */
  function place(gateY, floorY) {
    const lo = floorY - 0.05, top = gateY + 0.95, h = top - lo;
    const I = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let s = 0; s < 2; s++) {
      p.set(s ? X : -X, lo + h / 2, Z); sc.set(1, h, 1); posts.setMatrixAt(s, I.compose(p, q, sc));
      for (let k = 0; k < 2; k++) {
        p.set(s ? X : -X, k ? top + 0.05 : lo + 0.08, Z); sc.set(1, 1, 1); postCaps.setMatrixAt(s * 2 + k, I.compose(p, q, sc));
      }
    }
    posts.instanceMatrix.needsUpdate = postCaps.instanceMatrix.needsUpdate = true;
    beamTop.position.set(0, top - 0.12, Z); beamTop.scale.set(X * 2, 1, 1);
    beamLow.position.set(0, lo + 0.14, Z); beamLow.scale.set(X * 2, 1, 1);
    for (let i = 0; i < FIB; i++) {
      const x = -X + 0.22 + (i / (FIB - 1)) * (X * 2 - 0.44);
      pos.set([x, lo + 0.14, Z, x, top - 0.12, Z], i * 6);
    }
    warp.geometry.attributes.position.needsUpdate = true;
    paint();
    const colH = Math.max(H, top - lo + 0.6);
    parts.cols.forEach(([x, z], i) => {
      p.set(x, lo + colH / 2, z); sc.set(1, colH / H, 1); shafts.setMatrixAt(i, I.compose(p, q, sc));
      sc.set(1, 1, 1);
      p.set(x, lo + colH + 0.08, z); caps.setMatrixAt(i * 2, I.compose(p, q, sc));
      p.set(x, lo + 0.08, z); caps.setMatrixAt(i * 2 + 1, I.compose(p, q, sc));
    });
    shafts.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
    shafts.frustumCulled = caps.frustumCulled = posts.frustumCulled = postCaps.frustumCulled = false;
    gate.position.y = gateY;
    under.position.y = floorY + 0.5;
  }

  return {
    group, parts, place,
    /** the page's accent (gate colour): the warp and the gate light follow it */
    setAccent(c) { accent.copy(c); gate.color.copy(c); paint(); },
    update(t, reduced) {
      if (reduced) return;
      gate.intensity = 16 + Math.sin(t * 1.3) * 2.5;
      under.intensity = 10 + Math.sin(t * 0.9 + 1) * 1.5;
      warp.material.opacity = 0.8 + Math.sin(t * 2.1) * 0.1;
    },
  };
}
