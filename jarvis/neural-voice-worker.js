// Jarvis's AI voice, the worker (2026-11-18, owner: "Jarvis voice sucks, it sounds like a bot, it should sound like a person"; he
// picked Male, British). Runs Kokoro-82M (Apache-2.0) through kokoro-js inside this Web Worker, so the page never freezes while it
// downloads or thinks. Started by neural-voice.js (new Worker('./neural-voice-worker.js', { type: 'module' })).
//
// Files (fetched once, then kept in this browser's Cache Storage, so later opens are instant and work offline):
//   cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js                          the library (transformers.js 3.5.1 + the espeak phonemizer)
//   cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/ort-wasm-simd-threaded.jsep.{mjs,wasm}   the ONNX runtime it needs
//   huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX at commit 1939ad2a (pinned: the files can never change under us)
//     onnx/model_quantized.onnx (q8, 92 MB) + config / tokenizer + voices/<voice>.bin (0.5 MB)
// The model and the voice are cached by transformers.js / kokoro-js themselves ('transformers-cache', 'kokoro-voices'); the library
// and the runtime here ('olympus-voice-v1'). None of the names start with 'jarvis-': Jarvis's service worker clears those on update.
// Device: WebAssembly (cfg.device 'wasm', what the page sends). WebGPU only when asked ('webgpu', tests): with the q8 model it makes
// wrong audio (measured 2026-11-18 in Chromium: the same sentence 11% shorter, its loudness curve 0.26 alike vs 0.998 on WebAssembly),
// and the model that is right there is 326 MB. A WebGPU start that fails falls back to WebAssembly here.
//
// Messages in:  { type: 'init', cfg }   { type: 'gen', id, text, voice, speed }   { type: 'drop', id }
// Messages out: { type: 'progress', loaded, total, file }   { type: 'ready', device, dtype, ms, warmMs, rtf (ms of work per ms of speech) }
//               { type: 'audio', id, pcm (Float32Array, transferred), rate, ms }   { type: 'error', id, error, fatal, webgpuFailed }
// iPhone Safari 16.4+: plain ES2020 module worker, no nullish or optional chaining.

let tts = null, booting = null, cfg = null, device = 'wasm';
const queue = [];
let busy = false, current = 0, droppedCur = false;
const rawFetch = self.fetch.bind(self);
const post = (m, t) => { try { self.postMessage(m, t || []); } catch (_) { /* the page is gone */ } };
const errText = (e) => String((e && e.message) || e || 'unknown error').slice(0, 300);

// the model repo at one commit: transformers.js and kokoro-js ask for .../resolve/main/..., this answers with the pinned commit
function installFetch(c) {
  self.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (c.hfMain && c.hfPin && url.indexOf(c.hfMain) === 0) return rawFetch(c.hfPin + url.slice(c.hfMain.length), init);
    return rawFetch(input, init);
  };
}

// ------------------------------------------------------------------------------------------------ progress over every file
const prog = { files: {}, total: 0, last: 0 };
function track(file, loaded, total) {
  const f = prog.files[file] || (prog.files[file] = { loaded: 0, total: 0 });
  f.loaded = Math.max(f.loaded, +loaded || 0);
  if (+total > 0) f.total = +total;
  let l = 0;
  for (const k of Object.keys(prog.files)) l += Math.min(prog.files[k].loaded, prog.files[k].total || prog.files[k].loaded);
  const now = Date.now();
  if (now - prog.last < 200 && l < prog.total) return;          // at most five updates a second: the page stays calm
  prog.last = now;
  post({ type: 'progress', loaded: Math.min(l, prog.total), total: prog.total, file });
}

// one file: from Cache Storage, else the network (with progress), then kept
async function cachedBytes(url, name, type) {
  let cache = null;
  try { cache = await caches.open(cfg.cacheName); const hit = await cache.match(url); if (hit) { const b = await hit.arrayBuffer(); track(name, b.byteLength, b.byteLength); return b; } } catch (_) { cache = null; }
  const r = await rawFetch(url, { mode: 'cors', credentials: 'omit' });
  if (!r || !r.ok) throw new Error('Could not download ' + name + ' (' + (r ? r.status : 'offline') + ').');
  const total = +(r.headers && r.headers.get('content-length')) || 0;
  let buf;
  if (r.body && typeof r.body.getReader === 'function') {
    const rd = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) { const x = await rd.read(); if (x.done) break; parts.push(x.value); got += x.value.length; track(name, got, total || got); }
    const out = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    buf = out.buffer;
  } else { buf = await r.arrayBuffer(); track(name, buf.byteLength, buf.byteLength); }
  if (cache) { try { await cache.put(url, new Response(buf.slice(0), { headers: { 'content-type': type } })); } catch (_) { /* storage full: next time it downloads again */ } }
  return buf;
}
const blobUrl = (buf, type) => URL.createObjectURL(new Blob([buf], { type }));

