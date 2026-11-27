/* NQ nav (night-nq-nav 2026-11-27): ONE line makes any NQ page part of the NQ app.
 *     <script src="nqnav.js?v=1" defer></script>          (pages in tools/web_public/nq/; it loads nqnav.css itself)
 * - The dock: Home, Live, Chart, Accounts, Order flow, Brain, PC health; the page you are on lit (gold icon, violet ink that slides between
 *   pages through the View Transitions API; older browsers get a short fade). A page may name its tab: <script ... data-tab="live">.
 *   A tab whose page is not there yet (orderflow.html, pchealth.html, chart.html during the sprint) uses its fallback or hides (HEAD probe,
 *   remembered in localStorage 'nqnav.have.v1').
 * - The PC pill (reads night-nq-speed's window.NQ_FEED when the page has nqfeed.js: one shared read; else ../pc_feed.js): "PC 4m · 2 armed" (the bot's own heartbeat age from the PC feed, ../pc_feed.js, BLITZ never counted). It rides the dock's
 *   top edge; any element with data-nq-pc-pill gets its own copy. Tap = a sheet: heartbeat, PC last looked, server, verdict, armed bots.
 *   The last real read is kept ('nqnav.pc.v1') so the pill has a number at once and offline; marked "saved" until a fresh read.
 * - Pull down at the top = refresh: the page gets a cancelable 'nq:refresh' event (detail.done(): call it when your data is back);
 *   nobody claims it = the page reloads. The pill refetches too.
 * - Haptics: navigator.vibrate where there is one, the iOS 18 switch tick elsewhere; a ripple + press on every tab.
 * - No service worker here (the lead wires NQ precache in ../sw.js: one cache on the origin).
 * - Install: Chrome's install prompt as a chip (once per 14 days, 'nqnav.inst.v1'); iPhone Safari: the Share > Add to Home Screen line in the
 *   sheet. Offline: a chip "Offline: the numbers are from your last visit" until the network is back (then a refresh).
 * Classic script, no markup from data (textContent), same-origin + the public status feed only, no keys, no ids. window.NQNAV for pages/tests. */
