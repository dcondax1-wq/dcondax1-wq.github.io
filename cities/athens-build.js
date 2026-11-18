// ATHENS monuments, built into two merged batches (marble/stone/terracotta = one draw, bronze/gold = one draw).
// Every function takes the batches and a position; y is read from the plan's terrain so nothing floats.
import * as THREE from '../jarvis/three.module.min.js';
import { Batch, PAL } from './athens-geo.js';
import { groundY, COAST, WALL, insideWall, riverDist, LOT, ACROPOLIS } from './athens-plan.js';
import { rng, hash32 } from './util.js';

const rot = (x, z, a, lx, lz) => [x + lx * Math.cos(a) + lz * Math.sin(a), z - lx * Math.sin(a) + lz * Math.cos(a)];

/** a column: tapered shaft + capital + base block. */
function column(S, x, y, z, r, h, c = PAL.marble) { S.col(x, y, z, r, h, c, S.lite); }

/** peristyle temple. nx x nz columns, length L (local x), width W (local z); yaw a. */
export function temple(S, G, o) {
  const { x, z, a = 0, nx, nz, L, W, h, roofH = 4.2, wall = PAL.lime, tint } = o, y0 = o.y ?? groundY(x, z);
  const P = (lx, lz) => rot(x, z, a, lx, lz);
  S.box(x, y0, z, L + 6, .7, W + 6, PAL.stone, a); S.box(x, y0 + .7, z, L + 4.4, .6, W + 4.4, PAL.marbleD, a); S.box(x, y0 + 1.3, z, L + 2.8, .6, W + 2.8, PAL.marble, a);
  const base = y0 + 1.9;
  const [cx, cz] = P(0, 0); S.box(cx, base, cz, L * .76, h * .96, W * .58, wall, a);
  const cols = [];
  for (let i = 0; i < nx; i++) { const lx = -L / 2 + (L * i) / (nx - 1); cols.push([lx, -W / 2], [lx, W / 2]); }
  for (let j = 1; j < nz - 1; j++) { const lz = -W / 2 + (W * j) / (nz - 1); cols.push([-L / 2, lz], [L / 2, lz]); }
  for (const [lx, lz] of cols) { const [px, pz] = P(lx, lz); column(S, px, base, pz, Math.min(1.05, L / nx * .22), h); }
  const top = base + h + Math.min(1.05, L / nx * .22) * .5;
  S.box(cx, top, cz, L + 2.2, 1.5, W + 2.2, PAL.marble, a);
  S.box(cx, top + 1.5, cz, L + 2.4, .35, W + 2.4, tint || PAL.gold, a);
  S.roof(cx, top + 1.85, cz, W + 2.4, roofH, L + 2.4, PAL.terra, a + Math.PI / 2);
  for (const e of [-1, 1]) { const [px, pz] = P(e * (L / 2 + 1.1), 0); S.roof(px, top + 1.85, pz, W + 2.6, roofH * .96, .6, PAL.marbleD, a + Math.PI / 2); G.cyl(px, top + 1.85 + roofH, pz, .5, 1.3, PAL.gold, 6); }
  return { top: top + 1.85 + roofH, base };
}

/** the Parthenon: 8 x 17 columns, bronze statue of Athena before it. */
function parthenon(S, G, L) {
  const t = temple(S, G, { x: L.x, z: L.z, a: Math.PI / 2, nx: 17, nz: 8, L: 72, W: 31, h: 10.4, roofH: 4.2, tint: PAL.gold });
  const sx = L.x + 6, sz = L.z + 44, y = groundY(sx, sz);
  S.box(sx, y, sz, 5, 2.6, 5, PAL.marbleD); G.cyl(sx, y + 2.6, sz, .9, 7, PAL.bronze, 6, .55); G.cone(sx, y + 9.6, sz, .6, 1.6, PAL.gold, 6); G.cyl(sx + 1.8, y + 2.6, sz, .12, 12, PAL.bronzeD, 4);
  L.top = t.top; L.sx = sx; L.sz = sz;
}

