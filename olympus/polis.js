/* OLYMPUS POLIS kit (docs/POLIS_KIT.md, demo olympus/polis-lab.html, tests/test_polis_kit.py).
 * The look of a modern Ancient Greek city-state: marble, bronze, gold leaf and painted clay, lit like now.
 * Everything is drawn in code (SVG / CSS / canvas), original art, no file downloads, no CDN. ES5 only (iPhone Safari 12+).
 *
 *   window.OLYMPUS_POLIS = {
 *     meander(el, {size, color, draw, live, sides})   Greek-key border that draws itself and can run like a ticker
 *     columnFrame(el, {order})                         Doric / Ionic / Corinthian card frame (orderFor(rank) maps normal/good/record)
 *     inscribe(el, {plaque, gild, numerals})           title cut into marble (or gilded), numbers show as Greek numerals on hover / tap
 *     greekNumeral(n, {upper})                         2026 -> '͵βκϛʹ' (Ionic / Milesian alphabetic numerals)
 *     pottery(name, {style, frame, size})              SVG string: black- or red-figure owl laurel trireme bull horse lyre torch
 *                                                      amphora warrior scales dolphin olive
 *     mosaic(el, {pattern, dense, tile})               procedural tessera backdrop: waves | rosettes | dolphins | meander
 *     coin(el, {value, state, size})                   owl tetradrachm: wins flip a bright silver coin, losses dull it to bronze
 *     atticDate(date, {tz})                            {label:'Pyanepsion 21', month, day, ...} astronomical approximation (see below)
 *     sundial(el, {tz})                                session clock whose shadow follows the real sun over New York
 *     lamp(el, {label, progress})                      clay oil-lamp loader: the flame grows (no spinner)
 *     laurel(el, {kind, gold, form})                   laurel wreath (passes, records) or olive sprig (steady weeks); gold leaf
 *     auto(root)                                       wires data-polis-* attributes (see docs)
 *   }
 * LITE (OLYMPUS.lite(), ?lite=1 or prefers-reduced-data) and prefers-reduced-motion: no animation at all, smaller canvases.
 * Text is set with textContent / escaped attributes only; no data is ever injected as markup.
 */
