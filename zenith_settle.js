/* ZENITH settle (tools/web_public/zenith_settle.js, day-arenas 2026-11-20, DESIGN; the dogfood audit's "Zenith Home jumps ~1.0").
 * Home is drawn by ~15 add-ons that each put their card in after the first draw (zeus_core.js's card at the top, zenith_hero.js, the
 * money / session cards, more.js's strip, polish.js's regrouping ...). On a phone line that was a cascade of jumps over 1-2 s (CLS ~1.0).
 * Here, while Home is starting up (until the full data.json draw has settled, at most 25 s), every burst of layout changes on #page happens
 * behind a still copy of the last drawn frame: the copy stays on screen, the real page is laid out hidden under it, and when #page has been
 * quiet for a moment the copy goes and the finished page shows, in one step, where everything already is. Text-only updates (the clock)
 * never hold. After start-up nothing is held: live updates draw as before.
 *   - the copy is a clone of #page (same id, after it in the document, so getElementById / querySelector still find the real one), its
 *     canvases painted from the real ones, no animations, readable by a screen reader; a tap or a focus on it shows the real page at once
 *   - nothing on another page (#/plan, #/trades ...): only Home, and only during start-up
 *   - window.ZENITH_SETTLE = { holds, released, done } for the tests
 */
(function () {
  'use strict';
  var pg = document.getElementById('page');
  if (!pg || !window.MutationObserver || window.ZENITH_SETTLE) return;
  // inside Jarvis (Zenith in a frame) nothing is held: the frame is a second view whose own start-up the owner does not watch, and its
  // host reads the frame's text at once (tests/test_zenith_mode.py e.)
  var framed = false; try { framed = window.top !== window || document.documentElement.classList.contains('framed'); } catch (e) { framed = true; }
  if (framed) { window.ZENITH_SETTLE = { holds: 0, released: 0, done: true, longest: 0, log: [], framed: true }; return; }
  // MAIN: Home's greeting (polish.js .pl-hi), the largest text = the browser's "main content" (LCP). When it lands under a copy, the copy
  // goes at once (the next burst gets a fresh copy of that frame): the hold used to keep it hidden to the 3 s cap (LCP 4.7 s, 2026-11-21)
  var QUIET = 300, MAX_HOLD = 1500, STARTUP = 25000, t0 = performance.now(), MAIN = '.pl-hi', mainShown = false;
  var S = window.ZENITH_SETTLE = { holds: 0, released: 0, done: false, longest: 0, log: [] };
  var capT = 0, snap = null, ghost = null, quietT = 0, heldAt = 0, drawn = false, settledFull = false, snapQ = 0;
  var css = document.createElement('style');
  css.textContent = '#page.zs-hold { visibility: hidden; }' +
    '.zs-ghost { position: absolute !important; margin: 0 !important; z-index: 2; pointer-events: auto; contain: layout; }' +
    '.zs-ghost, .zs-ghost * { animation: none !important; transition: none !important; }';
  (document.head || document.documentElement).appendChild(css);

  function home() { try { return typeof PAGE === 'undefined' || !PAGE || PAGE === 'today'; } catch (e) { return true; } }
  function full() { try { return typeof D !== 'undefined' && !!D; } catch (e) { return false; } }
  function hasHome() { return !!pg.querySelector(':scope > :not(.skel)'); }
  // the last drawn frame, ready before the next change lands (a clone costs a few ms; taken on the frame after a change)
  function takeSnap() {
    snapQ = 0;
    if (S.done || ghost || !home() || !hasHome()) return;
    var c = pg.cloneNode(true);
    c.classList.add('zs-ghost'); c.classList.remove('zs-hold');     // readable by a screen reader while it stands in (the real page is hidden)
    var fx = c.querySelectorAll('[data-dfx]');                // dashfx: the copy keeps the glass look but nothing in it rolls, rises or tilts
    for (var f = 0; f < fx.length; f++) { if (/(^|\s)glass(\s|$)/.test(fx[f].getAttribute('data-dfx'))) fx[f].setAttribute('data-dfx', 'glass'); else fx[f].removeAttribute('data-dfx'); }
    var a = pg.querySelectorAll('canvas'), b = c.querySelectorAll('canvas');
    for (var i = 0; i < a.length && i < b.length; i++) {
      try { if (a[i].width && a[i].height) { b[i].width = a[i].width; b[i].height = a[i].height; b[i].getContext('2d').drawImage(a[i], 0, 0); } } catch (e) { /* a WebGL or tainted canvas: left blank */ }
    }
    snap = c;
  }
  function queueSnap() { if (!snapQ) snapQ = requestAnimationFrame(function () { snapQ = 0; setTimeout(takeSnap, 0); }); }
  function place(g) {
    g.style.top = '0px'; g.style.left = '0px'; g.style.width = pg.offsetWidth + 'px';
    pg.parentNode.insertBefore(g, pg.nextSibling);
    var r = pg.getBoundingClientRect(), q = g.getBoundingClientRect();
    g.style.top = (r.top - q.top) + 'px'; g.style.left = (r.left - q.left) + 'px';
  }
  function hold() {
    if (ghost) return true;
    if (!snap) return false;
    ghost = snap; snap = null; heldAt = performance.now(); S.holds++;
    place(ghost);
    pg.classList.add('zs-hold');
    capT = setTimeout(release, MAX_HOLD);                       // the hard cap, even when no further change comes
    ghost.addEventListener('pointerdown', release, { once: true }); ghost.addEventListener('focusin', release, { once: true });   // a tap or a focus: the real page at once
    return true;
  }
  function release() {
    clearTimeout(quietT); quietT = 0; clearTimeout(capT); capT = 0;
    if (!ghost) return;
    S.longest = Math.max(S.longest, Math.round(performance.now() - heldAt)); if (S.log.length < 40) S.log.push([Math.round(heldAt), Math.round(performance.now())]);
    pg.classList.remove('zs-hold');
    if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null; S.released++;
    if (full() && settledFull === false) settledFull = performance.now();
    takeSnap();                                              // the frame about to be drawn: ready for the next burst
    if (S.done) stop();
  }
  function stop() { S.done = true; mo.disconnect(); release(); snap = null; }
  // the dashboard FX layer (olympus/dashfx.js) only adds its own classes (dfx-*) and custom properties (--dfx-*): transform / opacity, never layout
  function fxOnly(m) {
    var o = m.oldValue || '', n = m.target.getAttribute(m.attributeName) || '';
    if (m.attributeName === 'class') {
      var a = o.split(/\s+/).filter(Boolean), b = n.split(/\s+/).filter(Boolean), i;
      for (i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0 && a[i].indexOf('dfx-') !== 0) return false;
      for (i = 0; i < b.length; i++) if (a.indexOf(b[i]) < 0 && b[i].indexOf('dfx-') !== 0) return false;
      return true;
    }
    if (m.attributeName === 'style') { var strip = function (x) { return x.replace(/--dfx-[\w-]+\s*:[^;]*;?/g, '').replace(/\s+/g, ''); }; return strip(o) === strip(n); }
    return false;
  }
  // a change that can move something: an element added / removed, or a class / style / hidden change (not text, not the copy itself)
  function moves(list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'attributes') { if (m.target !== pg && !fxOnly(m)) return true; continue; }
      var n, j;
      for (j = 0; j < m.addedNodes.length; j++) { n = m.addedNodes[j]; if (n.nodeType === 1) return true; }
      for (j = 0; j < m.removedNodes.length; j++) { n = m.removedNodes[j]; if (n.nodeType === 1) return true; }
    }
    return false;
  }
  var mo = new MutationObserver(function (list) {
    if (S.done) return;
    var now = performance.now();
    if (now - t0 > STARTUP || (settledFull && now - settledFull > 1500 && !ghost)) { stop(); return; }
    if (!home()) { release(); snap = null; return; }
    if (!drawn) { if (hasHome()) { drawn = true; takeSnap(); } return; }     // the first draw shows at once (no copy of a skeleton)
    if (!moves(list)) { if (!ghost) queueSnap(); return; }
    if (!hold()) { takeSnap(); return; }
    clearTimeout(quietT);
    if (!mainShown && pg.querySelector(MAIN)) { mainShown = true; release(); return; }   // now, not on a timer (start-up scripts keep the thread busy)
    quietT = setTimeout(release, now - heldAt > MAX_HOLD ? 0 : QUIET);
  });
  mo.observe(pg, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('hashchange', function () { release(); snap = null; });
  setTimeout(function () { if (!S.done) stop(); }, STARTUP + 1000);
})();
