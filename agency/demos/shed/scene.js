/* Cedar Hollow demo: the configurator-lite shed (made in code), rebuilt from the picks: size (8x10 / 10x12 / 12x16 ft), roof (gable / barn
   / modern lean-to), siding colour, and the extras (2 windows, double doors, porch, ramp). The door is on the gable end, facing the camera. */
import { mountStage, lights } from '../stage.js';

const SIZES = { '8x10': [2.44, 3.05], '10x12': [3.05, 3.66], '12x16': [3.66, 4.88] };     // width (door end) x depth, metres
const SIDING = { red: 0xa33a2b, sage: 0x7d917a, navy: 0x2e3d55, cedar: 0xb07a4f };

function boards(THREE) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 5, 256); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 5, 0, 2, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

mountStage({
  host: '#stage', shadows: true, exposure: 1.1, spin: .18,
  view: { yaw: .45, pitch: .26, dist: 10.5, target: [0, 1.3, .4], minPitch: .08, maxPitch: 1.0 },
  build(api) {
    const { THREE, scene } = api;
    lights(api, { hemi: .95, key: 2.4, keyPos: [5, 9, 7], shadow: true });
    const M = (c, r = .85, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, x));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), M(0x93b26f, 1)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 7.6), M(0xb9b2a4, 1)); pad.rotation.x = -Math.PI / 2; pad.position.set(0, .005, .4); pad.receiveShadow = true; scene.add(pad);
    for (const [x, z, s] of [[-4.4, -4.2, 1], [4.6, -4.6, .8]]) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 1.4, 8), M(0x6b4a2f)); tr.position.set(x, .7 * s, z); tr.castShadow = true; scene.add(tr);
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), M(0x55813f, .9)); top.position.set(x, 2 * s, z); top.castShadow = true; scene.add(top);
    }
    const sidingTex = boards(THREE);
    const wallM = M(SIDING.red, .85, { map: sidingTex }), trimM = M(0xf3efe6, .6), roofM = M(0x3d3a36, .9), skidM = M(0x5a4634, .9), deckM = M(0x9b7653, .85);
    let shed = null;

    function build() {
      const P = window.DEMO_PICKS || {}, [W, D] = SIZES[P.size] || SIZES['10x12'], H = 2.0, adds = new Set(P.addons || ['windows']);
      wallM.color.setHex(SIDING[P.siding] || SIDING.red);
      if (shed) { scene.remove(shed); shed.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      shed = new THREE.Group(); scene.add(shed);
      const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; shed.add(m); return m; };
      const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      // the roof line (x, y) across the door end
      const style = P.roof || 'gable';
      const top = style === 'barn' ? [[-W / 2, H], [-W * .3, H + W * .3], [0, H + W * .4], [W * .3, H + W * .3], [W / 2, H]]
        : style === 'lean' ? [[-W / 2, H + W * .22], [W / 2, H]] : [[-W / 2, H], [0, H + W * .34], [W / 2, H]];
      // walls: the end shape (rectangle + the roof line) extruded along the depth, board-and-batten siding
      const s = new THREE.Shape(); s.moveTo(-W / 2, .2); s.lineTo(W / 2, .2);
      for (let i = top.length - 1; i >= 0; i--) s.lineTo(top[i][0], top[i][1]);
      s.closePath();
      const wg = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false }); wg.translate(0, 0, -D / 2);
      const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .9, uv.getY(i) * .9);
      add(new THREE.Mesh(wg, wallM), 0, 0, 0);
      add(box(W + .1, .2, D + .1, skidM), 0, .1, 0);
      // corner trim
      for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) add(box(.1, H - .2, .1, trimM), x, .2 + (H - .2) / 2, z);
      // roof: one slab per segment, overhanging, longer at the front when there is a porch
      const porch = adds.has('porch'), RD = D + .35 + (porch ? 1.3 : 0), rz = porch ? .65 : 0;
      for (let i = 0; i < top.length - 1; i++) {
        const [x1, y1] = top[i], [x2, y2] = top[i + 1], len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
        const ext = (i === 0 ? .22 : .02) + (i === top.length - 2 ? .22 : .02);
        const slab = box(len + ext, .09, RD, roofM); slab.rotation.z = ang;
        const off = ((i === top.length - 2 ? .22 : .02) - (i === 0 ? .22 : .02)) / 2;
        add(slab, (x1 + x2) / 2 + Math.cos(ang) * off + Math.sin(ang) * -.05, (y1 + y2) / 2 + Math.sin(ang) * off + .05, rz);
      }
      // door(s) on the front end (+z), white with the X brace
      const dw = adds.has('double') ? 1.5 : .9, dh = 1.75, fz = D / 2 + .02;
      add(box(dw + .12, dh + .1, .05, trimM), 0, .2 + dh / 2, fz);
      const doorM = M(0xffffff, .7, { color: new THREE.Color(0xf3efe6) });
      const leaves = adds.has('double') ? [-dw / 4, dw / 4] : [0], lw = adds.has('double') ? dw / 2 - .04 : dw - .06;
      for (const x of leaves) {
        add(box(lw, dh - .06, .06, doorM), x, .2 + dh / 2, fz + .02);
        const a = Math.atan2(dh - .2, lw - .1), L = Math.hypot(dh - .2, lw - .1);
        for (const k of [1, -1]) { const brace = box(L, .07, .02, trimM); brace.rotation.z = k * a; add(brace, x, .2 + dh / 2, fz + .06); }
      }
      // windows on both long sides
      if (adds.has('windows')) for (const x of [-W / 2 - .02, W / 2 + .02]) {
        add(box(.05, .72, .9, trimM), x, 1.35, 0); add(box(.06, .58, .76, M(0x9fc3d6, .15, { metalness: .2 })), x + Math.sign(x) * .01, 1.35, 0);
      }
      // porch: a deck in front and two posts under the longer roof
      if (porch) { add(box(W, .14, 1.3, deckM), 0, .2, D / 2 + .65); for (const x of [-W / 2 + .1, W / 2 - .1]) add(box(.12, H - .1, .12, trimM), x, .2 + (H - .1) / 2, D / 2 + 1.22); }
      // ramp: a wedge to the door
      if (adds.has('ramp')) {
        const r = new THREE.Shape(); r.moveTo(0, 0); r.lineTo(1.2, 0); r.lineTo(0, .22); r.closePath();
        const rg = new THREE.ExtrudeGeometry(r, { depth: dw + .2, bevelEnabled: false }); rg.translate(0, 0, -(dw + .2) / 2);
        const ramp = new THREE.Mesh(rg, deckM); ramp.rotation.y = -Math.PI / 2; add(ramp, 0, 0, D / 2 + (porch ? 1.3 : 0));
      }
      api.view.dist = 8.5 + W * .8; api.dirty(); api.kick && api.kick();
    }
    build();
    window.addEventListener('demo:pick', build);
    window.addEventListener('demo:addons', build);
  },
});
