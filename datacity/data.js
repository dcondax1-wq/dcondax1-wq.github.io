// The Data City's model: city.json (full cards + the compact skyline) and any plug-in districts, decoded into one list of
// sections, each with its buildings. Pure (no three.js, no DOM). The words match tools/datacity/report.label exactly.
//
//   decode(city)             -> model { sections, buildings, byId, dict, today, weather, harbor, lit, ... }
//   loadPlugins(city, get)   -> plug-in sections: city.plugins + ./plugins.json { "districts": ["x.json", ...] }
//   labelOf(b, dict)         -> the plain-language label of a building (computed on first use)
//
// Plug-in contract (one JSON a new data source writes next to the page, listed in plugins.json):
//   { "v": 1, "key": "rates", "name": "RATES", "blurb": "...", "color": "#daa56f",
//     "items": [ { "id": "...", "lab": "...", "value": 12.5, "unit": "$/trade", "cls": "green", "note": "...", "sp": [..] } ] }
// value sets the height (scaled within the district); cls (gold / green / amber / grey) keeps the city's honesty colours,
// anything else draws in the district's colour.

export const CLS = ['gold', 'green', 'amber', 'grey'];
const PLUGIN_MAX = 4000;                       // buildings one plug-in district may add

const pad2 = (x) => String(x).padStart(2, '0');
const clock = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const art = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;

/** The combination id (report / grid key) of a skyline code. */
export function comboId(D, [t, w, k1, k2]) {
  const where = w >= 100 ? 's' + pad2(w - 100) : w < 0 ? 'all' : D.wins[w];
  const ks = [k1, k2].filter((k) => k >= 0).map((k) => `${D.fams[k >> 4][0]}=${k & 15}`);
  return `${D.trigs[t][0]}|${where}` + (ks.length ? '|' + ks.join('&') : '');
}

/** report.label in JS: 'NY AM (09:30-11:30) long after a prior-day low sweep while with VWAP and VIX < 15'. */
export function comboLabel(D, [t, w, k1, k2]) {
  const [key, what, dir] = D.trigs[t];
  const side = dir > 0 ? 'long' : 'short';
  const where = w >= 100 ? `${clock((w - 100) * 15)}-${clock((w - 100) * 15 + 15)} ET` : w < 0 ? D.any : D.win_lab[w];
  const head = D.slot_trigs.includes(key) ? `${where}: plain ${side} at the open of the ${w >= 100 ? 'slot' : 'session'}`
    : `${where} ${side} after ${art(what)}`;
  const conds = [k1, k2].filter((k) => k >= 0).map((k) => D.fams[k >> 4][1][k & 15]);
  return head + (conds.length ? ' while ' + conds.join(' and ') : '');
}

export function labelOf(b, D) {
  if (b.lab === undefined && b.code && D) b.lab = comboLabel(D, b.code);
  return b.lab || b.id || '';
}

function trendOf(fl, F) {
  return fl & F.rising ? 'rising' : fl & F.decaying ? 'decaying' : 'steady';
}

/** A skyline row as a building (the same fields a full card has, minus the per-year detail). */
function fromRow(row, ix, D) {
  const g = (k) => row[ix[k]];
  const code = [g('t'), g('w'), g('k1'), g('k2')], fl = g('fl'), F = D.flags;
  return { id: comboId(D, code), code, d: D.districts[g('d')], cls: CLS[g('cls')] || 'grey', e: g('e'), r: g('r') / 100,
           w: g('wr'), n: g('n'), tpw: g('tpw') / 100, e26: g('e26'), n26: g('n26'), eo: g('eo'), no: g('no'),
           fdr: !!(fl & F.fdr), tr: trendOf(fl, F), td: fl & F.fired ? 2 : fl & F.armed ? 1 : 0, compact: true };
}

const DEFAULT_SECTIONS = { times: ['TIMES', (NEON ? '#7fe9ff' : '#c8a24a')], confluences: ['CONFLUENCES', (NEON ? '#ffd36b' : '#b07a45')], while: ['WHILE-STATES', (NEON ? '#e9ecf6' : '#cfc4b2')] };

