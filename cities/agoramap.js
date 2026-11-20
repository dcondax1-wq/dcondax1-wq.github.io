// AGORA MAP: the Cities front screen. A painted classical night archipelago on one 2D canvas (no WebGL, so it is always
// there, cheap on a phone and beautiful in LITE): marble skylines per district, stone roads and bridges, ships on the sea
// lanes, birds, a moon over the hills, warm lantern windows. Drag to look, pinch to zoom, tap a city (the view glides to it).
// Read-only: it only draws the list of cities it is given. No Math.random (seeded), no network, no WebGL.
import { rng, hash32, clamp, lerp } from './util.js';

const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const SANS = "-apple-system,'SF Pro Text',system-ui,'Helvetica Neue',Arial,sans-serif";

/** The six districts as islands (world units; the world is 920 x 1420, y grows downward). */
const ISLANDS = {
  research: { cx: 440, cy: 300, rx: 340, ry: 195, lab: [440, 62] },
  obsidian: { cx: 790, cy: 545, rx: 95, ry: 62, lab: [800, 432] },
  trading: { cx: 450, cy: 880, rx: 410, ry: 275, lab: [150, 612] },
  money: { cx: 195, cy: 1335, rx: 175, ry: 118, lab: [110, 1176] },
  kalshi: { cx: 520, cy: 1385, rx: 130, ry: 90, lab: [520, 1236] },
  life: { cx: 790, cy: 1290, rx: 110, ry: 98, lab: [790, 1110] },
};
const WORLD = { x0: 0, y0: 50, x1: 920, y1: 1500 };
/** AGORA district colours: gold, aegean, bronze, terracotta, olive, dusk plum (no neon anywhere). */
export const LOOK = {
  trading: { tint: '#d8b25a', land: ['#6b5a42', '#4b3f30'], name: 'Trading' },
  research: { tint: '#6fa0c0', land: ['#5d5a4a', '#403d33'], name: 'Research' },
  money: { tint: '#cf9150', land: ['#6a5238', '#4a3a2a'], name: 'Money' },
  kalshi: { tint: '#d1704c', land: ['#6a4c3c', '#4a362c'], name: 'Kalshi' },
  life: { tint: '#9ba85f', land: ['#59603f', '#3e4430'], name: 'Life' },
  obsidian: { tint: '#9d8aae', land: ['#574e50', '#3d3638'], name: 'Obsidian' },
};
// revamp-cities 2026-11-20 (owner: "not some 2000's looking play-doh"): night stone and dark glass, not pale clay; warm and cool lit windows
const MARBLE = ['#4d5262', '#444a5a', '#575b6b', '#4a4e5c', '#545060', '#3f4656'];
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(v * k, 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function blob(isl, seed, pts = 72) {
  const r = rng(seed), ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU], out = [];
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * TAU;
    const m = 1 + 0.055 * Math.sin(2 * a + ph[0]) + 0.045 * Math.sin(3 * a + ph[1]) + 0.03 * Math.sin(5 * a + ph[2]) + 0.02 * Math.sin(8 * a + ph[3]);
    out.push([isl.cx + Math.cos(a) * isl.rx * m, isl.cy + Math.sin(a) * isl.ry * m]);
  }
  return out;
}
const inBlob = (isl, x, y, k = 1) => { const dx = (x - isl.cx) / (isl.rx * k), dy = (y - isl.cy) / (isl.ry * k); return dx * dx + dy * dy <= 1; };

/** The sky follows New York time: night, a slow peach sunrise, a bright Aegean day, a rose sunset. [sky top, sky mid, upper horizon, horizon, sea near, sea far, star share, sun share] */
const SKYS = [
  [0, ['#15121f', '#2f2438', '#7d4a45', '#d9985a'], ['#46565a', '#362c23', '#201a14'], 1, 0],
  [5.5, ['#362c23', '#5a3d58', '#b0607a', '#f0a070'], ['#4a5a62', '#403529', '#251e18'], 0.5, 0],
  [7.5, ['#816a53', '#c08a8a', '#f5b58a', '#ffd9a0'], ['#7a9aa2', '#604e3d', '#342b22'], 0.1, 1],
  [12, ['#9c8063', '#8ab4cc', '#d6dcc6', '#f3e4b8'], ['#8cc0c4', '#7e6750', '#4d3f31'], 0, 1],
  [17, ['#8b7259', '#a8a0aa', '#eab088', '#f6c78a'], ['#80a8b0', '#695643', '#3e3227'], 0, 1],
  [19, ['#42372b', '#7a4a68', '#e0805a', '#f4b870'], ['#58606a', '#473a2d', '#282019'], 0.4, 0],
  [21, ['#15121f', '#2f2438', '#7d4a45', '#d9985a'], ['#46565a', '#362c23', '#201a14'], 1, 0],
  [24, ['#15121f', '#2f2438', '#7d4a45', '#d9985a'], ['#46565a', '#362c23', '#201a14'], 1, 0],
];
const mixHex = (a, b, t) => { const p = (h) => parseInt(h.slice(1), 16), x = p(a), y = p(b), f = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t); return `rgb(${f(16)},${f(8)},${f(0)})`; };
const etHour = () => {
  try { const q = new URLSearchParams(location.search).get('hour'); if (q !== null && q !== '') return +q; } catch (e) { /* no address */ }
  try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()); const g = (t) => +p.find((x) => x.type === t).value; return (g('hour') % 24) + g('minute') / 60; } catch (e) { return 21; }
};

export class AgoraMap {
  constructor(canvas, o = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.onTap = o.onTap || (() => {});
    this.onMove = o.onMove || (() => {});
    this.onFrame = o.onFrame || (() => {}); this.dt = 0.03; this.dayId = null;
    this.low = o.quality === 'low' || o.quality === 'off';
    this.reduced = !!o.reduced;
    this.cities = []; this.districts = []; this.isl = {}; this.shapes = {};
    this.sel = -1; this.dim = null; this.seen = new Set(); this.star = null; this.lift = false;
    this.cam = { x: 460, y: 800, s: 0.4 }; this.fit = 0.4; this.fly = null;
    this.hourNow = etHour(); this.hourT = 0;
    this.W = 390; this.H = 844; this.dpr = 1; this.t = 0; this.last = 0; this.raf = 0; this.running = false;
    this.ptr = new Map(); this.tap = null; this.pinch = null; this.touched = false;
    this.banners = []; this.labelBoxes = [];
    this._events();
    this.resize();
  }

