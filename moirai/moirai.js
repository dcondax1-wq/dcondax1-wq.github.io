// MOIRAI page (ES module): the three fates. Sliders for the odds of a trade, a seeded Monte-Carlo of the MFFU Builder 50K challenge (1,000 paths, run in small chunks so the phone never freezes)
// and the answer: chance to pass, to bust, sessions to pass, p10 / f10 / dec10, a fan chart and what the odds are worth. A SIMULATION, NOT A FORECAST.
// Reads fixture.json (the bot's own 2026 numbers as defaults, never blank) and ../ledger/rules.json (the 50K limits and the owner's price). Keeps only its sliders on this phone ('moirai.v1'); sends nothing.
// Text only through textContent / createElementNS. window.MOIRAI is the test hook. ?win=30&risk=1&seed=7 opens a case.
import * as C from './moiraicore.js';
import { createLoom } from './moiraiscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg', KEY = 'moirai.v1';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, rules: null, inp: { ...C.DEFAULTS }, p: null, sum: null, run: null, scene: null, mode: 'none', ready: false, runs: 0, timer: 0, preset: 'lit26' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S.inp)); } catch (_) { /* private mode */ } }
function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }

function limits() {
  const fx = S.fixture && S.fixture.rules ? S.fixture.rules : {}, r = S.rules, o = { horizon: fx.horizon, cons: fx.cons };
  for (const k of C.PLAN_ORDER) o[k] = { ...(fx[k] || {}) };
  const lim = r && r.limits ? r.limits : {}, pl = r && r.plans ? r.plans : {};
  for (const [k, src] of [['b50', 'builder_50k'], ['atlas', 'builder_25k'], ['blitz', 'builder_25k']]) {
    if (lim[src]) for (const f of ['target', 'mll', 'lock', 'dll']) if (lim[src][f] > 0) o[k][f] = lim[src][f];
  }
  if (pl.builder_50k && pl.builder_50k.price_owner > 0) o.b50.price = pl.builder_50k.price_owner;
  if (pl.builder_25k && pl.builder_25k.price_owner_atlas > 0) o.atlas.price = pl.builder_25k.price_owner_atlas;
  if (pl.builder_25k && pl.builder_25k.price_owner > 0) o.blitz.price = pl.builder_25k.price_owner;
  return o;
}
function renderRules(p) {
  const chips = (id, items, cur, on, label) => { const box = $(id); clear(box); for (const [v, text] of items) { const b = h('button', 'ag-chip', text); b.type = 'button'; b.dataset.v = String(v); b.setAttribute('aria-pressed', v === cur ? 'true' : 'false'); b.setAttribute('aria-label', label + ' ' + text); b.addEventListener('click', () => { on(v); update(true); }); box.appendChild(b); } };
  chips('plans', C.PLAN_ORDER.map((k) => [k, C.PLANS[k].name]), p.plan, (v) => { S.inp.plan = v; }, 'Account');
  chips('minDays', [[1, '1 day'], [2, '2 days']], p.min_days, (v) => { S.inp.min_days = v; }, 'Minimum days');
  chips('maxTrades', [[1, 'One'], [2, 'Two'], [3, 'Three']], p.max_trades, (v) => { S.inp.max_trades = v; }, 'Most trades a day');
  chips('consBox', [[0, 'Off (MFFU eval has none)'], [1, 'On: 50% best day']], p.cons_on, (v) => { S.inp.cons_on = v; }, 'Best-day rule');
  const R = p.rules, n = S.fixture && S.fixture.rules && S.fixture.rules.notes ? S.fixture.rules.notes : {};
  $('planNote').textContent = `${R.plan}: start ${C.money(R.start)}, target ${C.moneyS(R.target)}, trailing max loss ${C.money(R.mll)} (locks ${C.money(R.lock)} above the start), daily loss ${C.money(R.dll)}, your price ${C.money(R.price)}. ${R.key === 'b50' ? '' : 'The odds below are LIT\'s until you change them: ATLAS and BLITZ have their own.'}`;
  $('rulesNote').textContent = [n.min_days, n.consistency, n.dll].filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ controls
const SL = [['win', 'win', 100], ['scr', 'scratch', 100], ['aw', 'avg_win_r', 1], ['al', 'avg_loss_r', 1], ['tpw', 'tpw', 1], ['risk', 'risk_pct', 1]];
function syncSliders(p) {
  for (const [id, key, k] of SL) { const el = $(id); if (el && document.activeElement !== el) el.value = String(Math.round((key === 'win' ? p.win : key === 'scratch' ? p.scratch : p[key]) * k * 100) / 100); }
  $('seed').value = String(p.seed);
}
function labels(p) {
  const R = p.rules, loss = p.loss;
  $('winL').textContent = `Win rate ${C.pct(p.win)} of trades`;
  $('scrL').textContent = `Break-even trades ${C.pct(p.scratch)} (and losses ${C.pct(loss)})`;
  $('awL').textContent = `Average win ${C.both(p.avg_win_r, p.oneR)}`;
  $('alL').textContent = `Average loss ${C.both(-p.avg_loss_r, p.oneR)}`;
  $('tpwL').textContent = `${p.tpw.toFixed(2).replace(/0$/, '')} trades a week (the bot takes at most one a day)`;
  $('riskL').textContent = `Risk per trade ${p.risk_pct.toFixed(2).replace(/0$/, '')}% of $${R.start.toLocaleString('en-US')}: 1R = ${C.money(p.oneR)}`;
  $('expNote').textContent = Math.abs(p.expR) < 0.005 ? `On these odds an average trade makes nothing (0.0R, zero dollars): only luck and the rules decide how the eval ends.` : p.expR > 0 ? `On these odds an average trade makes ${C.both(p.expR, p.oneR)}.` : `On these odds an average trade loses ${C.both(p.expR, p.oneR)}: the simulation shows how the eval then ends.`;
}
function renderPresets() {
  const box = $('presets'); clear(box);
  for (const pr of (S.fixture && S.fixture.presets) || []) {
    const b = h('button', 'ag-chip', pr.label); b.type = 'button'; b.dataset.preset = pr.id; b.setAttribute('aria-pressed', pr.id === S.preset ? 'true' : 'false');
    b.addEventListener('click', () => { S.preset = pr.id; S.inp = { ...S.inp, win: pr.win, scratch: pr.scratch, avg_win_r: pr.avg_win_r, avg_loss_r: pr.avg_loss_r, tpw: pr.tpw, risk_pct: pr.risk_pct }; update(true); });
    box.appendChild(b);
  }
  const s = S.fixture && S.fixture.source;
  $('srcNote').textContent = s ? `LIT 2026 is the bot's own backtest, costs in: ${s.trades} trades from ${s.from} to ${s.to}, ${C.moneyS(s.pnl_usd)}. These are inputs for a simulation, not results of any eval.` : 'Default odds. A simulation input, not a result.';
}

// ------------------------------------------------------------------ results
function tile(parent, id, label, share, n) {
  const t = h('div', 'tile ' + id); t.appendChild(h('small', '', label)); t.appendChild(h('b', 'ag-num', C.pct(share))); t.appendChild(h('span', '', `${Math.round(share * n)} of ${n} paths`)); parent.appendChild(t);
}
function kv(el, rows) { clear(el); for (const [k, v, c] of rows) { el.appendChild(h('dt', '', k)); el.appendChild(h('dd', c || '', v)); } }
function renderResults(sum, p) {
  const R = p.rules, f = $('fates'); clear(f);
  for (const x of C.fates(sum)) tile(f, x.id, x.id === 'open' ? `Still open after ${R.horizon}` : x.label, x.share, sum.n);
  const med = sum.pass_med == null ? 'no path passed' : `${Math.round(sum.pass_med)} sessions (about ${(sum.pass_med / 5).toFixed(1)} weeks)`;
  $('headline').textContent = `${C.pct(sum.p15)} pass within 15 sessions, ${C.pct(sum.f15)} bust within 15. Median time to pass: ${med}.`;
  $('honest').textContent = C.NOTE;
  kv($('kv'), [
    ['Pass within 10 sessions (p10)', C.pct(sum.p10, 1), 'pos'], ['Bust within 10 sessions (f10)', C.pct(sum.f10, 1), 'neg'], ['Decided within 10 (dec10)', C.pct(sum.dec10, 1)],
    ['Pass within 15 sessions (p15)', C.pct(sum.p15, 1), 'pos'], ['Bust within 15 sessions (f15)', C.pct(sum.f15, 1), 'neg'], ['Decided within 15 (dec15)', C.pct(sum.dec15, 1)],
    [`Pass within ${R.horizon} sessions`, C.pct(sum.pass, 1), 'pos'], [`Bust within ${R.horizon} sessions`, C.pct(sum.bust, 1), 'neg'],
    ['Passes slower than 15 sessions (slow_pass)', C.pct(sum.slow_pass, 1)], ['Median sessions to pass (pass_med)', sum.pass_med == null ? '-' : String(Math.round(sum.pass_med * 10) / 10)]]);
  $('resNote').textContent = `${sum.n.toLocaleString('en-US')} paths, seed ${p.seed}: the same seed always gives these numbers. A session is one trading day. Bust = touching the trailing floor (highest end-of-day balance minus ${C.money(R.mll)}).`;
  const e = sum.expected;
  kv($('cash'), [['One loss (1R)', C.both(-1, p.oneR), 'neg'], ['A win of the average size', C.both(p.avg_win_r, p.oneR), 'pos'], ['Average trade', C.both(e.r, p.oneR), e.r >= 0 ? 'pos' : 'neg'],
    ['Average week', `${C.moneyS(e.week)} (${C.rS(e.r * p.tpw)})`, e.week >= 0 ? 'pos' : 'neg'], ['Average month', `${C.moneyS(e.month)} (${C.rS(e.r * p.tpw * 52 / 12)})`, e.month >= 0 ? 'pos' : 'neg'],
    ['Profit target', `${C.moneyS(R.target)} (${C.rS(R.target / p.oneR)})`], ['Eval fee', C.money(R.price)], ['Fees to land one pass (estimate)', sum.fees == null ? 'no path passed' : C.money(sum.fees)]]);
  $('cashNote').textContent = 'Fees to land one pass = the eval price divided by the chance to pass, if every failed try is bought again. An estimate, not a promise.';
  const bit = $('bit'); clear(bit); for (const l of C.rulesWords(sum, p)) bit.appendChild(h('li', '', l));
  const sc = S.scene; if (sc) sc.set({ pass: sum.pass, bust: sum.bust, open: sum.open }); else drawFallback(sum);
  drawFan(sum, p);
  say(`${C.pct(sum.pass)} pass, ${C.pct(sum.bust)} bust, ${C.pct(sum.open)} still open after ${R.horizon} sessions. A simulation, not a forecast.`);
}
function drawFan(sum, p) {
  const svg = $('fan'); clear(svg); const R = p.rules;
  const W = 320, H = 200, L = 48, Rr = 8, T = 10, B = 26, n = sum.horizon, top = R.start + R.target, floor0 = R.start - R.mll, lo = floor0 - 300, hi = top + 400;
  const x = (i) => L + (i / n) * (W - L - Rr), y = (v) => T + (1 - (C.clamp(v, lo, hi) - lo) / (hi - lo)) * (H - T - B);
  for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, yy = y(v); svg.appendChild(sv('line', { x1: L, x2: W - Rr, y1: yy, y2: yy, class: 'grid' })); const t = sv('text', { x: L - 4, y: yy + 3, 'text-anchor': 'end' }); t.textContent = '$' + Math.round(v).toLocaleString('en-US'); svg.appendChild(t); }
  for (const d of [0, 10, 15, n]) { const xx = x(d); if (d === 10 || d === 15) svg.appendChild(sv('line', { x1: xx, x2: xx, y1: T, y2: H - B, class: 'grid v' })); const t = sv('text', { x: xx, y: H - 10, 'text-anchor': 'middle' }); t.textContent = d === 0 ? 'start' : `day ${d}`; svg.appendChild(t); }
  const area = (a, b, cls) => { const up = sum.bands.map((c, i) => `${x(i).toFixed(1)},${y(c[a]).toFixed(1)}`), dn = sum.bands.map((c, i) => `${x(i).toFixed(1)},${y(c[b]).toFixed(1)}`).reverse(); svg.appendChild(sv('polygon', { class: cls, points: up.concat(dn).join(' ') })); };
  area(0, 4, 'band outer'); area(1, 3, 'band inner');
  for (const path of sum.sample) svg.appendChild(sv('polyline', { class: 'thread', points: path.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }));
  svg.appendChild(sv('polyline', { class: 'mid', points: sum.bands.map((c, i) => `${x(i).toFixed(1)},${y(c[2]).toFixed(1)}`).join(' ') }));
  svg.appendChild(sv('line', { x1: L, x2: W - Rr, y1: y(top), y2: y(top), class: 'tgt' })); svg.appendChild(sv('line', { x1: L, x2: W - Rr, y1: y(floor0), y2: y(floor0), class: 'flr' }));
  svg.setAttribute('aria-label', `Equity paths over ${n} sessions: the middle path ends near ${C.money(sum.bands[n][2])}; the target is ${C.money(top)} and the starting floor ${C.money(floor0)}.`);
  $('fanNote').textContent = `The gold line is the middle path, the shaded bands hold half and eight in ten of the paths, the thin lines are ${sum.sample.length} single paths. A path stops at the target or at the floor.`;
}
function drawFallback(sum) {
  const svg = $('loomFallback'); svg.removeAttribute('hidden'); $('loom').hidden = true; clear(svg);
  [['pass', sum.pass, '#7f8a52'], ['bust', sum.bust, '#c96a4a'], ['open', sum.open, '#c8a24a']].forEach(([id, v, col], i) => { const hgt = Math.max(2, v * 80); svg.appendChild(sv('rect', { x: 14 + i * 36, y: 90 - hgt, width: 28, height: hgt, rx: 4, fill: col })); });
}

