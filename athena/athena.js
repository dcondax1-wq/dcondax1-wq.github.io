// ATHENA: the library. A round room of shelves, one per topic, built on the OLYMPUS render core (render.js + materials.js).
// Every book / scroll is one entry of library.json; tapping a shelf (or a chip) filters the list below. All the logic is in athenacore.js.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { marble, metal, neon, starfield } from '../olympus/materials.js';
import * as CORE from './athenacore.js';
import { loadLibrary, loadJson, indexOf, search, counts, linkify, esc, makeQuiz } from './athenacore.js';
import * as BRAIN from './athenabrain.js';
import { createPlus } from './athenaplus.js';
import * as TRAIN from './athenatraincore.js';
import { createTrain } from './athenatrain.js';

const O = window.OLYMPUS || null;
const Q = new URLSearchParams(location.search);
const RM = O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (id) => document.getElementById(id);
const S = { lib: null, ix: null, byId: {}, tag: null, q: '', view: 'lib', entry: null, back: 'lib', quiz: null, errors: [], hall: null, plus: null, train: null };
const PANES = ['lib', 'entry', 'quiz', 'ask', 'today', 'cards', 'rules', 'saved', 'train'];
const TABS = ['lib', 'ask', 'today', 'cards', 'rules', 'saved', 'train', 'quiz'];            // the Saved page opens from the star at the top right

const tagOf = (id) => S.lib.tags.find((t) => t.id === id);
// a [[link]] in a one-line summary is a plain word there (the full entry makes it a button)
const plainShort = (t) => String(t).replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => (S.byId && S.byId[id] ? S.byId[id].title.replace(/ \(.*\)$/, '') : id));
const colorOf = (e) => (tagOf(e.kind) || S.lib.tags[0]).color;

// ------------------------------------------------------------------------------------------------ the list
function results() { return search(S.ix, S.q, S.tag); }

function renderChips() {
  const c = counts(S.lib);
  $('chips').innerHTML = S.lib.tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t.id)}" aria-pressed="${S.tag === t.id}" style="--c:${esc(t.color)}" title="${esc(t.blurb)}"><i></i>${esc(t.name)} <b>${c[t.id] || 0}</b></button>`).join('');
}
function renderList() {
  const r = results();
  const tg = S.tag ? tagOf(S.tag) : null;
  $('count').textContent = (S.q ? `${r.length} for "${S.q}"` : `${r.length} entries`) + (tg ? ` on the ${tg.name} shelf` : '') + (tg && tg.blurb ? `. ${tg.blurb}.` : '.');
  $('list').innerHTML = r.length ? r.map((e) => `<button type="button" class="item" data-open="${esc(e.id)}" style="--c:${esc(colorOf(e))}"><strong>${esc(e.title)}</strong><span>${esc(plainShort(e.short))}</span></button>`).join('')
    : `<p class="empty">Nothing found. Try one word, like "stop" or "payout", or clear the shelf.</p>`;
}
function renderEntry() {
  const e = S.byId[S.entry];
  if (!e) { $('entry').innerHTML = '<p class="empty">That page is not in the library.</p>'; return; }
  const tg = tagOf(e.kind) || S.lib.tags[0];
  const others = e.tags.filter((t) => t !== e.kind).map((t) => tagOf(t)).filter(Boolean);
  $('entry').style.setProperty('--c', tg.color);
  $('entry').innerHTML = `<button type="button" class="mark" id="mark" aria-pressed="${S.plus.isMarked(e.id)}" aria-label="Bookmark this entry" title="Bookmark">${S.plus.isMarked(e.id) ? '&#9733;' : '&#9734;'}</button><span class="kind">${esc(tg.name.toUpperCase())}</span>${others.map((t) => `<span class="kind" style="--c:${esc(t.color)}">${esc(t.name.toUpperCase())}</span>`).join('')}<h2>${esc(e.title)}</h2>`
    + `<p class="lead">${linkify(e.short, S.byId)}</p>` + e.body.map((b) => `<p>${linkify(b, S.byId)}</p>`).join('')
    + (e.src.length ? `<p class="src">Where this comes from: ${e.src.map(esc).join(', ')}</p>` : '');
}

