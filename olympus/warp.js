/* OLYMPUS warp (olympus/warp.js + olympus/warp.css, 2026-11-19, night-warp; docs/OLYMPUS_MAP.md "Where the organizing code lives").
 * Owner: "crazy effects world to world." Every jump from one app (a world) to another is a hyperspace jump instead of a plain load.
 *   leave    the screen launches from the point you tapped: a shockwave, the page sinks into the dark, light streaks rush past in the
 *            destination world's colours (motion blur: every frame keeps a fading trail of the last), the world's own flourish
 *            (ZEUS lightning, Money gold coins, Kalshi hex rings, the cities' rising towers, the Lab's sonar, HOME: the streaks fall
 *            INWARD into a gold orb), then a white-hot flash. The page is fetched at the tap and opened at T.nav (250 ms), behind it.
 *   arrive   warp.css (render-blocking: agora.css, jarvis.css and zenith_agora.css @import it): a cross-document View Transition
 *            (Safari 18.2+, Chrome 126+): the frozen flash flies past and the new world comes out of the tunnel with its arrival
 *            signature (shape + colour). Older browsers: the same glow over the new page (WARP BOOT below, run by themes.js in
 *            <head>, sets it before the first frame from the hand-off), or nothing (a plain load: the flash, then the page).
 *   worlds   FAM below (home / zeus / money / kalshi / city / lab): an app's family is its door (DOOR = olympus/doors.js ids,
 *            tests.test_warp keeps the copy equal), the cities and the home pages first. Back / forward = "returning" (home motion).
 *   tiers    full; LITE (3D effects Low, OLYMPUS.lite()) = half the streaks, 1x pixels, no flourish; reduced motion or 3D Off = a
 *            150 ms fade out and a 200 ms fade in, nothing moves; localStorage 'oly.warp' = 'off' (no effect) | 'fade' | 'on'.
 *   never    blocks: any error navigates at once; a timer navigates even without a frame; a tap or a key jumps at once; same-page
 *            links, new tabs, downloads, other sites, files that are not pages, modified clicks and clicks another handler took
 *            are left alone. Automation (navigator.webdriver) plays it only with 'oly.warp' = 'on' or ?warp=1 (other suites keep
 *            their plain loads). One canvas 2D (devicePixelRatio capped at 2), made at the tap, released after; no WebGL.
 *   API      window.OLYMPUS_WARP = { go(url, opts), play(to, { at, x, y }) (no navigation: tests, screenshots, Jarvis), skip(),
 *            world(url), tier(), enabled(), state() }; OLYMPUS.go(url) when the kit has none (olympus/people.js calls it).
 *            window.__olyWarp = { runs, mode, from, to, fam, t0, navAt, frames, ms, skipped, err, arrive }   ES5 (Safari 16). */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var W = window, d = document, root = d.documentElement;
  if (W.OLYMPUS_WARP || !d.addEventListener) return;
  var ME = d.currentScript || d.querySelector('script[src*="warp.js"]'), SRC = (ME && ME.src) || '';
  var BASE = (function () { try { return new URL('../', SRC || location.href).href; } catch (e) { return location.href; } })();
  var KEY = 'oly.warp', HAND = 'oly.warp.in', STYLE_ID = 'oly-warp-style', MAX_DPR = 2, TAU = Math.PI * 2;
  var T = { nav: 250, jump: 280, fade: 150, hop: 150, wait: 700, dismiss: 2500, give: 7000 };

  /* WARP BOOT >>> (the arrival hand-off, read in <head> before the first frame; olympus/themes.js carries this exact copy) */
  function olyWarpBoot(W, d) { try {
    var r = d.documentElement, s = W.sessionStorage, p = location.pathname.replace(/index\.html?$/, ''), h;
    if (W.__olyWarpIn !== undefined || d.body) return;
    W.__olyWarpIn = null; h = JSON.parse(s.getItem('oly.warp.in') || 'null');
    if (!h || h.to !== p || !(Date.now() - h.t < 6000)) return;
    s.removeItem('oly.warp.in'); W.__olyWarpIn = h;
    r.setAttribute('data-oly-warp', h.f || 'lab'); if (h.hop) r.setAttribute('data-oly-warp-hop', ''); if (h.back) r.setAttribute('data-oly-warp-back', '');
    if (h.a) r.style.setProperty('--ow-a', h.a); if (h.b) r.style.setProperty('--ow-b', h.b); if (h.k) r.style.setProperty('--ow-k', h.k);
    var on = function (c, ms) { r.classList.add(c); setTimeout(function () { r.classList.remove(c); }, ms); };
    if (!('onpagereveal' in W)) { on('oly-warp-in', 1400); return; }
    W.addEventListener('pagereveal', function (e) {
      var v = e.viewTransition; W.__olyWarpVT = v || null;
      if (!v) { on('oly-warp-in', 1400); return; }
      try { if (v.types && v.types.add) v.types.add('oly-warp'); } catch (x) { /* the static type */ }
      var off = function () { r.classList.remove('oly-warp-vt'); }; r.classList.add('oly-warp-vt');
      v.finished.then(off, off); v.ready.then(null, off); setTimeout(off, 3000);
    }, { once: true });
  } catch (e) { /* a plain arrival */ } }
  /* <<< WARP BOOT */
  olyWarpBoot(W, d);                                             // a page that loads this file in <head> needs nothing else

  // ------------------------------------------------------------------------------------------------ the worlds
  var FAM = {
    home:   { a: '#f6d78b', b: '#fff4d8', k: '#120c05', label: 'Home' },
    zeus:   { a: '#ffcf5c', b: '#9ad8ff', k: '#04070e', label: 'ZEUS Trading' },
    money:  { a: '#f2c65a', b: '#bfd66e', k: '#080a03', label: 'Money' },
    kalshi: { a: '#ffb347', b: '#bb96ff', k: '#0c0715', label: 'Kalshi' },
    city:   { a: '#ffd57e', b: '#62d2e8', k: '#02080d', label: 'The cities' },
    lab:    { a: '#e9d3a3', b: '#86b9dc', k: '#060910', label: 'More' }
  };
  var DOOR = {        // olympus/doors.js DOORS[].ids (tests.test_warp keeps this copy equal to it)
    zeus: 'zenith nq board why trading aegis pnyx demeter labyrinth fates moirai odeon nemesis kronos apollo journal kratos epilogue ares argus oracle pantheon pythia pheme kairos chronos forum delphi',
    money: 'business ledger hera plutus chrysos oikos agency mercury mint mintcity harmonia hermes argo arbiter',
    kalshi: 'kalshi dionysus kalshicity sibyl tyche',
    more: 'compass helios herald stoa hestia inbox planner mind arena athena lyceum nike gallery polis symposium ergasterion settings bridge atlas cities datacity observatory tree prometheus hephaestus clio archive pinakes colosseum'
  };
  var FIRST = { jarvis: 'home', gate: 'home', cities: 'city', polis: 'city', datacity: 'city', mintcity: 'city', kalshicity: 'city', atlascity: 'city', world: 'city' };
  var OF = {}, k, ids, i;
  for (k in DOOR) { ids = DOOR[k].split(' '); for (i = 0; i < ids.length; i++) OF[ids[i]] = k === 'more' ? 'lab' : k; }
  function famOf(id) { return FIRST[id] || OF[id] || (/city|world/.test(id) ? 'city' : 'lab'); }
  function norm(p) { return String(p || '').replace(/index\.html?$/, ''); }
  // url -> { id, fam, url, path } (null: another site, outside this site, or a file that is not a page)
  function world(href) {
    var u, b;
    try { u = new URL(href, location.href); b = new URL(BASE); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol) || u.origin !== b.origin || u.pathname.indexOf(b.pathname) !== 0) return null;
    var r = u.pathname.slice(b.pathname.length), cut = r.indexOf('/'), id = cut < 0 ? 'zenith' : r.slice(0, cut), file = cut < 0 ? r : r.slice(cut + 1);
    if (/\.[a-z0-9]+$/i.test(file) && !/\.html?$/i.test(file)) return null;
    var fam = famOf(id), h = (/[?&]h=([a-z]+)/.exec(u.search) || [])[1] || '', door = u.hash.replace('#', '');
    if (id === 'hub') fam = file === 'zeus.html' || h === 'zeus' ? 'zeus' : h === 'money' || h === 'kalshi' ? h : file === 'doors.html' && /^(zeus|money|kalshi)$/.test(door) ? door : 'lab';
    if (id === 'business' && /^accounts\.html/.test(file)) fam = 'zeus';     // "My accounts": the MFFU account center is ZEUS's first door
    return { id: id, fam: fam, url: u.href, path: norm(u.pathname), search: u.search };
  }
  var HERE = world(location.href) || { id: '', fam: 'lab', path: norm(location.pathname), search: location.search };
  // pages that do not opt in to the arrival before their first frame (no agora / jarvis / kalshi / zenith sheet): the browser's
  // transition is skipped as we leave (Chrome would abort it on arrival and report an error there); the jump out still plays
  function optsIn(dest) { return !!dest && !/^(atlas|atlascity|bridge|pc|fx)$/.test(dest.id) && !/\/datacity\/(jarvis\/|map\.html)|-lab\.html$|core-demo\.html$/.test(dest.path); }

  // ------------------------------------------------------------------------------------------------ settings, tiers
  function get(n) { try { return W.localStorage.getItem(n); } catch (e) { return null; } }
  function mq(q) { try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } }
  function jfx() { var v = get('jfx'); try { v = JSON.parse(v); } catch (e) { /* the raw text */ } return String(v || ''); }
  function enabled() {
    var p = get(KEY);
    if (p === 'off') return false;
    return !(navigator.webdriver === true) || p === 'on' || p === 'fade' || /[?&]warp=1\b/.test(location.search);
  }
  function tier() {
    var O = W.OLYMPUS, Z = W.ZenithFX, p = get(KEY);
    try {
      if (p === 'fade' || mq('(prefers-reduced-motion: reduce)') || jfx() === 'off') return 'fade';
      if (O && O.reduced && O.reduced()) return 'fade';
      if (Z && Z.still && Z.still()) return 'fade';
      if (jfx() === 'low' || (O && O.lite && O.lite()) || (Z && Z.lite && Z.lite())) return 'lite';
    } catch (e) { /* full */ }
    return 'full';
  }

  // ------------------------------------------------------------------------------------------------ state (the tests)
  var st = W.__olyWarp = { runs: 0, mode: 'none', from: HERE.id, to: '', fam: '', t0: 0, navAt: 0, frames: 0, ms: 0, skipped: false, err: '', arrive: null, held: false };
  var run = null, bypass = false, raf = 0;
  function now() { return W.performance && performance.now ? performance.now() : Date.now(); }
  function noop() { /* */ }
  function guard(v) { try { v.ready.then(noop, noop); v.finished.then(noop, noop); v.updateCallbackDone.then(noop, noop); } catch (e) { /* old */ } }

  // ------------------------------------------------------------------------------------------------ colours
  function rgb(hex) { var h = String(hex || '#ffffff').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); var n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function hexOk(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim() : ''; }
  // the destination app's own colour: the launcher tile's --c, else olympus/apps-list.js when it is loaded
  function appColour(id, el) {
    try { if (el) { var c = hexOk(getComputedStyle(el).getPropertyValue('--c')); if (c) return c; } } catch (e) { /* */ }
    var L = W.OLYMPUS_APPS_LIST;
    if (L && L.length) for (var j = 0; j < L.length; j++) if (L[j].id === id) return hexOk(L[j].colour);
    return '';
  }
  function nameOf(dest) {
    var L = W.OLYMPUS_APPS_LIST, n = '';
    if (dest.id === 'jarvis') return 'Jarvis';
    if (dest.id === 'hub' || dest.id === 'gate') return FAM[dest.fam] ? FAM[dest.fam].label : 'Olympus';
    if (L && L.length) for (var j = 0; j < L.length; j++) if (L[j].id === dest.id) n = L[j].name;
    return n || (dest.id.charAt(0).toUpperCase() + dest.id.slice(1));
  }

  // ------------------------------------------------------------------------------------------------ the hand-off to the next page
  function hand(dest, o) {
    var F = FAM[dest.fam] || FAM.lab, h = { t: Date.now(), to: dest.path, f: dest.fam, a: F.a, b: F.b, k: F.k, id: dest.id, from: HERE.id };
    if (dest.id === HERE.id && dest.fam === HERE.fam) h.hop = 1;               // another page of the same world: a short hop
    if (o && o.back) h.back = 1;
    try { W.sessionStorage.setItem(HAND, JSON.stringify(h)); } catch (e) { /* private mode: the static arrival */ }
    return h;
  }

  // ------------------------------------------------------------------------------------------------ the overlay (built at the tap)
  var CSS = [
    '@view-transition{navigation:auto;types:oly-warp}',
    '.oly-warping .ag-appbar{view-transition-name:none!important}',
    '.oly-warp{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483600;overflow:hidden;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}',
    '.oly-warp>*{position:absolute;pointer-events:none}',
    '.oly-warp .ow-veil{left:0;top:0;width:100%;height:100%;opacity:0;animation:ow-veil var(--ow-t1,240ms) cubic-bezier(.35,0,.65,1) forwards}',
    '.oly-warp .ow-cv{left:0;top:0;width:100%;height:100%}',
    '.oly-warp .ow-flash{left:50%;top:50%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;border-radius:50%;opacity:0;transform:scale(.05);',
    'animation:ow-flash var(--ow-t2,170ms) cubic-bezier(.5,0,.2,1) var(--ow-d2,110ms) forwards;will-change:transform,opacity}',
    '.oly-warp .ow-name{left:0;right:0;top:50%;margin-top:-40px;text-align:center;opacity:0;transition:opacity .35s ease;font:700 13px/1.2 -apple-system,"SF Pro Text",system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase}',
    '.oly-warp .ow-name b{display:block;margin-top:8px;font:700 42px/1.05 var(--oly-th-display,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.06em;text-transform:none}',
    '.oly-warp.wait .ow-name{opacity:1}.oly-warp.wait .ow-flash{animation:ow-breathe 1.6s ease-in-out infinite alternate}',
    '.oly-warp.cut .ow-veil,.oly-warp.cut .ow-flash{animation:none;opacity:1;transform:none}',
    '.oly-warp.fade .ow-veil{animation-duration:var(--ow-t1,150ms);animation-timing-function:linear}',
    '.oly-warp.frozen *{animation-play-state:paused!important}',
    '@keyframes ow-veil{from{opacity:0}to{opacity:1}}',
    // a flash, not a white screen (phone QA 2026-11-19: the old one held the whole phone at ~85% white while the next page loaded, a
    // blinding white flash at 5 AM): it peaks, then settles to a glow; the wait (a slow page) breathes at half of that
    '@keyframes ow-flash{0%{opacity:0;transform:scale(.05)}45%{opacity:.9}100%{opacity:.62;transform:scale(1)}}',
    '@keyframes ow-breathe{from{opacity:.55;transform:scale(1)}to{opacity:.4;transform:scale(1.06)}}'
  ].join('');
  function style() {
    if (d.getElementById(STYLE_ID)) return;
    var s = d.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; (d.head || root).appendChild(s);
  }
  try { style(); } catch (e) { /* the page leaves plainly */ }   // the outbound View Transition opt-in from the start

  function overlay(dest, o, fade) {
    var F = FAM[dest.fam] || FAM.lab, c = o.c || F.a, el = d.createElement('div'), veil = d.createElement('div'), fl = d.createElement('div'), nm = d.createElement('div');
    el.className = 'oly-warp' + (fade ? ' fade' : ''); el.setAttribute('aria-hidden', 'true'); el.setAttribute('data-fam', dest.fam); el.setAttribute('data-to', dest.id);
    veil.className = 'ow-veil'; fl.className = 'ow-flash'; nm.className = 'ow-name';
    var x = (o.x / Math.max(1, W.innerWidth) * 100).toFixed(1) + '%', y = (o.y / Math.max(1, W.innerHeight) * 100).toFixed(1) + '%';
    veil.style.background = fade ? F.k : 'radial-gradient(circle at ' + x + ' ' + y + ',' + rgba(F.k, 0.5) + ' 0,' + rgba(F.k, 0.9) + ' 38%,' + F.k + ' 75%)';
    fl.style.background = 'radial-gradient(circle at 50% 50%,#fff 0,' + rgba(c, 0.95) + ' 4%,' + rgba(c, 0.75) + ' 13%,' + rgba(F.b, 0.45) + ' 28%,' + rgba(F.a, 0.2) + ' 44%,' + rgba(F.k, 0) + ' 60%)';
    nm.style.color = rgba(F.k, 0.82); nm.textContent = 'Olympus · ' + F.label;
    var b = d.createElement('b'); b.textContent = nameOf(dest); nm.appendChild(b);
    if (fade) { el.style.setProperty('--ow-t1', T.fade + 'ms'); el.appendChild(veil); }
    else {
      el.style.setProperty('--ow-t1', Math.round(T.jump * 0.82) + 'ms'); el.style.setProperty('--ow-d2', Math.round(T.jump * 0.38) + 'ms'); el.style.setProperty('--ow-t2', Math.round(T.jump * 0.62) + 'ms');
      var cv = d.createElement('canvas'); cv.className = 'ow-cv';
      el.appendChild(veil); el.appendChild(fl); el.appendChild(cv); el.appendChild(nm);
      o.cv = cv;
    }
    (d.body || root).appendChild(el);
    return el;
  }

  // ------------------------------------------------------------------------------------------------ the jump (canvas 2D)
  function prng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul ? Math.imul(a ^ (a >>> 15), 1 | a) : (a ^ (a >>> 15)) * (1 | a); t = (t + (Math.imul ? Math.imul(t ^ (t >>> 7), 61 | t) : (t ^ (t >>> 7)) * (61 | t))) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOut(p) { return 1 - Math.pow(1 - clamp(p), 3); }
  function easeInOut(p) { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function scene(dest, o, lite) {
    var F = FAM[dest.fam] || FAM.lab, c = o.c || F.a, rnd = prng(o.seed || 7), n = lite ? 64 : 136, s = { stars: [], extra: [], bolts: [], boltAt: -1, F: F, c: c, rnd: rnd, fam: dest.fam, lite: lite };
    var inward = dest.fam === 'home' || o.back;
    s.inward = inward;
    for (var j = 0; j < n; j++) s.stars.push({ a: rnd() * TAU, z: inward ? 0.04 + rnd() * 0.96 : 0.12 + rnd() * 0.88, s: 0.55 + rnd() * 0.9, w: 0.5 + rnd() * 1.7, k: rnd() });
    if (!lite) {
      if (dest.fam === 'money') for (j = 0; j < 30; j++) s.extra.push({ a: rnd() * TAU, z: 0.25 + rnd() * 0.75, s: 0.7 + rnd() * 0.6, spin: 6 + rnd() * 14, ph: rnd() * TAU, r: 3 + rnd() * 4 });
      if (dest.fam === 'city') for (j = 0; j < 26; j++) s.extra.push({ x: rnd(), h: 0.18 + rnd() * 0.55, w: 4 + rnd() * 16, d: rnd() * 0.35, lit: rnd() });
    }
    return s;
  }
  function boltPath(s, x0, y0, x1, y1, spread) {
    var pts = [[x0, y0], [x1, y1]], lvl, j, out, a, b, dx, dy, len, off;
    for (lvl = 0; lvl < 4; lvl++) {
      out = [pts[0]];
      for (j = 0; j < pts.length - 1; j++) {
        a = pts[j]; b = pts[j + 1]; dx = b[0] - a[0]; dy = b[1] - a[1]; len = Math.sqrt(dx * dx + dy * dy) || 1;
        off = (s.rnd() - 0.5) * spread * len;
        out.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off]); out.push(b);
      }
      pts = out; spread *= 0.62;
    }
    return pts;
  }
  function line(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]); g.stroke(); }
  function hexagon(g, x, y, r, rot) { g.beginPath(); for (var j = 0; j <= 6; j++) { var a = rot + j * TAU / 6; if (j) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.stroke(); }
  // one frame at time t (ms) after the tap, dt (ms) since the last
  function draw(g, s, t, dt, w, h, dpr, o) {
    var F = s.F, p = clamp(t / T.jump), diag = Math.sqrt(w * w + h * h), j, q, x, y, r0, r1, z, a;
    var tx = o.x * dpr, ty = o.y * dpr, e = easeInOut(Math.min(1, p * 1.25)), vx = tx + (w / 2 - tx) * e, vy = ty + (h / 2 - ty) * e;
    // motion blur: the last frame fades instead of vanishing (a trail behind every streak)
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,' + (s.lite ? 0.55 : 0.4) + ')'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    // the shockwave from the tap
    q = clamp(t / 210);
    if (q < 1) { g.strokeStyle = rgba(F.b, 0.9 * (1 - q)); g.lineWidth = (6 - 5 * q) * dpr; g.beginPath(); g.arc(tx, ty, 0.45 * diag * easeOut(q) + 1, 0, TAU); g.stroke(); }
    // the streaks: stars on a tunnel, F / z on screen; the jump accelerates and the streaks stretch with the speed
    var cruise = t > T.jump, v = (cruise ? 1.6 : 0.3 + 5.2 * p * p) * dt / 1000, Fz = 0.035 * diag, env = Math.min(1, t / 70) * (cruise ? 0.55 : 1);
    for (j = 0; j < s.stars.length; j++) {
      var S = s.stars[j], col = S.k < 0.42 ? s.c : S.k < 0.8 ? F.b : '#ffffff', wk = S.k < 0.8 ? 1 : 0.6;   // the white ones dimmer: no white-out
      if (s.inward) { S.z += v * S.s; if (S.z > 1) { S.z = 0.035 + s.rnd() * 0.08; S.a = s.rnd() * TAU; } }
      else { S.z -= v * S.s; if (S.z < 0.03) { S.z = 0.92 + s.rnd() * 0.08; S.a = s.rnd() * TAU; } }
      z = S.z; var len = (0.02 + v * S.s * (2.5 + 9 * p));
      r1 = Fz / z; r0 = s.inward ? Fz / Math.max(0.02, z - len) : Fz / (z + len);
      if (Math.min(r0, r1) > diag) continue;
      x = Math.cos(S.a); y = Math.sin(S.a);
      g.strokeStyle = rgba(col, clamp((0.25 + 1.1 * (1 - z)) * env) * wk);
      g.lineWidth = S.w * (0.6 + 2.6 * (1 - z)) * dpr * (s.lite ? 0.8 : 1);
      g.beginPath(); g.moveTo(vx + x * r0, vy + y * r0); g.lineTo(vx + x * r1, vy + y * r1); g.stroke();
    }
    if (s.lite) return;
    // the world's own flourish
    if (s.fam === 'zeus' && t > 25 && t < T.jump + 60) {
      if (t - s.boltAt > 42) {                                   // new lightning every ~40 ms, from the edges to the centre of the jump
        s.boltAt = t; s.bolts = [];
        for (j = 0; j < 3; j++) {
          a = s.rnd() * TAU; var ex = w / 2 + Math.cos(a) * diag * 0.6, ey = h / 2 + Math.sin(a) * diag * 0.6;
          s.bolts.push(boltPath(s, ex, ey, vx + (s.rnd() - 0.5) * 30 * dpr, vy + (s.rnd() - 0.5) * 30 * dpr, 0.34));
        }
      }
      var fresh = clamp(1 - (t - s.boltAt) / 42);
      for (j = 0; j < s.bolts.length; j++) {
        g.strokeStyle = rgba(F.b, 0.22 + 0.25 * fresh); g.lineWidth = 11 * dpr; line(g, s.bolts[j]);
        g.strokeStyle = rgba('#ffffff', 0.55 + 0.45 * fresh); g.lineWidth = 2.2 * dpr; line(g, s.bolts[j]);
      }
    } else if (s.fam === 'money') {
      for (j = 0; j < s.extra.length; j++) {
        var C = s.extra[j]; C.z -= v * C.s * 0.8; if (C.z < 0.05) C.z = 0.9 + s.rnd() * 0.1;
        r1 = Fz * 1.4 / C.z; if (r1 > diag) continue;
        x = vx + Math.cos(C.a) * r1; y = vy + Math.sin(C.a) * r1; q = (C.r + 9 * (1 - C.z)) * dpr; var sq = Math.abs(Math.cos(C.ph + C.spin * t / 1000));
        g.fillStyle = rgba(s.c, 0.85 * env); g.beginPath(); g.ellipse(x, y, Math.max(0.6, q * sq), q, C.a, 0, TAU); g.fill();
        g.fillStyle = rgba('#fff7d6', 0.7 * env * sq); g.beginPath(); g.ellipse(x, y, Math.max(0.4, q * sq * 0.45), q * 0.45, C.a, 0, TAU); g.fill();
      }
    } else if (s.fam === 'kalshi') {
      for (j = 0; j < 4; j++) {
        q = (p * 1.35 + j * 0.24) % 1.2; if (q > 1) continue;
        g.strokeStyle = rgba(j % 2 ? F.b : s.c, 0.75 * (1 - q) * env); g.lineWidth = (2 + 6 * (1 - q)) * dpr;
        hexagon(g, vx, vy, q * q * diag * 0.75 + 4 * dpr, t / 900 * (j % 2 ? -1 : 1) + j);
      }
    } else if (s.fam === 'city') {
      for (j = 0; j < s.extra.length; j++) {
        var B = s.extra[j], u = easeOut((p - B.d) / 0.6), top = h - B.h * h * u, bx = B.x * w;
        if (u <= 0) continue;
        var gr = g.createLinearGradient(0, h, 0, top); gr.addColorStop(0, rgba(B.lit < 0.5 ? s.c : F.b, 0.55 * env)); gr.addColorStop(1, rgba(F.b, 0));
        g.fillStyle = gr; g.fillRect(bx - B.w * dpr / 2, top, B.w * dpr, h - top);
      }
    } else if (s.fam === 'lab') {
      for (j = 0; j < 4; j++) {
        q = (p * 1.4 + j * 0.27) % 1.25; if (q > 1) continue;
        g.strokeStyle = rgba(j % 2 ? F.b : s.c, 0.7 * (1 - q) * env); g.lineWidth = (1.5 + 3 * (1 - q)) * dpr;
        g.beginPath(); g.arc(vx, vy, q * diag * 0.7 + 2 * dpr, 0, TAU); g.stroke();
      }
      a = t / 1000 * 7;                                          // the sweep of a radar
      for (j = 0; j < 7; j++) { g.strokeStyle = rgba(F.b, (0.5 - j * 0.07) * env); g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(vx, vy); g.lineTo(vx + Math.cos(a - j * 0.05) * diag, vy + Math.sin(a - j * 0.05) * diag); g.stroke(); }
    } else if (s.fam === 'home') {                               // returning: the light falls into Jarvis's gold orb
      r1 = (0.03 + 0.16 * easeOut(p)) * diag;
      // drawn every frame over a fading trail ('lighter'): low alphas, or the orb piles up into a white disc (phone QA 2026-11-19)
      var orb = g.createRadialGradient(vx, vy, 0, vx, vy, r1); orb.addColorStop(0, rgba('#ffffff', 0.42 * env)); orb.addColorStop(0.22, rgba(s.c, 0.3 * env)); orb.addColorStop(0.5, rgba(s.c, 0.16 * env)); orb.addColorStop(1, rgba(s.c, 0));
      g.fillStyle = orb; g.beginPath(); g.arc(vx, vy, r1, 0, TAU); g.fill();
      g.strokeStyle = rgba(F.b, 0.8 * env); g.lineWidth = 2 * dpr; g.beginPath(); g.arc(vx, vy, r1 * 0.72, 0, TAU); g.stroke();
    }
  }

  // ------------------------------------------------------------------------------------------------ one trip
  function go(r) {
    if (!r || r.navd) return;
    r.navd = true; st.navAt = Math.round(now() - r.t0); bypass = true;
    if (!r.nav) return;
    try { if (r.replace) location.replace(r.dest.url); else location.assign(r.dest.url); }
    catch (e) { st.err = String(e && e.message || e); try { location.href = r.dest.url; } catch (x) { /* nothing more to do */ } }
  }
  function stop(r, remove) {
    if (!r) return;
    if (raf) { try { cancelAnimationFrame(raf); } catch (e) { /* */ } raf = 0; }
    r.stopped = true; st.ms = Math.round(now() - r.t0);
    if (remove) {
      if (r.el && r.el.parentNode) r.el.parentNode.removeChild(r.el);
      if (r.cv) { r.cv.width = 1; r.cv.height = 1; }              // the backing store goes back at once
      try { if (W.OLYMPUS && W.OLYMPUS.covered) W.OLYMPUS.covered(false); } catch (e) { /* */ }
      root.classList.remove('oly-warping');
      if (run === r) run = null;
    }
  }
  function prefetch(url) {
    try { if (W.fetch) W.fetch(url, { credentials: 'same-origin', cache: 'default' }).then(noop, noop); } catch (e) { /* the navigation fetches it */ }
  }
  function start(dest, o) {
    o = o || {};
    var r = { dest: dest, t0: now(), nav: o.nav !== false, replace: !!o.replace, frames: 0, navd: false, at: o.at };
    try {
      var mode = o.mode || tier(), F = FAM[dest.fam] || FAM.lab;
      run = r;
      st.runs++; st.mode = mode; st.to = dest.id; st.fam = dest.fam; st.t0 = Date.now(); st.navAt = 0; st.frames = 0; st.ms = 0; st.skipped = false; st.err = ''; st.held = false;
      if (r.nav) { hand(dest, o); prefetch(dest.url); }
      o.x = o.x == null ? W.innerWidth / 2 : o.x; o.y = o.y == null ? W.innerHeight / 2 : o.y;
      o.c = hexOk(o.c) || appColour(dest.id, o.el) || F.a;
      if (dest.fam === 'home' || o.back) o.c = F.a;
      style(); root.classList.add('oly-warping');
      try { if (W.OLYMPUS && W.OLYMPUS.covered) W.OLYMPUS.covered(true); } catch (e) { /* the scene keeps running under the jump */ }
      if (mode === 'fade') {
        r.el = overlay(dest, o, true);
        if (r.nav) { r.timer = setTimeout(function () { go(r); }, T.fade); r.give = setTimeout(function () { if (run === r) stop(r, true); }, T.give); }
        return r;
      }
      r.navAt = dest.id === HERE.id && dest.fam === HERE.fam ? T.hop : T.nav;     // another page of the same world: a short hop
      r.el = overlay(dest, o, false); r.cv = o.cv;
      var dpr = Math.min(MAX_DPR, W.devicePixelRatio || 1, mode === 'lite' ? 1 : MAX_DPR), cw = Math.max(1, Math.round(W.innerWidth * dpr)), ch = Math.max(1, Math.round(W.innerHeight * dpr));
      r.cv.width = cw; r.cv.height = ch; r.dpr = dpr;
      var g = r.cv.getContext('2d');
      if (!g) throw new Error('no 2d canvas');
      var s = scene(dest, o, mode === 'lite');
      try { var O = W.OLYMPUS, Q = W.OLYMPUS_QUIET; if (!(Q && Q()) && mode === 'full') { if (O && O.sfx) O.sfx('portal'); else if (W.OLYMPUS_SFX && W.OLYMPUS_SFX.play) W.OLYMPUS_SFX.play('portal'); } } catch (e) { /* silent */ }
      if (o.at != null) {                                        // a held frame (tests, screenshots): draw up to that moment, then stop
        var until = clamp(+o.at) * T.jump, t = 0;
        while (t < until) { var step = Math.min(16.7, until - t); t += step; draw(g, s, t, step, cw, ch, dpr, o); r.frames++; }
        [].forEach.call(r.el.children, function (c) { c.style.animationDelay = Math.round((c.className === 'ow-flash' ? T.jump * 0.38 : 0) - until) + 'ms'; });
        r.el.classList.add('frozen'); st.frames = r.frames; st.held = true;
        return r;
      }
      var last = r.t0;
      var frame = function () {
        if (run !== r || r.stopped) return;
        var tn = now(), t = tn - r.t0, dt = Math.min(48, Math.max(1, tn - last)); last = tn;
        try { draw(g, s, t, dt, cw, ch, dpr, o); } catch (e) { st.err = String(e && e.message || e); stop(r, false); go(r); return; }
        r.frames++; st.frames = r.frames;
        if (r.nav && t >= r.navAt) go(r);
        if (t > T.wait && !r.waiting) { r.waiting = true; r.el.classList.add('wait'); }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      if (r.nav) {
        r.timer = setTimeout(function () { go(r); }, r.navAt + 70);                  // no frame (a busy or hidden page): it still goes
        r.give = setTimeout(function () { if (run === r) stop(r, true); }, T.give);   // the next page never came: the page is yours again
      }
      return r;
    } catch (e) {
      st.err = String(e && e.message || e); stop(r, true);
      if (r.nav) { r.navd = false; go(r); }
      return r;
    }
  }
  function skip() {
    var r = run;
    if (r && !r.stopped) {
      if (!r.navd) { st.skipped = true; if (r.el) r.el.classList.add('cut'); stop(r, false); go(r); return 'jump'; }
      if (now() - r.t0 > T.dismiss) { stop(r, true); return 'dismiss'; }
      return 'wait';
    }
    var v = W.__olyWarpVT;
    if (v && v.skipTransition) { try { v.skipTransition(); } catch (e) { /* done */ } W.__olyWarpVT = null; st.skipped = true; return 'arrive'; }
    if (root.classList.contains('oly-warp-in')) { root.classList.remove('oly-warp-in'); st.skipped = true; return 'arrive'; }
    return 'none';
  }

  // ------------------------------------------------------------------------------------------------ where the trips start
  function travel(href, o) {
    var dest = world(href);
    if (!dest) return null;
    var same = dest.path === HERE.path;
    if (same && (dest.search === HERE.search || dest.fam === HERE.fam)) return null;   // this page: its own routes and hashes
    return dest;
  }
  W.addEventListener('click', function (e) {
    try {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.hasAttribute('download') || a.getAttribute('data-warp') === 'off') return;
      var tg = (a.getAttribute('target') || '').toLowerCase();
      if (tg && tg !== '_self') return;
      var dest = travel(a.href);
      if (!dest) return;
      if (run && !run.stopped) { e.preventDefault(); return; }    // one jump at a time
      if (!enabled() || d.hidden) return;
      e.preventDefault();
      var rc = a.getBoundingClientRect ? a.getBoundingClientRect() : null, kb = !e.detail || (!e.clientX && !e.clientY);
      start(dest, { x: kb && rc ? rc.left + rc.width / 2 : e.clientX, y: kb && rc ? rc.top + rc.height / 2 : e.clientY, el: a });
    } catch (x) { st.err = String(x && x.message || x); }        // the link then does what it always did
  }, false);
  // location.href = ... (Polis' buildings, the Gate and the search boxes' Enter) after a tap: the Navigation API, where there is one
  var NAV = W.navigation;
  if (NAV && NAV.addEventListener) NAV.addEventListener('navigate', function (e) {
    try {
      if (bypass || !e.cancelable || e.hashChange || e.downloadRequest || e.formData || e.info !== undefined || !enabled() || d.hidden) return;
      if (e.navigationType !== 'push' && e.navigationType !== 'replace') return;
      if (e.destination && e.destination.sameDocument) return;
      if (!(navigator.userActivation && navigator.userActivation.isActive)) return;   // only right after a tap (never a redirect at load)
      if (run && !run.stopped) return;
      var dest = travel(e.destination.url);
      if (!dest) return;
      e.preventDefault();
      start(dest, { replace: e.navigationType === 'replace' });
    } catch (x) { st.err = String(x && x.message || x); }
  });
  // a tap or a key during the jump: go now (during the arrival: show the page now)
  W.addEventListener('pointerdown', function () { if (run || W.__olyWarpVT || root.classList.contains('oly-warp-in')) skip(); }, true);
  W.addEventListener('keydown', function (e) { if ((run || W.__olyWarpVT) && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(); }, true);

  // ------------------------------------------------------------------------------------------------ leaving, coming back, arriving
  W.addEventListener('pageswap', function (e) {
    try {
      var v = e.viewTransition, act = e.activation, to = act && act.entry && act.entry.url ? world(act.entry.url) : null;
      if (v) { guard(v); if (!enabled() || (act && act.entry && !optsIn(to))) { v.skipTransition(); if (!enabled()) return; } else root.classList.add('oly-warping'); }
      if ((!run || !run.nav) && act && act.entry && act.entry.url && enabled()) {           // a jump nobody tapped (back, forward, a script)
        if (to) hand(to, { back: act.navigationType === 'traverse' });
      }
    } catch (x) { /* the browser's own transition */ }
  });
  W.addEventListener('pagehide', function () { if (raf) { try { cancelAnimationFrame(raf); } catch (e) { /* */ } raf = 0; } });
  W.addEventListener('pageshow', function (e) {                  // back here from the back-forward cache: no jump left on the screen
    if (!e.persisted) return;
    bypass = false; if (run) stop(run, true); root.classList.remove('oly-warping');
    try { W.sessionStorage.removeItem(HAND); } catch (x) { /* */ }
  });
  W.addEventListener('pagereveal', function (e) { if (e.viewTransition) guard(e.viewTransition); });
  if (W.__olyWarpIn) {
    var h = W.__olyWarpIn;
    st.arrive = { fam: h.f, from: h.from || '', vt: !!W.__olyWarpVT, hop: !!h.hop, back: !!h.back, at: Date.now() - h.t };
    if (W.__olyWarpVT) { try { W.__olyWarpVT.finished.then(function () { W.__olyWarpVT = null; st.arrive.done = Date.now() - h.t; }, noop); } catch (e) { /* */ } }
  }

  // ------------------------------------------------------------------------------------------------ the API
  var API = {
    VERSION: 1, FAM: FAM, DOOR: DOOR, T: T,
    go: function (url, o) {
      var dest = travel(url);
      if (!dest || !enabled() || (run && !run.stopped)) { try { if (o && o.replace) location.replace(url); else location.assign(url); } catch (e) { /* */ } return dest ? 'plain' : 'none'; }
      start(dest, o || {}); return st.mode;
    },
    play: function (to, o) {
      o = o || {};
      var dest; try { dest = world(new URL(/[/.]/.test(String(to)) ? String(to) : to === 'zenith' ? '' : to + '/', BASE).href); } catch (e) { dest = null; }
      if (!dest) return 'none';
      if (run) stop(run, true);
      o.nav = false; o.seed = o.seed || 7; start(dest, o); return st.mode;
    },
    stop: function () { if (run) stop(run, true); },
    skip: skip, world: world, tier: tier, enabled: enabled,
    state: function () { var c = {}; for (var n in st) c[n] = st[n]; c.active = !!(run && !run.stopped); return c; }
  };
  W.OLYMPUS_WARP = API;
  try { if (W.OLYMPUS && typeof W.OLYMPUS.go !== 'function') W.OLYMPUS.go = function (url) { return API.go(url); }; } catch (e) { /* frozen kit */ }
}());
