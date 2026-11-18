// PROMETHEUS forge: the data side of THE FORGE page (no DOM, no WebGL). Loads forge.json (tools/prometheus/forge.py), or
// builds a seeded demo fixture when it is missing, and answers the page's questions: a generation's creatures, the best
// one, a creature's genome numbers, the champion's lineage up to a generation, the parameter diff against live.
// Every number shown on the page comes from forge.json; the demo fixture is marked DEMO everywhere it shows.

export const FMT = {
  usd(x) {
    if (x == null || !isFinite(x)) return '—';
    const r = Math.round(Math.abs(x));
    return (x < 0 ? '−' : '') + '$' + r.toLocaleString('en-US');
  },
  dUsd(x) {
    if (x == null || !isFinite(x)) return '—';
    return (x > 0 ? '+' : x < 0 ? '−' : '±') + '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
  },
  pct(x) { return x == null || !isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1) + '%'; },
  num(x, d = 2) { return x == null || !isFinite(x) ? '—' : Number(x).toFixed(d); },
  knob(k, v) {
    if (v == null) return '—';
    if (k.key === 'win_end') { const h = Math.floor(v / 60), m = v % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
    const s = Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    return k.unit && k.unit !== 'min' ? `${s} ${k.unit}` : k.unit === 'min' ? `${s} min` : s;
  },
};

