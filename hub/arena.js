/* ARENA FRONT PAGE (2026-11-21): draws hub/arena.html?a=<id> from olympus/gate-catalog.js (C.arena, C.arenaLayout). Text only through textContent. */
(function () {
  'use strict';
  var d = document, w = window, C = w.OLYMPUS_GATE;
  function $(id) { return d.getElementById(id); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function href(a) { var p = a.path || ''; return '../' + (p === '' ? 'index.html' : /\/$/.test(p) ? p + 'index.html' : p); }
  if (!C || !C.arena) { $('arList').appendChild(el('p', 'ar-empty', 'The list of apps did not load. Go back Home and try again.')); return; }
  var m = /[?&]a=([a-z]+)/.exec(w.location.search || ''), A = C.arena(m ? m[1] : '') || C.arena('nq');
  d.title = A.name + ' · Olympus';
  $('arName').textContent = A.name; $('arLine').textContent = A.line + ' · ' + A.count + ' app' + (A.count === 1 ? '' : 's');
  var F = A.front ? C.byId(A.front) : null;
  if (F) { var f = $('arFront'); f.href = A.frontPath ? '../' + A.frontPath : href(F); $('arFrontName').textContent = 'Open ' + A.name + ' (the front page)'; $('arFrontLine').textContent = F.line; f.hidden = false; }
  var L = C.arenaLayout(A.id), box = $('arList');
  L.forEach(function (sec) {
    var list = sec.apps.filter(function (a) { return !F || a.id !== F.id; }); if (!list.length) return;
    var s = el('section', 'ar-sec'); var h = el('h2', '', sec.name); s.appendChild(h); if (sec.line) s.appendChild(el('p', '', sec.line));
    var ul = el('div', 'ar-list');
    list.forEach(function (a) {
      var it = el('a', 'ar-item'); it.href = href(a); it.setAttribute('data-app', a.id);
      var t = el('span'); t.appendChild(el('b', '', a.label)); t.appendChild(el('small', '', a.line)); it.appendChild(t);
      if (a.name && a.name !== a.label) it.appendChild(el('i', '', a.name));
      ul.appendChild(it);
    });
    s.appendChild(ul); box.appendChild(s);
  });
  if (!box.firstChild && !F) box.appendChild(el('p', 'ar-empty', 'Nothing here yet.'));
  C.arenas.forEach(function (x) { if (x.id === A.id) return; var a = el('a', '', x.name); a.href = 'arena.html?a=' + x.id; $('arOthers').appendChild(a); });
}());
