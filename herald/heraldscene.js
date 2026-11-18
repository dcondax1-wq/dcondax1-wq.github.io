// HERALD scene (ES module): the herald's stand in the agora, a small marble aedicula whose scroll unrolls today's headline (three r160, ../jarvis/three.module.min.js, no post passes).
//   the stand    a stepped marble base with a painted Greek-key band, two fluted Doric columns, an entablature with a painted triglyph frieze, a terracotta tiled
//                roof with pediments and a gold medallion; black-figure amphorae either side, a paved square, a golden-hour sky (QA Round 6 bug 8: env-kit scans,
//                HDRI light and set pieces from olympus/hero-stage.js)
//   the scroll   two bronze rollers with gold finials and a papyrus sheet; show(kicker, lines) rolls it up and lets it fall open again with the new headline (900 ms, instant on reduced motion)
//   cost         it draws only while the scroll moves or a texture arrives: a still stand costs nothing
// createStand(canvas, { O }) -> { show(kicker, lines), open(), frames(), dispose() } or null when WebGL is not available (the page then draws its flat scroll)
import * as THREE from '../jarvis/three.module.min.js';
import { dress, mat4 } from '../olympus/hero-stage.js';

const SW = 3.6, SH = 2.5;
const ease = (t) => 1 - Math.pow(1 - t, 3);

