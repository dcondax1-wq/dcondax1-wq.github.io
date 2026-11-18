// PROMETHEUS plus (2026-11-04): what the forge's own numbers say about itself, and the tools to look at them. Pure functions over a
// Forge (forgecore.js) + the panel on the dock's TOOLS button. Read-only research: nothing here changes a strategy.
//   overfit(F, k)           the overfitting meter of one genome: how much of its H1 (in-sample) $/month is gone on H2 (new data)
//   populationOverfit(F)    the same for the whole run: of the variants that beat live on H1, how many still do on H2
//   breeding(F)             one row per generation: the best fitness, elites kept, children, mutations, new champion-line members
//   verdictHistory(F)       "would this change live?" for the best creature of every generation: yes / maybe / no
//   survivors(F, n)         the creatures that beat live on BOTH halves (the same pass rule as the filter chips), best worst-half first
//   search(F, q)            creatures by id, generation, knob name, origin, 'champion', 'live', 'pass h2' ...
//   compare(F, a, b)        two creatures (or 'live') side by side with the winner of each row and a plain verdict
//   shareLines(F, id)       the lines of the share picture; makeShareImage(F, id) -> Promise<Blob> (1080 x 1350, drawn on a canvas)
//   createPlus({F, open, setGen, toast, getGen}) -> {open(tab), close(), state}
import { FMT } from './forgecore.js';

const GOOD = '#7f8a52', BAD = '#c96a4a', GOLD = '#c8a24a', ICE = '#d9c9a8';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BANDS = [[20, 'Healthy', GOOD, 'Most of the H1 gain is still there on new data.'], [50, 'Warm', GOLD, 'About a third to a half of the H1 gain did not carry over.'],
  [80, 'Overfit', '#c98a4a', 'Most of the H1 gain is gone on new data: it mostly fitted the past.'], [1e9, 'Burnt', BAD, 'The H1 gain is gone or reversed on new data. Do not trust it.']];

/** the meter: shrink = how much of the in-sample (H1) $/month is missing on new data (H2), 0 = none, 100 = all (or worse). Against live, not zero. */
export function overfit(F, k) {
  const G = F.genome(k), L = F.live, g1 = G.h1.pm - L.h1.pm, g2 = G.h2.pm - L.h2.pm;
  const gain = g1 > 0 ? Math.max(0, Math.min(150, Math.round((100 * (g1 - g2)) / g1))) : (g2 >= 0 ? 0 : 100);
  const band = BANDS.find((b) => gain < b[0]);
  return { k, h1: G.h1.pm, h2: G.h2.pm, y: G.y.pm, liveH1: L.h1.pm, liveH2: L.h2.pm, gainH1: g1, gainH2: g2, lost: gain, meter: Math.min(100, gain), label: g1 <= 0 ? 'No gain' : band[1], colour: g1 <= 0 ? ICE : band[2],
    words: g1 <= 0 ? 'It does not beat live on H1, so there is nothing to overfit.' : band[3], isLive: k === F.d.live.k };
}

export function populationOverfit(F) {
  const keys = Object.keys(F.d.genomes).filter((k) => k !== F.d.live.k), L = F.live;
  const h1 = keys.filter((k) => F.genome(k).h1.pm > L.h1.pm), both = h1.filter((k) => F.genome(k).h2.pm > L.h2.pm);
  const H = F.d.honesty || {}, loss = h1.map((k) => overfit(F, k).lost).sort((a, b) => a - b);
  return { variants: keys.length, beatH1: h1.length, beatBoth: both.length, keptPct: h1.length ? Math.round((1000 * both.length) / h1.length) / 10 : 0,
    medianLost: loss.length ? loss[Math.floor(loss.length / 2)] : 0, spearman: H.spearman_h1_h2_pm ?? H.spearman_h1_h2_fit ?? null,
    words: h1.length ? `${h1.length} variants beat live on H1 (the pick). ${both.length} of them still beat it on the H2 check: ${h1.length ? Math.round((100 * both.length) / h1.length) : 0}%. The rest were luck on the pick data.` : 'No variant beats live on H1 in this run.' };
}

