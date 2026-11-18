// ARCHIVE page (ES module): the library of everything we ever tested. A fast, searchable, filterable index of every research run, every write-up, the tested-and-rejected list and the datasets.
// Reads ./index.json (built offline by tools/archive_build.py; the rejected runs come in runs-<k>.json shards after the first paint) or fixture.json (DEMO, never blank). Read only: sends nothing, keeps nothing.
// Text only through textContent / createElementNS. window.ARCHIVE is the test hook. The 3D library (archivestage.js) is a pure extra; without WebGL the same shelves are drawn flat.
import * as C from './archivecore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const S = { data: null, v: null, rack: null, flat: false, ready: false, shards: 0, shardsDone: 0, f: { q: '', family: 'all', verdict: -1, years: 'any', min: {}, maxF10: null }, sort: 'pm', shown: 30, cmp: [], shelf: -1, shelfList: [] };
const RM = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
const VCOL = ['#c8a24a', '#c96a4a', '#7f8a52'];

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const tile = (box, k, v, n) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', 'ag-num', v)); if (n) t.appendChild(h('span', '', n)); box.appendChild(t); };
const years = () => S.f.years;
const labFor = (r) => `../#/run/${encodeURIComponent(r.id)}`;

// ------------------------------------------------------------------------------------------------ the library (3D + flat twin)
function renderFlat() {
  const svg = $('flat'); clear(svg); const sh = S.shelfList, W = 320, rowH = 22;
  svg.setAttribute('viewBox', `0 0 ${W} ${Math.max(60, sh.length * rowH + 8)}`);
  sh.forEach((s, i) => {
    const y = 6 + i * rowH; const g = sv('g', { 'data-shelf': String(i) });
    g.appendChild(sv('rect', { x: 0, y: y - 2, width: W, height: rowH - 2, rx: 4, fill: i === S.shelf ? '#2a2217' : '#1f1a14' }));
    g.appendChild(sv('text', { x: 6, y: y + 11, 'font-size': 10, fill: '#cfc4b2' }, s.name.slice(0, 18)));
    s.books.forEach((b, k) => g.appendChild(sv('rect', { x: 112 + k * 70, y: y + 14 - Math.max(2, b.h * 14), width: Math.max(2, b.h * 62), height: Math.max(2, b.h * 14), rx: 2, fill: VCOL[[0, 2, 1][k]] })));
    svg.appendChild(g);
  });
}
function pushLibrary() { if (S.rack) { S.rack.set(S.shelfList); S.rack.select(S.shelf); } if (S.flat) renderFlat(); }
async function startLibrary() {
  const q = new URLSearchParams(location.search).get('q'), canvas = $('stage');
  const flat = () => { S.flat = true; $('flat').hidden = false; canvas.hidden = true; renderFlat(); };
  if (q === 'off' || q === 'flat') { flat(); return; }
  try {
    for (let k = 0; k < 25 && !window.ARCHIVE_LIB && !window.ARCHIVE_LIB_FAIL; k++) await new Promise((r) => setTimeout(r, 100));
    if (!window.ARCHIVE_LIB) throw new Error('the 3D module did not load');
    S.rack = window.ARCHIVE_LIB.createLibrary(canvas, { reduced: RM(), onPick: (shelf, book) => pickShelf(shelf, book) }); if (O && O.mode) O.mode(S.rack.lite);
    $('flat').hidden = true; pushLibrary();
  } catch (_) { S.rack = null; flat(); }
}
const BOOK_VERDICT = [0, 2, 1];    // the stage's book order (adopted, open, rejected) -> the archive's verdict codes (0 adopted, 1 rejected, 2 open)
function pickShelf(i, book) {
  const s = S.shelfList[i]; if (!s) return;
  S.shelf = i; S.f.family = s.name; if (book != null && book >= 0) S.f.verdict = BOOK_VERDICT[book]; syncControls(); apply(); pushLibrary();
  say(C.SHELF_WORD(s) + ' The list below shows this shelf.');
}

