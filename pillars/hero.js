// THE FOUR PILLARS hero (day-pillars2 2026-11-24; owner: make them impossible to miss). Upgrades the static hero markup that the Olympus
// Home (gate/), Zenith (/) and the NQ page carry at their top: live words on the 4 chips (pillarscore.chips), a small 3D colonnade
// (pillars-scene.js, only when it scrolls into view and the phone is not in low power / reduced motion; else 2D CSS columns), a tap opens
// the pillar, and a "What's new: The Four Pillars" toast ONCE per phone (localStorage oly.new.pillars).
// Data: what the page already holds (window.NQ.S on the NQ page: no fetch there), else the site's own home.json (one small read, the
// same file the page reads). It never polls the PC feed. createElement / textContent only. Read only.
import * as P from './pillarscore.js?v=p3';
import * as PF from './pillarsfeed.js?v=p3';

const BASE = new URL('./', import.meta.url);
const NEW_KEY = 'oly.new.pillars';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
// 2D only when the phone asks for less (reduced motion, Save-Data, ?lite=1, <= 2 cores / 2 GB); the temple steps itself down on slow frames
const low = () => { try { if (/[?&]fx=(3d|hq)/.test(location.search)) return false; return matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]lite=1/.test(location.search) || (+navigator.hardwareConcurrency > 0 && +navigator.hardwareConcurrency <= 2) || (+navigator.deviceMemory > 0 && +navigator.deviceMemory <= 2) || !!(navigator.connection && navigator.connection.saveData); } catch (_) { return true; } };
const FILL = { lit: 1, atlas: 1, blitz: .32, of: .06 };

export function chipsInto(box, chips) {
  box.replaceChildren();
  for (const c of chips) {
    const a = el('a', 'pc'); a.href = new URL('./#' + c.id, BASE).href; a.style.setProperty('--c', c.color); a.dataset.p = c.id;
    a.setAttribute('aria-label', `${c.name}: ${c.word}, ${c.line}`);
    const w = el('span'); w.append(el('i', c.level), document.createTextNode(c.word.split(' · ')[0]));
    a.append(el('b', null, c.name), w, el('small', null, c.line.replace('waiting for the PC', 'PC: waiting').replace('recorder not set up', 'not set up'))); box.append(a);
  }
}
function flatCols(stage, model) {
  const cols = el('div', 'ph-cols');
  for (const m of model) { const i = el('i'); i.style.setProperty('--c', m.color); i.style.setProperty('--f', Math.round(fillOf(m) * 100) + '%'); cols.append(i); }
  stage.replaceChildren(cols); stage.dataset.mode = '2d';
}
const fillOf = (m) => (m.id === 'of' ? Math.max(.06, (m.tick && m.tick.frac) || 0) : m.state === 'off' ? .32 : 1);

async function stage3d(stage, model) {
  try {
    const Sc = await import('./pillars-scene.js?v=c1');
    const c = el('canvas'); c.setAttribute('aria-hidden', 'true'); stage.replaceChildren(c);
    const band = !!stage.closest('.band');                                   // the Home header: a jewel-sized temple over the page (clear backdrop)
    const api = await Sc.create(c, model.map((m) => ({ id: m.id, name: m.name, color: m.color, fill: fillOf(m), dim: m.state === 'off' })),
      { compact: true, localFirst: true, alpha: band, inset: band ? 0 : .24, pad: band ? 1.2 : 1, low: Sc.isLowPower(window), reduce: false, onPick: (id) => { location.href = new URL('./#' + (id || 'lit'), BASE).href; } });
    if (!api) { flatCols(stage, model); return null; }
    stage.dataset.mode = '3d'; if (band) document.documentElement.setAttribute('data-temple3d', '1');   // the Home's line-drawn temple steps aside (olympus/home-fx.js)
    return api;
  } catch (_) { flatCols(stage, model); return null; }
}