(function () {
  'use strict';
  var w = window, d = document;
  if (w.NQNAV) return;
  var me = d.currentScript;
  var base = (function () { try { return new w.URL('./', me && me.src ? me.src : w.location.href).href; } catch (e) { return ''; } })();
  var framed = (function () { try { return w.top !== w; } catch (e) { return true; } })();
  var reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var standalone = !!((w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || w.navigator.standalone);

  var I = {   // 24x24 stroke icons
    home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
    live: 'M12 12m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14',
    chart: 'M4 20h16M6 16l4-5 3 3 5-7M7 6v3M7 4.5v.5M17 13v4',
    accounts: 'M3 7h18v12H3zM3 11h18M7 15h4M16 4l-8 0',
    flow: 'M4 6h10M4 12h16M4 18h7M17 4l3 2-3 2M17 16l-3 2 3 2',
    brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V4z',
    pc: 'M3 5h18v11H3zM8 20h8M12 16v4M7 12l2-3 2 2 3-4 3 3'
  };
  // id, label, page, fallback (null = hide while the page is missing), pages that light this tab
  var TABS = [
    ['home', 'Home', 'index.html', null, ['', 'index.html', 'trading_home.html']],
    ['live', 'Live', 'live.html', null, ['live.html']],
    ['chart', 'Chart', 'chart.html', 'index.html#chartCard', ['chart.html']],
    ['accounts', 'Accounts', 'accounts.html', null, ['accounts.html']],
    ['flow', 'Flow', 'orderflow.html', null, ['orderflow.html']],
    ['brain', 'Brain', 'brain.html', null, ['brain.html']],
    ['pc', 'PC', 'pchealth.html', '../pc/index.html', ['pchealth.html']]
  ];
  var LS_PC = 'nqnav.pc.v1', LS_HAVE = 'nqnav.have.v1', LS_INST = 'nqnav.inst.v1', SS_ENTER = 'nqnav.enter';
  var S = { pills: [], lite: null, cached: false, fetching: null, installEvt: null, chipOff: null, hap: null, dock: null };

  function ls(k, v) { try { if (arguments.length > 1) { if (v == null) w.localStorage.removeItem(k); else w.localStorage.setItem(k, JSON.stringify(v)); return v; } return JSON.parse(w.localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(path) { var NS = 'http://www.w3.org/2000/svg', s = d.createElementNS(NS, 'svg'), p = d.createElementNS(NS, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', path); s.appendChild(p); return s; }
  function file() { var m = /([^\/]*)$/.exec(w.location.pathname || ''); return m ? m[1] : ''; }
  function activeId() {
    var t = me && me.getAttribute('data-tab'); if (t) return t;
    var f = file();
    for (var i = 0; i < TABS.length; i++) if (TABS[i][4].indexOf(f) >= 0) return TABS[i][0];
    return '';
  }

  // ---------- age + armed (pure; tests call these) ----------
  function ago(s) {
    if (s == null || !isFinite(s)) return '?';
    s = Math.max(0, Math.round(s));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 48 * 3600) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  }
  var NAMES = { lit: 'Zlarior 50K', atlas: 'ATLAS 25K', rapid: 'Rapid EOD 25K', rapid2: 'Rapid EOD #2', b25k_2: 'Zlarior 25K #2', of: 'Order flow' };   // engine/brain_glance ids
  function armedOf(lite) {
    var ar = lite && lite.ar, out = [];
    if (!ar || typeof ar !== 'object') return null;
    for (var k in ar) {
      if (!Object.prototype.hasOwnProperty.call(ar, k) || /blitz/i.test(k)) continue;   // BLITZ is hidden (paper)
      var v = ar[k]; if (v && v[1]) out.push(NAMES[k] || String(k).replace(/_/g, ' ').toUpperCase().slice(0, 14));
    }
    return out;
  }
  function state(lite, nowS) {
    var now = nowS || Date.now() / 1000;
    if (!lite || !isFinite(+lite.t)) return { lv: 'idle', text: 'PC …', age: null, armed: null };
    var age = now - (+lite.t), arm = armedOf(lite);
    var lv = age < 20 * 60 ? 'ok' : age < 60 * 60 ? 'warn' : 'bad';
    var text = 'PC ' + ago(age) + (arm ? ' · ' + arm.length + ' armed' : '');
    return { lv: lv, text: text, age: age, armed: arm, verdict: lite.pc_verdict && lite.pc_verdict.label ? String(lite.pc_verdict.label).slice(0, 40) : '',
      reporter: lite.reporter && isFinite(+lite.reporter.t) ? now - (+lite.reporter.t) : null, server: lite.reporter ? !!lite.reporter.server : null };
  }

  // ---------- the PC feed ----------
  function loadFeed() {
    if (w.PC_FEED) return Promise.resolve(w.PC_FEED);
    return new Promise(function (res) {
      var s = d.createElement('script'); s.src = base + '../pc_feed.js?v=n9'; s.async = true;
      s.onload = function () { res(w.PC_FEED || null); }; s.onerror = function () { res(null); };
      d.head.appendChild(s);
    });
  }
  function keep(lite, saved) {   // a real post (its own t) -> the pill's small copy
    if (!lite || !isFinite(+lite.t)) return;
    if (S.lite && +lite.t < S.lite.t) return;
    if (S.lite && +lite.t === S.lite.t && saved) return;
    S.lite = { t: +lite.t, ar: lite.ar || null, pc_verdict: lite.pc_verdict ? { label: lite.pc_verdict.label } : null,
      reporter: lite.reporter ? { t: lite.reporter.t, server: lite.reporter.server } : null };
    S.cached = !!saved; if (!saved) ls(LS_PC, S.lite);
  }
  function refreshPC(force) {   // night-nq-speed's window.NQ_FEED (one shared read per phone) when the page has it, else pc_feed itself
    if (S.fetching) return S.fetching;
    var F = w.NQ_FEED;
    var p = F && F.latest ? Promise.resolve(force && F.refresh ? F.refresh(true) : F.latest()).then(function (x) {
        var c = F.cached ? F.cached() : x, i = F.info ? F.info() : null;
        return c && i && i.src === 'cache' ? { saved: c } : c;   // the kept post, no fresh read: shown as "saved"
      })
      : loadFeed().then(function (P) { return P && P.fetchLatest ? P.fetchLatest({ feedUrl: base + '../status_feed.json' }) : null; });
    S.fetching = p.then(function (lite) { if (lite && lite.saved) keep(lite.saved, true); else keep(lite, false); paint(); return S.lite; }, function () { paint(); return null; })
      .then(function (v) { S.fetching = null; return v; });
    return S.fetching;
  }
  function paint() {
    var st = state(S.lite);
    for (var i = 0; i < S.pills.length; i++) {
      var p = S.pills[i];
      p.setAttribute('data-lv', st.lv);
      if (S.cached) p.setAttribute('data-old', '1'); else p.removeAttribute('data-old');
      p.querySelector('span').textContent = st.text;
      p.setAttribute('aria-label', st.text.replace('PC ', 'PC report ') + (S.cached ? ', saved from your last visit' : '') + '. Tap for details');
    }
  }
  function makePill() {
    var b = el('button', 'nqn-pill'); b.type = 'button';
    b.appendChild(el('i')); b.appendChild(el('span', null, 'PC …'));
    b.addEventListener('click', function () { tick(); openSheet(b); });
    S.pills.push(b); return b;
  }

  // ---------- the sheet ----------
  function row(box, k, v, cls) { var r = el('div', 'nqn-row'); r.appendChild(el('span', null, k)); var s = el('span', cls || null, v); r.appendChild(s); box.appendChild(r); }
  function openSheet(opener) {
    if (d.querySelector('.nqn-sheet')) return;
    var st = state(S.lite), scrim = el('div', 'nqn-scrim'), sh = el('div', 'nqn-sheet');
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'PC status');
    sh.appendChild(el('div', 'nqn-grab')); sh.appendChild(el('h2', null, 'PC status'));
    var lvCls = st.lv === 'ok' ? 'up' : st.lv === 'warn' ? 'warn' : st.lv === 'bad' ? 'bad' : null;
    row(sh, 'Bot heartbeat', st.age == null ? 'no report yet' : ago(st.age) + (st.age >= 60 ? ' ago' : ''), lvCls);
    if (st.reporter != null) row(sh, 'PC last looked', ago(st.reporter) + (st.reporter >= 60 ? ' ago' : ''));
    if (st.server != null) row(sh, 'Bot server', st.server ? 'answering' : 'not answering', st.server ? 'up' : 'bad');
    if (st.verdict) row(sh, 'Verdict', st.verdict);
    if (st.armed) row(sh, 'Armed', st.armed.length ? st.armed.join(', ') : 'none', st.armed.length ? 'up' : 'warn');
    if (S.cached) sh.appendChild(el('p', 'nqn-note', 'Saved from your last visit; a fresh read is on its way.'));
    if (st.lv === 'bad') sh.appendChild(el('p', 'nqn-note', 'Over an hour without a report: the PC or the bot may be off. PC health shows what to do.'));
    var btns = el('div', 'nqn-btns'), rf = el('button', 'nqn-btn gold', 'Refresh now'); rf.type = 'button';
    rf.addEventListener('click', function () { tick(); close(); doRefresh(true); });
    btns.appendChild(rf);
    var pcTab = tabHref('pc'); if (pcTab) { var a = el('a', 'nqn-btn', 'PC health ›'); a.href = pcTab; btns.appendChild(a); }
    if (S.installEvt) { var ib = el('button', 'nqn-btn', 'Install NQ app'); ib.type = 'button'; ib.addEventListener('click', function () { close(); install(); }); btns.appendChild(ib); }
    sh.appendChild(btns);
    if (!standalone && !S.installEvt && /iPhone|iPad|iPod/.test(w.navigator.userAgent || '')) sh.appendChild(el('p', 'nqn-note', 'App: tap Share, then "Add to Home Screen": NQ opens straight into this dashboard.'));
    function close() { scrim.remove(); sh.remove(); d.removeEventListener('keydown', key); try { opener && opener.focus(); } catch (e) { /* gone */ } }
    function key(e) { if (e.key === 'Escape') close(); }
    scrim.addEventListener('click', close); d.addEventListener('keydown', key);
    d.body.appendChild(scrim); d.body.appendChild(sh); rf.focus();
  }

  // ---------- haptics + press ----------
  function tick() {
    try { if (w.navigator.vibrate) { w.navigator.vibrate(8); return; } } catch (e) { /* no */ }
    try { if (!S.hap) { var l = el('label', 'nqn-hap'), c = el('input'); c.type = 'checkbox'; c.setAttribute('switch', ''); c.tabIndex = -1; l.setAttribute('aria-hidden', 'true'); l.appendChild(c); d.body.appendChild(l); S.hap = l; } S.hap.click(); } catch (e) { /* no */ }
  }
  function ripple(t, e) {
    if (reduce) return;
    var r = t.getBoundingClientRect(), z = Math.max(r.width, r.height), s = el('i', 'nqn-ripple');
    var x = (e && e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left - z / 2, y = (e && e.clientY != null ? e.clientY : r.top + r.height / 2) - r.top - z / 2;
    s.style.cssText = 'width:' + z + 'px;height:' + z + 'px;left:' + x + 'px;top:' + y + 'px';
    t.appendChild(s); setTimeout(function () { s.remove(); }, 520);
  }

  // ---------- the dock ----------
  // landed 2026-11-27: orderflow.html + pchealth.html are on the site, chart.html is not (Chart = Home's chart card); no HEAD probe
  var have = { 'chart.html': 0, 'orderflow.html': 1, 'pchealth.html': 1 };
  function tabHref(id) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === id) { var T = TABS[i]; return have[T[2]] === 0 ? (T[3] ? base + T[3] : null) : base + T[2]; }
    return null;
  }
  var vtNative = 'onpagereveal' in w;
  function go(href) {
    if (vtNative || reduce) { w.location.href = href; return; }
    try { w.sessionStorage.setItem(SS_ENTER, '1'); } catch (e) { /* no */ }
    d.documentElement.classList.add('nqnav-leaving');
    setTimeout(function () { w.location.href = href; }, 130);
  }
  var prefetched = {};
  function prefetch(href) {
    if (prefetched[href] || !href || /#/.test(href)) return; prefetched[href] = 1;
    var l = d.createElement('link'); l.rel = 'prefetch'; l.href = href; d.head.appendChild(l);
  }
  function buildDock() {
    var on = activeId(), nav = el('nav', 'nqn-dock'); nav.setAttribute('aria-label', 'NQ pages');
    for (var i = 0; i < TABS.length; i++) {
      var T = TABS[i], href = tabHref(T[0]), a = el('a', 'nqn-tab');
      a.setAttribute('data-tab', T[0]);
      if (!href) a.hidden = true; else a.href = href;
      if (T[0] === on) { a.classList.add('is-on'); a.setAttribute('aria-current', 'page'); a.appendChild(el('i', 'nqn-ink')); }
      a.appendChild(svg(I[T[0]])); a.appendChild(el('span', null, T[1]));
      a.setAttribute('aria-label', T[0] === 'flow' ? 'Order flow' : T[0] === 'pc' ? 'PC health' : T[1]);
      nav.appendChild(a);
    }
    nav.addEventListener('pointerdown', function (e) { var t = e.target.closest && e.target.closest('.nqn-tab'); if (!t) return; t.classList.add('is-press'); ripple(t, e); prefetch(t.href); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (k) { nav.addEventListener(k, function (e) { var t = e.target.closest && e.target.closest('.nqn-tab'); if (t) t.classList.remove('is-press'); }); });
    nav.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('.nqn-tab'); if (t) prefetch(t.href); });
    nav.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.nqn-tab'); if (!t || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      tick();
      if (t.classList.contains('is-on')) { e.preventDefault(); try { w.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } catch (x) { w.scrollTo(0, 0); } return; }
      e.preventDefault(); go(t.href);
    });
    S.dock = nav; return nav;
  }
  function probe() {   // which sprint pages exist (HEAD, same origin); a change re-lays the dock next visit (no shift now)
    var changed = false, n = 0;
    TABS.forEach(function (T) {
      if (!T[3] && T[0] !== 'flow') return;
      n++;
      fetch(base + T[2], { method: 'HEAD', cache: 'no-cache' }).then(function (r) { return r.ok ? 1 : 0; }, function () { return null; }).then(function (v) {
        if (v != null && have[T[2]] !== v) { have[T[2]] = v; changed = true; }
        if (--n === 0 && changed) {
          ls(LS_HAVE, have);
          if (S.dock) TABS.forEach(function (X) { var a = S.dock.querySelector('[data-tab="' + X[0] + '"]'), h = tabHref(X[0]); if (!a || a.classList.contains('is-on')) return; if (h) { a.href = h; a.hidden = false; } else a.hidden = true; });
        }
      });
    });
  }

  // ---------- pull to refresh ----------
  function doRefresh(force) {
    var ptr = S.ptr, finished = false;
    function done() { if (finished) return; finished = true; if (ptr) { ptr.classList.remove('is-spin'); ptr.style.transform = 'translateY(-70px)'; ptr.style.opacity = '0'; } }
    var ev; try { ev = new CustomEvent('nq:refresh', { cancelable: true, detail: { done: done } }); } catch (e) { ev = null; }
    refreshPC(true);
    if (ev && !w.dispatchEvent(ev)) { setTimeout(done, 6000); return; }   // the page took it
    setTimeout(function () { w.location.reload(); }, 220);
  }
  function setupPTR() {
    var ptr = el('div', 'nqn-ptr'); ptr.setAttribute('aria-hidden', 'true');
    var NS = 'http://www.w3.org/2000/svg', s = d.createElementNS(NS, 'svg'), c = d.createElementNS(NS, 'circle');
    s.setAttribute('viewBox', '0 0 24 24'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '9'); c.setAttribute('pathLength', '100'); c.style.strokeDasharray = '0 100';
    s.appendChild(c); ptr.appendChild(s); d.body.appendChild(ptr); S.ptr = ptr;
    var y0 = null, x0 = 0, pull = 0, armed = false, TH = 72;
    function skip(t) { return !t || !t.closest || t.closest('canvas, input, textarea, select, [data-nq-nopull], .nqn-sheet, .nqn-dock, [contenteditable]'); }
    d.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || (w.scrollY || d.documentElement.scrollTop) > 0 || skip(e.target) || d.querySelector('.nqn-sheet')) { y0 = null; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pull = 0; armed = false;
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      var dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (dy <= 0 || dx > dy) { if (pull) reset(); y0 = dy < -4 || dx > 12 ? null : y0; return; }
      pull = Math.min(130, dy * 0.55);
      var k = Math.min(1, pull / TH);
      ptr.style.opacity = String(Math.min(1, k * 1.4)); ptr.style.transform = 'translateY(' + (pull - 56) + 'px) rotate(' + (k * 270) + 'deg)';
      c.style.strokeDasharray = Math.round(k * 92) + ' 100';
      if (k >= 1 && !armed) { armed = true; ptr.classList.add('is-go'); tick(); } else if (k < 1 && armed) { armed = false; ptr.classList.remove('is-go'); }
    }, { passive: true });
    function reset() { pull = 0; armed = false; ptr.classList.remove('is-go'); ptr.style.opacity = '0'; ptr.style.transform = 'translateY(-70px)'; }
    d.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null;
      if (armed) { ptr.classList.remove('is-go'); ptr.classList.add('is-spin'); ptr.style.transform = 'translateY(14px)'; c.style.strokeDasharray = '70 100'; doRefresh(); }
      else reset();
    }, { passive: true });
  }

  // ---------- install + offline chips ----------
  function chip(cls, html, btns) {
    var c = el('div', 'nqn-chip ' + cls); c.setAttribute('role', 'status'); var p = el('p'); html(p); c.appendChild(p);
    btns.forEach(function (b) { var x = el('button', b[2] || null, b[0]); x.type = 'button'; x.addEventListener('click', function () { tick(); b[1](c); }); c.appendChild(x); });
    d.body.appendChild(c); return c;
  }
  function install() {
    var ev = S.installEvt; if (!ev) return; S.installEvt = null;
    try { ev.prompt(); (ev.userChoice || Promise.resolve()).then(function () { ls(LS_INST, Date.now()); }); } catch (e) { /* no */ }
  }
  function maybeInstallChip() {
    if (framed || standalone || !S.installEvt) return;
    var last = +ls(LS_INST) || 0; if (Date.now() - last < 14 * 86400e3) return;
    setTimeout(function () {
      if (!S.installEvt || d.querySelector('.nqn-chip.low')) return;
      chip('low', function (p) { p.appendChild(el('b', null, 'Install NQ')); p.appendChild(d.createTextNode(': one tap opens straight into the bots, full screen.')); },
        [['Install', function (c) { c.remove(); install(); }, 'gold'], ['✕', function (c) { c.remove(); ls(LS_INST, Date.now()); }]]);
    }, 2500);
  }
  function offlineChip(off) {
    if (off && !S.chipOff) {
      var saved = S.lite ? ' (PC report ' + ago(Date.now() / 1000 - S.lite.t) + ' old)' : '';
      S.chipOff = chip('top off', function (p) { p.appendChild(el('b', null, 'Offline')); p.appendChild(d.createTextNode(': the numbers are from your last visit' + saved + '. They refresh when the network is back.')); },
        [['✕', function (c) { c.remove(); }]]);
      S.chipOff.setAttribute('role', 'alert');
    } else if (!off && S.chipOff) { S.chipOff.remove(); S.chipOff = null; refreshPC(); }
  }

  // ---------- start ----------
  function css() {
    if (d.querySelector('link[data-nqnav]')) return;
    var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'nqnav.css?v=2'; l.setAttribute('data-nqnav', ''); d.head.appendChild(l);
  }
  function start() {
    var html = d.documentElement;
    css();
    try { if (w.sessionStorage.getItem(SS_ENTER)) { w.sessionStorage.removeItem(SS_ENTER); if (!reduce) { html.classList.add('nqnav-enter'); setTimeout(function () { html.classList.remove('nqnav-enter'); }, 400); } } } catch (e) { /* no */ }
    var c = ls(LS_PC); if (c && isFinite(+c.t)) { S.lite = c; S.cached = true; }
    var F = w.NQ_FEED;
    if (F && F.cached) { var k = F.cached(); if (k) keep(k, true); }
    if (F && F.on) F.on(function (lite, meta) { keep(lite, !!(meta && meta.src === 'cache')); paint(); });
    if (html.classList.contains('framed')) framed = true;
    if (!framed) {
      html.classList.add('nqnav-on');
      d.body.appendChild(buildDock());
      var f = makePill(); f.classList.add('nqn-float'); d.body.appendChild(f);
      setupPTR();
    }
    [].forEach.call(d.querySelectorAll('[data-nq-pc-pill]'), function (slot) { slot.appendChild(makePill()); });
    paint();
    refreshPC();
    setInterval(paint, 30000);
    setInterval(function () { if (!d.hidden) refreshPC(); }, 120000);
    d.addEventListener('visibilitychange', function () { if (!d.hidden) refreshPC(); });
    w.addEventListener('offline', function () { offlineChip(true); });
    w.addEventListener('online', function () { offlineChip(false); });
    if (w.navigator.onLine === false) offlineChip(true);
    maybeInstallChip();
  }
  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; if (d.body) maybeInstallChip(); });
  w.addEventListener('appinstalled', function () { S.installEvt = null; ls(LS_INST, Date.now()); });
  w.addEventListener('pageshow', function (e) { if (e.persisted) d.documentElement.classList.remove('nqnav-leaving'); });

  w.NQNAV = { TABS: TABS, ago: ago, armedOf: armedOf, state: state, refresh: doRefresh, refreshPC: refreshPC, activeId: activeId };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
