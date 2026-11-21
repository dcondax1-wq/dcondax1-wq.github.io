/* PANEL FX (day-a11y 2026-11-20, owner: "It needs some 3D, it needs some effects"): one small effects layer for Trading, Business and Planner.
 *   <script src="../trading/panelfx.js?v=1" data-look="night" data-burst="1" defer></script>   (it adds panelfx.css itself, after the paint)
 * What it adds, all AFTER the page has painted (first paint unchanged, nothing changes size: no layout shift):
 *   aurora    a soft particle aurora behind the cards (2D canvas, fixed, 1/3 resolution, ~24 fps, pauses in a hidden tab) once the page has loaded
 *             and the phone is idle; reduced motion / Save-Data / a slow line / small memory = one still frame
 *   glass     the cards become glass with a soft cyan glow (panelfx.css, CSS only)
 *   charts    every line chart (svg path / polyline with a stroke and no fill) gets a glow, and the first one a light trail (olympus/nqfx.js)
 *   roll      the big numbers roll up once when they first come into view (NQFX.roll, else our own), ending on exactly the page's text
 *   reveal    cards below the first screen fade + rise in when scrolled to (transform / opacity only)
 *   burst     data-burst="1": a green win burst from the day's P&L when it is a gain (NQFX.win), once a visit
 * Reduced motion: nothing moves (the aurora is one still frame, no roll, no reveal, no burst). DESIGN's olympus/dashfx.js, when the page
 * loads it, takes the cards (glow / tilt / reveal) and this file only keeps the aurora, the charts and the numbers.
 * window.PANELFX = { state(), stop() } is the test hook. No network, no storage.
 */