/** a small temple of an app: a plinth, 4 front columns, a coloured frieze band and a pediment; the banner pole carries the app colour. */
export function appTemple(S, G, app, colour) {
  const x = app.x, z = app.z, y = groundY(x, z), a = 0, h = 4.6;
  S.box(x, y, z, 17, .5, 19, PAL.stone); S.box(x, y + .5, z, 15.6, .45, 17.6, PAL.marbleD);
  const b = y + .95;
  S.box(x, b, z - 1.5, 11, h, 11, PAL.lime);
  for (let i = 0; i < 4; i++) column(S, x - 5.4 + i * 3.6, b, z + 6, .62, h);
  S.box(x, b + h, z + 1, 14.4, .9, 14, PAL.marble);
  S.box(x, b + h + .9, z + 1, 14.5, .6, 14.1, colour);
  S.roof(x, b + h + 1.5, z + 1, 14.4, 3.3, 14.4, PAL.terra, Math.PI / 2 * 0);
  S.box(x, b + h + 1.5, z + 8.1, 12.8, .2, .3, PAL.marbleD);
  G.cyl(x + 7.4, b, z + 8.4, .14, 7.4, PAL.bronzeD, 4); S.box(x + 7.4 + .85, b + 5.4, z + 8.4, 1.7, 1.6, .1, colour);
  G.cone(x, b + h + 4.8, z + 1, .32, 1.2, PAL.gold, 6);
  app.top = b + h + 6; app.y = y;
}

function theatre(S, G, L) {
  const rows = 26, run = 1.75, rise = .82, r0 = 14, y0 = groundY(L.x, L.z + 20);
  const pts = [];
  for (let i = 0; i < rows; i++) { pts.push(new THREE.Vector2(r0 + i * run, i * rise)); pts.push(new THREE.Vector2(r0 + i * run, (i + 1) * rise)); }
  pts.push(new THREE.Vector2(r0 + rows * run, rows * rise)); pts.push(new THREE.Vector2(r0 + rows * run, 0));
  const lathe = new THREE.LatheGeometry(pts, S.lite ? 20 : 36, Math.PI / 2 + .12, Math.PI - .24);
  S.geo(lathe, L.x, y0, L.z, PAL.lime, 0, 1, 1, 1, .4);
  for (let k = 0; k < 7; k++) { const a = Math.PI / 2 + .12 + (Math.PI - .24) * (k / 6); S.box(L.x + Math.sin(a) * (r0 + rows * run / 2), y0 + rows * rise / 2 - .4, L.z + Math.cos(a) * (r0 + rows * run / 2), rows * run * .98, .15, 1.0, PAL.stoneD, a - Math.PI / 2); }
  S.cyl(L.x, y0, L.z, r0 - .4, .25, PAL.sand, 28); S.cyl(L.x, y0 + .25, L.z, 2.6, .2, PAL.stone, 12);
  const sz = L.z + r0 + 4;
  S.box(L.x, y0, sz, 38, 8, 6, PAL.lime); for (let i = 0; i < 9; i++) column(S, L.x - 16 + i * 4, y0, sz + 3.8, .5, 5.4);
  S.box(L.x, y0 + 8, sz, 39, .8, 6.4, PAL.marble); S.roof(L.x, y0 + 8.8, sz, 7, 2, 38, PAL.terraD, Math.PI / 2);
  L.top = y0 + 14;
}

function agora(S, G, L) {
  const y = groundY(L.x, L.z) + .02;
  S.box(L.x, y, L.z, 170, .35, 124, PAL.paving); S.box(L.x, y + .35, L.z, 164, .12, 118, '#cdbd9c');
  S.box(L.x, y + .1, L.z + 30, 6, .4, 70, PAL.stone);        // the sacred way across the square
  const r = rng(hash32('agora'));
  for (let i = 0; i < 26; i += S.lite ? 2 : 1) {
    const sx = L.x - 70 + (i % 13) * 11.6, sz = L.z + (i < 13 ? -24 : 30) + (r() - .5) * 3, sy = y + .35;
    S.box(sx, sy, sz, 1.8, 1.4, 1.8, PAL.marbleD); G.cyl(sx, sy + 1.4, sz, .38, 3.3, PAL.bronze, 6, .8); G.dome(sx, sy + 4.5, sz, .42, PAL.bronze, 6);
  }
  S.box(L.x, y + .35, L.z, 7, 1.2, 7, PAL.marbleD); S.box(L.x, y + 1.55, L.z, 4.4, 1, 4.4, PAL.marble);
  G.cyl(L.x, y + 2.55, L.z, 1.1, 9, PAL.bronze, 8, .5); G.dome(L.x, y + 11.5, L.z, 1.1, PAL.bronze, 8); G.cone(L.x, y + 12.4, L.z, .3, 3, PAL.gold, 6);
  G.cyl(L.x + 2.9, y + 2.55, L.z, .12, 14, PAL.bronzeD, 4);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; S.cyl(L.x + Math.cos(a) * 50, y + .35, L.z + Math.sin(a) * 36, 1.1, 5.2, PAL.timber, 6); S.cyl(L.x + Math.cos(a) * 50, y + 4.6, L.z + Math.sin(a) * 36, 3.4, 3.2, PAL.olive, 7, .5); }
  L.top = y + 16;
}

