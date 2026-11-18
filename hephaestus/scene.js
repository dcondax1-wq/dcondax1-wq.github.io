// HEPHAESTUS scene (ES module): a forge and an anvil on the OLYMPUS render core.
//   the anvil     gunmetal base, chrome face, a horn; the ingot on it is the setting you are testing
//   the ingot     glows in the verdict's colour; its size follows the 2026 net $ against the live setting (the ghost outline is live)
//   the hammer    strikes (with sparks) every time a dial is turned
//   the furnace   embers behind, a quench barrel beside
// createForge(canvas, { O }) -> { setState({ color, scale, kind }), strike(), onQuality(cb), lite(), quality(), stats(), dispose() }
// JOB 4+5 (2026-11-04): a reflective stone floor around the dais, bronze hoops and an iron-hot ingot rim, light shafts through furnace smoke, dust,
// big furnace embers, contact shadows under the anvil, furnace and barrel, a cool rim light. One draw call each (OLYMPUS fx-atmos.js).
// Reduced motion: no frame is drawn while nothing changes; a strike is a single flash instead of an animation.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as FX from '../olympus/fx-atmos.js';

const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a bevelled block (an extruded rounded rectangle): the ingot and the hammer head catch the light on their edges instead of reading as flat boxes
function bevelBox(w, h, d, b = 0.04, taper = 0) {
  const sh = new THREE.Shape(), x = w / 2, y = h / 2, t = taper * w / 2;
  sh.moveTo(-x, -y); sh.lineTo(x, -y); sh.lineTo(x - t, y); sh.lineTo(-x + t, y); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
}
// the anvil's side profile (heel, face, horn, waist, foot) extruded with a bevel: one mesh, one draw call
function anvilGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.95, 0); sh.lineTo(0.95, 0); sh.lineTo(0.95, 0.1); sh.lineTo(0.64, 0.3); sh.lineTo(0.5, 0.6); sh.lineTo(0.48, 0.95); sh.lineTo(0.7, 1.08);
  sh.bezierCurveTo(1.4, 1.12, 2.1, 1.2, 2.75, 1.36); sh.lineTo(2.75, 1.4); sh.bezierCurveTo(2.1, 1.5, 1.5, 1.5, 1.35, 1.5);
  sh.lineTo(-1.2, 1.5); sh.lineTo(-1.38, 1.4); sh.lineTo(-1.2, 1.3); sh.lineTo(-0.7, 1.12); sh.lineTo(-0.5, 0.95); sh.lineTo(-0.5, 0.6); sh.lineTo(-0.64, 0.3); sh.lineTo(-0.95, 0.1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.84, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -0.42); return g;
}

