// TYCHE scene effects (2026-11-04), from the OLYMPUS effects library (../olympus/fx-*.js): water-light caustics on the floor, a few gold motes in
// the air, and a ceremonial ring of light when the wheel is spun. The scene's own tier follows OLYMPUS.fx(); the library's tiers do the same,
// so LITE / off draw less or nothing. Never needed: any failure here leaves the scene as it was.
const FX = () => window.OLYMPUS_FX || null;
const FLOOR_Y = -6;                       // pools.js FLOOR_Y
let target = null, ready = null;

export function startSceneFx(scene, { lite = false } = {}) {
  const fx = FX();
  if (!fx || !scene || !scene.scene) return null;
  target = { scene: scene.scene, camera: scene.camera, renderer: scene.renderer, rc: scene.rc };
  ready = Promise.all(['fx-sky.js', 'fx-weather.js', 'fx-surface.js'].map((f) => import('../olympus/' + f + '?v=f1'))).then(() => {
    const hs = [fx.caustics(target, { position: [5, FLOOR_Y + 0.08, -1], size: 34, intensity: 0.42, color: '#e0a060' })];
    if (!lite) hs.push(fx.dust(target, { color: '#f0dca0', box: [18, 9, 12], center: [2, -1, 0], count: 420, size: 0.08 }));
    return hs;
  }).catch(() => null);
  return ready;
}

/** a tap on the wheel: a ring of gold light from the hub (a one-shot; the library keeps at most one running per call and cleans it up) */
export function ceremony() {
  const fx = FX();
  if (!fx || !target || !ready) return null;
  try { return fx.shockwave(target, { position: [0, 0.3, 0], radius: 7, color: '#c8a24a', seconds: 1.8 }); } catch (_) { return null; }
}

/** The atmosphere kit (../olympus/fx-atmos.js, 2026-11-04): warm light shafts down onto the wheel and gold sparks rising from the fountain. Each is ONE draw
 *  call; LITE drops the shafts and thins the sparks; reduced motion draws one still frame. The scene's own frame() and setQuality() are wrapped so the
 *  effects follow it; any failure leaves the scene as it was. Returns a promise of { stop() } or null. */
export function startAtmosphere(scene, { lite = false, reduced = false } = {}) {
  if (!scene || !scene.scene || typeof scene.frame !== 'function') return null;
  return import('../olympus/fx-atmos.js').then((A) => {
    const parts = [A.shafts({ count: 5, from: [1, 15, 5], to: [3, FLOOR_Y, -1], width: 2.6, color: '#e0a060', strength: 0.13, spread: [12, 0, 8] }),
      A.embers({ count: 120, origin: [5, FLOOR_Y + 0.3, -1], spread: [3.5, 0, 3.5], rise: 6, colors: ['#f0dca0', '#e0a060'] })];
    const lvl = (q) => (reduced ? 'low' : q === 'low' ? 'low' : 'high');
    parts.forEach((p) => { p.setQuality(lvl(lite ? 'low' : 'high')); scene.scene.add(p.object); });
    const frame0 = scene.frame.bind(scene), q0 = scene.setQuality.bind(scene);
    scene.frame = (t, dt, now) => { if (!reduced) parts.forEach((p) => p.update(t)); return frame0(t, dt, now); };
    scene.setQuality = (q) => { parts.forEach((p) => p.setQuality(lvl(q))); return q0(q); };
    if (reduced) parts.forEach((p) => p.update(0));
    return { parts, stop() { parts.forEach((p) => { scene.scene.remove(p.object); if (p.object.geometry) p.object.geometry.dispose(); if (p.material) p.material.dispose(); }); scene.frame = frame0; scene.setQuality = q0; } };
  }).catch(() => null);
}
