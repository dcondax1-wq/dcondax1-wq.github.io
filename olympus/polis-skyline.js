/* OLYMPUS POLIS SKYLINE (2026-11-11, "Polis home" agent; docs/POLIS.md): a painted 2.5D city of OLYMPUS on a 2D canvas. ES5, no DOM at load, no network.
 * Needs olympus/polis-skyline-sky.js (the real sky over New York) loaded first.
 *
 *   var SK = window.OLYMPUS_POLIS_SKYLINE;
 *   SK.layout(apps)                       -> {W, H, buildings: [...], districts: [...], berths, lanes}   (pure: node-tested)
 *   SK.palette(sunAlt, rising, weather)   -> the light of that moment (sky, light, shade, haze colours, night 0..1)
 *   var city = SK.create(host, {apps, ships, weather, time, quality, reduced, onSelect, onHover});
 *   city.setTime(ms) / city.setWeather({cloud, rain, fog}) / city.setFresh({id: 0..1}) / city.setShips([...]) / city.setTreasury(up)
 *   city.panTo('trading' | 'money' | 'life' | id, smooth) / city.select(id) / city.shootingStar() / city.setTilt(x, y) / city.info() / city.destroy()
 *
 * How it paints (all in code, no image files): the sky is a 360 degree strip baked per light (gradients by sun altitude and azimuth); the
 * stars, Moon, Sun and the constellations are projected from real RA / Dec every 10 s; far mountains + the sea, the middle hills, the city
 * (Acropolis, agora, harbour, gardens) and the foreground are baked into tiled layers (re-baked only when the light changes) and slide at
 * 0.5 / 0.7 / 1 / 1.25 of the pan (parallax), plus a few px with the phone's tilt and the page scroll. Light is physical-ish: faces are lit
 * by the Sun's azimuth, shadows are cast away from the Sun with length h / tan(altitude) (long at dusk), far things are mixed into the haze
 * colour (atmospheric perspective), a paper-grain pass makes it read as paint. At night windows and torches are lit and the sky has stars.
 * Per frame only small things move: water glitter, clouds, ships, torch flames, smoke, gold motes, banners on buildings with fresh news.
 * quality: 'high' (60 fps loop) | 'low' (LITE: no loop, still frames on change) ; reduced: true = no motion at all (still frames).
 */
(function (root) {
  'use strict';
  var SKY = root && root.OLYMPUS_POLIS_SKY ? root.OLYMPUS_POLIS_SKY : (typeof require === 'function' ? require('./polis-skyline-sky.js') : null);
  var D2R = Math.PI / 180;
  var H0 = 620, HORIZON = 282, PAD = 150;   // PAD: extra sky above the design (the hero shows 770 units: sky ~45%)

  // ------------------------------------------------------------------------------------------------ small helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function mul(a, b) { return [a[0] * b[0] / 255, a[1] * b[1] / 255, a[2] * b[2] / 255]; }
  function scl(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function css(c, al) { var r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255); return al == null || al >= 1 ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + Math.round(clamp(al, 0, 1) * 1000) / 1000 + ')'; }
  function hex(h) { h = String(h || '#c8a24a').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [200, 162, 74]; }
  function hash(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise1(seed) {   // smooth 1D value noise, period-free
    var r = rng(seed), v = []; for (var i = 0; i < 512; i++) v.push(r());
    return function (x) { var i = Math.floor(x), f = x - i, a = v[((i % 512) + 512) % 512], b = v[(((i + 1) % 512) + 512) % 512]; return lerp(a, b, f * f * (3 - 2 * f)); };
  }
  function fbm(n, x, oct) { var s = 0, a = 0.5, f = 1, t = 0; for (var i = 0; i < (oct || 4); i++) { s += a * n(x * f); t += a; a *= 0.5; f *= 2.03; } return s / t; }
  function wrap180(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a; }

  // ------------------------------------------------------------------------------------------------ the light (keyframes by sun altitude)
  var KEYS = [   // alt, zenith, upper, horizon (dusk), horizon (dawn), light colour, light strength, shade colour
    [-90, [12, 16, 34], [18, 24, 48], [34, 36, 62], [34, 36, 62], [120, 140, 190], 0, [28, 34, 62]],
    [-14, [14, 19, 42], [24, 30, 62], [44, 44, 76], [44, 46, 80], [120, 140, 190], 0, [30, 36, 66]],
    [-8, [22, 28, 62], [44, 46, 88], [110, 78, 100], [96, 86, 120], [140, 130, 170], 0.02, [48, 48, 86]],
    [-3, [38, 48, 98], [104, 84, 128], [232, 136, 92], [222, 150, 146], [255, 140, 96], 0.12, [84, 70, 112]],
    [1, [58, 76, 132], [170, 128, 146], [250, 170, 98], [246, 182, 150], [255, 150, 86], 0.55, [104, 86, 122]],
    [6, [76, 108, 168], [186, 164, 168], [252, 204, 140], [246, 208, 172], [255, 186, 116], 0.8, [116, 104, 136]],
    [16, [74, 124, 188], [148, 178, 208], [236, 222, 198], [232, 222, 206], [255, 228, 186], 0.95, [118, 126, 156]],
    [45, [60, 118, 192], [136, 176, 216], [224, 226, 216], [224, 226, 216], [255, 246, 228], 1, [118, 130, 162]]
  ];
  function palette(alt, rising, w) {
    w = w || {};
    var i = 0; while (i < KEYS.length - 2 && alt > KEYS[i + 1][0]) i++;
    var a = KEYS[i], b = KEYS[i + 1], t = smooth((alt - a[0]) / (b[0] - a[0]));
    var p = { alt: alt, rising: !!rising, zenith: mix(a[1], b[1], t), upper: mix(a[2], b[2], t), horizon: mix(rising ? a[4] : a[3], rising ? b[4] : b[3], t),
      light: mix(a[5], b[5], t), strength: lerp(a[6], b[6], t), shade: mix(a[7], b[7], t) };
    p.night = smooth((-2 - alt) / 8);            // 0 day .. 1 full night (window lights, torches)
    p.stars = smooth((-7 - alt) / 7);            // star visibility
    p.golden = alt > -2 && alt < 12 ? 1 - Math.abs(alt - 4) / 10 : 0;
    var cloud = clamp(+w.cloud || 0, 0, 1), fog = clamp(+w.fog || 0, 0, 1), grey = [150, 152, 160];
    if (cloud > 0) {
      var k = cloud * 0.75, lum = (p.zenith[0] + p.zenith[1] + p.zenith[2]) / 3 / 120;
      p.zenith = mix(p.zenith, scl(grey, clamp(lum, 0.12, 1)), k); p.upper = mix(p.upper, scl(grey, clamp(lum * 1.1, 0.14, 1.05)), k);
      p.horizon = mix(p.horizon, scl([178, 176, 176], clamp(lum * 1.15, 0.16, 1.1)), k * 0.8); p.strength *= 1 - cloud * 0.6; p.stars *= 1 - cloud * 0.85;
    }
    p.haze = mix(p.horizon, p.upper, 0.25);
    p.fog = fog; p.cloud = cloud; p.rain = clamp(+w.rain || 0, 0, 1);
    p.amb = mix(p.shade, p.horizon, 0.18);                         // ambient sky light in the shade
    p.window = [255, 196, 120]; p.torch = [255, 170, 90];
    return p;
  }

  // ------------------------------------------------------------------------------------------------ the map: districts, terraces, buildings (design units, 620 high)
  var SPECIAL = {
    zenith: 'parthenon', bridge: 'propylaea', oracle: 'erechtheion', pantheon: 'nike',
    chronos: 'windtower', kairos: 'windtower', argus: 'watchtower', observatory: 'watchtower', ares: 'fort', aegis: 'fort', forum: 'stoa', stoa: 'stoa', archive: 'library', pinakes: 'library', clio: 'library',
    odeon: 'odeon', colosseum: 'theatre', hephaestus: 'temple', prometheus: 'forge', ergasterion: 'forge', delphi: 'tholos', pythia: 'tholos', datacity: 'houses', cities: 'houses', nq: 'temple', helios: 'temple',
    mint: 'mint', mintcity: 'mint', ledger: 'treasury', plutus: 'treasury', hera: 'temple', pnyx: 'stoa', mercury: 'stoa', tyche: 'tholos', argo: 'shipshed', kalshicity: 'houses', harmonia: 'treasury', chrysos: 'treasury',
    athena: 'temple', mind: 'tholos', symposium: 'villa', planner: 'villa', lyceum: 'stoa', gallery: 'stoa', nike: 'shrine', atlas: 'shrine', arena: 'theatre', herald: 'stoa'
  };
  var GENERIC = { trading: ['house', 'temple', 'house2', 'stoa', 'house', 'shrine', 'house2'], money: ['house', 'stoa', 'house2', 'treasury', 'house'], life: ['villa', 'house', 'shrine', 'house2', 'villa'] };
  var SIZE = { parthenon: [184, 78], propylaea: [104, 52], erechtheion: [96, 56], nike: [50, 42], temple: [74, 56], tholos: [52, 58], stoa: [92, 40], house: [54, 40], house2: [46, 50], shrine: [42, 44],
    windtower: [32, 66], watchtower: [34, 72], fort: [62, 52], library: [80, 48], odeon: [86, 52], theatre: [100, 42], forge: [58, 44], mint: [74, 56], treasury: [58, 48], villa: [70, 42], houses: [72, 44], shipshed: [80, 44] };
  // the hill surface y(x) of each district (design units): the Acropolis rock, the agora plain, the garden hill
  function rockY(x) {
    var n = Math.sin(x * 0.045) * 3 + Math.sin(x * 0.13 + 1) * 1.6;
    if (x >= 862 && x <= 1438) return 214 + n * 0.5;
    if (x < 862) { var tL = (862 - x); if (tL < 70) return 214 + Math.pow(tL / 70, 1.25) * 112 + n; return 326 + Math.pow(clamp((tL - 70) / 250, 0, 1), 0.85) * 290 + n; }
    var tR = (x - 1438); if (tR < 80) return 214 + Math.pow(tR / 80, 1.25) * 118 + n; return 332 + Math.pow(clamp((tR - 80) / 300, 0, 1), 0.85) * 284 + n;
  }
  function gardenY(x) { return 346 + Math.pow(Math.abs(x - 270) / 380, 1.7) * 150 + Math.sin(x * 0.03) * 4; }
  var DISTRICTS = [
    { id: 'life', name: 'The Gardens', group: 'life', x0: 0, x1: 660, cx: 300, surf: gardenY, rows: [[372, 16], [438, 14], [510, 10]] },
    { id: 'trading', name: 'The Acropolis', group: 'trading', x0: 640, x1: 1790, cx: 1150, surf: rockY, rows: [[350, 28], [412, 26], [474, 22], [540, 14]] },
    { id: 'money', name: 'The Harbour and the Mint', group: 'money', x0: 1800, x1: 2420, cx: 2110, surf: function () { return 396; }, rows: [[428, 10], [486, 12], [548, 8]] }
  ];
  var W0 = 2920;
  function rowY(row, x, cx, half) { var u = clamp((x - cx) / half, -1, 1); return row[0] + row[1] * (1 - u * u); }

  /** apps: [{id, name, group, colour, glyph, purpose, path}] -> buildings with x / y (base), w / h, type, district, row */
  function layout(apps) {
    var list = (apps || []).filter(function (a) { return a && a.id; }), out = [], terr = [], byG = { trading: [], money: [], life: [] };
    for (var i = 0; i < list.length; i++) { var g = byG[list[i].group] ? list[i].group : 'life'; byG[g].push(list[i]); }
    var plateau = { zenith: [1150, 214], bridge: [905, 216], oracle: [990, 214], pantheon: [1372, 215] };
    for (var di = 0; di < DISTRICTS.length; di++) {
      var D = DISTRICTS[di], items = byG[D.group].slice(), rest = [];
      for (var k = 0; k < items.length; k++) {
        var a = items[k];
        if (D.id === 'trading' && plateau[a.id]) out.push(building(a, D, -1, plateau[a.id][0], plateau[a.id][1], SPECIAL[a.id], 1));
        else rest.push(a);
      }
      // each row: the x range where the row sits on the hill (base at or below the surface), capacity by spacing
      var rows = [], cap = 0;
      for (var r = 0; r < D.rows.length; r++) {
        var row = D.rows[r], half = (D.x1 - D.x0) / 2, xa = D.x1, xb = D.x0;
        for (var x = D.x0 + 20; x <= D.x1 - 20; x += 4) { if (D.surf(x) <= rowY(row, x, D.cx, half) - 5) { if (x < xa) xa = x; if (x > xb) xb = x; } }
        if (D.id === 'money') { xa = D.x0 + 30; xb = D.x1 - 40; }
        var c = Math.max(1, Math.floor((xb - xa) / 64));
        rows.push({ row: row, half: half, xa: xa + 18, xb: xb - 18, cap: c }); cap += c;
      }
      // share the apps over the rows by capacity, back rows first; spacing at least 64 units (44 px taps stay apart)
      var left = rest.length, counts = [];
      for (r = 0; r < rows.length; r++) { var n = r === rows.length - 1 ? left : Math.min(rows[r].cap, Math.round(rest.length * rows[r].cap / cap)); counts.push(n); left -= n; }
      for (r = rows.length - 1; r >= 0 && left > 0; r--) { var room = rows[r].cap - counts[r]; var add2 = Math.min(room, left); counts[r] += add2; left -= add2; }
      var idx = 0;
      for (r = 0; r < rows.length; r++) {
        var R = rows[r], nr = counts[r];
        terr.push({ district: D.id, cx: D.cx, half: R.half, row: R.row, xa: R.xa - 34, xb: R.xb + 34, n: nr, y: R.row[0] });
        for (var s = 0; s < nr; s++) {
          var ap = rest[idx++]; if (!ap) break;
          var xx = nr === 1 ? (R.xa + R.xb) / 2 : lerp(R.xa, R.xb, (s + 0.5) / nr);
          var yy = rowY(R.row, xx, D.cx, R.half), type = SPECIAL[ap.id] || GENERIC[D.group][hash(ap.id) % GENERIC[D.group].length];
          if (D.id === 'money' && type === 'shipshed') type = 'stoa';
          out.push(building(ap, D, r, xx, yy, type, 0.78 + 0.26 * clamp((yy - 330) / 220, 0, 1), (R.xb - R.xa) / Math.max(1, nr)));
        }
      }
    }
    return { W: W0, H: H0, horizon: HORIZON, buildings: out, terraces: terr, districts: DISTRICTS.map(function (d) { return { id: d.id, name: d.name, group: d.group, x0: d.x0, x1: d.x1, cx: d.cx }; }),
      berths: [[2500, 549], [2612, 551], [2724, 550], [2836, 548]], lanes: [[2560, 470, 0.66], [2690, 492, 0.72], [2450, 448, 0.58], [2680, 446, 0.6]] };
  }
  function building(a, D, row, x, y, type, s, spacing) {
    var sz = SIZE[type] || SIZE.house, w = sz[0] * s, h = sz[1] * s;
    if (spacing && w > spacing * 0.92) { var f = spacing * 0.92 / w; w *= f; h *= Math.max(0.85, f); }
    return { id: a.id, name: a.name || a.id, group: D.group, district: D.id, row: row, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), type: type, scale: s,
      colour: a.colour || '#c8a24a', glyph: a.glyph || '', purpose: a.purpose || '', path: a.path || (a.id + '/'), side: x < D.cx ? 1 : -1, seed: hash(a.id) };
  }

  // ------------------------------------------------------------------------------------------------ materials
  // a phone frame: the moored ships stand wider apart (their berths spread a little) so they can be drawn larger; polis.js
  // places the ships' tap targets with the same numbers (SK.berthX)
  var BERTH_MID = 2836, BERTH_SPREAD = 1.08;   // anchored on the last berth: the ships spread to the left, so the four plates stay on a 375 / 390 px screen
  var MAT = { marble: [236, 226, 208], marble2: [222, 210, 190], stone: [198, 180, 150], rock: [176, 152, 118], rock2: [150, 124, 94], terracotta: [178, 92, 58], tile: [160, 78, 50], plaster: [232, 218, 194],
    wood: [104, 70, 44], bronze: [156, 107, 60], gold: [214, 172, 82], olive: [96, 108, 62], olive2: [128, 136, 86], cypress: [44, 58, 40], grass: [128, 128, 72], sea: [58, 104, 136], deep: [34, 70, 100], path: [214, 196, 160], paint: [70, 98, 140], red: [150, 64, 48] };

  // shade(base, lit 0..1, L, depth 0..1): ambient + direct sun, then the haze of distance
  function shade(base, lit, L, depth) {
    var amb = scl(L.amb, (0.58 + 0.25 * (1 - L.night)) / 255), sun = scl(L.light, L.strength * 0.78 * clamp(lit, 0, 1) / 255);
    var c = [base[0] * (amb[0] + sun[0]), base[1] * (amb[1] + sun[1]), base[2] * (amb[2] + sun[2])];
    if (L.night > 0) c = mix(c, mul(base, [52, 60, 98]), L.night * 0.55);
    return depth ? mix(c, L.haze, clamp(depth, 0, 1) * (L.night > 0.5 ? 0.5 : 1)) : c;
  }
  // how much each face is lit: the front faces the viewer (south), the sides east / west, the top the sky
  function faces(L) {
    var az = L.sunAz * D2R, up = Math.sin(clamp(L.alt, 0, 90) * D2R), low = L.alt <= 0 ? 0 : clamp(L.alt / 6, 0, 1);
    var front = Math.max(0, -Math.cos(az)) * 0.9 + 0.25, east = Math.max(0, Math.sin(az)), west = Math.max(0, -Math.sin(az));
    return { front: clamp(front * low, 0, 1), left: clamp((east * 0.9 + 0.1) * low, 0, 1), right: clamp((west * 0.9 + 0.1) * low, 0, 1), top: clamp((0.35 + up * 0.75) * low, 0, 1),
      sx: Math.sin(az), sy: -Math.cos(az), len: L.alt > 0.5 ? clamp(1 / Math.tan(Math.max(L.alt, 3) * D2R), 0.25, 4.2) : 0 };
  }

  // ------------------------------------------------------------------------------------------------ painting primitives (ctx in design units)
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
  function rect(c, x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  // a box standing on (x .. x+w, base y), height h, depth vector (dx, dy) to the visible side (dx > 0: the right side shows)
  function box(c, x, by, w, h, dx, dy, cf, cs, ct) {
    var top = by - h;
    if (dx > 0) poly(c, [x + w, by, x + w + dx, by + dy, x + w + dx, top + dy, x + w, top], cs);
    else if (dx < 0) poly(c, [x, by, x + dx, by + dy, x + dx, top + dy, x, top], cs);
    if (ct) poly(c, [x, top, x + w, top, x + w + dx, top + dy, x + dx, top + dy], ct);
    rect(c, x, top, w, h, cf);
  }
  function groundShadow(c, x, by, w, h, depth, F, L, a) {
    if (!F.len) return;
    var vx = F.sx * h * F.len, vy = F.sy * h * F.len * 0.32, d = depth;   // away from the sun: toward the viewer when the sun is in the south
    c.beginPath(); c.moveTo(x, by); c.lineTo(x + w, by); c.lineTo(x + w + vx * 0.98, by + vy); c.lineTo(x + vx, by + vy);
    if (d) { c.lineTo(x + vx + d * 0.6, by + vy - d * 0.25); }
    c.closePath(); c.fillStyle = css(mix(L.shade, [20, 18, 30], 0.45), a == null ? 0.26 * smooth(L.strength * 1.3) : a); c.fill();
  }
  function columns(c, x0, x1, top, by, n, cw, base, lit, L, depth) {
    var lightC = shade(base, lit, L, depth), darkC = shade(base, lit * 0.35, L, depth), capC = shade(base, Math.min(1, lit + 0.12), L, depth);
    var step = (x1 - x0 - cw) / Math.max(1, n - 1), left = L.sunSx < 0;
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * step;
      rect(c, cx, top, cw, by - top, darkC);
      rect(c, left ? cx : cx + cw * 0.45, top, cw * 0.55, by - top, lightC);
      rect(c, cx - cw * 0.18, top, cw * 1.36, Math.max(1.2, cw * 0.32), capC);
    }
  }
  function windows(c, x, y, w, h, nx, ny, L, seed, lit) {
    var r = rng(seed), gx = w / nx, gy = h / ny, on = L.night;
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
      var wx = x + i * gx + gx * 0.32, wy = y + j * gy + gy * 0.3, ww = gx * 0.36, wh = gy * 0.46, lightUp = r() < 0.72;
      rect(c, wx, wy, ww, wh, css(shade([128, 96, 70], 0.25 + lit * 0.35, L, 0)));
      if (on > 0.05 && lightUp) { rect(c, wx, wy, ww, wh, css(L.window, on * (0.7 + r() * 0.3))); }
    }
  }

  // ------------------------------------------------------------------------------------------------ the buildings
  function paintBuilding(c, b, L, F) {
    var x = b.x - b.w / 2, by = b.y, w = b.w, h = b.h, s = b.side, depth = b.row < 0 ? 0.1 : clamp(0.1 - b.row * 0.025, 0, 0.1), dx = s * w * 0.2, dy = -w * 0.09;
    var sideLit = s > 0 ? F.right : F.left, t = b.type, r = rng(b.seed);
    var front = function (m, k) { return css(shade(m, F.front * (k == null ? 1 : k), L, depth)); };
    var side = function (m) { return css(shade(m, sideLit * 0.9, L, depth)); };
    var top = function (m) { return css(shade(m, F.top, L, depth)); };
    if (b.row < 0) { c.save(); c.beginPath(); c.rect(860, 150, 580, 160); c.clip(); }   // hilltop shadows stay on the rock
    groundShadow(c, x, by, w, h * (t === 'parthenon' ? 0.9 : 1), Math.abs(dx), F, L);
    if (b.row < 0) c.restore();
    if (t === 'parthenon' || t === 'temple' || t === 'nike' || t === 'mint' || t === 'treasury' || t === 'library' || t === 'shrine' || t === 'erechtheion' || t === 'propylaea') {
      var steps = t === 'shrine' || t === 'nike' ? 2 : 3, sh = h * 0.05, ww = w;
      for (var i = 0; i < steps; i++) { box(c, x + i * sh * 0.8, by - i * sh, ww - i * sh * 1.6, sh, dx, dy, front(MAT.stone, 0.95), side(MAT.stone), top(MAT.marble)); }
      var sb = by - steps * sh, inset = steps * sh * 0.8, cx0 = x + inset, cx1 = x + w - inset, colTop = sb - h * (t === 'parthenon' ? 0.56 : 0.5);
      // the cella wall behind the columns, the side colonnade on the visible side
      box(c, cx0 + w * 0.06, sb, cx1 - cx0 - w * 0.12, sb - colTop, dx * 0.92, dy * 0.92, css(shade(MAT.marble2, F.front * 0.45, L, depth)), side(MAT.marble2), null);
      if (L.night > 0.1) { c.fillStyle = css(L.window, 0.55 * L.night); c.fillRect(x + w * 0.42, colTop + (sb - colTop) * 0.3, w * 0.16, (sb - colTop) * 0.7); }   // the lamp-lit door inside
      var ncol = t === 'parthenon' ? 8 : t === 'shrine' || t === 'nike' ? 4 : t === 'erechtheion' ? 6 : t === 'propylaea' ? 6 : 6, cw = Math.max(1.6, (cx1 - cx0) / (ncol * 2.1));
      if (dx) { for (var k = 1; k < (t === 'parthenon' ? 9 : 4); k++) { var u = k / (t === 'parthenon' ? 9 : 4), px = (s > 0 ? cx1 : cx0) + dx * u, py = sb + dy * u; rect(c, px - cw * 0.35, py - (sb - colTop), cw * 0.7, sb - colTop, css(shade(MAT.marble, sideLit * 0.8, L, depth + 0.02))); } }
      columns(c, cx0, cx1, colTop, sb, ncol, cw, MAT.marble, F.front, L, depth);
      // entablature: architrave + a painted frieze (blue / red, the way the Greeks painted them) + cornice
      var eh = h * 0.13, et = colTop - eh;
      box(c, cx0 - cw * 0.3, colTop, cx1 - cx0 + cw * 0.6, eh, dx, dy, front(MAT.marble, 0.92), side(MAT.marble), null);
      rect(c, cx0, et + eh * 0.42, cx1 - cx0, eh * 0.34, css(shade(t === 'mint' || t === 'treasury' ? MAT.gold : MAT.paint, F.front * 0.85, L, depth), 0.8));
      if (w > 60) for (var q = 0; q < (cx1 - cx0) / 5; q++) rect(c, cx0 + q * 5 + 1, et + eh * 0.42, 1.2, eh * 0.34, css(shade(MAT.marble, F.front, L, depth), 0.65));
      // gable roof: the two slopes going back along the depth, the front pediment with its gilded tips
      var px0 = cx0 - cw * 0.4, px1 = cx1 + cw * 0.4, apx = (px0 + px1) / 2, ph = (px1 - px0) * (t === 'parthenon' ? 0.13 : 0.2), apy = et - ph;
      if (t === 'erechtheion' || t === 'propylaea') ph *= 0.75, apy = et - ph;
      poly(c, [px0, et, apx, apy, apx + dx, apy + dy, px0 + dx, et + dy], css(shade(MAT.tile, F.top * 0.8 + 0.1, L, depth)));
      poly(c, [apx, apy, px1, et, px1 + dx, et + dy, apx + dx, apy + dy], css(shade(MAT.tile, (s > 0 ? F.right : F.left) * 0.7 + F.top * 0.4, L, depth)));
      poly(c, [px0, et, apx, apy, px1, et], front(MAT.marble, 0.98));
      poly(c, [px0 + (px1 - px0) * 0.1, et - 0.6, apx, apy + ph * 0.24, px1 - (px1 - px0) * 0.1, et - 0.6], css(shade(t === 'mint' ? MAT.gold : MAT.paint, F.front * 0.6, L, depth), 0.55));
      c.strokeStyle = css(shade(MAT.marble, Math.min(1, F.front + 0.2), L, depth)); c.lineWidth = Math.max(0.8, h * 0.018);
      c.beginPath(); c.moveTo(px0, et); c.lineTo(apx, apy); c.lineTo(px1, et); c.stroke();
      rect(c, apx - 1.4, apy - 3.2, 2.8, 3.2, css(shade(MAT.gold, 0.9, L, 0)));
      rect(c, px0 - 1, et - 2.6, 2.4, 2.6, css(shade(MAT.gold, 0.9, L, 0))); rect(c, px1 - 1.4, et - 2.6, 2.4, 2.6, css(shade(MAT.gold, 0.9, L, 0)));
      if (t === 'mint' || t === 'treasury') {   // the minted owl coin on the pediment
        var cr = ph * 0.42; c.beginPath(); c.arc(apx, et - ph * 0.42, cr, 0, Math.PI * 2); c.fillStyle = css(shade(MAT.gold, 0.95 + 0.05, L, 0)); c.fill();
        c.beginPath(); c.arc(apx, et - ph * 0.42, cr * 0.62, 0, Math.PI * 2); c.strokeStyle = css(shade([150, 112, 40], 0.8, L, 0)); c.lineWidth = Math.max(0.6, cr * 0.16); c.stroke();
      }
      if (t === 'erechtheion') {   // the porch of the maidens on the visible side
        var pX = s > 0 ? x + w * 0.66 : x + w * 0.04, pw = w * 0.3, pt = sb - h * 0.38;
        rect(c, pX, pt - h * 0.06, pw, h * 0.06, front(MAT.marble)); for (var m2 = 0; m2 < 4; m2++) { rect(c, pX + 2 + m2 * (pw - 4) / 3.2, pt, Math.max(1.5, pw * 0.09), sb - pt, front(MAT.marble2, 0.9)); }
      }
      return;
    }
    if (t === 'tholos') {
      var R = w / 2, cx = b.x, base = by - h * 0.08;
      box(c, x, by, w, h * 0.08, 0, 0, front(MAT.stone), null, null);
      var g = c.createLinearGradient(x, 0, x + w, 0), lt = L.sunSx < 0;
      g.addColorStop(0, css(shade(MAT.marble, lt ? F.front + 0.2 : F.front * 0.3, L, depth))); g.addColorStop(0.5, css(shade(MAT.marble, F.front, L, depth))); g.addColorStop(1, css(shade(MAT.marble, lt ? F.front * 0.3 : F.front + 0.2, L, depth)));
      var wallTop = base - h * 0.5; rect(c, x + w * 0.08, wallTop, w * 0.84, base - wallTop, g);
      for (var j = 0; j < 7; j++) { var ang = (j + 0.5) / 7 * Math.PI, xc = cx - Math.cos(ang) * R * 0.86; rect(c, xc - 1, wallTop, 2.1, base - wallTop, css(shade(MAT.marble, F.front + 0.1, L, depth), 0.9)); }
      rect(c, x + w * 0.02, wallTop - h * 0.07, w * 0.96, h * 0.07, front(MAT.marble));
      poly(c, [x + w * 0.02, wallTop - h * 0.07, cx, wallTop - h * 0.42, x + w * 0.98, wallTop - h * 0.07], css(shade(MAT.tile, F.top, L, depth)));
      poly(c, [cx, wallTop - h * 0.42, x + w * 0.98, wallTop - h * 0.07, cx + R * 0.2, wallTop - h * 0.07], css(shade(MAT.tile, F.top * 0.5, L, depth), 0.6));
      rect(c, cx - 1.3, wallTop - h * 0.47, 2.6, h * 0.06, css(shade(MAT.gold, 0.9, L, 0)));
      if (L.night > 0.1) rect(c, cx - w * 0.08, base - h * 0.3, w * 0.16, h * 0.3, css(L.window, 0.6 * L.night));
      return;
    }
    if (t === 'windtower' || t === 'watchtower' || t === 'fort') {
      var tw = t === 'fort' ? w * 0.44 : w;
      if (t === 'fort') {   // a low walled hall with a tower
        box(c, x, by, w, h * 0.5, dx, dy, front(MAT.stone, 0.9), side(MAT.stone), top(MAT.stone));
        for (var b2 = 0; b2 < 6; b2++) rect(c, x + b2 * w / 6, by - h * 0.56, w / 12, h * 0.06, front(MAT.stone));
        windows(c, x + w * 0.05, by - h * 0.42, w * 0.5, h * 0.22, 3, 1, L, b.seed, F.front);
        x = x + w * 0.52; w = tw;
      }
      box(c, x, by, w, h, dx * 0.5, dy * 0.5, front(MAT.marble2, 0.92), side(MAT.marble2), null);
      rect(c, x + w * 0.5 + (L.sunSx < 0 ? -w * 0.5 : 0), by - h, w * 0.5, h, css(shade(MAT.marble2, F.front * 0.55, L, depth), 0.5));
      windows(c, x, by - h * 0.86, w, h * 0.6, 1, 3, L, b.seed + 3, F.front);
      rect(c, x - w * 0.05, by - h - h * 0.06, w * 1.1, h * 0.06, front(MAT.marble));
      if (t === 'windtower') rect(c, x, by - h * 0.88, w, h * 0.08, css(shade(MAT.paint, F.front, L, depth), 0.7));
      poly(c, [x - w * 0.06, by - h * 1.06, x + w / 2, by - h * 1.06 - w * 0.55, x + w * 1.06, by - h * 1.06], css(shade(t === 'watchtower' ? MAT.bronze : MAT.tile, F.top, L, depth)));
      if (t === 'watchtower') rect(c, x + w / 2 - 0.6, by - h * 1.06 - w * 0.9, 1.2, w * 0.4, css(shade(MAT.bronze, 0.6, L, 0)));
      return;
    }
    if (t === 'odeon') {
      box(c, x, by, w, h, dx * 0.6, dy * 0.6, front(MAT.stone, 0.9), side(MAT.stone), top(MAT.stone));
      for (var row2 = 0; row2 < 3; row2++) for (var a3 = 0; a3 < 6; a3++) {
        var ax = x + w * 0.06 + a3 * w * 0.155, ay = by - h * 0.9 + row2 * h * 0.3, aw = w * 0.09, ah = h * 0.2;
        c.beginPath(); c.moveTo(ax, ay + ah); c.lineTo(ax, ay + aw / 2); c.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0); c.lineTo(ax + aw, ay + ah); c.closePath();
        c.fillStyle = L.night > 0.2 && (a3 + row2) % 2 === 0 ? css(L.window, 0.75 * L.night) : css(shade([70, 52, 40], 0.2, L, depth)); c.fill();
      }
      return;
    }
    if (t === 'theatre') {   // the cavea cut into the hill: rows of seats in arcs, the stage building in front
      var cxT = b.x, rT = w / 2;
      for (var ring = 0; ring < 7; ring++) {
        var rr = rT * (1 - ring * 0.11); c.beginPath(); c.ellipse(cxT, by - h * 0.2, rr, rr * 0.42, 0, Math.PI, 0); c.closePath();
        c.fillStyle = css(shade(ring % 2 ? MAT.stone : MAT.marble2, F.top * (0.75 + ring * 0.03), L, depth)); c.fill();
      }
      box(c, x + w * 0.2, by, w * 0.6, h * 0.42, dx * 0.4, dy * 0.4, front(MAT.marble), side(MAT.marble), top(MAT.marble));
      columns(c, x + w * 0.24, x + w * 0.76, by - h * 0.36, by - 1, 6, 1.8, MAT.marble, F.front, L, depth);
      return;
    }
    if (t === 'stoa' || t === 'shipshed') {
      box(c, x, by, w, h * 0.12, dx, dy, front(MAT.stone), side(MAT.stone), top(MAT.marble));
      var st = by - h * 0.12, ctop = st - h * 0.6;
      box(c, x + w * 0.03, st, w * 0.94, st - ctop, dx * 0.9, dy * 0.9, css(shade(MAT.plaster, F.front * 0.35, L, depth)), side(MAT.plaster), null);
      if (L.night > 0.1) for (var lmp = 0; lmp < 3; lmp++) rect(c, x + w * (0.2 + lmp * 0.28), st - (st - ctop) * 0.6, w * 0.06, (st - ctop) * 0.6, css(L.window, 0.5 * L.night));
      columns(c, x + w * 0.03, x + w * 0.97, ctop, st, t === 'shipshed' ? 5 : Math.max(5, Math.round(w / 9)), Math.max(1.4, w * 0.022), MAT.marble, F.front, L, depth);
      box(c, x, ctop, w, h * 0.1, dx, dy, front(MAT.marble, 0.95), side(MAT.marble), null);
      var rt = ctop - h * 0.1;
      poly(c, [x - 2, rt, x + w + 2, rt, x + w + 2 + dx, rt + dy - h * 0.22, x - 2 + dx, rt + dy - h * 0.22], css(shade(MAT.tile, F.top, L, depth)));
      c.strokeStyle = css(shade(MAT.tile, F.top * 0.6, L, depth)); c.lineWidth = 0.8;
      for (var tl = 1; tl < 8; tl++) { var tu = tl / 8; c.beginPath(); c.moveTo(x - 2 + dx * tu, rt + (dy - h * 0.22) * tu); c.lineTo(x + w + 2 + dx * tu, rt + (dy - h * 0.22) * tu); c.stroke(); }
      return;
    }
    if (t === 'forge') {
      box(c, x, by, w, h * 0.7, dx, dy, front(MAT.plaster, 0.9), side(MAT.plaster), null);
      poly(c, [x - 2, by - h * 0.7, x + w * 0.5, by - h, x + w + 2, by - h * 0.7], css(shade(MAT.tile, F.top, L, depth)));
      poly(c, [x + w * 0.5, by - h, x + w + 2, by - h * 0.7, x + w + 2 + dx, by - h * 0.7 + dy, x + w * 0.5 + dx, by - h + dy], css(shade(MAT.tile, F.top * 0.7, L, depth)));
      box(c, x + w * 0.7, by - h * 0.85, w * 0.12, h * 0.4, dx * 0.3, dy * 0.3, front(MAT.stone), side(MAT.stone), null);
      var fg = c.createRadialGradient(x + w * 0.3, by - h * 0.18, 1, x + w * 0.3, by - h * 0.18, w * 0.3); fg.addColorStop(0, 'rgba(255,170,90,0.95)'); fg.addColorStop(1, 'rgba(160,60,20,0.9)');
      rect(c, x + w * 0.18, by - h * 0.42, w * 0.24, h * 0.42, fg);
      windows(c, x + w * 0.5, by - h * 0.55, w * 0.4, h * 0.25, 2, 1, L, b.seed, F.front);
      return;
    }
    if (t === 'houses') {   // a little block of houses (the data cities)
      var hs = [[0, 0.62, 0.36], [0.3, 0.86, 0.34], [0.62, 0.7, 0.38]];
      for (var hh = 0; hh < hs.length; hh++) paintHouse(c, x + hs[hh][0] * w, by - (hh === 1 ? 3 : 0), hs[hh][2] * w * 1.12, hs[hh][1] * h, dx * 0.4, dy * 0.4, F, L, depth, b.seed + hh, sideLit, false);
      return;
    }
    if (t === 'villa') {
      paintHouse(c, x + w * 0.05, by, w * 0.62, h * 0.82, dx * 0.6, dy * 0.6, F, L, depth, b.seed, sideLit, false);
      var pg = x + w * 0.67;   // the pergola with its vine
      for (var p2 = 0; p2 < 3; p2++) rect(c, pg + p2 * w * 0.13, by - h * 0.62, 1.8, h * 0.62, css(shade(MAT.marble, F.front, L, depth)));
      rect(c, pg - 2, by - h * 0.66, w * 0.33, 2.2, css(shade(MAT.wood, F.top, L, depth)));
      for (var v = 0; v < 9; v++) { c.beginPath(); c.arc(pg + r() * w * 0.32, by - h * 0.66 + r() * 4 - 1, 2.6 + r() * 2.4, 0, Math.PI * 2); c.fillStyle = css(shade(r() < 0.25 ? [168, 70, 110] : MAT.olive2, F.top, L, depth)); c.fill(); }
      return;
    }
    paintHouse(c, x, by, w, h, dx, dy, F, L, depth, b.seed, sideLit, t === 'house2');
  }
  function paintHouse(c, x, by, w, h, dx, dy, F, L, depth, seed, sideLit, tall) {
    var r = rng(seed), wallC = r() < 0.5 ? MAT.plaster : [226, 204, 172], bodyH = h * (tall ? 0.78 : 0.68);
    box(c, x, by, w, bodyH, dx, dy, css(shade(wallC, F.front, L, depth)), css(shade(wallC, sideLit * 0.9, L, depth)), null);
    windows(c, x + w * 0.04, by - bodyH * 0.92, w * 0.92, bodyH * 0.6, Math.max(2, Math.round(w / 16)), tall ? 2 : 1, L, seed, F.front);
    rect(c, x + w * 0.42, by - bodyH * 0.42, w * 0.16, bodyH * 0.42, css(shade(MAT.wood, F.front * 0.7, L, depth)));
    var rh = h - bodyH, rt = by - bodyH;
    poly(c, [x - 2, rt, x + w / 2, rt - rh, x + w + 2, rt], css(shade(MAT.tile, F.top * 0.85 + 0.1, L, depth)));
    poly(c, [x + w / 2, rt - rh, x + w + 2, rt, x + w + 2 + dx, rt + dy, x + w / 2 + dx, rt - rh + dy], css(shade(MAT.terracotta, F.top * 0.6 + (dx > 0 ? F.right : F.left) * 0.4, L, depth)));
    if (dx < 0) poly(c, [x - 2, rt, x + w / 2, rt - rh, x + w / 2 + dx, rt - rh + dy, x - 2 + dx, rt + dy], css(shade(MAT.terracotta, F.top * 0.6 + F.left * 0.4, L, depth)));
  }

  // a stone retaining wall along a terrace (the row's arc), its top edge catching the light
  function paintTerrace(c, T, L, F, x0, x1) {
    var a = Math.max(T.xa, x0 - 20), b = Math.min(T.xb, x1 + 20); if (a >= b) return;
    var hgt = T.district === 'money' ? 3 : 9;
    c.beginPath(); var x;
    for (x = a; x <= b; x += 6) c.lineTo(x, rowY(T.row, x, T.cx, T.half) + 1);
    for (x = b; x >= a; x -= 6) c.lineTo(x, rowY(T.row, x, T.cx, T.half) + 1 + hgt);
    c.closePath(); c.fillStyle = css(shade(MAT.stone, F.front * 0.85, L, 0.05)); c.fill();
    c.beginPath(); for (x = a; x <= b; x += 6) c.lineTo(x, rowY(T.row, x, T.cx, T.half) + 1);
    c.strokeStyle = css(shade(MAT.marble, F.top, L, 0.05)); c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = css(shade([120, 100, 76], 0.3, L, 0.05), 0.5); c.lineWidth = 0.6;
    for (x = a; x < b; x += 13) { var y = rowY(T.row, x, T.cx, T.half); c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x, y + hgt); c.stroke(); }
  }

  // ------------------------------------------------------------------------------------------------ trees and scenery
  function cypress(c, x, by, h, L, depth, k) {
    var w = h * 0.2, col = shade(MAT.cypress, 0.35 + (k || 0) * 0.3, L, depth), hi = shade([70, 88, 54], 0.7, L, depth);
    c.beginPath(); c.moveTo(x, by - h); c.bezierCurveTo(x + w * 0.9, by - h * 0.7, x + w * 0.75, by - h * 0.1, x + w * 0.2, by); c.lineTo(x - w * 0.2, by); c.bezierCurveTo(x - w * 0.75, by - h * 0.1, x - w * 0.9, by - h * 0.7, x, by - h); c.fillStyle = css(col); c.fill();
    c.beginPath(); c.moveTo(x, by - h * 0.95); c.bezierCurveTo(x + (L.sunSx < 0 ? -w : w) * 0.6, by - h * 0.6, x + (L.sunSx < 0 ? -w : w) * 0.5, by - h * 0.2, x, by - h * 0.05); c.fillStyle = css(hi, 0.35 * (1 - L.night)); c.fill();
  }
  function olive(c, x, by, s, L, depth, seed) {
    var r = rng(seed);
    c.strokeStyle = css(shade([90, 74, 56], 0.4, L, depth)); c.lineWidth = s * 0.12; c.beginPath(); c.moveTo(x, by); c.quadraticCurveTo(x + s * 0.15, by - s * 0.4, x - s * 0.05, by - s * 0.7); c.stroke();
    for (var i = 0; i < 9; i++) {
      var ox = x + (r() - 0.5) * s * 1.3, oy = by - s * 0.72 - (r() - 0.3) * s * 0.55, rr = s * (0.22 + r() * 0.2), lit = 0.35 + (ox - x) * (L.sunSx < 0 ? -1 : 1) / s * 0.4 + 0.2;
      c.beginPath(); c.ellipse(ox, oy, rr * 1.25, rr, 0, 0, Math.PI * 2); c.fillStyle = css(shade(i % 3 ? MAT.olive : MAT.olive2, clamp(lit, 0.1, 1), L, depth), 0.94); c.fill();
    }
  }
  function torchSpots(b) {   // where its torches stand (design units), for the night pass
    if (/house|villa|houses/.test(b.type)) return [[b.x + b.w * 0.02, b.y - b.h * 0.25]];
    return [[b.x - b.w * 0.48, b.y - 1], [b.x + b.w * 0.48, b.y - 1]];
  }

  // ------------------------------------------------------------------------------------------------ the layers (baked)
  function paperGrain(seed) {
    var cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (!cv) return null;
    cv.width = cv.height = 192; var c = cv.getContext('2d'), r = rng(seed), img = c.createImageData(192, 192), d = img.data;
    for (var i = 0; i < d.length; i += 4) { var v = 118 + (r() - 0.5) * 70; d[i] = v; d[i + 1] = v * 0.98; d[i + 2] = v * 0.94; d[i + 3] = 255; }
    c.putImageData(img, 0, 0);
    c.globalAlpha = 0.12; for (var s = 0; s < 120; s++) { c.strokeStyle = r() < 0.5 ? '#fff' : '#000'; c.lineWidth = 0.6 + r() * 1.4; var x = r() * 192, y = r() * 192, a = -0.5 + r() * 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); c.stroke(); }
    return cv;
  }

  /** the far layer: the mountains of Attica and the islands, and the sea (all the way down; the land covers it) */
  function paintFar(c, Wl, L, F, seed) {
    var n = noise1(seed + 11), n2 = noise1(seed + 29), hz = HORIZON;
    var sea = c.createLinearGradient(0, hz, 0, H0);
    var seaTop = mix(shade(MAT.sea, 0.2 + F.top * 0.5, L, 0.55), L.horizon, 0.45 * (1 - L.night * 0.6)), seaLow = shade(MAT.deep, 0.3 + F.top * 0.5, L, 0.15);
    sea.addColorStop(0, css(seaTop)); sea.addColorStop(0.35, css(mix(seaTop, seaLow, 0.55))); sea.addColorStop(1, css(seaLow));
    c.fillStyle = sea; c.fillRect(0, hz, Wl, H0 - hz);
    // two ranges, the far one bluer (atmospheric perspective), lit on the sun side
    for (var layer = 0; layer < 2; layer++) {
      var base = layer ? [124, 120, 128] : [110, 118, 140], depth = layer ? 0.5 : 0.72, amp = layer ? 64 : 82, off = layer ? 18 : 2;
      c.beginPath(); c.moveTo(0, hz + 2);
      for (var x = 0; x <= Wl; x += 6) {
        var u = x / Wl, land = layer ? smooth((0.66 - u) / 0.12) : smooth((0.74 - u) / 0.1) * 0.9 + smooth((u - 0.86) / 0.06) * 0.35 * (u < 0.97 ? 1 : 0);
        var y = hz + off - land * (amp * (0.35 + 0.65 * fbm(layer ? n2 : n, x / (layer ? 140 : 210), 5)));
        c.lineTo(x, y);
      }
      c.lineTo(Wl, hz + 2); c.closePath();
      var g = c.createLinearGradient(0, hz - amp, 0, hz + 4);
      g.addColorStop(0, css(shade(base, F.top * 0.9, L, depth))); g.addColorStop(1, css(mix(shade(base, 0.2, L, depth), L.horizon, 0.55 * (1 - L.night * 0.5))));
      c.fillStyle = g; c.fill();
    }
    // islands on the sea horizon (Aegina and Salamis, roughly where they would be)
    var isl = [[0.8, 46, 15], [0.9, 30, 9], [0.95, 22, 6]];
    for (var i = 0; i < isl.length; i++) {
      var ix = isl[i][0] * Wl, iw = isl[i][1], ih = isl[i][2];
      c.beginPath(); c.moveTo(ix - iw, hz + 1); c.quadraticCurveTo(ix - iw * 0.3, hz - ih * 1.2, ix, hz - ih); c.quadraticCurveTo(ix + iw * 0.5, hz - ih * 0.8, ix + iw, hz + 1); c.closePath();
      c.fillStyle = css(mix(shade([110, 118, 140], F.top * 0.7, L, 0.65), L.horizon, 0.4)); c.fill();
    }
  }

  /** the middle hills: olive groves and far white houses, hazy */
  function paintMid(c, Wl, L, F, seed) {
    var n = noise1(seed + 5), hz = HORIZON, r = rng(seed + 9), depth = 0.36;
    var top = function (x) { var u = x / Wl, land = smooth((0.71 - u) / 0.09); return land < 0.01 ? H0 + 4 : hz + 46 - land * (34 + 44 * fbm(n, x / 120, 4)) + (1 - land) * (H0 - hz); };
    c.beginPath(); c.moveTo(0, H0);
    for (var x = 0; x <= Wl; x += 5) c.lineTo(x, top(x));
    c.lineTo(Wl, H0); c.closePath();
    var g = c.createLinearGradient(0, hz - 40, 0, H0);
    g.addColorStop(0, css(shade([142, 140, 104], F.top * 0.95, L, depth))); g.addColorStop(0.5, css(shade([118, 118, 84], F.top * 0.7, L, depth * 0.8))); g.addColorStop(1, css(shade([90, 88, 64], 0.4, L, 0.2)));
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    for (var i = 0; i < Wl / 9; i++) {   // groves, cypresses, little houses
      var tx = r() * Wl, ty = top(tx) + 6 + r() * 120; if (ty > H0) continue;
      var k = r();
      if (k < 0.55) { c.beginPath(); c.ellipse(tx, ty, 4 + r() * 5, 3 + r() * 2.5, 0, 0, Math.PI * 2); c.fillStyle = css(shade(MAT.olive, 0.3 + r() * 0.4, L, depth), 0.8); c.fill(); }
      else if (k < 0.75) cypress(c, tx, ty + 2, 14 + r() * 14, L, depth, 0.3);
      else { var hw2 = 6 + r() * 6; rect(c, tx, ty - hw2 * 0.6, hw2, hw2 * 0.6, css(shade(MAT.plaster, F.front, L, depth))); rect(c, tx - 0.6, ty - hw2 * 0.78, hw2 + 1.2, hw2 * 0.2, css(shade(MAT.terracotta, F.top, L, depth))); if (L.night > 0.2 && r() < 0.6) rect(c, tx + hw2 * 0.4, ty - hw2 * 0.4, 1.6, 1.6, css(L.window, L.night)); }
    }
    c.restore();
  }

  /** the city: ground, the Acropolis rock, the agora, the harbour, the gardens; then the buildings back to front */
  function paintMain(c, M, L, F, seed, x0, x1) {
    var r = rng(seed + 77), n = noise1(seed + 3);
    // ---- gardens hill (life)
    c.beginPath(); c.moveTo(-10, H0); for (var x = -10; x <= 760; x += 6) c.lineTo(x, gardenY(x)); c.lineTo(760, H0); c.closePath();
    var gg = c.createLinearGradient(0, 330, 0, H0); gg.addColorStop(0, css(shade([150, 150, 88], F.top, L, 0.08))); gg.addColorStop(1, css(shade([106, 110, 66], F.top * 0.7, L, 0)));
    c.fillStyle = gg; c.fill();
    if (x0 < 760) {
      for (var p = 0; p < 4; p++) { c.strokeStyle = css(shade(MAT.path, F.top, L, 0.05), 0.75); c.lineWidth = 3.2; c.beginPath(); var py = 400 + p * 66; c.moveTo(0, py + 6); c.bezierCurveTo(200, py - 10, 420, py + 16, 700, py - 4); c.stroke(); }
      for (var f = 0; f < 240; f++) { var fx = r() * 660, fy = gardenY(fx) + 6 + r() * 260; if (fy > H0 - 4) continue; c.fillStyle = css(shade([[176, 66, 96], [214, 172, 82], [150, 80, 150], [236, 226, 208]][f % 4], 0.6 + F.top * 0.4, L, 0.02), 0.85); c.fillRect(fx, fy, 2.2, 2.2); }
    }
    // ---- the agora plain and the harbour land
    c.beginPath(); c.moveTo(1640, H0); c.lineTo(1660, 410); c.bezierCurveTo(1800, 396, 2100, 394, 2400, 400); c.bezierCurveTo(2450, 430, 2440, 520, 2470, 552); c.lineTo(2920, 552); c.lineTo(2920, H0); c.closePath();
    var ag = c.createLinearGradient(0, 394, 0, H0); ag.addColorStop(0, css(shade([196, 178, 146], F.top, L, 0.08))); ag.addColorStop(1, css(shade([164, 146, 116], F.top * 0.8, L, 0)));
    c.fillStyle = ag; c.fill();
    c.strokeStyle = css(shade([150, 132, 104], F.top, L, 0.05), 0.35); c.lineWidth = 0.8;
    for (var gy = 410; gy < H0; gy += 14) { c.beginPath(); c.moveTo(1680, gy); c.lineTo(Math.min(2400, 2400 + (gy - 400) * 0.35), gy); c.stroke(); }
    // the quay: ashlar blocks with a lit top edge, and the mole out to the lighthouse
    rect(c, 2440, 552, 480, 12, css(shade(MAT.stone, F.top, L, 0.02)));
    rect(c, 2440, 564, 480, H0 - 564, css(shade(MAT.stone, F.front * 0.8, L, 0.02)));
    c.strokeStyle = css(shade([120, 104, 82], 0.3, L, 0)); c.lineWidth = 0.7; for (var qb = 2440; qb < 2920; qb += 22) { c.beginPath(); c.moveTo(qb, 564); c.lineTo(qb, H0); c.stroke(); }
    c.beginPath(); c.moveTo(2890, 552); c.bezierCurveTo(2880, 500, 2840, 472, 2780, 462); c.lineTo(2776, 470); c.bezierCurveTo(2830, 482, 2866, 510, 2872, 552); c.closePath(); c.fillStyle = css(shade(MAT.stone, F.top, L, 0.06)); c.fill();
    var lhx = 2780, lhy = 466;   // the lighthouse
    box(c, lhx - 7, lhy, 14, 58, -3, -1.5, css(shade(MAT.marble, F.front, L, 0.06)), css(shade(MAT.marble, F.left, L, 0.06)), null);
    rect(c, lhx - 9, lhy - 62, 18, 5, css(shade(MAT.marble, F.top, L, 0.06))); rect(c, lhx - 5, lhy - 72, 10, 10, css(shade(MAT.bronze, F.front, L, 0.06)));
    // ---- the Acropolis rock: limestone with strata, cliffs lit on the sun side, scrub on the slopes
    c.beginPath(); c.moveTo(520, H0); for (x = 520; x <= 1840; x += 4) c.lineTo(x, rockY(x) + (n(x / 9) - 0.5) * 3); c.lineTo(1840, H0); c.closePath();
    var rg = c.createLinearGradient(0, 210, 0, 560); rg.addColorStop(0, css(shade(MAT.rock, F.top * 0.9 + 0.1, L, 0.08))); rg.addColorStop(0.45, css(shade(MAT.rock2, F.front * 0.8 + 0.1, L, 0.05))); rg.addColorStop(1, css(shade([136, 120, 86], F.front * 0.6, L, 0)));
    c.fillStyle = rg; c.fill();
    c.save(); c.clip();
    // the sheer limestone face under the walls (the Acropolis's own cliff), with vertical cracks and scree at its foot
    var cliffBot = function (x) { return 284 + Math.sin(x * 0.031) * 10 + Math.sin(x * 0.11 + 2) * 5 + (n(x / 23) - 0.5) * 12; };
    c.beginPath(); for (var cx2 = 846; cx2 <= 1454; cx2 += 4) c.lineTo(cx2, Math.max(rockY(cx2), 214) + 6); for (cx2 = 1454; cx2 >= 846; cx2 -= 4) c.lineTo(cx2, cliffBot(cx2) - Math.max(0, Math.abs(cx2 - 1150) - 250) * 0.9);
    c.closePath();
    var cf = c.createLinearGradient(0, 214, 0, 300); cf.addColorStop(0, css(shade([226, 206, 168], F.front + 0.15, L, 0.06))); cf.addColorStop(0.7, css(shade([180, 156, 120], F.front * 0.75, L, 0.07))); cf.addColorStop(1, css(shade([120, 100, 76], F.front * 0.4, L, 0.08)));
    c.fillStyle = cf; c.fill();
    for (var ck = 0; ck < 70; ck++) {
      var kx = 852 + r() * 596, ky = 224 + r() * 20, kl = 16 + r() * 50, dark = r() < 0.6;
      c.strokeStyle = css(shade(dark ? [110, 90, 66] : [226, 208, 172], dark ? 0.3 : F.front + 0.1, L, 0.08), dark ? 0.45 : 0.35); c.lineWidth = dark ? 0.9 + r() * 1.4 : 0.8;
      c.beginPath(); c.moveTo(kx, ky); c.lineTo(kx + (r() - 0.5) * 6, ky + kl * 0.5); c.lineTo(kx + (r() - 0.5) * 8, Math.min(ky + kl, cliffBot(kx))); c.stroke();
    }
    for (ck = 0; ck < 160; ck++) { var sx2 = 846 + r() * 610, sy2 = cliffBot(sx2) - 2 + r() * 14; c.fillStyle = css(shade(r() < 0.5 ? [196, 176, 140] : [140, 118, 88], F.top * 0.8 + 0.1, L, 0.06), 0.7); c.fillRect(sx2, sy2, 1.5 + r() * 2.5, 1 + r() * 1.5); }
    var lit = L.sunSx < 0 ? -1 : 1;   // the cliff face toward the sun
    var cliffG = c.createLinearGradient(780, 0, 1520, 0);
    cliffG.addColorStop(0, css(shade(MAT.rock, lit < 0 ? F.left + 0.1 : F.left * 0.2, L, 0.06), 0.7)); cliffG.addColorStop(0.5, 'rgba(0,0,0,0)'); cliffG.addColorStop(1, css(shade(MAT.rock, lit > 0 ? F.right + 0.1 : F.right * 0.2, L, 0.06), 0.7));
    c.fillStyle = cliffG; c.fillRect(760, 200, 800, 200);
    for (var s = 0; s < 46; s++) {   // strata
      var sy = 226 + r() * 300, sx = 600 + r() * 1150, sl = 40 + r() * 160; if (sy < rockY(sx) + 4) continue;
      c.strokeStyle = css(shade(r() < 0.5 ? [120, 100, 74] : [206, 186, 150], F.top * 0.8, L, 0.05), 0.35); c.lineWidth = 0.8 + r() * 1.6;
      c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(sx + sl * 0.3, sy - 2, sx + sl * 0.7, sy + 3, sx + sl, sy + 1); c.stroke();
    }
    for (s = 0; s < 70; s++) {   // soft green on the lower slopes: grass, terraces of herbs
      var gx = 560 + r() * 1280, gyy = rockY(gx) + 50 + r() * 220; if (gyy > H0) continue;
      c.beginPath(); c.ellipse(gx, gyy, 30 + r() * 60, 8 + r() * 14, 0, 0, Math.PI * 2); c.fillStyle = css(shade(r() < 0.6 ? MAT.olive2 : [150, 140, 90], 0.3 + F.top * 0.6, L, 0.04), 0.22); c.fill();
    }
    for (s = 0; s < 120; s++) {   // scrub and small pines on the slopes
      var bx = 560 + r() * 1260, byy = rockY(bx) + 8 + r() * 200; if (byy > H0) continue;
      c.beginPath(); c.ellipse(bx, byy, 3 + r() * 6, 2 + r() * 3, 0, 0, Math.PI * 2); c.fillStyle = css(shade(r() < 0.7 ? MAT.olive2 : MAT.olive, 0.45 + F.top * 0.5, L, 0.04), 0.8); c.fill();
    }
    c.restore();
    // the walls along the rim of the plateau
    c.fillStyle = css(shade(MAT.stone, F.front, L, 0.08));
    c.beginPath(); c.moveTo(856, 232); for (x = 856; x <= 1446; x += 8) c.lineTo(x, Math.max(rockY(x), 214) + 16 + Math.sin(x * 0.02) * 2); for (x = 1446; x >= 856; x -= 8) c.lineTo(x, Math.max(rockY(x), 214) + 2); c.closePath(); c.fill();
    c.strokeStyle = css(shade([150, 130, 100], 0.3, L, 0.08), 0.5); c.lineWidth = 0.6; for (x = 860; x < 1446; x += 11) { c.beginPath(); c.moveTo(x, 218); c.lineTo(x, 230); c.stroke(); }
    // a zigzag path up to the gate, and the theatre of Dionysus cut into the south slope
    c.strokeStyle = css(shade(MAT.path, F.top, L, 0.06), 0.8); c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(640, 560); c.lineTo(760, 500); c.lineTo(700, 450); c.lineTo(820, 380); c.lineTo(790, 330); c.lineTo(880, 236); c.stroke();
    // trees between the terraces (behind the buildings)
    for (var tr = 0; tr < 60; tr++) {
      var txx = 40 + r() * 2360, tby = (txx < 650 ? gardenY(txx) : txx < 1800 ? rockY(txx) : 400) + 14 + r() * 150; if (tby > 600 || txx < x0 - 60 || txx > x1 + 60) continue;
      if (txx > 1800 && tby < 410) continue;
      if (r() < 0.5) cypress(c, txx, tby, 22 + r() * 26, L, 0.04, 0.5); else olive(c, txx, tby, 14 + r() * 10, L, 0.03, seed + tr);
    }
    // the bronze Athena between the gate and the Parthenon (her spear tip catches the light)
    var ax = 1050, ay = 214;
    rect(c, ax - 4, ay - 8, 8, 8, css(shade(MAT.stone, F.front, L, 0.1)));
    c.beginPath(); c.moveTo(ax - 3, ay - 8); c.lineTo(ax - 2, ay - 34); c.lineTo(ax + 2, ay - 34); c.lineTo(ax + 3, ay - 8); c.closePath(); c.fillStyle = css(shade(MAT.bronze, F.front, L, 0.1)); c.fill();
    c.beginPath(); c.arc(ax, ay - 37, 3, 0, Math.PI * 2); c.fill(); rect(c, ax + 4, ay - 52, 1, 46, css(shade(MAT.bronze, F.front, L, 0.1))); rect(c, ax + 3.4, ay - 56, 2.2, 5, css(shade(MAT.gold, 1, L, 0)));
    // the buildings, back to front (by base y)
    var items = [], T = M.terraces || [];
    for (var i = 0; i < M.buildings.length; i++) items.push({ k: M.buildings[i].y, b: M.buildings[i] });
    for (i = 0; i < T.length; i++) {
      items.push({ k: T[i].row[0] - 0.5, wall: T[i] });
      var rf = rng(seed + 900 + i), xs = M.buildings.filter(function (b) { return b.district === T[i].district && Math.abs(b.y - rowY(T[i].row, b.x, T[i].cx, T[i].half)) < 2; }).map(function (b) { return [b.x, b.w]; }).sort(function (a, b) { return a[0] - b[0]; });
      for (var fx = T[i].xa + 6; fx < T[i].xb - 6; fx += 15 + rf() * 16) {   // the town between the apps: small houses and trees just behind the row
        var clash = false; for (var q = 0; q < xs.length; q++) if (Math.abs(fx - xs[q][0]) < xs[q][1] * 0.42) clash = true;
        var fy = rowY(T[i].row, fx, T[i].cx, T[i].half) - 7 - rf() * 6, kind = rf();
        if (clash && kind < 0.75) continue;
        items.push({ k: fy - 0.2, fill: { x: fx, y: fy, kind: kind, w: 18 + rf() * 16, h: 16 + rf() * 12, seed: Math.floor(rf() * 1e9) } });
      }
    }
    items.sort(function (a, b) { return a.k - b.k; });
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.b) { if (it.b.x + it.b.w < x0 - 40 || it.b.x - it.b.w > x1 + 40) continue; paintBuilding(c, it.b, L, F); }
      else if (it.wall) paintTerrace(c, it.wall, L, F, x0, x1);
      else { var f2 = it.fill; if (f2.x < x0 - 40 || f2.x > x1 + 40) continue;
        if (f2.kind < 0.62) paintHouse(c, f2.x - f2.w / 2, f2.y, f2.w, f2.h, (f2.x < 1150 ? 1 : -1) * f2.w * 0.18, -f2.w * 0.08, F, L, 0.07, f2.seed, f2.x < 1150 ? F.right : F.left, f2.kind < 0.2);
        else if (f2.kind < 0.85) cypress(c, f2.x, f2.y + 6, 18 + f2.h * 0.8, L, 0.05, 0.4); else olive(c, f2.x, f2.y + 6, 9 + f2.w * 0.25, L, 0.05, f2.seed); }
    }
    // trees in front of the bottom row
    for (tr = 0; tr < 26; tr++) {
      var fx2 = r() * 2440, fy2 = 572 + r() * 40; if (fx2 < x0 - 60 || fx2 > x1 + 60) continue;
      olive(c, fx2, fy2, 16 + r() * 10, L, 0, seed + 400 + tr);
    }
  }

  /** the foreground: dark olive and cypress, stone, flowers (it slides faster than the city) */
  function paintFore(c, Wl, L, F, seed) {
    var r = rng(seed + 300), dark = shade([46, 50, 34], 0.25, L, 0), dark2 = shade([62, 66, 42], 0.35, L, 0);
    for (var x = 0; x < Wl; x += 380 + r() * 260) {
      var k = r();
      if (k < 0.4) cypress(c, x, H0 + 10, 120 + r() * 60, L, 0, 0.2);
      else if (k < 0.75) { for (var i = 0; i < 7; i++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * 70, H0 - 8 - r() * 22, 18 + r() * 16, 10 + r() * 8, 0, 0, Math.PI * 2); c.fillStyle = css(i % 2 ? dark : dark2, 0.96); c.fill(); } }
      else { rect(c, x, H0 - 30, 46 + r() * 30, 30, css(shade(MAT.marble2, F.front * 0.6, L, 0))); rect(c, x - 3, H0 - 34, 54 + r() * 30, 5, css(shade(MAT.marble, F.top * 0.8, L, 0))); }
      for (var fl = 0; fl < 6; fl++) { c.fillStyle = css(shade(fl % 2 ? [176, 58, 48] : [214, 172, 82], 0.5 + F.top * 0.5, L, 0), 0.9); c.beginPath(); c.arc(x + (r() - 0.5) * 90, H0 - 6 - r() * 16, 1.8 + r() * 1.4, 0, Math.PI * 2); c.fill(); }
    }
  }

  /** the sky strip, 360 degrees wide (x = azimuth * pxPerDeg), baked per light */
  function paintSkyStrip(c, wDeg, ppd, hz, L, sun) {
    var w = 360 * ppd, g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, css(L.zenith)); g.addColorStop(0.55, css(L.upper)); g.addColorStop(0.9, css(mix(L.upper, L.horizon, 0.7))); g.addColorStop(1, css(L.horizon));
    c.fillStyle = g; c.fillRect(0, 0, w, hz + 2);
    // the warm glow on the Sun's side of the sky, strongest at the horizon at dawn and dusk
    var glow = clamp(1 - Math.abs(sun.alt - 1) / 14, 0, 1) * (1 - L.cloud * 0.6);
    if (glow > 0.01) {   // the belt of Venus: a rose band low in the sky all round, above the blue shadow of the earth
      var bv = c.createLinearGradient(0, hz - 60 * ppd / 4, 0, hz);
      bv.addColorStop(0, css([214, 150, 170], 0)); bv.addColorStop(0.55, css([222, 160, 168], 0.32 * glow)); bv.addColorStop(0.85, css([150, 140, 180], 0.28 * glow)); bv.addColorStop(1, css([120, 120, 170], 0.2 * glow));
      c.fillStyle = bv; c.fillRect(0, hz - 60 * ppd / 4, w, 60 * ppd / 4 + 2);
    }
    if (glow > 0.01) {
      for (var rep = -1; rep <= 1; rep++) {
        var sx = sun.az * ppd + rep * w, sy = hz - Math.max(sun.alt, -4) * ppd;
        var rg = c.createRadialGradient(sx, sy, 2, sx, sy, 110 * ppd);
        rg.addColorStop(0, css([255, 214, 150], 0.75 * glow)); rg.addColorStop(0.25, css([248, 164, 104], 0.42 * glow)); rg.addColorStop(1, css([200, 110, 110], 0));
        c.fillStyle = rg; c.fillRect(0, 0, w, hz + 2);
      }
    }
    // the city's warm light on the night horizon
    if (L.night > 0) { var cg = c.createLinearGradient(0, hz - 40, 0, hz); cg.addColorStop(0, 'rgba(120,80,60,0)'); cg.addColorStop(1, css([140, 96, 72], 0.35 * L.night)); c.fillStyle = cg; c.fillRect(0, hz - 40, w, 42); }
  }

  function makeCloud(c, w, h, seed, L, sunSide) {
    var r = rng(seed), puffs = 26 + Math.floor(r() * 14);
    var litC = mix(mix([255, 250, 240], L.light, 0.55 * (L.golden + 0.2)), L.horizon, 0.25), darkC = mix(L.shade, L.upper, 0.35);
    if (L.night > 0.5) { litC = mix([96, 104, 140], [150, 150, 170], L.cloud * 0.4); darkC = [40, 44, 72]; }
    for (var i = 0; i < puffs; i++) {
      var u = r(), px = w * (0.1 + u * 0.8), dome = Math.sin(u * Math.PI), pr = h * (0.1 + r() * 0.16) * (0.6 + dome * 0.6), py = h * 0.78 - pr * 0.5 - r() * dome * h * 0.38;
      var g = c.createRadialGradient(px - sunSide * pr * 0.3, py - pr * 0.45, pr * 0.05, px, py, pr * 1.25);
      g.addColorStop(0, css(litC, 0.55)); g.addColorStop(0.55, css(mix(litC, darkC, 0.45), 0.34)); g.addColorStop(1, css(darkC, 0));
      c.fillStyle = g; c.beginPath(); c.ellipse(px, py, pr * 1.6, pr * 1.0, 0, 0, Math.PI * 2); c.fill();
    }
  }

  // ------------------------------------------------------------------------------------------------ the live city
  function create(host, opts) {
    opts = opts || {};
    var doc = host.ownerDocument, win = doc.defaultView;
    var cv = doc.createElement('canvas'); cv.className = 'polis-canvas'; cv.setAttribute('aria-hidden', 'true');
    host.insertBefore(cv, host.firstChild);
    var ctx = cv.getContext('2d');
    var st = { apps: opts.apps || [], ships: opts.ships || [], fresh: {}, treasury: false, weather: opts.weather || {}, time: opts.time || Date.now(), timeFixed: !!opts.time,
      quality: opts.quality === 'low' ? 'low' : 'high', reduced: !!opts.reduced, pan: 0, panMax: 0, tiltX: 0, tiltY: 0, scrollY: 0, selected: null, hover: null,
      seed: opts.seed || 20261111, plates: [], frames: 0, fps: 0, lastBake: 0, star: null, starQueue: 0, motes: [], running: false, dirty: true, visible: true, bakes: 0, frameMs: 0 };
    var M = layout(st.apps), lay = {}, view = { w: 0, h: 0, k: 1, dpr: 1 }, L = null, F = null, sunNow = null, moonNow = null, sky = null, stars = null, mw = null, field = null, grain = null, clouds = [];
    var scroller = opts.scroller || null;

    function nowMs() { return st.timeFixed ? st.time : Date.now(); }
    function lightAt(ms) {
      var s = SKY.sun(ms), m = SKY.moon(ms), ph = SKY.phase(ms), P = palette(s.alt, ph.rising, st.weather);
      P.sunAz = s.az; P.sunSx = -Math.sin(s.az * D2R); P.moonAlt = m.alt;
      if (s.alt < -4 && m.alt > 0) { var mk = m.frac * 0.5 * smooth(m.alt / 10); P.amb = mix(P.amb, [70, 84, 130], mk * 0.5); P.light = [150, 166, 210]; P.strength = Math.max(P.strength, 0.12 * mk); P.sunAz = m.az; P.sunSx = -Math.sin(m.az * D2R); }
      return { P: P, s: s, m: m, ph: ph };
    }

    function size() {
      var r = host.getBoundingClientRect(), dpr = Math.min(win.devicePixelRatio || 1, st.quality === 'low' ? 1.5 : 2);
      view.w = Math.max(320, Math.round(r.width)); view.h = Math.max(380, Math.round(r.height)); view.k = view.h / (H0 + PAD); view.dpr = dpr;
      view.ppd = view.k * (HORIZON + PAD) / 70;   // px per degree: the horizon sits ~66 deg below the top
      cv.width = Math.round(view.w * dpr); cv.height = Math.round(view.h * dpr); cv.style.width = view.w + 'px'; cv.style.height = view.h + 'px';
      st.panMax = Math.max(0, M.W * view.k - view.w);
      st.pan = clamp(st.pan, 0, st.panMax);
      bake();
    }
    // out: the layer set to fill (the live one, or the next one of a sliced re-bake); jobs: when given, each tile becomes one job (painted later)
    function makeLayer(name, factor, worldW, res, painter, out, jobs) {
      var Wl = worldW, tiles = [], tileW = 1024, vk = view.k, vh = view.h, kp = vk * res, nT = Math.ceil(Wl * vk / tileW);
      function tile(i) {
        var t = doc.createElement('canvas'), cssW = Math.min(tileW, Wl * vk - i * tileW);
        t.width = Math.max(1, Math.ceil(cssW * res)); t.height = Math.ceil(vh * res);
        var c = t.getContext('2d'); c.setTransform(kp, 0, 0, kp, -i * tileW * res, PAD * kp);
        var x0 = i * tileW / vk, x1 = x0 + cssW / vk;
        painter(c, Wl, x0, x1);
        if (grain && name !== 'far') { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = name === 'main' ? 0.07 : 0.05; c.fillStyle = c.createPattern(grain, 'repeat'); c.fillRect(0, 0, t.width, t.height); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
        tiles.push({ cv: t, x: i * tileW, w: cssW });
      }
      for (var i = 0; i < nT; i++) { if (jobs) jobs.push(tile.bind(null, i)); else tile(i); }
      (out || lay)[name] = { factor: factor, tiles: tiles, Wl: Wl };
    }
    // perf v2 (2026-11-14, docs/OLYMPUS_PERF.md): the light follows the clock, so the city is baked again every 2 minutes; that bake painted every
    // layer in one task (seconds on a phone, 8 s on a software GPU): the page froze every 2 minutes. The clock's re-bake now paints one tile per
    // task (about 12 ms of work before it yields) into a NEW layer set; the old one stays on screen until the new set is complete, then both swap
    // in one frame: the same picture, without the freeze. A resize, setTime and setWeather still bake at once (and drop a re-bake in flight).
    var slice = null;
    function bakeSliced() {
      if (slice) return;
      var t0 = Date.now(), ms = nowMs(), A = lightAt(ms), nL = A.P, nF = faces(nL), next = {}, jobs = [], nSky = null, nClouds = [];
      st.lastBake = ms;
      var vwD = view.w / view.k, panD = st.panMax / view.k, res = view.dpr, lowRes = st.quality === 'low' ? 0.5 : 0.6, ppd = view.ppd, vk = view.k;
      makeLayer('far', 0.5, vwD + panD * 0.5 + 40, Math.max(0.5, res * lowRes), function (c, Wl) { paintFar(c, Wl, nL, nF, st.seed); }, next, jobs);
      makeLayer('mid', 0.7, vwD + panD * 0.7 + 40, Math.max(0.6, res * 0.75), function (c, Wl) { paintMid(c, Wl, nL, nF, st.seed); }, next, jobs);
      makeLayer('main', 1, M.W, Math.min(res, 2), function (c, Wl, x0, x1) { paintMain(c, M, nL, nF, st.seed, x0, x1); }, next, jobs);
      makeLayer('fore', 1.25, vwD + panD * 1.25 + 40, Math.min(res, 1.5), function (c, Wl) { paintFore(c, Wl, nL, nF, st.seed); }, next, jobs);
      jobs.push(function () {
        var sw = Math.ceil(360 * ppd), shz = Math.round((HORIZON + PAD) * vk);
        nSky = doc.createElement('canvas'); nSky.width = Math.ceil(sw * 0.5); nSky.height = Math.ceil((shz + 2) * 0.5);
        var sc = nSky.getContext('2d'); sc.scale(0.5, 0.5); paintSkyStrip(sc, 360, ppd, shz, nL, A.s);
        var r = rng(st.seed + 51), nC = Math.round(3 + st.weather.cloud * 12 + (nL.night > 0.6 ? 1 : 3));
        for (var i = 0; i < nC; i++) {
          var cw = (110 + r() * 170) * vk, ch = cw * (0.3 + r() * 0.1), spr = doc.createElement('canvas'); spr.width = Math.ceil(cw * 0.35); spr.height = Math.ceil(ch * 0.35);
          var c2 = spr.getContext('2d'); c2.scale(0.35, 0.35); makeCloud(c2, cw, ch, st.seed + i * 17, nL, nL.sunSx < 0 ? -1 : 1);
          nClouds.push({ cv: spr, w: cw, h: ch, az: r() * 360, alt: 6 + r() * (st.weather.cloud > 0.5 ? 20 : 34), speed: (0.4 + r() * 0.8) * (r() < 0.5 ? 1 : 1) });
        }
      });
      jobs.push(function () {                          // the swap: one frame shows the new light everywhere
        L = nL; F = nF; sunNow = A.s; moonNow = A.m; st.phase = A.ph.name; st.bakes++; lay = next; sky = nSky; clouds = nClouds;
        project(ms); st.bakeMs = Date.now() - t0; st.slicedBakes = (st.slicedBakes || 0) + 1; st.dirty = true; kick();
      });
      var me = slice = { w: view.w, h: view.h, dpr: view.dpr };
      (function run() {
        if (slice !== me) return;                      // a synchronous bake (resize, setTime, setWeather) replaced it
        var s0 = Date.now();
        do { jobs.shift()(); } while (jobs.length && Date.now() - s0 < 12);
        if (jobs.length) win.setTimeout(run, 0); else slice = null;
      })();
    }
    function bake() {
      slice = null;
      var t0 = Date.now(), ms = nowMs(), A = lightAt(ms); L = A.P; F = faces(L); sunNow = A.s; moonNow = A.m; st.phase = A.ph.name; st.lastBake = ms; st.bakes++;
      if (!grain) grain = paperGrain(st.seed);
      var vwD = view.w / view.k, panD = st.panMax / view.k, res = view.dpr, lowRes = st.quality === 'low' ? 0.5 : 0.6;
      // far (0.5) and mid (0.7): softer, lower resolution = natural blur of distance
      makeLayer('far', 0.5, vwD + panD * 0.5 + 40, Math.max(0.5, res * lowRes), function (c, Wl) { paintFar(c, Wl, L, F, st.seed); });
      makeLayer('mid', 0.7, vwD + panD * 0.7 + 40, Math.max(0.6, res * 0.75), function (c, Wl) { paintMid(c, Wl, L, F, st.seed); });
      makeLayer('main', 1, M.W, Math.min(res, 2), function (c, Wl, x0, x1) { paintMain(c, M, L, F, st.seed, x0, x1); });
      makeLayer('fore', 1.25, vwD + panD * 1.25 + 40, Math.min(res, 1.5), function (c, Wl) { paintFore(c, Wl, L, F, st.seed); });
      // the sky strip (360 deg), at a low resolution: gradients only
      var sw = Math.ceil(360 * view.ppd), shz = Math.round((HORIZON + PAD) * view.k);
      sky = doc.createElement('canvas'); sky.width = Math.ceil(sw * 0.5); sky.height = Math.ceil((shz + 2) * 0.5);
      var sc = sky.getContext('2d'); sc.scale(0.5, 0.5); paintSkyStrip(sc, 360, view.ppd, shz, L, sunNow);
      // the clouds as sprites (weather adds more)
      clouds = []; var r = rng(st.seed + 51), nC = Math.round(3 + st.weather.cloud * 12 + (L.night > 0.6 ? 1 : 3));
      for (var i = 0; i < nC; i++) {
        var cw = (110 + r() * 170) * view.k, ch = cw * (0.3 + r() * 0.1), spr = doc.createElement('canvas'); spr.width = Math.ceil(cw * 0.35); spr.height = Math.ceil(ch * 0.35);
        var c2 = spr.getContext('2d'); c2.scale(0.35, 0.35); makeCloud(c2, cw, ch, st.seed + i * 17, L, L.sunSx < 0 ? -1 : 1);
        clouds.push({ cv: spr, w: cw, h: ch, az: r() * 360, alt: 6 + r() * (st.weather.cloud > 0.5 ? 20 : 34), speed: (0.4 + r() * 0.8) * (r() < 0.5 ? 1 : 1) });
      }
      project(ms);
      st.bakeMs = Date.now() - t0; st.dirty = true;
    }
    function project(ms) {
      stars = SKY.visible(ms); mw = SKY.milkyWay().map(function (p) { var h = SKY.altaz(p[0], p[1], ms); return [h.alt, h.az]; });
      if (!field) field = SKY.field(st.quality === 'low' ? 700 : 1700, st.seed);
      st.field = field.map(function (p) { var h = SKY.altaz(p[0], p[1], ms); return [h.alt, h.az, p[2]]; }).filter(function (p) { return p[0] > -2; });
      st.projected = ms;
    }
    // azimuth at the screen centre: the Acropolis view faces east-south-east (Orion, Taurus and the Pleiades rise there on winter nights); the sky turns at 0.8 of the pan speed
    function azCentre() { return SKY.n360(118 + (st.pan - centrePan()) * 0.8 / view.ppd); }
    function centrePan() { return clamp(1150 * view.k - view.w / 2, 0, st.panMax); }
    function skyXY(alt, az) { var d = wrap180(az - azCentre()); return [view.w / 2 + d * view.ppd, (HORIZON + PAD) * view.k - alt * view.ppd, d]; }

    function drawLayer(name, oy, ox) {
      var Ly = lay[name]; if (!Ly) return;
      var off = -st.pan * Ly.factor + (ox || 0);
      for (var i = 0; i < Ly.tiles.length; i++) {
        var T = Ly.tiles[i], sx = T.x + off; if (sx > view.w || sx + T.w < 0) continue;
        ctx.drawImage(T.cv, 0, 0, T.cv.width, T.cv.height, sx, oy || 0, T.w, view.h);
      }
    }
    function frame(tms) {
      var t = (tms || 0) / 1000, k = view.k, dpr = view.dpr, night = L.night, hz = (HORIZON + PAD) * k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var par = st.reduced ? 0 : 1, tx = st.tiltX * par, ty = st.tiltY * par, sy = st.scrollY * par;
      // 1 the sky strip
      var sw = 360 * view.ppd, base = (azCentre() * view.ppd - view.w / 2), ox = -((base % sw) + sw) % sw + tx * 4, oy = ty * 3 + sy * 0.25;
      for (var rep = 0; rep < 3; rep++) ctx.drawImage(sky, 0, 0, sky.width - 1, sky.height, Math.floor(ox + rep * sw) - 1, oy, Math.ceil(sw) + 2, sky.height * 2);
      if (oy > 0) { ctx.fillStyle = css(L.zenith); ctx.fillRect(0, 0, view.w, oy + 1); }
      // 2 the night: the Milky Way, the field stars, the constellations
      if (L.stars > 0.02) {
        ctx.save(); ctx.translate(tx * 4, oy);
        ctx.strokeStyle = 'rgb(196,194,214)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var wv = 0; wv < 7; wv++) { ctx.globalAlpha = L.stars * 0.014; ctx.lineWidth = (96 - wv * 13) * k; ctx.beginPath(); var on = false; for (var i = 0; i < mw.length; i++) { var p = skyXY(mw[i][0], mw[i][1]); if (mw[i][0] < -6 || Math.abs(p[2]) > 170) { on = false; continue; } if (!on) { ctx.moveTo(p[0], p[1]); on = true; } else ctx.lineTo(p[0], p[1]); } ctx.stroke(); }
        ctx.globalAlpha = 1;
        var fs = st.field;
        for (i = 0; i < fs.length; i++) { var q = skyXY(fs[i][0], fs[i][1]); if (q[0] < -2 || q[0] > view.w + 2) continue; var a = L.stars * clamp((6.4 - fs[i][2]) / 3, 0.15, 0.85) * (fs[i][0] < 8 ? fs[i][0] / 8 : 1); if (a <= 0.02) continue; ctx.fillStyle = 'rgba(236,232,222,' + a.toFixed(3) + ')'; var sz = fs[i][2] < 4.3 ? 1.6 : 1.1; ctx.fillRect(q[0], q[1], sz, sz); }
        drawConstellations(t);
        ctx.restore();
      }
      // 3 the Moon and the Sun
      if (moonNow.alt > -2) drawMoon(tx, oy);
      if (sunNow.alt > -3) drawSun(tx, oy);
      // 4 shooting star
      if (st.star) drawStar(t, oy);
      // 5 clouds
      for (i = 0; i < clouds.length; i++) {
        var C = clouds[i], cp = skyXY(C.alt, C.az + (st.reduced || st.quality === 'low' ? 0 : t * C.speed * 0.15));
        if (cp[0] + C.w < -10 || cp[0] - C.w > view.w + 10) continue;
        ctx.drawImage(C.cv, cp[0] - C.w / 2 + tx * 4, cp[1] - C.h / 2 + oy, C.w, C.h);
      }
      // 6 the far range and the sea, then the glitter on the water
      drawLayer('far', ty * 2 + sy * 0.18, tx * 3);
      drawGlitter(t, hz + ty * 2 + sy * 0.18);
      drawLayer('mid', ty * 1 + sy * 0.1, tx * 1.5);
      drawShips(t, true);
      drawLayer('main', 0, 0);
      drawLife(t);
      drawShips(t, false);
      drawLayer('fore', -ty * 2, -tx * 3);
      drawPlates();
      // weather: rain streaks and fog
      if (L.rain > 0.02) { ctx.strokeStyle = 'rgba(200,206,220,' + (0.25 * L.rain).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); var rr = rng(Math.floor(t * 20)); for (i = 0; i < 160 * L.rain; i++) { var rx = rr() * view.w, ry = rr() * view.h; ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 12); } ctx.stroke(); }
      if (L.fog > 0.02) { var fg = ctx.createLinearGradient(0, hz - 60 * k, 0, view.h); fg.addColorStop(0, css(L.haze, 0)); fg.addColorStop(0.4, css(L.haze, 0.55 * L.fog)); fg.addColorStop(1, css(L.haze, 0.25 * L.fog)); ctx.fillStyle = fg; ctx.fillRect(0, 0, view.w, view.h); }
      // the bottom melts into the page (night colour of the cards)
      var bf = ctx.createLinearGradient(0, view.h * 0.93, 0, view.h); bf.addColorStop(0, 'rgba(20,17,14,0)'); bf.addColorStop(1, 'rgba(20,17,14,1)'); ctx.fillStyle = bf; ctx.fillRect(0, view.h * 0.93, view.w, view.h * 0.07 + 1);
      var vg = ctx.createRadialGradient(view.w / 2, view.h * 0.45, view.h * 0.3, view.w / 2, view.h * 0.5, view.h * 0.95); vg.addColorStop(0, 'rgba(20,17,14,0)'); vg.addColorStop(1, 'rgba(20,17,14,' + (0.32 + night * 0.15).toFixed(2) + ')'); ctx.fillStyle = vg; ctx.fillRect(0, 0, view.w, view.h);
      st.frames++;
    }
    function drawConstellations(t) {
      var k = view.k, list = stars.list, lab = [];
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(226,200,140,' + (0.34 * L.stars).toFixed(3) + ')';
      for (var i = 0; i < list.length; i++) {
        var c = list[i], pts = [];
        for (var j = 0; j < c.pts.length; j++) pts.push(skyXY(c.pts[j].alt, c.pts[j].az));
        if (c.mid.alt < 1 || Math.abs(pts[0][2]) > 175) continue;
        ctx.beginPath();
        for (j = 0; j < c.lines.length; j++) { var a = pts[c.lines[j][0]], b = pts[c.lines[j][1]], aa = c.pts[c.lines[j][0]].alt, bb = c.pts[c.lines[j][1]].alt; if (aa < 0 || bb < 0 || Math.abs(a[0] - b[0]) > view.w) continue; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
        var sx = 0, sy = 0, n = 0, maxY = -1e9;
        for (j = 0; j < pts.length; j++) {
          if (c.pts[j].alt < 0) continue;
          var m = c.pts[j].mag, r = clamp(2.6 - m * 0.42, 0.7, 2.8) * (c.cluster ? 0.8 : 1), tw = st.reduced || st.quality === 'low' ? 1 : 0.82 + 0.18 * Math.sin(t * 2.1 + i * 3 + j * 1.7);
          var al = L.stars * clamp(1.15 - m * 0.16, 0.35, 1) * tw;
          if (r > 1.4) { var g = ctx.createRadialGradient(pts[j][0], pts[j][1], 0, pts[j][0], pts[j][1], r * 3.2); g.addColorStop(0, 'rgba(255,244,220,' + (al * 0.55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,244,220,0)'); ctx.fillStyle = g; ctx.fillRect(pts[j][0] - r * 3.2, pts[j][1] - r * 3.2, r * 6.4, r * 6.4); }
          ctx.fillStyle = 'rgba(250,244,230,' + al.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], r, 0, Math.PI * 2); ctx.fill();
          sx += pts[j][0]; sy += pts[j][1]; n++; if (pts[j][1] > maxY) maxY = pts[j][1];
        }
        if (n && c.mid.alt > 6) lab.push([c, sx / n, c.cluster ? maxY + 13 : maxY + 14]);
      }
      ctx.font = 'italic ' + Math.round(11.5 * Math.max(0.9, Math.min(1.15, k))) + "px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif"; ctx.textAlign = 'center';
      for (i = 0; i < lab.length; i++) { var lx = lab[i][1], ly = Math.min(lab[i][2], (HORIZON + PAD) * view.k - 30); if (lx < 30 || lx > view.w - 30 || ly < 170) continue; ctx.fillStyle = 'rgba(232,214,170,' + (0.78 * L.stars).toFixed(3) + ')'; ctx.fillText(lab[i][0].name, lx, ly); }
    }
    function drawSun(tx, oy) {
      var p = skyXY(sunNow.alt, sunNow.az); if (Math.abs(p[2]) > 120) return;
      var x = p[0] + tx * 4, y = p[1] + oy, k = view.k, r = 13 * k, cl = 1 - L.cloud * 0.7, lowSun = clamp(1 - sunNow.alt / 20, 0, 1);
      var g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 7); g.addColorStop(0, css([255, 236, 190], 0.5 * cl)); g.addColorStop(0.3, css([255, 200, 140], 0.18 * cl)); g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
      ctx.fillStyle = css(mix([255, 248, 230], [255, 180, 110], lowSun), 0.95 * cl + 0.05); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    function drawMoon(tx, oy) {
      var p = skyXY(moonNow.alt, moonNow.az); if (Math.abs(p[2]) > 120) return;
      var x = p[0] + tx * 4, y = p[1] + oy, r = 9 * view.k, f = moonNow.frac, vis = 0.35 + 0.65 * L.stars;
      var g = ctx.createRadialGradient(x, y, r, x, y, r * 6); g.addColorStop(0, 'rgba(220,226,240,' + (0.22 * f * vis).toFixed(3) + ')'); g.addColorStop(1, 'rgba(220,226,240,0)'); ctx.fillStyle = g; ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      ctx.fillStyle = 'rgba(60,66,92,' + (0.55 * vis).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // the lit part: a half disc on the sun side and an ellipse for the terminator
      var side = moonNow.waxing ? 1 : -1, e = Math.abs(1 - 2 * f) * r;
      ctx.fillStyle = 'rgba(246,240,224,' + (0.95 * vis).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, side < 0);
      ctx.ellipse(x, y, e, r, 0, Math.PI / 2, -Math.PI / 2, f > 0.5 ? side < 0 : side > 0); ctx.fill();
    }
    function drawStar(t, oy) {
      var S = st.star; if (S.t0 == null) S.t0 = t; var u = S.still ? 0.55 : (t - S.t0) / 1.4; if (u > 1) { st.star = null; return; }
      var x = S.x + S.dx * u, y = S.y + S.dy * u + oy, tail = 0.22, a = Math.sin(Math.PI * u);
      var g = ctx.createLinearGradient(x, y, x - S.dx * tail, y - S.dy * tail); g.addColorStop(0, 'rgba(255,244,214,' + (0.95 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - S.dx * tail, y - S.dy * tail); ctx.stroke();
    }
    function drawGlitter(t, hz) {
      var src = sunNow.alt > -2 ? sunNow : moonNow.alt > 2 ? moonNow : null; if (!src) return;
      var p = skyXY(src.alt, src.az); if (Math.abs(p[2]) > 100) return;
      var str = src === sunNow ? (0.5 + 0.5 * L.golden) * (1 - L.cloud * 0.7) : 0.4 * moonNow.frac, still = st.reduced || st.quality === 'low';
      var col = src === sunNow ? mix([255, 240, 200], [255, 176, 100], L.golden) : [220, 226, 240], r = rng(77), k = view.k;
      for (var i = 0; i < 70; i++) {
        var dy = Math.pow(r(), 1.6) * (view.h - hz), spread = 8 + dy * 0.55, x = p[0] + (r() - 0.5) * spread * 2 + (still ? 0 : Math.sin(t * 1.3 + i) * 2.5), y = hz + 2 + dy;
        var a = str * (0.25 + 0.75 * (still ? 0.6 : 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7))) * (1 - dy / (view.h - hz) * 0.6);
        ctx.fillStyle = css(col, a); ctx.fillRect(x, y, (3 + r() * 9) * k, 1.2 * k);
      }
    }
    // the ships of the bots: in port (moored, sail furled), under sail (out in the bay), returning (heading home with cargo)
    function drawPlates() {
      var k = view.k, P = st.plates; st.plates = [];
      ctx.font = '600 ' + Math.round(11 * Math.max(0.95, Math.min(1.1, k))) + 'px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center';
      for (var i = 0; i < P.length; i++) { var tw2 = ctx.measureText(P[i][0]).width + 12; ctx.fillStyle = 'rgba(29,25,20,0.8)'; ctx.fillRect(P[i][1] - tw2 / 2, P[i][2], tw2, 17); ctx.fillStyle = '#f3ece0'; ctx.fillText(P[i][0], P[i][1], P[i][2] + 12.5); }
    }
    function drawShips(t, far) {
      var k = view.k, still = st.reduced || st.quality === 'low';
      for (var i = 0; i < st.ships.length && i < 4; i++) {
        var S = st.ships[i], state = S.state || 'port', isFar = state !== 'port';
        if (isFar !== far) continue;
        var bx, by, s, lane = M.lanes[i % M.lanes.length];
        if (state === 'port') { bx = M.berths[i][0]; by = M.berths[i][1]; s = 1; if (view.w < 640) bx = BERTH_MID + (bx - BERTH_MID) * BERTH_SPREAD; }
        else if (state === 'returning') { var lt = still ? 0.5 : (t * 0.01 + i * 0.25) % 1; bx = lerp(2470, 2700, 0.5 + 0.5 * Math.sin(lt * Math.PI * 2)); by = 494 + i * 6; s = 0.82; }
        else { bx = lane[0] + (still ? 0 : Math.sin(t * 0.05 + i * 2) * 60); by = lane[1]; s = lane[2]; }
        // a phone frame (narrow view, small k): the bots' ships are drawn larger so they read at a glance (moored ships less, the berths are close)
        if (view.w < 640) s *= state === 'port' ? 1.2 : 1.38;
        var factor = 1, sx = bx * k - st.pan * factor, bob = still ? 0 : Math.sin(t * 1.6 + i * 1.3) * 1.2 * s;
        if (sx < -120 || sx > view.w + 120) { S._hit = null; continue; }
        paintShip(ctx, sx, (by + PAD) * k + bob * k, s * k, S, state, i, t, still);
        S._hit = { x: sx, y: (by + PAD) * k - 60 * s * k, w: 96 * s * k, h: 66 * s * k };
      }
    }
    function paintShip(c, x, y, s, S, state, i, t, still) {
      var dir = state === 'returning' ? -1 : 1, hull = shade([92, 58, 38], 0.5 + F.front * 0.4, L, state === 'port' ? 0 : 0.15), len = 82 * s, hh = 9 * s;
      c.save(); c.translate(x, y); c.scale(dir, 1);
      // reflection and wake
      c.fillStyle = css(mix(hull, L.horizon, 0.5), 0.25); c.fillRect(-len / 2, 2 * s, len, 6 * s);
      if (state !== 'port' && !still) { c.strokeStyle = 'rgba(240,236,224,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-len / 2, 3 * s); c.lineTo(-len / 2 - 26 * s, 6 * s); c.moveTo(-len / 2, 4 * s); c.lineTo(-len / 2 - 22 * s, 10 * s); c.stroke(); }
      // the hull: a long trireme with the bronze ram, the painted eye and the curled stern
      c.beginPath(); c.moveTo(-len / 2, -hh); c.quadraticCurveTo(-len / 2 - 10 * s, -hh - 8 * s, -len / 2 - 4 * s, -hh - 16 * s); c.lineTo(-len / 2 + 2 * s, -hh - 2 * s);
      c.lineTo(len / 2 - 4 * s, -hh); c.lineTo(len / 2 + 8 * s, -2 * s); c.lineTo(len / 2 + 2 * s, 0); c.quadraticCurveTo(0, 3 * s, -len / 2 + 4 * s, 0); c.closePath();
      c.fillStyle = css(hull); c.fill();
      c.fillStyle = css(shade(MAT.bronze, 0.8, L, 0)); c.beginPath(); c.moveTo(len / 2 + 8 * s, -2 * s); c.lineTo(len / 2 + 15 * s, -1 * s); c.lineTo(len / 2 + 6 * s, 0.5 * s); c.fill();
      c.fillStyle = css(shade(hex(S.colour), 0.8, L, 0)); c.fillRect(-len / 2 + 6 * s, -hh + 1 * s, len - 12 * s, 2.2 * s);
      c.fillStyle = 'rgba(240,232,214,0.9)'; c.beginPath(); c.arc(len / 2 - 2 * s, -hh + 4 * s, 1.6 * s, 0, Math.PI * 2); c.fill();
      if (state !== 'port') { c.strokeStyle = css(shade([140, 110, 76], 0.5, L, 0)); c.lineWidth = Math.max(0.6, 0.8 * s); var row = still ? 0 : Math.sin(t * 2.2 + i) * 3 * s; for (var o = -4; o <= 4; o++) { c.beginPath(); c.moveTo(o * 7 * s, -hh + 4 * s); c.lineTo(o * 7 * s - 4 * s + row, 5 * s); c.stroke(); } }
      // mast and sail
      var mh = 52 * s; c.fillStyle = css(shade(MAT.wood, 0.6, L, 0)); c.fillRect(-1 * s, -hh - mh, 2 * s, mh);
      c.fillRect(-20 * s, -hh - mh + 3 * s, 40 * s, 1.8 * s);
      var sailC = shade([236, 224, 198], 0.55 + F.front * 0.5, L, 0), emb = shade(hex(S.colour), 0.9, L, 0);
      if (state === 'port') { c.fillStyle = css(sailC); c.fillRect(-19 * s, -hh - mh + 4 * s, 38 * s, 4 * s); }
      else {
        var bill = still ? 6 : 6 + Math.sin(t * 0.9 + i) * 1.5;
        c.beginPath(); c.moveTo(-19 * s, -hh - mh + 4 * s); c.lineTo(19 * s, -hh - mh + 4 * s); c.quadraticCurveTo(19 * s + bill * s, -hh - mh * 0.45, 17 * s, -hh - 6 * s); c.lineTo(-17 * s, -hh - 6 * s); c.quadraticCurveTo(-19 * s + bill * s, -hh - mh * 0.45, -19 * s, -hh - mh + 4 * s); c.closePath();
        c.fillStyle = css(sailC); c.fill();
        c.fillStyle = css(emb, 0.85); c.save(); c.scale(dir, 1); c.font = 'bold ' + Math.round(15 * s) + "px 'Iowan Old Style',Georgia,serif"; c.textAlign = 'center'; c.fillText(S.mark || '', 0, -hh - mh * 0.38); c.restore();
        c.fillStyle = css(emb, 0.5); c.fillRect(-19 * s, -hh - 10 * s, 36 * s, 2 * s);
      }
      if (state === 'returning') {   // the cargo: amphorae and a chest of coin on deck
        for (var am = 0; am < 4; am++) { c.fillStyle = css(shade(MAT.terracotta, 0.7, L, 0)); c.beginPath(); c.ellipse(-24 * s + am * 7 * s, -hh - 4 * s, 2.6 * s, 4 * s, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = css(shade(S.usd >= 0 ? MAT.gold : [120, 110, 100], 0.95, L, 0)); c.fillRect(8 * s, -hh - 7 * s, 9 * s, 6 * s);
      }
      if (L.night > 0.3) { c.fillStyle = css(L.torch, 0.9 * L.night); c.beginPath(); c.arc(-len / 2 + 2 * s, -hh - 12 * s, 1.8 * s, 0, Math.PI * 2); c.fill(); }
      c.restore();
      // its name plate
      var label = S.label || S.name || '';   // name plates are drawn last (over the mole and the trees): above the mast under sail, below the hull in port
      if (label) st.plates.push([label, x, state === 'port' || state === 'returning' ? y + 8 * s : y - hh - mh - 22 * s]);
    }
    // the city's life: fresh-news banners and a warm halo, torches at night, smoke of the forges, gold motes over the treasury, the selected rim
    function drawLife(t) {
      var k = view.k, still = st.reduced || st.quality === 'low', bs = M.buildings, night = L.night;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i], x = b.x * k - st.pan, y = (b.y + PAD) * k; if (x < -80 || x > view.w + 80) continue;
        var f = st.fresh[b.id] || 0, top = y - b.h * k;
        if (f > 0) {   // fresh published data: a warm halo and a gold banner on a pole
          var pulse = still ? 0.8 : 0.72 + 0.28 * Math.sin(t * 1.4 + i);
          var g = ctx.createRadialGradient(x, y - b.h * k * 0.45, 2, x, y - b.h * k * 0.45, b.w * k * 0.9);
          g.addColorStop(0, 'rgba(255,206,120,' + (0.24 * f * pulse).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,190,110,0)');
          ctx.fillStyle = g; ctx.fillRect(x - b.w * k, y - b.h * k * 1.4, b.w * k * 2, b.h * k * 1.6);
          var px = x + b.w * k * 0.32, py = top - 4 * k, wave = still ? 0 : Math.sin(t * 3 + i) * 1.6;
          ctx.fillStyle = 'rgba(110,80,46,0.95)'; ctx.fillRect(px, py - 18 * k, 1.2, 18 * k);
          ctx.fillStyle = css(mix(hex(b.colour), [214, 172, 82], 0.5)); ctx.beginPath(); ctx.moveTo(px + 1, py - 18 * k); ctx.quadraticCurveTo(px + 7 * k, py - 17 * k + wave, px + 12 * k, py - 15 * k + wave); ctx.lineTo(px + 1, py - 11 * k); ctx.closePath(); ctx.fill();
        }
        if (night > 0.15) {   // torches
          var sp = torchSpots(b);
          for (var j = 0; j < sp.length; j++) {
            var tx2 = sp[j][0] * k - st.pan, ty2 = (sp[j][1] + PAD) * k, fl = still ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + i * 7 + j * 3) * Math.sin(t * 5.3 + i);
            var tg = ctx.createRadialGradient(tx2, ty2 - 5 * k, 0, tx2, ty2 - 5 * k, 16 * k * fl);
            tg.addColorStop(0, 'rgba(255,190,110,' + (0.25 * night * fl).toFixed(3) + ')'); tg.addColorStop(1, 'rgba(255,150,80,0)'); ctx.fillStyle = tg; ctx.fillRect(tx2 - 16 * k, ty2 - 21 * k, 32 * k, 32 * k);
            ctx.fillStyle = 'rgba(90,62,40,0.9)'; ctx.fillRect(tx2 - 0.6, ty2 - 5 * k, 1.2, 5 * k);
            ctx.fillStyle = 'rgba(255,' + Math.round(176 + 40 * fl) + ',110,' + (0.95 * night).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(tx2, ty2 - 6.5 * k, 1.5 * k, 2.6 * k * fl, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (b.type === 'forge' && !still) {   // smoke from the chimney
          for (var sm = 0; sm < 5; sm++) { var u = ((t * 0.18 + sm / 5 + i * 0.13) % 1), smx = x + b.w * k * 0.26 + u * 14 * k + Math.sin(t + sm) * 2, smy = y - b.h * k * 0.85 - u * 40 * k; ctx.fillStyle = css(mix([150, 140, 130], L.haze, 0.4), 0.22 * (1 - u)); ctx.beginPath(); ctx.arc(smx, smy, (3 + u * 8) * k, 0, Math.PI * 2); ctx.fill(); }
        }
        if (st.selected === b.id || st.hover === b.id) {
          ctx.strokeStyle = 'rgba(232,196,110,0.95)'; ctx.lineWidth = 2; ctx.setLineDash([]);
          ctx.beginPath(); ctx.ellipse(x, y + 1, b.w * k * 0.62, Math.max(5, b.w * k * 0.12), 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      drawCitizens(t, still);
      // gold motes over the treasury when today's money is up
      var tre = treasury();
      if (st.treasury && tre) {
        var cx = tre.x * k - st.pan, cy = (tre.y - tre.h + PAD) * k;
        if (!still) { if (st.motes.length < 34 && Math.random() < 0.5) st.motes.push({ x: cx + (Math.random() - 0.5) * tre.w * k, y: cy + 4 * k, vx: (Math.random() - 0.5) * 0.25, vy: -(0.35 + Math.random() * 0.5), life: 1 }); }
        else if (!st.motes.length) { for (var mm = 0; mm < 14; mm++) st.motes.push({ x: cx + (mm % 7 - 3) * 6 * k, y: cy - (mm * 5) * k, vx: 0, vy: 0, life: 0.85 - mm * 0.04 }); }
        for (var mi = st.motes.length - 1; mi >= 0; mi--) {
          var m = st.motes[mi]; if (!still) { m.x += m.vx; m.y += m.vy; m.life -= 0.008; } if (m.life <= 0) { st.motes.splice(mi, 1); continue; }
          ctx.fillStyle = 'rgba(240,198,96,' + (m.life * 0.85).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(m.x, m.y, 1.7 * k, 0, Math.PI * 2); ctx.fill();
        }
      } else st.motes.length = 0;
    }
    // ---- QA6 the citizens: a few people of OLYMPUS (photos of their rigged 3D selves) walk the two front streets of the Acropolis (nothing baked stands in front of them), side-on with a
    // two-stride walk, mirrored by direction; at dusk and night the photos are darkened to the light. Still (no walking) with reduced motion / LITE.
    function makeCitizens(A, list) {
      if (!A || !A.canvas || !list.length || (A.frames || 0) < 5) return null;
      var rows = [[478, 880, 1430], [546, 860, 1450], [548, 900, 1400]], r = rng(hash('citizens:' + list.length)), walkers = [];
      for (var i = 0; i < Math.max(list.length, 15); i++) { var row = rows[i % rows.length], span = row[2] - row[1], li = i % list.length; walkers.push({ id: list[li].id || String(li), i: li, x0: row[1], span: span, y: row[0] + 3 + (i % 2) * 3, ph: r(), v: 9 + r() * 6, dir: r() < 0.5 ? -1 : 1, x: row[1] + r() * span }); }
      return { A: A, walkers: walkers, tinted: null };
    }
    function citTint() {
      var C = st.cit, A = C.A, key = Math.round(L.night * 20) + ':' + Math.round((L.light ? L.light[0] : 255) / 16);
      if (C.tinted && st.citTint === key) return C.tinted;
      var cv2 = C.tinted || doc.createElement('canvas'); cv2.width = A.canvas.width; cv2.height = A.canvas.height; var g = cv2.getContext('2d');
      g.clearRect(0, 0, cv2.width, cv2.height); g.drawImage(A.canvas, 0, 0); g.globalCompositeOperation = 'source-atop';
      var dark = clamp(L.night * 0.42, 0, 0.42); g.fillStyle = 'rgba(28,22,40,' + dark.toFixed(3) + ')'; g.fillRect(0, 0, cv2.width, cv2.height);
      if (L.night < 0.5) { g.fillStyle = 'rgba(255,196,120,' + (0.10 * (1 - L.night * 2)).toFixed(3) + ')'; g.fillRect(0, 0, cv2.width, cv2.height); }
      g.globalCompositeOperation = 'source-over'; C.tinted = cv2; st.citTint = key; return cv2;
    }
    function drawCitizens(t, still) {
      var C = st.cit; if (!C) return; var A = C.A, k = view.k, src = citTint(), hgt = 19 * k, wdt = hgt * A.frame[0] / A.frame[1];
      for (var i = 0; i < C.walkers.length; i++) {
        var w = C.walkers[i];
        if (!still) { var d = (t * w.v + w.ph * w.span * 2) % (w.span * 2); w.dir = d < w.span ? 1 : -1; w.x = w.x0 + (d < w.span ? d : w.span * 2 - d); }
        var x = w.x * k - st.pan, y = (w.y + PAD) * k; if (x < -20 || x > view.w + 20) continue;
        var fr = still ? 0 : 3 + (Math.floor(t * 2.2 + w.ph * 7) % 2), cell = w.i * A.frames + fr, sx = (cell % A.cols) * A.cellW, sy = Math.floor(cell / A.cols) * A.cellH, bob = still ? 0 : Math.abs(Math.sin(t * 4.4 + w.ph * 9)) * 0.6 * k;
        ctx.fillStyle = 'rgba(30,22,14,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, wdt * 0.32, 1.6 * k, 0, 0, Math.PI * 2); ctx.fill();     // a small shadow under their feet
        ctx.save(); ctx.translate(x, y - bob); if (w.dir < 0 && !still) ctx.scale(-1, 1);
        ctx.drawImage(src, sx, sy, A.cellW, A.cellH, -wdt / 2, -hgt * (1 + (A.foot || 0) / A.frame[1]), wdt, hgt); ctx.restore();
      }
    }
    function treasury() { for (var i = 0; i < M.buildings.length; i++) if (M.buildings[i].type === 'mint') return M.buildings[i]; return null; }

    // ---- the loop
    var raf = 0, lastT = 0, fpsT = 0, fpsN = 0;
    function loop(tms) {
      raf = 0; if (!st.running) return;
      var t0 = (win.performance && win.performance.now) ? win.performance.now() : Date.now();
      if (!st.timeFixed && Date.now() - st.lastBake > 120000) bakeSliced();      // perf v2: the clock's re-bake, one tile per task
      else if (Date.now() - (st.projectedAt || 0) > 10000) { project(nowMs()); st.projectedAt = Date.now(); }
      frame(tms);
      var t1 = (win.performance && win.performance.now) ? win.performance.now() : Date.now(); st.frameMs = st.frameMs * 0.9 + (t1 - t0) * 0.1;
      fpsN++; if (tms - fpsT > 1000) { st.fps = Math.round(fpsN * 1000 / (tms - fpsT)); fpsT = tms; fpsN = 0; }
      if (animated()) raf = win.requestAnimationFrame(loop); else st.dirty = false;
    }
    function animated() { return st.visible && !st.reduced && st.quality !== 'low' && !doc.hidden; }
    function kick() { st.dirty = true; if (!raf && st.running) raf = win.requestAnimationFrame(loop); }
    function onScroll() { if (scroller) { st.pan = clamp(scroller.scrollLeft, 0, st.panMax); } kick(); }

    var api = {
      state: st, layout: M,
      start: function () { st.running = true; size(); kick(); return api; },
      stop: function () { st.running = false; if (raf) win.cancelAnimationFrame(raf); raf = 0; },
      resize: function () { size(); kick(); },
      redraw: kick,
      setPan: function (px) { st.pan = clamp(px, 0, st.panMax); kick(); },
      panFor: function (key) {
        var d = null, b = null; for (var i = 0; i < M.districts.length; i++) if (M.districts[i].id === key) d = M.districts[i];
        for (i = 0; i < M.buildings.length; i++) if (M.buildings[i].id === key) b = M.buildings[i];
        var x = key === 'harbour' ? 2640 : b ? b.x : d ? d.cx : 1150; return clamp(x * view.k - view.w / 2, 0, st.panMax);
      },
      setTime: function (ms) { if (ms == null) { st.timeFixed = false; } else { st.time = ms; st.timeFixed = true; } bake(); kick(); },
      setWeather: function (w) { st.weather = w || {}; bake(); kick(); },
      setFresh: function (map) { st.fresh = map || {}; kick(); },
      setShips: function (s) { st.ships = s || []; kick(); },
      setTreasury: function (up) { st.treasury = !!up; kick(); },
      /** QA6: the citizens walking the Acropolis streets: photos of the rigged cast (olympus/people-studio.js atlas with views), [{ id, name }] */
      setCitizens: function (atlas, list) { st.cit = makeCitizens(atlas, list || []); st.citTint = -1; kick(); return st.cit ? st.cit.walkers.length : 0; },
      citizens: function () { return st.cit ? st.cit.walkers.map(function (w) { return { id: w.id, x: Math.round(w.x), y: w.y, dir: w.dir }; }) : []; },
      setTilt: function (x, y) { st.tiltX = clamp(x, -1, 1) * 3; st.tiltY = clamp(y, -1, 1) * 2; kick(); },
      setScroll: function (y) { st.scrollY = clamp(y, 0, 400); kick(); },
      setVisible: function (v) { st.visible = !!v; if (v) kick(); },
      setQuality: function (q, reduced) { st.quality = q === 'low' ? 'low' : 'high'; st.reduced = !!reduced; size(); kick(); },
      select: function (id) { st.selected = id || null; kick(); },
      hover: function (id) { st.hover = id || null; kick(); },
      shootingStar: function () { var r = Math.random(); st.star = { x: view.w * (0.25 + r * 0.5), y: (HORIZON + PAD) * view.k * (0.12 + Math.random() * 0.2), dx: -view.w * 0.32 * (r < 0.5 ? -1 : 1), dy: (HORIZON + PAD) * view.k * 0.22 }; st.starShown = (st.starShown || 0) + 1; if (!animated()) { st.star.still = true; frame(0); } else kick(); },
      screenOf: function (b) { return { x: b.x * view.k - st.pan, y: (b.y + PAD) * view.k, w: b.w * view.k, h: b.h * view.k }; },
      ships: function () { return st.ships; },
      info: function () { return { phase: st.phase, sunAlt: sunNow ? sunNow.alt : null, sunAz: sunNow ? sunNow.az : null, moon: moonNow ? { alt: moonNow.alt, frac: moonNow.frac } : null, night: L ? L.night : 0, stars: L ? L.stars : 0,
        up: stars ? stars.up : [], azCentre: azCentre(), view: { w: view.w, h: view.h, k: view.k, ppd: view.ppd, pad: PAD }, pan: st.pan, panMax: st.panMax, frames: st.frames, fps: st.fps, frameMs: Math.round(st.frameMs * 10) / 10, bakeMs: st.bakeMs, bakes: st.bakes,
        onScreen: stars ? stars.list.filter(function (c) { var p = skyXY(c.mid.alt, c.mid.az); return c.mid.alt > 3 && p[0] > 0 && p[0] < view.w; }).map(function (c) { return c.name; }) : [] }; },
      onScroll: onScroll,
      destroy: function () { api.stop(); slice = null; if (cv.parentNode) cv.parentNode.removeChild(cv); lay = {}; }
    };
    if (scroller) scroller.addEventListener('scroll', onScroll, { passive: true });
    return api;
  }

  function berthX(x, viewW) { return viewW < 640 ? BERTH_MID + (x - BERTH_MID) * BERTH_SPREAD : x; }
  var API = { berthX: berthX, layout: layout, palette: palette, faces: faces, DISTRICTS: DISTRICTS, SPECIAL: SPECIAL, W: W0, H: H0, HORIZON: HORIZON, PAD: PAD, create: create, _shade: shade, _hash: hash };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.OLYMPUS_POLIS_SKYLINE = API;
})(typeof self !== 'undefined' ? self : this);
