// BRIEF ME: the voice (night-nq-main 2026-11-27). Lazy: nq.js adds this file at idle or on the first tap, and calls window.NQ_BRIEF.toggle().
// Never autoplays: speech starts only from toggle() (a tap on the hero's button). Words = briefcore.js from the hero's model (window.NQ_HERO),
// read one sentence at a time (Chrome cuts long utterances), the sentence being read is lit in the caption under the button (also the way
// to "hear" it on a muted phone). Stops on a second tap, when the tab hides, or when the page leaves.
import { briefText, pickVoice } from './briefcore.js?v=1';

const SS = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const $ = (id) => document.getElementById(id);
let on = false, run = 0;

function voices() {
  return new Promise((res) => {
    if (!SS) return res([]);
    const v = SS.getVoices(); if (v && v.length) return res(v);
    let done = false; const fin = () => { if (done) return; done = true; res(SS.getVoices() || []); };
    try { SS.addEventListener('voiceschanged', fin, { once: true }); } catch (_) { /* old Safari */ }
    setTimeout(fin, 900);
  });
}
function ui(state, B) {
  const b = $('hxBrief'), cap = $('hxBriefText');
  if (b) {
    b.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false');
    const l = b.querySelector('.hx-tl'); if (l) l.textContent = state === 'on' ? 'Stop' : 'Brief me';
    b.classList.toggle('on', state === 'on');
  }
  if (!cap) return;
  if (B) {
    while (cap.firstChild) cap.removeChild(cap.firstChild);
    B.parts.forEach((p, i) => { const s = document.createElement('span'); s.textContent = p + ' '; s.dataset.i = String(i); cap.appendChild(s); });
    cap.hidden = false;
  }
}
function lit(i) { const cap = $('hxBriefText'); if (!cap) return; for (const s of cap.children) s.classList.toggle('on', s.dataset.i === String(i)); }

function stop() {
  run++; on = false;
  try { if (SS) SS.cancel(); } catch (_) { /* nothing to stop */ }
  ui('off'); lit(-1);
}
async function start() {
  const H = window.NQ_HERO || null, B = briefText(H, Date.now() / 1000), me = ++run;
  on = true; ui('on', B);
  if (!SS) { ui('off'); const cap = $('hxBriefText'); if (cap) cap.dataset.mute = '1'; on = false; return; }   // no voice in this browser: the words only
  const v = pickVoice(await voices());
  if (me !== run) return;
  try { SS.cancel(); } catch (_) { /* fresh queue */ }
  B.parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = 1.02; u.pitch = 0.92; u.volume = 1;            // OLYMPUS tone: calm, a touch low, unhurried
    u.onstart = () => { if (me === run) lit(i); };
    if (i === B.parts.length - 1) { u.onend = () => { if (me === run) { on = false; ui('off'); lit(-1); } }; u.onerror = u.onend; }
    SS.speak(u);
  });
}
function toggle() { if (on) stop(); else start(); }

addEventListener('visibilitychange', () => { if (document.hidden && on) stop(); });
addEventListener('pagehide', () => { if (on) stop(); });
window.NQ_BRIEF = { toggle, stop, text: () => briefText(window.NQ_HERO || null, Date.now() / 1000) };
if (window.NQ_BRIEF_ASK) { window.NQ_BRIEF_ASK = false; toggle(); }
