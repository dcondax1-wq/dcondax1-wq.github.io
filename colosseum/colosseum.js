// COLOSSEUM page (ES module): where strategies fight. Pick two stored runs of the Archive (or the champion against a challenger, or the three bots) and watch seven rounds on their REAL numbers,
// money first; then the verdict in plain words with its caveats, a seeded tournament of the top adopted runs, the league of the bots, the hall of champions and the fallen.
// Reads ../archive/index.json (+ runs-<k>.json shards after the first paint), ./extra.json (max drawdown, dec10, pass_med), ../home.json (the bots) and fixture.json (DEMO, never blank).
// Read only: sends nothing, stores nothing (the two fighters live in the link: #a=<runId>&b=<runId>). Text only through textContent / createElementNS. window.COLOSSEUM is the test hook.
import * as C from './colosseumcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); if (parent) parent.appendChild(e); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { v: null, demo: false, fixture: null, home: null, league: null, mode: 'any', slot: 'b', a: null, b: null, lastRuns: null, duel: null, shown: 0, done: false, busy: false, auto: false, timer: 0, guard: 0,
  arena: null, flat: null, stageMode: 'none', ready: false, shardsLoaded: false, want: null, tour: null, tTimer: 0, q: '' };
const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
const cue = (name) => { try { if (O && O.cue) O.cue(name); } catch (_) { /* no sound kit */ } };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const label = (f) => (f ? (f.kind === 'bot' ? f.name : f.id) : 'nobody');
const title = (f) => (f ? (f.kind === 'bot' ? `${f.name} (${f.account})` : f.name) : 'Empty');

