// FATES Lab (ES module, 2026-11-04, JOB 4+5): the bottom sheet with the what-ifs on the drawn futures. DOM + SVG only, no WebGL, no fetch.
//   fan        percentiles of the profit across the futures, session by session, against the floor and the target
//   timeline   the pass odds by day: when the passes happen (the histogram of all the futures) and the 10 / 15 session marks
//   size       the same futures at 1x / 1.25x / 1.5x / 2x the size: passes and floor hits (an estimate over the drawn futures)
//   cut        "cut a thread": every future with its worst session removed; a tapped future gets its own cut
//   cost       what a pass costs: the eval fee over the pass rate, from today and from a fresh start
//   scen       the scenario picker: Zlarior / ATLAS x the three samples side by side, one tap to switch
// createLab({ el, scen, route, go, selected }) -> { open(tab), close(), refresh(), isOpen(), tab() }. Text only through textContent / SVG attributes.
import * as C from './fates-core.js';

const NS = 'http://www.w3.org/2000/svg';
const TABS = [['fan', 'Fan'], ['timeline', 'Odds by day'], ['size', 'Size'], ['cut', 'Cut a thread'], ['cost', 'Cost'], ['scen', 'Scenarios']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const sv = (name, attrs) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; };
const txt = (x, y, s, attrs) => { const t = sv('text', { x, y, ...(attrs || {}) }); t.textContent = s; return t; };

