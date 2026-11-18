// DEMETER page (ES module): account health. One dial per account (drawdown left), the trailing floor, the payout rules in plain words, days to the typical first payout and a what-if for the size
// (0.5x to 2x). Reads home.json, ledger/rules.json, plutus/roadmap.json and fixture.json (DEMO). Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS.
// window.DEMETER is the test hook. ?acct=atlas&size=1.5 opens a given account and size.
import * as C from './demetercore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const COL = { ok: '#7f8a52', warn: '#e0b060', bad: '#c96a4a', off: '#5b5144' };
const S = { fixture: null, home: null, rules: null, roadmap: null, accounts: [], demo: false, forced: false, sel: 'zlarior', mult: 1, ready: false, today: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const cur = () => S.accounts.find((a) => a.key === S.sel) || S.accounts[0];

function dialSvg(a, small) {
  const hl = C.health(a), d = C.dial(hl.f == null ? 0 : hl.f), svg = sv('svg', { viewBox: small ? '0 0 200 112' : '0 0 200 120', class: small ? 'dial small' : 'dial', role: 'img', 'aria-hidden': small ? 'true' : 'false' });
  if (!small) svg.setAttribute('aria-label', a.room != null ? C.drawdownLine(a.room, a.mll) : 'Drawdown not reported');
  svg.appendChild(sv('path', { d: d.track, fill: 'none', stroke: '#2b251d', 'stroke-width': 16, 'stroke-linecap': 'round' }));
  if (d.arc && hl.f != null) svg.appendChild(sv('path', { d: d.arc, fill: 'none', stroke: COL[d.level], 'stroke-width': 16, 'stroke-linecap': 'round' }));
  svg.appendChild(sv('text', { x: 100, y: small ? 84 : 82, 'text-anchor': 'middle', fill: '#f3ece0', 'font-size': small ? 30 : 34, 'font-weight': 700, 'font-family': 'var(--ag-num)' }, a.room != null ? C.money(a.room) : 'n/a'));
  svg.appendChild(sv('text', { x: 100, y: small ? 104 : 106, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 13 }, a.room != null ? `of ${C.money(a.mll)} left` : 'not reported'));
  return svg;
}

function renderPicker() {
  const box = $('pick'); clear(box);
  for (const a of S.accounts) {
    const b = h('button', 'pickbtn'); b.type = 'button'; b.dataset.key = a.key; b.setAttribute('aria-pressed', a.key === S.sel ? 'true' : 'false');
    b.setAttribute('aria-label', `${a.name} ${a.size}: ${a.room != null ? C.drawdownLine(a.room, a.mll) : 'no numbers yet'}`);
    b.appendChild(dialSvg(a, true)); b.appendChild(h('b', '', a.name)); b.appendChild(h('span', 'note', a.size));
    b.addEventListener('click', () => { S.sel = a.key; render(); }); box.appendChild(b);
  }
}

function renderDial(a) {
  $('dialH').textContent = `${a.name} ${a.size}`;
  const hl = C.health(a), p = $('dialPill'); p.textContent = hl.text; p.className = 'pill ' + (hl.level === 'off' ? '' : hl.level);
  const box = $('dialBox'); clear(box); box.appendChild(dialSvg(a, false));
  $('dd').textContent = a.room != null ? C.drawdownLine(a.room, a.mll) : a.has ? 'Drawdown is not reported yet.' : 'No numbers yet. The dial fills the moment the bot reports this account.';
  const kv = $('facts'); clear(kv);
  if (a.has) for (const [k, v, n] of C.dialFacts(a)) { kv.appendChild(h('dt', '', k)); const dd = h('dd', k === 'Today' ? sign(a.today) : ''); dd.textContent = v; if (n) { dd.appendChild(h('small', 'sub2', n)); } kv.appendChild(dd); }
}

function renderWhatIf(a) {
  const seg = $('mults'); clear(seg);
  for (const m of C.MULTS) {
    const b = h('button', 'ag-chip', `${m}x`); b.type = 'button'; b.dataset.m = String(m); b.setAttribute('aria-pressed', m === S.mult ? 'true' : 'false');
    b.setAttribute('aria-label', `Size ${m} times`); b.addEventListener('click', () => { S.mult = m; renderWhatIf(cur()); say(`${cur().name} at ${m}x size. ${C.whatIf(cur(), m).lines[0] || ''}`); }); seg.appendChild(b);
  }
  const w = C.whatIf(a, S.mult), tiles = $('wiTiles'); clear(tiles);
  const tile = (k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); tiles.appendChild(t); };
  tile('One loss costs', `-${C.money(w.loss)}`, w.lossR, 'neg'); tile('One win pays', C.moneyS(w.win), w.winR, 'pos'); tile('Stops to the limit', w.stops == null ? 'n/a' : String(w.stops), 'in a row', w.level === 'bad' ? 'neg' : '');
  const ul = $('wiLines'); clear(ul); for (const l of w.lines) ul.appendChild(h('li', '', l));
  $('wiNote').textContent = w.note; $('wiH').textContent = `What if ${a.name} traded ${S.mult}x the size?`;
}

function renderPayout(a) {
  const fp = C.firstPayout(S.roadmap, a.road, S.today);
  $('payDays').textContent = fp ? (fp.days > 0 ? `${fp.days} days` : 'Now') : 'n/a';
  $('payText').textContent = fp ? fp.text : 'The study has no first-payout date for this account yet.';
  const ol = $('payPath'); clear(ol); for (const s of C.payoutPath(a)) ol.appendChild(h('li', '', s));
  const ul = $('rules'); clear(ul); for (const s of C.ruleLines(a.L, 'both')) ul.appendChild(h('li', '', s));
}

function render() {
  const a = cur();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderPicker(); renderDial(a); renderWhatIf(a); renderPayout(a);
  const hl = C.health(a);
  say(`${a.name}: ${a.room != null ? C.drawdownLine(a.room, a.mll) : 'no drawdown number yet'}. ${hl.text}.`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, rules, road] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('../ledger/rules.json'), S.forced ? null : getJSON('../plutus/roadmap.json')]);
  S.fixture = fx; S.home = home; S.rules = rules;
  const built = C.buildAccounts(S.forced ? null : home, rules, fx); S.accounts = built.accounts; S.demo = built.demo;
  S.roadmap = road && Array.isArray(road.accounts) ? road : fx && fx.roadmap ? fx.roadmap : null;
  const at = q.get('at'), d = at ? new Date(at) : new Date(); S.today = (Number.isFinite(d.getTime()) ? d : new Date()).toISOString().slice(0, 10);
  const k = q.get('acct'); if (k && S.accounts.some((a) => a.key === k)) S.sel = k; else { const first = S.accounts.find((a) => a.has); if (first) S.sel = first.key; }
  const sz = parseFloat(q.get('size')); if (C.MULTS.includes(sz)) S.mult = sz;
  render();
}
window.DEMETER = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Demeter could not start'); } catch (_) { /* nothing */ } });