// ------------------------------------------------------------------ the flat arena (LITE, no WebGL, ?flat=1): the same stage as a drawing
function drawFigure(g, colour) {
  // a friendly toy-like champion: a big round head with a simple face, a bronze cap with a crest, a short rounded body in the family colour
  sv('ellipse', { cx: 0, cy: 1, rx: 12, ry: 3, fill: '#3a2a18', opacity: 0.3 }, g);
  sv('line', { x1: -11, y1: -4, x2: -11, y2: -52, stroke: '#7b5a3a', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, g);
  sv('path', { d: 'M -13 -51 L -11 -58 L -9 -51 Z', fill: '#c8a24a' }, g);
  sv('rect', { x: -5.5, y: -9, width: 4.5, height: 9, rx: 2, fill: '#e6b58c', class: 'skin' }, g); sv('rect', { x: 1, y: -9, width: 4.5, height: 9, rx: 2, fill: '#e6b58c', class: 'skin' }, g);
  sv('rect', { x: -8.5, y: -25, width: 17, height: 18, rx: 8, fill: colour, class: 'tint' }, g);
  sv('rect', { x: -8.5, y: -15, width: 17, height: 2.2, fill: '#c8a24a' }, g);
  sv('circle', { cx: -10.5, cy: -15, r: 2.6, fill: '#e6b58c', class: 'skin' }, g);
  sv('circle', { cx: 0, cy: -35, r: 10.5, fill: '#e6b58c', class: 'skin' }, g);
  sv('ellipse', { cx: 1.5, cy: -34.5, rx: 1.1, ry: 1.8, fill: '#2b2118' }, g); sv('ellipse', { cx: 6.5, cy: -34.5, rx: 1.1, ry: 1.8, fill: '#2b2118' }, g);
  sv('path', { d: 'M 2 -30.5 Q 4.5 -28.5 7 -30.5', fill: 'none', stroke: '#2b2118', 'stroke-width': 0.9, 'stroke-linecap': 'round' }, g);
  sv('path', { d: 'M -10.8 -37 A 10.8 10.8 0 0 1 10.8 -37 Z', fill: '#9c6b3c' }, g);
  sv('rect', { x: -10.8, y: -38, width: 21.6, height: 1.6, fill: '#c8a24a' }, g);
  sv('path', { d: 'M -9 -45 Q 0 -57 9 -45 L 7 -43.6 Q 0 -51 -7 -43.6 Z', fill: colour, class: 'tint' }, g);
  sv('circle', { cx: 10, cy: -17, r: 8.5, fill: '#9c6b3c', stroke: '#c8a24a', 'stroke-width': 1.4 }, g);
  sv('circle', { cx: 10, cy: -17, r: 5, fill: 'none', stroke: colour, 'stroke-width': 2, class: 'ring' }, g);
  sv('circle', { cx: 10, cy: -17, r: 1.7, fill: '#c8a24a' }, g);
}
function drawWreath(g) {
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const a = (-0.35 - i * 0.5) * s, x = Math.sin(a) * 9 * 1, y = -Math.cos(a) * 9; sv('ellipse', { cx: x, cy: y, rx: 3.2, ry: 1.5, fill: i % 2 ? '#7f8a52' : '#c8a24a', transform: `rotate(${(a * 180) / Math.PI + s * 55} ${x} ${y})` }, g); }
}
function createFlat(svg) {
  clear(svg);
  const defs = sv('defs', {}, svg), lg = sv('linearGradient', { id: 'cSky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  sv('stop', { offset: '0', 'stop-color': '#54506e' }, lg); sv('stop', { offset: '0.55', 'stop-color': '#c98a6a' }, lg); sv('stop', { offset: '1', 'stop-color': '#f0c383' }, lg);
  sv('rect', { x: 0, y: 0, width: 320, height: 240, fill: 'url(#cSky)' }, svg);
  sv('circle', { cx: 70, cy: 40, r: 15, fill: '#ffe2b0' }, svg);
  const flags = [];
  for (let i = 0; i < 17; i++) {                         // the top arcade, its banners
    const x = 8 + i * 19;
    sv('rect', { x: x - 2, y: 58, width: 4, height: 26, fill: '#d6ccb8' }, svg);
    if (i < 16) sv('path', { d: `M ${x + 2} 70 A 7.5 7.5 0 0 1 ${x + 17} 70`, fill: 'none', stroke: '#d6ccb8', 'stroke-width': 3 }, svg);
    if (i % 2 === 1) { sv('line', { x1: x, y1: 54, x2: x, y2: 36, stroke: '#9c6b3c', 'stroke-width': 1 }, svg); flags.push([sv('path', { d: `M ${x} 37 L ${x + 9} 39 L ${x + 8} 50 L ${x} 48 Z`, fill: '#c8a24a' }, svg), x]); }
  }
  sv('rect', { x: 0, y: 53, width: 320, height: 6, fill: '#e4dccb' }, svg);
  const cloth = ['#e9e3d5', '#c96a4a', '#7f8a52', '#9c6b3c', '#c8a24a', '#e6d7b2'];
  for (let k = 0; k < 6; k++) {                           // six tiers and their spectators
    const rx = 196 - k * 15, ry = 96 - k * 10, cy = 180;
    sv('ellipse', { cx: 160, cy, rx, ry, fill: k % 2 ? '#d6ccb8' : '#e4dccb', stroke: '#b4ab98', 'stroke-width': 0.6 }, svg);
    const n = 30 - k * 3;
    for (let i = 0; i < n; i++) { const a = Math.PI * (1.04 + (0.92 * (i + 0.5)) / n), x = 160 + Math.cos(a) * (rx - 7), y = cy + Math.sin(a) * (ry - 6); if (y < 236 && x > 2 && x < 318) sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.1, fill: cloth[(i * 7 + k * 3) % cloth.length] }, svg); }
  }
  sv('ellipse', { cx: 160, cy: 182, rx: 108, ry: 40, fill: '#d9b36a', stroke: '#d6ccb8', 'stroke-width': 5 }, svg);
  sv('ellipse', { cx: 160, cy: 182, rx: 64, ry: 23, fill: 'none', stroke: '#c39a55', 'stroke-width': 1.2 }, svg);
  const dust = sv('g', { class: 'dust' }, svg); for (const [x, y, r] of [[-8, -6, 5], [7, -9, 6], [0, -16, 5], [-13, -15, 3.5], [13, -17, 4]]) sv('circle', { cx: 160 + x, cy: 186 + y, r, fill: '#c39a55' }, dust);
  const mk = (cls, x, flip) => { const outer = sv('g', { class: cls }, svg), inner = sv('g', { transform: `translate(${x} 190) scale(${flip ? -1.25 : 1.25} 1.25)` }, outer); drawFigure(inner, '#c8a24a'); return { outer, inner }; };
  const A = mk('champ-a', 116, false), B = mk('champ-b', 204, true);
  const wr = (cls, x) => { const g = sv('g', { class: 'wreath ' + cls, transform: `translate(${x} 104)` }, svg); drawWreath(g); return g; };
  wr('a', 116); wr('b', 204);
  let timers = [];
  const stop = () => { timers.forEach(clearTimeout); timers = []; };
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const move = (ax, bx, ay, by) => { A.outer.style.transform = `translate(${ax}px, ${ay || 0}px)`; B.outer.style.transform = `translate(${-bx}px, ${by || 0}px)`; };
  const tint = (F, c, id) => { for (const e of F.inner.querySelectorAll('.tint')) e.setAttribute('fill', c); for (const e of F.inner.querySelectorAll('.ring')) e.setAttribute('stroke', c); const sk = SKINS[seedOf(id) % SKINS.length]; for (const e of F.inner.querySelectorAll('.skin')) e.setAttribute('fill', sk); };
  const cols = ['#c8a24a', '#c8a24a'];
  return {
    ok: true, quality: () => 'flat', colours: () => cols.slice(),
    setFighters(a, b) { if (a && a.crest) { cols[0] = a.crest; tint(A, a.crest, a.id); } if (b && b.crest) { cols[1] = b.crest; tint(B, b.crest, b.id); } flags.forEach(([el, x]) => el.setAttribute('fill', x < 150 ? cols[0] : x > 170 ? cols[1] : '#c8a24a')); },
    clash(w, done) {
      stop(); svg.classList.remove('hit', 'crown-a', 'crown-b'); move(0, 0);
      if (reduced()) { if (done) done(); return; }
      if (w === 'none') { move(0, 0, 3, 3); at(350, () => move(0, 0)); at(700, () => done && done()); return; }
      move(26, 26);
      at(320, () => { svg.classList.add('hit'); if (w === 'draw') move(8, 8); else move(w === 'a' ? 20 : -12, w === 'b' ? 20 : -12); });
      at(640, () => { svg.classList.remove('hit'); move(0, 0); });
      at(1000, () => done && done());
    },
    verdict(w) { stop(); svg.classList.remove('hit'); move(0, 0, w === 'b' ? 4 : 0, w === 'a' ? 4 : 0); svg.classList.toggle('crown-a', w === 'a'); svg.classList.toggle('crown-b', w === 'b'); },
    reset() { stop(); svg.classList.remove('hit', 'crown-a', 'crown-b'); move(0, 0); },
    stats: () => ({ draws: 0, tris: 0 }), dispose() { stop(); },
  };
}
const stage = () => S.arena || S.flat;
function initStage() {
  const q = new URLSearchParams(location.search), AR = window.COLOSSEUM_ARENA, lite = !!(O && O.lite && O.lite());
  if (q.get('flat') !== '1' && !lite && AR) { try { S.arena = AR.createArena($('arena'), { reduced: reduced() }); } catch (_) { S.arena = null; } }
  if (S.arena) { S.stageMode = '3d'; return; }
  $('arena').hidden = true; $('flat').removeAttribute('hidden'); S.flat = createFlat($('flat')); S.stageMode = 'flat';
  $('lite').hidden = !lite;
}

