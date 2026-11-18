// The Data City's v3 panels (every data string goes in as text, never HTML): the City menu, the City report with the Council of ideas,
// Compare two ideas, the growth Timeline, Accessibility, and the photo bar.
import { $, el, money, pct, num } from './util.js';
import { node, svg } from './ui.js';
import { holdOf, familyOf, growth } from './kinds.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const hold = (b) => ({ both: 'both periods', one: 'one period', none: 'neither' }[holdOf(b)]);

// ------------------------------------------------------------------------------------------------ the City menu
/** items: [{ key, title, sub, fn }] */
export function viewMenu(body, items) {
  const grid = el('div', 'menu');
  for (const it of items) {
    const b = el('button', 'mi');
    b.dataset.key = it.key;
    b.append(el('b', null, it.title), el('small', null, it.sub));
    b.addEventListener('click', it.fn);
    grid.appendChild(b);
  }
  body.appendChild(grid);
}

// ------------------------------------------------------------------------------------------------ what is moving the market now
/** card = market.js marketNow(); cb: { district(row), idea(row), today(), report() }. Every tap target is at least 44 px (the .pill / .list li rules). */
export function viewNow(body, card, cb) {
  const head = el('div', 'nowhead');
  head.id = 'nowHead';
  const bits = [card.day ? `data to ${card.day}` : null, card.vix !== null && card.vix !== undefined ? `VIX ${num(card.vix, 1)}${card.sky ? ' ' + card.sky : ''}` : null,
    card.demo ? 'DEMO sample' : card.fallback ? 'strongest ideas (none fired)' : `${card.firedTotal.toLocaleString()} ideas fired`].filter(Boolean);
  head.appendChild(el('div', 'note council', card.text));
  head.appendChild(el('div', 'note', bits.join(' · ')));
  body.appendChild(head);
  const ul = el('ul', 'list now');
  ul.id = 'nowList';
  card.rows.forEach((r, i) => {
    const li = el('li'), k = el('span', 'k', String(i + 1)), t = el('span', 't');
    k.style.background = r.color;
    t.append(el('div', null, `${r.name} · ${r.fired} fired`),
             el('small', null, `${r.best.label.length > 90 ? r.best.label.slice(0, 88) + '…' : r.best.label}`),
             el('small', 'usd', `+$${r.mnq} per MNQ · +$${r.nq} per NQ contract, per trade, after costs`),
             el('small', 'lit ' + (r.lit.ok === true ? 'yes' : r.lit.ok === false ? 'no' : 'na'), r.lit.text));
    li.append(k, t, el('span', 'm ' + (r.lit.ok === true ? 'pos' : ''), r.lit.ok === true ? 'LIT ✓' : r.lit.ok === false ? 'LIT –' : 'LIT ?'));
    li.dataset.key = r.key;
    li.addEventListener('click', () => cb.district?.(r));
    ul.appendChild(li);
  });
  body.appendChild(ul);
  const act = el('div', 'actions');
  for (const [label, fn, id] of [['Open the best idea', () => cb.idea?.(card.rows[0]), 'nowIdea'], ['Light up today', cb.today, 'nowToday'], ['City report', cb.report, 'nowReport']]) {
    const b = el('button', 'pill', label); b.id = id; b.addEventListener('click', () => fn?.()); act.appendChild(b);
  }
  body.appendChild(act);
  body.appendChild(el('div', 'note', 'Dollars are the backtested result of each idea per trade, after costs: $2 a point on an MNQ micro, $20 on an NQ contract. LIT levels come from the dashboard\'s paper bot. Paper only: a map of research, never an order.'));
}

