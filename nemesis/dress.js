// NEMESIS dress (ES module, JOB 10+11, 2026-11-04): the underworld's air. Real fog drifting over the obsidian, real embers rising and cooling,
// heat haze over the ember seams, ruined braziers with true flames, a red moon that does not set. The surfaces themselves (basalt with
// glowing cracks, soot-black stone columns, bronze armour with an ember rim) are set in scene.js.
// dress({ scene, camera, lite }) -> { update(t, still), setLite(b), stats(), dispose() }. All optional: a failure leaves the plain scene.
import * as S from '../olympus/scenery.js';

const { THREE } = S;

export function dress({ scene, camera, lite }) {
  const F = window.OLYMPUS_FX, fx = [], torches = [], parts = [];
  let stopped = false, moon = null, crackMat = null;
  const guard = (name, fn) => { try { const v = fn(); parts.push(name); return v; } catch (e) { return null; } };
  const find = () => { let m = null; scene.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.update) m = o.material; }); return m; };
  const start = () => {
    if (stopped || !F) return;
    crackMat = find();
    guard('fog', () => fx.push(F.volumetricFog(scene, { size: 34, density: 0.45, color: '#3a2a22' })));
    guard('embers', () => fx.push(F.embers(scene, { center: [0, 3.2, 0], count: lite ? 120 : 360 })));
    guard('haze', () => { if (!lite) fx.push(F.heatShimmer(scene, { position: [0, 0.2, 0], height: 3.2 })); });
    guard('braziers', () => { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.5; torches.push(S.torch(scene, { at: [Math.cos(a) * 13.4, 0, Math.sin(a) * 13.4], height: 2.1, light: 0 })); } });
  };
  if (F && F.load) F.load('3d').then(start, () => {}); else start();
  // a red moon low over the rim
  moon = guard('moon', () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, 'rgba(224, 176, 96,1)'); gr.addColorStop(0.34, 'rgba(192, 96, 63,.95)'); gr.addColorStop(0.4, 'rgba(192, 96, 63,.3)'); gr.addColorStop(1, 'rgba(192, 96, 63,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color('#c96a4a').multiplyScalar(1.6), transparent: true, fog: false, depthWrite: false }));
    m.scale.set(30, 30, 1); m.position.set(40, 34, -70); scene.add(m); return m;
  });
  return {
    update(t, still) { if (crackMat && crackMat.userData.update) crackMat.userData.update(still ? 1 : t); },
    setLite(b) { lite = !!b; },
    stats: () => ({ parts: parts.slice(), fx: fx.length, torches: torches.length }),
    dispose() {
      stopped = true;
      fx.forEach((f) => { try { f.stop(); } catch (e) { /* */ } });
      torches.forEach((t) => { try { t.stop(); } catch (e) { /* */ } });
      if (moon) { scene.remove(moon); moon.material.dispose(); }
    },
  };
}
