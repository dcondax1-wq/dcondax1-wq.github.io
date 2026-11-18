// ARBITER page (ES module): money machine #5, a paper-only spread and funding finder. Reads ../money/arbiter.json (from tools/money/arbiter.py) and its own fixture.json (DEMO, never blank).
// Two marble balance scales weigh the chosen idea: what it earns against what it costs, and its yearly return against the bar. A paper tracker keeps hypothetical positions in this browser only.
// Read only: it sends nothing, trades nothing, asks for no key. Text only through textContent. window.ARBITER is the test hook. ?demo=1 forces the sample; ?kind=funding|peg|venues filters.
import * as C from './arbitercore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const KEY = 'arbiter.paper.v1';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); if (parent) parent.appendChild(e); return e; }
const S = { data: null, kind: 'all', pick: 0, pos: [], mem: null, ready: false, now: Date.now(), tilt: { a: 0, b: 0 }, raf: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || (O && O.lite && O.lite()); } catch (_) { return false; } };

// ---- paper positions: this browser only; if storage is blocked they live in memory for the visit ----
function loadPos() { try { const raw = localStorage.getItem(KEY); return C.cleanPositions(raw ? JSON.parse(raw) : []); } catch (_) { return S.mem ? C.cleanPositions(S.mem) : []; } }
function savePos() { S.mem = S.pos; try { localStorage.setItem(KEY, JSON.stringify(S.pos)); } catch (_) { /* memory copy keeps it for this visit */ } }

