// OLYMPUS controls for a phone (shared by every 3D world, 2026-11-11 "scene direction" pass). Feels like a mobile game: tap the ground and your character
// walks there around obstacles, tap a person to walk up and talk, swipe to look, pinch to zoom; a joystick only as an option. Plus the small HUD: hints
// that fade after first use, name plates only for the people near you, a context ring of actions when you tap someone, one call to action.
// Pure parts (node-tested in tests/test_scene_direction.py): createGrid / findPath / smoothPath / createWalker / approach / declutter / ringLayout.
// DOM parts: gestures(el, handlers), joystick(box, onMove), createHud(container, opts). Text only through textContent. Safari 16 safe.
//
//   gestures(el, { tap(x, y, e), drag(dx, dy, e), dragEnd(vx, vy), pinch(k, cx, cy), longPress(x, y) }) -> { off(), busy() }
//   createGrid({ x0, x1, z0, z1, cell }, blocked(x, z) -> bool, { pad }) -> grid ; findPath(grid, a, b) -> [{x, z}] | null (A*, 8 ways, no corner cutting, string-pulled)
//   createWalker({ speed, turn, radius }) -> { go(path, onArrive), stop(), tick(dt) -> { x, z, yaw, moving, arrived }, place(x, z, yaw), pos }
//   approach(from, person, gap) -> the spot in front of a person to walk to (facing them)
//   createHud(container, { reduced, store }) -> { hint(key, text, { ms }), used(key), plates(list), ring(x, y, actions, onPick), closeRing(), cta(text, onTap), clearCta(), toast(text), dispose() }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isNum = (v) => typeof v === 'number' && isFinite(v);

