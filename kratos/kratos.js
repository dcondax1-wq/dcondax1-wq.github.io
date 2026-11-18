// KRATOS page (ES module): the discipline score. Reads ../odeon/trades.json (the bot's trades), the journal ratings kept on this phone by Mnemosyne (localStorage 'journal.v1', READ ONLY) and fixture.json (DEMO, never blank).
// Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS. window.KRATOS is the test hook. ?today=2026-11-10&day=2026-11-03&demo=1 opens a given view.
import * as C from './kratoscore.js';
import * as HF from '../olympus/hero-flat.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, model: null, sel: null, demo: false, forced: false, today: '', column: null, mode: 'flat', ready: false, reason: '' };
const LEVEL = { ok: 'ok', warn: 'warn', bad: 'bad', off: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function readStore() { try { return C.parseStore(localStorage.getItem('journal.v1')); } catch (_) { return { entries: {} }; } }
function nyToday() { try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p; } catch (_) { /* below */ } return new Date().toISOString().slice(0, 10); }

function renderFlat(score) {
  // the painted twin of the 3D column (olympus/hero-flat.js): a fluted bronze column on stepped marble at golden hour, olive marks at 55 and 75
  const svg = $('flat'); clear(svg);
  const P = HF.paint(svg, { w: 200, h: 230, sky: 'golden', horizon: 0.82, sunX: 0.78, sunY: 0.6, templeX: 0.2 });
  const base = 206, top = 24, H = base - top - 24, h = Math.max(3, (score == null ? 0 : score) / 100 * H);
  P.shadow(104, base + 6, 64, 6);
  P.steps(100, base - 14, 68, 3, { stepH: 6, run: 6, band: true });
  const sh = P.column(100, base - 14, h, 40, { mat: 'bronze', cls: 'shaft', capMat: 'gold' });
  sh.setAttribute('rx', 2);
  for (const m of [55, 75]) { const y = base - 14 - m / 100 * H; svg.appendChild(sv('line', { x1: 60, x2: 140, y1: y, y2: y, stroke: '#7f8a52', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' })); P.laurel(150, y, 6, { color: '#7f8a52', leaves: 4 }); }
  P.vignette();
}

function renderHero(d) {
  const sc = d ? d.score : null;
  $('score').textContent = sc == null ? '-' : `${sc} of 100`;
  const pill = $('pill'); pill.textContent = d ? d.label : 'No score'; pill.className = 'pill ' + (d ? LEVEL[d.level] || '' : '');
  $('headline').textContent = C.headline(S.model, d);
  $('dayName').textContent = d ? C.dayWord(d.day) : '';
  renderFlat(sc);
  if (S.column && S.column.ok) S.column.set({ score: sc == null ? 0 : sc });
  const i = d ? S.model.days.indexOf(d) : -1;
  $('prev').disabled = !(i >= 0 && i < S.model.days.length - 1); $('next').disabled = !(i > 0);
}

function renderParts(d) {
  const ul = $('parts'); clear(ul);
  if (!d) { ul.appendChild(h('li', 'part', 'No trades in the last 30 days, so nothing to score. A quiet stretch is normal: the bot waits for a clean setup.')); return; }
  for (const p of d.parts) {
    const li = h('li', 'part'), row = h('div', 'row'); row.appendChild(h('b', '', p.name + (p.est ? ' (estimate)' : '')));
    row.appendChild(h('span', 'pts', `${p.pts} of ${p.max}`)); li.appendChild(row);
    const bar = h('div', 'ag-bar ' + (p.share >= 0.85 ? 'green' : p.share >= 0.55 ? 'amber' : 'red')); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${p.pts} of ${p.max} points`);
    const f = h('i'); f.style.width = Math.max(3, Math.round(p.share * 100)) + '%'; bar.appendChild(f); li.appendChild(bar);
    li.appendChild(h('p', '', p.text)); ul.appendChild(li);
  }
}

function renderSpark(d) {
  const svg = $('spark'); clear(svg);
  const sp = S.model.spark, W = 340, Hh = 96, bw = W / sp.length;
  for (const v of [55, 75]) svg.appendChild(sv('line', { x1: 0, x2: W, y1: Hh - v / 100 * Hh + 6, y2: Hh - v / 100 * Hh + 6, stroke: '#3a3228', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
  sp.forEach((s, i) => {
    const x = i * bw + 2;
    if (s.score == null) { svg.appendChild(sv('rect', { x, y: Hh + 2, width: bw - 4, height: 2, fill: '#3a3228' })); return; }
    const hh = Math.max(3, s.score / 100 * Hh), col = s.score >= 75 ? '#7f8a52' : s.score >= 55 ? '#e0b060' : '#c96a4a';
    svg.appendChild(sv('rect', { x, y: Hh + 6 - hh, width: bw - 4, height: hh, rx: 2, fill: col, opacity: d && d.day === s.day ? 1 : 0.7, stroke: d && d.day === s.day ? '#f3ece0' : 'none', 'stroke-width': 1.5 }));
  });
  const t = $('tiles'); clear(t);
  const tile = (k, v, n, cls) => { const e = h('div', 'tile'); e.appendChild(h('small', '', k)); e.appendChild(h('b', cls || '', v)); e.appendChild(h('span', '', n)); t.appendChild(e); };
  const m = S.model;
  tile('30-day average', m.avg == null ? '-' : String(m.avg), m.n ? `${m.n} day${m.n === 1 ? '' : 's'} scored` : 'no days yet');
  tile('Trades scored', String(m.trades), `from ${C.dayWord(m.from)} to ${C.dayWord(m.to)}`);
  tile('Best day', m.best ? String(m.best.score) : '-', m.best ? C.dayWord(m.best.day) : '');
  tile('Worst day', m.worst ? String(m.worst.score) : '-', m.worst ? C.dayWord(m.worst.day) : '');
}

function dayButton(d, tag) {
  const li = h('li'), b = h('button', 'acard'); b.type = 'button'; b.setAttribute('aria-pressed', S.sel === d.day ? 'true' : 'false'); b.dataset.day = d.day;
  b.appendChild(h('b', '', `${tag ? tag + ': ' : ''}${C.dayWord(d.day)}, ${d.score} of 100`)); b.appendChild(h('span', 'pill ' + (LEVEL[d.level] || ''), d.label));
  b.appendChild(h('small', '', `${d.n} trade${d.n === 1 ? '' : 's'}, the day ${C.both(d.net, d.risk, d.wr)}${d.est ? ' (some parts estimated)' : ''}`));
  b.addEventListener('click', () => { S.sel = d.day; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  li.appendChild(b); return li;
}

function renderLists() {
  const bw = $('bw'); clear(bw); const m = S.model;
  if (m.best) bw.appendChild(dayButton(m.best, 'Best')); if (m.worst && m.worst !== m.best) bw.appendChild(dayButton(m.worst, 'Worst'));
  if (!m.best) bw.appendChild(h('li', 'note', 'No scored day yet.'));
  const dl = $('days'); clear(dl); for (const d of m.days.slice(0, 12)) dl.appendChild(dayButton(d));
  const how = $('how'); clear(how);
  for (const p of C.PARTS) how.appendChild(h('li', '', `${p.name}: ${p.max} points. ${{ plan: 'From your Mnemosyne ratings: followed the plan counts in full, hesitated half, interfered nothing; unrated counts 70%.', stop: 'The loss stayed inside the planned stop (not worse than -1.15R).', size: 'Quantity times the stop distance matched the planned risk, and the risk was not more than 1.5 times the 30-day middle.', flat: 'Out of the trade by 15:55 ET (MFFU closes at 16:10).', hours: 'Entry between 02:00 and 15:30 ET.', nomove: 'Not rated as interfered, and no note about moving the stop.' }[p.key]}`));
}

function render() {
  const d = S.model.days.find((x) => x.day === S.sel) || S.model.latest;
  if (d) S.sel = d.day;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(d); renderParts(d); renderSpark(d); renderLists();
  say(d ? `Kratos: ${C.headline(S.model, d)}` : 'Kratos: no trades to score yet.');
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

// column.js is loaded by its own module tag (columnload.js) so the page still works when three.js or WebGL is missing: wait for it (6 s at most), else keep the flat column
function waitColumn() {
  return new Promise((resolve, reject) => {
    if (window.__kratosColumn) { resolve(window.__kratosColumn); return; }
    const done = (v, e) => { clearTimeout(tm); window.removeEventListener('kratos-column', on); if (e) reject(e); else resolve(v); };
    const on = () => done(window.__kratosColumn);
    const tm = setTimeout(() => done(null, new Error('the 3D column did not load')), 6000);
    window.addEventListener('kratos-column', on);
  });
}
async function startColumn() {
  const canvas = $('stage'), flat = $('flat');
  let T = null;
  try { T = await waitColumn(); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (T) {
    let t = null;
    try { t = T.createColumn(canvas, { reduced }); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
    if (t && t.ok) { S.column = t; S.mode = '3d'; canvas.hidden = false; flat.setAttribute('hidden', ''); const d = S.model.days.find((x) => x.day === S.sel); t.set({ score: d ? d.score : 0 }); document.documentElement.dataset.kratos = '3d'; return; }
    if (t && t.reason) S.reason = t.reason;
  }
  S.mode = 'flat'; canvas.hidden = true; flat.removeAttribute('hidden'); document.documentElement.dataset.kratos = 'flat';
}

function step(dir) {
  const m = S.model, i = m.days.findIndex((x) => x.day === S.sel), j = i + dir;      // days are newest first: Older = +1 index
  if (i >= 0 && j >= 0 && j < m.days.length) { S.sel = m.days[j].day; render(); }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const t0 = /^\d{4}-\d{2}-\d{2}$/.test(q.get('today') || '') ? q.get('today') : nyToday(); S.today = t0;
  const [fx, odeon] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../odeon/trades.json')]);
  S.fixture = fx;
  const store = readStore();
  let trades = C.normTrades(odeon), anchor = C.lastDay(trades, t0) || t0, m = C.build(trades, store, anchor, 30);
  if (S.forced || !m.n) {
    const dm = C.demoTrades(fx, t0); trades = C.normTrades(dm.odeon); anchor = t0;
    m = C.build(trades, dm.store, anchor, 30); S.demo = true;
  }
  S.model = m;
  const dq = q.get('day'); S.sel = dq && m.days.some((x) => x.day === dq) ? dq : m.latest ? m.latest.day : null;
  $('prev').addEventListener('click', () => step(+1)); $('next').addEventListener('click', () => step(-1));
  render();
  await startColumn();
  const d = m.days.find((x) => x.day === S.sel); if (S.column && S.column.ok) S.column.set({ score: d ? d.score : 0 });
  S.ready = true;
}
window.KRATOS = { S, C, ready: () => S.ready, render, get mode() { return S.mode; }, get column() { return S.column; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Kratos could not start'); } catch (_) { /* nothing */ } });
