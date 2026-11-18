// ODEON captions: the plain-language caption track, its transcript, the spoken version and the on-screen callouts.
//   const cc = new Captions({ line, transcript, speech });  cc.load(trade);  const fresh = cc.sync(T);  cc.setNarrate(on)
// sync(T) shows every caption row known at T (row.t <= T): moving forward it returns the rows just crossed (in order) so
// the scene and the director can play their effects; moving back (a scrub) it rebuilds the transcript and returns [].
// Speech uses the phone's own speechSynthesis and only starts after the viewer taps Narrate (browsers require a tap).
// The caption line types itself in, word by word (a typewriter timed to the line's length, pure CSS: one span per word with
// its own animation delay, so the frame loop never touches it); the whole text is in the line at once for screen readers,
// the transcript and the tests. Reduced motion: the line appears whole.
import { hhmm } from './data.js';

export const CALLOUT = {
  idm: 'INDUCEMENT', sweep: 'SWEEP', disp: 'DISPLACEMENT', cisd5: '5M CISD', limit: 'LIMIT SET',
  tap: 'LIMIT TAPPED', cisd1: '1M CISD', setup: 'SETUP', entry: 'ENTRY', be: 'BREAKEVEN',
};

const WORD_MS = [45, 120];              // ms per word: long lines type faster, so every line is in within ~1.5 s
/** The caption text as per-word spans with their reveal delay (--d), plus the caret; the spaces stay plain text. */
function typeset(el, text, reduced) {
  const words = text.split(/(\s+)/), n = words.filter((w) => w.trim()).length;
  const ms = Math.max(WORD_MS[0], Math.min(WORD_MS[1], 1500 / Math.max(1, n)));
  if (reduced || !n) { el.textContent = text; el.classList.remove('typing'); return 0; }
  let k = 0;
  const parts = words.filter(Boolean).map((w) => {
    if (!w.trim()) return document.createTextNode(w);
    const c = document.createElement('span');
    c.textContent = w;
    c.style.setProperty('--d', Math.round(k++ * ms) + 'ms');
    return c;
  });
  const caret = document.createElement('i');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.style.setProperty('--d', Math.round(n * ms) + 'ms');
  el.replaceChildren(...parts, caret);
  el.classList.add('typing');
  return n * ms;
}

export class Captions {
  constructor(o) {
    this.line = o.line;               // the caption bar element
    this.list = o.transcript;         // <ol> of every caption so far
    this.speech = o.speech || (typeof window !== 'undefined' ? window.speechSynthesis : null);
    this.narrate = false;
    this.reduced = !!o.reduced;
    this.tr = null;
    this.n = 0;
  }

  load(tr) {
    this.tr = tr;
    this.n = 0;
    this.list.textContent = '';
    this._show(null);
    this._hush();
  }

  /** the rows known at T; returns the rows crossed moving forward */
  sync(T, forward) {
    const E = this.tr ? this.tr.events : [];
    let n = 0;
    while (n < E.length && E[n].t <= T) n++;
    if (n === this.n) {
      if (forward === false && n) { this._show(E[n - 1], true); this._hush(); }
      return [];
    }
    if (n < this.n || !forward) {
      this.list.textContent = '';
      for (let i = 0; i < n; i++) this._append(E[i]);
      this.n = n;
      this._show(n ? E[n - 1] : null, true); // a scrub must show the destination now, not replay the word reveal
      this._hush();
      return [];
    }
    const fresh = E.slice(this.n, n);
    fresh.forEach((e) => this._append(e));
    this.n = n;
    this._show(E[n - 1]);
    if (this.narrate) this._say(fresh[fresh.length - 1]);
    return fresh;
  }

  texts() {
    return this.tr ? this.tr.events.slice(0, this.n).map((e) => e.text) : [];
  }

  setNarrate(on) {
    this.narrate = !!on && !!this.speech;
    if (!this.narrate) this._hush();
    else if (this.n && this.tr) this._say(this.tr.events[this.n - 1]);
    return this.narrate;
  }

