// ARENA dress (ES module, JOB 10+11, 2026-11-04): what makes the colosseum look built instead of drawn.
// Real surfaces (stone seating, bronze braziers, a raked sand floor), a crowd of ~740 instanced animated spectators that bobs and
// cheers (a rank-up, a boss slain), hanging banners that wave, torches with real flames, a moon, dust in the light shafts and a
// boss-fight timeline (strikes, flashes, shake) played when a weekly boss is settled.
// dress(ctx) -> { update(t, dt, still) -> true while it animates, setLite(b), cheer(ms), bossFight(), stats(), dispose() }
// ctx = { scene, camera, rc, boss (the Group), bossLight (PointLight) }. Everything is optional: any failure leaves the plain scene.
import * as S from '../olympus/scenery.js';
import * as AT from '../olympus/fx-atmos.js';
import { createCitadel } from './citadel.js?v=c4';  // bounded night districts and skybridges

const { THREE } = S;
const TAU = Math.PI * 2;

function sandMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#a89279'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) { const v = 90 + r() * 110 | 0; g.fillStyle = `rgba(${v},${v * 0.88 | 0},${v * 0.68 | 0},.5)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  g.strokeStyle = 'rgba(32, 26, 18,.22)'; g.lineWidth = 2;
  for (let i = 0; i < 28; i++) { const y = 4 + i * 9 + r() * 3; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(70, y + r() * 6, 160, y - r() * 6, 256, y + r() * 3); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.2, roughness: 0.97, metalness: 0 });
}

function moonSprite(scene) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(243, 236, 224,1)'); gr.addColorStop(0.32, 'rgba(243, 236, 224,.95)'); gr.addColorStop(0.36, 'rgba(243, 236, 224,.35)'); gr.addColorStop(1, 'rgba(111, 155, 184,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(152, 141, 129,.35)'; for (const [x, y, r] of [[52, 52, 8], [70, 62, 6], [58, 74, 5], [74, 46, 4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#f3ece0').multiplyScalar(2.2), transparent: true, fog: false, depthWrite: false }));
  m.scale.set(26, 26, 1); m.position.set(-60, 52, -70); scene.add(m);
  return m;
}

