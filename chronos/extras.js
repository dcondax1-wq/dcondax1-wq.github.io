// CHRONOS extras (ES module, JOB 10+11, 2026-11-04): the Lab. Four ways to use the replay data beyond watching one trade.
//   compareView(ctx)   two days side by side: the numbers, the verdicts and every trade's path in R (stop = -1R) on one chart
//   reelsView(ctx)     the best, the worst and the average day as reels: play one, or all three in a row
//   whatIfView(ctx)    what would have changed: the same trades replayed on their own 1-minute path with other rules (break-even, target)
//   calendarView(ctx)  a heatmap calendar of the bot's days (green = a good day, red = a bad one); tap a day to replay it
//   exportView(ctx)    export the reel: text for a note, a JSON file, a poster image
//   simulate(t, rule)  the replay engine behind "what if" (pure; used by the tests)
// ctx = { days, trades, day() -> the shown day, pickDay(dayStr, opts), playReel(daysArr), demo, close() }
// Honest limits (said on the page): a trade's path ends where the bot exited, so a longer hold cannot be tested; the order of high and low inside
// a 1-minute bar is unknown (the replay takes the stop first, the pessimistic way); results are before commissions. Read-only.
import { dayVerdict, usd, sgn, clock, prettyDay, steps } from './chroncore.js';

const NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const COST_PTS = 1.25;                           // the bot's break-even: entry + 1.25 points (the costs)

/** replay one trade with a rule { be: R at which the stop goes to break-even (null = never), targetR: R of the target (null = the trade's own) } -> { r, why } or null */
export function simulate(t, rule = {}) {
  const b = t.bars, side = t.side === 'LONG' ? 1 : -1, e = t.entry.px;
  if (t.stop == null) return null;
  const risk = Math.abs(e - t.stop);
  if (!(risk > 0)) return null;
  const be = rule.be === undefined ? 1 : rule.be;
  const tgtR = rule.targetR === undefined ? (t.target != null ? Math.abs(t.target - e) / risk : 8) : rule.targetR;
  let stop = t.stop, beOn = false, last = e, lastT = t.entry.t;
  for (let i = 0; i < b.t.length; i++) {
    if (b.t[i] <= t.entry.t) continue;
    if (b.t[i] > t.exit.t + 60) break;
    const hi = b.h[i], lo = b.l[i], fav = side > 0 ? hi : lo, adv = side > 0 ? lo : hi;
    last = b.c[i]; lastT = b.t[i];
    if ((side > 0 && adv <= stop) || (side < 0 && adv >= stop)) return { r: ((stop - e) * side) / risk, why: beOn ? 'stopped at break-even' : 'stopped out' };
    if (tgtR != null) {
      const tp = e + side * risk * tgtR;
      if ((side > 0 && fav >= tp) || (side < 0 && fav <= tp)) return { r: tgtR, why: `target ${tgtR % 1 ? tgtR.toFixed(1) : tgtR}R` };
    }
    if (be != null && !beOn && ((side > 0 && fav >= e + risk * be) || (side < 0 && fav <= e - risk * be))) { beOn = true; stop = e + side * COST_PTS; }
  }
  return { r: ((last - e) * side) / risk, why: 'ended with the trade', t: lastT };
}

const dollarsPerR = (t) => (t.r ? Math.abs(t.usd / t.r) : null);
const RULES = [
  { id: 'bot', name: 'The bot\'s rules (replayed)', rule: {} },
  { id: 'nobe', name: 'No break-even', rule: { be: null } },
  { id: 'be05', name: 'Break-even at 0.5R', rule: { be: 0.5 } },
  { id: 'be2', name: 'Break-even at 2R', rule: { be: 2 } },
  { id: 't4', name: 'Target 4R', rule: { targetR: 4 } },
  { id: 't6', name: 'Target 6R', rule: { targetR: 6 } },
  { id: 't12', name: 'Target 12R', rule: { targetR: 12 } },
];
export function whatIf(trades) {
  return RULES.map((v) => {
    let r = 0, d = 0, n = 0, dn = 0;
    for (const t of trades) {
      const s = simulate(t, v.rule); if (!s) continue;
      r += s.r; n++;
      const k = dollarsPerR(t); if (k != null) { d += s.r * k; dn++; }
    }
    return { id: v.id, name: v.name, r, usd: dn ? d : null, n };
  });
}

