// KRONOS page (ES module): the calendar of money. Reads the site's odeon/trades.json (real and paper trades; the backtest on request) or fixture.json (DEMO, never blank): a month grid of daily P&L, the best and worst
// weekday and hour in $ with n, what a normal bad week looks like (honest percentiles with n), and a marble sundial whose shadow is today's P&L against a typical day. Read only: it sends nothing and keeps nothing.
// Text only through textContent / createElementNS. window.KRONOS is the test hook. The 3D dial (kronosdial.js) is a pure extra; without WebGL the same dial is drawn flat.
import * as C from './kronoscore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const S = { data: null, fixture: null, set: 'live', fell: false, v: null, today: '', ym: '', hour: 12, dial: null, flat: false, ready: false };
const RM = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const tile = (box, k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); if (n) t.appendChild(h('span', '', n)); box.appendChild(t); };
const trades = (set) => C.normTrades(S.data.json, set);

function compute() { S.v = C.view(trades(S.set), S.today); }

function renderHero() {
  const v = S.v, d = S.data.demo;
  $('head').textContent = (d ? 'Example numbers: ' : '') + C.headline(v, S.set);
  const t = $('heroTiles'); clear(t);
  tile(t, 'Today', v.today == null ? 'none' : C.usd0S(v.today), v.today == null ? 'no trade yet' : C.rWord(v.today, v.unit), sign(v.today));
  tile(t, 'Net so far', C.usd0S(v.net), `${C.rWord(v.net, v.unit)} · ${v.days} days`, sign(v.net));
  tile(t, 'A typical day', C.usd0(v.typical), v.unit ? `1R = ${C.usd0(v.unit)}` : 'no risk in the file');
  $('dialWord').textContent = v.dial.word;
  $('srcNote').textContent = (S.fell ? 'No real or paper trades in the file yet, so this shows the backtest (history, not a promise). ' : '') + (v.n ? `From ${C.dayWord(v.from)} to ${C.dayWord(v.to)}.` : '');
  const seg = $('sets'); clear(seg);
  for (const [k, label] of [['live', 'Real and paper'], ['back', 'Backtest']]) { const n = trades(k).length, b = h('button', 'ag-chip', `${label} (${n})`); b.type = 'button'; b.dataset.set = k; b.setAttribute('aria-pressed', S.set === k ? 'true' : 'false'); b.addEventListener('click', () => { S.set = k; S.fell = false; update(); say(`${label}: ${n} trades.`); }); seg.appendChild(b); }
}

function renderMonth() {
  const v = S.v, months = C.monthsWithData(v.dm, S.today ? C.monthOf(S.today) : ''), i = months.indexOf(S.ym);
  const g = C.monthGrid(v.dm, S.ym, v.unit);
  $('monthTitle').textContent = g.label; $('prevM').disabled = i <= 0; $('nextM').disabled = i < 0 || i >= months.length - 1;
  const box = $('grid'); clear(box);
  for (const d of C.DOW) { const c = h('div', 'dh', d.slice(0, 3)); c.setAttribute('aria-hidden', 'true'); box.appendChild(c); }
  for (const c of g.cells) {
    const e = h('div', 'cell' + (c.inMonth ? '' : ' out') + (c.usd == null ? '' : c.usd > 0 ? ' up' : c.usd < 0 ? ' dn' : ' fl') + (c.day === S.today ? ' now' : '')); e.setAttribute('role', 'listitem');
    e.setAttribute('aria-label', c.inMonth ? (c.usd == null ? `${C.dayWord(c.day)}: no trade` : `${C.dayWord(c.day)}: ${c.word}, ${c.n} trade${c.n === 1 ? '' : 's'}`) : '');
    if (!c.inMonth) e.setAttribute('aria-hidden', 'true');
    e.appendChild(h('small', '', String(c.dom))); if (c.usd != null) e.appendChild(h('b', 'ag-num', C.usd0S(c.usd)));
    box.appendChild(e);
  }
  const t = $('monthTiles'); clear(t);
  tile(t, 'The month', C.usd0S(g.total), C.rWord(g.total, v.unit), sign(g.total)); tile(t, 'Days traded', String(g.days), `${g.green} green, ${g.red} red`); tile(t, 'Trades', String(g.trades), 'in this month');
  $('monthNote').textContent = g.days ? `Each green or red square is one day's net, with 1R = ${v.unit ? C.usd0(v.unit) : 'n/a'}. Empty squares had no trade.` : 'No trade in this month.';
}

