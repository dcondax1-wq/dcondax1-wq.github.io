/* OLYMPUS research brain: page logic (cities/brain.js, classic script). Loads brain-data.json (tools/build_brain_hub.py), draws the search,
 * the filter chips, the cards and the list at once; the 3D scene (brain-scene.js, ES module, three.js local) is imported after the first paint.
 * Read-only: nothing here arms, starts or changes anything. window.BrainHub = test + lead hooks. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = { data: null, mode: 'all', fam: -1, q: '', sel: -1, scene: null, vis: null, glance: { live: false, fresh: false } };
  var NAMES = { a: 'Adopted / live', r: 'Rejected', o: 'Open: waiting' };
  var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function match(n) {
    if (S.mode !== 'all' && n.s !== S.mode) return false;
    if (S.fam >= 0 && n.f !== S.fam) return false;
    if (S.q) { var h = (n.t + ' ' + n.r + ' ' + n.v + ' ' + S.data.fam[n.f] + ' ' + (n.w || '')).toLowerCase(); var ws = S.q.split(/\s+/); for (var i = 0; i < ws.length; i++) if (h.indexOf(ws[i]) < 0) return false; }
    return true;
  }
  function apply() {
    var d = S.data; if (!d) return;
    S.vis = d.n.map(function (n) { return match(n) ? 1 : 0; });
    var k = S.vis.reduce(function (a, b) { return a + b; }, 0), c = { a: 0, r: 0, o: 0 };
    d.n.forEach(function (n, i) { if (S.vis[i]) c[n.s]++; });
    $('count').innerHTML = '<b>' + k + '</b> of ' + d.n.length + ' findings<span class="dot a"></span>' + c.a + '<span class="dot r"></span>' + c.r + '<span class="dot o"></span>' + c.o;
    if (S.scene) S.scene.setVisible(S.vis);
    if ($('lst').classList.contains('open')) renderList();
  }
  function related(i) {
    var out = []; S.data.e.forEach(function (e) { if (e[0] === i) out.push(e[1]); else if (e[1] === i) out.push(e[0]); }); return out.slice(0, 4);
  }
  function openCard(i, fromScene) {
    var n = S.data.n[i]; if (!n) return;
    S.sel = i; closeList();
    var rel = related(i).map(function (j) { var m = S.data.n[j]; return '<button data-j="' + j + '">' + esc(m.t.length > 44 ? m.t.slice(0, 43) + '...' : m.t) + '</button>'; }).join('');
    $('card').innerHTML = '<button class="x" id="cx" aria-label="Close">&#10005;</button><h2>' + esc(n.t) + '</h2>' +
      '<span class="tag ' + n.s + '">' + NAMES[n.s] + '</span><span class="tag">' + esc(S.data.fam[n.f]) + '</span>' + (n.d ? '<span class="tag">' + esc(n.d) + '</span>' : '') +
      '<div class="k">What we tested</div><p>' + esc(n.t) + (n.x ? ' (a follow-up inside the same study)' : '') + '</p>' +
      '<div class="k">The $ result</div><p class="money">' + esc(n.r) + '</p>' +
      '<div class="k">Verdict</div><p>' + esc(n.v) + '</p>' +
      (n.w ? '<a class="go" href="../writeups/' + encodeURIComponent(n.w) + '.md" target="_blank" rel="noopener">Read the write-up</a>' : '') +
      (rel ? '<div class="k">Linked findings</div><div class="rel">' + rel + '</div>' : '');
    var c = $('card'); c.classList.add('open'); c.setAttribute('aria-hidden', 'false'); c.scrollTop = 0;
    $('cx').onclick = closeCard;
    Array.prototype.forEach.call(c.querySelectorAll('.rel button'), function (b) { b.onclick = function () { openCard(+b.getAttribute('data-j')); }; });
    if (S.scene) S.scene.select(i);
    $('hint').style.opacity = 0;
    if (!fromScene) try { $('cx').focus({ preventScroll: true }); } catch (e) {}
  }
  function closeCard() { S.sel = -1; var c = $('card'); c.classList.remove('open'); c.setAttribute('aria-hidden', 'true'); if (S.scene) S.scene.select(-1); }
  function closeList() { var l = $('lst'); l.classList.remove('open'); l.setAttribute('aria-hidden', 'true'); }
  function renderList() {
    var d = S.data, rows = [];
    d.n.forEach(function (n, i) { if (S.vis[i]) rows.push('<li class="' + n.s + '"><button data-i="' + i + '">' + esc(n.t) + '<small>' + esc(NAMES[n.s]) + ' &middot; ' + esc(d.fam[n.f]) + (n.d ? ' &middot; ' + esc(n.d) : '') + '</small></button></li>'); });
    var l = $('lst'); l.innerHTML = '<button class="x" id="lx" aria-label="Close list">&#10005;</button><h2>All findings (' + rows.length + ')</h2><ul class="list">' + (rows.join('') || '<li><small>Nothing matches. Clear the search or a filter.</small></li>') + '</ul>';
    $('lx').onclick = closeList;
    Array.prototype.forEach.call(l.querySelectorAll('li button'), function (b) { b.onclick = function () { openCard(+b.getAttribute('data-i')); }; });
  }
  function wire() {
    var q = $('q'), t = 0;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { S.q = q.value.trim().toLowerCase(); apply(); }, 80); });
    Array.prototype.forEach.call($('modes').querySelectorAll('[data-m]'), function (b) {
      b.onclick = function () {
        S.mode = b.getAttribute('data-m');
        Array.prototype.forEach.call($('modes').querySelectorAll('[data-m]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        apply();
      };
    });
    var fb = $('famBtn'), fr = $('fams');
    fr.innerHTML = '<button class="chip" data-f="-1" aria-pressed="true">Every family</button>' + S.data.fam.map(function (f, i) { return '<button class="chip" data-f="' + i + '" aria-pressed="false">' + esc(f) + '</button>'; }).join('');
    fb.onclick = function () {
      var on = !fr.classList.contains('on'); fr.classList.toggle('on', on); fb.setAttribute('aria-pressed', on ? 'true' : 'false'); fb.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!on) { S.fam = -1; Array.prototype.forEach.call(fr.children, function (x, k) { x.setAttribute('aria-pressed', k === 0 ? 'true' : 'false'); }); apply(); }
    };
    Array.prototype.forEach.call(fr.children, function (b) {
      b.onclick = function () { S.fam = +b.getAttribute('data-f'); Array.prototype.forEach.call(fr.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); apply(); };
    });
    $('listBtn').onclick = function () { closeCard(); renderList(); var l = $('lst'); l.classList.add('open'); l.setAttribute('aria-hidden', 'false'); l.scrollTop = 0; };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeCard(); closeList(); } });
  }
  // the public status: a live trade or a new finding makes the bright pulse sweep. Same-site public json only; never a private feed.
  function findLive(o, depth) {
    if (!o || typeof o !== 'object' || depth > 4) return false;
    for (var k in o) {
      if (/^open_?(trades?|positions?)$|^positions?$|^in_?trade$/i.test(k)) { var v = o[k]; if (v && (typeof v === 'number' ? v > 0 : Array.isArray(v) ? v.length : v === true || (typeof v === 'object' && Object.keys(v).length))) return true; }
      if (findLive(o[k], depth + 1)) return true;
    }
    return false;
  }
  function glance() {
    var tryUrls = ['../home.json', '../data.json'], k = 0;
    (function next() {
      if (k >= tryUrls.length) return;
      fetch(tryUrls[k++], { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j) return next();
        if (findLive(j.board || j.live || j, 0)) { S.glance.live = true; $('live').hidden = false; if (S.scene) S.scene.sweep(); }
      }).catch(next);
    })();
    var seen = null; try { seen = localStorage.getItem('brainSeen'); } catch (e) {}
    var b = S.data.built;
    if (seen && b && seen !== b) { S.glance.fresh = true; $('fresh').hidden = false; if (S.scene) S.scene.sweep(); }
    try { if (b) localStorage.setItem('brainSeen', b); } catch (e) {}
  }
  function start3d() {
    if (S.scene !== null) return;
    S.scene = false;
    var c = $('c');
    import('./brain-scene.js?v=b1').then(function (m) {
      var sc = m.create(c, S.data, { onPick: function (i) { if (i < 0) closeCard(); else openCard(i, true); }, reduce: reduce, onLost: function () { S.scene = false; document.body.classList.add('nogl'); } });
      if (!sc) { document.body.classList.add('nogl'); return; }
      S.scene = sc; sc.setVisible(S.vis);
      if (S.glance.live || S.glance.fresh || /[?&]pulse=1/.test(location.search)) sc.sweep();
      setTimeout(function () { $('hint').style.opacity = 0; }, 6000);
    }).catch(function (e) { document.body.classList.add('nogl'); try { console.warn('brain 3d off', e && e.message); } catch (x) {} });
  }
  function boot(d) {
    S.data = d; wire(); apply(); glance();
    var go = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 60); })(start3d, { timeout: 800 }); };
    if (document.readyState === 'complete') go(); else addEventListener('load', go);
  }
  fetch('brain-data.json').then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); }).then(boot)
    .catch(function () { $('count').textContent = 'Could not load the findings.'; });

  window.BrainHub = {
    get data() { return S.data; }, state: S,
    stats: function () { return S.scene ? S.scene.stats() : null; },
    pick: function (i) { openCard(i); },
    project: function (i) { return S.scene ? S.scene.project(i) : null; },
    sweep: function () { if (S.scene) S.scene.sweep(); },
  };
})();