function stoa(S, G, L) {
  const y = groundY(L.x, L.z), len = 92, a = 0;
  S.box(L.x, y, L.z, len + 4, 1, 21, PAL.stone); const b = y + 1;
  S.box(L.x, b, L.z - 6, len, 15, 3, PAL.lime);
  for (let lvl = 0; lvl < 2; lvl++) for (let i = 0; i < 24; i++) column(S, L.x - len / 2 + i * len / 23, b + lvl * 7.4, L.z + 6.5, lvl ? .5 : .62, 6.2);
  S.box(L.x, b + 6.2, L.z + 1, len + 2, 1.2, 15, PAL.marble); S.box(L.x, b + 13.6, L.z + 1, len + 2, 1, 15, PAL.marble);
  S.roof(L.x, b + 14.6, L.z + 1, 16, 3.4, len + 3, PAL.terra, Math.PI / 2 * 0 + Math.PI / 2);
  void a; L.top = b + 18;
}

function tholos(S, G, L) {
  const y = groundY(L.x, L.z);
  S.cyl(L.x, y, L.z, 11, .8, PAL.stone, 14); S.cyl(L.x, y + .8, L.z, 10, .5, PAL.marbleD, 14);
  S.cyl(L.x, y + 1.3, L.z, 6.6, 7.4, PAL.lime, 12);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; column(S, L.x + Math.cos(a) * 9, y + 1.3, L.z + Math.sin(a) * 9, .55, 6.6); }
  S.cyl(L.x, y + 7.9, L.z, 10.4, 1, PAL.marble, 14); S.cone(L.x, y + 8.9, L.z, 10.5, 6.6, PAL.terra, 14); G.cone(L.x, y + 15.3, L.z, .5, 2.4, PAL.gold, 6);
  L.top = y + 18;
}

function porch(S, G, L) {       // Erechtheion: a small temple + the porch of maidens
  temple(S, G, { x: L.x, z: L.z, a: Math.PI / 2, nx: 6, nz: 4, L: 22, W: 13, h: 6.4, roofH: 2.6 });
  const y = groundY(L.x, L.z), px = L.x + 14, pz = L.z - 4;
  S.box(px, y, pz, 8, 1.3, 7, PAL.marbleD); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; S.cyl(px + Math.cos(a) * 2.5, y + 1.3, pz + Math.sin(a) * 2.5, .42, 4.2, PAL.marble, 6); }
  S.box(px, y + 5.5, pz, 7.4, .8, 6.6, PAL.marble); L.top = y + 12;
}

function propylaea(S, G, L) {
  const y = ACROPOLIS.top;
  S.box(L.x, y - 40, L.z + 6, 44, 40, 16, PAL.stone); S.box(L.x, y - 30, L.z + 18, 14, 30, 12, PAL.stoneD);   // the bastion and the ramp
  temple(S, G, { x: L.x, z: L.z, y: y, a: 0, nx: 6, nz: 2, L: 22, W: 9, h: 7, roofH: 3, wall: PAL.lime });
  L.top = y + 14;
}