// ------------------------------------------------------------------ the run
function update(syncAll) {
  S.p = C.clean(S.inp, limits()); S.inp = { ...S.inp, ...Object.fromEntries(['win', 'scratch', 'avg_win_r', 'avg_loss_r', 'tpw', 'risk_pct', 'seed', 'plan', 'min_days', 'max_trades', 'cons_on'].map((k) => [k, S.p[k]])) };
  syncSliders(S.p);
  labels(S.p); renderPresets(); renderRules(S.p); save();
  if (S.run) S.run.cancel();
  const token = ++S.runs; $('runPill').textContent = 'Running...'; $('runPill').className = 'pill info';
  S.run = C.runChunked(S.p, { chunk: 100, onProgress: (f) => { if (token === S.runs) $('runPill').textContent = `Running ${Math.round(f * 100)}%`; } });
  S.run.promise.then((sum) => {
    if (!sum || token !== S.runs) return;
    S.sum = sum; S.done = token; $('runPill').textContent = `${sum.n.toLocaleString('en-US')} paths`; $('runPill').className = 'pill ok';
    renderResults(sum, S.p); S.ready = true;
    try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  });
}
function bind() {
  const on = (id, key, k) => $(id).addEventListener('input', () => { const v = parseFloat($(id).value); if (!Number.isFinite(v)) return; S.inp[key] = v / k; S.preset = ''; clearTimeout(S.timer); labels(C.clean(S.inp, limits())); S.timer = setTimeout(() => update(false), 140); });
  for (const [id, key, k] of SL) on(id, key, k);
  $('seed').addEventListener('input', () => { const v = parseFloat($('seed').value); if (Number.isFinite(v)) { S.inp.seed = v; clearTimeout(S.timer); S.timer = setTimeout(() => update(false), 200); } });
  $('reseed').addEventListener('click', () => { S.inp.seed = Math.floor(Math.random() * 1e9); update(true); });
}

