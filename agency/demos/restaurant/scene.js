/* Lantern & Thyme demo: the 3D plate on a turntable (made in code: plate, table, three dishes). Loaded by lazy3d.js after first paint. */
import { mountStage, lights } from '../stage.js';

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

mountStage({
  host: '#stage', shadows: true, exposure: 1.05, spin: .35,
  view: { yaw: .4, pitch: .62, dist: 4.4, target: [0, .1, 0], minPitch: .25, maxPitch: 1.25 },
  build(api) {
    const { THREE, scene } = api;
    lights(api, { hemi: .55, key: 2.4, keyPos: [3, 6, 2.5], shadow: true });
    const warm = new THREE.PointLight(0xffa860, 14, 9, 2); warm.position.set(-2.4, 1.6, -1.8); scene.add(warm);

    // the table: dark wood grain on a canvas
    const wood = canvasTex(THREE, 512, 512, (g, w, h) => {
      g.fillStyle = '#3b2518'; g.fillRect(0, 0, w, h); const r = rnd(7);
      for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${20 + r() * 40},${10 + r() * 20},${5 + r() * 10},${.25 + r() * .3})`; g.lineWidth = 1 + r() * 4;
        g.beginPath(); const y = r() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 6 + (r() - .5) * 3); g.stroke(); }
    });
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2, 2);
    const table = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ map: wood, roughness: .75 }));
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

    // the turntable group: plate + dish
    const turn = new THREE.Group(); scene.add(turn);
    const pts = [[0, 0], [1.0, 0], [1.08, .03], [1.22, .1], [1.32, .14], [1.34, .12], [1.2, .06], [1.0, .045], [0, .045]].map(p => new THREE.Vector2(p[0], p[1]));
    const plate = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshPhysicalMaterial({ color: 0xf6f1e8, roughness: .25, clearcoat: .8, clearcoatRoughness: .2 }));
    plate.castShadow = plate.receiveShadow = true; turn.add(plate);

    const M = (c, r = .6, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, extra));
    const dishes = {};

    // margherita: crust ring, sauce, mozzarella pools, basil, char spots
    {
      const g = new THREE.Group(), r = rnd(3);
      const crustTex = canvasTex(THREE, 256, 256, (c, w, h) => { c.fillStyle = '#d99a52'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${60 + r() * 40},${30 + r() * 20},10,${r() * .55})`; c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 5, 0, 7); c.fill(); } });
      const crust = new THREE.Mesh(new THREE.TorusGeometry(.86, .1, 14, 64), M(0xffffff, .85, { map: crustTex }));
      crust.rotation.x = Math.PI / 2; crust.position.y = .12; crust.scale.set(1, 1, .8); g.add(crust);
      const sauce = new THREE.Mesh(new THREE.CylinderGeometry(.86, .88, .05, 64), M(0xb3261b, .45)); sauce.position.y = .1; g.add(sauce);
      for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = .1 + r() * .6, s = .1 + r() * .08;
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), M(0xf7efda, .5)); m.scale.set(s * 1.2, s * .25, s); m.position.set(Math.cos(a) * d, .135, Math.sin(a) * d); g.add(m); }
      for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = .15 + r() * .55;
        const l = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), M(0x2f7d32, .5)); l.scale.set(.07, .012, .035); l.rotation.y = r() * 3; l.position.set(Math.cos(a) * d, .16, Math.sin(a) * d); g.add(l); }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      dishes.pizza = g;
    }
    // tagliatelle: a twirled nest of ribbons (tubes on dome spirals), a ragù cap, parmesan shavings, basil
    {
      const g = new THREE.Group(), r = rnd(11), noodle = M(0xeec76f, .42);
      const dome = (x, z) => .1 + .42 * Math.max(0, 1 - (x * x + z * z) / .42);
      for (let i = 0; i < 34; i++) {
        const pts = [], r0 = .12 + r() * .5, a0 = r() * 6.28, turns = .8 + r() * .9, tilt = (r() - .5) * .25;
        for (let k = 0; k <= 16; k++) { const t = k / 16, a = a0 + t * turns * 6.28, rr = r0 * (1 - .25 * t) + Math.sin(t * 9) * .02;
          const x = Math.cos(a) * rr, z = Math.sin(a) * rr; pts.push(new THREE.Vector3(x, dome(x, z) + tilt * x + .02, z)); }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .026, 5, false), noodle); g.add(tube);
      }
      const sauce = M(0x8a2a17, .55);
      for (let i = 0; i < 10; i++) { const a = r() * 6.28, d = r() * .22;
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), sauce); m.scale.set(.13 + r() * .06, .05, .12 + r() * .05);
        { const x = Math.cos(a) * d, z = Math.sin(a) * d; m.position.set(x, dome(x, z) + .05, z); } g.add(m); }
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.1, .006, .045), M(0xf6ecd0, .6)); const a = r() * 6.28, d = r() * .25;
        m.position.set(Math.cos(a) * d, .6, Math.sin(a) * d); m.rotation.set((r() - .5) * .5, r() * 3, (r() - .5) * .5); g.add(m); }
      for (const [x, z, ry] of [[.04, .02, .3], [-.06, -.03, 2.1]]) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), M(0x2f7d32, .5)); leaf.scale.set(.1, .015, .045); leaf.position.set(x, .62, z); leaf.rotation.y = ry; g.add(leaf); }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      dishes.pasta = g;
    }
    // tiramisu: layered slice (sponge / cream), cocoa top, a mint leaf, a dusting of cocoa on the plate
    {
      const g = new THREE.Group();
      const layers = [[0x7a4a2a, .09], [0xf1e3c8, .1], [0x6b3f22, .09], [0xf3e7cf, .12]]; let y = .06;
      for (const [c, h] of layers) { const b = new THREE.Mesh(new THREE.BoxGeometry(.9, h, .62), M(c, .7)); b.position.y = y + h / 2; y += h; g.add(b); }
      const cocoaTex = canvasTex(THREE, 128, 128, (c, w, h) => { c.fillStyle = '#4a2a17'; c.fillRect(0, 0, w, h); const r = rnd(5);
        for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${30 + r() * 50},${15 + r() * 20},8,.6)`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } });
      const top = new THREE.Mesh(new THREE.BoxGeometry(.9, .02, .62), M(0xffffff, .95, { map: cocoaTex })); top.position.y = y + .01; g.add(top);
      const mint = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), M(0x3f8f45, .45)); mint.scale.set(.08, .014, .04); mint.position.set(.18, y + .035, .05); mint.rotation.y = .7; g.add(mint);
      g.rotation.y = .5; g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      dishes.tiramisu = g;
    }

    let cur = null, pop = 0;
    function show(id) {
      const next = dishes[id] || dishes.pizza; if (next === cur) return;
      if (cur) turn.remove(cur); cur = next; turn.add(cur); pop = api.reduce ? 1 : 0; api.kick();
    }
    show((window.DEMO_PICKS || {}).dish || 'pizza');
    window.addEventListener('demo:pick', e => { if (e.detail && e.detail.group === 'dish') show(e.detail.value); });

    // steam: a few soft sprites rising (only over hot dishes)
    const steamTex = canvasTex(THREE, 64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    const steam = []; for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 7; scene.add(s); steam.push(s); }

    api.onFrame((dt) => {
      if (pop < 1) { pop = Math.min(1, pop + dt * 2.5); const k = 1 - Math.pow(1 - pop, 3); cur.scale.setScalar(.6 + .4 * k); cur.position.y = (1 - k) * .4; }
      const hot = cur !== dishes.tiramisu && !api.reduce;
      for (const s of steam) { s.userData.t = (s.userData.t + dt * .18) % 1; const t = s.userData.t;
        s.position.set(Math.sin(t * 6 + s.id) * .25, .4 + t * 1.3, Math.cos(t * 5 + s.id) * .2); s.scale.setScalar(.3 + t * .6); s.material.opacity = hot ? Math.sin(t * Math.PI) * .22 : 0; }
      return pop < 1 || hot;
    });
  },
});
