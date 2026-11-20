// Olympus World page (cities/world/, night-worlds 2026-11-19). Owner: "all cities should be in one giant city, just different areas for
// like 1) Kalshi, 2) NQ etc." + "dozens and hundreds of cities constantly learning, not some 2000's looking play-doh" + "crazy effects".
// The page: a CSS poster at once, world.json (tools/world_build.py) + three.js streamed behind it, then the city flies in. Districts =
// the four doors; every app is a tower you tap to open; every learning place is real data. Live: the PC feed (../../pc_feed.js: a bot
// in a trade pulses), the Board's events, the edge light and the Lab's newest verdicts. Read only: GET only, nothing armed, no orders,
// text only through textContent, no browser storage. No WebGL (or 3D switched off): a plain list of the same city, never blank.
import * as C from './ow-core.js?v=w3';

const d = document, $ = (s) => d.querySelector(s);
const O = () => window.OLYMPUS || null;
const qs = new URLSearchParams(location.search);
const reduced = qs.get('motion') === '0' || (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const ROOT = '../../';
const S = { world: null, plan: null, scene: null, mode: 'loading', sel: -1, dist: null, feed: [], tick: -1, liveLines: [], live: {}, err: null, byId: new Map(),
  tour: false, history: false, t0: performance.now(), firstFrameMs: null, labelsAt: 0, labelKeys: [] };
const el = (tag, cls, text) => { const e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const DSHORT = { zeus: 'NQ', kalshi: 'Kalshi', money: 'Money', more: 'More' };

// ------------------------------------------------------------------------------------------------ boot
function fixSeal() {
  // the kit's corner seal links ../jarvis/ from the page: one level deeper here, so point it at the real Jarvis
  for (const a of d.querySelectorAll('a.oly-home')) if (a.getAttribute('href') === '../jarvis/') a.setAttribute('href', ROOT + 'jarvis/');
}
async function getJSON(u, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const tm = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(u, ac ? { signal: ac.signal } : undefined); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(tm); }
}
function webgl() {
  try { const c = d.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
async function boot() {
  fixSeal();
  setTimeout(fixSeal, 600);
  requestAnimationFrame(() => { try { if (O() && O().ready) O().ready(); } catch (e) { /* the veil lifts by itself */ } });   // the poster is the loading screen
  const w = await getJSON('world.json', 12000);
  if (!w || !Array.isArray(w.places) || !w.places.length) {
    S.mode = 'failed';
    $('#posterLine').textContent = 'The city map did not load. Pull down or reload to try again.';
    return;
  }
  S.world = w;
  w.places.forEach((p, i) => S.byId.set(p.id, i));
  header();
  const flat = qs.get('flat') === '1' || !webgl() || (O() && O().fx && O().fx() === 'off' && !qs.get('q'));
  if (flat) { renderFlat(); }
  else {
    try {
      S.plan = C.planWorld(w, { tier: O() && O().lite && O().lite() ? 'low' : 'high' });
      const M = await import('./ow-scene.js?v=w3');
      S.scene = M.createWorld({ canvas: $('#c'), world: w, plan: S.plan, reduced, sky: qs.get('sky') || 'auto', manual: qs.get('clock') === 'manual', tier: O() && O().lite && O().lite() ? 'low' : 'high',
        onTap, onFrame, onUser: () => { hideHint(); if (S.tour) setTour(false); }, onIntroDone: () => showHint() });
      S.mode = '3d';
      setTimeout(() => d.body.classList.add('live3d'), 6000);                 // the first frame normally lifts the poster (onFrame); never stuck on it
      if (reduced) showHint();
    } catch (e) {
      S.err = String(e && e.message || e);
      renderFlat();
    }
  }
  startTicker();
  live();
  setInterval(() => { if (!d.hidden) live(); }, 60000);
  deepLink();
}

// ------------------------------------------------------------------------------------------------ the top bar
function header() {
  const w = S.world, c = w.counts || {};
  $('#sub').textContent = `${(w.districts || []).length} districts · ${c.apps || 0} apps · ${c.learning || 0} places learning · ${Number(c.buildings || 0).toLocaleString('en-US')} tests`;
  const nav = $('#districts');
  nav.textContent = '';
  for (const dd of w.districts || []) {
    const b = el('button', 'dch'); b.type = 'button'; b.style.setProperty('--c', dd.hue); b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${dd.name}: ${dd.apps} apps, ${dd.n - dd.apps} places learning. Fly there`);
    b.dataset.d = dd.id;
    b.append(el('i'), el('span', '', DSHORT[dd.id] || dd.name));
    b.onclick = () => goDistrict(dd.id);
    nav.append(b);
  }
}
function pressDistrict(id) { for (const b of d.querySelectorAll('.dch')) b.setAttribute('aria-pressed', String(b.dataset.d === id)); }

// ------------------------------------------------------------------------------------------------ the card
const STATE_C = { live: '#ffc65a', app: '#ffd98a', bright: '#7ee08a', growing: '#62e8ff', testing: '#ffb347', planned: '#ffb347', ruin: '#ff7a5e', data: '#8fb4ff', paused: '#9aa3c0' };
function place(i) { return S.world.places[i]; }
function districtOf(id) { return (S.world.districts || []).find((x) => x.id === id) || null; }
function quarterName(p) { const dd = districtOf(p.district); const q = dd && (dd.quarters || []).find((x) => x.id === p.quarter); return q ? q.name : p.quarter; }
function openCard(title) {
  const card = $('#card');
  $('#cardName').textContent = title;
  $('#sheet').hidden = true;
  card.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
  card.scrollTop = 0;
  if (S.scene) S.scene.setFocus(0.21);
  return $('#cardBody');
}
function closeCard() {
  $('#card').hidden = true;
  if (S.scene) S.scene.setFocus(0);
  S.sel = -1;
  if (S.scene) S.scene.select(-1);
  if (location.hash) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* fine */ }
}
function openPlace(i, o) {
  const p = place(i);
  if (!p) return;
  S.sel = i;
  hideHint();
  const body = openCard(p.name);
  body.textContent = '';
  const dd = districtOf(p.district);
  const chips = el('div', 'chips');
  const st = p.district === 'kalshi' && p.kind !== 'app' && p.state !== 'ruin' ? 'paused' : p.state;
  const c1 = el('span', 'chip', C.STATE_WORD[st] || st); c1.style.setProperty('--c', STATE_C[st] || '#ffc65a');
  const c2 = el('span', 'chip ghost', `${dd ? DSHORT[dd.id] || dd.name : ''} › ${quarterName(p)}`);
  chips.append(c1, c2);
  body.append(chips, el('p', 'line', p.line || ''));
  const facts = (S.live.facts && S.live.facts[p.id]) || p.facts || [];
  if (facts.length) {
    const g = el('div', 'facts');
    for (const [k, v] of facts) { const c = el('div'); c.append(el('small', '', k), el('b', '', v)); g.append(c); }
    body.append(g);
  }
  if (p.why) body.append(el('p', 'how', 'Why: ' + p.why));
  const how = (S.world.hows || [])[p.how];
  if (how) body.append(el('p', 'how', how));
  const acts = el('div', 'acts');
  if (p.href) {
    const a = el('button', 'btn go', p.kind === 'app' ? 'Open ' + p.name : p.kind === 'decision' ? 'Answer on the Board' : 'Open');
    a.type = 'button'; a.onclick = () => go(p.href, i);
    acts.append(a);
  }
  const nx = el('button', 'btn', 'Next in ' + quarterName(p)); nx.type = 'button';
  nx.onclick = () => { const j = nextIn(i); if (j >= 0) flyPlace(j); };
  acts.append(nx);
  body.append(acts);
  if (S.scene) { S.scene.select(i); if (!o || o.fly !== false) flyPlace(i, true); }
  pressDistrict(p.district);
  try { history.replaceState(null, '', '#p=' + encodeURIComponent(p.id)); } catch (e) { /* fine */ }
  if (window.OLYMPUS_SFX && window.OLYMPUS_SFX.cue) try { window.OLYMPUS_SFX.cue('tap'); } catch (e) { /* no sound */ }
}
function flyPlace(i, already) {
  if (!S.scene) { if (!already) openPlace(i); return; }
  flash();
  S.scene.flyToPlace(i);
  if (!already) openPlace(i, { fly: false });
}
function nextIn(i) {
  const p = place(i), ps = S.world.places;
  const same = ps.map((x, k) => [x, k]).filter(([x]) => x.district === p.district && x.quarter === p.quarter);
  const at = same.findIndex(([, k]) => k === i);
  return same.length ? same[(at + 1) % same.length][1] : -1;
}
function districtCard(id) {
  const dd = districtOf(id);
  if (!dd) return;
  S.sel = -1;
  if (S.scene) S.scene.select(-1);
  const body = openCard(dd.name);
  body.textContent = '';
  body.append(el('p', 'line', dd.line));
  const ps = S.world.places.map((p, i) => [p, i]).filter(([p]) => p.district === id);
  const learning = ps.filter(([p]) => p.kind !== 'app');
  const g = el('div', 'facts');
  const fact = (k, v) => { const c = el('div'); c.append(el('small', '', k), el('b', '', v)); g.append(c); };
  fact('Apps here', String(dd.apps));
  fact('Places learning', String(learning.length));
  fact('Working', String(learning.filter(([p]) => ['bright', 'growing', 'live'].includes(p.state)).length));
  fact('Ruins (rejected)', String(learning.filter(([p]) => p.state === 'ruin').length));
  body.append(g, el('h3', '', 'Apps: tap to fly there'));
  const list = el('div', 'applist');
  for (const [p, i] of ps.filter(([x]) => x.kind === 'app')) {
    const b = el('button'); b.type = 'button'; b.style.setProperty('--c', p.hue);
    b.append(el('b', '', p.glyph || p.name.slice(0, 1)), el('span', '', p.name));
    b.setAttribute('aria-label', p.name + ': fly there');
    b.onclick = () => flyPlace(i);
    list.append(b);
  }
  body.append(list);
  const qq = (dd.quarters || []).filter((q) => q.id !== 'apps');
  if (qq.length) {
    body.append(el('h3', '', 'Quarters that learn'));
    const ql = el('div', 'applist');
    for (const q of qq) {
      const b = el('button'); b.type = 'button'; b.style.setProperty('--c', dd.hue);
      b.append(el('b', '', String(q.n)), el('span', '', q.name));
      b.onclick = () => { const first = S.world.places.findIndex((p) => p.district === id && p.quarter === q.id); if (first >= 0) flyPlace(first); };
      ql.append(b);
    }
    body.append(ql);
  }
}
function goDistrict(id) {
  S.dist = id;
  pressDistrict(id);
  if (S.scene) { flash(); S.scene.flyToDistrict(districtOf(id)); }
  else { const sec = d.querySelector(`#flat [data-d="${id}"]`); if (sec) sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); }
  districtCard(id);
}
/** leave for an app: the shared warp (olympus/warp.js, when the page has it) or our own dive into the tower */
function go(href, i) {
  const url = ROOT + href;
  const W = window.OLYMPUS_WARP;
  if (W && typeof W.go === 'function') { try { W.go(url, { from: 'world', c: i >= 0 ? place(i).hue : null }); return; } catch (e) { /* our own */ } }
  if (!S.scene || reduced) { location.href = url; return; }
  const p = S.plan.places[i] || null;
  flash();
  if (p) S.scene.flyTo({ tx: p.x, ty: p.top * 0.6, tz: p.z, dist: 7, yaw: S.scene.pose().yaw, pitch: 0.18 }, { warp: true, ms: 650, lift: -0.2 });
  setTimeout(() => { location.href = url; }, 620);
}
function flash() {
  if (reduced) return;
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  if (window.OLYMPUS_SFX && window.OLYMPUS_SFX.cue) try { window.OLYMPUS_SFX.cue('whoosh'); } catch (e) { /* no sound */ }
}

// ------------------------------------------------------------------------------------------------ taps, labels
function onTap(x, y) {
  if (!S.scene) return;
  const i = C.pick(S.scene.candidates(), x, y);
  if (i >= 0) openPlace(i);
  else if (!$('#card').hidden) closeCard();
}
const LABELS = [];
function labelPool() {
  if (LABELS.length) return LABELS;
  const host = $('#labels');
  for (let k = 0; k < 18; k++) { const e = el('i'); host.append(e); LABELS.push(e); }
  return LABELS;
}
function onFrame() {
  if (!S.scene) return;
  if (S.firstFrameMs == null) { S.firstFrameMs = Math.round(performance.now() - S.t0); d.body.classList.add('live3d'); }
  const now = performance.now();
  if (now - S.labelsAt > 240) { S.labelsAt = now; chooseLabelSet(); }
  placeLabels();
}
function chooseLabelSet() {
  const sc = S.scene, w = S.world, pose = sc.pose(), R = w.R || 130;
  const W = innerWidth, H = innerHeight, cands = [];
  const add = (key, x, y, z, text, cls, c) => {
    const q = sc.project(x, y, z);
    if (!q.front) return;
    cands.push({ key, sx: q.sx, sy: q.sy, w: text.length * (cls === 'dist' ? 10.5 : 7) + 22, h: cls === 'dist' ? 28 : 22, text, cls, c, x, y, z });
  };
  const ps = S.plan.places;
  if (S.sel >= 0) { const p = ps[S.sel]; add('p' + S.sel, p.x, p.top + 2, p.z, p.name, 'sel', p.raw.hue); }
  if (pose.dist > R * 1.5) {
    for (const dd of w.districts || []) add('d' + dd.id, dd.x, 30, dd.z, dd.name, 'dist', dd.hue);
    add('gate', 0, 52, 0, 'Home · the Gate', 'q', '#ffd890');
  } else {
    const near = (p) => Math.hypot(p.x - pose.tx, p.z - pose.tz);
    const rank = (p) => (p.kind === 'bot' ? 0 : p.raw.href === 'hub/zeus.html' ? 0.5 : p.kind === 'account' ? 1 : p.kind === 'app' ? (p.raw.shortcut ? 2 : 3) : 5) + near(p) / (pose.dist * 0.9);
    const list = ps.filter((p) => near(p) < pose.dist * 1.25 && (pose.dist < 70 || p.kind !== 'research' || p.state === 'bright')).sort((a, b) => rank(a) - rank(b)).slice(0, 60);
    for (const p of list) add('p' + p.i, p.x, p.top + 1.5, p.z, p.name, p.kind === 'app' ? 'app' : '', p.raw.hue);
    if (pose.dist > 55) for (const dd of w.districts || []) for (const q of dd.quarters || []) if (q.id !== 'apps') add('q' + dd.id + q.id, q.x, 6, q.z, q.name, 'q', dd.hue);
  }
  const hb = $('#top').getBoundingClientRect().bottom;                       // never under the glass top bar
  const keep = C.chooseLabels(cands, 16, W, H, hb + 4);
  S.labelKeys = keep.map((k) => cands.find((c) => c.key === k));
}
function placeLabels() {
  const pool = labelPool(), sc = S.scene;
  for (let k = 0; k < pool.length; k++) {
    const e = pool[k], c = S.labelKeys[k];
    if (!c) { if (e.style.display !== 'none') e.style.display = 'none'; continue; }
    const q = sc.project(c.x, c.y, c.z);
    if (!q.front) { e.style.display = 'none'; continue; }
    if (e.dataset.key !== c.key) {
      e.dataset.key = c.key; e.className = c.cls || ''; e.textContent = ''; e.style.setProperty('--c', c.c || '#ffc65a');
      if (c.cls === 'app') { const p = S.plan.places[+c.key.slice(1)]; if (p && p.raw.glyph) e.append(el('b', '', p.raw.glyph)); }
      e.append(d.createTextNode(c.text));
    }
    e.style.display = 'block';
    e.style.transform = `translate3d(${Math.round(q.sx)}px,${Math.round(q.sy)}px,0) translate(-50%,-100%)`;
  }
}

// ------------------------------------------------------------------------------------------------ the dock: city, find, tour, story, key
function sheet(title) {
  $('#card').hidden = true;
  const s = $('#sheet');
  $('#sheetName').textContent = title;
  s.hidden = false; s.classList.remove('in'); void s.offsetWidth; s.classList.add('in');
  if (S.scene) S.scene.setFocus(0.18);
  const b = $('#sheetBody'); b.textContent = ''; return b;
}
function findSheet() {
  const b = sheet('Find an app or a place');
  const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Kalshi, payout, Zlarior, taxes…'; inp.setAttribute('aria-label', 'Search the city');
  const ul = el('ul', 'res');
  const draw = () => {
    ul.textContent = '';
    const q = inp.value.trim();
    const hits = q ? C.search(S.world.places.map((p, i) => ({ raw: p, i })), q).slice(0, 30)
      : S.world.places.map((p, i) => ({ raw: p, i })).filter((x) => x.raw.kind === 'app' && x.raw.shortcut);
    if (!hits.length) { ul.append(el('li', '', 'Nothing with those words. Try a shorter word.')); return; }
    for (const h of hits) {
      const li = el('li'); li.style.setProperty('--c', h.raw.hue); li.tabIndex = 0; li.setAttribute('role', 'button');
      const sp = el('span', '', h.raw.name); sp.append(el('small', '', `${DSHORT[h.raw.district] || h.raw.district} › ${quarterName(h.raw)}`));
      li.append(el('b'), sp);
      li.onclick = () => { $('#sheet').hidden = true; flyPlace(h.i); };
      ul.append(li);
    }
  };
  inp.oninput = draw;
  b.append(inp, ul);
  draw();
  setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) { /* fine */ } }, 50);
}
function keySheet() {
  const b = sheet('How to read the city');
  const w = S.world, c = w.counts || {};
  b.append(el('p', 'line', w.about || ''));
  const ul = el('ul', 'key');
  const sw = { 'Gold crown': '#ffc65a', 'Bright tower': '#7ee08a', Scaffold: '#ffb347', Ruin: '#ff6b4a', Vault: '#ffd27a' };
  for (const [k, v] of w.legend || []) { const li = el('li'); const i = el('i'); i.style.setProperty('--k', sw[k] || '#888'); li.append(i, el('b', '', k), el('span', '', v)); ul.append(li); }
  b.append(ul);
  const g = el('div', 'facts'); g.style.marginTop = '10px';
  const fact = (k, v) => { const x = el('div'); x.append(el('small', '', k), el('b', '', v)); g.append(x); };
  fact('Places', String(c.places || 0)); fact('Apps', String(c.apps || 0)); fact('Tests as buildings', Number(c.buildings || 0).toLocaleString('en-US'));
  fact('Ruins', Number(c.ruin || 0).toLocaleString('en-US')); fact('Learning since', C.dateText(w.start) || '-'); fact('Map built', String(w.built || '').replace('T', ' ').replace('Z', ' UTC'));
  b.append(g);
}
function cityCard() {
  const w = S.world;
  if (S.scene) { flash(); S.scene.home(); }
  pressDistrict(null);
  const body = openCard('Olympus: one city');
  body.textContent = '';
  body.append(el('p', 'line', 'Four districts round the plaza, one per door. Downtown towers are the apps; out from them the city grows with every idea tested.'));
  const list = el('div', 'applist');
  for (const dd of w.districts || []) {
    const b = el('button'); b.type = 'button'; b.style.setProperty('--c', dd.hue);
    b.append(el('b', '', String(dd.apps)), el('span', '', `${dd.name}`));
    b.onclick = () => goDistrict(dd.id);
    list.append(b);
  }
  body.append(list);
}
function setTour(on) {
  S.tour = on;
  $('[data-act=tour]').setAttribute('aria-pressed', String(on));
  if (!S.scene) return;
  if (!on) { S.scene.stopTour(); return; }
  const ids = ['app:hub-zeus-html', 'bot:lit', 'bot:atlas', 'acct:zlarior', 'acct:atlas', 'app:nq', 'app:business-mffu-html'];
  const w = S.world;
  const lab = w.places.findIndex((p) => p.quarter === 'lab');
  const stops = ids.map((id) => S.byId.get(id)).filter((i) => i != null);
  if (lab >= 0) stops.push(lab);
  for (const q of ['lit', 'kbets', 'k8', 'datacity', 'decisions']) { const k = w.places.findIndex((p) => p.quarter === q && ['bright', 'growing', 'live'].includes(p.state)); if (k >= 0) stops.push(k); }
  S.scene.startTour(stops, (i) => { if (i == null) { S.tour = false; $('[data-act=tour]').setAttribute('aria-pressed', 'false'); return; } openPlace(i); });
}
function setHistory(on) {
  if (!S.scene) return;
  const btn = $('[data-act=history]'), when = $('#when');
  if (!on) { S.scene.stopHistory(); return; }
  S.history = true; btn.setAttribute('aria-pressed', 'true');
  closeCard(); when.hidden = false;
  const w = S.world;
  S.scene.startHistory((day) => {
    const shown = Math.floor(day);
    let n = 0;
    for (const p of w.places) if ((p.day || 0) <= shown) n++;
    when.textContent = `${C.dateText(C.addDays(w.start, shown))} · ${n} places`;
  }, () => { S.history = false; btn.setAttribute('aria-pressed', 'false'); setTimeout(() => { when.hidden = true; }, 1600); });
}
function dock() {
  for (const b of d.querySelectorAll('.dk')) b.onclick = () => {
    const a = b.dataset.act;
    if (S.mode !== '3d' && a !== 'find' && a !== 'key') { if (a === 'home') renderFlat(); return; }
    if (a === 'home') cityCard();
    else if (a === 'find') findSheet();
    else if (a === 'key') keySheet();
    else if (a === 'tour') setTour(!S.tour);
    else if (a === 'history') setHistory(!S.history);
  };
  $('#cardX').onclick = () => closeCard();
  $('#sheetX').onclick = () => { $('#sheet').hidden = true; if (S.scene) S.scene.setFocus(0); };
  const tk = $('#ticker');
  const goTick = () => { const l = S.feed[S.tick]; if (l && l.id != null && S.byId.has(l.id)) flyPlace(S.byId.get(l.id)); };
  tk.onclick = goTick;
  tk.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTick(); } };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCard(); $('#sheet').hidden = true; } });
}
let hintT = 0;
function showHint() { const h = $('#hint'); if (S.sel >= 0 || !$('#card').hidden) return; S.hinted = true; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(hideHint, 6000); }
function hideHint() { $('#hint').hidden = true; }