// ------------------------------------------------------------------ the duel
function stopPlay() { clearTimeout(S.timer); clearTimeout(S.guard); S.timer = 0; S.guard = 0; S.busy = false; S.auto = false; S.token = (S.token || 0) + 1; }
function setDuel() {
  stopPlay();
  S.duel = S.a && S.b ? C.duel(S.a, S.b, { demo: S.demo }) : null; S.shown = 0; S.done = false;
  const st = stage(); if (st) { st.reset(); st.setFighters({ crest: C.crest(S.a && S.a.family), id: S.a ? S.a.id : 'a' }, { crest: C.crest(S.b && S.b.family), id: S.b ? S.b.id : 'b' }); }
  for (const [k, f] of [['A', S.a], ['B', S.b]]) {
    const col = C.crest(f && f.family);
    $('name' + k).textContent = label(f); $('fam' + k).textContent = f ? f.family : ''; $('crest' + k).style.background = col;
    $('sName' + k).textContent = title(f); $('sPlate' + k).textContent = f ? `${f.kind === 'bot' ? 'Live account' : `${f.id} · ${f.family} · ${C.VERDICT_WORD[f.verdict]}`}. ${C.plate(f)}` : 'Tap a run below'; $('sCrest' + k).style.background = col;
  }
  const d = S.duel;
  $('periodPill').textContent = !d ? 'Pick two fighters' : d.period === 'live' ? 'Live so far' : d.period ? `${d.periodWord} backtest` : 'No shared period';
  $('verdict').hidden = true; closePerson();
  paintIntro(); paintScore(); paintControls();
  try { const hs = C.makeHash(S.a && S.a.id, S.b && S.b.id); if (!S.want && hs && hs !== location.hash) history.replaceState(null, '', hs); } catch (_) { /* a sandboxed frame */ }
}
function paintIntro() {
  const d = S.duel;
  $('roundNo').textContent = 'Seven rounds, money first'; $('vs').hidden = true;
  $('roundPlain').textContent = 'Net dollars, dollars a month, profit factor, max drawdown, trades a week, eval speed, and holding in both periods.';
  $('roundLine').textContent = !d ? 'Pick two fighters below.' : !d.period ? `${label(S.a)} and ${label(S.b)} have no period in common: every round would be no contest.` : `${label(S.a)} against ${label(S.b)} on their ${d.period === 'live' ? 'live account numbers so far' : d.periodWord + ' numbers'}.`;
}
function paintScore() {
  const d = S.duel, sc = { a: 0, b: 0 };
  const pips = $('pips'); clear(pips);
  C.ROUNDS.forEach((R, i) => {
    const li = h('li'), r = d && i < S.shown ? d.rounds[i] : null;
    if (r) { li.className = r.winner; sc[r.winner] = (sc[r.winner] || 0) + 1; }
    if (d && i === S.shown && !S.done && (S.busy || S.shown > 0)) li.classList.add('now');
    li.setAttribute('aria-label', `Round ${i + 1}, ${R.name}: ${r ? (r.winner === 'a' ? label(S.a) : r.winner === 'b' ? label(S.b) : r.winner === 'draw' ? 'level' : 'no contest') : 'not played yet'}`);
    pips.appendChild(li);
  });
  $('score').textContent = `${sc.a} - ${sc.b}`;
}
function paintRound(r, awarded) {
  const d = S.duel;
  $('roundNo').textContent = `Round ${r.i} of 7: ${r.name}`;
  $('roundPlain').textContent = `${r.plain}${r.key === 'both' || !d.period ? '' : ` (${d.periodWord})`}.`;
  $('vs').hidden = false;
  for (const [k, sd, me] of [['A', r.a, 'a'], ['B', r.b, 'b']]) {
    const box = $('num' + k).parentNode, has = sd.v !== null;
    $('num' + k).textContent = has ? sd.big : 'not stored'; $('sub' + k).textContent = has ? sd.sub : `no ${String(sd.miss).replace(/^an? /, '')}`;
    box.className = 'num ' + me.toLowerCase() + (!has ? ' nc' : awarded && r.winner === me ? ' win' : awarded && (r.winner === 'a' || r.winner === 'b') ? ' lose' : '');
  }
  $('roundLine').textContent = awarded ? r.line : '';
}
function paintControls() {
  const d = S.duel, ok = !!d;
  $('fight').textContent = S.done ? 'Fight again' : S.shown > 0 ? 'Play the rest' : 'Start the duel';
  $('fight').disabled = !ok || S.auto; $('next').disabled = !ok || S.busy || S.auto || S.done; $('skip').disabled = !ok || S.done;
}
function land(r, auto) {
  clearTimeout(S.guard); S.guard = 0;
  if (!S.busy) return;
  S.busy = false; S.shown = r.i; paintRound(r, true); paintScore();
  cue('tap');
  if (S.shown >= 7) S.timer = setTimeout(finish, reduced() ? 0 : 650);
  else if (auto) S.timer = setTimeout(() => step(true), reduced() ? 0 : 850);
  paintControls();
}
function step(auto) {
  const d = S.duel; if (!d || S.busy || S.done) return;
  if (S.shown >= 7) { finish(); return; }
  const r = d.rounds[S.shown]; S.busy = true; S.auto = !!auto;
  paintRound(r, false); paintScore(); paintControls();
  const token = S.token; let once = false; const cb = () => { if (once || token !== S.token) return; once = true; land(r, auto); };
  S.guard = setTimeout(cb, 1800);                      // a hidden tab draws no frame: the round still lands
  const st = stage(); if (st) st.clash(r.winner, cb); else cb();
}
function finish() {
  const d = S.duel; if (!d) return;
  stopPlay(); S.shown = 7; S.done = true;
  paintRound(d.rounds[6], true); paintScore();
  const st = stage(); if (st) st.verdict(d.winner);
  renderVerdict(); paintControls(); cue('success');
  say(d.why[0]);
}
function fight() { if (!S.duel || S.auto) return; if (S.done) { setDuel(); } if (reduced()) { finish(); return; } step(true); }

