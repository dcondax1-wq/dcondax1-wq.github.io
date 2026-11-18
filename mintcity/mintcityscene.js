// MINT CITY 3D scene (optional ES module): a marble city at golden hour, five districts (one per money stream) round a central golden column.
// QA Round 7 (team W): the Round 6 city (plain blocks, a gold stick, a single grey box per far district) "did not impress". Now, on the hero-stage kit
// (olympus/hero-stage.js dress + olympus/env-kit.js: CC0 marble / plaster / clay-tile / paving scans, the golden HDRI, a painted golden-hour sky):
//   - the golden column: a fluted gilded shaft as tall as the combined estimate on a stepped marble agora with a Greek-key band, an Attic base and a
//     gilded capital, crowned by a turning owl tetradrachm, with a bronze tablet that says the combined estimate a month;
//   - each district stands on its own round marble platform with the key band; its buildings are INSTANCED by kind and material (whitewashed plaster
//     walls, fluted marble columns, clay-tile roofs, gilded / bronze landmarks: one draw call each), so the treasury tower is gold, the oracle temple
//     marble and tile, the harbour scales gilded; heights follow each stream's estimate (mintcitycore.js); a bronze tablet names the district and its
//     dollars a month;
//   - far away (the LOD rule from the core) a district becomes ONE merged copy of the same buildings (one draw, the same colours), not a grey block;
//   - the outer town: whitewashed houses with clay-tile roofs (two instanced draws), cypress rows, bronze braziers and Poly Haven horse statues on the
//     agora (a GPU only; LITE and a software GL skip the model files).
// Budget: about 40 draw calls and under 60k triangles on high (env-kit BUDGET 45 / 160k). On the render core since 2026-11-18 (a faint glow on the
// gold highlights only, threshold above 1; the golden look grade), no neon, no network of its own (the kit's scans
// and HDRI are the site's own files). The camera orbits by drag / pinch / wheel and flies on tours; reduced motion draws only on change.
// Registers window.MINTCITY3D = { mount, setPlan, flyTo, tour, stop, state, dispose } and fires 'mintcity3d'. mintcity.js draws the 2D map and list
// first and only hides the map when mount() returns true; LITE (OLYMPUS.lite()) never mounts it (the 2D map and the list only).
import * as THREE from '../jarvis/three.module.min.js';
import * as C from './mintcitycore.js';
import { dress, shaftGeo, latheGeo, boxGeo, mergeParts, mat4, laurelGeo } from '../olympus/hero-stage.js';
import { createRenderer } from '../olympus/render.js';   // the OLYMPUS render core (2026-11-18 cities pass): ACES finish, MSAA / FXAA, tiers, the look grade

let R = null;
const PT = 0.52;                     // the top of a district platform (the buildings stand on it)
// colours per palette key of the plan: walls and plinths (plaster / marble), roofs (clay tiles), metal landmarks (gold / bronze)
const STONE = { marble: '#eee7da', terra: '#c98a62', olive: '#6f7c46', aegean: '#4f7f9e', gold: '#e2c27a', bronze: '#b08a62' };
const ROOF = { terra: '#a65a32', gold: '#c48a3e', bronze: '#7a5a44', marble: '#b9a48c', olive: '#6f7c46', aegean: '#4f7f9e' };
const METAL = { gold: '#d4ae58', bronze: '#9c6b3c' };
const MEAN = { plaster: '#d8cdbb', marble: '#d8cfbf', roof: '#a65a32' };          // the scans' mean colours (env-kit TEX): an instance tint = colour / mean
const FAR = { stone: STONE, roof: ROOF, metal: METAL };

