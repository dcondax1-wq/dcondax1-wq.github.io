/* OLYMPUS FX, cards and buttons (tools/web_public/olympus/fx-ui.js; docs/OLYMPUS_FX.md). Classic script, after fx-core.js.
 *   gradientBorder  shimmer  glow  tilt  magnetic  ripple  glassSpecular  neonPulse  skeleton
 * shimmer / glow / ripple also work with no script at all: olympus.css styles [data-oly-fx~="shimmer|glow|ripple"]. */
(function () {
  'use strict';
  var FX = window.OLYMPUS_FX;
  if (!FX || FX.has('tilt')) return;
  var U = FX.util;

  FX.sheet('ui', [
    '@property --oly-ang { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
    '@keyframes oly-fx-spin { to { --oly-ang: 360deg; } }',
    '.oly-fx-gb { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; padding: var(--gb-w, 1.5px); z-index: 1;',
    '  background: conic-gradient(from var(--oly-ang), var(--gb-c1, var(--oly-accent, #9c6b3c)), var(--gb-c2, #7fa6bd), var(--gb-c3, #ffcf5a), var(--gb-c1, var(--oly-accent, #9c6b3c)));',
    '  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;',
    '  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); animation: oly-fx-spin var(--gb-s, 4s) linear infinite; }',
    '.oly-fx-gb.hi { filter: drop-shadow(0 0 5px rgba(var(--oly-accent-rgb, 156, 107, 60), .55)); }',
    '.oly-fx-gb.still { animation: none; }',
    '.oly-fx-glass { -webkit-backdrop-filter: blur(var(--oly-fx-blur, 12px)) saturate(1.35); backdrop-filter: blur(var(--oly-fx-blur, 12px)) saturate(1.35);',
    '  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .22), inset 0 0 0 1px rgba(255, 255, 255, .05), 0 10px 30px rgba(0, 0, 0, .35); }',
    '.oly-fx-spec { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 1; overflow: hidden;',
    '  background: radial-gradient(160px circle at var(--sx, 30%) var(--sy, 0%), rgba(255, 255, 255, .20), transparent 62%), linear-gradient(135deg, rgba(255, 255, 255, .12), transparent 32%); }',
    '.oly-fx-spec::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;',
    '  background: radial-gradient(110px circle at var(--sx, 30%) var(--sy, 0%), rgba(255, 255, 255, .95), rgba(255, 255, 255, 0) 70%);',
    '  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;',
    '  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }',
    '@keyframes oly-fx-neon { 0%, 100% { box-shadow: 0 0 4px var(--nc-a), 0 0 12px var(--nc-b), inset 0 0 6px var(--nc-a); text-shadow: none; }',
    '  50% { box-shadow: 0 0 8px var(--nc-a), 0 0 26px var(--nc-b), inset 0 0 12px var(--nc-a); text-shadow: none; } }',
    '.oly-fx-neon { border-color: var(--nc) !important; color: var(--nc-text, inherit); animation: oly-fx-neon var(--nc-s, 2.4s) ease-in-out infinite;',
    '  box-shadow: 0 0 6px var(--nc-a), 0 0 16px var(--nc-b), inset 0 0 8px var(--nc-a); }',
    '.oly-fx-neon.still { animation: none; }',
    '@keyframes oly-fx-skel { from { background-position: 120% 0; } to { background-position: -120% 0; } }',
    '.oly-fx-skel { color: transparent !important; pointer-events: none; user-select: none; -webkit-user-select: none; border-color: transparent !important;',
    '  background: linear-gradient(100deg, rgba(255, 255, 255, .05) 30%, rgba(255, 255, 255, .17) 50%, rgba(255, 255, 255, .05) 70%) 0 0 / 300% 100% rgba(255, 255, 255, .04) !important;',
    '  animation: oly-fx-skel 1.4s linear infinite; text-shadow: none !important; }',
    '.oly-fx-skel > * { visibility: hidden; }',
    '.oly-fx-skel.still { animation: none; }',
  ].join('\n'));

  var pos = function (ctx, el) { if (getComputedStyle(el).position === 'static') ctx.style(el, { position: 'relative' }); };
  var rgba = function (a, o) { return 'rgba(' + a.join(',') + ',' + o + ')'; };

  // ---------------------------------------------------------------- gradientBorder
  FX.define('gradientBorder', {
    group: 'cards', desc: 'an animated conic-gradient border that turns around the element',
    demo: {},
    make: function (el, o, ctx) {
      pos(ctx, el);
      var r = ctx.node('i', 'oly-fx-gb', el), s = r.style;
      r.setAttribute('aria-hidden', 'true');
      s.setProperty('--gb-w', (o.width || 1.5) + 'px'); s.setProperty('--gb-s', (o.seconds || 4) + 's');
      (o.colors || []).slice(0, 3).forEach(function (c, i) { s.setProperty('--gb-c' + (i + 1), c); });
      if (ctx.tier === 'ultra') r.classList.add('hi');
      if (ctx.tier === 'low') r.classList.add('still');
      return {};
    },
  });

  // ---------------------------------------------------------------- shimmer (CSS in olympus.css)
  FX.define('shimmer', { group: 'cards', css: true, desc: 'a soft light sweep across the element (CSS only)', demo: {},
    make: function (el, o, ctx) { ctx.cls(el, 'oly-fx-shimmer'); return {}; } });
  FX.define('glow', { group: 'cards', css: true, desc: 'a breathing accent glow around the element (CSS only)', demo: {},
    make: function (el, o, ctx) { ctx.cls(el, 'oly-fx-glow'); return {}; } });

  // ---------------------------------------------------------------- tilt / parallax
  FX.define('tilt', {
    group: 'cards', desc: 'the card leans toward the finger / pointer; children with data-oly-depth shift for parallax', demo: {},
    make: function (el, o, ctx) {
      var max = o.max || ctx.pick(10, 10, 6), persp = o.perspective || 700, cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
      var base = el.style.transform, deep = ctx.tier === 'low' ? [] : [].slice.call(el.querySelectorAll('[data-oly-depth]'));
      var apply = function () {
        el.style.transform = (base ? base + ' ' : '') + 'perspective(' + persp + 'px) rotateX(' + (-cur.y * max).toFixed(2) + 'deg) rotateY(' + (cur.x * max).toFixed(2) + 'deg)';
        for (var i = 0; i < deep.length; i++) {
          var k = parseFloat(deep[i].getAttribute('data-oly-depth')) || 1;
          deep[i].style.translate = (cur.x * k * 8).toFixed(1) + 'px ' + (cur.y * k * 8).toFixed(1) + 'px';
        }
      };
      ctx.add(function () { if (base) el.style.transform = base; else el.style.removeProperty('transform'); deep.forEach(function (n) { n.style.removeProperty('translate'); }); el.style.removeProperty('will-change'); });
      var ctl = ctx.ticker(function (dt) {
        var k = 1 - Math.exp(-dt * 12);
        cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k;
        if (!tgt.x && !tgt.y && Math.abs(cur.x) < 0.002 && Math.abs(cur.y) < 0.002) { cur.x = cur.y = 0; apply(); ctl.stop(); el.style.removeProperty('will-change'); return; }
        apply();
      }, { el: el });
      var move = function (e) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        tgt.x = U.clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1); tgt.y = U.clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
        el.style.willChange = 'transform'; ctl.start();
      };
      var rest = function () { tgt.x = tgt.y = 0; ctl.start(); };
      ctx.on(el, 'pointermove', move, { passive: true }); ctx.on(el, 'pointerdown', move, { passive: true });
      ['pointerleave', 'pointerup', 'pointercancel'].forEach(function (n) { ctx.on(el, n, rest, { passive: true }); });
      return { tilt: function (x, y) { tgt.x = U.clamp(x, -1, 1); tgt.y = U.clamp(y, -1, 1); ctl.start(); } };
    },
  });

  // ---------------------------------------------------------------- magnetic button
  FX.define('magnetic', {
    group: 'buttons', desc: 'the button leans toward a nearby pointer and presses in on tap', demo: {},
    make: function (el, o, ctx) {
      var pull = o.strength || 0.3, R = o.radius || 80, cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
      var ctl = ctx.ticker(function (dt) {
        var k = 1 - Math.exp(-dt * 14);
        cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k;
        if (!tgt.x && !tgt.y && Math.abs(cur.x) < 0.05 && Math.abs(cur.y) < 0.05) { el.style.removeProperty('translate'); ctl.stop(); return; }
        el.style.translate = cur.x.toFixed(1) + 'px ' + cur.y.toFixed(1) + 'px';
      }, { el: el });
      ctx.add(function () { el.style.removeProperty('translate'); el.style.removeProperty('scale'); });
      ctx.on(window, 'pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var reach = R + Math.max(r.width, r.height) / 2;
        if (Math.hypot(dx, dy) < reach) { tgt.x = dx * pull; tgt.y = dy * pull; } else { tgt.x = tgt.y = 0; }
        if (tgt.x || tgt.y || cur.x || cur.y) ctl.start();
      }, { passive: true });
      ctx.on(el, 'pointerdown', function () { el.style.scale = '0.96'; }, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { ctx.on(el, n, function () { el.style.removeProperty('scale'); }, { passive: true }); });
      return {};
    },
  });

  // ---------------------------------------------------------------- ripple (CSS in olympus.css, the origin from here)
  FX.define('ripple', {
    group: 'buttons', desc: 'a light ring grows from the tap point', demo: {},
    make: function (el, o, ctx) {
      ctx.cls(el, 'oly-fx-ripple');
      ctx.add(function () { el.classList.remove('oly-fx-rip-go'); el.style.removeProperty('--oly-ox'); el.style.removeProperty('--oly-oy'); });
      ctx.on(el, 'pointerdown', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--oly-ox', (e.clientX - r.left).toFixed(0) + 'px'); el.style.setProperty('--oly-oy', (e.clientY - r.top).toFixed(0) + 'px');
        el.classList.remove('oly-fx-rip-go'); void el.offsetWidth; el.classList.add('oly-fx-rip-go');
      }, { passive: true });
      ctx.on(el, 'animationend', function (e) { if (e.animationName === 'oly-fx-rip') el.classList.remove('oly-fx-rip-go'); });
      return { pulse: function () { el.classList.remove('oly-fx-rip-go'); void el.offsetWidth; el.classList.add('oly-fx-rip-go'); } };
    },
  });

  // ---------------------------------------------------------------- glass blur with a specular edge
  FX.define('glassSpecular', {
    group: 'cards', desc: 'frosted glass with a lit edge: the highlight follows the pointer (and drifts by itself on ultra)', demo: {},
    make: function (el, o, ctx) {
      pos(ctx, el);
      ctx.cls(el, 'oly-fx-glass');
      ctx.style(el, { '--oly-fx-blur': ctx.pick(18, 12, 0) + 'px' });
      var spec = ctx.node('i', 'oly-fx-spec', el), sx = 30, sy = 0, tx = 30, ty = 0, drift = ctx.tier === 'ultra', idle = 0;
      spec.setAttribute('aria-hidden', 'true');
      var ctl = ctx.ticker(function (dt, t) {
        if (drift && idle <= 0) { tx = 50 + 36 * Math.sin(t * 0.5); ty = 20 + 18 * Math.cos(t * 0.37); } else idle -= dt;
        var k = 1 - Math.exp(-dt * 10);
        sx += (tx - sx) * k; sy += (ty - sy) * k;
        spec.style.setProperty('--sx', sx.toFixed(1) + '%'); spec.style.setProperty('--sy', sy.toFixed(1) + '%');
        if (!drift && Math.abs(tx - sx) < 0.1 && Math.abs(ty - sy) < 0.1) ctl.stop();
      }, { el: el });
      ctx.on(el, 'pointermove', function (e) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        tx = (e.clientX - r.left) / r.width * 100; ty = (e.clientY - r.top) / r.height * 100; idle = 1.5; ctl.start();
      }, { passive: true });
      if (drift) ctl.start(); else { spec.style.setProperty('--sx', '30%'); spec.style.setProperty('--sy', '0%'); }
      return {};
    },
    still: function (el, o, ctx) { ctx.cls(el, 'oly-fx-glass'); ctx.style(el, { '--oly-fx-blur': '8px' }); return {}; },
  });

  // ---------------------------------------------------------------- neon pulse
  FX.define('neonPulse', {
    group: 'buttons', desc: 'a neon edge that breathes (static on low)', demo: {},
    make: function (el, o, ctx) {
      var c = o.color || null, rgb = c ? null : U.accent();
      ctx.cls(el, 'oly-fx-neon');
      var st = { '--nc': c || rgba(rgb, 1), '--nc-a': c || rgba(rgb, 0.85), '--nc-b': c ? c : rgba(rgb, 0.45), '--nc-s': (o.seconds || 2.4) + 's' };
      ctx.style(el, st);
      if (ctx.tier === 'low') el.classList.add('still');
      ctx.add(function () { el.classList.remove('still'); });
      return {};
    },
  });

  // ---------------------------------------------------------------- skeleton shimmer
  FX.define('skeleton', {
    group: 'cards', desc: 'a loading placeholder: the content hides behind a moving sheen until stop()', demo: {},
    make: function (el, o, ctx) {
      ctx.cls(el, 'oly-fx-skel');
      var had = el.getAttribute('aria-busy');
      el.setAttribute('aria-busy', 'true');
      ctx.add(function () { if (had === null) el.removeAttribute('aria-busy'); else el.setAttribute('aria-busy', had); el.classList.remove('still'); });
      if (ctx.tier === 'low') el.classList.add('still');
      return {};
    },
    still: function (el, o, ctx) { ctx.cls(el, 'oly-fx-skel'); el.classList.add('still'); ctx.add(function () { el.classList.remove('still'); }); return {}; },
  });

  // ---------------------------------------------------------------- AGORA press depth and page-enter stagger (2026-11-11, the effects pass)
  FX.sheet('ui-agora', [
    '.oly-fx-press { transition: transform .22s cubic-bezier(.2, .8, .2, 1), box-shadow .22s cubic-bezier(.2, .8, .2, 1), filter .22s ease-out; will-change: transform; }',
    '.oly-fx-press.down { transform: translateY(1.5px) scale(var(--press-s, .985)); box-shadow: 0 2px 6px rgba(0, 0, 0, .38), inset 0 1px 0 rgba(0, 0, 0, .18) !important;',
    '  filter: brightness(.96); transition-duration: .09s; }',
    '.oly-fx-press.lite.down { transform: translateY(1px); filter: none; }',
    '@keyframes oly-fx-enter { from { opacity: 0; transform: translateY(var(--enter-y, 10px)); } to { opacity: 1; transform: none; } }',
    '@keyframes oly-fx-enter-lite { from { opacity: 0; } to { opacity: 1; } }',
    '.oly-fx-enter { animation: oly-fx-enter .42s cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--enter-d, 0s); }',
    '.oly-fx-enter.lite { animation-name: oly-fx-enter-lite; animation-duration: .25s; }',
  ].join('\n'));

  FX.define('press', {
    group: 'cards', desc: 'the card or button sinks a little under the finger (depth, a closer shadow) and springs back; no glow', demo: {},
    make: function (el, o, ctx) {
      ctx.cls(el, 'oly-fx-press');
      if (ctx.tier === 'low') ctx.cls(el, 'lite');
      if (o.scale) ctx.style(el, { '--press-s': String(o.scale) });
      var up = function () { el.classList.remove('down'); };
      ctx.on(el, 'pointerdown', function (e) { if (e.button > 0) return; el.classList.add('down'); }, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(function (n) { ctx.on(el, n, up, { passive: true }); });
      ctx.on(el, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') el.classList.add('down'); });
      ctx.on(el, 'keyup', up);
      ctx.add(up);
      return { pulse: function () { el.classList.add('down'); ctx.timeout(up, 140); } };
    },
  });

  FX.define('stagger', {
    group: 'cards', desc: 'page enter: the children rise into place one after another (40 ms apart, all in by 480 ms); reduced motion shows them at once',
    demo: {},
    make: function (el, o, ctx) {
      var kids = o.selector ? el.querySelectorAll(o.selector) : el.children, n = Math.min(kids.length, o.max || 24), step = o.step || 40, cap = o.cap || 480;
      for (var i = 0; i < n; i++) {
        var k = kids[i];
        ctx.cls(k, 'oly-fx-enter');
        if (ctx.tier === 'low') ctx.cls(k, 'lite');
        ctx.style(k, { '--enter-d': (Math.min(cap - 250, i * step) / 1000).toFixed(3) + 's' });
      }
      var last = n ? Math.min(cap, (n - 1) * step + 420) : 0;
      ctx.timeout(function () { for (var j = 0; j < n; j++) kids[j].classList.remove('oly-fx-enter', 'lite'); }, last + 60);
      return { play: function () { for (var j = 0; j < n; j++) { kids[j].classList.remove('oly-fx-enter'); void kids[j].offsetWidth; kids[j].classList.add('oly-fx-enter'); } } };
    },
  });
})();
