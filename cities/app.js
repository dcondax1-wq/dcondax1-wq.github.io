// OLYMPUS Cities: the world map of floating city islands and every city inside it. This file is the page's controller; the
// engine is data-driven (cities.json = the list of city specs, datasets.js = the adapters, generator.js = the generic builder,
// scene.js = the three.js world on the OLYMPUS render core). Adding a city is one entry in cities.json.
//
//   hub    drag to look, pinch to zoom, two fingers to move, tap an island for its card, Enter to land. Tour flies past them all.
//   city   tap a building for its card, Find (search), Top 10, Surprise me, ORBIT / SKIM / DRONE / GRAND cameras, the minimap.
// Read-only: every number is data the site already publishes; nothing here writes, trades or sends anything.
import { $, el, store, clamp, lerp, hash32, rng, cityOfDay, todayStr, seedOfDay, fmtField, plain } from './util.js';
import { DATASETS, loadDataset, fieldMap } from './datasets.js?v=atlas2';
import { generate, validateSpec, Picker, evalExpr, parseExpr } from './generator.js';
import { mountWorld } from './world.js?v=w3';
import { cityRoutes } from './routes.js?v=r3';
import { cityResultPage, planCityNetwork } from './network-layout.js?v=n1';
import { openDistrictWorld } from './district-world.js?v=d3';
import { insight } from './insight.js';
import { randomSpec, seedDataset, newSeed, cleanSeed } from './procedural.js';
import { AgoraMap } from './agoramap.js?v=g5';
// Do not load/compile the 3D pipeline until this device has a usable context.
let Stage, TIERS, BUDGETS, Rig, makePath, safeFlight, warmHex = (h) => h;

const GROUPS = { trading: ['Trading', '#4b7a99'], research: ['Research', '#c9a06a'], money: ['Money', '#ff9f43'], kalshi: ['Kalshi', '#ff6b9a'], life: ['Life', '#7f8a52'], obsidian: ['Obsidian', '#7fa6bd'] };
const GROUP_ORDER = Object.keys(GROUPS);
const ICON = {
  tour: 'M7 4l13 8-13 8z', find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5', surprise: 'M12 2l2.6 6.3L21 9l-5 4.4L17.5 20 12 16.7 6.5 20 8 13.4 3 9l6.4-.7z',
  today: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', top: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  hub: 'M12 3l9 5v8l-9 5-9-5V8zM12 12l9-4M12 12v9M12 12L3 8', dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
  report: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
};
const S = { specs: [], byId: new Map(), fixture: {}, islands: [], hubSel: -1, mode: 'hub', cur: null, busy: false, live: [], real: new Map(), fxDs: new Map(), sumCache: new WeakMap(),
  sheet: null, tour: false, cam: 'orbit', hubPose: null, demo: false, ready: false, errors: [], randoms: new Map(), conts: [], photo: false, insights: new Map(), hubR: 600 };
const loadSet = (k) => { try { return new Set(JSON.parse(store.get(k, '[]'))); } catch (e) { return new Set(); } };
S.favs = loadSet('cities.fav'); S.visited = loadSet('cities.visited');
const saveSet = (k, set) => store.set(k, JSON.stringify([...set].slice(-400)));
const specOf = (id) => S.byId.get(id) || S.randoms.get(id);
const q = new URLSearchParams(location.search);
S.demo = q.get('demo') === '1';
S.night = q.get('night') === '0' ? false : q.get('night') === '1' || store.get('cities.night', '1') === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const O = () => window.OLYMPUS || null;
const sfx = (n) => { try { if (window.OLYMPUS_SFX && !O().reduced()) window.OLYMPUS_SFX.play(n); } catch (e) { /* silent */ } };
const reduced = () => { try { return !!(O() && O().reduced()); } catch (e) { return false; } };

// ------------------------------------------------------------------ data
const getJson = async (url, ms = 14000) => {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
};
const env = {
  get: (url) => (S.demo ? Promise.reject(new Error('demo')) : getJson(url)),
  fixture: {},
  vault: async () => { try { const m = await import('../jarvis/obsidian.js'); return await m.graphSnapshot(); } catch (e) { return null; } },
};
const fxEnv = { get: () => Promise.reject(new Error('sample')), fixture: {} };
const fxCache = new Map(), realCache = new Map();

/** the sample dataset (instant: it ships with the page) */
const sampleDs = (id) => loadDataset(id, fxEnv, fxCache);
/** the real dataset (cached; falls back to the sample when the file does not answer) */
const realDs = async (id) => { const ds = await loadDataset(id, env, realCache); if (!ds.demo) S.real.set(id, ds); return ds; };
const dsNow = (id) => S.real.get(id) || S.fxDs.get(id);

const summary = (spec, ds) => {
  let m = S.sumCache.get(ds);
  if (m && m[spec.id]) return m[spec.id];
  const T = evalExpr(spec.height_by, ds.items), f = parseExpr(spec.district_by).field, d = new Set(ds.items.map((it) => it.f[f]));
  let best = 0;
  for (let i = 1; i < T.length; i++) if (T[i] > T[best]) best = i;
  const hp = parseExpr(spec.height_by.replace(/^-/, '')).field, it = ds.items[best];
  const out = { n: ds.items.length, districts: d.size, top: it ? ds.label(it) : '–', topVal: it ? fmtField(fieldMap(ds)[hp], it.f[hp]) : '–' };
  if (!m) S.sumCache.set(ds, (m = {}));
  m[spec.id] = out;
  return out;
};

// ------------------------------------------------------------------ small UI helpers
const sheet = $('#sheet'), sheetBody = $('#sheetBody'), chips = $('#chips'), dock = $('#dock'), tagEl = $('#tag'), toastEl = $('#toast'), capEl = $('#caption'), canvas = $('#c');
let toastT = 0, capT = 0;
const toast = (msg, ms = 3200) => { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); };
const caption = (small, text, ms = 4200) => { capEl.replaceChildren(el('small', null, small), document.createTextNode(text)); capEl.classList.add('on'); clearTimeout(capT); capT = setTimeout(() => capEl.classList.remove('on'), ms); };
const clearCaption = () => { clearTimeout(capT); capEl.classList.remove('on'); };
const svg = (path) => { const n = 'http://www.w3.org/2000/svg', s = document.createElementNS(n, 'svg'), p = document.createElementNS(n, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); p.setAttribute('d', path); s.appendChild(p); return s; };
const SHORT = { 'Surprise me': 'Wow', 'World map': 'World', 'Random city': 'Dice' };
const tab = (id, label, icon, fn) => { const b = el('button', 'tab'); b.id = id; b.setAttribute('aria-label', label); b.append(svg(icon), document.createTextNode(SHORT[label] || label)); b.addEventListener('click', fn); return b; };
const grid = (rows) => { const g = el('div', 'grid4'); for (const [k, v] of rows) { const d = el('div'); d.append(el('small', null, k), el('b', null, v)); g.append(d); } return g; };
const closeSheet = () => { $('#atlas').classList.remove('behind'); sheet.classList.remove('on'); const was = S.sheet; S.sheet = null; document.querySelectorAll('.tab').forEach((t) => t.classList.remove('on')); if (S.mode === 'city' && was === 'building') { S.stage.setSelected(-1); tagEl.style.display = 'none'; S.cur.sel = -1; } if (S.mode === 'hub' && was === 'find') hubFilter(null);
  if (S.map) S.map.setLift(false);
  if (S.mode === 'city' && S.cur && S.cur.match) { S.stage.setDim(null); S.cur.match = null; } };
function openSheet(view, title, build) {
  $('#atlas').classList.add('behind'); sheet.dataset.view = view; $('#sheetTitle').textContent = title; sheetBody.replaceChildren(); build(sheetBody); sheet.classList.add('on'); sheet.scrollTop = 0; S.sheet = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
}
$('#sheetX').addEventListener('click', closeSheet);
const setChips = (list) => {
  chips.replaceChildren();
  for (const c of list) {
    const e = el(c.fn ? 'button' : 'span', 'chip' + (c.cls ? ' ' + c.cls : ''));
    if (c.b) { e.append(document.createTextNode(c.label + ' '), el('b', null, c.b)); } else e.textContent = c.label;
    if (c.fn) e.addEventListener('click', c.fn);
    chips.append(e);
  }
};

// ------------------------------------------------------------------ the hub
const hubSlots = () => clamp(Math.floor(S.stage.caps().mini / Math.max(1, S.specs.length)), 8, 260);

/** One actual NQ trading city anchors a single metro; six neighborhoods radiate from the capital. */
function layoutIslands() {
  const network = planCityNetwork(S.specs, GROUPS);
  S.conts = network.districts;
  S.hqIndex = network.hqIndex;
  S.hqGroup = network.hqGroup;
  S.hubR = network.radius;
  return network.islands;
}

function buildHub() {
  S.islands = layoutIslands();
  S.slots = 0;
  ensureMap();
  S.islands.forEach((isl) => miniOf(isl));
}
/** The Cities front screen is the AGORA map (2D, no WebGL): the 3D stage only runs inside a city. */
function ensureMap() {
  const cities = S.islands.map((s) => ({ i: s.i, id: s.spec.id, name: s.spec.name, cont: s.cont, hq: !!s.hq, capital: !!s.capital, region: s.spec.region || '' }));
  const districts = S.conts.map((c) => ({ key: c.key, name: c.name, count: c.count }));
  if (!S.map) {
    const lowQ = () => { const f = q.get('q') || (O() && O().fx ? O().fx() : 'high'); return f === 'low' || f === 'off' ? 'low' : 'high'; };
    S.map = new AgoraMap($('#amap'), { quality: lowQ(), reduced: reduced(), onTap: (r) => { if (S.tour) stopTour(); onMapPick(r); }, onMove: () => { if (S.tour) stopTour(); hideHint(); }, onFrame: (dt) => { if (S.tour) tourTick(dt); } });
    O()?.onFx?.((lv) => S.map && S.map.setQuality(lv));
    window.addEventListener('resize', () => S.map && S.map.resize());
  }
  S.map.setData(cities, districts);
  S.map.dayId = cityOfDay(todayStr(), S.specs.map((x) => x.id));
  S.map.setSeen(S.visited, S.favs);
}
function miniOf(isl) {
  const ds = dsNow(isl.spec.dataset);
  if (!ds || !ds.items.length) return;
  isl.n = ds.items.length;
  if (S.map) S.map.setLive(isl.i, !ds.demo, isl.n);
}
const hideHint = () => { const h = $('#maphint'); if (h) h.classList.add('off'); };
function onMapPick(r) {
  if (S.busy || S.mode !== 'hub') return;
  hideHint();
  if (r.kind === 'city') { selectIsland(r.i); return; }
  if (r.kind === 'district') { const c = S.conts.find((k) => k.key === r.key); if (c) flyToContinent(c); return; }
  closeSheet(); S.hubSel = -1; S.map.select(-1); S.map.setLift(false); refreshChips();
}

