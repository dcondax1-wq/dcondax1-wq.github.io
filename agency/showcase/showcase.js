/* AGENCY SHOWCASE (agency/showcase/, day-web 2026-11-20): the owner's own agency website. Classic ES5-safe script, no build, no network
   but this folder's brand.json (and ../demos/ links). The HTML already holds the default words, so this only swaps in the owner's brand,
   builds the demo / case lists, keeps the JSON-LD in step, wires the contact form (opens the phone's mail or messages app: nothing stored,
   nothing sent by the page), and loads the 3D city (city.js) once the page is idle, on a phone that can take it. */
(function () {
  'use strict';
  var d = document, w = window;
  var $ = function (s) { return d.querySelector(s); };
  var el = function (tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  var money = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };
  var B = null;
  var st = w.__showcase = { brand: false, demos: 0, offers: 0, three: 'waiting', why: '', form: '' };

  var DEF_DEMOS = [['restaurant', 'Restaurant', '#ff8a5c'], ['salon', 'Salon / barber', '#ff5ca8'], ['home-services', 'Plumber / HVAC', '#5cc8ff'], ['dentist', 'Dentist', '#7cffd1'],
    ['gym', 'Gym / coach', '#ffd25c'], ['real-estate', 'Real estate', '#b49cff'], ['landscaping', 'Landscaping', '#8dff7c'], ['auto', 'Auto shop', '#ff6b6b']];
  function demos() {
    var list = B && B.demos instanceof Array ? B.demos : DEF_DEMOS.map(function (x) { return { slug: x[0], label: x[1], color: x[2] }; });
    return list.filter(function (x) { return x && /^[a-z0-9-]+$/.test(String(x.slug || '')) && x.label; });
  }
  function demoHref(slug) { return '../demos/' + slug + '/'; }       // the demos team's page; one anchor per demo (ASKS.md)
  w.SHOWCASE = { demos: demos, demoHref: demoHref };

  function txt(sel, v) { if (v == null || v === '') return; d.querySelectorAll(sel).forEach(function (e) { e.textContent = String(v); }); }
  function telOf(v) { return 'tel:' + String(v || '').replace(/[^\d+]/g, ''); }
  function hoursText(h) { var m = /^([A-Z][a-z])-([A-Z][a-z]) (\d\d):\d\d-(\d\d):\d\d$/.exec(String(h || '')); if (!m) return h || ''; var D = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun' };
    var hr = function (x) { var n = +x; return n === 0 ? '12am' : n < 12 ? n + 'am' : n === 12 ? '12pm' : (n - 12) + 'pm'; }; return D[m[1]] + '-' + D[m[2]] + ' ' + hr(m[3]) + '-' + hr(m[4]); }

  function applyBrand() {
    if (!B) return;
    txt('[data-b=name]', B.name); txt('[data-b=area]', B.area);
    txt('[data-b=hours-text]', hoursText(B.hours));
    if (B.accent && /^#[0-9a-f]{6}$/i.test(B.accent)) d.documentElement.style.setProperty('--accent', B.accent);
    if (B.name) { d.title = B.name + ' · ' + (B.tagline ? B.tagline.replace(/[.,].*$/, '') : 'Websites'); }
    d.querySelectorAll('[data-b=phone-link]').forEach(function (a) { if (B.phone) { a.href = telOf(B.phone); if (a.textContent !== 'Call') a.textContent = B.phone; } });
    if (B.week instanceof Array && B.week.length) {
      var ol = $('#weekList'); ol.textContent = '';
      B.week.forEach(function (r) { var li = el('li'); li.appendChild(el('b', '', r[0])); li.appendChild(el('span', '', r[1])); ol.appendChild(li); });
    }
    if (B.offers instanceof Array && B.offers.length) {
      var box = $('#offerList'); box.textContent = '';
      var sel = $('#offerSel'), keep = sel.value; sel.textContent = '';
      B.offers.forEach(function (o) {
        var a = el('article', 'card price' + (o.best ? ' best' : ''));
        if (o.best) a.appendChild(el('span', 'flag', 'Recommended'));
        a.appendChild(el('h3', '', o.name)); a.appendChild(el('p', 'amt', (o.from ? 'From ' : '') + money(o.price)));
        a.appendChild(el('p', 'per', (o.per || 'one time') + (o.monthly ? ' · then ' + money(o.monthly) + ' a month' : '')));
        var ul = el('ul'); (o.points || []).forEach(function (p) { ul.appendChild(el('li', '', p)); }); a.appendChild(ul);
        var b = el('a', 'btn ' + (o.best ? 'primary' : 'ghost'), 'Choose ' + o.name); b.href = '#contact'; b.setAttribute('data-offer', o.id); a.appendChild(b);
        box.appendChild(a);
        var op = el('option', '', o.name + ' (' + money(o.price) + ')'); op.value = o.id; sel.appendChild(op);
      });
      var un = el('option', '', 'Not sure yet'); un.value = 'unsure'; sel.appendChild(un);
      sel.value = keep && sel.querySelector('option[value="' + keep + '"]') ? keep : ((B.offers.filter(function (o) { return o.best; })[0] || B.offers[0]).id);
      st.offers = B.offers.length;
    }
    ld();
  }
  // the LocalBusiness JSON-LD (search engines read it): the same fields as brand.json
  function ld() {
    var s = $('#ld'); if (!s || !B) return;
    var prices = (B.offers || []).map(function (o) { return o.price; }).filter(function (x) { return typeof x === 'number'; });
    var o = { '@context': 'https://schema.org', '@type': 'LocalBusiness', '@id': (B.site_url || '') + '#business', name: B.name, description: B.tagline, url: B.site_url,
      telephone: B.phone, email: B.email, image: 'og.jpg', priceRange: prices.length ? money(Math.min.apply(null, prices)) + '-' + money(Math.max.apply(null, prices)) : undefined,
      areaServed: B.area, address: { '@type': 'PostalAddress', addressLocality: B.city, addressRegion: B.region, addressCountry: B.country }, openingHours: B.hours,
      makesOffer: (B.offers || []).map(function (x) { return { '@type': 'Offer', name: x.name, price: String(x.price), priceCurrency: 'USD' }; }) };
    s.textContent = JSON.stringify(o);
  }
  function lists() {
    var box = $('#demoList'); box.textContent = '';
    demos().forEach(function (x) {
      var a = el('a', 'card case'); a.href = demoHref(x.slug); a.style.borderColor = 'color-mix(in srgb,' + x.color + ' 40%, transparent)';
      a.appendChild(el('span', 'kind', 'Live demo')); a.appendChild(el('h3', '', x.label)); a.appendChild(el('p', '', 'Open it on your phone: menu, booking, map, reviews.'));
      box.appendChild(a);
    });
    st.demos = box.children.length;
    var cs = $('#caseList'); cs.textContent = '';
    var cases = B && B.cases instanceof Array ? B.cases : [{ name: 'Case study coming soon', kind: 'Restaurant', result: 'Your first client\'s result goes here (calls, bookings, reviews).', demo: 'restaurant' }];
    cases.forEach(function (c) {
      var a = el('article', 'card case'); a.appendChild(el('span', 'kind', c.kind)); a.appendChild(el('h3', '', c.name)); a.appendChild(el('p', '', c.result));
      if (c.demo) { var l = el('a', '', 'See the demo ›'); l.href = demoHref(c.demo); a.appendChild(l); }
      cs.appendChild(a);
    });
  }

  // the contact form: builds the message and opens the phone's own mail / messages app; the page sends and stores nothing
  function message(f) {
    var g = function (n) { return String((f.elements[n] && f.elements[n].value) || '').trim().slice(0, 600); };
    var off = f.elements.offer, label = off && off.selectedOptions && off.selectedOptions[0] ? off.selectedOptions[0].textContent : g('offer');
    return { subject: 'Website for ' + (g('biz') || 'my business'),
      body: 'Hi, I am ' + (g('name') || '(name)') + ' from ' + (g('biz') || '(business)') + ' (' + g('kind') + ').\nPlan: ' + label + '\n' + (g('msg') ? 'What I need: ' + g('msg') + '\n' : '') + '\nSent from your website.' };
  }
  function linkFor(via, m) {
    if (via === 'sms') { var to = String((B && (B.sms || B.phone)) || '').replace(/[^\d+]/g, ''); return 'sms:' + to + (/iP(hone|ad|od)/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(m.subject + '. ' + m.body); }
    return 'mailto:' + encodeURIComponent((B && B.email) || 'hello@example.com').replace('%40', '@') + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  }
  w.SHOWCASE.message = message; w.SHOWCASE.linkFor = linkFor;
  function wireForm() {
    var f = $('#form'), via = 'email';
    f.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-via]'); if (b) via = b.getAttribute('data-via'); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var miss = ['name', 'biz'].filter(function (n) { return !String(f.elements[n].value || '').trim(); });
      if (miss.length) { $('#formNote').textContent = 'Please add your ' + (miss[0] === 'name' ? 'name' : 'business name') + ' first.'; f.elements[miss[0]].focus(); return; }
      var href = linkFor(via, message(f));
      st.form = href;
      $('#formNote').textContent = via === 'sms' ? 'Opening your messages app...' : 'Opening your email app...';
      if (!w.__showcaseNoNav) w.location.href = href;
    });
    d.addEventListener('click', function (e) {    // a price card's button picks that plan in the form
      var a = e.target.closest && e.target.closest('[data-offer]'); if (!a) return;
      var sel = $('#offerSel'); if (sel.querySelector('option[value="' + a.getAttribute('data-offer') + '"]')) sel.value = a.getAttribute('data-offer');
    });
  }
  // the bottom call / mockup bar hides while the form is on screen (it would cover the send buttons)
  function stickyBar() {
    var bar = $('#stickyCta'), c = $('#contact'); if (!bar || !c || !w.IntersectionObserver) return;
    new IntersectionObserver(function (es) { bar.hidden = es[es.length - 1].isIntersecting; }, { threshold: 0.05 }).observe(c);
  }

  // the 3D city: only after the page has loaded and gone idle, never on a weak or data-saving phone, never under reduced motion
  function why3d() {
    var q = new URLSearchParams(location.search);
    if (q.get('3d') === '0') return 'off by ?3d=0';
    if (q.get('3d') === '1') return '';
    try { if (w.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced motion'; } catch (e) { /* fine */ }
    var c = navigator.connection; if (c && (c.saveData || /(^|-)2g|3g/.test(String(c.effectiveType || '')))) return 'data saver / slow network';
    if (navigator.deviceMemory && navigator.deviceMemory < 3) return 'low memory';
    try { var cv = d.createElement('canvas'); if (!(cv.getContext('webgl2') || cv.getContext('webgl'))) return 'no WebGL'; } catch (e) { return 'no WebGL'; }
    return '';
  }
  function load3d() {
    var why = why3d(); st.why = why;
    if (why) { st.three = 'still'; return; }
    st.three = 'loading';
    import('./city.js?v=s1').then(function (m) { m.mount($('#stage'), { demos: demos(), href: demoHref, onState: function (s) { st.three = s; } }); })
      .catch(function (e) { st.three = 'failed'; st.why = String(e && e.message || e); });
  }
  function idle(fn) { if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 400); }

  function boot() {
    lists(); wireForm(); stickyBar();
    fetch('brand.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && typeof j === 'object') { B = j; st.brand = true; applyBrand(); lists(); }
    }).catch(function () { /* the defaults in the page stay */ });
    if (d.readyState === 'complete') idle(load3d); else w.addEventListener('load', function () { idle(load3d); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
