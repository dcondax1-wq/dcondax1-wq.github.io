// PINAKES page (ES module): the catalogue of every table OLYMPUS keeps. Reads ./catalog.json (one small card per table, built by tools/pinakes_build.py), then each table from its own
// file on this site when you open it (never a copy), and fixture.json (DEMO: made-up tables, never blank). Search, a windowed grid (only the rows in view exist, so 37,000 rows scroll like 30),
// sort, plain-word filters, quick stats, a chart with group-by, saved views (this phone only, 'pinakes.v1'), CSV / JSON export and a share link (#v=... restores the table and its filters).
// Read only: sends nothing. Text only through textContent. window.PINAKES is the test hook. ?demo=1 forces the demo, ?today=YYYY-MM-DD fixes the date, ?flat=1 draws the flat cabinet.
import * as C from './pinakescore.js';
import { createCabinet } from './pinakesscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const opt = (value, text) => { const o = h('option', '', text); o.value = value; return o; };
const KEY = 'pinakes.v1', ROW = 40, HEAD = 44, OVER = 6, PAGE = 30;
const S = { cat: null, demo: false, forced: false, fixture: null, district: 'All', q: '', shown: PAGE, today: '', now: 0, open: null, views: [], scene: null, sceneMode: 'none', ready: false, docs: new Map(), ask: null, loading: 0 };
const G = { cols: [], widths: [], total: 0, pool: [], first: -1, sel: -1, paints: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
/** one table file of this site: { doc } or { err: 404 | 'json' | 'timeout' | 'net' } so the page can say why */
async function loadDoc(url) {
  if (!C.safeUrl(url)) return { err: 'net' };
  if (S.docs.has(url)) return { doc: S.docs.get(url) };
  const ac = typeof AbortController === 'function' ? new AbortController() : null; let timedOut = false; const timer = ac ? setTimeout(() => { timedOut = true; ac.abort(); }, 25000) : 0;
  try {
    const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) });
    if (!r.ok) return { err: r.status };
    let doc; try { doc = JSON.parse(await r.text()); } catch (_) { return { err: 'json' }; }
    S.docs.set(url, doc); if (S.docs.size > 6) S.docs.delete(S.docs.keys().next().value);
    return { doc };
  } catch (_) { return { err: timedOut ? 'timeout' : 'net' }; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function store(v) { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); return true; } catch (_) { return null; } }
function localToday() { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = h('a'); a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 800);
}
const cardById = (id) => (S.cat ? S.cat.tables.filter((c) => c.id === id)[0] : null) || null;

// ------------------------------------------------------------------ the catalogue view
function metaWords(c) {
  const bits = [c.app === 'site' ? 'site' : c.app];
  if (c.rows !== null) bits.push(C.plural(c.rows, 'row'));
  if (c.cols.length) bits.push(C.plural(c.cols.length, 'field'));
  if (c.bytes) bits.push(C.bytesWords(c.bytes));
  return bits.join(' · ');
}
function pillFor(c, fresh) { const l = C.labelOf(c, S.now, fresh); return h('span', 'pill ' + l.cls, l.age ? `${l.text} · ${l.age}` : l.text); }
function renderDistricts() {
  const t = C.totals(S.cat.tables), box = $('districts'); clear(box);
  const mk = (name, n) => { const b = h('button', 'btn', name); b.type = 'button'; b.dataset.d = name; b.setAttribute('aria-pressed', String(S.district === name)); b.appendChild(h('small', '', n)); b.addEventListener('click', () => pickDistrict(S.district === name && name !== 'All' ? 'All' : name)); return b; };
  box.appendChild(mk('All', t.tables));
  C.DISTRICTS.forEach((d) => box.appendChild(mk(d, t.by[d].tables)));
  $('totalPill').textContent = C.plural(t.tables, 'table');
  $('headline').textContent = C.totalWords(t);
  $('totalNote').textContent = (S.demo ? 'EXAMPLE tables (demo): made up so the page is never empty. ' : '') + C.totalNote(t);
}
function renderList() {
  const hits = C.searchCatalog(S.cat.tables, S.q, S.district), ul = $('list'); clear(ul);
  $('foundPill').textContent = hits.length === S.cat.tables.length ? `All ${hits.length}` : `${hits.length} of ${S.cat.tables.length}`;
  hits.slice(0, S.shown).forEach((c) => {
    const li = h('li'), b = h('button', 'trow'); b.type = 'button'; b.dataset.id = c.id;
    b.appendChild(h('b', '', c.name)); b.appendChild(pillFor(c));
    b.appendChild(h('span', 'meta', `${c.district} · ${metaWords(c)}`)); b.appendChild(h('span', 'what', c.desc));
    b.addEventListener('click', () => openTable(c.id, null));
    li.appendChild(b); ul.appendChild(li);
  });
  if (!hits.length) ul.appendChild(h('li', 'note', S.q ? `No table matches "${S.q}"${S.district !== 'All' ? ` in ${S.district}` : ''}. Try fewer words.` : 'No tables in this drawer.'));
  $('more').hidden = hits.length <= S.shown; $('more').textContent = `Show more (${hits.length - S.shown} left)`;
}
function pickDistrict(d, quiet) {
  S.district = d; S.shown = PAGE;
  const i = C.DISTRICTS.indexOf(d);
  if (S.scene) S.scene.select(i); else drawFlat();
  for (const b of $('districts').children) b.setAttribute('aria-pressed', String(b.dataset.d === d));
  renderList();
  if (!quiet) { say(d === 'All' ? 'Every drawer: all tables.' : `The ${d} drawer: ${C.plural(C.totals(S.cat.tables).by[d].tables, 'table')}.`); try { if (O && O.cue) O.cue('tap'); } catch (_) { /* no sound kit */ } }
}
/** the flat cabinet (LITE, no WebGL, ?flat=1): the same five drawers, the chosen one pulled out with its cards showing */
function drawFlat() {
  const svg = $('cabFlat'); clear(svg);
  const t = C.totals(S.cat.tables), sel = C.DISTRICTS.indexOf(S.district), x0 = 14, w = 292, dw = 54, gap = 4;
  svg.appendChild(sv('path', { d: `M${x0 - 6} 52 L160 22 L${x0 + w + 6} 52 Z`, class: 'body' }));
  svg.appendChild(sv('rect', { x: x0, y: 54, width: w, height: 112, rx: 3, class: 'body' }));
  svg.appendChild(sv('rect', { x: x0 - 8, y: 168, width: w + 16, height: 12, rx: 2, class: 'body' }));
  C.DISTRICTS.forEach((d, i) => {
    const x = x0 + 4 + i * (dw + gap), on = i === sel, y = on ? 70 : 60;
    if (on) for (let k = 0; k < 4; k++) svg.appendChild(sv('line', { x1: x + 6, y1: 58 + k * 4, x2: x + dw - 6, y2: 58 + k * 4, class: 'cardline' }));
    svg.appendChild(sv('rect', { x, y, width: dw, height: 100, rx: 3, class: 'drawer' + (on ? ' on' : '') }));
    svg.appendChild(sv('rect', { x: x + 4, y: y + 16, width: dw - 8, height: 20, rx: 2, class: 'lab' }));
    svg.appendChild(sv('text', { x: x + dw / 2, y: y + 29.5, 'text-anchor': 'middle' }, d));
    svg.appendChild(sv('text', { x: x + dw / 2, y: y + 50, 'text-anchor': 'middle', class: 'cnt' }, t.by[d].tables));
    svg.appendChild(sv('circle', { cx: x + dw / 2, cy: y + 72, r: 4, class: 'knob' }));
  });
}
function startScene() {
  const t = C.totals(S.cat.tables), lite = !!(O && O.lite && O.lite()), flat = /[?&]flat=1/.test(location.search);
  $('lite').hidden = !lite;
  if (S.scene) { S.scene.dispose(); S.scene = null; }
  if (!lite && !flat) { try { S.scene = createCabinet($('cab'), { O, districts: C.DISTRICTS.map((d) => ({ name: d, tables: t.by[d].tables })), onPick: (i) => pickDistrict(S.district === C.DISTRICTS[i] ? 'All' : C.DISTRICTS[i]) }); } catch (_) { S.scene = null; } }
  S.sceneMode = S.scene ? 'webgl' : 'flat';
  $('cab').hidden = !S.scene; $('cabFlat').toggleAttribute('hidden', !!S.scene);   // an <svg> has no .hidden property: the attribute itself
  if (S.scene) S.scene.select(C.DISTRICTS.indexOf(S.district)); else drawFlat();
}