async function prefetch() {
  if (S.demo) return;
  const ids = [...new Set(S.specs.map((s) => s.dataset))].filter((id) => !DATASETS[id].remote && !DATASETS[id].vault);
  const rank = (id) => (DATASETS[id].heavy ? 2 : DATASETS[id].from ? 1 : 0);
  ids.sort((a, b) => rank(a) - rank(b));
  for (const id of ids) {
    await sleep(60);
    if (document.body.dataset.ready === 'fallback') return;
    const ds = await realDs(id);
    if (document.body.dataset.ready === 'fallback') return;
    if (ds.demo) continue;
    let n = 0;
    for (const isl of S.islands) {
      if (isl.spec.dataset !== id) continue;
      miniOf(isl); S.live[isl.i] = true;
      if (++n % 3 === 0) await sleep(10);           // many cities on one big file: never hold the page for long
    }
    refreshChips();
    if (S.hubSel >= 0 && S.sheet === 'island' && S.islands[S.hubSel].spec.dataset === id) showIsland(S.hubSel);
  }
}

function dataTag(ds) { return ds.historical ? (ds.items.length ? ['BACKTEST', 'demo'] : ['NO SOURCE ROWS', 'demo']) : ds.demo ? ['SAMPLE', 'demo'] : ['LIVE DATA', 'live']; }

const insightOf = (spec, ds) => {
  const key = spec.id + '|' + (ds.demo ? 's' : 'l') + ds.items.length;
  let v = S.insights.get(key);
  if (!v) { const c = generate(spec, ds, { cap: 4000 }); v = insight(spec, ds, c); S.insights.set(key, v); }
  return v;
};
const isFav = (id) => S.favs.has(id), isSeen = (id) => S.visited.has(id);
function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
  saveSet('cities.fav', S.favs);
  if (S.mode === 'hub') refreshChips();
  return S.favs.has(id);
}
function markVisited(id) { if (!S.visited.has(id)) { S.visited.add(id); saveSet('cities.visited', S.visited); } }

function cityActions(spec, extra) {
  const a = el('div', 'actions');
  const fav = el('button', 'pill' + (isFav(spec.id) ? ' on' : ''), isFav(spec.id) ? '\u2605 Saved' : '\u2606 Save');
  fav.addEventListener('click', () => { const on = toggleFav(spec.id); fav.classList.toggle('on', on); fav.textContent = on ? '\u2605 Saved' : '\u2606 Save'; });
  const cmp = el('button', 'pill', 'Compare');
  cmp.addEventListener('click', () => openCompare(spec.id));
  const sh = el('button', 'pill', 'Share');
  sh.addEventListener('click', () => shareCity(spec));
  a.append(...(extra || []), fav, cmp, sh);
  return a;
}

async function openNestedCity(id) {
  const resolveCity = async (key) => {
    const spec=specOf(key);if(!spec)return null;
    // Only already-normalized published data or the shipped sample. No private-vault lookup.
    const dataset=dsNow(spec.dataset)||await sampleDs(spec.dataset);
    return {spec,dataset};
  };
  const got=await resolveCity(id);if(got)openDistrictWorld({...got,cities:S.specs,resolveCity});
}

function showIsland(i) {
  const isl = S.islands[i], spec = isl.spec, ds = dsNow(spec.dataset);
  if (!ds) return;
  const sm = summary(spec, ds), [tag, cls] = dataTag(ds);
  openSheet('island', spec.name, (b) => {
    const gp = GROUPS[spec.group];
    const tags = el('div');
    tags.append(el('span', 'badge ' + cls, tag), el('span', 'badge', gp ? gp[0] : spec.group), el('span', 'badge', spec.region || ''));
    if (isSeen(spec.id)) tags.append(el('span', 'badge seen', '\u2713 visited'));
    b.append(tags, el('p', 'note', spec.motto));
    const say = el('p', 'say', '');
    try { say.textContent = insightOf(spec, ds).sentence; } catch (e) { say.textContent = ''; }
    b.append(say);
    const go = el('button', 'pill go', 'Enter ' + spec.name);
    go.addEventListener('click', () => enterCity(spec.id));
    const explore=el('button','pill','Explore districts');explore.addEventListener('click',()=>openNestedCity(spec.id));
    b.append(cityActions(spec, [go,explore]));           // the buttons first: always in view, never scrolled under the orb's corner
    b.append(grid([['Buildings', plain(sm.n)], ['Districts', plain(sm.districts)], ['Tallest', sm.top.slice(0, 34)], ['Its height', sm.topVal]]));
    if (ds.demo) b.append(el('p', 'note', ds.note || 'A small sample stands in until the live file answers.'));
    b.append(el('p', 'note', `Data: ${ds.title} (${ds.source}). Landmark: ${spec.landmark.label}.`));
  });
}

async function selectIsland(i, fly = true) {
  if (S.tour) stopTour();
  S.hubSel = i; S.map.select(i);
  const isl = S.islands[i];
  S.activeDistrict = isl.cont; syncNetwork();
  if (fly) { S.map.setLift(true); S.map.flyToCity(i, 3.0, 0.9); }
  sfx('tick');
  showIsland(i);
  refreshChips();
  const id = isl.spec.dataset;
  if (!S.real.has(id) && !S.demo && (DATASETS[id].remote || DATASETS[id].vault)) {          // the private / remote feeds load when you come near
    const ds = await realDs(id);
    if (!ds.demo) { miniOf(isl); S.live[i] = true; if (S.hubSel === i && S.sheet === 'island') showIsland(i); refreshChips(); }
  }
}

function hubFilter(match) {          // match(spec) -> bool; null clears
  S.hubDim = match ? S.islands.map((i) => !match(i.spec)) : null;
  S.map && S.map.setDim(S.hubDim);
}

function openFind(initialGroup = '') {
  if (typeof initialGroup !== 'string') initialGroup = '';       // the Find button hands over its click event: that is not a district (it used to list 0 cities)
  openSheet('find', 'Find a city', (b) => {
    const inp = el('input'); inp.type = 'search'; inp.placeholder = `Search ${S.specs.length} cities, data, landmarks`; inp.setAttribute('aria-label', 'Search cities');
    const seg = el('div', 'seg'), seg2 = el('div', 'seg'), list = el('ul', 'list');
    let grp = initialGroup, reg = '', only = '', shown = 60;
    const drawRegions = () => {
      seg2.replaceChildren();
      const regs = [...new Set(S.specs.filter((s) => !grp || s.group === grp).map((s) => s.region).filter(Boolean))];
      seg2.style.display = grp && regs.length > 1 ? '' : 'none';
      for (const r of ['', ...regs]) {
        const bt = el('button', r === reg ? 'on' : '', r || 'All regions');
        bt.addEventListener('click', () => { reg = r; shown = 60; draw(); drawRegions(); });
        seg2.append(bt);
      }
    };
    const draw = () => {
      const t = inp.value.trim().toLowerCase();
      const hit = S.specs.filter((s) => (!grp || s.group === grp) && (!reg || s.region === reg) && (only !== 'fav' || isFav(s.id)) && (only !== 'seen' || isSeen(s.id)) && (only !== 'new' || !isSeen(s.id))
        && (!t || `${s.name} ${s.motto} ${s.dataset} ${s.landmark.label} ${s.group} ${s.region || ''}`.toLowerCase().includes(t)));
      list.replaceChildren();
      list.append(el('li', 'count', `${Math.min(shown, hit.length)} shown · ${hit.length} matching · ${S.specs.length} total`));
      for (const s of cityResultPage(hit, 0, shown)) {
        const li = el('li'), k = el('span', 'k'), t2 = el('span', 't'), isl = S.islands[S.specs.indexOf(s)], ds = dsNow(s.dataset);
        k.style.background = s.palette.accent;
        t2.append(document.createTextNode((isFav(s.id) ? '\u2605 ' : '') + s.name + (isSeen(s.id) ? ' \u2713' : '')), el('small', null, `${s.region || ''} \u00b7 ${s.motto}`));
        li.append(k, t2, el('span', 'm', ds ? plain(ds.items.length) : ''));
        li.addEventListener('click', () => {
          if (S.mode === 'city') enterCity(s.id);
          else if (S.stage) selectIsland(isl.i);
          else openNestedCity(s.id);
        });
        list.append(li);
      }
      if (hit.length > shown) {
        const row = el('li', 'more'), more = el('button', 'pill', `Show ${Math.min(60, hit.length - shown)} more cities`);
        more.type = 'button'; more.setAttribute('aria-label', `Show more of ${hit.length} matching cities`);
        more.addEventListener('click', () => { shown = Math.min(hit.length, shown + 60); draw(); (list.querySelector('.more button') || inp).focus(); });
        row.append(more); list.append(row);
      }
      if (S.mode === 'hub' && S.stage) hubFilter(t || grp || reg || only ? (s) => hit.includes(s) : null);
    };
    for (const [id, label] of [['', 'All'], ...GROUP_ORDER.map((g) => [g, GROUPS[g][0]])]) {
      const bt = el('button', id === grp ? 'on' : '', label);
      bt.addEventListener('click', () => { grp = id; reg = ''; shown = 60; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === bt)); draw(); drawRegions(); });
      seg.append(bt);
    }
    const seg3 = el('div', 'seg');
    for (const [id, label] of [['', 'Everything'], ['fav', '\u2605 Saved'], ['seen', '\u2713 Visited'], ['new', 'Not visited']]) {
      const bt = el('button', id === '' ? 'on' : '', label);
      bt.addEventListener('click', () => { only = id; shown = 60; seg3.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === bt)); draw(); });
      seg3.append(bt);
    }
    inp.addEventListener('input', () => { shown = 60; draw(); });
    b.append(inp, seg, seg2, seg3, list); draw(); drawRegions();
    if (!matchMedia('(pointer:coarse)').matches) inp.focus();
  });
}