function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }
function prism() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3); g.rotateX(-Math.PI / 2); g.translate(0, -0.125, 0); g.scale(1 / 0.866, 1 / 0.75, 1); return g; }
/** a unit column (radius 0.5, height 1, centred): fluted shaft with closed ends */
function columnGeo(lite) {
  const sh = shaftGeo({ h: 1, r: 0.5, flutes: 12, lite, rows: 1, taper: 1, depth: 0.05 }); sh.translate(0, -0.5, 0);
  const top = new THREE.CircleGeometry(0.5, lite ? 12 : 24).rotateX(-Math.PI / 2).translate(0, 0.5, 0), bot = new THREE.CircleGeometry(0.5, lite ? 12 : 24).rotateX(Math.PI / 2).translate(0, -0.5, 0);
  return mergeParts([[sh], [top], [bot]]);
}
/** a unit treasury tower (1 x 1 x 1, centred): a core with four corner pilasters, two string courses and a cornice (the gilded landmarks) */
function towerGeo() {
  const parts = [[boxGeo(0.84, 1, 0.84)]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([boxGeo(0.17, 1, 0.17), mat4(sx * 0.43, 0, sz * 0.43)]);
  for (const y of [-0.16, 0.18]) parts.push([boxGeo(0.95, 0.022, 0.95), mat4(0, y, 0)]);
  parts.push([boxGeo(1.06, 0.035, 1.06), mat4(0, 0.48, 0)], [boxGeo(0.98, 0.03, 0.98), mat4(0, -0.485, 0)]);
  return mergeParts(parts);
}
const tintOf = (hex, mean) => { const c = new THREE.Color(hex), m = new THREE.Color(mean); return new THREE.Color(Math.min(4, c.r / m.r), Math.min(4, c.g / m.g), Math.min(4, c.b / m.b)); };
const isMetal = (b) => (b.k === 'box' || b.k === 'cyl') && (b.c === 'gold' || b.c === 'bronze') && !(b.k === 'box' && b.sy < 1 && b.sx > 3);
const isTower = (b) => b.k === 'box' && isMetal(b) && b.sy > 2.2 * Math.max(b.sx, b.sz);
const groupOf = (b) => (b.k === 'roof' ? 'roof' : isTower(b) ? 'tower:metal' : isMetal(b) ? b.k + ':metal' : b.k + ':stone');

/** the buildings of a list, instanced by kind and material: -> Group (userData.count, userData.draws) */
function instanced(list, y0) {
  const g = new THREE.Group(), by = {};
  for (const b of list) (by[groupOf(b)] || (by[groupOf(b)] = [])).push(b);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  for (const key of Object.keys(by)) {
    const arr = by[key], [kind, cls] = key.split(':');
    const geo = kind === 'roof' ? R.geoms.roof : kind === 'cyl' ? R.geoms.col : kind === 'tower' ? R.geoms.tower : R.geoms.box;
    const mat = kind === 'roof' ? R.mats.roof : cls === 'metal' ? R.mats.metal : kind === 'cyl' ? R.mats.marble : R.mats.plaster;
    const mean = kind === 'roof' ? MEAN.roof : kind === 'cyl' ? MEAN.marble : MEAN.plaster;
    const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((b, i) => {
      e.set(0, b.ry || 0, 0); q.setFromEuler(e); p.set(b.x, b.y + y0, b.z); s.set(b.sx, b.sy, b.sz); m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, cls === 'metal' ? new THREE.Color(METAL[b.c] || METAL.gold) : tintOf((kind === 'roof' ? ROOF : STONE)[b.c] || STONE.marble, mean));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; mesh.name = 'mc:' + key;
    g.add(mesh); n += arr.length;
  }
  g.userData.count = n; g.userData.draws = g.children.length;
  return g;
}
/** the far copy of a district: the same buildings merged into ONE geometry with their colours (simple shapes, one draw) */
function farCopy(list, y0) {
  const parts = [], col = new THREE.Color();
  for (const b of list) {
    const geo = b.k === 'roof' ? prism() : b.k === 'cyl' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8) : new THREE.BoxGeometry(1, 1, 1);
    geo.applyMatrix4(mat4(b.x, b.y + y0, b.z, b.ry || 0, [b.sx, b.sy, b.sz]));
    const cls = b.k === 'roof' ? 'roof' : isMetal(b) ? 'metal' : 'stone'; col.set(FAR[cls][b.c] || STONE.marble);
    const out = geo.index ? geo.toNonIndexed() : geo; if (out !== geo) geo.dispose();
    const m = out.getAttribute('position').count, cc = new Float32Array(m * 3); for (let i = 0; i < m; i++) { cc[i * 3] = col.r; cc[i * 3 + 1] = col.g; cc[i * 3 + 2] = col.b; }
    out.setAttribute('color', new THREE.BufferAttribute(cc, 3)); out.deleteAttribute('uv'); parts.push(out);
  }
  const merged = parts.length ? mergeAll(parts) : new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(merged, R.mats.far); mesh.name = 'mc:far'; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}
function mergeAll(parts) {
  let n = 0; for (const g of parts) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { const c = g.getAttribute('position').count; pos.set(g.getAttribute('position').array, o * 3); nor.set(g.getAttribute('normal').array, o * 3); col.set(g.getAttribute('color').array, o * 3); o += c; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere(); return out;
}
/** a cypress (trunk + a tall dark crown) with vertex colours, for one instanced draw */
function cypressGeo(lite) {
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6).translate(0, 0.4, 0);
  const crown = new THREE.LatheGeometry([[0.0001, 0], [0.55, 0.25], [0.7, 1.2], [0.6, 2.4], [0.35, 3.4], [0.0001, 4.0]].map((p) => new THREE.Vector2(p[0], p[1])), lite ? 7 : 10).translate(0, 0.6, 0);
  const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + 0.3 * (g.getAttribute('position').getY(i) / 4.6); a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
  const t = trunk.toNonIndexed(), cr = crown.toNonIndexed(); trunk.dispose(); crown.dispose(); paint(t, '#5a4030'); paint(cr, '#2f4a26'); t.deleteAttribute('uv'); cr.deleteAttribute('uv');
  return mergeAll([t, cr]);
}
const money = (v) => (v == null || !isFinite(v) ? 'no estimate' : C.money(v) + ' a month');
/** a bronze tablet that keeps the same size on screen wherever the camera flies (k = its share of the view's height) */
function screenSized(sp, k) { sp.material.sizeAttenuation = false; sp.scale.set(k * (sp.scale.x / sp.scale.y), k, 1); return sp; }

// ------------------------------------------------------------------------------------------------ the set that never changes (built once in mount)
function buildSet() {
  const D = R.D, B = D.B, lite = R.lite;
  D.ground({ mat: 'paving', color: '#b4a68c', r: 160 });
  // the agora: three marble steps, the key band, a gold fillet; a square marble pedestal for the column
  R.plaza = D.plinth({ r: 7.4, steps: 3, stepH: 0.22, run: 0.55, drum: 0.45 });
  B.add('marble:uv', boxGeo(4.4, 1.2, 4.4), mat4(0, R.plaza + 0.6, 0), '#e8e0d0');
  B.add('marble:uv', boxGeo(4.7, 0.16, 4.7), mat4(0, R.plaza + 1.28, 0), '#f0e9dc');
  for (const s of [-1, 1]) { B.add('gold', boxGeo(4.46, 0.07, 0.07), mat4(0, R.plaza + 1.0, s * 2.2)); B.add('gold', boxGeo(0.07, 0.07, 4.46), mat4(s * 2.2, R.plaza + 1.0, 0)); }
  R.pedTop = R.plaza + 1.36;
  // the five avenues (cobbles with sandstone kerbs) and the district platforms (one marble step, the key band, a gold fillet)
  for (let i = 0; i < 5; i++) {
    const c = C.districtCenter(i, 5), len = C.RING - 7.4 - 10.6 + 3, mid = 7.4 + len / 2 - 1.5, a = Math.atan2(c.x, c.z), ux = Math.sin(a), uz = Math.cos(a);
    B.add('cobble:uv', boxGeo(3.2, 0.1, len), mat4(ux * mid, 0.05, uz * mid, a), '#a69882');
    for (const s of [-1, 1]) B.add('ashlar:uv', boxGeo(0.35, 0.22, len), mat4(ux * mid + uz * s * 1.75, 0.11, uz * mid - ux * s * 1.75, a), '#d6c8ae');
    D.plinth({ x: c.x, z: c.z, r: 10.6, steps: 1, stepH: 0.2, run: 0.6, drum: 0.25, bandTag: '' });
    // two bronze braziers at the head of each avenue, on the agora's lowest step
    for (const s of [-1, 1]) B.brazier({ x: ux * 9.3 + uz * s * 2.4, z: uz * 9.3 - ux * s * 2.4, h: 1.1, r: 0.3 });
  }
  D.build(R.scene);
  // cypress rows: by the avenues, in the gaps between districts and in a ring round the city (one instanced draw)
  const spots = [];
  for (let i = 0; i < 5; i++) {
    const c = C.districtCenter(i, 5), a = Math.atan2(c.x, c.z);
    for (const s of [-1, 1]) for (const r of [10.4, 12.2]) spots.push([Math.sin(a) * r + Math.cos(a) * s * 3.1, Math.cos(a) * r - Math.sin(a) * s * 3.1, 1]);
    const g = a + Math.PI / 5; for (const r of [22, 26, 30]) spots.push([Math.sin(g) * r, Math.cos(g) * r, 1.15]);
  }
  for (let i = 0; i < (lite ? 24 : 40); i++) { const a = (i / (lite ? 24 : 40)) * Math.PI * 2 + 0.05, r = 37.5 + (i % 3) * 0.8; spots.push([Math.sin(a) * r, Math.cos(a) * r, 0.9 + (i % 4) * 0.12]); }
  const cyp = new THREE.InstancedMesh(cypressGeo(lite), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 }), spots.length);
  spots.forEach((p, i) => cyp.setMatrixAt(i, mat4(p[0], 0, p[1], i * 1.3, p[2])));
  cyp.instanceMatrix.needsUpdate = true; cyp.frustumCulled = false; cyp.name = 'mc:cypress'; R.scene.add(cyp); R.cyp = cyp;
  // five bronze-patina horse statues on the agora (the Poly Haven model; a GPU only), facing out along the gaps between the avenues
  const horses = []; for (let i = 0; i < 5; i++) { const c = C.districtCenter(i, 5), a = Math.atan2(c.x, c.z) + Math.PI / 5; horses.push([Math.sin(a) * 5.6, R.plaza, Math.cos(a) * 5.6, a, 2.2]); }
  R.D.kit.hero(R.scene, 'horse', horses, { color: '#7c6a52', rough: 0.45, metal: 0.6, envI: 1.4 }).then(() => kick());
}

