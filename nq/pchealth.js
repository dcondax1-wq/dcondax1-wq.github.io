// PC HEALTH page (night-nq-home 2026-11-27): renders window.PCHEALTH.checks(lite). textContent only; GET only.
(function () {
  'use strict';
  var ICON = { green: '✓', amber: '!', red: '×', grey: '?' };
  var WORD = { red: 'need you now', amber: 'to watch', green: 'fine', grey: 'not sent' };
  var lite = null, last = null;
  function plain(r) {   // the whole page as plain text, to paste into a chat with Claude (ids already masked by the core)
    var lines = ['PC Health: ' + r.say + (r.age == null ? ' (no PC report)' : ' (PC reported ' + window.PCHEALTH.ageText(r.age) + ' ago)')];
    r.checks.forEach(function (c) { lines.push('- [' + c.state + '] ' + c.title + ': ' + c.say + (c.fix ? ' Fix: ' + c.fix : '')); });
    return lines.join('\n');
  }
  function copy() {
    var b = document.getElementById('copy'), t = last ? plain(last) : '';
    function ok() { b.textContent = 'Copied'; b.classList.add('done'); setTimeout(function () { b.textContent = 'Copy for Claude'; b.classList.remove('done'); }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { b.textContent = 'Copy failed'; });
    else b.textContent = 'Copy not available';
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function card(c, i) {
    var li = el('li', 'ck ' + c.state); li.setAttribute('data-id', c.id); li.style.setProperty('--i', i);
    var d = el('span', 'dot'); d.setAttribute('aria-label', c.state);
    li.appendChild(d); li.appendChild(el('div', 'tt', c.title)); li.appendChild(el('div', 'sy', c.say));
    if (c.fix) li.appendChild(el('div', 'fx', c.fix));
    return li;
  }
  function render() {
    var H = window.PCHEALTH, r = H.checks(lite); last = r;
    var hero = document.getElementById('hero'); hero.setAttribute('data-s', r.overall);
    document.getElementById('orb').textContent = ICON[r.overall] || '?';
    document.getElementById('say').textContent = lite ? r.say : 'No report from the PC yet.';
    document.getElementById('meta').textContent = r.age == null ? 'No PC report' : 'PC reported ' + H.ageText(r.age) + ' ago';
    var chips = document.getElementById('chips'); chips.textContent = '';
    ['red', 'amber', 'green', 'grey'].forEach(function (k) { if (r.counts[k]) chips.appendChild(el('span', 'chip ' + k, r.counts[k] + ' ' + WORD[k])); });
    var need = document.getElementById('need'), ok = document.getElementById('ok'); need.textContent = ''; ok.textContent = '';
    var n = 0, m = 0;
    r.checks.forEach(function (c, i) {
      if (c.state === 'red' || c.state === 'amber') { need.appendChild(card(c, i)); n++; } else { ok.appendChild(card(c, i)); m++; }
    });
    document.getElementById('needh').hidden = !n; document.getElementById('okh').hidden = !m;
  }
  var NQF = window.NQ_FEED;   // night-nq-speed shared feed (nqfeed.js): kept post at once + every newer post; else the old 60 s read
  function load() {
    if (NQF) { NQF.latest().then(function (j) { if (j) { lite = j; render(); } }, function () {}); return; }
    if (!window.PC_FEED) { render(); return; }
    window.PC_FEED.fetchLatest({ feedUrl: new URL('../status_feed.json', location.href).href })
      .then(function (j) { lite = j || null; render(); }, function () { render(); });
  }
  document.getElementById('copy').addEventListener('click', copy);
  render();
  if (NQF) { var first = NQF.cached(); if (first) { lite = first; render(); } NQF.on(function (j) { lite = j || lite; render(); }); }
  load(); if (!NQF) setInterval(load, 60000);
})();
