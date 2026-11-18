// PHEME page (ES module): the word on the street. Today's and the next two weeks' scheduled releases with a plain "why it matters for NQ" and what the bots do, and a history card per kind of release (the last 8 days: how far NQ
// travelled in points and in dollars for one MNQ micro, n shown). Reads ./stats.json (built offline by tools/pheme_build.py from the saved calendar and the 5m NQ file) or fixture.json (DEMO, never blank). HISTORY ONLY: no forecast.
// Read only: sends nothing, keeps nothing. Text only through textContent / createElementNS. window.PHEME is the test hook. The 3D rack (phemerack.js) is a pure extra; without WebGL the same bars are drawn flat.
import * as C from './phemecore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const S = { data: null, v: null, today: '', kind: 'cpi', row: -1, rack: null, flat: false, ready: false };
const RM = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const tile = (box, k, v, n) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', 'ag-num', v)); if (n) t.appendChild(h('span', '', n)); box.appendChild(t); };

function eventLi(e) {
  const li = h('li', 'ev ' + e.impact);
  const top = h('div', 'row'); top.appendChild(h('b', '', `${e.time ? C.hmWord(e.time) + ' · ' : ''}${e.title}`));
  const pills = h('span', 'pills'); pills.appendChild(h('span', 'pill ' + C.IMPACT_CLS[e.impact], C.IMPACT_WORD[e.impact])); top.appendChild(pills); li.appendChild(top);
  const det = h('details'); const sum = h('summary', '', 'Why it matters for NQ, and what the bots do'); det.appendChild(sum);
  det.appendChild(h('p', 'note words', C.WHY[e.kind] || C.WHY.other)); det.appendChild(h('p', 'note words', C.botWords(e)));
  if (C.TRACKED.includes(e.kind)) { const b = h('button', 'btn wide', `See the last 8 ${C.SHORT[e.kind]} days`); b.type = 'button'; b.dataset.kind = e.kind; b.addEventListener('click', () => { selectKind(e.kind); $('histCard').scrollIntoView({ block: 'start', behavior: RM() ? 'auto' : 'smooth' }); }); det.appendChild(b); }
  if (e.source) det.appendChild(h('small', 'src', 'From: ' + e.source));
  li.appendChild(det); return li;
}

function renderToday() {
  const v = S.v; $('todayWord').textContent = `${C.dayLong(S.today)} (New York)`; $('head').textContent = (v.demo ? 'Example numbers: ' : '') + C.headline(v, S.today);
  const box = $('todayEv'); clear(box); const ev = C.eventsOn(v, S.today); for (const e of ev) box.appendChild(eventLi(e));
  if (!ev.length) box.appendChild(h('li', 'note', 'Nothing is scheduled today in the saved calendar. The bots trade by their normal rules.'));
  const cov = C.coverage(v, S.today), n = $('cov'); n.textContent = cov.word + (cov.stale ? ' This is more than three weeks old: newer releases may be missing.' : ''); n.className = 'note' + (cov.stale ? ' warnnote' : '');
  const wk = $('weekEv'); clear(wk); const sch = C.schedule(v, C.addDays(S.today, 1), 14, true);
  for (const d of sch) { const li = h('li', 'day'); li.appendChild(h('h3', '', d.word)); const ul = h('ul', 'plain inner'); for (const e of d.events) ul.appendChild(eventLi(e)); li.appendChild(ul); wk.appendChild(li); }
  if (!sch.length) wk.appendChild(h('li', 'note', `No release in the next 14 days of the saved calendar (it runs to ${v.calLast || 'an unknown date'}).`));
}

function renderKinds() {
  const seg = $('kinds'); clear(seg);
  for (const k of C.TRACKED) { if (!S.v.kinds[k]) continue; const b = h('button', 'ag-chip', C.SHORT[k]); b.type = 'button'; b.dataset.kind = k; b.setAttribute('aria-pressed', k === S.kind ? 'true' : 'false'); b.setAttribute('aria-label', `${S.v.kinds[k].label}: history`); b.addEventListener('click', () => { selectKind(k); say(`${S.v.kinds[k].label}: last ${S.v.kinds[k].last.day.n} days.`); }); seg.appendChild(b); }
}
function renderHistory() {
  const H = C.history(S.v, S.kind); if (!H) return; $('hTitle').textContent = `${H.k.label}: the last ${H.k.last.day.n || 0} days`;
  const p = $('hPill'); p.textContent = `n=${H.k.last.day.n}`; p.className = 'pill ' + (H.thin ? 'warn' : 'info');
  const t = $('hTiles'); clear(t); for (const x of H.tiles) tile(t, x.k, x.v, x.n);
  const ls = $('hLines'); clear(ls); for (const l of H.lines) ls.appendChild(h('p', 'lead', l));
  const body = $('hRows'); clear(body);
  H.k.rows.forEach((r, i) => { const tr = h('tr', i === S.row ? 'sel' : ''); tr.dataset.row = String(i); tr.appendChild(h('th', '', `${C.dayWord(r.date)} ${r.date.slice(2, 4)}`)); tr.appendChild(h('td', 'ag-num', `${C.pts(r.day)}`)); tr.appendChild(h('td', 'ag-num', C.usd(C.perMicro(r.day)))); tr.appendChild(h('td', 'ag-num', C.pts(r.win))); tr.appendChild(h('td', 'ag-num', C.usd(C.perMicro(r.win)))); body.appendChild(tr); });
  $('hTable').hidden = !H.k.rows.length; $('hNote').textContent = `${S.v.label} 1 MNQ micro = $2 per point. Day = 8 AM to 4 PM ET. Price history to ${S.v.lastBar || 'an unknown date'}.`;
}

