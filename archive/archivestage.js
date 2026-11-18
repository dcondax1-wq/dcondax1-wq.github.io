// ARCHIVE's marble library (three.js r160 from ../jarvis/, the OLYMPUS render core): two bronze-and-marble bookcases, one shelf for each strategy family (up to 14). Every shelf holds three books: gold = adopted, olive = open, terracotta = rejected.
// A book's height follows how many runs it stands for (square-root scale). HISTORY, not a forecast. Tap a book to filter the library to that shelf.
// Light by design: <= 14 shelves x 3 books, one box geometry, bloom <= .25, a dpr cap of 1.5, no frame while hidden. If WebGL or the render core is missing, the page draws the flat twin.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { marble, metal } from '../olympus/materials.js';

const GOLD = '#c8a24a', BRONZE = '#9c6b3c', COLORS = ['#c8a24a', '#7f8a52', '#c96a4a'];
const SHELF_H = 0.84, BOOK_MAX = 0.7, COL_W = 3.0;

function createLibrary(canvas, opts) {
  const o = opts || {}, O = window.OLYMPUS || null, RM = o.reduced === true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a140e');
  const camera = new THREE.PerspectiveCamera(36, 1.8, 0.1, 60); camera.position.set(0, 2.9, 11.5); camera.lookAt(0, 2.8, 0);
  const rc = createRenderer({ canvas, scene, camera, maxDpr: 1.5, tint: GOLD, theme: { sky: '#2b2018', fog: '#2a2018', emissive: GOLD, bloom: '#e0b060', accent: GOLD }, bloom: { strength: 0.2, radius: 0.4, threshold: 1.0 } });
  const lite = rc.quality() === 'low' || rc.quality() === 'off';
  scene.add(new THREE.HemisphereLight(0xf0cf9a, 0x3a2a1a, 1.5));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2); sun.position.set(-3, 6, 6); scene.add(sun);
  const marbleMat = marble({ color: '#e8e1d2', vein: '#6d6252', roughness: 0.25, clearcoat: 0.6 }), bronzeMat = metal({ kind: 'gold', color: BRONZE });
  const bookGeo = new THREE.BoxGeometry(0.34, 1, 0.62), plankGeo = new THREE.BoxGeometry(COL_W - 0.2, 0.09, 0.8), sideGeo = new THREE.BoxGeometry(0.1, 1, 0.8);
  const mats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.08 }));
  const planks = [], shelves = [];
  for (let k = 0; k < 14; k++) {
    const col = k < 7 ? 0 : 1, row = k % 7, x0 = (col ? 1 : -1) * (COL_W / 2 + 0.2), y = row * SHELF_H;
    const g = new THREE.Group(); g.position.set(x0, y, 0); g.visible = false;
    const plank = new THREE.Mesh(plankGeo, bronzeMat); plank.position.y = -0.05; g.add(plank);
    const books = [0, 1, 2].map((b) => { const m = new THREE.Mesh(bookGeo, mats[b]); m.position.x = (b - 1) * 0.78; g.add(m); m.userData = { k, b }; return m; });
    g.userData = { k, books, h: [0, 0, 0], want: [0, 0, 0], plank };
    scene.add(g); shelves.push(g);
  }
  for (const col of [0, 1]) {            // the bookcase sides, marble
    const x = (col ? 1 : -1) * (COL_W / 2 + 0.2);
    for (const s of [-1, 1]) { const side = new THREE.Mesh(sideGeo, marbleMat); side.scale.y = 7 * SHELF_H; side.position.set(x + s * (COL_W / 2 - 0.05), 3.5 * SHELF_H - 0.1, 0); scene.add(side); planks.push(side); }
  }
  let sel = -1, dirty = true, disposed = false, n = 0;
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function layout() {
    for (const g of shelves) {
      const u = g.userData;
      u.books.forEach((m, b) => { const h = Math.max(0.001, u.h[b]); m.scale.y = h; m.position.y = h / 2; m.visible = u.want[b] > 0 || u.h[b] > 0.01; });
      g.scale.setScalar(u.k === sel ? 1.04 : 1);
    }
  }
  function resize() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || 200; camera.aspect = w / h; camera.updateProjectionMatrix(); rc.resize(w, h); dirty = true; }
  function pick(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1)); ray.setFromCamera(ptr, camera);
    const meshes = []; for (const g of shelves) if (g.visible) for (const m of g.userData.books) meshes.push(m);
    const hit = ray.intersectObjects(meshes, false)[0]; if (hit && o.onPick) o.onPick(hit.object.userData.k, hit.object.userData.b);
  }
  canvas.addEventListener('pointerup', pick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas);
  resize(); layout();
  let last = performance.now(), lastTick = 0;
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const gap = O && O.frameGap ? O.frameGap() : 0;
    if ((O ? O.hidden() : document.hidden) || (gap && now - lastTick < gap - 3)) return;
    lastTick = now;
    let moving = false; const k = RM ? 1 : Math.min(1, dt * 4);
    for (const g of shelves) { const u = g.userData; for (let b = 0; b < 3; b++) if (Math.abs(u.want[b] - u.h[b]) > 0.002) { u.h[b] += (u.want[b] - u.h[b]) * k; moving = true; } }
    if (moving || dirty) { layout(); rc.render(); dirty = false; }
  }
  requestAnimationFrame(loop);
  return {
    lite, count: () => shelves.filter((g) => g.visible).length, quality: () => rc.quality(), passes: () => rc.passes(),
    /** s = [{ name, books: [{ k, n, h }] x 3 }] from archivecore.shelves(): h is 0..1 of the tallest book */
    set(s) {
      n = Math.min(14, (s || []).length);
      shelves.forEach((g, i) => { const u = g.userData, it = s && s[i]; g.visible = !!it; for (let b = 0; b < 3; b++) { u.want[b] = it ? it.books[b].h * BOOK_MAX : 0; if (RM) u.h[b] = u.want[b]; } });
      dirty = true;
    },
    select(i) { sel = i; dirty = true; }, get selected() { return sel; },
    heights() { return shelves.filter((g) => g.visible).map((g) => g.userData.want.map((x) => Math.round(x * 1000) / 1000)); },
    screenOf(i, b) { const g = shelves[i]; if (!g || !g.visible) return null; const v = new THREE.Vector3(g.position.x + ((b == null ? 1 : b) - 1) * 0.78, g.position.y + Math.max(0.1, g.userData.want[b == null ? 1 : b]) / 2, 0).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 }; },
    dispose() { disposed = true; canvas.removeEventListener('pointerup', pick); if (ro) ro.disconnect(); try { rc.dispose(); } catch (_) { /* gone */ } },
  };
}
window.ARCHIVE_LIB = { createLibrary };   // read by archive.js (a second module tag, so a failed 3D load never stops the page)
