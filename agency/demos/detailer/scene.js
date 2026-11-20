/* Glossworks demo: the 3D showroom car (made in code: an extruded side profile, a glass cabin, wheels, lights) on a glossy floor
   under a light ring. Picks: paint colour; finish 'before' (dull, swirled) / 'after' (ceramic: clear coat, mirror reflections). */
import { mountStage, lights } from '../stage.js';
import { RoomEnvironment } from '../../../olympus/three-addons/RoomEnvironment.js';

const PAINT = { black: 0x15171b, white: 0xe6e9ec, red: 0xa3121a, blue: 0x1a3566 };

mountStage({
  host: '#stage', shadows: true, exposure: 1.0, spin: .3,
  view: { yaw: .9, pitch: .22, dist: 8.2, target: [0, .65, 0], minPitch: .05, maxPitch: .9 },
  build(api) {
    const { THREE, scene, renderer } = api;
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
    lights(api, { hemi: .35, key: 1.8, keyPos: [3, 8, 4], shadow: true });
    const back = new THREE.DirectionalLight(0xbfe9ff, 2.2); back.position.set(-6, 3, -5); scene.add(back);

    // the floor: dark, glossy; the light ring above
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: .75, metalness: 0, envMapIntensity: .15 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, .04, 8, 96), new THREE.MeshBasicMaterial({ color: 0xbfe9ff })); ring.rotation.x = Math.PI / 2; ring.position.y = 4.2; scene.add(ring);
    const disc = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 96), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: .35 })); disc.rotation.x = -Math.PI / 2; disc.position.y = .005; scene.add(disc);

    const car = new THREE.Group(); scene.add(car);
    const paint = new THREE.MeshPhysicalMaterial({ color: PAINT.black, metalness: .5, roughness: .15, clearcoat: 1, clearcoatRoughness: .04 });
    // body: the side profile (front = +x) with two wheel arches, extruded across the width with rounded edges
    // the body: the side profile (front = +x), the bottom edge walks round the two wheel arches
    const b = new THREE.Shape(); b.moveTo(2.2, .32); b.lineTo(2.3, .5); b.quadraticCurveTo(2.33, .7, 2.05, .74); b.quadraticCurveTo(1.6, .8, 1.1, .9); b.lineTo(-1.6, .94); b.quadraticCurveTo(-2.2, .95, -2.26, .74); b.lineTo(-2.22, .4); b.lineTo(-2.1, .32);
    b.lineTo(-1.85, .32); b.lineTo(-1.85, .4); b.absarc(-1.35, .4, .5, Math.PI, 0, true); b.lineTo(-.85, .32);
    b.lineTo(.85, .32); b.lineTo(.85, .4); b.absarc(1.35, .4, .5, Math.PI, 0, true); b.lineTo(1.85, .32); b.closePath();
    const W = 1.7, bodyG = new THREE.ExtrudeGeometry(b, { depth: W, bevelEnabled: true, bevelThickness: .14, bevelSize: .1, bevelSegments: 5, curveSegments: 18 });
    bodyG.translate(0, 0, -W / 2);
    const body = new THREE.Mesh(bodyG, paint); body.castShadow = true; car.add(body);
    // the glass cabin
    const c = new THREE.Shape(); c.moveTo(1.12, .88); c.quadraticCurveTo(.55, 1.34, .1, 1.4); c.lineTo(-.85, 1.4); c.quadraticCurveTo(-1.3, 1.36, -1.62, .92); c.closePath();
    const CW = 1.42, cabG = new THREE.ExtrudeGeometry(c, { depth: CW, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 4, curveSegments: 12 });
    cabG.translate(0, 0, -CW / 2);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1016, metalness: .2, roughness: .05, clearcoat: 1 });
    const cab = new THREE.Mesh(cabG, glass); cab.castShadow = true; car.add(cab);
    // the roof panel in paint over the glass
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, .04, CW - .1), paint); roof.position.set(-.35, 1.5, 0); car.add(roof);
    // wheels
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .9 }), rim = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: .2 });
    const wheels = [];
    for (const x of [-1.35, 1.35]) for (const z of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x, .4, z * (W / 2 + .06));
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .28, 32), tyre); t.rotation.x = Math.PI / 2; w.add(t);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .3, 24), rim); r.rotation.x = Math.PI / 2; w.add(r);
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.06, .46, .04), rim); sp.rotation.z = i * Math.PI * 2 / 5; sp.position.z = z * .16; w.add(sp); }
      w.traverse(o => { if (o.isMesh) o.castShadow = true; }); car.add(w); wheels.push(w);
    }
    // lights
    const head = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0xdff3ff, emissiveIntensity: 2 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x8a0c12, emissive: 0xff2a2a, emissiveIntensity: 1.6 });
    for (const z of [-.55, .55]) { const h = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .42), head); h.position.set(2.27, .68, z); car.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(.06, .09, .46), tail); t.position.set(-2.33, .76, z); car.add(t); }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(.06, .16, .9), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .4 })); grille.position.set(2.33, .5, 0); car.add(grille);
    for (const z of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.2, .1, .14), paint); m.position.set(.85, 1.0, z * (CW / 2 + .12)); car.add(m); }

    function setFinish(f) {
      const before = f === 'before';
      paint.roughness = before ? .55 : .12; paint.clearcoat = before ? 0 : 1; paint.metalness = before ? .2 : .55;
      paint.envMapIntensity = before ? .35 : 1.2; paint.needsUpdate = true; api.dirty(); api.kick && api.kick();
    }
    function setPaint(id) { paint.color.setHex(PAINT[id] || PAINT.black); api.dirty(); api.kick && api.kick(); }
    const P = window.DEMO_PICKS || {}; setPaint(P.paint || 'red'); setFinish(P.finish || 'after');
    window.addEventListener('demo:pick', e => { const d = e.detail || {}; if (d.group === 'paint') setPaint(d.value); if (d.group === 'finish') setFinish(d.value); });
  },
});
