/* AGENCY demo sites: the page's own buttons (agency/demos/demo.js, classic script, defer). Works with or without the 3D:
 *  - [data-book]      opens the booking sheet (<dialog id="book">); sending it shows a thank-you: nothing leaves the phone (demo)
 *  - .pick buttons    in a [data-group] row: one pressed at a time; the 2D picture shows [data-for="group:value"] layers; fires
 *                     window 'demo:pick' {group, value} for the 3D scene; window.DEMO_PICKS holds the current choices
 *  - input[data-ba]   the before / after slider: --ba on the stage (0..1, the 2D picture's clip) + window 'demo:ba' {value}
 *  - [data-note]      a pick's one-line note goes into the row's .pick-note
 *  - ?biz= (or ?name=)&city=&tel=  "Make it theirs" (the gallery builds the link): the prospect's business name, town and phone replace the made-up
 *                     ones ([data-biz], [data-city], every tel: link); the strip then says "Sample site for <name>", reviews are marked as
 *                     samples, made-up ratings / trust numbers / licence lines become "Sample: ..." placeholders
 *                     ([data-sample], [data-hide-personal]). Text only (textContent), lengths capped, nothing stored or sent.
 */
(function () {
  'use strict';
  var D = document, W = window;
  W.DEMO_PICKS = W.DEMO_PICKS || {};
  (function personalise() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var clean = function (v, n) { return String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); };
    var biz = clean(q.get('biz') || q.get('name'), 40), city = clean(q.get('city'), 30), tel = String(q.get('tel') || '').replace(/[^0-9+]/g, '').slice(0, 16);
    var each = function (sel, f) { var l = D.querySelectorAll(sel); for (var i = 0; i < l.length; i++) f(l[i]); };
    if (biz) {
      each('[data-biz]', function (e) { e.textContent = biz; });
      each('[data-fict]', function (e) { e.textContent = '(sample site)'; });
      each('[data-strip]', function (e) { e.textContent = 'Sample site for ' + biz; });
      each('[data-reviews]', function (e) { e.textContent = 'Reviews (samples: yours go here)'; });
      // made-up numbers and claims never sit next to a real business's name: placeholders instead, the trust strip hidden
      each('[data-sample]', function (e) { e.textContent = e.getAttribute('data-sample'); });
      each('[data-hide-personal]', function (e) { e.hidden = true; });
      D.title = biz + ' · sample site';
      each('.logo[aria-label]', function (e) { e.setAttribute('aria-label', biz + ', top of page'); });
      D.documentElement.setAttribute('data-personal', '1');
    }
    if (city) each('[data-city]', function (e) { e.textContent = city; });
    var digits = tel.replace(/\D/g, '');
    if (digits.length >= 7) {
      var us = digits.length === 10 ? digits : digits.length === 11 && digits[0] === '1' ? digits.slice(1) : '';
      var shown = us ? '(' + us.slice(0, 3) + ') ' + us.slice(3, 6) + '-' + us.slice(6) : tel;
      var href = 'tel:' + (us ? '+1' + us : tel);
      each('a[href^="tel:"]', function (a) { a.setAttribute('href', href); var t = a.lastChild;
        if (t && t.nodeType === 3 && /\(555\) 010-\d{4}/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/\(555\) 010-\d{4}/, shown); });
    }
  })();
  function fire(name, detail) { try { W.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* old browser */ } }
  function show(group, value) {
    var all = D.querySelectorAll('[data-for^="' + group + ':"]');
    for (var i = 0; i < all.length; i++) all[i].style.display = all[i].getAttribute('data-for') === group + ':' + value ? '' : 'none';
  }
  var rows = D.querySelectorAll('[data-group]');
  Array.prototype.forEach.call(rows, function (row) {
    var g = row.getAttribute('data-group'), note = D.querySelector('[data-note-for="' + g + '"]');
    function pick(b, quiet) {
      Array.prototype.forEach.call(row.querySelectorAll('.pick'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var v = b.getAttribute('data-value'); W.DEMO_PICKS[g] = v; show(g, v);
      if (note) note.textContent = b.getAttribute('data-note') || '';
      if (!quiet) fire('demo:pick', { group: g, value: v });
    }
    row.addEventListener('click', function (e) { var b = e.target.closest('.pick'); if (b && row.contains(b)) pick(b); });
    var first = row.querySelector('.pick[aria-pressed="true"]') || row.querySelector('.pick');
    if (first) pick(first, true);
  });
  Array.prototype.forEach.call(D.querySelectorAll('input[data-ba]'), function (inp) {
    var st = D.querySelector(inp.getAttribute('data-ba'));
    function set() { var v = (+inp.value || 0) / 100; W.DEMO_PICKS.ba = v; if (st) st.style.setProperty('--ba', v); fire('demo:ba', { value: v }); }
    inp.addEventListener('input', set); set();
  });
  var dlg = D.getElementById('book');
  if (dlg) {
    var form = dlg.querySelector('form'), done = dlg.querySelector('.done'), opener = null;
    D.addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]');
      if (b) { e.preventDefault(); opener = b; if (form) form.hidden = false; if (done) done.hidden = true;
        var sel = dlg.querySelector('[name="what"]'), want = b.getAttribute('data-book');
        if (sel && want) sel.value = want;
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
      if (e.target.closest('[data-close]')) { e.preventDefault(); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
    });
    dlg.addEventListener('close', function () { if (opener && opener.focus) opener.focus(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg.close) dlg.close(); });   // a tap on the dim backdrop
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!form.reportValidity || form.reportValidity()) { form.hidden = true; if (done) { done.hidden = false; var h = done.querySelector('h3'); if (h) h.focus(); } }
    });
    var day = dlg.querySelector('input[type="date"]');
    if (day) { var t = new Date(Date.now() + 864e5); day.min = t.toISOString().slice(0, 10); day.value = day.min; }
  }
  var y = D.querySelectorAll('[data-year]');
  for (var i = 0; i < y.length; i++) y[i].textContent = String(new Date().getFullYear());
})();