async function boot() {
  const [fx, rules] = await Promise.all([getJSON('./fixture.json'), getJSON('../ledger/rules.json')]);
  S.fixture = fx || { defaults: C.DEFAULTS, presets: [], rules: C.RULES }; S.rules = rules;
  const d = S.fixture.defaults || {};
  S.inp = { ...C.DEFAULTS, plan: 'b50', win: d.win, scratch: d.scratch, avg_win_r: d.avg_win_r, avg_loss_r: d.avg_loss_r, tpw: d.tpw, risk_pct: d.risk_pct, seed: d.seed };
  const sv0 = load(); if (sv0 && typeof sv0 === 'object') { for (const k of Object.keys(S.inp)) { const v = C.num(sv0[k]); if (v != null) S.inp[k] = v; } if (C.PLANS[sv0.plan]) S.inp.plan = sv0.plan; S.preset = ''; }
  const q = new URLSearchParams(location.search);
  if (C.PLANS[q.get('plan')]) S.inp.plan = q.get('plan');
  for (const [qk, key] of [['mindays', 'min_days'], ['trades', 'max_trades'], ['cons', 'cons_on']]) { const v = parseFloat(q.get(qk)); if (Number.isFinite(v)) S.inp[key] = v; }
  if (q.get('demo') !== '1') { /* nothing else to load: the fixture is the data */ } else { S.inp = { ...S.inp, plan: 'b50', min_days: 2, max_trades: 1, cons_on: 0, win: d.win, scratch: d.scratch, avg_win_r: d.avg_win_r, avg_loss_r: d.avg_loss_r, tpw: d.tpw, risk_pct: d.risk_pct, seed: d.seed }; S.preset = 'lit26'; }
  for (const [qk, key, k] of [['win', 'win', 100], ['scratch', 'scratch', 100], ['aw', 'avg_win_r', 1], ['al', 'avg_loss_r', 1], ['tpw', 'tpw', 1], ['risk', 'risk_pct', 1], ['seed', 'seed', 1]]) { const v = parseFloat(q.get(qk)); if (Number.isFinite(v)) { S.inp[key] = v / k; S.preset = ''; } }
  try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  bind();
  try { S.scene = createLoom($('loom'), { O }); } catch (_) { S.scene = null; }
  S.mode = S.scene ? 'webgl' : 'flat';
  update(true);
}
window.MOIRAI = { S, C, ready: () => S.ready, scene: () => S.scene, update };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Moirai could not start'); } catch (_) { /* nothing */ } });
