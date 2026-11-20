/* Willow Row demo: the 3D walk-through of the flat (made in code: walls with doors and windows, oak floor, furniture, terrace).
   'Overview' = the doll's-house view from above (slow turn); a room = the camera walks in at eye height and looks round (drag). */
import { mountStage, lights, roundedBox } from '../stage.js';

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function tex(THREE, w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t;
}
const EYE = 1.55;
const ROOMS = {
  overview: { mode: 'orbit', yaw: .75, pitch: .95, dist: 14.5, target: [0, 0, 0] },
  living: { mode: 'eye', yaw: 1.05, pitch: .12, target: [-.8, EYE, .5] },
  kitchen: { mode: 'eye', yaw: -.75, pitch: .14, target: [.5, EYE, -.5] },
  bedroom: { mode: 'eye', yaw: -2.1, pitch: .14, target: [.9, EYE, 1.0] },
  terrace: { mode: 'eye', yaw: 2.2, pitch: .1, target: [-1.0, EYE, 1.5] },
};

mountStage({
  host: '#stage', shadows: true, exposure: 1.05, spin: .12, fov: 50,
  view: Object.assign({ minPitch: -.3, maxPitch: 1.3 }, ROOMS.living),
  build(api) {
    const { THREE, scene } = api;
    lights(api, { hemi: 1.0, key: 2.2, keyPos: [-6, 10, 8], shadow: true });
    scene.add(new THREE.AmbientLight(0xfff6ea, .55));
    const M = (c, r = .8, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, x));
    const add = (m, x, y, z, shadow = true) => { m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } scene.add(m); return m; };
    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

    // ground + floors
    add(new THREE.Mesh(new THREE.CircleGeometry(16, 48), M(0xb9c7ae, 1)), 0, -.02, 0, false).rotation.x = -Math.PI / 2;
    const oak = tex(THREE, 256, 256, (g, w, h) => { const r = rnd(2); for (let y = 0; y < h; y += 32) for (let x = -(y / 32 % 2) * 64; x < w; x += 128) {
      const v = 190 + r() * 30; g.fillStyle = `rgb(${v},${v - 40},${v - 90})`; g.fillRect(x, y, 127, 31); g.fillStyle = 'rgba(80,50,20,.25)'; g.fillRect(x, y + 31, 128, 1); g.fillRect(x + 127, y, 1, 32); } }, [3, 3]);
    const floorIn = M(0xffffff, .55, { map: oak });
    const fl = (w, d, x, z, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.position.set(x, .01, z); scene.add(m); };
    fl(5, 4.5, -2.5, -1.25, floorIn); fl(5, 7, 2.5, 0, floorIn);
    const deck = tex(THREE, 128, 128, (g, w, h) => { g.fillStyle = '#9b7653'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(40,25,10,.4)'; g.fillRect(x, 0, 2, h); } }, [3, 2]);
    fl(5, 2.5, -2.5, 2.25, M(0xffffff, .9, { map: deck }));

    // walls: a straight run with gaps; a gap is a door (header above 2.1 m) or a window (sill to .9 m, header above 2.2 m, glass between)
    const H = 2.6, T = .14, wallM = M(0xf4f1ea, .95), glassM = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ef, roughness: .05, transmission: .0, transparent: true, opacity: .28 });
    function wall(x1, z1, x2, z2, gaps = [], h = H) {
      const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
      const at = (s, y, w, hh, mat) => { const m = box(w, hh, T, mat); const cx = x1 + (x2 - x1) * s / len, cz = z1 + (z2 - z1) * s / len;
        m.position.set(cx, y, cz); m.rotation.y = -ang; m.castShadow = mat !== glassM; m.receiveShadow = true; scene.add(m); };
      let s = 0; const gs = gaps.slice().sort((a, b) => a[0] - b[0]);
      for (const [a, b, kind] of gs) {
        if (a > s) at((s + a) / 2, h / 2, a - s, h, wallM);
        const w = b - a, mid = (a + b) / 2;
        if (kind === 'win') { at(mid, .45, w, .9, wallM); at(mid, (2.2 + h) / 2, w, h - 2.2, wallM); at(mid, 1.55, w, 1.3, glassM); }
        else if (kind === 'glass') at(mid, 1.1, w, 2.2, glassM), at(mid, (2.2 + h) / 2, w, h - 2.2, wallM);
        else at(mid, (2.1 + h) / 2, w, h - 2.1, wallM);
        s = b;
      }
      if (s < len) at((s + len) / 2, h / 2, len - s, h, wallM);
    }
    wall(-5, -3.5, 5, -3.5, [[1, 3, 'win'], [6.2, 8.6, 'win']]);      // north
    wall(-5, -3.5, -5, 1, [[1.2, 3.4, 'win']]);                         // west
    wall(5, -3.5, 5, 3.5, [[1.0, 2.6, 'win'], [4.6, 6.2, 'win']]);     // east
    wall(0, 3.5, 5, 3.5, [[1.6, 3.4, 'win']]);                          // bedroom south
    wall(-5, 1, 0, 1, [[0, 3.2, 'glass'], [3.2, 4.6]]);                  // living / terrace: glass + the sliding door
    wall(0, 0, 5, 0, [[.4, 1.3]]);                                      // kitchen / bedroom, door
    wall(0, 0, 0, 3.5, [[.1, 1.0]]);                                    // living / bedroom, door (the wall goes on along the terrace)
    // terrace rail
    const railM = M(0x2d2a26, .5, { metalness: .4 });
    for (const [x1, z1, x2, z2] of [[-5, 1, -5, 3.5], [-5, 3.5, 0, 3.5]]) { const len = Math.hypot(x2 - x1, z2 - z1);
      const r = box(x1 === x2 ? .05 : len, .05, x1 === x2 ? len : .05, railM); add(r, (x1 + x2) / 2, 1.05, (z1 + z2) / 2);
      const g = box(x1 === x2 ? .02 : len, .95, x1 === x2 ? len : .02, glassM); add(g, (x1 + x2) / 2, .55, (z1 + z2) / 2, false); }

    // living: sofa, rug, coffee table, TV wall, plant, lamp
    const fabric = M(0x8a9a8f, .95), fabric2 = M(0x7c8b80, .95);
    add(new THREE.Mesh(roundedBox(THREE, 2.4, .42, .95, .12), fabric), -3.2, .24, -2.75);
    add(new THREE.Mesh(roundedBox(THREE, 2.4, .5, .22, .1), fabric2), -3.2, .66, -3.15);
    for (const x of [-4.35, -2.05]) add(new THREE.Mesh(roundedBox(THREE, .2, .62, .95, .08), fabric2), x, .31, -2.75);
    add(box(2.6, .01, 1.8, M(0xd9cbb2, 1)), -3.0, .02, -1.6, false);
    add(new THREE.Mesh(roundedBox(THREE, 1.1, .08, .6, .05), M(0x6b4a2f, .5)), -3.1, .4, -1.6);
    for (const [x, z] of [[-3.55, -1.4], [-2.65, -1.4], [-3.55, -1.8], [-2.65, -1.8]]) add(box(.05, .36, .05, M(0x2d2a26, .5)), x, .18, z);
    add(box(.06, .9, 1.6, M(0x111111, .2)), -4.9, 1.3, -1.6);                       // the TV on the west wall
    add(box(.4, .45, 2.0, M(0x6b4a2f, .6)), -4.75, .23, -1.6);
    const pot = M(0xc9b9a3, .8), leaf = M(0x3f7a45, .8);
    for (const [x, z, s] of [[-4.5, .5, 1], [4.5, -3.0, .8], [-.6, 3.1, 1.1]]) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(.22 * s, .17 * s, .45 * s, 16), pot), x, .23 * s, z);
      for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.SphereGeometry(.28 * s, 12, 8), leaf), x + (i % 2 - .5) * .15, (.6 + i * .18) * s, z + (i > 1 ? .1 : -.1));
    }
    // kitchen: counters on the north wall, island, stools, pendants
    const quartz = M(0xf2f0eb, .25), cab = M(0x3c4a43, .6);
    add(box(3.8, .86, .62, cab), 2.6, .43, -3.15); add(box(3.84, .04, .66, quartz), 2.6, .88, -3.15);
    add(box(3.8, .7, .36, cab), 2.6, 1.95, -3.3);
    add(box(2.0, .86, .9, cab), 2.6, .43, -1.6); add(box(2.1, .05, 1.0, quartz), 2.6, .885, -1.6);
    for (const x of [1.95, 2.6, 3.25]) { add(new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .05, 16), M(0x6b4a2f, .5)), x, .68, -.9); add(box(.04, .66, .04, railM), x, .33, -.9); }
    for (const x of [2.1, 3.1]) { const p = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 10), M(0xfff1d6, .3, { emissive: 0xffd9a0, emissiveIntensity: 1.2 })); add(p, x, 1.85, -1.6, false); add(box(.01, .7, .01, railM), x, 2.25, -1.6, false); }
    // bedroom: bed, nightstands, wardrobe
    add(box(1.9, .3, 2.2, M(0x6b4a2f, .6)), 3.9, .15, 1.75);
    add(new THREE.Mesh(roundedBox(THREE, 1.8, .26, 2.05, .08), M(0xf4f1ea, .9)), 3.9, .42, 1.8);
    add(new THREE.Mesh(roundedBox(THREE, 1.82, .1, 1.3, .05), M(0x9fb4c4, .95)), 3.9, .58, 2.25);
    for (const z of [.95, 1.15]) add(new THREE.Mesh(roundedBox(THREE, .7, .16, .4, .07), M(0xffffff, .9)), z === .95 ? 3.5 : 4.3, .62, .95);
    add(box(.12, 1.1, 2.0, M(0x6b4a2f, .6)), 4.88, .9, 1.75);                    // headboard
    for (const z of [.4, 3.1]) { add(box(.5, .5, .45, M(0x6b4a2f, .6)), 4.6, .25, z); }
    add(box(1.6, 2.3, .6, M(0xe7e1d6, .7)), 1.1, 1.15, 3.12);                    // wardrobe
    // terrace: loungers and a planter
    for (const x of [-3.9, -2.8]) { add(box(.7, .3, 1.7, M(0xe9e2d6, .9)), x, .2, 2.45); add(box(.7, .5, .2, M(0xe9e2d6, .9)), x, .45, 3.25); }
    add(box(4.6, .45, .4, M(0x8a8178, .9)), -2.5, .23, 3.2);

    const go = (id, ms) => { const r = ROOMS[id] || ROOMS.living; api.setAuto(r.mode === 'orbit'); api.flyTo(r, ms); api.kick && api.kick(); };
    go((window.DEMO_PICKS || {}).room || 'living', 0);
    window.addEventListener('demo:pick', e => { if (e.detail && e.detail.group === 'room') go(e.detail.value, 1400); });
  },
});
