/* POLIS life (OLYMPUS, docs/POLIS_25.md section B, items 11-18, 2026-11-11): the civic life of the city drawn from olympus/polis.json
 * (built by tools/polis_build.py). A classic ES5 script, no dependencies, nothing fetched but the JSON you point it at.
 *
 *   <script src="../olympus/polis-life.js?v=pl4"></script>
 *   OLYMPUS_POLIS_LIFE.load('../olympus/polis.json', function (doc) { OLYMPUS_POLIS_LIFE.herald(el, doc); });
 *   OLYMPUS_POLIS_LIFE.render(el, 'grove', doc)      one piece into el: herald | oracle | festivals | torch | grove | amphorae | statues | stoic
 *   OLYMPUS_POLIS_LIFE.all(el, doc)                  every piece, in order
 *   OLYMPUS_POLIS_LIFE.amphora({scene, result}) / .tree({id, growth, olives}) / .statue({figure}) / .glyph('owl')   single SVG drawings
 *
 * Read only: it draws what the file says. Every $ is printed with its R when the file has one; it never makes a number up.
 * Text goes in through textContent / createTextNode only (no markup is built from data). Reduced motion and LITE (OLYMPUS.lite(),
 * html[data-oly-lite="1"] or opts.lite) stop every animation. Taps are 44 px or more. If olympus/polis.js (the POLIS kit) is on
 * the page, its meander border is used; otherwise these files draw their own.
 */