// ------------------------------------------------------------------------------------------------ the quiz
function startQuiz() {
  const seed = Q.get('seed') ? +Q.get('seed') : Math.floor(Math.random() * 2 ** 31);
  S.quiz = { qs: makeQuiz(S.lib, 5, seed), i: 0, picked: null, score: 0, missed: [] };
}
function renderQuiz() {
  const z = S.quiz; if (!z) startQuiz();
  const k = S.quiz;
  if (!k.qs.length) { $('quiz').innerHTML = '<p class="empty">Not enough entries for a quiz yet.</p>'; return; }
  if (k.i >= k.qs.length) {
    $('quiz').innerHTML = `<p class="qn">Done</p><div class="score">${k.score} / ${k.qs.length}</div>`
      + `<p class="note">${k.score === k.qs.length ? 'Perfect. You know your system.' : k.score >= 3 ? 'Good. Read the ones you missed below.' : 'Worth a re-read. Open the ones you missed.'} Nothing here is saved or sent anywhere.</p>`
      + k.missed.map((id) => `<button type="button" class="item" data-open="${esc(id)}" data-from="quiz" style="--c:${esc(colorOf(S.byId[id]))}"><strong>${esc(S.byId[id].title)}</strong><span>${esc(plainShort(S.byId[id].short))}</span></button>`).join('')
      + `<button type="button" class="wide" id="again">Quiz me again</button><button type="button" class="wide" id="toLib">Back to the library</button>`;
    return;
  }
  const q = k.qs[k.i], done = k.picked !== null;
  $('quiz').innerHTML = `<p class="qn">Question ${k.i + 1} of ${k.qs.length}</p><p class="qq">${esc(q.q)}</p>`
    + q.options.map((o, j) => `<button type="button" class="opt ${done ? (j === q.answer ? 'right' : j === k.picked ? 'wrong' : '') : ''}" data-pick="${j}" ${done ? 'disabled' : ''}>${esc(o)}</button>`).join('')
    + (done ? `<p class="note">${k.picked === q.answer ? 'Right.' : 'Not quite. The answer is highlighted.'} <button type="button" class="gl" data-go="${esc(q.from)}" data-from="quiz">Read: ${esc(S.byId[q.from].title.replace(/ \(.*\)$/, ''))}</button></p>`
      + `<button type="button" class="wide" id="next">${k.i + 1 >= k.qs.length ? 'See my score' : 'Next question'}</button>` : '');
}

// ------------------------------------------------------------------------------------------------ views and routes
function show(view, hash = true) {
  S.view = view;
  for (const p of PANES) $('p-' + p).hidden = view !== p;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === (view === 'entry' ? (S.back === 'quiz' ? 'train' : S.back) : view === 'quiz' ? 'train' : view))));
  $('sheet').scrollTop = 0;
  if (view === 'quiz') renderQuiz(); else if (view === 'train') S.train.render(); else if (view === 'entry') { S.plus.visit(S.entry); renderEntry(); badges(); } else if (view === 'lib') { renderChips(); renderList(); } else S.plus.render(view);
  const sb = document.querySelector('.search'); if (sb) sb.style.display = view === 'lib' ? '' : 'none';          // the library's search only makes sense on the library
  if (hash && history.replaceState) history.replaceState(null, '', view === 'lib' ? (S.tag ? '#t/' + S.tag : '#library') : view === 'entry' ? '#e/' + S.entry : '#' + view);
}
function openEntry(id, from) { if (!S.byId[id]) return; S.entry = id; S.back = from === 'quiz' ? 'quiz' : S.view === 'entry' ? S.back : TABS.includes(S.view) ? S.view : 'lib'; show('entry'); }
function setTag(t) { S.tag = S.tag === t ? null : t; S.hall?.focusTag(S.tag); if (S.view !== 'lib') show('lib'); else { renderChips(); renderList(); if (history.replaceState) history.replaceState(null, '', S.tag ? '#t/' + S.tag : '#library'); } }
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'quiz') { if (!S.quiz) startQuiz(); show('quiz', false); }
  else if (['ask', 'today', 'cards', 'rules', 'saved'].includes(h)) show(h, false);
  else if (h === 'train') { S.train.go('home'); show('train', false); }
  else if (h.startsWith('e/') && S.byId[h.slice(2)]) { S.entry = h.slice(2); S.back = 'lib'; show('entry', false); }
  else { S.tag = h.startsWith('t/') && tagOf(h.slice(2)) ? h.slice(2) : null; S.hall?.focusTag(S.tag); show('lib', false); }
}