/** Normalise one plug-in district (see the contract above); null when it is not usable. */
export function pluginSection(p, i = 0) {
  if (!p || !Array.isArray(p.items) || !p.items.length) return null;
  const key = String(p.key || `plugin${i}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || `plugin${i}`;
  const vals = p.items.map((x) => Math.abs(+x.value || 0));
  const top = Math.max(1e-9, ...vals);
  const items = p.items.slice(0, PLUGIN_MAX).map((x, k) => ({
    id: `${key}:${x.id ?? k}`, d: key, lab: String(x.lab ?? x.id ?? `item ${k + 1}`).slice(0, 160), plugin: true,
    cls: CLS.includes(x.cls) ? x.cls : 'plugin', value: +x.value || 0, unit: String(x.unit || ''), note: x.note ? String(x.note).slice(0, 300) : '',
    sp: Array.isArray(x.sp) ? x.sp.filter(Number.isFinite).slice(0, 60) : null,
    e: 60 * (Math.abs(+x.value || 0) / top) * Math.sign(+x.value || 0) }));    // height on the city's $ scale
  return { key, name: String(p.name || key).toUpperCase().slice(0, 24), blurb: String(p.blurb || '').slice(0, 200),
           color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : (NEON ? '#7fe9ff' : '#daa56f'), kind: 'plugin', plugin: true, items,
           tested: items.length, fdr: 0, gold: items.filter((x) => x.cls === 'gold').length };
}

export async function loadPlugins(city, get) {
  const urls = [...(Array.isArray(city.plugins) ? city.plugins : [])];
  try {
    const idx = await get('./plugins.json');
    if (Array.isArray(idx?.districts)) urls.push(...idx.districts);
  } catch (e) { /* no plug-ins yet */ }
  const out = [];
  for (const [i, u] of [...new Set(urls)].entries()) {
    if (typeof u !== 'string' || !/^[\w./-]+\.json$/.test(u) || u.includes('..')) continue;   // same folder, plain names
    try { const s = pluginSection(await get('./' + u.replace(/^\.\//, '')), i); if (s) out.push(s); } catch (e) { /* skip one */ }
  }
  return out;
}

/** Synthetic extra skyline rows (?synth=N, tests and perf checks only): marked synthetic, all grey. */
export function synthRows(D, n) {
  const rows = [], nd = D.districts.length;
  for (let i = 0; i < n; i++) {
    const h = (i * 2654435761) >>> 0;
    rows.push([h % D.trigs.length, (h >> 7) % 6, -1, -1, i % nd, 3, ((h >> 3) % 40) - 25, 0, 45, 30 + (h % 200), 40, 0, 10, 0, 20, 0]);
  }
  return rows;
}

import { agoraColor } from './agora.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

export function decode(city, plugins = [], synth = 0) {
  const D = city.dict || null;
  const rich = (city.buildings || []).map((b) => ({ ...b }));
  const byId = new Map(rich.map((b) => [b.id, b]));
  const buildings = [...rich];
  if (D && city.skyline?.rows) {
    const ix = Object.fromEntries((city.skyline.cols || D.cols).map((k, i) => [k, i]));
    const rows = synth > 0 ? city.skyline.rows.concat(synthRows(D, synth)) : city.skyline.rows;
    rows.forEach((r, k) => {
      const b = fromRow(r, ix, D);
      if (k >= city.skyline.rows.length) { b.id = `synthetic:${k}`; b.lab = 'synthetic test building'; b.synthetic = true; }
      if (byId.has(b.id)) return;
      byId.set(b.id, b);
      buildings.push(b);
    });
    // the compact rows are decoded: let the raw arrays go (about 30k small arrays, several MB of heap on a phone)
    city.skyline = { cols: city.skyline.cols, rows: [], decoded: rows.length };
  }
  const sections = [];
  const meta = city.sections || Object.entries(DEFAULT_SECTIONS).map(([key, [name, color]]) => ({ key, name, color, kind: 'combos' }));
  meta.forEach((s, i) => sections.push({ ...s, color: NEON ? (s.color || agoraColor(s.key, i)) : agoraColor(s.key, i), items: [] }));   // neon: the city's own section colours
  const sec = new Map(sections.map((s) => [s.key, s]));
  for (const b of buildings) {
    if (!sec.has(b.d)) { const s = { key: b.d, name: b.d.toUpperCase(), color: NEON ? '#e9ecf6' : agoraColor(b.d), kind: 'combos', items: [] }; sections.push(s); sec.set(b.d, s); }
    sec.get(b.d).items.push(b);
  }
  for (const p of plugins) {
    if (sec.has(p.key)) continue;                     // a plug-in never replaces a district of the city itself
    sections.push(p); sec.set(p.key, p);
    for (const b of p.items) { byId.set(b.id, b); buildings.push(b); }
  }
  const live = sections.filter((s) => s.items.length);
  return { city, D, sections: live, buildings, byId, lit: city.lit || null, today: city.today_layer || null,
           weather: city.weather || null, harbor: city.harbor || null, strategies: city.strategies || [],
           discoveries: city.discoveries || [], guard: city.summary?.guard || {}, last_day: city.last_day || null };
}
