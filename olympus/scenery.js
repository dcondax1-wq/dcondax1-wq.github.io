// OLYMPUS scenery (tools/web_public/olympus/scenery.js, 2026-11-04, JOB 10+11): the "real materials" kit for the four scene apps
// (Arena, Nemesis, Chronos, Argus). One ES module on top of three.js (Jarvis's copy), the render core's materials and the FX library.
// Everything is procedural (a 256 px canvas at most per texture, shared and cached), tier-aware (setLite) and disposable.
//
//   stone(o)        ashlar stone: blocks and mortar, speckle, cracks, a bump map (MeshStandardMaterial)
//   bronze(o)       aged bronze / brass with verdigris patina, a roughness map and a bump map
//   basalt(o)       dark volcanic rock with glowing ember cracks; material.userData.update(t) breathes the glow
//   crowd(scene,o)  instanced animated spectators (body, head, arms) on rings; cheer(k) raises arms, update(t)
//   banners(scene,o) cloth banners that wave (vertex shader) with a gold-bordered emblem
//   torch(scene,o)  a bronze torch with a real flame (FX.fire when the library is there, a flicker sprite otherwise)
//   dustAndRays(target,o)  FX dust + godRays, guarded
//   figure(o)       a fallen warrior (armour, helm, shield, spear) as one Group, for Nemesis
//   gear(o)         a toothed brass gear (ExtrudeGeometry), for Chronos
//   eyeParts(o)     sclera / iris / cornea materials and geometry for Argus
// Every factory never throws past its caller: dressing a scene is optional, the scene works without it.
import * as THREE from '../jarvis/three.module.min.js';

export { THREE };
const FX = () => window.OLYMPUS_FX || null;
const rng = (seed) => { let s = seed || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const cache = new Map();

function canvasTex(key, size, paint, { repeat = [1, 1], srgb = false, aniso = 4 } = {}) {
  const k = key + '|' + size + '|' + repeat.join(',');
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); paint(g, size, rng(key.length * 7919 + size));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(k, t);
  return t;
}
const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r * 255 | 0, c.g * 255 | 0, c.b * 255 | 0]; };
const shade = (rgb, k) => `rgb(${Math.max(0, Math.min(255, rgb[0] * k)) | 0},${Math.max(0, Math.min(255, rgb[1] * k)) | 0},${Math.max(0, Math.min(255, rgb[2] * k)) | 0})`;