// ------------------------------------------------------------------------------------------------ controls
function option(sel, value, text) { const o = h('option', '', text); o.value = value; sel.appendChild(o); }
function buildControls() {
  const fam = $('family'); clear(fam); option(fam, 'all', 'All families'); for (const f of S.v.families) option(fam, f.name, `${f.name} (${f.runs})`);
  const so = $('sort'); clear(so); for (const [k, t] of C.SORTS) option(so, k, t);
  const vs = $('verdicts'); clear(vs);
  [[-1, 'All'], [0, 'Adopted'], [1, 'Rejected'], [2, 'Open']].forEach(([v, t]) => { const b = h('button', 'ag-chip', t); b.type = 'button'; b.dataset.v = String(v); b.setAttribute('aria-pressed', v === S.f.verdict ? 'true' : 'false'); b.addEventListener('click', () => { S.f.verdict = v; syncControls(); apply(); }); vs.appendChild(b); });
  const ys = $('years'); clear(ys);
  [['any', 'Any years'], ['26', '2026'], ['old', '2021-25'], ['both', 'Both']].forEach(([v, t]) => { const b = h('button', 'ag-chip', t); b.type = 'button'; b.dataset.y = v; b.setAttribute('aria-pressed', v === S.f.years ? 'true' : 'false'); b.addEventListener('click', () => { S.f.years = v; syncControls(); apply(); }); ys.appendChild(b); });
}
function syncControls() {
  for (const b of document.querySelectorAll('#verdicts button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === S.f.verdict));
  for (const b of document.querySelectorAll('#years button')) b.setAttribute('aria-pressed', String(b.dataset.y === S.f.years));
  $('family').value = S.f.family; $('sort').value = S.sort; $('q').value = S.f.q;
}
function readControls() {
  S.f.q = $('q').value; S.f.family = $('family').value; S.sort = $('sort').value;
  const m = {}; for (const k of ['pf', 'net', 'pm', 'tpw', 'p10']) { const x = parseFloat($('min_' + k).value); if (isFinite(x)) m[k] = x; }
  S.f.min = m; const f10 = parseFloat($('max_f10').value); S.f.maxF10 = isFinite(f10) ? f10 : null;
  const i = S.shelfList.findIndex((s) => s.name === S.f.family); S.shelf = i; pushLibrary();
}

// ------------------------------------------------------------------------------------------------ the list
function runCard(r) {
  const li = h('li', 'run v' + r.verdict); li.dataset.id = r.id;
  const top = h('div', 'row'); top.appendChild(h('b', 'rtitle', r.title || r.id));
  const pills = h('span', 'pills'); pills.appendChild(h('span', 'pill ' + ['ok', 'bad', 'info'][r.verdict], C.VERDICT_WORD[r.verdict])); top.appendChild(pills); li.appendChild(top);
  li.appendChild(h('p', 'note', `${r.family}${r.lit ? ' · LIT' : ''} · ${r.id}${r.built ? ' · ' + r.built : ''}`));
  const per = years() === 'old' ? 'old' : years() === '26' ? '26' : 'any', m = C.metricsOf(r, per);
  if (m) {
    const t = h('div', 'tiles'); tile(t, 'Net $', C.usdS(m.net), C.periodOf(r, per)); tile(t, '$ a month', C.usd(m.pm), `PF ${C.pf(m.pf)}`); tile(t, 'Trades a week', C.dec(m.tpw, 1), `${m.n} trades`);
    if (m.p10 !== null || m.f10 !== null) tile(t, 'In 10 sessions', `${C.dec(m.p10, 0)}% / ${C.dec(m.f10, 0)}%`, 'pass / fail'); li.appendChild(t);
  } else li.appendChild(h('p', 'note', 'No result stored for this period.'));
  if (r.note) li.appendChild(h('p', 'note words', r.note));
  const act = h('div', 'acts');
  const cb = h('button', 'btn', S.cmp.indexOf(r.id) >= 0 ? 'Picked to compare' : 'Compare'); cb.type = 'button'; cb.dataset.cmp = r.id; cb.setAttribute('aria-pressed', S.cmp.indexOf(r.id) >= 0 ? 'true' : 'false'); cb.addEventListener('click', () => toggleCompare(r.id)); act.appendChild(cb);
  const a = h('a', 'btn', r.writeup ? 'See the story' : 'Open the run'); a.href = r.writeup ? `../#/writeup/${encodeURIComponent(r.writeup)}` : labFor(r); a.dataset.story = r.writeup ? '1' : '0'; act.appendChild(a);
  li.appendChild(act); return li;
}
function apply() {
  S.shown = 30; renderList(); renderRedo(); renderWriteups(); renderRejected();
}
function renderList() {
  const rows = C.sortRuns(C.filterRuns(S.v.runs, S.f), S.sort, S.f.years); S.rows = rows;
  const box = $('results'); clear(box);
  for (const r of rows.slice(0, S.shown)) box.appendChild(runCard(r));
  const more = $('more'); more.hidden = rows.length <= S.shown; more.textContent = `Show 30 more (${rows.length - S.shown} left)`;
  const loaded = S.v.runs.length, total = S.v.total.runs;
  $('count').textContent = `${rows.length.toLocaleString('en-US')} of ${loaded.toLocaleString('en-US')} runs match` + (loaded < total ? ` (loading the rest: ${loaded.toLocaleString('en-US')} of ${total.toLocaleString('en-US')})` : '');
  if (!rows.length) box.appendChild(h('li', 'note empty', 'No run matches. Clear a filter, or try fewer words.'));
  renderCompare();
}
function renderRedo() {
  const box = $('redo'), q = S.f.q.trim(); box.hidden = true; clear(box);
  if (q.length < 3) return;
  const m = C.matchRejected(q, S.v.rejected), rr = C.rejectedRuns(q, S.v.runs), msg = C.redoWords(m, rr);
  if (!msg) return;
  box.hidden = false; box.appendChild(h('b', '', "Don't redo this")); box.appendChild(h('p', 'lead', msg.replace(/^Don't redo this: it/, 'It')));
  const ul = h('ul', 'plain inner');
  for (const x of m.hits) { const li = h('li'); li.appendChild(h('b', '', x.r.title)); li.appendChild(h('span', 'note words', x.r.text.slice(0, 260))); for (const w of x.r.writeups.slice(0, 2)) { const a = h('a', 'btn', 'See the story: ' + w); a.href = `../#/writeup/${encodeURIComponent(w)}`; li.appendChild(a); } ul.appendChild(li); }
  box.appendChild(ul);
}
function renderWriteups() {
  const box = $('writeups'); clear(box); const toks = C.tokens(S.f.q);
  const hit = S.v.writeups.filter((w) => { const t = (w.title + ' ' + w.summary + ' ' + w.slug).toLowerCase(); return toks.every((k) => t.indexOf(k) >= 0) && (S.f.verdict < 0 || w.verdict === S.f.verdict); });
  $('wuCount').textContent = `${hit.length} of ${S.v.writeups.length}`;
  for (const w of hit.slice(0, 8)) { const li = h('li'); li.appendChild(h('b', '', w.title)); li.appendChild(h('span', 'note', `${w.date || 'undated'} · ${w.status}`)); li.appendChild(h('span', 'note words', w.summary.slice(0, 200))); const a = h('a', 'btn', 'See the story'); a.href = `../#/writeup/${encodeURIComponent(w.slug)}`; li.appendChild(a); box.appendChild(li); }
  if (!hit.length) box.appendChild(h('li', 'note', 'No write-up matches.'));
}
function renderRejected() {
  const box = $('rejected'); clear(box); const toks = C.tokens(S.f.q);
  const hit = S.v.rejected.filter((r) => { const t = (r.title + ' ' + r.text).toLowerCase(); return toks.every((k) => t.indexOf(k) >= 0); });
  $('rejCount').textContent = `${hit.length} of ${S.v.rejected.length}`;
  for (const r of hit.slice(0, 12)) { const li = h('li'); li.appendChild(h('b', '', r.title)); li.appendChild(h('span', 'note words', r.text.slice(0, 300))); for (const w of r.writeups.slice(0, 2)) { const a = h('a', 'btn', 'See the story: ' + w); a.href = `../#/writeup/${encodeURIComponent(w)}`; li.appendChild(a); } box.appendChild(li); }
  if (!hit.length) box.appendChild(h('li', 'note', 'Nothing on the rejected list matches. That does not mean it was never tried: search the runs too.'));
}
function renderDatasets() {
  const body = $('dsRows'); clear(body);
  for (const d of S.v.datasets) { const tr = h('tr'); tr.appendChild(h('th', '', d.name)); tr.appendChild(h('td', '', `${d.first} to ${d.last}`)); tr.appendChild(h('td', 'ag-num', d.rows.toLocaleString('en-US'))); tr.appendChild(h('td', 'srccol', d.source)); body.appendChild(tr); }
  $('dsCount').textContent = String(S.v.datasets.length);
}

// ------------------------------------------------------------------------------------------------ compare
function toggleCompare(id) {
  const i = S.cmp.indexOf(id); if (i >= 0) S.cmp.splice(i, 1); else { S.cmp.push(id); if (S.cmp.length > 2) S.cmp.shift(); }
  renderList(); say(S.cmp.length === 2 ? 'Two runs picked: see the comparison above the list.' : `${S.cmp.length} of 2 picked.`);
}
function renderCompare() {
  const box = $('compare'), by = (id) => S.v.runs.find((r) => r.id === id); clear(box);
  const a = by(S.cmp[0]), b = by(S.cmp[1]); box.hidden = S.cmp.length === 0;
  if (!S.cmp.length) return;
  box.appendChild(h('b', '', 'Side by side'));
  if (!b) { box.appendChild(h('p', 'lead', 'Pick one more run to compare it with this one.')); return; }
  for (const line of C.compareWords(a, b)) box.appendChild(h('p', 'lead', line));
  const clr = h('button', 'btn', 'Clear the comparison'); clr.type = 'button'; clr.addEventListener('click', () => { S.cmp = []; renderList(); }); box.appendChild(clr);
}

// ------------------------------------------------------------------------------------------------ boot
function build() {
  $('demo').hidden = !S.v.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  const t = S.v.total; $('head').textContent = (S.v.demo ? 'Example numbers: ' : '') + C.headline(S.v);
  const tl = $('tiles'); clear(tl); tile(tl, 'Runs', t.runs.toLocaleString('en-US'), `${t.adopted} adopted · ${t.rejectedRuns.toLocaleString('en-US')} rejected`); tile(tl, 'Write-ups', String(t.writeups), 'plain-language stories'); tile(tl, 'Rejected ideas', String(t.rejected), "the don't-redo list"); tile(tl, 'Datasets', String(t.datasets), 'under data/');
  $('cov').textContent = `Built ${S.v.built || 'on an unknown date'}. ${C.LABEL}`;
  S.shelfList = C.shelves(S.v.families, 14); buildControls(); syncControls(); renderDatasets(); apply();
}
async function loadShards() {
  const list = S.v.shards || []; S.shards = list.length;
  for (const name of list) {
    const sh = await getJSON(`./${name}`);
    if (sh) { C.addShard(S.v, sh); S.shardsDone++; renderList(); renderRedo(); }
  }
  say(`Library loaded: ${S.v.runs.length.toLocaleString('en-US')} runs.`); S.shardsLoaded = true;
}
async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  const [fx, real] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('./index.json')]);
  const data = C.chooseData(real, fx); if (!data) throw new Error('no library');
  S.data = data; S.v = data.v;
  const find = q.get('find'); if (find) S.f.q = find.slice(0, 80);
  build(); say(C.headline(S.v)); await startLibrary();
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  if (data.src === 'file') await loadShards(); else S.shardsLoaded = true;
}
function wire() {
  let t = 0; $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { readControls(); apply(); }, 120); });
  for (const id of ['family', 'sort', 'min_pf', 'min_net', 'min_pm', 'min_tpw', 'min_p10', 'max_f10']) $(id).addEventListener('change', () => { readControls(); apply(); });
  $('more').addEventListener('click', () => { S.shown += 30; renderList(); });
  $('reset').addEventListener('click', () => { S.f = { q: '', family: 'all', verdict: -1, years: 'any', min: {}, maxF10: null }; S.sort = 'pm'; for (const k of ['pf', 'net', 'pm', 'tpw', 'p10']) $('min_' + k).value = ''; $('max_f10').value = ''; S.shelf = -1; syncControls(); apply(); pushLibrary(); });
}
window.addEventListener('pagehide', () => { try { if (S.rack) S.rack.dispose(); } catch (_) { /* gone */ } });
window.ARCHIVE = { S, C, ready: () => S.ready, shards: () => !!S.shardsLoaded, pickShelf, toggleCompare, apply, get rack() { return S.rack; }, get flat() { return S.flat; } };
wire();
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Archive could not start'); } catch (_) { /* nothing */ } });
