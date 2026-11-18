// HERALD page (ES module): the daily paper. Reads ./edition.json (today's edition, written by tools/herald_build.py from the published files), ./editions/index.json and the
// past editions next to it (last 14), or fixture.json (DEMO edition: made-up example files, never blank). A broadsheet that falls to one column on a phone: tap a story to read it,
// swipe or use Older / Newer for other editions, "Read it to me" (the phone's own voice, off by default), share a story as plain text, see where every number comes from.
// Stores nothing, sends nothing. Text only through textContent. window.HERALD is the test hook. ?demo=1 forces the demo, ?now=<ISO> fixes the clock, ?flat=1 draws the flat scroll.
import * as C from './heraldcore.js';
import { createStand } from './heraldscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { ed: null, latest: null, fixture: null, dates: [], demo: false, forced: false, now: 0, scene: null, sceneMode: 'none', ready: false, voice: false, spoken: [], open: null, answers: [], cache: new Map(), busy: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
/** a past edition by its date (only a date can be asked for) */
async function loadEdition(date) {
  if (!C.safeDate(date)) return null;
  if (S.cache.has(date)) return S.cache.get(date);
  let ed = null;
  try { const r = await fetch(`./editions/${date}.json`, { cache: 'no-cache' }); if (r.ok) ed = C.normalizeEdition(await r.json()); } catch (_) { ed = null; }
  if (ed && ed.date === date && C.printable(ed)) { S.cache.set(date, ed); return ed; }
  return null;
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------ the voice
function speak(text) {
  S.spoken.push(text);
  const sy = window.speechSynthesis;
  if (!sy || typeof window.SpeechSynthesisUtterance !== 'function') { say('This browser has no voice, so the story stays on the page.'); return false; }
  try { sy.cancel(); const u = new window.SpeechSynthesisUtterance(text); u.rate = 0.96; u.pitch = 1; sy.speak(u); } catch (_) { say('The voice could not start.'); return false; }
  return true;
}
function hush() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) { /* no voice */ } }
function setVoice(on) {
  S.voice = !!on; $('readMe').setAttribute('aria-pressed', String(S.voice)); $('readMe').textContent = `Read it to me: ${S.voice ? 'on' : 'off'}`;
  if (!S.voice) { hush(); say('Reading aloud is off.'); return; }
  say('Reading aloud is on: open a story and it is read to you.');
  if (S.ed && S.ed.lead && !S.open) speak(C.speechText(S.ed.lead, S.ed));
}

