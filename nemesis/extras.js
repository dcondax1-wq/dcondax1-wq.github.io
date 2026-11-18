// NEMESIS extras (ES module, JOB 10+11, 2026-11-04): the post-mortem, one level deeper. Pure reads of the trades the page already holds.
//   leakTimeline(weeks, fallenAll)      the leak of the week, week by week (a timeline: the top leak and what it cost, a dot per week)
//   replayChart(f, raw)                 a trade-by-trade autopsy replay on a mini chart: the 1-minute path (or, when the site has none, a sketch
//                                       from the trade's own numbers, said so), the sweep, the stop, the entry, the exit; Play / scrub
//   patterns(trades, fallenAll)         the pattern detector: time of day, size and after-a-loss, each with its loss rate and the $ it cost
//   vowStreak(vows)                     the vow tracker: kept weeks in a row, the last 8 weeks as dots
//   obsidianAll(ctx)                    one note for Obsidian: the week, the patterns, the vow streak
// DOM only, text through textContent. Nothing is written anywhere: the Copy button (nemesis.js) only puts text on the clipboard.
import { BUCKETS, bucketOf, leaks, weekText, dayText, usd, isLoss, LEAKS } from './nemcore.js';

const NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

// the site's 1-minute path of a trade row (the same packing Chronos reads: p0 / t0 / s and the dt, o, h, l, c arrays in quarter points)
const numv = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
function closesOf(row) {
  const b = row && row.bars;
  if (!b || typeof b !== 'object') return null;
  const p0 = numv(b.p0), t0 = numv(b.t0), s = numv(b.s) || 60, dt = Array.isArray(b.dt) ? b.dt : [], c = Array.isArray(b.c) ? b.c : [];
  const n = Math.min(dt.length, c.length);
  if (p0 == null || t0 == null || n < 5) return null;
  const t = [], v = [];
  for (let i = 0; i < n; i++) { const tt = t0 + (+dt[i]) * s, px = (p0 + (+c[i])) / 4; if (Number.isFinite(tt) && Number.isFinite(px)) { t.push(tt); v.push(px); } }
  return v.length >= 5 ? { t, v } : null;
}

// ------------------------------------------------------------------ the leak of the week
export function leakTimeline(weeks, all) {
  const box = h('section', 'rec timeline');
  box.append(h('h3', '', 'Leak of the week'));
  const rows = weeks.slice(0, 10).map((w) => {
    const list = all.filter((f) => f.wk === w.wk), rk = leaks(list), top = rk.rank[0];
    return { wk: w.wk, n: list.length, lost: rk.lost, top, plan: rk.plan };
  });
  if (!rows.length) { box.append(h('p', '', 'No weeks yet.')); return box; }
  const ol = h('ol', 'tl'), max = Math.max(1, ...rows.map((r) => (r.top ? r.top.cost : 0)));
  for (const r of rows) {
    const li = h('li', r.top ? (r.top.hard ? 'hard' : 'soft') : 'clean');
    li.dataset.week = r.wk;
    li.append(h('i', 'dot'));
    const body = h('div', 'tlb');
    body.append(h('b', '', weekText(r.wk)), h('span', 'tln', r.top ? `${r.top.name} · ${usd(-r.top.cost)}` : r.n ? `No leak: ${r.n} plan loss${r.n === 1 ? '' : 'es'}` : 'No fallen'));
    if (r.top) { const bar = h('span', 'tlbar'), f = h('i'); f.style.width = `${Math.max(6, Math.round((r.top.cost / max) * 100))}%`; bar.append(f); body.append(bar); }
    li.append(body); ol.append(li);
  }
  box.append(ol);
  // the leak that came back most often
  const count = new Map(); for (const r of rows) if (r.top) count.set(r.top.id, (count.get(r.top.id) || 0) + 1);
  const rep = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  box.append(h('p', 'note', rep && rep[1] > 1 ? `${LEAKS[rep[0]].name} was the biggest leak in ${rep[1]} of the last ${rows.length} weeks. That is the habit to fix.` : 'No leak came back week after week.'));
  return box;
}

// ------------------------------------------------------------------ the replay
function sketch(t) {                                           // no 1-minute path on the site: a path through the trade's own numbers
  const n = 40, entry = t.entryPx != null ? t.entryPx : 100, dir = t.side === 'SHORT' ? -1 : 1, pts = [], risk = t.riskPts || Math.abs(entry - (t.stop != null ? t.stop : entry - dir * 10)) || 10;
  const mae = Math.max(0.2, t.maeR != null ? Math.abs(t.maeR) : 1), mfe = Math.max(0, t.mfeR != null ? t.mfeR : 0.3);
  const exitPx = t.stop != null && t.usd < 0 ? t.stop : entry + dir * risk * (t.r != null ? t.r : 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n, wob = Math.sin(u * 17) * risk * 0.08;
    const up = mfe * Math.sin(Math.min(1, u * 2.2) * Math.PI / 2) * (u < 0.45 ? 1 : 1 - (u - 0.45) * 1.1);
    const down = -mae * Math.pow(Math.max(0, u - 0.35) / 0.65, 1.6);
    pts.push(entry + dir * risk * (u < 0.35 ? up : up + down) + wob);
  }
  pts[n] = exitPx;
  return pts;
}