function openToday() {
  const id = cityOfDay(todayStr(), S.specs.map((s) => s.id)), spec = S.byId.get(id);
  if (!spec) return;
  const ds = dsNow(spec.dataset), sm = ds ? summary(spec, ds) : null, seed = seedOfDay(todayStr());
  openSheet('today', 'City of the day', (b) => {
    b.append(el('h3', null, spec.name), el('p', 'note', spec.motto));
    try { b.append(el('p', 'say', insightOf(spec, ds).sentence)); } catch (e) { /* no sentence */ }
    if (sm) b.append(grid([['Buildings', plain(sm.n)], ['Tallest', sm.top.slice(0, 34)], ['Its height', sm.topVal], ['Landmark', spec.landmark.label]]));
    const go = el('button', 'pill go', 'Enter ' + spec.name), see = el('button', 'pill', 'Show on the map'), rnd = el('button', 'pill', 'Random city of the day');
    go.addEventListener('click', () => enterCity(spec.id));
    see.addEventListener('click', () => selectIsland(S.specs.indexOf(spec)));
    rnd.addEventListener('click', () => enterRandom(seed));
    const a = el('div', 'actions'); a.append(go, see, rnd);
    b.append(a, el('p', 'note', `A new city every day, the same for everyone. Today's random seed: ${seed}.`));
  });
}

function surpriseHub() {
  const r = rng(hash32(String(Date.now())));
  const i = Math.floor(r() * S.specs.length);
  caption('SURPRISE', S.specs[i].name, 2400);
  enterCity(S.specs[i].id);
}

// ------------------------------------------------------------------ the hub tour (across the continents)
function startTour() {
  closeSheet(); S.map.setLift(false);
  const stops = [];
  for (const c of S.conts) {                                             // a district at a time: its islands by region, then on
    const mine = S.islands.filter((is) => is.cont === c.key), step = Math.max(1, Math.ceil(mine.length / 5));
    stops.push({ cont: c, is: null });
    mine.forEach((is, k) => { if (k % step === 0) stops.push({ cont: c, is }); });
  }
  if (stops.length < 3) return;
  S.tour = true; S.tourStops = stops; S.tourIdx = -1; S.tourT = 0;
  $('#tourB') && $('#tourB').classList.add('on');
  hideHint();
  caption('TOUR', `Sailing past ${S.conts.length} districts and ${S.islands.length} cities. Touch to take over.`, 3600);
  tourNext();
}
function stopTour() { S.tour = false; $('#tourB') && $('#tourB').classList.remove('on'); }
function tourNext() {
  const st = S.tourStops[(++S.tourIdx) % S.tourStops.length];
  if (st.is) { const is = st.is; S.map.select(is.i); S.map.flyToCity(is.i, 2.8, 2.2); caption(`${(GROUPS[is.cont] || [''])[0].toUpperCase()} · ${is.spec.region || ''}`, is.spec.name + ': ' + is.spec.motto, 3000); }
  else { S.map.select(-1); S.map.flyToDistrict(st.cont.key, 2.4); caption(st.cont.name.toUpperCase(), `${st.cont.count} cities`, 2800); }
}
function tourTick(dt) { S.tourT += dt; if (S.tourT >= 4.2) { S.tourT = 0; tourNext(); } }

// ------------------------------------------------------------------ entering and leaving a city
const veil = $('#veil');
function showVeil(on, name, sub) {
  if (name) { $('#veilName').textContent = name; $('#veilSub').textContent = sub || ''; }
  veil.classList.toggle('on', on);
}

async function enterCity(id, arrival = false) {
  const spec = specOf(id);
  if (!spec || S.busy) return;
  S.busy = true;
  try {
    if (S.tour) stopTour();
    closeSheet();
    const isl = S.islands.find((i) => i.spec === spec);
    if (S.photo) setPhoto(false);
    if (S.mode === 'hub') {
      if (isl && !reduced() && !arrival) { S.map.select(isl.i); S.map.setLift(false); await Promise.race([S.map.flyToCity(isl.i, 7, 0.7), sleep(1100)]); }
    }
    showVeil(true, spec.name, spec.motto);
    sfx(spec.sound === 'tick' || spec.sound === 'tap' ? 'portal' : spec.sound);
    await sleep(reduced() || arrival ? 20 : 380);
    const ds = await realDs(spec.dataset);
    S.fxDs.set(spec.dataset, S.fxDs.get(spec.dataset) || ds);
    buildCityView(spec, ds);
    markVisited(spec.id);
    ambient(spec);
    showVeil(false);
    S.busy = false;
    if (ds.demo) toast(ds.note || 'Showing a small sample.', 4500);
    else if (S.cur.city.capped) toast(`Showing ${plain(S.cur.city.n)} of ${plain(S.cur.city.total)} (the tier's cap): all the tallest, the rest sampled.`, 4500);
  } catch (e) {
    S.busy = false; showVeil(false);
    S.errors.push(String(e && e.stack || e));
    toast('That city could not be built: ' + (e && e.message ? e.message : e), 5000);
    console.warn('city failed', e);
  }
}

function buildCityView(spec, ds) {
  const st = S.stage, tier = st.caps();
  const city = generate(spec, ds, { cap: tier.cap });
  st.buildCity(spec, city);
  st.look(spec, null, S.night); st.setFogRadius(city.bounds.r); st.show('city');
  const picker = new Picker(city);
  S.cur = { spec, ds, city, picker, f: fieldMap(ds), sel: -1, match: null, base: null };
  S.mode = 'city'; document.body.dataset.mode = 'city';
  engine('city');
  syncNetwork();
  $('#title').textContent = canvas.clientWidth < 600 && /^atlas-(ema|macd|sr)-city$/.test(spec.id) ? spec.name.replace(/^ATLAS /, '') : spec.name;
  $('#title').setAttribute('aria-label', spec.name); $('#backB').hidden = false; $('#readB').hidden = true;
  S.rig.limits = { min: 10, max: city.bounds.r * 4 + 260, pmin: 0.05, pmax: 1.52 };
  S.rig.auto = 0.05;
  const far = city.bounds.r * 1.7 + 70;
  S.rig.t.set(0, city.maxH * 0.28, 0);
  const p0 = Math.max(canvas.clientWidth < 600 ? 0.36 : 0, spec.cam_pitch || (city.layout === 'terrain' ? 0.62 : 0.42));
  S.rig.dist = far; S.rig.pitch = p0 - 0.06; S.rig.yaw = 0; S.rig.fly = null; S.rig.path = null; S.rig.apply();
  S.rig.flyTo({ dist: far * 0.82, pitch: p0, yaw: 0.25 }, reduced() ? 0.01 : 2.4);
  setCam('orbit', true);
  drawMiniBase();
  setDock();
  refreshChips();
  location.hash = spec.id;
  dock.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
  caption(spec.landmark.label.toUpperCase(), spec.motto + ' Outer skyline and roads are scenery; central towers are source records.', 6500);
  const keep = city.best;
  setTimeout(() => { if (S.cur && S.cur.city === city) celebrate(keep, true); }, reduced() ? 400 : 2600);
}

async function leaveCity() {
  if (S.mode !== 'city' || S.busy) return;
  S.busy = true;
  clearCaption();
  closeSheet(); tagEl.style.display = 'none';
  showVeil(true, S.cur.spec.name, '');
  await sleep(reduced() ? 20 : 300);
  stopAmbient(); S.stage.clearCity(); S.stage.look(null, null, S.night); S.stage.setFogRadius(S.hubR * 2.8); S.stage.show('hub');
  S.mode = 'hub'; document.body.dataset.mode = 'hub';
  engine('hub');
  S.activeDistrict = S.cur.spec.group; S.cur = null; syncNetwork();
  $('#title').textContent = 'Olympus Cities'; $('#backB').hidden = true; $('#readB').hidden = false;
  S.rig.stopPath();
  S.cam = 'orbit';
  setDock(); refreshChips();
  history.replaceState(null, '', cleanUrl());
  showVeil(false);
  S.busy = false;
  if (S.hubSel >= 0) { S.map.select(S.hubSel); S.map.setLift(true); S.map.flyToCity(S.hubSel, 3.0, 0.01); showIsland(S.hubSel); }
}

// ------------------------------------------------------------------ inside a city
const itemOf = (k) => S.cur.ds.items[S.cur.city.item[k]];
const heightField = () => parseExpr(S.cur.spec.height_by.replace(/^-/, '')).field;

function selectBuilding(k, fly = true) {
  const C = S.cur, city = C.city, it = itemOf(k), spec = C.spec;
  C.sel = k; S.stage.setSelected(k);
  if (fly) S.rig.flyTo({ x: city.x[k], y: city.h[k] * 0.55, z: city.z[k], dist: Math.max(30, city.w[k] * 6 + city.h[k] * 0.9), pitch: 0.46 }, 0.9);
  sfx('tick');
  if (k === city.best) celebrate(k, false);
  const dst = city.districts[city.dist[k]], hf = heightField(), lessCount = (() => { let c = 0; for (let j = 0; j < city.n; j++) if (city.h[j] < city.h[k]) c++; return c; })();
  openSheet('building', C.ds.label(it), (b) => {
    const bd = el('span', 'badge', dst.label);
    bd.style.background = dst.color; bd.style.color = '#0a0a12';
    b.append(bd);
    const v = it.f[hf], big = el('div', 'big'), val = el('span', 'v' + (typeof v === 'number' ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : ''), fmtField(C.f[hf], v));
    big.append(val, el('span', 'u', C.f[hf] ? C.f[hf].label : hf));
    b.append(big);
    b.append(grid(spec.card.filter((f) => f !== hf).slice(0, 6).map((f) => [C.f[f].label, fmtField(C.f[f], it.f[f])])));
    b.append(el('p', 'note', `Taller than ${Math.round((100 * lessCount) / Math.max(1, city.n))}% of the ${plain(city.n)} buildings. District ${dst.label}: ${plain(dst.count)} buildings.`));
    if (it.text) b.append(el('p', 'note', String(it.text).slice(0, 400)));
    const a = el('div', 'actions'), close = el('button', 'pill', 'Close'), near = el('button', 'pill', 'Fly closer');
    close.addEventListener('click', closeSheet);
    near.addEventListener('click', () => S.rig.flyTo({ x: city.x[k], y: city.h[k] * 0.6, z: city.z[k], dist: Math.max(18, city.w[k] * 3.4), pitch: 0.4 }, 0.8));
    a.append(near, close); b.append(a);
  });
  const t = $('#tag');
  t.replaceChildren(el('b', null, String(C.ds.label(it)).slice(0, 38)), el('span', null, fmtField(C.f[hf], v0(it, hf))));
}
const v0 = (it, f) => it.f[f];

