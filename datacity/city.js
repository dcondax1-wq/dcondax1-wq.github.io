// Olympus Data City: the NQ data machine (tools/datacity) drawn as a city. Reads ./city.json (written by
// `python -m tools.datacity`) and any plug-in districts (./plugins.json); without city.json, a demo city from ./fixture.json.
// Paper only: it shows research, never trades.
//
// Every building is one combination (a time x a confluence x up to two "while" states): height = $ per trade per micro after
// costs, colour = stability (gold: holds everywhere + FDR, green: both periods, amber: one, grey: noise), lit windows =
// sample size, pulsing roof = rising. ~32k buildings in 9 districts + the Strategies, the Harbor (LIT's trades as ships),
// the discoveries round the plaza and LIT's tower in the middle. The sky runs on the futures clock, the weather on the VIX.
// Routes: #top #today #watch #find #read #tour #b=<id> #d=<district>. Test hooks: ?synth=N (N synthetic grey buildings),
// ?vix=V (weather), ?sky=live|night|day, window.__city (state, stats()).
//
//   data.js (decode + plug-ins) · layout.js (where things stand) · scene.js (three.js world) · skyline.js (tiles + LOD)
//   fx.js (rays, fog, rain, traffic, beam, billboards) · sky.js (market clock, weather) · controls.js (camera)
//   tour.js (the cinematic tour) · minimap.js · ui.js (top bar, sheet, cards) · theme.js · city.js (this: wiring, frame loop)
//   OLYMPUS v3 (2026-11-04): kinds.js (12 building types by idea family, windows that tell the data, plain-words search, the Council of ideas,
//   the growth timeline) · skyline.js (tiered towers, a PBR facade) · vehicles.js (cars, flying taxis, airships, the monorail) · water.js (river,
//   sailing ships, cranes) · signs.js (neon district names) · fireworks.js (gold ideas) · kitfx.js (the OLYMPUS effects library: god rays, lens flare,
//   aurora, fireflies, lightning) · links.js (the compare arc) · routes.js (river + monorail) · panels.js (menu, report, compare, timeline, access,
//   photo). Routes: #menu #report #timeline #access #photo #fireworks #compare. Test hooks: window.__city.v3.
//   OLYMPUS v2 (2026-11-03): scene.js draws through the OLYMPUS render core (../olympus/render.js: ACES, 4x MSAA, bloom, film finish,
//   tiers from OLYMPUS.fx(); LITE = 2 passes + a 30 fps cap) · landmarks.js (temple, forum, Pharos, Poseidon gate, district gates: PBR
//   marble / gold / glass, tap for a card) · streams.js (data arcs + pulses) · outskirts.js (scenery ring) · fly.js (SKIM / DRONE /
//   GRAND cameras; routes #cam=skim|drone|grand, #l=temple|forum|pharos|poseidon).
import * as THREE from '../jarvis/three.module.min.js';
import { $, el, clsRank, settings, money, num, pct } from './util.js';
import { decode, loadPlugins, labelOf } from './data.js';
import { walker } from './walk.js';
import { layout } from './layout.js?v=dcgfx3';
import { CityScene } from './scene.js?v=dcgfx10';
import { Orbit } from './controls.js';
import { Tour, shots } from './tour.js';
import { MODES, flight } from './fly.js';
import { Minimap } from './minimap.js?v=dcgfx3';
import { etClock, sunOf, weatherOf } from './sky.js?v=dcgfx15';
import { applyTheme, watchTheme } from './theme.js';
import * as UI from './ui.js';
import * as PN from './panels.js';
import { marketNow, parseLit } from './market.js';
import { parseQuery, filterTest, council, yearsOf, standing, holdOf } from './kinds.js';
import { Acts, useState } from './city-acts.js';
import { NEON, LOOK, setLook } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil
const LQ_FPS = 40;                  // below this for 3 s in a row (HQ, not chosen by the viewer) -> low quality
const SKY_MODES = ['live', 'night', 'day'];
const P = new URLSearchParams(location.search);
const state = window.__city = { ready: false, mode: null, buildings: 0, quality: null, fps: 0, found: 0, errors: [], today: { on: false, lit: 0 },
                                tour: { on: false, step: -1, steps: 0, caption: '' }, cam: { mode: 'orbit', on: false }, landmark: null, sky: null, weather: null, frames: 0 };

async function getJSON(url, ms = 0) {
  const ac = ms && typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms) : 0;
  let r;
  try { r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); } finally { clearTimeout(tm); }
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** The live city, else the demo fixture. */
async function loadCity() {
  if (P.has('demo')) return { data: await getJSON('./fixture.json'), demo: true };     // ?demo=1: the fixtures only (offline, tests)
  let why = 'none';
  try {
    const d = await getJSON('./city.json', 8000);                  // no answer in 8 s (offline, a dead link): the demo city, never a "loading" that does not end
    if (Array.isArray(d?.buildings) && d.buildings.length) return { data: d, demo: !!d.demo };
  } catch (e) { why = 'offline'; /* not published yet, or no connection: the demo city */ }
  return { data: await getJSON('./fixture.json'), demo: true, why };
}

function billboards(model) {
  return (model.discoveries || []).slice(0, 12).map((d, i) => {
    const b = model.byId.get(d.id) || {};
    return { title: `DISCOVERY ${i + 1} / ${Math.min(12, model.discoveries.length)}${d.new ? ' · NEW' : ''}`, lines: [labelOf(b, model.D) || d.text],
             big: `${money(b.e)}/trade · ${b.cls || ''}${b.fdr ? ' · FDR' : ''}`, color: b.cls === 'gold' ? (NEON ? '#ffd36b' : '#d79e64') : b.cls === 'green' ? (NEON ? '#39e59a' : '#9bab62') : (NEON ? '#7fe9ff' : '#daa56f') };
  });
}

