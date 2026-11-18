// FATES scene: everything three.js. The page (fates.js) owns the data, the HUD and the sheet; this module only draws.
//
//   const sc = createScene(canvas, { lite, onLost })   null when WebGL is missing
//   sc.build(threads, map, { money })   lays the scenario's threads out (sets th.world / th.ks for taps and the bead)
//   sc.frame(now, { k, sec, sel, reduced, focus })     one frame: k = sessions spun so far, sec = seconds since the spin
//   sc.resize(lite, top, bottom)        the free band between the top bar and the bottom bar (CSS px)
//   sc.pick(x, y, kNow) / sc.pointOf(id, i) / sc.bead(th, k) / sc.theme(tokens) / sc.probe()
//
// Look: silk ribbons (a fibre core, a scattered-light halo, twisted sheen bands that run along the thread), a spindle that
// spins (a lathe body with wound-thread spirals + a wobbling whorl), red snaps that splash a ring across the floor, gold
// passes that ripple a ring through the gate, golden motes drifting through the gate.
// JOB 4+5 (2026-11-04): light shafts falling through the loom, dust in them, gold sparks rising off the spindle, contact shadows under the posts and
// the bronze plinth the spindle stands on (olympus/fx-atmos.js: one draw call each; +7 calls, budget 64).
// Render (2026-11-03, docs/OLYMPUS_RENDER.md): the OLYMPUS render core in 'display' space (the silk keeps its colours) with
// bloom + 4x MSAA on HD and FXAA on LITE; the arena is the loom of the Moirai (fates-loom.js: marble posts, gold beams, a sheet of
// warp fibres, a colonnade); the spindle is gold; the eval gauge stands beside the loom (sc.gauge). Draw calls: about 50 with the
// post passes (budget 64).
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import { buildLoom } from './fates-loom.js';
import * as FX from '../olympus/fx-atmos.js';

export const COL = { gold: [0.95, 0.74, 0.3], red: [0.85, 0.36, 0.22], violet: [0.78, 0.68, 0.52] };
export const Y1 = 3.0;            // the target's height (progress 1)
export const LEN = 34;            // how far the future runs into the distance
const FOG_D = 0.045;
const FOG = `
  uniform float uFog;
  float fogOf(vec4 mv) { float d = -mv.z; return 1.0 - exp(-uFog * uFog * d * d); }`;



function label(text, color, h = 0.32) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fs = 64;
  ctx.font = `700 ${fs}px Georgia, Georgia, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = fs + 32;
  ctx.font = `700 ${fs}px Georgia, Georgia, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 20, c.height / 2);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  s.scale.set(h * w / c.height, h, 1);
  return s;
}
function dispose(o) { o.traverse((x) => { x.geometry?.dispose(); if (x.material) { x.material.map?.dispose(); x.material.dispose(); } }); }

