/* OLYMPUS sound engine (2026-11-11, docs/SOUND_API.md; before: docs/OLYMPUS_SFX.md). Everything is synthesised in code (WebAudio):
   no files, no CDN, no imitation of any real game's sounds. A classic ES5 script: window.OLYMPUS_SFX.
   The graph:  sounds -> category bus (ui | ambience | voices | world | music) -> duck -> mix -> gentle compressor -> master -> speakers
                                                                          \-> reverb send -> one shared convolver (hall | courtyard | tent, generated) -> mix
   - OFF until the first tap (pointerdown / touchend / click / keydown): before it no AudioContext exists and every call returns false.
     iOS Safari: the first tap creates and resumes the context and plays one silent sample; a later tap resumes an interrupted one.
   - Always mutable: mute() beats everything. The owner's Sound switch sound(true | false | null) (stored 's'): with no choice the UI cues,
     world sounds and beds are silent in LITE (OLYMPUS.lite()), reduced motion and battery saver. Quiet setting quiet(true) (stored 'q'):
     everything softer, no music. Per-category volume volume('ambience', 0..1) (stored 'c'). Music off by default: music(true) (stored 'mu').
   - Ducking: duck(true) / speaking(true) (counted) lowers ambience, music and world while someone speaks; window.OLYMPUS_QUIET()
     (Jarvis talking or listening, also read from the parent frame) ducks the beds automatically.
   - CPU-light: one-shots are short node groups capped per category (ui 6, world 6, ambience 8, music 6; half in LITE), the oldest UI/world
     voice is stolen, every node is disconnected when its sound ends, beds share one long pink-noise loop, plucks are Karplus-Strong
     buffers rendered once and cached (LRU). Hidden tab: the context is suspended.
   Old API kept: play(name) / stop('pad') / mute / setVolume / unlock / state / names / ambient / ambientStop / ambience / ambientState /
   ambients / sound / cues, and data-oly-cue="open" on any element plays that cue on click. Old names (tick, tap, portal, thunder, rankup,
   pad; beds wind, forge, sea, city, forest, crowd, chimes, space, smithy, scroll, coins, agora, lab, breeze) map to the new sounds.
   New: at(name, {x,y,z}, listener) 3D positional, world(name), listener(L), music(on) / district(name) / musicState(), duck / speaking,
   quiet, volume / volumes, room, bus(cat) / context() / onUnlock(cb) for other agents' own synthesis.
   iOS: WebAudio follows the ringer switch (silent switch = no sound); never overridden (audioSession 'ambient'). Haptics: no-op on iOS. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && !root.OLYMPUS_SFX) { root.OLYMPUS_SFX = api.create(root); root.OLYMPUS_SFX.create = api.create; }   // create(env): a second engine (tests render one offline)
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var KEY = 'olympus.sfx';
  var LEGACY = ['tick', 'tap', 'portal', 'thunder', 'rankup', 'pad'];                        // follow mute only (as before)
  var CUES = ['open', 'close', 'success', 'warning', 'swipe', 'toggle', 'notify', 'error', 'money', 'levelup'];   // follow the Sound switch
  var WORLD = ['step-stone', 'step-sand', 'step-wood', 'hammer', 'quill', 'scroll', 'coin', 'crate', 'cheer', 'groan', 'door', 'fire', 'page', 'chime', 'drum', 'jingle'];
  var NAMES = LEGACY.concat(CUES, WORLD);
  var ALIAS = { notification: 'notify', ping: 'notify', bell: 'notify', 'money-in': 'money', moneyin: 'money', cash: 'money', 'level-up': 'levelup',
    levelUp: 'levelup', fail: 'error', alert: 'warning', ok: 'success', done: 'success', 'toggle-on': 'toggle', 'toggle-off': ['toggle', { on: false }],
    'swipe-back': ['swipe', { dir: 'back' }], step: 'step-stone', footstep: 'step-stone', 'step-grass': ['step-sand', { surface: 'grass' }], 'step-leaves': ['step-sand', { surface: 'leaves' }], anvil: 'hammer', whoosh: 'fire',
    unroll: 'scroll', clink: 'coin', drop: 'crate', applause: 'cheer', sigh: 'groan', gate: 'door', 'page-turn': 'page', book: 'page', drums: 'drum',
    'jingle-keys': ['jingle', { kind: 'keys' }], 'jingle-coins': ['jingle', { kind: 'pouch' }], 'jingle-metal': ['jingle', { kind: 'metal' }], keys: ['jingle', { kind: 'keys' }], rustle: ['jingle', { kind: 'rustle' }] };
  var CATS = ['ui', 'ambience', 'voices', 'world', 'music'];
  var DEFAULT_CAT = { ui: 1, ambience: 0.8, voices: 1, world: 0.9, music: 0.6 };
  var SEND = { ui: 0.16, ambience: 0.3, voices: 0.1, world: 0.32, music: 0.5 };          // how much of each category goes to the shared reverb
  var QUIET = { ui: 0.6, ambience: 0.45, voices: 1, world: 0.55, music: 0 };
  var DUCK = { ui: 1, ambience: 0.3, voices: 1, world: 0.6, music: 0.25 };
  var CAP = { ui: 6, ambience: 8, voices: 4, world: 6, music: 6 };
  var ROOMS = ['hall', 'courtyard', 'tent'];
  var AMB_LEVEL = 0.5, MUS_LEVEL = 0.5, MAXD = 40;
  // the beds: [builder, options, reverb room]. The new places first-class; the old names of the AMBIENT table map onto them.
  var BED = {
    marble: ['marble', {}, 'hall'], agora: ['agora', {}, 'courtyard'], workshop: ['workshop', { hammer: 0.7 }, 'tent'], desert: ['desert', {}, 'courtyard'],
    harbour: ['harbour', {}, 'courtyard'], night: ['night', {}, 'courtyard'], library: ['library', {}, 'hall'], colosseum: ['colosseum', {}, 'courtyard'],
    grove: ['grove', {}, 'courtyard'], temple: ['temple', { chimes: 0.6 }, 'hall'], treasury: ['treasury', {}, 'tent'],
    wind: ['temple', { chimes: 0.15 }, 'hall'], chimes: ['temple', { chimes: 1 }, 'hall'], forge: ['workshop', { hammer: 0.35 }, 'tent'],
    smithy: ['workshop', { hammer: 1 }, 'tent'], sea: ['harbour', {}, 'courtyard'], city: ['agora', { far: true }, 'courtyard'], forest: ['grove', {}, 'courtyard'],
    crowd: ['colosseum', {}, 'courtyard'], space: ['night', { stars: true }, 'courtyard'], scroll: ['library', {}, 'hall'], coins: ['treasury', {}, 'tent'],
    lab: ['marble', { drip: true }, 'hall'], breeze: ['desert', { bells: false }, 'courtyard']
  };
  var OLD_BEDS = ['wind', 'forge', 'sea', 'city', 'forest', 'crowd', 'chimes', 'space', 'smithy', 'scroll', 'coins', 'agora', 'lab', 'breeze'];
  var AMBIENTS = OLD_BEDS.concat(['marble', 'workshop', 'desert', 'harbour', 'night', 'library', 'colosseum', 'grove', 'temple', 'treasury']);
  var BED_DISTRICT = { treasury: 'money', coins: 'money', library: 'research', scroll: 'research', night: 'research', space: 'research', lab: 'research',
    marble: 'research', grove: 'life', forest: 'life', harbour: 'life', sea: 'life', desert: 'life', breeze: 'life' };
  // the music: one calm lyre motif generator per district (mode, beat in seconds, how many notes a phrase keeps, brightness)
  var DISTRICTS = {
    trading: { root: 50, scale: [0, 2, 3, 5, 7, 9, 10], beat: 0.6, dens: 0.8, bright: 0.5 },      // D dorian: steady, measured
    money: { root: 55, scale: [0, 2, 4, 7, 9], beat: 0.52, dens: 0.85, bright: 0.6 },             // G major pentatonic: warm, bright
    life: { root: 53, scale: [0, 2, 4, 6, 7, 9, 11], beat: 0.7, dens: 0.7, bright: 0.45 },        // F lydian: open, gentle
    research: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], beat: 0.85, dens: 0.55, bright: 0.35 }   // A aeolian: sparse, thoughtful
  };
  var HAPTIC = { tick: 4, tap: 8, portal: [10, 30, 18], thunder: [30, 40, 60, 40, 90], rankup: [15, 40, 15, 40, 40], open: 6, close: 5, success: [10, 30, 14],
    warning: [20, 50, 20], swipe: 4, toggle: 5, notify: [8, 40, 8], error: [25, 40, 25], money: [6, 30, 6, 30, 10], levelup: [15, 40, 15, 40, 40] };
  // the key of every UI cue: D major (the lyre's home)
  var D3 = 146.83, G3 = 196, D4 = 293.66, E4 = 329.63, Fs4 = 369.99, G4 = 392, A4 = 440, B4 = 493.88, D5 = 587.33, E5 = 659.26, Fs5 = 739.99,
    A5 = 880, B5 = 987.77, D6 = 1174.66, E6 = 1318.51, Fs6 = 1479.98;
  var CHIME = [A5, B5, D6, E6, Fs6];
  // the recorded layer (CC0 recordings, docs/ASSETS_LICENSES.md), written by tools/audio_build.py: files, banks of one-shots in sprites, bed loops
  var AUDIO = /*AUDIO*/{"v":1,"files":{"ui":[1,147.6,148.5],"harp":[1,126.8,150.8],"harp-lo":[1,78.2,103.1],"steps":[1,32.3,53.0],"forge":[1,39.6,51.2],"scribe":[1,22.2,39.5],"house":[1,26.9,50.3],"gear":[1,52.3,83.7],"coins":[1,28.1,39.9],"nature":[1,63.0,110.2],"arena":[1,40.7,73.3],"bells":[1,83.3,96.7],"loop-crowd":[2,117.1,181.8],"loop-applause":[2,91.5,127.3],"loop-fire":[2,106.1,164.5],"loop-wind":[2,116.9,180.8],"loop-gusts":[2,113.1,198.8],"loop-sea":[2,116.6,198.8],"loop-crickets":[2,64.8,90.9],"loop-birds":[2,116.4,199.0],"loop-brook":[2,61.7,108.9]},"banks":{"tap":["ui",[[0.12,0.22],[0.46,0.22],[0.8,0.22]]],"tick":["ui",[[1.14,0.06],[1.32,0.0552]]],"toggle":["ui",[[1.4952,0.14],[1.7552,0.2],[2.0752,0.2]]],"paper":["ui",[[2.3952,0.75],[3.2652,0.7],[4.0852,0.55],[4.7552,0.5]]],"chime":["ui",[[5.3752,2.2,74],[7.6952,2.2,76],[10.0152,2.2,78],[12.3352,2.2,69],[14.6552,2.2,80]]],"shimmer":["ui",[[16.9752,1.8]]],"bell":["ui",[[18.8952,1.4],[20.4152,0.78]]],"coin":["ui",[[21.3152,0.5],[21.9352,0.29],[22.3452,0.3],[22.7652,0.21],[23.0952,0.19]]],"harp":["harp",[[0.12,1.9,62],[2.14,1.9,64],[4.16,1.9,66],[6.18,1.9,68],[8.2,1.9,70],[10.22,1.9,72],[12.24,1.9,74],[14.26,1.5,76],[15.88,1.5,78],[17.5,1.5,80],[19.12,1.5,82],[20.74,1.5,84],[22.36,1.5,86]]],"harplo":["harp-lo",[[0.12,2.6,50],[2.84,2.6,52],[5.56,2.6,54],[8.28,2.6,56],[11.0,2.6,58],[13.72,2.6,60]]],"step-stone":["steps",[[0.12,0.3],[0.54,0.3],[0.96,0.3],[1.38,0.3],[1.8,0.3],[2.22,0.3],[2.64,0.2505]]],"step-sand":["steps",[[3.0105,0.32],[3.4505,0.3164],[3.8869,0.2987],[4.3056,0.32],[4.7456,0.32],[5.1856,0.32]]],"step-wood":["steps",[[5.6256,0.2298],[5.9754,0.2106],[6.306,0.24]]],"step-leaves":["steps",[[6.666,0.38],[7.166,0.38]]],"anvil":["forge",[[0.12,0.99],[1.23,1.0],[2.35,1.0],[3.47,0.85],[4.44,0.51],[5.07,0.56]]],"smith":["forge",[[5.75,0.5]]],"tool":["forge",[[6.37,0.17],[6.66,0.3],[7.08,0.3]]],"quill":["scribe",[[0.12,0.62],[0.86,0.75]]],"page":["scribe",[[1.73,0.73],[2.58,0.9],[3.6,0.56],[4.28,0.56]]],"scroll":["scribe",[[4.96,0.94]]],"door":["house",[[0.12,0.65],[0.89,0.5],[1.51,0.85],[2.48,0.72],[3.32,0.54],[3.98,0.41]]],"crate":["house",[[4.51,0.22],[4.85,0.39],[5.36,0.4],[5.88,0.55]]],"whoosh":["house",[[6.55,0.4406]]],"keys":["gear",[[0.12,0.8],[1.04,0.76],[1.92,0.28],[2.32,0.41],[2.85,0.39]]],"metal":["gear",[[3.36,0.43],[3.91,0.47],[4.5,0.37]]],"beads":["gear",[[4.99,0.28]]],"cloth":["gear",[[5.39,0.32],[5.83,0.3]]],"pouch":["gear",[[6.25,0.6],[6.97,0.6]]],"jingle":["gear",[[7.69,0.9],[8.71,0.9]]],"rustle":["gear",[[9.73,0.62],[10.47,0.4137],[11.0037,0.7]]],"pour":["coins",[[0.12,1.7299],[1.9699,1.26]]],"count":["coins",[[3.3499,0.78],[4.2499,0.89],[5.2599,0.7]]],"gull":["nature",[[0.12,1.3],[1.54,1.07],[2.73,0.9],[3.75,0.79],[4.66,0.8816]]],"wave":["nature",[[5.6616,3.34],[9.1216,2.17],[11.4116,3.22]]],"chirp":["nature",[[14.7516,0.55],[15.4216,0.55],[16.0916,0.55],[16.7616,0.55]]],"clap":["arena",[[0.12,0.3],[0.54,0.3],[0.96,0.3],[1.38,0.3]]],"drum":["arena",[[1.8,0.9],[2.82,0.9],[3.84,0.9],[4.86,0.9]]],"cheer":["arena",[[5.88,2.6],[8.6,2.4]]],"camel":["bells",[[0.12,1.2],[1.44,0.78],[2.34,1.2],[3.66,0.9]]],"windchime":["bells",[[4.68,5.5],[10.3,5.0]]]},"loops":{"crowd":["loop-crowd",20.0],"applause":["loop-applause",14.0],"fire":["loop-fire",18.0],"wind":["loop-wind",20.0],"gusts":["loop-gusts",22.0],"sea":["loop-sea",22.0],"crickets":["loop-crickets",10.0],"birds":["loop-birds",22.0],"brook":["loop-brook",12.0]}}/*/AUDIO*/;

  // where the files are: next to this script, ../assets/audio/ (read once while the script runs; window.OLYMPUS_AUDIO_BASE or create({audioBase}) wins)
  var BASE0 = (function () {
    try {
      var d = typeof document !== 'undefined' ? document : null, s = d && d.currentScript, src = s && s.src;
      if (!src && d && d.querySelector) { var q = d.querySelector('script[src*="sfx.js"]'); src = q && q.src; }
      return src ? String(src).replace(/[^\/]*\/sfx\.js(\?.*)?$/, 'assets/audio/') : '';
    } catch (e) { return ''; }
  })();
  var RAW = {};                                                 // url -> promise of the file's bytes, shared by every engine on the page (one download)
  // which recorded files each place uses (lazy: fetched when the place starts, after the first tap)
  var BED_FILES = { marble: ['loop-crowd', 'steps', 'ui'], agora: ['loop-crowd', 'loop-birds', 'steps'], workshop: ['loop-fire', 'forge'], desert: ['loop-wind', 'loop-gusts', 'bells'],
    harbour: ['loop-sea', 'nature'], night: ['loop-crickets'], library: ['scribe', 'steps'], colosseum: ['loop-crowd', 'loop-applause', 'arena'],
    grove: ['loop-birds', 'loop-brook', 'nature', 'gear'], temple: ['loop-wind', 'bells', 'ui'], treasury: ['coins', 'ui'] };
  // what a person's accessory or kind sounds like when they move (presence): docs/SOUND_API.md "Voices and presence"
  var JINGLE_OF = { hammer: 'metal', helmet: 'metal', pouch: 'pouch', key: 'keys', scroll: 'cloth', owl: 'cloth', torch: 'cloth', laurel: 'rustle',
    builder: 'metal', bot: 'metal', scanner: 'pouch', keeper: 'keys', mind: 'cloth', champion: 'jingle', villager: 'beads' };
  var JINGLES = ['keys', 'metal', 'beads', 'cloth', 'pouch', 'jingle', 'rustle'];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(x, lo, hi) { x = +x; if (isNaN(x)) x = 0; lo = lo === undefined ? 0 : lo; hi = hi === undefined ? 1 : hi; return Math.max(lo, Math.min(hi, x)); }
  function merge(a, b) { var o = {}, k; if (a) for (k in a) o[k] = a[k]; if (b && typeof b === 'object') for (k in b) o[k] = b[k]; return o; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function create(env) {
    env = env || {};
    var ctx = null, mix = null, master = null, wetIn = null, wetOut = null, conv = null, room = '', irs = {}, CB = {};
    var unlocked = false, listening = false, vol = 0.35, muted = false, errors = 0, scheduled = 0, released = 0;
    var ambOn = null, soundOn = null, musicOn = false, quietOn = false, catVol = merge(DEFAULT_CAT);
    var ambWant = '', ambPlay = null, padNode = null, musWant = '', musPlay = null;
    var whiteB = null, pinkB = null, clapB = null, ks = {}, ksOrder = [];
    var active = [], lastAt = {}, duckN = 0, autoDuck = false, duckTimer = 0, hearL = null, unlockCbs = [];
    var smpOn = true, ready = {}, loading = {}, failed = {}, waiters = {}, rrLast = {}, sampled = 0, loadedKb = 0, fmtUsed = '', loopUse = [], smpDead = false, fmtProbe = null;

    /* ---------------------------------------------------------------- settings */
    function ls() { try { return env.localStorage || null; } catch (e) { return null; } }
    function load() {
      try {
        var s = ls(); var o = s && JSON.parse(s.getItem(KEY) || 'null');
        if (!o) return;
        if (typeof o.v === 'number') vol = clamp(o.v);
        if (typeof o.m === 'boolean') muted = o.m;
        ambOn = typeof o.a === 'boolean' ? o.a : null;
        soundOn = typeof o.s === 'boolean' ? o.s : null;
        musicOn = o.mu === true; quietOn = o.q === true;
        smpOn = o.sm !== false;
        if (o.c && typeof o.c === 'object') CATS.forEach(function (c) { if (typeof o.c[c] === 'number') catVol[c] = clamp(o.c[c]); });
      } catch (e) {}
    }
    function save() {
      try {
        var s = ls(); if (!s) return;
        var old = {}; try { old = JSON.parse(s.getItem(KEY) || '{}') || {}; } catch (e) {}
        var o = merge(old, { v: vol, m: muted });
        if (ambOn !== null) o.a = ambOn; else delete o.a;
        if (soundOn !== null) o.s = soundOn; else delete o.s;
        if (musicOn) o.mu = true; else delete o.mu;
        if (quietOn) o.q = true; else delete o.q;
        if (!smpOn) o.sm = false; else delete o.sm;
        var c = {}, any = false; CATS.forEach(function (k) { if (catVol[k] !== DEFAULT_CAT[k]) { c[k] = catVol[k]; any = true; } });
        if (any) o.c = c; else delete o.c;
        s.setItem(KEY, JSON.stringify(o));
      } catch (e) {}
    }
    function reduced() { try { return !!(env.matchMedia && env.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
    function batterySaver() { try { var O = env.OLYMPUS; return !!(O && O.saver && O.saver()); } catch (e) { return false; } }
    function lite() { try { var O = env.OLYMPUS; return !!(O && O.lite && O.lite()); } catch (e) { return false; } }
    function hidden() { try { return !!(env.document && env.document.hidden); } catch (e) { return false; } }
    // the Sound switch: the owner's choice (true / false) wins; with none the cues, world sounds and beds are silent in LITE, reduced motion and saver
    function soundAllowed() { return !muted && (soundOn === null ? !lite() && !reduced() && !batterySaver() : soundOn); }
    function ambAllowed() { return !muted && soundOn !== false && (ambOn === null ? (soundOn === true || (!batterySaver() && !lite() && !reduced())) : ambOn); }
    function musicAllowed() { return musicOn && !quietOn && !muted && soundOn !== false && !batterySaver() && (soundOn === true || !reduced()); }

    /* ---------------------------------------------------------------- the graph */
    function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
    function applyGain() { if (master && ctx) { try { master.gain.setTargetAtTime(muted ? 0 : vol * vol, ctx.currentTime, 0.02); } catch (e) {} } }
    function catLevel(c) { return catVol[c] * (quietOn ? QUIET[c] : 1); }
    function applyCats() {
      if (!ctx) return;
      CATS.forEach(function (c) { try { CB[c].bus.gain.setTargetAtTime(catLevel(c), ctx.currentTime, 0.06); } catch (e) {} });
    }
    function applyDuck() {
      if (!ctx) return;
      var on = duckN > 0 || autoDuck;
      CATS.forEach(function (c) { try { CB[c].duck.gain.setTargetAtTime(on ? DUCK[c] : 1, ctx.currentTime, on ? 0.08 : 0.45); } catch (e) {} });
    }
    function ensureCtx() {
      if (ctx) return ctx;
      var AC = env.AudioContext || env.webkitAudioContext;
      if (!AC) return null;
      try {
        try { if (env.navigator && env.navigator.audioSession) env.navigator.audioSession.type = 'ambient'; } catch (e) {}
        ctx = new AC();
        master = gain(0, ctx.destination);
        mix = ctx.createGain();
        if (ctx.createDynamicsCompressor) {                     // gentle glue, not a pump: -20 dB, ratio 3, soft knee
          var comp = ctx.createDynamicsCompressor();
          try { comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3; } catch (e) {}
          mix.connect(comp); comp.connect(master);
        } else mix.connect(master);
        if (ctx.createConvolver) { wetIn = ctx.createGain(); wetOut = gain(0.55, mix); }
        CATS.forEach(function (c) {
          var bus = ctx.createGain(), dk = gain(1, mix); bus.gain.value = catLevel(c); bus.connect(dk);
          CB[c] = { bus: bus, duck: dk };
          if (wetIn) { CB[c].send = gain(SEND[c], wetIn); dk.connect(CB[c].send); }
        });
        setRoom('hall');
        applyGain(); applyDuck();
      } catch (e) { errors++; ctx = null; }
      return ctx;
    }
    /* the shared reverb: an impulse generated in code (noise with a decay that darkens over time + a few early reflections) */
    function makeIR(name) {
      var S = { hall: { len: 2.8, dec: 2.5, damp: 0.6, pre: 0.02, er: [0.013, 0.021, 0.034, 0.047, 0.066] },
        courtyard: { len: 1.5, dec: 1.15, damp: 0.4, pre: 0.008, er: [0.009, 0.017, 0.029, 0.052, 0.081, 0.12] },
        tent: { len: 0.6, dec: 0.4, damp: 0.75, pre: 0.003, er: [0.004, 0.009] } }[name];
      var sr = ctx.sampleRate, len = S.len * (lite() ? 0.6 : 1), n = Math.max(8, Math.floor(sr * len)), b = ctx.createBuffer(2, n, sr), seed = 20261111;
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch), lp = 0, pre = Math.floor(S.pre * sr);
        for (var i = 0; i < n; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          var w = (seed / 4294967296) * 2 - 1, t = i / sr, c = 0.92 - 0.8 * S.damp * Math.min(1, t / len);
          lp += (w - lp) * c;
          d[i] = i < pre ? 0 : lp * Math.exp(-6.9 * t / S.dec) * Math.min(1, (i - pre) / (sr * 0.004 + 1));
        }
        S.er.forEach(function (et, k) { var j = Math.floor((et + ch * 0.0017 * (k + 1)) * sr); if (j < n) d[j] += (k % 2 ? -1 : 1) * 0.55 * Math.pow(0.78, k); });
      }
      return b;
    }
    function setRoom(name) {
      if (ROOMS.indexOf(name) < 0) return room;
      if (!ctx || !wetIn) { room = name; return room; }
      if (name === room && conv) return room;
      try {
        var nc = ctx.createConvolver(); nc.buffer = irs[name] || (irs[name] = makeIR(name)); nc.connect(wetOut);
        var old = conv; conv = nc; room = name;
        if (old) { try { wetIn.disconnect(old); } catch (e) { try { wetIn.disconnect(); } catch (x) {} } setTimeout(function () { try { old.disconnect(); } catch (e) {} }, 3200); }
        wetIn.connect(nc);
      } catch (e) { errors++; }
      return room;
    }

    /* ---------------------------------------------------------------- unlock (the first tap) */
    function unlock() {
      if (unlocked) { resumeIfNeeded(); return !!ctx; }
      unlocked = true;                                          // only called from a gesture handler (or by page code inside a gesture)
      var c = ensureCtx();
      try {
        if (c) {
          if (c.state !== 'running' && c.resume) quietly(c.resume());
          var b = c.createBuffer(1, 1, c.sampleRate || 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);   // iOS: one silent sample
        }
      } catch (e) { errors++; }
      try { bootSamples(); } catch (e) { errors++; }
      ambRefresh();
      unlockCbs.splice(0).forEach(function (cb) { try { cb(api); } catch (e) {} });
      return !!c;
    }
    function quietly(pr) { try { if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} }     // resume / suspend promises: a refusal is not an error
    function resumeIfNeeded() {
      try {
        if (!ctx || ctx.state === 'running' || hidden()) return;
        if (ctx.resume) quietly(ctx.resume());
        // iOS: a context made on a pointerdown that did not count as a gesture (or interrupted by a call) is unlocked by a sound started
        // inside touchend / click: one silent sample with the resume
        var b = ctx.createBuffer(1, 1, ctx.sampleRate || 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
    }
    function listen() {
      if (listening || !env.addEventListener) return;
      listening = true;
      var h = function () { if (!unlocked) unlock(); else resumeIfNeeded(); };          // stays: a later tap resumes an interrupted iOS context
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (e) { env.addEventListener(e, h, true); });
      env.addEventListener('click', function (e) {              // data-oly-cue="open" on any element: that cue on its click
        try { var el = e && e.target && e.target.closest && e.target.closest('[data-oly-cue]'); if (el) play(el.getAttribute('data-oly-cue')); } catch (x) {}
      }, true);
      try { env.addEventListener('storage', function (e) { if (e && e.key === KEY) { load(); applyGain(); applyCats(); ambRefresh(); } }); } catch (e) {}
      try { env.addEventListener('load', attachHooks); } catch (e) {}
      if (env.document && env.document.addEventListener) {
        env.document.addEventListener('visibilitychange', function () {
          if (!ctx) return;
          try { if (hidden()) { if (ctx.suspend) quietly(ctx.suspend()); } else if (unlocked && ctx.resume) quietly(ctx.resume()); } catch (e) {}
          ambRefresh();
        });
      }
    }

    /* ---------------------------------------------------------------- voices: one group of nodes per sound, capped, always released */
    function grab(cat, dur, dest, extra) {
      var cap = Math.max(2, Math.floor(CAP[cat] * (lite() ? 0.5 : 1))), n = 0, oldest = null;
      for (var i = 0; i < active.length; i++) if (active[i].cat === cat) { n++; if (!oldest) oldest = active[i]; }
      if (n >= cap) {
        if (cat === 'ambience' || cat === 'music') { (extra || []).forEach(function (x) { try { x.disconnect(); } catch (e) {} }); return null; }   // a bed simply skips an event
        steal(oldest);
      }
      var g = gain(1, dest || CB[cat].bus);
      var V = { cat: cat, g: g, t: ctx.currentTime + 0.01, nodes: [g].concat(extra || []), srcs: [] };
      V.timer = setTimeout(function () { release(V); }, (dur + 0.3) * 1000);
      active.push(V);
      return V;
    }
    function drop(V) { var i = active.indexOf(V); if (i >= 0) active.splice(i, 1); }
    function disc(V) { V.nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} }); V.nodes = []; V.srcs = []; released++; }
    function release(V) { clearTimeout(V.timer); drop(V); disc(V); }
    function steal(V) {
      try {
        var t = ctx.currentTime; V.g.gain.cancelScheduledValues(t); V.g.gain.setTargetAtTime(0, t, 0.015);
        V.srcs.forEach(function (s) { try { s.stop(t + 0.08); } catch (e) {} });
      } catch (e) {}
      clearTimeout(V.timer); drop(V); setTimeout(function () { disc(V); }, 150);
    }
    function nd(V, x) { V.nodes.push(x); return x; }
    function envl(p, t, peak, att, dur) { p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + att); p.exponentialRampToValueAtTime(0.0001, t + dur); }

    /* ---------------------------------------------------------------- synthesis helpers (all scheduled at V.t + at) */
    function tone(V, type, f0, f1, at, dur, peak, att, dest) {
      var t = V.t + at, o = nd(V, ctx.createOscillator()), g = nd(V, ctx.createGain());
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      envl(g.gain, t, peak, att || 0.005, dur);
      o.connect(g); g.connect(dest || V.g);
      o.start(t); o.stop(t + dur + 0.05); V.srcs.push(o); scheduled++;
      return o;
    }
    function white() {
      if (whiteB) return whiteB;
      var n = Math.max(2, Math.floor(ctx.sampleRate * 2)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), s = 1234567;
      for (var i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
      return (whiteB = b);
    }
    function nz(V, at, dur, peak, ft, f0, f1, q, att, dest) {
      var t = V.t + at, src = nd(V, ctx.createBufferSource()), f = nd(V, ctx.createBiquadFilter()), g = nd(V, ctx.createGain());
      src.buffer = white(); if (dur > 1.8) src.loop = true;
      f.type = ft; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 0.7;
      envl(g.gain, t, peak, att || Math.min(0.3, dur * 0.35), dur);
      src.connect(f); f.connect(g); g.connect(dest || V.g);
      src.start(t, dur > 1.8 ? 0 : Math.random() * Math.max(0, 1.9 - dur)); src.stop(t + dur + 0.05); V.srcs.push(src); scheduled++;
      return f;
    }
    /* a plucked string (Karplus-Strong, rendered once per note and brightness, LRU-cached; playbackRate makes the tuning exact) */
    function ksBuf(f, br) {
      var m = Math.round(12 * Math.log(f / 440) / Math.LN2 + 69), q = br > 0.62 ? 2 : br < 0.3 ? 0 : 1, key = m + '_' + q;
      var hit = ks[key];
      if (hit) { ksOrder.splice(ksOrder.indexOf(key), 1); ksOrder.push(key); return hit; }
      var sr = ctx.sampleRate, ff = mtof(m), N = Math.max(2, Math.round(sr / ff - 0.5)), len = Math.floor(sr * 1.3), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      var a = [0.16, 0.38, 0.72][q], s = (m * 7919 + 17) >>> 0, p = 0, i, mean = 0, mx = 0, e = new Float32Array(N), k = Math.max(1, Math.floor(N * 0.2));
      for (i = 0; i < N; i++) { s = (s * 1664525 + 1013904223) >>> 0; p += (((s / 4294967296) * 2 - 1) - p) * a; e[i] = p; mean += p; }
      mean /= N;
      for (i = 0; i < N && i < len; i++) { d[i] = (e[i] - mean) - 0.55 * (e[(i + k) % N] - mean); mx = Math.max(mx, Math.abs(d[i])); }   // plucked a fifth along the string
      if (mx > 0) for (i = 0; i < N && i < len; i++) d[i] /= mx;
      var T60 = Math.min(3, 1.1 + 260 / ff), g = Math.pow(10, -3 * (N + 0.5) / (sr * T60));
      for (i = N; i < len; i++) d[i] = g * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : 0));
      var out = { buf: b, f: sr / (N + 0.5) };
      ks[key] = out; ksOrder.push(key);
      while (ksOrder.length > (lite() ? 10 : 22)) delete ks[ksOrder.shift()];
      return out;
    }
    function pluck(V, f, at, peak, o) {
      o = o || {};
      if (harp(V, f, at, peak, o)) return;                    // the recorded folk harp when it is loaded, else the synthesised string
      var t = V.t + at, dur = o.dur || 1, br = o.bright === undefined ? 0.5 : o.bright, b = ksBuf(f, br);
      var src = nd(V, ctx.createBufferSource()), lp = nd(V, ctx.createBiquadFilter()), g = nd(V, ctx.createGain());
      src.buffer = b.buf; if (src.playbackRate) src.playbackRate.value = f / b.f;
      lp.type = 'lowpass'; lp.frequency.value = Math.min(12000, f * (3 + 9 * br)); lp.Q.value = 0.5;
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(peak * 0.45, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(o.dest || V.g);
      src.start(t); src.stop(t + dur + 0.03); V.srcs.push(src); scheduled++;
    }
    /* a small bronze bell / crotale: inharmonic partials, the high ones die first */
    function bell(V, f, at, peak, decay, dest, ratios) {
      var R = ratios || [1, 2.0, 2.76, 4.07, 5.4], A = [1, 0.5, 0.35, 0.2, 0.12];
      for (var k = 0; k < R.length; k++) tone(V, 'sine', f * R[k], 0, at, decay / (1 + k * 0.7), peak * (A[k] || 0.1), 0.002, dest);
    }
    function coin(V, at, k, light) {
      var f = rnd(2900, 3600);
      tone(V, 'sine', f, 0, at, 0.28, 0.05 * k, 0.001); tone(V, 'sine', f * 2.32, 0, at, 0.13, 0.024 * k, 0.001);
      if (!light) { tone(V, 'sine', f * 3.91, 0, at, 0.07, 0.012 * k, 0.001); nz(V, at, 0.012, 0.03 * k, 'highpass', 6000, 0, 0.7, 0.001); }
    }
    function clapBuf() {                                        // applause: ~90 tiny hand claps rendered once into 1.6 s
      if (clapB) return clapB;
      var sr = ctx.sampleRate, n = Math.floor(sr * 1.6), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), s = 4242;
      for (var c = 0; c < 90; c++) {
        s = (s * 1664525 + 1013904223) >>> 0; var t0 = Math.pow(s / 4294967296, 0.8) * 1.45, j0 = Math.floor(t0 * sr), L = Math.floor(sr * 0.006), env = Math.sin(Math.PI * Math.min(1, t0 / 1.5));
        for (var j = 0; j < L && j0 + j < n; j++) { s = (s * 1664525 + 1013904223) >>> 0; d[j0 + j] += ((s / 4294967296) * 2 - 1) * Math.exp(-j / (L * 0.25)) * env * 0.6; }
      }
      return (clapB = b);
    }
    function playBuf(V, buf, at, peak, f) {
      var t = V.t + at, src = nd(V, ctx.createBufferSource()), fl = nd(V, ctx.createBiquadFilter()), g = nd(V, ctx.createGain());
      src.buffer = buf; fl.type = 'bandpass'; fl.frequency.value = f || 2200; fl.Q.value = 0.6; g.gain.value = peak;
      src.connect(fl); fl.connect(g); g.connect(V.g); src.start(t); src.stop(t + 1.7); V.srcs.push(src); scheduled++;
    }

    /* ---------------------------------------------------------------- the recorded layer: CC0 recordings, decoded on demand, cached, layered with the synth
       Files: assets/audio/<stem>.ogg (Opus) or .m4a (AAC, every iPhone), the format this browser plays best; a failed file tries the other format, then
       the synth plays alone (always). One-shots live in sprites (one file per family); sp() plays one variation (never the same twice in a row) with a
       little pitch and level jitter. Beds loop recordings with a crossfading looper that starts each pass at a new place (it never repeats exactly). */
    function smpBase() { var b = env.audioBase || env.OLYMPUS_AUDIO_BASE || BASE0; return b ? String(b).replace(/\/?$/, '/') : ''; }
    function fmts() {
      if (fmtUsed) return [fmtUsed, fmtUsed === 'ogg' ? 'm4a' : 'ogg'];
      var a = null; try { a = env.document && env.document.createElement && env.document.createElement('audio'); } catch (e) {}
      var ogg = '', mp4 = '';
      try { if (a && a.canPlayType) { ogg = a.canPlayType('audio/ogg; codecs="opus"'); mp4 = a.canPlayType('audio/mp4; codecs="mp4a.40.2"'); } } catch (e) {}
      return ogg === 'probably' || (ogg && !mp4) ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    }
    function smpUse() { return smpOn && !smpDead && !!AUDIO && !!ctx && !!ctx.decodeAudioData && typeof env.fetch === 'function' && !!smpBase(); }
    function saveData() { try { var c = env.navigator && env.navigator.connection; return !!(c && c.saveData); } catch (e) { return false; } }
    function decode(ab) {
      return new Promise(function (ok, no) {
        try { var p = ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); } catch (e) { no(e); }
      });
    }
    function bytes(url) {
      if (!RAW[url]) RAW[url] = env.fetch(url).then(function (r) {
        if (!r || !r.ok) throw new Error('http ' + (r && r.status));
        // a host that answers a missing file with a page (an artifact copy, a captive portal): not audio, never decoded
        var ct = ''; try { ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || ''); } catch (e) {}
        if (/text\/html/i.test(ct)) throw new Error('not audio');
        return r.arrayBuffer();
      });
      return RAW[url];
    }
    /** want(stem): start loading a file (once); cb(buffer) when it is ready (or never, when it fails: the synth plays instead) */
    function want(stem, cb) {
      if (ready[stem]) { if (cb) cb(ready[stem]); return true; }
      if (cb) (waiters[stem] = waiters[stem] || []).push(cb);
      if (loading[stem] || failed[stem] || !smpUse() || !AUDIO.files[stem]) return false;
      if (!fmtUsed && fmtProbe) {                               // the format is still being found out on another file: wait for it, so a host
        loading[stem] = fmtProbe.then(function () {             // without one format costs one failed request, not one per file
          delete loading[stem];
          if (!smpDead && !failed[stem] && !ready[stem]) want(stem);
          return loading[stem] || ready[stem] || null;
        });
        return false;
      }
      var order = fmts(), i = 0, c0 = ctx;
      function tryNext() {
        if (i >= order.length) {
          failed[stem] = true; delete loading[stem]; waiters[stem] = [];
          // neither format of the first file worked (no .m4a on this host and no Opus decoder, offline, ...): the synth plays for the
          // session and nothing more is fetched (one failed request per format, not one per file: a quiet console)
          if (!fmtUsed) smpDead = true;
          return null;
        }
        var f = order[i++], url = smpBase() + stem + '.' + f;
        return bytes(url).then(function (ab) { return decode(ab.slice(0)); }).then(function (buf) {
          if (c0 !== ctx) return null;
          if (!fmtUsed) fmtUsed = f;
          ready[stem] = buf; delete loading[stem]; loadedKb += AUDIO.files[stem][f === 'ogg' ? 1 : 2] || 0;
          (waiters[stem] || []).splice(0).forEach(function (w) { try { w(buf); } catch (e) {} });
          return buf;
        }, function () { delete RAW[url]; return tryNext(); });
      }
      loading[stem] = tryNext();
      if (!fmtUsed && !fmtProbe) fmtProbe = loading[stem];
      return false;
    }
    /** preload(['ui', 'loop-sea', ...] | 'all'): a promise that settles when those files are ready (or failed) */
    function preload(list) {
      if (!smpUse()) return Promise.resolve(false);
      var stems = list === 'all' ? Object.keys(AUDIO.files) : [].concat(list || []);
      return Promise.all(stems.map(function (s) {
        if (BED_FILES[s]) return preload(BED_FILES[s]);
        if (ready[s] || failed[s] || !AUDIO.files[s]) return !!ready[s];
        want(s); return loading[s] ? loading[s].then(function () { return !!ready[s]; }) : false;
      })).then(function (r) { return r.every(Boolean); });
    }
    function forgetLoops(keep) {                                // a decoded bed loop is big (20 s of stereo floats): keep the four latest
      loopUse = loopUse.filter(function (s) { return keep.indexOf(s) < 0; }).concat(keep);
      while (loopUse.length > 4) delete ready[loopUse.shift()];
    }
    function rr(bank, n) {                                      // a random variation, never the one before
      if (n < 2) return 0;
      var i = Math.floor(Math.random() * (n - 1)); if (i >= rrLast[bank]) i++;
      rrLast[bank] = i; return i;
    }
    /** sp(V, bank, at, peak, o): one recorded variation in a voice. o: i (which), midi (nearest note, retuned), rate, jit (semitones), vj (level
        jitter 0..1), dur (cut), lp / hp (Hz), dest, rel (fade-out s). Returns false when the file is not ready (the caller plays the synth). */
    function sp(V, bank, at, peak, o) {
      o = o || {};
      if (o.synth || !AUDIO || !smpOn) return false;
      var B = AUDIO.banks[bank]; if (!B) return false;
      var buf = ready[B[0]]; if (!buf) { want(B[0]); return false; }
      var segs = B[1], i = o.i !== undefined ? Math.min(segs.length - 1, o.i) : rr(bank, segs.length), rate = o.rate || 1;
      if (o.midi !== undefined && segs[0].length > 2) {
        var best = 0; for (var k = 1; k < segs.length; k++) if (Math.abs(segs[k][2] - o.midi) < Math.abs(segs[best][2] - o.midi)) best = k;
        i = best; rate *= Math.pow(2, (o.midi - segs[i][2]) / 12);
      }
      if (o.jit) rate *= Math.pow(2, rnd(-o.jit, o.jit) / 12);
      var s = segs[i], len = Math.min(s[1], o.dur || s[1]), t = V.t + (at || 0), real = len / rate, rel = Math.min(o.rel || 0.04, real * 0.5);
      var src = nd(V, ctx.createBufferSource()), g = nd(V, ctx.createGain()), head = g, pk = peak * (o.vj ? 1 - Math.random() * o.vj : 1);
      src.buffer = buf; if (src.playbackRate) src.playbackRate.value = rate;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.003);
      g.gain.setValueAtTime(pk, t + Math.max(0.004, real - rel)); g.gain.linearRampToValueAtTime(0.0001, t + real);
      if (o.lp || o.hp) {
        var fl = nd(V, ctx.createBiquadFilter()); fl.type = o.lp ? 'lowpass' : 'highpass'; fl.frequency.value = o.lp || o.hp; fl.Q.value = 0.6;
        src.connect(fl); fl.connect(g);
      } else src.connect(g);
      head.connect(o.dest || V.g);
      src.start(t, s[0], len + 0.005); src.stop(t + real + 0.03); V.srcs.push(src); scheduled++; sampled++;
      return true;
    }
    /** the harp (VCSL folk harp, CC0): a real plucked note for the lyre's place, retuned at most 3 semitones; false = use the synthesised string */
    function harp(V, f, at, peak, o) {
      if (o.synth || !smpOn) return false;
      var m = 12 * Math.log(f / 440) / Math.LN2 + 69, bank = m < 61 ? 'harplo' : 'harp', B = AUDIO && AUDIO.banks[bank];
      if (!B || !ready[B[0]]) { if (B) want(B[0]); return false; }
      var segs = B[1], best = segs[0]; for (var k = 1; k < segs.length; k++) if (Math.abs(segs[k][2] - m) < Math.abs(best[2] - m)) best = segs[k];
      if (Math.abs(best[2] - m) > 3) return false;
      var br = o.bright === undefined ? 0.5 : o.bright, dur = o.dur || 1, t = V.t + at, rate = Math.pow(2, (m - best[2]) / 12), len = Math.min(best[1], dur * rate + 0.05);
      var src = nd(V, ctx.createBufferSource()), lp = nd(V, ctx.createBiquadFilter()), g = nd(V, ctx.createGain()), pk = peak * 1.15;
      src.buffer = ready[B[0]]; if (src.playbackRate) src.playbackRate.value = rate;
      lp.type = 'lowpass'; lp.frequency.value = Math.min(16000, f * (4 + 14 * br)); lp.Q.value = 0.4;
      g.gain.setValueAtTime(pk, t); g.gain.exponentialRampToValueAtTime(pk * 0.6, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, len / rate));
      src.connect(lp); lp.connect(g); g.connect(o.dest || V.g);
      src.start(t, best[0], len); src.stop(t + len / rate + 0.03); V.srcs.push(src); scheduled++; sampled++;
      return true;
    }
    function smpState() {
      var st = { on: smpOn, use: smpUse(), dead: smpDead, fmt: fmtUsed || (ctx ? fmts()[0] : ''), base: smpBase(), loaded: Object.keys(ready), failed: Object.keys(failed),
        pending: Object.keys(loading), played: sampled, kb: Math.round(loadedKb), files: AUDIO ? Object.keys(AUDIO.files).length : 0 };
      return st;
    }
    /** samples(true | false): the recorded layer on (default) or off (synth only: the A/B in the lab); samples() = its state */
    function samples(on, keep) {
      if (on === undefined) return smpState();
      smpOn = !!on; if (keep !== false) save();
      if (smpOn && unlocked) bootSamples();
      return smpState();
    }
    /** sample(bank, {gain, rate, i}): play one recorded variation of a bank on its own (the lab lists every bank); false when not ready */
    function sample(bank, o) {
      try {
        o = o || {};
        var B = AUDIO && AUDIO.banks[bank];
        if (!B || muted || !unlocked || !ctx) return false;
        if (!ready[B[0]]) { want(B[0]); return false; }
        var seg = B[1][o.i !== undefined ? Math.min(o.i, B[1].length - 1) : 0], V = grab(o.cat || 'world', seg[1] / (o.rate || 1) + 0.2);
        if (!V) return false;
        return sp(V, bank, 0, o.gain || 0.3, o);
      } catch (e) { errors++; return false; }
    }
    var an = null, anBuf = null;
    /** meter(): the output level now, { rms, peak } in dBFS (an analyser on the master, made on the first call) */
    function meter() {
      if (!ctx || !master || !ctx.createAnalyser) return { rms: -120, peak: -120 };
      try {
        if (!an) { an = ctx.createAnalyser(); an.fftSize = 2048; master.connect(an); anBuf = new Float32Array(an.fftSize); }
        if (an.getFloatTimeDomainData) an.getFloatTimeDomainData(anBuf); else return { rms: -120, peak: -120 };
        var s = 0, pk = 0; for (var i = 0; i < anBuf.length; i++) { var v = anBuf[i]; s += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
        return { rms: Math.max(-120, 20 * Math.log(Math.sqrt(s / anBuf.length) + 1e-9) / Math.LN10), peak: Math.max(-120, 20 * Math.log(pk + 1e-9) / Math.LN10) };
      } catch (e) { return { rms: -120, peak: -120 }; }
    }
    function bootSamples() {                                    // the first tap: the UI taps and the harp (small), then the place's own files
      if (!smpUse()) return;
      want('ui'); if (!lite()) want('harp');
      if (ambPlay) preload(BED_FILES[BED[ambPlay.name][0]] || []);
    }

    /* ---------------------------------------------------------------- every sound: [duration s (or fn(o)), category, build(V, o)] */
    // every cue and world sound layers a real recording (sp) with the synth; when the recording is not loaded (or failed, or samples(false)) the
    // synthesised version plays exactly as before. o.synth = true forces the synth (the lab's A/B).
    var SND = {
      tick: [0.12, 'ui', function (V, o) {                     // a tiny real click (Kenney, CC0); synth: a marble tick
        if (sp(V, 'tick', 0, 0.18, merge(o, { jit: 1, vj: 0.2 }))) return;
        tone(V, 'triangle', 2400, 1700, 0, 0.035, 0.1, 0.001); tone(V, 'sine', 1175, 1100, 0, 0.06, 0.05, 0.002);
      }],
      tap: [0.5, 'ui', function (V, o) {                       // a soft wooden tap (VCSL woodblock, played softly) under a high harp touch
        if (sp(V, 'tap', 0, 0.16, merge(o, { jit: 0.8, vj: 0.15, lp: 6500 }))) { pluck(V, D6, 0.004, 0.045, { dur: 0.3, bright: 0.3, synth: o.synth }); return; }
        pluck(V, D6, 0, 0.13, { dur: 0.35, bright: 0.35 }); tone(V, 'sine', D5, D5, 0, 0.08, 0.04, 0.003); nz(V, 0, 0.02, 0.02, 'bandpass', 3200, 0, 1.5, 0.001);
      }],
      open: [0.85, 'ui', function (V, o) {                     // a harp rises A-D-F#, a page lifts
        pluck(V, A4, 0, 0.09, { dur: 0.6, bright: 0.45, synth: o.synth }); pluck(V, D5, 0.045, 0.1, { dur: 0.6, bright: 0.5, synth: o.synth }); pluck(V, Fs5, 0.09, 0.11, { dur: 0.7, bright: 0.55, synth: o.synth });
        if (!sp(V, 'paper', 0, 0.05, merge(o, { i: 0, dur: 0.5, rate: 1.15, hp: 900 }))) nz(V, 0, 0.28, 0.025, 'bandpass', 1600, 3600, 0.9, 0.08);
      }],
      close: [0.8, 'ui', function (V, o) {                     // the same, falling and shorter; the page settles
        pluck(V, Fs5, 0, 0.08, { dur: 0.4, bright: 0.35, synth: o.synth }); pluck(V, D5, 0.055, 0.09, { dur: 0.5, bright: 0.3, synth: o.synth });
        if (!sp(V, 'paper', 0, 0.03, merge(o, { i: 1, dur: 0.45, rate: 1.1, hp: 700 }))) nz(V, 0, 0.2, 0.02, 'bandpass', 3000, 1400, 0.9, 0.03);
      }],
      swipe: [0.6, 'ui', function (V, o) {                     // a page turned past + a faint string
        var up = o.dir !== 'back';
        if (!sp(V, 'paper', 0, 0.05, merge(o, { i: up ? 2 : 3, rate: up ? 1.25 : 1.1, hp: 1200, dur: 0.42 }))) nz(V, 0, 0.26, 0.06, 'bandpass', up ? 700 : 2600, up ? 2600 : 700, 1.1, 0.09);
        pluck(V, up ? E5 : B4, 0.16, 0.035, { dur: 0.3, bright: 0.3, synth: o.synth });
      }],
      toggle: [0.55, 'ui', function (V, o) {                   // a real small switch; on: up a fifth; off: down, muted
        var real = sp(V, 'toggle', 0, 0.02, merge(o, { jit: 0.5, rate: o.on !== false ? 1.06 : 0.92, lp: 7000 }));
        if (o.on !== false) { pluck(V, D5, 0, 0.08, { dur: 0.4, bright: 0.45, synth: o.synth }); pluck(V, A5, 0.06, 0.09, { dur: 0.5, bright: 0.5, synth: o.synth }); if (!real) tone(V, 'triangle', 1900, 0, 0, 0.02, 0.03, 0.001); }
        else { pluck(V, A5, 0, 0.07, { dur: 0.3, bright: 0.25, synth: o.synth }); pluck(V, D5, 0.06, 0.075, { dur: 0.35, bright: 0.2, synth: o.synth }); if (!real) tone(V, 'triangle', 1500, 0, 0, 0.02, 0.025, 0.001); }
      }],
      success: [2.1, 'ui', function (V, o) {                   // D - A - D on the harp, a finger cymbal's shimmer: it worked
        pluck(V, D4, 0, 0.05, { dur: 1, bright: 0.4, synth: o.synth }); pluck(V, D5, 0, 0.1, { dur: 1, bright: 0.5, synth: o.synth }); pluck(V, A5, 0.07, 0.075, { dur: 1, bright: 0.55, synth: o.synth });
        pluck(V, D6, 0.14, 0.08, { dur: 1.1, bright: 0.55, synth: o.synth });
        if (!sp(V, 'shimmer', 0.2, 0.035, merge(o, { dur: 1.6, rel: 0.8 }))) bell(V, 2349.3, 0.2, 0.016, 1.1, null, [1, 2.0, 2.76]);
      }],
      warning: [1.0, 'ui', function (V, o) {                   // two warm falling notes and a low hand chime: look at this (never harsh)
        pluck(V, B4, 0, 0.11, { dur: 0.6, bright: 0.3, synth: o.synth }); pluck(V, G4, 0.2, 0.12, { dur: 0.8, bright: 0.25, synth: o.synth });
        if (!sp(V, 'chime', 0.2, 0.035, merge(o, { midi: 67, dur: 0.75, rel: 0.4 }))) tone(V, 'sine', G3, G3, 0.2, 0.4, 0.03, 0.02);
      }],
      error: [0.8, 'ui', function (V, o) {                     // a muted low string and a dull wooden knock: it did not work (soft, never a buzzer)
        pluck(V, G4, 0, 0.12, { dur: 0.25, bright: 0.15, synth: o.synth }); pluck(V, E4, 0.13, 0.13, { dur: 0.45, bright: 0.12, synth: o.synth });
        if (!sp(V, 'tap', 0, 0.12, merge(o, { rate: 0.62, lp: 1800 }))) tone(V, 'sine', 130, 90, 0, 0.18, 0.06, 0.004);
      }],
      notify: [2.3, 'ui', function (V, o) {                    // a real hand chime over a harp note
        if (!sp(V, 'chime', 0, 0.15, merge(o, { midi: 81, dur: 2.0, rel: 1.0, vj: 0.1 }))) bell(V, A5, 0, 0.07, 1.7);
        pluck(V, D5, 0, 0.07, { dur: 1, bright: 0.4, synth: o.synth });
      }],
      money: [1.3, 'ui', function (V, o) {                     // real coins land, the harp answers up a fourth
        if (sp(V, 'coin', 0, 0.09, merge(o, { jit: 1, vj: 0.2 }))) sp(V, 'coin', 0.09, 0.06, merge(o, { jit: 1.5, vj: 0.3 }));
        else { coin(V, 0, 1); coin(V, 0.09, 0.7); }
        pluck(V, A5, 0.05, 0.07, { dur: 0.8, bright: 0.55, synth: o.synth }); pluck(V, D6, 0.13, 0.08, { dur: 1, bright: 0.6, synth: o.synth });
      }],
      levelup: [2.8, 'ui', function (V, o) { levelup(V, 1, o); }],
      rankup: [2.8, 'ui', function (V, o) { levelup(V, 1.15, o); }],
      portal: [1.8, 'ui', function (V, o) {                    // wind through a doorway and a harp run up the pentatonic
        nz(V, 0, 1.2, 0.09, 'bandpass', 300, 3200, 1.2, 0.5); tone(V, 'sine', 180, 540, 0, 1.1, 0.03, 0.5);
        [D4, E4, Fs4, A4, B4, D5, E5].forEach(function (f, i) { pluck(V, f, 0.25 + i * 0.06, 0.04 + i * 0.004, { dur: 0.8, bright: 0.5, synth: o.synth }); });
      }],
      thunder: [function () { return reduced() ? 2 : 3.6; }, 'world', function (V) {   // crack, then the long roll over the hills
        var long = reduced() ? 1.6 : 3.2;
        nz(V, 0, 0.14, 0.5, 'highpass', 1500, 600, 0.7, 0.003); nz(V, 0.05, long, 0.7, 'lowpass', 420, 60, 0.8, 0.15);
        tone(V, 'sine', 62, 34, 0.05, long, 0.35, 0.15); if (!reduced()) nz(V, 0.9, long * 0.7, 0.25, 'lowpass', 220, 70, 0.8, 0.4);
      }],
      'step-stone': [0.42, 'world', function (V, o) {         // a real heel on stone (Fantozzi, TinyWorlds; CC0); synth: a thump, a click, a scuff
        var k = o.k || 1, j = rnd(0.9, 1.1), a = o.at || 0;
        if (sp(V, 'step-stone', a, 0.11 * k, merge(o, { jit: 1.2, vj: 0.3 }))) return;
        tone(V, 'sine', 115 * j, 70 * j, a, 0.07, 0.09 * k, 0.003); nz(V, a, 0.025, 0.05 * k, 'bandpass', 1900 * j, 0, 1.2, 0.001); nz(V, a + 0.02, 0.09, 0.02 * k, 'bandpass', 700 * j, 500, 0.8, 0.02);
      }],
      'step-sand': [0.42, 'world', function (V, o) {          // real sand (or grass / leaves with {surface}); synth: a soft press and a few grains
        var k = o.k || 1, a = o.at || 0, lv = o.surface === 'leaves' || o.surface === 'grass';
        if (sp(V, lv ? 'step-leaves' : 'step-sand', a, (lv ? 0.07 : 0.08) * k, merge(o, { jit: 1.2, vj: 0.3 }))) return;
        nz(V, a, 0.12, 0.04 * k, 'lowpass', 420, 200, 0.7, 0.02);
        for (var i = 0; i < 3; i++) nz(V, a + i * 0.02 + rnd(0, 0.015), 0.03, 0.03 * k, 'highpass', rnd(2500, 4000), 0, 0.7, 0.002);
      }],
      'step-wood': [0.42, 'world', function (V, o) {          // a real wooden board; synth: a hollow board
        var k = o.k || 1, j = rnd(0.92, 1.08), a = o.at || 0;
        if (sp(V, 'step-wood', a, 0.11 * k, merge(o, { jit: 1.5, vj: 0.3 }))) return;
        tone(V, 'sine', 190 * j, 150 * j, a, 0.1, 0.09 * k, 0.002); tone(V, 'triangle', 430 * j, 0, a, 0.05, 0.03 * k, 0.001); nz(V, a, 0.06, 0.04 * k, 'bandpass', 900 * j, 0, 3, 0.001);
      }],
      hammer: [1.4, 'world', function (V, o) {                // a real hammer on a real anvil (VCSL) + a synthesised ring tail; synth: click, ring, thump
        var k = o.k || 1, a = o.at || 0, f = rnd(780, 880);
        if (sp(V, 'anvil', a, 0.55 * k, merge(o, { jit: 0.6, vj: 0.2 }))) { bell(V, f, a + 0.01, 0.022 * k, 1.2, null, [1, 2.76, 5.4]); return; }
        nz(V, a, 0.02, 0.16 * k, 'highpass', 3000, 0, 0.7, 0.001); bell(V, f, a, 0.08 * k, 1.2, null, [1, 2.76, 5.4, 8.93]); tone(V, 'sine', 95, 60, a, 0.12, 0.1 * k, 0.002);
      }],
      quill: [0.95, 'world', function (V, o) {                // a real pencil on paper (a reed pen's place); synth: short scratches
        var k = o.k || 1, a = o.at || 0, n = 5 + Math.floor(Math.random() * 4);
        if (sp(V, 'quill', a, 0.045 * k, merge(o, { jit: 0.8, vj: 0.2, lp: 9000 }))) return;
        for (var i = 0; i < n; i++) nz(V, a + i * 0.09 + rnd(0, 0.03), rnd(0.03, 0.07), 0.07 * k, 'bandpass', rnd(3500, 6000), rnd(3000, 5000), 4, 0.005);
      }],
      scroll: [1.5, 'world', function (V, o) {                // a real map unfolds (a scroll's place); synth: a long rustle, the paper's ticks
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'scroll', a, 0.18 * k, merge(o, { jit: 0.6 }))) return;
        nz(V, a, 0.8, 0.035 * k, 'bandpass', 1100, 2600, 0.9, 0.25);
        for (var i = 0; i < 6; i++) nz(V, a + 0.08 + i * 0.11, 0.012, 0.03 * k, 'highpass', 4000, 0, 1, 0.001);
        tone(V, 'sine', 160, 110, a + 0.8, 0.12, 0.05 * k, 0.005);
      }],
      coin: [0.6, 'world', function (V, o) {
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'coin', a, 0.3 * k, merge(o, { jit: 1.5, vj: 0.25 }))) return;
        coin(V, a, k); coin(V, a + 0.06, 0.5 * k, true);
      }],
      crate: [0.7, 'world', function (V, o) {                 // a real wooden crate set down; synth: a thump and the slats' rattle
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'crate', a, 0.34 * k, merge(o, { jit: 1, vj: 0.2 }))) { tone(V, 'sine', 75, 48, a, 0.25, 0.08 * k, 0.003); return; }
        tone(V, 'sine', 75, 48, a, 0.3, 0.2 * k, 0.003); nz(V, a, 0.2, 0.12 * k, 'lowpass', 500, 200, 1, 0.002);
        for (var i = 0; i < 3; i++) tone(V, 'triangle', rnd(280, 480), 0, a + 0.07 + i * rnd(0.05, 0.09), 0.05, 0.035 * k, 0.001);
      }],
      cheer: [2.8, 'world', function (V, o) {                 // a real crowd cheers and claps (CC0 recordings) on a synthesised swell
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'cheer', a, 0.14 * k, merge(o, { rel: 0.9, jit: 0.4 }))) { nz(V, a, 2.2, 0.03 * k, 'bandpass', 600, 750, 1.2, 0.35); return; }
        [[600, 0.09], [1400, 0.06], [2800, 0.025]].forEach(function (b) { nz(V, a, 2.2, b[1] * k, 'bandpass', b[0], b[0] * 1.25, 1.2, 0.35); });
        playBuf(V, clapBuf(), a + 0.15, 0.25 * k, 2200);
      }],
      groan: [1.8, 'world', function (V, o) {                 // a crowd's "ohh", falling (synthesised: no free recording fits)
        var k = o.k || 1, a = o.at || 0, lp = nd(V, ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(V.g);
        nz(V, a, 1.6, 0.08 * k, 'bandpass', 700, 430, 3, 0.2); nz(V, a, 1.5, 0.05 * k, 'bandpass', 1150, 800, 4, 0.2); tone(V, 'sawtooth', 150, 105, a, 1.5, 0.015 * k, 0.2, lp);
      }],
      door: [1.6, 'world', function (V, o) {                  // a real wooden door (qubodup, CC0); synth: the creak, the thud, the latch
        var k = o.k || 1, a = o.at || 0, t = V.t + a;
        if (sp(V, 'door', a, 0.5 * k, merge(o, { jit: 0.7, vj: 0.15 }))) return;
        var bp = nd(V, ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6; bp.connect(V.g);
        var c = tone(V, 'sawtooth', 80, 0, a, 0.8, 0.03 * k, 0.15, bp);
        for (var i = 1; i < 8; i++) c.frequency.setValueAtTime(rnd(70, 125), t + i * 0.1);
        tone(V, 'sine', 62, 40, a + 0.85, 0.35, 0.1 * k, 0.003); nz(V, a + 0.85, 0.25, 0.07 * k, 'lowpass', 300, 120, 0.8, 0.003); tone(V, 'triangle', 2100, 0, a + 1.05, 0.02, 0.04 * k, 0.001);
      }],
      fire: [1.2, 'world', function (V, o) {                  // a fire catches: a real whoosh over a synthesised roar and crackles
        var k = o.k || 1, a = o.at || 0, real = sp(V, 'whoosh', a, 0.06 * k, merge(o, { jit: 1 }));
        nz(V, a, 0.9, (real ? 0.04 : 0.1) * k, 'bandpass', 300, 1800, 0.8, 0.25); nz(V, a, 1, (real ? 0.05 : 0.1) * k, 'lowpass', 160, 0, 0.7, 0.2);
        for (var i = 0; i < 4; i++) nz(V, a + rnd(0.1, 0.8), 0.02, 0.05 * k, 'highpass', rnd(2500, 6000), 0, 0.8, 0.001);
      }],
      page: [1.0, 'world', function (V, o) {                  // a real book page turns (StarNinjas, CC0); synth: a quick rustle
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'page', a, 0.1 * k, merge(o, { jit: 0.8, vj: 0.2 }))) return;
        nz(V, a, rnd(0.18, 0.3), 0.035 * k, 'bandpass', rnd(2000, 3000), rnd(3500, 5000), 0.9, 0.06); nz(V, a + 0.2, 0.08, 0.02 * k, 'bandpass', 1500, 1000, 1, 0.01);
      }],
      chime: [2.4, 'world', function (V, o) {                 // a real hand chime (VCSL) at {midi}; synth: a small bronze bell
        var k = o.k || 1, a = o.at || 0, m = o.midi || pick([74, 78, 81, 83, 86]);
        if (sp(V, 'chime', a, 0.1 * k, merge(o, { midi: m, rel: 1.0, vj: 0.1 }))) return;
        bell(V, mtof(m), a, 0.03 * k, 2.2);
      }],
      drum: [0.9, 'world', function (V, o) {                  // a real frame drum (VCSL); synth: a soft low thump
        var k = o.k || 1, a = o.at || 0;
        if (sp(V, 'drum', a, 0.07 * k, merge(o, { jit: 0.5, vj: 0.2 }))) return;
        tone(V, 'sine', 75, 50, a, 0.25, 0.06 * k, 0.004);
      }],
      jingle: [0.9, 'world', function (V, o) {                // a person's things as they move: keys, armour, beads, cloth, a coin pouch, small bells, leaves
        var k = o.k || 1, a = o.at || 0, kind = JINGLES.indexOf(o.kind) >= 0 ? o.kind : 'beads';
        if (sp(V, kind, a, (kind === 'cloth' || kind === 'rustle' ? 0.2 : 0.16) * k, merge(o, { jit: 1.5, vj: 0.3, dur: 0.55 }))) return;
        if (kind === 'cloth' || kind === 'rustle') { nz(V, a, 0.22, 0.02 * k, 'bandpass', kind === 'cloth' ? 1400 : 3200, 0, 0.8, 0.05); return; }
        for (var i = 0; i < 3; i++) tone(V, 'sine', rnd(3200, 5200) * (kind === 'metal' ? 0.6 : 1), 0, a + i * rnd(0.03, 0.07), 0.12, 0.012 * k, 0.001);
      }]
    };
    function levelup(V, k, o) {                                 // the harp runs D-F#-A-D-F#-A, a real chime crowns it, a soft swell under
      o = o || {};
      [D4, Fs4, A4, D5, Fs5, A5].forEach(function (f, i) { pluck(V, f, i * 0.075, (0.07 + i * 0.006) * k, { dur: 1.4, bright: 0.55, synth: o.synth }); });
      if (!sp(V, 'chime', 0.5, 0.12 * k, merge(o, { midi: 86, dur: 2.0, rel: 1.1 }))) bell(V, D6, 0.5, 0.05 * k, 1.8);
      sp(V, 'shimmer', 0.52, 0.025 * k, merge(o, { dur: 1.6, rel: 0.9 }));
      tone(V, 'sine', D4, D4, 0, 1.6, 0.03 * k, 0.3); tone(V, 'sine', A4, A4, 0.1, 1.5, 0.02 * k, 0.3);
    }

    /* ---------------------------------------------------------------- play / at / world */
    function resolve(name, opts) {
      name = String(name || ''); var a = ALIAS[name], r = !a ? [name, null] : typeof a === 'string' ? [a, null] : a;
      if (r[0] === 'step-stone' && opts && SND['step-' + opts.surface]) r = ['step-' + opts.surface, r[1]];   // step + {surface: 'sand' | 'wood' | 'stone'}
      else if (r[0] === 'step-stone' && opts && (opts.surface === 'grass' || opts.surface === 'leaves')) r = ['step-sand', r[1]];   // grass / leaves: the leaves recording
      return r;
    }
    function gated(n) { return CUES.indexOf(n) >= 0 || WORLD.indexOf(n) >= 0; }
    function fire(n, o, dest, extra, cat, key) {
      var d = SND[n], now = Date.now(), k = key || n;
      if (lastAt[k] && now - lastAt[k] < 30) { (extra || []).forEach(function (x) { try { x.disconnect(); } catch (e) {} }); return true; }   // the same sound twice in 30 ms: once
      lastAt[k] = now;
      var V = grab(cat || d[1], typeof d[0] === 'function' ? d[0](o) : d[0], dest, extra);
      if (!V) return false;
      if (o.gain !== undefined) V.g.gain.value = clamp(o.gain, 0, 2);
      d[2](V, o);
      return true;
    }
    function play(name, opts) {
      try {
        var r = resolve(name, opts), n = r[0], o = merge(r[1], opts);
        if (NAMES.indexOf(n) < 0) return false;
        if (muted) return false;
        if (gated(n) && !soundAllowed()) return false;          // cues and world sounds follow the Sound switch
        if (!unlocked || !ctx) return false;                    // nothing before a user gesture
        resumeIfNeeded();
        if (n === 'pad') { startPad(); return true; }
        var ok = fire(n, o);
        if (ok) haptic(n);
        return ok;
      } catch (e) { errors++; return false; }
    }
    function toLocal(p, L) {
      var P = (L && L.position) || L || {}, lx = +P.x || 0, ly = +P.y || 0, lz = +P.z || 0, yaw = 0;
      if (L && typeof L.yaw === 'number') yaw = L.yaw;
      else if (L && L.forward) yaw = Math.atan2(-(+L.forward.x || 0), -(+L.forward.z || 0));
      else if (L && L.rotation && typeof L.rotation.y === 'number') yaw = L.rotation.y;
      var dx = (+p.x || 0) - lx, dy = (+p.y || 0) - ly, dz = (+p.z || 0) - lz, c = Math.cos(yaw), s = Math.sin(yaw);
      return { x: dx * c - dz * s, y: dy, z: dx * s + dz * c };     // listener space: -z ahead, +x right (three.js convention)
    }
    function spatial(rel, dist, o, cat, maxD) {
      var ref = o.ref || 2, roll = o.rolloff || 1.1, ex = [], to = CB[cat].bus, head;
      if (ctx.createPanner) {
        var p = ctx.createPanner();
        try { p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = maxD; p.rolloffFactor = roll; } catch (e) {}
        if (p.positionX) { p.positionX.value = rel.x; p.positionY.value = rel.y; p.positionZ.value = rel.z; } else if (p.setPosition) p.setPosition(rel.x, rel.y, rel.z);
        p.connect(to); ex.push(p); head = p;
      } else {
        var g = gain(ref / (ref + roll * Math.max(0, dist - ref)), to); ex.push(g); head = g;
        if (ctx.createStereoPanner) { var sp = ctx.createStereoPanner(); sp.pan.value = clamp(rel.x / (Math.abs(rel.x) + Math.abs(rel.z) + 0.5), -1, 1); sp.connect(g); ex.push(sp); head = sp; }
      }
      if (dist > 8) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000 / (1 + dist / 8); lp.connect(head); ex.push(lp); head = lp; }   // air takes the highs
      return { node: head, extra: ex };
    }
    /** at('step-stone', {x,y,z}, listener?, opts?): a sound placed in the scene. listener = {x,y,z,yaw} | {position, rotation} (a three.js camera) | {x,y,z, forward} */
    function at(name, pos, lis, opts) {
      try {
        var r = resolve(name, opts), n = r[0], o = merge(r[1], opts);
        if (NAMES.indexOf(n) < 0 || n === 'pad') return false;
        if (muted || !soundAllowed() || !unlocked || !ctx) return false;
        var rel = toLocal(pos || {}, lis || hearL || {}), dist = Math.sqrt(rel.x * rel.x + rel.y * rel.y + rel.z * rel.z), maxD = o.max || MAXD;
        if (dist > maxD) return false;                          // out of earshot: nothing built
        var cat = SND[n][1] === 'ui' ? 'world' : SND[n][1], ch = spatial(rel, dist, o, cat, maxD);
        resumeIfNeeded();
        return fire(n, o, ch.node, ch.extra, cat, n + '@' + Math.round(pos && pos.x || 0) + ',' + Math.round(pos && pos.z || 0));
      } catch (e) { errors++; return false; }
    }

    /* ---------------------------------------------------------------- the old warm pad (play('pad') / stop('pad')) */
    function startPad() {
      if (padNode || reduced()) return;
      var t = ctx.currentTime, g = gain(0, CB.ambience.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 3);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.connect(g);
      var oscs = [73.42, 110, 146.83, 220, 277.18].map(function (f, i) {
        var o = ctx.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 2) * 5;
        var og = gain(0.22, lp); o.connect(og); o.start(t); scheduled++; return o;
      });
      var lf = ctx.createOscillator(), lg = gain(260, lp.frequency); lf.frequency.value = 0.06; lf.connect(lg); lf.start(t);
      padNode = { g: g, oscs: oscs.concat([lf]) };
    }
    function stopPad() {
      if (!padNode || !ctx) return;
      var p = padNode, t = ctx.currentTime; padNode = null;
      try {
        p.g.gain.cancelScheduledValues(t); p.g.gain.setValueAtTime(0.1, t); p.g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
        p.oscs.forEach(function (o) { o.stop(t + 1.6); });
        setTimeout(function () { try { p.g.disconnect(); } catch (e) {} }, 1800);
      } catch (e) { errors++; }
    }

    /* ---------------------------------------------------------------- ambience: layered, evolving beds (random drift, not loops you notice) */
    function pink() {                                           // one long soft noise loop shared by every bed (crossfaded seam)
      if (pinkB) return pinkB;
      var sr = ctx.sampleRate, n = Math.max(4, Math.floor(sr * (lite() ? 3.7 : 7.3))), F = Math.max(2, Math.floor(sr * 0.25)), tmp = new Float32Array(n + F);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, s = 987654321, i;
      for (i = 0; i < n + F; i++) {
        s = (s * 1664525 + 1013904223) >>> 0; var w = (s / 4294967296) * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      var b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (i = 0; i < n; i++) d[i] = i < F ? tmp[i] * (i / F) + tmp[n + i] * (1 - i / F) : tmp[i];
      return (pinkB = b);
    }
    function synIn(B) { if (!B.syn) { B.syn = gain(1, B.inp); B.nodes.push(B.syn); } return B.syn; }   // the synthesised texture's own gain (steps back for a recording)
    function layer(B, type, f, q, g0) {                         // pink loop -> filter -> drift gain -> swell gain -> bed
      var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = gain(g0), sw = gain(1, synIn(B));
      src.buffer = pink(); src.loop = true; if (src.playbackRate) src.playbackRate.value = rnd(0.9, 1.1);
      fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
      src.connect(fl); fl.connect(g); g.connect(sw);
      src.start(0, Math.random() * 3); scheduled++;
      B.srcs.push(src); B.nodes.push(fl, g, sw);
      return { f: fl, g: g, sw: sw };
    }
    function every(min, max, fn) {                              // a self-rescheduling random timer; { on, id }
      var h = { id: 0, on: true };
      (function next() { h.id = setTimeout(function () { if (!h.on) return; try { fn(); } catch (e) { errors++; } next(); }, min + Math.random() * (max - min)); })();
      return h;
    }
    function ev(B, min, max, fn) { B.timers.push(every(min, max, fn)); }
    function drift(B, param, lo, hi, min, max) {                // a slow random walk: the bed never repeats
      param.value = (lo + hi) / 2;
      ev(B, min, max, function () { param.setTargetAtTime(rnd(lo, hi), ctx.currentTime, (min + max) / 6000); });
    }
    function swell(param, peak, up, down, base) {
      var t = ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(peak, t, up / 3); param.setTargetAtTime(base === undefined ? 1 : base, t + up, down / 3);
    }
    function bv(B, dur, pan) {                                  // an event voice inside a bed (panned), or null when the bed is busy
      var dest = B.inp, ex = [];
      if (pan && ctx.createStereoPanner) { var pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1); pn.connect(B.inp); dest = pn; ex = [pn]; }
      return grab('ambience', dur, dest, ex);
    }
    /** a recorded event inside a bed: sev(B, 'gull', pan, peak, o) -> true when the recording played (else the caller plays its synth) */
    function sev(B, bank, pan, peak, o, dur) {
      var b = AUDIO && AUDIO.banks[bank];
      if (!b || !ready[b[0]] || !smpOn) { if (b) want(b[0]); return false; }
      var V = bv(B, dur || 3.5, pan); if (!V) return true;      // busy: skip the event (as the synth does)
      return sp(V, bank, 0, peak, o || {});
    }
    var XF_CURVE = null;
    function xfCurve(up) {                                      // equal-power fade (a quarter sine): two textures crossfaded never dip
      if (!XF_CURVE) { XF_CURVE = [new Float32Array(64), new Float32Array(64)]; for (var i = 0; i < 64; i++) { XF_CURVE[0][i] = Math.sin(i / 63 * Math.PI / 2) * 0.999 + 0.0001; XF_CURVE[1][i] = Math.cos(i / 63 * Math.PI / 2) * 0.999 + 0.0001; } }
      return XF_CURVE[up ? 0 : 1];
    }
    /** rec(B, 'sea', {gain, lp, hp, syn, pan, rate}): a recorded loop under the bed. A crossfading looper plays passes of 45-80 % of the file from a
        random place (2 s equal-power crossfades, +/- 1.5 % speed), so the bed never repeats. It fades in when the file is ready; the synth texture
        steps back to o.syn (default 0.35). Skipped in LITE and with Data Saver. Returns { sw } (a gain the bed can swell) or null. */
    function rec(B, name, o) {
      o = o || {};
      var L = AUDIO && AUDIO.loops[name];
      if (!L || !smpOn || lite() || saveData()) return null;
      var R = { sw: gain(o.base === undefined ? 1 : o.base), g: gain(0.0001), on: true }, head = R.sw;
      B.nodes.push(R.sw, R.g);
      if (o.lp || o.hp) { var fl = ctx.createBiquadFilter(); fl.type = o.lp ? 'lowpass' : 'highpass'; fl.frequency.value = o.lp || o.hp; fl.Q.value = 0.5; R.sw.connect(fl); head = fl; B.nodes.push(fl); }
      if (o.lp && o.hp) { var f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = o.hp; head.connect(f2); head = f2; B.nodes.push(f2); }
      head.connect(R.g); R.g.connect(B.inp);
      B.recs = (B.recs || []).concat([L[0]]);
      want(L[0], function (buf) {
        if (B.dead || !ctx) return;
        R.live = true;
        var t = ctx.currentTime, len = Math.min(L[1], buf.duration), XF = Math.min(2, len * 0.15);
        R.g.gain.setValueAtTime(0.0001, t); R.g.gain.linearRampToValueAtTime(o.gain || 0.3, t + 2.5);
        if (B.syn) B.syn.gain.setTargetAtTime(o.syn === undefined ? 0.35 : o.syn, t, 1.2);
        function pass(at) {
          if (B.dead || !ctx) return;
          var seg = len * rnd(0.45, 0.8), off = Math.random() * Math.max(0, len - seg), src = ctx.createBufferSource(), g = ctx.createGain();
          src.buffer = buf; if (src.playbackRate) src.playbackRate.value = o.rate === false ? 1 : rnd(0.985, 1.015);
          g.gain.value = 0.0001;                                // two equal-power curves, nothing else on this gain (curves may not share a time with other events)
          var up = false;
          try { g.gain.setValueCurveAtTime(xfCurve(true), at, XF); up = true; g.gain.setValueCurveAtTime(xfCurve(false), at + seg - XF, XF); }
          catch (e) {
            try { if (!up) { g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(1, at + XF); } g.gain.setValueAtTime(1, at + seg - XF); g.gain.linearRampToValueAtTime(0.0001, at + seg); } catch (x) { errors++; }
          }
          src.connect(g); g.connect(R.sw); src.start(at, off, seg + 0.05); src.stop(at + seg + 0.1); scheduled++; sampled++;
          B.srcs.push(src); B.nodes.push(g);
          src.onended = function () { try { g.disconnect(); src.disconnect(); } catch (e) {} var k = B.srcs.indexOf(src); if (k >= 0) B.srcs.splice(k, 1); k = B.nodes.indexOf(g); if (k >= 0) B.nodes.splice(k, 1); };
          var h = { on: true, id: 0 }; B.timers.push(h);
          h.id = setTimeout(function () { var i = B.timers.indexOf(h); if (i >= 0) B.timers.splice(i, 1); if (h.on) pass(at + seg - XF); }, Math.max(50, (at + seg - XF - ctx.currentTime - 1.5) * 1000));
        }
        pass(t + 0.05);
      });
      return R;
    }
    function steps(B, kind, n, gap, k, pan, surf) {
      var V = bv(B, n * gap + 0.5, pan); if (!V) return;
      for (var i = 0; i < n; i++) SND[kind][2](V, { at: i * gap * rnd(0.94, 1.06), k: k, surface: surf });
    }
    function chatter(B) {
      var V = bv(B, 0.45, rnd(-0.8, 0.8)); if (!V) return;
      for (var i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
        var a = i * rnd(0.08, 0.14), dd = rnd(0.05, 0.11), p = rnd(0.012, 0.03);
        nz(V, a, dd, p, 'bandpass', rnd(350, 900), rnd(300, 1000), 5, 0.02); nz(V, a, dd, p * 0.5, 'bandpass', rnd(1100, 2400), 0, 6, 0.02);
      }
    }
    var BUILD = {
      marble: function (B, o) {                                 // a marble hall: low room tone, moving air, a far crowd murmur, far footsteps, a water clock
        var rt = layer(B, 'lowpass', 170, 0.5, 0.38), air = layer(B, 'bandpass', 1300, 0.6, 0.05);
        drift(B, rt.g.gain, 0.26, 0.45, 4000, 9000); drift(B, air.f.frequency, 900, 1800, 6000, 12000); drift(B, air.g.gain, 0.03, 0.07, 5000, 10000);
        var far = rec(B, 'crowd', { gain: 0.1, lp: 520, syn: 0.8 }); if (far) drift(B, far.sw.gain, 0.5, 1.2, 6000, 14000);
        ev(B, 9000, 22000, function () { steps(B, 'step-stone', 3 + Math.floor(Math.random() * 5), 0.56, 0.3, rnd(-0.8, 0.8)); });
        ev(B, o.drip ? 4000 : 9000, o.drip ? 11000 : 20000, function () { var V = bv(B, 0.5, rnd(-0.6, 0.6)); if (V) tone(V, 'sine', rnd(1500, 2100), rnd(1000, 1300), 0, 0.09, 0.03, 0.002); });
        ev(B, 20000, 45000, function () { if (!sev(B, 'chime', rnd(-0.5, 0.5), 0.03, { midi: pick([78, 81, 86]), rel: 1.2 })) { var V = bv(B, 2.6, rnd(-0.5, 0.5)); if (V) bell(V, pick([Fs5, A5, D6]), 0, 0.012, 2.5); } });
      },
      agora: function (B, o) {                                  // the agora: a real crowd, three moving voice formants, chatter, birds over the roofs, a pottery clink, feet
        if (o.far) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(B.inp); B.nodes.push(lp); B.inp = lp; }
        var m1 = layer(B, 'bandpass', 380, 1.4, 0.28), m2 = layer(B, 'bandpass', 1000, 2, 0.14), m3 = layer(B, 'bandpass', 2300, 2.5, 0.04), lo = layer(B, 'lowpass', 200, 0.5, 0.2);
        drift(B, m1.f.frequency, 320, 460, 3000, 7000); drift(B, m1.g.gain, 0.2, 0.34, 2000, 5000); drift(B, m2.f.frequency, 850, 1250, 3000, 7000);
        drift(B, m2.g.gain, 0.08, 0.18, 2000, 5000); drift(B, m3.g.gain, 0.02, 0.06, 3000, 6000); drift(B, lo.g.gain, 0.12, 0.25, 5000, 9000);
        var cr = rec(B, 'crowd', { gain: o.far ? 0.2 : 0.27, lp: o.far ? 900 : 2200, syn: 0.45 }); if (cr) drift(B, cr.sw.gain, 0.6, 1.15, 4000, 10000);
        if (!o.far) rec(B, 'birds', { gain: 0.07, hp: 1800 });
        ev(B, o.far ? 900 : 300, o.far ? 2400 : 1000, function () { chatter(B); });
        ev(B, 7000, 18000, function () { var V = bv(B, 0.5, rnd(-0.7, 0.7)); if (V) bell(V, rnd(1400, 2200), 0, 0.015, 0.35, null, [1, 2.3, 3.9]); });
        ev(B, 6000, 15000, function () { steps(B, 'step-stone', 2 + Math.floor(Math.random() * 3), 0.5, 0.25, rnd(-0.9, 0.9)); });
      },
      workshop: function (B, o) {                               // the workshop: a real fire, its crackle, hammer on a real anvil, the quench, the bellows
        var h = o.hammer || 0, fire = layer(B, 'lowpass', 230, 0.7, 0.45), roar = layer(B, 'bandpass', 520, 0.8, 0.08);
        drift(B, fire.g.gain, 0.3, 0.55, 1500, 4000); drift(B, fire.f.frequency, 160, 320, 2000, 5000); drift(B, roar.g.gain, 0.04, 0.12, 2000, 5000);
        var fr = rec(B, 'fire', { gain: 1.0, syn: 0.4 }); if (fr) drift(B, fr.sw.gain, 0.7, 1.2, 2000, 6000);
        ev(B, 70, 380, function () { if (fr && fr.live && Math.random() < 0.6) return; var V = bv(B, 0.12, rnd(-0.4, 0.4)); if (V) nz(V, 0, rnd(0.006, 0.03), rnd(0.02, 0.08), 'highpass', rnd(2200, 6000), 0, 0.8, 0.001); });
        ev(B, h > 0.6 ? 5000 : 11000, h > 0.6 ? 11000 : 24000, function () {
          var n = 2 + Math.floor(Math.random() * 3), V = bv(B, n * 0.55 + 2.3, rnd(-0.5, 0.5)); if (!V) return;
          for (var i = 0; i < n; i++) SND.hammer[2](V, { at: i * 0.55 * rnd(0.95, 1.05), k: i === n - 1 ? 0.6 : 0.45 });
          if (Math.random() < 0.5) nz(V, n * 0.55 + 0.2, 1.0, 0.03, 'highpass', 5200, 3000, 0.5, 0.05);
        });
        ev(B, 9000, 22000, function () { var V = bv(B, 2, 0); if (V) nz(V, 0, 1.6, 0.06, 'lowpass', 380, 620, 0.7, 0.6); });
      },
      desert: function (B, o) {                                 // real desert wind and gusts, a whistle over the dunes, real camel bells passing
        var w = layer(B, 'bandpass', 520, 0.7, 0.4), wh = layer(B, 'bandpass', 1800, 9, 0.015), hs = layer(B, 'highpass', 5500, 0.5, 0.018);
        drift(B, w.f.frequency, 280, 900, 3000, 8000); drift(B, w.g.gain, 0.2, 0.6, 2000, 6000); drift(B, wh.f.frequency, 1300, 2600, 4000, 9000);
        drift(B, wh.g.gain, 0.004, 0.025, 3000, 7000); drift(B, hs.g.gain, 0.008, 0.03, 3000, 7000);
        var wd = rec(B, 'wind', { gain: 0.24, syn: 0.4 }), gu = rec(B, 'gusts', { gain: 0.19, base: 0.5 });
        ev(B, 6000, 15000, function () { var up = rnd(1, 2), dn = rnd(2, 4), pk = rnd(1.5, 2.1); swell(w.sw.gain, pk, up, dn); if (gu) swell(gu.sw.gain, pk * 0.8, up, dn, 0.5); });
        if (wd) drift(B, wd.sw.gain, 0.6, 1.2, 4000, 9000);
        if (o.bells !== false) ev(B, 7000, 18000, function () {
          var n = 2 + Math.floor(Math.random() * 4), f = rnd(380, 520), pan = rnd(-0.7, 0.7), V = bv(B, n * 0.75 + 1.5, pan); if (!V) return;
          for (var i = 0, a = 0; i < n; i++, a += rnd(0.32, 0.75)) {
            var k = rnd(0.6, 1);
            if (!sp(V, 'camel', a, 0.05 * k, { jit: 1, rel: 0.5 })) { bell(V, f, a, 0.03 * k, 0.9, null, [1, 1.86, 2.71]); tone(V, 'triangle', f * 0.5, 0, a, 0.06, 0.01 * k, 0.002); }
          }
        });
      },
      harbour: function (B) {                                   // the harbour: real waves on the shore, swells breaking, real gulls, water lapping, a rope creaks
        var sea = layer(B, 'lowpass', 480, 0.5, 0.3), wash = layer(B, 'bandpass', 1100, 0.6, 0.08);
        var rs = rec(B, 'sea', { gain: 0.44, syn: 0.4 });
        ev(B, 4200, 9000, function () {
          var up = rnd(1.4, 2.4), dn = rnd(2.5, 4), t = ctx.currentTime;
          swell(sea.sw.gain, rnd(1.6, 2.3), up, dn); swell(wash.sw.gain, rnd(1.8, 2.8), up + 0.3, dn);
          sea.f.frequency.setTargetAtTime(rnd(650, 900), t, up / 3); sea.f.frequency.setTargetAtTime(480, t + up, dn / 3);
          if (rs && rs.live && Math.random() < 0.5) setTimeout(function () { if (ambPlay && ambPlay.B === B) sev(B, 'wave', rnd(-0.5, 0.5), 0.09, { jit: 1, rel: 1.2 }); }, up * 600);
        });
        ev(B, 900, 2800, function () { var V = bv(B, 0.3, rnd(-0.6, 0.6)); if (!V) return; nz(V, 0, rnd(0.06, 0.14), rnd(0.02, 0.045), 'lowpass', rnd(400, 800), rnd(200, 300), 2, 0.01); tone(V, 'sine', rnd(260, 420), 200, 0, 0.06, 0.01, 0.005); });
        ev(B, 7000, 22000, function () {
          if (sev(B, 'gull', rnd(-0.8, 0.8), 0.06, { jit: 1.5, vj: 0.4, lp: 7000 })) return;
          var n = 1 + Math.floor(Math.random() * 3), V = bv(B, n * 0.6 + 0.6, rnd(-0.8, 0.8)); if (!V) return;
          for (var i = 0; i < n; i++) {
            var a = V.t + i * rnd(0.35, 0.6), f = rnd(1300, 1800), o = nd(V, ctx.createOscillator()), bp = nd(V, ctx.createBiquadFilter()), g = nd(V, ctx.createGain());
            o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.8, a); o.frequency.linearRampToValueAtTime(f * 1.25, a + 0.08); o.frequency.linearRampToValueAtTime(f, a + 0.22); o.frequency.linearRampToValueAtTime(f * 0.7, a + 0.38);
            bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2; envl(g.gain, a, 0.03, 0.03, 0.4);
            o.connect(bp); bp.connect(g); g.connect(V.g); o.start(a); o.stop(a + 0.45); V.srcs.push(o); scheduled++;
          }
        });
        ev(B, 12000, 30000, function () {
          var V = bv(B, 1.2, rnd(-0.5, 0.5)); if (!V) return;
          var bp = nd(V, ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 5; bp.connect(V.g); tone(V, 'sawtooth', 80, 120, 0, 0.6, 0.012, 0.2, bp);
        });
      },
      night: function (B, o) {                                  // a warm night: real crickets, the synth's crickets that come and go, a far owl, the stars' faint ring
        var air = layer(B, 'lowpass', 400, 0.5, o.stars ? 0.12 : 0.18); drift(B, air.g.gain, 0.08, 0.2, 4000, 9000);
        var cr = rec(B, 'crickets', { gain: o.stars ? 0.11 : 0.24, syn: 0.7, lp: 9000 }); if (cr) drift(B, cr.sw.gain, 0.55, 1.1, 5000, 12000);
        if (o.stars) {
          var dg = gain(1, B.inp); B.nodes.push(dg); drift(B, dg.gain, 0.5, 1, 5000, 12000);
          [[55, 0.03], [82.41, 0.015]].forEach(function (x) { var os = ctx.createOscillator(), g = gain(x[1], dg); os.type = 'sine'; os.frequency.value = x[0]; os.connect(g); os.start(0); scheduled++; B.osc.push(os); B.nodes.push(g); });
          ev(B, 15000, 35000, function () { var V = bv(B, 3.2, rnd(-0.7, 0.7)); if (V) bell(V, pick([A5, D6, E6]), 0, 0.008, 3); });
        }
        for (var c = 0; c < (o.stars ? 1 : 2); c++) (function () {
          var cr2 = { f: rnd(4200, 4900), pan: rnd(-0.85, 0.85), k: rnd(0.5, 1), on: Math.random() < 0.7 }, rate = rnd(600, 1100);
          ev(B, rate * 0.9, rate * 1.1, function () { if (!cr2.on) return; var V = bv(B, 0.25, cr2.pan); if (!V) return; for (var i = 0, n = 3 + (Math.random() < 0.5 ? 1 : 0); i < n; i++) tone(V, 'sine', cr2.f, 0, i * 0.045, 0.022, 0.012 * cr2.k * (cr && cr.live ? 0.6 : 1), 0.004); });
          ev(B, 4000, 14000, function () { cr2.on = !cr2.on; });
        })();
        ev(B, 25000, 60000, function () { var V = bv(B, 1.6, rnd(-0.7, 0.7)); if (!V) return; tone(V, 'sine', 380, 355, 0, 0.38, 0.03, 0.12); tone(V, 'sine', 372, 350, 0.55, 0.6, 0.035, 0.15); });
      },
      library: function (B) {                                   // a library hush: real pages turn, a pen scratches, a map unfolds, far steps
        var hush = layer(B, 'lowpass', 160, 0.5, 0.22), air = layer(B, 'highpass', 4500, 0.5, 0.01);
        drift(B, hush.g.gain, 0.15, 0.28, 5000, 10000); drift(B, air.g.gain, 0.005, 0.015, 5000, 10000);
        ev(B, 6000, 16000, function () { var V = bv(B, 1.1, rnd(-0.6, 0.6)); if (V) SND.page[2](V, { k: 0.45 }); });
        ev(B, 10000, 25000, function () { var V = bv(B, 1.2, rnd(-0.5, 0.5)); if (V) SND.quill[2](V, { k: 0.55 }); });
        ev(B, 25000, 55000, function () { var V = bv(B, 1.6, rnd(-0.5, 0.5)); if (V) SND.scroll[2](V, { k: 0.45 }); });
        ev(B, 20000, 45000, function () { steps(B, 'step-stone', 2 + Math.floor(Math.random() * 3), 0.6, 0.2, rnd(-0.9, 0.9)); });
      },
      colosseum: function (B) {                                 // the colosseum: a real crowd that swells into real applause and cheers, frame drums
        var c1 = layer(B, 'bandpass', 520, 0.6, 0.38), c2 = layer(B, 'bandpass', 1250, 0.8, 0.17), c3 = layer(B, 'bandpass', 2900, 1, 0.05), lo = layer(B, 'lowpass', 150, 0.5, 0.2);
        drift(B, c1.f.frequency, 450, 650, 3000, 7000); drift(B, c2.g.gain, 0.12, 0.22, 2000, 5000); drift(B, lo.g.gain, 0.12, 0.25, 4000, 8000);
        var cr = rec(B, 'crowd', { gain: 0.38, syn: 0.4 }), ap = rec(B, 'applause', { gain: 0.2, base: 0.0001 });
        ev(B, 14000, 32000, function () {
          var up = rnd(1, 2), dn = rnd(3, 5), pk = rnd(1.6, 2.4); swell(c1.sw.gain, pk, up, dn); swell(c2.sw.gain, pk, up, dn); swell(c3.sw.gain, pk * 1.4, up, dn);
          if (cr) swell(cr.sw.gain, pk * 0.7, up, dn);
          if (ap && ap.live) swell(ap.sw.gain, rnd(0.7, 1), up, dn + 1, 0.0001);
          else { var V = bv(B, 2.4, rnd(-0.3, 0.3)); if (V) playBuf(V, clapBuf(), up * 0.5, 0.06, 2200); }
        });
        ev(B, 20000, 40000, function () { var n = 4 + Math.floor(Math.random() * 5), V = bv(B, n * 0.5 + 1, rnd(-0.3, 0.3)); if (!V) return; for (var i = 0; i < n; i++) SND.drum[2](V, { at: i * 0.5, k: i % 2 ? 0.35 : 0.6 }); });
        ev(B, 700, 1800, function () { if (cr && cr.live && Math.random() < 0.6) return; chatter(B); });
      },
      grove: function (B) {                                     // an olive grove: real birdsong and a brook, leaves, single birds, a far dove
        var lv = layer(B, 'highpass', 2800, 0.5, 0.1), air = layer(B, 'lowpass', 300, 0.5, 0.1);
        drift(B, lv.g.gain, 0.05, 0.16, 2000, 5000); drift(B, lv.f.frequency, 2300, 3600, 3000, 7000); drift(B, air.g.gain, 0.06, 0.14, 4000, 9000);
        var bd = rec(B, 'birds', { gain: 0.27, syn: 0.5 }); rec(B, 'brook', { gain: 0.05, lp: 6000 });
        if (bd) drift(B, bd.sw.gain, 0.6, 1.1, 5000, 11000);
        ev(B, 3000, 10000, function () {
          if (Math.random() < 0.5 && sev(B, 'chirp', rnd(-0.8, 0.8), 0.04, { jit: 2, vj: 0.4 })) return;
          var V = bv(B, 1.2, rnd(-0.8, 0.8)); if (!V) return;
          for (var i = 0, n = 2 + Math.floor(Math.random() * 4), base = rnd(2300, 3800); i < n; i++) { var f = base * pick([1, 1.12, 1.26, 0.89, 1.5]); tone(V, 'sine', f, f * rnd(0.85, 1.2), i * rnd(0.09, 0.16), rnd(0.05, 0.12), 0.018, 0.01); }
        });
        ev(B, 9000, 20000, function () { sev(B, 'rustle', rnd(-0.8, 0.8), 0.05, { jit: 1, vj: 0.4, lp: 8000 }); });
        ev(B, 20000, 45000, function () { var V = bv(B, 1.4, rnd(-0.7, 0.7)); if (!V) return; tone(V, 'sine', 520, 480, 0, 0.3, 0.02, 0.08); tone(V, 'sine', 470, 440, 0.45, 0.5, 0.022, 0.1); });
      },
      temple: function (B, o) {                                 // real wind through the columns; real chimes (mark trees, hand chimes) stir when a gust comes
        var ch = o.chimes || 0, w = layer(B, 'bandpass', 430, 0.8, 0.35), col = layer(B, 'bandpass', 820, 10, 0.02), lo = layer(B, 'lowpass', 140, 0.5, 0.15);
        drift(B, w.f.frequency, 300, 650, 4000, 9000); drift(B, w.g.gain, 0.22, 0.42, 3000, 7000); drift(B, col.f.frequency, 650, 1100, 5000, 11000);
        drift(B, col.g.gain, 0.008, 0.03, 4000, 9000); drift(B, lo.g.gain, 0.1, 0.2, 5000, 10000);
        var wd = rec(B, 'wind', { gain: 0.25, lp: 1600, syn: 0.5 });
        function chimes(n) {
          if (Math.random() < 0.5 && sev(B, 'windchime', rnd(-0.7, 0.7), 0.04 * (0.6 + ch * 0.4), { rel: 1.5, jit: 0.5 }, 6)) return;
          var V = bv(B, 3.6, rnd(-0.7, 0.7)); if (!V) return;
          for (var i = 0; i < n; i++) if (!sp(V, 'chime', i * rnd(0.15, 0.45), 0.03, { midi: pick([81, 83, 86, 88, 90]), dur: 2, rel: 1 })) bell(V, pick(CHIME), i * rnd(0.15, 0.45), 0.02, 2.8, null, [1, 2.0, 3.01, 4.1]);
        }
        ev(B, 7000, 16000, function () {
          swell(w.sw.gain, rnd(1.4, 1.9), rnd(1.2, 2.2), rnd(2.5, 4)); if (wd) swell(wd.sw.gain, rnd(1.3, 1.7), rnd(1.2, 2.2), rnd(2.5, 4));
          if (Math.random() < ch) setTimeout(function () { if (ambPlay && ambPlay.B === B) chimes(1 + Math.floor(Math.random() * (1 + ch * 2))); }, rnd(600, 1600));
        });
        if (ch > 0.5) ev(B, 9000, 20000, function () { chimes(1); });
      },
      treasury: function (B) {                                  // the treasury: a hush, real coins counted, now and then a real pour
        var h = layer(B, 'lowpass', 200, 0.5, 0.12); drift(B, h.g.gain, 0.08, 0.16, 4000, 9000);
        ev(B, 5000, 14000, function () {
          if (Math.random() < 0.4 && sev(B, 'count', rnd(-0.6, 0.6), 0.05, { jit: 1, vj: 0.3 })) return;
          var V = bv(B, 0.9, rnd(-0.6, 0.6)); if (!V) return; for (var i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) SND.coin[2](V, { at: i * rnd(0.06, 0.16), k: rnd(0.25, 0.5) });
        });
        ev(B, 30000, 65000, function () {
          if (sev(B, 'pour', rnd(-0.4, 0.4), 0.06, { jit: 1 })) return;
          var n = 8 + Math.floor(Math.random() * 7), V = bv(B, 1.8, rnd(-0.4, 0.4)); if (!V) return; for (var i = 0; i < n; i++) coin(V, i * 0.07 * rnd(0.7, 1.3), (1 - i / n) * 0.6 + 0.2, true);
        });
      }
    };
    function ambStop() {
      var p = ambPlay; ambPlay = null;
      if (!p || !ctx) return;
      try {
        var B = p.B, t = ctx.currentTime; B.dead = true;
        B.timers.forEach(function (h) { h.on = false; clearTimeout(h.id); });
        B.bus.gain.cancelScheduledValues(t); B.bus.gain.setValueAtTime(B.bus.gain.value || AMB_LEVEL, t); B.bus.gain.linearRampToValueAtTime(0.0001, t + 0.8);
        setTimeout(function () {
          B.osc.concat(B.srcs).forEach(function (s) { try { s.stop(); } catch (e) {} });
          B.nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} }); B.nodes = []; B.srcs = []; B.osc = [];
        }, 900);
      } catch (e) { errors++; }
    }
    function checkQuiet() {                                     // Jarvis talking or listening (this frame or the parent): the beds and music step back
      var q = false;
      try { q = !!(env.OLYMPUS_QUIET && env.OLYMPUS_QUIET()); } catch (e) {}
      try { if (!q && env.parent && env.parent !== env && env.parent.OLYMPUS_QUIET) q = !!env.parent.OLYMPUS_QUIET(); } catch (e) {}
      if (q !== autoDuck) { autoDuck = q; applyDuck(); }
    }
    function ambRefresh() {                                     // what plays matches: wanted bed, gesture, setting, saver, visible
      try {
        var want = ambWant && ambAllowed() && unlocked && !hidden() ? ambWant : '';
        if (ambPlay && ambPlay.name !== want) ambStop();
        if (want && !ambPlay && ensureCtx() && BED[want]) {
          var spec = BED[want], bus = gain(0, CB.ambience.bus), t = ctx.currentTime;
          bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(AMB_LEVEL, t + 3);
          var B = { bus: bus, inp: bus, srcs: [], osc: [], nodes: [bus], timers: [] };
          ambPlay = { name: want, B: B };
          if (smpUse()) preload((BED_FILES[spec[0]] || []).filter(function (f) { return f.indexOf('loop-') !== 0 || (!lite() && !saveData()); }));
          BUILD[spec[0]](B, spec[1]);
          if (B.recs) forgetLoops(B.recs);
          setRoom(spec[2]);
        }
      } catch (e) { errors++; ambStop(); }
      musRefresh();
      var busy = !!(ambPlay || musPlay);
      if (busy && !duckTimer) duckTimer = setInterval(checkQuiet, 700);
      if (!busy && duckTimer) { clearInterval(duckTimer); duckTimer = 0; }
    }
    /** ambient('sea'): the bed this page wants. Starts after the first gesture (and while the setting allows it); ambient('') or ambientStop() ends it. */
    function ambient(name) {
      name = String(name || '');
      if (name && AMBIENTS.indexOf(name) < 0) return false;
      ambWant = name;
      if (!name) { ambStop(); musRefresh(); return true; }
      listen(); ambRefresh(); return true;
    }
    function ambientStop() { ambWant = ''; ambStop(); musRefresh(); }
    function ambience(on) { if (on === undefined) return ambAllowed(); ambOn = !!on; save(); ambRefresh(); return ambAllowed(); }
    /** sound(true | false | null): the owner's Sound switch; sound() = may cues and beds sound now; sound('tap') (a name) plays that cue */
    function sound(on) {
      if (on === undefined) return soundAllowed();
      if (typeof on === 'string') return play(on);
      soundOn = on === null ? null : !!on; save(); ambRefresh(); return soundAllowed();
    }
    function ambientState() {
      return { want: ambWant, playing: ambPlay ? ambPlay.name : '', bed: ambPlay ? BED[ambPlay.name][0] : '', allowed: ambAllowed(), setting: ambOn, sound: soundOn,
        saver: batterySaver(), lite: lite(), names: AMBIENTS.slice() };
    }

    /* ---------------------------------------------------------------- music: a calm generative lyre per district (off by default) */
    function deg(D, i) { var L = D.scale.length, o = Math.floor(i / L), r = ((i % L) + L) % L; return D.root + 12 * o + D.scale[r]; }
    function motif(D) {
      var L = D.scale.length, n = 4 + Math.floor(Math.random() * 3), cur = L + Math.floor(Math.random() * L), out = [], fifth = Math.max(0, D.scale.indexOf(7));
      for (var i = 0; i < n; i++) { out.push({ d: cur, len: pick([1, 1, 1, 2, 0.5]) }); cur = Math.max(L, Math.min(2 * L + 2, cur + pick([-2, -1, -1, 1, 1, 2, 3, -3]))); }
      out[n - 1] = { d: L + pick([0, fifth]), len: pick([2, 3]) };   // a phrase comes home: the tonic or the fifth, held
      return out;
    }
    function newPhrase(M) {
      M.ph++;
      if (!M.mot || M.ph % 4 === 0) M.mot = motif(M.D);
      var tr = pick([0, 0, 0, 1, -1, 2, -2]), inv = Math.random() < 0.15, q = [], m0 = M.mot[0].d;
      M.mot.forEach(function (x, i) {
        if (i > 0 && i < M.mot.length - 1 && Math.random() > M.D.dens) { q.push({ d: null, len: x.len }); return; }
        q.push({ d: (inv && i < M.mot.length - 1 ? 2 * m0 - x.d : x.d) + tr, len: x.len, v: i === 0 ? 1 : rnd(0.7, 0.95) });
      });
      if (M.ph % 2 === 1) q[0].bass = true;
      if (Math.random() < 0.3) q[0].roll = true;
      q.push({ d: null, len: pick([2, 3, 3, 4, 5]) });
      M.q = q;
    }
    function musNote(M, n, t) {
      var V = grab('music', 2.4, M.bus); if (!V) return;
      V.t = Math.max(ctx.currentTime + 0.005, t);
      pluck(V, mtof(deg(M.D, n.d)), 0, 0.1 * (n.v || 1), { dur: 1.6, bright: M.D.bright });
      if (n.bass) pluck(V, mtof(deg(M.D, 0)), 0, 0.07, { dur: 2, bright: 0.3 });
      if (n.roll) { var L = M.D.scale.length; [0, 2, 4].forEach(function (k, i) { pluck(V, mtof(deg(M.D, L + k)), 0.08 + i * 0.06, 0.035, { dur: 1.4, bright: 0.45 }); }); }
    }
    function musTick() {
      var M = musPlay; if (!M || !ctx) return;
      for (var guard = 0; M.next < ctx.currentTime + 0.7 && guard < 8; guard++) {
        if (!M.q.length) newPhrase(M);
        var n = M.q.shift();
        if (n.d !== null) musNote(M, n, M.next + rnd(-0.012, 0.012));
        M.next += n.len * M.D.beat;
      }
    }
    function musStart(name) {
      want('harp'); want('harp-lo');                            // the real harp for the composer (the string synth plays until it is ready)
      var D = DISTRICTS[name], t = ctx.currentTime, bus = gain(0, CB.music.bus), lp = ctx.createBiquadFilter(), dg = gain(1, bus);
      bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(MUS_LEVEL, t + 4);
      lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(dg);
      var M = { name: name, D: D, bus: bus, next: t + 0.6, ph: -1, q: [], mot: null, osc: [], nodes: [bus, lp, dg], timers: [] };
      [[D.root - 12, 0.025], [D.root - 5, 0.012]].forEach(function (x) {     // the drone: root and fifth, barely there
        var o = ctx.createOscillator(), g = gain(x[1], lp); o.type = 'sine'; o.frequency.value = mtof(x[0]); o.connect(g); o.start(t); scheduled++; M.osc.push(o); M.nodes.push(g);
      });
      M.timers.push(every(5000, 11000, function () { dg.gain.setTargetAtTime(rnd(0.4, 1), ctx.currentTime, 2); }));
      M.iv = setInterval(musTick, 250);
      musPlay = M; musTick();
    }
    function musStop() {
      var M = musPlay; musPlay = null;
      if (!M || !ctx) return;
      try {
        clearInterval(M.iv); M.timers.forEach(function (h) { h.on = false; clearTimeout(h.id); });
        var t = ctx.currentTime; M.bus.gain.cancelScheduledValues(t); M.bus.gain.setValueAtTime(M.bus.gain.value || MUS_LEVEL, t); M.bus.gain.linearRampToValueAtTime(0.0001, t + 1.5);
        setTimeout(function () { M.osc.forEach(function (o) { try { o.stop(); } catch (e) {} }); M.nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} }); }, 1600);
      } catch (e) { errors++; }
    }
    function musRefresh() {
      try {
        var want = musicAllowed() && unlocked && !hidden() ? (musWant || BED_DISTRICT[ambWant] || 'trading') : '';
        if (musPlay && musPlay.name !== want) musStop();
        if (want && !musPlay && ensureCtx()) musStart(want);
      } catch (e) { errors++; musStop(); }
    }
    /** music(true | false): the owner's switch (stored 'mu', off by default); music() = may music play now */
    function music(on) { if (on === undefined) return musicAllowed(); musicOn = !!on; save(); ambRefresh(); return musicAllowed(); }
    /** district('trading' | 'money' | 'life' | 'research' | ''): the motif; '' = follow the bed */
    function district(name) {
      if (name === undefined) return musWant;
      name = String(name || ''); if (name && !DISTRICTS[name]) return false;
      musWant = name; ambRefresh(); return true;
    }
    function musicState() { return { on: musicOn, allowed: musicAllowed(), playing: musPlay ? musPlay.name : '', district: musWant, districts: Object.keys(DISTRICTS) }; }

    /* ---------------------------------------------------------------- controls */
    /* ---------------------------------------------------------------- voices: the murmur (no phone voice) and a person's presence */
    // vowel formants (F1, F2 Hz) for the mouth shapes of people-voice.js visemes(): a voice heard through a curtain, our own sound
    var FORM = { A: [780, 1250], E: [480, 1850], O: [520, 880], U: [360, 760], L: [420, 1350], M: [260, 950], F: [420, 1550], S: [460, 1750], K: [560, 1500] };
    /** murmur(profile, timeline, {at0, gain}): a soft formant voice that follows the mouth timeline (people-voice.js visemes) on the voices bus.
        profile = voiceProfile(person) ({timbre:{hz, formant, breath, wave}, gender}); timeline = {keys:[{t ms, v, a}]}. -> { stop() } or null (before the tap). */
    function murmur(prof, tl, o) {
      o = o || {};
      if (!unlocked || !ctx || muted || !tl || !tl.keys || !tl.keys.length) return null;
      var tb = (prof && prof.timbre) || {}, hz = tb.hz || 150, fk = (tb.formant || 1) * (prof && prof.gender === 'f' ? 1.12 : prof && prof.gender === 'm' ? 0.94 : 1);
      var t0 = ctx.currentTime + 0.04, at0 = o.at0 || 0, keys = tl.keys, last = keys[keys.length - 1], end = t0 + Math.max(0.2, (last.t - at0) / 1000 + 0.15);
      var out = gain(0.0001, CB.voices.bus), lp = ctx.createBiquadFilter(), env = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
      var osc = ctx.createOscillator(), sub = ctx.createOscillator(), sg = gain(0.35), br = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = gain((tb.breath || 0.06) * 2.2);
      var g1 = gain(1), g2 = gain(0.45), nodes = [out, lp, env, f1, f2, osc, sub, sg, br, bf, bg, g1, g2];
      lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5; lp.connect(out);
      env.gain.value = 0.0001; env.connect(lp);
      f1.type = 'bandpass'; f1.Q.value = 5; f2.type = 'bandpass'; f2.Q.value = 7; f1.connect(g1); f2.connect(g2); g1.connect(env); g2.connect(env);
      osc.type = 'sawtooth'; sub.type = tb.wave === 'sine' ? 'sine' : 'triangle'; osc.connect(f1); osc.connect(f2); sub.connect(sg); sg.connect(env);
      br.buffer = white(); br.loop = true; bf.type = 'bandpass'; bf.frequency.value = 2600; bf.Q.value = 0.8; br.connect(bf); bf.connect(bg); bg.connect(f1); bg.connect(f2);
      out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(o.gain || 0.09, t0 + 0.05); out.gain.setValueAtTime(o.gain || 0.09, end - 0.06); out.gain.linearRampToValueAtTime(0.0001, end);
      // the tune of a sentence: it starts a little high, drifts down (declination), lifts on stressed vowels, falls at the end (or rises for a question)
      var q = o.question === true, n = keys.length;
      for (var i = 0; i < n; i++) {
        var k = keys[i], t = t0 + Math.max(0, (k.t - at0) / 1000), x = i / Math.max(1, n - 1), F = FORM[k.v];
        var p = hz * (1.08 - 0.14 * x + (k.a > 0.7 ? 0.05 : 0) + (q && x > 0.85 ? 0.18 * (x - 0.85) / 0.15 : 0) + 0.02 * Math.sin(i * 1.7));
        osc.frequency.setTargetAtTime(p, t, 0.03); sub.frequency.setTargetAtTime(p, t, 0.03);
        if (F) { f1.frequency.setTargetAtTime(F[0] * fk, t, 0.025); f2.frequency.setTargetAtTime(F[1] * fk, t, 0.025); }
        var open = k.v === 'rest' ? 0.0001 : k.v === 'M' ? 0.18 : 0.3 + 0.7 * (k.a || 0.5);
        env.gain.setTargetAtTime(open, t, k.v === 'rest' ? 0.04 : 0.018);
        if (k.v === 'S' || k.v === 'F') { bf.frequency.setTargetAtTime(k.v === 'S' ? 5200 : 3000, t, 0.01); bg.gain.setTargetAtTime(0.25, t, 0.01); bg.gain.setTargetAtTime((tb.breath || 0.06) * 2.2, t + 0.06, 0.02); }
      }
      env.gain.setTargetAtTime(0.0001, end - 0.05, 0.03);
      osc.start(t0); sub.start(t0); br.start(t0, Math.random()); osc.stop(end + 0.1); sub.stop(end + 0.1); br.stop(end + 0.1); scheduled += 3;
      var done = false, h = { stop: function () {
        if (done) return; done = true;
        try { var t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0.0001, t, 0.02); [osc, sub, br].forEach(function (x) { try { x.stop(t + 0.1); } catch (e) {} }); } catch (e) {}
        setTimeout(function () { nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} }); released++; }, 200);
      }, end: end };
      h.timer = setTimeout(h.stop, (end - ctx.currentTime + 0.2) * 1000);
      return h;
    }
    /** presenceOf(person or spec): what they sound like moving: { jingle: keys | metal | beads | cloth | pouch | jingle | rustle, surface } */
    function presenceOf(p) {
      p = p || {};
      var kind = String(p.kind || String(p.id || '').split(':')[0] || ''), j = JINGLE_OF[p.accessory] || JINGLE_OF[kind] || 'beads';
      return { jingle: p.jingle && JINGLES.indexOf(p.jingle) >= 0 ? p.jingle : j, surface: p.surface || 'stone' };
    }
    /** presence(person, pos, listener?, opts?): their accessory's soft sound, placed in 3D (a hook for people3d.js / scenes) */
    function presence(p, pos, lis, o) { var P = presenceOf(p); return at('jingle', pos || {}, lis, merge({ kind: P.jingle, k: 0.5 }, o)); }
    /** walker(person) -> { step(pos, listener?, opts?) }: a footstep on their surface; every few steps their things answer, very softly */
    function walker(p) {
      var P = presenceOf(p), n = Math.floor(Math.random() * 3);
      return { presence: P, step: function (pos, lis, o) {
        o = o || {}; var ok = at('step', pos || {}, lis, merge({ surface: o.surface || P.surface, k: o.k || 0.55 }, o));
        if (++n % 3 === 0 && Math.random() < 0.6) at('jingle', pos || {}, lis, { kind: P.jingle, k: (o.k || 0.55) * 0.55 });
        return ok;
      } };
    }

    function haptic(name) {
      try {
        if (muted || reduced() || !HAPTIC[name]) return false;
        if (ls() && ls().getItem('olympus.haptics') === 'off') return false;
        var n = env.navigator;
        if (!n || typeof n.vibrate !== 'function') return false;  // iOS Safari: absent -> no-op
        return !!n.vibrate(HAPTIC[name]);
      } catch (e) { return false; }
    }
    function stop(name) { if (!name || name === 'pad') stopPad(); if (!name) { musStop(); } }
    function mute(on) {
      muted = (on === undefined) ? !muted : !!on; save();
      if (muted) { stopPad(); ambStop(); musStop(); active.slice().forEach(steal); } else ambRefresh();
      applyGain(); return muted;
    }
    function setVolume(v) { vol = clamp(v); save(); applyGain(); return vol; }
    /** volume('ambience', 0..1) per category (stored); volume('ui') reads it; volume(0.5) = the master volume */
    function volume(cat, v) {
      if (typeof cat === 'number') return setVolume(cat);
      if (CATS.indexOf(cat) < 0) return false;
      if (v === undefined) return catVol[cat];
      catVol[cat] = clamp(v); save(); applyCats(); return catVol[cat];
    }
    function volumes() { var o = merge(catVol); o.master = vol; return o; }
    /** quiet(true): the Quiet setting (stored 'q'): everything softer, no music */
    function quiet(on) { if (on === undefined) return quietOn; quietOn = !!on; save(); applyCats(); ambRefresh(); return quietOn; }
    /** duck(true) while someone speaks, duck(false) after (counted: two speakers need two falses); duck() = ducked now */
    function duck(on) {
      if (on === undefined) return duckN > 0 || autoDuck;
      duckN = Math.max(0, duckN + (on ? 1 : -1)); applyDuck(); return duckN > 0 || autoDuck;
    }
    function roomFn(name) { if (name === undefined) return room; return setRoom(String(name)); }
    function listener(L) { if (L !== undefined) hearL = L || null; return hearL; }
    /** bus('voices'): the category's input node for your own synthesis (null before the first tap) */
    function bus(cat) { return unlocked && ctx && CB[cat] ? CB[cat].bus : null; }
    function context() { return unlocked ? ctx : null; }
    function onUnlock(cb) { if (typeof cb !== 'function') return; if (unlocked) { try { cb(api); } catch (e) {} } else unlockCbs.push(cb); }
    function state() {
      var nodes = 0; active.forEach(function (V) { nodes += V.nodes.length; });
      return {
        unlocked: unlocked, muted: muted, volume: vol, reducedMotion: reduced(), errors: errors, scheduled: scheduled, released: released,
        haptics: !!(env.navigator && typeof env.navigator.vibrate === 'function'), padOn: !!padNode, ctxState: ctx ? ctx.state : 'none',
        voices: active.length, nodes: nodes, room: room, quiet: quietOn, ducked: duckN > 0 || autoDuck, volumes: volumes(),
        music: musPlay ? musPlay.name : '', bed: ambPlay ? ambPlay.name : '', reverb: !!conv, lite: lite(), samples: smpState()
      };
    }
    var api = {
      play: play, cue: play, world: play, at: at, stop: stop, mute: mute, setVolume: setVolume, unlock: unlock, state: state,
      names: NAMES.slice(), cues: CUES.slice(), worlds: WORLD.slice(), legacy: LEGACY.slice(), aliases: Object.keys(ALIAS),
      ambient: ambient, ambientStop: ambientStop, ambience: ambience, ambientState: ambientState, ambients: AMBIENTS.slice(),
      beds: Object.keys(BUILD), bedOf: function (n) { return BED[n] ? BED[n][0] : ''; },
      sound: sound, quiet: quiet, volume: volume, volumes: volumes, categories: CATS.slice(), duck: duck, speaking: duck,
      music: music, district: district, musicState: musicState, districts: Object.keys(DISTRICTS),
      room: roomFn, rooms: ROOMS.slice(), listener: listener, bus: bus, context: context, onUnlock: onUnlock,
      samples: samples, preload: preload, audio: AUDIO, sample: sample, meter: meter, banks: AUDIO ? Object.keys(AUDIO.banks) : [], murmur: murmur, presence: presence, presenceOf: presenceOf, walker: walker, jingles: JINGLES.slice()
    };
    /* OLYMPUS.sound.at(...): hang the new hooks on the kit's sound() function too (olympus.js stays untouched) */
    function attachHooks() {
      try {
        var O = env.OLYMPUS, f = O && O.sound;
        if (typeof f !== 'function' || f.at === at) return;
        ['at', 'world', 'cue', 'music', 'district', 'duck', 'speaking', 'quiet', 'volume', 'room', 'listener', 'bus', 'onUnlock', 'samples', 'preload', 'presence', 'walker', 'murmur'].forEach(function (k) { f[k] = api[k]; });
      } catch (e) {}
    }
    load(); listen(); attachHooks();
    return api;
  }
  return { create: create, NAMES: NAMES, CUES: CUES, WORLD: WORLD, AMBIENTS: AMBIENTS, ALIAS: ALIAS, CATS: CATS };
});