class App {
  constructor(model, demo) {
    this.model = model;
    this.L = layout(model);
    this.quality = O ? (O.lite() ? 'lq' : 'hq') : settings.get('dc.q', 'hq');
    this.skyMode = SKY_MODES.includes(P.get('sky')) ? P.get('sky') : settings.get('dc.sky', 'live');
    this.wxOn = settings.get('dc.wx', '1') === '1';
    this.weather = weatherOf(P.has('vix') ? +P.get('vix') : model.weather?.vix);
    const winRate = model.buildings.reduce((a, b) => a + (b.w || 50), 0) / Math.max(1, model.buildings.length) / 100;
    this.calm = O ? O.reduced() : !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.city = new CityScene($('#c'), this.L, { quality: this.quality, winRate: Math.max(0.3, Math.min(0.7, winRate)), billboards: billboards(model), calm: this.calm,
      onTier: (q) => this.onTier(q) });
    this.quality = this.city.quality;     // the render core's tier decides (OLYMPUS.fx())
    O?.onTheme(() => this.applyDay());
    O?.onPower?.(() => this.city._tier(this.city.rc.quality()));   // the battery saver switched: the phone-safe caps follow   // OLYMPUS theme: the sky / fog follow it (scene.js setDay)
    O?.mode(this.quality === 'lq');
    this.orbit = new Orbit(this.city.camera, $('#c'), {
      calm: this.calm, radius: Math.max(150, Math.min(560, Math.max((this.L.bounds.x1 - this.L.bounds.x0) * 0.5, (this.L.worldRadius || 0) * 0.88))),
      onTap: (x, y) => this.tap(x, y), onFlyEnd: () => { this.endTour(); this.endCam(); },
    });
    this.index = new Map();
    this.L.items.forEach((it, i) => { if (it.b?.id && (!this.index.has(it.b.id) || it.kind !== 'd')) this.index.set(it.b.id, i); });
    let w = [];
    try { w = JSON.parse(settings.get('dc.watch', '[]')); } catch (e) { w = []; }
    this.watch = new Set(Array.isArray(w) ? w.filter((x) => typeof x === 'string').slice(0, 64) : []);
    this.todayOn = settings.get('dc.today', '0') === '1';
    this.keep = null;
    this.selected = -1;
    this.minimap = new Minimap($('#mini'), this.L, (x, z, d) => (d ? this.openDistrict(d) : this.orbit.focus(x, 0, z, 90)));
    this.minimap.fit(this.city.R);
    this.minimap.gold = this.L.items.filter((it) => it.kind === 'b' && it.b.cls === 'gold').map((it) => [it.x, it.z]);
    // v3 state: the council, matches of a search, compare, the timeline, switches, fireworks
    this.cou = council(model);
    this.matches = []; this.mi = -1; this.filtering = false; this.cmp = null; this.compareA = null;
    this.flashes = []; this.ambient = 40;
    this.years = yearsOf(model);
    this.tl = { on: false, years: this.years, year: this.years[this.years.length - 1], playing: false, acc: 0, stat: '' };
    this.rich = new Map(this.L.items.map((it, i) => [i, it]).filter(([, it]) => (it.kind === 'b' || it.kind === 'd') && it.b?.yrs));
    this.access = { calm: settings.get('dc.calm', this.calm ? '1' : '0') === '1', lite: this.quality === 'lq', big: settings.get('dc.big', '0') === '1',
                    contrast: settings.get('dc.hc', '0') === '1' };
    this.calm = this.access.calm;
    this.photoUrl = null; this.photoBlob = null;
    this.lit = null; this.demo = demo;
    Object.assign(state, { mode: demo ? 'demo' : 'live', buildings: this.L.items.filter((it) => it.kind === 'b').length, items: this.L.items.length,
                           quality: this.quality, districts: this.L.districts.map((d) => d.key), tiles: this.L.tiles.length, blocks: this.L.blocks.length });
    state.stats = () => this.stats();
    state.applyTheme = (t) => applyTheme(t, this.city);
    UI.hud(model, demo);
    this.wire();
    this.applyAccess(true);
    state.v3 = { families: this.cou.rows.length, council: this.cou.text, rich: this.rich.size, matches: 0, compare: null, timeline: { on: false, year: this.tl.year }, photo: { on: false, taken: 0, bytes: 0 },
                 fireworks: () => this.city.fireworks.active, kit: () => this.city.kit.active(), access: this.access, goldFresh: 0, celebrations: 0 };
    this.applyStates();
    this.setToday(this.todayOn, true);
    this.applySky(true);
    if (!NEON) watchTheme((t) => applyTheme(t, this.city));   // the neon look keeps its own night palette (the kit's looks are AGORA-family)
    document.fonts?.ready?.then(() => this.city.refreshText()).catch(() => {});
    $('#qB').textContent = this.quality.toUpperCase();
  }

  // -- the per-building state (search dim, Today, watch / selected): written when it changes, never per frame
  applyStates() {
    const items = this.L.items, keep = this.keep;
    this.city.skyline.apply(keep ? (i) => !keep[i] : null, (i) => items[i].b?.td || 0,
      (i) => (i === this.selected ? 2 : this.watch.has(items[i].b?.id) ? 1 : 0));
    const pins = [...this.watch].map((id) => this.index.get(id)).filter((i) => i !== undefined);
    this.city.setPins(pins);
    this.minimap.pins = pins.map((i) => [items[i].x, items[i].z]);
    state.today.lit = items.filter((it) => it.kind === 'b' && it.b.td).length;
    state.watch = pins.length;
  }

  setToday(on, quiet) {
    this.todayOn = on;
    this.city.setToday(on);
    state.today.on = on;
    if (!quiet) { settings.set('dc.today', on ? '1' : '0'); UI.toast(on ? `Today layer: ${state.today.lit.toLocaleString()} buildings true on ${this.model.today?.day || 'the last session'}` : 'Today layer off'); }
    return on;
  }

  // -- the sky (market clock) and the weather (VIX)
  clock() {
    if (this.tour?.info.on) {                                    // the tour runs one futures day in time-lapse
      const k = (this.tour.i + Math.min(1, this.tour.t / 8)) / Math.max(1, this.tour.list.length);
      return { mod: (k * 1440) % 1440, mins: (k * 1440 + 1080) % 1440, dow: 2, label: 'time-lapse' };
    }
    if (this.skyMode === 'night') return { mod: 1380, mins: 1020, dow: 2, label: 'night' };
    if (this.skyMode === 'day') return { mod: 930, mins: 570, dow: 2, label: 'day' };
    return etClock(new Date());
  }

  applySky(force) {
    const c = this.clock(), sun = sunOf(c), w = this.wxOn ? this.weather : weatherOf(14);
    const theme = this.city.setSun(sun, w);
    if (force || this._theme !== theme) { this._theme = theme; document.querySelector('meta[name=theme-color]').setAttribute('content', theme); }
    const txt = `${c.label} · ${sun.session}${this.wxOn ? ` · VIX ${w.vix.toFixed(1)} ${w.sky}` : ''}`;
    if (this._clockTxt !== txt) { this._clockTxt = txt; $('#clock').textContent = txt; }
    state.sky = { mode: this.skyMode, elev: +sun.elev.toFixed(3), day: +sun.day.toFixed(3), session: sun.session };
    state.weather = { sky: w.sky, rain: w.rain, vix: w.vix, on: this.wxOn };
    $('#skyB').classList.toggle('on', this.skyMode !== 'live');
    $('#skyB').setAttribute('aria-label', `Sky: ${this.skyMode === 'live' ? 'market clock' : this.skyMode}`);
    $('#wxB').classList.toggle('on', this.wxOn);
  }

  // -- opening things
  openId(id) { const i = this.index.get(id); if (i !== undefined) this.open(i); }

  open(i, quiet) {
    const it = this.L.items[i];
    if (!it) return;
    const b = it.b, sec = this.L.districts[it.d];
    if (this.compareA && it.kind === 'b' && b.id !== this.compareA && this.model.byId.get(this.compareA)) { this.openCompare(this.compareA, b.id); return; }
    const ctx = { label: labelOf(b, this.model.D), district: sec?.name, watched: this.watch.has(b.id), monument: it.kind === 'd',
                  onWatch: () => this.toggleWatch(b.id),
                  onCompare: it.kind === 'b' || it.kind === 'd' ? () => this.setCompare(b.id) : null, comparing: this.compareA === b.id };
    if (it.kind === 's') UI.showStrategy(b);
    else if (it.kind === 'ship') UI.showShip(b);
    else if (b.plugin) UI.showPlugin(b, sec, ctx);
    else UI.showBuilding(b, ctx);
    this.selected = i;
    this.applyStates();
    this.city.beam.show(it.x, it.z, it.h, it.color);
    this.setTag(it, labelOf(b, this.model.D));
    this.announce(`${labelOf(b, this.model.D)}: ${money(b.e)} per trade per micro, ${b.cls || 'unrated'}, holds in ${({ both: 'both periods', one: 'one period', none: 'neither period' })[holdOf(b)]}`);
    if (!quiet && b.cls === 'gold') this.celebrate(i, 1);
    if (!quiet) this.orbit.focus(it.x, Math.min(it.h * 0.5, 6), it.z, 34 + it.h * 2);
    try { history.replaceState(null, '', '#b=' + encodeURIComponent(b.id)); } catch (e) { /* file:// */ }
  }

  openLit() {
    UI.showLit(this.model.lit);
    this.city.beam.show(0, 0, 50, (NEON ? 0x3fd8ff : 0xd39556));
    this.orbit.focus(0, 16, 0, 90);
  }

  /** Tap-to-zoom: the camera hops over to a district (or to a point in it: a far block, a tapped street) and the sheet
   *  shows what lives there. */
  openDistrict(d, at) {
    if (at) this.orbit.focus(at.x, 0, at.z, at.r, 0.85);
    else this.orbit.focus(d.cx, 0, d.cz, Math.max(70, (d.wide ? d.w * 0.5 : d.half) * 2.3), 0.9);
    const best = this.L.items.map((it, i) => [it, i]).filter(([it]) => this.L.districts[it.d] === d && it.kind !== 'ship')
      .sort((a, b) => clsRank(a[0].b.cls) - clsRank(b[0].b.cls) || (b[0].b.e || 0) - (a[0].b.e || 0)).slice(0, 8);
    UI.showDistrict(d, (body) => {
      if (!best.length) return;
      body.appendChild(el('h3', null, 'Tallest honest buildings here'));
      const ul = el('ul', 'list');
      for (const [it, i] of best) {
        const li = el('li');
        const k = el('span', 'k', ''); k.style.background = '#' + it.color.toString(16).padStart(6, '0');
        const t = el('span', 't'); t.appendChild(el('div', null, labelOf(it.b, this.model.D)));
        li.append(k, t, el('span', 'm ' + ((it.b.e || 0) >= 0 ? 'pos' : 'neg'), money(it.b.e)));
        li.addEventListener('click', () => this.open(i));
        ul.appendChild(li);
      }
      body.appendChild(ul);
    });
    try { history.replaceState(null, '', '#d=' + encodeURIComponent(d.key)); } catch (e) { /* file:// */ }
    state.district = d.key;
  }