export function replayChart(f, raw) {
  const t = f.t, box = h('section', 'rec replay');
  box.append(h('h3', '', 'Replay of this loss'));
  let path = null, real = false;
  try {
    const rows = raw && Array.isArray(raw.trades) ? raw.trades : [];
    const row = rows.find((x) => x && x.day === t.day && x.entry && +x.entry.t === t.entryT && String(x.side || '').toUpperCase() === (t.side || ''));
    const b = row ? closesOf(row) : null, exitT = row && row.exit && numv(row.exit.t);
    if (b) { const k = exitT != null ? b.t.findIndex((tt) => tt > exitT) : -1; path = b.v.slice(0, k < 0 ? b.v.length : k + 1); real = path.length >= 5; }
  } catch (_) { path = null; }
  if (!path || path.length < 5) path = sketch(t);
  const W = 300, H = 120, pad = 6;
  const lv = [t.stop, t.sweepExt, t.entryPx].filter((x) => x != null);
  const lo = Math.min(...path, ...lv), hi = Math.max(...path, ...lv), span = Math.max(1e-6, hi - lo);
  const X = (i) => pad + (i / (path.length - 1)) * (W - 2 * pad), Y = (v) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rchart', role: 'img', 'aria-label': `The path of the ${dayText(t.day)} trade: entry, stop, sweep and exit` });
  const line = (v, cls, label) => { if (v == null) return; svg.append(sv('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: cls })); const tx = sv('text', { x: W - 3, y: Y(v) - 2, class: 'lb', 'text-anchor': 'end' }); tx.textContent = label; svg.append(tx); };
  line(t.stop, 'lvl stop', 'stop'); line(t.sweepExt, 'lvl sweep', 'sweep'); line(t.entryPx, 'lvl entry', 'entry');
  const d = path.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const ghost = sv('path', { d, class: 'ghost' }), live = sv('path', { d, class: 'live' });
  svg.append(ghost, live);
  const head = sv('circle', { r: 3.4, class: 'head', cx: X(0), cy: Y(path[0]) }), ex = sv('circle', { r: 4, class: 'exit', cx: X(path.length - 1), cy: Y(path[path.length - 1]) });
  svg.append(ex, head);
  const len = path.length;
  let len2 = 0; try { live.setAttribute('stroke-dasharray', '9999'); len2 = live.getTotalLength ? live.getTotalLength() : 0; } catch (_) { len2 = 0; }
  const show = (u) => {
    const i = Math.max(0, Math.min(len - 1, Math.round(u * (len - 1))));
    live.setAttribute('d', path.slice(0, i + 1).map((v, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`).join(''));
    head.setAttribute('cx', X(i)); head.setAttribute('cy', Y(path[i]));
    ex.style.opacity = i >= len - 1 ? '1' : '0.25';
  };
  const range = h('input'); range.type = 'range'; range.min = '0'; range.max = '1000'; range.value = '1000'; range.setAttribute('aria-label', 'Scrub the replay'); range.id = 'rpScrub';
  show(1);
  range.addEventListener('input', () => show(+range.value / 1000));
  const play = h('button', 'btn mini', 'Replay'); play.type = 'button'; play.id = 'rpPlay';
  let raf = 0;
  play.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    const reduce = window.OLYMPUS ? window.OLYMPUS.reduced() : false;
    if (reduce) { range.value = '1000'; show(1); return; }
    const t0 = performance.now(), dur = 3200;
    const step = (now) => { const u = Math.min(1, (now - t0) / dur); range.value = String(Math.round(u * 1000)); show(u); if (u < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  });
  const facts = [t.hhmm ? `Entered ${t.hhmm} ET` : '', t.heldMin != null ? `held ${Math.round(t.heldMin)} min` : '', t.exitKind ? `exit: ${t.exitKind}` : '', t.maeR != null ? `went ${Math.abs(t.maeR).toFixed(1)}R against you` : '', t.mfeR != null ? `best ${t.mfeR.toFixed(1)}R in your favour` : ''].filter(Boolean);
  const row = h('div', 'btnrow'); row.append(play, range);
  box.append(svg, row, h('p', 'note', facts.join(' · ') + (real ? '' : '. Sketch from the trade\'s numbers: the site has no 1-minute path for this one.')));
  box.dataset.real = real ? '1' : '0';
  return box;
}

// ------------------------------------------------------------------ the pattern detector
export function patterns(trades) {
  const box = h('section', 'rec patterns'), lit = trades.filter((t) => t.strat === 'LIT' || true);
  box.append(h('h3', '', 'Pattern detector'));
  if (lit.length < 6) { box.append(h('p', '', 'Not enough trades yet to see a pattern (needs 6).')); return box; }
  const groups = [];
  const rate = (name, list) => { const n = list.length, l = list.filter(isLoss).length, cost = list.filter(isLoss).reduce((s, t) => s + Math.abs(t.usd), 0); return { name, n, l, cost, p: n ? l / n : 0 }; };
  // time of day
  const tod = BUCKETS.map((b) => rate(b.name + ' ' + b.span, lit.filter((t) => { const k = bucketOf(t.minute); return k && k.id === b.id; }))).filter((g) => g.n >= 2);
  groups.push({ title: 'Time of day', rows: tod });
  // size: against the median size
  const sizes = lit.map((t) => t.qty).filter((x) => x != null).sort((a, b) => a - b), med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
  if (med) groups.push({ title: 'Size', rows: [rate('Smaller than usual', lit.filter((t) => t.qty != null && t.qty < med * 0.8)), rate('Usual size', lit.filter((t) => t.qty != null && t.qty >= med * 0.8 && t.qty <= med * 1.25)), rate('Bigger than usual', lit.filter((t) => t.qty != null && t.qty > med * 1.25))].filter((g) => g.n >= 2) });
  // after a loss: the trade that follows a fallen one (the same or the next trading day) against one that does not
  const after = [], fresh = [];
  lit.forEach((t, i) => { const p = lit[i - 1]; (p && isLoss(p) ? after : fresh).push(t); });
  groups.push({ title: 'After a loss', rows: [rate('Right after a loss', after), rate('After a win or a flat one', fresh)].filter((g) => g.n >= 2) });
  let worst = null;
  for (const g of groups) {
    const ul = h('ul', 'pat');
    for (const r of g.rows) {
      const li = h('li'), bar = h('span', 'pbar'), f = h('i'); f.style.width = `${Math.max(3, Math.round(r.p * 100))}%`; bar.append(f);
      li.append(h('span', 'pn', r.name), bar, h('span', 'pv', `${Math.round(r.p * 100)}% · ${r.l}/${r.n}`)); ul.append(li);
      if (r.n >= 4 && (!worst || r.p - 0.0 > worst.p)) worst = Object.assign({ group: g.title }, r);
    }
    if (g.rows.length) box.append(h('h4', '', g.title), ul);
  }
  const overall = lit.filter(isLoss).length / lit.length;
  box.append(h('p', 'note pfind', worst && worst.p > overall + 0.08
    ? `Most leaky: ${worst.group.toLowerCase()}, ${worst.name}: ${Math.round(worst.p * 100)}% of those trades lose (all trades: ${Math.round(overall * 100)}%). It cost ${usd(-worst.cost)}.`
    : `No pattern stands out: every group loses about as often as all trades (${Math.round(overall * 100)}%).`));
  box.append(h('p', 'note', 'A loss rate of a small group is a hint, not a law: groups under 4 trades are not ranked.'));
  return box;
}

// ------------------------------------------------------------------ the vow tracker
export function vowStreak(vows) {
  const box = h('section', 'rec streakbox');
  const keys = Object.keys(vows || {}).sort().reverse();
  let cur = 0; for (const k of keys) { if (vows[k] && vows[k].done) cur++; else break; }
  let best = 0, run = 0; for (const k of keys.slice().reverse()) { if (vows[k] && vows[k].done) { run++; best = Math.max(best, run); } else run = 0; }
  box.append(h('h3', '', 'Vow streak'));
  const row = h('div', 'vstreak');
  row.append(h('b', 'vnum', String(cur)), h('span', '', cur === 1 ? 'week kept in a row' : 'weeks kept in a row'), h('span', 'vbest', `best ${best}`));
  const dots = h('div', 'vdots');
  keys.slice(0, 8).reverse().forEach((k) => { const i = h('i', vows[k].done ? 'on' : ''); i.title = `${weekText(k)}: ${vows[k].done ? 'kept' : 'not kept'}`; dots.append(i); });
  if (!keys.length) dots.append(h('span', 'note', 'No vow yet. Pick a leak and make it your vow.'));
  box.append(row, dots);
  box.dataset.streak = String(cur);
  return box;
}

// ------------------------------------------------------------------ one note for Obsidian
export function obsidianAll({ wk, list, rk, vows, trades, weeks, all }) {
  const lines = [`## Nemesis review: ${weekText(wk)}`, `- Fallen: ${list.length}, lost ${usd(-rk.lost)}`];
  lines.push(rk.rank[0] ? `- Leak of the week: ${rk.rank[0].name}, ${usd(-rk.rank[0].cost)}` : '- Leak of the week: none');
  const keys = Object.keys(vows || {}).sort().reverse();
  let cur = 0; for (const k of keys) { if (vows[k] && vows[k].done) cur++; else break; }
  lines.push(`- Vow streak: ${cur} week${cur === 1 ? '' : 's'} in a row`);
  const rows = weeks.slice(0, 6).map((w) => { const t = leaks(all.filter((f) => f.wk === w.wk)).rank[0]; return `  - ${weekText(w.wk)}: ${t ? t.name + ' ' + usd(-t.cost) : 'no leak'}`; });
  lines.push('- Last weeks:', ...rows);
  const p = patterns(trades).querySelector('.pfind');
  if (p) lines.push(`- Pattern: ${p.textContent}`);
  lines.push('#nemesis #weekly-review');
  return lines.join('\n');
}