function sheetTexture(kicker, lines) {
  const c = document.createElement('canvas'); c.width = 720; c.height = 500;
  const g = c.getContext('2d');
  const pg = g.createLinearGradient(0, 0, 720, 500); pg.addColorStop(0, '#f3e8cf'); pg.addColorStop(1, '#e6d5ae'); g.fillStyle = pg; g.fillRect(0, 0, 720, 500);
  g.fillStyle = 'rgba(140,100,50,0.06)'; for (let i = 0; i < 900; i++) g.fillRect((i * 97) % 720, (i * 61) % 500, 6, 1);       // papyrus fibres
  g.strokeStyle = '#9c6b3c'; g.lineWidth = 3; g.strokeRect(18, 18, 684, 464); g.lineWidth = 1; g.strokeRect(28, 28, 664, 444);
  g.fillStyle = '#7a5a2c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 30px Georgia, "Times New Roman", serif'; g.fillText(kicker || 'The Olympus Herald', 360, 78, 620);
  g.fillStyle = '#9c6b3c'; g.fillRect(250, 108, 220, 2);
  g.fillStyle = '#2a2217';
  const n = Math.max(1, lines.length), size = n <= 2 ? 68 : n === 3 ? 58 : 50, lh = size * 1.18, y0 = 290 - ((n - 1) * lh) / 2;
  g.font = `600 ${size}px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`;
  lines.forEach((ln, i) => g.fillText(ln, 360, y0 + i * lh, 630));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createStand(canvas, { O = null } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return null;
  const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1.4, 0.1, 80);
  const tier = O && O.fx ? O.fx() : 'high';
  const D = dress({ renderer, scene, camera, tier, palette: 'golden', hdri: 'golden', envI: 0.8, sunDir: [-0.55, 0.55, 0.65], key: 2.4, shadowExt: 5, sky: { sunX: 0.12, sunY: 0.78, templeX: 0.86, horizon: 0.72 }, fogNear: 16, fogFar: 40 });
  const { kit, B } = D;
  const yb = -2.08;                                      // the ground
  D.ground({ mat: 'paving', color: '#8a7860', y: yb, r: 26 });
  // the base: two steps and a block with a key band; the columns, the entablature, the roof
  B.steps({ x: 0, y: yb, z: 0, w: 6.0, d: 1.7, n: 2, h: 0.3, run: 0.22, mat: 'marble:uv', color: '#cfc5b0' });
  const top = D.block({ y: yb + 0.3, w: 5.6, d: 1.5, steps: 0, drum: 0.16, bandFg: '#6e2f1c' });
  B.column({ x: -2.45, y: top, z: 0, h: 3.62, r: 0.22, flutes: 18, color: '#ece4d4', base: true });
  B.column({ x: 2.45, y: top, z: 0, h: 3.62, r: 0.22, flutes: 18, color: '#ece4d4', base: true });
  const ey = top + 3.62;
  B.entablature({ x: 0, y: ey, z: 0, w: 6.0, d: 1.2, ah: 0.22, fh: 0.24, ch: 0.1, bay: 0.95, color: '#e8e0d0', metope: '#b5563c', triglyph: '#3d4152' });
  B.roof({ x: 0, y: ey + 0.56, z: 0, w: 6.0, d: 1.5, h: 0.6, over: 0.2, color: '#b3633a', pedColor: '#e6ddcc' });
  B.add('gold', new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24), mat4(0, ey + 0.8, 0.84, 0, 1, Math.PI / 2));
  // black-figure amphorae either side
  D.amphora({ x: -3.55, y: yb, z: 0.55, s: 1.25, ry: 0.4 }); D.amphora({ x: 3.6, y: yb, z: 0.35, s: 1.05, ry: -0.6 });
  D.build(scene);
  // the scroll: the top roller hangs from the entablature, the sheet falls from it, the bottom roller rides its lower edge
  const topY = ey - 0.32, rollGeo = new THREE.CylinderGeometry(0.1, 0.1, SW + 0.5, 16), capGeo = new THREE.SphereGeometry(0.14, 14, 10);
  const bronze = kit.mat('bronze'), gold = kit.mat('gold');
  const roller = (y) => { const g = new THREE.Group(); const r = new THREE.Mesh(rollGeo, bronze); r.rotation.z = Math.PI / 2; g.add(r); for (const s of [-1, 1]) { const c = new THREE.Mesh(capGeo, gold); c.position.x = s * (SW / 2 + 0.25); g.add(c); } g.position.set(0, y, 0.2); D.shade(g); scene.add(g); return g; };
  roller(topY); const low = roller(topY);
  const sheetGeo = new THREE.PlaneGeometry(SW, SH); sheetGeo.translate(0, -SH / 2, 0);
  const sheetMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, envMapIntensity: 0.6, emissive: '#ffffff', emissiveIntensity: 0.0 });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat); sheet.position.set(0, topY, 0.2); sheet.receiveShadow = D.shadows; scene.add(sheet);
  D.blobs([[0, 0, 3.4, 0.6, yb + 0.012, 1.3], [-3.55, 0.55, 0.45, 1, yb + 0.012], [3.6, 0.35, 0.4, 1, yb + 0.012]], { opacity: 0.45 });
  D.tune();
  let tex = null, pending = null, pos = 0, to = 0, raf = 0, stopped = false, frames = 0, dirty = true, last = 0, seen = -1;
  function swap() { if (!pending) return; if (tex) tex.dispose(); tex = sheetTexture(pending[0], pending[1]); sheetMat.map = tex; sheetMat.emissiveMap = tex; sheetMat.emissiveIntensity = 0.35; sheetMat.needsUpdate = true; pending = null; }
  function lay() {
    const e = Math.max(0.02, ease(pos)); sheet.scale.y = e; low.position.y = topY - SH * e;
    if (tex) { tex.repeat.set(1, e); tex.offset.set(0, 1 - e); }                           // the sheet shows the top part of the page as it falls open, never a squashed one
  }
  function size() {
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 240, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); D.backdrop(w, h); dirty = true; }
    const t = Math.tan((camera.fov * Math.PI / 180) / 2), dist = Math.max(4.3 / (t * camera.aspect), 3.35 / t) + 1.0;
    camera.position.set(0.6, 0.55, dist); camera.lookAt(0, 0.35, 0);
  }
  function step(dt) {
    if (pos === to) { if (to === 0 && pending) { swap(); to = 1; return true; } return false; }
    const k = reduced() ? 1 : dt / (to === 1 ? 0.9 : 0.35);
    pos = Math.abs(to - pos) <= k ? to : pos + Math.sign(to - pos) * k;
    return true;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || document.hidden) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    size();
    const files = kit.stats().files; if (files !== seen) { seen = files; dirty = true; }        // a texture or the HDRI arrived: draw once more
    const moving = step(dt);
    if (!moving && !dirty) return;
    lay(); renderer.render(scene, camera); dirty = false; frames++;
  }
  raf = requestAnimationFrame(frame);
  window.__heroStats = () => Object.assign(D.stats(), { frames, calls: renderer.info.render.calls });
  return {
    show(kicker, lines) { pending = [String(kicker || ''), (lines || []).map(String)]; to = 0; dirty = true; if (reduced()) { pos = 0; swap(); pos = 1; to = 1; } },
    open: () => pos, frames: () => frames, stats: () => D.stats(),
    dispose() { stopped = true; cancelAnimationFrame(raf); try { rollGeo.dispose(); capGeo.dispose(); sheetGeo.dispose(); sheetMat.dispose(); if (tex) tex.dispose(); D.dispose(); renderer.dispose(); } catch (_) { /* gone */ } },
  };
}
