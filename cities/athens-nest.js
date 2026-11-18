// ATHENS NEST: the interface of the nested world. Athens -> district -> village (one app) -> house (one item), a Places sheet with
// breadcrumbs, the house card, villagers you can tap, and the street-level WALK mode (joystick, look, compass, tour guide).
// Read only: it opens Olympus apps by link and never calls a trading or money function. AGORA look (athens-nest.css).
import { GROUPS } from './athens-plan.js';
import { talkTo, chatCard, villagerPerson, sayShow } from './people-talk.js';
import { whereAmI, compassName, headingTo, angDiff, route, doorOf } from './athens-world.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const hrefOf = (id) => (id === 'zenith' ? '../' : `../${id}/`);
const STATUS = { live: 'Live numbers', example: 'Example numbers (the live file is not published yet)', none: 'No data today' };
const TONE_HEX = { good: '#8fa857', bad: '#c0674a', warn: '#e0b050', info: '#7fa7c2', plain: '#cbbf9f', none: '#8a8478' };
const DIRS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];

export class Nest {
  constructor(ui) {
    this.ui = ui; this.root = ui.root; this.S = ui.scene; this.world = null; this.lv = { level: 'world', d: null, v: null, h: null };
    this.guide = null; this.keys = {}; this.t0 = performance.now(); this.tick = 0;
    const dock = this.root.querySelector('.ath-dock');
    dock.insertAdjacentHTML('beforeend', '<button data-a="n-places" aria-label="Places: districts, villages and houses"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18M5 20v-8l4-3 4 3v8M13 20v-5h5v5M9 20v-4"/></svg><span>Places</span></button><button data-a="n-walk" aria-label="Walk the streets"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13" cy="4.5" r="2"/><path d="M12 8l-3 4 3 2v6M12 8l3 3 3 1M9 12l-2 5"/></svg><span>Walk</span></button>');
    this.root.insertAdjacentHTML('beforeend', `
      <div class="ath-compass" hidden aria-hidden="true"><i></i></div><div class="ath-where" hidden aria-live="polite"></div><span class="ath-hlabel" hidden></span>
      <div class="ath-stickzone" hidden><div class="ath-stickhint">Drag here to walk. Drag the other side to look.</div><div class="ath-stickbase" hidden><div class="ath-stickknob"></div></div></div>
      <nav class="ath-walkbar" hidden aria-label="Walk tools"><button data-a="n-exit">Leave</button><button data-a="n-guide" aria-pressed="false">Guide</button><button data-a="n-run" aria-pressed="false">Run</button><button data-a="n-places">Places</button><button data-a="n-talk" disabled>Talk</button></nav>
      <div class="ath-people" hidden aria-label="People nearby"></div><span class="ath-plabel" hidden></span>`);
    this.compass = this.root.querySelector('.ath-compass'); this.where = this.root.querySelector('.ath-where'); this.hlabel = this.root.querySelector('.ath-hlabel');
    this.zone = this.root.querySelector('.ath-stickzone'); this.walkbar = this.root.querySelector('.ath-walkbar'); this.people = this.root.querySelector('.ath-people'); this.plabel = this.root.querySelector('.ath-plabel'); this.talkB = this.walkbar.querySelector('[data-a=n-talk]');
    this.people.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { if (this.dir && this.S && this.S.walk) this.dir.goTalk(+b.dataset.i); else this.talkNpc(+b.dataset.i); } });     // QA6: walking directed, you walk up to them first
    this.onPeopleClose = () => { if (this.S) this.S.talkNpc = null; this.kitTalk = false; if (this.dir) this.dir.endTalk(true); }; addEventListener('olympus:people:close', this.onPeopleClose);
    this.marks = DIRS.map(([n]) => { const s = el('span', null, n); this.compass.append(s); return s; });
    this.bindStick();
    this.onKey = (e) => { if (!this.S || !this.S.walk) return; const k = e.key.toLowerCase(), on = e.type === 'keydown'; if ('wasd'.includes(k) && k.length === 1 || k.startsWith('arrow')) { this.keys[k] = on; this.guideOff(); this.applyKeys(); e.preventDefault(); } if (k === 'shift') { this.keys.shift = on; this.applyKeys(); } };
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
  }
  setScene(S) { this.S = S; }
  setWorld(world) {
    this.world = world; const c = world.counts, sub = this.root.querySelector('#athSub');
    if (sub) sub.textContent = `${c.houses} houses from ${c.apps} apps · ${c.none} without data`;
    if (this.ui.sheet === 'places') this.renderPlaces();
  }
  dispose() { removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey); }

  // ------------------------------------------------------------------ breadcrumbs and the cards
  crumbs(v, h) {
    const w = this.world, d = v && w ? w.districts.find((x) => x.key === v.group) : this.lv.d && w ? w.districts.find((x) => x.key === this.lv.d) : null;
    return `<nav class="ath-crumbs" aria-label="Where you are in the city"><button data-a="n-world">Athens</button>${d ? `<b>›</b><button data-a="n-district" data-k="${d.key}">${esc(d.name)}</button>` : ''}${v ? `<b>›</b><button data-a="n-village" data-id="${esc(v.id)}">${esc(v.name)}</button>` : ''}${h ? `<b>›</b><span>${esc(h.row ? h.row.label : 'Empty plot')}</span>` : ''}</nav>`;
  }
  villageFor(a) { return this.world ? this.world.byId.get(a.id) || null : null; }
  /** extra lines inside a temple / hamlet card */
  cardExtra(a) {
    const v = a.kind === 'app' ? this.villageFor(a) : null; if (!v) return '';
    return `${this.crumbs(v)}<p class="ath-vline"><b>${esc(v.name)} village:</b> ${v.real ? `${v.real} house${v.real === 1 ? '' : 's'} (one per item). ` : ''}${esc(STATUS[v.status])}.</p><p class="ath-vfact">${esc(v.fact)}</p>
      <div class="ath-btns"><button data-a="n-village" data-id="${esc(v.id)}">Visit the village</button><button data-a="n-walkto" data-id="${esc(v.id)}">Walk there</button></div>`;
  }
  houseHTML(v, h, inSheet) {
    const real = h.real, g = GROUPS.find((x) => x.key === v.group) || GROUPS[4], tone = h.row ? h.row.tone : 'none';
    return `${this.crumbs(v, h)}<span class="ath-pill" style="--c:${TONE_HEX[tone]}">${esc(v.name)} · ${real ? 'a house' : 'empty plot'}</span><h3>${esc(h.row ? h.row.label : 'Empty plot')}</h3>
      <p>${esc(h.row ? h.row.say : v.status === 'none' ? v.name + ' has no data today, so this plot stays empty.' : 'A free plot of the village: this app has no more items to show.')}</p><p class="ath-vline">${esc(STATUS[v.status])}${h.hall ? ' · the hamlet hall' : ''} · ${esc(g.name)}</p>
      <div class="ath-btns"><a class="ath-go" href="${hrefOf(v.id)}">Open ${esc(v.name)}</a><button data-a="n-walkhouse" data-v="${v.idx}" data-k="${h.k}">Walk here</button>${inSheet ? `<button data-a="n-village" data-id="${esc(v.id)}">Village</button>` : `<button data-a="n-fly" data-v="${v.idx}" data-k="${h.k}">Fly here</button>`}</div>`;
  }
  showHouse(h) {
    const v = this.world.villages[h.village], ui = this.ui, S = this.S; if (!v) return;
    ui.card.innerHTML = `<button class="ath-x" data-a="cardx" aria-label="Close card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>${this.houseHTML(v, h, false)}`;
    ui.card.hidden = false; ui.cur = { x: h.x, z: h.z, y: h.h, kind: 'house' }; this.root.classList.add('has-card'); this.lv = { level: 'house', d: v.group, v, h };
    S.select({ x: h.x, y: h.h + (h.y || 0), z: h.z, r: 8, major: false }); window.OLYMPUS?.cue?.('tap');
  }
  /** the villager with index i, as a tap would find it */
  npcHit(i) { const S = this.S, n = S.npcs[i], q = S.npcPos && S.npcPos[i]; if (!n || !q) return null; const v = this.world.villages[q.near === 'a' ? n.a : n.b]; return { npc: n, village: v, fact: v.fact }; }
  talkNpc(i) { const hit = this.npcHit(i); if (hit) this.showNpc(hit); }
  /** talk to a villager: the shared People kit when it is loaded (villager:<app-id>), else the card with our own six questions */
  showNpc(hit) {
    const ui = this.ui, v = hit.village, g = GROUPS.find((x) => x.key === v.group) || GROUPS[4];
    const person = villagerPerson(v, hit.npc.i); this.S.talkNpc = hit.npc.i; this.lastTalk = { id: person.id, how: talkTo(person, { anchor: ui.card }), voice: sayShow(person, 'athens', { anchor: ui.card, project: (() => { const S = this.S, i = hit.npc.i; return () => { const q = S.npcPos && S.npcPos[i]; if (!q) return { x: 0, y: 0, front: false }; const r = S.canvas ? S.canvas.getBoundingClientRect() : { left: 0, top: 0 }, v = S.project(q.x, (S.walk ? 1 : 2.4) * 1.9, q.z); return { x: r.left + v.x, y: r.top + v.y, front: !!v.vis }; }; })() }) };
    if (this.lastTalk.how === 'kit') { this.kitTalk = true; ui.card.hidden = true; return; }
    ui.card.innerHTML = `<button class="ath-x" data-a="cardx" aria-label="Close card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button><span class="ath-pill" style="--c:${esc(g.tint)}">Villager · ${esc(g.name)}</span><h3>${esc(v.name)} villager</h3><p class="ath-vfact">${esc(hit.fact)}</p>
      <div class="ath-btns"><a class="ath-go" href="${hrefOf(v.id)}">Open ${esc(v.name)}</a><button data-a="n-village" data-id="${esc(v.id)}">Visit the village</button></div>`;
    ui.card.append(chatCard(person)); ui.card.hidden = false; ui.cur = null; this.root.classList.add('has-card'); window.OLYMPUS?.cue?.('tap');
  }
  /** a tap on the 3D view: true when a villager or a house took it */
  tap(px, py) {
    const S = this.S; if (!S || !this.world) return false;
    if (S.walk && this.dir) { const r = S.canvas ? S.canvas.getBoundingClientRect() : { left: 0, top: 0 }; this.ui.hideCard(); this.dir.tap(px + r.left, py + r.top); return true; }
    const n = S.pickNpc(px, py, 46); if (n) { this.showNpc(n); return true; }
    const a = S.pick(px, py, 44), h = S.pickHouse(px, py, 30), near = S.walking || S.cam.dist < 330;
    if (h && (near || !a)) { this.showHouse(h); return true; }
    return false;
  }

  // ------------------------------------------------------------------ the Places sheet: world -> district -> village -> house
  openPlaces(level) { const ui = this.ui; if (level) Object.assign(this.lv, level); ui.hideCard(); ui.sheet = 'places'; ui.sheetEl.hidden = false; ui.root.classList.add('has-sheet'); this.renderPlaces(); }
  renderPlaces() {
    const ui = this.ui, w = this.world, box = ui.sheetEl, L = this.lv; const key = L.level + (L.v ? L.v.id : '') + (L.d || ''); if (key !== this._pk) { box.scrollTop = 0; this._pk = key; }
    if (!w) { box.innerHTML = '<header><h3>Places</h3><button class="ath-x" data-a="sheetx" aria-label="Close">×</button></header><p class="ath-note">The villages are still loading.</p>'; return; }
    let body = '';
    const v = L.v, d = L.d && w.districts.find((x) => x.key === L.d);
    if (L.level === 'world') {
      body = `${this.crumbs()}<p class="ath-note"><b>${esc(w.summary)}</b> Every house is one real item of an app. Houses near a temple are the newest.</p><div class="ath-dgrid">${w.districts.map((x) => `<button class="ath-dtile" style="--c:${x.tint}" data-a="n-district" data-k="${x.key}"><b>${esc(x.name)}</b><span>${x.houses} houses · ${x.villages.length} villages</span><small>${x.noData ? x.noData + ' without data today' : 'every village has data'}</small></button>`).join('')}</div>`;
    } else if (L.level === 'district' && d) {
      body = `${this.crumbs()}<p class="ath-note">${esc(d.blurb)}. ${d.houses} houses in ${d.villages.length} villages.</p>${d.villages.map((i) => { const q = w.villages[i]; return `<button class="ath-vrow ${q.real ? '' : 'empty'}" style="--c:${q.colour}" data-a="n-village" data-id="${esc(q.id)}"><i></i><b>${esc(q.name)}</b><small>${q.real ? q.real + ' house' + (q.real === 1 ? '' : 's') + ' · ' + (q.status === 'live' ? 'live' : 'example') : 'no data today'}${q.temple ? '' : ' · hamlet'}</small></button>`; }).join('')}`;
    } else if (L.level === 'village' && v) {
      body = `${this.crumbs(v)}<h3 class="ath-vh">${esc(v.name)} village</h3><p class="ath-note">${esc(STATUS[v.status])}. ${esc(v.fact)}</p><canvas class="ath-vmap" width="340" height="170" aria-label="Map of the village houses. Tap a house."></canvas>
        <div class="ath-btns"><a class="ath-go" href="${hrefOf(v.id)}">Open ${esc(v.name)}</a><button data-a="n-walkto" data-id="${esc(v.id)}">Walk there</button></div>
        <div class="ath-hlist">${v.houses.map((h) => `<button class="ath-hrow" data-a="n-house" data-v="${v.idx}" data-k="${h.k}"><i style="background:${TONE_HEX[h.row ? h.row.tone : 'none']}"></i><b>${esc(h.row ? h.row.label : 'Empty plot')}</b></button>`).join('')}</div>`;
    } else if (L.level === 'house' && v && L.h) body = this.houseHTML(v, L.h, true);
    box.innerHTML = `<header><h3>Places</h3><button class="ath-x" data-a="sheetx" aria-label="Close">×</button></header>${body}`;
    const cv = box.querySelector('.ath-vmap'); if (cv && v) this.drawVillage(cv, v);
  }
  drawVillage(cv, v) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.fillStyle = '#211c16'; c.fillRect(0, 0, W, H);
    const xs = v.houses.map((h) => h.x).concat(v.x), zs = v.houses.map((h) => h.z).concat(v.z), x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, z0 = Math.min(...zs) - 12, z1 = Math.max(...zs) + 12;
    const s = Math.min((W - 20) / (x1 - x0), (H - 20) / (z1 - z0)), ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (z1 - z0)) / 2; this.vm = { s, ox, oy, x0, z0, v };
    c.strokeStyle = '#3a3228'; c.lineWidth = 1; for (let g = Math.ceil((x0 - 15) / 30) * 30 + 15; g < x1; g += 30) { c.beginPath(); c.moveTo(ox + (g - x0) * s, 0); c.lineTo(ox + (g - x0) * s, H); c.stroke(); }
    for (let g = Math.ceil((z0 - 15) / 30) * 30 + 15; g < z1; g += 30) { c.beginPath(); c.moveTo(0, oy + (g - z0) * s); c.lineTo(W, oy + (g - z0) * s); c.stroke(); }
    c.fillStyle = v.colour; c.fillRect(ox + (v.x - x0) * s - 5, oy + (v.z - z0) * s - 5, 10, 10);
    for (const h of v.houses) { c.fillStyle = TONE_HEX[h.row ? h.row.tone : 'none']; const w = Math.max(7, h.w * s), d = Math.max(7, h.d * s); c.fillRect(ox + (h.x - x0) * s - w / 2, oy + (h.z - z0) * s - d / 2, w, d); if (this.lv.h === h) { c.strokeStyle = '#f1d9a0'; c.lineWidth = 2; c.strokeRect(ox + (h.x - x0) * s - w / 2 - 2, oy + (h.z - z0) * s - d / 2 - 2, w + 4, d + 4); } }
    cv.onclick = (ev) => { const r = cv.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, py = (ev.clientY - r.top) * H / r.height; let best = null, bd = 22; for (const h of v.houses) { const d = Math.hypot(ox + (h.x - x0) * s - px, oy + (h.z - z0) * s - py); if (d < bd) { bd = d; best = h; } } if (best) this.goHouse(v, best); };
  }
  goHouse(v, h) { this.lv = { level: 'house', d: v.group, v, h }; this.S.select({ x: h.x, y: h.h + (h.y || 0), z: h.z, r: 8, major: false }); this.S.flyTo(h.x, h.z, { dist: 46, pitch: .6, dur: 1.1 }); this.renderPlaces(); }

  // ------------------------------------------------------------------ actions
  act(a, b) {
    const S = this.S, w = this.world, ui = this.ui, id = b && b.dataset.id, vv = b && b.dataset.v != null ? w && w.villages[+b.dataset.v] : null;
    if (a === 'n-places') { if (ui.sheet === 'places') return ui.closeSheet(); return this.openPlaces(); }
    if (!w) return;
    if (a === 'n-world') { this.lv = { level: 'world', d: null, v: null, h: null }; S.select(null); S.flyTo(-20, 40, { dist: 980, yaw: 2.55, pitch: .5, dur: 1.6 }); return this.openPlaces(); }
    if (a === 'n-district') { const d = w.districts.find((x) => x.key === b.dataset.k); this.lv = { level: 'district', d: d.key, v: null, h: null }; S.select(null); S.flyTo(d.x, d.z, { dist: 430, pitch: .62, dur: 1.4 }); return this.openPlaces(); }
    if (a === 'n-village') { const v = w.byId.get(id); if (!v) return; this.lv = { level: 'village', d: v.group, v, h: null }; S.select({ x: v.x, y: 14, z: v.z, major: true }); S.flyTo(v.x, v.z, { dist: 105, pitch: .62, dur: 1.3 }); ui.hideCard(); return this.openPlaces(); }
    if (a === 'n-house') { const v = vv; return this.goHouse(v, v.houses[+b.dataset.k]); }
    if (a === 'n-fly') { const h = vv.houses[+b.dataset.k]; return S.flyTo(h.x, h.z, { dist: 46, pitch: .6, dur: 1.1 }); }
    if (a === 'n-walk') { if (S.walk) return; return this.walkNear(); }
    if (a === 'n-walkto') { const v = w.byId.get(id); return v && this.walkAtVillage(v); }
    if (a === 'n-walkhouse') { const h = vv.houses[+b.dataset.k]; return this.walkAtVillage(vv, h); }
    if (a === 'n-exit') return this.exitWalk();
    if (a === 'n-talk') { const S = this.S, me = S.walk; if (!me || !S.npcPos) return; let best = -1, bd = 3; S.npcPos.forEach((q, i) => { const d = Math.hypot(q.x - me.x, q.z - me.z); if (d <= bd) { bd = d; best = i; } }); if (best >= 0) { if (this.dir) this.dir.goTalk(best); else this.talkNpc(best); } return; }
    if (a === 'n-guide') return this.guide ? this.guideOff() : this.guideOn();
    if (a === 'n-run') { this.run = !this.run; b.setAttribute('aria-pressed', String(this.run)); this.applyInput(); }
  }
  walkNear() {
    const w = this.world, c = this.S.cam; let v = null, bd = 1e9;
    for (const q of w.villages) { const d = Math.hypot(q.x - c.tx, q.z - c.tz); if (q.houses.length && d < bd) { bd = d; v = q; } }
    return v && this.walkAtVillage(v);
  }
  walkAtVillage(v, house) {
    const S = this.S, ui = this.ui; if (!S.col) return false;
    const door = doorOf(S.col, v), tx = house ? house.x : v.x, tz = house ? house.z : v.z;
    this.lv = { level: house ? 'house' : 'village', d: v.group, v, h: house || null };
    // stand 40 m down the street from the door and look along it, so the houses of the village line both sides of the view
    let sx = door.x, sz = door.z, yaw = headingTo(door.x, door.z, tx, tz);
    if (!house) for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const px = door.x + ux * 40, pz = door.z + uz * 40; if (!S.col.hits(px, pz, 1.2) && !route(S.col, { x: px, z: pz }, door) === false) { sx = px; sz = pz; yaw = headingTo(px, pz, door.x, door.z); break; } }
    if (!S.startWalk(sx, sz, yaw)) return false;
    ui.closeSheet(); ui.hideCard(); S.select(null); this.root.classList.add('walking');
    for (const e of [this.compass, this.where, this.zone, this.walkbar]) e.hidden = false;
    this.zone.querySelector('.ath-stickhint').hidden = false; this.run = false; this.walkbar.querySelector('[data-a=n-run]').setAttribute('aria-pressed', 'false');
    const directed = this.direct(); if (directed) this.zone.hidden = !this.joyOn();
    ui.toast(directed ? `You stand in ${v.name} village. Tap the street to walk, tap someone to talk.` : `You stand in ${v.name} village. Walk with the left thumb, look with the right.`); return true;
  }
  // SCENE DIRECTION (QA6, athens-direct.js + olympus/camera-rig.js + controls.js): third person on the terrain, tap the street to walk, tap someone to
  // walk up and talk, drag to look, pinch to zoom; the thumb joystick only as an option (?joy=1); ?direct=0 keeps the first-person walker.
  joyOn() { try { return new URLSearchParams(location.search).get('joy') === '1'; } catch (e) { return false; } }
  direct() {
    const S = this.S; this.undirect(); try { if (new URLSearchParams(location.search).get('direct') === '0') return false; } catch (e) { /* no URL */ }
    if (!S || !S.walk) return false;
    import('./athens-direct.js?v=d1').then((M) => { if (!S.walk || this.dir) return;
      this.dir = M.createAthensDirector(S, { container: this.root, canvas: S.canvas, reduced: S.reduced, guiding: () => !!(this.guide && this.guide.driving), nameOf: (i) => { const h = this.npcHit(i); return h ? villagerPerson(h.village, i).name : 'the villager'; },
        onTalk: (i) => { S.talkHold = false; this.talkNpc(i); }, onHouse: (h) => this.showHouse(h) });
      S.walkDirector = this.dir; window.__athensDirector = this.dir; }).catch(() => { this.zone.hidden = false; });
    return true;
  }
  undirect() { if (this.dir) { try { this.dir.dispose(); } catch (e) { /* gone */ } } this.dir = null; if (this.S) { this.S.walkDirector = null; this.S.talkHold = false; } try { delete window.__athensDirector; } catch (e) { /* fine */ } }
  exitWalk() {
    const S = this.S; if (!S || !S.walk) return; this.guideOff(); this.undirect(); S.stopWalk(); this.root.classList.remove('walking');
    for (const e of [this.compass, this.where, this.zone, this.walkbar, this.hlabel, this.people, this.plabel]) e.hidden = true; this.keys = {}; this.peopleKey = '';
  }

  // ------------------------------------------------------------------ the thumb stick (left half) and keys
  bindStick() {
    const z = this.zone, base = z.querySelector('.ath-stickbase'), knob = base.firstElementChild; let id = null, ox = 0, oy = 0; const R = 46;
    const set = (cx, cy) => { let dx = cx - ox, dy = cy - oy; const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; this.stick = { fwd: -dy / R, side: dx / R }; this.applyInput(); };
    z.addEventListener('pointerdown', (e) => { if (id != null) return; id = e.pointerId; try { z.setPointerCapture(id); } catch (err) { /* synthetic pointer */ } const r = z.getBoundingClientRect(); ox = e.clientX; oy = e.clientY; base.hidden = false; base.style.left = (ox - r.left - 48) + 'px'; base.style.top = (oy - r.top - 48) + 'px'; z.querySelector('.ath-stickhint').hidden = true; this.guideOff(); set(ox, oy); e.preventDefault(); });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; base.hidden = true; this.stick = null; knob.style.transform = ''; this.applyInput(); };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end);
  }
  applyKeys() { const k = this.keys; this.kb = { fwd: (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), side: (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) }; this.applyInput(); }
  applyInput() {
    const S = this.S; if (!S || !S.walk) return; if (this.guide && this.guide.driving) return;
    const s = this.stick || this.kb || { fwd: 0, side: 0 }, i = S.walk.input; i.fwd = s.fwd; i.side = s.side; i.run = !!this.run || !!this.keys.shift;
  }

  // ------------------------------------------------------------------ the tour guide: walks the streets village to village
  guideOn() {
    const S = this.S, w = this.world; if (!S || !S.walk || !w) return;
    const order = w.villages.filter((v) => v.real > 0).sort((p, q) => p.group.localeCompare(q.group) || p.x - q.x || p.z - q.z);
    if (!order.length) return this.ui.toast('No village has data to show today.');
    const me = S.walk; let i = 0, bd = 1e9; order.forEach((v, k) => { const d = Math.hypot(v.x - me.x, v.z - me.z); if (d < bd) { bd = d; i = k; } });
    this.guide = { order, i, pts: null, pi: 0, wait: 0, driving: true, stuck: 0, last: [me.x, me.z] }; this.walkbar.querySelector('[data-a=n-guide]').setAttribute('aria-pressed', 'true'); this.guideLeg(true);
  }
  guideOff() { if (!this.guide) return; this.guide = null; const b = this.walkbar.querySelector('[data-a=n-guide]'); b && b.setAttribute('aria-pressed', 'false'); if (this.S && this.S.walk) { this.S.walk.input.fwd = 0; this.S.walk.input.side = 0; } }
  guideLeg(first) {
    const G = this.guide, S = this.S, me = S.walk, v = G.order[G.i], door = doorOf(S.col, v); G.target = v; G.arrived = false; G.wait = 0;
    G.pts = first && Math.hypot(door.x - me.x, door.z - me.z) < 3 ? [[door.x, door.z]] : (route(S.col, { x: me.x, z: me.z }, door) || [[me.x, me.z], [door.x, door.z]]).slice(1); G.pi = 0;
    this.ui.toast(`Walking to ${v.name}`);
  }
  guideFrame(dt) {
    const G = this.guide, S = this.S; if (!G || !S.walk) return; const me = S.walk, i = me.input;
    if (G.arrived) {
      const v = G.target; G.wait -= dt; i.fwd = 0; i.side = 0; me.yaw += angDiff(me.yaw, headingTo(me.x, me.z, v.x, v.z)) * Math.min(1, dt * 2.5);
      if (G.wait <= 0) { G.i = (G.i + 1) % G.order.length; this.guideLeg(false); } return;
    }
    const p = G.pts[G.pi]; if (!p) { G.arrived = true; G.wait = 4.2; this.ui.toast(G.target.fact); return; }
    const want = headingTo(me.x, me.z, p[0], p[1]), diff = angDiff(me.yaw, want), dist = Math.hypot(p[0] - me.x, p[1] - me.z);
    me.yaw += diff * Math.min(1, dt * 4); i.side = 0; i.fwd = Math.abs(diff) < .7 ? 1 : .15; i.run = false;
    if (dist < 1.4) { G.pi++; G.stuck = 0; }
    if (Math.hypot(me.x - G.last[0], me.z - G.last[1]) < dt * .4) G.stuck += dt; else { G.stuck = 0; G.last = [me.x, me.z]; }
    if (G.stuck > 1.6) { G.stuck = 0; G.pi++; if (G.pi >= G.pts.length && dist > 6) { G.i = (G.i + 1) % G.order.length; this.guideLeg(false); } }
  }

  // ------------------------------------------------------------------ every frame
  frame() {
    const S = this.S; if (S && S.talkNpc != null && !this.kitTalk && !S.talkHold && this.ui.card.hidden) { S.talkNpc = null; if (this.dir) this.dir.endTalk(true); }   // the chat card closed: the villager walks on
    if (!S || !S.walk) return; const now = performance.now(), dt = Math.min(.1, (now - this.t0) / 1000); this.t0 = now; this.tick++;
    this.guideFrame(dt); if (this.tick % 2) return;
    const me = S.walk, yaw = me.yaw, W = whereAmI(this.world, me.x, me.z), cw = this.compass.clientWidth || 340;
    DIRS.forEach(([n, deg], k) => { const diff = angDiff(yaw, deg * Math.PI / 180) * 180 / Math.PI, s = this.marks[k]; if (Math.abs(diff) > 62) { s.style.display = 'none'; return; } s.style.display = ''; s.style.left = (50 + diff / 124 * 100) + '%'; });
    this.where.textContent = `Facing ${compassName(yaw)} · ${W.district} district${W.village ? ' · ' + W.village.name + ' village' : ''}`;
    const h = W.house; let show = false;
    if (h && W.houseDist < 26) { const p = S.project(h.x, (h.y || 0) + h.h + 1.6, h.z), dx = angDiff(yaw, headingTo(me.x, me.z, h.x, h.z)); if (p.vis && Math.abs(dx) < 1.1 && p.y > 120 && p.y < S.h - 110) { show = true; this.hlabel.textContent = h.row ? h.row.label : 'Empty plot'; this.hlabel.style.transform = `translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) translate(-50%,-100%)`; this.hlabel.style.setProperty('--c', TONE_HEX[h.row ? h.row.tone : 'none']); this.near = h; } }
    this.hlabel.hidden = !show; void cw;
    // people nearby: a strip of the nearest villagers (tap one to talk), their name over the nearest head, Talk within 3 m
    if (this.tick % 6 === 0 && S.npcPos && S.npcs) { const near = S.npcPos.map((q, i) => [Math.hypot(q.x - me.x, q.z - me.z), i]).filter((e) => e[0] <= 30).sort((a, b) => a[0] - b[0]).slice(0, 4), key = near.map((e) => e[1] + ':' + Math.round(e[0])).join(',');
      const who = (i) => { const h = this.npcHit(i); return h ? villagerPerson(h.village, i).name : 'Villager'; };
      if (key !== this.peopleKey) { this.peopleKey = key; this.people.innerHTML = near.length ? '<span>People nearby</span>' + near.map((e) => `<button data-i="${e[1]}">${esc(who(e[1]))} · ${Math.max(1, Math.round(e[0]))} m</button>`).join('') : ''; this.people.hidden = !near.length; }
      const n0 = near[0]; this.talkB.disabled = !(n0 && n0[0] <= 3); this.nearNpc = n0 && n0[0] <= 14 ? n0[1] : -1; if (this.nearNpc >= 0) this.plabel.textContent = who(this.nearNpc); }
    if (this.nearNpc >= 0 && S.npcPos && S.npcPos[this.nearNpc]) { const q = S.npcPos[this.nearNpc], p = S.project(q.x, (S.walk ? S.walk.y - 1.7 : 0) + 2.2, q.z); this.plabel.hidden = !(p.vis && p.y > 110 && p.y < S.h - 150); this.plabel.style.transform = `translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) translate(-50%,-100%)`; } else if (this.plabel) this.plabel.hidden = true;
  }
}