// ------------------------------------------------------------------ small drawing helpers
function rPath(t) {                                                    // one trade's path in R: x 0..1 over its time, y in R
  const risk = Math.abs(t.entry.px - (t.stop != null ? t.stop : t.entry.px - 10)) || 10, side = t.side === 'LONG' ? 1 : -1, b = t.bars, pts = [];
  const T0 = t.entry.t, T1 = Math.max(T0 + 60, t.exit.t);
  for (let i = 0; i < b.t.length; i++) if (b.t[i] >= T0 && b.t[i] <= T1 + 60) pts.push([(b.t[i] - T0) / (T1 - T0), ((b.c[i] - t.entry.px) * side) / risk]);
  if (pts.length < 2) pts.push([0, 0], [1, t.r || 0]);
  return pts;
}
function chart(groups, { W = 300, H = 120, label = 'Trade paths in R' } = {}) {
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cchart', role: 'img', 'aria-label': label });
  let lo = -1.2, hi = 2;
  for (const g of groups) for (const p of g.paths) for (const q of p) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }
  hi = Math.min(hi, 10);
  const X = (u) => 4 + u * (W - 8), Y = (r) => 6 + (1 - (Math.min(hi, r) - lo) / (hi - lo)) * (H - 12);
  svg.append(sv('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), class: 'z' }), sv('line', { x1: 0, x2: W, y1: Y(-1), y2: Y(-1), class: 'stop' }));
  const tz = sv('text', { x: 3, y: Y(-1) - 2, class: 'lb' }); tz.textContent = 'stop -1R'; svg.append(tz);
  for (const g of groups) for (const p of g.paths) svg.append(sv('path', { d: p.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(''), class: 'p ' + g.cls }));
  return svg;
}
const dayR = (d) => d.trades.reduce((s, t) => s + (t.r || 0), 0);

// ------------------------------------------------------------------ compare
export function compareView(ctx) {
  const box = h('div', 'lab compare');
  const days = ctx.days; if (days.length < 2) { box.append(h('p', '', 'Needs two days with trades.')); return box; }
  const cur = ctx.day() || days[days.length - 1], i = days.findIndex((d) => d.day === cur.day);
  const mk = (id, sel) => { const s = h('select'); s.id = id; s.setAttribute('aria-label', id === 'cmpA' ? 'First day' : 'Second day'); for (const d of days) { const o = h('option', '', `${prettyDay(d.day)} · ${sgn(d.usd)}`); o.value = d.day; if (d.day === sel) o.selected = true; s.append(o); } return s; };
  const selA = mk('cmpA', cur.day), selB = mk('cmpB', (days[i - 1] || days[i + 1]).day);
  const row = h('div', 'cmpsel'); row.append(selA, selB);
  const out = h('div', 'cmpout');
  const draw = () => {
    const A = days.find((d) => d.day === selA.value), B = days.find((d) => d.day === selB.value);
    const col = (d, cls) => { const v = dayVerdict(d), c = h('div', 'cmpcol ' + cls); c.append(h('b', '', prettyDay(d.day)), h('span', 'big' + (d.usd < 0 ? ' neg' : ''), sgn(d.usd)), h('span', '', `${d.trades.length} trade${d.trades.length > 1 ? 's' : ''} · ${dayR(d).toFixed(1)}R`), h('span', '', `best possible ${usd(d.best)}`), h('span', 'note', v.head)); return c; };
    const cols = h('div', 'cmpcols'); cols.append(col(A, 'a'), col(B, 'b'));
    const ch = chart([{ cls: 'a', paths: A.trades.map(rPath) }, { cls: 'b', paths: B.trades.map(rPath) }]);
    const leg = h('p', 'legend'); leg.append(h('i', 'k a'), prettyDay(A.day) + '  ', h('i', 'k b'), prettyDay(B.day));
    const diff = A.usd - B.usd, p = h('p', 'note', `${prettyDay(A.day)} made ${usd(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'} than ${prettyDay(B.day)}. Each line is one trade from its entry to its exit, in R (the stop is -1R).`);
    out.replaceChildren(cols, ch, leg, p);
    out.dataset.a = A.day; out.dataset.b = B.day;
  };
  selA.addEventListener('change', draw); selB.addEventListener('change', draw); draw();
  box.append(row, out);
  return box;
}

// ------------------------------------------------------------------ reels
export function reelDays(days) {
  if (!days.length) return null;
  const mean = days.reduce((s, d) => s + d.usd, 0) / days.length;
  let best = days[0], worst = days[0], avg = days[0];
  for (const d of days) { if (d.usd > best.usd) best = d; if (d.usd < worst.usd) worst = d; if (Math.abs(d.usd - mean) < Math.abs(avg.usd - mean)) avg = d; }
  return { best, worst, avg, mean };
}
export function reelsView(ctx) {
  const box = h('div', 'lab reels'), R = reelDays(ctx.days);
  if (!R) { box.append(h('p', '', 'No days yet.')); return box; }
  const list = [['Best day', R.best, 'best'], ['Worst day', R.worst, 'worst'], ['Average day', R.avg, 'avg']];
  for (const [name, d, cls] of list) {
    const c = h('article', 'reel ' + cls); c.dataset.reel = cls; c.dataset.day = d.day;
    const t = d.trades[0], head = h('div', 'rh'); head.append(h('b', '', name), h('span', d.usd < 0 ? 'neg' : 'pos', sgn(d.usd)));
    c.append(head, h('span', 'rd', `${prettyDay(d.day)} · ${d.trades.length} trade${d.trades.length > 1 ? 's' : ''}`), chart([{ cls: cls, paths: d.trades.map(rPath) }], { H: 70, label: `${name}: the paths` }));
    const b = h('button', 'btn mini', 'Play this reel'); b.type = 'button'; b.addEventListener('click', () => { ctx.close(); ctx.pickDay(d.day, { play: true }); });
    c.append(b); box.append(c);
  }
  const all = h('button', 'btn', 'Play all three in a row'); all.type = 'button'; all.id = 'reelAll';
  all.addEventListener('click', () => { ctx.close(); ctx.playReel([R.best.day, R.worst.day, R.avg.day]); });
  box.append(all, h('p', 'note', `The average day is the one closest to the mean (${sgn(R.mean)}). A reel replays the first trade of the day; the others are one tap away on the dock.`));
  return box;
}

// ------------------------------------------------------------------ what would have changed
export function whatIfView(ctx) {
  const box = h('div', 'lab whatif'), d = ctx.day(), all = ctx.trades;
  const dayRows = d ? whatIf(d.trades) : null, allRows = whatIf(all);
  box.append(h('p', 'strong', 'Same entries, other rules. Each trade is replayed on its own 1-minute path.'));
  const tb = h('table', 'wtab'), head = h('tr'); for (const x of ['Rule', d ? prettyDay(d.day) : 'Day', `All ${all.length}`, 'All, $']) head.append(h('th', '', x));
  tb.append(head);
  const base = allRows[0], bestId = allRows.slice().sort((a, b) => b.r - a.r)[0].id;
  allRows.forEach((r, i) => {
    const tr = h('tr', (i === 0 ? 'base ' : '') + (r.id === bestId ? 'best' : '')); tr.dataset.rule = r.id;
    const dr = dayRows && dayRows[i];
    tr.append(h('td', '', r.name), h('td', '', dr ? `${dr.r >= 0 ? '+' : ''}${dr.r.toFixed(1)}R` : '-'), h('td', '', `${r.r >= 0 ? '+' : ''}${r.r.toFixed(1)}R`), h('td', '', r.usd == null ? '-' : sgn(r.usd)));
    tb.append(tr);
  });
  const diff = allRows.find((r) => r.id === bestId);
  box.append(tb, h('p', 'note wfind', bestId === 'bot' ? 'Over these trades no other rule beats the bot\'s own: the plan is already the best of these.' : `Over these ${all.length} trades "${diff.name}" would have made ${(diff.r - base.r >= 0 ? '+' : '') + (diff.r - base.r).toFixed(1)}R more than the bot\'s rules. Hindsight on a small sample: not a reason to change a rule.`));
  box.append(h('p', 'note', 'A trade\'s path ends where the bot exited, so holding longer cannot be tested. Inside a 1-minute bar the stop is taken first (pessimistic). Before commissions. Read-only: nothing here changes the bot.'));
  return box;
}

// ------------------------------------------------------------------ the calendar heatmap
export function calendarView(ctx) {
  const box = h('div', 'lab heat'), days = ctx.days;
  if (!days.length) { box.append(h('p', '', 'No days yet.')); return box; }
  const by = new Map(days.map((d) => [d.day, d])), maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.usd)));
  const first = days[0].day.slice(0, 7), last = days[days.length - 1].day.slice(0, 7), months = [];
  for (let y = +first.slice(0, 4), m = +first.slice(5); `${y}-${String(m).padStart(2, '0')}` <= last; m++) { if (m > 12) { m = 1; y++; } months.push([y, m]); if (months.length > 18) break; }
  for (const [y, m] of months) {
    const mon = h('section', 'month'), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), off = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    mon.append(h('h4', '', new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })));
    const g = h('div', 'hgrid');
    for (let i = 0; i < off; i++) g.append(h('i', 'hc blank'));
    for (let dd = 1; dd <= n; dd++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, d = by.get(key), wd = (off + dd - 1) % 7;
      const c = d ? h('button', 'hc has') : h('i', 'hc' + (wd > 4 ? ' wk' : ''));
      if (d) {
        c.type = 'button'; c.dataset.day = key; const k = Math.min(1, Math.abs(d.usd) / maxAbs);
        c.style.background = d.usd >= 0 ? `rgba(127,138,82,${0.25 + 0.7 * k})` : `rgba(255,90,102,${0.25 + 0.7 * k})`;
        c.title = `${prettyDay(key)}: ${sgn(d.usd)}`; c.setAttribute('aria-label', c.title); c.textContent = String(dd);
        c.addEventListener('click', () => { ctx.close(); ctx.pickDay(key, { play: true }); });
      } else c.textContent = String(dd);
      g.append(c);
    }
    mon.append(g); box.append(mon);
  }
  box.append(h('p', 'note', 'Green = a good day, red = a bad one, deeper = bigger. Tap a day to replay it.'));
  return box;
}

