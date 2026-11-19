// Jarvis's AI voice (2026-11-18, owner: "Jarvis voice sucks, it sounds like a bot, it should sound like a person. I'm only asking once
// to fix it." He picked Male, British). A free neural voice made on the phone itself: Kokoro-82M (Apache-2.0) through kokoro-js 1.2.1,
// in a Web Worker (neural-voice-worker.js), British male voice bm_george. No key, no account, no server: the text never leaves the phone.
//
// One setting, kept on this phone: Voice = AI voice (George) | iPhone voice | Off.
//   'jarvis.voiceEngine' { mode: 'ai' | 'phone' }   (older modes auto / cloud / device read as 'ai'; the Settings app writes the same key)
//   'jarvis.speak' 'off'                            Off (the dock's speaker button and voice-out.js: the same switch)
// The first time the AI voice is needed it is downloaded once, about 117 MB (the q8 model 92 MB, the speech engine 22 MB, the library
// 2 MB, the voice 0.5 MB), with a plain progress line: "Getting Jarvis's voice ready (one time, about 117 MB)". The browser keeps it
// (Cache Storage), so later opens only load it from the phone (a few seconds, in the background). Until it is ready, if it fails, or if
// a piece is late, Jarvis speaks with the iPhone's best British male voice (tts.js voiceScore): never silence.
//
// Speed, measured 2026-11-18/19 in Chromium on this project's 2.1 GHz Xeon (one thread, the way a page without cross-origin isolation
// runs it): 2.2-2.9 s of work per second of speech (the 8 s trade alert: first piece 8.4 s, all of it 22 s); an iPhone core is faster
// (estimated 1.2-2 s per second of speech). So:
//   - every piece of a reply is queued at once (the worker never waits) and the first piece is the first sentence or its first clause;
//   - the measured pace is kept ('jarvis.nv.rtf'); a reply whose first piece would take more than 4.5 s to make, or whose silences
//     between sentences would add up to more than 8 s, is said by the iPhone voice instead (the AI voice keeps the short, everyday
//     answers); a phone faster than real time = every reply;
//   - repeated short lines (greetings, "Voice on.") are kept as audio, so they start at once.
// Two threads (a cross-origin-isolated page: COOP + COEP headers) made it 1.9x faster here; that needs Jarvis's service worker (lead).
// WebGPU is NOT used: with this 92 MB model it makes wrong audio (measured: the same sentence 11% shorter, its loudness curve only 0.26
// alike, against 0.998 for the WebAssembly copy), and the model that is right on WebGPU is 326 MB.
//
//   import { createNeuralVoice, createPlayer, createStatusLine, voiceMode, setVoiceMode, migrate, NV } from './neural-voice.js';
//   const nv = createNeuralVoice({ storage, makeWorker(), onProgress(p), onState(state) })
//   nv.start() -> Promise<bool>   (downloads / loads the model once; safe to call often)    nv.ready() · nv.state() · nv.progress()
//   nv.descriptor({ len }) -> the voice tts.js createSpeaker's cloud() takes ({ id: 'kokoro', synth, split, queueAll, timeoutFor }),
//                             or null (= the iPhone voice says this reply)
//   nv.synth(text, { signal }) -> Promise<Blob audio/wav with .dur (ms)>        nv.stats() · nv.stop()
//   createPlayer() -> { unlock() (inside a tap), play(blob) -> Promise, stop() }: ONE <audio> element the iPhone unlocks with the first
//   tap, so audio made later (after the worker thought) still plays, and through the Ring / Silent switch
// iPhone Safari 16: plain ES2020, no regex lookbehind, no nullish or optional chaining, no Array at().

import { sentences } from './speech-text.js';

