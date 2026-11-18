// ODEON trade strip (2026-11-03): every trade as one bar in time order (green up = a win, red down = a loss, height = R), with the
// running $ as a line over them. Drag along it to scrub trade by trade: the label shows the trade under your finger (day, side, R,
// $, the running total), letting go opens its film; the arrows step one trade. Pure model (stripModel, labelOf) + a small DOM
// class; every text goes in with textContent.
import { fmtUsd, fmtR, dayLabel, outcomeOf } from './data.js';

/** the trades oldest first with the running $ and R: { rows: [{ id, i, day, side, bot, r, usd, cum, cumR, outcome, exit }], total } */
export function stripModel(trades) {
  const T = (trades || []).slice().sort((a, b) => a.entry.t - b.entry.t || String(a.id).localeCompare(String(b.id)));
  let cum = 0, cumR = 0, wins = 0;
  const rows = T.map((t, i) => {
    cum += t.usd; cumR += t.r;
    const outcome = outcomeOf(t);
    if (outcome === 'win') wins++;
    return { id: t.id, i, day: t.day, side: t.side, bot: t.bot, r: t.r, usd: t.usd, cum, cumR, outcome, exit: t.exit && t.exit.kind };
  });
  return { rows, total: { n: rows.length, usd: cum, r: cumR, wins, winPct: rows.length ? (100 * wins) / rows.length : 0 } };
}

export function labelOf(row, n) {
  if (!row) return '';
  return `${row.i + 1}/${n} · ${dayLabel(row.day)} · ${row.side} · ${fmtR(row.r)} · ${fmtUsd(row.usd)} · running ${fmtUsd(row.cum)}`;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const NS = 'http://www.w3.org/2000/svg';

export class TradeStrip {
  constructor(root, onPick) {
    this.root = root;
    this.onPick = onPick;
    this.bars = root.querySelector('.st-bars');
    this.lab = root.querySelector('.st-lab');
    this.model = { rows: [], total: { n: 0 } };
    this.active = -1;
    this.preview = -1;
    root.querySelector('.st-prev').addEventListener('click', () => this.step(-1));
    root.querySelector('.st-next').addEventListener('click', () => this.step(1));
    const at = (e) => {
      const r = this.bars.getBoundingClientRect(), n = this.model.rows.length;
      return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * n)));
    };
    let down = false;
    this.bars.addEventListener('pointerdown', (e) => { down = true; this.bars.setPointerCapture(e.pointerId); this.show(at(e)); });
    this.bars.addEventListener('pointermove', (e) => { if (down) this.show(at(e)); });
    const up = () => { if (!down) return; down = false; const i = this.preview; this.preview = -1; if (i >= 0 && i !== this.active) this.onPick(this.model.rows[i].id); else this.mark(this.model.rows[this.active] && this.model.rows[this.active].id); };
    this.bars.addEventListener('pointerup', up);
    this.bars.addEventListener('pointercancel', up);
    this.bars.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { this.step(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { this.step(1); e.preventDefault(); }
    });
  }

  set(trades) {
    this.model = stripModel(trades);
    const { rows } = this.model, n = rows.length;
    this.root.hidden = n < 2;                                            // one reel (the demo): nothing to scrub
    this.bars.textContent = '';
    if (n < 2) return;
    const maxR = Math.max(1, Math.min(4, ...[Math.max(...rows.map((r) => Math.abs(r.r)))]));
    rows.forEach((r) => {
      const b = el('i', 'b o-' + r.outcome);
      b.style.setProperty('--h', (Math.min(1, Math.abs(r.r) / maxR) * 100).toFixed(1) + '%');
      b.dataset.i = String(r.i);
      this.bars.append(b);
    });
    // the running $ line over the bars
    const lo = Math.min(0, ...rows.map((r) => r.cum)), hi = Math.max(1, ...rows.map((r) => r.cum));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 40');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const y = (v) => (38 - ((v - lo) / Math.max(1e-6, hi - lo)) * 36).toFixed(2);
    const pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', rows.map((r, k) => `${(((k + 0.5) / n) * 100).toFixed(2)},${y(r.cum)}`).join(' '));
    pl.setAttribute('class', 'cum');
    svg.append(pl);
    this.bars.append(svg);
    this.bars.setAttribute('aria-valuemin', '1'); this.bars.setAttribute('aria-valuemax', String(n));
    this.say(null);
  }

  say(row) {
    const { rows, total } = this.model;
    this.lab.textContent = row ? labelOf(row, rows.length)
      : `${total.n} trades · ${total.winPct.toFixed(0)}% wins · ${fmtR(total.r)} · ${fmtUsd(total.usd)}`;
    this.lab.dataset.sign = row ? (row.usd >= 0 ? 'up' : 'down') : '';
  }

  show(i) {
    this.preview = i;
    this.bars.querySelectorAll('.b.pv').forEach((b) => b.classList.remove('pv'));
    const b = this.bars.children[i];
    if (b && b.classList) b.classList.add('pv');
    this.say(this.model.rows[i]);
  }

  /** the reel on screen */
  mark(id) {
    const i = this.model.rows.findIndex((r) => r.id === id);
    this.active = i;
    this.bars.querySelectorAll('.b.on, .b.pv').forEach((b) => b.classList.remove('on', 'pv'));
    const b = this.bars.children[i];
    if (b && b.classList && i >= 0) { b.classList.add('on'); this.bars.setAttribute('aria-valuenow', String(i + 1)); }
    this.say(i >= 0 ? this.model.rows[i] : null);
  }

  step(d) {
    const n = this.model.rows.length;
    if (n < 2) return;
    const i = (Math.max(0, this.active) + d + n) % n;
    this.onPick(this.model.rows[i].id);
  }
}
