/* Frame safe area (cities3 2026-11-20, owner: "the funky bottom of the screen"). Inside the Jarvis frame iOS gives the page a safe area of 0, so a
   dock at bottom: calc(10px + env(safe-area-inset-bottom)) sat on the home-indicator line on Face ID iPhones (13, 15 Pro Max). When this page is
   framed by its own site (same origin) AND the frame reaches the bottom of the screen, this sets --sb on <html> to the PARENT's real bottom inset
   (measured once with a probe there, again on resize). Alone in Safari, or in a frame that stops above the bottom, nothing changes.
   Classic script, no storage, no network; any error leaves the page as it was. */
(function () {
  'use strict';
  var W = window, d = document;
  if (W.top === W) return;
  function parentInset() {
    var P, pd, fe;
    try { P = W.parent; pd = P.document; fe = W.frameElement; } catch (e) { return null; }   // another origin: leave it
    if (!pd || !fe) return null;
    var r = fe.getBoundingClientRect();
    if (Math.abs(r.bottom - P.innerHeight) > 2) return 0;                                 // the frame stops above the bottom: nothing to add
    var p = pd.createElement('div');
    p.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    (pd.body || pd.documentElement).appendChild(p);
    var h = p.getBoundingClientRect().height;
    p.parentNode.removeChild(p);
    return h;
  }
  function apply() {
    try {
      var h = parentInset();
      if (h == null) return;
      var own = d.createElement('div');
      own.style.cssText = 'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
      d.documentElement.appendChild(own);
      var mine = own.getBoundingClientRect().height; own.parentNode.removeChild(own);
      var root = d.documentElement;
      if (h > mine + 0.5) { root.style.setProperty('--sb', h + 'px'); root.style.setProperty('--oly-sb', h + 'px'); root.setAttribute('data-frame-sb', String(Math.round(h))); }
      else if (root.hasAttribute('data-frame-sb')) { root.style.removeProperty('--sb'); root.style.removeProperty('--oly-sb'); root.removeAttribute('data-frame-sb'); }
    } catch (e) { /* the page keeps its own safe area */ }
  }
  apply();
  var t = 0;
  W.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(apply, 150); });
  W.addEventListener('orientationchange', function () { clearTimeout(t); t = setTimeout(apply, 300); });
})();
