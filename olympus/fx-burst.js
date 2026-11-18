/* OLYMPUS FX, bursts (tools/web_public/olympus/fx-burst.js; docs/OLYMPUS_FX.md). Classic script, after fx-core.js.
 *   confetti  sparkleBurst  toast
 * They run once and stop by themselves; every one draws on a pooled particle array, on a capped canvas that is removed at the end. */
(function () {
  'use strict';
  var FX = window.OLYMPUS_FX;
  if (!FX || FX.has('confetti')) return;
  var U = FX.util;

  FX.sheet('burst', [
    '.oly-fx-toasts { position: fixed; left: calc(12px + var(--oly-sl, 0px)); right: calc(12px + var(--oly-sr, 0px)); top: calc(10px + var(--oly-st, 0px)); z-index: 70;',
    '  display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }',
    '.oly-fx-toast { --tc: rgba(var(--oly-accent-rgb, 156, 107, 60), .7); display: flex; align-items: center; gap: 10px; max-width: min(92vw, 420px); padding: 10px 14px 10px 10px;',
    '  border-radius: 14px; background: var(--oly-glass, rgba(9, 11, 22, .82)); border: 1px solid var(--tc); color: var(--oly-text, #f3f5fb);',
    '  font: 600 14px/1.25 var(--oly-ui, system-ui, sans-serif); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);',
    '  box-shadow: 0 8px 28px rgba(0, 0, 0, .45), 0 0 16px rgba(var(--oly-accent-rgb, 156, 107, 60), .3); animation: oly-fx-toast-in .38s cubic-bezier(.34, 1.56, .64, 1) both; }',
    '.oly-fx-toast.ok { --tc: rgba(74, 222, 128, .75); } .oly-fx-toast.bad { --tc: rgba(255, 77, 109, .8); } .oly-fx-toast.warn { --tc: rgba(251, 191, 36, .8); }',
    '.oly-fx-toast.out { animation: oly-fx-toast-out .26s ease-in both; } .oly-fx-toast.still { animation: none; }',
    '.oly-fx-ti { width: 22px; height: 22px; flex: none; border-radius: 50%; display: grid; place-items: center; font: 700 13px/1 var(--oly-display, system-ui, sans-serif);',
    '  color: #05060c; background: var(--tc); font-style: normal; }',
    '@keyframes oly-fx-toast-in { from { opacity: 0; transform: translateY(-16px) scale(.94); } to { opacity: 1; transform: none; } }',
    '@keyframes oly-fx-toast-out { to { opacity: 0; transform: translateY(-10px) scale(.96); } }',
  ].join('\n'));

  var PALETTE = ['#9c6b3c', '#ffcf5a', '#7fa6bd', '#ff6b7f', '#4ade80', '#ffffff'];
  var rect = function (el) {
    if (!el || el === document.body || el === document.documentElement) return { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
    var r = el.getBoundingClientRect();                  // an element scrolled out of view bursts from the nearest screen edge
    return { x: U.clamp(r.left + r.width / 2, 0, window.innerWidth), y: U.clamp(r.top + r.height / 2, 0, window.innerHeight * 0.9) };
  };
  var colorsFor = function (o) {
    if (o.colors && o.colors.length) return o.colors;
    var a = U.accent(), c = PALETTE.slice(); c[0] = 'rgb(' + a.join(',') + ')'; return c;
  };

  // ---------------------------------------------------------------- confetti
  // pool fields: x y vx vy rot vr w h life max color flip
  FX.define('confetti', {
    group: 'bursts', global: true, max: 3, desc: 'a burst of confetti from the element (or the top of the screen); it falls, fades and removes itself', demo: {},
    make: function (el, o, ctx) {
      var n = ctx.count(o.count || 160, o.count ? Math.round(o.count * 0.7) : 110, o.count ? Math.round(o.count * 0.3) : 48);
      var cv = ctx.canvas(null, { fixed: true, z: 70 }), g = cv.g, P = FX.pool(Math.max(1, n), 12), cols = colorsFor(o), o0 = rect(el);
      var life = o.seconds || 2.6, STR = 12;
      for (var i = 0; i < n; i++) {
        var k = P.spawn(), b = k * STR, a = -Math.PI / 2 + (U.rnd() - 0.5) * Math.PI * 0.9, sp = 380 + U.rnd() * 520, d = P.data;
        d[b] = o0.x + (U.rnd() - 0.5) * 20; d[b + 1] = o0.y; d[b + 2] = Math.cos(a) * sp; d[b + 3] = Math.sin(a) * sp;
        d[b + 4] = U.rnd() * 6.28; d[b + 5] = (U.rnd() - 0.5) * 14; d[b + 6] = 5 + U.rnd() * 6; d[b + 7] = 3 + U.rnd() * 5;
        d[b + 8] = 0; d[b + 9] = life * (0.6 + 0.4 * U.rnd()); d[b + 10] = Math.floor(U.rnd() * cols.length); d[b + 11] = U.rnd() * 6.28;
      }
      ctx.tick(function (dt) {
        if (!cv.fit()) return;
        g.clearRect(0, 0, cv.w, cv.h);
        var d = P.data, flip = ctx.tier !== 'low';
        for (var j = 0; j < P.n; j++) {
          if (!P.live[j]) continue;
          var b = j * STR;
          d[b + 8] += dt;
          if (d[b + 8] >= d[b + 9] || d[b + 1] > cv.h + 30) { P.kill(j); continue; }
          d[b + 2] *= 1 - dt * 1.4; d[b + 3] = d[b + 3] * (1 - dt * 1.4) + 760 * dt;
          d[b] += d[b + 2] * dt; d[b + 1] += d[b + 3] * dt; d[b + 4] += d[b + 5] * dt; d[b + 11] += dt * 9;
          var f = 1 - d[b + 8] / d[b + 9];
          g.globalAlpha = f < 0.3 ? f / 0.3 : 1;
          g.fillStyle = cols[d[b + 10]];
          g.save(); g.translate(d[b], d[b + 1]); g.rotate(d[b + 4]);
          if (flip) g.scale(1, Math.cos(d[b + 11]));
          g.fillRect(-d[b + 6] / 2, -d[b + 7] / 2, d[b + 6], d[b + 7]); g.restore();
        }
        g.globalAlpha = 1;
        if (!P.count) ctx.finish();
      });
      return {};
    },
  });

  // ---------------------------------------------------------------- sparkleBurst
  // pool fields: x y vx vy life max size color
  function sparks(ctx, host, o, cx, cy, size) {
    var n = ctx.count(o.count || 28, o.count ? Math.round(o.count * 0.7) : 20, o.count ? Math.round(o.count * 0.35) : 10);
    var cv = ctx.canvas(null, { rect: { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, z: 71 }), g = cv.g, P = FX.pool(Math.max(1, n), 8), cols = colorsFor(o);
    var STR = 8, life = o.seconds || 0.75, mid = size / 2;
    for (var i = 0; i < n; i++) {
      var k = P.spawn(), b = k * STR, a = U.rnd() * 6.2832, sp = 40 + U.rnd() * 130, d = P.data;
      d[b] = mid; d[b + 1] = mid; d[b + 2] = Math.cos(a) * sp; d[b + 3] = Math.sin(a) * sp; d[b + 4] = 0; d[b + 5] = life * (0.5 + 0.5 * U.rnd());
      d[b + 6] = 2 + U.rnd() * 4; d[b + 7] = Math.floor(U.rnd() * cols.length);
    }
    var star = function (x, y, r) {
      g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
      g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
    };
    var ctl = ctx.ticker(function (dt) {
      g.clearRect(0, 0, size, size);
      var d = P.data;
      for (var j = 0; j < P.n; j++) {
        if (!P.live[j]) continue;
        var b = j * STR;
        d[b + 4] += dt;
        if (d[b + 4] >= d[b + 5]) { P.kill(j); continue; }
        d[b + 2] *= 1 - dt * 2.2; d[b + 3] = d[b + 3] * (1 - dt * 2.2) + 90 * dt;
        d[b] += d[b + 2] * dt; d[b + 1] += d[b + 3] * dt;
        var f = 1 - d[b + 4] / d[b + 5];
        g.globalAlpha = f; g.fillStyle = cols[d[b + 7]];
        star(d[b], d[b + 1], d[b + 6] * (0.4 + f));
      }
      g.globalAlpha = 1;
      if (!P.count) { if (o.noFinish) ctl.stop(); else ctx.finish(); }
    });
    ctl.start();
  }
  FX.define('sparkleBurst', {
    group: 'bursts', global: true, max: 4, desc: 'a quick burst of four-point sparks from the element or from opts.x / opts.y', demo: {},
    make: function (el, o, ctx) {
      var c = o.x !== undefined ? { x: o.x, y: o.y } : rect(el);
      sparks(ctx, el, o, c.x, c.y, 240);
      return {};
    },
  });

  // ---------------------------------------------------------------- toast with a spark
  FX.define('toast', {
    group: 'bursts', global: true, max: 3, desc: 'a glass toast that drops in from the top with a spark on its icon, then leaves by itself (opts.text, kind ok|bad|warn, seconds)',
    demo: { text: 'Order filled: +2.4R', kind: 'ok' },
    make: function (body, o, ctx) { return toast(o, ctx, false); },
    still: function (body, o, ctx) { return toast(o, ctx, true); },
  });
  function toast(o, ctx, still) {
    var box = document.querySelector('.oly-fx-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'oly-fx-toasts'; document.body.appendChild(box); }
    ctx.add(function () { if (box && box.parentNode && !box.children.length) box.parentNode.removeChild(box); });
    var kind = o.kind || '', el = ctx.node('div', 'oly-fx-toast ' + kind + (still ? ' still' : ''), box);
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    var sym = { ok: '✓', bad: '✕', warn: '!' }[kind] || 'i';
    var ic = document.createElement('i'); ic.className = 'oly-fx-ti'; ic.textContent = sym; ic.setAttribute('aria-hidden', 'true'); el.appendChild(ic);
    var tx = document.createElement('span'); tx.textContent = o.text || o.message || ''; el.appendChild(tx);
    var ms = (o.seconds || 3.2) * 1000;
    if (!still) {
      ctx.timeout(function () {
        var r = ic.getBoundingClientRect();
        if (r.width) sparks(ctx, ic, { count: 16, colors: kind === 'bad' ? ['#ff4d6d', '#ffb3c0', '#fff'] : kind === 'warn' ? ['#fbbf24', '#fff3c4', '#fff'] : kind === 'ok' ? ['#4ade80', '#b9f5cf', '#fff'] : null, seconds: 0.55, noFinish: true },
          r.left + r.width / 2, r.top + r.height / 2, 120);
      }, 150);
      ctx.timeout(function () { el.classList.add('out'); }, ms);
      ctx.timeout(function () { ctx.finish(); }, ms + 280);
    } else ctx.timeout(function () { ctx.finish(); }, ms);
    return { text: function (t) { tx.textContent = t; }, close: function () { ctx.finish(); } };
  }
})();