// ------------------------------------------------------------------ stone
export function stone({ color = '#8d857a', repeat = [4, 2], rough = 0.88, blocks = 4, cracks = true, bump = 1.6, tint = null } = {}) {
  const base = hexRgb(color), tn = tint ? hexRgb(tint) : null;
  const paint = (g, n, r) => {
    const bh = n / blocks, bw = n / (blocks / 2);
    for (let row = 0; row < blocks; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < blocks / 2 + 1; col++) {
        const k = 0.82 + r() * 0.3, m = tn ? Math.min(1, r() * 0.5) : 0, rgb = tn ? base.map((v, i) => v + (tn[i] - v) * m) : base;
        g.fillStyle = shade(rgb, k); g.fillRect(col * bw + off, row * bh, bw, bh);
      }
    }
    for (let i = 0; i < n * 14; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.07})`; g.fillRect(r() * n, r() * n, 1 + r() * 2.5, 1 + r() * 2.5); }
    g.strokeStyle = 'rgba(12,10,8,.78)'; g.lineWidth = Math.max(2, n / 64);
    for (let row = 0; row <= blocks; row++) { g.beginPath(); g.moveTo(0, row * bh); g.lineTo(n, row * bh); g.stroke(); }
    for (let row = 0; row < blocks; row++) { const off = (row % 2) * bw / 2; for (let col = -1; col <= blocks / 2 + 1; col++) { g.beginPath(); g.moveTo(col * bw + off, row * bh); g.lineTo(col * bw + off, (row + 1) * bh); g.stroke(); } }
    if (cracks) { g.strokeStyle = 'rgba(10,8,6,.55)'; g.lineWidth = 1.2; for (let i = 0; i < 7; i++) { let x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 22; y += (r() - 0.2) * 20; g.lineTo(x, y); } g.stroke(); } }
  };
  const key = 'stone' + color + blocks + (tint || '') + cracks;
  const map = canvasTex(key, 256, paint, { repeat, srgb: true });
  const bumpMap = canvasTex(key + 'b', 128, (g, n, r) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 10; i++) { const v = 120 + r() * 100 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3); }
    g.strokeStyle = '#222'; g.lineWidth = 2; const bh = n / blocks; for (let row = 0; row <= blocks; row++) { g.beginPath(); g.moveTo(0, row * bh); g.lineTo(n, row * bh); g.stroke(); }
    const bw = n / (blocks / 2); for (let row = 0; row < blocks; row++) { const off = (row % 2) * bw / 2; for (let col = -1; col <= blocks / 2 + 1; col++) { g.beginPath(); g.moveTo(col * bw + off, row * bh); g.lineTo(col * bw + off, (row + 1) * bh); g.stroke(); } }
  }, { repeat });
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: bump, roughness: rough, metalness: 0.02, envMapIntensity: 0.55 });
}

// ------------------------------------------------------------------ bronze / brass
export function bronze({ color = '#b07a3c', patina = 0.4, repeat = [1, 1], rough = 0.42, kind = 'bronze' } = {}) {
  const base = hexRgb(color);
  const map = canvasTex('bronze' + color + patina + kind, 256, (g, n, r) => {
    g.fillStyle = shade(base, 1); g.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) { g.fillStyle = shade(base, 0.7 + r() * 0.6); g.globalAlpha = 0.18; g.beginPath(); g.ellipse(r() * n, r() * n, 6 + r() * 30, 3 + r() * 14, r() * 3, 0, 6.3); g.fill(); }
    g.globalAlpha = 1;
    for (let i = 0; i < 160 * patina; i++) { g.fillStyle = `rgba(${52 + r() * 30 | 0},${128 + r() * 50 | 0},${110 + r() * 30 | 0},${0.1 + r() * 0.25})`; g.beginPath(); g.ellipse(r() * n, r() * n, 2 + r() * 16, 1 + r() * 8, r() * 3, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(255,235,190,.07)'; for (let i = 0; i < 60; i++) { const y = r() * n; g.beginPath(); g.moveTo(0, y); g.lineTo(n, y + (r() - 0.5) * 4); g.stroke(); }
  }, { repeat, srgb: true });
  const rmap = canvasTex('bronzeR' + patina, 128, (g, n, r) => {
    g.fillStyle = '#777'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 6; i++) { const v = 90 + r() * 120 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 2 + r() * 8, 1 + r() * 3); }
  }, { repeat });
  return new THREE.MeshStandardMaterial({ map, roughnessMap: rmap, bumpMap: rmap, bumpScale: 0.6, roughness: rough, metalness: 0.88, envMapIntensity: 1.25 });
}

// ------------------------------------------------------------------ basalt with ember cracks
export function basalt({ color = '#1b1620', glow = '#ff5a1e', repeat = [3, 3], intensity = 2.2, veins = 5 } = {}) {
  const base = hexRgb(color), gl = hexRgb(glow);
  const cracks = (g, n, r, lit) => {
    g.lineCap = 'round';
    for (let i = 0; i < veins; i++) {
      let x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 7; j++) { x += (r() - 0.5) * 46; y += (r() - 0.5) * 46; g.lineTo(x, y); if (r() < 0.2) { g.moveTo(x, y); } }
      g.lineWidth = lit ? 0.7 + r() * 0.9 : 3; g.strokeStyle = lit ? `rgb(${gl.join(',')})` : '#000'; g.stroke();
    }
  };
  const map = canvasTex('basalt' + color, 256, (g, n, r) => {
    g.fillStyle = shade(base, 1); g.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 12; i++) { g.fillStyle = shade(base, 0.5 + r() * 1.4); g.globalAlpha = 0.5; g.fillRect(r() * n, r() * n, 1 + r() * 4, 1 + r() * 3); }
    g.globalAlpha = 1;
    // the plates: darker, with an edge
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.beginPath(); const x = r() * n, y = r() * n; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120); g.stroke(); }
  }, { repeat, srgb: true });
  const em = canvasTex('basaltE' + glow + veins, 256, (g, n, r) => { g.fillStyle = '#000'; g.fillRect(0, 0, n, n); cracks(g, n, r, true); g.filter = 'blur(1.2px)'; cracks(g, n, rng(99), true); }, { repeat, srgb: true });
  const bump = canvasTex('basaltB', 128, (g, n, r) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); for (let i = 0; i < n * 8; i++) { const v = 60 + r() * 150 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 2 + r() * 5, 2 + r() * 4); } cracks(g, n, r, false); }, { repeat });
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.62, metalness: 0.15, emissive: new THREE.Color('#ffffff'), emissiveMap: em, emissiveIntensity: intensity });
  m.emissive.set(glow);
  m.userData.update = (t) => { m.emissiveIntensity = intensity * (0.8 + 0.25 * Math.sin(t * 1.3) + 0.1 * Math.sin(t * 3.7)); };
  return m;
}

// ------------------------------------------------------------------ the crowd
/** rings: [{ r, y, n, tilt? }]  spectators on circles facing the centre. Returns { group, update(t, dt), cheer(k), setLite(b), count, tris(), dispose() }; detail: 'low' (default, 40 tris a spectator) | 'full' (216) */
export function crowd(scene, { rings = [], palette = ['#a33a3a', '#2f5d8a', '#c9a24a', '#5a3d7a', '#3a7a55', '#d8d2c4', '#8a4a2a'], seed = 7, center = [0, 0, 0], detail = 'low', density = 1 } = {}) {
  const r = rng(seed), uni = { uTime: { value: 0 }, uCheer: { value: 0 } };
  const patch = (mat, arms) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime; sh.uniforms.uCheer = uni.uCheer;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh; uniform float uTime; uniform float uCheer;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bob = abs(sin(uTime * (1.6 + aPh * 0.8) + aPh * 40.0));
          transformed.y += bob * (0.015 + uCheer * 0.09);
          ${arms ? 'float up = uCheer * (0.55 + 0.35 * sin(uTime * 9.0 + aPh * 30.0)); transformed.y = transformed.y * mix(0.45, 1.25, uCheer) + up * 0.55; transformed.x += sign(position.x) * uCheer * 0.06;' : 'transformed.x += sin(uTime * 1.1 + aPh * 20.0) * 0.012;'}`);
    };
    mat.customProgramCacheKey = () => 'oly-crowd' + (arms ? 'A' : 'B');
    return mat;
  };
  let total = 0; for (const rg of rings) total += rg.n;
  // detail 'low' (the default, 2026-11-04, docs/OLYMPUS_PERF.md): a tapered 5-sided torso, a 4 x 2 head, a 3-sided arm = 40 triangles a spectator
  // instead of 216 ('full': capsules and a 6 x 5 head): ~36k instead of ~194k for the Arena's 896 spectators. A spectator is a few pixels tall at
  // the camera distances of the bowl, so the silhouette and the colours read the same.
  const low = detail !== 'full';
  const bodyG = low ? new THREE.CylinderGeometry(0.13, 0.17, 0.68, 5, 1) : new THREE.CapsuleGeometry(0.17, 0.34, 2, 6); bodyG.translate(0, 0.34, 0);
  const headG = low ? new THREE.SphereGeometry(0.115, 4, 2) : new THREE.SphereGeometry(0.115, 6, 5); headG.translate(0, 0.78, 0);
  const armG = low ? new THREE.CylinderGeometry(0.04, 0.04, 0.3, 3, 1, true) : new THREE.CapsuleGeometry(0.04, 0.2, 1, 3); armG.translate(0, 0.55, 0);
  const body = new THREE.InstancedMesh(bodyG, patch(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), false), total);
  const head = new THREE.InstancedMesh(headG, patch(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }), false), total);
  const arms = new THREE.InstancedMesh(armG, patch(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), true), total * 2);
  const ph = new Float32Array(total), ph2 = new Float32Array(total * 2);
  const skin = ['#e0b08c', '#c68a62', '#8d5a3a', '#f0c8a0', '#a87048'].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let i = 0;
  for (const rg of rings) {
    for (let k = 0; k < rg.n; k++) {
      if (density < 1 && r() > density) continue;                  // thinned evenly over every tier (a phone: ~60%), the empty seats are the same everywhere
      const a = (k / rg.n) * Math.PI * 2 + (r() - 0.5) * 0.05, rad = rg.r + (r() - 0.5) * 0.35;
      p.set(center[0] + Math.cos(a) * rad, center[1] + rg.y, center[2] + Math.sin(a) * rad);
      q.setFromAxisAngle(up, -a - Math.PI / 2); const sc = 0.85 + r() * 0.3; s.set(sc, sc, sc);
      m4.compose(p, q, s); body.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
      body.setColorAt(i, col.set(palette[(r() * palette.length) | 0]).multiplyScalar(0.55 + r() * 0.5)); head.setColorAt(i, skin[(r() * skin.length) | 0]);
      ph[i] = r();
      for (let sd = 0; sd < 2; sd++) {
        const off = new THREE.Vector3((sd ? 1 : -1) * 0.22 * sc, 0, 0).applyQuaternion(q); p.set(center[0] + Math.cos(a) * rad + off.x, center[1] + rg.y, center[2] + Math.sin(a) * rad + off.z);
        m4.compose(p, q, s); arms.setMatrixAt(i * 2 + sd, m4); arms.setColorAt(i * 2 + sd, skin[(r() * skin.length) | 0]); ph2[i * 2 + sd] = ph[i];
      }
      i++;
    }
  }
  const placed = i;
  body.count = head.count = placed; arms.count = placed * 2;
  body.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1)); head.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  arms.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph2, 1));
  const group = new THREE.Group(); group.add(body, head, arms);
  for (const m of [body, head, arms]) { m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  scene.add(group);
  let cheer = 0, cheerGoal = 0;
  const api = {
    group, count: placed, detail: low ? 'low' : 'full',
    tris() { const g = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; return Math.round(g(body) * body.count + g(head) * head.count + g(arms) * arms.count); },
    update(t, dt = 0.016, still = false) {
      uni.uTime.value = still ? 0.4 : t; cheer += (cheerGoal - cheer) * Math.min(1, dt * 3); uni.uCheer.value = cheer;
      return cheer > 0.01 || cheerGoal > 0;
    },
    cheer(k) { cheerGoal = k; if (k === 0) cheerGoal = 0; },
    pulse(ms = 3200) { cheerGoal = 1; clearTimeout(api._t); api._t = setTimeout(() => { cheerGoal = 0; }, ms); },
    setLite(b) { const n = b ? Math.floor(placed * 0.4) : placed; body.count = head.count = n; arms.count = n * 2; },
    dispose() { scene.remove(group); for (const m of [body, head, arms]) { m.geometry.dispose(); m.material.dispose(); m.dispose && m.dispose(); } clearTimeout(api._t); },
  };
  return api;
}

