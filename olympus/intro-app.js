/* OLYMPUS app intro (olympus/intro-app.js, JOB 33a; docs/CLAUDE_REFERENCE.md "App intros"): the 2.4 s entrance every app plays when it opens.
 * One deferred line in each app's index.html after olympus.js: <script src="../olympus/intro-app.js?v=i9" defer></script>
 * Pages WITHOUT the kit name themselves on the tag (data-app / data-name / data-glyph / data-color; Bridge, Kalshi).
 *   film   the app's flavour scene (FLAVOUR) + its glyph from particles; the name letter by letter with a light sweep, a tagline; fade out
 *   once   full film once per app per launch (sessionStorage 'oly.intro.<app>'), then a 400 ms version
 *   never  LITE (3D Low), reduced motion, 3D Off, ?q=off, ?intro=0, localStorage 'oly.intro' = 'off', automation (navigator.webdriver) unless ?intro=1
 *   skip   a tap, Esc, Enter or Space; it never blocks the app (a timer ends it, a hidden tab ends it, any error removes it)
 *   sound  OLYMPUS.sfx, only while the kit's Sound switch allows it
 *   state  window.__olyAppIntro = { app, mode, state, frames, ms, err, why }.  ES5 only (Safari 16). It never throws.
 */
(function () {
  'use strict';
  var W = window, d = document, root = d.documentElement, O = W.OLYMPUS;
  // no kit: the tag names the app; the kit's quality key 'jfx' (low = LITE, off = 3D Off) and reduced motion still apply
  if (!O) {
    var me = d.currentScript || d.querySelector('script[src*="intro-app.js"][data-app]');
    var at = function (k) { return (me && me.getAttribute(k)) || ''; };
    if (!at('data-app')) return;
    var lvl = (function () { try { var v = localStorage.getItem('jfx'); return v ? String(JSON.parse(v)) : ''; } catch (e) { try { return String(localStorage.getItem('jfx') || ''); } catch (e2) { return ''; } } })();
    var rm = function () { try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
    O = { app: at('data-app'), name: at('data-name') || at('data-app'), glyph: at('data-glyph') || '\u039f', color: at('data-color') || '#c8a24a',
          fx: function () { return lvl === 'ultra' ? 'ultra' : 'high'; }, lite: function () { return lvl === 'low'; },
          reduced: function () { return lvl === 'off' || rm(); },
          sfx: function (n) { var k = W.OLYMPUS_SFX; if (k && k.play) k.play(n); } };
  }
  if (!O || W.__olyAppIntro) return;
  var st = W.__olyAppIntro = { app: O.app || '', mode: 'none', state: 'idle', frames: 0, ms: 0, err: '', why: '', scene: '', len: 0 };
  // Do not play over the kit's failed-load Retry UI.
  if (O.state && O.state() === 'failed') { st.state = 'off'; st.why = 'app failed'; return; }

  // --- the per-app flavour: [scene, tagline, first sound]
  var FLAVOUR = {
    widget: ['columns', 'Your accounts at a glance', 'tick'],
    why: ['columns', 'See why we win', 'tick'],
    board: ['columns', 'Read the board', 'tick'],
    business: ['columns', 'Count the ventures', 'tap'],
    trading: ['bars', 'Every trade, every day', 'tick'],
    agency: ['columns', 'Open the shop', 'tap'],
    polis: ['skyline', 'Enter the city', 'tap'],
    herald: ['columns', 'Unroll the news', 'tap'],
    symposium: ['torches', 'Take a seat', 'tap'],
    nq: ['columns', 'The bots, right now', 'tick'],
    colosseum: ['torches', 'Enter the arena', 'tap'],
    pinakes: ['columns', 'Open the drawers', 'tap'],
    archive: ['columns', 'Open the shelves', 'tap'],
    ergasterion: ['columns', 'Walk the workshop', 'tap'],
    helios: ['rings', 'Rise and plan', 'tick'],
    harmonia: ['bars', 'Weigh it up', 'tap'],
    pheme: ['threads', 'Hear the word', 'tick'],
    compass: ['rings', 'Find north', 'tick'],
    kairos: ['rings', 'Find the right moment', 'tick'],
    mint: ['columns', 'Strike the coin', 'tap'],
    mintcity: ['columns', 'Raise the city', 'tick'],
    mercury: ['coins', 'Find the saving', 'tap'],
    chrysos: ['coins', 'Count the gold', 'tap'],
    sibyl: ['rings', 'Read the odds', 'tick'],
    oikos: ['coins', 'Keep what you make', 'tap'],
    arbiter: ['coins', 'Weigh the spread', 'tap'],
    stoa: ['columns', 'Light the columns', 'tick'],
    aegis: ['columns', 'Raise the shield', 'tap'],
    lyceum: ['columns', 'Learn your own rules', 'tap'],
    nike: ['rings', 'Count your wins', 'tap'],
    kronos: ['rings', 'Read the shadow', 'tick'],
    moirai: ['rings', 'Spin the threads', 'tick'],
    epilogue: ['rings', 'Read the week', 'tick'],
    argo: ['rings', 'Set sail', 'tap'],
    kratos: ['columns', 'Keep your own rules', 'tap'],
    pythia: ['rings', 'Read the calendar', 'tick'],
    gallery: ['columns', 'Walk the Agora', 'tap'],
    datacity: ['skyline', 'Your numbers, rising', 'portal'], mind: ['neurons', 'Every note, lit up', 'portal'], tree: ['leaves', 'Grow what you learn', 'tap'],
    oracle: ['smoke', 'The oracle is listening', 'portal'], odeon: ['bars', 'Turn it up', 'tap'], fates: ['threads', 'Three threads, one path', 'tick'],
    hermes: ['streaks', 'Your week, at speed', 'portal'], prometheus: ['embers', 'Fire for the forge', 'portal'], tyche: ['coins', 'Fortune favours the bold', 'tap'],
    pantheon: ['columns', 'All the gods, one place', 'portal'], arena: ['torches', 'Earn your glory', 'thunder'], ares: ['embers', 'Strike with discipline', 'thunder'],
    plutus: ['coins', 'Where the wealth is', 'tap'], athena: ['smoke', 'Wisdom on demand', 'portal'], forum: ['columns', 'Speak. Decide.', 'portal'],
    labyrinth: ['maze', 'Find the way through', 'tick'], argus: ['neurons', 'A hundred eyes', 'tick'], nemesis: ['shards', 'Every move has a price', 'thunder'],
    chronos: ['rings', 'Time, measured', 'tick'], hephaestus: ['embers', 'Built in the forge', 'portal'], bridge: ['streaks', 'Cross over', 'portal'],
    cities: ['skyline', 'Every number, a city', 'portal'], kalshicity: ['skyline', 'Odds, rising', 'portal'], settings: ['rings', 'Make it yours', 'tick'],
    inbox: ['streaks', 'Everything that arrived', 'tick'], ledger: ['coins', 'Every dollar, counted', 'tap'],
    journal: ['neurons', 'Remember every trade', 'tick'], observatory: ['rings', 'Evidence comes into focus', 'tick'],
    hestia: ['embers', 'Keep the hearth warm', 'portal'], demeter: ['leaves', 'Reap what you sow', 'portal'], apollo: ['rings', 'Light on the numbers', 'portal'],
    delphi: ['rings', 'Read the omens', 'tick'], pnyx: ['columns', 'Count the risk', 'tap'], planner: ['rings', 'Plan the day', 'tick'], hera: ['columns', 'Order, held steady', 'portal'], dionysus: ['coins', 'Celebrate the wins', 'tap'], clio: ['threads', 'The story, in order', 'tick'],
    atlas: ['stars', 'Find your arena', 'portal'], kalshi: ['coins', 'Read the odds, keep the edge', 'tick']
  };
  var FL = FLAVOUR[O.app] || ['stars', 'Welcome to Olympus', 'portal'];
  st.scene = FL[0];

  // --- whether and how it plays
  var search = location.search || '';
  var ls = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var ss = function (k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { /* private mode: it plays once per page then */ }
    return null;
  };
  var forced = /[?&]intro=1(&|$)/.test(search);
  var why = '';
  if (/[?&]q=off(&|$)/.test(search)) why = 'q=off';
  else if (/[?&]intro=0(&|$)/.test(search) || ls('oly.intro') === 'off') why = 'switched off';
  else if (O.reduced()) why = 'reduced motion';
  else if (O.lite()) why = 'LITE';
  else if (navigator.webdriver && !forced) why = 'automation';
  if (why) { st.state = 'off'; st.why = why; return; }
  var seenKey = 'oly.intro.' + (O.app || 'app');
  var seen = ss(seenKey) === '1';
  var mode = seen ? 'short' : 'full';
  var LEN = { full: 2.4, short: 0.4, lite: 0.7 };      // (lite is kept for old callers: LITE now plays nothing)
  var LEN_S = LEN[mode];
  st.mode = mode; st.len = LEN_S;
  // film clock tt runs 0 -> 2.6; short plays its end
  var tt0 = mode === 'full' ? 0 : mode === 'short' ? 1.55 : 1.75, ttK = (2.6 - tt0) / LEN_S;                      // the film's own clock runs to 2.6; full plays it in 2.4 s

  // --- small helpers
  var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var ramp = function (t, a, b) { return cl((t - a) / (b - a)); };
  var ease = function (x) { return 1 - Math.pow(1 - x, 3); };
  var sm = function (x) { return x * x * (3 - 2 * x); };
  var seed = 11;
  var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  var hex = function (h) { h = String(h || '#d3b579'); return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) || 0; }); };
  var rgba = function (c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; };
  var mixc = function (a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
  var now = function () { return (W.performance && performance.now) ? performance.now() : Date.now(); };
  var COL = hex(O.color), WHITE = [255, 255, 255], GOLD = [255, 205, 100];
  // AGORA (2026-11-09): the app's colour leans toward gold, so no entrance is neon
  COL = [Math.round(COL[0] * 0.45 + 200 * 0.55), Math.round(COL[1] * 0.45 + 162 * 0.55), Math.round(COL[2] * 0.45 + 74 * 0.55)];
  var DISPLAY = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia, -apple-system, system-ui, sans-serif', UI = '-apple-system, system-ui, sans-serif';

  // --- the overlay
  var el = null, cv = null, c = null, raf = 0, killT = 0, t0 = 0, done = false, skipping = false, holdUp = false;
  var VW = 0, VH = 0, DPR = 1, scene = null, parts = null, glyphPx = 0, cx = 0, cy = 0, soundsAt = {}, motionQuery = null, motionListener = null;
  function addCss() {
    var s = d.createElement('style');
    s.textContent = '.oly-intro{position:fixed;left:0;top:0;right:0;bottom:0;z-index:70;background:#090807;overflow:hidden;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}' +
      '.oly-intro canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}' +
      '@media (prefers-reduced-motion:reduce){.oly-intro{display:none}}';
    (d.head || root).appendChild(s);
  }
  function sfx(n) { try { var k = W.OLYMPUS_SFX; if (k && k.sound && !k.sound()) return; if (O.sfx) O.sfx(n); } catch (e) { /* the sound is never needed */ } }       // silent when the Sound switch says so
  function cue(key, name) { if (!soundsAt[key]) { soundsAt[key] = 1; sfx(name); } }

  function finish(how) {                                       // removes everything; safe to call any number of times
    if (done) return;
    done = true; st.state = how || 'done'; st.ms = Math.round(now() - t0);
    // A hidden tab or a failed canvas never counts as a watched intro.
    if (mode === 'full' && (st.state === 'done' || st.state === 'skipped')) ss(seenKey, '1');
    try { cancelAnimationFrame(raf); } catch (e) { /* */ }
    clearTimeout(killT);
    try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { /* */ }
    try {
      root.removeAttribute('data-oly-intro');
      d.removeEventListener('keydown', onKey, true); d.removeEventListener('visibilitychange', onVis);
      W.removeEventListener('pointerup', up, true); W.removeEventListener('pointercancel', up, true); W.removeEventListener('resize', onSize);
      if (motionQuery && motionListener) {
        if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', motionListener);
        else if (motionQuery.removeListener) motionQuery.removeListener(motionListener);
      }
    } catch (e) { /* */ }
    scene = null; parts = null; c = null; cv = null; el = null;
    try { W.dispatchEvent(new Event('oly:app-intro-end')); } catch (e) { /* old browser */ }
  }
  function fail(e) { st.err = String((e && e.message) || e || 'error'); finish('failed'); }
  function skip(e) {
    if (done || skipping) return;
    skipping = true;
    if (e && e.type === 'pointerdown') holdUp = true;
    try { cancelAnimationFrame(raf); } catch (x) { /* */ }
    try { el.style.transition = 'opacity 70ms linear'; el.style.opacity = '0'; } catch (x) { /* */ }
    setTimeout(function () {                                   // the tap's finger is still down: its click must not land on the app
      var n = 0, tick = function () { if (!holdUp || (n += 50) > 700) finish('skipped'); else setTimeout(tick, 50); };
      tick();
    }, 70);
  }
  function onKey(e) {
    if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
    // The film is aria-hidden: a screen-reader or keyboard user may already be on an app control.
    // Their Enter/Space is meant for that control, so end the film before its default action.
    if (e.key !== 'Escape' && e.target && e.target !== d && e.target !== root && e.target !== d.body && e.target !== el) {
      finish('skipped'); return;
    }
    e.preventDefault(); e.stopPropagation(); skip(e);
  }
  function onVis() { if (d.visibilityState !== 'visible') finish('hidden'); }
  function up() { if (holdUp) setTimeout(function () { holdUp = false; }, 60); }
  function onSize() { try { fit(); } catch (e) { fail(e); } }

  function fit() {
    VW = Math.max(1, innerWidth); VH = Math.max(1, innerHeight);
    DPR = Math.min(W.devicePixelRatio || 1, mode === 'full' ? 1.5 : 1);
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    glyphPx = Math.max(96, Math.min(VW * 0.44, VH * 0.26, 200));
    cx = VW / 2; cy = VH * 0.4;
  }

  // --- the glyph, formed from particles
  function makeParts() {
    var n = O.fx() === 'ultra' ? 1100 : 760, S = 120, g = d.createElement('canvas'); g.width = S; g.height = S;
    var x = g.getContext('2d'); if (!x) return [];
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#efeeeb';
    x.font = '700 ' + Math.round(S * 0.78) + 'px ' + DISPLAY;
    x.fillText(O.glyph || 'Ο', S / 2, S / 2 + S * 0.04);
    var data = x.getImageData(0, 0, S, S).data, pts = [], i, j;
    for (j = 0; j < S; j += 2) for (i = 0; i < S; i += 2) if (data[(j * S + i) * 4 + 3] > 120) pts.push((i / S - 0.5), (j / S - 0.5));
    var np = pts.length / 2, out = [], bottom = st.scene === 'embers' || st.scene === 'skyline' || st.scene === 'torches' || st.scene === 'bars' || st.scene === 'columns',
      top = st.scene === 'coins' || st.scene === 'leaves';
    if (!np) return out;
    for (i = 0; i < n; i++) {
      var k = ((rnd() * np) | 0) * 2, sx, sy, a = rnd() * 6.2832;
      if (bottom) { sx = rnd() * VW; sy = VH + 20 + rnd() * 80; }
      else if (top) { sx = rnd() * VW; sy = -20 - rnd() * 80; }
      else { var r = Math.max(VW, VH) * (0.55 + rnd() * 0.4); sx = cx + Math.cos(a) * r; sy = cy + Math.sin(a) * r; }
      out.push({ tx: pts[k], ty: pts[k + 1], sx: sx, sy: sy, dl: 0.05 + rnd() * 0.55, sz: 1 + rnd() * 1.6, ph: rnd() * 6.28 });
    }
    return out;
  }

  // --- flavour scenes: { init(), draw(t = film s, a = 0..1) }
  var SC = {};
  function glow(x, y, r, col, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  SC.stars = {
    init: function () { var s = this; s.p = []; for (var i = 0; i < 70; i++) s.p.push([rnd() * VW, rnd() * VH, rnd() * 6.28, 0.6 + rnd() * 1.4]); },
    draw: function (t, a) { var p = this.p, i; c.fillStyle = rgba(WHITE, 1); for (i = 0; i < p.length; i++) { c.globalAlpha = a * (0.25 + 0.5 * Math.abs(Math.sin(t * 1.6 + p[i][2]))); c.fillRect(p[i][0], p[i][1], p[i][3], p[i][3]); } c.globalAlpha = 1; }
  };
  SC.smoke = {                                                  // Oracle / Athena: drifting smoke and shafts of light
    init: function () { var s = this, i; s.b = []; for (i = 0; i < 12; i++) s.b.push([rnd(), rnd(), 120 + rnd() * 130, rnd() * 6.28, 0.5 + rnd()]); },
    draw: function (t, a) {
      var b = this.b, i, x, y, g;
      for (i = 0; i < b.length; i++) {
        x = b[i][0] * VW + Math.sin(t * 0.5 * b[i][4] + b[i][3]) * 44; y = VH * (0.25 + b[i][1] * 0.7) - t * 14 * b[i][4];
        glow(x, y, b[i][2], mixc([170, 170, 200], COL, 0.25), 0.2 * a);
      }
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < 3; i++) {                                 // light shafts from the upper right, swaying
        x = VW * (0.95 - i * 0.28) + Math.sin(t * 0.7 + i) * 18; g = c.createLinearGradient(x, 0, x - VW * 0.5, VH);
        g.addColorStop(0, rgba(mixc(WHITE, COL, 0.45), 0.17 * a * ramp(t, 0.2 + i * 0.15, 1.1))); g.addColorStop(1, rgba(COL, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(x - 20, -10); c.lineTo(x + 24, -10); c.lineTo(x - VW * 0.5 + 70, VH); c.lineTo(x - VW * 0.5 - 40, VH); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
  };
  SC.coins = {                                                  // Tyche / Plutus: gold coins fall into water and ring it
    init: function () { var s = this, i; s.c = []; for (i = 0; i < 34; i++) s.c.push([rnd() * VW, rnd() * 1.1, 150 + rnd() * 160, rnd() * 6.28, 5 + rnd() * 4, 3 + rnd() * 3]); },
    draw: function (t, a) {
      var s = this, i, p, y, wy = VH * 0.74, age, g, k, X;
      g = c.createLinearGradient(0, wy, 0, VH); g.addColorStop(0, rgba(COL, 0.28 * a)); g.addColorStop(1, rgba(COL, 0.04 * a));
      c.fillStyle = g; c.beginPath(); c.moveTo(0, VH);
      for (X = 0; X < VW + 12; X += 12) c.lineTo(Math.min(X, VW), wy + Math.sin(Math.min(X, VW) * 0.03 + t * 3) * 3);   // ends ON the right edge
      c.lineTo(VW, VH); c.closePath(); c.fill();
      for (i = 0; i < s.c.length; i++) {
        p = s.c[i]; age = t - p[1]; if (age < 0) continue;
        y = -20 + age * p[2];
        if (y < wy) {
          k = Math.abs(Math.cos(t * p[4] + p[3]));
          c.fillStyle = rgba(mixc(GOLD, COL, 0.12), 0.92 * a); c.beginPath(); c.ellipse(p[0], y, p[5] * (0.15 + k), p[5], 0, 0, 6.2832); c.fill();
          c.fillStyle = rgba(WHITE, 0.5 * a * k); c.fillRect(p[0] - p[5] * 0.5 * k, y - p[5] * 0.6, p[5] * k, 1);
        } else {
          age = (y - wy) / p[2];                                 // seconds since it hit the water: a ring spreads and fades
          if (age < 0.9) { c.strokeStyle = rgba(mixc(WHITE, COL, 0.4), 0.55 * (1 - age / 0.9) * a); c.lineWidth = 1.2; c.beginPath(); c.ellipse(p[0], wy + 3, 4 + age * 70, 1.5 + age * 16, 0, 0, 6.2832); c.stroke(); }
        }
      }
    }
  };
  SC.embers = {                                                 // Prometheus / Hephaestus / Ares: sparks rise and ignite
    init: function () { var s = this, i; s.p = []; for (i = 0; i < 90; i++) s.p.push([rnd() * VW, rnd(), 50 + rnd() * 150, rnd() * 6.28, 1 + rnd() * 2.2]); },
    draw: function (t, a) {
      var s = this, i, p, y, ign = sm(ramp(t, 0.2, 1.5)), hot = mixc(COL, WHITE, 0.55), fl = 0.85 + 0.15 * Math.sin(t * 17);
      glow(VW / 2, VH + 30, VH * 0.72, COL, 0.5 * ign * a * fl);
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < s.p.length; i++) {
        p = s.p[i]; y = VH + 10 - ((p[1] * (VH + 40) + t * p[2]) % (VH + 40));
        c.fillStyle = rgba(mixc(mixc(COL, [60, 10, 0], 0.7 * (1 - ign)), hot, ign * (1 - y / VH) * 0.8), (0.25 + 0.75 * ign) * a * (0.5 + 0.5 * Math.abs(Math.sin(t * 9 + p[3]))) * (0.35 + 0.65 * y / VH));
        c.fillRect(p[0] + Math.sin(t * 2 + p[3]) * 14, y, p[4], p[4]);
      }
      c.globalCompositeOperation = 'source-over';
    }
  };
  SC.neurons = {                                                // Mind / Argus: a network lights from the centre outwards
    init: function () {
      var s = this, i, j, b1, b2, d1, d2, dd; s.n = []; s.e = [];
      for (i = 0; i < 42; i++) s.n.push([0.06 + rnd() * 0.88, 0.1 + rnd() * 0.8]);
      for (i = 0; i < s.n.length; i++) {                         // each node joins its two nearest neighbours
        b1 = b2 = -1; d1 = d2 = 1e12;
        for (j = 0; j < s.n.length; j++) {
          if (j === i) continue;
          dd = Math.pow((s.n[i][0] - s.n[j][0]) * VW, 2) + Math.pow((s.n[i][1] - s.n[j][1]) * VH, 2);
          if (dd < d1) { b2 = b1; d2 = d1; b1 = j; d1 = dd; } else if (dd < d2) { b2 = j; d2 = dd; }
        }
        s.e.push([i, b1, rnd()], [i, b2, rnd()]);
      }
    },
    draw: function (t, a) {
      var s = this, i, e, A, B, lit = function (n) { return ramp(t, 0.1 + Math.hypot(n[0] - 0.5, n[1] - 0.42) * 1.5, 0.45 + Math.hypot(n[0] - 0.5, n[1] - 0.42) * 1.5); }, la, lb, f;
      c.lineWidth = 1;
      for (i = 0; i < s.e.length; i++) {
        e = s.e[i]; A = s.n[e[0]]; B = s.n[e[1]]; la = lit(A); lb = lit(B); f = Math.min(la, lb);
        if (f <= 0) continue;
        c.strokeStyle = rgba(COL, 0.38 * f * a); c.beginPath(); c.moveTo(A[0] * VW, A[1] * VH); c.lineTo(B[0] * VW, B[1] * VH); c.stroke();
        var u = (t * 0.7 + e[2]) % 1; c.fillStyle = rgba(WHITE, 0.8 * f * a); c.fillRect(A[0] * VW + (B[0] - A[0]) * VW * u - 1, A[1] * VH + (B[1] - A[1]) * VH * u - 1, 2.4, 2.4);
      }
      for (i = 0; i < s.n.length; i++) { f = lit(s.n[i]); if (f > 0) { glow(s.n[i][0] * VW, s.n[i][1] * VH, 14 + 8 * f, COL, 0.55 * f * a); c.fillStyle = rgba(WHITE, 0.9 * f * a); c.fillRect(s.n[i][0] * VW - 1.5, s.n[i][1] * VH - 1.5, 3, 3); } }
    }
  };
  SC.skyline = {                                                // Cities: a camera flight through a layered, perspective city
    init: function () {
      var s = this, row, side, i;
      s.b = [];
      for (row = 0; row < 5; row++) for (side = -1; side <= 1; side += 2) for (i = 0; i < 3; i++) {
        s.b.push({ z: 0.55 + row * 0.55 + i * 0.12, side: side, lane: 0.55 + i * 0.5,
          w: 30 + rnd() * 28, h: 85 + rnd() * 155, lit: rnd(), roof: rnd() });
      }
    },
    draw: function (t, a) {
      var s = this, i, b, z, sc, horizon = VH * 0.49, by, x, w, h, cap, shift, face, roof, lane, wx, wy, alpha;
      var reveal = ease(ramp(t, 0.05, 0.85)), travel = Math.max(0, t - 0.15) * 0.16;
      // A receding road and converging light rails give the city a readable vanishing point.
      c.fillStyle = rgba(COL, 0.08 * a * reveal);
      c.beginPath(); c.moveTo(cx, horizon); c.lineTo(VW * 0.68, VH); c.lineTo(VW * 0.32, VH); c.closePath(); c.fill();
      c.strokeStyle = rgba(mixc(COL, WHITE, 0.55), 0.34 * a * reveal); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx, horizon); c.lineTo(VW * 0.32, VH); c.moveTo(cx, horizon); c.lineTo(VW * 0.68, VH); c.stroke();
      // far towers first; roofs and sides move at different speeds
      for (i = s.b.length - 1; i >= 0; i--) {
        b = s.b[i]; z = b.z - travel; if (z < 0.25) z += 2.75;
        sc = 1 / (z + 0.55); by = horizon + 245 * sc;
        lane = b.side * (118 + b.lane * 75);
        x = cx + lane * sc; w = b.w * sc; h = b.h * sc * ease(ramp(t, 0.08 + b.z * 0.08, 0.72 + b.z * 0.08));
        if (h < 2 || x + w < -80 || x - w > VW + 80) continue;
        shift = b.side * 10 * sc; cap = Math.max(3, 9 * sc);
        alpha = a * reveal * Math.min(1, 0.34 + sc);
        face = mixc([8, 13, 29], COL, 0.18 + b.lit * 0.12);
        c.fillStyle = rgba(face, 0.88 * alpha); c.fillRect(x - w / 2, by - h, w, h);
        c.fillStyle = rgba(mixc(face, COL, 0.45), 0.75 * alpha);
        c.beginPath(); c.moveTo(x + (b.side < 0 ? -w / 2 : w / 2), by - h);
        c.lineTo(x + (b.side < 0 ? -w / 2 : w / 2) + shift, by - h - cap);
        c.lineTo(x + (b.side < 0 ? -w / 2 : w / 2) + shift, by - cap);
        c.lineTo(x + (b.side < 0 ? -w / 2 : w / 2), by); c.closePath(); c.fill();
        roof = mixc(COL, WHITE, 0.5);
        c.fillStyle = rgba(roof, 0.66 * alpha);
        c.beginPath(); c.moveTo(x - w / 2, by - h); c.lineTo(x - w / 2 + shift, by - h - cap);
        c.lineTo(x + w / 2 + shift, by - h - cap); c.lineTo(x + w / 2, by - h); c.closePath(); c.fill();
        for (wy = by - h + 8 * sc; wy < by - 4 * sc; wy += Math.max(5, 12 * sc)) {
          for (wx = x - w / 2 + 5 * sc; wx < x + w / 2 - 2 * sc; wx += Math.max(5, 10 * sc)) {
            if (((Math.floor(wx * 3 + wy * 7 + i * 19)) % 5 + 5) % 5 < 2) {
              c.fillStyle = rgba(mixc(COL, WHITE, 0.65), 0.68 * alpha * ramp(t, 0.55, 1.3));
              c.fillRect(wx, wy, Math.max(1, 2.2 * sc), Math.max(1, 3 * sc));
            }
          }
        }
      }
      // The last glint arrives just as the city name resolves.
      glow(cx, horizon, VW * 0.42, COL, 0.23 * a * sm(ramp(t, 0.55, 1.3)));
    }
  };
  SC.torches = {                                                // Arena: two torches, a crowd that roars
    init: function () { var s = this, i; s.h = []; for (i = 0; i < 24; i++) s.h.push([(i + 0.5) / 24 * VW, VH - 16 - rnd() * 34, 9 + rnd() * 5, rnd() * 6.28]); },
    draw: function (t, a) {
      var s = this, i, k, x, y, roar = sm(ramp(t, 0.7, 1.05)) * (1 - sm(ramp(t, 1.9, 2.4))), fl, h;
      c.globalCompositeOperation = 'lighter';
      for (k = 0; k < 2; k++) {
        x = k ? VW * 0.88 : VW * 0.12; fl = ramp(t, 0.05 + k * 0.1, 0.5);
        glow(x, VH * 0.56, VW * 0.65, [255, 130, 40], 0.22 * fl * a * (0.85 + 0.15 * Math.sin(t * 19 + k)));
        for (i = 0; i < 9; i++) { y = VH * 0.6 - ((t * 120 + i * 17) % 110) * 0.6; glow(x + Math.sin(t * 8 + i * 2 + k) * 7 * (1 - i / 10), y, 24 - i * 1.7, [255, 170 - i * 8, 60], 0.5 * fl * a * (1 - i / 10)); }
      }
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = rgba([30, 20, 10], 0.9 * a); c.lineWidth = 4; c.beginPath(); c.moveTo(VW * 0.12, VH * 0.62); c.lineTo(VW * 0.12, VH); c.moveTo(VW * 0.88, VH * 0.62); c.lineTo(VW * 0.88, VH); c.stroke();
      for (i = 0; i < s.h.length; i++) {                         // the crowd: heads bob, arms go up on the roar
        h = s.h[i]; y = h[1] - Math.abs(Math.sin(t * 7 + h[3])) * 8 * roar;
        c.fillStyle = rgba([8, 6, 10], 0.95 * a); c.beginPath(); c.arc(h[0], y, h[2], 0, 6.2832); c.fill(); c.fillRect(h[0] - h[2] * 1.3, y + h[2] * 0.8, h[2] * 2.6, VH - y);
        if (roar > 0.02) { c.strokeStyle = rgba([8, 6, 10], 0.95 * a); c.lineWidth = 3.5; c.beginPath(); c.moveTo(h[0] - h[2], y + h[2]); c.lineTo(h[0] - h[2] * 1.6 - Math.sin(t * 9 + h[3]) * 4, y - 22 * roar); c.moveTo(h[0] + h[2], y + h[2]); c.lineTo(h[0] + h[2] * 1.6 + Math.sin(t * 9 + h[3] + 1) * 4, y - 22 * roar); c.stroke(); }
      }
      if (roar > 0.5) cue('roar', 'thunder');
    }
  };
  SC.threads = {                                                // Fates: three gold threads weave
    init: function () { },
    draw: function (t, a) {
      var i, y, x, k, end;
      c.lineWidth = 1.6;
      for (i = 0; i < 6; i++) {
        end = VH * ease(ramp(t, 0.05 + i * 0.07, 1.5 + i * 0.05)); k = i - 2.5;
        c.strokeStyle = rgba(mixc(GOLD, COL, i % 2 ? 0.5 : 0.1), 0.55 * a); c.beginPath();
        for (y = 0; y <= end; y += 8) { x = VW * 0.5 + k * VW * 0.1 * Math.cos(y * 0.006 + t * 0.8) + Math.sin(y * 0.014 + t * 1.2 + i) * VW * 0.07; if (y === 0) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
      }
    }
  };
  SC.streaks = {                                                // Hermes / Bridge: fast wind lines
    init: function () { var s = this, i; s.p = []; for (i = 0; i < 44; i++) s.p.push([rnd() * VH, 40 + rnd() * 120, 500 + rnd() * 900, rnd(), 0.6 + rnd()]); },
    draw: function (t, a) {
      var s = this, i, p, x; c.globalCompositeOperation = 'lighter';
      for (i = 0; i < s.p.length; i++) {
        p = s.p[i]; x = ((t * p[2] + p[3] * (VW + p[1])) % (VW + p[1])) - p[1];
        c.strokeStyle = rgba(mixc(COL, WHITE, 0.3), 0.4 * a * ramp(t, 0.05, 0.5)); c.lineWidth = p[4]; c.beginPath(); c.moveTo(x, p[0]); c.lineTo(x + p[1], p[0]); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }
  };
  SC.bars = {                                                   // Odeon: an equaliser
    init: function () { },
    draw: function (t, a) {
      var i, n = 22, w = VW / n, h; c.globalCompositeOperation = 'lighter';
      for (i = 0; i < n; i++) {
        h = VH * 0.3 * (0.25 + 0.75 * Math.abs(Math.sin(t * (3 + i % 5) + i * 0.9))) * ramp(t, 0.05 + i * 0.01, 0.6);
        c.fillStyle = rgba(COL, 0.3 * a); c.fillRect(i * w + 2, VH - h, w - 4, h); c.fillStyle = rgba(mixc(COL, WHITE, 0.6), 0.8 * a); c.fillRect(i * w + 2, VH - h, w - 4, 2);
      }
      c.globalCompositeOperation = 'source-over';
    }
  };
  SC.leaves = {                                                 // Daphne: leaves drift down
    init: function () { var s = this, i; s.p = []; for (i = 0; i < 30; i++) s.p.push([rnd() * VW, rnd(), 30 + rnd() * 60, rnd() * 6.28, 4 + rnd() * 5]); },
    draw: function (t, a) {
      var s = this, i, p, y; for (i = 0; i < s.p.length; i++) {
        p = s.p[i]; y = ((p[1] * (VH + 60) + t * p[2]) % (VH + 60)) - 30;
        c.fillStyle = rgba(mixc(COL, [20, 120, 60], 0.3 * (i % 3)), 0.55 * a); c.beginPath(); c.ellipse(p[0] + Math.sin(t * 1.4 + p[3]) * 26, y, p[4], p[4] * 0.45, t * 1.2 + p[3], 0, 6.2832); c.fill();
      }
    }
  };
  SC.columns = {                                                // Pantheon / Forum: marble columns rise
    init: function () { },
    draw: function (t, a) {
      var i, n = 7, x, h, g;
      for (i = 0; i < n; i++) {
        x = VW * (i + 0.5) / n - 13; h = VH * 0.55 * ease(ramp(t, 0.1 + i * 0.07, 1.1 + i * 0.07));
        g = c.createLinearGradient(0, VH - h, 0, VH); g.addColorStop(0, rgba(mixc(COL, WHITE, 0.4), 0.3 * a)); g.addColorStop(1, rgba(COL, 0.02));
        c.fillStyle = g; c.fillRect(x, VH - h, 26, h); c.fillStyle = rgba(WHITE, 0.4 * a); c.fillRect(x - 3, VH - h, 32, 3);
        c.fillStyle = rgba(WHITE, 0.07 * a); c.fillRect(x + 6, VH - h, 2, h); c.fillRect(x + 16, VH - h, 2, h);
      }
    }
  };
  SC.shards = {                                                 // Nemesis: angular shards in the flicker of lightning
    init: function () { var s = this, i; s.p = []; for (i = 0; i < 16; i++) s.p.push([rnd() * VW, rnd() * VH, 30 + rnd() * 90, rnd() * 6.28, rnd()]); },
    draw: function (t, a) {
      var s = this, i, p, f = Math.max(Math.exp(-(t - 0.5) * 9) * (t > 0.5 ? 1 : 0), Math.exp(-(t - 1.15) * 9) * (t > 1.15 ? 1 : 0), Math.exp(-(t - 1.75) * 9) * (t > 1.75 ? 1 : 0));
      c.fillStyle = rgba(mixc(WHITE, COL, 0.4), 0.2 * f * a); c.fillRect(0, 0, VW, VH);
      c.lineWidth = 1.2;
      for (i = 0; i < s.p.length; i++) {
        p = s.p[i]; c.strokeStyle = rgba(COL, (0.25 + 0.5 * f) * a * ramp(t, p[4] * 0.8, p[4] * 0.8 + 0.4)); c.beginPath();
        c.moveTo(p[0] + Math.cos(p[3]) * p[2], p[1] + Math.sin(p[3]) * p[2]); c.lineTo(p[0] + Math.cos(p[3] + 2.3) * p[2] * 0.7, p[1] + Math.sin(p[3] + 2.3) * p[2] * 0.7);
        c.lineTo(p[0] + Math.cos(p[3] + 4.1) * p[2] * 0.5, p[1] + Math.sin(p[3] + 4.1) * p[2] * 0.5); c.closePath(); c.stroke();
      }
    }
  };
  SC.rings = {                                                  // Chronos: clock rings turn, ticks run round
    init: function () { },
    draw: function (t, a) {
      var i, r, k, ang;
      for (i = 0; i < 6; i++) {
        r = 70 + i * 46; k = ease(ramp(t, 0.05 + i * 0.1, 0.9 + i * 0.1)); ang = t * (i % 2 ? -0.6 : 0.5) + i;
        c.strokeStyle = rgba(mixc(COL, WHITE, i === 5 ? 0.4 : 0.1), (0.5 - i * 0.05) * a); c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, r, ang, ang + 4.2 * k); c.stroke();
        if (i === 5) { c.lineWidth = 1; c.beginPath(); for (var j = 0; j < 60; j++) { var q = j / 60 * 6.2832; c.moveTo(cx + Math.cos(q) * (r + 8), cy + Math.sin(q) * (r + 8)); c.lineTo(cx + Math.cos(q) * (r + (j % 5 ? 12 : 17)), cy + Math.sin(q) * (r + (j % 5 ? 12 : 17))); } c.stroke(); }
      }
    }
  };
  SC.maze = {                                                   // Labyrinth: the walls draw themselves from the centre
    init: function () {
      var s = this, X, Y, G = 34; s.s = [];
      for (Y = 0; Y < VH; Y += G) for (X = 0; X < VW; X += G) {
        var dl = Math.hypot(X - VW / 2, Y - VH * 0.42) / Math.max(VW, VH) * 1.9, horiz = rnd() < 0.5;
        s.s.push([X, Y, horiz ? X + G : X, horiz ? Y : Y + G, dl]);
      }
    },
    draw: function (t, a) {
      var s = this, i, q, tc = t * 1.5; c.lineWidth = 1.2; c.strokeStyle = rgba(COL, 0.3 * a); c.beginPath();
      for (i = 0; i < s.s.length; i++) { q = s.s[i]; if (q[4] < tc - 0.12) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); } }
      c.stroke(); c.strokeStyle = rgba(mixc(COL, WHITE, 0.6), 0.8 * a); c.beginPath();
      for (i = 0; i < s.s.length; i++) { q = s.s[i]; if (q[4] >= tc - 0.12 && q[4] < tc) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); } }
      c.stroke();
    }
  };

  // --- the frame
  var TRACK = 0.3;                                              // letter spacing of the name, in em
  function spaced(text, midX, y, fs, track, alphaOf, litOf) {  // a line of letters one by one (a light sweep and a stagger need them apart)
    var i, w = [], tw = 0;
    c.font = '700 ' + fs + 'px ' + DISPLAY;
    for (i = 0; i < text.length; i++) { w.push(c.measureText(text[i]).width); tw += w[i] + (i < text.length - 1 ? fs * track : 0); }
    var x = midX - tw / 2, k, xc;
    for (i = 0; i < text.length; i++) {
      xc = x + w[i] / 2; k = alphaOf(i, xc, tw);
      if (k > 0.001) { litOf(text[i], x, y, fs, k, xc); }
      x += w[i] + fs * track;
    }
    return tw;
  }
  function frame() {
    raf = 0;
    if (done || skipping || !c) return;
    try {
      if (O.state && O.state() === 'failed') { finish('app failed'); return; }
      var tn = now(), t = (tn - t0) / 1000, tt = tt0 + t * ttK, i, p, e, k, x, y, a;
      st.frames++;
      el.style.opacity = String(1 - sm(ramp(tt, 2.1, 2.6)));
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.fillStyle = '#090807'; c.fillRect(0, 0, VW, VH);
      glow(cx, cy, Math.max(VW, VH) * 0.7, COL, 0.2 * ramp(tt, 0, 0.9));
      if (mode !== 'lite' && scene) {
        c.save();
        if (st.scene === 'torches') { k = sm(ramp(tt, 0.7, 1.05)) * (1 - sm(ramp(tt, 1.9, 2.4))); c.translate((Math.random() - 0.5) * 5 * k, (Math.random() - 0.5) * 5 * k); }
        scene.draw(tt, sm(ramp(tt, 0, 0.55)));
        c.restore();
      }
      if (mode === 'full') cue('start', FL[2]);
      // the glyph: particles fly in, then the crisp glyph takes over
      if (parts) {
        c.globalCompositeOperation = 'lighter';
        for (i = 0; i < parts.length; i++) {
          p = parts[i]; k = ease(ramp(tt, p.dl, p.dl + 0.85)); a = (1 - k) * 0.55 + 0.45 - sm(ramp(tt, 1.2, 1.6)) * 0.65;
          x = p.sx + (cx + p.tx * glyphPx - p.sx) * k + Math.sin(p.ph + tt * 3) * (1 - k) * 36; y = p.sy + (cy + p.ty * glyphPx - p.sy) * k + Math.cos(p.ph + tt * 3) * (1 - k) * 36;
          c.fillStyle = rgba(mixc(COL, WHITE, 0.25 + 0.5 * (1 - k)), a * (0.35 + 0.65 * Math.abs(Math.sin(tt * 6 + p.ph)) * (k > 0.98 ? 1 : 0.6) + 0.15));
          c.fillRect(x, y, p.sz, p.sz);
        }
        c.globalCompositeOperation = 'source-over';
      }
      a = mode === 'full' ? sm(ramp(tt, 0.95, 1.45)) : 1;
      if (a > 0.001) {
        c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 ' + Math.round(glyphPx * 0.78) + 'px ' + DISPLAY;
        c.shadowColor = rgba(COL, 0.9); c.shadowBlur = 24 * a; c.fillStyle = rgba(mixc(COL, WHITE, 0.2), a);
        c.fillText(O.glyph || 'Ο', cx, cy + glyphPx * 0.03);
        c.restore();
      }
      // the name: letters one by one, a light sweep
      var fs = Math.min(30, VW * 0.84 / ((O.name || '').length * 0.95 + (O.name || '').length * TRACK)), name = String(O.name || 'OLYMPUS').toUpperCase(), ny = cy + glyphPx * 0.5 + 44;
      c.font = '700 ' + fs + 'px ' + DISPLAY;
      var sweep = ramp(tt, 1.25, 1.95), sweepX;
      // a dark pool under the words: no streak crosses them (FX)
      var pa = ramp(tt, 0.7, 1.1), pr = Math.min(VW * 0.62, 260);
      if (pa > 0.001) {
        c.save(); c.translate(VW / 2, ny + fs * 0.7); c.scale(1, 0.42);
        var pg = c.createRadialGradient(0, 0, 0, 0, 0, pr); pg.addColorStop(0, 'rgba(9,8,7,' + (0.78 * pa).toFixed(3) + ')'); pg.addColorStop(0.6, 'rgba(9,8,7,' + (0.5 * pa).toFixed(3) + ')'); pg.addColorStop(1, 'rgba(9,8,7,0)');
        c.fillStyle = pg; c.fillRect(-pr, -pr, pr * 2, pr * 2); c.restore();
      }
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 11px ' + DISPLAY; c.fillStyle = rgba(WHITE, 0.5 * ramp(tt, 0.6, 1.0)); c.fillText('OLYMPUS', VW / 2, ny - fs * 1.15);
      c.font = '700 ' + fs + 'px ' + DISPLAY;
      spaced(name, VW / 2, ny, fs, TRACK, function (i2, xc, tw) {
        sweepX = VW / 2 - tw / 2 - 70 + sweep * (tw + 140);
        return sm(ramp(tt, 0.95 + i2 * 0.045, 1.25 + i2 * 0.045));
      }, function (ch, x2, y2, fs2, k2, xc) {
        var b = sweep > 0 && sweep < 1 ? Math.exp(-Math.pow((xc - sweepX) / (fs2 * 2.2), 2)) : 0;
        c.globalAlpha = k2; c.fillStyle = rgba(mixc(COL, WHITE, Math.min(1, 0.1 + b * 0.9)), 1);
        c.shadowColor = rgba(COL, 0.8); c.shadowBlur = 8 + b * 16; c.fillText(ch, xc, y2 + (1 - k2) * 10); c.globalAlpha = 1; c.shadowBlur = 0;
      });
      c.restore();
      // the tagline, and a small hint
      k = sm(ramp(tt, 1.45, 1.95));
      if (k > 0.001) { c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = k * 0.8; c.fillStyle = rgba([243, 236, 224], 1); c.font = '600 14px ' + UI; c.fillText(FL[1].toUpperCase().split('').join(' '), VW / 2, ny + fs * 1.3); c.restore(); }
      if (mode === 'full') {
        k = sm(ramp(tt, 0.7, 1.2)) * (1 - sm(ramp(tt, 1.9, 2.2)));
        if (k > 0.001) { c.save(); c.textAlign = 'center'; c.globalAlpha = k * 0.3; c.fillStyle = '#faf7f1'; c.font = '600 10px ' + UI; c.fillText('T A P   T O   S K I P', VW / 2, VH - 28); c.restore(); }
      }
      if (tt > 0.95 && (mode !== 'full' || tt > 0.97)) cue('name', 'tick');
      if (t < LEN_S + 0.05) raf = requestAnimationFrame(frame); else finish('done');
    } catch (err) { fail(err); }
  }

  // --- start
  function start() {
    t0 = now();
    st.state = 'playing';
    addCss();
    el = d.createElement('div'); el.className = 'oly-intro'; el.setAttribute('aria-hidden', 'true');
    cv = d.createElement('canvas'); el.appendChild(cv);
    c = cv.getContext('2d');
    if (!c) { finish('failed'); return; }
    fit();
    d.body.appendChild(el);
    root.setAttribute('data-oly-intro', mode);
    try { if (d.fonts && d.fonts.load) d.fonts.load('700 30px "Iowan Old Style","Palatino Linotype",Palatino,Georgia'); } catch (e) { /* the fallback font draws */ }
    if (mode !== 'lite') { var S = SC[st.scene] || SC.stars; scene = Object.create(S); scene.init(); }
    if (mode !== 'lite') parts = makeParts();
    killT = setTimeout(function () { finish('deadline'); }, Math.round(LEN_S * 1000 + 900));
    el.addEventListener('pointerdown', skip);
    el.addEventListener('click', skip);
    W.addEventListener('pointerup', up, true); W.addEventListener('pointercancel', up, true); W.addEventListener('resize', onSize);
    d.addEventListener('keydown', onKey, true);
    d.addEventListener('visibilitychange', onVis);
    // A motion preference changed while the canvas runs must remove its invisible overlay and key capture.
    try {
      motionQuery = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
      if (motionQuery) {
        motionListener = function () { if (motionQuery.matches) finish('reduced motion'); };
        if (motionQuery.addEventListener) motionQuery.addEventListener('change', motionListener);
        else if (motionQuery.addListener) motionQuery.addListener(motionListener);
      }
    } catch (x) { /* motion preference observation is optional */ }
    if (O.reduced()) { finish('reduced motion'); return; }
    if (d.visibilityState && d.visibilityState !== 'visible') { finish('hidden'); return; }
    raf = requestAnimationFrame(frame);
  }
  try {
    if (d.body) start(); else d.addEventListener('DOMContentLoaded', function () { try { start(); } catch (e) { fail(e); } });
  } catch (e) { fail(e); }
}());