// ------------------------------------------------------------------ export the reel
export function reelText(d) {
  const lines = [`## Chronos reel: ${prettyDay(d.day)} (${d.day})`, `- Bot: ${sgn(d.usd)} on ${d.trades.length} trade${d.trades.length > 1 ? 's' : ''}, best possible ${usd(d.best)}`];
  d.trades.forEach((t, i) => {
    lines.push(`### Trade ${i + 1}: ${t.side.toLowerCase()} at ${clock(t.entry.t, t.off)} ET, ${sgn(t.usd)} (${(t.r || 0).toFixed(1)}R)`);
    for (const s of steps(t)) lines.push(`- ${s.clock} ${s.name}: ${s.text}`);
  });
  lines.push('#chronos #reel');
  return lines.join('\n');
}
export function posterCanvas(d) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d'); g.fillStyle = '#13100d'; g.fillRect(0, 0, 1080, 1350);
  const gr = g.createRadialGradient(540, 420, 40, 540, 420, 720); gr.addColorStop(0, 'rgba(75, 122, 153,.35)'); gr.addColorStop(1, 'rgba(19, 16, 13,0)'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = 'center'; g.fillStyle = '#c8a24a'; g.font = '700 54px "Iowan Old Style", Palatino, Georgia, serif'; g.fillText('CHRONOS', 540, 120);
  g.fillStyle = '#f3ece0'; g.font = '600 44px system-ui, sans-serif'; g.fillText(prettyDay(d.day), 540, 190);
  g.fillStyle = d.usd >= 0 ? '#c8a24a' : '#c96a4a'; g.font = '800 150px "Iowan Old Style", Palatino, Georgia, serif'; g.fillText(sgn(d.usd), 540, 380);
  g.fillStyle = '#d6ccbc'; g.font = '500 40px system-ui, sans-serif'; g.fillText(`${d.trades.length} trade${d.trades.length > 1 ? 's' : ''} · best possible ${usd(d.best)}`, 540, 450);
  const X0 = 90, X1 = 990, Y0 = 560, Y1 = 1160; g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
  let hi = 2, lo = -1.2; const paths = d.trades.map(rPath); for (const p of paths) for (const q of p) { hi = Math.max(hi, q[1]); lo = Math.min(lo, q[1]); } hi = Math.min(hi, 10);
  const X = (u) => X0 + u * (X1 - X0), Y = (r) => Y0 + (1 - (Math.min(hi, r) - lo) / (hi - lo)) * (Y1 - Y0);
  g.setLineDash([14, 10]); g.strokeStyle = '#c96a4a'; g.beginPath(); g.moveTo(X0, Y(-1)); g.lineTo(X1, Y(-1)); g.stroke(); g.setLineDash([]);
  const cols = ['#e0b060', '#e0b060', '#e0b060', '#e0b060'];
  paths.forEach((p, i) => { g.strokeStyle = cols[i % 4]; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); p.forEach((q, k) => (k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])))); g.stroke(); });
  g.fillStyle = '#4b7a99'; g.font = '500 32px system-ui, sans-serif'; g.fillText('Each line: one trade, entry to exit, in R. The red line is the stop.', 540, 1230);
  g.fillText('Replay from the bot\'s own 1-minute data. Paper / backtest. Not advice.', 540, 1280);
  return c;
}
export function exportView(ctx) {
  const box = h('div', 'lab export'), d = ctx.day();
  if (!d) { box.append(h('p', '', 'Pick a day first.')); return box; }
  box.append(h('p', 'strong', `Export the reel of ${prettyDay(d.day)}.`));
  const ta = h('textarea', 'copybox'); ta.readOnly = true; ta.id = 'reelBox'; ta.value = reelText(d); ta.setAttribute('aria-label', 'The reel as text'); ta.rows = 8;
  const row = h('div', 'btnrow'), copy = h('button', 'btn', 'Copy text'), json = h('button', 'btn ghost', 'Download .json'), png = h('button', 'btn ghost', 'Download poster');
  for (const b of [copy, json, png]) b.type = 'button';
  copy.id = 'reelCopy'; json.id = 'reelJson'; png.id = 'reelPng';
  copy.addEventListener('click', async () => { let ok = false; try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (_) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (_e) { ok = false; } } copy.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(() => { copy.textContent = 'Copy text'; }, 2000); });
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  json.addEventListener('click', () => save(new Blob([JSON.stringify({ kind: 'olympus-chronos-reel', v: 1, day: d.day, usd: d.usd, best: d.best, trades: d.trades.map((t) => ({ id: t.id, side: t.side, usd: t.usd, r: t.r, entry: t.entry, exit: t.exit, stop: t.stop, target: t.target, steps: steps(t).map((s) => ({ t: s.t, clock: s.clock, name: s.name, text: s.text })) })) }, null, 1)], { type: 'application/json' }), `chronos-reel-${d.day}.json`));
  png.addEventListener('click', () => { try { posterCanvas(d).toBlob((b) => b && save(b, `chronos-reel-${d.day}.png`), 'image/png'); } catch (_) { /* no canvas */ } });
  row.append(copy, json, png);
  box.append(ta, row, h('p', 'note', 'Text goes to your clipboard; the files are saved by your browser. Nothing is sent anywhere.'));
  return box;
}

// ------------------------------------------------------------------ the Lab sheet
export const LAB_TABS = [['compare', 'Compare', compareView], ['reels', 'Reels', reelsView], ['whatif', 'What if', whatIfView], ['calendar', 'Calendar', calendarView], ['export', 'Export', exportView]];
export function labView(ctx, tab = 'compare') {
  const wrap = h('div', 'labwrap'), nav = h('div', 'labtabs'), body = h('div', 'labbody');
  nav.setAttribute('role', 'tablist');
  const show = (id) => {
    const t = LAB_TABS.find((x) => x[0] === id) || LAB_TABS[0];
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lab === t[0])));
    body.replaceChildren(t[2](ctx)); wrap.dataset.tab = t[0];
  };
  for (const [id, name] of LAB_TABS) { const b = h('button', '', name); b.type = 'button'; b.dataset.lab = id; b.addEventListener('click', () => show(id)); nav.append(b); }
  wrap.append(nav, body); show(tab);
  return wrap;
}
