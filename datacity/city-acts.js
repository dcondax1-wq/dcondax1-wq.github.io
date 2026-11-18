// Olympus Data City: the App's actions that are not the frame loop (split out of city.js so no module is over 60 KB):
// search in plain words, compare two ideas, the gold celebration, the growth timeline, photo mode.
// city.js copies these methods onto its App class; `this` is the App.
import { $, clsRank, settings } from './util.js';
import { labelOf } from './data.js';
import * as UI from './ui.js';
import * as PN from './panels.js';
import { parseQuery, filterTest, standing } from './kinds.js';

let state = null;                   // city.js's window.__city, handed over once with useState()
export const useState = (s) => { state = s; };

export class Acts {
  // -- search in plain words ('sweep', 'NY afternoon', 'london short') + filters; dims what does not match, beams onto the best match,
  //    lists the matches on the minimap, and flies the camera to where most of them stand
  find(text, st) {
    const D = this.model.D, q = parseQuery(text), test = filterTest(st, D), cls = st?.cls || 'all', dk = st?.d || 'all';
    const extra = !!st && (st.family !== 'all' || st.hold !== 'any' || st.minE > 0 || st.minTpw > 0);
    const filtering = !q.empty || cls !== 'all' || dk !== 'all' || extra;
    const items = this.L.items;
    const keep = items.map((it) => {
      if (it.kind === 'ship' || !it.b) return !filtering;
      if (cls !== 'all' && it.b.cls !== cls) return false;
      if (dk !== 'all' && this.L.districts[it.d]?.key !== dk) return false;
      if (extra && !test(it.b)) return false;
      return q.empty || q.test(labelOf(it.b, D), it.b);
    });
    this.keep = filtering ? keep : null;
    this.filtering = filtering;
    this.applyStates();
    const hits = items.map((it, i) => [it, i]).filter(([it, i]) => keep[i] && it.kind === 'b')
      .sort((a, b) => clsRank(a[0].b.cls) - clsRank(b[0].b.cls) || (b[0].b.e || 0) - (a[0].b.e || 0));
    this.matches = filtering ? hits.map(([, i]) => i) : [];
    this.mi = -1;
    this.minimap.hits = filtering ? hits.slice(0, 500).map(([it]) => [it.x, it.z]) : [];
    UI.fillFound(hits.slice(0, 30).map(([it, i]) => ({ ...it, i })), (b) => labelOf(b, D), (it) => this.open(it.i), filtering ? hits.length : 0);
    state.found = filtering ? hits.length : 0;
    if (state.v3) { state.v3.matches = state.found; state.v3.query = String(text || ''); }
    if (filtering && hits.length) { const [it] = hits[0]; this.city.beam.show(it.x, it.z, it.h, it.color); }
    else if (!filtering) this.city.beam.hide();
    clearTimeout(this._flyT);
    if (filtering && hits.length && !q.empty) this._flyT = setTimeout(() => this.flyToMatches(true), 700);     // typing stopped: fly there
  }

  /** Fly the camera to where most of the best matches stand (the busiest district among the top 80), shown with a count. */
  flyToMatches(auto) {
    clearTimeout(this._flyT);
    const items = this.L.items, top = this.matches.slice(0, 80);
    if (!top.length) { if (!auto) UI.toast('No building matches'); return null; }
    const by = new Map();
    for (const i of top) { const d = items[i].d; by.set(d, (by.get(d) || 0) + 1); }
    const [dBest] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    const grp = top.filter((i) => items[i].d === dBest).map((i) => items[i]);
    let cx = 0, cz = 0;
    for (const it of grp) { cx += it.x; cz += it.z; }
    cx /= grp.length; cz /= grp.length;
    const spread = Math.max(...grp.map((it) => Math.hypot(it.x - cx, it.z - cz)), 6), r = Math.max(48, Math.min(260, spread * 2 + 34));
    this.orbit.focus(cx, 0, cz, r, 0.95);
    const dn = this.L.districts[dBest]?.name || '';
    state.fly = { n: state.found, near: grp.length, district: dn, x: +cx.toFixed(1), z: +cz.toFixed(1), r: Math.round(r) };
    if (!auto) UI.toast(`${state.found.toLocaleString()} match · flying to ${grp.length} in ${dn}`);
    return state.fly;
  }