export function createForge(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a130e');
  scene.fog = new THREE.FogExp2(0x2a1d14, 0.04);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  let fxList = [], lastT = 0, lite = false, dirty = true, qcb = null, drawn = 0, frames = 0, stopped = false, raf = 0, strikes = 0;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', tint: '#c8a24a', theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, exposure: 1.0, maxDpr: 1.75, bloom: { strength: 0.22, radius: 0.5, threshold: 0.95 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; setCounts(); FX.setQuality(fxList, l); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';
  const glow = glowTexture();

  // ---- light
  scene.add(new THREE.HemisphereLight('#d9b98a', '#2a1a10', 0.7));
  const key = new THREE.DirectionalLight('#ffd9a8', 1.15); key.position.set(3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#e8c58f', 0.5); rim.position.set(-4, 3, -5); scene.add(rim);
  const fire = new THREE.PointLight('#ff7a30', 26, 14, 1.5); fire.position.set(-3.2, 1.6, -1.6); scene.add(fire);
  const ingotLight = new THREE.PointLight('#ffb547', 6, 6, 1.6);   ingotLight.position.set(0, 2.3, 0.4); scene.add(ingotLight);
  const bounce = new THREE.PointLight('#ff9a5a', 10, 9, 1.8); bounce.position.set(0, 0.35, 1.6); scene.add(bounce);          // the glow of the ingot thrown back on the floor

  // ---- floor: a round stone dais
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.3, 48), M.marble({ color: '#b9ac98', gold: false, scale: 0.5, roughness: 0.55 }));
  dais.position.y = -0.15; scene.add(dais);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.04, 8, 96), FX.bronze({ color: '#9c6b3c', roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  const floorFx = FX.polishedFloor({ size: 80, color: '#2a2018', y: -0.32, roughness: 0.3, metalness: 0.4, env: 0.5 }); scene.add(floorFx.object);
  const shaftFx = FX.shafts({ count: 4, from: [-2, 11, -3], to: [0.5, 0, 0.5], width: 5, spread: [6, 0, 4], color: "#ffc58a", strength: 0.075, seed: 8 }); scene.add(shaftFx.object);
  const dustFx = FX.dust({ count: 200, box: [16, 7, 14], color: '#ffd9b0', size: 4, strength: 0.8, seed: 12 }); dustFx.object.position.set(0, -0.2, -1); scene.add(dustFx.object);
  const emberFx = FX.embers({ count: 150, origin: [-3.4, 0.9, -1.6], spread: [1.5, 0, 1.0], rise: 5.2, colors: ['#fff0b0', '#ff9a3a', '#c2300f'], size: 6.5, wind: 0.5, seed: 31 }); scene.add(emberFx.object);
  const aoAnvil = FX.contactAO({ radius: 1.9, strength: 0.85, depth: 1.3 }), aoFurn = FX.contactAO({ radius: 1.9, strength: 0.8, depth: 1.4 }), aoBarrel = FX.contactAO({ radius: 0.95, strength: 0.75 });
  aoAnvil.object.position.set(0, 0.01, 0); aoFurn.object.position.set(-3.4, 0.01, -2.2); aoFurn.object.rotation.z = 0.5; aoBarrel.object.position.set(3.3, 0.01, -1.4);
  scene.add(aoAnvil.object, aoFurn.object, aoBarrel.object);
  fxList = [floorFx, shaftFx, dustFx, emberFx, aoAnvil, aoFurn, aoBarrel];

  // ---- the anvil
  const steel = M.metal({ kind: 'gunmetal', color: '#4a3a2c', roughness: 0.45 }), chrome = FX.bronze({ color: '#8a6a44', roughness: 0.35 });
  const anvil = new THREE.Group(); scene.add(anvil);
  const part = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; anvil.add(m); return m; };
  part(anvilGeometry(), M.metal({ kind: 'gunmetal', color: '#6b5a48', roughness: 0.36 }), -0.3, 0, 0);      // forged steel: the night environment's light strips run along its face and horn

  // ---- the ingot (this setting) and its ghost (live)
  const iMat = new THREE.MeshStandardMaterial({ color: '#ffb547', emissive: new THREE.Color('#ffb547'), emissiveIntensity: 1.0, roughness: 0.4, metalness: 0.2 });
  const ingot = new THREE.Mesh(bevelBox(1.0, 0.3, 0.5, 0.035, 0.16), iMat);
  const ingotG = new THREE.Group(); ingotG.position.set(0, 1.64, 0); ingotG.add(ingot); ingot.position.y = 0.15 - 0.15; scene.add(ingotG);
  const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 0.3, 0.5)), new THREE.LineBasicMaterial({ color: hdr('#e8d9b8', 1.1), transparent: true, opacity: 0.55 }));
  ghost.position.set(0, 1.64, 0); scene.add(ghost);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#ffb547', 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(3.2, 2.0, 1); halo.position.set(0, 1.8, 0); scene.add(halo);

  // ---- the hammer (pivot at the right of the anvil)
  const hammer = new THREE.Group(); hammer.position.set(1.15, 2.05, 0.95); scene.add(hammer);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.9, 10), M.metal({ kind: 'gunmetal', color: '#5a3c28', roughness: 0.7 }));
  handle.position.y = 0.95; const head = new THREE.Mesh(bevelBox(0.75, 0.38, 0.38, 0.04), chrome); head.position.y = 1.9;
  hammer.add(handle, head);
  const REST = -0.95, HIT = 0.0;
  hammer.rotation.z = REST; hammer.rotation.x = 0;

  // ---- the furnace behind-left
  const furnace = new THREE.Group(); furnace.position.set(-3.4, 0, -2.2); furnace.rotation.y = 0.5; scene.add(furnace);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.5), M.marble({ color: '#a89a86', gold: false, scale: 0.9, roughness: 0.8 }));
  body.position.y = 1.1; furnace.add(body);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), new THREE.MeshBasicMaterial({ color: hdr('#ff8a3a', 1.7) }));
  mouth.position.set(0, 0.95, 0.76); furnace.add(mouth);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 24, Math.PI), steel); arch.position.set(0, 1.35, 0.77); furnace.add(arch);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), steel); chimney.position.set(0.4, 3.0, -0.2); furnace.add(chimney);
  const fGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: hdr('#ff9a4a', 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  fGlow.scale.set(3.4, 2.6, 1); fGlow.position.set(0, 1.0, 1.1); furnace.add(fGlow);

  // ---- the quench barrel (right-back)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.0, 20), M.metal({ kind: 'gunmetal', color: '#6a4a36', roughness: 0.55 }));
  barrel.position.set(3.3, 0.5, -1.4); scene.add(barrel);
  const bronzeMat = FX.bronze({ color: '#9c6a3a', roughness: 0.32 });
  for (const y of [0.18, 0.82]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.035, 8, 40), bronzeMat); hoop.rotation.x = Math.PI / 2; hoop.position.set(3.3, y, -1.4); scene.add(hoop); }
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: hdr('#4b7a99', 0.7) }));
  water.rotation.x = -Math.PI / 2; water.position.set(3.3, 0.96, -1.4); scene.add(water);

  // ---- sparks (a strike) and drifting embers
  const SPARKS = 140, EMBERS = 70;
  const mkPoints = (n, size, color) => {
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glow, color: hdr(color, 1.8), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true }));
    pts.frustumCulled = false; scene.add(pts); return { pts, pos, vel, n };
  };
  const sparks = mkPoints(SPARKS, 0.16, '#ffd27a'), embers = mkPoints(EMBERS, 0.1, '#ff8a3a');
  sparks.t = -1; sparks.show = SPARKS; embers.show = EMBERS;
  const resetEmber = (i, spread) => {
    embers.pos[i * 3] = -3.4 + (Math.random() - 0.5) * 1.6; embers.pos[i * 3 + 1] = spread ? Math.random() * 4 : 0.8 + Math.random() * 0.6; embers.pos[i * 3 + 2] = -2.2 + (Math.random() - 0.5) * 1.2;
    embers.vel[i * 3] = (Math.random() - 0.3) * 0.25; embers.vel[i * 3 + 1] = 0.3 + Math.random() * 0.6; embers.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
  };
  for (let i = 0; i < EMBERS; i++) resetEmber(i, true);
  embers.pts.material.opacity = 0.85; embers.pts.visible = false;     // replaced by the big furnace embers (fx-atmos)
  function setCounts() { embers.show = lite ? 24 : EMBERS; sparks.show = lite ? 60 : SPARKS; embers.pts.geometry.setDrawRange(0, embers.show); sparks.pts.geometry.setDrawRange(0, sparks.show); }
  setCounts(); FX.setQuality(fxList, rc.quality());

  // ---- state
  const st = { color: new THREE.Color('#ffb547'), target: new THREE.Color('#ffb547'), scale: 1, tScale: 1, kind: 'live', strikeT: -1, flash: 0, hitDone: false };
  function setState({ color, scale, kind }) {
    if (color) st.target.set(color);
    if (typeof scale === 'number' && isFinite(scale)) st.tScale = Math.max(0.5, Math.min(1.55, scale));
    if (kind) st.kind = kind;
    if (reduced()) { st.color.copy(st.target); st.scale = st.tScale; }
    dirty = true;
  }
  function burst() {
    const { pos, vel } = sparks;
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, up = 1.2 + Math.random() * 3.2, s = 0.8 + Math.random() * 2.6;
      pos[i * 3] = (Math.random() - 0.5) * 0.7; pos[i * 3 + 1] = 1.85; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * s * 0.6;
    }
    sparks.pts.geometry.attributes.position.needsUpdate = true; sparks.t = 0; sparks.pts.material.opacity = 1;
  }
  function strike() {
    strikes++;
    if (reduced()) { st.flash = 1; dirty = true; return; }
    st.strikeT = 0; st.hitDone = false; dirty = true;
  }

  let gapAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (O && O.hidden())) return;                            // hidden / covered: no JS, no frame (docs/OLYMPUS_PERF.md)
    const gap = O && O.frameGap ? O.frameGap() : 0;                       // idle 30 / 15 fps, battery saver, 3D Off 2 fps; a touch = full rate
    if (gap && now - gapAt < gap - 3) return;
    gapAt = now;
    const live = !reduced(), t = now / 1000;
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.fov = a < 0.75 ? 56 : a < 1.2 ? 48 : 40; camera.updateProjectionMatrix();
    const dt = Math.min(0.12, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
    const settling = (Math.pow(st.color.r - st.target.r, 2) + Math.pow(st.color.g - st.target.g, 2) + Math.pow(st.color.b - st.target.b, 2)) > 1e-5 || Math.abs(st.scale - st.tScale) > 0.002;
    const busy = st.strikeT >= 0 || sparks.t >= 0 || st.flash > 0.01;
    if (!live && !dirty && !settling && !busy) return;
    const k = live ? 0.12 : 1;
    st.color.lerp(st.target, k); st.scale += (st.tScale - st.scale) * k;
    // the hammer
    if (st.strikeT >= 0) {
      st.strikeT += dt;
      const u = st.strikeT / 0.42;
      const ang = u < 0.3 ? REST + (HIT - REST) * Math.pow(u / 0.3, 2) : HIT + (REST - HIT) * Math.min(1, (u - 0.3) / 0.7);
      hammer.rotation.z = ang;
      if (!st.hitDone && u >= 0.3) { st.hitDone = true; burst(); st.flash = 1; }
      if (u >= 1) { st.strikeT = -1; hammer.rotation.z = REST; }
    }
    st.flash *= 0.9;
    // the ingot
    const heat = 0.95 + st.flash * 1.6 + (live ? Math.sin(t * 2.2) * 0.1 : 0);
    iMat.color.copy(st.color); iMat.emissive.copy(st.color); iMat.emissiveIntensity = heat;
    ingotG.scale.set(st.scale, 1 + (st.scale - 1) * 0.6, 1 + (st.scale - 1) * 0.6);
    halo.material.color.copy(st.color).multiplyScalar(0.55 + st.flash * 0.9);
    halo.scale.set(1.8 + st.scale * 0.8, 1.0 + st.scale * 0.4, 1);
    ingotLight.color.copy(st.color); ingotLight.intensity = 3 + st.flash * 8;
    ghost.material.opacity = 0.45 + (live ? Math.sin(t * 1.6) * 0.1 : 0);
    // fire + embers + sparks
    fire.intensity = 24 + (live ? Math.sin(t * 9) * 4 + Math.sin(t * 13.7) * 3 : 0);
    fGlow.scale.set(3.2 + (live ? Math.sin(t * 7) * 0.25 : 0), 2.5 + (live ? Math.sin(t * 9) * 0.3 : 0), 1);
    FX.update(fxList, live ? t : 0, rc.renderer.getPixelRatio());
    if (false) {
      const arr = embers.pts.geometry.attributes.position.array;
      for (let i = 0; i < embers.show; i++) {
        arr[i * 3] += embers.vel[i * 3] * dt; arr[i * 3 + 1] += embers.vel[i * 3 + 1] * dt; arr[i * 3 + 2] += embers.vel[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] > 4.4) resetEmber(i, false);
      }
      embers.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (sparks.t >= 0) {
      sparks.t += dt;
      const arr = sparks.pts.geometry.attributes.position.array;
      for (let i = 0; i < sparks.show; i++) {
        arr[i * 3] += sparks.vel[i * 3] * dt; arr[i * 3 + 1] += sparks.vel[i * 3 + 1] * dt; arr[i * 3 + 2] += sparks.vel[i * 3 + 2] * dt;
        sparks.vel[i * 3 + 1] -= 7.5 * dt; if (arr[i * 3 + 1] < 0.05) { arr[i * 3 + 1] = 0.05; sparks.vel[i * 3 + 1] *= -0.25; sparks.vel[i * 3] *= 0.5; sparks.vel[i * 3 + 2] *= 0.5; }
      }
      sparks.pts.geometry.attributes.position.needsUpdate = true; sparks.pts.material.opacity = Math.max(0, 1 - sparks.t / 1.1);
      if (sparks.t > 1.15) { sparks.t = -1; sparks.pts.material.opacity = 0; }
    }
    // the camera: the anvil sits in the upper part of a portrait screen (the sheet covers the lower half)
    const sway = live ? Math.sin(t * 0.25) * 0.35 : 0;
    camera.position.set(0.7 + sway, 3.6, 11.8); camera.lookAt(0.2, -2.0, 0);
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  hammer.rotation.z = REST;
  raf = requestAnimationFrame(frame);
  return {
    setState, strike, onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; },
    lite: () => lite, quality: () => rc.quality(),
    stats: () => ({ frames, drawn, quality: rc.quality(), fx: fxList.length, calls: rc.renderer.info.render.calls, passes: rc.passes().length, strikes, kind: st.kind, scale: Math.round(st.tScale * 100) / 100, color: '#' + st.target.getHexString(),
      sparksLive: sparks.t >= 0 }),
    dispose() { stopped = true; cancelAnimationFrame(raf); rc.dispose(); },
  };
}
