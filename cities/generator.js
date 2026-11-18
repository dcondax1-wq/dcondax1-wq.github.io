// The generic city generator of the Cities hub. ONE function turns a city spec (cities.json) and a normalized dataset
// (datasets.js) into a city: typed arrays of buildings (position, size, colour, glow, windows), the districts, the plaza and the
// landmark's site. Pure and deterministic: no DOM, no three.js, no unseeded randomness (every random number is a seeded one from the
// city id), so the same spec and data always give byte-identical arrays (cityHash() proves it in the tests).
//
//   spec = { id, name, motto, group, dataset, layout, district_by, height_by, glow_by, window_by, color_by, sort_by?, width_by?,
//            arrange?, grid?, height_range?, palette, landmark, sky, weather, sound, ... }      (the schema is in ENUMS / validateSpec)
//   expressions ("height_by": "abs:usd"): [transform ":"] field, transforms abs neg pos log sqrt rank inv cat; the value is scaled to
//   0..1 on the whole dataset (1st to 98.5th percentile, so one outlier never flattens the city)
//
//   generate(spec, dataset, { cap }) -> { n, x, z, w, d, h, y0, col, glow, win, seed, dist, item, districts, bounds, site, ... }
//   new Picker(city).pick(origin, dir) -> building index | -1      (a grid-hashed ray march: 40k buildings in microseconds)
import { clamp, lerp, hash32, rng, rgb, mixRgb, toHex, isHex } from './util.js';

export const ENUMS = {
  layout: ['districts', 'clock', 'spiral', 'terrain', 'calendar'],
  landmark: ['obelisk', 'beacon', 'ring', 'pyramid', 'dome', 'tree', 'anvil', 'crown', 'gate', 'crystal', 'helix', 'wheel', 'monolith', 'lighthouse'],
  sky: ['night', 'dusk', 'dawn', 'day', 'storm', 'void', 'aurora', 'ember'],
  weather: ['clear', 'rain', 'snow', 'embers', 'fireflies', 'dust', 'fog', 'storm', 'stars'],
  sound: ['tick', 'tap', 'portal', 'thunder', 'rankup', 'pad'],
  group: ['trading', 'research', 'money', 'kalshi', 'life', 'obsidian'],
  scenery: ['river', 'harbor', 'rail'],
  arrange: ['grid', 'peak'],
  order: ['key', 'size', 'first'],
  at: ['center', 'front', 'best'],
};
const TFS = ['abs', 'neg', 'pos', 'log', 'sqrt', 'rank', 'inv', 'cat'];
const COLOR_MODES = ['sign', 'district', 'ramp', 'cat'];

export const parseExpr = (expr) => {
  const m = /^(?:([a-z]+):)?([a-z0-9_]+)$/.exec(String(expr || ''));
  return m ? { tf: m[1] || '', field: m[2] } : null;
};