// ------------------------------------------------------------------ the paper
function mark(a) { return S.ed.demo ? null : a.sample ? h('span', 'mark', 'SAMPLE DATA') : null; }
function renderLead(ed) {
  const box = $('lead'), a = ed.lead; clear(box);
  box.appendChild(h('p', 'kicker', a.kicker || 'Lead story'));
  const hd = h('h2', '', a.headline); const m = mark(a); if (m) hd.appendChild(m); box.appendChild(hd);
  box.appendChild(h('p', 'standfirst', a.standfirst));
  const body = h('div', 'body dropcap'); a.body.forEach((b) => body.appendChild(h('p', '', b))); box.appendChild(body);
  box.appendChild(h('p', 'src', 'Sources: ' + (a.sources.join(', ') || 'none named')));
  const seg = h('div', 'seg'), open = h('button', 'btn', 'Where the numbers come from'), share = h('button', 'btn', 'Share as text');
  open.type = 'button'; open.id = 'leadOpen'; open.addEventListener('click', () => openArticle(a.id));
  share.type = 'button'; share.id = 'leadShare'; share.addEventListener('click', () => { openArticle(a.id); shareArticle(); });
  seg.appendChild(open); seg.appendChild(share); box.appendChild(seg);
}
function renderStories(ed) {
  const box = $('stories'); clear(box);
  ed.articles.forEach((a) => {
    const b = h('button', 'story'); b.type = 'button'; b.dataset.id = a.id;
    b.appendChild(h('span', 'kicker', a.kicker));
    const hd = h('b', '', a.headline); const m = mark(a); if (m) hd.appendChild(m); b.appendChild(hd);
    b.appendChild(h('span', 'sf', a.standfirst)); b.appendChild(h('span', 'first', a.body[0])); b.appendChild(h('span', 'more', 'Read the story'));
    b.addEventListener('click', () => openArticle(a.id));
    box.appendChild(b);
  });
}
function portrait(id, name) {
  const face = h('div', 'face'), P = window.OLYMPUS_PEOPLE;
  try { const el = P && typeof P.portrait === 'function' && id ? P.portrait(id, 44) : null; if (el && el.nodeType === 1) { face.appendChild(el); face.dataset.kind = 'portrait'; return face; } } catch (_) { /* the kit does not know this person: initials */ }
  face.textContent = C.initials(name); face.dataset.kind = 'initials'; face.setAttribute('aria-hidden', 'true');
  return face;
}
function renderBoxes(ed) {
  const nums = $('numbers'); clear(nums);
  ed.numbers.forEach((n) => { const li = h('li'); li.appendChild(h('b', '', n.value)); li.appendChild(h('span', '', `${n.label} (${n.src})`)); nums.appendChild(li); });
  $('numbersBox').hidden = !ed.numbers.length;
  const w = ed.weather; $('weatherBox').hidden = !w;
  if (w) {
    const wx = $('wx'); clear(wx); wx.appendChild(h('span', 'pill ' + C.WEATHER[w.level][1], C.WEATHER[w.level][0])); wx.appendChild(document.createTextNode(' ' + w.text));
    const ul = $('wxEvents'); clear(ul); w.events.forEach((e) => { const li = h('li'); li.appendChild(h('b', '', (e.time ? e.time + ' ET ' : '') + e.title)); li.appendChild(document.createTextNode(e.impact ? ` (impact ${e.impact})` : '')); ul.appendChild(li); });
    $('wxNote').textContent = `${w.note} Source: ${w.src}.`;
  }
  const cor = $('corrections'); clear(cor);
  ed.corrections.forEach((x) => { const li = h('li'); li.appendChild(h('s', '', x.was)); li.appendChild(h('span', 'now', x.now)); li.appendChild(h('span', 'proof', `${x.proof ? x.proof + ' ' : ''}Source: ${x.src}`)); cor.appendChild(li); });
  $('corrBox').hidden = !ed.corrections.length;
  const c = ed.classifieds, cl = $('classifieds'); clear(cl); $('classBox').hidden = !(c && c.items.length);
  if (c) {
    c.items.forEach((i) => { const li = h('li'); li.appendChild(h('b', '', i.title)); if (i.detail) li.appendChild(h('span', 'd', i.detail)); const bits = []; if (i.usd !== null) bits.push(`saves about ${C.money(i.usd)} (estimate)`); if (i.expires) bits.push(`ends ${i.expires}`); if (bits.length) li.appendChild(h('span', 'm', bits.join(' · '))); cl.appendChild(li); });
    $('classNote').textContent = `${c.sample && !ed.demo ? 'SAMPLE offers. ' : ''}${c.note} Source: ${c.src}.`;
  }
  renderQuiz(ed);
  const iv = $('interviews'); clear(iv); $('talkBox').hidden = !ed.interviews.length;
  ed.interviews.forEach((p) => {
    const row = h('div', 'iv'); row.dataset.id = p.id; row.appendChild(portrait(p.id, p.name));
    const who = h('div', 'who'); who.appendChild(h('b', '', p.name)); who.appendChild(h('span', '', `${p.title}${p.sample && !ed.demo ? ' · SAMPLE' : ''} · from ${p.src}`));
    const dl = h('dl'); p.qa.forEach((x) => { dl.appendChild(h('dt', '', x.q)); dl.appendChild(h('dd', '', x.a)); }); who.appendChild(dl);
    row.appendChild(who); iv.appendChild(row);
  });
  const sh = $('shipped'); clear(sh); $('shipBox').hidden = !ed.shipped.length;
  ed.shipped.forEach((s) => { const li = h('li'); li.appendChild(h('b', '', s.who + ': ')); li.appendChild(document.createTextNode(s.text)); sh.appendChild(li); });
  const sk = $('skipped'); clear(sk); $('skipBox').hidden = !ed.skipped.length;
  ed.skipped.forEach((s) => { const li = h('li'); li.appendChild(h('b', '', s.article + ': ')); li.appendChild(document.createTextNode(s.why)); sk.appendChild(li); });
}
function renderQuiz(ed) {
  const ol = $('quiz'); clear(ol); $('quizBox').hidden = !ed.quiz.length;
  ed.quiz.forEach((q, i) => {
    const li = h('li'), picked = S.answers[i]; li.appendChild(h('p', 'q', q.q));
    const opts = h('div', 'opts');
    q.o.forEach((o, j) => { const b = h('button', 'opt', o); b.type = 'button'; b.dataset.q = String(i); b.dataset.o = String(j);
      if (Number.isInteger(picked)) { b.disabled = j !== picked && j !== q.a; if (j === q.a) b.classList.add('right'); else if (j === picked) b.classList.add('wrong'); }
      b.addEventListener('click', () => { if (Number.isInteger(S.answers[i])) return; S.answers[i] = j; renderQuiz(S.ed); say(j === q.a ? 'Right.' : 'Not that one. The answer is marked.'); });
      opts.appendChild(b); });
    li.appendChild(opts);
    if (Number.isInteger(picked)) li.appendChild(h('p', 'why', q.why));
    ol.appendChild(li);
  });
  $('quizScore').textContent = ed.quiz.length ? `${C.grade(ed.quiz, S.answers).words}. Questions from the Lyceum.` : '';
}
function drawFlat(kicker, lines) {
  const svg = $('standFlat'); clear(svg);
  svg.appendChild(sv('rect', { x: 40, y: 28, width: 240, height: 150, class: 'sheet' })); svg.appendChild(sv('rect', { x: 48, y: 36, width: 224, height: 134, class: 'frame' }));
  for (const y of [22, 176]) { svg.appendChild(sv('rect', { x: 28, y, width: 264, height: 8, rx: 4, class: 'rod' })); svg.appendChild(sv('circle', { cx: 28, cy: y + 4, r: 6, class: 'cap' })); svg.appendChild(sv('circle', { cx: 292, cy: y + 4, r: 6, class: 'cap' })); }
  svg.appendChild(sv('text', { x: 160, y: 56, 'text-anchor': 'middle', class: 'k' }, kicker));
  const y0 = 108 - (lines.length - 1) * 9;
  lines.forEach((ln, i) => svg.appendChild(sv('text', { x: 160, y: y0 + i * 19, 'text-anchor': 'middle' }, ln)));
}
function showHeadline(ed) {
  const kicker = `${ed.masthead.date_words} · No. ${ed.number}`, head = ed.lead.headline;
  if (S.scene) S.scene.show(kicker, C.wrap(head, 20, 4)); else drawFlat(kicker, C.wrap(head, 26, 5));
}
function startScene() {
  const lite = !!(O && O.lite && O.lite()), flat = /[?&]flat=1/.test(location.search);
  $('lite').hidden = !lite;
  if (!lite && !flat) { try { S.scene = createStand($('stand'), { O }); } catch (_) { S.scene = null; } }
  S.sceneMode = S.scene ? 'webgl' : 'flat';
  $('stand').hidden = !S.scene; $('standFlat').toggleAttribute('hidden', !!S.scene);   // an <svg> has no .hidden property: the attribute itself
}
function render(ed) {
  S.ed = ed; S.answers = []; closeArticle(true);
  $('demo').hidden = !ed.demo;
  $('mastTitle').textContent = ed.masthead.title; $('mastDate').textContent = ed.masthead.date_words;
  $('mastNo').textContent = `Edition No. ${ed.number}`; $('mastMotto').textContent = ed.masthead.motto;
  $('built').textContent = C.builtWords(ed.built, S.now);
  $('label').textContent = ed.label;
  $('edPill').textContent = `No. ${ed.number}`;
  renderLead(ed); renderStories(ed); renderBoxes(ed); showHeadline(ed);
  const nb = C.neighbours(S.dates, ed.date);
  $('older').disabled = !nb.older || ed.demo; $('newer').disabled = !nb.newer || ed.demo;
  $('navWhen').textContent = ed.demo ? 'Demo edition' : nb.total > 1 ? `${ed.date} · ${nb.index + 1} of ${nb.total} kept` : `${ed.date} · the only edition kept so far`;
}
async function go(dir) {
  if (S.busy || !S.ed || S.ed.demo) return;
  const nb = C.neighbours(S.dates, S.ed.date), date = dir < 0 ? nb.older : nb.newer;
  if (!date) { say(dir < 0 ? 'This is the oldest edition kept.' : 'This is the newest edition.'); return; }
  S.busy = true; say(`Fetching the edition of ${date}...`);
  const ed = S.latest && S.latest.date === date ? S.latest : await loadEdition(date);
  S.busy = false;
  if (!ed) { say(`The edition of ${date} could not be read, so this one stays.`); return; }
  hush(); render(ed); say(`${ed.masthead.title}, ${ed.masthead.date_words}: edition ${ed.number}.`); window.scrollTo(0, 0);
  if (S.voice) speak(C.speechText(ed.lead, ed));
}

