/* OLYMPUS accessibility + readability layer (2026-11-04, docs/OLYMPUS_A11Y.md). One tag in any page:
 *     <script src="../olympus/a11y.js" defer></script>            (it also loads ./a11y.css next to itself; add the <link> too for no flash)
 * A classic ES5 script (no module, never throws, safe to include twice). It sets window.OLYMPUS_A11Y:
 *   get()              the saved choices { text: 'normal' | 'big', contrast: 'auto' | 'more', motion: 'auto' | 'reduce' } ('olympus.a11y', this phone only)
 *   set(patch)         { text: 'big' } ... saves and applies; every open tab follows (storage event)
 *   toggleBig()        normal <-> big text; returns the new text choice
 *   scale()            the text scale now = Dynamic Type factor x big-text factor (1 = 16px root)
 *   label(el)          the accessible label this script would give an icon-only control ('' = none found)
 *   scan(root)         label what is unlabeled now (it also runs by itself on every DOM change)
 *   unlabeled          [elements still without a name after a scan] (tests, the console)
 *   ink(bg, fg)        the contrast ratio of two CSS colours (#rgb / #rrggbb / rgb() / rgba()), or 0
 * What it does:
 *   - Dynamic Type: reads the iPhone's text size (font: -apple-system-body) and sets --oly-text-scale and the root font size, so every
 *     rem / em size follows it; on a touch phone iOS text-size-adjust does the growing (px text too); elsewhere the root font size does. Big text is a local toggle:
 *     <html data-oly-text="big">; any element with data-oly-a11y="big-text" is a ready-made toggle button (aria-pressed kept).
 *   - ink: the muted ink token --oly-dim is raised to 4.5:1 on the page background when a theme makes it weaker (the audit lives in
 *     tests/test_olympus_a11y.py); prefers-contrast: more or the contrast choice stronger lines and ink (a11y.css)
 *   - names: icon-only buttons / links / role=button get an aria-label from their title, their glyph (x, +, back arrow, gear ...), their
 *     id / class / data-* words (close, menu, search, settings ...), never over an existing name; data-oly-skip on the element or an
 *     ancestor opts out. Unlabelled form fields take their placeholder or name.
 *   - live regions: toasts (.toast, #toast, [class*=toast], .oly-toast) get role=status + aria-live=polite, error toasts and .oly-err
 *     role=alert, so VoiceOver reads them
 *   - motion: prefers-reduced-motion or the motion choice = html[data-oly-motion="reduce"] (a11y.css stops the loops)
 */
