/* THE BRAIN, a region's live chart (brain/chart3d.js, ES module; day-brain-app 2026-11-24). The PC's NQ 5-minute bars (nq/nqbars.js via
 * braincore.chartOf) as a 3D candle landscape with that bot's levels drawn through it: the swept level (gold), the limit (lavender), the
 * stop (red), the target (mint), an FVG as a violet glass slab, the expansion leg's fib (OTE) lines, plain liquidity levels as dim violet
 * lines, and a pulsing gold last price. A drag turns it; it sways slowly by itself. With no WebGL (or the brain's 2D mode) it draws the same
 * on a 2D canvas. Labels are HTML (the page places them from api.labels()). Read only: no fetch, no storage.
 *   mount(box, THREE | null, chart) -> api { update(chart), labels() -> [{y, text, kind, color}], mode, dispose() }  */
export const KIND_COLOR = { sweep: '#f1c14b', entry: '#dacbf0', stop: '#ef4444', target: '#77db89', fvg: '#9d59ee', fib: '#c58cff', leg: '#c58cff', level: '#7a4bc0', cisd: '#e9d58a' };
const UP = '#77db89', DN = '#ef4444';
const W = 10, H = 5.4, D = 0.42;

const fmt = (v) => (v == null ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function scaleOf(ch) { const lo = ch.lo, hi = ch.hi, pad = (hi - lo) * 0.06 || 2; return { lo: lo - pad, hi: hi + pad, y: (p) => ((p - (lo - pad)) / ((hi + pad) - (lo - pad))) * H }; }
function labelRows(ch) {
  return (ch.levels || []).filter((l) => l.kind !== 'leg').map((l) => ({ price: l.price, text: `${l.label || l.kind} ${fmt(l.price)}`, kind: l.kind, color: KIND_COLOR[l.kind] || '#a99cc2' }));
}

/* ---------------- 2D ---------------- */
function draw2d(cv, ch) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr);
  const g = cv.getContext('2d'); if (!g) return [];
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  const n = ch.candles.length; if (!n) return [];
  const S = scaleOf(ch), w = r.width - 8, h = r.height - 10, X = (i) => 4 + (i + 0.5) * (w / n), Y = (p) => 5 + h - (S.y(p) / H) * h;
  for (const l of ch.levels) {
    const c = KIND_COLOR[l.kind] || '#7a4bc0';
    if (l.kind === 'fvg' && l.price2 != null) { g.fillStyle = 'rgba(157,89,238,.22)'; const a = Y(l.price), b = Y(l.price2); g.fillRect(0, Math.min(a, b), r.width, Math.abs(a - b)); continue; }
    if (l.kind === 'leg') continue;
    g.strokeStyle = c; g.globalAlpha = l.kind === 'level' ? 0.55 : 0.95; g.lineWidth = l.kind === 'level' || l.kind === 'fib' ? 1 : 1.6;
    g.setLineDash(l.kind === 'fib' ? [3, 4] : l.kind === 'level' ? [6, 5] : []); g.beginPath(); g.moveTo(0, Y(l.price)); g.lineTo(r.width, Y(l.price)); g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1;
  ch.candles.forEach((b, i) => {
    const up = b.c >= b.o; g.strokeStyle = g.fillStyle = up ? UP : DN;
    g.beginPath(); g.moveTo(X(i), Y(b.h)); g.lineTo(X(i), Y(b.l)); g.lineWidth = 1; g.stroke();
    const bw = Math.max(2, w / n * 0.62); g.fillRect(X(i) - bw / 2, Math.min(Y(b.o), Y(b.c)), bw, Math.max(1, Math.abs(Y(b.o) - Y(b.c))));
  });
  g.fillStyle = '#f1c14b'; g.beginPath(); g.arc(X(n - 1), Y(ch.last), 3.5, 0, Math.PI * 2); g.fill();
  return labelRows(ch).map((l) => ({ ...l, y: Y(l.price) }));
}

