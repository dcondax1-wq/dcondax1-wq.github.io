/* OLYMPUS brain3d: the 3D scene (olympus/brain3d-scene.js, ES module, DESIGN 2026-11-21). Imported by brain3d.js after mount; never alone.
 * create(box, cfg, state, onTap) -> { update(state), dispose(), onLost } | null
 *   cfg = { stages, ring, pos: { id: [x, y, z] }, layout: 'path' | 'lobes', palette }
 * A glass brain (two folded hemispheres with a violet fresnel rim, a stem), the stages as glowing regions (mint passed, gold / violet
 * pulsing current, lavender waiting, red blocked), the path between them as a faint tube with synapse particles flowing along it, a risk
 * ring around the stem (one node per rule). Bloom (UnrealBloomPass) on a capable phone. Drag = turn, pinch / wheel = zoom, tap = the
 * region's id. 30 fps, pixel ratio <= 2, paused off screen / hidden tab; reduced motion = a still frame redrawn on update. All made in code.
 */
import * as THREE from '../jarvis/three.module.min.js';
import { EffectComposer } from './three-addons/EffectComposer.js';
import { RenderPass } from './three-addons/RenderPass.js';
import { UnrealBloomPass } from './three-addons/UnrealBloomPass.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function weakDevice() {
  // a small memory or Data Saver (iPhone Safari reports neither: an iPhone gets the full brain, bloom included)
  try { const m = navigator.deviceMemory, c = navigator.connection || {}; return (typeof m === 'number' && m <= 4) || !!c.saveData; } catch (e) { return false; }
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelTex(text, colour, big) {
  const c = document.createElement('canvas'), fs = big ? 44 : 34, pad = 18; const g = c.getContext('2d');
  g.font = `700 ${fs}px -apple-system, system-ui, sans-serif`; const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = fs + pad * 1.4;
  g.font = `700 ${fs}px -apple-system, system-ui, sans-serif`; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(8,5,14,.72)'; const h = c.height, r = h / 2;
  g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, h); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); g.fill();
  g.fillStyle = colour; g.fillText(text, pad, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, aspect: w / h };
}
// glass: a fresnel rim that brightens at grazing angles, almost clear face-on
function glassMat(colour, base, rim) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(colour) }, uBase: { value: base }, uRim: { value: rim } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uBase; uniform float uRim; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.4); gl_FragColor = vec4(uC * (0.35 + 1.4 * f), uBase + uRim * f); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
// a folded hemisphere: a squashed sphere with gyri (sums of sines on the surface)
function hemisphere(side) {
  const g = new THREE.SphereGeometry(1, 72, 54), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const fold = 0.045 * Math.sin(v.x * 9.5 + v.y * 4.1) * Math.sin(v.y * 11.0 - v.z * 6.0) + 0.025 * Math.sin(v.x * 17.0 + v.z * 13.0);
    v.multiplyScalar(1 + fold);
    v.set(v.x * 1.22, v.y * 0.92 + (v.y < -0.3 ? (v.y + 0.3) * 0.25 : 0), v.z * 0.6);
    p.setXYZ(i, v.x, v.y, v.z + side * 0.33);
  }
  g.computeVertexNormals();
  return g;
}

