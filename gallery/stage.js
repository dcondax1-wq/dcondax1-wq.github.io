// AGORA GALLERY stage (ES module): the 3D half of the page. It draws with the kit's render core (olympus/render.js), warm light, bloom held under .25, in three views:
//   shelf       one shape of olympus/shapes3d.js on a marble pedestal (HD or LITE), drag to turn, tap to look closer
//   build       the scene builder: up to 6 chosen shapes on a ring of one big pedestal
//   collection  every shape at once, each BAKED into one draw call (LITE, vertex colours), in rings around the middle; tap one to pick it
// It publishes window.GALLERY3D for gallery.js and tells the page about taps with 'gallery:tap' / 'gallery:pick' events on window. If WebGL or the core cannot start,
// GALLERY3D.ok is false and the page keeps its 2D drawings (never blank). Nothing is sent or stored.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as KIT from '../olympus/materials.js';
import * as SH from '../olympus/shapes3d.js';
import * as C from './gallerycore.js';

const O = window.OLYMPUS || null;
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; }
}
const AGORA = { sky: '#3a2f22', fog: '#14110e', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' };      // the kit's colours for the reflections: warm, never violet
const WIDE = { pillarbar: 1, temple: 1, trireme: 1, scroll: 1, stoa: 1, mosaic: 1, vaultdoor: 1, goldbars: 1, dolphin: 1, fountain: 1, chariot: 1, bow: 0 };
const sizeOf = (id) => (WIDE[id] ? 2.7 : 2.3);

function start() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const forced = ['high', 'low'].indexOf(q.get('q')) >= 0 ? q.get('q') : undefined;
  const rc = createRenderer({ canvas, scene, camera, quality: forced, env: 'night', tint: '#c8a24a', theme: AGORA, alpha: true, exposure: 1, maxDpr: 2,
    bloom: { strength: 0.2, radius: 0.5, threshold: 0.98 }, onQuality: () => { if (api.mode === 'auto') requality(); } });
  let mode = q.get('mode') === 'high' || q.get('mode') === 'lite' ? q.get('mode') : 'auto';
  const mats = {};
  const matsFor = (lite) => mats[lite ? 'lite' : 'hd'] || (mats[lite ? 'lite' : 'hd'] = SH.materials({ lite, kit: lite ? null : KIT }));
  SH.warmLights(scene, { lite: false });

  const turn = new THREE.Group(), buildG = new THREE.Group(), collG = new THREE.Group();
  scene.add(turn, buildG, collG);
  buildG.visible = false; collG.visible = false;
  const still = q.get('still') === '1';
  let view = 'shelf', ped = null, cur = null, curId = '', shapeLite = null, born = 0, yaw = Number(q.get('yaw')) || 0.5, buildR = 0, vel = 0, focus = false, dist = 6, lookY = 1, frames = 0, last = null;
  let buildIds = [], buildLite = null, buildStat = { tris: 0, draws: 0 }, collInfo = null, collBuilt = false, collLite = null;
  const cache = {}, rays = new THREE.Raycaster(), ndc = new THREE.Vector2();

  const isLite = () => C.modeFor(mode, rc.quality()).lite;
  const active = () => (view === 'build' ? buildG : view === 'collection' ? collG : turn);
  function freeGroup(grp, keep) {
    for (const ch of grp.children.slice()) {
      grp.remove(ch);
      ch.traverse((o) => { if (o.geometry && o !== keep) o.geometry.dispose(); });
    }
  }
  function mark(lite) { if (O && O.mode) { try { O.mode(lite); } catch (_) { /* a mark only */ } } }
  function changed() { window.dispatchEvent(new CustomEvent('gallery:changed')); }

  // ---- shelf
  function place() {
    if (cur) { SH.dispose(cur); cur = null; }
    if (!curId) return;
    const lite = isLite();
    if (ped) { ped.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); turn.remove(ped); }
    ped = SH.pedestal({ lite, radius: 1.55, M: matsFor(lite) }); turn.add(ped);
    cur = SH.build(curId, { lite, materials: matsFor(lite), size: sizeOf(curId) });
    turn.add(cur);
    shapeLite = lite; born = performance.now();
    const st = SH.stats(cur);
    last = { id: curId, lite, tris: st.tris, draws: st.draws };
    mark(lite); changed();
  }
  // ---- build
  function placeBuild() {
    freeGroup(buildG);
    const lite = isLite(); buildLite = lite;
    const n = buildIds.length, M = matsFor(lite);
    const shapes = buildIds.map((id) => SH.build(id, { lite, materials: M, size: n > 3 ? 1.85 : 2.2 }));
    const radii = shapes.map((s) => { const sz = new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3()); return 0.5 * Math.hypot(sz.x, sz.z); });   // each shape's own footprint
    const R = C.ringFit(radii, 0.18); buildR = R;
    const pd = SH.pedestal({ lite, radius: Math.max(1.55, R + Math.max(0, ...radii) + 0.35), M }); buildG.add(pd);
    let tris = 0, draws = 0;
    C.ring(n, R).forEach((pl, i) => {
      const s = shapes[i], o = new THREE.Group(); o.position.set(pl.x, 0, pl.z); o.rotation.y = pl.ry; o.add(s); buildG.add(o);
      const st = SH.stats(s); tris += st.tris; draws += st.draws;
    });
    const sp = SH.stats(pd); buildStat = { tris: tris + sp.tris, draws: draws + sp.draws, n, radius: buildR };
    changed();
  }
  // ---- collection (every shape baked: one draw each)
  function buildCollection() {
    if (collBuilt) return;
    const ids = SH.IDS, lay = C.collection(ids.length, 1.7);
    let tris = 0, draws = 0;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(lay.outer + 0.9, lay.outer + 1.0, 0.2, 72), matsFor(true).marble); floor.position.y = -0.1; collG.add(floor); draws++;
    ids.forEach((id, i) => {
      const m = SH.bakedShape(id, { lite: true, size: WIDE[id] ? 1.55 : 1.35 });
      const pl = lay.places[i], o = new THREE.Group(); o.position.set(pl.x, 0, pl.z); o.rotation.y = pl.ry;
      m.userData.id = id; o.add(m); collG.add(o);
      tris += m.geometry.index.count / 3; draws++;
    });
    collInfo = { count: ids.length, tris: Math.round(tris), draws, outer: lay.outer };
    collBuilt = true; changed();
  }
  function requality() {
    if (view === 'shelf' && curId && shapeLite !== isLite()) place();
    else if (view === 'build' && buildLite !== isLite()) placeBuild();
    if (view === 'build' || view === 'shelf') mark(isLite());
  }
  function statsBoth(id) {
    if (cache[id]) return cache[id];
    const out = {};
    for (const lite of [false, true]) { const g = SH.build(id, { lite }); const s = SH.stats(g); out[lite ? 'lite' : 'hd'] = { tris: s.tris, draws: s.draws }; SH.dispose(g); }
    return (cache[id] = out);
  }

  // ---- drag to turn, tap
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, lx: e.clientX, lt: performance.now() }; vel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const now = performance.now(), dx = e.clientX - drag.lx, dt = Math.max(1, now - drag.lt) / 1000;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
    yaw += dx * 0.011; vel = (dx * 0.011) / dt; drag.lx = e.clientX; drag.lt = now;
  });
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rays.setFromCamera(ndc, camera);
    const hit = rays.intersectObjects(collG.children.filter((o) => o.children.length), true).find((h) => h.object.userData && h.object.userData.id);
    if (hit) window.dispatchEvent(new CustomEvent('gallery:pick', { detail: { id: hit.object.userData.id } }));
  }
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (e.type === 'pointerup' && C.isTap(d.moved, performance.now() - d.t)) { if (view === 'collection') pick(e); else if (view === 'shelf') window.dispatchEvent(new CustomEvent('gallery:tap')); }
    else if (performance.now() - d.lt > 120) vel = 0;
    vel = Math.max(-6, Math.min(6, vel));
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { yaw -= 0.3; e.preventDefault(); } else if (e.key === 'ArrowRight') { yaw += 0.3; e.preventDefault(); } });

  let firstFrame = false;
  rc.start((dt) => {
    const d = Math.min(0.1, dt || 0.016), k = Math.min(1, d * (reduced() ? 40 : 5));
    if (!drag) {
      if (Math.abs(vel) > 0) { yaw += vel * d; vel = C.inertia(vel, d); }
      else if (!focus && !reduced() && !still) yaw += (view === 'collection' ? 0.08 : 0.22) * d;
    }
    active().rotation.y = yaw;
    if (view === 'shelf' && cur) {
      if (cur.userData.update && !reduced()) cur.userData.update(performance.now() / 1000);
      const age = Math.min(1, (performance.now() - born) / (reduced() ? 1 : 380)), ease = 1 - Math.pow(1 - age, 3);
      cur.scale.setScalar(cur.userData.baseScale || (cur.userData.baseScale = cur.scale.x));
      cur.scale.multiplyScalar(0.9 + 0.1 * ease);
    }
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 360, aspect = w / h;
    let want, wantY, hgt;
    if (view === 'collection') { const R = collInfo ? collInfo.outer + 1.3 : 7; want = C.fitDistance(camera.fov, aspect, R, R * 0.62, false) * 0.8; wantY = 0.5; hgt = want * 0.62; }
    else if (view === 'build') { const R = buildR + 1.9; want = C.fitDistance(camera.fov, aspect, R, 1.6, false); wantY = 0.9; hgt = 1.5 + R * 0.35; }
    else { want = C.fitDistance(camera.fov, aspect, 1.85, 1.5, focus); wantY = focus ? 1.2 : 1.05; hgt = focus ? 0.5 : 1.15; }
    dist += (want - dist) * k; lookY += (wantY - lookY) * k;
    camera.position.set(0, lookY + (view === 'collection' ? dist * 0.62 : hgt), view === 'collection' ? dist * 0.8 : dist); camera.lookAt(0, lookY, 0);
    frames++;
    if (!firstFrame && (cur || collBuilt || buildIds.length)) { firstFrame = true; document.getElementById('stageBox').classList.add('live'); window.dispatchEvent(new CustomEvent('gallery:live')); }
  });

  const api = {
    ok: true, THREE, SH, rc,
    get mode() { return mode; },
    get view() { return view; },
    show(id) { if (!SH.IDS.includes(id)) return false; curId = id; if (view === 'shelf') place(); return true; },
    setFocus(f) { focus = !!f; },
    setView(v) {
      view = ['shelf', 'build', 'collection'].indexOf(v) >= 0 ? v : 'shelf';
      turn.visible = view === 'shelf'; buildG.visible = view === 'build'; collG.visible = view === 'collection';
      if (view === 'shelf' && curId && shapeLite !== isLite()) place();
      if (view === 'build' && buildLite !== isLite()) placeBuild();
      if (view === 'collection') buildCollection();
      if (view !== 'shelf') focus = false;
      dist = 9; changed(); return view;
    },
    setBuild(ids) { buildIds = ids.filter((id) => SH.IDS.includes(id)).slice(0, C.MAX_BUILD); placeBuild(); return buildIds.slice(); },
    setMode(m) { mode = C.MODES.indexOf(m) >= 0 ? m : 'auto'; const mm = C.modeFor(mode, rc.quality()); if (mm.level) rc.setQuality(mm.level); else rc.setQuality(O && O.fx ? O.fx() : 'high'); place(); if (view === 'build') placeBuild(); return { mode, lite: isLite(), level: rc.quality() }; },
    info() { return { id: curId, view, lite: view === 'shelf' ? shapeLite : isLite(), level: rc.quality(), mode, frames, yaw, focus, last, both: curId ? statsBoth(curId) : null, dist, passes: rc.stats().passes, build: { ids: buildIds.slice(), tris: buildStat.tris, draws: buildStat.draws, radius: buildR }, collection: collInfo }; },
    stats: statsBoth,
    spin(a) { yaw += a; },
    projectCollection(id) {                                    // test hook: where on the canvas (CSS px) a collection shape is
      let out = null;
      collG.traverse((o) => { if (o.userData && o.userData.id === id && o.isMesh) { const v = new THREE.Vector3(); o.getWorldPosition(v); v.y += 0.5; v.project(camera); const r = canvas.getBoundingClientRect(); out = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; } });
      return out;
    },
  };
  if (mode !== 'auto') { const mm = C.modeFor(mode, rc.quality()); if (mm.level) rc.setQuality(mm.level); }
  return api;
}

try {
  if (q.get('flat') === '1') window.GALLERY3D = { ok: false, reason: 'flat' };
  else if (!webglOK()) window.GALLERY3D = { ok: false, reason: 'no WebGL' };
  else window.GALLERY3D = start();
} catch (e) {
  window.GALLERY3D = { ok: false, reason: String(e && e.message ? e.message : e) };
}
window.dispatchEvent(new CustomEvent('gallery:stage'));
