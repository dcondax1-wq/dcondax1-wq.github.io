// Jarvis VOICE MODE (owner 2026-11-03: "like the movie J.A.R.V.I.S."): a full-screen conversation. The 3D core fills the
// screen and reacts to the voice: to yours through a Web Audio analyser on the mic, to Jarvis's own from the speech's word
// timing (a phone cannot analyse its synthesized voice). Live captions of both sides, a HUD arc with the system verdict, and
// small holographic cards of the numbers Jarvis cites ("ZLARIOR · ROOM  $1,106"), each floating out as its name is spoken.
// Turn-taking: listen -> think -> speak -> listen, until END (or "stop", "exit voice mode"); a tap on the core interrupts.
// DOM and audio only: the answers come from the shell (index.html: answer(), the brain's spoken form); nothing here parses a
// question. Read-only like every Jarvis part: it never places a trade.
//
//   import { createVoiceMode } from './voice-mode.js';
//   const vm = createVoiceMode({
//     answer(text) -> Promise<reply>   the brain's reply ({text, speak, cards, control, open, route}), side effects done by the shell
//     mountCore(el, {size, reduced}) -> core | null   a core-visual.js core ({setState, setLevel, destroy}); null = the 2D orb
//     verdict() -> {text, level}       the system's one-line verdict for the HUD arc (level 'ok' | 'warn' | 'bad')
//     greeting() -> 'Good evening'     fx() -> 'ultra' | 'high' | 'low' | 'off'     reduced() -> bool (reduce motion applies)
//     voiceCfg() -> {rate, pitch} | null (the owner's own voice settings)            muted() -> bool
//     voicePick() -> { mode: 'ai' | 'phone', label, ready }    setVoicePick(mode)   (the one Voice setting; optional)
//     onOpen(), onClose(why), openApp(reply)
//   });
//   vm.open({gesture}) · vm.close(why) · vm.isOpen() · vm.stats()
//   gesture: true when called from a tap (iPhone: the mic and the voice may only start from one). Without it (a spoken
//   "Jarvis, voice mode") the conversation starts at once and the mic analyser joins at the first tap.
//
// iPhone rules: the AudioContext and getUserMedia start inside a tap; the mic is released (tracks stopped, context closed) on
// END, when Jarvis goes out of sight and when another app opens. No speech recognition (some browsers, a Home Screen app):
// the same screen with a type-to-talk field, said once per launch; the recognizer refusing the mic switches to it too.
// Reduce motion (unless the owner picked a 3D level himself) and 3D effects Off: no animation loop, no flying cards, the
// core still. Voice (2026-11-18, owner: "it sounds like a bot, it should sound like a person"; Male, British): the same voice as
// the Jarvis screen: the AI voice George (neural-voice.js, through the shell's cloudVoice) or, while it loads / if it cannot, the
// iPhone's best British male voice (tts.js), said in pieces with the words a person would say (speech-text.js). The VOICE button
// switches AI voice / iPhone voice (the shell's one setting, deps voicePick / setVoicePick); without them it steps the phone voices.
// Push-to-talk (2026-11-10, JARVIS BRAIN): on an iPhone / iPad the default is HOLD TO TALK: the big button listens while it is held
// and sends on release, and Jarvis never starts listening by itself after an answer (iOS Safari drops hands-free recognition, asks
// for the mic again and loops on "no-speech"). A plain-words status line (#vmState, aria-live) always says what is happening:
// Listening / Thinking / Speaking / Hold the button to talk. The MODE button switches to hands-free and back; the choice is kept in
// 'jarvis.vmPtt' ('1' hold, '0' hands-free). Elsewhere the default stays hands-free (the old behaviour). vm.stats() adds { ptt, status }.
// Back to how it was (night-voice 2026-11-18, owner: "back to how it was: all of it"): hands-free is the default on EVERY phone again,
// the conversation it was on 2026-11-06 (tap once, she answers out loud and listens again). The iPhone guard stays, automatic: when
// iOS refuses an automatic listen (after an answer, not inside a tap) or hears nothing twice in a row, this session switches to hold
// to talk by itself and says so (not saved; the MODE button and 'jarvis.vmPtt' still keep his own choice). vm.stats().fellBack.
// The Classic Jarvis look (html[data-jlook=classic], classic.css) gets the old 2026-11-06 voice screen too: voice-classic.js.
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { voiceScore as ttsScore, bestVoice as ttsBest, voiceChoices as ttsChoices, cleanSpeech, createSpeaker, savedVoiceName, needsPrimer, CFG_KEY, DEFAULTS } from './tts.js';

export const VOICE_KEY = 'jarvis.vmVoice';
export const PTT_KEY = 'jarvis.vmPtt';
/** the status line's words per phase, in plain language (ptt: hold-to-talk) */
export function statusText(phase, ptt, holding) {
  if (phase === 'listening') return ptt && holding ? 'Listening. Let go to send.' : 'Listening. Say it now.';
  if (phase === 'thinking') return 'Thinking.';
  if (phase === 'speaking') return ptt ? 'Speaking. Hold the button to cut in.' : 'Speaking. Tap the circle to cut in.';
  return ptt ? 'Hold the button and talk.' : 'Tap the circle to talk.';
}
/** hold to talk at the start? his saved choice ('jarvis.vmPtt'), else hands-free everywhere (the 2026-11-06 behaviour) */
export const defaultPtt = (saved) => (saved === true || saved === false ? saved : false);
/** an iPhone's automatic listen failed (refused outside a tap, or nothing heard twice): fall back to hold to talk for the session */
export const shouldFallBack = (o) => !!(o && o.ios && o.auto && !o.ptt && (o.error === 'not-allowed' || o.error === 'service-not-allowed' || (o.error === 'no-speech' && o.silent >= 2)));
export const isIOS = (ua, touchPts) => /iPad|iPhone|iPod/.test(String(ua || '')) || (/Macintosh/.test(String(ua || '')) && (touchPts || 0) > 1);
const SILENT_TURNS = 3;          // turns with nothing heard before voice mode waits for a tap (no endless listening)
const LISTEN_MAX_MS = 15000;     // one listening turn at most
const WPS = 2.7;                 // words per second at rate 1, for the speaking pulse until the phone reports word timing
const PHASE_WORD = { idle: 'Standing by', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };
const CORE_STATE = { idle: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'speaking' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => (window.performance && performance.now ? performance.now() : Date.now());
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};

