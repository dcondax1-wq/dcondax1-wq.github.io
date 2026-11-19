// ERGASTERION page (ES module): the AI agent factory where you can see, first person, what every worker is doing, then what was learned from it.
// Reads ./builders.json (the Builders' camp: the build agents working right now, from handoff/agents_now.json joined with git), ./queue.json (tools/ergasterion_build.py: tasks, write-ups, lessons, what changed our mind, the dated event stream, the research pipeline, data gaps), ../home.json,
// ../money/index.json, the public kalshi.json feed, ../cronos/status.json, ../prometheus/forge.json, ../hephaestus/data.json and ./fixture.json (DEMO when none of the live files is there).
// Read only and paper only: it sends nothing and starts nothing. Text only through textContent / createElementNS. The 3D factory comes from floor.js (optional, loaded by
// floorload.js); the flat plan (LITE) is always drawn first. window.ERGASTERION is the test hook.
import * as C from './ergasterioncore.js';
import * as Life from './life.js';
import * as T from '../olympus/truth.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const S = { fixture: null, inputs: null, demo: false, forced: false, workers: [], head: null, events: [], next: [], sel: null, crate: -1, follow: '', view: 'plan', floor: null, ready: false, now: Date.now(), tried: false,
  people: [], place: 'library', chat: null, standing: false, builders: [], hands: null, bsel: null, bdoc: null, bdemo: false, scrollI: 0, stream: [], win: null, range: '24h', cur: 1, playing: false, speed: 1, at: null, board: null, pipe: null, cat: '', sayI: 0, tour: false };
const LAMPC = { working: '#8fa05a', idle: '#4b7a99', stale: '#e0b060', failed: '#c96a4a', sample: '#b8ad98' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is this site's own copy (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json), nothing else: the old kalshi-feed
// repo on the suspended account is retired (polish2 2026-11-19). A host that answers a missing file with its index page gives HTML: not an object = none.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; }
function say(t) { $('status').textContent = t; }
function shortAgo(ms, now) { const a = C.ageH(ms, now); return a == null ? '' : a < 1 ? Math.max(1, Math.round(a * 60)) + ' min' : a < 36 ? Math.round(a) + ' h' : Math.round(a / 24) + ' d'; }
const toView = (el, block) => { try { el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: block || 'start' }); } catch (_) { /* nothing */ } };

function model() {
  S.now = Date.now();
  const got = !S.forced && S.inputs && C.haveReal(S.inputs);
  S.demo = !got;
  const inp = got ? S.inputs : C.resolveDemo(S.fixture, S.now);
  S.inp = inp;
  S.workers = C.buildWorkers(inp, S.now);
  S.head = C.headline(S.workers);
  S.events = C.events(S.workers, S.now, 12);
  S.stream = C.stream(inp, S.workers, S.now);
  S.win = C.replayWindow(S.stream, S.now, S.range);
  S.at = C.replayAt(S.win, S.cur);
  S.board = C.board(inp.queue, S.workers, S.now, S.demo);
  S.pipe = C.pipeline(inp.queue, S.demo);
  S.next = C.suggestions(S.workers, inp.queue, S.now);
  // the builders' camp has its own file: real when builders.json is there (and the demo is not forced), else the labelled sample
  const realB = !S.forced && S.inputs && S.inputs.builders && Array.isArray(S.inputs.builders.agents) && S.inputs.builders.agents.length ? S.inputs.builders : null;
  S.bdemo = !realB; S.bdoc = realB || C.resolveBuilders(S.fixture && S.fixture.builders, S.now);
  S.builders = C.builders(S.bdoc, S.now, S.bdemo); S.hands = C.allHands(S.builders, S.bdoc, S.bdemo);
  S.people = C.people(S.workers, S.builders);
}
const byId = (id) => S.workers.find((w) => w.id === id) || null;

// ------------------------------------------------------------------------------------------------ the plan (LITE view, also the minimap)
function sx(x) { return 180 + x * 13.2; } function sy(z) { return 146 + z * 13.4; }
// the job a worker is seen doing, as a small drawing on its marble disc (the 2D stand-in for the animated figure)
const ICON = {
  wheel: [['circle', { cx: 0, cy: 0, r: 6.5 }], ['path', { d: 'M-6.5 0H6.5M0 -6.5V6.5M-4.6 -4.6L4.6 4.6M-4.6 4.6L4.6 -4.6' }]],
  scribe: [['path', { d: 'M-6 6.5H6M-5 6.5V2.5H5V6.5' }], ['path', { d: 'M-2.5 2.5L5.5 -6.5L3 -1.5Z' }]],
  oracle: [['path', { d: 'M-5.5 -2.5Q0 3 5.5 -2.5ZM-3.5 0L-5.5 7M3.5 0L5.5 7M0 1V7' }], ['path', { d: 'M0 -4Q-2.5 -6 0 -8Q2.5 -6 0 -4' }]],
  smith: [['path', { d: 'M-6.5 3H3.5L6 0.5H-4ZM-3 3V7M1 3V7M-5.5 7H3.5' }], ['path', { d: 'M5.5 -7L0.5 -2.5M3.5 -8.5L7 -5' }]],
  scales: [['path', { d: 'M0 -7V7M-3.5 7H3.5M-6.5 -5H6.5' }], ['path', { d: 'M-6.5 -5L-8.5 0.5H-4.5ZM6.5 -5L4.5 0.5H8.5Z' }]],
};
function drawPlan(svg, mini) {
  clear(svg);
  const me = mini && S.floor && S.floor.ok ? S.floor.pos() : null, hot = new Set(S.at ? S.at.active : []);
  svg.appendChild(sv('rect', { x: 6, y: 8, width: 348, height: 276, rx: 8, fill: mini ? 'rgba(29,25,20,.2)' : '#2a2318', stroke: '#9c6b3c', 'stroke-width': mini ? 3 : 1.5 }));
  for (const hl of C.HALLS) {
    const x = sx(hl.x0) + 2, y = sy(hl.z0) + 2, w = sx(hl.x1) - sx(hl.x0) - 4, hh = sy(hl.z1) - sy(hl.z0) - 4, here = me && me.hall === hl.id;
    svg.appendChild(sv('rect', { x, y, width: w, height: hh, rx: 5, fill: hl.tone, opacity: here ? 0.34 : mini ? 0.14 : 0.1 }));
    if (!mini) svg.appendChild(sv('text', { x: x + 6, y: y + 12, fill: '#cfc4b2', 'font-size': 9, 'font-weight': 600 }, hl.name));
  }
  // the cross of inner walls, with a gap for each door
  for (const ax of ['x', 'z']) {
    const len = ax === 'x' ? 10 : 13, ds = C.DOORS.filter((d) => d.axis === ax).sort((a, b) => a.c - b.c); let from = -len;
    const seg = (a, b) => svg.appendChild(sv('line', ax === 'x' ? { x1: sx(0), y1: sy(a), x2: sx(0), y2: sy(b), stroke: '#9c6b3c', 'stroke-width': mini ? 4 : 2.5 } : { x1: sx(a), y1: sy(0), x2: sx(b), y2: sy(0), stroke: '#9c6b3c', 'stroke-width': mini ? 4 : 2.5 }));
    for (const d of ds) { seg(from, d.c - d.half); from = d.c + d.half; }
    seg(from, len);
  }
  if (!mini) { svg.appendChild(sv('rect', { x: sx(C.START.x) - 14, y: 281, width: 28, height: 5, rx: 2, fill: '#c8a24a' })); svg.appendChild(sv('text', { x: sx(C.START.x) + 20, y: 279, fill: '#9a8f7d', 'font-size': 8.5 }, 'Front door')); }
  for (const w of S.workers) {
    const x = sx(w.x), y = sy(w.z), sel = S.sel === w.id;
    const g = sv('g', mini ? {} : { role: 'button', tabindex: 0, 'aria-label': w.name + ', ' + C.JOB_WORD[w.job] + ': ' + C.STATUS_WORD[w.status] + '. Open its card.', 'data-id': w.id });
    if (hot.has(w.id)) g.setAttribute('class', 'hot');
    if (!mini) g.appendChild(sv('rect', { x: x - 26, y: y - 23, width: 52, height: 54, fill: 'transparent' }));
    g.appendChild(sv('circle', { class: 'disc', cx: x, cy: y - 4, r: mini ? 9 : 12.5, fill: '#d9d2c3', stroke: sel ? '#c8a24a' : '#9c6b3c', 'stroke-width': sel ? 3 : 1.5 }));
    if (mini) g.appendChild(sv('circle', { cx: x, cy: y - 4, r: 5, fill: LAMPC[w.status] || LAMPC.stale, stroke: 'rgba(0,0,0,.35)' }));
    else {
      const ic = sv('g', { transform: 'translate(' + x.toFixed(1) + ' ' + (y - 4).toFixed(1) + ')', fill: 'none', stroke: '#3a2f22', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      for (const [tag, at] of ICON[w.job] || ICON.wheel) ic.appendChild(sv(tag, at));
      g.appendChild(ic);
      g.appendChild(sv('circle', { cx: x + 11, cy: y - 14, r: 5, fill: LAMPC[w.status] || LAMPC.stale, stroke: '#1d1914', 'stroke-width': 1.5 }));
      g.appendChild(sv('rect', { x: x - 15, y: y + 11, width: 30, height: 4, rx: 2, fill: '#9c6b3c' }));               // its conveyor, one small crate per output
      for (let c = 0; c < Math.min(5, w.crates.length); c++) g.appendChild(sv('rect', { x: x - 14 + c * 6, y: y + 8, width: 4.5, height: 4.5, rx: 1, fill: w.status === 'failed' ? '#c96a4a' : '#e0b060' }));
      g.appendChild(sv('text', { x, y: y + 26, 'text-anchor': 'middle', fill: sel ? '#e0b060' : '#f3ece0', 'font-size': 9.5, 'font-weight': 600 }, C.displayName(w).slice(0, 10)));
      g.addEventListener('click', () => open(w.id)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(w.id); } });
    }
    svg.appendChild(g);
  }
  if (me && me.mode !== 'tour') {                // you are here
    const x = sx(me.x), y = sy(me.z);
    svg.appendChild(sv('circle', { cx: x, cy: y, r: 13, fill: 'none', stroke: '#f3ece0', 'stroke-width': 2, opacity: 0.55 }));
    svg.appendChild(sv('path', { d: 'M0 -11 L7 8 L0 3.5 L-7 8 Z', fill: '#f3ece0', stroke: '#1d1914', 'stroke-width': 1, transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (-me.yaw * 180 / Math.PI).toFixed(0) + ')' }));
  }
}
function renderPlanSay() {
  const el = $('planSay'), w = S.sel ? byId(S.sel) : S.workers.length ? S.workers[S.sayI % S.workers.length] : null; clear(el);
  if (!w) return;
  el.appendChild(h('b', '', w.name + ' says: ')); el.appendChild(document.createTextNode(w.say));
}

