// Zenith "Today's session" (2026-11-04): the card of Home right under Money now. Classic script on the main page's VIEWS and POLISH.model() +
// sessioncore.js (window.SessionDay). It sits inside the greeting box (.pl-hi) right after #mnCard, so Home's child order stays. Read-only: it only
// displays published fields and the clock; it ticks its countdown once a second and redraws itself when the window changes.
(function () {
  'use strict';
  if (typeof VIEWS === 'undefined' || !window.SessionDay) return;
  const SD = window.SessionDay;
  const model = () => { try { return (window.POLISH && window.POLISH.model && window.POLISH.model()) || {}; } catch (e) { return {}; } };
  function mount() {
    const hi = document.querySelector('#page > .pl-home > .pl-hi');
    if (!hi) return;
    SD.css();
    const html = SD.html(model(), { go: (p) => `data-go="${p}"` });
    const old = hi.querySelector(':scope > #sdCard');
    if (old && old.__h === html) return;
    const t = document.createElement('template');
    t.innerHTML = html;
    const card = t.content.firstElementChild;
    if (!card) return;
    card.__h = html;
    if (old) old.replaceWith(card);
    else { const mn = hi.querySelector(':scope > #mnCard'); if (mn) mn.after(card); else hi.insertBefore(card, hi.children[2] || null); }
  }
  const t0 = VIEWS.today;
  if (t0 && !t0.__sd) {
    const w = function (el) {
      const out = t0.apply(this, arguments);
      try { mount(); } catch (e) { console.warn('session day', e); }
      return out;
    };
    Object.keys(t0).forEach((k) => { w[k] = t0[k]; });
    w.__sd = true;
    VIEWS.today = w;
  }
  // Home redraws itself on live data (and Money now re-mounts): put the card back if a redraw took it away
  let q = 0;
  const soon = () => { if (!q) q = requestAnimationFrame(() => { q = 0; try { mount(); } catch (e) { console.warn('session day', e); } }); };
  const pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') {
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.target.closest && m.target.closest('#sdCard')) continue;
        for (const n of m.addedNodes) if (n.nodeType === 1 && n.id !== 'sdCard' && !(n.closest && n.closest('#sdCard'))) { soon(); return; }
      }
    }).observe(pg, { childList: true, subtree: true });
  }
  // the countdown ticks every second; the whole card is checked every 10 s (the window can change)
  let n = 0;
  setInterval(() => {
    if (document.hidden) return;
    if (!document.getElementById('sdCard')) return;
    n++;
    if (n % 10 === 0) { try { mount(); } catch (e) { /* next time */ } }
    SD.tick(document.getElementById('sdCard'), model().now);
  }, 1000);
  window.ZENITH_SESSIONDAY = { version: 1, mount };
  soon();
})();