/** Errors of a city spec against the dataset registry ({id: {fields:[{key}]}}); [] when it is valid. */
export function validateSpec(spec, registry) {
  const e = [], need = (k, t) => { if (typeof spec[k] !== t) e.push(`${k}: ${t} required`); };
  ['id', 'name', 'motto', 'dataset', 'layout', 'district_by', 'height_by', 'glow_by', 'window_by', 'color_by'].forEach((k) => need(k, 'string'));
  if (!/^[a-z0-9-]{2,40}$/.test(spec.id || '')) e.push('id: 2-40 chars a-z 0-9 -');
  if ((spec.name || '').length < 3 || (spec.name || '').length > 28) e.push('name: 3-28 chars');
  if ((spec.motto || '').length < 8 || (spec.motto || '').length > 90) e.push('motto: 8-90 chars');
  const ds = registry[spec.dataset];
  if (!ds) { e.push('dataset: unknown ' + spec.dataset); return e; }
  const keys = new Set(ds.fields.map((f) => f.key));
  const field = (label, expr, tfs) => {
    const p = parseExpr(String(expr || '').replace(/^-/, ''));
    if (!p) return e.push(`${label}: bad expression ${expr}`);
    if (p.tf && !TFS.includes(p.tf)) e.push(`${label}: unknown transform ${p.tf}`);
    if (p.tf && tfs && !tfs.includes(p.tf)) e.push(`${label}: transform ${p.tf} not allowed here`);
    if (!keys.has(p.field)) e.push(`${label}: no field ${p.field} in ${spec.dataset}`);
  };
  if (!ENUMS.layout.includes(spec.layout)) e.push('layout: ' + spec.layout);
  field('district_by', spec.district_by);
  field('height_by', spec.height_by);
  field('glow_by', spec.glow_by);
  field('window_by', spec.window_by);
  if (spec.sort_by) field('sort_by', spec.sort_by);
  if (spec.width_by) field('width_by', spec.width_by);
  const cb = String(spec.color_by || '').split(':');
  if (!COLOR_MODES.includes(cb[0])) e.push('color_by: ' + spec.color_by);
  else if (cb[0] !== 'district') field('color_by', cb.slice(1).join(':'));
  if (spec.layout === 'calendar') {
    if (!spec.grid || !spec.grid.x || !spec.grid.z) e.push('grid: {x, z} required for the calendar layout');
    else { field('grid.x', spec.grid.x); field('grid.z', spec.grid.z); }
  }
  const P = spec.palette || {};
  for (const k of ['up', 'down', 'low', 'mid', 'high', 'accent', 'ground', 'fog']) if (!isHex(P[k])) e.push(`palette.${k}: #rrggbb`);
  if (!Array.isArray(P.districts) || P.districts.length < 3 || !P.districts.every(isHex)) e.push('palette.districts: 3+ colours');
  const L = spec.landmark || {};
  if (!ENUMS.landmark.includes(L.kind)) e.push('landmark.kind: ' + L.kind);
  if (!ENUMS.at.includes(L.at || 'center')) e.push('landmark.at: ' + L.at);
  if (typeof L.label !== 'string' || L.label.length < 3) e.push('landmark.label');
  const S = spec.sky || {};
  if (!ENUMS.sky.includes(S.kind)) e.push('sky.kind: ' + S.kind);
  for (const k of ['top', 'mid', 'low']) if (!isHex(S[k])) e.push(`sky.${k}: #rrggbb`);
  if (typeof S.stars !== 'number' || S.stars < 0 || S.stars > 1) e.push('sky.stars: 0..1');
  if (!ENUMS.weather.includes(spec.weather)) e.push('weather: ' + spec.weather);
  if (!ENUMS.sound.includes(spec.sound)) e.push('sound: ' + spec.sound);
  if (!ENUMS.group.includes(spec.group)) e.push('group: ' + spec.group);
  if (spec.scenery !== undefined && !ENUMS.scenery.includes(spec.scenery)) e.push('scenery: ' + spec.scenery);
  if (spec.region !== undefined && (typeof spec.region !== 'string' || spec.region.length < 2 || spec.region.length > 28)) e.push('region: 2-28 chars');
  if (spec.arrange && !ENUMS.arrange.includes(spec.arrange)) e.push('arrange: ' + spec.arrange);
  if (spec.district_order && !ENUMS.order.includes(spec.district_order)) e.push('district_order: ' + spec.district_order);
  const hr = spec.height_range;
  if (hr && !(Array.isArray(hr) && hr.length === 2 && hr[0] >= 0.3 && hr[1] > hr[0] && hr[1] <= 160)) e.push('height_range: [min, max] up to 160');
  if (!Array.isArray(spec.card) || spec.card.length < 3 || spec.card.some((k) => !keys.has(k))) e.push('card: 3+ field keys of the dataset');
  return e;
}

// ------------------------------------------------------------------ expressions
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, i = Math.floor(p), f = p - i;
  return sorted[i] + (sorted[Math.min(sorted.length - 1, i + 1)] - sorted[i]) * f;
}

