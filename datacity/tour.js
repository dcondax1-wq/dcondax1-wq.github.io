// The cinematic tour: a script of shots built from the data (the overview, LIT's tower, the top discovery, the biggest
// districts with their honesty numbers, the noise, the harbor, the last session's Today layer), flown as eased camera
// moves with a caption each. Pure maths + callbacks: no DOM, no three.js beyond the vectors it is handed.
//   shots(model, L)                        -> [{ cam: [x,y,z], look: [x,y,z], dur, caption, today? }]
//   new Tour(shots, V3, { onCaption, onEnd, onShot })   .step(dt) -> { pos, look } | null (ended)
import { money, num } from './util.js';
import { routes } from './routes.js';

const MOVE_S = 2.4;           // the move into a shot; then it drifts for its dur

const fmt = (n) => (n ?? 0).toLocaleString('en-US');

export function shots(model, L) {
  const out = [], g = model.guard || {}, D = L.districts;
  const b = L.bounds, span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
  out.push({ cam: [0, span * 0.55, b.z1 + span * 0.25], look: [0, 0, (b.z0 + b.z1) / 2 - span * 0.05], dur: 5,
             caption: `OLYMPUS DATA CITY · ${fmt(L.items.length)} buildings · each one a backtest on CME NQ futures` });
  const lit = model.lit?.spans || {};
  out.push({ cam: [44, 30, 52], look: [0, 26, 0], dur: 5,
             caption: lit['2026'] ? `LIT, the live strategy · 2026 PF ${num(lit['2026'].pf, 2)} ${money(lit['2026'].net)} · H2 check PF ${num(lit['2026 H2']?.pf, 2)} ${money(lit['2026 H2']?.per_month)}/mo`
               : 'LIT, the live strategy, in the middle of the plaza' });
  const top = model.discoveries?.[0];
  const mon = L.items.find((it) => it.kind === 'd');
  if (top && mon) out.push({ cam: [mon.x * 2.1, 10, mon.z * 2.1], look: [mon.x, mon.h * 0.6, mon.z], dur: 5, caption: `Discovery #1 · ${top.text}`.slice(0, 180) });
  const big = D.filter((d) => d.kind === 'combos' || d.plugin).sort((a, c) => c.n - a.n).slice(0, 5);
  for (const d of big) {
    const r = Math.max(40, d.half * 1.5);
    out.push({ cam: [d.cx + r * 0.7, r * 0.55, d.cz + r * 0.8], look: [d.cx, 2, d.cz], dur: 4.5,
               caption: `${d.name} · ${fmt(d.n)} buildings${d.fdr !== undefined ? ` · ${fmt(d.fdr)} pass the noise guard` : ''} · ${d.blurb}`.slice(0, 180) });
  }
  const grey = model.buildings.filter((x) => x.cls === 'grey').length;
  const w = big[0];
  if (w) out.push({ cam: [w.cx - w.half * 1.2, w.half * 0.35, w.cz - w.half * 0.4], look: [w.cx, 1, w.cz], dur: 5,
                    caption: `Grey = noise: ${fmt(grey)} of ${fmt(model.buildings.length)}. ${g.fdr_pos ?? '–'} pass the false-discovery guard; a shuffled placebo passes ${g.placebo_fdr ?? '–'}.` });
  const hb = D.find((d) => d.kind === 'harbor');
  if (hb) out.push({ cam: [hb.cx + 30, 26, hb.cz + hb.half + 40], look: [hb.cx, 0, hb.cz], dur: 5,
                     caption: `Harbor · ${fmt(hb.n)} ships, one per LIT trade (the live settings replayed, costs in): green won, red lost. Cargo ships sail past` });
  // v3: the river, the monorail, the gold finale
  try {
    const R = routes(L), rv = R.river[Math.floor(R.river.length * 0.3)], st = R.stations[0];
    if (rv) out.push({ cam: [rv[0] * 1.12, 16, rv[1] * 1.12], look: [rv[0] * 0.9, 0, rv[1] * 0.9], dur: 4.5,
                       caption: 'The river winds round the districts and flows into the Harbor; it reflects the sky and the glow of the city' });
    if (st) out.push({ cam: [st.x * 1.08, 21, st.z * 1.08], look: [st.x * 0.92, 11, st.z * 0.92], dur: 4.5,
                       caption: `The monorail loops the city, one station at every district (${R.stations.length} stations); flying taxis cross above it` });
  } catch (e) { /* no routes: skip those two shots */ }
  const t = model.today;
  if (t?.day) {
    const st = Object.values(t.states || {}).slice(0, 4).join(', ');
    out.push({ cam: [0, span * 0.42, -span * 0.55], look: [0, 0, 0], dur: 6, today: true,
               caption: `Last session ${t.day}: ${fmt(t.fired)} fired, ${fmt(t.armed)} armed${st ? ` · ${st}` : ''}` });
  }
  const gold = L.items.find((it) => it.kind === 'b' && it.b.cls === 'gold');
  if (gold) out.push({ cam: [gold.x + 46, gold.h + 30, gold.z + 46], look: [gold.x, gold.h * 0.8, gold.z], dur: 6, fireworks: true,
                       caption: `Gold: it holds in 2026, in 2021-25 and in every year, and passes the noise guard. Fireworks for every one that appears (${model.buildings.filter((b) => b.cls === 'gold').length} so far)` });
  out.push({ cam: [-span * 0.5, span * 0.3, span * 0.2], look: [0, 6, 0], dur: 4, caption: 'Paper only: the city proposes, it never changes the bot.' });
  return out;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Tour {
  constructor(list, V3, cb = {}) {
    this.list = list; this.cb = cb; this.i = -1; this.t = 0;
    this.V = (a) => new V3(a[0], a[1], a[2]);
    this.pos = null; this.look = null;
  }

  get info() { return { on: this.i >= 0 && this.i < this.list.length, step: this.i, steps: this.list.length, caption: this.list[this.i]?.caption || '' }; }

  /** Start from the camera's current position / look-at. */
  start(pos, look) {
    this.from = { pos: pos.clone(), look: look.clone() };
    this._next();
  }

  _next() {
    this.i++;
    this.t = 0;
    if (this.i >= this.list.length) { this.cb.onEnd?.(); return; }
    const s = this.list[this.i];
    if (this.i > 0) this.from = { pos: this.pos.clone(), look: this.look.clone() };
    this.to = { pos: this.V(s.cam), look: this.V(s.look) };
    this.cb.onShot?.(s, this.i, this.list.length);
    this.cb.onCaption?.(s.caption, this.i, this.list.length);
  }

  step(dt) {
    if (this.i < 0 || this.i >= this.list.length) return null;
    const s = this.list[this.i];
    this.t += dt;
    const k = ease(Math.min(1, this.t / MOVE_S));
    this.pos = this.from.pos.clone().lerp(this.to.pos, k);
    this.look = this.from.look.clone().lerp(this.to.look, k);
    const drift = Math.max(0, this.t - MOVE_S) * 0.06;                       // a slow push-in while it holds
    this.pos.lerp(this.look, Math.min(0.25, drift));
    if (this.t >= MOVE_S + s.dur) this._next();
    return this.i < this.list.length ? { pos: this.pos, look: this.look } : null;
  }

  stop() { this.i = this.list.length; }
}
