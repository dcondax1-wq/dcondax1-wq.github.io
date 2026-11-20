// AEGIS page (ES module): the shield. A risk guard for the three MFFU accounts. Reads ../home.json (live accounts), ../ledger/rules.json (MFFU's limits) and fixture.json (DEMO, never blank).
// Read only: it warns and never blocks or places anything; it sends nothing and keeps nothing. Text only through textContent. window.AEGIS is the test hook.
// ?acct=zlarior|atlas|blitz&risk=300&demo=1 opens a given view.
import * as C from './aegiscore.js';
import * as HF from '../olympus/hero-flat.js';
import * as T from '../olympus/truth.js';
const nameOf = (a) => (String(a.name || '').includes(String(a.size || '~')) || !a.size ? String(a.name || '') : `${a.name} ${a.size}`);   // day-arenas: never 'Zlarior 25K #2 25K'

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, home: null, ages: null, rules: null, built: null, key: 'zlarior', risk: null, demo: false, forced: false, shield: null, mode: 'flat', ready: false, reason: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const cur = () => S.built.accounts.find((a) => a.key === S.key) || S.built.accounts[0];
const riskOf = (a) => (S.risk != null ? S.risk : a.risk);
const LEVEL = { ok: 'ok', warn: 'warn', bad: 'bad', off: '' };

function renderChips() {
  const box = $('accts'); clear(box);
  for (const a of S.built.accounts) {
    const b = h('button', 'ag-chip', nameOf(a)); b.type = 'button'; b.dataset.acct = a.key; b.setAttribute('aria-pressed', a.key === S.key ? 'true' : 'false');
    b.addEventListener('click', () => { S.key = a.key; S.risk = null; render(); }); box.appendChild(b);
  }
}

function renderFlat(f) {
  // the painted twin of the 3D aspis (olympus/hero-flat.js): a round bronze shield on a marble stand at golden hour; the gold rim is the drawdown left
  const svg = $('flat'); clear(svg);
  const P = HF.paint(svg, { w: 200, h: 230, sky: 'golden', horizon: 0.8, sunX: 0.8, sunY: 0.55, templeX: 0.16 });
  P.shadow(100, 214, 70, 7);
  P.steps(100, 200, 120, 2, { stepH: 7, run: 8, band: true });
  const cx = 100, cy = 112, R = 80, d = `M${cx} ${cy - R} A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`;
  P.el('circle', { cx: cx + 3, cy: cy + 4, r: R + 2, fill: '#1a1008', opacity: 0.35 });
  svg.appendChild(sv('path', { d, fill: P.F.bronze, stroke: '#3e2c1c', 'stroke-width': 9, 'stroke-linejoin': 'round', pathLength: 100 }));
  P.el('circle', { cx: cx - 18, cy: cy - 20, r: R * 0.62, fill: '#ffe2b0', opacity: 0.16 });
  P.el('circle', { cx, cy, r: R * 0.78, fill: 'none', stroke: '#4a2c14', 'stroke-opacity': 0.45, 'stroke-width': 1.5 });
  P.el('circle', { cx, cy, r: R * 0.64, fill: 'none', stroke: '#4a2c14', 'stroke-opacity': 0.45, 'stroke-width': 1.5 });
  svg.appendChild(sv('path', { d, fill: 'none', stroke: '#f0c860', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 100, 'stroke-dasharray': `${Math.round(f * 100 * 10) / 10} 100`, class: 'rim' }));
  P.coin(cx, cy, 24);
  P.vignette();
}

