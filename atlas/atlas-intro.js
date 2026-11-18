/* Atlas's lightweight city gate. This page intentionally has no shared OLYMPUS intro kit. */
(function () {
  'use strict';
  var d = document, q = location.search || '';
  if (d.hidden || /[?&](?:intro=0|q=off|q=low)(?:&|$)/.test(q) ||
      (navigator.webdriver && !/[?&]intro=1(?:&|$)/.test(q)) ||
      (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  try { if (localStorage.getItem('oly.intro') === 'off') return; } catch (_) {}
  var key = 'oly.intro.atlas', seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch (_) {}
  var gate = d.createElement('div');
  gate.className = 'at-intro' + (seen ? ' brief' : '');
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-label', 'Olympus Atlas opening');
  var ring = d.createElement('div'); ring.className = 'at-intro-ring'; ring.setAttribute('aria-hidden', 'true');
  var city = d.createElement('div'); city.className = 'at-intro-city'; city.setAttribute('aria-hidden', 'true');
  [28, 42, 65, 90, 118, 84, 62, 43, 30].forEach(function (height) {
    var tower = d.createElement('i'); tower.style.height = height + 'px'; city.appendChild(tower);
  });
  var glyph = d.createElement('span'); glyph.className = 'at-intro-glyph'; glyph.textContent = '◈';
  var title = d.createElement('strong'); title.textContent = 'OLYMPUS ATLAS';
  var line = d.createElement('span'); line.className = 'at-intro-line'; line.textContent = 'Every arena. One command center.';
  var skip = d.createElement('button'); skip.type = 'button'; skip.textContent = 'Enter Atlas'; skip.setAttribute('aria-label', 'Enter Olympus Atlas now');
  gate.append(ring, city, glyph, title, line, skip);
  d.body.appendChild(gate);
  var done = false, timer = 0;
  function finish(watched) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    d.removeEventListener('keydown', onKey);
    d.removeEventListener('visibilitychange', onVisibility);
    if (watched) { try { sessionStorage.setItem(key, '1'); } catch (_) {} }
    gate.classList.add('leave');
    setTimeout(function () { if (gate.parentNode) gate.parentNode.removeChild(gate); }, 180);
  }
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault(); finish(false);
    }
  }
  function onVisibility() { if (d.hidden) finish(false); }
  skip.addEventListener('click', function () { finish(false); });
  gate.addEventListener('pointerup', function (e) { if (e.target !== skip) finish(false); });
  d.addEventListener('keydown', onKey);
  d.addEventListener('visibilitychange', onVisibility);
  skip.focus({ preventScroll: true });
  timer = setTimeout(function () { finish(true); }, seen ? 420 : 2200);
}());
