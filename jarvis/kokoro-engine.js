// Jarvis's on-device neural voice (2026-11-04): Kokoro-82M (Apache-2.0) running inside the phone's browser, no key, no account, no
// server. Optional and lazy: nothing here loads until the owner taps "Download" in the Voice sheet (voice-engines.js imports this
// file only then). Free, but heavy: about 115 MB once (model 92 MB + the ONNX runtime 21.6 MB + the library 2 MB + 4 voices 2 MB),
// then kept in the browser's Cache Storage (the Jarvis service worker does NOT keep it: far too big for that).
//
// What it fetches, all from cdn.jsdelivr.net/npm at an exact version (the project's CDN rule):
//   kokoro-js@1.2.1 /dist/kokoro.web.js        the library (bundles transformers.js 3.5.1 and the espeak phonemizer)
//   kokoro-js@1.2.1 /voices/<voice>.bin         the voice styles (kokoro-js itself would fetch these from huggingface.co)
//   @huggingface/transformers@3.5.1 /dist/ort-wasm-simd-threaded.jsep.{mjs,wasm}    the ONNX runtime (WASM; WebGPU is not used:
//                                               its fp32 model is 325 MB and its quantised ones give wrong sound)
//   kokoro-q8-shards@1.0.0 /kokoro-q8.part0..5.bin   the official model_quantized.onnx cut in 6 parts so a CDN will serve it (a
//                                               third party's npm package, so the join is checked against the official file's SHA-256
//                                               in KO.shardSha256 and refused if one differs: the weights are data, never code;
//                                               the six hashes join to the official file's SHA-256, KO.modelSha256)
// The tiny config / tokenizer files (7 KB) are inlined below. The model and the voices are put into the caches under the exact
// huggingface.co URLs transformers.js and kokoro-js look up, so they never contact huggingface.co at all.
//
// The model runs in a Web Worker (a blob: module worker made here), so the 3D core and the taps never freeze while it thinks.
// Needs: WebAssembly, Cache Storage, crypto.subtle, module workers, and regex lookbehind (the library uses it): iOS 16.4+.
// Honest limits: single-threaded WASM (a page without cross-origin isolation gets one thread), so on a phone it speaks about as fast
// as it listens or slower; the first sentence takes a few seconds. iPhone Safari memory is the risk on older phones; if the worker
// dies the speaker falls back to the phone's voice and the Voice sheet says so.
//
//   import { createKokoro, KO } from './kokoro-engine.js';
//   const k = createKokoro({ storage, fetch, caches, crypto, Worker, Blob, URL })
//   k.supported() -> { ok, why }      k.ready() (sync: was it downloaded here)      await k.downloaded() (the caches really hold it)
//   await k.download(({ phase, done, total, label }) => {})      await k.remove()
//   await k.synth(text, { voice: 'af_heart', speed: 1, signal }) -> Blob (audio/wav, 24 kHz mono)
// iPhone Safari 16: plain ES2020 (the worker's source is a string), no regex lookbehind, no nullish or optional chaining