/* ---------------- 3D ---------------- */
export function mount(box, THREE, chart) {
  const cv = document.createElement('canvas'); cv.className = 'c3'; box.prepend(cv);
  let ch = chart, lab = [], api;
  let renderer = null;
  if (THREE) { try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); if (!renderer.getContext()) renderer = null; } catch (_) { renderer = null; } }
  if (!renderer) {
    const redraw = () => { lab = draw2d(cv, ch); };
    redraw(); const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(redraw) : null; if (ro) ro.observe(cv);
    return { mode: '2d', update(c) { ch = c; redraw(); }, labels: () => lab, dispose() { if (ro) ro.disconnect(); cv.remove(); } };
  }
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(36, 1, 0.1, 60), root = new THREE.Group(); scene.add(root);
  scene.fog = new THREE.Fog(0x000000, 12, 26);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55)); const key = new THREE.DirectionalLight(0xdacbf0, 1.4); key.position.set(-4, 8, 6); scene.add(key);
  const grid = new THREE.GridHelper(14, 28, 0x4d2e76, 0x24143a); grid.position.y = -H / 2 - 0.25; scene.add(grid);
  const wall = new THREE.GridHelper(14, 24, 0x3e255e, 0x1a1028); wall.rotation.x = Math.PI / 2; wall.position.set(0, 0.6, -D * 2.2); wall.material.transparent = true; wall.material.opacity = 0.45; scene.add(wall);
  const box3 = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.35, metalness: 0.1, emissiveIntensity: 0.55 });
  let bodies = null, wicks = null, extras = [];
  const mU = new THREE.Color(UP), mD = new THREE.Color(DN);
  function clearExtras() { for (const o of extras) { root.remove(o); if (o.geometry && o.geometry !== box3) o.geometry.dispose(); if (o.material) o.material.dispose(); } extras = []; }
  function build() {
    if (bodies) { root.remove(bodies); root.remove(wicks); bodies.dispose(); wicks.dispose(); }
    clearExtras();
    const n = ch.candles.length, S = scaleOf(ch), step = W / Math.max(1, n), X = (i) => -W / 2 + (i + 0.5) * step;
    bodies = new THREE.InstancedMesh(box3, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15, emissive: 0x150a24 }), Math.max(1, n));
    wicks = new THREE.InstancedMesh(box3, new THREE.MeshBasicMaterial({ color: 0xdacbf0, transparent: true, opacity: 0.6 }), Math.max(1, n));
    const m = new THREE.Matrix4();
    ch.candles.forEach((b, i) => {
      const y0 = S.y(Math.min(b.o, b.c)), y1 = S.y(Math.max(b.o, b.c)), hh = Math.max(0.03, y1 - y0);
      m.makeScale(step * 0.62, hh, D).setPosition(X(i), y0 + hh / 2, 0); bodies.setMatrixAt(i, m); bodies.setColorAt(i, b.c >= b.o ? mU : mD);
      const w0 = S.y(b.l), w1 = S.y(b.h); m.makeScale(0.035, Math.max(0.02, w1 - w0), 0.035).setPosition(X(i), (w0 + w1) / 2, 0); wicks.setMatrixAt(i, m);
    });
    bodies.count = wicks.count = n; root.add(bodies, wicks);
    for (const l of ch.levels) {
      const c = new THREE.Color(KIND_COLOR[l.kind] || '#7a4bc0');
      if (l.kind === 'leg') continue;
      if (l.kind === 'fvg' && l.price2 != null) {
        const a = S.y(l.price), b = S.y(l.price2), slab = new THREE.Mesh(box3, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false }));
        slab.scale.set(W + 0.6, Math.max(0.02, Math.abs(a - b)), 0.04); slab.position.z = -D; slab.position.set(0, (a + b) / 2, 0); root.add(slab); extras.push(slab); continue;
      }
      const thick = l.kind === 'level' || l.kind === 'fib' ? 0.012 : 0.026;
      const bar = new THREE.Mesh(box3, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: l.kind === 'level' ? 0.45 : l.kind === 'fib' ? 0.6 : 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      bar.scale.set(W + 0.6, thick, thick); bar.position.set(0, S.y(l.price), 0); root.add(bar); extras.push(bar);
      if (l.kind !== 'level' && l.kind !== 'fib') {      // a soft glow plane behind the trade's own lines
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 0.22), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.set(0, S.y(l.price), -D * 1.3); root.add(glow); extras.push(glow);
      }
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf1c14b }));
    dot.position.set(X(n - 1) + step * 0.6, S.y(ch.last), 0); root.add(dot); extras.push(dot); api.dot = dot;
    root.position.set(0, -H / 2, 0);
  }
  let yaw = -0.28, drag = null, last = 0, raf = 0, on = true, tUser = 0;
  const size = () => { const r = cv.getBoundingClientRect(); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(r.width || 360, r.height || 240, false); cam.aspect = (r.width || 360) / (r.height || 240); cam.updateProjectionMatrix(); kick(); };
  function place() { cam.position.set(Math.sin(yaw) * 10.4, 0.9, Math.cos(yaw) * 10.4); cam.lookAt(0, 0, 0); }
  function labels() {
    const S = scaleOf(ch), r = cv.getBoundingClientRect(), v = new THREE.Vector3();
    return labelRows(ch).map((l) => { v.set(0, S.y(l.price) - H / 2, 0).project(cam); return { ...l, y: (1 - v.y) / 2 * r.height }; });
  }
  function frame(t) {
    raf = 0; if (!on) return;
    if (!reduce && !drag && t - tUser > 3500) yaw = -0.28 + Math.sin(t / 5200) * 0.2;
    place(); if (api.dot) api.dot.scale.setScalar(1 + 0.25 * Math.sin(t / 260));
    renderer.render(scene, cam); last = t;
    if (api.onFrame) api.onFrame();
    if (!reduce || drag) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && on) raf = requestAnimationFrame(frame); }
  const down = (e) => { drag = { x: e.clientX, yaw }; tUser = performance.now(); kick(); };
  const move = (e) => { if (!drag) return; yaw = Math.max(-1.1, Math.min(1.1, drag.yaw + (e.clientX - drag.x) * 0.01)); tUser = performance.now(); kick(); };
  const up = () => { drag = null; };
  cv.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { on = es.some((x) => x.isIntersecting) && document.visibilityState !== 'hidden'; kick(); }) : null; if (io) io.observe(cv);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (ro) ro.observe(cv);
  api = { mode: '3d', dot: null, onFrame: null, update(c) { ch = c; build(); kick(); }, labels, dispose() { on = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); cv.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); renderer.dispose(); cv.remove(); } };
  build(); size(); place(); kick();
  return api;
}