(function (W) {
  'use strict';
  var D = W.document;
  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;
  var UID = 0;
  var P = {};

  /* ------------------------------------------------------------------ small helpers */
  function uid(p) { UID += 1; return 'pl' + (p || '') + UID; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pt(x, y) { return r2(x) + ',' + r2(y); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mq(q) { try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } }
  function search() { try { return (W.location && W.location.search) || ''; } catch (e) { return ''; } }
  function isLite() {
    var O = W.OLYMPUS, v = false;
    if (O && O.lite !== undefined) { try { v = typeof O.lite === 'function' ? !!O.lite() : !!O.lite; } catch (e) { v = false; } }
    return v || /[?&]lite=1(&|$)/.test(search()) || mq('(prefers-reduced-data: reduce)');
  }
  function isReduced() { return mq('(prefers-reduced-motion: reduce)') || /[?&]still=1(&|$)/.test(search()); }
  function still() {
    var s = isLite() || isReduced();
    if (D && D.documentElement) { D.documentElement.classList[s ? 'add' : 'remove']('polis-still'); }
    return s;
  }
  function svgEl(tag, attrs) {
    var e = D.createElementNS(NS, tag), k;
    for (k in attrs) { if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]); }
    return e;
  }
  function attrs(o) { var s = '', k; for (k in o) { if (o.hasOwnProperty(k) && o[k] !== null && o[k] !== undefined) s += ' ' + k + '="' + esc(o[k]) + '"'; } return s; }
  function tag(t, o, inner) { return '<' + t + attrs(o) + (inner === undefined ? '/>' : '>' + inner + '</' + t + '>'); }
  function grad(id, stops, o) {
    var s = '', i;
    for (i = 0; i < stops.length; i++) s += '<stop offset="' + stops[i][0] + '" stop-color="' + stops[i][1] + '"' + (stops[i][2] !== undefined ? ' stop-opacity="' + stops[i][2] + '"' : '') + '/>';
    return tag((o && o.radial) ? 'radialGradient' : 'linearGradient', extend({ id: id }, (o && o.a) || {}), s);
  }
  function extend(a, b) { var k; for (k in b) { if (b.hasOwnProperty(k)) a[k] = b[k]; } return a; }
  function clearSafe(el, cls) { var kids = el.children, i; for (i = kids.length - 1; i >= 0; i--) { if (kids[i].classList && kids[i].classList.contains(cls)) el.removeChild(kids[i]); } }
  function onResize(el, fn) {
    var t = null, last = '';
    function run() { var w = el.clientWidth, h = el.clientHeight, k = w + 'x' + h; if (k !== last && w > 0) { last = k; fn(w, h); } }
    function later() { if (t) clearTimeout(t); t = setTimeout(run, 120); }
    if (W.ResizeObserver) { var ro = new W.ResizeObserver(later); ro.observe(el); return function () { ro.disconnect(); }; }
    W.addEventListener('resize', later);
    return function () { W.removeEventListener('resize', later); };
  }
  function prng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { var h = 2166136261, i; str = String(str); for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }

  /* shared gold-leaf / metal palettes: many stops so a fill reads as beaten leaf, not flat yellow */
  var GOLD = [[0, '#6a4b16'], [0.18, '#a97a26'], [0.34, '#e9c86f'], [0.46, '#fff1c4'], [0.56, '#d9b153'], [0.74, '#9c6f22'], [0.88, '#d1a648'], [1, '#7a5718']];
  var BRONZE = [[0, '#5a3418'], [0.3, '#9c6b3c'], [0.5, '#d6a46c'], [0.7, '#8a5a2e'], [1, '#4c2a12']];
  var CLAY = '#c8693a', CLAY_LIGHT = '#dd8c55', CLAY_DARK = '#a9532b', GLAZE = '#17100c', ADDRED = '#8c2f20', ADDWHITE = '#ece0c8';

  /* ------------------------------------------------------------------ 3. Greek numerals (Ionic / Milesian alphabetic system) */
  var GU = ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ'];
  var GT = ['', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ϟ'];
  var GH = ['', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'ϡ'];
  function g999(n) { return GH[Math.floor(n / 100)] + GT[Math.floor(n / 10) % 10] + GU[n % 10]; }
  function g9999(n) { var th = Math.floor(n / 1000); return (th ? '͵' + GU[th] : '') + g999(n % 1000); }
  /** greekNumeral(2026) -> '͵βκϛʹ'. Units α-θ (6 = stigma ϛ), tens ι-ϟ (90 = koppa), hundreds ρ-ϡ (900 = sampi); thousands take the
   *  lower-left keraia ͵ ; 10,000 and up are written in myriads ('βΜ ͵γωκʹ' = 23,820), up to 99,999,999. The keraia ʹ closes the number.
   *  0 has no Greek numeral (returns ''); non-integers are rounded; negatives get a minus sign. */
  function greekNumeral(n, opts) {
    n = Number(n);
    if (!isFinite(n)) return '';
    var neg = n < 0, s;
    n = Math.round(Math.abs(n));
    if (n === 0) return '';
    if (n >= 1e8) return (neg ? '−' : '') + String(n);
    if (n >= 10000) {
      var my = Math.floor(n / 10000), rest = n % 10000;
      s = g9999(my) + 'Μ' + (rest ? ' ' + g9999(rest) : '');
    } else s = g9999(n);
    s += 'ʹ';
    if (opts && opts.upper) s = s.toUpperCase();
    return (neg ? '−' : '') + s;
  }
  P.greekNumeral = greekNumeral;

  /* ------------------------------------------------------------------ sun and moon (shared by the Attic calendar and the sundial) */
  function jd(ms) { return ms / 864e5 + 2440587.5; }
  function msOfJd(j) { return (j - 2440587.5) * 864e5; }
  var DELTA_T = 69 / 86400;            // TT - UT, about 69 s in the 2020s (adds < 1 min of error elsewhere in 1990-2060)
  /** NOAA's low-precision solar formulas (good to ~1 minute in time, ~0.1 degree): equation of time (min), declination (rad) */
  function sunEq(ms) {
    var d = new Date(ms), y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
    var doy = Math.floor((ms - y0) / 864e5) + 1, hr = d.getUTCHours() + d.getUTCMinutes() / 60;
    var g = 2 * Math.PI / 365 * (doy - 1 + (hr - 12) / 24);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var de = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    return { eq: eq, decl: de };
  }
  /** the sun at a moment, for a place (lon east +): hour angle (deg, 0 = local apparent noon, + afternoon) and altitude (deg) */
  function sunAt(ms, lat, lon) {
    var s = sunEq(ms), d = new Date(ms);
    var minUtc = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    var ha = (minUtc + s.eq + 4 * lon) / 4 - 180;
    while (ha > 180) ha -= 360;
    while (ha < -180) ha += 360;
    var la = lat * RAD, cz = Math.sin(la) * Math.sin(s.decl) + Math.cos(la) * Math.cos(s.decl) * Math.cos(ha * RAD);
    return { ha: ha, alt: 90 - Math.acos(Math.max(-1, Math.min(1, cz))) / RAD, eq: s.eq, decl: s.decl };
  }
  /** sunrise / sunset (UTC ms) for the UTC calendar day that contains noonMs; null when the sun does not rise or set */
  function sunRiseSet(noonMs, lat, lon) {
    var s = sunEq(noonMs), la = lat * RAD;
    var c = Math.cos(90.833 * RAD) / (Math.cos(la) * Math.cos(s.decl)) - Math.tan(la) * Math.tan(s.decl);
    if (c > 1 || c < -1) return null;
    var H = Math.acos(c) / RAD, d = new Date(noonMs), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return { rise: day0 + (720 - 4 * (lon + H) - s.eq) * 6e4, set: day0 + (720 - 4 * (lon - H) - s.eq) * 6e4 };
  }
  /** Meeus, Astronomical Algorithms (2nd ed.) ch. 49: the true new moon number k (k = 0 is 2000 Jan 6), in JDE (TT).
   *  Mean phase + the 25 periodic terms; the 14 small planetary terms (< 30 s) are left out. Error well under 2 minutes. */
  function newMoonJDE(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var J = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
    var Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
    var F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
    var Om = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
    var s = Math.sin;
    J += -0.4072 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M)
      - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
      + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F)
      + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
      + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
    return J;
  }
  /** Meeus ch. 27: the June solstice of a Gregorian year (years 1000-3000), JDE (TT), with the 24-term periodic correction */
  var SOL_TERMS = [[485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886],
    [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678],
    [50, 21.02, 2281.226], [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328], [17, 288.79, 4562.452],
    [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]];
  function juneSolsticeJDE(year) {
    var Y = (year - 2000) / 1000;
    var J0 = 2451716.56767 + 365241.62603 * Y + 0.00325 * Y * Y + 0.00888 * Y * Y * Y - 0.0003 * Y * Y * Y * Y;
    var T = (J0 - 2451545) / 36525, Wd = (35999.373 * T - 2.47) * RAD, dl = 1 + 0.0334 * Math.cos(Wd) + 0.0007 * Math.cos(2 * Wd), S = 0, i;
    for (i = 0; i < SOL_TERMS.length; i++) S += SOL_TERMS[i][0] * Math.cos((SOL_TERMS[i][1] + SOL_TERMS[i][2] * T) * RAD);
    return J0 + 0.00001 * S / dl;
  }
  P.astro = { newMoonJDE: newMoonJDE, juneSolsticeJDE: juneSolsticeJDE, sunAt: sunAt, sunRiseSet: sunRiseSet, jd: jd, msOfJd: msOfJd };

  /* ------------------------------------------------------------------ 7. the Attic calendar (a documented astronomical approximation)
   * Method (also in docs/POLIS_KIT.md):
   *  1. Athens counted lunar months. A month began with the Noumenia, the day after the first thin crescent was seen at dusk.
   *     We compute every true new moon (conjunction) with Meeus ch. 49, then take the first Athens sunset (37.97 N, 23.73 E, real
   *     sunset from the solar formulas, clock = UTC+2) at least 24 hours after the conjunction: that is when a crescent can first be
   *     seen. The Greek day ran from sunset to sunset, so the Noumenia is the daylight date after that sunset.
   *  2. The year began with the first new moon after the summer solstice (Meeus ch. 27): Hekatombaion 1.
   *  3. A year is the 12 or 13 months up to the next Hekatombaion 1. In a 13-month year the extra month is Poseideon II, after
   *     Poseideon (the usual Athenian choice). Months come out 29 ("hollow") or 30 ("full") days long, as they did.
   *  Limits: the real calendar was run by the archons, who could add days or months for festivals or politics, so a historical
   *  date can differ by a day or a month; first-crescent visibility also depends on weather and the moon's angle. This is the
   *  calendar the astronomy implies, not a record of what any archon declared. Dates are labelled as civil dates (YYYY-MM-DD).
   */
  var ATTIC = ['Hekatombaion', 'Metageitnion', 'Boedromion', 'Pyanepsion', 'Maimakterion', 'Poseideon', 'Gamelion', 'Anthesterion',
    'Elaphebolion', 'Mounichion', 'Thargelion', 'Skirophorion'];
  var ATTIC_GR = ['Εκατομβαιών', 'Μεταγειτνιών', 'Βοηδρομιών', 'Πυανεψιών', 'Μαιμακτηριών', 'Ποσειδεών', 'Γαμηλιών', 'Ανθεστηριών',
    'Ελαφηβολιών', 'Μουνιχιών', 'Θαργηλιών', 'Σκιροφοριών'];
  var ATH = { lat: 37.97, lon: 23.73, off: 2 };
  var NM_CACHE = {}, NOU_CACHE = {}, START_CACHE = {};
  function newMoonMs(k) { if (NM_CACHE[k] === undefined) NM_CACHE[k] = msOfJd(newMoonJDE(k) - DELTA_T); return NM_CACHE[k]; }
  function athDay(ms) { return Math.floor((ms + ATH.off * 36e5) / 864e5); }
  function athSunset(dn) {
    var noon = dn * 864e5 + (12 - ATH.off) * 36e5, rs = sunRiseSet(noon, ATH.lat, ATH.lon);
    return rs ? rs.set : noon + 6 * 36e5;
  }
  /** civil day number (days since 1970-01-01) of the Noumenia of lunation k */
  function noumenia(k) {
    if (NOU_CACHE[k] !== undefined) return NOU_CACHE[k];
    var t = newMoonMs(k) + 864e5, dn = athDay(t);
    if (athSunset(dn) < t) dn += 1;            // that day's sunset came too early: the first visible crescent is the next evening
    NOU_CACHE[k] = dn + 1;                      // the Greek day starts at that sunset; its daylight is the next civil date
    return NOU_CACHE[k];
  }
  /** lunation number of Hekatombaion 1 of the Attic year that starts in the summer of Gregorian year y */
  function yearStartK(y) {
    if (START_CACHE[y] !== undefined) return START_CACHE[y];
    var sol = msOfJd(juneSolsticeJDE(y) - DELTA_T);
    var k = Math.floor((jd(sol) - 2451550.09766) / 29.530588861) - 1;
    while (newMoonMs(k) <= sol) k += 1;
    START_CACHE[y] = k;
    return k;
  }
  function dayNumOf(date, tz) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      var a = date.split('-');
      return Math.floor(Date.UTC(+a[0], +a[1] - 1, +a[2]) / 864e5);
    }
    var ms = date instanceof Date ? date.getTime() : (date === undefined || date === null ? Date.now() : (typeof date === 'number' ? date : new Date(date).getTime()));
    var p = tzParts(ms, tz || 'America/New_York');
    return Math.floor(Date.UTC(p.y, p.mo - 1, p.d) / 864e5);
  }
  function iso(dn) { var d = new Date(dn * 864e5); return d.toISOString().slice(0, 10); }
  /** atticDate(date, {tz}) -> {label:'Pyanepsion 21', month, monthGreek, monthIndex (0-12), intercalary, day, monthDays, full, dayName,
   *  decade, year:{start, end, months, leap, olympiad, olympiadYear, label}, iso, approx:true}. date: Date, ms, ISO string or
   *  'YYYY-MM-DD' (a civil date as given); a moment is turned into its calendar date in tz (default America/New_York). */
  function atticDate(date, opts) {
    var dn = dayNumOf(date, opts && opts.tz);
    if (!isFinite(dn)) return null;
    var gy = new Date(dn * 864e5).getUTCFullYear(), k0 = yearStartK(gy);
    if (noumenia(k0) > dn) { gy -= 1; k0 = yearStartK(gy); }
    var k1 = yearStartK(gy + 1), months = k1 - k0, i = 0;
    while (i < months - 1 && noumenia(k0 + i + 1) <= dn) i += 1;
    var start = noumenia(k0 + i), next = noumenia(k0 + i + 1), day = dn - start + 1, len = next - start;
    var name, gr, inter = false;
    if (months === 13 && i === 6) { name = 'Poseideon II'; gr = ATTIC_GR[5] + ' Β'; inter = true; } else {
      var j = (months === 13 && i > 6) ? i - 1 : i;
      name = ATTIC[j]; gr = ATTIC_GR[j];
    }
    var dayName = day === 1 ? 'Noumenia' : (day === len ? 'Hene kai Nea' : null);
    var decade = day <= 10 ? 'waxing' : (day <= 20 ? 'middle' : 'waning');
    var n = gy + 775;                                   // Olympiad 1, year 1 began in the summer of 776 BC (astronomical year -775)
    var yr = { start: iso(noumenia(k0)), end: iso(noumenia(k1) - 1), months: months, leap: months === 13,
      olympiad: Math.floor(n / 4) + 1, olympiadYear: (n % 4) + 1, gregorian: gy + '/' + String(gy + 1).slice(2) };
    yr.label = 'Olympiad ' + yr.olympiad + '.' + yr.olympiadYear;
    return { label: name + ' ' + day, month: name, monthGreek: gr, monthIndex: i, intercalary: inter, day: day, monthDays: len,
      full: len === 30, dayName: dayName, decade: decade, year: yr, iso: iso(dn), greekDay: greekNumeral(day), approx: true,
      toString: function () { return name + ' ' + day; } };
  }
  P.atticDate = atticDate;
  P.attic = { months: ATTIC.slice(0), monthsGreek: ATTIC_GR.slice(0), noumenia: function (k) { return iso(noumenia(k)); }, yearStartK: yearStartK, newMoonMs: newMoonMs };
  /** atticStamp(el, {date}): appends a small 'Maimakterion 1' chip after the element's text (or fills an empty element) */
  P.atticStamp = function (el, o) {
    o = o || {};
    var a = atticDate(o.date || el.getAttribute('data-polis-attic') || undefined, o);
    if (!a) return null;
    clearSafe(el, 'polis-attic');
    var s = D.createElement('span');
    s.className = 'polis-attic';
    s.textContent = a.label;
    s.title = a.monthGreek + ' ' + a.greekDay + ' (' + a.year.label + '; Attic date, astronomical estimate)';
    el.appendChild(s);
    return a;
  };

  /* ------------------------------------------------------------------ time zones (Intl first, a US-Eastern rule as the fallback) */
  var TZF = {};
  function tzParts(ms, tz) {
    try {
      if (!TZF[tz]) TZF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
      var parts = TZF[tz].formatToParts(new Date(ms)), o = {}, i;
      for (i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
      var h = +o.hour % 24;
      var p = { y: +o.year, mo: +o.month, d: +o.day, h: h, mi: +o.minute, s: +o.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
      p.off = Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 6e4);
      return p;
    } catch (e) {
      var off = -300, y = new Date(ms).getUTCFullYear();                         // America/New_York by the US rule since 2007
      var mar = Date.UTC(y, 2, 8 + (7 - new Date(Date.UTC(y, 2, 8)).getUTCDay()) % 7, 7), nov = Date.UTC(y, 10, 1 + (7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7, 6);
      if (ms >= mar && ms < nov) off = -240;
      var d = new Date(ms + off * 6e4);
      return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay(), off: off };
    }
  }
  P.tzParts = tzParts;

  /* ------------------------------------------------------------------ marble (a tileable canvas texture, made once) */
  var MARBLE = {};
  function marble(kind) {
    kind = kind === 'dark' ? 'dark' : 'light';
    if (MARBLE[kind]) return MARBLE[kind];
    if (!D || !D.createElement) return '';
    var N = isLite() ? 128 : 256, c = D.createElement('canvas');
    c.width = N; c.height = N;
    var g = c.getContext && c.getContext('2d');
    if (!g) return '';
    var rnd = prng(kind === 'dark' ? 7 : 3), L = 16, lat = [], i, j;
    for (i = 0; i < L * L; i++) lat.push(rnd());
    function vn(x, y, per) {                     // periodic value noise, lattice period per (divides L)
      var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), st = L / per;
      function v(a, b) { a = ((a % per) + per) % per; b = ((b % per) + per) % per; return lat[(b * st % L) * L + (a * st % L)]; }
      var a0 = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx, a1 = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    }
    function fbm(u, v) { var s = 0, a = 0.5, per = 2, o; for (o = 0; o < 4; o++) { s += a * vn(u * per, v * per, per); a *= 0.5; per *= 2; } return s; }
    var img = g.createImageData(N, N), d = img.data, dark = kind === 'dark';
    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) {
        var u = i / N, v = j / N, t = fbm(u, v), t2 = fbm(u + 0.37, v + 0.71);
        var ph = 2 * Math.PI * (u + 2 * v) + t * 9.5;              // main veins run on the diagonal (integer turns: tileable)
        var vein = Math.pow(1 - Math.abs(Math.sin(ph)), 9);
        var ph2 = 2 * Math.PI * (3 * u - v) + t2 * 7;
        var fine = Math.pow(1 - Math.abs(Math.sin(ph2)), 26);
        var cloud = (t - 0.5) * 0.5 + (t2 - 0.5) * 0.25;
        var r, gg, b, k = (j * N + i) * 4;
        if (!dark) {                                                 // Pentelic: warm ivory, grey-gold veins
          r = 236 + cloud * 26 - vein * 66 - fine * 34; gg = 229 + cloud * 24 - vein * 70 - fine * 36; b = 216 + cloud * 20 - vein * 78 - fine * 40;
          r += fine * 14;
        } else {                                                     // night marble: umber stone with gold veins
          r = 40 + cloud * 22 + vein * 92 + fine * 60; gg = 33 + cloud * 18 + vein * 70 + fine * 44; b = 26 + cloud * 14 + vein * 30 + fine * 18;
        }
        d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    try { MARBLE[kind] = c.toDataURL('image/jpeg', 0.86); } catch (e) { MARBLE[kind] = ''; }
    return MARBLE[kind];
  }
  P.marble = marble;
  function marbleVars() {
    if (!D || !D.documentElement) return;
    var st = D.documentElement.style;
    if (st.getPropertyValue('--polis-marble-light')) return;
    var a = marble('light'), b = marble('dark');
    if (a) st.setProperty('--polis-marble-light', 'url(' + a + ')');
    if (b) st.setProperty('--polis-marble-dark', 'url(' + b + ')');
  }
  P.marbleVars = marbleVars;

  /* ------------------------------------------------------------------ drawing helpers for leaves and branches */
  function leafD(bx, by, len, w, ang, bend) {
    var a = ang * RAD, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx, b = bend || 0;
    function q(t, s) { var off = b * Math.sin(Math.PI * t) * len; return pt(bx + dx * len * t + px * (w * s + off), by + dy * len * t + py * (w * s + off)); }
    return 'M' + pt(bx, by) + 'C' + q(0.16, 1.05) + ' ' + q(0.62, 0.92) + ' ' + q(1, 0) + 'C' + q(0.62, -0.92) + ' ' + q(0.16, -1.05) + ' ' + pt(bx, by) + 'Z';
  }
  function ribD(bx, by, len, ang, bend) {
    var a = ang * RAD, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx, b = bend || 0, m = b * len;
    return 'M' + pt(bx + dx * len * 0.08, by + dy * len * 0.08) + 'Q' + pt(bx + dx * len * 0.5 + px * m, by + dy * len * 0.5 + py * m) + ' ' + pt(bx + dx * len * 0.88, by + dy * len * 0.88);
  }
  function circD(cx, cy, rr) { return 'M' + pt(cx - rr, cy) + 'a' + r2(rr) + ',' + r2(rr) + ' 0 1,0 ' + r2(2 * rr) + ',0a' + r2(rr) + ',' + r2(rr) + ' 0 1,0 ' + r2(-2 * rr) + ',0Z'; }
  function ellD(cx, cy, rx, ry) { return 'M' + pt(cx - rx, cy) + 'a' + r2(rx) + ',' + r2(ry) + ' 0 1,0 ' + r2(2 * rx) + ',0a' + r2(rx) + ',' + r2(ry) + ' 0 1,0 ' + r2(-2 * rx) + ',0Z'; }
  /** a branch along a quadratic curve p0 -> c -> p1: stem, paired leaves, optional fruit */
  function branch(p0, c, p1, o) {
    var n = o.n || 8, out = { stem: '', leaves: [], ribs: [], fruit: [] }, i, steps = 24, s = '';
    function at(t) { var u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]; }
    function tan(t) { return [2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])]; }
    for (i = 0; i <= steps; i++) { var q = at(i / steps); s += (i ? 'L' : 'M') + pt(q[0], q[1]); }
    out.stem = s;
    for (i = 0; i < n; i++) {
      var t = 0.1 + 0.84 * i / Math.max(1, n - 1), p = at(t), tv = tan(t), ang = Math.atan2(tv[1], tv[0]) / RAD;
      var len = (o.len || 12) * (1 - 0.32 * t), w = (o.w || 3) * (1 - 0.25 * t), side = (i % 2 ? 1 : -1), spread = o.spread || 42, bd = o.bend === undefined ? 0.02 : o.bend;
      var la = ang + side * spread;
      out.leaves.push(leafD(p[0], p[1], len, w, la, side * bd));
      out.ribs.push(ribD(p[0], p[1], len, la, side * bd));
      if (o.pairs) {
        var lb = ang - side * spread;
        out.leaves.push(leafD(p[0], p[1], len * 0.9, w * 0.95, lb, -side * 0.05));
        out.ribs.push(ribD(p[0], p[1], len * 0.9, lb, -side * 0.05));
      }
      if (o.fruit && i % o.fruit === 1) {
        var fa = (ang - side * 70) * RAD, fd = len * 0.45;
        out.fruit.push([p[0] + Math.cos(fa) * fd, p[1] + Math.sin(fa) * fd]);
      }
    }
    var e = at(1), te = tan(1), ea = Math.atan2(te[1], te[0]) / RAD;
    out.leaves.push(leafD(e[0], e[1], (o.len || 12) * 0.62, (o.w || 3) * 0.7, ea, 0));
    out.ribs.push(ribD(e[0], e[1], (o.len || 12) * 0.62, ea, 0));
    return out;
  }
  /** a wreath: two branches round a circle, open at the top, tied at the bottom */
  function wreathParts(cx, cy, R, kind) {
    var olive = kind === 'olive', n = olive ? 12 : 10, out = { stem: '', leaves: [], ribs: [], fruit: [], ribbon: '', ribbonLines: '' }, side, i;
    for (side = -1; side <= 1; side += 2) {
      var steps = 26, s = '';
      var a0 = 90 - side * 14, span = 150;
      for (i = 0; i <= steps; i++) {
        var a = (a0 - side * span * i / steps) * RAD;
        s += (i ? 'L' : 'M') + pt(cx + R * Math.cos(a), cy + R * Math.sin(a));
      }
      out.stem += s;
      for (i = 0; i < n; i++) {
        var t = (i + 0.4) / n, aa = (a0 - side * span * t) * RAD, px = cx + R * Math.cos(aa), py = cy + R * Math.sin(aa);
        var tx = side * Math.sin(aa), ty = -side * Math.cos(aa), ang = Math.atan2(ty, tx) / RAD;
        var len = (olive ? 13 : 14.5) * (1 - 0.3 * t), w = (olive ? 2.1 : 3.9) * (1 - 0.2 * t), sp = olive ? 30 : 36;
        var outA = ang - side * sp, inA = ang + side * sp;
        out.leaves.push(leafD(px, py, len, w, outA, -side * 0.06)); out.ribs.push(ribD(px, py, len, outA, -side * 0.06));
        out.leaves.push(leafD(px, py, len * 0.86, w * 0.92, inA, side * 0.06)); out.ribs.push(ribD(px, py, len * 0.86, inA, side * 0.06));
        if (i % 2 === 1 && i < n - 1) {
          var fa = (ang + side * 90) * RAD, fd = olive ? 3.4 : 4.2;
          out.fruit.push([px + Math.cos(fa) * fd, py + Math.sin(fa) * fd]);
        }
      }
      var ae = (a0 - side * span) * RAD, ex = cx + R * Math.cos(ae), ey = cy + R * Math.sin(ae);
      var ta = Math.atan2(-side * Math.cos(ae), side * Math.sin(ae)) / RAD;
      out.leaves.push(leafD(ex, ey, olive ? 9 : 10, olive ? 1.7 : 3, ta, 0)); out.ribs.push(ribD(ex, ey, olive ? 9 : 10, ta, 0));
    }
    var by = cy + R;
    out.ribbon = 'M' + pt(cx, by) + 'C' + pt(cx - 7, by - 7) + ' ' + pt(cx - 13, by + 1) + ' ' + pt(cx - 9, by + 4) + 'C' + pt(cx - 6, by + 6) + ' ' + pt(cx - 3, by + 2) + ' ' + pt(cx, by) + 'Z' +
      'M' + pt(cx, by) + 'C' + pt(cx + 7, by - 7) + ' ' + pt(cx + 13, by + 1) + ' ' + pt(cx + 9, by + 4) + 'C' + pt(cx + 6, by + 6) + ' ' + pt(cx + 3, by + 2) + ' ' + pt(cx, by) + 'Z' +
      'M' + pt(cx - 1.5, by + 1) + 'C' + pt(cx - 5, by + 8) + ' ' + pt(cx - 8, by + 12) + ' ' + pt(cx - 12, by + 17) + 'L' + pt(cx - 8, by + 16.5) + 'L' + pt(cx - 7.5, by + 19.5) + 'C' + pt(cx - 4, by + 13) + ' ' + pt(cx - 1.5, by + 8) + ' ' + pt(cx + 0.6, by + 2) + 'Z' +
      'M' + pt(cx + 1.5, by + 1) + 'C' + pt(cx + 5, by + 8) + ' ' + pt(cx + 8, by + 12) + ' ' + pt(cx + 12, by + 17) + 'L' + pt(cx + 8, by + 16.5) + 'L' + pt(cx + 7.5, by + 19.5) + 'C' + pt(cx + 4, by + 13) + ' ' + pt(cx + 1.5, by + 8) + ' ' + pt(cx - 0.6, by + 2) + 'Z' +
      circD(cx, by + 0.6, 2.4);
    out.ribbonLines = 'M' + pt(cx - 3, by - 1) + 'Q' + pt(cx - 8, by - 2) + ' ' + pt(cx - 9.5, by + 2.5) + 'M' + pt(cx + 3, by - 1) + 'Q' + pt(cx + 8, by - 2) + ' ' + pt(cx + 9.5, by + 2.5);
    return out;
  }
  P._wreathParts = wreathParts;

  /* ------------------------------------------------------------------ 4. painted pottery: twelve original black- / red-figure motifs
   * Each motif is layered like a real pot: sil (the painted figure), ss (figure-coloured strokes: spears, oars, strings),
   * red / white (added colours, as on Attic black-figure), top (black dots: pupils), inc (detail lines: incised through the black
   * on black-figure, painted relief lines on red-figure), use (another motif placed small, e.g. a shield device). Grid 120 x 120. */
  function wavesD(y, x0, x1, a, l) {
    var s = 'M' + pt(x0, y), x;
    for (x = x0; x < x1; x += l) s += 'c' + r2(l * 0.25) + ',' + r2(-a) + ' ' + r2(l * 0.75) + ',' + r2(-a) + ' ' + r2(l) + ',0';
    return s;
  }
  function scrollWaveD(y, x0, x1, h) {                         // the running-wave (Vitruvian scroll) border under sea scenes
    var s = 'M' + pt(x0, y), x, w = h * 2.2;
    for (x = x0; x < x1; x += w) {
      s += 'C' + pt(x + w * 0.35, y) + ' ' + pt(x + w * 0.55, y - h) + ' ' + pt(x + w * 0.78, y - h) + 'C' + pt(x + w * 1.02, y - h) + ' ' + pt(x + w * 1.0, y - h * 0.3) + ' ' + pt(x + w * 0.82, y - h * 0.32) +
        'C' + pt(x + w * 0.7, y - h * 0.34) + ' ' + pt(x + w * 0.72, y - h * 0.62) + ' ' + pt(x + w * 0.84, y - h * 0.6) + 'M' + pt(x + w * 0.66, y - h * 0.02) + 'L' + pt(x + w, y);
    }
    return s;
  }
  var MOTIFS = {
    owl: function () {
      var b = branch([20, 74], [22, 46], [41, 26], { n: 7, len: 14, w: 3, spread: 40, fruit: 2 });
      return {
        label: 'owl', ground: 101,
        ss: [{ d: b.stem, w: 1.3 }],
        sil: ['M47,44C46,36 47,30 50,24.5L55,29.6C58,28.4 62,28.4 65,29.6L70,24.5C73,30 74,36 73,44C79,50 83,60 82,72C81,83 77,90 71,94L77,101.5L64,99.5L60,95.5C51,93 44,85 43,72C42,60 43,51 47,44Z',
          'M54,93.5L51,100L54,99.2L56,101L58,99.3L60.5,100.5L59,93.5Z', 'M62,94.5L62,100.8L64.5,99.6L67,101L68.8,99.4L66.6,94Z'].concat(b.leaves).concat(b.fruit.map(function (f) { return ellD(f[0], f[1], 2.2, 2.9); })),
        white: [circD(54.3, 40.2, 5.1), circD(65.7, 40.2, 5.1)],
        top: [circD(55, 40.6, 2.5), circD(65, 40.6, 2.5)],
        red: ['M49.5,58C57,60 63.5,66 67,75L63,77C59.5,69.5 55,64.5 49,62.2Z'],
        inc: [{ d: 'M47.5,46.5C50.5,50 56.5,50.5 60,47.2C63.5,50.5 69.5,50 72.5,46.5M48.8,34.6C52,32.8 57,33.4 59.6,36.4M60.4,36.4C63,33.4 68,32.8 71.2,34.6', w: 0.75 },
          { d: 'M60,43.2L58.4,47.4L60,50.2L61.6,47.4Z', w: 0.7 },
          { d: 'M48,55.5C56,57.5 64,65 68.5,81C69.6,86 70.4,90.5 71,94M49,62.2C55,64.5 59.5,69.5 63,77M67,75L63,77', w: 0.75 },
          { d: 'M52,66c1.6,2.6 4.4,2.8 6.4,0.8M55,72.5c1.6,2.6 4.4,2.8 6.4,0.8M50.5,73c1.6,2.6 4.4,2.8 6.4,0.8M58,79c1.6,2.6 4.4,2.8 6.4,0.8M53,80c1.6,2.6 4.4,2.8 6.4,0.8', w: 0.6 },
          { d: 'M61,84L69,95M57.5,86L64.6,96.2M54,86.6L60.6,95.4', w: 0.65 },
          { d: 'M72,58l1.5,2.2l1.5,-2.2M76,63.5l1.5,2.2l1.5,-2.2M71.6,66l1.5,2.2l1.5,-2.2M75.6,71.5l1.5,2.2l1.5,-2.2M71.2,74l1.5,2.2l1.5,-2.2M75,79.5l1.5,2.2l1.5,-2.2M71,82l1.5,2.2l1.5,-2.2', w: 0.6 },
          { d: b.ribs.join(''), w: 0.45 }]
      };
    },
    laurel: function () {
      var w = wreathParts(60, 58, 34, 'laurel');
      return { label: 'laurel wreath', ss: [{ d: w.stem, w: 1.5 }], sil: w.leaves.concat(w.fruit.map(function (f) { return circD(f[0], f[1], 1.9); })),
        red: [w.ribbon], inc: [{ d: w.ribs.join(''), w: 0.5 }, { d: w.ribbonLines, w: 0.5 }] };
    },
    olive: function () {
      var b = branch([28, 102], [32, 52], [90, 22], { n: 14, len: 20, w: 3.1, spread: 34, fruit: 3 });
      var b2 = branch([44, 66], [64, 60], [98, 64], { n: 6, len: 16, w: 2.7, spread: 36, fruit: 2 });
      var fr = b.fruit.concat(b2.fruit), olives = fr.map(function (f) { return ellD(f[0], f[1], 3.6, 4.6); });
      return { label: 'olive branch', ss: [{ d: b.stem, w: 2.2 }, { d: b2.stem, w: 1.5 }], sil: b.leaves.concat(b2.leaves).concat(olives),
        inc: [{ d: b.ribs.join('') + b2.ribs.join(''), w: 0.5 }, { d: fr.map(function (f) { return 'M' + pt(f[0] - 1.2, f[1] - 1.6) + 'q1,-0.8 2,-0.2'; }).join(''), w: 0.55 }],
        white: fr.map(function (f) { return circD(f[0] - 0.9, f[1] - 1.4, 0.65); }) };
    },
    trireme: function () {
      var oars = '', i, sh = [], shR = [], shW = [], shInc = '';
      for (i = 0; i < 11; i++) { var x = 34 + i * 5.7; oars += 'M' + pt(x, 74) + 'L' + pt(x - 7.5, 90.5); }
      for (i = 0; i < 8; i++) { var cx = 35 + i * 7.6; (i % 2 ? shR : shW).push(circD(cx, 63.2, 3.1)); shInc += circD(cx, 63.2, 1.9); }
      return {
        label: 'trireme', sea: 93,
        ss: [{ d: 'M23,66C14,58 14,45 22.5,39.5C27.5,36.5 31.5,40.5 28.5,44', w: 3.2 }, { d: 'M62,66L62,23', w: 2 }, { d: 'M39,27.5Q62,23 85,27.5', w: 1.8 },
          { d: 'M62,23.5L22,47M62,23.5L95,57', w: 0.7 }, { d: oars, w: 1.25 }, { d: 'M28,66.2L95,66.2', w: 1.6 }],
        sil: ['M25,52C21.5,57 21.5,64 28,66.5L92,66.5L94,58L96.5,58L95.5,66.5L99,70L109,74L98,78L28,79.5C19,78.5 15,71.5 16,63.5C17,57.5 20.5,54 25,52Z',
          'M42,29.2Q62,25.6 82,29.2L80,55.6Q62,59.6 44,55.6Z'],
        white: shW.concat(['M85.5,71.6a3.4,2.3 0 1,0 6.8,0a3.4,2.3 0 1,0 -6.8,0Z']),
        red: shR.concat(['M30,69.6L96,69.6L96.6,72.2L30,72.2Z']),
        top: [circD(88.9, 71.6, 1.15)],
        inc: [{ d: 'M50,29L50.5,56.5M56,27.8L56,57.6M62,27.4L62,58M68,27.8L68,57.6M74,28.6L73.5,56.8M43.5,38Q62,34.6 81,38M44,47Q62,43.6 80.5,47', w: 0.6 },
          { d: shInc, w: 0.5 }, { d: 'M30,75.4L97,75.6M98,74L108,74', w: 0.6 }]
      };
    },
    bull: function () {
      return {
        label: 'bull', ground: 93.5,
        ss: [{ d: 'M88.4,42C88,35.5 92,31.4 97.5,31.6M90.6,42.6C92.5,37.5 96,35.2 99.6,36.2', w: 2.1 }, { d: 'M27.5,58C21,62 19.5,72 21.8,82', w: 1.6 }],
        sil: ['M26,60C26,50 36,45 50,45C60,45 66,41.6 73,38.6C79.6,37.6 85,39 88,42L92,44C95,45 98,49 99,54L101,60C101.5,63 99,65 96,64.2L92,63.2C90,63.2 88,64.2 87,67.2C86,71 83,73 80,73L72,74.2C64,76 50,76 42,75C36,74 31,72 28,68C26.5,66 26,63 26,60Z',
          'M74.4,70C76.6,76 78.2,80.4 78.4,84.4L78,89.8L77.2,93.5L83.4,93.5L82.2,89.8L82,84.4C82.2,79.4 82.8,75 83,70Z',
          'M67.8,71.4C69.6,77 70.6,81 70.6,85L70,89.8L69,93.5L74.8,93.5L74.4,89.8L74.4,85C74.6,80.4 75.4,76.2 76,71.6Z',
          'M33,66C30.4,74 31.6,80 35.6,84.6L34.8,89.8L34.2,93.5L40.4,93.5L40,89.8L40.4,84.4C39.6,80.4 41.4,75.6 44,71.4Z',
          'M42.6,72.4C42.2,78 43.8,82 46,85L45.4,89.8L44.8,93.5L50.4,93.5L49.8,89.8L50.2,84.8C49.6,81 50,77 51.2,73.2Z',
          'M86.2,44.2L79.6,40.6L84.6,46.4Z', 'M22,80C18.8,84 19.6,89.6 23,90.6C25.2,87.4 25.2,83.2 22,80Z'],
        red: ['M74,46.4C71,52.4 71,62.4 75,72.2L80.6,72.4C78,64.4 77.2,54.4 79.2,44.4Z'],
        white: ['M92.6,48.2a1.8,1.3 0 1,0 3.6,0a1.8,1.3 0 1,0 -3.6,0Z'],
        top: [circD(94.6, 48.3, 0.8)],
        inc: [{ d: 'M82.2,44.2C80,52 81,60 84,66.4M78,45.4C76,52.4 77,60.4 80,68.4M44,48.4C40,54.4 40,62.4 41.4,70M51,74.4C57,73 62,72.8 67.4,73.2', w: 0.75 },
          { d: 'M97.6,58.4C96.8,60.4 97.8,62.2 99.6,62.4M96.4,55.6l1.6,0.6M92,52.4C93.6,54.4 95.6,55 98.6,54.6', w: 0.6 },
          { d: 'M78.2,89.8L82,89.8M70.2,89.8L74.2,89.8M35,89.8L39.8,89.8M45.6,89.8L49.6,89.8M78.6,84.4C79.6,85.6 81,85.6 81.8,84.4M35.8,84.6C37,85.8 38.8,85.8 40.2,84.6', w: 0.55 },
          { d: 'M30,60C34,56 40,55 46,56M56,48.4C62,50 68,49.8 72.6,48.4', w: 0.55 }]
      };
    },
    horse: function () {
      return {
        label: 'horse', ground: 91,
        ss: [{ d: 'M35,54C27,56 23.6,64 25.6,76C26.4,80 27.6,83 26.8,87', w: 3.4 }, { d: 'M33.6,56C28,60 27,68 29.6,78', w: 1.6 }],
        sil: ['M34,58C34,50 42,47 52,47L66,47C70,45 73,40 75,34C77,28 80,24 84,22.4L86.6,21.6C89,22 91,24.4 92.6,27.4L99.6,38.6C101,41 100.4,43.4 97.6,43.6L93.4,43.2C90.6,43 88.6,42 87.4,40.4C85.8,46 84,54 81.6,60C80,64.4 79,66.6 77,68L72,69C62,71 50,71 44,70C38,69 34,65 34,58Z',
          'M84.4,23L84.8,16.6L87.8,22.4Z',
          'M75.4,65C77.6,71 79,75.4 79.2,79.6L78.8,86.6L78,91L82.6,91L82.6,86.6L82.6,79.6C82.6,75 82.4,70.6 82,66Z',
          'M69.2,67.4C70.6,72.6 71.2,76.6 71,80.4L70.2,86.6L69.2,91L73.6,91L74,86.6L74.6,80.4C75,76.4 75.4,72 75.4,67.8Z',
          'M36.4,63.6C33.6,71 35,77.4 39.4,81.6L38.8,86.6L38.2,91L42.8,91L43,86.6L43.4,81.4C42.4,77 43.4,72.4 45.6,68.6Z',
          'M45.4,69C45.4,74.6 47,78.6 49.6,81.8L49,86.6L48.4,91L52.8,91L53,86.6L53.4,81.6C52.6,77.6 52.6,73.4 53.6,69.6Z'],
        red: ['M66.4,46.4C70.4,42 73.4,36 75.4,30.6C77.2,26 80,23.4 83.4,22.4L85,24.4C81.8,25.6 79.6,28.4 78,32.6C76,38.4 73,44 69.6,48Z'],
        white: ['M88.8,29.2a1.6,1.15 0 1,0 3.2,0a1.6,1.15 0 1,0 -3.2,0Z'],
        top: [circD(90.6, 29.3, 0.75)],
        inc: [{ d: 'M87,33C88,38 90.4,42.4 95,43.2M97.6,39l1.4,0.9M74,52C71,58 72,62 75.6,65.6M44,52C40,57 40.6,61 43.6,66M52,69.6C58,68.4 63,68.2 67.6,68.6', w: 0.7 },
          { d: 'M70.6,43.6l-2.4,-1.4M73.4,39l-2.4,-1.4M75.6,34l-2.4,-1.4M78.2,28.8l-2.2,-1.4', w: 0.6 },
          { d: 'M86.4,31.4C85.6,34.6 86.2,37.6 87.6,40', w: 0.55 },
          { d: 'M79,86.6L82.6,86.6M70.2,86.6L74,86.6M38.8,86.6L43,86.6M49,86.6L53,86.6', w: 0.55 }]
      };
    },
    lyre: function () {
      var s = '', i;
      for (i = 0; i < 7; i++) s += 'M' + pt(51.5 + i * 2.85, 82.4) + 'L' + pt(49 + i * 3.7, 35.4);
      return {
        label: 'lyre',
        ss: [{ d: 'M47,75C40,67 35.6,56 39.6,46C42,40 44,36 42,30.4', w: 4.4 }, { d: 'M73,75C80,67 84.4,56 80.4,46C78,40 76,36 78,30.4', w: 4.4 }, { d: s, w: 0.7 }],
        sil: ['M38,84C38,74 48,68 60,68C72,68 82,74 82,84C82,94 72,100 60,100C48,100 38,94 38,84Z',
          'M36,30L84,30C85.5,30 86,31 86,32L86,34C86,35 85.5,35.6 84,35.6L36,35.6C34.5,35.6 34,35 34,34L34,32C34,31 34.5,30 36,30Z', circD(34.6, 32.8, 2.7), circD(85.4, 32.8, 2.7)],
        red: ['M40.4,49.6C34,53.6 31.6,62 33.6,70.4L36,70.2C35.2,63 37.4,56.4 42.4,52.4Z', 'M48.4,81.4L71.6,81.4L71.6,84.8L48.4,84.8Z'],
        white: [circD(42.6, 34.4, 0.8), circD(48.6, 34.4, 0.8), circD(54.6, 34.4, 0.8), circD(60.6, 34.4, 0.8), circD(66.6, 34.4, 0.8), circD(72.6, 34.4, 0.8), circD(78.6, 34.4, 0.8)],
        inc: [{ d: 'M60,70.2L60,97.8M48.6,73.4C46.4,80 46.4,88 49.4,95.8M71.4,73.4C73.6,80 73.6,88 70.6,95.8M40.6,84L48,84M72,84L79.4,84M52,72.4L57,77.6L63,77.6L68,72.4M52,95.6L57,90.6L63,90.6L68,95.6', w: 0.7 },
          { d: 'M53,85.4L53.4,93M56,85.4L56.2,93.6M59,85.4L59,94M62,85.4L61.8,94M65,85.4L64.6,93.6M68,85.4L67.4,93', w: 0.4 }]
      };
    },
    torch: function () {
      return {
        label: 'torch',
        sil: ['M57.6,104.4L58.4,58.6L61.6,58.6L62.4,104.4C62.4,106 57.6,106 57.6,104.4Z', 'M45.6,46.4L74.4,46.4C74.4,52.4 68.4,58.4 62,59.4L58,59.4C51.6,58.4 45.6,52.4 45.6,46.4Z',
          'M43.6,43.6L76.4,43.6L76.4,47.2L43.6,47.2Z', 'M54.6,65.6L65.4,65.6L65.4,69.4L54.6,69.4Z', 'M55.6,82L64.4,82L64.4,84.4L55.6,84.4Z'],
        red: ['M60,9.6C64.4,18 72.6,23.6 72.6,33C72.6,38.4 69.4,42.2 64,43.8L56,43.8C50.6,42.2 47.4,38.4 47.4,33C47.4,27.6 50.6,24.6 53,20.6C54,25.6 56,27.8 58,28C56,22 57,15.6 60,9.6Z',
          'M70.4,22.6C74.8,25.6 76.6,30.4 74.8,35.6C74,31.6 72.4,28.6 69.8,26.6Z', 'M62.4,70.4C68.4,74.4 70.4,80.4 68.4,88.4L66.2,88.2C67.2,81.4 66,76.4 61.4,73.2Z'],
        white: ['M60,22.4C62.2,27.4 66.2,30.2 66.2,35.2C66.2,39.2 63.2,42.2 60,42.2C56.8,42.2 53.8,39.2 53.8,35.2C53.8,31.2 57,28.2 60,22.4Z'],
        inc: [{ d: 'M47.4,49.6L72.6,49.6M49.4,53L70.6,53M58,47.2L58,58.8M62,47.2L62,58.8M54,47.2L55,57M66,47.2L65,57', w: 0.6 },
          { d: 'M56.4,67.5L63.6,67.5M58.8,72L58.8,80M61.2,86L61.2,102', w: 0.5 },
          { d: 'M60,14.6C58.6,21 60,26 62.6,29.6M52.6,26.2C51.6,31 53,35.6 56,38.6M67.6,28.2C69,32.6 68,36.6 65.2,39.4', w: 0.55 }]
      };
    },
    amphora: function () {
      var rays = '', i;
      for (i = 0; i < 9; i++) { var x = 44.6 + i * 3.6; rays += 'M' + pt(x, 88.4) + 'L' + pt(x + 1.8, 79.6) + 'L' + pt(x + 3.6, 88.4) + 'Z'; }
      var pal = '', pr = '';
      for (i = 0; i < 7; i++) { var a = -150 + i * 20; pal += leafD(60, 66, 9.6 - Math.abs(i - 3) * 0.7, 1.9, a, 0); pr += ribD(60, 66, 9.6 - Math.abs(i - 3) * 0.7, a, 0); }
      return {
        label: 'amphora', ground: 100.4,
        ss: [{ d: 'M54,25.6C44,25.6 39.4,30 39.6,38.6', w: 3.3 }, { d: 'M66,25.6C76,25.6 80.6,30 80.4,38.6', w: 3.3 }],
        sil: ['M49.6,17.6L70.4,17.6L69.4,22.2L50.6,22.2Z', 'M52.8,22L67.2,22L66.2,34.4L53.8,34.4Z',
          'M53.8,34C40,36 32,46 32,58C32,72 42,84 52,90L54,94L66,94L68,90C78,84 88,72 88,58C88,46 80,36 66.2,34Z', 'M52,93.6L68,93.6L72,100.4L48,100.4Z'],
        clay: ['M43,45.4L77,45.4L77,71.4L43,71.4Z', rays, 'M38.6,74.6L81.4,74.6L80.6,76.2L39.4,76.2Z', 'M50.2,22.2L69.8,22.2L69.6,23.1L50.4,23.1Z'],
        panel: [pal, circD(60, 67.4, 2.4), 'M51,69.6C52.6,67.6 55.6,67.4 57.6,68.8C55.6,69.2 53.6,70.4 52.8,72.2ZM69,69.6C67.4,67.6 64.4,67.4 62.4,68.8C64.4,69.2 66.4,70.4 67.2,72.2Z'],
        red: ['M54.6,35.6L65.4,35.6L68.6,37.6L51.4,37.6Z'],
        inc: [{ d: 'M50,40C53,38.6 56.4,38.2 60,38.2C63.6,38.2 67,38.6 70,40M44,42.6L76,42.6', w: 0.6 }, { d: 'M53.8,28L66.2,28M54.4,31L65.6,31', w: 0.55 }],
        pinc: [{ d: pr, w: 0.5 }]
      };
    },
    warrior: function () {
      return {
        label: 'warrior', ground: 100.4,
        ss: [{ d: 'M31,92L101.4,38.6', w: 1.7 }],
        sil: ['M108.6,33.2L102.6,40L100.2,36.8Z', 'M64,73.6L72,87.6L74,100.4L80.4,100.4L79.6,97.6L76.6,96.2L75.6,87.6L69,73.6Z', 'M50,73.6L46,85.6L40,98L45.6,100.4L47.4,98L51.6,87L56.4,74.6Z',
          'M46,71.4L70,71.4L67.6,79.4L48.4,79.4Z', circD(56, 57.4, 19.4),
          'M58,38C58,30 62,25 68,25C74,25 78,29 78,35L78,41L74.4,42L74.4,46.4L70,47.4L68,43C64,43 60,42 58,38Z',
          'M60,28.4C57.6,20 63.6,13.6 72,13.6C80,13.6 86.4,18 88.4,26.4C84,23 78,21 72,22C66,23 62,26 61,30.4Z'],
        red: ['M63.4,22.6C67.8,18.4 75.8,17.2 82.4,20.2L83.6,22.4C77,20 70,21 65.8,24.6Z', 'M47.8,74.6L68.6,74.6L68.2,76.2L48.2,76.2Z'],
        use: [{ m: 'dolphin', t: 'translate(38.2,39.4) scale(0.3)', layer: 'white' }],
        top: [],
        inc: [{ d: circD(56, 57.4, 16.6), w: 0.75 }, { d: 'M70,32.6L77.4,33.2M73.6,36L70.4,42.4M64,30C66,28 70,27 73,27.6', w: 0.7 },
          { d: 'M72,90L76,90.2M44,90.6L48.4,91.2M71.4,94L75.6,94M42.6,94.4L46.8,95', w: 0.55 }, { d: 'M63.6,17.4C67,15.6 72,15.2 76,16.4M62.4,20.2C66,18 72,17.6 78,18.8', w: 0.5 }]
      };
    },
    scales: function () {
      return {
        label: 'scales', ground: 100.4,
        ss: [{ d: 'M30,37L19.4,73.6M30,37L30,73.6M30,37L40.6,73.6M90,37L79.4,73.6M90,37L90,73.6M90,37L100.6,73.6', w: 0.8 }],
        sil: ['M44,100.4L76,100.4L72,95L48,95Z', 'M58.6,95L58.8,34L61.2,34L61.4,95Z', circD(60, 29.6, 3.4), 'M29,35L91,35L91,37.8L29,37.8Z', circD(29, 36.4, 2), circD(91, 36.4, 2),
          'M18,73.6L42,73.6C41,79.6 36,82.8 30,82.8C24,82.8 19,79.6 18,73.6Z', 'M78,73.6L102,73.6C101,79.6 96,82.8 90,82.8C84,82.8 79,79.6 78,73.6Z'],
        white: [ellD(26.4, 72, 3.2, 1.5), ellD(33.4, 72, 3.2, 1.5), ellD(30, 69.6, 3.2, 1.5), ellD(86.4, 72, 3.2, 1.5), ellD(93.4, 72, 3.2, 1.5), ellD(90, 69.6, 3.2, 1.5)],
        red: ['M60,33.2C63.2,38.2 64.2,44.2 62.2,50.2L61.2,50.2C62,44.2 61.4,39.2 59.4,34.2Z', circD(60, 29.6, 1.5)],
        inc: [{ d: 'M60,40L60,93M48,97.6L72,97.6M20.6,76.6L39.4,76.6M80.6,76.6L99.4,76.6M30,36.4L90,36.4', w: 0.55 }]
      };
    },
    dolphin: function () {
      return {
        label: 'dolphin', sea: 98,
        sil: ['M20,82C25,66 39,52 57,46.6C68,43.4 78,42.6 85,45.6C89.6,47.6 92.2,50.6 93.2,53.4L100.6,55.2C102.4,56 102,57.8 99.6,58.2L91.4,59.2C87.4,62.4 82.4,64.6 76,66.2C64,69.2 50,72.2 40.4,77.2C34.6,80.2 30.6,84 28.4,88.2L33.2,94.8C33.8,96.8 32,97.8 30.2,96.6L25.2,91.4L18.4,93.8C16.4,94.4 15.2,92.6 16.6,91.2L22,86.4C21,85.2 20.4,83.6 20,82Z',
          'M52,49C55,41 60,36 67.4,32.6C64.8,39 64.6,43 66.2,46.6Z', 'M70.4,64.6C71,70.6 69,74.6 64.6,78.6C66.2,72.6 66.2,68.6 65.8,65.4Z'],
        white: ['M82.4,51.4a1.6,1.2 0 1,0 3.2,0a1.6,1.2 0 1,0 -3.2,0Z'],
        top: [circD(84.1, 51.5, 0.75)],
        red: ['M88.4,61.4C74.4,65.4 58.4,68.8 42.2,75.8L43.8,77.8C58.4,71.2 74.4,67.6 89.4,63Z'],
        inc: [{ d: 'M93.4,56.6Q88.6,58.4 84,57.8M90.4,59.6C76,64.2 58,68.2 40.4,76.6M79.4,48.8C77.6,51.8 77.6,55.4 79.6,58.2', w: 0.65 }, { d: 'M25.4,85.6L31.6,94.6M22.6,85.4L18.2,91.6', w: 0.5 }]
      };
    }
  };
  var POT_NAMES = ['owl', 'laurel', 'trireme', 'bull', 'horse', 'lyre', 'torch', 'amphora', 'warrior', 'scales', 'dolphin', 'olive'];
  P.potteryNames = POT_NAMES.slice(0);
  var MOTIF_CACHE = {};
  function motif(name) { if (!MOTIF_CACHE[name]) MOTIF_CACHE[name] = MOTIFS[name](); return MOTIF_CACHE[name]; }
  P._motif = motif;

  function figureSVG(m, pal) {
    var s = '', i;
    function paths(list, fill) { if (!list || !list.length) return ''; var o = '', j; for (j = 0; j < list.length; j++) o += '<path d="' + list[j] + '"/>'; return '<g fill="' + fill + '">' + o + '</g>'; }   // one path per piece: overlapping pieces never cancel
    function strokes(list, col) {
      var o = '', j;
      for (j = 0; list && j < list.length; j++) o += tag('path', { d: list[j].d, fill: 'none', stroke: col, 'stroke-width': list[j].w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      return o;
    }
    s += strokes(m.ss, pal.figStroke);
    if (pal.outline) s += tag('path', { d: m.sil.join(''), fill: 'none', stroke: pal.outline, 'stroke-width': 1.3, 'stroke-linejoin': 'round' });   // under the fill: only the outer contour shows
    s += paths(m.sil, pal.fig);
    s += paths(m.clay, pal.ground);
    s += paths(m.panel, pal.fig);
    s += strokes(m.pinc, pal.inc);
    for (i = 0; m.use && i < m.use.length; i++) {
      var u = motif(m.use[i].m), col = m.use[i].layer === 'white' ? pal.white : pal.red;
      s += tag('g', { transform: m.use[i].t }, tag('path', { d: u.sil.join(''), fill: col }));
    }
    s += paths(m.red, pal.red);
    s += paths(m.white, pal.white);
    s += paths(m.top, pal.top);
    s += strokes(m.inc, pal.inc);
    return s;
  }
  /** pottery(name, {style:'black'|'red', frame:'tondo'|'tile'|'none', size:120, label}) -> a standalone SVG string */
  function pottery(name, opts) {
    opts = opts || {};
    if (!MOTIFS[name]) name = 'amphora';
    var red = opts.style === 'red', frame = opts.frame || 'tondo', size = opts.size || 120, m = motif(name);
    var id = uid('p'), gG = id + 'g', gF = id + 'f', gK = id + 'k', gR = id + 'r';
    var pal = red ?
      { ground: 'url(#' + gG + ')', fig: 'url(#' + gF + ')', figStroke: CLAY_LIGHT, outline: '#120b07', red: '#9a4a26', white: ADDWHITE, top: GLAZE, inc: '#1b120c', rim: CLAY, rimInk: '#140d09', groundLine: CLAY } :
      { ground: 'url(#' + gG + ')', fig: 'url(#' + gF + ')', figStroke: GLAZE, outline: null, red: ADDRED, white: ADDWHITE, top: GLAZE, inc: '#d9905c', rim: GLAZE, rimInk: CLAY, groundLine: GLAZE };
    var defs = red ?
      grad(gG, [[0, '#2c1f17'], [0.55, '#1a120d'], [1, '#0e0906']], { radial: true, a: { cx: '42%', cy: '36%', r: '70%' } }) +
        grad(gF, [[0, '#e49a62'], [0.5, '#cf7542'], [1, '#b85e31']], { a: { x1: '0', y1: '0', x2: '0.4', y2: '1' } }) :
      grad(gG, [[0, '#e9a066'], [0.45, '#d47b45'], [0.85, '#bb6234'], [1, '#a5532a']], { radial: true, a: { cx: '44%', cy: '38%', r: '68%' } }) +
        grad(gF, [[0, '#33261d'], [0.35, '#16100c'], [0.65, '#0f0a07'], [1, '#2a1e16']], { a: { x1: '0', y1: '0', x2: '1', y2: '1' } });
    defs += grad(gR, [[0, '#ffffff', 0.32], [0.4, '#ffffff', 0.06], [1, '#ffffff', 0]], { a: { x1: '0', y1: '0', x2: '0.7', y2: '1' } });
    var body = '', clipShape, i;
    if (frame === 'tile') clipShape = tag('rect', { x: 9, y: 9, width: 102, height: 102, rx: 18 });
    else clipShape = tag('circle', { cx: 60, cy: 60, r: 50.6 });
    defs += tag('clipPath', { id: gK }, clipShape);
    var fig = figureSVG(m, pal);
    var extra = '';
    if (m.ground) extra += tag('path', { d: 'M8,' + m.ground + 'L112,' + m.ground, stroke: pal.groundLine, 'stroke-width': 1.4 }) +
      tag('path', { d: 'M8,' + (m.ground + 3) + 'L112,' + (m.ground + 3), stroke: pal.groundLine, 'stroke-width': 0.7 });
    if (m.sea) extra += tag('path', { d: scrollWaveD(m.sea + 8, 4, 118, 6), fill: 'none', stroke: pal.figStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' }) +
      tag('path', { d: wavesD(m.sea, 6, 116, 1.6, 8), fill: 'none', stroke: pal.figStroke, 'stroke-width': 0.8 });
    if (frame === 'none') {
      body = fig;
    } else if (frame === 'tile') {
      body = tag('rect', { x: 4, y: 4, width: 112, height: 112, rx: 22, fill: pal.rim }) + tag('rect', { x: 9, y: 9, width: 102, height: 102, rx: 18, fill: pal.ground }) +
        tag('g', { 'clip-path': 'url(#' + gK + ')' }, extra + fig) + tag('rect', { x: 9, y: 9, width: 102, height: 102, rx: 18, fill: 'none', stroke: pal.rimInk, 'stroke-width': 0.8, opacity: 0.7 }) +
        tag('rect', { x: 4.5, y: 4.5, width: 111, height: 111, rx: 21.5, fill: 'url(#' + gR + ')', opacity: 0.5 });
    } else {
      var tongues = { a: '', b: '' }, N = 44;
      for (i = 0; i < N; i++) {
        var a0 = (i / N) * 2 * Math.PI, hw = Math.PI / N * 0.72, ro = 56.2, ri = 52.2;
        var d = 'M' + pt(60 + ro * Math.cos(a0 - hw), 60 + ro * Math.sin(a0 - hw)) + 'L' + pt(60 + ro * Math.cos(a0 + hw), 60 + ro * Math.sin(a0 + hw)) +
          'Q' + pt(60 + (ri - 1.6) * Math.cos(a0), 60 + (ri - 1.6) * Math.sin(a0)) + ' ' + pt(60 + ro * Math.cos(a0 - hw), 60 + ro * Math.sin(a0 - hw)) + 'Z';
        if (red || i % 2) tongues.a += d; else tongues.b += d;
      }
      var wheel = '';
      for (i = 1; i <= 4; i++) wheel += circD(60, 60, 11 * i + 2);
      body = tag('circle', { cx: 60, cy: 60, r: 59, fill: red ? GLAZE : GLAZE }) +
        tag('circle', { cx: 60, cy: 60, r: 56.6, fill: red ? GLAZE : CLAY }) +
        tag('path', { d: tongues.a, fill: red ? CLAY : GLAZE }) + (tongues.b ? tag('path', { d: tongues.b, fill: ADDRED }) : '') +
        tag('circle', { cx: 60, cy: 60, r: 51.4, fill: 'none', stroke: red ? CLAY : GLAZE, 'stroke-width': 1.1 }) +
        tag('circle', { cx: 60, cy: 60, r: 50.6, fill: pal.ground }) +
        tag('path', { d: wheel, fill: 'none', stroke: red ? '#ffffff' : '#5a2508', 'stroke-width': 0.5, opacity: red ? 0.035 : 0.09 }) +
        tag('g', { 'clip-path': 'url(#' + gK + ')' }, extra + fig) +
        tag('path', { d: 'M18,40A46,46 0 0,1 60,12', fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.12 }) +
        tag('circle', { cx: 60, cy: 60, r: 58.6, fill: 'none', stroke: 'url(#' + gR + ')', 'stroke-width': 1.4 });
    }
    var label = opts.label || ((red ? 'red-figure ' : 'black-figure ') + m.label);
    return '<svg xmlns="' + NS + '" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(label) + '" class="polis-pot polis-pot-' + name + (red ? ' red' : ' black') + '">' +
      '<defs>' + defs + '</defs>' + body + '</svg>';
  }
  P.pottery = pottery;

  /* ------------------------------------------------------------------ 1. meander (Greek key)
   * One unit on a grid of step s (5 wide, 4 high): up, across, down, then in and out of the square spiral, back to the baseline.
   * Every line and every gap is one grid step, the classic proportion. */
  function keyD(n, s, ox) {
    var d = '', k, o;
    for (k = 0; k < n; k++) {
      o = ox + 5 * k * s;
      d += 'V0H' + r2(o + 4 * s) + 'V' + r2(3 * s) + 'H' + r2(o + 2 * s) + 'V' + r2(2 * s) + 'H' + r2(o + 3 * s) + 'V' + r2(s) + 'H' + r2(o + s) + 'V' + r2(4 * s) + 'H' + r2(o + 5 * s);
    }
    return d;
  }
  function meanderRun(n, s) { return 'M0,' + r2(4 * s) + keyD(n, s, 0); }
  P.meanderPath = meanderRun;
  var COLORS = { gold: null, bronze: '#b07a45', ink: '#cfc4b2', terracotta: '#c96a4a', marble: '#e8e0d2', olive: '#9aa565' };
  /** meander(el, {size:18 (band px), color:'gold'|'bronze'|'ink'|'terracotta'|'marble'|'olive'|css, draw:true, live:false, sides:'all'|'band'|'top'|'bottom', inset:4}) */
  function meander(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var st = still(), size = opts.size || 18, s = size / 6, color = opts.color || 'gold', live = !!opts.live && !st, draw = opts.draw !== false && !st, sides = opts.sides || 'all';
    var cs = W.getComputedStyle ? W.getComputedStyle(el) : null;
    if (cs && cs.position === 'static') el.style.position = 'relative';
    el.classList.add('polis-meandered');
    function render(w, h) {
      clearSafe(el, 'polis-meander');
      var svg = svgEl('svg', { 'class': 'polis-meander' + (live ? ' live' : ''), width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', focusable: 'false' });
      var id = uid('m'), stroke, defs = svgEl('defs', {}), i;
      if (color === 'gold') {
        var lg = svgEl('linearGradient', { id: id + 'g', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: w, y2: h * 0.4 });
        for (i = 0; i < 3; i++) GOLD.forEach(function (g) { lg.appendChild(svgEl('stop', { offset: r2((i + g[0]) / 3), 'stop-color': g[1] })); });
        defs.appendChild(lg);
        stroke = 'url(#' + id + 'g)';
      } else stroke = COLORS[color] || color;
      svg.appendChild(defs);
      var p = opts.inset !== undefined ? opts.inset : 4, band = 6 * s, sw = s * 0.62, unit = 5 * s, runs = [], rails = '';
      function line(x0, y0, x1, y1) { rails += 'M' + pt(x0, y0) + 'L' + pt(x1, y1); }
      function run(len, tf) {
        var n = Math.max(1, Math.floor(len / unit)), off = (len - n * unit) / 2, cid = id + 'c' + runs.length;
        var g = svgEl('g', { transform: tf, 'clip-path': 'url(#' + cid + ')' });
        var cp = svgEl('clipPath', { id: cid });
        cp.appendChild(svgEl('rect', { x: r2(-sw / 2), y: r2(-s * 0.6), width: r2(len + sw), height: r2(s * 5.2) }));
        defs.appendChild(cp);
        var inner = svgEl('g', {}), d;
        if (live) {
          inner.setAttribute('class', 'polis-m-tick');
          inner.setAttribute('style', '--polis-unit:' + r2(-unit) + 'px');
          d = 'M' + r2(off - unit) + ',' + r2(4 * s) + keyD(n + 3, s, off - unit);
        } else d = 'M' + r2(-sw) + ',' + r2(4 * s) + 'H' + r2(off) + keyD(n, s, off) + 'H' + r2(len + sw);
        var path = svgEl('path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': r2(sw), 'stroke-linejoin': 'miter', 'class': 'polis-m-path' });
        inner.appendChild(path); g.appendChild(inner); svg.appendChild(g);
        runs.push(path);
      }
      function corner(x, y) {
        svg.appendChild(svgEl('rect', { x: r2(x + s), y: r2(y + s), width: r2(4 * s), height: r2(4 * s), fill: 'none', stroke: stroke, 'stroke-width': r2(sw), 'class': 'polis-m-corner' }));
        svg.appendChild(svgEl('rect', { x: r2(x + 2.3 * s), y: r2(y + 2.3 * s), width: r2(1.4 * s), height: r2(1.4 * s), fill: stroke, 'class': 'polis-m-corner' }));
      }
      if (sides === 'top' || sides === 'bottom' || sides === 'band') {
        var yy = sides === 'bottom' ? h - p - band : p;
        line(p, yy, w - p, yy); line(p, yy + band, w - p, yy + band);
        run(w - 2 * p, 'translate(' + r2(p) + ',' + r2(yy + s) + ')');
      } else {
        var x0 = p + band, x1 = w - p - band, y0 = p + band, y1 = h - p - band;
        line(p, p, w - p, p); line(w - p, p, w - p, h - p); line(w - p, h - p, p, h - p); line(p, h - p, p, p);
        line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x1, y1, x0, y1); line(x0, y1, x0, y0);
        line(x0, p, x0, y0); line(x1, p, x1, y0); line(x0, y1, x0, h - p); line(x1, y1, x1, h - p);
        line(p, y0, x0, y0); line(x1, y0, w - p, y0); line(p, y1, x0, y1); line(x1, y1, w - p, y1);
        run(x1 - x0, 'translate(' + r2(x0) + ',' + r2(p + s) + ')');
        run(x1 - x0, 'translate(' + r2(x1) + ',' + r2(h - p - s) + ') rotate(180)');
        run(y1 - y0, 'translate(' + r2(w - p - s) + ',' + r2(y0) + ') rotate(90)');
        run(y1 - y0, 'translate(' + r2(p + s) + ',' + r2(y1) + ') rotate(-90)');
        corner(p, p); corner(x1, p); corner(p, y1); corner(x1, y1);
      }
      svg.insertBefore(svgEl('path', { d: rails, fill: 'none', stroke: stroke, 'stroke-width': r2(s * 0.34), 'class': 'polis-m-rail' }), defs.nextSibling);
      el.insertBefore(svg, el.firstChild);
      if (draw) {
        runs.forEach(function (pth) {
          var L = 0;
          try { L = pth.getTotalLength(); } catch (e) { L = 0; }
          if (!L) return;
          pth.style.strokeDasharray = r2(L) + ' ' + r2(L);
          pth.style.strokeDashoffset = r2(L);
        });
        svg.getBoundingClientRect();
        svg.classList.add('drawing');
        W.requestAnimationFrame(function () { W.requestAnimationFrame(function () { runs.forEach(function (pth) { pth.style.strokeDashoffset = '0'; }); svg.classList.add('drawn'); }); });
        setTimeout(function () { runs.forEach(function (pth) { pth.style.strokeDasharray = ''; pth.style.strokeDashoffset = ''; }); svg.classList.remove('drawing'); }, 2000);
        draw = false;                                            // draw once; a resize re-renders without the draw
      } else svg.classList.add('drawn');
    }
    if (el._polisMStop) el._polisMStop();
    el._polisMStop = onResize(el, render);
    if (el.clientWidth > 0) render(el.clientWidth, el.clientHeight);
    return { el: el, redraw: function () { draw = !still(); render(el.clientWidth, el.clientHeight); }, stop: function () { if (el._polisMStop) el._polisMStop(); clearSafe(el, 'polis-meander'); } };
  }
  P.meander = meander;
  /** a meander unit as a CSS background (data URI), for bands that only need to repeat: background: OLYMPUS_POLIS.meanderBg('#c8a24a', 18) */
  P.meanderBg = function (col, size) {
    var s = (size || 18) / 6, w = 5 * s, h = 6 * s, d = 'M0,' + r2(5 * s) + 'V' + r2(s) + 'H' + r2(4 * s) + 'V' + r2(4 * s) + 'H' + r2(2 * s) + 'V' + r2(3 * s) + 'H' + r2(3 * s) + 'V' + r2(2 * s) + 'H' + r2(s) + 'V' + r2(5 * s) + 'H' + r2(5 * s);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(w) + '" height="' + r2(h) + '"><path d="' + d + '" fill="none" stroke="' + (col || '#c8a24a') + '" stroke-width="' + r2(s * 0.62) + '"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") repeat-x 0 50% / ' + r2(w) + 'px ' + r2(h) + 'px';
  };

  /* ------------------------------------------------------------------ 2. column frames (Doric / Ionic / Corinthian) */
  var ORDERS = { doric: 1, ionic: 1, corinthian: 1 };
  P.orderFor = function (rank) { return rank === 'record' ? 'corinthian' : (rank === 'good' ? 'ionic' : 'doric'); };
  function marbleGrad(id, horiz) {
    return grad(id, [[0, '#8c8274'], [0.18, '#cfc6b5'], [0.38, '#f6f0e4'], [0.5, '#fffaf0'], [0.68, '#ddd3c1'], [0.88, '#a59b8a'], [1, '#7c7264']], { a: horiz === false ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 } });
  }
  function goldGrad(id, a) { return grad(id, GOLD, { a: a || { x1: 0, y1: 0, x2: 1, y2: 1 } }); }
  function capitalSVG(order, W0) {
    var id = uid('c'), m = 'url(#' + id + 'm)', mv = 'url(#' + id + 'v)', gd = 'url(#' + id + 'g)', ink = '#6f6556', cx = W0 / 2, sh = W0 * 0.62, H, body = '', i;
    var defs = marbleGrad(id + 'm') + marbleGrad(id + 'v', false) + goldGrad(id + 'g');
    if (order === 'doric') {
      H = Math.round(W0 * 0.62);
      body += tag('rect', { x: 0, y: 0, width: W0, height: r2(H * 0.3), fill: m, rx: 0.6 });
      body += tag('path', { d: 'M' + pt(W0 * 0.04, H * 0.3) + 'L' + pt(W0 * 0.96, H * 0.3) + 'C' + pt(W0 * 0.9, H * 0.62) + ' ' + pt(cx + sh * 0.62, H * 0.7) + ' ' + pt(cx + sh / 2, H * 0.74) + 'L' + pt(cx - sh / 2, H * 0.74) + 'C' + pt(cx - sh * 0.62, H * 0.7) + ' ' + pt(W0 * 0.1, H * 0.62) + ' ' + pt(W0 * 0.04, H * 0.3) + 'Z', fill: m });
      for (i = 0; i < 3; i++) body += tag('rect', { x: r2(cx - sh / 2), y: r2(H * (0.76 + i * 0.075)), width: r2(sh), height: r2(H * 0.035), fill: ink, opacity: 0.55 });
      body += tag('rect', { x: r2(cx - sh / 2), y: r2(H * 0.74), width: r2(sh), height: r2(H * 0.26), fill: m, opacity: 0.6 });
      body += tag('path', { d: 'M0,' + r2(H * 0.3) + 'H' + W0, stroke: ink, 'stroke-width': 0.6, opacity: 0.6 });
    } else if (order === 'ionic') {
      H = Math.round(W0 * 0.7);
      var vr = W0 * 0.19, vy = H * 0.46;
      body += tag('rect', { x: r2(W0 * 0.06), y: 0, width: r2(W0 * 0.88), height: r2(H * 0.16), fill: m });
      body += tag('path', { d: 'M' + pt(W0 * 0.1, H * 0.16) + 'L' + pt(W0 * 0.9, H * 0.16) + 'Q' + pt(W0 * 0.94, H * 0.3) + ' ' + pt(W0 - vr * 0.3, vy - vr) + 'L' + pt(vr * 0.3, vy - vr) + 'Q' + pt(W0 * 0.06, H * 0.3) + ' ' + pt(W0 * 0.1, H * 0.16) + 'Z', fill: m });
      body += tag('rect', { x: r2(vr), y: r2(vy - vr), width: r2(W0 - 2 * vr), height: r2(vr * 1.5), fill: m });
      var eggs = '', ne = 4;
      for (i = 0; i < ne; i++) { var ex = vr * 1.3 + (W0 - vr * 2.6) * (i + 0.5) / ne; eggs += ellD(ex, vy - vr * 0.1, (W0 - vr * 2.6) / ne * 0.34, vr * 0.46); }
      body += tag('path', { d: eggs, fill: '#efe7d8', stroke: ink, 'stroke-width': 0.5 });
      [[vr * 1.02, -1], [W0 - vr * 1.02, 1]].forEach(function (v) {
        var sp = '', t, x0 = v[0], k = v[1];
        for (t = 0; t <= 2.6 * Math.PI; t += 0.16) { var rr = vr * 0.92 * (1 - t / (2.9 * Math.PI)), a = -Math.PI / 2 + t; sp += (t ? 'L' : 'M') + pt(x0 + k * rr * Math.cos(a), vy + rr * Math.sin(a)); }
        body += tag('circle', { cx: r2(x0), cy: r2(vy), r: r2(vr), fill: m });
        body += tag('path', { d: sp, fill: 'none', stroke: ink, 'stroke-width': 0.8, 'stroke-linecap': 'round' });
        body += tag('circle', { cx: r2(x0), cy: r2(vy), r: r2(vr * 0.16), fill: ink, opacity: 0.8 });
      });
      body += tag('rect', { x: r2(cx - sh / 2), y: r2(vy + vr * 0.5), width: r2(sh), height: r2(H - vy - vr * 0.5), fill: m });
      body += tag('path', { d: 'M' + pt(cx - sh / 2, H - 1.2) + 'H' + r2(cx + sh / 2), stroke: ink, 'stroke-width': 0.8, opacity: 0.6 });
    } else {
      H = Math.round(W0 * 1.02);
      var top = H * 0.14;
      body += tag('path', { d: 'M' + pt(0, 0) + 'Q' + pt(cx, top * 0.7) + ' ' + pt(W0, 0) + 'L' + pt(W0 * 0.94, top) + 'Q' + pt(cx, top * 0.8) + ' ' + pt(W0 * 0.06, top) + 'Z', fill: m });
      body += tag('path', { d: 'M' + pt(cx - sh / 2, H) + 'C' + pt(cx - sh * 0.56, H * 0.6) + ' ' + pt(W0 * 0.18, H * 0.3) + ' ' + pt(W0 * 0.16, top) + 'L' + pt(W0 * 0.84, top) + 'C' + pt(W0 * 0.82, H * 0.3) + ' ' + pt(cx + sh * 0.56, H * 0.6) + ' ' + pt(cx + sh / 2, H) + 'Z', fill: m });
      function acanthus(y, hh, n, wid, cls) {
        var o = '', l = '', j;
        for (j = 0; j < n; j++) {
          var x = cx + (j - (n - 1) / 2) * wid * 0.82, xl = x - wid / 2, xr = x + wid / 2;
          o += 'M' + pt(xl, y) + 'C' + pt(xl - wid * 0.1, y - hh * 0.5) + ' ' + pt(x - wid * 0.3, y - hh * 0.9) + ' ' + pt(x, y - hh) + 'C' + pt(x + wid * 0.25, y - hh * 0.96) + ' ' + pt(x + wid * 0.55, y - hh * 0.78) + ' ' + pt(x + wid * 0.62, y - hh * 0.62) +
            'C' + pt(x + wid * 0.4, y - hh * 0.66) + ' ' + pt(x + wid * 0.3, y - hh * 0.6) + ' ' + pt(xr - wid * 0.05, y - hh * 0.4) + 'C' + pt(xr, y - hh * 0.2) + ' ' + pt(xr, y - hh * 0.1) + ' ' + pt(xr, y) + 'Z';
          l += 'M' + pt(x, y - hh * 0.92) + 'Q' + pt(x - wid * 0.05, y - hh * 0.4) + ' ' + pt(x, y) + 'M' + pt(x - wid * 0.28, y - hh * 0.5) + 'L' + pt(x - wid * 0.05, y - hh * 0.3) + 'M' + pt(x + wid * 0.28, y - hh * 0.5) + 'L' + pt(x + wid * 0.05, y - hh * 0.3);
        }
        return tag('path', { d: o, fill: cls, stroke: '#7d6a45', 'stroke-width': 0.45 }) + tag('path', { d: l, fill: 'none', stroke: '#6d5a36', 'stroke-width': 0.5, opacity: 0.8 });
      }
      body += acanthus(H * 0.74, H * 0.4, 3, W0 * 0.26, gd);
      body += acanthus(H, H * 0.38, 4, W0 * 0.2, m);
      [[W0 * 0.12, -1], [W0 * 0.88, 1]].forEach(function (v) {
        var sp = '', t;
        for (t = 0; t <= 2 * Math.PI; t += 0.22) { var rr = W0 * 0.09 * (1 - t / (2.4 * Math.PI)); sp += (t ? 'L' : 'M') + pt(v[0] + v[1] * rr * Math.cos(t), top + W0 * 0.07 + rr * Math.sin(t)); }
        body += tag('path', { d: sp, fill: 'none', stroke: gd, 'stroke-width': 1.3, 'stroke-linecap': 'round' });
      });
      body += tag('circle', { cx: r2(cx), cy: r2(top * 0.66), r: r2(W0 * 0.06), fill: gd });
    }
    return { h: H, svg: '<svg xmlns="' + NS + '" viewBox="0 0 ' + W0 + ' ' + H + '" width="' + W0 + '" height="' + H + '" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + body + '</svg>' };
  }
  function baseSVG(order, W0) {
    var id = uid('b'), m = 'url(#' + id + 'm)', H = order === 'doric' ? 0 : Math.round(W0 * 0.34), cx = W0 / 2, sh = W0 * 0.66, body = '';
    if (!H) return { h: 0, svg: '' };
    body += tag('rect', { x: r2(cx - sh / 2 - 0.5), y: 0, width: r2(sh + 1), height: r2(H * 0.2), fill: m });
    body += tag('rect', { x: r2(cx - sh * 0.6), y: r2(H * 0.2), width: r2(sh * 1.2), height: r2(H * 0.3), rx: r2(H * 0.15), fill: m });
    body += tag('rect', { x: r2(cx - sh * 0.56), y: r2(H * 0.5), width: r2(sh * 1.12), height: r2(H * 0.12), fill: '#7b7163', opacity: 0.6 });
    body += tag('rect', { x: r2(cx - sh * 0.68), y: r2(H * 0.6), width: r2(sh * 1.36), height: r2(H * 0.4), rx: r2(H * 0.18), fill: m });
    return { h: H, svg: '<svg xmlns="' + NS + '" viewBox="0 0 ' + W0 + ' ' + H + '" width="' + W0 + '" height="' + H + '" aria-hidden="true" focusable="false"><defs>' + marbleGrad(id + 'm') + '</defs>' + body + '</svg>' };
  }
  function entabSVG(order, w, colW) {
    var id = uid('e'), m = 'url(#' + id + 'm)', mv = 'url(#' + id + 'v)', gd = 'url(#' + id + 'g)', ink = '#6f6556', H = order === 'doric' ? 30 : (order === 'ionic' ? 28 : 32), body = '', i, n;
    var defs = marbleGrad(id + 'm', false) + grad(id + 'v', [[0, '#f8f2e6'], [1, '#c9bfae']], { a: { x1: 0, y1: 0, x2: 0, y2: 1 } }) + goldGrad(id + 'g', { x1: 0, y1: 0, x2: 1, y2: 0.2 });
    body += tag('rect', { x: 0, y: 0, width: w, height: 6, fill: mv });
    body += tag('rect', { x: 0, y: 5.4, width: w, height: 1.2, fill: ink, opacity: 0.45 });
    if (order === 'doric') {
      body += tag('rect', { x: 1, y: 6.6, width: w - 2, height: 12.4, fill: mv });
      n = Math.max(3, Math.round((w - colW) / 46));
      var span = (w - colW) / n, tw = 9.6, gl = '';
      for (i = 0; i <= n; i++) {
        var tx = colW / 2 + i * span - tw / 2;
        body += tag('rect', { x: r2(tx), y: 6.6, width: tw, height: 12.4, fill: '#d8cfbd' });
        gl += 'M' + pt(tx + 3.2, 7.4) + 'V18.2M' + pt(tx + 6.4, 7.4) + 'V18.2';
        if (i < n) body += tag('rect', { x: r2(tx + tw + 3), y: 8.4, width: r2(span - tw - 6), height: 8.8, rx: 1.2, fill: '#fbf6ec', opacity: 0.5 });
      }
      body += tag('path', { d: gl, stroke: ink, 'stroke-width': 1.3, opacity: 0.75 });
      body += tag('rect', { x: 2, y: 19, width: w - 4, height: 9, fill: m });
      body += tag('path', { d: 'M2,23.4H' + (w - 2), stroke: ink, 'stroke-width': 0.6, opacity: 0.5 });
    } else if (order === 'ionic') {
      var den = '';
      for (i = 2; i < w - 4; i += 5.6) den += 'M' + pt(i, 7) + 'h3.2v4.6h-3.2Z';
      body += tag('rect', { x: 0, y: 6.6, width: w, height: 5.4, fill: '#ece4d4' });
      body += tag('path', { d: den, fill: '#bdb2a0' });
      body += tag('rect', { x: 2, y: 12, width: w - 4, height: 6, fill: mv });
      body += tag('rect', { x: 3, y: 18, width: w - 6, height: 5, fill: '#e6ddcc' });
      body += tag('rect', { x: 4, y: 23, width: w - 8, height: 5, fill: m });
      body += tag('path', { d: 'M3,18H' + (w - 3) + 'M4,23H' + (w - 4), stroke: ink, 'stroke-width': 0.6, opacity: 0.55 });
    } else {
      var eg = '', dt = '';
      for (i = 3; i < w - 5; i += 7) { eg += ellD(i + 2.4, 10.4, 2.2, 2.8); dt += 'M' + pt(i + 5.9, 8) + 'l0,5.4'; }
      body += tag('rect', { x: 0, y: 6.6, width: w, height: 8, fill: '#3a2f22' });
      body += tag('path', { d: eg, fill: gd });
      body += tag('path', { d: dt, stroke: gd, 'stroke-width': 1 });
      var den2 = '';
      for (i = 2; i < w - 4; i += 5) den2 += 'M' + pt(i, 15) + 'h3v4h-3Z';
      body += tag('rect', { x: 1, y: 14.6, width: w - 2, height: 5, fill: '#ece4d4' });
      body += tag('path', { d: den2, fill: '#b5aa97' });
      body += tag('rect', { x: 2, y: 19.6, width: w - 4, height: 6, fill: mv });
      body += tag('rect', { x: 3, y: 25.6, width: w - 6, height: 6.4, fill: m });
      body += tag('path', { d: 'M3,25.6H' + (w - 3), stroke: gd, 'stroke-width': 1 });
    }
    return { h: H, svg: '<svg xmlns="' + NS + '" viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + body + '</svg>' };
  }
  function stepsSVG(w) {
    var id = uid('s'), m = 'url(#' + id + 'm)', H = 13, body = '';
    body += tag('rect', { x: 2, y: 0, width: w - 4, height: 4.6, fill: m });
    body += tag('rect', { x: 0, y: 4.6, width: w, height: 4.4, fill: m, opacity: 0.92 });
    body += tag('rect', { x: 0, y: 9, width: w, height: 4, fill: m, opacity: 0.82 });
    body += tag('path', { d: 'M2,4.6H' + (w - 2) + 'M0,9H' + w, stroke: '#5f5547', 'stroke-width': 0.7, opacity: 0.7 });
    return { h: H, svg: '<svg xmlns="' + NS + '" viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' + grad(id + 'm', [[0, '#f4eee2'], [1, '#bcb2a1']], { a: { x1: 0, y1: 0, x2: 0, y2: 1 } }) + '</defs>' + body + '</svg>' };
  }
  function columnFrame(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var order = ORDERS[opts.order] ? opts.order : P.orderFor(opts.rank);
    marbleVars();
    el.classList.add('polis-colframe');
    el.classList.remove('polis-order-doric', 'polis-order-ionic', 'polis-order-corinthian');
    el.classList.add('polis-order-' + order);
    el.setAttribute('data-polis-order', order);
    function render(w) {
      clearSafe(el, 'polis-cf');
      var colW = w < 420 ? 22 : (w < 700 ? 26 : 30);
      el.style.setProperty('--polis-col', colW + 'px');
      var cap = capitalSVG(order, colW), base = baseSVG(order, colW), ent = entabSVG(order, w, colW), stp = stepsSVG(w);
      el.style.setProperty('--polis-ent', ent.h + 'px');
      el.style.setProperty('--polis-steps', stp.h + 'px');
      var wrap = D.createElement('div');
      wrap.className = 'polis-cf';
      wrap.setAttribute('aria-hidden', 'true');
      var html = '<div class="polis-cf-ent">' + ent.svg + '</div>';
      ['l', 'r'].forEach(function (side) {
        html += '<div class="polis-cf-col ' + side + '"><div class="polis-cf-cap">' + cap.svg + '</div><div class="polis-cf-shaft"></div><div class="polis-cf-base">' + base.svg + '</div></div>';
      });
      html += '<div class="polis-cf-steps">' + stp.svg + '</div>';
      wrap.innerHTML = html;                         // our own generated SVG only, no data
      el.insertBefore(wrap, el.firstChild);
    }
    if (el._polisCfStop) el._polisCfStop();
    el._polisCfStop = onResize(el, function (w) { render(w); });
    if (el.clientWidth > 0) render(el.clientWidth);
    return { el: el, order: order, set: function (o) { return columnFrame(el, o); } };
  }
  P.columnFrame = columnFrame;

  /* ------------------------------------------------------------------ 3. carved inscriptions */
  function wrapNumbers(node) {
    var kids = [], i;
    for (i = 0; i < node.childNodes.length; i++) kids.push(node.childNodes[i]);
    kids.forEach(function (k) {
      if (k.nodeType === 3) {
        var txt = k.nodeValue, re = /\d[\d,]*(\.\d+)?/g, m, last = 0, frag = D.createDocumentFragment(), any = false;
        while ((m = re.exec(txt))) {
          var val = Number(m[0].replace(/,/g, '')), g = greekNumeral(val);
          if (!g) continue;
          any = true;
          frag.appendChild(D.createTextNode(txt.slice(last, m.index)));
          var sp = D.createElement('span'), a = D.createElement('span'), b = D.createElement('span');
          sp.className = 'polis-num'; sp.setAttribute('tabindex', '0'); sp.setAttribute('role', 'button');
          sp.setAttribute('aria-label', m[0] + ', in Greek numerals ' + g);
          a.className = 'pn-a'; a.textContent = m[0];
          b.className = 'pn-g'; b.textContent = g; b.setAttribute('aria-hidden', 'true');
          sp.appendChild(a); sp.appendChild(b);
          frag.appendChild(sp);
          last = m.index + m[0].length;
        }
        if (any) { frag.appendChild(D.createTextNode(txt.slice(last))); node.replaceChild(frag, k); }
      } else if (k.nodeType === 1 && !k.classList.contains('polis-num')) wrapNumbers(k);
    });
  }
  function inscribe(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    marbleVars();
    el.classList.add('polis-inscribed');
    if (opts.gild) el.classList.add('polis-gilt');
    if (opts.plaque) {
      el.classList.add('polis-plaque');
      if (!el.querySelector('.polis-cut')) {                // the cut letters live in their own box so their light lip draws over the marble
        var cut = D.createElement('span');
        cut.className = 'polis-cut';
        while (el.firstChild) cut.appendChild(el.firstChild);
        el.appendChild(cut);
      }
    }
    if (opts.numerals !== false && !el.getAttribute('data-polis-num')) {
      el.setAttribute('data-polis-num', '1');
      wrapNumbers(el);
      var nums = el.querySelectorAll('.polis-num'), i;
      for (i = 0; i < nums.length; i++) {
        (function (n) {
          function tog(e) { if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; if (e && e.preventDefault && e.type === 'keydown') e.preventDefault(); n.classList.toggle('on'); }
          n.addEventListener('click', tog); n.addEventListener('keydown', tog);
        })(nums[i]);
      }
    }
    return { el: el };
  }
  P.inscribe = inscribe;

  /* ------------------------------------------------------------------ 5. mosaics (canvas, drawn once per size) */
  function mosaic(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var lite = isLite(), pattern = opts.pattern || 'waves', dense = !!opts.dense;
    var cs = W.getComputedStyle ? W.getComputedStyle(el) : null;
    if (cs && cs.position === 'static') el.style.position = 'relative';
    el.classList.add('polis-mosaicked');
    var cv = null;
    function draw(w, h) {
      clearSafe(el, 'polis-mosaic');
      cv = D.createElement('canvas');
      cv.className = 'polis-mosaic' + (dense ? ' dense' : '');
      cv.setAttribute('aria-hidden', 'true');
      var dpr = Math.min(lite ? 1 : 2, W.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      el.insertBefore(cv, el.firstChild);
      var g = cv.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintMosaic(g, w, h, pattern, dense, opts, lite, dpr);
    }
    if (el._polisMosStop) el._polisMosStop();
    el._polisMosStop = onResize(el, draw);
    if (el.clientWidth > 0) draw(el.clientWidth, el.clientHeight);
    return { el: el, canvas: function () { return cv; }, stop: function () { if (el._polisMosStop) el._polisMosStop(); clearSafe(el, 'polis-mosaic'); } };
  }
  /* palettes: quiet = a backdrop for text (low contrast, warm dark stones); dense = richer, for under a hero */
  var MOS = {
    quiet: { field: ['#211b15', '#241d16', '#1e1914', '#272018'], gold: ['#5e4b2c', '#6a5532'], terra: ['#5a3022', '#643628'], sea: ['#1e2c33', '#22333b', '#1b282f'], ivory: ['#4a4237', '#544a3d'], black: ['#16120e'], dol: ['#857a68', '#7a705f', '#8f846f'] },
    dense: { field: ['#2c241b', '#30271d', '#28211a', '#342a1f'], gold: ['#a8843f', '#c29a4c', '#8f6e33'], terra: ['#9a4b32', '#ad573b', '#87412c'], sea: ['#2f5468', '#376179', '#284a5c'], ivory: ['#d8ccb6', '#cbbfa8', '#e2d7c2'], black: ['#18130f'], dol: ['#e2d7c2', '#d6c9b0', '#ece2cf'] }
  };
  function paintMosaic(g, w, h, pattern, dense, opts, lite, dprNow) {
    var pal = dense ? MOS.dense : MOS.quiet, T = opts.tile || (lite ? (dense ? 8 : 10) : (dense ? 6 : 8)), rnd = prng(hash(pattern + w + 'x' + h));
    if (pattern === 'meander' && !opts.tile) T = Math.max(3, Math.min(T, Math.min(w, h) / 34));
    if (pattern === 'dolphins' && !opts.tile) T = Math.min(T, lite ? 7 : 5);
    g.fillStyle = dense ? '#120e0b' : '#100d0a';
    g.fillRect(0, 0, w, h);
    var dol = null, dolT = [];
    if (pattern === 'dolphins' && W.Path2D) {
      var m = motif('dolphin');
      dol = new W.Path2D(m.sil.join(''));
      var sc = dense ? 1.2 : 1.05, row = 0, y, x;
      for (y = 40; y < h + 40; y += 88 * sc) {
        for (x = (row % 2) * 70 - 20; x < w + 40; x += 150 * sc) dolT.push([x, y, sc, row % 2 ? -1 : 1]);
        row++;
      }
    }
    function cls(x, y) {                       // which stone goes at (x, y)
      var band = Math.min(T * 5, h * 0.1);
      if (pattern === 'meander' || opts.border) {
        var ex = Math.min(x, w - x), ey = Math.min(y, h - y), ei = Math.floor(Math.min(ex, ey) / T);
        if (ei <= 12) {
          if (ei === 0 || ei === 12) return 'black';
          if (ei === 1 || ei === 11) return 'gold';
          var along = ex < ey ? y : x, ai = ((Math.floor(along / T) % 10) + 10) % 10;
          return isKey(ai, ei - 2) ? 'gold' : 'black';
        }
        if (pattern === 'meander') return 'field';
      }
      if (pattern === 'waves') {
        var yb = y % (h * 0.5 + 1), lam = T * 16;
        if (y > h - band * 2.4) {
          var yy = h - y, ph = (x % lam) / lam, crest = band * (0.9 + 0.8 * Math.sin(ph * 2 * Math.PI));
          var cx = (Math.floor(x / lam) + 0.75) * lam, cy = h - band * 1.55, dd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          if (dd < band * 0.6 && dd > band * 0.32) return 'ivory';
          if (yy < crest) return 'sea';
          if (yy < crest + T * 1.1) return 'ivory';
        }
        if (y < band * 1.6) { var ph2 = ((x + lam / 2) % lam) / lam; if (y < band * (0.55 + 0.5 * Math.sin(ph2 * 2 * Math.PI))) return 'sea'; if (y < band * (0.55 + 0.5 * Math.sin(ph2 * 2 * Math.PI)) + T) return 'ivory'; }
        return 'field';
      }
      if (pattern === 'rosettes') {
        var R = dense ? 64 : 84, ix = Math.floor(x / R), iy = Math.floor(y / R), lx = x - (ix + 0.5) * R, ly = y - (iy + 0.5) * R;
        var rr = Math.sqrt(lx * lx + ly * ly), th = Math.atan2(ly, lx), pet = R * 0.36 * (0.62 + 0.38 * Math.cos(8 * th));
        if (Math.abs(lx) > R * 0.47 || Math.abs(ly) > R * 0.47) return (Math.abs(lx) > R * 0.485 && Math.abs(ly) > R * 0.485) ? 'gold' : 'black';
        if (rr < R * 0.07) return 'gold';
        if (rr < pet && rr > R * 0.11) return ((ix + iy) % 2) ? 'terra' : 'gold';
        if (rr < R * 0.43 && rr > R * 0.4) return 'ivory';
        return 'field';
      }
      if (pattern === 'dolphins') {
        var i;
        if (dol) for (i = 0; i < dolT.length; i++) {
          var t = dolT[i];
          g.setTransform(1, 0, 0, 1, 0, 0);
          var lxx = (x - t[0]) / t[2] * t[3] + (t[3] < 0 ? 120 : 0), lyy = (y - t[1]) / t[2];
          if (lxx > 10 && lxx < 110 && lyy > 25 && lyy < 95 && g.isPointInPath(dol, lxx, lyy)) return 'dol';
        }
        if (y > h - band * 1.6) return ((x / T + Math.floor(y / T)) % 6 < 3) ? 'sea' : 'black';
        return 'sea';
      }
      return 'field';
    }
    var KEYSEG = [[0, 8, 0, 0], [0, 0, 8, 0], [8, 0, 8, 6], [8, 6, 4, 6], [4, 6, 4, 4], [4, 4, 6, 4], [6, 4, 6, 2], [6, 2, 2, 2], [2, 2, 2, 8], [2, 8, 10, 8]];
    function isKey(gx, gy) {               // the meander unit on a 10 x 9 grid of stones: line, gap, line ... (same key as meander())
      var i, q;
      for (i = 0; i < KEYSEG.length; i++) {
        q = KEYSEG[i];
        if (q[0] === q[2] && gx === q[0] && gy >= Math.min(q[1], q[3]) && gy <= Math.max(q[1], q[3])) return true;
        if (q[1] === q[3] && gy === q[1] && gx >= Math.min(q[0], q[2]) && gx <= Math.max(q[0], q[2])) return true;
      }
      return false;
    }
    var x, y, half = T / 2, jit = T * 0.12, gap = Math.max(0.8, T * 0.12);
    for (y = 0; y < h + T; y += T) {
      for (x = (Math.floor(y / T) % 2) * half * 0.3; x < w + T; x += T) {
        var k = cls(x + half, y + half), list = pal[k] || pal.field, c = list[Math.floor(rnd() * list.length)];
        if (pattern === 'dolphins') g.setTransform(dprNow, 0, 0, dprNow, 0, 0);
        var a = (rnd() - 0.5) * 0.12, cx0 = x + half + (rnd() - 0.5) * jit, cy0 = y + half + (rnd() - 0.5) * jit, s2 = half - gap / 2;
        g.save();
        g.translate(cx0, cy0); g.rotate(a);
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(-s2 + (rnd() - 0.5) * jit, -s2 + (rnd() - 0.5) * jit); g.lineTo(s2 + (rnd() - 0.5) * jit, -s2 + (rnd() - 0.5) * jit);
        g.lineTo(s2 + (rnd() - 0.5) * jit, s2 + (rnd() - 0.5) * jit); g.lineTo(-s2 + (rnd() - 0.5) * jit, s2 + (rnd() - 0.5) * jit);
        g.closePath(); g.fill();
        if (!lite) { g.fillStyle = 'rgba(255,240,215,' + (dense ? 0.08 : 0.035) + ')'; g.fillRect(-s2, -s2, s2 * 2, Math.max(0.8, T * 0.14)); }
        g.restore();
      }
    }
    if (pattern === 'dolphins') g.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    var vg = g.createRadialGradient(w / 2, h * 0.35, Math.min(w, h) * 0.1, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(255,214,150,' + (dense ? 0.1 : 0.05) + ')'); vg.addColorStop(1, 'rgba(10,8,6,' + (dense ? 0.35 : 0.5) + ')');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }
  P.mosaic = mosaic;

  /* ------------------------------------------------------------------ 6. owl tetradrachm coins */
  function fmtUsd(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    var a = Math.abs(Math.round(v)), s = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v > 0 ? '+' : (v < 0 ? '−' : '')) + '$' + s;
  }
  P.fmtUsd = fmtUsd;
  function coinSVG(seed, id) {
    var rnd = prng(seed), n = 40, d = '', i, owl = motif('owl');
    for (i = 0; i < n; i++) {
      var a = i / n * 2 * Math.PI, rr = 46 + (rnd() - 0.5) * 2.4 + Math.sin(a * 3 + seed % 7) * 1.1;
      d += (i ? 'L' : 'M') + pt(50 + rr * Math.cos(a), 50 + rr * Math.sin(a));
    }
    d += 'Z';
    var silver = grad(id + 's', [[0, '#ffffff'], [0.22, '#ecece6'], [0.55, '#bfc0b8'], [0.82, '#8d8f88'], [1, '#61635e']], { radial: true, a: { cx: '36%', cy: '30%', r: '78%' } });
    var relief = grad(id + 'r', [[0, '#fbfbf7'], [0.5, '#c9cac2'], [1, '#7f817a']], { a: { x1: 0, y1: 0, x2: 0.8, y2: 1 } });
    var bevel = grad(id + 'v', [[0, '#3c3d39'], [0.5, '#9a9b94'], [1, '#ffffff']], { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
    var shine = grad(id + 'h', [[0, '#ffffff', 0], [0.45, '#ffffff', 0], [0.5, '#ffffff', 0.75], [0.55, '#ffffff', 0], [1, '#ffffff', 0]], { a: { x1: 0, y1: 0, x2: 1, y2: 0.35 } });
    var emb = '<filter id="' + id + 'e" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="0.9" result="b"/>' +
      '<feSpecularLighting in="b" surfaceScale="2.4" specularConstant="0.95" specularExponent="18" lighting-color="#ffffff" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>' +
      '<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>' +
      '<feDiffuseLighting in="b" surfaceScale="2.4" diffuseConstant="1.05" lighting-color="#ffffff" result="df"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>' +
      '<feComposite in="df" in2="SourceAlpha" operator="in" result="d2"/>' +
      '<feBlend in="SourceGraphic" in2="d2" mode="multiply" result="m"/>' +
      '<feComposite in="m" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.6" k4="0"/></filter>';
    var defs = silver + relief + bevel + shine + emb + '<filter id="' + id + 'pb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>' + tag('clipPath', { id: id + 'k' }, tag('path', { d: d }));
    var owlSil = owl.sil.slice(0, 3).join('');
    var sprig = leafD(22, 30, 9, 2.6, -60, 0.04) + leafD(22, 30, 8, 2.4, -128, -0.04) + leafD(22, 30, 7, 2.2, -94, 0) + circD(27.4, 33.2, 1.8);
    var moon = 'M30,20a6,6 0 1,0 6,9a5,5 0 1,1 -6,-9Z';
    var inc = owl.inc.slice(0, 6).map(function (x) { return x.d; }).join('');
    var body = tag('path', { d: d, fill: 'url(#' + id + 's)', filter: 'url(#' + id + 'e)' }) +
      tag('rect', { x: 15, y: 15, width: 70, height: 70, rx: 9, transform: 'rotate(-5 50 50)', fill: '#000', opacity: 0.16 }) +
      tag('rect', { x: 15, y: 15, width: 70, height: 70, rx: 9, transform: 'rotate(-5 50 50)', fill: 'none', stroke: 'url(#' + id + 'v)', 'stroke-width': 1.6 }) +
      tag('g', { transform: 'translate(13.4,17.4) scale(0.6)', filter: 'url(#' + id + 'e)' },
        tag('path', { d: owlSil, fill: 'url(#' + id + 'r)' }) + tag('path', { d: owl.white.join(''), fill: '#e9e9e3' })) +
      tag('g', { transform: 'translate(13.4,17.4) scale(0.6)', opacity: 0.55 }, tag('path', { d: inc, fill: 'none', stroke: '#4d4f4a', 'stroke-width': 1.1, 'stroke-linecap': 'round' }) + tag('path', { d: owl.top.join(''), fill: '#3a3c38' })) +
      tag('g', { filter: 'url(#' + id + 'e)' }, tag('path', { d: sprig + moon, fill: 'url(#' + id + 'r)' }) +
        tag('text', { x: 75, y: 57, 'text-anchor': 'middle', 'font-family': "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif", 'font-size': 12, 'font-weight': 700, fill: 'url(#' + id + 'r)', 'letter-spacing': 0.3 }, 'ΑΘΕ')) +
      tag('path', { d: d, fill: 'none', stroke: '#2f302c', 'stroke-width': 1, opacity: 0.55 }) +
      tag('g', { 'class': 'polis-coin-bronze', style: 'mix-blend-mode:multiply' }, tag('path', { d: d, fill: '#c0814a' }) + tag('path', { d: d, fill: '#5a3418', opacity: 0.22 }) +
        tag('path', { d: circD(26, 72, 8) + circD(76, 28, 6) + circD(64, 80, 5) + circD(82, 64, 3.5), fill: '#7d9a78', opacity: 0.5, filter: 'url(#' + id + 'pb)' })) +
      tag('g', { 'clip-path': 'url(#' + id + 'k)' },
        tag('rect', { 'class': 'polis-coin-shine', x: -120, y: -20, width: 120, height: 140, fill: 'url(#' + id + 'h)' }));
    return '<svg xmlns="' + NS + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + body + '</svg>';
  }
  function coin(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var st = still(), root = el.querySelector(':scope > .polis-coin');
    if (!root) {
      root = D.createElement('span');
      root.className = 'polis-coin';
      var face = D.createElement('span'); face.className = 'polis-coin-face';
      face.innerHTML = coinSVG(hash(opts.seed || el.id || 'owl'), uid('k'));        // generated SVG only, no data
      var val = D.createElement('span'); val.className = 'polis-coin-val';
      root.appendChild(face); root.appendChild(val);
      el.appendChild(root);
    }
    if (opts.size) root.style.setProperty('--polis-coin', opts.size + 'px');
    function set(o) {
      o = o || {};
      var v = o.value !== undefined ? Number(o.value) : null, state = o.state || (v === null ? 'flat' : (v > 0 ? 'win' : (v < 0 ? 'loss' : 'flat')));
      var prev = root.getAttribute('data-state');
      root.setAttribute('data-state', state);
      var vt = root.querySelector('.polis-coin-val');
      vt.textContent = o.label !== undefined ? o.label : fmtUsd(v);
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', (state === 'win' ? 'Win, silver owl coin ' : (state === 'loss' ? 'Loss, bronze owl coin ' : 'Owl coin ')) + (vt.textContent || ''));
      if (state === 'win' && !st && o.animate !== false) {
        root.classList.remove('flip'); root.getBoundingClientRect(); root.classList.add('flip');
        setTimeout(function () { root.classList.remove('flip'); }, 1600);
      }
      return { state: state, prev: prev };
    }
    set(opts);
    return { el: root, set: set };
  }
  P.coin = coin;

  /* ------------------------------------------------------------------ 8. the sundial (equatorial face, real sun over New York) */
  var NY = { lat: 40.7128, lon: -74.006 };
  var SESSIONS = [{ id: 'asia', name: 'Asia', a: 18 * 60, b: 24 * 60, col: '#4b7a99' }, { id: 'london', name: 'London', a: 2 * 60, b: 5 * 60, col: '#9aa565' },
    { id: 'rth', name: 'New York (RTH)', a: 9 * 60 + 30, b: 16 * 60, col: 'gold' }];
  P.sessions = SESSIONS;
  function sessionNow(p) {
    var m = p.h * 60 + p.mi, wd = p.wd;
    if (wd === 6 || (wd === 5 && m >= 17 * 60) || (wd === 0 && m < 18 * 60)) return { id: 'closed', text: 'Market closed for the weekend' };
    if (m >= 17 * 60 && m < 18 * 60) return { id: 'break', text: 'Daily break (17:00 to 18:00)' };
    if (m >= 18 * 60) return { id: 'asia', text: 'Asia session' };
    if (m < 2 * 60) return { id: 'overnight', text: 'Overnight' };
    if (m < 5 * 60) return { id: 'london', text: 'London session' };
    if (m < 9 * 60 + 30) return { id: 'pre', text: 'Before the New York open' };
    if (m < 16 * 60) return { id: 'rth', text: 'New York session (RTH)' };
    return { id: 'post', text: 'After the close' };
  }
  P.sessionNow = sessionNow;
  function sundial(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var tz = opts.tz || 'America/New_York', st = still(), loc = opts.place || NY, timer = null, R = 100, C = 110, id = uid('d');
    marbleVars();
    clearSafe(el, 'polis-sundial');
    var root = D.createElement('div');
    root.className = 'polis-sundial';
    var holder = D.createElement('div'); holder.className = 'polis-sd-face';
    var cap = D.createElement('div'); cap.className = 'polis-sd-cap';
    var tline = D.createElement('div'); tline.className = 'polis-sd-time';
    var sline = D.createElement('div'); sline.className = 'polis-sd-sess';
    cap.appendChild(tline); cap.appendChild(sline);
    root.appendChild(holder); root.appendChild(cap);
    el.appendChild(root);
    function ang(ms) { return sunAt(ms, loc.lat, loc.lon).ha; }
    function xy(a, rr) { return [C + rr * Math.sin(a * RAD), C - rr * Math.cos(a * RAD)]; }
    function arc(a0, a1, rr) {
      while (a1 <= a0) a1 += 360;
      var p0 = xy(a0, rr), p1 = xy(a1, rr), large = (a1 - a0) > 180 ? 1 : 0;
      return 'M' + pt(p0[0], p0[1]) + 'A' + rr + ',' + rr + ' 0 ' + large + ',1 ' + pt(p1[0], p1[1]);
    }
    function sector(a0, a1, r0, r1) {
      while (a1 <= a0) a1 += 360;
      var p0 = xy(a0, r1), p1 = xy(a1, r1), q1 = xy(a1, r0), q0 = xy(a0, r0), large = (a1 - a0) > 180 ? 1 : 0;
      return 'M' + pt(p0[0], p0[1]) + 'A' + r1 + ',' + r1 + ' 0 ' + large + ',1 ' + pt(p1[0], p1[1]) + 'L' + pt(q1[0], q1[1]) + 'A' + r0 + ',' + r0 + ' 0 ' + large + ',0 ' + pt(q0[0], q0[1]) + 'Z';
    }
    var face = null, dayKey = '';
    function build(now) {
      var p = tzParts(now, tz), mid = Date.UTC(p.y, p.mo - 1, p.d) - p.off * 6e4;     // this ET day's midnight, as UTC ms
      function atClock(min) { return mid + min * 6e4; }
      var rs = sunRiseSet(atClock(12 * 60), loc.lat, loc.lon);
      var s = '', i, defs = '';
      defs += grad(id + 'f', [[0, '#f7f1e6'], [0.7, '#e4dccd'], [1, '#c7bdab']], { radial: true, a: { cx: '42%', cy: '36%', r: '72%' } });
      defs += grad(id + 'b', BRONZE, { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
      defs += goldGrad(id + 'g');
      defs += grad(id + 'n', [[0, '#25324a', 0.62], [1, '#121a29', 0.8]], { radial: true, a: { cx: '50%', cy: '50%', r: '50%' } });
      defs += grad(id + 'sh', [[0, '#2a2016', 0.2], [0.25, '#2a2016', 0.55], [1, '#2a2016', 0.85]], { a: { x1: 0, y1: 0, x2: 0, y2: 1 } });
      defs += '<filter id="' + id + 'bl" x="-80%" y="-10%" width="260%" height="120%"><feGaussianBlur stdDeviation="1.3"/></filter>';
      defs += tag('clipPath', { id: id + 'c' }, tag('circle', { cx: C, cy: C, r: R - 6 }));
      var mUrl = MARBLE.light || marble('light');
      if (mUrl) defs += '<pattern id="' + id + 'p" patternUnits="userSpaceOnUse" width="160" height="160"><image href="' + mUrl + '" width="160" height="160" opacity="0.9"/></pattern>';
      s += tag('circle', { cx: C, cy: C, r: R + 8, fill: 'url(#' + id + 'b)' });
      s += tag('circle', { cx: C, cy: C, r: R + 7.2, fill: 'none', stroke: '#f1d9a8', 'stroke-width': 0.8, opacity: 0.4 });
      s += tag('circle', { cx: C, cy: C, r: R, fill: mUrl ? 'url(#' + id + 'p)' : 'url(#' + id + 'f)' });
      s += tag('circle', { cx: C, cy: C, r: R, fill: 'url(#' + id + 'f)', opacity: mUrl ? 0.55 : 1 });
      var day = null;
      function inArc(x, a0, a1) { var span = ((a1 - a0) % 360 + 360) % 360, d = ((x - a0) % 360 + 360) % 360; return d > 0 && d < span; }
      if (rs) {
        var ar = ang(rs.rise), as = ang(rs.set);
        day = { rise: rs.rise, set: rs.set, ar: ar, as: as };
        s += tag('path', { d: sector(as, ar, 0.1, R - 6), fill: 'url(#' + id + 'n)' });
        var stars = '', rr2 = prng(p.y * 400 + p.mo * 31 + p.d), k;
        for (k = 0; k < 26; k++) {
          var sa = as + rr2() * ((ar - as + 360) % 360), sr = 22 + rr2() * 64, q = xy(sa, sr);
          stars += circD(q[0], q[1], 0.35 + rr2() * 0.6);
        }
        s += tag('path', { d: stars, fill: '#efe6cf', opacity: 0.7 });
      }
      SESSIONS.forEach(function (se) {
        var a0 = ang(atClock(se.a)), a1 = ang(atClock(se.b));
        s += tag('path', { d: sector(a0, a1, R - 6, R - 1.5), fill: se.col === 'gold' ? 'url(#' + id + 'g)' : se.col, opacity: 0.92, 'class': 'polis-sd-arc polis-sd-' + se.id });
      });
      var ticks = '', lab = '', hl = '';
      for (i = 0; i < 96; i++) {
        var mn = i * 15, a = ang(atClock(mn)), hour = mn % 60 === 0, q0 = xy(a, R - 6), q1 = xy(a, hour ? R - (mn % 180 === 0 ? 15 : 11) : R - 8.5);
        ticks += 'M' + pt(q0[0], q0[1]) + 'L' + pt(q1[0], q1[1]);
        if (hour && (mn / 60) % 3 === 0) {
          var hh = mn / 60, lp = xy(a, R - 24);
          lab += tag('text', { x: r2(lp[0]), y: r2(lp[1] + 4.2), 'text-anchor': 'middle', 'class': 'polis-sd-num' + (day && inArc(a, day.as, day.ar) ? ' night' : '') }, String(hh === 0 ? 24 : hh));
          var h0 = xy(a, 18), h1 = xy(a, R - 30);
          hl += 'M' + pt(h0[0], h0[1]) + 'L' + pt(h1[0], h1[1]);
        }
      }
      [9 * 60 + 30, 16 * 60].forEach(function (mn) { var a = ang(atClock(mn)), h0 = xy(a, 18), h1 = xy(a, R - 7); hl += 'M' + pt(h0[0], h0[1]) + 'L' + pt(h1[0], h1[1]); });
      s += tag('path', { d: hl, stroke: '#6b5f4e', 'stroke-width': 0.7, opacity: 0.55 });
      s += tag('path', { d: hl, stroke: '#ffffff', 'stroke-width': 0.6, opacity: 0.4, transform: 'translate(0.6,0.7)' });
      s += tag('path', { d: ticks, stroke: '#4f4537', 'stroke-width': 1, 'stroke-linecap': 'round' });
      s += tag('circle', { cx: C, cy: C, r: R - 6, fill: 'none', stroke: '#6b5f4e', 'stroke-width': 0.7 });
      s += lab;
      if (day) {
        [['rise', day.ar], ['set', day.as]].forEach(function (x) { var q = xy(x[1], R - 38); s += tag('circle', { cx: r2(q[0]), cy: r2(q[1]), r: 2.2, fill: '#e0b060', stroke: '#7a5a22', 'stroke-width': 0.6 }); });
      }
      s += '<g class="polis-sd-hand" style="transform-origin:' + C + 'px ' + C + 'px">' +
        tag('path', { 'class': 'polis-sd-shadow', d: 'M' + (C - 6) + ',' + (C + 2) + 'L' + (C - 1.4) + ',' + (C - R + 14) + 'Q' + C + ',' + (C - R + 11) + ' ' + (C + 1.4) + ',' + (C - R + 14) + 'L' + (C + 6) + ',' + (C + 2) + 'Z', fill: 'url(#' + id + 'sh)', filter: 'url(#' + id + 'bl)' }) +
        tag('path', { 'class': 'polis-sd-shadow', d: 'M' + (C - 2.2) + ',' + C + 'L' + (C - 0.5) + ',' + (C - R + 16) + 'L' + (C + 0.5) + ',' + (C - R + 16) + 'L' + (C + 2.2) + ',' + C + 'Z', fill: '#241a10', opacity: 0.8 }) +
        tag('path', { 'class': 'polis-sd-moon', d: 'M' + C + ',' + (C - 8) + 'L' + C + ',' + (C - R + 18), stroke: '#dfe4ea', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0 }) +
        tag('path', { 'class': 'polis-sd-moon', d: 'M' + (C - 3) + ',' + (C - R + 16) + 'a4.2,4.2 0 1,0 5.6,5.4a3.4,3.4 0 1,1 -5.6,-5.4Z', fill: '#e8ecf0', opacity: 0 }) + '</g>';
      s += tag('circle', { cx: C, cy: C, r: 9, fill: 'url(#' + id + 'b)' });
      s += tag('path', { d: 'M' + C + ',' + (C - 8) + 'L' + (C + 5.6) + ',' + (C + 5) + 'L' + (C - 5.6) + ',' + (C + 5) + 'Z', fill: 'url(#' + id + 'g)', stroke: '#5a3a18', 'stroke-width': 0.5 });
      s += tag('circle', { cx: C - 2, cy: C - 2, r: 2, fill: '#fff6dc', opacity: 0.55 });
      var label = 'Sundial: the shadow follows the real sun over New York. Gold arc New York session, blue Asia, olive London.';
      holder.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 220 220" role="img" aria-label="' + esc(label) + '"><defs>' + defs + '</defs>' + s + '</svg>';
      face = { day: day };
    }
    function tick() {
      var now = opts.now ? (typeof opts.now === 'function' ? opts.now() : opts.now) : Date.now();
      var p = tzParts(now, tz), k = p.y + '-' + p.mo + '-' + p.d;
      if (k !== dayKey) { dayKey = k; build(now); }
      var sun = sunAt(now, loc.lat, loc.lon), hand = holder.querySelector('.polis-sd-hand');
      var night = sun.alt < -0.833, sh = holder.querySelectorAll('.polis-sd-shadow'), mo = holder.querySelectorAll('.polis-sd-moon'), i;
      if (hand) hand.style.transform = 'rotate(' + r2(sun.ha) + 'deg)';
      for (i = 0; i < sh.length; i++) sh[i].setAttribute('opacity', night ? 0 : r2(Math.max(0.45, Math.min(1, 0.5 + sun.alt / 40)) * (i ? 0.8 : 1)));
      for (i = 0; i < mo.length; i++) mo[i].setAttribute('opacity', night ? (i ? 0.95 : 0.7) : 0);
      var hh = (p.h < 10 ? '0' : '') + p.h, mm = (p.mi < 10 ? '0' : '') + p.mi;
      tline.textContent = hh + ':' + mm + ' New York';
      sline.textContent = sessionNow(p).text + (night ? ' · night: the moon keeps the hour' : ' · sun ' + Math.round(sun.alt) + '° up');
      root.setAttribute('data-night', night ? '1' : '0');
      root.setAttribute('data-session', sessionNow(p).id);
    }
    tick();
    function loop() { tick(); }
    function start() { if (!timer) timer = setInterval(loop, st ? 60000 : 20000); }
    function stopT() { if (timer) { clearInterval(timer); timer = null; } }
    function vis() { if (D.hidden) stopT(); else { tick(); start(); } }
    if (!opts.now) { start(); D.addEventListener('visibilitychange', vis); }
    return { el: root, tick: tick, stop: function () { stopT(); D.removeEventListener('visibilitychange', vis); }, face: function () { return face; } };
  }
  P.sundial = sundial;

  /* ------------------------------------------------------------------ 9. the oil-lamp loader */
  function lamp(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var st = still();
    clearSafe(el, 'polis-lamp');
    var root = D.createElement('div');
    root.className = 'polis-lamp' + (opts.progress === undefined || opts.progress === null ? ' indet' : '');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    var art = D.createElement('div'); art.className = 'polis-lamp-art'; art.innerHTML = lampSVG(uid('l'));     // generated SVG only
    var lab = D.createElement('div'); lab.className = 'polis-lamp-label'; lab.textContent = opts.label || 'Lighting the lamp…';
    root.appendChild(art); root.appendChild(lab);
    el.appendChild(root);
    var grow = art.querySelector('.polis-lamp-grow'), halo = art.querySelector('.polis-lamp-halo');
    function set(p) {
      if (p === null || p === undefined) { root.classList.add('indet'); return; }
      p = Math.max(0, Math.min(1, Number(p) || 0));
      root.classList.remove('indet');
      var s = 0.28 + 0.72 * p;
      grow.setAttribute('transform', 'scale(' + r2(s) + ')');
      halo.setAttribute('opacity', r2(0.25 + 0.75 * p));
      root.setAttribute('aria-valuenow', Math.round(p * 100));
    }
    if (st) { root.classList.add('still'); if (opts.progress === undefined || opts.progress === null) grow.setAttribute('transform', 'scale(1)'); }
    if (opts.progress !== undefined && opts.progress !== null) set(opts.progress);
    return {
      el: root, set: set,
      label: function (t) { lab.textContent = t; },
      done: function (cb) {
        root.classList.add('done');
        setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); if (cb) cb(); }, st ? 0 : 520);
      },
      stop: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  function lampSVG(id) {
    var defs = grad(id + 'c', [[0, '#e7a36d'], [0.35, '#c8703f'], [0.75, '#94471f'], [1, '#5e2c12']], { a: { x1: 0.2, y1: 0, x2: 0.5, y2: 1 } }) +
      grad(id + 'f1', [[0, '#fff6d6'], [0.35, '#ffd98a'], [0.75, '#f0a53e'], [1, '#c8642a', 0]], { radial: true, a: { cx: '50%', cy: '78%', r: '70%' } }) +
      grad(id + 'f2', [[0, '#ffffff'], [0.5, '#fff1c2'], [1, '#ffd27a', 0]], { radial: true, a: { cx: '50%', cy: '80%', r: '60%' } }) +
      grad(id + 'h', [[0, '#ffd690', 0.42], [0.5, '#e0a050', 0.12], [1, '#e0a050', 0]], { radial: true, a: { cx: '50%', cy: '50%', r: '50%' } }) +
      grad(id + 't', [[0, '#ffe2b0', 0.55], [1, '#ffe2b0', 0]], { a: { x1: 1, y1: 0, x2: 0.3, y2: 0.8 } });
    var dots = '', i;
    for (i = 0; i < 11; i++) { var a = Math.PI * (1.08 + i * 0.084); dots += circD(78 + 34 * Math.cos(a), 63 + 9 * Math.sin(a) - 2, 1.15); }
    return '<svg xmlns="' + NS + '" viewBox="0 0 160 104" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' +
      tag('ellipse', { 'class': 'polis-lamp-halo', cx: 126, cy: 46, rx: 46, ry: 40, fill: 'url(#' + id + 'h)' }) +
      tag('ellipse', { cx: 80, cy: 92, rx: 50, ry: 5, fill: '#000', opacity: 0.35 }) +
      tag('path', { d: 'M40,66C40,52 58,46 78,46C92,46 104,49 112,53L126,55C131,55.6 133,58.6 132,61.6C131,64.4 128,65.6 125,65.4L113,66C107,76 94,82 78,82C58,82 40,78 40,66Z', fill: 'url(#' + id + 'c)' }) +
      tag('path', { d: 'M27,60C21,60 18,65 20,70C22,75 30,76 41,71L42,66C34,69 27,69 26,66C25,63 28,62 32,63L36,60Z', fill: 'url(#' + id + 'c)' }) +
      tag('path', { d: 'M62,82L94,82L92,88L64,88Z', fill: '#7a3a1a' }) +
      tag('ellipse', { cx: 78, cy: 53, rx: 20, ry: 4.6, fill: '#8a4220' }) +
      tag('ellipse', { cx: 78, cy: 52.4, rx: 16, ry: 3.4, fill: '#b2643a' }) +
      tag('circle', { cx: 78, cy: 52.4, r: 2.2, fill: '#3a1a0a' }) +
      tag('path', { d: dots, fill: '#e9b081', opacity: 0.55 }) +
      tag('path', { d: 'M44,66C50,72 62,75 78,75C92,75 104,72 110,66', fill: 'none', stroke: '#5a2810', 'stroke-width': 0.9, opacity: 0.55 }) +
      tag('path', { 'class': 'polis-lamp-lit', d: 'M96,48C104,49 110,51 116,54L126,55.4C129,55.8 131,57.6 131.4,60', fill: 'none', stroke: 'url(#' + id + 't)', 'stroke-width': 3, 'stroke-linecap': 'round' }) +
      tag('path', { d: 'M124.4,55.6L127.6,54.6L128,57.6Z', fill: '#2a1408' }) +
      '<g class="polis-lamp-flame" transform="translate(126.4,55.4)"><g class="polis-lamp-grow"><g class="polis-lamp-flick">' +
      tag('path', { d: 'M0,0C-7.5,-3 -8,-13 -4,-21C-2,-25.5 -1,-30 0,-36C2,-29 5.5,-25 7,-19C9.6,-10 6.8,-2.6 0,0Z', fill: 'url(#' + id + 'f1)' }) +
      tag('path', { d: 'M0,-1.2C-4,-3 -4.6,-9 -2.2,-13.6C-1,-16 -0.4,-18.6 0,-22C1.4,-18 3.4,-15.4 4,-12C4.8,-6.8 3.4,-2.4 0,-1.2Z', fill: 'url(#' + id + 'f2)' }) +
      tag('ellipse', { cx: 0, cy: -2.2, rx: 1.6, ry: 2.6, fill: '#5a7fb0', opacity: 0.55 }) +
      '</g></g></g></svg>';
  }
  P.lamp = lamp;

  /* ------------------------------------------------------------------ 10. laurel wreaths and olive sprigs (gold leaf) */
  function laurelSVG(opts, id) {
    var kind = opts.kind === 'olive' ? 'olive' : 'laurel', form = opts.form || (kind === 'olive' ? 'sprig' : 'wreath'), gold = !!opts.gold, id = uid('w');
    var parts;
    if (form === 'wreath') parts = wreathParts(60, 56, 36, kind);
    else {
      var b = branch([24, 100], [30, 50], [92, 22], { n: kind === 'olive' ? 12 : 9, len: kind === 'olive' ? 19 : 17, w: kind === 'olive' ? 3.3 : 4.4, spread: kind === 'olive' ? 34 : 40, fruit: kind === 'olive' ? 3 : 2 });
      parts = { stem: b.stem, leaves: b.leaves, ribs: b.ribs, fruit: b.fruit, ribbon: '', ribbonLines: '' };
    }
    var leafFill, stemCol, ribCol, fruitFill, ribbonFill, defs = '';
    if (gold) {
      defs += grad(id + 'g', GOLD, { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
      defs += grad(id + 'gs', GOLD, { a: { gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 120, y2: 120 } });
      leafFill = 'url(#' + id + 'g)'; stemCol = 'url(#' + id + 'gs)'; ribCol = '#7a5718'; fruitFill = 'url(#' + id + 'g)';
      ribbonFill = 'url(#' + id + 'rb)';
      defs += grad(id + 'rb', [[0, '#b2442c'], [0.5, '#8c2f20'], [1, '#5e1c12']], { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
      defs += grad(id + 'sw', [[0, '#fff', 0], [0.42, '#fff', 0], [0.5, '#fff', 0.85], [0.58, '#fff', 0], [1, '#fff', 0]], { a: { x1: 0, y1: 0, x2: 1, y2: 0.5 } });
      defs += tag('clipPath', { id: id + 'k' }, tag('path', { d: parts.leaves.join('') }));
    } else if (kind === 'olive') {
      defs += grad(id + 'o', [[0, '#d3d9ad'], [0.45, '#97a466'], [1, '#5e6a3e']], { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
      leafFill = 'url(#' + id + 'o)'; stemCol = '#6d5a3a'; ribCol = '#d6dcb6'; fruitFill = '#3c3a2a'; ribbonFill = '#8c2f20';
    } else {
      defs += grad(id + 'o', [[0, '#9fb070'], [0.5, '#5f7a3e'], [1, '#3d5228']], { a: { x1: 0, y1: 0, x2: 1, y2: 1 } });
      leafFill = 'url(#' + id + 'o)'; stemCol = '#5a4a2c'; ribCol = '#c7d3a0'; fruitFill = '#2f3a52'; ribbonFill = '#8c2f20';
    }
    var leaves = '', i, n = parts.leaves.length;
    for (i = 0; i < n; i++) leaves += tag('path', { d: parts.leaves[i], fill: leafFill, 'class': 'polis-leaf', style: '--i:' + i + ';--n:' + n });
    var fruit = parts.fruit.map(function (f) { return kind === 'olive' ? ellD(f[0], f[1], 2.5, 3.3) : circD(f[0], f[1], 2); }).join('');
    var body = tag('path', { d: parts.stem, fill: 'none', stroke: stemCol, 'stroke-width': form === 'wreath' ? 1.6 : 2.2, 'stroke-linecap': 'round' }) +
      leaves + tag('path', { d: parts.ribs.join(''), fill: 'none', stroke: ribCol, 'stroke-width': 0.5, opacity: gold ? 0.55 : 0.6 }) +
      (fruit ? tag('path', { d: fruit, fill: fruitFill, 'class': 'polis-fruit' }) + (gold ? '' : tag('path', { d: parts.fruit.map(function (f) { return circD(f[0] - 0.8, f[1] - 1, 0.6); }).join(''), fill: '#fff', opacity: 0.35 })) : '') +
      (parts.ribbon ? tag('path', { d: parts.ribbon, fill: ribbonFill }) + tag('path', { d: parts.ribbonLines, fill: 'none', stroke: '#e9b8a0', 'stroke-width': 0.5, opacity: 0.5 }) : '');
    if (gold) body += tag('g', { 'clip-path': 'url(#' + id + 'k)' }, tag('rect', { 'class': 'polis-sweep', x: -140, y: -10, width: 140, height: 150, fill: 'url(#' + id + 'sw)' }));
    return { kind: kind, form: form, gold: gold, svg: '<svg xmlns="' + NS + '" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + body + '</svg>' };
  }
  function laurel(el, opts) {
    opts = opts || {};
    if (!el || !D) return null;
    var st = still(), L = laurelSVG(opts, uid('w')), kind = L.kind, form = L.form, gold = L.gold;
    var label = opts.label || (gold ? 'Gold ' : '') + (kind === 'olive' ? 'olive ' : 'laurel ') + (form === 'wreath' ? 'wreath' : 'sprig');
    clearSafe(el, 'polis-laurel');
    var root = D.createElement('span');
    root.className = 'polis-laurel ' + kind + ' ' + form + (gold ? ' gold' : '') + (opts.animate === false || st ? '' : ' grow');
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
    root.innerHTML = L.svg;                         // generated SVG only, no data
    if (opts.size) root.style.setProperty('--polis-laurel', opts.size + 'px');
    el.appendChild(root);
    return { el: root, replay: function () { if (still()) return; root.classList.remove('grow'); root.getBoundingClientRect(); root.classList.add('grow'); } };
  }
  P.laurel = laurel;

  /* ------------------------------------------------------------------ zero-code wiring: data-polis-* attributes */
  P.auto = function (rootEl) {
    if (!D) return 0;
    var r = rootEl || D, n = 0;
    function each(sel, fn) { var l = r.querySelectorAll(sel), i; for (i = 0; i < l.length; i++) { if (!l[i].getAttribute('data-polis-done')) { l[i].setAttribute('data-polis-done', '1'); fn(l[i]); n++; } } }
    each('[data-polis-meander]', function (e) { var v = (e.getAttribute('data-polis-meander') || '').split(/\s+/); meander(e, { color: v[0] || 'gold', live: v.indexOf('live') >= 0, sides: v.indexOf('band') >= 0 ? 'band' : 'all' }); });
    each('[data-polis-column]', function (e) { columnFrame(e, { order: e.getAttribute('data-polis-column') }); });
    each('[data-polis-inscribe]', function (e) { var v = e.getAttribute('data-polis-inscribe') || ''; inscribe(e, { plaque: v.indexOf('plaque') >= 0, gild: v.indexOf('gild') >= 0 }); });
    each('[data-polis-pottery]', function (e) { var v = (e.getAttribute('data-polis-pottery') || 'amphora').split(/\s+/); e.innerHTML = pottery(v[0], { style: v[1] === 'red' ? 'red' : 'black', frame: v[2] || 'tondo', size: +(e.getAttribute('data-size') || 120) }); });
    each('[data-polis-mosaic]', function (e) { var v = (e.getAttribute('data-polis-mosaic') || 'waves').split(/\s+/); mosaic(e, { pattern: v[0], dense: v.indexOf('dense') >= 0 }); });
    each('[data-polis-coin]', function (e) { coin(e, { value: +e.getAttribute('data-polis-coin') }); });
    each('[data-polis-attic]', function (e) { P.atticStamp(e); });
    each('[data-polis-sundial]', function (e) { sundial(e, {}); });
    each('[data-polis-lamp]', function (e) { lamp(e, { label: e.getAttribute('data-polis-lamp') || undefined }); });
    each('[data-polis-laurel]', function (e) { var v = (e.getAttribute('data-polis-laurel') || 'laurel').split(/\s+/); laurel(e, { kind: v[0], gold: v.indexOf('gold') >= 0, form: v.indexOf('wreath') >= 0 ? 'wreath' : (v.indexOf('sprig') >= 0 ? 'sprig' : undefined) }); });
    return n;
  };
  P.still = still;
  P.lite = isLite;
  P._svg = { coin: coinSVG, capital: capitalSVG, base: baseSVG, entab: entabSVG, steps: stepsSVG, laurel: laurelSVG, lamp: lampSVG };   // the raw builders (tests, previews)
  P.version = 'polis-1';

  W.OLYMPUS_POLIS = P;
  if (D && D.addEventListener) {
    var go = function () { still(); if (D.querySelector && D.querySelector('[data-polis-meander],[data-polis-column],[data-polis-inscribe],[data-polis-pottery],[data-polis-mosaic],[data-polis-coin],[data-polis-attic],[data-polis-sundial],[data-polis-lamp],[data-polis-laurel]')) P.auto(); };
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : this);
