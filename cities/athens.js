// ATHENS scene: the giant Greek metropolis in three.js. One WebGL renderer, no post passes, no shadow maps.
// Draw calls on a phone: terrain 1, sky 1, sea 1, river 1, stone batch 1, metal batch 1, house chunks <= 16 (frustum culled, near / far LOD),
// trees 2, ships 1, stalls inside the stone batch, lamps 1, windows 1, beacon 2, selection 2: about 35 at most, usually fewer than 25.
// Scenery only: it draws no trade, no money value and places no order.
import * as THREE from '../jarvis/three.module.min.js';
import { planAthens, groundY, COAST, RIVER, RIVER_W, WALL, insideWall, ACROPOLIS, isSea, LOT, WORLD } from './athens-plan.js';
import { buildStatic } from './athens-build.js';
import { Batch, PAL, unit } from './athens-geo.js';
import { envKit } from '../olympus/env-kit.js';
import { rng, hash32 } from './util.js';
import { Interior } from './athens-interior.js';
import { renderList, makeCollider, makeNpcs, npcAt, walkStep, HOUSE_TINT, EYE, TIER_NPC } from './athens-world.js';
import { makeCrowd } from './people-fig.js';
import { makeTownCast } from './town-cast.js';
import { lookOf } from './people-talk.js';

export const TIERS = { // house cap, trees, lamps, windows
  low: { houses: 520, trees: 150, lamps: 120, windows: 100, dpr: 1.25, ships: false, fps: 30 },
  high: { houses: 1100, trees: 420, lamps: 360, windows: 260, dpr: 2, ships: true, fps: 60 },
  ultra: { houses: 1800, trees: 520, lamps: 420, windows: 400, dpr: 2, ships: true, fps: 60 },
};
// Colour temperatures, 3500 K by day and 2700 K at dusk (both warm, never blue-white).
const KELVIN = { 3500: [1, .769, .537], 3000: [1, .706, .42], 2700: [1, .663, .341] };
const lerp = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const SKY = { // zenith, mid, horizon
  day: ['#6f9bb8', '#cdbf9a', '#f3dba8'], dusk: ['#3a3452', '#9a5b62', '#f0a366'],
};

