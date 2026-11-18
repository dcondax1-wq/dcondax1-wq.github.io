/* OLYMPUS glossary-lite (2026-11-04): plain-words explanations for the trading jargon the apps show. A classic deferred script, no imports.
 *   what    every first few uses of a jargon word on the page (sweep, IFVG, CISD, inducement, displacement, p10 / f10, MFE, MAE, FDR, PF) get a
 *           dotted underline and a one-line plain explanation: a title (mouse) and a tap / click bubble (iPhone has no hover)
 *   where   text in the page, also text the app draws later (a debounced MutationObserver); never inside links, buttons, labels, inputs,
 *           canvases or anything marked data-nogloss, so no control's text or the app's own tests change (textContent stays the same)
 *   caps    each word is explained at most 4 times per page (the first uses), so a table full of "sweep" is not a field of underlines
 *   api     window.OLYMPUS_GLOSS = { terms, define(word) -> the sentence or '', explain(root) }   (explain is called by itself; apps need not)
 * Safari 16 safe (no lookbehind, no ?.). It never throws and never touches anything but text nodes it wraps in <abbr class="oly-gl">. */
(function () {
  'use strict';
  if (window.OLYMPUS_GLOSS) return;
  var d = document;
  var TERMS = [
    ['IFVG', /\bIFVG\b/, 'Inverse fair value gap: a price gap that was filled and now works the other way, as a floor or a ceiling.'],
    ['CISD', /\bCISD\b/, 'Change in state of delivery: price stops pushing one way and starts pushing the other. The bot waits for it before entering.'],
    ['inducement', /\binducements?\b/i, 'A small fake move that tempts traders in, just before the real move.'],
    ['displacement', /\bdisplacements?\b/i, 'A fast, strong move in one direction: it shows big money is pushing price.'],
    ['sweep', /\bsweeps?\b/i, 'Price pokes just past a recent high or low to grab the orders waiting there, then turns back.'],
    ['p10', /\bp10\b/, 'p10: the chance to pass the eval within 10 trading days.'],
    ['f10', /\bf10\b/, 'f10: the chance to fail the eval within 10 trading days.'],
    ['MFE', /\bMFE\b/, 'The most a trade was ever in profit before it closed.'],
    ['MAE', /\bMAE\b/, 'The most a trade was ever against you before it closed.'],
    ['FDR', /\bFDR\b/, 'False discovery rate: a check that a result is not just luck from testing many ideas.'],
    ['PF', /\bPF\b/, 'Profit factor: money won divided by money lost. Above 1 means it made money.']
  ];
  var CAP = 4, used = {}, skip = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|BUTTON|A|LABEL|SUMMARY|ABBR|CANVAS|SVG|CODE|PRE|NOSCRIPT|TITLE|IFRAME)$/;
  function define(w) { w = String(w || ''); for (var i = 0; i < TERMS.length; i++) if (TERMS[i][1].test(w)) return TERMS[i][2]; return ''; }
  function skipped(n) {
    for (var e = n.parentNode; e && e !== d.body; e = e.parentNode) {
      if (e.nodeType === 1 && (skip.test(e.tagName.toUpperCase()) || e.hasAttribute('data-nogloss') || e.isContentEditable || (e.className && String(e.className).indexOf('oly-') === 0 && String(e.className).indexOf('oly-gl') < 0 && /oly-(veil|intro|l\b)/.test(String(e.className))))) return true;
    }
    return false;
  }
  function wrap(node) {
    var text = node.nodeValue, best = null, i, m;
    for (i = 0; i < TERMS.length; i++) {
      if ((used[TERMS[i][0]] || 0) >= CAP) continue;
      m = TERMS[i][1].exec(text);
      if (m && (!best || m.index < best.index)) best = { index: m.index, len: m[0].length, t: TERMS[i] };
    }
    if (!best) return;
    used[best.t[0]] = (used[best.t[0]] || 0) + 1;
    var ab = d.createElement('abbr'); ab.className = 'oly-gl'; ab.title = best.t[2]; ab.setAttribute('data-gl', best.t[0]);
    ab.textContent = text.substr(best.index, best.len);
    var after = node.splitText(best.index); after.nodeValue = after.nodeValue.substr(best.len);
    node.parentNode.insertBefore(ab, after);
    if (after.nodeValue) wrap(after);                      // the rest of the same text may hold another word
  }
  function explain(root) {
    try {
      root = root || d.body; if (!root) return;
      var w = d.createTreeWalker(root, 4, null), list = [], n;
      while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.length > 2 && !skipped(n)) list.push(n);
      for (var i = 0; i < list.length; i++) if (list[i].parentNode) wrap(list[i]);
    } catch (e) { /* the page is fine without it */ }
  }
  // the style and the tap bubble
  var st = d.createElement('style');
  st.textContent = 'abbr.oly-gl{text-decoration:underline dotted;-webkit-text-decoration:underline dotted;text-underline-offset:2px;cursor:help}' +
    '.oly-gl-tip{position:fixed;z-index:2147483000;max-width:min(300px,calc(100vw - 24px));padding:10px 12px;border-radius:12px;font:500 13px/1.35 -apple-system,system-ui,sans-serif;color:var(--oly-th-n38, #eef1f8);' +
    'background:rgba(var(--oly-th-n3-rgb, 12,14,26),.96);border:1px solid rgba(var(--oly-th-a5-rgb, 156,107,60),.55);box-shadow:0 10px 30px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);pointer-events:none}';
  (d.head || d.documentElement).appendChild(st);
  var tip = null, tipT = 0;
  function hide() { if (tip && tip.parentNode) tip.parentNode.removeChild(tip); tip = null; clearTimeout(tipT); }
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('abbr.oly-gl') : null;
    if (!a) { hide(); return; }
    hide();
    tip = d.createElement('div'); tip.className = 'oly-gl-tip'; tip.setAttribute('role', 'tooltip'); tip.textContent = a.title; d.body.appendChild(tip);
    var r = a.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    tipT = setTimeout(hide, 6000);
  }, true);
  window.OLYMPUS_GLOSS = { terms: TERMS.map(function (t) { return [t[0], t[2]]; }), define: define, explain: explain };
  // now, and for what the app draws later
  var pend = 0, adds = [];
  function flush() { pend = 0; var a = adds; adds = []; for (var i = 0; i < a.length; i++) if (a[i].isConnected && !(a[i].closest && a[i].closest('abbr'))) explain(a[i]); }
  function start() {
    explain(d.body);
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) { var n = muts[i].addedNodes[j]; if (n.nodeType === 1 && n.tagName !== 'ABBR' && !(n.className && String(n.className).indexOf('oly-gl-tip') >= 0)) adds.push(n); else if (n.nodeType === 3 && n.parentNode && n.parentNode.nodeType === 1) adds.push(n.parentNode); }
        if (adds.length && !pend) pend = setTimeout(flush, 500);
      }).observe(d.body, { childList: true, subtree: true });
    } catch (e) { /* static pages only */ }
  }
  if (d.body) setTimeout(start, 600); else d.addEventListener('DOMContentLoaded', function () { setTimeout(start, 600); });
}());