function bars(box, rows, unit) {
  clear(box); const max = Math.max(1, ...rows.map((r) => Math.abs(r.usd)));
  for (const r of rows) {
    const li = h('li', 'brow'); li.appendChild(h('span', 'bl', r.label));
    const tr = h('span', 'bt'); tr.setAttribute('aria-hidden', 'true'); const bi = h('i', r.usd > 0 ? 'up' : r.usd < 0 ? 'dn' : ''); bi.style.width = Math.max(r.n ? 3 : 0, Math.round(Math.abs(r.usd) / max * 100)) + '%'; tr.appendChild(bi); li.appendChild(tr);
    const v = h('span', 'bv ' + sign(r.usd)); v.textContent = r.n ? C.both(r.usd, unit) : 'no trade'; li.appendChild(v);
    li.appendChild(h('small', 'bn', `n=${r.n}`)); box.appendChild(li);
  }
}
function renderDow() {
  const w = S.v.wk; bars($('wkRows'), w.rows, S.v.unit);
  $('wkText').textContent = w.enough ? `Best weekday: ${C.bucketWord(w.best, S.v.unit)}. ` + (w.worst ? `Worst: ${C.bucketWord(w.worst, S.v.unit)}.` : '') + ` A weekday is only named with ${C.MIN_BUCKET}+ trades.` : `Not enough trades yet to name a best and worst weekday (each needs ${C.MIN_BUCKET}+ trades).`;
}
function renderHour() {
  const w = S.v.hr; bars($('hrRows'), w.rows, S.v.unit);
  $('hrText').textContent = w.enough ? `Best hour (New York time, at entry): ${C.bucketWord(w.best, S.v.unit)}. ` + (w.worst ? `Worst: ${C.bucketWord(w.worst, S.v.unit)}.` : '') + ` An hour is only named with ${C.MIN_BUCKET}+ trades.` : `Not enough trades yet to name a best and worst hour (each needs ${C.MIN_BUCKET}+ trades).`;
}
function renderBand() {
  const b = S.v.band, u = S.v.unit, box = $('bandRows'), viz = $('bandViz'); clear(box); clear(viz);
  const p = $('bandPill'); p.textContent = b.enough ? `n=${b.n} weeks` : `Too few weeks, n=${b.n}`; p.className = 'pill ' + (b.enough ? 'info' : 'warn');
  const lines = $('bandText'); clear(lines); for (const l of C.bandLines(b, u)) lines.appendChild(h('p', 'lead', l));
  if (!b.enough) return;
  const lo = Math.min(b.worst, 0), hi = Math.max(b.best, 0), span = hi - lo || 1, pos = (x) => ((x - lo) / span * 100).toFixed(1) + '%';
  const track = h('div', 'band'); track.setAttribute('role', 'img'); track.setAttribute('aria-label', `Weekly results from ${C.usd0S(b.worst)} to ${C.usd0S(b.best)}; a normal bad week ${C.usd0S(b.p20)}`);
  const seg = h('i', 'range'); seg.style.left = pos(b.p10); seg.style.width = (((b.p80 - b.p10) / span) * 100).toFixed(1) + '%'; track.appendChild(seg);
  for (const [k, x] of [['zero', 0], ['p20', b.p20], ['p50', b.p50]]) { const m = h('i', 'mk ' + k); m.style.left = pos(x); track.appendChild(m); }
  viz.appendChild(track);
  for (const [l, x] of [['Worst week', b.worst], ['1 in 10 weeks', b.p10], ['1 in 5 weeks (a normal bad week)', b.p20], ['A middle week', b.p50], ['1 in 5 (a good week)', b.p80], ['Best week', b.best]]) { const li = h('li', 'brow2'); li.appendChild(h('span', '', l)); li.appendChild(h('b', 'ag-num ' + sign(x), C.both(x, u))); box.appendChild(li); }
}

