// Zenith pages (2026-11-04, JOB 28): the phone glue of zenpagescore.js. Loaded after zenith_money.js. A page with nothing to show yet
// gets the "what you will see here" card with a clearly marked sample; a loading page gets ghost cards; key figures roll up the first
// time a page opens. Read-only: nothing is sent, no route change except the chips' navigation to a page (the hash).
(function () {
  'use strict';
  const ZP = window.ZenithPages;
  if (!ZP || typeof PAGES === 'undefined') return;
  const SKIP = new Set(['today', 'liveview', 'holo', 'settings', 'mission', 'lit', 'atlas', 'blitz', 'board', 'real', 'realtoday', 'deck', 'mind', 'homefull']);
  const txt = (e) => (e && e.textContent ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  let t = 0, tp = 0;
  const info = () => {
    const route = typeof PAGE !== 'undefined' ? PAGE : '', hero = document.querySelector('#page .hero p');
    return { route, title: txt(document.getElementById('title')), desc: hero ? txt(hero).slice(0, 220) : '', go: (r) => { location.hash = '#/' + r; } };
  };
  // loading / key figures soon after a redraw; the sample card only once the page has stayed quiet and thin for ~1.3 s (no flash while data arrives)
  function run() {
    t = 0;
    const el = document.getElementById('page'); if (!el) return;
    const i = info(); if (SKIP.has(i.route)) return;
    try { ZP.prune(el); if (ZP.skeleton(el)) return; ZP.rolls(el, i.route); } catch (e) { console.warn('zenith pages', e); }
  }
  function sample() {
    tp = 0;
    const el = document.getElementById('page'); if (!el) return;
    const i = info(); if (SKIP.has(i.route)) return;
    try { ZP.peek(el, i); } catch (e) { console.warn('zenith pages', e); }
  }
  const soon = (ms) => { clearTimeout(t); t = setTimeout(run, ms == null ? 380 : ms); clearTimeout(tp); tp = setTimeout(sample, 1300 + (ms || 0)); };
  const pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.target.closest && m.target.closest('.zp-peek, .zp-skel')) continue;
      const ch = [...m.addedNodes, ...m.removedNodes];
      if (ch.length && ch.every((n) => n.nodeType === 1 && (n.classList.contains('zp-peek') || n.classList.contains('zp-skel')))) continue;   // only this file's own boxes moved
      soon(); return;
    }
  }).observe(pg, { childList: true, subtree: true });
  addEventListener('hashchange', () => soon(120));
  addEventListener('resize', () => soon(600));
  soon(600);
})();