function library(S, G, L) {
  const y = groundY(L.x, L.z), W = 74;
  S.box(L.x, y, L.z, 112, .9, 66, PAL.stone); S.box(L.x, y + .9, L.z, 108, .5, 62, PAL.paving);
  S.box(L.x, y + 1.4, L.z - 6, W, 24, 30, PAL.lime); S.box(L.x, y + 25.4, L.z - 6, W + 2, 1.6, 31, PAL.marble);
  for (let i = 0; i < 12; i++) column(S, L.x - W / 2 + i * W / 11, y + 1.4, L.z + 13, .95, 17);
  S.box(L.x, y + 18.4, L.z + 13, W + 2, 1.4, 6, PAL.marble); S.roof(L.x, y + 26.8, L.z - 6, 31, 6.4, W + 3, PAL.terra, Math.PI / 2);
  S.roof(L.x, y + 19.8, L.z + 13, 7, 4.2, W + 2.4, PAL.terraD, Math.PI / 2);
  for (let i = 0; i < 14; i++) S.box(L.x - 33 + i * 5, y + 8, L.z + 8.8, 1.6, 6, .4, PAL.dark);   // window slits
  for (const e of [-1, 1]) { S.box(L.x + e * 42, y + 1.4, L.z - 8, 20, 16, 22, PAL.lime); S.roof(L.x + e * 42, y + 17.4, L.z - 8, 22, 4.4, 22, PAL.terra); }
  G.dome(L.x, y + 28, L.z - 6, 12, PAL.bronze, 16); G.cone(L.x, y + 40, L.z - 6, .7, 4, PAL.gold, 6);
  for (let i = 0; i < 6; i++) S.box(L.x - 22 + i * 8.8, y + .9, L.z + 24, 5, 1.8, 2, PAL.marbleD);
  L.top = y + 46;
}

function gym(S, G, L) {
  const y = groundY(L.x, L.z), s = 40;
  S.box(L.x, y, L.z, 92, .6, 92, PAL.stone); S.box(L.x, y + .6, L.z, 70, .15, 70, PAL.sand);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (let i = 0; i < 14; i++) { const lx = -s + i * 2 * s / 13, [px, pz] = rot(L.x, L.z, a, lx, -s); column(S, px, y + .6, pz, .6, 5.6); }
    const [bx, bz] = rot(L.x, L.z, a, 0, -s - 4.5); S.box(bx, y + .6, bz, 90, 7.2, 3, PAL.lime, a);
    const [rx, rz] = rot(L.x, L.z, a, 0, -s - 1.6); S.roof(rx, y + 6.2, rz, 10, 3, 90, PAL.terra, a + Math.PI / 2);
  }
  for (const [dx, dz] of [[-14, -8], [12, 10]]) { S.box(L.x + dx, y + .75, L.z + dz, 2, 1, 2, PAL.marbleD); G.cyl(L.x + dx, y + 1.75, L.z + dz, .4, 3, PAL.bronze, 6, .7); G.dome(L.x + dx, y + 4.8, L.z + dz, .45, PAL.bronze, 6); }
  S.cyl(L.x, y + .75, L.z, 6, .5, PAL.marbleD, 14); S.cyl(L.x, y + 1.25, L.z, 5, .2, PAL.water, 14);
  L.top = y + 12;
}

function stadium(S, G, L) {
  const y = groundY(L.x, L.z), len = 80, rw = 24, rows = 18, run = 1.7, rise = .8;
  S.box(L.x, y, L.z, rw * 2, .3, len, PAL.sand);
  for (const e of [-1, 1]) for (let i = 0; i < rows; i++) S.box(L.x + e * (rw + i * run + run / 2), y, L.z, run + .06, (i + 1) * rise, len, i % 6 === 5 ? PAL.marble : PAL.lime);
  const pts = []; for (let i = 0; i < rows; i++) { pts.push(new THREE.Vector2(rw + i * run, i * rise)); pts.push(new THREE.Vector2(rw + i * run, (i + 1) * rise)); }
  pts.push(new THREE.Vector2(rw + rows * run, rows * rise)); pts.push(new THREE.Vector2(rw + rows * run, 0));
  S.geo(new THREE.LatheGeometry(pts, 24, -Math.PI / 2, Math.PI), L.x, y, L.z + len / 2, PAL.lime, 0, 1, 1, 1, .4);   // the round end: x = r sin, z = r cos (z > 0 half)
  S.cyl(L.x, y, L.z + len / 2, rw, .3, PAL.sand, 20);
  S.box(L.x, y, L.z - len / 2 - 2, rw * 2 + 6, 7, 3, PAL.marble); S.box(L.x, y + 7, L.z - len / 2 - 2, rw * 2 + 8, 1, 4, PAL.stone);
  for (let i = 0; i < 4; i++) column(S, L.x - 12 + i * 8, y, L.z - len / 2 - 4.5, .6, 7);
  for (let i = 0; i < 9; i++) S.box(L.x - 21 + i * 5.3, y + .3, L.z - len / 2 + 3, .25, .05, 12, PAL.white);
  G.cyl(L.x, y, L.z - len / 2 - 8, .5, 9, PAL.bronze, 6, .6); G.dome(L.x, y + 9.4, L.z - len / 2 - 8, .6, PAL.gold, 6);
  L.top = y + 18;
}