// ------------------------------------------------------------------------------------------------ navigation grid + A*
/** an occupancy grid. blocked(x, z) says whether a point is solid; pad (metres) keeps paths that far from anything solid */
export function createGrid(box, blocked, opts) {
  const b = box || {}, cell = b.cell || 0.5, x0 = b.x0 || 0, z0 = b.z0 || 0, w = Math.max(1, Math.ceil(((b.x1 || 10) - x0) / cell)), h = Math.max(1, Math.ceil(((b.z1 || 10) - z0) / cell));
  const pad = opts && isNum(opts.pad) ? opts.pad : 0.3, solid = new Uint8Array(w * h);
  const ring = pad > 0 ? [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad], [pad * 0.7, pad * 0.7], [-pad * 0.7, pad * 0.7], [pad * 0.7, -pad * 0.7], [-pad * 0.7, -pad * 0.7]] : [[0, 0]];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell; solid[j * w + i] = ring.some((d) => blocked(x + d[0], z + d[1])) ? 1 : 0; }
  const toCell = (x, z) => ({ i: clamp(Math.floor((x - x0) / cell), 0, w - 1), j: clamp(Math.floor((z - z0) / cell), 0, h - 1) });
  const toWorld = (i, j) => ({ x: x0 + (i + 0.5) * cell, z: z0 + (j + 0.5) * cell });
  const free = (i, j) => i >= 0 && j >= 0 && i < w && j < h && !solid[j * w + i];
  const freeAt = (x, z) => { const c = toCell(x, z); return x >= x0 && z >= z0 && x < x0 + w * cell && z < z0 + h * cell && free(c.i, c.j); };
  /** the nearest free cell to a point (a tap on a table walks you next to it) */
  function nearestFree(x, z, maxR) {
    const c = toCell(x, z); if (free(c.i, c.j)) return { i: c.i, j: c.j };
    const M = Math.ceil((maxR || 4) / cell);
    for (let r = 1; r <= M; r++) { let best = null, bd = 1e9; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = c.i + di, j = c.j + dj; if (!free(i, j)) continue; const p = toWorld(i, j), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = { i, j }; } } if (best) return best; }
    return null;
  }
  return { w, h, cell, x0, z0, solid, toCell, toWorld, free, freeAt, nearestFree };
}
/** straight line on the grid (Bresenham-ish supercover): true when every cell between is free */
export function lineFree(g, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (g.cell * 0.34)));
  for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n; if (!g.freeAt(x, z)) return false; }
  return true;
}
/** A* from a to b (world points). Returns the waypoints (string-pulled, ending at b or the nearest free spot to it) or null when there is no way */
export function findPath(g, a, b, opts) {
  const s0 = g.nearestFree(a.x, a.z, 3), e0 = g.nearestFree(b.x, b.z, (opts && opts.reach) || 4);
  if (!s0 || !e0) return null;
  const W = g.w, start = s0.j * W + s0.i, N = g.w * g.h; let goal = e0.j * W + e0.i;
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], hq = (n) => { const i = n % W, j = (n - i) / W, gi = goal % W, gj = (goal - gi) / W, dx = Math.abs(i - gi), dj = Math.abs(j - gj); return Math.max(dx, dj) + 0.4142 * Math.min(dx, dj); };
  const push = (n, f) => { heap.push([f, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  gs[start] = 0; push(start, hq(start));
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let found = start === goal, guard = 0, near = start, nearH = Infinity;
  while (heap.length && !found && guard++ < N * 8) {
    const [, n] = pop(); if (closed[n]) continue; closed[n] = 1;
    { const hn = hq(n); if (hn < nearH) { nearH = hn; near = n; } }
    if (n === goal) { found = true; break; }
    const i = n % W, j = (n - i) / W;
    for (const [di, dj, c] of D) {
      const ni = i + di, nj = j + dj; if (!g.free(ni, nj)) continue;
      if (di && dj && (!g.free(i + di, j) || !g.free(i, j + dj))) continue;          // no corner cutting
      const m = nj * W + ni, ng = gs[n] + c; if (ng < gs[m]) { gs[m] = ng; from[m] = n; push(m, ng + hq(m)); }
    }
  }
  let partial = false;
  if (!found) { if (!(opts && opts.closest) || near === start) return null; goal = near; partial = true; }      // closest: walk as near as you can get (a corner nobody can reach)
  const cells = []; for (let n = goal; n >= 0; n = n === start ? -1 : from[n]) cells.push(g.toWorld(n % W, Math.floor(n / W)));
  cells.reverse();
  const endFree = !partial && g.freeAt(b.x, b.z), pts = [{ x: a.x, z: a.z }].concat(cells.slice(1, -1), [endFree ? { x: b.x, z: b.z } : cells[cells.length - 1]]);
  return smoothPath(g, pts);
}
/** string pulling: drop every waypoint you can see past */
export function smoothPath(g, pts) {
  if (!pts || pts.length <= 2) return pts ? pts.slice() : pts;
  const out = [pts[0]]; let k = 0;
  while (k < pts.length - 1) { let far = k + 1; for (let m = pts.length - 1; m > k + 1; m--) if (lineFree(g, pts[k], pts[m])) { far = m; break; } out.push(pts[far]); k = far; }
  return out;
}
/** where to stand to talk to a person: `gap` metres in front of them, on the side you come from */
export function approach(from, person, gap) {
  const G = gap || 1.35, dx = from.x - person.x, dz = from.z - person.z, d = Math.hypot(dx, dz) || 1;
  const fx = isNum(person.yaw) ? Math.sin(person.yaw) : dx / d, fz = isNum(person.yaw) ? Math.cos(person.yaw) : dz / d;
  const mx = (fx * 0.6 + (dx / d) * 0.4), mz = (fz * 0.6 + (dz / d) * 0.4), m = Math.hypot(mx, mz) || 1;   // mostly in front of them, a little toward you
  return { x: person.x + (mx / m) * G, z: person.z + (mz / m) * G, yaw: Math.atan2(-mx, -mz) };
}

// ------------------------------------------------------------------------------------------------ the walker (your character following a path)
export function createWalker(opts) {
  const o = opts || {}, speed = o.speed || 2.6, turn = o.turn || 9;
  const W = { x: 0, z: 0, yaw: 0, path: null, k: 0, v: 0, moving: false, done: null, arrived: false, face: null };
  function step(dt) {
    W.arrived = false;
    if (!W.path) { W.v = Math.max(0, W.v - dt * 6); W.moving = false; if (W.face != null) W.yaw += angDiff(W.yaw, W.face) * Math.min(1, dt * turn * 0.7); return; }
    const p = W.path[W.k], dx = p.x - W.x, dz = p.z - W.z, d = Math.hypot(dx, dz), last = W.k === W.path.length - 1;
    W.v = Math.min(speed, W.v + dt * speed * 3.2);
    if (last && d < 1.2) W.v = Math.max(0.6, Math.min(W.v, d * 2.4));                     // ease in to the stop
    const want = Math.atan2(dx, dz); W.yaw += angDiff(W.yaw, want) * Math.min(1, dt * turn);
    const mv = Math.min(d, W.v * dt);
    if (d > 1e-6) { W.x += (dx / d) * mv; W.z += (dz / d) * mv; }
    W.moving = true;
    if (d - mv < 0.04) { if (last) { const cb = W.done; W.path = null; W.done = null; W.moving = false; W.arrived = true; if (cb) { try { cb(); } catch (_) { /* fine */ } } } else W.k++; }
  }
  return {
    go(path, onArrive, face) { if (!path || !path.length) return false; W.path = path.slice(path.length > 1 && Math.hypot(path[0].x - W.x, path[0].z - W.z) < 0.05 ? 1 : 0); if (!W.path.length) { W.path = null; if (onArrive) onArrive(); return true; } W.k = 0; W.done = onArrive || null; W.face = isNum(face) ? face : null; return true; },
    stop() { W.path = null; W.done = null; W.moving = false; },
    faceTo(yaw) { W.face = isNum(yaw) ? yaw : null; },
    place(x, z, yaw) { W.x = x; W.z = z; if (isNum(yaw)) W.yaw = yaw; W.path = null; W.moving = false; },
    tick(dt) { const t = clamp(+dt || 0, 0, 0.1); step(t); return { x: W.x, z: W.z, yaw: W.yaw, moving: W.moving, arrived: W.arrived, speed: W.v }; },
    get pos() { return { x: W.x, z: W.z, yaw: W.yaw }; },
    get path() { return W.path ? W.path.slice(W.k) : null; },
  };
}
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ------------------------------------------------------------------------------------------------ HUD layout maths (pure)
/** name plates: which to show (nearest first, the important ones always, at most `max`), with overlapping ones dropped */
export function declutter(list, opts) {
  const o = opts || {}, max = o.max || 4, maxD = o.maxD || 9, W = o.w || 390, H = o.h || 844, safe = o.safe || { x: 0.5, y: 0.5, rx: 0, ry: 0 };
  const rows = (list || []).filter((p) => p && p.front !== false && isNum(p.x) && isNum(p.y) && p.x > -20 && p.x < W + 20 && p.y > 10 && p.y < H - 10 && (p.important || (isNum(p.dist) && p.dist <= maxD)))
    .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (a.dist || 0) - (b.dist || 0));
  const out = [];
  for (const p of rows) {
    if (out.length >= max) break;
    const w = p.w || Math.max(64, Math.min(170, 9 + 7.2 * String(p.name || '').length)), h = p.h || 30, box = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y };
    if (out.some((q) => box.x0 < q.box.x1 && box.x1 > q.box.x0 && box.y0 < q.box.y1 && box.y1 > q.box.y0)) continue;
    out.push({ ...p, box, alpha: p.important ? 1 : clamp(1.25 - (p.dist || 0) / maxD, 0.35, 1) });
  }
  return out;
}
/** the context ring: n round buttons in an arc under a point (the person's speech bubble is above their head), kept inside the box and off its edges */
export function ringLayout(x, y, n, opts) {
  const o = opts || {}, R = o.r || 78, B = o.size || 56, W = o.w || 390, H = o.h || 844, m = B / 2 + 8;
  const cx = clamp(x, m + R * 0.7, W - m - R * 0.7), cy = clamp(y + 28, m + 10, H - m - R);
  const span = Math.PI * (n <= 2 ? 0.55 : n === 3 ? 0.8 : 1.0), a0 = Math.PI / 2 + span / 2;
  const out = [];
  for (let i = 0; i < n; i++) { const a = n === 1 ? Math.PI / 2 : a0 - (span * i) / (n - 1); out.push({ x: Math.round(clamp(cx + Math.cos(a) * R, m, W - m)), y: Math.round(clamp(cy + Math.sin(a) * R * 0.8, m, H - m)) }); }
  return { cx, cy, items: out };
}

