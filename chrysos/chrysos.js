// CHRYSOS page (ES module): the gold. Fees against payouts for the prop-firm fleet. Reads ../money/chrysos.json (written by tools/money/chrysos.py) and fixture.json (DEMO, never blank).
// Read only: it sends nothing and keeps nothing. Text only through textContent. window.CHRYSOS is the test hook. ?case=conservative|base|optimistic&month=0..12&demo=1 opens a given view.
import * as C from './chrysoscore.js';
import * as HF from '../olympus/hero-flat.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { doc: null, fixture: null, demo: false, forced: false, key: 'base', month: 12, tower: null, mode: 'flat', ready: false, reason: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function renderCases() {
  const box = $('cases'); clear(box);
  for (const k of C.CASES) {
    const b = h('button', 'ag-chip', C.CASE_WORD[k]); b.type = 'button'; b.dataset.case = k; b.setAttribute('aria-pressed', k === S.key ? 'true' : 'false');
    b.setAttribute('aria-label', `${C.CASE_WORD[k]} case`);
    b.addEventListener('click', () => { S.key = k; render(); }); box.appendChild(b);
  }
  $('caseNote').textContent = C.CASE_SAY[S.key];
}

function tile(box, k, v, n, cls) { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); box.appendChild(t); }

function renderHero() {
  const f = S.doc.chrysos.fleet[S.key], accs = C.fleetAccounts(S.doc);
  $('headline').textContent = C.headline(S.doc, S.key);
  const t = $('tiles'); clear(t);
  tile(t, 'Net after 12 months', C.moneyS(f.net12), 'estimate, fees included', f.net12 >= 0 ? 'pos' : 'neg');
  tile(t, 'Net after 6 months', C.moneyS(f.net6), 'estimate', f.net6 >= 0 ? 'pos' : 'neg');
  tile(t, 'Payouts a month', C.money(f.payout_month), 'expected once funded');
  tile(t, 'Break-even', f.breakeven_month == null ? 'Not in 12 mo' : C.beWords(f.breakeven_month).replace('in about ', '~'), 'fees paid back');
  tile(t, 'New fees', C.money(f.cost_expected), `${accs.length} accounts, expected`);
}

// ------------------------------------------------------------------------------------------------ towers
function renderFlat(m) {
  // the painted twin of the 3D towers (olympus/hero-flat.js): golden-hour sky, marble plinths, fluted bronze columns (fees), stacks of owl coins (payouts)
  const svg = $('flat'); clear(svg);
  const n = m.towers.length, W = 360, base = 196, ch = 5.2, step = Math.min(110, (W - 20) / n);
  const P = HF.paint(svg, { w: W, h: 220, sky: 'golden', horizon: 0.86, sunX: 0.86, sunY: 0.45, templeX: 0.12 });
  m.towers.forEach((t, i) => {
    const cx = 10 + step * i + step / 2, bh = Math.min(170, Math.max(3, (t.fees / m.unit) * ch));
    P.shadow(cx + 4, base + 2, 34, 4);
    svg.appendChild(sv('rect', { x: cx - 30, y: base - 5, width: 60, height: 5, rx: 2, fill: P.F.marble }));
    P.column(cx - 15, base - 5, bh, 18, { mat: 'bronze', capital: false, base: false });
    svg.appendChild(sv('line', { x1: cx - 28, x2: cx + 28, y1: base - 5 - bh, y2: base - 5 - bh, stroke: '#7f8a52', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }));
    const coins = Math.min(34, t.coins);
    for (let j = 0; j < coins; j++) svg.appendChild(sv('rect', { x: cx + 4 + (j % 3 === 1 ? 1 : 0), y: base - 5 - (j + 1) * ch, width: 20, height: ch - 1, rx: 2, fill: P.F.gold, stroke: '#7a5418', 'stroke-width': 0.5 }));
    svg.appendChild(sv('text', { x: cx, y: base + 16, 'text-anchor': 'middle', 'font-size': 11, fill: t.paidBack ? '#a8b870' : '#f4e8d0' }, String(i + 1)));
  });
  P.vignette();
}

