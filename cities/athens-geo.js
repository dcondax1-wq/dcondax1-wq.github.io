// ATHENS geometry kit: a Batch merges many small coloured parts into ONE draw call (vertex colours, a little baked ambient
// shading so the marble reads in 3D without shadow maps). Unit primitives have y from 0 to 1 and sit on the ground.
import * as THREE from '../jarvis/three.module.min.js';

export const PAL = {
  marble: '#efe7d6', marbleD: '#d2c6ae', lime: '#dccba8', terra: '#b9603f', terraD: '#94472e', bronze: '#b0793f', bronzeD: '#7d5530', gold: '#e8bb55',
  stone: '#aa9d86', stoneD: '#7f7565', paving: '#c3b494', sand: '#dcc995', olive: '#728044', oliveD: '#566232', cypress: '#3f5a38', ochre: '#dcb878',
  white: '#f4eddd', timber: '#6d4b2e', blue: '#4f7e9c', dark: '#3a3228', water: '#4b7a99',
};
const _c = {};
const col = (h) => _c[h] || (_c[h] = new THREE.Color(h));
const cache = new Map();
function prim(key, make) { let g = cache.get(key); if (!g) { g = make(); g.computeBoundingBox(); cache.set(key, g); } return g; }
const flat = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };

export const unit = {
  // a box without its floor (nothing ever sees it): 10 triangles
  box: () => prim('box', () => { const n = flat(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0)), p = n.attributes.position.array, q = n.attributes.normal.array;
    const keep = [...Array(p.length / 3).keys()].filter((i) => q[i * 3 + 1] > -.5), o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(keep.flatMap((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]), 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(keep.flatMap((i) => [q[i * 3], q[i * 3 + 1], q[i * 3 + 2]]), 3)); return o; }),
  shaft: (seg = 8, top = .8) => prim(`shaft${seg}:${top}`, () => flat(new THREE.CylinderGeometry(top, 1, 1, seg, 1, true).translate(0, .5, 0))),
  cyl: (seg = 8, top = 1) => prim(`cyl${seg}:${top}`, () => flat(new THREE.CylinderGeometry(top, 1, 1, seg, 1).translate(0, .5, 0))),
  cone: (seg = 8) => prim(`cone${seg}`, () => flat(new THREE.ConeGeometry(1, 1, seg).translate(0, .5, 0))),
  sphere: (w = 10, h = 6) => prim(`sph${w}:${h}`, () => flat(new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2))),
  ico: () => prim('ico', () => flat(new THREE.IcosahedronGeometry(1, 0).translate(0, 1, 0).scale(1, .5, 1))),
  // a gable roof: ridge along z, base width 1 (x), height 1 (y), length 1 (z)
  gable: () => prim('gable', () => {
    const a = [-.5, 0, -.5], b = [.5, 0, -.5], c = [0, 1, -.5], d = [-.5, 0, .5], e = [.5, 0, .5], f = [0, 1, .5];
    const tris = [a, c, b, d, e, f, a, d, f, a, f, c, b, c, f, b, f, e, a, b, e, a, e, d];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3)); g.computeVertexNormals(); return g;
  }),
  // a house: walls to 0.62 of the height, a gable roof above with a small overhang (no floor)
  house: () => prim('house', () => {
    const P = [], C = [], w = [.5, .5], t = [.5, 0, .5];
    const wall = col('#f1e9d8'), roof = col('#b4573a'), roofD = col('#93442c');
    const push = (pts, c) => pts.forEach((p) => { P.push(...p); C.push(c.r, c.g, c.b); });
    const H = .62, X = .5, Z = .5, O = .58;
    const quad = (a, b, c, d, cc) => push([a, b, c, a, c, d], cc);
    quad([-X, 0, Z], [X, 0, Z], [X, H, Z], [-X, H, Z], wall); quad([X, 0, -Z], [-X, 0, -Z], [-X, H, -Z], [X, H, -Z], wall);
    quad([X, 0, Z], [X, 0, -Z], [X, H, -Z], [X, H, Z], wall); quad([-X, 0, -Z], [-X, 0, Z], [-X, H, Z], [-X, H, -Z], wall);
    // roof: ridge along z
    quad([-O, H, O], [O, H, O], [0, 1, O], [0, 1, O], roofD); // front gable (degenerate quad = one triangle)
    quad([O, H, -O], [-O, H, -O], [0, 1, -O], [0, 1, -O], roofD);
    quad([-O, H, O], [0, 1, O], [0, 1, -O], [-O, H, -O], roof); quad([O, H, -O], [0, 1, -O], [0, 1, O], [O, H, O], roof);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
    void w; void t; return g;
  }),
  houseFar: () => prim('houseFar', () => flat(new THREE.BoxGeometry(1, .72, 1).translate(0, .36, 0)).setAttribute('color', new THREE.Float32BufferAttribute(new Array(36 * 3).fill(0).map((_, i) => [.78, .66, .52][i % 3]), 3))),
};

