// PEOPLE OF OLYMPUS, the voices (2026-11-11, owner: "characters I can see, talk to, they talk and show work").
// Every person speaks with their OWN stable voice, made from their id: a phone voice of their own (Web Speech), a pitch, a rate and a timbre.
// Free and on this phone only: the iPhone's own voices through Jarvis's speaker (../jarvis/tts.js: the iPhone unlock, watchdogs, chunks) and Jarvis's
// natural-speech layer (../jarvis/prosody.js: numbers said as words); Kokoro (Jarvis's on-device neural voice) only when the owner already downloaded it
// in Jarvis. No voice at all on this device: a soft murmur synthesised here with WebAudio (our own sound: a few warm vowel blips, nothing copied),
// and the words still appear as captions in the speech bubble. Voice is OFF until the owner turns it on (one tap, remembered: olympus.people.speak).
//
// Pure (node-tested):
//   voiceProfile(person)          -> { seed, gender, pitch, rate, timbre: { hz, formant, breath, wave }, kokoro, pick }   (the same every time)
//   pickVoice(list, profile)      -> one SpeechSynthesisVoice of the phone's English voices for this person (stable for the same list) | null
//   visemes(text, { rate })       -> { ms, words: [{ i, text, c0, c1, t0, t1 }], keys: [{ t, v, a }] }   (a mouth timeline estimated from the text)
//   frameAt(tl, ms)               -> { v, a, w }   the mouth shape (viseme), how open (0..1) and the word at that moment
//   wordAtChar(tl, charIndex)     -> the word a speech boundary event points at
// Runtime:
//   const V = createVoice({ storage, synth, AudioContext })
//   V.on() / V.set(bool) / V.unlock() (inside a tap: iPhone)     V.speak(person, text, { onstart, onword(i, n), onend }) -> { said, tl, engine, clock(), cancel(), done }
//   V.stop()     drive(fig, frame, P3)  moves a 3D figure's mouth (Figure API v2 setMouth when there, else the mouth mesh)
// iPhone Safari 16: plain ES2020, no lookbehind, no optional chaining, no .at().
import { seedOf, rng, isObj, num } from './people-core.js';

export const VOICE_KEY = 'olympus.people.speak';
export const VISEMES = ['rest', 'A', 'E', 'O', 'U', 'M', 'F', 'L', 'S', 'K'];
export const KOKORO_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'bf_emma'];
const KOKORO_FLAG = 'jarvis.kokoro.ready';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------------------------------------ who sounds like what
// a Greek name gives a hint (-os / -on / -es ... a man, -a / -e / -o / -is ... a woman); otherwise the seed decides. Only the voice uses it.
const MASC = /(os|on|eus|as|us|ax|es|or|ir|an)$/i, FEM = /(a|e|o|is|ys|ia|ne|i)$/i;
/** the person's voice, the same on every visit */
export function voiceProfile(person) {
  const p = isObj(person) ? person : { id: String(person || 'someone') };
  const seed = num(p.seed) != null ? (p.seed >>> 0) : seedOf(String(p.id || p.name || 'someone'));
  const r = rng((seed ^ 0x5bd1e995) >>> 0);
  const name = String(p.name || '').trim().split(/\s+/)[0] || '';
  const gender = p.id === 'me' ? 'n' : MASC.test(name) ? 'm' : FEM.test(name) ? 'f' : (seed & 1 ? 'f' : 'm');
  const base = isObj(p.voice) && num(p.voice.pitch) != null ? p.voice.pitch : 0.8 + (seed % 51) / 100;
  const baseRate = isObj(p.voice) && num(p.voice.rate) != null ? p.voice.rate : 0.92 + ((seed >>> 8) % 17) / 100;
  const TEMPO = { blunt: 0.04, curious: 0.02, calm: -0.03, wry: 0 };
  const pitch = r2(clamp(base * (gender === 'm' ? 0.9 : gender === 'f' ? 1.08 : 1), 0.6, 1.5));
  const rate = r2(clamp(baseRate + (TEMPO[p.temperament] || 0), 0.86, 1.14));
  const hz = Math.round(gender === 'm' ? 100 + r() * 50 : gender === 'f' ? 180 + r() * 60 : 140 + r() * 40);
  const timbre = { hz, formant: r2(0.85 + r() * 0.3), breath: r2(0.04 + r() * 0.08), wave: seed % 3 === 0 ? 'sine' : 'triangle' };
  return { seed, gender, pitch, rate, timbre, kokoro: gender === 'f' ? KOKORO_VOICES[seed % KOKORO_VOICES.length] : null, pick: seed % 997 };
}

