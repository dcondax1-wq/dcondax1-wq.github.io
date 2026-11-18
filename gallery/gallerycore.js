// AGORA GALLERY core (pure maths and data, node-tested): the shelf (41 shapes in five categories), the scene builder's hash and ring layout, the collection layout, the 2D drawings used as the never-blank fallback and as
// the shelf icons, wrap-around stepping, the camera distance that fits a stage, the quality choice and the drag inertia. No DOM, no three.js.
// shapes3d.js (olympus/) owns the real list of shapes; fixture.json mirrors its names and meanings, a test keeps the two equal.

export const GROUPS = ['Architecture', 'Objects', 'Beasts', 'Money', 'Sea'];
export const MODES = ['auto', 'high', 'lite'];
export const MODE_LABEL = { auto: 'Auto', high: 'High', lite: 'Lite' };

import { GLYPHS } from '../olympus/shapes2d.js';
export { GLYPHS };

const CAT_OF = {'doric': 'Architecture', 'ionic': 'Architecture', 'temple': 'Architecture', 'obelisk': 'Architecture', 'stele': 'Architecture', 'stoa': 'Architecture', 'fountain': 'Architecture', 'mosaic': 'Architecture', 'sundial': 'Objects', 'hourglass': 'Objects', 'scroll': 'Objects', 'redvase': 'Objects', 'kylix': 'Objects', 'brazier': 'Objects', 'lyre': 'Objects', 'harp': 'Objects', 'shield': 'Objects', 'helmet': 'Objects', 'laurel': 'Objects', 'bust': 'Objects', 'caduceus': 'Objects', 'sandal': 'Objects', 'bow': 'Objects', 'swordspear': 'Objects', 'olivetree': 'Objects', 'chariot': 'Objects', 'owl': 'Beasts', 'pegasus': 'Beasts', 'dolphin': 'Beasts', 'coinstack': 'Money', 'scales': 'Money', 'pillarbar': 'Money', 'tetradrachm': 'Money', 'goldbars': 'Money', 'vaultdoor': 'Money', 'amphora': 'Money', 'cornucopia': 'Money', 'trophy': 'Money', 'trireme': 'Sea', 'anchor': 'Sea', 'lighthouse': 'Sea'};
export const DEFAULT_ITEMS = Object.keys(GLYPHS).map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), means: 'A classical shape of the Agora.', group: CAT_OF[id] || GROUPS[0] }));

/** the shelf from the fixture: [{ id, name, means, group }] in fixture order, junk dropped; the built-in list if nothing usable (never blank) */
export function shelf(fx) {
  const out = [], seen = {};
  const src = fx && Array.isArray(fx.shapes) ? fx.shapes : [];
  for (const s of src) {
    if (!s || typeof s.id !== 'string' || !GLYPHS[s.id] || seen[s.id]) continue;
    seen[s.id] = 1;
    out.push({ id: s.id, name: String(s.name || s.id).slice(0, 40), means: String(s.means || '').slice(0, 220), group: GROUPS.indexOf(s.group) >= 0 ? s.group : GROUPS[0] });
  }
  return out.length ? out : DEFAULT_ITEMS.map((s) => Object.assign({}, s));
}
/** [{ name, items:[...] }] in group order, empty groups left out */
export function grouped(items) {
  return GROUPS.map((name) => ({ name, items: items.filter((s) => s.group === name) })).filter((g) => g.items.length);
}
/** previous / next with wrap-around; any junk becomes 0 */
export function step(i, d, n) {
  n = Math.max(1, Math.floor(Number(n)) || 1);
  const k = Math.floor(Number(i)) || 0;
  return (((k + (Math.floor(Number(d)) || 0)) % n) + n) % n;
}
export function indexOf(items, id) { const k = items.findIndex((s) => s.id === id); return k < 0 ? 0 : k; }
export const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** the camera distance that keeps a stage of `halfW` x `halfH` world units in view at vertical field of view `fovDeg` and the stage's aspect; `focus` moves in */
export function fitDistance(fovDeg, aspect, halfW, halfH, focus) {
  const t = Math.tan(((Number(fovDeg) || 34) * Math.PI) / 360), a = Math.max(0.3, Number(aspect) || 1);
  const d = Math.max(halfH / t, halfW / (t * a)) + 0.4;
  return focus ? d * 0.78 : d;
}
/** which quality a choice means: auto follows the render core's own level */
export function modeFor(choice, autoLevel) {
  const m = MODES.indexOf(choice) >= 0 ? choice : 'auto';
  const lite = m === 'lite' || (m === 'auto' && (autoLevel === 'low' || autoLevel === 'off'));
  return { mode: m, lite, level: m === 'high' ? 'high' : m === 'lite' ? 'low' : null };
}
/** drag inertia: the turn speed (rad / s) after dt seconds, gone in about a second; below 0.02 it stops */
export function inertia(v, dt) { const k = v * Math.exp(-3.2 * Math.max(0, dt)); return Math.abs(k) < 0.02 ? 0 : k; }
/** a tap, not a drag: moved less than 8 px and was down for under 450 ms */
export function isTap(movedPx, ms) { return movedPx < 8 && ms < 450; }
/** the line under the name: "Shape 3 of 19" */
export function position(i, n) { return `Shape ${i + 1} of ${n}`; }
/** plain words for a quality level */
export function qualityWords(lite) { return lite ? 'Lite: fewer, simpler pieces for a light phone' : 'High: full detail'; }