  // ---------------------------------------------------------------- data and layout
  setData(cities, districts) {
    this.cities = cities.map((c) => ({ ...c, n: c.n || 0, live: !!c.live }));
    this.districts = districts;
    this._layout();
  }
  setLive(i, live, n) { const c = this.cities[i]; if (!c) return; c.live = !!live; if (n) c.n = n; this._build(c); }
  _layout() {
    this.isl = {}; this.shapes = {};
    const by = {};
    this.cities.forEach((c) => { (by[c.cont] = by[c.cont] || []).push(c); });
    let seedN = 11;
    for (const key of Object.keys(by)) {
      const isl = ISLANDS[key] || { cx: 460, cy: 700, rx: 200, ry: 150 };
      this.isl[key] = isl; this.shapes[key] = blob(isl, hash32('isl:' + key) + seedN++);
      const list = by[key].slice().sort((a, b) => (b.hq - a.hq) || (b.capital - a.capital) || (a.region || '').localeCompare(b.region || '') || a.i - b.i);
      const m = list.length;
      list.forEach((c, k) => {
        if (k === 0) { c.wx = isl.cx; c.wy = isl.cy; }
        else {
          const rr = Math.sqrt((k + 0.4) / (m + 0.4)) * 0.84, a = k * GA + hash32(key) % 7;
          c.wx = isl.cx + Math.cos(a) * isl.rx * rr; c.wy = isl.cy + Math.sin(a) * isl.ry * rr;
        }
        c.order = k;
      });
    }
    this.cities.forEach((c) => this._build(c));
    this._roads(by); this._scatter(by); this._lanes();
    this.byDistrict = by;
    this._fit();
    this.cam.s = this.fit; this.cam.x = (WORLD.x0 + WORLD.x1) / 2; this.cam.y = (WORLD.y0 + WORLD.y1) / 2;
  }
  _build(c) {
    this.ver = (this.ver || 0) + 1;                       // perf v2: the cached still layer is out of date
    const r = rng(hash32('tw:' + c.id)), big = c.hq ? 1.55 : c.capital ? 1.25 : 1;
    const sizeF = c.n ? clamp(Math.log10(c.n + 1) / 4.2, 0.15, 1) : 0.35 + r() * 0.3;
    const count = c.hq ? 8 : c.capital ? 6 : 3 + Math.floor(r() * 3);
    const bl = [];
    for (let k = 0; k < count; k++) {
      const a = r() * TAU, d = (c.hq ? 14 : 10) * Math.sqrt(r()) * big;
      const w = (6 + r() * 5) * (k === 0 ? 1.15 : 1) * (c.hq ? 1.15 : 1);
      const h = (13 + sizeF * 24 + r() * 14) * (k === 0 ? 1.28 : 0.55 + r() * 0.5) * (c.hq ? 1.25 : 1);
      const kind = k === 0 && (c.capital || c.hq) ? 'temple' : r() < 0.14 ? 'dome' : r() < 0.2 ? 'obelisk' : 'tower';
      bl.push({ x: Math.cos(a) * d * 1.25, y: Math.sin(a) * d * 0.7, w, h, kind, col: MARBLE[Math.floor(r() * MARBLE.length)], lit: r(), seed: Math.floor(r() * 1e6) });
    }
    bl.sort((p, q) => p.y - q.y);
    c.bl = bl; c.rad = 20 * big; c.top = Math.max(...bl.map((b) => b.h));
  }
  _roads(by) {
    this.roads = []; this.main = [];
    for (const key of Object.keys(by)) {
      const list = by[key], done = [list[0]];
      const rest = list.slice(1).sort((a, b) => Math.hypot(a.wx - list[0].wx, a.wy - list[0].wy) - Math.hypot(b.wx - list[0].wx, b.wy - list[0].wy));
      for (const c of rest) {
        let best = null, bd = 1e9;
        for (const d of done) { const dd = Math.hypot(c.wx - d.wx, c.wy - d.wy); if (dd < bd) { bd = dd; best = d; } }
        const bend = ((hash32(c.id) % 100) / 100 - 0.5) * 14;
        this.roads.push([best.wx, best.wy, c.wx, c.wy, (best.wx + c.wx) / 2 + bend, (best.wy + c.wy) / 2 - bend * 0.6]);
        done.push(c);
      }
    }
    const hq = this.cities.find((c) => c.hq) || this.cities[0], caps = {};
    this.cities.forEach((c) => { if (c.order === 0) caps[c.cont] = c; });
    for (const key of Object.keys(caps)) {
      const c = caps[key]; if (c === hq) continue;
      const mx = (hq.wx + c.wx) / 2, my = (hq.wy + c.wy) / 2, dx = c.wx - hq.wx, dy = c.wy - hq.wy, L = Math.hypot(dx, dy) || 1;
      this.main.push([hq.wx, hq.wy, c.wx, c.wy, mx - (dy / L) * 62, my + (dx / L) * 62]);
    }
    // a ring causeway between the outer islands
    const order = ['research', 'obsidian', 'life', 'kalshi', 'money'];
    for (let k = 0; k < order.length - 1; k++) { const a = caps[order[k]], b = caps[order[k + 1]]; if (a && b) this.main.push([a.wx, a.wy, b.wx, b.wy, (a.wx + b.wx) / 2, (a.wy + b.wy) / 2]); }
  }
  _scatter(by) {
    const trees = [], r = rng(4242), near = (x, y) => this.cities.some((c) => Math.hypot(c.wx - x, (c.wy - y) * 1.3) < 26);
    for (const key of Object.keys(by)) {
      const isl = this.isl[key], n = Math.round(isl.rx * isl.ry / 380);
      for (let k = 0; k < n; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.93, x = isl.cx + Math.cos(a) * isl.rx * d, y = isl.cy + Math.sin(a) * isl.ry * d;
        if (!inBlob(isl, x, y, 0.92) || near(x, y)) continue;
        trees.push({ x, y, k: r() < 0.38 ? 1 : 0, s: 0.8 + r() * 0.6 });
      }
    }
    this.trees = trees;
    this.houses = [];       // small distant villages (lit windows) between the cities
    for (let k = 0; k < 160; k++) {
      const keys = Object.keys(by), key = keys[Math.floor(r() * keys.length)], isl = this.isl[key];
      const a = r() * TAU, d = Math.sqrt(r()) * 0.9, x = isl.cx + Math.cos(a) * isl.rx * d, y = isl.cy + Math.sin(a) * isl.ry * d;
      if (!inBlob(isl, x, y, 0.9) || near(x, y)) continue;
      this.houses.push({ x, y, lit: r() < 0.7, w: 2.6 + r() * 2 });
    }
    // lighthouses on the shore of each island
    this.lights = Object.keys(by).map((key, j) => { const isl = this.isl[key], a = 0.5 + j * 1.1; return { x: isl.cx + Math.cos(a) * isl.rx * 1.02, y: isl.cy + Math.sin(a) * isl.ry * 1.02 }; });
  }
  _lanes() {
    const pairs = [['research', 'trading'], ['trading', 'money'], ['trading', 'kalshi'], ['trading', 'life'], ['research', 'obsidian'], ['money', 'kalshi'], ['kalshi', 'life'], ['trading', 'obsidian']];
    const edge = (A, B, k) => { const a = Math.atan2((B.cy - A.cy) / A.ry, (B.cx - A.cx) / A.rx); return [A.cx + Math.cos(a) * A.rx * k, A.cy + Math.sin(a) * A.ry * k]; };
    this.lanes = [];
    for (const [p, q] of pairs) {
      const A = this.isl[p], B = this.isl[q]; if (!A || !B) continue;
      const s = edge(A, B, 1.16), e = edge(B, A, 1.16), dx = e[0] - s[0], dy = e[1] - s[1], L = Math.hypot(dx, dy) || 1, off = 34 * (hash32(p + q) % 2 ? 1 : -1);
      this.lanes.push({ a: s, b: e, c: [(s[0] + e[0]) / 2 - (dy / L) * off, (s[1] + e[1]) / 2 + (dx / L) * off], len: L });
    }
    const r = rng(77);
    this.ships = [];
    this.lanes.forEach((ln, j) => { for (let k = 0; k < (this.low ? 1 : 2); k++) this.ships.push({ ln, t: r(), dir: k ? -1 : 1, sp: 0.016 + r() * 0.012, sail: 1 + Math.floor(r() * 2), tint: r() < 0.5 ? '#e9dcc0' : '#d7b98a' }); });
    this.birds = [];
    for (let f = 0; f < (this.low ? 3 : 6); f++) {
      const bx = 100 + r() * 760, by2 = 120 + r() * 1250, n = 3 + Math.floor(r() * 3), ang = r() * TAU;
      for (let k = 0; k < n; k++) this.birds.push({ x: bx + (k % 3) * 9, y: by2 + k * 6, a: ang, v: 7 + r() * 4, ph: r() * 9, home: [bx, by2], rad: 70 + r() * 90, w: 0.25 + r() * 0.2, f });
    }
    const w = rng(31); this.waves = [];
    for (let k = 0; k < (this.low ? 70 : 150); k++) this.waves.push({ x: w() * 1100 - 90, y: WORLD.y0 - 60 + w() * 1560, l: 10 + w() * 16, v: 2 + w() * 3 });
    const st = rng(5); this.stars = [];
    for (let k = 0; k < 46; k++) this.stars.push({ x: st(), y: st() * 0.8, r: 0.5 + st() * 0.9, ph: st() * 6 });
    const hz = rng(19); this.ridge = [[], []];
    for (let L = 0; L < 2; L++) { let h = hz(); for (let k = 0; k <= 24; k++) { h = clamp(h + (hz() - 0.5) * 0.5, 0.05, 1); this.ridge[L].push(h); } }
  }

