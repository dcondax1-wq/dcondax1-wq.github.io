// HELLAS scene: the Greek world above Athens. One renderer, two stages:
//   world   sea, land and hills in one batch, every polis as instanced markers (walls, houses, a gold acropolis), trade routes, ships
//   polis   ONE polis at a time, generated from its rows (hellas-plan.js planPolis); the one before is disposed first
// Budgets (measured every frame: calls / trisDrawn): world <= 30 draw calls; any view <= 45 calls / 160k triangles on phone-high,
// <= 28 / 80k in LITE. Golden-hour AGORA light (a low 3500 K sun, long shadows, sea shimmer), nothing glows. READ ONLY scenery: no order, no trade.
// Biomes: green Greece for the living work, the southern DESERT for what did not work (ghost towns, dunes, pyramids, oases, caravans).
// Activity, from real data: a city at work burns a brazier and smokes, a quiet one rests, a ruin is low, broken mud brick.
import * as THREE from '../jarvis/three.module.min.js';
import { Batch, PAL, unit } from './athens-geo.js';
import { envKit } from '../olympus/env-kit.js';
import { rng, hash32 } from './util.js';
import { walkStep, HOUSE_TINT, EYE } from './athens-world.js';
import { planPolis, polisCollider, polisNpcs, npcOnLoop, builderAt, TIER, routinePlaces, fieldTo, routineAt, pathDown, pathLen, alongPath } from './hellas-plan.js';
import { makeCrowd } from './people-fig.js';
import { makeTownCast } from './town-cast.js';
import { lookOf } from './people-talk.js';
import { keeperPerson, townsPerson, builderPerson } from './hellas-data.js';

