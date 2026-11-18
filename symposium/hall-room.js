// SYMPOSIUM hall: the room itself (2026-11-11, the environment art pass; olympus/env-kit.js). hall.js keeps the people, the camera and the talk;
// this file only builds the place: a polished marble floor with a mosaic ring and Greek-key borders under the couches, a mosaic medallion under
// the table, a ring of fluted Doric columns with a painted triglyph frieze, a timber-coffered peristyle ceiling, a round wall behind it with an
// oxblood dado, ivory plaster and a key band, three doorways, marble busts on plinths, amphorae, bronze tripod braziers, couches (klinai) with
// linen mattresses and coloured bolsters, a marble table with bronze cups, plates of food, an ewer and a krater, contact shadows, the golden
// HDRI. Every material is ONE draw (the builder merges by material); the props are one draw per kind.
//   buildRoom(scene, rc, layout, { nCouch, couchAt, specsColour(c) }) -> { kit, group, floor, rug, columns, couches, fires: [[x, y, z]], flames (InstancedMesh),
//     nB, brazierAt(i), tableR, ready (Promise), stats() }
import * as THREE from '../jarvis/three.module.min.js';
import { envKit, ringGeo, discGeo, bandGeo, latheGeo, boxGeo, mat4 } from '../olympus/env-kit.js';

const CUSH = ['#b5563c', '#7f8a52', '#4b7a99', '#c8a24a', '#a9764c'];
const uvScale = (g, sx, sy) => { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return g; };