export function breeding(F) {
  const champ = new Set(F.d.champion.line);
  let seen = new Set(), best = -1e9;
  return F.d.gens.map((G, g) => {
    const origin = (o) => G.filter((c) => c.o === o).length, line = G.filter((c) => champ.has(c.id)).length;
    const row = { gen: g, best: G[0].f, bestId: G[0].id, size: G.length, elites: origin('E'), children: origin('C'), random: origin('R'), sparks: origin('S'), live: origin('L'),
      mutations: G.reduce((a, c) => a + (c.mu ? c.mu.length : 0), 0), line, newBest: G[0].f > best + 1e-9, newGenomes: G.filter((c) => !seen.has(c.k)).length };
    best = Math.max(best, G[0].f); G.forEach((c) => seen.add(c.k));
    return row;
  });
}

export function verdictHistory(F) {
  const rows = F.d.gens.map((G, g) => { const c = G[0], w = F.wouldChange(c.id), p = F.halfPass(c.k); return { gen: g, id: c.id, level: w.level, title: w.title, h1: p.h1, h2: p.h2, fit: c.f, gain2: w.margin }; });
  const n = (l) => rows.filter((r) => r.level === l).length;
  return { rows, yes: n('yes'), maybe: n('maybe'), no: n('no'), firstNonNo: rows.find((r) => r.level !== 'no') || null };
}

export function survivors(F, n = 10) {
  const L = F.live, seen = new Set(), out = [];
  for (const G of F.d.gens) for (const c of G) {
    if (seen.has(c.k) || c.k === F.d.live.k) continue;
    seen.add(c.k);
    const p = F.halfPass(c.k);
    if (!(p.h1 && p.h2)) continue;
    const g = F.genome(c.k), m1 = g.h1.pm - L.h1.pm, m2 = g.h2.pm - L.h2.pm;
    out.push({ id: c.id, gen: c.gen, k: c.k, fit: c.f, h1: g.h1.pm, h2: g.h2.pm, y: g.y.pm, worst: Math.min(m1, m2), m1, m2 });
  }
  return out.sort((a, b) => b.worst - a.worst || a.id - b.id).slice(0, n).map((r, i) => ({ ...r, rank: i + 1 }));
}

const ORIGIN_WORDS = { L: ['live'], S: ['spark', 'mutant'], R: ['random'], E: ['elite', 'survivor'], C: ['child', 'bred'] };
/** a free-text search over every creature: '#295' / '295', 'gen 12', 'champion', 'live', a knob key or word ('be_r', 'target'), an origin ('child', 'elite'), 'pass h2', 'fail h2' */
export function search(F, query, limit = 25) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const all = new Map();
  for (const G of F.d.gens) for (const c of G) { const b = all.get(c.id); if (!b) all.set(c.id, { ...c, gen: F.creature(c.id).gen }); }
  const hits = [];
  const num = /^#?(\d+)$/.exec(q), gen = /^gen(?:eration)?\s*(\d+)$/.exec(q);
  const toks = q.split(/\s+/).filter(Boolean);
  for (const c of all.values()) {
    let score = 0, why = '';
    if (num && c.id === +num[1]) { score = 1000; why = 'this id'; }
    else if (gen) { if (c.gen + 1 === +gen[1]) { score = 100 + c.f; why = `generation ${gen[1]}`; } }
    else {
      const p = F.halfPass(c.k), rows = F.diffRows(c.k).filter((r) => r.changed), tags = [];
      if (c.id === F.d.champion.id) tags.push('champion');
      if (F.d.champion.line.includes(c.id)) tags.push('lineage', 'ancestor');
      tags.push(...(ORIGIN_WORDS[c.o] || []));
      if (p.h2) tags.push('pass h2'); else tags.push('fail h2');
      if (p.h1) tags.push('pass h1'); else tags.push('fail h1');
      if (p.h1 && p.h2) tags.push('both', 'survivor');
      const hay = [...tags, ...rows.map((r) => r.knob.key + ' ' + r.knob.label.toLowerCase())].join(' | ');
      const hit = hay.includes(q) || (!/\b(pass|fail)\b/.test(q) && toks.every((t) => hay.includes(t)));       // 'pass h2' is a phrase: it must not match 'pass h1' or 'fail h2'
      if (hit) { score = 10 + c.f; why = tags.filter((t) => toks.some((x) => t.includes(x))).slice(0, 2).join(', ') || rows.filter((r) => toks.some((x) => r.knob.key.includes(x))).map((r) => r.knob.key).slice(0, 2).join(', ') || 'match'; }
    }
    if (score) hits.push({ id: c.id, gen: c.gen, f: c.f, k: c.k, why, score });
  }
  if (/^live$/.test(q) || toks.includes('live')) hits.unshift({ id: 'live', gen: 0, f: 1, k: F.d.live.k, why: 'the reference', score: 2000 });
  return hits.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, limit);
}

