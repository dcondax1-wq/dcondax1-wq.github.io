/* OLYMPUS entry v4 (night-introwarp 2026-11-20, owner: "intro effects", premium, not "2000's"; the city look of
 * research/handoff/2026-11-20/revamp-cities/LOOK.md). A film-title opening in 2.2 s: blue hour over the OLYMPUS city. The sky comes
 * up from black (zenith ink, a warm horizon glow from the city's own light, sparse stars, a soft moon, thin clouds lit orange from
 * below), a skyline in three depth layers that fade into the horizon haze (setback towers, crowns and spires, dark glass facades
 * with a moonlit rim), the windows switch on across the city in waves (warm homes, cool offices, a few hot spots, bright lobbies),
 * aviation lights blink, head / tail light streaks run along the embankment, and the river holds it all as rippled reflections.
 * Then the mark resolves: the gold temple of the Home Screen icon and OLYMPUS in Roman capitals (Cinzel, SIL OFL 1.1: its seven
 * outlines below, so it is the same on every phone and needs no font file) come into focus out of their own glow, a light sweep
 * runs across the metal, and the scene hands off to Jarvis with a slow camera push.
 *
 * How it stays smooth on an iPhone while Jarvis starts underneath (Jarvis's start holds the main thread for ~1 s here): every
 * picture is drawn ONCE, up front, into small canvases (soft things at a fraction of the screen's resolution), and all the motion
 * is CSS transform / opacity through the Web Animations API, which the phone runs off the main thread (Core Animation). Lights
 * "switching on" are window groups (canvases) whose opacity steps up. Nothing is drawn per frame; a busy page can delay the start
 * by a frame, never stutter it. No WebGL, no font file. Canvases are capped at 2x device pixels and freed at the end.
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
  // the entry's clock (ms): the sky comes up, the city lights up, the mark resolves, a light sweep, the hand-off onto Jarvis
  var T = { lights: 140, mark: 520, word: 600, rule: 980, sweep: 1040, tag: 1100, glint: 1160, out: 1720, end: 2220 };

  function rng(s) {
    s = s >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var sm = function (a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var rgba = function (c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (+a).toFixed(3) + ')'; };
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
    c.g = g; c.X = x; c.Y = y; c.W = w; c.H = h;
    return c;
  }
  function lin(g, x0, y0, x1, y1, stops) { var gr = g.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  function blob(g, x, y, rx, ry, stops) {             // a soft ellipse (a radial gradient squashed to rx x ry)
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  function maskSvg(vbw, vbh, d) {
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vbw + ' ' + vbh + '"><path fill-rule="evenodd" d="' + d + '"/></svg>') + '")';
  }

  // ------------------------------------------------------------------------------------------- the temple (the Home Screen icon's shapes)
  // icon units: x 174..850, y 226..808. Bars [x, y, w, h, kind]; the pediment is a triangle with a triangular opening.
  var BARS = [[194, 408, 636, 44, 'h'], [245, 474, 84, 22, 'h'], [395, 474, 84, 22, 'h'], [545, 474, 84, 22, 'h'], [695, 474, 84, 22, 'h'],
    [256, 496, 62, 196, 'c'], [406, 496, 62, 196, 'c'], [556, 496, 62, 196, 'c'], [706, 496, 62, 196, 'c'], [214, 712, 596, 38, 'h'], [174, 768, 676, 40, 'h']];
  var PED = [[512, 226], [830, 392], [194, 392]], HOLE = [[512, 282], [728, 362], [296, 362]];
  function tri(g, t, X, Y) { g.beginPath(); g.moveTo(X(t[0][0]), Y(t[0][1])); g.lineTo(X(t[1][0]), Y(t[1][1])); g.lineTo(X(t[2][0]), Y(t[2][1])); g.closePath(); }
  function inset(t, d) {                              // a triangle moved in (d > 0) or out (d < 0) along its sides' normals (icon units)
    var cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    return t.map(function (p) { var dx = cx - p[0], dy = cy - p[1], l = Math.hypot(dx, dy); return [p[0] + dx / l * d * 2.1, p[1] + dy / l * d * 2.1]; });
  }
  // gold leaf: rim (the bevel), face, column (a cylinder), the opening's bevel
  var GOLD = { rim: [0, '#fff4d4', 0.16, '#e9c477', 0.55, '#a8762a', 1, '#4a2e0b'], face: [0, '#fbe3a6', 0.22, '#f0c873', 0.5, '#d29e45', 0.82, '#a87529', 1, '#c18f3e'],
    col: [0, '#5e3d10', 0.12, '#a87a30', 0.3, '#f6dc9a', 0.4, '#ffeec4', 0.52, '#e2b55e', 0.78, '#a27026', 1, '#553608'], hole: [0, '#3c2507', 0.45, '#7a5119', 1, '#f2d38c'] };
  function temple(g, X, Y, k) {
    var b = 2.4, P = GOLD;
    tri(g, PED, X, Y); g.fillStyle = lin(g, 0, Y(226), 0, Y(392), P.rim); g.fill();
    tri(g, inset(PED, b), X, Y); g.fillStyle = lin(g, 0, Y(232), 0, Y(390), P.face); g.fill();
    tri(g, inset(HOLE, -b), X, Y); g.fillStyle = lin(g, 0, Y(276), 0, Y(366), P.hole); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; tri(g, HOLE, X, Y); g.fill(); g.restore();
    for (var i = 0; i < BARS.length; i++) {
      var r = BARS[i], x0 = X(r[0]), y0 = Y(r[1]), w = r[2] * k, hh = r[3] * k, bb = b * k;
      g.fillStyle = lin(g, 0, y0, 0, y0 + hh, P.rim); g.fillRect(x0, y0, w, hh);
      if (r[4] === 'c') {
        g.fillStyle = lin(g, x0 + bb, 0, x0 + w - bb, 0, P.col); g.fillRect(x0 + bb, y0, w - 2 * bb, hh);
        for (var q = 1; q < 4; q++) {                                   // three flutes: a groove and its lit lip
          var fx = x0 + w * q / 4;
          g.fillStyle = 'rgba(58,36,8,' + (q === 1 ? 0.22 : 0.3) + ')'; g.fillRect(fx - 0.4, y0 + bb, 0.8, hh - 2 * bb);
          g.fillStyle = 'rgba(255,240,205,' + (q === 1 ? 0.3 : 0.16) + ')'; g.fillRect(fx + 0.4, y0 + bb, 0.5, hh - 2 * bb);
        }
        g.fillStyle = lin(g, 0, y0, 0, y0 + hh, [0, 'rgba(40,24,4,.45)', 0.08, 'rgba(40,24,4,0)', 0.9, 'rgba(40,24,4,0)', 1, 'rgba(40,24,4,.35)']);
        g.fillRect(x0, y0, w, hh);
      } else {
        g.fillStyle = lin(g, 0, y0 + bb, 0, y0 + hh - bb, P.face); g.fillRect(x0 + bb, y0 + bb, w - 2 * bb, hh - 2 * bb);
      }
    }
  }

  // ------------------------------------------------------------------------------------------- the city
  // a tower: setback tiers from the ground up; the tall ones end in a spire, a crown or a rooftop box. Parts are [x, top, w, h].
  function tower(r, x, w, gy, h, tall) {
    var parts = [], y = gy, bx = x, bw = w, left = h, n = tall ? 1 + Math.floor(r() * 2.6) : (r() < 0.3 ? 1 : 0);
    for (var i = 0; i <= n && bw >= 4; i++) {
      var hh = i === n ? left : left * (0.58 + r() * 0.22);
      parts.push([bx, y - hh, bw, hh]); y -= hh; left -= hh;
      var ins = Math.max(1, Math.round(bw * (0.08 + r() * 0.12))); bx += ins; bw -= ins * 2;
    }
    var top = parts[parts.length - 1], k = r(), t = { parts: parts, x: top[0] + top[2] / 2, top: top[1], warm: r() < (tall ? 0.3 : 0.55), on: 0.16 + r() * 0.26, dim: 1 };
    if (tall && k < 0.45) { t.spire = h * (0.08 + r() * 0.1); t.top -= t.spire; }
    else if (tall && k < 0.75) t.crown = Math.min(top[2] * 0.5, 4 + r() * 8);
    else if (r() < 0.6) t.box = [top[0] + top[2] * (0.15 + r() * 0.4), top[2] * (0.2 + r() * 0.25), 2 + r() * 4];
    return t;
  }
  // its body: dark cool glass, lighter where it reflects the sky (fresnel at the edge), the moonlit rim on top and on one side
  function facade(g, t, pal) {
    for (var i = 0; i < t.parts.length; i++) {
      var p = t.parts[i];
      g.fillStyle = lin(g, 0, p[1], 0, p[1] + p[3], [0, pal.top, 1, pal.bot]); g.fillRect(p[0], p[1], p[2], p[3]);
      if (pal.sheen) { g.fillStyle = lin(g, p[0], 0, p[0] + p[2], 0, [0, 'rgba(140,160,210,' + pal.sheen + ')', 0.25, 'rgba(140,160,210,0)', 0.8, 'rgba(140,160,210,0)', 1, 'rgba(140,160,210,' + (pal.sheen * 0.6) + ')']); g.fillRect(p[0], p[1], p[2], p[3]); }
      if (pal.grid) {
        g.fillStyle = 'rgba(150,170,220,.05)';
        for (var gx = p[0] + pal.grid[0]; gx < p[0] + p[2] - 1; gx += pal.grid[0]) g.fillRect(gx, p[1], 0.5, p[3]);
        for (var gy = p[1] + pal.grid[1]; gy < p[1] + p[3] - 1; gy += pal.grid[1]) g.fillRect(p[0], gy, p[2], 0.5);
      }
      g.fillStyle = pal.rim; g.fillRect(p[0], p[1], p[2], pal.rw); g.fillRect(p[0] + p[2] - pal.rw, p[1], pal.rw, p[3] * 0.6);
    }
    var top = t.parts[t.parts.length - 1];
    g.fillStyle = pal.top;
    if (t.spire) { g.fillRect(t.x - 0.6, t.top, 1.2, t.spire + 1); g.fillRect(t.x - 1.8, top[1] - t.spire * 0.3, 3.6, t.spire * 0.3 + 1); }
    if (t.crown) { g.beginPath(); g.moveTo(top[0], top[1] + 0.5); g.lineTo(t.x, top[1] - t.crown); g.lineTo(top[0] + top[2], top[1] + 0.5); g.fill(); }
    if (t.box) g.fillRect(t.box[0], top[1] - t.box[2], t.box[1], t.box[2] + 0.5);
  }
  var WARM = [[255, 207, 143], [255, 190, 120], [255, 222, 170]], COOL = [[207, 227, 255], [190, 214, 255], [232, 240, 255]];
  // its windows: a grid per floor and bay (cw x ch cells, a mullion between), each on / dim / off, warm homes or cool offices, fewer
  // lit near the top, now and then a whole office floor, a bright lobby band at street level; each window joins one of G groups
  function windows(r, t, cw, ch, ww, wh, G, out, lobby) {
    for (var i = 0; i < t.parts.length; i++) {
      var p = t.parts[i], cols = Math.floor((p[2] - cw * 0.6) / cw), rows = Math.floor((p[3] - (i ? 2 : lobby + 2)) / ch);
      if (cols < 1 || rows < 1) continue;
      var x0 = p[0] + (p[2] - cols * cw) / 2 + (cw - ww) / 2, y0 = p[1] + 2;
      for (var row = 0; row < rows; row++) {
        var yy = y0 + row * ch, hf = 1 - (yy - t.top) / (t.parts[0][1] + t.parts[0][3] - t.top), floor = r() < 0.05, fg = Math.floor(r() * G), fa = r();
        var pf = t.on * (0.25 + 1.5 * fa * fa) * (hf > 0.8 ? 0.4 : 1);
        for (var c = 0; c < cols; c++) {
          var on = floor || r() < pf;
          if (!on) continue;
          var hot = r() < 0.035, pal = (t.warm ? r() < 0.85 : r() < 0.2) ? WARM : COOL, col = pal[Math.floor(r() * 3)];
          var a = (hot ? 1 : floor ? 0.75 : r() < 0.35 ? 0.22 + r() * 0.15 : 0.5 + r() * 0.4) * t.dim;
          out.push([x0 + c * cw, yy, ww, wh, hot ? 'rgba(255,246,226,1)' : rgba(col, a), floor ? fg : Math.floor(r() * G), hot]);
        }
      }
      if (!i && lobby) out.push([p[0] + 1, p[1] + p[3] - lobby, p[2] - 2, lobby - 0.5, 'rgba(255,214,160,.5)', 0, false]);
    }
  }
  // the lights of one layer drawn into G canvases (one per group, each cropped to its own windows): their opacity is the switch
  function lights(parent, list, G, s, can) {
    var out = [];
    for (var gi = 0; gi < G; gi++) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, j, L;
      for (j = 0; j < list.length; j++) { L = list[j]; if (L[5] !== gi) continue; x0 = Math.min(x0, L[0]); y0 = Math.min(y0, L[1]); x1 = Math.max(x1, L[0] + L[2]); y1 = Math.max(y1, L[1] + L[3]); }
      if (x1 < x0) continue;
      x0 = Math.floor(x0 - 3); y0 = Math.floor(y0 - 3); x1 = Math.ceil(x1 + 3); y1 = Math.ceil(y1 + 3);
      var c = can(parent, x0, y0, x1 - x0, y1 - y0, s), g = c.g;
      g.translate(-x0, -y0);
      for (j = 0; j < list.length; j++) {
        L = list[j]; if (L[5] !== gi) continue;
        if (L[6]) { g.fillStyle = 'rgba(255,200,140,.16)'; g.fillRect(L[0] - 1.5, L[1] - 1.5, L[2] + 3, L[3] + 3); }   // a hot spot's halo (restrained)
        g.fillStyle = L[4]; g.fillRect(L[0], L[1], L[2], L[3]);
      }
      out.push(c);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------- build
  function build(host, mode, opt) {
    opt = opt || {};
    var t0 = W.performance && performance.now ? performance.now() : Date.now();
    var vw = Math.max(280, W.innerWidth || 390), vh = Math.max(400, W.innerHeight || 844);
    var dpr = Math.min(2, W.devicePixelRatio || 1), still = mode !== 'mark', s15 = Math.min(1.5, dpr);
    if (!W.Path2D) throw new Error('no Path2D');
    var R = rng(opt.seed || 20261120);
    var anims = [], cvs = [];
    var can = function (p, x, y, w, h, s) { var c = cnv(p, x, y, w, h, s); cvs.push(c); return c; };
    var A = function (e, frames, dur, delay, ease, fill) {
      if (still || !e || !e.animate) return null;
      var a = e.animate(frames, { duration: dur, delay: delay || 0, easing: ease || 'linear', fill: fill || 'both' });
      anims.push(a); return a;
    };
    // ---- layout (CSS px): the horizon a third from the bottom, the river below the embankment, the mark just above the middle
    var ax = Math.round(vw / 2), hz = Math.round(vh * 0.655), gm = Math.round(vh * 0.745), gn = Math.round(vh * 0.8);
    var tw = Math.round(Math.min(vw * 0.25, vh * 0.125, 112)), k = tw / 676, th = 582 * k;
    var trk = 280, wordU = 4692 + 6 * trk, fs = Math.min(vw * 0.6, 290) / (wordU / 1000), cap = fs * 0.7;
    var wy = Math.round(vh * 0.535), base = Math.round(wy - cap - Math.max(16, cap * 0.55)), ay = base - th;
    var X = function (u) { return ax + (u - 512) * k; }, Y = function (v) { return ay + (v - 226) * k; };
    var ry = Math.round(wy + Math.max(14, cap * 0.5)), ty = Math.round(ry + 14);
    var ZEN = [5, 8, 15], MID = [20, 32, 58], HOR = [46, 46, 74], WRM = [255, 154, 90], FOG = mix(HOR, WRM, 0.16);

    var stage = el('div', 'oly-s', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px;overflow:hidden;contain:strict;background:#03050a;pointer-events:none');
    host.appendChild(stage);
    var sc = el('div', 'oly-rig', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px', stage);
    var layer = function () { var d = el('div', '', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px;transform-origin:' + ax + 'px ' + hz + 'px', sc); return d; };
    var L0 = layer(), L1 = layer(), L2 = layer(), L3 = layer();

    // ---- 1. the sky: blue hour (ink at the zenith, the warm glow of the city at the horizon) drawn small and smoothed, then a faint
    //         grain so no gradient bands; sparse stars in two twinkling sets, the moon and its halo, thin clouds lit orange from below
    var SH = gm + 2, sky = can(L0, 0, 0, vw, SH, 1), sg = sky.g, RN = rng(77);
    var gs = cnv(null, 0, 0, vw, SH, 0.125), gsg = gs.g, gi = gsg.createImageData(gs.width, gs.height), gp = gi.data, gw0 = gs.width, gh0 = gs.height;
    for (var j = 0; j < gh0; j++) {
      var y = (j + 0.5) * SH / gh0, yf = y / vh, c0 = yf < 0.42 ? mix(ZEN, MID, Math.pow(sm(0, 0.42, yf), 1.3)) : mix(MID, HOR, sm(0.42, hz / vh, yf));
      for (var i = 0; i < gw0; i++) {
        var ex = ((i + 0.5) * vw / gw0 - ax) / (vw * 0.5), dy = (y - hz) / vh;
        var w = (0.36 * Math.exp(-dy * dy / 0.0045) + 0.12 * Math.exp(-dy * dy / 0.03)) * (1 - 0.3 * ex * ex), cc = mix(c0, WRM, w), q = (j * gw0 + i) * 4;
        gp[q] = cc[0]; gp[q + 1] = cc[1]; gp[q + 2] = cc[2]; gp[q + 3] = 255;
      }
    }
    gsg.putImageData(gi, 0, 0);
    sg.imageSmoothingEnabled = true; sg.drawImage(gs, 0, 0, vw, SH);
    var gr0 = cnv(null, 0, 0, 96, 96, 1), grg = gr0.g, gri = grg.createImageData(96, 96);
    for (var n = 0; n < gri.data.length; n += 4) { var v0 = RN() * 255; gri.data[n] = gri.data[n + 1] = gri.data[n + 2] = v0; gri.data[n + 3] = 8; }
    grg.putImageData(gri, 0, 0);
    sg.fillStyle = sg.createPattern(gr0, 'repeat'); sg.fillRect(0, 0, vw, SH);
    gs.width = gs.height = gr0.width = gr0.height = 0;
    var stars = [can(L0, 0, 0, vw, hz, s15), can(L0, 0, 0, vw, hz, s15)];
    for (var si = 0; si < 150; si++) {
      var sy = Math.pow(R(), 1.5) * hz * 0.92, sx = R() * vw, sa = (0.25 + R() * 0.7) * Math.pow(1 - sy / hz, 0.7), sr = 0.35 + R() * R() * 0.8;
      var g1 = stars[si & 1].g; g1.fillStyle = rgba(R() < 0.3 ? [255, 236, 214] : [214, 226, 255], sa); g1.beginPath(); g1.arc(sx, sy, sr, 0, 6.283); g1.fill();
    }
    var mx = Math.round(vw * 0.74), my = Math.round(vh * 0.105), mr = Math.max(7, vw * 0.02), MH = mr * 9;
    var moon = can(L0, mx - MH, my - MH, MH * 2, MH * 2, dpr), mg = moon.g;
    mg.translate(MH, MH);
    blob(mg, 0, 0, MH, MH, [0, 'rgba(200,214,255,.2)', 0.12, 'rgba(180,196,240,.1)', 0.4, 'rgba(160,176,230,.03)', 1, 'rgba(160,176,230,0)']);
    var md = mg.createRadialGradient(-mr * 0.3, -mr * 0.3, 0, 0, 0, mr);
    md.addColorStop(0, '#fbf8ee'); md.addColorStop(0.7, '#e6e4d8'); md.addColorStop(1, '#c9cabf');
    mg.fillStyle = md; mg.beginPath(); mg.arc(0, 0, mr, 0, 6.283); mg.fill();
    mg.fillStyle = 'rgba(150,150,140,.18)'; mg.beginPath(); mg.arc(mr * 0.25, -mr * 0.15, mr * 0.28, 0, 6.283); mg.arc(-mr * 0.3, mr * 0.35, mr * 0.18, 0, 6.283); mg.fill();
    var glow = can(L0, 0, Math.round(vh * 0.3), vw, Math.round(vh * 0.6), 0.25), glg = glow.g;
    glg.translate(0, -vh * 0.3);
    blob(glg, ax, hz, vw * 0.95, vh * 0.2, [0, 'rgba(255,160,96,.34)', 0.45, 'rgba(255,128,84,.12)', 1, 'rgba(255,120,80,0)']);
    blob(glg, ax, hz, vw * 0.42, vh * 0.07, [0, 'rgba(255,196,140,.26)', 1, 'rgba(255,170,110,0)']);
    var cy0 = Math.round(vh * 0.14), clouds = can(L0, -40, cy0, vw + 80, hz - cy0, 0.5), cg = clouds.g;
    cg.translate(40, -cy0);
    for (var ci = 0; ci < 11; ci++) {
      var ccx = (R() * 1.3 - 0.15) * vw, ccy = vh * (0.22 + 0.4 * Math.pow(R(), 0.7)), crx = 50 + R() * 150, wm = sm(vh * 0.25, hz, ccy);
      for (var bi = 0; bi < 4; bi++) {
        var bx = ccx + (R() - 0.5) * crx, brx = crx * (0.4 + R() * 0.5), bry = brx * (0.06 + R() * 0.05);
        blob(cg, bx, ccy, brx, bry, [0, 'rgba(26,32,56,.55)', 0.6, 'rgba(26,32,56,.22)', 1, 'rgba(26,32,56,0)']);
        cg.globalCompositeOperation = 'lighter';
        blob(cg, bx, ccy + bry * 0.55, brx * 0.85, bry * 0.7, [0, 'rgba(255,150,95,' + (0.2 * wm + 0.03).toFixed(3) + ')', 1, 'rgba(255,140,90,0)']);
        cg.globalCompositeOperation = 'source-over';
      }
    }

    // ---- 2. the skyline in three layers: far (small, deep in the haze), mid (a valley under the mark, taller to the sides), near
    //         (two tall glass towers framing the frame); fog between them fades each into the horizon colour
    var towers = [], far = [], mid = [], nearL = [], nearR = [], blink = [];
    var fc = can(L1, 0, Math.round(hz - vh * 0.12), vw, Math.round(vh * 0.12) + 3, s15), fcg = fc.g;
    fcg.translate(0, -(hz - vh * 0.12));
    for (var fx = -6; fx < vw + 6;) {
      var fw = 5 + R() * 13, fh = vh * (0.012 + Math.pow(R(), 2) * 0.06) * (R() < 0.08 ? 1.8 : 1), ft = tower(R, fx, fw, hz + 2, fh, fh > vh * 0.05);
      facade(fcg, ft, { top: rgba(mix([34, 38, 60], FOG, 0.35), 1), bot: rgba(mix([34, 38, 60], FOG, 0.8), 1), rim: 'rgba(170,180,215,.12)', rw: 0.5 });
      windows(R, ft, 2.2, 2.6, 1, 1.1, 3, far, 0);
      fx += fw * (0.6 + R() * 0.6);
    }
    var wins = lights(L1, far, 3, 1, can);
    var fogF = can(L1, 0, Math.round(hz - vh * 0.07), vw, Math.round(gm - hz + vh * 0.07), 0.25);
    fogF.g.fillStyle = lin(fogF.g, 0, 0, 0, fogF.H, [0, rgba(FOG, 0), 0.5, rgba(FOG, 0.55), 1, rgba(FOG, 0.75)]); fogF.g.fillRect(0, 0, vw, fogF.H);
    var mtop = Math.round(vh * 0.4), mc = can(L2, 0, mtop, vw, gm - mtop + 2, s15), mcg = mc.g;
    mcg.translate(0, -mtop);
    for (var mx2 = -8; mx2 < vw + 8;) {
      var mw = 12 + R() * 26, d = Math.abs(mx2 + mw / 2 - ax) / vw, cap2 = d < 0.25 ? gm - vh * 0.61 : gm - vh * (0.6 - 1.4 * (d - 0.25)), mh = Math.min(cap2, vh * (0.03 + Math.pow(R(), 1.6) * 0.25));
      var mt = tower(R, mx2, mw, gm, Math.max(vh * 0.025, mh), mh > vh * 0.12);
      facade(mcg, mt, { top: '#1b2335', bot: rgba(mix([18, 24, 38], FOG, 0.45), 1), rim: 'rgba(170,186,230,.18)', rw: 0.6, sheen: 0.06 });
      windows(R, mt, 3.4, 4.2, 1.7, 2.1, 4, mid, 2.5);
      towers.push(mt); mx2 += mw * (0.7 + R() * 0.5);
    }
    wins = wins.concat(lights(L2, mid, 4, s15, can));
    // the city floor between the mid towers and the embankment: dark streets running away, their lights in rows
    var flo = can(L2, 0, gm - 1, vw, gn - gm + 1, s15), flg0 = flo.g;
    flg0.fillStyle = lin(flg0, 0, 0, 0, gn - gm, [0, rgba(mix([14, 16, 26], FOG, 0.35), 1), 1, '#07090f']); flg0.fillRect(0, 0, vw, gn - gm + 1);
    for (var fy = 2, fst = 2; fy < gn - gm - 6; fy += fst, fst *= 1.45) {
      for (var fd = 0; fd < vw / 3; fd++) { if (R() > 0.55) continue; flg0.fillStyle = R() < 0.75 ? 'rgba(255,190,120,' + (0.25 + R() * 0.5).toFixed(2) + ')' : 'rgba(210,225,255,.45)'; flg0.fillRect(fd * 3 + R() * 2, fy + R(), 0.6 + fy * 0.04, 0.6 + fy * 0.03); }
    }
    var fogM = can(L2, 0, Math.round(gm - vh * 0.09), vw, Math.round(gn - gm + vh * 0.09), 0.25);
    fogM.g.fillStyle = lin(fogM.g, 0, 0, 0, fogM.H, [0, rgba(FOG, 0), 0.62, rgba(FOG, 0.42), 1, rgba(FOG, 0.3)]); fogM.g.fillRect(0, 0, vw, fogM.H);
    var NT = [[-24, 0.25, 0.22], [vw * 0.13, 0.16, 0.6], [vw * 0.81, 0.27, 0.16], [vw * 0.7, 0.14, 0.62]];
    var ntop = Math.round(vh * 0.1), ncL = can(L3, 0, ntop, Math.round(vw * 0.32), gn - ntop + 1, dpr), ncR = can(L3, Math.round(vw * 0.68), ntop, vw - Math.round(vw * 0.68), gn - ntop + 1, dpr);
    ncL.g.translate(0, -ntop); ncR.g.translate(-Math.round(vw * 0.68), -ntop);
    for (var ni = 0; ni < NT.length; ni++) {
      var nr = NT[ni], right = nr[0] > ax, nw = vw * nr[1], nt = tower(R, nr[0], nw, gn, gn - vh * nr[2], true);
      nt.warm = ni % 2 === 1;
      nt.dim = 0.9;
      facade(right ? ncR.g : ncL.g, nt, { top: '#141c2d', bot: '#080b13', rim: 'rgba(190,206,245,.34)', rw: 0.7, sheen: 0.12, grid: [5.2, 7] });
      windows(R, nt, 5.2, 7, 3.3, 4.4, 4, right ? nearR : nearL, 4);
      towers.push(nt);
    }
    towers.sort(function (a, b) { return a.top - b.top; });
    // ground shade (ambient occlusion) at the foot of the near towers
    [ncL, ncR].forEach(function (c) { c.g.fillStyle = lin(c.g, 0, gn - 40, 0, gn, [0, 'rgba(3,4,8,0)', 1, 'rgba(3,4,8,.55)']); c.g.fillRect(-vw, gn - 40, vw * 3, 41); });
    wins = wins.concat(lights(L3, nearL, 4, dpr, can), lights(L3, nearR, 4, dpr, can));

    // ---- 3. the embankment (sodium street lights and their pools), the traffic, the river and the city in it
    var st0 = gn - 22, street = can(L3, 0, st0, vw, 26, dpr), stg = street.g;
    stg.translate(0, -st0);
    stg.fillStyle = lin(stg, 0, gn - 9, 0, gn + 1, [0, '#0d1018', 1, '#06080e']); stg.fillRect(0, gn - 9, vw, 10);
    stg.fillStyle = 'rgba(255,190,120,.22)'; stg.fillRect(0, gn - 9, vw, 0.6);
    var lamps = can(L3, 0, st0, vw, 26, dpr), lmg = lamps.g;
    lmg.translate(0, -st0);
    for (var lx = 10; lx < vw; lx += 34) {
      stg.fillStyle = '#1a1e2a'; stg.fillRect(lx - 0.4, gn - 20, 0.8, 11); stg.fillRect(lx - 0.4, gn - 20, 3, 0.8);
      blob(lmg, lx + 2.5, gn - 4.5, 15, 3.2, [0, 'rgba(255,180,107,.4)', 1, 'rgba(255,170,100,0)']);
      blob(lmg, lx + 2.5, gn - 19.5, 5, 5, [0, 'rgba(255,236,200,1)', 0.25, 'rgba(255,190,120,.6)', 1, 'rgba(255,170,100,0)']);
    }
    var traffic = el('div', '', 'position:absolute;left:0;top:0;width:100%;height:100%', L3), cars = [];
    for (var ti = 0; ti < 14; ti++) {
      var rgt = ti % 2 === 0, tl = 26 + R() * 46, tyy = gn - (rgt ? 6.2 : 3.4), dur = 1500 + R() * 1400;
      var bg = rgt ? 'linear-gradient(90deg,rgba(255,50,40,0),rgba(255,64,48,.55) 70%,#ff8a6a)' : 'linear-gradient(90deg,#fff8ec,rgba(255,236,205,.6) 30%,rgba(255,230,190,0))';
      var car = el('i', '', 'position:absolute;left:0;top:' + tyy.toFixed(1) + 'px;width:' + tl.toFixed(0) + 'px;height:1.6px;border-radius:1px;background:' + bg, traffic);
      cars.push([car, rgt, tl, dur, -R() * dur]);
    }
    var water = can(L3, 0, gn, vw, vh - gn, 0.5), wg = water.g;
    wg.fillStyle = lin(wg, 0, 0, 0, vh - gn, [0, '#0c0f1b', 0.3, '#070a13', 1, '#03040a']); wg.fillRect(0, 0, vw, vh - gn);
    blob(wg, ax, 0, vw * 0.8, (vh - gn) * 0.5, [0, 'rgba(255,150,95,.12)', 1, 'rgba(255,150,95,0)']);
    var refl = can(L3, 0, gn, vw, vh - gn, 1), rgx = refl.g, src = wins.concat([lamps]), RR = rng(5);
    for (var yy = 0; yy < vh - gn; yy += 2) {
      var ys = gn - yy * 1.15 - 3, fall = Math.pow(1 - yy / (vh - gn), 1.3), dx = (Math.sin(yy * 0.7) * 1.2 + (RR() - 0.5) * 2.4) * (1 + yy * 0.03);
      for (var s3 = 0; s3 < src.length; s3++) {
        var S = src[s3]; if (ys < S.Y || ys >= S.Y + S.H) continue;
        var sy2 = (ys - S.Y) / S.H * S.height;
        rgx.globalAlpha = 0.42 * fall; rgx.drawImage(S, 0, sy2, S.width, 1, S.X + dx, yy, S.W, 2);
        rgx.globalAlpha = 0.14 * fall; rgx.drawImage(S, 0, sy2, S.width, 1, S.X + dx + 2, yy, S.W, 2); rgx.drawImage(S, 0, sy2, S.width, 1, S.X + dx - 2, yy, S.W, 2);
      }
    }
    rgx.globalAlpha = 1;
    for (var ri = 0; ri < 46; ri++) { rgx.fillStyle = 'rgba(150,165,210,' + (0.04 + RR() * 0.08).toFixed(3) + ')'; rgx.fillRect(RR() * vw, RR() * (vh - gn), 8 + RR() * 50, 0.7); }
    // aviation lights on the three tallest tops
    for (var bk = 0; bk < 3 && bk < towers.length; bk++) {
      var tt = towers[bk], b = el('i', '', 'position:absolute;left:' + (tt.x - 4.5).toFixed(1) + 'px;top:' + (tt.top - 4.5).toFixed(1) + 'px;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle,#ff6a5a 0,rgba(255,40,30,.45) 30%,rgba(255,40,30,0) 70%)', tt.parts[0][3] > vh * 0.4 ? L3 : L2);
      blink.push(b);
    }

    // ---- 4. the mark: a soft warm light behind it, the temple, its sweep, OLYMPUS (letters + their own glow), the glint, rule and line
    var hero = el('div', 'oly-h', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px', sc);
    var hin = el('div', 'oly-hi', 'position:absolute;left:0;top:0;width:' + vw + 'px;height:' + vh + 'px;transform-origin:' + ax + 'px ' + base + 'px', hero);
    var bw = vw * 1.1, bh = (ty - ay) * 2.2, back = can(hin, ax - bw / 2, (ay + ty) / 2 - bh / 2, bw, bh, 0.25);
    blob(back.g, bw / 2, bh / 2, bw * 0.48, bh * 0.42, [0, 'rgba(6,9,18,.5)', 0.55, 'rgba(6,9,18,.22)', 1, 'rgba(6,9,18,0)']);
    blob(back.g, bw / 2, bh * 0.42, tw * 1.2, tw * 0.9, [0, 'rgba(255,196,120,.2)', 1, 'rgba(255,170,90,0)']);
    var pad = 4, tb = el('div', 'oly-tb', 'position:absolute;left:' + (X(174) - pad) + 'px;top:' + (Y(226) - pad) + 'px;width:' + (tw + 2 * pad) + 'px;height:' + (th + 2 * pad) + 'px', hin);
    var TX = function (u) { return (u - 174) * k + pad; }, TY = function (v) { return (v - 226) * k + pad; };
    var tm = can(tb, 0, 0, tw + 2 * pad, th + 2 * pad, dpr);
    temple(tm.g, TX, TY, k);
    var md2 = 'M' + TX(512) + ' ' + TY(226) + 'L' + TX(830) + ' ' + TY(392) + 'H' + TX(194) + 'Z' + 'M' + TX(512) + ' ' + TY(282) + 'L' + TX(296) + ' ' + TY(362) + 'H' + TX(728) + 'Z';
    BARS.forEach(function (r) { md2 += 'M' + TX(r[0]).toFixed(1) + ' ' + TY(r[1]).toFixed(1) + 'h' + (r[2] * k).toFixed(1) + 'v' + (r[3] * k).toFixed(1) + 'h' + (-r[2] * k).toFixed(1) + 'Z'; });
    var mk = maskSvg((tw + 2 * pad).toFixed(1), (th + 2 * pad).toFixed(1), md2);
    var swp = el('div', 'oly-sw', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;-webkit-mask:' + mk + ' 0 0/100% 100% no-repeat;mask:' + mk + ' 0 0/100% 100% no-repeat', tb);
    var band = el('i', '', 'position:absolute;top:-20%;bottom:-20%;left:0;width:42%;background:linear-gradient(100deg,rgba(255,250,235,0) 0%,rgba(255,250,235,.12) 30%,rgba(255,252,240,.9) 50%,rgba(255,250,235,.12) 70%,rgba(255,250,235,0) 100%)', swp);
    // the word: each letter its own canvas (champagne gold: a metal ramp, a lit top edge, a dark under edge), set with Cinzel's spacing;
    // its glow is the same word blurred (a shadow cast from off the canvas), one wide canvas: the letters come into focus out of it
    var u = fs / 1000, word = 'OLYMPUS', xs = [], xu = -GL.O[1];
    for (var c = 0; c < word.length; c++) { xs.push(xu); xu += GL[word[c]][0] + trk + (KERN[word.substr(c, 2)] || 0); }
    var wx0 = ax - (wordU / 2) * u, letters = [], gmask = '', blur = Math.max(6, fs * 0.16);
    var sw = wordU * u + blur * 6, sh = fs + blur * 6, soft = can(hin, wx0 - blur * 3, wy - 0.73 * fs - blur * 3, sw, sh, 0.5), sfg = soft.g;
    var tiny = cnv(null, 0, 0, sw, sh, Math.min(0.2, 3 / blur)), tyg = tiny.g;           // drawn tiny, then smoothed up: a blur in every browser
    tyg.fillStyle = 'rgba(255,206,130,.9)';
    for (var c2 = 0; c2 < word.length; c2++) {
      var G = GL[word[c2]], lx = wx0 + (xs[c2] + G[1]) * u - 2, lw2 = (G[2] - G[1]) * u + 4, lt = wy - 0.73 * fs - 2, lh2 = 0.76 * fs + 4;
      var lc = can(hin, lx, lt, lw2, lh2, dpr), lg2 = lc.g, path = new Path2D(G[3]);
      lg2.translate(-G[1] * u + 2, wy - lt); lg2.scale(u, u);
      lg2.save(); lg2.translate(0, 30); lg2.fillStyle = 'rgba(30,18,4,.85)'; lg2.fill(path); lg2.restore();
      lg2.fillStyle = lin(lg2, 0, -700, 0, 0, [0, '#fff8e6', 0.2, '#f4e0aa', 0.48, '#dcb468', 0.74, '#b88a3c', 0.92, '#9c7030', 1, '#c9a050']); lg2.fill(path);
      lg2.save(); lg2.clip(path); lg2.translate(0, 24); lg2.fillStyle = 'rgba(255,250,232,.5)'; lg2.fill(path); lg2.restore();
      letters.push(lc);
      tyg.save(); tyg.translate(blur * 3 + xs[c2] * u, blur * 3 + 0.73 * fs); tyg.scale(u, u); tyg.fill(path); tyg.restore();
      gmask += '<path transform="translate(' + ((xs[c2]) * u).toFixed(2) + ' ' + (0.73 * fs).toFixed(2) + ') scale(' + u.toFixed(5) + ')" d="' + G[3] + '"/>';
    }
    sfg.imageSmoothingEnabled = true; sfg.drawImage(tiny, 0, 0, sw, sh); sfg.globalCompositeOperation = 'lighter'; sfg.globalAlpha = 0.6; sfg.drawImage(tiny, -1, 0, sw + 2, sh);
    tiny.width = tiny.height = 0;
    // the light sweep over the word: a band of light masked to the letters (one svg mask for the whole word) and a thin lens streak
    var gwW = wordU * u + 2, gm2 = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (GL.O[1] * u).toFixed(2) + ' 0 ' + gwW.toFixed(2) + ' ' + (0.76 * fs).toFixed(2) + '">' + gmask + '</svg>') + '")';
    var gl = el('div', 'oly-gl', 'position:absolute;overflow:hidden;left:' + (wx0 - 1).toFixed(1) + 'px;top:' + (wy - 0.73 * fs).toFixed(1) + 'px;width:' + gwW.toFixed(1) + 'px;height:' + (0.76 * fs).toFixed(1) + 'px;-webkit-mask:' + gm2 + ' 0 0/100% 100% no-repeat;mask:' + gm2 + ' 0 0/100% 100% no-repeat', hin);
    var gband = el('i', '', 'position:absolute;top:0;bottom:0;left:0;width:18%;background:linear-gradient(100deg,rgba(255,252,240,0),rgba(255,252,240,.85) 50%,rgba(255,252,240,0))', gl);
    var fw2 = vw * 0.9, fh2 = 22, flare = can(hin, ax - fw2 / 2, wy - cap * 0.5 - fh2 / 2, fw2, fh2, 0.5), flg = flare.g;
    flg.fillStyle = lin(flg, 0, 0, fw2, 0, [0, 'rgba(160,190,255,0)', 0.4, 'rgba(190,210,255,.28)', 0.5, 'rgba(255,248,232,.9)', 0.6, 'rgba(190,210,255,.28)', 1, 'rgba(160,190,255,0)']);
    flg.fillRect(0, fh2 / 2 - 0.7, fw2, 1.4);
    blob(flg, fw2 / 2, fh2 / 2, fh2 * 1.4, fh2 / 2, [0, 'rgba(255,246,225,.7)', 0.35, 'rgba(255,220,170,.22)', 1, 'rgba(255,210,150,0)']);
    var rl = el('div', '', 'position:absolute;left:' + (ax - 78) + 'px;top:' + ry + 'px;width:156px;height:7px', hin);
    var r1 = el('i', '', 'position:absolute;left:0;top:3px;width:70px;height:1px;background:linear-gradient(90deg,rgba(226,182,92,0),#e2b65c);transform-origin:100% 50%', rl);
    var r2 = el('i', '', 'position:absolute;right:0;top:3px;width:70px;height:1px;background:linear-gradient(90deg,#e2b65c,rgba(226,182,92,0));transform-origin:0 50%', rl);
    var dm = el('i', '', 'position:absolute;left:75px;top:0.5px;width:6px;height:6px;background:linear-gradient(135deg,#fff0c4,#d9a74e);transform:rotate(45deg)', rl);
    var tg = el('div', '', 'position:absolute;left:0;right:0;top:' + ty + 'px;text-align:center;font:500 10.5px/1 -apple-system,"SF Pro Text",system-ui,"Inter","Helvetica Neue",Arial,sans-serif;letter-spacing:.42em;padding-left:.42em;color:rgba(236,222,190,.7);white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,.6)', hin);
    tg.textContent = 'ZEUS · MONEY · KALSHI';

    // ---- the clock: every motion is CSS transform / opacity (run by the compositor)
    var oc = 'cubic-bezier(.2,.8,.2,1)', io = 'cubic-bezier(.45,0,.25,1)', slow = 'cubic-bezier(.22,.55,.3,1)';
    var carAt = function (m, f) { var x = m[1] ? -m[2] + (vw + m[2] * 2) * f : vw + m[2] - (vw + m[2] * 2) * f; return 'translateX(' + x.toFixed(1) + 'px)'; };
    if (!still) {
      // the camera: a slow push in and a slight rise; nearer layers move more (depth)
      [[L0, 1.0, 1.02, 3], [L1, 1.0, 1.035, 6], [L2, 1.005, 1.06, 10], [L3, 1.01, 1.095, 16]].forEach(function (q) {
        A(q[0], [{ transform: 'translateY(' + q[3] + 'px) scale(' + q[1] + ')' }, { transform: 'translateY(0) scale(' + q[2] + ')' }], T.end + 500, 0, slow);
      });
      A(sky, [{ opacity: 0 }, { opacity: 1 }], 520, 0, 'ease-out');
      [L1, L2, L3].forEach(function (l, ix) { A(l, [{ opacity: 0 }, { opacity: 1 }], 420, ix * 40, 'ease-out'); });   // the city comes out of the dark with the sky
      A(moon, [{ opacity: 0 }, { opacity: 1 }], 600, 120, 'ease-out');
      A(stars[0], [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.55, offset: 0.65 }, { opacity: 1 }], 2000, 100, 'ease-in-out');
      A(stars[1], [{ opacity: 0 }, { opacity: 0.5, offset: 0.25 }, { opacity: 1, offset: 0.55 }, { opacity: 0.6 }], 2000, 160, 'ease-in-out');
      A(glow, [{ opacity: 0 }, { opacity: 1 }], 1100, 120, 'ease-out');
      A(clouds, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'translateX(4px)', offset: 0.4 }, { opacity: 1, transform: 'translateX(18px)' }], T.end + 300, 60, 'linear');
      A(fogF, [{ opacity: 0.4, transform: 'translateX(0)' }, { opacity: 1, transform: 'translateX(-12px)' }], T.end, 0, 'ease-out');
      A(fogM, [{ opacity: 0.4, transform: 'translateX(0)' }, { opacity: 1, transform: 'translateX(10px)' }], T.end, 0, 'ease-out');
      // the lights: every group switches on at its own moment, far and near mixed; some flicker like a tube, some fade up
      var order = wins.slice(), nG = order.length, R2 = rng(11);
      for (var oi = nG - 1; oi > 0; oi--) { var oj = Math.floor(R2() * (oi + 1)), ot = order[oi]; order[oi] = order[oj]; order[oj] = ot; }
      order.forEach(function (cv, ix) {
        var at = T.lights + Math.round(ix / Math.max(1, nG - 1) * 1000 + R2() * 60);
        if (ix % 3 === 1) A(cv, [{ opacity: 0 }, { opacity: 0.9, offset: 0.18 }, { opacity: 0.15, offset: 0.34 }, { opacity: 1, offset: 0.5 }, { opacity: 0.7, offset: 0.7 }, { opacity: 1 }], 300, at, 'linear');
        else A(cv, [{ opacity: 0 }, { opacity: 1 }], 220 + Math.round(R2() * 260), at, 'ease-out');
      });
      A(lamps, [{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0.35, offset: 0.5 }, { opacity: 1 }], 600, 180, 'ease-out');
      A(refl, [{ opacity: 0 }, { opacity: 1 }], 1200, 300, 'ease-in');
      cars.forEach(function (m) { A(m[0], [{ transform: carAt(m, 0) }, { transform: carAt(m, 1) }], m[3], m[4], 'linear'); });
      blink.forEach(function (b, ix) {
        var f = []; for (var bt = 0; bt <= 10; bt++) f.push({ opacity: bt % 4 === ix % 4 ? 1 : 0.08, easing: 'steps(1,end)' });
        A(b, f, T.end, 200, 'linear');
      });
      // the mark comes into focus: its warm light, the temple rising a touch, the word closing in out of its own glow, then the sweep
      A(back, [{ opacity: 0 }, { opacity: 1 }], 800, T.mark - 120, 'ease-out');
      A(tb, [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 760, T.mark, oc);
      A(band, [{ transform: 'translateX(-130%)' }, { transform: 'translateX(330%)' }], 680, T.sweep, io);
      for (var c3 = 0; c3 < letters.length; c3++) {
        var off = (c3 - 3) * fs * 0.2;
        A(letters[c3], [{ opacity: 0, transform: 'translate(' + off.toFixed(1) + 'px,0) scale(1.08)' }, { opacity: 0.6, offset: 0.4 }, { opacity: 1, transform: 'translate(0,0) scale(1)' }], 720, T.word + Math.abs(c3 - 3) * 45, oc);
      }
      soft.style.transformOrigin = '50% 50%';
      A(soft, [{ opacity: 0, transform: 'scaleX(1.12)' }, { opacity: 1, transform: 'scaleX(1.03)', offset: 0.35 }, { opacity: 0.42, transform: 'scaleX(1)' }], 1150, T.word - 60, 'ease-out');
      A(gband, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(660%)' }], 560, T.glint, io);
      A(flare, [{ opacity: 0, transform: 'translateX(-38%) scaleX(.6)' }, { opacity: 0.85, offset: 0.45 }, { opacity: 0, transform: 'translateX(38%) scaleX(1)' }], 560, T.glint, io);
      A(r1, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 520, T.rule, oc);
      A(r2, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 520, T.rule, oc);
      A(dm, [{ opacity: 0, transform: 'rotate(45deg) scale(.2)' }, { opacity: 1, transform: 'rotate(45deg) scale(1)' }], 380, T.rule + 60, oc);
      A(tg, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 480, T.tag, oc);
      // the hand-off: the mark is gone (a push through) before Jarvis shows (never two logos at once), then the city fades onto Jarvis
      A(hero, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.07)' }], 240, T.out, 'cubic-bezier(.3,0,.6,1)');
      hero.style.transformOrigin = ax + 'px ' + base + 'px';
      A(stage, [{ opacity: 1 }, { opacity: 0 }], T.end - T.out - 180, T.out + 180, 'cubic-bezier(.4,0,.6,1)');
    } else {
      // the still (reduce motion, the quick versions): the last frame before the hand-off, a long exposure of the traffic
      band.style.display = 'none'; gband.style.display = 'none'; flare.style.opacity = '0'; soft.style.opacity = '0.42';
      cars.forEach(function (m) { m[0].style.transform = carAt(m, ((-m[4] / m[3]) + 0.7) % 1); });
      [[L0, 1.02], [L1, 1.035], [L2, 1.06], [L3, 1.095]].forEach(function (q) { q[0].style.transform = 'scale(' + q[1] + ')'; });
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
