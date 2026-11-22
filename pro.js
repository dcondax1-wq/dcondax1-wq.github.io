// Scorecard on the phone (2026-11-03; loaded by index.html with one <script defer> each after polish.js: procore.js, then
// this file; read-only: it never arms, routes or changes the bot).
//   #/pro/<part>   Zlarior > Results > Scorecard (clean.js chip) and More > Insight: score · pace · risk · playbook ·
//                  what if · tags (renderer procore.js, ProUI.page)
//   Home           one compact Scorecard card under the quick tiles (Zenith score, $ a trade, $ a month, the 50K's $ to go)
// Data: data.json trades (the live-settings backtest) + extras.trades (the swept level of each trade) + results.periods,
// the live board (blitz.js PhoneData.board: data.json / live.json), journal tags (hub.js, this device: le.jtags).
(function () {
  'use strict';
  if (typeof VIEWS === 'undefined' || typeof PAGES === 'undefined' || !window.ProUI) return;
  const PU = window.ProUI;
  const HD = () => (typeof D !== 'undefined' && D) || window.HOMEJ || null;
  const go = (id, arg) => `data-go="${esc(id)}"${arg ? ` data-arg="${esc(arg)}"` : ''}`;
  const board = () => { try { return window.PhoneData && window.PhoneData.board ? window.PhoneData.board() : ((HD() || {}).board || null); } catch (e) { return null; } };
  // the swept level of each backtest trade (extras.trades, oldest first) joined on day + R
  let LVK = null, LVD = null;
  function withLevels(h) {
    const T = Array.isArray(h.trades) ? h.trades : [];
    if (LVD === h && LVK) return LVK;
    const x = h.extras, map = new Map();
    if (x && Array.isArray(x.trades) && Array.isArray(x.tcols)) {
      const iD = x.tcols.indexOf('day'), iR = x.tcols.indexOf('r'), iL = x.tcols.indexOf('lv');
      if (iL >= 0) for (const r of x.trades) if (r) map.set(`${r[iD]}|${(+r[iR]).toFixed(3)}`, r[iL] || []);
    }
    LVK = T.map((t) => { const lv = map.get(`${t.day}|${(+t.r).toFixed(3)}`); return lv ? { ...t, lv } : t; });
    LVD = h;
    return LVK;
  }
  function model() {
    const h = HD() || {}, p = PU.pref(), B = board();
    return PU.model({ now: Date.now() / 1000, span: p.span, mult: p.mult, trades: withLevels(h), real: (B && B.trades) || [], periods: (h.results || {}).periods || {},
      board: B, tags: (typeof store !== 'undefined' && store.get('jtags', {})) || {} });
  }
  window.ProData = { model };
  const galOn = () => typeof fxOn === 'function' && fxOn() && typeof fx3d === 'function';

  VIEWS.pro = function (el) {
    const part = typeof ARG !== 'undefined' && PU.PARTS.some((x) => x[0] === ARG) ? ARG : 'score';
    const draw = () => {
      const M = model();
      const gal = part === 'score' && M.span !== 'real' && M.T.length && galOn() ? `<section class="card fx-card"><div class="card-h"><h3>Trade galaxy · ${M.T.length} trades</h3><span class="meta">drag to turn · tap a star</span></div><div class="fx3d galaxy" id="prGal"></div></section>` : '';
      el.innerHTML = PU.page(M, part, { go, galaxy: gal });
      if (gal) {
        const ids = new Set(M.T.map((t) => t.id));
        const rows = ((HD() || {}).trades || []).filter((t) => ids.has(PU.tid(t)));
        try { fx3d('pro-galaxy', el.querySelector('#prGal'), 'galaxy', rows, { onPick: (row) => row && typeof openSheet === 'function' && openSheet(row) }); } catch (e) { /* 3D is optional */ }
      }
      PU.wire(el, () => { if (typeof render === 'function') render(true); else draw(); }, { model });
    };
    try { draw(); } catch (e) { console.warn('pro', e); el.innerHTML = `<div class="card"><b>Could not draw this page.</b><p class="mut">${esc(e.message)}</p></div>`; }
    document.title = 'Scorecard · Zenith';
  };
  PAGES.pro = { id: 'pro', label: 'Scorecard', icon: 'results', desc: 'Zenith score, expectancy in $, eval pace, drawdown vs the MFFU floor, playbook, what-if sizing, $ by tag', group: 'lit' };
  if (typeof SCENE !== 'undefined') SCENE.pro = 'results';
  if (typeof ALIAS !== 'undefined') Object.assign(ALIAS, { scorecard: 'pro', score: 'pro', expectancy: 'pro', playbook: 'pro', pace: 'pro', sizing: 'pro', underwater: 'pro', drawdown: 'pro', tags: 'pro' });
  // the Zlarior tab group holds it (clean.js: Results > Scorecard chip); the old GROUPS list gets it too, for the PC-style nav
  const G = typeof GROUPS !== 'undefined' ? (GROUPS.find((g) => g.id === 'lit') || GROUPS.find((g) => g.id === 'trades')) : null;
  if (G) { PAGES.pro.group = G.id; if (!G.pages.some((p) => p[0] === 'pro')) G.pages.push(['pro', 'Scorecard', 'results', PAGES.pro.desc]); }

  // ------------------------------------------------------------------ Home: the compact card under the quick tiles
  const hasD = () => typeof D !== 'undefined' && !!D;
  const ph = (b, em, wait) => `<button type="button" class="pr-home${wait ? ' pr-home-wait' : ' pr-home-none'}" ${go('pro')} aria-label="Scorecard: ${esc(b)}">`
    + '<span class="pr-home-ring" aria-hidden="true" style="display:block;width:68px;height:68px;border-radius:50%;border:7px solid rgba(148,163,184,.18)"></span>'
    + `<span class="pr-home-t"><span class="pr-eye">Scorecard · H2 check</span><b>${esc(b)}</b><em>${esc(em)}</em></span><span class="pr-home-go" aria-hidden="true">›</span></button>`;
  function homeHTML() {
    if (!hasD()) return ph('Loading the trades…', 'expectancy, risk, playbook, what-if sizing', true);
    return PU.home(model(), { go }) || ph('No scorecard yet', 'it needs at least 5 trades in the span; tap for the full page', false);
  }
  function fillLater(box) {
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (!box.isConnected || n > 240) { clearInterval(t); return; }      // left Home, or 2 min without data.json (offline: the tap still works)
      if (!hasD()) return;
      clearInterval(t);
      try { box.innerHTML = homeHTML(); } catch (e) { console.warn('pro home', e); }
    }, 500);
  }
  const h0 = VIEWS.today;
  if (h0 && !h0.__pro) {
    const w = function (el) {
      h0.apply(this, arguments);
      try {
        el.querySelectorAll('.pr-homebox').forEach((x) => x.remove());
        // fix 2026-11-21 (test_zenith_pro red): Home is drawn from the small home.json first and main.js does NOT redraw it when
        // data.json is the same build (dogfood 2026-11-20, no layout shift), so a card that needs the trades never came. Now a
        // placeholder of the same height stands in and is filled in place once data.json is there (no shift); no trades -> an
        // honest "no scorecard yet" line, never an empty slot.
        const box = document.createElement('div'); box.className = 'pr-homebox'; box.innerHTML = homeHTML();
        const q = el.querySelector('.pl-home > .pl-quick');
        if (q) q.after(box); else { const h = el.querySelector(':scope > .pl-home'); if (h) h.appendChild(box); else el.prepend(box); }
        if (!hasD()) fillLater(box);
      } catch (e) { console.warn('pro home', e); }
    };
    Object.keys(h0).forEach((k) => { w[k] = h0[k]; });
    w.__pro = true;
    VIEWS.today = w;
  }
  if (typeof nav === 'function' && typeof route === 'function' && typeof PAGE !== 'undefined' && PAGE) { try { route(); } catch (e) { /* first route runs later */ } }
})();
