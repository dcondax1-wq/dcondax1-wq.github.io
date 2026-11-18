// Jarvis talks (2026-11-03 evening, owner: "the Jarvis isn't talking, I want you to fully make the bot talk"). The Jarvis
// screen's voice out: one on/off switch (default on, kept on this phone), the iPhone's first-tap unlock, the voice list that
// arrives late, and the "speaking" state. The words and the voice itself are tts.js's (shared with voice mode). No DOM here
// beyond the window's taps and the page's visibility; the dock button, the waveform and the state word are the shell's.
//
//   import { createVoiceOut } from './voice-out.js';
//   const vo = createVoiceOut({ cfg(), cloud(ctx), prosody(), player(), unlock(), onFallback(err, id), onEngine(id), onSpeaking(on), onWord(charIndex), onPending(text | ''), micBusy() });
//   vo.speak(text, { onend }) -> 'spoken' | 'pending' (said at the next tap) | 'off' | 'hidden' | 'none'
//   vo.stop() · vo.on() · vo.setOn(bool) · vo.toggle() · vo.speaking · vo.since() · vo.voices() · vo.voice() · vo.test() · vo.stats()
//   vo.session('auto' | 'playback')   the iPhone's audio session (iOS 17+): 'auto' before the mic listens
//
// Why it was silent on the iPhone: WebKit plays speech only after a speak() made inside a tap; an answer said later (after
// the brain thought, or after the mic heard you) is dropped without a sound or an event. So the first tap anywhere speaks a
// silent primer and resumes an AudioContext (the cloud voice and the sounds share it); an answer that arrives before any tap
// waits and is said at the next one. Answers were also only read after a spoken question ('Read every answer' was off by
// default): now every answer is read while the switch is on.
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { createSpeaker, bestVoice, savedVoiceName, needsPrimer, primeSpeech } from './tts.js';

export const ON_KEY = 'jarvis.speak';                 // 'on' | 'off' (absent = on)
export const TEST_LINE = "Hi, I'm Jarvis, and this is how I'll sound when I read your answers out loud.";
const PENDING_MS = 20000;                             // an answer waiting for a tap is dropped after this
const POLL_MS = 300, POLLS = 12;                      // the voice list: asked again while empty (some iPhones never fire voiceschanged)
const GESTURES = ['touchend', 'pointerup', 'click', 'keydown'];

const safe = (f, d) => { try { return f(); } catch (_) { return d; } };