// ------------------------------------------------------------------------------------------------ the ticker: what the city is learning
function startTicker() {
  S.feed = C.feedLines(S.world, S.liveLines);
  const next = () => {
    if (!S.feed.length) return;
    S.tick = (S.tick + 1) % Math.min(S.feed.length, 30);
    const l = S.feed[S.tick];
    const t = $('#tickText');
    t.textContent = l.text; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    if (S.scene && S.scene.setDisplay) S.scene.setDisplay(0, l.text);         // the Gate's LED band shows the same line (revamp-cities)
    const i = l.id != null ? S.byId.get(l.id) : null;
    if (S.scene && i != null && !S.history && S.sel < 0 && qs.get('clock') !== 'manual') S.scene.burst(i, { dur: 1.8 });
  };
  next();
  setInterval(() => { if (!d.hidden) next(); }, 5200);
}

// ------------------------------------------------------------------------------------------------ live: the PC, the Board, the edge light, the Lab
function loadScript(src) {
  return new Promise((ok) => { const s = d.createElement('script'); s.src = src; s.async = true; const t = setTimeout(ok, 8000); s.onload = s.onerror = () => { clearTimeout(t); ok(); }; d.head.append(s); });
}
let feedP = null;
async function live() {
  const now = Date.now() / 1000;
  if (!window.PC_FEED && !feedP) feedP = loadScript(ROOT + 'pc_feed.js?v=n3');
  const [lite, board, edge, lab] = await Promise.all([
    (feedP || Promise.resolve()).then(() => (window.PC_FEED ? Promise.race([window.PC_FEED.fetchLatest({ feedUrl: ROOT + 'status_feed.json' }), new Promise((r) => setTimeout(() => r(null), 9000))]) : null)).catch(() => null),
    getJSON(ROOT + 'board/board.json', 8000), getJSON(ROOT + 'edge.json', 8000), getJSON(ROOT + 'business/lab.json', 8000)]);
  S.live = { ...S.live, lite, board, edge, lab, t: now };
  // the PC
  const pcl = C.pcLine(lite || (board && board.pc && board.pc.t ? { t: board.pc.t } : null), now);
  const pc = $('#pc');
  pc.className = 'pc ' + (lite ? (pcl.silent ? 'bad' : 'ok') : '');
  $('#pcText').textContent = lite ? pcl.text : board && board.pc && board.pc.t ? 'Board · ' + C.ago(now - board.pc.t) : 'PC: not live here';
  // the bots in a trade
  const pos = C.positions(lite);
  const chip = $('#liveChip'), parts = [];
  for (const [k, name] of [['lit', 'Zlarior'], ['atlas', 'ATLAS']]) {
    const i = S.byId.get('bot:' + k);
    if (i == null) continue;
    const on = !!pos[k];
    if (S.scene) { if (on && !(S.live.trading || {})[k]) S.scene.burst(i, { dur: 2.2 }); S.scene.setTrading(i, on); }
    if (on) parts.push(`${name} is in a trade · ${pos[k].side}`);
  }
  S.live.trading = { lit: !!pos.lit, atlas: !!pos.atlas };
  // the LED bands round ZEUS, the Kalshi bot and Business: the live line, else what each district holds (text only, never markup)
  if (S.scene && S.scene.setDisplay) {
    const dist = (id) => (S.world.districts || []).find((x) => x.id === id) || {};
    const learn = (id) => (S.world.places || []).filter((p) => p.district === id && p.kind !== 'app').length;
    S.scene.setDisplay(1, parts.length ? parts.join(' · ') : 'ZEUS · NQ · ' + $('#pcText').textContent);
    S.scene.setDisplay(2, 'KALSHI · ' + (dist('kalshi').apps || 0) + ' apps · ' + learn('kalshi') + ' places learning');
    S.scene.setDisplay(3, 'MONEY · ' + (dist('money').apps || 0) + ' apps · ' + learn('money') + ' places learning');
  }
  chip.textContent = parts.join(' · ');
  chip.classList.toggle('on', parts.length > 0);
  // the edge light dims a bot whose light is not green
  const eb = edge && edge.bots ? edge.bots : {};
  for (const k of ['lit', 'atlas']) {
    const i = S.byId.get('bot:' + k), e = eb[k];
    if (i == null || !e || !S.scene || pos[k]) continue;
    S.scene.setLight(i, e.light === 'RED' ? 0.7 : e.light === 'AMBER' ? 0.95 : 1.15);
  }
  // the Board: fresh account numbers on the cards, its newest events in the ticker
  const facts = {};
  for (const a of (board && Array.isArray(board.accounts) ? board.accounts : [])) {
    const id = 'acct:' + a.key, i = S.byId.get(id);
    if (i == null || typeof a.balance !== 'number') continue;
    const f = [['Balance', C.usd(a.balance)]];
    if (a.stage === 'funded') { const p = place(i).facts.find((x) => x[0] === 'Payout ask at'); if (p) f.push(p); }
    else if (typeof a.to_pass === 'number') f.push(['To pass', C.usd(a.to_pass)]);
    if (typeof a.room === 'number') f.push(['Room above the floor', C.usd(a.room)]);
    f.push(['From', (a.src || 'the Board') + (a.src_t ? ' · ' + C.ago(now - a.src_t) : '')]);
    facts[id] = f;
  }
  S.live.facts = facts;
  S.liveLines = C.boardLines(board, S.world.places);
  // the Lab's newest verdicts on places already in the city
  if (lab && S.world && String(lab.built || '') > String(S.world.built || '').replace('T', ' ')) {
    for (const ch of C.labChanges(lab, S.world)) { const i = S.byId.get(ch.id); if (i != null) { place(i).state = ch.state; if (S.scene) S.scene.burst(i); } }
  }
  const before = S.feed.length;
  S.feed = C.feedLines(S.world, S.liveLines);
  if (S.feed.length !== before && S.tick >= S.feed.length) S.tick = -1;
}

