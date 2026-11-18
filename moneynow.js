// Zenith "Money now" (2026-11-04): the top card of Home. Classic script on the main page's VIEWS and POLISH.model() + moneynowcore.js
// (window.MoneyNow, the same renderer the PC dashboard uses). It sits inside the greeting box (.pl-hi) right after the date line and ahead
// of the Today hero, so Home's child order stays (greeting, status bar, account cards ...). Read-only: it only displays published fields.
(function () {
  'use strict';
  if (typeof VIEWS === 'undefined' || !window.MoneyNow) return;
  const MN = window.MoneyNow;
  const model = () => { try { return (window.POLISH && window.POLISH.model && window.POLISH.model()) || {}; } catch (e) { return {}; } };
  function mount() {
    const hi = document.querySelector('#page > .pl-home > .pl-hi');
    if (!hi) return;
    MN.css();
    const html = MN.html(model(), { where: 'phone' });
    const old = hi.querySelector(':scope > #mnCard');
    if (old && old.__h === html) return;
    const t = document.createElement('template');
    t.innerHTML = html;
    const card = t.content.firstElementChild;
    if (!card) return;
    card.__h = html;
    if (old) old.replaceWith(card);
    else hi.insertBefore(card, hi.children[2] || null);
  }
  const t0 = VIEWS.today;
  if (t0 && !t0.__mn) {
    const w = function (el) {
      const out = t0.apply(this, arguments);
      try { mount(); } catch (e) { console.warn('money now', e); }
      return out;
    };
    Object.keys(t0).forEach((k) => { w[k] = t0[k]; });
    w.__mn = true;
    VIEWS.today = w;
  }
  // Home redraws itself on live data: put the card back if a redraw took it away
  let q = 0;
  const soon = () => { if (!q) q = requestAnimationFrame(() => { q = 0; try { mount(); } catch (e) { console.warn('money now', e); } }); };
  const pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') {
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.target.closest && m.target.closest('#mnCard')) continue;
        for (const n of m.addedNodes) if (n.nodeType === 1 && n.id !== 'mnCard' && !(n.closest && n.closest('#mnCard'))) { soon(); return; }
      }
    }).observe(pg, { childList: true, subtree: true });
  }
  window.ZENITH_MONEYNOW = { version: 1, mount };
  soon();
})();