export function createLab({ el: root, scen, route, go, selected }) {
  const body = root.querySelector('[data-lab-body]'), tabs = root.querySelector('[data-lab-tabs]'), title = root.querySelector('[data-lab-title]'), sub = root.querySelector('[data-lab-sub]');
  let cur = 'fan', fresh = false, open = false;
  tabs.replaceChildren(...TABS.map(([id, label]) => { const b = el('button', '', label); b.type = 'button'; b.dataset.tab = id; b.addEventListener('click', () => show(id)); return b; }));

  const frame = (W, H, label) => sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
  const grid = (svg, W, H, L, T, B, ys, fmt) => ys.forEach((v) => { svg.append(sv('line', { x1: L, x2: W - 6, y1: v.y, y2: v.y, class: 'gl' })); svg.append(txt(L - 4, v.y + 3, fmt(v.v), { 'text-anchor': 'end', class: 'ax' })); });

  function fanView(s) {
    const n = 40, f = C.fanChart(s, n), W = 330, H = 170, L = 46, T = 10, B = 20, R = 8;
    const lo = Math.min(f.floor0, ...f.series[10]) - 100, hi = f.target + 150;
    const X = (k) => L + (k / n) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const svg = frame(W, H, 'Fan chart: the middle half and the middle 80% of the futures, the median, the floor and the target');
    grid(svg, W, H, L, T, B, [f.target, 0, f.floor0].map((v) => ({ v, y: Y(v) })), (v) => C.fmtK(v));
    const band = (qa, qb, cls) => { const up = f.series[qb].map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`), dn = f.series[qa].map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).reverse(); svg.append(sv('polygon', { points: up.concat(dn).join(' '), class: cls })); };
    band(10, 90, 'b80'); band(25, 75, 'b50');
    svg.append(sv('line', { x1: L, x2: W - R, y1: Y(f.target), y2: Y(f.target), class: 'tgt' }));
    svg.append(sv('polyline', { points: f.floorMed.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), class: 'flr', fill: 'none' }));
    svg.append(sv('polyline', { points: f.series[50].map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), class: 'med', fill: 'none' }));
    [0, 10, 20, 30, 40].forEach((k) => svg.append(txt(X(k), H - 5, String(k), { 'text-anchor': 'middle', class: 'ax' })));
    const at = (k, q) => f.series[q][Math.min(k, n)];
    return [el('p', 'strong', `After 10 sessions the middle half of the futures sit between ${C.fmtUsd(at(10, 25), true)} and ${C.fmtUsd(at(10, 75), true)} (median ${C.fmtUsd(at(10, 50), true)}); after 20, ${C.fmtUsd(at(20, 25), true)} to ${C.fmtUsd(at(20, 75), true)}.`),
      svg, el('p', 'note', `Light band: the middle 80% (p10 to p90). Dark band: the middle half (p25 to p75). Gold line: the median. Red: the floor as it trails up. Dashed: the ${C.fmtUsd(f.target)} target. ${f.threads} drawn futures; a decided future holds its last value.`)];
  }

  function timelineView(s) {
    const n = 40, t = C.passTimeline(s, n), W = 330, H = 150, L = 34, T = 10, B = 20, R = 8, mx = Math.max(s.summary.pass || 1, 1);
    const X = (k) => L + ((k - 0.5) / n) * (W - L - R), Y = (p) => T + (1 - p / mx) * (H - T - B), bw = (W - L - R) / n - 1.5;
    const svg = frame(W, H, 'Pass odds by session: the share that has passed by each session');
    grid(svg, W, H, L, T, B, [0, mx / 2, mx].map((v) => ({ v, y: Y(v) })), (v) => `${Math.round(v)}%`);
    const dmx = Math.max(0.01, ...t.rows.map((r) => r.day));
    t.rows.forEach((r) => { const h = (r.day / dmx) * (H - T - B) * 0.42; svg.append(sv('rect', { x: X(r.k) - bw / 2, y: H - B - h, width: Math.max(1, bw), height: h, class: 'bar' })); });
    svg.append(sv('polyline', { points: t.rows.map((r) => `${X(r.k).toFixed(1)},${Y(r.cum).toFixed(1)}`).join(' '), class: 'med', fill: 'none' }));
    for (const k of [10, 15]) { svg.append(sv('line', { x1: X(k), x2: X(k), y1: T, y2: H - B, class: 'mark' })); svg.append(txt(X(k), T + 8, `day ${k}`, { 'text-anchor': 'middle', class: 'ax' })); }
    [1, 10, 20, 30, 40].forEach((k) => svg.append(txt(X(k), H - 5, String(k), { 'text-anchor': 'middle', class: 'ax' })));
    const at = (k) => (t.rows[k - 1] ? t.rows[k - 1].cum : null);
    return [el('p', 'strong', `${C.fmtPct(at(10))} of the futures have passed by session 10, ${C.fmtPct(at(15))} by 15, ${C.fmtPct(at(40))} by 40 (the eval's final pass odds: ${C.fmtPct(t.pass)}).`
      + (t.half ? ` Half of all the passes are in by session ${t.half}.` : '')),
    svg, el('p', 'note', 'Gold line: the share passed so far. Bars: the passes that land on each session. From the build\'s histogram of all the futures, not a sample.')];
  }

  function sizeView(s) {
    const z = C.sizeTable(s), tbl = el('table', 'tbl'), head = el('tr');
    ['Size', 'Pass', 'Fail', 'Open', 'Median'].forEach((x) => head.append(el('th', '', x))); tbl.append(head);
    z.rows.forEach((r) => { const tr = el('tr', r.k === 1 ? 'me' : ''); tr.dataset.k = String(r.k); tr.append(el('td', '', `${r.k}x`), el('td', 'p', C.fmtPct(r.pass)), el('td', 'b', C.fmtPct(r.fail)), el('td', '', C.fmtPct(r.open)), el('td', '', r.passMed == null ? '—' : `${r.passMed} d`)); tbl.append(tr); });
    const bars = el('div', 'stacks'); z.rows.forEach((r) => { const row = el('div', 'stk'); row.append(el('span', '', `${r.k}x`)); const i = el('i', 'stack'); for (const [c, w] of [['g', r.pass], ['r', r.fail], ['v', r.open]]) { const b = el('b', c); b.style.width = `${w.toFixed(1)}%`; i.append(b); } row.append(i); bars.append(row); });
    return [el('p', 'strong', z.plain), bars, tbl, el('p', 'note', `The same ${z.threads} futures with every session's move multiplied by the size, the floor replayed. An estimate: a future that ended badly as drawn stays bad; a size below 1x is not offered because the drawn days would run out. Never an order, never a setting.`)];
  }

  function cutView(s) {
    const c = C.cutWorst(s), th = selected && selected(), one = th && s.kind === 'eval' ? C.cutOne(s, th) : null;
    const mk = (label, m) => { const row = el('div', 'stk'); row.append(el('span', '', label)); const i = el('i', 'stack'); for (const [k, w] of [['g', m.pass], ['r', m.fail], ['v', m.open]]) { const b = el('b', k); b.style.width = `${w.toFixed(1)}%`; i.append(b); } row.append(i); return row; };
    const bars = el('div', 'stacks'); bars.append(mk('As drawn', c.base), mk('Worst session cut', c.cut));
    const out = [el('p', 'strong', c.plain), bars];
    out.push(el('p', 'note', one ? `The future you tapped (#${th.id + 1}): ${one.plain}` : 'Tap a thread in the scene, then open this tab again: it shows that one future with its own worst session removed.'));
    return out;
  }

  function costView(s) {
    const c = C.costPerPass(s, fresh), has = !!(s.summary && s.summary.fresh);
    const box = el('div', 'bigs'); [['Per pass', c.perPass == null ? '—' : C.fmtUsd(c.perPass)], ['Evals per pass', c.attempts == null ? '—' : c.attempts.toFixed(1)], ['One eval', c.price ? C.fmtUsd(c.price) : '—']].forEach(([l, v]) => { const d = el('div', 'big'); d.append(el('span', '', l), el('b', '', v)); box.append(d); });
    const seg = el('div', 'seg tiny'); [['today', 'From today'], ['fresh', 'Fresh start']].forEach(([id, l]) => { const b = el('button', '', l); b.type = 'button'; b.setAttribute('aria-pressed', String((id === 'fresh') === fresh)); b.disabled = id === 'fresh' && !has; b.addEventListener('click', () => { fresh = id === 'fresh'; show('cost'); }); seg.append(b); });
    return [el('p', 'strong', c.plain), box, has ? seg : null, el('p', 'note', 'The fee is the owner\'s real price ($91.80 for the 50K, $63 for the 25K Builder). A failed eval is bought again, so the cost of one pass is the fee over the pass rate. Fresh start = a brand-new eval from day 1; from today = the eval running now.')];
  }

  function scenView(data) {
    const rows = C.scenarioTable(data), r0 = route(), cur0 = `eval:${r0.scen}:${r0.period}`, tbl = el('table', 'tbl scen'), head = el('tr');
    ['Scenario', 'Pass', 'Fail', 'Per pass'].forEach((x) => head.append(el('th', '', x))); tbl.append(head);
    rows.forEach((r) => { const tr = el('tr', r.key === cur0 ? 'me' : ''), td = el('td'), b = el('button', 'pick', r.label); b.type = 'button'; b.dataset.key = r.key; b.title = r.name; b.addEventListener('click', () => go({ scen: r.bot, period: r.period })); td.append(b);
      tr.append(td, el('td', 'p', C.fmtPct(r.pass)), el('td', 'b', C.fmtPct(r.fail)), el('td', '', r.cost == null ? '—' : C.fmtUsd(r.cost))); tbl.append(tr); });
    return [el('p', 'strong', 'Every eval scenario side by side. Tap one to spin it.'), tbl, el('p', 'note', 'Zlarior is the 50K eval, ATLAS the 25K one. 2026 is the market LIT was tuned on; 2021-25 is four older years it never saw (a much weaker edge): read it as the bad-market case.')];
  }

  function show(id) {
    cur = TABS.some((t) => t[0] === id) ? id : 'fan';
    const data = window.__fates && window.__fates.data, s = scen();
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === cur)));
    title.textContent = 'Lab'; sub.textContent = s ? (s.kind === 'eval' ? `${s.name} · ${s.rules.name}` : 'Money') : '';
    let nodes;
    if (!s || !data) nodes = [el('p', 'strong', 'Reading the futures…')];
    else if (s.kind !== 'eval' && cur !== 'scen') nodes = [el('p', 'strong', 'The Lab reads one eval at a time. Pick Zlarior or ATLAS (or the Scenarios tab).'), el('p', 'note', 'The Money view spans several accounts and a year; its numbers are on the HUD.')];
    else nodes = { fan: fanView, timeline: timelineView, size: sizeView, cut: cutView, cost: costView, scen: () => scenView(data) }[cur](s);
    body.replaceChildren(...nodes.filter(Boolean));
    body.scrollTop = 0;
  }
  return {
    open(id) { open = true; root.hidden = false; show(id || cur); }, close() { open = false; root.hidden = true; }, refresh() { if (open) show(cur); },
    isOpen: () => open, tab: () => cur,
  };
}