/** The field of an expression for every item, scaled to 0..1 (Float32Array). Categories scale by their sorted index. */
export function evalExpr(expr, items) {
  const p = parseExpr(String(expr).replace(/^-/, '')), n = items.length, out = new Float32Array(n);
  if (!p || !n) return out;
  const raw = new Array(n);
  let text = false;
  for (let i = 0; i < n; i++) { const v = items[i].f[p.field]; raw[i] = v; if (typeof v === 'string') text = true; }
  if (text || p.tf === 'cat') {
    const keys = [...new Set(raw.map(String))].sort(), at = new Map(keys.map((k, i) => [k, i]));
    const k = Math.max(1, keys.length - 1);
    for (let i = 0; i < n; i++) out[i] = at.get(String(raw[i])) / k;
    return String(expr).startsWith('-') ? out.map((v) => 1 - v) : out;
  }
  const x = raw.map((v) => (Number.isFinite(+v) ? +v : 0));
  const sgn = (v) => (v < 0 ? -1 : 1);
  let y = x;
  if (p.tf === 'abs') y = x.map(Math.abs);
  else if (p.tf === 'neg') y = x.map((v) => -v);
  else if (p.tf === 'pos') y = x.map((v) => Math.max(0, v));
  else if (p.tf === 'log') y = x.map((v) => sgn(v) * Math.log1p(Math.abs(v)));
  else if (p.tf === 'sqrt') y = x.map((v) => sgn(v) * Math.sqrt(Math.abs(v)));
  else if (p.tf === 'inv') y = x.map((v) => -v);
  if (p.tf === 'rank') {
    const ord = x.map((v, i) => i).sort((a, b) => x[a] - x[b] || a - b);
    ord.forEach((i, r) => { out[i] = n > 1 ? r / (n - 1) : 0.5; });
  } else {
    const s = Float64Array.from(y).sort();
    const lo = n < 30 ? s[0] : quantile(s, 0.01), hi = n < 30 ? s[n - 1] : quantile(s, 0.985);
    const span = hi - lo || 1;
    for (let i = 0; i < n; i++) out[i] = clamp((y[i] - lo) / span, 0, 1);
  }
  return String(expr).startsWith('-') ? out.map((v) => 1 - v) : out;
}

const prettyKey = (fd, key) => {
  if (fd && fd.values && /^-?\d+$/.test(String(key))) return String(fd.values[+key] ?? key);
  const s = String(key);
  if (/^\d{4}-\d{2}$/.test(s)) return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+s.slice(5) - 1] + ' ' + s.slice(0, 4);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Wk ' + s.slice(5);
  return s;
};

// ------------------------------------------------------------------ cap (a deterministic sample when the tier cannot draw them all)
function pickIndices(n, cap, importance) {
  if (n <= cap) return Int32Array.from({ length: n }, (_, i) => i);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => importance[b] - importance[a] || a - b);
  const keep = new Uint8Array(n), top = Math.floor(cap * 0.2);
  for (let i = 0; i < top; i++) keep[order[i]] = 1;
  const rest = [];
  for (let i = 0; i < n; i++) if (!keep[i]) rest.push(i);
  const need = cap - top, step = rest.length / need;
  for (let k = 0; k < need; k++) keep[rest[Math.floor(k * step)]] = 1;
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return Int32Array.from(out);
}