function openTop() {
  const C = S.cur, city = C.city, hf = heightField();
  const ord = Array.from({ length: city.n }, (_, k) => k).sort((a, b) => city.h[b] - city.h[a] || a - b).slice(0, 10);
  openSheet('top', 'Top 10 tallest', (b) => {
    const ul = el('ul', 'list');
    ord.forEach((k, r) => {
      const it = itemOf(k), li = el('li'), kk = el('span', 'k', r + 1), t = el('span', 't');
      kk.style.background = city.districts[city.dist[k]].color; t.append(document.createTextNode(String(C.ds.label(it)).slice(0, 70)), el('small', null, city.districts[city.dist[k]].label));
      li.append(kk, t, el('span', 'm', fmtField(C.f[hf], it.f[hf])));
      li.addEventListener('click', () => selectBuilding(k));
      ul.append(li);
    });
    b.append(ul);
  });
}

function openCityFind() {
  const C = S.cur, city = C.city;
  openSheet('cfind', 'Find a building', (b) => {
    const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Search ' + C.spec.name; inp.setAttribute('aria-label', 'Search buildings');
    const list = el('ul', 'list');
    const draw = () => {
      const t = inp.value.trim().toLowerCase();
      list.replaceChildren();
      if (!t) { S.stage.setDim(null); C.match = null; list.append(el('li', 'count', `${plain(city.n)} buildings. Type to light up matches.`)); return; }
      const hit = [];
      const m = new Uint8Array(city.n);
      for (let k = 0; k < city.n; k++) {
        const it = itemOf(k);
        if (String(C.ds.label(it)).toLowerCase().includes(t) || city.districts[city.dist[k]].label.toLowerCase().includes(t)) { m[k] = 1; hit.push(k); }
      }
      C.match = m;
      S.stage.setDim((k) => !m[k]);
      hit.sort((a, c) => city.h[c] - city.h[a] || a - c);
      list.append(el('li', 'count', `${plain(hit.length)} match${hit.length === 1 ? '' : 'es'}${hit.length > 40 ? ' (the 40 tallest shown)' : ''}`));
      for (const k of hit.slice(0, 40)) {
        const it = itemOf(k), li = el('li'), kk = el('span', 'k'), tt = el('span', 't');
        kk.style.background = city.districts[city.dist[k]].color;
        tt.append(document.createTextNode(String(C.ds.label(it)).slice(0, 80)), el('small', null, city.districts[city.dist[k]].label));
        li.append(kk, tt, el('span', 'm', fmtField(C.f[heightField()], it.f[heightField()])));
        li.addEventListener('click', () => selectBuilding(k));
        list.append(li);
      }
    };
    inp.addEventListener('input', draw);
    b.append(inp, list); draw();
    if (!matchMedia('(pointer:coarse)').matches) inp.focus();
  });
}

function surpriseCity() {
  const city = S.cur.city, r = rng(hash32(String(Date.now())));
  const k = Math.floor(r() * city.n);
  selectBuilding(k);
  caption('SURPRISE', String(S.cur.ds.label(itemOf(k))).slice(0, 80), 2800);
}

function readLines(b) {
  const C = S.cur, spec = C.spec;
  const f = C.f, name = (e) => { const p = parseExpr(String(e).replace(/^-/, '')); return (f[p.field] && f[p.field].label) || p.field; };
  const L = [`Each building is one row of "${C.ds.title}" (${C.ds.source}).`, `Height: ${name(spec.height_by)}.`, `Districts: ${name(spec.district_by)}.`,
    `Glowing roof: ${name(spec.glow_by)}. Windows blink faster on busier buildings.`, `Lit windows: ${name(spec.window_by)}.`,
    { sign: 'Colour: green above zero, red below.', district: 'Colour: one colour per district.', ramp: `Colour: from calm to hot by ${name(spec.color_by.split(':').slice(1).join(':'))}.`, cat: `Colour: by ${name(spec.color_by.split(':').slice(1).join(':'))}.` }[spec.color_by.split(':')[0]]];
  L.push(`Landmark: ${spec.landmark.label}. Scenery: a ${spec.scenery || 'river'}.`);
  if (C.city.capped) L.push(`Showing ${plain(C.city.n)} of ${plain(C.city.total)} buildings (this device's cap): the tallest all stay.`);
  L.forEach((t) => b.append(el('p', 'note', t)));
  b.append(el('p', 'note', 'Tap a building for its card. ORBIT, SKIM, DRONE and GRAND fly the camera for you. The little map flies you anywhere.'));
}

function openRead() {
  if (S.cur) return openReport();
  openSheet('read', 'How to read the world', (b) => {
    b.append(el('p', 'note', 'Every island is a miniature of one city. Each city is built from numbers this site already publishes: trades, tested ideas, simulations, notes, bets.'));
    b.append(el('p', 'note', `${S.conts.length} continents (${S.conts.map((c) => c.name).join(', ')}), ${S.specs.length} cities. Drag to look around, pinch to zoom, use two fingers to move. Tap a continent label to fly there, an island for its card, then Enter to land.`));
    b.append(el('p', 'note', 'Tour flies over every continent. Find searches by name, continent, region, saved and visited. Wow picks a city for you; the dice build a brand new random city from a seed you can share. Today is the city of the day.'));
    b.append(el('p', 'note', 'Adding a city is one entry in cities.json: the generator, the search, the minimap, the report and the cameras come with it.'));
  });
}

function openReport() {
  const C = S.cur; if (!C) return openRead();
  const spec = C.spec;
  if (!C.ins) C.ins = insight(spec, C.ds, C.city);
  const ins = C.ins, city = C.city, hf = heightField(), fd = C.f[hf] || { fmt: 'num', label: hf };
  openSheet('report', 'City report', (b) => {
    const gp = GROUPS[spec.group];
    const tg = el('div');
    tg.append(el('span', 'badge ' + dataTag(C.ds)[1], dataTag(C.ds)[0]), el('span', 'badge', gp ? gp[0] : spec.group), el('span', 'badge', spec.region || ''));
    if (spec.seed) tg.append(el('span', 'badge', 'seed ' + spec.seed));
    b.append(el('h3', null, spec.name), tg, el('p', 'say', ins.sentence));
    b.append(grid([['Buildings', plain(city.n) + (city.capped ? ' of ' + plain(city.total) : '')], ['Districts', String(city.districts.length)],
      ['Above zero', ins.numeric ? Math.round(ins.positive * 100) + '%' : '\u2013'], ['Peak', ins.numeric && ins.best >= 0 ? fmtField(fd, ins.bestV) : '\u2013']]));
    if (ins.rows.length) {
      b.append(el('h3', null, `${ins.field} by ${(C.f[parseExpr(spec.district_by).field] || { label: 'district' }).label.toLowerCase()}`));
      const mx = Math.max(1e-9, ...ins.rows.map((r) => Math.abs(r.mean))), tbl = el('div', 'bars');
      for (const r of ins.rows.slice(0, 8)) {
        const row = el('div', 'barrow'), bar = el('i'), v = el('b', r.mean < 0 ? 'neg' : '', fmtField(fd, Math.abs(r.mean) >= 100 ? Math.round(r.mean) : +r.mean.toFixed(2)));
        bar.style.width = Math.max(3, Math.round((Math.abs(r.mean) / mx) * 100)) + '%'; bar.style.background = r.color;
        row.append(el('span', null, r.label), el('div', 'track', ''), v);
        row.children[1].append(bar);
        tbl.append(row);
      }
      b.append(tbl);
      if (ins.rows.length > 8) b.append(el('p', 'note', `+ ${ins.rows.length - 8} more districts.`));
    }
    const ph = el('button', 'pill', 'Photo mode');
    ph.addEventListener('click', () => { closeSheet(); setPhoto(true); });
    b.append(cityActions(spec, [ph]));
    b.append(el('h3', null, 'How to read this city'));
    readLines(b);
  });
}

// ------------------------------------------------------------------ pick a city (for Compare), Compare, Random, Share, Photo, records
function openPicker(title, onPick, skipId) {
  openSheet('pick', title, (b) => {
    const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Search cities'; inp.setAttribute('aria-label', 'Search cities');
    const list = el('ul', 'list');
    const draw = () => {
      const t = inp.value.trim().toLowerCase();
      const hit = S.specs.filter((s) => s.id !== skipId && (!t || `${s.name} ${s.motto} ${s.region || ''} ${s.group}`.toLowerCase().includes(t)));
      list.replaceChildren(el('li', 'count', `${hit.length} cities`));
      for (const s of hit.slice(0, 50)) {
        const li = el('li'), k = el('span', 'k'), t2 = el('span', 't');
        k.style.background = s.palette.accent; t2.append(document.createTextNode(s.name), el('small', null, `${(GROUPS[s.group] || [''])[0]} \u00b7 ${s.region || ''}`));
        li.append(k, t2); li.addEventListener('click', () => onPick(s.id)); list.append(li);
      }
    };
    inp.addEventListener('input', draw); b.append(inp, list); draw();
  });
}