// ------------------------------------------------------------------------------------------------ demo fixture
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function demoData(seed = 7) {
  const R = rng(seed);
  const knobs = [
    ['cisd1m', '1m CISD confirmation window after the tap', 'bars', 10, 40, 2, 22], ['be_r', 'Breakeven moves the stop at', 'R', 0.5, 2, 0.125, 1],
    ['be_off', 'Breakeven stop above the entry', 'pts', 0, 3, 0.25, 1.25], ['t_at', 'Early check (cut a loser) after', 'min', 5, 40, 5, 15],
    ['max_rr', 'Target banked at', 'R', 4, 12, 0.5, 8], ['vix_k', 'Target = 18:00 open +/- VIX day move x', 'x', 0.6, 1.6, 0.05, 1],
    ['min_rr', 'Minimum target distance', 'R', 1, 2.5, 0.1, 1.5], ['disp', 'Displacement body at least', 'ATR', 0.5, 1.2, 0.05, 0.8],
    ['win_end', 'Last entry (ET)', 'min', 600, 945, 15, 930], ['room_f', 'Eval size: share of the drawdown left', 'x', 0.4, 1, 0.05, 0.8],
  ].map(([key, label, unit, lo, hi, step, live]) => ({ key, label, unit, lo, hi, step, live, n: Math.round((hi - lo) / step) + 1 }));
  const liveV = knobs.map((k) => Math.round((k.live - k.lo) / k.step));
  const key = (v) => v.join('-');
  const genomes = {};
  const put = (v) => {
    const k = key(v);
    if (genomes[k]) return k;
    const d = v.reduce((a, x, i) => a + Math.abs(x - liveV[i]) / knobs[i].n, 0);
    const lucky = R();
    const pm1 = Math.round(5562 * (1 + 0.35 * lucky - 0.5 * d)), pm2 = Math.round(2670 * (1 + 0.3 * (R() - 0.55) - 0.4 * d));
    genomes[k] = { v, xy: [Math.max(-1, Math.min(1, (v[0] - liveV[0]) / 6 + (v[4] - liveV[4]) / 10 + (R() - 0.5) * 0.3)),
      Math.max(-1, Math.min(1, (v[3] - liveV[3]) / 4 - (v[9] - liveV[9]) / 6 + (R() - 0.5) * 0.3))],
    h1: { n: 80, tpw: 3.1 - d, pf: 4.9 - 3 * d, net: pm1 * 6, pm: pm1, dd: -2196, p10: Math.round(570 + 120 * lucky - 300 * d) / 10, f10: Math.round(17 + 60 * d) / 10, wk2: 85 },
    h2: { n: 45, tpw: 2.9 - d, pf: 2.9 - 2 * d, net: pm2 * 4, pm: pm2, dd: -1800, p10: 52.2 - 10 * d, f10: 5.8, wk2: 80 },
    y: { n: 600, tpw: 2.3, pf: 1.01 - d / 5, net: 1211, pm: 20 - Math.round(200 * d), dd: -19436, lit_p10: 9.1, lit_f10: 11 }, f2: 1 - d };
    return k;
  };
  const lk = put(liveV);
  genomes[lk].h1 = { n: 80, tpw: 3.12, pf: 4.98, net: 33901, pm: 5562, dd: -2196, p10: 57.1, f10: 1.7, wk2: 85 };
  genomes[lk].h2 = { n: 47, tpw: 3.0, pf: 2.91, net: 9919, pm: 2670, dd: -1700, p10: 52.2, f10: 5.8, wk2: 80 };
  genomes[lk].xy = [-0.2, -0.2];
  const fitOf = (k) => { const g = genomes[k].h1; return 0.5 * g.pm / 5562 + 0.5 * (g.p10 - g.f10) / 55.4; };
  const gens = [];
  let id = 0, pop = [];
  pop.push({ id: id++, k: lk, o: 'L', p: [], mu: [] });
  for (let i = 1; i < 24; i++) {
    const v = liveV.map((x, j) => Math.max(0, Math.min(knobs[j].n - 1, x + (R() < 0.4 ? Math.round((R() - 0.5) * 6) : 0))));
    pop.push({ id: id++, k: put(v), o: i < 12 ? 'S' : 'R', p: [], mu: [] });
  }
  for (let g = 0; g < 20; g++) {
    pop.forEach((c) => { c.f = Math.round(fitOf(c.k) * 1e4) / 1e4; });
    pop.sort((a, b) => b.f - a.f || a.id - b.id);
    gens.push(pop);
    if (g === 19) break;
    const nxt = pop.slice(0, 2).map((c) => ({ id: id++, k: c.k, o: 'E', p: [c.id], mu: [] }));
    while (nxt.length < 24) {
      const a = pop[Math.floor(R() * 8)], b = pop[Math.floor(R() * 12)];
      const va = genomes[a.k].v, vb = genomes[b.k].v, mu = [];
      const v = va.map((x, j) => { let y = R() < 0.5 ? x : vb[j]; if (R() < 0.12) { y = Math.max(0, Math.min(knobs[j].n - 1, y + (R() < 0.5 ? -1 : 1))); mu.push(j); } return y; });
      nxt.push({ id: id++, k: put(v), o: 'C', p: a.id === b.id ? [a.id] : [a.id, b.id], mu });
    }
    pop = nxt;
  }
  const all = gens.flat();
  const champ = all.reduce((a, c) => (c.f > a.f || (c.f === a.f && c.id < a.id) ? c : a));
  const byId = new Map(all.map((c) => [c.id, c]));
  const line = []; let cur = champ;
  while (cur) { line.push(cur.id); cur = cur.p.length ? cur.p.map((p) => byId.get(p)).reduce((a, b) => (b.f > a.f ? b : a)) : null; }
  const ch = genomes[champ.k], lv = genomes[lk];
  const d1 = ch.h1.pm - lv.h1.pm, d2 = ch.h2.pm - lv.h2.pm;
  return {
    v: 1, app: 'prometheus', built: 'demo', demo: true, seed, pop: 24, gens_n: 20, knobs, live: { k: lk, fit: 1 },
    fitness: '0.5 x $/mo / live $/mo + 0.5 x (p10 - f10) / live (p10 - f10) - trade-frequency penalties',
    genomes, gens, champion: { id: champ.id, k: champ.k, gen: gens.findIndex((G) => G.includes(champ)), fit: champ.f, line, ancestors: line, diff: {} },
    verdict: { h1_gain_pm: d1, h2_gain_pm: d2, survive_pct: d1 > 0 ? Math.round(1000 * d2 / d1) / 10 : null, h2_speed_live: 46.4,
      h2_speed_champ: ch.h2.p10 - ch.h2.f10, boot: { pm: d2, lo5: d2 - 900, hi95: d2 + 900, p_le0: 0.5 }, real_margin: false, y_gain_pm: ch.y.pm - lv.y.pm },
    honesty: { spearman_h1_h2_fit: 0.1, genomes_checked: Object.keys(genomes).length, beat_live_h1: 0, beat_live_h2: 0, beat_live_both: 0 },
    seeds: [{ seed, fit: champ.f, diff: {}, h1_pm: ch.h1.pm, h2_pm: ch.h2.pm, h2_p10: ch.h2.p10, h2_f10: ch.h2.f10, y_pm: ch.y.pm, real: false }],
    proposal: false,
  };
}

