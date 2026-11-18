// ODEON flat stage: the 2D fallback when the phone cannot give WebGL. Same interface as the 3D Theater (load, update,
// fire, render, resize, setLite, project, head), drawn on a 2D canvas: the tape so far, the levels, entry / stop / target.
import { barsAt, formingBar, stopAt } from './timeline.js';

export class FlatStage {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.flash = 0;
    this.flat = true;
  }

  setLite() {}

  resize(w, h) {
    const r = window.OLYMPUS ? window.OLYMPUS.dpr() : Math.min(2, window.devicePixelRatio || 1);
    this.w = w; this.h = h; this.r = r;
    this.c.width = Math.round(w * r); this.c.height = Math.round(h * r);
  }

  load(tr) { this.tr = tr; this.T = tr.tStart; }

  _x(t) {
    const tr = this.tr, span = Math.max(tr.B.s * 60, this.T - tr.tStart + tr.B.s * 12);
    const t0 = Math.max(tr.tStart, this.T - span);
    return 16 + ((t - t0) / (this.T + tr.B.s * 10 - t0)) * (this.w - 32);
  }

  _y(p) {
    const top = (this.band && this.band.top) || 90, bot = (this.band && this.band.bottom) || this.h - 240;
    return bot - ((p - this.lo) / Math.max(1e-6, this.hi - this.lo)) * (bot - top);
  }

  /** the price range on screen: the bars in view (plus the entry and the stop in the trade) */
  _range(T) {
    const tr = this.tr, B = tr.B;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < B.n && B.t[i] <= T; i++) {
      if (this._x(B.t[i]) < 0) continue;
      lo = Math.min(lo, B.l[i]); hi = Math.max(hi, B.h[i]);
    }
    if (T >= tr.entry.t) { lo = Math.min(lo, tr.entry.px, tr.stop); hi = Math.max(hi, tr.entry.px, tr.stop); }
    if (!isFinite(lo)) { lo = tr.lo; hi = tr.hi; }
    const pad = (hi - lo) * 0.08 + 1;
    this.lo = lo - pad; this.hi = hi + pad;
  }

  project(a) { return { x: this._x(a.t), y: this._y(a.price) }; }

  update(T, dt) {
    this.T = T;
    this._range(T);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const st = barsAt(this.tr, T);
    const B = this.tr.B;
    const price = st.forming >= 0 ? formingBar(this.tr, st.forming, st.frac).c : st.done ? B.c[st.done - 1] : B.o[0];
    this.head = { x: this._x(T), y: this._y(price), price };
    this.st = st;
  }

  fire(e) { if (e.k === 'sweep' || e.k === 'exit') this.flash = 0.6; }

  render() {
    const g = this.g, tr = this.tr, B = tr.B, T = this.T;
    g.setTransform(this.r, 0, 0, this.r, 0, 0);
    g.fillStyle = '#06050b';
    g.fillRect(0, 0, this.w, this.h);
    const line = (y, color, x0, label) => {
      g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(this.w - 16, y); g.stroke();
      if (label) { g.fillStyle = color; g.font = '600 12px Georgia, system-ui, sans-serif'; g.fillText(label, x0 + 4, y - 4); }
    };
    for (const lv of tr.levels || []) if (lv.t == null || T >= lv.t + 300) line(this._y(lv.px), '#7fa6bd', 16, lv.name || lv.label);
    if (T >= tr.entry.t) {
      const x0 = Math.max(16, this._x(tr.entry.t));
      line(this._y(tr.entry.px), '#e8f3ff', x0, 'ENTRY');
      line(this._y(stopAt(tr, T)), '#ff3b5c', x0, 'STOP');
      line(this._y(tr.target), '#ffc65a', x0, 'TARGET');
    }
    const st = this.st || { done: 0, forming: -1 };
    const w = Math.max(1.5, (this._x(tr.tStart + B.s) - this._x(tr.tStart)) * 0.66);
    const draw = (i, o, h, l, c) => {
      const x = this._x(B.t[i] + B.s / 2);
      if (x < 0 || x > this.w) return;
      g.strokeStyle = g.fillStyle = c >= o ? '#7f8a52' : '#ff6b7f';
      g.beginPath(); g.moveTo(x, this._y(h)); g.lineTo(x, this._y(l)); g.stroke();
      g.fillRect(x - w / 2, this._y(Math.max(o, c)), w, Math.max(1, this._y(Math.min(o, c)) - this._y(Math.max(o, c))));
    };
    for (let i = 0; i < st.done; i++) draw(i, B.o[i], B.h[i], B.l[i], B.c[i]);
    if (st.forming >= 0) { const f = formingBar(tr, st.forming, st.frac); draw(st.forming, f.o, f.h, f.l, f.c); }
    if (this.flash > 0) { g.fillStyle = `rgba(127,166,189,${(this.flash * 0.25).toFixed(3)})`; g.fillRect(0, 0, this.w, this.h); }
  }

  bounds() { return {}; }
}
