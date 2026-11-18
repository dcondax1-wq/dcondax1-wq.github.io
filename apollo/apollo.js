// APOLLO page (ES module): the weekly review. Reads the site's odeon/trades.json (the bot's trades; fixture.json = DEMO when it is missing), and Mnemosyne's card from this phone's
// localStorage 'journal.card.v1' (READ ONLY: Apollo never writes it). Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS. window.APOLLO is the test hook.
import * as C from './apollocore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { weeks: [], i: 0, demo: false, forced: false, card: null, fixture: null, today: '', ready: false, sum: null };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function readCard() { try { return C.parseCard(localStorage.getItem('journal.card.v1')); } catch (_) { return null; } }

function renderWeeks() {
  const box = $('weeks'); clear(box);
  S.weeks.slice(0, 4).forEach((w, i) => {
    const b = h('button', 'ag-chip', w.label); b.type = 'button'; b.dataset.i = String(i); b.setAttribute('aria-pressed', i === S.i ? 'true' : 'false');
    b.addEventListener('click', () => { S.i = i; render(); }); box.appendChild(b);
  });
}

function bars(s) {
  const svg = $('bars'); clear(svg);
  const top = Math.max(100, ...s.byDay.map((d) => Math.abs(d.usd))), mid = 50, sc = 38 / top, w = 44, gap = 16;
  svg.appendChild(sv('line', { x1: 6, x2: 354, y1: mid, y2: mid, stroke: '#3a3228', 'stroke-width': 1 }));
  s.byDay.forEach((d, i) => {
    const x = 18 + i * (w + gap), hh = d.n ? Math.max(3, Math.abs(d.usd) * sc) : 0, y = d.usd >= 0 ? mid - hh : mid;
    if (d.n) svg.appendChild(sv('rect', { x, y, width: w, height: hh, rx: 4, fill: d.usd >= 0 ? '#7f8a52' : '#c96a4a' }));
    else svg.appendChild(sv('rect', { x, y: mid - 1, width: w, height: 2, rx: 1, fill: '#3a3228' }));
    svg.appendChild(sv('text', { x: x + w / 2, y: 104, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 12 }, C.DOW[i]));
    if (d.n) svg.appendChild(sv('text', { x: x + w / 2, y: d.usd >= 0 ? y - 4 : y + hh + 12, 'text-anchor': 'middle', fill: '#f3ece0', 'font-size': 11 }, C.moneyS(d.usd)));
  });
}

function list(id, items) { const ul = $(id); clear(ul); for (const t of items) ul.appendChild(h('li', '', t)); }

function render() {
  const w = S.weeks[S.i] || null, trades = w ? w.trades : [], s = C.summarize(trades); S.sum = s;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderWeeks();
  $('weekH').textContent = w ? `${C.dayWord(w.from)} to ${C.dayWord(w.to)}` : 'No trades yet';
  $('big').textContent = s.n ? C.both(s.net, s.netR, s.anyEst) : '$0 (0.0R)'; $('big').className = 'big ag-num ' + sign(s.net);
  const tiles = $('tiles'); clear(tiles);
  const tile = (k, v, n) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', '', v)); t.appendChild(h('span', '', n)); tiles.appendChild(t); };
  tile('Trades', String(s.n), `${s.wins} won, ${s.losses} lost${s.be ? ', ' + s.be + ' flat' : ''}`); tile('Win rate', s.winPct == null ? 'n/a' : s.winPct + '%', 'of the trades');
  tile('Profit factor', s.pf == null ? 'no losses' : String(s.pf), 'wins / losses in $');
  bars(s);
  const nt = C.notes(s, trades); list('right', nt.right); list('wrong', nt.wrong);
  // discipline (Mnemosyne)
  const own = S.forced ? null : readCard(); S.cardDemo = !own && (S.forced || S.demo);
  S.card = own || (S.cardDemo ? C.parseCard(S.fixture && S.fixture.card) : null);
  const dl = $('disc'); clear(dl);
  if (S.card) { for (const k of S.card.kpis) { const t = h('div', 'tile'); t.appendChild(h('small', '', k.label)); t.appendChild(h('b', '', k.value)); dl.appendChild(t); } }
  const dt = $('discText'); clear(dt);
  if (S.card) for (const l of S.card.lines) dt.appendChild(h('p', 'lead', l));
  else dt.appendChild(h('p', 'lead', 'No journal yet on this phone. Rate your trades in Mnemosyne (10 seconds each) and your discipline shows here: how often you followed the plan and what interfering cost.'));
  $('discNote').textContent = S.card ? (S.cardDemo ? 'Example journal, not yours.' : 'From your Mnemosyne journal on this phone.') : '';
  const r = C.oneRule(s, S.card); $('ruleText').textContent = r.text; $('ruleWhy').textContent = r.why;
  say(`${w ? w.label : 'No trades yet'}: ${s.n ? C.both(s.net, s.netR, s.anyEst) : 'no trades'}. One rule for next week: ${r.text}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const at = q.get('at'), d = at ? new Date(at) : new Date(); S.today = (Number.isFinite(d.getTime()) ? d : new Date()).toISOString().slice(0, 10);
  const [fx, odeon] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../odeon/trades.json')]);
  S.fixture = fx;
  let trades = odeon ? C.normTrades(odeon) : [];
  if (!trades.length) { trades = C.demoTrades(fx, S.today); S.demo = true; }
  S.weeks = C.weeks(trades); S.i = C.pickWeek(S.weeks, S.today);
  render();
}
window.APOLLO = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Apollo could not start'); } catch (_) { /* nothing */ } });
