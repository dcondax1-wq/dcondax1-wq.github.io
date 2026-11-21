/* OLYMPUS dashboard FX (tools/web_public/olympus/dashfx.js, day-arenas 2026-11-20; research/handoff/2026-11-20/fx/DASHFX_API.md).
 * One reusable "3D + glow" layer every dashboard can switch on with one tag and data attributes:
 *   <link rel="stylesheet" href="../olympus/dashfx.css?v=d1">        (in <head>: the sizes are there from the first frame)
 *   <script src="../olympus/dashfx.js?v=d1" defer></script>
 *   data-dfx="glass"   near-black violet card, a slow travelling violet / gold edge light (CSS; paused off screen)
 *   data-dfx="tilt"    a gentle 3D lean (max 6 deg): the pointer on a computer; the phone's tilt only if motion access was already given
 *   data-dfx="reveal"  a section below the fold rises in when scrolled to (translate + opacity, never a size change)
 *   data-dfx="roll"    the number counts up when it comes into view; the final text is restored exactly
 *   data-dfx="spark"   on an <svg>: its line glows, a violet gradient fills under it
 *   data-dfx="bar"     data-dfx-value (or data-value) 0..1: a glowing progress bar (violet, gold at 100%), scaled, no reflow
 *   data-dfx="bg"      on a box, or <body data-dfx-bg>: a cheap aurora + particles canvas behind the content (<= 60 dots, 30 fps)
 *   several in one attribute: data-dfx="glass tilt reveal"
 * API: window.OLYMPUS_DASHFX = { wire(scope), bar(el, v), theme({...}) -> palette, palette(), chart: { svg, canvas, lwc }, stats(), stop() }
 * Rules: prefers-reduced-motion = nothing moves (final numbers, full bars, no background canvas); Save-Data = no background canvas; no
 * WebGL needed; transforms and opacity only (layout never moves); every frame is a few ms; stop() takes every listener, canvas, class,
 * style and SVG node away. Colours: the --dfx-* CSS variables (dashfx.css, "OLYMPUS NIGHT"), a page or theme() overrides them.
 */