// ------------------------------------------------------------------------------------------------ the parts that follow the data (rebuilt by setPlan)
function build(plan) {
  const root = new THREE.Group(), D = R.D;
  R.districts = plan.districts.map((d, i) => {
    const detail = instanced(d.parts, PT), proxy = farCopy(d.parts, PT); proxy.visible = false;
    const hit = new THREE.Mesh(R.geoms.hit, R.mats.hit); hit.position.set(d.cx, 12, d.cz); hit.userData.id = d.id; hit.visible = false;
    const lab = screenSized(D.label(C.DISTRICTS[d.id].name, { sub: money(d.base), scale: 1, w: 256, h: 112 }), 0.066); lab.position.set(d.cx, PT + d.H + 5.2, d.cz); lab.material.userData.mcOwn = true;
    root.add(detail, proxy, hit, lab);
    return { id: d.id, cx: d.cx, cz: d.cz, detail, proxy, hit, lab, on: true, i };
  });
  // the outer town: whitewashed houses (plaster) and their clay-tile roofs, two instanced draws
  const fill = new THREE.Group(), walls = new THREE.InstancedMesh(R.geoms.box, R.mats.plaster, plan.filler.length), roofs = new THREE.InstancedMesh(R.geoms.roof, R.mats.roof, plan.filler.length);
  const WHITE = ['#efe8db', '#e9dfcc', '#f3ede2', '#dccbb0', '#e6d6bd'];
  plan.filler.forEach((b, i) => {
    walls.setMatrixAt(i, mat4(b.x, b.y, b.z, b.ry, [b.sx, b.sy, b.sz])); walls.setColorAt(i, tintOf(b.c === 'terra' ? '#d7a77e' : WHITE[i % WHITE.length], MEAN.plaster));
    const rh = 0.5 + b.sx * 0.18; roofs.setMatrixAt(i, mat4(b.x, b.sy + rh / 2, b.z, b.ry, [b.sx + 0.35, rh, b.sz + 0.35])); roofs.setColorAt(i, tintOf(i % 5 === 0 ? '#7e3e22' : '#a04f2a', MEAN.roof));
  });
  [walls, roofs].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; fill.add(m); });
  fill.userData = { count: plan.filler.length, draws: 2 }; root.add(fill); R.filler = fill;
  // the golden column: an Attic base, a fluted gilded shaft as tall as the combined estimate, a gilded capital, a turning owl coin, its tablet
  const ph = plan.pillar.h, y0 = R.pedTop, pil = new THREE.Group(), r = 1.15, lite = R.lite;
  const base = latheGeo([[0.0001, 0], [r * 1.5, 0], [r * 1.5, 0.22], [r * 1.32, 0.32], [r * 1.38, 0.46], [r * 1.12, 0.56], [0.0001, 0.56]], lite ? 16 : 32);
  const capH = 1.1, cap = [[latheGeo([[r * 0.84, 0], [r * 0.9, capH * 0.12], [r * 1.08, capH * 0.32], [r * 1.34, capH * 0.52], [r * 1.42, capH * 0.6], [0.0001, capH * 0.6]], lite ? 16 : 32), mat4(0, 0.56 + ph, 0)],
    [boxGeo(r * 3.0, capH * 0.4, r * 3.0), mat4(0, 0.56 + ph + capH * 0.8, 0)]];
  const parts = mergeParts([[base]].concat(cap).concat(laurelGeo(1.0, { leaves: lite ? 16 : 26 }).map((g) => [g, mat4(0, 0.56 + ph + capH + 1.25, 0, 0, 1, -Math.PI / 2)])));
  const gold = R.D.kit.mat('gold'), gp = new THREE.Mesh(parts, gold); gp.position.y = y0;
  const shaft = new THREE.Mesh(shaftGeo({ h: ph, r, flutes: 20, lite: R.D.kit.geoLite, rows: 3, taper: 0.86 }), gold); shaft.position.y = y0 + 0.56;
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, lite ? 24 : 40).rotateX(Math.PI / 2), D.paint('coin')); coin.position.y = y0 + 0.56 + ph + capH + 1.25; R.coin = coin;
  const lamp = new THREE.PointLight(0xffc477, 1.4, 40); lamp.position.y = coin.position.y + 1.2;
  const tab = screenSized(D.label(money(plan.pillar.base), { sub: 'all five streams (estimate)', scale: 1, w: 300, h: 112 }), 0.075); tab.position.y = coin.position.y + 2.9; tab.material.userData.mcOwn = true;
  pil.add(gp, shaft, coin, lamp, tab); pil.userData = { ph }; root.add(pil); R.pillar = pil;
  R.root = root; R.scene.add(root); R.plan = plan;
  D.tune();
}
function clearRoot() {
  if (!R.root) return;
  R.scene.remove(R.root);
  const keep = new Set(Object.values(R.geoms));
  R.root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
    if (o.material && o.material.userData && o.material.userData.mcOwn) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  R.root = null;
}

