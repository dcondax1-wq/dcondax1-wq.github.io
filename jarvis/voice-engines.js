// Jarvis's voice engines (2026-11-04, owner: "Jarvis sounds like a bot, I want a real person, free"). The chooser behind the
// Voice sheet. tts.js stays the import-free fallback speaker; this file hands it (through createSpeaker's cloud / prosody / player
// options) whichever voice is best right now:
//
//   Auto             the best one available: a natural cloud voice (a saved free key; short replies, to spare the free quota),
//                    else the phone's Premium voice, else the on-device neural voice (if downloaded), else the phone's voice
//   Natural cloud    Gemini (free key, Google's TTS) or Groq Orpheus (free key): the saved smart-mode keys are reused, only ever sent
//                    to their own api host, never logged. A refusal (rate limit, terms, key) falls back to the phone for that reply
//   On-device neural Kokoro-82M inside the browser (kokoro-engine.js, ~115 MB once, optional): free, no key, slower
//   Phone voice      the iPhone's own voice (tts.js; Ava / Zoe Premium picked automatically), what Jarvis had before
//
//   import { createVoiceEngines, createPlayer, createAudioCache, GROQ, GEMINI, ENGINE_KEY } from './voice-engines.js';
//   const eng = createVoiceEngines({ storage, keys: () => ({ groq, gemini }), phoneVoice: () => voiceObject | null, fetch, caches })
//   eng.pick({ len })  -> a tts.js `cloud()` descriptor | null (= the phone's voice)     eng.prosody / eng.player: for createSpeaker
//   eng.settings() / eng.setSettings({ mode, brand, gvoice, hvoice, kvoice, prosody, conv, numbers })     eng.describe() -> { using, label, note }
//   eng.status() -> keys, device voice, phone voice tier, parked clouds            eng.explain(err, id) -> one plain sentence
//   eng.deviceDownload(cb) / eng.deviceRemove()      eng.samples      eng.test(text, id) -> Promise<Blob> (a voice, bypassing Auto)
// Audio cache: finished clips are kept (memory, and Cache Storage for short repeated phrases), so a repeated line is instant and
// costs no free quota. The player: ONE shared <audio> element, unlocked by the first tap (player.unlock(), called inside a tap by
// voice-out.js), which is what lets the iPhone play a clip that arrives later, and it plays through the Ring / Silent switch.
// iPhone Safari 16: plain ES2020, no regex lookbehind, no nullish or optional chaining (the lazy kokoro-engine.js has its own notes).

import { createProsody, SAMPLES } from './prosody.js';

export const ENGINE_KEY = 'jarvis.voiceEngine';           // { mode, brand, gvoice, hvoice, kvoice, prosody, conv, numbers }
export const TTS_KEY = 'jarvis.tts';                       // the older switch: { cloud: bool, voice }
export const GROQ = { url: 'https://api.groq.com/openai/v1/audio/speech', model: 'canopylabs/orpheus-v1-english', max: 200,
  voices: { hannah: 'Hannah (warm)', diana: 'Diana (clear)', autumn: 'Autumn (soft)' }, terms: 'https://console.groq.com/playground?model=canopylabs/orpheus-v1-english' };
export const GEMINI = { base: 'https://generativelanguage.googleapis.com/v1beta/models/', max: 400,
  models: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
  voices: { Kore: 'Kore (firm)', Aoede: 'Aoede (breezy)', Leda: 'Leda (youthful)', Sulafat: 'Sulafat (warm)', Achernar: 'Achernar (soft)', Zephyr: 'Zephyr (bright)', Vindemiatrix: 'Vindemiatrix (gentle)' } };
export const DEVICE_VOICES = { af_heart: 'Heart (warm)', af_bella: 'Bella (expressive)', af_nicole: 'Nicole (soft)', bf_emma: 'Emma (British)' };
export const AUTO_CLOUD_MAX = 420;                         // Auto uses a cloud voice for replies up to this long (the free plans are small)
const DEFAULTS = { mode: 'auto', brand: '', gvoice: 'Kore', hvoice: 'hannah', kvoice: 'af_heart', timeoutMs: 10000, prosody: true, conv: true, numbers: true };
const MODES = ['auto', 'cloud', 'device', 'phone'];
const KOKORO_FLAG = 'jarvis.kokoro.ready';                 // kokoro-engine.js sets it after a checked download
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };
const midnightMs = () => { const d = new Date(); d.setHours(24, 0, 5, 0); return Math.max(60000, d.getTime() - Date.now()); };