function terrain(tier) {
  const edges = []; for (let x = WORLD.x0; x < WORLD.x1;) { edges.push(x); const ax = Math.abs(x); x += ax < 640 ? (tier === 'low' ? 24 : 16) : ax < 820 ? (tier === 'low' ? 80 : 40) : 130; } edges.push(WORLD.x1);
  const nx = edges.length, pos = new Float32Array(nx * nx * 3), col = new Float32Array(nx * nx * 3), idx = [];
  const C = (h) => new THREE.Color(h);
  const paved = C('#b6a687'), dust = C('#a49c6a'), olive = C('#8d9158'), rock = C('#b3a283'), top = C('#dccda9'), sand = C('#d9c796'), sea = C('#7a9892'), farRock = C('#8a7c68'), hill = C('#bfae85');
  const tmp = new THREE.Color(), r = rng(hash32('terrain'));
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
    const x = edges[i], z = edges[j], y = groundY(x, z), k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    const n = .94 + .12 * r(), rr = Math.hypot(x, z);
    if (y < -.6) tmp.copy(sea);
    else if (y < .2 && z > COAST(x) - 30) tmp.copy(sand);
    else if (Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) < ACROPOLIS.base + 4) tmp.copy(y > 44 ? top : y > 8 ? hill : rock).lerp(rock, Math.max(0, 1 - y / 40) * .25);
    else if (insideWall(x, z, 1.0)) tmp.copy(paved);
    else if (y > 30) tmp.copy(farRock).lerp(rock, Math.max(0, 1 - y / 150));
    else tmp.copy(dust).lerp(olive, .5 + .5 * Math.sin(x * .02 + z * .013));
    if (rr > 900) tmp.lerp(farRock, Math.min(1, (rr - 900) / 400));
    col[k] = tmp.r * n; col[k + 1] = tmp.g * n; col[k + 2] = tmp.b * n;
  }
  for (let j = 0; j < nx - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, c = d + 1; idx.push(a, d, b, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  // soften the lighting of slopes: lean every normal toward the sky so a hill facing away from the sun is warm limestone, never black
  const nr = g.attributes.normal.array; for (let i = 0; i < nr.length; i += 3) { const x = nr[i] * .45, y = nr[i + 1] * .45 + .55, z = nr[i + 2] * .45, l = Math.hypot(x, y, z) || 1; nr[i] = x / l; nr[i + 1] = y / l; nr[i + 2] = z / l; }
  return g;
}

const WATER_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const WATER_FS = `uniform float uTime; uniform vec3 uDeep, uShallow, uSun, uSky, uFog; uniform vec3 uSunDir; uniform float uFogD, uMove, uShimmer;
varying vec3 vW;
void main(){
  float t = uTime*uMove;
  vec3 n = normalize(vec3(sin(vW.x*.09+t*1.1)*.06+sin(vW.z*.15-t*1.4)*.05+sin((vW.x+vW.z)*.31+t*2.)*.02, 1., cos(vW.z*.11+t)*.05+sin(vW.x*.2-t*1.7)*.03));
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1. - clamp(dot(v, n), 0., 1.), 3.);
  vec3 h = normalize(uSunDir + v); float spec = pow(max(dot(n, h), 0.), 90.);
  vec3 c = mix(uDeep, uShallow, .5 + .5*sin(vW.x*.013 + vW.z*.017)) ;
  c = mix(c, uSky, clamp(fres*.8, 0., .85)) + uSun*spec*.8;
  c += uSun*pow(max(0., sin(vW.x*.7+t*3.)*sin(vW.z*.9-t*2.4)), 24.)*uShimmer*.7;
  float d = length(cameraPosition - vW); float f = 1. - exp(-d*d*uFogD*uFogD*3.);
  gl_FragColor = vec4(mix(c, uFog, clamp(f,0.,1.)), .93);
  #include <colorspace_fragment>
}`;
const SKY_VS = `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `uniform vec3 uTop, uMid, uHor, uSun, uSunDir; varying vec3 vD;
void main(){
  float h = clamp(vD.y, -.1, 1.);
  vec3 c = mix(uHor, uMid, smoothstep(0., .22, h)); c = mix(c, uTop, smoothstep(.15, .85, h));
  float s = max(dot(normalize(vD), uSunDir), 0.);
  c += uSun*(pow(s, 600.)*1.3 + pow(s, 14.)*.28);
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`;

export class Athens {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.tierName = opts.tier || 'high'; this.T = TIERS[this.tierName] || TIERS.high;
    this.reduced = !!opts.reduced; this.ambient = this.tierName !== 'low' && !this.reduced; this.time = opts.dusk ? 1 : 0; this.target = this.time;
    this.plan = planAthens();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.tierName !== 'low', powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 1.5, 4200);
    this.u = { uTime: { value: 0 } };
    this.hemi = new THREE.HemisphereLight('#cfe0ea', '#8a7658', 1.0); this.sun = new THREE.DirectionalLight('#ffc489', 2.4);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.FogExp2('#e8d2a4', .0004);
    this.cam = { tx: -20, ty: 8, tz: 40, yaw: 2.55, pitch: .5, dist: 980 };
    this.mode = this.reduced ? 'day' : 'auto'; this.autoT0 = performance.now(); this.live = null; this.shipAnch = [];
    this.fly = null; this.tour = null; this.anchors = []; this.sel = null; this.frameCount = 0; this.calls = 0;
    this.ek = envKit({ renderer: this.renderer, scene: this.scene, tier: this.tierName });      // the scans (olympus/env-kit.js): stone, plaster, roof tiles, ground
    this.build();
    this.applyTime(); this.placeCamera();
    // FX HOOK (olympus/fx-cine.js, optional; 2026-11-11 effects pass): gulls over the harbour and the bay, one draw, no post pass (this
    // scene keeps its own day / dusk cycle and draws straight to the screen). Athens is the same without it.
    this.cine = null;
    import('../olympus/fx-cine.js').then((C) => { if (this.dead) return;
      this.cine = C.cinema({ scene: this.scene, camera: this.camera, renderer: this.renderer, tier: this.tierName }, { sun: false, bursts: false, reduced: this.reduced,
        birds: { center: [0, 0, 260], radius: 260, height: 110, size: 3.2, count: 16 } });
    }).catch(() => { /* optional */ });
  }

  build() {
    const plan = this.plan, T = this.T, scene = this.scene;
    this.dispose_ = [];
    const own = (o) => { this.dispose_.push(o); return o; };
    // sky
    this.skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, .5, -.8) } };
    const sky = new THREE.Mesh(own(new THREE.SphereGeometry(3000, 24, 12)), own(new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false })));
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky); this.sky = sky;
    // terrain
    const tm = this.ek.mat('ground', { lambert: true, vertexColors: true, color: '#ffffff', scale: 0.09 }); const ter = new THREE.Mesh(own(terrain(this.tierName)), tm); scene.add(ter);
    // water: the sea and the river share one material
    this.wU = { uTime: this.u.uTime, uDeep: { value: new THREE.Color('#2f5f78') }, uShallow: { value: new THREE.Color('#5c97a2') }, uSun: { value: new THREE.Color('#ffd9a0') }, uSky: { value: new THREE.Color('#d8c9a5') }, uFog: { value: new THREE.Color('#e8d2a4') }, uSunDir: { value: new THREE.Vector3(0, .5, -.8) }, uFogD: { value: .0004 }, uMove: { value: this.reduced ? 0 : 1 }, uShimmer: { value: this.ambient ? 1 : 0 } };
    const wm = own(new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: this.wU, transparent: true }));
    const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(7000, 2600).rotateX(-Math.PI / 2)), wm); sea.position.set(0, -.25, 1490); scene.add(sea);
    const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), N = 90, rp = [], ri = [];
    for (let i = 0; i <= N; i++) { const p = curve.getPoint(i / N), t = curve.getTangent(i / N), nx = -t.z, nz = t.x, l = Math.hypot(nx, nz) || 1; const w = RIVER_W * .5 * (.85 + .3 * (i / N)); rp.push(p.x + nx / l * w, -.55, p.z + nz / l * w, p.x - nx / l * w, -.55, p.z - nz / l * w); if (i < N) { const a = i * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const rg = own(new THREE.BufferGeometry()); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); scene.add(new THREE.Mesh(rg, wm));
    // monuments in two draws
    const built = buildStatic(plan, this.tierName === 'low'); this.tris = built.tris;
    const sm = this.ek.mat('marble', { lambert: true, vertexColors: true, color: '#ffffff', side: THREE.DoubleSide, dual: 'roof', scale: 0.32, scale2: 0.5 });       // scans: stone + roof tiles (env-kit)
    const mm = own(this.tierName === 'low' ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }) : new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: new THREE.Color('#f0d9a0'), side: THREE.DoubleSide }));
    scene.add(new THREE.Mesh(own(built.stone), sm), new THREE.Mesh(own(built.metal), mm));
    this.houses(own, sm);
    this.trees(own, sm);
    this.shipsInit(own, sm);
    this.lights(own);
    this.lifeInit(own);
    // anchors: every app temple and every monument can be tapped
    for (const a of plan.apps) this.anchors.push({ kind: 'app', id: a.id, appId: a.id, name: a.name, group: a.group, x: a.x, y: a.top || 12, z: a.z, colour: a.colour, blurb: a.blurb });
    for (const l of plan.landmarks) this.anchors.push({ kind: 'landmark', id: l.id, appId: l.app || null, name: l.name, group: l.group, x: l.x, y: l.top || 14, z: l.z, blurb: l.blurb, major: true });
    // selection ring + beam
    const rm = new THREE.MeshBasicMaterial({ color: '#e8bb55', transparent: true, opacity: .9, depthWrite: false, fog: false }), bm = new THREE.MeshBasicMaterial({ color: '#e8bb55', transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.ring = new THREE.Mesh(own(new THREE.TorusGeometry(1, .04, 6, 40).rotateX(Math.PI / 2)), rm); this.beam = new THREE.Mesh(own(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, .5, 0)), bm);
    this.ring.visible = this.beam.visible = false; this.ring.frustumCulled = this.beam.frustumCulled = false; scene.add(this.ring, this.beam); own(rm); own(bm);
  }

  houses(own = (o) => { this.dispose_.push(o); return o; }, sm) {
    const cap = this.T.houses, rows = this.houseRows || this.plan.houses.slice(0, cap), size = 280, chunks = new Map(), tones = [[1, 1, 1], [.96, .9, .8], [.98, .86, .68], [.96, .8, .72], [.88, .93, .97], [1, .94, .82]];
    const tint = { trading: [1.02, .98, .86], research: [.94, .98, 1.04], money: [1.04, .94, .84], life: [.98, 1.02, .88] };
    for (const h of rows) { const key = `${Math.floor(h.x / size)}:${Math.floor(h.z / size)}`; (chunks.get(key) || chunks.set(key, []).get(key)).push(h); }
    if (this.chunks) for (const c of this.chunks) { this.scene.remove(c.a, c.b); c.a.dispose(); c.b.dispose(); }
    const near = unit.house(), far = unit.houseFar(), mat = this.ek.mat('plaster', { lambert: true, vertexColors: true, color: '#ffffff', dual: 'roof', scale: 0.3, scale2: 0.55 }), farMat = mat;
    const d = new THREE.Object3D(), color = new THREE.Color(); this.chunks = [];
    for (const [, list] of chunks) {
      const mk = (geo) => { const m = new THREE.InstancedMesh(geo, mat, list.length); m.frustumCulled = true; return m; };
      const a = mk(near), b = mk(far); let cx = 0, cz = 0;
      list.forEach((h, i) => {
        d.position.set(h.x, h.y, h.z); d.rotation.set(0, h.tone > .5 ? 0 : Math.PI / 2, 0); const hs = h.hall ? 1.35 : 1; d.scale.set(h.w * hs, h.h, h.d * hs); d.updateMatrix(); a.setMatrixAt(i, d.matrix); b.setMatrixAt(i, d.matrix);
        const t = tones[Math.floor(h.tone * 6) % 6], g = tint[h.dist] || [1, 1, 1]; if (h.tintKey) { const k = h.hall ? [1.1, .92, .5] : HOUSE_TINT[h.tintKey]; color.setRGB(t[0] * .35 + k[0] * .65, t[1] * .35 + k[1] * .65, t[2] * .35 + k[2] * .65); } else color.setRGB(t[0] * g[0], t[1] * g[1], t[2] * g[2]); a.setColorAt(i, color); b.setColorAt(i, color); cx += h.x; cz += h.z;
      });
      for (const m of [a, b]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
      b.visible = false; this.scene.add(a, b); this.chunks.push({ a, b, cx: cx / list.length, cz: cz / list.length });
    }
    void sm; void farMat; this.houseCount = rows.length; this.houseItems = rows.filter((h) => h.village >= 0);
  }

  trees(own, sm) {
    const B = new Batch(), O = new Batch();
    B.put(unit.cyl(5, .7), 0, 0, 0, .35, 2.2, .35, PAL.timber); B.put(unit.ico(), 0, 1.7, 0, 2.6, 2.6, 2.6, PAL.olive, 0, 0, 0, .3);
    O.put(unit.cyl(4, .6), 0, 0, 0, .3, 1.2, .3, PAL.timber); O.put(unit.cone(6), 0, .8, 0, 1.4, 9, 1.4, PAL.cypress, 0, 0, 0, .35);
    const list = this.plan.trees.slice(0, this.T.trees), oliveL = list.filter((t) => !t.cypress), cyp = list.filter((t) => t.cypress), d = new THREE.Object3D();
    const mat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
    for (const [batch, arr] of [[B, oliveL], [O, cyp]]) {
      if (!arr.length) continue;
      const m = new THREE.InstancedMesh(own(batch.geometry()), mat, arr.length); m.frustumCulled = false;
      arr.forEach((t, i) => { d.position.set(t.x, t.y, t.z); d.rotation.set(0, i * 2.4, 0); d.scale.setScalar(t.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }); m.instanceMatrix.needsUpdate = true; this.scene.add(m);
    }
    void sm;
  }

  shipsInit(own) {
    const S = new Batch();
    S.box(0, 0, 0, 3.2, 1.7, 12, PAL.timber); S.put(unit.cone(5), 0, .6, 6, 1.6, 4, 1.1, PAL.timber, 0, Math.PI / 2); S.box(0, 1.3, -6.4, 2.6, 2.4, 1.1, PAL.timberD || PAL.timber);
    S.box(0, 1.7, 0, 2.6, .35, 10.5, PAL.sand); S.cyl(0, 1.7, 1.5, .18, 9.4, PAL.bronzeD, 5); S.box(0, 6.8, 1.5, 6.2, .22, .22, PAL.timber);
    S.box(0, 3.1, 1.5, 5.6, 3.8, .14, '#efe5cf'); S.box(0, 4.6, 1.56, 5.6, .5, .14, PAL.terra);
    for (let i = 0; i < 5; i++) for (const e of [-1, 1]) S.put(unit.box(), e * 1.9, .7, -3.6 + i * 1.8, .14, .14, 3, PAL.timber, 0, 0, e * .5);
    S.cone(0, 1.7, 7.7, .4, 1.2, PAL.gold, 5);
    this.shipGeo = own(S.geometry()); const n = this.plan.ships.length;
    this.shipMesh = new THREE.InstancedMesh(this.shipGeo, own(new THREE.MeshLambertMaterial({ vertexColors: true })), n); this.shipMesh.frustumCulled = false; this.scene.add(this.shipMesh);
    this.shipD = new THREE.Object3D(); this.shipTint = new THREE.Color(); this.tintShips(); this.shipsTick(0);
  }
  shipsTick(t) {
    const move = this.T.ships && !this.reduced; this.plan.ships.forEach((s, i) => {
      const d = this.shipD; let x = s.x, z = s.z, yaw = Math.PI * .5 + Math.sin(s.ph) * .3;
      if (s.acct) { x = s.ax; z = s.az; }
      if (move && s.speed) { const a = t * .03 + s.ph; x = 40 + Math.cos(a) * 190; z = 420 + Math.sin(a) * 52 + 40; yaw = Math.atan2(-Math.sin(a) * 190, Math.cos(a) * 52) ; }
      else if (move) { yaw += Math.sin(t * .4 + s.ph) * .05; z += Math.sin(t * .6 + s.ph) * .35; }
      if (s.acct && this.shipAnch[i]) { this.shipAnch[i].x = x; this.shipAnch[i].z = z; }
      d.position.set(x, -.2 + (move ? Math.sin(t * 1.3 + s.ph) * .18 : 0), z); d.rotation.set(0, yaw, move ? Math.sin(t * .9 + s.ph) * .04 : 0); d.scale.setScalar(s.scale); d.updateMatrix(); this.shipMesh.setMatrixAt(i, d.matrix);
    }); this.shipMesh.instanceMatrix.needsUpdate = true;
  }

  lights(own) {
    const r = rng(hash32('athens:lamps')), lp = [], wp = [], plan = this.plan;
    for (let i = -17; i <= 17; i++) for (let j = -14; j <= 10; j++) {
      const x = i * LOT, z = j * LOT;
      if (!(i % 5 === 0 && j % 5 === 0) && !(i % 5 === 0 && j % 2 === 0) && !(j % 5 === 0 && i % 2 === 0)) continue;
      if (!insideWall(x, z, .94) || isSea(x, z + 20) || Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) < ACROPOLIS.base) continue;
      lp.push(x + 8, 3.4, z + 8);
    }
    for (const a of plan.apps) lp.push(a.x - 8.6, 3, a.z + 9.4, a.x + 8.6, 3, a.z + 9.4);
    for (const h of plan.houses.slice(0, this.T.houses)) if (r() < .34) wp.push(h.x + (r() - .5) * h.w * .6, h.y + 1.8, h.z + h.d / 2 + .25);
    const c = document.createElement('canvas'); c.width = c.height = 64; const cx = c.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = this.tex = own(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const pt = (arr, cap, size, op) => {
      const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr.slice(0, cap * 3), 3));
      const m = own(new THREE.PointsMaterial({ map: tex, color: '#ffb35c', size, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.max = op; this.scene.add(p); return p;
    };
    this.lamps = pt(lp, this.T.lamps, 4.5, .95); this.windows = pt(wp, this.T.windows, 2.4, .9);
    // the lighthouse beacon: a warm glow and a slow turning beam, visible at dusk
    const L = plan.landmarks.find((l) => l.id === 'lighthouse'), b = L.beacon || [L.x, 55, L.z];
    const bm = own(new THREE.MeshBasicMaterial({ color: '#ffc46a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beacon = new THREE.Mesh(own(new THREE.ConeGeometry(16, 150, 14, 1, true).rotateZ(Math.PI / 2).translate(75, 0, 0)), bm); this.beacon.position.set(...b); this.beacon.frustumCulled = false; this.beacon.userData.max = .22; this.scene.add(this.beacon);
    const gm = own(new THREE.PointsMaterial({ map: tex, color: '#ffd27a', size: 30, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const gg = own(new THREE.BufferGeometry()); gg.setAttribute('position', new THREE.Float32BufferAttribute(b, 3)); this.glow = new THREE.Points(gg, gm); this.glow.userData.max = .8; this.scene.add(this.glow);
  }


  // ------------------------------------------------------------------ ambient life: a few birds, smoke over the market (off in LITE and with reduced motion)
  lifeInit(own) {
    if (!this.ambient) return;
    const P = [0, 0, .5, -1.4, .35, -.35, 0, 0, -.35, 0, 0, .5, 1.4, .35, -.35, 0, 0, -.35], g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    this.birds = new THREE.InstancedMesh(g, own(new THREE.MeshBasicMaterial({ color: '#3a2e22', side: THREE.DoubleSide, fog: false })), 14); this.birds.frustumCulled = false; this.scene.add(this.birds);
    this.birdD = new THREE.Object3D();
    const N = 24, sg = own(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.smoke = new THREE.Points(sg, own(new THREE.PointsMaterial({ map: this.tex, color: '#d9cfbf', size: 9, sizeAttenuation: true, transparent: true, opacity: .32, depthWrite: false, fog: true })));
    this.smoke.frustumCulled = false; this.scene.add(this.smoke); this.smokeSrc = [[-2, 150], [38, 188], [64, 216], [-20, 120]];
  }
  lifeTick(t) {
    if (!this.birds) return; const d = this.birdD;
    for (let i = 0; i < 14; i++) {
      const a = t * (.09 + (i % 3) * .015) + i * .9, r = 90 + i * 9, cx = i % 2 ? 60 : -150, cz = i % 2 ? -40 : -200;
      d.position.set(cx + Math.cos(a) * r, 52 + (i % 4) * 7 + Math.sin(t + i) * 2, cz + Math.sin(a) * r); d.rotation.set(0, -a, 0); d.scale.set(1.4, .55 + .45 * Math.sin(t * 9 + i * 2), 1.4); d.updateMatrix(); this.birds.setMatrixAt(i, d.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    const p = this.smoke.geometry.attributes.position, A = p.array;
    for (let i = 0; i < 24; i++) { const s = this.smokeSrc[i % 4], u = ((t * .08 + i * .137) % 1); A[i * 3] = s[0] + Math.sin(u * 5 + i) * 2 + u * 9; A[i * 3 + 1] = 7 + u * 26; A[i * 3 + 2] = s[1] + Math.cos(u * 4 + i) * 1.5; }
    p.needsUpdate = true;
  }

  // ------------------------------------------------------------------ temple interior (not in LITE) and pictures
  enterInterior(a) {
    if (this.tierName === 'low' || this.interior) return false;
    try { const it = new Interior(this.renderer, { reduced: this.reduced }); it.build(a, a.need); it.resize(this.w || 390, this.h || 844); this.interior = it; return true; } catch (e) { this.interior = null; return false; }
  }
  leaveInterior() { if (!this.interior) return; this.interior.dispose(); this.interior = null; }
  renderCurrent() { const I = this.interior; this.renderer.render(I ? I.scene : this.scene, I ? I.camera : this.camera); }
  /** a copy of the current view with a small 'OLYMPUS · Athens' mark; rendered and copied in the same task, so the drawing buffer never has to be kept */
  snapshot() {
    this.renderCurrent(); const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height; const x = c.getContext('2d'); x.drawImage(this.canvas, 0, 0);
    const f = Math.max(14, Math.round(c.width * .034)); x.font = `600 ${f}px "Iowan Old Style","Palatino Linotype",Georgia,serif`; x.textAlign = 'right'; x.textBaseline = 'bottom';
    x.shadowColor = 'rgba(20,17,14,.7)'; x.shadowBlur = f * .3; x.fillStyle = 'rgba(243,236,224,.92)'; x.fillText('OLYMPUS \u00b7 Athens', c.width - f * .7, c.height - f * .6);
    return c;
  }

  // ------------------------------------------------------------------ the owner's data (read only): glowing temples, the P&L pillar, account ships
  tintShips() {
    this.plan.ships.forEach((s, i) => {
      const c = this.shipTint; if (s.acct) { if (s.acct.open) c.setRGB(1.45, 1.1, .62); else c.setRGB(1, .96, .9); } else c.setRGB(.8, .78, .74);
      this.shipMesh.setColorAt(i, c);
    });
    this.shipMesh.instanceColor.needsUpdate = true;
  }
  setLive(live) {
    this.live = live; const scene = this.scene, tex = this.tex;
    // temples that need the owner glow warm gold (a soft sprite and a thin column of light); calm temples stay as they are
    for (const a of this.anchors) if (a.kind === 'app') a.need = live.needs[a.id] || null;
    const glow = this.anchors.filter((a) => a.need);
    if (this.needPts) { scene.remove(this.needPts); this.needPts.geometry.dispose(); this.needPts.material.dispose(); }
    if (this.needBeams) { scene.remove(this.needBeams); this.needBeams.geometry.dispose(); this.needBeams.material.dispose(); }
    this.needPts = this.needBeams = null;
    if (glow.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(glow.flatMap((a) => [a.x, a.y + 4, a.z]), 3));
      this.needPts = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, color: '#ffd27a', size: 30, sizeAttenuation: true, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.needPts.frustumCulled = false; scene.add(this.needPts);
      const bg = new THREE.CylinderGeometry(.6, 1.5, 30, 8, 1, true).translate(0, 15, 0), bm = new THREE.MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      this.needBeams = new THREE.InstancedMesh(bg, bm, glow.length); const d = new THREE.Object3D();
      glow.forEach((a, i) => { d.position.set(a.x, groundY(a.x, a.z) + 6, a.z); d.updateMatrix(); this.needBeams.setMatrixAt(i, d.matrix); this.needBeams.instanceMatrix.needsUpdate = true; });
      this.needBeams.frustumCulled = false; scene.add(this.needBeams);
    }
    // the pillar of today on the Agora: its height is today's result in R, its colour says gain or loss
    const R = live.pnl.r, h = 3.5 + 15 * Math.min(1, Math.abs(R) / 2), col = live.pnl.usd > 0 ? '#8fa65c' : live.pnl.usd < 0 ? '#c9654a' : '#b0793f';
    if (!this.pillar) {
      this.pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3).translate(0, .5, 0), new THREE.MeshLambertMaterial({ color: col })); this.dispose_.push(this.pillar.geometry, this.pillar.material);
      this.pillar.position.set(30, groundY(30, -37) + .4, -37); scene.add(this.pillar);
      const base = new THREE.Mesh(new THREE.BoxGeometry(5, .8, 5).translate(0, .4, 0), new THREE.MeshLambertMaterial({ color: '#d2c6ae' })); base.position.set(30, groundY(30, -37), -37); scene.add(base); this.dispose_.push(base.geometry, base.material);
      this.pillarAnchor = { kind: 'pillar', id: 'pnl', name: "Today's pillar", group: 'trading', x: 30, y: 12, z: -37, major: true, appId: 'hestia', blurb: '' };
      this.anchors.push(this.pillarAnchor);
    }
    this.pillar.scale.y = h; this.pillar.material.color.set(col); this.pillarAnchor.y = h + 2;
    const usd = (v) => (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(live.pnl.usd).toLocaleString('en-US'); void usd;
    this.pillarAnchor.blurb = `Today ${live.pnl.usd < 0 ? '-' : live.pnl.usd > 0 ? '+' : ''}$${Math.abs(live.pnl.usd).toLocaleString('en-US')} = ${R > 0 ? '+' : ''}${R} R${live.pnl.est ? ' (R is an estimate)' : ''}. The taller the pillar, the bigger the day.${live.demo ? ' Example numbers: no home.json yet.' : ''}`;
    // ships: one per account. A ship under way = an open position; a resting ship = flat. Other ships are scenery.
    this.shipAnch.forEach((a) => { if (a) this.anchors.splice(this.anchors.indexOf(a), 1); }); this.shipAnch = [];
    this.plan.ships.forEach((sh) => { sh.acct = null; });
    live.accounts.slice(0, 3).forEach((acct, i) => {
      const sh = this.plan.ships[i]; sh.acct = acct; sh.speed = acct.open ? 1 : 0; sh.scale = 1.5; sh.ax = -70 + i * 58; sh.az = 392;
      const room = acct.room != null && acct.mll ? ` Drawdown room $${Math.round(acct.room).toLocaleString('en-US')} of $${Math.round(acct.mll).toLocaleString('en-US')}.` : '';
      const an = { kind: 'ship', id: 'ship-' + i, name: acct.name, group: 'money', x: sh.ax, y: 12, z: sh.az, major: true, appId: 'hestia',
        blurb: `${acct.open ? 'A position is open: this ship is under way.' : 'Flat, no open position: the ship rests.'} Today ${acct.today < 0 ? '-' : acct.today > 0 ? '+' : ''}$${Math.abs(Math.round(acct.today)).toLocaleString('en-US')}.${room}` };
      this.shipAnch[i] = an; this.anchors.push(an);
    });
    this.tintShips();
  }
  // ------------------------------------------------------------------ day / dusk: auto (about 90 s a cycle), or locked on Day or on Dusk
  setMode(mode) {
    this.mode = mode;
    if (mode === 'auto') { const p = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * this.time))) / (Math.PI * 2); this.autoT0 = performance.now() - p * 90000; this.fade = null; }
    else this.setDusk(mode === 'dusk');
  }

  // ------------------------------------------------------------------ light and sky (day 3500 K, dusk 2700 K)
  setDusk(on) { this.target = on ? 1 : 0; this.fade = { from: this.time, t0: performance.now() }; if (this.reduced) { this.time = this.target; this.applyTime(); this.fade = null; } }
  applyTime() {
    const t = this.time, k = (a) => new THREE.Color().setRGB(...a);
    const sunC = k(KELVIN[3500]).lerp(k(KELVIN[2700]), t), elev = lerp(.82, .17, t), az = lerp(-.5, -1.1, t);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
    this.sun.color.copy(sunC); this.sun.intensity = lerp(2.9, 2.2, t); this.sun.position.copy(dir).multiplyScalar(900); this.sun.target.position.set(0, 0, 0);
    this.hemi.color.copy(mixC('#dfe6e8', '#8a7aa0', t)); this.hemi.groundColor.copy(mixC('#b39a72', '#6a5448', t)); this.hemi.intensity = lerp(1.4, 1.2, t);
    const top = mixC(SKY.day[0], SKY.dusk[0], t), mid = mixC(SKY.day[1], SKY.dusk[1], t), hor = mixC(SKY.day[2], SKY.dusk[2], t);
    this.skyU.uTop.value.copy(top); this.skyU.uMid.value.copy(mid); this.skyU.uHor.value.copy(hor); this.skyU.uSun.value.copy(sunC); this.skyU.uSunDir.value.copy(dir);
    this.scene.fog.color.copy(mixC('#e8d2a4', '#c88a68', t)); this.scene.fog.density = lerp(.00042, .00052, t);
    const w = this.wU; w.uFog.value.copy(this.scene.fog.color); w.uFogD.value = this.scene.fog.density; w.uSky.value.copy(hor.clone().lerp(mid, .3)); w.uSun.value.copy(sunC); w.uSunDir.value.copy(dir);
    w.uDeep.value.copy(mixC('#2f5f78', '#2a3a58', t)); w.uShallow.value.copy(mixC('#5c97a2', '#5a6f86', t));
    const night = Math.max(0, (t - .25) / .75);
    for (const o of [this.lamps, this.windows, this.beacon, this.glow]) if (o) o.material.opacity = o.userData.max * night;
  }

  // ------------------------------------------------------------------ camera
  placeCamera() {
    const c = this.cam, cp = Math.cos(c.pitch);
    this.camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist);
    const floor = groundY(this.camera.position.x, this.camera.position.z); if (this.camera.position.y < floor + 4) this.camera.position.y = floor + 4;
    this.camera.lookAt(c.tx, c.ty, c.tz);
  }
  orbit(dx, dy) { const c = this.cam; c.yaw -= dx * .0062; c.pitch = Math.max(.06, Math.min(1.45, c.pitch + dy * .0052)); }
  zoom(f) { const c = this.cam; c.dist = Math.max(22, Math.min(1500, c.dist * f)); }
  pan(dx, dy) {
    const c = this.cam, s = c.dist * .0017, rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    c.tx = Math.max(-760, Math.min(760, c.tx - (rx * dx + fx * -dy) * s)); c.tz = Math.max(-700, Math.min(660, c.tz - (rz * dx + fz * -dy) * s)); c.ty = Math.max(0, groundY(c.tx, c.tz));
  }
  flyTo(x, z, o = {}) {
    this.tour = null; const c = this.cam, y = o.y ?? Math.max(0, groundY(x, z));
    let yaw = o.yaw ?? c.yaw; const dy = ((yaw - c.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw = c.yaw + dy;
    this.fly = { from: { ...c }, to: { tx: x, ty: y + (o.lift || 0), tz: z, yaw, pitch: o.pitch ?? Math.max(.38, Math.min(.7, c.pitch)), dist: o.dist ?? 130 }, t: 0, dur: o.dur ?? 1.5 };
    if (this.reduced) this.fly.dur = .01;
  }
  startTour(tour) {
    this.fly = null; const V = (a) => a.map((p) => new THREE.Vector3(...p));
    this.tour = { def: tour, cam: new THREE.CatmullRomCurve3(V(tour.cam), false, 'catmullrom', .4), look: new THREE.CatmullRomCurve3(V(tour.look), false, 'catmullrom', .4), t: 0 };
  }
  stopTour() { if (!this.tour) return; const T = this.tour; this.tour = null; this.syncFromCamera(T.look.getPoint(Math.min(1, T.t / T.def.secs))); }
  syncFromCamera(look) {
    const p = this.camera.position, c = this.cam, dx = p.x - look.x, dy = p.y - look.y, dz = p.z - look.z;
    c.tx = look.x; c.ty = look.y; c.tz = look.z; c.dist = Math.max(30, Math.hypot(dx, dy, dz)); c.yaw = Math.atan2(dx, dz); c.pitch = Math.max(.06, Math.min(1.45, Math.asin(dy / c.dist)));
  }
  get touring() { return !!this.tour; }
  get progress() { return this.tour ? this.tour.t / this.tour.def.secs : 0; }

  resize() {
    const w = this.canvas.clientWidth || 390, h = this.canvas.clientHeight || 844, O = window.OLYMPUS, dpr = Math.min(this.T.dpr, O && O.dpr ? O.dpr(this.tierName === 'low') : (window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); if (this.interior) this.interior.resize(w, h); this.camera.aspect = w / h; this.camera.fov = h > w ? 62 : 50; this.camera.updateProjectionMatrix(); this.w = w; this.h = h;
  }

  /** screen position of a world point; z < 0 or off-screen means not visible */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * .5 + .5) * this.w, y: (-v.y * .5 + .5) * this.h, vis: v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 };
  }
  pick(px, py, radius = 40) {
    let best = null, bd = radius;
    for (const a of this.anchors) { const p = this.project(a.x, a.y * .6, a.z); if (!p.vis) continue; const d = Math.hypot(p.x - px, p.y - py) - (a.major ? 6 : 0); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  select(a) {
    this.sel = a; this.ring.visible = this.beam.visible = !!a; if (!a) return;
    const gy = groundY(a.x, a.z), r = a.r || (a.major ? 16 : 11); this.ring.position.set(a.x, gy + .6, a.z); this.ring.scale.setScalar(r);
    this.beam.position.set(a.x, gy, a.z); this.beam.scale.set(.5, a.y + 40 - gy, .5);
  }

  frame(dt, t) {
    this.u.uTime.value = t; this.frameCount++;
    if (this.mode === 'auto' && !this.reduced) { const p = ((performance.now() - this.autoT0) / 90000) % 1; this.time = .5 - .5 * Math.cos(p * Math.PI * 2); this.target = this.time; this.applyTime(); }
    else if (this.fade) { const k = Math.min(1, (performance.now() - this.fade.t0) / 1600), e = k * k * (3 - 2 * k); this.time = lerp(this.fade.from, this.target, e); this.applyTime(); if (k >= 1) this.fade = null; }
    const cam = this.cam;
    if (this.fly) {
      const f = this.fly; f.t += dt / f.dur; const k = Math.min(1, f.t), e = k * k * (3 - 2 * k);
      for (const key of ['tx', 'ty', 'tz', 'yaw', 'pitch']) cam[key] = lerp(f.from[key], f.to[key], e);
      cam.dist = Math.exp(lerp(Math.log(f.from.dist), Math.log(f.to.dist), e)) * (1 + Math.sin(k * Math.PI) * .35);
      if (k >= 1) this.fly = null;
    }
    if (this.walk) this.walkTick(dt);
    else if (this.tour) {
      const T = this.tour; T.t += dt; const u = Math.min(1, T.t / T.def.secs), e = u * u * (3 - 2 * u) * .35 + u * .65;
      const p = T.cam.getPoint(e), l = T.look.getPoint(e); this.camera.position.copy(p); const fl = groundY(p.x, p.z) + 4; if (p.y < fl) this.camera.position.y = fl; this.camera.lookAt(l);
      if (u >= 1) { this.tour = null; this.syncFromCamera(l); this.onTourEnd && this.onTourEnd(); }
    } else this.placeCamera();
    this.camera.updateMatrixWorld();
    // LOD: far chunks swap to plain blocks, the lantern pass and the ships pause far away
    const cp = this.camera.position;
    for (const c of this.chunks) { const far = Math.hypot(c.cx - cp.x, c.cz - cp.z) > (this.tierName === 'low' ? 520 : 760); c.a.visible = !far; c.b.visible = far; }
    this.shipsTick(t);
    if (this.beacon) this.beacon.rotation.y = t * .5;
    if (this.needPts) { const k = this.reduced ? .7 : .62 + .22 * Math.sin(t * 2.2); this.needPts.material.opacity = k; this.needBeams.material.opacity = .14 + .16 * k; }
    if (this.sel) { const s = 1 + Math.sin(t * 3) * .04; this.ring.scale.setScalar((this.sel.r || (this.sel.major ? 16 : 11)) * s); }
    this.lifeTick(t); this.npcTick(t);
    if (this.interior) this.interior.frame(dt, t);
    if (this.cine && !this.interior) this.cine.frame(dt, t);                     // FX HOOK: the gulls fly
    this.renderCurrent();
    this.calls = this.renderer.info.render.calls; this.trisDrawn = this.renderer.info.render.triangles;
  }


  // ------------------------------------------------------------------ the nested world: villages, villagers, walking
  /** the world of villages arrived (or changed): redraw the houses with their data, add hamlet halls, villagers, the collision grid */
  setWorld(world) {
    this.world = world; this.houseRows = renderList(world, this.T.houses, this.tierName === 'low' ? 6 : 40);
    this.houses(undefined, undefined);
    this.anchors = this.anchors.filter((a) => !a.hamlet);
    for (const v of world.villages) if (!v.temple) this.anchors.push({ kind: 'app', id: v.id, appId: v.id, name: v.name, group: v.group, x: v.x, y: 9, z: v.z, colour: v.colour, blurb: v.blurb + ' (a hamlet: no temple, its houses are its data)', hamlet: true });
    this.col = makeCollider(this.houseRows, this.plan);
    this.npcInit(world);
  }
  npcInit(world) {
    if (this.npcMesh) { this.scene.remove(this.npcMesh); if (this.crowd) this.crowd.dispose(); else this.npcMesh.dispose(); this.npcMesh = null; this.crowd = null; }
    const n = TIER_NPC[this.tierName] || 0; this.npcs = n ? makeNpcs(world, this.col, n) : [];
    if (!this.npcs.length) return;
    // QA6: the villagers are the rigged cast (town-cast.js): one photo sprite each far away (one draw call), full rigged figures near you. A villager
    // wears their village's look (villager:<app-id>, the same face as in the chat sheet); the toy figures (people-fig.js) only until the photos are ready
    this.crowd = makeTownCast(THREE, this.npcs.map((q) => ({ id: `villager:${world.villages[q.a].id}` })), { lite: this.tierName === 'low', reduced: this.reduced, looks: this.npcs.map((q) => lookOf(`villager:${world.villages[q.a].id}:${q.i}`)), tint: '#f0dcc4',
      surface: (x, z) => (groundY(x, z) > 20 || (x > -40 && x < 160 && z > -108 && z < 30) ? 'stone' : 'sand') });
    this.npcMesh = this.crowd.mesh; this.scene.add(this.npcMesh); this.npcD = new THREE.Object3D(); this.npcT = 0; this.talkNpc = null; return;
    if (!this.npcGeo) { const b = new Batch(); b.cone(0, 0, 0, .36, 1.35, '#ffffff', 6); b.put(unit.sphere(6, 4), 0, 1.3, 0, .21, .21, .21, '#ffffff'); this.npcGeo = b.geometry(); this.dispose_.push(this.npcGeo); this.npcMat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.dispose_.push(this.npcMat); }
    const m = this.npcMesh = new THREE.InstancedMesh(this.npcGeo, this.npcMat, this.npcs.length), c = new THREE.Color();
    this.npcs.forEach((q, i) => { m.setColorAt(i, c.set(q.colour)); }); m.instanceColor.needsUpdate = true; m.frustumCulled = false; this.scene.add(m); this.npcD = new THREE.Object3D(); this.npcT = 0;
  }
  npcTick(t) {
    const m = this.npcMesh; if (!m) return; const d = this.npcD, sc = this.walk ? 1 : 2.4, cp = this.camera.position;
    this.npcT = t; this.npcPos = this.npcPos || [];
    for (let i = 0; i < this.npcs.length; i++) {
      const talking = this.talkNpc === i && this.npcPos[i], q = talking ? this.npcPos[i] : npcAt(this.npcs[i], t); this.npcPos[i] = q;   // the one you talk to stops and turns to face you
      // walking among them: heads turn as you arrive (2.6 s, within 45 m) and anyone within 5 m faces you with a little hop: hello
      const dMe = this.walk ? Math.hypot(this.walk.x - q.x, this.walk.z - q.z) : 1e9, greet = !talking && dMe < 5, look = !talking && this.lookUntil && t < this.lookUntil && dMe < 45;
      const ry = talking || greet || look ? Math.atan2(cp.x - q.x, cp.z - q.z) : Math.atan2(Math.sin(q.yaw), -Math.cos(q.yaw)); q.facing = !!(talking || greet || look); q.act = talking ? 'talk' : greet ? 'greet' : look ? 'look' : 'walk';
      const hop = greet && !this.reduced && !(this.crowd && this.crowd.figureOf && this.crowd.figureOf(i)) ? Math.max(0, Math.sin(t * 7 + i)) * .14 * sc : 0;     // a full figure waves instead of hopping
      if (this.crowd && this.crowd.act) this.crowd.act(i, q.act);
      if (this.crowd) this.crowd.place(i, q.x, groundY(q.x, q.z) + hop, q.z, ry, sc * 1.16, talking && !this.reduced && !this.crowd.act ? 1 + .035 * Math.sin(t * 9) : 1);
      else { d.position.set(q.x, groundY(q.x, q.z), q.z); d.rotation.set(0, -q.yaw, 0); d.scale.setScalar(sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }
    }
    if (this.crowd && this.crowd.commit) { this.crowd.commit(); const dt = Math.min(.25, Math.max(0, t - (this._npcT == null ? t : this._npcT))); this._npcT = t;
      if (this.crowd.talk) this.crowd.talk(this.talkNpc == null ? -1 : this.talkNpc);
      this.crowd.tick(dt, t, this.camera, this.walk ? { x: this.walk.x, z: this.walk.z } : null); }     // the near ones become full rigged figures (and their feet sound)
    else m.instanceMatrix.needsUpdate = true;
  }
  /** a villager near a screen point: { npc, village, fact } or null */
  pickNpc(px, py, radius = 36) {
    if (!this.npcs || !this.npcPos) return null; let best = null, bd = radius; const sc = this.walk ? 1 : 2.4;
    for (let i = 0; i < this.npcs.length; i++) { const q = this.npcPos[i]; if (!q) continue; const p = this.project(q.x, groundY(q.x, q.z) + 1.3 * sc, q.z); if (!p.vis) continue; const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = i; } }
    if (best == null) return null; const n = this.npcs[best], v = this.world.villages[this.npcPos[best].near === 'a' ? n.a : n.b]; return { npc: n, village: v, fact: v.fact };
  }
  /** a village house near a screen point (the houses that carry data) */
  pickHouse(px, py, radius = 30) {
    if (!this.houseItems) return null; let best = null, bd = radius; const cp = this.camera.position;
    for (const h of this.houseItems) { if (Math.abs(h.x - cp.x) > 520 || Math.abs(h.z - cp.z) > 520) continue; const p = this.project(h.x, (h.y || 0) + h.h * .6, h.z); if (!p.vis) continue; const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // walking at street level: eye 1.7 m, drag to look, a joystick moves
  startWalk(x, z, yaw = 0) {
    if (!this.col) return false; this.tour = null; this.fly = null; this.camera.near = .35; this.camera.updateProjectionMatrix();
    this.walk = { x, z, yaw, pitch: -.03, input: { fwd: 0, side: 0, run: false }, bob: 0, y: groundY(x, z) + EYE, dist: 0 }; this.lookUntil = (this.npcT || 0) + 2.6; return true;
  }
  stopWalk() {
    if (!this.walk) return; const w = this.walk; this.walk = null; this.camera.near = 1.5; this.camera.updateProjectionMatrix();
    const c = this.cam; c.tx = w.x; c.tz = w.z; c.ty = groundY(w.x, w.z); c.dist = 120; c.pitch = .55; c.yaw = w.yaw + Math.PI;
  }
  walkLook(dx, dy) { const w = this.walk; if (!w) return; w.yaw += dx * .0055; w.pitch = Math.max(-1, Math.min(.9, w.pitch - dy * .0045)); }
  walkTick(dt) {
    if (this.walkDirector && this.walkDirector.tick(dt)) return;     // SCENE DIRECTION HOOK (athens-direct.js, QA6): third person on the terrain, tap-to-walk, the conversation camera
    const w = this.walk, r = walkStep(w, w.input, dt, this.col); w.x = r.x; w.z = r.z; w.dist += r.moved; w.bob += r.moved * 2.1;
    const gy = groundY(w.x, w.z) + EYE; w.y += (gy - w.y) * Math.min(1, dt * 8);
    const bob = this.reduced ? 0 : Math.sin(w.bob) * .035, cp = Math.cos(w.pitch);
    this.camera.position.set(w.x, w.y + bob, w.z); this.camera.lookAt(w.x + Math.sin(w.yaw) * cp, w.y + bob + Math.sin(w.pitch), w.z - Math.cos(w.yaw) * cp);
  }
  get walking() { return !!this.walk; }

  dispose() { this.dead = true; if (this.walkDirector) { try { this.walkDirector.dispose(); } catch (e) { /* gone */ } this.walkDirector = null; } if (this.crowd && this.crowd.dispose) { try { this.crowd.dispose(); } catch (e) { /* gone */ } this.crowd = null; } if (this.cine) this.cine.dispose(); for (const o of this.dispose_) o.dispose && o.dispose(); if (this.ek) this.ek.dispose(); this.renderer.dispose(); }
}
