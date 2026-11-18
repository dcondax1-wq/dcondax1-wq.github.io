// Where the river runs and the monorail loops (pure maths: no three.js, no DOM). Both keep clear of every district, the plaza and the harbor:
// the outline of the districts is measured ray by ray from the plaza (the envelope), the monorail runs just outside it, the river
// a little further out, and the river flows into the Harbor at both ends.
//   routes(L) -> { env, rail: [[x, z]], stations: [{ key, name, x, z, a }], river: [[x, z]], riverW, harbor }
const STEPS = 128;
const TAU = Math.PI * 2;

/** the radius, per angle, at which a point is clear of every district square by `margin` (smoothed, never smaller than the raw outline) */
export function envelope(L, margin, steps = STEPS) {
  const ds = L.districts.filter((d) => d.kind !== 'harbor'), raw = new Array(steps).fill((L.plazaR || 34) + margin);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU, dx = Math.cos(a), dz = Math.sin(a);
    for (const d of ds) {
      const h = d.half + margin, x0 = d.cx - h, x1 = d.cx + h, z0 = d.cz - h, z1 = d.cz + h;
      let tmin = 0, tmax = 1e9, ok = true;
      for (const [o, dd, lo, hi] of [[0, dx, x0, x1], [0, dz, z0, z1]]) {
        if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
        const t1 = lo / dd, t2 = hi / dd;
        tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      }
      if (ok && tmax >= tmin && tmax < 1e8) raw[i] = Math.max(raw[i], tmax);
    }
  }
  let env = raw.slice();
  for (let pass = 0; pass < 3; pass++) {
    const sm = env.map((_, i) => { let s = 0; for (let k = -4; k <= 4; k++) s += env[(i + k + steps) % steps]; return s / 9; });
    env = sm.map((v, i) => Math.max(v, raw[i]));
  }
  return env;
}

export function routes(L) {
  const env = envelope(L, 8), env2 = envelope(L, 20), steps = STEPS;
  const rail = env.map((r, i) => { const a = (i / steps) * TAU, rr = r + 3 + 2 * Math.sin(a * 5); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
  const hb = L.harbor;
  if (hb) for (const q of rail) if (q[0] > hb.x0 - 8 && q[0] < hb.x1 + 8 && q[1] > hb.z0 - 8) q[1] = hb.z0 - 8;     // the loop never enters the harbor: it runs along its north quay
  const inHarbor = (x, z) => hb && x > hb.x0 - 12 && x < hb.x1 + 12 && z > hb.z0 - 16 && z < hb.z1 + 12;
  const pts = env2.map((r, i) => {
    const a = (i / steps) * TAU, rr = r + 22 + 6 * Math.sin(a * 3 + 0.7) + 3 * Math.sin(a * 7 + 2.1);
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });
  // the longest stretch of the ring outside the harbor
  const out = pts.map(([x, z]) => !inHarbor(x, z));
  let best = { len: 0, at: 0 };
  for (let s = 0; s < steps; s++) {
    if (!out[s] || out[(s + steps - 1) % steps]) continue;
    let len = 0;
    while (len < steps && out[(s + len) % steps]) len++;
    if (len > best.len) best = { len, at: s };
  }
  let river = [];
  for (let k = 0; k < best.len; k++) river.push(pts[(best.at + k) % steps]);
  if (hb && river.length > 4) {                                  // flow into the harbor at both ends
    const a = river[0], z = river[river.length - 1];
    river = [[a[0], Math.min(hb.z0 + 8, a[1] + 30)], ...river, [z[0], Math.min(hb.z0 + 8, z[1] + 30)]];
  }
  const ds = L.districts.filter((d) => d.kind !== 'harbor');
  const stations = ds.map((d) => {
    const a = Math.atan2(d.cz, d.cx), i = Math.round(((a + TAU) % TAU) / TAU * steps) % steps;
    return { key: d.key, name: d.name, x: rail[i][0], z: rail[i][1], a, i };
  }).sort((p, q) => p.i - q.i);
  return { env, rail, stations, river, riverW: 13, harbor: !!hb };
}