const ROWS = [
  ['2026 H1 $ / month (the pick)', (G) => G.h1.pm, (x) => FMT.usd(x), 1], ['2026 H2 $ / month (new data)', (G) => G.h2.pm, (x) => FMT.usd(x), 1], ['2021-25 $ / month (reference)', (G) => G.y.pm, (x) => FMT.usd(x), 1],
  ['H1 profit factor', (G) => G.h1.pf, (x) => FMT.num(x), 1], ['H2 profit factor', (G) => G.h2.pf, (x) => FMT.num(x), 1], ['H2 trades a week', (G) => G.h2.tpw, (x) => FMT.num(x), 1],
  ['H2 eval pass / fail in 10', (G) => G.h2.p10 - G.h2.f10, (x, G) => `${FMT.num(G.h2.p10, 1)} / ${FMT.num(G.h2.f10, 1)}`, 1], ['H2 worst drawdown', (G) => G.h2.dd, (x) => FMT.usd(x), 1],
];

export function compare(F, a, b) {
  const get = (id) => { const live = id === 'live'; const c = live ? null : F.creature(id); const k = live ? F.d.live.k : c && c.k; return k ? { id, k, G: F.genome(k), f: live ? 1 : c.f, gen: live ? null : c.gen } : null; };
  const A = get(a), B = get(b);
  if (!A || !B) return null;
  const rows = ROWS.map(([label, f, show, hi]) => { const x = f(A.G), y = f(B.G); return { label, a: show(x, A.G), b: show(y, B.G), win: x == null || y == null || x === y ? '' : (x > y) === (hi > 0) ? 'a' : 'b' }; });
  rows.unshift({ label: 'Fitness (H1 only)', a: FMT.num(A.f, 3), b: FMT.num(B.f, 3), win: A.f === B.f ? '' : A.f > B.f ? 'a' : 'b' });
  const aw = rows.filter((r) => r.win === 'a').length, bw = rows.filter((r) => r.win === 'b').length;
  const name = (x) => (x.id === 'live' ? 'Live LIT' : `#${x.id}`);
  const dk = F.diffRows(A.k).map((r, i) => ({ knob: r.knob, a: r.val, b: F.diffRows(B.k)[i].val })).filter((r) => r.a !== r.b);
  const o = { a: overfit(F, A.k), b: overfit(F, B.k) };
  const h2win = A.G.h2.pm === B.G.h2.pm ? '' : A.G.h2.pm > B.G.h2.pm ? 'a' : 'b';
  const text = aw === bw ? 'A tie on the rows.' : `${name(aw > bw ? A : B)} wins ${Math.max(aw, bw)} of ${rows.length} rows.`;
  return { A, B, rows, aWins: aw, bWins: bw, knobs: dk, overfit: o, h2Winner: h2win, text: `${text} ${h2win ? `On the H2 check, which the forge never saw, ${name(h2win === 'a' ? A : B)} is ahead by ${FMT.usd(Math.abs(A.G.h2.pm - B.G.h2.pm))} a month.` : ''}` };
}

