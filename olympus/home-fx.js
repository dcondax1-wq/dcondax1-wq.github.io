/* OLYMPUS HOME FX (night-effects, 2026-11-20): the living home. The Gate (gate/) and the Doors (hub/doors.html); styles in olympus/home-fx.css.
 * Owner: "do a huge run of effects, add-ons, 3D stuff ... make it look good, not like a shitty AI built it, intro effects, displays";
 * and "lag, glitches" must go. So everything here is cheap and sleeps:
 *   hero    ONE canvas 2D behind the title: a warm sun, three slow light rays, a line-drawn temple that builds up from its steps, and gold
 *           dust in three depths. Parallax on scroll and under the finger (and the tilt of the phone where the browser gives it without
 *           asking: Android; iOS asks for a permission, so an iPhone gets scroll + touch). Pre-rendered sprites: a frame is ~20 drawImage calls.
 *   loop    ONE requestAnimationFrame loop for the page (hero + count-ups). It stops when the tab is hidden, when the hero is off screen and
 *           nothing counts; it draws at 30 fps after the intro and 15 fps after 25 s without a touch. Device pixels capped at 2.
 *   guard   if frames come slower than ~20 fps for 2 s (an old phone, low power) the hero freezes on a still frame (html[data-hfx="still"]).
 *           Reduced motion, 3D effects Off ('jfx' = off) or localStorage 'oly.homefx' = 'still': one still frame, no intro, no loop.
 *           'oly.homefx' = 'off': nothing at all (the plain revamp look).
 *   doors   a light under the finger, a glint across the glass, a spring release (home-fx.css) and a faint emblem per door.
 *   now     the Gate's Right now: numbers count up to their new value, a ring shows the time to the next trade window (or left in it).
 *   sound   olympus/sfx.js is loaded when the page is idle, only if Sound is switched ON in Settings ('olympus.sfx' s = true, not muted):
 *           then a door press plays its soft 'tap'. Otherwise the home loads no sound engine (its first-tap start was a 217 ms task at 4x).
 * Read only. ES5 (Safari 16). window.OLYMPUS_HOMEFX = { state(), still(), go() } for tests. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var W = window, d = document, R = d.documentElement;
  if (W.OLYMPUS_HOMEFX) return;
  function ls(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  var MODE = ls('oly.homefx') || 'on';
  if (MODE === 'off') { R.classList.remove('hfx', 'hfx-intro'); return; }
  var FXL = ls('jfx') || '';
  var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches) || FXL === 'off' || MODE === 'still'; }
  var LITE = FXL === 'low';
  function isLight() { return R.getAttribute('data-oly-scheme') === 'light'; }
  var PAGE = R.getAttribute('data-oly-page') || '';
  /* automation (navigator.webdriver) reads the Right now numbers at once: no count-up there unless ?hfx=1 (the warp's rule) */
  var AUTO = !!(W.navigator && W.navigator.webdriver) && !/[?&]hfx=1/.test(W.location.search || '');
  R.classList.add('hfx');
  if (reduced() || R.hasAttribute('data-oly-warp')) R.classList.remove('hfx-intro');   // the warp has its own arrival
  /* hfx-intro stays on: removing it later restyles the whole page (a 70 ms task on a slow phone); the stagger only targets fixed sections */
  var ST = { frames: 0, draws: 0, still: false, why: '', hero: false, tweens: 0, slow: 0, maxDraw: 0 };
  var now = function () { return W.performance && performance.now ? performance.now() : Date.now(); };
  /* cities3 2026-11-20 (owner: "intro skippable"): the first tap, key or scroll in the first 1.3 s finishes every intro animation at once
     (Web Animations finish(): no class change, so no restyle of the page) */
  if (R.classList.contains('hfx-intro') && d.getAnimations) {
    var t0i = now(), skipped = false;
    var skip = function () {
      if (skipped || now() - t0i > 1300) return; skipped = true;
      try { d.getAnimations().forEach(function (a) { var n = a.animationName || ''; if (/^hfx-(rise|up|draw|spin)$/.test(n) && a.playState !== 'finished') a.finish(); }); } catch (e) { /* old browser: it ends by itself */ }
      ST.introSkipped = true;
    };
    ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach(function (ev) { d.addEventListener(ev, skip, { passive: true, once: true, capture: true }); });
  }

  /* ------------------------------------------------------------------ the one loop */
  var raf = 0, heroOn = false, hero = null, tweens = [];
  function want() { return !d.hidden && ((hero && heroOn && !ST.still) || tweens.length > 0); }
  function kick() { if (!raf && want()) raf = W.requestAnimationFrame(tick); }
  function tick(t) {
    raf = 0; ST.frames++;
    if (tweens.length) runTweens(t);
    if (hero && heroOn && !ST.still) hero.frame(t);
    if (want()) raf = W.requestAnimationFrame(tick);
  }
  d.addEventListener('visibilitychange', function () { if (hero) hero.reset(); kick(); });

  /* ------------------------------------------------------------------ hero */
  function Hero(host) {
    var cv = d.createElement('canvas'), g = cv.getContext('2d');
    cv.setAttribute('aria-hidden', 'true'); host.appendChild(cv);
    var w = 0, h = 0, dpr = 1, sprite = null, glow = null, beam = null, temple = null, T = { w: 0, h: 0 }, motes = [];
    var t0 = 0, last = 0, lastDraw = 0, lastTouch = now(), sy = 0, px = 0, py = 0, tx = 0, ty = 0, slow = 0, n = 0;
    function gold(a) { return isLight() ? 'rgba(150,108,40,' + a + ')' : 'rgba(220,182,98,' + a + ')'; }
    function canvas(cw, ch) { var c = d.createElement('canvas'); c.width = Math.max(1, Math.round(cw)); c.height = Math.max(1, Math.round(ch)); return c; }
    function build() {
      var s = 32 * dpr, c = canvas(s, s), x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, isLight() ? 'rgba(255,250,235,1)' : 'rgba(255,240,205,1)'); gr.addColorStop(0.28, gold(0.55)); gr.addColorStop(1, gold(0));
      x.fillStyle = gr; x.fillRect(0, 0, s, s); sprite = c;
      var G = 256; c = canvas(G, G); x = c.getContext('2d'); gr = x.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
      gr.addColorStop(0, gold(isLight() ? 0.22 : 0.30)); gr.addColorStop(0.45, gold(isLight() ? 0.08 : 0.10)); gr.addColorStop(1, gold(0));
      x.fillStyle = gr; x.fillRect(0, 0, G, G); glow = c;
      c = canvas(64, 8); x = c.getContext('2d'); gr = x.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, gold(0)); gr.addColorStop(0.5, gold(isLight() ? 0.07 : 0.085)); gr.addColorStop(1, gold(0));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 8); beam = c;
      buildTemple();
      var N = LITE ? 22 : (w < 500 ? 42 : 60); motes = [];
      for (var i = 0; i < N; i++) motes.push(mote(true));
    }
    function mote(any) {
      var z = Math.random(), depth = z < 0.5 ? 0.35 : z < 0.85 ? 0.7 : 1;   // far, mid, near
      return { x: Math.random() * w, y: any ? Math.random() * h : h + 10, z: depth, s: (2.2 + Math.random() * 3.4) * (0.55 + depth * 0.6),
        vy: -(3 + Math.random() * 9) * (0.5 + depth), sw: 4 + Math.random() * 10, f: 0.0003 + Math.random() * 0.0006, ph: Math.random() * 6.3, a: 0.25 + Math.random() * 0.55 };
    }
    function buildTemple() {   // a Doric temple in fine gold lines, drawn once
      var tw = Math.min(w * 0.56, 300), th = tw * 0.8, c = canvas(tw * dpr, th * dpr), x = c.getContext('2d'), L = isLight();
      T = { w: tw, h: th, c: c };
      x.scale(dpr, dpr); x.lineJoin = 'round'; x.lineCap = 'round';
      var body = x.createLinearGradient(0, 0, 0, th); body.addColorStop(0, gold(L ? 0.10 : 0.09)); body.addColorStop(1, gold(0.0));
      function P(pts, fill, a, lw) { x.beginPath(); x.moveTo(pts[0] * tw, pts[1] * th); for (var i = 2; i < pts.length; i += 2) x.lineTo(pts[i] * tw, pts[i + 1] * th); x.closePath();
        if (fill) { x.fillStyle = fill; x.fill(); } x.strokeStyle = gold(a); x.lineWidth = lw || 1.1; x.stroke(); }
      function Rc(x0, y0, x1, y1, a, fill) { P([x0, y0, x1, y0, x1, y1, x0, y1], fill, a); }
      P([0.03, 0.30, 0.5, 0.07, 0.97, 0.30], body, 0.75, 1.3);          // the pediment
      P([0.13, 0.275, 0.5, 0.115, 0.87, 0.275], null, 0.35, 0.9);       // the tympanum
      Rc(0.02, 0.30, 0.98, 0.345, 0.7, body);                            // cornice
      Rc(0.05, 0.345, 0.95, 0.40, 0.55);                                 // architrave
      for (var k = 0; k < 14; k++) { var gx = 0.07 + k * 0.0657; Rc(gx, 0.355, gx + 0.022, 0.39, 0.3); }   // triglyphs
      for (var i = 0; i < 6; i++) {
        var cx = 0.12 + i * 0.152, cw = 0.07;
        Rc(cx - cw * 0.75, 0.40, cx + cw * 0.75, 0.425, 0.6);           // capital
        P([cx - cw / 2, 0.425, cx + cw / 2, 0.425, cx + cw * 0.56, 0.86, cx - cw * 0.56, 0.86], body, 0.62, 1.1);   // shaft, a little entasis
        x.strokeStyle = gold(0.22); x.lineWidth = 0.8;
        x.beginPath(); x.moveTo((cx - cw * 0.18) * tw, 0.435 * th); x.lineTo((cx - cw * 0.19) * tw, 0.855 * th); x.moveTo(cx * tw, 0.435 * th); x.lineTo(cx * tw, 0.855 * th);
        x.moveTo((cx + cw * 0.18) * tw, 0.435 * th); x.lineTo((cx + cw * 0.19) * tw, 0.855 * th); x.stroke();   // flutes
      }
      Rc(0.03, 0.86, 0.97, 0.895, 0.6, body); Rc(0.015, 0.895, 0.985, 0.93, 0.5); Rc(0.0, 0.93, 1.0, 0.965, 0.42);   // the three steps
    }
    function size() {
      var r = host.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, W.devicePixelRatio || 1); if (LITE) dpr = Math.min(dpr, 1.5);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); build();
    }
    function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return 1 - Math.pow(1 - x, 3); }
    function draw(t, dt) {
      var L = isLight(), it = ease((t - t0) / 1500), tt = ease((t - t0 - 250) / 1700), s = Math.min(sy, h * 1.2);
      px += (tx - px) * Math.min(1, dt * 0.004); py += (ty - py) * Math.min(1, dt * 0.004);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      var sunX = w * 0.80 + px * 10, sunY = h * 0.16 + s * 0.55 + py * 6, G = Math.max(w, 420) * 1.15, br = 0.86 + 0.14 * Math.sin(t * 0.0007);
      g.globalCompositeOperation = L ? 'source-over' : 'lighter';
      g.globalAlpha = br * it; g.drawImage(glow, sunX - G / 2, sunY - G / 2, G, G);
      for (var i = 0; i < 3; i++) {          // light rays from the sun, swaying a degree or two
        g.save(); g.translate(sunX, sunY); g.rotate(1.95 + i * 0.26 + Math.sin(t * 0.00022 + i * 1.7) * 0.035 + px * 0.02);
        g.globalAlpha = (0.5 + 0.3 * Math.sin(t * 0.0005 + i)) * it; g.drawImage(beam, 0, -(20 + i * 10), h * 0.95, 40 + i * 20); g.restore();
      }
      g.globalCompositeOperation = 'source-over';
      if (T.c) {                              // the temple rises from its steps, then sits a little farther away than the page (parallax)
        var tw = T.w, th = T.h, x0 = w - tw * 0.94 - px * 7, y0 = h * 0.035 + s * 0.42 - py * 4, rh = th * tt;
        if (rh > 1) { g.globalAlpha = (L ? 0.4 : 0.34) * (0.4 + 0.6 * tt); g.drawImage(T.c, 0, (th - rh) * dpr, tw * dpr, rh * dpr, x0, y0 + th - rh, tw, rh); }
      }
      g.globalCompositeOperation = L ? 'source-over' : 'lighter';
      for (var k = 0; k < motes.length; k++) {
        var m = motes[k];
        m.y += m.vy * dt / 1000; m.x += Math.cos(t * m.f + m.ph) * m.sw * dt / 1000;
        if (m.y < -12 || m.x < -12 || m.x > w + 12) { motes[k] = m = mote(false); m.y = h + 6; }
        var a = m.a * (0.55 + 0.45 * Math.sin(t * m.f * 3 + m.ph)) * it * (L ? 0.8 : 1), mx = m.x + px * 16 * m.z, my = m.y - py * 10 * m.z + s * (1 - m.z) * 0.6;
        if (a <= 0.01) continue;
        g.globalAlpha = a; g.drawImage(sprite, mx - m.s, my - m.s, m.s * 2, m.s * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      ST.draws++;
    }
    var api = {
      frame: function (t) {
        if (!t0) { t0 = t; last = t; lastDraw = 0; }
        var dt = Math.min(64, t - last); last = t; n++;
        var intro = t - t0 < 2200, idle = now() - lastTouch > 25000, gap = intro ? 0 : idle ? 62 : 30;
        if (n > 20 && !intro) {               // the guard: rAF itself slower than ~20 fps for 2 s -> still
          if (dt > 48) slow++; else slow = Math.max(0, slow - 2);
          ST.slow = slow;
          if (slow > 40) { api.still('slow'); return; }
        }
        if (lastDraw && t - lastDraw < gap) return;
        var ddt = lastDraw ? Math.min(80, t - lastDraw) : 16; lastDraw = t;
        var c0 = now(); draw(t, ddt); var cost = now() - c0;
        if (n > 5 && cost > ST.maxDraw) ST.maxDraw = Math.round(cost * 10) / 10;
        if (cost > 24 && !intro) { slow += 3; }
      },
      still: function (why) { ST.still = true; ST.why = why || ''; R.setAttribute('data-hfx', 'still'); draw((t0 || 0) + 4000, 0); },
      reset: function () { last = now(); lastDraw = 0; },
      size: function () { size(); if (ST.still) draw(t0 + 4000, 0); },
      scroll: function (y) { sy = y; },
      lean: function (x, y) { tx = x; ty = y; lastTouch = now(); },
      touch: function () { lastTouch = now(); }
    };
    size();
    return api;
  }

  function startHero() {
    var main = d.querySelector('.g-main, .dr-main'); if (!main || !d.body || !W.HTMLCanvasElement) return;
    var host = d.createElement('div'); host.className = 'hfx-hero'; host.setAttribute('aria-hidden', 'true');
    d.body.insertBefore(host, d.body.firstChild);
    try { hero = Hero(host); } catch (e) { hero = null; host.parentNode.removeChild(host); return; }
    ST.hero = true;
    R.setAttribute('data-hfx', reduced() ? 'still' : LITE ? 'lite' : 'on');
    if (W.MutationObserver) new MutationObserver(function () { hero.size(); kick(); }).observe(R, { attributes: true, attributeFilter: ['data-oly-scheme'] });   // a new look: new colours
    if (reduced()) { hero.still(MODE === 'still' ? 'setting' : FXL === 'off' ? 'fx-off' : 'reduced-motion'); return; }
    heroOn = true;
    if (W.IntersectionObserver) new IntersectionObserver(function (es) { heroOn = es[es.length - 1].isIntersecting; if (heroOn) { hero.reset(); kick(); } }).observe(host);
    var sy = 0, pend = false;
    W.addEventListener('scroll', function () { sy = W.pageYOffset || 0; if (!pend) { pend = true; W.requestAnimationFrame(function () { pend = false; hero.scroll(sy); hero.touch(); }); } }, { passive: true });
    var lean = function (x, y) { hero.lean(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))); kick(); };
    W.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') lean(e.clientX / W.innerWidth * 2 - 1, e.clientY / W.innerHeight * 2 - 1); }, { passive: true });
    W.addEventListener('touchstart', function (e) { var p = e.touches && e.touches[0]; if (p) lean(p.clientX / W.innerWidth * 2 - 1, p.clientY / W.innerHeight * 2 - 1); }, { passive: true });
    W.addEventListener('touchend', function () { lean(0, 0); }, { passive: true });
    W.addEventListener('deviceorientation', function (e) {   // Android gives it freely; iOS only after a permission prompt (not asked: scroll + touch instead)
      if (e.gamma == null || e.beta == null) return; hero.lean(e.gamma / 30, (e.beta - 45) / 40);
    }, { passive: true });
    var rz = 0; W.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { hero.size(); kick(); }, 180); });
    kick();
  }

  /* ------------------------------------------------------------------ title letters */
  function splitTitle() {
    var h = d.querySelector('.g-title, .dr-title'); if (!h || h.getAttribute('data-hfx')) return;
    var txt = h.textContent || ''; if (!txt || txt.length > 24 || h.children.length) return;
    h.setAttribute('data-hfx', '1'); h.setAttribute('aria-label', txt);
    while (h.firstChild) h.removeChild(h.firstChild);
    for (var i = 0; i < txt.length; i++) { var s = d.createElement('span'); s.className = 'hfx-l'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', i); s.textContent = txt.charAt(i); h.appendChild(s); }
    if (R.classList.contains('hfx-intro')) h.style.animation = 'none';   // the letters carry the intro now, not the whole title
  }

  /* ------------------------------------------------------------------ doors: emblem, light under the finger, glint, spring */
  var GLYPH = {
    zeus: ['M13.5 2 4.5 13.5h6.6L9.6 22l9.4-12.4h-6.7z'],
    money: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 6.6a5.4 5.4 0 1 0 0 10.8a5.4 5.4 0 1 0 0-10.8z', 'M12 9v6'],
    kalshi: ['M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3z', 'M12 7.2l4.1 2.4v4.8L12 16.8l-4.1-2.4V9.6z'],
    more: ['M3 8.2 12 3.4l9 4.8z', 'M4.5 8.2h15', 'M6.4 10.6v7.6M10.1 10.6v7.6M13.9 10.6v7.6M17.6 10.6v7.6', 'M4 20.4h16']
  };
  var NS = 'http://www.w3.org/2000/svg';
  function dress() {
    var ds = d.querySelectorAll('.g-dr, .dr-door');
    for (var i = 0; i < ds.length; i++) {
      var a = ds[i], k = a.getAttribute('data-door'); if (a.querySelector('.hfx-lit')) continue;
      var lit = d.createElement('i'); lit.className = 'hfx-lit'; lit.setAttribute('aria-hidden', 'true'); a.appendChild(lit);
      if (GLYPH[k]) {
        var s = d.createElementNS(NS, 'svg'); s.setAttribute('class', 'hfx-glyph'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
        GLYPH[k].forEach(function (p) { var e = d.createElementNS(NS, 'path'); e.setAttribute('d', p); s.appendChild(e); });
        a.appendChild(s);
      }
    }
  }
  var PRESS = '.g-dr, .dr-door, .g-q, .g-hub, .dr-row, a.g-fact, a.g-acct', pressed = null, pressAt = 0;
  function release() { if (pressed) { var p = pressed; pressed = null; p.classList.remove('hfx-press'); } }
  function sfx(name) { try { var S = W.OLYMPUS_SFX; if (S && S.play && !(W.OLYMPUS_QUIET && W.OLYMPUS_QUIET())) S.play(name); } catch (e) { /* silent */ } }
  d.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var a = e.target && e.target.closest ? e.target.closest(PRESS) : null; if (!a) return;
    release(); pressed = a; pressAt = now();
    if (reduced()) return;
    a.classList.add('hfx-press');
    if (a.classList.contains('g-dr') || a.classList.contains('dr-door')) {
      var r = a.getBoundingClientRect();
      a.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px'); a.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
      a.classList.remove('hfx-glint'); void a.offsetWidth; a.classList.add('hfx-glint');
      setTimeout(function () { a.classList.remove('hfx-glint'); }, 820);
      sfx('tap');
    }
    if (hero) hero.touch();
  }, { passive: true });
  ['pointerup', 'pointercancel', 'dragstart'].forEach(function (t) { d.addEventListener(t, function () {
    var p = pressed; if (!p) return; var held = now() - pressAt;   // a quick tap still shows the press for a beat before the spring
    if (held < 90) setTimeout(function () { if (pressed === p) release(); }, 90 - held); else release();
  }, { passive: true }); });
  W.addEventListener('scroll', release, { passive: true });
  W.addEventListener('pageshow', function () { release(); });   // back from the next page (bfcache): no stuck press

  /* ------------------------------------------------------------------ Right now: count-up, the trade-window ring */
  var seen = {};
  var MONEY = /^([+−-]?)\$([\d,]+)$/;
  function fmt(sign, v) { return sign + '$' + Math.round(v).toLocaleString('en-US'); }
  function runTweens(t) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var q = tweens[i]; if (!q.t0) q.t0 = t;
      var x = Math.min(1, (t - q.t0) / q.ms), e = 1 - Math.pow(1 - x, 4), v = q.from + (q.to - q.from) * e;
      if (q.el.isConnected === false) { tweens.splice(i, 1); continue; }
      q.el.textContent = x >= 1 ? q.final : fmt(q.sign, v);
      if (x >= 1) tweens.splice(i, 1);
    }
    ST.tweens = tweens.length;
  }
  function countUps(box, sel) {
    var vs = box.querySelectorAll(sel || '.g-fv');
    for (var i = 0; i < vs.length; i++) {
      var el = vs[i], txt = (el.textContent || '').trim(), m = MONEY.exec(txt); if (!m) continue;
      var cell = el.parentNode, lab = cell && cell.querySelector('.g-fl, .g-an, .g-mtl'), sub = cell && cell.querySelector('.g-fsub');
      var key = (cell && cell.getAttribute('data-go') || '') + '|' + (lab ? lab.textContent : '') + '|' + (sub ? sub.textContent : '');
      var to = parseFloat(m[2].replace(/,/g, '')) * (m[1] === '-' || m[1] === '−' ? -1 : 1), from = key in seen ? seen[key] : 0;
      seen[key] = to;
      if (from === to || reduced() || AUTO || Math.abs(to) < 1) continue;
      var sign = m[1] === '+' ? '+' : '';
      tweens.push({ el: el, from: Math.abs(from), to: Math.abs(to), sign: m[1] === '+' ? '+' : m[1] ? m[1] : sign, final: txt, ms: from === 0 ? 900 : 600, t0: 0 });
      el.textContent = fmt(m[1], Math.abs(from));
    }
    kick();
  }
  function ring(cell) {
    var old = cell.querySelector('.hfx-ring'); if (old) old.parentNode.removeChild(old);
    var open = cell.getAttribute('data-win') === 'open', ins = parseFloat(cell.getAttribute('data-ins')) || 0, born = now();
    var s = d.createElementNS(NS, 'svg'); s.setAttribute('class', 'hfx-ring'); s.setAttribute('viewBox', '0 0 30 30'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('data-win', open ? 'open' : 'shut');
    var C = 2 * Math.PI * 12, tr = d.createElementNS(NS, 'circle'), v = d.createElementNS(NS, 'circle'), dot = d.createElementNS(NS, 'circle');
    [tr, v].forEach(function (c) { c.setAttribute('cx', '15'); c.setAttribute('cy', '15'); c.setAttribute('r', '12'); });
    tr.setAttribute('class', 'hfx-rt'); v.setAttribute('class', 'hfx-rv'); v.setAttribute('stroke-dasharray', C.toFixed(2)); dot.setAttribute('class', 'hfx-rd'); dot.setAttribute('r', '2.4');
    s.appendChild(tr); s.appendChild(v); s.appendChild(dot); cell.appendChild(s);
    var SPAN = 13.5 * 3600, GAP = 10.5 * 3600;
    function upd() {
      var left = Math.max(0, ins - (now() - born) / 1000), p;
      if (open) p = 1 - left / SPAN;                               // how much of today's window is gone
      else { var gap = GAP; while (gap < left) gap += 86400; p = 1 - left / gap; }   // how close the next open is
      p = Math.max(0.02, Math.min(1, p));
      v.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(2));
      var a = p * 2 * Math.PI; dot.setAttribute('cx', (15 + 12 * Math.cos(a)).toFixed(2)); dot.setAttribute('cy', (15 + 12 * Math.sin(a)).toFixed(2));
    }
    upd();
    var iv = setInterval(function () { if (!s.isConnected) { clearInterval(iv); return; } if (!d.hidden) upd(); }, 30000);
  }
  function watchNow() {
    var box = d.getElementById('nowFacts'); if (!box || !W.MutationObserver) return;
    var go = function () { countUps(box); var c = box.querySelector('[data-win]'); if (c) ring(c); };
    new MutationObserver(go).observe(box, { childList: true });
    if (box.querySelector('.g-fv')) go();
    var mb = d.getElementById('money');   // cities3: the money row's balances and today's total count up the same way
    if (mb) { var gm = function () { countUps(mb, '.g-mv, .g-mtv'); }; new MutationObserver(gm).observe(mb, { childList: true }); if (mb.querySelector('.g-acct:not(.g-skel)')) gm(); }
  }

  /* ------------------------------------------------------------------ sound: the engine, when the page is idle */
  function soundChosen() { try { var o = JSON.parse(ls('olympus.sfx') || 'null'); return !!(o && o.s === true && o.m !== true); } catch (e) { return false; } }
  function loadSfx() {   // only when the owner turned Sound ON in Settings: the engine's first-tap start costs ~50 ms on a phone, the home stays instant otherwise
    if (!soundChosen()) return;
    if (W.OLYMPUS_SFX || d.querySelector('script[src*="olympus/sfx.js"]')) return;
    var me = d.querySelector('script[src*="olympus/home-fx.js"]'), src = me ? me.getAttribute('src').replace(/home-fx\.js[^"']*$/, 'sfx.js?v=hfx1') : null;
    if (!src) return;
    var s = d.createElement('script'); s.src = src; s.async = true; (d.head || R).appendChild(s);
  }

  function init() {
    splitTitle(); dress(); watchNow(); startHero();
    var idle = W.requestIdleCallback || function (f) { return setTimeout(f, 1200); };
    var later = function () { idle(loadSfx, { timeout: 4000 }); };
    if (d.readyState === 'complete') setTimeout(later, 1500); else W.addEventListener('load', function () { setTimeout(later, 1500); });
  }
  W.OLYMPUS_HOMEFX = {
    state: function () { return { mode: MODE, page: PAGE, hero: ST.hero, still: ST.still, why: ST.why, frames: ST.frames, draws: ST.draws, tweens: tweens.length, slow: ST.slow, running: !!raf, lite: LITE, maxDraw: ST.maxDraw }; },
    still: function () { if (hero) hero.still('api'); },
    go: kick
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