const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|junior|princess)\b/i;
const MALE_V = /\b(daniel|alex|tom|aaron|arthur|oliver|rishi|gordon|lee|evan|nathan|malcolm|george|jamie|guy|ryan|david|mark|christopher|eric|roger|steffan|thomas|fred|ralph|male)\b/i;
const FEMALE_V = /\b(ava|zoe|allison|samantha|female|aria|jenny|sonia|libby|michelle|emma|ana|natasha|clara|serena|kate|susan|stephanie|evelyn|nicky|tessa|moira|karen|fiona|veena|catherine|isha|hazel|zira|heera|victoria|kathy|vicki|martha|nora)\b/i;
const quality = (v) => { const id = String(v.name || '') + ' ' + String(v.voiceURI || ''); return (/premium/i.test(id) ? 3 : /enhanced|neural|natural/i.test(id) ? 2 : 1) - (/compact/i.test(id) ? 0.5 : 0) + (/^en[-_]us/i.test(String(v.lang || '')) ? 0.2 : 0); };
/** one of the phone's English voices for this person: the same gender when the phone has one, the better voices first, the seed picks among the best six */
export function pickVoice(list, profile) {
  const all = (Array.isArray(list) ? list : []).filter((v) => v && /^en([-_]|$)/i.test(String(v.lang || '')) && !NOVELTY.test(String(v.name || '')));
  if (!all.length) return null;
  const g = profile && profile.gender, of = (re) => all.filter((v) => re.test(String(v.name || '')));
  let pool = g === 'm' ? of(MALE_V) : g === 'f' ? of(FEMALE_V) : [];
  if (!pool.length) pool = all;
  pool = pool.slice().sort((a, b) => quality(b) - quality(a) || (String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0));
  const top = pool.slice(0, 6);
  return top[((profile && profile.pick) || 0) % top.length];
}

