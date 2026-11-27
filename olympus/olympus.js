/* OLYMPUS kit (tools/web_public/olympus/, 2026-11-03; docs/OLYMPUS_DESIGN.md): the small shared layer that makes the nine 3D
 * apps one product. A classic script, loaded in <head> BEFORE the app's modules:
 *   <script src="../olympus/themes.js?v=o11"></script>  (the OLYMPUS themes: optional, just before)
 *   <script src="../olympus/olympus.js?v=o28" data-app="mind"></script>
 * It never throws and every app still works when it is missing (each call site reads window.OLYMPUS defensively).
 *
 *   quality  ONE setting for every app and Jarvis: localStorage 'jfx' = ultra | high | low | off (Jarvis's own 3D-effects key,
 *            same origin). Not set: high, or low under prefers-reduced-motion. fx() / lite() / reduced() / dpr() / chosen() /
 *            setFx(level) (the app's HD/LITE button writes it, so Jarvis follows) / onFx(cb). An app's automatic LITE fallback
 *            (slow frames) is never stored: mode(lite) only marks the page.
 *   veil     the branded loading veil: the OLYMPUS seal + the app's name in its colour. ready() fades it (track(renderer) calls it
 *            on the first rendered frame); a script that fails to load, an uncaught error or fail(msg) before ready removes it
 *            and shows one line + Retry. It never takes taps and it lifts by itself after 12 s whatever happens.
 *   seat     opened alone (not framed by Jarvis) the seal sits in the orb's seat (bottom-right) and goes back to ../jarvis/.
 *   perf     track(renderer) keeps three.js's renderer for stats() (draw calls, triangles, geometries, textures, programs);
 *            hidden() is the tab-hidden test every frame loop uses (no frame while the tab is hidden: the iPhone's battery).
 *   power    (2026-11-04, docs/OLYMPUS_PERF.md) saver() = battery saver (the owner's 'olympus.saver' on/off, else auto: battery <= 20% and
 *            not charging, or the browser's Save-Data); setSaver('on'|'off'|'auto'); onPower(cb); idle() = no touch / key for 4 s;
 *            frameGap() = the minimum ms between frames the render core (and any loop that asks) should keep: 0 while the owner touches,
 *            33 (30 fps) when idle on high, 66 (15 fps) idle on low, 500 idle on off, 33 / 66 in battery saver; covered(true) = a sheet / overlay hides the
 *            scene: hidden() answers true (a parent can post { olympus: 'covered', on: true }); every frame loop that honours hidden() sleeps.
 *   ambient  (2026-11-04, docs/OLYMPUS_SFX.md) each app starts its own quiet sound bed after the first touch (the table AMBIENT below):
 *            ambient(name | '') to override, ambience(on) the owner's switch. Silent when muted, over Jarvis' voice, hidden, or in saver.
 *   theme    the OLYMPUS theme (themes.js, loaded just before this script; key 'olympus.theme'): theme() = the token object,
 *            onTheme(cb) = told (tokens) on every change (Jarvis's Look sheet, cross-tab or the frame around the app),
 *            tint(base, kind) = an app colour blended toward the theme's fog / sky / emissive / bloom, and
 *            themeScene({ scene, renderer, clear?, fog: [colours], emissive: [colours], bloom: [colours], redraw? }) = the one-line hook: the
 *            fog, the clear colour, the background and the listed THREE.Color objects follow the theme (their own colours are
 *            the base, so the default theme leaves every scene exactly as it was). The app's identity colour stays its accent,
 *            leaning toward the theme accent by the theme's 'harmony'; its own CSS tokens (APP_VARS) take the theme's glass.
 */
