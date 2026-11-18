/* Standalone Olympus command-center controls. Atlas owns rendering and routes. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const apps = (window.OLYMPUS_APPS_LIST || []).filter((app) => app && /^[a-z0-9-]+$/.test(app.id));
  const arenaTotal = $('#arenaTotal');
  const pinTotal = $('#pinTotal');
  const search = $('#query');

  if (arenaTotal && apps.length) arenaTotal.textContent = String(apps.length);

  function pinnedCount() {
    try {
      const saved = JSON.parse(localStorage.getItem('olympus.atlas.v1'));
      return Array.isArray(saved && saved.stars) ? saved.stars.length : 0;
    } catch (_) {
      return 0;
    }
  }

  function refreshOverview() {
    if (pinTotal) pinTotal.textContent = String(pinnedCount());
  }

  document.querySelectorAll('[data-focus-search]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('[data-filter="all"]')?.click();
    $('#deckTitle')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    window.setTimeout(() => search?.focus({ preventScroll: true }), 180);
  }));

  document.querySelectorAll('[data-jump-filter]').forEach((button) => button.addEventListener('click', () => {
    const target = document.querySelector(`[data-filter="${button.dataset.jumpFilter}"]`);
    if (!target) return;
    target.click();
    $('#deckTitle')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  document.addEventListener('click', (event) => {
    if (event.target.closest('.star')) window.setTimeout(refreshOverview);
  });
  window.addEventListener('pageshow', refreshOverview);
  refreshOverview();
})();