export function dress(ctx) {
  const { scene, camera, rc } = ctx, out = { ok: false, parts: [] }, sub = [];
  let atm = [], crowd = null, banners = null, torches = [], moon = null, sand = null, citadel = null, lite = !!ctx.lite, fxs = [], fight = null, stopped = false, extra = 0;
  const guard = (name, fn) => { try { const v = fn(); out.parts.push(name); return v; } catch (e) { out['err_' + name] = String((e && e.message) || e); return null; } };

  // the bowl: four tiers of spectators, two rows each, on the seats (the tier radius and height come from scene.js: R = 16.2 + 2.2 k, h = 1.5)
  crowd = guard('crowd', () => {
    const rings = [];
    for (let k = 0; k < 4; k++) { const R = 16.2 + k * 2.2, y = (k + 1) * 1.5; rings.push({ r: R + 0.65, y, n: Math.round(R * 5.6) }, { r: R + 1.55, y, n: Math.round((R + 1) * 5.6) }); }
    // a phone gets 60% of the seats, spread evenly (docs/OLYMPUS_PERF.md)
    const c = S.crowd(scene, { rings, seed: 11, density: Math.min(innerWidth, innerHeight) < 600 ? 0.6 : 1 }); c.setLite(lite); return c;
  });
  // banners hang between the arcade piers, red and gold, one per 7th pier
  banners = guard('banners', () => {
    const items = [], NP = 56, RP = 25.4, PH = 8.5;
    for (let i = 0; i < NP; i += 7) { const a = ((i + 0.5) / NP) * TAU; items.push([Math.cos(a) * (RP - 0.9), PH - 0.4, Math.sin(a) * (RP - 0.9), -a + Math.PI / 2]); }
    return S.banners(scene, { items, w: 1.7, h: 4.6, glyph: 'Α', color: '#5f3324', trim: '#c8a24a' });
  });
  // torches on the plaza (between the braziers) with real flames when the FX library is on the page
  const F = window.OLYMPUS_FX;
  const startFx = () => {
    if (stopped) return;
    torches = guard('torches', () => [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * TAU + 0.26; return S.torch(scene, { at: [Math.cos(a) * 12.2, 0, Math.sin(a) * 12.2], height: 1.9, light: 0 }); })) || [];
    fxs = [S.dustAndRays(scene, { position: [-9, 14, 7], intensity: 0.45 })];
    guard('lensFlare', () => { if (F && F.lensFlare) fxs.push(F.lensFlare({ scene, camera }, { position: [-60, 52, -70] })); });
    if (!lite) guard('heat', () => { if (F && F.heatShimmer) fxs.push(F.heatShimmer(scene, { position: [0, 0.4, 0], height: 2.5 })); });
  };
  if (F && F.load) F.load('3d').then(startFx, () => {}); else if (F) startFx();
  // sparks off the braziers (fx-atmos, one draw call), 0.9 s after the first paint; ?noatmos=1 is the perf probe; a LITE phone skips them
  setTimeout(() => guard('embers', () => {
    if (stopped || lite || /[?&]noatmos=1/.test(location.search)) return;
    const pts = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; pts.push([Math.cos(a) * 15.7, 2.6, Math.sin(a) * 15.7]); }
    const em = AT.embers({ count: 170, points: pts, spread: [0.35, 0, 0.35], rise: 3.2, colors: ['#f0dca0', '#e0a060', '#c96a4a'], size: 6, wind: 0.3, seed: 14 });
    scene.add(em.object); atm.push(em); AT.setQuality(atm, 'high');
  }), 900);
  citadel = guard('citadel', () => createCitadel(scene, lite));
  moon = guard('moon', () => moonSprite(scene));
  sand = guard('sand', () => sandMaterial());

  // the boss fight: three strikes on the crystal, flashes, a shake, the crowd on its feet. Played when a boss is newly slain.
  const strikes = [0.35, 1.05, 1.7, 2.4];
  function bossFight() {
    if (!ctx.boss) return;
    fight = { t0: performance.now(), hits: 0 };
    if (crowd) crowd.pulse(4200);
    try { if (F && F.sparkleBurst && document.body) F.sparkleBurst(document.getElementById('scene') || document.body, { x: innerWidth / 2, y: innerHeight * 0.3 }); } catch (e) { /* */ }
  }

  out.ok = true;
  return {
    sand,
    update(t, dt, still) {
      let busy = false;
      if (banners) banners.update(t, still);
      if (atm.length) { AT.update(atm, t, rc.renderer.getPixelRatio()); if (!still) busy = true; }
      if (crowd) busy = crowd.update(t, dt, still) || busy;
      if (moon) moon.material.opacity = 0.92 + (still ? 0 : Math.sin(t * 0.3) * 0.05);
      if (fight) {
        const age = (performance.now() - fight.t0) / 1000, b = ctx.boss, L = ctx.bossLight;
        const hit = strikes.filter((s) => age > s).length;
        if (hit > fight.hits) { fight.hits = hit; extra = 1; try { if (window.OLYMPUS && window.OLYMPUS.sfx) window.OLYMPUS.sfx(hit >= 4 ? 'rankup' : 'tick'); } catch (e) { /* */ } }
        extra *= 0.9;
        const k = Math.max(0, 1 - Math.abs(age - strikes[Math.min(3, Math.max(0, fight.hits - 1))]) * 3);
        b.scale.setScalar(1 + 0.12 * extra + (age < 2.6 ? 0.03 * Math.sin(age * 30) : 0));
        b.position.x = (Math.random() - 0.5) * 0.35 * extra;
        if (L) L.intensity = 60 * extra + 60 * k;
        rc.setBloom({ strength: 0.7 + 0.5 * extra });
        if (age > 3.2) { fight = null; b.scale.setScalar(1); b.position.x = 0; if (L) L.intensity = 0; rc.setBloom({ strength: 0.7 }); }
        busy = true;
      }
      return busy;
    },
    setLite(b) {
      lite = !!b;
      atm.forEach((a) => { a.object.visible = !lite; });
      if (crowd) crowd.setLite(lite);
      if (citadel) citadel.setLite(lite);
    },
    cheer(ms) { if (crowd) crowd.pulse(ms || 3200); },
    bossFight,
    stats: () => ({ ok: out.ok, parts: out.parts.slice(), spectators: crowd ? crowd.count : 0, banners: banners ? 8 : 0, citadel: citadel ? citadel.stats() : null, torches: torches.length, fx: fxs.length, embers: atm.length, fight: !!fight, errors: Object.keys(out).filter((k) => k.startsWith('err_')) }),
    dispose() {
      stopped = true;
      sub.forEach((f) => { try { f.stop(); } catch (e) { /* */ } });
      atm.forEach((a) => { try { scene.remove(a.object); a.object.geometry.dispose(); a.material.dispose(); } catch (e) { /* */ } });
      fxs.forEach((f) => { try { f.stop(); } catch (e) { /* */ } });
      torches.forEach((t) => { try { t.stop(); } catch (e) { /* */ } });
      if (citadel) citadel.dispose();
      if (crowd) crowd.dispose();
      if (banners) banners.dispose();
      if (moon) { scene.remove(moon); moon.material.dispose(); }
    },
  };
}

