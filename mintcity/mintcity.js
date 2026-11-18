// MINT CITY page (ES module): the money machines as a marble city. Reads ../money/index.json (tools/money_engine.py) and fixture.json (DEMO when the site has no index yet).
// Read only and paper only: it sends nothing and keeps nothing on the phone. Text only through textContent / createElementNS. The 3D city is mintcityscene.js (optional, a separate module);
// the 2D map and the list of five districts are always drawn first, so the page is never blank. A tap on a district selects it (the camera flies there); its "Open" button opens the app. window.MINTCITY is the test hook.
import * as C from './mintcitycore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, index: null, demo: false, forced: false, streams: [], total: null, plan: null, sel: null, scene: '2d', ready: false, tier: 'high', tour: null };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function model() {
  const idx = !S.forced && S.index && Array.isArray(S.index.streams) && S.index.streams.length ? S.index : null;
  S.demo = !idx;
  S.streams = C.streamsFrom(idx || S.fixture);
  S.total = C.combine(S.streams);
  S.heights = C.heights(S.streams);
  S.plan = C.cityPlan(S.streams, S.tier);
}

function renderHero() {
  const t = S.total;
  $('heroBase').textContent = t.n ? C.money(t.base) : '-';
  $('heroText').textContent = t.text; $('heroWhy').textContent = t.why;
  const p = $('heroPill'); p.textContent = t.allSample ? 'Example estimate' : 'Estimate'; p.className = 'pill ' + (t.allSample ? 'info' : 'ok');
}

function renderMap() {
  const svg = $('map'); clear(svg);
  const cx = 180, cy = 150, R = 100, maxBar = 70;
  svg.appendChild(sv('ellipse', { cx, cy: cy + 18, rx: 165, ry: 120, fill: '#cfc4b2', opacity: 0.16 }));
  const ph = 14 + ((C.pillarHeight(S.total.base) - 6) / 24) * 46;
  svg.appendChild(sv('rect', { x: cx - 7, y: cy + 10 - ph, width: 14, height: ph, fill: '#c8a24a', rx: 2 })); svg.appendChild(sv('circle', { cx, cy: cy + 4 - ph, r: 6, fill: '#e0b060' }));
  svg.appendChild(sv('text', { x: cx, y: cy + 28, 'text-anchor': 'middle', fill: '#e0b060', 'font-size': 10.5, 'font-weight': 700 }, 'Golden pillar'));
  S.streams.forEach((s, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * R * 1.35, y = cy + Math.sin(a) * R * 0.85, hh = 10 + ((S.heights[i] - C.MIN_H) / (C.MAX_H - C.MIN_H)) * maxBar;
    const g = sv('g', { 'data-id': s.id, role: 'button', tabindex: '0', 'aria-label': `${s.name}: ${s.place}. ${s.base == null ? 'no estimate' : C.money(s.base) + ' a month, an estimate'}. Tap to select.` });
    g.appendChild(sv('rect', { x: x - 33, y: y - 36, width: 66, height: 74, fill: 'transparent' }));
    g.appendChild(sv('rect', { x: x - 14, y: y + 14 - hh, width: 28, height: hh, fill: s.accent, rx: 3, opacity: s.status === 'sample' ? 0.8 : 1 }));
    g.appendChild(sv('rect', { x: x - 18, y: y + 12, width: 36, height: 5, fill: '#cfc4b2', rx: 2 }));
    g.appendChild(sv('text', { x, y: y + 31, 'text-anchor': 'middle', fill: '#f3ece0', 'font-size': 11, 'font-weight': 700 }, s.name));
    g.addEventListener('click', () => select(s.id)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); } });
    svg.appendChild(g);
  });
}

