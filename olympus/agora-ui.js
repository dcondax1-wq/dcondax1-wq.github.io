/* AGORA v2 behaviour (tools/web_public/olympus/agora-ui.js; docs/DESIGN_AGORA.md "v2"). Classic script, no dependencies, no network, no storage.
 * Load it deferred after the kit: <script src="../olympus/agora-ui.js?v=12" defer></script>. It exposes window.AGORA:
 *   AGORA.icon(name, {cls, label})        one 24 px line icon (SVG element); AGORA.ICONS lists the names. [data-ag-icon="name"] elements get theirs on load.
 *   AGORA.chart(el, opts)                 one shared mini chart: {type: 'line' | 'area' | 'bar' | 'spark', values, labels, fmt, height, label, tone}
 *   AGORA.toast(text, {kind, ms, icon})   a short message above the bottom edge (kind ok | bad | info)
 *   AGORA.sheet({title, body, onClose})   a bottom sheet with a grabber (drag down, Esc or the scrim closes it); returns {el, body, close}
 *   AGORA.state(el, {kind, title, text, action, onAction, icon})  empty / error / loading state into el (kind empty | error | loading)
 *   AGORA.pull(onRefresh)                 pull-to-refresh on a touch screen (onRefresh may return a promise)
 *   AGORA.morph(update)                   run a DOM update as a view transition where the browser has one (list -> detail feel)
 *   AGORA.shell()                         the app shell for pages on the AGORA app base: the back row (opened alone) and the compact bar on scroll
 * Everything is built with createElement / createElementNS and textContent (never markup from data). Reduced motion and the OFF tier are respected. */
