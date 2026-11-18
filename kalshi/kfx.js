/* Kalshi page effects (tools/web_public/kalshi/kfx.js, 2026-11-03 "way higher quality, 3D UI effects, futuristic").
   A classic script loaded before kalshi.js. It never throws and the page works without it (kalshi.js reads window.KFX
   defensively). It owns the look only, never the numbers:
     motion()          false under prefers-reduced-motion or Jarvis's 3D effects 'off' (localStorage 'jfx', the OLYMPUS key)
     odometer(root)    the hero numbers roll in, digit by digit; the DOM text is always the final value (tests, screen readers)
     spark(vals, o)    a glowing SVG sparkline (an <svg> string; the glow is a CSS filter on the <svg>, Safari 16 safe)
     nav()             the section bar (Today / Edge / Performance / Alerts): tap to glide there, the current one lit
     tilt(root)        a light 3D tilt of the hero panels under a mouse (fine pointers only)
     applyTheme(t)     an OLYMPUS theme's tokens -> this page's colours; hooked to Olympus.theme() / onTheme when the kit has
                       them, and to localStorage 'olympus.theme' (JSON tokens) from any app on the site
   Safari 16 safe: ES2017, no lookbehind, no Array copy methods. */
(function () {
  'use strict';
  if (window.KFX) return;
  var d = document, root = d.documentElement;
  var mq = function (q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  // ------------------------------------------------------------------ motion: the OS setting and the one 3D-effects key
  function motion() { return !mq('(prefers-reduced-motion: reduce)') && get('jfx') !== 'off'; }

  // ------------------------------------------------------------------ odometer: digits roll from 0 to their value once
  var seen = {};
  function odometer(rootEl, force) {
    if (!motion()) return;
    var els = (rootEl || d).querySelectorAll('[data-odo]');
    for (var i = 0; i < els.length; i++) roll(els[i], force);
  }
  function roll(el, force) {
    var key = el.getAttribute('data-odo'), txt = el.textContent;
    if (!force && seen[key] === txt) return;                // the same value: no roll on a minute's refresh
    seen[key] = txt;
    var frag = d.createDocumentFragment(), n = 0;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt.charAt(i);
      if (ch >= '0' && ch <= '9') {
        var s = d.createElement('i');
        s.className = 'od';
        s.textContent = ch;
        s.style.setProperty('--d', ch);
        s.style.setProperty('--k', String(n++));
        frag.appendChild(s);
      } else frag.appendChild(d.createTextNode(ch));
    }
    el.textContent = '';
    el.appendChild(frag);
    el.classList.add('odo');
    clearTimeout(el.__odo);
    el.__odo = setTimeout(function () { if (el.classList.contains('odo')) { el.classList.remove('odo'); el.textContent = txt; } }, 1900);
  }

  // ------------------------------------------------------------------ sparkline
  /** vals: numbers oldest first. o.cls: 'up' | 'down' | '' (the colour); o.live: a light that travels along the line and a ring around the last point (the hero's, 2026-11-04); o.label: the aria-label. A 100 x 28 viewBox. */
  function spark(vals, o) {
    o = o || {};
    var v = [];
    for (var i = 0; i < (vals || []).length; i++) if (typeof vals[i] === 'number' && isFinite(vals[i])) v.push(vals[i]);
    if (v.length < 2) return '';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1, W = 100, H = 28, P = 3;
    var pts = v.map(function (x, j) { return [(j / (v.length - 1)) * W, H - P - ((x - lo) / span) * (H - 2 * P)]; });
    var line = pts.map(function (p, j) { return (j ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="spark ' + (o.cls || '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
      + '<path class="sp-a" d="' + line + 'L' + W + ',' + H + 'L0,' + H + 'Z"/><path class="sp-l" pathLength="100" d="' + line + '"/>'
      + (o.live ? '<path class="sp-g" pathLength="100" d="' + line + '"/><circle class="sp-r" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.2"/>' : '')
      + '<circle class="sp-d" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.2"/></svg>';
  }

  // ------------------------------------------------------------------ the section bar
  var io = null;
  function nav() {
    var bar = d.getElementById('secnav');
    if (!bar) return;
    var groups = d.querySelectorAll('#body .grp');
    bar.hidden = groups.length < 2;
    var btns = bar.querySelectorAll('[data-go]');
    for (var i = 0; i < btns.length; i++) btns[i].hidden = !d.getElementById('g-' + btns[i].getAttribute('data-go'));
    if (io) { io.disconnect(); io = null; }
    if (!('IntersectionObserver' in window) || bar.hidden) return;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) light(e.target.id.slice(2)); });
    }, { rootMargin: '-35% 0px -60% 0px' });
    for (var g = 0; g < groups.length; g++) io.observe(groups[g]);
  }
  function light(id) {
    var btns = d.querySelectorAll('#secnav [data-go]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-go') === id;
      if (on) btns[i].setAttribute('aria-current', 'true'); else btns[i].removeAttribute('aria-current');
    }
  }
  d.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#secnav [data-go]') : null;
    if (!b) return;
    var id = b.getAttribute('data-go'), g = d.getElementById('g-' + id), bar = d.getElementById('secnav');
    if (!g) return;
    var sample = d.getElementById('previewBar');           // the stuck SAMPLE banner sits under the bar: clear both
    var y = g.getBoundingClientRect().top + window.pageYOffset - (bar ? bar.offsetHeight : 0) - (sample ? sample.offsetHeight + 6 : 0) - 10;
    try { window.scrollTo({ top: Math.max(0, y), behavior: motion() ? 'smooth' : 'auto' }); } catch (_) { window.scrollTo(0, Math.max(0, y)); }
    light(id);
    // land it: the page can move under the glide (numbers rolling, a card redrawn, the bar sticking), so once the glide is over the heading
    // is put just under the bar where the bar really is now (no heading hidden under it, no big gap)
    var settle = function () {
      var under = (bar && !bar.hidden ? bar.getBoundingClientRect().bottom : 0) + (sample ? sample.offsetHeight + 6 : 0) + 10, off = g.getBoundingClientRect().top - under;
      if (Math.abs(off) > 4) window.scrollBy(0, off);
    };
    setTimeout(settle, motion() ? 650 : 60);
    setTimeout(settle, motion() ? 1300 : 400);
  });

  // ------------------------------------------------------------------ a light 3D tilt under a mouse (never under a finger)
  function tilt(rootEl) {
    if (!motion() || !mq('(hover: hover) and (pointer: fine)')) return;
    var els = (rootEl || d).querySelectorAll('[data-tilt]');
    for (var i = 0; i < els.length; i++) bindTilt(els[i]);
  }
  function bindTilt(el) {
    if (el.__tilt) return;
    el.__tilt = true;
    var raf = 0;
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        el.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
        el.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
    });
    el.addEventListener('pointerleave', function () {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    });
  }

  // ------------------------------------------------------------------ OLYMPUS themes
  // Tokens: { accent, accent2, bg, text, muted } as #rrggbb (the kit's names; '--oly-accent' style keys work too). Only
  // plain hex colours are taken, so a theme can never inject CSS. null / {} = back to the Kalshi colours.
  var HEX = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
  var MAP = { accent: ['--c', '--cr'], accent2: ['--cy', '--cy-rgb'], bg: ['--bg', '--pr'], text: ['--txt', null], muted: ['--mut', null] };
  var applied = [];
  function rgb(h) {
    var x = h.slice(1);
    if (x.length === 3) x = x.charAt(0) + x.charAt(0) + x.charAt(1) + x.charAt(1) + x.charAt(2) + x.charAt(2);
    return [0, 2, 4].map(function (i) { return parseInt(x.substr(i, 2), 16); });
  }
  function pick(t, k) {
    var v = t[k];
    if (v == null) v = t['--oly-' + k];
    if (v == null && k === 'accent2') v = t.cyan != null ? t.cyan : t['--oly-accent2'];
    return typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : null;
  }
  function applyTheme(t) {
    applied.forEach(function (p) { root.style.removeProperty(p); });
    applied = [];
    var out = {};
    if (t && typeof t === 'object') {
      Object.keys(MAP).forEach(function (k) {
        var v = pick(t, k);
        if (!v) return;
        var m = MAP[k], c = rgb(v);
        out[k] = v;
        root.style.setProperty(m[0], v); applied.push(m[0]);
        if (m[1] === '--pr') { root.style.setProperty('--pr', c.map(function (x) { return Math.round(x * 0.55 + 6); }).join(',')); applied.push('--pr'); }
        else if (m[1]) { root.style.setProperty(m[1], c.join(',')); applied.push(m[1]); }
        if (k === 'accent') { root.style.setProperty('--c3', v); applied.push('--c3'); }
      });
    }
    root.setAttribute('data-oly-theme', applied.length ? '1' : '0');
    try { d.dispatchEvent(new CustomEvent('kalshi:theme', { detail: out })); } catch (_) { /* old browser */ }
    return out;
  }
  function hookTheme() {
    var O = window.Olympus || window.OLYMPUS || null;
    try {
      if (O && typeof O.onTheme === 'function') O.onTheme(function (t) { applyTheme(t); });
      var t0 = O && typeof O.theme === 'function' ? O.theme() : null;
      if (t0 && typeof t0 === 'object') { applyTheme(t0); return; }
    } catch (_) { /* a kit without themes */ }
    var raw = get('olympus.theme');
    if (raw && raw.charAt(0) === '{') { try { applyTheme(JSON.parse(raw)); } catch (_) { /* not tokens */ } }
  }
  window.addEventListener('storage', function (e) {
    if (e.key !== 'olympus.theme') return;
    // 2026-11-14 (team T2): 'olympus.theme' holds a look's id now; olympus/themes.js repaints this page itself. Only the old token
    // objects ('{...}') are this hook's: an id must not clear the engine's data-oly-theme
    if (!e.newValue || e.newValue.charAt(0) !== '{') return;
    var v = null;
    try { v = e.newValue && e.newValue.charAt(0) === '{' ? JSON.parse(e.newValue) : null; } catch (_) { v = null; }
    applyTheme(v);
  });

  window.KFX = { motion: motion, odometer: odometer, spark: spark, nav: nav, tilt: tilt, applyTheme: applyTheme };
  window.applyTheme = applyTheme;                        // the page's one theme entry point (OLYMPUS themes)
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', hookTheme); else hookTheme();
})();