export function createScene(canvas, opt = {}) {
  const BG = new THREE.Color(0x1a130e);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG.getHex(), FOG_D);
  const cam = new THREE.PerspectiveCamera(56, 1, 0.1, 120);
  let rc;
  try {
    rc = createRenderer({ canvas, scene, camera: cam, space: 'display', env: 'night', theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, tint: '#ffd36a', autoSize: false, fitCamera: false, adapt: false,
      maxDpr: 1.75, bloom: { strength: 0.24, radius: 0.55, threshold: 0.9 }, grade: { vignette: 0.36, grain: 0.035 } });
  } catch (e) { return null; }
  const R = rc.renderer;
  R.setClearColor(BG, 1);
  const baseTier = () => rc.forced || (window.OLYMPUS && window.OLYMPUS.fx() === 'off' ? 'off' : rc.software ? 'low' : null);   // 3D Off = the core's 'off' tier (pixel ratio 1, direct draw)
  const tierFor = (v) => baseTier() || (v ? 'low' : ['ultra', 'high'].indexOf(rc.quality()) >= 0 ? rc.quality() : 'high');
  if (opt.lite || baseTier()) rc.setQuality(tierFor(!!opt.lite));
  const G = {};
  const U = { uT: { value: 0 }, uFog: { value: FOG_D }, uGateY: { value: Y1 }, uFloorY: { value: 0 }, uPx: { value: 1 },
    uAccent: { value: new THREE.Color(1.0, 0.81, 0.35) } };   // shared uniforms (one update a frame reaches every shader)
  let lite = !!opt.lite, MAP = null, seedBase = 1;
  const rnd = (i, s = 0) => { const x = Math.sin((i + 1) * 127.1 + (s + seedBase) * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------------------------------------------------------------------------------------------- set pieces
  const planeVS = `varying vec3 vW; varying float vF; ${FOG}
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vF = fogOf(mv); gl_Position = projectionMatrix * mv; }`;
  // the abyss: a red grid flowing toward the viewer, a glow under today
  G.abyss = new THREE.Mesh(new THREE.PlaneGeometry(60, 80, 1, 1), new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uFog: U.uFog }, vertexShader: planeVS,
    fragmentShader: `varying vec3 vW; varying float vF; uniform float uT;
      float line(float x, float w) { float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
      void main() {
        float g = max(line(vW.x * 0.5, 0.04), line((vW.z - uT * 0.6) * 0.5, 0.04));
        float glow = exp(-length(vW.xz * vec2(0.12, 0.05)));
        vec3 c = vec3(0.09, 0.05, 0.03) + vec3(0.55, 0.22, 0.12) * g * 0.3 * (0.4 + glow) + vec3(0.3, 0.12, 0.06) * glow * 0.45;
        gl_FragColor = vec4(mix(c, vec3(0.102, 0.075, 0.055), vF), 1.0);
      }`,
  }));
  G.abyss.rotation.x = -Math.PI / 2; G.abyss.position.set(0, 0, -LEN / 2 + 4); G.abyss.renderOrder = -2;
  // the golden gate: a shimmering lattice of light at the target's height
  G.gate = new THREE.Mesh(new THREE.PlaneGeometry(60, 80, 1, 1), new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uFog: U.uFog, uAccent: U.uAccent }, vertexShader: planeVS,
    fragmentShader: `varying vec3 vW; varying float vF; uniform float uT; uniform vec3 uAccent;
      float line(float x, float w) { float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
      void main() {
        float g = max(line(vW.x * 0.35 + sin(vW.z * 0.15 + uT) * 0.1, 0.03), line(vW.z * 0.35 + uT * 0.25, 0.03));
        float shimmer = 0.5 + 0.5 * sin(vW.x * 0.6 + vW.z * 0.4 + uT * 1.7);
        float a = (0.045 + g * 0.42 * (0.55 + 0.45 * shimmer)) * (1.0 - vF);
        gl_FragColor = vec4(uAccent * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  G.gate.rotation.x = -Math.PI / 2; G.gate.position.set(0, Y1, -LEN / 2 + 4);
  const rimMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  G.rim = new THREE.Mesh(new THREE.BoxGeometry(12, 0.03, 0.03), rimMat(0xffd36a, 0.85));
  G.rim.position.set(0, Y1, -1.6);
  G.floorRim = new THREE.Mesh(new THREE.BoxGeometry(12, 0.025, 0.025), rimMat(0xc0603f, 0.6));
  G.floorRim.position.set(0, 0.01, -1.6);
  scene.add(G.abyss, G.gate, G.rim, G.floorRim);

  // the spindle: a lathe body wound with thread (spirals that run as it spins) and a wobbling whorl
  const prof = [[0, -0.42], [0.025, -0.36], [0.04, -0.16], [0.13, -0.05], [0.19, 0.06], [0.2, 0.16], [0.15, 0.3], [0.07, 0.44], [0.035, 0.62], [0.02, 0.8], [0, 0.86]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  G.spinBody = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 18 : 32), new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uAccent: U.uAccent },
    vertexShader: `varying vec2 vUv; varying float vRim;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal);
        vRim = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.2); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vRim; uniform vec3 uAccent;
      void main() {
        float wind = abs(fract(vUv.y * 34.0 + vUv.x * 3.0) - 0.5) * 2.0;      // the wound thread: a helix round the body
        float band = smoothstep(0.25, 0.95, wind);
        float seam = smoothstep(0.96, 1.0, abs(fract(vUv.x * 6.0) - 0.5) * 2.0); // six seams make the turning visible
        vec3 c = mix(vec3(0.80, 0.62, 0.40), uAccent, smoothstep(0.15, 0.7, vUv.y)) * (0.25 + 0.75 * band) + seam * 0.35;
        gl_FragColor = vec4((c * 0.6 + vec3(1.0, 0.92, 0.8) * vRim * 0.7) * 0.75, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  G.spinBody.scale.setScalar(1.04);                       // the silk shader wraps a solid gold core
  G.spinCore = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 18 : 32), M.metal({ kind: 'gold', roughness: 0.22 }));
  G.whorl = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.032, 12, 48), M.metal({ kind: 'gold', roughness: 0.18 }));
  G.whorl.rotation.x = Math.PI / 2;
  G.whorlGlass = new THREE.Mesh(new THREE.CircleGeometry(0.29, 40).rotateX(-Math.PI / 2), M.glass({ color: '#efe3cc', rim: '#d8c19a', opacity: 0.3 }));
  G.whorlGlass.material.side = THREE.DoubleSide;
  G.whorl.add(G.whorlGlass); G.whorlGlass.rotation.x = -Math.PI / 2;
  G.spindle = new THREE.Group();
  G.spindle.add(G.spinCore, G.spinBody, G.whorl);
  G.spindle.scale.setScalar(0.62);
  scene.add(G.spindle);

  G.labels = new THREE.Group();
  scene.add(G.labels);

  // the arena: the loom of the Moirai (marble, gold, a sheet of warp fibres), lit for the physical materials
  const loom = buildLoom({ lite, len: LEN, y1: Y1 });
  scene.add(loom.group);
  // the room's light and air (JOB 4+5)
  const fxShafts = FX.shafts({ count: 4, from: [-3.2, 12, -1], to: [0.4, 0, -3], width: 5, spread: [6, 0, 5], color: '#ffd38a', strength: 0.11, seed: 14 });
  const fxDust = FX.dust({ count: 180, box: [18, 9, 26], color: '#ffe3b0', size: 4, strength: 0.75, seed: 6 }); fxDust.object.position.set(0, 0, -9);
  const fxSparks = FX.embers({ count: 110, origin: [0, 0.4, 0], spread: [0.5, 0, 0.5], rise: 3.6, colors: ['#fff4cc', '#e0b060', '#c8a24a'], size: 5, wind: 0, seed: 40 });
  const fxAoL = FX.contactAO({ radius: 0.7, strength: 0.7 }), fxAoR = FX.contactAO({ radius: 0.7, strength: 0.7 }), fxAoS = FX.contactAO({ radius: 0.8, strength: 0.6 });
  fxAoL.object.position.set(-2.1, 0.01, -1.8); fxAoR.object.position.set(2.1, 0.01, -1.8); fxAoS.object.position.set(0, 0.01, 0);
  const plinth = new THREE.Group();                               // a bronze plinth with a marble ring under the spindle
  const bronzeM = FX.bronze({ color: '#a4733f', roughness: 0.34 });
  const pBase = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.14, lite ? 18 : 40), bronzeM); pBase.position.y = 0.07;
  const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, lite ? 24 : 56), M.metal({ kind: 'gold', roughness: 0.2 })); pRing.rotation.x = Math.PI / 2; pRing.position.y = 0.15;
  plinth.add(pBase, pRing);
  // the atmosphere joins the scene after the second frame: the first paint (and the shader compile on a slow GPU) is the loom and the threads only
  const fxLate = [plinth, fxShafts.object, fxDust.object, fxSparks.object, fxAoL.object, fxAoR.object, fxAoS.object];
  let fxFrames = 0;
  const fxList = [fxShafts, fxDust, fxSparks, fxAoL, fxAoR, fxAoS];
  let fxQ = '';

  // the eval gauge (sc.gauge): a rod beside the loom, red from the floor up to today's balance (the drawdown left), gold from there
  // to the gate (still to earn), a pearl at today; and a pass-odds wheel above the gate (gold arc = pass, dim ring = the rest)
  G.gauge = new THREE.Group();
  G.gauge.visible = false;
  const rod = (c) => new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 12), M.neon({ color: c, intensity: 2.4, fog: true }));
  G.gRoom = rod('#c96a4a'); G.gToGo = rod('#d4b05a');
  G.gPearl = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), M.glass({ color: '#ffffff', rim: '#ffffff', opacity: 0.85 }));
  G.gWheelBg = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 64), M.neon({ color: '#8a7656', intensity: 0.8, fog: true, opacity: 0.8 }));
  G.gWheel = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.355, 64, 1, 0, 0.01), M.neon({ color: '#d4b05a', intensity: 1.4, fog: true }));
  G.gWheel.rotation.z = Math.PI / 2; G.gWheelBg.rotation.z = 0;
  G.gauge.add(G.gRoom, G.gToGo, G.gPearl, G.gWheelBg, G.gWheel);
  scene.add(G.gauge);
  const GX = 1.45, GZ = -1.6;

  // motes: violet / gold dust in the air + golden motes rising through the gate (one Points buffer)
  function makeMotes() {
    if (G.motes) { scene.remove(G.motes); dispose(G.motes); G.motes = null; }
    const nd = lite ? 0 : 640, ng = lite ? 90 : 260, n = nd + ng;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const gate = i >= nd;
      pos[i * 3] = (Math.random() - 0.5) * (gate ? 13 : 18);
      pos[i * 3 + 1] = gate ? 0 : Math.random() * Y1 * 1.4 - 0.4;
      pos[i * 3 + 2] = gate ? 1 - Math.pow(Math.random(), 0.7) * LEN * 0.8 : 4 - Math.random() * LEN;
      seed[i] = Math.random() + (gate ? 2 : 0);                 // 0..1 dust, 2..3 gate motes
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    G.motes = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uT: U.uT, uPx: U.uPx, uFog: U.uFog, uGateY: U.uGateY, uAccent: U.uAccent, uMove: { value: 1 } },
      vertexShader: `attribute float aSeed; uniform float uT, uPx, uMove, uGateY; uniform vec3 uAccent; varying float vA; varying vec3 vC; ${FOG}
        void main() { vec3 p = position; float t = uT * uMove; float gate = step(1.5, aSeed); float s = fract(aSeed);
          if (gate > 0.5) {                                   // rise through the gate, swirl a little, fade at both ends
            float u = fract(t * (0.05 + s * 0.06) + s * 9.0);
            p.y = uGateY - 0.9 + u * 1.9; p.x += sin(t * 0.7 + s * 50.0) * 0.35; p.z += cos(t * 0.5 + s * 30.0) * 0.25;
            vA = sin(u * 3.14159) * (0.55 + 0.45 * sin(t * 3.0 + s * 80.0));
            vC = mix(uAccent, vec3(1.0, 0.97, 0.85), 0.35);
          } else {
            p.y += mod(t * (0.05 + s * 0.08) + s * 7.0, 4.6) - 1.0; p.x += sin(t * 0.3 + s * 40.0) * 0.25;
            vA = 0.25 + 0.35 * sin(t * 1.3 + s * 30.0) * sin(t * 1.3 + s * 30.0);
            vC = mix(vec3(0.85, 0.72, 0.52), vec3(1.0, 0.82, 0.45), step(0.7, s));
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.0 + s * 2.0 + gate * 1.5) * 18.0 / max(1.0, -mv.z);
          vA *= 1.0 - fogOf(mv); }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5);
        float a = (smoothstep(0.5, 0.0, d) + smoothstep(0.12, 0.0, d)) * vA; gl_FragColor = vec4(vC * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    G.motes.frustumCulled = false;
    scene.add(G.motes);
  }
  makeMotes();

  // ---------------------------------------------------------------------------------------------- layout of a scenario
  const zOf = (k) => 1.2 - LEN * Math.pow(Math.max(0, k) / MAP.H, MAP.tPow);
  function xOf(id, k) {
    const s = Math.pow(Math.max(0, k) / MAP.H, 0.4);
    const a = (rnd(id) - 0.5) * 2, b = rnd(id, 3) - 0.5;
    return (a * MAP.spread + b * 0.6 * Math.sin(k * 0.25 + id)) * s;
  }
  function worldPts(th) {
    const out = th.pts.map(([k, v]) => new THREE.Vector3(xOf(th.id, k), MAP.yOf(v), zOf(k)));
    const last = th.pts[th.pts.length - 1];
    if (!MAP.money && th.o !== 'o') {                         // the end: into the abyss, or up through the gate
      const k = last[0] + 0.5;
      out.push(new THREE.Vector3(xOf(th.id, k), th.o === 'p' ? Y1 * 1.16 : MAP.floorY - 0.6, zOf(k)));
    }
    return out;
  }
  const clear = (k) => { if (G[k]) { scene.remove(G[k]); dispose(G[k]); G[k] = null; } };

  function makeThreads(list, W) {
    let nv = 0, ni = 0;
    W.forEach((p) => { nv += p.length * 2; ni += (p.length - 1) * 6; });
    const pos = new Float32Array(nv * 3), prv = new Float32Array(nv * 3), nxt = new Float32Array(nv * 3);
    const side = new Float32Array(nv), kk = new Float32Array(nv), id = new Float32Array(nv), col = new Float32Array(nv * 3), end = new Float32Array(nv);
    const idx = new Uint32Array(ni);
    let v = 0, ii = 0;
    list.forEach((th, t) => {
      const P = W[t], c = COL[th.color] || COL.violet, ks = th.pts.map((p) => p[0]);
      if (P.length > ks.length) ks.push(ks[ks.length - 1] + 0.5);
      const kEnd = ks[ks.length - 1], base = v;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[i], n = P[Math.min(P.length - 1, i + 1)];
        for (const sd of [-1, 1]) {
          pos.set([b.x, b.y, b.z], v * 3); prv.set([a.x, a.y, a.z], v * 3); nxt.set([n.x, n.y, n.z], v * 3);
          side[v] = sd; kk[v] = ks[i]; id[v] = t; col.set(c, v * 3); end[v] = kEnd;
          v++;
        }
        if (i < P.length - 1) { const q = base + i * 2; idx.set([q, q + 1, q + 2, q + 1, q + 3, q + 2], ii); ii += 6; }
      }
      th.world = P; th.ks = ks;
    });
    const g = new THREE.BufferGeometry();
    for (const [n, a, s] of [['position', pos, 3], ['aPrev', prv, 3], ['aNext', nxt, 3], ['aSide', side, 1], ['aK', kk, 1], ['aId', id, 1], ['aCol', col, 3], ['aEnd', end, 1]]) g.setAttribute(n, new THREE.BufferAttribute(a, s));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    // silk: the ribbon is wider than the fibre; the fragment shader paints a bright core, a soft scattered halo and sheen
    // bands that travel along the fibre (a twisted thread catching the light); forward scatter brightens near the gate
    G.threads = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uClock: U.uT, uAspect: { value: 1 }, uPx: { value: 0.003 }, uW: { value: lite ? 2.4 : 3.0 }, uSel: { value: -1 },
        uGain: { value: Math.min(0.5, 3.4 / Math.sqrt(Math.max(1, list.length))) }, uFog: U.uFog, uGateY: U.uGateY, uFocus: { value: -1 } },
      vertexShader: `attribute vec3 aPrev, aNext, aCol; attribute float aSide, aK, aId, aEnd;
        uniform float uAspect, uPx, uW, uSel, uGateY; varying float vSide, vK, vEnd, vSel, vF, vId, vScat; varying vec3 vCol; ${FOG}
        vec2 scr(vec4 c) { vec2 p = c.xy / c.w; p.x *= uAspect; return p; }
        void main() {
          mat4 m = projectionMatrix * modelViewMatrix;
          vec4 c = m * vec4(position, 1.0); vec2 sc = scr(c), sp = scr(m * vec4(aPrev, 1.0)), sn = scr(m * vec4(aNext, 1.0));
          vec2 d1 = sc - sp, d2 = sn - sc;
          vec2 dir = length(d1) < 1e-6 ? d2 : length(d2) < 1e-6 ? d1 : normalize(d1) + normalize(d2);
          dir = length(dir) < 1e-6 ? vec2(1.0, 0.0) : normalize(dir);
          vec2 nrm = vec2(-dir.y, dir.x); nrm.x /= uAspect;
          float sel = uSel < -0.5 ? 0.0 : (abs(aId - uSel) < 0.5 ? 1.0 : -1.0);
          c.xy += nrm * aSide * uW * (sel > 0.5 ? 2.4 : 1.0) * uPx * c.w;
          gl_Position = c;
          vSide = aSide; vK = aK; vEnd = aEnd; vSel = sel; vCol = aCol; vId = aId;
          vScat = exp(-abs(position.y - uGateY) * 1.4) * 0.8 + exp(-max(0.0, position.y) * 2.5) * 0.35;
          vF = fogOf(modelViewMatrix * vec4(position, 1.0));
        }`,
      fragmentShader: `uniform float uTime, uGain, uClock, uFocus; varying float vSide, vK, vEnd, vSel, vF, vId, vScat; varying vec3 vCol;
        void main() {
          if (vK > uTime) discard;
          float s2 = vSide * vSide;
          float c2 = exp(-s2 * 20.0), c8 = c2 * c2 * c2 * c2;                                  // core^8, a sharp white fibre
          float core = exp(-s2 * 10.0), halo = exp(-s2 * 2.4);
          float twist = 0.5 + 0.5 * sin(vK * 2.1 - uClock * 2.2 + vId * 1.618 + vSide * 2.4);
          float t2 = twist * twist, t4 = t2 * t2, sheen = t4 * t2 * twist * core;        // twist^7 without pow
          float head = uTime < vEnd + 0.4 ? exp(-(uTime - vK) * 1.8) : 0.0;
          float dim = vSel < -0.5 ? 0.12 : vSel > 0.5 ? 2.2 : 1.0;
          if (uFocus > 0.0 && vK > uFocus) dim *= 0.16;
          vec3 col = vCol * (halo * (0.32 + 0.5 * vScat) + core * (0.85 + 2.2 * head))
                   + vec3(1.0, 0.95, 0.88) * (sheen * 0.75 + c8 * (0.22 + head));
          gl_FragColor = vec4(col * uGain * dim * (1.0 - vF * 0.8), 1.0);
        }`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    G.threads.frustumCulled = false;
    scene.add(G.threads);
  }

  // sparks: where a thread snaps (red: a burst falling into the abyss + a ring splashing across the floor) or passes (gold:
  // a burst rising + a ring rippling out in the gate's plane). aKind 0 = burst, 1 = ring.
  function makeSparks(list, secAt) {
    const per = lite ? 5 : 14, ring = lite ? 6 : 16, ev = [];
    for (const th of list) {
      if (!th) continue;
      if (MAP.money) {
        for (const e of th.ev || []) {
          if (e.code !== 4 && e.code !== 3 && e.code !== 2) continue;      // payout, funded lost, eval lost
          if (rnd(th.id, e.k) > (lite ? 0.25 : 0.6)) continue;
          const k = e.k + 1, i = th.ks.findIndex((x) => x >= k);
          ev.push([th.world[Math.max(0, i)], k, e.code === 4 ? 'gold' : 'red', false]);
        }
      } else if (th.o !== 'o') {
        ev.push([th.world[th.pts.length - 1], th.pts[th.pts.length - 1][0], th.color, true]);
      }
    }
    const n = ev.reduce((a, e) => a + per + (e[3] ? ring : 0), 0);
    const o = new Float32Array(n * 3), vel = new Float32Array(n * 3), birth = new Float32Array(n), col = new Float32Array(n * 3), sd = new Float32Array(n), kind = new Float32Array(n);
    let j = 0;
    ev.forEach(([p, k, c, rings], b) => {
      const bs = secAt(k), up = c === 'gold';
      for (let i = 0; i < per; i++, j++) {
        const a = rnd(b * 31 + i, 1) * Math.PI * 2, r = 0.4 + rnd(b * 17 + i, 2) * 1.1;
        o.set([p.x, p.y, p.z], j * 3);
        vel.set([Math.cos(a) * r * 0.6, (up ? 1.4 : 0.9) * (0.5 + rnd(b + i, 5)), Math.sin(a) * r * 0.6], j * 3);
        birth[j] = bs; col.set(COL[c] || COL.violet, j * 3); sd[j] = rnd(b * 7 + i, 9); kind[j] = 0;
      }
      if (!rings) return;
      for (let i = 0; i < ring; i++, j++) {                  // evenly round: a ring that spreads out flat
        const a = (i / ring) * Math.PI * 2 + rnd(b, 4);
        o.set([p.x, up ? MAP.gateY : MAP.floorY + 0.02, p.z], j * 3);
        vel.set([Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], j * 3);
        birth[j] = bs + 0.05; col.set(COL[c] || COL.violet, j * 3); sd[j] = rnd(b * 5 + i, 6); kind[j] = 1;
      }
    });
    const g = new THREE.BufferGeometry();
    for (const [nm, a, s] of [['position', o, 3], ['aVel', vel, 3], ['aBirth', birth, 1], ['aCol', col, 3], ['aSeed', sd, 1], ['aKind', kind, 1]]) g.setAttribute(nm, new THREE.BufferAttribute(a, s));
    G.sparks = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uClock: { value: 0 }, uPx: U.uPx, uFog: U.uFog, uOn: { value: 1 } },
      vertexShader: `attribute vec3 aVel, aCol; attribute float aBirth, aSeed, aKind; uniform float uClock, uPx, uOn; varying vec3 vC; varying float vA, vHot; ${FOG}
        void main() { float age = uClock - aBirth; float life = aKind > 0.5 ? 1.1 : 0.9 + aSeed * 0.7;
          if (uOn < 0.5 || age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vHot = 0.0; return; }
          float up = aCol.g > 0.5 ? 1.0 : -1.0;
          vec3 p = aKind > 0.5 ? position + aVel * (1.0 - exp(-age * 2.6)) * 1.6
                               : position + aVel * age * vec3(1.0, up, 1.0) + vec3(0.0, -up * 1.2 * age * age * (up > 0.0 ? 0.2 : 1.0), 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float f = 1.0 - age / life;
          vHot = exp(-age * 9.0);                              // the snap: a white flash at birth
          gl_PointSize = uPx * (2.0 + 4.0 * f + 5.0 * vHot) * (aKind > 0.5 ? 11.0 : 14.0) / max(1.0, -mv.z);
          vC = aCol; vA = f * f * (1.0 - fogOf(mv)); }`,
      fragmentShader: `varying vec3 vC; varying float vA, vHot; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4((vC + vec3(0.6 + vHot) * smoothstep(0.25, 0.0, d)) * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    G.sparks.frustumCulled = false;
    scene.add(G.sparks);
  }

  function makeBead() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    G.bead = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uPx: U.uPx, uOn: { value: 0 }, uC: { value: new THREE.Color(1, 1, 1) }, uT: U.uT },
      vertexShader: `uniform float uPx, uOn, uT; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uOn * uPx * (220.0 + 30.0 * sin(uT * 6.0)) / max(1.0, -mv.z); }`,
      fragmentShader: `uniform vec3 uC; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        float ring = smoothstep(0.03, 0.0, abs(d - 0.36)) * 0.8; gl_FragColor = vec4((uC + vec3(0.8) * smoothstep(0.18, 0.0, d)) * a + uC * ring, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    G.bead.frustumCulled = false;
    scene.add(G.bead);
  }

  // ---------------------------------------------------------------------------------------------- the public face
  const sc = {
    R, rc, cam, scene, loom, get lite() { return lite; }, accent: U.uAccent.value,   // the gate / motes / spindle colour (a THREE.Color)
    /** threads: from fates-core (evalThreads / moneyThreads); map: {H, tPow, yOf, gateY, floorY, gateText, abyssText, spread, money} */
    build(list, map, secAt) {
      for (const k of ['threads', 'sparks', 'bead']) clear(k);
      G.labels.children.slice().forEach((s) => { G.labels.remove(s); dispose(s); });
      MAP = map;
      const W = list.map(worldPts);
      makeThreads(list, W);
      makeSparks(list, secAt);
      makeBead();
      const startY = list.length ? map.yOf(list[0].pts[0][1]) : 0;
      G.spindle.position.set(0, startY + 0.05, zOf(0) + 0.05);
      G.gate.position.y = map.gateY; G.rim.position.y = map.gateY; U.uGateY.value = map.gateY;
      const minY = Math.min(0, ...W.map((p) => Math.min(...p.map((q) => q.y))));
      const ay = map.floorY != null ? map.floorY : minY - 0.08;
      G.abyss.position.y = ay; G.floorRim.position.y = ay + 0.01; U.uFloorY.value = ay;
      loom.place(map.gateY, ay);
      sc.floorY = ay; sc.gateY = map.gateY;
      for (const a of [fxAoL, fxAoR, fxAoS]) a.object.position.y = ay + 0.012;
      plinth.position.y = ay; fxSparks.object.position.y = ay; fxShafts.object.position.y = ay;
      G.gauge.visible = false;
      const lab = (t, c, h, x, y, z, left = true) => { const s = label(t, c, h); s.position.set(left ? x + s.scale.x / 2 : x, y, z); G.labels.add(s); };
      lab(map.gateText, '#ffd36a', 0.3, -1.75, map.gateY + 0.2, -1.6);
      lab(map.abyssText, '#c96a4a', 0.26, -1.75, map.floorY != null ? ay + 0.2 : map.yOf(0) - 0.2, -1.6);   // money: $0 under its line, clear of the goal
      lab('TODAY', '#efe3cc', 0.17, 0, startY - 0.5, zOf(0), false);
      lab(map.money ? '12 MONTHS' : `DAY ${map.H}`, '#b8a07c', 0.5, 0, map.gateY * 0.5, zOf(map.H) - 1, false);
      if (!map.money && map.H > 12) lab('SESSION 10', '#ffe7a8', 0.22, 2.2, map.gateY + 0.14, zOf(10), false);
      return W;
    },
    reseed() { seedBase = (seedBase * 9301 + 49297) % 233280 || 7; },
    setLite(v) { if (lite === v) return; lite = v; rc.setQuality(tierFor(v)); makeMotes(); },
    resize(top, bottom) {
      const w = window.innerWidth, h = window.innerHeight;
      rc.resize(w, h);
      cam.aspect = w / h;
      const shift = Math.max(-h * 0.3, Math.min(h * 0.3, (top - (h - bottom)) / 2));   // centre the vanishing point in the free band
      cam.setViewOffset(w, h, 0, -shift, w, h);
      cam.updateProjectionMatrix();
    },
    frame(now, st) {
      const tg = now / 1000, px = R.getPixelRatio(), still = st.reduced;
      const dt = Math.min(0.05, Math.max(0, tg - (sc.lastT || tg))); sc.lastT = tg;
      U.uT.value = still ? 0 : tg; U.uPx.value = px;
      const T = G.threads.material.uniforms;
      T.uTime.value = st.k; T.uAspect.value = cam.aspect; T.uPx.value = 2 / Math.max(1, R.domElement.height) * px; T.uSel.value = st.sel;
      T.uFocus.value = st.focus || -1;
      G.sparks.material.uniforms.uClock.value = st.sec; G.sparks.material.uniforms.uOn.value = still ? 0 : 1;
      if (G.motes) G.motes.material.uniforms.uMove.value = still ? 0 : 1;
      if (!still) {                                            // the spindle spins: fast while it spins threads out, then idles
        const busy = st.sec < st.dur + 0.5 ? 1 : 0.25;
        G.spinBody.rotation.y += dt * 9 * busy;                // radians a second: about 1.4 turns a second while spinning
        G.whorl.rotation.y = Math.sin(tg * 2.3) * 0.12; G.whorl.rotation.z = Math.cos(tg * 1.7) * 0.12;
      }
      const sway = still ? 0 : Math.sin(tg * 0.17) * 0.45;
      cam.position.set(sway, 1.55 + (still ? 0 : Math.sin(tg * 0.23) * 0.1), 7.4);
      cam.lookAt(sway * 0.2, MAP && MAP.money ? 0.2 : 1.45, -14);       // money threads start low ($0): look a little down at them
      loom.update(tg, still);
      if (fxLate && ++fxFrames === 3) { fxLate.forEach((o) => scene.add(o)); fxQ = ''; }
      if (rc.quality() !== fxQ) { fxQ = rc.quality(); FX.setQuality(fxList, fxQ); }
      FX.update(fxList, still ? 0 : tg, px);
      rc.render();
    },
    bead(th, k) {
      if (!G.bead) return;
      const m = G.bead.material.uniforms;
      if (!th) { m.uOn.value = 0; return; }
      m.uOn.value = 1; m.uC.value.setRGB(...(COL[th.color] || COL.violet));
      let i = 0;
      while (i < th.ks.length - 1 && th.ks[i + 1] <= k) i++;
      const a = th.world[i], b = th.world[Math.min(i + 1, th.world.length - 1)];
      const ka = th.ks[i], kb = th.ks[Math.min(i + 1, th.ks.length - 1)];
      const t = kb > ka ? Math.min(1, (k - ka) / (kb - ka)) : 0;
      G.bead.geometry.attributes.position.setXYZ(0, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      G.bead.geometry.attributes.position.needsUpdate = true;
    },
    /** the thread nearest a tap (CSS px), within 26 px, among the part already spun */
    pick(list, x, y, kNow) {
      const rect = R.domElement.getBoundingClientRect(), v = new THREE.Vector3();
      x -= rect.left; y -= rect.top;
      let best = -1, bd = 26 * 26;
      for (const th of list) {
        let px = null;
        for (let i = 0; i < th.world.length; i++) {
          if (th.ks[i] > kNow + 0.01) break;
          v.copy(th.world[i]).project(cam);
          if (v.z > 1) { px = null; continue; }
          const sx = (v.x + 1) / 2 * rect.width, sy = (1 - v.y) / 2 * rect.height;
          if (px) {
            const dx = sx - px.x, dy = sy - px.y, L = dx * dx + dy * dy;
            const t = L > 0 ? Math.max(0, Math.min(1, ((x - px.x) * dx + (y - px.y) * dy) / L)) : 0;
            const ex = px.x + t * dx - x, ey = px.y + t * dy - y, d = ex * ex + ey * ey;
            if (d < bd) { bd = d; best = th.id; }
          }
          px = { x: sx, y: sy };
        }
      }
      return best;
    },
    pointOf(th, i) {
      if (!th || !th.world) return null;
      const v = th.world[Math.min(i, th.world.length - 1)].clone().project(cam), rect = R.domElement.getBoundingClientRect();
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    },
    /** OLYMPUS themes: the background (clear colour + fog) and the accent (gate, gate motes, spindle) */
    theme(tok) {
      const bg = tok && (tok.bg || tok['--bg']), acc = tok && (tok.accent || tok['--oly-accent'] || tok.gold);
      try { if (bg) { BG.set(bg); R.setClearColor(BG, 1); scene.fog.color.copy(BG); } } catch (e) { /* not a colour */ }
      try { if (acc) { U.uAccent.value.set(acc); loom.setAccent(U.uAccent.value); } } catch (e) { /* not a colour */ }
    },
    /** The eval gauge: g = { p0 (today's balance as progress 0..1 between the floor and the gate), room, toGo, pass, fail } (fates-core
        gaugeOf), or null to hide it. Money scenarios have no floor, so no gauge. */
    gauge(g) {
      if (!g || !MAP || MAP.money) { G.gauge.visible = false; return; }
      const fy = sc.floorY, gy = MAP.gateY, y = fy + (gy - fy) * Math.max(0, Math.min(1, g.p0));
      G.gauge.visible = true;
      const seg = (m, y0, y1) => { m.position.set(GX, (y0 + y1) / 2, GZ); m.scale.set(1, Math.max(0.001, y1 - y0), 1); };
      seg(G.gRoom, fy, y); seg(G.gToGo, y, gy);
      G.gPearl.position.set(GX, y, GZ);
      G.gWheelBg.position.set(GX, gy + 0.62, GZ);
      G.gWheel.position.copy(G.gWheelBg.position);
      const th = Math.max(0.01, Math.min(6.2832, (g.pass == null ? 0 : g.pass) / 100 * Math.PI * 2));
      G.gWheel.geometry.dispose();
      G.gWheel.geometry = new THREE.RingGeometry(0.29, 0.355, 64, 1, 0, th);
      for (const k of ['gLabRoom', 'gLabGo', 'gLabOdds']) { if (G[k]) { G.gauge.remove(G[k]); dispose(G[k]); G[k] = null; } }
      G.gLabRoom = label(`ROOM ${g.roomText}`, '#d98a6e', 0.15); G.gLabRoom.position.set(GX + 0.1 + G.gLabRoom.scale.x / 2, (fy + y) / 2, GZ);
      G.gLabGo = label(`TO GO ${g.goText}`, '#ffd88a', 0.15); G.gLabGo.position.set(GX + 0.1 + G.gLabGo.scale.x / 2, (y + gy) / 2 + 0.05, GZ);
      G.gLabOdds = label(`PASS ${g.passText}`, '#ffe9b0', 0.17); G.gLabOdds.position.set(GX + 0.46 + G.gLabOdds.scale.x / 2, gy + 0.62, GZ);
      G.gauge.add(G.gLabRoom, G.gLabGo, G.gLabOdds);
    },
    probe() {
      return { gauge: G.gauge.visible, loom: loom.group.children.length, passes: rc.passes(), quality: rc.quality(), bloom: rc.stats().bloom,
       ...{ k: G.threads ? G.threads.material.uniforms.uTime.value : null, calls: R.info.render.calls, tris: R.info.render.triangles,
        verts: G.threads ? G.threads.geometry.attributes.position.count : 0, spin: G.spinBody.rotation.y,
        sparks: G.sparks ? G.sparks.geometry.attributes.position.count : 0, rings: G.sparks ? Array.from(G.sparks.geometry.attributes.aKind.array).filter((x) => x > 0.5).length : 0,
        motes: G.motes ? Array.from(G.motes.geometry.attributes.aSeed.array).filter((x) => x >= 1.5).length : 0 } };
    },
  };
  return sc;
}
