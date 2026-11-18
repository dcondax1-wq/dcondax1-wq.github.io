// AGORA shape drawings (olympus/shapes2d.js, 2026-11-10): one 64 x 64 line drawing per shape of shapes3d.js, as plain data ([tag, attrs] for svg path / rect / circle / ellipse,
// stroke = currentColor). The never-blank fallback of every 3D shape: the gallery's shelf icons, the 2D stand-in when WebGL is missing, OLYMPUS_SHAPES.mount's flat mode.
// Pure data: no DOM, no three.js (node-tested). svgNodes(doc, id) builds the elements with createElementNS (never innerHTML).

const P = (d, extra) => ['path', Object.assign({ d }, extra || {})];
const R = (x, y, w, h, extra) => ['rect', Object.assign({ x, y, width: w, height: h }, extra || {})];
const C = (cx, cy, r, extra) => ['circle', Object.assign({ cx, cy, r }, extra || {})];
const E = (cx, cy, rx, ry, extra) => ['ellipse', Object.assign({ cx, cy, rx, ry }, extra || {})];
export const GLYPHS = {
  doric: [R(17, 8, 30, 7), P('M24 15v34M32 15v34M40 15v34'), R(15, 49, 34, 6)],
  ionic: [R(15, 8, 34, 5), C(23, 20, 5), C(41, 20, 5), P('M27 25v24M37 25v24'), R(15, 49, 34, 6)],
  temple: [P('M7 25 32 9l25 16Z'), R(10, 25, 44, 4), P('M15 29v22M25 29v22M39 29v22M49 29v22'), R(5, 51, 54, 6)],
  lighthouse: [P('M23 57 27 26h10l4 31Z'), R(25, 17, 14, 9), P('M26 17l6-9 6 9'), P('M12 14l8 3M52 14l-8 3M32 3v2')],
  obelisk: [P('M27 55 29 19 32 8l3 11 2 36Z'), R(21, 55, 22, 4)],
  sundial: [E(32, 40, 25, 11), P('M32 40V16l13 24Z'), P('M13 40h4M47 40h4M20 33l3 3M44 33l-3 3')],
  hourglass: [P('M16 7h32M16 57h32'), P('M19 7c0 14 13 16 13 25S19 43 19 57M45 7c0 14-13 16-13 25s13 11 13 25'), P('M25 50h14')],
  owl: [E(32, 39, 15, 18), C(25, 29, 5.5), C(39, 29, 5.5), P('M30 34l2 5 2-5Z'), P('M19 12l7 11M45 12l-7 11'), P('M24 52v5M40 52v5')],
  scroll: [R(15, 15, 34, 34, { rx: 2 }), E(15, 32, 4, 17), E(49, 32, 4, 17), P('M22 25h22M22 32h22M22 39h14')],
  amphora: [P('M26 7h12M28 7v10M36 7v10'), P('M28 17C14 23 14 41 23 50l4 7h10l4-7c9-9 9-27-5-33'), P('M28 14c-9 0-9 9-2 9M36 14c9 0 9 9 2 9')],
  coinstack: [E(20, 50, 11, 4), E(20, 43, 11, 4), E(20, 36, 11, 4), P('M9 36v14M31 36v14'), E(45, 50, 11, 4), E(45, 43, 11, 4), P('M34 43v7M56 43v7')],
  scales: [P('M32 10v42M18 20h28'), P('M10 38l8-18 8 18ZM38 38l8-18 8 18Z'), P('M10 38h16M38 38h16'), P('M22 54h20')],
  pillarbar: [R(9, 38, 9, 17), R(20, 28, 9, 27), R(31, 34, 9, 21), R(42, 18, 9, 37), P('M5 56h54')],
  trireme: [P('M7 39h50l-7 10H16Z'), P('M32 39V9'), P('M32 11h14v19H32Z'), P('M4 55q7-4 14 0t14 0 14 0 14 0')],
  laurel: [P('M32 56C13 53 7 34 11 14M32 56c19-3 25-22 21-42'), E(14, 26, 2.5, 5), E(12, 38, 2.5, 5), E(20, 47, 2.5, 5), E(50, 26, 2.5, 5), E(52, 38, 2.5, 5), E(44, 47, 2.5, 5), P('M29 57l-4 5M35 57l4 5')],
  shield: [C(32, 32, 23), C(32, 32, 9), P('M32 9v14M32 41v14M9 32h14M41 32h14')],
  helmet: [P('M13 38C13 21 21 10 32 10s19 11 19 28v17h-9V40H22v15h-9Z'), P('M19 13c7-9 19-9 26 0'), P('M32 28v12')],
  lyre: [P('M19 56C9 45 11 26 21 12M45 56c10-11 8-30-2-44'), P('M19 13h26'), P('M26 13v40M32 13v40M38 13v40'), E(32, 52, 14, 5)],
  brazier: [P('M15 28h34l-7 13H22Z'), P('M24 41l-6 16M40 41l6 16M32 41v16'), P('M32 5c8 8 9 14 0 19-9-5-8-11 0-19Z')],
  olivetree: [P('M32 56V34'), P('M26 56h12'), E(32, 22, 20, 13), E(19, 31, 10, 7), E(45, 31, 10, 7)],
  chariot: [C(24, 44, 11), P('M24 33v22M13 44h22'), P('M24 44h26V26H36'), P('M50 38h10')],
  cornucopia: [P('M8 12C6 38 22 54 50 46L58 26C40 26 22 22 8 12Z'), C(54, 18, 4), C(46, 14, 3.5), C(58, 10, 3)],
  kylix: [P('M8 24h48c0 10-8 16-24 16S8 34 8 24Z'), P('M32 40v12M22 54h20'), P('M8 24c-6 0-6 8 0 8M56 24c6 0 6 8 0 8')],
  redvase: [P('M22 8h20l-3 8c10 6 12 20 6 30l-3 4H22l-3-4C13 36 15 22 25 16Z'), P('M17 28h30'), P('M16 22c-6 2-6 12 0 14M48 22c6 2 6 12 0 14')],
  bust: [C(32, 18, 9), P('M23 52c0-14 4-20 9-20s9 6 9 20Z'), R(14, 52, 36, 6), P('M25 12c2-6 12-6 14 0')],
  anchor: [P('M32 8v48M24 18h16'), C(32, 8, 3), P('M12 40c0 10 10 16 20 16s20-6 20-16'), P('M12 40l-4-6M52 40l4-6')],
  stele: [P('M18 56V16L32 6l14 10v40Z'), P('M24 30h16M24 36h16M24 42h16M24 48h10'), P('M12 56h40')],
  tetradrachm: [C(32, 32, 24), C(32, 32, 19), E(32, 37, 7, 10), C(28, 26, 2.5), C(36, 26, 2.5), P('M30 29l2 3 2-3')],
  harp: [P('M16 54V40L48 8v46H16'), P('M22 46v6M28 38v14M34 30v22M40 22v30')],
  caduceus: [P('M32 6v52'), C(32, 8, 3), P('M32 14c-12-6-20 0-22 4M32 14c12-6 20 0 22 4'), P('M32 22c-10 4-10 10 0 14s10 10 0 14'), P('M32 22c10 4 10 10 0 14s-10 10 0 14')],
  pegasus: [P('M12 32c8-6 22-6 30 0l6-14 8 4-6 12v22'), P('M16 34v20M26 36v18M42 38v16'), P('M24 28C20 12 34 6 44 14C38 12 32 18 34 28')],
  sandal: [P('M10 50c8 4 36 4 44-4v-6c-10 2-20-2-24-10l-10 4v8c-4 2-8 4-10 8Z'), P('M44 24c8-8 14-8 16-12-2 8-6 12-12 14M44 28c8-4 12-4 16-6-2 6-6 8-12 10')],
  bow: [P('M20 6C4 24 4 40 20 58'), P('M20 6v52'), P('M20 32h38M52 28l6 4-6 4')],
  swordspear: [P('M14 56L44 8'), P('M50 56L20 8'), P('M40 14l8-6-2 10Z'), P('M20 8l-3 10 8-3Z')],
  trophy: [P('M20 8h24c0 18-4 26-12 26S20 26 20 8Z'), P('M20 12c-10 0-10 12 2 14M44 12c10 0 10 12-2 14'), P('M32 34v12M26 46h12v10H26Z'), P('M20 58h24')],
  goldbars: [P('M6 52h26l5-9H11Z'), P('M32 52h26l-5-9H37Z'), P('M19 43h26l5-9H24Z')],
  vaultdoor: [R(8, 8, 48, 48, { rx: 4 }), C(32, 32, 16), C(32, 32, 5), P('M32 16v32M16 32h32M21 21l22 22M43 21L21 43')],
  fountain: [P('M8 50h48'), P('M12 50c0-6 6-8 20-8s20 2 20 8'), P('M32 42V22'), P('M20 28c0-5 5-6 12-6s12 1 12 6'), P('M32 22c-8-6-14 0-14 8M32 22c8-6 14 0 14 8')],
  stoa: [P('M4 18h56l-6-8H10Z'), P('M10 18v30M22 18v30M34 18v30M46 18v30'), R(4, 48, 56, 6)],
  dolphin: [P('M8 44C12 20 32 12 48 26l8-6v10c-4 2-8 2-10 0-4 12-20 20-38 14Z'), P('M28 18l8-10 2 12'), C(44, 26, 1.5)],
  mosaic: [R(8, 8, 48, 48), R(16, 16, 32, 32), R(24, 24, 16, 16), P('M8 8l16 16M56 8L40 24M8 56l16-16M56 56L40 40')],
};

/** the drawing of `id` as svg child elements for the document `doc` (an unknown id gets the Doric column) */
export function svgNodes(doc, id) {
  const NS = 'http://www.w3.org/2000/svg';
  return (GLYPHS[id] || GLYPHS.doric).map(([tag, attrs]) => { const e = doc.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; });
}
