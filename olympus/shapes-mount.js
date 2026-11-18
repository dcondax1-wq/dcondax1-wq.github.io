// OLYMPUS_SHAPES.mount (olympus/shapes-mount.js, 2026-11-10): drop one AGORA 3D shape into any page with one line, with a flat 2D fallback.
//
//   <script type="module" src="../olympus/shapes-mount.js"></script>
//   <div id="spot" style="height:220px"></div>
//   <script type="module">   // (or any later script, once the module above has run)
//     const m = OLYMPUS_SHAPES.mount(document.getElementById('spot'), 'owl');     // m.ok === true when 3D is running, false = the drawing is showing
//   </script>
//
// mount(canvasOrEl, id, opts) -> { ok, id, flat, set(id), stop() }
//   canvasOrEl  an existing <canvas>, or any element (a canvas is created inside it, filling it; give the element a height, 200 px is used when it has none)
//   id          one of OLYMPUS_SHAPES.ids (see shapes3d.js SHAPES); an unknown id shows the Doric column
//   opts        { lite (default: OLYMPUS.lite()), spin (default true: a slow turn; off under reduced motion), size (default 2.3), alpha (default true: the page shows
//               through), quality ('ultra'|'high'|'low'|'off'), label (the accessible name), values / tones (for 'pillarbar') }
// 3D uses the kit's render core, warm light and bloom <= .2. If WebGL (or three.js) cannot start, the element gets the shape's 2D drawing (olympus/shapes2d.js) with its
// name, so the spot is never blank. The page is paused by the core while the tab is hidden; stop() frees everything. Nothing is sent or stored.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from './render.js';
import * as KIT from './materials.js';
import * as SH from './shapes3d.js';
import { svgNodes } from './shapes2d.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const webglOK = () => { if (/[?&]flat=1/.test(location.search)) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } };

function flatFallback(host, id, label) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  svg.style.cssText = 'width:min(60%,200px);height:auto;max-height:100%;color:#c8a24a;display:block;margin:auto';
  svgNodes(document, id).forEach((n) => svg.appendChild(n));
  host.textContent = '';
  host.appendChild(svg);
  return svg;
}

const AGORA = { sky: '#3a2f22', fog: '#14110e', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' };      // warm reflections, never violet

export function mount(target, id, opts) {
  const o = Object.assign({ spin: true, size: 2.3, alpha: true }, opts || {});
  const O = window.OLYMPUS || null, def = SH.SHAPES.find((s) => s.id === id) || SH.SHAPES[0], sid = def.id;
  const label = o.label || `${def.name}: ${def.means}`;
  const own = !(target && target.tagName === 'CANVAS'), host = own ? target : target.parentNode;
  const out = { ok: false, id: sid, flat: true, set() {}, stop() {} };
  if (!target) return out;
  if (!webglOK()) { if (own) flatFallback(target, sid, label); return out; }
  let canvas = target, built = null, rc = null, dead = false;
  try {
    if (own) {
      target.textContent = '';
      if (!target.style.height && !target.clientHeight) target.style.height = '200px';
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y';
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label);
      target.appendChild(canvas);
    }
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    rc = createRenderer({ canvas, scene, camera, quality: o.quality, env: 'night', tint: '#c8a24a', theme: AGORA, alpha: !!o.alpha, bloom: { strength: 0.2, radius: 0.5, threshold: 0.98 } });
    SH.warmLights(scene, { lite: false });
    const mats = {}, lite = () => (o.lite != null ? !!o.lite : ['low', 'off'].indexOf(rc.quality()) >= 0);
    const matsFor = (l) => mats[l ? 'lite' : 'hd'] || (mats[l ? 'lite' : 'hd'] = SH.materials({ lite: l, kit: l ? null : KIT }));
    let shapeId = sid, yaw = 0.5, builtLite = null;
    const make = () => {
      if (built) { SH.dispose(built); built = null; }
      builtLite = lite();
      built = SH.build(shapeId, { lite: builtLite, materials: matsFor(builtLite), size: o.size, values: o.values, tones: o.tones });
      scene.add(built);
    };
    make();
    rc.start((dt) => {
      if (o.spin && !reduced()) yaw += 0.35 * Math.min(0.1, dt || 0.016);
      built.rotation.y = yaw;
      if (built.userData.update && !reduced()) built.userData.update(performance.now() / 1000);
      if (builtLite !== lite()) make();
      const w = canvas.clientWidth || 200, h = canvas.clientHeight || 200, t = Math.tan((camera.fov * Math.PI) / 360);
      const d = Math.max(1.6 / t, (o.size * 0.62) / (t * (w / h))) + 0.6;
      camera.position.set(0, o.size * 0.5 + 0.55, d); camera.lookAt(0, o.size * 0.46, 0);
    });
    Object.assign(out, { ok: true, flat: false, set(nid) { if (SH.IDS.indexOf(nid) >= 0) { shapeId = nid; out.id = nid; make(); } }, stop() { if (dead) return; dead = true; try { rc.dispose(); } catch (_) { /* gone */ } if (built) SH.dispose(built); if (own && canvas.parentNode) canvas.parentNode.removeChild(canvas); } });
    return out;
  } catch (_) {
    try { if (rc) rc.dispose(); } catch (__) { /* gone */ }
    if (own) flatFallback(target, sid, label); else if (host) host.dataset.flat = '1';
    return Object.assign(out, { ok: false, flat: true });
  }
}
window.OLYMPUS_SHAPES = { mount, ids: SH.IDS.slice(), shapes: SH.SHAPES.map((s) => ({ id: s.id, name: s.name, means: s.means, group: s.group })), build: SH.build, materials: SH.materials, bake: SH.bake, bakedShape: SH.bakedShape };
window.dispatchEvent(new CustomEvent('olympus-shapes'));