function bind() {
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (b) setTag(b.dataset.tag); });
  $('sheet').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open],[data-go]'); if (o) { openEntry(o.dataset.open || o.dataset.go, o.dataset.from); return; }
    const p = e.target.closest('[data-pick]');
    if (p && S.quiz && S.quiz.picked === null) { const q = S.quiz.qs[S.quiz.i]; S.quiz.picked = +p.dataset.pick; if (S.quiz.picked === q.answer) S.quiz.score++; else S.quiz.missed.push(q.from); renderQuiz(); return; }
    if (e.target.closest('#next')) { S.quiz.i++; S.quiz.picked = null; renderQuiz(); $('sheet').scrollTop = 0; return; }
    if (e.target.closest('#again')) { startQuiz(); renderQuiz(); $('sheet').scrollTop = 0; return; }
    if (e.target.closest('#toLib')) { show('lib'); }
  });
  $('savedBtn').addEventListener('click', () => { sfx('tap'); show(S.view === 'saved' ? 'lib' : 'saved'); });
  $('back').addEventListener('click', () => show(TABS.includes(S.back) ? S.back : 'lib'));
  $('entry').addEventListener('click', (e) => { if (e.target.closest('#mark')) { S.plus.toggle(S.entry); sfx('tick'); renderEntry(); badges(); } });
  $('q').addEventListener('input', (e) => { S.q = e.target.value; if (S.view !== 'lib') show('lib'); else renderList(); });
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; sfx('tap'); if (b.dataset.tab === 'quiz') { if (!S.quiz) startQuiz(); show('quiz'); } else show(b.dataset.tab); });
  addEventListener('hashchange', route);
}

// ------------------------------------------------------------------------------------------------ small helpers: sounds, toast, tab badges
const sfx = (name) => { try { O?.sfx?.(name); } catch (_) { /* the sound is never needed */ } };
let toastTimer = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200); }
function badges() {
  if (!S.plus) return;
  const c = S.plus.counts(), d = $('bd-cards'), t = $('bd-today');
  d.textContent = c.due > 99 ? '99+' : String(c.due); d.hidden = !c.due;
  $('bd-saved').textContent = String(c.marks); $('bd-saved').hidden = !c.marks;
  const read = S.plus.state.days.includes(BRAIN.dayKey());
  t.textContent = '1'; t.hidden = read;
  if (S.train) { const n = S.train.counts().left, b = $('bd-train'); b.textContent = String(n); b.hidden = !n; }
}

