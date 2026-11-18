// KALSHI CITY scene (ES module): the night city, drawn by the OLYMPUS render core (docs/OLYMPUS_RENDER.md).
//   a building      one EDGE of the bot (height = its EV per $1, glow = its recent win rate, lit windows = its bets: gold won, red lost,
//                   roof colour = status). Grey and low = fewer than 30 bets (no verdict). Going up = a new edge; crumbling = one that just died.
//   a district      one market (Bitcoin, Ethereum, ...) on a ring round Downtown (strategies, price bands, hours, sides)
//   the roads       an avenue from Downtown to every district; traffic = the capital that went out (cool) and what came back (gold won, red lost)
//   live orders     the bot's open positions: bright gold cars driving out to their district
//   the weather     the market regime of the last days: clear / overcast / rain / storm; fog when the bot is paused
//   day and night   the New York clock
//   satellite wards low-rise neighborhoods and connecting local roads: scenery only (the guide says so)
//   far skyline     dark towers that carry NO data: scenery only (the guide says so)
// One InstancedMesh holds every building (real edges first, then scenery; tiers cut the scenery), one for the cars, one for the roads.
// createCity(canvas, { O, model, layout }) -> { setBook(model), setHour(h|null), select(id|null), setMode(key), focus(id), pick(x, y), where(id), state(), onPick(cb),
//   onQuality(cb), lite(), quality(), dispose() }. Reduced motion = a still scene redrawn only when something changes.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import { scenery, rng } from './citylayout.js?v=night8';
import { STATUS_COLOR, dayFactor, etHour, pairOf } from './cityfeed.js';
import { Rig } from './cityrig.js?v=night5';
import { createCityFx } from './cityfx.js?v=night5';
import { skylinePorts } from './skylineports.js?v=night5';
import { cityLinks, LINK_SEGMENTS } from './citylinks.js';
import { districtCamera } from './citynav.js?v=nav1';

const TIERS = {
  ultra: { scn: 4200, cars: 420, rain: 3400, embers: 40, links: 12, labels: true },
  high: { scn: 2600, cars: 300, rain: 2000, embers: 28, links: 12, labels: true },
  low: { scn: 1400, cars: 110, rain: 450, embers: 0, links: 5, labels: true },
  off: { scn: 500, cars: 0, rain: 0, embers: 0, links: 0, labels: true },
};
const MAX_SCN = 4200, MAX_CARS = 420, MAX_RAIN = 3400, MAX_ORDERS = 20;
const WEATHER = { clear: { rain: 0, grey: 0, fog: 1 }, overcast: { rain: 0, grey: 0.3, fog: 1.2 }, rain: { rain: 1, grey: 0.55, fog: 1.5 }, storm: { rain: 1.6, grey: 0.8, fog: 1.9 } };
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const lerpC = (a, b, t) => a.clone().lerp(b, t);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (hex) => new THREE.Color(hex);
const SKY = { nTop: C('#2a2a56'), nMid: C('#6a5688'), nHor: C('#e0906a'), dTop: C('#4f7fa3'), dMid: C('#9fc0cf'), dHor: C('#f3dcae'), tw: C('#e08a50'), grey: C('#566070') };