const HF_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const HF_REV = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';           // the model repo's commit (2025-02-08): the files never change under us
export const NV = {
  lib: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js',
  wasmBase: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/',
  wasmFiles: ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'],
  modelId: HF_ID, rev: HF_REV,
  hfMain: 'https://huggingface.co/' + HF_ID + '/resolve/main/',
  hfPin: 'https://huggingface.co/' + HF_ID + '/resolve/' + HF_REV + '/',
  dtype: 'q8', device: 'wasm',
  voice: 'bm_george', name: 'George', speed: 1,
  // bytes of each file (the progress line's total). The model's SHA-256 on huggingface.co: fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478
  sizes: { 'kokoro.web.js': 2135146, 'ort-wasm-simd-threaded.jsep.mjs': 44484, 'ort-wasm-simd-threaded.jsep.wasm': 21596019, 'onnx/model_quantized.onnx': 92361116,
    'config.json': 44, 'tokenizer.json': 3497, 'tokenizer_config.json': 113 },
  voiceBytes: 522240,
  cacheName: 'olympus-voice-v1',                                     // never 'jarvis-...': Jarvis's service worker clears those on update
  clipCache: 'olympus-voice-clips-v1',
  approxMB: 117,
  readyKey: 'jarvis.nv.ready',                                       // '1' once it downloaded and spoke on this phone (later opens load it early)
  failKey: 'jarvis.nv.fail',                                         // { n, at, why }: starts that failed in a row (3 = it rests for a day)
  rtfKey: 'jarvis.nv.rtf',                                           // the measured pace: ms of work per ms of speech
  migKey: 'jarvis.voice.v3',
};
export const MODE_KEY = 'jarvis.voiceEngine';
export const SPEAK_KEY = 'jarvis.speak';
export const READY_LINE = "Getting Jarvis's voice ready (one time, about " + NV.approxMB + ' MB)';
export const MODES = [['ai', 'AI voice (' + NV.name + ')'], ['phone', 'iPhone voice'], ['off', 'Off']];
const CHARS_PER_S = 14;                 // George says about 14 characters a second
const FIRST_S = 2.5, GAP_BUDGET_S = 8;   // the silences a reply may add up to while the voice makes the rest (a slow phone)
const FIRST_WAIT_S = 4.5;               // the longest he waits in silence for the first piece; slower = the iPhone voice says it at once
const totalBytes = () => Object.keys(NV.sizes).reduce((a, k) => a + NV.sizes[k], 0) + NV.voiceBytes;
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };
const jget = (st, k) => { try { const v = JSON.parse(st.getItem(k) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
const hash53 = (str) => {                                            // cyrb53: a cache key, not security
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// ------------------------------------------------------------------------------------------------ the one setting
// 'ai' (default) | 'phone' | 'off'
export function voiceMode(storage) {
  const st = storage || safe(() => localStorage, null);
  if (!st) return 'ai';
  if (safe(() => st.getItem(SPEAK_KEY), null) === 'off') return 'off';
  return jget(st, MODE_KEY).mode === 'phone' ? 'phone' : 'ai';
}
export function setVoiceMode(storage, mode) {
  const st = storage || safe(() => localStorage, null);
  if (!st || ['ai', 'phone', 'off'].indexOf(mode) < 0) return voiceMode(st);
  safe(() => st.setItem(SPEAK_KEY, mode === 'off' ? 'off' : 'on'));
  safe(() => st.setItem('jarvis.mute', mode === 'off' ? 'true' : 'false'));         // the start's intro sound reads the old key
  if (mode !== 'off') safe(() => st.setItem(MODE_KEY, JSON.stringify(Object.assign({}, jget(st, MODE_KEY), { mode }))));
  return voiceMode(st);
}
// once (2026-11-18): the old Voice sheet's female pick (Ava ...) and voice mode's are dropped, so the British man is used everywhere
export function migrate(storage) {
  const st = storage || safe(() => localStorage, null);
  if (!st || safe(() => st.getItem(NV.migKey), null) === '1') return false;
  const c = jget(st, 'jarvis.voiceCfg');
  if (c.voice) { delete c.voice; safe(() => st.setItem('jarvis.voiceCfg', JSON.stringify(c))); }
  safe(() => st.removeItem('jarvis.vmVoice'));
  const e = jget(st, MODE_KEY);
  if (e.mode && e.mode !== 'phone' && e.mode !== 'ai') safe(() => st.setItem(MODE_KEY, JSON.stringify(Object.assign({}, e, { mode: 'ai' }))));
  safe(() => st.setItem(NV.migKey, '1'));
  return true;
}

// ------------------------------------------------------------------------------------------------ audio helpers
export function floatToWav(pcm, rate) {                                  // Float32 [-1, 1] mono -> a 16-bit WAV Blob
  const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
// 16 ms of silence: played inside a tap it unlocks the shared element for the rest of the page's life (iPhone)
const SILENCE = (() => { const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer); const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n, true);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(s); })();
export function createPlayer(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const A = o.Audio || (typeof Audio !== 'undefined' ? Audio : null), U = o.URL || (typeof URL !== 'undefined' ? URL : null);
  let el = null, unlocked = false, cur = null;
  const ensure = () => {
    if (el || !A) return el;
    el = new A();
    safe(() => { el.preload = 'auto'; el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); });
    return el;
  };
  function unlock() {                                                     // call inside a tap
    if (unlocked || !ensure()) return unlocked;
    unlocked = true;
    try {
      el.src = SILENCE; el.volume = 0;
      const p = el.play();
      const done = () => { try { el.pause(); el.volume = 1; } catch (_) { /* ok */ } };
      if (p && typeof p.then === 'function') p.then(done, () => { unlocked = false; done(); }); else done();
    } catch (_) { unlocked = false; }
    return unlocked;
  }
  function stop() { const me = cur; if (el) safe(() => el.pause()); cur = null; if (me && me.end) me.end(null); }
  function play(blob) {
    if (!ensure() || !U || !U.createObjectURL) return Promise.reject(new Error('no audio'));
    stop();
    return new Promise((ok, bad) => {
      const url = U.createObjectURL(blob), me = {};
      cur = me;
      const end = (err) => { if (me.done) return; me.done = true; if (cur === me) cur = null; safe(() => U.revokeObjectURL(url)); if (err) bad(err); else ok(); };
      me.end = end;
      el.onended = () => end(null);
      el.onerror = () => end(new Error('audio'));
      try {
        el.src = url; el.volume = 1;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch((e) => end(e || new Error('play blocked')));
      } catch (e) { end(e); }
    });
  }
  return { unlock, play, stop, unlocked: () => unlocked, playing: () => !!cur, element: () => el };
}
// the progress line: a small pill at the top, over every screen (voice mode too), never in the way of a tap
export function createStatusLine(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  let el = null, hideT = 0;
  const ensure = () => {
    if (el || !d || !d.body) return el;
    el = d.createElement('div');
    el.id = 'nvStatus'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.hidden = true;
    el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top, 0px) + 8px);transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);'
      + 'box-sizing:border-box;padding:7px 14px;border-radius:999px;background:rgba(12,11,16,.88);color:#f3ead4;border:1px solid rgba(200,162,74,.55);'
      + 'font:600 12px/1.35 -apple-system,system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none;text-align:center;opacity:0;transition:opacity .25s';
    d.body.appendChild(el);
    return el;
  };
  return {
    show(text) { const e = ensure(); if (!e) return; clearTimeout(hideT); e.textContent = String(text || ''); e.hidden = false; e.style.opacity = '1'; },
    hide(ms) {
      if (!el) return;
      clearTimeout(hideT);
      hideT = setTimeout(() => { el.style.opacity = '0'; hideT = setTimeout(() => { el.hidden = true; }, 300); }, Math.max(0, +ms || 0));
    },
    text: () => (el && !el.hidden ? el.textContent : ''),
  };
}

