/* OLYMPUS FX core (tools/web_public/olympus/fx-core.js, 2026-11-04; docs/OLYMPUS_FX.md): the registry, the ONE shared frame loop
 * and the tier rules for the effects library. A classic script (no imports), loaded after olympus.js:
 *   <script src="../olympus/fx-core.js?v=f1"></script>   then  fx-ui.js / fx-text.js / fx-burst.js (cards, buttons, numbers)
 *   and, for three.js scenes (ES modules, after the core): fx-sky.js / fx-weather.js / fx-surface.js
 * Every effect is   OLYMPUS_FX.<name>(el | scene, opts) -> { stop(), ... }   and nothing else is needed:
 *   tiers    ultra | high | low | off from OLYMPUS.fx() (the owner's one quality setting, followed live: a running effect is rebuilt
 *            for the new tier); prefers-reduced-motion = off; off = nothing moves (an effect may give a still version);
 *   loop     one requestAnimationFrame for every effect on the page; no frame while the tab is hidden; low runs at 30 fps;
 *            an element effect also sleeps while its element is off screen;
 *   caps     canvases: pixel ratio <= 2 / 1.5 / 1 and a pixel budget per tier; particles: pooled, <= 2000 / 1200 / 400;
 *   cleanup  everything an effect makes (listeners, timers, canvases, nodes, styles, GPU objects) is registered with its context
 *            and undone by stop(); stop() twice is harmless; a page error inside an effect stops that effect, never the page.
 * It never throws and never writes localStorage (the quality choice is the kit's).
 */