  tap(x, y) {
    const hit = this.city.pick(x, y);
    if (hit?.lit) this.openLit();
    else if (hit?.landmark) this.openLandmark(hit.landmark);
    else if (hit?.item !== undefined) this.open(hit.item);
    else if (hit?.block !== undefined) {
      const B = this.L.blocks[hit.block];
      this.openDistrict(this.L.districts[B.d], { x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2, r: 46 });
    } else {                                                    // a street or an empty lot: zoom to its district, if any
      const g = this.city.groundAt(x, y), d = g && this.L.districts.find((q) => Math.abs(q.cx - g.x) <= (q.wide ? q.w / 2 : q.half) && Math.abs(q.cz - g.z) <= q.half);
      if (d && (UI.sheet.view !== 'district' || state.district !== d.key)) this.openDistrict(d, { x: g.x, z: g.z, r: 70 });
      else UI.sheet.close();
    }
  }

  // -- the tag over a tapped building (its name and result, riding on the building until the card closes)
  setTag(it, label) {
    const t = $('#tag');
    if (!it || !t) { this.tagAt = null; if (t) t.style.display = 'none'; return; }
    const b = it.b || {};
    t.replaceChildren(el('b', null, label || b.lab || b.id || ''), el('span', null,
      it.kind === 'ship' ? `${money(b.pnl)} · ${b.R >= 0 ? '+' : ''}${num(b.R, 2)}R` : it.kind === 's' ? 'strategy tower'
      : `${money(b.e)}/trade/micro · ${b.cls || ''}${b.n ? ' · ' + b.n.toLocaleString() + ' trades' : ''}`));
    this.tagAt = { it, v: new THREE.Vector3() };
    state.tag = label || b.id || '';
  }

  updateTag() {
    const k = this.tagAt, t = $('#tag');
    if (!k || !t) return;
    k.v.set(k.it.x, k.it.h + 1.5, k.it.z).project(this.city.camera);
    if (k.v.z > 1 || k.v.z < -1) { t.style.display = 'none'; return; }
    const W = innerWidth, H = innerHeight, w = t.offsetWidth || 120;
    const x = Math.max(8, Math.min(W - w - 90, (k.v.x * 0.5 + 0.5) * W - w / 2)), y = Math.max(96, Math.min(H - 190, (-k.v.y * 0.5 + 0.5) * H - 46));
    t.style.display = 'block';
    t.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
  }

  // -- the landmarks: tap one for its card (real numbers from the model), the camera glides there
  landmarkInfo(key) {
    const m = this.model, g = m.guard || {}, lit = m.lit?.spans?.['2026'], S = this.city.lm.spots[key];
    if (key === 'temple') {
      const gold = m.buildings.filter((b) => b.cls === 'gold').sort((a, c) => (c.e || 0) - (a.e || 0));
      return { name: 'Temple of the Gold', kind: 'landmark', blurb: 'The acropolis: the few combinations that hold in 2026, in 2021-25 and in every year, and pass the false-discovery guard. The hologram turns over the roof, the beam reaches into the sky.',
        tiles: [['gold buildings', String(gold.length)], ['pass FDR', String(g.fdr_pos ?? '–')], ['placebo passes', String(g.placebo_fdr ?? '–')], ['discoveries', String((m.discoveries || []).length)]],
        lines: gold.slice(0, 3).map((b) => `${labelOf(b, m.D)}: ${money(b.e)} per trade per micro`) };
    }
    if (key === 'forum') {
      const c = g.classes || {};
      return { name: 'The Forum', kind: 'landmark', blurb: 'The colonnade round the plaza: every claim in the city is tested in the open here. The gaps in the columns are the boulevards to the districts.',
        tiles: [['tried', (g.tried || 0).toLocaleString()], ['tested (30+ trades)', (g.tested || 0).toLocaleString()], ['gold / green', `${c.gold ?? '–'} / ${c.green ?? '–'}`], ['grey (noise)', (c.grey ?? 0).toLocaleString()]],
        lines: [`Picked on 2021-24 only, ${g.holdout?.picked_2021_24 ?? '–'} combinations; ${g.holdout?.pct_positive ?? '–'}% stayed positive in 2025-26. Most of the city is noise, and the city says so.`] };
    }
    if (key === 'pharos') {
      const ships = this.L.items.filter((it) => it.kind === 'ship').map((it) => it.b), won = ships.filter((x) => x.pnl >= 0).length, net = ships.reduce((a, x) => a + (x.pnl || 0), 0);
      return { name: 'Pharos lighthouse', kind: 'landmark', blurb: 'The harbor\'s lighthouse: its beams sweep the water where one ship per LIT trade is moored (the live settings replayed, costs in; paper, not broker fills).',
        tiles: [['ships (trades)', ships.length.toLocaleString()], ['won', ships.length ? pct((100 * won) / ships.length) : '–'], ['net', money(net)], ['2026 PF', num(lit?.pf, 2)]],
        go: { label: 'Fly to the Harbor', fn: () => { const d = this.L.districts.find((q) => q.kind === 'harbor'); if (d) this.openDistrict(d); } } };
    }
    if (key === 'poseidon') {
      const w = m.weather || {}, v = this.weather;
      return { name: 'Gate of Poseidon', kind: 'weather gate', blurb: 'The trident\'s lantern is the weather: cyan under VIX 15, amber to 20, blue to 25, red above (it pulses faster as the VIX rises). The city\'s rain and storms follow the same number.',
        tiles: [['VIX', num(w.vix ?? v.vix, 1)], ['VXN', num(w.vxn, 1)], ['VIX3M', num(w.vix3m, 1)], ['sky', v.sky]],
        lines: [`CBOE closes${w.vix_date ? ': VIX ' + w.vix_date : ''}${w.source ? ' · ' + w.source : ''}.`] };
    }
    return { name: S?.name || key, kind: 'landmark', blurb: '' };
  }

  openLandmark(key) {
    state.landmark = key;
    if (key.startsWith('gate:')) {
      const d = this.L.districts.find((q) => q.key === key.slice(5));
      if (d) this.openDistrict(d);
      return;
    }
    const S = this.city.lm.spots[key];
    if (!S) return;
    UI.showLandmark(this.landmarkInfo(key));
    this.setTag(null);
    this.orbit.focus(S.x, Math.min(S.h * 0.4, 24), S.z, S.r * 1.7, 0.95);
    try { history.replaceState(null, '', '#l=' + key); } catch (e) { /* file:// */ }
  }

  // -- the fly-through cameras (fly.js): the manual orbit is the fourth
  startCam(mode) {
    if (mode === 'orbit') { this.orbit.stopFly(); this.endCam(); return; }
    if (this.tour) this.orbit.stopFly();
    const cam = this.city.camera, dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const from = { pos: cam.position.clone(), look: cam.position.clone().add(dir.multiplyScalar(70)) };
    const f = mode === 'walk' ? walker(this.L, from) : flight(mode, this.L, this.city.lm.spots, from);
    if (!f) return;
    this.orbit.drive((dt) => f.step(dt));
    if (mode === 'walk') this.orbit.steer = (dx, dy) => f.steer(dx, dy);
    this.cam = { mode, f, lm: null };
    state.cam = { mode, on: true };
    UI.sheet.close();
    UI.caption(MODES.find((x) => x.key === mode).hint + (mode === 'walk' ? ' · pinch to stop' : ' · drag to take over'), 0, 0, mode.toUpperCase());
    this.camButtons();
  }