const M = new THREE.Matrix4(), N = new THREE.Matrix3(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P3 = new THREE.Vector3(), E = new THREE.Euler();

export class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; this.tris = 0; }
  /** stamp a unit geometry: position (x, y = base, z), scale (sx, sy, sz), yaw ry, optional pitch rx / roll rz, colour (hex or Color) */
  put(g, x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, ao = .22) {
    const c = typeof color === 'string' ? col(color) : color;
    E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); P3.set(x, y, z); S.set(sx, sy, sz); M.compose(P3, Q, S); N.getNormalMatrix(M);
    const pos = g.attributes.position, nor = g.attributes.normal, cc = g.attributes.color, n = pos.count;
    const top = g.boundingBox.max.y || 1;
    for (let i = 0; i < n; i++) {
      V.fromBufferAttribute(pos, i); const k = 1 - ao + ao * Math.min(1, Math.max(0, V.y / top));
      V.applyMatrix4(M); this.p.push(V.x, V.y, V.z);
      V.fromBufferAttribute(nor, i).applyMatrix3(N).normalize(); this.n.push(V.x, V.y, V.z);
      if (cc) this.c.push(cc.getX(i) * c.r * k, cc.getY(i) * c.g * k, cc.getZ(i) * c.b * k); else this.c.push(c.r * k, c.g * k, c.b * k);
    }
    this.tris += n / 3;
  }
  box(x, y, z, w, h, d, color, ry = 0) { this.put(unit.box(), x, y, z, w, h, d, color, ry); }
  /** a column: an open tapered shaft and one capital block (28 triangles, 20 in LITE) */
  col(x, y, z, r, h, color, lite = false) { this.put(unit.shaft(lite ? 6 : 8, .8), x, y, z, r, h, r, color); this.put(unit.box(), x, y + h, z, r * 2.5, r * .5, r * 2.5, PAL.marbleD); if (!lite) this.put(unit.box(), x, y, z, r * 2.3, r * .3, r * 2.3, PAL.marbleD); }
  cyl(x, y, z, r, h, color, seg = 8, top = 1) { this.put(unit.cyl(seg, top), x, y, z, r, h, r, color); }
  cone(x, y, z, r, h, color, seg = 8) { this.put(unit.cone(seg), x, y, z, r, h, r, color); }
  roof(x, y, z, w, h, d, color, ry = 0) { this.put(unit.gable(), x, y, z, w, h, d, color, ry); }
  dome(x, y, z, r, color, seg = 14) { this.put(unit.sphere(seg, 6), x, y, z, r, r, r, color, 0, 0, 0, .35); }
  /** any geometry (indexed or not, with normals), not unit: used for lathes and extrusions */
  geo(g, x, y, z, color, ry = 0, sx = 1, sy = 1, sz = 1, ao = .3) {
    const n = flat(g); n.computeBoundingBox(); this.put(n, x, y, z, sx, sy, sz, color, ry, 0, 0, ao);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeBoundingSphere(); return g;
  }
}
