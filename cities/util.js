// Small shared helpers of the Cities hub: seeded random numbers, hashes, colours, number formats, the city of the day.
// Pure (no DOM, no three.js) except $() and el(): the generator, the adapters and the tests import this file in Node too.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** FNV-1a 32 bit: the same hash is in tools/cities_card.py (the city of the day must match). */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** mulberry32: a small seeded generator. Every random number of a city comes from one of these, never an unseeded one. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' -> [r, g, b] in 0..1 */
export function rgb(hex) {
  const h = String(hex || '#888888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
export const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/** The city of the day: a pure function of the date and the list of ids (same in Python: tools/cities_card.py). */
export function cityOfDay(dateStr, ids) {
  if (!ids || !ids.length) return null;
  return ids[hash32('cities:' + dateStr) % ids.length];
}
/** The random city of the day: a 6-letter seed from the date (same in Python: tools/cities_card.py). */
export function seedOfDay(dateStr) {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  let h = hash32('seed:' + dateStr), s = '';
  for (let i = 0; i < 6; i++) { s += A[h % A.length]; h = Math.floor(h / A.length) + hash32(s + dateStr) % 7; }
  return s;
}
export const todayStr = (d = new Date()) => {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ------------------------------------------------------------------ number formats
const missing = (v) => v === null || v === undefined || !Number.isFinite(+v);
export const money = (v, d = 0) => (missing(v) ? '–' : (v < 0 ? '-' : '+') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const plain = (v, d = 0) => (missing(v) ? '–' : (+v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (v, d = 0) => (missing(v) ? '–' : `${(+v).toFixed(d)}%`);
export const signed = (v, d = 2) => (missing(v) ? '–' : `${v >= 0 ? '+' : ''}${(+v).toFixed(d)}`);

/** Format a field value by its descriptor { fmt, values? }. Never HTML: callers set it as text. */
export function fmtField(fd, v) {
  if (v === undefined || v === null || v === '') return '–';
  if (fd && fd.values && Number.isFinite(+v)) return String(fd.values[v] ?? v);
  switch (fd && fd.fmt) {
    case 'usd': return money(v, Math.abs(v) < 100 ? 2 : 0);
    case 'r': return signed(v, 2) + 'R';
    case 'pct': return pct(v, 1);
    case 'int': return plain(v, 0);
    case 'num': return plain(v, Math.abs(v) < 10 ? 2 : 1);
    case 'pts': return plain(v, 1) + ' pts';
    case 'flag': return v ? 'yes' : 'no';
    case 'date': return typeof v === 'number' ? new Date(v * 1000).toISOString().slice(0, 10) : String(v);
    default: return String(v);
  }
}

// ------------------------------------------------------------------ DOM (page only)
export const $ = (s, r) => (r || document).querySelector(s);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
/** localStorage that never throws: per-viewer conveniences only. */
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not kept: fine */ } },
};
