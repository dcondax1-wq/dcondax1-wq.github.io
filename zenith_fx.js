/* ZENITH FX (tools/web_public/zenith_fx.js, day-arenas 2026-11-20, DESIGN; owner: "it needs some 3D, it needs some effects").
 * The main dashboard wears the kit's dashboard FX layer (olympus/dashfx.js, OLYMPUS NIGHT): Home's cards become glass with the slow
 * violet / gold edge light, the hero leans in 3D under the finger / mouse, the cards below the fold rise in, the big money numbers roll up
 * the first time they show, and an aurora + a few drifting dots live behind everything (paused off screen, none under reduced motion /
 * Save-Data). Zenith's ~15 add-ons draw their own cards, so this file TAGS them (data-dfx) after each Home draw instead of editing each
 * add-on; dashfx.js wires the tags. It waits for zenith_settle.js's start-up copy to go (never tags under a still copy), never tags a card
 * whose ::before is already used (glass draws its edge there), and only tags on Home. Transform / opacity only: nothing moves the layout.
 */
(function () {
  'use strict';
  var pg = document.getElementById('page');
  if (!pg || window.ZENITH_FX) return;
  var ZF = window.ZENITH_FX = { passes: 0, tagged: 0 };
  var t0 = performance.now(), ROLL_FOR = 15000, q = 0;
  var CARDS = '.zeus-card, .zh-hero, .mn-card, .sd-card, .su-accts, .su-acct, .su-bar, .su-week, .su-sun, .pl-now, .pl-quick, .mo-strip, .card, .cl-card';
  var HERO = '.zh-hero';
  var NUMS = '.mn-n, .zh-num, .su-n, .hero-num, .ag-hero-num';
  function home() { try { return typeof PAGE === 'undefined' || !PAGE || PAGE === 'today'; } catch (e) { return true; } }
  function held() { return !!document.querySelector('.zs-ghost') || pg.classList.contains('zs-hold'); }
  function freeBefore(el) { try { var c = getComputedStyle(el, '::before').content; return !c || c === 'none' || c === 'normal'; } catch (e) { return false; } }
  function add(el, tok) {
    var v = (el.getAttribute('data-dfx') || '').split(/\s+/).filter(Boolean);
    if (v.indexOf(tok) >= 0) return false;
    v.push(tok); el.setAttribute('data-dfx', v.join(' ')); ZF.tagged++; return true;
  }
  // after Home's start-up (zenith_settle.js done, 20 s at most): the effects never compete with the first draws for the phone's CPU and never
  // land in the middle of the add-ons' own changes (with them during start-up the layout shift went 0.02 -> 0.12)
  function settled() { var S = window.ZENITH_SETTLE; return !S || S.done || performance.now() > 20000; }
  function pass() {
    q = 0;
    if (!home()) return;
    if (held() || !settled()) { q = setTimeout(pass, 500); return; }
    css(); bgLayer();
    ZF.passes++;
    var vh = window.innerHeight || 800, any = false, cards = pg.querySelectorAll(CARDS);
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i], r = el.getBoundingClientRect();
      if (!r.height || r.height < 40 || el.closest('[data-dfx~="glass"]') && !el.matches('[data-dfx~="glass"]')) continue;   // glass on the outer card only
      if (!el.hasAttribute('data-dfx-zf')) {
        el.setAttribute('data-dfx-zf', '1');
        if (freeBefore(el) && add(el, 'glass')) any = true;
        if (r.top > vh && add(el, 'reveal')) any = true;
      }
    }
    var h = pg.querySelector(HERO); if (h && add(h, 'tilt')) any = true;
    if (performance.now() - t0 < ROLL_FOR) {
      var ns = pg.querySelectorAll(NUMS);
      for (var j = 0; j < ns.length; j++) if (!ns[j].children.length && /\d/.test(ns[j].textContent) && add(ns[j], 'roll')) any = true;
    }
    if (any && window.OLYMPUS_DASHFX) window.OLYMPUS_DASHFX.wire(pg);
  }
  function soon() { if (!q) q = setTimeout(pass, 250); }
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) if (ms[i].addedNodes[j].nodeType === 1) { soon(); return; }
  }).observe(pg, { childList: true, subtree: true });
  window.addEventListener('hashchange', soon);
  // the aurora + dots behind everything: its own fixed layer (not <body data-dfx-bg>: that makes <body> a positioned box, which moved
  // Zenith's absolutely placed parts at start-up: a 0.03 layout shift)
  // the layer's stylesheet is fetched here, after start-up: a <link> in <head> would hold Zenith's first paint until it downloads
  // (tests/test_zenith_mode.py h.: a slow site must still open from its saved copy in under 5.5 s)
  function css() {
    if (document.querySelector('link[href*="olympus/dashfx.css"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'olympus/dashfx.css?v=d1'; document.head.appendChild(l);
  }
  function bgLayer() {
    if (document.getElementById('znBg')) return;
    var bgl = document.createElement('div'); bgl.id = 'znBg'; bgl.setAttribute('aria-hidden', 'true'); bgl.setAttribute('data-dfx', 'bg');
    bgl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden';
    document.body.appendChild(bgl);
    if (window.OLYMPUS_DASHFX) window.OLYMPUS_DASHFX.wire(bgl);
  }
  if (document.readyState === 'complete') soon(); else window.addEventListener('load', soon, { once: true });
})();