  // ---------------------------------------------------------------- view
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(160, r.width || this.cv.clientWidth || 390); this.H = Math.max(200, r.height || this.cv.clientHeight || 844);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.hz = Math.round(this.H * 0.215);
    if (this.cities.length) { const was = this.fit; this._fit(); if (Math.abs(this.cam.s - was) < 1e-6 || this.cam.s < this.fit) this.cam.s = this.fit; }
    this.dirty = true;
  }
  _fit() {
    // olympus2: the page says how much of the bottom its own panels take (--map-bottom: the World card + the city chips), so the islands and their labels fit above them
    let padB = 138; try { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map-bottom')); if (v > 0) padB = Math.min(this.H * 0.5, v); } catch (e) { /* the default band */ }
    const top = this.hz + 22, bot = this.H - padB, ww = WORLD.x1 - WORLD.x0, wh = WORLD.y1 - WORLD.y0;
    this.areaMid = (top + bot) / 2;
    this.fit = Math.min((this.W - 18) / ww, (bot - top) / wh);
  }
  setQuality(q) { this.low = q === 'low' || q === 'off'; this.resize(); if (this.cities.length) this._lanes(); }
  zoomLevel() { return this.cam.s / this.fit; }
  toScreen(wx, wy) { return [(wx - this.cam.x) * this.cam.s + this.W / 2, (wy - this.cam.y) * this.cam.s + this.areaMid]; }
  toWorld(sx, sy) { return [(sx - this.W / 2) / this.cam.s + this.cam.x, (sy - this.areaMid) / this.cam.s + this.cam.y]; }
  project(i) { const c = this.cities[i]; if (!c) return { x: 0, y: 0, on: false }; const [x, y] = this.toScreen(c.wx, c.wy); return { x, y, on: x > -10 && x < this.W + 10 && y > 0 && y < this.H }; }
  _clampCam() {
    const c = this.cam, hw = this.W / 2 / c.s, m = 80;
    c.s = clamp(c.s, this.fit * 0.92, this.fit * 8);
    c.x = clamp(c.x, WORLD.x0 + Math.min(hw, 460) - m, WORLD.x1 - Math.min(hw, 460) + m);
    c.y = clamp(c.y, WORLD.y0 - 40, WORLD.y1 + 40);
  }
  flyTo(x, y, s, secs = 0.9, lift = 0) {
    // lift: put the target this fraction of the screen height above the middle of the map area (room for the bottom sheet)
    const sc = clamp(s, this.fit * 0.92, this.fit * 8);
    const ty = y + (lift ? (lift * this.H) / sc : 0);
    if (this.reduced || secs <= 0) { Object.assign(this.cam, { x, y: ty, s: sc }); this._clampCam(); this.dirty = true; return Promise.resolve(); }
    return new Promise((res) => { this.fly = { x0: this.cam.x, y0: this.cam.y, s0: this.cam.s, x, y: ty, s: sc, t: 0, d: secs, res }; });
  }
  flyToCity(i, zoom = 3.2, secs = 0.9) { const c = this.cities[i]; if (!c) return Promise.resolve(); return this.flyTo(c.wx, c.wy - 6, Math.max(this.cam.s, this.fit * zoom), secs, this.lift ? 0.23 : 0); }
  flyToDistrict(key, secs = 1.0) {
    const isl = this.isl[key]; if (!isl) return Promise.resolve();
    const s = Math.min((this.W - 26) / (isl.rx * 2.25), (this.H * 0.5) / (isl.ry * 2.5));
    return this.flyTo(isl.cx, isl.cy, Math.max(s, this.fit * 1.25), secs, this.lift ? 0.12 : 0);
  }
  flyHome(secs = 1.0) { return this.flyTo((WORLD.x0 + WORLD.x1) / 2, (WORLD.y0 + WORLD.y1) / 2, this.fit, secs); }
  select(i) { this.sel = i; this.dirty = true; }
  setDim(a) { this.dim = a; this.ver = (this.ver || 0) + 1; this.dirty = true; }
  setSeen(set, star) { this.seen = set; this.star = star || null; this.ver = (this.ver || 0) + 1; this.dirty = true; }
  setLift(on) { this.lift = !!on; }
  setCaption() { /* the page owns captions */ }

  // ---------------------------------------------------------------- input
  _events() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      this.touchAt = performance.now();
      this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.fly = null;
      this.tap = this.ptr.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null;
      if (this.ptr.size === 2) this.pinch = this._pinchState();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptr.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (this.tap) { this.tap.moved += Math.abs(dx) + Math.abs(dy); }
      if (this.ptr.size === 1) { if (!this.tap || this.tap.moved > 8) { this.cam.x -= dx / this.cam.s; this.cam.y -= dy / this.cam.s; this._clampCam(); this.dirty = true; this.touched = true; this.onMove(); } }
      else if (this.ptr.size >= 2 && this.pinch) {
        const q = this._pinchState(), k = q.d / (this.pinch.d || 1), r = cv.getBoundingClientRect();
        const wx = this.pinch.wx, wy = this.pinch.wy;
        this.cam.s = clamp(this.pinch.s * k, this.fit * 0.92, this.fit * 8);
        this.cam.x = wx - (q.cx - r.left - this.W / 2) / this.cam.s; this.cam.y = wy - (q.cy - r.top - this.areaMid) / this.cam.s;
        this._clampCam(); this.dirty = true; this.touched = true; this.onMove();
      }
    });
    const up = (e) => {
      const wasTap = this.tap && this.ptr.size === 1 && this.tap.moved < 9 && performance.now() - this.tap.t < 450;
      this.ptr.delete(e.pointerId);
      if (this.ptr.size < 2) this.pinch = null;
      if (wasTap && e.type === 'pointerup') { const r = cv.getBoundingClientRect(); this._tap(e.clientX - r.left, e.clientY - r.top); }
      this.tap = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, [wx, wy] = this.toWorld(sx, sy);
      this.cam.s = clamp(this.cam.s * Math.exp(-e.deltaY * 0.0015), this.fit * 0.92, this.fit * 8);
      this.cam.x = wx - (sx - this.W / 2) / this.cam.s; this.cam.y = wy - (sy - this.areaMid) / this.cam.s; this._clampCam(); this.dirty = true; this.fly = null; this.onMove();
    }, { passive: false });
  }
  _pinchState() {
    const [a, b] = [...this.ptr.values()], r = this.cv.getBoundingClientRect(), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const [wx, wy] = this.toWorld(cx - r.left, cy - r.top);
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx, cy, s: this.cam.s, wx, wy };
  }
  /** the nearest city to a screen point inside a finger-sized radius, else the district under it, else the sea */
  pick(x, y) {
    for (const b of this.banners) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return { kind: 'district', key: b.key };
    let best = -1, bd = Math.max(24, 18 * Math.min(2, this.zoomLevel()));
    this.cities.forEach((c, i) => {
      if (this.dim && this.dim[i]) return;
      const [sx, sy] = this.toScreen(c.wx, c.wy), r = Math.max(14, c.rad * this.cam.s * 0.5), cy = sy - c.top * this.cam.s * 0.3;
      const d = Math.min(Math.hypot(sx - x, sy - y), Math.hypot(sx - x, cy - y));
      if (d < bd + r * 0.4) { const dd = d - r * 0.4; if (dd < bd) { bd = dd; best = i; } }
    });
    if (best >= 0) return { kind: 'city', i: best };
    const [wx, wy] = this.toWorld(x, y);
    for (const k of Object.keys(this.isl)) if (inBlob(this.isl[k], wx, wy, 1.05)) return { kind: 'district', key: k };
    return { kind: 'sea' };
  }
  _tap(x, y) { this.touched = true; this.touchAt = performance.now(); this.onTap(this.pick(x, y), x, y); }

  // ---------------------------------------------------------------- loop
  start() { if (this.running) return; this.running = true; this.last = 0; const tick = (now) => { if (!this.running) return; this.raf = requestAnimationFrame(tick); this._frame(now); }; this.raf = requestAnimationFrame(tick); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  _frame(now) {
    if (document.hidden) return;
    // olympus2 perf: full speed while you touch or the camera flies; 3 s after the last touch the sea and the boats hold still (decoration) until the next touch
    if (this.fly || this.dirty) this.busyAt = now;
    const idle = now - (this.busyAt || 0) > 3000 && now - (this.touchAt || 0) > 3000;
    if (this.ver !== this.verSeen) { this.verSeen = this.ver; this.verAt = now; }
    const dataDue = this.stillVer !== this.ver && now - (this.verAt || 0) >= 300;   // new data has gone quiet: one repaint
    if (idle && !this.dirty && !this.fly && !dataDue) { this.last = now; return; }   // at rest the picture holds (no redraw until a touch, a flight or new data)
    const gap = this.low ? 50 : 30;
    if (this.last && now - this.last < gap) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.03; this.last = now;
    this.dt = dt;
    if (!this.reduced) this.t += dt;
    try { this.onFrame(dt); } catch (e) { /* the page owns it */ }
    if (this.fly) {
      const f = this.fly; f.t += dt; const u = clamp(f.t / f.d, 0, 1), e = 1 - Math.pow(1 - u, 3);
      this.cam.x = lerp(f.x0, f.x, e); this.cam.y = lerp(f.y0, f.y, e);
      this.cam.s = Math.exp(lerp(Math.log(f.s0), Math.log(f.s), e));
      this.dirty = true;
      if (u >= 1) { this.fly = null; f.res && f.res(); }
    }
    if (this.reduced && !this.dirty) return;
    this.dirty = false;
    this.draw();
  }
  draw() {
    const g = this.g, W = this.W, H = this.H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._sky(g, W, H);
    this._sea(g, W, H);
    this._still(g);                // perf v2: land, roads, trees, houses, every city's plaza and towers: one cached layer while the view rests
    this._props(g, 'live');        // the sea's glints, the lighthouses
    this._cityLayer(g, 'live');    // the pennants, and the selected city whole (its ring pulses)
    this._life(g);
    this._labels(g, W, H);
  }
  // perf v2 (2026-11-14, docs/OLYMPUS_PERF.md): the map repainted ~6,400 canvas operations 33 times a second (every window of every tower) while
  // only the sea, the ships, the birds and the pennants move. The parts that do not move are painted once per view (camera, size, data, the
  // selection) into an offscreen layer and copied with one drawImage; panning, zooming or a fly repaints it every frame, as before.
  _still(g) {
    const c = this.cam, key = [c.x, c.y, c.s, this.W, this.H, this.dpr, this.ver || 0, this.sel, this.low ? 1 : 0].join('|');
    const C = this.stillCv || (this.stillCv = document.createElement('canvas'));
    if (C.width !== this.cv.width || C.height !== this.cv.height) { C.width = this.cv.width; C.height = this.cv.height; this.stillKey = ''; }
    if (!C.width || !C.height) return;
    // olympus2 perf (PERF ASKS: cities long task 4.1 s at 4x CPU, ~45 full repaints while it loads): (a) while the camera flies, the last layer is
    // moved / zoomed to the new camera (one drawImage) and repainted only when its zoom drifts past 0.8-1.5x; (b) data-only changes (ver) on a
    // resting view wait until the data is quiet for 0.3 s (2 s at most). The full layer is always painted once the view rests.
    const moving = !!this.fly, now = performance.now(), cs = this.stillCam;
    const view = [c.x, c.y, c.s, this.W, this.H, this.dpr, this.sel, this.low ? 1 : 0].join('|');
    let reuse = false;
    if (key !== this.stillKey && this.stillKey && cs) {
      const k = c.s / cs.s;
      if (moving && k > 0.8 && k < 1.5 && this.W === cs.W && this.H === cs.H) reuse = true;
      else if (!moving && view === this.stillView) {      // data only: wait until it goes quiet for 0.3 s (at most 2 s behind)
        if (now - (this.verAt || 0) < 300 && now - (this.stillAt || 0) < 2000) reuse = true;   // _frame wakes once it is quiet
      }
    }
    if (key !== this.stillKey && !reuse) {
      const k = C.getContext('2d');
      k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, C.width, C.height);
      k.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._land(k); this._network(k); this._props(k, 'still'); this._cityLayer(k, 'still');
      this.stillKey = key; this.stillView = view; this.stillAt = now; this.stillVer = this.ver; this.stillCam = { x: c.x, y: c.y, s: c.s, W: this.W, H: this.H };
      this.stillPaints = (this.stillPaints || 0) + 1;
    }
    if (reuse && moving) {                                  // the cached picture under the new camera: screen1 = (screen0 - mid) * k + mid + (c0 - c1) * s1
      const k = c.s / cs.s, mx = this.W / 2, my = this.areaMid, d = this.dpr;
      const tx = mx + (cs.x - c.x) * c.s - mx * k, ty = my + (cs.y - c.y) * c.s - my * k;
      g.save(); g.setTransform(d * k, 0, 0, d * k, d * tx, d * ty); g.globalAlpha = 1; g.drawImage(C, 0, 0, C.width / d, C.height / d); g.restore();
      g.lineJoin = 'round'; g.lineCap = 'round';
      return;
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(C, 0, 0); g.restore();
    g.lineJoin = 'round'; g.lineCap = 'round';               // the stroke state the land and the roads used to leave for the layers above
  }

  // ---------------------------------------------------------------- painting
  _pal() {
    const h = this.hourNow, i = SKYS.findIndex((k, j) => h >= k[0] && h <= SKYS[j + 1][0]), a = SKYS[Math.max(0, i)], b = SKYS[Math.max(0, i) + 1], u = (h - a[0]) / (b[0] - a[0] || 1), sm = u * u * (3 - 2 * u);
    return { sky: a[1].map((c, k) => mixHex(c, b[1][k], sm)), sea: a[2].map((c, k) => mixHex(c, b[2][k], sm)), star: a[3] + (b[3] - a[3]) * sm, sun: a[4] + (b[4] - a[4]) * sm };
  }
  _sky(g, W) {
    const hz = this.hz, t = this.t, P = this.pal = this._pal();
    const sk = g.createLinearGradient(0, 0, 0, hz);
    sk.addColorStop(0, P.sky[0]); sk.addColorStop(0.5, P.sky[1]); sk.addColorStop(0.82, P.sky[2]); sk.addColorStop(1, P.sky[3]);
    g.fillStyle = sk; g.fillRect(0, 0, W, hz + 2);
    for (const s of this.stars) { const a = 0.35 + 0.25 * Math.sin(t * 0.25 + s.ph); g.fillStyle = `rgba(243,236,224,${a * (1 - s.y) * P.star})`; g.fillRect(s.x * W, s.y * hz, s.r, s.r); }
    // moon with a soft halo (warm ivory)
    const mx = W * 0.8, my = hz - 34, mh = g.createRadialGradient(mx, my, 4, mx, my, 62);
    mh.addColorStop(0, 'rgba(240,226,190,.32)'); mh.addColorStop(1, 'rgba(240,226,190,0)');
    g.fillStyle = mh; g.fillRect(mx - 64, my - 64, 128, 128);
    g.fillStyle = P.sun > 0.5 ? '#fff1c8' : '#f1e4c2'; g.beginPath(); g.arc(mx, my, 16 + 4 * P.sun, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,130,100,.25)'; g.beginPath(); g.arc(mx - 4, my - 3, 4, 0, TAU); g.arc(mx + 5, my + 4, 2.6, 0, TAU); g.fill();
    // soft clouds drifting
    for (let k = 0; k < 4; k++) {
      const x = ((k * 140 + t * (3 + k)) % (W + 200)) - 100, y = hz * (0.3 + 0.13 * k), w = 70 + k * 18;
      g.fillStyle = `rgba(210,150,120,${0.12 + 0.03 * k})`; g.beginPath(); g.ellipse(x, y, w, 5 + k, 0, 0, TAU); g.fill();
    }
    // two ridges of hills and a far temple on the left hill
    for (let L = 0; L < 2; L++) {
      const rg = this.ridge[L], base = hz + 2, amp = L ? 26 : 40;
      g.fillStyle = L ? '#2b2230' : '#463443';
      g.beginPath(); g.moveTo(0, base);
      rg.forEach((h, k) => g.lineTo((k / 24) * W, base - 4 - h * amp * (L ? 0.8 : 1)));
      g.lineTo(W, base); g.closePath(); g.fill();
    }
    const tx = W * 0.16, ty = hz - 24;
    g.fillStyle = '#241c29'; g.fillRect(tx - 17, ty - 8, 34, 2);
    for (let k = 0; k < 6; k++) g.fillRect(tx - 15 + k * 6, ty - 17, 2.2, 9);
    g.beginPath(); g.moveTo(tx - 18, ty - 17); g.lineTo(tx, ty - 24); g.lineTo(tx + 18, ty - 17); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,205,130,.55)'; for (let k = 0; k < 3; k++) g.fillRect(tx - 9 + k * 8, ty - 12, 1.6, 3);
  }
  _sea(g, W, H) {
    const hz = this.hz, P = this.pal, sea = g.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, P.sea[0]); sea.addColorStop(0.07, P.sea[0]); sea.addColorStop(0.35, P.sea[1]); sea.addColorStop(1, P.sea[2]);
    g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
    // moon path on the water
    const mx = W * 0.8;
    for (let k = 0; k < 26; k++) {
      const y = hz + 4 + k * 9, w = 3 + k * 1.6 + Math.sin(this.t * 0.6 + k) * 2.2, a = 0.3 * (1 - k / 26);
      g.fillStyle = `rgba(240,214,160,${a})`; g.fillRect(mx - w / 2 + Math.sin(this.t * 0.5 + k * 1.7) * 4, y, w, 1.5);
    }
    // slow wave lines in world space
    const s = this.cam.s, [ox, oy] = this.toScreen(0, 0);
    g.strokeStyle = 'rgba(190,210,205,.16)'; g.lineWidth = 1; g.beginPath();
    for (const w of this.waves) {
      const x = ox + (((w.x + this.t * w.v) % 1100) - 90) * s, y = oy + w.y * s;
      if (y < hz + 4 || y > H + 4 || x < -30 || x > W + 30) continue;
      const l = w.l * Math.max(0.6, s * 2.4);
      g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 2, x + l, y);
    }
    g.stroke();
  }
  _poly(g, pts, dy = 0, grow = 1) {
    g.beginPath();
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = this.toScreen(pts[k][0], pts[k][1]);
      if (k) g.lineTo(x, y + dy); else g.moveTo(x, y + dy);
    }
    g.closePath();
  }
  _land(g) {
    const s = this.cam.s;
    for (const key of Object.keys(this.shapes)) {
      const pts = this.shapes[key], isl = this.isl[key], look = LOOK[key] || LOOK.trading;
      const [cx, cy] = this.toScreen(isl.cx, isl.cy), rx = isl.rx * s, ry = isl.ry * s;
      if (cx + rx < -40 || cx - rx > this.W + 40 || cy + ry < 0 || cy - ry > this.H + 40) continue;
      // shadow on the water and the cliff face
      g.fillStyle = 'rgba(5,10,14,.38)'; this._poly(g, pts, 14 * s + 5); g.fill();
      g.fillStyle = '#2b2219'; this._poly(g, pts, 9 * s + 2); g.fill();
      g.fillStyle = '#4a3c2c'; this._poly(g, pts, 5 * s + 1); g.fill();
      // foam and sand
      g.lineJoin = 'round';
      this._poly(g, pts); g.strokeStyle = 'rgba(235,228,205,.28)'; g.lineWidth = 7 * s + 3; g.stroke();
      g.strokeStyle = '#c6b186'; g.lineWidth = 3.6 * s + 1.5; g.stroke();
      // land
      const gr = g.createRadialGradient(cx, cy - ry * 0.2, 4, cx, cy, Math.max(rx, ry) * 1.05);
      gr.addColorStop(0, look.land[0]); gr.addColorStop(1, look.land[1]);
      g.fillStyle = gr; this._poly(g, pts); g.fill();
      // terraces, a calm paving texture
      g.save(); this._poly(g, pts); g.clip();
      g.strokeStyle = 'rgba(235,215,170,.09)'; g.lineWidth = 1.2;
      for (const k of [0.78, 0.56, 0.34]) { g.beginPath(); g.ellipse(cx, cy, rx * k, ry * k, 0, 0, TAU); g.stroke(); }
      g.fillStyle = rgba(look.tint, 0.07); g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      g.restore();
    }
  }
  _curve(g, r, w, col) {
    const [x0, y0] = this.toScreen(r[0], r[1]), [x1, y1] = this.toScreen(r[2], r[3]), [cx, cy] = this.toScreen(r[4], r[5]);
    g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  }
  _network(g) {
    const s = this.cam.s;
    g.lineCap = 'round';
    // village roads
    g.beginPath(); g.strokeStyle = 'rgba(30,22,14,.55)'; g.lineWidth = 2.4 * Math.max(0.6, s * 1.6);
    for (const r of this.roads) { const [x0, y0] = this.toScreen(r[0], r[1]), [x1, y1] = this.toScreen(r[2], r[3]), [cx, cy] = this.toScreen(r[4], r[5]); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); }
    g.stroke();
    g.beginPath(); g.strokeStyle = 'rgba(214,190,140,.78)'; g.lineWidth = 1.2 * Math.max(0.6, s * 1.6);
    for (const r of this.roads) { const [x0, y0] = this.toScreen(r[0], r[1]), [x1, y1] = this.toScreen(r[2], r[3]), [cx, cy] = this.toScreen(r[4], r[5]); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); }
    g.stroke();
    // causeways between the islands: dark edge, stone deck, gold centre line
    const k = Math.max(0.7, s * 1.5);
    for (const r of this.main) { this._curve(g, r, 6.5 * k, 'rgba(18,14,10,.7)'); this._curve(g, r, 4.4 * k, '#b6a37c'); this._curve(g, r, 1.1 * k, 'rgba(236,204,120,.9)'); }
  }
  /** mode: 'still' = the trees and houses (cached), 'live' = the glints and the lighthouses (every frame), none = all of it */
  _props(g, mode) {
    const s = this.cam.s, W = this.W, H = this.H;
    if (mode !== 'live') for (const t of this.trees) {
      const [x, y] = this.toScreen(t.x, t.y); if (x < -10 || x > W + 10 || y < 0 || y > H + 10) continue;
      const r = Math.max(1.1, 3.1 * s * t.s);
      if (t.k) { g.fillStyle = '#2f3b2c'; g.beginPath(); g.ellipse(x, y - r * 0.9, r * 0.5, r * 1.5, 0, 0, TAU); g.fill(); }
      else { g.fillStyle = '#53603a'; g.beginPath(); g.arc(x, y - r * 0.4, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(30,40,20,.35)'; g.beginPath(); g.arc(x + r * 0.2, y - r * 0.2, r * 0.7, 0, TAU); g.fill(); }
    }
    if (mode !== 'live') for (const h of this.houses) {
      const [x, y] = this.toScreen(h.x, h.y); if (x < -6 || x > W + 6 || y < 0 || y > H + 6) continue;
      const w = Math.max(1.4, h.w * s * 1.1);
      g.fillStyle = '#9a8970'; g.fillRect(x - w / 2, y - w * 0.8, w, w * 0.8);
      g.fillStyle = '#7e5b45'; g.fillRect(x - w / 2 - 0.3, y - w * 1.05, w + 0.6, w * 0.3);
      if (h.lit) { g.fillStyle = 'rgba(255,208,130,.95)'; g.fillRect(x - w * 0.12, y - w * 0.55, Math.max(0.8, w * 0.26), Math.max(0.8, w * 0.3)); }
    }
    // sea sparkle: tiny warm glints that wake and fade (cheap: a few dots)
    if (mode !== 'still' && !this.reduced) { const n = this.low ? 14 : 34; g.fillStyle = 'rgba(255,236,190,.8)'; for (let k = 0; k < n; k++) { const ph = (this.t * 0.35 + k * 0.618) % 1, a = Math.sin(ph * Math.PI); if (a < 0.2) continue; const gx = ((k * 97.3) % W), gy = this.hz + 14 + ((k * 61.7) % (H - this.hz - 150)); g.globalAlpha = a * (0.25 + 0.45 * (this.pal ? 1 - this.pal.star * 0.3 : 1)); g.fillRect(gx, gy, 1.6, 1.6); } g.globalAlpha = 1; }
    // lighthouses
    if (mode !== 'still') for (const l of this.lights) {
      const [x, y] = this.toScreen(l.x, l.y); if (x < -20 || x > W + 20 || y < 0 || y > H + 20) continue;
      const k = Math.max(0.8, s * 2.2), gl = g.createRadialGradient(x, y - 17 * k, 1, x, y - 17 * k, 16 * k);
      gl.addColorStop(0, 'rgba(255,205,120,.5)'); gl.addColorStop(1, 'rgba(255,205,120,0)');
      g.fillStyle = gl; g.fillRect(x - 17 * k, y - 34 * k, 34 * k, 34 * k);
      if (this.pal && this.pal.star > 0.2) { const ang = this.t * 0.6 + x * 0.01, bl = 70 * k, bx = Math.cos(ang), side = bx > 0 ? 1 : -1, wd = 0.25 + Math.abs(Math.sin(ang)) * 0.2;   // a soft turning beam
        const bg = g.createLinearGradient(x, y - 17 * k, x + side * bl, y - 17 * k); bg.addColorStop(0, `rgba(255,214,140,${0.30 * this.pal.star})`); bg.addColorStop(1, 'rgba(255,214,140,0)');
        g.fillStyle = bg; g.beginPath(); g.moveTo(x, y - 17 * k); g.lineTo(x + side * bl, y - 17 * k - bl * wd * 0.5); g.lineTo(x + side * bl, y - 17 * k + bl * wd * 0.5); g.closePath(); g.fill(); }
      g.fillStyle = '#d2c3a2'; g.beginPath(); g.moveTo(x - 2.6 * k, y); g.lineTo(x - 1.7 * k, y - 15 * k); g.lineTo(x + 1.7 * k, y - 15 * k); g.lineTo(x + 2.6 * k, y); g.fill();
      g.fillStyle = '#7e5b45'; g.fillRect(x - 2.2 * k, y - 18 * k, 4.4 * k, 3 * k);
      g.fillStyle = '#ffd28a'; g.fillRect(x - 1 * k, y - 17.4 * k, 2 * k, 1.8 * k);
    }
  }
  _tower(g, x, y, b, sc, lit, dimA) {
    const w = b.w * sc, h = b.h * sc, d = w * 0.5, col = b.col;
    const fx = x - w / 2, top = y - h;
    if (b.kind === 'temple') {
      // stepped base, columns and a pediment
      g.fillStyle = shade(col, 0.6); g.fillRect(fx - w * 0.15, y - h * 0.08, w * 1.3, h * 0.08);
      g.fillStyle = shade(col, 0.9); g.fillRect(fx, top + h * 0.22, w, h * 0.7);
      g.fillStyle = shade(col, 0.62); g.beginPath(); g.moveTo(fx + w, top + h * 0.22); g.lineTo(fx + w + d, top + h * 0.22 - d * 0.5); g.lineTo(fx + w + d, y - h * 0.08 - d * 0.5); g.lineTo(fx + w, y - h * 0.08); g.fill();
      g.fillStyle = shade(col, 1.12); g.beginPath(); g.moveTo(fx - w * 0.1, top + h * 0.22); g.lineTo(x + d * 0.3, top - h * 0.02); g.lineTo(fx + w + w * 0.1, top + h * 0.22); g.closePath(); g.fill();
      if (w > 4) { g.fillStyle = 'rgba(40,30,22,.5)'; const n = Math.max(3, Math.min(5, Math.round(w / 2.4))); for (let k = 0; k < n; k++) g.fillRect(fx + (w * (k + 0.5)) / n - 0.5, top + h * 0.3, Math.max(0.8, w / n * 0.28), h * 0.58); }
      if (lit && w > 3) { g.fillStyle = 'rgba(255,205,125,.85)'; g.fillRect(x - w * 0.08, y - h * 0.3, Math.max(1, w * 0.16), h * 0.22); }
      return;
    }
    g.fillStyle = shade(col, 0.95); g.fillRect(fx, top, w, h);
    g.fillStyle = shade(col, 0.72); g.fillRect(fx, y - h * 0.35, w, h * 0.35);                 // the lower floors in the street's shadow
    g.fillStyle = shade(col, 0.55); g.beginPath(); g.moveTo(fx + w, top); g.lineTo(fx + w + d, top - d * 0.5); g.lineTo(fx + w + d, y - d * 0.5); g.lineTo(fx + w, y); g.fill();
    g.fillStyle = shade(col, 1.25); g.beginPath(); g.moveTo(fx, top); g.lineTo(fx + d, top - d * 0.5); g.lineTo(fx + w + d, top - d * 0.5); g.lineTo(fx + w, top); g.fill();
    g.fillStyle = 'rgba(255,226,170,.55)'; g.fillRect(fx, top, w, Math.max(0.6, sc * 0.35));    // the roof edge catches the light
    if (b.kind === 'dome') { g.fillStyle = '#b97b4d'; g.beginPath(); g.ellipse(x + d * 0.4, top - d * 0.35, w * 0.5, w * 0.42, 0, Math.PI, TAU); g.fill(); }
    if (b.kind === 'obelisk') { g.fillStyle = shade(col, 1.2); g.beginPath(); g.moveTo(fx, top); g.lineTo(x + d * 0.3, top - w * 1.2); g.lineTo(fx + w, top); g.fill(); }
    if (w * 1 > 3.2) {                                           // lantern windows (only when big enough to read)
      const cols = Math.max(1, Math.floor(w / 2.2)), rows = Math.max(2, Math.floor(h / 2.6)), ww = Math.max(0.8, w / cols * 0.5), wh = Math.max(0.8, h / rows * 0.42);
      const cool = (b.seed & 3) === 0;                                                       // offices: cool white, homes: warm
      let z = b.seed;
      for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < cols; c2++) {
        z = (Math.imul(z, 1103515245) + 12345) >>> 0;
        if ((z >>> 16) / 65536 < lit * 0.85) { g.fillStyle = cool ? ((z & 8) ? 'rgba(214,232,255,.92)' : 'rgba(176,206,250,.8)') : ((z & 8) ? 'rgba(255,214,140,.95)' : 'rgba(255,186,98,.85)'); g.fillRect(fx + (c2 + 0.25) * (w / cols), top + (r2 + 0.3) * (h / rows), ww, wh); }
      }
    }
  }
  _cityLayer(g, mode) {
    const s = this.cam.s, W = this.W, H = this.H, t = this.t, sc = Math.max(0.5, s);   // sc: world unit -> pixels
    const order = this.cities.map((c, i) => i).sort((a, b) => this.cities[a].wy - this.cities[b].wy);
    const zoom = this.zoomLevel();
    for (const i of order) {
      const c = this.cities[i], [x, y] = this.toScreen(c.wx, c.wy);
      if (x < -50 || x > W + 50 || y < -20 || y > H + 70) continue;
      const dimmed = this.dim && this.dim[i], sel = i === this.sel;
      // mode (perf v2): 'still' = the plaza and towers of every city but the selected one (the cached layer), 'live' = the pennants and
      // the selected city whole (its ring pulses), none = everything in one pass (as before)
      const body = !mode || (mode === 'still' ? !sel : sel), flag = mode !== 'still';
      if (!body && !flag) continue;
      g.globalAlpha = dimmed ? 0.22 : 1;
      const R = c.rad * s, look = LOOK[c.cont] || LOOK.trading;
      if (body) {
      // plaza: a pale marble disc under the towers, district-tinted
      g.fillStyle = 'rgba(20,14,10,.35)'; g.beginPath(); g.ellipse(x + 1, y + R * 0.18, R * 1.12, R * 0.58, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(look.tint, c.hq ? 0.55 : 0.38); g.beginPath(); g.ellipse(x, y, R * 1.05, R * 0.52, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(240,225,190,.45)'; g.lineWidth = 1; g.stroke();
      if (sel) {
        const pulse = 1 + 0.06 * Math.sin(t * 2.2);
        g.strokeStyle = '#e3bd62'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(x, y, R * 1.5 * pulse, R * 0.78 * pulse, 0, 0, TAU); g.stroke();
        const gl = g.createRadialGradient(x, y - R * 0.3, 2, x, y - R * 0.3, R * 2.6);
        gl.addColorStop(0, 'rgba(255,205,120,.32)'); gl.addColorStop(1, 'rgba(255,205,120,0)');
        g.fillStyle = gl; g.fillRect(x - R * 2.6, y - R * 3, R * 5.2, R * 5.2);
      }
      const lit = c.live ? 0.8 : 0.5;
      for (const b of c.bl) this._tower(g, x + b.x * s, y + b.y * s, b, sc, lit, 1);
      }
      if (!flag) { g.globalAlpha = 1; continue; }
      // a pennant on the tallest roof, in the district colour (plain flag; a gold star for the saved ones)
      const tb = c.bl.reduce((m, b) => (b.h > m.h ? b : m), c.bl[0]), fx = x + tb.x * s, fy = y + tb.y * s - tb.h * sc - tb.w * sc * 0.6;
      g.strokeStyle = '#d8c7a4'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 6 * Math.max(0.8, sc * 1.4)); g.stroke();
      const fl = 5 * Math.max(0.8, sc * 1.4), fh = 3 * Math.max(0.8, sc * 1.4), wv = Math.sin(t * 2 + i) * 0.8;
      g.fillStyle = (this.star && this.star.has(c.id)) ? '#f0c85a' : look.tint; g.beginPath(); g.moveTo(fx, fy - 6 * Math.max(0.8, sc * 1.4)); g.lineTo(fx + fl, fy - 6 * Math.max(0.8, sc * 1.4) + fh / 2 + wv); g.lineTo(fx, fy - 6 * Math.max(0.8, sc * 1.4) + fh); g.fill();
      if (c.hq) { g.fillStyle = '#f0c85a'; g.beginPath(); g.arc(fx, fy - 6 * Math.max(0.8, sc * 1.4) - 3, 2.2, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    void zoom;
  }
  _life(g) {
    const s = this.cam.s, t = this.t, W = this.W, H = this.H, k = Math.max(0.7, s * 1.9);
    // ships on the sea lanes
    for (const sh of this.ships) {
      if (!this.reduced) { sh.t += sh.dir * sh.sp * 3 * this.dt; if (sh.t > 1) { sh.t = 1; sh.dir = -1; } if (sh.t < 0) { sh.t = 0; sh.dir = 1; } }
      const L = sh.ln, u = sh.t, ax = L.a[0], ay = L.a[1], bx = L.b[0], by = L.b[1], cx = L.c[0], cy = L.c[1];
      const wx = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx + u * u * bx, wy = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy + u * u * by;
      const dx = 2 * (1 - u) * (cx - ax) + 2 * u * (bx - cx);
      const [x, y] = this.toScreen(wx, wy); if (x < -20 || x > W + 20 || y < this.hz || y > H + 10) continue;
      const f = dx * sh.dir >= 0 ? 1 : -1, bob = Math.sin(t * 1.3 + sh.t * 20) * 0.7;
      g.save(); g.translate(x, y + bob); g.scale(f * k, k);
      g.strokeStyle = 'rgba(235,235,220,.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-7, 2); g.lineTo(-17, 3); g.moveTo(-6, 3); g.lineTo(-14, 5); g.stroke();
      g.fillStyle = '#5b3d2a'; g.beginPath(); g.moveTo(-7, -1); g.lineTo(8, -1); g.lineTo(5, 3); g.lineTo(-5, 3); g.closePath(); g.fill();
      g.fillStyle = sh.tint; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -13); g.lineTo(6, -3); g.closePath(); g.fill();
      if (sh.sail > 1) { g.fillStyle = shade(sh.tint, 0.82); g.beginPath(); g.moveTo(-1, -2); g.lineTo(-1, -10); g.lineTo(-6, -3); g.closePath(); g.fill(); }
      g.fillStyle = '#ffd28a'; g.fillRect(6.5, -3, 1.2, 1.2);
      g.restore();
    }
    // birds in loose flocks
    g.strokeStyle = 'rgba(236,226,206,.82)'; g.lineWidth = Math.max(1, k * 0.9); g.lineCap = 'round';
    for (const b of this.birds) {
      const a = b.ph + t * b.w, wx = b.home[0] + Math.cos(a) * b.rad + (b.x - b.home[0]) * 0.1, wy = b.home[1] + Math.sin(a) * b.rad * 0.55 - 26;
      const [x, y] = this.toScreen(wx, wy); if (x < -10 || x > W + 10 || y < 0 || y > H) continue;
      const flap = Math.sin(t * 5 + b.ph * 3) * 2.6 * k, sp = 4.6 * k;
      g.beginPath(); g.moveTo(x - sp, y - flap); g.quadraticCurveTo(x - sp * 0.4, y - 1.4 * k - flap * 0.3, x, y); g.quadraticCurveTo(x + sp * 0.4, y - 1.4 * k - flap * 0.3, x + sp, y - flap); g.stroke();
    }
  }
  _label(g, text, x, y, o = {}) {
    const font = o.font || `600 ${o.size || 12.5}px ${SANS}`; g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 14, h = (o.size || 12.5) + 9;
    let x0 = x - w / 2, y0 = y - h;
    x0 = clamp(x0, 6, this.W - w - 6); y0 = clamp(y0, 96, this.H - 96 - h);
    const box = { x0: x0 - 2, y0: y0 - 2, x1: x0 + w + 2, y1: y0 + h + 2 };
    if (!o.force && this.labelBoxes.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) return null;
    g.fillStyle = o.fill || 'rgba(22,18,14,.84)'; g.strokeStyle = o.line || 'rgba(190,160,100,.55)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, 9) : g.rect(x0, y0, w, h); g.fill(); g.stroke();
    g.fillStyle = o.color || '#f3ece0'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(text, x0 + 7, y0 + h / 2 + 0.5);
    this.labelBoxes.push(box);
    return box;
  }
  _labels(g, W, H) {
    this.banners = []; this.labelBoxes = [];
    const zoom = this.zoomLevel();
    // the district banners: serif names on a marble plate, always readable at the start, they fade once you are inside a district
    const bannerA = clamp(1.8 - zoom * 0.5, 0, 1);
    if (bannerA > 0.05) {
      for (const d of this.districts) {
        const isl = this.isl[d.key]; if (!isl) continue;
        const look = LOOK[d.key] || LOOK.trading, [cx, cy] = this.toScreen(isl.lab ? isl.lab[0] : isl.cx, isl.lab ? isl.lab[1] : isl.cy - isl.ry - 20);
        const name = look.name, sub = `${d.count} ${d.count === 1 ? 'city' : 'cities'}`;
        g.globalAlpha = bannerA;
        g.font = `600 19px ${SERIF}`; const w1 = g.measureText(name).width;
        g.font = `600 13px ${SANS}`; const w2 = g.measureText(sub).width, w = w1 + w2 + 38, h = 34;
        const x0 = clamp(cx - w / 2, 6, W - w - 6), y0 = clamp(cy - h / 2, 100, H - 100 - h);
        g.fillStyle = 'rgba(24,19,14,.88)'; g.strokeStyle = look.tint; g.lineWidth = 1.2;
        g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, 12) : g.rect(x0, y0, w, h); g.fill(); g.stroke();
        g.fillStyle = look.tint; g.beginPath(); g.roundRect ? g.roundRect(x0 + 8, y0 + 8, 4, h - 16, 2) : g.rect(x0 + 8, y0 + 8, 4, h - 16); g.fill();
        g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        g.fillStyle = '#f3ece0'; g.font = `600 19px ${SERIF}`; g.fillText(name, x0 + 20, y0 + 23);
        g.fillStyle = '#cfc4b2'; g.font = `600 13px ${SANS}`; g.fillText(sub, x0 + 26 + w1, y0 + 22.5);
        const pad = Math.max(0, (44 - h) / 2);
        this.banners.push({ key: d.key, x0, y0: y0 - pad, x1: x0 + w, y1: y0 + h + pad });
        this.labelBoxes.push({ x0, y0, x1: x0 + w, y1: y0 + h });
        g.globalAlpha = 1;
      }
    }
    // city names: capitals and the selected one first, then the rest as the view opens up (collisions never overlap)
    const cand = [];
    this.cities.forEach((c, i) => {
      const [x, y] = this.toScreen(c.wx, c.wy); if (x < -10 || x > W + 10 || y < 100 || y > H - 96) return;
      const pri = i === this.sel ? 0 : c.hq ? 1 : c.capital ? 2 : (this.star && this.star.has(c.id)) ? 3 : c.id === this.dayId ? 3 : 4;
      const showAll = zoom >= 2.3, show = pri <= 3 && zoom >= 1.0 ? true : (zoom >= 1.45 && c.n > 0 && c.order < 6) || showAll;
      if (!show && pri > 0) return;
      if (this.dim && this.dim[i] && pri > 0) return;
      cand.push({ c, i, x, y: y - c.top * this.cam.s * 1.0 - 6 * Math.max(0.8, this.cam.s * 1.4) - 10, pri, d: Math.hypot(x - W / 2, y - this.areaMid) });
    });
    cand.sort((a, b) => a.pri - b.pri || a.d - b.d);
    let shown = 0;
    for (const q of cand) {
      if (shown > 40) break;
      const sel = q.i === this.sel, name = (q.c.hq ? 'HQ · ' : '') + q.c.name + (this.seen.has(q.c.id) ? ' ✓' : '');
      const look = LOOK[q.c.cont] || LOOK.trading;
      const box = sel ? this._label(g, name, q.x, q.y, { size: 14.5, font: `700 14.5px ${SERIF}`, line: '#e3bd62', fill: 'rgba(36,28,18,.94)', force: true })
        : this._label(g, name, q.x, q.y, { size: q.pri <= 2 ? 13.5 : 12.5, line: rgba(look.tint, 0.8) });
      if (box) shown++;
    }
  }
  dispose() { this.stop(); }
}
