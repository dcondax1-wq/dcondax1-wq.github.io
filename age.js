// DATA AGE, one format site-wide (Olympus 2 "data truth", 2026-11-20). "updated 4 min ago", amber after X, red after Y, per kind of data.
// Classic script (window.OLY_AGE) + ES module export + CommonJS (node tests). No DOM except chip(); no fetch.
//   OLY_AGE.text(sec)            -> "updated just now" | "updated 4 min ago" | "updated 2 h 10 min ago" | "updated 3 days ago" | "age unknown"
//   OLY_AGE.level(sec, kind)     -> "ok" | "warn" | "bad"     kind: pc (the PC's 15-minute report), bars (the chart candles), daily (a nightly file),
//                                    weekly, live (a price / an open trade)
//   OLY_AGE.chip(el, sec, kind)  -> fills a <span class="oly-age" data-level> (CSS below in age.css)
//   OLY_AGE.LIMITS               -> { kind: [amber_after_s, red_after_s] }
(function (root) {
  'use strict';
  const LIMITS = {
    pc: [20 * 60, 60 * 60],            // posts every 15 min: amber once a report is missed, red after an hour
    live: [5 * 60, 20 * 60],
    bars: [80 * 60, 3 * 3600],         // candles about hourly while the bots trade
    daily: [26 * 3600, 3 * 86400],     // built every night
    weekly: [8 * 86400, 15 * 86400],
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  function text(sec) {
    const s = num(sec);
    if (s === null) return 'age unknown';
    const a = Math.max(0, s);
    if (a < 90) return 'updated just now';
    if (a < 3600) return `updated ${Math.round(a / 60)} min ago`;
    if (a < 48 * 3600) { const h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60); return h < 6 && m ? `updated ${h} h ${m} min ago` : `updated ${h} h ago`; }
    return `updated ${Math.round(a / 86400)} days ago`;
  }
  function level(sec, kind) {
    const s = num(sec), L = LIMITS[kind] || LIMITS.daily;
    if (s === null) return 'warn';
    return s > L[1] ? 'bad' : s > L[0] ? 'warn' : 'ok';
  }
  function chip(el, sec, kind) {
    if (!el) return el;
    el.className = 'oly-age'; el.dataset.level = level(sec, kind); el.textContent = text(sec);
    el.setAttribute('aria-label', `Data ${text(sec)}${el.dataset.level === 'ok' ? '' : el.dataset.level === 'warn' ? ', getting old' : ', old'}`);
    return el;
  }
  const api = { text, level, chip, LIMITS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OLY_AGE = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