const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SKY_VS = `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `uniform vec3 uTop, uMid, uHor, uSun, uSunDir; varying vec3 vD;
void main(){ float h = clamp(vD.y, -.1, 1.); vec3 c = mix(uHor, uMid, smoothstep(0., .22, h)); c = mix(c, uTop, smoothstep(.15, .85, h));
  float s = max(dot(normalize(vD), uSunDir), 0.); c += uSun*(pow(s, 600.)*1.2 + pow(s, 14.)*.22); gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`;
const SEA_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const SEA_FS = `uniform float uTime, uFogD, uMove, uScale, uShimmer; uniform vec3 uDeep, uShallow, uSun, uSky, uFog, uSunDir; varying vec3 vW;
float hsh(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 q){ vec2 i = floor(q), f = fract(q); f = f*f*(3.-2.*f); return mix(mix(hsh(i), hsh(i+vec2(1.,0.)), f.x), mix(hsh(i+vec2(0.,1.)), hsh(i+vec2(1.,1.)), f.x), f.y); }
void main(){ float t = uTime*uMove; vec2 p = vW.xz*uScale;
  vec3 n = normalize(vec3(sin(p.x*.09+t*1.1)*.06+sin(p.y*.15-t*1.4)*.05+sin((p.x+p.y)*.31+t*2.)*.02, 1., cos(p.y*.11+t)*.05+sin(p.x*.2-t*1.7)*.03));
  vec3 v = normalize(cameraPosition - vW); float fres = pow(1. - clamp(dot(v, n), 0., 1.), 3.);
  vec3 h = normalize(uSunDir + v); float spec = pow(max(dot(n, h), 0.), 90.);
  vec3 c = mix(uDeep, uShallow, .5 + .5*sin(p.x*.013 + p.y*.017)); c = mix(c, uSky, clamp(fres*.8, 0., .85)) + uSun*spec*.7;
  c += uSun*smoothstep(.46, .78, vn(p*.55 + vec2(t*.5, -t*.35))*vn(p*1.3 - vec2(t*.4, t*.3) + 7.))*.55*uShimmer*(.22 + .78*pow(max(-dot(normalize(vec3(v.x, 0., v.z)), normalize(vec3(uSunDir.x, 0., uSunDir.z))), 0.), 3.));
  float d = length(cameraPosition - vW); float f = 1. - exp(-d*d*uFogD*uFogD*3.);
  gl_FragColor = vec4(mix(c, uFog, clamp(f,0.,1.)), 1.);
  #include <colorspace_fragment>
}`;
const C = (h) => new THREE.Color(h);

export class Hellas {
  constructor(canvas, world, opts = {}) {
    this.canvas = canvas; this.world = world; this.tierName = TIER[opts.tier] ? opts.tier : 'high'; this.T = TIER[this.tierName]; this.reduced = !!opts.reduced; this.lite = this.tierName === 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(52, 1, 2, 16000);
    this.u = { uTime: { value: 0 } }; this.keep = []; this.level = 'world'; this.polis = null; this.plan = null; this.fly = null; this.walk = null; this.sel = null; this.frameCount = 0; this.calls = 0; this.trisDrawn = 0; this.streams = 0;
    const B = world.bounds; this.home = { tx: B.cx, ty: 0, tz: B.cz + B.h * .1, yaw: 0, pitch: .8,   // from over the southern desert, looking north to Greece into the low sun
      dist: Math.max(B.w * 1.72, B.h * .98) };
    this.cam = { ...this.home }; this.wcam = { ...this.home };
    this.buildWorld();
    this.resize(); this.placeCamera();
    // FX HOOK (olympus/fx-cine.js, optional; 2026-11-11 effects pass): gulls wheeling over the Aegean and sand blowing off the southern
    // desert, one draw each, no post pass (this scene draws straight to the screen). Hellas is the same without it.
    this.cine = null;
    import('../olympus/fx-cine.js').then((C) => { if (this.dead) return; const B = world.bounds, k = Math.max(B.w, B.h);
      this.cine = C.cinema({ scene: this.scene, camera: this.camera, renderer: this.renderer, tier: this.tierName }, { sun: false, bursts: false, reduced: this.reduced,
        birds: { center: [B.cx, 0, B.cz - B.h * 0.1], radius: k * 0.09, height: k * 0.035, size: k * 0.0028, count: 14 },
        sand: { box: [B.w * 0.7, k * 0.012, B.h * 0.18], center: [B.cx, k * 0.004, B.cz + B.h * 0.38], vel: [k * 0.02, 0, k * 0.004], size: k * 0.0016, count: 500 } });
    }).catch(() => { /* optional */ });
  }
  own(o) { this.keep.push(o); return o; }

  buildWorld() {
    const W = this.world, T = this.T, scene = this.scene, own = (o) => this.own(o), sunDir = new THREE.Vector3(-.74, .34, -.36).normalize();   // golden hour: the sun low in the north-west, shadows fall long to the south-east
    this.sunDir = sunDir; this.hemi = new THREE.HemisphereLight('#ecd9bb', '#8a6f52', .92); this.sun = new THREE.DirectionalLight(new THREE.Color(1, .769, .537), 2.7); // 3500 K
    this.sun.position.copy(sunDir).multiplyScalar(100); scene.add(this.hemi, this.sun);
    scene.fog = new THREE.FogExp2('#ecc998', .00005);
    const skyU = { uTop: { value: C('#5d82a8') }, uMid: { value: C('#e6b98c') }, uHor: { value: C('#f8d49a') }, uSun: { value: C('#ffd08a') }, uSunDir: { value: sunDir } };
    const sky = new THREE.Mesh(own(new THREE.SphereGeometry(9000, 20, 10)), own(new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false })));
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    this.seaU = { uTime: this.u.uTime, uDeep: { value: C('#2f5f78') }, uShallow: { value: C('#5c97a2') }, uSun: { value: C('#ffd9a0') }, uSky: { value: C('#e6c79c') }, uFog: { value: C('#ecc998') }, uSunDir: { value: sunDir }, uFogD: { value: .00005 }, uMove: { value: this.reduced ? 0 : 1 }, uScale: { value: .12 }, uShimmer: { value: 1 } };
    const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2)), own(new THREE.ShaderMaterial({ vertexShader: SEA_VS, fragmentShader: SEA_FS, uniforms: this.seaU })));
    sea.position.y = -.3; sea.frustumCulled = false; scene.add(sea); this.sea = sea;
    this.ek = envKit({ renderer: this.renderer, scene, tier: this.tierName });          // the scans (olympus/env-kit.js): stone and roof tiles on the cities
    this.matVC = this.ek.mat('marble', { lambert: true, vertexColors: true, color: '#ffffff', dual: 'roof', scale: 0.5, scale2: 0.8 }); this.matPlain = own(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    this.matRing = own(new THREE.MeshBasicMaterial({ color: '#e8bb55', transparent: true, opacity: .92, depthWrite: false, fog: false }));
    this.ring = new THREE.Mesh(own(new THREE.TorusGeometry(1, .05, 6, 44).rotateX(Math.PI / 2)), this.matRing); this.ring.visible = false; this.ring.frustumCulled = false; scene.add(this.ring);
    const G = this.wg = new THREE.Group(); scene.add(G);
    // land: sand under every disc, the land on top, hills: ONE draw call
    const b = new Batch(), seg = this.lite ? 8 : 14, tintOf = new Map(W.regions.map((R) => [R.key, R.kind === 'desert' ? C('#e2c58c').lerp(C(R.tint), .35) : C('#a8a070').lerp(C(R.tint), .2)])), desert = new Set(W.regions.filter((R) => R.kind === 'desert').map((R) => R.key));
    for (const d of W.land) b.put(unit.cyl(seg, 1), d.x, -1.2, d.z, d.r + 7, 1.5, d.r + 7, desert.has(d.region) ? '#efd9a6' : PAL.sand, 0, 0, 0, .1);
    for (const d of W.land) b.put(unit.cyl(seg, .97), d.x, -1, d.z, d.r, 2.2, d.r, tintOf.get(d.region) || '#a8a070', 0, 0, 0, .1);
    const dunes = W.hills.filter((h) => h.dune), green = W.hills.filter((h) => !h.dune);
    dunes.slice(0, Math.round(T.hills * .6)).forEach((h, i) => b.put(unit.cone(this.lite ? 5 : 7), h.x, 1.1, h.z, h.r, h.h, h.r * .62, i % 2 ? '#ecd29a' : '#dcbc80', (i * 37 % 60) / 100 - .9, 0, 0, .12));
    for (const f of W.features || []) {
      if (f.kind === 'pyramid') { b.put(unit.cone(4), f.x, 1.1, f.z, f.s, f.s * .78, f.s, '#e3c080', Math.PI / 4, 0, 0, .18); b.put(unit.cone(4), f.x + f.s * 1.1, 1.1, f.z + f.s * .5, f.s * .5, f.s * .4, f.s * .5, '#d9b472', Math.PI / 4, 0, 0, .18); }
      else if (f.kind === 'obelisk') { b.box(f.x, 1.1, f.z, f.s * .3, f.s * .12, f.s * .3, PAL.stone); b.put(unit.cyl(4, .6), f.x, 1.1 + f.s * .12, f.z, f.s * .1, f.s * 1.15, f.s * .1, '#e6d3a8', Math.PI / 4); b.put(unit.cone(4), f.x, 1.1 + f.s * 1.27, f.z, f.s * .065, f.s * .14, f.s * .065, PAL.gold, Math.PI / 4); }
      else { b.put(unit.cyl(this.lite ? 7 : 10, 1), f.x, 1.12, f.z, f.s * .95, .12, f.s * .95, '#8fa06a', 0, 0, 0, .05); b.put(unit.cyl(this.lite ? 6 : 9, 1), f.x, 1.2, f.z, f.s * .5, .1, f.s * .5, '#4f86a0', 0, 0, 0, .05);
        for (let k = 0; k < (this.lite ? 3 : 5); k++) { const a = k * 1.9 + f.s, x = f.x + Math.cos(a) * f.s * .72, z = f.z + Math.sin(a) * f.s * .72; b.cyl(x, 1.2, z, .22, 3.2, PAL.timber, 4, .7); b.put(unit.cone(5), x, 3.9, z, 1.5, 1.1, 1.5, '#6f8a46'); } }
    }
    for (const s of W.sites || []) { b.box(s.x, 1.1, s.z, 9, .5, 7, PAL.marbleD); for (const [dx, dz] of [[-3.6, -2.6], [3.6, -2.6], [-3.6, 2.6], [3.6, 2.6]]) b.box(s.x + dx, 1.6, s.z + dz, .35, 5.5, .35, PAL.timber); b.box(s.x, 6.9, s.z - 2.6, 7.6, .3, .3, PAL.timber); b.box(s.x, 6.9, s.z + 2.6, 7.6, .3, .3, PAL.timber); b.box(s.x - 1.4, 1.6, s.z, 2.4, 2.2, 3, PAL.marble); }
    if (W.camp && (W.builders || []).length) for (let k = 0; k < 4; k++) b.put(unit.cone(6), W.camp.x - 12 + k * 8, 1.1, W.camp.z + 14 + (k % 2) * 5, 3, 3.2, 3, k % 2 ? '#f1e6cd' : '#e3cfa6');
    green.slice(0, T.hills).forEach((h, i) => { b.cone(h.x, 1.1, h.z, h.r, h.h, i % 3 ? '#9a9668' : '#b3a283', this.lite ? 5 : 7); if (!this.lite && h.h > 14) b.cone(h.x, 1.1 + h.h * .62, h.z, h.r * .4, h.h * .4, '#e6dcc4', 6); });
    G.add(new THREE.Mesh(own(b.geometry()), this.matVC)); this.landTris = b.tris;
    // markers: walls (the colour says adopted against rejected), little houses (the count says the size), a gold acropolis
    const P = W.poleis, n = P.length, d = new THREE.Object3D(), col = new THREE.Color(), bad = C('#c96a4a'), mid = C('#d9c7a0'), good = C('#7f8a52');
    this.base = new THREE.InstancedMesh(own(unit.cyl(this.lite ? 8 : 12, .92).clone()), this.matPlain, n);
    const nb = P.map((p) => (p.capital ? T.blocks + 6 : clamp(Math.round(1.5 + Math.sqrt(p.size) * 1.15), 2, T.blocks))), total = nb.reduce((s, x) => s + x, 0);
    this.blocks = new THREE.InstancedMesh(this.lite ? unit.houseFar() : unit.house(), this.matVC, total); this.blockAt = [];
    const golds = P.filter((p) => p.gold);
    const ab = new Batch(); ab.cyl(0, 0, 0, 1, .9, '#b3a283', this.lite ? 6 : 8, .7); ab.box(0, .9, 0, 1.15, .12, .8, PAL.marble); ab.box(0, 1.02, 0, .95, .5, .6, PAL.marbleD); ab.roof(0, 1.52, 0, .72, .32, 1.1, PAL.gold, Math.PI / 2);
    if (!this.lite) for (const sx of [-.42, -.14, .14, .42]) ab.cyl(sx, 1.02, .34, .05, .5, PAL.marble, 5);
    this.acro = new THREE.InstancedMesh(own(ab.geometry()), this.matVC, Math.max(1, golds.length)); this.acro.count = golds.length; this.acroTris = ab.tris;
    let bi = 0, gi = 0; this.markerInfo = [];
    P.forEach((p, i) => {
      const r = rng(hash32('mk:' + p.id)), share = clamp(p.share || 0, 0, 1);
      const ruin = p.activity && p.activity.state === 'ruin';
      col.copy(share < .5 ? bad.clone().lerp(mid, share * 2) : mid.clone().lerp(good, (share - .5) * 2)); if (p.capital) col.set('#e8d9b8'); if (ruin) col.set(p.biome === 'desert' ? '#cfae7c' : '#a99a84'); this.base.setColorAt(i, col);
      const info = { b0: bi, nb: nb[i], gi: p.gold ? gi : -1, items: [], ruin };
      for (let k = 0; k < nb[i]; k++) { const th = k * 2.399963 + r() * .5, rr = p.mr * (p.gold ? .42 + .42 * Math.sqrt((k + .5) / nb[i]) : .82 * Math.sqrt((k + .5) / nb[i])), s = p.mr * (.2 + r() * .08) * (p.capital ? .7 : 1);
        info.items.push({ x: Math.cos(th) * rr, z: Math.sin(th) * rr, s, h: s * (.9 + r() * .7) * (ruin ? (r() < .4 ? .12 : .42) : 1), ry: r() * 3.14 }); const t = .86 + r() * .14; if (ruin) col.setRGB(t * .95, t * .74, t * .5); else col.setRGB(t, t * (.94 + r() * .06), t * (.84 + r() * .1)); this.blocks.setColorAt(bi + k, col); }
      bi += nb[i]; if (p.gold) { col.setRGB(1, 1, 1); this.acro.setColorAt(gi, col); gi++; }
      this.markerInfo.push(info);
    });
    this.markerScale = 0; this.setMarkerScale(1);
    for (const m of [this.base, this.blocks, this.acro]) { m.frustumCulled = false; if (m.instanceColor) m.instanceColor.needsUpdate = true; G.add(m); }
    // long golden-hour shadows: one flat instanced quad per city, stretched away from the sun
    const sg = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(.5, 0, 0)); this.shadows = new THREE.InstancedMesh(sg, own(new THREE.MeshBasicMaterial({ color: '#2a1c10', transparent: true, opacity: .24, depthWrite: false })), n); this.shadows.frustumCulled = false; this.shadows.renderOrder = 1; G.add(this.shadows);
    // what each city is working on: a brazier flame and smoke over every city that is at work (real data: hellas-data.js setActivity)
    this.working = P.filter((p) => p.activity && p.activity.state === 'working');
    if (this.working.length) { this.flames = new THREE.InstancedMesh(own(new THREE.ConeGeometry(1, 2.4, 5).translate(0, 1.2, 0)), own(new THREE.MeshBasicMaterial({ color: '#f4a63c' })), this.working.length); this.flames.frustumCulled = false; G.add(this.flames);
      if (!this.lite) { this.smoke = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 0)), own(new THREE.MeshBasicMaterial({ color: '#e9dcc6', transparent: true, opacity: .34, depthWrite: false })), this.working.length * 3); this.smoke.frustumCulled = false; this.smoke.renderOrder = 2; G.add(this.smoke); } }
    // caravans: camels on the desert routes (phone-high) and the builders travelling to the city each one is building (always)
    this.builders = W.builders || []; this.caravanRoutes = this.lite ? [] : W.routes.filter((r) => r.caravan).slice(0, 14);
    const nc = this.caravanRoutes.length * 2;
    if (this.builders.length) { this.builderCrowd = makeCrowd(this.builders.map((b) => lookOf(b.pid, 'builder')), { lite: this.lite }); G.add(this.builderCrowd.mesh); }
    if (nc) { const cb = new Batch(); cb.box(0, .9, 0, .7, .9, 1.9, '#ffffff'); cb.box(0, 1.5, .95, .32, .95, .36, '#ffffff'); cb.box(0, 2.3, 1.2, .34, .34, .6, '#ffffff'); for (const [x, z] of [[-.25, -.7], [.25, -.7], [-.25, .7], [.25, .7]]) cb.box(x, 0, z, .16, .9, .16, '#e8e0d0'); cb.box(0, 1.8, -.1, .9, .5, 1, '#c9a060');
      this.caravan = new THREE.InstancedMesh(own(cb.geometry()), this.matVC, nc); this.caravan.frustumCulled = false; for (let i = 0; i < nc; i++) { col.set('#c79a62'); this.caravan.setColorAt(i, col); } this.caravan.instanceColor.needsUpdate = true; G.add(this.caravan); }
    this.markerScale = 0; this.setMarkerScale(1); this.lifeTick(0, true);
    // trade routes: one line set; ships sail them (none in LITE, still in reduced motion)
    const rp = []; for (const R of W.routes) { const a = P[R.a], q = P[R.b]; rp.push(a.x, 1.6, a.z, q.x, 1.6, q.z); }
    const rg = own(new THREE.BufferGeometry()); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.routes = new THREE.LineSegments(rg, own(new THREE.LineBasicMaterial({ color: '#8a5a2c', transparent: true, opacity: .55 }))); this.routes.frustumCulled = false; G.add(this.routes);
    const ns = Math.min(T.ships, W.routes.length);
    if (ns) { const sb = new Batch(); sb.box(0, 0, 0, 1, .35, 2.6, PAL.timber); sb.box(0, .35, 0, .08, 2, .08, PAL.timber); sb.box(0, .9, .1, 1.5, 1.2, .06, '#f1e6cd');
      this.ships = new THREE.InstancedMesh(own(sb.geometry()), this.matVC, ns); this.ships.frustumCulled = false; G.add(this.ships);
      const r = rng(hash32('ships')); this.shipDef = Array.from({ length: ns }, (_, i) => ({ route: W.routes[Math.floor(i * W.routes.length / ns)], ph: r(), sp: .012 + r() * .012 })); this.shipsTick(0); }
  }
  /** far away the markers grow a little so a city is still a visible dot (LOD of the world level) */
  setMarkerScale(k) {
    k = Math.round(k * 4) / 4; if (k === this.markerScale) return; this.markerScale = k;
    const d = new THREE.Object3D(), P = this.world.poleis;
    P.forEach((p, i) => {
      const I = this.markerInfo[i]; d.rotation.set(0, 0, 0); d.position.set(p.x, 1.1, p.z); d.scale.set(p.mr * k, 1.3 * k, p.mr * k); d.updateMatrix(); this.base.setMatrixAt(i, d.matrix);
      I.items.forEach((it, j) => { d.position.set(p.x + it.x * k, 1.1 + 1.3 * k, p.z + it.z * k); d.rotation.set(0, it.ry, 0); d.scale.set(it.s * k, it.h * k * 1.2, it.s * k); d.updateMatrix(); this.blocks.setMatrixAt(I.b0 + j, d.matrix); });
      { const L = p.mr * (I.ruin ? 1.5 : 2.6) * k, sd = this.sunDir; d.position.set(p.x, 1.24, p.z); d.rotation.set(0, Math.atan2(sd.z, -sd.x), 0); d.scale.set(L, 1, p.mr * 1.5 * k); d.updateMatrix(); this.shadows && this.shadows.setMatrixAt(i, d.matrix); }
      if (I.gi >= 0) { const s = p.mr * (p.capital ? .5 : .42) * k; d.position.set(p.x, 1.1 + 1.3 * k, p.z); d.rotation.set(0, 0, 0); d.scale.set(s, s * 1.25, s); d.updateMatrix(); this.acro.setMatrixAt(I.gi, d.matrix); }
    });
    for (const m of [this.base, this.blocks, this.acro, this.shadows]) if (m) m.instanceMatrix.needsUpdate = true;
    if (this.flames) this.lifeTick(this.u.uTime.value, true);
  }
  /** braziers flicker, smoke rises, camels and builders walk. force = also when motion is reduced (one still pose). */
  lifeTick(t, force) {
    if (this.reduced && !force) return; const d = this._d || (this._d = new THREE.Object3D()), k = this.markerScale || 1, still = this.reduced;
    if (this.flames) { this.working.forEach((p, i) => { const f = still ? 1 : 1 + .16 * Math.sin(t * 9 + i * 1.7) + .08 * Math.sin(t * 15.3 + i), s = p.mr * .13 * k; d.position.set(p.x + p.mr * .5 * k, 1.1 + 1.3 * k + p.mr * .12 * k, p.z + p.mr * .2 * k); d.rotation.set(0, 0, 0); d.scale.set(s, s * f, s); d.updateMatrix(); this.flames.setMatrixAt(i, d.matrix);
      if (this.smoke) for (let j = 0; j < 3; j++) { const u = still ? (j + .5) / 3 : (t * .11 + j / 3 + i * .37) % 1, s2 = p.mr * (.1 + u * .22) * k; d.position.set(p.x + p.mr * .5 * k + u * p.mr * .9 * k, 1.1 + 1.3 * k + p.mr * (.5 + u * 1.5) * k, p.z + p.mr * .2 * k + u * p.mr * .35 * k); d.scale.setScalar(s2 * (1 - u * .3)); d.updateMatrix(); this.smoke.setMatrixAt(i * 3 + j, d.matrix); } });
      this.flames.instanceMatrix.needsUpdate = true; if (this.smoke) this.smoke.instanceMatrix.needsUpdate = true; }
    if (this.builderCrowd) { const cp = this.camera.position; this.builderPos = this.builders.map((b, i) => { const talking = this.talk && this.talk.kind === 'builder' && this.talk.i === i, q = talking && this.builderPos && this.builderPos[i] ? this.builderPos[i] : builderAt(b, t, still);
      this.builderCrowd.place(i, q.x, 1.2, q.z, talking ? Math.atan2(cp.x - q.x, cp.z - q.z) : q.yaw, 4.4 * k, talking && !still ? 1 + .035 * Math.sin(t * 9) : 1); q.facing = !!talking; return q; }); this.builderCrowd.commit(); }
    if (this.caravan) { const P = this.world.poleis, nb = 0;
      this.caravanRoutes.forEach((R, i) => { const a = P[R.a], b = P[R.b]; for (let j = 0; j < 2; j++) { let u = still ? .3 + j * .4 : (t * .008 + j * .5 + i * .23) % 2; const back = u > 1; if (back) u = 2 - u; const e = .14 + .72 * u; d.position.set(a.x + (b.x - a.x) * e, 1.2, a.z + (b.z - a.z) * e); d.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + (back ? Math.PI : 0), 0); d.scale.setScalar(1.7 * k); d.updateMatrix(); this.caravan.setMatrixAt(nb + i * 2 + j, d.matrix); } });
      this.caravan.instanceMatrix.needsUpdate = true; }
  }
  shipsTick(t) {
    if (!this.ships) return; const d = this._d || (this._d = new THREE.Object3D()), P = this.world.poleis, k = this.markerScale || 1;
    this.shipDef.forEach((s, i) => { const a = P[s.route.a], b = P[s.route.b]; let u = (t * s.sp + s.ph) % 2; const back = u > 1; if (back) u = 2 - u; const e = .12 + .76 * u;
      d.position.set(lerp(a.x, b.x, e), 1.5, lerp(a.z, b.z, e)); d.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + (back ? Math.PI : 0), 0); d.scale.setScalar(2.2 * k); d.updateMatrix(); this.ships.setMatrixAt(i, d.matrix); });
    this.ships.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ one polis (streamed: the one before is disposed)
  disposePolis() {
    if (!this.pg) return; this.scene.remove(this.pg); for (const g of this.pKeep) g.dispose(); this.pg = null; this.pKeep = []; this.polis = null; this.plan = null; this.col = null; this.npcs = null; this.npcMesh = null; this.houseMesh = null; this.pFlames = null; this.people = null; this.crowd = null; this.talk = null; this.routine = null; this.gathering = null;
  }
  buildPolis(p) {
    this.disposePolis(); const plan = planPolis(p), T = this.T, G = new THREE.Group(), keep = this.pKeep = [], own = (g) => { keep.push(g); return g; }, r = rng(hash32('look:' + p.id));
    this.polis = p; this.plan = plan; this.pg = G; this.streams++;
    const b = new Batch(), R = plan.R, A = plan.agoraR, seg = this.lite ? 20 : 36, ruin = !!(p.activity && p.activity.state === 'ruin'), desert = p.biome === 'desert', work = !!(p.activity && p.activity.state === 'working'); plan.ruin = ruin; plan.desert = desert;
    b.put(unit.cyl(seg, 1), 0, -1.6, 0, R + 96, 1.5, R + 96, desert ? '#efd9a6' : PAL.sand, 0, 0, 0, .1);
    b.put(unit.cyl(seg, .985), 0, -1.5, 0, R + 80, 1.5, R + 80, desert ? '#e2c58c' : '#a8a070', 0, 0, 0, .1);
    b.put(unit.cyl(seg, 1), 0, -1.45, 0, R - 1, 1.5, R - 1, desert ? '#d8bf90' : '#b9ab8a', 0, 0, 0, .05);                 // the city floor
    if (desert) for (let i = 0; i < (this.lite ? 6 : 12); i++) { const a = r() * 6.283, rr = R + 18 + r() * 54, s = 10 + r() * 12; b.put(unit.cone(this.lite ? 5 : 7), Math.cos(a) * rr, 0, Math.sin(a) * rr, s, 2 + r() * 3, s * .6, i % 2 ? '#ecd29a' : '#dcbc80', r() * 3, 0, 0, .12); }
    b.put(unit.cyl(this.lite ? 14 : 24, 1), 0, -1.4, 0, A, 1.5, A, PAL.paving, 0, 0, 0, .05);        // the agora
    for (const D of plan.districts) b.box(D.x, .02, D.z, D.w + 8, .06, D.h + 8, C('#c3b494').lerp(C(D.tint), .16));
    for (const V of plan.villages) b.box(V.x, .06, V.z, V.w + 2, .06, V.d + 2, '#cbbd9c');
    // the wall with towers and a south gate
    const N = clamp(Math.round(R / 7), 18, this.lite ? 28 : 48), step = Math.PI * 2 / N, len = 2 * R * Math.tan(step / 2) + .4;
    for (let i = 0; i < N; i++) { const a = i * step + step / 2, x = Math.cos(a) * R, z = Math.sin(a) * R, gate = Math.abs(a - Math.PI / 2) < step * .6, broken = ruin && i % 3 === 1; if (!gate) b.box(x, 0, z, 1.6, broken ? 1.4 + (i % 4) * .5 : ruin ? 4.6 : 6.2, len, ruin ? '#c9a878' : PAL.lime, -a);
      if (i % 3 === 0 || gate) b.box(Math.cos(a - step / 2) * R, 0, Math.sin(a - step / 2) * R, 3.4, 8.6, 3.4, PAL.stone, -a + step / 2); }
    // the acropolis: a rock, a temple (gold roof when the polis has something adopted)
    const hr = plan.hillR, hh = 7 + Math.min(8, A * .12); b.put(unit.cyl(this.lite ? 8 : 12, .72), 0, 0, 0, hr, hh, hr, '#b3a283', 0, 0, 0, .3);
    const tw = hr * .95, td = hr * .6; b.box(0, hh, 0, tw + 1.6, .7, td + 1.6, PAL.marbleD); b.box(0, hh + .7, 0, tw * .78, tw * .34, td * .7, PAL.marble);
    const nc = this.lite ? 4 : 6; for (let i = 0; i < nc; i++) for (const s of [-1, 1]) b.col(-tw / 2 + .5 + i * (tw - 1) / (nc - 1), hh + .7, s * td / 2, .42, tw * .34, PAL.marble, this.lite);
    if (!ruin) { b.box(0, hh + .7 + tw * .34 + .2, 0, tw + .8, .6, td + .8, PAL.marbleD); b.roof(0, hh + 1.5 + tw * .34, 0, td + 1, tw * .16, tw + .8, plan.gold ? PAL.gold : PAL.terra, Math.PI / 2); }
    plan.topY = hh + 2 + tw * .5;
    for (const D of plan.districts) { const l = Math.hypot(D.x, D.z) || 1, x = D.x / l * (A - 3), z = D.z / l * (A - 3); b.cyl(x, 0, z, .55, 4.6, D.tint, 6, .8); b.box(x, 4.6, z, 1.5, .4, 1.5, PAL.marble); }
    G.add(new THREE.Mesh(own(b.geometry()), this.matVC)); this.polisTris = b.tris;
    // houses: one row each, ONE draw call
    const H = plan.houses, d = new THREE.Object3D(), col = new THREE.Color(), tones = [[1, 1, 1], [.96, .9, .8], [.98, .86, .68], [.96, .8, .72], [1, .94, .82]];
    if (H.length) { const m = this.houseMesh = new THREE.InstancedMesh(ruin ? unit.houseFar() : unit.house(), this.matVC, H.length);   // a ruin: roofless mud-brick walls, some fallen low
      H.forEach((h, i) => { const fall = ruin ? (r() < .3 ? .22 : .55 + r() * .25) : 1; d.position.set(h.x, .1, h.z); d.rotation.set(0, h.rot ? Math.PI / 2 : 0, 0); d.scale.set(h.w, h.h * fall, h.d); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        const t = tones[Math.floor(r() * tones.length)], k = ruin ? [1.08, .92, .7] : HOUSE_TINT[h.tone] || HOUSE_TINT.plain; col.setRGB(t[0] * .35 + k[0] * .65, t[1] * .35 + k[1] * .65, t[2] * .35 + k[2] * .65); m.setColorAt(i, col); });
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.frustumCulled = false; G.add(m); own(m); }
    // cypress and olive trees: in the agora ring and outside the wall
    const nt = Math.round(Math.min(T.trees, 30 + Math.round(R * .9)) * (desert ? .25 : ruin ? .6 : 1)), tb = new Batch(); tb.cone(0, 0, 0, .5, 1, PAL.cypress, this.lite ? 5 : 6);
    const tg = own(tb.geometry()), tm = new THREE.InstancedMesh(tg, this.matVC, nt);
    for (let i = 0; i < nt; i++) { const inner = i % 5 === 0, a = r() * 6.283, rr = inner ? lerp(hr + 3, A - 6, r()) : R + 8 + r() * 62, s = 1.6 + r() * 1.6; if (!inner && Math.abs(a - Math.PI / 2) < .09) { d.scale.setScalar(0); } else d.scale.set(s, s * (inner ? 3.6 : 2 + r() * 2.4), s);
      d.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); d.rotation.set(0, 0, 0); d.updateMatrix(); tm.setMatrixAt(i, d.matrix); if (inner) (plan.trees || (plan.trees = [])).push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: .5 * s, h: s * 3.6 }); /* QA6: the walk camera and the walker go round the cypresses */ if (i % 3) col.setRGB(2.1, 2.3, 1.9); else col.setRGB(2.9, 2.6, 1.9); tm.setColorAt(i, col); }
    tm.instanceMatrix.needsUpdate = true; tm.instanceColor.needsUpdate = true; tm.frustumCulled = false; G.add(tm); own(tm); this.treeMesh = tm;
    // the people (one instanced draw): the KEEPER at the south gate (always), townspeople on the streets around their village (phone-high only)
    this.col = polisCollider(plan); this.npcs = T.npcs && !this.reduced ? polisNpcs(plan, Math.min(T.npcs, plan.villages.length * 3)) : [];
    // their day: walkable distance fields to the market, the temple and the gate (about 20 ms once per polis; LITE has no townspeople, so none)
    if (this.npcs.length) { const pl = routinePlaces(plan); this.routine = { fields: { market: fieldTo(plan, this.col, pl.market), temple: fieldTo(plan, this.col, pl.temple), gate: fieldTo(plan, this.col, pl.gate) }, cache: new Map() }; } else this.routine = null;
    this.gathering = null; this.lookUntil = 0;
    this.people = [{ kind: 'keeper', id: 'keeper:' + p.id, x: 0, z: R - 8, ry: Math.PI, make: () => keeperPerson(p) }];
    this.npcs.forEach((q, k) => { const V = plan.villages[q.village]; this.people.push({ kind: 'towns', id: `towns:${p.id}:${V.idx}:${k}`, loop: q, x: 0, z: 0, ry: 0, make: () => townsPerson(p, V, V.houses.map((h) => plan.houses[h].row), k) }); });
    this.people.forEach((P, i) => { P.i = i; P.look = lookOf(P.id, P.kind === 'keeper' ? 'keeper' : ''); Object.defineProperty(P, 'person', { get() { return P._p || (P._p = P.make()); } }); });
    // QA6: the rigged cast (town-cast.js): photos of the real 3D people far away, full rigged figures near you; the toy figures only until the photos are ready
    this.crowd = makeTownCast(THREE, this.people.map((P) => ({ id: P.id })), { lite: this.lite, looks: this.people.map((P) => P.look), reduced: this.reduced, tint: desert ? '#f6e0bf' : '#f1dcc2',
      surface: (x, z) => (Math.hypot(x, z) < A + 1 ? 'stone' : desert || ruin ? 'sand' : 'stone') }); own(this.crowd); this.npcMesh = this.crowd.mesh; G.add(this.npcMesh); this.talk = null; this.npcTick(0);
    // a city at work: a brazier burns on every district stele (one more draw call)
    if (work && plan.districts.length) { const fm = new THREE.InstancedMesh(own(new THREE.ConeGeometry(.55, 1.5, 5).translate(0, .75, 0)), this.flames ? this.flames.material : this.matRing, plan.districts.length); fm.frustumCulled = false;
      plan.districts.forEach((D, i) => { const l = Math.hypot(D.x, D.z) || 1; d.position.set(D.x / l * (A - 3), 5, D.z / l * (A - 3)); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); fm.setMatrixAt(i, d.matrix); }); fm.instanceMatrix.needsUpdate = true; G.add(fm); own(fm); this.pFlames = fm; } else this.pFlames = null;
    G.visible = false; this.scene.add(G); return plan;
  }
  /** everyone in the polis, on the real clock (hellas-plan.js routineAt): townspeople stroll their street, then go shopping at the agora, praying at the temple or trading at the
   *  gate, and come back; the keeper stands at the gate (a keeper of ruins hangs its head). Heads turn when you start walking, people near you face you, whoever you talk to
   *  stops; for a big number the crowd gathers at the agora and cheers (celebrate). A fixed clock (setClock) = a fixed scene. */
  npcTick(t) {
    if (!this.crowd || !this.people) return; const cp = this.camera.position, sc = this.walk ? 1.08 : 2.5, me = this.walk, still = this.reduced;
    const now = this.clockMs != null ? this.clockMs : Date.now(), sod = ((now / 1000 - new Date(now).getTimezoneOffset() * 60) % 86400 + 86400) % 86400; this.sod = sod;
    const R = this.routine, G = this.gathering && t < this.gathering.until ? this.gathering : null, dt = Math.min(.25, Math.max(0, t - (this._npcT == null ? t : this._npcT))); this._npcT = t;
    for (const P of this.people) {
      const talking = this.talk && this.talk.kind === 'person' && this.talk.i === P.i; let act = P.kind === 'keeper' ? (this.plan && this.plan.ruin ? 'sad' : 'keep') : 'stroll';
      if (P.loop && !talking) {
        let q = R ? routineAt(P.loop, sod, this.plan, R.fields, R.cache) : null;
        if (!q) { const l = npcOnLoop(P.loop, t); q = { x: l.x, z: l.z, yaw: Math.atan2(Math.sin(l.yaw), -Math.cos(l.yaw)), act: 'stroll' }; }
        if (G && P.gpath) { const L = P.glen || 1, leg = Math.max(3, L / 2.2), f = Math.min(1, (t - G.t0) / leg), e = alongPath(P.gpath, f); q = { x: e.x, z: e.z, yaw: f < 1 ? e.yaw : Math.atan2(-e.x, -e.z), act: f < 1 ? 'walk' : 'cheer' }; }
        // nobody jumps: a far target (a gathering ended, the clock moved) is walked to first, briskly
        if (P.x != null && !still && dt > 0 && t > .5) { const dx = q.x - P.x, dz = q.z - P.z, dd = Math.hypot(dx, dz), mx = dt * 3.2; if (dd > mx && dd < 400) { q = { x: P.x + dx / dd * mx, z: P.z + dz / dd * mx, yaw: Math.atan2(dx, dz), act: 'walk' }; } }
        P.x = q.x; P.z = q.z; P.ry = q.yaw; act = q.act;
      }
      const dMe = me ? Math.hypot(me.x - P.x, me.z - P.z) : 1e9, look = !!(me && this.lookUntil && t < this.lookUntil && dMe < 45), near = me && dMe < (P.kind === 'keeper' ? 9 : 5);
      P.facing = talking || near || look; P.act = talking ? 'talk' : near ? 'greet' : look ? 'look' : act;
      const ry = P.facing ? Math.atan2(cp.x - P.x, cp.z - P.z) : P.kind === 'keeper' ? Math.PI : P.ry, w = still ? 0 : 1, ph = P.i * 1.7;
      let y = .1, sq = 1, lean = 0, ryj = 0;
      if (P.act === 'talk') sq = 1 + .035 * Math.sin(t * 9) * w;
      else if (P.act === 'greet') { y += Math.max(0, Math.sin(t * 7 + ph)) * .12 * w * sc; }                         // a little hop: hello
      else if (P.act === 'walk') y += Math.abs(Math.sin(t * 7.5 + ph)) * .05 * w * sc;
      else if (P.act === 'shop') { ryj = Math.sin(t * .7 + ph) * .55 * w; lean = .08; }                              // looking along the stalls
      else if (P.act === 'pray') lean = .12 + .26 * (.5 + .5 * Math.sin(t * 1.1 + ph)) * w + (still ? .2 : 0);    // a slow bow to the temple
      else if (P.act === 'trade') { ryj = Math.sin(t * 1.6 + ph) * .3 * w; sq = 1 + .03 * Math.sin(t * 8 + ph) * w; }
      else if (P.act === 'cheer') { y += Math.abs(Math.sin(t * 6 + ph)) * .3 * w * sc; sq = 1.05; lean = -.12; }
      else if (P.act === 'sad') { lean = .3; sq = .94; }                                                              // the keeper of the ruins hangs its head
      if (this.crowd.act) this.crowd.act(P.i, P.act);
      this.crowd.place(P.i, P.x, y, P.z, ry + (P.facing ? 0 : ryj), sc * (P.kind === 'keeper' ? 1.12 : P.look.height), sq, lean);
    }
    this.crowd.commit();
    if (this.crowd.tick) this.crowd.tick(dt, t, this.camera, me ? { x: me.x, z: me.z } : null);     // the near ones become full rigged figures (and their feet sound)
  }
  /** the life of the polis for the tests and the HUD: clock, how many do what, the gathering */
  lifeState() { const acts = {}; for (const P of this.people || []) acts[P.act || 'stroll'] = (acts[P.act || 'stroll'] || 0) + 1; return { sod: this.sod, clock: this.clockMs == null ? null : this.clockMs, acts, routine: !!this.routine, gathering: !!(this.gathering && this.u.uTime.value < this.gathering.until), people: (this.people || []).length }; }
  /** a fixed moment of the day (ms) or null for the real clock: the same clock gives the same scene */
  setClock(ms) { this.clockMs = ms == null ? null : +ms; if (this.routine) this.routine.cache.clear(); for (const P of this.people || []) P.x = null; this.npcTick(this.u.uTime.value); return this.sod; }
  /** a big number (an eval passed, a new adopted run): everyone within reach walks to the agora along the streets and cheers; confetti and a sound when the kits are there */
  celebrate(text, reach = 260) {
    if (this.level !== 'polis' || !this.people || !this.routine) return 0; const t = this.u.uTime.value, F = this.routine.fields.market; let n = 0;
    for (const P of this.people) { P.gpath = null; if (!P.loop || P.x == null || Math.hypot(P.x, P.z) > reach) continue; const path = pathDown(F, P.x, P.z); if (path && path.length > 1) { P.gpath = path; P.glen = pathLen(path); n++; } }
    this.gathering = { t0: t, until: t + 22, text: text || '', n };
    const sp = this.project(0, 6, 0), at = { x: sp.vis ? sp.x : innerWidth / 2, y: sp.vis ? sp.y : innerHeight * .4, world: [0, 6, 0] };
    try { const FX = window.OLYMPUS_FX; if (this.cine && this.cine.burst) { this.cine.burst('coins', [0, 6, 0], { count: 50 }); this.cine.burst('confetti', [0, 7, 0], { count: 80 }); }   // FX HOOK: coins + confetti over the agora (a new adopted run)
      if (FX && typeof FX.burst === 'function') FX.burst('confetti', at); else if (FX && FX.confetti) FX.confetti(null, { count: 90 }); } catch (e) { /* effects are never needed */ }
    try { const X = window.OLYMPUS_SFX, O = window.OLYMPUS; if (X && typeof X.at === 'function') X.at('cheer', { x: 0, y: 6, z: 0 }, this.camera, { ref: 30, max: 400 }); else if (O && O.sound && typeof O.sound.at === 'function') O.sound.at('cheer', { x: 0, y: 6, z: 0 }); else if (O && O.cue) O.cue('success'); } catch (e) { /* sound is never needed */ }
    return n;
  }
  /** the person near a screen point (a tap), and the people around a spot (the walker), nearest first */
  pickPerson(px, py, radius = 30) { if (!this.people || this.level !== 'polis') return null; const sc = this.walk ? 1.08 : 2.5; let best = null, bd = radius; for (const P of this.people) { const q = this.project(P.x, sc * .9, P.z); if (!q.vis) continue; const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = P; } } return best; }
  peopleNear(x, z, max = 4, within = 30) { if (!this.people || this.level !== 'polis') return []; return this.people.map((P) => ({ P, d: Math.hypot(P.x - x, P.z - z) })).filter((e) => e.d <= within).sort((a, b) => a.d - b.d).slice(0, max); }
  /** who is being talked to: { kind: 'person', i } in a polis, { kind: 'builder', i } on the world; null ends it */
  setTalk(tk) { this.talk = tk || null; if (this.crowd && this.crowd.talk) this.crowd.talk(tk && tk.kind === 'person' ? tk.i : -1); if (this.level === 'world') this.lifeTick(this.u.uTime.value, true); else this.npcTick(this.u.uTime.value); }

  setStage(level) {
    this.level = level; const world = level === 'world'; this.wg.visible = world; if (this.pg) this.pg.visible = !world;
    const fd = world ? .00005 : .0011; this.scene.fog.density = fd; this.seaU.uFogD.value = fd; this.seaU.uScale.value = world ? .12 : 1; this.select(null);
    this.camera.near = world ? 2 : 1; this.camera.far = world ? 16000 : 6000; this.camera.updateProjectionMatrix();
  }
  /** fly to the marker, swap the stage (onSwap lets the page dip a veil), come down over the new city. then() fires when the camera rests. */
  enterPolis(p, o = {}) {
    if (this.walk) this.stopWalk();
    const swap = () => { this.wcam = { ...(this.level === 'world' ? this.cam : this.wcam), tx: p.x, ty: 0, tz: p.z, dist: 420, pitch: .95 }; const plan = this.buildPolis(p); this.setStage('polis');
      const R = plan.R, to = { tx: 0, ty: 4, tz: 0, yaw: .5, pitch: .62, dist: clamp(R * 2.5, 150, 760) }; this.cam = { ...to, dist: to.dist * 2.4, pitch: 1.1, yaw: to.yaw - .7 }; o.onSwap && o.onSwap(plan);
      this.flyCam(to, { dur: 1.5, then: o.then }); };
    if (this.level === 'world' && !this.reduced && !o.instant) this.flyTo(p.x, p.z, { dist: 150, pitch: .8, dur: 1.15, then: swap }); else swap();
  }
  leavePolis(o = {}) { if (this.level !== 'polis') return; if (this.walk) this.stopWalk(); const back = { ...this.wcam }; this.setStage('world'); this.disposePolis(); this.cam = { ...back, dist: 150, pitch: .8 }; this.flyCam({ ...back, dist: o.dist || 520 }, { dur: 1.2, then: o.then }); }

  // ------------------------------------------------------------------ camera
  limits() { const B = this.world.bounds; return this.level === 'world' ? { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, d0: 90, d1: this.home.dist * 1.25 } : { x0: -this.plan.R, x1: this.plan.R, z0: -this.plan.R, z1: this.plan.R, d0: 16, d1: this.plan.R * 6 + 300 }; }
  placeCamera() { const c = this.cam, cp = Math.cos(c.pitch); this.camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist); if (this.camera.position.y < 3) this.camera.position.y = 3; this.camera.lookAt(c.tx, c.ty, c.tz); }
  orbit(dx, dy) { const c = this.cam; this.fly = null; c.yaw -= dx * .0062; c.pitch = clamp(c.pitch + dy * .0052, .12, 1.45); }
  zoom(f) { const c = this.cam, L = this.limits(); this.fly = null; c.dist = clamp(c.dist * f, L.d0, L.d1); }
  pan(dx, dy) { const c = this.cam, L = this.limits(), s = c.dist * .0019, rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); this.fly = null;
    c.tx = clamp(c.tx - (rx * dx + fx * -dy) * s, L.x0, L.x1); c.tz = clamp(c.tz - (rz * dx + fz * -dy) * s, L.z0, L.z1); }
  flyCam(to, o = {}) { const c = this.cam; let yaw = to.yaw ?? c.yaw; yaw = c.yaw + (((yaw - c.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI); this.fly = { from: { ...c }, to: { ...c, ...to, yaw }, t: 0, dur: this.reduced ? .01 : o.dur ?? 1.4, then: o.then, arc: o.arc ?? .18 }; }
  flyTo(x, z, o = {}) { this.flyCam({ tx: x, tz: z, ty: o.y ?? (this.level === 'world' ? 0 : 3), dist: o.dist ?? 200, pitch: o.pitch ?? this.cam.pitch, yaw: o.yaw }, o); }
  goHome(o = {}) { this.flyCam(this.home, { dur: 1.5, ...o }); }
  resize() {
    const w = this.canvas.clientWidth || 390, h = this.canvas.clientHeight || 844, O = window.OLYMPUS, dpr = Math.min(this.T.dpr, O && O.dpr ? O.dpr(this.lite) : (window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = h > w ? 62 : 50; this.camera.updateProjectionMatrix(); this.w = w; this.h = h;
    const B = this.world.bounds, tv = Math.tan(this.camera.fov * Math.PI / 360), th = tv * this.camera.aspect; this.home.dist = Math.max(B.w / 2 / th * 1.08, B.h / 2 / tv * .62); if (this.level === 'world' && !this.frameCount) this.cam.dist = this.home.dist;
  }
  project(x, y, z) { const v = (this._v || (this._v = new THREE.Vector3())).set(x, y, z).project(this.camera); return { x: (v.x * .5 + .5) * this.w, y: (-v.y * .5 + .5) * this.h, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }; }
  pickPolis(px, py, radius = 34) { let best = null, bd = radius; for (const p of this.world.poleis) { const q = this.project(p.x, 3, p.z); if (!q.vis) continue; const d = Math.hypot(q.x - px, q.y - py) - (p.capital ? 8 : 0); if (d < bd) { bd = d; best = p; } } return best; }
  pickBuilder(px, py, radius = 30) { if (!this.builderPos || this.level !== 'world') return null; let best = null, bd = radius; this.builders.forEach((b) => { const q = this.project(this.builderPos[b.i].x, 4, this.builderPos[b.i].z); if (!q.vis) return; const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = b; } }); return best; }
  pickHouse(px, py, radius = 30) { if (!this.plan) return null; let best = null, bd = radius; for (const h of this.plan.houses) { const q = this.project(h.x, h.h * .6, h.z); if (!q.vis) continue; const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = h; } } return best; }
  select(o) { this.sel = o; this.ring.visible = !!o; if (!o) return; const r = o.selR || 10; this.ring.position.set(o.x, this.level === 'world' ? 3 : .5, o.z); this.ring.scale.setScalar(r); }
  /** the labels the page draws: region names from far away, the nearest city names closer; districts then villages inside a polis */
  labels(max = 7) {
    const out = [], c = this.cam, near = (list, pos, n) => list.map((o) => [Math.hypot(pos(o)[0] - c.tx, pos(o)[1] - c.tz), o]).sort((a, b) => a[0] - b[0]).slice(0, n).map((e) => e[1]);
    const put = (x, y, z, text, kind, ref) => { const q = this.project(x, y, z); if (q.vis) out.push({ x: q.x, y: q.y, text, kind, ref }); };
    if (this.walk) { for (const e of this.peopleNear(this.walk.x, this.walk.z, 3, 24)) { put(e.P.x, 1.85, e.P.z, e.P.person.short, 'person ' + e.P.kind, e.P); } return out; }
    if (this.level === 'world') {
      if (c.dist > 1100) for (const R of this.world.regions) put(R.cx, 20, R.cz, R.name, 'region', R);
      else { near(this.world.poleis, (p) => [p.x, p.z], max).forEach((p, i) => { put(p.x, 8 + p.mr * .5, p.z, p.name, (p.capital ? 'capital' : 'polis') + ' ' + p.activity.state, p); if (i < 1 && c.dist < 560 && out.length && out[out.length - 1].ref === p) out[out.length - 1].sub = p.activity.doing; });
        if (c.dist < 900 && this.builderPos) near(this.builders, (b) => [this.builderPos[b.i].x, this.builderPos[b.i].z], 3).forEach((b) => { const q = this.builderPos[b.i]; put(q.x, 9, q.z, b.name, 'builder', b); if (out.length && out[out.length - 1].ref === b) out[out.length - 1].sub = (c.dist < 420 ? b.job + ' · ' : '') + 'to ' + b.site; }); }
    } else if (this.plan) {
      if (c.dist < Math.max(170, this.plan.R * 1.3)) for (const e of this.peopleNear(c.tx, c.tz, 3, Math.max(60, c.dist * .5))) put(e.P.x, 5, e.P.z, e.P.person.short, 'person ' + e.P.kind, e.P);
      if (this.polis && this.polis.activity && c.dist > this.plan.R * .8) { put(0, (this.plan.topY || 20) + 6, 0, this.polis.name, 'banner ' + this.polis.activity.state, this.polis); if (out.length) out[out.length - 1].sub = this.polis.activity.doing; }
      if (c.dist > this.plan.R * 1.1 || this.plan.villages.length <= 1) for (const D of this.plan.districts) put(D.x, 12, D.z, D.name, 'district', D);
      else for (const V of near(this.plan.villages, (v) => [v.x, v.z], max)) put(V.x, 11, V.z, V.name, 'village', V);
    }
    return out;
  }

  // ------------------------------------------------------------------ walking (the Athens walker: athens-world.js walkStep)
  startWalk(x, z, yaw = 0) { if (!this.col) return false; const s = this.plan.start; if (x == null || this.col.hits(x, z)) { x = s.x; z = s.z; yaw = s.yaw; } this.fly = null; this.camera.near = .35; this.camera.updateProjectionMatrix();
    this.walk = { x, z, yaw, pitch: -.03, input: { fwd: 0, side: 0, run: false }, bob: 0, y: EYE, dist: 0 }; this.select(null); this.lookUntil = this.u.uTime.value + 2.6; return true; }   // heads turn as you arrive
  stopWalk() { if (!this.walk) return; const w = this.walk; this.walk = null; this.camera.near = 1; this.camera.updateProjectionMatrix(); const c = this.cam; c.tx = w.x; c.tz = w.z; c.ty = 3; c.dist = 110; c.pitch = .6; c.yaw = w.yaw + Math.PI; }
  walkLook(dx, dy) { const w = this.walk; if (!w) return; w.yaw += dx * .0055; w.pitch = clamp(w.pitch - dy * .0045, -1, .9); }
  walkTick(dt) { if (this.walkDirector && this.walkDirector.tick(dt)) return;     // SCENE DIRECTION HOOK (walk-direct.js): third person, tap-to-walk, the conversation camera
    const w = this.walk, r = walkStep(w, w.input, dt, this.col); w.x = r.x; w.z = r.z; w.dist += r.moved; w.bob += r.moved * 2.1; const bob = this.reduced ? 0 : Math.sin(w.bob) * .035, cp = Math.cos(w.pitch);
    this.camera.position.set(w.x, w.y + bob, w.z); this.camera.lookAt(w.x + Math.sin(w.yaw) * cp, w.y + bob + Math.sin(w.pitch), w.z - Math.cos(w.yaw) * cp); }
  get walking() { return !!this.walk; }

  frame(dt, t) {
    this.u.uTime.value = t; this.frameCount++;
    if (this.fly) { const f = this.fly, c = this.cam; f.t += dt / f.dur; const k = Math.min(1, f.t), e = k * k * (3 - 2 * k);
      for (const key of ['tx', 'ty', 'tz', 'yaw', 'pitch']) c[key] = lerp(f.from[key], f.to[key], e);
      c.dist = Math.exp(lerp(Math.log(f.from.dist), Math.log(f.to.dist), e)) * (1 + Math.sin(k * Math.PI) * f.arc);
      if (k >= 1) { this.fly = null; f.then && f.then(); } }
    if (this.walk) this.walkTick(dt); else this.placeCamera();
    this.camera.updateMatrixWorld();
    if (this.level === 'world') { this.setMarkerScale(clamp(this.cam.dist / 1100, 1, 1.75)); if (!this.reduced) { this.shipsTick(t); this.lifeTick(t); } if (this.ships) this.ships.visible = this.cam.dist < 2600; }
    else { const far = !this.walk && this.cam.dist > this.plan.R * 3.2; if (this.npcMesh) { this.npcMesh.visible = !far; if (!far) this.npcTick(t); } if (this.treeMesh) this.treeMesh.visible = !(this.lite && far); if (this.pFlames && !this.reduced) this.pFlames.scale.y = 1 + .14 * Math.sin(t * 9); }
    if (this.sel && !this.reduced) this.ring.scale.setScalar((this.sel.selR || 10) * (1 + Math.sin(t * 3) * .04));
    if (this.cine) this.cine.frame(dt, t);                                        // FX HOOK: the gulls and the sand move
    this.renderer.render(this.scene, this.camera);
    this.calls = this.renderer.info.render.calls; this.trisDrawn = this.renderer.info.render.triangles;
  }
  dispose() { this.dead = true; if (this.cine) this.cine.dispose(); this.disposePolis(); for (const o of this.keep) o.dispose && o.dispose(); for (const m of [this.base, this.blocks, this.acro, this.ships, this.shadows, this.flames, this.smoke, this.caravan]) m && m.dispose(); if (this.builderCrowd) this.builderCrowd.dispose(); if (this.ek) this.ek.dispose(); this.renderer.dispose(); }
}