function harbour(S, G, L) {
  const r = rng(hash32('harbour'));
  for (let x = -230; x <= 210; x += 18) { const z = COAST(x) - 7; S.box(x, -.1, z, 18.2, 1.3, 13, PAL.stone); S.box(x, 1.2, z + 5.5, 18.2, .5, 2, PAL.stoneD); if ((x / 18 | 0) % 2 === 0) G.cyl(x + 6, 1.2, z + 5, .35, .9, PAL.bronzeD, 5); }
  for (let k = 0; k < 11; k++) {                               // ship sheds, side by side, roofs facing the water
    const x = -160 + k * 26, z = COAST(x) - 34; S.box(x, 0, z, 17, 6.5, 40, PAL.lime); S.roof(x, 6.5, z, 19, 4.2, 42, PAL.terra); S.box(x, 0, z + 20.1, 12, 5, .4, PAL.dark);
  }
  for (let k = 0; k < 6; k++) { const x = -220 + k * 90 + r() * 10, z = COAST(x) - 66; S.box(x, 0, z, 24, 8, 18, PAL.ochre); S.roof(x, 8, z, 26, 4, 20, PAL.terraD, Math.PI / 2); }
  // temple of Aphrodite on the quay
  temple(S, G, { x: 190, z: COAST(190) - 42, a: 0, nx: 5, nz: 4, L: 14, W: 10, h: 5, roofH: 2.4 });
  // the breakwater (west arm) and the mole to the lighthouse (east arm)
  for (let t = 0; t <= 1.001; t += 1 / 16) { const x = -240 + 90 * Math.sin(t * 1.35), z = COAST(-240) + 4 + 130 * t * t + 40 * t; S.box(x, -.4, z, 16, 2.4, 14, PAL.stone); }
  for (let t = 0; t <= 1.001; t += 1 / 10) { const x = 150 + 56 * t, z = COAST(150) + 2 + 40 * t; S.box(x, -.4, z, 14, 2.1, 12, PAL.stone, 0); }
  L.top = 14;
}

function lighthouse(S, G, L) {
  const x = L.x, z = L.z, y = 0;
  S.box(x, y - .4, z, 22, 6.4, 22, PAL.stone); S.box(x, y + 6, z, 14, 5, 14, PAL.lime);
  S.cyl(x, y + 11, z, 5.6, 26, PAL.marble, 10, .72); S.cyl(x, y + 37, z, 4, 3, PAL.marbleD, 10, 1.1);
  S.cyl(x, y + 40, z, 3.4, 12, PAL.lime, 8, .85); S.cyl(x, y + 52, z, 4, 1.2, PAL.marble, 8);
  G.cyl(x, y + 53.2, z, 2.6, 4.8, PAL.gold, 8, 1.0); G.cone(x, y + 58, z, 3.5, 4, PAL.bronze, 8); G.dome(x, y + 62, z, .6, PAL.gold, 6);
  L.top = 63; L.beacon = [x, y + 55.5, z];
}

function market(S, G, L) {
  const r = rng(hash32('market'));
  S.box(15, 0, 180, 18, .12, 112, PAL.paving); S.box(15, .1, 180, 2, .12, 112, PAL.stone);
  for (let z = 128; z <= 228; z += 9) for (const x of [-30, -12, 42, 60]) if (r() > .15) {
    const hue = [PAL.terra, PAL.ochre, PAL.blue, PAL.white, '#a35c70'][Math.floor(r() * 5)], ry = x < 15 ? 0 : Math.PI;
    S.box(x, 0, z, 4, 1.1, 2.4, PAL.timber); S.box(x + (x < 15 ? .9 : -.9), 2.6, z, 3.4, .22, 3.2, hue, 0); S.box(x - 1.5, 0, z - 1.1, .2, 2.7, .2, PAL.timber); S.box(x + 1.5, 0, z + 1.1, .2, 2.7, .2, PAL.timber);
    void ry;
  }
  // fountain house at the junction
  S.cyl(15, 0, 120, 6.4, 1.1, PAL.stone, 14); S.cyl(15, 1.1, 120, 5.4, .3, PAL.water, 14); S.cyl(15, 1.1, 120, .9, 3.4, PAL.marble, 8, .6); G.dome(15, 4.5, 120, 1, PAL.bronze, 8);
  L.top = 6;
}

