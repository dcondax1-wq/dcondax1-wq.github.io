// THE TOWN CAST (QA round 6, 2026-11-11): the people of Hellas and Athens are the rigged cast (olympus/people3d.js figure v3, the KayKit Adventurers
// dressed as our people) instead of the small blocky figures. Three levels, one API (the old people-fig.js makeCrowd calls keep working):
//   far    one draw call of camera-facing photos of every person (people-studio.js atlas with views: front, back, two walking profiles), chosen per person
//          from where they face against where the camera is, mirrored for left / right, a walking bob; tinted to the scene's light
//   near   the few people closest to you (walking: within 13 m; up to 4 on high, 2 on LITE) and whoever you talk to become full rigged figures: they walk,
//          wave, cheer, bow, turn their head to you and talk with their mouth (2 draw calls each, about 5-7k triangles)
//   none   until the photos are ready, or with no WebGL studio / no cast (?rig=0, a failed load): the old toy figures (people-fig.js) stay. Never blank.
// Footsteps: the near people's feet touch the ground on a stride clock: OLYMPUS_SFX.walker(person).step(pos, listener, { surface }); someone who turns
// to greet you answers with their presence (keys, coins, bronze ...). The sound engine itself honours mute, LITE, reduced motion and the first tap.
//   makeTownCast(THREE, people:[{ id, spec?, kind? }], { lite, scene, looks, surface(x, z), closeMax, closeR, tint }) ->
//     { mesh, count, place(i, x, y, z, ry, s, squash, lean), act(i, name), commit(), tick(dt, t, camera, focus), figureOf(i), talk(i | -1), stats(), dispose() }
import * as THREE from '../jarvis/three.module.min.js';
import { makeCrowd } from './people-fig.js';

const UNIT = 1.25;        // a place() scale of 1 = a rigged person 1.25 tall (the old toy figures were 1.3 at scale 1, your own character is 1.25)
const POSE_OF = { walk: 'walk', stroll: 'walk', idle: 'idle', keep: 'idle', look: 'idle', greet: 'idle', talk: 'idle', shop: 'idle', trade: 'talk', pray: 'slump', sad: 'slump', cheer: 'cheer' };
const MOVING = { walk: 1, stroll: 1 };
let P3p = null;
const people3d = () => (P3p || (P3p = import('../olympus/people3d.js').catch(() => null)));
let STp = null;
const studio = () => (STp || (STp = import('../olympus/people-studio.js').catch(() => null)));
const SFX = () => { try { return typeof window !== 'undefined' ? window.OLYMPUS_SFX || null : null; } catch (_) { return null; } };
const rigOff = () => { try { return window.OLYMPUS_RIG === false || /[?&]rig=0\b/.test(location.search); } catch (_) { return true; } };

/** the listener for the sound engine: where the camera is and which way it looks (sfx.js toLocal reads position + forward) */
const fwd = new THREE.Vector3();
export function listenerOf(camera) { if (!camera) return null; camera.getWorldDirection(fwd); return { position: camera.position, forward: { x: fwd.x, y: fwd.y, z: fwd.z } }; }