// ------------------------------------------------------------------------------------------------ the voice (tts.js)
export function voiceScore(v) { return ttsScore(v); }
export function bestVoice(list, saved) { return ttsBest(list, saved); }
export function voiceChoices(list) { return ttsChoices(list); }

// ------------------------------------------------------------------------------------------------ the holographic cards
// The numbers a reply cites, as small cards: its cards' rows first ("Zlarior · Today  +$213"), then the "Name: ... $x ..." lines
// of its text ("Zlarior · room  $1,106"). Nothing is computed: each value is copied from the reply as it was written.
const AMOUNT = /[+−-]?\$\d[\d,]*(?:\.\d+)?|[+−-]?\d[\d,]*(?:\.\d+)?\s?(?:%|R\b|pts?\b|points\b|micros?\b)/;
const FILLER = /^(of|the|a|an|to|is|at|on|in|with|and|has|have|had|its|it|now|left|than|from|above|below)$/i;
const short = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export function fragmentsOf(reply, max) {
  const lim = max || 4, out = [], seen = {};
  const push = (k, v) => {
    k = short(k, 26); v = short(v, 22);
    if (!v || seen[k + '|' + v] || out.length >= lim) return;
    seen[k + '|' + v] = 1; out.push({ k, v });
  };
  const r = reply && typeof reply === 'object' ? reply : {};
  for (const c of Array.isArray(r.cards) ? r.cards : []) {
    if (!c || typeof c !== 'object') continue;
    const title = c.title || c.name || '';
    const rows = Array.isArray(c.kv) ? c.kv : Array.isArray(c.kpis) ? c.kpis : Array.isArray(c.rows) ? c.rows : [];
    for (const row of rows.slice(0, 2)) {
      const label = Array.isArray(row) ? row[0] : row && row.label, value = Array.isArray(row) ? row[1] : row && row.value;
      if (value != null && value !== '') push(title ? `${title} · ${label}` : label, String(value));
    }
    const st = c.status && typeof c.status === 'object' ? c.status.label : '';
    if (!rows.length && st) push(title || 'Status', st);
  }
  for (const line of String(r.text || '').split('\n')) {
    const m = /^([^:\n]{2,24}):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const rest = m[2], a = AMOUNT.exec(rest);
    if (!a) continue;
    const before = rest.slice(0, a.index).split(/\s+/).filter((w) => w && !FILLER.test(w)).slice(-2).join(' ');
    const after = (/^\s*(?:of |to the |in |a )?([a-z][a-z-]*)/i.exec(rest.slice(a.index + a[0].length)) || [])[1] || '';
    const ctx = (before || (FILLER.test(after) ? '' : after)).replace(/[,;.]+$/, '').toLowerCase();
    push(ctx ? `${m[1]} · ${ctx}` : m[1], a[0].trim());
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the look (one stylesheet)
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'vmCss';
  s.textContent = `
.vm{position:fixed;inset:0;z-index:2147483300;display:flex;flex-direction:column;align-items:center;color:#f3ece0;
  background:radial-gradient(120% 80% at 50% 38%,#2a2218,#14110e 68%);
  padding:max(12px,env(safe-area-inset-top)) 16px max(14px,env(safe-area-inset-bottom));box-sizing:border-box;overflow:hidden;
  font-family:-apple-system,'SF Pro Text',system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.vm[hidden]{display:none}
.vm-top{position:relative;width:100%;max-width:640px;display:flex;align-items:center;gap:8px;z-index:3;padding-bottom:8px;border-bottom:1px solid #3a3228}
.vm-tag{flex:1;min-width:0;font:600 22px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;color:#f3ece0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vm-tag::after{content:"";display:block;width:36px;height:2px;margin-top:3px;background:#c8a24a;border-radius:2px}
.vm-btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:12px;border:1px solid #3a3228;background:#26211b;
  color:#f3ece0;font:600 14px -apple-system,'SF Pro Text',system-ui,sans-serif;cursor:pointer;max-width:42vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vm-btn:focus-visible,.vm-ptt:focus-visible,.vm-stage:focus-visible{outline:2px solid #c8a24a;outline-offset:2px}
.vm-x{border-color:#c96a4a;color:#f3ece0}
.vm-stage{position:relative;flex:1 1 auto;width:100%;display:flex;align-items:center;justify-content:center;min-height:0;cursor:pointer;outline:none;z-index:1}
.vm-ring{position:relative;flex:none}
.vm-core{position:absolute;inset:0}
.vm-spec,.vm-hud{position:absolute;inset:-9%;width:118%;height:118%;pointer-events:none}
.vm-hud text{font:600 14px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;letter-spacing:0;fill:#cfc4b2}
.vm-hud .arc{fill:none;stroke:#3a3228;stroke-width:1.2}
.vm-hud .gauge{fill:none;stroke:#c8a24a;stroke-width:3;stroke-linecap:round}
.vm[data-verdict=ok] .vm-hud .vd{fill:#7f8a52} .vm[data-verdict=warn] .vm-hud .vd{fill:#e0b060} .vm[data-verdict=bad] .vm-hud .vd{fill:#c96a4a}
.vm-orb{position:absolute;inset:14%;border-radius:50%;border:2px solid #c8a24a;background:#1d1914;box-shadow:0 6px 18px rgba(0,0,0,.35);
  transform:scale(calc(.94 + var(--lv,0) * .12))}
.vm-orb i{position:absolute;inset:30%;border-radius:50%;background:radial-gradient(circle,#e0b060,#9c6b3c 70%,transparent 100%);opacity:calc(.55 + var(--lv,0) * .4)}
.vm[data-phase=listening] .vm-orb{border-color:#c96a4a}
.vm-frags{position:absolute;inset:0;pointer-events:none}
.vm-frag{position:absolute;left:50%;top:50%;padding:7px 12px 8px;border:1px solid #3a3228;border-radius:12px;background:#26211b;
  box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap;opacity:0;transform:translate(-50%,-50%) scale(.9);
  transition:opacity .35s ease-out,transform .45s ease-out}
.vm-frag.on{opacity:1;transform:translate(calc(-50% + var(--fx)),calc(-50% + var(--fy))) scale(1)}
.vm-frag b{display:block;font:600 12px -apple-system,'SF Pro Text',system-ui,sans-serif;color:#9a8f7d;text-transform:none;letter-spacing:0}
.vm-frag span{display:block;font:700 18px 'SF Pro Rounded',-apple-system,sans-serif;font-variant-numeric:tabular-nums;color:#f3ece0}
.vm-cap{position:relative;z-index:2;width:100%;max-width:640px;min-height:118px;text-align:center}
.vm-you{margin:0 0 6px;font-size:16px;color:#9a8f7d;min-height:20px;font-style:italic}
.vm-you:not(:empty)::before{content:"You: ";font:600 13px -apple-system,'SF Pro Text',system-ui,sans-serif;font-style:normal;color:#c96a4a}
.vm-jar{margin:0;font:600 22px/1.35 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;min-height:28px;max-height:34vh;overflow:auto}
.vm-jar .w{opacity:.4;transition:opacity .2s ease-out}
.vm-jar .w.on{opacity:1}
.vm-hint{position:relative;z-index:2;margin:6px 0 0;font:500 13px -apple-system,'SF Pro Text',system-ui,sans-serif;color:#9a8f7d;text-align:center}
.vm-type{position:relative;z-index:3;display:flex;gap:8px;width:100%;max-width:640px;margin-top:8px}
.vm-type[hidden]{display:none}
.vm-type input{flex:1;min-width:0;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid #3a3228;background:#1d1914;color:#f3ece0;font:500 16px -apple-system,'SF Pro Text',system-ui,sans-serif}
.vm-state{margin:6px 16px 0;text-align:center;font:600 16px/1.3 -apple-system,'SF Pro Text',system-ui,sans-serif;color:#f3ece0;min-height:20px}
.vm-ptt-row{display:flex;gap:10px;justify-content:center;align-items:center;margin:8px 16px calc(14px + env(safe-area-inset-bottom,0px))}
.vm-ptt{min-height:56px;min-width:180px;padding:0 26px;border-radius:16px;border:1px solid #c8a24a;background:#26211b;color:#f3ece0;font:600 17px -apple-system,'SF Pro Text',system-ui,sans-serif;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.vm-ptt[hidden]{display:none}
.vm[data-holding=on] .vm-ptt{background:#c8a24a;color:#14110e}
.vm[data-motion=off] .vm-frag,.vm[data-motion=off] .vm-jar .w,.vm[data-motion=off] .vm-orb{transition:none;animation:none}
@media (prefers-reduced-motion: reduce){.vm *{animation:none !important;transition:none !important}}`;
  document.head.appendChild(s);
  // the Classic Jarvis look's violet screen (voice-classic.js): loaded on its own, so voice mode opens without it (offline, an old cache)
  import('./voice-classic.js').then((m) => {
    if (!m || typeof m.CLASSIC_VM_CSS !== 'string' || document.getElementById('vmClassicCss')) return;
    const c = document.createElement('style'); c.id = 'vmClassicCss'; c.textContent = m.CLASSIC_VM_CSS; document.head.appendChild(c);
    if (typeof m.CLASSIC_SPEC === 'string') classicSpec = m.CLASSIC_SPEC;
  }).catch(() => { /* AGORA only */ });
}
let classicSpec = '';                                   // the Classic look's waveform colour, once voice-classic.js has loaded

// ------------------------------------------------------------------------------------------------ voice mode
const classicLook = () => safe(() => document.documentElement.getAttribute('data-jlook') === 'classic', false);
export function createVoiceMode(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const call = (name, ...a) => { const f = d[name]; return typeof f === 'function' ? safe(() => f(...a), null) : null; };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let el = null, open = false, phase = 'idle', turn = 0, silent = 0, motion = false, typed = false;
  let core = null, rec = null, recT = 0, raf = 0, lastT = 0, level = 0, evLv = 0, pulse = 0;
  let actx = null, stream = null, src = null, an = null, buf = null, fbuf = null, micErr = '', wake = null;
  let speech = null, sess = 0, specCol = '#c8a24a';   // speech: the reply being spoken {words, frags, t0, real, idx, done}
  let voices = [], said = { noSR: false }, turns = 0, lastReply = null;
  let holding = false, status = '';
  const pttSaved = () => { const v = ls.get(PTT_KEY); return v === '1' ? true : v === '0' ? false : null; };   // ls: every read in a try (private mode)
  const savedPtt = pttSaved();
  const onIOS = isIOS(safe(() => navigator.userAgent, ''), safe(() => navigator.maxTouchPoints, 0));
  let ptt = defaultPtt(savedPtt), fellBack = false;
  const $ = (s) => (el ? el.querySelector(s) : null);

  // ---------------------------------------------------------------- the voice list (iPhone loads it late)
  const loadVoices = () => { voices = synth ? safe(() => synth.getVoices() || [], []) : []; renderVoice(); };
  if (synth) safe(() => synth.addEventListener('voiceschanged', loadVoices));
  const voice = () => bestVoice(voices, savedVoiceName());
  const speaker = synth ? createSpeaker({ synth, voices: () => voices, cfg: () => Object.assign({}, DEFAULTS, call('voiceCfg') || {}, { voice: savedVoiceName() }), cloud: (c) => call('cloudVoice', c), prosody: () => call('prosody'), player: () => call('player') }) : null;
  function renderVoice() {
    const b = $('#vmVoice'); if (!b) return;
    const pk = call('voicePick');
    if (pk && pk.mode) { b.textContent = 'Voice: ' + (pk.mode === 'ai' ? 'George' : 'iPhone'); return; }
    const v = voice(); b.textContent = 'Voice: ' + (v ? v.name.replace(/\s*\(.*\)$/, '') : 'Auto');
  }
  function nextVoice() {
    const pk = call('voicePick');
    if (pk && pk.mode) {                         // the one setting: AI voice <-> iPhone voice, said in the voice just picked
      const m = pk.mode === 'ai' ? 'phone' : 'ai';
      call('setVoicePick', m);
      const now2 = call('voicePick') || {};
      renderVoice();
      sayLine(m === 'phone' ? 'This is the iPhone voice.' : now2.ready ? "This is George, Jarvis's AI voice." : "George, the AI voice, is getting ready. Until then it's the iPhone voice.", null);
      return;
    }
    loadVoices();
    const list = voiceChoices(voices);
    if (!list.length) return;
    const cur = voice(), i = list.findIndex((v) => cur && v.name === cur.name), v = list[(i + 1) % list.length];
    ls.set(VOICE_KEY, v.name);
    let c = {};
    try { c = JSON.parse(ls.get(CFG_KEY) || '{}') || {}; } catch (_) { c = {}; }
    c.voice = v.name; ls.set(CFG_KEY, JSON.stringify(c));                    // the Jarvis screen speaks with it too
    renderVoice();
    sayLine(`Hi, I'm ${v.name.replace(/\s*\(.*\)$/, '')}, at your service.`, null);
  }

  // ---------------------------------------------------------------- the screen
  function build() {
    style();
    el = document.createElement('div');
    el.className = 'vm'; el.id = 'vm'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Voice mode');
    el.innerHTML = `<div class="vm-top"><span class="vm-tag" id="vmTag">Jarvis</span>
      <button class="vm-btn" type="button" id="vmVoice" title="Change Jarvis's voice">Voice: Auto</button>
      <button class="vm-btn" type="button" id="vmKb" aria-label="Type instead" title="Type instead">⌨</button>
      <button class="vm-btn vm-x" type="button" id="vmX" aria-label="End voice mode">End</button></div>
    <div class="vm-stage" id="vmStage" role="button" tabindex="0" aria-label="Tap to talk, or to interrupt Jarvis">
      <div class="vm-ring" id="vmRing">
        <canvas class="vm-spec" id="vmSpec" aria-hidden="true"></canvas>
        <div class="vm-core" id="vmCore" aria-hidden="true"></div>
        <svg class="vm-hud" viewBox="0 0 400 400" aria-hidden="true"><defs>
          <path id="vmArcT" d="M 38 200 A 162 162 0 0 1 362 200"/><path id="vmArcB" d="M 30 200 A 170 170 0 0 0 370 200"/></defs>
          <path class="arc" d="M 30 200 A 170 170 0 0 1 370 200"/><path class="arc" d="M 22 200 A 178 178 0 0 0 378 200"/>
          <path class="gauge" id="vmGauge" d="M 52 290 A 170 170 0 0 0 348 290" pathLength="100" stroke-dasharray="0 100"/>
          <text><textPath href="#vmArcT" startOffset="50%" text-anchor="middle" class="vd" id="vmVerdict">System: none yet</textPath></text>
          <text><textPath href="#vmArcB" startOffset="50%" text-anchor="middle" id="vmPhase">Standing by</textPath></text>
        </svg>
        <div class="vm-frags" id="vmFrags"></div>
      </div>
    </div>
    <p class="vm-state" id="vmState" role="status" aria-live="polite"></p>
    <div class="vm-cap"><p class="vm-you" id="vmYou"></p><p class="vm-jar" id="vmJar" aria-live="polite"></p></div>
    <p class="vm-hint" id="vmHint">Tap the circle to talk or to cut in. End to stop.</p>
    <form class="vm-type" id="vmType" autocomplete="off" hidden><input id="vmQ" type="text" enterkeyhint="send" placeholder="Type to Jarvis…" aria-label="Type to Jarvis"><button class="vm-btn" type="submit">Send</button></form>
    <div class="vm-ptt-row"><button class="vm-ptt" type="button" id="vmPtt" aria-label="Hold to talk" hidden>Hold to talk</button>
      <button class="vm-btn" type="button" id="vmMode" aria-label="Switch between hold to talk and hands free" title="Hold to talk or hands free">Hold to talk</button></div>`;
    document.body.appendChild(el);
    $('#vmX').addEventListener('click', (e) => { e.stopPropagation(); close('end'); });
    $('#vmVoice').addEventListener('click', (e) => { e.stopPropagation(); ensureMic(); nextVoice(); });
    $('#vmKb').addEventListener('click', (e) => { e.stopPropagation(); showType(true, true); });
    $('#vmStage').addEventListener('click', tapCore);
    const pb = $('#vmPtt');
    pb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { pb.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ } pttDown(); });
    pb.addEventListener('pointerup', (e) => { e.stopPropagation(); pttUp(); });
    pb.addEventListener('pointercancel', () => pttUp());
    pb.addEventListener('contextmenu', (e) => e.preventDefault());
    pb.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pttDown(); } });
    pb.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pttUp(); } });
    $('#vmMode').addEventListener('click', (e) => { e.stopPropagation(); setPtt(!ptt); });
    $('#vmStage').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapCore(); } });
    $('#vmType').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#vmQ'), t = q.value.trim(); q.value = ''; if (t) { stopTalk(); submit(t); } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close('end'); });
  }
  function setPhase(p, hint) {
    phase = PHASE_WORD[p] ? p : 'idle';
    if (!el) return;
    el.dataset.phase = phase;
    $('#vmPhase').textContent = PHASE_WORD[phase];
    paintStatus();
    if (core) safe(() => core.setState(CORE_STATE[phase]));
    if (hint != null) $('#vmHint').textContent = hint;
    if (!motion) paintLevel(phase === 'listening' || phase === 'speaking' ? 0.5 : 0.15);
  }
  function paintStatus(msg) {
    status = msg || statusText(phase, ptt, holding);
    if (!el) return;
    const st = $('#vmState'); if (st) st.textContent = status;
    el.dataset.holding = holding ? 'on' : 'off'; el.dataset.ptt = ptt ? 'on' : 'off';
    const pb = $('#vmPtt'), mb = $('#vmMode');
    if (pb) pb.hidden = !ptt || typed || !SR || said.blocked;
    if (mb) mb.textContent = ptt ? 'Hold to talk' : 'Hands-free';
  }
  function setPtt(on) {
    ptt = !!on; ls.set(PTT_KEY, ptt ? '1' : '0');
    holding = false; paintStatus();
    if (open && SR && !said.blocked) { if (ptt && phase === 'listening') { stopRec(); ++turn; setPhase('idle', ''); } }
  }
  // hold to talk: the press (a tap, so the mic and the voice may start) begins listening, the release sends what was heard
  function pttDown() {
    if (!open || holding) return;
    ensureMic(); unlockVoice();
    if (!SR || said.blocked) { toTyping(said.blocked ? 'blocked' : ''); return; }
    holding = true; silent = 0; stopTalk();
    listen({ hold: true });
    paintStatus();
  }
  function pttUp() {
    if (!holding) return;
    holding = false; paintStatus();
    if (rec) { const r = rec; safe(() => r.stop()); }               // the recognizer finishes: onresult / onend send it
    else if (phase === 'listening') { ++turn; setPhase('idle', ''); }
  }
  function renderVerdict() {
    const v = call('verdict') || {};
    el.dataset.verdict = ['ok', 'warn', 'bad'].indexOf(v.level) >= 0 ? v.level : '';
    $('#vmVerdict').textContent = 'System: ' + short(String(v.text || 'no verdict yet').replace(/[.:]+$/, ''), 34);
  }
  function capYou(t) { $('#vmYou').textContent = t || ''; }
  function capJar(words, on) {             // words: the spoken line split in words; on: how many are lit
    $('#vmJar').innerHTML = words.map((w, i) => `<span class="w${i < on ? ' on' : ''}">${esc(w.w)}</span>`).join(' ');
  }
  function showType(on, focus) {
    typed = typed || !!on;
    $('#vmType').hidden = !typed;
    if (typed && focus) setTimeout(() => safe(() => $('#vmQ').focus()), 30);
  }

  // ---------------------------------------------------------------- the core, the level and the audio-reactive ring
  function mountCore() {
    const ring = $('#vmRing'), box = $('#vmCore');
    const size = Math.max(160, Math.round(Math.min(innerWidth - 32, innerHeight * 0.52, 470)));
    ring.style.width = ring.style.height = size + 'px';
    box.innerHTML = '';
    core = call('mountCore', box, { size, reduced: !motion });
    if (!core || typeof core.setLevel !== 'function') { core = null; box.innerHTML = '<div class="vm-orb"><i></i></div>'; }
    $('#vmPhase').style.display = core ? 'none' : '';        // the 3D core writes its own state on its ring
    const cv = $('#vmSpec'), dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * 1.18 * dpr);
    cv.width = cv.height = px;
    cv.hidden = !motion;
    specCol = classicLook() && classicSpec ? classicSpec : '#c8a24a';      // gold, the AGORA accent; the Classic Jarvis look's own (voice-classic.js)
  }
  function paintLevel(v) {
    level = v;
    if (core) safe(() => core.setLevel(v));
    el.style.setProperty('--lv', v.toFixed(3));
    $('#vmGauge').setAttribute('stroke-dasharray', `${Math.round(v * 100)} 100`);
  }
  function micLevel() {
    if (!an) return null;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    return clamp(Math.sqrt(sum / buf.length) * 4.2, 0, 1);
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, ts - (lastT || ts)); lastT = ts;
    let target = 0.12;
    if (phase === 'listening') { const m = micLevel(); evLv *= Math.exp(-dt / 260); target = m == null ? 0.18 + evLv * 0.7 : Math.max(m, evLv * 0.5); }
    else if (phase === 'speaking') { speakTick(ts); pulse *= Math.exp(-dt / 170); target = 0.16 + pulse * (0.6 + 0.4 * Math.abs(Math.sin(ts / 55))); }
    else if (phase === 'thinking') target = 0.3 + 0.12 * Math.sin(ts / 160);
    const k = target > level ? 0.45 : 0.12;
    paintLevel(clamp(level + (target - level) * k, 0, 1));
    drawSpec(ts);
  }
  function drawSpec(ts) {                  // a ring of bars round the core: the mic's spectrum while you talk, the pulse while Jarvis does
    const cv = $('#vmSpec'); if (!cv || cv.hidden) return;
    const g = cv.getContext('2d'); if (!g) return;
    const W = cv.width, c = W / 2, r0 = W * 0.39, n = 72;
    g.clearRect(0, 0, W, W);
    if (an && phase === 'listening') an.getByteFrequencyData(fbuf);
    g.strokeStyle = phase === 'listening' ? '#c96a4a' : specCol; g.lineWidth = Math.max(1.5, W / 260); g.lineCap = 'round';
    g.globalAlpha = 0.85; g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2, j = i < n / 2 ? i : n - i;          // mirrored: low notes at the top
      let v;
      if (an && phase === 'listening') v = fbuf[Math.min(fbuf.length - 1, 2 + j * 2)] / 255;
      else v = level * (0.45 + 0.55 * Math.abs(Math.sin(ts / 240 + j * 0.55)));
      const h = W * 0.012 + v * W * 0.085;
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * (r0 + h), c + Math.sin(a) * (r0 + h));
    }
    g.stroke();
  }
  function startLoop() { if (motion && !raf) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // the mic analyser: only from a tap (the iPhone's rule); its failure never stops the conversation
  function ensureMic() {
    if (!open || stream || micErr || !motion) return;     // once per session: a refusal or a busy mic is not asked again
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') { micErr = 'none'; return; }
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (_) { actx = null; micErr = 'audio'; return; }
    micErr = 'pending';
    const mine = sess;
    md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => {
      if (!open || !actx || mine !== sess) { s.getTracks().forEach((t) => t.stop()); return; }
      micErr = '';
      stream = s; src = actx.createMediaStreamSource(s); an = actx.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = 0.55; src.connect(an);
      buf = new Uint8Array(an.fftSize); fbuf = new Uint8Array(an.frequencyBinCount);
    }).catch((e) => { if (mine === sess) micErr = (e && e.name) || 'denied'; });
  }
  function releaseMic() {
    if (stream) safe(() => stream.getTracks().forEach((t) => t.stop()));
    if (src) safe(() => src.disconnect());
    if (actx) safe(() => actx.close());
    stream = null; src = null; an = null; actx = null; buf = null; fbuf = null;
  }

  // ---------------------------------------------------------------- listening (the phone's speech recognition)
  function stopRec() { clearTimeout(recT); if (rec) { const r = rec; rec = null; safe(() => r.abort()); } }
  function toTyping(why) {                 // no voice input here: the same screen, a field to type in, said once per launch
    stopRec(); showType(true, false);
    if (!said.noSR) {
      said.noSR = true;
      sayLine(why === 'blocked' ? 'The microphone is blocked for speech here, so type below and I will answer out loud.'
        : 'Voice input is not available here, so type below and I will answer out loud.', null);
    } else setPhase('idle', 'Type below, or tap End to stop.');
  }
  function fallBack() {
    ptt = true; fellBack = true; holding = false; silent = 0;
    if (rec) { const r0 = rec; rec = null; safe(() => r0.abort ? r0.abort() : r0.stop()); }
    ++turn; setPhase('idle', ''); paintStatus('This iPhone stopped hands-free listening. Hold the button and talk.');
  }
  function listen(opt) {
    const hold = !!(opt && opt.hold), auto = !!(opt && opt.auto);
    if (!open) return;
    if (!SR || said.blocked) { toTyping(said.blocked ? 'blocked' : ''); return; }
    stopRec(); stopTalk();
    const my = ++turn;
    let fin = '', inter = '', sent = false;
    const done = () => {
      if (sent || my !== turn) return;
      sent = true;
      const t = (fin || inter).trim();
      if (t) { silent = 0; holding = false; submit(t); return; }
      holding = false;
      if (hold) { setPhase('idle', ''); paintStatus('I did not catch that. Hold the button and try again.'); return; }
      silent++;
      if (shouldFallBack({ ios: onIOS, auto: auto || silent > 1, ptt, error: 'no-speech', silent })) { fallBack(); return; }
      if (silent < SILENT_TURNS) setTimeout(() => { if (open && my === turn && phase === 'listening') listen({ auto: true }); }, 350);
      else setPhase('idle', 'Tap the circle when you need me. End to stop.');
    };
    try {
      const r = rec = new SR();
      r.lang = 'en-US'; r.continuous = hold; r.interimResults = true; r.maxAlternatives = 1;
      r.onresult = (e) => {
        if (my !== turn) return;
        fin = ''; inter = '';
        const res = e && e.results ? e.results : [];
        for (let i = 0; i < res.length; i++) { const a = res[i] && res[i][0]; if (!a) continue; if (res[i].isFinal) fin += a.transcript + ' '; else inter += a.transcript + ' '; }
        capYou((fin + inter).trim()); evLv = 1;
        if (fin.trim() && !hold) { safe(() => r.stop()); done(); }
      };
      r.onspeechstart = () => { evLv = 1; };
      r.onerror = (e) => {
        if (my !== turn) return;
        const er = e && e.error;
        if (shouldFallBack({ ios: onIOS, auto, ptt, error: er, silent })) { sent = true; rec = null; fallBack(); }
        else if (er === 'not-allowed' || er === 'service-not-allowed') { said.blocked = true; sent = true; rec = null; holding = false; toTyping('blocked'); }
        else if (er === 'network') { said.blocked = true; sent = true; rec = null; holding = false; toTyping('blocked'); paintStatus('The speech service is not reachable. Type below instead.'); }
        else if (er === 'no-speech') { paintStatus('I heard nothing. ' + (ptt ? 'Hold the button and talk.' : 'Say it again.')); }
        else if (er === 'audio-capture' && stream) { releaseMic(); micErr = 'busy'; }        // the phone gives the mic to one of them: speech wins
      };
      r.onend = () => { if (my !== turn) return; rec = null; clearTimeout(recT); done(); };
      r.start();
      recT = setTimeout(() => { if (rec === r) safe(() => r.stop()); }, hold ? LISTEN_MAX_MS * 2 : LISTEN_MAX_MS);
      setPhase('listening', hold ? 'Listening. Let go to send.' : 'Listening. Tap to pause.');
    } catch (_) { rec = null; toTyping(''); }
  }

  // ---------------------------------------------------------------- thinking: the shell's answer (the brain, in its spoken form)
  async function submit(text) {
    if (!open) return;
    stopRec(); stopTalk();
    const my = ++turn;
    turns++;
    capYou(text); $('#vmJar').textContent = ''; clearFrags();
    setPhase('thinking', 'Thinking. Tap to cancel.');
    let r = null;
    try { r = await Promise.resolve(d.answer ? d.answer(text) : null); } catch (_) { r = null; }
    if (!open || my !== turn) return;
    if (!r || typeof r.text !== 'string' || !r.text) r = { text: 'Pardon me, something went wrong there. Ask me again.', speak: '' };
    lastReply = r;
    renderVerdict();
    if (r.control === 'stop' || r.control === 'voice_mode_off') { sayLine('Standing by.', null, () => close('stop')); return; }
    sayLine(r.speak || r.text, r, r.end ? () => close('bye') : null);      // a farewell ("goodbye") is said, then voice mode ends
  }

  // ---------------------------------------------------------------- speaking: the phone's voice, the captions, the cards
  function wordsOf(line) { const out = [], rx = /\S+/g; let m; while ((m = rx.exec(line))) out.push({ w: m[0], i: m.index }); return out; }
  function clearFrags() { const f = $('#vmFrags'); if (f) f.innerHTML = ''; }
  function placeFrags(list, line) {
    const box = $('#vmFrags'), rr = $('#vmRing').getBoundingClientRect(), R = (rr.width || 300) * 0.5, cx = rr.left + R, low = line.toLowerCase();
    const slots = [[-0.82, -0.62], [0.82, -0.5], [-0.78, 0.6], [0.8, 0.66]], vw = document.documentElement.clientWidth || innerWidth;
    box.innerHTML = list.map((f, i) => `<div class="vm-frag" data-i="${i}"><b>${esc(f.k)}</b><span>${esc(f.v)}</span></div>`).join('');
    return list.map((f, i) => {
      const el2 = box.children[i], half = (el2.offsetWidth || 120) / 2;
      // the card's slot round the core, kept on screen (12 px from either edge)
      const x = clamp(slots[i % 4][0] * R, 12 + half - cx, vw - 12 - half - cx);
      el2.style.setProperty('--fx', Math.round(x) + 'px'); el2.style.setProperty('--fy', Math.round(slots[i % 4][1] * R) + 'px');
      // it floats out when its name is spoken ("Zlarior 50K · room" -> "zlarior"), else at the start
      const key = String(f.k).split(/[·\s]/)[0].trim().toLowerCase(), at = key ? low.indexOf(key) : -1;
      return { el: el2, at: at < 0 ? 0 : at };
    });
  }
  function mark(ci) {                         // the word at character ci is being spoken: light it and what came before
    const s = speech; if (!s) return;
    let n = 0;
    while (n < s.words.length && s.words[n].i <= ci) n++;
    if (n > s.idx) {
      const spans = $('#vmJar').children;
      for (let i = s.idx; i < n && i < spans.length; i++) spans[i].classList.add('on');
      const w = s.words[n - 1].w;
      pulse = Math.min(1, 0.55 + w.length / 14);
      s.idx = n;
    }
    for (const f of s.frags) if (!f.on && f.at <= ci + 2 && f.el) { f.on = true; f.el.classList.add('on'); }
  }
  function speakTick(ts) {                    // until the phone reports word timing, the words follow the estimated pace
    const s = speech; if (!s || s.real || s.done) return;
    const k = Math.max(0, Math.floor(((ts - s.t0) / 1000) * WPS * s.rate));     // a frame stamped just before t0: word 0
    if (k < s.words.length) mark(s.words[k].i);
  }
  function revealAll() {
    const s = speech; if (!s) return;
    for (const sp of $('#vmJar').children) sp.classList.add('on');
    for (const f of s.frags) if (f.el) { f.on = true; f.el.classList.add('on'); }
  }
  function stopTalk() {                       // barge-in: the voice stops at once
    if (speech) { speech.done = true; clearTimeout(speech.watch); speech = null; }
    if (speaker) safe(() => speaker.cancel());          // the speaker's own cancel: its next speak() waits out WebKit's race
    else if (synth) safe(() => synth.cancel());
  }
  // the iPhone speaks only after a speak() inside a tap: a silent one at each tap until it has (voice-out.js does it too)
  let primed = false;
  function unlockVoice() { if (!primed && speaker && needsPrimer()) primed = !!safe(() => speaker.prime(), false); }
  // sayLine(line, reply?, after?): speak one line with its captions and the reply's cards; then after(), or the reply's app
  // opens, or the next turn: listening (typing when this phone has no voice input)
  function sayLine(line, reply, after) {
    if (!open) return;
    stopTalk();
    const my = ++turn, text = cleanSpeech(line), words = wordsOf(text);
    const cfg = call('voiceCfg') || {}, rate = +cfg.rate || DEFAULTS.rate;
    const s = speech = { words, frags: [], t0: now(), real: false, idx: 0, done: false, rate, watch: 0 };
    capJar(words, motion ? 0 : words.length);
    s.frags = reply ? placeFrags(fragmentsOf(reply), text) : (clearFrags(), []);
    if (!motion) revealAll();
    setPhase('speaking', 'Speaking. Tap to cut in.');
    const finish = () => {
      if (s.done || my !== turn || !open) return;
      s.done = true; clearTimeout(s.watch); revealAll(); speech = null;
      if (typeof after === 'function') { after(); return; }
      if (reply && reply.open) { close('open'); call('openApp', reply); return; }
      if (SR && !said.blocked && !ptt) setTimeout(() => { if (open && my === turn) listen({ auto: true }); }, 300);
      else if (SR && !said.blocked) setPhase('idle', 'Hold the button to talk.');
      else setPhase('idle', 'Type below, or tap End to stop.');
    };
    const est = 900 + (words.length / (WPS * rate)) * 1000;
    if (!synth || call('muted') || !text) { s.watch = setTimeout(finish, Math.min(est, 9000)); return; }
    try {
      s.watch = setTimeout(finish, est * 2 + 4000);       // a voice that never says it finished (iPhone) never stalls the turn
      speaker.speak(String(line || ''), { onboundary: (ci) => { if (my !== turn || s.done) return; s.real = true; mark(ci); }, onend: finish });   // the raw line: the speech layer reads "-$113" itself
    } catch (_) { clearTimeout(s.watch); s.watch = setTimeout(finish, Math.min(est, 9000)); }
  }

  // ---------------------------------------------------------------- taps: talk, interrupt, pause
  function tapCore() {
    if (!open) return;
    ensureMic(); unlockVoice();
    if (phase === 'speaking' || phase === 'thinking') { stopTalk(); ++turn; silent = 0; listen(); return; }
    if (phase === 'listening') { if (holding) return; stopRec(); ++turn; setPhase('idle', 'Paused. Tap the circle to talk.'); return; }
    silent = 0; listen();
  }

  // ---------------------------------------------------------------- open / close
  const onHide = (e) => { if ((e && e.type === 'pagehide') || document.visibilityState !== 'visible') close('hidden'); };
  function openVM(o) {
    if (open) return;
    if (!el) build();
    open = true; sess++; turns = 0; silent = 0; typed = false; said.blocked = false; micErr = '';
    if (fellBack) { fellBack = false; ptt = defaultPtt(pttSaved()); }
    motion = call('fx') !== 'off' && !call('reduced');
    el.dataset.motion = motion ? 'on' : 'off';
    el.hidden = false;
    call('onOpen');
    capYou(''); $('#vmJar').textContent = ''; clearFrags(); showType(false);
    loadVoices(); renderVerdict(); mountCore(); setPhase('idle', ''); paintStatus();
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onHide);
    if (o && o.gesture) { ensureMic(); unlockVoice(); }
    else window.addEventListener('pointerup', ensureMic, { once: true, capture: true });   // a hold: the release is the tap
    safe(() => { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { if (open) wake = w; else w.release(); }).catch(() => {}); });
    startLoop();
    safe(() => $('#vmX').focus({ preventScroll: true }));
    if (!SR) { toTyping(''); return; }
    const g = String(call('greeting') || 'At your service').replace(/[.!]+$/, '');
    sayLine(`${g}. ${ptt ? 'Hold the button and talk.' : "I'm listening."}`, null);
  }
  function close(why) {
    if (!open) return;
    open = false; ++turn;
    stopRec(); stopTalk(); stopLoop(); releaseMic();
    window.removeEventListener('pointerup', ensureMic, { capture: true });
    document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); holding = false;
    if (wake) { safe(() => wake.release()); wake = null; }
    if (core) safe(() => core.destroy());
    core = null;
    if (el) { el.hidden = true; $('#vmCore').innerHTML = ''; }
    call('onClose', why || 'end');
  }
  return {
    open: (o) => safe(() => openVM(o || {})),
    close: (why) => safe(() => close(why)),
    isOpen: () => open,
    setPtt: (v) => safe(() => setPtt(v)), pttDown: () => safe(pttDown), pttUp: () => safe(pttUp),
    stats: () => ({ ptt, fellBack, holding, status, open, phase, level: +level.toFixed(3), turns, motion, typing: typed, recognition: !!SR && !said.blocked,
      mic: !!stream, micLive: !!(stream && stream.getTracks().some((t) => t.readyState === 'live')), micErr, audio: actx ? actx.state : 'closed',
      core: core ? safe(() => (typeof core.stats === 'function' ? core.stats() : 'mounted'), 'mounted') : null, loop: !!raf,
      voice: (voice() || {}).name || '', speaking: !!speech, reply: lastReply ? lastReply.speak || lastReply.text : '' }),
  };
}
export default createVoiceMode;