function toast() {
  try { if (localStorage.getItem(NEW_KEY)) return null; localStorage.setItem(NEW_KEY, String(Date.now())); } catch (_) { return null; }   // once per phone
  const t = el('div', 'pnew'); t.setAttribute('role', 'status'); t.id = 'pillarsNew';
  const d = el('div'); d.append(el('b', null, "What's new: The Four Pillars"), el('br'), document.createTextNode('Your four pillars, live, on one page.'));
  const go = el('a', null, 'Open'); go.href = BASE.href;
  const x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 400); };
  x.addEventListener('click', close); t.append(d, go, x); document.body.append(t);
  setTimeout(close, 12000);
  return t;
}

/** box = a .phero section (static markup inside); opts.getState() -> { home, biz, lite } (the page's own data), else home.json */
export async function mount(box, opts) {
  if (!box || box.dataset.live === '1') return null;
  box.dataset.live = '1';
  // its look: a page that does not link hero.css (NQ: its HTML is at its first-paint budget) gets it here, and a hidden frame shows once styled
  if (![...document.styleSheets].some((x) => /pillars\/hero\.css/.test(x.href || '')) && !document.getElementById('pheroCss')) {
    await new Promise((ok) => { const l = document.createElement('link'); l.id = 'pheroCss'; l.rel = 'stylesheet'; l.href = new URL('./hero.css?v=c2', BASE).href; l.onload = l.onerror = ok; document.head.append(l); setTimeout(ok, 3000); });
  }
  if (box.dataset.auto === 'nq') box.hidden = false;
  // Zenith (the site root) keeps its shell across routes: the hero belongs on Today only
  if (document.getElementById('znNq')) { const vis = () => { box.hidden = !!location.hash && !/^#\/(today)?\/?$/.test(location.hash); }; vis(); addEventListener('hashchange', vis); }
  const o = opts || {};
  let state = typeof o.getState === 'function' ? o.getState() : null;
  if (!state) {
    let home = null;
    try { const r = await fetch(new URL('../home.json', BASE), { cache: 'no-cache' }); home = r.ok ? await r.json() : null; } catch (_) { home = null; }
    state = { home, biz: null, lite: null };
  }
  const build = (s) => PF.modelFrom({ data: { pillars: P.PILLAR_BASE }, home: (s && s.home) || {}, biz: (s && s.biz) || null, payday: null, lite: (s && s.lite) || null,
    nowS: Date.now() / 1000, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null });
  let model = build(state);
  const chips = box.querySelector('.ph-chips'); if (chips) chipsInto(chips, P.chips(model));
  const stage = box.querySelector('.ph-stage');
  if (stage) {
    if (low() || !('IntersectionObserver' in window)) flatCols(stage, model);
    else {
      flatCols(stage, model);                                            // instant 2D columns, the 3D replaces them once on screen
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); stage3d(stage, model); } }, { rootMargin: '80px' });
      io.observe(stage);
    }
  }
  box.dataset.ready = state.lite ? 'post' : 'site';
  const redraw = () => { if (typeof o.getState === 'function') { model = build(o.getState()); if (chips) chipsInto(chips, P.chips(model)); box.dataset.ready = (o.getState() || {}).lite ? 'post' : 'site'; } };
  if (typeof o.getState === 'function') {
    let n = 0; const wait = setInterval(() => { n += 1; const s = o.getState(); if ((s && s.lite) || n > 20) { clearInterval(wait); redraw(); } }, 1000);
    addEventListener('nq-refresh', () => setTimeout(redraw, 1500));
  }
  if (o.toast !== false) setTimeout(toast, 1500);
  return { redraw };
}

// auto-mount: every .phero[data-auto] on the page (the NQ page hands its own state)
for (const box of document.querySelectorAll('.phero[data-auto]')) {
  const nq = box.dataset.auto === 'nq';
  mount(box, { ...(nq ? { getState: () => (window.NQ && window.NQ.S) || {} } : {}), toast: box.dataset.toast !== '0' });   // the toast: Home + Zenith only
  if (nq) import('./livefx.js?v=h1').then((m) => m.watch()).catch(() => {});   // the NQ page's number glow rides with the hero (one loader in its HTML)
}
