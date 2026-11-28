// "📸 Make Insta card" (day-sharecard 2026-11-27): a classic script for the NQ home + Accounts pages. It shows the button ONLY when the PC's
// newest post is from today (ET) and today's $ across the real accounts is above $0 (a red day: no automatic button; share.html still works).
// Reads the post the page already fetched (window.NQ_FEED, else PC_FEED.fetchLatest); sends nothing, stores nothing.
(function () {
  'use strict';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  function etDay(t) {
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
      return f.format(new Date(t * 1000));
    } catch (e) { return ''; }
  }
  /** today's $ from a post (pure; tests): the accounts' pnl.today summed (BLITZ never), else the core day_pnl; null when the post is not today's */
  function todayUsd(lite, nowS) {
    if (!isObj(lite) || !num(+lite.t)) return null;
    const now = num(nowS) || Date.now() / 1000;
    if (etDay(+lite.t) !== etDay(now) || now - +lite.t > 6 * 3600) return null;
    const acc = (Array.isArray(lite.accounts) ? lite.accounts : []).filter((a) => isObj(a) && !/blitz/i.test(String(a.name || a.id || '')));
    const vals = acc.map((a) => num(isObj(a.pnl) ? a.pnl.today : null)).filter((v) => v !== null);
    if (vals.length) return vals.reduce((s, v) => s + v, 0);
    return num(lite.day_pnl);
  }
  function place(btn) {
    const door = document.getElementById('liveDoor'), after = (door && door.closest && door.closest('.nq-doors')) || door || document.querySelector('.ac-top') || document.querySelector('main header');
    if (after && after.parentNode) after.parentNode.insertBefore(btn, after.nextSibling); else (document.querySelector('main') || document.body).prepend(btn);
  }
  function show(usd) {
    if (document.getElementById('instaBtn')) { document.getElementById('instaBtn').hidden = !(usd > 0); return; }
    if (!(usd > 0)) return;
    const a = document.createElement('a');
    a.id = 'instaBtn'; a.className = 'insta-btn'; a.href = 'share.html';
    a.textContent = `📸 Make Insta card · +$${Math.round(usd).toLocaleString('en-US')} today`;
    a.setAttribute('style', 'display:flex;align-items:center;justify-content:center;min-height:48px;margin:8px 0;padding:0 14px;border-radius:14px;'
      + 'font-weight:800;font-size:15px;text-decoration:none;color:#120d00;background:linear-gradient(180deg,#f6d36e,#f1c14b);'
      + 'box-shadow:0 0 22px rgba(241,193,75,.35);border:1px solid #f1c14b');
    place(a);
  }
  function check(lite) { try { show(todayUsd(lite)); } catch (e) { /* never breaks the page */ } }
  function boot() {
    const F = window.NQ_FEED;
    if (F && F.on) { try { F.on((l) => check(l)); } catch (e) { /* below */ } }
    else if (window.PC_FEED && window.PC_FEED.fetchLatest) window.PC_FEED.fetchLatest({}).then(check).catch(() => {});
  }
  window.SHAREBTN = { todayUsd, check };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();
