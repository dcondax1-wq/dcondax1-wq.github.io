/* OLYMPUS POLIS SKY (2026-11-11, "Polis home" agent): the real sky over New York for the Polis skyline. ES5, no DOM, no network.
 *   window.OLYMPUS_POLIS_SKY (browser) / module.exports (node)
 *   .NY                         {lat: 40.7128, lon: -74.0060} (degrees, east positive)
 *   .julian(ms) / .gmst(ms)     Julian date / Greenwich mean sidereal time in degrees
 *   .altaz(ra, dec, ms, lat, lon) -> {alt, az}   degrees; az from north through east
 *   .sun(ms) / .moon(ms)        {ra, dec, alt, az} (+ moon.frac lit fraction, moon.waxing)
 *   .phase(ms)                  {name: 'dawn'|'day'|'dusk'|'night', alt, az, rising}
 *   .CONSTELLATIONS             [{id, name, myth, stars: [[ra, dec, mag, name?]], lines: [[i, j]]}]
 *   .visible(ms)                every constellation star with its alt / az, and the up-now list
 *   .milkyWay()                 points on the galactic equator in RA / Dec (for the faint band)
 *   .timeFor(name, ms)          a time (ms) on that New York day when the sky has that phase (for ?phase= and the screenshots)
 * Method (also in docs/POLIS.md): star positions are J2000 right ascension / declination from the Yale Bright Star catalogue values
 * (precession to 2026 is ~0.36 degrees, under one star width on a phone, so it is ignored). Local sidereal time = GMST (IAU 1982
 * linear form) + longitude; hour angle H = LST - RA; altitude / azimuth by the standard spherical formulas for New York's latitude.
 * The Sun and Moon use the low-precision almanac formulas (Sun ~0.01 deg, Moon ~0.3 deg), plenty for a painted sky.
 * The page projects alt / az on a cylinder facing the chosen azimuth: x = (az - centre) * px per degree, y = horizon - alt * px per degree.
 */