// ------------------------------------------------------------------------------------------------ no WebGL: the same city as a list
function renderFlat() {
  S.mode = '2d';
  d.body.classList.remove('live3d');
  const m = $('#flat');
  m.hidden = false; m.textContent = '';
  const w = S.world;
  for (const dd of w.districts || []) {
    const sec = el('section'); sec.dataset.d = dd.id; sec.style.setProperty('--c', dd.hue);
    sec.append(el('h2', '', dd.name), el('p', '', dd.line));
    const list = el('div', 'applist');
    w.places.forEach((p, i) => {
      if (p.district !== dd.id || p.kind !== 'app') return;
      const a = el('a'); a.href = ROOT + p.href;
      const b = el('button'); b.type = 'button'; b.tabIndex = -1; b.style.setProperty('--c', p.hue);
      b.append(el('b', '', p.glyph || p.name.slice(0, 1)), el('span', '', p.name));
      a.append(b); list.append(a);
    });
    sec.append(list);
    for (const q of dd.quarters || []) {
      if (q.id === 'apps') continue;
      const ps = w.places.filter((p) => p.district === dd.id && p.quarter === q.id);
      const ruins = ps.filter((p) => p.state === 'ruin').length, ok = ps.filter((p) => ['bright', 'growing', 'live'].includes(p.state)).length;
      sec.append(el('p', '', `${q.name}: ${ps.length} places · ${ok} working · ${ruins} rejected`));
    }
    m.append(sec);
  }
  if (S.err) m.append(el('p', 'how', '3D could not start here (' + S.err.slice(0, 80) + '): this is the same city as a list.'));
}

