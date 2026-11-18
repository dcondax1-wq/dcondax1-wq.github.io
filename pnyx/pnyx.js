// PNYX page (ES module): the assembly. A rules and risk calculator for MFFU Builder 50K / 25K / ATLAS 25K. Type a stop in points: micros allowed, dollars at risk (with the R), daily loss left, the trailing floor,
// the distance to the target, the ladder of stops, the price and the rules. Reads home.json (live balance), ledger/rules.json (limits) and fixture.json (DEMO). Read only: it sends nothing and keeps nothing.
// Text only through textContent. window.PNYX is the test hook. ?plan=atlas&stop=15&share=0.4 opens a given case.
import * as C from './pnyxcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { fixture: null, home: null, rules: null, plan: 'b50', inp: { stop: 20, share: 0.6, balance: 50000, best: 50000, lost: 0 }, live: false, demo: false, forced: false, ready: false, built: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function loadPlan(key) {
  S.plan = key;
  const d = C.defaults(key, S.forced ? null : S.home, S.fixture);
  S.inp = { ...S.inp, balance: d.inp.balance, best: d.inp.best, lost: d.inp.lost }; S.live = d.live; S.demo = d.demo || S.forced;
}

function renderControls() {
  const plans = $('plans'); clear(plans);
  for (const k of C.ORDER) {
    const P = C.PLANS[k], b = h('button', 'ag-chip', `${P.name}`); b.type = 'button'; b.dataset.plan = k; b.setAttribute('aria-pressed', k === S.plan ? 'true' : 'false');
    b.setAttribute('aria-label', `${P.name}, your price ${C.price(P.price)}`);
    b.addEventListener('click', () => { loadPlan(k); syncInputs(true); render(); }); plans.appendChild(b);
  }
  const P = C.PLANS[S.plan]; $('planNote').textContent = `${P.name}: ${P.note}. Your price ${C.price(P.price)}, one time.`;
  const sh = $('shares'); clear(sh);
  for (const s of C.SHARES) {
    const b = h('button', 'ag-chip', `${Math.round(s * 100)}%`); b.type = 'button'; b.dataset.share = String(s); b.setAttribute('aria-pressed', s === S.inp.share ? 'true' : 'false');
    b.setAttribute('aria-label', `Risk ${Math.round(s * 100)} percent of the drawdown left`);
    b.addEventListener('click', () => { S.inp.share = s; render(); }); sh.appendChild(b);
  }
}

function syncInputs(all) {
  const set = (id, v) => { const el = $(id); if (el && (all || document.activeElement !== el)) el.value = String(Math.round(v * 100) / 100); };
  set('stop', S.inp.stop); set('bal', S.inp.balance); set('best', S.inp.best); set('lost', S.inp.lost);
  $('srcNote').textContent = S.live ? 'Filled from the live account on this site. Change any number to try a case.' : S.demo ? 'EXAMPLE numbers (demo). Type your own balance, best day and loss.' : 'Starting values of a fresh account. Type your own balance, best day and loss.';
}

function renderAnswer(c) {
  const pill = $('ansPill'); pill.textContent = c.micros === 0 ? 'No trade' : { ok: 'Safe distance', warn: 'Getting close', bad: 'Very close' }[c.level]; pill.className = 'pill ' + c.level;
  $('micros').textContent = c.micros === 0 ? '0 micros' : `${c.micros} micro${c.micros === 1 ? '' : 's'}`;
  const tiles = $('tiles'); clear(tiles);
  const tile = (k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); tiles.appendChild(t); };
  tile('One loss costs', `-${C.money(c.risk)}`, c.risk ? '-1.0R' : 'no trade', 'neg');
  tile('At 8R it pays', C.moneyS(8 * c.risk), c.risk ? '+8.0R' : 'no trade', 'pos');
  tile('Per micro', C.money(c.perMicro), `${C.fmtPts(c.stop)} pts x $2 + $${c.comm.toFixed(2)}`);
  const ul = $('lines'); clear(ul); for (const l of c.lines) ul.appendChild(h('li', '', l));
}