// ------------------------------------------------------------------------------------------------ the cards
function renderHero() {
  const hd = S.head;
  $('heroTitle').textContent = hd.title; $('heroLine').textContent = hd.line + (S.demo ? ' These are example workers, not the real ones.' : ''); $('hero').dataset.level = hd.level;
  const p = $('heroPill'); p.textContent = hd.level === 'ok' ? 'All fine' : hd.level === 'bad' ? 'Needs you' : 'Look once'; p.className = 'pill ' + (hd.level === 'ok' ? 'ok' : hd.level === 'bad' ? 'bad' : 'warn');
}
function lampSpan(s) { const e = h('span', 'lamp'); e.dataset.s = s; e.setAttribute('aria-hidden', 'true'); return e; }
function renderLegend() {
  const ul = $('legend'); clear(ul);
  for (const s of ['working', 'idle', 'stale', 'failed', 'sample']) { const li = h('li'); li.appendChild(lampSpan(s)); li.appendChild(document.createTextNode(C.STATUS_WORD[s] + ': ' + C.STATUS_HELP[s])); ul.appendChild(li); }
}
function renderFollow() {
  const sel = $('follow'); if (sel.options.length > 1) return;
  for (const s of C.STATIONS) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); }
}
const pillOf = (st) => 'pill ' + (st === 'working' ? 'ok' : st === 'failed' ? 'bad' : st === 'stale' ? 'warn' : 'info');
function renderWorkers() {
  const ul = $('workers'); clear(ul); let grp = '';
  for (const w of S.workers) {
    if (w.group !== grp) { grp = w.group; ul.appendChild(h('li', 'grp', grp)); }
    const li = h('li'), b = h('button'); b.type = 'button'; b.dataset.id = w.id; b.setAttribute('aria-pressed', String(S.sel === w.id));
    b.setAttribute('aria-label', C.displayName(w) + ' (' + w.name + '), ' + C.STATUS_WORD[w.status] + '. ' + w.doing);
    const l = lampSpan(w.status); l.style.marginRight = '0';
    const mid = h('span'); mid.appendChild(h('span', 'nm', C.displayName(w) + ' · ' + w.name)); mid.appendChild(h('span', 'sm', w.doing));
    b.appendChild(l); b.appendChild(mid); b.appendChild(h('span', pillOf(w.status), C.STATUS_WORD[w.status]));
    b.addEventListener('click', () => open(w.id)); li.appendChild(b); ul.appendChild(li);
  }
}
function renderSheet() {
  const w = S.sel && byId(S.sel); $('sheet').hidden = !w; if (!w) return;
  $('sheetH').textContent = C.displayName(w) + ' · ' + w.name; face($('sheetFace'), personOf('w:' + w.id), 44); $('sheetTalk').textContent = 'Talk to ' + C.displayName(w); const p = $('sheetPill'); p.textContent = C.STATUS_WORD[w.status]; p.className = pillOf(w.status);
  $('sheetRole').textContent = w.role + (w.demo ? ' (example data)' : '') + '. In the ' + C.hallOf(w).name + ', ' + C.JOB_WORD[w.job] + '.';
  const sy2 = $('sheetSay'); clear(sy2); sy2.appendChild(h('b', '', 'Says: ')); sy2.appendChild(document.createTextNode(w.say));
  $('sheetDoing').textContent = w.doing || 'Nothing recorded.';
  const o = $('sheetOut'); clear(o);
  if (!w.crates.length) o.appendChild(h('li', '', 'Its conveyor is empty: no outputs on record yet.'));
  for (const x of w.crates) {
    const li = h('li'), b = h('button', 'crate'); b.type = 'button'; b.dataset.i = String(x.i); b.setAttribute('aria-expanded', String(S.crate === x.i));
    b.appendChild(h('span', 'tag', x.tag)); const f = h('span', 'full', x.text); if (x.t != null) f.appendChild(h('span', 'when', C.agoText(x.t, S.now))); b.appendChild(f);
    b.addEventListener('click', () => { S.crate = S.crate === x.i ? -1 : x.i; renderSheet(); });
    li.appendChild(b); o.appendChild(li);
  }
  const L = $('sheetLearn'); clear(L);
  if (!w.learned.length) L.appendChild(h('li', '', 'Nothing learned and written down yet.'));
  for (const x of w.learned) { const li = h('li', '', x.text); li.appendChild(h('span', 'src', (x.d ? x.d + ' · ' : 'undated · ') + 'source: ' + x.src)); L.appendChild(li); }
  $('sheetHealth').textContent = w.health || 'No health note.';
  $('sheetFollow').textContent = S.follow === w.id ? 'Stop following' : 'Follow this worker';
  $('sheetWalk').hidden = !(S.floor && S.floor.ok);
}
function tickRow(e, when) { const li = h('li'); li.dataset.ok = e.ok === false ? '0' : '1'; li.appendChild(h('span', 't', when)); const d = h('span'); d.appendChild(h('b', '', e.name + ': ')); d.appendChild(document.createTextNode(e.text)); li.appendChild(d); return li; }
function renderTicker() {
  const ul = $('ticker'); clear(ul);
  if (!S.events.length) ul.appendChild(h('li', '', 'No dated events yet. Workers write theirs here when they run.'));
  for (const e of S.events) ul.appendChild(tickRow(e, shortAgo(e.t, S.now) + ' ago'));
}