// ---- the scales (light pseudo-3D: marble gradients, a soft floor shadow, a gentle tilt of the whole frame) ----
function defs(svg) {
  const d = sv('defs', {}, svg);
  const lg = (id, stops, x2, y2) => { const g = sv('linearGradient', { id, x1: 0, y1: 0, x2: x2 == null ? 1 : x2, y2: y2 == null ? 0 : y2 }, d); stops.forEach(([o, c]) => sv('stop', { offset: o, 'stop-color': c }, g)); };
  lg('mb', [[0, '#9a8f7d'], [0.35, '#f3ece0'], [1, '#b8ad9a']]);
  lg('mbh', [[0, '#f3ece0'], [1, '#b8ad9a']], 0, 1);
  lg('gd', [[0, '#e8c46e'], [0.5, '#c8a24a'], [1, '#8a6a2c']], 0, 1);
  lg('bz', [[0, '#b98550'], [1, '#6e4a26']], 0, 1);
}
function coinStack(g, x, y, n, fill) {
  for (let i = 0; i < n; i++) { const cy = y - i * 5; sv('rect', { x: x - 10, y: cy - 4, width: 20, height: 5, fill: '#6e4a26' }, g); sv('ellipse', { cx: x, cy: cy - 4, rx: 10, ry: 3.4, fill, stroke: '#6e4a26', 'stroke-width': 0.6 }, g); }
}
function drawScale(svg, cx, title, spec, geoNow, geoEnd) {
  const g = sv('g', {}, svg), cy = 78, half = 60, hang = 54;
  sv('ellipse', { cx, cy: 206, rx: 58, ry: 8, fill: '#000', opacity: 0.28 }, g);
  sv('rect', { x: cx - 36, y: 196, width: 72, height: 12, rx: 3, fill: 'url(#mbh)' }, g);
  sv('rect', { x: cx - 25, y: 186, width: 50, height: 11, rx: 3, fill: 'url(#mbh)' }, g);
  sv('rect', { x: cx - 5, y: cy, width: 10, height: 108, fill: 'url(#mb)' }, g);
  const t = sv('text', { x: cx, y: 16, 'text-anchor': 'middle', class: 'ttl' }, g); t.textContent = title;
  sv('line', { x1: geoNow.left.x, y1: geoNow.left.y, x2: geoNow.right.x, y2: geoNow.right.y, stroke: '#9c6b3c', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
  sv('circle', { cx, cy, r: 7, fill: 'url(#gd)', stroke: '#6e4a26', 'stroke-width': 0.8 }, g);
  [['left', geoNow.left, geoEnd.coinsL, 'url(#gd)'], ['right', geoNow.right, geoEnd.coinsR, 'url(#bz)']].forEach(([side, p, n, fill]) => {
    const py = p.y + hang;
    sv('line', { x1: p.x, y1: p.y, x2: p.x - 24, y2: py - 2, stroke: '#9a8f7d', 'stroke-width': 1 }, g); sv('line', { x1: p.x, y1: p.y, x2: p.x + 24, y2: py - 2, stroke: '#9a8f7d', 'stroke-width': 1 }, g);
    sv('ellipse', { cx: p.x, cy: py + 12, rx: 22, ry: 5, fill: '#000', opacity: 0.2 }, g);
    sv('path', { d: `M${p.x - 26} ${py - 2} Q${p.x} ${py + 22} ${p.x + 26} ${py - 2} Z`, fill: 'url(#bz)', stroke: '#6e4a26', 'stroke-width': 0.8 }, g);
    const a = Math.min(n, 4), b = Math.max(0, n - 4);
    if (a) coinStack(g, p.x - (b ? 8 : 0), py - 3, a, fill); if (b) coinStack(g, p.x + 9, py - 3, b, fill);
    sv('circle', { cx: p.x, cy: p.y, r: 3, fill: 'url(#gd)' }, g);
  });
  const l1 = sv('text', { x: cx - 72, y: 228, 'text-anchor': 'start' }, g); l1.textContent = spec.labelL;
  const l2 = sv('text', { x: cx + 72, y: 228, 'text-anchor': 'end' }, g); l2.textContent = spec.labelR;
}
function paintScales(ta, tb) {
  const box = $('scales'); clear(box);
  const sc = C.scalesFor(S.sel);
  const svg = sv('svg', { viewBox: '0 0 360 236', role: 'presentation', focusable: 'false' }, box); defs(svg);
  svg.dataset.angleA = String(Math.round(S.geo.a.angle * 10) / 10); svg.dataset.angleB = String(Math.round(S.geo.b.angle * 10) / 10);
  svg.dataset.coins = `${S.geo.a.coinsL},${S.geo.a.coinsR},${S.geo.b.coinsL},${S.geo.b.coinsR}`;
  if (!sc) { const t = sv('text', { x: 180, y: 118, 'text-anchor': 'middle' }, svg); t.textContent = 'No idea to weigh yet.'; return; }
  drawScale(svg, 92, sc.a.title, sc.a, { ...S.geo.a, ...C.beamPoints(ta, 92, 78, 60) }, S.geo.a);
  drawScale(svg, 268, sc.b.title, sc.b, { ...S.geo.b, ...C.beamPoints(tb, 268, 78, 60) }, S.geo.b);
}
function swing() {
  cancelAnimationFrame(S.raf);
  const to = { a: S.geo.a.angle, b: S.geo.b.angle }, from = { ...S.tilt };
  if (reduced() || (Math.abs(to.a - from.a) < 0.05 && Math.abs(to.b - from.b) < 0.05)) { S.tilt = to; paintScales(to.a, to.b); return; }
  const t0 = performance.now(), dur = 520;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    S.tilt = { a: from.a + (to.a - from.a) * e, b: from.b + (to.b - from.b) * e }; paintScales(S.tilt.a, S.tilt.b);
    if (k < 1) S.raf = requestAnimationFrame(step);
  };
  S.raf = requestAnimationFrame(step);
}

// ---- the page ----
function shown() { return C.filterItems(S.data.items, S.kind); }
function renderTop() {
  const d = S.data;
  $('demo').hidden = !d.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  const stale = d.status !== 'sample' && Number.isFinite(Date.parse(d.asof)) && S.now - Date.parse(d.asof) > 36 * 3600000;
  const pill = $('statusPill'); pill.textContent = d.status === 'sample' ? 'Sample data' : stale ? 'Old scan' : 'Live scan'; pill.className = 'pill ' + (d.status === 'sample' ? 'info' : stale ? 'warn' : 'ok');
  $('headline').textContent = d.headline;
  $('asof').textContent = d.status === 'sample' ? `${d.note || 'EXAMPLE numbers, not real.'} Scan time shown: ${C.ago(d.asof, S.now)}.` : `Scanned ${C.ago(d.asof, S.now)}. Public data only.`;
}
function renderKinds() {
  const k = $('kinds'); clear(k);
  const opts = [['all', 'All', S.data.items.length], ...C.KIND_ORDER.map((x) => [x, C.KINDS[x], S.data.items.filter((i) => i.kind === x).length])];
  for (const [key, name, n] of opts) {
    const b = h('button', 'ag-chip', `${name} ${n}`); b.type = 'button'; b.dataset.kind = key; b.setAttribute('aria-pressed', key === S.kind ? 'true' : 'false');
    b.addEventListener('click', () => { S.kind = key; S.pick = 0; render(); }); k.appendChild(b);
  }
}
function renderList() {
  const box = $('list'); clear(box); const items = shown();
  if (!items.length) { box.appendChild(h('p', 'empty', S.data.items.length ? 'No idea of this kind beats its costs right now.' : 'Nothing beats its costs right now. That is a normal answer: most spreads are eaten by fees.')); return; }
  items.forEach((it, i) => {
    const b = h('button', 'idea'); b.type = 'button'; b.dataset.i = String(i); b.setAttribute('aria-pressed', i === S.pick ? 'true' : 'false');
    b.setAttribute('aria-label', `${it.title}. ${C.aprText(it.net_apr)} after costs, about ${C.money(it.usd)} a month on ${C.money(it.capital_usd)}. ${C.riskWord(it.risk)}.`);
    b.appendChild(h('span', 't', it.title)); b.appendChild(h('span', 'n', C.aprText(it.net_apr)));
    b.appendChild(h('span', 'm', `${C.riskWord(it.risk)} · score ${it.score} of 100`)); b.appendChild(h('span', 'm2', `~${C.money(it.usd)} a month`));
    b.addEventListener('click', () => { S.pick = i; render(); }); box.appendChild(b);
  });
}
function renderSel() {
  const it = S.sel;
  const none = !it;
  $('selCard').hidden = none;
  if (none) return;
  $('selTitle').textContent = it.title; $('selDetail').textContent = it.detail;
  const pill = $('selPill'); pill.textContent = C.riskWord(it.risk); pill.className = 'pill ' + { low: 'ok', med: 'warn', high: 'bad' }[it.risk];
  const tiles = $('selTiles'); clear(tiles);
  const tile = (k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); tiles.appendChild(t); };
  tile('Net a year', C.aprText(it.net_apr), 'estimate, after costs', C.beats(it) ? 'pos' : 'neg');
  tile('Net a month', `~${C.money(it.usd)}`, `on ${C.money(it.capital_usd)} (estimate)`, it.usd >= 0 ? 'pos' : 'neg');
  tile('Risk score', `${it.risk_score} of 100`, `${C.riskWord(it.risk)}, higher is riskier`);
  const kv = $('selKv'); clear(kv);
  const row = (k, v, cls) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', cls || '', v)); };
  row('Gross yield before costs', C.aprText(it.gross_apr)); row('Fees and slippage', `${C.pct(it.cost_pct, 2)} (${C.money2(it.cost_usd)})`);
  row('Money is locked for', C.daysText(it.hold_days)); row('Net after costs', C.aprText(it.net_apr), C.beats(it) ? 'pos' : 'neg');
  row('The bar to beat', C.aprText(it.hurdle_apr)); row('Left on an exchange or venue', `${C.money(it.exposed_usd)} (all of it could be lost)`, 'neg');
  $('selWhy').textContent = it.why; $('selWarn').textContent = it.warning;
  const open = S.pos.some((p) => p.title === it.title), b = $('openBtn');
  b.textContent = open ? 'Already open on paper' : `Open a ${C.money(C.TRACK_CAPITAL)} paper position`; b.disabled = open || S.pos.length >= C.MAX_POSITIONS;
}
function renderPos() {
  const box = $('pos'); clear(box);
  const t = C.totals(S.pos, S.data.items, S.now);
  $('trPill').textContent = String(S.pos.length); $('trPill').className = 'pill ' + (t.net > 0 ? 'ok' : t.net < 0 ? 'warn' : '');
  if (!S.pos.length) { box.appendChild(h('p', 'empty', 'No paper positions yet. Pick an idea above and open one to watch what it would have done.')); $('trNote').textContent = ''; return; }
  S.pos.forEach((p, i) => {
    const m = C.markPosition(p, S.data.items, S.now), r = h('div', 'posrow ' + m.state);
    r.appendChild(h('div', 't', p.title));
    const line = h('div', 'r'); line.appendChild(h('b', m.net >= 0 ? 'pos' : 'neg', `${C.moneyS(m.net)} so far`)); line.appendChild(h('span', 'm', `${C.daysText(m.days)} of ${C.daysText(p.hold_days)} on ${C.money(p.capital)}`)); r.appendChild(line);
    r.appendChild(h('div', 'm', `${m.words} Left on an exchange: ${C.money(p.exposed)}.`));
    const b = h('button', 'btn', 'Close on paper'); b.type = 'button'; b.setAttribute('aria-label', `Close the paper position: ${p.title}`);
    b.addEventListener('click', () => { S.pos.splice(i, 1); savePos(); say('Paper position closed.'); render(); }); r.appendChild(b); box.appendChild(r);
  });
  $('trNote').textContent = `All paper positions together: ${C.moneyS(t.net)} (estimate), ${C.money(t.exposed)} that would sit on exchanges.`;
}
function render() {
  const d = S.data, items = shown();
  S.pick = Math.min(S.pick, Math.max(0, items.length - 1)); S.sel = items[S.pick] || null;
  const sc = C.scalesFor(S.sel);
  S.geo = sc ? { a: C.scaleGeo(sc.a.left, sc.a.right, 92, 78, 60), b: C.scaleGeo(sc.b.left, sc.b.right, 268, 78, 60) } : { a: C.scaleGeo(0, 0, 92, 78, 60), b: C.scaleGeo(0, 0, 268, 78, 60) };
  renderTop(); renderKinds(); renderList(); renderSel(); renderPos();
  $('scaleA').textContent = sc ? sc.a.line : ''; $('scaleB').textContent = sc ? sc.b.line : '';
  const nl = $('notes'); clear(nl); for (const n of d.notes) nl.appendChild(h('li', '', n));
  swing();
  say(S.sel ? `${S.sel.title}: ${C.aprText(S.sel.net_apr)} after costs, ${C.riskWord(S.sel.risk)}. Paper only.` : 'Nothing beats its costs right now. Paper only.');
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  const [fx, live] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../money/arbiter.json')]);
  const liveOk = live && Array.isArray(live.items);
  S.data = C.clean(liveOk ? live : fx);
  if (!liveOk && !S.data.items.length) S.data = C.clean({ status: 'sample', headline: { text: 'The sample could not be loaded.' }, items: [], notes: ['Nothing is shown, and nothing was fetched from anywhere else.'] });
  if (!liveOk) { S.data.demo = true; }
  const k = q.get('kind'); if (k && C.KIND_ORDER.includes(k)) S.kind = k;
  S.pos = loadPos(); S.now = Date.now();
  $('openBtn').addEventListener('click', () => {
    if (!S.sel || S.pos.some((p) => p.title === S.sel.title) || S.pos.length >= C.MAX_POSITIONS) return;
    S.pos.push(C.newPosition(S.sel, Date.now(), C.TRACK_CAPITAL)); savePos(); S.now = Date.now(); say('Paper position opened. No money moved.'); render();
  });
  render();
  setInterval(() => { S.now = Date.now(); renderPos(); }, 60000);
}
window.ARBITER = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Arbiter could not start'); } catch (_) { /* nothing */ } });