  /** The next best match: the camera glides onto it and the beam marks it (the Find panel stays open). */
  nextMatch() {
    clearTimeout(this._flyT);
    const n = Math.min(this.matches.length, 40);
    if (!n) { UI.toast('Search first: type a word in Find'); return; }
    this.mi = (this.mi + 1) % n;
    const i = this.matches[this.mi], it = this.L.items[i];
    this.orbit.focus(it.x, Math.min(it.h * 0.5, 6), it.z, 34 + it.h * 2);
    this.city.beam.show(it.x, it.z, it.h, it.color);
    this.setTag(it, labelOf(it.b, this.model.D));
    state.nextMatch = { i, id: it.b.id, at: this.mi + 1, of: n };
    UI.toast(`Match ${this.mi + 1} of ${n}`);
  }

  resetFind() {
    this.keep = null;
    this.filtering = false;
    this.matches = []; this.minimap.hits = [];
    clearTimeout(this._flyT);
    this.applyStates();
    state.found = 0;
    if (state.v3) state.v3.matches = 0;
  }

  // -- compare two ideas: tap the card's Compare button, then open a second idea
  setCompare(id) {
    if (this.compareA === id) { this.compareA = null; state.v3.compare = null; return false; }
    UI.sheet.close();                       // (closing clears a pending compare, so set it after)
    this.compareA = id;
    state.v3.compare = { a: id, b: null };
    UI.toast('Compare: now tap a second building');
    return true;
  }

  openCompare(aId, bId) {
    const A = this.model.byId.get(aId), B = this.model.byId.get(bId), ia = this.index.get(aId), ib = this.index.get(bId);
    if (!A || !B || ia === undefined || ib === undefined) return;
    this.compareA = null;
    this.cmp = { a: aId, b: bId };
    const L = this.L.items, a = L[ia], b = L[ib], D = this.model.D;
    state.v3.compare = { a: aId, b: bId };
    this.city.link.set(a, b);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, d = Math.hypot(a.x - b.x, a.z - b.z);
    this.orbit.focus(mx, 6, mz, Math.max(60, d * 0.9 + 40), 0.95);
    UI.sheet.open('compare', 'Compare two ideas', (body) => PN.viewCompare(body, A, B, (x) => labelOf(x, D), {
      flyA: () => this.orbit.focus(a.x, 4, a.z, 40 + a.h, 1.0), flyB: () => this.orbit.focus(b.x, 4, b.z, 40 + b.h, 1.0),
      swap: () => this.openCompare(bId, aId), close: () => UI.sheet.close() }));
    this.announce(`Comparing ${labelOf(A, D)} with ${labelOf(B, D)}`);
  }

  // -- fireworks: a gold idea (it holds in every year) is celebrated with shells over its roof and a glow on the building
  celebrate(i, shells = 3, delay = 0) {
    const it = this.L.items[i];
    if (!it) return;
    state.v3.celebrations++;
    this.flashes.push({ i, t: -delay });
    if (this.calm) return;
    const colors = [0xd39556, 0xffffff, 0xd39556, 0xd1904d];
    for (let k = 0; k < shells; k++) {
      this.city.fireworks.launch(it.x + (k - 1) * 11, it.h + 34 + k * 7, it.z + (k % 2 ? 9 : -9), colors[k % colors.length], delay + k * 0.55);
    }
  }