// ------------------------------------------------------------------------------------------------ people: everyone is an individual you can talk to
// The shared kit (window.OLYMPUS_PEOPLE, docs/PERSONA_API.md) is optional. With it: its portrait and its chat sheet. Without it, or if it throws: our own face and our own chat card
// with six questions answered from the worker's own data. Talking always works.
function kit() { try { const K = window.OLYMPUS_PEOPLE; return K && typeof K.open === 'function' ? K : null; } catch (_) { return null; } }
function kitId(pn) { const K = kit(); if (!K || !pn) return null; if (typeof K.get !== 'function') return pn.pid; for (const id of pn.pids) { try { if (K.get(id)) return id; } catch (_) { /* next */ } } return null; }
const personOf = (key) => S.people.find((x) => x.key === key) || null;
const rowOf = (key) => (key.slice(0, 2) === 'w:' ? byId(key.slice(2)) : S.builders.find((b) => b.id === key.slice(2))) || null;
/** our own small face: the same seeded character as the 3D person (round head, hair, dot eyes, tunic) */
function ownFace(pn, size) {
  const lk = C.lookOf(pn.look), svg = sv('svg', { viewBox: '0 0 44 44', width: size, height: size, role: 'img', 'aria-label': pn.name });
  svg.appendChild(sv('rect', { x: 0, y: 0, width: 44, height: 44, fill: '#2f271e' }));
  svg.appendChild(sv('path', { d: 'M6 46 Q6 31 22 31 Q38 31 38 46 Z', fill: lk.outfit }));
  svg.appendChild(sv('circle', { cx: 22, cy: 20, r: 12.5, fill: lk.skin }));
  svg.appendChild(sv('path', { d: 'M9.2 19 Q9 6.5 22 6.5 Q35 6.5 34.8 19 Q30 12.5 22 12.5 Q14 12.5 9.2 19 Z', fill: lk.hair }));
  svg.appendChild(sv('ellipse', { cx: 17.5, cy: 21, rx: 1.5, ry: 2, fill: '#2a2018' })); svg.appendChild(sv('ellipse', { cx: 26.5, cy: 21, rx: 1.5, ry: 2, fill: '#2a2018' }));
  svg.appendChild(sv('path', { d: pn.status === 'failed' ? 'M18.5 27.5 Q22 25.5 25.5 27.5' : 'M18.5 26 Q22 28.6 25.5 26', fill: 'none', stroke: '#7a3e2a', 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
  return svg;
}
function face(el, pn, size) {
  clear(el); if (!pn) return;
  const K = kit(), id = kitId(pn);
  if (K && id && typeof K.portrait === 'function') { try { const n = K.portrait(id, size || 44); if (n && n.nodeType === 1) { el.appendChild(n); el.dataset.kit = '1'; return; } } catch (_) { /* our own face */ } }
  el.dataset.kit = '0'; el.appendChild(ownFace(pn, size || 44));
}
function focus(key) { if (S.floor && S.floor.ok && S.floor.focus) S.floor.focus(key || null); }
function talk(key) {
  const pn = personOf(key); if (!pn) return;
  if (S.dir) { try { S.dir.talkCam(key); } catch (_) { /* the floor's own camera */ } }
  const K = kit(), id = kitId(pn);
  if (K && id) {
    try { K.open(id, { anchor: $('floorCard') }); S.chat = null; renderChat(); focus(key); S.kitTalk = key; say('Talking to ' + pn.name + '.'); greet(key, pn, id); leadUi(); return; } catch (_) { /* the kit failed: our own chat card */ }
  }
  S.kitTalk = ''; S.chat = { key, log: [] }; renderChat(); focus(key); say('Talking to ' + pn.name + '. Tap a question.'); greet(key, pn, id); leadUi(); toView($('chatCard'), 'nearest');
}
/** the person speaks its line (the kit's say(): a bubble, a voice, lips that move) and shows its work (the kit's show(): a card). Both optional: without them the chat card says it. */
function greet(key, pn, id) {
  const pid = id || pn.pid, F = S.floor && S.floor.ok ? S.floor : null, sc = F && F.sceneFor ? F.sceneFor(key) : null;
  // the kit's say(id, text, { scene, figure }) (docs/PERSONA_API.md "Voices"): a bubble over the person in 3D (its voice when on); on the plan it sits above the floor card
  S.said = Life.sayLine(pid, pn.line, sc ? { scene: sc, figure: sc.figure, key } : { anchor: $('floorCard'), key }) ? key : '';
  const row = rowOf(key); let what = null;
  if (row && key.slice(0, 2) === 'w:') what = { kind: 'work', title: pn.name + ': latest work', items: (row.crates || []).map((c) => c.tag).filter(Boolean).slice(0, 5), text: row.say || row.doing || '', src: row.src || '', status: row.status };
  else if (row) what = { kind: 'work', title: pn.name + ': commits', items: (row.commits || []).map((c) => c.text).slice(0, 5), text: row.line || '', src: 'builders.json', status: row.status };
  // the kit's show(id, what) returns its work card: it goes under the floor (our own chat keeps its six questions)
  const box = $('workCard'); clear(box); box.hidden = true; let el = null;
  try { const K = kit(); if (what && K && typeof K.show === 'function') el = K.show(pid, what, { mini: true }); } catch (_) { el = null; }
  if (el && el.nodeType === 1) { box.appendChild(el); box.hidden = false; }
  S.shown = el ? key : '';
}
/** this floor lends its people to the kit (stage): figure(id) for bubbles, walk(id) = "show me your work", card(id, el) places a work card */
function lendStage(on) {
  const K = kit(); if (!K || typeof K.stage !== 'function') return;
  const keyOf = (id) => { const pn = S.people.find((x) => x.pids.includes(id) || kitId(x) === id); return pn ? pn.key : null; };
  try { K.stage(on && S.floor && S.floor.ok ? { figure: (id) => { const k = keyOf(id); return k && S.floor && S.floor.sceneFor ? S.floor.sceneFor(k) : null; }, release: () => {},
    walk: (id) => { const k = keyOf(id); const r = k ? leadMe(k) : null; return Promise.resolve(!!r); },
    card: (id, el) => { const box = $('workCard'); clear(box); if (el && el.nodeType === 1) { box.appendChild(el); box.hidden = false; } } } : null); } catch (_) { /* the kit keeps its own placement */ }
}
function leadUi() { const k = S.chat ? S.chat.key : S.kitTalk, on = !!(k && S.floor && S.floor.ok && S.view === '3d' && S.floor.lead); $('leadBtn').hidden = !on; $('chatLead').hidden = !on; if (on) { $('leadBtn').dataset.key = k; const pn = personOf(k); $('leadBtn').textContent = 'Show me your work, ' + (pn ? pn.name.split(' (')[0] : ''); } }
/** follow mode: the person walks you back to its station (it may be at the board or in the stand-up) and the camera follows behind it */
function leadMe(key) {
  if (!key || !(S.floor && S.floor.ok && S.floor.lead)) { say('This needs the 3D floor. Tap "Walk the floor" first.'); return null; }
  const pn = personOf(key), r = S.floor.lead(key); if (!r) return null; S.follow = key.slice(0, 2) === 'w:' ? key.slice(2) : ''; try { $('follow').value = S.follow; } catch (_) { /* fine */ }
  say((pn ? pn.name : 'They') + (r.walking ? ' walks you back to its station. Touch the joystick to walk on your own.' : ' shows you its station. Touch the joystick to walk on your own.')); return r;
}
function endTalk() { const K = kit(), was = S.kitTalk; clear($('workCard')); $('workCard').hidden = true; S.chat = null; S.kitTalk = ''; renderChat(); focus(null); leadUi(); if (was && K && typeof K.close === 'function') { try { K.close(); } catch (_) { /* its sheet closes itself */ } } }   // ending the chat also closes the kit's sheet
function askQ(qid) {
  if (!S.chat) return; const row = rowOf(S.chat.key), q = C.QUESTIONS.find((x) => x[0] === qid); if (!row || !q) return;
  const a = C.answer(row, qid, S.now, S.next); S.chat.log.push({ q: q[1], a: a.text, src: a.sources }); if (S.chat.log.length > 12) S.chat.log.shift(); renderChat();
}
function renderChat() {
  const pn = S.chat && personOf(S.chat.key); $('chatCard').hidden = !pn; if (!pn) return;
  $('chatH').textContent = pn.name; face($('chatFace'), pn, 44); const p = $('chatPill'); p.textContent = pn.word; p.className = 'pill ' + (pn.status === 'working' ? 'ok' : pn.status === 'failed' ? 'bad' : pn.status === 'stale' ? 'warn' : 'info');
  $('chatWho').textContent = pn.title + '. Built-in answers, taken only from its own data (' + pn.pid + '). It cannot place orders: paper and suggestions only.';
  const ul = $('chatLog'); clear(ul);
  if (!S.chat.log.length) ul.appendChild(h('li', '', pn.line));
  for (const m of S.chat.log) { ul.appendChild(h('li', 'q', m.q)); const li = h('li', 'a', m.a); if (m.src.length) li.appendChild(h('span', 'src', 'source: ' + m.src.join('; '))); ul.appendChild(li); }
  const box = $('chatQs');
  if (!box.firstChild) for (const [id, label] of C.QUESTIONS) { const b = h('button', 'ag-chip chip', label); b.type = 'button'; b.dataset.q = id; b.addEventListener('click', () => askQ(id)); box.appendChild(b); }
}
const PLACES = () => C.HALLS.map((x) => [x.id, x.name]).concat([['camp', C.CAMP.name]]);
function renderPeople() {
  const box = $('places'); clear(box);
  for (const [id, name] of PLACES()) { const n = C.peopleHere(S.people, id).length, b = h('button', 'ag-chip chip', name + ' (' + n + ')'); b.type = 'button'; b.dataset.place = id; b.setAttribute('aria-pressed', String(S.place === id)); b.addEventListener('click', () => { S.place = id; S.placePinned = true; renderPeople(); }); box.appendChild(b); }
  const ul = $('peopleList'); clear(ul); const here = C.peopleHere(S.people, S.place);
  if (!here.length) ul.appendChild(h('li', 'note', 'Nobody is here.'));
  for (const pn of here) {
    const li = h('li'), b = h('button', 'person'); b.type = 'button'; b.dataset.key = pn.key; b.setAttribute('aria-label', 'Talk to ' + pn.name + ', ' + pn.word + '. ' + pn.title);
    const f = h('span', 'mini-face'); face(f, pn, 34); const l = lampSpan(pn.status); l.style.marginRight = '0';
    const mid = h('span'); mid.appendChild(h('span', 'nm', pn.name)); mid.appendChild(h('span', 'sm', pn.line));
    b.appendChild(f); b.appendChild(l); b.appendChild(mid); b.appendChild(h('span', 'pill info', 'Talk'));
    b.addEventListener('click', () => talk(pn.key)); li.appendChild(b); ul.appendChild(li);
  }
}
let standTimer = 0;
/** the stand-up: everyone in this hall says its one line in turn (the kit's standup() when it is loaded, our own lines otherwise) */
function standUp() {
  clearInterval(standTimer);
  if (S.floor && S.floor.ok && S.floor.standup && S.place !== 'camp') { try { S.floor.standup(S.place); } catch (_) { /* the list below still reads out */ } } const here = C.peopleHere(S.people, S.place), ol = $('standList'); clear(ol);
  if (!here.length) { ol.appendChild(h('li', '', 'Nobody is here to speak.')); return; }
  const lines = here.map((pn) => ({ pn, line: pn.line, kit: false })), K = kit();
  if (K && typeof K.standup === 'function') { try { const ids = here.map((pn) => kitId(pn)), got = K.standup(ids.filter(Boolean)); if (Array.isArray(got)) lines.forEach((x, i) => { const g = got.find((y) => y && y.id === ids[i] && y.line); if (g) { x.line = C.clean(g.line, 200); x.kit = true; } }); } catch (_) { /* our own lines */ } }
  let i = 0; S.standing = true; $('standBtn').textContent = 'Stand-up...';
  const one = () => {
    if (i >= lines.length) { clearInterval(standTimer); S.standing = false; $('standBtn').textContent = 'Stand-up'; if (!S.chat && !S.kitTalk) focus(null); return; }
    const x = lines[i++], li = h('li'); li.dataset.key = x.pn.key; li.dataset.kit = x.kit ? '1' : '0'; li.appendChild(h('b', '', x.pn.name + ': ')); li.appendChild(document.createTextNode(x.line)); ol.appendChild(li);
    if (!S.chat && !S.kitTalk) focus(x.pn.key); say(x.pn.name + ': ' + x.line);
  };
  if (reduced) { while (i < lines.length) one(); one(); return; }
  one(); standTimer = setInterval(one, 1900);
}

// ------------------------------------------------------------------------------------------------ the Builders' camp
const BUILDC = { working: '#8fa05a', quiet: '#4b7a99', done: '#c8a24a', job: '#b8ad98' };
const cx2 = (x) => 180 + (x - 6.5) * 16.2, cy2 = (z) => 30 + (z - 10.6) * 17.2;
function drawCamp(svg, mini) {
  clear(svg);
  const me = mini && S.floor && S.floor.ok ? S.floor.pos() : null;
  if (mini) svg.appendChild(sv('rect', { x: 6, y: 4, width: 348, height: 242, rx: 8, fill: '#7a5f3c', stroke: '#9c6b3c', 'stroke-width': 3 }));
  svg.appendChild(sv('ellipse', { cx: 60, cy: 236, rx: 90, ry: 20, fill: '#6f5636', opacity: 0.7 })); svg.appendChild(sv('ellipse', { cx: 300, cy: 240, rx: 110, ry: 24, fill: '#6f5636', opacity: 0.7 }));
  svg.appendChild(sv('rect', { x: 0, y: 0, width: 360, height: 16, fill: '#a99f8d' })); svg.appendChild(sv('rect', { x: cx2(6.5) - 16, y: 0, width: 32, height: 16, fill: '#3a2c1c' }));
  if (!mini) { svg.appendChild(sv('text', { x: cx2(6.5) + 22, y: 11.5, fill: '#1d1914', 'font-size': 9, 'font-weight': 600 }, 'Factory door')); svg.appendChild(sv('text', { x: 8, y: 11.5, fill: '#1d1914', 'font-size': 9 }, 'The factory wall')); }
  svg.appendChild(sv('path', { d: 'M' + cx2(6.5) + ' 16 V ' + cy2(21), stroke: '#dcc391', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.55, fill: 'none' }));
  const fx = cx2(C.CAMP.fire.x), fy = cy2(C.CAMP.fire.z);
  svg.appendChild(sv('circle', { cx: fx, cy: fy, r: 7, fill: '#9c6b3c' })); svg.appendChild(sv('circle', { cx: fx, cy: fy, r: 3.6, fill: '#e89a3c' }));
  for (const b of S.builders) {
    const x = cx2(b.x), y = cy2(b.z), sel = S.bsel === b.id;
    const g = sv('g', mini ? {} : { role: 'button', tabindex: 0, 'data-id': b.id, 'aria-label': b.name + ': ' + C.BUILD_WORD[b.status] + '. ' + b.job + '. Open its card.' });
    if (!mini) g.appendChild(sv('rect', { x: x - 26, y: y - 30, width: 52, height: 56, fill: 'transparent' }));
    g.appendChild(sv('path', { d: 'M' + (x - 15) + ' ' + (y + 8) + ' L' + x + ' ' + (y - 17) + ' L' + (x + 15) + ' ' + (y + 8) + ' Z', fill: ['#e6d9bd', '#c98f6a', '#d8c9a3', '#a9b07a', '#e0cfa8'][b.i % 5], stroke: sel ? '#f3ece0' : '#7a5631', 'stroke-width': sel ? 2.5 : 1.2, 'stroke-linejoin': 'round' }));
    g.appendChild(sv('path', { d: 'M' + (x - 3.5) + ' ' + (y + 8) + ' L' + x + ' ' + (y - 3) + ' L' + (x + 3.5) + ' ' + (y + 8) + ' Z', fill: '#3a2c1c' }));
    g.appendChild(sv('circle', { cx: x + 13, cy: y - 14, r: 4.6, fill: BUILDC[b.status], stroke: '#1d1914', 'stroke-width': 1.3 }));
    if (!mini) {
      for (let c = 0; c < b.crates; c++) g.appendChild(sv('rect', { x: x - 24 + (c % 3) * 5.2, y: y + 3 - Math.floor(c / 3) * 5.2, width: 4.4, height: 4.4, rx: 0.8, fill: '#e0b060', stroke: '#7a5631', 'stroke-width': 0.6 }));   // commits today
      g.appendChild(sv('circle', { cx: x + 20, cy: y + 5, r: 3, fill: b.status === 'working' ? '#e89a3c' : '#5a4530', stroke: '#9c6b3c', 'stroke-width': 1 }));                                                // its brazier
      if (b.status === 'working') { g.appendChild(sv('circle', { class: 'smoke', cx: x + 20, cy: y - 2, r: 2.6, fill: '#d8cdb8' })); g.appendChild(sv('circle', { class: 'smoke s2', cx: x + 21.5, cy: y - 4, r: 2, fill: '#d8cdb8' })); }
      g.appendChild(sv('text', { x, y: y + 20 + (b.i % 2) * 9.5, 'text-anchor': 'middle', fill: '#f6ecd6', 'font-size': 8.6, 'font-weight': 700 }, b.name.length > 14 ? b.name.slice(0, 13) + '…' : b.name));
      g.addEventListener('click', () => openBuilder(b.id)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBuilder(b.id); } });
    }
    svg.appendChild(g);
  }
  if (me) { const x = cx2(me.x), y = cy2(me.z); svg.appendChild(sv('circle', { cx: x, cy: y, r: 13, fill: 'none', stroke: '#f3ece0', 'stroke-width': 2, opacity: 0.6 })); svg.appendChild(sv('path', { d: 'M0 -11 L7 8 L0 3.5 L-7 8 Z', fill: '#f3ece0', stroke: '#1d1914', 'stroke-width': 1, transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (-me.yaw * 180 / Math.PI).toFixed(0) + ')' })); }
}
function renderCampScroll() {
  const el = $('campScroll'); clear(el); const L = S.builders.filter((b) => b.commits.length || b.shipped.length);
  if (!L.length) { if (S.builders.length) el.textContent = 'No commit messages to read: ' + C.BUILD_HELP.job + '.'; return; }
  const b = S.bsel && L.find((x) => x.id === S.bsel) || L[S.scrollI % L.length], line = b.scroll[Math.floor(S.scrollI / L.length) % b.scroll.length];
  el.appendChild(h('b', '', b.name + ': ')); el.appendChild(document.createTextNode(line + (b.commits.length && b.mins != null ? '  (' + C.agoText(b.last, S.now) + ')' : '')));
}
function renderCamp() {
  const hd = S.hands; $('handsLine').textContent = hd.line; $('campNote').textContent = hd.note + (hd.n ? ' Crates by a tent = commits today (' + hd.today + ' in all); smoke rises only from a working builder\'s brazier.' : '');
  const p = $('campPill'); p.textContent = hd.counts.working ? hd.counts.working + ' working' : hd.n ? 'All quiet' : 'Empty'; p.className = 'pill ' + (hd.counts.working ? 'ok' : 'info');
  drawCamp($('campMap'), false); renderCampScroll();
  const ul = $('hands'); clear(ul);
  if (!hd.n) ul.appendChild(h('li', 'note', 'Nobody is listed in handoff/agents_now.json.'));
  for (const b of hd.list) {
    const li = h('li'), bt = h('button'); bt.type = 'button'; bt.dataset.id = b.id; bt.setAttribute('aria-pressed', String(S.bsel === b.id)); bt.setAttribute('aria-label', b.name + ', ' + C.BUILD_WORD[b.status] + '. ' + b.job);
    const l = lampSpan(b.status); l.style.marginRight = '0'; const mid = h('span'); mid.appendChild(h('span', 'nm', b.name)); mid.appendChild(h('span', 'sm', b.commits.length ? b.commits[0].text : b.job));
    bt.appendChild(l); bt.appendChild(mid); bt.appendChild(h('span', 'pill ' + (b.status === 'working' ? 'ok' : b.status === 'done' ? 'warn' : 'info'), C.BUILD_WORD[b.status] + (b.status === 'working' || b.status === 'quiet' ? ' · ' + shortAgo(b.last, S.now) : '')));
    bt.addEventListener('click', () => openBuilder(b.id)); li.appendChild(bt); ul.appendChild(li);
  }
  $('campGo').hidden = !(S.floor && S.floor.ok && S.view === '3d');
  renderBuilder();
}
function renderBuilder() {
  const b = S.bsel && S.builders.find((x) => x.id === S.bsel); $('bsheet').hidden = !b; if (!b) return;
  $('bsheetH').textContent = b.name; face($('bsheetFace'), personOf('b:' + b.id), 44); $('bsheetTalk').textContent = 'Talk to ' + b.name; const p = $('bsheetPill'); p.textContent = C.BUILD_WORD[b.status]; p.className = 'pill ' + (b.status === 'working' ? 'ok' : b.status === 'done' ? 'warn' : 'info');
  $('bsheetJob').textContent = 'Job: ' + b.job + (b.sample ? ' (example agent)' : '');
  $('bsheetLine').textContent = b.line + (b.live ? ' ' + b.ahead + ' commit' + (b.ahead === 1 ? '' : 's') + ' not yet in the release, ' + b.files + ' file' + (b.files === 1 ? '' : 's') + ' changed, ' + b.today + ' commit' + (b.today === 1 ? '' : 's') + ' today.' : ' Git was not readable for its branch when the site was built, so only its job line is known.');
  const fill = (id, rows, empty, fn) => { const ul = $(id); clear(ul); if (!rows.length) ul.appendChild(h('li', '', empty)); for (const r of rows) ul.appendChild(fn(r)); };
  fill('bsheetCommits', b.commits, b.live ? 'No commits waiting on its branch.' : 'No live activity to show.', (c) => { const li = h('li', '', c.text); li.appendChild(h('span', 'when', C.agoText(c.t, S.now) + ' · ' + C.clockText(c.t))); return li; });
  fill('bsheetFolders', b.folders, b.live ? 'No files changed against the release.' : 'Unknown without git.', (f) => h('li', '', f.name + ': ' + f.n + ' file' + (f.n === 1 ? '' : 's')));
  fill('bsheetShipped', b.shipped, b.live ? 'Nothing of this branch is merged into the release yet.' : 'Unknown without git.', (c) => { const li = h('li', '', c.text); if (c.t != null) li.appendChild(h('span', 'when', 'merged work · ' + C.agoText(c.t, S.now))); return li; });
  $('bsheetWalk').hidden = !(S.floor && S.floor.ok && S.view === '3d');
}
function openBuilder(id, fromFloor) {
  const b = S.builders.find((x) => x.id === id); if (!b) return;
  S.bsel = id; renderCamp(); say(b.name + ': ' + C.BUILD_WORD[b.status] + '. ' + b.job + '. ' + b.line);
  toView($('bsheet'), 'nearest');
}
function goCamp(b) {
  if (!(S.floor && S.floor.ok)) return;
  setFollow(''); setTour(false, true);
  if (b) S.floor.teleport(b.x, b.z - 6.2, Math.PI); else S.floor.teleport(C.CAMP.enter.x, C.CAMP.enter.z, C.CAMP.enter.yaw);
  say(b ? 'Standing in front of ' + b.name + '\'s tent.' : 'Out through the front door: the builders\' camp is ahead. Tap a tent.'); toView($('floorCard')); hud();
}

// ------------------------------------------------------------------------------------------------ the day replay
function renderReplay() {
  const w = S.win, svg = $('lanes'), rows = C.lanes(w), H2 = Math.max(44, rows.length * 15 + 26);
  $('r24').setAttribute('aria-pressed', String(S.range === '24h')); $('r7').setAttribute('aria-pressed', String(S.range === '7d'));
  $('replayNote').textContent = w.note + (S.demo ? ' Example events.' : '') + ' Times are UTC, as written in the files.';
  clear(svg); svg.setAttribute('viewBox', '0 0 340 ' + H2);
  if (!rows.length) svg.appendChild(sv('text', { x: 170, y: 26, 'text-anchor': 'middle', fill: '#9a8f7d', 'font-size': 11 }, 'No events in this window.'));
  rows.forEach((r, i) => {
    const y = 14 + i * 15;
    svg.appendChild(sv('text', { x: 6, y: y + 3.5, fill: '#cfc4b2', 'font-size': 9.5 }, r.name.split(' (')[0].slice(0, 13)));
    svg.appendChild(sv('line', { x1: 84, y1: y, x2: 334, y2: y, stroke: '#3a3228', 'stroke-width': 1 }));
    for (const tk of r.ticks) svg.appendChild(sv('rect', { x: (84 + 250 * tk.f - (tk.ok ? 1.5 : 2.5)).toFixed(1), y: y - (tk.ok ? 4 : 5.5), width: tk.ok ? 3 : 5, height: tk.ok ? 8 : 11, rx: 1, fill: tk.ok ? '#c8a24a' : '#c96a4a' }));
  });
  svg.appendChild(sv('text', { x: 84, y: H2 - 4, fill: '#9a8f7d', 'font-size': 8.5 }, C.clockText(w.t0).slice(0, 15)));
  svg.appendChild(sv('text', { x: 334, y: H2 - 4, 'text-anchor': 'end', fill: '#9a8f7d', 'font-size': 8.5 }, w.shifted ? C.clockText(w.t1).slice(0, 15) : 'now'));
  svg.appendChild(sv('line', { id: 'cursor', x1: 84, y1: 4, x2: 84, y2: H2 - 14, stroke: '#f3ece0', 'stroke-width': 1.5 }));
  $('failBtn').disabled = false;
  updateCursor(true);
}
function updateCursor(full) {
  S.at = C.replayAt(S.win, S.cur);
  const a = S.at, x = (84 + 250 * a.f).toFixed(1), cu = $('cursor');
  if (cu) { cu.setAttribute('x1', x); cu.setAttribute('x2', x); }
  const sc = $('scrub'); if (document.activeElement !== sc || full) sc.value = String(Math.round(a.f * 1000));
  sc.setAttribute('aria-valuetext', C.clockText(a.t));
  $('replayNow').textContent = C.clockText(a.t) + '  ·  ' + a.done + ' of ' + a.total + ' events so far' + (a.active.length ? '  ·  busy: ' + a.active.map((id) => (byId(id) || { name: id }).name.split(' (')[0]).slice(0, 3).join(', ') : '');
  const key = a.recent.map((e) => e.t + e.who).join('|');
  if (full || key !== S.atKey) {
    S.atKey = key; const ul = $('replayList'); clear(ul);
    if (!a.recent.length) ul.appendChild(h('li', '', a.total ? 'Nothing has happened yet at this point of the window. Press Play or drag the slider.' : 'Nothing to replay yet.'));
    for (const e of a.recent) ul.appendChild(tickRow(e, C.clockText(e.t).slice(4, 15)));
    drawPlan($('plan'), false);
  }
  if (S.floor && S.floor.ok && a.active.length && (S.playing || !full)) S.floor.pulse(a.active);
}
let playTimer = 0;
function setPlaying(on) {
  S.playing = !!on && S.win.events.length > 0; clearInterval(playTimer);
  const b = $('playBtn'); b.textContent = S.playing ? 'Pause' : 'Play'; b.setAttribute('aria-pressed', String(S.playing));
  if (!S.playing) return;
  if (S.cur >= 0.999) S.cur = 0;
  // one pass of the window takes 40 s at 1x. Reduced motion: no sweep, it steps from event to event instead.
  playTimer = setInterval(() => {
    if (document.hidden) return;
    S.cur = reduced ? C.nextEvent(S.win, S.cur) : Math.min(1, S.cur + (0.1 / 40) * S.speed);
    updateCursor(false);
    if (S.cur >= 1) setPlaying(false);
  }, reduced ? Math.max(250, 1000 / S.speed) : 100);
}
function setRange(r) { S.range = r; S.win = C.replayWindow(S.stream, S.now, r); S.cur = 1; setPlaying(false); renderReplay(); }
function jumpFail() {
  const lf = C.lastFailure(S.win, S.cur); setPlaying(false);
  if (!lf) { say('Nothing failed in this window.'); $('replayNow').textContent = 'Nothing failed in this window (' + S.win.events.length + ' events, all fine).'; return; }
  S.cur = Math.min(1, lf.f + 0.0005); updateCursor(true);
  say('Last failure: ' + lf.e.name + ', ' + C.clockText(lf.e.t) + '. ' + lf.e.text);
  if (S.floor && S.floor.ok) S.floor.pulse([lf.e.who]);
}

// ------------------------------------------------------------------------------------------------ the research pipeline wall
function renderPipe() {
  const p = S.pipe; $('pipeLine').textContent = p.line + (p.sample ? ' Example counts.' : '');
  const box = $('pipeLanes'); clear(box);
  for (const l of p.lanes) {
    const a = h('a', 'lane'); a.href = l.href; a.dataset.id = l.id; a.setAttribute('aria-label', l.label + ': ' + l.n.toLocaleString('en-US') + ' (' + l.help + '). Open the Archive.');
    a.appendChild(h('b', '', l.label)); a.appendChild(h('span', 'n', l.n.toLocaleString('en-US'))); a.appendChild(h('small', '', l.help)); box.appendChild(a);
  }
  const ul = $('pipeFams'); clear(ul);
  for (const f of p.families.slice(0, 8)) {
    const li = h('li'), a = h('a', 'fam'); a.href = f.href; a.dataset.name = f.name;
    const top = h('span', 'top2'); top.appendChild(h('b', '', f.name)); top.appendChild(h('span', '', f.runs.toLocaleString('en-US') + ' ideas')); a.appendChild(top);
    const st = h('span', 'stack'); st.setAttribute('aria-hidden', 'true');
    for (const [cls, v] of [['a', f.pa], ['r', f.pr], ['o', f.po]]) { const i = h('i', cls); i.style.width = (v * 100).toFixed(1) + '%'; st.appendChild(i); }
    a.appendChild(st); a.appendChild(h('span', '', f.adopted + ' adopted · ' + f.rejected + ' rejected · ' + f.open + ' still open'));
    li.appendChild(a); ul.appendChild(li);
  }
  const mv = $('pipeMoves'); clear(mv); $('movesBox').hidden = !p.moves.length;
  $('movesBox').querySelector('summary').textContent = 'Newest ' + p.moves.length + ' move' + (p.moves.length === 1 ? '' : 's');
  for (const m of p.moves) {
    const li = h('li'), a = h('a', 'move'); a.href = m.href;
    const v = h('span', 'v', m.verdict.charAt(0).toUpperCase() + m.verdict.slice(1)); v.dataset.v = m.verdict;
    const top = h('span'); top.appendChild(v); top.appendChild(document.createTextNode(' · ' + (m.d || 'undated') + ' · ' + m.family)); a.appendChild(top); a.appendChild(h('b', '', m.title));
    li.appendChild(a); mv.appendChild(li);
  }
  $('pipeNote').textContent = !p.ok ? 'The pipeline is filled by tools/ergasterion_build.py from the Archive index.' : 'Green adopted, red rejected, blue still open. Tap a lane, a family or a move to open the Archive on it.' + (p.built ? ' Archive index built ' + p.built + '.' : '');
}

// ------------------------------------------------------------------------------------------------ the learning board
function lessonRow(l) {
  const li = h('li'); li.dataset.week = l.week ? '1' : '0'; li.dataset.cat = l.cat;
  const meta = h('span', 'meta'); const dots = h('span', 'dots', '●'.repeat(Math.min(5, l.strength)) + '○'.repeat(Math.max(0, 3 - l.strength))); dots.setAttribute('aria-hidden', 'true'); meta.appendChild(dots);
  meta.appendChild(document.createTextNode(C.strengthWord(l.strength) + ' · ' + l.cat + ' · ' + (l.d || 'undated') + (l.sample ? ' · example' : ''))); li.appendChild(meta);
  li.appendChild(document.createTextNode(l.text));
  li.appendChild(h('span', 'src', 'source: ' + l.sources.map((s) => s.src).join('; ')));
  return li;
}
function renderBoard() {
  const b = S.board, pick = (L) => (S.cat ? L.filter((l) => l.cat === S.cat) : L);
  $('boardNote').textContent = b.note;
  const cats = $('cats'); clear(cats);
  for (const [id, label] of [['', 'All (' + b.all.length + ')']].concat(C.CATS.map((c) => [c, c + ' (' + b.cats[c] + ')']))) {
    const bt = h('button', 'ag-chip chip', label); bt.type = 'button'; bt.dataset.cat = id; bt.setAttribute('aria-pressed', String(S.cat === id)); bt.addEventListener('click', () => { S.cat = id; renderBoard(); }); cats.appendChild(bt);
  }
  const wk = $('lessons'); clear(wk); const W = pick(S.cat ? b.all.filter((l) => l.week).sort((x, y) => y.strength - x.strength) : b.week);
  if (!W.length) wk.appendChild(h('li', '', b.all.length ? 'No new lesson' + (S.cat ? ' about ' + S.cat : '') + ' in the last 7 days.' : 'No lessons are written down yet.'));
  for (const l of W.slice(0, 8)) wk.appendChild(lessonRow(l));
  const ch = $('changed'); clear(ch); const F = pick(b.changed);
  if (!F.length) ch.appendChild(h('li', '', 'Nothing' + (S.cat ? ' about ' + S.cat : '') + ' has overturned an earlier belief yet.'));
  for (const c of F.slice(0, 6)) {
    const li = h('li'); li.dataset.cat = c.cat; li.appendChild(h('span', 'meta', c.cat + ' · ' + (c.d || 'undated') + (c.sample ? ' · example' : '')));
    if (c.was) li.appendChild(h('span', 'was', 'We believed: ' + c.was));
    li.appendChild(document.createTextNode(c.text)); li.appendChild(h('span', 'src', 'source: ' + c.src)); ch.appendChild(li);
  }
  const st = $('strong'); clear(st); const T = pick(S.cat ? b.all.slice().sort((x, y) => y.strength - x.strength || (y.ms || 0) - (x.ms || 0)) : b.top);
  if (!T.length) st.appendChild(h('li', '', 'No lessons' + (S.cat ? ' about ' + S.cat : '') + ' yet.'));
  for (const l of T.slice(0, 6)) st.appendChild(lessonRow(l));
}
function renderNext() {
  const ol = $('next'); clear(ol);
  for (const s of S.next) {
    const li = h('li'); li.dataset.kind = s.kind; const b = h('b'); b.appendChild(h('span', 'rk', s.rank + '.')); b.appendChild(document.createTextNode(' ' + s.title)); li.appendChild(b);
    li.appendChild(document.createTextNode('Why: ' + s.why)); li.appendChild(h('span', 'ev', 'Worth it? ' + s.ev)); li.appendChild(h('span', 'go', 'First step: ' + s.next)); ol.appendChild(li);
  }
}

function open(id, fromFloor, crate) {
  if (id === 'board' || id === 'changed') { toView($('boardCard')); return; }
  if (id === 'pipe') { toView($('pipeCard')); return; }
  if (typeof id === 'string' && id.indexOf('camp:') === 0) { openBuilder(id.slice(5), true); return; }
  if (!byId(id)) return;
  S.sel = id; S.crate = crate == null ? -1 : crate; renderSheet(); renderWorkers(); drawPlan($('plan'), false); renderPlanSay();
  const w = byId(id); say(w.name + ': ' + C.STATUS_WORD[w.status] + '. ' + (crate != null && w.crates[crate] ? 'Crate: ' + w.crates[crate].text : w.doing));
  toView($('sheet'), 'nearest');
  if (fromFloor && S.floor && S.floor.ok && S.floor.pos().mode === 'walk') S.floor.face(id);
}
function setFollow(id) {
  S.follow = id || ''; $('follow').value = S.follow;
  if (S.floor && S.floor.ok) S.floor.follow(S.follow || null);
  if (S.follow) setTour(false, true);
  renderSheet();
  if (S.follow) { const w = byId(S.follow); say('Following ' + (w ? w.name : '') + '.'); }
}
function setTour(on, quiet) {
  S.tour = !!on && !!(S.floor && S.floor.ok);
  if (S.floor && S.floor.ok && (S.tour || !quiet)) S.floor.tour(S.tour);
  if (S.tour) { S.follow = ''; $('follow').value = ''; }
  const b = $('tourBtn'); b.textContent = S.tour ? 'Stop the tour' : 'Calm tour'; b.setAttribute('aria-pressed', String(S.tour));
  if (!quiet) say(S.tour ? 'A calm tour above the four halls. Touch the joystick to walk again.' : 'Back on your feet.');
}

function renderScene() {
  drawPlan($('plan'), false); drawPlan($('mini'), true); renderPlanSay();
  const f = S.floor && S.floor.ok, in3 = f && S.view === '3d';
  $('stage').hidden = !in3; $('plan').hidden = !!in3; $('planSay').hidden = !!in3;
  $('viewBtn').hidden = !f && !S.canTry; $('viewBtn').textContent = S.view === '3d' ? 'Plan view' : 'Walk the floor';
  $('resetBtn').hidden = !in3; $('tourBtn').hidden = !in3; $('hallNow').hidden = !in3;
  $('sceneNote').textContent = in3 ? 'You are the figure in the middle. Tap the floor to walk there (through the doors between the four halls), tap a worker to walk up and talk, swipe to look, pinch to zoom. Tap a crate on a belt or a wall board to read it. "Calm tour" flies you around instead.'
    : 'Plan of the four halls: each worker shows its job, its lamp and the crates on its belt. Tap one to open its card.' + (S.canTry ? ' "Walk the floor" shows the 3D factory.' : '');
  if (f) S.floor.set(S.workers, { board: S.board, pipe: S.pipe, camp: S.builders });
  $('campGo').hidden = !in3; $('bsheetWalk').hidden = !in3;
}

function render() {
  model();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderLegend(); renderFollow(); renderWorkers(); renderSheet(); renderTicker(); renderPeople(); renderChat(); renderCamp(); renderReplay(); renderPipe(); renderBoard(); renderNext(); renderScene();
  lifeEvents();
  say(S.head.title + '. ' + S.head.line);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  tryFloor();
}

// ------------------------------------------------------------------------------------------------ the floor reacts to real events (life.js)
// The snapshot of the last load is kept in memory; what changed since (a merge, a failed run, new commits, a new adopted run, an eval passed) makes the 3D floor
// cheer, slump or gather. The demo never celebrates. A fresh merge (last 30 min) is cheered once when the page opens. Nothing is stored in the browser.
function lifeEvents() {
  const snap = Life.snapshot(S.demo ? [] : S.workers, S.bdemo ? [] : S.builders, S.demo ? null : S.pipe, S.demo ? null : S.inp && S.inp.home), prev = S.snap || null;   // example data never counts
  const ev = prev ? Life.diffEvents(prev, snap) : S.bdemo ? [] : Life.recentMerges(S.builders, S.now, 30);
  S.snap = snap; S.lifeEv = ev;
  if (ev.length) { say(ev.map((e) => e.text).slice(0, 3).join('. ') + '.'); S.pendingEv = ev; }
  flushEvents();
}
function flushEvents() { if (!S.pendingEv || !(S.floor && S.floor.ok && S.floor.react)) return; try { S.lastReact = S.floor.react(S.pendingEv); } catch (_) { /* reactions are never needed */ } S.pendingEv = null; }

// ------------------------------------------------------------------------------------------------ the optional 3D factory
function hud() {
  if (document.hidden || S.view !== '3d' || !(S.floor && S.floor.ok)) return;
  const p = S.floor.pos(), hl = p.hall === 'camp' ? C.CAMP : C.HALLS.find((x) => x.id === p.hall);
  if (p.hall === 'camp' && p.mode !== 'tour') { $('mini').setAttribute('viewBox', '0 0 360 250'); drawCamp($('mini'), true); } else { $('mini').setAttribute('viewBox', '0 0 360 292'); drawPlan($('mini'), true); }
  $('hallNow').textContent = p.mode === 'tour' ? 'Tour: ' + (hl ? hl.name : '') : p.mode === 'follow' ? 'Following' : hl ? hl.name : '';
  if (S.tour && p.mode !== 'tour') setTour(false, true);
  const live = (S.floor.posOf ? S.people.map((pn) => { const q = S.floor.posOf(pn.key); return q ? { ...pn, x: q.x, z: q.z } : pn; }) : S.people).filter((pn) => C.hallOf(pn).id === p.hall);   // people walk about: talk to where they are now, on your side of the wall
  const near = p.mode === 'walk' ? C.talkTarget(p, live, 3) : null, tb = $('talkBtn');
  tb.hidden = !near || !!S.dir; if (near) { tb.textContent = 'Talk to ' + near.name.split(' (')[0]; tb.dataset.key = near.key; }
  if (p.mode !== 'tour' && p.hall !== S.hallSeen) { S.hallSeen = p.hall; S.place = p.hall; renderPeople(); }
}
function mountFloor() {
  const M = window.__ergFloor;
  if (!M) return false;
  S.stopMini && clearInterval(S.stopMini);
  $('stage').hidden = false;
  const fl = M.createFloor($('floor3d'), { reduced, stations: C.STATIONS, onMove: () => hud(), onPick: (id, crate) => { open(id, true, crate); if (crate == null && byId(id)) talk('w:' + id); else if (typeof id === 'string' && id.indexOf('camp:') === 0) talk('b:' + id.slice(5)); } });
  if (!fl || !fl.ok) { $('stage').hidden = true; S.floor = null; S.why = fl && fl.reason; return false; }
  S.floor = fl; S.view = '3d'; lendStage(true);
  direct(fl);
  { const cw = Life.clockWord(new URLSearchParams(location.search).get('clock')); if (cw != null && fl.clock) fl.clock(Life.atClock(cw), false); }   // ?clock=quiet | standup | HH:MM: a fixed moment of the day (tests, screenshots)
  S.stopMini = setInterval(hud, 250);
  setTimeout(flushEvents, 600);
  return true;
}
// ------------------------------------------------------------------------------------------------ SCENE DIRECTION (direct.js + olympus/camera-rig.js + controls.js, 2026-11-11)
// third person (your own character), tap-to-walk, tap a person for the ring (Talk / Show work / Follow / Wave), the conversation camera, the first 5 seconds.
// The old joystick stays only as an option (?joy=1). ?direct=0 keeps the first-person floor (tests that drive it by hand). floorload.js loads direct.js (window.__ergDirect).
function joyOn() { try { return new URLSearchParams(location.search).get('joy') === '1'; } catch (_) { return false; } }
function direct(fl) {
  S.dir = null; $('joy').hidden = !joyOn();
  if (new URLSearchParams(location.search).get('direct') === '0' || !fl.drive) { $('joy').hidden = false; return; }
  $('hint').hidden = true;
  const go = () => {
    const D = window.__ergDirect; if (!D || S.floor !== fl || S.dir) return;
    S.dir = D.createDirector(fl, { box: $('stage'), canvas: $('floor3d'), reduced, people: () => S.people, kit,
      onTalk: (key) => talk(key),
      onShow: (key) => { const K = kit(), pn = personOf(key), id = pn && kitId(pn); talk(key); if (K && id && typeof K.open === 'function') { try { K.open(id, { anchor: $('floorCard'), question: 'Show me your work' }); } catch (_) { /* the card under the floor */ } } },
      onOther: (hit) => { open(hit.id, true, hit.crate); } });
    window.ERG_DIRECTOR = S.dir;
    S.dir.start();
  };
  if (window.__ergDirect) go(); else window.addEventListener('erg-direct', go, { once: true });
}
function tryFloor() {
  if (S.tried || !S.ready) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  const q = new URLSearchParams(location.search);
  if (lite || q.get('flat') === '1' || q.get('q') === 'low' || q.get('q') === 'off') { S.tried = true; S.canTry = false; renderScene(); return; }
  if (!window.__ergFloor) return;
  S.tried = true; S.canTry = true;
  try { mountFloor(); } catch (_) { S.floor = null; }
  if (!S.floor) S.canTry = false;
  renderScene(); hud();
}
window.addEventListener('erg-floor', tryFloor);

function toggleView() {
  if (S.view === '3d') { if (S.dir) { try { S.dir.dispose(); } catch (_) { /* gone */ } S.dir = null; } lendStage(false); $('talkBtn').hidden = true; $('leadBtn').hidden = true; $('chatLead').hidden = true; if (S.floor) { try { S.floor.dispose(); } catch (_) { /* nothing */ } } S.floor = null; S.view = 'plan'; S.canTry = true; clearInterval(S.stopMini); S.follow = ''; S.tour = false; $('follow').value = ''; renderScene(); renderSheet(); return; }
  try { mountFloor(); } catch (_) { S.floor = null; }
  if (!S.floor) { S.canTry = false; say('3D is not available on this device; the plan stays.'); }
  renderScene(); renderSheet(); hud();
}

// joystick + keyboard (3D only); the floor eases both, so a thumb never jerks the view
function wireControls() {
  const joy = $('joy'), knob = $('knob'); let act = null;
  const setKnob = (dx, dy) => { knob.style.transform = 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px)'; };
  const vec = (e) => { const r = joy.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / (R - 8)), dead = k < 0.12 ? 0 : (k - 0.12) / 0.88; return { dx: dx / d * k * (R - 8), dy: dy / d * k * (R - 8), ux: dx / d * dead, uy: dy / d * dead }; };
  const seen = () => { $('hint').hidden = true; };
  joy.addEventListener('pointerdown', seen, { once: true }); $('floor3d').addEventListener('pointerdown', seen, { once: true });
  const walkOn = () => { if (S.follow) setFollow(''); if (S.tour) setTour(false, true); };
  const push = (v) => { if (!S.floor || !S.floor.ok) return; walkOn(); if (S.dir) { S.dir.move({ fwd: -v.uy, side: v.ux }); return; } S.floor.move({ fwd: -v.uy, side: v.ux }); if (reduced) S.floor.step(0.06); };
  joy.addEventListener('pointerdown', (e) => { act = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } knob.style.transition = 'none'; const v = vec(e); setKnob(v.dx, v.dy); push(v); e.preventDefault(); });
  joy.addEventListener('pointermove', (e) => { if (act !== e.pointerId) return; const v = vec(e); setKnob(v.dx, v.dy); push(v); });
  const end = (e) => { if (act !== e.pointerId) return; act = null; knob.style.transition = ''; setKnob(0, 0); if (S.dir) S.dir.move({ fwd: 0, side: 0 }); else if (S.floor && S.floor.ok) S.floor.move({ fwd: 0, side: 0 }); };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  const keys = new Set();
  const upd = () => { if (!S.floor || !S.floor.ok) return; if (S.dir) { S.dir.move({ fwd: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), side: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) }); return; } S.floor.move({ fwd: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), side: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) }); if (reduced) S.floor.step(0.1); };
  window.addEventListener('keydown', (e) => {
    if (S.view !== '3d' || !S.floor || !S.floor.ok || /^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test((e.target && e.target.tagName) || '')) return;
    const k = String(e.key).toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright') { S.floor.look(k === 'arrowleft' ? -0.07 : 0.07, 0); e.preventDefault(); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k)) { walkOn(); keys.add(k); upd(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(String(e.key).toLowerCase()); upd(); });
  $('viewBtn').addEventListener('click', toggleView);
  $('tourBtn').addEventListener('click', () => setTour(!S.tour));
  $('resetBtn').addEventListener('click', () => { if (S.floor && S.floor.ok) { setFollow(''); setTour(false, true); S.floor.reset(); } });
  $('follow').addEventListener('change', (e) => setFollow(e.target.value));
  $('sheetFollow').addEventListener('click', () => { if (!S.sel) return; if (!(S.floor && S.floor.ok)) { say('Following needs the 3D floor. Tap "Walk the floor" first.'); return; } setFollow(S.follow === S.sel ? '' : S.sel); });
  $('sheetWalk').addEventListener('click', () => { if (S.floor && S.floor.ok && S.sel) { const w = byId(S.sel); setFollow(''); setTour(false, true); S.floor.teleport(w.x, Math.min(C.BOUNDS.z, w.z + 4.4)); S.floor.face(S.sel); say('Standing in front of ' + w.name + ', in the ' + C.hallOf(w).name + '.'); toView($('floorCard')); } });
  $('sheetClose').addEventListener('click', () => { S.sel = null; S.crate = -1; renderSheet(); renderWorkers(); drawPlan($('plan'), false); renderPlanSay(); });
  $('refresh').addEventListener('click', () => { say('Refreshing...'); load().then(render); });
  if (window.AGORA && window.AGORA.pull) window.AGORA.pull(() => load().then(render));   // pull down = Refresh (olympus/agora-ui.js)
  $('r24').addEventListener('click', () => setRange('24h')); $('r7').addEventListener('click', () => setRange('7d'));
  $('scrub').addEventListener('input', (e) => { setPlaying(false); S.cur = Number(e.target.value) / 1000; updateCursor(false); });
  $('playBtn').addEventListener('click', () => setPlaying(!S.playing));
  $('speedBtn').addEventListener('click', () => { S.speed = S.speed === 1 ? 4 : S.speed === 4 ? 16 : 1; $('speedBtn').textContent = 'Speed ' + S.speed + 'x'; if (S.playing) setPlaying(true); });
  $('failBtn').addEventListener('click', jumpFail);
  $('campGo').addEventListener('click', () => goCamp(null));
  $('talkBtn').addEventListener('click', () => { const k = $('talkBtn').dataset.key; if (k) { if (k.slice(0, 2) === 'w:') open(k.slice(2)); else openBuilder(k.slice(2)); talk(k); } });
  $('sheetTalk').addEventListener('click', () => { if (S.sel) talk('w:' + S.sel); });
  $('bsheetTalk').addEventListener('click', () => { if (S.bsel) talk('b:' + S.bsel); });
  $('chatClose').addEventListener('click', endTalk);
  $('chatLead').addEventListener('click', () => { const k = S.chat ? S.chat.key : S.kitTalk; if (k) leadMe(k); });
  $('leadBtn').addEventListener('click', () => { const k = $('leadBtn').dataset.key; if (k) leadMe(k); });
  $('standBtn').addEventListener('click', standUp);
  window.addEventListener('olympus:people:close', () => { S.kitTalk = ''; if (!S.chat) focus(null); leadUi(); });
  $('bsheetWalk').addEventListener('click', () => goCamp(S.builders.find((x) => x.id === S.bsel)));
  $('bsheetClose').addEventListener('click', () => { S.bsel = null; renderCamp(); });
  if (!reduced) setInterval(() => { if (!document.hidden && S.ready) { S.scrollI++; renderCampScroll(); } }, 4500);                                  // the camp's scroll reads on
  if (!reduced) setInterval(() => { if (!document.hidden && !S.sel && S.view !== '3d' && S.ready) { S.sayI++; renderPlanSay(); } }, 6000);     // on the plan the workers take turns to speak
}

async function load() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [builders, fx, queue, home, money, kalshi, cron, forge, heph] = await Promise.all([S.forced ? null : getJSON('./builders.json'), getJSON('./fixture.json'), S.forced ? null : getJSON('./queue.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../money/index.json'),
    S.forced ? null : getFeed(5000), S.forced ? null : getJSON('../cronos/status.json'), S.forced ? null : getJSON('../prometheus/forge.json'), S.forced ? null : getJSON('../hephaestus/data.json')]);
  // home.json through the shared truth (olympus/truth.js): ATLAS and BLITZ live in the board / second / live.pc blocks, not in accounts[]
  S.fixture = fx; S.inputs = { home: home ? T.canonHome(await T.withPcFeed(home)) : home, money, kalshi, cron, forge, heph, queue, builders };
}
async function boot() {
  wireControls();
  await load();
  render();
  setInterval(() => { if (!document.hidden) load().then(render); }, 5 * 60 * 1000);
}
window.ERGASTERION = { S, C, Life, ready: () => S.ready, render, open, openBuilder, goCamp, talk, endTalk, standUp, setFollow, setTour, leadMe, lifeEvents, floor: () => S.floor,
  replay: { set: (f) => { setPlaying(false); S.cur = Math.max(0, Math.min(1, f)); updateCursor(true); }, play: () => setPlaying(true), pause: () => setPlaying(false), fail: jumpFail, range: setRange } };
boot();