// ------------------------------------------------------------------ the reader
function openArticle(id) {
  const a = C.findArticle(S.ed, id); if (!a) return;
  S.open = a;
  $('rKicker').textContent = a.kicker; $('rHead').textContent = a.headline; $('rStand').textContent = a.standfirst;
  const body = $('rBody'); clear(body); a.body.forEach((b) => body.appendChild(h('p', '', b)));
  $('rSample').hidden = !(a.sample || S.ed.demo); $('rSample').textContent = S.ed.demo ? 'DEMO edition: example files, not real numbers.' : 'This story rests on SAMPLE data, not on real finds.';
  const ul = $('rFacts'); clear(ul);
  a.facts.forEach((f) => { const li = h('li'); li.appendChild(h('b', '', f.t)); li.appendChild(h('i', '', ` · ${f.kind === 'quote' ? 'copied from' : f.kind === 'calc' ? `worked out (${f.how}) from` : `read at "${f.how}" in`} ${f.src}`)); ul.appendChild(li); });
  const stray = C.audit(a);
  $('rFactsSum').textContent = stray.length ? `Warning: ${stray.length} number(s) without a source` : `Where every number comes from (${a.facts.length} facts, ${a.sources.length} ${a.sources.length === 1 ? 'file' : 'files'})`;
  $('rShareFld').hidden = true; $('rFactsBox').open = false;
  $('reader').hidden = false; $('reader').scrollTop = 0; document.body.style.overflow = 'hidden';
  say(`Reading: ${a.headline}`);
  if (S.voice) speak(C.speechText(a, S.ed));
  try { $('rClose').focus({ preventScroll: true }); } catch (_) { /* old Safari */ }
}
function closeArticle(quiet) {
  if ($('reader').hidden) return;
  $('reader').hidden = true; document.body.style.overflow = ''; S.open = null; hush();
  if (!quiet) say('Back to the front page.');
}
function shareArticle() {
  const a = S.open; if (!a) return;
  const text = C.articleText(a, S.ed);
  $('rShareOut').value = text; $('rShareFld').hidden = false;
  const done = (how) => say(how === 'shared' ? 'Shared.' : how === 'copied' ? 'The story was copied as text.' : 'The story is in the box below as text: copy it from there.');
  try {
    if (navigator.share) { navigator.share({ title: a.headline, text }).then(() => done('shared'), () => done('box')); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => done('copied'), () => done('box')); return; }
  } catch (_) { /* fall through to the box */ }
  done('box');
}