/** the aqueduct: arches in a row from the eastern hills to the city */
function aqueduct(S, G, L) {
  const shape = new THREE.Shape(); shape.moveTo(-5.2, 0); shape.lineTo(5.2, 0); shape.lineTo(5.2, 14); shape.lineTo(-5.2, 14); shape.lineTo(-5.2, 0);
  const hole = new THREE.Path(); hole.moveTo(-3.5, 0); hole.lineTo(3.5, 0); hole.lineTo(3.5, 7.5); hole.absarc(0, 7.5, 3.5, 0, Math.PI, false); hole.lineTo(-3.5, 0); shape.holes.push(hole);
  const arch = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false, curveSegments: 7 }).translate(0, 0, -3);
  const z = -215, x0 = 568, x1 = 188, n = Math.round((x0 - x1) / 10.4);
  for (let i = 0; i < n; i++) { const x = x0 - i * (x0 - x1) / (n - 1), hh = riverDist(x, z) < 40 ? 1.25 : 1, yy = groundY(x, z); S.geo(arch, x, yy, z, PAL.lime, 0, 1, hh, 1, .35); }
  S.box((x0 + x1) / 2, 14.6, z, x0 - x1 + 10, 2.4, 7.4, PAL.marbleD); S.box((x0 + x1) / 2, 17, z, x0 - x1 + 10, .5, 4.2, PAL.water);
  S.box((x1 - 6), 0, z, 6, 16, 9, PAL.stone); G.cone(x1 - 6, 16, z, 5, 4, PAL.bronze, 6);
}

function bridge(S, G, L) {
  const shape = new THREE.Shape(); shape.moveTo(-26, 0); shape.lineTo(26, 0); shape.lineTo(26, 4.4); shape.lineTo(-26, 4.4); shape.lineTo(-26, 0);
  for (const cx of [-14.5, 0, 14.5]) { const h = new THREE.Path(); h.moveTo(cx - 5.6, 0); h.lineTo(cx + 5.6, 0); h.absarc(cx, 0, 5.6, 0, Math.PI, false); shape.holes.push(h); }
  const arch = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -4.5);
  S.geo(arch, L.x, .4, L.z, PAL.lime, 0, 1, 1, 1, .3);
  S.box(L.x, 4.8, L.z - 4.2, 52, 1.2, .8, PAL.marbleD); S.box(L.x, 4.8, L.z + 4.2, 52, 1.2, .8, PAL.marbleD);
  for (const e of [-1, 1]) for (const k of [-24, -8, 8, 24]) G.cyl(L.x + k, 4.8, L.z + e * 4.2, .3, 3.2, PAL.bronzeD, 5), G.dome(L.x + k, 8, L.z + e * 4.2, .45, PAL.gold, 6);
  L.top = 10;
}