(function (root) {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var NY = { lat: 40.7128, lon: -74.006 };
  function n360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function julian(ms) { return ms / 86400000 + 2440587.5; }
  function gmst(ms) { return n360(280.46061837 + 360.98564736629 * (julian(ms) - 2451545)); }
  function altaz(ra, dec, ms, lat, lon) {
    lat = lat == null ? NY.lat : lat; lon = lon == null ? NY.lon : lon;
    var H = (gmst(ms) + lon - ra) * D2R, d = dec * D2R, p = lat * D2R;
    var sa = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sa)));
    var az = Math.atan2(-Math.sin(H) * Math.cos(d), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
    return { alt: alt * R2D, az: n360(az * R2D) };
  }
  function eclToEq(lam, beta, eps) {
    var l = lam * D2R, b = beta * D2R, e = eps * D2R;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    return { ra: n360(ra * R2D), dec: dec * R2D };
  }
  function sunLon(ms) {
    var n = julian(ms) - 2451545, L = n360(280.46 + 0.9856474 * n), g = n360(357.528 + 0.9856003 * n) * D2R;
    return { lam: n360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)), eps: 23.439 - 0.0000004 * n };
  }
  function sun(ms, lat, lon) {
    var s = sunLon(ms), q = eclToEq(s.lam, 0, s.eps), h = altaz(q.ra, q.dec, ms, lat, lon);
    return { ra: q.ra, dec: q.dec, alt: h.alt, az: h.az, lam: s.lam };
  }
  function moon(ms, lat, lon) {
    var n = julian(ms) - 2451545, L = 218.316 + 13.176396 * n, M = (134.963 + 13.064993 * n) * D2R, F = (93.272 + 13.22935 * n) * D2R;
    var lam = n360(L + 6.289 * Math.sin(M)), beta = 5.128 * Math.sin(F), q = eclToEq(lam, beta, 23.4397), h = altaz(q.ra, q.dec, ms, lat, lon);
    var el = n360(lam - sunLon(ms).lam), cosE = Math.cos(beta * D2R) * Math.cos(el * D2R);
    return { ra: q.ra, dec: q.dec, alt: h.alt, az: h.az, frac: (1 - cosE) / 2, waxing: el < 180, elong: el };
  }
  /** dawn: sun from -10 deg to +8 deg in the morning; dusk: the same in the evening; day above; night below */
  function phase(ms) {
    var s = sun(ms), s2 = sun(ms + 600000), rising = s2.alt > s.alt;
    var name = s.alt >= 8 ? 'day' : s.alt <= -10 ? 'night' : rising ? 'dawn' : 'dusk';
    return { name: name, alt: s.alt, az: s.az, rising: rising };
  }
  /** the New York calendar day of ms, as UTC ms of its local midnight (DST-aware through Intl when present) */
  function nyOffsetMin(ms) {
    try {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      var p = {}, parts = f.formatToParts(new Date(ms));
      for (var i = 0; i < parts.length; i++) p[parts[i].type] = +parts[i].value;
      var asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
      return Math.round((asUTC - Math.floor(ms / 60000) * 60000) / 60000);
    } catch (e) { return -300; }
  }
  function timeFor(name, ms) {
    var off = nyOffsetMin(ms), local = ms + off * 60000, mid = Math.floor(local / 86400000) * 86400000 - off * 60000;
    var best = null, bestScore = 1e9, t, s, sc;
    for (var m = 0; m < 1440; m += 4) {
      t = mid + m * 60000; s = sun(t);
      var up = sun(t + 600000).alt > s.alt;
      if (name === 'dawn') sc = up ? Math.abs(s.alt - 1.5) : 1e9;
      else if (name === 'dusk') sc = !up ? Math.abs(s.alt - 2.5) : 1e9;
      else if (name === 'day') sc = -s.alt + (m < 600 ? 40 : 0);   // the highest sun, a little after noon
      else sc = Math.abs(m - 22 * 60);                               // night: 10 PM New York time
      if (sc < bestScore) { bestScore = sc; best = t; }
    }
    if (name === 'day') best += 3600000;   // mid-afternoon light (long enough shadows to read the shapes)
    return best;
  }

  // ------------------------------------------------------------------------------------------------ the constellations (J2000 RA / Dec degrees, visual magnitude)
  var C = [
    { id: 'orion', name: 'Orion', myth: 'the hunter', stars: [[88.793, 7.407, 0.5, 'Betelgeuse'], [81.283, 6.35, 1.6, 'Bellatrix'], [85.19, -1.943, 1.8], [84.053, -1.202, 1.7], [83.002, -0.299, 2.2], [86.939, -9.67, 2.1], [78.634, -8.202, 0.1, 'Rigel'],
      [83.784, 9.934, 3.4], [72.46, 6.961, 3.2], [72.653, 8.9, 4.4], [72.802, 5.605, 3.7], [91.893, 14.768, 4.4], [92.985, 14.209, 4.5]],
      lines: [[7, 0], [7, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [1, 8], [8, 9], [8, 10], [0, 11], [11, 12]] },
    { id: 'pleiades', name: 'The Pleiades', myth: 'the seven sisters', cluster: true, stars: [[56.871, 24.105, 2.9, 'Alcyone'], [57.29, 24.053, 3.6], [56.219, 24.113, 3.7], [56.457, 24.368, 3.9], [56.581, 23.948, 4.2], [56.302, 24.467, 4.3], [57.297, 24.137, 5], [56.2, 24.289, 5.4]], lines: [] },
    { id: 'taurus', name: 'Taurus', myth: 'Zeus as the bull', stars: [[68.98, 16.509, 0.85, 'Aldebaran'], [81.573, 28.608, 1.65], [84.411, 21.143, 3], [67.166, 15.871, 3.4], [64.948, 15.628, 3.65], [65.734, 17.543, 3.75], [67.154, 19.18, 3.5], [60.17, 12.49, 3.4], [51.203, 9.029, 3.6]],
      lines: [[4, 5], [5, 6], [6, 1], [4, 3], [3, 0], [0, 2], [4, 7], [7, 8]] },
    { id: 'draco', name: 'Draco', myth: 'Ladon, the dragon', stars: [[211.097, 64.376, 3.65, 'Thuban'], [188.371, 69.788, 3.85], [172.851, 69.331, 3.85], [231.232, 58.966, 3.3], [240.472, 58.565, 4], [245.998, 61.514, 2.7], [257.197, 65.715, 3.2], [275.264, 72.733, 3.55],
      [288.139, 67.662, 3.05], [297.043, 70.268, 3.8], [263.044, 55.184, 4.9], [262.608, 52.301, 2.8], [269.152, 51.489, 2.2, 'Eltanin'], [268.382, 56.873, 3.75]],
      lines: [[2, 1], [1, 0], [0, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [8, 13], [13, 12], [12, 11], [11, 10], [10, 13]] },
    { id: 'ursamajor', name: 'The Great Bear', myth: 'Callisto', stars: [[165.932, 61.751, 1.8, 'Dubhe'], [165.46, 56.382, 2.35], [178.458, 53.695, 2.4], [183.857, 57.033, 3.3], [193.507, 55.96, 1.75], [200.981, 54.925, 2.2], [206.885, 49.313, 1.85]],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
    { id: 'ursaminor', name: 'The Little Bear', myth: 'with the pole star', stars: [[37.955, 89.264, 2, 'Polaris'], [222.676, 74.156, 2.1], [230.182, 71.834, 3], [263.054, 86.586, 4.35], [251.493, 82.037, 4.2], [236.015, 77.795, 4.3], [244.376, 75.755, 4.95]],
      lines: [[0, 3], [3, 4], [4, 5], [5, 1], [1, 2], [2, 6], [6, 5]] },
    { id: 'cassiopeia', name: 'Cassiopeia', myth: 'the vain queen', stars: [[2.295, 59.15, 2.3], [10.127, 56.537, 2.25, 'Schedar'], [14.177, 60.717, 2.15], [21.454, 60.235, 2.7], [28.599, 63.67, 3.35]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 'cepheus', name: 'Cepheus', myth: 'the king', stars: [[319.645, 62.586, 2.45], [322.165, 70.561, 3.2], [354.837, 77.632, 3.2], [342.42, 66.2, 3.5], [332.714, 58.201, 3.35]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 3]] },
    { id: 'perseus', name: 'Perseus', myth: 'the hero', stars: [[51.081, 49.861, 1.8, 'Mirfak'], [47.042, 40.956, 2.1, 'Algol'], [46.199, 53.506, 2.9], [55.731, 47.787, 3], [59.463, 40.01, 2.9], [58.533, 31.884, 2.85], [42.674, 55.896, 3.75], [46.294, 38.84, 3.4]],
      lines: [[6, 2], [2, 0], [0, 3], [3, 4], [4, 5], [0, 1], [1, 7]] },
    { id: 'andromeda', name: 'Andromeda', myth: 'the chained princess', stars: [[2.097, 29.091, 2.05, 'Alpheratz'], [9.832, 30.861, 3.25], [17.433, 35.621, 2.05], [30.975, 42.33, 2.1], [14.188, 38.499, 3.85], [12.453, 41.079, 4.5]], lines: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]] },
    { id: 'pegasus', name: 'Pegasus', myth: 'the winged horse', stars: [[346.19, 15.205, 2.5, 'Markab'], [345.944, 28.083, 2.45], [3.309, 15.184, 2.8], [2.097, 29.091, 2.05], [326.046, 9.875, 2.4, 'Enif'], [340.751, 10.831, 3.4], [332.55, 6.198, 3.5], [340.366, 30.221, 2.95], [341.633, 23.566, 3.95]],
      lines: [[0, 1], [1, 3], [3, 2], [2, 0], [0, 5], [5, 6], [6, 4], [1, 7], [1, 8]] },
    { id: 'cygnus', name: 'Cygnus', myth: 'Zeus as the swan', stars: [[310.358, 45.28, 1.25, 'Deneb'], [305.557, 40.257, 2.2], [311.553, 33.97, 2.45], [296.244, 45.131, 2.85], [292.68, 27.96, 3.05], [318.234, 30.227, 3.2], [294.111, 53.368, 3.8]],
      lines: [[0, 1], [1, 4], [3, 1], [1, 2], [2, 5], [3, 6]] },
    { id: 'lyra', name: 'Lyra', myth: "Orpheus's lyre", stars: [[279.235, 38.784, 0.03, 'Vega'], [281.085, 39.67, 4.7], [281.193, 37.605, 4.35], [283.626, 36.899, 4.3], [284.736, 32.69, 3.25], [282.52, 33.363, 3.5]], lines: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 2]] },
    { id: 'aquila', name: 'Aquila', myth: "Zeus's eagle", stars: [[297.696, 8.868, 0.75, 'Altair'], [296.565, 10.613, 2.7], [298.828, 6.407, 3.7], [291.375, 3.115, 3.35], [286.353, 13.863, 3], [286.562, -4.883, 3.4], [302.826, -0.822, 3.2]], lines: [[4, 1], [1, 0], [0, 2], [0, 3], [3, 5], [2, 6]] },
    { id: 'gemini', name: 'Gemini', myth: 'Castor and Pollux', stars: [[113.65, 31.888, 1.6, 'Castor'], [116.329, 28.026, 1.15, 'Pollux'], [99.428, 16.399, 1.9], [100.983, 25.131, 3], [95.74, 22.514, 2.9], [93.719, 22.507, 3.3], [110.031, 21.982, 3.5], [116.112, 24.398, 3.55], [101.322, 12.896, 3.35], [107.785, 30.245, 4.4], [111.432, 27.798, 3.8], [113.981, 26.896, 4.1]],
      lines: [[0, 9], [9, 3], [3, 4], [4, 5], [1, 11], [11, 6], [6, 2], [1, 7], [9, 10], [10, 11], [6, 8]] },
    { id: 'leo', name: 'Leo', myth: 'the Nemean lion', stars: [[152.093, 11.967, 1.35, 'Regulus'], [151.833, 16.763, 3.5], [154.993, 19.842, 2], [154.173, 23.417, 3.45], [148.191, 26.007, 3.9], [146.463, 23.774, 2.95], [168.527, 20.524, 2.55], [168.56, 15.43, 3.3], [177.265, 14.572, 2.1, 'Denebola']],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 8], [8, 7], [7, 6], [7, 0]] },
    { id: 'scorpius', name: 'Scorpius', myth: "the scorpion that stung Orion", stars: [[247.352, -26.432, 1.05, 'Antares'], [241.359, -19.806, 2.6], [240.083, -22.622, 2.3], [239.713, -26.114, 2.9], [245.297, -25.593, 2.9], [248.971, -28.216, 2.8], [252.541, -34.293, 2.3], [252.968, -38.048, 3], [254.655, -42.362, 3.6], [258.038, -43.239, 3.3], [264.33, -42.998, 1.85], [266.896, -40.127, 3], [265.622, -39.03, 2.4], [263.402, -37.104, 1.6]],
      lines: [[1, 2], [2, 3], [2, 4], [4, 0], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13]] },
    { id: 'canismajor', name: 'The Great Dog', myth: "Orion's hound", stars: [[101.287, -16.716, -1.46, 'Sirius'], [95.675, -17.956, 2], [104.656, -28.972, 1.5], [107.098, -26.393, 1.85], [111.024, -29.303, 2.45], [105.94, -15.633, 4.1], [105.756, -23.833, 3]], lines: [[0, 1], [0, 6], [6, 3], [3, 2], [3, 4], [0, 5]] },
    { id: 'auriga', name: 'Auriga', myth: 'the charioteer', stars: [[79.172, 45.998, 0.1, 'Capella'], [89.882, 44.948, 1.9], [89.93, 37.212, 2.65], [81.573, 28.608, 1.65], [74.248, 33.166, 2.7]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
    { id: 'bootes', name: 'Bootes', myth: 'the herdsman', stars: [[213.915, 19.182, -0.05, 'Arcturus'], [221.247, 27.074, 2.35], [208.671, 18.398, 2.7], [218.02, 38.308, 3.05], [228.876, 33.315, 3.45], [225.487, 40.39, 3.5], [217.957, 30.371, 3.6]], lines: [[0, 1], [1, 4], [4, 5], [5, 3], [3, 6], [6, 0], [0, 2]] }
  ];
  var SINGLE = [[114.825, 5.225, 0.35, 'Procyon'], [201.298, -11.161, 0.95, 'Spica'], [344.413, -29.622, 1.15, 'Fomalhaut'], [116.329, 28.026, 1.15]];

  /** every constellation star with alt / az at ms; up = constellations with their middle at least 5 deg up */
  function visible(ms, lat, lon) {
    var out = [], up = [];
    for (var i = 0; i < C.length; i++) {
      var c = C[i], pts = [], sa = 0, n = 0, sx = 0, sy = 0;
      for (var j = 0; j < c.stars.length; j++) {
        var s = c.stars[j], h = altaz(s[0], s[1], ms, lat, lon);
        pts.push({ alt: h.alt, az: h.az, mag: s[2], name: s[3] || '' });
        sa += h.alt; n++; sx += Math.cos(h.az * D2R); sy += Math.sin(h.az * D2R);
      }
      var mid = { alt: sa / n, az: n360(Math.atan2(sy, sx) * R2D) };
      out.push({ id: c.id, name: c.name, myth: c.myth, cluster: !!c.cluster, pts: pts, lines: c.lines, mid: mid });
      if (mid.alt >= 5) up.push({ id: c.id, name: c.name, myth: c.myth, alt: Math.round(mid.alt), az: Math.round(mid.az), dir: compass(mid.az) });
    }
    var singles = [];
    for (var k = 0; k < SINGLE.length; k++) { var q = altaz(SINGLE[k][0], SINGLE[k][1], ms, lat, lon); singles.push({ alt: q.alt, az: q.az, mag: SINGLE[k][2], name: SINGLE[k][3] || '' }); }
    up.sort(function (a, b) { return b.alt - a.alt; });
    return { list: out, up: up, singles: singles };
  }
  function compass(az) { return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(n360(az) / 45) % 8]; }
  /** the galactic equator (b = 0) every 6 deg of longitude, in RA / Dec (J2000 north galactic pole RA 192.859, Dec 27.128, l of the NCP 122.932) */
  function milkyWay() {
    var out = [], aG = 192.85948 * D2R, dG = 27.12825 * D2R, lN = 122.93192;
    for (var l = 0; l < 360; l += 6) {
      var x = (lN - l) * D2R, sd = Math.cos(dG) * Math.cos(x), dec = Math.asin(sd);
      var ra = aG + Math.atan2(Math.sin(x), -Math.sin(dG) * Math.cos(x));
      out.push([n360(ra * R2D), dec * R2D, l]);
    }
    return out;
  }
  /** a seeded field of faint background stars (uniform on the sphere), [ra, dec, mag] */
  function field(n, seed) {
    var s = seed >>> 0 || 7, out = [];
    function rnd() { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    for (var i = 0; i < n; i++) out.push([rnd() * 360, Math.asin(rnd() * 2 - 1) * R2D, 3.6 + Math.pow(rnd(), 0.6) * 2.6]);
    return out;
  }

  var API = { NY: NY, julian: julian, gmst: gmst, altaz: altaz, sun: sun, moon: moon, phase: phase, timeFor: timeFor, nyOffsetMin: nyOffsetMin,
    CONSTELLATIONS: C, SINGLE: SINGLE, visible: visible, milkyWay: milkyWay, field: field, compass: compass, n360: n360 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.OLYMPUS_POLIS_SKY = API;
})(typeof self !== 'undefined' ? self : this);