// ------------------------------------------------------------------ the generator
export function generate(spec, ds, opts = {}) {
  const cap = opts.cap || 40000, all = ds.items, nAll = all.length;
  const fmap = Object.fromEntries(ds.fields.map((f) => [f.key, f]));
  const seedBase = hash32('city:' + spec.id);
  const hT = evalExpr(spec.height_by, all), gT = evalExpr(spec.glow_by, all), wT = evalExpr(spec.window_by, all);
  const idx = pickIndices(nAll, cap, hT);
  const items = Array.from(idx, (i) => all[i]);
  const n = items.length;
  const dField = parseExpr(spec.district_by).field;

  const hr = spec.height_range || [2.5, 64], gamma = spec.height_gamma || 0.85;
  const lg = Math.log10(Math.max(10, nAll));
  const pitch = spec.pitch || clamp(lerp(10.5, 3.6, (lg - 1) / 3.6), 3.6, 10.5);
  const rand = rng(seedBase);
  const wT2 = spec.width_by ? evalExpr(spec.width_by, all) : null;

  // per building values
  const H = new Float32Array(n), y0 = new Float32Array(n), W = new Float32Array(n), Dp = new Float32Array(n), glow = new Float32Array(n), win = new Float32Array(n);
  const seedA = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    H[k] = hr[0] + (hr[1] - hr[0]) * Math.pow(hT[i], gamma);
    glow[k] = gT[i];
    win[k] = lerp(0.1, 0.94, wT[i]);
    seedA[k] = rand();
  }

  // groups = districts
  const gkey = items.map((it) => String(it.f[dField]));
  const numeric = items.every((it) => typeof it.f[dField] === 'number');
  const groups = new Map();
  gkey.forEach((key, k) => { (groups.get(key) || groups.set(key, []).get(key)).push(k); });
  let keys = [...groups.keys()];
  const order = spec.district_order || 'key';
  if (order === 'size') keys.sort((a, b) => groups.get(b).length - groups.get(a).length || (a < b ? -1 : 1));
  else if (order === 'first') { /* insertion order */ } else keys.sort((a, b) => (numeric ? +a - +b : a < b ? -1 : a > b ? 1 : 0));
  const K = keys.length, gIndex = new Map(keys.map((k, i) => [k, i]));
  const dist = new Uint16Array(n);
  gkey.forEach((key, k) => { dist[k] = gIndex.get(key); });

  // order inside a district
  const sortExpr = spec.sort_by ? evalExpr(spec.sort_by, all) : null;
  const sortVal = (k) => (sortExpr ? sortExpr[idx[k]] : k);
  const arrange = spec.arrange || 'grid';
  const X = new Float32Array(n), Z = new Float32Array(n);
  const footprint = (k, base) => base * (wT2 ? lerp(0.62, 0.92, wT2[idx[k]]) : lerp(0.7, 0.9, seedA[k]));
  const blocks = [];

  const layBlock = (members, p) => {
    const m = members.length, cols = Math.max(1, Math.ceil(Math.sqrt(m * 1.1))), rows = Math.ceil(m / cols);
    const list = members.slice().sort((a, b) => sortVal(a) - sortVal(b) || a - b);
    let cells;
    if (arrange === 'peak') {
      const cx = (cols - 1) / 2, cz = (rows - 1) / 2;
      cells = Array.from({ length: cols * rows }, (_, c) => c).sort((a, b) => Math.hypot((a % cols) - cx, Math.floor(a / cols) - cz) - Math.hypot((b % cols) - cx, Math.floor(b / cols) - cz) || a - b);
      list.sort((a, b) => H[b] - H[a] || a - b);
    } else cells = Array.from({ length: cols * rows }, (_, c) => c);
    const loc = list.map((k, i) => [k, (cells[i] % cols) * p, Math.floor(cells[i] / cols) * p]);
    return { loc, w: cols * p, d: rows * p, members };
  };

  const L = spec.layout;
  let site = { x: 0, z: 0, r: pitch * 2 }, siteKind = 'center';
  if (L === 'districts' || L === 'clock') {
    const bl = keys.map((key) => layBlock(groups.get(key), pitch));
    const gap = Math.max(pitch * 2.4, 14);
    if (L === 'districts') {
      const area = bl.reduce((s, b) => s + (b.w + gap) * (b.d + gap), 0), W0 = Math.max(Math.sqrt(area * 1.55), Math.max(...bl.map((b) => b.w)) + gap);
      let x = 0, z = 0, rowH = 0;
      for (const b of bl) {
        if (x > 0 && x + b.w > W0) { x = 0; z += rowH + gap; rowH = 0; }
        b.ox = x; b.oz = z; x += b.w + gap; rowH = Math.max(rowH, b.d);
      }
      siteKind = 'front';
    } else {
      const diag = Math.max(...bl.map((b) => Math.hypot(b.w, b.d))), R = Math.max((K * (diag + gap)) / (2 * Math.PI), diag * 0.75 + pitch * 4);
      bl.forEach((b, i) => {
        const a = -Math.PI / 2 + (i / K) * Math.PI * 2;
        b.ox = Math.cos(a) * R - b.w / 2; b.oz = Math.sin(a) * R - b.d / 2;
      });
      site.r = Math.max(pitch * 2.5, R * 0.34);
    }
    bl.forEach((b) => b.loc.forEach(([k, lx, lz]) => { X[k] = b.ox + lx + pitch / 2; Z[k] = b.oz + lz + pitch / 2; W[k] = Dp[k] = footprint(k, pitch); }));
    blocks.push(...bl);
  } else if (L === 'spiral') {
    const order2 = Array.from({ length: n }, (_, k) => k).sort((a, b) => sortVal(a) - sortVal(b) || a - b);
    const c = pitch * 0.66;
    order2.forEach((k, i) => {
      const r = c * Math.sqrt(i + 14), a = i * 2.399963;
      X[k] = Math.cos(a) * r; Z[k] = Math.sin(a) * r; W[k] = Dp[k] = footprint(k, pitch * 0.92);
    });
    site.r = c * Math.sqrt(14) * 0.9;
  } else if (L === 'terrain') {
    const cols = Math.ceil(Math.sqrt(n * 1.25)), rows = Math.ceil(n / cols);
    const order2 = Array.from({ length: n }, (_, k) => k).sort((a, b) => sortVal(a) - sortVal(b) || a - b);
    const grid = new Float32Array(cols * rows).fill(-1), at = new Int32Array(cols * rows).fill(-1);
    order2.forEach((k, i) => {
      const r = Math.floor(i / cols), c = (r % 2 ? cols - 1 - (i % cols) : i % cols);      // a snake: neighbours in the grid are neighbours in time
      at[r * cols + c] = k; grid[r * cols + c] = H[k]; X[k] = c * pitch; Z[k] = r * pitch; W[k] = Dp[k] = pitch * 1.02;
    });
    for (let pass = 0; pass < (spec.smooth ?? 2); pass++) {
      const g2 = grid.slice();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (at[i] < 0) continue;
        let s = grid[i] * 2, wgt = 2;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || at[rr * cols + cc] < 0) continue;
          s += grid[rr * cols + cc]; wgt++;
        }
        g2[i] = s / wgt;
      }
      grid.set(g2);
    }
    for (let i = 0; i < grid.length; i++) if (at[i] >= 0) H[at[i]] = Math.max(hr[0], grid[i]);
    siteKind = 'front';
  } else if (L === 'calendar') {
    const gx = parseExpr(spec.grid.x).field, gz = parseExpr(spec.grid.z).field;
    const axis = (field) => {
      const vals = [...new Set(items.map((it) => it.f[field]))];
      const num = vals.every((v) => typeof v === 'number');
      vals.sort((a, b) => (num ? a - b : String(a) < String(b) ? -1 : 1));
      if (num && vals.length) { const lo = vals[0], hi = vals[vals.length - 1]; return { at: (v) => v - lo, size: hi - lo + 1, labels: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) }; }
      const m = new Map(vals.map((v, i) => [v, i]));
      return { at: (v) => m.get(v), size: vals.length, labels: vals };
    };
    const ax = axis(gx), az = axis(gz), cell = new Map();
    for (let k = 0; k < n; k++) { const key = ax.at(items[k].f[gx]) * 4096 + az.at(items[k].f[gz]); (cell.get(key) || cell.set(key, []).get(key)).push(k); }
    const P = pitch * 1.9;
    for (const [key, members] of cell) {
      const cx = Math.floor(key / 4096), cz = key % 4096, sub = Math.ceil(Math.sqrt(members.length));
      members.sort((a, b) => sortVal(a) - sortVal(b) || a - b).forEach((k, i) => {
        X[k] = cx * P + ((i % sub) + 0.5) * (P / sub); Z[k] = cz * P + (Math.floor(i / sub) + 0.5) * (P / sub); W[k] = Dp[k] = (P / sub) * 0.74;
      });
    }
    siteKind = 'front';
  }

  // recentre, bounds
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let k = 0; k < n; k++) { minx = Math.min(minx, X[k] - W[k] / 2); maxx = Math.max(maxx, X[k] + W[k] / 2); minz = Math.min(minz, Z[k] - Dp[k] / 2); maxz = Math.max(maxz, Z[k] + Dp[k] / 2); }
  if (!n) { minx = maxx = minz = maxz = 0; }
  const cx0 = (minx + maxx) / 2, cz0 = (minz + maxz) / 2;
  for (let k = 0; k < n; k++) { X[k] -= cx0; Z[k] -= cz0; }
  for (const b of blocks) { b.ox -= cx0; b.oz -= cz0; }
  const bounds = { minx: minx - cx0, maxx: maxx - cx0, minz: minz - cz0, maxz: maxz - cz0 };
  bounds.r = Math.max(10, Math.hypot(bounds.maxx - bounds.minx, bounds.maxz - bounds.minz) / 2);
  let maxH = 0, best = 0;
  for (let k = 0; k < n; k++) { if (H[k] > maxH) { maxH = H[k]; best = k; } }
  const flank = (r) => ({ x: bounds.minx - (r * 3.2 + pitch * 3 + 10), z: (bounds.minz + bounds.maxz) / 2, r });   // beside the city, left of the camera's first view
  if (siteKind === 'front') site = flank(pitch * 2.2);
  const at = (spec.landmark && spec.landmark.at) || 'center';
  if (at === 'best' && n) site = { x: X[best] + W[best] * 1.4 + pitch, z: Z[best], r: pitch * 1.4 };
  else if (at === 'front' && siteKind !== 'front') site = flank(pitch * 2);
  else if (at === 'center' && siteKind === 'front') site = flank(pitch * 2.2);
  site.scale = clamp(Math.max(pitch * 1.5, maxH * 0.17), 6, 18);
  site.kind = siteKind;

  // colour
  const P = spec.palette, upC = rgb(P.up), dnC = rgb(P.down), lowC = rgb(P.low), midC = rgb(P.mid), hiC = rgb(P.high), dC = P.districts.map(rgb);
  const [cmode, ...cr] = String(spec.color_by).split(':');
  const cexpr = cr.join(':');
  const cT = cmode === 'district' ? null : evalExpr(cexpr, all);
  const cp = cexpr && (cmode === 'sign') ? parseExpr(cexpr) : null;
  const col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    let c;
    if (cmode === 'district') c = dC[dist[k] % dC.length];
    else if (cmode === 'cat') c = dC[Math.round(cT[i] * 7) % dC.length];
    else if (cmode === 'ramp') { const t = cT[i]; c = t < 0.5 ? mixRgb(lowC, midC, t * 2) : mixRgb(midC, hiC, (t - 0.5) * 2); }
    else { const v = +items[k].f[cp.field] || 0; c = v >= 0 ? upC : dnC; c = mixRgb(c, [1, 1, 1], 0.12 * hT[i]); }
    // a little variation per building (seeded), so a block never looks like a bar chart of one colour
    const j = 0.8 + 0.2 * seedA[k];
    col[k * 3] = c[0] * j; col[k * 3 + 1] = c[1] * j; col[k * 3 + 2] = c[2] * j;
  }

  // districts meta
  const districts = keys.map((key, gi) => {
    const m = groups.get(key);
    let sx = 0, sz = 0, top = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const k of m) { sx += X[k]; sz += Z[k]; top = Math.max(top, H[k]); x0 = Math.min(x0, X[k] - W[k]); x1 = Math.max(x1, X[k] + W[k]); z0 = Math.min(z0, Z[k] - Dp[k]); z1 = Math.max(z1, Z[k] + Dp[k]); }
    return { key, label: prettyKey(fmap[dField], key), index: gi, count: m.length, cx: sx / m.length, cz: sz / m.length, x0, x1, z0, z1, top,
      color: toHex(dC[gi % dC.length]) };
  });

  const city = { id: spec.id, n, total: nAll, capped: n < nAll, x: X, z: Z, w: W, d: Dp, h: H, y0, col, glow, win, seed: seedA, dist, item: idx,
    districts, bounds, site, pitch, maxH, best, layout: L, hash: '' };
  city.hash = cityHash(city);
  return city;
}