function renderShield(a) {
  const sh = C.shieldOf(a), hl = C.health(a), f = sh.rim;
  const pill = $('pill'); pill.textContent = hl.text; pill.className = 'pill ' + (LEVEL[hl.level] || '');
  $('dd').textContent = a.has && a.room != null ? C.drawdownLine(a.room, a.mll) : `No live numbers for ${a.name} yet (max loss ${C.money(a.mll)})`;
  const bar = $('bar'); bar.className = 'ag-bar ' + (f == null ? 'amber' : f < 0.25 ? 'red' : f < 0.5 ? 'amber' : 'green'); bar.firstElementChild.style.width = Math.round((f == null ? 0 : f) * 100) + '%';
  bar.setAttribute('aria-label', f == null ? 'No live numbers' : `${Math.round(f * 100)} percent of the max loss left`);
  renderFlat(f == null ? 0 : f);
  if (S.shield && S.shield.ok) S.shield.set({ rim: f == null ? 0 : f, level: hl.level });
  const t = $('tiles'); clear(t);
  const tile = (k, v, n, cls) => { const e = h('div', 'tile'); e.appendChild(h('small', '', k)); e.appendChild(h('b', cls || '', v)); e.appendChild(h('span', '', n)); t.appendChild(e); };
  const r = riskOf(a);
  tile('Balance', a.balance == null ? '-' : C.money(a.balance), a.kind === 'funded' ? 'funded' : a.kind === 'paper' ? 'paper shadow' : 'eval');
  tile('Floor (trailing)', a.floor == null ? '-' : C.money(a.floor), 'the account ends here');
  const dl = C.dllLeft(a);
  tile('Daily loss left', dl == null ? '-' : C.money(dl), `of ${C.money(a.dll)} (soft)`);
  tile('Today', C.moneyS(a.today), C.rText(a.today, r, a.est), a.today > 0 ? 'pos' : a.today < 0 ? 'neg' : '');
}

function renderWhatIf(a) {
  const r = riskOf(a);
  const w = C.whatIf(a, r);
  $('risk').value = String(Math.round(r * 100) / 100);
  $('ifLine').textContent = w.text;
  const ul = $('ifLines'); clear(ul); for (const l of w.lines) ul.appendChild(h('li', '', l));
  $('ifLine').className = 'big2 ag-num ' + ({ ok: '', warn: 'warnc', bad: 'neg' }[w.level] || '');
  const q = $('quick'); clear(q);
  for (const [k, m] of [['1 stop', 1], ['2 stops', 2], ['Half stop', 0.5]]) {
    const v = Math.round(a.risk * m), b = h('button', 'ag-chip', `${k} ${C.money(v)}`); b.type = 'button'; b.dataset.risk = String(v); b.setAttribute('aria-pressed', v === Math.round(r) ? 'true' : 'false');
    b.addEventListener('click', () => { S.risk = v; renderWhatIf(cur()); say(C.whatIf(cur(), v).text); }); q.appendChild(b);
  }
}

function renderLocks(a) {
  const ul = $('locks'); clear(ul);
  const L = C.lockouts(a);
  if (!L.length) { ul.appendChild(h('li', 'lock', 'No live numbers yet, so there is nothing to check. The rules below still apply.')); return; }
  for (const l of L) {
    const li = h('li', 'lock ' + l.level); const top = h('div', 'row'); top.appendChild(h('b', '', l.title));
    top.appendChild(h('span', 'pill ' + ({ ok: 'ok', warn: 'warn', bad: 'bad' }[l.level]), l.level === 'ok' ? 'Not hit' : l.level === 'warn' ? 'Hit: stop' : 'Over')); li.appendChild(top);
    li.appendChild(h('span', '', l.why)); ul.appendChild(li);
  }
}