// ------------------------------------------------------------------ start
function wire() {
  $('older').addEventListener('click', () => go(-1)); $('newer').addEventListener('click', () => go(1));
  $('readMe').addEventListener('click', () => setVoice(!S.voice));
  $('rClose').addEventListener('click', () => closeArticle());
  $('rSpeak').addEventListener('click', () => { if (S.open) { if (speak(C.speechText(S.open, S.ed))) say('Reading the story aloud.'); } });
  $('rShare').addEventListener('click', shareArticle);
  $('reader').addEventListener('click', (e) => { if (e.target === $('reader')) closeArticle(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeArticle(); else if (!S.open && e.key === 'ArrowLeft') go(-1); else if (!S.open && e.key === 'ArrowRight') go(1); });
  let t0 = null;                                                      // swipe the paper: right = older, left = newer
  $('paper').addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; t0 = [t.clientX, t.clientY]; }, { passive: true });
  $('paper').addEventListener('touchend', (e) => { if (!t0) return; const t = e.changedTouches[0], dx = t.clientX - t0[0], dy = t.clientY - t0[1]; t0 = null; if (Math.abs(dx) > 70 && Math.abs(dy) < 50) go(dx > 0 ? -1 : 1); }, { passive: true });
  window.addEventListener('pagehide', hush);
}
async function start() {
  const qs = new URLSearchParams(location.search);
  S.forced = qs.get('demo') === '1';
  const now = Date.parse(qs.get('now') || ''); S.now = isNaN(now) ? Date.now() : now;
  wire(); startScene();
  const [raw, ix, fx] = await Promise.all([S.forced ? null : getJSON('./edition.json'), S.forced ? null : getJSON('./editions/index.json'), getJSON('./fixture.json')]);
  S.fixture = fx;
  let ed = raw ? C.normalizeEdition(raw) : null, why = '';
  if (ed && !C.printable(ed)) { ed = null; why = 'Today\'s edition has no story (its source files are missing), so this is the DEMO edition: example files, not real numbers.'; }
  if (!ed) {
    const d = fx && fx.edition ? C.normalizeEdition(fx.edition) : null;
    if (d) { d.demo = true; ed = d; S.demo = true; if (!why) why = S.forced ? 'DEMO edition: example files, not real numbers.' : 'Today\'s edition could not be read, so this is the DEMO edition: example files, not real numbers.'; }
  }
  if (!ed) { say('No edition could be read, not even the demo. Check the connection and open the page again.'); try { if (O && O.ready) O.ready(); } catch (_) { /* no kit */ } S.ready = true; return; }
  S.latest = ed; S.dates = S.demo ? [] : C.indexDates(ix); if (!S.demo && S.dates.indexOf(ed.date) < 0) S.dates.push(ed.date);
  render(ed);
  say(why || `${ed.masthead.title}, ${ed.masthead.date_words}: edition ${ed.number}, ${C.allArticles(ed).length} stories.`);
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  S.ready = true;
  whenNear($('talkBox'), loadPeople);
}
/** run fn once when el comes within ~1.5 screens of the view (an IntersectionObserver; without one: 1.5 s after the first paint).
 *  QA Round 7: the kit used to come on a fixed 1.5 s timer, so on a busy phone (the 3D newsstand compiling) the interviews switched from
 *  initials to portraits at a random moment; now they change only when the reader scrolls towards them, and a reader who never does saves the download. */
function whenNear(el, fn) {
  let done = false; const go = () => { if (!done) { done = true; fn(); } };
  if (!el || typeof IntersectionObserver !== 'function') { setTimeout(go, 1500); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '0px 0px 150% 0px' });
  io.observe(el);
}
let peopleAsked = false;
/** the optional people kit (portraits): added after the first paint so a missing file is never a load failure; the interviews are redrawn when it arrives */
function loadPeople() {
  if (window.OLYMPUS_PEOPLE || peopleAsked) return;
  peopleAsked = true;
  const s = document.createElement('script'); s.type = 'module'; s.src = '../olympus/people.js?v=p3';
  s.addEventListener('load', () => { S.people = 'loaded'; if (S.ed && window.OLYMPUS_PEOPLE) renderBoxes(S.ed); });
  s.addEventListener('error', () => { S.people = 'missing'; });                 // no kit: initials stay
  document.body.appendChild(s);
}
window.HERALD = { ready: () => S.ready, S, C, scene: () => S.scene, go, open: openArticle };
start();