// ------------------------------------------------------------------ opening a table
function showView(table) { $('catView').hidden = table; $('tabView').hidden = !table; $('saveBar').hidden = !(table && S.open && S.open.rows); }
function setHash() {
  const v = S.open && S.open.rows ? currentView() : null, hash = v ? '#' + C.encodeView(v) : '';
  try { history.replaceState(null, '', location.pathname + location.search + hash); } catch (_) { /* a sandboxed frame: the Share button still gives the link */ }
}
function currentView() {
  const o = S.open, v = { t: o.card.id, tab: o.tab };
  if (o.path !== o.card.path) v.p = o.path;
  if (o.filters.length) v.f = o.filters;
  if (o.mode === 'any') v.m = 'any';
  if (o.sort) v.s = o.sort;
  if (o.hidden.length) v.h = o.hidden;
  v.c = o.chart;
  return v;
}
function backToCatalogue() { S.open = null; showView(false); setHash(); say('The catalogue.'); window.scrollTo(0, 0); }
function head(card, fresh, label, rows, kind) {
  $('tName').textContent = card.name; $('tDesc').textContent = card.desc;
  const pills = $('tPills'); clear(pills);
  pills.appendChild(pillFor(Object.assign({}, card, { label: label || card.label }), fresh));
  pills.appendChild(h('span', 'pill', card.district));
  if (rows !== null && rows !== undefined) pills.appendChild(h('span', 'pill', C.plural(rows, 'row')));
  if (card.bytes) pills.appendChild(h('span', 'pill', C.bytesWords(card.bytes)));
  const where = card.inline ? 'inside the demo file (fixture.json)' : card.url ? card.url.replace(/^\.\.\//, '') : card.file;
  const f = fresh || card.fresh;
  if (card.source === 'research') { $('tSrc').textContent = `Kept on the PC in ${card.file}${card.span ? `, from ${card.span.first} to ${card.span.last}` : ''}. Not published.`; return; }
  $('tSrc').textContent = `From ${where}${kind ? `, ${C.KIND_WORDS[kind] || 'a list'}` : ''}. ${f ? `Its own stamp "${f.field}" says ${C.fmt(f.value, 'date')}.` : 'The file carries no date stamp, so its age is not known.'}`;
}
async function openTable(id, view) {
  const card = cardById(id);
  if (!card) { say(`That table (${id}) is not in the catalogue any more.`); return false; }
  const my = ++S.loading;
  S.open = { card, rows: null }; showView(true); head(card);
  $('work').hidden = true; $('pathFld').hidden = true; $('tWhy').hidden = true; $('tCols').hidden = true; $('rowCard').hidden = true;
  window.scrollTo(0, 0);
  const fail = (err) => {
    $('tWhy').textContent = C.whyWords(card, err); $('tWhy').hidden = false;
    if (card.cols.length) { $('tCols').textContent = `Fields (${card.cols.length}): ` + card.cols.map((c) => `${c.k} (${typeWords(c.t)})`).join(', ') + (card.rows !== null ? `. ${C.plural(card.rows, 'row')}.` : '.'); $('tCols').hidden = false; }
    say(card.source === 'research' ? `${card.name}: kept on the PC, span and rows only.` : `${card.name} could not be opened.`); S.open.rows = null; $('saveBar').hidden = true; setHash();
  };
  if (card.source === 'research' || (!card.url && !card.inline)) { fail('research'); return false; }
  say(`Opening ${card.name}...`);
  let doc;
  if (card.inline) doc = S.fixture && S.fixture.data ? S.fixture.data[card.inline] : undefined;
  else { const r = await loadDoc(card.url); if (my !== S.loading) return false; if (r.err !== undefined) { fail(r.err); return false; } doc = r.doc; }
  if (doc === undefined || doc === null) { fail(404); return false; }
  S.open.doc = doc;
  usePath(view && typeof view.p === 'string' ? view.p : card.path, view);
  return true;
}
function typeWords(t) { return { usd: '$', R: 'R', number: 'number', date: 'date', bool: 'yes / no', json: 'nested', text: 'text' }[t] || 'text'; }
/** show one array of the open file as the table; view = filters / sort / chart to restore (a share link or a saved view) */
function usePath(path, view) {
  const o = S.open, card = o.card, same = path === card.path;
  const t = C.openTable(o.doc, path, same ? card.kind : null, same ? card.opts : null);
  Object.assign(o, { path: t.path, kind: t.kind, paths: t.paths, rows: t.rows, cols: t.cols, filters: [], mode: 'all', sort: null, hidden: [], tab: 'rows', sel: -1,
    chart: { kind: 'bar', y: '', by: '', agg: 'sum', bucket: 'day' } });
  const fresh = C.findFresh(o.doc), label = C.docLabel(card, o.doc);
  o.fresh = fresh; o.label = label;
  head(card, fresh, label, t.rows.length, t.kind);
  const sel = $('pathSel'); clear(sel);
  t.paths.forEach((p) => sel.appendChild(opt(p.path, `${p.path || '(the top of the file)'}: ${C.plural(p.rows, 'row')}, ${C.KIND_WORDS[p.kind] || 'a list'}`)));
  if (!t.paths.some((p) => p.path === t.path)) sel.appendChild(opt(t.path, `${t.path || '(the top of the file)'}: ${C.plural(t.rows.length, 'row')}`));
  sel.value = t.path; $('pathFld').hidden = t.paths.length < 2;
  if (!t.rows.length) { $('tWhy').textContent = C.whyWords(card, 'empty'); $('tWhy').hidden = false; $('work').hidden = true; o.rows = null; $('saveBar').hidden = true; say(`${card.name}: no rows.`); setHash(); return; }
  $('tWhy').hidden = true; $('work').hidden = false; $('saveBar').hidden = false;
  // defaults for the chart: the first $ (or number) field against the first date (or text) field
  const numc = t.cols.filter((c) => C.isNumeric(c.t)), firstOf = (...ts) => { for (const ty of ts) { const c = t.cols.filter((x) => x.t === ty)[0]; if (c) return c.k; } return ''; };
  o.chart.y = (numc.filter((c) => c.t === 'usd')[0] || numc[0] || { k: '' }).k; o.chart.by = firstOf('date', 'text', 'bool') || (t.cols[0] ? t.cols[0].k : '');
  const shown = C.defaultShown(t.cols, 14); o.hidden = t.cols.filter((c) => shown.indexOf(c.k) < 0).map((c) => c.k);   // a phone shows 14 fields (dates, $ and R first); the rest are one tap away under "Fields shown"
  if (view) applyView(view);
  fillControls(); refresh(true);
  say(`${card.name}: ${C.plural(o.rows.length, 'row')}, ${C.plural(o.cols.length, 'field')}${label === 'demo' ? ' (DEMO data)' : label === 'sample' ? ' (SAMPLE data)' : ''}${t.moved ? '. The saved list was not found, so the biggest list is shown' : ''}.`);
}
function applyView(v) {
  const o = S.open, has = (k) => o.cols.some((c) => c.k === k);
  o.filters = C.cleanFilters(v.f || [], o.cols); o.mode = v.m === 'any' ? 'any' : 'all';
  if (v.s && has(v.s[0])) o.sort = [v.s[0], v.s[1] === 'desc' ? 'desc' : 'asc'];
  if (Array.isArray(v.h)) o.hidden = v.h.filter(has);
  if (v.c) { if (has(v.c.y)) o.chart.y = v.c.y; if (has(v.c.by)) o.chart.by = v.c.by; o.chart.kind = v.c.kind; o.chart.agg = v.c.agg; o.chart.bucket = v.c.bucket; }
  if (v.tab) o.tab = v.tab;
}
function colOf(k) { return S.open.cols.filter((c) => c.k === k)[0] || { k, t: 'text' }; }

// ------------------------------------------------------------------ filters
function fillControls() {
  const o = S.open, fc = $('fCol'); clear(fc);
  o.cols.forEach((c) => fc.appendChild(opt(c.k, `${c.k} (${typeWords(c.t)})`)));
  fillOps();
  const cy = $('cY'), cb = $('cBy'); clear(cy); clear(cb);
  o.cols.filter((c) => C.isNumeric(c.t)).forEach((c) => cy.appendChild(opt(c.k, `${c.k} (${typeWords(c.t)})`)));
  if (!cy.options.length) cy.appendChild(opt('', '(no number field: rows are counted)'));
  o.cols.filter((c) => c.t !== 'json').forEach((c) => cb.appendChild(opt(c.k, `${c.k} (${typeWords(c.t)})`)));
  cy.value = o.chart.y; cb.value = o.chart.by; $('cKind').value = o.chart.kind; $('cAgg').value = o.chart.agg; $('cBucket').value = o.chart.bucket;
  const chips = $('colChips'); clear(chips);
  o.cols.forEach((c) => { const b = h('button', 'btn', c.k); b.type = 'button'; b.dataset.k = c.k; b.setAttribute('aria-pressed', String(o.hidden.indexOf(c.k) < 0));
    b.addEventListener('click', () => { const i = o.hidden.indexOf(c.k); if (i >= 0) o.hidden.splice(i, 1); else if (o.cols.length - o.hidden.length > 1) o.hidden.push(c.k); b.setAttribute('aria-pressed', String(o.hidden.indexOf(c.k) < 0)); buildGrid(); setHash(); });
    chips.appendChild(b); });
}
function fillOps() {
  const c = colOf($('fCol').value), fo = $('fOp'), keep = fo.value; clear(fo);
  C.opsFor(c.t).forEach((op) => fo.appendChild(opt(op, op === 'last' ? 'in last ... days' : C.OPS[op])));
  if (C.opsFor(c.t).indexOf(keep) >= 0) fo.value = keep;
  opChanged();
}
function opChanged() {
  const c = colOf($('fCol').value), op = $('fOp').value, v = $('fVal'), v2 = $('fVal2');
  $('fValFld').hidden = !C.needsValue(op); $('fVal2Fld').hidden = op !== 'between';
  const isDate = c.t === 'date' && op !== 'last', numeric = C.isNumeric(c.t) || op === 'last';
  for (const el of [v, v2]) { el.type = isDate ? 'date' : 'text'; el.inputMode = numeric ? 'decimal' : 'text'; }
  $('fValLab').textContent = op === 'last' ? 'How many days' : op === 'between' ? 'From' : isDate ? 'Date' : numeric ? 'Number' : 'Text';
}
function addFilter() {
  const o = S.open, f = { col: $('fCol').value, op: $('fOp').value, value: $('fVal').value.trim(), value2: $('fVal2').value.trim() };
  const ok = C.cleanFilters([f], o.cols);
  if (!ok.length) { $('fMsg').textContent = C.needsValue(f.op) ? (C.isNumeric(colOf(f.col).t) || f.op === 'last' ? 'Type a number first.' : colOf(f.col).t === 'date' ? 'Pick a date first.' : 'Type some text first.') : 'That rule does not fit this field.'; return; }
  $('fMsg').textContent = ''; o.filters.push(ok[0]); $('fVal').value = ''; $('fVal2').value = ''; $('fBox').open = false;
  refresh(); say(`Filter added: ${C.filterWords(ok[0], colOf(ok[0].col).t)}. ${C.plural(o.view.length, 'row')} left.`);
}
function renderFilters() {
  const o = S.open, ul = $('fChips'); clear(ul);
  o.filters.forEach((f, i) => { const li = h('li'), b = h('button', 'chip'); b.type = 'button'; b.setAttribute('aria-label', `Remove the filter: ${C.filterWords(f, colOf(f.col).t)}`);
    b.appendChild(h('span', '', C.filterWords(f, colOf(f.col).t))); b.appendChild(h('i', '', '✕')); b.addEventListener('click', () => { o.filters.splice(i, 1); refresh(); }); li.appendChild(b); ul.appendChild(li); });
  $('fWords').textContent = o.filters.length ? `Showing rows where ${C.filtersWords(o.filters, o.cols, o.mode)}.` : 'No filter: every row is shown.';
  $('fMode').setAttribute('aria-pressed', String(o.mode === 'any')); $('fMode').hidden = o.filters.length < 2; $('fClear').hidden = !o.filters.length;
}

// ------------------------------------------------------------------ the grid (windowed: only the rows in view exist)
const widthOf = (c) => ({ usd: 96, R: 80, number: 88, bool: 68, date: 124, json: 160, text: 140 }[c.t] || 140);
function buildGrid() {
  const o = S.open, grid = $('grid'), headEl = $('ghead'), body = $('gbody');
  G.cols = o.cols.filter((c) => o.hidden.indexOf(c.k) < 0); G.widths = G.cols.map(widthOf); G.total = G.widths.reduce((a, b) => a + b, 0);
  clear(headEl); headEl.style.width = G.total + 'px';
  G.cols.forEach((c, i) => {
    const b = h('button', 'gh' + (C.isNumeric(c.t) ? ' n' : '')); b.type = 'button'; b.style.width = G.widths[i] + 'px'; b.setAttribute('role', 'columnheader'); b.dataset.k = c.k;
    const sorted = o.sort && o.sort[0] === c.k ? o.sort[1] : '';
    b.setAttribute('aria-sort', sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'); b.title = `${c.k} (${typeWords(c.t)}): tap to sort`;
    b.appendChild(h('span', '', c.k)); if (sorted) b.appendChild(h('i', '', sorted === 'asc' ? '▲' : '▼'));
    b.addEventListener('click', () => {                                     // tap a field name: biggest / newest first for numbers and dates (A to Z for text), then the other way, then the file's own order
      const firstDir = C.isNumeric(c.t) || c.t === 'date' ? 'desc' : 'asc', cur = o.sort && o.sort[0] === c.k ? o.sort[1] : '';
      o.sort = !cur ? [c.k, firstDir] : cur === firstDir ? [c.k, firstDir === 'desc' ? 'asc' : 'desc'] : null; refresh();
    });
    headEl.appendChild(b);
  });
  clear(body); body.style.width = G.total + 'px'; body.style.height = o.view.length * ROW + 'px';
  const want = Math.min(o.view.length, Math.ceil((grid.clientHeight || 480) / ROW) + 2 * OVER);
  G.pool = [];
  for (let i = 0; i < want; i++) {
    const el = h('div', 'grow'); el.setAttribute('role', 'row'); el.style.width = G.total + 'px';
    const cells = G.cols.map((c, j) => { const s = h('span', 'gc'); s.style.width = G.widths[j] + 'px'; s.setAttribute('role', 'cell'); el.appendChild(s); return s; });
    body.appendChild(el); G.pool.push({ el, cells, idx: -1, cls: cells.map(() => '') });
  }
  grid.setAttribute('aria-rowcount', String(o.view.length)); grid.setAttribute('aria-colcount', String(G.cols.length));
  G.first = -1; paint(true);
  $('colSum').textContent = `Fields shown: ${G.cols.length} of ${o.cols.length}`;
}
/** fill the pooled rows for the current scroll position; a row keeps its slot (idx % pool), so one step of scroll rewrites one row */
function paint(force) {
  const o = S.open; if (!o || !o.view) return;
  const n = o.view.length, P = G.pool.length; if (!P) return;
  const top = $('grid').scrollTop, first = C.clamp(Math.floor(top / ROW) - OVER, 0, Math.max(0, n - P));
  if (!force && first === G.first) return;
  G.first = first; G.paints++;
  for (let idx = first; idx < first + P; idx++) {
    const slot = G.pool[idx % P];
    if (slot.idx === idx && !force) continue;
    slot.idx = idx;
    const r = o.view[idx];
    slot.el.style.transform = `translateY(${idx * ROW}px)`;
    slot.el.className = 'grow' + (idx % 2 ? ' alt' : '') + (idx === G.sel ? ' sel' : '');
    slot.el.dataset.i = String(idx);
    for (let j = 0; j < G.cols.length; j++) {
      const c = G.cols[j], v = r[c.k], text = C.fmt(v, c.t), numeric = C.isNumeric(c.t);
      let cls = 'gc' + (numeric ? ' n' : '');
      if (text === '') cls += ' e'; else if ((c.t === 'usd' || c.t === 'R') && typeof v === 'number') cls += v > 0 ? ' pos' : v < 0 ? ' neg' : '';
      const cell = slot.cells[j]; cell.textContent = text === '' ? '–' : text;
      if (slot.cls[j] !== cls) { cell.className = cls; slot.cls[j] = cls; }
    }
  }
}
function showRow(idx) {
  const o = S.open, r = o.view[idx]; if (!r) return;
  G.sel = idx; paint(true);
  $('rowTitle').textContent = `Row ${C.num(idx + 1)} of ${C.num(o.view.length)}`;
  const dl = $('rowKv'); clear(dl);
  o.cols.forEach((c) => { dl.appendChild(h('dt', '', c.k)); const t = C.fmt(r[c.k], c.t, true); dl.appendChild(h('dd', t === '' ? 'note' : '', t === '' ? '(empty)' : t)); });
  $('rowCard').hidden = false;
}

// ------------------------------------------------------------------ stats, chart, group
function statLine(dl, k, v) { const d = h('div'); d.appendChild(h('span', '', k)); d.appendChild(h('em', '', v)); dl.appendChild(d); }
function renderStats() {
  const o = S.open, ul = $('statList'); clear(ul);
  $('statNote').textContent = `Quick stats of ${C.plural(o.view.length, 'row')}${o.filters.length ? ' (after the filters)' : ''}, one card per field.`;
  o.cols.forEach((c) => {
    const s = C.stats(o.view, c.k, c.t), li = h('li'), t = h('div', 't'); li.dataset.k = c.k;
    t.appendChild(h('b', '', c.k)); t.appendChild(h('span', 'pill', typeWords(c.t) + (c.mixed ? ' (mixed)' : ''))); li.appendChild(t);
    const dl = h('div', 'kv');
    statLine(dl, 'Count', C.num(s.count)); statLine(dl, 'Empty', C.num(s.empty)); statLine(dl, 'Distinct', C.num(s.distinct));
    if (C.isNumeric(c.t) && s.n) { const f = (x) => C.fmt(x, c.t); statLine(dl, 'Sum', f(s.sum)); statLine(dl, 'Mean', f(Math.round(s.mean * 10000) / 10000)); statLine(dl, 'Median', f(s.median)); statLine(dl, 'Min', f(s.min)); statLine(dl, 'Max', f(s.max)); }
    else if (c.t === 'date' && s.min !== undefined) { statLine(dl, 'First', C.fmt(s.min, 'date').slice(0, 16)); statLine(dl, 'Last', C.fmt(s.max, 'date').slice(0, 16)); }
    li.appendChild(dl);
    if (s.top && s.top.length && c.t !== 'json' && s.distinct < s.count) li.appendChild(h('p', 'top', 'Most common: ' + s.top.slice(0, 3).map((x) => `${C.compact(x.value, 28)} (${C.num(x.n)})`).join(', ')));
    ul.appendChild(li);
  });
}
/** bars / a line / a histogram in plain SVG. items = [{label, value}] */
function drawChart(svg, items, kind, t) {
  clear(svg);
  const W = 340, H = 200, L = 46, R = 8, T = 12, B = 30, pw = W - L - R, ph = H - T - B;
  if (!items.length) { svg.appendChild(sv('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, 'Nothing to draw: no numbers in the rows shown.')); return; }
  let lo = Math.min(0, ...items.map((i) => i.value)), hi = Math.max(0, ...items.map((i) => i.value)); if (lo === hi) hi = lo + 1;
  const y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph, f = (v) => (t === 'usd' ? C.money(Math.round(v)) : t === 'R' ? C.rWords(v) : C.num(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100));
  svg.appendChild(sv('line', { x1: L, y1: T, x2: L, y2: T + ph, class: 'axis' })); svg.appendChild(sv('line', { x1: L, y1: y(0), x2: W - R, y2: y(0), class: 'zero' }));
  svg.appendChild(sv('text', { x: L - 4, y: T + 7, 'text-anchor': 'end' }, f(hi))); svg.appendChild(sv('text', { x: L - 4, y: T + ph, 'text-anchor': 'end' }, f(lo)));
  if (lo < 0 && hi > 0 && y(0) > T + 14 && y(0) < T + ph - 8) svg.appendChild(sv('text', { x: L - 4, y: y(0) + 3, 'text-anchor': 'end' }, f(0)));
  const n = items.length, step = pw / n, every = Math.max(1, Math.ceil(n / 6)), cut = (s) => C.compact(s, n <= 4 ? 16 : n <= 8 ? 9 : 10);
  if (kind === 'line') {
    const x = (i) => L + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
    svg.appendChild(sv('polyline', { points: items.map((it, i) => `${x(i).toFixed(1)},${y(it.value).toFixed(1)}`).join(' '), class: 'ln' }));
    if (n <= 40) items.forEach((it, i) => svg.appendChild(sv('circle', { cx: x(i).toFixed(1), cy: y(it.value).toFixed(1), r: 2.2, class: 'dot' })));
    items.forEach((it, i) => { if (i % every === 0 || i === n - 1) svg.appendChild(sv('text', { x: x(i), y: H - 12, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, cut(it.label))); });
  } else {
    const signed = t === 'usd' || t === 'R';
    items.forEach((it, i) => {
      const y0 = y(0), y1 = y(it.value), bw = Math.max(1, step * (kind === 'hist' ? 0.94 : 0.72));
      svg.appendChild(sv('rect', { x: (L + i * step + (step - bw) / 2).toFixed(1), y: Math.min(y0, y1).toFixed(1), width: bw.toFixed(1), height: Math.max(0.8, Math.abs(y1 - y0)).toFixed(1), rx: Math.min(2, bw / 3), class: 'bar' + (signed && kind !== 'hist' ? (it.value >= 0 ? ' up' : ' down') : '') }));
      if (i % every === 0) svg.appendChild(sv('text', { x: L + i * step + step / 2, y: H - 12, 'text-anchor': 'middle' }, cut(it.label)));
    });
  }
}
function fillTable(table, cols, rows, cap) {
  const th = table.tHead, tb = table.tBodies[0]; clear(th); clear(tb);
  const tr = h('tr'); cols.forEach((c) => { const e = h('th', C.isNumeric(c.t) ? 'n' : '', c.label || c.k); e.scope = 'col'; tr.appendChild(e); }); th.appendChild(tr);
  rows.slice(0, cap || 50).forEach((r) => { const row = h('tr'); cols.forEach((c) => { const v = r[c.k], e = h('td', C.isNumeric(c.t) ? 'n' : '', C.fmt(v, c.t) || '–'); if ((c.t === 'usd' || c.t === 'R') && typeof v === 'number' && v !== 0) e.classList.add(v > 0 ? 'pos' : 'neg'); row.appendChild(e); }); tb.appendChild(row); });
}
function renderChart() {
  const o = S.open, ch = o.chart, yc = ch.y ? colOf(ch.y) : null, bc = colOf(ch.by), hist = ch.kind === 'hist';
  $('cByFld').hidden = hist; $('cAggFld').hidden = hist; $('cBucketFld').hidden = hist || bc.t !== 'date';
  const svg = $('chart'), n = o.view.length;
  if (hist) {
    if (!yc) { drawChart(svg, [], 'hist'); $('chartWords').textContent = 'A histogram needs a number field, and this table has none.'; $('chartNote').textContent = ''; fillTable($('groupTable'), [], []); return; }
    const bins = C.histogram(o.view, yc.k, 12);
    drawChart(svg, bins.map((b) => ({ label: C.fmt(b.lo, yc.t), value: b.n })), 'hist', 'number');
    $('chartWords').textContent = `How "${yc.k}" is spread: ${C.plural(n, 'row')} sorted into ${bins.length} equal ranges, tallest bar = most rows.`;
    $('chartNote').textContent = bins.length ? `From ${C.fmt(bins[0].lo, yc.t)} to ${C.fmt(bins[bins.length - 1].hi, yc.t)}.` : '';
    fillTable($('groupTable'), [{ k: 'from', t: yc.t }, { k: 'to', t: yc.t }, { k: 'rows', t: 'number' }], bins.map((b) => ({ from: b.lo, to: b.hi, rows: b.n })));
    return;
  }
  const agg = yc ? ch.agg : 'count', groups = C.groupBy(o.view, bc.k, bc.t, yc ? yc.k : null, yc ? yc.t : null, ch.bucket, agg);
  const val = (g) => (agg === 'count' ? g.count : agg === 'mean' ? g.mean : g.sum), vt = agg === 'count' ? 'number' : yc.t;
  const cap = ch.kind === 'line' ? 400 : 24, shown = groups.filter((g) => val(g) !== null).slice(0, cap);
  drawChart(svg, shown.map((g) => ({ label: g.key, value: val(g) })), ch.kind, vt);
  const by = bc.t === 'date' ? `${bc.k} (by ${ch.bucket})` : bc.k;
  $('chartWords').textContent = agg === 'count' ? `Rows counted for each "${by}".` : `The ${agg === 'mean' ? 'mean' : 'sum'} of "${yc.k}" for each "${by}".`;
  $('chartNote').textContent = `${C.plural(groups.length, 'group')} from ${C.plural(n, 'row')}${groups.length > shown.length ? `; the chart shows the first ${shown.length}` : ''}${groups.length > 50 ? '; the list shows the first 50' : ''}.`;
  const cols = [{ k: 'key', t: 'text', label: by }, { k: 'count', t: 'number', label: 'rows' }];
  if (yc) cols.push({ k: 'sum', t: yc.t, label: 'sum' }, { k: 'mean', t: yc.t, label: 'mean' });
  fillTable($('groupTable'), cols, groups.map((g) => Object.assign({}, g, { mean: g.mean === null ? null : Math.round(g.mean * 100) / 100, sum: g.sum === null ? null : Math.round(g.sum * 100) / 100 })));
}
function setTab(tab) {
  const o = S.open; o.tab = tab;
  for (const [id, name] of [['tabRows', 'rows'], ['tabStats', 'stats'], ['tabChart', 'chart']]) $(id).setAttribute('aria-selected', String(name === tab));
  $('panelRows').hidden = tab !== 'rows'; $('panelStats').hidden = tab !== 'stats'; $('panelChart').hidden = tab !== 'chart';
  if (tab === 'stats') renderStats(); else if (tab === 'chart') renderChart(); else { buildGrid(); }
}
/** filters or sort changed: recompute the rows in view and redraw the open tab */
function refresh(first) {
  const o = S.open;
  if (o.filters.length < 2) o.mode = 'all';                                  // 'match any' only means something with two filters or more
  const kept = C.applyFilters(o.rows, o.filters, o.cols, S.today, o.mode);
  o.view = o.sort ? C.sortRows(kept, o.sort[0], o.sort[1], colOf(o.sort[0]).t) : kept;
  G.sel = -1; $('rowCard').hidden = true;
  renderFilters();
  $('count').textContent = o.view.length === o.rows.length ? `${C.plural(o.rows.length, 'row')}. Tap a field name to sort, a row to read it in full.` : `${C.num(o.view.length)} of ${C.plural(o.rows.length, 'row')} match.`;
  $('grid').scrollTop = 0;
  setTab(o.tab);
  $('shareFld').hidden = true;
  setHash();
}

// ------------------------------------------------------------------ export, share, saved views
function fileStem() { return S.open.card.id.replace(/[^a-z0-9]+/g, '-') + (S.open.filters.length ? '-filtered' : ''); }
function exportRows(kind) {
  const o = S.open; if (!o || !o.view) return;
  if (kind === 'csv') download(fileStem() + '.csv', '\ufeff' + C.toCSV(o.view, o.cols), 'text/csv;charset=utf-8'); else download(fileStem() + '.json', C.toJSON(o.view, o.cols), 'application/json');
  say(`Exported ${C.plural(o.view.length, 'row')} as ${kind.toUpperCase()}${o.label === 'demo' ? ' (DEMO data)' : ''}.`);
}
function shareLink() {
  const link = location.href.split('#')[0] + '#' + C.encodeView(currentView());
  $('shareOut').value = link; $('shareFld').hidden = false;
  const done = (ok) => say(ok ? 'Link copied. Opening it restores this table with its filters.' : 'The link is in the box below: copy it from there.');
  try { navigator.clipboard.writeText(link).then(() => done(true), () => done(false)); } catch (_) { done(false); }
}
function loadViews() { const raw = store(); const v = raw ? C.normalizeViews(raw) : null; S.views = v || []; }
function saveViews() { return store(C.exportViews(S.views)); }
function renderViews() {
  const ul = $('vList'); clear(ul); $('viewsPill').textContent = String(S.views.length);
  S.views.forEach((v, i) => {
    const li = h('li'), b = h('button', 'trow'), card = cardById(v.view.t); b.type = 'button'; b.dataset.view = v.name;
    b.appendChild(h('b', '', v.name)); b.appendChild(h('span', 'pill', card ? card.district : 'missing'));
    b.appendChild(h('span', 'meta', `${card ? card.name : v.view.t}${v.view.f && v.view.f.length ? ` · ${C.plural(v.view.f.length, 'filter')}` : ''}${v.at ? ` · saved ${v.at}` : ''}`));
    b.addEventListener('click', () => { if (!card) { say(`The table of "${v.name}" is not in this catalogue.`); return; } openTable(v.view.t, v.view); });
    const del = h('button', 'btn del', '✕'); del.type = 'button'; del.setAttribute('aria-label', `Delete the saved view ${v.name}`); del.addEventListener('click', () => { S.views.splice(i, 1); saveViews(); renderViews(); say(`Deleted "${v.name}".`); });
    li.appendChild(b); li.appendChild(del); ul.appendChild(li);
  });
  if (!S.views.length) ul.appendChild(h('li', 'note', 'No saved views yet. Open a table, set it up the way you like, then save it here.'));
  $('vExport').disabled = !S.views.length;
}
function saveView() {
  if (!S.open || !S.open.rows) return;
  const name = $('vName').value.replace(/\s+/g, ' ').trim().slice(0, 60) || `${S.open.card.name}${S.open.filters.length ? ' (filtered)' : ''}`.slice(0, 60);
  S.views = S.views.filter((v) => v.name !== name); S.views.unshift({ name, view: currentView(), at: S.today }); S.views = S.views.slice(0, 60);
  const ok = saveViews(); $('vName').value = ''; renderViews(); say(ok ? `Saved "${name}" on this phone.` : `Saved "${name}" for this visit only (this browser blocks storage).`);
}
function importViews(text) {
  const got = C.normalizeViews(text);
  if (!got) { say('That file is not a Pinakes views file. Nothing was changed.'); return; }
  const names = new Set(got.map((v) => v.name)); S.views = got.concat(S.views.filter((v) => !names.has(v.name))).slice(0, 60);
  saveViews(); renderViews(); say(`Imported ${C.plural(got.length, 'view')}.`);
}

// ------------------------------------------------------------------ Ask
function renderAsks() {
  const box = $('asks'); clear(box);
  C.ASKS.forEach((a) => { const b = h('button', 'btn', a.title); b.type = 'button'; b.dataset.ask = a.id; b.addEventListener('click', () => runAsk(a)); box.appendChild(b); });
}
async function rowsOfCard(card) {
  if (card.source === 'research' || (!card.url && !card.inline)) return { err: 'research' };
  let doc;
  if (card.inline) doc = S.fixture && S.fixture.data ? S.fixture.data[card.inline] : undefined; else { const r = await loadDoc(card.url); if (r.err !== undefined) return { err: r.err }; doc = r.doc; }
  if (doc === undefined || doc === null) return { err: 404 };
  return { rows: C.openTable(doc, card.path, card.kind, card.opts).rows, label: C.docLabel(card, doc) };
}
async function runAsk(a) {
  $('askOut').hidden = false; $('askTitle').textContent = a.title; $('askWords').textContent = a.words; $('askSrc').textContent = 'Reading the tables...'; $('askNote').textContent = '';
  $('askChart').setAttribute('hidden', ''); fillTable($('askTable'), [], []);
  for (const b of $('asks').children) b.setAttribute('aria-pressed', String(b.dataset.ask === a.id));
  const missed = []; let used = null;
  for (const ids of a.tries) {
    const cards = ids.map(cardById);
    if (cards.some((c) => !c)) continue;
    const got = []; let fail = null;
    for (const c of cards) { const r = await rowsOfCard(c); if (r.err !== undefined) { fail = C.whyWords(c, r.err); break; } got.push({ card: c, rows: r.rows, label: r.label }); }
    if (fail) { missed.push(fail); continue; }
    used = got; break;
  }
  if (!used) { $('askSrc').textContent = missed.length ? `This question could not be answered. ${missed[0]}` : 'This question needs a table that is not in this catalogue.'; S.ask = { id: a.id, ok: false }; say(`${a.title}: no answer.`); return; }
  const res = a.run(used.map((u) => u.rows), S.today), labels = used.map((u) => u.label), demo = labels.some((l) => l === 'demo'), sample = labels.some((l) => l === 'sample');
  $('askSrc').textContent = `${demo ? 'DEMO data (not real). ' : sample ? 'SAMPLE data. ' : ''}Read from: ${used.map((u) => `${u.card.name} (${C.plural(u.rows.length, 'row')})`).join(', ')}.${missed.length ? ` ${missed[0]} So a labelled stand-in is used.` : ''}`;
  fillTable($('askTable'), res.cols, res.rows, 30);
  if (res.chart && res.rows.length) { const yc = res.cols.filter((c) => c.k === res.chart.y)[0]; drawChart($('askChart'), res.rows.slice(0, 24).map((r) => ({ label: String(r[res.chart.x]), value: r[res.chart.y] || 0 })), 'bar', yc ? yc.t : 'number'); $('askChart').removeAttribute('hidden'); }
  $('askNote').textContent = res.note + (res.rows.length > 30 ? ` Showing the first 30 of ${res.rows.length}.` : '');
  S.ask = { id: a.id, ok: true, rows: res.rows, demo, sample, from: used.map((u) => u.card.id) };
  say(`${a.title}: ${C.plural(res.rows.length, 'line')}${demo ? ' (DEMO data)' : ''}.`);
}

// ------------------------------------------------------------------ start
function wire() {
  $('q').addEventListener('input', () => { S.q = $('q').value; S.shown = PAGE; renderList(); });
  $('more').addEventListener('click', () => { S.shown += PAGE; renderList(); });
  $('back').addEventListener('click', backToCatalogue);
  $('pathSel').addEventListener('change', () => usePath($('pathSel').value, null));
  $('fCol').addEventListener('change', fillOps); $('fOp').addEventListener('change', opChanged);
  $('fAdd').addEventListener('click', addFilter);
  $('fVal').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFilter(); });
  $('fMode').addEventListener('click', () => { S.open.mode = S.open.mode === 'any' ? 'all' : 'any'; refresh(); });
  $('fClear').addEventListener('click', () => { S.open.filters = []; refresh(); say('Filters cleared.'); });
  for (const id of ['tabRows', 'tabStats', 'tabChart']) $(id).addEventListener('click', () => { setTab($(id).dataset.tab); setHash(); });
  let queued = false;
  $('grid').addEventListener('scroll', () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(false); }); }, { passive: true });
  $('gbody').addEventListener('click', (e) => { let el = e.target; while (el && el !== e.currentTarget && !(el.classList && el.classList.contains('grow'))) el = el.parentNode; if (el && el.dataset && el.dataset.i !== undefined) showRow(+el.dataset.i); });
  $('rowClose').addEventListener('click', () => { $('rowCard').hidden = true; G.sel = -1; paint(true); });
  $('csvBtn').addEventListener('click', () => exportRows('csv')); $('jsonBtn').addEventListener('click', () => exportRows('json')); $('shareBtn').addEventListener('click', shareLink);
  $('shareOut').addEventListener('focus', () => $('shareOut').select());
  for (const id of ['cKind', 'cY', 'cBy', 'cBucket', 'cAgg']) $(id).addEventListener('change', () => { const ch = S.open.chart; ch.kind = $('cKind').value; ch.y = $('cY').value; ch.by = $('cBy').value; ch.bucket = $('cBucket').value; ch.agg = $('cAgg').value; renderChart(); setHash(); });
  $('vSave').addEventListener('click', saveView);
  $('vName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveView(); });
  $('vExport').addEventListener('click', () => { download('pinakes-views.json', C.exportViews(S.views), 'application/json'); say(`Exported ${C.plural(S.views.length, 'view')}.`); });
  $('vFile').addEventListener('change', () => { const f = $('vFile').files && $('vFile').files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { importViews(String(rd.result || '')); $('vFile').value = ''; }; rd.readAsText(f); });
  window.addEventListener('hashchange', () => { const v = C.decodeView(location.hash); if (v && (!S.open || !S.open.rows || C.encodeView(currentView()) !== C.encodeView(v))) openTable(v.t, v); else if (!v && S.open) backToCatalogue(); });
  window.addEventListener('resize', () => { if (S.open && S.open.view && S.open.tab === 'rows') buildGrid(); });
}
async function start() {
  const qs = new URLSearchParams(location.search);
  S.forced = qs.get('demo') === '1';
  const t = qs.get('today'); S.today = t && /^\d{4}-\d\d-\d\d$/.test(t) ? t : localToday();
  S.now = t && /^\d{4}-\d\d-\d\d$/.test(t) ? C.toMs(S.today) + 43200000 : Date.now();
  wire();
  const [cat, fx] = await Promise.all([S.forced ? null : getJSON('./catalog.json'), getJSON('./fixture.json')]);
  S.fixture = fx;
  let c = cat ? C.normalizeCatalog(cat) : null;
  if (c && !c.tables.length) c = null;
  if (!c) { c = fx && fx.catalog ? C.normalizeCatalog(fx.catalog) : null; S.demo = true; }
  if (!c) c = { tables: [], built: '', demo: true };
  S.cat = c; $('demo').hidden = !S.demo;
  loadViews(); renderDistricts(); renderList(); renderAsks(); renderViews(); startScene(); showView(false);
  say(S.demo ? (S.forced ? 'DEMO: example tables, not real numbers.' : 'The catalogue file could not be read, so this is the DEMO: example tables, not real numbers.') : `${C.totalWords(C.totals(c.tables))} in the catalogue. Pick a drawer or search.`);
  const v = C.decodeView(location.hash);
  if (v) await openTable(v.t, v);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the kit lifts its loading veil by itself after 12 s */ }
}

window.PINAKES = {
  ready: () => S.ready, S, G, C, scene: () => S.scene, open: (id, view) => openTable(id, view), view: () => (S.open && S.open.rows ? currentView() : null), raw: () => store(),
  /** scroll the grid through `steps` positions and time each repaint (with a forced layout), in ms */
  bench(steps) {
    const g = $('grid'), n = S.open && S.open.view ? S.open.view.length : 0, max = Math.max(0, n * ROW - g.clientHeight), ts = [];
    for (let i = 0; i < (steps || 60); i++) { const t0 = performance.now(); g.scrollTop = Math.round(((i * 7919) % 1000) / 1000 * max); paint(false); void g.offsetHeight; void $('gbody').getBoundingClientRect(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    return { median: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * 0.95)], max: ts[ts.length - 1], dom: $('gbody').children.length, rows: n, cells: $('gbody').querySelectorAll('.gc').length };
  },
};
start();