function renderFloor(c) {
  $('dd').textContent = c.dead ? 'Drawdown left $0 of ' + C.money(c.mll) + ' max loss' : C.drawdownLine(c.room, c.mll);
  const bar = $('bar'); bar.className = 'ag-bar ' + (c.roomFrac < 0.25 ? 'red' : c.roomFrac < 0.5 ? 'amber' : 'green'); bar.firstElementChild.style.width = Math.round(c.roomFrac * 100) + '%';
  bar.setAttribute('aria-label', `${Math.round(c.roomFrac * 100)} percent of the max loss is left`);
  const kv = $('facts'); clear(kv);
  const row = (k, v, cls) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', cls || '', v)); };
  row('Trailing floor', C.money(c.floor) + (c.locked ? ' (locked)' : '')); row('Balance', C.money(c.balance));
  row('Daily loss left', `${C.money(c.dllLeft)} of ${C.money(c.dll)}`);
  if (c.micros) { row('After one full stop-out', C.drawdownLine(c.roomAfter, c.mll).replace('Drawdown left ', '')); }
}

function renderTarget(c) {
  const kv = $('tgt'); clear(kv);
  const row = (k, v, cls) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', cls || '', v)); };
  row('Profit target', C.money(c.target)); row('Profit so far', C.moneyS(c.profit), sign(c.profit));
  row('Still to make', c.passed ? 'Target reached' : C.money(c.toTarget));
  if (c.micros && !c.passed) {
    row('In points at this size', `${Math.round(c.ptsToTarget)} pts`); row('In R at this risk', `${(c.toTarget / c.risk).toFixed(1)}R`);
    for (const w of c.wins) row(`Wins of ${w.r}R (${C.moneyS(w.usd)})`, `${w.wins} to go`);
  }
  $('tgtNote').textContent = c.micros ? 'One win of 8R is the bot\'s usual banked target. 1R is the loss shown above.' : 'No size today, so there is no target path to show.';
}

function renderLadder(c) {
  const body = $('ladRows'); clear(body);
  const stops = C.LADDER.includes(c.stop) ? C.LADDER : [...C.LADDER, c.stop].sort((a, b) => a - b);
  for (const r of C.ladder(S.plan, S.inp, S.rules, stops)) {
    const tr = h('tr', r.stop === c.stop ? 'me' : ''); tr.appendChild(h('td', '', `${C.fmtPts(r.stop)} pts`)); tr.appendChild(h('td', '', r.micros ? `${r.micros}` : '0 (no trade)')); tr.appendChild(h('td', '', r.micros ? `${C.money(r.risk)} (1R)` : '$0'));
    body.appendChild(tr);
  }
}

function render() {
  const c = C.calc(S.plan, S.inp, S.rules); S.calc = c;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  if (!S.built) { S.built = true; }
  renderControls(); syncInputs(false); renderAnswer(c); renderFloor(c); renderTarget(c); renderLadder(c);
  const pl = $('price'); clear(pl); for (const l of C.priceLines(S.plan, S.rules)) pl.appendChild(h('li', '', l));
  const rl = $('rules'); clear(rl); for (const l of C.ruleLines(S.plan, S.rules)) rl.appendChild(h('li', '', l));
  say(c.micros ? `${c.name}: ${c.micros} micros at a ${C.fmtPts(c.stop)}-point stop, ${C.money(c.risk)} at risk. ${C.drawdownLine(c.room, c.mll)}.` : `${c.name}: no trade at a ${C.fmtPts(c.stop)}-point stop. ${C.drawdownLine(c.room, c.mll)}.`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function bind() {
  const read = (id, key, lo, hi) => { const v = parseFloat($(id).value); if (Number.isFinite(v)) { S.inp[key] = Math.min(hi, Math.max(lo, v)); render(); } };
  $('stop').addEventListener('input', () => read('stop', 'stop', 0.25, 500));
  $('bal').addEventListener('input', () => read('bal', 'balance', 0, 200000));
  $('best').addEventListener('input', () => read('best', 'best', 0, 200000));
  $('lost').addEventListener('input', () => read('lost', 'lost', 0, 10000));
  const nudge = (d) => { S.inp.stop = Math.min(500, Math.max(0.25, (parseFloat(S.inp.stop) || 20) + d)); syncInputs(true); render(); };
  $('stopDown').addEventListener('click', () => nudge(-5)); $('stopUp').addEventListener('click', () => nudge(5));
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, rules] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('../ledger/rules.json')]);
  S.fixture = fx; S.home = home; S.rules = rules;
  const p = q.get('plan'); loadPlan(p && C.PLANS[p] ? p : 'b50');
  const st = parseFloat(q.get('stop')); if (Number.isFinite(st) && st > 0) S.inp.stop = Math.min(500, Math.max(0.25, st));
  const sh = parseFloat(q.get('share')); if (C.SHARES.includes(sh)) S.inp.share = sh;
  bind(); syncInputs(true); render();
}
window.PNYX = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Pnyx could not start'); } catch (_) { /* nothing */ } });
