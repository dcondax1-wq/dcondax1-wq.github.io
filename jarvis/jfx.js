/* JARVIS FX, the moving part (day-jarvis 2026-11-20, owner via lead: "It needs some 3D, it needs some effects"). Pairs with jfx.css.
 *   roll-ups  a $ number on the ZEUS card, the bot cards and the tiles counts up when it first shows and rolls to its new value when it
 *             changes. The real text never changes (screen readers, tests and copy read the true number): the rolling one is drawn over it
 *             (jfx.css .jfx-roll.on::after, content: attr(data-roll)) and removed when it lands.
 *   tilt      a switcher card leans toward the finger in 3D with a soft glare (pointer down / move); it lets go on lift (a swipe = pointercancel).
 * Starts when the page is idle after Jarvis is ready (no long task at start-up), does nothing with reduced motion or the low-power look.
 * Read only, no network. window.JFX = { ready, rolls } for tests. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var J = window.JFX = { ready: false, rolls: 0 };
  var SEL = '.zeus-b, .zeus-d, .hc-n, .tile .t-v > b, #npnl, #kusd';
  var MONEY = /([+−-]?)\$([\d,]+(?:\.\d+)?)/;
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || root.getAttribute('data-fx') === 'low'; } catch (_) { return false; } };
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };

  // ------------------------------------------------------------------ roll-ups
  function parse(t) {
    var m = MONEY.exec(t || ''); if (!m) return null;
    var v = parseFloat(m[2].replace(/,/g, '')); if (!isFinite(v)) return null;
    return { v: m[1] === '-' || m[1] === '−' ? -v : v, sign: m[1], dec: (m[2].split('.')[1] || '').length, m: m };
  }
  function fmt(p, x) {
    var a = Math.abs(x), s = a.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec });
    var sign = p.sign === '+' ? (x < 0 ? '-' : '+') : p.sign ? p.sign : x < 0 ? '-' : '';
    return sign + '$' + s;
  }
  function roll(el, from, p, text) {
    var to = p.v, t0 = 0, dur = Math.min(1100, 520 + Math.log10(Math.abs(to - from) + 1) * 140);
    el.classList.add('jfx-roll', 'on'); J.rolls++;
    var step = function (now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), x = from + (to - from) * e;
      if (el.textContent !== text) { el.classList.remove('on'); return; }         // redrawn meanwhile: the next pass takes it
      el.setAttribute('data-roll', text.replace(p.m[0], fmt(p, p.dec ? x : Math.round(x))));
      if (k < 1) requestAnimationFrame(step); else { el.classList.remove('on'); el.removeAttribute('data-roll'); }
    };
    requestAnimationFrame(step);
  }
  function scan() {
    var z = d.querySelectorAll('.zeus-card:not([data-dfx])');                  // the kit's glass on the ZEUS card (olympus/dashfx: it wires added nodes)
    for (var j = 0; j < z.length; j++) z[j].setAttribute('data-dfx', 'glass');
    if (reduce()) return;
    var list = d.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i], text = el.textContent;
      if (el.__jfxT === text) continue;
      var p = parse(text), prev = el.__jfxV;
      el.__jfxT = text;
      if (!p) continue;
      el.__jfxV = p.v;
      if (!el.getClientRects().length) continue;                               // hidden: show it as it is
      var from = prev == null ? (Math.abs(p.v) < 20 ? 0 : p.v * 0.35) : prev;
      if (from !== p.v) roll(el, from, p, text);
    }
  }
  var pend = 0;
  function soon() { if (!pend) pend = requestAnimationFrame(function () { pend = 0; scan(); }); }

  // ------------------------------------------------------------------ the switcher cards' 3D tilt
  var cur = null;
  function lean(c, x, y) {
    var r = c.getBoundingClientRect(); if (!r.width) return;
    var px = Math.max(0, Math.min(1, (x - r.left) / r.width)), py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    var base = (c.style.transform || '').replace(/\s*rotateX\([^)]*\)\s*rotateY\([^)]*\)\s*$/, '');
    c.dataset.lean = ' rotateX(' + ((0.5 - py) * 14).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 16).toFixed(2) + 'deg)';   // switcher.js keeps it when the carousel moves
    c.style.transform = base + c.dataset.lean;
    c.style.setProperty('--jgx', (px * 100).toFixed(1) + '%'); c.style.setProperty('--jgy', (py * 100).toFixed(1) + '%');
    if (!c.querySelector(':scope > .jfx-glare')) { var g = d.createElement('i'); g.className = 'jfx-glare'; g.setAttribute('aria-hidden', 'true'); c.appendChild(g); }
    c.classList.add('jfx-tilt'); cur = c;
  }
  function letGo() {
    if (!cur) return;
    cur.style.transform = (cur.style.transform || '').replace(/\s*rotateX\([^)]*\)\s*rotateY\([^)]*\)\s*$/, '');
    delete cur.dataset.lean;
    cur.classList.remove('jfx-tilt'); cur = null;
  }
  function onMove(e) {
    if (reduce()) return;
    var c = e.target && e.target.closest ? e.target.closest('.nx-card') : null;
    if (c !== cur) letGo();
    if (c && (e.type === 'pointerdown' || e.pointerType === 'mouse' || e.buttons)) lean(c, e.clientX, e.clientY);
  }

  function start() {
    if (J.ready) return;
    J.ready = true;
    scan();
    try { new MutationObserver(soon).observe(d.body, { childList: true, subtree: true, characterData: true }); } catch (_) { /* old browser: numbers stay still */ }
    d.addEventListener('pointerdown', onMove, { passive: true });
    d.addEventListener('pointermove', onMove, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { d.addEventListener(t, letGo, { passive: true }); });   // a swipe on a phone ends in pointercancel
  }
  function whenReady(n) {
    if (root.getAttribute('data-ready') === '1' || (n || 0) > 40) idle(start, { timeout: 1500 });
    else setTimeout(function () { whenReady((n || 0) + 1); }, 250);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { whenReady(0); }, { once: true }); else whenReady(0);
})();
