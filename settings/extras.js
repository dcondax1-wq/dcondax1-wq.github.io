// SETTINGS extras (day-arenas DESIGN 2026-11-20, owner: "Settings = the one place"): two cards that read only this phone's own storage,
// never the network (a settings page must work offline and never send a thing; tests.test_settings_page):
//   #c-push  Phone notifications: on / off / not set up here, from Olympus's own record ('olympus.push', jarvis/push-ui.js), what you get
//            (every trade entry and exit, the day's summary, PC silent) and where to change it (the card on the Jarvis home; the PC's
//            notify_settings.json for the alert types, docs/TRADE_ALERTS.md)
//   #c-age   How old the numbers are: the last PC report and cloud copy the money cards saw on this phone ('olympus.pulse.ages',
//            olympus/pulse.js writes it on every open), so an old number is never mistaken for a live one
// Classic script, textContent only.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function read(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function ago(sec) {
    if (sec == null || !isFinite(sec)) return 'never';
    var s = Math.max(0, Math.round(sec));
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
  }
  function push() {
    var st = $('pushSt'), note = $('pushNote'); if (!st) return;
    var p = read('olympus.push') || {};
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var word = p.on ? 'On' : p.off ? 'Off' : 'Not set up';
    st.textContent = word; st.className = 'st ' + (p.on ? 'on' : p.off ? 'off' : '');
    note.textContent = p.on ? 'This phone gets every trade entry and exit, the day\'s summary and "PC silent" from your PC.'
      : p.off ? 'Turned off on this phone. Turn it on again from the card on the Jarvis home.'
      : standalone ? 'Tap the button, then "Allow notifications" on the card.' : 'On an iPhone: add Olympus to your Home Screen first, open it from there, then allow.';
  }
  function age() {
    var a = read('olympus.pulse.ages'), now = Date.now() / 1000;
    var pc = $('agePc'), cl = $('ageCloud'), seen = $('ageSeen'), lvl = $('ageSt'); if (!pc) return;
    if (!a) { pc.textContent = 'not seen yet'; cl.textContent = 'not seen yet'; seen.textContent = 'Open Aegis, Helios or any money app once.'; lvl.textContent = '—'; return; }
    var pcAge = a.pcT ? now - a.pcT : null;
    var AG = window.OLY_AGE;   // the kit's one age format (the root age.js) when it is on the page
    if (AG) { AG.chip(pc, pcAge, 'pc'); AG.chip(cl, a.cloudT ? now - a.cloudT : null, 'daily'); } else { pc.textContent = ago(pcAge); cl.textContent = ago(a.cloudT ? now - a.cloudT : null); }
    seen.textContent = 'Checked ' + ago(a.seen ? now - a.seen : null) + ' when an app was open. A live account number is from the PC report; older than 20 min means the PC is quiet.';
    lvl.textContent = pcAge == null ? 'No PC report' : pcAge <= 1200 ? 'Live' : pcAge <= 3600 ? 'Quiet' : 'Old';   // the same limits as age.js 'pc'
    lvl.className = 'st ' + (pcAge != null && pcAge <= 1200 ? 'on' : pcAge != null && pcAge <= 3600 ? 'warn' : 'off');
  }
  function go() { push(); age(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.addEventListener('storage', go);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
  window.SETTINGS_EXTRAS = { read: read, ago: ago, refresh: go };
})();
