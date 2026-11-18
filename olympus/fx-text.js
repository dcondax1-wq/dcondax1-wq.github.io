/* OLYMPUS FX, numbers and text (tools/web_public/olympus/fx-text.js; docs/OLYMPUS_FX.md). Classic script, after fx-core.js.
 *   odometer  countUp  typewriter  glitch  progressRing
 * The element's text is always the real text again when an effect is idle or stopped (screen readers and the app's own code see it). */
(function () {
  'use strict';
  var FX = window.OLYMPUS_FX;
  if (!FX || FX.has('odometer')) return;
  var U = FX.util;

  FX.sheet('text', [
    '.oly-odo { display: inline-block; line-height: var(--odo-h, 1.2em); font-variant-numeric: tabular-nums; white-space: pre; vertical-align: baseline; }',
    '.oly-odo-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }',
    '.oly-odo-s { display: inline-block; height: var(--odo-h, 1.2em); }',
    '.oly-odo-s::before { content: attr(data-g); }',
    '.oly-odo-d { display: inline-block; height: var(--odo-h, 1.2em); overflow: hidden; vertical-align: top; }',
    '.oly-odo-c { display: block; animation: oly-odo-roll var(--odo-t, .62s) cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--odo-d, 0s); }',
    '.oly-odo-c.dn { animation-name: oly-odo-roll-dn; }',
    '.oly-odo-c i { display: block; height: var(--odo-h, 1.2em); font-style: normal; }',
    '.oly-odo-c i::before { content: attr(data-g); }',
    '@keyframes oly-odo-roll { from { transform: translateY(0); } to { transform: translateY(calc(var(--odo-n, 1) * var(--odo-h, 1.2em) * -1)); } }',
    '@keyframes oly-odo-roll-dn { from { transform: translateY(calc(var(--odo-n, 1) * var(--odo-h, 1.2em) * -1)); } to { transform: translateY(0); } }',
    '.oly-fx-caret { display: inline-block; margin-left: 1px; animation: oly-fx-blink 1s steps(2, start) infinite; color: var(--oly-accent, currentColor); }',
    '@keyframes oly-fx-blink { to { visibility: hidden; } }',
    '@keyframes oly-fx-gl { 0% { transform: translate(0); clip-path: inset(0 0 0 0); text-shadow: 2px 0 rgba(75,122,153, .8), -2px 0 rgba(201,106,74, .8); }',
    '  25% { transform: translate(-2px, 1px); clip-path: inset(12% 0 55% 0); text-shadow: -3px 0 rgba(75,122,153, .8), 3px 0 rgba(201,106,74, .8); }',
    '  50% { transform: translate(2px, -1px); clip-path: inset(58% 0 8% 0); text-shadow: 3px 0 rgba(75,122,153, .8), -3px 0 rgba(201,106,74, .8); }',
    '  75% { transform: translate(-1px, 0); clip-path: inset(30% 0 30% 0); text-shadow: -2px 0 rgba(75,122,153, .8), 2px 0 rgba(201,106,74, .8); }',
    '  100% { transform: translate(0); clip-path: inset(0 0 0 0); text-shadow: none; } }',
    '.oly-fx-glitch.on { animation: oly-fx-gl .3s steps(1, end) 1; }',
    '.oly-fx-glitch.lite.on { animation-name: oly-fx-gl-lite; }',
    '@keyframes oly-fx-gl-lite { 0%, 50% { text-shadow: 2px 0 rgba(75,122,153, .8), -2px 0 rgba(201,106,74, .8); } 100% { text-shadow: none; } }',
  ].join('\n'));

  // ---------------------------------------------------------------- number parsing / formatting
  function parts(txt) {                                  // "$1,234.50 R" -> { pre: "$", num: 1234.5, dec: 2, group: true, post: " R" }
    var m = /^(\D*?)(-?[\d,]*\.?\d+)(.*)$/.exec(String(txt).trim());
    if (!m) return null;
    var raw = m[2], dot = raw.indexOf('.');
    return { pre: m[1], num: parseFloat(raw.replace(/,/g, '')), dec: dot >= 0 ? raw.length - dot - 1 : 0, group: raw.indexOf(',') >= 0, post: m[3] };
  }
  function fmt(p, v) {
    var s = Math.abs(v).toFixed(p.dec);
    if (p.group) { var a = s.split('.'); a[0] = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = a.join('.'); }
    return p.pre + (v < 0 && Math.abs(v) >= Math.pow(10, -p.dec) / 2 ? '-' : '') + s + p.post;
  }

  // ---------------------------------------------------------------- odometer
  FX.define('odometer', {
    group: 'numbers', desc: 'digits roll like an odometer whenever the element\'s number changes (watches the text, so app code needs no change)',
    demo: { to: ['1,284', '1,291', '2,006', '987'] },
    make: function (el, o, ctx) {
      var cur = el.textContent, anim = null, mo = null, lh = 0;
      var plain = function (txt) { if (el.textContent !== txt || el.querySelector('.oly-odo')) { el.textContent = txt; if (mo) mo.takeRecords(); } cur = txt; };
      var done = function () { if (!anim) return; var a = anim; anim = null; plain(a.next); };
      ctx.add(function () { var n = anim ? anim.next : cur; anim = null; if (el.querySelector('.oly-odo')) el.textContent = n; });
      var roll = function (next) {
        if (anim) { var n = anim.next; anim = null; plain(n); }
        var prev = cur;
        if (prev === next) return;
        if (!/\d/.test(next) || !/\d/.test(prev)) { plain(next); return; }
        lh = lh || parseFloat(getComputedStyle(el).lineHeight) || (parseFloat(getComputedStyle(el).fontSize) || 16) * 1.2;
        var up = (parseFloat(next.replace(/[^\d.\-]/g, '')) || 0) >= (parseFloat(prev.replace(/[^\d.\-]/g, '')) || 0);
        var wrap = document.createElement('span'), sr = document.createElement('span'), n = next.length, ms = (o.duration || 0.62);
        wrap.className = 'oly-odo'; wrap.setAttribute('aria-hidden', 'true'); wrap.style.setProperty('--odo-h', lh + 'px'); wrap.style.setProperty('--odo-t', ms + 's');
        sr.className = 'oly-odo-sr'; sr.textContent = next;
        var last = null;
        for (var i = 0; i < n; i++) {
          var ch = next.charAt(i), pc = prev.charAt(prev.length - n + i);
          if (!/\d/.test(ch)) { var s = document.createElement('span'); s.className = 'oly-odo-s'; s.setAttribute('data-g', ch); wrap.appendChild(s); continue; }
          var pd = /\d/.test(pc) ? +pc : 0, nd = +ch, col = document.createElement('span'), box = document.createElement('span');
          box.className = 'oly-odo-d';
          if (pd === nd && /\d/.test(pc)) { col.className = 'oly-odo-c'; col.style.animation = 'none'; var one = document.createElement('i'); one.setAttribute('data-g', ch); col.appendChild(one); }
          else {
            var steps = up ? (nd - pd + 10) % 10 || 10 : (pd - nd + 10) % 10 || 10, list = [], k;
            for (k = 0; k <= steps; k++) list.push(up ? (pd + k) % 10 : (nd + steps - k + 10) % 10);
            if (!up) list = list.reverse().reverse();
            list.forEach(function (g) { var it = document.createElement('i'); it.setAttribute('data-g', String(g)); col.appendChild(it); });
            col.className = 'oly-odo-c' + (up ? '' : ' dn'); col.style.setProperty('--odo-n', String(steps));
            col.style.setProperty('--odo-d', ((n - 1 - i) * 0.035).toFixed(3) + 's');
            last = col;
          }
          box.appendChild(col); wrap.appendChild(box);
        }
        el.textContent = ''; el.appendChild(sr); el.appendChild(wrap); mo.takeRecords();
        anim = { next: next }; cur = next;
        ctx.timeout(done, ms * 1000 + n * 35 + 120);
        if (last) last.addEventListener('animationend', function () { if (anim && anim.next === next) done(); }, { once: true });
      };
      if (window.MutationObserver) {
        mo = new MutationObserver(function () {
          var t = el.textContent;
          if (anim) { if (t === anim.next) return; anim = null; }       // app code wrote while rolling: take its text and roll to it
          if (t !== cur) { var from = cur; plain(from); roll(t); }
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        ctx.add(function () { mo.disconnect(); });
      }
      if (o.from !== undefined) { var target = cur; plain(String(o.from)); roll(target); }
      return { set: function (v) { el.textContent = String(v); } };      // the observer above rolls to it
    },
  });

  // the number an element shows (or opts.to) with its prefix / suffix / decimals / grouping
  function numParts(el, o) {
    var q = parts(el.textContent), p;
    if (typeof o.to === 'number') {
      p = { pre: o.prefix !== undefined ? o.prefix : q ? q.pre : '', num: o.to, post: o.suffix !== undefined ? o.suffix : q ? q.post : '',
        dec: o.decimals !== undefined ? o.decimals : q ? q.dec : (String(o.to).split('.')[1] || '').length,
        group: o.group !== undefined ? !!o.group : !!(q && q.group) || Math.abs(o.to) >= 10000 };
    } else p = (o.to !== undefined ? parts(String(o.to)) : q) || { pre: '', num: 0, dec: 0, group: false, post: '' };
    return p;
  }

  // ---------------------------------------------------------------- countUp
  FX.define('countUp', {
    group: 'numbers', desc: 'the number counts up from 0 (or opts.from) to its value with an ease-out; set(v) counts on to a new value', demo: { to: 12840 },
    make: function (el, o, ctx) {
      var p = numParts(el, o);
      var from = o.from || 0, to = p.num, v = from, dur = o.duration || 1.2, t = 0;
      var write = function (x) { el.textContent = fmt(p, x); };
      var finalText = fmt(p, to);
      ctx.add(function () { el.textContent = fmt(p, to); });
      write(from);
      var ctl = ctx.ticker(function (dt) {
        t += dt;
        var k = Math.min(1, t / dur); v = from + (to - from) * U.ease(k);
        write(k >= 1 ? to : v);
        if (k >= 1) ctl.stop();
      }, { el: el, fps: ctx.tier === 'low' ? 20 : 0 });
      ctl.start();
      return {
        set: function (x) { from = v; to = +x; t = 0; finalText = fmt(p, to); ctl.start(); },
        text: function () { return finalText; },
      };
    },
    still: function (el, o, ctx) {
      var p = numParts(el, o);
      if (p && o.to !== undefined) el.textContent = fmt(p, p.num);
      return { set: function (x) { if (p) el.textContent = fmt(p, +x); } };
    },
  });

  // ---------------------------------------------------------------- typewriter
  FX.define('typewriter', {
    group: 'text', desc: 'types its text out with a blinking caret (opts.text, opts.cps, opts.loop)', demo: { text: 'OLYMPUS online. All systems nominal.' },
    make: function (el, o, ctx) {
      var text = o.text !== undefined ? String(o.text) : el.textContent, cps = o.cps || ctx.pick(34, 30, 22), acc = 0, hold = 0;
      var had = el.getAttribute('aria-label');
      el.setAttribute('aria-label', text);
      ctx.add(function () { el.textContent = text; if (had === null) el.removeAttribute('aria-label'); else el.setAttribute('aria-label', had); });
      el.textContent = '';
      var tn = document.createTextNode(''); el.appendChild(tn);
      var caret = ctx.node('span', 'oly-fx-caret', el, '▍'); caret.setAttribute('aria-hidden', 'true');
      var ctl = ctx.ticker(function (dt) {
        if (hold > 0) { hold -= dt; if (hold <= 0 && o.loop) { acc = 0; tn.data = ''; } return; }
        acc += dt * cps;
        var n = Math.min(text.length, Math.floor(acc));
        if (tn.data.length !== n) tn.data = text.slice(0, n);
        if (n >= text.length) { if (o.loop) hold = 1.6; else { hold = 1e9; ctx.timeout(function () { if (caret.parentNode && !o.keepCaret) caret.parentNode.removeChild(caret); ctl.stop(); }, 1200); } }
      }, { el: el });
      ctl.start();
      return { set: function (t) { text = String(t); acc = 0; hold = 0; tn.data = ''; ctl.start(); } };
    },
  });

  // ---------------------------------------------------------------- glitch
  FX.define('glitch', {
    group: 'text', desc: 'short RGB-split glitch bursts at random moments (opts.every in seconds, pulse() for one now)', demo: {},
    make: function (el, o, ctx) {
      ctx.cls(el, 'oly-fx-glitch');
      if (ctx.tier === 'low') el.classList.add('lite');
      ctx.add(function () { el.classList.remove('on'); el.classList.remove('lite'); });
      var every = (o.every || (ctx.tier === 'low' ? 5 : 3)) * 1000;
      var burst = function () { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); ctx.timeout(function () { el.classList.remove('on'); }, 340); };
      var plan = function () { ctx.timeout(function () { if (!FX.reduced()) burst(); plan(); }, every * (0.5 + U.rnd())); };
      plan();
      return { pulse: burst };
    },
  });

  // ---------------------------------------------------------------- progress ring with a comet tip
  FX.define('progressRing', {
    group: 'numbers', desc: 'a ring that fills to opts.value (0..1) with a glowing comet tip; set(v) animates to a new value', demo: { value: 0.72 },
    make: function (el, o, ctx) { return ring(el, o, ctx, false); },
    still: function (el, o, ctx) { return ring(el, o, ctx, true); },
  });
  function ring(el, o, ctx, still) {
    var cv = ctx.canvas(el, { z: 2 }), g = cv.g, value = U.clamp(+o.value || 0, 0, 1), shown = still ? value : 0, stroke = o.stroke || 6;
    var rgb = o.color ? null : U.accent(), N = still ? 0 : ctx.pick(28, 20, 10), pulse = 0;
    var css = function (a) { return o.color || 'rgba(' + rgb.join(',') + ',' + a + ')'; };
    var draw = function (t) {
      if (!cv.fit()) return;
      var w = cv.w, h = cv.h, r = Math.min(w, h) / 2 - stroke - 2, cx = w / 2, cy = h / 2, a0 = -Math.PI / 2;
      g.clearRect(0, 0, w, h);
      g.lineCap = 'round'; g.lineWidth = stroke;
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      if (shown <= 0.001) return;
      var end = a0 + Math.PI * 2 * shown;
      g.strokeStyle = css(0.85); g.beginPath(); g.arc(cx, cy, r, a0, end); g.stroke();
      if (N) {                                                    // the comet: the last stretch fades into a tail
        var tail = Math.min(Math.PI * 2 * shown, 1.3);
        for (var i = 0; i < N; i++) {
          var f = i / N, s = end - tail * (1 - f), e = end - tail * (1 - (i + 1) / N);
          g.strokeStyle = 'rgba(255,255,255,' + (f * f * 0.55).toFixed(3) + ')'; g.lineWidth = stroke * (0.5 + 0.5 * f);
          g.beginPath(); g.arc(cx, cy, r, s, e + 0.02); g.stroke();
        }
        var hx = cx + Math.cos(end) * r, hy = cy + Math.sin(end) * r, hr = stroke * (2.4 + 0.5 * Math.sin(t * 5));
        var gr = g.createRadialGradient(hx, hy, 0, hx, hy, hr * 2.2);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.25, css(0.8)); gr.addColorStop(1, css(0));
        g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, hr * 2.2, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(cx + Math.cos(end) * r, cy + Math.sin(end) * r, stroke * 0.55, 0, Math.PI * 2); g.fill();
      }
    };
    draw(0);
    if (still) return { set: function (v) { value = shown = U.clamp(+v || 0, 0, 1); draw(0); } };
    var ctl = ctx.ticker(function (dt, t) {
      var k = 1 - Math.exp(-dt * 5);
      shown += (value - shown) * k;
      if (Math.abs(value - shown) < 0.0005) shown = value;
      draw(t);
      if (shown === value && ctx.tier !== 'ultra') ctl.stop();
    }, { el: el });
    ctl.start();
    return { set: function (v) { value = U.clamp(+v || 0, 0, 1); ctl.start(); } };
  }

  // ---------------------------------------------------------------- goldFlash: a number that changes catches the light (2026-11-11)
  FX.sheet('text-agora', [
    '@keyframes oly-fx-gold { 0% { color: inherit; transform: none; } 22% { color: var(--gold-c, #e0c070); transform: translateY(-1px) scale(1.035); } 100% { color: inherit; transform: none; } }',
    '@keyframes oly-fx-gold-lite { 0% { color: inherit; } 25% { color: var(--gold-c, #e0c070); } 100% { color: inherit; } }',
    '.oly-fx-gold { display: inline-block; animation: oly-fx-gold .9s cubic-bezier(.2, .8, .2, 1) 1; }',
    '.oly-fx-gold.lite { animation-name: oly-fx-gold-lite; animation-duration: .6s; }',
  ].join('\n'));
  FX.define('goldFlash', {
    group: 'numbers', desc: 'when the number changes it warms to gold and settles back (terracotta when it falls, with direction: true); no glow',
    demo: { to: ['$1,284', '$1,291', '$1,206'] },
    make: function (el, o, ctx) {
      var last = el.textContent, timer = 0;
      var flash = function (down) {
        el.classList.remove('oly-fx-gold'); void el.offsetWidth;
        el.style.setProperty('--gold-c', down && o.direction ? '#c96a4a' : '#e0c070');
        el.classList.add('oly-fx-gold'); if (ctx.tier === 'low') el.classList.add('lite');
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { timer = 0; el.classList.remove('oly-fx-gold', 'lite'); }, 950);
      };
      var mo = new MutationObserver(function () {
        if (el.querySelector('.oly-odo')) return;                 // an odometer is still rolling: flash when it lands
        var now = el.textContent;
        if (now === last || !/\d/.test(now)) { last = now; return; }
        var a = parts(last), b = parts(now);
        last = now; flash(!!(a && b && b.num < a.num));
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      ctx.add(function () { mo.disconnect(); if (timer) clearTimeout(timer); el.classList.remove('oly-fx-gold', 'lite'); el.style.removeProperty('--gold-c'); });
      return { pulse: function () { flash(false); } };
    },
  });
})();