export function shareLines(F, id) {
  const live = id === 'live', c = live ? null : F.creature(id), k = live ? F.d.live.k : c.k, G = F.genome(k), o = overfit(F, k), w = live ? null : F.wouldChange(id);
  const champ = !live && id === F.d.champion.id;
  return { title: live ? 'Live LIT' : `${champ ? 'Champion ' : 'Creature '}#${id}`, sub: live ? 'the strategy trading today' : `generation ${c.gen + 1} of ${F.nGens} · fitness ${FMT.num(c.f, 3)} (live 1.000)`,
    verdict: live ? 'The reference' : w.title, level: live ? 'no' : w.level, bars: [['H1 (pick)', G.h1.pm, F.live.h1.pm], ['H2 (new)', G.h2.pm, F.live.h2.pm], ['2021-25', G.y.pm, F.live.y.pm]],
    meter: o, demo: F.demo, foot: 'Prometheus · the forge · paper research, not advice' + (F.demo ? ' · demo data' : '') };
}

export async function makeShareImage(F, id) {
  const L = shareLines(F, id), W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), mono = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2118'); g.addColorStop(1, '#14110e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const rg = x.createRadialGradient(W / 2, 360, 20, W / 2, 360, 680); rg.addColorStop(0, 'rgba(200,162,74,.18)'); rg.addColorStop(1, 'rgba(200,162,74,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(200,162,74,.5)'; x.lineWidth = 3; x.strokeRect(36, 36, W - 72, H - 72);
  x.fillStyle = GOLD; x.font = `700 40px ${mono}`; x.fillText('The Forge', 84, 120);
  x.fillStyle = 'rgba(243,236,224,.6)'; x.font = `500 26px ${mono}`; x.fillText('Prometheus: LIT evolution', 84, 160);
  x.fillStyle = '#fff'; x.font = `800 82px ${mono}`; x.fillText(L.title, 84, 290);
  x.fillStyle = 'rgba(243,236,224,.85)'; x.font = `500 30px ${mono}`; x.fillText(L.sub, 84, 342);
  const pc = { yes: GOOD, maybe: GOLD, no: BAD }[L.level] || ICE;
  x.fillStyle = pc; x.globalAlpha = 0.16; x.fillRect(84, 380, 912, 80); x.globalAlpha = 1; x.strokeStyle = pc; x.lineWidth = 2; x.strokeRect(84, 380, 912, 80);
  x.fillStyle = pc; x.font = `800 36px ${mono}`; x.fillText('Would this change live? ' + L.verdict, 108, 432);
  const hi = Math.max(500, ...L.bars.flatMap(([, v, l]) => [Math.abs(v), Math.abs(l)])), base = 880;
  x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(84, base); x.lineTo(W - 84, base); x.stroke();
  L.bars.forEach(([name, v, live], i) => {
    const bx = 110 + i * 300, bar = (val, dx, col) => { const h = Math.max(6, (Math.abs(val) / hi) * 280), up = val >= 0; x.fillStyle = col; x.fillRect(bx + dx, up ? base - h : base, 90, h); return up ? base - h : base + h; };
    const ty = bar(v, 0, v >= live ? GOOD : BAD); bar(live, 100, ICE);
    x.fillStyle = '#fff'; x.font = `800 34px ${mono}`; x.textAlign = 'center'; x.fillText(FMT.usd(v), bx + 45, Math.min(ty, base) - 16);
    x.fillStyle = ICE; x.font = `600 24px ${mono}`; x.fillText(FMT.usd(live), bx + 145, base + 54);
    x.fillStyle = 'rgba(243,236,224,.7)'; x.font = `600 28px ${mono}`; x.fillText(name, bx + 95, base + 100); x.textAlign = 'left';
  });
  x.fillStyle = 'rgba(243,236,224,.6)'; x.font = `500 24px ${mono}`; x.fillText('$ a month · gold = this creature · ivory = live LIT', 84, 1010);
  // the overfitting meter
  const m = L.meter;
  x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(84, 1064, 912, 26);
  const mg = x.createLinearGradient(84, 0, 996, 0); mg.addColorStop(0, GOOD); mg.addColorStop(0.5, GOLD); mg.addColorStop(1, BAD); x.fillStyle = mg; x.fillRect(84, 1064, 912 * (m.meter / 100), 26);
  x.fillStyle = m.colour; x.font = `800 36px ${mono}`; x.fillText(`Overfitting: ${m.label} (${m.lost}% of the H1 gain lost)`, 84, 1146);
  x.fillStyle = '#e8dccb'; x.font = `500 28px ${mono}`;
  const words = m.words.split(' '); let line = '', y = 1196;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 168 && line) { x.fillText(line, 84, y); line = w; y += 40; } else line = t; }
  x.fillText(line, 84, y);
  x.fillStyle = 'rgba(243,236,224,.45)'; x.font = `500 24px ${mono}`; x.fillText(L.foot, 84, H - 72);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}

