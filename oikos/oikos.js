// OIKOS page (ES module): the household. Reads the Ledger's export (this phone's 'ledger.v1', read only), a file you import or paste, ../money/oikos.json (the offline scanner's copy) or fixture.json (DEMO, never blank),
// and finds the leaks: fees against payouts, resets and subscriptions that do not pay back, accounts that never covered their cost. Then a generic tax set-aside, the four buckets and a reinvest-or-withdraw projector.
// Everything is computed here (oikoscore.js), so it works with no feed. Keeps only its own sliders and an imported ledger on this phone ('oikos.v1'); sends nothing. Text only through textContent. window.OIKOS is the test hook.
// ?demo=1 forces the demo, ?today=YYYY-MM-DD fixes the date (links and tests).
import * as C from './oikoscore.js';
import { createAmphora } from './oikosscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const KEY = 'oikos.v1';
const S = { fixture: null, feed: null, rules: null, ledger: null, source: 'demo', today: '', user: {}, scen: 'base', a: null, scene: null, sceneMode: 'none', forced: false, ready: false, msg: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function store(get, v) { try { if (get) return localStorage.getItem(get); localStorage.setItem(KEY, v); } catch (_) { /* private mode: the page works without it */ } return null; }
function etToday() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10); }
}

// ------------------------------------------------------------------ the ledger in
function phoneLedger() {
  try { const raw = localStorage.getItem('ledger.v1'); if (!raw) return null; const led = C.normalize(JSON.parse(raw), S.today); return led.entries.length ? led : null; } catch (_) { return null; }
}
function chooseSource(saved) {
  if (S.forced) return ['demo', C.normalize(S.fixture, S.today)];
  if (saved && saved.ledger) { const led = C.normalize(C.unwrap(saved.ledger), S.today); if (led.entries.length) return ['file', led]; }
  const ph = phoneLedger(); if (ph) return ['phone', ph];
  const fd = S.feed && S.feed.status !== 'sample' ? C.unwrap(S.feed) : null;
  if (fd) { const led = C.normalize(fd, S.today); if (led.entries.length) return ['feed', led]; }
  return ['demo', C.normalize(S.fixture, S.today)];
}
function importText(text, label) {
  const raw = C.unwrap(text);
  if (!raw) { say(`${label}: that is not a Ledger export (it needs an "entries" list). Nothing was changed.`); return false; }
  const led = C.normalize(raw, S.today);
  if (!led.entries.length) { say(`${label}: no readable entries in it (${led.skipped} rows skipped). Nothing was changed.`); return false; }
  S.ledger = led; S.source = 'file'; S.user = {};
  let ok = true; try { store(null, JSON.stringify({ user: S.user, scen: S.scen, ledger: { entries: led.entries, settings: led.settings, accounts: Object.keys(led.accounts).map((k) => ({ id: k, name: led.accounts[k] })), opts: led.opts } })); } catch (_) { ok = false; }
  render(); say(`Read ${led.entries.length} entries from ${label}${led.skipped ? `, ${led.skipped} rows could not be read` : ''}. ${ok ? 'Kept on this phone.' : ''}`);
  return true;
}

// ------------------------------------------------------------------ pieces
function srcWords() {
  const n = S.ledger.entries.length;
  return { demo: 'EXAMPLE numbers (demo): a made-up household so the page is never empty. Tap "Use my Ledger" or import your export to see your own.',
    phone: `Your Ledger on this phone: ${n} entries, read only.`, file: `A file you imported: ${n} entries${S.ledger.skipped ? `, ${S.ledger.skipped} rows skipped` : ''}. Kept on this phone.`,
    feed: `The scanner's copy of your Ledger export: ${n} entries.` }[S.source];
}
function bar(frac, cls, label) { const b = h('div', 'ag-bar ' + (cls || 'green')); b.setAttribute('role', 'img'); b.setAttribute('aria-label', label || (Math.round(C.clamp(frac, 0, 1) * 100) + '% full')); b.appendChild(h('i')); b.firstChild.style.width = Math.round(C.clamp(frac, 0, 1) * 100) + '%'; return b; }
const RISK = { low: ['ok', 'Fine'], med: ['warn', 'Watch'], high: ['bad', 'Act'] };

