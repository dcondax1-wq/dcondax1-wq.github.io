// ODEON compare (2026-11-04): two trades side by side (#compare). Both are drawn as R over the minutes since their entry on one
// canvas (so a fast winner and a slow loser can be read against each other), under a table of the numbers where the better one of
// each row is lit. DOM + canvas 2D only; every text goes in with textContent.
import { fmtUsd, fmtR, dayLabel, hhmm, heldLabel, exitLabel, outcomeOf } from './data.js';
import { setupOf, hourOf, rPath } from './library.js';

const COL = ['#7fa6bd', '#ffb547'];            // A is blue, B is amber (also the table's header colours)
const $ = (root, s) => root.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** the rows of the table: [label, A text, B text, which is better (0 / 1 / -1 for none)] */
function compareRows(a, b) {
  const better = (x, y, high = true) => (x === y ? -1 : (x > y) === high ? 0 : 1);
  return [
    ['Result', fmtUsd(a.usd), fmtUsd(b.usd), better(a.usd, b.usd)],
    ['R multiple', fmtR(a.r), fmtR(b.r), better(a.r, b.r)],
    ['Best it reached (MFE)', fmtR(a.mfe_r || 0), fmtR(b.mfe_r || 0), better(a.mfe_r || 0, b.mfe_r || 0)],
    ['Worst it dipped (MAE)', fmtR(-(a.mae_r || 0)), fmtR(-(b.mae_r || 0)), better(a.mae_r || 0, b.mae_r || 0, false)],
    ['Time in trade', heldLabel(a.held_min), heldLabel(b.held_min), better(a.held_min, b.held_min, false)],
    ['Exit', exitLabel(a.exit.kind), exitLabel(b.exit.kind), -1],
    ['Size', `${a.qty} micro${a.qty === 1 ? '' : 's'}`, `${b.qty} micro${b.qty === 1 ? '' : 's'}`, -1],
    ['Entered', `${hhmm(a.entry.t, a.off)} ET · ${hourOf(a)}`, `${hhmm(b.entry.t, b.off)} ET · ${hourOf(b)}`, -1],
  ];
}

/** R over minutes for both trades, with the 0 line and the 1R steps */
function drawPaths(canvas, a, b) {
  const W = canvas.clientWidth || 340, H = canvas.clientHeight || 180, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const P = [rPath(a), rPath(b)], mMax = Math.max(1, ...P.map((p) => p[p.length - 1].m));
  const all = P.flat().map((p) => p.r), rMax = Math.max(1.2, ...all), rMin = Math.min(-1.2, ...all);
  const x = (m) => 28 + (m / mMax) * (W - 40), y = (r) => 10 + ((rMax - r) / (rMax - rMin)) * (H - 28);
  g.font = '600 11px Georgia, system-ui, sans-serif'; g.textAlign = 'right';
  for (let r = Math.ceil(rMin); r <= Math.floor(rMax); r++) {
    g.strokeStyle = r === 0 ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.1)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(28, y(r)); g.lineTo(W - 8, y(r)); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(r + 'R', 24, y(r) + 4);
  }
  P.forEach((pts, i) => {
    g.strokeStyle = COL[i]; g.lineWidth = 2.2; g.lineJoin = 'round'; g.shadowColor = COL[i]; g.shadowBlur = 7;
    g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(x(p.m), y(p.r)) : g.moveTo(x(p.m), y(p.r)))); g.stroke();
    g.shadowBlur = 0; g.fillStyle = COL[i];
    const e = pts[pts.length - 1]; g.beginPath(); g.arc(x(e.m), y(e.r), 4, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = 'rgba(255,255,255,.55)'; g.textAlign = 'center';
  g.fillText(heldLabel(mMax) + ' after the entry', W / 2 + 10, H - 2);
}

export class Compare {
  constructor(root, h) {
    this.root = root;
    this.h = h;                                          // { play(id) }
    $(root, '#cmpClose').addEventListener('click', () => this.hide());
    $(root, '#cmpA').addEventListener('click', () => { this.hide(); h.play(this.a.id); });
    $(root, '#cmpB').addEventListener('click', () => { this.hide(); h.play(this.b.id); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) this.hide(); });
  }

  show(a, b) {
    this.a = a; this.b = b;
    const head = (t, i) => {
      const box = $(this.root, i ? '#cmpHeadB' : '#cmpHeadA');
      box.replaceChildren(el('b', null, `${i ? 'B' : 'A'} · ${setupOf(t)} ${t.side.toLowerCase()}`), el('span', null, `${dayLabel(t.day)} · ${outcomeOf(t)}`));
    };
    head(a, 0); head(b, 1);
    const rows = compareRows(a, b);
    $(this.root, '#cmpTable').replaceChildren(...rows.map(([k, x, y, w]) => {
      const tr = el('tr');
      const cx = el('td', w === 0 ? 'win' : '', x), cy = el('td', w === 1 ? 'win' : '', y);
      tr.append(el('th', null, k), cx, cy);
      return tr;
    }));
    const diff = a.r - b.r;
    $(this.root, '#cmpNote').textContent = diff === 0 ? 'The same R.' : `${diff > 0 ? 'A' : 'B'} made ${Math.abs(diff).toFixed(2)}R more (${fmtUsd(Math.abs(a.usd - b.usd), false)}).`;
    this.root.hidden = false;
    drawPaths($(this.root, '#cmpCanvas'), a, b);
  }

  hide() { this.root.hidden = true; this.h.closed && this.h.closed(); }
}