// ------------------------------------------------------------------ banners
export function banners(scene, { items = [], w = 1.5, h = 4, glyph = 'Α', color = '#8a1f2a', trim = '#d8a84a' } = {}) {
  const tex = canvasTex('banner' + color + trim + glyph, 256, (g, n) => {
    g.fillStyle = color; g.fillRect(0, 0, n, n);
    const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    g.strokeStyle = trim; g.lineWidth = 8; g.strokeRect(10, 10, n - 20, n - 20); g.lineWidth = 2; g.strokeRect(24, 24, n - 48, n - 48);
    g.fillStyle = trim; g.font = '700 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, n / 2, n / 2 + 6);
  }, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const uT = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>',
      `#include <begin_vertex>\nfloat k = (1.0 - uv.y); transformed.z += sin(uT * 1.7 + position.y * 1.3 + position.x * 2.0) * 0.18 * k * k + sin(uT * 3.1 + position.y * 3.0) * 0.04 * k;`);
  };
  mat.customProgramCacheKey = () => 'oly-banner';
  const geo = new THREE.PlaneGeometry(w, h, 6, 14); geo.translate(0, -h / 2, 0);
  const rod = new THREE.CylinderGeometry(0.05, 0.05, w + 0.3, 8); rod.rotateZ(Math.PI / 2);
  const rodMat = bronze({ color: '#b5873c', patina: 0.15 });
  const group = new THREE.Group();
  for (const it of items) {
    const b = new THREE.Mesh(geo, mat), r = new THREE.Mesh(rod, rodMat), g = new THREE.Group();
    g.add(b, r); g.position.set(it[0], it[1], it[2]); g.rotation.y = it[3] || 0; group.add(g);
  }
  scene.add(group);
  return { group, update(t, still) { uT.value = still ? 0.8 : t; }, dispose() { scene.remove(group); geo.dispose(); rod.dispose(); mat.dispose(); rodMat.dispose(); } };
}