// ------------------------------------------------------------------------------------------------ the mouth timeline
// letters to mouth shapes: A open, E wide, O round, U pucker, M closed lips, F lip on teeth, L tongue, S teeth together, K a small open
const GROUPS = [['ch', 'S'], ['sh', 'S'], ['th', 'L'], ['ph', 'F'], ['oo', 'U'], ['ou', 'O'], ['ow', 'O'], ['ee', 'E'], ['ea', 'E'], ['ai', 'A'], ['ay', 'E'], ['wh', 'U'], ['qu', 'U'], ['ng', 'K']];
const ONE = { a: 'A', e: 'E', i: 'E', y: 'E', o: 'O', u: 'U', w: 'U', q: 'U', r: 'O', m: 'M', b: 'M', p: 'M', f: 'F', v: 'F', l: 'L', t: 'L', d: 'L', n: 'L', s: 'S', z: 'S', c: 'S', x: 'S', j: 'S', k: 'K', g: 'K', h: 'K' };
const OPEN = { rest: 0, A: 1, E: 0.62, O: 0.82, U: 0.5, M: 0, F: 0.22, L: 0.38, S: 0.28, K: 0.42 };
const VOWEL = { A: 1, E: 1, O: 1, U: 1 };
function sounds(word) {
  const w = String(word).toLowerCase(), out = [];
  if (/^\d/.test(w)) {                                       // a number: said as several words; open-close beats, about 1.5 syllables a digit
    const n = Math.max(2, Math.round(w.replace(/\D/g, '').length * 1.5));
    for (let i = 0; i < n; i++) out.push(i % 2 ? 'L' : (i % 4 === 0 ? 'A' : 'E'));
    return out;
  }
  for (let i = 0; i < w.length;) {
    const two = w.slice(i, i + 2), g = GROUPS.find((x) => x[0] === two);
    if (g) { out.push(g[1]); i += 2; continue; }
    const v = ONE[w.charAt(i)];
    if (v && !(out.length && out[out.length - 1] === v && !VOWEL[v])) out.push(v);
    i++;
  }
  if (out.length > 1 && w.slice(-1) === 'e' && !VOWEL[out[out.length - 2]]) out.pop();      // a silent final e
  return out.length ? out : ['K'];
}
/** a mouth timeline for this text: about 5 syllables a second at rate 1, pauses at commas and full stops */
export function visemes(text, opts) {
  const o = opts || {}, rate = clamp(num(o.rate) != null ? o.rate : 1, 0.5, 2);
  const src = String(text == null ? '' : text), re = /[A-Za-z0-9$][A-Za-z0-9$'’,.%-]*/g, words = [], keys = [];
  let m, t = 0;
  const VMS = 104 / rate, CMS = 52 / rate;
  while ((m = re.exec(src))) {
    let raw = m[0], c1 = m.index + raw.length;
    const tail = /[,.]+$/.exec(raw); if (tail && !/\d[,.]\d/.test(raw.slice(-3))) { raw = raw.slice(0, raw.length - tail[0].length); c1 -= tail[0].length; }
    const clean = raw.replace(/[^A-Za-z0-9]/g, '');
    if (!clean) continue;
    const ss = sounds(clean), t0 = t;
    for (const v of ss) { keys.push({ t: Math.round(t), v, a: OPEN[v] }); t += VOWEL[v] ? VMS : CMS; }
    words.push({ i: words.length, text: raw, c0: m.index, c1, t0: Math.round(t0), t1: Math.round(t) });
    const after = src.slice(c1, c1 + 3);
    const pause = /^[.!?]/.test(after) ? 300 / rate : /^[,;:]/.test(after) ? 150 / rate : 28 / rate;
    keys.push({ t: Math.round(t), v: 'rest', a: 0 });
    t += pause;
  }
  if (!keys.length || keys[keys.length - 1].v !== 'rest') keys.push({ t: Math.round(t), v: 'rest', a: 0 });
  return { ms: Math.round(t), words, keys, rate };
}
/** the mouth at time ms: the shape of the last key, opening eased towards the next one */
export function frameAt(tl, ms) {
  const K = tl && tl.keys ? tl.keys : [];
  if (!K.length || ms < 0 || ms >= tl.ms) return { v: 'rest', a: 0, w: ms >= (tl ? tl.ms : 0) && tl ? tl.words.length - 1 : -1 };
  let lo = 0, hi = K.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (K[mid].t <= ms) lo = mid; else hi = mid - 1; }
  const k = K[lo], n = K[lo + 1], span = n ? Math.max(1, n.t - k.t) : 1, f = n ? clamp((ms - k.t) / span, 0, 1) : 1;
  const a = k.a + ((n ? n.a : 0) - k.a) * f * f * 0.6;
  let w = -1; for (const x of tl.words) { if (x.t0 <= ms) w = x.i; else break; }
  return { v: k.v, a: r2(clamp(a, 0, 1)), w };
}
/** the word a boundary event (a character index in the said text) points at */
export function wordAtChar(tl, ci) { let w = 0; for (const x of (tl && tl.words) || []) { if (x.c0 <= ci + 1) w = x.i; else break; } return w; }

