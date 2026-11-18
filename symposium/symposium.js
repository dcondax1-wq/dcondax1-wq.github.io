// SYMPOSIUM page (ES module): the hall where you meet everyone who works for you.
// The people, their looks, their facts and the chat come from the shared kit (../olympus/people.js); this page seats them, and adds the round table, the stand-up,
// the debate, the request box and "Make my character". It reads ./fixture.json (example questions) and, through the kit, the site's own published JSON.
// Read only and paper only: it sends nothing and starts nothing. Text only through textContent / createElementNS. The 3D hall comes from hall.js (optional, loaded
// by hallload.js); the portrait wall is always drawn first and stays in LITE. window.SYMPOSIUM is the test hook.
// 2026-11-11 voices: the hall lends its figures to the kit (P.stage): whoever talks becomes a full figure whose mouth moves with the words, a speech bubble
// follows their head, "show me your work" puts their work card beside them, "walk with me" walks them out to their app. "Voices" turns every voice on
// (off by default, remembered). Let them talk: two or three people talk to each other, each only about their own numbers.
import * as C from './symposiumcore.js';
import P from '../olympus/people.js?v=p3';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const QS = new URLSearchParams(location.search);
const S = { people: [], rows: [], head: null, fixture: null, tab: 'meet', view: 'wall', hall: null, canTry: false, ready: false, tagBtns: [], shown: [], su: { on: false, i: -1, timer: 0, data: null }, runId: 0, me: null, look: null, table: null, lite: false };
const K = P.core;

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const byId = (id) => S.people.find((p) => p.id === id) || null;
const factsOf = (id) => { const r = S.rows.find((x) => x.person.id === id); return r ? r.facts : P.factsNow(id); };
const pillClass = (st) => (st === 'working' ? 'ok' : st === 'failed' ? 'bad' : st === 'stale' ? 'warn' : st === 'sample' ? 'sample' : 'info');
function talk(id, anchor, opts) {
  if (S.hall && S.hall.ok) { const b = $('hallCard').getBoundingClientRect(); if (b.top < -4 || b.top > 40) window.scrollTo(0, Math.max(0, window.scrollY + b.top - 6)); }
  P.open(id, { anchor, ...(opts || {}) });
}
/** say a line out loud (when voices are on) with a bubble in the hall; resolves when it is said, or a short read later when voices are off */
function voiced(id, text, mood) {
  const sd = P.say(id, text, { mood });
  if (!sd) return sleep(0);
  if (QS.get('fast') === '1') return sleep(40);
  return P.voice.on() ? sd.done : Promise.race([sd.done, sleep(reduced ? 600 : 2600)]);
}

// ------------------------------------------------------------------------------------------------ the wall (always there) and the cards
function faceBtn(p, size, withName) {
  const b = h('button', 'who'); b.type = 'button'; b.setAttribute('aria-label', 'Talk to ' + p.name + ', ' + p.title); b.dataset.id = p.id;
  b.appendChild(P.portrait(p.id, size, { uid: 'w' + size }));
  if (withName) b.appendChild(h('span', 'whoname', p.name));
  b.addEventListener('click', () => talk(p.id, b));
  return b;
}
function drawWall() {
  const w = $('wall'); clear(w);
  for (const p of S.people) { const li = h('div', 'wallcell'); li.setAttribute('role', 'listitem'); li.appendChild(faceBtn(p, 56, true)); w.appendChild(li); }
}
function drawMeet() {
  const box = $('meetList'); clear(box);
  for (const g of C.groups(S.people)) {
    box.appendChild(h('h3', 'grouph', g.name));
    const list = h('div', 'cards');
    for (const p of g.people) {
      const f = factsOf(p.id) || { status: 'stale', doing: '', mood: 'calm' }, b = h('button', 'pcard'); b.type = 'button'; b.dataset.id = p.id;
      const face = h('span', 'face56'); face.appendChild(P.portrait(p.id, 56, { uid: 'm' }));
      const txt = h('span', 'ptxt'), top = h('span', 'ptop');
      top.append(h('b', 'pname', p.name), h('span', 'pill ' + pillClass(f.status), K.STATUS_WORD[f.status] || 'Idle'));
      txt.append(top, h('span', 'ptitle', p.title), h('span', 'pdoing', K.clean(f.doing || p.bio, 120)));
      b.append(face, txt);
      b.addEventListener('click', () => talk(p.id, b));
      list.appendChild(b);
    }
    box.appendChild(list);
  }
}
function drawNew() {
  const strip = $('newStrip'), rows = C.newFaces(S.rows, Date.now(), 12); clear(strip);
  for (const r of rows) { const p = byId(r.id); if (!p) continue; const b = faceBtn(p, 56, true); b.classList.add('newwho'); b.appendChild(h('span', 'whowhy', r.why)); strip.appendChild(b); }
  $('newNote').textContent = rows.length ? 'From real files updated in the last day and a half.' : 'Nobody has a file from the last day and a half. Sample data never counts as new.';
  strip.hidden = !rows.length;
}
function drawHead() {
  S.head = C.headline(S.rows);
  const forced = QS.get('demo') === '1';
  $('demo').hidden = !(S.head.demo || forced || P.roster().fixture);
  say(S.head.text + (P.roster().fixture ? ' The roster file is missing, so this is the built-in cast.' : ''));
}