export function createVoiceOut(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const win = o.win || window, doc = o.doc || document, nav = o.nav || navigator;
  const synth = o.synth !== undefined ? o.synth : ('speechSynthesis' in win ? win.speechSynthesis : null);
  const store = o.storage !== undefined ? o.storage : safe(() => win.localStorage, null);
  const call = (name, ...a) => (typeof o[name] === 'function' ? safe(() => o[name](...a), null) : null);
  const primer = o.primer !== undefined ? !!o.primer : needsPrimer(nav);
  let list = [], polls = 0, pollT = 0, primed = false, actx = null, cur = null, pending = null, speakingNow = false;

  // ---------------------------------------------------------------- the switch
  const on = () => safe(() => store.getItem(ON_KEY), null) !== 'off';
  function setOn(v) {
    safe(() => store.setItem(ON_KEY, v ? 'on' : 'off'));
    safe(() => store.setItem('jarvis.mute', v ? 'false' : 'true'));        // the start's intro sound reads the old key
    if (!v) stop();
    return !!v;
  }
  // first start with the new switch: an old 'mute' no longer silences her (the owner wants her talking)
  if (safe(() => store.getItem(ON_KEY), null) == null) setOn(true);

  // ---------------------------------------------------------------- the voice list (empty at first on the iPhone)
  function load() {
    list = synth ? safe(() => synth.getVoices() || [], []) : [];
    clearTimeout(pollT);
    if (!list.length && synth && polls++ < POLLS) pollT = setTimeout(load, POLL_MS);
    return list;
  }
  if (synth) { safe(() => synth.addEventListener('voiceschanged', () => { polls = 0; load(); })); load(); }
  const voices = () => (list.length ? list : load());
  const voice = () => bestVoice(voices(), (call('cfg') || {}).voice || savedVoiceName(store));
  const speaker = synth ? createSpeaker({ synth, voices, cfg: () => call('cfg') || {}, cloud: (c) => call('cloud', c), storage: store,
    prosody: () => call('prosody'), player: () => call('player') }) : null;     // 2026-11-04: voice-engines.js hands over the voice, the natural-speech layer and the shared player

  // ---------------------------------------------------------------- the unlock: the first tap anywhere
  const unlocked = () => primed || (!primer && (!nav.userActivation || nav.userActivation.hasBeenActive));
  function audio() {                                  // one AudioContext, resumed inside a tap (the cloud voice and the sounds)
    const A = win.AudioContext || win.webkitAudioContext;
    if (!A) return null;
    try {
      actx = actx && actx.state !== 'closed' ? actx : new A();
      if (actx.state === 'suspended' || actx.state === 'interrupted') actx.resume();
      const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource();      // one silent sample: the iPhone's audio wakes
      s.buffer = b; s.connect(actx.destination); s.start(0);
    } catch (_) { /* no audio here */ }
    return actx;
  }
  // iOS 17: 'playback' plays through the Ring / Silent switch; 'auto' again before the mic listens (playback cannot record)
  function session(type) { safe(() => { if (nav.audioSession && nav.audioSession.type !== type) nav.audioSession.type = type; }); }
  function onGesture(e) {
    if (e && e.isTrusted === false) return;
    call('unlock');                                  // the shared audio element of the cloud / on-device voices: unlocked inside this tap (cheap, once)
    if (primed && !pending && actx && actx.state === 'running') return;          // unlocked already: nothing to do on this tap
    audio();
    if (!primed) {
      primed = primer ? primeSpeech(synth) : true;
      if (primed) { polls = 0; load(); }
    }
    if (pending) {                                   // an answer that came before the first tap: said now, inside this tap
      const p = pending; pending = null; call('onPending', '');
      if (Date.now() - p.t < PENDING_MS) speak(p.text, p.cb);
    }
  }
  for (const g of GESTURES) safe(() => win.addEventListener(g, onGesture, { capture: true, passive: true }));
  // out of sight: the phone would cut her off mid-word anyway; stop cleanly
  safe(() => doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') stop(); }));

  // ---------------------------------------------------------------- speaking
  let startT = 0;
  function setSpeaking(v) { if (v) startT = Date.now(); if (speakingNow === v) return; speakingNow = v; call('onSpeaking', v); }
  function speak(text, cb) {
    const c = cb && typeof cb === 'object' ? cb : {};
    const t = String(text == null ? '' : text).trim();
    if (!t) return 'none';
    if (!on()) return 'off';
    if (!speaker) return 'none';
    if (doc.visibilityState === 'hidden') return 'hidden';
    stop();
    if (!unlocked()) { pending = { text: t, cb: c, t: Date.now() }; call('onPending', t); return 'pending'; }
    if (!call('micBusy')) session('playback');
    const my = {};
    cur = my;
    const done = () => { if (cur !== my) return; cur = null; setSpeaking(false); if (typeof c.onend === 'function') safe(() => c.onend()); };
    setSpeaking(true);
    try {
      my.h = speaker.speak(t, {
        onend: done,
        onfallback: (e, id) => { call('onFallback', e, id); },         // a cloud voice said no: the reply goes on in the phone's voice
        onengine: (id) => { call('onEngine', id); },
        onboundary: (ci) => { if (cur === my) call('onWord', ci); },
        onstall: (rest) => {                          // never started: on the iPhone it needs a tap again; elsewhere it cannot speak
          if (cur !== my) return;
          if (!primer) { done(); return; }
          primed = false; cur = null; setSpeaking(false); pending = { text: rest, cb: c, t: Date.now() }; call('onPending', rest);
        },
      });
    } catch (_) { done(); return 'none'; }
    return 'spoken';
  }
  function stop() {
    if (pending) { pending = null; call('onPending', ''); }
    const was = cur; cur = null;
    if (speaker) safe(() => speaker.cancel());
    if (was) setSpeaking(false);
  }
  return {
    speak, stop, on, setOn, toggle: () => setOn(!on()), voices, voice, audio: () => actx, session,
    reload: () => { polls = 0; return load(); },                  // the Voice sheet's "I installed a Premium voice: check again"
    test: (cb) => speak(TEST_LINE, cb),
    get speaking() { return !!cur; },
    since: () => (cur ? Date.now() - startT : Infinity),          // ms since she began (a tap that just started her is not a stop)
    unlocked,
    stats: () => ({ on: on(), unlocked: unlocked(), primer, primed, voices: list.length, voice: (voice() || {}).name || '',
      speaking: !!cur, pending: pending ? pending.text : '', audio: actx ? actx.state : 'none' }),
  };
}
export default createVoiceOut;
