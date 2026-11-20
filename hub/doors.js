/* The Doors page (hub/doors.html, 2026-11-18, night-org, docs/ORGANIZATION.md): four doors, each with its few shortcuts (plain name, the Greek
 * app name under it) and "All apps in this door"; a search over every shortcut and every app by plain words. Data: window.OLYMPUS_DOORS
 * (olympus/doors.js) + window.OLYMPUS_APPS_LIST (olympus/apps-list.js). #zeus / #money / #kalshi / #more opens a door (default: ZEUS Trading).
 * A door with a `home` (ZEUS: hub/zeus.html) shows one big link to it first.
 * Read only; text through textContent; localStorage only for the last door opened (try / catch). */
(function () {
  'use strict';
  var d = document, D = window.OLYMPUS_DOORS, APPS = (window.OLYMPUS_APPS_LIST || []).filter(function (a) { return a && a.id; });
  var out = d.getElementById('out'), q = d.getElementById('q'), KEY = 'olympus.doors.last';
  var INK = { zeus: '#c8a24a', money: '#a0ac6e', kalshi: '#c9b94e', more: '#d1a06a' };       // text-safe on the dark panels
  if (!D || !out) return;
  var byId = {}; APPS.forEach(function (a) { byId[a.id] = a; });
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function href(p) { return '../' + (p || 'index.html'); }
  function appHref(a) { return href(a.path === '' ? 'index.html' : a.path); }
  function row(label, sub, to, door) {
    var r = el('a', 'dr-row'); r.href = to; r.style.setProperty('--dc', INK[door] || '#c8a24a');
    var t = el('span'); t.appendChild(el('b', '', label)); if (sub) t.appendChild(el('small', '', sub));
    r.appendChild(t); var go = el('i', '', '›'); go.setAttribute('aria-hidden', 'true'); r.appendChild(go);
    return r;
  }
  function appRow(a) { var dr = D.doorOf(a.id); return row(a.name, a.purpose || '', appHref(a), dr); }
  function current() { var m = /^#([a-z]+)/.exec(location.hash || ''); if (m && D.door(m[1])) return m[1]; try { var s = localStorage.getItem(KEY); if (s && D.door(s)) return s; } catch (e) { /* none */ } return 'zeus'; }
  function mark(id) { [].forEach.call(d.querySelectorAll('.dr-door'), function (x) { x.setAttribute('aria-current', String(x.getAttribute('data-door') === id)); }); }
  function showDoor(id) {
    var dr = D.door(id) || D.DOORS[0];
    try { localStorage.setItem(KEY, dr.id); } catch (e) { /* private mode */ }
    mark(dr.id);
    out.replaceChildren();
    out.style.setProperty('--dc', INK[dr.id]);
    var h = el('h2', 'dr-h2', dr.title); h.id = 'doorH'; out.appendChild(h);
    out.appendChild(el('p', 'dr-line', dr.line));
    if (dr.home) {                                             // the door's own landing first (ZEUS: hub/zeus.html, night-zeushub)
      var hl = row('Open ' + dr.title.split(' ')[0], 'Right now: PC, every account, today\'s windows and news, the big buttons', href(dr.home), dr.id);
      hl.className += ' dr-home'; hl.setAttribute('data-home', dr.id); out.appendChild(hl);
    }
    var list = el('div', 'dr-list'); list.setAttribute('aria-labelledby', 'doorH');
    dr.items.forEach(function (it) { list.appendChild(row(it.label, it.greek, href(it.href), dr.id)); });
    out.appendChild(list);
    var all = dr.ids.map(function (x) { return byId[x]; }).filter(Boolean), arch = D.archived || function () { return false; };
    var apps = all.filter(function (a) { return !arch(a.id); }), old = all.filter(function (a) { return arch(a.id); });
    if (apps.length) {
      var det = el('details', 'dr-all'), sum = el('summary', '', 'All apps in ' + dr.title + ' (' + apps.length + ')');
      det.appendChild(sum); var al = el('div', 'dr-list'); apps.forEach(function (a) { al.appendChild(appRow(a)); }); det.appendChild(al); out.appendChild(det);
    }
    if (old.length) {                                          // night-revamp-main 2026-11-20: the weak / duplicate pages, folded (olympus/doors.js ARCHIVE)
      var ad = el('details', 'dr-all dr-arc'), as = el('summary', '', 'Archive: ' + old.length + ' older pages');
      ad.appendChild(as); var ol = el('div', 'dr-list'); old.forEach(function (a) { ol.appendChild(appRow(a)); }); ad.appendChild(ol); out.appendChild(ad);
    }
  }
  function showFind(text) {
    var r = D.find(text, APPS), seen = {};
    mark('');
    out.replaceChildren();
    out.style.removeProperty('--dc');
    var h = el('h2', 'dr-h2', 'Found'); out.appendChild(h);
    var list = el('div', 'dr-list');
    r.items.forEach(function (x) { list.appendChild(row(x.item.label, x.item.greek + ' · ' + x.door.title, href(x.item.href), x.door.id)); if (x.item.app) seen[x.item.app] = 1; });
    r.apps.forEach(function (a) { if (seen[a.id]) return; var dr = D.door(D.doorOf(a.id)); list.appendChild(row(a.name, (a.purpose || '') + ' · ' + (dr ? dr.title : ''), appHref(a), dr ? dr.id : '')); });
    if (!list.childNodes.length) out.appendChild(el('p', 'dr-empty', 'Nothing found for "' + text.slice(0, 40) + '". Try a plain word: payout, taxes, accounts, drawdown, kalshi.'));
    else out.appendChild(list);
  }
  function render() { var t = (q && q.value || '').trim(); if (t) showFind(t); else showDoor(current()); }
  if (q) {
    q.addEventListener('input', render);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = out.querySelector('a.dr-row'); if (f && q.value.trim()) { e.preventDefault(); location.href = f.href; } } else if (e.key === 'Escape') { q.value = ''; render(); } });
  }
  [].forEach.call(d.querySelectorAll('.dr-door'), function (a) { a.addEventListener('click', function () { if (q) q.value = ''; }); });
  window.addEventListener('hashchange', function () { if (q) q.value = ''; render(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) render(); });
  render();
  window.OLYMPUS_DOORS_PAGE = { render: render, door: current };
}());