  /** every gold idea in turn (the camera flies to the first) */
  celebrateGold(inTour) {
    const gold = this.L.items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'b' && it.b.cls === 'gold');
    if (!gold.length) { if (!inTour) UI.toast('No gold idea yet: nothing holds in every year'); return 0; }
    if (!inTour) {                                          // (the tour flies the camera itself: a focus here would end it)
      UI.sheet.close();
      const [it0] = gold[0];
      this.orbit.focus(it0.x, it0.h * 0.6, it0.z, 70 + it0.h, 1.0);
    }
    gold.slice(0, 5).forEach(([, i], k) => this.celebrate(i, 2, k * 1.6));
    if (!inTour) UI.toast(`${gold.length} gold ideas: they hold in 2026, in 2021-25 and in every year`);
    return gold.length;
  }

  /** a gold idea that this device has not seen yet: fireworks (the first visit celebrates all of them) */
  checkGold() {
    const gold = this.L.items.filter((it) => it.kind === 'b' && it.b.cls === 'gold').map((it) => it.b.id);
    let seen = [];
    try { seen = JSON.parse(settings.get('dc.goldSeen', '[]')); } catch (e) { seen = []; }
    const fresh = gold.filter((id) => !seen.includes(id)), news = (this.model.discoveries || []).filter((d) => d.new && d.cls === 'gold').map((d) => d.id);
    settings.set('dc.goldSeen', JSON.stringify([...new Set([...seen, ...gold])].slice(0, 200)));
    state.v3.goldFresh = fresh.length;
    const first = [...new Set([...news, ...fresh])].slice(0, 3);
    if (!first.length) return;
    setTimeout(() => {
      first.forEach((id, k) => { const i = this.index.get(id); if (i !== undefined) this.celebrate(i, 2, k * 1.8); });
      UI.toast(`${fresh.length || news.length} gold idea${(fresh.length || news.length) === 1 ? '' : 's'}: fireworks`);
    }, 2800);
  }

  stepFlashes(dt) {
    if (!this.flashes.length) return;
    for (const f of this.flashes) {
      f.t += dt;
      this.city.skyline.flash(f.i, f.t <= 0 ? 0 : Math.max(0, 1 - f.t / 3.6));
    }
    this.flashes = this.flashes.filter((f) => f.t < 3.6);
  }

  // -- the growth timeline: the ideas with year detail, as they stood at the end of a year
  tlStart() {
    if (this.tl.on) return;
    this.tl.on = true;
    this.city.skyline.setScales((i) => (this.rich.has(i) ? 1 : 0.1));
    state.v3.timeline.on = true;
  }

  tlStop() {
    if (!this.tl.on) return;
    this.tl.on = false; this.tl.playing = false;
    this.city.skyline.setScales(null);
    state.v3.timeline = { on: false, year: this.tl.year };
  }

  setYear(yf) {
    const last = this.years[this.years.length - 1], y = Math.max(this.years[0], Math.min(last, yf));
    this.tl.year = y;
    this.tlStart();
    const y0 = Math.floor(y), y1 = Math.min(last, y0 + 1), k = y - y0, entries = [];
    let tested = 0, paid = 0, gold = 0;
    const seen = new Set();
    for (const [i, it] of this.rich) {
      const s0 = standing(it.b, y0), s1 = standing(it.b, y1), fin = Math.max(0.4, it.h);
      const sc = (s) => (s?.tested ? Math.max(0.12, Math.min(1.6, s.h / fin)) : 0.001);
      entries.push([i, sc(s0) + (sc(s1) - sc(s0)) * k]);
      const cur = k < 0.5 ? s0 : s1;
      if (cur?.tested && !seen.has(it.b.id)) { seen.add(it.b.id); tested++; if (cur.up) { paid++; if (it.b.cls === 'gold') gold++; } }
    }
    this.city.skyline.scaleItems(entries);
    this.tl.stat = `${tested} ideas standing · ${paid} paying · ${gold} gold`;
    state.v3.timeline = { on: true, year: +y.toFixed(2), tested, paid, gold, playing: this.tl.playing };
    this.tl.readout?.(y, this.tl.stat);
  }

  tlToggle() {
    this.tl.playing = !this.tl.playing;
    const last = this.years[this.years.length - 1];
    if (this.tl.playing && this.tl.year >= last - 0.01) this.tl.year = this.years[0];
    this.tl.acc = 1;
    return this.tl.playing;
  }

  stepTimeline(dt) {
    if (!this.tl.playing) return;
    const last = this.years[this.years.length - 1];
    this.tl.year = Math.min(last, this.tl.year + dt * 0.45);
    this.tl.acc += dt;
    if (this.tl.acc > 0.12 || this.tl.year >= last) { this.tl.acc = 0; this.setYear(this.tl.year); }
    if (this.tl.year >= last) { this.tl.playing = false; document.querySelector('#tlPlay') && (document.querySelector('#tlPlay').textContent = '▶ Play the growth'); }
  }

  // -- photo mode: HUD away, a shutter, a share image with a caption band (the browser's share sheet, else a download)
  enterPhoto() {
    UI.sheet.close();
    document.body.classList.add('photo');
    PN.photoBar({ shoot: () => this.shoot(), share: () => this.sharePhoto(), close: () => this.exitPhoto() });
    state.v3.photo.on = true;
    this.announce('Photo mode. Frame the city, then press the shutter.');
  }

  exitPhoto() {
    document.body.classList.remove('photo');
    state.v3.photo.on = false;
  }

  /** draws the city now, copies the picture and adds the caption band; returns the canvas */
  async shoot() {
    const c = $('#c');
    this.city.rc.render();                                         // the buffer is only readable in this same task
    const w = Math.min(c.width, 1600), h = Math.round((w * c.height) / c.width), out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.drawImage(c, 0, 0, w, h);
    const band = Math.round(h * 0.085);
    const gr = g.createLinearGradient(0, h - band * 1.6, 0, h);
    gr.addColorStop(0, 'rgba(5,6,15,0)'); gr.addColorStop(1, 'rgba(5,6,15,.82)');
    g.fillStyle = gr; g.fillRect(0, h - band * 1.6, w, band * 1.6);
    const fs = Math.max(12, Math.round(band * 0.36)), gd = this.model.guard || {};
    g.textBaseline = 'alphabetic';
    g.font = `800 ${fs}px Georgia, Georgia, -apple-system, system-ui, sans-serif`;
    g.fillStyle = '#ddac7b'; g.fillText('OLYMPUS DATA CITY', Math.round(w * 0.04), h - band * 0.62);
    g.font = `600 ${Math.round(fs * 0.78)}px Georgia, -apple-system, system-ui, sans-serif`;
    g.fillStyle = '#b2cadc';
    g.fillText(`${(gd.tried || 0).toLocaleString()} ideas tried · ${(gd.tested || 0).toLocaleString()} tested · ${gd.fdr_pos ?? '–'} survive · ${this.cou ? this.L.items.filter((it) => it.kind === 'b' && it.b.cls === 'gold').length : 0} gold · paper only`,
               Math.round(w * 0.04), h - band * 0.2);
    const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return null;
    this.photoBlob = blob;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = URL.createObjectURL(blob);
    const img = $('#photoImg');
    if (img) { img.src = this.photoUrl; img.hidden = false; }
    state.v3.photo = { on: document.body.classList.contains('photo'), taken: state.v3.photo.taken + 1, bytes: blob.size, w, h };
    this.announce('Photo taken');
    return blob;
  }

  async sharePhoto() {
    if (!this.photoBlob) await this.shoot();
    if (!this.photoBlob) return;
    const file = new File([this.photoBlob], 'olympus-data-city.jpg', { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Olympus Data City', text: 'My Data City: every NQ idea, tested.' }); state.v3.photo.shared = 'share'; return; }
    } catch (e) { /* cancelled or blocked: save it instead */ }
    const a = document.createElement('a');
    a.href = this.photoUrl; a.download = 'olympus-data-city.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    state.v3.photo.shared = 'download';
    UI.toast('Saved the picture');
  }
}