// ------------------------------------------------------------------------------------------------ the 3D library
const R = 8.2;
// procedural surfaces (canvas textures, drawn once): walnut wood with grain, leather with gold bands, aged parchment with ink lines
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const woodTex = (base, seed, size) => tex(size, size, (x, w, h) => {
  const r = mulberry(seed); x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < h; i += 2) { const k = r(); x.fillStyle = `rgba(${k > 0.5 ? '224,160,96' : '0,0,0'},${(0.03 + r() * 0.07).toFixed(3)})`; x.fillRect(0, i, w, 1 + r() * 2); }
  for (let i = 0; i < 9; i++) { const y = r() * h; x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1 + r() * 1.5; x.beginPath(); x.moveTo(0, y); for (let k = 0; k <= w; k += 16) x.lineTo(k, y + Math.sin(k * 0.03 + i) * 3); x.stroke(); }
}, [1, 1]);
const leatherTex = (hex, seed) => tex(128, 256, (x, w, h) => {
  const r = mulberry(seed); x.fillStyle = hex; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(${r() > 0.5 ? '243,236,224' : '0,0,0'},${(0.02 + r() * 0.05).toFixed(3)})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  x.fillStyle = '#c8a24a'; for (const y of [0.1, 0.16, 0.84, 0.9]) x.fillRect(0, h * y, w, 4);
  x.strokeStyle = '#c8a24a'; x.lineWidth = 2; x.strokeRect(w * 0.22, h * 0.3, w * 0.56, h * 0.4);
});
const parchmentTex = () => tex(128, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#c8a24a'); g.addColorStop(0.5, '#f0dca0'); g.addColorStop(1, '#c8a24a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const r = mulberry(7); x.fillStyle = 'rgba(59, 41, 22,.55)'; for (let y = 10; y < h - 8; y += 9) x.fillRect(10, y, 40 + r() * (w - 60), 2);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(120,80,30,${(0.04 + r() * 0.08).toFixed(2)})`; x.fillRect(r() * w, r() * h, 3, 3); }
});
class Hall {
  constructor(canvas) {
    this.canvas = canvas; this.yaw = 0; this.target = null; this.dirty = true; this.auto = !RM; this.shelves = [];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#120e09');
    this.camera = new THREE.PerspectiveCamera(60, 1.3, 0.1, 120);
    this.camera.position.set(0, 1.9, 0);
    this.rc = createRenderer({ canvas, scene: this.scene, camera: this.camera, maxDpr: 2, tint: '#c8a24a', theme: { sky: '#2b2018', fog: '#2a2018', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, bloom: { strength: 0.22, radius: 0.5, threshold: 1.0 } });
    this.lite = this.rc.quality() === 'low' || this.rc.quality() === 'off';
    this.build();
    this.input();
  }
  build() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xe0a060, 0x372615, 1.4));
    this.stars = starfield({ count: 700 }); sc.add(this.stars);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex('#402c18', 3, 256), roughness: 0.6, metalness: 0.05 });
    const woodLight = new THREE.MeshStandardMaterial({ map: woodTex('#b0763c', 9, 256), roughness: 0.55, metalness: 0.05 });
    const parch = new THREE.MeshStandardMaterial({ map: parchmentTex(), roughness: 0.85, emissive: new THREE.Color('#e0a060'), emissiveIntensity: 0.1 });
    this.warm = new THREE.PointLight(0xe0a060, this.lite ? 0 : 45, 28, 1.3); this.warm.position.set(0, 4.2, 0); sc.add(this.warm);       // a warm chandelier
    const dome = new THREE.Mesh(new THREE.SphereGeometry(26, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#201a12', side: THREE.BackSide, roughness: 0.9 }));
    dome.position.y = 4; sc.add(dome);
    const oculus = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.6, 64), neon({ color: '#e0a060', intensity: 1.6 })); oculus.rotation.x = Math.PI / 2; oculus.position.y = 29.6; sc.add(oculus);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), marble({ color: '#282016', vein: '#5a4630', roughness: 0.35, clearcoat: 0.3 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; sc.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.2, 96), neon({ color: '#c8a24a', intensity: 1.0 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; sc.add(ring);
    const gold = metal({ kind: 'gold' }), slab = wood, dark = woodLight;
    const geo = { back: new THREE.BoxGeometry(4.5, 3.4, 0.18), plank: new THREE.BoxGeometry(4.5, 0.1, 0.62), post: new THREE.BoxGeometry(0.14, 3.5, 0.66), book: new THREE.BoxGeometry(1, 1, 1), scroll: new THREE.CylinderGeometry(0.11, 0.11, 0.5, 14), cap: new THREE.CylinderGeometry(0.125, 0.125, 0.04, 14), strip: new THREE.BoxGeometry(1, 1, 1) };
    const c = counts(S.lib);
    const leathers = ['#502b1e', '#43372b', '#3e4428', '#50371e', '#483327', '#3e3327'].map((h, n) => leatherTex(h, 40 + n));
    // the books, scrolls, glowing spines and caps of a shelf are INSTANCED (2026-11-04, docs/OLYMPUS_PERF.md: ~35 meshes a shelf became ~11):
    // one leather material per shelf (the six leathers rotate across shelves; each book keeps its own tint through instanceColor)
    const bookMats = leathers.map((map) => new THREE.MeshPhysicalMaterial({ map, color: 0xf3ece0, roughness: 0.5, metalness: 0.1, clearcoat: 0.4 }));
    const dummy = new THREE.Object3D();
    const inst = (g, geometry, material, count) => { const m = new THREE.InstancedMesh(geometry, material, Math.max(1, count)); m.count = count; g.add(m); return m; };
    const put = (m, i, x, y, z, rx, ry, rz, sx, sy, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); };
    S.lib.tags.forEach((t, i) => {
      const g = new THREE.Group(), a = i * (Math.PI * 2) / S.lib.tags.length;
      g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R); g.userData = { tag: t.id, a }; g.lookAt(0, 0, 0);
      const back = new THREE.Mesh(geo.back, slab); back.position.set(0, 1.75, -0.28); g.add(back);
      for (const x of [-2.2, 2.2]) { const p = new THREE.Mesh(geo.post, gold); p.position.set(x, 1.75, -0.02); g.add(p); }
      const top = new THREE.Mesh(geo.plank, gold); top.position.set(0, 3.45, 0); g.add(top);
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.2, 0.8), dark); base.position.set(0, 0.1, 0); g.add(base);
      const mat = neon({ color: t.color, intensity: 2.2 });
      mat.userData = { base: new THREE.Color(t.color) };
      const n = Math.min(c[t.id] || 0, 18), planks = [0.2, 1.25, 2.3];
      for (const y of planks.slice(1)) { const p = new THREE.Mesh(geo.plank, slab); p.position.set(0, y, 0); g.add(p); }
      let seed = 11 + i * 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const cols = [new THREE.Color(t.color).multiplyScalar(0.55), new THREE.Color(t.color).lerp(new THREE.Color('#2e261d'), 0.55), new THREE.Color('#473b2e')];
      const nScroll = Math.floor(n / 3), nBook = n - nScroll;           // k % 3 === 2 are scrolls
      const books = inst(g, geo.book, bookMats[i % bookMats.length], nBook), strips = inst(g, geo.strip, mat, nBook);
      const scrolls = inst(g, geo.scroll, parch, nScroll), caps = inst(g, geo.cap, mat, nScroll * 2);
      let ib = 0, isc = 0;
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 6), col = k % 6, y0 = planks[row] + 0.05, x = -1.85 + col * 0.74 + (rnd() - 0.5) * 0.05;
        if (k % 3 === 2) {                                            // a scroll lying down, glowing caps
          put(scrolls, isc, x, y0 + 0.13, 0.05, 0, 0, Math.PI / 2, 1, 1.35, 1);
          put(caps, isc * 2, x - 0.35, y0 + 0.13, 0.05, 0, 0, Math.PI / 2, 1, 1, 1); put(caps, isc * 2 + 1, x + 0.35, y0 + 0.13, 0.05, 0, 0, Math.PI / 2, 1, 1, 1);
          isc++;
        } else {                                                       // a book standing up, a glowing spine strip
          const h = 0.62 + rnd() * 0.3, w = 0.17 + rnd() * 0.07, rz = (k % 5 === 4) ? 0.12 : 0;
          put(books, ib, x, y0 + h / 2, 0.04, 0, 0, rz, w, h, 0.38); books.setColorAt(ib, cols[k % 3].clone().lerp(new THREE.Color('#f3ece0'), 0.55));
          put(strips, ib, x, y0 + h * 0.7, 0.04, 0, 0, rz, w * 1.04, 0.05, 0.4);
          ib++;
        }
      }
      for (const m of [books, strips, scrolls, caps]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      const glow = new THREE.PointLight(new THREE.Color(t.color), this.lite ? 0 : 6, 7, 1.6); glow.position.set(0, 1.9, 1.6); g.add(glow);
      const lab = labelSprite(t.name.toUpperCase() + '  ' + (c[t.id] || 0), t.color); lab.position.set(0, 4.05, 0.1); g.add(lab);
      g.userData.mat = mat; g.userData.light = glow; g.userData.lab = lab;
      this.scene.add(g); this.shelves.push(g);
    });
    this.ray = new THREE.Raycaster(); this.refresh();
    this.fx = []; this.fxNames = [];
    this.fxStart();
  }
  /** the OLYMPUS effects (olympus/fx-*.js): light shafts from the oculus, dust and fireflies in the air. Each one is optional. */
  async fxStart() {
    const FX = window.OLYMPUS_FX;
    if (!FX) return;
    try { await FX.load('3d'); } catch (_) { return; }
    const add = (name, target, opts) => { try { if (typeof FX[name] === 'function') { this.fx.push(FX[name](target, opts)); this.fxNames.push(name); } } catch (_) { /* an effect failing never stops the library */ } };
    add('godRays', this.scene, { position: [0, 16, 0], intensity: 0.55 });
    add('dust', this.scene, { color: '#e8d2a8', size: 0.07 });
    add('fireflies', this.scene, { count: 24, color: '#e0b060', color2: '#ffd9a0', size: 0.2 });
    this.dirty = true;
  }
  refresh() {
    for (const g of this.shelves) {
      const on = S.tag === g.userData.tag, dim = S.tag && !on;
      const k = on ? 1.5 : dim ? 0.3 : 1;
      g.userData.mat.color.copy(g.userData.mat.userData.base).multiplyScalar(2.2 * k);
      g.userData.light.intensity = this.lite ? 0 : on ? 11 : dim ? 1.5 : 6;
      g.userData.lab.material.opacity = dim ? 0.45 : 1;
    }
    this.dirty = true;
  }
  focusTag(t) {
    this.refresh();
    if (t) { const g = this.shelves.find((s) => s.userData.tag === t); if (g) { this.auto = false; this.target = g.userData.a; if (RM) { this.yaw = this.target; this.target = null; } } }
    else if (!RM) this.auto = true;
    this.dirty = true;
  }
  input() {
    const cv = this.canvas; let down = null;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: this.yaw, moved: false }; cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 6) down.moved = true; if (down.moved) { this.yaw = down.yaw - dx * 0.006; this.auto = false; this.target = null; this.dirty = true; } });
    const up = (e) => { if (down && !down.moved && e.type === 'pointerup') this.tap(e); down = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { down = null; });
  }
  tap(e) {
    const r = this.canvas.getBoundingClientRect(), p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hit = this.ray.intersectObjects(this.shelves, true)[0];
    if (!hit) return;
    let o = hit.object; while (o && !(o.userData && o.userData.tag)) o = o.parent;
    if (o) setTag(o.userData.tag);
  }
  tick(dt, t) {
    if (this.target !== null) {                                       // glide to the shelf by the short way round
      let d = ((this.target - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) < 0.002) { this.yaw += d; this.target = null; } else this.yaw += d * Math.min(1, dt * 5);
      this.dirty = true;
    } else if (this.auto && !RM) { this.yaw += dt * 0.07; this.dirty = true; }
    this.camera.position.set(0, 1.9, 0);
    this.camera.lookAt(Math.sin(this.yaw) * 10, 1.75, -Math.cos(this.yaw) * 10);
    this.stars.update(t, this.rc.renderer.getPixelRatio());
    if (!RM || this.dirty) { this.rc.render(); this.dirty = false; }
  }
  get settled() { return this.target === null; }
  get facing() { // the tag whose shelf is nearest the middle of the view
    let best = null, bd = 9;
    for (const g of this.shelves) { const d = Math.abs(((g.userData.a - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI); if (d < bd) { bd = d; best = g.userData.tag; } }
    return best;
  }
}
function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.font = '700 40px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 14; x.fillStyle = color; x.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(3.6, 0.675, 1); return s;
}

