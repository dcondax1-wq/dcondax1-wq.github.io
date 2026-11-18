// MINT page (ES module): the money machine hub. Reads ../money/index.json (tools/money_engine.py) and fixture.json (DEMO when the site has no index yet).
// Read only and paper only: it sends nothing. The only thing it keeps on the phone is the estimate history (localStorage, this phone only).
// Text only through textContent / createElementNS. The 3D pillars come from mintscene.js (optional); the 2D pillars below are always drawn first. window.MINT is the test hook.
import * as C from './mintcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, index: null, demo: false, forced: false, streams: [], total: null, open: {}, hist: [], scene: '2d', ready: false, now: Date.now() };
const HKEY = 'mint.hist.v1';

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------------------------------------ the history (this phone only)
function loadHist() { try { const v = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function saveHist(v) { try { localStorage.setItem(HKEY, JSON.stringify(v)); } catch (_) { /* private window: the page works without it */ } }

// ------------------------------------------------------------------------------------------------ the model
function model() {
  S.now = Date.now();
  const idx = !S.forced && S.index && Array.isArray(S.index.streams) && S.index.streams.length ? S.index : null;
  S.demo = !idx;
  S.streams = C.streamsFrom(idx || S.fixture, S.now);
  S.total = C.combine(S.streams);
  S.todo = C.todo(S.streams, 3);
  S.pillars = C.pillars(S.streams);
  return S;
}

// ------------------------------------------------------------------------------------------------ the page
function renderHero() {
  const t = S.total;
  $('heroBase').textContent = t.n ? C.money(t.base) : '-';
  $('heroText').textContent = t.text; $('heroWhy').textContent = t.why;
  const p = $('heroPill'); p.textContent = t.allSample ? 'Example estimate' : 'Estimate'; p.className = 'pill ' + t.tone;
  const lo = $('rngLo'), bar = C.rangeBar(t.low, t.base, t.high);
  lo.textContent = t.low < 0 ? `${C.money(t.low)} (a loss)` : C.money(t.low); lo.className = t.low < 0 ? 'neg' : ''; $('rngHi').textContent = C.money(t.high);
  $('rngFill').style.left = bar.left + '%'; $('rngFill').style.width = bar.width + '%'; $('rngFill').className = bar.neg ? 'neg' : '';
  $('rngMark').style.left = `calc(${bar.mark}% - 1px)`;
  const z = $('rngZero'); z.hidden = bar.zero == null; if (bar.zero != null) z.style.left = `calc(${bar.zero}% - 1px)`;
  $('rngWorst').textContent = C.worstText(t.low); $('rngWorst').className = 'note' + (t.low < 0 ? ' neg' : '');
  $('rng').setAttribute('aria-label', `Estimate ${C.money(t.base)} a month, ${t.low < 0 ? 'worst case a loss of ' + C.money(-t.low) + ' a month' : 'range ' + C.rangeText(t.low, t.high)}`);
}

function renderFallback() {
  const svg = $('fallback'); clear(svg);
  const W = 360, base = 168, maxH = 128, w = 38, gap = (W - 5 * w) / 6;
  svg.appendChild(sv('rect', { x: 14, y: base, width: W - 28, height: 8, rx: 3, fill: '#cfc4b2' }));
  svg.appendChild(sv('rect', { x: 26, y: base + 8, width: W - 52, height: 6, rx: 3, fill: '#9a8f7d' }));
  S.pillars.forEach((p, i) => {
    const x = gap + i * (w + gap), hh = 14 + p.h * maxH, y = base - hh, fill = p.status === 'ok' ? '#c8a24a' : p.status === 'stale' ? '#9c6b3c' : '#b39345';
    svg.appendChild(sv('rect', { x: x + 4, y, width: w - 8, height: hh, fill, rx: 2 }));
    svg.appendChild(sv('rect', { x: x + 11, y, width: 2, height: hh, fill: '#e0c880', opacity: 0.45 }));
    svg.appendChild(sv('rect', { x, y: y - 6, width: w, height: 7, rx: 2, fill: '#e0b060' }));
    svg.appendChild(sv('rect', { x: x + 2, y: base - 5, width: w - 4, height: 6, rx: 1, fill: '#9c6b3c' }));
    svg.appendChild(sv('text', { x: x + w / 2, y: y - 12, 'text-anchor': 'middle', fill: '#f3ece0', 'font-size': 11, 'font-weight': 700 }, p.usd == null ? '-' : C.money(p.usd)));
    svg.appendChild(sv('text', { x: x + w / 2, y: base + 28, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 10.5 }, p.name));
  });
}

function renderScene() {
  renderFallback();
  const lg = $('legend'); clear(lg);
  for (const p of S.pillars) { const li = h('li'); li.appendChild(h('span', '', p.name)); li.appendChild(h('b', '', p.usd == null ? 'no estimate' : C.money(p.usd))); lg.appendChild(li); }
  $('scene').setAttribute('aria-label', 'Five golden pillars, taller means a bigger estimate: ' + S.pillars.map((p) => `${p.name} ${p.usd == null ? 'none' : C.money(p.usd)}`).join(', '));
  $('sceneNote').textContent = S.scene === 'webgl' ? 'Height is the estimated dollars a month for each stream. The view turns slowly by itself.' : 'Height is the estimated dollars a month for each stream.';
  if (S.scene === 'webgl' && window.MINT3D) try { window.MINT3D.update(S.pillars); } catch (_) { /* keep the picture */ }
}

function renderTodo() {
  const ol = $('todo'); clear(ol);
  for (const t of S.todo) {
    const li = h('li'), d = h('div');
    d.appendChild(h('b', '', t.title)); d.appendChild(h('span', '', t.why));
    const bits = [];
    if (t.usd) bits.push(`about ${C.money(t.usd)} (estimate)`);
    if (t.kind === 'task') bits.push(`${t.risk === 'med' ? 'medium' : t.risk} risk`);
    if (t.sample) bits.push('example');
    if (bits.length) d.appendChild(h('em', '', bits.join(' · ')));
    li.appendChild(d); ol.appendChild(li);
  }
}

function streamCard(s) {
  const card = h('article', 'ag-card card stream'); card.dataset.id = s.id;
  const top = h('div', 'top2'), t = h('div');
  t.appendChild(h('h3', '', s.name)); t.appendChild(h('p', 'note', s.role));
  const st = C.STATUS[s.status] || C.STATUS.none;
  top.append(t, h('span', 'pill ' + st.tone, st.label)); card.appendChild(top);
  const amt = h('p', 'amt'); amt.appendChild(document.createTextNode(s.base == null ? 'No estimate' : C.money(s.base)));
  if (s.base != null) amt.appendChild(h('small', '', ' a month (estimate)'));
  card.appendChild(amt);
  card.appendChild(h('p', 'lead', s.headline));
  const kv = h('dl', 'kv'); const row = (k, v) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', '', v)); };
  row('Could be', C.rangeText(s.low, s.high)); row('Updated', s.status === 'sample' && s.age == null ? 'example file' : C.ageText(s.age));
  card.appendChild(kv);
  const more = h('div', 'more'); more.id = 'more-' + s.id; more.hidden = !S.open[s.id];
  if (s.items.length) { const ul = h('ul', 'items'); for (const i of s.items) { const li = h('li'); li.appendChild(h('b', '', i.title)); li.appendChild(h('div', '', i.detail + (i.usd ? ` About ${C.money(i.usd)} (estimate), ${i.risk === 'med' ? 'medium' : i.risk} risk.` : ` ${i.risk === 'med' ? 'Medium' : i.risk === 'low' ? 'Low' : 'High'} risk.`))); ul.appendChild(li); } more.appendChild(ul); }
  else more.appendChild(h('p', 'note', 'Nothing found yet.'));
  if (s.notes.length || s.error) { const ul = h('ul', 'plain'); for (const n of s.notes) ul.appendChild(h('li', '', n)); if (s.error) ul.appendChild(h('li', '', 'Why the data is not live: ' + s.error + '.')); more.appendChild(ul); }
  card.appendChild(more);
  const b = h('button', 'btn', S.open[s.id] ? 'Hide details' : 'Details'); b.type = 'button'; b.setAttribute('aria-expanded', S.open[s.id] ? 'true' : 'false'); b.setAttribute('aria-controls', more.id);
  b.addEventListener('click', () => { S.open[s.id] = !S.open[s.id]; renderStreams(); });
  card.appendChild(b);
  return card;
}
function renderStreams() { const box = $('streams'); clear(box); for (const s of S.streams) box.appendChild(streamCard(s)); }

function renderHist() {
  const svg = $('spark'); clear(svg);
  const d = C.sparkPath(S.hist, 320, 70);
  svg.appendChild(sv('line', { x1: 2, x2: 318, y1: 66, y2: 66, stroke: '#3a3228', 'stroke-width': 1 }));
  if (d) svg.appendChild(sv('path', { d }));
  $('histNote').textContent = S.total.allSample ? 'Example numbers are not saved. The line starts when real streams report.' : C.histText(S.hist);
  svg.setAttribute('aria-label', C.histText(S.hist));
}

function remember() {
  if (S.total.allSample || !S.total.n) { S.hist = loadHist(); return; }
  S.hist = C.pushPoint(loadHist(), S.now, Math.round(S.total.base));
  saveHist(S.hist);
}

function render() {
  model();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  remember();
  renderHero(); renderScene(); renderTodo(); renderStreams(); renderHist();
  say(`${S.total.text} ${S.total.why}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  tryScene();
}

// ------------------------------------------------------------------------------------------------ the optional 3D pillars
let tried = false;
function tryScene() {
  if (tried || !S.ready || S.scene === 'webgl') return;
  const M = window.MINT3D;
  if (!M) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  const q = new URLSearchParams(location.search);
  if (lite || q.get('flat') === '1') return;
  tried = true;
  try {
    if (M.mount($('scene3d'), S.pillars)) { S.scene = 'webgl'; $('scene3d').hidden = false; $('fallback').style.visibility = 'hidden'; renderScene(); }
  } catch (_) { S.scene = '2d'; }
}
window.addEventListener('mint3d', tryScene);

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, idx] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../money/index.json')]);
  S.fixture = fx; S.index = idx;
  render();
  setInterval(() => { if (!document.hidden) getJSON('../money/index.json').then((i) => { if (i && !S.forced) { S.index = i; render(); } }); }, 300000);
  const A = window.AGORA;                       // pull down = read the money files again (olympus/agora-ui.js); the demo says so honestly
  if (A && A.pull) A.pull(() => S.forced ? Promise.resolve(A.toast && A.toast('Example numbers: nothing to refresh')) : getJSON('../money/index.json').then((i) => { if (i) { S.index = i; render(); } if (A.toast) A.toast(i ? 'Up to date' : 'Could not read the money files'); }));
}
window.MINT = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Mint could not start'); } catch (_) { /* nothing */ } });