// ------------------------------------------------------------------------------------------------ audio helpers
export function pcm16ToWav(bytes, rate) {                  // headerless 16-bit little-endian mono PCM -> a WAV Blob
  const n = bytes.length, buf = new ArrayBuffer(44 + n), v = new DataView(buf), u8 = new Uint8Array(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n, true);
  u8.set(bytes, 44);
  return new Blob([buf], { type: 'audio/wav' });
}
export function b64ToBytes(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, '')), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const hash53 = (str) => {                                  // cyrb53: a cache key, not security
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
function httpError(status, bodyText, retryAfter) {
  const e = new Error('HTTP ' + status);
  e.status = status; e.retryAfter = +retryAfter || 0;
  const msg = String(bodyText || '');
  e.detail = msg.slice(0, 300);
  if (status === 429) e.reason = 'rate';
  else if (status === 401 || status === 403 || (status === 400 && /api key|API_KEY_INVALID|invalid_api_key/i.test(msg))) e.reason = /terms/i.test(msg) ? 'terms' : 'key';
  else if (/terms/i.test(msg) || /model_terms_required/i.test(msg)) e.reason = 'terms';
  else e.reason = 'bad';
  if (e.reason === 'terms' || e.reason === 'key') e.parkMs = 600000;
  return e;
}
async function readBody(r) { try { return await r.text(); } catch (_) { return ''; } }
const ra = (r) => (r && r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : 0);

// ------------------------------------------------------------------------------------------------ the cloud adapters
export async function groqSynth(text, o) {
  const r = await o.fetch(GROQ.url, { method: 'POST', signal: o.signal || undefined, headers: { Authorization: 'Bearer ' + o.key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: GROQ.model, voice: GROQ.voices[o.voice] ? o.voice : 'hannah', input: String(text).slice(0, GROQ.max), response_format: 'wav' }) });
  if (!r || !r.ok) throw httpError(r ? r.status : 0, r ? await readBody(r) : '', ra(r));
  const b = await r.blob();
  return b.type ? b : new Blob([b], { type: 'audio/wav' });
}
// Gemini: generateContent with the AUDIO modality, a prebuilt voice; the answer is base64 audio (WAV on the 3.8 models, 24 kHz 16-bit PCM
// on the older ones). A model that is gone (404 / unsupported) or out of quota (429) hands over to the next model in the list.
export async function geminiSynth(text, o) {
  const order = o.model ? [o.model].concat(GEMINI.models.filter((m) => m !== o.model)) : GEMINI.models;
  let last = null;
  for (const model of order) {
    const r = await o.fetch(GEMINI.base + model + ':generateContent', { method: 'POST', signal: o.signal || undefined, headers: { 'x-goog-api-key': o.key, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: String(text) }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI.voices[o.voice] ? o.voice : 'Kore' } } } } }) });
    if (!r || !r.ok) {
      const e = httpError(r ? r.status : 0, r ? await readBody(r) : '', ra(r));
      if (r && (r.status === 404 || r.status === 429 || (r.status === 400 && /model|not supported|unsupported|not found/i.test(e.detail) && e.reason !== 'key'))) { last = e; continue; }
      throw e;
    }
    const j = await r.json();
    const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const part = parts.find((p) => p && (p.inlineData || p.inline_data));
    const d = part && (part.inlineData || part.inline_data);
    if (!d || !d.data) { last = httpError(502, JSON.stringify((j && j.promptFeedback) || j || '').slice(0, 200), 0); last.reason = 'bad'; continue; }
    if (typeof o.onModel === 'function') safe(() => o.onModel(model));
    const bytes = b64ToBytes(d.data), mime = String(d.mimeType || d.mime_type || '');
    if (bytes.length > 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF') return new Blob([bytes], { type: 'audio/wav' });
    const rate = +((/rate=(\d+)/i.exec(mime) || [])[1]) || 24000;
    return pcm16ToWav(bytes, rate);
  }
  throw last || httpError(0, '', 0);
}