// ------------------------------------------------------------------ the building shader (a MeshStandardMaterial plus windows, roof glow, rise and crumble)
const U = { uTime: { value: 0 }, uAnimT: { value: 0 }, uNight: { value: 1 }, uWinGain: { value: 1.7 }, uRoofGain: { value: 2.4 } };
function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.36, envMapIntensity: 0.85 });
  m.customProgramCacheKey = () => 'kcbuilding2';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', `attribute vec4 aInfo; attribute vec4 aAnim; attribute vec3 aStat; attribute vec4 aArch; uniform float uAnimT;
        varying vec4 vInfo; varying vec3 vStat; varying vec4 vArch; varying vec2 vWin; varying float vKind; varying float vTop; varying float vHgt; varying float vRoof;
        void main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float prog = 1.0;
        if (aAnim.x > 0.5 && aAnim.x < 1.5) { float q = clamp((uAnimT - aAnim.y) / 3.4, 0.0, 1.0); prog = q * q * (3.0 - 2.0 * q); }
        else if (aAnim.x > 1.5 && aAnim.x < 2.5) { float q = clamp((uAnimT - aAnim.y) / 2.6, 0.0, 1.0); prog = 1.0 - 0.82 * q * q * (3.0 - 2.0 * q);
          transformed.xz += vec2(sin(uAnimT * 37.0 + position.y * 11.0), cos(uAnimT * 29.0 + position.y * 7.0)) * 0.06 * sin(q * 3.14159); }
        else if (aAnim.x > 2.5) { float q = clamp((uAnimT - aAnim.y) / 2.4, 0.0, 1.0); prog = mix(aAnim.w, 1.0, q * q * (3.0 - 2.0 * q)); }      // an idea whose dollars moved since the last visit: grows or shrinks from where it stood
        transformed.y *= max(prog, 0.02);
        // Scenic architecture gets stepped/tapered silhouettes without adding a draw call.
        // Edge towers use only a restrained taper; height remains the published metric.
        float upper = smoothstep(0.46, 1.0, position.y);
        transformed.xz *= 1.0 - aArch.x * upper;
        float hh = sc.y * max(prog, 0.02);
        vInfo = aInfo; vStat = aStat; vArch = aArch; vKind = aAnim.z; vHgt = hh; vRoof = position.y; vTop = step(0.5, abs(normal.y));
        float fw = abs(normal.x) > 0.5 ? sc.z : sc.x;
        float hz = abs(normal.x) > 0.5 ? position.z * sc.z : position.x * sc.x;
        vWin = vec2(hz + 0.5 * fw, position.y * hh);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform float uTime; uniform float uNight; uniform float uWinGain; uniform float uRoofGain;
        varying vec4 vInfo; varying vec3 vStat; varying vec4 vArch; varying vec2 vWin; varying float vKind; varying float vTop; varying float vHgt; varying float vRoof;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float real = step(0.5, vKind);
        vec2 scenicCell = mix(vec2(1.08, 1.42), vec2(0.82, 1.72), vArch.y);
        vec2 cell = mix(scenicCell, vec2(0.62, 0.92), real);
        vec2 cu = vWin / cell; vec2 cid = floor(cu); vec2 cf = fract(cu);
        float inWin = step(0.2, cf.x) * step(cf.x, 0.8) * step(0.26, cf.y) * step(cf.y, 0.74) * (1.0 - vTop) * step(0.9, vWin.y) * step(vWin.y, vHgt - 0.5);
        float hs = h21(cid + vInfo.w * 31.7);
        float lit = step(hs, vInfo.y);
        float isLoss = step(h21(cid * 1.37 + vInfo.w * 9.1), vInfo.z) * real;
        float band = (1.0 - real) * step(0.94, fract(vWin.y / mix(5.2, 8.0, vArch.y))) * (1.0 - vTop);
        float rib = (1.0 - real) * step(0.97, fract(vWin.x / mix(3.8, 5.8, vArch.z))) * (1.0 - vTop);
        diffuseColor.rgb *= 1.0 - 0.5 * inWin;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.045, 0.075), max(band, rib) * 0.72);
        diffuseColor.rgb = mix(diffuseColor.rgb, vStat * 0.45, 0.16 * vInfo.x * real);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.07, inWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 civic = mix(vec3(1.0, 0.56, 0.20), vec3(1.0, 0.72, 0.38), step(0.42, vArch.z));
        civic = mix(civic, vec3(0.78, 0.86, 0.48), step(0.78, vArch.z));
        vec3 winc = mix(civic, mix(vec3(1.0, 0.78, 0.42), vec3(0.85, 0.32, 0.20), isLoss), real);
        totalEmissiveRadiance += winc * inWin * lit * uWinGain * mix(0.48, 0.92, hs) * mix(0.35, 1.0, uNight) * mix(0.42, 1.0, real);
        float roof = vTop * 0.45 + (1.0 - vTop) * smoothstep(0.94, 1.0, vRoof);
        totalEmissiveRadiance += vStat * (roof * uRoofGain + 0.1) * vInfo.x * real;
        if (vKind > 1.5) totalEmissiveRadiance += vStat * (0.5 + 0.5 * sin(uTime * 5.0)) * 0.9;`);
  };
  return m;
}

function labelSprite(text, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '800 64px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  while (g.measureText(text.toUpperCase()).width > 480 && Number(g.font.match(/(\d+)px/)[1]) > 20) g.font = `800 ${parseInt(g.font.match(/(\d+)px/)[1]) - 2}px -apple-system, system-ui, sans-serif`;
  g.shadowColor = color; g.shadowBlur = 22; g.fillStyle = color; g.fillText(text.toUpperCase(), 256, 66);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text.toUpperCase(), 256, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
  sp.renderOrder = 5;
  return sp;
}

export function createCity(canvas, { O = null, model, layout, sound = () => false }) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6a5670, 0.0030);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2600);
  let lite = false, dirty = true, qcb = null, pickCb = null, drawn = 0, frames = 0, stopped = false, raf = 0, tier = TIERS.low, last = performance.now() / 1000, t0 = last;
  let hourOverride = null, hour = 21, hourAt = -9, selected = null, mode = 'orbit', flash = 0, nextFlash = 6, L = layout, M0 = model;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', tint: '#d8b25a', exposure: 1.15, maxDpr: 1.75, bloom: { strength: 0.28, radius: 0.25, threshold: 1.35 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; applyTier(); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';
  // the look pass (olympus/look.js, 2026-11-18 cities pass): a night grade in the ONE finish pass (0 draw calls); no depth of field (signs stay sharp)
  let lookFx = null;
  import('../olympus/look.js').then((L) => { lookFx = L.polish(rc, { grade: 'night', mix: 0.32 }); }).catch(() => {});
  const fxl = createCityFx({ scene, camera, rc, O, sound });
  let skySt = { tw: 0, day: 0, sun: [0, 100, 0], hour: 21 }, hl = [];

  // ---- lights, sky
  const hemi = new THREE.HemisphereLight('#ffd8a8', '#4a3a2c', 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#e2b88d', 1.0); scene.add(sun, sun.target);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: C('#2a2a56') }, uMid: { value: C('#6a5688') }, uHor: { value: C('#e0906a') }, uFlash: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop, uMid, uHor; uniform float uFlash; varying vec3 vD; void main() { float h = normalize(vD).y; vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.28, h)); c = mix(c, uTop, smoothstep(0.22, 0.85, h)); c += uFlash * vec3(0.55, 0.6, 0.8); gl_FragColor = vec4(c, 1.0); }' }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  const stars = M.starfield({ count: 1500, radius: 1300, size: 2.3 }); scene.add(stars);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(30, 12, 8), new THREE.MeshBasicMaterial({ color: hdr('#e0b487', 3), fog: false })); orb.frustumCulled = false; scene.add(orb);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), M.metal({ kind: 'gunmetal', color: '#14110e', roughness: 0.42, clearcoat: 0.6, envMapIntensity: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
  const grid = new THREE.GridHelper(2400, 400, 0x6b5a42, 0x6b5a42); grid.material.transparent = true; grid.material.opacity = 0.12; grid.position.y = 0.02; scene.add(grid);

  // ---- the world (rebuilt when the layout changes)
  const world = new THREE.Group(); scene.add(world);
  let labObjs = [], ports = null;
  let bMesh = null, bIndex = new Map(), realN = 0, cars = null, carState = [], orders = 0, roadsMesh = null, lanes = null, linksMesh = null, linkCount = 0, rain = null, embers = null, scaffold = null, skyway = null,
    marker = null, fame = null, leak = null, lighthouse = null, obs = null, vault = null, tower = null, ring1 = null, geoB = null, matB = null, labels = [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

  function disposeWorld() {
    world.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
    world.clear(); ports = null;
    bMesh = cars = roadsMesh = lanes = linksMesh = rain = embers = scaffold = skyway = marker = fame = leak = lighthouse = obs = vault = tower = ring1 = null; linkCount = 0; labels = []; labObjs = [];
  }

  function buildWorld() {
    disposeWorld();
    bIndex = new Map(); carState = [];
    const sc = scenery(L, MAX_SCN), real = L.buildings, total = real.length + sc.length;
    geoB = new THREE.BoxGeometry(1, 1, 1); geoB.translate(0, 0.5, 0);
    const aInfo = new Float32Array(total * 4), aAnim = new Float32Array(total * 4), aStat = new Float32Array(total * 3), aArch = new Float32Array(total * 4);
    geoB.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 4)); geoB.setAttribute('aAnim', new THREE.InstancedBufferAttribute(aAnim, 4)); geoB.setAttribute('aStat', new THREE.InstancedBufferAttribute(aStat, 3)); geoB.setAttribute('aArch', new THREE.InstancedBufferAttribute(aArch, 4));
    matB = matB || buildingMaterial();
    bMesh = new THREE.InstancedMesh(geoB, matB, total); bMesh.frustumCulled = false;
    const r = rng(7), tint = new THREE.Color();
    real.forEach((b, i) => {
      q4.setFromAxisAngle(up, b.yaw); p3.set(b.x, 0, b.z); s3.set(b.w, b.mode ? b.fullH : b.h, b.d); m4.compose(p3, q4, s3); bMesh.setMatrixAt(i, m4);
      const dc = b.lab ? L.labs.find((d) => d.key === b.lab) : L.districts.find((d) => d.key === b.district), dead = b.e.status === 'DEAD';
      tint.set(b.e.small ? '#3a3328' : dead ? '#3d221a' : '#2a241c').lerp(col.set(dc ? dc.color : '#ffffff'), b.e.small ? 0.05 : 0.22);
      bMesh.setColorAt(i, tint);
      const st = b.e.small ? '#8a7f6e' : STATUS_COLOR[b.e.status];
      col.set(st); aStat.set([col.r, col.g, col.b], i * 3);
      aInfo.set([b.glow, b.lit, b.loss, r()], i * 4);
      aAnim.set([b.mode, 1.0 + r() * 1.4, 1, b.from || 0], i * 4);
      aArch.set([0.03 + r() * 0.09, r(), 0, 0], i * 4);
      bIndex.set(b.id, i);
    });
    realN = real.length;
    sc.forEach((s, j) => {
      const i = realN + j;
      q4.setFromAxisAngle(up, s.yaw); p3.set(s.x, 0, s.z); s3.set(s.w, s.h, s.d); m4.compose(p3, q4, s3); bMesh.setMatrixAt(i, m4);
      if (s.kind === 'ward') tint.setHSL(0.075 + s.seed * 0.018, 0.52, 0.04 + s.seed * 0.025);
      else if (s.kind === 'infill') tint.setHSL(0.065 + s.seed * 0.018, 0.36, 0.03 + s.seed * 0.022);
      else tint.setHSL(0.6 + s.seed * 0.06, 0.2, 0.025 + s.seed * 0.035);
      bMesh.setColorAt(i, tint);
      aInfo.set([0, s.lit, 0, s.seed], i * 4);
      const tall = Math.min(1, s.h / 55), taper = s.kind === 'ward' ? 0.06 + s.seed * 0.1 : 0.08 + tall * 0.24;
      const angle = (Math.atan2(s.z, s.x) + Math.PI) / (Math.PI * 2), sector = Math.floor(angle * 8) % 8;
      // Amber owns most of the metropolis. One teal and one green sector echo the HQ
      // without turning the entire skyline into random multi-colour sparkle.
      const palette = sector === 2 ? 0.6 : sector === 5 ? 0.9 : 0.15;
      aArch.set([taper, (s.seed * 1.73) % 1, palette, tall], i * 4);
    });
    bMesh.instanceMatrix.needsUpdate = true; bMesh.instanceColor.needsUpdate = true;
    world.add(bMesh);

    // district pads, outlines and names
    for (const d of L.districts) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(d.half * 2, 0.3, d.half * 2), M.metal({ kind: 'gunmetal', color: col.set(d.color).multiplyScalar(0.07).getStyle(), roughness: 0.3, clearcoat: 1, envMapIntensity: 0.5 }));
      pad.position.set(d.cx, 0.12, d.cz); pad.rotation.y = Math.atan2(-d.ex[1], d.ex[0]);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d.half * 2, 0.32, d.half * 2)), new THREE.LineBasicMaterial({ color: hdr(d.color, 1.5), fog: true }));
      edge.position.copy(pad.position); edge.rotation.copy(pad.rotation);
      world.add(pad, edge);
      const lab = labelSprite(d.key === 'Downtown' ? 'MARKET HQ' : d.name, d.color), lw = Math.max(13, Math.min(34, d.half * 1.5)), top = d.list.reduce((m, e, i) => Math.max(m, (L.buildings.find((b) => b.id === e.id) || { fullH: 0 }).fullH), 0);
      lab.scale.set(lw, lw / 4, 1); lab.position.set(d.cx, Math.max(12, top + 5) + (d.key === 'Downtown' ? 34 : 0), d.cz); lab.userData.district = d.key; world.add(lab); labels.push(lab);
    }

    buildLab();

    // roads and lane lines
    const asphalt = M.metal({ kind: 'gunmetal', color: '#0e1118', roughness: 0.5, clearcoat: 0.3, envMapIntensity: 0.3 });
    roadsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), asphalt, L.roads.length);
    lanes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), L.roads.length);
    L.roads.forEach((rd, i) => {
      const dx = rd.x1 - rd.x0, dz = rd.z1 - rd.z0, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
      q4.setFromAxisAngle(up, yaw); p3.set((rd.x0 + rd.x1) / 2, 0.2, (rd.z0 + rd.z1) / 2); s3.set(len + 0.1, 0.1, rd.w); m4.compose(p3, q4, s3); roadsMesh.setMatrixAt(i, m4);
      p3.y = 0.27; s3.set(len, 0.03, 0.12); m4.compose(p3, q4, s3); lanes.setMatrixAt(i, m4);
      const dc = L.districts.find((d) => d.key === rd.district);
      const wardRoad = rd.kind.startsWith('ward-'), localRoad = rd.kind === 'ward-local';
      lanes.setColorAt(i, col.set(rd.kind === 'labring' ? '#14110e' : localRoad ? '#d5985b' : wardRoad ? '#8a7f6e' : dc ? dc.color : '#9c6b3c').multiplyScalar(rd.kind === 'labring' ? 0.15 : localRoad ? 0.48 : wardRoad ? 0.32 : dc ? 0.75 : 0.4));
    });
    roadsMesh.frustumCulled = false; lanes.frustumCulled = false; world.add(roadsMesh, lanes);
    buildLinks();

    ports = skylinePorts(sc, L.extent); world.add(ports.group);
    buildCars();
    buildLandmarks();
    buildScaffold();
    buildSkyway();
    buildWeatherFx();
    applyTier();
    fxl.rebuild(world, L, M0, bIndex);
    dirty = true;
  }

  // One draw call for bounded, non-trading sightlines: gold edge, red leak, violet research, teal market cities.
  function buildLinks() {
    const pair = pairOf(M0), routes = cityLinks(L, { bestId: pair.best?.id, worstId: pair.worst?.id });
    if (!routes.length) return;
    const pos = [], colors = [];
    for (const route of routes) {
      const c = new THREE.Color(route.color).multiplyScalar(1.0);
      for (let i = 0; i < LINK_SEGMENTS; i++) {
        for (const p of [route.points[i], route.points[i + 1]]) {
          pos.push(p.x, p.y, p.z); colors.push(c.r, c.g, c.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    linksMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    linksMesh.frustumCulled = false; linkCount = routes.length; world.add(linksMesh);
  }

  // ---- the Lab: one pad per research idea. ALL pads are one instanced mesh, ALL outlines one line mesh, ALL names one billboard mesh with a text atlas: 3 draw calls for any number of ideas
  function buildLab() {
    const ls = L.labs || [], n = ls.length;
    if (!n) return;
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), M.metal({ kind: 'gunmetal', color: '#ffffff', roughness: 0.3, clearcoat: 1, envMapIntensity: 0.5 }), n);
    pads.frustumCulled = false;
    const lp = [], lc = [];
    ls.forEach((d, i) => {
      q4.setFromAxisAngle(up, d.yaw); p3.set(d.cx, 0.12, d.cz); s3.set(d.half * 2, 1, d.half * 2); m4.compose(p3, q4, s3); pads.setMatrixAt(i, m4);
      pads.setColorAt(i, col.set(d.color).multiplyScalar(0.07));
      const c = Math.cos(d.yaw), s = Math.sin(d.yaw), h = d.half, hc = hdr(d.color, 1.5);
      const P = (lx, y, lz) => [d.cx + lx * c + lz * s, y, d.cz - lx * s + lz * c];
      const k = [[-h, -h], [h, -h], [h, h], [-h, h]];
      [0.28, -0.02].forEach((y) => { for (let j = 0; j < 4; j++) { const a = k[j], b = k[(j + 1) % 4]; lp.push(...P(a[0], y, a[1]), ...P(b[0], y, b[1])); lc.push(hc.r, hc.g, hc.b, hc.r, hc.g, hc.b); } });
    });
    pads.instanceMatrix.needsUpdate = true; pads.instanceColor.needsUpdate = true;
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const outline = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, fog: true })); outline.frustumCulled = false;
    // the names: a text atlas (one row per idea) drawn by one instanced billboard
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128 * n;
    const g = cv.getContext('2d'); g.font = '800 50px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((d, i) => { g.shadowColor = d.color; g.shadowBlur = 20; g.fillStyle = d.color; g.fillText(d.name, 256, i * 128 + 66); g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(d.name, 256, i * 128 + 66); g.globalAlpha = 1; });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1), slot = new Float32Array(n);
    ls.forEach((d, i) => { slot[i] = i; });
    geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 1));
    const names = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uMap: { value: tex }, uN: { value: n } },
      vertexShader: `attribute float aSlot; uniform float uN; varying vec2 vUv;
        void main() { vUv = vec2(uv.x, 1.0 - (aSlot + 1.0) / uN + uv.y / uN); vec4 c = viewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          c.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz)); gl_Position = projectionMatrix * c; }`,
      fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; void main() { vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb, t.a * 0.95); }' }), n);
    names.frustumCulled = false; names.renderOrder = 5;
    ls.forEach((d, i) => {
      const top = L.buildings.filter((b) => b.lab === d.key).reduce((mx, b) => Math.max(mx, b.fullH), 0);
      p3.set(d.cx, Math.max(10, top + 5), d.cz); q4.identity(); s3.set(24, 6, 1); m4.compose(p3, q4, s3); names.setMatrixAt(i, m4);
    });
    names.instanceMatrix.needsUpdate = true;
    world.add(pads, outline, names); labels.push(names); labObjs = [pads, outline, names];
  }

  // ---- traffic
  function buildCars() {
    const g = new THREE.BoxGeometry(0.7, 0.34, 1.5); g.translate(0, 0.28, 0);
    cars = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), MAX_CARS + MAX_ORDERS);
    cars.frustumCulled = false;
    const ds = L.districts.slice(1), r = rng(11);
    const weight = ds.map((d) => Math.max(1, d.list.reduce((s, e) => s + (e.size === 1 ? e.n : 0), 0)));
    const wsum = weight.reduce((a, b) => a + b, 0) || 1;
    ds.forEach((d, di) => {
      const mk = d.list.find((e) => e.size === 1 && e.dims[1] === d.key), lossRate = mk && mk.w != null ? 1 - mk.w : 0.06;
      const count = Math.max(4, Math.round((MAX_CARS * 0.86) * (weight[di] / wsum)));
      for (let k = 0; k < count; k++) {
        const out = r() < 0.5;
        carState.push({ path: di, s: r(), v: 0.05 + r() * 0.05, lane: out ? 1 : -1, out, c: out ? [0.9, 0.82, 0.62, 1.6] : (r() < lossRate ? [0.79, 0.42, 0.29, 1.8] : [0.78, 0.64, 0.29, 1.6]), order: -1 });
      }
    });
    const nRing = Math.max(8, Math.round(MAX_CARS * 0.12));
    for (let k = 0; k < nRing; k++) carState.push({ path: -1, s: r(), v: 0.012 + r() * 0.01, lane: k % 2 ? 1 : -1, out: true, c: [0.5, 0.54, 0.32, 1.6], order: -1 });
    carState.length = Math.min(carState.length, MAX_CARS);
    setOrders();
  }
  function setOrders() {
    carState = carState.filter((c) => c.order < 0);
    const ds = L.districts.slice(1), pos = M0.book.positions.slice(0, MAX_ORDERS), r = rng(23);
    orders = pos.length;
    pos.forEach((p, k) => {
      const di = ds.findIndex((d) => d.key === p.market);
      carState.unshift({ path: di, s: r() * 0.6, v: 0.045, lane: 1, out: true, c: [1.0, 0.8, 0.35, 2.6], order: k, scale: 1.7 });
    });
    for (let i = 0; i < carState.length; i++) carState[i].i = i;
  }
  function stepCars(dt) {
    const ds = L.districts.slice(1), rr = L.ringRoad, n = Math.min(carState.length, tier.cars + orders);
    cars.count = tier.cars ? n : 0;
    for (let i = 0; i < n; i++) {
      const c = carState[i];
      if (!reduced()) { c.s += dt * c.v * (c.order >= 0 ? 1 : 1); if (c.s > 1) c.s -= 1; }
      let x, z, yaw;
      if (c.path < 0 && c.order < 0) {
        const sg = c.lane > 0 ? 1 : -1, a = c.s * Math.PI * 2 * sg, rad = rr + sg * 0.8;
        x = Math.cos(a) * rad; z = Math.sin(a) * rad; yaw = Math.atan2(-sg * Math.sin(a), sg * Math.cos(a));     // along the tangent
      } else {
        const d = ds[c.path] || ds[0];
        if (!d) continue;
        const u = c.out ? c.s : 1 - c.s, side = c.out ? -1.0 : 1.0, dir = c.out ? 1 : -1;
        x = d.cx * u + d.ex[0] * side; z = d.cz * u + d.ex[1] * side;
        yaw = Math.atan2(d.cx * dir, d.cz * dir);                              // the car's long side is z: face along the avenue
      }
      q4.setFromAxisAngle(up, yaw); p3.set(x, 0.2, z); const k = c.scale || 1; s3.set(k, k, k); m4.compose(p3, q4, s3); cars.setMatrixAt(i, m4);
      const pulse = c.order >= 0 ? 0.75 + 0.25 * Math.sin(performance.now() / 160 + i) : 1;
      cars.setColorAt(i, col.setRGB(c.c[0] * c.c[3] * pulse, c.c[1] * c.c[3] * pulse, c.c[2] * c.c[3] * pulse));
    }
    cars.instanceMatrix.needsUpdate = true; if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  }

  // ---- landmarks: the Exchange, the Vault, the Observatory, the Lighthouse of ruin, the Hall of Fame beam
  /** The harbour for the open bets: a stone quay on the promenade ring, one small ship moored per open position (gold = market's strength, terracotta = a losing market). One merged mesh of ships. */
  function buildHarbour(bk) {
    const R = L.extent + 36, g = new THREE.Group(), pos = (bk.positions || []).slice(0, tier.cars ? MAX_ORDERS : 6);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5), M.metal({ kind: 'gunmetal', color: '#8a7f6e', roughness: 0.6 })); quay.position.set(0, 0.25, -3.5);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(34, 9), new THREE.MeshStandardMaterial({ color: '#3d4a44', roughness: 0.25, metalness: 0.3 })); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.06, 3.5);
    g.add(quay, water);
    const hull = new THREE.BoxGeometry(2.6, 0.7, 1.1).toNonIndexed(), sail = new THREE.ConeGeometry(0.55, 2.4, 4).toNonIndexed(); sail.translate(0, 1.5, 0);
    const parts = [hull, sail], n = parts.reduce((a, q) => a + q.attributes.position.count, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    let o = 0; for (const q of parts) { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    const ships = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), Math.max(1, pos.length));
    const m = new THREE.Matrix4(), c = new THREE.Color();
    pos.forEach((q, i) => {
      const d = L.districts.find((x) => x.key === q.market);
      m.makeTranslation(-15 + (i + 0.5) * (30 / Math.max(6, pos.length)), 0.5, 2.2 + (i % 2) * 2.6); ships.setMatrixAt(i, m);
      ships.setColorAt(i, c.set(d ? d.color : '#c8a24a'));
    });
    ships.count = pos.length; if (ships.instanceColor) ships.instanceColor.needsUpdate = true; ships.instanceMatrix.needsUpdate = true;
    ships.frustumCulled = false; g.add(ships);
    g.position.set(0, 0, R); g.userData.name = 'The Harbour: ' + pos.length + ' open bet' + (pos.length === 1 ? '' : 's');
    world.add(g);
  }
  function buildLandmarks() {
    const bk = M0.book, mint = '#9fae68';
    const g = new THREE.Group();
    const steel = M.metal({ kind: 'chrome', color: '#cfc4b2', roughness: 0.18, envMapIntensity: 1.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 2.2, 20), steel); base.position.y = 1.1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.0, 30, 16), M.glass({ color: '#d9ccb4', rim: mint, rimStrength: 1.6, iridescence: 0.5, opacity: 0.38 })); shaft.position.y = 17;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.9, 11, 12), steel); spire.position.y = 38.5;
    g.add(base, shaft, spire);
    ring1 = new THREE.Group();
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(3.3 - i * 0.2, 0.12, 6, 28), M.neon({ color: mint, intensity: 3 })); t.rotation.x = Math.PI / 2; t.position.y = 8 + i * 7.5; ring1.add(t); }
    g.add(ring1);
    const beam = M.energyBeam({ length: 60, radius: 0.34, color: bk.running === false ? '#8a7f6e' : mint, intensity: bk.running === false ? 0.7 : 1.3 }); beam.position.y = 44; g.add(beam);
    tower = g; tower.userData.beam = beam; g.userData.name = 'The Exchange'; world.add(g);

    vault = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.metal({ kind: 'gold', color: '#d79e65', roughness: 0.16, envMapIntensity: 1.5 }));
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 2.6, 20), M.metal({ kind: 'gold', color: '#d08f4c', roughness: 0.3 })); drum.position.y = 1.3; dome.position.y = 2.6;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.1, 6, 32), M.neon({ color: '#d79e65', intensity: 3 })); halo.rotation.x = Math.PI / 2; halo.position.y = 3.2;
    // the bank vault tower: a marble-and-bronze shaft that grows with the balance (height = dollars, the plaque says how many)
    const balT = Math.max(20, bk.balance || 50), vh = 6 + 16 * Math.min(1, Math.log10(balT / 20) / 2.2);
    const vshaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, vh, 10), M.metal({ kind: 'gold', color: '#b07a45', roughness: 0.4 })); vshaft.position.y = 2.6 + vh / 2;
    dome.position.y = 2.6 + vh; vault.userData.name = 'The Bank Vault';
    vault.add(drum, vshaft, dome, halo);
    const bal = Math.max(20, bk.balance || 50), vs = 0.75 + 0.4 * Math.min(1, Math.log10(bal / 20) / 2);
    vault.scale.setScalar(vs); vault.position.set(11, 0.3, -8); world.add(vault);

    buildHarbour(bk);

    obs = new THREE.Group();
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 7, 18), steel); ob.position.y = 3.5;
    const od = new THREE.Mesh(new THREE.SphereGeometry(2.0, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.glass({ color: '#d9ccb4', rim: '#b9a98c', opacity: 0.5 })); od.position.y = 7;
    const tele = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), M.neon({ color: '#b9a98c', intensity: 2.4 })); tele.position.set(0, 8.1, 0.8); tele.rotation.x = -0.6;
    obs.add(ob, od); obs.userData.tele = tele; obs.add(tele);
    const today = M0.log.some((x) => x.d === M0.day && (x.kind === 'learned' || x.kind === 'changed'));
    if (today) { const b2 = M.energyBeam({ length: 50, radius: 0.2, color: '#b9a98c', intensity: 1.2 }); b2.position.y = 8; obs.add(b2); obs.userData.beam = b2; }
    obs.position.set(-11, 0.3, -9); world.add(obs);

    lighthouse = new THREE.Group();
    const ruin = bk.ruinNow == null ? 0.2 : bk.ruinNow, lc = ruin > 0.5 ? '#ca785c' : ruin > 0.15 ? '#d49759' : '#a0af6a';
    const lt = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 9, 14), M.metal({ kind: 'gunmetal', color: '#3a3228', roughness: 0.4 })); lt.position.y = 4.5;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6), M.neon({ color: lc, intensity: 3.4 })); lamp.position.y = 9.8;
    const lb = M.energyBeam({ length: 26, radius: 0.28, color: lc, intensity: 1.1 }); lb.position.y = 9.8; lb.rotation.z = Math.PI / 2;
    lighthouse.add(lt, lamp); lighthouse.userData.sweep = lb; lighthouse.add(lb);
    lighthouse.position.set(10, 0.3, 11); world.add(lighthouse);

    // the Hall of Fame: a golden beam over the best proven edge
    const pr = pairOf(M0), best = (pr.best && bIndex.has(pr.best.id) ? pr.best.id : null) || M0.lists.doMore[0] || M0.lists.board[0];      // the HUD's Best edge so far
    if (best && bIndex.has(best)) {
      const b = L.buildings[bIndex.get(best)];
      fame = M.energyBeam({ length: 60, radius: 0.26, color: '#dcaa78', intensity: 1.4 }); fame.position.set(b.x, b.fullH + 1, b.z); world.add(fame);
    }
    if (pr.worst && bIndex.has(pr.worst.id)) {                           // a red beam over the Worst leak
      const b = L.buildings[bIndex.get(pr.worst.id)];
      leak = M.energyBeam({ length: 60, radius: 0.26, color: '#ca785c', intensity: 1.4 }); leak.position.set(b.x, b.h + 1, b.z); world.add(leak); labObjs.push(leak);
    }
    // the selection marker
    marker = new THREE.Group();
    const mr = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 32), M.neon({ color: '#ffffff', intensity: 3.2 })); mr.rotation.x = Math.PI / 2; mr.position.y = 0.4;
    const mb = M.energyBeam({ length: 50, radius: 0.18, color: '#ffffff', intensity: 1.3 }); marker.add(mr, mb); marker.userData.ring = mr; marker.userData.beam = mb; marker.visible = false; world.add(marker);
  }

  // ---- scaffolds and cranes over the buildings that are going up
  function buildScaffold() {
    const pts = [];
    const add = (a, b) => { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
    L.buildings.filter((b) => b.mode === 1).slice(0, 24).forEach((b) => {
      const hw = b.w / 2 + 0.2, hd = b.d / 2 + 0.2, h = b.fullH + 1.2, ca = Math.cos(b.yaw), sa = Math.sin(b.yaw);
      const P = (x, y, z) => [b.x + x * ca + z * sa, y, b.z - x * sa + z * ca];
      const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      for (let i = 0; i < 4; i++) { const a = c[i], d = c[(i + 1) % 4]; add(P(a[0], 0, a[1]), P(d[0], 0, d[1])); add(P(a[0], h, a[1]), P(d[0], h, d[1])); add(P(a[0], 0, a[1]), P(a[0], h, a[1])); }
      for (let y = 3; y < h; y += 3) add(P(-hw, y, -hd), P(hw, y, hd));
      add(P(hw, h, hd), P(hw, h + 5, hd)); add(P(hw, h + 5, hd), P(-hw - 2.5, h + 5, -hd)); add(P(-hw - 2.5, h + 5, -hd), P(-hw - 2.5, h + 2, -hd));
    });
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scaffold = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: hdr('#b9a98c', 2.2), fog: true })); scaffold.frustumCulled = false; world.add(scaffold);
  }

  // ---- the equity skyway: a glowing ribbon winding up round Downtown, green where the bankroll rose, red where it fell
  function buildSkyway() {
    const eq = M0.book.equity;
    if (eq.length < 3) return;
    const lo = Math.min(...eq.map((q) => q[1])), hi = Math.max(...eq.map((q) => q[1])), span = Math.max(1e-6, hi - lo), R = L.downHalf + 16, n = eq.length;
    const pts = eq.map((q, i) => { const a = -Math.PI / 2 + (i / (n - 1)) * Math.PI * 1.7; return new THREE.Vector3(Math.cos(a) * R, 38 + 20 * (q[1] - lo) / span, Math.sin(a) * R); });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seg = Math.min(220, n * 3);
    const geo = new THREE.TubeGeometry(curve, seg, 0.32, 5, false), cols = new Float32Array(geo.attributes.position.count * 3), ring = 6;
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const k = Math.min(n - 2, Math.floor((Math.floor(i / ring) / seg) * (n - 1))), rising = eq[k + 1][1] >= eq[k][1];
      col.set(rising ? '#a0af6a' : '#ca785c').multiplyScalar(2.2); cols.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    skyway = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })); skyway.frustumCulled = false; world.add(skyway);
  }

  // ---- weather particles: rain streaks (GPU animated) and embers over what is crumbling
  function buildWeatherFx() {
    const r = rng(5), pos = new Float32Array(MAX_RAIN * 2 * 3), seed = new Float32Array(MAX_RAIN * 2), end = new Float32Array(MAX_RAIN * 2);
    for (let i = 0; i < MAX_RAIN; i++) {
      const x = r() * 140 - 70, y = r() * 80, z = r() * 140 - 70, s = r();
      for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); seed[i * 2 + k] = s; end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uO: { value: new THREE.Vector3() } },
      vertexShader: `uniform float uTime; uniform float uI; uniform vec3 uO; attribute float aSeed; attribute float aEnd; varying float vA;
        void main() { vec3 p = position; p.y = mod(p.y - uTime * (52.0 + aSeed * 26.0), 80.0); p.xz = mod(p.xz - uO.xz + 70.0, 140.0) - 70.0 + uO.xz; p.y -= aEnd * 1.7; p.x += aEnd * 0.3;
          vA = step(aSeed, uI) * (0.18 + 0.5 * aSeed) * (1.0 - aEnd * 0.8); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(0.85, 0.78, 0.65) * vA * 1.4, 1.0); }' }));
    rain.frustumCulled = false; world.add(rain);
    const dying = L.buildings.filter((b) => b.mode === 2).slice(0, 12);
    if (dying.length) {
      const per = 40, n = dying.length * per, ep = new Float32Array(n * 3), es = new Float32Array(n), er = rng(3);
      dying.forEach((b, k) => { for (let j = 0; j < per; j++) { const i = k * per + j; ep.set([b.x + (er() - 0.5) * b.w, 0, b.z + (er() - 0.5) * b.d], i * 3); es[i] = er(); } });
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('aSeed', new THREE.BufferAttribute(es, 1));
      embers = new THREE.Points(eg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime: { value: 0 }, uPix: { value: 1 } },
        vertexShader: `uniform float uTime; uniform float uPix; attribute float aSeed; varying float vA; void main() { vec3 p = position; float t = fract(uTime * (0.1 + aSeed * 0.12) + aSeed * 7.0);
          p.y += t * (9.0 + aSeed * 8.0); p.x += sin(uTime + aSeed * 30.0) * 1.2; vA = (1.0 - t) * 0.9; gl_PointSize = (2.0 + aSeed * 3.0) * uPix; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
        fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.42, 0.18) * vA * smoothstep(0.5, 0.0, d) * 2.5, 1.0); }' }));
      embers.frustumCulled = false; world.add(embers);
    }
  }

  function applyTier() {
    const q = rc.quality();
    tier = TIERS[q] || TIERS.low;
    const bloomy = q === 'ultra' || q === 'high';                       // bloom lifts anything over ~1: keep the windows under it, or the city is one haze
    for (const b of [tower && tower.userData.beam, fame, leak, obs && obs.userData.beam, marker && marker.userData.beam, lighthouse && lighthouse.userData.sweep]) {   // a beam is HDR: on a bloom tier it would smear into blobs
      if (!b) continue;
      const u = b.material.uniforms.uPower; if (b.userData.p0 == null) b.userData.p0 = u.value; u.value = b.userData.p0 * (bloomy ? 0.15 : 1);
    }
    U.uWinGain.value = bloomy ? 1.05 : 1.7; U.uRoofGain.value = bloomy ? 1.0 : 2.4;
    if (bMesh) bMesh.count = realN + tier.scn;
    ports?.setTier(tier.scn);
    if (linksMesh) { linksMesh.geometry.setDrawRange(0, Math.min(linkCount, tier.links) * LINK_SEGMENTS * 2); linksMesh.visible = tier.links > 0; }
    if (rain) rain.geometry.setDrawRange(0, tier.rain * 2);
    if (embers) embers.visible = tier.embers > 0;
    labels.forEach((l) => { l.visible = tier.labels; });
    stars.visible = q !== 'off';
  }

  // ---- time, weather, light
  function weatherOf() { return WEATHER[M0.regime.state] || WEATHER.overcast; }
  function updateSky() {
    // The city opens in the reference night palette even when New York is in daylight.
    // The clock and bot status still report their real values; tapping the clock previews daylight.
    const h = hourOverride != null ? hourOverride : hour, day = hourOverride == null ? 0 : dayFactor(h), W = weatherOf();
    const tw = hourOverride == null ? 0 : sstep(4.8, 6.4, h) * (1 - sstep(6.4, 8.2, h)) + sstep(16.8, 18.4, h) * (1 - sstep(18.4, 20.2, h));
    const u = sky.material.uniforms, grey = W.grey;
    const mix3 = (n, d) => lerpC(n, d, day);
    u.uTop.value.copy(mix3(SKY.nTop, SKY.dTop)).lerp(SKY.grey, grey * 0.5 * (0.2 + day));
    u.uMid.value.copy(mix3(SKY.nMid, SKY.dMid)).lerp(SKY.grey, grey * 0.6 * (0.2 + day));
    u.uHor.value.copy(mix3(SKY.nHor, SKY.dHor)).lerp(SKY.tw, tw * 0.55).lerp(SKY.grey, grey * 0.6 * (0.25 + day));
    scene.fog.color.copy(u.uHor.value).multiplyScalar(0.75);
    const paused = M0.regime.paused ? 1.4 : 1, ext = L.extent;
    scene.fog.density = (0.0016 * 240 / Math.max(240, ext * 1.2)) * W.fog * paused * (1 + 0.4 * day) * (rig.mode === 'map' ? 0.3 : 1);
    hemi.color.copy(lerpC(C('#cbb89a'), C('#e8dcc0'), day)); hemi.intensity = 0.55 + 0.7 * day;
    // the sun by day, the moon by night, on a fixed arc over the city
    const ph = ((h >= 6 && h <= 18) ? (h - 6) / 12 : (((h + 6) % 24) / 12)) * Math.PI, el = Math.sin(ph);
    const dir = new THREE.Vector3(Math.cos(ph) * 0.9, el * 0.8 + 0.1, -0.45).normalize();
    skySt = { tw, day, sun: [dir.x * 300, dir.y * 300, dir.z * 300], hour: h };
    ground.material.roughness = 0.42 - 0.32 * Math.min(1, W.rain); ground.material.clearcoat = 0.6 + 0.4 * Math.min(1, W.rain);   // wet streets shine
    sun.position.copy(dir).multiplyScalar(300); sun.color.copy(day > 0.3 ? C('#e2b88d') : C('#c9b58f')); sun.intensity = (day > 0.2 ? 0.7 + 1.3 * day : 0.45) * (1 - grey * 0.5) * (0.4 + 0.6 * el);
    orb.position.copy(dir).multiplyScalar(1250); orb.material.color.copy(day > 0.3 ? hdr('#e0b487', 3) : hdr('#e8dcc0', 1.7)); orb.scale.setScalar(day > 0.3 ? 1.0 : 0.7); orb.visible = grey < 0.7;
    stars.material.uniforms.uColor.value.setScalar(Math.max(0, 1 - day * 1.6) * (1 - grey * 0.7) * 0.9);
    stars.visible = rc.quality() !== 'off' && day < 0.6;
    U.uNight.value = 1 - 0.85 * day;
  }

  // ---- picking: the building whose base-to-roof line is nearest the tap
  const v3 = new THREE.Vector3();
  function proj(x, y, z) { v3.set(x, y, z).project(camera); return v3.z > 1 ? null : [(v3.x * 0.5 + 0.5) * canvas.clientWidth, (-v3.y * 0.5 + 0.5) * canvas.clientHeight, v3.z]; }
  function where(id) {
    const i = bIndex.get(id); if (i == null) return null;
    const b = L.buildings[i], p = proj(b.x, b.fullH * 0.5 * (b.mode === 2 ? 0.6 : 1) + (b.mode === 1 ? 0 : 0), b.z);
    return p ? { x: p[0], y: p[1] } : null;
  }
  function pick(x, y) {
    camera.updateMatrixWorld(); let best = null, bd = 1e9;
    for (let i = 0; i < L.buildings.length; i++) {
      const b = L.buildings[i], h = b.mode ? b.fullH * (b.mode === 2 ? 0.2 : 1) : b.h;
      const a = proj(b.x, 0.2, b.z), t = proj(b.x, h, b.z);
      if (!a || !t) continue;
      const dx = t[0] - a[0], dy = t[1] - a[1], l2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const d = Math.hypot(x - (a[0] + dx * k), y - (a[1] + dy * k));
      if (d > 26) continue;                                               // a finger is wider than a building
      const score = d + camera.position.distanceTo(p3.set(b.x, h / 2, b.z)) * 0.06;     // the nearer building wins a tie
      if (score < bd) { bd = score; best = b.id; }
    }
    return best;
  }

  function setSel(id) {
    const old = selected;
    if (old != null && bIndex.has(old)) { bMesh.geometry.attributes.aAnim.setZ(bIndex.get(old), 1); }
    selected = id && bIndex.has(id) ? id : null;
    if (selected) {
      const i = bIndex.get(selected), b = L.buildings[i];
      bMesh.geometry.attributes.aAnim.setZ(i, 2);
      const c = b.e.small ? '#8a7f6e' : STATUS_COLOR[b.e.status];
      marker.position.set(b.x, 0, b.z); marker.visible = true; marker.userData.ring.scale.setScalar(Math.max(b.w, b.d) * 1.1 + 0.8);
      marker.userData.ring.material.color.copy(hdr(c, 3.2)); marker.userData.beam.material.uniforms.uColor.value.set(c); marker.userData.beam.position.y = b.fullH * 0.9;
    } else marker.visible = false;
    bMesh.geometry.attributes.aAnim.needsUpdate = true; dirty = true;
  }

  function highlight(ids, secs) {
    const now = performance.now() / 1000;
    for (const id of ids) { const i = bIndex.get(id); if (i == null) continue; bMesh.geometry.attributes.aAnim.setZ(i, 2); hl.push({ id, until: now + secs }); }
    bMesh.geometry.attributes.aAnim.needsUpdate = true; dirty = true;
  }

  // ---- the camera rig
  let modeCb = null;
  const rig = new Rig(camera, canvas, { calm: reduced(), extent: L.extent, onChange: () => { dirty = true; }, onMode: (k) => { mode = k; if (modeCb) modeCb(k); },
    onTap: (x, y) => { const id = pick(x, y); if (pickCb) pickCb(id, x, y); } });

  // ---- the loop
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (window.OLYMPUS && window.OLYMPUS.hidden())) return;                       // hidden / covered: no JS, no frame
    const gap = (window.OLYMPUS && window.OLYMPUS.frameGap ? window.OLYMPUS.frameGap() : 0);                   // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
    if (gap && now / 1000 - last < (gap - 3) / 1000) return;
    const t = now / 1000, dt = Math.min(0.05, Math.max(0, t - last)); last = t;
    const still = reduced();
    if (t - hourAt > 1) { hour = etHour(Date.now()); hourAt = t; if (still) dirty = true; }
    const moved = rig.update(dt);
    if (still && !dirty && !moved) return;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const fov = aspect < 0.6 ? 66 : aspect < 1 ? 58 : 50;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const W = weatherOf();
    U.uTime.value = t - t0; U.uAnimT.value = still ? 1e3 : t - t0 - 1.2;
    const fxStorm = fxl.stats().live.includes('lightning');
    if (!still && M0.regime.state === 'storm' && !fxStorm) {
      nextFlash -= dt; if (nextFlash < 0) { flash = 1; nextFlash = 3 + Math.random() * 7; }
    }
    flash = Math.max(0, flash - dt * 2.5);
    sky.material.uniforms.uFlash.value = flash * 0.5;
    updateSky(); hemi.intensity += flash * 1.2;
    if (rain) { rain.material.uniforms.uTime.value = still ? 0 : t; rain.material.uniforms.uI.value = tier.rain ? W.rain * (still ? 0.6 : 1) : 0; rain.material.uniforms.uO.value.copy(rig.view.target); rain.visible = W.rain > 0 && tier.rain > 0; }
    if (linksMesh) linksMesh.material.opacity = (still || lite ? 0.44 : 0.4 + 0.08 * Math.sin(t * 0.7)) * (0.65 + 0.35 * (1 - skySt.day));
    if (embers) { embers.material.uniforms.uTime.value = still ? 0 : t; embers.material.uniforms.uPix.value = rc.renderer.getPixelRatio(); }
    stars.update(t, rc.renderer.getPixelRatio());
    if (cars) stepCars(still ? 0 : dt);
    if (ring1) ring1.rotation.y = t * 0.3;
    if (obs && obs.userData.tele) obs.userData.tele.rotation.y = still ? 0 : t * 0.7;
    if (lighthouse && lighthouse.userData.sweep) { const sw = lighthouse.userData.sweep; sw.rotation.y = still ? 0 : t * 1.4; }
    for (const b of [tower && tower.userData.beam, fame, leak, obs && obs.userData.beam, marker && marker.userData.beam, lighthouse && lighthouse.userData.sweep]) if (b && b.update) b.update(t);
    if (marker && marker.visible) marker.userData.ring.scale.multiplyScalar(1 + (still ? 0 : Math.sin(t * 4) * 0.0015));
    const ruinHigh = M0.book.ruinNow != null && M0.book.ruinNow >= 0.9;
    fxl.update({ t: t - t0, tier: rc.quality(), reduced: still, tw: skySt.tw, night: 1 - skySt.day, hour: skySt.hour, sun: skySt.sun, weather: M0.regime.state, wet: Math.min(1, W.rain), stormy: M0.regime.state === 'storm' || (ruinHigh && W.rain > 0) });
    for (let i = hl.length - 1; i >= 0; i--) if (t > hl[i].until) { if (hl[i].id !== selected && bIndex.has(hl[i].id)) { bMesh.geometry.attributes.aAnim.setZ(bIndex.get(hl[i].id), 1); bMesh.geometry.attributes.aAnim.needsUpdate = true; } hl.splice(i, 1); }
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  raf = requestAnimationFrame(frame);

  buildWorld();

  return {
    setBook(m) { M0 = m; setOrders(); dirty = true; },
    rebuild(m, lay) { M0 = m; L = lay; rig.opts.extent = L.extent; rig.limits.radius[1] = L.extent * 3.4; selected = null; buildWorld(); },
    setHour(h) { hourOverride = h == null ? null : ((h % 24) + 24) % 24; dirty = true; },
    hour: () => (hourOverride != null ? hourOverride : hour), live: () => hourOverride == null,
    select: setSel, selected: () => selected, setMode(k) { rig.setMode(k, L); }, mode: () => rig.mode, onMode(cb) { modeCb = typeof cb === 'function' ? cb : null; },
    focus(id) { const i = bIndex.get(id); if (i == null) return; const b = L.buildings[i]; rig.focus(b.x, Math.min(b.fullH, 30) * 0.5, b.z, 34 + b.fullH * 0.9, 0.95); },
    focusDistrict(key) { const d = L.districts.find((item) => item.key === key); if (!d) return false; setSel(null); const f = districtCamera(d); rig.focus(f.x, f.y, f.z, f.radius, f.phi); return true; },
    fireworks: (ids) => fxl.fireworks(ids), scan: (ids) => { const ok = fxl.scan(ids, { highlight }); dirty = true; return ok; }, strike: () => fxl.strike(), fxStats: () => fxl.stats(),
    labVisible(on) { labObjs.forEach((o) => { if (o) o.visible = !!on; }); dirty = true; },       // the budget breakdown: the Lab's own draws (pads, outlines, names, the leak beam)
    pick, where, onPick(cb) { pickCb = typeof cb === 'function' ? cb : null; }, onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; },
    lite: () => lite, quality: () => rc.quality(), render: () => { dirty = true; },
    stats: () => ({ frames, drawn, quality: rc.quality(), passes: rc.passes().length, real: realN, edges: L.edgeCount, lab: (L.labs || []).length, scenery: bMesh ? bMesh.count - realN : 0, cars: cars ? cars.count : 0, orders, buildingsTotal: bMesh ? bMesh.count : 0,
      rain: rain ? rain.visible : false, weather: M0.regime.state, paused: M0.regime.paused, hour: hourOverride != null ? hourOverride : hour, mode: rig.mode, selected, roads: L.roads.length, links: linksMesh?.visible ? Math.min(linkCount, tier.links) : 0, districts: L.districts.length, wards: (L.neighborhoods || []).length,
      fx: fxl.stats(), resizing: L.buildings.filter((b) => b.mode === 3).length, constructing: L.buildings.filter((b) => b.mode === 1).length, crumbling: L.buildings.filter((b) => b.mode === 2).length, draw: rc.stats ? rc.stats() : null }),
    dispose() { stopped = true; cancelAnimationFrame(raf); fxl.dispose(); if (lookFx) lookFx.dispose(); disposeWorld(); rc.dispose(); },
  };
}