  endCam() {
    if (!this.cam) { this.camButtons(); return; }
    this.cam = null;
    state.cam = { mode: 'orbit', on: false };
    UI.caption('');
    this.camButtons();
  }

  camButtons() {
    const cur = this.cam?.mode || 'orbit';
    document.querySelectorAll('#cams [data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === cur));
  }

  updateCam() {
    const c = this.cam;
    if (!c) return;
    const i = c.f.info();
    state.cam = { ...state.cam, ...i };
    if (c.mode === 'grand' && i.landmark && i.landmark !== c.lm) {
      c.lm = i.landmark;
      UI.caption(this.landmarkInfo(i.landmark).blurb, 0, 0, (this.city.lm.spots[i.landmark]?.name || '').toUpperCase());
    }
  }

  toggleWatch(id) {
    if (this.watch.has(id)) this.watch.delete(id); else if (this.watch.size < 64) this.watch.add(id);
    settings.set('dc.watch', JSON.stringify([...this.watch]));
    this.applyStates();
    if (UI.sheet.isOpen('watch')) this.showView('watch');
    return this.watch.has(id);
  }

  // -- accessibility
  announce(text) { const e = $('#sr'); if (e) e.textContent = text; }

  applyAccess(first) {
    const a = this.access;
    document.body.classList.toggle('bigtext', a.big);
    document.body.classList.toggle('hc', a.contrast);
    this.calm = a.calm;
    this.city.setCalm(a.calm);
    this.orbit.opts.calm = a.calm;
    if (!first) { settings.set('dc.calm', a.calm ? '1' : '0'); settings.set('dc.big', a.big ? '1' : '0'); settings.set('dc.hc', a.contrast ? '1' : '0'); }
    a.lite = this.quality === 'lq';
    state.v3 && (state.v3.access = { ...a });
  }

  speak() {
    const g = this.model.guard || {}, gold = this.L.items.filter((it) => it.kind === 'b' && it.b.cls === 'gold').length;
    const t = `Data City. ${(g.tried || 0).toLocaleString()} ideas tried, ${(g.tested || 0).toLocaleString()} tested, ${g.fdr_pos ?? 0} survive the noise guard, ${gold} are gold. ${this.cou.text} `
      + `The sky shows ${this.clock().label}; the weather is VIX ${this.weather.vix.toFixed(1)}, ${this.weather.sky}.`;
    this.announce(t);
    UI.toast('Reading out the city');
    return t;
  }

  // -- the sheet's views
  showView(name) {
    const m = this.model;
    if (name === 'top') UI.sheet.open('top', 'Top 10: what holds in 2026 and 2021-25', (b) => UI.viewTop(b, m, (id) => this.openId(id)));
    else if (name === 'today') {
      if (!this.todayOn) this.setToday(true);
      const app = this;
      UI.sheet.open('today', "Today's city", (b) => UI.viewToday(b, m, (id) => this.openId(id), { get on() { return app.todayOn; }, toggle: () => app.setToday(!app.todayOn) }));
    } else if (name === 'watch') {
      const list = [...this.watch].map((id) => m.byId.get(id)).filter(Boolean).map((b) => ({ b, label: labelOf(b, m.D) }));
      UI.sheet.open('watch', `Watchlist (${list.length})`, (b) => UI.viewWatch(b, list, (id) => this.openId(id), (id) => this.toggleWatch(id)));
    } else if (name === 'find') {
      UI.sheet.open('find', 'Search the city', (b) => { this.findUI = UI.viewFind(b, m.sections, (q, st) => this.find(q, st), { fly: () => this.flyToMatches(), next: () => this.nextMatch(), reset: () => this.resetFind(), districts: () => this.showView('districts') }); });
      this.find('', this.findUI.state);
      setTimeout(() => this.findUI?.q.focus({ preventScroll: true }), 50);
    } else if (name === 'districts') UI.sheet.open('districts', 'All districts', (b) => UI.viewDistricts(b, this.L.districts, m.sections, (d) => this.openDistrict(d)));
    else if (name === 'read') UI.sheet.open('read', 'How to read the city', (b) => UI.viewRead(b, m));
    else if (name === 'menu') UI.sheet.open('menu', 'The city', (b) => PN.viewMenu(b, this.menuItems()));
    else if (name === 'now') {
      const card = this.nowCard();
      UI.sheet.open('now', 'What is moving the market now', (b) => PN.viewNow(b, card, {
        district: (r) => { const d = this.L.districts.find((q) => q.key === r.key); if (d) this.openDistrict(d); },
        idea: (r) => { if (r?.id) this.openId(r.id); else UI.toast('The demo sample has no building to open'); },
        today: () => { this.setToday(true); UI.toast('Today layer: the ideas that fired are lit'); },
        report: () => this.showView('report') }));
      this.loadLit();
      this.announce(card.text);
    }
    else if (name === 'report') {
      UI.sheet.open('report', 'City report', (b) => PN.viewReport(b, m, this.cou, {
        family: (k) => { this.showView('find'); this.findUI.state.family = k; this.findUI.q.value = ''; this.find('', this.findUI.state); this.findUI.state.family = k; document.querySelectorAll('#fseg button').forEach((x) => x.classList.toggle('on', x.dataset.v === k)); this.flyToMatches(); },
        top: () => this.showView('top'), share: () => this.enterPhoto(), celebrate: () => this.celebrateGold(), gods: this.gods(),
      }));
    } else if (name === 'timeline') {
      this.tlStart();
      UI.sheet.open('timeline', 'How the city grew', (b) => PN.viewTimeline(b, m, this.tl, ));
      this.setYear(this.tl.year);
    } else if (name === 'access') UI.sheet.open('access', 'Accessibility', (b) => PN.viewAccess(b, this.access, {
      calm: (on) => { this.access.calm = on; this.applyAccess(); return on; },
      lite: (on) => { this.setQuality(on ? 'lq' : 'hq'); this.access.lite = on; return on; },
      big: (on) => { this.access.big = on; this.applyAccess(); return on; },
      contrast: (on) => { this.access.contrast = on; this.applyAccess(); return on; },
      speak: () => this.speak() }));
    else if (name === 'compare') { if (this.cmp) this.openCompare(this.cmp.a, this.cmp.b); else UI.toast('Open an idea, tap Compare, then tap a second building'); }
  }

  /** today's LIT levels from the dashboard's published data.json (read-only, optional: a missing file leaves the card on the city's own numbers) */
  loadLit() {
    if (this.demo || this._litP) return this._litP;
    this._litP = fetch('../data.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { this.lit = parseLit(j); if (UI.sheet.isOpen('now')) this.showView('now'); return this.lit; }).catch(() => null);
    return this._litP;
  }

  /** "what is moving the market right now": the first thing the city says */
  nowCard() {
    const card = marketNow(this.model, this.lit, { demo: this.demo, label: (b) => labelOf(b, this.model.D) });
    if (state.v3) state.v3.now = { rows: card.rows.map((r) => ({ key: r.key, name: r.name, fired: r.fired, mnq: r.mnq, nq: r.nq, lit: r.lit.ok, litText: r.lit.text })), demo: card.demo, fallback: card.fallback, sample: card.sample, litLive: card.litLive };
    return card;
  }

  /** the Council of the Gods (Pantheon) next door, when the site has it: the market mood, context only */
  gods() {
    this._gods ||= fetch('../pantheon/pantheon.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return this._gods;
  }

  menuItems() {
    const go = (fn) => () => fn();
    return [
      { key: 'now', title: 'Market now', sub: 'What is moving the market, in dollars, and what matches LIT', fn: go(() => this.showView('now')) },
      { key: 'report', title: 'City report', sub: 'What was tested, who survives, what the Council of ideas says', fn: go(() => this.showView('report')) },
      { key: 'districts', title: 'All districts', sub: 'By hour, setup, weekday, month and mood, with search', fn: go(() => this.showView('districts')) },
      { key: 'compare', title: 'Compare two ideas', sub: 'Open an idea, tap Compare, tap a second building', fn: go(() => { UI.sheet.close(); UI.toast('Tap a building, then Compare, then a second building'); }) },
      { key: 'timeline', title: 'How it grew', sub: 'Watch the city rise year by year', fn: go(() => this.showView('timeline')) },
      { key: 'fireworks', title: 'Fireworks', sub: 'Celebrate the gold ideas', fn: go(() => this.celebrateGold()) },
      { key: 'photo', title: 'Photo mode', sub: 'Hide the buttons, take a picture, share it', fn: go(() => this.enterPhoto()) },
      { key: 'tour', title: 'Cinematic tour', sub: 'A guided flight with captions', fn: go(() => this.startTour()) },
      { key: 'access', title: 'Accessibility', sub: 'Calm motion, LITE, big text, contrast, read-out', fn: go(() => this.showView('access')) },
      { key: 'read', title: 'How to read it', sub: 'Heights, colours, windows, building types', fn: go(() => this.showView('read')) },
      { key: 'look', title: NEON ? 'Look: Marble' : 'Look: Neon night', sub: NEON ? 'Switch to the calm marble and bronze city (AGORA)' : 'Back to the techy neon night city (the default)',
        fn: go(() => setLook(LOOK === 'neon' ? 'agora' : 'neon')) },
    ];
  }

  route() {
    const h = decodeURIComponent(location.hash || '');
    if (['#top', '#today', '#watch', '#find', '#read', '#menu', '#report', '#timeline', '#access', '#compare', '#now'].includes(h)) this.showView(h.slice(1));
    else if (h === '#photo') this.enterPhoto();
    else if (h === '#fireworks') this.celebrateGold();
    else if (h === '#discoveries') this.showView('today');
    else if (h === '#tour') this.startTour();
    else if (h.startsWith('#b=')) this.openId(h.slice(3));
    else if (h.startsWith('#l=')) this.openLandmark(h.slice(3));
    else if (h.startsWith('#cam=') && MODES.some((x) => x.key === h.slice(5))) this.startCam(h.slice(5));
    else if (h.startsWith('#d=')) { const d = this.L.districts.find((x) => x.key === h.slice(3)); if (d) this.openDistrict(d); }
  }

  // -- the tour
  startTour() {
    UI.sheet.close();
    this.todayBefore = this.todayOn;
    this.tour = new Tour(shots(this.model, this.L), THREE.Vector3, {
      onCaption: (t, i, n) => UI.caption(t, i, n),
      onShot: (s) => { this.setToday(s.today ? true : this.todayBefore, true); if (s.fireworks) this.celebrateGold(true); },
      onEnd: () => {},
    });
    const cam = this.city.camera, look = new THREE.Vector3();
    cam.getWorldDirection(look);
    this.tour.start(cam.position, cam.position.clone().add(look.multiplyScalar(80)));
    const speed = Math.max(1, Math.min(50, +P.get('tourSpeed') || 1));            // tests fast-forward the tour
    this.orbit.drive((dt) => this.tour?.step(dt * speed) ?? null);
    $('#tourB').classList.add('on');
    document.body.classList.add('cine');
  }

  endTour() {
    if (!this.tour) return;
    this.tour.stop();
    this.tour = null;
    UI.caption('');
    this.setToday(this.todayBefore, true);
    $('#tourB').classList.remove('on');
    document.body.classList.remove('cine');
    state.tour = { on: false, step: -1, steps: 0, caption: '', done: (state.tour.done || 0) + 1, last: state.tour.step };
  }

  // -- switches
  /** the render core changed tier (OLYMPUS choice or the core's own step-down): the page follows */
  onTier(q) {
    this.quality = q;
    state.quality = q;
    O?.mode(q === 'lq');
    $('#qB').textContent = q.toUpperCase();
  }

  setQuality(q, auto) {
    this.quality = q;
    state.quality = q;
    if (!auto) { if (O) O.setFx(q === 'hq' ? 'high' : 'low'); else settings.set('dc.q', q); }
    this.city.setQuality(q);
    O?.mode(q === 'lq');
    $('#qB').textContent = q.toUpperCase();
    if (auto) UI.toast('LITE mode on for a smoother city (tap LQ to switch back)');
  }

  wire() {
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.tab;
      if (UI.sheet.isOpen(v)) { UI.sheet.close(); return; }
      this.showView(v);
    }));
    UI.sheet.onLeave = (from) => {
      if (from === 'timeline') this.tlStop();
      if (from === 'compare') { this.city.link.hide(); this.cmp = null; state.v3.compare = null; }
    };
    $('#menuB').addEventListener('click', () => { if (UI.sheet.isOpen('menu')) UI.sheet.close(); else this.showView('menu'); });
    UI.sheet.onClose = () => {
      this.compareA = null;
      this.setTag(null);
      if (this.keep) this.resetFind();
      this.selected = -1;
      this.applyStates();
      this.city.beam.hide();
    };
    $('#sheetX').addEventListener('click', () => UI.sheet.close());
    document.querySelectorAll('#cams [data-cam]').forEach((b) => b.addEventListener('click', () => this.startCam(b.dataset.cam)));
    $('#tourB').addEventListener('click', () => (this.tour ? this.orbit.stopFly() : this.startTour()));
    $('#skyB').addEventListener('click', () => {
      this.skyMode = SKY_MODES[(SKY_MODES.indexOf(this.skyMode) + 1) % SKY_MODES.length];
      settings.set('dc.sky', this.skyMode);
      this.applySky(true);
      UI.toast({ live: 'Sky: the futures clock (sunrise at the Asia open)', night: 'Sky: night', day: 'Sky: day' }[this.skyMode]);
    });
    $('#wxB').addEventListener('click', () => {
      this.wxOn = !this.wxOn;
      settings.set('dc.wx', this.wxOn ? '1' : '0');
      this.applySky(true);
      UI.toast(this.wxOn ? `Weather from the VIX: ${this.weather.vix.toFixed(1)} = ${this.weather.sky}${this.model.weather?.vix_date ? ` (CBOE close ${this.model.weather.vix_date})` : ''}` : 'Weather off: a clear sky');
    });
    $('#qB').addEventListener('click', () => this.setQuality(this.quality === 'hq' ? 'lq' : 'hq'));
    window.addEventListener('resize', () => this.city.resize());
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { UI.sheet.close(); if (this.tour) this.orbit.stopFly(); if (document.body.classList.contains('photo')) this.exitPhoto(); return; }
      const tg = e.target?.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const g = this.orbit.goal, k = e.key.toLowerCase();
      this.orbit._touched();
      if (k === 'arrowleft') g.theta -= 0.12; else if (k === 'arrowright') g.theta += 0.12;
      else if (k === 'arrowup') g.phi -= 0.08; else if (k === 'arrowdown') g.phi += 0.08;
      else if (k === '+' || k === '=') g.radius *= 0.85; else if (k === '-' || k === '_') g.radius *= 1.18;
      else if (k === 'f') this.flyToMatches(); else if (k === 'n') this.nextMatch();
      else if (k === 'p') (document.body.classList.contains('photo') ? this.exitPhoto() : this.enterPhoto());
      else if (k === 'm') this.showView('menu');
      else return;
      this.orbit._clamp();
      e.preventDefault();
    });
  }

  stats() {
    const i = this.city.renderer.info;
    return { calls: this.lastCalls ?? i.render.calls, triangles: this.lastTris ?? i.render.triangles, points: i.render.points,
             geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length,
             pixelRatio: this.city.renderer.getPixelRatio(), lod: this.city.skyline.info(), frames: state.frames };
  }

  // -- the frame loop (with the automatic low-quality switch)
  start() {
    let last = performance.now(), frames = 0, acc = 0, slow = 0, skyT = 0;
    const frame = (now) => {
      if (this.contextLost) return; // one queued callback may remain after WebGL goes away
      requestAnimationFrame(frame);
      try {
        if (O ? O.hidden() : document.hidden) { last = now; return; }          // hidden tab: no frame at all
        const gap = O?.frameGap ? O.frameGap() : 0;                            // the kit's idle cap (30 fps idle on high, 15 on low, 2 on off; 30 in battery saver)
        if (gap && now - last < gap - 3) return;
        if (this.quality === 'lq' && now - last < 28) return;                  // LITE draws at 30 fps (half the work, half the heat)
        const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        this.orbit.update(dt);
        this.stepFlashes(dt);
        this.stepTimeline(dt);
        if (!this.calm && this.quality === 'hq' && !this.tour && !document.body.classList.contains('photo')) {          // now and then a shell over the temple
          this.ambient -= dt;
          if (this.ambient <= 0) {
            this.ambient = 55;
            const g = this.minimap.gold, p = g.length ? g[Math.floor(Math.random() * g.length)] : null;
            if (p) this.city.fireworks.launch(p[0], 70 + Math.random() * 30, p[1], (NEON ? 0xffc94a : 0xd39556));
          }
        }
        skyT += dt;
        if (skyT > (this.tour ? 0.05 : 1)) { skyT = 0; this.applySky(); }
        this.updateCam();
        this.city.render(dt);
        this.firstFrame = true;
        this.updateTag();
        const info = this.city.renderer.info.render;
        this.lastCalls = info.calls; this.lastTris = info.triangles;
        this.minimap.draw(this.city.camera, this.tour || this.cam ? this.orbit.at : this.orbit.view.target, dt);
        if (this.tour) state.tour = { ...state.tour, ...this.tour.info };
        state.beam = !!this.city.beam.at;
        state.frames++;
        frames++; acc += dt;
        if (acc >= 1) {
          state.fps = Math.round(frames / acc);
          frames = 0; acc = 0;
          slow = this.quality === 'hq' && state.fps < LQ_FPS ? slow + 1 : 0;
          if (slow >= 3 && (O ? !O.chosen() : settings.get('dc.q', null) === null) && !P.has('nolite')) this.setQuality('lq', true);
        }
      } catch (error) { this.onRenderFailure?.(error); }
    };
    requestAnimationFrame(frame);
    this.route();
    if (!location.hash && !P.has('nonow')) this.showView('now');           // first open: the money question first (?nonow=1 skips it)
    // olympus2 (lead QA: "the sheet covers 2/3 of the screen"): the first, automatic open is a small peek over the city; a tap or a scroll in it
    // opens it fully, any other view opens normally
    if (!location.hash && !P.has('nonow') && innerWidth < 700) {
      const sh = document.getElementById('sheet');
      if (sh) { sh.classList.add('peek'); const full = () => sh.classList.remove('peek'); sh.addEventListener('pointerdown', full, { once: true }); sh.addEventListener('wheel', full, { once: true, passive: true }); }
    }
    this.checkGold();
  }
}