function renderVerdict() {
  const d = S.duel, W = d.winner === 'a' ? S.a : d.winner === 'b' ? S.b : null;
  $('verdict').hidden = false;
  $('verPill').textContent = `${d.score.a} - ${d.score.b}`; $('verPill').className = 'pill ' + (W ? 'gold' : 'info');
  $('verHead').textContent = W ? `${label(W)} wins` : d.period ? 'A draw' : 'No contest';
  const why = $('why'); clear(why); for (const s of d.why) why.appendChild(h('li', '', s));
  const rows = $('roundRows'); clear(rows);
  for (const r of d.rounds) {
    const tr = h('tr'); const th = h('th', '', r.name); th.scope = 'row'; tr.appendChild(th);
    tr.appendChild(h('td', r.a.v === null ? 'nc' : r.winner === 'a' ? 'won' : '', r.a.v === null ? 'not stored' : r.a.big));
    tr.appendChild(h('td', r.b.v === null ? 'nc' : r.winner === 'b' ? 'won' : '', r.b.v === null ? 'not stored' : r.b.big));
    tr.appendChild(h('td', r.winner === 'none' ? 'nc' : '', r.winner === 'a' ? 'A' : r.winner === 'b' ? 'B' : r.winner === 'draw' ? 'Level' : 'No contest'));
    rows.appendChild(tr);
  }
  const cav = $('caveats'); clear(cav); for (const s of d.caveats) cav.appendChild(h('li', '', s));
  renderSays();
  $('shareText').textContent = d.share;
  for (const [id, f] of [['openA', S.a], ['openB', S.b]]) { const a = $(id); a.hidden = !f || f.kind !== 'run'; if (f && f.kind === 'run') { a.href = '../archive/?q=' + encodeURIComponent(f.id); a.textContent = `Open ${f.id} in the Archive`; } }
}
async function copy(text, okWord) {
  try { await navigator.clipboard.writeText(text); say(okWord); } catch (_) { say('Copy is not allowed here: press and hold the text to copy it.'); }
}

