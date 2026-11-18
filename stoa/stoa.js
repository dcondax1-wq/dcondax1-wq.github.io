// STOA page (ES module): "what needs me now". Reads ../home.json, ../money/index.json, the public kalshi.json feed, ../alerts.json (if the site has it) and fixture.json (DEMO when none of them is there).
// Read only and paper only: it sends nothing. Done / Snooze live in localStorage on this phone only (stoa.state.v1). Text only through textContent / createElementNS.
// The 3D columns come from stoascene.js (optional); the 2D columns are always drawn first. window.STOA is the test hook.
import * as C from './stoacore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, inputs: null, demo: false, forced: false, cards: [], split: null, cols: [], state: {}, now: Date.now(), scene: '2d', ready: false };
const SKEY = 'stoa.state.v1';

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is read from this site first (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json); the old
// GitHub address is only the fallback. A host that answers a missing file with its index page gives HTML: not an object, so it falls through.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : getJSON('https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json', ms); }
function say(t) { $('status').textContent = t; }
function loadState() { try { return C.cleanState(JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { return {}; } }
function saveState(v) { try { localStorage.setItem(SKEY, JSON.stringify(v)); } catch (_) { /* private window: the page works without it */ } }

/** the fixture's expires_in_h -> a real date from now, so the demo deal is always "ending soon" */
function demoInputs(fx, now) {
  const f = JSON.parse(JSON.stringify(fx || {}));
  for (const s of (f.money && f.money.streams) || []) for (const i of s.items || []) if (typeof i.expires_in_h === 'number') i.expires = new Date(now + i.expires_in_h * 3600000).toISOString();
  return f;
}

function model() {
  S.now = Date.now();
  const got = S.inputs && !S.forced && (S.inputs.home || S.inputs.money || S.inputs.kalshi || S.inputs.alerts);
  S.demo = !got;
  S.state = loadState();
  const inp = got ? S.inputs : demoInputs(S.fixture, S.now);
  S.cards = C.buildCards(inp, S.now);
  S.split = C.split(S.cards, S.state, S.now);
  S.cols = C.columns(S.cards, S.state, S.now);
  S.head = C.headline(S.split);
}

function renderHero() {
  const hd = S.head;
  $('heroTitle').textContent = hd.title; $('heroWhy').textContent = hd.why; $('hero').dataset.level = hd.level;
  const p = $('heroPill'); p.textContent = hd.level === 'ok' ? 'All calm' : hd.level === 'bad' ? 'Be careful' : 'Look once'; p.className = 'pill ' + hd.level;
}

function renderFallback() {
  const svg = $('fallback'); clear(svg);
  const n = S.cols.length, W = 360, base = 128, w = 34, gap = (W - n * w) / (n + 1);
  svg.appendChild(sv('rect', { x: 10, y: base, width: W - 20, height: 8, rx: 3, fill: '#cfc4b2' }));
  svg.appendChild(sv('rect', { x: 20, y: base + 8, width: W - 40, height: 6, rx: 3, fill: '#9a8f7d' }));
  svg.appendChild(sv('rect', { x: 10, y: 22, width: W - 20, height: 7, rx: 2, fill: '#a99f8d' }));
  S.cols.forEach((c, i) => {
    const x = gap + i * (w + gap), lit = c.lit;
    svg.appendChild(sv('rect', { x: x + 4, y: 29, width: w - 8, height: base - 29, fill: lit ? '#f3e2b8' : '#d8cfbd', rx: 2 }));
    for (const dx of [10, 17, 24]) svg.appendChild(sv('rect', { x: x + dx - 1, y: 29, width: 1.5, height: base - 29, fill: '#a99f8d', opacity: 0.5 }));
    svg.appendChild(sv('rect', { x, y: 20, width: w, height: 9, rx: 2, fill: lit ? '#e0b060' : '#bdb3a0' }));
    if (lit) svg.appendChild(sv('path', { d: `M${x + w / 2} 4c-5 5 0 8-3 12h6c-2-5 2-7-3-12z`, fill: c.tone === 'bad' ? '#c96a4a' : '#e0b060' }));
    svg.appendChild(sv('text', { x: x + w / 2, y: base + 28, 'text-anchor': 'middle', fill: lit ? '#e0b060' : '#cfc4b2', 'font-size': 10.5, 'font-weight': lit ? 700 : 500 }, c.label));
  });
}

function renderScene() {
  renderFallback();
  const lit = S.cols.filter((c) => c.lit).map((c) => c.label);
  $('scene').setAttribute('aria-label', 'Six marble columns. ' + (lit.length ? 'Lit: ' + lit.join(', ') + '.' : 'None is lit: nothing needs you.'));
  $('sceneNote').textContent = lit.length ? `A lit column needs you: ${lit.join(', ')}.` : 'No column is lit: nothing needs you now.';
  if (S.scene === 'webgl' && window.STOA3D) try { window.STOA3D.update(S.cols); } catch (_) { /* keep the picture */ }
}

function act(key, how) {
  S.state = how === 'done' ? C.markDone(S.state, key, Date.now()) : how === 'snooze' ? C.snooze(S.state, key, Date.now()) : C.clearKey(S.state, key);
  saveState(S.state);
  render();
  say(how === 'back' ? 'Brought back.' : how === 'done' ? 'Done. It stays hidden for today unless it changes.' : `Snoozed for ${C.SNOOZE_HOURS} hours.`);
}
function btn(text, label, fn) { const b = h('button', 'btn', text); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }

function renderCards() {
  const box = $('cards'); clear(box);
  for (const c of S.split.open) {
    const a = h('article', 'ag-card card need'); a.dataset.slot = c.slot; a.dataset.tone = c.tone;
    const top = h('div', 'top2'); top.appendChild(h('p', 'ag-eyebrow', c.label)); top.appendChild(h('span', 'pill ' + (c.tone === 'info' ? 'info' : c.tone), c.tone === 'bad' ? 'Be careful' : c.tone === 'warn' ? 'Look once' : 'Good to know'));
    a.appendChild(top); a.appendChild(h('h3', '', c.title)); a.appendChild(h('p', 'lead', c.say));
    const row = h('div', 'acts');
    row.appendChild(btn('Done', `Mark done: ${c.title}`, () => act(c.key, 'done')));
    row.appendChild(btn('Snooze 4 h', `Snooze for four hours: ${c.title}`, () => act(c.key, 'snooze')));
    a.appendChild(row); box.appendChild(a);
  }
  if (!S.split.open.length) { const a = h('article', 'ag-card card'); a.appendChild(h('h3', '', 'Nothing to do')); a.appendChild(h('p', 'lead', 'Every column is dark. Quiet days are normal; the bot trades about 2 to 4 times a week.')); box.appendChild(a); }
  const q = $('quiet'); clear(q); $('quietCard').hidden = !S.split.quiet.length;
  for (const c of S.split.quiet) { const li = h('li'); li.appendChild(h('span', '', c.title)); li.appendChild(btn('Bring back', `Bring back: ${c.title}`, () => act(c.key, 'back'))); q.appendChild(li); }
  const k = $('calm'); clear(k);
  for (const c of S.split.calm) { const li = h('li'); li.appendChild(h('span', '', c.label)); li.appendChild(h('b', '', c.title)); k.appendChild(li); }
}

function render() {
  model();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderScene(); renderCards();
  say(`${S.head.title}. ${S.head.why}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  tryScene();
}

// ------------------------------------------------------------------------------------------------ the optional 3D columns
let tried = false;
function tryScene() {
  if (tried || !S.ready || S.scene === 'webgl') return;
  const M = window.STOA3D;
  if (!M) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  if (lite || new URLSearchParams(location.search).get('flat') === '1') return;
  tried = true;
  try { if (M.mount($('scene3d'), S.cols)) { S.scene = 'webgl'; $('scene3d').hidden = false; $('fallback').style.visibility = 'hidden'; renderScene(); } } catch (_) { S.scene = '2d'; }
}
window.addEventListener('stoa3d', tryScene);

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, money, kalshi, alerts] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../money/index.json'),
    S.forced ? null : getFeed(5000), S.forced ? null : getJSON('../alerts.json')]);
  S.fixture = fx; S.inputs = { home, money, kalshi, alerts };
  render();
  setInterval(() => { if (!document.hidden) render(); }, 60000);
}
window.STOA = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Stoa could not start'); } catch (_) { /* nothing */ } });
