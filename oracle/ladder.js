// ORACLE price ladder: a holographic altimeter beside the column. Round-number ticks, the open LIT levels labelled at their
// ring's height, the live price pointer. Placed in screen space from the scene's own projection every frame, with
// transforms only (no layout read in the frame loop); a tick's or a tag's text is rewritten only when it changes.
import { kindOf, hex } from './glow.js';
import { heatOf } from './heat.js';

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
const TICKS = 14, TAGS = 8, GAP = 17;
const fmt = (p, d = 2) => p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function pool(root, n, cls) {
  return Array.from({ length: n }, () => {
    const e = document.createElement('div');
    e.className = cls;
    e.append(document.createElement('i'), document.createElement('span'));
    root.append(e);
    return { e, s: e.lastChild, i: e.firstChild, txt: '', y: null, on: false };
  });
}
const show = (o, on) => { if (o.on !== on) { o.on = on; o.e.style.visibility = on ? 'visible' : 'hidden'; } };
const text = (o, t) => { if (o.txt !== t) { o.txt = t; o.s.textContent = t; } };
const place = (o, y) => { const r = Math.round(y * 2) / 2; if (o.y !== r) { o.y = r; o.e.style.transform = `translate3d(0, ${r}px, 0)`; } };

export class Ladder {
  constructor(root) {
    this.root = root;
    this.ticks = pool(root, TICKS, 'tk');
    this.tags = pool(root, TAGS, 'tag');
    this.now = pool(root, 1, 'px-now')[0];
    this.band = { y0: 0, y1: innerHeight };
  }

  /** The free band (CSS px) the ladder lives in; set on resize, never measured per frame. */
  setBand(b) { this.band = b; }

  /** Every frame: yOf(price) -> screen y (CSS px) from the scene; lo / hi the visible price range; w the World. */
  frame(yOf, lo, hi, w) {
    const { y0, y1 } = this.band;
    const inside = (y) => y > y0 + 6 && y < y1 - 6;
    // ticks: about 7 round numbers in view
    const span = Math.max(1, hi - lo), step = STEPS.find((s) => span / s <= 8) || 1000;
    const yp = w && w.price != null ? yOf(w.price) : null;
    let k = 0;
    for (let p = Math.ceil(lo / step) * step; p <= hi && k < TICKS; p += step) {
      const y = yOf(p), o = this.ticks[k];
      if (!inside(y) || (yp != null && Math.abs(y - yp) < 14)) continue;     // the price pointer has the room
      text(o, fmt(p, step < 1 ? 2 : 0));
      place(o, y);
      show(o, true);
      k++;
    }
    for (; k < TICKS; k++) show(this.ticks[k], false);
    // the open levels in view, nearest first, pushed apart so two tags never overlap
    const lv = w ? w.levels.filter((l) => !l.taken && l.price >= lo && l.price <= hi) : [];
    lv.sort((a, b) => Math.abs(a.dist ?? 0) - Math.abs(b.dist ?? 0));
    const rows = lv.slice(0, TAGS).map((l) => ({ l, y: yOf(l.price) })).filter((r) => inside(r.y)).sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) if (rows[i].y - rows[i - 1].y < GAP) rows[i].y = rows[i - 1].y + GAP;
    rows.forEach((r, i) => {
      const o = this.tags[i];
      text(o, `${r.l.label} ${fmt(r.l.price)}`);
      const c = hex(kindOf(r.l.kind).color);
      if (o.c !== c) { o.c = c; o.e.style.color = c; }
      const h = Math.round(heatOf(r.l.dist, w.atr) * 10) / 10;         // the tag glows with the level's heat (steps of 0.1: a rare write)
      if (o.h !== h) { o.h = h; o.e.style.setProperty('--heat', String(h)); }
      place(o, r.y);
      show(o, true);
    });
    for (let i = rows.length; i < TAGS; i++) show(this.tags[i], false);
    // the live price pointer
    show(this.now, yp != null && inside(yp));
    if (yp != null) { text(this.now, fmt(w.price)); place(this.now, yp); }
  }

}