// ------------------------------------------------------------------------------------------------ the panel
const $ = (id) => document.getElementById(id);
const TABS = [['meter', 'Meter'], ['breed', 'Breeding'], ['verdicts', 'Verdicts'], ['survivors', 'Survivors'], ['compare', 'Compare'], ['search', 'Search']];

export function createPlus({ F, open, setGen, toast, getGen }) {
  const U = { tab: 'meter', a: null, b: null, q: '', sel: null };
  try { const s = JSON.parse(localStorage.getItem('forge.compare') || 'null'); if (s) { U.a = s.a === 'live' || F.creature(s.a) ? s.a : null; U.b = s.b === 'live' || F.creature(s.b) ? s.b : null; } } catch (_) { /* not kept */ }
  const keep = () => { try { localStorage.setItem('forge.compare', JSON.stringify({ a: U.a, b: U.b })); } catch (_) { /* private mode */ } };
  const root = $('plus'), body = $('plus-b');
  const name = (id) => (id === 'live' ? 'Live LIT' : `#${id}`);
  const meterBar = (m) => `<div class="meter" role="img" aria-label="Overfitting meter: ${m.meter} out of 100, ${m.label}"><i style="width:${100 - Math.max(2, m.meter)}%"></i><b style="left:${Math.max(2, Math.min(98, m.meter))}%"></b></div><div class="meterl"><span>0 · carries over</span><span>100 · all gone</span></div>`;

  function paintMeter() {
    const id = U.sel ?? F.d.champion.id, c = id === 'live' ? null : F.creature(id), k = id === 'live' ? F.d.live.k : c.k, m = overfit(F, k), P = populationOverfit(F);
    return `<p class="who">${id === 'live' ? 'Live LIT' : (id === F.d.champion.id ? 'Champion ' : 'Creature ') + '#' + id}<small> ${c ? 'gen ' + (c.gen + 1) : ''}</small></p>
      <div class="dial" style="--c:${m.colour}"><b>${m.meter}</b><span>${esc(m.label)}</span></div>${meterBar(m)}
      <p class="words">${esc(m.words)}</p>
      <table class="kv" aria-label="In sample against new data"><tbody><tr><td>H1: the data the forge trained on</td><td>${esc(FMT.usd(m.h1))}/mo</td></tr><tr><td>H2: new data, never seen</td><td class="${m.h2 > m.liveH2 ? 'up' : 'down'}">${esc(FMT.usd(m.h2))}/mo</td></tr>
      <tr><td>Gain over live on H1 → on H2</td><td>${esc(FMT.dUsd(m.gainH1))} → <b class="${m.gainH2 > 0 ? 'up' : 'down'}">${esc(FMT.dUsd(m.gainH2))}</b></td></tr><tr><td>Share of the H1 gain lost</td><td>${m.lost}%</td></tr></tbody></table>
      <h3>The whole run</h3><p class="words">${esc(P.words)}</p>
      <table class="kv"><tbody><tr><td>Variants bred</td><td>${P.variants}</td></tr><tr><td>Beat live on H1 / on both halves</td><td>${P.beatH1} / <b>${P.beatBoth}</b></td></tr><tr><td>Median share of the H1 gain lost</td><td>${P.medianLost}%</td></tr>
      <tr><td>Does H1 rank predict H2? (Spearman)</td><td>${P.spearman == null ? '-' : esc(String(P.spearman))}</td></tr></tbody></table>
      <p class="note">0 would mean H1 predicts H2 perfectly. A forge that picks on H1 always looks better on H1 than on new data: the question is how much. Numbers come from forge.json.</p>
      <div class="acts"><button type="button" data-share="${esc(String(id))}">Share card</button>${id !== F.d.champion.id ? '<button type="button" data-sel="champ">Champion</button>' : ''}</div>`;
  }

  function paintBreed() {
    const rows = breeding(F), cur = getGen(), hi = Math.max(...rows.map((r) => r.best)), lo = Math.min(...rows.map((r) => r.best));
    return `<p class="words">Tap a generation to see it in the fire. The best fitness only goes up when a better child is born; elites are copied as they are, children come from two parents, a few knobs mutate.</p>
      <ol class="gens">${rows.map((r) => `<li><button type="button" data-gen="${r.gen}" aria-current="${r.gen === cur}"><span class="n">${r.gen + 1}</span><span class="bar"><i style="width:${Math.max(4, 100 * (r.best - lo) / Math.max(1e-6, hi - lo))}%"></i></span><span class="f">${FMT.num(r.best, 3)}${r.newBest ? ' ▲' : ''}</span>
        <small>${r.elites} elite · ${r.children} bred · ${r.mutations} mutations${r.line ? ` · ${r.line} in the champion's line` : ''}</small></button></li>`).join('')}</ol>`;
  }

  function paintVerdicts() {
    const V = verdictHistory(F), CLS = { yes: 'ok', maybe: 'mid', no: 'bad' };
    return `<p class="words">For the best creature of each generation: would it change live? ${V.firstNonNo ? `The first "not no" came in generation ${V.firstNonNo.gen + 1}.` : 'Every generation says no: live stays.'}</p>
      <div class="vgrid" role="img" aria-label="Verdict of each generation's best creature">${V.rows.map((r) => `<button type="button" class="${CLS[r.level]}" data-gen="${r.gen}" title="gen ${r.gen + 1}: ${esc(r.title)}"><i></i><span>${r.gen + 1}</span></button>`).join('')}</div>
      <p class="count"><b class="ok">${V.yes}</b> yes · <b class="mid">${V.maybe}</b> too close · <b class="bad">${V.no}</b> no</p>
      <ul class="vlist">${V.rows.slice().reverse().map((r) => `<li class="${CLS[r.level]}"><button type="button" data-open="${r.id}"><b>gen ${r.gen + 1}</b><span>#${r.id} · ${esc(r.title)}</span><small>H1 ${r.h1 ? '✓' : '✗'} · H2 ${r.h2 ? '✓' : '✗'}</small></button></li>`).join('')}</ul>
      <p class="note">YES needs the H2 check to beat live by a real margin (+10% $/mo), eval speed not worse, 2+ trades a week. Only the owner changes live.</p>`;
  }

  function paintSurvivors() {
    const S = survivors(F, 12);
    return S.length ? `<p class="words">Creatures that beat live on BOTH halves (more $/month, eval speed not worse, 2+ trades a week), ranked by their worst half.</p>
      <ol class="surv">${S.map((s) => `<li><button type="button" data-open="${s.id}"><span class="rk">${s.rank}</span><span class="nm">#${s.id}<small> gen ${s.gen + 1}</small></span><span class="mo"><b class="up">${esc(FMT.dUsd(s.m2))}</b><small>on H2 vs live</small></span><span class="mo"><b>${esc(FMT.dUsd(s.m1))}</b><small>on H1</small></span></button>
        <div class="acts2"><button type="button" data-cmp="a" data-id="${s.id}" aria-pressed="${U.a === s.id}">A</button><button type="button" data-cmp="b" data-id="${s.id}" aria-pressed="${U.b === s.id}">B</button></div></li>`).join('')}</ol>`
      : '<p class="empty">No creature beats live on both halves. That is an honest result: live stays.</p>';
  }

  function paintCompare() {
    const slot = (id, k) => `<div class="slot ${id == null ? 'empty' : ''}"><small>${k.toUpperCase()}</small>${id == null ? '<span>pick in SURVIVORS or SEARCH</span>' : `<b>${esc(name(id))}</b><button type="button" data-clear="${k}" aria-label="Clear ${k}">×</button>`}</div>`;
    const quick = `<div class="acts"><button type="button" data-cmp="a" data-id="champ">A = CHAMPION</button><button type="button" data-cmp="b" data-id="live">B = LIVE</button></div>`;
    const c = U.a != null && U.b != null ? compare(F, U.a, U.b) : null;
    if (!c) return `<div class="slots">${slot(U.a, 'a')}${slot(U.b, 'b')}</div>${quick}<p class="empty">Choose two creatures (or live) to put side by side.</p>`;
    return `<div class="slots">${slot(U.a, 'a')}${slot(U.b, 'b')}</div>${quick}<p class="verdict-line" id="cmpv">${esc(c.text)}</p>
      <table class="cmp" aria-label="A against B"><thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody>${c.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="${r.win === 'a' ? 'w' : ''}">${esc(r.a)}</td><td class="${r.win === 'b' ? 'w' : ''}">${esc(r.b)}</td></tr>`).join('')}
      <tr><td>Overfitting</td><td style="color:${c.overfit.a.colour}">${esc(c.overfit.a.label)} ${c.overfit.a.meter}</td><td style="color:${c.overfit.b.colour}">${esc(c.overfit.b.label)} ${c.overfit.b.meter}</td></tr></tbody></table>
      ${c.knobs.length ? `<h3>Knobs that differ</h3><table class="cmp"><tbody>${c.knobs.map((r) => `<tr><td>${esc(r.knob.label)}</td><td>${esc(FMT.knob(r.knob, r.a))}</td><td>${esc(FMT.knob(r.knob, r.b))}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Same knobs.</p>'}`;
  }

  function paintSearch() {
    const hits = search(F, U.q);
    return `<label class="vh" for="fq">Search creatures</label><input id="fq" type="search" placeholder="#295 · gen 12 · champion · be_r · child · pass h2" value="${esc(U.q)}" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <div class="chips2">${['champion', 'live', 'elite', 'survivor', 'pass h2', 'fail h2', 'be_r', 'max_rr'].map((t) => `<button type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <p class="count" id="fqn">${U.q ? hits.length + ' found' + (hits.length >= 25 ? ' (the first 25)' : '') : 'Type an id, a generation, a knob or an origin.'}</p>
      <ul class="vlist" id="fqr">${hits.map((h) => `<li><button type="button" data-open="${h.id}"><b>${esc(name(h.id))}</b><span>${h.id === 'live' ? 'the reference' : 'gen ' + (h.gen + 1) + ' · fitness ' + FMT.num(h.f, 3)}</span><small>${esc(h.why)}</small></button>
        <div class="acts2"><button type="button" data-cmp="a" data-id="${h.id}">A</button><button type="button" data-cmp="b" data-id="${h.id}">B</button></div></li>`).join('')}</ul>`;
  }

  function paint() {
    body.innerHTML = ({ meter: paintMeter, breed: paintBreed, verdicts: paintVerdicts, survivors: paintSurvivors, compare: paintCompare, search: paintSearch })[U.tab]();
    root.querySelectorAll('[data-ptab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ptab === U.tab)));
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.ptab) { U.tab = t.dataset.ptab; paint(); body.scrollTop = 0; return; }
    if (t.dataset.gen !== undefined) { setGen(+t.dataset.gen); if (U.tab === 'breed') paint(); return; }
    if (t.dataset.open) { const id = t.dataset.open === 'live' ? 'live' : +t.dataset.open; U.sel = id; open(id); return; }
    if (t.dataset.q) { U.q = t.dataset.q; paint(); return; }
    if (t.dataset.sel === 'champ') { U.sel = null; paint(); return; }
    if (t.dataset.cmp) {
      const id = t.dataset.id === 'champ' ? F.d.champion.id : t.dataset.id === 'live' ? 'live' : +t.dataset.id, k = t.dataset.cmp;
      U[k] = U[k] === id ? null : id; if (U.a != null && U.a === U.b) U[k === 'a' ? 'b' : 'a'] = null;
      keep(); toast(`${k.toUpperCase()}: ${name(id)}`); if (U.a != null && U.b != null) U.tab = 'compare'; paint(); return;
    }
    if (t.dataset.clear) { U[t.dataset.clear] = null; keep(); paint(); return; }
    if (t.dataset.share) { api.share(t.dataset.share === 'live' ? 'live' : +t.dataset.share); return; }
    if (t.hasAttribute('data-pclose')) api.close();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'fq') return;
    U.q = e.target.value;
    const hits = search(F, U.q);
    $('fqn').textContent = U.q ? hits.length + ' found' : 'Type an id, a generation, a knob or an origin.';
    $('fqr').innerHTML = hits.map((h) => `<li><button type="button" data-open="${h.id}"><b>${esc(name(h.id))}</b><span>${h.id === 'live' ? 'the reference' : 'gen ' + (h.gen + 1) + ' · fitness ' + FMT.num(h.f, 3)}</span><small>${esc(h.why)}</small></button>
      <div class="acts2"><button type="button" data-cmp="a" data-id="${h.id}">A</button><button type="button" data-cmp="b" data-id="${h.id}">B</button></div></li>`).join('');
  });

  const api = {
    get state() { return { tab: U.tab, a: U.a, b: U.b, q: U.q, sel: U.sel }; },
    open(tab, id) { if (tab) U.tab = tab; if (id !== undefined) U.sel = id; root.hidden = false; paint(); },
    close() { root.hidden = true; },
    select(id) { U.sel = id; if (!root.hidden && U.tab === 'meter') paint(); },
    paint,
    async share(id) {
      try {
        const blob = await makeShareImage(F, id), url = URL.createObjectURL(blob), view = $('fshare');
        const img = view.querySelector('img'); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        img.src = url; img.alt = `Share card for ${name(id)}`; view.hidden = false;
        const file = new File([blob], `forge-${id}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'The Forge' }); } catch (_) { /* cancelled: the picture stays */ } }
        toast('Press and hold the picture to save it');
      } catch (_) { toast('Could not make the picture here'); }
    },
  };
  $('fshareX').addEventListener('click', () => { const v = $('fshare'); v.hidden = true; const i = v.querySelector('img'); if (i.src.startsWith('blob:')) URL.revokeObjectURL(i.src); i.removeAttribute('src'); });
  return api;
}