// ------------------------------------------------------------------ torches
export function torch(scene, { at = [0, 0, 0], height = 1.7, light = 0, lite = false } = {}) {
  const g = new THREE.Group(), mat = bronze({ color: '#9a6a30', patina: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, height, 8), mat); pole.position.y = height / 2;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.13, 0.36, 12, 1, true), mat); cup.material.side = THREE.DoubleSide; cup.position.y = height + 0.1;
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.2) })); coal.rotation.x = -Math.PI / 2; coal.position.y = height + 0.22;
  g.add(pole, cup, coal); g.position.set(at[0], at[1], at[2]); scene.add(g);
  let fire = null;
  try { const F = FX(); if (F && F.fire) fire = F.fire(scene, { position: [at[0], at[1] + height + 0.2, at[2]], height: 1.5, light }); } catch (e) { fire = null; }
  return { group: g, stop() { try { fire && fire.stop && fire.stop(); } catch (e) { /* */ } scene.remove(g); pole.geometry.dispose(); cup.geometry.dispose(); coal.geometry.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------ dust in light shafts
export function dustAndRays(target, { rays = true, dust = true, position = [4, 12, -4], intensity = 0.5 } = {}) {
  const out = [];
  try {
    const F = FX();
    if (F) {
      if (dust && F.dust) out.push(F.dust(target));
      if (rays && F.godRays) out.push(F.godRays(target, { position, intensity }));
    }
  } catch (e) { /* the scene is fine without them */ }
  return { stop() { out.forEach((f) => { try { f.stop(); } catch (e) { /* */ } }); out.length = 0; } };
}

// ------------------------------------------------------------------ a fallen warrior
export function figure({ armour = '#6b4a2a', metal = '#8a8f9c' } = {}) {
  const g = new THREE.Group(), a = bronze({ color: armour, patina: 0.1, rough: 0.5 }), m = bronze({ color: metal, patina: 0, kind: 'steel', rough: 0.3 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), a); torso.rotation.z = Math.PI / 2; torso.position.y = 0.3;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, 6.3, 0, 2.3), m); helm.position.set(0.98, 0.34, 0.05);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.46), new THREE.MeshStandardMaterial({ color: '#7a1620', roughness: 0.8 })); crest.position.set(0.98, 0.62, 0.05);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 22), m); shield.position.set(-0.15, 0.1, 0.78); shield.rotation.set(0.18, 0.5, 0.12);
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.7 })); spear.position.set(0.2, 0.2, -0.65); spear.rotation.set(0.12, 0, Math.PI / 2 - 0.35);
  g.add(torso, helm, crest, shield, spear);
  return g;
}