(function () {
  'use strict';
  if (window.PANELFX) return;
  var W = window, D = document, me = D.currentScript;
  var LOOK = (me && me.getAttribute('data-look')) || 'nq', BURST = !!(me && me.getAttribute('data-burst'));
  // OLYMPUS NIGHT (owner 2026-11-20, the Jarvis switcher's colours, every dashboard): violet glow, lavender light, a few bright-gold motes
  var COLS = ['157,89,238', '218,203,240', '125,70,200', '241,193,75'];
  var st = { aurora: 'none', rolled: 0, revealed: 0, charts: 0, burst: false, stopped: false, frames: 0 };
  var raf = 0, cv = null, io = null, rio = null, mo = null;

  function reduced() { try { return W.matchMedia('(prefers-reduced-motion: reduce)').matches || (W.OLYMPUS && W.OLYMPUS.reduced && W.OLYMPUS.reduced()); } catch (e) { return false; } }
  function weak() {
    try { var c = navigator.connection || {}, m = navigator.deviceMemory; return !!c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')) || (typeof m === 'number' && m <= 4); } catch (e) { return false; }
  }
  function off() { try { return W.OLYMPUS && W.OLYMPUS.fx && W.OLYMPUS.fx() === 'off'; } catch (e) { return false; } }
  function later(fn) {
    var go = function () { (W.requestIdleCallback || function (f) { return setTimeout(f, 250); })(fn, { timeout: 1500 }); };
    if (D.readyState === 'complete') go(); else W.addEventListener('load', go, { once: true });
  }
  function dashfx() { return !!W.OLYMPUS_DASHFX; }

  // ---------------------------------------------------------------- aurora: soft drifting light blobs + a few motes
  function aurora() {
    if (off()) { st.aurora = 'off'; return; }
    cv = D.createElement('canvas'); cv.className = 'pfx-aurora'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;opacity:0';   // out of the flow before panelfx.css lands: never a layout shift
    D.body.insertBefore(cv, D.body.firstChild);
    var g = cv.getContext('2d'); if (!g) { st.aurora = 'none'; return; }
    var still = reduced() || weak(), S = 3, w = 0, h = 0;
    function size() { w = Math.max(1, Math.round(innerWidth / S)); h = Math.max(1, Math.round(innerHeight / S)); cv.width = w; cv.height = h; }
    size(); W.addEventListener('resize', function () { size(); if (still) draw(0); });
    var blobs = COLS.slice(0, 3).map(function (c, i) { return { c: c, x: [0.2, 0.8, 0.5][i], y: [0.12, 0.3, 0.75][i], r: [0.55, 0.45, 0.5][i], s: [0.00007, 0.00005, 0.00006][i], p: i * 2.1 }; });
    var motes = []; for (var i = 0; i < 26; i++) motes.push({ x: Math.random(), y: Math.random(), v: 0.00002 + Math.random() * 0.00004, a: 0.15 + Math.random() * 0.35, c: COLS[i % COLS.length] });
    function draw(t) {
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (var k = 0; k < blobs.length; k++) {
        var b = blobs[k], x = (b.x + Math.sin(t * b.s + b.p) * 0.12) * w, y = (b.y + Math.cos(t * b.s * 0.8 + b.p) * 0.08) * h, r = b.r * Math.max(w, h);
        var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + b.c + ',.16)'); gr.addColorStop(1, 'rgba(' + b.c + ',0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      for (var m = 0; m < motes.length; m++) {
        var q = motes[m], my = ((q.y - t * q.v) % 1 + 1) % 1;
        g.fillStyle = 'rgba(' + q.c + ',' + (q.a * (0.6 + 0.4 * Math.sin(t * 0.001 + m))).toFixed(3) + ')';
        g.fillRect(q.x * w, my * h, 1, 1);
      }
      g.globalCompositeOperation = 'source-over';
    }
    var last = 0;
    function frame(t) {
      if (st.stopped) return;
      raf = requestAnimationFrame(frame);
      if (D.hidden || t - last < 40) return;          // ~24 fps; nothing while the tab is hidden
      last = t; st.frames += 1; draw(t);
    }
    draw(performance.now());
    requestAnimationFrame(function () { cv.classList.add('on'); });
    if (still) { st.aurora = 'still'; return; }
    st.aurora = 'live'; raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- charts: glow every line, a light trail on the first
  function charts() {
    var lines = Array.prototype.slice.call(D.querySelectorAll('main svg path, main svg polyline')).filter(function (p) {
      if (p.closest('[aria-hidden="true"]') || p.closest('.ag-ic, .icon, button, a')) return false;
      var cs = getComputedStyle(p), sw = parseFloat(cs.strokeWidth) || 0;
      return cs.stroke !== 'none' && sw >= 1.2 && (cs.fill === 'none' || p.getAttribute('fill') === 'none') && (p.getTotalLength ? p.getTotalLength() > 80 : false);
    });
    lines.sort(function (a, b) { return b.getTotalLength() - a.getTotalLength(); });
    lines.slice(0, 12).forEach(function (p) { if (!p.classList.contains('pfx-line')) { p.classList.add('pfx-line'); st.charts += 1; } });   // 12 at most: a glow filter costs GPU on a phone
    var N = W.OLYMPUS_NQFX;
    if (lines.length && N && N.trail && !reduced() && !lines[0].__pfxTrail) { lines[0].__pfxTrail = 1; try { N.trail(lines[0], { seconds: 3.2, color: '#f1c14b' }); } catch (e) { /* the glow stays */ } }
  }

  // ---------------------------------------------------------------- numbers roll up once, when first seen
  var NUM = /^([^\d\-−]*)([\-−]?)([\d,]+(?:\.\d+)?)(.*)$/;
  function rollOne(el) {
    if (el.__pfxRolled) return; el.__pfxRolled = 1;
    var txt = (el.textContent || '').trim(), m = NUM.exec(txt);
    if (!m || txt.length > 16) return;
    var target = parseFloat(m[3].replace(/,/g, '')); if (!isFinite(target) || target === 0) return;
    var dec = (m[3].split('.')[1] || '').length, comma = m[3].indexOf(',') >= 0, t0 = performance.now(), dur = 700;
    st.rolled += 1;
    var fmt = function (v) { var s = v.toFixed(dec); if (comma) { var a = s.split('.'); a[0] = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = a.join('.'); } return m[1] + m[2] + s + m[4]; };
    (function step(t) {
      if ((el.textContent || '').trim() !== txt && el.__pfxLast !== (el.textContent || '').trim()) return;   // the page changed it: leave it
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k >= 1 ? txt : fmt(target * e); el.__pfxLast = el.textContent;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  var ROLL = '.ag-hero-num, .big, .tile > b, .stat b, .ag-stat-value, [data-pfx-roll]';
  // ---------------------------------------------------------------- reveal cards below the first screen
  function watch() {
    var cards = Array.prototype.slice.call(D.querySelectorAll('main .ag-card, main .card'));
    var fold = innerHeight;
    if (!dashfx() && 'IntersectionObserver' in W) {
      rio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('pfx-in'); st.revealed += 1; rio.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      cards.forEach(function (c) { if (c.getBoundingClientRect().top > fold && !c.classList.contains('pfx-wait')) { c.classList.add('pfx-wait'); rio.observe(c); } });
    }
    if (navigator.webdriver) return;                   // automated test runs read the exact numbers: no roll-up there
    if ('IntersectionObserver' in W) {
      io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { rollOne(e.target); io.unobserve(e.target); } }); }, { threshold: 0.6 });
      D.querySelectorAll(ROLL).forEach(function (el) { if (!el.__pfxRolled) io.observe(el); });
    }
  }

  // ---------------------------------------------------------------- a win burst from the day's P&L (Trading)
  function burst() {
    if (!BURST || st.burst || reduced() || off()) return;
    var el = D.querySelector('#todayCard .pos, #todayCard [data-tone="gain"], #todayCard .up');
    if (!el) return;
    var usd = parseFloat(String(el.textContent || '').replace(/[^\d.\-]/g, '')) || 0;
    if (usd <= 0) return;
    var N = W.OLYMPUS_NQFX; if (!N || !N.win) return;
    st.burst = true;
    try { N.ready().then(function () { N.win(el, { usd: usd, bigAt: 500 }); }); } catch (e) { /* a burst is never needed */ }
  }

  function start() {
    // the look half (panelfx.css, next to this file) arrives after the first paint too: never render-blocking
    if (me && me.src && !D.getElementById('pfxCss')) { var l = D.createElement('link'); l.id = 'pfxCss'; l.rel = 'stylesheet'; l.href = me.src.replace(/panelfx\.js[^\/]*$/, 'panelfx.css?v=2'); D.head.appendChild(l); }
    D.documentElement.classList.add('pfx'); D.documentElement.setAttribute('data-pfx-look', LOOK);
    aurora();
    var go = function () { charts(); watch(); burst(); };
    var N = W.OLYMPUS_NQFX;
    if (N && N.ready) N.ready().then(go, go); else go();
    // the page draws its charts and numbers as its data arrives: look again on changes (debounced)
    var t = 0;
    mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { charts(); watch(); burst(); }, 400); });
    mo.observe(D.querySelector('main') || D.body, { childList: true, subtree: true });
  }
  W.PANELFX = {
    state: function () { return { aurora: st.aurora, rolled: st.rolled, revealed: st.revealed, charts: st.charts, burst: st.burst, frames: st.frames, look: LOOK }; },
    stop: function () { st.stopped = true; cancelAnimationFrame(raf); if (mo) mo.disconnect(); if (io) io.disconnect(); if (rio) rio.disconnect(); }
  };
  W.addEventListener('pagehide', function () { W.PANELFX.stop(); });
  later(start);
})();