export function create(box, cfg, state0, onTap) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: !weakDevice(), alpha: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
  const P = cfg.palette, low = weakDevice(), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 1);
  const cv = renderer.domElement; cv.className = 'b3-gl'; cv.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x05020a, 0.09);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const view = { yaw: 0.55, pitch: 0.16, dist: 5.6 };
  const brain = new THREE.Group(); scene.add(brain);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const GLOW = keep(glowTex());

  // the glass brain + the stem
  const shellM = keep(glassMat(P.glow, 0.02, 0.55));
  for (const side of [1, -1]) brain.add(new THREE.Mesh(keep(hemisphere(side)), shellM));
  const stemG = keep(new THREE.CylinderGeometry(0.16, 0.1, 0.75, 24, 1, true)); const stem = new THREE.Mesh(stemG, keep(glassMat(P.glow, 0.03, 0.6)));
  stem.position.set(-0.05, -0.95, 0); brain.add(stem);
  // neurons: a faint twinkling cloud inside the brain
  const NN = low ? 160 : 320, np = new Float32Array(NN * 3), nph = new Float32Array(NN);
  for (let i = 0; i < NN; i++) {
    let x, y, z; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 0.85);
    np.set([x * 1.15, y * 0.85, z * 0.85], i * 3); nph[i] = Math.random() * 6.28;
  }
  const ng = keep(new THREE.BufferGeometry()); ng.setAttribute('position', new THREE.BufferAttribute(np, 3));
  const nm = keep(new THREE.PointsMaterial({ color: new THREE.Color(P.hi), size: 0.028, map: GLOW, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  brain.add(new THREE.Points(ng, nm));

  // the stages
  const lobes = cfg.layout === 'lobes', R = lobes ? 0.17 : 0.095, regions = {}, pickables = [];
  const coreG = keep(new THREE.IcosahedronGeometry(R, 2));
  cfg.stages.forEach((s, i) => {
    const p = cfg.pos[s.id], m = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.hi), transparent: true, opacity: 0.9 }));
    const core = new THREE.Mesh(coreG, m); core.position.set(p[0] * 1.05, p[1] * 0.85, p[2] * 0.9); core.userData = { id: s.id, kind: 'stage' };
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(P.hi), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
    halo.scale.setScalar(R * 3.4); core.add(halo);
    const L = labelTex(lobes ? s.name : String(i + 1), P.text, lobes), lab = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(L.tex), transparent: true, depthWrite: false, depthTest: false })));
    const lh = lobes ? 0.17 : 0.11; lab.scale.set(lh * L.aspect, lh, 1); lab.position.set(0, R + lh * 0.9, 0); lab.renderOrder = 10; core.add(lab);
    brain.add(core); pickables.push(core);
    regions[s.id] = { core, halo, lab, m, i, name: s.name, st: 'waiting', big: null };
  });
  // the current stage's name, large, above it
  let bigLab = null;
  function setBig(id) {
    if (bigLab) { brain.remove(bigLab); bigLab.material.map.dispose(); bigLab.material.dispose(); bigLab = null; }
    const r = regions[id]; if (!r || lobes) return;
    const L = labelTex(r.name, P.gold, true), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.tex, transparent: true, depthWrite: false, depthTest: false }));
    const h = 0.16; sp.scale.set(h * L.aspect, h, 1); sp.position.copy(r.core.position).add(new THREE.Vector3(0, R + 0.3, 0)); sp.renderOrder = 11; brain.add(sp); bigLab = sp;
  }

  // the path(s) and the synapses
  const stemTop = new THREE.Vector3(-0.05, -0.6, 0), ringY = -1.18;
  const curves = [];
  if (lobes) cfg.stages.forEach((s) => { const a = regions[s.id].core.position.clone(); curves.push(new THREE.CatmullRomCurve3([a, a.clone().lerp(stemTop, 0.5).add(new THREE.Vector3(0, 0.15, 0)), stemTop, new THREE.Vector3(-0.05, ringY + 0.05, 0)])); });
  else curves.push(new THREE.CatmullRomCurve3(cfg.stages.map((s) => regions[s.id].core.position.clone()), false, 'catmullrom', 0.4));
  const tubeM = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  const tables = curves.map((c) => { brain.add(new THREE.Mesh(keep(new THREE.TubeGeometry(c, lobes ? 40 : 120, 0.008, 6, false)), tubeM)); return c.getSpacedPoints(200); });
  const SN = reduce ? 0 : (low ? 90 : 220), sp = new Float32Array(SN * 3), scol = new Float32Array(SN * 3), sT = new Float32Array(SN), sC = new Uint8Array(SN), sV = new Float32Array(SN);
  for (let i = 0; i < SN; i++) { sT[i] = Math.random(); sC[i] = i % curves.length; sV[i] = 0.08 + Math.random() * 0.1; }
  const sg = keep(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  const sm = keep(new THREE.PointsMaterial({ size: 0.06, map: GLOW, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  if (SN) brain.add(new THREE.Points(sg, sm));

  // the risk ring around the stem
  const ringG = keep(new THREE.TorusGeometry(0.46, 0.012, 8, 96)), ringMesh = new THREE.Mesh(ringG, tubeM);
  ringMesh.rotation.x = Math.PI / 2; ringMesh.position.set(-0.05, ringY, 0); brain.add(ringMesh);
  const ringNodes = {}, nodeG = keep(new THREE.SphereGeometry(0.045, 16, 12));
  cfg.ring.forEach((r, i) => {
    const a = (i / Math.max(1, cfg.ring.length)) * Math.PI * 2, m = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.ok) }));
    const n = new THREE.Mesh(nodeG, m); n.position.set(-0.05 + Math.cos(a) * 0.46, ringY, Math.sin(a) * 0.46); n.userData = { id: r.id, kind: 'ring' };
    const h = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(P.ok), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));
    h.scale.setScalar(0.24); n.add(h); brain.add(n); pickables.push(n); ringNodes[r.id] = { n, m, h };
  });

  // bloom on a capable phone
  let composer = null, bloom = null;
  if (!low) {
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.55, 0.08); composer.addPass(bloom);
  }

  // state -> colours
  const C = { passed: new THREE.Color(P.ok), current: new THREE.Color(P.gold), waiting: new THREE.Color(P.hi), blocked: new THREE.Color(P.bad), glow: new THREE.Color(P.glow) };
  const RC = { ok: new THREE.Color(P.ok), warn: new THREE.Color(P.gold), bad: new THREE.Color(P.bad) };
  let S = state0, curId = null, pulse = 0.5;
  function applyState(st) {
    S = st; pulse = typeof st.pulse === 'number' ? st.pulse : 0.5;
    for (const id in regions) {
      const r = regions[id], s = (st.stageStates && st.stageStates[id]) || 'waiting'; r.st = s;
      r.m.color.copy(C[s] || C.waiting); r.halo.material.color.copy(s === 'current' ? C.glow : (C[s] || C.waiting));
      r.m.opacity = s === 'waiting' ? 0.55 : 0.95; r.halo.material.opacity = s === 'waiting' ? 0.18 : 0.5;
    }
    for (const id in ringNodes) { const c = RC[(st.ringStates && st.ringStates[id]) || 'ok'] || RC.ok; ringNodes[id].m.color.copy(c); ringNodes[id].h.material.color.copy(c); }
    if (st.currentId !== curId) { curId = st.currentId; setBig(curId); }
    // synapse colours: the travelled part of the path mint, the part ahead lavender (path layout); a lobe's own state (lobes)
    const ci = curId && regions[curId] ? regions[curId].i : -1, n1 = Math.max(1, cfg.stages.length - 1);
    for (let i = 0; i < SN; i++) {
      let c;
      if (lobes) { const s = cfg.stages[sC[i]]; c = C[(st.stageStates && st.stageStates[s.id]) || 'waiting'] || C.waiting; if ((st.stageStates || {})[s.id] === 'current') c = C.glow; }
      else c = sT[i] * n1 <= ci ? C.passed : C.waiting;
      scol[i * 3] = c.r; scol[i * 3 + 1] = c.g; scol[i * 3 + 2] = c.b;
    }
    if (SN) sg.attributes.color.needsUpdate = true;
    dirty = true; kick();
  }

  // size, camera
  function size() { const w = box.clientWidth || 1, h = box.clientHeight || 1; renderer.setSize(w, h, false); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
  function place() {
    const cp = Math.cos(view.pitch); camera.position.set(Math.sin(view.yaw) * cp * view.dist, Math.sin(view.pitch) * view.dist - 0.35, Math.cos(view.yaw) * cp * view.dist);
    camera.lookAt(0, -0.4, 0);
  }

  // interaction: drag = turn, two fingers / wheel = zoom, a short tap = the region under it
  const pts = new Map(); let pinch0 = 0, dist0 = view.dist, downAt = 0, downXY = null, moved = 0, lastTouch = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onDown = (e) => { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now();
    if (pts.size === 1) { downAt = performance.now(); downXY = [e.clientX, e.clientY]; moved = 0; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = view.dist; } kick(); };
  const onMove = (e) => { if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) view.dist = clamp(dist0 * pinch0 / dd, 3, 8.5); }
    else { const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; moved += Math.abs(dx) + Math.abs(dy); view.yaw -= dx * 0.008; view.pitch = clamp(view.pitch + dy * 0.006, -0.5, 0.9); }
    dirty = true; kick(); };
  const onUp = (e) => {
    const was = pts.size; pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
    if (was === 1 && moved < 8 && performance.now() - downAt < 450 && downXY) {
      const r = cv.getBoundingClientRect(); ndc.set(((downXY[0] - r.left) / r.width) * 2 - 1, -((downXY[1] - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); ray.params.Points = { threshold: 0 };
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit && hit.object.userData && onTap) onTap(hit.object.userData.id, hit.object.userData.kind);
    }
  };
  const onWheel = (e) => { e.preventDefault(); view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.08), 3, 8.5); dirty = true; kick(); };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });

  // the loop: 30 fps, only on screen and visible; reduced motion = a still frame on each change
  let raf = 0, last = 0, t = 0, onScreen = true, dirty = true, dead = false, frames = 0;
  const io = window.IntersectionObserver ? new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) kick(); }) : null; if (io) io.observe(box);
  const onVis = () => { if (!document.hidden) kick(); }; document.addEventListener('visibilitychange', onVis);
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(box);
  function frame(now) {
    raf = 0; if (dead || !onScreen || document.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    if (now - last < 31 && !reduce) { kick(); return; }                 // 30 fps
    last = now;
    if (!reduce) {
      t += dt;
      if (now - lastTouch > 2500 && !pts.size) view.yaw += dt * 0.12;
      const sp2 = 0.85 + 0.4 * pulse;
      for (const id in regions) {
        const r = regions[id];
        if (r.st === 'current') { const k = 0.5 + 0.5 * Math.sin(t * 4.2); r.core.scale.setScalar(1 + 0.22 * k); r.halo.material.opacity = 0.45 + 0.45 * k; r.m.color.copy(C.current).lerp(C.glow, k * 0.6); }
        else if (r.st === 'blocked') { const k = 0.5 + 0.5 * Math.sin(t * 2.2); r.halo.material.opacity = 0.35 + 0.3 * k; }
      }
      for (let i = 0; i < SN; i++) {
        sT[i] = (sT[i] + dt * sV[i] * sp2) % 1;
        const tb = tables[sC[i]], f = sT[i] * (tb.length - 1), j = Math.floor(f), u = f - j, a = tb[j], b = tb[Math.min(j + 1, tb.length - 1)];
        sp[i * 3] = a.x + (b.x - a.x) * u; sp[i * 3 + 1] = a.y + (b.y - a.y) * u; sp[i * 3 + 2] = a.z + (b.z - a.z) * u;
      }
      if (SN) sg.attributes.position.needsUpdate = true;
      nm.opacity = 0.28 + 0.08 * Math.sin(t * 1.3);
      dirty = true;
    }
    if (dirty) { frames++; place(); if (composer) composer.render(); else renderer.render(scene, camera); dirty = false; }
    if (!reduce) kick();
  }
  function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

  const api = {
    onLost: null,
    update(st) { applyState(st); },
    dispose() {
      if (dead) return; dead = true; if (raf) cancelAnimationFrame(raf);
      if (io) io.disconnect(); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('wheel', onWheel);
      setBig(null);
      disposables.forEach((x) => { try { x.dispose(); } catch (e) { /* gone */ } });
      if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); } if (bloom) bloom.dispose();
      renderer.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv);
    },
    stats() { return { regions: Object.keys(regions).length, ring: Object.keys(ringNodes).length, synapses: SN, bloom: !!composer, reduce, dpr: renderer.getPixelRatio(), running: !!raf, frames }; },
    // where a region (kind 'stage') or a ring node (kind 'ring') sits on screen, in CSS px from the canvas's top-left (labels, tests)
    where(id, kind) {
      const o = kind === 'ring' ? (ringNodes[id] && ringNodes[id].n) : (regions[id] && regions[id].core); if (!o) return null;
      place(); camera.updateMatrixWorld(); brain.updateMatrixWorld(true); const v = new THREE.Vector3(); o.getWorldPosition(v); v.project(camera);
      const w = cv.clientWidth, h = cv.clientHeight; return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, front: v.z < 1 };
    },
  };
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); api.dispose(); if (api.onLost) api.onLost(); });
  box.insertBefore(cv, box.firstChild);
  size(); applyState(state0); place();
  if (composer) composer.render(); else renderer.render(scene, camera);
  kick();
  return api;
}
