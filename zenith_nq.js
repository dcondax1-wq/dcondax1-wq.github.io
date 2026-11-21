// Zenith NQ note (2026-11-11, owner: "the NQ bot needs to be back"). Loaded after zenith_pages.js, phone only. One small strip above Home (#/today):
//   - always: one visible link, "Open the new NQ page" (nq/, Zlarior and ATLAS on one page);
//   - when the PC has not reported for more than 20 minutes: the honest banner, in the same words as the NQ page:
//     "Last report from your PC: 4 days 3 hours ago. The bots may still be trading; this page just is not hearing from them."
// Read-only: it reads the page's own data (window.HOMEJ / D: live.pc.t, else board.data_t, else live.last_run), sends nothing, changes no setting.
// Text only through textContent. The age words are the same as nq/nqcore.js ageWords (tests/test_zenith_nq.py holds them together).
(function () {
  'use strict';
  var FRESH_S = 20 * 60, STALE_S = 36 * 3600;
  var SILENT = 'The bots may still be trading; this page just is not hearing from them.';
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function ageWords(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s < 60) return 'less than a minute';
    if (s < 3600) return plural(Math.floor(s / 60), 'minute');
    if (s < 86400) { var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
    var d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600); return plural(d, 'day') + (hh ? ' ' + plural(hh, 'hour') : '');
  }
  function num(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? v : null; }
  function data() { try { return (typeof D !== 'undefined' && D) || window.HOMEJ || null; } catch (e) { return window.HOMEJ || null; } }
  /** the PC's last report, epoch seconds (null = no data loaded yet, 0 = data without any report time) */
  function reportTime(d) {
    if (!d || typeof d !== 'object') return null;
    var lv = d.live || {}, pc = lv.pc || {}, bd = d.board || {};
    // the PC's status post (board.report_t, live.js / pc_feed.js boardOver) is the newest sign of life: the ZEUS card's time
    return Math.max(num(bd.report_t) || 0, num(pc.t) || num(bd.data_t) || num(lv.last_run) || 0);
  }
  function model(d, nowS) {
    var t = reportTime(d);
    if (t === null) return { banner: false };
    if (!t) return { banner: true, level: 'bad', title: 'No report from your PC yet.', text: SILENT };
    var age = Math.max(0, Math.floor(nowS - t));
    // the status post comes every 15 min: quiet only after 30 min, the ZEUS card's rule (else the banner blinked in every cycle)
    var post = !!(d.board && num(d.board.report_t));
    if (age <= (post ? 2 * 15 * 60 : FRESH_S)) return { banner: false, age: age };
    return { banner: true, level: age <= STALE_S ? 'warn' : 'bad', age: age, title: 'Last report from your PC: ' + ageWords(age) + ' ago.', text: SILENT };
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var box = null, sig = '', bootAt = Date.now(), GRACE = 4000, graceT = 0;
  function mount() {
    var pg = document.getElementById('page'); if (!pg || !pg.parentNode) return null;
    if (box && box.parentNode === pg.parentNode) return box;
    // the strip index.html already holds (in place from the first frame: nothing moves when this file lands)
    var have = document.getElementById('znNq');
    if (have && have.parentNode === pg.parentNode && have.querySelector('.zn-nq-t') && have.querySelector('.zn-nq-x') && have.querySelector('.zn-nq-a')) { box = have; return box; }
    box = el('section', 'zn-nq'); box.id = 'znNq'; box.setAttribute('aria-label', 'NQ bots: reporting');
    var words = el('div', 'zn-nq-w'); words.appendChild(el('b', 'zn-nq-t')); words.appendChild(el('span', 'zn-nq-x')); box.appendChild(words);
    var a = el('a', 'zn-nq-a', 'Open the new NQ page'); a.href = 'nq/'; a.id = 'znNqLink'; box.appendChild(a);
    pg.parentNode.insertBefore(box, pg);
    return box;
  }
  function draw() {
    var b = mount(); if (!b) return;
    // before the router has set PAGE (the first draw, at load) Home is read from the address, so the strip is in place before Home paints
    var home = false; try { home = typeof PAGE !== 'undefined' && PAGE != null ? PAGE === 'today' : !/^#\/(?!today\b)[a-z]/.test(location.hash); } catch (e) { home = false; }
    var m = model(data(), Date.now() / 1000);
    // day-arenas 2026-11-20 (CLS 0.30 on Home): the cloud copy is often older than the PC's own status post, which lands 0.5-3 s later
    // (pc_feed.js). Drawing the 2-line banner from the cloud copy, then folding it to the 1-line strip, moved the whole Home twice.
    // So the first GRACE ms show the strip; the banner comes only if the PC is still silent after that (draw again at GRACE).
    if (m.banner && Date.now() - bootAt < GRACE) { m = { banner: false }; clearTimeout(graceT); graceT = setTimeout(draw, GRACE - (Date.now() - bootAt) + 20); }
    var s = (home ? 1 : 0) + '|' + (m.banner ? m.level + m.title : '');
    if (s === sig) return; sig = s;
    b.hidden = !home;
    b.dataset.level = m.banner ? m.level : 'ok';
    // BLITZ is hidden (owner 2026-11-15): the NQ page is Zlarior and ATLAS (night-feedsB 2026-11-18, was "The three NQ bots")
    b.querySelector('.zn-nq-t').textContent = m.banner ? m.title : 'Zlarior and ATLAS on one page';
    b.querySelector('.zn-nq-x').textContent = m.banner ? m.text : 'Status, drawdown left, today, the last trades.';
    b.querySelector('.zn-nq-a').setAttribute('aria-label', m.banner ? 'Open the new NQ page: how to bring reporting back' : 'Open the new NQ page');
  }
  window.ZenithNQ = { model: model, ageWords: ageWords, draw: draw, FRESH_S: FRESH_S };
  if (typeof document === 'undefined' || !document.getElementById) return;
  var t = 0, soon = function () { clearTimeout(t); t = setTimeout(draw, 120); };
  window.addEventListener('hashchange', soon);
  var pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') new MutationObserver(soon).observe(pg, { childList: true });
  setInterval(draw, 60000);
  // at once, not 120 ms later: a strip that lands above a Home already on screen pushes the whole page down (a 0.2 layout shift, 2026-11-18)
  draw();
})();