  _show(e, instant = false) {
    const off = this.tr ? this.tr.off : 0;
    this.line.dataset.k = e ? e.k : '';
    this.line.classList.toggle('on', !!e);
    const time = this.line.querySelector('.cc-time'), text = this.line.querySelector('.cc-text');
    time.textContent = e ? hhmm(e.t, off) + ' ET' : '';
    typeset(text, e ? e.text : '', this.reduced || instant);
    // A new forward moment pops in; scrubbing shows the chosen moment immediately.
    this.line.classList.remove('pop');
    if (e && !instant) { void this.line.offsetWidth; this.line.classList.add('pop'); }
  }

  _append(e) {
    const li = document.createElement('li');
    li.dataset.k = e.k;
    const t = document.createElement('time');
    t.textContent = hhmm(e.t, this.tr.off);
    const s = document.createElement('span');
    s.textContent = e.text;
    li.append(t, s);
    this.list.append(li);
  }

  _say(e) {
    if (!e || !this.speech) return;
    try {
      if (this.speech.speaking || this.speech.pending) this.speech.cancel();
      const u = new SpeechSynthesisUtterance(e.text.replace(/\bCISD\b/g, 'C I S D').replace(/−/g, 'minus '));
      u.rate = 1.04;
      u.pitch = 0.95;
      this.speech.speak(u);
    } catch (err) { /* speech is optional */ }
  }

  _hush() {
    try { if (this.speech && (this.speech.speaking || this.speech.pending)) this.speech.cancel(); } catch (err) { /* optional */ }
  }
}

/** HTML callouts pinned to the 3D moment (projected every frame), kept clear of Jarvis's orb corner */
export class Callouts {
  constructor(layer) {
    this.layer = layer;
    this.items = [];
  }

  clear() {
    this.items.forEach((c) => c.el.remove());
    this.items = [];
  }

  add(e, anchor, wall, off, extra) {
    let label = CALLOUT[e.k];
    if (e.k === 'exit') label = e.outcome === 'win' ? 'WIN' : e.outcome === 'loss' ? 'LOSS' : 'BREAKEVEN';
    if (!label) return;
    const el = document.createElement('div');
    el.className = 'callout k-' + e.k + (e.outcome ? ' o-' + e.outcome : '');
    const b = document.createElement('b');
    b.textContent = label;
    const s = document.createElement('small');
    s.textContent = extra || hhmm(e.t, off) + ' ET';
    el.append(b, s);
    this.layer.append(el);
    this.items.push({ el, anchor, born: wall, life: e.k === 'exit' ? 4.5 : 3.2 });
    while (this.items.length > 2) this.items.shift().el.remove();
  }

  update(wall, project, w, h, top, bottom) {
    this.items = this.items.filter((c) => {
      if (wall - c.born > c.life) { c.el.remove(); return false; }
      return true;
    });
    // keep each callout on screen, between the HUD and the captions (clear of the orb corner), and never on top of
    // another: a newer callout that would overlap an older one moves up
    const placed = [];
    for (let k = this.items.length - 1; k >= 0; k--) {
      const c = this.items[k];
      const age = wall - c.born;
      const p = project(c.anchor);
      if (!p) { c.el.style.opacity = '0'; continue; }
      const x = Math.max(12, Math.min(w - 256, p.x + 14)); // its right edge stays left of the orb column
      let y = Math.max((top || 76) + 40, Math.min((bottom || h - 230) - 48, p.y - 54)); // +40: room for the edge pills
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.find((q) => Math.abs(q.x - x) < 150 && Math.abs(q.y - y) < 50);
        if (!hit) break;
        y = hit.y - 52 >= (top || 76) ? hit.y - 52 : hit.y + 52;
      }
      placed.push({ x, y });
      const a = Math.min(1, age / 0.25) * Math.min(1, (c.life - age) / 0.6);
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      c.el.style.opacity = a.toFixed(3);
    }
  }
}
