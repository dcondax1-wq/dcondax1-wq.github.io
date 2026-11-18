// HELLAS page layer: the header with the honest counter, breadcrumbs, the search box, the region list, the cards, the random voyage,
// the 2D map (also the fallback when the device cannot draw 3D) and the walking controls. Plain words, AGORA look, 44 px targets.
// Levels: Hellas (world) -> region -> polis -> district -> village -> house. READ ONLY: links open other apps, nothing trades.
import { houseCard, searchPoleis, usd, STATE_WORD, keeperPerson, builderPerson, bigNews } from './hellas-data.js';
import { talkTo, chatCard, sayShow } from './people-talk.js';
import { planPolis, voyage, whereInPolis } from './hellas-plan.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const btn = (text, fn, cls) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; };
const nice = (n, w) => `${n.toLocaleString('en-US')} ${n === 1 ? w : w === 'city' ? 'cities' : w + 's'}`;
const TONE_HEX = { good: '#7f8a52', bad: '#c96a4a', warn: '#e0b060', info: '#4b7a99', plain: '#d9c7a0', none: '#9a8f7d' };
const STATE_TONE = { working: 'gold', quiet: '', ruin: 'bad' }, STATE_HEX = { working: '#e0b060', quiet: '#d9c7a0', ruin: '#b08a5e' };
const SHARE_WORDS = { archive: ['adopted', 'still open', 'rejected'], datacity: ['hold in both periods', 'hold in one period', 'noise'] };

export class HellasUI {
  constructor(opts = {}) { this.o = opts; this.reduced = !!opts.reduced; this.at = {}; this.world = null; this.scene = null; this.mapMode = false; this.ptr = new Map(); this.voy = null; this.tick = 0; this.keys = {}; }