function renderHero(a) {
  const hl = C.headline(a);
  $('headline').textContent = hl.text;
  $('fillPill').textContent = `${C.pct(a.fill)} full`; $('fillPill').className = 'pill ' + (a.fill >= 0.75 ? 'ok' : a.fill >= 0.25 ? 'warn' : 'info');
  $('fillNote').textContent = 'The vase fills as the four pots fill: tax, emergency fund, pay yourself, next account. Gold = money that already has a job.';
  if (S.scene) S.scene.set(a.fill); else drawFallback(a.fill);
}
function renderLeaks(a) {
  const ul = $('leaks'); clear(ul);
  const nWatch = a.leaks.filter((x) => x.risk !== 'low').length;
  $('leakPill').textContent = nWatch ? `${nWatch} to watch` : 'All fine'; $('leakPill').className = 'pill ' + (nWatch ? 'warn' : 'ok');
  if (!a.leaks.length) { const li = h('li', 'empty', 'No leaks yet. Add your eval fees, resets, payouts and monthly costs in the Ledger and they are checked here.'); ul.appendChild(li); return; }
  for (const x of a.leaks.slice(0, 14)) {
    const li = h('li', 'leak ' + x.risk), t = h('div', 't'); t.appendChild(h('b', '', x.title)); t.appendChild(h('span', 'usd ' + (x.risk === 'low' ? '' : 'neg'), (x.risk === 'low' ? '' : '\u2212') + C.money(x.usd)));   /* a sign, not colour alone (A11Y K8) */
    li.appendChild(t); li.appendChild(h('p', '', x.detail));
    const m = h('div', 'meta'); m.appendChild(h('span', 'pill ' + RISK[x.risk][0], RISK[x.risk][1])); m.appendChild(bar(x.score / 100, x.risk === 'high' ? 'red' : x.risk === 'med' ? 'amber' : 'green')); m.appendChild(h('span', 'note', `${x.score}/100`));
    li.appendChild(m); ul.appendChild(li);
  }
}
function renderAccounts(a) {
  const body = $('acctRows'); clear(body);
  if (!a.accounts.length) { const tr = h('tr'), td = h('td', 'empty', 'No eval accounts in the ledger yet.'); td.colSpan = 4; tr.appendChild(td); body.appendChild(tr); return; }
  const words = { paid: ['ok', 'Paid back'], never: ['bad', 'Never covered'], behind: ['warn', 'Behind'], young: ['info', 'Too new'] };
  for (const x of a.accounts) {
    const tr = h('tr'), n = h('td'); n.appendChild(h('span', '', x.name)); n.appendChild(h('small', '', `${x.age} days${x.resets ? `, ${x.resets} reset${x.resets === 1 ? '' : 's'}` : ''}`));
    tr.appendChild(n); tr.appendChild(h('td', '', C.money(x.cost))); tr.appendChild(h('td', '', C.money(x.received)));
    const r = h('td'), w = words[x.status]; r.appendChild(h('span', 'pill ' + w[0], w[1])); r.appendChild(h('small', x.net >= 0 ? 'pos' : 'neg', C.moneyS(x.net))); tr.appendChild(r); body.appendChild(tr);
  }
}
function kvRow(kv, k, v, cls) { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', cls || '', v)); }
function renderTax(a) {
  $('taxLabel').textContent = `Set aside ${C.pct(a.opts.tax)} of net profit`;
  const kv = $('taxKv'); clear(kv); const t = a.tax;
  kvRow(kv, 'Net profit, last 12 months', C.moneyS(a.totals.net365), a.totals.net365 >= 0 ? 'pos' : 'neg'); kvRow(kv, 'Put aside (estimate)', C.money(t.set_aside)); kvRow(kv, 'Moved so far', C.money(t.paid)); kvRow(kv, 'Still to put aside', C.money(t.still), t.still > 0 ? 'neg' : 'pos');
  kvRow(kv, 'Share of this month so far', C.money(t.month));
  $('taxNote').textContent = C.NOTE_TAX + ' Losses and costs may count differently where you live.';
}
function renderBuckets(a) {
  const o = a.opts;
  $('emLabel').textContent = `Emergency fund gets ${C.pct(o.emergency)} of a month's profit`; $('reLabel').textContent = `Next account gets ${C.pct(o.reinvest)}`;
  const pay = Math.max(0, 1 - o.tax - o.emergency - o.reinvest);
  $('bktNote').textContent = a.monthly.net > 0 ? `Your last 90 days average ${C.money(a.monthly.net)} a month. Split: tax ${C.pct(o.tax)}, emergency ${C.pct(o.emergency)}, next account ${C.pct(o.reinvest)}, you ${C.pct(pay)} (${C.money(a.alloc.pay)}).`
    : 'Your last 90 days show no net profit, so there is nothing to split yet. The buckets show what each one is aiming for.';
  const ul = $('buckets'); clear(ul);
  const plain = { tax: 'Money you should not spend: it is the tax set-aside above.', emergency: `${o.em_months} months of the ${C.money(o.living)} living cost.`, pay: 'This month\'s share you can take home, in proportion to how much of the month is already made.', reinvest: 'Three months of this share against the price of one more account.' };
  for (const b of a.buckets) {
    const li = h('li', 'bucket'), t = h('div', 't'); t.appendChild(h('b', '', b.label)); t.appendChild(h('span', 'usd', b.target > 0 ? C.pct(b.fill) : '-'));
    li.appendChild(t); li.appendChild(bar(b.fill == null ? 0 : b.fill, b.fill >= 0.75 ? 'green' : b.fill >= 0.25 ? 'amber' : 'red'));
    li.appendChild(h('p', '', `${C.bucketWords(b)}. ${plain[b.id]}`)); ul.appendChild(li);
  }
}
function renderProjector(a) {
  const p = a.projector, o = a.opts, seg = $('scen'); clear(seg);
  for (const [id] of C.SCEN) { const b = h('button', 'ag-chip', id[0].toUpperCase() + id.slice(1)); b.type = 'button'; b.dataset.scen = id; b.setAttribute('aria-pressed', id === S.scen ? 'true' : 'false'); b.addEventListener('click', () => { S.scen = id; persist(); renderProjector(S.a); }); seg.appendChild(b); }
  const sc = p.scenarios.find((x) => x.id === S.scen) || p.scenarios[1];
  $('prLabel').textContent = `Reinvest ${C.pct(o.proj_re)} of what is left after tax`;
  $('prjNote').textContent = p.monthly_profit > 0 ? `Starts from ${p.n0} account${p.n0 === 1 ? '' : 's'} making ${C.money(p.monthly_profit)} a month together (${C.money(p.per_account)} each, ${sc.id}: ${Math.round(sc.mult * 100)}% of that). One more account costs ${C.money(p.account_cost)}.`
    : 'Your last 90 days show no net profit, so there is nothing to grow. Fix the leaks first, then come back.';
  const kv = $('prjKv'); clear(kv);
  kvRow(kv, `Kept after ${p.months} months, withdraw`, C.money(sc.end_withdraw)); kvRow(kv, `Kept after ${p.months} months, reinvest`, C.money(sc.end_reinvest));
  kvRow(kv, 'Difference', C.moneyS(sc.end_reinvest - sc.end_withdraw), sc.end_reinvest - sc.end_withdraw >= 0 ? 'pos' : 'neg'); kvRow(kv, 'Accounts at the end', `${p.n0} -> ${sc.end_accounts}`);
  kvRow(kv, 'Monthly take-home at the end', `${C.money(sc.monthly_end_withdraw)} -> ${C.money(sc.monthly_end_reinvest)}`);
  $('prjWarn').textContent = 'An estimate, not a promise. It assumes every new account earns what today\'s accounts earn after tax, that you buy a new one as soon as the money is there and that none fail. New accounts run the same strategy, so they win and lose together; a bad month cuts all of them at once. The conservative case halves today\'s profit.';
  $('pr').value = String(Math.round(o.proj_re * 100));
  drawChart(sc);
  const chips = $('priceChips'); clear(chips);
  for (const [lab, v] of priceList()) { const b = h('button', 'ag-chip', `${lab} ${C.money(v)}`); b.type = 'button'; b.setAttribute('aria-pressed', Math.abs(o.account_cost - v) < 0.005 ? 'true' : 'false'); b.addEventListener('click', () => { S.user.account_cost = v; persist(); render(); }); chips.appendChild(b); }
  syncInputs();
}
function priceList() {
  const pl = S.rules && S.rules.plans ? S.rules.plans : null, n = (x) => (typeof x === 'number' && x > 0 ? x : null);
  return [['Builder 50K', (pl && n(pl.builder_50k && pl.builder_50k.price_owner)) || 91.8], ['Builder 25K', (pl && n(pl.builder_25k && pl.builder_25k.price_owner)) || 63], ['ATLAS 25K', (pl && n(pl.builder_25k && pl.builder_25k.price_owner_atlas)) || 43]];
}
function drawChart(sc) {
  const svg = $('chart'); clear(svg);
  const W = 320, H = 170, L = 44, R = 8, T = 10, B = 24, n = sc.withdraw.length, top = Math.max(1, sc.end_withdraw, sc.end_reinvest);
  const x = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R)), y = (v) => T + (1 - v / top) * (H - T - B);
  for (let k = 0; k <= 4; k++) { const v = (top * k) / 4, yy = y(v); svg.appendChild(sv('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' })); const t = sv('text', { x: L - 4, y: yy + 3, 'text-anchor': 'end' }); t.textContent = '$' + Math.round(v).toLocaleString('en-US'); svg.appendChild(t); }
  for (const i of [0, Math.floor((n - 1) / 2), n - 1]) { const t = sv('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }); t.textContent = `month ${i + 1}`; svg.appendChild(t); }
  const line = (arr, cls) => svg.appendChild(sv('polyline', { class: cls, points: arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }));
  line(sc.withdraw, 'ln-w'); line(sc.reinvest, 'ln-r');
  svg.setAttribute('aria-label', `Cash kept over ${n} months, ${sc.id} case: ${C.money(sc.end_withdraw)} if you withdraw, ${C.money(sc.end_reinvest)} if you reinvest.`);
}

// the flat vase, drawn only when WebGL is not available
const PROF = [[0.55, 0], [0.6, 0.12], [0.95, 0.5], [1.25, 1.2], [1.3, 1.8], [1.15, 2.5], [0.75, 3.0], [0.5, 3.35], [0.48, 3.9], [0.62, 4.1], [0.7, 4.25]];
function drawFallback(fill) {
  const svg = $('amphFallback'); svg.removeAttribute('hidden'); $('amph').hidden = true; clear(svg);
  const X = (r, s) => 60 + s * r * 30, Y = (v) => 140 - v * 30;
  const pts = PROF.map(([r, v]) => [X(r, 1), Y(v)]).concat(PROF.slice().reverse().map(([r, v]) => [X(r, -1), Y(v)]));
  const d = 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + ' Z';
  const defs = sv('defs'), cp = sv('clipPath', { id: 'oikosClip' }); cp.appendChild(sv('path', { d })); defs.appendChild(cp); svg.appendChild(defs);
  const lvl = Y(Math.max(0, Math.min(1, fill)) * 3.0);
  svg.appendChild(sv('rect', { class: 'gold', x: 0, y: lvl, width: 120, height: 150 - lvl, 'clip-path': 'url(#oikosClip)' }));
  svg.appendChild(sv('path', { class: 'vase', d }));
}

// ------------------------------------------------------------------ state
function persist() { store(null, JSON.stringify({ user: S.user, scen: S.scen, ledger: S.source === 'file' ? { entries: S.ledger.entries, settings: S.ledger.settings, accounts: Object.keys(S.ledger.accounts).map((k) => ({ id: k, name: S.ledger.accounts[k] })), opts: S.ledger.opts } : null })); }
function syncInputs() {
  const o = S.a.opts, set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(Math.round(v * 100) / 100); };
  set('tax', o.tax * 100); set('em', o.emergency * 100); set('re', o.reinvest * 100); set('living', o.living); set('emMonths', o.em_months); set('emSaved', o.em_saved); set('cap', o.cap);
  set('acctCost', o.account_cost > 0 ? o.account_cost : S.a.projector.account_cost);
}
function render() {
  const a = C.analyze(S.ledger, S.today, S.user); S.a = a;
  $('demo').hidden = S.source !== 'demo'; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  $('srcNote').textContent = srcWords();
  renderHero(a); renderLeaks(a); renderAccounts(a); renderTax(a); renderBuckets(a); renderProjector(a);
  say(`${C.headline(a).text} Buckets ${C.pct(a.fill)} full.`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportJSON() {
  const L = S.ledger, a = S.a;
  const doc = { v: 1, app: 'oikos', exported: new Date().toISOString(), note: S.source === 'demo' ? 'EXAMPLE numbers, not real' : 'Your Oikos settings and the ledger they were read from. Import it back into Oikos or the Ledger-shaped part into any tool.',
    ledger: { entries: L.entries, settings: L.settings, accounts: Object.keys(L.accounts).map((k) => ({ id: k, name: L.accounts[k] })) }, opts: a.opts, headline: C.headline(a), leaks: a.leaks.map((x) => ({ title: x.title, detail: x.detail, usd: x.usd, score: x.score, risk: x.risk })), tax_note: C.NOTE_TAX };
  download(`oikos-${S.today}.json`, JSON.stringify(doc, null, 2)); say('Exported. The file holds your ledger and your Oikos settings; keep it safe.');
}

function bind() {
  const num = (id, key, lo, hi, scale) => $(id).addEventListener('input', () => { const v = parseFloat($(id).value); if (Number.isFinite(v)) { S.user[key] = C.clamp(v, lo, hi) / (scale || 1); persist(); render(); } });
  num('tax', 'tax', 0, 50, 100); num('em', 'emergency', 0, 60, 100); num('re', 'reinvest', 0, 60, 100); num('pr', 'proj_re', 0, 100, 100);
  num('living', 'living', 0, 100000); num('emMonths', 'em_months', 0, 36); num('emSaved', 'em_saved', 0, 1e8); num('cap', 'cap', 1, 20); num('acctCost', 'account_cost', 0, 100000);
  $('useDemo').addEventListener('click', () => { S.source = 'demo'; S.ledger = C.normalize(S.fixture, S.today); S.user = {}; persist(); render(); });
  $('useLedger').addEventListener('click', () => { const ph = phoneLedger(); if (!ph) { say('No Ledger found on this phone yet. Open the Ledger app, add your fees and payouts, then come back (or import its Export JSON).'); return; } S.ledger = ph; S.source = 'phone'; S.user = {}; persist(); render(); });
  $('exportBtn').addEventListener('click', exportJSON);
  $('file').addEventListener('change', () => {
    const f = $('file').files && $('file').files[0]; if (!f) return;
    if (f.size > 4e6) { say('That file is too big to be a Ledger export (over 4 MB).'); return; }
    const fr = new FileReader(); fr.onload = () => { importText(String(fr.result), 'your file'); $('file').value = ''; }; fr.onerror = () => say('The file could not be read.'); fr.readAsText(f);
  });
  $('pasteGo').addEventListener('click', () => { const t = $('paste').value.trim(); if (!t) { say('Paste the JSON first.'); return; } if (importText(t, 'the pasted text')) { $('paste').value = ''; $('pasteBox').open = false; } });
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const td = q.get('today'); S.today = C.isDate(td) ? td : etToday();
  const [fx, feed, rules] = await Promise.all([getJSON('./fixture.json'), getJSON('../money/oikos.json'), getJSON('../ledger/rules.json')]);
  S.fixture = fx || { entries: [] }; S.feed = feed; S.rules = rules;
  let saved = null; try { saved = JSON.parse(store(KEY) || 'null'); } catch (_) { saved = null; }
  if (saved && saved.user && typeof saved.user === 'object' && !S.forced) for (const k of Object.keys(C.DEFAULTS)) { const v = C.num(saved.user[k]); if (v != null) S.user[k] = v; }
  if (saved && C.SCEN.some((s) => s[0] === saved.scen)) S.scen = saved.scen;
  const [src, led] = chooseSource(saved); S.source = src; S.ledger = led;
  bind();
  try { S.scene = createAmphora($('amph'), { O }); } catch (_) { S.scene = null; }
  S.sceneMode = S.scene ? 'webgl' : 'flat';
  render();
}
function store2(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
window.OIKOS = { S, C, ready: () => S.ready, render, scene: () => S.scene, importText, raw: store2 };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Oikos could not start'); } catch (_) { /* nothing */ } });