(function () {
  'use strict';
  if (window.OLYMPUS_FX) return;
  var d = document, root = d.documentElement, me = d.currentScript;
  var BASE = me && me.src ? me.src.replace(/[^\/]*$/, '') : '';
  var LEVELS = ['ultra', 'high', 'low', 'off'];
  // per tier: canvas pixel ratio, canvas pixel budget (backing pixels per canvas), particles per effect, loop rate
  var CAPS = {
    ultra: { dpr: 2, px: 1600000, particles: 2000, fps: 60 },
    high: { dpr: 1.5, px: 1100000, particles: 1200, fps: 60 },
    low: { dpr: 1, px: 520000, particles: 400, fps: 30 },
    off: { dpr: 1, px: 0, particles: 0, fps: 0 },
  };
  var specs = {}, order = [], active = [], tickers = [], canvases = [], errors = [];
  var forced = null, raf = 0, last = 0, t0 = performance.now(), frames = 0, uiOff = false;
  var FX = { version: 1, CAPS: CAPS, LEVELS: LEVELS, base: BASE };

  function mq(q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } }
  function stored() { try { var v = localStorage.getItem('jfx'); return LEVELS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; } }
  function reduced() { return mq('(prefers-reduced-motion: reduce)'); }
  function hidden() { var O = window.OLYMPUS; return O && O.hidden ? O.hidden() : d.hidden === true; }
  /** the tier effects run at: reduced motion is always off; a lab/test override (setTier) beats OLYMPUS.fx() */
  function tier() {
    if (reduced()) return 'off';
    var O = window.OLYMPUS, t = forced || (O && O.fx ? O.fx() : stored() || 'high');
    return LEVELS.indexOf(t) >= 0 ? t : 'high';
  }
  FX.tier = tier; FX.reduced = reduced;
  function warn(name, e) {
    errors.push(name + ': ' + (e && e.message ? e.message : e));
    try { if (window.console) console.warn('[OLYMPUS_FX] ' + name, e); } catch (x) { /* nothing */ }
  }

  // ---------------------------------------------------------------- the one frame loop
  var io = null;
  function watch(el) {
    if (!el || !window.IntersectionObserver) return;
    if (!io) io = new IntersectionObserver(function (list) { for (var i = 0; i < list.length; i++) list[i].target.__olyHid = !list[i].isIntersecting; });
    io.observe(el);
  }
  function unwatch(el) { if (io && el) { io.unobserve(el); el.__olyHid = false; } }
  var inFrame = false;
  function anyOn() { for (var i = 0; i < tickers.length; i++) if (tickers[i].on && !tickers[i].dead) return true; return false; }
  function sweep() { for (var i = tickers.length - 1; i >= 0; i--) if (tickers[i].dead) tickers.splice(i, 1); }
  function frame(now) {
    raf = 0;
    if (!anyOn() || hidden()) return;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60, T = (now - t0) / 1000, n = tickers.length, i, k;
    last = now; frames++; inFrame = true;
    for (i = 0; i < n; i++) {
      k = tickers[i];
      if (k.dead || !k.on) continue;
      if (k.every && k.at && now - k.at < k.every - 3) continue;
      if (k.el && k.el.__olyHid) { k.at = 0; continue; }
      var step = k.at ? Math.min(0.1, (now - k.at) / 1000) : dt;
      k.at = now;
      try { k.fn(step, T); } catch (e) { k.dead = true; warn(k.name, e); if (k.fail) k.fail(e); }
    }
    inFrame = false; sweep();
    if (anyOn()) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && anyOn() && !hidden()) { last = 0; raf = requestAnimationFrame(frame); } }
  d.addEventListener('visibilitychange', wake);
  function addTicker(fn, o, t, name) {
    o = o || {};
    var every = o.fps ? 1000 / o.fps : (CAPS[t].fps && CAPS[t].fps < 60 ? 1000 / CAPS[t].fps : 0);
    var k = { fn: fn, every: every, at: 0, el: o.el || null, name: name, on: false, dead: false };
    tickers.push(k);
    return k;
  }

  // ---------------------------------------------------------------- helpers shared by the effects
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  FX.util = {
    rnd: rnd, clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; }, lerp: function (a, b, t) { return a + (b - a) * t; },
    ease: function (t) { return 1 - Math.pow(1 - t, 3); },
    /** the theme's accent as [r, g, b] (0..255), read from --oly-accent-rgb */
    accent: function (name) {
      var v = (getComputedStyle(root).getPropertyValue(name || '--oly-accent-rgb') || '').split(',');
      return v.length === 3 ? [+v[0] || 168, +v[1] || 85, +v[2] || 247] : [168, 85, 247];
    },
    css: function (name, fallback) { var v = getComputedStyle(root).getPropertyValue(name); return (v && v.trim()) || fallback; },
  };
  /** a fixed pool of particles in one Float32Array: spawn() -> index or -1 (full), kill(i); no allocation while it runs */
  FX.pool = function (n, stride) {
    var data = new Float32Array(n * stride), live = new Uint8Array(n), head = 0, count = 0;
    return {
      n: n, stride: stride, data: data, live: live,
      get count() { return count; },
      spawn: function () {
        for (var k = 0; k < n; k++) { var i = (head + k) % n; if (!live[i]) { live[i] = 1; count++; head = (i + 1) % n; return i; } }
        return -1;
      },
      kill: function (i) { if (live[i]) { live[i] = 0; count--; } },
      clear: function () { live.fill(0); count = 0; },
    };
  };

  // ---------------------------------------------------------------- the context every effect gets
  function disposeTree(o) {
    if (!o) return;
    var seen = [];
    var dm = function (m) {
      if (!m || seen.indexOf(m) >= 0) return; seen.push(m);
      for (var k in m) { var v = m[k]; if (v && v.isTexture && !v.__olyKeep) v.dispose(); }
      if (m.uniforms) for (var u in m.uniforms) { var uv = m.uniforms[u] && m.uniforms[u].value; if (uv && uv.isTexture && !uv.__olyKeep) uv.dispose(); }
      m.dispose();
    };
    var one = function (x) {
      if (x.geometry && !x.geometry.__olyKeep) x.geometry.dispose();
      if (x.material) { if (Array.isArray(x.material)) x.material.forEach(dm); else dm(x.material); }
      if (x.isLight && x.shadow && x.shadow.map) x.shadow.map.dispose();
    };
    if (o.traverse) o.traverse(one); else one(o);
  }
  function makeCtx(rec, t) {
    var C = CAPS[t], name = rec.name;
    var ctx = {
      tier: t, caps: C, name: name, opts: rec.opts, FX: FX,
      /** pick one of the tier's values: pick(ultra, high, low) (low falls back to high, high to ultra) */
      pick: function (u, h, l) { return t === 'ultra' ? u : t === 'high' ? (h === undefined ? u : h) : (l === undefined ? (h === undefined ? u : h) : l); },
      /** a particle count for this tier, held under the tier's cap (the sum an effect asks for never passes it) */
      count: function (u, h, l) {
        var n = Math.max(0, Math.min(ctx.pick(u, h, l), C.particles - rec.declared));
        rec.declared += n; return Math.floor(n);
      },
      add: function (fn) { rec.cleanups.push(fn); return fn; },
      on: function (target, ev, fn, o) { target.addEventListener(ev, fn, o); rec.cleanups.push(function () { target.removeEventListener(ev, fn, o); }); },
      timeout: function (fn, ms) {
        var id = setTimeout(function () { try { fn(); } catch (e) { warn(name, e); } }, ms);
        rec.cleanups.push(function () { clearTimeout(id); }); return id;
      },
      /** a controller on the shared loop: { start(), stop() }; fn(dt, t) */
      ticker: function (fn, o) {
        var k = addTicker(fn, o, t, name);
        k.fail = function () { FX_stop(rec); };
        if (k.el) watch(k.el);
        rec.cleanups.push(function () { k.dead = true; k.on = false; if (k.el) unwatch(k.el); if (!inFrame) sweep(); });
        return { start: function () { if (!k.dead) { k.on = true; k.at = 0; wake(); } }, stop: function () { k.on = false; }, get running() { return k.on; } };
      },
      /** the same, started now */
      tick: function (fn, o) { var c = ctx.ticker(fn, o); c.start(); return c; },
      cls: function (el, c) { if (el.classList.contains(c)) return; el.classList.add(c); rec.cleanups.push(function () { el.classList.remove(c); }); },
      /** inline style props, put back as they were on stop */
      style: function (el, props) {
        var old = {}, k;
        for (k in props) { old[k] = el.style.getPropertyValue(k); el.style.setProperty(k, props[k]); }
        rec.cleanups.push(function () { for (var j in old) { if (old[j]) el.style.setProperty(j, old[j]); else el.style.removeProperty(j); } });
      },
      /** a node made by the effect, removed on stop */
      node: function (tag, cls, parent, text) {
        var e = d.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text;
        if (parent) parent.appendChild(e);
        rec.cleanups.push(function () { if (e.parentNode) e.parentNode.removeChild(e); });
        return e;
      },
      /** a canvas over the host (or the whole viewport with { fixed: true }, or a fixed box { rect: {x, y, w, h} }), under every cap */
      canvas: function (host, o) {
        o = o || {};
        var c = d.createElement('canvas'), fixed = !!(o.fixed || o.rect), restore = null;
        host = fixed ? d.body : host;
        c.setAttribute('data-oly-fx-canvas', name); c.setAttribute('aria-hidden', 'true');
        var s = c.style;
        s.position = fixed ? 'fixed' : 'absolute'; s.pointerEvents = 'none'; s.borderRadius = 'inherit'; s.zIndex = String(o.z === undefined ? 5 : o.z);
        if (o.rect) { s.left = o.rect.x + 'px'; s.top = o.rect.y + 'px'; s.width = o.rect.w + 'px'; s.height = o.rect.h + 'px'; }
        else { s.left = s.top = '0'; s.width = s.height = '100%'; }
        if (!fixed && getComputedStyle(host).position === 'static') { host.style.position = 'relative'; restore = true; }
        host.appendChild(c);
        var api = { canvas: c, g: c.getContext('2d'), w: 0, h: 0, dpr: 1 };
        api.fit = function () {
          var w = o.rect ? o.rect.w : fixed ? window.innerWidth : host.clientWidth, h = o.rect ? o.rect.h : fixed ? window.innerHeight : host.clientHeight;
          if (!w || !h) return false;
          var dpr = Math.min(window.devicePixelRatio || 1, C.dpr, o.maxDpr || 9);
          var budget = C.px || CAPS.low.px;                       // off: a still canvas (progressRing) follows the low budget
          if (w * h * dpr * dpr > budget) dpr = Math.sqrt(budget / (w * h));
          var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
          if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
          api.w = w; api.h = h; api.dpr = bw / w;
          api.g.setTransform(bw / w, 0, 0, bh / h, 0, 0);
          return true;
        };
        api.fit();
        canvases.push(c);
        rec.cleanups.push(function () {
          var i = canvases.indexOf(c); if (i >= 0) canvases.splice(i, 1);
          if (c.parentNode) c.parentNode.removeChild(c);
          if (restore) host.style.position = '';
          c.width = c.height = 0;
        });
        return api;
      },
      /** three.js: add obj to the scene; on stop it leaves the scene and every geometry / material / texture in it is freed */
      scene: function (scene, obj) { scene.add(obj); rec.cleanups.push(function () { scene.remove(obj); disposeTree(obj); }); return obj; },
      free: function (obj) { rec.cleanups.push(function () { disposeTree(obj); }); return obj; },
      /** the effect is over by itself (confetti landed, a toast timed out): stop and forget it */
      finish: function () { FX_stop(rec); },
    };
    return ctx;
  }

  // ---------------------------------------------------------------- start / stop / rebuild
  function teardown(rec) {
    var c = rec.cleanups; rec.cleanups = []; rec.declared = 0;
    for (var i = c.length - 1; i >= 0; i--) { try { c[i](); } catch (e) { warn(rec.name, e); } }
  }
  function FX_stop(rec) {
    if (rec.stopped) return;
    rec.stopped = true;
    try { if (rec.inner && rec.inner.stop) rec.inner.stop(); } catch (e) { warn(rec.name, e); }
    teardown(rec);
    var i = active.indexOf(rec); if (i >= 0) active.splice(i, 1);
    rec.inner = null;
  }
  function build(rec) {
    var t = rec.opts && LEVELS.indexOf(rec.opts.tier) >= 0 && !reduced() ? rec.opts.tier : tier();
    rec.tier = t;
    var ctx = makeCtx(rec, t);
    try {
      if (t === 'off') rec.inner = (rec.spec.still ? rec.spec.still(rec.target, rec.opts, ctx) : null) || {};
      else rec.inner = rec.spec.make(rec.target, rec.opts, ctx) || {};
    } catch (e) {
      warn(rec.name, e); teardown(rec); rec.inner = {};
    }
  }
  function start(name, spec, target, opts) {
    opts = opts || {};
    var rec = { name: name, spec: spec, target: target, opts: opts, cleanups: [], inner: null, stopped: false, tier: 'off', declared: 0 };
    var handle = {
      name: name, target: target,
      get tier() { return rec.tier; },
      get stopped() { return rec.stopped; },
      get inner() { return rec.inner; },
      stop: function () { FX_stop(rec); },
      /** effect-specific verbs (strike, set, burst, ...) of the running effect; harmless once stopped */
      call: function (verb) {
        var a = Array.prototype.slice.call(arguments, 1), i = rec.inner;
        return i && typeof i[verb] === 'function' ? i[verb].apply(i, a) : undefined;
      },
    };
    rec.handle = handle;
    if (spec.max) {                                    // a burst type: at most `max` alive, the oldest gives way
      var same = active.filter(function (r) { return r.name === name; });
      while (same.length >= spec.max) FX_stop(same.shift());
    }
    active.push(rec);
    build(rec);
    // the verbs of the effect are also on the handle (rebuilt effects keep the same handle)
    ['set', 'strike', 'burst', 'update', 'play', 'pulse', 'text'].forEach(function (v) {
      handle[v] = function () { return handle.call.apply(handle, [v].concat([].slice.call(arguments))); };
    });
    return handle;
  }
  function rebuildAll() {
    active.slice().forEach(function (rec) {
      if (rec.stopped) return;
      if (rec.opts && LEVELS.indexOf(rec.opts.tier) >= 0 && !reduced()) return;      // pinned to a tier for this call
      try { if (rec.inner && rec.inner.stop) rec.inner.stop(); } catch (e) { warn(rec.name, e); }
      teardown(rec); build(rec);
    });
  }
  var lastTier = tier();
  function tierMaybe() { var t = tier(); if (t !== lastTier) { lastTier = t; rebuildAll(); for (var i = 0; i < subs.length; i++) { try { subs[i](t); } catch (e) { /* one listener never stops the rest */ } } } }
  var subs = [];
  FX.onTier = function (cb) { if (typeof cb === 'function') subs.push(cb); };
  /** lab and tests only: pin the tier for this page (not stored). null releases it. data-fx on <html> follows so the CSS effects match. */
  FX.setTier = function (t) {
    forced = LEVELS.indexOf(t) >= 0 ? t : null;
    if (forced) root.setAttribute('data-fx', forced);
    tierMaybe();
    return tier();
  };
  if (window.OLYMPUS && window.OLYMPUS.onFx) window.OLYMPUS.onFx(tierMaybe);
  if (window.OLYMPUS && window.OLYMPUS.onTheme) {
    window.OLYMPUS.onTheme(function () { rebuildAll(); });                                    // 3D palettes are read at start
    window.addEventListener('olympus:theme-default', function () { rebuildAll(); });
  }
  try { var rm = window.matchMedia('(prefers-reduced-motion: reduce)'); if (rm.addEventListener) rm.addEventListener('change', tierMaybe); } catch (e) { /* old browsers */ }

  // ---------------------------------------------------------------- the registry
  function noop(name, why) { return { name: name, stopped: true, stop: function () {}, error: why, call: function () {} }; }
  /** define(name, { kind: 'el' | 'scene', group, desc, make(target, opts, ctx) -> { stop?, ... }, still?(...), css?, max?, demo? }) */
  FX.define = function (name, spec) {
    spec.kind = spec.kind || 'el';
    specs[name] = spec; if (order.indexOf(name) < 0) order.push(name);
    FX[name] = function (target, opts) {
      try {
        if (spec.kind === 'el') {
          if (typeof target === 'string') target = d.querySelector(target);
          if (!target && spec.global) target = d.body;
          if (!target || !target.nodeType) return noop(name, 'needs an element');
        } else {
          var sc = target && (target.isScene ? target : target.scene);
          if (!sc || !sc.isScene) return noop(name, 'needs a three.js scene');
        }
        return start(name, spec, target, opts);
      } catch (e) { warn(name, e); return noop(name, e && e.message); }
    };
    return FX[name];
  };
  FX.names = function () { return order.slice(); };
  FX.has = function (n) { return !!specs[n]; };
  FX.info = function (n) { var s = specs[n]; return s ? { name: n, kind: s.kind, group: s.group, desc: s.desc, demo: s.demo || null, css: !!s.css, global: !!s.global } : null; };
  FX.list = function () { return order.map(FX.info); };
  FX.stopAll = function () { active.slice().forEach(FX_stop); };
  FX.stats = function () {
    var by = {}, parts = 0, over = [];
    active.forEach(function (r) { by[r.name] = (by[r.name] || 0) + 1; parts += r.declared; if (r.declared > CAPS[r.tier].particles) over.push(r.name); });
    return {
      tier: tier(), frames: frames, active: active.length, byName: by, tickers: tickers.filter(function (k) { return !k.dead; }).length,
      running: tickers.filter(function (k) { return !k.dead && k.on; }).length, raf: raf !== 0, particles: parts, overCap: over,
      canvases: canvases.map(function (c) {
        var cs = c.clientWidth || 1;
        return { fx: c.getAttribute('data-oly-fx-canvas'), w: c.width, h: c.height, px: c.width * c.height, dpr: c.width / cs, css: [c.clientWidth, c.clientHeight] };
      }),
      errors: errors.slice(),
    };
  };
  /** load more of the library: FX.load('ui' | 'text' | 'burst' | '3d' | 'all') -> Promise (the files sit next to this one) */
  var FILES = { ui: ['fx-ui.js'], text: ['fx-text.js'], burst: ['fx-burst.js'], '3d': ['fx-sky.js', 'fx-weather.js', 'fx-surface.js'] };
  FILES.all = FILES.ui.concat(FILES.text, FILES.burst, FILES['3d']);
  var loaded = {};
  FX.load = function (kind) {
    var files = FILES[kind || 'all'] || [kind];
    return Promise.all(files.map(function (f) {
      if (loaded[f]) return loaded[f];
      loaded[f] = new Promise(function (res) {
        var s = d.createElement('script'); if (/^fx-(sky|weather|surface)/.test(f)) s.type = 'module';
        s.src = BASE + f + '?v=f1'; s.async = true; s.onload = function () { res(true); }; s.onerror = function () { warn('load', f + ' is missing'); res(false); };
        (d.head || root).appendChild(s);
      });
      return loaded[f];
    }));
  };

  // ---------------------------------------------------------------- the zero-edit wiring: data-oly-fx="tilt ripple ..." (+ opt-out)
  var attached = [], seen = 0;
  function optedOut(el) {
    if (uiOff || root.getAttribute('data-oly-fx-ui') === 'off') return true;
    return !!(el.closest && el.closest('[data-oly-fx-off]'));
  }
  function tokens(el) { return (el.getAttribute('data-oly-fx') || '').split(/\s+/).filter(Boolean); }
  function sync(el) {
    var rec = null, i;
    for (i = 0; i < attached.length; i++) if (attached[i].el === el) rec = attached[i];
    if (!rec) { rec = { el: el, h: {} }; attached.push(rec); }
    var want = optedOut(el) ? [] : tokens(el).filter(function (n) { return specs[n] && specs[n].kind === 'el' && !specs[n].css && !specs[n].global; });
    Object.keys(rec.h).forEach(function (n) { if (want.indexOf(n) < 0) { rec.h[n].stop(); delete rec.h[n]; } });
    want.forEach(function (n) {
      if (rec.h[n] && !rec.h[n].stopped) return;
      var o = {};
      try { o = JSON.parse(el.getAttribute('data-oly-fx-opts') || '{}') || {}; } catch (e) { o = {}; }
      rec.h[n] = FX[n](el, o);
    });
  }
  function prune() {
    for (var i = attached.length - 1; i >= 0; i--) {
      var r = attached[i];
      if (!r.el.isConnected) { Object.keys(r.h).forEach(function (n) { r.h[n].stop(); }); attached.splice(i, 1); }
    }
  }
  /** wire every [data-oly-fx] under scope (default: the page); the observer below keeps it current */
  FX.attach = function (scope) {
    scope = scope || d;
    var list = scope.querySelectorAll ? scope.querySelectorAll('[data-oly-fx]') : [];
    if (scope.getAttribute && scope.hasAttribute('data-oly-fx')) sync(scope);
    for (var i = 0; i < list.length; i++) sync(list[i]);
    prune(); seen = list.length;
  };
  /** the page-wide switch for the data-oly-fx wiring (also: <html data-oly-fx-ui="off">, [data-oly-fx-off] on any element or ancestor) */
  FX.ui = function (on) {
    uiOff = on === false;
    if (uiOff) root.setAttribute('data-oly-fx-ui', 'off'); else root.removeAttribute('data-oly-fx-ui');
    FX.attach(); return !uiOff;
  };
  var obs = null, timer = 0;
  FX.observe = function () {
    if (obs || !window.MutationObserver || !d.body) return;
    var relevant = function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'attributes') return true;
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType === 1 && (n.hasAttribute('data-oly-fx') || n.querySelector('[data-oly-fx]'))) return true;
        }
        if (r.removedNodes.length && attached.length) return true;
      }
      return false;
    };
    obs = new MutationObserver(function (list) {
      if (timer || !relevant(list)) return;
      timer = setTimeout(function () { timer = 0; FX.attach(); }, 60);
    });
    obs.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-oly-fx', 'data-oly-fx-off', 'data-oly-fx-opts'] });
  };
  FX.wire = function () { FX.attach(); FX.observe(); };

  /** one shared <style> per key (never removed: it is the library's, not an effect's) */
  FX.sheet = function (key, css) {
    if (d.querySelector('style[data-oly-fx-css="' + key + '"]')) return;
    var s = d.createElement('style'); s.setAttribute('data-oly-fx-css', key); s.textContent = css; (d.head || root).appendChild(s);
  };
  window.OLYMPUS_FX = FX;
})();