function renderLegend(m) {
  const ul = $('legend'); clear(ul);
  m.towers.forEach((t, i) => {
    const li = h('li', 'lg'); li.appendChild(h('span', 'num', String(i + 1)));
    const w = h('span', 'lgtxt'); w.appendChild(h('b', '', t.name + (t.sunk ? ' (fee paid)' : '')));
    w.appendChild(h('small', t.paidBack ? 'pos' : '', `fees ${C.money(t.fees)} / payouts ${C.money(t.income)}${t.paidBack ? ' / paid back' : ''}`));
    li.appendChild(w); ul.appendChild(li);
  });
}

function renderTowers() {
  const m = C.towers(S.doc, S.key, S.month);
  $('monthV').textContent = String(m.month); $('month').value = String(m.month); $('unit').textContent = C.money(m.unit);
  renderFlat(m); renderLegend(m);
  if (S.tower && S.tower.ok) S.tower.set(m);
  S.model = m;
}

async function startTower() {
  const canvas = $('stage'), flat = $('flat');
  let T = null;
  try { T = await waitTower(); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (T) {
    let t = null;
    try { t = T.createTower(canvas, { reduced }); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
    if (t && t.ok) { S.tower = t; S.mode = '3d'; canvas.hidden = false; flat.setAttribute('hidden', ''); t.set(S.model); document.documentElement.dataset.chrysos = '3d'; return; }
    if (t && t.reason) S.reason = t.reason;
  }
  S.mode = 'flat'; canvas.hidden = true; flat.removeAttribute('hidden'); document.documentElement.dataset.chrysos = 'flat';
}
// tower.js is loaded by its own module tag (towerload.js) so the page still works when three.js or WebGL is missing: the page waits for it (6 s at most), else it keeps the flat tower
function waitTower() {
  return new Promise((resolve, reject) => {
    if (window.__chrysosTower) { resolve(window.__chrysosTower); return; }
    const done = (v, e) => { clearTimeout(tm); window.removeEventListener('chrysos-tower', on); if (e) reject(e); else resolve(v); };
    const on = () => done(window.__chrysosTower);
    const tm = setTimeout(() => done(null, new Error('the 3D tower did not load')), 6000);
    window.addEventListener('chrysos-tower', on);
  });
}

// ------------------------------------------------------------------------------------------------ cards
function card(a, isBuy, rank) {
  const c = a.cases[S.key], li = h('li', 'acard');
  const top = h('div', 'row'); top.appendChild(h('h3', '', a.name));
  const pill = h('span', 'pill ' + ({ low: 'ok', med: 'warn', high: 'bad' }[a.risk] || ''), { low: 'Lower risk', med: 'Medium risk', high: 'Higher risk' }[a.risk] || 'Risk');
  top.appendChild(pill); li.appendChild(top);
  const sub = isBuy ? `${rank}. Fee ${C.price(a.price)} one time, $0 activation (list ${C.price(a.list)})` : `${a.status === 'eval' ? 'In its eval' : a.status}. Fee ${C.price(a.paid || a.price)} already paid`;
  li.appendChild(h('p', 'note', sub));
  li.appendChild(h('p', 'lead2', C.accountLine(a, S.key)));
  const kv = h('dl', 'kv');
  const row = (k, v, cls) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', cls || '', v)); };
  row('Chance it gets funded', C.pct(c.p_funded)); row('Net after 12 months', C.moneyS(c.net12), c.net12 >= 0 ? 'pos' : 'neg');
  row('Stress / cautious / hopeful', `${C.moneyS(a.cases.stress.net12)} / ${C.moneyS(a.cases.conservative.net12)} / ${C.moneyS(a.cases.optimistic.net12)}`);
  li.appendChild(kv);
  const bar = h('div', 'ag-bar ' + (a.score >= 70 ? 'green' : a.score >= 45 ? 'amber' : 'red')); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `Score ${a.score} of 100, an estimate`);
  const i = h('i'); i.style.width = Math.max(4, Math.min(100, a.score)) + '%'; bar.appendChild(i); li.appendChild(bar);
  return li;
}

function renderBuy() {
  const c = S.doc.chrysos, ul = $('buy'); clear(ul);
  const picks = new Set(c.buy_next.map((b) => b.plan));
  const ranked = c.candidates.slice().sort((a, b) => b.roi12 - a.roi12);
  ranked.forEach((a, i) => { const li = card(a, true, i + 1); if (!picks.has(a.plan)) li.classList.add('dim'); ul.appendChild(li); });
  const names = c.buy_next.map((b) => b.name);
  $('buyNote').textContent = names.length ? `With a ${C.money(c.budget)} budget the plan buys: ${names.join(' and ')} (about ${C.money(c.spent_if_all_bought)} in fees). Fleet cap ${c.max_accounts} accounts.` : `With a ${C.money(c.budget)} budget nothing is worth buying yet. Fleet cap ${c.max_accounts} accounts.`;
}

function renderFleet() {
  const ul = $('fleet'); clear(ul);
  const all = C.fleetAccounts(S.doc);
  all.forEach((a) => { const li = card(a, !a.sunk && a.status === 'candidate' ? true : false, 0); ul.appendChild(li); });
}

function renderCal() {
  const box = $('cal'); clear(box);
  const g = C.calendarGroups(S.doc);
  if (!g.length) { box.appendChild(h('p', 'note', 'No payout dates inside the next 12 months in this case.')); return; }
  for (const m of g) {
    const sec = h('section', 'calm'); const hd = h('div', 'row'); hd.appendChild(h('h3', '', m.label));
    hd.appendChild(h('span', 'note', `expected ${C.money(m.total_expected)} of ${C.money(m.total_if)} if all funded`)); sec.appendChild(hd);
    const ul = h('ul', 'plain2');
    for (const r of m.rows) {
      const li = h('li', 'calrow'); li.appendChild(h('b', 'ag-num', r.label)); const t = h('span', 'caltxt', `${r.account}`); li.appendChild(t);
      li.appendChild(h('span', 'ag-num', `${C.money(r.usd_if)} if funded, ${C.pct(r.chance)} chance`)); ul.appendChild(li);
    }
    sec.appendChild(ul); box.appendChild(sec);
  }
}

function renderWrong() { const u = $('wrong'); clear(u); for (const l of C.wrongLines(S.doc)) u.appendChild(h('li', '', l)); }

function renderText() {
  const g = $('gone'); clear(g); for (const l of C.riskLines(S.doc, S.key)) g.appendChild(h('li', '', l));
  const how = $('how'); clear(how); for (const l of S.doc.notes) how.appendChild(h('li', '', l));
}

function render() {
  if (!S.doc) return;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderCases(); renderHero(); renderTowers(); renderWrong(); renderBuy(); renderFleet(); renderCal(); renderText();
  const f = S.doc.chrysos.fleet[S.key];
  say(`Chrysos, ${C.CASE_WORD[S.key]} case: an estimate of ${C.moneyS(f.net12)} net over 12 months for ${C.fleetAccounts(S.doc).length} accounts. Month ${S.month} shown.`);
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, live] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../money/chrysos.json')]);
  S.fixture = C.usable(fx);
  const liveOk = C.usable(live);
  S.doc = liveOk || S.fixture;
  S.demo = !liveOk || S.forced || live.status === 'sample' || live.demo === true;
  if (!S.doc) { say('Chrysos has no plan to show yet. The fixture is missing.'); try { if (O && O.fail) O.fail('Chrysos could not start'); } catch (_) { /* nothing */ } return; }
  const k = q.get('case'); if (C.CASES.includes(k)) S.key = k;
  const m = parseInt(q.get('month'), 10); if (Number.isFinite(m)) S.month = Math.max(0, Math.min(12, m));
  $('month').addEventListener('input', () => { S.month = parseInt($('month').value, 10) || 0; renderTowers(); say(`Month ${S.month} of 12.`); });
  render();
  await startTower();
  if (S.tower && S.model) S.tower.set(S.model);
  S.ready = true;
}
window.CHRYSOS = { S, C, ready: () => S.ready, render, get mode() { return S.mode; }, get tower() { return S.tower; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Chrysos could not start'); } catch (_) { /* nothing */ } });