function renderChips() {
  const box = $('chips'); clear(box);
  const mk = (label, id, fn, on) => { const b = h('button', 'btn chip', label); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', fn); return b; };
  if (S.scene === 'webgl') {
    box.appendChild(mk('Overview', 'overview', () => { S.sel = null; S.tour = null; window.MINTCITY3D.flyTo(C.OVERVIEW, 1000); render(false); }, !S.sel && !S.tour));
    box.appendChild(mk('Fly through', 'fly', () => { S.sel = null; S.tour = 'fly'; window.MINTCITY3D.tour('fly'); render(false); say('Flying through the five districts. Drag to take over.'); }, S.tour === 'fly'));
    box.appendChild(mk('Golden pillar', 'pillar', () => { S.sel = null; S.tour = 'pillar'; window.MINTCITY3D.tour('pillar'); render(false); say('Circling the golden pillar: it is as tall as the combined estimate.'); }, S.tour === 'pillar'));
  }
  for (const s of S.streams) box.appendChild(mk(s.name, s.id, () => select(s.id), S.sel === s.id));
}

function renderSheet() {
  const sh = $('sheet'), s = S.streams.find((x) => x.id === S.sel);
  sh.hidden = !s;
  if (!s) return;
  $('shName').textContent = `${s.name}: ${s.place}`; $('shRole').textContent = s.role; $('shHead').textContent = s.headline;
  const kv = $('shKv'); clear(kv); const row = (k, v) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', '', v)); };
  row('Estimate', s.base == null ? 'no number yet' : C.money(s.base) + ' a month'); row('Could be', C.rangeText(s.low, s.high)); row('Data', `${s.statusText}, ${s.status === 'sample' && s.age == null ? 'example file' : C.ageText(s.age)}`);
  const a = $('shOpen'); a.textContent = `Open ${s.name}`; a.setAttribute('href', s.href); a.setAttribute('aria-label', `Open the ${s.name} app`);
}

function renderList() {
  const ul = $('list'); clear(ul);
  S.streams.forEach((s, i) => {
    const li = h('li'), left = h('div'); left.appendChild(h('b', '', s.name)); left.appendChild(h('span', 'note', `${s.place} · ${s.statusText}`));
    const right = h('div', 'rt'); right.appendChild(h('b', 'ag-num', s.base == null ? 'no estimate' : C.money(s.base))); const a = h('a', 'btn', 'Open'); a.setAttribute('href', s.href); a.setAttribute('aria-label', `Open the ${s.name} app`); right.appendChild(a);
    li.append(left, right); ul.appendChild(li);
  });
}

function select(id) {
  S.sel = id; S.tour = null;
  const i = C.IDS.indexOf(id);
  if (S.scene === 'webgl' && window.MINTCITY3D && i >= 0) window.MINTCITY3D.flyTo(C.focusPose(i, 5), 1100);
  render(false);
  const s = S.streams.find((x) => x.id === id);
  if (s) say(`${s.name}, ${s.place}. ${s.base == null ? 'No estimate yet.' : C.money(s.base) + ' a month, an estimate.'} Use the Open button to open the app.`);
}

function render(full) {
  if (full !== false) { model(); }
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderMap(); renderChips(); renderSheet(); renderList();
  $('mapWrap').style.visibility = S.scene === 'webgl' ? 'hidden' : 'visible';
  if (full !== false) { say(`${S.total.text} ${S.total.why}`); S.ready = true; try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ } tryScene(); if (S.scene === 'webgl' && window.MINTCITY3D) window.MINTCITY3D.setPlan(S.plan); }
}

let tried = false;
function tryScene() {
  if (tried || !S.ready || S.scene === 'webgl') return;
  const M = window.MINTCITY3D;
  if (!M) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  if (lite || new URLSearchParams(location.search).get('flat') === '1') return;
  tried = true;
  try {
    if (M.mount($('scene3d'), S.plan, { tier: S.tier, onPick: select })) { S.scene = 'webgl'; $('scene3d').hidden = false; render(false); if (S.sel) select(S.sel); }
  } catch (_) { S.scene = '2d'; }
}
window.addEventListener('mintcity3d', tryScene);

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  if (C.IDS.includes(q.get('district'))) S.sel = q.get('district');
  S.tier = q.get('q') === 'low' ? 'low' : (navigator.hardwareConcurrency || 4) <= 4 ? 'mid' : 'high';
  const [fx, idx] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../money/index.json')]);
  S.fixture = fx; S.index = idx;
  render();
  if (S.sel) renderSheet();
  setInterval(() => { if (!document.hidden && !S.forced) getJSON('../money/index.json').then((i) => { if (i) { S.index = i; render(); } }); }, 300000);
}
window.MINTCITY = { S, C, ready: () => S.ready, render, select };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Mint City could not start'); } catch (_) { /* nothing */ } });