async function postCard() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ jarvis: 1, href: location.href, card: await getJSON('./jarvis.json') }, location.origin);
  } catch (e) { /* no card: Jarvis reads jarvis.json itself */ }
}

/** One exit from a failed 3D renderer to the readable research view. */
// the actions kept in city-acts.js (search, compare, gold, timeline, photo) are App methods like any other
useState(state);
for (const k of Object.getOwnPropertyNames(Acts.prototype)) if (k !== 'constructor') App.prototype[k] = Acts.prototype[k];

function failCity(app, fallback, reason) {
  if (app.contextLost) return;
  app.contextLost = true;
  fallback(reason);
}

/** Give a visible, uncovered page five seconds for its first 3D frame, then use the map. */
function watchFirstFrame(app, fallback, {
  doc = document, clock = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
  covered = () => O?.covered?.() === true,
} = {}) {
  let visibleSince = null, timer = null, done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (timer !== null) cancel(timer);
    doc.removeEventListener('visibilitychange', check);
  };
  const check = () => {
    if (done) return;
    if (app.contextLost || app.firstFrame) { finish(); return; }
    if (timer !== null) { cancel(timer); timer = null; }
    if (doc.hidden === true || doc.visibilityState === 'hidden') {
      visibleSince = null; // wait for the browser's visibilitychange; no background timer
      return;
    }
    if (covered()) {
      visibleSince = null; // the parent may uncover without a visibilitychange event
      timer = schedule(check, 500);
      return;
    }
    const now = clock();
    if (visibleSince === null) visibleSince = now;
    const remaining = 5000 - (now - visibleSince);
    if (remaining <= 0) {
      finish();
      failCity(app, fallback, new Error('The 3D city did not draw its first frame'));
      return;
    }
    timer = schedule(check, Math.min(500, remaining));
  };
  doc.addEventListener('visibilitychange', check);
  check();
}