let last = performance.now(), T = 0, lastTick = 0;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now; T += dt;
  const gap = O && O.frameGap ? O.frameGap() : 0;                         // idle 30 / 15 fps, battery saver, 3D Off: 2 fps (docs/OLYMPUS_PERF.md)
  if (S.hall && !(O ? O.hidden() : document.hidden) && !(gap && now - lastTick < gap - 3)) { S.hall.tick(lastTick ? Math.min(0.25, (now - lastTick) / 1000) : dt, T); lastTick = now; }
  requestAnimationFrame(loop);
}

async function main() {
  addEventListener('error', (e) => S.errors.push(String(e.message || e)));
  S.lib = await loadLibrary('library.json?v=a7');
  S.ix = indexOf(S.lib); S.byId = Object.fromEntries(S.lib.entries.map((e) => [e.id, e]));
  $('demo').hidden = S.lib.src === 'file';
  $('sub').textContent = `${S.lib.entries.length} short notes on your strategy and rules. Tap a shelf to read, or take the quiz.`;
  S.plus = createPlus({ lib: S.lib, ix: S.ix, byId: S.byId, colorOf, tagOf, toast, sfx, badges });
  const dr = await loadJson('drills.json?v=a1');
  S.train = createTrain({ root: $('train'), lib: S.lib, byId: S.byId, colorOf, tagOf, toast, sfx, badges: () => badges(), quick: () => { startQuiz(); show('quiz'); }, drills: TRAIN.validDrills(dr) ? dr : TRAIN.sampleDrills() });
  bind(); badges(); route();
  try { S.hall = new Hall($('stage')); S.hall.focusTag(S.tag); loop(performance.now()); } catch (e) { S.hall = null; $('nogl').hidden = false; S.errors.push('3d: ' + e); O?.ready(); }
  O?.mode?.(!!(S.hall && S.hall.lite));
  window.__athena = { ready: true, CORE, BRAIN, TRAIN, get plus() { return S.plus; }, get train() { return S.train; }, get fx() { return S.hall ? S.hall.fxNames : []; }, get lib() { return S.lib; }, get state() { return { tag: S.tag, q: S.q, view: S.view, entry: S.entry, quiz: S.quiz }; }, get ready3d() { return !!S.hall; },
    get lite() { return S.hall ? S.hall.lite : null; }, get yaw() { return S.hall ? S.hall.yaw : 0; }, get settled() { return S.hall ? S.hall.settled : true; }, get facing() { return S.hall ? S.hall.facing : null; },
    get passes() { return S.hall ? S.hall.rc.passes() : []; }, get quality() { return S.hall ? S.hall.rc.quality() : null; }, get shelves() { return S.hall ? S.hall.shelves.length : 0; },
    shelfPoint(tag) {                         // screen point of a shelf's middle, for the tests
      if (!S.hall) return null; const g = S.hall.shelves.find((s) => s.userData.tag === tag); const v = new THREE.Vector3(0, 1.7, 0.2); g.localToWorld(v); v.project(S.hall.camera);
      const r = S.hall.canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 && v.z > -1 }; },
    errors: S.errors };
  if (window.parent !== window) fetch('jarvis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((card) => {
    if (card) window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, t: Math.floor(Date.now() / 1000) } }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io'));
  }).catch(() => {});
}
main().catch((e) => { S.errors.push(String(e)); O?.fail?.('Athena could not start'); });