function drawThumb(cv, city) {
  const g = cv.getContext('2d'), W = cv.width, half = Math.max(Math.abs(city.bounds.minx), Math.abs(city.bounds.maxx), Math.abs(city.bounds.minz), Math.abs(city.bounds.maxz)) * 1.08 + 6, sc = W / (half * 2);
  g.fillStyle = '#080612'; g.fillRect(0, 0, W, W);
  const step = Math.max(1, Math.floor(city.n / 2500));
  for (let k = 0; k < city.n; k += step) {
    const t = 0.3 + 0.7 * Math.min(1, city.h[k] / Math.max(1, city.maxH)), r = Math.max(1.2, city.w[k] * sc * 0.85);
    g.fillStyle = `rgb(${Math.round((city.col[k * 3] * 0.62 + 0.30) * 255 * t)},${Math.round((city.col[k * 3 + 1] * 0.62 + 0.25) * 255 * t)},${Math.round((city.col[k * 3 + 2] * 0.62 + 0.17) * 255 * t)})`;
    g.fillRect((city.x[k] + half) * sc - r / 2, (city.z[k] + half) * sc - r / 2, r, r);
  }
}

/** two cities side by side: their sentences, numbers and top-down pictures */
async function openCompare(aId, bId) {
  if (!bId) { openPicker(`Compare ${specOf(aId).name} with\u2026`, (id) => openCompare(aId, id), aId); return; }
  const A = specOf(aId), B = specOf(bId);
  const [dA, dB] = await Promise.all([realDs(A.dataset), realDs(B.dataset)]);
  const cA = generate(A, dA, { cap: 2500 }), cB = generate(B, dB, { cap: 2500 }), iA = insight(A, dA, cA), iB = insight(B, dB, cB);
  S.compare = { a: aId, b: bId, hashA: cA.hash, hashB: cB.hash };
  openSheet('compare', 'Compare', (b) => {
    const cols = el('div', 'cmp');
    for (const [sp, ds, c, ins] of [[A, dA, cA, iA], [B, dB, cB, iB]]) {
      const col = el('div', 'cmpcol'), cv = el('canvas'); cv.width = cv.height = 220;
      drawThumb(cv, c);
      const hf = parseExpr(sp.height_by.replace(/^-/, '')).field, fd = fieldMap(ds)[hf] || { fmt: 'num' };
      col.append(el('h3', null, sp.name), cv, el('p', 'say', ins.sentence));
      col.append(grid([['Buildings', plain(c.total)], ['Districts', String(c.districts.length)], ['Data', ds.demo ? 'SAMPLE' : 'LIVE'], ['Peak', ins.numeric && ins.best >= 0 ? fmtField(fd, ins.bestV) : '\u2013']]));
      const go = el('button', 'pill', 'Enter'); go.addEventListener('click', () => enterCity(sp.id)); col.append(go);
      cols.append(col);
    }
    b.append(cols);
    const a = el('div', 'actions'), sw = el('button', 'pill', 'Swap'), other = el('button', 'pill', 'Another city');
    sw.addEventListener('click', () => openCompare(bId, aId)); other.addEventListener('click', () => openCompare(aId));
    a.append(sw, other); b.append(a);
  });
}

async function enterRandom(seed) {
  seed = cleanSeed(seed) || newSeed(rng(hash32(String(Date.now()) + Math.random())));
  if (S.busy) return;
  try {
    const ds = await realDs(seedDataset(seed)), spec = randomSpec(seed, ds);
    S.randoms.set(spec.id, spec);
    caption('RANDOM CITY', `${spec.name} \u00b7 seed ${seed}`, 3200);
    await enterCity(spec.id);
  } catch (e) { S.errors.push(String(e && e.stack || e)); toast('Could not build that seed.', 3000); }
}

const cleanUrl = () => { const u = new URL(location.href); u.hash = ''; u.searchParams.delete('seed'); u.searchParams.delete('city'); return u.pathname + u.search; };
const shareLink = (spec) => { const u = new URL(location.href); u.hash = ''; u.search = ''; u.searchParams.set(spec.seed ? 'seed' : 'city', spec.seed || spec.id); return u.toString(); };
async function shareCity(spec) {
  const url = shareLink(spec), title = spec.name + ' \u00b7 OLYMPUS Cities';
  try { if (navigator.share) { await navigator.share({ title, text: spec.motto, url }); return url; } } catch (e) { if (e && e.name === 'AbortError') return url; }
  try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url, 3600); } catch (e) { toast(url, 6000); }
  return url;
}

function setPhoto(on) {
  S.photo = on; document.body.classList.toggle('photo', on);
  if (on) { closeSheet(); caption('PHOTO MODE', 'Frame it, then tap Take photo.', 2600); }
}
async function takePhoto(noShare) {
  S.stage.frame();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) { toast('Could not take the photo.', 3000); return 0; }
  const name = ((S.cur && S.cur.spec.id) || 'cities-world') + '.jpg';
  if (!noShare) {
    try {
      const file = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: S.cur ? S.cur.spec.name : 'OLYMPUS Cities' }); return blob.size; }
    } catch (e) { if (e && e.name === 'AbortError') return blob.size; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Photo saved.', 2400);
  }
  return blob.size;
}
$('#photoB').addEventListener('click', () => setPhoto(!S.photo));
const nightButton = $('#nightB');
function syncNightButton() { nightButton.classList.toggle('on', S.night); nightButton.setAttribute('aria-pressed', String(S.night)); nightButton.setAttribute('aria-label', S.night ? 'Night view on; switch to original sky' : 'Night view off; switch to night'); }
syncNightButton();
nightButton.addEventListener('click', () => { S.night = !S.night; store.set('cities.night', S.night ? '1' : '0'); syncNightButton(); S.stage?.look(S.cur ? S.cur.spec : null, null, S.night); });
$('#photoTake').addEventListener('click', () => takePhoto());
$('#photoDone').addEventListener('click', () => setPhoto(false));

// a record building (the tallest): sparks in the scene and the kit's sparkle burst
function celebrate(k, auto) {
  const C = S.cur; if (!C || k === undefined || k < 0 || k >= C.city.n) return;
  const c = C.city, x = c.x[k], y = c.h[k] + 6, z = c.z[k];
  S.stage.fireworks(x, y, z, warmHex(C.spec.palette.accent));
  S.records = (S.records || 0) + 1;
  try {
    const F = window.OLYMPUS_FX, p = S.stage.project(x, y, z, canvas.clientWidth, canvas.clientHeight);
    if (F && !reduced()) {
      if (F.sparkleBurst && p.on) F.sparkleBurst(canvas, { x: p.x, y: p.y });
    }
  } catch (e) { /* the kit's effects are optional */ }
  if (!auto) sfx('rankup');
}

// ambient sound per city (OLYMPUS_SFX: a soft pad for calm skies and weather, thunder with the storm's lightning)
function ambient(spec) {
  stopAmbient();
  try {
    const A = window.OLYMPUS_SFX;
    if (!A || reduced()) return;
    if (spec.sound === 'pad' || ['snow', 'fog', 'fireflies', 'dust'].includes(spec.weather)) { A.play('pad'); S.ambient = 'pad'; }
  } catch (e) { /* silent */ }
}
function stopAmbient() { try { if (S.ambient && window.OLYMPUS_SFX) window.OLYMPUS_SFX.stop('pad'); } catch (e) { /* silent */ } S.ambient = null; }

// ------------------------------------------------------------------ cameras
function setCam(mode, quiet) {
  S.cam = mode;
  document.querySelectorAll('#cams button').forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  const C = S.cur; if (!C) return;
  const city = C.city, r = city.bounds.r, mH = city.maxH, spd = clamp(r / 150, 0.7, 3.2);
  if (mode === 'orbit') { S.rig.stopPath(); return; }
  let pos = [], look = [], speed = 40 * spd;
  if (mode === 'drone') {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pos.push([Math.cos(a) * r * 0.95, mH * 1.1 + 55 + Math.sin(i * 1.3) * 12, Math.sin(a) * r * 0.95]); look.push([Math.cos(a + 1.4) * r * 0.12, mH * 0.3, Math.sin(a + 1.4) * r * 0.12]); }
    speed = 52 * spd;
  } else if (mode === 'skim') {
    const ds = city.districts.length >= 3 ? city.districts.slice() : [];
    ds.sort((a, b) => Math.atan2(a.cz, a.cx) - Math.atan2(b.cz, b.cx));
    const n = Math.max(ds.length, 8);
    for (let i = 0; i < n; i++) {
      const d = ds[i % Math.max(1, ds.length)] || null, a = (i / n) * Math.PI * 2, rr = d ? Math.hypot(d.cx, d.cz) : r * 0.55;
      const ang = d ? Math.atan2(d.cz, d.cx) : a;
      pos.push([Math.cos(ang) * (rr + city.pitch * 3), 9 + mH * 0.1, Math.sin(ang) * (rr + city.pitch * 3)]);
      look.push([Math.cos(ang + 0.5) * rr * 0.9, mH * 0.22, Math.sin(ang + 0.5) * rr * 0.9]);
    }
    speed = 30 * spd;
  } else if (mode === 'grand') {
    const lm = city.site;
    pos.push([lm.x + lm.scale * 1.4, lm.scale * 1.2, lm.z + lm.scale * 2.4]); look.push([lm.x, lm.scale * 1.2, lm.z]);
    const top = Array.from({ length: city.n }, (_, k) => k).sort((a, b) => city.h[b] - city.h[a] || a - b).slice(0, 5);
    top.forEach((k) => { const a = Math.atan2(city.z[k], city.x[k]); pos.push([city.x[k] + Math.cos(a) * (city.w[k] * 4 + 28), city.h[k] * 0.7 + 12, city.z[k] + Math.sin(a) * (city.w[k] * 4 + 28)]); look.push([city.x[k], city.h[k] * 0.7, city.z[k]]); });
    speed = 34 * spd;
  }
  if (pos.length < 3) return;
  S.rig.follow(safeFlight(makePath(pos, look, true), city), speed, true, mode);
  if (!quiet) caption(mode.toUpperCase(), 'Touch to take the camera back.', 2600);
}