/** After a lost GPU context, render stops and the data remains explorable. */
function watchContextLoss(canvas, app, fallback) {
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    failCity(app, fallback, new Error('WebGL context lost'));
  });
  // olympus2 (iOS drops the GPU context under memory pressure, e.g. a long drag): when Safari gives it back, the whole city is built again
  canvas.addEventListener('webglcontextrestored', () => { try { location.reload(); } catch (e) { /* the readable view stays */ } });
}

/** A usable, read-only data view when WebGL or the render core cannot start. */
function readableFallback(model, demo, reason) {
  $('#loading')?.remove();
  document.body.classList.add('data-fallback');
  const css = document.createElement('style');
  css.textContent = `
    body.data-fallback{height:auto;min-height:100%;overflow:auto;touch-action:pan-y;background:#${NEON ? '080c1b' : '15120e'};color:#${NEON ? 'f5f4fb' : 'dccfb2'}}
    .data-fallback #c,.data-fallback .top,.data-fallback .dock,.data-fallback .mini,.data-fallback .sheet,
    .data-fallback .cams,.data-fallback .caption,.data-fallback .toast{display:none!important}
    .readable-city{position:relative;z-index:2;max-width:760px;margin:auto;padding:calc(24px + env(safe-area-inset-top,0px)) 18px calc(48px + env(safe-area-inset-bottom,0px));font:500 15px/1.5 system-ui,sans-serif}
    .readable-city .city-network{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 18px;padding:9px;border:1px solid #${NEON ? '354267' : '5f4e3d'};border-radius:16px;background:linear-gradient(130deg,#${NEON ? '10152a' : '231d17'},#${NEON ? '101b2f' : '262019'} 55%,#${NEON ? '1c192c' : '2a231b'});box-shadow:0 8px 28px #${NEON ? '02040b80' : '08070580'}}
    .readable-city .city-network-label{grid-column:1/-1;color:#${NEON ? '9da9c7' : 'c3b5a1'};font:800 10px/1.2 system-ui;letter-spacing:${NEON ? '.16' : ' .05'}em;text-transform:uppercase}
    .readable-city .city-network a{display:grid;place-items:center;min-height:44px;padding:4px;border:1px solid #${NEON ? '3b4666' : '62543f'};border-radius:11px;background:#${NEON ? '0d1221' : '1c1712'};color:#${NEON ? 'c5c9d9' : 'd9d1c5'};text-decoration:none;font:800 10px/1.2 system-ui;letter-spacing:${NEON ? '.1' : ' .05'}em}
    .readable-city .city-network a[aria-current=page]{border-color:#7d6a44;background:linear-gradient(145deg,#${NEON ? '29253a' : '3a3025'},#${NEON ? '1b2233' : '30271e'});color:#${NEON ? 'ffd36b' : 'd79e64'};box-shadow:inset 0 0 18px #ffcc5415,0 0 16px #ffcc5411}
    .readable-city .city-network a:focus-visible{outline:2px solid #${NEON ? 'ffe6a0' : 'deb081'};outline-offset:2px}
    .readable-city h1{font-size:clamp(28px,7vw,46px);line-height:1.08;margin:9px 0 12px;color:#${NEON ? 'f9e7b4' : 'e0b386'}}
    .readable-city h2{font-size:20px;margin:28px 0 8px;color:#${NEON ? 'f9e7b4' : 'e0b386'}}
    .readable-city p{color:#${NEON ? 'c8ccdc' : 'dcd4c8'};max-width:60ch}
    .readable-city .eyebrow{letter-spacing:${NEON ? '.17' : ' .05'}em;text-transform:uppercase;color:#${NEON ? 'b69aff' : 'd2c29c'};font-size:12px;font-weight:800}
    .readable-city .facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:18px 0}
    .readable-city .fact,.readable-city .idea,.readable-city .district{border:1px solid #${NEON ? '3b4262' : '60523d'};background:#${NEON ? '141b31' : '2a231b'};border-radius:14px;padding:12px}
    .readable-city .fact b{display:block;font-size:22px;color:#${NEON ? 'fff' : 'f3ece0'}}.readable-city .fact small{color:#${NEON ? 'c8ccdc' : 'dcd4c8'}}
    .readable-city .city-map{position:relative;isolation:isolate;overflow:hidden;margin:18px 0 12px;padding:14px 9px 11px;border:1px solid #${NEON ? '475775' : '736249'};border-radius:19px;background:radial-gradient(ellipse at 50% 90%,#${NEON ? '183553' : '836b54'} 0%,#${NEON ? '101c35' : '2a231b'} 40%,#${NEON ? '090e20' : '191410'} 82%);box-shadow:0 20px 50px #${NEON ? '02071199' : '0c0a0799'},inset 0 0 36px #${NEON ? '6a9eff12' : 'ddc58c12'}}
    .readable-city .city-map:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 8% 18%,#${NEON ? 'b5dfff' : 'd6c8a6'} 1px,transparent 2px),radial-gradient(circle at 82% 12%,#${NEON ? 'ffe6a7' : 'dfb284'} 1px,transparent 2px),radial-gradient(circle at 46% 27%,#${NEON ? 'd1dfff' : 'dacdaf'} 1px,transparent 2px),linear-gradient(145deg,transparent 46%,#${NEON ? '69c4ff20' : 'ddc48b20'} 47%,transparent 49%,transparent 62%,#e2bc7324 63%,transparent 65%);background-size:auto,auto,auto,100% 100%}
    .readable-city .map-head{position:relative;display:flex;justify-content:space-between;gap:8px;align-items:center;margin:0 7px 9px}.readable-city .map-count{color:#d9cfad;font:700 11px system-ui}
    .readable-city .fallback-metropolis{position:relative;height:220px;margin:0 0 11px;overflow:hidden;border-radius:13px;background:radial-gradient(circle at 50% 78%,#ff8d3630 0 11%,transparent 34%),radial-gradient(ellipse at 50% 100%,#${NEON ? '153f63' : '876f57'} 0 18%,#${NEON ? '08152b' : '1f1a14'} 57%,#${NEON ? '050817' : '110e0b'} 85%);box-shadow:inset 0 -25px 45px #${NEON ? '020611' : '0c0a07'}}
    .readable-city .fallback-metropolis:before{content:"";position:absolute;left:5%;right:5%;bottom:19%;height:48%;border:1px solid #${NEON ? '58dcff8c' : 'd9be7e8c'};border-left-color:transparent;border-right-color:transparent;border-radius:50%;transform:rotate(-6deg);box-shadow:0 0 13px #${NEON ? '48d8ff80' : 'd6b87180'},inset 0 0 18px #${NEON ? '4ad8ff24' : 'd6b87324'}}
    .readable-city .fallback-metropolis:after{content:"";position:absolute;left:12%;right:12%;bottom:12%;height:56%;border:1px solid #ff914b8c;border-top-color:transparent;border-radius:50%;transform:rotate(10deg);box-shadow:0 0 12px #ff75496b}
    .readable-city .fallback-town{position:absolute;z-index:2;width:10px;height:22px;transform:translate(-50%,-50%);border:1px solid #${NEON ? 'ffd17a' : 'daa672'};background:repeating-linear-gradient(0deg,#${NEON ? 'ff8d3e' : 'd4975a'} 0 2px,#${NEON ? '3a1b2c' : '342b21'} 2px 4px);box-shadow:-7px 4px 0 -2px #${NEON ? 'cf632e' : 'cd8841'},7px 5px 0 -2px #${NEON ? 'ffb34d' : 'd69b60'},0 0 8px #${NEON ? 'ff713b' : 'd49759'}}
    .readable-city .fallback-hq{position:absolute;z-index:4;left:50%;bottom:21px;width:48px;height:134px;transform:translateX(-50%);clip-path:polygon(30% 0,70% 0,100% 92%,78% 100%,22% 100%,0 92%);border:1px solid #${NEON ? 'a4f7ff' : 'd3c4a0'};background:repeating-linear-gradient(0deg,transparent 0 7px,#${NEON ? '8df4ff9c' : 'e5d3a79c'} 7px 9px),linear-gradient(90deg,#${NEON ? '132843' : '7d6650'},#${NEON ? '398ca0' : 'b3995b'} 50%,#${NEON ? '132843' : '7d6650'});box-shadow:0 0 24px #${NEON ? '55e8ff' : 'c7b385'},inset 0 0 16px #ffd26855}
    .readable-city .fallback-hq:before{content:"DATA HQ";position:absolute;left:50%;top:8px;transform:translateX(-50%);width:90px;color:#${NEON ? 'fff8d8' : 'e8d19d'};text-align:center;font:900 9px system-ui;letter-spacing:${NEON ? '.12' : ' .05'}em;text-shadow:${NEON ? '0' : ''} ${NEON ? '0 8px #6ef0ff' : 'none'}}
    .readable-city .fallback-hq:after{content:"";position:absolute;left:-22px;top:55%;width:88px;height:17px;border:2px solid #${NEON ? 'ffd16e' : 'd9a36d'};border-radius:50%;box-shadow:0 0 14px #${NEON ? 'ffbd44' : 'd5995c'};transform:rotateX(62deg)}
    .readable-city .districts{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .readable-city button{min-height:44px;color:#${NEON ? 'f9f7ff' : 'dccfb2'};background:#${NEON ? '242c4e' : '46392c'};border:1px solid #${NEON ? '646b93' : '938064'};border-radius:12px;padding:8px 12px;font:700 13px system-ui;cursor:pointer}
    .readable-city .map-link{display:inline-flex;min-height:44px;align-items:center;justify-content:center;margin:10px 0;padding:9px 15px;border:1px solid #${NEON ? 'e7bb69' : 'd69c61'};border-radius:12px;background:#${NEON ? '34304c' : '4c4130'};color:#${NEON ? 'ffdfa0' : 'deb081'};text-decoration:none;font:800 13px system-ui}
    .readable-city .district{min-width:0;min-height:108px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;padding:7px 4px 5px;background:linear-gradient(180deg,#${NEON ? '24365742' : '57482442'},#${NEON ? '172748a8' : '3a3025a8'});border-color:#${NEON ? '60789b66' : '99836266'};box-shadow:inset 0 -8px 14px #${NEON ? '0b172c' : '221c15'};color:#f5f2eb}
    .readable-city .district-tower{position:relative;display:block;width:42px;height:var(--tower-h);flex:none;transform:skewY(-8deg);background:repeating-linear-gradient(90deg,transparent 0 6px,#ffe3a43d 6px 8px,transparent 8px 11px),repeating-linear-gradient(0deg,transparent 0 9px,#${NEON ? '77d7ff63' : 'e0ca9663'} 9px 11px),linear-gradient(125deg,#${NEON ? '15445e' : '866e55'},#${NEON ? '32748a' : 'af9351'} 55%,#${NEON ? '14233d' : '7b654f'});border:1px solid #${NEON ? '70ccdb95' : 'd7b97495'};box-shadow:0 0 14px #${NEON ? '52bde36a' : 'd2b1636a'},inset 5px 0 12px #${NEON ? '9fdafc35' : 'e9d8b235'}}
    .readable-city .district-tower:after{content:"";position:absolute;left:6px;right:6px;top:-7px;height:7px;transform:skewX(42deg);background:#${NEON ? '4c9cb0' : 'b9a067'};border:1px solid #${NEON ? 'a5eff0a3' : 'e7d6aea3'}}
    .readable-city .district-label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 10px/1.2 system-ui;letter-spacing:.02em;text-transform:uppercase}
    .readable-city .district-count{display:block;color:#${NEON ? 'bdc9d7' : 'd6ccbe'};font:600 10px/1.2 system-ui}
    .readable-city .district.on{border-color:#${NEON ? 'f0d185' : 'daa570'};background:#3e3a46;color:#${NEON ? 'fff' : 'f3ece0'};box-shadow:0 0 20px #e0b76b70}.readable-city .district.on .district-tower{border-color:#${NEON ? 'ffe6a0' : 'deb081'};box-shadow:0 0 20px #f8ca76a9}
    .readable-city button:focus-visible{outline:3px solid #${NEON ? 'ffe6a0' : 'deb081'};outline-offset:2px}
    @media(max-width:350px){.readable-city .districts{gap:4px}.readable-city .district-label{font-size:9px}}
    @media(prefers-reduced-motion:reduce){.readable-city .district{scroll-behavior:auto}}
    .readable-city input{display:block;width:100%;min-height:48px;border-radius:12px;border:1px solid #${NEON ? '646b93' : '938064'};background:#${NEON ? '11172a' : '241e17'};color:#${NEON ? 'fff' : 'f3ece0'};padding:10px 12px;font:16px system-ui}
    .readable-city .idea{margin:9px 0}.readable-city .idea strong{display:block;overflow-wrap:anywhere}.readable-city .idea small{color:#${NEON ? 'bec5d8' : 'd6cdc0'}}
    .readable-city .idea b{color:#${NEON ? 'e9ce8d' : 'daa671'}}
    .readable-city .badge{display:inline-block;padding:2px 8px;border-radius:8px;background:#${NEON ? '2c365a' : '524334'};color:#${NEON ? 'fff' : 'f3ece0'};font-size:11px;text-transform:uppercase}
    .readable-city .empty{padding:18px;border:1px dashed #66708d;border-radius:14px}
  `;
  document.head.append(css);
  const root = el('main', 'readable-city');
  const add = (parent, tag, content, cls) => { const node = el(tag, cls || '', String(content)); parent.append(node); return node; };
  const network = add(root, 'nav', '', 'city-network');
  network.setAttribute('aria-label', 'City network');
  add(network, 'span', 'City network', 'city-network-label');
  for (const [label, href, current] of [['ARENA', '../cities/', false], ['DATA CITY', './', true], ['KALSHI CITY', '../kalshicity/', false]]) {
    const link = add(network, 'a', label, '');
    link.href = href;
    if (current) link.setAttribute('aria-current', 'page');
  }
  add(root, 'div', 'OLYMPUS · DATA CITY', 'eyebrow');
  add(root, 'h1', 'The city is still here');
  add(root, 'p', 'The 3D city could not start on this device. Explore its read-only district map and research below. No trading controls are available here.');
  add(root, 'p', demo ? 'Showing sample data. Connect for the published research.' : 'Showing the published research data.');
  const mapLink = add(root, 'a', 'Open the 2D map', 'map-link');
  mapLink.href = demo ? './map.html?demo=1' : './map.html';
  const map = el('section', 'city-map');
  map.setAttribute('aria-label', 'Research district city map');
  const mapHead = el('div', 'map-head');
  add(mapHead, 'span', 'EXPLORE THE DISTRICTS', 'eyebrow');
  add(mapHead, 'span', model.sections.filter((s) => s.items.length).length + ' districts', 'map-count');
  map.append(mapHead);
  const metropolis = el('div', 'fallback-metropolis');
  metropolis.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2, town = el('span', 'fallback-town');
    town.style.left = (50 + Math.cos(angle) * (40 + (i % 3) * 2.5)) + '%';
    town.style.top = (61 + Math.sin(angle) * (27 + (i % 4) * 1.5)) + '%';
    town.style.opacity = String(0.6 + (i % 4) * 0.1);
    metropolis.append(town);
  }
  metropolis.append(el('span', 'fallback-hq'));
  map.append(metropolis);
  const controls = el('div', 'districts');
  map.append(controls);
  root.append(map);
  const facts = el('div', 'facts');
  for (const [n, label] of [[model.buildings.length.toLocaleString(), 'tested ideas and records'], [model.sections.length, 'research districts']]) {
    const f = el('div', 'fact'); add(f, 'b', n); add(f, 'small', label); facts.append(f);
  }
  root.append(facts);
  const results = el('div');
  add(root, 'h2', 'Explore ideas');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search an idea or district'; search.setAttribute('aria-label', 'Search research ideas');
  root.append(search, results);
  let chosen = '';
  const sections = model.sections.filter((s) => s.items.length);
  const biggest = Math.max(1, ...sections.map((s) => s.items.length));
  for (const sec of sections) {
    const btn = el('button', 'district');
    btn.type = 'button';
    btn.style?.setProperty?.('--tower-h', (23 + Math.round(Math.sqrt(sec.items.length / biggest) * 35)) + 'px');
    btn.setAttribute('aria-label', sec.name + ' district, ' + sec.items.length.toLocaleString() + ' ideas');
    const tower = el('span', 'district-tower');
    tower.setAttribute('aria-hidden', 'true');
    btn.append(tower, el('span', 'district-label', sec.name), el('small', 'district-count', sec.items.length.toLocaleString() + ' ideas'));
    btn.addEventListener('click', () => { chosen = chosen === sec.key ? '' : sec.key; controls.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn && !!chosen)); draw(); });
    controls.append(btn);
  }
  function draw() {
    const term = search.value.trim().toLowerCase();
    results.replaceChildren();
    const pool = chosen ? sections.find((x) => x.key === chosen)?.items || [] : model.buildings;
    const matches = [];
    for (const b of pool) {
      if (term && !((b.lab || labelOf(b, model.D)) + ' ' + b.d).toLowerCase().includes(term)) continue;
      matches.push(b);
      if (matches.length >= 60 && term) break;
    }
    if (!term) matches.sort((a, b) => (b.cls === 'gold') - (a.cls === 'gold') || (b.e || 0) - (a.e || 0));
    add(results, 'p', term ? 'Matching ideas, first 60 shown.' : 'Top ideas by research grade and historical dollars per trade. These are past tests, not live signals.');
    if (!matches.length) add(results, 'p', 'No matching ideas in this district. Try another search.', 'empty');
    for (const b of matches.slice(0, 30)) {
      const row = el('article', 'idea');
      add(row, 'span', b.cls || 'research', 'badge');
      add(row, 'strong', labelOf(b, model.D));
      add(row, 'small', (b.d || 'Research') + ' · ' + (Number.isFinite(b.n) ? b.n.toLocaleString() + ' samples' : 'Record'));
      if (Number.isFinite(b.e) && !b.plugin) add(row, 'b', money(b.e) + ' per trade per micro (historical)');
      results.append(row);
    }
  }
  search.addEventListener('input', draw);
  draw();
  document.body.append(root);
  O?.ready(); // the readable 2D fallback is on screen; release the loading veil now
  Object.assign(state, { ready: true, mode: demo ? 'demo-fallback' : 'live-fallback', fallback: true, buildings: model.buildings.length, fallbackReason: String(reason?.message || reason) });
}