/** A short hash of a generated city (positions, sizes, colours): the determinism test compares two runs. */
export function cityHash(c) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xffff; h = Math.imul(h, 0x01000193) >>> 0; h ^= (v >>> 16) & 0xffff; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(c.n);
  for (let k = 0; k < c.n; k++) {
    mix(Math.round(c.x[k] * 50)); mix(Math.round(c.z[k] * 50)); mix(Math.round(c.h[k] * 50)); mix(Math.round(c.w[k] * 50));
    mix(Math.round(c.col[k * 3] * 255) * 65536 + Math.round(c.col[k * 3 + 1] * 255) * 256 + Math.round(c.col[k * 3 + 2] * 255)); mix(Math.round(c.glow[k] * 100)); mix(c.item[k]);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ picking
/** A grid hash of the buildings' footprints and an exact ray / box test along the ray's cells. */
export class Picker {
  constructor(c) {
    this.c = c;
    this.cell = Math.max(6, c.pitch * 2);
    this.map = new Map();
    for (let k = 0; k < c.n; k++) {
      const x0 = Math.floor((c.x[k] - c.w[k] / 2) / this.cell), x1 = Math.floor((c.x[k] + c.w[k] / 2) / this.cell);
      const z0 = Math.floor((c.z[k] - c.d[k] / 2) / this.cell), z1 = Math.floor((c.z[k] + c.d[k] / 2) / this.cell);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
        const key = a * 100003 + b;
        const l = this.map.get(key);
        if (l) l.push(k); else this.map.set(key, [k]);
      }
    }
  }

  hit(k, o, d) {
    const c = this.c, hw = c.w[k] / 2, hd = c.d[k] / 2;
    let t0 = 0, t1 = 1e9;
    const slab = (lo, hi, oo, dd) => {
      if (Math.abs(dd) < 1e-9) return oo >= lo && oo <= hi;
      let a = (lo - oo) / dd, b = (hi - oo) / dd;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!slab(c.x[k] - hw, c.x[k] + hw, o.x, d.x) || !slab(c.y0[k], c.y0[k] + c.h[k], o.y, d.y) || !slab(c.z[k] - hd, c.z[k] + hd, o.z, d.z)) return -1;
    return t0 > 0 ? t0 : t1 > 0 ? t1 : -1;
  }

  /** o, d: {x,y,z} (d normalized). Returns { index, t } of the nearest building along the ray (index -1 when none). */
  pick(o, d, maxT = 2500) {
    let best = -1, bestT = Infinity;
    const step = this.cell * 0.6, seen = new Set();
    for (let t = 0; t <= maxT && t <= bestT + this.cell * 1.5; t += step) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if (py < -2 && d.y < 0) break;
      const a = Math.floor(px / this.cell), b = Math.floor(pz / this.cell);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const l = this.map.get((a + da) * 100003 + (b + db));
        if (!l) continue;
        for (const k of l) {
          if (seen.has(k)) continue;
          seen.add(k);
          const tt = this.hit(k, o, d);
          if (tt >= 0 && tt < bestT) { bestT = tt; best = k; }
        }
      }
    }
    return { index: best, t: bestT };
  }
}