(function () {
  'use strict';
  if (window.OLYMPUS_DASHFX) return;
  var d = document, root = d.documentElement, me = d.currentScript;
  var BASE = me && me.src ? me.src.replace(/[^\/]*$/, '') : '../olympus/';
  var NS = 'http://www.w3.org/2000/svg';
  var DEF = { base: '#000000', 'card-a': '#16131e', 'card-b': '#020204', warm: '#231d16', line: '#3e255e', 'line-2': '#462a6a', 'line-3': '#4d2e76',
    glow: '#9d59ee', hi: '#dacbf0', dim: '#483081', gold: '#f1c14b', 'gold-text': '#ebbf4f', 'gold-muted': '#ac8a36', good: '#77db89',
    'good-line': '#557b61', bad: '#ef4444', text: '#ebe9f1', muted: '#898497' };
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function saveData() { try { var c = navigator.connection || {}; return !!c.saveData || /(^|-)(2g)$/.test(String(c.effectiveType || '')); } catch (e) { return false; } }
  function palette() {
    var cs = getComputedStyle(root), o = {};
    for (var k in DEF) { var v = (cs.getPropertyValue('--dfx-' + k) || '').trim(); o[k] = v || DEF[k]; }
    return o;
  }
  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return hex;
    var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // the stylesheet: the page should have it in <head>; if not, it is added now (a late sheet can only add paint, sizes are the page's)
  if (!d.querySelector('link[href*="dashfx.css"]')) {
    var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + 'dashfx.css?v=d1'; l.setAttribute('data-dfx-own', '');
    (d.head || root).appendChild(l);
  }

  // ------------------------------------------------------------------ bookkeeping: everything made is undone by stop()
  var undo = [], wired = new WeakMap(), stats = { wired: 0, frames: 0, maxFrameMs: 0, bgRunning: false, rolls: 0 };
  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); undo.push(function () { t.removeEventListener(ev, fn, o); }); }
  function cls(el, c) { if (!el.classList.contains(c)) { el.classList.add(c); undo.push(function () { el.classList.remove(c); }); } }
  function prop(el, k, v) { var old = el.style.getPropertyValue(k); el.style.setProperty(k, v); undo.push(function () { if (old) el.style.setProperty(k, old); else el.style.removeProperty(k); }); }
  function own(n) { undo.push(function () { if (n.parentNode) n.parentNode.removeChild(n); }); return n; }
  var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) { var cbs = es[i].target.__dfxSeen || []; for (var j = 0; j < cbs.length; j++) cbs[j](es[i].isIntersecting, es[i]); }
  }, { rootMargin: '0px' }) : null;
  // several effects on one element share one observation (each keeps its own callback)
  function seen(el, fn) {
    if (!io) { fn(true); return; }
    (el.__dfxSeen = el.__dfxSeen || []).push(fn); io.observe(el);
    undo.push(function () { io.unobserve(el); el.__dfxSeen = null; });
  }
  function unseen(el, fn) { var l = el.__dfxSeen || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); if (!l.length && io) io.unobserve(el); }
  function inView(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < (innerHeight || root.clientHeight); }

  // ------------------------------------------------------------------ glass: the CSS draws it; here only "pause when off screen"
  function glass(el) {
    if (reduced()) return;
    seen(el, function (vis) { el.classList.toggle('dfx-idle', !vis); });
    undo.push(function () { el.classList.remove('dfx-idle'); });
  }

  // ------------------------------------------------------------------ tilt: pointer (mouse / pen) + the phone's tilt when already allowed
  var tilts = [], tiltRaf = 0, orient = null, orient0 = null;
  function tilt(el) {
    if (reduced()) return;
    var st = { el: el, rx: 0, ry: 0 };
    tilts.push(st);
    prop(el, '--dfx-rx', '0deg'); prop(el, '--dfx-ry', '0deg');
    on(el, 'pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      st.ry = ((e.clientX - r.left) / r.width - .5) * 12; st.rx = -((e.clientY - r.top) / r.height - .5) * 9; queueTilt();
    });
    on(el, 'pointerleave', function () { st.rx = st.ry = 0; el.classList.add('dfx-tilt-ease'); queueTilt(); setTimeout(function () { el.classList.remove('dfx-tilt-ease'); }, 520); });
    if (!orient && window.DeviceOrientationEvent) {
      // never asks for permission: on iPhone the events only come if the owner already allowed motion for this site
      orient = function (e) {
        if (e.beta == null || e.gamma == null) return;
        if (!orient0) orient0 = { b: e.beta, g: e.gamma };
        var gx = Math.max(-1, Math.min(1, (e.gamma - orient0.g) / 25)), bx = Math.max(-1, Math.min(1, (e.beta - orient0.b) / 25));
        for (var i = 0; i < tilts.length; i++) { tilts[i].ry = gx * 6; tilts[i].rx = -bx * 5; }
        queueTilt();
      };
      on(window, 'deviceorientation', orient, { passive: true });
    }
  }
  function queueTilt() {
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(function () {
      tiltRaf = 0;
      for (var i = 0; i < tilts.length; i++) { var s = tilts[i]; s.el.style.setProperty('--dfx-rx', s.rx.toFixed(2) + 'deg'); s.el.style.setProperty('--dfx-ry', s.ry.toFixed(2) + 'deg'); }
    });
  }

  // ------------------------------------------------------------------ reveal: below-the-fold sections rise in; on-screen ones never hide
  function reveal(el) {
    if (reduced() || !io || inView(el)) return;
    cls(el, 'dfx-pre');
    var f = function (vis) { if (!vis) return; el.classList.add('dfx-in'); el.classList.remove('dfx-pre'); unseen(el, f); }; seen(el, f);
    undo.push(function () { el.classList.remove('dfx-in'); });
  }

  // ------------------------------------------------------------------ roll: count up to the number in the text, then the exact text again
  var NUM = /-?\d[\d,]*(?:\.\d+)?/;
  function roll(el) {
    if (el.children.length) return;                       // only a plain number box (nested markup is never rewritten)
    var text = el.textContent, m = NUM.exec(text); if (!m) return;
    var raw = m[0], to = parseFloat(raw.replace(/,/g, '')); if (!isFinite(to) || to === 0) return;
    var dec = (raw.split('.')[1] || '').length, comma = raw.indexOf(',') >= 0, pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    var fmt = function (v) { var s = Math.abs(v).toFixed(dec); if (comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); } return (v < 0 ? '-' : '') + s; };
    undo.push(function () { el.textContent = text; });
    if (reduced()) return;
    var ran = false;
    var f = function (vis) {
      if (!vis || ran) return; ran = true; unseen(el, f);
      var cs = getComputedStyle(el), w = el.getBoundingClientRect().width, inline = cs.display === 'inline';
      if (inline) prop(el, 'display', 'inline-block');
      prop(el, 'min-width', w + 'px');                       // the box keeps its final width while the digits count
      var t0 = performance.now(), dur = +(el.getAttribute('data-dfx-ms') || 1100);
      stats.rolls++;
      (function step(now) {
        if (!el.isConnected) return;
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = k >= 1 ? text : pre + fmt(to * e) + post;
        if (k < 1) requestAnimationFrame(step); else { el.style.removeProperty('min-width'); if (inline) el.style.removeProperty('display'); }
      })(t0);
    };
    seen(el, f);
  }

  // ------------------------------------------------------------------ charts: SVG glow + gradient area, canvas, lightweight-charts options
  var gid = 0;
  function svgNode(tag, attrs, parent) { var n = d.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function chartSvg(path, o) {
    o = o || {};
    var svg = path && path.ownerSVGElement; if (!svg) return { stop: function () {} };
    var P = palette(), color = o.color || P.glow, id = 'dfx' + (++gid), made = [];
    var keep = path.getAttribute('stroke'), recolor = o.color || !keep || keep === 'currentColor';
    var defs = svgNode('defs', {}, svg); made.push(defs);
    var lg = svgNode('linearGradient', { id: id + 'g', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    svgNode('stop', { offset: '0', 'stop-color': o.fill || color, 'stop-opacity': String(o.fillOpacity === undefined ? .38 : o.fillOpacity) }, lg);
    svgNode('stop', { offset: '1', 'stop-color': o.fill || color, 'stop-opacity': '0' }, lg);
    var f = svgNode('filter', { id: id + 'f', x: '-10%', y: '-40%', width: '120%', height: '180%' }, defs);
    svgNode('feGaussianBlur', { stdDeviation: String(o.blur || 3) }, f);
    var area = svgNode('path', { fill: 'url(#' + id + 'g)', stroke: 'none', 'pointer-events': 'none', 'data-dfx-made': '' }), glow = svgNode('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none', 'data-dfx-made': '' });
    path.parentNode.insertBefore(area, path); path.parentNode.insertBefore(glow, path); made.push(area, glow);
    var oldStroke = keep, oldW = path.getAttribute('stroke-width');
    function sync() {
      var dd = path.tagName.toLowerCase() === 'polyline' ? 'M' + (path.getAttribute('points') || '').trim().split(/\s+/).join('L') : (path.getAttribute('d') || '');
      var vb = svg.viewBox && svg.viewBox.baseVal, bottom = vb && vb.height ? vb.y + vb.height : (svg.clientHeight || 100);
      var pts = dd.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
      if (pts.length >= 4) {
        var x0 = pts[0], xn = pts[pts.length - 2];
        area.setAttribute('d', dd + ' L' + xn + ' ' + bottom + ' L' + x0 + ' ' + bottom + ' Z');
      }
      glow.setAttribute('d', dd);
      var w = +(path.getAttribute('stroke-width') || getComputedStyle(path).strokeWidth.replace('px', '') || 2) || 2;
      glow.setAttribute('stroke', recolor ? color : (path.getAttribute('stroke') || color)); glow.setAttribute('stroke-width', String(w * 3)); glow.setAttribute('opacity', '.55');
      glow.setAttribute('filter', 'url(#' + id + 'f)');
      var tr = path.getAttribute('transform'); [area, glow].forEach(function (n) { if (tr) n.setAttribute('transform', tr); else n.removeAttribute('transform'); });
    }
    if (recolor) { path.setAttribute('stroke', color); if (!oldW) path.setAttribute('stroke-width', '2'); }
    sync();
    var mo = new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) if (ms[i].attributeName !== 'stroke' && ms[i].attributeName !== 'stroke-width') { sync(); return; } });
    mo.observe(path, { attributes: true, attributeFilter: ['d', 'points', 'transform'] });
    var dead = false, stop = function () {
      if (dead) return; dead = true; mo.disconnect();
      made.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      if (recolor) { if (oldStroke) path.setAttribute('stroke', oldStroke); else path.removeAttribute('stroke'); if (!oldW) path.removeAttribute('stroke-width'); }
    };
    undo.push(stop);
    return { stop: stop, sync: sync };
  }
  /** a 2D canvas line with a glow and a gradient fill under it: points = [[x, y], ...] in canvas pixels */
  function chartCanvas(g, pts, o) {
    o = o || {}; if (!g || !pts || pts.length < 2) return;
    var P = palette(), color = o.color || P.glow, h = o.bottom || g.canvas.height;
    g.save();
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgba(o.fill || color, o.fillOpacity === undefined ? .35 : o.fillOpacity)); gr.addColorStop(1, rgba(o.fill || color, 0));
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[pts.length - 1][0], h); g.lineTo(pts[0][0], h); g.closePath(); g.fillStyle = gr; g.fill();
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineJoin = g.lineCap = 'round'; g.shadowColor = rgba(color, .8); g.shadowBlur = o.blur || 10; g.strokeStyle = color; g.lineWidth = o.width || 2; g.stroke();
    g.restore();
  }
  /** lightweight-charts: the options for an area / line series in the palette (applied when a series is given) */
  function chartLwc(series, o) {
    o = o || {}; var P = palette(), c = o.color || P.glow;
    var opt = { lineColor: c, color: c, lineWidth: o.width || 2, topColor: rgba(c, .38), bottomColor: rgba(c, 0), crosshairMarkerBorderColor: P.hi, crosshairMarkerBackgroundColor: c };
    try { if (series && series.applyOptions) series.applyOptions(opt); } catch (e) { /* not an area / line series */ }
    return opt;
  }
  function spark(svg) {
    var p = svg.querySelector('path, polyline'); if (!p) return;
    chartSvg(p, { color: svg.getAttribute('data-dfx-color') || undefined });
  }

  // ------------------------------------------------------------------ bar: the fill scales to the value (violet, gold at 100%)
  function bar(el, v) {
    var fill = el.querySelector(':scope > .dfx-bar-fill');
    if (!fill) { fill = own(d.createElement('i')); fill.className = 'dfx-bar-fill'; fill.setAttribute('aria-hidden', 'true'); el.appendChild(fill); }
    if (v === undefined) v = parseFloat(el.getAttribute('data-dfx-value') || el.getAttribute('data-value') || '0');
    v = Math.max(0, Math.min(1, +v || 0));
    el.classList.toggle('dfx-full', v >= .999);
    if (!el.hasAttribute('role')) { el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100'); }
    el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    if (reduced() || !io) { el.style.setProperty('--dfx-v', String(v)); return; }
    el.__dfxV = v;
    if (el.__dfxBarSeen) { el.style.setProperty('--dfx-v', String(v)); return; }
    if (el.__dfxBarWait) return;                               // already waiting to be seen: it will use the newest value
    el.__dfxBarWait = true;
    el.style.setProperty('--dfx-v', '0');
    var f = function (vis) { if (!vis) return; el.__dfxBarSeen = true; unseen(el, f); el.classList.add('dfx-anim'); requestAnimationFrame(function () { el.style.setProperty('--dfx-v', String(el.__dfxV === undefined ? v : el.__dfxV)); }); };
    seen(el, f);
    undo.push(function () { el.style.removeProperty('--dfx-v'); el.classList.remove('dfx-anim', 'dfx-full'); el.__dfxBarSeen = false; el.__dfxBarWait = false; });
  }

  // ------------------------------------------------------------------ bg: aurora blobs + drifting dots on one 2D canvas, 30 fps, paused when unseen
  var bgs = [];
  function bg(host) {
    if (reduced() || saveData()) return;
    var body = host === d.body;
    var ca = own(d.createElement('canvas')), cv = own(d.createElement('canvas'));
    ca.className = 'dfx-bg dfx-bg-aurora' + (body ? '' : ' dfx-in-box'); cv.className = 'dfx-bg' + (body ? '' : ' dfx-in-box');
    ca.setAttribute('aria-hidden', 'true'); cv.setAttribute('aria-hidden', 'true');
    if (!body) cls(host, 'dfx-bg-host');
    host.insertBefore(cv, host.firstChild); host.insertBefore(ca, cv);
    var ga = ca.getContext('2d'), g = cv.getContext('2d'), P = palette(), W = 0, H = 0, dpr = 1, dots = [], vis = true, raf = 0, last = 0, lastA = 0, t = 0;
    var N = Math.min(60, Math.max(18, Math.round((innerWidth * innerHeight) / 16000)));
    var AS = 0.25;                                                  // the aurora is soft: a quarter of the pixels, stretched by the CSS
    function size() {
      var r = body ? { width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
      dpr = Math.min(1.5, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      ca.width = Math.max(1, Math.round(W * AS)); ca.height = Math.max(1, Math.round(H * AS)); ga.setTransform(AS, 0, 0, AS, 0, 0);
      lastA = 0;
    }
    size();
    for (var i = 0; i < N; i++) dots.push({ x: Math.random() * W, y: Math.random() * H, r: .6 + Math.random() * 1.6, vx: (Math.random() - .5) * 6, vy: -2 - Math.random() * 6, a: .25 + Math.random() * .5, c: i % 7 === 0 ? P.gold : i % 2 ? P.hi : P.glow });
    var blobs = [{ c: P.glow, r: .55, x: .2, y: .1 }, { c: P['line-3'], r: .5, x: .85, y: .35 }, { c: P.warm, r: .45, x: .5, y: .95 }];
    function aurora() {
      ga.clearRect(0, 0, W, H);
      for (var b = 0; b < blobs.length; b++) {
        var B = blobs[b], bx = (B.x + Math.sin(t * .35 + b) * .08) * W, by = (B.y + Math.cos(t * .3 + b * 2) * .06) * H, br = B.r * Math.max(W, H);
        var gr = ga.createRadialGradient(bx, by, 0, bx, by, br); gr.addColorStop(0, rgba(B.c, .18)); gr.addColorStop(1, rgba(B.c, 0));
        ga.fillStyle = gr; ga.fillRect(0, 0, W, H);
      }
    }
    function draw(now) {
      raf = 0; if (!vis || d.hidden) { stats.bgRunning = false; return; }
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;                                 // 30 fps
      var t1 = performance.now(), dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now; t += dt;
      if (!lastA || now - lastA > 100) { lastA = now; aurora(); }  // the aurora at 10 fps
      g.clearRect(0, 0, W, H);
      for (var k = 0; k < dots.length; k++) {
        var p = dots[k]; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; } if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
        g.globalAlpha = p.a * (.6 + .4 * Math.sin(t * 2 + k)); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      stats.frames++; stats.bgRunning = true; stats.maxFrameMs = Math.max(stats.maxFrameMs, performance.now() - t1);
    }
    function go() { if (!raf && vis && !d.hidden) { last = 0; raf = requestAnimationFrame(draw); } }
    var rt = 0; on(window, 'resize', function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    on(d, 'visibilitychange', function () { if (d.hidden) { stats.bgRunning = false; } else go(); });
    if (!body) seen(host, function (v) { vis = v; if (v) go(); else stats.bgRunning = false; });
    var rec = { stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; vis = false; stats.bgRunning = false; } };
    bgs.push(rec); undo.push(rec.stop);
    go();
  }

  // ------------------------------------------------------------------ wiring: data-dfx tokens, now and for elements added later
  function idle(f) { if (window.requestIdleCallback) requestIdleCallback(f, { timeout: 1500 }); else setTimeout(f, 200); }
  var EFFECTS = { glass: glass, tilt: tilt, reveal: reveal, roll: roll, spark: spark, bar: function (el) { bar(el); }, bg: function (el) { idle(function () { if (!stopped) bg(el); }); } };
  function wireEl(el) {
    if (wired.has(el)) return; wired.set(el, true); stats.wired++;
    var toks = (el.getAttribute('data-dfx') || '').split(/\s+/);
    for (var i = 0; i < toks.length; i++) { var f = EFFECTS[toks[i]]; if (f) { try { f(el); } catch (e) { try { console.warn('[dashfx] ' + toks[i], e); } catch (x) { /* nothing */ } } } }
  }
  function wire(scope) {
    scope = scope || d;
    if (scope === d && d.body && d.body.hasAttribute('data-dfx-bg') && !wired.has(d.body)) { wired.set(d.body, true); idle(function () { if (!stopped) bg(d.body); }); }
    if (scope.nodeType === 1 && scope.hasAttribute('data-dfx')) wireEl(scope);
    var l = scope.querySelectorAll('[data-dfx]'); for (var i = 0; i < l.length; i++) wireEl(l[i]);
  }
  var moQ = 0, mo = new MutationObserver(function (ms) {
    if (moQ) return;
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) {
      if (ms[i].addedNodes[j].nodeType === 1) { moQ = setTimeout(function () { moQ = 0; wire(d); }, 80); return; }
    }
  });
  var stopped = false;
  function start() { if (stopped) return; wire(d); mo.observe(d.body || root, { childList: true, subtree: true }); }
  // after the page's own first frame: its layout is done, so measuring the cards costs nothing extra (no long task from this layer)
  function later() { requestAnimationFrame(function () { setTimeout(start, 0); }); }
  function stop() {
    stopped = true; mo.disconnect(); clearTimeout(moQ);
    var u = undo; undo = []; for (var i = u.length - 1; i >= 0; i--) { try { u[i](); } catch (e) { /* gone */ } }
    tilts.forEach(function (s) { s.el.style.removeProperty('--dfx-rx'); s.el.style.removeProperty('--dfx-ry'); });
    tilts = []; bgs = []; wired = new WeakMap(); orient = null; orient0 = null;
    d.querySelectorAll('[data-dfx~="bar"]').forEach(function (e) { e.style.removeProperty('--dfx-v'); });
    d.querySelectorAll('.dfx-idle, .dfx-pre, .dfx-in, .dfx-anim, .dfx-full, .dfx-bg-host').forEach(function (e) { e.classList.remove('dfx-idle', 'dfx-pre', 'dfx-in', 'dfx-anim', 'dfx-full', 'dfx-bg-host'); });
  }
  function theme(t) {
    if (t && typeof t === 'object') for (var k in t) if (Object.prototype.hasOwnProperty.call(DEF, k) && /^#[0-9a-f]{3,8}$/i.test(String(t[k]))) root.style.setProperty('--dfx-' + k, t[k]);
    return palette();
  }

  window.OLYMPUS_DASHFX = {
    wire: wire, bar: bar, theme: theme, palette: palette, stop: stop,
    chart: { svg: chartSvg, canvas: chartCanvas, lwc: chartLwc },
    stats: function () { return { wired: stats.wired, frames: stats.frames, maxFrameMs: +stats.maxFrameMs.toFixed(2), bgRunning: stats.bgRunning, rolls: stats.rolls, reduced: reduced(), undo: undo.length }; },
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', later, { once: true }); else later();
})();