// ------------------------------------------------------------------ gears
export function gear({ teeth = 16, r = 1, depth = 0.18, thick = 0.16, hole = 0.28, spokes = 5, material = null } = {}) {
  const s = new THREE.Shape(), step = Math.PI * 2 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [[r * 0.93, a], [r * 0.93, a + step * 0.12], [r + depth, a + step * 0.26], [r + depth, a + step * 0.5], [r * 0.93, a + step * 0.64]];
    p.forEach(([rad, ang], j) => { const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad; if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h);
  for (let k = 0; k < spokes; k++) {                                       // window cut-outs between spokes
    const a0 = (k / spokes) * Math.PI * 2 + 0.16, a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.16, w = new THREE.Path(), r0 = hole + 0.14, r1 = r * 0.74;
    w.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); w.absarc(0, 0, r0, a0, a1, false); w.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); w.absarc(0, 0, r1, a1, a0, true); w.closePath(); s.holes.push(w);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0, -thick / 2);
  return new THREE.Mesh(geo, material || bronze({ color: '#c79a48', patina: 0.12, rough: 0.34 }));
}

// ------------------------------------------------------------------ an eye with real materials (Argus)
export function eyeParts() {
  const sclera = canvasTex('sclera', 256, (g, n, r) => {
    g.fillStyle = '#eef1f6'; g.fillRect(0, 0, n, n);
    const gr = g.createRadialGradient(n / 2, n / 2, n * 0.2, n / 2, n / 2, n * 0.75); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(160,110,110,.45)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) { const a = r() * 6.28, r0 = n * (0.28 + r() * 0.1); let x = n / 2 + Math.cos(a) * r0 * 1.2, y = n / 2 + Math.sin(a) * r0; g.strokeStyle = `rgba(190,60,60,${0.1 + r() * 0.2})`; g.lineWidth = 0.6 + r() * 1; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += Math.cos(a + (r() - 0.5)) * 16; y += Math.sin(a + (r() - 0.5)) * 12; g.lineTo(x, y); } g.stroke(); }
  }, { srgb: true });
  sclera.wrapS = sclera.wrapT = THREE.ClampToEdgeWrapping;
  const irisTex = canvasTex('iris', 256, (g, n, r) => {
    const c = n / 2;
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 360; i++) { const a = (i / 360) * 6.283, v = 140 + r() * 115 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(c + Math.cos(a) * n * 0.14, c + Math.sin(a) * n * 0.14); g.lineTo(c + Math.cos(a + (r() - 0.5) * 0.06) * n * 0.48, c + Math.sin(a + (r() - 0.5) * 0.06) * n * 0.48); g.stroke(); }
    const rg = g.createRadialGradient(c, c, n * 0.04, c, c, n * 0.5); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.3, 'rgba(0,0,0,.05)'); rg.addColorStop(0.9, 'rgba(0,0,0,.25)'); rg.addColorStop(1, 'rgba(0,0,0,.95)'); g.fillStyle = rg; g.fillRect(0, 0, n, n);
  }, { srgb: true });
  irisTex.wrapS = irisTex.wrapT = THREE.ClampToEdgeWrapping;
  const sclMat = new THREE.MeshPhysicalMaterial({ map: sclera, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
  const irisMat = new THREE.MeshBasicMaterial({ map: irisTex, color: 0xffffff, toneMapped: false });   // instance colour x texture; HDR so it blooms
  const cornea = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, envMapIntensity: 2.4, depthWrite: false });   // a plain Standard material: 100 of these overlap, a clearcoat pass is not worth it
  return { sclMat, irisMat, cornea, irisTex };
}