function renderFlat() {
  const svg = $('flat'); clear(svg); const B = C.rackBars(S.v, S.kind), n = B.values.length, top = Math.max(1, ...B.values, B.typical), W = 320, H = 150;
  svg.appendChild(sv('rect', { x: 20, y: 160, width: 280, height: 10, rx: 3, fill: '#9c6b3c' }));
  B.values.forEach((v, i) => { const hh = (v / top) * 110, x = 34 + i * ((W - 68) / Math.max(1, n)), w = 22; svg.appendChild(sv('rect', { x, y: 160 - hh, width: w, height: hh, rx: 3, fill: i === (n - 1 - S.row) ? '#c8a24a' : '#e8e1d2' })); svg.appendChild(sv('ellipse', { cx: x + w / 2, cy: 160 - hh, rx: 15, ry: 4, fill: '#d6c08a' })); });
  const ly = 160 - (B.typical / top) * 110; svg.appendChild(sv('line', { x1: 20, y1: ly, x2: 300, y2: ly, stroke: '#c8a24a', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  svg.appendChild(sv('text', { x: 24, y: Math.max(12, ly - 5), 'font-size': 10, fill: '#cfc4b2' }, 'an ordinary day'));
}
async function startRack() {
  const q = new URLSearchParams(location.search).get('q'), canvas = $('stage');
  const flat = () => { S.flat = true; $('flat').removeAttribute('hidden'); canvas.hidden = true; renderFlat(); };
  if (q === 'off' || q === 'flat') { flat(); return; }
  try {
    for (let k = 0; k < 25 && !window.PHEME_RACK && !window.PHEME_RACK_FAIL; k++) await new Promise((r) => setTimeout(r, 100));
    if (!window.PHEME_RACK) throw new Error('the 3D module did not load');
    S.rack = window.PHEME_RACK.createRack(canvas, { reduced: RM(), onPick: (slot) => { const n = (C.rackBars(S.v, S.kind).values || []).length; selectRow(n - 1 - slot); } }); if (O && O.mode) O.mode(S.rack.lite);
    $('flat').setAttribute('hidden', ''); pushRack();
  } catch (_) { S.rack = null; flat(); }
}
function pushRack() { const B = C.rackBars(S.v, S.kind), n = B.values.length; if (S.rack) { S.rack.set(B.values, B.typical); S.rack.select(S.row >= 0 ? n - 1 - S.row : -1); } if (S.flat) renderFlat(); }

function selectKind(k) { if (!S.v.kinds[k]) return; S.kind = k; S.row = -1; renderKinds(); renderHistory(); pushRack(); }
function selectRow(i) {
  const k = S.v.kinds[S.kind]; if (!k || i < 0 || i >= k.rows.length) return; S.row = i; renderHistory(); pushRack();
  say(C.rowWords(k.rows[i])); const tr = document.querySelector(`#hRows tr[data-row="${i}"]`); if (tr) tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
}

function build() {
  $('demo').hidden = !S.data.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  const first = C.eventsOn(S.v, S.today).find((e) => C.TRACKED.includes(e.kind)) || S.v.events.find((e) => e.date >= S.today && C.TRACKED.includes(e.kind));
  S.kind = first && S.v.kinds[first.kind] ? first.kind : (Object.keys(S.v.kinds)[0] || 'cpi');
  renderToday(); renderKinds(); renderHistory();
  say(`Pheme: ${C.headline(S.v, S.today)} History only, never a forecast.`);
}
async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1', at = q.get('at');
  const [fx, real] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('./stats.json')]);
  const data = C.chooseData(real, fx); if (!data) throw new Error('no numbers');
  S.data = data; S.v = data.v;
  const now = at && Number.isFinite(Date.parse(at)) ? Date.parse(at) / 1000 : Date.now() / 1000;
  const demoToday = data.demo && fx && /^\d{4}-\d{2}-\d{2}$/.test(String(fx.today)) ? fx.today : null;
  S.today = demoToday && !at ? demoToday : C.etDay(now);
  build(); await startRack(); S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.addEventListener('pagehide', () => { try { if (S.rack) S.rack.dispose(); } catch (_) { /* gone */ } });
window.PHEME = { S, C, ready: () => S.ready, selectKind, selectRow, get rack() { return S.rack; }, get flat() { return S.flat; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Pheme could not start'); } catch (_) { /* nothing */ } });