// ------------------------------------------------------------------------------------------------ the engine
export function createNeuralVoice(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const store = o.storage !== undefined ? o.storage : safe(() => g.localStorage, null);
  const CS = () => (o.caches !== undefined ? o.caches : g.caches || null);
  const now = () => (typeof o.now === 'function' ? o.now() : Date.now());
  const makeWorker = typeof o.makeWorker === 'function' ? o.makeWorker
    : () => new g.Worker(new URL('./neural-voice-worker.js', import.meta.url), { type: 'module' });
  let worker = null, st = 'idle', started = null, device = '', why = '', msgId = 0, readyAt = 0, bootMs = 0, warmMs = 0, skipped = '', failedAt = 0;
  const prog = { loaded: 0, total: totalBytes(), file: '' };
  const waiting = new Map(), clips = new Map();
  const saved = +safe(() => store.getItem(NV.rtfKey), 0);
  const timing = { n: 0, rtf: saved > 0 && saved < 20 ? saved : 0, last: 0 };     // ms of work per ms of speech (an average)
  const emit = (name, x) => { if (typeof o[name] === 'function') safe(() => o[name](x)); };
  const setState = (s, w) => { st = s; if (w !== undefined) why = w; emit('onState', s); };
  const fails = () => jget(store, NV.failKey);
  const noteFail = (w) => { const f = fails(); safe(() => store.setItem(NV.failKey, JSON.stringify({ n: (+f.n || 0) + 1, at: now(), why: String(w).slice(0, 160) }))); };
  const resting = () => { const f = fails(); return (+f.n || 0) >= 3 && now() - (+f.at || 0) < 24 * 3600e3; };
  const pace = (r) => { if (!(r > 0) || r > 20) return; timing.rtf = timing.n ? timing.rtf * 0.7 + r * 0.3 : r; timing.n++; safe(() => store.setItem(NV.rtfKey, timing.rtf.toFixed(3))); };

  function supported() {
    if (typeof WebAssembly === 'undefined') return { ok: false, why: 'This browser cannot run WebAssembly.' };
    if (!g.Worker && typeof o.makeWorker !== 'function') return { ok: false, why: 'This browser cannot run a background worker.' };
    if (!CS()) return { ok: false, why: 'This browser has no storage for the voice (a private window?).' };
    return { ok: true, why: '' };
  }
  function drain(w) { for (const x of waiting.values()) x.bad(Object.assign(new Error(w), { engine: 'kokoro' })); waiting.clear(); }
  function fail(w) {
    const s0 = started;
    safe(() => worker.terminate()); worker = null; started = null;
    failedAt = now();
    drain(w); noteFail(w); setState('failed', w);
    if (s0) s0.ok(false);
  }
  function onMessage(e) {
    const m = (e && e.data) || {};
    if (m.type === 'progress') { prog.loaded = +m.loaded || 0; prog.total = +m.total || prog.total; prog.file = m.file || ''; emit('onProgress', progress()); return; }
    if (m.type === 'ready') {
      device = m.device || 'wasm'; bootMs = +m.ms || 0; warmMs = +m.warmMs || 0; readyAt = now();
      if (+m.rtf > 0) pace(+m.rtf);
      safe(() => store.setItem(NV.readyKey, '1')); safe(() => store.removeItem(NV.failKey));
      prog.loaded = prog.total; setState('ready', '');
      emit('onProgress', progress());
      if (started) started.ok(true);
      return;
    }
    if (m.type === 'audio') {
      const w = waiting.get(m.id); if (!w) return;
      waiting.delete(m.id);
      const rate = +m.rate || 24000, pcm = m.pcm instanceof Float32Array ? m.pcm : new Float32Array(m.pcm || []);
      const blob = floatToWav(pcm, rate), dur = Math.round((pcm.length / rate) * 1000);
      safe(() => { blob.dur = dur; blob.genMs = +m.ms || 0; });
      if (dur > 400) { pace((+m.ms || 0) / dur); timing.last = +m.ms || 0; }
      w.ok(blob);
      return;
    }
    if (m.type === 'error') {
      if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); w.bad(Object.assign(new Error(m.error || 'The AI voice failed.'), { engine: 'kokoro' })); }
      if (m.fatal) fail(m.error || 'The AI voice could not start.');
    }
  }
  function spawn() {
    const U = Object.assign({ lib: NV.lib, wasmBase: NV.wasmBase, hfPin: NV.hfPin }, o.urls || {});        // o.urls: tests only (a local copy of the CDN)
    worker = makeWorker();
    worker.onmessage = onMessage;
    worker.onerror = (e) => fail(String((e && e.message) || 'The AI voice stopped (the phone may be short of memory).'));
    worker.postMessage({ type: 'init', cfg: {
      lib: U.lib, wasmBase: U.wasmBase, wasmFiles: NV.wasmFiles, modelId: NV.modelId, hfMain: NV.hfMain, hfPin: U.hfPin, dtype: o.dtype || NV.dtype,
      voice: NV.voice, cacheName: NV.cacheName, sizes: Object.assign({}, NV.sizes, { ['voices/' + NV.voice + '.bin']: NV.voiceBytes }), totalBytes: totalBytes(),
      device: o.device || NV.device, warmText: 'Right.', measureText: "I'm here whenever you need me.",
    } });
  }
  // download / load once; resolves true when he can speak with it, false when it could not start (the iPhone voice speaks).
  // After a failure it waits 10 minutes (3 failures in a row: a day) before trying by itself again; force = he picked it just now.
  function start(force) {
    if (st === 'ready') return Promise.resolve(true);
    if (started) return started.p;
    const sup = supported();
    if (!sup.ok) { setState('unsupported', sup.why); return Promise.resolve(false); }
    if (!force && st === 'failed' && now() - failedAt < 600e3) return Promise.resolve(false);
    if (!force && resting()) { setState('failed', fails().why || 'The AI voice could not start on this phone.'); return Promise.resolve(false); }
    const s = {};
    s.p = new Promise((ok) => { s.ok = (v) => { if (started === s && !v) started = null; ok(!!v); }; });
    started = s;
    prog.loaded = 0; prog.total = totalBytes();
    setState('loading', '');
    try { spawn(); } catch (e) { fail(String((e && e.message) || e)); }
    return s.p;
  }
  function progress() {
    const t = prog.total || totalBytes(), l = Math.min(prog.loaded, t);
    const pct = t ? Math.floor((l / t) * 100) : 0;
    return { loaded: l, total: t, pct, file: prog.file, state: st, line: st === 'loading' ? READY_LINE + ' · ' + pct + '%' : '' };
  }
  const VOICES = ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'];             // the British men (the 2026-11-18 comparison; George is the one used)
  function ask(text, signal, voice) {
    return new Promise((ok, bad) => {
      if (st !== 'ready' || !worker) { bad(Object.assign(new Error('The AI voice is not ready yet.'), { engine: 'kokoro' })); return; }
      if (signal && signal.aborted) { bad(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      const id = ++msgId;
      waiting.set(id, { ok, bad });
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => {
        if (waiting.delete(id)) { safe(() => worker.postMessage({ type: 'drop', id })); bad(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
      });
      try { worker.postMessage({ type: 'gen', id, text: String(text), voice: VOICES.indexOf(voice) >= 0 ? voice : NV.voice, speed: NV.speed }); } catch (e) { waiting.delete(id); bad(e); }
    });
  }
  // repeated short lines ("Good evening.", "Voice on.", "I'm listening.") are kept as audio: memory, and Cache Storage between opens
  const clipUrl = (k) => 'https://olympus.local/voice/' + k;
  const clipKey = (voice, text) => hash53('v1|' + voice + '|' + NV.speed + '|' + text);
  const wavMs = (b) => Math.round(((b.size - 44) / 2 / 24000) * 1000);
  async function clipGet(k) {
    if (clips.has(k)) return clips.get(k);
    try {
      const c = await CS().open(NV.clipCache), hit = await c.match(clipUrl(k));
      if (!hit) return null;
      const b = await hit.blob();
      const blob = b.type === 'audio/wav' ? b : new Blob([b], { type: 'audio/wav' });
      safe(() => { blob.dur = wavMs(blob); blob.genMs = 0; blob.cached = true; });
      clips.set(k, blob);
      return blob;
    } catch (_) { return null; }
  }
  async function clipPut(k, blob) {
    clips.set(k, blob);
    if (clips.size > 80) clips.delete(clips.keys().next().value);
    try {
      const c = await CS().open(NV.clipCache);
      await c.put(clipUrl(k), new Response(blob, { headers: { 'content-type': 'audio/wav' } }));
      const keys = await c.keys();
      for (let i = 0; i < keys.length - 60; i++) await c.delete(keys[i]);
    } catch (_) { /* storage full or blocked: the memory copy is enough */ }
  }
  // the pieces reach the worker in the order they were asked for (a short first piece's cache lookup must not let the long second one
  // jump the queue: the first words would wait for it)
  let lane = Promise.resolve();
  async function synth(text, so) {
    const s = so && typeof so === 'object' ? so : {}, t = String(text || ''), voice = VOICES.indexOf(s.voice) >= 0 ? s.voice : NV.voice;
    const short = t.length <= 90, k = short ? clipKey(voice, t) : '';
    const prev = lane;
    let release = null;
    lane = new Promise((ok) => { release = ok; });
    let job = null;
    try {
      await prev;
      const hit = short ? await clipGet(k) : null;
      if (hit) return hit;
      job = ask(t, s.signal, voice);                                         // handed to the worker now, in turn
    } finally { release(); }
    const blob = await job;
    if (short) clipPut(k, blob);
    return blob;
  }
  // the pieces (a short first one), the breath after each, how long he may stay silent waiting for one
  const split = (text) => sentences(text, { first: 60, max: 220 }).map((t) => ({ text: t, pause: /\?$/.test(t) ? 300 : /[.!]$/.test(t) ? 200 : 80 }));
  const rtf = () => (timing.rtf > 0 ? timing.rtf : 1.6);                        // before any measurement: a cautious guess for a phone
  const timeoutFor = (i, piece) => {
    const est = (String(piece || '').length / CHARS_PER_S) * 1000;
    return Math.round(Math.max(i === 0 ? 7000 : 6000, est * rtf() * 1.6 + 2500));
  };
  // can this phone start the reply within FIRST_WAIT_S, and would its silences add up to no more than GAP_BUDGET_S? Else the iPhone voice.
  function fits(len, first) {
    const r = rtf(), T = Math.max(0, +len || 0) / CHARS_PER_S;
    if (first && (String(first).length / CHARS_PER_S) * r > FIRST_WAIT_S) return false;
    return r <= 1.1 || (r - 1) * Math.max(0, T - FIRST_S) <= GAP_BUDGET_S;
  }
  const firstPiece = (t) => { const p = t ? split(t) : []; return p.length ? p[0].text : ''; };
  function descriptor(ctx) {
    if (st !== 'ready') { skipped = st; return null; }
    const len = ctx && +ctx.len, first = ctx && ctx.text ? firstPiece(String(ctx.text)) : '';
    if ((len || first) && !fits(len, first)) { skipped = first && !fits(0, first) ? 'slow start' : 'long'; return null; }
    skipped = '';
    return { id: 'kokoro', key: 'x', voice: NV.voice, label: 'AI voice (' + NV.name + ')', maxChars: 220, timeoutMs: 9000, queueAll: true, split, timeoutFor, synth };
  }
  function stop() {
    safe(() => worker.terminate()); worker = null; started = null;
    for (const x of waiting.values()) x.bad(Object.assign(new Error('stopped'), { name: 'AbortError' }));
    waiting.clear();
    if (st !== 'failed' && st !== 'unsupported') setState('idle', '');
  }
  return {
    start, synth, descriptor, progress, stop, supported, fits,
    ready: () => st === 'ready', state: () => st, error: () => why,
    downloadedBefore: () => safe(() => store.getItem(NV.readyKey), null) === '1',
    stats: () => ({ state: st, device, why, bootMs, warmMs, readyAt, rtf: +rtf().toFixed(3), measured: timing.n, lastGenMs: timing.last, pct: progress().pct,
      voice: NV.voice, waiting: waiting.size, resting: resting(), before: safe(() => store.getItem(NV.readyKey), null) === '1', skipped, clips: clips.size }),
  };
}
export default createNeuralVoice;
