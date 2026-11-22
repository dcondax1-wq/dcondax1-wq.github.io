/* gate/install-hint.js (2026-11-22, owner: "get rid of top and bottom stuff"): Safari's address bar and bottom buttons can only be hidden
   when Olympus runs as an installed app. In a normal Safari tab on an iPhone / iPad this shows ONE card that says how, until the owner taps
   "Got it" (remembered on the phone; nothing is sent anywhere). Installed app, desktop, Android: nothing shows. */
(function () {
  'use strict';
  var KEY = 'olympus.installhint.v1';
  function installed() {
    try { if (window.navigator.standalone === true) return true; } catch (e) {}
    try { if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) {}
    return false;
  }
  function apple() {
    var ua = (navigator.userAgent || '') + '';
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  }
  function dismissed() { try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  if (installed() || !apple() || dismissed()) return;
  function show() {
    if (document.getElementById('installHint')) return;
    var d = document.createElement('div');
    d.id = 'installHint'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Hide the browser bars');
    d.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483000;padding:12px 14px;border-radius:16px;'
      + 'background:#16131e;border:1px solid #4d2e76;box-shadow:0 0 18px rgba(157,89,238,.35);color:#f4efe6;font:500 15px/1.35 -apple-system,system-ui,sans-serif;';
    var t = document.createElement('div');
    t.innerHTML = '<b style="color:#f1c14b">Hide the top and bottom bars</b><br>Tap <b>Share</b> (the square with the arrow), then <b>Add to Home Screen</b>, then <b>Add</b>. Open Olympus from that new icon. The Safari bars are gone there.';
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Got it';
    b.style.cssText = 'margin-top:10px;min-height:44px;padding:0 18px;border-radius:12px;border:1px solid #9d59ee;background:#3e255e;color:#fff;font:600 15px -apple-system,system-ui,sans-serif;';
    b.addEventListener('click', function () { try { window.localStorage.setItem(KEY, '1'); } catch (e) {} if (d.parentNode) d.parentNode.removeChild(d); });
    d.appendChild(t); d.appendChild(b); document.body.appendChild(d);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
