// The OLYMPUS courtyard (2026-11-10, AGORA; v2 2026-11-11: the hero of the Jarvis home). Five tall marble doorways stand in a shallow arc on the
// horizon, one for each district of the Atlas map (Market, Research, Money, Command, Life), each with a soft warm light inside it that grows
// stronger when that district needs the owner (setNeeds). A paved floor and four columns around them. Added by home3d.js to THAT scene (no
// renderer, composer or render target of its own: the GPU guard stays true). home3d.js frames it in the hero's window (a lens shift).
//
//   attach(ext, home)   builds it and returns { doors, count, draws, lite, dims, setNeeds(needs) }; also stored as ext.state.home.courtyard
//   DISTRICTS           the five districts and their soft tints (the same order and names as Atlas and the orb's ring menu)
//
// Cost: instanced meshes only (a golden-hour haze, frames, lintels, gold fillets, lights, paving, columns, capitals: 8 draw calls).
// LITE (data-fx low / off, software GL): nothing is built; the painted courtyard in the page (index.html #courtArt: a gradient sky and SVG
// doorways) stands in, and <html data-court> says which one is showing ('3d' | 'lite').
// Off / reduced motion: still (no per-frame work). Light is warm (about 3000 K) and additive at low strength: 0.16 at rest and at most 0.42 for a
// doorway that needs you, so nothing here reaches the bloom threshold (0.9). iPhone Safari 16: plain ES2020, no optional chaining.

export const DISTRICTS = [
  { id: 'market', name: 'Market', tint: '#d9b25a' },
  { id: 'research', name: 'Research', tint: '#7fa3b8' },
  { id: 'money', name: 'Money', tint: '#a3ad6a' },
  { id: 'command', name: 'Command', tint: '#c98a6a' },
  { id: 'life', name: 'Life', tint: '#e0b060' },
];
export const NEED_GAIN = { '': 1, warn: 2.1, bad: 2.6 };          // how much stronger a doorway's light is when its district needs you
export const NEED_TINT = { warn: '#ffcf7a', bad: '#f08a60' };

