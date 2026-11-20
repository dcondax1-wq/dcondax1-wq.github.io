/* OWNER MANUAL (hub/manual.html, 2026-11-20 day-manual). The page is plain HTML and reads fine without this file.
   This adds: Copy buttons, the Dark / Light / Auto switch (kept on this phone), and opening an emergency card from #sos-<n>.
   Read only: no fetch, no network, nothing sent. textContent only. window.OWNER_MANUAL.ready = true when done (tests). */
(function () {
  'use strict';
  var root = document.documentElement, KEY = 'olympus.manual.mode';
  var MODES = ['auto', 'dark', 'light'], NAMES = { auto: 'Auto', dark: 'Dark', light: 'Light' };

  function getMode() { try { var m = localStorage.getItem(KEY); return MODES.indexOf(m) >= 0 ? m : 'auto'; } catch (e) { return 'auto'; } }
  function setMode(m) {
    if (m === 'auto') root.removeAttribute('data-mode'); else root.setAttribute('data-mode', m);
    try { localStorage.setItem(KEY, m); } catch (e) { /* private mode: this visit only */ }
    var b = document.getElementById('mode');
    if (b) { b.textContent = NAMES[m]; b.setAttribute('aria-label', 'Colours: ' + NAMES[m] + '. Tap to change'); }
  }

  function copyText(t, btn) {
    function done(w) { btn.textContent = w; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); }
    function select() {
      var code = btn.parentNode.querySelector('code');
      try { var r = document.createRange(); r.selectNodeContents(code); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* nothing */ }
      done('Selected');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done('Copied'); }, select);
      else select();
    } catch (e) { select(); }
  }

  function openFromHash() {
    var h = (location.hash || '').slice(1);
    if (!/^sos-\d+$/.test(h)) return;
    var d = document.getElementById(h);
    if (d && d.tagName === 'DETAILS') d.open = true;
  }

  function init() {
    setMode(getMode());
    var b = document.getElementById('mode');
    if (b) b.addEventListener('click', function () { setMode(MODES[(MODES.indexOf(getMode()) + 1) % MODES.length]); });
    var btns = document.querySelectorAll('.mn-copy button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget, code = btn.parentNode.querySelector('code');
        copyText(code ? code.textContent : '', btn);
      });
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    try {   // the offline copy (manual-sw.js, scope = this page only); http(s) only, never in a file:// copy
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('manual-sw.js', { scope: './manual' }).catch(function () { /* no offline copy */ });
    } catch (e) { /* no offline copy */ }
    window.OWNER_MANUAL = { ready: true, mode: getMode };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