// ------------------------------------------------------------------------------------------------ the audio cache
export function createAudioCache(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const CS = () => (o.caches !== undefined ? o.caches : (typeof caches !== 'undefined' ? caches : null));
  const NAME = o.name || 'jarvis-voice-v1', MEM = o.memBytes || 24e6, PERSIST_N = o.persistMax || 40, PERSIST_CHARS = o.persistChars || 90, PERSIST_BYTES = 400e3;
  const mem = new Map();                                    // key -> Blob, oldest first
  let bytes = 0;
  const url = (k) => 'https://jarvis.local/voice/' + k;
  function remember(k, blob) {
    if (mem.has(k)) { bytes -= mem.get(k).size; mem.delete(k); }
    mem.set(k, blob); bytes += blob.size;
    while (bytes > MEM && mem.size > 1) { const f = mem.keys().next().value; bytes -= mem.get(f).size; mem.delete(f); }
  }
  async function get(k) {
    if (mem.has(k)) { const b = mem.get(k); mem.delete(k); mem.set(k, b); return b; }
    const cs = CS();
    if (!cs) return null;
    try {
      const c = await cs.open(NAME), hit = await c.match(url(k));
      if (!hit) return null;
      const b = await hit.blob();
      remember(k, b);
      return b;
    } catch (_) { return null; }
  }
  async function set(k, blob, text) {
    remember(k, blob);
    const cs = CS();
    if (!cs || !text || String(text).length > PERSIST_CHARS || blob.size > PERSIST_BYTES) return;
    try {
      const c = await cs.open(NAME);
      await c.put(url(k), new Response(blob, { headers: { 'content-type': blob.type || 'audio/wav' } }));
      const keys = await c.keys();
      for (let i = 0; i < keys.length - PERSIST_N; i++) await c.delete(keys[i]);
    } catch (_) { /* storage full or blocked: the memory copy is enough */ }
  }
  async function clear() { mem.clear(); bytes = 0; const cs = CS(); if (cs) try { await cs.delete(NAME); } catch (_) { /* gone */ } }
  return { get, set, clear, key: (...a) => hash53(a.join('|')), size: () => mem.size, bytes: () => bytes };
}