(function (root) {
  'use strict';
  if (root.OLYMPUS_POLIS_LIFE) return;
  var doc = root.document, NS = 'http://www.w3.org/2000/svg';
  var C = { night: '#14110e', panel: '#1d1914', raise: '#26211b', line: '#3a3228', text: '#f3ece0', soft: '#cfc4b2', muted: '#a89c88',
    gold: '#c8a24a', bronze: '#9c6b3c', olive: '#7f8a52', terra: '#c96a4a', aegean: '#4b7a99', sun: '#e0b060', oliveText: '#a0ac6e', terraText: '#e08a6b',
    glaze: '#1c130e', clay: '#c4683f', clayHi: '#e09a68' };
  var uid = 0, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ------------------------------------------------------------------------------------------------ small helpers
  function S(tag, a, p) {
    var e = doc.createElementNS(NS, tag), k;
    if (a) for (k in a) if (a.hasOwnProperty(k) && a[k] !== null && a[k] !== undefined) e.setAttribute(k, String(a[k]));
    if (p) p.appendChild(e);
    return e;
  }
  function H(tag, cls, text, p) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.appendChild(doc.createTextNode(String(text)));
    if (p) p.appendChild(e);
    return e;
  }
  function T(svgText, str) { svgText.appendChild(doc.createTextNode(String(str))); return svgText; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function f1(v) { return Math.round(v * 10) / 10; }
  function hashStr(s) { var h = 2166136261, i; s = String(s); for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul ? Math.imul(t ^ (t >>> 15), t | 1) : (t ^ (t >>> 15)) * (t | 1); t ^= t + (Math.imul ? Math.imul(t ^ (t >>> 7), t | 61) : (t ^ (t >>> 7)) * (t | 61)); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function money(v, sign) {
    if (!num(v)) return '';
    var a = Math.abs(v), r = Math.round(a * 100) / 100, s;
    s = Math.abs(r - Math.round(r)) < 0.005 ? String(Math.round(r)) : r.toFixed(2);
    var parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
    if (s === '0' || s === '0.00') return '$0';
    return (v < 0 ? '-' : (sign === false ? '' : '+')) + '$' + s;
  }
  function rword(r) { return num(r) ? ((r > 0.04 ? '+' : '') + (Math.abs(r) < 0.05 ? '0.0' : r.toFixed(1)) + 'R') : ''; }
  function usdR(u, r) { return money(u) + (num(r) ? ' (' + rword(r) + ')' : ''); }
  function tone(v) { return !num(v) ? '' : v > 4.999 ? 'pl-up' : v < -4.999 ? 'pl-down' : 'pl-even'; }
  function mq(q) { try { return !!(root.matchMedia && root.matchMedia(q).matches); } catch (e) { return false; } }
  function still(opts) {
    var O = root.OLYMPUS;
    if (opts && opts.lite) return true;
    try { if (O && O.lite && O.lite()) return true; if (O && O.reduced && O.reduced()) return true; } catch (e) {}
    return doc.documentElement.getAttribute('data-oly-lite') === '1' || mq('(prefers-reduced-motion: reduce)');
  }
  function lite(opts) {
    var O = root.OLYMPUS;
    if (opts && opts.lite) return true;
    try { if (O && O.lite && O.lite()) return true; } catch (e) {}
    return doc.documentElement.getAttribute('data-oly-lite') === '1';
  }
  function kit(name) { var K = root.OLYMPUS_POLIS; return K && typeof K[name] === 'function' ? K[name] : null; }
  function pathOf(pts) { var s = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2), i; for (i = 1; i < pts.length; i++) s += 'L' + pts[i][0].toFixed(2) + ',' + pts[i][1].toFixed(2); return s; }
  function smoothPath(pts, closed) {           // Catmull-Rom through the points, as cubic beziers
    var n = pts.length, s = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2), i, p0, p1, p2, p3;
    for (i = 0; i < (closed ? n : n - 1); i++) {
      p0 = pts[(i - 1 + n) % n]; p1 = pts[i]; p2 = pts[(i + 1) % n]; p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      s += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ',' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ',' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
    }
    return s + (closed ? 'Z' : '');
  }

  // ------------------------------------------------------------------------------------------------ the shared paint box (gradients, patterns, figures)
  function grad(d, id, kind, stops, at) {
    var g = S(kind === 'r' ? 'radialGradient' : 'linearGradient', at || {}, d), i;
    g.setAttribute('id', id);
    for (i = 0; i < stops.length; i++) S('stop', { offset: stops[i][0], 'stop-color': stops[i][1], 'stop-opacity': stops[i][2] === undefined ? 1 : stops[i][2] }, g);
    return g;
  }
  function meanderTile(p, color) {            // one Greek-key unit in a 8 x 8 cell
    S('path', { d: 'M0,7.2H6.6V1.6H2.2V5H4.4V3.4', fill: 'none', stroke: color, 'stroke-width': 1.05, 'stroke-linecap': 'square' }, p);
    S('path', { d: 'M6.6,7.2H8', fill: 'none', stroke: color, 'stroke-width': 1.05 }, p);
  }
  function defs() {
    if (doc.getElementById('pl-defs')) return;
    var svg = S('svg', { id: 'pl-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false', style: 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none' });
    var d = S('defs', null, svg), p;
    grad(d, 'pl-clay-win', 'r', [['0', '#eba476'], ['0.38', '#d07a4b'], ['0.78', '#a24f2e'], ['1', '#6d321d']], { cx: '0.34', cy: '0.36', r: '0.78' });
    grad(d, 'pl-clay-loss', 'r', [['0', '#6a5141'], ['0.45', '#3f2f25'], ['1', '#1a1310']], { cx: '0.34', cy: '0.36', r: '0.8' });
    grad(d, 'pl-clay-flat', 'r', [['0', '#f0dcb4'], ['0.45', '#d2b483'], ['0.85', '#9d7b50'], ['1', '#75593a']], { cx: '0.34', cy: '0.36', r: '0.8' });
    grad(d, 'pl-glaze', 'l', [['0', '#3a2a20'], ['0.35', '#1f1510'], ['1', '#0f0a08']], { x1: '0', y1: '0', x2: '1', y2: '0' });
    grad(d, 'pl-shine', 'l', [['0', '#fff6e8', 0], ['0.5', '#fff6e8', 0.42], ['1', '#fff6e8', 0]], { x1: '0', y1: '0', x2: '0', y2: '1' });
    grad(d, 'pl-marble', 'l', [['0', '#f6f1e8'], ['0.42', '#e6dfd2'], ['0.78', '#c7beb0'], ['1', '#9e9586']], { x1: '0', y1: '0', x2: '1', y2: '0.25' });
    grad(d, 'pl-marble-v', 'l', [['0', '#efe9df'], ['1', '#bdb3a4']], { x1: '0', y1: '0', x2: '0', y2: '1' });
    grad(d, 'pl-niche', 'r', [['0', '#3b3127'], ['0.6', '#251e18'], ['1', '#15110d']], { cx: '0.5', cy: '0.3', r: '0.8' });
    grad(d, 'pl-bark', 'l', [['0', '#8a7560'], ['0.35', '#64533f'], ['0.75', '#45382b'], ['1', '#2e251c']], { x1: '0', y1: '0', x2: '1', y2: '0' });
    grad(d, 'pl-soil', 'r', [['0', '#5a4630'], ['0.7', '#3a2d20'], ['1', '#2a2018', 0]], { cx: '0.5', cy: '0.35', r: '0.6' });
    grad(d, 'pl-wood', 'l', [['0', '#8a5f3a'], ['0.3', '#6e4a2b'], ['0.7', '#5a3b22'], ['1', '#3a2716']], { x1: '0', y1: '0', x2: '0', y2: '1' });
    grad(d, 'pl-gold', 'l', [['0', '#f1d58a'], ['0.45', '#c8a24a'], ['1', '#8d6c25']], { x1: '0', y1: '0', x2: '1', y2: '1' });
    grad(d, 'pl-bronze', 'l', [['0', '#c89060'], ['0.5', '#9c6b3c'], ['1', '#5e3d20']], { x1: '0', y1: '0', x2: '1', y2: '1' });
    grad(d, 'pl-flame', 'l', [['0', '#fff1c4'], ['0.35', '#f2c35e'], ['0.75', '#e0803c'], ['1', '#b2482a']], { x1: '0', y1: '1', x2: '0', y2: '0' });
    grad(d, 'pl-glow', 'r', [['0', '#f2c35e', 0.38], ['1', '#f2c35e', 0]], { cx: '0.5', cy: '0.5', r: '0.5' });
    grad(d, 'pl-terra-disc', 'r', [['0', '#e29a68'], ['0.6', '#c96a42'], ['1', '#8e4426']], { cx: '0.4', cy: '0.35', r: '0.75' });
    p = S('pattern', { id: 'pl-mea-dark', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, d); meanderTile(p, C.glaze);
    p = S('pattern', { id: 'pl-mea-clay', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, d); meanderTile(p, '#c87a4f');
    p = S('pattern', { id: 'pl-mea-gold', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, d); meanderTile(p, C.gold);
    figures(d);
    (doc.body || doc.documentElement).insertBefore(svg, (doc.body || doc.documentElement).firstChild);
  }

  // black-figure drawings as symbols: paths use currentColor (the figure) and var(--pl-inc) (the incised lines)
  function figures(d) {
    var s, g;
    // a horse rising (rearing), facing right, in a 40 x 32 box
    s = S('symbol', { id: 'pl-horse', viewBox: '0 0 40 32' }, d);
    g = S('g', { fill: 'currentColor', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
    S('path', { d: 'M9.5,23.5 C7,20 7.4,15.6 10.6,13.6 C14.4,11.2 19.4,10.4 23.2,8.6 C25,7.8 26.4,8.6 26.8,10.6 C27.4,14 26.4,17.4 23.6,19.4 C20.4,21.6 15.4,22.6 12.6,24.6 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M22,10.4 C22.6,6.8 25,3.6 28.2,2.2 L31.4,3.6 C30,6.6 28.6,10 27.4,13.6 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M27.6,2.6 C29.2,0.9 32,0.8 33.4,2.2 L36.8,5.9 C37.4,6.9 36.6,8.2 35.4,7.9 L31.6,7 C30,6.6 28.6,5.4 27.6,2.6 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M28.6,2 L28.7,-0.6 L30.4,1.5 Z', 'stroke-width': 0.3 }, g);
    S('path', { d: 'M25.2,13.8 C28.4,13 31,13 32.6,14.2 L31.8,18.6', fill: 'none', 'stroke-width': 2.1 }, g);
    S('path', { d: 'M23.6,16.4 C27,17 29.6,17.8 30.6,19.4 L28.8,22.8', fill: 'none', 'stroke-width': 2 }, g);
    S('path', { d: 'M13.2,22.4 C15,25 15.4,27 14.6,28.4 L16.4,31.2', fill: 'none', 'stroke-width': 2.2 }, g);
    S('path', { d: 'M10.4,21.6 C9.4,25.4 9.8,27.4 10.8,28.6 L9.4,31.4', fill: 'none', 'stroke-width': 2.2 }, g);
    S('path', { d: 'M9,15.6 C4.6,15.4 2.6,19.4 3.4,25.6 C4.8,22 6.2,19.8 8.6,18.6', 'stroke-width': 0.6 }, g);
    g = S('g', { style: 'fill:none;stroke:var(--pl-inc)', 'stroke-width': 0.45, 'stroke-linecap': 'round' }, s);
    S('path', { d: 'M23.4,9.8 C24.8,6.6 27,4.2 29.4,3' }, g);
    S('path', { d: 'M19.4,12.6 C21.6,14 22,16.6 20.8,18.8' }, g);
    S('path', { d: 'M12.2,15.6 C13.8,17.4 14,19.6 13.2,21.6' }, g);
    S('circle', { cx: 31.6, cy: 3.6, r: 0.55, style: 'fill:var(--pl-inc);stroke:none' }, g);
    S('path', { d: 'M5,21 C5.6,19.4 6.6,18.4 8,17.8' }, g);
    // a dolphin diving, head down to the right, in a 40 x 32 box, with two wave curls
    s = S('symbol', { id: 'pl-dolphin', viewBox: '0 0 40 32' }, d);
    g = S('g', { fill: 'currentColor', stroke: 'currentColor', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
    S('path', { d: 'M8.4,8.6 C14,2.6 25.4,2.4 31.2,11.6 C33.6,15.6 34.8,20.6 34.4,24.6 L35.6,29.6 C34,28.2 33,26.8 32.6,25.4 C31.4,22.8 30.6,20.6 29.4,18.6 C25.8,12.4 18.4,9.6 9.6,11.2 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M9.2,9 C6.4,4.8 3.4,4.2 1,5.6 C3.6,6.4 5.2,8 5.6,10.2 C4,12 3,14.2 2.6,16.8 C5.2,15.6 7.6,13.4 9.4,10.8 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M17.4,4 C19,0.8 22,-0.2 25,0.4 C22.8,1.4 21.8,2.8 21.8,4.6 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M26.2,14 C25.6,17.8 23.8,20.4 21,21.2 C23.2,18.6 24,16.4 23.8,13.2 Z', 'stroke-width': 0.4 }, g);
    g = S('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, s);
    S('path', { d: 'M23,30.4 C25,28.4 27.4,28.4 29.2,30.2 C30.6,31.4 32.8,31 34,29.6' }, g);
    S('path', { d: 'M3,28.6 C4.8,26.6 7.4,26.6 9,28.4 C10.4,29.8 12.6,29.6 13.6,28' }, g);
    g = S('g', { style: 'fill:none;stroke:var(--pl-inc)', 'stroke-width': 0.45, 'stroke-linecap': 'round' }, s);
    S('path', { d: 'M12,9.4 C18,6.6 25,8 29.4,14.6' }, g);
    S('circle', { cx: 31.6, cy: 21.6, r: 0.7, style: 'fill:var(--pl-inc);stroke:none' }, g);
    S('path', { d: 'M30,23.6 C31.2,24.4 32.4,25.6 33.2,27' }, g);
    // a torch runner (Panathenaic style), running right, torch hand at (33, 8), in a 40 x 48 box
    s = S('symbol', { id: 'pl-runner', viewBox: '0 0 40 48' }, d);
    g = S('g', { fill: 'currentColor', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
    S('circle', { cx: 25.6, cy: 7.6, r: 3.5, 'stroke-width': 0 }, g);
    S('path', { d: 'M22.4,12.4 C25.4,11.6 27.4,12.6 27,15.2 C26.2,19.4 23.4,24.4 20.8,27.6 L17.4,26.2 C18.6,21.6 20,16.4 22.4,12.4 Z', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M25.2,13.6 L30,13.2 L33,8.8', fill: 'none', 'stroke-width': 2.1 }, g);
    S('path', { d: 'M22.6,14 L17,18.4 L13.4,15.6', fill: 'none', 'stroke-width': 2 }, g);
    S('path', { d: 'M19.6,26.4 L26.8,32.6 L28.6,42.6 L32,43.6', fill: 'none', 'stroke-width': 2.5 }, g);
    S('path', { d: 'M18.6,26.6 L13.2,35 L6.4,37.6 L4.6,35.6', fill: 'none', 'stroke-width': 2.5 }, g);
    S('path', { d: 'M32.6,9.6 L34.6,2.2', fill: 'none', 'stroke-width': 1.4 }, g);
    g = S('g', { style: 'fill:none;stroke:var(--pl-inc)', 'stroke-width': 0.45, 'stroke-linecap': 'round' }, s);
    S('path', { d: 'M23.4,15.4 C24.6,17.4 24,20.4 22.4,23' }, g);
    S('path', { d: 'M24,5.8 C25.4,4.6 27.4,4.8 28.4,6.2' }, g);
  }

  // ------------------------------------------------------------------------------------------------ the amphora (16)
  var AMPH = (function () {                    // a neck amphora: the right half, top to bottom, mirrored for the left
    var start = [30, 4], ops = [
      ['L', [40, 4]], ['C', [42, 4], [42.6, 5.6], [42.1, 7]], ['C', [41.7, 8.4], [40, 8.8], [37.6, 9]], ['C', [36.6, 14], [36.2, 20], [36.8, 25]],
      ['C', [39.2, 28.4], [47, 29.6], [50, 34]], ['C', [53.6, 40], [54, 50], [52.4, 57]], ['C', [50.5, 66], [44.5, 75], [38, 81.5]],
      ['C', [36.4, 83], [35.4, 84.5], [35.4, 86.5]], ['L', [35.4, 89.5]], ['C', [38.5, 90.3], [40.6, 91.6], [41, 93.6]], ['L', [41, 96]], ['L', [30, 96]]];
    function P(p) { return p[0] + ',' + p[1]; }
    function M(p) { return (60 - p[0]) + ',' + p[1]; }
    var s = 'M' + P(start), i, prev = start, pts = [start];
    for (i = 0; i < ops.length; i++) { s += ops[i][0] === 'L' ? 'L' + P(ops[i][1]) : 'C' + P(ops[i][1]) + ' ' + P(ops[i][2]) + ' ' + P(ops[i][3]); pts.push(ops[i][ops[i].length - 1]); }
    for (i = ops.length - 1; i >= 0; i--) {    // back up the left side: reverse each segment, mirror x
      prev = pts[i];
      s += ops[i][0] === 'L' ? 'L' + M(prev) : 'C' + M(ops[i][2]) + ' ' + M(ops[i][1]) + ' ' + M(prev);
    }
    return s + 'Z';
  })();
  function tongues(y0, y1, n, x0, x1) {
    var w = (x1 - x0) / n, s = '', i, x;
    for (i = 0; i < n; i++) { x = x0 + i * w; s += 'M' + (x + w * 0.12).toFixed(2) + ',' + y0 + 'L' + (x + w * 0.12).toFixed(2) + ',' + (y1 - 1.6) + 'Q' + (x + w / 2).toFixed(2) + ',' + (y1 + 1.2) + ' ' + (x + w * 0.88).toFixed(2) + ',' + (y1 - 1.6) + 'L' + (x + w * 0.88).toFixed(2) + ',' + y0 + 'Z'; }
    return s;
  }
  function rays(y0, y1, n, x0, x1) {
    var w = (x1 - x0) / n, s = '', i, x;
    for (i = 0; i < n; i++) { x = x0 + i * w; s += 'M' + x.toFixed(2) + ',' + y1 + 'L' + (x + w / 2).toFixed(2) + ',' + y0 + 'L' + (x + w).toFixed(2) + ',' + y1 + 'Z'; }
    return s;
  }
  /** amphora({scene: 'horse'|'dolphin', result: 'win'|'loss'|'flat', title}) -> an <svg> (viewBox 60 x 100) */
  function amphora(o) {
    defs();
    o = o || {};
    var res = o.result === 'loss' ? 'loss' : o.result === 'flat' ? 'flat' : 'win', scene = o.scene === 'dolphin' ? 'dolphin' : 'horse';
    var id = 'pl-a' + (++uid), dark = res === 'loss';
    var svg = S('svg', { viewBox: '0 0 60 100', 'class': 'pl-amph pl-amph-' + res, role: 'img', 'aria-label': o.title || (scene === 'horse' ? 'Amphora with a rising horse' : 'Amphora with a diving dolphin') });
    S('ellipse', { cx: 30, cy: 97.2, rx: 15, ry: 2.4, fill: '#000', opacity: 0.4 }, svg);
    var cp = S('clipPath', { id: id }, S('defs', null, svg));
    S('path', { d: AMPH }, cp);
    // the handles behind the shoulder
    var hs = { fill: 'none', stroke: dark ? '#2b1f18' : C.glaze, 'stroke-width': 2.6, 'stroke-linecap': 'round' };
    S('path', merge(hs, { d: 'M37.4,12.6 C45.6,10 50.8,13.4 48.8,21.6 C48.2,25 46.8,28.4 45.6,31.4' }), svg);
    S('path', merge(hs, { d: 'M22.6,12.6 C14.4,10 9.2,13.4 11.2,21.6 C11.8,25 13.2,28.4 14.4,31.4' }), svg);
    S('path', { d: 'M38.2,12.2 C45,10.4 49,13.4 47.6,20.4', fill: 'none', stroke: '#fff3df', 'stroke-opacity': 0.22, 'stroke-width': 0.6, 'stroke-linecap': 'round' }, svg);
    S('path', { d: AMPH, fill: 'url(#pl-clay-' + res + ')' }, svg);
    var g = S('g', { 'clip-path': 'url(#' + id + ')' }, svg);
    var ink = dark ? '#b8643e' : C.glaze, red = dark ? '#7a3a24' : '#7e2a1d';
    // lip and neck in black glaze (a little lighter on the dark-glazed pots so the parts still read)
    S('rect', { x: 0, y: 0, width: 60, height: 9.2, fill: dark ? '#2a1f18' : C.glaze }, g);
    S('rect', { x: 0, y: 9.2, width: 60, height: 17.4, fill: dark ? '#261b15' : 'url(#pl-glaze)' }, g);
    S('path', { d: 'M24,11 C26.6,13.6 33.4,13.6 36,11 M24,24 C26.6,21.4 33.4,21.4 36,24', fill: 'none', stroke: dark ? '#a2593a' : '#b8643e', 'stroke-width': 0.5, opacity: 0.9 }, g);
    S('path', { d: 'M27,12.6 C27,16 27,19 27,22.6 M33,12.6 C33,16 33,19 33,22.6 M30,12.8 L30,22.4', fill: 'none', stroke: dark ? '#a2593a' : '#b8643e', 'stroke-width': 0.4, opacity: 0.7 }, g);
    // tongues on the shoulder, then the meander
    S('rect', { x: 0, y: 26.6, width: 60, height: 4.8, fill: red }, g);
    S('path', { d: tongues(26.6, 31.4, 11, 8, 52), fill: dark ? '#120c09' : C.glaze }, g);
    S('rect', { x: 0, y: 32.4, width: 60, height: 0.6, fill: ink }, g);
    S('rect', { x: 0, y: 33.6, width: 60, height: 6.2, fill: dark ? 'url(#pl-mea-clay)' : 'url(#pl-mea-dark)', transform: 'translate(0,0.2)' }, g);
    S('rect', { x: 0, y: 40.4, width: 60, height: 0.6, fill: ink }, g);
    // the scene
    var u = S('use', { href: '#pl-' + scene, x: 13, y: 43, width: 34, height: 27.2, color: dark ? '#c4683f' : C.glaze, style: '--pl-inc:' + (dark ? '#2a1d16' : '#c87a4f') }, g);
    u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#pl-' + scene);
    // the lower bands and the rays
    S('rect', { x: 0, y: 72.2, width: 60, height: 0.7, fill: ink }, g);
    S('rect', { x: 0, y: 73.6, width: 60, height: 0.5, fill: ink }, g);
    S('path', { d: rays(75, 85.6, 9, 10, 50), fill: dark ? '#9a4f31' : C.glaze, opacity: dark ? 0.9 : 1 }, g);
    S('rect', { x: 0, y: 85.6, width: 60, height: 11, fill: dark ? '#1c1410' : C.glaze }, g);
    S('rect', { x: 0, y: 93.4, width: 60, height: 0.6, fill: dark ? '#7a3a24' : '#a24f2e', opacity: 0.8 }, g);
    // light: a soft shine down the left of the belly and on the shoulder, a dark edge on the right
    S('ellipse', { cx: 18.2, cy: 51, rx: 2.6, ry: 13, fill: 'url(#pl-shine)', transform: 'rotate(8 18.2 51)' }, g);
    S('ellipse', { cx: 21.5, cy: 33.8, rx: 5, ry: 1.3, fill: '#fff6e8', opacity: dark ? 0.12 : 0.2, transform: 'rotate(-18 21.5 33.8)' }, g);
    S('path', { d: 'M52.6,40 C55,50 53,64 44,77', fill: 'none', stroke: '#000', 'stroke-opacity': 0.3, 'stroke-width': 4 }, g);
    S('path', { d: AMPH, fill: 'none', stroke: '#140d09', 'stroke-width': 0.7, 'stroke-opacity': 0.85 }, svg);
    S('path', { d: 'M20.2,4.3 L39.8,4.3', stroke: '#fff3df', 'stroke-opacity': 0.35, 'stroke-width': 0.6, fill: 'none' }, svg);
    return svg;
  }
  function merge(a, b) { var o = {}, k; for (k in a) if (a.hasOwnProperty(k)) o[k] = a[k]; for (k in b) if (b.hasOwnProperty(k)) o[k] = b[k]; return o; }

  // ------------------------------------------------------------------------------------------------ the olive tree (15)
  /** tree({id, growth 0..1, olives, rings, thirsty, stage}) -> an <svg> (viewBox 200 x 220) */
  function tree(o, opts) {
    defs();
    o = o || {};
    var R = rng(hashStr(o.id || 'tree')), g0 = Math.max(0.12, Math.min(1, num(o.growth) ? o.growth : 0.3)), lt = lite(opts);
    var svg = S('svg', { viewBox: '0 0 200 220', 'class': 'pl-tree', role: 'img', 'aria-label': o.title || 'Olive tree' });
    var thirsty = !!o.thirsty, sap = g0 < 0.3;
    // the hills behind and the ground
    S('path', { d: 'M0,150 C30,132 62,138 92,128 C124,118 160,128 200,118 L200,220 L0,220 Z', fill: '#4a4436', opacity: 0.55 }, svg);
    S('path', { d: 'M0,170 C40,158 80,166 118,156 C150,148 178,154 200,150 L200,220 L0,220 Z', fill: '#3a3527', opacity: 0.85 }, svg);
    var cyp = function (x, y, h) { S('path', { d: 'M' + x + ',' + y + ' C' + (x - 3.4) + ',' + (y - h * 0.4) + ' ' + (x - 1.6) + ',' + (y - h * 0.85) + ' ' + x + ',' + (y - h) + ' C' + (x + 1.6) + ',' + (y - h * 0.85) + ' ' + (x + 3.4) + ',' + (y - h * 0.4) + ' ' + x + ',' + y + ' Z', fill: '#2c3121', opacity: 0.85 }, svg); };
    cyp(22 + R() * 10, 162, 22 + R() * 8); cyp(170 + R() * 12, 156, 18 + R() * 8);
    S('ellipse', { cx: 100, cy: 200, rx: 92, ry: 18, fill: 'url(#pl-soil)' }, svg);
    S('ellipse', { cx: 112, cy: 199, rx: 46 * (0.5 + g0 / 2), ry: 5, fill: '#000', opacity: 0.32 }, svg);
    var i, x, y;
    for (i = 0; i < 9; i++) {                 // grass tufts
      x = 22 + R() * 156; y = 192 + R() * 14;
      S('path', { d: 'M' + x + ',' + y + ' l-2.4,-5 M' + x + ',' + y + ' l0.4,-6.4 M' + x + ',' + y + ' l3,-4.6', stroke: thirsty ? '#8a7f55' : '#6d7a42', 'stroke-width': 0.9, 'stroke-linecap': 'round', fill: 'none', opacity: 0.85 }, svg);
    }
    for (i = 0; i < 4; i++) S('ellipse', { cx: 30 + R() * 140, cy: 198 + R() * 10, rx: 2 + R() * 2.4, ry: 1.2 + R(), fill: '#6e6150', opacity: 0.8 }, svg);
    if (thirsty) for (i = 0; i < 4; i++) { x = 60 + R() * 80; y = 200 + R() * 6; S('path', { d: 'M' + x + ',' + y + ' l6,1.4 l3,-2 l5,1.2', stroke: '#2a1f16', 'stroke-width': 0.7, fill: 'none' }, svg); }
    var baseX = 100, baseY = 198, H0 = sap ? 46 + g0 * 60 : 54 + g0 * 46;
    var treeG = S('g', null, svg), layerBranch = S('g', null, treeG), layerTrunk = S('g', null, treeG), layerBack = S('g', null, treeG), layerLeaf = S('g', null, treeG), layerFruit = S('g', null, treeG);
    var tips = [];
    if (sap) {                                // a sapling tied to a stake
      S('rect', { x: 112, y: baseY - H0 - 14, width: 3.2, height: H0 + 16, rx: 1, fill: 'url(#pl-wood)' }, treeG);
      var top = [baseX + 2, baseY - H0];
      S('path', { d: 'M' + baseX + ',' + baseY + ' C' + (baseX - 3) + ',' + (baseY - H0 * 0.4) + ' ' + (baseX + 5) + ',' + (baseY - H0 * 0.7) + ' ' + top[0] + ',' + top[1], stroke: '#5d4b39', 'stroke-width': 3.4, fill: 'none', 'stroke-linecap': 'round' }, layerTrunk);
      S('path', { d: 'M' + (baseX + 1) + ',' + (baseY - H0 * 0.55) + ' L113,' + (baseY - H0 * 0.6) + ' M' + (baseX + 2) + ',' + (baseY - H0 * 0.85) + ' L113,' + (baseY - H0 * 0.88), stroke: '#b7a47c', 'stroke-width': 1.1, fill: 'none' }, treeG);
      branch(top[0], top[1], -0.5, 16, 2, 1); branch(top[0], top[1], 0.55, 15, 2, 1); branch(top[0] - 1, top[1] + 8, -1.1, 12, 1.6, 0);
      tips.push([top[0], top[1] - 4, 11]);
    } else {
      var nStem = g0 > 0.78 ? 3 : g0 > 0.5 ? 2 : 1, s;
      for (s = 0; s < nStem; s++) {
        var off = (s - (nStem - 1) / 2), ang = off * 0.42 + (R() - 0.5) * 0.12;
        var hh = H0 * (0.78 + R() * 0.22) * (nStem > 1 && off === 0 ? 1.06 : 1);
        var bx = baseX + off * 8, tx = bx + Math.sin(ang) * hh * 0.9 + (R() - 0.5) * 6, ty = baseY - hh;
        var w0 = (13 + g0 * 10) / Math.pow(nStem, 0.45), w1 = w0 * 0.42;
        stem(bx, baseY, tx, ty, w0, w1, s === 0 && g0 > 0.6);
        var depth = 2 + Math.round(g0 * 2), L = 20 + g0 * 20, spread = 0.42 + R() * 0.2;
        branch(tx, ty, ang - spread - (off < 0 ? 0.25 : 0), L, w1 * 0.8, depth); branch(tx, ty, ang + spread + (off > 0 ? 0.25 : 0), L * 0.95, w1 * 0.78, depth);
        if (g0 > 0.3) branch(tx, ty + 4, ang * 0.5 + (R() - 0.5) * 0.2, L * 1.05, w1 * 0.75, depth - 1);
        if (g0 > 0.6) { branch(tx, ty + 10, ang - 1.15, L * 0.7, w1 * 0.55, depth - 2); branch(tx, ty + 10, ang + 1.15, L * 0.7, w1 * 0.55, depth - 2); }
      }
    }
    if (!sap) {                               // olive crowns are full domes: a filler cluster between each tip and its nearest neighbour
      var n0 = tips.length, ii, jj;
      for (ii = 0; ii < n0; ii++) {
        var best = -1, bd = 1e9;
        for (jj = 0; jj < n0; jj++) { if (jj === ii) continue; var dd2 = Math.pow(tips[ii][0] - tips[jj][0], 2) + Math.pow(tips[ii][1] - tips[jj][1], 2); if (dd2 < bd) { bd = dd2; best = jj; } }
        if (best >= 0 && bd > 64) tips.push([(tips[ii][0] + tips[best][0]) / 2, (tips[ii][1] + tips[best][1]) / 2 - 3, (tips[ii][2] + tips[best][2]) * 0.42]);
      }
    }
    // foliage: a dark mass behind every cluster, then the leaves: narrow pointed olive leaves, dark grey-green tops and silver undersides
    // (lit from the upper left). Leaves of one colour are ONE path (a few nodes per tree, not thousands).
    var dens = (lt ? 0.5 : 1) * (thirsty ? 0.6 : 1), DARK = thirsty ? ['#7d7550', '#6b6545', '#5f5a3e'] : ['#45512b', '#55633a', '#63723f', '#3b4626'],
      SILV = thirsty ? ['#b3a978', '#a29a6c'] : ['#9aa57f', '#b2b996', '#c4c9ab', '#8a9670'];
    for (i = 0; i < tips.length; i++) {
      S('ellipse', { cx: tips[i][0], cy: tips[i][1] + 1, rx: tips[i][2] * 1.12, ry: tips[i][2] * 0.86, fill: thirsty ? '#4d4930' : '#2e3922', opacity: 0.6 }, layerBack);
      S('ellipse', { cx: tips[i][0] - tips[i][2] * 0.25, cy: tips[i][1] - tips[i][2] * 0.2, rx: tips[i][2] * 0.8, ry: tips[i][2] * 0.6, fill: thirsty ? '#6b6545' : '#4a5833', opacity: 0.45 }, layerBack);
    }
    var leaves = 0, bucket = {}, cols = [], minY = 999, minX = 999, maxX = -999;
    function leaf(c, lx, ly, ang, h, w) {
      var ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      var d = 'M' + (lx - ux * h).toFixed(1) + ',' + (ly - uy * h).toFixed(1) + 'Q' + (lx + nx * w * 2).toFixed(1) + ',' + (ly + ny * w * 2).toFixed(1) + ' ' + (lx + ux * h).toFixed(1) + ',' + (ly + uy * h).toFixed(1) +
        'Q' + (lx - nx * w * 2).toFixed(1) + ',' + (ly - ny * w * 2).toFixed(1) + ' ' + (lx - ux * h).toFixed(1) + ',' + (ly - uy * h).toFixed(1) + 'Z';
      if (!bucket[c]) { bucket[c] = []; cols.push(c); }
      bucket[c].push(d);
    }
    for (i = 0; i < tips.length; i++) {
      var t = tips[i], n = Math.round(t[2] * t[2] * 0.16 * dens), k;
      minY = Math.min(minY, t[1] - t[2] * 0.9); minX = Math.min(minX, t[0] - t[2] * 1.2); maxX = Math.max(maxX, t[0] + t[2] * 1.2);
      for (k = 0; k < n; k++) {
        var a = R() * Math.PI * 2, rr = Math.sqrt(R()) * t[2], lx = t[0] + Math.cos(a) * rr * 1.15, ly = t[1] + Math.sin(a) * rr * 0.85;
        var ang = a + (R() - 0.5) * 1.3 + (Math.sin(a) > 0 ? 0.5 : -0.2), up = (lx - 100) / 110 + (ly - (t[1] - t[2])) / (t[2] * 2.2);
        var pal = R() < (up < 0.35 ? 0.62 : up < 0.8 ? 0.38 : 0.16) ? SILV : DARK, h = 3.3 + R() * 1.8;
        leaf(pal[Math.floor(R() * pal.length)], lx, ly, ang, h, 0.72 + R() * 0.35);
        leaves++;
      }
    }
    if (!sap && tips.length > 2) {             // one crown, not stacked clusters: a shaded dome behind, and leaves scattered through it
      var cx0 = (minX + maxX) / 2, rx0 = (maxX - minX) / 2 * 0.92, top0 = minY + 4, bot0 = 0;
      for (i = 0; i < tips.length; i++) bot0 = Math.max(bot0, tips[i][1] + tips[i][2] * 0.5);
      var ry0 = (bot0 - top0) / 2, cy0 = top0 + ry0;
      layerBack.insertBefore(S('ellipse', { cx: cx0.toFixed(1), cy: cy0.toFixed(1), rx: rx0.toFixed(1), ry: (ry0 * 0.92).toFixed(1), fill: thirsty ? '#4d4930' : '#2c3720', opacity: 0.85 }), layerBack.firstChild);
      var nf = Math.round(rx0 * ry0 * 0.1 * dens);
      for (i = 0; i < nf; i++) {
        var fa = R() * Math.PI * 2, fr = Math.sqrt(R()), fx = cx0 + Math.cos(fa) * fr * rx0, fy = cy0 + Math.sin(fa) * fr * ry0 * 0.9;
        var fup = (fx - 100) / 110 + (fy - top0) / (ry0 * 2.2);
        var fpal = R() < (fup < 0.35 ? 0.55 : fup < 0.8 ? 0.32 : 0.12) ? SILV : DARK;
        leaf(fpal[Math.floor(R() * fpal.length)], fx, fy, fa + (R() - 0.5) * 1.4, 3.2 + R() * 1.6, 0.7 + R() * 0.35);
        leaves++;
      }
    }
    for (i = 0; i < cols.length; i++) S('path', { d: bucket[cols[i]].join(''), fill: cols[i] }, layerLeaf);
    // the olives: one per winning trade (the file's count), ripe purple-black and a few still green, each with a glint
    var ol = Math.max(0, Math.min(60, o.olives | 0)), oDark = '', oPurple = '', oGreen = '', glint = '';
    for (i = 0; i < ol && tips.length; i++) {
      var tp = tips[Math.floor(R() * tips.length)], a2 = R() * Math.PI * 2, r2 = Math.sqrt(R()) * tp[2] * 0.75;
      x = tp[0] + Math.cos(a2) * r2; y = tp[1] + Math.sin(a2) * r2 * 0.8 + 3;
      var e = 'M' + (x - 2.5).toFixed(1) + ',' + y.toFixed(1) + 'a2.5,3.2 0 1,0 5,0a2.5,3.2 0 1,0 -5,0Z', rv = R();
      if (rv < 0.25) oGreen += e; else if (rv < 0.62) oPurple += e; else oDark += e;
      glint += 'M' + (x - 0.9).toFixed(1) + ',' + (y - 1.3).toFixed(1) + 'a0.8,0.8 0 1,0 0.01,0Z';
    }
    if (oGreen) S('path', { d: oGreen, fill: '#848235', stroke: '#2e2a12', 'stroke-width': 0.35 }, layerFruit);
    if (oPurple) S('path', { d: oPurple, fill: '#4a2c45', stroke: '#1a1316', 'stroke-width': 0.35 }, layerFruit);
    if (oDark) S('path', { d: oDark, fill: '#2b2129', stroke: '#120d10', 'stroke-width': 0.35 }, layerFruit);
    if (glint) S('path', { d: glint, fill: '#fff6e8', opacity: 0.55 }, layerFruit);
    // keep the whole crown inside the picture: shrink about the foot of the trunk if it would leave the frame
    var fit = Math.min(1, (baseY - 8) / Math.max(1, baseY - minY), 94 / Math.max(1, baseX - minX), 94 / Math.max(1, maxX - baseX));
    if (fit < 0.999) treeG.setAttribute('transform', 'translate(' + (baseX * (1 - fit)).toFixed(2) + ',' + (baseY * (1 - fit)).toFixed(2) + ') scale(' + fit.toFixed(4) + ')');
    svg.setAttribute('data-leaves', String(leaves));
    svg.setAttribute('data-olives', String(ol));
    return svg;

    function stem(x0, y0, x1, y1, w0, w1, hollow) {
      var pts = [], L2 = [], Rr = [], j, N = 14, wig = (R() - 0.5) * 16, wig2 = (R() - 0.5) * 12;
      for (j = 0; j <= N; j++) {
        var u = j / N, cx = x0 + (x1 - x0) * u + Math.sin(u * Math.PI) * wig + Math.sin(u * Math.PI * 2) * wig2 * 0.5, cy = y0 + (y1 - y0) * u;
        pts.push([cx, cy]);
      }
      for (j = 0; j <= N; j++) {
        var u2 = j / N, p = pts[j], q = pts[Math.min(N, j + 1)], pp = pts[Math.max(0, j - 1)], dx = q[0] - pp[0], dy = q[1] - pp[1], dl = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = (w0 + (w1 - w0) * u2) * (1 + (j === 0 ? 0.7 : j === 1 ? 0.25 : 0)) * (0.9 + R() * 0.2) / 2;
        L2.push([p[0] - dy / dl * w, p[1] + dx / dl * w]); Rr.push([p[0] + dy / dl * w, p[1] - dx / dl * w]);
      }
      var outline = L2.concat(Rr.reverse());
      S('path', { d: smoothPath(outline, true), fill: 'url(#pl-bark)', stroke: '#241c15', 'stroke-width': 0.6 }, layerTrunk);
      // bark: twisting dark grooves and a lit ridge on the left
      var gr, side;
      for (gr = 0; gr < 3; gr++) {
        side = -0.5 + gr * 0.5; var line = [];
        for (j = 1; j < N; j++) { var u3 = j / N, ww = (w0 + (w1 - w0) * u3) / 2; line.push([pts[j][0] + (side * ww * 0.9) + Math.sin(u3 * 9 + gr) * ww * 0.25, pts[j][1]]); }
        S('path', { d: smoothPath(line, false), fill: 'none', stroke: '#2a2018', 'stroke-width': 0.9, 'stroke-opacity': 0.75, 'stroke-linecap': 'round' }, layerTrunk);
      }
      var ridge = [];
      for (j = 1; j < N - 1; j++) { var u4 = j / N, w4 = (w0 + (w1 - w0) * u4) / 2; ridge.push([pts[j][0] - w4 * 0.62, pts[j][1]]); }
      S('path', { d: smoothPath(ridge, false), fill: 'none', stroke: '#a08a70', 'stroke-width': 0.8, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, layerTrunk);
      if (hollow) {
        var hp = pts[Math.round(N * 0.38)];
        S('ellipse', { cx: hp[0] + 1, cy: hp[1], rx: w0 * 0.16, ry: w0 * 0.34, fill: '#1a130e', stroke: '#6e5a45', 'stroke-width': 0.6 }, layerTrunk);
      }
      // the roots
      S('path', { d: 'M' + (x0 - w0 * 0.9) + ',' + (y0 + 1) + ' C' + (x0 - w0 * 0.5) + ',' + (y0 - 4) + ' ' + (x0 - w0 * 0.2) + ',' + (y0 - 6) + ' ' + x0 + ',' + (y0 - 8) + ' C' + (x0 + w0 * 0.2) + ',' + (y0 - 6) + ' ' + (x0 + w0 * 0.6) + ',' + (y0 - 3) + ' ' + (x0 + w0 * 1.05) + ',' + (y0 + 1) + ' Z', fill: '#4a3c2e' }, layerTrunk);
    }
    function branch(x0, y0, a, len, w, depth) {
      var bend = (R() - 0.5) * 0.5, x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len, mx = x0 + Math.sin(a + bend) * len * 0.55, my = y0 - Math.cos(a + bend) * len * 0.55;
      S('path', { d: 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + x1.toFixed(1) + ',' + y1.toFixed(1), stroke: '#4e4032', 'stroke-width': Math.max(0.8, w).toFixed(2), fill: 'none', 'stroke-linecap': 'round' }, layerBranch);
      if (depth <= 0 || len < 8) { tips.push([x1, y1, 11 + len * 0.4 + R() * 5]); return; }
      if (depth <= 1 && R() < 0.7) tips.push([mx, my, 9 + R() * 5]);
      var k = R() < 0.35 ? 3 : 2, j;
      for (j = 0; j < k; j++) branch(x1, y1, a * 0.85 + (j - (k - 1) / 2) * (0.45 + R() * 0.3) + (R() - 0.5) * 0.2, len * (0.66 + R() * 0.14), w * 0.62, depth - 1);
    }
  }

  // ------------------------------------------------------------------------------------------------ the statue (17)
  function marbleGroup(svg, id) {
    var cp = S('clipPath', { id: id }, S('defs', null, svg));
    return { g: S('g', { 'class': 'pl-marble-fig' }, svg), cp: cp };
  }
  function limb(g, cp, d) { S('path', { d: d, fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.45, 'stroke-opacity': 0.8 }, g); S('path', { d: d }, cp); }
  /** statue({figure: 'victor'|'athlete'|'nike', record}) -> an <svg> (viewBox 120 x 230): a marble figure in a niche on a plinth */
  function statue(o) {
    defs();
    o = o || {};
    var id = 'pl-s' + (++uid), fig = o.figure === 'nike' ? 'nike' : o.figure === 'victor' ? 'victor' : 'athlete';
    var svg = S('svg', { viewBox: '0 0 120 230', 'class': 'pl-statue', role: 'img', 'aria-label': o.title || 'Marble statue' });
    // the niche with its shell, top-lit
    S('path', { d: 'M12,230 L12,62 A48,48 0 0 1 108,62 L108,230 Z', fill: 'url(#pl-niche)' }, svg);
    var i, a;
    for (i = 0; i < 11; i++) { a = Math.PI + (i + 0.5) * Math.PI / 11; S('path', { d: 'M60,62 L' + (60 + Math.cos(a) * 44).toFixed(1) + ',' + (62 + Math.sin(a) * 44).toFixed(1), stroke: '#4a3e31', 'stroke-width': 1, opacity: 0.7 }, svg); }
    S('path', { d: 'M16,62 A44,44 0 0 1 104,62', fill: 'none', stroke: '#5a4a39', 'stroke-width': 1.2 }, svg);
    S('ellipse', { cx: 60, cy: 110, rx: 40, ry: 70, fill: 'url(#pl-glow)', opacity: 0.55 }, svg);
    S('path', { d: 'M12,62 A48,48 0 0 1 108,62', fill: 'none', stroke: 'url(#pl-gold)', 'stroke-width': 1.4, opacity: o.record ? 0.95 : 0.4 }, svg);
    var M = marbleGroup(svg, id), g = M.g, cp = M.cp;
    if (fig === 'nike') nike(g, cp); else athlete(g, cp, fig === 'victor');
    if (o.mirror && fig === 'athlete') { g.setAttribute('transform', 'translate(120,0) scale(-1,1)'); cp.setAttribute('transform', 'translate(120,0) scale(-1,1)'); }
    // marble veins, clipped to the figure, and a soft shade down its right side
    var v = S('g', { 'clip-path': 'url(#' + id + ')', fill: 'none' }, svg), R = rng(hashStr(id + fig));
    for (i = 0; i < 6; i++) {
      var x0 = 40 + R() * 40, y0 = 70 + R() * 100;
      S('path', { d: 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' c' + (6 + R() * 8).toFixed(1) + ',' + (4 + R() * 6).toFixed(1) + ' ' + (4 + R() * 6).toFixed(1) + ',' + (14 + R() * 10).toFixed(1) + ' ' + (12 + R() * 10).toFixed(1) + ',' + (22 + R() * 12).toFixed(1), stroke: '#8f8676', 'stroke-width': 0.35 + R() * 0.3, opacity: 0.45 }, v);
    }
    S('rect', { x: 64, y: 50, width: 40, height: 140, fill: '#3a2e22', opacity: 0.16 }, v);
    S('rect', { x: 14, y: 50, width: 34, height: 140, fill: '#fff8ec', opacity: 0.08 }, v);
    // the plinth
    S('rect', { x: 24, y: 183, width: 72, height: 6, rx: 1, fill: 'url(#pl-marble-v)', stroke: '#7e766a', 'stroke-width': 0.4 }, svg);
    S('rect', { x: 30, y: 189, width: 60, height: 30, fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.4 }, svg);
    S('rect', { x: 34, y: 194, width: 52, height: 20, fill: 'none', stroke: '#8f8676', 'stroke-width': 0.6 }, svg);
    S('rect', { x: 22, y: 219, width: 76, height: 7, rx: 1, fill: 'url(#pl-marble-v)', stroke: '#7e766a', 'stroke-width': 0.4 }, svg);
    S('rect', { x: 37, y: 197, width: 46, height: 14, fill: o.record ? 'url(#pl-gold)' : 'url(#pl-bronze)', opacity: 0.9 }, svg);
    if (o.record || fig === 'victor') wreath(svg, 60, 59.5, 9.5, 3.2);
    if (fig === 'nike') wreath(svg, 93, 70, 6.5, 6.5);
    return svg;
  }
  function wreath(svg, cx, cy, rx, ry) {
    var g = S('g', { 'class': 'pl-wreath' }, svg), i, a, x, y;
    S('ellipse', { cx: cx, cy: cy, rx: rx, ry: ry, fill: 'none', stroke: 'url(#pl-gold)', 'stroke-width': 1.1 }, g);
    for (i = 0; i < 14; i++) {
      a = i / 14 * Math.PI * 2; x = cx + Math.cos(a) * rx; y = cy + Math.sin(a) * ry;
      S('ellipse', { cx: x.toFixed(2), cy: y.toFixed(2), rx: 2.1, ry: 0.9, fill: i % 2 ? '#e8c873' : '#b08a35', transform: 'rotate(' + (a * 180 / Math.PI + 60).toFixed(0) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')' }, g);
    }
  }
  function head(g, cp, cx, cy, bun) {
    limb(g, cp, 'M' + (cx - 1.6) + ',' + (cy + 6) + ' L' + (cx + 2.2) + ',' + (cy + 6) + ' L' + (cx + 3.2) + ',' + (cy + 13) + ' L' + (cx - 3.4) + ',' + (cy + 13) + ' Z');
    S('ellipse', { cx: cx, cy: cy, rx: 6.4, ry: 7.9, fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.45 }, g);
    S('ellipse', { cx: cx, cy: cy, rx: 6.4, ry: 7.9 }, cp);
    S('path', { d: 'M' + (cx - 6.4) + ',' + (cy - 0.6) + ' C' + (cx - 7) + ',' + (cy - 9) + ' ' + (cx + 6) + ',' + (cy - 10.4) + ' ' + (cx + 6.5) + ',' + (cy - 1) + ' C' + (cx + 4) + ',' + (cy - 4.6) + ' ' + (cx - 3) + ',' + (cy - 5) + ' ' + (cx - 6.4) + ',' + (cy - 0.6) + ' Z', fill: '#d5cdbf', stroke: '#8a8174', 'stroke-width': 0.4 }, g);
    var i;
    for (i = 0; i < 5; i++) S('circle', { cx: (cx - 4.6 + i * 2.3).toFixed(1), cy: (cy - 5.4 + Math.abs(i - 2) * 0.7).toFixed(1), r: 1.15, fill: 'none', stroke: '#8a8174', 'stroke-width': 0.35 }, g);
    if (bun) S('ellipse', { cx: cx - 5.4, cy: cy - 4, rx: 3, ry: 2.6, fill: '#d5cdbf', stroke: '#8a8174', 'stroke-width': 0.4 }, g);
    S('path', { d: 'M' + (cx + 5.6) + ',' + (cy + 0.4) + ' l1.4,2.4 l-1.2,0.6', fill: 'none', stroke: '#8a8174', 'stroke-width': 0.5 }, g);
    S('path', { d: 'M' + (cx + 1.2) + ',' + (cy - 0.4) + ' l2.6,0.2', stroke: '#9a9184', 'stroke-width': 0.5 }, g);
  }
  function athlete(g, cp, victor) {
    // legs first (behind the torso), weight on the right leg, the left knee forward: contrapposto
    limb(g, cp, 'M61,134 C66,135 71.5,133 72.5,129 C73.5,140 72,152 69.6,158 C69,164 70,172 68.8,178.6 L72.6,183 L63,183 L64,178 C62.6,170 62.4,163 63.2,158 C61.8,151 60.6,142 61,134 Z');
    limb(g, cp, 'M48.5,127 C47.5,138 49.5,148 52.4,156 C52.6,162 51,170 50.6,177 L47,183 L54.8,183 L55.4,177 C56.4,169 57.6,162 57,157 C58.6,150 60,142 60.5,136 Z');
    limb(g, cp, 'M48.5,126.6 C49,133 53,138.6 60,139.4 C67,138.6 71.6,134 72.6,128.6 Z');
    limb(g, cp, 'M47,86 C52,83.5 68,83.5 73,86.5 C75.5,93 73.5,104 70.5,112 C70,118 71.5,124 72.6,129 L48.5,127 C49,121 50,116 49.5,111 C46.5,103 45,93 47,86 Z');
    // the carved anatomy, lightly
    var ln = { fill: 'none', stroke: '#9a9184', 'stroke-width': 0.5, 'stroke-linecap': 'round' };
    S('path', merge(ln, { d: 'M52,95 C55,98 58,98 60,96 C62,98 65,98 68,95' }), g);
    S('path', merge(ln, { d: 'M60,99 L60,124' }), g);
    S('path', merge(ln, { d: 'M54,113 C57,115 63,115 66,113 M54.6,119.6 C57.6,121 62.4,121 65.4,119.6' }), g);
    S('path', merge(ln, { d: 'M51,126 C55,131 65,131 70,126' }), g);
    S('path', merge(ln, { d: 'M66.4,157 C67.6,159 68.2,160 67.8,162 M53.4,155.6 C54.6,157.4 55,159 54.4,161' }), g);
    if (victor) {
      limb(g, cp, 'M71.6,87.6 C75.4,84 78.4,78.4 77.8,71.4 C77.4,66 74,61.6 69,59.6 L67.6,62.6 C71,64.6 73.6,67.6 73.6,72 C73.6,77 71.6,81 69.4,84.6 Z');
      limb(g, cp, 'M48.4,87.6 C44.6,84 41.6,78.4 42.2,71.4 C42.6,66 46,61.6 51,59.6 L52.4,62.6 C49,64.6 46.4,67.6 46.4,72 C46.4,77 48.4,81 50.6,84.6 Z');
      head(g, cp, 60, 71.6, false);
    } else {
      limb(g, cp, 'M71.6,87.6 C76,89 77.6,95 77.2,102 C77,108 77.8,114 78.4,120 C78.8,126 78.4,131 77.2,134 L74.6,133.6 C74.6,128 74,122 73.6,117 C72.8,110 72.4,104 72.6,98 Z');
      S('ellipse', { cx: 76, cy: 136.4, rx: 2.4, ry: 3, fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.4 }, g);
      limb(g, cp, 'M48.4,87.6 C44,89 42.4,95 42.6,102 C42.6,108 41.6,114 40.6,120 C40,125 40.2,129 41,132 L43.8,132.4 C44,127 45,122 45.8,117 C47,110 47.4,104 47.2,98 Z');
      S('ellipse', { cx: 42.4, cy: 134.4, rx: 2.3, ry: 2.9, fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.4 }, g);
      var fr = 'M42.4,133 C40,124 38.6,114 39.6,104', j;
      for (j = 0; j < 7; j++) { var yy = 128 - j * 3.6, xx = 41.6 - j * 0.32; fr += ' M' + xx.toFixed(1) + ',' + yy.toFixed(1) + ' l-5,-3.2 M' + xx.toFixed(1) + ',' + yy.toFixed(1) + ' l4.2,-3.6'; }
      S('path', { d: fr, fill: 'none', stroke: 'url(#pl-bronze)', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g);
      head(g, cp, 60, 71.6, false);
    }
  }
  function nike(g, cp) {
    // two wings raised behind the shoulders: long flight feathers hanging from a curved leading edge, a covert band over their roots
    var side, i;
    for (side = -1; side <= 1; side += 2) {
      var E = [], k;
      for (k = 0; k <= 12; k++) {                  // the leading edge: from the shoulder blade up and out to the tip
        var u = k / 12;
        E.push([60 + side * (6 + 29 * u + 4 * Math.sin(u * Math.PI)), 94 - 60 * u + 14 * u * u]);
      }
      var fe = [];
      for (k = 2; k <= 12; k++) {                  // flight feathers, longest near the tip, tilted outwards
        var p0 = E[k], u2 = k / 12, L = 20 + 32 * u2, th = (0.08 + 0.3 * u2) * side, tx = p0[0] + Math.sin(th) * L, ty = p0[1] + Math.cos(th) * L;
        var nx = Math.cos(th) * 3.2, ny = -Math.sin(th) * 3.2;
        fe.push('M' + (p0[0] - nx).toFixed(1) + ',' + (p0[1] - ny).toFixed(1) + ' L' + (tx - nx * 0.7).toFixed(1) + ',' + (ty - ny * 0.7).toFixed(1) +
          ' Q' + (tx + Math.sin(th) * 3).toFixed(1) + ',' + (ty + Math.cos(th) * 3).toFixed(1) + ' ' + (tx + nx * 0.7).toFixed(1) + ',' + (ty + ny * 0.7).toFixed(1) +
          ' L' + (p0[0] + nx).toFixed(1) + ',' + (p0[1] + ny).toFixed(1) + 'Z');
      }
      for (k = fe.length - 1; k >= 0; k--) S('path', { d: fe[k], fill: 'url(#pl-marble)', stroke: '#7e766a', 'stroke-width': 0.4 }, g);
      var cov = 'M' + E[0][0].toFixed(1) + ',' + E[0][1].toFixed(1), q;
      for (q = 1; q <= 12; q++) cov += ' L' + E[q][0].toFixed(1) + ',' + E[q][1].toFixed(1);
      for (q = 12; q >= 0; q--) { var uu = q / 12, dd = 7 + 10 * Math.sin(uu * Math.PI * 0.9); cov += ' L' + (E[q][0] + side * 1.2).toFixed(1) + ',' + (E[q][1] + dd).toFixed(1); }
      S('path', { d: cov + 'Z', fill: 'url(#pl-marble-v)', stroke: '#7e766a', 'stroke-width': 0.45 }, g);
      var sc = '';
      for (q = 1; q < 12; q++) { var u3 = q / 12, d3 = 7 + 10 * Math.sin(u3 * Math.PI * 0.9); sc += 'M' + E[q][0].toFixed(1) + ',' + (E[q][1] + d3 * 0.55).toFixed(1) + ' q' + (side * 2).toFixed(1) + ',3 ' + (side * 4).toFixed(1) + ',0 '; }
      S('path', { d: sc, fill: 'none', stroke: '#9a9184', 'stroke-width': 0.45 }, g);
    }
    // the chiton: a long gown blown back by the wind, with its folds
    limb(g, cp, 'M50,86 C55,84 65,84 70,86 C72,96 71,104 70.4,110 C74,130 80,158 86,183 C72,186 52,186 37,182 C42,160 47,132 50,110 C49,102 48.4,94 50,86 Z');
    var ln = { fill: 'none', stroke: '#9a9184', 'stroke-width': 0.55, 'stroke-linecap': 'round' }, k;
    for (k = 0; k < 6; k++) S('path', merge(ln, { d: 'M' + (52 + k * 3.2) + ',' + (112 + k) + ' C' + (51 + k * 3.6) + ',' + (140) + ' ' + (46 + k * 5.4) + ',' + (164) + ' ' + (42 + k * 7.4) + ',' + (182) }), g);
    S('path', merge(ln, { d: 'M50.4,104 C55,106.4 65,106.4 70,104', stroke: '#8a8174', 'stroke-width': 0.9 }), g);
    S('path', merge(ln, { d: 'M53,92 C55,96 58,97 60,96 C62,97 65,96 67,92' }), g);
    // the arms: the right held out with the wreath, the left down along the gown
    limb(g, cp, 'M69.6,88 C76,86.6 82.4,80.6 86.6,75.4 L89.2,77.6 C85,83.6 78.4,90 71.4,93.4 Z');
    limb(g, cp, 'M50.4,88 C47,92 45.6,100 45.6,108 C45.6,114 46.4,119 47.4,123 L50.2,122.4 C49.6,116 49.4,110 50,104 Z');
    S('path', { d: 'M54,183.4 l4,-2.6 l4,2.6 Z M66,183.4 l3.6,-2.4 l3.6,2.4 Z', fill: '#d9d1c4', stroke: '#7e766a', 'stroke-width': 0.4 }, g);
    head(g, cp, 60, 71.6, true);
  }

  // ------------------------------------------------------------------------------------------------ festival glyphs (13)
  /** glyph('owl'|'kantharos'|'wheat'|'walls') -> an <svg> roundel (viewBox 64 x 64), black figure on a terracotta disc */
  function glyph(kind, label) {
    defs();
    var svg = S('svg', { viewBox: '0 0 64 64', 'class': 'pl-glyph', role: 'img', 'aria-label': label || kind });
    S('circle', { cx: 32, cy: 32, r: 30.5, fill: 'url(#pl-gold)' }, svg);
    S('circle', { cx: 32, cy: 32, r: 28.4, fill: 'url(#pl-terra-disc)' }, svg);
    S('circle', { cx: 32, cy: 32, r: 25.6, fill: 'none', stroke: C.glaze, 'stroke-width': 0.8, 'stroke-dasharray': '1.4 1.6' }, svg);
    var g = S('g', { fill: C.glaze, stroke: C.glaze, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg), inc = { fill: 'none', stroke: '#c87a4f', 'stroke-width': 0.7 };
    if (kind === 'owl') {
      S('path', { d: 'M22,46 C18,38 19.6,26 25,21.6 L23.6,15.6 L28,19.4 C30.6,18.6 33.4,18.6 36,19.4 L40.4,15.6 L39,21.6 C44.4,26 46,38 42,46 C38,49 26,49 22,46 Z', 'stroke-width': 0.5 }, g);
      S('circle', merge(inc, { cx: 27.6, cy: 26.4, r: 3.6, fill: '#c87a4f', stroke: 'none' }), svg);
      S('circle', merge(inc, { cx: 36.4, cy: 26.4, r: 3.6, fill: '#c87a4f', stroke: 'none' }), svg);
      S('circle', { cx: 27.8, cy: 26.6, r: 1.6, fill: C.glaze }, svg); S('circle', { cx: 36.2, cy: 26.6, r: 1.6, fill: C.glaze }, svg);
      S('path', { d: 'M32,28.6 L30.8,31.6 L32,33.2 L33.2,31.6 Z', fill: '#c87a4f' }, svg);
      S('path', merge(inc, { d: 'M25,36 C27,40 29,42 32,43 M39,36 C37,40 35,42 32,43 M26.6,39.6 l1.4,1 M37.4,39.6 l-1.4,1' }), svg);
      S('path', { d: 'M14,49.6 C24,47.6 40,47.6 50,49.6', fill: 'none', stroke: C.glaze, 'stroke-width': 1.6 }, svg);
      S('path', { d: 'M27,47.6 l-1,2.6 M30,47.8 l-0.4,2.6 M34,47.8 l0.4,2.6 M37,47.6 l1,2.6', fill: 'none', stroke: C.glaze, 'stroke-width': 1 }, svg);
      S('path', { d: 'M46,49.4 C48,46 51,45 53,45.6 C51.4,47.4 49,48.6 46,49.4 Z M44,48.8 C44.6,45.2 46.6,43 49,42.4 C48,44.6 46.4,46.8 44,48.8 Z', fill: C.glaze }, svg);
    } else if (kind === 'kantharos') {
      S('path', { d: 'M18,24 L46,24 C46,33 41,38.6 32,39 C23,38.6 18,33 18,24 Z', 'stroke-width': 0.5 }, g);
      S('path', { d: 'M30.4,39 L33.6,39 L33.2,45 L30.8,45 Z M24.4,48 C26,45.4 38,45.4 39.6,48 Z', 'stroke-width': 0.5 }, g);
      S('path', { d: 'M19,25 C10,24 11,12 17,13.6 C20,14.4 20,18 19,22 M45,25 C54,24 53,12 47,13.6 C44,14.4 44,18 45,22', fill: 'none', 'stroke-width': 1.7 }, g);
      S('path', merge(inc, { d: 'M20.6,27.4 C26,29.4 38,29.4 43.4,27.4' }), svg);
      var i;
      for (i = 0; i < 6; i++) S('circle', { cx: 32 + (i % 3 - 1) * 3.4 + (i > 2 ? 1.7 : 0), cy: 18.6 - (i > 2 ? 3 : 0), r: 1.9, fill: C.glaze }, svg);
      S('path', { d: 'M33,12.2 C34.6,9.6 37.4,9 39.4,10 C37.6,11.4 35.6,12.4 33,12.2 Z', fill: C.glaze }, svg);
    } else if (kind === 'wheat') {
      var s, k;
      for (s = -1; s <= 1; s++) {
        var bx = 32 + s * 8, top = 13 + Math.abs(s) * 3;
        S('path', { d: 'M' + (32 + s * 2) + ',52 C' + (32 + s * 3) + ',40 ' + bx + ',32 ' + bx + ',' + (top + 12), fill: 'none', 'stroke-width': 1.2 }, g);
        for (k = 0; k < 5; k++) {
          var y = top + k * 3.2;
          S('ellipse', { cx: bx - 1.8, cy: y + 1.6, rx: 1.4, ry: 2.6, transform: 'rotate(-28 ' + (bx - 1.8) + ' ' + (y + 1.6) + ')', 'stroke-width': 0 }, g);
          S('ellipse', { cx: bx + 1.8, cy: y + 1.6, rx: 1.4, ry: 2.6, transform: 'rotate(28 ' + (bx + 1.8) + ' ' + (y + 1.6) + ')', 'stroke-width': 0 }, g);
        }
        S('ellipse', { cx: bx, cy: top - 1, rx: 1.2, ry: 2.4, 'stroke-width': 0 }, g);
      }
      S('path', { d: 'M27,42 C22,40 19,36 18.6,32 C22,34 25,37 27,42 Z M37,42 C42,40 45,36 45.4,32 C42,34 39,37 37,42 Z', 'stroke-width': 0 }, g);
      S('path', { d: 'M24,50 C28,47.4 36,47.4 40,50', fill: 'none', stroke: '#c87a4f', 'stroke-width': 1.4 }, svg);
    } else {                                  // walls: the city's walls, two towers, a gate, the temple above
      S('path', { d: 'M12,48 L12,34 L15,34 L15,31.6 L18,31.6 L18,34 L21,34 L21,28 L19.6,28 L19.6,25 L22.4,25 L22.4,27 L25,27 L25,25 L27.8,25 L27.8,28 L26.6,28 L26.6,34 L37.4,34 L37.4,28 L36.2,28 L36.2,25 L39,25 L39,27 L41.6,27 L41.6,25 L44.4,25 L44.4,28 L43,28 L43,34 L46,34 L46,31.6 L49,31.6 L49,34 L52,34 L52,48 Z', 'stroke-width': 0.4 }, g);
      S('path', { d: 'M28.6,48 L28.6,41 C28.6,37.4 35.4,37.4 35.4,41 L35.4,48 Z', fill: '#c87a4f' }, svg);
      S('path', { d: 'M22,20 L32,13.6 L42,20 Z', 'stroke-width': 0.4 }, g);
      S('path', { d: 'M23.6,21 L40.4,21 L40.4,22.4 L23.6,22.4 Z', 'stroke-width': 0 }, g);
      var c;
      for (c = 0; c < 5; c++) S('rect', { x: 24.6 + c * 3.4, y: 22.4, width: 1.6, height: 2.6, 'stroke-width': 0 }, g);
      S('path', merge(inc, { d: 'M14,40 L26,40 M38,40 L50,40 M14,44 L26,44 M38,44 L50,44' }), svg);
    }
    return svg;
  }

  // ------------------------------------------------------------------------------------------------ the pieces
  function head2(el, title, sub, opts) {
    var h = H('header', 'pl-head', null, el);
    H('h2', 'pl-title', title, h);
    if (sub) H('p', 'pl-sub', sub, h);
    border(h, opts);
    return h;
  }
  function border(el, opts) {                // the POLIS kit's meander band when olympus/polis.js is on the page, else a simple patterned band
    var k = kit('meander');
    if (k) {
      var box = H('div', 'pl-meander pl-meander-kit', null, el), r = null;
      box.setAttribute('aria-hidden', 'true');
      try { r = k(box, { sides: 'band', size: 12, color: 'gold', inset: 0, draw: !still(opts) }); } catch (e) { r = null; }
      if (r && box.firstChild) return;
      el.removeChild(box);
    }
    var svg = S('svg', { 'class': 'pl-meander', viewBox: '0 0 160 8', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, el);
    S('rect', { x: 0, y: 0, width: 160, height: 8, fill: 'url(#pl-mea-gold)', opacity: 0.75 }, svg);
  }
  function laurelMark(el, kind, opts) {      // the kit's gold laurel wreath / olive sprig, when the kit is there (nothing otherwise)
    var k = kit('laurel');
    if (!k) return null;
    var box = H('span', 'pl-laurel pl-laurel-' + kind, null, el);
    try { k(box, { kind: kind, gold: kind === 'laurel', size: 30, animate: !still(opts) }); } catch (e) { el.removeChild(box); return null; }
    if (!box.firstChild) { el.removeChild(box); return null; }
    return box;
  }
  function empty(el, text) { var p = H('p', 'pl-empty', text, el); return p; }
  function srcLine(el, text) { if (text) H('p', 'pl-src', text, el); }
  function section(el, kind) {
    defs(); css();
    clear(el);
    el.classList.add('pl-piece', 'pl-' + kind);
    return el;
  }

  // 11. the herald
  function herald(el, d, opts) {
    section(el, 'herald');
    var lines = (d && d.herald) || [], i = 0, timer = 0, move = !still(opts);
    var box = H('div', 'pl-hb', null, el), icon = S('svg', { viewBox: '0 0 48 48', 'class': 'pl-salpinx', 'aria-hidden': 'true' }, box);
    S('circle', { cx: 24, cy: 24, r: 23, fill: 'url(#pl-bronze)' }, icon);
    S('circle', { cx: 24, cy: 24, r: 20.6, fill: '#2a2119' }, icon);
    S('path', { d: 'M7,26.4 L30,23.2 L30,25.6 L7,27.8 Z', fill: 'url(#pl-gold)', stroke: '#6b4f1c', 'stroke-width': 0.5 }, icon);
    S('path', { d: 'M29.4,23.3 C33,22.4 36.4,19.8 38.6,16.4 C40.6,21.4 40.8,27 39,32 C36.6,29 33,26.6 29.4,25.5 Z', fill: 'url(#pl-gold)', stroke: '#6b4f1c', 'stroke-width': 0.6 }, icon);
    S('ellipse', { cx: 38.8, cy: 24.2, rx: 1.3, ry: 7.7, fill: '#8d6c25', transform: 'rotate(-6 38.8 24.2)' }, icon);
    S('rect', { x: 15, y: 24.4, width: 2.2, height: 3.6, rx: 0.6, fill: '#8d6c25', transform: 'rotate(-8 16 26)' }, icon);
    S('path', { d: 'M5.4,25.6 L8.6,25.2 L8.8,28.2 L5.6,28.4 Z', fill: '#8d6c25' }, icon);
    S('path', { d: 'M17,30 C22,36 28,36 31,31', fill: 'none', stroke: '#c96a4a', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, icon);
    S('path', { d: 'M30.6,31.2 l2.6,3.4 l-3.6,0.4', fill: '#c96a4a' }, icon);
    var txt = H('div', 'pl-hb-text', null, box), kick = H('p', 'pl-kicker', '', txt), cry = H('p', 'pl-cry', '', txt), plain = H('p', 'pl-plain', '', txt);
    txt.setAttribute('aria-live', 'polite');
    border(el, opts);
    var nav = H('div', 'pl-hb-nav', null, el), prev = H('button', 'pl-btn', '‹', nav), cnt = H('span', 'pl-count', '', nav), next = H('button', 'pl-btn', '›', nav);
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Previous herald line'); next.setAttribute('aria-label', 'Next herald line');
    var KIND = { pass: 'Eval passed', payout: 'Payout', trade: 'Trade closed', kalshi: 'Kalshi (paper)', money: 'Money estimate', festival: 'Festival', torch: 'Torch relay' };
    function show(k) {
      if (!lines.length) {
        kick.textContent = 'The herald'; cry.textContent = 'The agora is quiet. Nothing new to cry today.'; plain.textContent = 'No published file had news for the herald.';
        nav.hidden = true; return;
      }
      i = (k + lines.length) % lines.length;
      var L = lines[i], who = L.crier && L.crier.name ? L.crier.name + ' the herald' : 'The herald';
      kick.textContent = who + ' · ' + (KIND[L.kind] || L.kind);
      cry.textContent = L.cry || ''; plain.textContent = L.plain || '';
      cry.className = 'pl-cry ' + tone(L.usd);
      cnt.textContent = (i + 1) + ' of ' + lines.length;
      if (move) { txt.classList.remove('pl-in'); void txt.offsetWidth; txt.classList.add('pl-in'); }
    }
    function arm() { if (timer) root.clearInterval(timer); timer = 0; if (move && lines.length > 1) timer = root.setInterval(function () { if (!doc.hidden) show(i + 1); }, 7000); }
    prev.onclick = function () { show(i - 1); arm(); };
    next.onclick = function () { show(i + 1); arm(); };
    show(0); arm();
    el.__plStop = function () { if (timer) root.clearInterval(timer); timer = 0; };
    return el;
  }

  // 12. the oracle
  function oracle(el, d, opts) {
    section(el, 'oracle');
    var o = (d && d.oracle) || null, top = H('div', 'pl-or-top', null, el), art = S('svg', { viewBox: '0 0 80 96', 'class': 'pl-tripod' + (still(opts) ? '' : ' pl-move'), 'aria-hidden': 'true' }, top);
    // the Pythia's tripod with its bowl, and smoke rising
    var sm = S('g', { 'class': 'pl-smoke' }, art);
    S('path', { d: 'M40,40 C34,32 46,26 39,18 C34,12 42,6 40,1', fill: 'none', stroke: '#cfc4b2', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.35 }, sm);
    S('path', { d: 'M44,40 C50,33 40,27 46,19 C50,14 45,8 48,3', fill: 'none', stroke: '#cfc4b2', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.25 }, sm);
    S('ellipse', { cx: 40, cy: 44, rx: 22, ry: 5, fill: 'url(#pl-gold)' }, art);
    S('path', { d: 'M18,44 C20,54 30,58 40,58 C50,58 60,54 62,44 Z', fill: 'url(#pl-bronze)', stroke: '#4a3018', 'stroke-width': 0.6 }, art);
    S('path', { d: 'M24,50 C30,53 50,53 56,50', fill: 'none', stroke: '#e2b878', 'stroke-width': 0.6, opacity: 0.7 }, art);
    S('path', { d: 'M26,56 L14,92 M40,58 L40,94 M54,56 L66,92', stroke: 'url(#pl-bronze)', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, art);
    S('path', { d: 'M20,74 C30,70 50,70 60,74', fill: 'none', stroke: '#8d6c25', 'stroke-width': 1.2 }, art);
    S('ellipse', { cx: 40, cy: 44, rx: 18, ry: 3.2, fill: '#4a3424' }, art);
    S('ellipse', { cx: 40, cy: 43.4, rx: 10, ry: 1.6, fill: '#f2c35e', opacity: 0.5 }, art);
    var hd = H('div', 'pl-or-head', null, top);
    H('p', 'pl-kicker', (o && o.speaker && o.speaker.name ? o.speaker.name + ', the Pythia' : 'The Pythia') + ' · Oracle of the day', hd);
    H('h2', 'pl-title', 'The oracle speaks', hd);
    if (o && o.stale) H('p', 'pl-tag pl-warn', 'From ' + o.day + ', not today', hd);
    border(el, opts);
    var verse = H('blockquote', 'pl-verse', (o && o.verse) || 'The tripod is cold. The god keeps silent today.', el);
    verse.setAttribute('cite', (o && o.src) || '');
    H('p', 'pl-eyebrow', 'In plain words', el);
    var ul = H('ul', 'pl-plainlist', null, el), k;
    var plain = (o && o.plain) || ['No morning game plan was published yet.'];
    for (k = 0; k < plain.length; k++) H('li', null, plain[k], ul);
    if (o && o.facts && o.facts.length) {
      var det = H('details', 'pl-facts', null, el), sum = H('summary', null, 'The facts it rests on (' + o.facts.length + ')', det), fl = H('ul', null, null, det);
      for (k = 0; k < o.facts.length; k++) { var li = H('li', null, o.facts[k].t, fl); H('span', 'pl-src', ' · ' + o.facts[k].src + (o.facts[k].at ? ' (' + o.facts[k].at + ')' : ''), li); }
      void sum;
    }
    return el;
  }

  // 13. festivals
  function festivals(el, d, opts) {
    section(el, 'festivals');
    var f = (d && d.festivals) || { items: [] };
    head2(el, 'Festival calendar', 'Market days as the city keeps them', opts);
    if (!f.items || !f.items.length) { empty(el, 'No festival in the next months on the published calendar.'); srcLine(el, f.label); return el; }
    var strip = H('div', 'pl-fest-strip', null, el), i;
    strip.setAttribute('role', 'list');
    for (i = 0; i < f.items.length; i++) {
      var it = f.items[i], card = H('button', 'pl-fest pl-fest-' + it.kind + (it.days_left <= 1 ? ' pl-soon' : ''), null, strip);
      card.type = 'button'; card.setAttribute('role', 'listitem'); card.setAttribute('aria-expanded', 'false');
      card.appendChild(glyph(it.glyph, it.festival));
      H('span', 'pl-fest-name', it.festival, card);
      H('span', 'pl-fest-ev', it.title, card);
      H('span', 'pl-fest-date', it.date_words + (it.time ? ', ' + it.time + ' ET' : ''), card);
      var cd = H('span', 'pl-fest-cd', null, card);
      if (it.days_left === 0) cd.appendChild(doc.createTextNode('Today'));
      else { H('b', null, String(it.days_left), cd); cd.appendChild(doc.createTextNode(it.days_left === 1 ? ' day' : ' days')); }
      var mean = H('span', 'pl-fest-mean', it.meaning + (it.week_of ? ' Roll week of ' + it.week_of + '.' : '') + (it.verify ? ' Confirm on the official page.' : ''), card);
      mean.hidden = true;
      card.onclick = (function (c, m) { return function () { m.hidden = !m.hidden; c.setAttribute('aria-expanded', m.hidden ? 'false' : 'true'); }; })(card, mean);
    }
    srcLine(el, f.label);
    return el;
  }

  // 14. the torch relay
  function torch(el, d, opts) {
    section(el, 'torch');
    var t = (d && d.torch) || { weeks: { rows: [], streak: 0, best: 0 }, days: { rows: [], streak: 0, best: 0 }, flame: 'unlit' }, move = !still(opts);
    var wk = t.weeks || {}, dy = t.days || {};
    head2(el, 'The torch relay', (wk.streak || 0) + ' green week' + (wk.streak === 1 ? '' : 's') + ' in a row (best ' + (wk.best || 0) + ') · ' +
      (dy.streak || 0) + ' rule-kept day' + (dy.streak === 1 ? '' : 's') + ' in a row (best ' + (dy.best || 0) + ')', opts);
    var rows = (wk.rows || []).slice(-6), W = 360, Hh = 132, i;
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + Hh, 'class': 'pl-frieze' + (move ? ' pl-move' : ''), role: 'img', 'aria-label': 'Torch relay: one runner per finished week' }, el);
    S('rect', { x: 0, y: 0, width: W, height: Hh, rx: 10, fill: 'url(#pl-terra-disc)' }, svg);
    S('rect', { x: 0, y: 0, width: W, height: Hh, rx: 10, fill: '#000', opacity: 0.12 }, svg);
    S('rect', { x: 6, y: 6, width: W - 12, height: 8, fill: 'url(#pl-mea-dark)' }, svg);
    S('rect', { x: 6, y: Hh - 14, width: W - 12, height: 8, fill: 'url(#pl-mea-dark)' }, svg);
    S('path', { d: 'M6,16.4 H' + (W - 6) + ' M6,' + (Hh - 16.4) + ' H' + (W - 6), stroke: C.glaze, 'stroke-width': 0.8 }, svg);
    if (!rows.length) {
      T(S('text', { x: W / 2, y: Hh / 2 + 5, 'text-anchor': 'middle', 'class': 'pl-svgtext pl-dark' }, svg), 'No finished week yet: the torch waits at the altar.');
    }
    var gap = W / Math.max(6, rows.length), x0 = (W - gap * rows.length) / 2, streakFrom = rows.length;
    for (i = rows.length - 1; i >= 0 && rows[i].green; i--) streakFrom = i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], cx = x0 + gap * i + gap / 2, lit = r.green, inRun = i >= streakFrom, last = i === rows.length - 1;
      var u = S('use', { href: '#pl-runner', x: cx - 22, y: 24, width: 44, height: 53, color: C.glaze, style: '--pl-inc:var(--oly-th-a8, #c87a4f)', opacity: lit ? 1 : 0.55 }, svg);
      u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#pl-runner');
      var fx = cx - 22 + 34.6 * 44 / 40, fy = 24 + 2.2 * 53 / 48;
      if (lit) {
        var fl = S('g', { 'class': 'pl-flame' + (inRun && last ? ' pl-flame-lead' : ''), transform: 'translate(' + fx.toFixed(1) + ',' + fy.toFixed(1) + ')' }, svg);
        S('circle', { cx: 0, cy: -5, r: inRun ? 11 : 7, fill: 'url(#pl-glow)' }, fl);
        S('path', { d: 'M0,1 C-4.4,-2 -3.6,-7 0,-12.6 C1.2,-8.6 4.6,-6.4 3.4,-2 C2.8,0 1.6,1 0,1 Z', fill: 'url(#pl-flame)' }, fl);
        S('path', { d: 'M0,0 C-1.6,-1.6 -1.4,-4 0,-6.4 C0.8,-4.4 1.8,-3 1.2,-1 Z', fill: '#fff1c4', opacity: 0.85 }, fl);
      } else {
        var sm = S('g', { 'class': 'pl-smoke' }, svg);
        S('path', { d: 'M' + fx.toFixed(1) + ',' + fy.toFixed(1) + ' c-3,-4 3,-7 0,-11 c-2,-3 1,-5 0,-7', fill: 'none', stroke: '#3a2e26', 'stroke-width': 1.2, 'stroke-linecap': 'round', opacity: 0.6 }, sm);
      }
      T(S('text', { x: cx, y: 93, 'text-anchor': 'middle', 'class': 'pl-svgtext pl-dark pl-small' }, svg), MON[+r.week.slice(5, 7) - 1] + ' ' + (+r.week.slice(8, 10)));
      T(S('text', { x: cx, y: 109, 'text-anchor': 'middle', 'class': 'pl-svgtext pl-num pl-dark' }, svg), money(Math.round(r.net)));
    }
    if (rows.length > 1) S('path', { d: 'M' + (x0 + gap / 2 + 18) + ',30 H' + (x0 + gap * (rows.length - 0.5) - 4), stroke: C.glaze, 'stroke-width': 0.6, 'stroke-dasharray': '2 3', opacity: 0.6 }, svg);
    // the days: one small oil lamp per trading day, lit when every trade kept the rules
    var days = (dy.rows || []).slice(-20), lamps = H('div', 'pl-lamps', null, el);
    lamps.setAttribute('role', 'img');
    lamps.setAttribute('aria-label', (dy.streak || 0) + ' rule-kept days in a row');
    for (i = 0; i < days.length; i++) {
      var ls = S('svg', { viewBox: '0 0 20 22', 'class': 'pl-lamp' + (days[i].kept ? '' : ' pl-out') }, lamps);
      S('path', { d: 'M2,15 C2,11 7,10 12,11 L18,9.6 C17,12.6 15,15 12,16 C8,17.6 2,18 2,15 Z', fill: days[i].kept ? '#b8643e' : '#6a4a36', stroke: '#3a2116', 'stroke-width': 0.5 }, ls);
      S('ellipse', { cx: 7.4, cy: 18.6, rx: 3.4, ry: 1.2, fill: '#3a2116' }, ls);
      if (days[i].kept) { S('path', { d: 'M17.6,9.4 C15.8,7.6 16.4,4.8 18.2,2 C18.8,4.4 20,6 19.4,8 C19.2,9 18.6,9.6 17.6,9.4 Z', fill: 'url(#pl-flame)', 'class': 'pl-lampflame' }, ls); }
      else S('path', { d: 'M18,8.6 c-1.4,-1.8 1,-3 0,-5', fill: 'none', stroke: '#6a5a4c', 'stroke-width': 0.6 }, ls);
    }
    var brk = null;
    for (i = (dy.rows || []).length - 1; i >= 0; i--) if (!dy.rows[i].kept) { brk = dy.rows[i]; break; }
    var note = H('p', 'pl-note', null, el);
    if (!days.length) note.textContent = 'No trading day yet. The lamps are filled and waiting.';
    else note.textContent = (t.flame === 'out' ? 'The flame is out. ' : '') + (brk ? 'Last break: ' + brk.day + ' (' + brk.broke.join(', ') + ').' : 'No rule broken on the published days.') +
      (wk.current ? ' This week so far: ' + money(wk.current.net) + ' on ' + wk.current.trades + ' trade' + (wk.current.trades === 1 ? '' : 's') + '.' : '');
    srcLine(el, t.rule);
    return el;
  }

  // 15. the olive grove
  function grove(el, d, opts) {
    section(el, 'grove');
    var g = (d && d.grove) || { trees: [] }, trees = g.trees || [], i;
    head2(el, 'The olive grove', 'One tree for every account', opts);
    if (!trees.length) { empty(el, 'No account is published yet, so no tree is planted. The grove waits for the site build.'); srcLine(el, g.rule); return el; }
    var grid = H('div', 'pl-grove-grid', null, el);
    for (i = 0; i < trees.length; i++) {
      var t = trees[i], card = H('figure', 'pl-tree-card pl-stage-' + t.stage, null, grid);
      card.appendChild(tree({ id: t.id, growth: t.growth, olives: t.olives, thirsty: t.thirsty, title: t.name + ': ' + t.line }, opts));
      var cap = H('figcaption', null, null, card), top = H('div', 'pl-tree-top', null, cap);
      H('b', 'pl-tree-name', t.name, top);
      H('span', 'pl-chip pl-chip-' + t.stage, t.stage === 'funded' ? 'Funded' : t.stage === 'paper' ? 'Paper' : 'Eval', top);
      if (num(t.balance)) H('p', 'pl-tree-bal pl-num', money(t.balance, false) + (num(t.profit) ? ' · ' : ''), cap).appendChild(span(money(t.profit), tone(t.profit)));
      H('p', 'pl-tree-line', t.line, cap);
      if (num(t.room) && num(t.mll)) H('p', 'pl-tree-dd', 'Drawdown left ' + money(t.room, false) + ' of ' + money(t.mll, false) + ' max loss', cap);
      if (num(t.payouts) && t.payouts > 0) H('p', 'pl-tree-dd', 'Paid out ' + money(t.payouts, false), cap);
      var meta = H('div', 'pl-tree-meta', null, cap);
      meta.appendChild(rings(t.rings));
      if (t.stage === 'funded') laurelMark(meta, 'olive', opts);
      H('span', null, t.rings + ' ring' + (t.rings === 1 ? '' : 's') + ' · ' + t.olives + ' olive' + (t.olives === 1 ? '' : 's'), meta);
    }
    srcLine(el, g.rule);
    return el;
  }
  function span(text, cls) { var s = doc.createElement('span'); if (cls) s.className = cls; s.textContent = text; return s; }
  function rings(n) {
    var svg = S('svg', { viewBox: '0 0 28 28', 'class': 'pl-rings', 'aria-hidden': 'true' }), k, m = Math.max(0, Math.min(12, n | 0));
    S('circle', { cx: 14, cy: 14, r: 13, fill: '#7a5a3a', stroke: '#3a2716', 'stroke-width': 1 }, svg);
    S('circle', { cx: 14, cy: 14, r: 11.6, fill: '#c9a477' }, svg);
    for (k = 1; k <= m; k++) S('circle', { cx: 14 + (k % 2 ? 0.3 : -0.2), cy: 14, r: (11.6 * k / (m + 1)).toFixed(2), fill: 'none', stroke: '#8a6440', 'stroke-width': 0.55 }, svg);
    S('circle', { cx: 14, cy: 14, r: 1, fill: '#6a4a2a' }, svg);
    return svg;
  }

  // 16. the amphora storeroom
  function amphorae(el, d, opts) {
    section(el, 'amphorae');
    var a = (d && d.amphorae) || { shelves: [], n: 0 }, sh = a.shelves || [], i, j;
    head2(el, 'The storeroom', (a.n || 0) + ' amphora' + (a.n === 1 ? '' : 'e') + ', one for every closed trade', opts);
    if (!sh.length) { empty(el, 'No closed trade is published yet. The shelves are swept and ready.'); srcLine(el, a.rule); return el; }
    var detail = H('p', 'pl-amph-detail', 'Tap an amphora to read it.', null), w = el.clientWidth || 358, per = Math.max(5, Math.min(9, Math.floor((w - 16) / 54)));
    detail.setAttribute('aria-live', 'polite');
    for (i = 0; i < sh.length; i++) {
      var s = sh[i], box = H('section', 'pl-shelf', null, el), hd = H('div', 'pl-shelf-head', null, box);
      H('b', null, s.label, hd);
      var sum = H('span', 'pl-num', s.n + ' trade' + (s.n === 1 ? '' : 's') + ' · ', hd); sum.appendChild(span(money(s.net), tone(s.net)));
      for (j = 0; j < s.items.length; j += per) {
        var row = H('div', 'pl-shelf-row', null, box), k;
        for (k = j; k < Math.min(s.items.length, j + per); k++) {
          var it = s.items[k], b = H('button', 'pl-jar', null, row), ttl = it.day + ', ' + it.bot + ' ' + (it.side === 'LONG' ? 'long' : 'short') + ': ' + it.label;
          b.type = 'button'; b.setAttribute('aria-label', ttl);
          b.appendChild(amphora({ scene: it.scene, result: it.result, title: ttl }));
          H('span', 'pl-jar-usd ' + tone(it.usd), money(it.usd).replace(/\.\d\d$/, ''), b);
          b.onclick = (function (x) { return function () { detail.textContent = x.day + ' · ' + x.bot + (x.paper ? ' (paper)' : '') + ' · ' + (x.side === 'LONG' ? 'Long, a rising horse' : 'Short, a diving dolphin') + ' · ' + x.label + (x.exit ? ' · exit ' + x.exit.toLowerCase() : ''); }; })(it);
        }
        H('div', 'pl-plank', null, box).setAttribute('aria-hidden', 'true');
      }
    }
    el.appendChild(detail);
    srcLine(el, a.rule);
    return el;
  }

  // 17. the hall of statues
  function statues(el, d, opts) {
    section(el, 'statues');
    var s = (d && d.statues) || { items: [] }, it = s.items || [], i;
    head2(el, 'Hall of statues', 'The best trades and every pass', opts);
    if (!it.length) { empty(el, 'The plinths stand empty: no winning trade or pass is published yet.'); srcLine(el, s.rule); return el; }
    var hall = H('div', 'pl-hall', null, el);
    for (i = 0; i < it.length; i++) {
      var x = it[i], f = H('figure', 'pl-niche' + (x.record ? ' pl-record' : ''), null, hall);
      f.appendChild(statue({ figure: x.figure, record: x.record, mirror: i % 2 === 1, title: x.title + ', ' + x.plaque }));
      var cap = H('figcaption', 'pl-plaque', null, f);
      if (x.record || x.kind === 'pass') laurelMark(cap, 'laurel', opts);
      if (x.record) H('span', 'pl-chip pl-chip-record', 'Record', cap);
      H('b', null, x.title, cap);
      H('span', 'pl-plaque-line', x.day || '', cap);
      if (num(x.usd)) H('span', 'pl-plaque-usd pl-num ' + tone(x.usd), usdR(x.usd, x.r) + (x.kind === 'payout' ? ' paid out' : ''), cap);
      else H('span', 'pl-plaque-usd', x.kind === 'pass' ? 'Eval passed' : '', cap);
    }
    srcLine(el, s.rule);
    return el;
  }

  // 18. the stoic line
  function stoic(el, d, opts) {
    section(el, 'stoic');
    var s = (d && d.stoic) || null, tab = H('figure', 'pl-tablet', null, el);
    var q = H('blockquote', 'pl-inscr', s ? s.text : 'Some things are in our control and others not.', tab);
    void q;
    var cap = H('figcaption', null, null, tab);
    cap.appendChild(doc.createTextNode('— ' + (s ? s.author + ', ' + s.work : 'Epictetus, Enchiridion 1')));
    H('span', 'pl-tr', ' (tr. ' + (s ? s.translator : 'T. W. Higginson') + ', public domain)', cap);
    if (s && s.why) H('p', 'pl-note', s.why, el);
    void opts;
    return el;
  }

  var PIECES = { herald: herald, oracle: oracle, festivals: festivals, torch: torch, grove: grove, amphorae: amphorae, statues: statues, stoic: stoic };
  var ORDER = ['herald', 'oracle', 'stoic', 'festivals', 'torch', 'grove', 'amphorae', 'statues'];
  function render(el, kind, d, opts) {
    if (!el || !PIECES[kind]) return null;
    try { return PIECES[kind](el, d || {}, opts || {}); } catch (e) { try { clear(el); empty(el, 'This part could not be drawn.'); } catch (e2) {} if (root.console) root.console.warn('polis-life', kind, e); return el; }
  }
  function all(el, d, opts) {
    var out = {}, i;
    clear(el);
    for (i = 0; i < ORDER.length; i++) { var s = H('section', null, null, el); out[ORDER[i]] = render(s, ORDER[i], d, opts); }
    return out;
  }
  function load(url, cb) {
    var x;
    try { x = new XMLHttpRequest(); } catch (e) { cb(null); return; }
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      if (x.status >= 200 && x.status < 300) { try { j = JSON.parse(x.responseText); } catch (e) { j = null; } }
      cb(j && j.kind === 'olympus-polis' ? j : null);
    };
    try { x.send(); } catch (e) { cb(null); }
  }

  // ------------------------------------------------------------------------------------------------ placed in the apps (QA round 6)
  // Zero code: <section class="pl-place" data-polis-life="grove" hidden></section> anywhere in an app, plus this script. The page loads
  // polis.json (next to this script) once and draws each piece into its element. A piece with nothing to show stays hidden (an app
  // never shows an empty civic card); data-polis-life-empty="show" keeps the quiet empty line instead. ?demo=1 reads polis-demo.json
  // (labelled DEMO under the piece). data-polis-life-src="<url>" reads another file. place(root) runs it again after new markup.
  var BASE = (function () { var s = doc.currentScript, src = s && s.getAttribute('src'); return src ? src.replace(/[^\/]*$/, '') : '../olympus/'; })();
  function hasLife(kind, d) {
    if (!d) return false;
    switch (kind) {
      case 'herald': return !!(d.herald && d.herald.length);
      case 'oracle': return !!(d.oracle && d.oracle.src);
      case 'festivals': return !!(d.festivals && d.festivals.items && d.festivals.items.length);
      case 'torch': return !!(d.torch && ((d.torch.weeks && d.torch.weeks.rows && d.torch.weeks.rows.length) || (d.torch.days && d.torch.days.rows && d.torch.days.rows.length)));
      case 'grove': return !!(d.grove && d.grove.trees && d.grove.trees.length);
      case 'amphorae': return !!(d.amphorae && d.amphorae.n);
      case 'statues': return !!(d.statues && d.statues.items && d.statues.items.length);
      case 'stoic': return !!d.stoic;
    }
    return false;
  }
  var cache = {};
  function fetchDoc(url, cb) {
    if (cache[url]) { if (cache[url].done) cb(cache[url].doc); else cache[url].q.push(cb); return; }
    var c = cache[url] = { done: false, doc: null, q: [cb] };
    load(url, function (j) { c.done = true; c.doc = j; var q = c.q; c.q = []; for (var i = 0; i < q.length; i++) { try { q[i](j); } catch (e) {} } });
  }
  function place(rootEl) {
    var els = (rootEl || doc).querySelectorAll ? (rootEl || doc).querySelectorAll('[data-polis-life]') : [], i;
    var demo = /[?&]demo=1(&|$)/.test(root.location ? root.location.search : '');
    for (i = 0; i < els.length; i++) (function (el) {
      if (el.__plPlaced) return;
      el.__plPlaced = true;
      var kind = el.getAttribute('data-polis-life'), url = el.getAttribute('data-polis-life-src') || (BASE + (demo ? 'polis-demo.json' : 'polis.json'));
      fetchDoc(url, function (d) {
        if (!d && demo && !el.getAttribute('data-polis-life-src')) { fetchDoc(BASE + 'polis.json', function (d2) { draw(d2); }); return; }
        draw(d);
      });
      function draw(d) {
        var keep = el.getAttribute('data-polis-life-empty') === 'show';
        if (!d || (!hasLife(kind, d) && !keep)) { el.hidden = true; return; }
        el.hidden = false;
        render(el, kind, d);
        if (d.demo) H('p', 'pl-src pl-demo', 'DEMO: made-up example numbers, not real.', el);
        el.classList.add('pl-placed');
      }
    })(els[i]);
  }
  // keep(host, kind, {when, label, before}): for a page that redraws itself (the Zenith home sets innerHTML on live data): the piece
  // is put back as the host's last child (or before opts.before, a selector) after each redraw while when() is true, drawn from the
  // one loaded file; a piece that was wiped stops its timer. Nothing is shown when the file has nothing for it.
  function keep(host, kind, opts) {
    if (!host || !PIECES[kind]) return null;
    opts = opts || {};
    var demo = /[?&]demo=1(&|$)/.test(root.location ? root.location.search : ''), d = null, ready = false, cur = null, busy = false;
    function want() { try { return opts.when ? !!opts.when() : true; } catch (e) { return false; } }
    function ensure() {
      if (busy) return;
      if (cur && cur.parentNode !== host) { if (cur.__plStop) cur.__plStop(); cur = null; }
      var ok = ready && d && hasLife(kind, d) && want();
      if (!ok) { if (cur) { busy = true; if (cur.__plStop) cur.__plStop(); host.removeChild(cur); cur = null; busy = false; } return; }
      if (cur) return;
      busy = true;
      try {
        var el = doc.createElement('section');
        el.className = 'pl-kept pl-kept-' + kind;
        if (opts.label) el.setAttribute('aria-label', opts.label);
        render(el, kind, d);
        if (d.demo) H('p', 'pl-src pl-demo', 'DEMO: made-up example numbers, not real.', el);
        el.classList.add('pl-placed');
        var ref = opts.before ? host.querySelector(opts.before) : null;
        if (ref && ref.parentNode === host) host.insertBefore(el, ref); else host.appendChild(el);
        cur = el;
      } catch (e) { cur = null; }
      busy = false;
    }
    fetchDoc(BASE + (demo ? 'polis-demo.json' : 'polis.json'), function (j) {
      if (!j && demo) { fetchDoc(BASE + 'polis.json', function (j2) { d = j2; ready = true; ensure(); }); return; }
      d = j; ready = true; ensure();
    });
    // the observer runs before the next paint, so a redraw never shows the page without the piece for a frame
    if (root.MutationObserver) new root.MutationObserver(function () { ensure(); }).observe(host, { childList: true });
    return { refresh: ensure };
  }
  function autoPlace() { try { if (doc.querySelector('[data-polis-life]')) place(doc); } catch (e) {} }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoPlace); else autoPlace();

  // ------------------------------------------------------------------------------------------------ the styles (scoped to .pl-*)
  function css() {
    if (doc.getElementById('pl-style')) return;
    var st = doc.createElement('style');
    st.id = 'pl-style';
    st.appendChild(doc.createTextNode([
      '.pl-piece{--pl-serif:var(--ag-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);--pl-sans:var(--ag-sans,-apple-system,system-ui,sans-serif);--pl-num:var(--ag-num,"SF Pro Rounded",-apple-system,sans-serif);',
      'display:block;position:relative;margin:0 0 16px;padding:14px 14px 12px;border-radius:16px;border:1px solid var(--oly-th-n8, #3a3228);background:linear-gradient(180deg,var(--oly-th-n5, #26211b),var(--oly-th-n4, #1d1914));color:var(--oly-th-n37, #f3ece0);box-shadow:0 6px 18px rgba(0,0,0,.35);font-family:var(--pl-sans);overflow:hidden}',
      '.pl-head{margin:0 0 10px}.pl-title{margin:0;font:600 20px/1.2 var(--pl-serif);color:var(--oly-th-n37, #f3ece0);letter-spacing:.01em}.pl-sub{margin:3px 0 0;color:var(--oly-th-n30, #cfc4b2);font-size:13.5px;line-height:1.35}',
      '.pl-meander{display:block;width:100%;height:8px;margin-top:8px}.pl-meander-kit{position:relative;height:14px;overflow:hidden}.pl-meander-kit svg{position:absolute;left:0;top:0}',
      '.pl-laurel{display:inline-block;width:30px;height:30px;line-height:0;flex:0 0 30px;align-self:center}.pl-laurel .polis-laurel{width:30px!important;height:30px!important}.pl-laurel svg{width:100%;height:100%;display:block}',
      '.pl-kicker{margin:0 0 2px;color:var(--oly-th-a8, #c8a24a);font-size:12.5px;font-weight:600;letter-spacing:.02em}.pl-eyebrow{margin:12px 0 4px;color:var(--oly-th-a8, #c8a24a);font-size:12.5px;font-weight:600}',
      '.pl-empty{margin:6px 0;color:var(--oly-th-n30, #cfc4b2);font:italic 15px/1.4 var(--pl-serif)}.pl-src{margin:10px 0 0;color:var(--oly-th-n24, #a89c88);font-size:12px;line-height:1.4}.pl-note{margin:8px 0 0;color:var(--oly-th-n30, #cfc4b2);font-size:13px;line-height:1.4}',
      '.pl-num{font-family:var(--pl-num);font-variant-numeric:tabular-nums}.pl-up{color:var(--oly-th-g8, #a0ac6e)}.pl-down{color:var(--oly-th-r10, #e08a6b)}.pl-even{color:var(--oly-th-n30, #cfc4b2)}',
      '.pl-btn{min-width:44px;min-height:44px;border-radius:12px;border:1px solid var(--oly-th-n8, #3a3228);background:var(--oly-th-n6, #2c261f);color:var(--oly-th-n37, #f3ece0);font:600 22px/1 var(--pl-serif);cursor:pointer;touch-action:manipulation}',
      '.pl-btn:focus-visible,.pl-fest:focus-visible,.pl-jar:focus-visible,.pl-facts summary:focus-visible{outline:2px solid var(--oly-th-a8, #c8a24a);outline-offset:2px}',
      '.pl-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--oly-th-n8, #3a3228);color:var(--oly-th-n30, #cfc4b2)}',
      '.pl-chip-funded,.pl-chip-record{color:var(--oly-th-n3, #14110e);background:linear-gradient(135deg,var(--oly-th-a12, #f1d58a),var(--oly-th-a8, #c8a24a));border-color:var(--oly-th-a4, #8d6c25)}.pl-chip-paper{color:var(--oly-th-n30, #cfc4b2);border-style:dashed}.pl-chip-eval{color:var(--oly-th-n37, #f3ece0);border-color:var(--oly-th-a5, #9c6b3c)}',
      '.pl-tag{display:inline-block;margin:4px 0 0;font-size:12px}.pl-warn{color:var(--oly-th-warn, #e0b060)}',
      /* herald */
      '.pl-herald{background:linear-gradient(100deg,var(--oly-th-n6, #2e2519) 0%,var(--oly-th-n5, #241d16) 60%,var(--oly-th-n4, #1d1914) 100%);border-color:var(--oly-th-a2, #5e4a2c);padding-bottom:8px}',
      '.pl-herald:before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--oly-th-a4, #8d6c25),var(--oly-th-a12, #f1d58a),var(--oly-th-a8, #c8a24a),var(--oly-th-a4, #8d6c25))}',
      '.pl-hb{display:flex;gap:12px;align-items:flex-start}.pl-salpinx{flex:0 0 48px;width:48px;height:48px;margin-top:2px}.pl-hb-text{flex:1 1 auto;min-width:0}',
      '.pl-cry{margin:2px 0 4px;font:italic 500 18px/1.3 var(--pl-serif);color:var(--oly-th-n37, #f3ece0)}.pl-cry.pl-up{color:var(--oly-th-n34, #e9e2c8)}.pl-cry.pl-down{color:var(--oly-th-r14, #f0d2c4)}.pl-plain{margin:0;color:var(--oly-th-n30, #cfc4b2);font-size:13.5px;line-height:1.4}',
      '.pl-hb-text.pl-in{animation:pl-in .42s ease-out both}@keyframes pl-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '.pl-hb-nav{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:6px}.pl-count{color:var(--oly-th-n24, #a89c88);font-size:12.5px;min-width:52px;text-align:center}',
      /* oracle */
      '.pl-oracle{background:radial-gradient(120% 90% at 18% 0%,var(--oly-th-n6, #33291f) 0%,var(--oly-th-n4, #221c16) 55%,var(--oly-th-n4, #1d1914) 100%)}.pl-or-top{display:flex;gap:12px;align-items:center}.pl-tripod{flex:0 0 66px;width:66px;height:80px}',
      '.pl-verse{margin:14px 2px 6px;padding:0 0 0 14px;border-left:2px solid var(--oly-th-a8, #c8a24a);font:italic 18px/1.45 var(--pl-serif);color:var(--oly-th-n37, #f3ece0)}',
      '.pl-verse:first-letter{font-size:1.6em;color:var(--oly-th-a8, #c8a24a);font-style:normal}',
      '.pl-plainlist{margin:0;padding:0 0 0 18px;color:var(--oly-th-n30, #cfc4b2);font-size:14px;line-height:1.45}.pl-plainlist li{margin:2px 0}',
      '.pl-facts{margin-top:10px;border-top:1px solid var(--oly-th-n8, #3a3228)}.pl-facts summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--oly-th-a8, #c8a24a);font-size:13.5px;font-weight:600}',
      '.pl-facts ul{margin:0;padding:0 0 0 18px;color:var(--oly-th-n30, #cfc4b2);font-size:13px;line-height:1.4}.pl-facts .pl-src{display:inline;margin:0}',
      '.pl-move .pl-smoke{animation:pl-smoke 6s ease-in-out infinite alternate}',
      /* festivals */
      '.pl-fest-strip{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:2px 2px 8px;margin:0 -2px}',
      '.pl-fest{flex:0 0 152px;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:44px;padding:12px 10px 12px;border-radius:14px;border:1px solid var(--oly-th-n8, #3a3228);',
      'background:linear-gradient(180deg,var(--oly-th-n6, #2c251d),var(--oly-th-n4, #211b15));color:var(--oly-th-n37, #f3ece0);text-align:center;cursor:pointer;font-family:var(--pl-sans);touch-action:manipulation}',
      '.pl-fest.pl-soon{border-color:var(--oly-th-a8, #c8a24a);box-shadow:inset 0 0 0 1px rgba(var(--oly-th-a8-rgb, 200,162,74),.35)}.pl-glyph{width:64px;height:64px;margin-bottom:4px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.4))}',
      '.pl-fest-name{font:600 17px/1.15 var(--pl-serif);color:var(--oly-th-a12, #f1d58a)}.pl-fest-ev{font-size:12.5px;color:var(--oly-th-n30, #cfc4b2);line-height:1.3;min-height:32px}.pl-fest-date{font-size:12.5px;color:var(--oly-th-n24, #a89c88)}',
      '.pl-fest-cd{margin-top:4px;font-family:var(--pl-num);font-size:13px;color:var(--oly-th-n30, #cfc4b2)}.pl-fest-cd b{font-size:24px;color:var(--oly-th-n37, #f3ece0);font-weight:600;font-variant-numeric:tabular-nums}',
      '.pl-fest-mean{font-size:12.5px;line-height:1.35;color:var(--oly-th-n30, #cfc4b2);margin-top:6px;text-align:left}',
      /* torch */
      '.pl-frieze{display:block;width:100%;height:auto;border-radius:10px;box-shadow:inset 0 0 0 1px var(--oly-th-n6, #3a2116)}',
      '.pl-svgtext{font:600 13px var(--pl-sans);fill:var(--oly-th-n37, #f3ece0)}.pl-svgtext.pl-dark{fill:var(--oly-th-n3, #1c130e)}.pl-svgtext.pl-small{font-size:13px;font-weight:500}.pl-svgtext.pl-num{font:700 13px var(--pl-num)}',
      '.pl-move .pl-flame{transform-box:fill-box;animation:pl-sway 2.6s ease-in-out infinite alternate}.pl-move .pl-flame-lead path{animation:pl-breathe 3.2s ease-in-out infinite alternate;transform-origin:50% 100%;transform-box:fill-box}',
      '@keyframes pl-sway{from{opacity:.92}to{opacity:1}}@keyframes pl-breathe{from{transform:scale(.94,.96)}to{transform:scale(1.04,1.06)}}@keyframes pl-smoke{from{opacity:.55;transform:translateY(1px)}to{opacity:1;transform:translateY(-2px)}}',
      '.pl-lamps{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:6px 4px;margin-top:12px;justify-items:center}.pl-lamp{width:100%;max-width:30px;height:auto}.pl-lamp.pl-out{opacity:.7}',
      /* grove */
      '.pl-grove{background:linear-gradient(180deg,var(--oly-th-n7, #2a2530) 0%,var(--oly-th-n8, #3a2f2d) 30%,var(--oly-th-n11, #5a4232) 52%,var(--oly-th-n6, #2c251d) 72%,var(--oly-th-n4, #1d1914) 100%)}',
      '.pl-grove-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pl-tree-card{margin:0;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(var(--oly-th-n8-rgb, 60,48,58),.55),rgba(var(--oly-th-a4-rgb, 122,86,56),.35) 55%,rgba(var(--oly-th-n4-rgb, 29,25,20),.9) 78%);border:1px solid rgba(var(--oly-th-a15-rgb, 255,240,210),.08)}',
      '.pl-tree{display:block;width:100%;height:auto}.pl-tree-card figcaption{padding:2px 10px 10px}.pl-tree-top{display:flex;justify-content:space-between;align-items:center;gap:6px}',
      '.pl-tree-name{font:600 15px/1.2 var(--pl-serif);color:var(--oly-th-n37, #f3ece0)}.pl-tree-bal{margin:4px 0 0;font-size:13.5px;color:var(--oly-th-n37, #f3ece0)}.pl-tree-line{margin:3px 0 0;font-size:12.5px;color:var(--oly-th-n30, #cfc4b2);line-height:1.35}',
      '.pl-tree-dd{margin:3px 0 0;font-size:12px;color:var(--oly-th-n24, #a89c88);line-height:1.35}.pl-tree-meta{display:flex;gap:6px;align-items:center;margin-top:6px;font-size:12px;color:var(--oly-th-n30, #cfc4b2)}.pl-rings{width:24px;height:24px;flex:0 0 24px}',
      /* amphorae */
      '.pl-amphorae{background:linear-gradient(180deg,var(--oly-th-n5, #2a221a),var(--oly-th-n4, #1d1914) 40%,var(--oly-th-n3, #1a1612))}',
      '.pl-shelf{margin:12px 0 4px}.pl-shelf-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;color:var(--oly-th-n30, #cfc4b2)}.pl-shelf-head b{font:600 15px var(--pl-serif);color:var(--oly-th-n37, #f3ece0)}',
      '.pl-shelf-row{display:flex;align-items:flex-end;gap:4px;padding:8px 4px 0;min-height:104px;background:linear-gradient(180deg,rgba(0,0,0,0) 0,rgba(0,0,0,.18) 100%)}',
      '.pl-plank{height:10px;margin:0 -2px 6px;border-radius:2px;background:linear-gradient(180deg,var(--oly-th-a6, #9a6a40) 0,var(--oly-th-a4, #7a5230) 30%,var(--oly-th-a2, #5a3b22) 70%,var(--oly-th-n6, #3a2716) 100%);box-shadow:0 4px 6px rgba(0,0,0,.45)}',
      '.pl-jar{flex:0 0 50px;width:50px;min-height:44px;padding:0;border:0;background:none;display:flex;flex-direction:column;align-items:center;cursor:pointer;touch-action:manipulation;color:inherit}',
      '.pl-shelf-row .pl-jar{flex:1 1 0;min-width:0;max-width:50px}.pl-amph{display:block;width:46px;max-width:100%;height:76px}.pl-jar-usd{font:600 12px/1.1 var(--pl-num);letter-spacing:-.01em;margin:1px 0 2px;white-space:nowrap}.pl-amph-detail{margin:6px 0 0;min-height:36px;color:var(--oly-th-n37, #f3ece0);font-size:13.5px;line-height:1.4}',
      /* statues */
      '.pl-statues{background:linear-gradient(180deg,var(--oly-th-n6, #2a241d) 0%,var(--oly-th-n4, #1f1a15) 70%,var(--oly-th-n5, #26201a) 100%)}.pl-hall{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.pl-niche{margin:0;display:flex;flex-direction:column;align-items:stretch}.pl-statue{display:block;width:100%;height:auto}',
      '.pl-plaque{margin-top:-4px;padding:6px 6px 8px;border-radius:0 0 10px 10px;background:linear-gradient(180deg,var(--oly-th-n7, #3a2f24),var(--oly-th-n5, #2a2219));border:1px solid var(--oly-th-n9, #4a3a2a);border-top:0;text-align:center;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--oly-th-n30, #cfc4b2)}',
      '.pl-plaque b{font:600 13px/1.2 var(--pl-serif);color:var(--oly-th-n37, #f3ece0)}.pl-plaque-usd{font-size:12.5px;font-weight:600}.pl-record .pl-plaque{border-color:var(--oly-th-a4, #8d6c25)}.pl-plaque .pl-chip{align-self:center;margin-bottom:2px}',
      /* stoic */
      '.pl-stoic{background:linear-gradient(180deg,var(--oly-th-n5, #26211b),var(--oly-th-n4, #1d1914))}',
      '.pl-tablet{margin:0;padding:18px 18px 14px;border-radius:12px;color:#3b342c;background:radial-gradient(140% 120% at 20% 10%,#efe9de 0%,#e2dacd 45%,#cfc6b6 100%);',
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.5),inset 0 -3px 6px rgba(80,60,40,.25),0 6px 18px rgba(0,0,0,.35);position:relative;overflow:hidden}',
      '.pl-tablet:before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(115deg,transparent 30%,rgba(120,108,92,.16) 31%,transparent 33%,transparent 62%,rgba(120,108,92,.12) 63%,transparent 64.5%);pointer-events:none}',
      '.pl-inscr{margin:0;font:500 18px/1.45 var(--pl-serif);font-variant:small-caps;letter-spacing:.04em;color:#3b342c;text-shadow:0 1px 0 rgba(255,255,255,.55),0 -1px 0 rgba(60,45,30,.25)}',
      '.pl-tablet figcaption{margin-top:10px;font:italic 14px/1.35 var(--pl-serif);color:#4a4238}.pl-tr{font-style:normal;font-size:12px;color:#5c5246}',
      /* placed in an app (data-polis-life): one of the page's AGORA v2 cards, same radius, edge, shadow and title size as its neighbours */
      '.pl-placed{margin:0;border-radius:20px;border-color:rgba(var(--oly-th-n37-rgb, 243,236,224),.075);box-shadow:var(--ag-e2,0 6px 18px rgba(0,0,0,.35));padding:16px 16px 14px}',
      '.pl-placed.pl-herald{border-color:rgba(var(--oly-th-a8-rgb, 200,162,74),.32)}.pl-placed .pl-title{font-size:var(--ag-fs-h3,18px)}.pl-placed .pl-head{margin-bottom:12px}',
      '.pl-placed.pl-stoic{padding:12px}.pl-placed .pl-demo{color:var(--oly-th-warn, #e0b060);margin-top:10px}',
      '@media (max-width:360px){.pl-hall{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media (prefers-reduced-motion:reduce){.pl-piece *{animation:none!important;transition:none!important}}',
      'html[data-oly-lite="1"] .pl-piece *{animation:none!important}'
    ].join('\n')));
    (doc.head || doc.documentElement).appendChild(st);
  }

  root.OLYMPUS_POLIS_LIFE = { version: 1, render: render, all: all, load: load, pieces: ORDER.slice(),
    herald: function (el, d, o) { return render(el, 'herald', d, o); }, oracle: function (el, d, o) { return render(el, 'oracle', d, o); },
    festivals: function (el, d, o) { return render(el, 'festivals', d, o); }, torch: function (el, d, o) { return render(el, 'torch', d, o); },
    grove: function (el, d, o) { return render(el, 'grove', d, o); }, amphorae: function (el, d, o) { return render(el, 'amphorae', d, o); },
    statues: function (el, d, o) { return render(el, 'statues', d, o); }, stoic: function (el, d, o) { return render(el, 'stoic', d, o); },
    amphora: amphora, tree: tree, statue: statue, glyph: glyph, money: money, usdR: usdR, place: place, keep: keep, has: hasLife };
})(window);