export const KO = {
  lib: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js',
  voiceBase: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/voices/',
  wasmBase: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/',
  wasmFiles: ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'],
  shardBase: 'https://cdn.jsdelivr.net/npm/kokoro-q8-shards@1.0.0/kokoro-q8.part',
  shards: [17825792, 17825792, 17825792, 17825792, 17825792, 3232156],     // bytes of part0..part5.bin
  modelBytes: 92361116,
  shardSha256: [
    'a5579cd072fe7b9744888494d19db7ac3b38a1ddf75321891dec17077f62853f',
    'a8b547ebb95c310e4a9f80d933e8f512a987e2f0af9dfee1ab9f2d3a8c53a07f',
    'a13c29cca7ae59d0ee25ec4feba5cd8fe0bbcd5ac13ce6889e1f18d80128da59',
    '7fe410ff7341ef8d2ab09cf2ed53abbfdc65dd803846eb48f90ba60e5fd7485b',
    '31e91976b4dd4c99a789356391eccc5bf78eb02393b8f194e9199807ff683585',
    '897ad16a0b1ad0067852b3f67992b6cb874f96c4944ae688f45253db0d86d9df',
  ],                                                          // each part is checked, so the join never needs a second 92 MB copy
  modelSha256: 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',     // onnx-community/Kokoro-82M-v1.0-ONNX onnx/model_quantized.onnx
  hf: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/',
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  voices: { af_heart: 'Heart (warm, the best rated)', af_bella: 'Bella (expressive)', af_nicole: 'Nicole (soft, close to the mic)', bf_emma: 'Emma (British)' },
  cacheModel: 'transformers-cache', cacheVoices: 'kokoro-voices', cacheWasm: 'jarvis-kokoro-wasm',
  flag: 'jarvis.kokoro.ready',
  approxMB: 115,
};
// the files from the model repo that are not weights (7 KB in all), inlined so nothing is fetched from huggingface.co
const SMALL = {
  'tokenizer.json': '{"version":"1.0","truncation":null,"padding":null,"added_tokens":[],"normalizer":{"type":"Replace","pattern":{"Regex":"[^$;:,.!?—…\\"()“” ̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ]"},"content":""},"pre_tokenizer":{"type":"Split","pattern":{"Regex":""},"behavior":"Isolated","invert":false},"post_processor":{"type":"TemplateProcessing","single":[{"SpecialToken":{"id":"$","type_id":0}},{"Sequence":{"id":"A","type_id":0}},{"SpecialToken":{"id":"$","type_id":0}}],"special_tokens":{"$":{"id":"$","ids":[0],"tokens":["$"]}}},"decoder":null,"model":{"vocab":{"$":0,";":1,":":2,",":3,".":4,"!":5,"?":6,"—":9,"…":10,"\\"":11,"(":12,")":13,"“":14,"”":15," ":16,"̃":17,"ʣ":18,"ʥ":19,"ʦ":20,"ʨ":21,"ᵝ":22,"ꭧ":23,"A":24,"I":25,"O":31,"Q":33,"S":35,"T":36,"W":39,"Y":41,"ᵊ":42,"a":43,"b":44,"c":45,"d":46,"e":47,"f":48,"h":50,"i":51,"j":52,"k":53,"l":54,"m":55,"n":56,"o":57,"p":58,"q":59,"r":60,"s":61,"t":62,"u":63,"v":64,"w":65,"x":66,"y":67,"z":68,"ɑ":69,"ɐ":70,"ɒ":71,"æ":72,"β":75,"ɔ":76,"ɕ":77,"ç":78,"ɖ":80,"ð":81,"ʤ":82,"ə":83,"ɚ":85,"ɛ":86,"ɜ":87,"ɟ":90,"ɡ":92,"ɥ":99,"ɨ":101,"ɪ":102,"ʝ":103,"ɯ":110,"ɰ":111,"ŋ":112,"ɳ":113,"ɲ":114,"ɴ":115,"ø":116,"ɸ":118,"θ":119,"œ":120,"ɹ":123,"ɾ":125,"ɻ":126,"ʁ":128,"ɽ":129,"ʂ":130,"ʃ":131,"ʈ":132,"ʧ":133,"ʊ":135,"ʋ":136,"ʌ":138,"ɣ":139,"ɤ":140,"χ":142,"ʎ":143,"ʒ":147,"ʔ":148,"ˈ":156,"ˌ":157,"ː":158,"ʰ":162,"ʲ":164,"↓":169,"→":171,"↗":172,"↘":173,"ᵻ":177}}}',
  'config.json': '{\n  "model_type": "style_text_to_speech_2"\n}\n',
  'tokenizer_config.json': '{\n  "model_max_length": 512,\n  "pad_token": "$",\n  "tokenizer_class": "PreTrainedTokenizer",\n  "unk_token": "$"\n}\n',
};
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };

// ------------------------------------------------------------------------------------------------ the worker (a string)
const WORKER_SRC = `
let tts = null, booting = null;
const cfg = { lib: '', wasmBase: '', cacheWasm: '', modelId: '' };
const rf = self.fetch.bind(self);
// the ONNX runtime's files come from Cache Storage only (put there by the tapped download); a miss is an error, never a download
self.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (cfg.wasmBase && url.indexOf(cfg.wasmBase) === 0) {
    try {
      const c = await caches.open(cfg.cacheWasm), hit = await c.match(url);
      if (hit) return hit;
    } catch (_) { /* below */ }
    throw new Error('The speech engine is not in this phone\'s storage (download it again in the Voice sheet).');     // never a silent 21 MB fetch
  }
  return rf(input, init);
};
async function boot(c) {
  Object.assign(cfg, c);
  const mod = await import(cfg.lib);
  tts = await mod.KokoroTTS.from_pretrained(cfg.modelId, { dtype: 'q8', device: 'wasm' });
}
self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') { booting = booting || boot(m.cfg); await booting; postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'gen') {
      if (!tts) { booting = booting || boot(m.cfg); await booting; }
      const a = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const pcm = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
      postMessage({ id: m.id, ok: true, pcm, rate: a.sampling_rate || 24000 }, [pcm.buffer]);
      return;
    }
  } catch (err) { booting = null; postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) }); }
};
`;