// ------------------------------------------------------------------------------------------------ the far crowd: photos of the rigged people
const VS = `attribute vec2 aCell;
attribute vec4 aInfo;
uniform float uTime;
uniform vec4 uGrid;
varying float vFade;`;
function impostorMesh(A, n, tint, cellOf) {
  const tex = new THREE.CanvasTexture(A.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2), info = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  for (let i = 0; i < n; i++) cell.setXY(i, (cellOf ? cellOf[i] : i) * A.frames, A.frames >= 5 ? 1 : 0);
  geo.setAttribute('aCell', cell); geo.setAttribute('aInfo', info);
  const uni = { uTime: { value: 0 }, uGrid: { value: new THREE.Vector4(A.cols, A.rows, 0, 0) }, uTint: { value: new THREE.Color(tint || '#ffffff') } };
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = VS + '\n' + sh.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vec3 inst = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); camR.y = 0.0; camR = normalize(camR + vec3(1e-5, 0.0, 0.0));
  vec3 wInst = (modelMatrix * vec4(inst, 1.0)).xyz;
  vec2 toCam = normalize(cameraPosition.xz - wInst.xz + vec2(1e-4, 0.0)), face = vec2(sin(aInfo.x), cos(aInfo.x));
  float fd = dot(face, toCam), st = aInfo.y, fr = 0.0, mir = 0.0;
  if (aCell.y > 0.5) {
    if (st > 0.5 && st < 1.5) fr = 1.0;                                   // talking: the talking photo, always from the front
    else if (st > 1.5 && abs(fd) < 0.55) { fr = 3.0 + step(0.5, fract(uTime * 1.7 + aInfo.z)); mir = step(dot(face, camR.xz), 0.0); }   // walking across: the profile, two strides
    else if (fd < (st > 1.5 ? -0.55 : -0.3)) fr = 2.0;                    // from behind
  } else fr = st > 0.5 && st < 1.5 ? 1.0 : 0.0;
  float k = aCell.x + fr; float col = mod(k, uGrid.x), row = floor(k / uGrid.x);
  float ux = mix(uv.x, 1.0 - uv.x, mir);
  vMapUv = vec2((col + ux) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);`)
      .replace('#include <project_vertex>', `float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  float bob = st > 1.5 ? abs(sin((uTime * 1.7 + aInfo.z) * 6.2832)) * 0.035 * sy : 0.0;
  float breathe = 1.0 + 0.012 * sin(uTime * 1.7 + aCell.x * 1.3);
  vec4 wpos = modelMatrix * vec4(inst, 1.0) + vec4(camR * position.x * sx + vec3(0.0, position.y * sy * breathe + bob, 0.0), 0.0);
  vec4 mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uTint;');
  };
  mat.customProgramCacheKey = () => 'olympus-town-cast-v1';
  const im = new THREE.InstancedMesh(geo, mat, n); im.name = 'town-cast-photos'; im.frustumCulled = false;
  return { im, cell, info, uni, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); im.dispose(); } };
}