// ------------------------------------------------------------------------------------------------ the City report
/** model; cou = council(model); cb: { family(key), top(), share(), celebrate(), gods: Promise<json|null> } */
export function viewReport(body, model, cou, cb) {
  const g = model.guard || {}, c = g.classes || {}, ho = g.holdout || {}, lit = model.lit?.spans?.['2026'], h2 = model.lit?.spans?.['2026 H2'];
  const rows = [
    ['Ideas tried', (g.tried || 0).toLocaleString()],
    ['Tested (30+ trades)', (g.tested || 0).toLocaleString()],
    ['Make money in 2021-25 and in 2026', ((c.green || 0) + (c.gold || 0)).toLocaleString()],
    ['Survive the noise guard (FDR)', String(g.fdr_pos ?? '–')],
    ['Gold (every year too)', String(c.gold ?? '–')],
    ['A shuffled placebo passes', String(g.placebo_fdr ?? '–')],
    ['Picked on 2021-24, still positive in 2025-26', ho.pct_positive !== undefined ? pct(ho.pct_positive) : '–'],
    ['Fired on the last session', (model.today?.fired ?? 0).toLocaleString()],
  ];
  if (lit) rows.push(['LIT, the live strategy, 2026', `PF ${num(lit.pf, 2)} · ${money(lit.net)}${h2 ? ` · check ${num(h2.pf, 2)}` : ''}`]);
  const t = el('table', 'rep');
  const head = el('tr');
  head.append(el('th', null, 'What'), el('th', null, 'Result'));
  t.appendChild(head);
  for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('td', null, k), el('td', null, v)); t.appendChild(tr); }
  const wrap = el('div', 'tablewrap'); wrap.appendChild(t);
  body.appendChild(wrap);
  body.appendChild(el('h3', null, 'The Council of ideas'));
  body.appendChild(el('div', 'note council', cou.text));
  const ct = el('table', 'cou'), ch = el('tr');
  for (const x of ['Family', 'Tested', 'Hold both', 'Survive', 'Vote']) ch.appendChild(el('th', null, x));
  ct.appendChild(ch);
  for (const r of cou.rows) {
    const tr = el('tr'), td = el('td', null, r.name);
    tr.dataset.family = r.key;
    tr.append(td, el('td', null, r.n.toLocaleString()), el('td', null, `${r.both.toLocaleString()} (${Math.round(r.share * 100)}%)`), el('td', null, `${r.fdr}${r.gold ? ' · ' + r.gold + ' gold' : ''}`),
              Object.assign(el('td', 'vote v-' + r.vote.toLowerCase(), r.vote)));
    tr.addEventListener('click', () => cb.family?.(r.key));
    ct.appendChild(tr);
  }
  const w2 = el('div', 'tablewrap'); w2.appendChild(ct);
  body.appendChild(w2);
  body.appendChild(el('div', 'note', 'Tap a family to show only its buildings. A family BACKS an idea only when one passes the noise guard; most of the city is noise, and the report says so.'));
  const gods = el('div', 'note gods');
  body.appendChild(gods);
  cb.gods?.then((j) => {
    const v = j?.council;
    if (v) gods.textContent = `The Council of the Gods (Pantheon, the market mood): ${v.label}${v.gauge !== undefined ? `, gauge ${v.gauge}` : ''}. ${v.honesty || j.honesty || 'Context, not a signal.'}`;
  }).catch(() => {});
  const act = el('div', 'actions');
  for (const [label, fn, id] of [['Top 10', cb.top, 'repTop'], ['Fireworks for gold', cb.celebrate, 'repFire'], ['Share image', cb.share, 'repShare']]) {
    const b = el('button', 'pill', label); b.id = id; b.addEventListener('click', () => fn?.()); act.appendChild(b);
  }
  body.appendChild(act);
}

// ------------------------------------------------------------------------------------------------ compare two ideas
const better = (a, b, hi = true) => (a === undefined || b === undefined || a === b || !Number.isFinite(a) || !Number.isFinite(b) ? 0 : (a > b) === hi ? 1 : 2);