function applyPose(p) { R.pose = p; const c = C.poseToCam(p); R.camera.position.set(c.pos[0], c.pos[1], c.pos[2]); R.camera.lookAt(c.look[0], c.look[1], c.look[2]); }
function frame(now) {
  if (!R || R.dead) return;
  R.raf = 0;
  const dt = Math.min(0.1, (now - (R.last || now)) / 1000); R.last = now;
  if (R.fly) { const t = (now - R.fly.t0) / R.fly.ms; applyPose(C.lerpPose(R.fly.from, R.fly.to, t)); if (t >= 1) R.fly = null; }
  else if (R.tourName) { applyPose(C.tourPose(R.tourName, now - R.tourT0, 5)); }
  else if (!R.reduce && !R.touched) applyPose(Object.assign({}, R.pose, { yaw: R.pose.yaw + dt * 0.03 }));
  if (R.coin && !R.reduce) R.coin.rotation.y += dt * 0.7;
  const cam = R.camera.position;
  for (const d of R.districts) {
    const dist = Math.hypot(cam.x - d.cx, cam.y, cam.z - d.cz), near = C.lodDetail(dist, R.tier);
    if (near !== d.on) { d.on = near; d.detail.visible = near; d.proxy.visible = !near; }
  }
  if (R.reduce && !R.fly && !R.tourName) R.rc.draw(); else R.rc.render();   // on demand (reduced motion): draw now, whatever the frame gap
  R.frames++; R.calls = R.renderer.info.render.calls; R.tris = R.renderer.info.render.triangles;
  if (!R.reduce || R.fly || R.tourName) R.raf = requestAnimationFrame(frame);
}
function kick() { if (R && !R.raf && !R.dead && !document.hidden) R.raf = requestAnimationFrame(frame); }