// ------------------------------------------------------------------ every champion is a person: a name plate, Talk, and (without the shared kit) five honest answers
const SKINS = ['#f1c9a5', '#e6b58c', '#d39c6e', '#b97f52', '#96643f'];
function seedOf(s) { let x = 7; const str = String(s || ''); for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) % 100003; return x; }
function drawFace(svg, f) {
  clear(svg); const skin = SKINS[seedOf(f.id) % SKINS.length], col = C.crest(f.family);
  sv('circle', { cx: 24, cy: 24, r: 23, fill: '#2a2217', stroke: '#3a3228' }, svg);
  sv('path', { d: 'M 8 47 Q 8 35 24 35 Q 40 35 40 47 Z', fill: col }, svg);
  sv('circle', { cx: 24, cy: 23, r: 12, fill: skin }, svg);
  sv('ellipse', { cx: 19.5, cy: 23.5, rx: 1.3, ry: 2.1, fill: '#2b2118' }, svg); sv('ellipse', { cx: 28.5, cy: 23.5, rx: 1.3, ry: 2.1, fill: '#2b2118' }, svg);
  sv('path', { d: 'M 20.5 28.5 Q 24 31 27.5 28.5', fill: 'none', stroke: '#2b2118', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, svg);
  sv('path', { d: 'M 11.6 21 A 12.4 12.4 0 0 1 36.4 21 Z', fill: '#9c6b3c' }, svg); sv('rect', { x: 11.6, y: 20, width: 24.8, height: 1.8, fill: '#c8a24a' }, svg);
  sv('path', { d: 'M 14 12 Q 24 -1 34 12 L 32 13.6 Q 24 5 16 13.6 Z', fill: col }, svg);
}
function openPerson(k) {
  const f = k === 'a' ? S.a : S.b; if (!f) return;
  S.person = k; $('person').hidden = false; drawFace($('face'), f);
  $('pName').textContent = title(f); $('pPlate').textContent = `${f.kind === 'bot' ? 'Live bot' : `${f.id} \u00b7 ${f.family} \u00b7 ${C.VERDICT_WORD[f.verdict]}`}. ${C.plate(f)}`;
  $('talk').textContent = `Talk to ${label(f)}`; $('askBox').hidden = true; $('answer').textContent = '';
  $('plateA').setAttribute('aria-expanded', k === 'a' ? 'true' : 'false'); $('plateB').setAttribute('aria-expanded', k === 'b' ? 'true' : 'false');
  cue('tap');
}
function closePerson() { S.person = null; $('person').hidden = true; $('plateA').setAttribute('aria-expanded', 'false'); $('plateB').setAttribute('aria-expanded', 'false'); }
function ask(key) {
  const f = S.person === 'a' ? S.a : S.b; if (!f) return;
  $('answer').textContent = C.answer(f, key, S.done ? S.duel : null);
  for (const b of $('asks').children) b.setAttribute('aria-pressed', b.dataset.ask === key ? 'true' : 'false');
}
function talk() {
  const f = S.person === 'a' ? S.a : S.b; if (!f) return;
  const kit = window.OLYMPUS_PEOPLE, id = C.personId(f);
  if (kit && typeof kit.open === 'function') { try { kit.open(id, { anchor: $('talk') }); S.talked = id; return; } catch (_) { /* the kit failed: the page's own card answers */ } }
  const box = $('asks'); clear(box);
  for (const [key, text] of C.QUESTIONS) { const b = h('button', 'ag-chip', text); b.type = 'button'; b.dataset.ask = key; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => ask(key)); box.appendChild(b); }
  $('askBox').hidden = false; ask('win');
}
function renderSays() {
  const box = $('says'); clear(box);
  for (const x of C.afterLines(S.duel)) { const q = h('blockquote', 'say ' + x.role); q.dataset.person = x.id; q.appendChild(h('b', '', x.who)); q.appendChild(h('p', '', x.line)); box.appendChild(q); }
}

// ------------------------------------------------------------------ pick the fighters
const MODES = [['any', 'Any two runs'], ['champ', 'Champion vs challenger'], ['bots', 'My three bots']];
function champion() { return C.byId(S.v, 'lit_live') || C.contenders(S.v.runs, C.N_FLOOR)[0] || S.v.runs[0]; }
function defaults() {
  const a = champion(), pool = C.contenders(S.v.runs, C.N_FLOOR);
  const b = (C.byId(S.v, 'atlas_base') && a.id !== 'atlas_base' ? C.byId(S.v, 'atlas_base') : null) || pool.find((r) => r.id !== a.id) || S.v.runs.find((r) => r.id !== a.id) || a;
  return [a, b];
}
function setMode(m) {
  if (m === S.mode) return;
  if (S.mode !== 'bots') S.lastRuns = [S.a, S.b];
  S.mode = m;
  if (m === 'bots') { const rows = S.league.rows; S.a = rows[0]; S.b = rows[1]; S.slot = 'b'; }
  else { const back = S.lastRuns && S.lastRuns[0] && S.lastRuns[0].kind === 'run' ? S.lastRuns : defaults(); S.a = back[0]; S.b = back[1]; if (m === 'champ') { S.a = champion(); if (S.b.id === S.a.id) S.b = defaults()[1]; S.slot = 'b'; } }
  setDuel(); renderPick();
}
function pick(f, slot) {
  if (!f) return;
  S.want = null;                                        // a pick by hand beats a link that is still loading
  const k = S.mode === 'champ' ? 'b' : slot || S.slot;
  if (k === 'a') { if (S.b && S.b.id === f.id) S.b = S.a; S.a = f; } else { if (S.a && S.a.id === f.id) { if (S.mode === 'champ') { say('The champion cannot fight itself: pick another run.'); return; } S.a = S.b; } S.b = f; }
  if (S.mode !== 'champ') S.slot = k === 'a' ? 'b' : 'a';
  setDuel(); renderPick(); cue('tap');
  say(`${label(S.a)} against ${label(S.b)}. Press "Start the duel".`);
}
function renderPick() {
  const box = $('modes'); clear(box);
  for (const [id, text] of MODES) { const b = h('button', 'ag-chip', text); b.type = 'button'; b.dataset.mode = id; b.setAttribute('aria-pressed', id === S.mode ? 'true' : 'false'); b.addEventListener('click', () => setMode(id)); box.appendChild(b); }
  $('modeNote').textContent = S.mode === 'bots' ? 'LIT, ATLAS and BLITZ on their live account numbers so far. A round without a stored number is no contest.'
    : S.mode === 'champ' ? `The champion holds slot A: ${label(S.a)}${S.a && S.a.id === 'lit_live' ? ', the live LIT run' : ''}. Pick any challenger for slot B.` : `Any two of the ${S.v.runs.length.toLocaleString('en-US')} runs loaded${S.shardsLoaded ? '' : ' so far'}. Tap a slot, then a run.`;
  $('slotA').setAttribute('aria-pressed', S.slot === 'a' && S.mode !== 'champ' ? 'true' : 'false'); $('slotB').setAttribute('aria-pressed', S.slot === 'b' || S.mode === 'champ' ? 'true' : 'false');
  $('slotA').disabled = S.mode === 'champ';
  $('finder').hidden = S.mode === 'bots'; $('botPick').hidden = S.mode !== 'bots'; $('swap').hidden = S.mode === 'champ';
  if (S.mode === 'bots') {
    const bp = $('botPick'); clear(bp);
    for (const r of S.league.rows) { const b = h('button', 'ag-chip', r.name); b.type = 'button'; b.dataset.bot = r.key; b.setAttribute('aria-pressed', (S.a && S.a.id === r.id) || (S.b && S.b.id === r.id) ? 'true' : 'false'); b.addEventListener('click', () => pick(r)); bp.appendChild(b); }
    return;
  }
  const q = S.q.trim(), list = q ? C.search(S.v.runs, q, 8) : C.contenders(S.v.runs, C.N_FLOOR).slice(0, 6);
  $('count').textContent = q ? (list.length ? `Best ${list.length} matches for "${q}"${S.shardsLoaded ? '' : ' (the rejected runs are still loading)'}.` : `Nothing matches "${q}"${S.shardsLoaded ? '' : ' yet: the rejected runs are still loading'}.`) : 'The top adopted runs by dollars a month. Type to search every run.';
  const ul = $('results'); clear(ul);
  for (const r of list) {
    const li = h('li'), b = h('button', 'pickrun v' + r.verdict); b.type = 'button'; b.dataset.id = r.id;
    b.appendChild(h('b', '', r.name)); b.appendChild(h('small', '', `${r.id} · ${r.family} · ${C.VERDICT_WORD[r.verdict]}`)); b.appendChild(h('small', '', C.plate(r)));
    b.setAttribute('aria-label', `Send ${r.id} into the arena as fighter ${S.mode === 'champ' ? 'B' : S.slot.toUpperCase()}`);
    b.addEventListener('click', () => pick(r)); li.appendChild(b); ul.appendChild(li);
  }
}

