// The Random city: a seed (a short a-z 0-9 word) makes one valid city spec out of ANY dataset, so there are effectively unlimited
// cities and a seed is a share link (?seed=ab12cd or #r-ab12cd). Deterministic: the same seed and the same data give the same city.
// Pure: no DOM, no three.js. The spec it returns passes generator.validateSpec like any entry of cities.json.
import { hash32, rng, clamp } from './util.js';
import { ENUMS } from './generator.js';
import { DATASET_GROUP } from './datasets.js';

/** the datasets a random city may use (the private vault is never picked by chance) */
export const RANDOM_DATASETS = ['trades', 'harbor', 'sessions', 'months', 'streaks', 'levels', 'combos', 'vix', 'tree', 'forge', 'gods', 'feeds', 'evals', 'evalspeed', 'arena', 'library', 'workshop', 'plans', 'kalshi'];
const ADJ = ['Neon', 'Quiet', 'Gilded', 'Hollow', 'Rapid', 'Velvet', 'Frozen', 'Solar', 'Lunar', 'Crimson', 'Silent', 'Electric', 'Amber', 'Cobalt', 'Wild', 'Stellar', 'Marble', 'Ghost', 'Jade', 'Iron'];
const NOUN = ['Reach', 'Harbor', 'Heights', 'Terrace', 'Basin', 'Quarter', 'Spire', 'Yard', 'Ridge', 'Gardens', 'Crossing', 'Docks', 'Plateau', 'Row', 'Commons', 'Summit'];
const hsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
};

export const cleanSeed = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
/** a fresh seed from a number generator (the page passes Date-based bits; tests pass fixed ones) */
export function newSeed(r) { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(r() * A.length)]; return s; }
export const seedDataset = (seed) => RANDOM_DATASETS[hash32('ds:' + seed) % RANDOM_DATASETS.length];

const distinct = (items, key, cap = 6000) => { const set = new Set(); const step = Math.max(1, Math.floor(items.length / cap)); for (let i = 0; i < items.length; i += step) { set.add(String(items[i].f[key])); if (set.size > 80) break; } return set.size; };
const numeric = (items, key) => { let ok = true, lo = Infinity, hi = -Infinity; const step = Math.max(1, Math.floor(items.length / 3000)); for (let i = 0; i < items.length; i += step) { const v = items[i].f[key]; if (typeof v !== 'number' || !Number.isFinite(v)) { ok = false; break; } lo = Math.min(lo, v); hi = Math.max(hi, v); } return ok && hi > lo; };

/** One valid spec from a seed and a loaded dataset (ds.fields, ds.items). */
export function randomSpec(seed, ds) {
  seed = cleanSeed(seed) || 'seed';
  const r = rng(hash32('rnd:' + seed)), pick = (a) => a[Math.floor(r() * a.length)];
  const keys = ds.fields.map((f) => f.key), items = ds.items;
  const cats = keys.filter((k) => { const n = distinct(items, k); return n >= 2 && n <= 40; });
  const nums = keys.filter((k) => !['t', 'idx'].includes(k) && numeric(items, k));
  const district = cats.length ? pick(cats) : keys[0];
  const hpool = nums.filter((k) => k !== district);
  const height = hpool.length ? pick(hpool) : nums[0] || keys[0];
  const signed = items.some((it) => typeof it.f[height] === 'number' && it.f[height] < 0);
  const tf = signed ? pick(['abs', 'abs', '']) : pick(['', 'sqrt', 'log']);
  const glowKey = pick(hpool.length ? hpool : [height]), winKey = pick(hpool.length ? hpool : [height]);
  const layouts = items.length > 300 ? ['districts', 'districts', 'clock', 'spiral', 'terrain'] : ['districts', 'districts', 'clock', 'spiral'];
  let layout = pick(layouts);
  if (layout === 'clock' && distinct(items, district) > 30) layout = 'districts';
  const hue = Math.floor(r() * 360), kind = pick(ENUMS.landmark), sky = pick(ENUMS.sky), weather = pick(ENUMS.weather);
  const name = `${pick(ADJ)} ${pick(NOUN)}`, base = DATASET_GROUP[ds.id] || { group: 'research', region: 'Random' };
  const colorMode = layout === 'terrain' ? `ramp:${height}` : signed && keys.includes('usd') && height !== 'usd' ? 'sign:usd' : signed ? `sign:${height}` : pick(['district', `ramp:${height}`]);
  const hexes = (i) => hsl(hue + i * 47 + (i % 2) * 8, 78 + (i % 3) * 6, 58 + (i % 4) * 3);
  const skyP = {
    night: [hsl(hue, 55, 3), hsl(hue, 55, 10), hsl(hue + 15, 60, 24)], dusk: [hsl(hue + 200, 40, 9), hsl(hue + 330, 55, 28), hsl(hue + 15, 90, 58)], dawn: [hsl(hue + 210, 45, 14), hsl(hue + 20, 60, 44), hsl(hue + 30, 90, 74)],
    day: [hsl(214, 62, 44), hsl(204, 66, 66), hsl(hue, 55, 84)], storm: [hsl(hue, 20, 5), hsl(hue, 22, 14), hsl(hue, 25, 26)], void: [hsl(hue + 20, 70, 2), hsl(hue, 70, 8), hsl(hue - 30, 80, 20)],
    aurora: [hsl(hue + 240, 50, 3), hsl(hue + 200, 55, 9), hsl(hue + 160, 60, 20)], ember: [hsl(hue, 50, 4), hsl(18, 70, 16), hsl(24, 90, 40)],
  }[sky];
  const dField = ds.fields.find((f) => f.key === district), hField = ds.fields.find((f) => f.key === height);
  const spec = {
    id: 'r-' + seed, name, motto: `A random city from ${ds.title}: ${String(hField ? hField.label : height).toLowerCase()} by ${String(dField ? dField.label : district).toLowerCase()}.`.slice(0, 90),
    group: base.group, region: 'Random', dataset: ds.id, layout, district_by: district, height_by: tf ? `${tf}:${height}` : height, glow_by: glowKey, window_by: `rank:${winKey}`, color_by: colorMode,
    arrange: layout === 'terrain' || layout === 'spiral' ? 'grid' : 'peak', district_order: 'key', height_range: [2, clamp(48 + Math.floor(r() * 40), 40, 90)], seed,
    palette: { up: hsl(150, 80, 56), down: hsl(352, 85, 62), low: hsl(hue - 25, 70, 30), mid: hsl(hue + 5, 85, 52), high: hsl(hue + 38, 95, 72), accent: hsl(hue, 92, 62), ground: hsl(hue, 45, 5), fog: hsl(hue, 50, 7), districts: Array.from({ length: 8 }, (_, i) => hexes(i)) },
    landmark: { kind, at: 'front', label: `The ${pick(ADJ)} ${kind[0].toUpperCase() + kind.slice(1)}` }, sky: { kind: sky, top: skyP[0], mid: skyP[1], low: skyP[2], stars: sky === 'day' ? 0 : 0.2 + r() * 0.75 },
    weather, sound: pick(ENUMS.sound), scenery: pick(ENUMS.scenery),
    card: [...new Set([...keys.filter((k) => k !== district && k !== height && k !== 't'), height])].slice(0, 6),
  };
  if (layout === 'terrain') spec.smooth = 2;
  return spec;
}
