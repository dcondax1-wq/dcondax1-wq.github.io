/* OLYMPUS NQ FX (tools/web_public/olympus/nqfx.js, day-arenas 2026-11-20; docs/DESIGN_SYSTEM.md section 6, docs/OLYMPUS_FX.md).
 * The trading dashboard's effects, on the kit's FX library (fx-core.js: tiers, ONE frame loop, caps, cleanup, reduced motion = off).
 * A classic script; it loads fx-core / fx-text / fx-burst itself when the page has not:
 *   <script src="../olympus/nqfx.js?v=n1" defer></script>      then   await OLYMPUS_NQFX.ready()
 *
 *   NQFX.win(el, { usd, bigAt: 500 })       sparks from el, a gold toast "+$123"; confetti too when usd >= bigAt
 *   NQFX.loss(el, { usd })                  a calm red toast "-$80", no celebration
 *   NQFX.milestone(el, { text })            confetti + a toast (eval passed, payout ready, new high)
 *   NQFX.ring(host, { value, stroke })      the glowing goal ring (0..1); .call('set', v) glides to a new value
 *   NQFX.roll(el, { to, from, duration })   the number rolls up to `to` ($ , . % kept); .call('set', v)
 *   NQFX.trail(pathEl, { color, seconds, width })   a light trail runs along an SVG chart line (<path> / <polyline>), glow under it
 *   NQFX.vault(host, { value, label })      the payout-goal hero: a 3D vault door + gold coin stack (three.js, after load + idle, never
 *                                           blocks the first paint); the door opens and the coins rise with value (0..1); .call('set', v)
 * Every call returns the FX handle { stop(), call(verb, ...), tier }. Tiers follow the owner's quality setting (OLYMPUS.fx()): ultra / high /
 * low (30 fps, fewer particles, pixel ratio 1) / off; prefers-reduced-motion = off: nothing moves, the ring / number / vault show their final
 * state still, toasts show plain. No WebGL, a lost context, Save-Data or a 2G / 3G line: the vault stays its drawn 2D picture.
 */
(function () {
  'use strict';
  if (window.OLYMPUS_NQFX) return;
  var d = document, me = d.currentScript, BASE = me && me.src ? me.src.replace(/[^\/]*$/, '') : '../olympus/';
  var NS = 'http://www.w3.org/2000/svg';
  var readyP = null;

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
      var rgb = U.accent ? U.accent() : [255, 207, 90], color = o.color || 'rgb(' + rgb.join(',') + ')';
      var id = 'nqfx-glow-' + Math.random().toString(36).slice(2, 8), w = +o.width || +getComputedStyle(path).strokeWidth || 2;
      var blur = still ? 3 : ctx.pick(5, 4, 0);
      var defs = svgNode('defs', {}, svg, ctx);
      if (blur) { var f = svgNode('filter', { id: id, x: '-20%', y: '-50%', width: '140%', height: '200%' }, defs, ctx); svgNode('feGaussianBlur', { stdDeviation: String(blur) }, f, ctx); }
      var under = svgNode('path', { fill: 'none', stroke: color, 'stroke-width': String(w * 2.2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: still ? '.35' : '.25', 'pointer-events': 'none' }, null, ctx);
      if (blur) under.setAttribute('filter', 'url(#' + id + ')');
      var comet = still ? null : svgNode('path', { fill: 'none', stroke: o.head || '#fff', 'stroke-width': String(w * 1.6), 'stroke-linecap': 'round', 'pointer-events': 'none' }, null, ctx);
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

    // ------------------------------------------------------------ payoutVault: the 3D payout-goal hero (2D picture first, 3D after idle)
    function weak() {
      try { var c = navigator.connection || {}, m = navigator.deviceMemory; return !!c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')) || (typeof m === 'number' && m < 2); } catch (e) { return false; }
    }
    function picture(host, o, ctx) {
      // the drawn vault: always there first (layout never moves), stays when the 3D cannot run
      var wrap = ctx.node('div', 'nqfx-vault2d', host);
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = '<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet"><defs><radialGradient id="nqv-g" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".6" stop-color="#e3a93a"/><stop offset="1" stop-color="#9a6a1c"/></radialGradient></defs>' +
        '<circle cx="100" cy="72" r="58" fill="#1d1f26" stroke="#3a3d46" stroke-width="6"/><circle cx="100" cy="72" r="44" fill="none" stroke="#565a66" stroke-width="3" stroke-dasharray="4 6"/>' +
        '<g class="nqv-coins"></g><circle cx="100" cy="72" r="10" fill="url(#nqv-g)"/></svg>';
      var coins = wrap.querySelector('.nqv-coins');
      function set(v) {
        v = U.clamp(+v || 0, 0, 1); var n = Math.round(v * 9), html = '';
        for (var i = 0; i < n; i++) html += '<ellipse cx="100" cy="' + (124 - i * 7) + '" rx="26" ry="7" fill="url(#nqv-g)" stroke="#8a5d17" stroke-width="1"/>';
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
        import(BASE + 'nqvault3d.js?v=n1').then(function (m) {
          if (dead) return;
          three = m.mount(host, { value: value, tier: ctx.tier, pick: ctx.pick, tick: ctx.ticker, add: ctx.add,
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
      '.nqfx-vault-label { position: absolute; left: 0; right: 0; bottom: 8px; z-index: 3; text-align: center; color: var(--ag-text, #f3f1ec);',
      '  font: 700 var(--ag-fs-h3, 1.125rem)/1.2 var(--ag-num, system-ui); font-variant-numeric: tabular-nums; text-shadow: 0 1px 6px rgba(0, 0, 0, .6); pointer-events: none; }',
    ].join('\n'));
    FX.define('payoutVault', {
      group: 'numbers', desc: 'the payout-goal hero: a 3D vault door + gold coins that rise with value (0..1), after load + idle; a drawn vault first and without WebGL',
      make: function (el, o, ctx) { return vault(el, o, ctx, false); },
      still: function (el, o, ctx) { return vault(el, o, ctx, true); },
    });
  }

  window.OLYMPUS_NQFX = {
    ready: ready,
    win: function (el, o) {
      o = o || {}; var big = (+o.usd || 0) >= (o.bigAt === undefined ? 500 : +o.bigAt);
      var h = fx('sparkleBurst', el, {}); if (big) fx('confetti', el, { count: o.count || 120 });
      fx('toast', d.body, { text: (o.text || 'Win') + ' ' + usd(o.usd), kind: 'ok', seconds: 3.2 });
      return h;
    },
    loss: function (el, o) { o = o || {}; return fx('toast', d.body, { text: (o.text || 'Loss') + ' ' + usd(-Math.abs(+o.usd || 0)), kind: 'bad', seconds: 3 }); },
    milestone: function (el, o) { o = o || {}; var h = fx('confetti', el, { count: o.count || 160 }); fx('toast', d.body, { text: o.text || 'Milestone', kind: 'ok', seconds: 3.6 }); return h; },
    ring: function (host, o) { return fx('progressRing', host, o || {}); },
    roll: function (el, o) { return fx('countUp', el, o || {}); },
    trail: function (path, o) { return fx('chartTrail', path, o || {}); },
    vault: function (host, o) { return fx('payoutVault', host, o || {}); },
  };
})();