// ------------------------------------------------------------------------------------------------ the start
async function boot(c) {
  cfg = c;
  installFetch(c);
  const t0 = Date.now();
  prog.total = +c.totalBytes || 0;
  for (const k of Object.keys(c.sizes || {})) prog.files[k] = { loaded: 0, total: +c.sizes[k] || 0 };
  // the library and the runtime from this browser's storage (or the CDN once), as blob: URLs so nothing is fetched twice
  const libBuf = await cachedBytes(c.lib, 'kokoro.web.js', 'text/javascript');
  const mjsBuf = await cachedBytes(c.wasmBase + c.wasmFiles[0], c.wasmFiles[0], 'text/javascript');
  const wasmBuf = await cachedBytes(c.wasmBase + c.wasmFiles[1], c.wasmFiles[1], 'application/wasm');
  let mod;
  try { mod = await import(blobUrl(libBuf, 'text/javascript')); } catch (_) { mod = await import(c.lib); }
  mod.env.wasmPaths = { mjs: blobUrl(mjsBuf, 'text/javascript'), wasm: blobUrl(wasmBuf, 'application/wasm') };
  const want = c.device === 'webgpu' ? 'webgpu' : 'wasm';
  const cb = (p) => { if (p && p.status === 'progress' && p.file) track(p.file, p.loaded, p.total); else if (p && p.status === 'done' && p.file && prog.files[p.file]) track(p.file, prog.files[p.file].total, prog.files[p.file].total); };
  try {
    tts = await mod.KokoroTTS.from_pretrained(c.modelId, { dtype: c.dtype || 'q8', device: want, progress_callback: cb });
    device = want;
  } catch (e) {
    if (want !== 'webgpu') throw e;
    post({ type: 'error', error: 'WebGPU did not start: ' + errText(e), webgpuFailed: true, fatal: false });
    tts = await mod.KokoroTTS.from_pretrained(c.modelId, { dtype: c.dtype || 'q8', device: 'wasm', progress_callback: cb });
    device = 'wasm';
  }
  // the first sentence is always the slowest (kernels and the voice file): made here, so his first real answer is quick; a second one
  // measures this phone's pace (the page uses it to decide what the AI voice says without long silences)
  const w0 = Date.now();
  const a = await tts.generate(c.warmText || 'Right.', { voice: c.voice, speed: 1 });
  if (!soundOk(a.audio)) throw new Error('The AI voice made no sound.');
  const warmMs = Date.now() - w0;
  let rtf = 0;
  if (c.measureText) {
    const m0 = Date.now(), b = await tts.generate(c.measureText, { voice: c.voice, speed: 1 }), dur = (b.audio.length / (b.sampling_rate || 24000)) * 1000;
    if (dur > 300) rtf = (Date.now() - m0) / dur;
  }
  for (const k of Object.keys(prog.files)) prog.files[k].loaded = prog.files[k].total || prog.files[k].loaded;
  prog.last = 0; track('done', 0, 0);
  post({ type: 'ready', device, dtype: c.dtype || 'q8', ms: Date.now() - t0, warmMs, rtf: +rtf.toFixed(3) });
}

// real speech: finite numbers, not silent, not one long clipped buzz
function soundOk(pcm) {
  if (!pcm || !pcm.length) return false;
  let peak = 0, sum = 0, n = 0, clip = 0;
  for (let i = 0; i < pcm.length; i += 7) {
    const x = pcm[i];
    if (!Number.isFinite(x)) return false;
    const ax = Math.abs(x);
    if (ax > peak) peak = ax;
    if (ax > 0.99) clip++;
    sum += x * x; n++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  return peak > 0.01 && rms > 0.002 && clip / Math.max(1, n) < 0.2;
}

// the quiet at both ends is trimmed (the page adds its own breath between sentences)
function trim(pcm, rate) {
  const th = 0.004, keepHead = Math.round(rate * 0.03), keepTail = Math.round(rate * 0.09);
  let a = 0, b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < th) a++;
  while (b > a && Math.abs(pcm[b]) < th) b--;
  a = Math.max(0, a - keepHead); b = Math.min(pcm.length - 1, b + keepTail);
  return a === 0 && b === pcm.length - 1 ? pcm : pcm.slice(a, b + 1);
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const m = queue.shift();
      current = m.id; droppedCur = false;
      const t0 = Date.now();
      try {
        const a = await tts.generate(String(m.text || ''), { voice: m.voice || cfg.voice, speed: Math.max(0.7, Math.min(1.4, +m.speed || 1)) });
        if (droppedCur) continue;                                 // he cut in while it was being made: nobody wants it now
        const rate = a.sampling_rate || 24000;
        const raw = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
        if (!soundOk(raw)) throw Object.assign(new Error('The AI voice made no sound for that sentence.'), { webgpuFailed: device === 'webgpu' });
        const pcm = trim(raw, rate);
        const out = pcm.buffer === raw.buffer && pcm.byteOffset === 0 && pcm.length === raw.length ? pcm : new Float32Array(pcm);
        post({ type: 'audio', id: m.id, pcm: out, rate, ms: Date.now() - t0 }, [out.buffer]);
      } catch (e) {
        post({ type: 'error', id: m.id, error: errText(e), fatal: false, webgpuFailed: !!(e && e.webgpuFailed) });
      }
    }
  } finally { busy = false; current = 0; }
}

self.onmessage = async (e) => {
  const m = (e && e.data) || {};
  if (m.type === 'init') {
    if (!booting) booting = boot(m.cfg).catch((err) => { booting = null; tts = null; throw err; });
    try { await booting; } catch (err) { post({ type: 'error', error: errText(err), fatal: true, webgpuFailed: /WebGPU/.test(errText(err)) }); }
    return;
  }
  if (m.type === 'drop') {                                         // a tap cut him off: what is queued for it is never made
    const i = queue.findIndex((q) => q.id === m.id);
    if (i >= 0) queue.splice(i, 1); else if (current === m.id) droppedCur = true;
    return;
  }
  if (m.type === 'gen') {
    if (!tts) { post({ type: 'error', id: m.id, error: 'The AI voice is not ready yet.', fatal: false }); return; }
    queue.push(m);
    pump();
  }
};