(function () {
  'use strict';
  if (window.OLYMPUS_A11Y) return;
  var KEY = 'olympus.a11y', root = document.documentElement, SCALE_BIG = 1.25, PROBE_BODY_PX = 17;
  var state = { text: 'normal', contrast: 'auto', motion: 'auto' };
  var dt = 1;                                            // Dynamic Type factor
  var listeners = [], myDim = '';

  function lsGet() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function lsSet(v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* private window: not kept */ } }
  function load() {
    var raw = lsGet(), j = null;
    try { j = raw ? JSON.parse(raw) : null; } catch (e) { j = null; }
    state.text = j && j.text === 'big' ? 'big' : 'normal';
    state.contrast = j && j.contrast === 'more' ? 'more' : 'auto';
    state.motion = j && j.motion === 'reduce' ? 'reduce' : 'auto';
  }
  function mq(q) { try { return window.matchMedia && window.matchMedia(q).matches; } catch (e) { return false; } }

  /* ------------------------------------------------------------------ colours */
  function parse(c) {
    c = String(c || '').replace(/^\s+|\s+$/g, '');
    var m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) return [parseInt(m[1].charAt(0) + m[1].charAt(0), 16), parseInt(m[1].charAt(1) + m[1].charAt(1), 16), parseInt(m[1].charAt(2) + m[1].charAt(2), 16), 1];
    m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/.exec(c);
    if (m) { var a = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return [+m[1], +m[2], +m[3], a]; }
    return null;
  }
  function over(fg, bg) { var i, o = []; for (i = 0; i < 3; i++) o.push(fg[i] * fg[3] + bg[i] * (1 - fg[3])); o.push(1); return o; }
  function lum(c) {
    var i, v, s = [];
    for (i = 0; i < 3; i++) { v = c[i] / 255; s.push(v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); }
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  function ratio(bg, fg) {
    var b = parse(bg), f = parse(fg);
    if (!b || !f) return 0;
    b = over(b, [0, 0, 0, 1]);
    var x = lum(over(f, b)), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y);
    return (hi + 0.05) / (lo + 0.05);
  }
  // raise a muted ink to `min` on bg by mixing it toward the text colour (or white / black), keeping its hue; returns a css colour
  function lift(bg, fg, text, min) {
    var b = over(parse(bg), [0, 0, 0, 1]), f = parse(fg), t = parse(text) || (lum(b) > 0.5 ? [0, 0, 0, 1] : [255, 255, 255, 1]), k, c, a;
    for (k = 0; k <= 20; k++) {
      a = Math.min(1, f[3] + (1 - f[3]) * (k / 20));
      c = [f[0] + (t[0] - f[0]) * (k / 20), f[1] + (t[1] - f[1]) * (k / 20), f[2] + (t[2] - f[2]) * (k / 20), a];
      if (ratio('rgb(' + Math.round(b[0]) + ',' + Math.round(b[1]) + ',' + Math.round(b[2]) + ')', 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a.toFixed(2) + ')') >= min) break;
    }
    return 'rgba(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ', ' + a.toFixed(2) + ')';
  }
  function cssVar(n) { try { return window.getComputedStyle(root).getPropertyValue(n).replace(/^\s+|\s+$/g, ''); } catch (e) { return ''; } }

  /* ------------------------------------------------------------------ text size */
  function probeDynamicType() {
    // iOS: `font: -apple-system-body` is the user's Dynamic Type size (17px at the default); elsewhere the value is rejected and 16px stays
    try {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;font:-apple-system-body;';
      if (!d.style.font) return 1;
      (document.body || root).appendChild(d);
      var px = parseFloat(window.getComputedStyle(d).fontSize);
      (document.body || root).removeChild(d);
      if (!px || px < 8) return 1;
      return Math.max(0.8, Math.min(2.2, px / PROBE_BODY_PX));
    } catch (e) { return 1; }
  }
  function touch() { try { return (navigator.maxTouchPoints || 0) > 0 && mq('(pointer: coarse)'); } catch (e) { return false; } }
  function scale() { return dt * (state.text === 'big' ? SCALE_BIG : 1); }
  function applyText() {
    var s = scale();
    root.setAttribute('data-oly-text', state.text);
    root.style.setProperty('--oly-text-scale', String(+s.toFixed(3)));
    root.style.setProperty('--oly-dt', String(+dt.toFixed(3)));
    // ONE mechanism, never both (they would multiply): on a touch phone / tablet iOS text-size-adjust scales ALL text (px, rem, em) by the
    // percentage; elsewhere (no such feature) the root font size scales the rem / em text
    var pct = s === 1 ? '100%' : Math.round(100 * s) + '%';
    if (touch()) { root.style.fontSize = ''; root.style.setProperty('-webkit-text-size-adjust', pct); root.style.setProperty('text-size-adjust', pct); }
    else { root.style.fontSize = s === 1 ? '' : (16 * s).toFixed(2) + 'px'; root.style.setProperty('-webkit-text-size-adjust', '100%'); root.style.setProperty('text-size-adjust', '100%'); }
    var tg = document.querySelectorAll('[data-oly-a11y="big-text"]'), i;
    for (i = 0; i < tg.length; i++) tg[i].setAttribute('aria-pressed', state.text === 'big' ? 'true' : 'false');
  }
  function applyMode() {
    var more = state.contrast === 'more' || mq('(prefers-contrast: more)'), reduce = state.motion === 'reduce' || mq('(prefers-reduced-motion: reduce)');
    if (more) root.setAttribute('data-oly-contrast', 'more'); else root.removeAttribute('data-oly-contrast');
    if (reduce) root.setAttribute('data-oly-motion', 'reduce'); else root.removeAttribute('data-oly-motion');
  }
  // muted ink never below 4.5:1 on the page background (a theme or an app token that is weaker is lifted, inline on <html>)
  function ensureInk() {
    try {
      // only OUR inline value is ever removed: a theme paints --oly-dim inline too, and that one stays the theme's
      if (myDim && root.style.getPropertyValue('--oly-dim').replace(/^\s+/, '') === myDim) root.style.removeProperty('--oly-dim');
      myDim = '';
      var bg = cssVar('--oly-bg'), dim = cssVar('--oly-dim'), text = cssVar('--oly-text');
      if (!bg || !dim || !parse(bg) || !parse(dim)) return;
      if (ratio(bg, dim) < 4.5) { myDim = lift(bg, dim, text, 4.6); root.style.setProperty('--oly-dim', myDim); }
    } catch (e) { /* the tokens stay as they are */ }
  }
  function apply() { applyText(); applyMode(); ensureInk(); var i; for (i = 0; i < listeners.length; i++) { try { listeners[i](api.get()); } catch (e) { /* a listener's own */ } } }

  /* ------------------------------------------------------------------ names */
  var GLYPH = { '×': 'Close', '✕': 'Close', '✖': 'Close', '╳': 'Close', 'x': 'Close', 'X': 'Close', 'Ø': 'Close', '+': 'Add', '＋': 'Add', '−': 'Remove', '–': 'Remove',
    '⋯': 'More', '…': 'More', '⋮': 'More', '···': 'More', '←': 'Back', '‹': 'Back', '❮': 'Back', '<': 'Back', '→': 'Next', '›': 'Next', '❯': 'Next', '>': 'Next',
    '↑': 'Up', '↓': 'Down', '↻': 'Refresh', '⟳': 'Refresh', '↺': 'Refresh', '☰': 'Menu', '≡': 'Menu', '⚙': 'Settings', '▶': 'Play', '⏵': 'Play', '►': 'Play',
    '⏸': 'Pause', '❚❚': 'Pause', '⏹': 'Stop', '■': 'Stop', '✓': 'Done', '✔': 'Done', '★': 'Favourite', '☆': 'Favourite', '⌕': 'Search', '⌂': 'Home',
    'ⓘ': 'Info', 'ℹ': 'Info', '?': 'Help', '⇅': 'Sort', '↗': 'Open', '⧉': 'Open' };
  var WORDS = [['close|dismiss|cancel|x-btn|btn-x|xbtn', 'Close'], ['back|prev|previous', 'Back'], ['next|forward', 'Next'], ['menu|hamburger|nav-toggle', 'Menu'],
    ['search|find|magnif', 'Search'], ['setting|gear|prefs|options', 'Settings'], ['more|overflow|kebab|ellipsis', 'More'], ['play', 'Play'], ['pause', 'Pause'], ['stop', 'Stop'],
    ['send|submit', 'Send'], ['mic|voice|speak|talk', 'Microphone'], ['add|plus|new|create', 'Add'], ['remove|minus|delete|trash|bin', 'Delete'], ['refresh|reload|sync|retry', 'Refresh'],
    ['share', 'Share'], ['copy', 'Copy'], ['home|jarvis-home|orb', 'Home'], ['info|about', 'Information'], ['help', 'Help'], ['filter', 'Filter'], ['sort', 'Sort'], ['edit|pencil', 'Edit'],
    ['save|keep', 'Save'], ['fullscreen|expand|maximi', 'Full screen'], ['collapse|minimi', 'Collapse'], ['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'],
    ['zoom-in|zoomin', 'Zoom in'], ['zoom-out|zoomout', 'Zoom out'], ['theme', 'Theme'], ['sound|audio|mute|volume', 'Sound'], ['download', 'Download'], ['upload', 'Upload'],
    ['link', 'Link'], ['notif|bell|alert', 'Notifications'], ['pin', 'Pin'], ['star|fav', 'Favourite'], ['chat|ask', 'Ask'], ['key', 'Key']];
  var STEMS = ['setting', 'notif', 'magnif', 'maximi', 'minimi', 'hamburger', 'zoom-in', 'zoom-out'];
  function skipped(el) { var n = el; while (n && n.nodeType === 1) { if (n.hasAttribute && n.hasAttribute('data-oly-skip')) return true; n = n.parentNode; } return false; }
  function visibleText(el) { return (el.textContent || '').replace(/[\s​]+/g, ''); }
  function hasName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    var t = visibleText(el);
    if (t && !GLYPH.hasOwnProperty(t) && /[A-Za-z0-9À-ɏ]{2,}/.test(t)) return true;      // real words (a glyph or one letter is not a name)
    var im = el.querySelector && el.querySelector('img[alt]:not([alt=""]), svg > title, [role="img"][aria-label]');
    if (im) return true;
    if (el.value && /^(button|submit|reset)$/i.test(el.type || '') && String(el.value).replace(/\s/g, '')) return true;
    return false;
  }
  function wordsOf(el) {
    var s = [el.id || '', typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '', el.getAttribute('data-key') || '', el.getAttribute('data-app') || '',
      el.getAttribute('data-act') || '', el.getAttribute('data-action') || '', el.getAttribute('data-say') || '', el.getAttribute('name') || '', el.getAttribute('data-nx') || '',
      el.getAttribute('data-oly-label') || ''].join(' ').toLowerCase();
    var svgUse = el.querySelector && el.querySelector('use'); if (svgUse) s += ' ' + (svgUse.getAttribute('href') || svgUse.getAttribute('xlink:href') || '').toLowerCase();
    return s;
  }
  function label(el) {
    try {
      var explicit = el.getAttribute('data-oly-label'); if (explicit) return explicit;
      var t = visibleText(el);
      if (t && GLYPH.hasOwnProperty(t)) return GLYPH[t];
      var w = wordsOf(el), i, parts, j;
      for (i = 0; i < WORDS.length; i++) {
        parts = WORDS[i][0].split('|');
        for (j = 0; j < parts.length; j++) {                       // a whole word, except the stems that are only the start of one
          if (new RegExp('(^|[^a-z])' + parts[j].replace(/[-]/g, '[-_ ]?') + (STEMS.indexOf(parts[j]) >= 0 ? '' : '([^a-z]|$)')).test(w)) return WORDS[i][1];
        }
      }
      var app = el.getAttribute('data-app') || el.getAttribute('data-key');
      if (app && /^[a-z][a-z0-9-]{2,24}$/i.test(app)) return app.charAt(0).toUpperCase() + app.slice(1).replace(/-/g, ' ');
    } catch (e) { /* no label */ }
    return '';
  }
  var api = { unlabeled: [] };
  function fieldName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    if (/^(hidden|submit|button|reset|image|checkbox|radio)$/i.test(el.type || '') && el.tagName === 'INPUT') return el.type !== 'checkbox' && el.type !== 'radio' ? true : labelled(el);
    return labelled(el);
  }
  function labelled(el) {
    if (el.closest && el.closest('label')) return true;
    if (el.id) { try { if (document.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]')) return true; } catch (e) { /* odd id */ } }
    return false;
  }
  function scan(rootEl) {
    var base = rootEl && rootEl.querySelectorAll ? rootEl : document, out = [], n = 0, i, el, l, list;
    try {
      list = base.querySelectorAll('button, a[href], [role="button"], summary, input[type="button"], input[type="submit"]');
      for (i = 0; i < list.length && n < 600; i++) {
        el = list[i]; n++;
        if (el.__olyA11y === 1 || skipped(el) || hasName(el)) continue;
        l = label(el);
        if (l) { el.setAttribute('aria-label', l); el.__olyA11y = 1; } else out.push(el);
      }
      list = base.querySelectorAll('input, select, textarea');
      for (i = 0; i < list.length && n < 900; i++) {
        el = list[i]; n++;
        if (skipped(el) || fieldName(el)) continue;
        l = el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('data-oly-label') || '';
        l = String(l).replace(/[_-]+/g, ' ').replace(/^\s+|\s+$/g, '');
        if (l) el.setAttribute('aria-label', l.charAt(0).toUpperCase() + l.slice(1)); else out.push(el);
      }
      toasts(base);
    } catch (e) { /* a page that changes under the scan: the next change scans again */ }
    api.unlabeled = out;
    return out;
  }
  function toasts(base) {
    var list = base.querySelectorAll('.toast, #toast, [class*="toast"], [id*="toast"], .oly-toast, .oly-err, [role="alert"], [aria-live]'), i, el, bad;
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (skipped(el)) continue;
      bad = /(^|[\s_-])(err|error|bad|fail|alert|danger)/i.test(typeof el.className === 'string' ? el.className : '') || el.classList && el.classList.contains('oly-err');
      if (!el.getAttribute('role')) el.setAttribute('role', bad ? 'alert' : 'status');
      if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', bad ? 'assertive' : 'polite');
      if (!el.getAttribute('aria-atomic')) el.setAttribute('aria-atomic', 'true');
    }
  }

  var timer = 0;
  function later() { if (timer) return; timer = setTimeout(function () { timer = 0; scan(document); }, 120); }
  function watch() {
    if (!window.MutationObserver) { setInterval(function () { scan(document); }, 2000); return; }
    var mo = new MutationObserver(function (list) {
      var i; for (i = 0; i < list.length; i++) { if (list[i].addedNodes && list[i].addedNodes.length) { later(); return; } if (list[i].type === 'attributes') { later(); return; } }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'id'] }); } catch (e) { /* no observer */ }
  }

  /* ------------------------------------------------------------------ the toggle buttons, the stylesheet, the public API */
  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-oly-a11y]') : null;
      if (!t) return;
      var k = t.getAttribute('data-oly-a11y');
      if (k === 'big-text') api.toggleBig();
      else if (k === 'more-contrast') api.set({ contrast: state.contrast === 'more' ? 'auto' : 'more' });
      else if (k === 'reduce-motion') api.set({ motion: state.motion === 'reduce' ? 'auto' : 'reduce' });
    }, false);
    window.addEventListener('storage', function (e) { if (e && e.key === KEY) { load(); apply(); } });
    try { var m = window.matchMedia('(prefers-contrast: more)'); if (m.addEventListener) m.addEventListener('change', applyMode); } catch (e) { /* old */ }
    try { var r = window.matchMedia('(prefers-reduced-motion: reduce)'); if (r.addEventListener) r.addEventListener('change', applyMode); } catch (e2) { /* old */ }
    if (window.OLYMPUS_THEMES && window.OLYMPUS_THEMES.on) { try { window.OLYMPUS_THEMES.on(function () { setTimeout(ensureInk, 0); }); } catch (e3) { /* no theme hook */ } }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { dt = probeDynamicType(); applyText(); } });
  }
  function css() {
    var me = document.currentScript || (function () { var s = document.getElementsByTagName('script'), i; for (i = s.length - 1; i >= 0; i--) { if (/a11y\.js(\?|$)/.test(s[i].src || '')) return s[i]; } return null; })();
    if (!me || !me.src || document.querySelector('link[data-oly-a11y-css], link[href*="a11y.css"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = me.src.replace(/a11y\.js(\?.*)?$/, 'a11y.css$1'); l.setAttribute('data-oly-a11y-css', '1');
    (document.head || root).appendChild(l);
  }

  api.get = function () { return { text: state.text, contrast: state.contrast, motion: state.motion }; };
  api.set = function (p) {
    if (p && typeof p === 'object') {
      if (p.text === 'big' || p.text === 'normal') state.text = p.text;
      if (p.contrast === 'more' || p.contrast === 'auto') state.contrast = p.contrast;
      if (p.motion === 'reduce' || p.motion === 'auto') state.motion = p.motion;
      lsSet(JSON.stringify(state));
    }
    apply();
    return api.get();
  };
  api.toggleBig = function () { return api.set({ text: state.text === 'big' ? 'normal' : 'big' }).text; };
  api.scale = scale;
  api.label = label;
  api.scan = scan;
  api.ink = function (bg, fg) { return +ratio(bg, fg).toFixed(2); };
  api.on = function (cb) { if (typeof cb === 'function') listeners.push(cb); };
  api.version = 1;
  window.OLYMPUS_A11Y = api;

  function start() {
    try {
      load(); dt = probeDynamicType(); apply(); css(); scan(document); wire(); watch();
      root.setAttribute('data-oly-a11y', 'on');
    } catch (e) { /* the page works without this layer */ }
  }
  // the saved choice is applied at once (no flash of small text), the rest when the body is there
  try { load(); root.setAttribute('data-oly-text', state.text); applyMode(); } catch (e) { /* later */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, false); else start();
}());