function renderAll() {
  const ul = $('all'); clear(ul);
  for (const a of S.built.accounts) {
    const hl = C.health(a), li = h('li'), b = h('button', 'acard'); b.type = 'button'; b.setAttribute('aria-pressed', a.key === S.key ? 'true' : 'false'); b.dataset.acct = a.key;
    b.appendChild(h('b', '', nameOf(a))); b.appendChild(h('span', 'pill ' + (LEVEL[hl.level] || ''), hl.text));
    b.appendChild(h('small', '', a.has && a.room != null ? C.drawdownLine(a.room, a.mll) : 'No live numbers yet'));
    b.addEventListener('click', () => { S.key = a.key; S.risk = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    li.appendChild(b); ul.appendChild(li);
  }
}

function render() {
  const a = cur();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderChips(); renderShield(a); renderWhatIf(a); renderLocks(a); renderAll();
  const rl = $('rules'); clear(rl); for (const l of C.ruleLines(a)) rl.appendChild(h('li', '', l));
  say(C.sayLine(a));
  $('src').textContent = S.forced ? 'Example numbers (?demo=1): open the page without it for the live accounts.' : S.demo ? 'Example numbers (fixture.json): home.json has no live accounts yet.'
    : S.ages ? 'Source: home.json (the PC\'s report via the cloud). ' + S.ages.line + (S.ages.stale ? ' They may be out of date.' : '') : '';
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

// shield.js is loaded by its own module tag (shieldload.js) so the page still works when three.js or WebGL is missing: wait for it (6 s at most), else keep the flat shield
function waitShield() {
  return new Promise((resolve, reject) => {
    if (window.__aegisShield) { resolve(window.__aegisShield); return; }
    const done = (v, e) => { clearTimeout(tm); window.removeEventListener('aegis-shield', on); if (e) reject(e); else resolve(v); };
    const on = () => done(window.__aegisShield);
    const tm = setTimeout(() => done(null, new Error('the 3D shield did not load')), 6000);
    window.addEventListener('aegis-shield', on);
  });
}

async function startShield() {
  const canvas = $('stage'), flat = $('flat');
  let T = null;
  try { T = await waitShield(); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (T) {
    let t = null;
    try { t = T.createShield(canvas, { reduced }); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
    if (t && t.ok) { S.shield = t; S.mode = '3d'; canvas.hidden = false; flat.setAttribute('hidden', ''); const f = C.rimFraction(cur()); t.set({ rim: f == null ? 0 : f }); document.documentElement.dataset.aegis = '3d'; return; }
    if (t && t.reason) S.reason = t.reason;
  }
  S.mode = 'flat'; canvas.hidden = true; flat.removeAttribute('hidden'); document.documentElement.dataset.aegis = 'flat';
}

function bind() {
  const read = () => { const v = parseFloat($('risk').value); if (Number.isFinite(v) && v >= 0) { S.risk = Math.min(20000, v); renderWhatIf(cur()); renderShield(cur()); say(C.whatIf(cur(), S.risk).text); } };
  $('risk').addEventListener('input', read);
  const nudge = (d) => { S.risk = Math.max(1, Math.min(20000, (S.risk != null ? S.risk : cur().risk) + d)); renderWhatIf(cur()); renderShield(cur()); say(C.whatIf(cur(), S.risk).text); };
  $('riskDown').addEventListener('click', () => nudge(-25)); $('riskUp').addEventListener('click', () => nudge(25));
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, rules] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('../ledger/rules.json')]);
  // the account numbers and their age come from the shared truth (olympus/truth.js: home.json's board first, the same as Home and NQ)
  const canon = !S.forced && home ? T.canonHome(await T.withPcFeed(home)) : null;
  S.fixture = fx; S.home = canon; S.rules = rules; S.ages = canon ? canon.truth.ages : null;
  S.built = C.buildAccounts(canon, fx, rules); S.demo = S.built.demo || S.forced;
  const k = q.get('acct'); if (C.ORDER.includes(k)) S.key = k;
  const r = parseFloat(q.get('risk')); if (Number.isFinite(r) && r > 0) S.risk = Math.min(20000, r);
  bind(); render();
  await startShield();
  const f = C.rimFraction(cur()); if (S.shield && S.shield.ok) S.shield.set({ rim: f == null ? 0 : f });
  S.ready = true;
}
window.AEGIS = { S, C, ready: () => S.ready, render, get mode() { return S.mode; }, get shield() { return S.shield; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Aegis could not start'); } catch (_) { /* nothing */ } });
