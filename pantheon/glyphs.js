// PANTHEON emblems: each god's symbol drawn as glowing strokes on a 2D canvas (no images, no emoji fonts).
// draw(ctx, key, size): the caller sets strokeStyle / fillStyle / shadow; the emblem fits a size x size box.
const P = {
  trident(x, s) {          // POSEIDON
    x.beginPath();
    x.moveTo(s * .5, s * .92); x.lineTo(s * .5, s * .22);
    x.moveTo(s * .26, s * .2); x.quadraticCurveTo(s * .26, s * .5, s * .5, s * .52); x.quadraticCurveTo(s * .74, s * .5, s * .74, s * .2);
    x.stroke();
    for (const cx of [.26, .5, .74]) { x.beginPath(); x.moveTo(s * (cx - .06), s * .24); x.lineTo(s * cx, s * .08); x.lineTo(s * (cx + .06), s * .24); x.stroke(); }
  },
  bolt(x, s) {             // ZEUS
    x.beginPath();
    x.moveTo(s * .6, s * .06); x.lineTo(s * .28, s * .52); x.lineTo(s * .5, s * .52); x.lineTo(s * .38, s * .94);
    x.lineTo(s * .74, s * .42); x.lineTo(s * .52, s * .42); x.closePath();
    x.fill(); x.stroke();
  },
  sword(x, s) {            // ARES
    x.beginPath();
    x.moveTo(s * .5, s * .06); x.lineTo(s * .58, s * .18); x.lineTo(s * .58, s * .66); x.lineTo(s * .42, s * .66); x.lineTo(s * .42, s * .18); x.closePath();
    x.stroke();
    x.beginPath(); x.moveTo(s * .26, s * .68); x.lineTo(s * .74, s * .68); x.moveTo(s * .5, s * .68); x.lineTo(s * .5, s * .88); x.stroke();
    x.beginPath(); x.arc(s * .5, s * .91, s * .04, 0, Math.PI * 2); x.fill();
  },
  owl(x, s) {              // ATHENA
    x.beginPath(); x.ellipse(s * .5, s * .56, s * .27, s * .34, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(s * .28, s * .3); x.lineTo(s * .3, s * .14); x.lineTo(s * .4, s * .26);
    x.moveTo(s * .72, s * .3); x.lineTo(s * .7, s * .14); x.lineTo(s * .6, s * .26); x.stroke();
    for (const cx of [.39, .61]) { x.beginPath(); x.arc(s * cx, s * .42, s * .09, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(s * cx, s * .42, s * .03, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.moveTo(s * .46, s * .52); x.lineTo(s * .5, s * .6); x.lineTo(s * .54, s * .52); x.stroke();
  },
  wheat(x, s) {            // DEMETER
    x.beginPath(); x.moveTo(s * .5, s * .94); x.quadraticCurveTo(s * .5, s * .5, s * .5, s * .1); x.stroke();
    for (let i = 0; i < 4; i++) {
      const y = s * (.2 + i * .16);
      for (const d of [-1, 1]) { x.beginPath(); x.ellipse(s * (.5 + d * .1), y, s * .05, s * .1, d * .6, 0, Math.PI * 2); x.fill(); }
    }
  },
  sun(x, s) {              // HELIOS
    x.beginPath(); x.arc(s * .5, s * .5, s * .18, 0, Math.PI * 2); x.fill(); x.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, r0 = s * .27, r1 = s * (i % 2 ? .38 : .45);
      x.beginPath(); x.moveTo(s * .5 + Math.cos(a) * r0, s * .5 + Math.sin(a) * r0); x.lineTo(s * .5 + Math.cos(a) * r1, s * .5 + Math.sin(a) * r1); x.stroke();
    }
  },
  moon(x, s) {             // NYX
    x.beginPath(); x.arc(s * .5, s * .5, s * .36, Math.PI * .32, Math.PI * 1.68, false);
    x.arc(s * .64, s * .42, s * .3, Math.PI * 1.5, Math.PI * .62, true); x.closePath(); x.fill(); x.stroke();
    for (const [cx, cy, r] of [[.78, .2, .03], [.86, .4, .02], [.7, .78, .025]]) { x.beginPath(); x.arc(s * cx, s * cy, s * r, 0, Math.PI * 2); x.fill(); }
  },
  bow(x, s) {              // ARTEMIS
    x.beginPath(); x.moveTo(s * .3, s * .1); x.quadraticCurveTo(s * .86, s * .5, s * .3, s * .9); x.stroke();
    x.beginPath(); x.moveTo(s * .3, s * .1); x.lineTo(s * .3, s * .9); x.stroke();
    x.beginPath(); x.moveTo(s * .14, s * .5); x.lineTo(s * .8, s * .5); x.stroke();
    x.beginPath(); x.moveTo(s * .86, s * .5); x.lineTo(s * .76, s * .44); x.lineTo(s * .76, s * .56); x.closePath(); x.fill();
  },
};

export function drawGlyph(ctx, key, size) {
  ctx.save();
  ctx.lineWidth = Math.max(2, size * 0.045); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  (P[key] || P.sun)(ctx, size);
  ctx.restore();
}

export const GLYPHS = Object.keys(P);