export function makeTownCast(THREE_, people, opts) {
  const o = opts || {}, lite = !!o.lite, n = people.length, closeMax = o.closeMax != null ? o.closeMax : lite ? 2 : 4, closeR = o.closeR || 13;
  const group = new THREE.Group(); group.name = 'town-cast';
  // the placeholder (and the fallback): the old toy figures in one draw
  const toy = makeCrowd(o.looks || people.map(() => ({ skin: '#e2b08a', hair: '#5a3a22', outfit: '#c8a24a' })), { lite: true });
  group.add(toy.mesh);
  const slots = people.map((p, i) => ({ i, id: p.id, x: 0, y: 0, z: 0, ry: 0, s: 1, sq: 1, lean: 0, act: 'idle', fig: null, phase: (i * 0.618) % 1, stride: 0, greeted: false, walker: null, spec: null, src: p }));
  const S = { P3: null, specs: null, far: null, gone: false, rig: false, talkI: -1, closeN: 0, sounds: 0, steps: 0, presence: 0, built: 0, status: 'toy', tint: new THREE.Color(o.tint || '#ffffff') };
  const spare = new Map();
  function loadRig() { if (S.rigAsked || !S.P3) return; S.rigAsked = true; S.P3.loadRig().then((ok) => { if (!S.gone) S.rig = !!ok; }); }
  // load the cast (for the near figures) and photograph everyone (the far crowd); either may fail: the toys stay
  if (n && !rigOff()) people3d().then((P3) => {
    if (!P3 || S.gone) return; S.P3 = P3;
    S.specs = people.map((p) => { try { return P3.spec(p.spec || p.id); } catch (_) { return P3.spec('someone'); } });
    slots.forEach((sl, i) => { sl.spec = S.specs[i]; });
    if (!lite) loadRig();                               // LITE loads the cast (497 KB) only when someone comes close or you talk (tick)
    if (lite) return;                                   // LITE: no photo studio (a second WebGL context); the toys stay far, the rigged figures come close
    S.status = 'photographing';
    // one photo set per look: villagers of one village share their village's look (Athens: 80 people, about 50 looks)
    const uniq = new Map(), uspecs = [], cellOf = people.map((p, i) => { const key = String(p.id); if (!uniq.has(key)) { uniq.set(key, uspecs.length); uspecs.push(S.specs[i]); } return uniq.get(key); });
    studio().then((ST) => (ST && ST.atlas ? ST.atlas(uspecs, { views: true, cell: uspecs.length > 40 ? [80, 100] : [96, 120] }) : null)).then((A) => {
      if (!A || S.gone) { S.status = 'toy'; return; }
      S.far = impostorMesh(A, n, o.tint, cellOf); S.looks = uspecs.length; S.far.uni.uTint.value.copy(S.tint); group.add(S.far.im); toy.mesh.visible = false; S.status = 'photos';
      for (let i = 0; i < n; i++) put(i);
      try { group.dispatchEvent({ type: 'photos' }); } catch (_) { /* fine */ }
    }).catch(() => { S.status = 'toy'; });
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  function put(i) {
    const F = S.far; if (!F) return; const sl = slots[i], k = sl.s * UNIT, hide = !!sl.fig;
    pv.set(sl.x, sl.y - 0.04 * k, sl.z); sv.set(hide ? 0 : 1.0 * k, hide ? 0 : 1.25 * k * sl.sq, 1); F.im.setMatrixAt(i, m4.compose(pv, q, sv));
    F.info.setXYZW(i, sl.ry, sl.act === 'talk' || sl.act === 'trade' ? 1 : MOVING[sl.act] ? 2 : 0, sl.phase, 1);
  }
  /** same as the toy crowd: s = 1 is a person about 1.25 tall; squash < 1 bows, lean is a bow forward (radians) */
  function place(i, x, y, z, ry, s, squash, lean) {
    const sl = slots[i]; if (!sl) return; sl.x = x; sl.y = y; sl.z = z; sl.ry = ry || 0; sl.s = s || 1; sl.sq = squash || 1; sl.lean = lean || 0;
    toyPut(i); put(i);
  }
  function toyPut(i) { const sl = slots[i]; toy.place(i, sl.x, sl.fig ? -999 : sl.y, sl.z, sl.ry, sl.fig ? 1e-4 : sl.s, sl.sq, sl.lean); }
  function act(i, name) { const sl = slots[i]; if (sl) sl.act = name || 'idle'; }
  function commit() { toy.commit(); if (S.far) { S.far.im.instanceMatrix.needsUpdate = true; S.far.info.needsUpdate = true; } }
  // ---- near: full rigged figures
  function closeUp(i) {
    const sl = slots[i]; if (sl.fig) return sl.fig; if (!S.P3 || !S.rig) return null;
    let f = spare.get(i); if (f) { spare.delete(i); f.visible = true; }
    else { try { f = S.P3.figure(THREE, sl.spec, { lite }); } catch (_) { return null; } group.add(f); S.built++; }
    sl.fig = f; sl.pose = ''; sl.greeted = false; S.closeN++; put(i); toyPut(i); toy.commit(); return f;
  }
  function dropClose(i) {
    const sl = slots[i], f = sl.fig; if (!f) return; sl.fig = null; S.closeN--; f.visible = false; spare.set(i, f); put(i); toyPut(i); toy.commit();
    while (spare.size > Math.max(2, closeMax)) { const [k, g] = spare.entries().next().value; spare.delete(k); try { g.userData.dispose(); } catch (_) { /* gone */ } }
  }
  const tmpV = new THREE.Vector3();
  function drive(sl, dt, t, cam, L) {
    const f = sl.fig, P = S.P3, k = sl.s * UNIT; if (!f || !P) return;
    f.position.set(sl.x, sl.y, sl.z); f.rotation.set(sl.lean * 0.35, sl.ry, 0, 'YXZ'); f.scale.set(k, k * Math.max(0.9, sl.sq), k);
    let pose = POSE_OF[sl.act] || 'idle';
    if (sl.act === 'greet' && !sl.greeted) { sl.greeted = true; pose = 'wave'; try { P.play(f, 'wave', { then: 'idle' }); } catch (_) { /* fine */ } sl.pose = 'idle';
      const X = SFX(); if (X && X.presence && L) { if (X.presence(sl.spec, { x: sl.x, y: sl.y + 0.9 * k, z: sl.z }, L, { k: 0.45 })) S.presence++; } }
    if (sl.act !== 'greet' && sl.act !== 'look') sl.greeted = false;
    if (pose !== 'wave' && sl.pose !== pose) { sl.pose = pose; try { P.play(f, pose); } catch (_) { /* fine */ } }
    const talking = sl.act === 'talk' || S.talkI === sl.i;
    if (!!f.userData.townTalk !== talking) { f.userData.townTalk = talking; try { P.setTalking(f, talking); } catch (_) { /* fine */ } }
    const face = sl.act === 'greet' || sl.act === 'look' || talking;
    try { P.lookAt(f, face && cam ? tmpV.set(cam.position.x, cam.position.y, cam.position.z) : null); } catch (_) { /* fine */ }
    if (!o.reduced) P.animate(f, dt);
    // footsteps: one on each half stride while they walk (about 1.1 strides a second at this size)
    if (MOVING[sl.act] && L && dt > 0) {
      sl.stride += dt * 2.3; if (sl.stride >= 1) { sl.stride -= 1; const X = SFX(); if (X && X.walker) { sl.walker = sl.walker || X.walker(sl.spec || { kind: 'villager' }); if (sl.walker.step({ x: sl.x, y: sl.y, z: sl.z }, L, { surface: o.surface ? o.surface(sl.x, sl.z) : 'stone', k: 0.4 })) S.steps++; } }
    }
  }
  /** every frame: who is close enough to be a full figure, their poses, the far crowd's clock. focus = { x, z } (you), or null (no one comes close) */
  function tick(dt, t, cam, focus) {
    if (S.gone) return;
    if (S.far) S.far.uni.uTime.value = t || 0;
    const L = cam ? listenerOf(cam) : null;
    if (!S.rig && S.P3 && !S.rigAsked && (S.talkI >= 0 || (focus && slots.some((sl) => Math.hypot(sl.x - focus.x, sl.z - focus.z) < closeR)))) loadRig();
    if (S.rig && S.P3) {
      const want = [];
      if (focus) for (const sl of slots) { const d = Math.hypot(sl.x - focus.x, sl.z - focus.z); if (d < (sl.fig ? closeR * 1.2 : closeR)) want.push([d, sl.i]); }
      want.sort((a, b) => a[0] - b[0]);
      const keep = new Set(want.slice(0, closeMax).map((e) => e[1])); if (S.talkI >= 0) keep.add(S.talkI);
      for (const sl of slots) if (sl.fig && !keep.has(sl.i)) dropClose(sl.i);
      for (const i of keep) closeUp(i);
    }
    for (const sl of slots) if (sl.fig) drive(sl, dt, t, cam, L);
    if (S.far) S.far.im.instanceMatrix.needsUpdate = true;
  }
  return {
    mesh: group, group, count: n, tris: toy.tris, slots,
    place, act, commit, tick,
    /** the person you talk to is always a full figure (and talks); -1 = nobody */
    talk(i) { S.talkI = i == null ? -1 : i; if (S.talkI >= 0 && S.rig) closeUp(S.talkI); return S.talkI >= 0 ? slots[S.talkI].fig : null; },
    figureOf: (i) => (slots[i] ? slots[i].fig : null),
    /** the light of the scene (a dusk town is darker): multiplies the photos */
    setTint(c) { S.tint.set(c); if (S.far) S.far.uni.uTint.value.copy(S.tint); },
    stats: () => ({ status: S.status, rig: S.rig, looks: S.looks || 0, close: S.closeN, built: S.built, photos: !!S.far, steps: S.steps, presence: S.presence, drawCalls: (S.far ? 1 : toy.mesh.visible ? 1 : 0) + S.closeN * 2 }),
    dispose() { S.gone = true; toy.dispose(); if (S.far) S.far.dispose(); for (const sl of slots) if (sl.fig) { try { sl.fig.userData.dispose(); } catch (_) { /* gone */ } } for (const f of spare.values()) { try { f.userData.dispose(); } catch (_) { /* gone */ } } spare.clear(); if (group.parent) group.parent.remove(group); },
  };
}
