// Olympus World core (cities/world/, night-worlds 2026-11-19): the pure part. No DOM, no WebGL, no network: node tests import it.
//   planWorld(world, {tier})   every building of the one city as flat typed arrays (instancing), the places for picking / labels /
//                              the camera, the halos, rings and searchlights. Deterministic: the same world.json = the same city.
//   poses                      homePose / districtPose / placePose / overviewPose, poseToCam, lerpPose (short way round), clampPose
//   pick(cands, x, y)          the place under a finger from projected centres (fat-finger friendly, apps first)
//   chooseLabels(cands, max)   labels that never overlap
//   live: pcLine(lite, now), positions(lite), boardLines(board, places), labChanges(lab, world), feedLines(world, extra)
//   words: usd(v), ago(s), dateText(d), search(places, q)
export const VERSION = 'w1';
export const S = Object.freeze({ RUIN: 0, SCAFFOLD: 1, LIT: 2, BRIGHT: 3, CROWN: 4, VAULT: 5 });
export const LOT = 1.75, FOOT = 1.45;
export const STATE_WORD = Object.freeze({ live: 'Live', app: 'App', bright: 'Working', growing: 'Growing', testing: 'Being tested', planned: 'Planned',
  ruin: 'Rejected', data: 'Data', paused: 'Paused' });
const HMAX = { app: 34, bot: 21, account: 19, lab: 10, research: 14, datacity: 13, market: 13, kalshi: 9, decision: 7 };
const LITF = [0, 0.1, 0.4, 0.62, 0.6, 0.2];

// ------------------------------------------------------------------------------------------------ small helpers
export function fnv(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** '#rrggbb' -> [r, g, b] in linear light (what the shaders want) */
export function hex(h, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
  if (!m) return fallback ? hex(fallback) : [1, 0.8, 0.5];
  const n = parseInt(m[1], 16), f = (v) => Math.pow(v / 255, 2.2);
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function usd(v, sign) {
  if (typeof v !== 'number' || !isFinite(v)) return '-';
  const r = Math.round(v), s = '$' + Math.abs(r).toLocaleString('en-US');
  return r < 0 ? '-' + s : sign && r > 0 ? '+' + s : s;
}
export function ago(s) {
  if (s == null || !isFinite(s)) return 'never';
  s = Math.max(0, Math.round(s));
  if (s < 90) return 'just now';
  if (s < 5400) return Math.round(s / 60) + ' min ago';
  if (s < 2 * 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateText(d) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(d || ''));
  return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : '';
}
export function addDays(iso, n) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || ''));
  if (!m) return '';
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + Math.round(n)));
  return t.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------------------------------------ the city plan