  mount(parent = document.body) {
    const r = this.root = el('div', 'hel'); r.id = 'hellas'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'Hellas, the world of cities');
    this.canvas = el('canvas', 'hel-c'); this.canvas.setAttribute('aria-label', 'The Greek world in 3D'); this.map = el('canvas', 'hel-map'); this.map.setAttribute('aria-label', 'The map of Hellas');
    this.labels = el('div', 'hel-labels'); this.veil = el('div', 'hel-veil'); this.labelPool = [];
    const top = el('header', 'hel-top'), bar = el('div', 'hel-bar'), title = el('div', 'hel-title');
    this.backB = btn('‹', () => this.back(), 'hel-ic'); this.backB.setAttribute('aria-label', 'Back one level');
    const h2 = el('h2', '', 'Hellas'); this.count = el('small', '', 'Reading the files'); this.count.id = 'helCount'; title.append(h2, this.count); title.onclick = () => this.worldCard(true);
    const x = btn('×', () => this.o.onClose && this.o.onClose(), 'hel-ic'); x.setAttribute('aria-label', 'Close Hellas');
    bar.append(this.backB, title, x);
    this.crumbs = el('nav', 'hel-crumbs'); this.crumbs.setAttribute('aria-label', 'Where you are');
    const form = this.form = el('form', 'hel-find'); form.setAttribute('role', 'search'); this.input = el('input'); this.input.type = 'search'; this.input.placeholder = 'Find a city: VWAP, Kalshi 90c'; this.input.setAttribute('aria-label', 'Find a city'); this.input.autocomplete = 'off';
    const go = el('button', '', 'Find'); go.type = 'submit'; form.append(this.input, go); form.onsubmit = (e) => { e.preventDefault(); this.find(this.input.value); this.input.blur(); };
    top.append(bar, this.crumbs, form);
    const zoom = el('div', 'hel-zoom'), zi = btn('+', () => this.zoomBy(.7), 'hel-ic'), zo = btn('−', () => this.zoomBy(1.4), 'hel-ic'); zi.setAttribute('aria-label', 'Zoom in'); zo.setAttribute('aria-label', 'Zoom out'); zoom.append(zi, zo);
    this.load = el('div', 'hel-load', 'Reading the Archive, Data City and Kalshi'); this.load.setAttribute('role', 'status');
    this.card = el('section', 'hel-card'); this.card.hidden = true; this.card.setAttribute('aria-live', 'polite');
    this.ticker = btn('', () => this.eventsCard(), 'hel-ticker'); this.ticker.hidden = true; this.ticker.setAttribute('aria-label', 'The latest events in Hellas');
    const dock = el('div', 'hel-dock'); this.dockB = { regions: btn('Regions', () => this.regionList()), voyage: btn('Random voyage', () => this.startVoyage()), walk: btn('Walk', () => this.startWalk()), map: btn('Map', () => this.toggleMap()) };
    this.dockB.walk.disabled = true; dock.append(...Object.values(this.dockB));
    const sz = el('div', 'hel-stickzone'); this.stick = el('div', 'hel-stick'); this.knob = el('i'); this.stick.append(this.knob); sz.append(this.stick);
    const wb = el('div', 'hel-walkbar'); this.where = el('span', 'hel-where', ''); this.talkB = btn('Talk', () => this.talkNearest(), 'go'); this.talkB.disabled = true; wb.append(this.where, this.talkB, btn('Look', () => this.lookHere()), btn('Stop', () => this.stopWalk()));
    this.peopleStrip = el('div', 'hel-people'); this.peopleStrip.setAttribute('aria-label', 'People nearby');
    r.append(this.canvas, this.map, this.labels, this.veil, top, zoom, this.load, this.ticker, this.card, dock, sz, this.peopleStrip, wb); parent.append(r);
    for (const c of [this.canvas, this.map]) { c.addEventListener('pointerdown', (e) => this.down(e)); c.addEventListener('pointermove', (e) => this.move(e)); c.addEventListener('pointerup', (e) => this.up(e)); c.addEventListener('pointercancel', (e) => this.up(e, true)); c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.12 : .89); }, { passive: false }); }
    this.onKey = (e) => this.key(e); addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    this.renderCrumbs(); return this;
  }
  unmount() { removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey); this.stopVoyage(); clearInterval(this.tickT); this.root.remove(); }
  attach(scene) { this.scene = scene; }
  noGL(msg) { this.scene = null; this.root.classList.add('nogl'); this.mapMode = true; this.dockB.map.disabled = true; this.dockB.walk.hidden = true; const n = el('div', 'hel-note', msg); this.root.append(n); setTimeout(() => n.remove(), 9000); this.drawMap(); }
  setWorld(world) { this.world = world; this.load.remove(); this.count.textContent = world.header; this.renderCrumbs(); this.worldCard(); this.drawMap(); this.tickN = 0; this.setTicker(); if (!this.reduced && world.events.length > 1) this.tickT = setInterval(() => { this.tickN++; this.setTicker(); }, 4200); }
  /** the world ticker: the latest events, one at a time above the dock (it stands still with reduced motion); a tap lists all of them */
  setTicker() { const E = this.world ? this.world.events : []; if (!E.length) { this.ticker.hidden = true; return; } const e = E[this.tickN % E.length]; this.ticker.hidden = false; this.ticker.replaceChildren(el('b', '', `Latest ${this.tickN % E.length + 1}/${E.length} · ${e.when}`), el('span', '', e.text)); }
  eventsCard() { const W = this.world, by = new Map(W.poleis.map((p) => [p.id, p])); this.stopVoyage();
    this.showCard(`The latest ${W.events.length} events`, [el('p', '', 'The newest things in your own files: the last runs added to the Archive and the last rebuild of each other source. History, not a forecast.'),
      this.list(W.events.map((e) => { const p = by.get(e.polis); return { title: e.text, sub: `${e.when} · ${p ? p.name : ''}`, tone: e.tone, fn: () => p && this.showPolis(p) }; }))]); }
  buildersCard(focus) { const W = this.world; if (!W || !W.builders.length) return; this.stopVoyage(); const by = new Map(W.poleis.map((p) => [p.id, p]));
    if (focus && this.scene && this.scene.level === 'world') { const q = (this.scene.builderPos || [])[focus.i] || { x: focus.tx, z: focus.tz }; this.scene.flyTo(q.x, q.z, { dist: 150, pitch: .6 }); }
    if (focus) return this.talk(builderPerson(focus, W), { kind: 'builder', i: focus.i });
    this.showCard(`The builders' caravan`, [
      el('p', '', `${W.builders.length} build agents were at work when this page was built. Each one walks from the camp by the harbour of Athens to the city it is building. ${W.buildersLabel}${W.buildersAsof ? ' (' + W.buildersAsof.slice(0, 16).replace('T', ' ') + ' UTC)' : ''}`),
      this.list(W.builders.map((b) => ({ title: `${b.name}: ${b.job}`, sub: 'to ' + b.site, tone: b.newSite ? 'info' : 'gold', fn: () => { const p = by.get(b.target); this.buildersCard(b); if (!this.scene && p) this.showPolis(p); } })))]); }
  step(text) { this.load.textContent = text; }

  // ------------------------------------------------------------------ levels
  get level() { const a = this.at; return a.house ? 'house' : a.village ? 'village' : a.district ? 'district' : a.polis ? 'polis' : a.sel ? 'city' : a.region ? 'region' : 'world'; }
  renderCrumbs() {
    const a = this.at, list = [['Hellas', () => this.goWorld()]];
    if (a.region) list.push([a.region.name, () => this.goRegion(a.region)]);
    if (a.polis || a.sel) { const p = a.polis || a.sel; list.push([p.name, () => (a.polis ? this.polisCard() : this.showPolis(p))]); }
    if (a.district) list.push([a.district.name, () => this.goDistrict(a.district)]);
    if (a.village) list.push([a.village.name, () => this.goVillage(a.village)]);
    if (a.house) list.push(['House', () => this.showHouse(a.house)]);
    this.crumbs.replaceChildren(); list.forEach(([t, fn], i) => { if (i) this.crumbs.append(el('i', '', '›')); const b = btn(t, fn); if (i === list.length - 1) b.setAttribute('aria-current', 'location'); this.crumbs.append(b); });
    this.crumbs.scrollLeft = 9999; this.dockB.walk.disabled = !(a.polis && this.scene); this.backB.setAttribute('aria-label', this.level === 'world' ? 'Close Hellas' : 'Back one level');
  }
  showCard(title, nodes, tone) {
    if (!this._chatting) this.endTalk(); this._chatting = false;
    const head = el('header'), h = el('h3', '', title), x = btn('×', () => this.hideCard(), 'hel-ic'); x.setAttribute('aria-label', 'Close this card'); head.append(h, x);
    const body = el('div', 'hel-body'); body.append(...nodes.filter(Boolean)); this.card.replaceChildren(head, body); this.card.hidden = false; this.card.dataset.tone = tone || ''; body.scrollTop = 0; if (this.mapMode) this.drawMap();
  }
  hideCard() { this.card.hidden = true; this.endTalk(); if (this.mapMode) this.drawMap(); }
  endTalk() { if (this.chat) { this.chat = null; if (this.scene) this.scene.setTalk(null); } if (this.dir) this.dir.endTalk(true); }
  /** talk to a person: the shared People kit when it is loaded and knows them, else our own chat card (six questions, answers from this city's data) */
  talk(person, ref) {
    if (!person) return null; this.stopVoyage(); this.endTalk(); this.chat = person; if (this.scene && ref) this.scene.setTalk(ref);
    const how = talkTo(person, { anchor: this.card }), S = this.scene, P = S && ref && ref.kind === 'person' && S.people ? S.people[ref.i] : null;
    const project = P ? () => { const r = S.canvas ? S.canvas.getBoundingClientRect() : { left: 0, top: 0 }, q = S.project(P.x, (S.walk ? 1.08 : 2.5) * 1.5, P.z); return { x: r.left + q.x, y: r.top + q.y, front: !!q.vis }; } : null;
    const fig = P && S.crowd && S.crowd.figureOf ? S.crowd.figureOf(ref.i) : null;      // QA6: the rigged figure you talk to (town-cast.js) moves its lips with the voice
    const voice = sayShow(person, 'hellas', { project, anchor: this.card, figure: fig }); this.lastTalk = { id: person.id, how, voice: { say: voice.say, show: voice.show } };
    if (how === 'kit') { this.card.hidden = true; return how; }
    this._chatting = true; this.showCard(person.name, [chatCard(person), voice.card, person.kind === 'builder' ? this.acts(btn('All the builders', () => this.buildersCard())) : null]); return how;
  }
  talkKeeper(p) { const S = this.scene, P = S && S.level === 'polis' && S.people ? S.people[0] : null; if (P && S.polis === p && !S.walking) S.flyTo(P.x, P.z, { dist: 34, pitch: .42, yaw: 0 }); return this.talk(P && S.polis === p ? P.person : keeperPerson(p), P && S.polis === p ? { kind: 'person', i: 0 } : null); }
  talkNearest() { const S = this.scene; if (!S || !S.walk) return; const e = S.peopleNear(S.walk.x, S.walk.z, 1, 3)[0]; if (e) this.talk(e.P.person, { kind: 'person', i: e.P.i }); }
  list(items) { const ul = el('ul', 'hel-list'); for (const it of items) { const li = el('li'), b = btn('', it.fn), dot = el('span', 'dot ' + (it.tone || '')), t = el('span', 't', it.title); if (it.sub) t.append(el('small', '', it.sub)); b.append(dot, t); if (it.right) b.append(el('span', 'm', it.right)); li.append(b); ul.append(li); } return ul; }
  acts(...nodes) { const d = el('div', 'hel-acts'); d.append(...nodes.filter(Boolean)); return d; }
  link(l) { const a = el('a', '', l.text); a.href = l.href; return a; }

  /** the first card is short (the map is the show); the counter in the header opens the full count, source by source */
  worldCard(full) {
    const W = this.world; if (!W) return;
    const lead = el('p', '', `${W.header}. Every city is a real group of your own rows, and every house is one row: one tested run, one combo, one bet fact, one deal, one app.`);
    const c = W.counts, live = el('p', '', `Now: ${c.working} cities at work (a brazier burns), ${c.quiet} quiet, ${c.ruins} in ruins. The southern desert holds what did not work: ${c.desertRuns.toLocaleString('en-US')} of the ${c.rejectedRuns.toLocaleString('en-US')} rejected runs, in ${c.ghostTowns} ghost towns you can still enter.`);
    if (!full) return this.showCard('Hellas, the world of cities', [lead, live, this.acts(btn('Random voyage', () => this.startVoyage(), 'go'), btn('Regions', () => this.regionList()), btn('How it is counted', () => this.worldCard(true)), W.builders.length ? btn('The builders', () => this.buildersCard()) : null)]);
    const src = this.list(W.sources.filter((s) => s.ok).map((s) => ({ title: s.name, sub: s.example ? 'Example data: the real file was not found' : 'Read from the published file', tone: s.example ? 'warn' : 'good', right: `${nice(s.cities, 'city')}\n${nice(s.houses, 'house')}`, fn: () => this.find(s.name.split(' ')[0]) })));
    this.showCard('How Hellas is counted', [lead, live, src,
      el('p', '', 'A city grows with its rows. Its walls turn olive when more was adopted than rejected and terracotta when most was rejected. A gold acropolis means something there was adopted or kept. Trade routes join cities of the same family.'),
      this.acts(btn('Random voyage', () => this.startVoyage(), 'go'), btn('Regions', () => this.regionList()))]);
  }
  goWorld() { this.stopVoyage(); this.leave(() => { this.at = {}; this.renderCrumbs(); this.select(null); if (this.scene) this.scene.goHome(); this.worldCard(); this.drawMap(); }); }
  regionList() {
    this.stopVoyage(); const W = this.world; if (!W) return;
    this.showCard('The regions of Hellas', [el('p', '', 'Each region holds one kind of data. Tap one to fly there.'), this.list(W.regions.map((R) => ({ title: R.name, sub: R.blurb, tone: R.kind === 'desert' ? 'bad' : R.kind === 'isles' ? 'info' : 'good', right: nice(R.poleis.length, 'city'), fn: () => this.goRegion(R) })))]);
  }
  goRegion(R) {
    this.stopVoyage(); this.leave(() => {
      this.at = { region: R }; this.renderCrumbs(); this.select(null);
      if (this.scene) { const S = this.scene, tv = Math.tan(S.camera.fov * Math.PI / 360), th = tv * S.camera.aspect; S.flyTo(R.cx, R.cz + R.rz * .25, { dist: Math.max(R.rx / th, R.rz / tv * .9) * 1.15, pitch: .95, yaw: 0, dur: 1.5 }); }
      const houses = R.poleis.reduce((s, p) => s + p.rows.length, 0);
      this.showCard(R.name, [el('p', '', `${R.blurb}. ${nice(R.poleis.length, 'city')}, ${nice(houses, 'house')}.`), this.list(R.poleis.map((p) => this.polisItem(p)))]); this.drawMap();
    });
  }
  polisItem(p) { return { title: p.name, sub: `${STATE_WORD[p.activity.state]} · ${p.label}`, tone: p.gold ? 'gold' : p.share > .5 ? 'good' : p.bad > p.good ? 'bad' : 'plain', right: p.capital ? 'capital' : nice(p.rows.length, p.unit), fn: () => this.showPolis(p) }; }
  /** a city on the world map: fly to it, ring it, say what it is */
  showPolis(p, o = {}) {
    if (!o.voy) this.stopVoyage();
    this.leave(() => {
      const R = this.world.regions.find((x) => x.key === p.region); this.at = { region: R, sel: p }; this.renderCrumbs(); this.select({ x: p.x, z: p.z, selR: p.mr * 1.6 });
      const arm = () => { const v = this.voy; if (o.voy && v && v.stops[v.i] === p && !this.reduced) { clearTimeout(v.timer); v.timer = setTimeout(() => this.voyNext(), 7000); } };   // the voyage waits at each stop, counted from the arrival
      if (this.scene) this.scene.flyTo(p.x, p.z + p.mr, { dist: 300, pitch: .78, dur: o.voy ? 2.2 : 1.4, then: arm }); else arm();
      const nodes = [], tags = el('p'); tags.append(el('span', 'hel-tag', p.regionName), el('span', 'hel-tag', p.capital ? 'the capital' : nice(p.rows.length, p.unit)));
      tags.append(el('span', 'hel-tag ' + STATE_TONE[p.activity.state], STATE_WORD[p.activity.state]));
      if (p.gold) tags.append(el('span', 'hel-tag gold', 'Gold acropolis')); if (p.example) tags.append(el('span', 'hel-tag warn', 'Example data'));
      if (o.voy) nodes.push(el('p', '', `Voyage stop ${this.voy.i + 1} of ${this.voy.stops.length}.`));
      const doing = el('p', 'hel-doing', p.activity.doing[0].toUpperCase() + p.activity.doing.slice(1) + '.'); nodes.push(tags, doing, el('p', '', (p.ruin ? 'A ghost town in the desert of what did not work: every run here was rejected. Enter it to read why. ' : '') + p.say));
      const comers = this.world.builders.filter((b) => b.target === p.id); if (comers.length) nodes.push(el('p', '', `Builders on the road here: ${comers.map((b) => b.name).join(', ')} (snapshot at build time).`));
      const sw = SHARE_WORDS[p.src], tot = p.good + p.bad + p.open;
      if (sw && tot) { const bar = el('div', 'hel-share'); for (const [c, v] of [['g', p.good], ['o', p.open], ['b', p.bad]]) { const i = el('i', c); i.style.width = (v / tot * 100) + '%'; bar.append(i); } bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${p.good} ${sw[0]}, ${p.open} ${sw[1]}, ${p.bad} ${sw[2]}`); nodes.push(bar, el('p', '', `${p.good} ${sw[0]} · ${p.open} ${sw[1]} · ${p.bad} ${sw[2]}`)); }
      const rel = this.world.routes.filter((r) => r.a === p.idx || r.b === p.idx).slice(0, 3).map((r) => this.world.poleis[r.a === p.idx ? r.b : r.a]);
      if (rel.length) nodes.push(el('p', '', 'Trade routes sail to its sister cities:'), this.list(rel.map((q) => this.polisItem(q))));
      if (o.also && o.also.length) nodes.push(el('p', '', 'Also found:'), this.list(o.also.map((q) => this.polisItem(q))));
      nodes.push(o.voy ? this.acts(btn('Next stop', () => this.voyNext(), 'go'), btn('Enter the city', () => this.enter(p)), btn('End the voyage', () => { this.stopVoyage(); this.showPolis(p); }))
        : this.acts(btn(p.capital ? 'Enter Athens' : 'Enter the city', () => this.enter(p), 'go'), p.capital || !p.rows.length ? null : btn('Talk to the keeper', () => this.talkKeeper(p)), btn('Back to ' + (R ? R.name : 'Hellas'), () => (R ? this.goRegion(R) : this.goWorld()))));
      this.showCard(`${p.name} · ${p.label}`, nodes); this.drawMap();
    });
  }
  enter(p) {
    this.stopVoyage();
    if (p.capital) { if (typeof window.openAthens === 'function') window.openAthens(); return; }
    const R = this.world.regions.find((x) => x.key === p.region), done = (plan) => { this.at = { region: R, polis: p, plan }; this.renderCrumbs(); this.veil.classList.remove('on'); this.polisCard(); this.drawMap(); };
    if (!this.scene) return done(planPolis(p));
    this.hideCard(); const slow = this.scene.level === 'world' && !this.reduced; if (slow) this.veilT = setTimeout(() => this.veil.classList.add('on'), 820);
    this.scene.enterPolis(p, { onSwap: (plan) => setTimeout(() => done(plan), slow ? 140 : 0) });
  }
  /** leave the polis (if inside one), then run fn */
  leave(fn) {
    clearTimeout(this.veilT); this.veil.classList.remove('on'); if (this.walking) this.stopWalk(true);
    if (this.at.polis && this.scene && this.scene.level === 'polis') this.scene.leavePolis();
    this.at.polis = null; this.at.plan = null; fn();
  }
  polisCard() {
    const p = this.at.polis, plan = this.at.plan; if (!p || !plan) return; this.at.district = this.at.village = this.at.house = null; this.renderCrumbs(); this.select(null);
    if (this.scene && this.scene.level === 'polis' && !this.scene.fly) this.scene.flyCam({ tx: 0, tz: 0, ty: 4, dist: Math.max(150, Math.min(760, plan.R * 2.5)), pitch: .62 }, { dur: 1.1 });
    const tags = el('p'); tags.append(el('span', 'hel-tag ' + STATE_TONE[p.activity.state], STATE_WORD[p.activity.state]), el('span', 'hel-tag', nice(p.rows.length, 'house')), el('span', 'hel-tag', nice(plan.villages.length, 'village')), el('span', 'hel-tag', nice(plan.districts.length, 'district'))); if (p.example) tags.append(el('span', 'hel-tag warn', 'Example data'));
    this.showCard(`${p.name} · ${p.label}`, [tags, el('p', 'hel-doing', p.activity.doing[0].toUpperCase() + p.activity.doing.slice(1) + '.'), el('p', '', `${plan.ruin ? 'These are ruins: roofless walls, one for every rejected run. ' : ''}Every house is one ${p.unit}: tap a house, or pick a district.`),
      this.list(plan.districts.map((D) => ({ title: D.name, sub: `${nice(D.houses, 'house')} in ${nice(D.villages.length, 'village')}`, tone: 'gold', fn: () => this.goDistrict(D) }))),
      this.acts(this.scene ? btn('Walk the streets', () => this.startWalk(), 'go') : null, btn('Talk to the keeper', () => this.talkKeeper(p)), btn('Leave the city', () => this.showPolis(p)))]); this.drawMap();
  }
  goDistrict(D) {
    const plan = this.at.plan; if (!plan) return; this.at.district = D; this.at.village = this.at.house = null; this.renderCrumbs(); this.select(null);
    if (this.scene) this.scene.flyTo(D.x, D.z, { dist: Math.max(90, Math.max(D.w, D.h) * 1.7), pitch: .7 });
    this.showCard(D.name, [el('p', '', `${nice(D.houses, 'house')} in ${nice(D.villages.length, 'village')}. Pick a village.`), this.list(D.villages.map((i) => plan.villages[i]).map((V) => ({ title: V.name, sub: nice(V.houses.length, 'house'), tone: 'info', fn: () => this.goVillage(V) })))]); this.drawMap();
  }
  goVillage(V) {
    const plan = this.at.plan, p = this.at.polis; if (!plan) return; this.at.district = plan.districts[V.district]; this.at.village = V; this.at.house = null; this.renderCrumbs(); this.select(null);
    if (this.scene) this.scene.flyTo(V.x, V.z, { dist: Math.max(60, Math.max(V.w, V.d) * 1.9), pitch: .72 });
    this.showCard(V.name, [el('p', '', `${nice(V.houses.length, 'house')}. Each one is one ${p.unit}: tap it for the plain story.`), this.list(V.houses.map((i) => plan.houses[i]).map((h) => ({ title: h.row.title, tone: h.tone, right: this.moneyOf(p, h.row), fn: () => this.showHouse(h) })))]); this.drawMap();
  }
  moneyOf(p, row) { if (row.net == null) return ''; return p.src === 'archive' ? `${usd(row.net)}\n${usd(row.perMonth)} a month` : p.src === 'datacity' ? `${usd(row.net, 1)}\na trade` : usd(row.net, p.src === 'money' || p.src === 'accounts' ? 0 : 2); }
  showHouse(h) {
    const plan = this.at.plan, p = this.at.polis; if (!plan || !h) return; this.at.village = plan.villages[h.village]; this.at.district = plan.districts[h.district]; this.at.house = h; this.renderCrumbs(); this.select({ x: h.x, z: h.z, selR: 7 });
    if (this.scene && !this.walking) this.scene.flyTo(h.x, h.z, { dist: 58, pitch: .62 });
    const c = houseCard(p, h.row), dl = el('dl', 'hel-kv'); for (const [k, v] of c.lines) { if (k) dl.append(el('dt', '', k)); dl.append(el('dd', k ? '' : 'fine', v)); }
    const tag = el('p'); tag.append(el('span', 'hel-tag ' + (h.tone === 'plain' ? '' : h.tone), h.row.verdict ? String(h.row.verdict) : 'A fact'), el('span', 'hel-tag', this.at.village.name));
    this.showCard(c.title.length > 90 ? c.title.slice(0, 88) + '…' : c.title, [tag, dl, this.acts(this.link(c.link), btn('Back to the village', () => this.goVillage(this.at.village)))], h.tone);
    this.drawMap();
  }
  back() {
    const a = this.at;
    if (this.walking) return this.stopWalk();
    if (a.house) return this.goVillage(a.village); if (a.village) return this.goDistrict(a.district); if (a.district) return this.polisCard();
    if (a.polis) return this.showPolis(a.polis); if (a.sel) return a.region ? this.goRegion(a.region) : this.goWorld(); if (a.region) return this.goWorld();
    this.o.onClose && this.o.onClose();
  }
  select(o) { this.sel = o; if (this.scene) this.scene.select(o); }

  // ------------------------------------------------------------------ search and the voyage
  find(q) {
    if (!this.world) return; const res = searchPoleis(this.world, q, 6), clean = String(q || '').trim();
    if (!clean) return;
    if (!res.length) { this.showCard('Nothing found', [el('p', '', `No city matches "${clean.slice(0, 40)}". Try a strategy word (VWAP, LIT, ATLAS), a market (Bitcoin), a price (90c) or a place name.`), this.acts(btn('Regions', () => this.regionList(), 'go'))]); return; }
    this.showPolis(res[0], { also: res.slice(1) });
  }
  startVoyage() { if (!this.world) return; this.voyN = (this.voyN || 0) + 1; const stops = voyage(this.world, new Date().toISOString().slice(0, 10) + ':' + this.voyN, 6); if (!stops.length) return; this.voy = { stops, i: -1 }; this.dockB.voyage.classList.add('on'); this.voyNext(); }
  voyNext() { const v = this.voy; if (!v) return; clearTimeout(v.timer); v.i++; if (v.i >= v.stops.length) { this.stopVoyage(); return this.goWorld(); } this.showPolis(v.stops[v.i], { voy: true }); }
  stopVoyage() { if (!this.voy) return; clearTimeout(this.voy.timer); this.voy = null; this.dockB.voyage.classList.remove('on'); }

  // ------------------------------------------------------------------ walking
  get walking() { return !!(this.scene && this.scene.walking); }
  startWalk() {
    const S = this.scene, plan = this.at.plan; if (!S || !plan || S.level !== 'polis') return; this.stopVoyage(); if (this.mapMode) this.toggleMap();
    const V = this.at.village, at = V ? { x: V.x0 - 3, z: V.z, yaw: Math.PI / 2 } : plan.start; if (!S.startWalk(at.x, at.z, at.yaw)) return;
    this.root.classList.add('walking'); this.hideCard(); this.where.textContent = 'Walk with the left thumb, look with the right.';
    this.direct();
    const news = bigNews(this.at.polis); if (news) { const n = S.celebrate(news.text); if (n) this.where.textContent = `${news.text}. The town gathers at the agora to cheer.`; }   // a big number: the crowd gathers and cheers
  }
  // SCENE DIRECTION (walk-direct.js + olympus/camera-rig.js + controls.js, 2026-11-11): third person, tap the street to walk, tap someone to walk up and talk,
  // drag to look, pinch to zoom; the thumb joystick only as an option (?joy=1); ?direct=0 keeps the first-person walker.
  joyOn() { try { return new URLSearchParams(location.search).get('joy') === '1'; } catch (_) { return false; } }
  direct() {
    const S = this.scene; this.undirect(); if (!S || new URLSearchParams(location.search).get('direct') === '0') return;
    this.root.classList.toggle('nojoy', !this.joyOn());
    import('./walk-direct.js?v=d2').then((D) => { if (!S.walking || this.dir) return;
      this.dir = D.createWalkDirector(S, { container: this.root, canvas: this.canvas, reduced: this.reduced, onTalk: (P) => this.talk(P.person, { kind: 'person', i: P.i }), onHouse: (h) => this.showHouse(h) });
      S.walkDirector = this.dir; this.where.textContent = 'Tap the street to walk, tap someone to talk.'; window.__hellasDirector = this.dir; }).catch(() => { this.root.classList.remove('nojoy'); });
  }
  undirect() { if (this.dir) { try { this.dir.dispose(); } catch (_) { /* gone */ } } this.dir = null; if (this.scene) this.scene.walkDirector = null; this.root.classList.remove('nojoy'); }
  stopWalk(quiet) { if (!this.scene) return; this.undirect(); this.endTalk(); this.stripKey = ''; this.peopleStrip.replaceChildren(); this.scene.stopWalk(); this.root.classList.remove('walking'); this.knob.style.transform = ''; this.keys = {}; if (!quiet) this.polisCard(); }
  lookHere() { const S = this.scene; if (!S || !S.walk) return; const w = whereInPolis(this.at.plan, S.walk.x, S.walk.z); if (w.house) this.showHouse(w.house); else this.showCard('Nothing close', [el('p', '', 'Walk up to a house and tap Look, or tap a house on the screen.')]); }
  key(e) {
    if (!this.root.isConnected || document.documentElement.classList.contains('athens-open')) return;
    if (e.type === 'keydown' && e.key === 'Escape' && e.target !== this.input) { this.back(); return; }
    if (!this.walking || e.target === this.input) return; const S = this.scene, k = e.key.toLowerCase(), on = e.type === 'keydown';
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { this.keys[k] = on; e.preventDefault(); const K = this.keys, i = S.walk.input; i.fwd = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0); i.side = (K.d ? 1 : 0) - (K.a ? 1 : 0); i.run = !!K.shift; if (on && k === 'arrowleft') S.walkLook(-40, 0); if (on && k === 'arrowright') S.walkLook(40, 0); }
  }

  // ------------------------------------------------------------------ touch
  down(e) {
    this.canvas.setPointerCapture && e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 }; this.ptr.set(e.pointerId, p);
    if (this.walking && (!this.dir || this.joyOn()) && e.clientX < innerWidth / 2 && e.clientY > innerHeight * .5 && !this.stickId) { this.stickId = e.pointerId; p.stick = true; }
  }
  move(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
    const S = this.scene; if (!S || this.mapMode) return;
    if (S.walking && this.dir && !p.stick) { if (this.ptr.size >= 2) { const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.dir.zoom(d / this.pinch); this.pinch = d; return; } if (p.moved > 6) this.dir.look(dx, dy); return; }
    if (S.walking) { if (p.stick) { const ox = Math.max(-50, Math.min(50, p.x - p.x0)), oy = Math.max(-50, Math.min(50, p.y - p.y0)); S.walk.input.side = ox / 50; S.walk.input.fwd = -oy / 50; S.walk.input.run = Math.hypot(ox, oy) > 46; this.knob.style.transform = `translate(${ox * .6}px,${oy * .6}px)`; } else S.walkLook(dx, dy); return; }
    if (this.ptr.size >= 2) { const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) S.zoom(this.pinch / d); this.pinch = d; S.pan(dx * .5, dy * .5); return; }
    if (p.moved > 6) { if (S.level === 'world') S.pan(dx, dy); else S.orbit(dx, dy); }
  }
  up(e, cancel) {
    const p = this.ptr.get(e.pointerId); this.ptr.delete(e.pointerId); if (this.ptr.size < 2) this.pinch = 0; if (!p) return;
    if (p.stick) { this.stickId = null; this.knob.style.transform = ''; if (this.scene && this.scene.walk) { const i = this.scene.walk.input; i.fwd = i.side = 0; i.run = false; } return; }
    if (!cancel && p.moved < 10 && performance.now() - p.t < 600) this.tap(e.clientX, e.clientY);
  }
  zoomBy(f) { if (this.scene && !this.mapMode && !this.walking) this.scene.zoom(f); }
  /** a tap on the scene or the map: a house inside a polis, a region name from far away, else the nearest city */
  tap(x, y) {
    if (!this.world) return null;
    if (this.mapMode || !this.scene) return this.mapTap(x, y);
    const S = this.scene;
    if (S.level === 'polis' && S.walking && this.dir) return this.dir.tap(x, y);
    if (S.level === 'polis') { const P = S.pickPerson(x, y, S.walking ? 44 : 26); if (P) { this.talk(P.person, { kind: 'person', i: P.i }); return P; } const h = S.pickHouse(x, y); if (h) this.showHouse(h); return h; }
    if (S.cam.dist > 1100) { const L = S.labels().filter((l) => l.kind === 'region').map((l) => [Math.hypot(l.x - x, l.y - y), l]).sort((a, b) => a[0] - b[0])[0]; if (L && L[0] < 44) { this.goRegion(L[1].ref); return L[1].ref; } }
    const bd = S.cam.dist < 1100 ? S.pickBuilder(x, y, 26) : null; if (bd) { this.buildersCard(bd); return bd; }
    const p = S.pickPolis(x, y); if (p) this.showPolis(p); return p;
  }

  // ------------------------------------------------------------------ the 2D map (a button, and the fallback without 3D)
  toggleMap() { if (!this.scene) return; this.mapMode = !this.mapMode; this.root.classList.toggle('map', this.mapMode); this.dockB.map.classList.toggle('on', this.mapMode); this.dockB.map.textContent = this.mapMode ? '3D view' : 'Map'; this.drawMap(); }
  mapView() {
    const a = this.at, w = this.root.clientWidth || 390, h = this.root.clientHeight || 844, top = 176, bottom = this.card.hidden ? h - 84 : Math.max(top + 160, this.card.getBoundingClientRect().top - 8);
    let b; if (a.plan) b = { x0: -a.plan.R - 12, x1: a.plan.R + 12, z0: -a.plan.R - 12, z1: a.plan.R + 12 }; else if (a.region) { const R = a.region; b = { x0: R.cx - R.rx, x1: R.cx + R.rx, z0: R.cz - R.rz, z1: R.cz + R.rz }; } else b = this.world.bounds;
    const s = Math.min((w - 16) / (b.x1 - b.x0), (bottom - top) / (b.z1 - b.z0)); return { s, ox: w / 2 - (b.x0 + b.x1) / 2 * s, oz: (top + bottom) / 2 - (b.z0 + b.z1) / 2 * s, w, h };
  }
  drawMap() {
    if (!this.world || !(this.mapMode || !this.scene)) return; const V = this.mv = this.mapView(), c = this.map, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(V.w * dpr) || c.height !== Math.round(V.h * dpr)) { c.width = Math.round(V.w * dpr); c.height = Math.round(V.h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#1c3542'; g.fillRect(0, 0, V.w, V.h);
    const X = (x) => V.ox + x * V.s, Z = (z) => V.oz + z * V.s, disc = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), Math.max(1, r * V.s), 0, 6.283); g.fill(); };
    g.font = "600 12px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif"; g.textAlign = 'center';
    if (this.at.plan) {
      const P = this.at.plan; disc(0, 0, P.R + 10, '#a8a070'); disc(0, 0, P.R, '#b9ab8a'); g.lineWidth = 2; g.strokeStyle = '#7f7565'; g.beginPath(); g.arc(X(0), Z(0), P.R * V.s, 0, 6.283); g.stroke(); disc(0, 0, P.agoraR, '#c3b494'); disc(0, 0, P.hillR, P.gold ? '#c8a24a' : '#9c6b3c');
      for (const D of P.districts) { g.fillStyle = 'rgba(243,236,224,.14)'; g.fillRect(X(D.x0 - 3), Z(D.z0 - 3), (D.w + 6) * V.s, (D.h + 6) * V.s); }
      for (const h of P.houses) { g.fillStyle = TONE_HEX[h.tone] || TONE_HEX.plain; g.fillRect(X(h.x - h.hx), Z(h.z - h.hz), Math.max(2, h.hx * 2 * V.s), Math.max(2, h.hz * 2 * V.s)); }
      g.fillStyle = '#14110e'; for (const D of P.districts) g.fillText(D.name, X(D.x), Z(D.z0) - 4);
    } else {
      const W = this.world; const des = new Set(W.regions.filter((R) => R.kind === 'desert').map((R) => R.key)); for (const d of W.land) disc(d.x, d.z, d.r + 7, des.has(d.region) ? '#efd9a6' : '#dcc995'); for (const d of W.land) disc(d.x, d.z, d.r, des.has(d.region) ? '#e2c58c' : '#a8a070');
      for (const f of W.features || []) disc(f.x, f.z, f.s * .6, f.kind === 'oasis' ? '#4f86a0' : '#c9a060');
      g.strokeStyle = 'rgba(138,90,44,.55)'; g.lineWidth = 1; g.beginPath(); for (const r of W.routes) { const a = W.poleis[r.a], b = W.poleis[r.b]; g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); } g.stroke();
      for (const p of W.poleis) { const s = Math.max(0, Math.min(1, p.share || 0)); disc(p.x, p.z, p.mr * .8, p.capital ? '#f3ece0' : p.activity.state === 'ruin' ? '#b08a5e' : s > .5 ? '#7f8a52' : s > .2 ? '#d9c7a0' : '#c96a4a'); if (p.gold) disc(p.x, p.z, p.mr * .32, '#c8a24a'); if (p.activity.state === 'working') disc(p.x + p.mr * .6, p.z - p.mr * .6, Math.max(3.2 / V.s, p.mr * .22), '#f4a63c'); }
      for (const b of W.builders) { g.fillStyle = '#f0c45c'; g.fillRect(X(b.tx) - 2.5, Z(b.tz) - 2.5, 5, 5); }
      g.fillStyle = '#14110e'; g.strokeStyle = 'rgba(243,236,224,.85)'; g.lineWidth = 3;
      const names = this.at.region ? this.at.region.poleis.slice(0, 14).map((p) => [p.name, p.x, p.z - p.mr - 3]) : W.regions.map((R) => [R.name, R.cx, R.cz]);
      for (const [t, x, z] of names) { g.strokeText(t, X(x), Z(z)); g.fillText(t, X(x), Z(z)); }
    }
    if (this.sel) { g.strokeStyle = '#e8bb55'; g.lineWidth = 2.5; g.beginPath(); g.arc(X(this.sel.x), Z(this.sel.z), Math.max(8, this.sel.selR * V.s), 0, 6.283); g.stroke(); }
  }
  mapTap(x, y) {
    const V = this.mv; if (!V) return null; const wx = (x - V.ox) / V.s, wz = (y - V.oz) / V.s, lim = 26 / V.s; let best = null, bd = lim;
    if (this.at.plan) { for (const h of this.at.plan.houses) { const d = Math.hypot(h.x - wx, h.z - wz); if (d < bd) { bd = d; best = h; } } if (best) this.showHouse(best); return best; }
    for (const p of this.world.poleis) { const d = Math.hypot(p.x - wx, p.z - wz) - p.mr * .8; if (d < bd) { bd = d; best = p; } } if (best) this.showPolis(best); return best;
  }

  /** once a frame: the labels and the walking line */
  frame() {
    const S = this.scene; if (!S) return; this.tick++;
    if (this.mapMode) return;
    const L = this.tick % 2 ? null : S.labels(); if (L) { for (let i = 0; i < Math.max(L.length, this.labelPool.length); i++) { let d = this.labelPool[i]; if (!d) { d = this.labelPool[i] = el('div', 'hel-label'); this.labels.append(d); }
      const l = L[i]; if (!l || l.y < (S.walking ? 112 : 182)) { d.hidden = true; continue; } d.hidden = false; const key = l.text + '|' + (l.sub || ''); if (d.dataset.k !== key) { d.dataset.k = key; d.replaceChildren(el('b', '', l.text)); if (l.sub) d.append(el('small', '', l.sub)); } d.className = 'hel-label ' + l.kind + (l.sub ? ' wide' : ''); d.style.transform = `translate(${Math.round(l.x)}px,${Math.round(l.y)}px) translate(-50%,-100%)`; } }
    if (this.tick % 10 === 0 && this.world && this.world.events.length) this.ticker.hidden = !this.card.hidden || S.level !== 'world' || S.walking;
    if (S.walking && this.tick % 10 === 0) { const near = S.peopleNear(S.walk.x, S.walk.z, 4, 30), key = near.map((e) => e.P.i + ':' + Math.round(e.d)).join(',');
      if (key !== this.stripKey) { this.stripKey = key; this.peopleStrip.replaceChildren(...(near.length ? [el('span', '', 'People nearby')] : []), ...near.map((e) => { const b = btn(`${e.P.person.short} · ${Math.max(1, Math.round(e.d))} m`, () => this.talk(e.P.person, { kind: 'person', i: e.P.i })); if (e.P.kind === 'keeper') b.classList.add('keeper'); return b; })); }
      this.talkB.disabled = !(near[0] && near[0].d <= 3); this.talkB.textContent = near[0] && near[0].d <= 3 ? 'Talk to ' + near[0].P.person.short : 'Talk'; }
    if (S.walking && this.tick % 12 === 0) { const w = whereInPolis(this.at.plan, S.walk.x, S.walk.z); this.where.textContent = w.agora ? 'The agora, under the acropolis' : w.village ? `${w.district.name} · ${w.village.name}${w.house ? ' · ' + w.house.row.title : ''}` : 'A street of ' + this.at.polis.name; }
  }
}