(function () {
  'use strict';
  if (window.AGORA && window.AGORA.v) return;
  var d = document, root = d.documentElement, NS = 'http://www.w3.org/2000/svg';
  var framed = (function () { try { return window.top !== window; } catch (e) { return true; } })();
  var meSrc = d.currentScript && d.currentScript.src ? d.currentScript.src : '';   // this file's own address: gate-nav.js sits next to it
  var still = function () {
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) { /* old browser */ }
    return root.getAttribute('data-fx') === 'off';
  };
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function sv(tag, attrs) { var n = d.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); return n; }

  /* ------------------------------------------------------------------------------------------ icons: original, 24 px grid, 1.75 stroke */
  var C = function (cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0'; };
  var ICONS = {
    back: 'M15 5l-7 7 7 7', chevron: 'M9.5 5.5L16 12l-6.5 6.5', down: 'M5.5 9.5L12 16l6.5-6.5', up: 'M5.5 14.5L12 8l6.5 6.5',
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', check: 'M5 12.5l4.5 4.5L19 7.5',
    refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9M19.5 4v5h-5', search: C(11, 11, 6.5) + 'M16 16l4.5 4.5',
    more: C(6, 12, .9) + C(12, 12, .9) + C(18, 12, .9),
    temple: 'M3.5 9.5L12 4.5l8.5 5M5.5 10v8M9.5 10v8M14.5 10v8M18.5 10v8M3.5 20h17M4 9.5h16',
    column: 'M6.5 4.5h11M7.5 7h9M9 7v11M12 7v11M15 7v11M7 18h10M6 20.5h12',
    laurel: 'M9 19.5C5.5 16.5 4.5 11.5 6 6.5M15 19.5c3.5-3 4.5-8 3-13M5.2 12.5l-2.2.6M5.5 9.3l-2-.6M6.6 15.6l-1.7 1.5M18.8 12.5l2.2.6M18.5 9.3l2-.6M17.4 15.6l1.7 1.5',
    chart: 'M4 20h16M7 17v-5M12 17V7M17 17v-8', trendup: 'M4 16l5-5 4 4 7-7M15 8h5v5', trenddown: 'M4 8l5 5 4-4 7 7M15 16h5v-5',
    arrowup: 'M12 19V5M6 11l6-6 6 6', arrowdown: 'M12 5v14M6 13l6 6 6-6',
    wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01',
    coins: C(9, 9, 5) + 'M14.5 8.2a5 5 0 1 1-6.3 6.3',
    calendar: 'M5.5 6h13a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4.5 10.5h15M9 4v4M15 4v4',
    clock: C(12, 12, 8.5) + 'M12 7.5V12l3 2', sun: C(12, 12, 4) + 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
    moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z', shield: 'M12 3.5l7 2.5v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z',
    bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
    book: 'M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5zM19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z',
    news: 'M5 5h11v14H6.5A1.5 1.5 0 0 1 5 17.5zM16 9h3v8.5a1.5 1.5 0 0 1-3 0M8 9h5M8 12h5M8 15h3',
    compass: C(12, 12, 8.5) + 'M15.5 8.5l-2 5-5 2 2-5z',
    star: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8z',
    bell: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0',
    info: C(12, 12, 8.5) + 'M12 11v5M12 8h.01', warn: 'M12 4.5l8.5 15h-17zM12 10v4M12 17h.01',
    ok: C(12, 12, 8.5) + 'M8.5 12.3l2.4 2.4 4.6-5', bad: C(12, 12, 8.5) + 'M9.5 9.5l5 5M14.5 9.5l-5 5',
    user: C(12, 8.5, 3.5) + 'M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5',
    users: C(9, 9, 3) + 'M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15.5 6.2a3 3 0 0 1 0 5.6M17 14.8c1.8.5 3 1.9 3.5 4.2',
    chat: 'M7.5 4.5h9A2.5 2.5 0 0 1 19 7v5.5a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h.5A2.5 2.5 0 0 1 5 12.5V7a2.5 2.5 0 0 1 2.5-2.5z',
    mic: 'M9 6.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM6 11.5a6 6 0 0 0 12 0M12 17.5V21', play: 'M8 5.5v13l10.5-6.5z', pause: 'M8.5 5.5v13M15.5 5.5v13',
    share: 'M12 15V4M8 8l4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12', filter: 'M4 6h16M7 12h10M10 18h4',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' + C(12, 12, 3), lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    flame: 'M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.6-8.4 2.2 1.4 3 3.4 2.8 5.4 1-.6 1.8-1.7 2-3 1.8 1.6 3.6 3.6 3.6 6 0 3.2-2.4 5.6-6 5.6z',
    gear: C(12, 12, 3) + C(12, 12, 6.5) + 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
    amphora: 'M9 3.5h6M10 3.5V6c-3 1.5-4.5 4-4.5 7 0 3.5 2.5 6 4 7.5h5c1.5-1.5 4-4 4-7.5 0-3-1.5-5.5-4.5-7V3.5M7.5 8.5c-2 0-3 1-3 2.5M16.5 8.5c2 0 3 1 3 2.5',
    owl: 'M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3-3 5.5-7 5.5S5 18 5 15zM5 5.5l2.5 2.5M19 5.5L16.5 8M11.2 14l.8 1 .8-1' + C(9.5, 11, 2) + C(14.5, 11, 2),
    wave: 'M3 9c2 0 2-2 4.5-2S10 9 12 9s2-2 4.5-2S19 9 21 9M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2',
    lyre: 'M8 4c-2 3-2 9 1 12M16 4c2 3 2 9-1 12M8 16h8M7.5 20h9M10 8v8M12 8v8M14 8v8M8.5 8h7',
    external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
    dollar: 'M12 3.5v17M16 7.5c-.8-1.3-2.2-2-4-2-2.3 0-4 1.2-4 3.2 0 4.6 8.5 2.4 8.5 6.8 0 2-1.8 3.2-4.3 3.2-2 0-3.6-.8-4.4-2.2',
    target: C(12, 12, 8.5) + C(12, 12, 4.8) + C(12, 12, 1.2), inbox: 'M4 13.5L6.5 5h11l2.5 8.5V19H4zM4 13.5h4.5l1.5 2.5h4l1.5-2.5H20',
    edit: 'M14.5 5.5l4 4L9 19H5v-4z', trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13', download: 'M12 4v11M7.5 11L12 15.5 16.5 11M5 20h14',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    map: 'M9 4.5l-5 2v13l5-2 6 2 5-2v-13l-5 2-6-2zM9 4.5v13M15 6.5v13', pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z' + C(12, 10, 2.3),
    heart: 'M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z',
    sliders: 'M4 7h10M18 7h2M16 5v4M4 17h4M12 17h8M10 15v4', sound: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
    mute: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM16 10l4 4M20 10l-4 4'
  };
  function icon(name, o) {
    o = o || {};
    var s = sv('svg', { viewBox: '0 0 24 24', 'class': 'ag-ic' + (o.cls ? ' ' + o.cls : ''), 'aria-hidden': o.label ? null : 'true', role: o.label ? 'img' : null, 'aria-label': o.label || null, focusable: 'false' });
    s.appendChild(sv('path', { d: ICONS[name] || ICONS.info }));
    return s;
  }
  function hydrateIcons(scope) {
    var list = (scope || d).querySelectorAll('[data-ag-icon]:not([data-ag-icon-done])');
    for (var i = 0; i < list.length; i++) {
      var n = list[i]; n.setAttribute('data-ag-icon-done', '1');
      n.insertBefore(icon(n.getAttribute('data-ag-icon'), { cls: n.getAttribute('data-ag-icon-cls') || '' }), n.firstChild);
    }
  }

  /* ------------------------------------------------------------------------------------------ charts: one style for sparkline / line / area / bar */
  var uid = 0;
  function niceStep(span, n) {
    var raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function short(v) {
    var a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return s + (Math.round(a * 100) / 100);
  }
  var TONES = { gold: ['#c8a24a', '200,162,74'], olive: ['#a0ac6e', '160,172,110'], terra: ['#e08a6b', '224,138,107'], aegean: ['#7fa7c2', '127,167,194'], bronze: ['#b98551', '185,133,81'] };
  function chart(host, o) {
    if (!host) return null;
    o = o || {};
    var vals = (o.values || []).map(Number).filter(function (v) { return isFinite(v); });
    while (host.firstChild) host.removeChild(host.firstChild);
    var type = o.type || 'line', spark = type === 'spark', bars = type === 'bar';
    var fmt = typeof o.fmt === 'function' ? o.fmt : short;
    var W = Math.max(120, Math.round(o.width || host.clientWidth || 320)), H = o.height || (spark ? 40 : 150);
    var tone = TONES[o.tone] || TONES[vals.length > 1 && !bars && vals[vals.length - 1] < vals[0] && o.tone === 'auto' ? 'terra' : 'gold'];
    var svg = sv('svg', { 'class': 'ag-chart', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', preserveAspectRatio: 'none' });
    svg.style.height = H + 'px';
    var aria = o.label || (vals.length ? (vals.length + ' values from ' + fmt(vals[0]) + ' to ' + fmt(vals[vals.length - 1])) : 'No data yet');
    svg.setAttribute('aria-label', aria);
    host.appendChild(svg);
    if (!vals.length) {
      var t0 = sv('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'class': 'ax' }); t0.textContent = 'No data yet'; svg.appendChild(t0);
      return svg;
    }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (bars || o.zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (hi === lo) { hi += Math.abs(hi) * .1 || 1; lo -= Math.abs(lo) * .1 || 1; }
    var ticks = [], step = niceStep(hi - lo, spark ? 1 : (o.ticks || 3));
    if (!spark) { lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; for (var t = lo; t <= hi + step / 2; t += step) ticks.push(t); }
    var labW = 0;
    ticks.forEach(function (t) { labW = Math.max(labW, String(fmt(t)).length * 6.2); });
    var L = spark ? 2 : Math.ceil(labW) + 8, R = spark ? 4 : 10, T = spark ? 4 : 10, B = spark ? 4 : (o.labels && o.labels.length ? 22 : 8);
    var iw = W - L - R, ih = H - T - B;
    var y = function (v) { return T + ih - (v - lo) / (hi - lo) * ih; };
    ticks.forEach(function (t) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: Math.round(y(t)) + .5, y2: Math.round(y(t)) + .5, 'class': t === 0 ? 'zero' : 'grid' }));
      var tx = sv('text', { x: L - 6, y: y(t) + 3.5, 'text-anchor': 'end', 'class': 'ax' }); tx.textContent = fmt(t); svg.appendChild(tx);
    });
    var anim = !still() && o.animate !== false;
    var labels = o.labels || [];
    var xl = function (x, s, anchor) { var tx = sv('text', { x: x, y: H - 6, 'text-anchor': anchor || 'middle', 'class': 'ax' }); tx.textContent = s; svg.appendChild(tx); };
    if (bars) {
      var n = vals.length, slot = iw / n, bw = Math.max(4, Math.min(34, slot * .62));
      var showVal = o.values_on !== false && n <= 8;
      vals.forEach(function (v, i) {
        var x = L + slot * i + (slot - bw) / 2, y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        var r = sv('rect', { x: x, y: y0, width: bw, height: Math.max(1, y1 - y0), rx: Math.min(4, bw / 3), 'class': 'bar' + (v < 0 ? ' neg' : '') + (anim ? ' grow' : '') });
        if (anim) r.style.animationDelay = (i * 40) + 'ms';
        svg.appendChild(r);
        if (showVal) { var tv = sv('text', { x: x + bw / 2, y: v < 0 ? y1 + 12 : y0 - 5, 'text-anchor': 'middle', 'class': 'vlabel' }); tv.textContent = fmt(v); svg.appendChild(tv); }
        if (labels[i] != null && (n <= 8 || i === 0 || i === n - 1 || i === Math.floor(n / 2))) xl(x + bw / 2, labels[i]);
      });
      return svg;
    }
    var n2 = vals.length, X = function (i) { return L + (n2 === 1 ? iw / 2 : iw * i / (n2 - 1)); };
    var dpath = vals.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join('');
    if (type === 'area' || spark) {
      var id = 'agg' + (++uid), defs = sv('defs', {}), g = sv('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.appendChild(sv('stop', { offset: '0', 'stop-color': 'rgb(' + tone[1] + ')', 'stop-opacity': spark ? .22 : .28 }));
      g.appendChild(sv('stop', { offset: '1', 'stop-color': 'rgb(' + tone[1] + ')', 'stop-opacity': 0 }));
      defs.appendChild(g); svg.appendChild(defs);
      var base = y(Math.max(lo, Math.min(hi, 0 < lo ? lo : 0)));
      svg.appendChild(sv('path', { d: dpath + 'L' + X(n2 - 1).toFixed(1) + ' ' + base + 'L' + X(0).toFixed(1) + ' ' + base + 'Z', fill: 'url(#' + id + ')', 'class': 'area' }));
    }
    var line = sv('path', { d: dpath, 'class': 'line' + (anim ? ' draw' : ''), stroke: tone[0], pathLength: anim ? 1000 : null });
    if (anim) line.style.setProperty('--len', '1000');
    svg.appendChild(line);
    svg.appendChild(sv('circle', { cx: X(n2 - 1), cy: y(vals[n2 - 1]), r: spark ? 2.6 : 3.6, 'class': 'dot', fill: tone[0] }));
    if (!spark && labels.length) {
      xl(X(0), labels[0], 'start');
      if (labels.length > 2) xl(X(Math.floor((n2 - 1) / 2)), labels[Math.floor((labels.length - 1) / 2)]);
      xl(X(n2 - 1), labels[labels.length - 1], 'end');
    }
    return svg;
  }

  /* ------------------------------------------------------------------------------------------ toast */
  var toastBox = null;
  function toast(text, o) {
    o = o || {};
    if (!toastBox) { toastBox = el('div', 'ag-toasts'); toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite'); d.body.appendChild(toastBox); }
    var t = el('div', 'ag-toast' + (o.kind ? ' ' + o.kind : ''));
    t.appendChild(icon(o.icon || (o.kind === 'bad' ? 'warn' : o.kind === 'ok' ? 'check' : 'info')));
    t.appendChild(el('span', '', text));
    toastBox.appendChild(t);
    var gone = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    setTimeout(function () { if (still()) return gone(); t.classList.add('out'); setTimeout(gone, 280); }, o.ms || 2600);
    return t;
  }

  /* ------------------------------------------------------------------------------------------ sheet */
  function sheet(o) {
    o = o || {};
    var opener = d.activeElement, scrim = el('div', 'ag-scrim'), s = el('section', 'ag-sheet'), closed = false;
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
    var grab = el('div', 'ag-grab'), head = el('div', 'ag-sheet-head'), h = el('h2', '', o.title || ''), x = el('button', 'ag-iconbtn');
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.appendChild(icon('close'));
    h.id = 'agSheet' + (++uid); s.setAttribute('aria-labelledby', h.id);
    head.appendChild(h); head.appendChild(x);
    var body = el('div', 'ag-sheet-body');
    if (o.body) body.appendChild(o.body);
    s.appendChild(grab); s.appendChild(head); s.appendChild(body);
    d.body.appendChild(scrim); d.body.appendChild(s); root.classList.add('ag-locked');
    function close() {
      if (closed) return; closed = true; root.classList.remove('ag-locked'); d.removeEventListener('keydown', key);
      var done = function () { [scrim, s].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); if (opener && opener.focus) try { opener.focus(); } catch (e) { /* gone */ } if (o.onClose) o.onClose(); };
      if (still()) return done();
      s.classList.add('out'); scrim.classList.add('out'); setTimeout(done, 260);
    }
    function key(e) { if (e.key === 'Escape') close(); }
    d.addEventListener('keydown', key);
    scrim.addEventListener('click', close); x.addEventListener('click', close);
    // drag the grabber / header down to close
    var y0 = null, dy = 0;
    var start = function (e) { y0 = (e.touches ? e.touches[0] : e).clientY; dy = 0; s.style.transition = 'none'; };
    var move = function (e) { if (y0 == null) return; dy = Math.max(0, (e.touches ? e.touches[0] : e).clientY - y0); s.style.transform = 'translateY(' + dy + 'px)'; };
    var end = function () { if (y0 == null) return; y0 = null; s.style.transition = ''; s.style.transform = ''; if (dy > 90) close(); };
    [grab, head].forEach(function (n) { n.addEventListener('touchstart', start, { passive: true }); n.addEventListener('touchmove', move, { passive: true }); n.addEventListener('touchend', end); });
    setTimeout(function () { try { x.focus({ preventScroll: true }); } catch (e) { /* old */ } }, 30);
    return { el: s, body: body, close: close };
  }

  /* ------------------------------------------------------------------------------------------ empty / error / loading */
  function state(host, o) {
    if (!host) return null;
    o = o || {};
    while (host.firstChild) host.removeChild(host.firstChild);
    if (o.kind === 'loading') {
      var w = el('div', ''); w.setAttribute('aria-busy', 'true'); w.setAttribute('aria-label', o.title || 'Loading');
      ['title', 'num', 'line', 'line short'].forEach(function (k) { w.appendChild(el('span', 'ag-skel ' + k)); });
      host.appendChild(w); return w;
    }
    var box = el('div', 'ag-state' + (o.kind === 'error' ? ' bad' : ''));
    var ic = el('div', 'ag-state-ic'); ic.appendChild(icon(o.icon || (o.kind === 'error' ? 'warn' : 'laurel'), { cls: 'l' })); box.appendChild(ic);
    if (o.title) box.appendChild(el('p', 'ag-state-title', o.title));
    if (o.text) box.appendChild(el('p', 'ag-state-text', o.text));
    if (o.action) {
      var b = el('button', 'ag-btn' + (o.kind === 'error' ? '' : ' primary'), o.action); b.type = 'button';
      if (o.onAction) b.addEventListener('click', o.onAction);
      box.appendChild(b);
    }
    host.appendChild(box); return box;
  }

  /* ------------------------------------------------------------------------------------------ pull to refresh (touch screens; the page must be at the top) */
  var pulling = null;
  function pull(onRefresh) {
    if (pulling || !('ontouchstart' in window) || typeof onRefresh !== 'function') return false;
    var ind = el('div', 'ag-ptr'); ind.setAttribute('aria-hidden', 'true'); ind.appendChild(icon('refresh')); d.body.appendChild(ind);
    var y0 = null, dy = 0, busy = false, MAX = 96, GO = 70;
    var set = function (p, op) { ind.style.transform = 'translateY(' + (p - 56) + 'px)'; ind.style.opacity = op; ind.firstChild.style.transform = 'rotate(' + Math.round(p * 3) + 'deg)'; };
    d.addEventListener('touchstart', function (e) { if (busy || (window.scrollY || d.documentElement.scrollTop) > 0 || root.classList.contains('ag-locked')) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; ind.style.transition = 'none'; }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (y0 == null) return; dy = e.touches[0].clientY - y0;
      if (dy <= 0) { set(0, 0); return; }
      var p = Math.min(MAX, dy * .5); set(p, Math.min(1, p / GO));
    }, { passive: true });
    d.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null; ind.style.transition = 'transform .26s cubic-bezier(.2,.8,.2,1), opacity .26s';
      if (dy * .5 < GO) { set(0, 0); return; }
      busy = true; ind.classList.add('go'); set(GO, 1);
      var fin = function () { busy = false; ind.classList.remove('go'); set(0, 0); };
      var r; try { r = onRefresh(); } catch (e) { r = null; }
      if (r && typeof r.then === 'function') r.then(fin, fin); else setTimeout(fin, 700);
    });
    pulling = ind; return true;
  }

  /* ------------------------------------------------------------------------------------------ view transitions: list -> detail */
  function morph(update) {
    if (typeof update !== 'function') return;
    if (!still() && d.startViewTransition) { try { d.startViewTransition(update); return; } catch (e) { /* fall through */ } }
    update();
  }

  /* ------------------------------------------------------------------------------------------ the app shell */
  var shelled = false;
  function shell() {
    if (shelled || root.hasAttribute('data-ag-noshell')) return;
    var head = d.querySelector('main#app > header.top');   // the AGORA app base: its title is h1.ag-title (other layouts keep their own header)
    if (!head || !head.querySelector('h1.ag-title')) return;
    shelled = true;
    var h1 = head.querySelector('h1'), name = h1 ? h1.textContent.trim() : (d.title || '');
    var back = function () {
      var a = el('a', 'ag-navback'); a.href = '../jarvis/'; a.setAttribute('aria-label', 'Back to Olympus');
      a.appendChild(icon('back')); a.appendChild(el('span', '', 'Olympus')); return a;
    };
    if (!framed) { head.insertBefore(back(), head.firstChild); head.classList.add('ag-hasnav'); }
    // the compact bar: the title (and the way back) once the large title has scrolled away
    var bar = el('div', 'ag-appbar'); bar.setAttribute('aria-hidden', 'true');
    var startSlot = el('div', ''); if (!framed) { var b2 = back(); b2.tabIndex = -1; startSlot.appendChild(b2); }
    bar.appendChild(startSlot); bar.appendChild(el('div', 'ag-appbar-title', name));
    var endSlot = el('div', 'ag-appbar-end'), demo = head.querySelector('.tag.demo');
    if (demo) { var dc = el('span', 'ag-badge demo', ''); dc.setAttribute('data-ag-mirror', '1'); endSlot.appendChild(dc); }
    bar.appendChild(endSlot);
    d.body.appendChild(bar);
    var sync = function () { if (demo) { endSlot.firstChild.textContent = (demo.textContent || 'Demo').trim(); endSlot.firstChild.hidden = demo.hidden; } };
    var show = function (on) { bar.classList.toggle('on', on); bar.setAttribute('aria-hidden', on ? 'false' : 'true'); if (on) sync(); };
    var target = h1 || head;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { var e = es[es.length - 1]; show(!e.isIntersecting && e.boundingClientRect.top < 0); }, { threshold: 0 }).observe(target);
    } else {
      window.addEventListener('scroll', function () { show(target.getBoundingClientRect().bottom < 0); }, { passive: true });
    }
  }

  window.AGORA = { v: 2, icon: icon, ICONS: Object.keys(ICONS), hydrate: hydrateIcons, chart: chart, toast: toast, sheet: sheet, state: state, pull: pull, morph: morph, shell: shell };
  /* the breadcrumbs (Home > Hub > app) and "Go to" on every AGORA app (2026-11-14, docs/OLYMPUS_IA_V2.md): olympus/gate-nav.js, unless the page
     already has its own tag or runs inside Jarvis's frame. A failed load leaves the shell's own back link. */
  function gateNav() {
    if (framed || window.OLYMPUS_GATE_NAV || !meSrc || root.hasAttribute('data-ag-nonav') || d.querySelector('script[src*="gate-nav.js"]')) return;
    var s = el('script', ''); s.src = new URL('gate-nav.js?v=g14', meSrc).href; s.async = true; (d.head || d.documentElement).appendChild(s);
  }
  var boot = function () { try { shell(); } catch (e) { /* the page works without the shell */ } try { hydrateIcons(d); } catch (e) { /* plain labels stay */ } try { gateNav(); } catch (e) { /* the shell's back link stays */ } };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
