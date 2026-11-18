// ODEON share card (2026-11-04): one trade as a PNG (1080 x 1350) to send or save. Canvas 2D only (no three.js, no network, no
// external image): the tape, the entry / stop / target lines, the result, MFE / MAE and the time held, in the OLYMPUS fonts.
//   drawCard(canvas, tr)     paints the card on a canvas (1080 x 1350)
//   shareTrade(tr)           Promise<'shared' | 'saved' | 'failed'>: the phone's share sheet with the PNG, else a download
import { fmtUsd, fmtR, fmtPx, dayLabel, hhmm, heldLabel, exitLabel, outcomeOf } from './data.js';
import { setupOf } from './library.js';

const CARD = { w: 1080, h: 1350 };
const TONE = { win: '#7f8a52', loss: '#ff6b7f', be: '#c9a06a' };
const DISPLAY = "Georgia, 'Arial Black', sans-serif", UI = "Georgia, system-ui, sans-serif";

export function drawCard(canvas, tr) {
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const g = canvas.getContext('2d'), tone = TONE[outcomeOf(tr)] || TONE.be;
  const bg = g.createLinearGradient(0, 0, 0, CARD.h);
  bg.addColorStop(0, '#07060c'); bg.addColorStop(1, '#16113a');
  g.fillStyle = bg; g.fillRect(0, 0, CARD.w, CARD.h);
  const glow = g.createRadialGradient(CARD.w / 2, 430, 20, CARD.w / 2, 430, 640);
  glow.addColorStop(0, tone + '44'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, CARD.w, CARD.h);
  const txt = (s, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(s, x, y); };
  txt('ODEON', 70, 110, `800 54px ${DISPLAY}`, '#eaf0ff');
  txt('REPLAY THEATER', 72, 152, `600 24px ${UI}`, '#8e98b8');
  txt(`${setupOf(tr)} · ${tr.side}`, CARD.w - 70, 110, `800 44px ${DISPLAY}`, '#eaf0ff', 'right');
  txt(`${dayLabel(tr.day)} · ${hhmm(tr.entry.t, tr.off)} ET`, CARD.w - 70, 152, `600 28px ${UI}`, '#8e98b8', 'right');
  // the tape
  const X0 = 70, X1 = CARD.w - 70, Y0 = 220, Y1 = 760, B = tr.B;
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(X0 - 20, Y0 - 20, X1 - X0 + 40, Y1 - Y0 + 40);
  const lo = tr.lo, hi = tr.hi, py = (p) => Y1 - ((p - lo) / Math.max(1e-6, hi - lo)) * (Y1 - Y0), t0 = B.t[0], t1 = B.t[B.n - 1] + B.s;
  const px = (t) => X0 + ((t - t0) / Math.max(1, t1 - t0)) * (X1 - X0);
  const line = (p, color, label) => {
    g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([14, 10]);
    g.beginPath(); g.moveTo(X0, py(p)); g.lineTo(X1, py(p)); g.stroke(); g.setLineDash([]);
    txt(label + ' ' + fmtPx(p), X1, py(p) - 8, `600 22px ${UI}`, color, 'right');
  };
  line(tr.target, '#7f8a52', 'TARGET'); line(tr.stop, '#ff6b7f', 'STOP'); line(tr.entry.px, '#7fa6bd', 'ENTRY');
  const cw = Math.max(2, ((X1 - X0) / B.n) * 0.62);
  for (let i = 0; i < B.n; i++) {
    const up = B.c[i] >= B.o[i], x = px(B.t[i] + B.s / 2);
    g.strokeStyle = g.fillStyle = up ? '#7f8a52' : '#ff6b7f';
    g.lineWidth = 2; g.beginPath(); g.moveTo(x, py(B.h[i])); g.lineTo(x, py(B.l[i])); g.stroke();
    g.fillRect(x - cw / 2, Math.min(py(B.o[i]), py(B.c[i])), cw, Math.max(2, Math.abs(py(B.o[i]) - py(B.c[i]))));
  }
  for (const [t, p, c] of [[tr.entry.t, tr.entry.px, '#7fa6bd'], [tr.exit.t, tr.exit.px, tone]]) {
    g.fillStyle = c; g.beginPath(); g.arc(px(t), py(p), 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#07060c'; g.lineWidth = 4; g.stroke();
  }
  // the result
  const usdText = fmtUsd(tr.usd);
  g.font = `800 150px ${DISPLAY}`;
  const fit = Math.min(150, Math.floor((150 * (CARD.w - 140)) / Math.max(1, g.measureText(usdText).width)));       // the $ always fits the card
  txt(usdText, 70, 905, `800 ${fit}px ${DISPLAY}`, tone);
  txt(fmtR(tr.r), 70, 1000, `800 70px ${DISPLAY}`, tone);
  txt(exitLabel(tr.exit.kind).toUpperCase(), CARD.w - 70, 1000, `700 32px ${UI}`, '#aab3d0', 'right');
  const cells = [['MFE', fmtR(tr.mfe_r || 0)], ['MAE', fmtR(-(tr.mae_r || 0))], ['HELD', heldLabel(tr.held_min)], ['SIZE', `${tr.qty} micro${tr.qty === 1 ? '' : 's'}`]];
  cells.forEach(([k, v], i) => {
    const x = 70 + i * 250;
    txt(k, x, 1090, `700 24px ${UI}`, '#8e98b8');
    txt(v, x, 1140, `800 38px ${DISPLAY}`, '#eaf0ff');
  });
  txt('Futures only: TradingView CME NQ1! bars · paper / replay, costs in', 70, 1260, `600 24px ${UI}`, '#6d7694');
  txt('OLYMPUS', CARD.w - 70, 1260, `800 26px ${DISPLAY}`, '#8e98b8', 'right');
  return canvas;
}

export async function shareTrade(tr) {
  try {
    const c = drawCard(document.createElement('canvas'), tr);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return 'failed';
    const name = `odeon-${tr.day}-${setupOf(tr).toLowerCase().replace(/[^a-z0-9]+/g, '')}-${tr.side.toLowerCase()}.png`;
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: `ODEON · ${fmtUsd(tr.usd)} · ${fmtR(tr.r)}` }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'shared'; }
    }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch (e) { return 'failed'; }
}