// ------------------------------------------------------------------------------------------------ moving a figure's mouth
/** the Figure API v2 mouth (people3d.js VISEMES: rest A E O MBP smile frown) for a frame of this finer timeline */
export const TO_V2 = { rest: 'rest', A: 'A', E: 'E', O: 'O', U: 'O', M: 'MBP', F: 'E', L: 'E', S: 'E', K: 'A' };
export function toV2(fr) { if (!fr || fr.a <= 0.02 && fr.v !== 'M') return 'rest'; return TO_V2[fr.v] || 'rest'; }
const WIDE = { E: 1.22, A: 1.05, O: 0.74, U: 0.62, M: 1.04, F: 1.08, L: 1, S: 1.15, K: 1, rest: 1 };
/** Figure API v2 (people3d.js setMouth(fig, viseme, amount)) when the artist's module has it, else the figure's own userData.setMouth, else the mouth mesh */
export function drive(fig, fr, P3) {
  if (!fig || !fr) return false;
  try {
    const v2 = (P3 && Array.isArray(P3.VISEMES) && P3.VISEMES.indexOf('MBP') >= 0) || (fig.userData && fig.userData.v === 2);
    const vis = v2 ? toV2(fr) : fr.v, amt = v2 && vis === 'MBP' ? 1 : fr.a;
    if (P3 && typeof P3.setMouth === 'function') { P3.setMouth(fig, vis, amt); return true; }
    const u = fig.userData || {};
    if (typeof u.setMouth === 'function') { u.setMouth(vis, amt); return true; }
    const m = u.parts && u.parts.mouth;
    if (m && m.scale) { m.scale.y = 0.55 + fr.a * 1.7; m.scale.x = WIDE[fr.v] || 1; return true; }
  } catch (_) { /* a figure from another version: no mouth */ }
  return false;
}
/** the figure's face and pose for a mood (setExpression / play from Figure API v2 when there, else the old poses) */
export const MOOD_POSE = { proud: 'cheer', worried: 'shrug', sheepish: 'slump', busy: 'nod', calm: 'idle', firm: 'idle' };
export function express(fig, mood, P3) {
  if (!fig) return;
  try {
    if (P3 && typeof P3.setExpression === 'function') P3.setExpression(fig, mood);
    else if (fig.userData && typeof fig.userData.setExpression === 'function') fig.userData.setExpression(mood);
  } catch (_) { /* no faces in this version */ }
}
export function pose(fig, name, P3) {
  if (!fig) return;
  const FALL = { work: 'talk', walk: 'wave', point: 'wave', think: 'nod' };
  try {
    if (P3 && typeof P3.play === 'function') { P3.play(fig, name); return; }
    const u = fig.userData || {};
    if (typeof u.play === 'function') { u.play(name); return; }
    if (typeof u.pose === 'function') u.pose(FALL[name] || name, false);
  } catch (_) { /* fine */ }
}

