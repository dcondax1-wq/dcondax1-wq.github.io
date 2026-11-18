// HARMONIA page (ES module): the balance. Reads ../home.json (the accounts) and ../money/index.json (the money machines) and fixture.json (DEMO, never blank). Read only: it sends nothing and keeps nothing.
// Text only through textContent / createElementNS. window.HARMONIA is the test hook. ?demo=1&stop=1 opens a given view.
import * as C from './harmoniacore.js';
import * as HF from '../olympus/hero-flat.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, accts: [], streams: [], conc: null, sc: null, stopped: false, demo: false, forced: false, beam: null, mode: 'flat', ready: false, reason: '' };
const LEVEL = { ok: 'ok', warn: 'warn', bad: 'bad', off: '' };
const RISK_COL = { zlarior: '#c8a24a', atlas: '#4b7a99', blitz: '#7f8a52' };
const DEP = { nq: 'Depends on NQ', kalshi: 'Kalshi, not NQ', none: 'Independent', other: 'Other markets, not NQ' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------------------------------------ pictures
function renderFlat(b) {
  // the painted twin of the 3D balance (olympus/hero-flat.js): golden-hour sky, a fluted marble column, owl-coin weights
  const svg = $('flat'); clear(svg);
  const P = HF.paint(svg, { w: 320, h: 200, sky: 'golden', horizon: 0.86, sunX: 0.84, sunY: 0.5, templeX: 0.12 });
  const cx = 160, cy = 52, half = 112, c = Math.cos(b.tilt), s = Math.sin(b.tilt), lx = cx - half * c, ly = cy - half * s, rx = cx + half * c, ry = cy + half * s, drop = 78;
  P.shadow(160, 190, 70, 5);
  P.steps(160, 176, 70, 2, { stepH: 6, run: 8, band: true });
  P.column(160, 176, 176 - cy - 4, 14, { capMat: 'gold' });
  const pan = (x, y, items, nq) => {
    svg.appendChild(sv('line', { x1: x, y1: y, x2: x - 30, y2: y + drop, stroke: '#9c6b3c', 'stroke-width': 1.5 })); svg.appendChild(sv('line', { x1: x, y1: y, x2: x + 30, y2: y + drop, stroke: '#9c6b3c', 'stroke-width': 1.5 }));
    svg.appendChild(sv('path', { d: `M${x - 40} ${y + drop} Q${x} ${y + drop + 16} ${x + 40} ${y + drop} Z`, fill: P.F.bronze, stroke: '#4a3018', 'stroke-width': 1 }));
    let top = y + drop; const tot = items.reduce((a, i) => a + i.usd, 0) || 1;
    items.filter((i) => i.usd > 0).forEach((i, k) => { const hh = 8 + 20 * Math.sqrt(i.usd / tot), w = 22 + 24 * Math.sqrt(i.usd / tot); top -= hh; svg.appendChild(sv('rect', { x: x - w / 2, y: top, width: w, height: hh - 1, rx: 3, fill: nq ? P.F.gold : P.F.marble, stroke: nq ? '#7a5418' : '#8a7e6c', 'stroke-width': 0.8, class: 'weight' })); for (let q = top + 3; q < top + hh - 2; q += 3) P.el('line', { x1: x - w / 2 + 1, x2: x + w / 2 - 1, y1: q, y2: q, stroke: nq ? '#7a5418' : '#8a7e6c', 'stroke-opacity': 0.4, 'stroke-width': 0.6 }); });
  };
  pan(lx, ly, b.left, true); pan(rx, ry, b.right, false);
  svg.appendChild(sv('line', { x1: lx, y1: ly, x2: rx, y2: ry, stroke: '#9c6b3c', 'stroke-width': 7, 'stroke-linecap': 'round', class: 'beam' }));
  for (const [ex, ey] of [[lx, ly], [rx, ry]]) P.el('circle', { cx: ex, cy: ey, r: 5, fill: P.F.coin });
  svg.appendChild(sv('circle', { cx, cy, r: 9, fill: '#c8a24a', stroke: '#7a5a22', 'stroke-width': 2 }));
  P.vignette();
  svg.appendChild(sv('text', { x: 20, y: 22, 'font-size': 11, fill: '#f4e8d0' }, 'NQ bots'));
  svg.appendChild(sv('text', { x: 300, y: 22, 'font-size': 11, fill: '#f4e8d0', 'text-anchor': 'end' }, 'Everything else'));
}

function renderDonut(slices) {
  const svg = $('donut'); clear(svg);
  const ang = C.sliceAngles(slices, 0.04);
  slices.forEach((s, i) => { const p = sv('path', { d: C.arcPath(100, 100, 58, 92, ang[i].a0, ang[i].a1), fill: RISK_COL[s.key] || '#9c6b3c', class: 'slice' }); p.dataset.key = s.key; svg.appendChild(p); });
  const tot = slices.reduce((a, s) => a + s.usd, 0);
  svg.appendChild(sv('text', { x: 100, y: 96, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#f3ece0' }, C.money(tot)));
  svg.appendChild(sv('text', { x: 100, y: 114, 'text-anchor': 'middle', 'font-size': 11, fill: '#cfc4b2' }, 'max loss, all three'));
}
function renderRiskLegend(slices) {
  const ul = $('riskLegend'); clear(ul);
  for (const s of slices) {
    const li = h('li', 'lg'), sw = h('i'); sw.style.background = RISK_COL[s.key] || '#9c6b3c'; li.appendChild(sw);
    li.appendChild(h('span', '', `${s.name} (${s.bot})`)); li.appendChild(h('span', 'v', `${C.pct(s.share)} of the risk`));
    li.appendChild(h('small', '', `${s.line}. One full stop costs about ${C.money(s.trade)}${s.est ? ' (an estimate)' : ''}.`)); ul.appendChild(li);
  }
}

function renderBars(bars) {
  const svg = $('bars'); clear(svg);
  let x = 0; const W = 320, gap = 3;
  for (const p of bars.parts) {
    const w = Math.max(0, p.share * W - (p.share > 0 ? gap : 0));
    if (p.share > 0) { const r = sv('rect', { x, y: 6, width: w, height: 32, rx: 4, fill: C.COLORS[p.depends] || '#9c6b3c', class: 'part' }); r.dataset.id = p.id; svg.appendChild(r); }
    x += p.share * W;
  }
  if (!bars.total) svg.appendChild(sv('rect', { x: 0, y: 6, width: W, height: 32, rx: 4, fill: '#2b251d' }));
}
function renderIncLegend(streams, bars) {
  const ul = $('incLegend'); clear(ul);
  streams.forEach((s) => {
    const li = h('li', 'lg'), sw = h('i'); sw.style.background = C.COLORS[s.depends] || '#9c6b3c'; li.appendChild(sw);
    li.appendChild(h('span', '', `${s.name}: ${DEP[s.depends]}`)); li.appendChild(h('span', 'v', s.has ? `${C.money(s.base)} a month` : 'no estimate'));
    li.appendChild(h('small', '', `${s.has ? C.rangeText(s.low, s.high) + '. ' : ''}${s.why}${s.status === 'sample' ? ' (example numbers)' : ''}`)); ul.appendChild(li);
  });
  void bars;
}

function renderScenario(sc) {
  $('scText').textContent = sc.text; $('worst').textContent = sc.worst;
  const t = $('tiles'); clear(t);
  const tile = (k, v, n, cls) => { const e = h('div', 'tile'); e.appendChild(h('small', '', k)); e.appendChild(h('b', cls || '', v)); e.appendChild(h('span', '', n)); t.appendChild(e); };
  tile('Today (estimate)', C.money(sc.now.base), C.rangeText(sc.now.low, sc.now.high));
  tile('If the NQ bots stop', C.money(sc.left.base), C.rangeText(sc.left.low, sc.left.high), 'pos');
  tile('What goes away', C.money(sc.lost.base), `${C.pct(1 - sc.keepShare)} of the estimate`, 'neg');
}

function renderHow() {
  const how = $('how'); clear(how);
  for (const l of [
    'The beam leans toward the heavier side. Gold weights are the money machines that are paid only if the NQ bots win; olive weights are the ones that are not.',
    'The ring is the max loss of each account: the money that can be lost if an eval fails. More accounts running the same signals means more money at risk at the same time.',
    'The three accounts trade NQ at the same hours. Copies of one strategy take the same signals, so they win and lose together: five accounts are not five independent chances.',
    '"If the NQ bots stop" removes only what depends on NQ. Mercury and Oikos need no trading; Sibyl and Arbiter are other markets and are paper only.',
    'A low end under zero is a loss. The ranges come from each machine itself: they are what could happen, not what will.',
  ]) how.appendChild(h('li', '', l));
}

function render() {
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  const b = C.beam(S.streams, S.stopped), c = S.conc, sc = S.sc;
  const pill = $('pill'); pill.textContent = S.stopped ? 'NQ bots stopped (what-if)' : { ok: 'Balanced', warn: 'Leaning', bad: 'Leaning hard', off: 'No estimate' }[b.level]; pill.className = 'pill ' + (S.stopped ? 'info' : LEVEL[b.level] || '');
  $('headline').textContent = S.stopped ? `If the NQ bots stop: ${C.money(sc.left.base)} a month is left of ${C.money(sc.now.base)} (${C.rangeText(sc.left.low, sc.left.high)}). Estimates.` : C.headline(c, sc);
  const bt = $('stop'); bt.setAttribute('aria-pressed', S.stopped ? 'true' : 'false'); bt.textContent = S.stopped ? 'Put the NQ bots back' : 'If the NQ bots stop';
  renderFlat(b);
  if (S.beam && S.beam.ok) S.beam.set({ left: b.left, right: b.right, tilt: b.tilt });
  const cp = $('concPill'); cp.textContent = { ok: 'Spread out', warn: 'Leaning on NQ', bad: 'Strong warning', off: 'No estimate' }[c.level]; cp.className = 'pill ' + (LEVEL[c.level] || '');
  $('concTitle').textContent = c.title; $('concText').textContent = c.text; $('concCard').className = 'ag-card card ' + (c.level === 'bad' ? 'alert' : '');
  renderScenario(sc);
  const slices = C.riskSlices(S.accts); renderDonut(slices); renderRiskLegend(slices);
  const bars = C.incomeBars(S.streams); renderBars(bars); renderIncLegend(S.streams, bars);
  renderHow();
  say(S.stopped ? `Harmonia: if the NQ bots stop, about ${C.money(sc.left.base)} a month is left.` : `Harmonia: ${C.headline(c, sc)}`);
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

// beam.js is loaded by its own module tag (beamload.js) so the page still works when three.js or WebGL is missing: wait for it (6 s at most), else keep the flat balance
function waitBeam() {
  return new Promise((resolve, reject) => {
    if (window.__harmoniaBeam) { resolve(window.__harmoniaBeam); return; }
    const done = (v, e) => { clearTimeout(tm); window.removeEventListener('harmonia-beam', on); if (e) reject(e); else resolve(v); };
    const on = () => done(window.__harmoniaBeam);
    const tm = setTimeout(() => done(null, new Error('the 3D balance did not load')), 6000);
    window.addEventListener('harmonia-beam', on);
  });
}
async function startBeam() {
  const canvas = $('stage'), flat = $('flat');
  let T = null;
  try { T = await waitBeam(); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (T) {
    let t = null;
    try { t = T.createBeam(canvas, { reduced }); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
    if (t && t.ok) { S.beam = t; S.mode = '3d'; canvas.hidden = false; flat.setAttribute('hidden', ''); const b = C.beam(S.streams, S.stopped); t.set({ left: b.left, right: b.right, tilt: b.tilt }); document.documentElement.dataset.harmonia = '3d'; return; }
    if (t && t.reason) S.reason = t.reason;
  }
  S.mode = 'flat'; canvas.hidden = true; flat.removeAttribute('hidden'); document.documentElement.dataset.harmonia = 'flat';
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1'; S.stopped = q.get('stop') === '1';
  const [fx, home, money] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../money/index.json')]);
  S.fixture = fx;
  const built = C.buildAccounts(S.forced ? null : home, fx);
  let streams = C.streamsOf(money);
  const haveMoney = streams.some((s) => s.has);
  if (S.forced || !haveMoney) streams = C.streamsOf(fx && fx.money);
  S.accts = built.accounts; S.streams = streams; S.demo = S.forced || built.demo || !haveMoney;
  S.conc = C.concentration(S.streams, S.accts); S.sc = C.scenario(S.streams);
  $('stop').addEventListener('click', () => { S.stopped = !S.stopped; render(); });
  render();
  await startBeam();
  S.ready = true;
}
window.HARMONIA = { S, C, ready: () => S.ready, render, get mode() { return S.mode; }, get beam() { return S.beam; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Harmonia could not start'); } catch (_) { /* nothing */ } });