// ------------------------------------------------------------------ chips, dock, quality
function refreshChips() {
  if (S.mode === 'hub') {
    const live = S.live.filter(Boolean).length, tid = cityOfDay(todayStr(), S.specs.map((s) => s.id)), t = S.byId.get(tid);
    setChips([{ label: 'cities', b: String(S.specs.length) }, { label: 'saved', b: String(S.favs.size) }, { label: 'visited', b: String(S.visited.size) }, { label: live ? 'live' : 'loading', b: live ? `${live}/${S.specs.length}` : '…', cls: live ? 'live' : '' },
      ...(t ? [{ label: 'Today:', b: t.name }] : [])]);
  } else if (S.cur) {
    const C = S.cur, [tag, cls] = dataTag(C.ds);
    setChips([{ label: tag, cls }, { label: 'buildings', b: plain(C.city.n) + (C.city.capped ? ' of ' + plain(C.city.total) : '') }, { label: 'districts', b: String(C.city.districts.length) },
      { label: GROUPS[C.spec.group] ? GROUPS[C.spec.group][0] : C.spec.group }, ...(C.spec.region ? [{ label: C.spec.region }] : []), { label: 'Outer skyline: scenery' }]);
  }
}
function setDock() {
  dock.replaceChildren();
  const T = (id, label, icon, fn, view) => { const b = tab(id, label, icon, fn); if (view) b.dataset.view = view; dock.append(b); return b; };
  if (S.mode === 'hub') {
    T('tourB', 'Tour', ICON.tour, () => (S.tour ? stopTour() : startTour()));
    T('findB', 'Find', ICON.find, () => openFind(), 'find');
    T('surpriseB', 'Surprise me', ICON.surprise, surpriseHub);
    T('diceB', 'Random city', ICON.dice, () => enterRandom());
    T('todayB', 'Today', ICON.today, openToday, 'today');
  } else {
    T('hubB', 'World map', ICON.hub, leaveCity);
    T('topB', 'Top 10', ICON.top, openTop, 'top');
    T('cfindB', 'Find', ICON.find, openCityFind, 'cfind');
    T('csurpriseB', 'Surprise me', ICON.surprise, surpriseCity);
    T('creadB', 'Report', ICON.report, openReport, 'report');
  }
}
function qLabel() { const fx = S.mode === 'hub' ? (q.get('q') || (O() ? O().fx() : 'high')) : (S.stage?.tier?.() || (O() ? O().fx() : 'high')); return fx === 'low' || fx === 'off' ? 'LITE' : 'HD'; }
$('#qB').addEventListener('click', () => {
  const o = O(); if (!o || !o.setFx) return;
  o.setFx(qLabel() === 'HD' ? 'low' : 'high');
  $('#qB').textContent = qLabel(); toast(qLabel() === 'HD' ? 'HD: full effects.' : 'LITE: lighter, for a cooler phone.', 2200);
});
$('#readB').addEventListener('click', openRead);
$('#backB').addEventListener('click', leaveCity);
$('#networkHQ').addEventListener('click', flyToHQ);
$('#networkApps').addEventListener('click', openNetworkApps);
document.querySelectorAll('[data-network-district]').forEach((button) => button.addEventListener('click', () => {
  const id = button.dataset.networkDistrict;
  if (S.mode === 'hub' && S.stage) {
    const district = S.conts.find((entry) => entry.key === id);
    if (district) flyToContinent(district);
  }
  openFind(id);
}));
document.querySelectorAll('#cams button').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (S.mode === 'city' && !id) leaveCity();
  else if (/^r-[a-z0-9]{3,12}$/.test(id) && S.ready && (!S.cur || S.cur.spec.id !== id)) enterRandom(id.slice(2));
  else if (id && S.byId.has(id) && (!S.cur || S.cur.spec.id !== id) && S.ready) enterCity(id);
});

// ------------------------------------------------------------------ minimap
const mini = $('#mini'), mg = mini.getContext('2d');
let miniBase = null, miniScale = 1;
function drawMiniBase() {
  const city = S.cur.city, half = Math.max(Math.abs(city.bounds.minx), Math.abs(city.bounds.maxx), Math.abs(city.bounds.minz), Math.abs(city.bounds.maxz)) * 1.1 + 10;
  const W = mini.width;
  miniScale = W / (half * 2);
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(26,21,16,0.94)'; g.fillRect(0, 0, W, W);
  for (const d of city.districts) {
    g.strokeStyle = d.color; g.globalAlpha = 0.35; g.lineWidth = 1.2;
    if (['districts', 'clock', 'calendar'].includes(city.layout)) g.strokeRect((d.x0 + half) * miniScale, (d.z0 + half) * miniScale, (d.x1 - d.x0) * miniScale, (d.z1 - d.z0) * miniScale);
  }
  g.globalAlpha = 1;
  const step = Math.max(1, Math.floor(city.n / 6000));
  for (let k = 0; k < city.n; k += step) {
    const r = Math.max(1.1, city.w[k] * miniScale * 0.8), t = 0.35 + 0.65 * Math.min(1, city.h[k] / Math.max(1, city.maxH));
    g.fillStyle = `rgb(${Math.round((city.col[k * 3] * 0.62 + 0.30) * 255 * t)},${Math.round((city.col[k * 3 + 1] * 0.62 + 0.25) * 255 * t)},${Math.round((city.col[k * 3 + 2] * 0.62 + 0.17) * 255 * t)})`;
    g.fillRect((city.x[k] + half) * miniScale - r / 2, (city.z[k] + half) * miniScale - r / 2, r, r);
  }
  g.fillStyle = '#e0b060'; g.beginPath(); g.arc((city.site.x + half) * miniScale, (city.site.z + half) * miniScale, 3.5, 0, 7); g.fill();
  miniBase = { c, half };
}
function drawMini() {
  if (!miniBase) return;
  const W = mini.width, { half } = miniBase, cam = S.stage.camera.position, t = S.rig.t;
  mg.clearRect(0, 0, W, W); mg.drawImage(miniBase.c, 0, 0);
  const cx = (cam.x + half) * miniScale, cz = (cam.z + half) * miniScale, tx = (t.x + half) * miniScale, tz = (t.z + half) * miniScale;
  mg.strokeStyle = '#ffc94a'; mg.fillStyle = '#ffc94a'; mg.lineWidth = 2;
  mg.beginPath(); mg.moveTo(cx, cz); mg.lineTo(tx, tz); mg.stroke();
  mg.beginPath(); mg.arc(cx, cz, 5, 0, 7); mg.fill();
}
mini.addEventListener('click', (e) => {
  if (!miniBase || !S.cur) return;
  const r = mini.getBoundingClientRect(), fx = ((e.clientX - r.left) / r.width) * mini.width, fz = ((e.clientY - r.top) / r.height) * mini.height;
  const x = fx / miniScale - miniBase.half, z = fz / miniScale - miniBase.half;
  S.rig.flyTo({ x, y: S.cur.city.maxH * 0.25, z, dist: clamp(S.rig.dist, 40, 220), pitch: 0.5 }, 1.1);
  setCam('orbit', true);
});