function mount(box, plan, opts) {
  if (R) dispose();
  if (!box || !webgl()) return false;
  opts = opts || {};
  const reduce0 = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tier0 = opts.tier || ((navigator.hardwareConcurrency || 4) <= 4 ? 'mid' : 'high');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3b2c1e);
  const camera = new THREE.PerspectiveCamera(46, 1.2, 0.5, 400);
  // the render core (as Chrysos and Ergasterion): one finish pass with tone mapping, anti-aliasing and the look's golden grade; a soft bloom
  // only on the gilded column's highlights (threshold above 1). It owns the canvas, its pixel ratio (the render-scale governor) and its tiers.
  let rc, renderer;
  try {
    const canvas = document.createElement('canvas');
    rc = createRenderer({ canvas, scene, camera, maxDpr: tier0 === 'high' ? 2 : 1.5, env: 'none', exposure: 1.02, tint: '#c8a24a',
      bloom: { strength: 0.14, radius: 0.35, threshold: 1.15 }, grade: { grain: 0.012, vignette: 0.18 } });
    renderer = rc.renderer;
  } catch (_) { try { if (rc) rc.dispose(); } catch (e) { /* nothing */ } return false; }
  const reduce = reduce0, tier = tier0;
  let oLite = false; try { oLite = !!(window.OLYMPUS && window.OLYMPUS.lite && window.OLYMPUS.lite()); } catch (_) { oLite = false; }
  const lite = oLite || tier === 'low';
  box.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none'; renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  const D = dress({ rc, scene, camera, tier: lite ? 'low' : 'high', palette: 'golden', hdri: 'golden', envI: 0.85, sunDir: [0.55, 0.62, 0.45], key: 2.6, hemi: 0.55, rim: 0.8, shadows: false, metalEnv: 1.9,
    sky: { sunX: 0.8, sunY: 0.72, templeX: 0.14, horizon: 0.4 }, fogNear: 150, fogFar: 380 });
  const geoms = { box: boxGeo(1, 1, 1), col: columnGeo(lite || D.kit.geoLite), tower: towerGeo(), roof: prism(), hit: new THREE.CylinderGeometry(10, 10, 24, 12) };
  const mats = { plaster: D.kit.mat('plaster', { color: '#ffffff' }), marble: D.kit.mat('marble', { color: '#ffffff' }), roof: D.kit.mat('roof', { color: '#ffffff' }),
    metal: D.kit.mat('gold', { color: '#ffffff', rough: 0.32 }), far: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }), hit: new THREE.MeshBasicMaterial({ visible: false }) };
  R = { rc, renderer, scene, camera, box, geoms, mats, D, tier, lite, reduce, frames: 0, calls: 0, tris: 0, raf: 0, dead: false, districts: [], root: null, pose: Object.assign({}, C.OVERVIEW), onPick: opts.onPick || null, touched: false, fly: null, tourName: null, ptr: new Map(), last: 0 };
  buildSet();
  build(plan);
  // the look pass (olympus/look.js): the golden grade in the finish pass (0 draw calls); no depth of field: the bronze tablets stay sharp
  import('../olympus/look.js').then((L) => { if (R && R.rc === rc) { R.look = L.polish(rc, { grade: 'golden', mix: 0.3 }); kick(); } }).catch(() => {});
  D.envReady.then(() => kick());
  R.timers = [setTimeout(kick, 1500), setTimeout(kick, 4000)];          // the scans arrive later: draw again (reduced motion draws on demand)
  const size = () => { const w = Math.max(200, box.clientWidth || 320), h = Math.max(160, box.clientHeight || 300); rc.resize(w, h); D.backdrop(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); applyPose(R.pose); kick(); };
  applyPose(R.pose); size();
  if (typeof ResizeObserver === 'function') { R.ro = new ResizeObserver(size); R.ro.observe(box); }
  // drag = turn, two fingers / wheel = zoom, a short tap on a district = pick it
  const el = renderer.domElement, ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  const clampPose = () => { const p = R.pose; p.pitch = Math.max(0.12, Math.min(1.3, p.pitch)); p.dist = Math.max(14, Math.min(110, p.dist)); };
  const down = (e) => { R.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); el.setPointerCapture && el.setPointerCapture(e.pointerId); };
  const move = (e) => {
    const p = R.ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (R.ptr.size === 2) { const [a, b] = [...R.ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (R.pinch) R.pose.dist *= R.pinch / d; R.pinch = d; }
    else { if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) { R.touched = true; R.tourName = null; R.fly = null; } R.pose.yaw -= dx * 0.006; R.pose.pitch += dy * 0.004; }
    clampPose(); applyPose(R.pose); kick();
  };
  const up = (e) => {
    const p = R.ptr.get(e.pointerId); R.ptr.delete(e.pointerId); R.pinch = 0; if (!p) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && performance.now() - p.t0 < 500) {
      const r = el.getBoundingClientRect(); v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, camera);
      const hit = ray.intersectObjects(R.districts.map((d) => d.hit), false)[0];
      if (hit && R.onPick) R.onPick(hit.object.userData.id);
    }
  };
  const wheel = (e) => { e.preventDefault(); R.pose.dist *= e.deltaY > 0 ? 1.08 : 0.92; clampPose(); R.touched = true; applyPose(R.pose); kick(); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false });
  R.listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['wheel', wheel]];
  const vis = () => { if (!R) return; if (document.hidden) { cancelAnimationFrame(R.raf); R.raf = 0; } else kick(); };
  document.addEventListener('visibilitychange', vis); R.vis = vis;
  kick();
  return true;
}