// ------------------------------------------------------------------------------------------------ the player
// 16 ms of silence as a data URL: playing it inside a tap unlocks the shared element for the rest of the page's life (iOS)
const SILENCE = (() => { const n = 800, b = new Uint8Array(44 + n); const v = new DataView(b.buffer); const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
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
  function unlock() {                                       // call inside a tap
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
  function play(blob) {
    if (!ensure() || !U || !U.createObjectURL) return Promise.reject(new Error('no audio'));
    stop();
    return new Promise((ok, bad) => {
      const url = U.createObjectURL(blob), me = { ok, url };
      cur = me;
      const end = (err) => { if (cur === me) cur = null; safe(() => U.revokeObjectURL(url)); if (err) bad(err); else ok(); };
      me.end = end;
      el.onended = () => end(null);
      el.onerror = () => end(new Error('audio'));
      try {
        el.src = url; el.volume = 1; el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch((e) => end(e || new Error('play blocked')));
      } catch (e) { end(e); }
    });
  }
  function stop() { const me = cur; if (el) safe(() => el.pause()); if (me && me.end) me.end(null); cur = null; }
  return { unlock, play, stop, unlocked: () => unlocked, element: () => el, playing: () => !!cur };
}

// ------------------------------------------------------------------------------------------------ the chooser
export function createVoiceEngines(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const store = o.storage !== undefined ? o.storage : safe(() => localStorage, null);
  const F = (...a) => (typeof o.fetch === 'function' ? o.fetch : fetch)(...a);
  const now = () => (typeof o.now === 'function' ? o.now() : Date.now());
  const keys = () => safe(() => (typeof o.keys === 'function' ? o.keys() || {} : {}), {});
  const cache = o.cache || createAudioCache({ caches: o.caches });
  const player = o.player || createPlayer({ Audio: o.Audio, URL: o.URL });
  const parkedUntil = {};
  let kok = null, kokP = null, lastUsed = '';
  const json = (k, d) => { try { const v = JSON.parse(store.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };

  // ---------------------------------------------------------------- settings
  function settings() {
    const s = Object.assign({}, DEFAULTS, json(ENGINE_KEY, {}));
    const old = json(TTS_KEY, {});
    if (!MODES.includes(s.mode)) s.mode = 'auto';
    if (s.brand !== 'groq' && s.brand !== 'gemini') s.brand = '';
    if (!GEMINI.voices[s.gvoice]) s.gvoice = DEFAULTS.gvoice;
    if (!GROQ.voices[s.hvoice]) s.hvoice = GROQ.voices[old.voice] ? old.voice : DEFAULTS.hvoice;
    if (!DEVICE_VOICES[s.kvoice]) s.kvoice = DEFAULTS.kvoice;
    s.timeoutMs = Number.isFinite(+s.timeoutMs) ? Math.max(3000, Math.min(300000, +s.timeoutMs)) : DEFAULTS.timeoutMs;     // how long a cloud voice may take before the phone says the reply
    s.cloudOk = old.cloud !== false;                         // the older switch ("cloud voice off") still stops Auto from using a key
    return s;
  }
  function setSettings(patch) {
    const cur = json(ENGINE_KEY, {}), p = patch && typeof patch === 'object' ? patch : {};
    const next = Object.assign({}, cur);
    for (const k of Object.keys(DEFAULTS)) if (k in p) next[k] = p[k];
    safe(() => store.setItem(ENGINE_KEY, JSON.stringify(next)));
    if ('cloudOk' in p) safe(() => store.setItem(TTS_KEY, JSON.stringify(Object.assign({}, json(TTS_KEY, {}), { cloud: !!p.cloudOk }))));
    return settings();
  }
  const prosody = createProsody({ switches: () => { const s = settings(); return { off: !s.prosody, conversational: s.conv, numbers: s.numbers }; } });

  // ---------------------------------------------------------------- the phone's voice
  function phoneInfo() {
    const v = safe(() => (typeof o.phoneVoice === 'function' ? o.phoneVoice() : null), null);
    if (!v) return { name: '', tier: 'none', label: "the phone's default voice" };
    const id = (v.name || '') + ' ' + (v.voiceURI || '');
    const tier = /premium/i.test(id) ? 'premium' : /enhanced|neural|natural/i.test(id) ? 'enhanced' : /compact/i.test(id) ? 'compact' : 'standard';
    return { name: v.name || '', tier, label: String(v.name || '').replace(/\s*\(.*\)$/, '') + (tier === 'premium' ? ' (Premium)' : tier === 'enhanced' ? ' (Enhanced)' : tier === 'compact' ? ' (Compact)' : '') };
  }

  // ---------------------------------------------------------------- the engines
  const parked = (id) => (parkedUntil[id] || 0) > now();
  function wrap(id, voiceKey, raw) {
    return async (text, so) => {
      const k = cache.key(id, voiceKey, text);
      const hit = await cache.get(k);
      if (hit) return hit;
      try {
        const blob = await raw(text, so || {});
        cache.set(k, blob, text);
        return blob;
      } catch (e) {
        if (e && e.name !== 'AbortError') {
          let ms = 0;
          if (Number.isFinite(+e.parkMs) && +e.parkMs > 0) ms = +e.parkMs;
          else if (e.status === 429) ms = +e.retryAfter > 0 && +e.retryAfter <= 300 ? (+e.retryAfter + 2) * 1000 : midnightMs();
          if (ms) parkedUntil[id] = now() + ms;
          if (e && !e.engine) e.engine = id;
        }
        throw e;
      }
    };
  }
  function buildCloud(st) {
    const k = keys();
    const order = st.brand ? [st.brand] : ['gemini', 'groq'];
    for (const id of order) {
      const key = typeof k[id] === 'string' ? k[id].trim() : '';
      if (!key || parked(id)) continue;
      if (id === 'gemini') {
        return { id, key: 'x', voice: st.gvoice, maxChars: GEMINI.max, label: 'Gemini voice', timeoutMs: st.timeoutMs,
          synth: wrap('gemini', st.gvoice, (t, so) => geminiSynth(t, { fetch: F, key, voice: st.gvoice, signal: so.signal, model: safe(() => store.getItem('jarvis.tts.gmodel'), '') || '', onModel: (m) => safe(() => store.setItem('jarvis.tts.gmodel', m)) })) };
      }
      return { id, key: 'x', voice: st.hvoice, maxChars: GROQ.max, label: 'Groq voice', timeoutMs: st.timeoutMs, synth: wrap('groq', st.hvoice, (t, so) => groqSynth(t, { fetch: F, key, voice: st.hvoice, signal: so.signal })) };
    }
    return null;
  }
  const deviceReady = () => safe(() => store.getItem(KOKORO_FLAG), null) === '1';
  const deviceSupported = () => {
    if (typeof WebAssembly === 'undefined' || (o.caches === undefined && typeof caches === 'undefined')) return false;
    try { new RegExp('(?' + '<=a)b'); } catch (_) { return false; }
    return true;
  };
  function loadKokoro() {
    if (kok) return Promise.resolve(kok);
    if (!kokP) {
      kokP = (typeof o.loadKokoro === 'function' ? o.loadKokoro() : import('./kokoro-engine.js')).then((m) => { kok = m.createKokoro({ storage: store, fetch: o.fetch, caches: o.caches }); return kok; }, (e) => { kokP = null; throw e; });
    }
    return kokP;
  }
  function buildDevice(st) {
    if (!deviceReady() || !deviceSupported() || parked('kokoro')) return null;
    return { id: 'kokoro', key: 'x', voice: st.kvoice, maxChars: 220, label: 'On-device voice', timeoutMs: Math.max(30000, st.timeoutMs),
      synth: wrap('kokoro', st.kvoice, async (t, so) => { const k = await loadKokoro(); return k.synth(t, { voice: st.kvoice, speed: 1, signal: so.signal }); }) };
  }
  // the tts.js `cloud()` hook: a descriptor, or null = the phone's voice
  function pick(ctx) {
    const st = settings(), len = ctx && Number.isFinite(+ctx.len) ? +ctx.len : 0;
    if (st.mode === 'phone') return null;
    if (st.mode === 'cloud') return buildCloud(st);
    if (st.mode === 'device') return buildDevice(st);
    const c = st.cloudOk && len <= AUTO_CLOUD_MAX ? buildCloud(st) : null;       // auto
    if (c) return c;
    if (phoneInfo().tier === 'premium') return null;
    return buildDevice(st);
  }
  function describe() {
    const st = settings(), d = pick({ len: 0 }), ph = phoneInfo(), k = keys();
    const hasKey = !!(k.gemini || k.groq);
    let using = d ? d.id : 'phone', label = d ? d.label : (ph.name ? ph.label : "Phone voice"), note = '';
    if (st.mode === 'auto') {
      if (d) note = 'Auto is using the ' + d.label + ' (short replies; longer ones use the next best voice).';
      else if (ph.tier === 'premium') note = 'Auto is using your phone\'s ' + ph.label + ', its most natural voice.';
      else note = 'Auto is using the phone voice' + (ph.name ? ' (' + ph.label + ')' : '') + '. For a more natural one: add a free Gemini or Groq key (⋯ → AI key), download the on-device voice, or get the Premium phone voice below.';
    } else if (st.mode === 'cloud') note = d ? 'Natural cloud: ' + d.label + '.' : (hasKey ? 'The cloud voice is resting right now, so the phone voice is used.' : 'Natural cloud needs a free Gemini or Groq key (⋯ → AI key). Until then the phone voice is used.');
    else if (st.mode === 'device') note = d ? 'On-device neural voice.' : (deviceReady() ? 'The on-device voice cannot run here, so the phone voice is used.' : 'Download the on-device voice below. Until then the phone voice is used.');
    else note = 'Phone voice' + (ph.name ? ': ' + ph.label : '') + '.';
    return { mode: st.mode, using, label, note };
  }
  function status() {
    const k = keys(), sup = deviceSupported();
    return { keys: { gemini: !!k.gemini, groq: !!k.groq }, parked: { gemini: parked('gemini') ? parkedUntil.gemini - now() : 0, groq: parked('groq') ? parkedUntil.groq - now() : 0, kokoro: parked('kokoro') ? parkedUntil.kokoro - now() : 0 },
      device: { supported: sup, ready: deviceReady(), mb: 115, state: kok ? kok.state() : 'idle', error: kok ? kok.error() : '' }, phone: phoneInfo(), used: lastUsed };
  }
  // one plain sentence for a toast when a voice said no
  function explain(err, id) {
    const who = id === 'gemini' ? 'Gemini' : id === 'groq' ? 'Groq' : id === 'kokoro' ? 'The on-device voice' : 'The cloud voice';
    const r = err && err.reason;
    if (id === 'kokoro') return 'The on-device voice could not run (' + String((err && err.message) || 'unknown').slice(0, 80) + '). Using the phone voice.';
    if (r === 'terms') return 'Groq wants a one-time OK for its voice: open console.groq.com/playground?model=canopylabs/orpheus-v1-english once and tap Accept. Using the phone voice for now.';
    if (r === 'key') return who + ' did not accept the key. Check it in ⋯ → AI key. Using the phone voice.';
    if (r === 'rate' || (err && err.status === 429)) return who + "'s free voice is resting (its free limit is small). Using the phone voice for now.";
    return who + ' voice is not answering right now. Using the phone voice.';
  }
  async function deviceDownload(cb, signal) { const k = await loadKokoro(); return k.download(cb, signal); }
  async function deviceRemove() { const k = await loadKokoro(); await k.remove(); return true; }
  // a voice by id, bypassing Auto: the Voice sheet's sample buttons use the chosen mode, this is for explicit tests
  function direct(id) { const st = settings(); return id === 'device' || id === 'kokoro' ? buildDevice(st) : id === 'gemini' || id === 'groq' ? buildCloud(Object.assign({}, st, { brand: id })) : null; }
  return { pick, settings, setSettings, describe, status, explain, prosody, player, cache, samples: SAMPLES, deviceDownload, deviceRemove, direct, phoneInfo, noteUsed: (id) => { lastUsed = id || ''; }, unpark: (id) => { delete parkedUntil[id]; } };
}
export default createVoiceEngines;