function deepLink() {
  const h = decodeURIComponent(location.hash || '');
  const mp = /#p=(.+)$/.exec(h), md = /#d=(\w+)/.exec(h);
  const later = (fn) => setTimeout(fn, S.scene && !reduced ? 400 : 0);
  if (mp && S.byId.has(mp[1])) later(() => { if (S.scene) S.scene.skipIntro(); openPlace(S.byId.get(mp[1])); });
  else if (md && districtOf(md[1])) later(() => { if (S.scene) S.scene.skipIntro(); goDistrict(md[1]); });
}

// ------------------------------------------------------------------------------------------------ the test / Jarvis hook
window.OWORLD = {
  ready: () => (S.mode === '3d' ? !!S.scene && (S.scene.state().frames > 2 || qs.get('clock') === 'manual') : S.mode === '2d' || S.mode === 'failed'),
  state: () => {
    const w = S.world || {}, c = w.counts || {};
    return { mode: S.mode, places: (w.places || []).length, apps: c.apps || 0, learning: c.learning || 0, buildings: c.buildings || 0, districts: (w.districts || []).length,
      selected: S.sel >= 0 ? w.places[S.sel].id : null, card: !$('#card').hidden, cardTitle: $('#cardName').textContent, firstFrameMs: S.firstFrameMs, err: S.err,
      labels: S.labelKeys.length, hinted: !!S.hinted, ticker: $('#tickText').textContent, pc: $('#pcText').textContent, ...(S.scene ? { scene: S.scene.state() } : {}) };
  },
  screenOf: (id) => {
    const i = S.byId.get(id);
    if (i == null || !S.scene) return null;
    const p = S.plan.places[i], q = S.scene.project(p.x, p.top * 0.55, p.z);
    return { x: q.sx, y: q.sy, front: q.front };
  },
  open: (id) => { const i = S.byId.get(id); if (i != null) openPlace(i); return i != null; },
  district: (id) => goDistrict(id),
  skip: () => { if (S.scene) S.scene.skipIntro(); },
  step: (ms, noDraw) => (S.scene ? S.scene.step(ms, noDraw) : false),
  focus: (f) => (S.scene ? S.scene.setFocus(f, true) : null),
  pose: (p) => (S.scene ? (p ? S.scene.setPose(p) : S.scene.pose()) : null),
  world: () => S.world,
  three: () => (S.scene ? S.scene.scene : null),       // the THREE.Scene (tests, debugging)
};
dock();
if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
