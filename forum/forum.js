// FORUM page (ES module): loads the Council of the Gods and the live eval the site already publishes, builds the briefing
// (forumcore.js), draws the forum (scene.js) and walks you through it. Text only through textContent. window.FORUM is the test hook.
import { etParts, parseClock, clockText, minsText, nextEvent, phase, brief, oath, streak, evalOf, desk } from './forumcore.js';
import { readPlanner, renderDesk, renderShrine, ritual } from './forumdesk.js';
import { renderMoney, renderDay, renderHero } from './forumplus.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'forum.v1';
const S = { desk: [], pan: null, home: null, demo: true, items: [], p: null, step: -1, read: new Set(), pledges: [false, false, false], sealed: {}, scene: null, ready: false, error: null, clockOverride: null };

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
// an optional file that answered 404 is not asked again for 30 minutes (a browser logs every 404 as a console error): once per phone, not on every open
const wasGone = (u) => { try { const t = +localStorage.getItem('forum.opt404.' + u); return !!t && Date.now() - t < 1800e3; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem('forum.opt404.' + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { if (wasGone(url)) return null; const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.status === 404) markGone(url); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
const TONE = { calm: ['#aeb86e', 'CALM'], watch: ['#e0b060', 'WATCH'], storm: ['#c96a4a', 'CAUTION'], info: ['#4b7a99', 'READ'] };
const OATH = oath();

// ------------------------------------------------------------------------------------------------ the clock
function now() {
  const p = etParts(new Date());
  if (S.clockOverride != null) p.h = S.clockOverride;
  return p;
}
function councilTone() { const c = S.items.find((i) => i.id === 'council'); return c ? c.tone : 'watch'; }
function tickClock() {
  const p = (S.p = now()), ph = phase(p.h), ne = nextEvent(p);
  $('ckTime').textContent = clockText(p.h);
  $('ckPhase').textContent = `ET · ${ph.name}`;
  $('ckNext').textContent = `${ne.name} in ${minsText(ne.mins)}${ne.tomorrow ? ' (next trading day)' : ''}`;
  const sk = streak(S.sealed, p.day);
  $('streakN').textContent = String(sk.cur); $('streak').classList.toggle('on', sk.cur > 0);
  renderShrine($('shrine'), sk.cur, sk.best);
  try { renderDay($('day'), p); } catch (e) { /* the day bar is optional */ }
  if (S.scene) S.scene.setClock({ h: p.h, tone: councilTone() });
}

// ------------------------------------------------------------------------------------------------ the walk
const sealedToday = () => !!S.sealed[(S.p || now()).day];

function show(step) {
  S.step = step;
  const intro = $('intro'), scroll = $('scroll'), oathEl = $('oath');
  intro.hidden = step !== -1; scroll.hidden = !(step >= 0 && step < S.items.length); oathEl.hidden = step !== S.items.length;
  $('steps').hidden = step === -1;
  const card = $('card');
  if (step >= 0 && step < S.items.length) {
    const it = S.items[step], [col, word] = TONE[it.tone] || TONE.info;
    S.read.add(step);
    card.style.setProperty('--tone', col);
    $('sGlyph').textContent = it.glyph; $('sTitle').textContent = it.title; $('sStat').textContent = it.stat; $('sTone').textContent = word; $('sBody').textContent = it.line + ' ' + it.body;
  } else if (step === S.items.length) card.style.setProperty('--tone', '#aeb86e');
  else card.style.setProperty('--tone', '#4b7a99');
  if (S.scene) S.scene.focus(step === -1 ? -1 : step);
  const dots = $('dots');
  document.documentElement.dataset.walk = step === -1 ? '' : '1';          // the tablet card rises above the two-row nav (dots, then the arrows)
  [...dots.children].forEach((b, i) => { if (i === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.classList.toggle('read', S.read.has(i) && i !== step); });
  $('prev').disabled = step <= 0; $('next').disabled = step >= S.items.length;
  $('desk').hidden = !(step === -1 || step === S.items.length);
  $('money').hidden = $('day').hidden = $('desk').hidden;                       // Money today and the trading day ride with the desk (the start and the oath screens)
  card.scrollTop = 0;
}

function buildDots() {
  const dots = $('dots'); dots.replaceChildren();
  for (let i = 0; i <= S.items.length; i++) {
    const b = h('button'); b.type = 'button'; b.setAttribute('aria-label', i < S.items.length ? `Tablet ${i + 1}: ${S.items[i].title}` : 'The oath'); b.append(h('i'));
    b.addEventListener('click', () => show(i)); dots.append(b);
  }
}

function renderOath() {
  const box = $('pledges'); box.replaceChildren();
  const sealed = sealedToday(), done = sealed ? (S.sealed[(S.p || now()).day].p || []) : S.pledges;
  OATH.forEach((o, i) => {
    const b = h('button', 'pledge'); b.type = 'button'; b.dataset.pledge = o.id; b.setAttribute('aria-pressed', String(!!done[i]));
    const mark = h('span', 'box', done[i] ? '✓' : ''); mark.setAttribute('aria-hidden', 'true');
    b.append(mark, h('span', '', o.text)); b.disabled = sealed;
    b.addEventListener('click', () => { S.pledges[i] = !S.pledges[i]; renderOath(); if (S.pledges[i]) ritual('pledge', b, S.scene); });
    box.append(b);
  });
  $('seal').disabled = sealed || !S.pledges.every(Boolean);
  $('seal').hidden = sealed;
  const msg = $('sealed');
  if (sealed) { msg.textContent = `Sealed at ${S.sealed[(S.p || now()).day].at || ''} ET. The gates are open: go and let the bot do its work.`; msg.hidden = false; } else msg.hidden = true;
}

function seal() {
  const p = S.p || now();
  if (S.sealed[p.day] || !S.pledges.every(Boolean)) return;
  S.sealed[p.day] = { p: S.pledges.slice(), at: clockText(p.h), t: Math.floor(Date.now() / 1000) };
  const keep = Object.fromEntries(Object.entries(S.sealed).sort().slice(-120));          // the last 120 days are plenty
  S.sealed = keep; store.write({ sealed: keep });
  renderOath(); tickClock();
  ritual('seal', $('sealed'), S.scene); ritual('candle', [...$('shrine').querySelectorAll('.candle.lit')].pop() || $('shrine'), S.scene);
  if (S.scene) S.scene.openGates(true);
  document.documentElement.dataset.sealed = '1';
  try { if (!(O && O.reduced()) && navigator.vibrate) navigator.vibrate([30, 40, 60]); } catch (_) { /* no haptics */ }
  postCard();
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const g = (id) => S.items.find((i) => i.id === id) || { stat: '-' };
  const sk = streak(S.sealed, (S.p || now()).day);
  return { v: 1, name: 'Forum', status: { level: S.demo ? 'off' : sealedToday() ? 'ok' : 'warn', label: S.demo ? 'Demo data' : sealedToday() ? 'Oath sealed' : 'Briefing not read' },
    kpis: [{ label: 'Council', value: g('council').stat.slice(0, 18) }, { label: 'VIX', value: g('fear').stat.replace('VIX ', '').slice(0, 10) }, { label: 'Eval room', value: g('eval').stat.replace(' room', '').slice(0, 12) }],
    lines: [(g('calendar').stat ? `Next release: ${g('calendar').stat}` : '').slice(0, 120), `Forum streak: ${sk.cur} market day${sk.cur === 1 ? '' : 's'} (best ${sk.best})`.slice(0, 120)].filter(Boolean),
    t: Math.floor(Date.now() / 1000), open: '#oath', theme: '#13100d', stale_after: 86400 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createForum } = await import('./scene.js');
    S.scene = createForum($('view'), { O });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
    S.scene.onPick((i) => { if (i != null) show(i); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}

function wire() {
  $('start').addEventListener('click', () => show(0));
  $('prev').addEventListener('click', () => show(Math.max(0, S.step - 1)));
  $('next').addEventListener('click', () => show(Math.min(S.items.length, S.step + 1)));
  $('seal').addEventListener('click', seal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && S.step >= 0) show(Math.min(S.items.length, S.step + 1));
    if (e.key === 'ArrowLeft' && S.step > 0) show(S.step - 1);
    if (e.key === 'Escape') show(-1);
  });
  addEventListener('hashchange', () => { if (location.hash === '#oath') show(S.items.length); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });
}

async function main() {
  const q = new URLSearchParams(location.search), t = parseClock(q.get('t'));
  if (t != null) S.clockOverride = t;
  const scene = startScene();
  const [pan, home] = await Promise.all([getJSON('../pantheon/pantheon.json'), getJSON('../home.json')]);
  S.pan = pan && pan.council ? pan : null; S.home = home;
  S.demo = !S.pan || !!S.pan.demo;
  if (!S.pan || !evalOf(S.home)) { const fx = await getJSON('fixture.json'); if (fx) { if (!S.pan) S.pan = fx.pantheon; if (!evalOf(S.home)) { S.home = fx.home; S.demo = true; } } }      // never blank: the recorded eval fills the money card (DEMO tag)
  S.sealed = (store.read().sealed) || {};
  S.p = now();
  S.items = brief(S.pan, S.home, S.p);
  S.desk = desk(S.home, readPlanner(), S.p); renderDesk($('desk'), S.desk);
  try { renderHero($('hero'), S.home, S.p); renderMoney($('money'), S.home, S.pan); renderDay($('day'), S.p); } catch (e) { S.error = 'plus: ' + ((e && e.message) || e); }
  $('demo').hidden = !S.demo;
  if (S.scene) S.scene.setScrolls(S.items);
  const c = S.items[0];
  $('introText').textContent = `${c.stat}: ${c.line} Six tablets on the way to the temple. Read them, seal the oath, and the gates open.`;
  buildDots(); wire(); tickClock(); renderOath();
  setInterval(tickClock, 20000);
  await scene;
  if (S.scene) { S.scene.setScrolls(S.items); tickClock(); }
  if (sealedToday()) { show(S.items.length); if (S.scene) S.scene.openGates(true); document.documentElement.dataset.sealed = '1'; }
  else if (location.hash === '#oath') show(S.items.length);
  S.ready = true;
  document.body.dataset.ready = '1';
  postCard();
}

window.FORUM = {
  state: () => ({ desk: S.desk.map((d) => ({ id: d.id, tone: d.tone, stat: d.stat })), ready: S.ready, demo: S.demo, step: S.step, items: S.items.map((i) => ({ id: i.id, tone: i.tone, stat: i.stat })), p: S.p, sealed: sealedToday(), streak: streak(S.sealed, (S.p || now()).day),
    pledges: S.pledges.slice(), scene: S.scene ? S.scene.stats() : null, error: S.error, read: [...S.read] }),
  show, card, tick: tickClock,
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });
