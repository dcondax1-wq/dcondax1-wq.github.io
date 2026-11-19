/* OLYMPUS entry v3 (night-intro3 2026-11-18, owner: the entry "looks wrong / cheap"). A film-title opening in 2.2 s:
 * a night storm over a sea of clouds (three layers of procedural clouds on two perspective planes that meet at the horizon, so
 * they recede for real), a branching lightning bolt drawn from scratch every launch, a full-screen flash that lights the clouds
 * and the temple, the gold temple of the Home Screen icon lit like metal (bevelled bars, fluted columns, a cool flash light, a
 * specular sweep, warm light through the colonnade), gold sparks and embers, OLYMPUS in Roman capitals (Cinzel, SIL OFL 1.1:
 * its seven outlines below, so it is the same on every phone and needs no font file), then the clouds clear onto the home.
 *
 * How it stays smooth on an iPhone while Jarvis starts underneath (Jarvis's start holds the main thread for ~1 s here): every
 * picture is drawn ONCE, up front, into small canvases (the clouds at half the screen's resolution: they are soft), and all the
 * motion is CSS transform / opacity through the Web Animations API, which the phone runs off the main thread (Core Animation).
 * Nothing is drawn per frame; a busy page can delay the start of the film by a frame, never stutter it. No WebGL, no font file.
 * Canvases are capped at 2x device pixels and freed at the end. One tap skips (the olympus-intro script).
 *
 * Loaded by jarvis/index.html as <script src="entry.js" defer> right after the intro's overlay: a deferred file runs once the page is
 * parsed and BEFORE Jarvis's own module (document order), so it is drawn before Jarvis's start takes the main thread. The overlay, its
 * deadlines and the skip stay inline in the page (the olympus-intro script): it waits for this file (window.__olyEntryReady), at most
 * 1.2 s, then shows a plain still instead.
 *   window.__olyEntry.build(host, mode, opt) -> { end, out, anims, n, ms, hold(t), free() }     (end / out: ms on its clock)
 *   mode 'mark' = the animated entry; anything else = its last frame, still (reduce motion: calm; the quick versions: off, fade)
 */
(function () {
  'use strict';
  var W = window, doc = document;
  // OLYMPUS in Cinzel 500 (c) 2020 The Cinzel Project Authors, SIL Open Font License 1.1 (jarvis/OFL.txt): [advance, left, right, outline],
  // 1000 units, baseline 0
  var GL = {O:[852,63,805,'M433 -714Q545 -714 628 -669Q712 -624 758 -542Q805 -460 805 -350Q805 -240 758 -158Q712 -76 628 -31Q545 14 433 14Q323 14 240 -31Q156 -76 110 -158Q63 -240 63 -350Q63 -460 110 -542Q156 -624 240 -669Q323 -714 433 -714ZM433 -20Q514 -20 573 -61Q632 -102 665 -176Q698 -250 698 -350Q698 -450 665 -524Q632 -598 573 -639Q514 -680 433 -680Q354 -680 294 -639Q235 -598 202 -524Q169 -450 169 -350Q169 -250 202 -176Q235 -102 294 -61Q354 -20 433 -20Z'],L:[580,54,557,'M224 -700V0H131V-700ZM492 -35 500 0H221V-35ZM557 -176 503 0H327L363 -35Q415 -35 450 -52Q485 -70 508 -102Q531 -134 547 -176ZM134 -73V0H54V-10Q54 -10 60 -10Q67 -10 67 -10Q93 -10 112 -28Q130 -47 131 -73ZM134 -627H131Q130 -653 112 -672Q93 -690 67 -690Q67 -690 60 -690Q54 -690 54 -690V-700H134ZM221 -627V-700H301V-690Q300 -690 294 -690Q288 -690 288 -690Q262 -690 244 -672Q225 -653 224 -627Z'],Y:[675,-17,693,'M171 -699 370 -332 294 -304 57 -699ZM381 -322V0H288V-322ZM553 -699H620L373 -301L332 -312ZM512 -628Q521 -642 517 -656Q513 -671 502 -680Q491 -690 477 -690Q477 -690 471 -690Q465 -690 465 -690V-700H693V-690H679Q648 -690 621 -672Q594 -654 578 -631ZM209 -628 97 -631Q83 -654 56 -672Q29 -690 -3 -690H-17V-700H257V-690Q257 -690 250 -690Q244 -690 244 -690Q222 -690 210 -670Q199 -649 209 -628ZM290 -73V0H211V-10Q211 -10 217 -10Q223 -10 224 -10Q250 -10 268 -28Q287 -47 288 -73ZM378 -73H381Q381 -47 400 -28Q419 -10 445 -10Q445 -10 451 -10Q457 -10 457 -10V0H378Z'],M:[938,7,932,'M754 -714 762 -633 496 -89Q496 -89 488 -72Q479 -54 470 -30Q462 -6 460 16H450L428 -55ZM118 -73V0H7V-10Q8 -10 16 -10Q23 -10 23 -10Q50 -10 71 -26Q92 -43 96 -73ZM152 -57Q152 -56 152 -55Q152 -54 152 -52Q152 -36 164 -22Q175 -9 191 -9H206V0H145V-57ZM174 -714H183L208 -641L147 0H87ZM183 -714 484 -120 450 16 162 -560ZM763 -714 852 0H746L693 -557L754 -714ZM822 -73H843Q848 -43 869 -26Q890 -10 916 -10Q916 -10 924 -10Q932 -10 932 -10V0H822ZM741 -57H748V0H687V-9H702Q719 -9 730 -22Q741 -36 741 -52Q741 -54 741 -55Q741 -56 741 -57Z'],P:[603,55,560,'M212 -700H340Q412 -700 460 -676Q509 -653 534 -610Q560 -566 560 -507Q561 -460 542 -422Q524 -383 493 -357Q462 -331 422 -318Q383 -306 341 -310Q299 -314 259 -337V-347Q259 -347 274 -346Q290 -344 314 -346Q339 -348 366 -358Q392 -368 416 -392Q439 -416 451 -457Q454 -469 456 -486Q458 -502 457 -517Q456 -584 422 -625Q387 -666 324 -666H222Q222 -666 220 -674Q217 -683 214 -692Q212 -700 212 -700ZM225 -700V0H132V-700ZM135 -73V0H55V-10Q55 -10 62 -10Q68 -10 68 -10Q94 -10 112 -28Q131 -47 132 -73ZM135 -627H132Q132 -653 113 -672Q94 -690 68 -690Q68 -690 62 -690Q56 -690 56 -690L55 -700H135ZM222 -73H225Q226 -47 244 -28Q263 -10 289 -10Q290 -10 296 -10Q302 -10 302 -10V0H222Z'],U:[797,46,753,'M208 -700V-260Q208 -188 234 -134Q259 -80 306 -50Q352 -21 414 -21Q479 -21 528 -49Q576 -77 602 -128Q629 -179 629 -247V-700H684V-249Q684 -170 650 -111Q617 -52 554 -19Q492 14 408 14Q317 14 251 -18Q185 -51 150 -110Q115 -169 115 -248V-700ZM118 -700V-640H115Q115 -662 100 -676Q84 -690 62 -690Q62 -690 54 -690Q46 -690 46 -690V-700ZM277 -700V-690Q277 -690 269 -690Q261 -690 261 -690Q239 -690 224 -676Q208 -662 208 -640H206V-700ZM632 -700V-640H629Q629 -662 614 -676Q598 -690 576 -690Q576 -690 568 -690Q560 -690 560 -690V-700ZM753 -700V-690Q753 -690 745 -690Q737 -690 737 -690Q715 -690 700 -676Q684 -662 684 -640H682V-700Z'],S:[509,55,456,'M260 -714Q277 -714 299 -712Q321 -710 344 -706Q366 -703 384 -700Q401 -696 409 -692L405 -573H396Q396 -622 361 -651Q326 -680 273 -680Q217 -680 182 -648Q148 -615 148 -571Q147 -549 160 -524Q172 -500 198 -479L393 -316Q428 -289 442 -254Q457 -218 456 -180Q454 -92 397 -39Q340 14 243 14Q212 14 176 8Q141 2 110 -10Q79 -23 60 -43Q55 -61 56 -88Q56 -114 62 -142Q67 -170 76 -192H85Q80 -141 100 -101Q119 -61 156 -40Q194 -18 243 -20Q302 -22 340 -56Q379 -91 379 -147Q379 -176 366 -200Q353 -224 326 -243L140 -401Q102 -429 86 -467Q70 -505 72 -543Q74 -588 96 -628Q118 -667 160 -690Q201 -714 260 -714ZM409 -704V-683H319V-704Z']};
  var KERN = { OL: -20, LY: -105, YM: -21 };
  // the entry's clock (ms): the sky comes up, a far flicker, the strike, the temple lights, the word, the clouds clear onto Jarvis
  var T = { flick: 140, lead: 330, strike: 440, warm: 510, sweep: 760, word: 640, rule: 1000, tag: 1120, glint: 1180, out: 1720, end: 2220 };

  function rng(s) {
    s = s >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var sm = function (a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  function el(tag, cls, css, parent) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  // a canvas of CSS size w x h at s device pixels per CSS pixel, placed at (x, y) in the scene
  function cnv(parent, x, y, w, h, s) {
    var c = el('canvas', 'oly-2d', 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px', parent);
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var g = c.getContext('2d');
    if (!g) throw new Error('no 2d canvas');
    g.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
    c.g = g;
    return c;
  }

  // ------------------------------------------------------------------------------------------- clouds
  // value noise on a 256 x 256 lattice, fbm by octaves; the planes are sampled in perspective: z = 1 / (distance to the horizon)
  function lattice(r) { var a = new Float32Array(65536); for (var i = 0; i < 65536; i++) a[i] = r(); return a; }
  function fbm(P, x, y, oct) {
    var s = 0, a = 0.5, n = 0;
    for (var o = 0; o < oct; o++) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var x0 = xi & 255, y0 = (yi & 255) << 8, x1 = (x0 + 1) & 255, y1 = ((yi + 1) & 255) << 8;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var A = P[y0 + x0], B = P[y0 + x1], C = P[y1 + x0], D = P[y1 + x1];
      s += a * (A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v);
      n += a; a *= 0.5; x = x * 2.03 + 19.1; y = y * 2.03 + 7.7;
    }
    return s / n;
  }
  // one cloud plane's density on a w x h grid (cell CSS px each), above (deck) and below (sea) the horizon hz. A real plane in
  // perspective (z = 1 / height above the horizon) converges on the vanishing point like a zoom blur on a phone's wide screen, so
  // the sideways scale follows z^p (p < 1: a longer lens), and a low octave bends the coordinates (billows, not streaks)
  function plane(P, w, h, cell, hz, vw, vh, sp) {
    var D = new Float32Array(w * h);
    for (var j = 0; j < h; j++) {
      var y = (j + 0.5) * cell, up = y < hz, dy = Math.abs(y - hz) / vh, s = up ? sp.deck : sp.sea, yf = y / vh;
      if (!s || dy < 0.003 || dy > s.reach || yf < (s.y0 || 0) || yf > (s.y1 || 1)) continue;
      var z = 1 / (dy + s.z0), zu = Math.pow(z, s.p) * s.su / vw, v = z * s.sv + s.ov, row = j * w;
      for (var i = 0; i < w; i++) {
        var u = ((i + 0.5) * cell - vw / 2) * zu + s.ou, q = fbm(P, u * 0.45 + 31.7, v * 0.45 + 5.3, 2) - 0.5;
        D[row + i] = fbm(P, u + q * s.wp, v + q * s.wp * 0.6, s.oct);
      }
    }
    return D;
  }

  // ------------------------------------------------------------------------------------------- the bolt
  // midpoint displacement: a jagged channel from a to b (2^lv segments), then branches that fork off its upper two thirds
  function channel(r, a, b, lv, rough) {
    var pts = [a, b], d = Math.hypot(b[0] - a[0], b[1] - a[1]) * rough;
    for (var l = 0; l < lv; l++) {
      var nx = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
        var g = (r() + r() + r() - 1.5) * 1.2 * d;
        nx.push([mx - dy / len * g, my + dx / len * g], q);
      }
      pts = nx; d *= 0.52;
    }
    return pts;
  }
  function bolt(r, a, b) {
    var main = channel(r, a, b, 7, 0.16), paths = [{ p: main, w: 1, k: 1 }], n = main.length;
    var forks = 5 + Math.floor(r() * 3);
    for (var f = 0; f < forks; f++) {
      var i = Math.floor(n * (0.12 + 0.62 * (f + r() * 0.8) / forks)), s = main[i], nx = main[Math.min(n - 1, i + 6)];
      var ang = Math.atan2(nx[1] - s[1], nx[0] - s[0]) + (r() < 0.5 ? -1 : 1) * (0.42 + r() * 0.5);
      var len = Math.hypot(b[0] - s[0], b[1] - s[1]) * (0.28 + r() * 0.3) * (1 - i / n * 0.5);
      var br = channel(r, s, [s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len], 5, 0.22);
      paths.push({ p: br, w: 0.55, k: 0.5 + r() * 0.25, taper: true });
      if (r() < 0.55) {
        var j = Math.floor(br.length * (0.3 + r() * 0.3)), t = br[j], a2 = ang + (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.4), l2 = len * (0.3 + r() * 0.25);
        paths.push({ p: channel(r, t, [t[0] + Math.cos(a2) * l2, t[1] + Math.sin(a2) * l2], 4, 0.25), w: 0.35, k: 0.32, taper: true });
      }
    }
    return paths;
  }
  function strokeBolt(g, paths, passes) {
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (var s = 0; s < passes.length; s++) {
      var ps = passes[s];
      for (var i = 0; i < paths.length; i++) {
        var P = paths[i], pts = P.p, parts = P.taper ? 4 : 1, per = Math.ceil((pts.length - 1) / parts);
        for (var c = 0; c < parts; c++) {
          var f = P.taper ? 1 - c / parts * 0.72 : 1;
          g.strokeStyle = 'rgba(' + ps[2] + ',' + (ps[1] * P.k * (P.taper ? 0.55 + 0.45 * f : 1)).toFixed(3) + ')';
          g.lineWidth = Math.max(0.35, ps[0] * P.w * f);
          g.beginPath();
          var k0 = c * per, k1 = Math.min(pts.length - 1, k0 + per);
          g.moveTo(pts[k0][0], pts[k0][1]);
          for (var k = k0 + 1; k <= k1; k++) g.lineTo(pts[k][0], pts[k][1]);
          g.stroke();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------------------------------- the temple (the Home Screen icon's shapes)
  // icon units: x 174..850, y 226..808. Bars [x, y, w, h, kind]; the pediment is a triangle with a triangular opening.
  var BARS = [[194, 408, 636, 44, 'h'], [245, 474, 84, 22, 'h'], [395, 474, 84, 22, 'h'], [545, 474, 84, 22, 'h'], [695, 474, 84, 22, 'h'],
    [256, 496, 62, 196, 'c'], [406, 496, 62, 196, 'c'], [556, 496, 62, 196, 'c'], [706, 496, 62, 196, 'c'], [214, 712, 596, 38, 'h'], [174, 768, 676, 40, 'h']];
  var PED = [[512, 226], [830, 392], [194, 392]], HOLE = [[512, 282], [728, 362], [296, 362]];
  function tri(g, t, X, Y) { g.beginPath(); g.moveTo(X(t[0][0]), Y(t[0][1])); g.lineTo(X(t[1][0]), Y(t[1][1])); g.lineTo(X(t[2][0]), Y(t[2][1])); g.closePath(); }
  // a triangle moved in (d > 0) or out (d < 0) by d along its sides' normals (icon units)
  function inset(t, d) {
    var cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    return t.map(function (p) { var dx = cx - p[0], dy = cy - p[1], l = Math.hypot(dx, dy); return [p[0] + dx / l * d * 2.1, p[1] + dy / l * d * 2.1]; });
  }
  function lin(g, x0, y0, x1, y1, stops) { var gr = g.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  // gold leaf, and the same metal by moonlight before the strike: rim (the bevel), face, column (a cylinder), the opening's bevel, flutes
  var GOLD = { rim: [0, '#fff4d4', 0.16, '#e9c477', 0.55, '#a8762a', 1, '#4a2e0b'], face: [0, '#fbe3a6', 0.22, '#f0c873', 0.5, '#d29e45', 0.82, '#a87529', 1, '#c18f3e'],
    col: [0, '#5e3d10', 0.12, '#a87a30', 0.3, '#f6dc9a', 0.4, '#ffeec4', 0.52, '#e2b55e', 0.78, '#a27026', 1, '#553608'], hole: [0, '#3c2507', 0.45, '#7a5119', 1, '#f2d38c'],
    dk: '58,36,8', lt: '255,240,205', sh: '40,24,4' };
  var COLD = { rim: [0, '#b4bddc', 0.16, '#717a9c', 0.55, '#2c3250', 1, '#0b0d18'], face: [0, '#8f99bd', 0.22, '#636c8e', 0.5, '#3e4566', 0.82, '#262b42', 1, '#383e5a'],
    col: [0, '#131726', 0.12, '#2b3150', 0.3, '#7e88ae', 0.4, '#9ca6ca', 0.52, '#4c5578', 0.78, '#262b44', 1, '#0f1220'], hole: [0, '#06070d', 0.45, '#191d2e', 1, '#707aa2'],
    dk: '5,6,14', lt: '175,185,225', sh: '4,5,10' };
  function temple(g, X, Y, k, pal, lit) {
    var b = 2.4;                                                     // the bevel, in icon units (about 0.65 px on a 183 px temple)
    // the pediment: rim, face, the opening's bevel, the opening
    var o = PED, f = inset(PED, b), h2 = inset(HOLE, -b);
    tri(g, o, X, Y); g.fillStyle = lit ? lin(g, 0, Y(226), 0, Y(392), [0, 'rgba(236,243,255,.95)', 1, 'rgba(200,214,255,.25)']) : lin(g, 0, Y(226), 0, Y(392), pal.rim); g.fill();
    tri(g, f, X, Y); g.fillStyle = lit ? lin(g, 0, Y(226), 0, Y(392), [0, 'rgba(225,235,255,.7)', 1, 'rgba(190,205,255,.12)']) : lin(g, 0, Y(232), 0, Y(390), pal.face); g.fill();
    if (!lit) { tri(g, h2, X, Y); g.fillStyle = lin(g, 0, Y(276), 0, Y(366), pal.hole); g.fill(); }
    g.save(); g.globalCompositeOperation = 'destination-out'; tri(g, HOLE, X, Y); g.fill(); g.restore();
    for (var i = 0; i < BARS.length; i++) {
      var r = BARS[i], x0 = X(r[0]), y0 = Y(r[1]), w = r[2] * k, hh = r[3] * k, bb = b * k;
      if (lit) {
        g.fillStyle = lin(g, 0, y0, 0, y0 + hh, r[4] === 'c' ? [0, 'rgba(225,235,255,.55)', 0.25, 'rgba(210,222,255,.16)', 1, 'rgba(200,214,255,.04)'] : [0, 'rgba(240,246,255,.95)', 0.5, 'rgba(210,222,255,.3)', 1, 'rgba(200,214,255,.08)']);
        g.fillRect(x0, y0, w, hh);
        continue;
      }
      g.fillStyle = lin(g, 0, y0, 0, y0 + hh, pal.rim); g.fillRect(x0, y0, w, hh);
      if (r[4] === 'c') {
        g.fillStyle = lin(g, x0 + bb, 0, x0 + w - bb, 0, pal.col); g.fillRect(x0 + bb, y0, w - 2 * bb, hh);
        for (var q = 1; q < 4; q++) {                                   // three flutes: a groove and its lit lip
          var fx = x0 + w * q / 4;
          g.fillStyle = 'rgba(' + pal.dk + ',' + (q === 1 ? 0.22 : 0.3) + ')'; g.fillRect(fx - 0.45, y0 + bb, 0.9, hh - 2 * bb);
          g.fillStyle = 'rgba(' + pal.lt + ',' + (q === 1 ? 0.3 : 0.16) + ')'; g.fillRect(fx + 0.45, y0 + bb, 0.6, hh - 2 * bb);
        }
        g.fillStyle = lin(g, 0, y0, 0, y0 + hh, [0, 'rgba(' + pal.sh + ',.45)', 0.08, 'rgba(' + pal.sh + ',0)', 0.9, 'rgba(' + pal.sh + ',0)', 1, 'rgba(' + pal.sh + ',.35)']);
        g.fillRect(x0, y0, w, hh);
      } else {
        g.fillStyle = lin(g, 0, y0 + bb, 0, y0 + hh - bb, pal.face); g.fillRect(x0 + bb, y0 + bb, w - 2 * bb, hh - 2 * bb);
      }
    }
  }
  function maskSvg(vbw, vbh, d) {
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vbw + ' ' + vbh + '"><path fill-rule="evenodd" d="' + d + '"/></svg>') + '")';
  }

  // ------------------------------------------------------------------------------------------- cloud colour
  // a layer's pixels from its density: cover(up, dz, d, yf, x) -> 0..1; the deck's under sides and the sea's tops catch light;
  // thick parts stay dark; near the temple the sea is warm. Returns its canvas (in `parent`, or loose) with .cov and .edge kept.
  var CTX = null;
  function shade(D, w, h, cell, parent, cover, col) {
    var c = cnv(parent, 0, 0, w * cell, h * cell, 1 / cell), g = c.g, im = g.createImageData(w, h), p = im.data;
    var cov = new Float32Array(w * h), edg = new Float32Array(w * h), X0 = CTX, vw = X0.vw, vh = X0.vh, hz = X0.hz, ax = X0.ax;
    var wc = new Float32Array(w);
    for (var i = 0; i < w; i++) { var e = ((i + 0.5) * cell - ax) / (vw * 0.4); wc[i] = 1 / (1 + e * e * 1.6); }
    var B = col.base, L = col.lit, Wm = col.warm, k = col.k, al = (col.a || 1) * 255;
    for (var j = 0; j < h; j++) {
      var y = (j + 0.5) * cell, dyh = (y - hz) / vh, up = dyh < 0, dz = up ? -dyh : dyh, yf = y / vh, wr = up ? 0.25 * cl(1 - dz / 0.12) : cl(1 - dz / 0.2);
      for (var i2 = 0; i2 < w; i2++) {
        var o = j * w + i2, d = D[o];
        if (!d) continue;
        var cv = cover(up, dz, d, yf, (i2 + 0.5) * cell);
        if (cv < 0.004) continue;
        var dn = j > 0 ? D[o - w] || d : d, ds = j < h - 1 ? D[o + w] || d : d, ed = cl(0.5 + (up ? dn - ds : ds - dn) * k);
        var th = sm(0.55, 0.85, d), lt = ed * ed * (1 - th * 0.7), wm = wr * wc[i2] * wc[i2];
        var q = o * 4;
        cov[o] = cv; edg[o] = ed;
        p[q] = B[0] * (1 - th * 0.4) + L[0] * lt + Wm[0] * wm; p[q + 1] = B[1] * (1 - th * 0.4) + L[1] * lt + Wm[1] * wm; p[q + 2] = B[2] * (1 - th * 0.4) + L[2] * lt + Wm[2] * wm;
        p[q + 3] = al * cv;
      }
    }
    g.putImageData(im, 0, 0);
    c.cov = cov; c.edge = edg;
    return c;
  }

  // ------------------------------------------------------------------------------------------- build
  function build(host, mode, opt) {
    opt = opt || {};
    var t0 = W.performance && performance.now ? performance.now() : Date.now();
    var vw = Math.max(280, W.innerWidth || 390), vh = Math.max(400, W.innerHeight || 844);
    var dpr = Math.min(2, W.devicePixelRatio || 1), still = mode !== 'mark';
    if (!W.Path2D) throw new Error('no Path2D');
    var R = rng(opt.seed || 20261118), RB = rng(opt.bolt || (Date.now() % 997) + 1);
    var anims = [], cvs = [];
    var can = function (p, x, y, w, h, s) { var c = cnv(p, x, y, w, h, s); cvs.push(c); return c; };
    var A = function (e, frames, dur, delay, ease, fill) {
      if (still || !e.animate) return null;
      var a = e.animate(frames, { duration: dur, delay: delay || 0, easing: ease || 'linear', fill: fill || 'both' });
      anims.push(a); return a;
    };
    // ---- layout (CSS px): the apex is where the bolt lands; the composition sits a little above the middle
    var tw = Math.round(Math.min(vw * 0.47, vh * 0.235, 236)), k = tw / 676, th = 582 * k;
    var ax = Math.round(vw / 2), ay = Math.round(vh * 0.335), base = ay + th, hz = base + 3;
    var X = function (u) { return ax + (u - 512) * k; }, Y = function (v) { return ay + (v - 226) * k; };
    var trk = 280, wordU = 4692 + 6 * trk, fs = Math.min(vw * 0.74, tw * 1.52) / (wordU / 1000), cap = fs * 0.7;
    var wy = Math.round(base + Math.max(22, th * 0.17) + cap);         // the word's baseline
    var ry = Math.round(wy + Math.max(15, cap * 0.62)), ty = Math.round(ry + 15);

    CTX = { vw: vw, vh: vh, hz: hz, ax: ax };
    var stage = el('div', 'oly-s', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px;overflow:hidden;contain:strict;background:#04050b;pointer-events:none');
    host.appendChild(stage);
    var sc = el('div', 'oly-rig', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px', stage);      // the camera rig: every layer

    // ---- 1. the sky: a low-res gradient (ink above, a violet haze at the horizon, warm light behind the temple), the far clouds over it,
    //         then a faint grain so no gradient bands (one canvas at 1 CSS px; the clouds are drawn at a third / half of that: they are soft)
    var P = lattice(R), RN = rng(77);
    var sky = can(sc, 0, 0, vw, vh, 1), sg = sky.g;
    var gs = cnv(null, 0, 0, vw, vh, 0.125), gsg = gs.g, gi = gsg.createImageData(gs.width, gs.height), gp = gi.data, gw0 = gs.width, gh0 = gs.height;
    for (var j = 0; j < gh0; j++) {
      var y = (j + 0.5) * vh / gh0, dyh = (y - hz) / vh, t = cl(1 - Math.abs(dyh) / 0.62), t2 = t * t * t;
      for (var i = 0; i < gw0; i++) {
        var ex = ((i + 0.5) * vw / gw0 - ax) / vw, hg = Math.exp(-ex * ex / 0.05 - dyh * dyh / 0.0022) + 0.4 * Math.exp(-ex * ex / 0.4 - dyh * dyh / 0.03);
        var q = (j * gw0 + i) * 4;
        gp[q] = 4 + 26 * t2 + 80 * hg; gp[q + 1] = 5 + 20 * t2 + 44 * hg; gp[q + 2] = 12 + 44 * t2 + 40 * hg; gp[q + 3] = 255;
      }
    }
    gsg.putImageData(gi, 0, 0);
    sg.imageSmoothingEnabled = true; sg.drawImage(gs, 0, 0, vw, vh);
    var c3 = Math.max(3, Math.max(vw, vh) / 290), w3 = Math.round(vw / c3), h3 = Math.round(vh / c3);
    var Df = plane(P, w3, h3, c3, hz, vw, vh, {
      deck: { reach: 0.66, z0: 0.08, su: 3.0, sv: 1.3, p: 0.6, ou: 3.1, ov: 1.7, oct: 4, wp: 1.2 },
      sea: { reach: 0.7, z0: 0.03, su: 2.4, sv: 1.5, p: 0.7, ou: 8.3, ov: 2.2, oct: 4, wp: 1.0 } });
    var cf = shade(Df, w3, h3, c3, null, function (up, dz, d) {
      return up ? sm(0.5, 0.72, d + 0.1 - 0.25 * sm(0.3, 0.02, dz)) * sm(0.004, 0.05, dz) * 0.8 : sm(0.47, 0.7, d) * sm(0.003, 0.04, dz) * 0.75;
    }, { base: [16, 17, 34], lit: [44, 42, 78], warm: [70, 44, 30], k: 7 });
    sg.drawImage(cf, 0, 0, vw, vh);
    var gr0 = cnv(null, 0, 0, 96, 96, 1), grg = gr0.g, gri = grg.createImageData(96, 96);
    for (var n = 0; n < gri.data.length; n += 4) { var v0 = RN() * 255; gri.data[n] = gri.data[n + 1] = gri.data[n + 2] = v0; gri.data[n + 3] = 9; }
    grg.putImageData(gri, 0, 0);
    sg.fillStyle = sg.createPattern(gr0, 'repeat'); sg.fillRect(0, 0, vw, vh);
    cf.width = cf.height = gs.width = gs.height = gr0.width = gr0.height = 0;

    // ---- 2. the main clouds (the storm deck + the cloud sea, half res) and 3. the near clouds (scud framing the top, the foreground sea)
    var c2 = Math.max(2, Math.max(vw, vh) / 430), w2 = Math.round(vw / c2), h2 = Math.round(vh / c2);
    var Dm = plane(P, w2, h2, c2, hz, vw, vh, {
      deck: { reach: 0.62, z0: 0.1, su: 2.0, sv: 1.25, p: 0.55, ou: 41.3, ov: 4.4, oct: 5, wp: 1.8 },
      sea: { reach: 0.7, z0: 0.05, su: 1.7, sv: 1.35, p: 0.7, ou: 65.7, ov: 1.1, oct: 5, wp: 1.4 } });
    var bx0 = ax + vw * (0.1 + 0.08 * RB()), boltX = function (yy) { return bx0 + (ax - bx0) * cl(yy / ay); };
    var cMid = shade(Dm, w2, h2, c2, sc, function (up, dz, d, yf) {
      return up ? sm(0.46, 0.66, d + 0.2 * sm(0.36, 0.06, yf) - 0.25 * sm(0.12, 0.02, dz)) * sm(0.006, 0.07, dz)
        : sm(0.45, 0.63, d + 0.06 * sm(0.0, 0.3, dz)) * sm(0.006, 0.05, dz);
    }, { base: [12, 12, 27], lit: [62, 58, 104], warm: [120, 70, 40], k: 9, a: 0.92 });
    var Dn = plane(P, w2, h2, c2, hz, vw, vh, {
      deck: { reach: 0.62, z0: 0.16, su: 1.3, sv: 0.9, p: 0.5, ou: 79.4, ov: 3.2, oct: 4, wp: 2.2, y1: 0.32 },
      sea: { reach: 0.7, z0: 0.1, su: 1.1, sv: 1.0, p: 0.7, ou: 102.6, ov: 6.6, oct: 4, wp: 1.8, y0: 0.58 } });
    // the far flicker sits between the far sky and the main clouds: light inside the deck, left of the strike
    var fl = can(sc, 0, 0, vw, vh, 0.25), fg = fl.g;
    var fr = fg.createRadialGradient(vw * 0.22, vh * 0.1, 0, vw * 0.22, vh * 0.1, vw * 0.6);
    fr.addColorStop(0, 'rgba(170,175,255,.5)'); fr.addColorStop(0.45, 'rgba(120,120,230,.14)'); fr.addColorStop(1, 'rgba(90,90,200,0)');
    fg.fillStyle = fr; fg.fillRect(0, 0, vw, vh);
    sc.insertBefore(fl, cMid);
    // the lit clouds: what the flash shows (both layers' cover; brightest along the channel and at its top; thin parts glow most)
    var lit = can(sc, 0, 0, vw, vh, 1 / c2), lg = lit.g, li = lg.createImageData(w2, h2), lp = li.data;
    // the bolt: from the clouds above the frame to the apex
    var bp = bolt(RB, [bx0, -vh * 0.03], [ax, ay + 1]);
    var bxs = [], bys = [];
    bp.forEach(function (P2) { P2.p.forEach(function (q2) { bxs.push(q2[0]); bys.push(q2[1]); }); });
    var bl = Math.floor(Math.min.apply(null, bxs) - 28), bt = Math.floor(Math.min.apply(null, bys) - 28);
    var bw = Math.ceil(Math.max.apply(null, bxs) + 28) - bl, bh = Math.ceil(Math.max.apply(null, bys) + 28) - bt;
    var bg = can(sc, bl, bt, bw, bh, 0.25), bgg = bg.g;
    bgg.translate(-bl, -bt);
    if (!still) strokeBolt(bgg, bp, [[30, 0.07, '125,135,255'], [14, 0.12, '155,170,255']]);
    var bc = can(sc, bl, bt, bw, bh, dpr), bcg = bc.g;
    bcg.translate(-bl, -bt);
    if (!still) strokeBolt(bcg, bp, [[10, 0.05, '130,145,255'], [5, 0.15, '170,185,255'], [2.4, 0.55, '215,225,255'], [1.15, 1, '255,255,255']]);
    var gapX = new Float32Array(w2 + 1);
    for (var gi2 = 0; gi2 <= w2; gi2++) { var gx2 = ((gi2 + 0.5) * c2 - bx0) / (vw * 0.16); gapX[gi2] = 0.22 / (1 + gx2 * gx2 * 1.4); }
    var cNear = shade(Dn, w2, h2, c2, sc, function (up, dz, d, yf, x) {
      var gap = gapX[Math.min(w2, Math.floor(x / c2))];
      return up ? sm(0.5, 0.64, d + 0.36 * sm(0.24, 0.0, yf) - 0.3 * sm(0.1, 0.22, yf) - gap) * sm(0.3, 0.0, yf)
        : sm(0.5, 0.66, d + 0.34 * sm(0.66, 0.98, yf) - 0.2) * sm(0.6, 0.82, yf);
    }, { base: [5, 5, 12], lit: [30, 28, 58], warm: [80, 46, 26], k: 8, a: 0.97 });
    cvs.push(cMid, cNear);
    var colX = new Float32Array(w2);
    for (var i2 = 0; i2 < (still ? 0 : h2); i2++) {
      var y2 = (i2 + 0.5) * c2, dz2 = Math.abs(y2 - hz) / vh, up2 = y2 < hz, cx2 = boltX(y2), yt = up2 ? Math.exp(-Math.pow((y2 - vh * 0.05) / (vh * 0.2), 2)) : 0;
      for (var x2 = 0; x2 < w2; x2++) { var dxb = ((x2 + 0.5) * c2 - cx2) / vw; colX[x2] = 1 / (1 + dxb * dxb * 26); }
      for (var x3 = 0; x3 < w2; x3++) {
        var q3 = i2 * w2 + x3, cv = Math.max(cMid.cov[q3], cNear.cov[q3] * 0.85);
        if (cv < 0.01) continue;
        var nb = colX[x3], L = up2 ? 0.22 + 0.78 * nb * nb + 0.45 * yt * nb : (0.12 + 0.5 * nb * nb) * sm(0.25, 0.0, dz2);
        var thin = 1.15 - sm(0.45, 0.85, Dm[q3]) * 0.75, edge = cMid.edge[q3];
        var a3 = cl(cv * L * thin * (0.55 + 0.7 * edge));
        if (a3 < 0.01) continue;
        var o3 = q3 * 4, wh = cl(nb * nb * 0.9 + yt * 0.4);
        lp[o3] = 150 + 100 * wh; lp[o3 + 1] = 158 + 92 * wh; lp[o3 + 2] = 255; lp[o3 + 3] = 235 * a3;
      }
    }
    lg.putImageData(li, 0, 0);
    sc.insertBefore(lit, bg);
    // the flash: the whole frame lights up from the strike, and a vignette that frames the hero
    var fx = can(sc, 0, 0, vw, vh, 0.25), fxg = fx.g, fxr = fxg.createRadialGradient(bx0 * 0.5 + ax * 0.5, vh * 0.1, 0, bx0 * 0.5 + ax * 0.5, vh * 0.1, vh * 0.9);
    fxr.addColorStop(0, 'rgba(225,232,255,.8)'); fxr.addColorStop(0.35, 'rgba(190,200,255,.36)'); fxr.addColorStop(1, 'rgba(160,170,255,.12)');
    fxg.fillStyle = fxr; fxg.fillRect(0, 0, vw, vh);
    var vg = can(sc, 0, 0, vw, vh, 0.25), vgg = vg.g, vr = vgg.createRadialGradient(ax, vh * 0.46, Math.min(vw, vh) * 0.3, ax, vh * 0.46, Math.hypot(vw, vh) * 0.62);
    vr.addColorStop(0, 'rgba(0,0,4,0)'); vr.addColorStop(1, 'rgba(0,0,4,.62)');
    vgg.fillStyle = vr; vgg.fillRect(0, 0, vw, vh);

    // ---- 4. the hero: rays and warm light behind the temple, the temple, its flash light, its sweep, the flare, sparks, the word
    var hero = el('div', 'oly-h', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px', sc);
    var hin = el('div', 'oly-hi', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px', hero);   // the approach (its own layer)
    var tcx = ax, tcy = Y(520), R0 = Math.max(vw, vh) * 0.62;
    var ray = can(hin, tcx - R0, tcy - R0, R0 * 2, R0 * 2, 0.22), rg = ray.g;
    rg.globalCompositeOperation = 'lighter';
    for (var s = 0; s < 34; s++) {
      var a0 = (s / 34) * Math.PI * 2 + R() * 0.15, aw = 0.025 + R() * 0.07, st = 0.016 + R() * 0.05, up3 = Math.sin(a0) < 0 ? 1 : 0.3;
      var gr = rg.createRadialGradient(R0, R0, tw * 0.15, R0, R0, R0);
      gr.addColorStop(0, 'rgba(255,214,140,' + (st * up3).toFixed(3) + ')'); gr.addColorStop(0.35, 'rgba(255,190,110,' + (st * up3 * 0.45).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,180,100,0)');
      rg.fillStyle = gr; rg.beginPath(); rg.moveTo(R0, R0); rg.arc(R0, R0, R0, a0, a0 + aw); rg.closePath(); rg.fill();
    }
    var gw = tw * 2.6, gh = th * 2.3, glow = can(hin, tcx - gw / 2, Y(226) - gh * 0.28, gw, gh, 0.5), gg = glow.g;
    gg.translate(-(tcx - gw / 2), -(Y(226) - gh * 0.28));
    var g1 = gg.createRadialGradient(tcx, Y(560), 0, tcx, Y(560), tw * 0.95);
    g1.addColorStop(0, 'rgba(255,214,140,.62)'); g1.addColorStop(0.4, 'rgba(255,170,80,.2)'); g1.addColorStop(1, 'rgba(255,150,60,0)');
    gg.fillStyle = g1; gg.fillRect(tcx - gw, Y(0), gw * 2, gh * 2);
    gg.save(); gg.translate(tcx, base); gg.scale(1, 0.16);                 // the warm light on the cloud sea under the temple
    var g2 = gg.createRadialGradient(0, 0, 0, 0, 0, tw * 1.15);
    g2.addColorStop(0, 'rgba(255,200,120,.55)'); g2.addColorStop(0.5, 'rgba(255,160,80,.18)'); g2.addColorStop(1, 'rgba(255,150,70,0)');
    gg.fillStyle = g2; gg.fillRect(-tw * 1.2, -tw * 1.2, tw * 2.4, tw * 2.4); gg.restore();
    var core = gg.createRadialGradient(tcx, Y(590), 0, tcx, Y(590), tw * 0.42);       // the inner light, seen between the columns
    core.addColorStop(0, 'rgba(255,240,200,.95)'); core.addColorStop(0.5, 'rgba(255,200,110,.5)'); core.addColorStop(1, 'rgba(255,170,80,0)');
    gg.fillStyle = core; gg.fillRect(X(220), Y(300), tw, th);
    var pad = 4, tb = el('div', 'oly-tb', 'position:absolute;left:' + (X(174) - pad) + 'px;top:' + (Y(226) - pad) + 'px;width:' + (tw + 2 * pad) + 'px;height:' + (th + 2 * pad) + 'px', hin);
    var TX = function (u) { return (u - 174) * k + pad; }, TY = function (v) { return (v - 226) * k + pad; };
    var tc = still ? null : can(tb, 0, 0, tw + 2 * pad, th + 2 * pad, dpr);
    if (tc) temple(tc.g, TX, TY, k, COLD, false);
    var tm = can(tb, 0, 0, tw + 2 * pad, th + 2 * pad, dpr);
    temple(tm.g, TX, TY, k, GOLD, false);
    var tl = can(tb, 0, 0, tw + 2 * pad, th + 2 * pad, dpr);
    temple(tl.g, TX, TY, k, GOLD, true);
    // the sweep: a band of light across the metal, masked to the temple's own outline
    var md = 'M' + TX(512) + ' ' + TY(226) + 'L' + TX(830) + ' ' + TY(392) + 'H' + TX(194) + 'Z' + 'M' + TX(512) + ' ' + TY(282) + 'L' + TX(296) + ' ' + TY(362) + 'H' + TX(728) + 'Z';
    BARS.forEach(function (r) { md += 'M' + TX(r[0]).toFixed(1) + ' ' + TY(r[1]).toFixed(1) + 'h' + (r[2] * k).toFixed(1) + 'v' + (r[3] * k).toFixed(1) + 'h' + (-r[2] * k).toFixed(1) + 'Z'; });
    var mk = maskSvg((tw + 2 * pad).toFixed(1), (th + 2 * pad).toFixed(1), md);
    var swp = el('div', 'oly-sw', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;-webkit-mask:' + mk + ' 0 0/100% 100% no-repeat;mask:' + mk + ' 0 0/100% 100% no-repeat', tb);
    var band = el('i', '', 'position:absolute;top:-20%;bottom:-20%;left:0;width:42%;background:linear-gradient(100deg,rgba(255,250,235,0) 0%,rgba(255,250,235,.12) 30%,rgba(255,252,240,.9) 50%,rgba(255,250,235,.12) 70%,rgba(255,250,235,0) 100%)', swp);
    // the flare at the apex: a hot core and a long anamorphic streak (the film-lens look)
    var fw = vw * 1.1, fh = 46, flare = can(hin, ax - fw / 2, ay - fh / 2, fw, fh, 0.5), flg = flare.g;
    var sk = flg.createLinearGradient(0, 0, fw, 0);
    sk.addColorStop(0, 'rgba(150,170,255,0)'); sk.addColorStop(0.38, 'rgba(170,190,255,.35)'); sk.addColorStop(0.5, 'rgba(255,255,255,.95)'); sk.addColorStop(0.62, 'rgba(170,190,255,.35)'); sk.addColorStop(1, 'rgba(150,170,255,0)');
    flg.fillStyle = sk; flg.fillRect(0, fh / 2 - 1.2, fw, 2.4);
    var fc = flg.createRadialGradient(fw / 2, fh / 2, 0, fw / 2, fh / 2, fh / 2);
    fc.addColorStop(0, 'rgba(255,255,255,1)'); fc.addColorStop(0.3, 'rgba(255,236,190,.6)'); fc.addColorStop(1, 'rgba(255,210,140,0)');
    flg.fillStyle = fc; flg.fillRect(fw / 2 - fh / 2, 0, fh, fh);

    // the word: each letter its own canvas (gold leaf: a metal ramp, a lit top edge, a dark under edge), set with Cinzel's spacing
    var wgw = fs * wordU / 1000 + fs * 1.2, wglow = can(hin, ax - wgw / 2, wy - cap - fs * 0.55, wgw, cap + fs * 1.1, 0.5), wgg = wglow.g;
    wgg.save(); wgg.translate(wgw / 2, (cap + fs * 1.1) / 2); wgg.scale(1, 0.32);
    var wr = wgg.createRadialGradient(0, 0, 0, 0, 0, wgw / 2);
    wr.addColorStop(0, 'rgba(255,190,100,.32)'); wr.addColorStop(0.6, 'rgba(255,170,80,.1)'); wr.addColorStop(1, 'rgba(255,160,70,0)');
    wgg.fillStyle = wr; wgg.fillRect(-wgw, -wgw, wgw * 2, wgw * 2); wgg.restore();
    var u = fs / 1000, word = 'OLYMPUS', xs = [], xu = -GL.O[1];
    for (var c = 0; c < word.length; c++) { xs.push(xu); xu += GL[word[c]][0] + trk + (KERN[word.substr(c, 2)] || 0); }
    var wx0 = ax - (wordU / 2) * u, letters = [], gmask = '';
    for (var c2 = 0; c2 < word.length; c2++) {
      var G = GL[word[c2]], lx = wx0 + (xs[c2] + G[1]) * u - 2, lw2 = (G[2] - G[1]) * u + 4, lt = wy - 0.73 * fs - 2, lh2 = 0.76 * fs + 4;
      var lc = can(hin, lx, lt, lw2, lh2, dpr), lg2 = lc.g, path = new Path2D(G[3]);
      lg2.translate(-G[1] * u + 2, wy - lt); lg2.scale(u, u);
      lg2.save(); lg2.translate(0, 34); lg2.fillStyle = 'rgba(42,26,6,.9)'; lg2.fill(path); lg2.restore();
      lg2.fillStyle = lin(lg2, 0, -700, 0, 0, [0, '#fff6dc', 0.18, '#f6dc96', 0.46, '#e0b25a', 0.72, '#b8852f', 0.9, '#9a6a22', 1, '#c79843']); lg2.fill(path);
      lg2.save(); lg2.clip(path); lg2.translate(0, 26); lg2.beginPath(); lg2.rect(-200, -1000, 1400, 1200); lg2.fillStyle = 'rgba(255,250,232,.55)';
      lg2.fill(path); lg2.restore();
      letters.push(lc);
      gmask += '<path transform="translate(' + ((xs[c2]) * u).toFixed(2) + ' ' + (0.73 * fs).toFixed(2) + ') scale(' + u.toFixed(5) + ')" d="' + G[3] + '"/>';
    }
    // the word's glint: a band of light, masked to the letters (one svg mask for the whole word)
    var gwW = wordU * u + 2, gm = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (GL.O[1] * u).toFixed(2) + ' 0 ' + gwW.toFixed(2) + ' ' + (0.76 * fs).toFixed(2) + '">' + gmask + '</svg>') + '")';
    var gl = el('div', 'oly-gl', 'position:absolute;overflow:hidden;left:' + (wx0 - 1).toFixed(1) + 'px;top:' + (wy - 0.73 * fs).toFixed(1) + 'px;width:' + gwW.toFixed(1) + 'px;height:' + (0.76 * fs).toFixed(1) + 'px;-webkit-mask:' + gm + ' 0 0/100% 100% no-repeat;mask:' + gm + ' 0 0/100% 100% no-repeat', hin);
    var gband = el('i', '', 'position:absolute;top:0;bottom:0;left:0;width:18%;background:linear-gradient(100deg,rgba(255,252,240,0),rgba(255,252,240,.78) 50%,rgba(255,252,240,0))', gl);
    // the rule and the four doors' line
    var rl = el('div', '', 'position:absolute;left:' + (ax - 78) + 'px;top:' + ry + 'px;width:156px;height:7px', hin);
    var r1 = el('i', '', 'position:absolute;left:0;top:3px;width:70px;height:1px;background:linear-gradient(90deg,rgba(226,182,92,0),#e2b65c);transform-origin:100% 50%', rl);
    var r2 = el('i', '', 'position:absolute;right:0;top:3px;width:70px;height:1px;background:linear-gradient(90deg,#e2b65c,rgba(226,182,92,0));transform-origin:0 50%', rl);
    var dm = el('i', '', 'position:absolute;left:75px;top:0.5px;width:6px;height:6px;background:linear-gradient(135deg,#fff0c4,#d9a74e);transform:rotate(45deg)', rl);
    var tg = el('div', '', 'position:absolute;left:0;right:0;top:' + ty + 'px;text-align:center;font:500 10.5px/1 -apple-system,"SF Pro Text",system-ui,"Inter","Helvetica Neue",Arial,sans-serif;letter-spacing:.42em;padding-left:.42em;color:rgba(236,218,176,.66);white-space:nowrap', hin);
    tg.textContent = 'ZEUS · MONEY · KALSHI';

    // ---- 5. the veils: the film starts inside the clouds and flies through them (two near masses that open around the temple and pass
    //         the camera), then the strike's shock: a wave over the cloud sea, a burst of light
    var veils = [];
    if (!still) {
      for (var vi = 0; vi < 2; vi++) {
        var vc = can(sc, 0, 0, vw, vh, 1 / c2), vgx = vc.g, vim = vgx.createImageData(vc.width, vc.height), vp = vim.data, vcw = vc.width, vch = vc.height;
        var ocx = 0.5 + (vi ? -0.06 : 0.05), ocy = Y(500) / vh + (vi ? 0.04 : -0.03);
        for (var vj = 0; vj < vch; vj++) {
          for (var vx = 0; vx < vcw; vx++) {
            var nx = vx / vcw, ny = vj / vch, u2 = nx * 4.4 * vw / vh + 7.3 + vi * 31.1, v2 = ny * 3.1 + 3.9 + vi * 17.7, wq = fbm(P, u2 * 0.5 + 11.1, v2 * 0.5 + 2.2, 2) - 0.5;
            var dv = fbm(P, u2 + wq * 1.6, v2 + wq * 1.1, 5), rdx = (nx - ocx) * vw / vh * 1.6, rdy = (ny - ocy) * 1.2, rr = Math.sqrt(rdx * rdx + rdy * rdy);
            var op = sm(0.46, 0.64, dv + rr * 0.42 - 0.17 + vi * 0.04) * (0.94 - 0.1 * vi);
            if (op < 0.01) continue;
            var lit2 = sm(0.62, 0.48, dv) * op, vq = (vj * vcw + vx) * 4;
            vp[vq] = 15 + 66 * lit2; vp[vq + 1] = 16 + 68 * lit2; vp[vq + 2] = 32 + 120 * lit2; vp[vq + 3] = 255 * op;
          }
        }
        vgx.putImageData(vim, 0, 0);
        vc.style.transformOrigin = ax + 'px ' + Y(500) + 'px';
        veils.push(vc);
      }
    }
    var ring = function (sy) {                                     // a thin bright ring (scaled up from a point by its animation)
      var RR = vw * 0.95, rc = can(sc, ax - RR, Y(sy) - RR, RR * 2, RR * 2, 0.35), rg2 = rc.g, gr2 = rg2.createRadialGradient(RR, RR, 0, RR, RR, RR);
      gr2.addColorStop(0, 'rgba(255,220,170,0)'); gr2.addColorStop(0.55, 'rgba(255,220,170,0)'); gr2.addColorStop(0.82, 'rgba(255,226,180,.22)');
      gr2.addColorStop(0.93, 'rgba(255,236,205,.6)'); gr2.addColorStop(1, 'rgba(240,230,255,0)');
      rg2.fillStyle = gr2; rg2.fillRect(0, 0, RR * 2, RR * 2);
      rc.style.transformOrigin = '50% 50%';
      return rc;
    };
    var ground = still ? null : ring(808);
    var burst = null;
    if (!still) {                                                  // the burst of light: thin rays from the apex
      var BR = Math.max(vw, vh) * 0.7;
      burst = can(sc, ax - BR, ay - BR, BR * 2, BR * 2, 0.25);
      var bgx = burst.g;
      bgx.globalCompositeOperation = 'lighter';
      for (var bi = 0; bi < 44; bi++) {
        var ba = bi / 44 * Math.PI * 2 + R() * 0.12, bw2 = 0.006 + R() * 0.02, bs = 0.12 + R() * 0.3, bgr = bgx.createRadialGradient(BR, BR, 0, BR, BR, BR * (0.55 + R() * 0.45));
        bgr.addColorStop(0, 'rgba(255,248,230,' + bs.toFixed(2) + ')'); bgr.addColorStop(0.3, 'rgba(220,226,255,' + (bs * 0.5).toFixed(2) + ')'); bgr.addColorStop(1, 'rgba(200,210,255,0)');
        bgx.fillStyle = bgr; bgx.beginPath(); bgx.moveTo(BR, BR); bgx.arc(BR, BR, BR, ba, ba + bw2); bgx.closePath(); bgx.fill();
      }
      burst.style.transformOrigin = '50% 50%';
    }
    // the strike's energy runs down the gold (a second band in the temple's sweep, top to bottom)
    var charge = el('i', '', 'position:absolute;left:-10%;right:-10%;top:0;height:34%;background:linear-gradient(180deg,rgba(255,250,235,0),rgba(255,252,240,.95) 50%,rgba(255,250,235,0))', swp);

    // ---- 6. sparks off the strike and embers rising (front)
    var fxl = el('div', 'oly-p', 'position:absolute;left:0;top:0;width:100%;height:100%', sc);
    var dot = function (sz, a, warm) {
      return 'position:absolute;left:0;top:0;width:' + sz + 'px;height:' + sz + 'px;margin:' + (-sz / 2) + 'px 0 0 ' + (-sz / 2) + 'px;border-radius:50%;background:radial-gradient(circle,rgba(255,' + (warm ? '236,190' : '250,235') + ',' + a + ') 0,rgba(255,' + (warm ? '180,80' : '220,160') + ',' + (a * 0.45).toFixed(2) + ') 38%,rgba(255,170,60,0) 70%)';
    };
    var sparks = [];
    if (!still) {
      for (var p = 0; p < 22; p++) {
        var sp = el('i', '', dot(2 + R() * 2.5, 1, false), fxl), an = -Math.PI / 2 + (R() - 0.5) * 2.6, vv = 60 + R() * 170, life = 420 + R() * 420, gv = 420;
        var kf = [{ transform: 'translate(' + ax + 'px,' + ay + 'px)', opacity: 0, offset: 0 }];      // unseen until the strike (fill: both)
        for (var s2 = 0; s2 <= 4; s2++) {
          var tt = life / 1000 * s2 / 4, sx = ax + Math.cos(an) * vv * tt, sy = ay + Math.sin(an) * vv * tt + 0.5 * gv * tt * tt;
          kf.push({ transform: 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) scale(' + (1 - s2 * 0.17).toFixed(2) + ')', opacity: s2 === 0 ? 1 : (1 - s2 / 4) * 0.95, offset: s2 ? s2 / 4 : 0.01 });
        }
        sparks.push([sp, kf, life]);
      }
    }
    var embers = [];
    var NE = still ? 16 : 40;
    for (var e = 0; e < NE; e++) {
      var bok = e % 6 === 5, sz = bok ? 9 + R() * 12 : 1.6 + R() * 2.2, ex0 = ax + (R() - 0.5) * vw * (bok ? 1.1 : 0.9), ey0 = base - th * 0.2 + R() * vh * 0.42;
      var em = el('i', '', dot(sz, bok ? 0.22 : 0.9, true), fxl);
      em.style.transform = 'translate(' + ex0.toFixed(1) + 'px,' + ey0.toFixed(1) + 'px)';
      embers.push([em, ex0, ey0, bok]);
    }

    // ---- the clock: every motion is CSS transform / opacity (run by the compositor)
    var oc = 'cubic-bezier(.2,.8,.2,1)', io = 'cubic-bezier(.45,0,.25,1)';
    var cam = function (c, s0, s1, dx) {          // the camera flies in: fast, then settling; nearer layers move more (depth), a little wind
      A(c, [{ transform: 'translate(0,0) scale(' + s0 + ')' }, { transform: 'translate(' + dx + 'px,0) scale(' + s1 + ')' }], T.end + 400, 0, 'cubic-bezier(.16,.62,.3,1)');
      c.style.transformOrigin = ax + 'px ' + (hz - 40) + 'px';
    };
    if (!still) {
      cam(sky, 1.0, 1.07, -3); cam(fl, 1.0, 1.1, 2); cam(cMid, 1.0, 1.19, 8); cam(lit, 1.0, 1.19, 8); cam(cNear, 1.02, 1.38, 18);
      A(veils[0], [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.85, transform: 'scale(1.55)', offset: 0.42 }, { opacity: 0, transform: 'scale(3)' }], 560, 0, 'linear');
      A(veils[1], [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.75, transform: 'scale(1.35)', offset: 0.45 }, { opacity: 0, transform: 'scale(2.2)' }], 660, 30, 'linear');
      A(hin, [{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], 1150, 0, 'cubic-bezier(.16,.62,.3,1)');
      hin.style.transformOrigin = ax + 'px ' + (base - th * 0.3) + 'px';
      var sh = Math.max(3, vw / 78), shk = [[0, 0], [-1, 0.55], [0.85, -0.7], [-0.6, 0.45], [0.42, -0.3], [-0.2, 0.18], [0, 0]];
      A(sc, shk.map(function (q) { return { transform: 'translate(' + (q[0] * sh).toFixed(1) + 'px,' + (q[1] * sh).toFixed(1) + 'px)' }; }), 380, T.strike, 'linear');
      A(ground, [{ opacity: 0, transform: 'scale(.05,.01)' }, { opacity: 0.9, transform: 'scale(.2,.042)', offset: 0.1 }, { opacity: 0, transform: 'scale(1.35,.26)' }], 950, T.strike + 50, 'cubic-bezier(.1,.7,.3,1)');
      A(burst, [{ opacity: 0, transform: 'rotate(-4deg) scale(.55)' }, { opacity: 1, transform: 'rotate(-1deg) scale(.9)', offset: 0.1 }, { opacity: 0, transform: 'rotate(5deg) scale(1.3)' }], 760, T.strike, 'cubic-bezier(.2,.6,.3,1)');
      A(charge, [{ transform: 'translateY(-120%)' }, { transform: 'translateY(330%)' }], 380, T.strike + 20, 'cubic-bezier(.4,0,.6,1)');
      A(sky, [{ opacity: 0 }, { opacity: 1 }], 520, 0, 'ease-out');
      A(cMid, [{ opacity: 0 }, { opacity: 1 }], 640, 60, 'ease-out');
      A(cNear, [{ opacity: 0 }, { opacity: 1 }], 560, 0, 'ease-out');
      A(fl, [{ opacity: 0 }, { opacity: 0.7, offset: 0.12 }, { opacity: 0.15, offset: 0.3 }, { opacity: 0.85, offset: 0.42 }, { opacity: 0.2, offset: 0.7 }, { opacity: 0 }], 260, T.flick);
      // the strike: two faint leaders, the return stroke, two re-strikes, then it is gone
      var bk = [{ opacity: 0 }, { opacity: 0.18, offset: 0.06 }, { opacity: 0, offset: 0.12 }, { opacity: 0.32, offset: 0.17 }, { opacity: 0.05, offset: 0.2 }, { opacity: 1, offset: 0.205 },
        { opacity: 0.45, offset: 0.27 }, { opacity: 0.95, offset: 0.33 }, { opacity: 0.25, offset: 0.42 }, { opacity: 0.75, offset: 0.48 }, { opacity: 0.12, offset: 0.66 }, { opacity: 0 }];
      A(bc, bk, 540, T.lead); A(bg, bk, 540, T.lead);
      var fk = [{ opacity: 0 }, { opacity: 0.1, offset: 0.17 }, { opacity: 0, offset: 0.2 }, { opacity: 0.92, offset: 0.205 }, { opacity: 0.72, offset: 0.24 }, { opacity: 0.16, offset: 0.29 }, { opacity: 0.55, offset: 0.33 },
        { opacity: 0.08, offset: 0.43 }, { opacity: 0.3, offset: 0.48 }, { opacity: 0 }];
      A(fx, fk, 540, T.lead);
      A(lit, [{ opacity: 0 }, { opacity: 0.25, offset: 0.17 }, { opacity: 0.05, offset: 0.2 }, { opacity: 1, offset: 0.205 }, { opacity: 0.5, offset: 0.29 }, { opacity: 0.9, offset: 0.33 },
        { opacity: 0.35, offset: 0.43 }, { opacity: 0.6, offset: 0.48 }, { opacity: 0.12, offset: 0.7 }, { opacity: 0 }], 760, T.lead);
      A(tl, [{ opacity: 0 }, { opacity: 0.3, offset: 0.17 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.205 }, { opacity: 0.55, offset: 0.29 }, { opacity: 0.95, offset: 0.33 },
        { opacity: 0.35, offset: 0.43 }, { opacity: 0.6, offset: 0.48 }, { opacity: 0 }], 700, T.lead);
      // the temple: a dark silhouette until the strike; the flash shows it, then the gold warms up from within
      A(tc, [{ opacity: 0 }, { opacity: 0.92, offset: 0.55 }, { opacity: 0.92, offset: 0.62 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }], 760, 0, 'ease-out');
      A(tm, [{ opacity: 0 }, { opacity: 0, offset: 0.92 }, { opacity: 1, offset: 0.93 }, { opacity: 1 }], T.strike + 40, 0);
      A(glow, [{ opacity: 0 }, { opacity: 0, offset: 0.001 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0.7, offset: 0.55 }, { opacity: 1 }], 900, T.warm, oc);
      A(ray, [{ opacity: 0, transform: 'rotate(-3deg) scale(.92)' }, { opacity: 0.85, offset: 0.4 }, { opacity: 0.55, transform: 'rotate(4deg) scale(1.04)' }], T.end - T.warm, T.warm, oc);
      A(band, [{ transform: 'translateX(-130%)' }, { transform: 'translateX(330%)' }], 620, T.sweep, io);
      A(flare, [{ opacity: 0, transform: 'scaleX(.2)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.08 }, { opacity: 0.45, transform: 'scaleX(1.1)', offset: 0.3 }, { opacity: 0, transform: 'scaleX(1.25)' }], 780, T.strike - 4);
      sparks.forEach(function (s) { A(s[0], s[1], s[2], T.strike + 10, 'linear'); });
      // the word: the letters arrive from the middle out, closing in like a film title; then a glint runs across
      for (var c3 = 0; c3 < letters.length; c3++) {
        var off = (c3 - 3) * fs * 0.16, dl = T.word + Math.abs(c3 - 3) * 50;
        A(letters[c3], [{ opacity: 0, transform: 'translate(' + off.toFixed(1) + 'px,' + (fs * 0.1).toFixed(1) + 'px)' }, { opacity: 1, transform: 'translate(0,0)' }], 540, dl, oc);
      }
      A(wglow, [{ opacity: 0 }, { opacity: 1 }], 700, T.word + 120, 'ease-out');
      A(gband, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(660%)' }], 520, T.glint, io);
      A(r1, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 520, T.rule, oc);
      A(r2, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 520, T.rule, oc);
      A(dm, [{ opacity: 0, transform: 'rotate(45deg) scale(.2)' }, { opacity: 1, transform: 'rotate(45deg) scale(1)' }], 380, T.rule + 60, oc);
      A(tg, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 480, T.tag, oc);
      embers.forEach(function (m) {
        var rise = (m[3] ? 70 : 90) + R() * 120, sway = (R() - 0.5) * 36, d0 = m[3] ? 200 + R() * 500 : T.strike + R() * 700, du = 1500 + R() * 900, x0 = m[1], y0 = m[2];
        A(m[0], [{ transform: 'translate(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px)', opacity: 0 },
          { transform: 'translate(' + (x0 + sway * 0.4).toFixed(1) + 'px,' + (y0 - rise * 0.35).toFixed(1) + 'px)', opacity: m[3] ? 0.7 : 1, offset: 0.3 },
          { transform: 'translate(' + (x0 + sway).toFixed(1) + 'px,' + (y0 - rise * 0.7).toFixed(1) + 'px)', opacity: m[3] ? 0.45 : (0.4 + R() * 0.6), offset: 0.65 },
          { transform: 'translate(' + (x0 + sway * 0.7).toFixed(1) + 'px,' + (y0 - rise).toFixed(1) + 'px)', opacity: 0 }], du, d0, 'ease-out');
      });
      // the hand-off: the temple and the word are gone (a push through) before Jarvis shows (never two logos at once), then the clouds clear
      A(hero, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.07)' }], 240, T.out, 'cubic-bezier(.3,0,.6,1)');
      hero.style.transformOrigin = ax + 'px ' + (base - th * 0.3) + 'px';
      A(stage, [{ opacity: 1 }, { opacity: 0 }], T.end - T.out - 180, T.out + 180, 'cubic-bezier(.4,0,.6,1)');
    } else {
      // the still (reduce motion, the quick versions): the last frame before the hand-off
      [bc, bg, fx, lit, tl, fl, flare].forEach(function (c) { c.style.opacity = '0'; });
      band.style.display = 'none'; gband.style.display = 'none'; charge.style.display = 'none';
      sky.style.transform = 'scale(1.05)'; cMid.style.transform = 'scale(1.1)'; cNear.style.transform = 'scale(1.17)';
      [sky, cMid, cNear].forEach(function (c) { c.style.transformOrigin = ax + 'px ' + (hz - 40) + 'px'; });
      ray.style.opacity = '0.6';
      embers.forEach(function (m) { m[0].style.opacity = m[3] ? '0.35' : '0.75'; });
    }
    var api = {
      end: still ? 0 : T.end, out: T.out, anims: anims, n: cvs.length, dpr: dpr, ms: Math.round((W.performance && performance.now ? performance.now() : Date.now()) - t0),
      hold: function (t) { anims.forEach(function (a) { try { a.pause(); a.currentTime = t; } catch (e) { /* */ } }); },
      free: function () { anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* */ } }); cvs.forEach(function (c) { c.width = c.height = 0; }); anims = []; cvs = []; }
    };
    return api;
  }
  W.__olyEntry = { build: build, T: T };
  if (typeof W.__olyEntryReady === 'function') { try { W.__olyEntryReady(); } catch (e) { /* the intro script's own fail-safes */ } }
}());
