// AGORA GALLERY page (ES module; imports only gallerycore.js): the shelf with category chips, the name and meaning of the shape on the pedestal, the quality buttons, the scene builder
// (up to 6 shapes on a ring, a Share link that restores the layout from the #hash), the collection of every shape, and the 2D drawings that are always there.
// The 3D stage lives in stage.js (window.GALLERY3D); if it is missing or cannot start, this page still shows every shape as a drawing.
// Reads fixture.json only and sends nothing. Text only through textContent / createElementNS. window.GALLERY is the test hook.
import * as C from './gallerycore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const VIEWS = [['shelf', 'Shelf'], ['build', 'Build'], ['collection', 'Collection']];
const S = { items: [], i: 0, focus: false, mode: 'auto', cat: 'All', view: 'shelf', build: [], pick: null, sample: false, three: false, ready: false, buttons: {}, tiles: {}, secs: {}, chips: {} };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function drawGlyph(svg, id) { clear(svg); for (const [tag, attrs] of C.GLYPHS[id] || C.GLYPHS.doric) svg.appendChild(sv(tag, attrs)); }
function glyphSvg(id, w) {
  const s = sv('svg', { viewBox: '0 0 64 64', fill: 'none', stroke: 'currentColor', 'stroke-width': w || '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  drawGlyph(s, id); return s;
}
function stage() { return window.GALLERY3D && window.GALLERY3D.ok ? window.GALLERY3D : null; }
const byId = (id) => S.items.find((s) => s.id === id);
const visible = () => C.filter(S.items, S.cat);

function renderShelf() {
  const box = $('shelf'); clear(box); S.tiles = {}; S.secs = {};
  for (const grp of C.grouped(S.items)) {
    const sec = h('section'), grid = h('div', 'grid');
    sec.appendChild(h('h3', null, grp.name));
    for (const s of grp.items) {
      const b = h('button', 'shape'); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.dataset.id = s.id;
      b.setAttribute('aria-label', `${s.name}. ${s.means}`);
      b.appendChild(glyphSvg(s.id)); b.appendChild(h('span', null, s.name));
      b.addEventListener('click', () => tile(s.id));
      grid.appendChild(b); S.tiles[s.id] = b;
    }
    sec.appendChild(grid); box.appendChild(sec); S.secs[grp.name] = sec;
  }
}
function renderChips() {
  const box = $('cats'); clear(box); S.chips = {};
  for (const name of ['All'].concat(C.GROUPS)) {
    const n = name === 'All' ? S.items.length : C.filter(S.items, name).length;
    if (!n) continue;
    const b = h('button', 'ag-chip', `${name} ${n}`); b.type = 'button'; b.dataset.cat = name; b.setAttribute('aria-pressed', String(name === S.cat));
    b.addEventListener('click', () => setCat(name));
    box.appendChild(b); S.chips[name] = b;
  }
}
function renderViews() {
  const box = $('views'); clear(box);
  for (const [v, label] of VIEWS) {
    const b = h('button', 'btn', label); b.type = 'button'; b.dataset.view = v; b.setAttribute('aria-pressed', String(v === S.view));
    b.addEventListener('click', () => setView(v));
    box.appendChild(b);
  }
}
function renderQuality() {
  const box = $('quality'); clear(box); S.buttons = {};
  for (const m of C.MODES) {
    const b = h('button', 'btn', C.MODE_LABEL[m]); b.type = 'button'; b.dataset.mode = m; b.setAttribute('aria-pressed', String(m === S.mode));
    b.addEventListener('click', () => setMode(m));
    box.appendChild(b); S.buttons[m] = b;
  }
}

function applyFilter() {
  for (const name in S.secs) S.secs[name].hidden = !(S.cat === 'All' || S.cat === name);
  for (const k in S.chips) S.chips[k].setAttribute('aria-pressed', String(k === S.cat));
}
function renderBuild() {
  const ids = S.build, box = $('picked'); clear(box);
  for (const id of ids) { const s = byId(id); if (!s) continue; const b = h('button', 'ag-chip', `${s.name}  ×`); b.type = 'button'; b.setAttribute('aria-label', `Take ${s.name} out`); b.addEventListener('click', () => tile(id)); box.appendChild(b); }
  $('buildCount').textContent = ids.length ? `${ids.length} of ${C.MAX_BUILD} on the pedestal. Tap one here or on the shelf to take it out.` : `Tap shapes on the shelf below to put up to ${C.MAX_BUILD} on the pedestal.`;
  for (const id in S.tiles) S.tiles[id].dataset.picked = ids.indexOf(id) >= 0 ? '1' : '0';
  const g = stage(), bi = g ? g.info().build : null;
  $('buildNote').textContent = bi && ids.length ? `${C.fmt(bi.tris)} triangles, ${C.fmt(bi.draws)} draw calls for the whole scene.` : '';
  $('buildShare').disabled = !ids.length; $('buildClear').disabled = !ids.length;
  const row = $('flatRow'); clear(row);
  if (!g && S.view === 'build') for (const id of ids) row.appendChild(glyphSvg(id, '2.4'));
}
function renderInfo() {
  const s = S.items[S.i]; if (!s) return;
  $('shapeGroup').textContent = s.group; $('shapeName').textContent = s.name; $('shapePos').textContent = `${C.position(S.i, S.items.length)}`;
  $('shapeMeans').textContent = s.means;
  if (S.view === 'shelf') drawGlyph($('flatSvg'), s.id);
  for (const id in S.tiles) S.tiles[id].setAttribute('aria-pressed', String(S.view === 'shelf' && id === s.id));
  $('focusBtn').setAttribute('aria-pressed', String(S.focus));
  $('focusBtn').textContent = S.focus ? 'Back to the shelf view' : 'Look closer';
  const g = stage(), info = g ? g.info() : null;
  if (info && info.both) {
    const here = info.lite ? info.both.lite : info.both.hd, other = info.lite ? info.both.hd : info.both.lite;
    $('tTris').textContent = C.fmt(here.tris); $('tTrisNote').textContent = `${info.lite ? 'Lite' : 'High'}; ${info.lite ? 'High' : 'Lite'} has ${C.fmt(other.tris)}`;
    $('tDraws').textContent = C.fmt(here.draws); $('tDrawsNote').textContent = `${info.lite ? 'Lite' : 'High'}; ${info.lite ? 'High' : 'Lite'} has ${C.fmt(other.draws)}`;
    $('qualityNote').textContent = C.qualityWords(info.lite);
    $('lite').hidden = !info.lite;
  } else {
    $('tTris').textContent = '-'; $('tTrisNote').textContent = '3D is not running'; $('tDraws').textContent = '-'; $('tDrawsNote').textContent = 'showing the drawing';
    $('qualityNote').textContent = 'Your device could not start 3D, so each shape is shown as a drawing. The shelf works the same.';
    $('lite').hidden = true;
  }
  for (const m in S.buttons) S.buttons[m].setAttribute('aria-pressed', String(m === S.mode));
  for (const b of $('views').children) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  $('infoCard').hidden = S.view !== 'shelf'; $('buildCard').hidden = S.view !== 'build'; $('collCard').hidden = S.view !== 'collection';
  const box = $('stageBox'); box.classList.toggle('no3d', !g); box.classList.toggle('rowmode', !g && S.view === 'build' && S.build.length > 0);
  $('prev').hidden = $('next').hidden = S.view !== 'shelf';
  let hint;
  if (!g) hint = S.view === 'shelf' ? 'A drawing of the shape (3D is not available here).' : 'The drawings below show every shape (3D is not available here).';
  else if (S.view === 'build') hint = 'Drag to turn your scene.';
  else if (S.view === 'collection') hint = 'Drag to turn. Tap a shape to pick it.';
  else hint = S.focus ? 'Close up. Drag to turn. Tap to step back.' : 'Drag to turn. Tap to look closer.';
  $('hint').textContent = hint;
  if (S.view === 'shelf') say(`${s.name}. ${C.position(S.i, S.items.length)}. ${s.means}`);
}
function renderColl() {
  const g = stage(), ci = g ? g.info().collection : null, p = S.pick ? byId(S.pick) : null;
  $('collCount').textContent = ci ? `${ci.count} shapes in one scene, each one drawn in a single piece (LITE): ${C.fmt(ci.tris)} triangles, ${ci.draws} draw calls.` : `${S.items.length} shapes. 3D is not available here, so see the drawings on the shelf below.`;
  $('collName').textContent = p ? p.name + '.' : 'Tap a shape.'; $('collMeans').textContent = p ? p.means : '';
  $('collOpen').disabled = !p;
}

// ---- actions
function tile(id) {
  if (S.view === 'build') {
    const r = C.toggleId(S.build, id, C.MAX_BUILD); S.build = r.ids;
    const g = stage(); if (g) g.setBuild(S.build);
    writeHash(); renderBuild(); renderInfo();
    say(r.full ? `That is ${C.MAX_BUILD}, the most a scene holds. Tap one to take it out.` : `${byId(id).name} ${r.added ? 'added' : 'taken out'}. ${S.build.length} of ${C.MAX_BUILD}.`);
    return;
  }
  if (S.view === 'collection') { S.pick = id; renderColl(); say(`${byId(id).name}. ${byId(id).means}`); return; }
  select(C.indexOf(S.items, id), true);
}
function select(i, focus) {
  S.i = C.step(i, 0, S.items.length);
  if (focus != null) S.focus = !!focus;
  const g = stage(), s = S.items[S.i];
  if (g) { g.show(s.id); g.setFocus(S.focus); }
  renderInfo();
  if (focus) { try { $('stageCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { /* fine */ } }
}
function stepNav(d) {
  const vis = visible(); if (!vis.length) return;
  const k = vis.findIndex((s) => s.id === S.items[S.i].id), n = vis.length;
  select(C.indexOf(S.items, vis[C.step(k < 0 ? 0 : k, d, n)].id));
}
function setCat(name) { S.cat = C.GROUPS.indexOf(name) >= 0 ? name : 'All'; applyFilter(); const vis = visible(); say(`${S.cat}: ${vis.length} shapes.`); if (S.view === 'shelf' && vis.length && !vis.some((s) => s.id === S.items[S.i].id)) select(C.indexOf(S.items, vis[0].id)); }
function setView(v) {
  S.view = VIEWS.some((x) => x[0] === v) ? v : 'shelf';
  if (S.view !== 'shelf') S.focus = false;
  const g = stage(); if (g) { g.setView(S.view); if (S.view === 'build') g.setBuild(S.build); if (S.view === 'shelf') { g.show(S.items[S.i].id); g.setFocus(S.focus); } }
  renderBuild(); renderColl(); renderInfo(); writeHash();
  if (S.view === 'build') say(S.build.length ? `Your scene: ${S.build.length} of ${C.MAX_BUILD}.` : `Scene builder. Tap shapes on the shelf to put up to ${C.MAX_BUILD} on the pedestal.`);
  else if (S.view === 'collection') say(`Collection: all ${S.items.length} shapes at once.`);
}
function toggleFocus() { if (S.view !== 'shelf') return; S.focus = !S.focus; const g = stage(); if (g) g.setFocus(S.focus); renderInfo(); }
function setMode(m) {
  S.mode = C.MODES.indexOf(m) >= 0 ? m : 'auto';
  const g = stage(); if (g) g.setMode(S.mode);
  renderInfo();
  if (O && O.cue) { try { O.cue('tap'); } catch (_) { /* sound is optional */ } }
}
function writeHash() {
  try { if (S.view === 'build') history.replaceState(null, '', location.pathname + location.search + C.makeHash(S.build)); else if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* the link just stays as it was */ }
}
async function share() {
  const url = location.origin + location.pathname + location.search + C.makeHash(S.build), box = $('shareUrl');
  box.value = url; box.hidden = false;
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch (_) { ok = false; }
  if (!ok) { try { box.focus(); box.select(); } catch (_) { /* select by hand */ } }
  $('buildNote').textContent = ok ? 'Link copied. Open it anywhere to get this scene back.' : 'Copy the link above to keep this scene.';
  say(ok ? 'Link copied.' : 'Copy the link shown to keep this scene.');
}

function waitFor3D(ms) {
  return new Promise((res) => {
    if (window.GALLERY3D) return res(window.GALLERY3D);
    const t = setTimeout(() => res(window.GALLERY3D || { ok: false, reason: 'timeout' }), ms);
    window.addEventListener('gallery:stage', () => { clearTimeout(t); res(window.GALLERY3D); }, { once: true });
  });
}

async function boot() {
  const q = new URLSearchParams(location.search);
  const fx = await getJSON('./fixture.json');
  S.items = C.shelf(fx); S.sample = !(fx && Array.isArray(fx.shapes) && fx.shapes.length);
  $('sample').hidden = !S.sample;
  const want = q.get('shape'); S.i = want ? C.indexOf(S.items, want) : 0;
  S.mode = C.MODES.indexOf(q.get('mode')) >= 0 ? q.get('mode') : 'auto';
  S.focus = q.get('focus') === '1';
  const cat = q.get('cat'); S.cat = C.GROUPS.indexOf(cat) >= 0 ? cat : 'All';
  const hashed = C.parseHash(location.hash, S.items.map((s) => s.id), C.MAX_BUILD);
  if (hashed) { S.build = hashed; S.view = 'build'; } else if (q.get('view') === 'collection' || q.get('view') === 'build') S.view = q.get('view');
  renderShelf(); renderChips(); renderViews(); renderQuality(); applyFilter();
  $('prev').addEventListener('click', () => stepNav(-1)); $('next').addEventListener('click', () => stepNav(1));
  $('focusBtn').addEventListener('click', toggleFocus);
  $('buildClear').addEventListener('click', () => { S.build = []; const g = stage(); if (g) g.setBuild([]); writeHash(); renderBuild(); renderInfo(); say('Scene cleared.'); });
  $('buildShare').addEventListener('click', share);
  $('collOpen').addEventListener('click', () => { if (S.pick) { const id = S.pick; setView('shelf'); select(C.indexOf(S.items, id), true); } });
  window.addEventListener('gallery:tap', toggleFocus);
  window.addEventListener('gallery:pick', (e) => { const id = e.detail && e.detail.id; if (id && byId(id)) { S.pick = id; renderColl(); say(`${byId(id).name}. ${byId(id).means}`); } });
  window.addEventListener('gallery:changed', () => { if (S.ready) { renderInfo(); renderBuild(); renderColl(); } });
  window.addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (S.view !== 'shelf') return; if (e.key === 'ArrowLeft') stepNav(-1); else if (e.key === 'ArrowRight') stepNav(1); });
  renderBuild(); renderColl(); renderInfo();            // the drawings and the words are on screen before 3D is even asked
  S.ready = false; say('Loading the stage...');
  const g = await waitFor3D(12000);
  S.three = !!(g && g.ok);
  if (S.three && S.mode !== 'auto') g.setMode(S.mode);
  select(S.i, S.focus);
  if (S.view !== 'shelf') setView(S.view);
  S.ready = true;
  renderBuild(); renderColl(); renderInfo();
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.GALLERY = { S, C, ready: () => S.ready, select, setMode, setView, setCat, toggleFocus, tile, share };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('The gallery could not start'); } catch (_) { /* nothing */ } });
