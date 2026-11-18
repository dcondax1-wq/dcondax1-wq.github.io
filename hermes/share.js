// HERMES share: a story as a 1080 x 1920 PNG (drawn on a canvas, never a screenshot of the page), then the phone's share
// sheet (Web Share API with a file), else the image opens in a new tab to save.
//   renderPNG(spec, colors)        -> Promise<Blob>   one card: spec {kicker, title, big, tone 'up'|'down'|'flat', lines, foot, spark?}
//   renderWeekPNG(w, key, colors)  -> Promise<Blob>   "Share the week": the whole recap on one image (net, record, best and
//                                                    worst trade, discipline, evals, next goal)
//   share(blob, name)              -> Promise<'shared'|'opened'|'cancelled'|'failed'>
// The image uses the system fonts (no downloads).
import { usd, tone, plural, span, dayLabel } from './data.js';

const W = 1080, H = 1920, L = 96, MW = W - 2 * L;
const SYS = '-apple-system, "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';
const UI = SYS, NUM = `"SF Pro Rounded", ${SYS}`;
const TONE = { up: '#9bab63', down: '#e0907a', flat: '#f3ece0' };

/** Wait (at most ~1.2 s) for the fonts the image uses; a font that never loads leaves the system font. */
async function fonts() {
  if (!document.fonts || !document.fonts.load) return;
  const want = [];
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))), new Promise((ok) => setTimeout(ok, 1200))]);
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function fit(ctx, text, maxW, size, weight, family = NUM) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 6; } while (ctx.measureText(text).width > maxW && s > 40);
}

