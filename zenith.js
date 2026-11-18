// Zenith shell (2026-11-03 day, owner: "make everything way higher quality, 3D UI effects, every dashboard should have more",
// "everything more organized for each dashboard, should look like a maid swept", "higher quality / futuristic").
// Loaded LAST (after pro.js, before embed.js). Classic script on the main page's helpers (GROUPS, PAGES, DETAIL, PAGE, VIEWS,
// render, groupOf, titleOf, store, esc, segHTML, onSeg) and on zenithcore.js (window.ZenithFX). Read-only: never fetches,
// arms, routes or changes the bot.
//   where am I   one header on every page: the breadcrumb (tab > section) over the page title; a page's own hero that only
//                repeated the title keeps its description and loses the copy (no "Performance / ZLARIOR · RESULTS Performance")
//   money first  Home's greeting carries today's real $ across every account, this month's $ and the 3D equity "energy
//                ribbon" of the accounts' real days (statuscore's account days, the same numbers as the cards)
//   motion       View Transitions between pages (a fade + a small slide toward the tab you went to), the CSS entrance as the
//                fallback; numbers count to their new value when the live board changes; glass cards with an edge light and a
//                small 3D tilt under the finger / pointer
//   quality      the shared key 'jfx' (Jarvis, the OLYMPUS apps): off = still, low = no tilt, no glow pass; reduced motion = still
//   themes       ZenithFX.applyTokens is the one place tokens are written; an Olympus theme ('olympus.theme', Olympus.onTheme)
//                maps onto it
(function () {
  'use strict';
  const Z = window.ZenithFX;
  if (!Z || typeof VIEWS === 'undefined' || typeof PAGES === 'undefined' || typeof GROUPS === 'undefined') return;
  const R = document.documentElement;
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const BOT = { lit: 1, atlas: 1, blitz: 1 };
  const ORD = ['today', 'lit', 'atlas', 'blitz', 'money', 'system'];
  window.ZENITH = { version: 1 };
  Z.css();
  Z.use3d(() => (typeof fxPref === 'function' ? fxPref() !== 'off' : true));     // Settings > 3D effects (off under automation)
  R.dataset.zn = 'on';

  // ------------------------------------------------------------------ where am I: breadcrumb + one header
  const txt = (e) => (e && e.textContent ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  // the pages whose group is no tab any more (Live View and the Holodeck kept the old "chart" group): they are Home's quick
  // tiles, so they belong to Home (the crumb and the lit tab; their routes and full-screen layout stay as they are)
  const HOME_TILES = new Set(['liveview', 'holo', 'mission', 'mind']);
  const tabOf = (p) => { const g = groupOf(p); return GROUPS.some((x) => x.id === g) ? g : HOME_TILES.has(p) ? 'today' : 'system'; };
  function trail() {
    const p = typeof PAGE !== 'undefined' ? PAGE : 'today', g = tabOf(p), G = GROUPS.find((x) => x.id === g);
    const title = txt(document.getElementById('title'));
    const out = [];
    if (G) out.push(G.label);
    if (BOT[g]) { const s = txt(document.querySelector('#sub .zl-seg button.on')); if (s) out.push(s); }
    if (typeof DETAIL !== 'undefined' && DETAIL[p] && PAGES[DETAIL[p].back]) out.push(PAGES[DETAIL[p].back].label);
    return out.filter((x, i) => x && x !== title && x !== out[i - 1]);
  }
  // a bot tab's main page was titled with the bot's name, which the tab bar and the account card already say: the title is
  // the open chip (Overview) or section instead, and the crumb says the bot (ZLARIOR › TODAY / Overview)
  function botTitle() {
    const p = typeof PAGE !== 'undefined' ? PAGE : '', g = tabOf(p), G = GROUPS.find((x) => x.id === g), t = document.getElementById('title');
    if (!BOT[g] || !G || !t || txt(t) !== G.label) return;
    const chip = txt(document.querySelector('#sub .zl-chips button.on')), seg = txt(document.querySelector('#sub .zl-seg button.on'));
    if (chip || seg) t.textContent = chip || seg;
  }
  // a page outside the tabs' groups lights the tab it belongs to (polish.js slides its pill there)
  function litTab() {
    const T = document.getElementById('tabs'); if (!T || T.querySelector('a.on')) return;
    const a = T.querySelector(`a[data-t="${tabOf(typeof PAGE !== 'undefined' ? PAGE : 'today')}"]`);
    if (a) { a.classList.add('on'); if (window.POLISH && window.POLISH.tabInd) window.POLISH.tabInd(); }
  }
  function crumb() {
    const c = document.getElementById('crumb'); if (!c) return;
    botTitle(); litTab();
    const T = trail(), html = T.map((t, i) => (i ? '<i class="zn-sep" aria-hidden="true">›</i>' : '') + `<span>${esc(t)}</span>`).join('');
    if (c.innerHTML === html) return;                 // (index.html's route() writes its own one-word crumb first)
    c.setAttribute('aria-label', 'You are in');
    c.innerHTML = html;
    c.classList.add('zn-crumb');
  }
  // a page hero whose title only repeats the header: keep its description and its right side, drop the copy
  function heroes(el) {
    const title = txt(document.getElementById('title')).toLowerCase();
    el.querySelectorAll(':scope > .hero, :scope > div > .hero:first-child').forEach((h) => {
      const h2 = h.querySelector('h2');
      h.classList.toggle('zn-hdup', !!h2 && txt(h2).toLowerCase() === title);
    });
  }

  // ------------------------------------------------------------------ money first: the greeting's money line + the ribbon
  const money = (v) => (okN(v) ? (typeof susd === 'function' ? susd(Math.round(v)) : (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en-US')) : '—');
  function accts() {
    try {
      const M = window.POLISH && window.POLISH.model ? window.POLISH.model() : null;
      return M && M.board && window.MissionUI ? (window.MissionUI.accounts(M) || []).filter((a) => a && !a.placeholder) : [];
    } catch (e) { return []; }
  }
  // an account's closed real days as [day, $] (statuscore's account days: [day, usd] pairs or { day, usd })
  const etDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  function dayPairs(A) {
    const out = [];
    for (const d of (A && A.days) || []) {
      const day = Array.isArray(d) ? String(d[0]) : String((d || {}).day || (d || {}).d || '');
      const v = Array.isArray(d) ? +d[1] : +(d || {}).usd;
      if (day && okN(v)) out.push([day, v]);
    }
    return out;
  }
  // a ribbon's points: 0, then the running total day by day, today's live $ last unless the days already hold today
  function curveOf(byDay, today) {
    const td = etDay();
    if (okN(today) && !byDay.has(td)) byDay.set(td, today);
    const days = [...byDay.keys()].sort();
    let run = 0;
    return { days, curve: [0].concat(days.map((d) => (run += byDay.get(d)))), ym: td.slice(0, 7) };
  }
  function moneyModel() {
    const As = accts(); if (!As.length) return null;
    const byDay = new Map();
    let today = null, total = null;
    for (const A of As) {
      if (okN(A.today)) today = (today || 0) + A.today;
      if (okN(A.profit)) total = (total || 0) + A.profit;
      for (const [day, v] of dayPairs(A)) byDay.set(day, (byDay.get(day) || 0) + v);
    }
    // fewer than 2 closed days: this week's days from the board's progress (the same fallback as the cards' sparklines)
    if (byDay.size < 2) {
      try {
        const P = (window.POLISH.model().board || {}).progress || {};
        Object.keys(P).forEach((k) => ((P[k] || {}).week || {}).days && P[k].week.days.forEach((d) => {
          if (d && !d.future && okN(+d.usd) && (d.day || d.date)) byDay.set(String(d.day || d.date), (byDay.get(String(d.day || d.date)) || 0) + +d.usd);
        }));
      } catch (e) { /* no week yet */ }
    }
    const { days, curve, ym } = curveOf(byDay, today);
    const month = days.length ? days.filter((d) => d.slice(0, 7) === ym).reduce((s, d) => s + byDay.get(d), 0) : null;
    return { today, total, month, curve, n: days.length, accounts: As.length };
  }
  let HI = null, ribSig = '';
  function greeting(el) {
    const hi = el.querySelector('.pl-home > .pl-hi'); if (!hi) return;
    const M = moneyModel();
    if (!M) { if (HI) HI.remove(); return; }
    if (!HI) { HI = document.createElement('div'); HI.className = 'zn-hi'; }
    if (HI.parentNode !== hi) hi.appendChild(HI);           // Home redraws itself on live data: the same box (and ribbon) moves in
    const cls = (v) => (okN(v) && v > 0 ? 'up' : okN(v) && v < 0 ? 'dn' : '');
    const stats = [['today', 'Today', M.today], ['month', 'This month', M.month], ['total', 'Eval P&L', M.total]];
    const head = stats.map(([k, l, v]) => `<span class="zn-m ${k}"><em>${l}</em><b class="${cls(v)}" data-zn-num="hi-${k}">${money(v)}</b></span>`).join('');
    let wrap = HI.querySelector(':scope > .zn-money');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'zn-money'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Real money'); HI.prepend(wrap); }
    if (wrap.__h !== head) { wrap.__h = head; wrap.innerHTML = head; }
    let rb = HI.querySelector(':scope > .zn-rib');
    if (!rb) { rb = document.createElement('div'); rb.className = 'zn-rib'; rb.setAttribute('role', 'img'); HI.appendChild(rb); }
    rb.setAttribute('aria-label', M.n ? `Real P&L of every account over ${M.n} trading days: ${money(M.curve[M.curve.length - 1])}` : 'No closed real day yet');
    let note = rb.querySelector('.zn-rib-note');
    if (M.n < 2) { if (!note) { note = document.createElement('span'); note.className = 'zn-rib-note'; rb.appendChild(note); } note.textContent = 'The ribbon grows with every real trading day'; }
    else if (note) note.remove();
    // the once-a-day intro is on screen: the ribbon waits for it (the first seconds belong to the intro and the data)
    if (document.getElementById('splash')) { clearTimeout(greeting.t); greeting.t = setTimeout(soon, 700); return; }
    const sig = M.curve.join(',') + '|' + Z.quality();
    if (sig !== ribSig || !rb.__zr) { ribSig = sig; Z.ribbon(rb, M.curve.length >= 2 ? M.curve : [0, 0], { top: 52 }); }
  }

  // each bot's Today: its own ribbon under its account card, in its colour: real $ so far and the $ a month at that pace
  function botRibbon(el) {
    const box = el.querySelector(':scope > .pl-bot'), card = box && box.querySelector('.su-acct[data-bot]');
    if (!card || box.querySelector('.zn-botrib')) return;
    const A = accts().find((a) => a.key === card.dataset.bot); if (!A) return;
    const { days, curve } = curveOf(new Map(dayPairs(A)), A.today);
    if (days.length < 2) return;                                  // nothing to draw yet: no empty box
    const net = curve[curve.length - 1], pm = net / (days.length / 21);
    const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
    const w = document.createElement('div');
    w.className = 'zn-botrib';
    w.innerHTML = `<div class="zn-money"><span class="zn-m"><em>Real P&L · ${days.length} days</em><b class="${cls(net)}" data-zn-num="bot-net">${money(net)}</b></span>`
      + `<span class="zn-m"><em>$ a month at this pace</em><b class="${cls(pm)}" data-zn-num="bot-pm">${money(pm)}</b></span></div><div class="zn-rib" role="img" aria-label="${esc(SUname(A))} real P&L by day"></div>`;
    card.after(w);
    Z.ribbon(w.querySelector('.zn-rib'), curve, { top: 50, color: A.color || undefined });
  }
  const SUname = (A) => (window.StatusUI && window.StatusUI.NAME && window.StatusUI.NAME[A.key]) || A.name || A.key;

  // ------------------------------------------------------------------ numbers that count to their new value
  const LAST = new Map();
  function counters(el) {
    el.querySelectorAll('[data-zn-num], .su-acct[data-bot] .su-big b, .su-acct[data-bot] .su-today b').forEach((e) => {
      const card = e.closest('.su-acct');
      const key = e.dataset.znNum || (card ? card.dataset.bot + (e.closest('.su-today') ? ':today' : ':big') : '');
      if (!key || e.classList.contains('zn-ticking')) return;
      const p = Z.parse(e.textContent); if (!p) return;
      const k = (typeof PAGE !== 'undefined' ? PAGE : '') + ':' + key, prev = LAST.get(k);
      LAST.set(k, p.v);
      if (okN(prev) && prev !== p.v) Z.count(e, prev);
    });
  }

  // ------------------------------------------------------------------ Settings: the shared 3D quality
  const QL = [['ultra', 'Ultra'], ['high', 'High'], ['low', 'Low'], ['off', 'Off']];
  function settings(el) {
    if (el.querySelector('#znQ')) return;
    const row = `<div class="row zn-set"><span><b>3D quality</b><span class="small mut">One setting for the cards' light and tilt, the Home ribbon, Jarvis and every OLYMPUS app (the same key) · Low: no tilt, no glow pass · Off: still. Reduced motion on the phone always wins.</span></span>
      ${segHTML('znQ', QL, Z.quality(), 'sm')}</div>`;
    const at = el.querySelector('#sFx') && el.querySelector('#sFx').closest('.row');     // inside the 3D effects card: one place for 3D
    if (at) at.insertAdjacentHTML('afterend', row);
    else el.insertAdjacentHTML('beforeend', `<div class="card"><div class="card-h"><h3>3D quality</h3></div>${row}</div>`);
    onSeg('znQ', (v) => { Z.setQuality(v); ribSig = ''; R.classList.toggle('zn-vt', vt()); });
  }

  // ------------------------------------------------------------------ after every draw (the page's own redraws too)
  function post() {
    const el = document.getElementById('page'); if (!el) return;
    try { crumb(); heroes(el); } catch (e) { console.warn('zenith header', e); }
    try { if (PAGE === 'today') greeting(el); else botRibbon(el); } catch (e) { console.warn('zenith home', e); }
    try { counters(el); } catch (e) { /* optional */ }
    try { if (PAGE === 'settings') settings(el); } catch (e) { /* optional */ }
  }
  let q = 0;
  const soon = () => { if (!q) q = requestAnimationFrame(() => { q = 0; post(); }); };
  const pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.target.closest && m.target.closest('.zn-hi, .zn-set, .zn-botrib')) continue;        // this file's own boxes
      for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('zn-hi') && !n.classList.contains('zn-botrib')) { soon(); return; }
    }
  }).observe(pg, { childList: true, subtree: true });
  const sub = document.getElementById('sub');
  if (sub && typeof MutationObserver !== 'undefined') new MutationObserver(soon).observe(sub, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('hashchange', soon);

  // ------------------------------------------------------------------ page transitions
  const vt = () => Z.canVT();
  R.classList.toggle('zn-vt', vt());
  const r0 = typeof render === 'function' ? render : null;
  let lastPage = typeof PAGE !== 'undefined' ? PAGE : null, lastG = null, busy = false;
  const FULL3D = new Set(['liveview', 'holo']);
  if (r0 && !r0.__zn) {
    render = function (soft) { // eslint-disable-line no-global-assign
      const self = this, args = arguments, p = typeof PAGE !== 'undefined' ? PAGE : null, g = groupOf(p);
      const moved = !soft && p !== lastPage && lastPage != null;
      const a = ORD.indexOf(lastG), b = ORD.indexOf(g), prevPage = lastPage;
      lastPage = p; lastG = g;
      R.classList.toggle('zn-vt', vt());
      // full-screen 3D pages (their own WebGL scene) switch at once: a View Transition would snapshot a live canvas
      const heavy = FULL3D.has(p) || FULL3D.has(prevPage);
      if (!moved || !vt() || heavy || busy || document.hidden) { const out = r0.apply(self, args); post(); return out; }
      R.dataset.znDir = a >= 0 && b >= 0 && a !== b ? (b > a ? 'r' : 'l') : 'u';
      busy = true;                                            // a tap during the transition draws at once (no queue)
      Z.transition(() => { r0.apply(self, args); post(); }).then(() => { setTimeout(() => { busy = false; }, 340); });
      return undefined;
    };
    render.__zn = true;
  }

  // ------------------------------------------------------------------ glass + tilt, themes, quality
  const CARDS = '.card, .su-acct, .cl-card, .cl-row, .pl-now, .pl-quick a, .pr-card, .sc-card, .bl-card, .rc-card, .mn-card, .dk-card, .mc-card, .stat, .tile';
  Z.glass(document.getElementById('page') || document.body, CARDS, { deg: 4 });
  Z.followOlympus();
  addEventListener('storage', (e) => { if (e.key === 'jfx') { R.classList.toggle('zn-vt', vt()); ribSig = ''; soon(); } });
  // More > All features: today's features, marked new (the same list the other modules add to)
  (function whatsNew() {
    const FL = window.Features && Array.isArray(window.Features.list) ? window.Features.list : null;
    const G = 'Futuristic & organized (Nov 3)';
    if (!FL || FL.some((f) => f.group === G)) return;
    [['today', 'Money first on Home', 'Today\'s real $ across every account, this month\'s $ and the eval P&L over a 3D energy ribbon of the real days'],
      ['lit', 'A ribbon per bot', 'Each bot\'s Today: its real $ so far and the $ a month at that pace, over its own ribbon in its colour'],
      ['lit', 'Where am I', 'Every page: the tab and section over the title (ZLARIOR › RESULTS / Performance); no title said twice'],
      ['today', 'Glass and light', 'Cards light their edge where the finger is and lean a little in 3D; numbers count to their new value'],
      ['system', 'Smooth pages', 'Pages change with a View Transition (a fade and a small slide toward the tab), never sideways scroll'],
      ['settings', 'One 3D quality', 'Settings > 3D effects > 3D quality: Ultra / High / Low / Off, shared with Jarvis and every OLYMPUS app'],
    ].reverse().forEach(([go, name, line]) => FL.unshift({ group: G, name, line: line + '.', go, isNew: true }));
    window.Features.count = FL.length; window.Features.newCount = FL.filter((f) => f.isNew).length;
  })();
  window.ZENITH.post = post;
  window.ZENITH.trail = trail;
  post();
})();
