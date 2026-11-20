/* SET UP YOUR IPHONE (hub/setup.html, 2026-11-20 day-manual). The Copy buttons build each app's full link from this page's own address
 * (so the page names no address); "Done" shows when the page runs as the Home Screen app. Nothing sent, no storage. window.SETUP_PAGE (tests). */
(function () {
  'use strict';
  var d = document, msg = d.getElementById('copyMsg');
  function full(rel) { try { return new URL('../' + rel, location.href).href; } catch (e) { return rel; } }
  function say(t) { if (msg) msg.textContent = t; }
  function copy(btn) {
    var u = full(btn.getAttribute('data-copy'));
    var done = function () { btn.textContent = 'Copied'; say('Link copied: paste it in Safari, then Share, Add to Home Screen.'); setTimeout(function () { btn.textContent = 'Copy its link'; }, 1800); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(u).then(done, function () { say('Copy is blocked here. The link: ' + u); }); return; } } catch (e) { /* below */ }
    say('Copy is blocked here. The link: ' + u);
  }
  var b = d.querySelectorAll('button[data-copy]');
  for (var i = 0; i < b.length; i++) b[i].addEventListener('click', function (ev) { copy(ev.currentTarget); });
  var sa = false; try { sa = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { sa = false; }
  var s = d.getElementById('standalone'); if (s) s.hidden = !sa;
  window.SETUP_PAGE = { ready: true, full: full };
}());
