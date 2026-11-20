/* Northgable Roofing demo: the 3D house with the before / after roof (made in code). The slider moves a cut along the roof: the storm-worn
   roof on the left of it (Before), the new one on the right (After); the shingle colour picks repaint the new roof. Loaded by lazy3d.js. */
import { mountStage, lights } from '../stage.js';

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function tex(THREE, w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t;
}
// shingle rows: staggered tabs with a shadow line; worn = faded, missing tabs, moss and streaks
function shingles(g, w, h, worn, seed) {
  const r = rnd(seed), rows = 16, rh = h / rows, tw = w / 10;
  g.fillStyle = worn ? '#8b857a' : '#d9d9d9'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) for (let x = -1; x < 11; x++) {
    const ox = (y % 2) * tw / 2, v = worn ? 110 + r() * 50 : 190 + r() * 40;
    g.fillStyle = `rgb(${v},${v - (worn ? 6 : 0)},${v - (worn ? 14 : 0)})`;
    g.fillRect(x * tw + ox + 1, y * rh + 1, tw - 2, rh - 1);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x * tw + ox, y * rh + rh - 3, tw, 3);
    if (worn && r() < .07) { g.fillStyle = '#3a342c'; g.fillRect(x * tw + ox + 1, y * rh, tw - 2, rh); }   // a missing tab
  }
  if (worn) {
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${70 + r() * 30},${100 + r() * 40},${40 + r() * 20},${.3 + r() * .4})`; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 12, 0, 7); g.fill(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(30,25,20,.25)'; g.fillRect(r() * w, 0, 3 + r() * 8, h); }
  }
}

const COLORS = { charcoal: 0x50565f, weathered: 0x8a735e, slate: 0x627891, terracotta: 0xb35a3e };

mountStage({
  host: '#stage', shadows: true, auto: false, exposure: 1.1,
  view: { yaw: .5, pitch: .3, dist: 14.5, target: [.3, 1.9, 0], minPitch: .08, maxPitch: .9 },
  build(api) {
    const { THREE, scene, renderer } = api;
    renderer.localClippingEnabled = true;
    lights(api, { hemi: .9, key: 2.6, keyPos: [5, 9, 7], shadow: true });
    const M = (c, r = .8, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, x));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), M(0x8fb06c, 1)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(.9, 5), M(0xcfc6b4, 1)); path.rotation.x = -Math.PI / 2; path.position.set(0, .01, 4); scene.add(path);

    const W = 4.4, D = 3.4, H = 2.2, RISE = 1.3, OVER = .3;
    const siding = tex(THREE, 64, 256, (g, w, h) => { g.fillStyle = '#efe7d6'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, y + 13, w, 3); } }, [4, 2]);
    const wallM = M(0xffffff, .9, { map: siding });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallM); body.position.y = H / 2; body.castShadow = body.receiveShadow = true; scene.add(body);
    // gable triangles
    const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, RISE); tri.closePath();
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), wallM); m.rotation.y = sx * Math.PI / 2; m.position.set(sx * W / 2, H, 0); m.castShadow = true; scene.add(m); }
    // door, windows (front = +z)
    const door = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.5, .06), M(0x2f4458, .5)); door.position.set(0, .75, D / 2 + .03); scene.add(door);
    const glass = M(0x9cc3dd, .15, { metalness: .2 }), frame = M(0xffffff, .6);
    for (const x of [-1.4, 1.4]) { const f = new THREE.Mesh(new THREE.BoxGeometry(1, .95, .05), frame); f.position.set(x, 1.3, D / 2 + .03); scene.add(f);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(.84, .8, .06), glass); gl.position.set(x, 1.3, D / 2 + .035); scene.add(gl); }
    for (const x of [-1.2, 1.2]) { const gl = new THREE.Mesh(new THREE.BoxGeometry(.9, .8, .06), glass); gl.position.set(x, 1.3, -D / 2 - .03); scene.add(gl); }

    // the roof: per slope a worn plane and a new plane, cut by two clipping planes at the slider's x
    const L = Math.hypot(D / 2 + OVER, RISE + OVER * RISE / (D / 2)), ang = Math.atan2(RISE, D / 2), RW = W + .5;
    const cutNew = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), cutOld = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);   // new: x >= cut (right), old: x <= cut
    const oldT = tex(THREE, 512, 512, (g, w, h) => shingles(g, w, h, true, 4), [1, 1]);
    const newT = tex(THREE, 512, 512, (g, w, h) => shingles(g, w, h, false, 9), [1, 1]);
    const newM = M(COLORS.charcoal, .75, { map: newT, clippingPlanes: [cutNew], clipShadows: true });
    const oldM = M(0xffffff, .95, { map: oldT, clippingPlanes: [cutOld], clipShadows: true });
    const slopeG = new THREE.BoxGeometry(RW, .08, L);
    for (const sz of [1, -1]) {
      for (const [mat, lift] of [[oldM, 0], [newM, .012]]) {
        const s = new THREE.Mesh(slopeG, mat);
        s.rotation.x = sz * ang; s.position.set(0, H + RISE / 2 - OVER * Math.sin(ang) / 2 + lift, sz * (D / 4 + OVER / 2) * 1.0);
        s.castShadow = true; s.receiveShadow = true; scene.add(s);
      }
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(RW + .02, .12, .22), M(0x2b2e33, .7)); ridge.position.set(0, H + RISE + .04, 0); scene.add(ridge);
    const gutterM = M(0xf1f1f1, .4, { metalness: .3 });
    for (const sz of [1, -1]) { const gt = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, RW, 10), gutterM); gt.rotation.z = Math.PI / 2; gt.position.set(0, H - .05, sz * (D / 2 + OVER)); scene.add(gt); }
    const chim = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.4, .5), M(0x8a4b35, .9)); chim.position.set(1.2, H + RISE * .55 + .3, -.6); chim.castShadow = true; scene.add(chim);
    // the cut line: a bright thin bar over each slope
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cutLine = new THREE.Group();
    for (const sz of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.035, .1, L), lineM); b.rotation.x = sz * ang; b.position.set(0, H + RISE / 2 - OVER * Math.sin(ang) / 2 + .03, sz * (D / 4 + OVER / 2)); cutLine.add(b); }
    scene.add(cutLine);
    // a tree and a shrub
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 1.6, 8), M(0x6b4a2f)); trunk.position.set(4.2, .8, -1); trunk.castShadow = true; scene.add(trunk);
    for (const [y, r] of [[1.9, 1.1], [2.7, .85], [3.4, .55]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.2, 10), M(0x4f7d3a, .9)); c.position.set(4.2, y, -1); c.castShadow = true; scene.add(c); }
    for (const x of [-1.6, 1.6]) { const b = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8), M(0x5e8c43, .9)); b.scale.y = .7; b.position.set(x, .3, D / 2 + .55); b.castShadow = true; scene.add(b); }

    function setCut(v) {
      const x = RW / 2 - v * RW; cutNew.constant = -x; cutOld.constant = x; cutLine.position.x = x;
      cutLine.visible = v > .005 && v < .995; api.dirty(); api.kick && api.kick();
    }
    setCut((window.DEMO_PICKS || {}).ba ?? .5);
    window.addEventListener('demo:ba', e => setCut(e.detail.value));
    const setColor = id => { newM.color.setHex(COLORS[id] || COLORS.charcoal); api.dirty(); api.kick && api.kick(); };
    setColor((window.DEMO_PICKS || {}).shingle || 'charcoal');
    window.addEventListener('demo:pick', e => { if (e.detail && e.detail.group === 'shingle') setColor(e.detail.value); });
  },
});