// ------------------------------------------------------------------------------------------------ the runtime
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };
let JV = null;
function jarvisVoice() {                                     // Jarvis's speaker + natural-speech layer, loaded the first time someone speaks
  if (!JV) JV = Promise.all([import('../jarvis/tts.js'), import('../jarvis/prosody.js')]).then((m) => ({ tts: m[0], pro: m[1] }), () => null);
  return JV;
}
export function createVoice(opts) {
  const o = opts || {}, g = typeof window !== 'undefined' ? window : {};
  const store = o.storage !== undefined ? o.storage : safe(() => g.localStorage, null);
  const synth = o.synth !== undefined ? o.synth : ('speechSynthesis' in g ? g.speechSynthesis : null);
  const AC = o.AudioContext !== undefined ? o.AudioContext : (g.AudioContext || g.webkitAudioContext || null);
  let ac = null, cur = null, kokoro = null;
  const on = () => safe(() => store.getItem(VOICE_KEY) === '1', false);
  function set(v) { safe(() => store.setItem(VOICE_KEY, v ? '1' : '0')); if (!v) stop(); return on(); }
  const SFX = () => (o.sfx !== undefined ? o.sfx : g.OLYMPUS_SFX) || null;            // the shared sound engine (docs/SOUND_API.md): ducking + the voices bus
  function audio() { const S = SFX(), shared = S && typeof S.context === 'function' ? safe(() => S.context(), null) : null; if (shared) return shared; if (!ac && AC) ac = safe(() => new AC(), null); if (ac && ac.state === 'suspended') safe(() => ac.resume()); return ac; }
  const voiceOut = (A) => { const S = SFX(), b = S && typeof S.bus === 'function' ? safe(() => S.bus('voices'), null) : null; return b && b.context === A ? b : A.destination; };
  let ducked = 0;
  const duck = (on) => { const S = SFX(); if (!S || typeof S.speaking !== 'function') return; if (on) { ducked++; safe(() => S.speaking(true)); } else if (ducked > 0) { ducked--; safe(() => S.speaking(false)); } };
  /** call inside a tap: lifts the iPhone's tap-only rule for speech and audio */
  function unlock() {
    audio();
    if (synth && typeof g.SpeechSynthesisUtterance === 'function') safe(() => { const u = new g.SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); });
    jarvisVoice();
  }
  const voices = () => safe(() => (synth ? synth.getVoices() || [] : []), []);
  const kokoroReady = () => safe(() => store.getItem(KOKORO_FLAG) === '1', false);

  // the murmur: one soft vowel blip per mouth key, a little formant filter, quiet. Our own sound for "no voice on this device".
  function murmur(prof, tl, at0) {
    const S = SFX();                                         // the shared engine's formant murmur (sfx.js murmur: pitch contour, vowels, breath) when it is there
    if (S && typeof S.murmur === 'function') { const h = safe(() => S.murmur(prof, tl, { at0: at0 || 0 }), null); if (h) return h; }
    const A = audio(); if (!A) return null;
    const t0 = A.currentTime + 0.04, out = A.createGain(); out.gain.value = 0.055; out.connect(voiceOut(A));
    const F1 = { A: 820, E: 520, O: 560, U: 360, L: 420, K: 600, S: 480, F: 400, M: 300 }, nodes = [];
    for (let i = 0; i < tl.keys.length; i++) {
      const k = tl.keys[i], nx = tl.keys[i + 1]; if (k.v === 'rest' || k.v === 'M' || !nx) continue;
      const st = t0 + (k.t - (at0 || 0)) / 1000, dur = Math.max(0.04, (nx.t - k.t) / 1000 * 0.9); if (st < A.currentTime) continue;
      const osc = A.createOscillator(), flt = A.createBiquadFilter(), env = A.createGain();
      osc.type = prof.timbre.wave;
      osc.frequency.setValueAtTime(prof.timbre.hz * (0.96 + ((i * 7) % 9) / 100), st);
      flt.type = 'bandpass'; flt.frequency.value = (F1[k.v] || 500) * prof.timbre.formant; flt.Q.value = 3.2;
      env.gain.setValueAtTime(0, st); env.gain.linearRampToValueAtTime(0.5 + k.a * 0.5, st + Math.min(0.03, dur / 3)); env.gain.exponentialRampToValueAtTime(0.001, st + dur);
      osc.connect(flt); flt.connect(env); env.connect(out); osc.start(st); osc.stop(st + dur + 0.02); nodes.push(osc);
    }
    return { stop() { for (const n of nodes) safe(() => n.stop()); safe(() => out.disconnect()); } };
  }

  /** speak as this person. The handle's clock() is the time on the mouth timeline; boundary events (when the voice sends them) keep it in step. */
  function speak(person, text, h0) {
    stop();
    const hd = h0 || {}, prof = voiceProfile(person), shown = String(text || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
    let tl = visemes(shown, { rate: prof.rate });
    let start = 0, shift = 0, done = false, lastW = -1, engine = 'captions', stopper = null, timer = 0;
    let resolve = null; const fin = new Promise((ok) => { resolve = ok; });
    const H = { said: shown, tl, engine: 'captions', profile: prof, done: fin,
      clock() { return start ? Math.max(0, Date.now() - start + shift) : 0; },
      cancel() { end(true); } };
    const word = (i) => { if (i > lastW) { lastW = i; if (hd.onword) safe(() => hd.onword(i, tl.words.length)); } };
    function end(cut) {
      if (done) return; done = true; clearTimeout(timer); clearInterval(H.tick);
      if (stopper) safe(() => stopper.stop());
      if (H.ducked) { H.ducked = false; duck(false); }
      if (cur === H) cur = null;
      word(tl.words.length - 1);
      if (hd.onend) safe(() => hd.onend(!!cut));
      resolve(!!cut);
    }
    function begin() { if (start) return; start = Date.now(); if (engine !== 'captions' && !H.ducked) { H.ducked = true; duck(true); } if (hd.onstart) safe(() => hd.onstart(engine)); clearInterval(H.tick); H.tick = setInterval(() => { if (done) return; const f = frameAt(tl, H.clock()); if (f.w >= 0) word(f.w); }, 60); }
    function timed(extra) { begin(); timer = setTimeout(() => end(false), tl.ms + (extra || 120)); }
    cur = H;
    if (!shown) { setTimeout(() => end(false), 0); return H; }
    if (!on() && !hd.force) { H.engine = engine = 'captions'; setTimeout(() => timed(), 0); return H; }      // voice off: the words still come word by word (captions)
    const vs = voices(), hasPhone = synth && typeof g.SpeechSynthesisUtterance === 'function' && vs.length;
    if (!hasPhone && !kokoroReady()) {                       // no voice here: the murmur + captions
      H.engine = engine = AC ? 'murmur' : 'captions';
      setTimeout(() => { if (done) return; stopper = murmur(prof, tl, 0); timed(); }, 0);
      return H;
    }
    jarvisVoice().then((J) => {
      if (done || cur !== H) return;
      if (!J) { H.engine = engine = 'murmur'; stopper = murmur(prof, tl, 0); timed(); return; }
      const v = pickVoice(vs, prof);
      const useKokoro = kokoroReady() && prof.kokoro;
      const sp = J.tts.createSpeaker({ synth, storage: store, voices: () => (v ? [v] : voices()), cfg: () => ({ voice: v ? v.name : '', rate: prof.rate, pitch: prof.pitch }),
        prosody: J.pro.createProsody({ switches: { numbers: true, conversational: true } }),
        cloud: useKokoro ? () => {
          if (!kokoro) kokoro = import('../jarvis/kokoro-engine.js').then((k) => k.createKokoro({ storage: store }), () => null);
          return { key: 'device', id: 'kokoro', voice: prof.kokoro, maxChars: 400, timeoutMs: 20000, synth: (t, so) => kokoro.then((k) => { if (!k) throw new Error('no kokoro'); return k.synth(t, { voice: prof.kokoro, speed: prof.rate, signal: so && so.signal }); }) };
        } : null });
      stopper = { stop: () => sp.cancel() };
      const said = sp.speak(shown, {
        onengine: (id) => { H.engine = engine = id === 'kokoro' ? 'kokoro' : 'phone'; },
        onstart: () => { begin(); },
        onboundary: (ci) => { begin(); const w = wordAtChar(tl, ci), want = tl.words[w] ? tl.words[w].t0 : 0, now = H.clock(); if (want > now || now - want > 700) shift += want - now; word(w); },
        onstall: () => { if (done) return; H.engine = engine = 'captions'; start = 0; timed(); },
        onend: () => end(false) });
      if (said && said.text && said.text !== shown) { H.said = said.text; tl = H.tl = visemes(said.text, { rate: prof.rate }); }
      timer = setTimeout(() => { if (!start && !done) { H.engine = engine = 'captions'; timed(); } }, 3500);         // nothing started at all: captions alone
    });
    return H;
  }
  function stop() { if (cur) cur.cancel(); cur = null; }
  return { on, set, unlock, speak, stop, voices, profile: voiceProfile, speaking: () => !!cur, kokoro: kokoroReady,
    describe(person) { const p = voiceProfile(person), v = pickVoice(voices(), p); return v ? v.name + ' · pitch ' + p.pitch + ' · rate ' + p.rate : (AC ? 'a soft murmur (no voice on this device)' : 'captions only'); } };
}
export default createVoice;
