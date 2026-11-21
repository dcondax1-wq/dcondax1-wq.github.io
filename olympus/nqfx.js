/* OLYMPUS NQ FX (olympus/nqfx.js; docs/DESIGN_SYSTEM.md section 6, research/handoff/2026-11-20/nq4/FX_API.md): the trading dashboard's
 * effects on fx-core.js. NQFX.theme / win / loss / milestone / ring / roll / trail / vault; each returns an FX handle { stop(), call() }.
 * Tiers follow OLYMPUS.fx(); reduced motion = still final states; no WebGL / Save-Data / 2G-3G = the drawn vault. */
(function () {
  'use strict';
  if (window.OLYMPUS_NQFX) return;
  var d = document, me = d.currentScript, BASE = me && me.src ? me.src.replace(/[^\/]*$/, '') : '../olympus/';
  var NS = 'http://www.w3.org/2000/svg';
  var readyP = null;
  // OLYMPUS NIGHT (slot names kept for NQFX.theme callers)
  var THEME = { base: '#000000', cyan: '#9d59ee', cyanHi: '#dacbf0', blue: '#4d2e76', violet: '#f1c14b', win: '#77db89', loss: '#ef4444', steel: '#8d8a9a' };
  function hex(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, k) { var x = hex(a), y = hex(b); if (!x || !y) return a; return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * k); }).join(',') + ')'; }

  function script(src) {
    return new Promise(function (res) { var s = d.createElement('script'); s.src = src; s.async = true; s.onload = function () { res(true); }; s.onerror = function () { res(false); }; (d.head || d.documentElement).appendChild(s); });
  }
  function ready() {
    if (readyP) return readyP;
    readyP = (window.OLYMPUS_FX ? Promise.resolve(true) : script(BASE + 'fx-core.js?v=f1')).then(function () {
      var FX = window.OLYMPUS_FX; if (!FX) return null;
      return Promise.all([FX.has('countUp') ? 1 : FX.load('text'), FX.has('confetti') ? 1 : FX.load('burst')]).then(function () { define(FX); return FX; });
    });
    return readyP;
  }
  var usd = function (n) { var a = Math.abs(Math.round(+n || 0)); return (n < 0 ? '-$' : '+$') + a.toLocaleString('en-US'); };
  var noop = { stop: function () {}, call: function () {}, tier: 'off', stopped: true };
  function fx(name, target, opts) { var FX = window.OLYMPUS_FX; return FX && FX[name] ? FX[name](target, opts) : noop; }

  var defined = false;
  function define(FX) {
    if (defined || FX.has('chartTrail')) { defined = true; return; }
    defined = true;
    var U = FX.util;

    // ------------------------------------------------------------ chartTrail: a light runs along an SVG chart line
    function svgNode(tag, attrs, parent, ctx) {
      var n = d.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(n); ctx.add(function () { if (n.parentNode) n.parentNode.removeChild(n); }); return n;
    }
    function trail(path, o, ctx, still) {
      if (!path || !path.getTotalLength) return {};
      var svg = path.ownerSVGElement; if (!svg) return {};
      var color = o.color || THEME.cyan;
      var id = 'nqfx-glow-' + Math.random().toString(36).slice(2, 8), w = +o.width || +getComputedStyle(path).strokeWidth || 2;
      var blur = still ? 3 : ctx.pick(5, 4, 0);
      var defs = svgNode('defs', {}, svg, ctx);
      if (blur) { var f = svgNode('filter', { id: id, x: '-20%', y: '-50%', width: '140%', height: '200%' }, defs, ctx); svgNode('feGaussianBlur', { stdDeviation: String(blur) }, f, ctx); }
      var under = svgNode('path', { fill: 'none', stroke: color, 'stroke-width': String(w * 2.2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: still ? '.35' : '.25', 'pointer-events': 'none' }, null, ctx);
      if (blur) under.setAttribute('filter', 'url(#' + id + ')');
      var comet = still ? null : svgNode('path', { fill: 'none', stroke: o.head || THEME.cyanHi, 'stroke-width': String(w * 1.6), 'stroke-linecap': 'round', 'pointer-events': 'none' }, null, ctx);
      var glowC = still ? null : svgNode('path', { fill: 'none', stroke: color, 'stroke-width': String(w * 4), 'stroke-linecap': 'round', opacity: '.7', 'pointer-events': 'none' }, null, ctx);
      if (glowC && blur) glowC.setAttribute('filter', 'url(#' + id + ')');
      var len = 0;
      function sync() {
        var dd = path.getAttribute('d'), pts = path.getAttribute('points');
        [under, comet, glowC].forEach(function (n) {
          if (!n) return;
          if (path.tagName.toLowerCase() === 'polyline' && pts) { n.setAttribute('d', 'M' + pts.trim().split(/\s+/).join('L')); }
          else n.setAttribute('d', dd || '');
          var tr = path.getAttribute('transform'); if (tr) n.setAttribute('transform', tr); else n.removeAttribute('transform');
        });
        try { len = path.getTotalLength(); } catch (e) { len = 0; }
        var seg = Math.max(20, len * (o.tail || .14));
        [comet, glowC].forEach(function (n) { if (n) n.setAttribute('stroke-dasharray', seg + ' ' + (len + seg)); });
      }
      // under the line (glow) and over it (the comet), in the line's own group
      path.parentNode.insertBefore(under, path);
      if (glowC) path.parentNode.insertBefore(glowC, path.nextSibling);
      if (comet) path.parentNode.insertBefore(comet, glowC ? glowC.nextSibling : path.nextSibling);
      sync();
      var mo = new MutationObserver(sync); mo.observe(path, { attributes: true, attributeFilter: ['d', 'points', 'transform'] }); ctx.add(function () { mo.disconnect(); });
      if (still) return { sync: sync };
      var period = (+o.seconds || 2.6), rest = o.rest === undefined ? 1.2 : +o.rest, t = 0;
      ctx.tick(function (dt) {
        t = (t + dt) % (period + rest);
        var k = Math.min(1, t / period), e = 1 - Math.pow(1 - k, 2), seg = Math.max(20, len * (o.tail || .14));
        var off = String(seg - e * (len + seg));
        comet.setAttribute('stroke-dashoffset', off); glowC.setAttribute('stroke-dashoffset', off);
        var a = k >= 1 ? 0 : String(Math.min(1, k * 6, (1 - k) * 6));
        comet.setAttribute('opacity', a); glowC.setAttribute('opacity', String(a * .7));
      }, { el: svg });
      return { sync: sync };
    }
    FX.define('chartTrail', {
      group: 'numbers', desc: 'a light trail runs along an SVG chart line (path / polyline) with a soft glow under it; follows the line when the app redraws it',
      make: function (el, o, ctx) { return trail(el, o, ctx, false); },
      still: function (el, o, ctx) { return trail(el, o, ctx, true); },
    });

    // ------------------------------------------------------------ nqRing: the goal ring in the NQ colours
    function rgba(c, a) { var x = hex(c) || [34, 211, 238]; return 'rgba(' + x.join(',') + ',' + a + ')'; }
    function nqRing(el, o, ctx, still) {
      var cv = ctx.canvas(el, { z: 2 }), g = cv.g, value = U.clamp(+o.value || 0, 0, 1), shown = still ? value : 0, stroke = o.stroke || 8;
      var a = o.from || THEME.cyan, b = o.to || THEME.blue, full = o.full || THEME.violet;
      var draw = function (t) {
        if (!cv.fit()) return;
        var w = cv.w, h = cv.h, r = Math.min(w, h) / 2 - stroke * 1.6, cx = w / 2, cy = h / 2, a0 = -Math.PI / 2;
        g.clearRect(0, 0, w, h); g.lineCap = 'round';
        g.lineWidth = stroke; g.strokeStyle = 'rgba(148,197,255,0.12)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        if (shown <= 0.001) return;
        var end = a0 + Math.PI * 2 * shown, done = shown >= .999;
        var grad = g.createLinearGradient(cx, cy - r, cx, cy + r);
        grad.addColorStop(0, done ? full : a); grad.addColorStop(1, done ? full : mix(a, b, Math.max(.35, shown)));
        if (!still) { g.lineWidth = stroke * 2.4; g.strokeStyle = rgba(done ? full : a, .16); g.beginPath(); g.arc(cx, cy, r, a0, end); g.stroke(); }   // the glow
        g.lineWidth = stroke; g.strokeStyle = grad; g.beginPath(); g.arc(cx, cy, r, a0, end); g.stroke();
        var hx = cx + Math.cos(end) * r, hy = cy + Math.sin(end) * r;
        if (still) { g.fillStyle = '#e0f7ff'; g.beginPath(); g.arc(hx, hy, stroke * .5, 0, Math.PI * 2); g.fill(); return; }
        var hr = stroke * (1.5 + .25 * Math.sin(t * 5)), tip = done ? full : b;
        var gr = g.createRadialGradient(hx, hy, 0, hx, hy, hr * 1.6);
        gr.addColorStop(0, 'rgba(224,247,255,0.95)'); gr.addColorStop(.35, rgba(tip, .65)); gr.addColorStop(1, rgba(tip, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, hr * 1.6, 0, Math.PI * 2); g.fill();
      };
      draw(0);
      if (still) return { set: function (v) { value = shown = U.clamp(+v || 0, 0, 1); draw(0); } };
      var ctl = ctx.ticker(function (dt, t) {
        shown += (value - shown) * (1 - Math.exp(-dt * 5));
        if (Math.abs(value - shown) < 0.0005) shown = value;
        draw(t);
        if (shown === value && ctx.tier === 'low') ctl.stop();
      }, { el: el });
      ctl.start();
      return { set: function (v) { value = U.clamp(+v || 0, 0, 1); ctl.start(); } };
    }
    FX.define('nqRing', {
      group: 'numbers', desc: 'the NQ goal ring: a cyan -> blue gradient arc with a soft glow and a bright tip, violet at 100%; set(v) glides',
      make: function (el, o, ctx) { return nqRing(el, o, ctx, false); },
      still: function (el, o, ctx) { return nqRing(el, o, ctx, true); },
    });

    // ------------------------------------------------------------ payoutVault: the 3D payout-goal hero (2D picture first, 3D after idle)
    function weak() {
      try { var c = navigator.connection || {}, m = navigator.deviceMemory; return !!c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')) || (typeof m === 'number' && m < 2); } catch (e) { return false; }
    }
    function picture(host, o, ctx) {
      // the drawn vault: always there first (layout never moves), stays when the 3D cannot run
      var wrap = ctx.node('div', 'nqfx-vault2d', host);
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = '<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="nqv-t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3cad4"/><stop offset=".5" stop-color="' + THEME.steel + '"/><stop offset="1" stop-color="#5b6474"/></linearGradient></defs>' +
        '<rect width="200" height="150" fill="' + THEME.base + '"/><circle cx="100" cy="72" r="58" fill="url(#nqv-t)" stroke="#3a4252" stroke-width="5"/>' +
        '<circle cx="100" cy="72" r="47" fill="none" stroke="' + THEME.cyan + '" stroke-width="2" opacity=".9"/><circle cx="100" cy="72" r="47" fill="none" stroke="' + THEME.cyan + '" stroke-width="6" opacity=".18"/>' +
        '<g class="nqv-coins"></g><circle cx="100" cy="72" r="9" fill="' + THEME.violet + '"/></svg>';
      var coins = wrap.querySelector('.nqv-coins');
      function set(v) {
        v = U.clamp(+v || 0, 0, 1); var n = Math.round(v * 9), html = '';
        for (var i = 0; i < n; i++) html += '<rect x="76" y="' + (118 - i * 7) + '" width="48" height="6" rx="1.5" fill="' + (i % 2 ? THEME.blue : THEME.cyan) + '" opacity=".92"/>';
        coins.innerHTML = html;
      }
      set(o.value);
      return { el: wrap, set: set };
    }
    function vault(host, o, ctx, still) {
      ctx.cls(host, 'nqfx-vault');
      if (getComputedStyle(host).position === 'static') ctx.style(host, { position: 'relative' });
      var pic = picture(host, o, ctx), value = U.clamp(+o.value || 0, 0, 1), three = null, dead = false;
      var label = ctx.node('div', 'nqfx-vault-label', host, o.label || Math.round(value * 100) + '%');
      host.setAttribute('role', host.getAttribute('role') || 'img');
      var aria = function () { host.setAttribute('aria-label', (o.aria || 'Payout goal') + ': ' + Math.round(value * 100) + '%' + (o.label ? ', ' + o.label : '')); };
      aria();
      ctx.add(function () { dead = true; if (three) { try { three.stop(); } catch (e) { /* gone */ } three = null; } });
      var api = { set: function (v, lab) { value = U.clamp(+v || 0, 0, 1); pic.set(value); if (lab !== undefined) o.label = lab; label.textContent = o.label || Math.round(value * 100) + '%'; aria(); if (three) three.set(value); } };
      if (still || weak() || !(window.WebGLRenderingContext || window.WebGL2RenderingContext)) { host.setAttribute('data-nqfx-vault', '2d'); return api; }
      var go = function () {
        if (dead || d.hidden) return;
        import(BASE + 'nqvault3d.js?v=n3').then(function (m) {
          if (dead) return;
          three = m.mount(host, { value: value, tier: ctx.tier, pick: ctx.pick, tick: ctx.ticker, add: ctx.add, theme: Object.assign({}, THEME),
            lost: function () { three = null; pic.el.style.opacity = '1'; host.setAttribute('data-nqfx-vault', '2d'); } });
          if (three) { host.setAttribute('data-nqfx-vault', '3d'); requestAnimationFrame(function () { if (!dead) pic.el.style.opacity = '0'; }); }
          else host.setAttribute('data-nqfx-vault', '2d');
        }, function () { host.setAttribute('data-nqfx-vault', '2d'); });
      };
      var idle = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 2000 }); } : function (f) { setTimeout(f, 300); };
      var later = function () { idle(function () { requestAnimationFrame(function () { setTimeout(go, 0); }); }); };
      if (d.readyState === 'complete') later(); else ctx.on(window, 'load', later, { once: true });
      host.setAttribute('data-nqfx-vault', 'waiting');
      return api;
    }
    FX.sheet('nqfx', [
      '.nqfx-vault { overflow: hidden; isolation: isolate; }',
      '.nqfx-vault2d { position: absolute; inset: 0; transition: opacity .5s; }',
      '.nqfx-vault2d svg { width: 100%; height: 100%; display: block; }',
      '.nqfx-vault > canvas.nqfx-gl { position: absolute; inset: 0; width: 100% !important; height: 100% !important; opacity: 0; transition: opacity .6s; }',
      '.nqfx-vault > canvas.nqfx-gl.on { opacity: 1; }',
      '.nqfx-vault-label { position: absolute; left: 0; right: 0; bottom: 8px; z-index: 3; text-align: center; color: #e6f6ff;',
      '  font: 700 var(--ag-fs-h3, 1.125rem)/1.2 var(--ag-num, system-ui); font-variant-numeric: tabular-nums; text-shadow: 0 1px 6px rgba(0, 0, 0, .6); pointer-events: none; }',
    ].join('\n'));
    FX.define('payoutVault', {
      group: 'numbers', desc: 'the payout-goal hero: a titanium 3D vault door (cyan seam) + crystal bars that stack with value (0..1), after load + idle; a drawn vault first and without WebGL',
      make: function (el, o, ctx) { return vault(el, o, ctx, false); },
      still: function (el, o, ctx) { return vault(el, o, ctx, true); },
    });
  }

  window.OLYMPUS_NQFX = {
    ready: ready,
    /** the colours: NQFX.theme({ cyan: '#..' }) merges and returns the palette; effects started after the call use it */
    theme: function (t) { if (t && typeof t === 'object') for (var k in t) if (hex(t[k])) THEME[k] = t[k]; return Object.assign({}, THEME); },
    win: function (el, o) {
      o = o || {}; var big = (+o.usd || 0) >= (o.bigAt === undefined ? 500 : +o.bigAt);
      var h = fx('sparkleBurst', el, { colors: [THEME.win, '#86efac', THEME.cyan] }); if (big) fx('confetti', el, { count: o.count || 120, colors: [THEME.win, THEME.cyan, THEME.blue, '#ffffff'] });
      fx('toast', d.body, { text: (o.text || 'Win') + ' ' + usd(o.usd), kind: 'ok', seconds: 3.2 });
      return h;
    },
    loss: function (el, o) { o = o || {}; return fx('toast', d.body, { text: (o.text || 'Loss') + ' ' + usd(-Math.abs(+o.usd || 0)), kind: 'bad', seconds: 3 }); },
    milestone: function (el, o) { o = o || {}; var h = fx('confetti', el, { count: o.count || 160, colors: [THEME.cyan, THEME.blue, THEME.violet, '#e0f7ff'] }); fx('toast', d.body, { text: o.text || 'Milestone', kind: 'ok', seconds: 3.6 }); return h; },
    ring: function (host, o) { return fx('nqRing', host, o || {}); },
    roll: function (el, o) { return fx('countUp', el, o || {}); },
    trail: function (path, o) { return fx('chartTrail', path, o || {}); },
    vault: function (host, o) { return fx('payoutVault', host, o || {}); },
  };
})();