function setPlan(plan) { if (!R) return; clearRoot(); build(plan); kick(); }
function flyTo(pose, ms) { if (!R) return; R.tourName = null; R.touched = true; if (R.reduce || !ms) { applyPose(pose); R.fly = null; kick(); return; } R.fly = { from: Object.assign({}, R.pose), to: pose, t0: performance.now(), ms: ms || 1000 }; kick(); }
function tour(name) { if (!R) return; R.fly = null; R.touched = true; if (R.reduce) { applyPose(C.tourPose(name, 0, 5)); kick(); return; } R.tourName = name; R.tourT0 = performance.now(); kick(); }
function stop() { if (!R) return; R.tourName = null; R.fly = null; }
function state() {
  if (!R) return { on: false };
  const inst = R.districts.reduce((n, d) => n + d.detail.userData.count, 0) + R.filler.userData.count;
  const est = R.districts.reduce((n, d) => n + (d.on ? d.detail.userData.draws : 1) + 1, 0) + R.filler.userData.draws + 14;
  return { on: true, frames: R.frames, tier: R.tier, lite: R.lite, instances: inst, drawsApprox: R.calls || est, tris: R.tris, lod: R.districts.map((d) => (d.on ? 1 : 0)), pillar: R.plan.pillar.h, tour: R.tourName, pose: R.pose, heights: R.plan.districts.map((d) => d.H) };
}
function dispose() {
  if (!R) return;
  R.dead = true; cancelAnimationFrame(R.raf);
  try {
    (R.timers || []).forEach(clearTimeout);
    document.removeEventListener('visibilitychange', R.vis); if (R.ro) R.ro.disconnect();
    const el = R.renderer.domElement; for (const [k, f] of R.listeners || []) el.removeEventListener(k, f);
    clearRoot();
    R.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); });
    Object.values(R.geoms).forEach((g) => g.dispose()); R.mats.far.dispose(); R.mats.hit.dispose(); if (R.cyp) R.cyp.material.dispose();
    if (R.D) R.D.dispose();
    if (R.look) R.look.dispose();
    R.rc.dispose(); if (el.parentNode) el.parentNode.removeChild(el);
  } catch (_) { /* nothing */ }
  R = null;
}

window.MINTCITY3D = { mount, setPlan, flyTo, tour, stop, state, dispose };
window.__heroStats = () => (R && R.D ? Object.assign(R.D.stats(), { calls: R.calls, frameTris: R.tris }) : null);
window.dispatchEvent(new Event('mintcity3d'));