// ------------------------------------------------------------------------------------------------ the dial
function renderFlat() {
  const svg = $('flat'), d = S.v.dial, ang = C.shadowAngle(S.hour); clear(svg);
  const defs = sv('defs'), g = sv('radialGradient', { id: 'kd', cx: '40%', cy: '35%', r: '75%' });
  g.appendChild(sv('stop', { offset: '0', 'stop-color': '#f1ebdd' })); g.appendChild(sv('stop', { offset: '1', 'stop-color': '#a89f8c' })); defs.appendChild(g); svg.appendChild(defs);
  svg.appendChild(sv('ellipse', { cx: 160, cy: 130, rx: 128, ry: 62, fill: '#9c6b3c' })); svg.appendChild(sv('ellipse', { cx: 160, cy: 122, rx: 120, ry: 56, fill: 'url(#kd)' }));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; svg.appendChild(sv('line', { x1: 160 + Math.sin(a) * 96, y1: 122 - Math.cos(a) * 44, x2: 160 + Math.sin(a) * 108, y2: 122 - Math.cos(a) * 50, stroke: '#c8a24a', 'stroke-width': i % 3 === 0 ? 3 : 1.5 })); }
  const L = d.shadow * 52, ex = 160 + Math.sin(ang + Math.PI / 2 - Math.PI / 2) * L * 1.5, ey = 122 + Math.cos(ang) * L * 0.7;
  const col = d.tone === 'gain' ? '#7f8a52' : d.tone === 'loss' ? '#c96a4a' : '#c8a24a';
  svg.appendChild(sv('line', { x1: 160, y1: 122, x2: Math.round(ex), y2: Math.round(ey), stroke: '#0c0906', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: '.6' })); svg.appendChild(sv('circle', { cx: Math.round(ex), cy: Math.round(ey), r: 6, fill: col }));
  svg.appendChild(sv('path', { d: 'M160 40l7 82h-14z', fill: '#9c6b3c' })); svg.appendChild(sv('circle', { cx: 160, cy: 122, r: 7, fill: '#c8a24a' }));
}
async function startDial() {
  const q = new URLSearchParams(location.search).get('q'), canvas = $('stage');
  const flat = () => { S.flat = true; $('flat').removeAttribute('hidden'); canvas.hidden = true; renderFlat(); };
  if (q === 'off' || q === 'flat') { flat(); return; }
  try {
    // lazy3d.js imports the dial after the first paint (or not at all: LITE, a slow / save-data phone), then fires 'kronos-dial'; 12 s at most
    if (!window.KRONOS_DIAL && !window.KRONOS_DIAL_FAIL) await new Promise((r) => { const t = setTimeout(r, 12000); window.addEventListener('kronos-dial', () => { clearTimeout(t); r(); }, { once: true }); });
    if (!window.KRONOS_DIAL) throw new Error('the 3D module did not load');
    S.dial = window.KRONOS_DIAL.createDial(canvas, { reduced: RM() }); if (O && O.mode) O.mode(S.dial.lite);
    $('flat').setAttribute('hidden', ''); pushDial();
  } catch (_) { S.dial = null; flat(); }
}
function pushDial() { if (S.dial) S.dial.set(S.v.dial.shadow, C.shadowAngle(S.hour), S.v.dial.tone); if (S.flat) renderFlat(); }

function update() {
  compute(); const months = C.monthsWithData(S.v.dm, S.today ? C.monthOf(S.today) : '');
  if (!months.includes(S.ym)) S.ym = months[months.length - 1] || C.monthOf(S.today || '2026-01-01');
  $('demo').hidden = !S.data.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderMonth(); renderDow(); renderHour(); renderBand(); pushDial();
  say(`Kronos: ${C.headline(S.v, S.set)} ${S.v.dial.word}`);
}
function stepMonth(n) { const months = C.monthsWithData(S.v.dm, S.today ? C.monthOf(S.today) : ''), i = months.indexOf(S.ym) + n; if (i >= 0 && i < months.length) { S.ym = months[i]; renderMonth(); say(`${C.monthWord(S.ym)}.`); } }

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1', at = q.get('at');
  const [fx, real] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../odeon/trades.json')]);
  S.fixture = fx; const data = C.chooseData(real, fx); if (!data) throw new Error('no numbers');
  S.data = data;
  const now = at && Number.isFinite(Date.parse(at)) ? Date.parse(at) / 1000 : Date.now() / 1000;
  S.today = data.today || C.etDay(now); S.hour = data.demo ? 9 : (C.etHour(now) == null ? 12 : C.etHour(now));
  // day-archive 2026-11-20: the site's trade list (odeon/trades.json) can stop days before today: say where it ends
  const upto = real && typeof real.upto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(real.upto) ? real.upto : null, oldDays = upto ? Math.floor((now - Date.parse(upto + 'T21:00:00Z') / 1000) / 86400) : null;
  if (!data.demo && oldDays != null && oldDays > 2) { const w = new Date(upto + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); $('asOf').textContent = `As of ${w}: the site's trade list ends there (${oldDays} days ago). Today's numbers are on Trading and NQ.`; $('asOf').hidden = false; }
  if (q.get('set') === 'back') S.set = 'back';
  else if (!C.normTrades(data.json, 'live').length && C.normTrades(data.json, 'back').length) { S.set = 'back'; S.fell = true; }
  update();
  $('prevM').addEventListener('click', () => stepMonth(-1)); $('nextM').addEventListener('click', () => stepMonth(1));
  await startDial(); S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.addEventListener('pagehide', () => { try { if (S.dial) S.dial.dispose(); } catch (_) { /* gone */ } });
window.KRONOS = { S, C, ready: () => S.ready, update, get dial() { return S.dial; }, get flat() { return S.flat; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Kronos could not start'); } catch (_) { /* nothing */ } });
