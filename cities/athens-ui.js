// ATHENS interface: the full-screen overlay (canvas, labels, minimap, jump list, tours, app card). Plain words, AGORA look.
// Read-only: it opens other Olympus apps by link and never calls a trading or money function.
import { GROUPS, COAST, RIVER, WALL, ACROPOLIS, planAthens } from './athens-plan.js';

const SVG = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/></svg>',
  fly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l18-8-6 16-3-7z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
};
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const txt = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAP = { x0: -640, x1: 660, z0: -600, z1: 560 };

export function appHref(id) { return id === 'zenith' ? '../' : `../${id}/`; }

export class AthensUI {
  constructor(plan = planAthens(), hooks = {}) { this.plan = plan; this.hooks = hooks; this.q = ''; this.scene = null; this.sheet = ''; this.labels = []; this.tick = 0; this.appMap = new Map(plan.apps.map((a) => [a.id, a])); this.light = hooks.reduced ? 'day' : 'auto'; this.live = null; }

  mount(parent = document.body) {
    const root = this.root = el('div', 'ath'); root.id = 'athens'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Athens, the giant Greek metropolis of Olympus');
    root.innerHTML = `
      <canvas class="ath-c" aria-label="Athens: acropolis, agora, theatre, harbour with ships, lighthouse, aqueduct, library, gymnasium, walls and bridges. Drag to look, pinch to zoom, tap a building."></canvas>
      <div class="ath-labels" aria-hidden="true"></div>
      <header class="ath-top">
        <button class="ath-ic" data-a="close" aria-label="Back to Cities">${SVG.close}</button>
        <div class="ath-title"><h2>Athens</h2><small id="athSub">The Olympus metropolis</small></div>
        <button class="ath-ic" data-a="photo" aria-label="Photo mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button>
        <button class="ath-ic" data-a="time" aria-label="Switch between day and dusk" aria-pressed="false">${SVG.moon}</button>
      </header>
      <button class="ath-mini" data-a="mini" aria-label="District map. Tap a spot to fly there."><canvas></canvas></button>
      <div class="ath-tourbar" hidden><span id="athTourName"></span><i><b id="athTourBar"></b></i><button data-a="stop">Stop</button></div>
      <section class="ath-today" hidden><button data-a="today" aria-expanded="true"><b>Athens today</b><i>hide</i></button><div></div></section>
      <section class="ath-first" hidden role="dialog" aria-label="First visit tour"></section>
      <div class="ath-photobar" hidden><button class="ath-go" data-a="save">Save picture</button><button data-a="photodone">Done</button></div>
      <section class="ath-int" hidden></section>
      <section class="ath-card" hidden aria-live="polite"></section>
      <section class="ath-sheet" hidden></section>
      <nav class="ath-dock" aria-label="Athens tools">
        <button data-a="jump">${SVG.list}<span>Find</span></button>
        <button data-a="tours">${SVG.fly}<span>Fly</span></button>
        <button data-a="bigmap">${SVG.map}<span>Map</span></button>
        <button data-a="time2">${SVG.sun}<span>Auto</span></button>
      </nav>
      <div class="ath-loading" id="athLoad">Building Athens… <small>hundreds of houses, 40 temples, the harbour</small></div>`;
    parent.append(root);
    this.canvas = root.querySelector('.ath-c'); this.labelsEl = root.querySelector('.ath-labels'); this.miniB = root.querySelector('.ath-mini'); this.mini = this.miniB.querySelector('canvas');
    this.card = root.querySelector('.ath-card'); this.sheetEl = root.querySelector('.ath-sheet'); this.tourbar = root.querySelector('.ath-tourbar');
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) this.act(b.dataset.a, b, e); });
    this.drawStatic(); this.drawMini();
    return this;
  }

  attach(scene) {
    this.scene = scene; this.root.querySelector('#athLoad')?.remove();
    scene.onTourEnd = () => this.tourState(false);
    // labels for the monuments
    this.labels = scene.anchors.filter((a) => a.major).map((a) => { const e = el('span', 'ath-label', txt(a.name)); e.dataset.g = a.group; this.labelsEl.append(e); return { a, e }; });
    this.appLabels = Array.from({ length: 6 }, () => { const e = el('span', 'ath-label app'); e.style.display = 'none'; this.labelsEl.append(e); return { e }; });
    this.gestures();
    this.root.querySelector('#athSub').textContent = `${scene.houseCount} houses · ${this.plan.apps.length} temples`;
  }

  /** the owner's data arrived: banner of 3 lines, glowing temples, pillar, ships (the scene does the 3D part) */
  setLive(live) {
    this.live = live; if (this.scene) this.scene.setLive(live);
    const t = this.root.querySelector('.ath-today'); t.hidden = false; t.classList.toggle('demo', live.demo);
    t.querySelector('div').innerHTML = live.lines.map((l) => `<p>${txt(l)}</p>`).join('');
    this.labels = this.labels || []; if (this.scene) for (const a of this.scene.anchors) if (a.major && !this.labels.some((l) => l.a === a)) { const e = el('span', 'ath-label', txt(a.name)); e.dataset.g = a.group; this.labelsEl.append(e); this.labels.push({ a, e }); }
    clearTimeout(this.todayT); this.todayT = setTimeout(() => { if (!this.todayTouched) this.act('today'); this.todayTouched = false; }, 14000);
    if (this.sheet === 'jump') this.renderJump();
  }

  // ------------------------------------------------------------------ first visit: 3 steps, shown once
  firstVisit() {
    let seen = false; try { seen = localStorage.getItem('athens.first') === '1'; } catch (e) { /* private mode: show it, it is short */ }
    if (this.hooks.first === false || (seen && this.hooks.first !== true)) return;
    this.firstStep(0);
  }
  firstStep(i) {
    const steps = [
      ['Welcome to Athens', 'One city for everything in Olympus. Drag to turn it, pinch to zoom. The map at the top right shows where you are.', null],
      ['Every temple is an app', 'Tap a temple to open its card. A warm gold glow means that app needs you today. No glow means calm: nothing to do.', [60, 60, { dist: 230, pitch: .5 }]],
      ['Find, Fly and Map', 'The buttons below search by group, fly you on a tour, or open the big map. The light changes slowly; the sun button locks Day or Dusk.', [10, 330, { dist: 260, pitch: .35 }]],
    ];
    if (i >= steps.length) return this.firstDone();
    this.fstep = i; const [h, p, fly] = steps[i], box = this.root.querySelector('.ath-first');
    box.innerHTML = `<small>Step ${i + 1} of 3</small><h3>${txt(h)}</h3><p>${txt(p)}</p><div class="ath-btns"><button data-a="firstskip">Skip</button><button class="ath-go" data-a="firstnext">${i === 2 ? 'Start exploring' : 'Next'}</button></div>`;
    box.hidden = false; this.hideCard(); this.closeSheet(); this.root.classList.add('has-first');
    if (fly && this.scene) this.scene.flyTo(fly[0], fly[1], fly[2]);
  }
  firstDone() { this.root.querySelector('.ath-first').hidden = true; this.root.classList.remove('has-first'); try { localStorage.setItem('athens.first', '1'); } catch (e) { /* fine */ } }

  // ------------------------------------------------------------------ touch: one finger orbits, two fingers pinch and pan, a tap picks
  gestures() {
    const c = this.canvas, S = this.scene, ptr = new Map(); let down = null, pinch = null;
    const stopTour = () => { if (S.touring) { S.stopTour(); this.tourState(false); } S.fly = null; };
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; } });
    c.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (S.interior) { S.interior.look(dx, dy); return; }
      if (S.walk && S.walkDirector) { if (ptr.size === 1) { if (down && down.moved > 6) S.walkDirector.look(dx, dy); } else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch && pinch.d) S.walkDirector.zoom(d / Math.max(10, pinch.d)); pinch = { d, mx: 0, my: 0 }; } return; }     // QA6: the directed walk (athens-direct.js)
      if (S.walk) { if (ptr.size === 1) S.walkLook(dx, dy); return; }
      if (ptr.size === 1) { if (down.moved > 4) stopTour(); S.orbit(dx, dy); }
      else if (ptr.size === 2 && pinch) {
        stopTour(); const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        S.zoom(pinch.d / Math.max(10, d)); S.pan(mx - pinch.mx, my - pinch.my); pinch = { d, mx, my };
      }
    });
    const up = (e) => {
      const was = ptr.size; ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null;
      if (was === 1 && down && down.moved < 9 && performance.now() - down.t < 450) this.tap(e.clientX, e.clientY);
      if (!ptr.size) down = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => { ptr.delete(e.pointerId); pinch = null; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); stopTour(); S.zoom(Math.exp(e.deltaY * .0012)); }, { passive: false });
    c.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') S.orbit(-20, 0); if (e.key === 'ArrowRight') S.orbit(20, 0); if (e.key === '+') S.zoom(.85); if (e.key === '-') S.zoom(1.18); });
    c.tabIndex = 0;
  }

  tap(cx, cy) {
    if (this.scene.interior || this.root.classList.contains('photo')) return;
    const r = this.canvas.getBoundingClientRect(), a = this.scene.pick(cx - r.left, cy - r.top, 44);
    this.closeSheet();
    if (this.nest && this.nest.tap(cx - r.left, cy - r.top)) return;
    if (a) { this.showCard(a); this.scene.select(a); window.OLYMPUS?.cue?.('tap'); } else { this.hideCard(); this.scene.select(null); }
  }

  // ------------------------------------------------------------------ the app card
  showCard(a) {
    const g = GROUPS.find((x) => x.key === a.group) || GROUPS[4], app = a.appId && this.findApp(a.appId);
    this.card.innerHTML = `<button class="ath-x" data-a="cardx" aria-label="Close card">${SVG.close}</button>
      <span class="ath-pill" style="--c:${g.tint}">${txt(g.name)}${a.kind === 'app' ? ' · app' : a.kind === 'ship' ? ' · account ship' : a.kind === 'pillar' ? ' · today' : ' · monument'}</span>
      <h3>${txt(a.name)}</h3><p>${txt(a.blurb)}</p>${this.nest && a.kind === 'app' ? this.nest.cardExtra(a) : ''}${a.need ? `<p class="ath-need"><b>Needs you:</b> ${txt(a.need.title)}. ${txt(a.need.say)}</p>` : a.kind === 'app' && this.live ? '<p class="ath-calm">Calm: nothing to do here right now.</p>' : ''}
      <div class="ath-btns">${a.kind === 'app' ? `<button data-a="enter" data-id="${txt(a.id)}">Enter</button>` : ''}${app && app.id !== 'cities' ? `<a class="ath-go" href="${appHref(app.id)}">Open ${txt(app.name)}</a>` : ''}<button data-a="fly" data-id="${txt(a.id)}">Fly here</button></div>`;
    this.card.hidden = false; this.cur = a; this.root.classList.add('has-card');
  }
  hideCard() { this.card.hidden = true; this.cur = null; this.root.classList.remove('has-card'); }
  findApp(id) { return this.appMap.get(id) || null; }

  // ------------------------------------------------------------------ sheets: find / tours
  toast(msg) { let t = this.root.querySelector('.ath-toast'); if (!t) { t = el('div', 'ath-toast'); t.setAttribute('role', 'status'); this.root.append(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2600); }
  closeSheet() { this.sheetEl.hidden = true; this.sheet = ''; this.root.classList.remove('has-sheet'); }
  openSheet(kind) {
    if (this.sheet === kind) return this.closeSheet();
    this.sheet = kind; this.hideCard(); this.sheetEl.hidden = false; this.root.classList.add('has-sheet');
    if (kind === 'jump') this.renderJump(); else if (kind === 'tours') this.renderTours();
  }
  renderJump() {
    const q = this.q.trim().toLowerCase(), items = [];
    const gi = this.scene ? this.scene.anchors : [];
    const match = (a) => !q || (a.name + ' ' + a.blurb + ' ' + a.group).toLowerCase().includes(q);
    let html = `<header><h3>Find in Athens</h3><button class="ath-x" data-a="sheetx" aria-label="Close">${SVG.close}</button></header>
      <input type="search" class="ath-q" placeholder="Search ${gi.length} places and apps" aria-label="Search Athens" value="${txt(this.q)}" autocomplete="off">
      <div class="ath-groups">`;
    let any = false;
    const needy = gi.filter((a) => a.need && match(a));
    if (needy.length) {
      any = true; html += `<details open><summary style="--c:#e8bb55"><b>Needs you now</b><em>Temples glowing gold</em><span>${needy.length}</span></summary>`;
      for (const a of needy) { items.push(a); html += `<button class="ath-row major" data-a="jumpto" data-i="${items.length - 1}"><i style="background:${a.colour || '#e8bb55'}"></i><b>${txt(a.name)}</b><small>${txt(a.need.title)}</small></button>`; }
      html += '</details>';
    }
    for (const g of GROUPS) {
      const rows = gi.filter((a) => a.group === g.key && match(a)).sort((x, y) => (y.major ? 1 : 0) - (x.major ? 1 : 0) || x.name.localeCompare(y.name));
      if (!rows.length) continue; any = true;
      html += `<details ${q || (g.key === 'trading' && !needy.length) ? 'open' : ''}><summary style="--c:${g.tint}"><b>${g.name}</b><em>${txt(g.blurb)}</em><span>${rows.length}</span></summary>`;
      for (const a of rows) { items.push(a); html += `<button class="ath-row ${a.major ? 'major' : ''}" data-a="jumpto" data-i="${items.length - 1}"><i style="background:${a.colour || g.tint}"></i><b>${txt(a.name)}</b><small>${txt(a.blurb)}</small></button>`; }
      html += '</details>';
    }
    if (!any) html += '<p class="ath-none">Nothing is named that. Try Agora, Parthenon, Oracle or Ledger.</p>';
    html += '</div>';
    this.sheetEl.innerHTML = html; this.items = items;
    const inp = this.sheetEl.querySelector('.ath-q'); inp.oninput = () => { this.q = inp.value; const pos = inp.selectionStart; this.renderJump(); const n = this.sheetEl.querySelector('.ath-q'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  renderTours() {
    const tours = this.plan.tours;
    this.sheetEl.innerHTML = `<header><h3>Flying tours</h3><button class="ath-x" data-a="sheetx" aria-label="Close">${SVG.close}</button></header>
      <p class="ath-note">The camera flies a route for you. Touch the screen to take over.</p>` +
      tours.map((t, i) => `<button class="ath-row tour" data-a="tour" data-i="${i}"><i style="background:#c8a24a"></i><b>${txt(t.name)}</b><small>${txt(t.blurb)} · ${t.secs} s</small></button>`).join('');
  }
  tourState(on, name = '') {
    this.tourbar.hidden = !on; this.root.classList.toggle('touring', on);
    if (on) this.root.querySelector('#athTourName').textContent = name;
  }

  // ------------------------------------------------------------------ actions
  act(a, b, ev) {
    const S = this.scene;
    if (a.startsWith('n-') && this.nest) return this.nest.act(a, b);
    if (a === 'close') return this.hooks.onClose && this.hooks.onClose();
    if (a === 'cardx') { this.hideCard(); S && S.select(null); return; }
    if (a === 'sheetx') return this.closeSheet();
    if (a === 'jump' || a === 'tours') return this.openSheet(a);
    if (a === 'bigmap') { this.closeSheet(); this.root.classList.toggle('bigmap'); this.drawStatic(); this.drawMini(); return; }
    if (a === 'mini') return this.miniTap(ev);
    if (a === 'time' || a === 'time2') { const modes = this.hooks.reduced ? ['day', 'dusk'] : ['auto', 'day', 'dusk']; this.light = modes[(modes.indexOf(this.light) + 1) % modes.length]; this.applyLight(); return; }
    if (a === 'today') { const t = this.root.querySelector('.ath-today'), min = !t.classList.contains('min'); t.classList.toggle('min', min); t.querySelector('button').setAttribute('aria-expanded', String(!min)); t.querySelector('i').textContent = min ? 'show' : 'hide'; this.todayTouched = true; return; }
    if (a === 'photo') { this.root.classList.add('photo'); this.hideCard(); this.closeSheet(); this.root.querySelector('.ath-photobar').hidden = false; return; }
    if (a === 'photodone') { this.root.classList.remove('photo'); this.root.querySelector('.ath-photobar').hidden = true; return; }
    if (a === 'save') return this.savePicture();
    if (a === 'enter') { const x = this.cur; if (x) this.enter(x); return; }
    if (a === 'leave') return this.leave();
    if (a === 'firstnext') return this.firstStep(this.fstep + 1);
    if (a === 'firstskip') return this.firstDone();
    if (a === 'stop') { if (S) { S.stopTour(); } this.tourState(false); return; }
    if (!S) return;
    if (a === 'fly') { const x = this.cur; if (x) S.flyTo(x.x, x.z, { dist: x.major ? 150 : 95, lift: Math.min(20, x.y * .3) }); return; }
    if (a === 'jumpto') { const x = this.items[+b.dataset.i]; this.closeSheet(); S.flyTo(x.x, x.z, { dist: x.major ? 150 : 95, lift: Math.min(20, x.y * .3) }); S.select(x); this.showCard(x); return; }
    if (a === 'tour') { const t = this.plan.tours[+b.dataset.i]; this.closeSheet(); this.hideCard(); S.select(null); S.startTour(t); this.tourState(true, t.name); return; }
  }
  savePicture() {
    const S = this.scene; if (!S) return this.toast('No picture: this device has no 3D view.');
    try {
      const c = S.snapshot(); c.toBlob((b) => {
        if (!b) return this.toast('Could not make the picture.');
        const url = URL.createObjectURL(b), a = document.createElement('a'); a.href = url; a.download = `olympus-athens-${new Date().toISOString().slice(0, 10)}.png`; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000); this.toast('Picture saved.'); this.saved = (this.saved || 0) + 1;
      }, 'image/png');
    } catch (e) { this.toast('Could not make the picture.'); }
  }
  /** a temple interior: 3D hall when the device can, a flat card in LITE */
  enter(a) {
    const S = this.scene, app = this.findApp(a.id), need = a.need, box = this.root.querySelector('.ath-int'), g = GROUPS.find((x) => x.key === a.group);
    const ok = S ? S.enterInterior(a) : false;
    box.className = 'ath-int' + (ok ? '' : ' flat'); box.style.setProperty('--c', a.colour || '#c8a24a');
    box.innerHTML = `<span class="ath-pill" style="--c:${g ? g.tint : '#c8a24a'}">${txt(g ? g.name : '')} \u00b7 inside the temple</span><h3>${txt(a.name)}</h3><p>${txt(a.blurb)}</p>
      ${need ? `<p class="ath-need"><b>Needs you:</b> ${txt(need.title)}. ${txt(need.say)}</p>` : '<p class="ath-calm">Calm: nothing to do here right now.</p>'}
      <div class="ath-btns"><button data-a="leave">Back to the city</button>${app && app.id !== 'cities' ? `<a class="ath-go" href="${appHref(app.id)}">Open ${txt(app.name)}</a>` : ''}</div>`;
    box.hidden = false; this.hideCard(); this.root.classList.add('inside'); if (ok) this.root.classList.add('hall');
  }
  leave() { const S = this.scene; S && S.leaveInterior(); this.root.querySelector('.ath-int').hidden = true; this.root.classList.remove('inside', 'hall'); }
  applyLight() {
    const L = this.light, S = this.scene; S && S.setMode(L); this.root.classList.toggle('dusk', L === 'dusk');
    const lab = { auto: 'Auto', day: 'Day', dusk: 'Dusk' }[L];
    this.root.querySelector('[data-a=time2] span').textContent = lab;
    this.root.querySelectorAll('[data-a=time]').forEach((x) => { x.setAttribute('aria-label', `Light: ${lab}. Tap to change between Auto, Day and Dusk.`); x.setAttribute('aria-pressed', String(L === 'dusk')); });
    this.toast && this.toast(L === 'auto' ? 'Light follows a slow day and dusk (about 90 s).' : L === 'day' ? 'Light locked on day (3500 K).' : 'Light locked on dusk (2700 K).');
  }
  miniTap(ev) {
    if (!this.scene) return;
    const r = this.mini.getBoundingClientRect(), px = ((ev && ev.clientX) || r.left + r.width / 2) - r.left, py = ((ev && ev.clientY) || r.top + r.height / 2) - r.top;
    const k = this.mapScale(r.width, r.height), x = MAP.x0 + (px - k.ox) / k.s, z = MAP.z0 + (py - k.oy) / k.s;
    if (this.root.classList.contains('bigmap')) this.root.classList.remove('bigmap'), this.drawStatic(), this.drawMini();
    this.scene.flyTo(Math.max(-700, Math.min(700, x)), Math.max(-600, Math.min(520, z)), { dist: Math.max(180, Math.min(420, this.scene.cam.dist)), dur: 1.8 });
  }

  // ------------------------------------------------------------------ minimap
  mapScale(w, h) { const s = Math.min(w / (MAP.x1 - MAP.x0), h / (MAP.z1 - MAP.z0)); return { s, ox: (w - s * (MAP.x1 - MAP.x0)) / 2, oy: (h - s * (MAP.z1 - MAP.z0)) / 2 }; }
  drawStatic() {
    const c = this.mini, big = this.root.classList.contains('bigmap'), w = big ? Math.min(360, innerWidth - 32) : 148, h = Math.round(w * (MAP.z1 - MAP.z0) / (MAP.x1 - MAP.x0)), d = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
    const k = this.mapScale(w, h), X = (v) => k.ox + (v - MAP.x0) * k.s, Z = (v) => k.oy + (v - MAP.z0) * k.s;
    x.fillStyle = '#2c4c5e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7a6f4c'; x.beginPath(); x.moveTo(X(MAP.x0), Z(MAP.z0));
    x.lineTo(X(MAP.x1), Z(MAP.z0)); for (let v = MAP.x1; v >= MAP.x0; v -= 20) x.lineTo(X(v), Z(COAST(v) - 4)); x.closePath(); x.fill();
    x.strokeStyle = '#4b7a99'; x.lineWidth = Math.max(2, 24 * k.s); x.lineJoin = 'round'; x.beginPath(); RIVER.forEach(([rx, rz], i) => (i ? x.lineTo(X(rx), Z(rz)) : x.moveTo(X(rx), Z(rz)))); x.stroke();
    for (const dsc of [['trading', 70, 20, 190], ['research', -100, -280, 190], ['money', 20, 215, 170], ['life', -310, 20, 190]]) { const g = GROUPS.find((q) => q.key === dsc[0]); x.fillStyle = g.tint + '40'; x.beginPath(); x.arc(X(dsc[1]), Z(dsc[2]), dsc[3] * k.s, 0, 6.3); x.fill(); }
    x.fillStyle = '#b9a98e'; x.beginPath(); x.arc(X(ACROPOLIS.x), Z(ACROPOLIS.z), ACROPOLIS.base * k.s, 0, 6.3); x.fill();
    x.strokeStyle = '#d6c7a8'; x.lineWidth = 1.2; x.beginPath(); for (let a = 0; a <= 6.29; a += .1) { const px = X(WALL.cx + Math.cos(a) * WALL.a), pz = Z(Math.min(WALL.cz + Math.sin(a) * WALL.b, COAST(WALL.cx + Math.cos(a) * WALL.a) - 24)); a ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.stroke();
    x.fillStyle = 'rgba(232,205,160,.75)'; for (const h of this.plan.houses) x.fillRect(X(h.x) - .5, Z(h.z) - .5, 1.1, 1.1);
    for (const a of this.plan.apps) { x.fillStyle = a.colour; x.fillRect(X(a.x) - 1.6, Z(a.z) - 1.6, 3.2, 3.2); }
    x.fillStyle = '#fff6df'; x.strokeStyle = '#14110e'; x.lineWidth = 1; for (const l of this.plan.landmarks) { x.beginPath(); x.arc(X(l.x), Z(l.z), big ? 4 : 3, 0, 6.3); x.fill(); x.stroke(); }
    if (big) { x.font = '11px Georgia, serif'; x.fillStyle = '#f3ece0'; for (const l of this.plan.landmarks.filter((q) => ['parthenon', 'agora', 'theatre', 'library', 'harbour', 'stadium', 'gymnasium', 'lighthouse'].includes(q.id))) x.fillText(l.name, X(l.x) + 6, Z(l.z) + 3); }
    this.staticMap = { cv: document.createElement('canvas'), k, w, h, d }; this.staticMap.cv.width = c.width; this.staticMap.cv.height = c.height; this.staticMap.cv.getContext('2d').drawImage(c, 0, 0);
  }
  drawMini() {
    const m = this.staticMap; if (!m) return; const c = this.mini, x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(m.cv, 0, 0); x.setTransform(m.d, 0, 0, m.d, 0, 0);
    if (!this.scene) return;
    const cam = this.scene.camera.position, cc = this.scene.cam, X = (v) => m.k.ox + (v - MAP.x0) * m.k.s, Z = (v) => m.k.oy + (v - MAP.z0) * m.k.s;
    const dir = Math.atan2(cc.tx - cam.x, cc.tz - cam.z), px = X(cam.x), pz = Z(cam.z), L = 22, half = .5;
    x.fillStyle = 'rgba(243,236,224,.35)'; x.strokeStyle = '#f3ece0'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, pz); x.lineTo(px + Math.sin(dir - half) * L, pz + Math.cos(dir - half) * L); x.lineTo(px + Math.sin(dir + half) * L, pz + Math.cos(dir + half) * L); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#e8bb55'; x.beginPath(); x.arc(px, pz, 2.6, 0, 6.3); x.fill();
    if (this.scene.sel) { x.strokeStyle = '#e8bb55'; x.lineWidth = 1.5; x.beginPath(); x.arc(X(this.scene.sel.x), Z(this.scene.sel.z), 6, 0, 6.3); x.stroke(); }
  }

  // ------------------------------------------------------------------ per frame
  frame() {
    const S = this.scene; if (!S) return; this.tick++; if (this.nest) this.nest.frame();
    if (this.tick % 3 === 0) { this.drawMini(); if (S.touring) this.root.querySelector('#athTourBar').style.width = Math.round(S.progress * 100) + '%'; }
    if (this.tick % 2) return;
    this.avoid = [this.miniB, this.root.querySelector('.ath-today'), this.root.querySelector('.ath-tourbar')].filter((e) => e && !e.hidden).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const cp = S.camera.position, placed = [];
    const put = (e, a, show) => {
      if (!show) { e.style.display = 'none'; return; } const p = S.project(a.x, a.y + 4, a.z);
      if (!p.vis || p.y < 110 || p.y > S.h - 90 || p.x < 64 || p.x > S.w - 64) { e.style.display = 'none'; return; }
      for (const r of this.avoid) if (p.x > r.left - 60 && p.x < r.right + 60 && p.y > r.top - 14 && p.y < r.bottom + 30) { e.style.display = 'none'; return; }
      for (const q of placed) if (Math.abs(q.x - p.x) < 86 && Math.abs(q.y - p.y) < 18) { e.style.display = 'none'; return; }
      placed.push(p); e.style.display = ''; e.style.transform = `translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) translate(-50%,-100%)`;
    };
    for (const L of this.labels) { const d = Math.hypot(L.a.x - cp.x, L.a.z - cp.z, cp.y - L.a.y); put(L.e, L.a, d < 1500 && d > 25); }
    const near = S.anchors.filter((a) => !a.major).map((a) => [Math.hypot(a.x - cp.x, a.z - cp.z, cp.y - a.y), a]).filter((q) => q[0] < 230).sort((p, q) => p[0] - q[0]).slice(0, this.appLabels.length);
    this.appLabels.forEach((L, i) => { const q = near[i]; if (q) { if (L.e.textContent !== q[1].name) { L.e.textContent = q[1].name; L.e.style.setProperty('--c', q[1].colour); } put(L.e, q[1], true); } else L.e.style.display = 'none'; });
  }
}
