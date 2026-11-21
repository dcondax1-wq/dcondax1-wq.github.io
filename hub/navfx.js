/* NAV FX (2026-11-20 day-manual; owner: "It needs some 3D, it needs some effects"). Home (gate/), ZEUS (hub/zeus.html), the Website
 * Business HQ (agency/index.html). Loaded deferred after the first paint; adds html.nfx (navfx.css) and:
 *   - an aurora layer behind the page (one fixed div, CSS animation; Save-Data / slow line / weak phone = no blur)
 *   - a small 3D tilt on the app icons, the doors tray and the cards while a finger / pointer is on them (nothing moves on its own)
 *   - number roll-ups the first time a money / count number appears (an ::after overlay: the real text never changes, so VoiceOver and
 *     the tests read the final value at once)
 *   - one burst (olympus/nqfx.js milestone, loaded only then) when a goal is hit: the HQ's retainer goal reached (not an old 'Passed'
 *     chip on ZEUS: that showed on every visit for a pass days old)
 * Reduced motion: no tilt, no roll-up, no burst, the aurora stands still. No storage, nothing sent. window.NAV_FX (tests). */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  if (w.NAV_FX) return;
  var me = d.currentScript, BASE = me && me.src ? me.src.replace(/hub\/[^\/]*$/, '') : '../';
  var still = false; try { still = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { still = false; }
  var lite = false;
  try { var c = navigator.connection; lite = !!(c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))) || (navigator.deviceMemory && navigator.deviceMemory <= 2); } catch (e) { lite = false; }

  function aurora() {
    if (d.querySelector('.nfx-aurora')) return;
    var a = d.createElement('div'); a.className = 'nfx-aurora'; a.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) a.appendChild(d.createElement('i'));
    d.body.insertBefore(a, d.body.firstChild);
  }

  /* ---- tilt: pointer position -> --rx / --ry (max 7 deg); back to flat on leave */
  var TILT = '.g-ic, #doors4.g-qgrid, .hq-tile, .g-arena';   // small things only: a tilting big card reads as a glitch (and shifts what is measured on it)
  function tiltOn(el) {
    if (el.__nfx) return; el.__nfx = 1; el.setAttribute('data-nfx-tilt', '');
    var host = el.classList.contains('g-ic') ? el.parentNode : el;
    function move(e) {
      var r = el.getBoundingClientRect(); if (!r.width) return;
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5, k = el.classList.contains('g-ic') ? 14 : 5;
      el.style.setProperty('--ry', (x * k).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-y * k).toFixed(2) + 'deg'); el.classList.add('nfx-on');
    }
    function leave() { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); el.classList.remove('nfx-on'); }
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerdown', move, { passive: true });
    host.addEventListener('pointerleave', leave, { passive: true });
    host.addEventListener('pointerup', leave, { passive: true });
    host.addEventListener('pointercancel', leave, { passive: true });
  }
  function tiltAll() { if (still) return; var n = d.querySelectorAll(TILT); for (var i = 0; i < n.length; i++) tiltOn(n[i]); }

  /* ---- roll-up: '$49,193' / '20' / '$300 a month' count up from 0 in ~700 ms, drawn by .nfx-rolling::after */
  var ROLL = '.zs-bal, #hqPLeads, #hqPCalled, #hqPProp, #hqPPaid, #hqMrr';
  var seen = {};
  function fmt(tpl, v) {      // keep the template's $ and commas and its words: '$1,234 a month'
    var m = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(tpl); if (!m) return tpl;
    var dec = (m[2].split('.')[1] || '').length, n = Math.abs(v).toFixed(dec).split('.');
    n[0] = n[0].replace(/\B(?=(\d{3})+(?!\d))/g, m[2].indexOf(',') >= 0 || Math.abs(v) >= 1000 ? ',' : '');
    return m[1] + (v < 0 ? '-' : '') + n.join('.') + m[3];
  }
  function roll(el) {
    var t = (el.textContent || '').trim(), m = /^[^\d-]*(-?[\d,]+(?:\.\d+)?)/.exec(t);
    if (!m) return;
    var to = parseFloat(m[1].replace(/,/g, '')), key = (el.id || el.className) + '|' + t;
    if (!isFinite(to) || to === 0 || seen[key]) return;
    seen[key] = 1;
    if (still) return;
    var ink = ''; try { ink = getComputedStyle(el).color; } catch (e) { ink = ''; }
    el.style.setProperty('--nfx-roll-ink', ink);
    var t0 = 0, dur = 700;
    el.setAttribute('data-nfx-roll', fmt(t, 0)); el.classList.add('nfx-rolling');
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if ((el.textContent || '').trim() !== t) { done(); return; }          // the page drew a new number meanwhile: show it as is
      el.setAttribute('data-nfx-roll', fmt(t, to * e));
      if (k < 1) w.requestAnimationFrame(step); else done();
    }
    function done() { el.classList.remove('nfx-rolling'); el.removeAttribute('data-nfx-roll'); }
    w.requestAnimationFrame(step);
  }
  function rollAll() { var n = d.querySelectorAll(ROLL); for (var i = 0; i < n.length; i++) roll(n[i]); }

  /* ---- a goal hit: one burst a page view (nqfx.js loads only now) */
  var burst = {};
  function goal(key, el, text) {
    if (still || burst[key] || !el) return; burst[key] = 1;
    var s = d.createElement('script'); s.src = BASE + 'olympus/nqfx.js?v=n5'; s.async = true;
    s.onload = function () {
      var N = w.OLYMPUS_NQFX; if (!N || !N.ready) return;
      N.ready().then(function () { try { N.milestone(el, { text: text }); } catch (e) { /* no burst */ } });
    };
    d.head.appendChild(s);
  }
  function goals() {
    var hq = w.AGENCY_HQ && w.AGENCY_HQ.last;
    if (hq && hq.goal && hq.mrr >= hq.goal) goal('mrr', d.getElementById('hqMrr'), 'Retainer goal reached');
  }

  var timer = 0;
  function tick() { if (timer) return; timer = w.setTimeout(function () { timer = 0; tiltAll(); rollAll(); goals(); }, 120); }

  function boot() {
    root.classList.add('nfx'); if (lite) root.classList.add('nfx-lite');
    aurora(); tiltAll(); rollAll(); goals();
    try { new MutationObserver(tick).observe(d.body, { childList: true, subtree: true, characterData: true }); } catch (e) { /* no updates */ }
    w.NAV_FX.ready = true;
  }
  w.NAV_FX = { ready: false, fmt: fmt, still: still };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
}());
