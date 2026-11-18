// PINAKES scene (ES module): a marble card-catalogue cabinet in a lamp-lit archive. Its five drawers are the districts (three r160, ../jarvis/three.module.min.js, no post passes).
//   the cabinet   a veined marble carcass (CC0 scan) on a stepped plinth with a painted Greek-key band, a gilded egg-and-dart cornice under a low pediment
//                 with a gold medallion, two bronze lamps on the top; five oak drawer fronts with a bronze label frame, the district's name and table count, a gold pull
//   a drawer      slides out when its district is chosen (400 ms ease-out, instant on reduced motion) and its ivory index cards fan up: the page then lists that district's tables
//   the light     the env-kit golden HDRI (image light and reflections) + a warm key from the left; a painted archive backdrop; soft shadows on a GPU. No glow, no bloom.
//   cost          the drawers, cards, frames and pulls are instanced (about 16 draws in all); it draws only while something moves or a texture arrives (no idle spin),
//                 so a still cabinet costs nothing
// QA Round 6 bug 8 (olympus/hero-stage.js dress + olympus/env-kit.js).
// createCabinet(canvas, { O, districts: [{name, tables}], onPick(i) }) -> { select(i | -1), selected(), frames(), dispose() } or null when WebGL is not available (the page then draws its flat cabinet)
import * as THREE from '../jarvis/three.module.min.js';
import { dress, boxGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const N = 5, DW = 1.06, DH = 2.0, GAP = 0.08, DEPTH = 1.5, OUT = 1.05, CARDS = 9;
const ease = (t) => 1 - Math.pow(1 - t, 3);

function labelAtlas(districts) {
  const c = document.createElement('canvas'); c.width = 256 * N; c.height = 150;
  const g = c.getContext('2d');
  for (let i = 0; i < N; i++) {
    const d = districts[i] || { name: '', tables: 0 }, x = i * 256;
    const gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, '#f4ecd8'); gr.addColorStop(1, '#e2d5b6'); g.fillStyle = gr; g.fillRect(x, 0, 256, 150);
    g.strokeStyle = 'rgba(120,90,40,0.45)'; g.lineWidth = 3; g.strokeRect(x + 8, 8, 240, 134);
    g.fillStyle = '#2a2217'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "600 54px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"; g.fillText(d.name, x + 128, 56, 232);
    g.fillStyle = '#6b5a3c'; g.font = '600 32px Georgia, serif'; g.fillText(`${d.tables} ${d.tables === 1 ? 'table' : 'tables'}`, x + 128, 112, 232);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createCabinet(canvas, { O = null, districts = [], onPick = null } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return null;
  const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.3, 0.1, 80);
  const tier = O && O.fx ? O.fx() : 'high';
  const D = dress({ renderer, scene, camera, tier, palette: 'hall', hdri: 'golden', envI: 0.85, sunDir: [-0.55, 0.62, 0.75], key: 2.2, rim: 0.6, shadowExt: 5, sky: { sunX: 0.5, sunY: 0.5, temple: false, cypress: false, disc: false }, fogNear: 14, fogFar: 34 });
  const { kit, B } = D;
  const W = N * DW + (N + 1) * GAP, H = DH + 2 * GAP, yF = -H / 2 - 0.36;
  const made = [];
  // the carcass, merged by material (marble, a darker marble, the painted bands): back, top, bottom, sides and dividers, plinth, cornice
  B.box('marble:uv', 0, 0, -DEPTH / 2, W, H, 0.08, 0, '#bfb39c');
  B.box('marble:uv', 0, H / 2 + 0.07, 0, W + 0.16, 0.14, DEPTH + 0.1, 0, '#ece4d2');
  B.box('marble:uv', 0, -H / 2 - 0.07, 0, W + 0.16, 0.14, DEPTH + 0.1, 0, '#ece4d2');
  for (let i = 0; i <= N; i++) B.box('marble:uv', -W / 2 + GAP / 2 + i * (DW + GAP), 0, 0, GAP, H, DEPTH, 0, '#ece4d2');
  B.box('marble:uv', 0, -H / 2 - 0.25, 0.05, W + 0.5, 0.22, DEPTH + 0.5, 0, '#cfc5b0');
  B.box('marble:uv', 0, -H / 2 - 0.36 + 0.03, 0.05, W + 0.8, 0.06, DEPTH + 0.8, 0, '#c4b8a2');
  B.box('marble:uv', 0, H / 2 + 0.19, 0, W + 0.36, 0.1, DEPTH + 0.26, 0, '#d8cfbd');
  B.box('marble:uv', 0, H / 2 + 0.29, 0, W + 0.5, 0.1, DEPTH + 0.36, 0, '#ece4d2');
  const ped = new THREE.Shape(); ped.moveTo(-W / 2 - 0.25, 0); ped.lineTo(W / 2 + 0.25, 0); ped.lineTo(0, 0.62); ped.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: DEPTH + 0.2, bevelEnabled: false }); pedGeo.translate(0, 0, -(DEPTH + 0.2) / 2);
  B.add('marble', pedGeo, mat4(0, H / 2 + 0.34, 0), '#e6ddca');
  B.add('gold', new THREE.CylinderGeometry(0.16, 0.16, 0.04, 28), mat4(0, H / 2 + 0.55, DEPTH / 2 + 0.11, 0, 1, Math.PI / 2));
  // the key band on the plinth, the egg-and-dart on the cornice
  D.paint('meander', { bg: '#e6d8bb', fg: '#6e2f1c' }); D.paint('eggdart');
  { const g = new THREE.PlaneGeometry(W + 0.4, 0.14); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (W + 0.4) / (0.14 * 8)); B.add('paint:meander', g, mat4(0, -H / 2 - 0.25, DEPTH / 2 + 0.301)); }
  { const g = new THREE.PlaneGeometry(W + 0.36, 0.09); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (W + 0.36) / (0.09 * 8)); B.add('paint:eggdart', g, mat4(0, H / 2 + 0.19, DEPTH / 2 + 0.131)); }
  // two bronze oil lamps on the top corners
  for (const sx of [-1, 1]) B.lathe('bronze', [[0.0001, 0], [0.12, 0], [0.08, 0.05], [0.05, 0.22], [0.16, 0.26], [0.18, 0.32], [0.0001, 0.3]], sx * (W / 2 - 0.05), H / 2 + 0.34, 0.2, 1, 18);
  D.ground({ mat: 'mosaic', color: '#6e5642', r: 18, y: yF });
  D.build(scene);
  // the drawers: five fronts, frames, pulls, inner boxes and the cards, each one instanced draw; the labels share one atlas (one draw each)
  const wood = kit.mat('wood', { color: '#6e4a2c' });
  const innerG = mergeParts([[boxGeo(DW - 0.08, 0.06, DEPTH - 0.1), mat4(0, -DH / 2 + 0.05, 0)], [boxGeo(0.04, DH * 0.55, DEPTH - 0.1), mat4(-DW / 2 + 0.06, -DH * 0.2, 0)], [boxGeo(0.04, DH * 0.55, DEPTH - 0.1), mat4(DW / 2 - 0.06, -DH * 0.2, 0)]]);
  const frontG = mergeParts([[boxGeo(DW, DH, 0.1)], [boxGeo(DW - 0.16, DH - 0.16, 0.03), mat4(0, -0.02, 0.06)]]);
  const parts = {
    front: new THREE.InstancedMesh(frontG, kit.mat('wood', { color: '#8a5f3e', tag: 'front' }), N),
    inner: new THREE.InstancedMesh(innerG, wood, N),
    frame: new THREE.InstancedMesh(boxGeo(DW * 0.9, 0.58, 0.03), kit.mat('bronze'), N),
    knob: new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 18, 12), kit.mat('gold'), N),
    cards: new THREE.InstancedMesh(boxGeo(DW - 0.22, DH * 0.6, 0.02), kit.mat('paint', { color: '#efe6d2', rough: 0.85 }), N * CARDS),
  };
  for (const k in parts) { parts[k].frustumCulled = false; D.shade(parts[k]); scene.add(parts[k]); }
  const atlas = labelAtlas(districts), labels = [];
  for (let i = 0; i < N; i++) {
    const lg = new THREE.PlaneGeometry(DW * 0.82, 0.48), uv = lg.getAttribute('uv'); for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / N); made.push(lg);
    const lm = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: true, color: '#e8dcc4' }); made.push(lm);
    const label = new THREE.Mesh(lg, lm); scene.add(label); labels.push(label);
  }
  D.tune();
  const drawers = []; for (let i = 0; i < N; i++) drawers.push({ x: -W / 2 + GAP + DW / 2 + i * (DW + GAP), pos: 0, to: 0 });
  const ON = new THREE.Color('#ffe6b0'), OFF = new THREE.Color(1, 1, 1);
  function layoutDrawers() {
    drawers.forEach((d, i) => {
      const e = ease(d.pos), z = e * OUT;
      parts.front.setMatrixAt(i, mat4(d.x, 0, DEPTH / 2 + 0.02 + z)); parts.inner.setMatrixAt(i, mat4(d.x, 0, z));
      parts.frame.setMatrixAt(i, mat4(d.x, DH * 0.2, DEPTH / 2 + 0.08 + z)); parts.knob.setMatrixAt(i, mat4(d.x, -DH * 0.22, DEPTH / 2 + 0.13 + z));
      labels[i].position.set(d.x, DH * 0.2, DEPTH / 2 + 0.1 + z);
      for (let k = 0; k < CARDS; k++) { const up = Math.max(0, Math.min(1, e * 1.6 - k * 0.07)); parts.cards.setMatrixAt(i * CARDS + k, mat4(d.x, -DH * 0.14 + up * 0.34 * (1 - k / (CARDS * 1.6)), DEPTH / 2 - 0.2 - k * 0.13 + z, 0, 1, -up * 0.38)); }
    });
    for (const k in parts) parts[k].instanceMatrix.needsUpdate = true;
  }
  D.blobs([[0, 0.05, W * 0.62, 0.9, yF + 0.012, DEPTH * 0.75]], { opacity: 0.45 });

  let sel = -1, raf = 0, stopped = false, frames = 0, dirty = true, last = 0, lift = 0, liftTo = 0, seen = -1;
  function size() {
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 260, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); D.backdrop(w, h); dirty = true; }
  }
  function place() {
    const half = (W + 1.0) / 2, dist = half / (Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect) + DEPTH;
    camera.position.set(0.35, 0.95 + lift * 2.2, dist + lift * 0.3); camera.lookAt(0, 0.12, lift * 0.5);
  }
  function step(dt) {
    let moving = false; const k = reduced() ? 1 : Math.min(1, dt / 0.4);
    for (const d of drawers) if (d.pos !== d.to) { d.pos = Math.abs(d.to - d.pos) <= k ? d.to : d.pos + Math.sign(d.to - d.pos) * k; moving = true; }
    if (lift !== liftTo) { lift = Math.abs(liftTo - lift) <= k ? liftTo : lift + Math.sign(liftTo - lift) * k; moving = true; }
    if (moving) layoutDrawers();
    return moving;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || document.hidden) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    size();
    const files = kit.stats().files; if (files !== seen) { seen = files; dirty = true; }        // a texture or the HDRI arrived: draw once more
    const moving = step(dt);
    if (!moving && !dirty) return;
    place(); renderer.render(scene, camera); dirty = false; frames++;
  }
  layoutDrawers();
  raf = requestAnimationFrame(frame);

  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 12) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect(); v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObject(parts.front, false)[0];
    if (hit && onPick && hit.instanceId != null) onPick(hit.instanceId);
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);
  window.__heroStats = () => Object.assign(D.stats(), { frames, calls: renderer.info.render.calls });

  return {
    select(i) {
      sel = Number.isInteger(i) && i >= 0 && i < N ? i : -1;
      drawers.forEach((d, j) => { d.to = j === sel ? 1 : 0; parts.front.setColorAt(j, j === sel ? ON : OFF); });
      if (parts.front.instanceColor) parts.front.instanceColor.needsUpdate = true;
      liftTo = sel >= 0 ? 1 : 0; dirty = true;
      if (reduced()) { step(1); }
    },
    selected: () => sel, frames: () => frames, open: () => drawers.map((d) => d.pos), stats: () => D.stats(),
    dispose() {
      stopped = true; cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      try { made.forEach((g) => g.dispose()); atlas.dispose(); for (const k in parts) parts[k].geometry.dispose(); D.dispose(); renderer.dispose(); } catch (_) { /* gone */ }
    },
  };
}
