// CHRONOS dress (ES module, JOB 10+11, 2026-11-04): the clock tower gets a real movement. Brass gears that turn with the playhead (the
// replay's time drives them: scrub and they scrub), an exposed mechanism behind glass on the tower front with a swinging pendulum, a glass
// cover over the dial, brass instead of flat gold on the rim and the spire, two great gears turning behind the tower, dust in the light.
// dress({ scene, camera, tower, face, rim, spire, FZ, FY, TZ, lite, marble }) -> { update(t, still), setTime(tt), setLite(b), stats(), dispose() }
// Everything is optional: a failure leaves the plain tower.
import * as S from '../olympus/scenery.js';
import * as M from '../olympus/materials.js';

const { THREE } = S;

export function dress({ scene, tower, face, rim, spire, FZ = 1.36, FY = 9.65, TZ = -11, lite = false }) {
  const parts = [], gears = [], disposables = [], fx = [];
  let tt = 0, pend = null, stopped = false;
  const guard = (name, fn) => { try { const v = fn(); parts.push(name); return v; } catch (e) { return null; } };

  const brass = guard('brass', () => S.bronze({ color: '#c8a24a', patina: 0.02, rough: 0.3 }));
  const dark = new THREE.MeshStandardMaterial({ color: '#15120f', roughness: 0.6, metalness: 0.2 });
  disposables.push(dark);
  if (brass) { rim.material = brass; spire.material = brass; disposables.push(brass); }

  // the exposed mechanism on the tower front: a recessed black panel with four meshing gears and a pendulum, under glass
  guard('movement', () => {
    const g = new THREE.Group(); g.position.set(0, 3.2, 1.31); tower.add(g);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.7, 0.08), dark); panel.position.z = -0.02; g.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.9, 0.06), brass || dark); frame.position.z = -0.06; g.add(frame);
    const spec = [{ t: 20, r: 0.62, x: -0.55, y: 0.95, k: 1 }, { t: 12, r: 0.4, x: 0.35, y: 0.62, k: -20 / 12 }, { t: 16, r: 0.5, x: 0.55, y: -0.02, k: 1 * 20 / 16 }, { t: 10, r: 0.33, x: -0.3, y: 0.02, k: -20 / 10 }];
    for (const sp of spec) {
      const gear = S.gear({ teeth: sp.t, r: sp.r, depth: 0.07, thick: 0.07, hole: sp.r * 0.2, spokes: sp.t > 12 ? 5 : 3, material: brass });
      gear.position.set(sp.x, sp.y, 0.03); g.add(gear); gears.push({ m: gear, k: sp.k, off: sp.t % 2 ? 0.1 : 0 });
    }
    // the pendulum
    const pivot = new THREE.Group(); pivot.position.set(0, -0.45, 0.04); g.add(pivot);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), brass || dark); rod.position.y = -0.6; pivot.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), brass || dark); bob.rotation.x = Math.PI / 2; bob.position.y = -1.22; pivot.add(bob);
    pend = pivot;
    // the glass over it all
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.8), M.glass({ color: '#f3ece0', rim: '#4b7a99', opacity: 0.1 }));
    glass.position.z = 0.09; g.add(glass);
    disposables.push(panel.geometry, frame.geometry, rod.geometry, bob.geometry, glass.geometry, glass.material);
  });

  // a glass cover over the dial
  guard('dial glass', () => {
    const glass = new THREE.Mesh(new THREE.CircleGeometry(1.46, 40), M.glass({ color: '#f3ece0', rim: '#4b7a99', opacity: 0.08 }));
    glass.position.z = 0.16; face.add(glass); disposables.push(glass.geometry, glass.material);
  });

  // two great gears turning behind the tower, half hidden by the ring of light
  guard('great gears', () => {
    for (const [x, y, r, t, k] of [[-5.2, 6.4, 2.3, 28, 1], [5.2, 7.4, 1.7, 21, -28 / 21]]) {
      const gear = S.gear({ teeth: t, r, depth: 0.22, thick: 0.28, hole: r * 0.18, spokes: 6, material: brass });
      gear.position.set(x, y, TZ - 1.6); scene.add(gear); gears.push({ m: gear, k, off: 0, scene: true });
    }
  });

  const F = window.OLYMPUS_FX;
  const start = () => { if (!stopped) fx.push(S.dustAndRays(scene, { position: [-3, 16, -4], intensity: 0.4 })); };
  if (F && F.load) F.load('3d').then(start, () => {}); else if (F) start();

  return {
    setTime(t) { tt = t; },
    update(t, still) {
      const base = (tt / 45) % (Math.PI * 2000);                 // the playhead drives the movement: the replay's seconds
      for (const g of gears) g.m.rotation.z = (base * g.k + g.off) + (still ? 0 : t * 0.05 * g.k);
      if (pend) pend.rotation.z = Math.sin(still ? tt / 8 : t * 2.1 + tt / 8) * 0.32;
    },
    setLite(b) { lite = !!b; },
    stats: () => ({ parts: parts.slice(), gears: gears.length, pendulum: !!pend, fx: fx.length }),
    dispose() {
      stopped = true; fx.forEach((f) => { try { f.stop(); } catch (e) { /* */ } });
      gears.forEach((g) => { if (g.scene) scene.remove(g.m); g.m.geometry.dispose(); });
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* */ } });
    },
  };
}