// ------------------------------------------------------------------ category filter, scene builder, collection
export const MAX_BUILD = 6;
/** the shapes of one category ('All' or anything unknown = everything) */
export function filter(items, cat) { return GROUPS.indexOf(cat) < 0 ? items.slice() : items.filter((s) => s.group === cat); }
/** add or take out a shape of the scene (at most `max`): { ids, added, full } */
export function toggleId(ids, id, max) {
  const m = Math.max(1, Math.floor(Number(max)) || MAX_BUILD), k = ids.lastIndexOf(id);
  if (k >= 0) return { ids: ids.slice(0, k).concat(ids.slice(k + 1)), added: false, full: false };
  if (ids.length >= m) return { ids: ids.slice(), added: false, full: true };
  return { ids: ids.concat([id]), added: true, full: false };
}
/** '#b=owl,temple' (the link that restores a layout); an empty scene is '#b=' */
export function makeHash(ids) { return '#b=' + ids.join(','); }
/** the layout in a #hash: only known shapes, at most `max`; null when the hash is not a layout */
export function parseHash(hash, known, max) {
  const m = /^#?b=([a-z0-9,]*)$/.exec(String(hash || ''));
  if (!m) return null;
  const set = {}; (known || []).forEach((k) => { set[k] = 1; });
  return m[1].split(',').filter((x) => set[x]).slice(0, Math.max(1, Math.floor(Number(max)) || MAX_BUILD));
}
/** n places on a ring (shapes face outward): [{ x, z, ry }] ; one shape stands in the middle */
export function ring(n, radius) {
  n = Math.max(0, Math.floor(Number(n)) || 0);
  if (n === 1) return [{ x: 0, z: 0, ry: 0 }];
  const r = Number(radius) || 2, out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, ry: a }); }
  return out;
}
export const ringRadius = (n) => (n <= 1 ? 0 : Math.max(1.3, n * 0.4));
/** all shapes in concentric rings around the middle (the collection): { places: [{ x, z, ry }], outer } */
export function collection(n, spacing) {
  n = Math.max(0, Math.floor(Number(n)) || 0);
  const sp = Number(spacing) || 1.7, out = [];
  if (n) out.push({ x: 0, z: 0, ry: 0 });
  let k = 1;
  while (out.length < n) {
    const cap = Math.floor(2 * Math.PI * k), take = Math.min(cap, n - out.length);
    for (let i = 0; i < take; i++) { const a = (i / take) * Math.PI * 2 + k * 0.4; out.push({ x: Math.sin(a) * k * sp, z: Math.cos(a) * k * sp, ry: a }); }
    k++;
  }
  return { places: out, outer: (k - 1) * sp };
}
/** the ring radius that keeps every neighbour clear: radii = each shape's own footprint radius (half its diagonal), gap in world units */
export function ringFit(radii, gap) {
  const r = (radii || []).map((v) => Math.max(0, Number(v) || 0)), n = r.length, g = Number.isFinite(Number(gap)) ? Number(gap) : 0.18;
  if (n <= 1) return 0;
  let R = 0.9;
  for (let i = 0; i < n; i++) R = Math.max(R, (r[i] + r[(i + 1) % n] + g) / (2 * Math.sin(Math.PI / n)));
  return R;
}