function spark(ctx, pts, x, y, w, h, color) {
  if (!Array.isArray(pts) || pts.length < 2) return;
  const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
  const P = (p, i) => [x + (i / (pts.length - 1)) * w, y + h - ((p - lo) / r) * h];
  // a soft glow under the line, then the line
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  ctx.beginPath(); pts.forEach((p, i) => { const [px, py] = P(p, i); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color;
  
  ctx.beginPath(); pts.forEach((p, i) => { const [px, py] = P(p, i); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke(); 
}

/** The backdrop every image shares: the card's colours as light, a fine grid, a gold frame, the HERMES mark. */
function backdrop(ctx, colors, label) {
  const [c0, c1, c2] = colors && colors.length === 3 ? colors : ['#19140e', '#4e372a', '#c8a24a'];
  ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.2, H * 0.18, 0, W * 0.2, H * 0.18, H * 0.75);
  g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.9, H * 0.85, 0, W * 0.9, H * 0.85, H * 0.6);
  g.addColorStop(0, c2 + '88'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, 0, W, H);
  // the grid: a futuristic floor that fades out upward
  ctx.save(); ctx.globalAlpha = 0.09; ctx.strokeStyle = '#f3ece0'; ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 90) { ctx.beginPath(); ctx.moveTo(x, H * 0.55); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = H * 0.55; y <= H; y += 90) { ctx.globalAlpha = 0.09 * ((y - H * 0.55) / (H * 0.45)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  // a light sweep across the glass
  g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0.3, 'rgba(243, 236, 224,0)'); g.addColorStop(0.42, 'rgba(243, 236, 224,.07)'); g.addColorStop(0.5, 'rgba(243, 236, 224,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the frame and the mark
  ctx.strokeStyle = 'rgba(200, 162, 74, .55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(40, 40, W - 80, H - 80, 48) : ctx.rect(40, 40, W - 80, H - 80); ctx.stroke();
  ctx.fillStyle = '#c8a24a'; ctx.font = `800 40px ${NUM}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('HERMES', L, 170);
  const mark = ctx.measureText('HERMES').width;
  ctx.globalAlpha = 0.75; ctx.fillStyle = '#f3ece0'; ctx.font = `600 36px ${UI}`;
  ctx.fillText('OLYMPUS WRAPPED' + (label ? ' · ' + String(label).toUpperCase() : ''), L + mark + 24, 168);
  ctx.globalAlpha = 1;
}

function foot(ctx, text) {
  ctx.globalAlpha = 0.7; ctx.fillStyle = '#f3ece0'; ctx.font = `600 34px ${UI}`;
  ctx.fillText(String(text || 'Paper and eval accounts. Real numbers, losses included.'), L, H - 110);
  ctx.globalAlpha = 1;
}

/** The foil finish of every share image: a thin gold frame that catches the light and one soft diagonal sheen across the top. */
function foil(ctx) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(240, 220, 160,.85)'); g.addColorStop(0.5, 'rgba(200, 162, 74,.12)'); g.addColorStop(1, 'rgba(240, 220, 160,.75)');
  ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(34, 34, W - 68, H - 68, 60); else ctx.rect(34, 34, W - 68, H - 68);
  ctx.stroke();
  const s2 = ctx.createLinearGradient(0, 0, W, H * 0.45);
  s2.addColorStop(0, 'rgba(243, 236, 224,0)'); s2.addColorStop(0.5, 'rgba(243, 236, 224,.08)'); s2.addColorStop(1, 'rgba(243, 236, 224,0)');
  ctx.fillStyle = s2; ctx.fillRect(0, 0, W, H * 0.6);
  ctx.restore();
}

export function drawCard(canvas, spec, colors) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  backdrop(ctx, colors);
  foil(ctx);
  ctx.fillStyle = '#f3ece0';
  ctx.globalAlpha = 0.75; ctx.font = `700 40px ${UI}`; ctx.fillText(String(spec.kicker || '').toUpperCase(), L, 270); ctx.globalAlpha = 1;
  ctx.font = `700 100px ${UI}`;
  let y = 520;
  for (const ln of wrap(ctx, spec.title, MW).slice(0, 3)) { ctx.fillText(ln, L, y); y += 108; }
  y += 140;
  const col = TONE[spec.tone] || TONE.flat;
  fit(ctx, String(spec.big || ''), MW, 190, 800);
  ctx.fillStyle = col; ctx.fillText(String(spec.big || ''), L, y); 
  y += 100;
  if (spec.spark) { spark(ctx, spec.spark, L, y, MW, 260, col); y += 360; }
  ctx.fillStyle = '#f3ece0'; ctx.font = `600 52px ${UI}`;
  for (const line of (spec.lines || []).slice(0, 5)) {
    for (const ln of wrap(ctx, line, MW).slice(0, 2)) { if (y > H - 260) break; ctx.fillText(ln, L, y); y += 68; }
    y += 18;
  }
  foot(ctx, spec.foot);
  return canvas;
}

/** The whole period on one image: the money, the record, the best and the worst trade, discipline, evals, the next goal. */
export function drawWeek(canvas, w, key, colors) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), p = w.periods[key] || w.periods.week;
  backdrop(ctx, colors || ['#19140e', '#6f9bb8', '#c8a24a'], p.label);
  foil(ctx);
  let y = 300;
  ctx.fillStyle = '#f3ece0'; ctx.globalAlpha = 0.75; ctx.font = `700 40px ${UI}`;
  ctx.fillText(`${p.label} · ${span(p)}`.toUpperCase(), L, y); ctx.globalAlpha = 1;
  y += 210;
  const col = TONE[tone(p.net)];
  fit(ctx, usd(p.net), MW, 200, 800);
  ctx.fillStyle = col; ctx.fillText(usd(p.net), L, y); 
  y += 90;
  ctx.fillStyle = '#f3ece0'; ctx.font = `600 50px ${UI}`;
  ctx.fillText(`${plural(p.trades, 'trade')} · ${p.wins} won · ${p.losses} lost${p.win_pct != null ? ` · ${p.win_pct}%` : ''}`, L, y);
  y += 70;
  ctx.globalAlpha = 0.75; ctx.font = `600 42px ${UI}`;
  ctx.fillText(`${usd(p.per_month, { cents: false })} a month at this pace`, L, y); ctx.globalAlpha = 1;
  // tiles: best, worst, discipline, eval
  const tiles = [];
  if (p.best) tiles.push(['Best trade', usd(p.best.pnl), `${p.best.bot} · ${dayLabel(p.best.day)}`, 'up']);
  if (p.worst) tiles.push(['Worst trade', usd(p.worst.pnl), `${p.worst.bot} · ${dayLabel(p.worst.day)}`, 'down']);
  if (p.discipline && p.discipline.score != null) tiles.push(['Discipline', `${p.discipline.score}/100`, `${p.discipline.kept} of ${p.discipline.checked} checks kept`, p.discipline.score >= 90 ? 'up' : 'flat']);
  const E = (w.eval || [])[0];
  if (E) tiles.push(['Road to funded', `${Math.round(E.progress * 100)}%`, `${E.bot} · ${E.plan || E.name}`, E.progress >= 1 ? 'up' : 'flat']);
  y += 90;
  const tw = (MW - 30) / 2, th = 250;
  tiles.slice(0, 4).forEach(([label, big, sub, t], i) => {
    const x = L + (i % 2) * (tw + 30), ty = y + Math.floor(i / 2) * (th + 30);
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.strokeStyle = 'rgba(243, 236, 224,.16)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, ty, tw, th, 32) : ctx.rect(x, ty, tw, th); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f3ece0'; ctx.globalAlpha = 0.7; ctx.font = `700 32px ${UI}`; ctx.fillText(label.toUpperCase(), x + 32, ty + 62); ctx.globalAlpha = 1;
    fit(ctx, big, tw - 64, 76, 800);
    ctx.fillStyle = TONE[t] || TONE.flat; ctx.fillText(big, x + 32, ty + 152);
    ctx.fillStyle = '#f3ece0'; ctx.globalAlpha = 0.8; ctx.font = `600 32px ${UI}`;
    ctx.fillText(wrap(ctx, sub, tw - 64)[0] || '', x + 32, ty + 210); ctx.globalAlpha = 1;
  });
  y += 2 * (th + 30) + 70;
  if (w.next && w.next.goal) {
    ctx.fillStyle = '#c8a24a'; ctx.font = `700 36px ${UI}`; ctx.fillText("NEXT WEEK'S ONE GOAL", L, y); y += 74;
    ctx.fillStyle = '#f3ece0'; ctx.font = `700 60px ${UI}`;
    for (const ln of wrap(ctx, w.next.goal, MW).slice(0, 2)) { ctx.fillText(ln, L, y); y += 70; }
  }
  foot(ctx, w.demo ? 'DEMO data. Paper and eval accounts, losses included.' : null);
  return canvas;
}

const toBlob = (c) => new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('no image'))), 'image/png'));

export async function renderPNG(spec, colors) {
  await fonts();
  return toBlob(drawCard(document.createElement('canvas'), spec, colors));
}

export async function renderWeekPNG(w, key, colors) {
  await fonts();
  return toBlob(drawWeek(document.createElement('canvas'), w, key, colors));
}

export async function share(blob, name = 'olympus-wrapped.png') {
  let file = null;
  try { file = new File([blob], name, { type: 'image/png' }); } catch (_) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: 'OLYMPUS Wrapped' }); return 'shared'; } catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'failed'; }
  }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else {                                                   // pop-up blocked: a download link
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
  return 'opened';
}