export function heightOf(kind, code) {
  const k = clamp((+code || 0) / 255, 0, 1);
  return 0.9 + Math.pow(k, 1.15) * ((HMAX[kind] || 12) - 0.9);
}
export function districtAt(w, x, z) {
  const a = Math.atan2(z, x);
  for (const d of w.districts || []) {
    const span = ((d.a1 - d.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    if ((((a - d.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) <= span + 1e-9) return d;
  }
  return (w.districts || [])[0] || null;
}
/** the light level of a place (the place texture's alpha x 2): paused Kalshi is dim, live is bright */
export function lightOf(p) {
  if (p.district === 'kalshi' && p.kind !== 'app') return 0.62;
  return p.state === 'live' ? 1.15 : p.state === 'ruin' ? 0.8 : 1.0;
}
const HALO = { live: 0.55, app: 0.3, bright: 0.35, growing: 0.3, testing: 0.2, planned: 0.2, data: 0.3, ruin: 0.1 };

/**
 * planWorld(world, {tier: 'high' | 'low'}) -> { places, n, pos, size, info, tint, misc, halos, rings, beams, R, stats }
 * typed arrays per building instance: pos (x, stack base y, z), size (w, h, d), info (place index, seed, state, lit share),
 * tint (rgb), misc (born day, part, tilt, filler)
 */
export function planWorld(w, opts) {
  const o = opts || {}, low = o.tier === 'low' || o.tier === 'off';
  const C = +w.cell || 7, PL = +w.plaza || 26, R = +w.R || 120;
  const out = [];
  const push = (pi, x, y, z, sx, sy, sz, seed, st, lit, rgb, born, part, tilt, filler) => out.push([pi, x, y, z, sx, sy, sz, seed, st, lit, rgb, born, part, tilt, filler]);
  const stack = (pi, x, z, fw, fd, h, seed, st, lit, rgb, born, filler, r) => {
    if (h > 8 && st !== S.RUIN) {
      const hb = h * 0.66;
      push(pi, x, 0, z, fw, hb, fd, seed, st, lit, rgb, born, 0, 0, filler);
      const s2 = 0.62 + r() * 0.16;
      push(pi, x, hb, z, fw * s2, h - hb, fd * s2, seed + 0.13, st, lit, rgb, born, 1, 0, filler);
      if (h > 15 && !low) push(pi, x, h, z, 0.12, h * 0.2, 0.12, seed + 0.31, st, lit, rgb, born, 2, 0, filler);
    } else {
      push(pi, x, 0, z, fw, h, fd, seed, st, lit, rgb, born, 0, st === S.RUIN ? 0.22 : 0, filler);
    }
  };
  const warm = [[1, 0.72, 0.42], [0.78, 0.86, 1], [1, 0.9, 0.75]].map((c) => c.map((v) => Math.pow(v, 2.2)));
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const districts = Object.fromEntries((w.districts || []).map((d) => [d.id, d]));
  const places = [];
  const halos = [], rings = [], beams = [];
  (w.places || []).forEach((p, pi) => {
    const r = rng(fnv(p.id));
    const hue = hex(p.hue, (districts[p.district] || {}).hue);
    const b = Array.isArray(p.b) ? p.b : [];
    let top = 0;
    const cells = Array.isArray(p.cells) ? p.cells : [];
    if (p.kind === 'app') {
      const c = cells[0] || [Math.round(p.x / C), Math.round(p.z / C)];
      const cx = c[0] * C, cz = c[1] * C, code = b[0] || 120;
      const h = heightOf('app', code), fw = 2.7 + (code / 255) * 1.5;
      stack(pi, cx, cz, fw, fw * (0.82 + r() * 0.18), h, r(), S.CROWN, 0.6, hue, 0, 0, r);
      top = h;
      for (let k = 0; k < (low ? 2 : 4); k++) {
        const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1, hh = 1.4 + r() * 3.2;
        push(pi, cx + sx * 2.8, 0, cz + sz * 2.8, 1.2 + r() * 0.4, hh, 1.2 + r() * 0.4, r(), S.LIT, 0.3, mixc(warm[k % 3], hue, 0.35), 0, 0, 0, 1);
      }
    } else {
      const lots = [];
      for (const c of cells) for (let a = -1; a <= 1; a++) for (let e = -1; e <= 1; e++) {
        const x = c[0] * C + a * LOT, z = c[1] * C + e * LOT;
        lots.push([Math.hypot(x - p.x, z - p.z) + r() * 0.6, x, z]);
      }
      lots.sort((u, v) => u[0] - v[0]);
      const bl = [];
      for (let k = 0; k + 2 < b.length; k += 3) bl.push([b[k], b[k + 1], b[k + 2]]);
      bl.sort((u, v) => v[0] - u[0]);
      let li = 0;
      for (const [code, st, day] of bl) {
        if (li >= lots.length) break;
        const [, x, z] = lots[li++];
        const h = heightOf(p.kind, code) * (st === S.RUIN ? 0.55 : 1);
        const f = st === S.RUIN ? 0.5 + r() * 0.35 : 0.64 + r() * 0.36;
        let lit = LITF[st] != null ? LITF[st] : 0.4;
        if (st === S.VAULT) lit = p.progress != null ? clamp(p.progress, 0, 1) : 0.15;
        stack(pi, x + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, FOOT * f, FOOT * (0.6 + r() * 0.4), h, r(), st, lit, hue, day || 0, 0, r);
        top = Math.max(top, h);
      }
      const keep = low ? 0.35 : 0.6;
      for (; li < lots.length; li++) {
        if (r() > keep) continue;
        const [, x, z] = lots[li];
        const hh = 0.7 + r() * 2.4;
        push(pi, x, 0, z, FOOT * (0.6 + r() * 0.35), hh, FOOT * (0.6 + r() * 0.35), r(), S.LIT, 0.16, mixc(warm[li % 3], hue, 0.3), 0, 0, 0, 1);
      }
    }
    const kindTop = Math.max(top, 2);
    places.push({ i: pi, id: p.id, name: p.name, kind: p.kind, district: p.district, quarter: p.quarter, state: p.state, x: p.x, z: p.z,
      r: p.r || C * 0.6, top: kindTop, hue, href: p.href || null, light: lightOf(p), raw: p });
    // halos only where the light is (live, bright, the owner's own app shortcuts): few big soft quads, not hundreds (fill rate)
    if (p.kind === 'bot' || p.kind === 'account' || p.state === 'live' || p.state === 'bright' || (p.kind === 'app' && p.shortcut)) {
      const hi = HALO[p.state] != null ? HALO[p.state] : 0.3;
      halos.push([p.x, kindTop * 0.55 + 1.5, p.z, Math.min(48, (p.r || 4) * 1.25 + kindTop * 0.4 + 3), hue[0], hue[1], hue[2], hi, pi]);
    }
    if (p.kind === 'bot') {
      rings.push([p.x, kindTop + 4, p.z, Math.max(6, p.r * 0.4), 1, 0.35, 0.14, 0.12, hue, 0.9, pi]);
      beams.push([p.x, kindTop, p.z, 1.0, 140, 3.2, 0.21 + r() * 0.1, r() * 6.28, hue, pi]);
    } else if (p.kind === 'account' && p.state !== 'planned') {
      rings.push([p.x, kindTop + 2.2, p.z, 3.4, p.progress != null ? clamp(p.progress, 0.02, 1) : 0.02, 0.0, 0.3, 0, hex('#ffd27a'), 1.6, pi]);
    } else if (p.kind === 'app' && p.href === 'hub/zeus.html') {
      rings.push([p.x, kindTop + 3, p.z, 5.5, 1, -0.4, 0.14, 0.18, hue, 1.8, pi]);
      beams.push([p.x, kindTop, p.z, 1.0, 160, 3.0, 0.17, 1.3, hue, pi], [p.x, kindTop, p.z, 1.0, 150, 3.0, -0.19, 4.1, hue, pi]);
    }
  });
  // the city fabric: every free cell of the grid (heights follow the distance to the plaza; level 0 = a park)
  const N = places.length;
  const fill = Array.isArray(w.filler) ? w.filler : [];
  for (const [ci, cj, lvl] of fill) {
    if (!lvl) continue;
    const r = rng(fnv('f' + ci + ',' + cj));
    const cx = ci * C, cz = cj * C;
    const d = districtAt(w, cx, cz), dh = hex(d && d.hue);
    const pf = (0.32 + lvl * 0.055) * (low ? 0.55 : 1);
    for (let a = -1; a <= 1; a++) for (let e = -1; e <= 1; e++) {
      if (r() > pf) continue;
      const tall = r() < 0.05 * lvl / 9;
      const h = (0.9 + Math.pow(r(), 1.7) * (0.6 + lvl * 1.15)) * (tall ? 2.1 : 1);
      const c = mixc(warm[(a + e + 3) % 3], dh, 0.28);
      const fw = FOOT * (0.62 + r() * 0.38), fd = FOOT * (0.62 + r() * 0.38);
      if (h > 8) stack(N, cx + a * LOT, cz + e * LOT, fw, fd, h, r(), S.LIT, 0.24 + r() * 0.2, c, 0, 1, r);
      else push(N, cx + a * LOT, 0, cz + e * LOT, fw, h, fd, r(), S.LIT, 0.2 + r() * 0.24, c, 0, 0, 0, 1);
    }
  }
  // the Gate on the plaza: the tallest spire of the city, four searchlights and three crown rings (place index N = 'the plaza')
  const gold = hex('#ffd890');
  const gr = rng(7);
  stack(N, 0, 0, 5.2, 5.2, 46, 0.5, S.CROWN, 0.7, gold, 0, 0, gr);
  for (const [k, rad, y] of [[0, 8, 41], [1, 12.5, 33]]) rings.push([0, y, 0, rad, 1, (k % 2 ? -1 : 1) * (0.12 + k * 0.05), 0.08 + k * 0.03, 0.05 * k, gold, 1.0 - k * 0.25, N]);
  for (let k = 0; k < 4; k++) beams.push([0, 46, 0, 1.0, 230, 4.0, 0.13 + k * 0.025, k * 1.57, k % 2 ? hex('#9fc4ff') : gold, N]);
  // the four districts glow over their wedges (place indices N+1..N+4)
  halos.push([0, 30, 0, 30, gold[0], gold[1], gold[2], 0.45, N]);
  // flat arrays
  const n = out.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n * 3), info = new Float32Array(n * 4), tint = new Float32Array(n * 3), misc = new Float32Array(n * 4);
  out.forEach((b, k) => {
    pos[k * 3] = b[1]; pos[k * 3 + 1] = b[2]; pos[k * 3 + 2] = b[3];
    size[k * 3] = b[4]; size[k * 3 + 1] = b[5]; size[k * 3 + 2] = b[6];
    info[k * 4] = b[0]; info[k * 4 + 1] = b[7] % 1; info[k * 4 + 2] = b[8]; info[k * 4 + 3] = b[9];
    tint[k * 3] = b[10][0]; tint[k * 3 + 1] = b[10][1]; tint[k * 3 + 2] = b[10][2];
    misc[k * 4] = b[11]; misc[k * 4 + 1] = b[12]; misc[k * 4 + 2] = b[13]; misc[k * 4 + 3] = b[14];
  });
  const data = out.filter((b) => !b[14] && b[0] < N).length;
  return { places, n, pos, size, info, tint, misc, halos, rings, beams, R, C, PL, slots: N + 1 + (w.districts || []).length,
    stats: { instances: n, data, filler: n - data, places: N } };
}

// ------------------------------------------------------------------------------------------------ the camera
export function poseToCam(p) {
  const cp = Math.cos(p.pitch), ty = p.ty || 0;
  return { pos: [p.tx + p.dist * Math.sin(p.yaw) * cp, ty + p.dist * Math.sin(p.pitch), p.tz + p.dist * Math.cos(p.yaw) * cp], look: [p.tx, ty, p.tz] };
}
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export function lerpPose(a, b, k) {
  const t = clamp(k, 0, 1), L = (x, y) => x + (y - x) * t;
  return { tx: L(a.tx, b.tx), ty: L(a.ty || 0, b.ty || 0), tz: L(a.tz, b.tz), dist: Math.exp(L(Math.log(a.dist), Math.log(b.dist))),
    yaw: a.yaw + wrap(b.yaw - a.yaw) * t, pitch: L(a.pitch, b.pitch) };
}
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 0 at both ends, 1 in the middle: the warp's speed curve */
export const warpCurve = (t) => Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 2);
export function clampPose(p, w) {
  const R = (w && +w.R) || 140;
  const lim = R + 60, d = Math.hypot(p.tx, p.tz);
  const q = { ...p, dist: clamp(p.dist, 7, R * 3.6), pitch: clamp(p.pitch, 0.1, 1.45), yaw: wrap(p.yaw) };
  if (d > lim) { q.tx = p.tx / d * lim; q.tz = p.tz / d * lim; }
  for (const k of ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch']) if (!isFinite(q[k])) q[k] = k === 'dist' ? 150 : k === 'pitch' ? 0.6 : 0;
  return q;
}
export function homePose(w) { const R = (w && +w.R) || 130; return { tx: 0, ty: 0, tz: -R * 0.42, dist: R * 1.5, yaw: -0.38, pitch: 0.62 }; }
export function overviewPose(w) { const R = (w && +w.R) || 130; return { tx: 0, ty: 0, tz: -R * 0.08, dist: R * 3.1, yaw: -0.35, pitch: 1.12 }; }
export function districtPose(w, d) {
  if (!d) return homePose(w);
  const len = Math.hypot(d.x, d.z) || 1;
  const span = Math.abs(((d.a1 - d.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) || 1;
  const R = (w && +w.R) || 130;
  return { tx: d.x, ty: 0, tz: d.z, dist: clamp(R * (0.45 + span * 0.22), 70, R * 1.25), yaw: Math.atan2(-d.x / len, -d.z / len), pitch: 0.82 };
}
/** a place: frame it from the plaza side (or keep the current yaw), close enough to read its buildings */
export function placePose(pl, cur) {
  // an app tower downtown is framed from the plaza side; a learning place from outside, the downtown skyline behind it (never hidden by it)
  const len = Math.hypot(pl.x, pl.z), app = pl.kind === 'app';
  const yaw = len > 1 ? (app ? Math.atan2(-pl.x / len, -pl.z / len) : Math.atan2(pl.x / len, pl.z / len)) + 0.35 : (cur ? cur.yaw : 0);
  return { tx: pl.x, ty: Math.min(pl.top * 0.3, 8), tz: pl.z, dist: clamp(pl.r * 2.3 + pl.top * 1.25 + 10, 20, 150), yaw: wrap(yaw), pitch: app ? 0.42 : 0.56 };
}

// ------------------------------------------------------------------------------------------------ picking and labels
/** cands: [{i, sx, sy, rpx, front, kind}] in CSS pixels; the place whose centre is nearest the finger (relative to its size). Apps win ties. */
export function pick(cands, x, y) {
  let best = null, bs = Infinity;
  for (const c of cands || []) {
    if (!c || !c.front) continue;
    const d = Math.hypot(c.sx - x, c.sy - y), lim = Math.max(26, Math.min(140, c.rpx * 1.05));
    if (d > lim) continue;
    const s = d / Math.max(18, c.rpx) - (c.kind === 'app' ? 0.25 : 0);
    if (s < bs) { bs = s; best = c; }
  }
  return best ? best.i : -1;
}
/** cands in priority order: [{key, sx, sy, w, h}]: the ones that fit without overlapping (max n), keys returned */
export function chooseLabels(cands, max, W, H, top) {
  const T = top == null ? 60 : top;
  const got = [], boxes = [];
  for (const c of cands || []) {
    if (got.length >= max) break;
    if (!(c.sx - c.w / 2 > 4 && c.sy - c.h > T && c.sx + c.w / 2 < W - 4 && c.sy < H - 40)) continue;
    const b = [c.sx - c.w / 2 - 3, c.sy - c.h - 3, c.sx + c.w / 2 + 3, c.sy + 3];
    if (boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))) continue;
    boxes.push(b); got.push(c.key);
  }
  return got;
}
export function search(places, q) {
  const ws = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const out = [];
  for (const p of places || []) {
    const raw = p.raw || p;
    const hay = [raw.name, raw.line, raw.quarter, raw.district, ...(raw.facts || []).map((f) => f.join(' '))].join(' ').toLowerCase();
    if (!ws.every((w) => hay.indexOf(w) >= 0)) continue;
    const name = String(raw.name || '').toLowerCase();
    out.push([(raw.kind === 'app' ? 0 : 2) + (name.startsWith(ws[0]) ? 0 : name.indexOf(ws[0]) >= 0 ? 0.5 : 1), p]);
  }
  return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// ------------------------------------------------------------------------------------------------ what is happening now
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
/** the PC line from the live feed: {text, silent, age_s} */
export function pcLine(lite, nowS) {
  const t = isObj(lite) && +lite.t > 0 ? +lite.t : null;
  const age = t ? Math.max(0, nowS - t) : null;
  const silent = age == null || age > 1800;
  return { silent, age_s: age, text: t == null ? 'PC: no live report here' : silent ? 'PC silent · ' + ago(age) : 'PC live · ' + ago(age) };
}
/** the open trades of the bots from the PC feed: {lit: {side} | null, atlas: ...} (the core board card's position) */
export function positions(lite) {
  const bd = isObj(lite) && isObj(lite.board) ? lite.board : {};
  const out = {};
  for (const k of ['lit', 'atlas', 'blitz']) {
    const p = isObj(bd[k]) ? bd[k].position : null;
    out[k] = isObj(p) && +p.entry_t > 0 ? { side: String(p.side || (+p.dir === -1 ? 'SHORT' : 'LONG')).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG', entry_t: +p.entry_t } : null;
  }
  return out;
}
const EVENT_WORDS = { bot_started: 'The bots started on your PC', eval_passed: 'passed its eval', eval_failed: 'eval ended', account_locked: 'MFFU locked the account (no orders)',
  order_rejected: 'an order was rejected', balance: 'balance saved after the close', risk_alert: 'risk alert: see the Board', weekly_review: 'The weekly review is ready',
  morning_brief: 'The morning brief was sent', trade_opened: 'a trade opened', trade_closed: 'a trade closed', payout: 'payout step' };
/** the Board's newest events as plain ticker lines (fixed words per kind: an event's own text is never shown here) */
export function boardLines(board, places) {
  const ev = isObj(board) && Array.isArray(board.events) ? board.events : [];
  const names = {};
  for (const p of places || []) if (p.kind === 'account') names[String(p.id).replace(/^acct:/, '')] = p;
  const out = [];
  for (const e of ev.slice(0, 12)) {
    if (!isObj(e) || !EVENT_WORDS[e.kind]) continue;
    const pl = names[e.acct] || null;
    const words = EVENT_WORDS[e.kind];
    const text = /^[A-Z]/.test(words) ? words : (pl ? pl.name : 'An account') + ': ' + words;
    out.push({ t: +e.t || 0, id: pl ? pl.id : e.kind === 'bot_started' ? 'bot:lit' : null, text, live: true });
  }
  return out.sort((a, b) => b.t - a.t).slice(0, 6);
}
/** lab.json newer than the world: the new verdicts of places already in the city: [{id, state}] */
export function labChanges(lab, w) {
  if (!isObj(lab) || !Array.isArray(lab.rows)) return [];
  const map = { rejected: 'ruin', blocked: 'ruin', parked: 'planned', shadow: 'growing', passed: 'growing', adopted: 'bright' };
  const have = new Map((w.places || []).map((p) => [p.id, p]));
  const out = [];
  for (const r of lab.rows) {
    const p = isObj(r) ? have.get('lab:' + r.id) : null;
    const st = isObj(r) ? map[r.status] || 'testing' : null;
    if (p && st && st !== p.state) out.push({ id: p.id, state: st });
  }
  return out;
}
/** the ticker: live lines first (newest), then what the city learned (world.feed, newest first) */
export function feedLines(w, extra) {
  const lines = [...(extra || [])];
  for (const f of (w && w.feed) || []) lines.push({ d: f.d, id: f.id || null, text: (f.d ? dateText(f.d) + ' · ' : '') + f.text });
  return lines;
}