// ------------------------------------------------------------------------------------------------ tabs
const TABS = ['meet', 'table', 'standup', 'debate', 'requests', 'me'];
function setTab(t, focus) {
  if (TABS.indexOf(t) < 0) return;
  if (S.tab === 'me' && t !== 'me') leaveMe();
  if (S.tab === 'standup' && t !== 'standup') stopStandup();
  S.tab = t;
  for (const k of TABS) { const on = k === t, b = $('tab-' + k); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $('p-' + k).hidden = !on; if (on && focus) b.focus(); }
  if (t === 'requests') drawRequests();
  if (t === 'me') enterMe();
  if (t === 'standup') drawStandup();
  if (O && O.sound) { try { O.cue('tap'); } catch (_) { /* quiet */ } }
}
function wireTabs() {
  for (const k of TABS) $('tab-' + k).addEventListener('click', () => setTab(k));
  $('tabs').addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const i = TABS.indexOf(S.tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]; setTab(n, true); });
}
function fillSelect(sel, pairs, value) { clear(sel); for (const [v, t] of pairs) { const o = h('option', '', t); o.value = v; sel.appendChild(o); } if (value != null) sel.value = value; }
function chip(text, fn) { const b = h('button', 'chip', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
function bubble(p, text, sources, right) {
  const row = h('div', 'trow' + (right ? ' right' : '')), face = h('button', 'tface'); face.type = 'button'; face.setAttribute('aria-label', 'Talk to ' + p.name); face.appendChild(P.portrait(p.id, 44, { uid: 'r' }));
  face.addEventListener('click', () => talk(p.id, face));
  const b = h('div', 'tbub'); b.append(h('b', 'tname', p.name), h('p', 'ttext', text));
  if (sources && sources.length) b.appendChild(h('p', 'tsrc', 'From: ' + sources.join(', ')));
  row.append(face, b);
  return row;
}
function spot(id) { if (!S.hall || !S.hall.ok) return; const i = S.people.findIndex((p) => p.id === id); if (i >= 0) { S.hall.focus(i); S.hall.active(i); } }
function unspot() { if (S.hall && S.hall.ok) S.hall.active(-1); }

// ------------------------------------------------------------------------------------------------ round table
async function askTable(question) {
  const q = String(question || '').trim(); if (!q) return;
  const run = ++S.runId, out = $('tableOut'), scope = $('tableScope').value || 'all', ids = C.scopeIds(S.people, scope);
  $('tableQ').value = q; clear(out); $('tableNote').textContent = 'Asking ' + ids.length + ' people...';
  const res = await P.roundTable(q, ids);
  if (run !== S.runId) return;
  S.table = { q, n: res.length, asked: ids.length, answers: res };
  const real = res.filter((r) => !r.empty);
  $('tableNote').textContent = res.length ? real.length + ' of ' + ids.length + ' had something to say.' + (res.length > real.length ? ' The rest said they do not have that.' : '') : 'Nobody at the table can answer that from their files. Try one of the questions above.';
  for (const r of res) {
    if (run !== S.runId) return;
    const p = byId(r.id); if (!p) continue;
    const row = bubble(p, r.text, r.sources); if (r.empty) row.classList.add('dim');
    out.appendChild(row);
    if (!reduced && !r.empty) { spot(r.id); await sleep(260); }
  }
  unspot();
}

// ------------------------------------------------------------------------------------------------ let them talk (two or three talk to each other)
async function runTogether(g) {
  const run = ++S.runId, out = $('togetherOut'); clear(out); $('togetherBox').hidden = true;
  $('togetherNote').textContent = g.label + ' talk about: ' + g.topic;
  const d = await P.talkTogether(g.ids, g.topic);
  if (run !== S.runId) return;
  S.together = { label: g.label, topic: d.topic, n: d.turns.length, turns: d.turns.map((t) => ({ id: t.id, text: t.text })) };
  const first = d.turns.length ? d.turns[0].id : '';
  for (const t of d.turns) {
    if (run !== S.runId) return;
    const p = byId(t.id); if (!p) continue;
    out.appendChild(bubble(p, t.text, t.sources, t.id !== first));
    await voiced(t.id, t.text, t.mood);
  }
  if (run !== S.runId) return;
  unspot(); if (S.hall && S.hall.ok) S.hall.release();
  $('togetherSummary').textContent = d.summary; $('togetherBox').hidden = false; S.together.done = true;
}
function drawTogether() { const box = $('togetherChips'); clear(box); for (const g of C.trios(S.people)) box.appendChild(chip(g.label, () => runTogether(g))); }

// ------------------------------------------------------------------------------------------------ stand-up
function drawStandup() {
  const d = P.talk.standup(S.rows); S.su.data = d;
  $('suSummary').textContent = d.summary;
  const bl = $('suBlockedList'); clear(bl);
  for (const b of d.blocked) { const li = h('li'), btn = h('button', 'linkbtn', b.name); btn.type = 'button'; btn.addEventListener('click', () => talk(b.id, btn, { question: 'What do you need from me?' })); li.append(btn, h('span', '', ': ' + b.why)); bl.appendChild(li); }
  const ol = $('suList'); clear(ol);
  d.lines.forEach((l, i) => {
    const p = byId(l.id), li = h('li', 'suitem'); li.id = 'su-' + i;
    const face = h('button', 'tface'); face.type = 'button'; face.setAttribute('aria-label', 'Talk to ' + l.name); if (p) face.appendChild(P.portrait(p.id, 44, { uid: 's' })); face.addEventListener('click', () => talk(l.id, face));
    const t = h('div', 'tbub'); t.append(h('b', 'tname', l.name + (l.blocked ? ' (blocked)' : '')), h('p', 'ttext', l.line));
    li.append(face, t); ol.appendChild(li);
  });
}
function showSpeaker(i) {
  const d = S.su.data, l = d.lines[i]; if (!l) return;
  const p = byId(l.id), f = $('suFace'); clear(f); if (p) f.appendChild(P.portrait(p.id, 56, { talk: true, uid: 'n' }));
  $('suName').textContent = l.name + ' (' + (i + 1) + ' of ' + d.lines.length + ')'; $('suLine').textContent = l.line; $('suNow').hidden = false;
  for (const el of document.querySelectorAll('.suitem.on')) el.classList.remove('on');
  const li = $('su-' + i); if (li) li.classList.add('on');
  spot(l.id);
}
function stepStandup(dir) {
  const d = S.su.data; clearTimeout(S.su.timer);
  S.su.i += dir == null ? 1 : dir;
  if (!d || S.su.i >= d.lines.length) { stopStandup(true); return; }
  showSpeaker(S.su.i);
  const ms = Math.max(2400, Math.min(6500, 1500 + d.lines[S.su.i].line.length * 26)), at = S.su.i, l = d.lines[at];
  const said = P.voice.on() || (S.hall && S.hall.ok) ? voiced(l.id, l.line, l.mood) : null;
  const next = () => { if (S.su.on && S.su.i === at) stepStandup(); };
  if (said && P.voice.on() && QS.get('fast') !== '1') said.then(() => { S.su.timer = setTimeout(next, 350); });
  else S.su.timer = setTimeout(next, QS.get('fast') === '1' ? 60 : ms);
}
function playStandup() { drawStandup(); S.su.on = true; S.su.i = -1; $('suPlay').hidden = true; $('suNext').hidden = false; $('suStop').hidden = false; stepStandup(); }
function stopStandup(done) {
  clearTimeout(S.su.timer); const was = S.su.on; S.su.on = false; P.hush(); $('suPlay').hidden = false; $('suNext').hidden = true; $('suStop').hidden = true; unspot();
  for (const el of document.querySelectorAll('.suitem.on')) el.classList.remove('on');
  if (done && was) { $('suName').textContent = 'That was everyone.'; $('suLine').textContent = S.su.data ? S.su.data.summary : ''; const f = $('suFace'); clear(f); S.su.done = true; } else if (!done) $('suNow').hidden = true;
}

// ------------------------------------------------------------------------------------------------ debate
async function runDebate() {
  const a = $('dbA').value, b = $('dbB').value, topic = $('dbTopic').value.trim() || $('dbTopic').placeholder, out = $('dbOut'), run = ++S.runId;
  clear(out); $('dbSummaryBox').hidden = true;
  if (!a || !b || a === b) { out.appendChild(h('p', 'note', 'Pick two different people.')); return; }
  const d = await P.debate(a, b, topic);
  if (run !== S.runId || !d) return;
  S.debate = d;
  for (const t of d.turns) {
    if (run !== S.runId) return;
    const p = byId(t.id); if (!p) continue;
    out.appendChild(bubble(p, t.text, null, t.id === b));
    if (P.voice.on() || (S.hall && S.hall.ok)) { await voiced(t.id, t.text); if (run !== S.runId) return; }
    else if (!reduced) { spot(t.id); await sleep(320); }
  }
  unspot();
  $('dbSummary').textContent = d.summary; $('dbSummaryBox').hidden = false;
}
function drawDebateSetup() {
  const opts = S.people.map((p) => [p.id, p.name + ' · ' + K.clean(p.title, 34)]), prs = C.pairs(S.people);
  fillSelect($('dbA'), opts, prs[0] ? prs[0].a : (S.people[0] || {}).id); fillSelect($('dbB'), opts, prs[0] ? prs[0].b : (S.people[1] || {}).id);
  if (prs[0]) $('dbTopic').placeholder = prs[0].topic;
  const box = $('dbPairs'); clear(box);
  for (const pr of prs) box.appendChild(chip(pr.label, () => { $('dbA').value = pr.a; $('dbB').value = pr.b; $('dbTopic').value = pr.topic; runDebate(); }));
}

// ------------------------------------------------------------------------------------------------ request box
function drawRequests() {
  const all = P.requests(), groups = C.groupRequests(all, (id) => { const p = P.get(id); return p ? p.name : ''; }), box = $('reqList'); clear(box);
  $('reqCopy').disabled = !all.length; $('reqExport').disabled = !all.length; $('reqClear').disabled = !all.length; $('reqClear').textContent = 'Clear all'; S.clearArmed = false;
  if (!all.length) { box.appendChild(h('p', 'lead', 'The box is empty. Open anyone and tap "Leave a request", or add one here.')); return; }
  for (const g of groups) {
    const p = P.get(g.id), sec = h('section', 'reqgroup'), head = h('div', 'reqhead');
    const face = h('button', 'tface'); face.type = 'button'; face.setAttribute('aria-label', 'Talk to ' + g.name); if (p) face.appendChild(P.portrait(p.id, 44, { uid: 'q' })); face.addEventListener('click', () => talk(g.id, face));
    head.append(face, h('h3', '', g.name + (p ? ' · ' + K.clean(p.title, 40) : '')));
    sec.appendChild(head);
    for (const r of g.rows) {
      const row = h('div', 'reqrow'), t = h('div', 'reqtext'); t.append(h('p', 'ttext', r.text), h('p', 'tsrc', C.whenText(r.time)));
      const rm = h('button', 'btn small', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove this request for ' + g.name); rm.addEventListener('click', () => { P.removeRequest(r.rid); drawRequests(); });
      row.append(t, rm); sec.appendChild(row);
    }
    box.appendChild(sec);
  }
}
async function copyRequests() {
  const text = P.exportRequests(), block = $('reqBlock');
  block.value = text; block.hidden = false;
  try { await navigator.clipboard.writeText(text); $('reqNote').textContent = 'Copied. Paste it into your Claude chat.'; }
  catch (_) { block.focus(); block.select(); $('reqNote').textContent = 'Select the text below and copy it.'; }
}
function exportRequests() {
  const json = C.requestsJson(P.requests(), (id) => { const p = P.get(id); return p ? p.name : ''; }, new Date().toISOString());
  try { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.href = url; a.download = 'olympus-requests.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); $('reqNote').textContent = 'Saved olympus-requests.json.'; }
  catch (_) { const block = $('reqBlock'); block.value = json; block.hidden = false; $('reqNote').textContent = 'Could not save a file here; the JSON is below.'; }
}

// ------------------------------------------------------------------------------------------------ make my character
const LISTS = { SKINS: K.SKINS, HAIRS: K.HAIRS, HAIR_STYLES: K.HAIR_STYLES, OUTFITS: K.OUTFITS, BUILDS: K.BUILDS, EYES: K.EYES, BROWS: K.BROWS, MOUTHS: K.MOUTHS, BEARD_SET: C.BEARD_SET, CARRY: C.CARRY };
const mySpec = () => K.spec({ id: 'me', kind: 'owner' }, S.look);
function paintMe() {
  const sp = mySpec(), f = $('meFace'); clear(f); f.appendChild(P.portrait(sp, 96, { label: 'Your character', uid: 'me' }));
  if (S.turn && S.turn.ok) S.turn.set(sp);
  for (const b of document.querySelectorAll('#meOptions [data-key]')) { const on = String(C.getLook(sp, b.dataset.key)) === b.dataset.val; b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const g = $('meGlasses'); if (g) g.setAttribute('aria-pressed', sp.face.glasses ? 'true' : 'false');
}
function buildMeOptions() {
  const box = $('meOptions'); if (box.firstChild) return;
  for (const L of C.LOOKS) {
    const row = h('div', 'lookrow'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', L.label); row.appendChild(h('span', 'looklab', L.label));
    const opts = h('div', 'lookopts');
    for (const v of LISTS[L.from]) {
      const b = h('button', L.type === 'colour' ? 'swatch' : 'opt', L.type === 'colour' ? '' : (C.WORD[v] || v)); b.type = 'button'; b.dataset.key = L.key; b.dataset.val = v; b.setAttribute('aria-pressed', 'false');
      if (L.type === 'colour') { b.style.background = v; b.setAttribute('aria-label', L.label + ': ' + (C.COLOUR_NAME[v] || v)); }
      b.addEventListener('click', () => { S.look = C.setLook(S.look, L.key, v); $('meNote').textContent = ''; paintMe(); });
      opts.appendChild(b);
    }
    if (L.key === 'face.eyes') { const g = h('button', 'opt', 'Glasses'); g.type = 'button'; g.id = 'meGlasses'; g.setAttribute('aria-pressed', 'false'); g.addEventListener('click', () => { S.look = C.setLook(S.look, 'face.glasses', !mySpec().face.glasses); paintMe(); }); opts.appendChild(g); }
    row.appendChild(opts); box.appendChild(row);
  }
}
function enterMe() {
  const me = P.me();
  if (!S.look) S.look = C.lookOf(me.spec);
  if (!$('meName').value && me.made) $('meName').value = me.name;
  buildMeOptions();
  const cv = $('meCanvas'), M = window.__symHall;
  if (!S.turn && M && !S.lite) { S.turn = M.createTurntable(cv, mySpec(), { reduced }); }
  cv.hidden = !(S.turn && S.turn.ok);
  paintMe();
}
function leaveMe() { if (S.turn && S.turn.ok) { try { S.turn.dispose(); } catch (_) { /* gone */ } } S.turn = null; }
function saveMe() { const me = P.setMe({ name: $('meName').value, look: S.look }); $('meNote').textContent = 'Saved. ' + (me.name === 'You' ? 'You' : me.name) + ' will show up in every chat on this phone.'; }

// ------------------------------------------------------------------------------------------------ the optional 3D hall
function placeTags() {
  const hl = S.hall; if (!hl || !hl.ok) return;
  const want = C.front(hl.layout, hl.yaw() + Math.PI, Math.min(S.lite ? 0 : 7, S.people.length)), box = $('hallTags'), W = box.clientWidth, H = box.clientHeight, used = [];
  for (let i = 0; i < S.tagBtns.length; i++) {
    const b = S.tagBtns[i], on = want.indexOf(i) >= 0; let ok = on;
    if (on) { const p = hl.project(i), x = Math.max(26, Math.min(W - 26, p.x)), y = Math.max(26, Math.min(H - 30, p.y - 10)); ok = p.front && !used.some((u) => Math.abs(u[0] - x) < 50 && Math.abs(u[1] - y) < 50); if (ok) { used.push([x, y]); b.style.transform = 'translate(' + Math.round(x - 24) + 'px,' + Math.round(y - 24) + 'px)'; } }
    if (b.hidden === ok) b.hidden = !ok;
  }
}
function mountHall() {
  const M = window.__symHall;
  if (!M || !S.people.length) return false;
  $('stage').hidden = false;
  const hl = M.createHall($('hall3d'), { reduced, people: S.people.map((p) => P.spec(p.id)), onFrame: () => { placeTags(); if (S.cardPlace) S.cardPlace(); const st = $('stage'), on = !!st.querySelector('.pp-say'); if (on !== st.classList.contains('speaking')) st.classList.toggle('speaking', on); } });      // the name tags step aside while a bubble is up
  if (!hl || !hl.ok) { $('stage').hidden = true; S.hall = null; S.why = hl && hl.reason; return false; }
  S.hall = hl; S.view = 'hall'; mountStage(); direct(hl);
  const box = $('hallTags'); clear(box); S.tagBtns = [];
  S.people.forEach((p) => { const b = h('button', 'htag'); b.type = 'button'; b.hidden = true; b.setAttribute('aria-label', 'Talk to ' + p.name + ', ' + p.title); b.appendChild(P.portrait(p.id, 44, { uid: 'h3' })); b.appendChild(h('span', 'htagname', p.name)); b.addEventListener('click', () => talk(p.id, b)); box.appendChild(b); S.tagBtns.push(b); });
  placeTags();
  return true;
}
// SCENE DIRECTION (direct.js + olympus/camera-rig.js, 2026-11-11): the establishing shot, the greeter, the conversation camera. ?direct=0 keeps the plain hall.
function direct(hl) {
  if (S.dir) { try { S.dir.dispose(); } catch (_) { /* gone */ } } S.dir = null;
  if (QS.get('direct') === '0' || !hl.drive) return;
  const go = () => { const D = window.__symDirect; if (!D || S.hall !== hl || S.dir) return; S.dir = D.createDirector(hl, { box: $('stage'), people: () => S.people, kit: () => P, onTalk: (id) => talk(id, $('viewBtn')) }); window.SYM_DIRECTOR = S.dir; S.dir.start(); };
  if (window.__symDirect) go(); else window.addEventListener('sym-direct', go, { once: true });      // hallload.js loads direct.js
}
function wireHall() {
  const cv = $('hall3d'); let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, last: e.clientX, moved: 0, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } });
  cv.addEventListener('pointermove', (e) => { if (!down || down.id !== e.pointerId || !S.hall) return; const dx = e.clientX - down.last; down.last = e.clientX; down.moved += Math.abs(dx); if (down.moved > 6) { S.hall.spin(dx); if (S.dir) S.dir.spun(); } });
  const up = (e) => { if (!down || down.id !== e.pointerId) return; const tap = down.moved <= 6 && Math.abs(e.clientY - down.y) <= 8; down = null; if (tap && S.hall && S.hall.ok) { const i = S.hall.pick(e.clientX, e.clientY); if (i >= 0 && S.people[i]) talk(S.people[i].id, cv); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { down = null; });
  cv.addEventListener('keydown', (e) => { if (!S.hall || !S.hall.ok) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.hall.setYaw(S.hall.yaw() + (e.key === 'ArrowLeft' ? -0.2 : 0.2)); placeTags(); } });
  $('viewBtn').addEventListener('click', () => {
    if (S.view === 'hall') { P.stage(null); if (S.dir) { try { S.dir.dispose(); } catch (_) { /* gone */ } S.dir = null; } if (S.hall) { try { S.hall.dispose(); } catch (_) { /* gone */ } } S.hall = null; S.view = 'wall'; S.canTry = true; $('stage').hidden = true; }
    else if (!mountHall()) { S.canTry = false; say('3D is not available on this device; the list stays.'); }
    paintView();
  });
}
function paintVoices() { const on = P.voice.on(), b = $('voiceBtn'); b.textContent = 'Voices: ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
function stageCard(id, el) {
  const box = $('hallCards'); clear(box); if (!el || !S.hall || !S.hall.ok) return;
  const i = S.people.findIndex((p) => p.id === id); if (i < 0) return;
  box.appendChild(el); S.card = { i, el }; S.hall.focus(i, 0.2);
  const place = () => { if (!S.card || S.card.el !== el || !el.parentNode || !S.hall) return; const q = S.hall.project(i), W = box.clientWidth, H = box.clientHeight, w = el.offsetWidth || 176, hh = el.offsetHeight || 120, x = q.x < W / 2 ? Math.min(W - w - 6, q.x + 30) : Math.max(6, q.x - w - 30); el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(Math.max(6, Math.min(H - hh - 6, q.y - 4))) + 'px)'; };
  place(); S.cardPlace = place;
}
function mountStage() {
  P.stage({
    figure(id) { if (!S.hall || !S.hall.ok) return null; const i = S.people.findIndex((p) => p.id === id); if (i < 0) return null; const sp = S.hall.stageFor(i); return sp ? { project: sp.project, container: $('stage') } : null; },      // the hall moves the mouth itself (the kit's speak / viseme events)
    release() { if (S.hall && S.hall.ok) S.hall.release(); clear($('hallCards')); S.card = null; S.cardPlace = null; },
    walk(id) { const i = S.people.findIndex((p) => p.id === id); return S.hall && S.hall.ok && i >= 0 ? S.hall.walk(i) : Promise.resolve(false); },
    card: stageCard,
  });
}
function paintView() {
  const f = !!(S.hall && S.hall.ok);
  $('wall').hidden = f; $('stage').hidden = !f;
  $('viewBtn').hidden = !f && !S.canTry; $('viewBtn').textContent = f ? 'Show as a list' : 'Show the 3D hall';
  $('hallNote').textContent = f ? 'Drag sideways to walk around the table. Tap a person, or a portrait, to talk.' : 'Tap anyone to talk. They only say what their own files say.';
  $('lite').hidden = !S.lite;
}
function tryHall() {
  if (!S.ready || S.triedHall) return;
  if (!window.__symHall) return;
  S.triedHall = true;
  try { mountHall(); } catch (_) { S.hall = null; }
  paintView();
}
window.addEventListener('sym-hall', tryHall);

// ------------------------------------------------------------------------------------------------ start
async function refresh() {
  const rows = [];
  for (const p of S.people) rows.push({ person: p, facts: await P.facts(p.id) });
  S.rows = rows;
  drawHead(); drawWall(); drawMeet(); drawNew();
  if (S.tab === 'standup' && !S.su.on) drawStandup();
}
async function init() {
  S.lite = !!(O && typeof O.lite === 'function' && O.lite());
  wireTabs(); wireHall();
  S.fixture = await getJSON('./fixture.json');
  await P.ready();
  S.people = C.order(P.list());
  S.rows = S.people.map((p) => ({ person: p, facts: P.factsNow(p.id) }));
  drawWall(); drawMeet();
  const qs = (S.fixture && Array.isArray(S.fixture.questions) ? S.fixture.questions : ['How did yesterday go?', 'Are you stuck?', 'What did you learn?']).filter((x) => typeof x === 'string').slice(0, 8);
  const tc = $('tableChips'); for (const q of qs) tc.appendChild(chip(q, () => askTable(q)));
  fillSelect($('tableScope'), C.SCOPES, 'all');
  $('tableForm').addEventListener('submit', (e) => { e.preventDefault(); askTable($('tableQ').value || $('tableQ').placeholder); });
  $('suPlay').addEventListener('click', playStandup); $('suNext').addEventListener('click', () => stepStandup()); $('suStop').addEventListener('click', () => stopStandup(false));
  drawDebateSetup(); $('dbGo').addEventListener('click', runDebate); drawTogether();
  paintVoices(); $('voiceBtn').addEventListener('click', () => { P.voice.set(!P.voice.on()); paintVoices(); if (P.voice.on()) $('status').textContent = 'Voices on. Each person speaks with their own voice; tap Voices again to stop.'; else P.hush(); });
  window.addEventListener('olympus:people:close', () => { clear($('hallCards')); S.card = null; S.cardPlace = null; paintVoices(); });
  fillSelect($('reqWho'), S.people.map((p) => [p.id, p.name + ' · ' + K.clean(p.title, 34)]));
  $('reqForm').addEventListener('submit', (e) => { e.preventDefault(); const t = $('reqText').value.trim(); if (!t) { $('reqNote').textContent = 'Write the request first.'; return; } const row = P.request($('reqWho').value, t); $('reqText').value = ''; $('reqNote').textContent = row ? 'Added.' : 'This phone would not store it.'; drawRequests(); });
  $('reqCopy').addEventListener('click', copyRequests); $('reqExport').addEventListener('click', exportRequests);
  $('reqClear').addEventListener('click', () => { if (!S.clearArmed) { S.clearArmed = true; $('reqClear').textContent = 'Tap again to clear all'; return; } P.clearRequests(); $('reqBlock').hidden = true; $('reqNote').textContent = 'The box is empty.'; drawRequests(); });
  window.addEventListener('olympus:people:request', () => { if (S.tab === 'requests') drawRequests(); });
  window.addEventListener('olympus:people:me', () => { if (S.ready) { drawWall(); } });
  $('meRandom').addEventListener('click', () => { S.look = C.randomLook(Math.random, LISTS); $('meNote').textContent = ''; paintMe(); });
  $('meSave').addEventListener('click', saveMe);
  await refresh();
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the kit lifts its loading veil by itself after 12 s */ }
  S.canTry = !S.lite;
  paintView();
  tryHall();
  const want = (location.hash || '').replace('#', ''); if (TABS.indexOf(want) >= 0) setTab(want);
  const who = QS.get('talk'); if (who && P.get(who)) talk(who, $('viewBtn'));
  setInterval(() => { if (!document.hidden && !P.isOpen() && !S.su.on) refresh(); }, 120000);
  if (window.AGORA && window.AGORA.pull) window.AGORA.pull(() => refresh());   // pull down = refresh the hall (olympus/agora-ui.js)
}
window.SYMPOSIUM = { ready: () => S.ready, state: () => ({ n: S.people.length, tab: S.tab, view: S.view, hall: !!(S.hall && S.hall.ok), why: S.why || '', head: S.head, lite: S.lite, table: S.table, debate: S.debate || null, standup: S.su.data, suOn: S.su.on, suI: S.su.i, tags: S.tagBtns.filter((b) => !b.hidden).length, calls: S.hall && S.hall.ok ? S.hall.drawCalls() : 0, turn: !!(S.turn && S.turn.ok), look: S.look }),
  setTab, askTable, runDebate, playStandup, runTogether, speaking: () => (S.hall && S.hall.ok ? S.hall.speaking() : -1), trios: () => C.trios(S.people), together: () => S.together || null, card: () => C.jarvisCard(S.head, P.requests().length, Date.now() / 1000), people: () => S.people.map((p) => p.id) };
init().catch((e) => { say('Something went wrong while loading the hall: ' + (e && e.message ? e.message : e)); S.ready = true; });