// ------------------------------------------------------------------------------------------------ gestures (DOM)
/** tap / one-finger drag (look) / two-finger pinch (zoom) on an element. Pointer events; a tap is short and still. */
export function gestures(el, h, opts) {
  const o = opts || {}, P = new Map(); let pinch0 = 0, moved = 0, t0 = 0, lp = 0, last = null, vel = { x: 0, y: 0 }, lastT = 0;
  try { el.style.touchAction = 'none'; } catch (_) { /* fine */ }
  const call = (name, ...a) => { if (typeof h[name] === 'function') { try { return h[name](...a); } catch (e) { if (o.debug) console.warn(e); } } return undefined; };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    P.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    if (P.size === 1) { moved = 0; t0 = performance.now(); last = { x: e.clientX, y: e.clientY }; vel = { x: 0, y: 0 }; lastT = t0; clearTimeout(lp); lp = setTimeout(() => { if (P.size === 1 && moved < 8) { moved = 99; call('longPress', e.clientX, e.clientY); } }, 520); }
    if (P.size === 2) { const [a, b] = [...P.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; moved = 99; clearTimeout(lp); }
  };
  const move = (e) => {
    const p = P.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (P.size >= 2) { const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1; if (pinch0) call('pinch', d / pinch0, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch0 = d; return; }
    moved = Math.max(moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    if (moved >= 8) { const now = performance.now(), ddt = Math.max(1, now - lastT); vel = { x: dx / ddt, y: dy / ddt }; lastT = now; call('drag', dx, dy, e); clearTimeout(lp); }
  };
  const up = (e) => {
    const p = P.get(e.pointerId); if (!p) return; P.delete(e.pointerId); clearTimeout(lp);
    if (P.size === 0) { if (moved < 8 && performance.now() - t0 < 600) call('tap', e.clientX, e.clientY, e); else if (moved >= 8 && moved < 99) call('dragEnd', vel.x, vel.y); }
    if (P.size < 2) pinch0 = 0;
  };
  const cancel = (e) => { P.delete(e.pointerId); clearTimeout(lp); if (P.size < 2) pinch0 = 0; };
  const wheel = (e) => { if (e.ctrlKey || Math.abs(e.deltaY) > 0) { e.preventDefault(); call('pinch', Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); } };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel); el.addEventListener('wheel', wheel, { passive: false });
  return { off() { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.removeEventListener('wheel', wheel); clearTimeout(lp); }, busy: () => P.size > 0 };
}

// ------------------------------------------------------------------------------------------------ the HUD (DOM)
const CSS = `
.oc-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font:500 14px/1.3 -apple-system,"Segoe UI",system-ui,sans-serif;color:#2c2116;overflow:hidden}
.oc-hint{position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));margin:0 auto;width:max-content;max-width:calc(100% - 20px);box-sizing:border-box;padding:7px 12px;border-radius:12px;background:rgba(36,28,20,.78);color:#f3ead8;border:1px solid rgba(200,162,74,.45);box-shadow:0 3px 10px rgba(0,0,0,.25);text-align:center;transition:opacity .6s ease,transform .6s ease;font:500 12.5px/1.3 -apple-system,'Segoe UI',system-ui,sans-serif}
.oc-hint.out{opacity:0;transform:translateY(8px)}
.oc-hint.top{bottom:auto;top:calc(128px + env(safe-area-inset-top,0px))}
.oc-plate{position:absolute;left:0;top:0;padding:3px 10px 4px;border-radius:999px;background:rgba(36,28,20,.72);color:#f3ead8;border:1px solid rgba(200,162,74,.5);white-space:nowrap;text-align:center;transform-origin:50% 100%;will-change:transform;transition:opacity .25s ease}
.oc-plate b{display:block;font:600 13.5px/1.15 "Iowan Old Style",Palatino,Georgia,serif;letter-spacing:.02em}
.oc-plate i{display:block;font-style:normal;font-size:10.5px;opacity:.82;max-width:150px;overflow:hidden;text-overflow:ellipsis}
.oc-plate .oc-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px}
.oc-ring{position:absolute;inset:0;z-index:40;pointer-events:auto;background:radial-gradient(circle at var(--rx,50%) var(--ry,50%),rgba(20,15,10,.0) 0,rgba(20,15,10,.28) 160px)}
.oc-ring button{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:1.5px solid #9c6b3c;background:#efe5cf;color:#3a2a1c;box-shadow:0 5px 14px rgba(0,0,0,.35);font:600 11px/1.05 -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;cursor:pointer;animation:oc-pop .22s ease-out both}
.oc-ring button svg{width:22px;height:22px}
.oc-ring button:focus-visible{outline:2px solid #c8a24a;outline-offset:3px}
.oc-ring .oc-who{position:absolute;transform:translate(-50%,-100%);padding:4px 12px;border-radius:999px;background:rgba(36,28,20,.86);color:#f3ead8;font:600 14px/1.2 "Iowan Old Style",Palatino,Georgia,serif;white-space:nowrap}
@keyframes oc-pop{from{opacity:0}to{opacity:1}}
.oc-cta{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2;pointer-events:auto;min-height:48px;padding:0 20px;border-radius:999px;border:1.5px solid #9c6b3c;background:#c8a24a;color:#2a1d10;font:600 15px/1 "Iowan Old Style",Palatino,Georgia,serif;letter-spacing:.02em;box-shadow:0 6px 18px rgba(0,0,0,.35);animation:oc-pop .3s ease-out both;white-space:nowrap}
.oc-toast{position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(36,28,20,.82);color:#f3ead8;font-size:13px;transition:opacity .4s ease;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.oc-toast.out{opacity:0}
.oc-mark{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid rgba(239,229,207,.95);box-shadow:0 0 0 2px rgba(156,107,60,.6);animation:oc-mark .7s ease-out forwards}
@keyframes oc-mark{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
@media (prefers-reduced-motion:reduce){.oc-ring button,.oc-cta{animation:none}.oc-mark{animation:none;opacity:0}}`;
function cssOnce() { if (typeof document === 'undefined' || document.querySelector('style[data-oc-hud]')) return; const s = document.createElement('style'); s.setAttribute('data-oc-hud', '1'); s.textContent = CSS; document.head.appendChild(s); }
const NS = 'http://www.w3.org/2000/svg';
const ICON = { talk: 'M4 5h16v10H9l-5 4z', work: 'M5 19V9M10 19V5M15 19v-7M20 19v-11', follow: 'M7 18l5-12 5 12-5-3z', wave: 'M7 13V7a1.5 1.5 0 013 0v4M10 11V5a1.5 1.5 0 013 0v6M13 11V6a1.5 1.5 0 013 0v7c0 4-2 6-5 6s-5-2-6-4l-1-3a1.4 1.4 0 012.4-1.2L7 13', walk: 'M13 4a2 2 0 110 .1M10 21l2-6 3 3v3M9 12l3-4 3 3 3 1M12 8l-3 1-2 4' };
function icon(name) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICON[name] || ICON.talk); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.appendChild(p); return s; }
const HKEY = 'olympus.hints.v1';
/** the HUD over a scene. container: the scene's positioned box (the canvas's parent). store: localStorage (or a stub) for 'hint already used' */
export function createHud(container, opts) {
  const o = opts || {}; cssOnce();
  const root = document.createElement('div'); root.className = 'oc-hud'; container.appendChild(root);
  const st = (() => { try { return o.store || localStorage; } catch (_) { return null; } })();
  const seen = () => { try { return JSON.parse((st && st.getItem(HKEY)) || '{}') || {}; } catch (_) { return {}; } };
  let hintEl = null, hintKey = '', hintT = 0, ringEl = null, ctaEl = null, toastEl = null, toastT = 0;
  const plates = new Map();
  const api = {
    root,
    /** a hint that fades after `ms` (default 5 s) and never shows again once used(key) was called */
    hint(key, text, hopt) {
      const q = hopt || {}; if (seen()[key] && !q.always) return false;
      api.clearHint(); hintKey = key; hintEl = document.createElement('p'); hintEl.className = 'oc-hint' + (o.hintTop ? ' top' : ''); hintEl.setAttribute('role', 'status'); hintEl.textContent = text; root.appendChild(hintEl);
      clearTimeout(hintT); hintT = setTimeout(() => api.clearHint(), q.ms || 5200); return true;
    },
    used(key) { const s = seen(); if (!s[key]) { s[key] = Date.now(); try { if (st) st.setItem(HKEY, JSON.stringify(s)); } catch (_) { /* private mode */ } } if (hintKey === key) api.clearHint(); },
    clearHint() { const e = hintEl; hintEl = null; hintKey = ''; if (!e) return; e.classList.add('out'); setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, o.reduced ? 0 : 650); },
    hinting: () => hintKey,
    /** name plates: list = [{ id, name, role, x, y (px in the container, the top of the head), dist, front, important, colour }] */
    plates(list) {
      const W = container.clientWidth || 390, H = container.clientHeight || 844, keep = declutter(list, { w: W, h: H, max: o.maxPlates || 3, maxD: o.plateD || 8 }), ids = new Set(keep.map((p) => p.id));
      for (const [id, el] of plates) if (!ids.has(id)) { el.remove(); plates.delete(id); }
      for (const p of keep) {
        let el = plates.get(p.id);
        if (!el) { el = document.createElement('div'); el.className = 'oc-plate'; el.setAttribute('aria-hidden', 'true'); const b = document.createElement('b'), i = document.createElement('i'); el.append(b, i); root.appendChild(el); plates.set(p.id, el); }
        const b = el.firstChild, i = el.lastChild;
        if (b.dataset.t !== p.name) { b.textContent = ''; if (p.colour) { const d = document.createElement('span'); d.className = 'oc-dot'; d.style.background = p.colour; b.appendChild(d); } b.appendChild(document.createTextNode(p.name)); b.dataset.t = p.name; }
        if (i.textContent !== (p.role || '')) i.textContent = p.role || '';
        const sc = clamp(1.15 - (p.dist || 0) / 18, 0.78, 1.05);
        el.style.transform = 'translate(' + Math.round(p.x - (el.offsetWidth || 90) / 2) + 'px,' + Math.round(p.y - (el.offsetHeight || 34) - 6) + 'px) scale(' + sc.toFixed(2) + ')';
        el.style.opacity = p.alpha.toFixed(2);
      }
      return keep.map((p) => p.id);
    },
    /** the context ring around a tapped person. actions = [{ id, label, icon }]; onPick(id) */
    ring(x, y, who, actions, onPick) {
      api.closeRing();
      const W = container.clientWidth || 390, H = container.clientHeight || 844, L = ringLayout(x, y, actions.length, { w: W, h: H });
      ringEl = document.createElement('div'); ringEl.className = 'oc-ring'; ringEl.setAttribute('role', 'menu'); ringEl.setAttribute('aria-label', 'Actions for ' + who);
      ringEl.style.setProperty('--rx', L.cx + 'px'); ringEl.style.setProperty('--ry', L.cy + 'px');
      // (the person's name plate stays over their head: the ring needs no label of its own)
      actions.forEach((a, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.dataset.act = a.id; b.style.left = L.items[k].x + 'px'; b.style.top = L.items[k].y + 'px'; b.style.animationDelay = (k * 40) + 'ms'; b.append(icon(a.icon || a.id)); const s = document.createElement('span'); s.textContent = a.label; b.appendChild(s); b.setAttribute('aria-label', a.label + ' ' + who);
        b.addEventListener('click', (e) => { e.stopPropagation(); api.closeRing(); if (onPick) onPick(a.id); }); ringEl.appendChild(b); });
      ringEl.addEventListener('click', () => api.closeRing());
      api.clearCta(); container.appendChild(ringEl);
      try { ringEl.querySelector('button').focus({ preventScroll: true }); } catch (_) { /* fine */ }
      return ringEl;
    },
    closeRing() { if (ringEl && ringEl.parentNode) ringEl.parentNode.removeChild(ringEl); ringEl = null; },
    ringOpen: () => !!ringEl,
    /** one clear call to action at the bottom (a button) */
    cta(text, onTap) { api.clearCta(); ctaEl = document.createElement('button'); ctaEl.type = 'button'; ctaEl.className = 'oc-cta'; ctaEl.textContent = text; ctaEl.addEventListener('click', (e) => { e.stopPropagation(); const f = onTap; api.clearCta(); if (f) f(); }); root.appendChild(ctaEl); return ctaEl; },
    clearCta() { if (ctaEl && ctaEl.parentNode) ctaEl.parentNode.removeChild(ctaEl); ctaEl = null; },
    toast(text, ms) { if (!toastEl) { toastEl = document.createElement('p'); toastEl.className = 'oc-toast'; toastEl.setAttribute('role', 'status'); root.appendChild(toastEl); } toastEl.textContent = text; toastEl.classList.remove('out'); clearTimeout(toastT); toastT = setTimeout(() => { if (toastEl) toastEl.classList.add('out'); }, ms || 2600); },
    /** a small ring where a tap sent you (it fades) */
    mark(x, y) { if (o.reduced) return; const m = document.createElement('i'); m.className = 'oc-mark'; m.style.left = x + 'px'; m.style.top = y + 'px'; root.appendChild(m); setTimeout(() => m.remove(), 800); },
    dispose() { clearTimeout(hintT); clearTimeout(toastT); if (root.parentNode) root.parentNode.removeChild(root); plates.clear(); },
  };
  return api;
}
/** an optional on-screen joystick (off by default in every scene): onMove({ fwd, side }) */
export function joystick(box, onMove) {
  cssOnce();
  const el = document.createElement('div'); el.className = 'oc-joy'; el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;left:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));width:112px;height:112px;border-radius:50%;background:rgba(36,28,20,.35);border:1.5px solid rgba(200,162,74,.5);pointer-events:auto;touch-action:none;z-index:7';
  const knob = document.createElement('i'); knob.style.cssText = 'position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px;border-radius:50%;background:#c8a24a;box-shadow:0 3px 8px rgba(0,0,0,.35)'; el.appendChild(knob); box.appendChild(el);
  let id = null;
  const vec = (e) => { const r = el.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / (R - 10)); return { dx: (dx / d) * k * (R - 18), dy: (dy / d) * k * (R - 18), ux: (dx / d) * k, uy: (dy / d) * k }; };
  const set = (v) => { knob.style.transform = 'translate(' + v.dx + 'px,' + v.dy + 'px)'; onMove({ fwd: -v.uy, side: v.ux }); };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (_) { /* fine */ } set(vec(e)); e.stopPropagation(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(vec(e)); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; set({ dx: 0, dy: 0, ux: 0, uy: 0 }); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return { el, remove() { el.remove(); } };
}
