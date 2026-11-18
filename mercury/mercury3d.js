// MERCURY scene (ES module, optional): a marble pedestal in warm light with price tags and tickets slowly circling it. One tag per deal the page found
// (its percent off on the face), gold for a sale, olive for a free reset, terracotta for a rule change. three.js is Jarvis's copy. Warm 3000 K key light,
// warm fog, plain lit materials only. If WebGL is missing the canvas is simply hidden; the page works without this file.
// Motion is slow (one turn takes about 40 s); reduced motion or LITE draws a still picture, a hidden tab draws nothing.
import * as THREE from '../jarvis/three.module.min.js';

const O = window.OLYMPUS || null;
const cv = document.getElementById('stage');
const box = cv ? cv.parentElement : null;
const COL = { deal: 0xc8a24a, reset: 0x7f8a52, rule: 0xc96a4a };
const state = { scene: null, renderer: null, camera: null, tags: [], pedestal: null, raf: 0, t0: performance.now(), still: false, dead: false, ready: false, count: 0 };

function label(text, kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), hex = '#' + COL[kind].toString(16).padStart(6, '0');
  g.fillStyle = '#f3ece0'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = hex; g.lineWidth = 6; g.strokeRect(10, 10, 236, 108);
  g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeRect(22, 22, 212, 84);
  g.setLineDash([]); g.fillStyle = '#2a2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 ' + (text.length > 6 ? 38 : 50) + 'px Georgia, serif'; g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ticketShape(w, hgt, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -hgt / 2;
  s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + hgt / 2 - r); s.absarc(x + w, y + hgt / 2, r, -Math.PI / 2, Math.PI / 2, true);
  s.lineTo(x + w, y + hgt); s.lineTo(x, y + hgt); s.lineTo(x, y + hgt / 2 + r); s.absarc(x, y + hgt / 2, r, Math.PI / 2, -Math.PI / 2, true); s.lineTo(x, y);
  return s;
}

function build() {
  const lite = !!(O && O.lite && O.lite()), reduced = !!(O && O.reduced && O.reduced());
  state.still = lite || reduced;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !lite, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1611, 7, 16);
  const camera = new THREE.PerspectiveCamera(38, 1.8, 0.1, 40);
  camera.position.set(0, 2.2, 7.2); camera.lookAt(0, 1.0, 0);
  // warm light: low sun from the front-left (about 3000 K), a soft warm fill
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.4); sun.position.set(-4, 6, 5); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe6c4, 0x3a2e22, 0.9));
  // the marble pedestal: plinth, shaft, capital, a bronze ring
  const marble = new THREE.MeshStandardMaterial({ color: 0xf1e9db, roughness: 0.42, metalness: 0.0 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x9c6b3c, roughness: 0.45, metalness: 0.6 });
  const ped = new THREE.Group();
  const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; ped.add(m); return m; };
  part(new THREE.CylinderGeometry(1.25, 1.35, 0.25, 40), marble, 0.125);
  part(new THREE.CylinderGeometry(0.62, 0.72, 1.5, 32), marble, 1.0);
  part(new THREE.TorusGeometry(0.7, 0.04, 10, 40), bronze, 0.45).rotation.x = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.95, 0.7, 0.22, 40), marble, 1.86);
  part(new THREE.CylinderGeometry(0.98, 0.98, 0.06, 40), bronze, 2.0);
  // a small gold coin resting on top
  const coin = part(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 36), new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.8 }), 2.08);
  coin.rotation.z = 0.35; coin.userData.coin = true;
  scene.add(ped);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  Object.assign(state, { scene, renderer, camera, pedestal: ped });
  size();
}

function size() {
  if (!state.renderer || !box) return;
  const w = Math.max(160, box.clientWidth || 340), hh = Math.max(110, box.clientHeight || 200);
  state.renderer.setSize(w, hh, false); state.camera.aspect = w / hh; state.camera.updateProjectionMatrix();
}

function setTags(list) {
  if (!state.scene) return;
  for (const t of state.tags) { state.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
  state.tags = [];
  const lite = state.still, max = lite ? 4 : 8, use = (list && list.length ? list : [{ label: '% OFF', kind: 'deal' }]).slice(0, max);
  use.forEach((tag, n) => {
    const kind = COL[tag.kind] ? tag.kind : 'deal';
    const geo = new THREE.ExtrudeGeometry(ticketShape(1.15, 0.62, 0.09), { depth: 0.05, bevelEnabled: false });
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + 0.575) / 1.15, (pos.getY(k) + 0.31) / 0.62);   // the face picture spans the whole ticket
    const edge = new THREE.MeshStandardMaterial({ color: COL[kind], roughness: 0.5, metalness: 0.4 });
    const face = new THREE.MeshStandardMaterial({ map: label(String(tag.label || 'SALE'), kind), roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, [face, edge]);
    state.scene.add(mesh);
    state.tags.push({ mesh, a0: (n / use.length) * Math.PI * 2, r: 2.25 + (n % 2) * 0.45, y: 1.0 + (n % 3) * 0.55, sp: 0.16 + (n % 2) * 0.04, ph: n * 1.7 });
  });
  state.count = use.length;
  frame(0);
}

function frame(ts) {
  if (state.dead || !state.renderer) return;
  const t = state.still ? 0 : (ts - state.t0) / 1000;
  for (const g of state.tags) {
    const a = g.a0 + t * g.sp;
    g.mesh.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 0.8 + g.ph) * 0.08, Math.sin(a) * g.r);
    g.mesh.rotation.y = -a + Math.PI / 2; g.mesh.rotation.z = Math.sin(t * 0.5 + g.ph) * 0.06;
  }
  if (state.pedestal) state.pedestal.children.forEach((c) => { if (c.userData.coin) c.rotation.y = t * 0.6; });
  state.renderer.render(state.scene, state.camera);
  if (!state.ready) { state.ready = true; document.documentElement.setAttribute('data-stage', 'on'); }
  if (!state.still) state.raf = requestAnimationFrame(frame);
}

function start() {
  if (!cv || !box) return;
  try { build(); } catch (_) { box.classList.add('off'); return; }
  window.addEventListener('mercury:model', (e) => { try { setTags(e.detail && e.detail.tags); } catch (_) { /* keep the last picture */ } });
  window.addEventListener('resize', () => { size(); if (state.still) frame(0); });
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(state.raf); if (!document.hidden && !state.still) state.raf = requestAnimationFrame(frame); });
  window.addEventListener('pagehide', () => { state.dead = true; cancelAnimationFrame(state.raf); try { state.renderer.dispose(); } catch (_) { /* gone */ } });
  const m = window.MERCURY;
  if (m && m.S && m.S.model && m.S.model.tags) setTags(m.S.model.tags); else setTags(null);
  if (!state.still) state.raf = requestAnimationFrame(frame);
  window.MERCURY3D = { ready: () => state.ready, tags: () => state.count, still: () => state.still };
}
start();