/** A, B: ideas (buildings); label(b): the plain-language name; cb: { flyA, flyB, swap, close } */
export function viewCompare(body, A, B, label, cb) {
  const head = el('div', 'cmphead');
  for (const [x, k] of [[A, 'a'], [B, 'b']]) {
    const d = el('div', 'cmpname ' + k);
    d.append(el('b', null, k === 'a' ? 'A' : 'B'), el('span', null, label(x)));
    head.appendChild(d);
  }
  body.appendChild(head);
  const metrics = [
    ['$ per trade (all)', (b) => b.e, (v) => money(v), true], ['2026 $ per trade', (b) => b.e26, (v) => money(v), true], ['2021-25 $ per trade', (b) => b.eo, (v) => money(v), true],
    ['Win rate', (b) => b.w, (v) => pct(v), true], ['Trades a week', (b) => b.tpw, (v) => num(v, 2), true], ['Trades tested', (b) => b.n, (v) => (v ?? '–').toLocaleString?.() ?? '–', true],
  ];
  const t = el('table', 'cmp'), hr = el('tr');
  for (const x of ['', 'A', 'B']) hr.appendChild(el('th', null, x));
  t.appendChild(hr);
  let aWins = 0, bWins = 0;
  for (const [name, get, fmt, hi] of metrics) {
    const va = get(A), vb = get(B), w = better(va, vb, hi), tr = el('tr');
    if (w === 1) aWins++; else if (w === 2) bWins++;
    tr.append(el('td', null, name), el('td', w === 1 ? 'win' : '', fmt(va)), el('td', w === 2 ? 'win' : '', fmt(vb)));
    t.appendChild(tr);
  }
  const rest = [['Holds', hold(A), hold(B)], ['Class', A.cls || '–', B.cls || '–'], ['Trend', A.tr || 'steady', B.tr || 'steady'], ['Family', familyOf(A), familyOf(B)]];
  for (const [k, a, b] of rest) { const tr = el('tr'); tr.append(el('td', null, k), el('td', null, a), el('td', null, b)); t.appendChild(tr); }
  const wrap = el('div', 'tablewrap'); wrap.appendChild(t); body.appendChild(wrap);
  const verdict = aWins === bWins ? 'A and B are level on these numbers.' : `${aWins > bWins ? 'A' : 'B'} is better on ${Math.max(aWins, bWins)} of ${metrics.length} numbers.`;
  const both = (A.e26 > B.e26) === (A.eo > B.eo) && A.e26 !== B.e26 ? ` ${A.e26 > B.e26 ? 'A' : 'B'} wins in 2026 and in 2021-25.` : '';
  body.appendChild(el('div', 'note verdict', verdict + both + ' Different sample sizes: a bigger one is more trustworthy.'));
  const spA = A.sp, spB = B.sp;
  if (spA && spB && spA.length > 1 && spB.length > 1) {
    const s = svg(300, 64, 'cumulative $ per micro, A and B'), all = [...spA, ...spB], lo = Math.min(0, ...all), hi = Math.max(0, ...all), r = hi - lo || 1;
    const y = (v) => 60 - ((v - lo) / r) * 56;
    s.appendChild(node('line', { x1: 0, x2: 300, y1: y(0), y2: y(0), stroke: 'rgba(255,255,255,.18)', 'stroke-dasharray': '3 3' }));
    for (const [sp, col] of [[spA, (NEON ? '#3fd8ff' : '#d39556')], [spB, (NEON ? '#b48cff' : '#cdbf9f')]]) {
      s.appendChild(node('polyline', { points: sp.map((v, i) => `${(i / (sp.length - 1)) * 300},${y(v)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
    }
    body.append(el('div', 'note', 'Cumulative $ per micro, quarter by quarter (A cyan, B violet)'), s);
  }
  const act = el('div', 'actions');
  for (const [label2, fn, id] of [['Fly to A', cb.flyA, 'cmpA'], ['Fly to B', cb.flyB, 'cmpBtn'], ['Swap', cb.swap, 'cmpSwap'], ['Close', cb.close, 'cmpClose']]) {
    const b = el('button', 'pill', label2); b.id = id; b.addEventListener('click', () => fn?.()); act.appendChild(b);
  }
  body.append(act, el('div', 'note', 'Paper only: a comparison of research results, never an order.'));
}

// ------------------------------------------------------------------------------------------------ how the city grew
/** tl: { years, year, playing, on, set(y), toggle() }; the chart shows how many ideas stood tested, paid, and were gold, year by year */
export function viewTimeline(body, model, tl) {
  const years = tl.years, rows = growth(model, years), top = Math.max(1, ...rows.map((r) => r.tested));
  body.appendChild(el('div', 'note', 'How the city grew. The ideas with year-by-year numbers (the ones that hold in both periods and the best of the rest) are shown as they stood at the end of each year: a building appears once 30 trades stand behind it, and its height is its $ per trade up to that year. The others stay flat.'));
  const big = el('div', 'big'), yr = el('span', 'v', String(Math.round(tl.year)));
  yr.id = 'tlYear';
  const stat = el('span', 'u', '');
  stat.id = 'tlStat';
  big.append(yr, stat);
  body.appendChild(big);
  const r = el('input');
  Object.assign(r, { type: 'range', min: String(years[0]), max: String(years[years.length - 1]), step: '0.05', value: String(tl.year), id: 'tlRange' });
  r.setAttribute('aria-label', 'Year');
  r.addEventListener('input', () => tl.set(+r.value));
  const act = el('div', 'actions'), play = el('button', 'pill' + (tl.playing ? ' on' : ''), tl.playing ? '❚❚ Pause' : '▶ Play the growth');
  play.id = 'tlPlay';
  play.addEventListener('click', () => { const on = tl.toggle(); play.className = 'pill' + (on ? ' on' : ''); play.textContent = on ? '❚❚ Pause' : '▶ Play the growth'; });
  const now = el('button', 'pill', 'Back to now'); now.id = 'tlNow';
  now.addEventListener('click', () => tl.set(years[years.length - 1]));
  act.append(play, now);
  body.append(r, act);
  const s = svg(300, 84, 'ideas standing, paying and gold per year'), bw = 300 / rows.length;
  rows.forEach((x, i) => {
    const h1 = (x.tested / top) * 60, h2 = (x.paid / top) * 60;
    s.appendChild(node('rect', { x: i * bw + bw * 0.12, y: 66 - h1, width: bw * 0.76, height: Math.max(1, h1), rx: 2, fill: 'rgba(124,130,153,.55)' }));
    s.appendChild(node('rect', { x: i * bw + bw * 0.12, y: 66 - h2, width: bw * 0.76, height: Math.max(1, h2), rx: 2, fill: (NEON ? '#39e59a' : '#9bab62') }));
    if (x.gold) s.appendChild(node('circle', { cx: i * bw + bw / 2, cy: 66 - h2 - 5, r: 3.2, fill: (NEON ? '#ffc94a' : '#d39556') }));
    const tx = node('text', { x: i * bw + bw / 2, y: 80, 'text-anchor': 'middle', fill: '#aeb3c6', 'font-size': 10 });
    tx.textContent = String(x.year);
    s.appendChild(tx);
  });
  body.append(el('div', 'note', 'Grey: ideas standing (30+ trades by then). Green: of those, paying. Gold dot: a gold idea already paying.'), s);
  const hist = model.city?.history;
  if (Array.isArray(hist) && hist.length > 1) {
    const sp = svg(300, 48, 'ideas that survive the noise guard, run by run'), v = hist.map((h) => h.fdr ?? 0), lo = Math.min(...v), hi = Math.max(...v), rr = hi - lo || 1;
    sp.appendChild(node('polyline', { points: v.map((x, i) => `${(i / (v.length - 1)) * 300},${44 - ((x - lo) / rr) * 38}`).join(' '), fill: 'none', stroke: (NEON ? '#ffc94a' : '#d39556'), 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
    body.append(el('div', 'note', `Nightly runs of the research (${hist.length}): ideas passing the noise guard`), sp);
  }
  tl.readout = (year, st) => { yr.textContent = String(Math.floor(year + 1e-6)); stat.textContent = st; if (document.activeElement !== r) r.value = String(year); };
  tl.readout(tl.year, tl.stat || '');
}

// ------------------------------------------------------------------------------------------------ accessibility
/** st: { calm, lite, big, contrast }; cb: { calm(on), lite(on), big(on), contrast(on), speak() } */
export function viewAccess(body, st, cb) {
  const row = (key, label, sub, on, fn) => {
    const b = el('button', 'tog' + (on ? ' on' : ''));
    b.id = 'ac_' + key; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on));
    b.append(el('b', null, label), el('small', null, sub), el('i', null, on ? 'ON' : 'OFF'));
    b.addEventListener('click', () => { const v = fn(); b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); b.querySelector('i').textContent = v ? 'ON' : 'OFF'; });
    body.appendChild(b);
  };
  row('calm', 'Calm motion', 'Stops the traffic, trains, ships, rain and fireworks, and the slow camera spin. On by itself when your phone asks for reduced motion.', st.calm, () => cb.calm(!st.calm));
  row('lite', 'LITE mode', 'Fewer effects and 30 frames a second: a cooler, longer-lasting phone.', st.lite, () => cb.lite(!st.lite));
  row('big', 'Big text', 'Larger letters in every panel.', st.big, () => cb.big(!st.big));
  row('contrast', 'High contrast', 'Stronger panels, brighter text and borders.', st.contrast, () => cb.contrast(!st.contrast));
  const act = el('div', 'actions'), sp = el('button', 'pill', 'Read out the city'); sp.id = 'ac_speak';
  sp.addEventListener('click', () => cb.speak?.());
  act.appendChild(sp);
  body.appendChild(act);
  body.appendChild(el('h3', null, 'Keyboard'));
  body.appendChild(el('div', 'note', 'Arrow keys turn the camera, + and - zoom, F flies to the best match of a search, N to the next match, P takes a photo, M opens this menu, Esc closes a panel.'));
}

// ------------------------------------------------------------------------------------------------ photo mode
/** the bar under the picture: Shoot, Share (when the browser can), Close; shows the last picture */
export function photoBar(cb) {
  let bar = $('#photoBar');
  if (bar) return bar;
  bar = el('div', 'photobar');
  bar.id = 'photoBar';
  const shoot = el('button', 'shoot'), share = el('button', 'pill', 'Save / share'), close = el('button', 'pill', 'Close'), img = el('img');
  shoot.id = 'shootB'; shoot.setAttribute('aria-label', 'Take the photo');
  share.id = 'shareB'; close.id = 'photoX'; img.id = 'photoImg'; img.alt = 'The last photo'; img.hidden = true;
  shoot.addEventListener('click', () => cb.shoot());
  share.addEventListener('click', () => cb.share());
  close.addEventListener('click', () => cb.close());
  bar.append(img, shoot, share, close);
  document.body.appendChild(bar);
  return bar;
}

