// TICKS (2026-11-17): the tick boxes of business/security.html and business/schedule.html. Classic script, read only: it keeps which
// boxes are ticked under ONE localStorage key (the script tag's data-key), wrapped in try/catch, this phone only. It never reads an
// input's text (the pages have none), never fetches, never sends. Counts go through textContent. window.TICKS.ready() is the test hook.
(function () {
  'use strict';
  const me = document.currentScript;
  const KEY = (me && me.dataset.key) || 'business.ticks.v1';
  let ready = false;
  window.TICKS = { ready: () => ready, key: KEY };
  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* private window: ticks just do not stay */ } }

  function count() {
    const all = document.querySelectorAll('input[type=checkbox][data-k]');
    let done = 0;
    all.forEach((b) => { if (b.checked) done += 1; });
    document.querySelectorAll('[data-count]').forEach((pill) => {
      const box = pill.closest('section');
      const bs = box ? box.querySelectorAll('input[type=checkbox][data-k]') : [];
      let n = 0; bs.forEach((b) => { if (b.checked) n += 1; });
      pill.textContent = n + ' of ' + bs.length;
      pill.className = 'pill' + (bs.length && n === bs.length ? ' ok' : '');
    });
    const st = document.getElementById('status');
    if (st && st.dataset.keep !== '1') st.textContent = done === all.length && all.length ? 'All ' + all.length + ' done. Well done.' : done + ' of ' + all.length + ' done. Ticks stay on this phone.';
  }

  function start() {
    const t = load();
    document.querySelectorAll('input[type=checkbox][data-k]').forEach((b) => {
      const k = b.dataset.k;
      b.checked = !!t[k];
      b.addEventListener('change', () => { t[k] = b.checked; save(t); count(); });
    });
    count();
    ready = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
