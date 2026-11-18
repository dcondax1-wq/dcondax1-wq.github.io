// HERA page (ES module): the money plan. The 12-month cash chart (with the 1-in-10 band), a month card you slide through, the payout calendar, cash in and out, and the next account to buy.
// Reads the site's plutus/roadmap.json (a study, not a promise); fixture.json = a saved copy (DEMO) when it is missing. Read only: it sends nothing and keeps nothing.
// Text only through textContent / createElementNS. window.HERA is the test hook.
import * as C from './heracore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { road: null, key: 'H2', month: 12, today: '', demo: false, ready: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function renderChips() {
  const box = $('vers'); clear(box);
  for (const [k, name, sub] of C.VERSIONS) {
    if (!S.road.versions[k]) continue;
    const b = h('button', 'ag-chip', name); b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-pressed', k === S.key ? 'true' : 'false'); b.setAttribute('aria-label', `${name}: ${sub}`);
    b.addEventListener('click', () => { S.key = k; render(); }); box.appendChild(b);
  }
}

function drawChart(v) {
  const svg = $('chart'); clear(svg);
  const g = C.chart(v.months, 360, 220, { l: 54 }); if (!g) return;
  for (const t of g.grid) { svg.appendChild(sv('line', { x1: g.pad.l, x2: 350, y1: t.y, y2: t.y, stroke: '#2f2820', 'stroke-width': 1 })); svg.appendChild(sv('text', { x: g.pad.l - 6, y: t.y + 4, 'text-anchor': 'end', fill: '#9a8f7d', 'font-size': 11 }, C.money(t.v))); }
  svg.appendChild(sv('line', { x1: g.pad.l, x2: 350, y1: g.zeroY, y2: g.zeroY, stroke: '#6b5d48', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
  svg.appendChild(sv('path', { d: g.band, fill: '#c8a24a', opacity: 0.16 }));
  svg.appendChild(sv('path', { d: g.line, fill: 'none', stroke: '#c8a24a', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  v.months.forEach((m, i) => { if (i % 2 === 0 || i === v.months.length - 1) svg.appendChild(sv('text', { x: g.x(i), y: 212, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 11 }, C.monthLabel(m))); });
  const i = Math.max(0, Math.min(v.months.length - 1, S.month - 1)), m = v.months[i];
  svg.appendChild(sv('line', { x1: g.x(i), x2: g.x(i), y1: g.pad.t, y2: 196, stroke: '#f3ece0', 'stroke-width': 1, opacity: 0.4 }));
  svg.appendChild(sv('circle', { cx: g.x(i), cy: g.y(m.cum), r: 6, fill: '#14110e', stroke: '#e0b060', 'stroke-width': 3 }));
  $('chartNote').textContent = `The line is the average path (${C.money(v.months[v.months.length - 1].cum)} at the end); the shaded band holds 8 paths in 10. The big number above is the middle path, so the two differ a little.`;
  svg.setAttribute('aria-label', `Cash to you over ${v.months.length} months, typical path. It ends near ${C.money(v.months[v.months.length - 1].cum)}. The shaded band is the range of 8 paths in 10.`);
}

function renderMonth(v) {
  const sl = $('mslider'); sl.max = String(v.months.length); sl.value = String(S.month);
  const info = C.monthInfo(v.months, S.month);
  $('mH').textContent = `Month ${info.m || S.month}: ${info.label}`; $('mText').textContent = info.text;
  const tiles = $('mTiles'); clear(tiles);
  const tile = (k, val, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', val)); tiles.appendChild(t); };
  tile('Cash in', C.money(info.in), 'pos'); tile('Cash out (fees)', C.money(info.out), 'neg'); tile('Running total', C.money(info.cum));
  sl.setAttribute('aria-valuetext', `Month ${info.m || S.month}, running total ${C.money(info.cum)}`);
}

function renderCash() {
  const c = C.cash(S.road, S.key), box = $('cashTiles'); clear(box);
  const tile = (k, val, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', val)); t.appendChild(h('span', '', n)); box.appendChild(t); };
  if (!c) return;
  tile('Cash in', C.money(c.in), 'payouts to you (80%)', 'pos'); tile('Cash out', C.money(c.out), 'new evals and fees', 'neg'); tile('Net', c.net == null ? 'n/a' : C.money(c.net), 'typical path, 12 months');
  $('cashNote').textContent = c.paid != null ? `Already paid before this plan: ${C.money(c.paid)} for the three evals running now. It is not counted again.` : '';
}

function drawCalendar(res) {
  const svg = $('cal'); clear(svg);
  const rows = res.rows, ax = res.axis; if (!ax) return;
  const L = 74, R = 346, W = R - L, rh = 38;
  svg.setAttribute('viewBox', `0 0 360 ${rows.length * rh + 28}`);
  rows.forEach((r, i) => {
    const y = 16 + i * rh;
    svg.appendChild(sv('text', { x: 4, y: y + 5, fill: '#f3ece0', 'font-size': 13, 'font-weight': 600 }, r.short));
    svg.appendChild(sv('rect', { x: L, y: y - 4, width: W, height: 8, rx: 4, fill: '#2b251d' }));
    svg.appendChild(sv('rect', { x: L + r.x0 * W, y: y - 4, width: Math.max(6, (r.x1 - r.x0) * W), height: 8, rx: 4, fill: '#9c6b3c' }));
    svg.appendChild(sv('circle', { cx: L + r.xt * W, cy: y, r: 7, fill: '#e0b060', stroke: '#14110e', 'stroke-width': 2 }));
    svg.appendChild(sv('text', { x: L + r.xt * W, y: y + 21, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 11 }, C.dayWord(r.typical)));
  });
  const tx = L + ax.today * W;
  svg.appendChild(sv('line', { x1: tx, x2: tx, y1: 4, y2: rows.length * rh + 6, stroke: '#f3ece0', 'stroke-width': 1, opacity: 0.5, 'stroke-dasharray': '3 3' }));
  svg.appendChild(sv('text', { x: tx, y: rows.length * rh + 22, 'text-anchor': 'middle', fill: '#f3ece0', 'font-size': 11 }, 'today'));
  svg.setAttribute('aria-label', 'First payout window for each account: the bar runs from a quick run to a slow run, the dot is the typical date.');
}

function renderCalendar() {
  const res = C.payoutRows(S.road, S.key, S.today); drawCalendar(res);
  const ul = $('calList'); clear(ul);
  for (const e of C.calendar(res.rows)) { const li = h('li', 'cal'); li.appendChild(h('b', '', e.text)); li.appendChild(h('span', 'note', e.sub)); ul.appendChild(li); }
  if (!res.rows.length) ul.appendChild(h('li', 'note', 'No first-payout dates in the plan yet.'));
}

function renderBuy() {
  const b = C.buyNext(S.road, S.key), box = $('buyList'); clear(box);
  $('buyText').textContent = b && b.text ? b.text : 'The plan has no re-buy ranking yet.';
  if (b) b.rank.forEach((r, i) => {
    const li = h('li', 'buy' + (i === 0 ? ' top' : '')); li.appendChild(h('b', '', `${i + 1}. ${r.name}`)); li.appendChild(h('span', 'note', `Eval ${C.money(r.price)} · adds ${C.money(r.gain)} in the year`)); box.appendChild(li);
  });
  $('buyNow').textContent = b && b.now ? `Now: ${b.now}` : ''; $('buyTodo').textContent = b && b.todo ? `Next step: ${b.todo}` : '';
}

function render() {
  const v = C.version(S.road, S.key); S.month = Math.min(S.month, v.months.length);
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderChips();
  const hd = C.headline(S.road, S.key); $('big').textContent = C.money(hd.mid); $('bigText').textContent = hd.text;
  $('bigNote').textContent = `${S.road.title || 'Money plan'}, updated ${S.road.updated || 'recently'}. A study of 2026 paper results, not a promise.`;
  drawChart(v); renderMonth(v); renderCash(); renderCalendar(); renderBuy();
  const cv = $('cav'); clear(cv); for (const c of S.road.caveats) cv.appendChild(h('li', '', c));
  say(hd.text);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  const at = q.get('at'), d = at ? new Date(at) : new Date(); S.today = (Number.isFinite(d.getTime()) ? d : new Date()).toISOString().slice(0, 10);
  const [fx, raw] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../plutus/roadmap.json')]);
  let road = C.readRoadmap(raw);
  if (!road) { road = C.readRoadmap(fx); S.demo = true; }
  if (!road) throw new Error('no plan file');
  S.road = road; S.key = q.get('v') === 'H1' && road.versions.H1 ? 'H1' : road.versions[road.conservative] ? road.conservative : Object.keys(road.versions)[0];
  const m = parseInt(q.get('month'), 10); S.month = Number.isFinite(m) && m > 0 ? m : C.version(road, S.key).months.length;
  $('mslider').addEventListener('input', (e) => { S.month = parseInt(e.target.value, 10) || 1; const v = C.version(S.road, S.key); drawChart(v); renderMonth(v); });
  render();
}
window.HERA = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Hera could not start'); } catch (_) { /* nothing */ } });