function meander(g, w, h) {                         // a running Greek key, terracotta on cream, with two rules: tiles every h px
  g.fillStyle = '#e8dcc2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8f4127'; const u = h / 10;
  g.fillRect(0, 0, w, u * 0.9); g.fillRect(0, h - u * 0.9, w, u * 0.9);
  g.strokeStyle = '#8f4127'; g.lineWidth = u * 0.95; g.lineCap = 'square'; g.lineJoin = 'miter';
  for (let x0 = 0; x0 < w; x0 += h) {
    const P = [[0, 8], [0, 2], [7, 2], [7, 7], [3, 7], [3, 4.5], [5, 4.5]], k = h / 10;
    g.beginPath(); P.forEach((p, i) => { const X = x0 + (p[0] + 1) * k, Y = (p[1]) * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke();
    g.beginPath(); g.moveTo(x0 + 1 * k, 8 * k); g.lineTo(x0 + 11 * k, 8 * k); g.stroke();
  }
}
function fresco(g, w, h) {                           // a Pompeian panel: red field, black frame, a thin gold line, a small garland and a bird
  g.fillStyle = '#2a1c16'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8e2f22'; g.fillRect(14, 14, w - 28, h - 28);
  g.strokeStyle = '#c8a24a'; g.lineWidth = 2; g.strokeRect(26, 26, w - 52, h - 52);
  g.fillStyle = 'rgba(255,220,180,0.06)'; for (let i = 0; i < 260; i++) g.fillRect((i * 71) % w, (i * 37) % h, 3, 2);
  const cx = w / 2, cy = h * 0.5;
  g.strokeStyle = '#6f7a46'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 64, cy - 70); g.quadraticCurveTo(cx, cy - 30, cx + 64, cy - 70); g.stroke();
  g.fillStyle = '#7f8a52'; for (let i = 0; i <= 8; i++) { const t = i / 8, x = cx - 64 + 128 * t, y = cy - 70 + 40 * 4 * t * (1 - t) * 0.5 + 0; g.beginPath(); g.ellipse(x, y + 6, 7, 3.5, 0.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e9d6b0'; g.beginPath(); g.ellipse(cx, cy + 22, 22, 12, -0.2, 0, Math.PI * 2); g.fill();          // a dove
  g.beginPath(); g.arc(cx + 20, cy + 12, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(cx - 18, cy + 22); g.lineTo(cx - 40, cy + 14); g.lineTo(cx - 34, cy + 30); g.fill();
  g.beginPath(); g.moveTo(cx - 6, cy + 16); g.quadraticCurveTo(cx - 2, cy - 12, cx + 10, cy + 8); g.fill();
  g.fillStyle = '#c8a24a'; g.beginPath(); g.moveTo(cx + 27, cy + 11); g.lineTo(cx + 34, cy + 13); g.lineTo(cx + 27, cy + 15); g.fill();
}
function frieze(g, w, h) {                          // Doric frieze: blue-grey triglyphs with grooves, terracotta metopes with a cream amphora or a laurel wreath
  const n = 4, cw = w / n;
  for (let i = 0; i < n; i++) {
    const x = i * cw;
    if (i % 2 === 0) {
      g.fillStyle = '#3d4152'; g.fillRect(x, 0, cw * 0.62, h);
      g.fillStyle = '#2a2d3a'; for (const f of [0.18, 0.4]) g.fillRect(x + cw * 0.62 * f, h * 0.08, cw * 0.62 * 0.13, h * 0.84);
      g.fillStyle = '#b5563c'; g.fillRect(x + cw * 0.62, 0, cw * 0.38, h);
    } else {
      g.fillStyle = '#b5563c'; g.fillRect(x, 0, cw, h);
      g.fillStyle = '#ecdcbc'; const cx = x + cw / 2, cy = h / 2;
      if (i % 4 === 1) {                              // an amphora
        g.beginPath(); g.ellipse(cx, cy + h * 0.06, cw * 0.16, h * 0.26, 0, 0, Math.PI * 2); g.fill();
        g.fillRect(cx - cw * 0.05, cy - h * 0.32, cw * 0.1, h * 0.18); g.fillRect(cx - cw * 0.1, cy - h * 0.36, cw * 0.2, h * 0.05);
        g.fillRect(cx - cw * 0.04, cy + h * 0.3, cw * 0.08, h * 0.08);
        g.lineWidth = h * 0.035; g.strokeStyle = '#ecdcbc'; g.beginPath(); g.arc(cx - cw * 0.14, cy - h * 0.14, h * 0.1, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(cx + cw * 0.14, cy - h * 0.14, h * 0.1, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
      } else {                                         // a laurel wreath
        g.strokeStyle = '#ecdcbc'; g.lineWidth = h * 0.03; g.beginPath(); g.arc(cx, cy, h * 0.28, 0.5, Math.PI * 2 - 0.5); g.stroke();
        for (let k = 0; k < 14; k++) { const a = 0.6 + (k / 13) * (Math.PI * 2 - 1.2); g.beginPath(); g.ellipse(cx + Math.cos(a) * h * 0.28, cy + Math.sin(a) * h * 0.28, h * 0.07, h * 0.03, a + 1.2, 0, Math.PI * 2); g.fill(); }
      }
      g.fillStyle = '#8f3f28'; g.fillRect(x, 0, cw, h * 0.05); g.fillRect(x, h * 0.95, cw, h * 0.05);
    }
  }
  g.fillStyle = 'rgba(30,20,12,0.18)'; for (let i = 0; i < 400; i++) g.fillRect((i * 97) % w, (i * 53) % h, 2, 2);     // a little wear
}

export function buildRoom(scene, rc, Lay, o) {
  const r = Lay.r, kit = envKit({ rc, tier: rc.quality(), envI: 0.32 }), B = kit.builder();
  const nCol = Math.max(10, Math.min(22, Math.round((r + 3.4) * 1.9))), R2 = r + 3.3, R3 = R2 + 2.4, CH = 4.2, tr = Math.max(0.9, r * 0.32);
  kit.painted('paint:meander', 512, 64, meander, { rough: 0.7 });
  kit.painted('paint:frieze', 1024, 256, frieze, { rough: 0.85 });
  // ---- the floor: marble, a mosaic ring with key borders under the couches, a mosaic medallion under the table
  B.add('marble:uv', discGeo(R3 + 0.4, 72), mat4(0, 0, 0), '#b9ab93');
  B.add('mosaic:uv', ringGeo(r - 1.0, r + 0.95, 96), mat4(0, 0.004, 0), '#8a6a52');
  for (const [a, b] of [[r - 1.16, r - 1.0], [r + 0.95, r + 1.11]]) B.add('paint:meander', uvScale(ringGeo(a, b, 128), 1 / (0.16 * 8), 1 / 0.16), mat4(0, 0.005, 0));
  B.add('mosaic:uv', discGeo(tr + 0.55, 48), mat4(0, 0.004, 0), '#9a7a5e');
  B.add('paint:meander', uvScale(ringGeo(tr + 0.55, tr + 0.7, 64), 1 / (0.15 * 8), 1 / 0.15), mat4(0, 0.005, 0));
  // ---- the colonnade, the entablature ring (inner faces: architrave, painted frieze, cornice), the coffered ceiling, the round wall
  const colAt = (i) => (i / nCol) * Math.PI * 2 + Math.PI / nCol;
  for (let i = 0; i < nCol; i++) { const a = colAt(i); B.column({ x: Math.sin(a) * R2, z: Math.cos(a) * R2, h: CH, r: 0.27, ry: a, flutes: 20, color: '#ddd3c1' }); }
  B.add('marble:uv', bandGeo(R2 - 0.36, CH, 0.44, 96, true), mat4(0, 0, 0), '#e8e0d2');
  B.add('marble:uv', bandGeo(R2 + 0.36, CH, 0.44, 96, false), mat4(0, 0, 0), '#e8e0d2');
  B.add('marble:uv', ringGeo(R2 - 0.36, R2 + 0.36, 96), mat4(0, CH + 0.002, 0, 0, 1, Math.PI), '#ddd3c3');                        // the architrave's soffit
  B.add('paint:frieze', uvScale(bandGeo(R2 - 0.33, CH + 0.44, 0.48, 96, true), 1 / (0.48 * 4), 1 / 0.48), mat4(0, 0, 0));
  B.add('marble:uv', bandGeo(R2 - 0.5, CH + 0.92, 0.2, 96, true), mat4(0, 0, 0), '#efe8dc');
  B.add('marble:uv', ringGeo(R2 - 0.5, R2 - 0.33, 96), mat4(0, CH + 0.92, 0, 0, 1, Math.PI), '#d8cebd');
  B.add('wood:uv', ringGeo(R2 - 0.33, R3 + 0.1, 96), mat4(0, CH + 0.88, 0, 0, 1, Math.PI), '#7a5434');                           // the ceiling
  for (let i = 0; i < nCol * 2; i++) { const a = (i / (nCol * 2)) * Math.PI * 2 + Math.PI / nCol; const m = (R2 + R3) / 2; B.add('wood:uv', boxGeo(0.16, 0.18, R3 - R2 + 0.3), mat4(Math.sin(a) * m, CH + 0.78, Math.cos(a) * m, a), '#5e3f26'); }
  // the wall: three doorways (gaps), an oxblood dado, ivory plaster, a key band, more plaster up to the ceiling; a stone base course
  const doors = [0.35, 0.35 + (Math.PI * 2) / 3, 0.35 + (Math.PI * 4) / 3], gap = 1.7 / R3;
  for (let k = 0; k < 3; k++) {
    const a0 = doors[k] + gap / 2, a1 = doors[(k + 1) % 3] - gap / 2 + (k === 2 ? Math.PI * 2 : 0), seg = 48;
    B.add('ashlar:uv', bandGeo(R3, 0, 0.3, seg, true, a0, a1), null, '#bfae93');
    B.add('plaster:uv', bandGeo(R3, 0.3, 0.9, seg, true, a0, a1), null, '#7a3122');
    B.add('plaster:uv', bandGeo(R3, 1.2, 2.25, seg, true, a0, a1), null, '#cdb894');
    B.add('paint:meander', uvScale(bandGeo(R3, 3.45, 0.32, seg * 2, true, a0, a1), 1 / (0.32 * 8), 1 / 0.32), null);
    B.add('plaster:uv', bandGeo(R3, 3.77, CH + 0.88 - 3.77, seg, true, a0, a1), null, '#c7b08a');
    // the doorway: two ashlar posts and a lintel
    const dA = doors[k], cx = Math.sin(dA) * R3, cz = Math.cos(dA) * R3, tx = Math.cos(dA), tz = -Math.sin(dA);
    for (const s of [-1, 1]) B.add('ashlar:uv', boxGeo(0.34, 3.0, 0.5), mat4(cx + tx * s * 1.0, 1.5, cz + tz * s * 1.0, dA), '#cdbd9f');
    B.add('ashlar:uv', boxGeo(2.4, 0.4, 0.56), mat4(cx, 3.2, cz, dA), '#cdbd9f');
    B.add('plaster:uv', boxGeo(2.0, CH + 0.88 - 3.4, 0.3), mat4(cx, 3.4 + (CH + 0.88 - 3.4) / 2, cz, dA), '#e3d6c0');
  }
  // frescoes between the doorways: Pompeian red panels with a black frame and a small painted vignette; a bronze shield above every other one
  kit.painted('paint:fresco', 256, 320, fresco, { rough: 0.9 });
  const panels = [];
  for (let k = 0; k < 3; k++) { const a0 = doors[k], a1 = doors[(k + 1) % 3] + (k === 2 ? Math.PI * 2 : 0); for (let j = 1; j <= 3; j++) panels.push(a0 + ((a1 - a0) * j) / 4); }
  panels.forEach((a, j) => {
    const R = R3 - 0.04, x = Math.sin(a) * R, z = Math.cos(a) * R, g = new THREE.PlaneGeometry(1.25, 1.56); g.rotateY(Math.PI);
    B.add('paint:fresco', g, mat4(x, 2.2, z, a));
    if (j % 2 === 0) B.add('bronze', latheGeo([[0.0001, 0.07], [0.18, 0.06], [0.3, 0.03], [0.34, 0], [0.0001, 0]], 20), mat4(Math.sin(a) * (R3 - 0.08), 3.95, Math.cos(a) * (R3 - 0.08), a + Math.PI, 1, Math.PI / 2));
  });
  // ---- the couches (one per pair of seats), in the pair's cushion colour
  for (let c = 0; c < Lay.couches; c++) {
    const k = o.couchAt(Lay, c), w = k.wide ? 1.5 : 0.8;
    B.kline({ x: k.x, z: k.z, ry: k.ry, w, d: 0.66, h: 0.13, color: CUSH[c % CUSH.length], cushion: false, wood: '#6b4a2a', seg: 6 });
  }
  // ---- the table: a marble top on a turned pedestal, bronze cups (kylikes)
  B.add('marble:uv', new THREE.CylinderGeometry(tr, tr * 0.98, 0.07, 48), mat4(0, 0.42, 0), '#d6cab6');
  B.add('marble:uv', latheGeo([[tr * 0.45, 0], [tr * 0.42, 0.04], [tr * 0.2, 0.1], [tr * 0.14, 0.24], [tr * 0.22, 0.36], [tr * 0.3, 0.39], [0.0001, 0.39]], 28), mat4(0, 0, 0), '#e2d8c6');
  const nCup = Math.min(10, Math.max(4, Math.round(Lay.seats.length / 4)));
  for (let i = 0; i < nCup; i++) { const a = (i / nCup) * Math.PI * 2 + 0.3; B.add('bronze', latheGeo([[0.0001, 0], [0.03, 0], [0.012, 0.02], [0.012, 0.035], [0.075, 0.05], [0.09, 0.075], [0.085, 0.078]], 14), mat4(Math.sin(a) * tr * 0.74, 0.455, Math.cos(a) * tr * 0.74)); }
  // ---- braziers between the columns, plinths for the busts by the wall
  const nB = 4, brazierAt = (i) => { const a = (i / nB) * Math.PI * 2 + Math.PI / 4; return [Math.sin(a) * (r + 1.9), Math.cos(a) * (r + 1.9)]; };
  for (let i = 0; i < nB; i++) { const p = brazierAt(i); B.brazier({ x: p[0], z: p[1], h: 0.95, r: 0.3 }); }
  const bustA = [], amphA = [];
  for (let i = 0; i < 4; i++) { const a = doors[i % 3] + (i < 3 ? 0.42 : -0.42); bustA.push(a); }
  for (let i = 0; i < 4; i++) amphA.push(doors[i % 3] + (i < 3 ? -0.78 : 0.78));
  for (const a of bustA) B.add('marble:uv', boxGeo(0.44, 1.05, 0.44), mat4(Math.sin(a) * (R3 - 0.45), 0.525, Math.cos(a) * (R3 - 0.45), a), '#e6ded0');
  const group = B.build(scene);
  // ---- props and hero models (each kind one draw): busts, amphorae (and the krater on the table), an ewer, plates of food, candles
  const ready = Promise.all([
    kit.hero(scene, 'bust', bustA.map((a) => [Math.sin(a) * (R3 - 0.45), 1.05, Math.cos(a) * (R3 - 0.45), a + Math.PI, 1])),
    kit.hero(scene, 'amphora', amphA.map((a) => [Math.sin(a) * (R3 - 0.55), 0, Math.cos(a) * (R3 - 0.55), a, 1.35]).concat([[0, 0.455, 0, 0.4, 0.55]]), { color: '#b8653d', rough: 0.55 }),
    kit.hero(scene, 'ewer', [[tr * 0.35, 0.455, -tr * 0.3, 0.6, 0.7]], { envI: 1.2 }),
    kit.place(scene, 'dungeon', [0, 1, 2].map((k) => { const a = k * 2.094 + 1.0; return ['plate_food_A', Math.sin(a) * tr * 0.45, 0.455, Math.cos(a) * tr * 0.45, a, 0.34]; })
      .concat(bustA.slice(0, 3).map((a) => ['candle_triple', Math.sin(a + 0.2) * (R3 - 0.5), 0, Math.cos(a + 0.2) * (R3 - 0.5), a, 0.8]))
      .concat(doors.flatMap((a) => [-1, 1].map((sd) => { const b = a + sd * (1.45 / R3); return ['torch_mounted', Math.sin(b) * (R3 - 0.02), 2.0, Math.cos(b) * (R3 - 0.02), b + Math.PI, 1.3]; })))),
  ]);
  // contact shadows: couches, the table, braziers, plinths, amphorae
  const blobs = [];
  for (let c = 0; c < Lay.couches; c++) { const k = o.couchAt(Lay, c); blobs.push([k.x, k.z, k.wide ? 0.95 : 0.55, 1, 0.008, 0.45, k.ry]); }
  blobs.push([0, 0, tr + 0.2]);
  for (let i = 0; i < nB; i++) { const p = brazierAt(i); blobs.push([p[0], p[1], 0.45]); }
  for (const a of bustA) blobs.push([Math.sin(a) * (R3 - 0.45), Math.cos(a) * (R3 - 0.45), 0.42]);
  for (const a of amphA) blobs.push([Math.sin(a) * (R3 - 0.55), Math.cos(a) * (R3 - 0.55), 0.38]);
  kit.blobs(scene, blobs, { opacity: 0.5, y: 0.009 });
  // the flames over the braziers (the embers, smoke and light are fx-cine's)
  const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb860').multiplyScalar(1.5) });
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.32, 7), flame, nB); flames.frustumCulled = false; scene.add(flames);
  const fires = []; for (let i = 0; i < nB; i++) { const p = brazierAt(i); fires.push([p[0], 1.2, p[1]]); flames.setMatrixAt(i, mat4(p[0], 1.2, p[1])); }
  const byName = (n) => group.children.find((m) => m.name === 'ek:' + n) || null;
  kit.env('golden');
  return { kit, group, ready, nB, brazierAt, fires, flames, tableR: tr, R2, R3,
    floor: byName('marble:uv'), rug: byName('mosaic:uv'), columns: byName('marble:uv'), couches: byName('wood:uv'),
    stats: () => kit.stats(),
    dispose() { flames.geometry.dispose(); flame.dispose(); kit.dispose(); } };
}