// ------------------------------------------------------------------------------------------------ helpers
export function floatToWav(pcm, rate) {                       // Float32 [-1, 1] mono -> a 16-bit WAV Blob
  const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

// ------------------------------------------------------------------------------------------------ the engine
export function createKokoro(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const store = o.storage !== undefined ? o.storage : safe(() => g.localStorage, null);
  const F = (...a) => (typeof o.fetch === 'function' ? o.fetch : g.fetch)(...a);
  const CS = () => (o.caches !== undefined ? o.caches : g.caches);
  const Cr = () => (o.crypto !== undefined ? o.crypto : g.crypto);
  const W = o.Worker !== undefined ? o.Worker : g.Worker;
  const B = o.Blob || g.Blob, U = o.URL || g.URL;
  let worker = null, msgId = 0, state = 'idle', lastError = '', booted = null, verified = false;
  const waiting = new Map();

  function supported() {
    if (!CS() || typeof CS().open !== 'function') return { ok: false, why: 'This browser has no offline storage for the voice.' };
    if (typeof WebAssembly === 'undefined') return { ok: false, why: 'This browser cannot run WebAssembly.' };
    if (!W || !B || !U || !U.createObjectURL) return { ok: false, why: 'This browser cannot run a background worker.' };
    if (!Cr() || !Cr().subtle) return { ok: false, why: 'The voice file cannot be checked here (needs a secure page).' };
    try { new RegExp('(?' + '<=a)b'); } catch (_) { return { ok: false, why: 'This iPhone is too old (needs iOS 16.4 or newer).' }; }
    return { ok: true, why: '' };
  }
  const ready = () => safe(() => store.getItem(KO.flag), null) === '1';
  const setReady = (v) => safe(() => { if (v) store.setItem(KO.flag, '1'); else store.removeItem(KO.flag); });
  async function downloaded() {
    try {
      const c = await CS().open(KO.cacheModel);
      if (!(await c.match(KO.hf + 'onnx/model_quantized.onnx')) || !(await (await CS().open(KO.cacheVoices)).match(KO.hf + 'voices/af_heart.bin'))) return false;
      const w = await CS().open(KO.cacheWasm);
      for (const f of KO.wasmFiles) if (!(await w.match(KO.wasmBase + f))) return false;
      return true;
    } catch (_) { return false; }
  }

  // fetch one URL with byte progress; returns the bytes as an ArrayBuffer
  async function getBytes(url, label, total, onP, signal, base) {
    const r = await F(url, { signal: signal || undefined });
    if (!r || !r.ok) throw new Error('Could not download ' + label + ' (' + (r ? r.status : 'offline') + ').');
    if (!r.body || typeof r.body.getReader !== 'function') { const ab = await r.arrayBuffer(); onP({ done: base + ab.byteLength, label }); return ab; }
    const rd = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const x = await rd.read();
      if (x.done) break;
      parts.push(x.value); got += x.value.length;
      onP({ done: base + got, label });
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out.buffer;
  }
  async function download(onProgress, signal) {
    const sup = supported();
    if (!sup.ok) throw new Error(sup.why);
    const total = KO.modelBytes + 21596019 + 2135146 + Object.keys(KO.voices).length * 522240;
    let base = 0;
    const emit = (x) => { if (typeof onProgress === 'function') safe(() => onProgress({ phase: x.phase || 'download', done: x.done, total, label: x.label })); };
    state = 'downloading';
    try {
      // 1. the model, in six parts, joined and checked against the official file's hash
      const parts = [];
      for (let i = 0; i < KO.shards.length; i++) {
        const ab = await getBytes(KO.shardBase + i + '.bin', 'the voice model (part ' + (i + 1) + ' of ' + KO.shards.length + ')', total, (x) => emit({ done: x.done, label: x.label }), signal, base);
        if (ab.byteLength !== KO.shards[i]) throw new Error('The voice model came through damaged (part ' + (i + 1) + '). Try again.');
        if (hex(await Cr().subtle.digest('SHA-256', ab)) !== KO.shardSha256[i]) throw new Error('The voice model did not match its checksum, so it was not installed.');
        parts.push(ab); base += ab.byteLength;
      }
      const blob = new B(parts, { type: 'application/octet-stream' });
      const cm = await CS().open(KO.cacheModel);
      await cm.put(KO.hf + 'onnx/model_quantized.onnx', new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
      for (const f of Object.keys(SMALL)) await cm.put(KO.hf + f, new Response(SMALL[f], { headers: { 'content-type': 'application/json' } }));
      // 2. the ONNX runtime (cached under its own CDN URL; the worker reads it from there)
      const cw = await CS().open(KO.cacheWasm);
      for (const f of KO.wasmFiles) {
        const ab = await getBytes(KO.wasmBase + f, 'the speech engine', total, (x) => emit({ done: x.done, label: x.label }), signal, base);
        base += ab.byteLength;
        await cw.put(KO.wasmBase + f, new Response(ab, { headers: { 'content-type': /\.wasm$/.test(f) ? 'application/wasm' : 'text/javascript' } }));
      }
      // 3. the voices (kokoro-js asks huggingface.co for them: they are put in its own cache under that address)
      const cv = await CS().open(KO.cacheVoices);
      for (const v of Object.keys(KO.voices)) {
        const ab = await getBytes(KO.voiceBase + v + '.bin', 'a voice', total, (x) => emit({ done: x.done, label: x.label }), signal, base);
        base += ab.byteLength;
        await cv.put(KO.hf + 'voices/' + v + '.bin', new Response(ab, { headers: { 'content-type': 'application/octet-stream' } }));
      }
      setReady(true); state = 'idle'; lastError = ''; verified = true;
      emit({ phase: 'done', done: total, label: 'ready' });
      return true;
    } catch (e) {
      state = 'error'; lastError = String((e && e.message) || e);
      throw e;
    }
  }
  async function remove() {
    stop();
    for (const n of [KO.cacheModel, KO.cacheVoices, KO.cacheWasm]) await safe(() => CS().delete(n), null);
    setReady(false); state = 'idle'; verified = false;
    return true;
  }

  // ---------------------------------------------------------------- the worker
  const cfg = { lib: KO.lib, wasmBase: KO.wasmBase, cacheWasm: KO.cacheWasm, modelId: KO.modelId };
  function stop() {
    if (worker) { safe(() => worker.terminate()); worker = null; }
    booted = null;
    for (const w of waiting.values()) w.bad(new Error('stopped'));
    waiting.clear();
  }
  function ensureWorker() {
    if (worker) return worker;
    const url = U.createObjectURL(new B([WORKER_SRC], { type: 'text/javascript' }));
    worker = new W(url, { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data || {}, w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.ok(m); else w.bad(new Error(m.error || 'The on-device voice failed.'));
    };
    worker.onerror = (e) => {
      const msg = (e && e.message) || 'The on-device voice stopped.';
      state = 'error'; lastError = msg;
      for (const w of waiting.values()) w.bad(new Error(msg));
      waiting.clear(); safe(() => worker.terminate()); worker = null; booted = null;
    };
    return worker;
  }
  function ask(msg, signal) {
    return new Promise((ok, bad) => {
      const id = ++msgId;
      if (signal && signal.aborted) { bad(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      waiting.set(id, { ok, bad });
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => { if (waiting.delete(id)) bad(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      try { ensureWorker().postMessage(Object.assign({ id, cfg }, msg)); } catch (e) { waiting.delete(id); bad(e); }
    });
  }
  async function warm() {                                       // load the model into the worker (a few seconds the first time)
    if (!booted) { state = 'loading'; booted = ask({ type: 'init' }).then(() => { state = 'ready'; return true; }, (e) => { booted = null; state = 'error'; lastError = String(e.message || e); throw e; }); }
    return booted;
  }
  async function synth(text, so) {
    const s = so && typeof so === 'object' ? so : {};
    const sup = supported();
    if (!sup.ok) throw new Error(sup.why);
    if (!ready()) throw new Error('The on-device voice is not downloaded yet.');
    if (!verified) {                                            // the phone may have cleared its storage since: then it is not downloaded (never a surprise fetch from huggingface.co)
      if (!(await downloaded())) { setReady(false); throw new Error('The on-device voice was cleared from this phone. Download it again in the Voice sheet.'); }
      verified = true;
    }
    const voice = Object.prototype.hasOwnProperty.call(KO.voices, s.voice) ? s.voice : 'af_heart';
    const guard = (p, ms) => { let t = 0; return Promise.race([p, new Promise((ok, bad) => { t = setTimeout(() => { stop(); bad(new Error('The on-device voice took too long.')); }, ms); })]).finally(() => clearTimeout(t)); };
    await guard(warm(), 150000);
    const m = await guard(ask({ type: 'gen', text: String(text), voice, speed: Math.max(0.6, Math.min(1.6, +s.speed || 1)) }, s.signal), 60000);
    return floatToWav(m.pcm, m.rate || 24000);
  }
  return { supported, ready, downloaded, download, remove, synth, warm, stop, state: () => state, error: () => lastError, KO };
}
export default createKokoro;