// ------------------------------------------------------------------ the tournament
function drawLaurel(svg) {
  clear(svg);
  for (const s of [-1, 1]) {
    sv('path', { d: `M 60 88 Q ${60 + s * 46} 70 ${60 + s * 30} 14`, fill: 'none', stroke: '#9c6b3c', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    for (let i = 0; i < 7; i++) { const t = (i + 0.6) / 7.4, x = 60 + s * (4 + 40 * Math.sin(t * Math.PI * 0.86)), y = 86 - t * 70, rot = s * (58 - t * 70); sv('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: 10, ry: 4, fill: i % 2 ? '#c8a24a' : '#7f8a52', transform: `rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` }, svg); }
  }
  sv('circle', { cx: 60, cy: 89, r: 3.5, fill: '#c96a4a' }, svg);
}
function tournamentNote() {
  const pool = C.contenders(S.v.runs, C.N_FLOOR), size = Math.min(16, pool.length >= 16 ? 16 : pool.length >= 8 ? 8 : pool.length >= 4 ? 4 : pool.length >= 2 ? 2 : 0);
  $('tPill').textContent = size ? `Top ${size}` : 'Not enough runs';
  $('tNote').textContent = size ? `A knockout of the top ${size} adopted runs, seeded by dollars a month in 2026 (${pool.length} adopted runs have ${C.N_FLOOR} trades or more; runs with identical numbers count once). Every match is the same seven rounds. A level match goes to the higher seed.`
    : `A tournament needs at least two adopted runs with ${C.N_FLOOR} trades or more.`;
  $('tGo').disabled = !size;
}
function playTournament(instant) {
  clearTimeout(S.tTimer);
  const T = C.tournament(S.v.runs, { demo: S.demo }); S.tour = T;
  const box = $('bracket'); clear(box); $('champ').hidden = true; $('tShareText').hidden = true; $('tBtns').hidden = true;
  if (!T.ok) { $('tNote').textContent = T.share; return T; }
  const quick = instant || reduced();
  const showRound = (i) => {
    if (i >= T.rounds.length) {
      const ch = T.champion, m = ch.f.m26;
      drawLaurel($('laurel')); $('champ').hidden = false; $('champName').textContent = `${ch.f.id} (seed ${ch.seed})`;
      $('champNums').textContent = `${ch.f.name}. 2026: ${C.usdS(m.net)} net, ${C.usd(m.pm)} a month, PF ${C.pf(m.pf)}, ${C.dec(m.tpw, 1)} trades a week, n = ${m.n}. A stored backtest after costs: not a promise.`;
      $('tShareText').textContent = T.share; $('tShareText').hidden = false; $('tBtns').hidden = false; $('tGo').textContent = 'Play it again';
      say(`Tournament: ${ch.f.id} is champion.`); cue('success'); S.tDone = true; return;
    }
    const R = T.rounds[i], sec = h('div', 'tround'); sec.appendChild(h('h3', '', R.name));
    for (const mt of R.matches) {
      const row = h('div', 'match'), aw = mt.winner === mt.a;
      row.appendChild(h('span', aw ? 'w' : '', `${mt.a.seed}. ${mt.a.f.id}`)); row.appendChild(h('i', aw ? 'w' : '', String(mt.score[0])));
      row.appendChild(h('span', aw ? '' : 'w', `${mt.b.seed}. ${mt.b.f.id}`)); row.appendChild(h('i', aw ? '' : 'w', String(mt.score[1])));
      if (mt.note) row.appendChild(h('em', '', mt.note));
      sec.appendChild(row);
    }
    box.appendChild(sec);
    if (quick) showRound(i + 1); else { cue('tap'); S.tTimer = setTimeout(() => showRound(i + 1), 450); }
  };
  S.tDone = false; showRound(0);
  return T;
}
function watchFinal() {
  const T = S.tour; if (!T || !T.ok) return;
  if (S.mode !== 'any') { S.mode = 'any'; }
  S.a = T.champion.f; S.b = T.runnerUp.f; S.slot = 'b'; setDuel(); renderPick();
  try { $('duelH').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); } catch (_) { /* old Safari */ }
  fight();
}

// ------------------------------------------------------------------ the bots, the hall, the fallen
function renderLeague() {
  const L = S.league, rows = $('leagueRows'); clear(rows);
  $('botPill').textContent = L.demo ? 'DEMO' : 'Live accounts'; $('botPill').className = 'pill ' + (L.demo ? 'warn' : 'ok');
  for (const r of L.rows) {
    const tr = h('tr'); const th = h('th', '', `${r.rank}. ${r.name}`); th.scope = 'row'; tr.appendChild(th);
    tr.appendChild(h('td', r.net === null ? 'nc' : r.net >= 0 ? 'pos' : 'neg', r.net === null ? 'no trades yet' : C.usdS(r.net)));
    tr.appendChild(h('td', '', r.pfv === null ? 'n/a' : C.pf(r.pfv))); tr.appendChild(h('td', '', r.n === null ? 'n/a' : String(r.n)));
    tr.appendChild(h('td', '', r.dd === null ? 'n/a' : C.usd(-Math.abs(r.dd)))); rows.appendChild(tr);
  }
  $('botNote').textContent = L.demo ? 'The league of the three bots: DEMO rows, invented, because the live account file did not answer' : 'The league of the three bots, from their live accounts (paper or Sim), best net dollars first';
  $('botFoot').textContent = 'Net dollars, profit factor, closed trades and the worst drop of each account so far. A short record says little: read n before the dollars. Dollars a month, trades a week and eval speed are not in the account file, so those rounds are no contest in a bot duel.';
}
function drawBust(svg, colour) {
  sv('rect', { x: 20, y: 80, width: 44, height: 12, rx: 2, fill: '#b4ab98' }, svg); sv('rect', { x: 24, y: 74, width: 36, height: 7, fill: colour }, svg);
  sv('path', { d: 'M 22 74 Q 22 52 42 52 Q 62 52 62 74 Z', fill: '#e4dccb' }, svg); sv('rect', { x: 37, y: 40, width: 10, height: 14, fill: '#d6ccb8' }, svg);
  sv('ellipse', { cx: 42, cy: 30, rx: 11.5, ry: 14, fill: '#e9e3d5' }, svg); sv('path', { d: 'M 30.5 27 Q 42 8 53.5 27 Q 42 19 30.5 27 Z', fill: '#b4ab98' }, svg);
  sv('path', { d: 'M 30 25 Q 42 17 54 25', fill: 'none', stroke: '#c8a24a', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg);
}
function renderHall() {
  const list = C.hall(S.v.runs, 12), ul = $('hall'); clear(ul);
  $('hallPill').textContent = `${list.length} statue${list.length === 1 ? '' : 's'}`;
  list.forEach((r, i) => {
    const li = h('li', 'arch'), svg = sv('svg', { viewBox: '0 0 84 96', role: 'img', 'aria-label': `A marble bust for ${r.id}` }); drawBust(svg, C.crest(r.family)); li.appendChild(svg);
    li.appendChild(h('span', 'rank', `No. ${i + 1} · ${r.family}`)); li.appendChild(h('b', '', r.id));
    li.appendChild(h('small', '', `${C.usd(r.m26.pm)} a month, ${C.usdS(r.m26.net)} net`)); li.appendChild(h('small', '', `PF ${C.pf(r.m26.pf)}, n = ${r.m26.n} (2026)`));
    const seg = h('div', 'seg');
    for (const k of ['a', 'b']) { const b = h('button', 'btn', 'As ' + k.toUpperCase()); b.type = 'button'; b.dataset.hall = r.id; b.dataset.slot = k; b.setAttribute('aria-label', `Send ${r.id} into the arena as fighter ${k.toUpperCase()}`); b.addEventListener('click', () => { if (S.mode === 'bots') { const d = S.lastRuns && S.lastRuns[0] && S.lastRuns[0].kind === 'run' ? S.lastRuns : defaults(); S.a = d[0]; S.b = d[1]; } S.mode = 'any'; pick(r, k); }); seg.appendChild(b); }
    li.appendChild(seg); ul.appendChild(li);
  });
  if (!list.length) ul.appendChild(h('li', 'note', 'No adopted run with a 2026 result yet.'));
}
function renderFallen() {
  const list = C.fallen(S.v.rejected, 10), ul = $('fallen'); clear(ul);
  $('fallPill').textContent = `${S.v.rejected.length} rejected idea${S.v.rejected.length === 1 ? '' : 's'}`;
  for (const x of list) {
    const li = h('li'); li.appendChild(h('small', '', "Don't redo this")); li.appendChild(h('b', '', x.title));
    const cut = x.reason.length > 240 ? x.reason.slice(0, 240).replace(/\s+\S*$/, '') + '...' : x.reason; li.appendChild(h('p', '', cut));
    if (cut !== x.reason) { const d = h('details'), s = h('summary', '', 'The whole reason'); d.appendChild(s); d.appendChild(h('p', '', x.reason)); li.appendChild(d); }
    ul.appendChild(li);
  }
  if (!list.length) ul.appendChild(h('li', '', 'No rejected idea is listed yet.'));
}

// ------------------------------------------------------------------ links and loading
function resolve(id) { if (!id) return null; if (id.indexOf('bot:') === 0) return S.league.rows.find((r) => r.id === id) || null; return C.byId(S.v, id); }
function applyHash(wanted) {
  const w = wanted || C.parseHash(location.hash); if (!w.a && !w.b) return false;
  const a = resolve(w.a), b = resolve(w.b);
  if ((w.a && !a) || (w.b && !b)) { if (!S.shardsLoaded) { S.want = w; return false; } else if (S.ready) say(`The link names a run that is not in the Archive: ${[!a && w.a, !b && w.b].filter(Boolean).join(', ')}.`); }
  if (!a && !b) return false;
  const bots = (a && a.kind === 'bot') || (b && b.kind === 'bot');
  if (bots && !(a && b && a.kind === 'bot' && b.kind === 'bot')) return false;
  S.mode = bots ? 'bots' : 'any'; if (a) S.a = a; if (b) S.b = b;
  if (S.a && S.b && S.a.id === S.b.id) return false;
  if ((!w.a || a) && (!w.b || b)) S.want = null;
  return true;
}
async function loadRest(extraP) {
  const ex = await extraP; if (ex) { C.addExtra(S.v, ex); S.extra = ex; if (!S.busy && !S.auto && S.shown === 0) setDuel(); }
  for (const name of S.v.shards) {
    const sh = await getJSON(`../archive/${name}`, 15000);
    if (sh) { C.addShard(S.v, sh); if (S.extra) C.addExtra(S.v, S.extra); if (S.want && applyHash(S.want)) { setDuel(); renderPick(); } if (S.q) renderPick(); }
  }
  S.shardsLoaded = true;
  if (S.want) { const w = S.want; S.want = null; if (applyHash(w)) setDuel(); }
  if (S.mode !== 'bots') renderPick();
  renderFallen();
}
async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  const extraP = forced ? Promise.resolve(null) : getJSON('./extra.json', 15000);
  const [fx, real, home] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../archive/index.json', 15000), forced ? null : getJSON('../home.json')]);
  const data = C.chooseData(real, fx);
  if (!data) { say('The arena is empty: neither the Archive nor the demo file could be read. Reload to try again.'); S.ready = true; try { if (O && O.ready) O.ready(); } catch (_) { /* gone */ } return; }
  S.v = data.v; S.demo = data.src === 'demo'; S.fixture = fx; S.home = home; S.league = C.league(home, fx);
  $('demo').hidden = !S.demo;
  initStage();
  const d = defaults(); S.a = d[0]; S.b = d[1];
  applyHash();
  setDuel(); renderPick(); tournamentNote(); renderLeague(); renderHall(); renderFallen();
  say(S.demo ? 'DEMO: invented example runs, because the Archive file did not answer. Nothing here is a real result.' : `${S.v.total.toLocaleString('en-US')} stored runs can fight. ${label(S.a)} against ${label(S.b)}: press "Start the duel".`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the kit lifts its loading veil by itself after 12 s */ }
  if (S.demo) { S.shardsLoaded = true; return; }
  loadRest(extraP);
}

$('fight').addEventListener('click', fight);
$('plateA').addEventListener('click', () => (S.person === 'a' ? closePerson() : openPerson('a')));
$('plateB').addEventListener('click', () => (S.person === 'b' ? closePerson() : openPerson('b')));
$('pClose').addEventListener('click', closePerson);
$('talk').addEventListener('click', talk);
$('next').addEventListener('click', () => step(false));
$('skip').addEventListener('click', finish);
$('slotA').addEventListener('click', () => { if (S.mode !== 'champ') { S.slot = 'a'; renderPick(); } });
$('slotB').addEventListener('click', () => { S.slot = 'b'; renderPick(); });
$('swap').addEventListener('click', () => { const t = S.a; S.a = S.b; S.b = t; setDuel(); renderPick(); });
$('q').addEventListener('input', (e) => { S.q = e.target.value; renderPick(); });
$('share').addEventListener('click', () => { if (S.duel) copy(S.duel.share, 'The result is copied.'); });
$('copyLink').addEventListener('click', () => copy(location.origin + location.pathname + C.makeHash(S.a && S.a.id, S.b && S.b.id), 'The link to this duel is copied.'));
$('tGo').addEventListener('click', () => playTournament(false));
$('tShare').addEventListener('click', () => { if (S.tour) copy(S.tour.share, 'The tournament result is copied.'); });
$('tFinal').addEventListener('click', watchFinal);
window.addEventListener('hashchange', () => { if (S.ready && S.v && applyHash()) { setDuel(); renderPick(); } });

window.COLOSSEUM = { S, C, ready: () => S.ready, shards: () => !!S.shardsLoaded, fight, step, finish, openPerson, talk, ask, pick: (id, slot) => pick(resolve(id), slot), setMode, playTournament, watchFinal,
  get stage() { return stage(); }, get mode() { return S.stageMode; } };
boot();