(function () {
  'use strict';
  if (window.OLYMPUS) return;
  var d = document, root = d.documentElement, me = d.currentScript;
  var KEY = 'jfx', LEVELS = ['ultra', 'high', 'low', 'off'];
  // the nine apps: name, glyph and colour exactly as Jarvis's switcher shows them (jarvis/apps.js BUILT_INS)
  var APPS = {
    brain: ['The Brain', 'Ψ', '#9d59ee'],
    warroom: ['War Room', '⚔', '#f1c14b'],
    widget: ['Widget', '▣', '#c8a24a'],
    why: ['Why', '?', '#c8a24a'],
    board: ['Board', '▤', '#c8a24a'],
    business: ['Money', '$', '#f1c14b'],
    trading: ['Trading', 'T', '#c8a24a'],
    agency: ['Websites', 'Ε', '#d08c4a'],
    polis: ['Polis', 'Πλ', '#e0b060'],
    herald: ['Herald', 'Η', '#c8a24a'],
    symposium: ['Symposium', 'Σ', '#d9b25a'],
    nq: ['NQ', 'Ν', '#c8a24a'],
    colosseum: ['Colosseum', 'C', '#c8a24a'],
    pinakes: ['Pinakes', 'Κ', '#c8a24a'],
    archive: ['Archive', 'B', '#c8a24a'],
    ergasterion: ['Ergasterion', 'E', '#c8a24a'],
    helios: ['Helios', 'S', '#c8a24a'],
    harmonia: ['Harmonia', 'H', '#c8a24a'],
    pheme: ['Pheme', 'Ξ', '#c8a24a'],
    compass: ['Compass', 'C', '#c8a24a'],
    kairos: ['Kairos', 'K', '#c8a24a'],
    mint: ['Mint', 'M', '#c8a24a'], mintcity: ['Mint City', 'MC', '#c8a24a'], mercury: ['Mercury', '☿', '#c8a24a'], chrysos: ['Chrysos', 'X', '#c8a24a'], sibyl: ['Sibyl', 'Σ', '#c8a24a'], oikos: ['Oikos', 'O', '#c8a24a'], arbiter: ['Arbiter', 'Ξ', '#c8a24a'], stoa: ['Stoa', 'Σ', '#c8a24a'], aegis: ['Aegis', 'A', '#c8a24a'], lyceum: ['Lyceum', 'Σ', '#c8a24a'], nike: ['Nike', 'Ν', '#c8a24a'], kronos: ['Kronos', 'K', '#c8a24a'], moirai: ['Moirai', 'M', '#c8a24a'], epilogue: ['Epilogue', 'Ω', '#c8a24a'], argo: ['Argo', 'Α', '#4b7a99'], kratos: ['Kratos', 'K', '#c8a24a'], pythia: ['Pythia', 'Ψ', '#e0b060'], gallery: ['Agora Gallery', 'Γ', '#c8a24a'],
    datacity: ['Data City', 'Δ', '#5f8ea6'], mind: ['Mind', 'Ω', '#d9b8a8'], tree: ['Daphne', 'Ψ', '#6b9068'],
    oracle: ['Oracle', 'Θ', '#7fb0a3'], odeon: ['Odeon', 'Ξ', '#d77a7a'], fates: ['Fates', 'Φ', '#ffcf5a'],
    hermes: ['Hermes', 'Η', '#f7c948'], prometheus: ['Prometheus', 'Π', '#ff7a1a'], tyche: ['Tyche', 'Τ', '#cf8f7a'],
    pantheon: ['Pantheon', 'Σ', '#f2d68a'], arena: ['Arena', 'Α', '#ffb547'],
    ares: ['Ares', 'Λ', '#c8402e'], plutus: ['Plutus', 'Ρ', '#a9b84f'], athena: ['Athena', '🦉', '#7f8a52'],
    cities: ['Data City', '◈', '#b88a50'], settings: ['Settings', '⚙', '#a39883'], inbox: ['Inbox', '✉', '#9aa3a8'], ledger: ['Ledger', 'L', '#c2b280'], planner: ['Planner', 'Π', '#7fa7c2'], delphi: ['Delphi', 'Φ', '#e0b060'], pnyx: ['Pnyx', 'Π', '#c8a24a'], hestia: ['Hestia', 'Η', '#c8a24a'], demeter: ['Demeter', 'Δ', '#9aa564'], apollo: ['Apollo', 'Α', '#e0b060'], hera: ['Hera', 'Ω', '#c96a4a'], dionysus: ['Dionysus', 'Σ', '#b77a8a'], clio: ['Clio', 'Κ', '#d8c9a8'], journal: ['Mnemosyne', 'Μ', '#e08a6b'], kalshicity: ['Kalshi City', 'K', '#b5a642'], forum: ['Forum', 'Γ', '#8f9f3c'], labyrinth: ['Labyrinth', 'Ξ', '#a8765a'], argus: ['Argus', 'Α', '#3f8a8a'], nemesis: ['Nemesis', 'Ν', '#b55c66'], chronos: ['Chronos', 'Χ', '#d4a574'], hephaestus: ['Hephaestus', '⚒', '#c7773f'],
    bridge: ['Bridge', 'Β', '#8c7a5a'], observatory: ['Observatory', '◉', '#a9bfd0'], atlas: ['Atlas', '◈', '#efc979'],
  };
  // each app's own CSS tokens -> the theme token they take under any theme but the default (bg = the app's own page colour
  // blended toward the theme's by its 'mix', so every app keeps a trace of its own sky)
  var APP_VARS = {
    datacity: { '--bg': 'bg', '--panel': 'glass', '--line': 'line', '--text': 'text', '--sub': 'dim' },
    mind: { '--bg': 'bg', '--glass': 'glass', '--glass-hi': 'glass2', '--line': 'line', '--text': 'text', '--mut': 'dim' },
    tree: { '--bg': 'bg', '--panel': 'glass', '--line': 'line' },
    oracle: { '--bg': 'bg', '--glass': 'glass', '--line': 'line', '--text': 'text', '--dim': 'dim' },
    odeon: { '--bg': 'bg', '--panel': 'glass', '--panel2': 'glass2', '--line': 'line', '--text': 'text', '--dim': 'dim' },
    fates: { '--bg': 'bg', '--panel': 'glass', '--line': 'line', '--txt': 'text', '--mut': 'dim' },
    hermes: { '--bg': 'bg', '--line': 'line', '--text': 'text', '--text2': 'dim' },
    prometheus: { '--bg': 'bg', '--bg2': 'bg', '--panel': 'glass', '--line': 'line', '--text': 'text', '--dim': 'dim' },
    tyche: { '--bg': 'bg', '--glass': 'glass', '--line': 'line', '--text': 'text', '--dim': 'dim' },
  };
  var id = (me && me.getAttribute('data-app')) || '', info = APPS[id] || [id || 'OLYMPUS', 'Ο', '#c8a24a'];
  var TH = window.OLYMPUS_THEMES || null, own = info[2];
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: this visit only */ } };
  var mq = function (q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  var framed = (function () { try { return window.top !== window; } catch (e) { return true; } })();
  var stored = function () { var v = get(KEY); return LEVELS.indexOf(v) >= 0 ? v : null; };
  // LITE auto-detection (QA round 6, 2026-11-11): a low-end device or a data-saving line starts on low when the owner has not picked a
  // level (never stored, so the owner's choice always wins). Signals: Save-Data, prefers-reduced-data, a 2g line, deviceMemory <= 2 GB,
  // <= 4 GB with <= 4 cores, or <= 2 cores off Apple (iOS Safari reports no memory and a capped core count, so cores alone never flip an iPhone).
  function lowEnd() {
    try {
      var n = navigator, c = n.connection || {}, dm = +n.deviceMemory || 0, hc = +n.hardwareConcurrency || 0;
      var apple = /iP(hone|ad|od)|Macintosh/.test(n.userAgent || '') && !/Chrome|Android/.test(n.userAgent || '');
      if (c.saveData === true) return 'save-data';
      if (mq('(prefers-reduced-data: reduce)')) return 'reduced-data';
      if (/(^|-)2g$/.test(String(c.effectiveType || ''))) return 'slow-line';
      if (dm && dm <= 2) return 'memory';
      if (dm && dm <= 4 && hc && hc <= 4) return 'memory+cores';
      if (!apple && hc && hc <= 2) return 'cores';
    } catch (e) { /* no signal: the default */ }
    return '';
  }
  var autoWhy = lowEnd();
  var fallback = function () { return mq('(prefers-reduced-motion: reduce)') || autoWhy ? 'low' : 'high'; };
  var level = stored() || fallback();
  if (!stored() && autoWhy) root.setAttribute('data-oly-auto', autoWhy);
  var subs = [], renderer = null, frames = 0, state = 'loading', veil = null, err = null, timer = 0;

  root.setAttribute('data-fx', level);
  root.setAttribute('data-oly', id);
  if (framed) root.classList.add('framed');
  var hexRgb = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(', '); };
  // the app's own page colour (its theme-color meta = its --bg): the base the theme's sky is blended into
  var ownBg = (function () { var m = d.querySelector('meta[name="theme-color"]'); return (m && m.getAttribute('content')) || '#14110e'; })();
  function accent(t) {
    info[2] = TH && t ? TH.harmonise(own, t.accent, t.harmony) : own;
    // AGORA (the default): an app's identity colour is warmed toward gold so no kit-level accent is neon (the app's own CSS keeps its colour)
    if (TH && TH.mix && (!t || t.id === TH.DEFAULT)) info[2] = TH.mix(info[2], '#c8a24a', .42);
    root.style.setProperty('--oly-accent', info[2]);
    root.style.setProperty('--oly-accent-rgb', hexRgb(info[2]));
  }
  function appVars(t) {
    var map = APP_VARS[id], out = {}, bg = TH.mix(ownBg, t.bg, t.mix);
    if (map) for (var k in map) out[k] = map[k] === 'bg' ? bg : t[map[k]];
    return out;
  }
  var rootStyle0 = root.getAttribute('style') || '';          // before any theme paints (restoreRoot)
  // where: a page checked in light (<html data-oly-light>, its sheets tokenized: the Gate, NQ, Helios, Polis) takes the full palette, a light
  // theme light; every other app the 'stage' palette (a light theme's dark variant), so a sheet with dark literals of its own stays readable
  var where = root.hasAttribute('data-oly-light') ? 'page' : 'stage';
  var theme = TH ? TH.apply(where, { meta: function (t) { return where === 'page' || !APP_VARS[id] ? t.themeColor : TH.mix(ownBg, t.bg, t.mix); }, extra: appVars }) : null;
  accent(theme);

  function emit() { for (var i = 0; i < subs.length; i++) { try { subs[i](level); } catch (e) { /* one listener never stops the rest */ } } }
  var themeSubs = [], appSubs = [];
  // the apps' own hooks (onTheme / theme()) never see the default theme: on the default (AGORA) every app keeps its own look.
  // Coming back to the default, the inline CSS variables an app painted are put back as they were before any theme.
  var isDefault = function (t) { return !t || t.id === (TH && TH.DEFAULT ? TH.DEFAULT : 'agora'); };
  function restoreRoot() {
    var keep = {}, names = ['--oly-accent', '--oly-accent-rgb'];
    for (var i = 0; i < names.length; i++) keep[names[i]] = root.style.getPropertyValue(names[i]);
    root.setAttribute('style', rootStyle0);
    for (var k in keep) if (keep[k]) root.style.setProperty(k, keep[k]);
  }
  // a THREE.Color-like object (getHex / setHex) keeps its own colour as the base; the theme blends it by its 'mix'
  function tint(base, kind) { return TH && theme ? TH.mix(base, theme[kind || 'fog'], theme.mix) : base; }
  function sceneHook(o) {
    var list = [], add = function (c, kind) { if (c && typeof c.getHex === 'function') list.push([c, c.getHex(), kind]); };
    var sc = o.scene, r = o.renderer, clear = null, alpha = 1;
    if (sc && sc.fog) add(sc.fog.color, 'fog');
    if (sc && sc.background && sc.background.isColor) add(sc.background, 'fog');
    if (typeof o.clear === 'number') { clear = o.clear; try { alpha = r.getClearAlpha(); } catch (e) { alpha = 1; } }
    else if (r && typeof r.getClearColor === 'function' && sc && sc.fog) {
      try { clear = r.getClearColor(sc.fog.color.clone()).getHex(); alpha = r.getClearAlpha(); } catch (e) { clear = null; }
    }
    var kinds = ['fog', 'emissive', 'bloom', 'sky'];
    for (var i = 0; i < kinds.length; i++) { var a = o[kinds[i]]; if (a) for (var j = 0; j < a.length; j++) add(a[j], kinds[i]); }
    function paint() {
      for (var i = 0; i < list.length; i++) list[i][0].setHex(tint(list[i][1], list[i][2]));
      if (clear !== null && alpha > 0) r.setClearColor(tint(clear, 'fog'), alpha);
    }
    paint();
    themeSubs.push(function () { paint(); if (typeof o.redraw === 'function') o.redraw(); });
    return paint;
  }

  // ---------------------------------------------------------------- power: battery saver, idle frame cap, covered
  var SAVER_KEY = 'olympus.saver', IDLE_MS = 4000;
  var lastInput = performance.now(), covered = false, saverAuto = false, powerSubs = [];
  function saverNow() { var v = get(SAVER_KEY); return v === 'on' ? true : v === 'off' ? false : saverAuto; }
  function powerChanged() {
    root.setAttribute('data-oly-saver', saverNow() ? '1' : '0');
    for (var i = 0; i < powerSubs.length; i++) { try { powerSubs[i](saverNow()); } catch (e) { /* one listener never stops the rest */ } }
    ambApply();
  }
  (function () {
    var touch = function () { lastInput = performance.now(); };
    ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(function (e) { window.addEventListener(e, touch, { passive: true, capture: true }); });
    var conn = navigator.connection;
    var read = function (b) { saverAuto = !!((b && !b.charging && b.level <= 0.2) || (conn && conn.saveData === true)); powerChanged(); };
    try {
      if (navigator.getBattery) navigator.getBattery().then(function (b) {
        ['levelchange', 'chargingchange'].forEach(function (e) { b.addEventListener(e, function () { read(b); }); }); read(b);
      }).catch(function () { read(null); });
      else read(null);
    } catch (e) { /* no battery API (Safari): Save-Data and the owner's switch only */ }
    window.addEventListener('storage', function (e) { if (e && e.key === SAVER_KEY) powerChanged(); });   // Jarvis's Battery saver switch, from another frame
    window.addEventListener('message', function (e) {          // a sheet / overlay in the parent (Jarvis) covers this scene
      try { if (e.origin === location.origin && e.data && e.data.olympus === 'covered') O.covered(!!e.data.on); } catch (x) { /* nothing */ }
    });
  })();

  // ---------------------------------------------------------------- ambience: each app's own quiet bed (olympus/sfx.js, synthesised)
  var AMBIENT = { brain: 'chimes', warroom: 'chimes', widget: 'scroll', why: 'scroll', board: 'scroll', business: 'coins', trading: 'chimes', agency: 'agora', polis: 'agora', herald: 'scroll', symposium: 'chimes', nq: 'chimes', colosseum: 'chimes', pinakes: 'scroll', archive: 'chimes', ergasterion: 'chimes', helios: 'chimes', harmonia: 'coins', pheme: 'chimes', compass: 'chimes', kairos: 'chimes', mint: 'coins', mintcity: 'coins', mercury: 'coins', chrysos: 'coins', sibyl: 'chimes', oikos: 'coins', arbiter: 'coins', stoa: 'chimes', aegis: 'chimes', lyceum: 'chimes', nike: 'chimes', kronos: 'chimes', moirai: 'chimes', epilogue: 'chimes', argo: 'sea', kratos: 'chimes', pythia: 'chimes', gallery: 'chimes', delphi: 'chimes', pnyx: 'coins', observatory: 'space', atlas: 'chimes', hestia: 'smithy', demeter: 'breeze', apollo: 'chimes', hera: 'coins', dionysus: 'sea', clio: 'scroll', journal: 'scroll', datacity: 'city', cities: 'city', kalshicity: 'city', kalshi: 'city', oracle: 'space', mind: 'space', argus: 'space', chronos: 'chimes',
    odeon: 'crowd', arena: 'crowd', forum: 'agora', ares: 'crowd', fates: 'lab', plutus: 'coins', ledger: 'coins', labyrinth: 'lab', pantheon: 'wind', athena: 'scroll',
    hermes: 'breeze', nemesis: 'wind', bridge: 'wind', prometheus: 'smithy', hephaestus: 'smithy', tyche: 'sea', tree: 'forest', zenith: 'space', inbox: 'scroll',
    settings: 'lab', planner: 'chimes' };       // 2026-11-04: every app has a bed of its own (forge hammer-and-hiss, scroll rustle, coin chime, forum murmur, lab hum)
  var ambName = AMBIENT[id] || '', ambTimer = 0, ambLoading = false, ambStarted = false;
  var quiet = function () { try { return !!(window.OLYMPUS_QUIET && window.OLYMPUS_QUIET()) || !!(framed && window.parent.OLYMPUS_QUIET && window.parent.OLYMPUS_QUIET()); } catch (e) { return false; } };
  function ambKit(cb) {
    var k = window.OLYMPUS_SFX;
    if (k) { cb(k); return; }
    if (!me || !me.src) return;
    if (ambLoading) { var t2 = 0, w2 = function () { if (window.OLYMPUS_SFX) cb(window.OLYMPUS_SFX); else if (++t2 < 12) setTimeout(w2, 500); }; w2(); return; }
    ambLoading = true;
    var tries = 0, wait = function () { if (window.OLYMPUS_SFX) { cb(window.OLYMPUS_SFX); } else if (++tries < 12) setTimeout(wait, 500); };
    if (!d.getElementById('olySfxJs')) {
      var sc = d.createElement('script'); sc.id = 'olySfxJs'; sc.async = true; sc.src = me.src.replace(/olympus\.js.*$/, 'sfx.js?v=s4'); sc.onerror = function () { ambLoading = false; };
      (d.head || root).appendChild(sc);
    }
    wait();
  }
  function ambApply() {
    try {
      if (!ambName || level === 'off') { if (window.OLYMPUS_SFX && window.OLYMPUS_SFX.ambientStop && ambStarted) window.OLYMPUS_SFX.ambientStop(); return; }
      ambKit(function (k) {
        if (!k.ambient) return;                                  // an older sfx.js: no beds
        ambStarted = true;
        k.ambient(quiet() ? '' : ambName);
        if (!ambTimer) ambTimer = setInterval(function () {      // Jarvis talking or listening: the bed steps aside, then comes back
          try { if (window.OLYMPUS_SFX) window.OLYMPUS_SFX.ambient(quiet() ? '' : ambName); } catch (e) { /* nothing */ }
        }, 3000);
      });
    } catch (e) { /* the bed is never needed */ }
  }
  // dogfood 2026-11-20: the pages no longer carry their own <script src="../olympus/sfx.js" defer> (31 KB gz fetched during the first paint
  // on a phone line, for a sound engine that stays silent until the first tap anyway): the kit loads it here, after load, when the phone
  // is idle (2 s cap), so OLYMPUS.cue(...) and the beds work as before; the first tap still unlocks the audio (sfx.js is there by then).
  fxOnLoad(function () {
    var go = function () { try { if (!window.OLYMPUS_SFX && level !== 'off') ambKit(function () {}); } catch (e) { /* no sound */ } setTimeout(ambApply, 50); };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 400);
  });
  function fxOnLoad(fn) { if (d.readyState === 'complete') fn(); else window.addEventListener('load', fn); }

  // ---------------------------------------------------------------- WebGL guard (QA round 6, 2026-11-11: the real-phone pass)
  // iOS drops WebGL contexts under memory pressure (and when too many are alive). A lost canvas is blank: the page would show a black
  // hole where the hero was. Every WebGL canvas made on a kit page gets this guard on its first getContext (no app edit): on loss an overlay
  // over the canvas shows its last still (track() takes one small JPEG of a settled frame) or the AGORA dusk backdrop, html gets data-oly-gl="lost", and the
  // loss is marked restorable (preventDefault); on restore the still goes and data-oly-gl="ok". Apps / the render core rebuild their GPU state.
  var glList = [], BACKDROP = 'radial-gradient(120% 75% at 50% 32%, #4a3b28 0%, #2a2219 46%, #14110e 100%)';
  function glState() {
    var lost = 0; for (var i = 0; i < glList.length; i++) if (glList[i].lost && glList[i].cv.isConnected) lost++;
    root.setAttribute('data-oly-gl', lost ? 'lost' : 'ok');
  }
  function glGuard(cv) {
    if (cv.__olyGuard) return cv.__olyGuard;
    var g = { cv: cv, lost: false, still: '', ov: null, vis: undefined,
      snap: function () {                                 // a ~1/3 size JPEG of what is on the canvas now (call right after a draw to the screen)
        try {
          var w = cv.width, h = cv.height, k = Math.min(1, 360 / Math.max(1, w)), c = d.createElement('canvas');
          if (!w || !h) return '';
          c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
          c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
          g.still = c.toDataURL('image/jpeg', 0.72);
          c.width = c.height = 0;
        } catch (e) { g.still = ''; }
        return g.still;
      } };
    cv.__olyGuard = g; glList.push(g);
    // the still sits OVER the canvas (an overlay of the canvas's own box, no taps): a lost canvas is not always see-through (Chromium paints
    // its own placeholder), so a background under it would not show
    function cover() {
      if (!cv.isConnected || !cv.parentNode || !cv.getClientRects().length) return;      // not on screen (display:none): nothing to cover
      // right after the canvas in the page, with the canvas's own stacking (z-index): it sits exactly where the canvas was and never over
      // the page's own text and buttons above it
      var o = g.ov || (g.ov = d.createElement('div')), cs = getComputedStyle(cv), fixed = cs.position === 'fixed' || !cv.offsetParent, st = o.style;
      o.className = 'oly-gl-still'; o.setAttribute('aria-hidden', 'true');
      st.cssText = 'position:' + (fixed ? 'fixed' : 'absolute') + ';pointer-events:none;margin:0;background-color:#14110e;background-size:cover;background-position:center;';
      st.zIndex = cs.zIndex; st.borderRadius = cs.borderRadius;
      st.backgroundImage = (g.still ? 'url("' + g.still + '"), ' : '') + BACKDROP;
      if (fixed) { var r = cv.getBoundingClientRect(); st.left = r.left + 'px'; st.top = r.top + 'px'; st.width = r.width + 'px'; st.height = r.height + 'px'; }
      else { st.left = cv.offsetLeft + 'px'; st.top = cv.offsetTop + 'px'; st.width = cv.offsetWidth + 'px'; st.height = cv.offsetHeight + 'px'; }
      if (o.previousSibling !== cv) cv.parentNode.insertBefore(o, cv.nextSibling);
      g.vis = cv.style.visibility; cv.style.visibility = 'hidden';
    }
    cv.addEventListener('webglcontextlost', function (e) {
      try { e.preventDefault(); } catch (x) { /* nothing */ }         // ask the browser to give it back
      g.lost = true;
      try { cover(); } catch (x) { /* the backdrop is never needed */ }
      glState();
    }, false);
    cv.addEventListener('webglcontextrestored', function () {
      g.lost = false;
      if (g.ov && g.ov.parentNode) g.ov.parentNode.removeChild(g.ov);
      if (g.vis !== undefined) { cv.style.visibility = g.vis; g.vis = undefined; }
      glState();
    }, false);
    return g;
  }
  (function () {                                          // every WebGL context on a kit page gets the guard
    try {
      var P = window.HTMLCanvasElement && HTMLCanvasElement.prototype, gc = P && P.getContext;
      if (!gc || gc.__oly) return;
      var wrap = function (kind) {
        var c = gc.apply(this, arguments);
        try { if (c && /^(webgl2?|experimental-webgl)$/.test(String(kind)) && !this.__olyGuard) glGuard(this); } catch (e) { /* never in the way */ }
        return c;
      };
      wrap.__oly = true;
      P.getContext = wrap;
    } catch (e) { /* an old browser: no guard */ }
  })();

  var O = {
    KEY: KEY, app: id, name: info[0], glyph: info[1], color: info[2], framed: framed,
    /** 'ultra' | 'high' | 'low' | 'off' */
    fx: function () { return level; },
    /** true when the owner picked a level (in Jarvis or in any app): the apps' automatic LITE then stays out of the way */
    chosen: function () { return stored() !== null; },
    /** low or off: the light look (fewer particles, no antialias, smaller buffer) */
    lite: function () { return level === 'low' || level === 'off'; },
    /** no camera drift, no auto-play: prefers-reduced-motion, or 3D effects off */
    reduced: function () { return level === 'off' || mq('(prefers-reduced-motion: reduce)'); },
    /** the device pixel ratio to render at: never above 2, 1.5 on the light look, 1 when off */
    dpr: function (lite) {
      var r = window.devicePixelRatio || 1, l = lite === undefined ? O.lite() : !!lite;
      return Math.min(r, level === 'off' ? 1 : l ? 1.5 : 2);
    },
    /** the owner's choice from an app's HD / LITE button: stored for Jarvis and every app */
    setFx: function (v) {
      if (LEVELS.indexOf(v) < 0) return level;
      level = v; set(KEY, v); root.setAttribute('data-fx', v); emit(); return v;
    },
    onFx: function (cb) { if (typeof cb === 'function') subs.push(cb); },
    /** the app's effective look (its auto-LITE included): marks <html data-oly-lite> for the tests and the CSS */
    mode: function (lite) { root.setAttribute('data-oly-lite', lite ? '1' : '0'); },
    hidden: function () { return d.hidden === true || d.visibilityState === 'hidden' || covered; },
    saver: function () { return saverNow(); },
    setSaver: function (v) { set(SAVER_KEY, v === 'on' || v === 'off' ? v : ''); powerChanged(); return saverNow(); },
    onPower: function (cb) { if (typeof cb === 'function') powerSubs.push(cb); },
    idle: function () { return performance.now() - lastInput > IDLE_MS; },
    frameGap: function () {
      var idle = performance.now() - lastInput > IDLE_MS;
      if (level === 'off') return idle ? 500 : 0;           // 3D effects Off = static: an idle scene redraws twice a second at most (a touch = full rate)
      if (saverNow()) return idle ? 66 : 33;
      return idle ? (level === 'low' ? 66 : 33) : 0;
    },
    covered: function (on) {
      if (on === undefined) return covered;
      on = !!on; if (on === covered) return on;
      covered = on; root.setAttribute('data-oly-covered', on ? '1' : '0');
      try { d.dispatchEvent(new Event('visibilitychange')); } catch (e) { /* loops that wake on it */ }
      return on;
    },
    ambient: function (name) { ambName = name === undefined ? AMBIENT[id] || '' : String(name || ''); ambApply(); return ambName; },
    ambience: function (on) { var k = window.OLYMPUS_SFX; try { return k && k.ambience ? k.ambience(on) : false; } catch (e) { return false; } },
    /** the kit's Sound switch: sound(true | false | null) (the owner's choice, null = automatic: silent in LITE / reduced motion / saver); sound() = may beds and UI cues sound now */
    sound: function (on) { var k = window.OLYMPUS_SFX; try { return k && k.sound ? k.sound(on) : false; } catch (e) { return false; } },
    /** a UI cue: cue('open' | 'close' | 'success' | 'warning' | 'tap'); silent before the first tap, when muted, and in LITE / reduced motion unless Sound is on */
    cue: function (name) { var k = window.OLYMPUS_SFX; try { return k ? k.play(name) : false; } catch (e) { return false; } },
    track: function (r) {
      if (!r || typeof r.render !== 'function' || r.__oly) return r;
      renderer = r; r.__oly = true;
      var draw = r.render, cv = r.domElement, g = cv ? glGuard(cv) : null, t0 = 0, shots = 0;
      r.render = function () {
        var out = draw.apply(r, arguments); frames++; if (state === 'loading') ready();
        // the context-loss still: a small JPEG of a finished frame (a draw to the screen), 1.5 s after the first frame and once more at 8 s
        // when the scene has settled (two encodes in the page's life, ~360 px wide)
        if (g && shots < 2) {
          var now = performance.now(); if (!t0) t0 = now;
          if (now - t0 > (shots ? 8000 : 1500)) { try { if (!r.getRenderTarget || r.getRenderTarget() === null) { g.snap(); shots++; } } catch (e) { shots = 2; /* no still: the backdrop */ } }
        }
        return out;
      };
      return r;
    },
    /** guard(canvas): context loss never leaves a black page (every WebGL canvas on a kit page gets it on its first getContext) */
    glGuard: function (cv) { return cv ? glGuard(cv) : null; },
    /** the WebGL contexts this page made: { made, live (not lost, still in the page), lost } */
    gl: function () {
      var live = 0, lost = 0;
      for (var i = 0; i < glList.length; i++) { var x = glList[i]; if (x.lost) lost++; else if (x.cv.isConnected) live++; }
      return { made: glList.length, live: live, lost: lost };
    },
    /** why the kit started on low by itself ('save-data' | 'reduced-data' | 'slow-line' | 'memory' | 'memory+cores' | 'cores'), '' when it did not */
    auto: function () { return stored() ? '' : autoWhy; },
    stats: function () {
      var i = renderer && renderer.info;
      if (!i) return { frames: frames, three: false };
      return { frames: frames, three: true, power: { saver: saverNow(), idle: performance.now() - lastInput > IDLE_MS, covered: covered }, calls: i.render.calls, triangles: i.render.triangles, points: i.render.points,
        lines: i.render.lines, geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length,
        pixelRatio: renderer.getPixelRatio ? renderer.getPixelRatio() : null };
    },
    /** the theme's tokens ({ id, name, bg, glass, line, text, dim, accent, glow, fog, sky, emissive, bloom, mix, harmony, ... }) */
    theme: function () { return isDefault(theme) ? null : theme; },
    /** cb(tokens) after every theme change (not at start: read theme() for that); cb(null) when back on the default */
    onTheme: function (cb) { if (typeof cb === 'function') appSubs.push(cb); },
    /** play a sound of the OLYMPUS kit (tick | tap | portal | thunder | rankup | pad): loads olympus/sfx.js on the first call, never throws,
     *  does nothing when the file is missing or the host (Jarvis) says it is talking or listening (window.OLYMPUS_QUIET). Returns true if it sounded. */
    sfx: function (name) {
      try {
        if (window.OLYMPUS_QUIET && window.OLYMPUS_QUIET()) return false;
        var k = window.OLYMPUS_SFX;
        if (k) return !!k.play(name);
        if (me && me.src && !d.getElementById('olySfxJs')) {
          var s = d.createElement('script'); s.id = 'olySfxJs'; s.async = true; s.src = me.src.replace(/olympus\.js.*$/, 'sfx.js?v=s4');
          (d.head || root).appendChild(s);
        }
      } catch (e) { /* the sound is never needed */ }
      return false;
    },
    tint: tint,
    themeScene: function (o) { try { return sceneHook(o || {}); } catch (e) { return null; } },
    ready: function () { ready(); },
    fail: function (msg) { fail(msg); },
    state: function () { return state; },
  };
  window.OLYMPUS = O;

  // ---------------------------------------------------------------- effects wiring (docs/OLYMPUS_FX.md): data-oly-fx="shimmer|glow|ripple|tilt|odometer|..."
  // Any element that carries data-oly-fx gets the effect with ZERO edits in the app: shimmer / glow / ripple are styled by olympus.css
  // alone; the ones that need script (ripple's origin, tilt, odometer, ...) load olympus/fx-core.js + the file that holds them on the
  // first use (never on a page that has no data-oly-fx), and follow the tier (OLYMPUS.fx()) and prefers-reduced-motion.
  // Opt out: data-oly-fx-off on the element or any ancestor, <html data-oly-fx-ui="off">, or OLYMPUS.fxUI(false).
  var FXMAP = { press: 'ui', stagger: 'ui', goldFlash: 'text', tilt: 'ui', magnetic: 'ui', ripple: 'ui', gradientBorder: 'ui', glassSpecular: 'ui', neonPulse: 'ui', skeleton: 'ui',
    odometer: 'text', countUp: 'text', typewriter: 'text', glitch: 'text', progressRing: 'text' };
  var fxBase = me && me.src ? me.src.replace(/olympus\.js.*$/, '') : '', fxFiles = {}, fxTimer = 0, fxObs = null;
  function fxUiOff() { return root.getAttribute('data-oly-fx-ui') === 'off' || (d.querySelector && !!d.querySelector('meta[name="olympus-fx-ui"][content="off"]')); }
  function fxFile(name, cb) {
    var f = fxFiles[name];
    if (f) { if (f.done) cb(); else f.cbs.push(cb); return; }
    f = fxFiles[name] = { done: false, cbs: [cb] };
    function end() { f.done = true; for (var i = 0; i < f.cbs.length; i++) { try { f.cbs[i](); } catch (e) { /* nothing */ } } f.cbs = []; }
    if (name === 'core' && window.OLYMPUS_FX) { end(); return; }
    if (name !== 'core' && window.OLYMPUS_FX && window.OLYMPUS_FX.has(name === 'ui' ? 'tilt' : 'odometer')) { end(); return; }
    var s = d.createElement('script'); s.async = true; s.src = fxBase + 'fx-' + name + '.js?v=f1';
    s.onload = end; s.onerror = end;
    (d.head || root).appendChild(s);
  }
  function fxScan() {
    fxTimer = 0;
    if (!d.body || fxUiOff() || O.fx() === 'off' || O.reduced()) return;
    var els = d.querySelectorAll('[data-oly-fx]'), need = {}, any = false, i, j, t;
    for (i = 0; i < els.length; i++) {
      if (els[i].closest && els[i].closest('[data-oly-fx-off]')) continue;
      t = (els[i].getAttribute('data-oly-fx') || '').split(/\s+/);
      for (j = 0; j < t.length; j++) if (FXMAP[t[j]]) { need[FXMAP[t[j]]] = 1; any = true; }
    }
    if (!any) { if (window.OLYMPUS_FX) window.OLYMPUS_FX.attach(); return; }
    fxFile('core', function () {
      var kinds = Object.keys(need), left = kinds.length;
      for (var k = 0; k < kinds.length; k++) fxFile(kinds[k], function () { if (--left === 0 && window.OLYMPUS_FX) window.OLYMPUS_FX.attach(); });
    });
  }
  function fxSoon() { if (!fxTimer) fxTimer = setTimeout(fxScan, 80); }
  function fxWatch() {
    if (fxObs || !window.MutationObserver || !d.body) return;
    fxObs = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'attributes') { fxSoon(); return; }
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType === 1 && (n.hasAttribute('data-oly-fx') || n.querySelector('[data-oly-fx]'))) { fxSoon(); return; }
        }
        if (window.OLYMPUS_FX) for (j = 0; j < r.removedNodes.length; j++) {          // a wired element left the page: stop its effect
          var x = r.removedNodes[j];
          if (x.nodeType === 1 && (x.hasAttribute('data-oly-fx') || x.querySelector('[data-oly-fx]'))) { fxSoon(); return; }
        }
      }
    });
    fxObs.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-oly-fx', 'data-oly-fx-off'] });
  }
  /** the page-wide switch for the data-oly-fx wiring (false = off for this page; the CSS-only effects follow <html data-oly-fx-ui>) */
  O.fxUI = function (on) {
    if (on === false) root.setAttribute('data-oly-fx-ui', 'off'); else root.removeAttribute('data-oly-fx-ui');
    if (window.OLYMPUS_FX) window.OLYMPUS_FX.ui(on !== false); else if (on !== false) fxSoon();
    return on !== false;
  };
  subs.push(function () { fxSoon(); });                      // the tier came back from off: wire what the page carries
  function fxBoot() { fxScan(); fxWatch(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fxBoot); else fxBoot();

  // ---------------------------------------------------------------- the veil
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function seal() {
    var s = el('span', 'oly-seal'); s.setAttribute('aria-hidden', 'true'); s.textContent = info[1]; return s;
  }
  function mount() {
    if (!d.body) return;
    if (state === 'loading' && !veil) {
      veil = el('div', 'oly-veil');
      veil.setAttribute('role', 'status'); veil.setAttribute('aria-live', 'polite');
      var box = el('div', 'oly-veil-box');
      box.appendChild(seal());
      var t = el('p', 'oly-veil-name'); t.appendChild(el('span', 'oly-veil-pre', 'OLYMPUS')); t.appendChild(el('b', '', info[0]));
      box.appendChild(t);
      box.appendChild(el('i', 'oly-veil-bar'));
      veil.appendChild(box);
      d.body.appendChild(veil);
      // day-arenas DESIGN 2026-11-20 (PERF: layout shift 0.3-0.85 on a phone line while the cards fill under the veil): the page's content
      // is laid out but NOT drawn (visibility, not display) until the veil lifts, so a card that grows as its data arrives cannot count as a
      // shift; the header stays. Nothing changes for the owner: the veil covers the page in that time anyway. lift() (ready, or the 12 s
      // fallback) shows it.
      root.setAttribute('data-oly-veil', '1');
      if (!d.getElementById('olyVeilHide')) { var vs = el('style'); vs.id = 'olyVeilHide'; vs.textContent = 'html[data-oly-veil] main#app > :not(header.top){visibility:hidden}'; (d.head || d.body).appendChild(vs); }
    }
    if (!framed && id && !d.querySelector('.oly-home')) {
      var a = el('a', 'oly-home'); a.href = me && me.src ? new URL('../jarvis/', me.src).href : '../jarvis/';   // from the kit's own URL: right at any folder depth (agency/offers/) a.setAttribute('aria-label', 'Back to Jarvis'); a.title = 'Back to Jarvis';
      a.appendChild(el('span', 'oly-home-o', 'Ο'));
      d.body.appendChild(a);
      seatWatch(a);
    }
    if (state === 'failed') showErr();
  }
  // the seal never covers what the owner reads or taps (QA round 6): it steps aside (.oly-away: faded, no taps) while the page scrolls
  // down and whenever text, a button, a link, a field, a picture or a card sits under its seat; it comes back on a scroll up or at the
  // page's end (every app ends with clear space under the seat). Only the page's own background or a canvas (a 3D scene) may be under it.
  var SEAT_HIT = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="tab"], [role="link"]';
  function ownText(e) {
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    return false;
  }
  // a card, a panel, a band: anything with its own painted surface that is not the page itself (a page-size wrapper is the page)
  function surface(e) {
    var cs = window.getComputedStyle(e), bg = cs.backgroundColor, rr;
    if (cs.backgroundImage === 'none' && (!bg || bg === 'transparent' || /,\s*0\)$/.test(bg))) return false;
    rr = e.getBoundingClientRect();
    return !(rr.width >= window.innerWidth - 1 && rr.height >= window.innerHeight - 1);
  }
  function covers(a) {
    if (!d.elementsFromPoint) return false;
    // the seat itself, not the seal's current box: offset* ignore the step-aside transform (a shrunk, lowered seal must not read as clear)
    var r = { left: a.offsetLeft, top: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight },
      P = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]], i, j, list, e, t;
    if (!r.width) return false;
    for (i = 0; i < P.length; i++) {
      list = d.elementsFromPoint(r.left + r.width * P[i][0], r.top + r.height * P[i][1]);
      for (j = 0; j < list.length; j++) {
        e = list[j];
        if (e === a || a.contains(e)) continue;
        t = e.tagName;
        if (e === d.body || e === root || t === 'CANVAS' || t === 'MAIN') break;
        if ((e.closest && e.closest(SEAT_HIT)) || ownText(e) || t === 'IMG' || t === 'VIDEO' || t === 'svg' || t === 'SVG' || surface(e)) return true;
      }
    }
    return false;
  }
  function seatWatch(a) {
    var lastY = window.pageYOffset || 0, settle = 0, raf = 0;
    function y() { return window.pageYOffset || root.scrollTop || 0; }
    function away(on) { if (on && d.activeElement === a) on = false; a.classList.toggle('oly-away', !!on); }
    var late = 0;
    function check() { raf = 0; clearTimeout(late); late = 0; away(covers(a)); }
    // look right after a frame is painted (rAF, then a task): the layout is fresh then, so the look never forces an extra layout
    // (a 3D app moving its labels every frame keeps its layouts-per-frame budget); a busy page that paints no frame for 700 ms
    // is looked at anyway
    function soon() {
      if (raf) return;
      raf = (window.requestAnimationFrame || setTimeout)(function () { setTimeout(function () { if (raf) check(); }, 0); }) || 1;
      late = setTimeout(function () { if (raf) check(); }, 700);
    }
    // it starts aside and shows itself once the first look finds its seat clear: it never flashes over a page's text while it loads
    away(true);
    window.addEventListener('scroll', function () {
      var now = y(), dy = now - lastY; lastY = now;
      if (dy > 4 && now > 48) away(true);                 // reading on: out of the way
      else if (dy < -4) soon();                           // going back up: back, unless something sits under it
      clearTimeout(settle); settle = setTimeout(soon, 180);
    }, { passive: true });
    window.addEventListener('resize', soon, { passive: true });
    a.addEventListener('focus', function () { away(false); });
    // the page fills in after load (data, the shell, a tab change): look again when the page's markup changes (at most every 400 ms)
    // and now and then anyway (a layout that moved without new markup), never while the tab is hidden
    var mo = 0;
    if (window.MutationObserver && d.body) new MutationObserver(function () { if (!mo) mo = setTimeout(function () { mo = 0; if (!d.hidden) soon(); }, 400); })
      .observe(d.body, { childList: true, subtree: true });
    setTimeout(soon, 400); setTimeout(soon, 1500);
    setInterval(function () { if (!d.hidden) soon(); }, 2000);
  }
  O.seatClear = function () { var a = d.querySelector('.oly-home'); return a ? !covers(a) : true; };
  function lift() {
    root.removeAttribute('data-oly-veil');
    if (!veil) return;
    var v = veil; veil = null;
    v.classList.add('out');
    setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 450);
  }
  function ready() {
    if (state === 'ready') return;
    state = 'ready'; clearTimeout(timer);
    root.setAttribute('data-oly-state', 'ready');
    if (err && err.parentNode) err.parentNode.removeChild(err);
    err = null;
    // the first frame is on screen once the browser has painted it
    (window.requestAnimationFrame || setTimeout)(function () { lift(); });
  }
  function fail(msg) {
    if (state === 'ready') return;
    state = 'failed'; clearTimeout(timer);
    root.setAttribute('data-oly-state', 'failed');
    O.reason = String(msg || 'it did not load');
    if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
    veil = null; root.removeAttribute('data-oly-veil');
    showErr();
  }
  function showErr() {
    if (!d.body || err) { if (err) err.querySelector('.oly-err-msg').textContent = info[0] + ' could not load: ' + O.reason; return; }
    err = el('div', 'oly-err'); err.setAttribute('role', 'alert');
    err.appendChild(el('span', 'oly-err-msg', info[0] + ' could not load: ' + O.reason));
    var b = el('button', 'oly-err-retry', 'Retry'); b.type = 'button';
    b.addEventListener('click', function () { location.reload(); });
    err.appendChild(b);
    d.body.appendChild(err);
  }
  // a script or stylesheet that fails to load, or an uncaught error, before the first frame = the page failed
  window.addEventListener('error', function (e) {
    if (state !== 'loading') return;
    var t = e && e.target;
    if (t && t !== window && t.tagName) {
      if (t.tagName === 'SCRIPT') fail(String(t.getAttribute('src') || 'a script').split('?')[0].replace(/^.*\//, '') + ' is missing');
      return;                                            // an image or a font: never fatal
    }
    fail((e && e.message) || 'a script error');
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    if (state !== 'loading') return;
    var r = e && e.reason;
    // a View Transition the browser skipped (the warp's arrival: "Transition was aborted because of invalid state", a page without the
    // opt-in, a second tap) is never the page failing: it simply shows without the animation (phone QA 2026-11-19, Olympus World)
    if (r && /^(AbortError|InvalidStateError|TimeoutError)$/.test(String(r.name || '')) && /transition/i.test(String(r.message || ''))) return;
    fail((r && r.message) || String(r || 'a script error'));
  });
  // cross-tab: the owner changed the level in Jarvis or another app
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var v = stored() || fallback();
    if (v !== level) { level = v; root.setAttribute('data-fx', v); emit(); }
  });
  // the theme changed (Jarvis's Look sheet, another tab, the frame around this app): the engine repainted the tokens
  if (TH) TH.on(function (t) {
    theme = t; accent(t); O.color = info[2];
    for (var i = 0; i < themeSubs.length; i++) { try { themeSubs[i](t); } catch (e) { /* one listener never stops the rest */ } }
    var def = isDefault(t);
    if (def) restoreRoot();
    for (var j = 0; j < appSubs.length; j++) { try { if (!def) appSubs[j](t); } catch (e) { /* one listener never stops the rest */ } }
    if (def && appSubs.length) try { window.dispatchEvent(new CustomEvent('olympus:theme-default')); } catch (e) { /* old browsers */ }
  });
  timer = setTimeout(function () { if (state === 'loading') lift(); }, 12000);   // never a wall: it lifts by itself
  // day-arenas DESIGN 2026-11-20, once after load (never before the first paint):
  //  1. PERF LEAD_WIRES 2: an app opened from a direct link or its own Home Screen icon registers the ROOT worker (sw.js next to olympus/)
  //     when the page has none yet, so it opens offline next time; a no-op when Zenith already registered it, and never off https
  //  2. JARVIS: the Ask Jarvis button (jarvis/ask.js, team JARVIS) on every kit app, with the app id; never on Jarvis itself or in its frame
  function afterLoad() {
    var base = me && me.src ? me.src.replace(/olympus\/olympus\.js.*$/, '') : '';
    try {
      if (base && 'serviceWorker' in navigator && location.protocol === 'https:' && !navigator.serviceWorker.controller)
        navigator.serviceWorker.getRegistration(base).then(function (r) { return r || navigator.serviceWorker.register(base + 'sw.js'); }).catch(function () { return null; });
    } catch (e) { /* no worker on this browser */ }
    try {
      if (base && !framed && id !== 'jarvis' && !d.querySelector('script[src*="jarvis/ask.js"]') && d.body) {
        var s = d.createElement('script'); s.src = base + 'jarvis/ask.js?v=9'; s.defer = true; if (id) s.setAttribute('data-app', id);
        d.body.appendChild(s); d.body.classList.add('oly-has-ask');   // agora.css: the last lines scroll clear of the fixed button
      }
    } catch (e) { /* the page works without the button */ }
  }
  if (d.readyState === 'complete') setTimeout(afterLoad, 0); else window.addEventListener('load', function () { setTimeout(afterLoad, 0); }, { once: true });
  // mounted as soon as the body is parsed (readyState 'interactive' comes before the app's deferred modules run)
  if (d.body) mount(); else { d.addEventListener('readystatechange', mount); d.addEventListener('DOMContentLoaded', mount); }
})();
