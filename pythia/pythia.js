// PYTHIA page (ES module): the risk calendar. The next 14 days of market-moving events for NQ from the bundled events.json (hand-maintained; each date marked "check" when not certain; unknown dates are listed apart, never guessed),
// what the bots do around each one, a risk colour per day, New York (ET) times, today's strip and, when the site has it, today's live brief from ../home.json. fixture.json (DEMO) only when events.json is missing.
// Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS. window.PYTHIA is the test hook. The 3D wheel (pythiawheel.js) is a pure extra; without WebGL the same wheel is drawn flat.
import * as C from './pythiacore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const S = { data: null, home: null, now: 0, today: '', start: '', cal: [], sel: 0, wheel: null, flat: false, ready: false };
const RM = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
const COLORS = { high: '#c96a4a', med: '#e0b060', low: '#7f8a52', calm: '#9c6b3c', closed: '#4b7a99' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function eventCard(e, withDay) {
  const li = h('li', 'ev ' + (e.closed ? 'closed' : e.impact));
  const top = h('div', 'row'); const t = h('b', '', (e.time ? C.hmWord(e.time) + ' · ' : e.closed ? '' : 'All day · ') + e.title); top.appendChild(t);
  const pills = h('span', 'pills'); pills.appendChild(h('span', 'pill ' + (e.closed ? 'info' : { high: 'bad', med: 'warn', low: 'ok' }[e.impact]), e.closed ? 'Closed' : { high: 'High', med: 'Medium', low: 'Low' }[e.impact]));
  if (e.verify) pills.appendChild(h('span', 'pill warn', 'Check date')); top.appendChild(pills); li.appendChild(top);
  if (withDay) li.appendChild(h('small', 'note', `${C.dayWord(e.day || e.date)}${e.cd ? ' · ' + e.cd.word : ''}`));
  li.appendChild(h('p', 'note words', C.botWords(e)));
  if (e.src) li.appendChild(h('small', 'src', 'Source: ' + e.src));
  return li;
}

function renderHero() {
  const today = S.cal.find((d) => d.ymd === S.today) || C.calendar(S.data.n, S.today, 1)[0], risk = today.risk, p = C.etParts(S.now);
  const pill = $('riskPill'); pill.textContent = C.RISKWORD[risk]; pill.className = 'pill ' + C.RISKCLS[risk];
  $('todayWord').textContent = `${C.dayLong(S.today)} · ${C.hmWord(p.hm)} now`;
  const box = $('todayEv'); clear(box);
  for (const e of today.events) box.appendChild(eventCard(e, false));
  if (!today.events.length) box.appendChild(h('li', 'note', C.dayWords(today)));
  const news = C.liveNews(S.home, S.today), nb = $('liveBox'); clear(nb); $('liveCard').hidden = !news;
  if (news) { for (const x of news) { const li = h('li', 'ev low'); li.appendChild(h('b', '', `${x.time ? C.hmWord(x.time) + ' · ' : ''}${x.title}`)); li.appendChild(h('small', 'note', [x.kind, x.blackout ? 'quiet window ' + x.blackout + ' ET' : ''].filter(Boolean).join(' · '))); nb.appendChild(li); } if (!news.length) nb.appendChild(h('li', 'note', 'The live briefing lists no news for today.')); }
}

function renderGrid() {
  const g = $('grid'); clear(g);
  S.cal.forEach((d, i) => {
    const b = h('button', 'dbtn' + (d.ymd === S.today ? ' now' : '') + (i === S.sel ? ' sel' : '')); b.type = 'button'; b.dataset.i = String(i); b.dataset.risk = d.risk; b.setAttribute('aria-pressed', i === S.sel ? 'true' : 'false');
    b.setAttribute('aria-label', `${d.word}: ${C.RISKWORD[d.risk]}, ${d.events.length} event${d.events.length === 1 ? '' : 's'}${d.ymd === S.today ? ', today' : ''}`);
    b.appendChild(h('small', '', C.WEEKDAYS[d.dow])); b.appendChild(h('b', 'ag-num', String(+d.ymd.slice(8)))); const dot = h('i', 'dot ' + d.risk); b.appendChild(dot);
    b.addEventListener('click', () => select(i)); g.appendChild(b);
  });
  $('range').textContent = `${C.dayWord(S.cal[0].ymd)} to ${C.dayWord(S.cal[S.cal.length - 1].ymd)}`;
}
function renderDay() {
  const d = S.cal[S.sel]; $('dayTitle').textContent = `${C.dayLong(d.ymd)}${d.ymd === S.today ? ' (today)' : ''}`;
  const p = $('dayPill'); p.textContent = C.RISKWORD[d.risk]; p.className = 'pill ' + C.RISKCLS[d.risk];
  const box = $('dayList'); clear(box); for (const e of d.events) box.appendChild(eventCard(e, false));
  if (!d.events.length) box.appendChild(h('li', 'note', C.dayWords(d)));
}
function renderNext() {
  const box = $('nextList'); clear(box); const up = C.nextUp(S.cal, S.now, 6);
  for (const e of up) { const li = h('li', 'nx ' + (e.closed ? 'closed' : e.impact)); li.appendChild(h('b', '', e.title)); li.appendChild(h('small', 'note', `${C.dayWord(e.day)}${e.time ? ' · ' + C.hmWord(e.time) : ''} · ${e.cd.word}${e.verify ? ' · check date' : ''}`)); box.appendChild(li); }
  if (!up.length) box.appendChild(h('li', 'note', `No event in these 14 days. The list runs to ${C.lastDate(S.data.n) ? C.dayWord(C.lastDate(S.data.n)) : 'nowhere yet'}.`));
  const ud = $('undated'); clear(ud);
  for (const u of S.data.n.undated) { const li = h('li', 'nx ' + u.impact); li.appendChild(h('b', '', u.title)); li.appendChild(h('small', 'note', `No date in the list yet (${u.approx}). Confirm at: ${u.confirm || u.src}.`)); ud.appendChild(li); }
  $('undatedCard').hidden = !S.data.n.undated.length;
  $('notes').textContent = `${C.staleWord(S.data.n.updated, S.today)} The list ends ${C.lastDate(S.data.n) ? C.dayWord(C.lastDate(S.data.n)) : 'nowhere'}.`;
}

function renderFlat() {
  const svg = $('flat'); clear(svg); const N = S.cal.length, cx = 160, cy = 108;
  svg.appendChild(sv('ellipse', { cx, cy: cy + 12, rx: 140, ry: 64, fill: '#9c6b3c' })); svg.appendChild(sv('ellipse', { cx, cy, rx: 132, ry: 62, fill: '#e8e1d2' }));
  S.cal.forEach((d, i) => {
    const a = (i / N) * Math.PI * 2, x = cx + Math.sin(a) * 92, y = cy - Math.cos(a) * 38, hgt = { high: 46, med: 30, low: 18, calm: 7, closed: 12 }[d.risk] || 7;
    if (i === 0) svg.appendChild(sv('ellipse', { cx: x, cy: y + 2, rx: 13, ry: 5, fill: 'none', stroke: '#c8a24a', 'stroke-width': 2 }));
    svg.appendChild(sv('rect', { x: x - 6, y: y - hgt + (i === S.sel ? -6 : 0), width: 12, height: hgt, rx: 3, fill: COLORS[d.risk] || COLORS.calm, opacity: i === S.sel ? '1' : '.9' }));
  });
  svg.appendChild(sv('circle', { cx, cy, r: 8, fill: '#c8a24a' }));
}
async function startWheel() {
  const q = new URLSearchParams(location.search).get('q'), canvas = $('stage');
  const flat = () => { S.flat = true; $('flat').removeAttribute('hidden'); canvas.hidden = true; renderFlat(); };
  if (q === 'off' || q === 'flat') { flat(); return; }
  try {
    for (let k = 0; k < 25 && !window.PYTHIA_WHEEL && !window.PYTHIA_WHEEL_FAIL; k++) await new Promise((r) => setTimeout(r, 100));
    if (!window.PYTHIA_WHEEL) throw new Error('the 3D module did not load');
    S.wheel = window.PYTHIA_WHEEL.createWheel(canvas, S.cal, { reduced: RM(), onPick: (i) => select(i) }); if (O && O.mode) O.mode(S.wheel.lite);
    $('flat').setAttribute('hidden', ''); S.wheel.select(S.sel);
  } catch (_) { S.wheel = null; flat(); }
}

function select(i) { S.sel = i; renderGrid(); renderDay(); if (S.wheel) S.wheel.select(i); if (S.flat) renderFlat(); const d = S.cal[i]; say(`${d.word}: ${C.RISKWORD[d.risk]}, ${d.events.length} event${d.events.length === 1 ? '' : 's'}.`); }
function build() {
  S.cal = C.calendar(S.data.n, S.start, C.DAYS); const t = S.cal.findIndex((d) => d.ymd === S.today); S.sel = t >= 0 ? t : 0;
  $('demo').hidden = !S.data.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderGrid(); renderDay(); renderNext(); if (S.flat) renderFlat();
  $('todayBtn').disabled = S.start === S.today;
}
function shift(n) {
  S.start = C.addDays(S.start, n); build();
  if (S.wheel) { S.wheel.dispose(); S.wheel = null; $('flat').setAttribute('hidden', ''); $('stage').hidden = false; startWheel(); }
  say(`${$('range').textContent}.`);
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1', at = q.get('at');
  const [fx, ev, home] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('./events.json'), forced ? null : getJSON('../home.json')]);
  const data = C.chooseData(ev, fx && fx.events ? fx : null); if (!data) throw new Error('no events');
  S.data = data; S.home = data.demo ? (fx && fx.home) || null : home;
  const nowIso = at && Number.isFinite(Date.parse(at)) ? at : data.demo && fx && fx.now ? fx.now : null;
  S.now = nowIso ? Date.parse(nowIso) / 1000 : Date.now() / 1000; S.today = C.etParts(S.now).ymd; S.start = S.today;
  build();
  $('prevW').addEventListener('click', () => shift(-7)); $('nextW').addEventListener('click', () => shift(7)); $('todayBtn').addEventListener('click', () => { S.start = S.today; build(); if (S.wheel) { S.wheel.dispose(); S.wheel = null; $('flat').setAttribute('hidden', ''); $('stage').hidden = false; startWheel(); } say('Back to today.'); });
  await startWheel(); S.ready = true; say(`Pythia: ${C.RISKWORD[(S.cal[0] || {}).risk || 'calm']} today in New York. ${C.dayLong(S.today)}.`);
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.addEventListener('pagehide', () => { try { if (S.wheel) S.wheel.dispose(); } catch (_) { /* gone */ } });
window.PYTHIA = { S, C, ready: () => S.ready, select, shift, get wheel() { return S.wheel; }, get flat() { return S.flat; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Pythia could not start'); } catch (_) { /* nothing */ } });
