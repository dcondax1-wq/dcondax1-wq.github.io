// PLANNER header scene: a small marble sundial on a plain 2D canvas (no 3D library, a few draw calls).
// The shadow of the bronze gnomon follows the New York hour; the inner ring is gold while the bots may enter (02:00 to 15:30).
// LITE or reduced motion: one still picture (redrawn once a minute at most), never an animation loop. Never throws: no canvas means no scene.
const TAU = Math.PI * 2;

/** the shadow's angle on the dial for a time of day: noon points straight at the viewer (down), six hours later a quarter turn */
export function shadowAngle(hours) { return Math.PI / 2 + ((hours - 12) / 12) * Math.PI; }
/** how long the shadow is: short at noon, long at dawn and dusk (0.25 .. 1) */
export function shadowLen(hours) { const d = Math.min(6, Math.abs(hours - 12)) / 6; return 0.25 + 0.75 * d * d; }

export function draw(canvas, hours, opts) {
  const o = opts || {};
  if (!canvas || !canvas.getContext) return false;
  let g = null;
  try { g = canvas.getContext('2d'); } catch (_) { g = null; }
  if (!g) return false;
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H * 0.58, R = W * 0.42, ry = R * 0.5;
  g.clearRect(0, 0, W, H);
  // base: a marble slab with a soft shadow under it
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(cx, cy + 9, R * 1.04, ry * 1.04, 0, 0, TAU); g.fill();
  const slab = g.createLinearGradient(0, cy - ry, 0, cy + ry + 8); slab.addColorStop(0, '#d9cdb8'); slab.addColorStop(1, '#8c806c');
  g.fillStyle = slab; g.beginPath(); g.ellipse(cx, cy + 5, R, ry, 0, 0, TAU); g.fill();
  const top = g.createRadialGradient(cx - R * 0.25, cy - ry * 0.4, 2, cx, cy, R);
  top.addColorStop(0, '#f3ece0'); top.addColorStop(1, '#cfc4b2');
  g.fillStyle = top; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
  g.strokeStyle = '#9c6b3c'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(cx, cy, R * 0.92, ry * 0.92, 0, 0, TAU); g.stroke();
  // the inner ring turns gold while the bots may enter (02:00 to 15:30)
  g.strokeStyle = o.open ? '#c8a24a' : '#b3a68f'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, R * 0.78, ry * 0.78, 0, 0, TAU); g.stroke();
  // hour marks
  g.strokeStyle = '#7a6a52'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), s = Math.sin(a);
    g.beginPath(); g.moveTo(cx + c * R * 0.84, cy + s * ry * 0.84); g.lineTo(cx + c * R * 0.92, cy + s * ry * 0.92); g.stroke();
  }
  // the shadow, then the bronze gnomon on top of it
  const ang = shadowAngle(hours), len = R * 0.86 * shadowLen(hours), sx = cx + Math.cos(ang) * len, sy = cy + Math.sin(ang) * len * 0.5, h = R * 0.62;
  g.fillStyle = 'rgba(40,30,20,.38)'; g.beginPath(); g.moveTo(cx - 2.5, cy); g.lineTo(cx + 2.5, cy); g.lineTo(sx, sy); g.closePath(); g.fill();
  const br = g.createLinearGradient(cx - 5, 0, cx + 5, 0); br.addColorStop(0, '#b98550'); br.addColorStop(1, '#7a4f28');
  g.fillStyle = br; g.beginPath(); g.moveTo(cx - 4, cy + 1); g.lineTo(cx + 4, cy + 1); g.lineTo(cx, cy - h); g.closePath(); g.fill();
  g.fillStyle = '#e0b060'; g.beginPath(); g.arc(cx, cy - h, 2.2, 0, TAU); g.fill();
  // the "now" dot on the dial
  const na = ang - Math.PI; g.fillStyle = o.open ? '#7f8a52' : '#c8a24a'; g.beginPath(); g.arc(cx + Math.cos(na) * R * 0.8, cy + Math.sin(na) * ry * 0.8, 2.6, 0, TAU); g.fill();
  return true;
}

/** mount(canvas, { lite, reduced, now: () => Date, hoursOf: (date) => number }) -> { redraw, stop } ; one picture, refreshed once a minute while the page is open */
export function mount(canvas, opts) {
  const o = opts || {};
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1), css = 84;
  try { canvas.width = css * dpr; canvas.height = css * dpr; canvas.style.width = css + 'px'; canvas.style.height = css + 'px'; } catch (_) { /* keep the size it has */ }
  let timer = 0;
  const redraw = () => { try { const d = o.now ? o.now() : new Date(), h = o.hoursOf ? o.hoursOf(d) : d.getHours() + d.getMinutes() / 60; return draw(canvas, h, { open: h >= 2 && h < 15.5 }); } catch (_) { return false; } };
  const ok = redraw();
  if (ok) timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) redraw(); }, 60000);
  return { ok, redraw, stop: () => clearInterval(timer), still: !!(o.lite || o.reduced) };
}
