// CLIO page (ES module): the research library. Browses the write-ups the site publishes (writeups/index.json when the build writes it, else the docs list inside data.json, else fixture.json = DEMO),
// searchable, grouped by verdict, with the best and worst ideas by the dollars a month each write-up quotes, and a plain reader (writeups/<slug>.md). Read only: it sends nothing and keeps nothing.
// Text only through textContent. window.CLIO is the test hook.
import * as C from './cliocore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { all: [], demo: false, group: 'all', sort: 'new', q: '', shown: 30, ready: false, open: null, last: null };
const PAGE = 30;

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getText(slug) {
  if (!C.isSlug(slug)) return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), 8000) : 0;
  try { const r = await fetch('../writeups/' + encodeURIComponent(slug) + '.md', { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.text() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const pmWord = (r) => (r.pm == null ? '' : `${C.moneyS(r.pm)} a month`);

function item(r) {
  const li = h('li', 'wu'); li.dataset.slug = r.slug;
  const head = h('div', 'wu-h'); head.appendChild(h('h3', '', r.title)); li.appendChild(head);
  const meta = h('div', 'wu-m'); meta.appendChild(h('span', 'pill ' + ({ adopt: 'ok', promising: 'warn', rejected: 'bad', finding: 'info' }[r.group] || ''), C.GROUP_WORD[r.group] || 'Note'));
  if (r.date) meta.appendChild(h('span', 'note', C.dayWord(r.date))); if (r.pm != null) meta.appendChild(h('b', 'ag-num ' + (r.pm >= 0 ? 'pos' : 'neg'), pmWord(r))); li.appendChild(meta);
  if (r.summary) li.appendChild(h('p', 'wu-s', r.summary));
  const b = h('button', 'btn', 'Read'); b.type = 'button'; b.setAttribute('aria-label', 'Read: ' + r.title); b.addEventListener('click', () => openReader(r, b)); li.appendChild(b);
  return li;
}

function renderChips() {
  const box = $('groups'); clear(box); const c = C.counts(S.all);
  for (const [g, name] of C.GROUPS) {
    if (g !== 'all' && !c[g]) continue;
    const b = h('button', 'ag-chip', `${name} ${c[g]}`); b.type = 'button'; b.dataset.g = g; b.setAttribute('aria-pressed', g === S.group ? 'true' : 'false');
    b.addEventListener('click', () => { S.group = g; S.shown = PAGE; render(); }); box.appendChild(b);
  }
  const sb = $('sorts'); clear(sb);
  for (const [k, name] of [['new', 'Newest'], ['money', 'Best $ a month']]) {
    const b = h('button', 'ag-chip', name); b.type = 'button'; b.dataset.s = k; b.setAttribute('aria-pressed', k === S.sort ? 'true' : 'false');
    b.addEventListener('click', () => { S.sort = k; S.shown = PAGE; render(); }); sb.appendChild(b);
  }
}

function renderIdeas() {
  const id = C.ideas(S.all), mk = (id2, list, cls, empty) => {
    const ul = $(id2); clear(ul);
    for (const r of list) { const li = h('li', 'idea'); const b = h('button', 'ideabtn'); b.type = 'button'; b.setAttribute('aria-label', `Read: ${r.title}, ${pmWord(r)}`); b.appendChild(h('b', 'ag-num ' + cls, pmWord(r))); b.appendChild(h('span', '', r.title)); b.addEventListener('click', () => openReader(r, b)); li.appendChild(b); ul.appendChild(li); }
    if (!list.length) ul.appendChild(h('li', 'note', empty));
  };
  mk('best', id.best, 'pos', 'No write-up quotes a positive $ a month yet.'); mk('worst', id.worst, 'neg', 'No write-up quotes a negative $ a month yet.');
  $('ideasNote').textContent = `${id.ranked} of ${S.all.length} write-ups quote a $ a month in their own words. The rest are not ranked. Looking back, not a promise.`;
}

function render() {
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderChips(); renderIdeas();
  const v = C.view(S.all, { group: S.group, q: S.q, sort: S.sort }), ul = $('list'); clear(ul);
  for (const r of v.slice(0, S.shown)) ul.appendChild(item(r));
  if (!v.length) ul.appendChild(h('li', 'note empty', S.q ? `Nothing matches "${S.q}". Try fewer or simpler words.` : 'Nothing in this group yet.'));
  $('count').textContent = `${v.length} write-up${v.length === 1 ? '' : 's'}${S.q ? ` for "${S.q}"` : ''}`;
  const more = $('more'); more.hidden = v.length <= S.shown;
  say(`${v.length} write-ups shown${S.q ? ` for ${S.q}` : ''}.`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

// ------------------------------------------------------------------------------------------------ the reader
function closeReader() { const s = $('sheet'); s.hidden = true; $('scrim').hidden = true; S.open = null; if (S.last && S.last.focus) { try { S.last.focus(); } catch (_) { /* gone */ } } }
async function openReader(r, from) {
  S.open = r.slug; S.last = from;
  $('shTitle').textContent = r.title; const body = $('shBody'); clear(body); body.appendChild(h('p', 'note', 'Loading...'));
  $('sheet').hidden = false; $('scrim').hidden = false; $('shClose').focus();
  let text = S.demo ? r.body : await getText(r.slug);
  if (S.open !== r.slug) return;
  clear(body);
  const blocks = text ? C.plainMd(text, 6000) : [];
  if (!blocks.length) { body.appendChild(h('p', 'lead', r.summary || 'No text for this write-up.')); body.appendChild(h('p', 'note', 'The full text could not be loaded. The summary above is what the index holds.')); }
  let ul = null;
  for (const b of blocks) {
    if (b.k === 'li') { if (!ul) { ul = h('ul', 'rd-ul'); body.appendChild(ul); } ul.appendChild(h('li', '', b.t)); continue; }
    ul = null; body.appendChild(h(b.k === 'h' ? 'h3' : 'p', b.k === 'row' ? 'rd-row' : b.k === 'h' ? 'rd-h' : 'rd-p', b.t));
  }
  body.scrollTop = 0; say(`Reading: ${r.title}.`);
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  const [fx, idx, data] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../writeups/index.json'), forced ? null : getJSON('../data.json', 12000)]);
  let list = forced ? null : C.normIndex(idx) || C.normIndex(data);
  if (!list) { list = C.normIndex(fx); S.demo = true; }
  if (!list) throw new Error('no library');
  S.all = list; S.q = q.get('q') || ''; $('q').value = S.q;
  const g = q.get('g'); if (C.GROUPS.some((x) => x[0] === g)) S.group = g;
  $('q').addEventListener('input', (e) => { S.q = e.target.value.slice(0, 80); S.shown = PAGE; render(); });
  $('more').addEventListener('click', () => { S.shown += PAGE; render(); });
  $('shClose').addEventListener('click', closeReader); $('scrim').addEventListener('click', closeReader);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) closeReader(); });
  render();
}
window.CLIO = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Clio could not start'); } catch (_) { /* nothing */ } });