export function attach(ext, home) {
  const T = ext.T, M = ext.M, scene = ext.scene, root = ext.root;
  const lite = !!(home && home.soft) || root.dataset.fx === 'low' || root.dataset.fx === 'off';
  const FLOOR_Y = -2.6, Z = -28, N = DISTRICTS.length;
  const W = 2.5, H = 5.6, SP = 3.7;                    // a doorway: opening width and height, the spacing between doorways (tall: they cross the horizon)
  const xs = []; for (let i = 0; i < N; i++) xs.push((i - (N - 1) / 2) * SP);
  const zOf = (i) => Z - Math.abs(i - (N - 1) / 2) * 0.5;   // the outer doorways stand a little farther back: a shallow arc
  const out = { doors: DISTRICTS.map((d, i) => ({ id: d.id, name: d.name, x: xs[i] })), count: N, draws: 0, lite, group: null,
    dims: { floorY: FLOOR_Y, z: Z, top: FLOOR_Y + H + 0.78 }, needs: {}, setNeeds() {} };
  if (home) home.courtyard = out;
  if (lite) { root.dataset.court = 'lite'; return out; }           // LITE: the painting in the page is the courtyard

  const moving = () => root.dataset.fx !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the hero is never lost in the haze or the night: plain marble and gold with no fog and a warm light of their own (lamplit, always readable,
  // far under the bloom threshold); the scene's sun still shades them by day
  const marble = new T.MeshStandardMaterial({ color: '#d8ccb4', roughness: 0.62, metalness: 0, emissive: '#8f7b5c', emissiveIntensity: 0.62, fog: false });
  const gold = new T.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.4, metalness: 0.5, emissive: '#7a5a20', emissiveIntensity: 0.7, fog: false });
  const group = new T.Group(); group.name = 'courtyard'; scene.add(group); out.group = group;
  const at = new T.Object3D(), warm = new T.Color('#ffd9a0'), tmp = new T.Color();
  let draws = 0;
  const inst = (geo, mat, n, order) => { const m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = false; if (order != null) m.renderOrder = order; group.add(m); draws++; return m; };

  // golden hour behind the doorways, whatever the clock says: one soft amber haze on the horizon (additive, 0.4 at most: no bloom)
  const haze = inst(new T.PlaneGeometry(64, 13), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; void main(){ float x = abs(vU.x - 0.5) * 2.0; float a = pow(1.0 - vU.y, 1.7) * (1.0 - x * x); gl_FragColor = vec4(vec3(1.0, 0.60, 0.26) * a * 0.4, 1.0); }' }), 1, -10);
  at.position.set(0, FLOOR_Y + 6.5, Z - 4); at.updateMatrix(); haze.setMatrixAt(0, at.matrix); haze.instanceMatrix.needsUpdate = true;

  // jambs (two per doorway) and the lintel with its gold fillet
  const jambs = inst(new T.BoxGeometry(0.48, H, 0.8), marble, N * 2);
  const lintels = inst(new T.BoxGeometry(W + 1.48, 0.6, 0.92), marble, N);
  const fillets = inst(new T.BoxGeometry(W + 1.0, 0.12, 1.0), gold, N);
  function placeDoors(f) {
  for (let i = 0; i < N; i++) {
    const x = xs[i] * f, z = zOf(i);
    at.rotation.set(0, 0, 0); at.scale.set(1, 1, 1);
    at.position.set(x - (W / 2 + 0.24), FLOOR_Y + H / 2, z); at.updateMatrix(); jambs.setMatrixAt(i * 2, at.matrix);
    at.position.set(x + (W / 2 + 0.24), FLOOR_Y + H / 2, z); at.updateMatrix(); jambs.setMatrixAt(i * 2 + 1, at.matrix);
    at.position.set(x, FLOOR_Y + H + 0.3, z); at.updateMatrix(); lintels.setMatrixAt(i, at.matrix);
    at.position.set(x, FLOOR_Y + H + 0.66, z); at.updateMatrix(); fillets.setMatrixAt(i, at.matrix);
  }
  }
  placeDoors(1);
  // the light inside each doorway: a soft warm panel that is brightest low and fades upward, tinted a little by the district (mostly warm white);
  // iAmp is its strength per doorway (1 at rest, more when the district needs you)
  const lightMat = new T.ShaderMaterial({
    uniforms: { uI: { value: 0.16 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: 'attribute vec3 iCol; attribute float iAmp; varying vec2 vU; varying vec3 vC; void main(){ vU = uv; vC = iCol * iAmp; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uI; varying vec2 vU; varying vec3 vC; void main(){ float x = abs(vU.x - 0.5) * 2.0; float a = (1.0 - pow(x, 3.0)) * (0.35 + 0.65 * pow(1.0 - vU.y, 1.4)); gl_FragColor = vec4(vC * a * uI, 1.0); }',
  });
  const lights = inst(new T.PlaneGeometry(W, H), lightMat, N, 5);
  const iCol = new Float32Array(N * 3), iAmp = new Float32Array(N).fill(1), want = new Float32Array(N).fill(1);
  const restCol = (i) => tmp.set(DISTRICTS[i].tint).lerp(warm, 0.55);
  for (let i = 0; i < N; i++) { restCol(i); iCol.set([tmp.r, tmp.g, tmp.b], i * 3); }
  const placeLights = (f) => { at.scale.set(1, 1, 1); for (let i = 0; i < N; i++) { at.position.set(xs[i] * f, FLOOR_Y + H / 2, zOf(i) - 0.1); at.updateMatrix(); lights.setMatrixAt(i, at.matrix); } };
  placeLights(1);
  const colAttr = new T.InstancedBufferAttribute(iCol, 3), ampAttr = new T.InstancedBufferAttribute(iAmp, 1);
  lights.geometry.setAttribute('iCol', colAttr); lights.geometry.setAttribute('iAmp', ampAttr);

  // the paving and the four columns
  const COLS = 9, ROWS = 3, slabs = inst(new T.BoxGeometry(2.8, 0.08, 2.8), marble, COLS * ROWS);
  let k = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    at.position.set((c - (COLS - 1) / 2) * 2.92, FLOOR_Y + 0.04, Z + 2.6 - r * 2.92); at.updateMatrix(); slabs.setMatrixAt(k, at.matrix);
    tmp.set('#e8dec9').multiplyScalar(0.82 + 0.18 * (((c * 7 + r * 13) % 5) / 4)); slabs.setColorAt(k, tmp); k++;
  }
  slabs.instanceColor.needsUpdate = true;
  const cols = inst(new T.CylinderGeometry(0.5, 0.58, 8.4, 20, 1), marble, 4), caps = inst(new T.BoxGeometry(1.5, 0.36, 1.5), gold, 4);
  // the columns: around the doorways on a wide screen; on a phone (the doorways spread over their names, below) one column stands in each gap, a little
  // behind and lower, so the window reads as a colonnade with five lit doorways (QA6: at 390 px the old framing showed a few pale bars)
  function placeColumns(f) {
    const gap = f > 1.15, sy = gap ? 0.8 : 1;
    const P = gap ? [0, 1, 2, 3].map((i) => [(xs[i] + xs[i + 1]) / 2 * f, (zOf(i) + zOf(i + 1)) / 2 - 1.6]) : [[-8.4, Z + 3.2], [8.4, Z + 3.2], [-10.4, Z - 2.8], [10.4, Z - 2.8]];
    P.forEach((p, i) => {
      at.scale.set(1, sy, 1); at.position.set(p[0], FLOOR_Y + 4.2 * sy, p[1]); at.updateMatrix(); cols.setMatrixAt(i, at.matrix);
      at.scale.set(1, 1, 1); at.position.set(p[0], FLOOR_Y + 8.58 * sy - 0.18 * (1 - sy), p[1]); at.updateMatrix(); caps.setMatrixAt(i, at.matrix);
    });
    cols.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  }
  placeColumns(1);
  for (const m of [jambs, lintels, fillets, lights]) m.instanceMatrix.needsUpdate = true;
  /** spread the doorways sideways by f (home3d.js: so each doorway stands over its own name on the rail); 1 = the built row */
  out.spread = (f) => { const g = Math.max(1, Math.min(2.2, +f || 1)); if (Math.abs(g - (out.dims.spread || 1)) < 0.004) return out.dims.spread; out.dims.spread = g; placeDoors(g); placeLights(g); placeColumns(g);
    for (const m of [jambs, lintels, fillets, lights]) m.instanceMatrix.needsUpdate = true; return g; };

  // which doorways need the owner: { market: '' | 'warn' | 'bad', ... } (home-cards.js). The light eases to its new strength; with motion off it is set at once.
  function setNeeds(needs) {
    needs = needs && typeof needs === 'object' ? needs : {};
    out.needs = needs;
    let changed = false;
    for (let i = 0; i < N; i++) {
      const lv = needs[DISTRICTS[i].id] === 'bad' ? 'bad' : needs[DISTRICTS[i].id] === 'warn' ? 'warn' : '';
      const g = NEED_GAIN[lv];
      if (want[i] !== g) changed = true;
      want[i] = g;
      if (lv) tmp.set(NEED_TINT[lv]); else restCol(i);
      iCol.set([tmp.r, tmp.g, tmp.b], i * 3);
      if (!moving()) iAmp[i] = g;
    }
    colAttr.needsUpdate = true; ampAttr.needsUpdate = true;
    if (changed && !moving()) { try { root.style.setProperty('--court-n', String(Date.now() % 1000)); } catch (_) { /* the next frame shows it */ } }   // a still backdrop redraws on a style change
  }
  out.setNeeds = setNeeds;

  // slow breathing of the doorway light (0.9 to 1.0 of its strength) and the ease toward a new strength: still when motion is off
  ext.onStep.push((dt, t) => {
    if (!moving()) { lightMat.uniforms.uI.value = 0.16; return; }
    lightMat.uniforms.uI.value = 0.16 * (0.95 + 0.05 * Math.sin(t * 0.35));
    let dirty = false;
    for (let i = 0; i < N; i++) { const d = want[i] - iAmp[i]; if (Math.abs(d) > 0.004) { iAmp[i] += d * Math.min(1, dt * 2.5); dirty = true; } }
    if (dirty) ampAttr.needsUpdate = true;
  });
  // ENV ART (olympus/env-kit.js, 2026-11-11): the doorways and the paving wear the marble scan, the four columns become fluted Doric shafts.
  // The same draws (materials and geometry are swapped in place); a failed load keeps the plain marble.
  import('../olympus/env-kit.js').then((K) => {
    const kit = K.envKit({ rc: ext.rc, renderer: ext.rc && ext.rc.renderer, scene, tier: root.dataset.fx === 'ultra' ? 'ultra' : 'high' });
    const em = kit.mat('marble', { color: '#d8ccb4', emissive: '#8f7b5c', emissiveIntensity: 0.55, fog: false, scale: 0.55 });
    const pave = kit.mat('paving', { color: '#e8dec9', emissive: '#6f604a', emissiveIntensity: 0.45, fog: false, scale: 0.45 });
    jambs.material = em; lintels.material = em; slabs.material = pave;
    const fl = K.shaftGeo({ h: 8.4, r: 0.56, taper: 0.86, flutes: 20 }); fl.translate(0, -4.2, 0);
    const oldG = cols.geometry; cols.geometry = fl; oldG.dispose(); cols.material = kit.mat('marble:uv', { color: '#e2d7c2', emissive: '#8f7b5c', emissiveIntensity: 0.55, fog: false });
    out.kit = kit;
  }).catch(() => { /* the plain marble stays */ });
  out.draws = draws;
  root.dataset.court = '3d';
  try { if (window.__jarvisNeeds) setNeeds(window.__jarvisNeeds); } catch (_) { /* the cards set it later */ }
  return out;
}