// ------------------------------------------------------------------------------------------------ the model
function spreadMap(genomes) {
  const keys = Object.keys(genomes), out = new Map();
  const axis = (j) => {
    const v = keys.map((k) => (genomes[k].xy || [0, 0])[j]);
    const lo = Math.min(...v), hi = Math.max(...v), order = keys.map((_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
    const rank = new Array(keys.length);
    order.forEach((i, r) => { rank[i] = keys.length > 1 ? r / (keys.length - 1) : 0.5; });
    return keys.map((_, i) => 0.62 * (rank[i] * 2 - 1) + 0.38 * (hi > lo ? ((v[i] - lo) / (hi - lo)) * 2 - 1 : 0));
  };
  const X = axis(0), Y = axis(1);
  keys.forEach((k, i) => {                      // squeeze the square into the round arena
    const x = X[i], y = Y[i], r = Math.hypot(x, y), m = Math.max(Math.abs(x), Math.abs(y));
    const f = r > 1e-9 ? m / r : 0;
    out.set(k, [x * f * 0.84, y * f * 0.84]);
  });
  return out;
}


const spd = (x) => (x.p10 == null || x.f10 == null ? 0 : x.p10 - x.f10);
export function halfPass(G, L) {
  const one = (a, b) => ({ pm: a.pm > b.pm, speed: spd(a) >= spd(b) - 0.05, freq: a.tpw >= 2 });
  const h1 = one(G.h1, L.h1), h2 = one(G.h2, L.h2);
  return { h1: h1.pm && h1.speed && h1.freq, h2: h2.pm && h2.speed && h2.freq, d1: h1, d2: h2 };
}

/** The answer to "would this change live?": YES only when the 2026 H2 check beats live by a real margin (+10% $/mo) with
 *  eval speed not worse and 2+ trades a week (the LIT rule: pick on H1, check on H2; 2021-25 is a reference line, never a gate)
 *  and, for the run's champion, the weekly-block bootstrap agrees. Returns { level: 'yes'|'maybe'|'no', title, why: [..] }. */
export function wouldChange(G, L, isChamp, d) {
  const why = [], dm2 = G.h2.pm - L.h2.pm, dm1 = G.h1.pm - L.h1.pm, margin = L.h2.pm ? dm2 / L.h2.pm : 0;
  const p = halfPass(G, L), boot = isChamp && d && d.verdict && d.verdict.boot;
  if (G === L) return { level: 'no', title: 'It is live', why: ['This is the live strategy: nothing to change.'], margin: 0 };
  why.push(`${dm1 >= 0 ? 'Better' : 'Worse'} than live on H1 by ${Math.abs(Math.round(dm1)).toLocaleString('en-US')} $/mo.`);
  why.push(`${dm2 >= 0 ? 'Better' : 'Worse'} than live on the H2 check by ${Math.abs(Math.round(dm2)).toLocaleString('en-US')} $/mo (${(margin * 100).toFixed(0)}%).`);
  if (!p.d2.speed) why.push('The eval gets slower on H2.');
  if (!p.d2.freq) why.push('Under 2 trades a week on H2.');
  if (G.y && L.y && G.y.pm < L.y.pm - 50) why.push('Worse on 2021-25 (a reference line, not a gate).');
  if (boot) why.push(boot.p_le0 > 0.05 ? `The bootstrap says ${(boot.p_le0 * 100).toFixed(0)}% odds the H2 gain is zero or less: too noisy.` : 'The bootstrap agrees the H2 gain is real.');
  const solid = p.d2.pm && margin >= 0.1 && p.d2.speed && p.d2.freq && (!boot || boot.p_le0 <= 0.05);
  if (solid && p.h1) return { level: 'yes', title: 'Yes, take it to the owner', why, margin };
  if (p.d2.pm && p.d2.speed && p.d2.freq) return { level: 'maybe', title: 'Not yet: too close to call', why, margin };
  return { level: 'no', title: 'No, live stays', why, margin };
}

export class Forge {
  constructor(data) {
    this.d = data;
    this.byId = new Map();
    data.gens.forEach((G, g) => G.forEach((c) => { this.byId.set(c.id, { ...c, gen: g }); }));
    this.knobs = data.knobs;
    this.live = data.genomes[data.live.k];
    this.lineSet = new Set(data.champion.line);
    this.spread = spreadMap(data.genomes);
  }

  /** arena point of a genome in -1..1: its map point (PCA), spread by rank so a converged population stays tappable */
  point(k) { return this.spread.get(k) || [0, 0]; }

  get demo() { return !!this.d.demo; }
  get nGens() { return this.d.gens.length; }
  gen(g) { return this.d.gens[Math.max(0, Math.min(this.nGens - 1, g))]; }
  best(g) { return this.gen(g)[0]; }
  creature(id) { return this.byId.get(id); }
  genome(k) { return this.d.genomes[k]; }

  /** fitness range over the whole run (for brightness) */
  fitRange() {
    if (!this._fr) {
      const f = this.d.gens.flat().map((c) => c.f);
      this._fr = [Math.min(...f), Math.max(...f)];
    }
    return this._fr;
  }

  /** 0..1 brightness of a fitness value: live (1.0) sits at ~0.55 */
  heat(f) {
    const [lo, hi] = this.fitRange();
    if (f >= 1) return 0.55 + 0.45 * Math.min(1, (f - 1) / Math.max(1e-6, hi - 1));
    return 0.55 * Math.max(0, (f - lo) / Math.max(1e-6, 1 - lo));
  }

  /** the champion's lineage nodes made up to generation g, oldest first */
  lineageUpTo(g) {
    return this.d.champion.line.map((id) => this.byId.get(id)).filter((c) => c && c.gen <= g).sort((a, b) => a.gen - b.gen);
  }

  /** knob rows of a genome against live: [{knob, live, val, changed}] */
  diffRows(k) {
    const v = this.genome(k).v, lv = this.live.v;
    return this.knobs.map((kn, i) => ({ knob: kn, live: kn.lo + lv[i] * kn.step, val: kn.lo + v[i] * kn.step, changed: v[i] !== lv[i] }))
      .map((r) => ({ ...r, live: r.knob.unit === 'min' || Number.isInteger(r.knob.step) ? Math.round(r.live) : Math.round(r.live * 1000) / 1000,
        val: r.knob.unit === 'min' || Number.isInteger(r.knob.step) ? Math.round(r.val) : Math.round(r.val * 1000) / 1000 }));
  }

  /** every ancestor of a creature (both parents, back to generation 1), the creature included */
  ancestry(id) {
    const out = new Set(), todo = [id];
    while (todo.length) {
      const c = this.byId.get(todo.pop());
      if (!c || out.has(c.id)) continue;
      out.add(c.id);
      for (const p of c.p) todo.push(p);
    }
    return out;
  }

  /** parent -> child edges among a set of creature ids (the lineage graph) */
  edges(ids) {
    const out = [];
    for (const id of ids) { const c = this.byId.get(id); if (c) for (const p of c.p) if (ids.has(p)) out.push([p, id]); }
    return out;
  }

  /** rank of a creature in its generation (0 = fittest): the lineage graph's y */
  rank(id) {
    const c = this.byId.get(id);
    return c ? this.gen(c.gen).findIndex((x) => x.id === id) : -1;
  }

  /** the Hall of Champions: the n fittest distinct genomes of the whole run (H1 fitness), each with its first creature and
   *  its H2 / 2021-25 checks against live; live itself rides along as the reference row */
  hall(n = 8) {
    const first = new Map();                           // genome -> its fittest creature (the earliest on a tie)
    for (const G of this.d.gens) for (const c of G) { const b = first.get(c.k); if (!b || c.f > b.f) first.set(c.k, this.byId.get(c.id)); }
    const L = this.live;
    return [...first.values()].filter((c) => c.k !== this.d.live.k).sort((a, b) => b.f - a.f || a.id - b.id).slice(0, n).map((c, i) => {
      const G = this.genome(c.k);
      return { rank: i + 1, id: c.id, gen: c.gen, k: c.k, fit: c.f, h1: G.h1.pm, h2: G.h2.pm, y: G.y.pm, h2Beats: G.h2.pm > L.h2.pm,
        changed: this.diffRows(c.k).filter((r) => r.changed).length, champ: c.id === this.d.champion.id };
    });
  }

  /** half-year pass / fail of a genome against live. "Pass" = more $/month than live in that half AND eval speed
   *  (p10 - f10) not worse AND 2+ trades a week. Pure numbers from forge.json. */
  halfPass(k) { return halfPass(this.genome(k), this.live); }

  /** "would this change live?" for a creature (the forge never changes anything: this only answers the question) */
  wouldChange(id) {
    const c = id === 'live' ? null : this.byId.get(id);
    return wouldChange(this.genome(id === 'live' ? this.d.live.k : c.k), this.live, !!c && c.id === this.d.champion.id, this.d);
  }

  /** which creatures of generation g match a filter ('all' | 'h1' | 'h2' | 'both' | 'fail2') */
  matches(c, filter) {
    if (!filter || filter === 'all') return true;
    const p = this.halfPass(c.k);
    return filter === 'h1' ? p.h1 : filter === 'h2' ? p.h2 : filter === 'both' ? p.h1 && p.h2 : !p.h2;
  }

  /** the verdict banner: one honest line, the numbers behind it */
  verdict() {
    const d = this.d, V = d.verdict, H = d.honesty || {}, L = this.live, seeds = d.seeds || [];
    const real = seeds.filter((s) => s.real).length;
    return {
      liveBest: !d.proposal, title: d.proposal ? 'A candidate to review' : 'Live LIT still best',
      h1: V.h1_gain_pm, h2: V.h2_gain_pm, kept: V.survive_pct, liveH2: L.h2.pm, liveH1: L.h1.pm, real, seeds: seeds.length,
      checked: H.genomes_checked, beatBoth: H.beat_live_both_pm, lo5: V.boot && V.boot.lo5, hi95: V.boot && V.boot.hi95,
    };
  }

  /** the HUD numbers of generation g */
  hud(g) {
    const b = this.best(g), G = this.genome(b.k);
    return { gen: g, of: this.nGens, id: b.id, fit: b.f, h1pm: G.h1.pm, h2pm: G.h2.pm, p10: G.h1.p10, f10: G.h1.f10, tpw: G.h1.tpw,
      live: { h1pm: this.live.h1.pm, h2pm: this.live.h2.pm, p10: this.live.h1.p10, f10: this.live.h1.f10, tpw: this.live.h1.tpw } };
  }
}

export async function loadForge(url = 'forge.json', force) {
  if (force === 'demo') return new Forge(demoData());
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d || d.app !== 'prometheus' || !Array.isArray(d.gens) || !d.gens.length || !d.genomes) throw new Error('bad forge.json');
    return new Forge(d);
  } catch (e) {
    return new Forge(demoData());
  }
}