async function main() {
  const { data, demo, why } = await loadCity();
  const plugins = await loadPlugins(data, getJSON);
  const synth = Math.max(0, Math.min(60000, parseInt(P.get('synth') || '0', 10) || 0));
  const model = decode(data, plugins, synth);
  try {
    const app = new App(model, demo);
    const fallback = (reason) => readableFallback(model, demo, reason);
    app.onRenderFailure = (reason) => failCity(app, fallback, reason);
    watchContextLoss($('#c'), app, fallback);
    window.__app = app;
    $('#loading').remove();
    app.start();
    watchFirstFrame(app, fallback);
    state.ready = true;
  } catch (e) {
    window.__app = null;
    readableFallback(model, demo, e);
    postCard();
    return;
  }
  if (why) {                                                        // plain words: why this is the demo city
    const note = why === 'offline' ? 'Offline: showing the demo city. The live city comes back with your connection.' : 'The live city is not published yet: showing the demo city.';
    state.notice = note; setTimeout(() => UI.toast(note), 600);
  }
  postCard();
}

window.addEventListener('error', (e) => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason?.message || e.reason || e)));
main().catch((e) => {
  state.errors.push(String(e?.message || e));
  $('#loading')?.remove();
  if (O) O.fail(`the city could not be drawn on this device (${e?.message || 'error'})`);
  else document.body.appendChild(el('div', 'err', `The city could not be drawn on this device (${e?.message || 'error'}).`));
});