/** the city wall: segments along the ellipse, towers, four gates. Skips the sea side and the river. */
function walls(S, G) {
  const N = 120, gates = [Math.PI, Math.PI * 1.27, Math.PI * 1.5, Math.PI * 1.78, 0];
  const pt = (t) => [WALL.cx + Math.cos(t) * WALL.a, WALL.cz + Math.sin(t) * WALL.b];
  const info = [];
  for (let k = 0; k < N; k++) {
    const t0 = k / N * Math.PI * 2, t1 = (k + 1) / N * Math.PI * 2, [x0, z0] = pt(t0), [x1, z1] = pt(t1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (mz > COAST(mx) - 26 || riverDist(mx, mz) < 24) continue;
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), y = groundY(mx, mz);
    if (gates.some((g) => Math.abs(((t0 - g + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < .035)) continue;
    S.box(mx, y, mz, len + .6, 12, 5.2, PAL.stone, ry); S.box(mx, y + 12, mz, len + .6, 1, 6.2, PAL.marbleD, ry);
    if (!S.lite) for (let m = 0; m < 3; m++) { const f = (m - 1) * len / 3, [bx, bz] = rot(mx, mz, ry, f, 2.6); S.box(bx, y + 13, bz, len / 5, 1.2, .8, PAL.stone, ry); }
    info.push([k, mx, mz, y]);
  }
  for (let k = 0; k < N; k += 4) {
    const [x, z] = pt(k / N * Math.PI * 2); if (z > COAST(x) - 26 || riverDist(x, z) < 24) continue;
    const y = groundY(x, z); S.cyl(x, y, z, 5.2, 19, PAL.stone, 8, .92); S.cyl(x, y + 19, z, 6, 1.1, PAL.marbleD, 8); S.cone(x, y + 20.1, z, 6.3, 5.6, PAL.terra, 8);
  }
  for (const g of gates) {
    const [x, z] = pt(g); if (z > COAST(x) - 26) continue;
    const y = groundY(x, z), ry = -Math.atan2(Math.cos(g) * WALL.b, -Math.sin(g) * WALL.a);
    for (const e of [-1, 1]) { const [px, pz] = rot(x, z, ry, e * 11, 0); S.cyl(px, y, pz, 6.6, 26, PAL.lime, 8, .9); S.cone(px, y + 26, pz, 7.2, 7, PAL.terra, 8); G.dome(px, y + 33, pz, .7, PAL.gold, 6); }
    S.box(x, y + 15, z, 18, 4, 7, PAL.marble, ry); const [fx, fz] = rot(x, z, ry, 0, 3.8); G.box(fx, y + 16, fz, 12, 1.4, .3, PAL.gold, ry);
  }
}

/** terrain-level streets: avenues, lot courts and the paved sacred way */
function streets(S, G) {
  for (let i = -17; i <= 17; i++) if (i % 5 === 0) {                 // north-south avenues
    let start = null;
    for (let z = -430; z <= 300; z += 10) {
      const x = i * LOT, ok = insideWall(x, z, .96) && z < COAST(x) - 26 && riverDist(x, z) > 18 && Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) > ACROPOLIS.base + 6;
      if (ok && start === null) start = z; if ((!ok || z >= 300) && start !== null) { const e = ok ? z : z - 10; if (e - start > 12) S.box(x, .06, (start + e) / 2, 14, .22, e - start + 10, PAL.stone); start = null; }
    }
  }
  for (let j = -14; j <= 10; j++) if (j % 5 === 0) {
    let start = null;
    for (let x = -540; x <= 540; x += 10) {
      const z = j * LOT, ok = insideWall(x, z, .96) && z < COAST(x) - 26 && riverDist(x, z) > 18 && Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) > ACROPOLIS.base + 6;
      if (ok && start === null) start = x; if ((!ok || x >= 540) && start !== null) { const e = ok ? x : x - 10; if (e - start > 12) S.box((start + e) / 2, .06, z, e - start + 10, .22, 14, PAL.stone); start = null; }
    }
  }
}

/** a pale paved court under every lot (so the grid reads) */
function courts(S, plan, taken) {
  for (const l of plan.lots) if (l.free && (!S.lite || taken.has(l))) S.box(l.x, .02, l.z, 23, .18, 23, taken.has(l) ? PAL.paving : '#b9aa8c');
}

export function buildStatic(plan, lite = false) {
  const S = new Batch(), G = new Batch(); S.lite = G.lite = lite;
  const by = Object.fromEntries(plan.landmarks.map((l) => [l.id, l]));
  const fn = { parthenon, propylaea, erechtheion: porch, library, agora, stoa, tholos, hephaisteion: (s, g, L) => { temple(s, g, { x: L.x, z: L.z, a: Math.PI / 2, nx: 13, nz: 6, L: 32, W: 15, h: 6.4, roofH: 3, tint: PAL.bronze }); L.top = groundY(L.x, L.z) + 16; },
    theatre, gymnasium: gym, stadium, harbour, lighthouse, market, aqueduct, 'bridge-n': bridge, 'bridge-s': bridge };
  for (const id of Object.keys(fn)) { const t0 = S.tris + G.tris; fn[id](S, G, by[id]); if (globalThis.__prof) console.log(id, S.tris + G.tris - t0); }
  walls(S, G); streets(S, G);
  const taken = new Set(plan.lots.filter((l) => plan.apps.some((a) => a.x === l.x && a.z === l.z)));
  courts(S, plan, taken);
  for (const app of plan.apps) appTemple(S, G, app, app.colour);
  return { stone: S.geometry(), metal: G.geometry(), tris: S.tris + G.tris };
}