// ------------------------------------------------------------------ labels
const labelEls = Array.from({ length: 8 }, () => { const i = el('i'); $('#labels').append(i); return i; });
const contEls = Array.from({ length: 8 }, () => { const i = el('i'); i.className = 'cont'; $('#labels').append(i); return i; });
const farHub = () => false;
// Measure the actual label before clamping: long names never disappear off either edge.
function placeLabel(e, p, w, h, above = false) {
  const half = Math.min(w / 2 - 12, e.offsetWidth / 2 + 4);
  const hub = S.mode === 'hub', low = hub ? Math.min(300, h * .38) : 118;
  const x = clamp(p.x, half + 8, w - half - 8);
  let y = clamp(p.y, low, Math.max(low, h - (hub ? 280 : 140)));
  if (!hub) {
    const cm = $('#cams').getBoundingClientRect(), ctop = y - (above ? e.offsetHeight : e.offsetHeight / 2);
    if (x - half < cm.right + 4 && ctop < cm.bottom + 4 && y > cm.top - 4) y = Math.min(h - 130, cm.bottom + e.offsetHeight + 8);
    const map = mini.getBoundingClientRect(), top = y - (above ? e.offsetHeight : e.offsetHeight / 2);
    if (x + half > map.left - 4 && x - half < map.right + 4 && top < map.bottom + 4 && y > map.top - 4)
      y = Math.min(h - 130, map.bottom + e.offsetHeight + 8);
  }
  e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,${above ? '-100%' : '-50%'})`;
  return { x, y };
}
function updateLabels(frame) {
  if (frame % 3) return;
  if (S.mode === 'city' && typeof capEl !== 'undefined' && capEl.classList.contains('on')) { labelEls.forEach(e => { e.style.display = 'none'; }); return; }
  const w = canvas.clientWidth, h = canvas.clientHeight, st = S.stage, cand = [];
  const far = farHub();
  contEls.forEach((e, i) => {
    const c = far ? S.conts[i] : null;
    if (!c) { e.style.display = 'none'; return; }
    const p = st.project(c.x, 40, c.z, w, h);
    if (!p.on || p.x < -60 || p.x > w + 60 || p.y < 80 || p.y > h - 110) { e.style.display = 'none'; return; }
    e.style.display = 'block'; e.textContent = `${c.name} \u00b7 ${c.count}`; e.style.color = c.color; e.style.borderColor = c.color;
    placeLabel(e, p, w, h);
  });
  if (S.mode === 'hub') {
    for (const is of S.islands) {
      const p = st.project(is.x, is.y + is.R * 1.5, is.z, w, h);
      if (!p.on || p.x < -20 || p.x > w + 20 || p.y < 90 || p.y > h - 120) continue;
      const dist = Math.hypot(p.x - w / 2, (p.y - h / 2) * 1.2) + (is.i === S.hubSel ? -9999 : 0);
      cand.push({ p, text: is.spec.name + (isSeen(is.spec.id) ? ' \u2713' : ''), sel: is.i === S.hubSel, dist });
    }
  } else if (S.cur && S.cur.city.districts.length > 1 && ['districts', 'clock', 'calendar'].includes(S.cur.city.layout)) {
    for (const d of S.cur.city.districts) {
      const p = st.project(d.cx, d.top + 6, d.cz, w, h);
      if (!p.on || p.x < 10 || p.x > w - 10 || p.y < 100 || p.y > h - 130) continue;
      cand.push({ p, text: d.label, sel: false, dist: p.z * 1000 });
    }
  }
  cand.sort((a, b) => a.dist - b.dist);
  const occupied = [];
  labelEls.forEach((e, i) => {
    const c = (far && i >= 3) ? null : cand[i];
    if (!c) { e.style.display = 'none'; return; }
    e.style.display = 'block'; e.textContent = c.text; e.classList.toggle('sel', c.sel);
    const p = placeLabel(e, c.p, w, h, true);
    const box = { left: p.x - e.offsetWidth / 2 - 5, right: p.x + e.offsetWidth / 2 + 5,
      top: p.y - e.offsetHeight - 5, bottom: p.y + 5 };
    if (occupied.some(q => box.left < q.right && box.right > q.left && box.top < q.bottom && box.bottom > q.top))
      e.style.display = 'none';
    else occupied.push(box);
  });
}
function updateTag() {
  if (S.mode !== 'city' || !S.cur || S.cur.sel < 0) { tagEl.style.display = 'none'; return; }
  const C = S.cur, k = C.sel, p = S.stage.project(C.city.x[k], C.city.h[k] + 2, C.city.z[k], canvas.clientWidth, canvas.clientHeight);
  if (!p.on || p.y < 100) { tagEl.style.display = 'none'; return; }
  tagEl.style.display = 'block'; tagEl.style.transform = `translate(${Math.round(clamp(p.x, 60, canvas.clientWidth - 60))}px,${Math.round(p.y)}px) translate(-50%,-115%)`;
}

// ------------------------------------------------------------------ input
function flyToContinent(c) {
  if (S.tour) stopTour();
  S.activeDistrict = c.key; syncNetwork();
  closeSheet(); hideHint(); S.hubSel = -1; S.map.select(-1); S.map.setLift(false);
  S.map.flyToDistrict(c.key, 1.1);
  caption(c.name.toUpperCase(), `${c.count} cities: ${c.regions.slice(0, 5).join(', ')}${c.regions.length > 5 ? '…' : ''}`, 3400);
  sfx('tick');
}

async function flyToHQ() {
  if (!S.stage || !S.rig) { openFind('trading'); return; }
  if (S.mode === 'city') await leaveCity();
  if (S.mode !== 'hub' || S.busy) return;
  closeSheet();
  S.activeDistrict = 'hq'; syncNetwork();
  hideHint(); S.hubSel = S.hqIndex ?? 0; S.map.select(S.hubSel); S.map.setLift(false); S.map.flyToCity(S.hubSel, 2.2, 1.1);
  caption('OLYMPUS HQ', 'The capital sits at the center of six connected city districts.', 3600);
}

function openNetworkApps() {
  openSheet('network', 'City Network', (b) => {
    b.append(el('p', 'note', 'Jump between the verified city destinations. Every link stays inside this Olympus project.'));
    const actions = el('nav', 'city-network-grid'); actions.setAttribute('aria-label', 'Verified city destinations');
    const destinations = [
      ['Cities', '173-city living atlas', './', true],
      ['Data City', 'Market data capital', '../datacity/'],
      ['Kalshi City', 'Read-only edge metropolis', '../kalshicity/'],
      ['Oracle', 'Forecast and scenario arena', '../oracle/'],
      ['Atlas Hub', 'All verified arenas', '../atlas/'],
    ];
    for (const [label, detail, href, current] of destinations) {
      const link = el('a', 'city-network-destination'); link.href = href; link.setAttribute('aria-label', `Open ${label}`);
      if (current) link.setAttribute('aria-current', 'page');
      link.append(el('b', '', label), el('small', '', detail)); actions.append(link);
    }
    const all = el('button', 'pill', `Browse all ${S.specs.length} cities`); all.type = 'button'; all.addEventListener('click', () => openFind());
    b.append(actions, all);
  });
}

function syncNetwork() {
  const active = S.mode === 'city' ? S.cur?.spec.group : (S.activeDistrict || 'hq');
  const hq = $('#networkHQ');
  if (hq) hq.setAttribute('aria-pressed', String(S.mode === 'hub' && active === 'hq'));
  document.querySelectorAll('[data-network-district]').forEach((button) => {
    button.setAttribute('aria-pressed', String(active === button.dataset.networkDistrict));
  });
}

function onTap(x, y) {
  if (S.busy) return;
  if (S.mode === 'hub') {
    onMapPick(S.map.pick(x, y));
    return;
  }
  const C = S.cur; if (!C) return;
  const ray = S.stage.ray(x, y, canvas.clientWidth, canvas.clientHeight), r = C.picker.pick(ray.o, ray.d);
  if (r.index >= 0) selectBuilding(r.index); else closeSheet();
}

// ------------------------------------------------------------------ the frame loop
let frame = 0;
let shiftX = 0, shiftY = 0;
function viewShift(dt) {           // keep what you tapped above the sheet: the view window slides while a sheet is open
  const w = canvas.clientWidth, h = canvas.clientHeight, land = w > h * 1.1, open = sheet.classList.contains('on') && !S.tour;
  const ty = open && !land ? h * 0.17 : 0, tx = open && land ? -w * 0.2 : 0, k = Math.min(1, dt * 7);
  shiftY += (ty - shiftY) * k; shiftX += (tx - shiftX) * k;
  if (Math.abs(shiftY) > 0.5 || Math.abs(shiftX) > 0.5) S.stage.camera.setViewOffset(w, h, shiftX, shiftY, w, h);
  else if (S.stage.camera.view && S.stage.camera.view.enabled) S.stage.camera.clearViewOffset();
  else return;
  S.stage.camera.updateProjectionMatrix();
}
function loop(dt, t) {
  frame++;
  S.rig.update(dt);
  viewShift(dt);
  S.stage.update(dt, t);
  if (S.tour) tourTick(dt);
  updateLabels(frame);
  if (S.mode === 'city') { updateTag(); if (frame % 4 === 0) drawMini(); }
}

// ------------------------------------------------------------------ boot
/** Only one of the two engines draws at a time: the 2D map on the world screen, the 3D stage inside a city. */
function engine(which) {
  const st = S.stage; if (!st) return;
  if (which === 'city') { S.map && S.map.stop(); st.start(S.stageCb); }
  else { try { st.rc.stop(); } catch (_) { /* already stopped */ } if (S.map) { S.map.resize(); S.map.start(); } }
}
function hubStartPose() {
  // Start at the real trading capital; the in-world rail reaches every district.
  return canvas.clientWidth < 600
    ? { x: 0, y: 8, z: 0, dist: 540, pitch: .86, yaw: .24 }
    : { x: 0, y: 0, z: 0, dist: Math.max(740, S.hubR * 1.15), pitch: .92, yaw: .28 };
}
function fallbackList(why) {
  // A renderer may fail after a city or sheet is already open. Make the atlas
  // visible and interactive before mounting its independent, GPU-free lobby.
  S.mode = 'hub'; S.cur = null; S.sheet = null; S.photo = false; S.tour = false;
  document.body.dataset.mode = 'hub'; document.body.classList.remove('photo');
  sheet.classList.remove('on'); $('#atlas').classList.remove('behind');
  $('#backB').hidden = true; $('#readB').hidden = true; $('#title').textContent = 'Olympus Cities';
  tagEl.style.display = 'none';
  $('#loading')?.remove();
  if (S.map) { S.map.stop(); $('#amap').style.display = 'none'; }
  $('#qB').textContent = 'ATLAS'; $('#qB').disabled = true; $('#photoB').hidden = true; nightButton.hidden = true;
  mountWorld(S.specs, { fallback: true, onExplore:openNestedCity, describe: (s) => {
    const ds = dsNow(s.dataset); if (!ds) return { line: 'This dataset is not available yet.', note: why };
    const sm = summary(s, ds);
    return { demo: ds.demo, line: `${plain(sm.n)} records across ${plain(sm.districts)} districts. Tallest: ${sm.top} · ${sm.topVal}.`, note: `${ds.demo ? 'Sample data' : 'Published data'} · ${ds.title}. ${ds.note || ''}` };
  } });
  document.body.dataset.ready = 'fallback';
  S.ready = true;
  O()?.ready?.();
  // Rendering failure must not stop the data: records upgrade from sample to published
  // files as they arrive. No remote feed or private vault is requested by the atlas.
  Promise.allSettled([...new Set(S.specs.map(s=>s.dataset))]
    .filter(id=>!DATASETS[id].remote&&!DATASETS[id].vault).map(id=>realDs(id)));
}


/** A WebGL context can be lost after startup without throwing from the frame loop.
 * Keep the independent atlas usable instead of leaving a dark canvas on phones.
 */
function recoverLostContext(stage, event) {
  event?.preventDefault?.();
  if (document.body.dataset.ready === 'fallback') return;
  try { stage?.dispose(); } catch (_) { /* the atlas does not need WebGL */ }
  fallbackList('The 3D graphics stopped on this device.');
}

async function boot() {
  if (window.__citiesImportAbandoned) return;
  let cfg, fx;
  // a build that takes long says so in plain words (the cities use their sample data whenever live data cannot be reached)
  const slow = setTimeout(() => { const l = $('#loading'); if (l) l.textContent = 'STILL BUILDING THE WORLD… WITHOUT A CONNECTION THE SAMPLE CITIES SHOW.'; }, 8000);
  try { [cfg, fx] = await Promise.all([getJson('./cities.json'), getJson('./fixture.json')]); } catch (e) {
    if (window.__citiesImportAbandoned) { clearTimeout(slow); return; }
    clearTimeout(slow); const l = $('#loading');
    if (l) { l.style.pointerEvents = 'auto'; l.replaceChildren(el('div', null, 'Could not load the city list. Check your connection, then try again.')); const b = el('button', 'btn', 'Try again'); b.type = 'button'; b.style.cssText = 'min-height:44px;padding:0 18px;margin-top:14px;border-radius:12px'; b.onclick = () => location.reload(); l.firstChild.append(document.createElement('br'), b); }
    throw e; }
  clearTimeout(slow);
  if (window.__citiesImportAbandoned) return;
  for (const s of cfg.cities) {
    const errs = validateSpec(s, DATASETS);
    if (errs.length) { console.warn('city skipped', s.id, errs); continue; }
    S.specs.push(s); S.byId.set(s.id, s);
  }
  env.fixture = fx; fxEnv.fixture = fx;
  await Promise.all([...new Set(S.specs.map((s) => s.dataset))].map(async (id) => { S.fxDs.set(id, await sampleDs(id)); }));
  if (window.__citiesImportAbandoned) return;
  if (q.get('q') === 'off' || O()?.fx?.() === 'off') { fallbackList('3D effects are off.'); return; }
  let context = null;
  try { context = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' }) || canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' }); } catch (_) { /* unsupported context */ }
  if (!context) { fallbackList('3D is not available here.'); return; }
  let importTimer;
  try {
    const modules = await Promise.race([
      Promise.all([import('./scene.js?v=g7'), import('./rig.js?v=r2')]),
      new Promise((_, reject) => { importTimer = setTimeout(() => reject(Error('3D startup timed out')), 8000); }),
    ]);
    ({ Stage, TIERS, BUDGETS, warmHex } = modules[0]); ({ Rig, makePath, safeFlight } = modules[1]);
  } catch (_) { context.getExtension('WEBGL_lose_context')?.loseContext(); if (!window.__citiesImportAbandoned) fallbackList('The 3D files could not start.'); return; }
  finally { clearTimeout(importTimer); }
  if (window.__citiesImportAbandoned) return;
  let stage;
  try { stage = new Stage(canvas, { context, onTier: (lv) => retier(lv) }); } catch (e) { fallbackList('3D is not available here.'); return; }
  S.stage = stage;
  canvas.addEventListener('webglcontextlost', (event) => recoverLostContext(stage, event), { once: true });
  S.rig = new Rig(stage.camera, canvas, { onTap, onFreed: () => { if (S.tour) { S.tour = false; $('#tourB') && $('#tourB').classList.remove('on'); } if (S.mode === 'city') setCam('orbit', true); } });
  S.live = S.specs.map(() => false);
  stage.look(null, null, S.night);
  buildHub();
  stage.setFogRadius(S.hubR * 2.8);
  stage.show('hub');
  S.rig.limits = { min: 50, max: S.hubR * 3.4, pmin: 0.08, pmax: 1.5 };
  const pose = hubStartPose(); S.rig.t.set(pose.x, pose.y, pose.z); S.rig.dist = pose.dist; S.rig.pitch = pose.pitch; S.rig.yaw = pose.yaw; S.rig.auto = 0.018; S.rig.apply();
  S.activeDistrict = 'hq'; syncNetwork();
  $('#title').textContent = 'Olympus Cities';
  setDock(); refreshChips(); $('#qB').textContent = qLabel();
  $('#atlasCount').textContent = `${S.specs.length} cities · 1 connected network · ${S.conts.length} districts`;
  S.stageCb = (dt, t) => {
    if (document.body.dataset.ready === 'fallback') return;
    try { loop(dt, t); }
    catch (e) {
      console.error('cities render failed', e);
      try { stage.dispose(); } catch (_) { /* keep the atlas available */ }
      fallbackList('The 3D renderer stopped.');
    }
  };
  engine('hub');
  $('#loading').remove();
  document.body.dataset.ready = 'true';
  S.ready = true;
  setTimeout(() => O()?.ready?.(), 60);
  window.addEventListener('olympus:theme', () => stage.look(S.cur ? S.cur.spec : null, null, S.night));
  stage.onFlash = () => sfx('thunder');
  const seedQ = cleanSeed(q.get('seed') || (/^r-/.test(location.hash.slice(1)) ? location.hash.slice(3) : ''));
  const want = q.get('city') || location.hash.slice(1);
  if (seedQ) { enterRandom(seedQ); setTimeout(prefetch, 3000); }
  else if (want && S.byId.has(want)) { enterCity(want); setTimeout(prefetch, 2500); }
  else setTimeout(prefetch, 1000);
}

let retierT = 0;
function retier(lv) {
  clearTimeout(retierT);
  retierT = setTimeout(() => {
    if (!S.stage) return;
    const keep = S.cur && S.cur.sel >= 0 ? S.cur.ds.items[S.cur.city.item[S.cur.sel]].id : null;
    const hubSel = S.hubSel;
    void hubSel;
    if (S.cur) {
      const C = S.cur;
      C.city = generate(C.spec, C.ds, { cap: S.stage.caps().cap });
      S.stage.buildCity(C.spec, C.city);
      S.stage.look(C.spec, null, S.night); S.stage.setFogRadius(C.city.bounds.r);
      C.picker = new Picker(C.city); C.sel = -1; C.match = null;
      drawMiniBase(); refreshChips();
      if (keep) { const k = Array.from({ length: C.city.n }, (_, j) => j).find((j) => C.ds.items[C.city.item[j]].id === keep); if (k !== undefined) selectBuilding(k, false); }
    }
    $('#qB').textContent = qLabel();
  }, 60);
}

// the test / debug door
window.__cities = {
  get ready() { return S.ready; },
  get mode() { return S.mode; },
  specs: () => S.specs.map((s) => s.id),
  enter: (id) => enterCity(id),
  exit: () => leaveCity(),
  select: (i) => selectIsland(i),
  info: () => ({ mode: S.mode, id: S.cur && S.cur.spec.id, n: S.cur && S.cur.city.n, total: S.cur && S.cur.city.total, hash: S.cur && S.cur.city.hash, districts: S.cur && S.cur.city.districts.length,
    demo: S.cur && S.cur.ds.demo, records: S.records || 0, tourConts: S.tourStops ? new Set(S.tourStops.map((t) => t.cont.key)).size : 0, islands: S.islands.length, slots: S.slots, hubSel: S.hubSel, sheet: S.sheet, cam: S.cam, tour: S.tour, live: S.live.filter(Boolean).length, errors: S.errors, sel: S.cur && S.cur.sel,
    tier: S.stage && S.stage.tier(), camPos: S.stage && [S.stage.camera.position.x, S.stage.camera.position.y, S.stage.camera.position.z] }),
  stats: () => { S.stage.frame(); return { ...S.stage.stats(), budget: BUDGETS[S.stage.tier()], caps: S.stage.caps() }; },
  frame: () => S.stage.frame(),
  pickScreen: (x, y) => { onTap(x, y); },
  pickBuilding: (k) => selectBuilding(k),
  tallest: () => { const c = S.cur.city; let b = 0; for (let k = 1; k < c.n; k++) if (c.h[k] > c.h[b]) b = k; return b; },
  conts: () => S.conts.map((c) => ({ key: c.key, name: c.name, count: c.count, regions: c.regions, x: c.x, z: c.z, r: c.r })),
  rig: () => ({ t: [S.rig.t.x, S.rig.t.y, S.rig.t.z], dist: S.rig.dist, pitch: S.rig.pitch, yaw: S.rig.yaw, hubR: S.hubR, far: false }),
  fav: (id) => toggleFav(id), favs: () => [...S.favs], visited: () => [...S.visited],
  random: (seed) => enterRandom(seed), shareLink: (id) => shareLink(specOf(id)), share: (id) => shareCity(specOf(id)),
  report: () => openReport(), compare: (a, b) => openCompare(a, b), photoMode: (on) => setPhoto(on), photo: () => takePhoto(true),
  celebrate: () => { const c = S.cur; if (c) celebrate(c.city.best, false); return S.records || 0; },
  contTap: (key) => { const c = S.conts.find((k) => k.key === key); if (c) flyToContinent(c); },
  sentence: () => (S.cur ? (S.cur.ins || (S.cur.ins = insight(S.cur.spec, S.cur.ds, S.cur.city))).sentence : ''),
  scenery: () => (S.stage.cityRec && S.stage.cityRec.scenery ? { kind: S.stage.cityRec.scenery.kind, props: S.stage.cityRec.scenery.props } : null),
  nearestToCenter: () => {
    const c = S.cur.city, w = canvas.clientWidth, h = canvas.clientHeight; let best = -1, bd = Infinity;
    for (let k = 0; k < c.n; k++) { const p = S.stage.project(c.x[k], c.h[k] * 0.5, c.z[k], w, h); if (!p.on) continue; const d = Math.hypot(p.x - w / 2, p.y - h * 0.5); if (d < bd) { bd = d; best = k; } }
    return best;
  },
  project: (k) => { const c = S.cur.city; return S.stage.project(c.x[k], c.h[k] * 0.5, c.z[k], canvas.clientWidth, canvas.clientHeight); },
  projectIsland: (i) => S.map.project(i),
  map: () => S.map && { zoom: S.map.zoomLevel(), scale: S.map.cam.s, fit: S.map.fit, x: S.map.cam.x, y: S.map.cam.y, cities: S.map.cities.length, labels: S.map.labelBoxes.length, banners: S.map.banners.length, running: S.map.running },
  mapZoom: (z) => S.map.flyTo(S.map.cam.x, S.map.cam.y, S.map.fit * z, 0),
  mapTo: (i, z) => S.map.flyToCity(i, z || 3, 0),
  cam: (m) => setCam(m),
  tour: () => (S.tour ? stopTour() : startTour()),
  surprise: () => (S.mode === 'hub' ? surpriseHub() : surpriseCity()),
  find: (t) => { if (S.mode === 'hub') openFind(); else openCityFind(); const i = $('#sheetBody input'); i.value = t; i.dispatchEvent(new Event('input')); },
  today: () => cityOfDay(todayStr(), S.specs.map((s) => s.id)),
  setTier: (lv) => S.stage.rc.setQuality(lv),
  generate: (id, cap) => { const s = S.byId.get(id); return realDs(s.dataset).then((ds) => { const c = generate(s, ds, { cap: cap || 40000 }); return { n: c.n, total: c.total, hash: c.hash, districts: c.districts.length }; }); },
  TIERS, BUDGETS,
};

$('#atlas').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.city && S.ready) enterCity(button.dataset.city);
  else if (button.dataset.atlas === 'tour' && S.ready) startTour();
  else if (button.dataset.atlas === 'find' && S.ready) openFind();
});
boot().catch((e) => {
  if (window.__citiesImportAbandoned) return;
  console.error('cities boot failed', e);
  S.errors.push(String(e && e.stack || e));
  if (S.specs.length) {
    try { S.stage?.dispose(); } catch (_) { /* keep the atlas available */ }
    fallbackList('The 3D world could not finish loading.');
    return;
  }
  if (O() && O().fail) O().fail('The cities could not start: ' + (e && e.message ? e.message : e));
});

// keep the unused import honest for tooling
void lerp; void store;



