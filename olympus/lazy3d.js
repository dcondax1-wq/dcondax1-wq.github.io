/* OLYMPUS lazy 3D loader (tools/web_public/olympus/lazy3d.js, QA round 6 2026-11-11: the real-phone budget pass).
 * A page's optional 3D module (and three.js behind it, ~165 kB over the wire, ~650 kB to parse) used to be a plain
 * <script type="module"> tag: fetched at once, fighting the first paint for a slow line. This classic script imports it later:
 *
 *   <script src="../olympus/lazy3d.js?v=l2" data-src="nqscene.js?v=a1" data-near="#scene3d" data-skip="lite" data-fail="NQ3D_FAIL" defer></script>
 *
 *   data-src    the module, relative to the page (it registers itself and fires its event exactly as before: the page code is unchanged)
 *   data-near   the element the 3D draws into: the import waits until it is within one screen of the viewport (none / missing = at once)
 *   data-skip   'lite': not loaded while the kit is on low / off (the page keeps its 2D picture, as its own code already does on LITE);
 *               loaded the moment the owner picks HD. 'off': not loaded while 3D effects are Off.
 *   data-fail   a window flag set to 1 when the import fails (the old tag's onerror)
 *   data-event  the event the module fires when it is ready: fired at once (with nothing registered) when the 3D is skipped or fails, so a
 *               page that waits for it (helios: up to 6 s) goes straight to its 2D picture
 * Always after the first paint (two frames after the document is parsed), never while the tab is hidden, never twice, and never in a
 * browser without WebGL (no probe context is made). window.OLYMPUS_LAZY3D = { list(), load(src) } is the test hook.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var W = window, D = document, done = W.__olyLazy3d = W.__olyLazy3d || {};
  var hasGL = null, skips = {};
  function skippedList() { return Object.keys(skips).filter(function (k) { return !done[k]; }); }
  // no WebGL at all (an old or locked-down browser): the module is not fetched. No probe context is made: a context costs GPU memory on
  // an iPhone, and the module itself still handles a context that cannot be created (each page keeps its 2D picture then)
  function webgl() {
    if (hasGL === null) hasGL = !!(W.WebGLRenderingContext || W.WebGL2RenderingContext);
    return hasGL;
  }
  // the page's ready event, with nothing registered: told now and a few times more, because a page may start waiting for it only after its
  // data has loaded (helios waits up to 6 s from then). Every listener checks its own global first, so an extra event is harmless.
  function tell(ev, src) {
    if (!ev) return;
    var fire = function () { if (src && done[src] && done[src].ok) return; try { W.dispatchEvent(new Event(ev)); } catch (e) { /* old browsers */ } };
    fire(); [400, 1200, 2500, 4500].forEach(function (ms) { setTimeout(fire, ms); });
  }
  function load(src, fail, ev) {
    if (done[src]) return done[src].p;
    var url; try { url = new URL(src, D.baseURI).href; } catch (e) { url = src; }
    var rec = done[src] = { src: src, at: Math.round(performance.now()), ok: null, p: null };
    rec.p = import(url).then(function () { rec.ok = true; rec.ms = Math.round(performance.now()); return true; }, function (e) {
      rec.ok = false; rec.err = String(e && e.message || e); if (fail) W[fail] = 1; tell(ev, src);
      try { console.warn('OLYMPUS 3D did not load (the page keeps its 2D picture):', src); } catch (x) { /* nothing */ }
      return false;
    });
    return rec.p;
  }
  // a phone that asked to save data, a slow line or a small memory: the decorative 3D is skipped like LITE (the page keeps its 2D picture).
  // iPhone Safari reports none of these, so it is never skipped there by this rule
  function weak() {
    try {
      var c = navigator.connection || {}, m = navigator.deviceMemory;
      return !!c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')) || (typeof m === 'number' && m <= 4);
    } catch (e) { return false; }
  }
  function skipNow(skip) {
    var O = W.OLYMPUS;
    if (!O || !skip) return false;
    try { return skip === 'off' ? O.fx() === 'off' : skip === 'lite' ? !!O.lite() : false; } catch (e) { return false; }
  }
  function start(el) {
    var src = el.getAttribute('data-src'), near = el.getAttribute('data-near'), skip = el.getAttribute('data-skip') || '', fail = el.getAttribute('data-fail') || '';
    var ev = el.getAttribute('data-event') || '';
    if (!src || done[src]) return;
    var go = function () { if (!done[src]) load(src, fail, ev); };
    var noGL = function () { if (fail) W[fail] = 1; done[src] = { src: src, ok: false, err: 'no WebGL', p: Promise.resolve(false) }; tell(ev, src); };
    var whenVisible = function () {                          // a hidden tab (prerender, a background frame) loads nothing until it is shown
      if (!D.hidden) return go();
      var v = function () { if (!D.hidden) { D.removeEventListener('visibilitychange', v); go(); } };
      D.addEventListener('visibilitychange', v);
    };
    var whenNear = function () {
      var t = near ? D.querySelector(near) : null;
      if (!t || !W.IntersectionObserver || !t.getClientRects().length) return whenVisible();   // no box yet (hidden until the 3D starts): now
      var io = new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { io.disconnect(); whenVisible(); return; }
      }, { rootMargin: '100% 0px 100% 0px' });
      io.observe(t);
    };
    var whenAllowed = function () {
      if (!skipNow(skip) && !(skip && weak())) return webgl() ? whenNear() : noGL();     // the probe only when the 3D would be used
      skips[src] = skip; tell(ev, src);                              // the page stops waiting and keeps its 2D picture
      var O = W.OLYMPUS;                                     // LITE now: wait for the owner to pick HD (never stored by the kit itself)
      if (O && O.onFx) O.onFx(function () { if (!done[src] && !skipNow(skip)) whenNear(); });
    };
    // after the page has loaded and the phone is idle (PERF 2026-11-20: the 3D's parse was a 0.3-1.4 s long task right on top of the
    // first paint): window 'load', then requestIdleCallback (at most 2 s), then two frames
    var raf = W.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    var idle = W.requestIdleCallback ? function (f) { W.requestIdleCallback(f, { timeout: 2000 }); } : function (f) { setTimeout(f, 300); };
    var after = function () { idle(function () { raf(function () { setTimeout(whenAllowed, 0); }); }); };
    if (D.readyState === 'complete') after(); else W.addEventListener('load', after, { once: true });
  }
  W.OLYMPUS_LAZY3D = { skipped: skippedList, list: function () { var o = []; for (var k in done) o.push({ src: k, ok: done[k].ok, at: done[k].at, ms: done[k].ms, err: done[k].err }); return o; },
    load: function (src) { return load(src, ''); } };
  if (me) start(me);
})();
