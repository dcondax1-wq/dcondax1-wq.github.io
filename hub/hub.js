/* OLYMPUS HUB PAGE (2026-11-14, docs/OLYMPUS_IA_V2.md). Classic script, ES5, no build step, no network but the site's own files.
 * hub/?h=<hub>&t=<tab>. Reads the hubs from olympus/gate-catalog.js (C.hubs, C.layout) and the live lines from olympus/hub-status.js (HS).
 * One tab per job (role=tablist, arrows move, the choice goes in the address: ?t=), and per tab:
 *   the job in one line; the BEST app as a big card (its own status card line when it says something real, "Open" and "Show it here" =
 *   the app in a frame below); the other apps for the job as rows; the duplicates under "Other views of the same" (a <details>, closed).
 * A strip of live facts for the hubs that have numbers (Today, Bots & Evals, Kalshi, My Money, Plan & Day, Research). Settings & Help also lists
 * every app A to Z. No ?h (or an unknown one): the list of hubs. Text only through textContent / createElementNS; storage: read 'planner.today.v1' only.
 * A PAGE hub (Me, page: 'me' in the catalog, docs/ME_HUB.md) has no tabs: hub/me.js (window.OLYMPUS_ME_PAGE) draws it into the panel. */
(function () {
  'use strict';
  var d = document, w = window, C = w.OLYMPUS_GATE || null, HS = w.OLYMPUS_HUB_STATUS || null, NS = 'http://www.w3.org/2000/svg';
  var base = '../', S = { hub: null, tab: null, done: false, cards: {}, N: null, K: null, M: null, P: null, cardsLeft: 0 };
  var Q = (function () { var o = {}, s = (w.location.search || '').replace(/^\?/, ''); if (!s) return o; s.split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) { try { o[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { /* skip */ } } }); return o; })();
  var ICONS = {
    sun: ['M8 27a12 12 0 0 1 24 0', 'M20 7v4M8.5 12.5l2.8 2.8M31.5 12.5l-2.8 2.8M3 27h34M7 32h26'],
    me: ['M20 6.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z', 'M7 34c.8-7.4 6.2-12 13-12s12.2 4.6 13 12'],
    bots: ['M7 15h26M9 33h22M11 15v18M20 15v18M29 15v18', 'M11 6c-2 2 0 3.5-1.2 6h2.4c-.8-2.3.8-3.4-1.2-6zM20 4.5c-2.2 2.2 0 4-1.4 7.5h2.8c-.9-2.8.9-4.1-1.4-7.5zM29 6c-2 2 0 3.5-1.2 6h2.4c-.8-2.3.8-3.4-1.2-6z'],
    kalshi: ['M20 5v30M9 12h22', 'M9 12 4 23a5 5 0 0 0 10 0zM31 12l-5 11a5 5 0 0 0 10 0z', 'M13 35h14'],
    money: ['M20 6a14 14 0 1 0 0 28a14 14 0 1 0 0-28z', 'M20 13.5v13M23 16.8c-.3-1.2-1.5-1.9-3-1.9-1.7 0-3 .9-3 2.3 0 3.2 6 1.9 6 5.1 0 1.4-1.3 2.4-3 2.4-1.6 0-2.8-.7-3.1-1.9'],
    plan: ['M9 9h22a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z', 'M6 16h28M13 5v7M27 5v7M12 22h4M18 22h4M24 22h4M12 28h4M18 28h4'],
    research: ['M8 8h9a4 4 0 0 1 3 1.5A4 4 0 0 1 23 8h9v24h-9a4 4 0 0 0-3 1.5A4 4 0 0 0 17 32H8z', 'M20 9.5v24'],
    jarvis: ['M20 6a14 14 0 1 0 0 28a14 14 0 1 0 0-28z', 'M20 14a6 6 0 1 0 0 12a6 6 0 1 0 0-12z', 'M20 3v3M20 34v3M3 20h3M34 20h3'],
    worlds: ['M5 14 20 6l15 8zM7 14h26M9.5 17.5v12M16 17.5v12M24 17.5v12M30.5 17.5v12M6 30h28M4 34h32'],
    settings: ['M20 15a5 5 0 1 0 0 10a5 5 0 1 0 0-10z', 'M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5']
  };

  function $(id) { return d.getElementById(id); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs) { var e = d.createElementNS(NS, tag); for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function lsGet(k) { try { var v = w.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function nowS() { var t = Q.now ? Date.parse(Q.now) : NaN; return (isFinite(t) ? t : Date.now()) / 1000; }
  function hrefOf(a) { var p = a.path; if (p === '') return base + 'index.html'; if (/\/$/.test(p)) return base + p + 'index.html'; return base + p; }
  function iconOf(a) { return /\/$/.test(a.path) ? base + a.path + 'icon.svg' : null; }
  function remember(id) {   // the Gate's Recent row (the same key and rules as gate.js / gate-nav.js)
    try { var r = JSON.parse(w.localStorage.getItem('gate.recent.v1') || '[]'); r = (r instanceof Array ? r : []).filter(function (x) { return x !== id && typeof x === 'string'; }); r.unshift(id); w.localStorage.setItem('gate.recent.v1', JSON.stringify(r.slice(0, 8))); } catch (e) { /* private mode */ }
  }
  function hubIcon(key, cls) {
    var s = sv('svg', { 'class': cls || 'hb-hicon', viewBox: '0 0 40 40', 'aria-hidden': 'true' });
    (ICONS[key] || ICONS.worlds).forEach(function (p) { s.appendChild(sv('path', { d: p })); });
    return s;
  }
  function chevron() { var s = sv('svg', { 'class': 'hb-chev', viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.appendChild(sv('path', { d: 'M6 3l5 5-5 5' })); return s; }
  function appIcon(a, size) {
    var box = el('span', 'hb-ico' + (size ? ' ' + size : '')), src = iconOf(a), glyph = (a.name || a.label || '?').charAt(0);
    box.setAttribute('aria-hidden', 'true');
    if (!src) { box.textContent = glyph; return box; }
    var img = el('img'); img.alt = ''; img.width = 44; img.height = 44; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); box.textContent = glyph; };
    img.src = src; box.appendChild(img); return box;
  }
  function statusOf(a) { return HS ? HS.cardLine(S.cards[a.id]) : null; }

  /* ------------------------------------------------------------------------------------------ one app: a row, or the big "best" card */
  function row(a, note) {
    var r = el('a', 'hb-row'); r.href = hrefOf(a); r.setAttribute('data-app', a.id);
    var t = el('span', 'hb-txt'), sm = el('small');
    t.appendChild(el('b', '', a.label));
    sm.appendChild(el('i', '', a.name && a.name !== a.label ? a.name + ' · ' : ''));
    sm.appendChild(d.createTextNode(a.line));
    t.appendChild(sm);
    var st = statusOf(a);
    if (note) t.appendChild(el('span', 'hb-note', note));
    else if (st) { var sl = el('span', 'hb-live ' + st.lvl, st.text); sl.setAttribute('data-live', a.id); t.appendChild(sl); }
    r.appendChild(appIcon(a)); r.appendChild(t); r.appendChild(chevron());
    r.addEventListener('click', function () { remember(a.id); });
    return r;
  }
  function bestCard(a, sec) {
    var c = el('article', 'hb-best'); c.setAttribute('data-app', a.id);
    var head = el('div', 'hb-bhead'), txt = el('div', 'hb-btxt');
    txt.appendChild(el('span', 'hb-tag', 'Best app for this job'));
    txt.appendChild(el('h2', 'hb-bname', a.label));
    txt.appendChild(el('p', 'hb-bline', (a.name && a.name !== a.label ? a.name + ' · ' : '') + a.line));
    head.appendChild(appIcon(a, 'big')); head.appendChild(txt);
    c.appendChild(head);
    var st = statusOf(a);
    var live = el('p', 'hb-blive' + (st ? ' ' + st.lvl : ''), st ? st.text : ''); live.setAttribute('data-live', a.id); live.hidden = !st;
    c.appendChild(live);
    var acts = el('div', 'hb-acts'), open = el('a', 'hb-btn primary', 'Open'), show = el('button', 'hb-btn', 'Show it here');
    open.href = hrefOf(a); open.setAttribute('aria-label', 'Open ' + a.label);
    open.addEventListener('click', function () { remember(a.id); });
    show.type = 'button'; show.setAttribute('aria-expanded', 'false'); show.setAttribute('data-embed', a.id);
    acts.appendChild(open); acts.appendChild(show); c.appendChild(acts);
    var box = el('div', 'hb-embed'); box.hidden = true; c.appendChild(box);
    show.addEventListener('click', function () {
      var on = box.hidden;
      if (on && !box.firstChild) {
        var f = el('iframe', 'hb-frame'); f.src = hrefOf(a); f.title = a.label + ' (' + a.name + ')'; f.setAttribute('loading', 'lazy');
        box.appendChild(f);
        var bar = el('p', 'hb-embedfoot'), full = el('a', 'hb-link', 'Open it full screen');
        full.href = hrefOf(a); full.addEventListener('click', function () { remember(a.id); });
        bar.appendChild(full); box.appendChild(bar);
      }
      box.hidden = !on; show.textContent = on ? 'Hide' : 'Show it here'; show.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) remember(a.id);
    });
    return c;
  }

  /* ------------------------------------------------------------------------------------------ tabs */
  function drawTabs(H, L) {
    var bar = $('tabs'); clear(bar);
    L.forEach(function (s, i) {
      var b = el('button', 'hb-tab', s.title); b.type = 'button'; b.id = 'tab-' + s.id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'panel'); b.setAttribute('data-tab', s.id);
      b.addEventListener('click', function () { pick(s.id, true); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, j = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? L.length - 1 : -1;
        if (j < 0 && k !== 'ArrowLeft') return;
        e.preventDefault(); j = (j + L.length) % L.length; pick(L[j].id, true); $('tab-' + L[j].id).focus();
      });
      bar.appendChild(b);
    });
    bar.hidden = L.length < 2;
  }
  function pick(tid, user) {
    var H = S.hub, L = C.layout(H.id), sec = null;
    for (var i = 0; i < L.length; i++) if (L[i].id === tid) sec = L[i];
    if (!sec) sec = L[0];
    S.tab = sec.id;
    var tabs = $('tabs').querySelectorAll('[role="tab"]');
    for (var j = 0; j < tabs.length; j++) { var on = tabs[j].getAttribute('data-tab') === sec.id; tabs[j].setAttribute('aria-selected', on ? 'true' : 'false'); tabs[j].tabIndex = on ? 0 : -1; }
    var panel = $('panel'); clear(panel);
    panel.setAttribute('aria-labelledby', 'tab-' + sec.id);
    panel.appendChild(el('p', 'hb-blurb', sec.blurb));
    if (sec.best) panel.appendChild(bestCard(sec.best, sec));
    if (sec.peers.length) {
      panel.appendChild(el('h3', 'hb-h3', sec.peers.length === 1 ? 'Also for this job' : 'Also for this job (' + sec.peers.length + ')'));
      var l = el('div', 'hb-list'); sec.peers.forEach(function (a) { l.appendChild(row(a)); }); panel.appendChild(l);
    }
    if (sec.folded.length) {
      var det = el('details', 'hb-fold'), sum = el('summary', '', 'Other views of the same (' + sec.folded.length + ')');
      det.appendChild(sum);
      det.appendChild(el('p', 'hb-foldnote', 'These do the same job as an app above. They are kept, so nothing is lost; use the one above first.'));
      var fl = el('div', 'hb-list');
      sec.folded.forEach(function (a) { var b = C.byId(a.fold); fl.appendChild(row(a, b ? 'Same job as ' + b.label + ' (' + b.name + ')' : '')); });
      det.appendChild(fl); panel.appendChild(det);
    }
    if (H.id === 'settings' && sec.id === 'help') panel.appendChild(everyApp());
    panel.hidden = false;
    if (user && w.history && w.history.replaceState) { try { w.history.replaceState(null, '', '?h=' + H.id + '&t=' + sec.id + (Q.now ? '&now=' + encodeURIComponent(Q.now) : '')); } catch (e) { /* file:// */ } }
  }
  /* Settings & Help > Help: every app A to Z with its hub, so nothing can be lost */
  function everyApp() {
    var box = el('section', 'hb-az'), list = el('div', 'hb-list');
    box.appendChild(el('h3', 'hb-h3', 'Every app, A to Z (' + C.apps.length + ')'));
    C.apps.slice().sort(function (x, y) { return x.label.toLowerCase() < y.label.toLowerCase() ? -1 : x.label.toLowerCase() > y.label.toLowerCase() ? 1 : 0; })
      .forEach(function (a) { var h = C.hubOf(a.id); list.appendChild(row(a, h ? 'In ' + h.name : '')); });
    box.appendChild(list); return box;
  }

  /* ------------------------------------------------------------------------------------------ the live strip */
  function fact(box, label, value, sub, cls, to) {
    var c = el(to ? 'a' : 'div', 'hb-fact');
    if (to) c.href = base + to;
    c.appendChild(el('span', 'hb-fl', label)); c.appendChild(el('span', 'hb-fv' + (cls ? ' ' + cls : ''), value));
    if (sub) c.appendChild(el('span', 'hb-fsub', sub));
    box.appendChild(c);
  }
  /* the first kpis of an app's status card as facts (only a card that says something real: HS.cardLine) */
  function kpiFacts(id, n) {
    var c = S.cards[id], a = C.byId(id), box = $('hubFacts'); if (!a || !HS.cardLine(c)) return;
    (c.kpis instanceof Array ? c.kpis : []).slice(0, n).forEach(function (k) {
      if (!k || k.label == null || k.value == null) return;
      fact(box, String(k.label).slice(0, 20), String(k.value).slice(0, 24), 'from ' + a.label + ' (' + a.name + ')', '', a.path + 'index.html');
    });
  }
  function upDown(v) { return v == null ? '' : v > 0.5 ? 'up' : v < -0.5 ? 'down' : ''; }
  function drawNow() {
    var H = S.hub, box = $('hubFacts'), foot = $('hubFoot'), sec = $('hubNow'); if (!H || !HS) return;
    clear(box); foot.textContent = '';
    var N = S.N, K = S.K || { has: false }, M = S.M || { has: false }, P = S.P || { has: false }, B = N ? HS.botState(N) : null, t = nowS();
    var bots = function () {
      if (!N || !N.has) { fact(box, 'Bots', 'No numbers', 'no report reached this page', 'down', 'nq/index.html'); return; }
      fact(box, 'Bots', B.label, N.pcAge == null ? 'no report yet' : 'report ' + HS.shortAge(N.pcAge), B.lvl === 'ok' ? 'up' : B.lvl === 'bad' ? 'down' : 'warn', 'nq/index.html');
    };
    var win = function () { var W = N && N.win ? N.win : HS.nextWindow({}, t); fact(box, 'Trade window', W.open ? 'Open now' : W.label.replace(/ 02:00-15:30 ET$/, ' 02:00 ET'), W.open ? 'until 15:30 ET' : HS.inWords(W.inS), '', 'kairos/index.html'); };
    var plan = function () {
      if (P.has && P.shift) fact(box, 'My shift', P.shift.now ? 'Now' + (P.shift.end ? ' to ' + P.shift.end : '') : P.shift.start + (P.shift.end ? '-' + P.shift.end : ''), P.shift.title, '', 'planner/index.html');
      if (P.has && P.next && (!P.shift || P.next.title !== P.shift.title)) fact(box, 'Next on your plan', P.next.start, P.next.title, '', 'planner/index.html');
    };
    var kal = function (full) {
      if (!K.has) { if (full) fact(box, 'Kalshi bot', 'No numbers yet', 'kalshi.json has not reached this site', '', 'kalshi/index.html'); return; }
      fact(box, full ? 'Balance' : 'Kalshi', K.balance != null ? HS.money(K.balance) : 'Bot on', K.today != null ? 'today ' + HS.moneyS(K.today) : '', full ? '' : upDown(K.today), 'kalshi/index.html');
      if (full) {
        fact(box, 'Today', K.today != null ? HS.moneyS(K.today) : '-', K.week != null ? 'this week ' + HS.moneyS(K.week) : '', upDown(K.today), 'kalshi/index.html');
        fact(box, 'Open bets', String(K.open || 0), K.running === false ? 'the bot is stopped' : K.running ? 'the bot is running' : '', '', 'kalshi/index.html');
        fact(box, 'Updated', K.age == null ? 'unknown' : HS.shortAge(K.age), 'from the bot on your PC', K.age != null && K.age > 36 * 3600 ? 'down' : '', 'kalshi/index.html');
      }
    };
    switch (H.id) {
      case 'today': bots(); win(); plan(); kal(false); break;
      case 'bots':
        bots();
        if (N && N.has) {
          N.accts.forEach(function (a) { fact(box, 'Drawdown left', HS.money(a.room), 'of ' + HS.money(a.mll) + ' max loss, ' + a.name, '', 'aegis/index.html'); });
          fact(box, B && B.st === 'stale' ? 'Last report day' : 'Today', HS.moneyS(N.today), N.accts.length > 1 ? 'both eval accounts' : 'the eval account', upDown(N.today), 'nq/index.html');
        }
        kpiFacts('fates', 2);
        break;
      case 'kalshi': kal(true); break;
      case 'money':
        if (M.has) {
          fact(box, 'This month', HS.moneyS(M.month), 'cash in minus cash out', upDown(M.month), 'ledger/index.html');
          fact(box, 'All time', HS.moneyS(M.all), 'cash, since the first fee', upDown(M.all), 'ledger/index.html');
          foot.textContent = 'Cash only: paper P&L and money-machine estimates are never counted here.';
        } else { fact(box, 'Real money', 'Not published yet', 'open Your real money to record fees and payouts', '', 'ledger/index.html'); }
        kal(false);
        break;
      case 'plan':
        if (P.has) { plan(); fact(box, 'Tasks today', P.done + ' of ' + P.tasks, 'done', '', 'planner/index.html'); }
        else fact(box, 'Your plan', 'Open the Planner', 'your day, shifts and tasks live on this phone', '', 'planner/index.html');
        win();
        break;
      case 'research':
        kpiFacts('hephaestus', 2); kpiFacts('prometheus', 1); kpiFacts('archive', 1);
        break;
    }
    sec.hidden = !box.firstChild;
  }
  /* each app of the hub (and its "see" apps): its status card, for the live lines */
  function loadCards(H, then) {
    var ids = C.apps.filter(function (a) { return a.hub === H.id && /\/$/.test(a.path); }).map(function (a) { return a.id; }).concat(H.see || []);
    if (H.id === 'bots') ids.push('fates');
    if (H.id === 'research') ids.push('hephaestus', 'prometheus', 'archive');
    var seen = {}; ids = ids.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; });
    S.cardsLeft = ids.length; if (!ids.length) { then(); return; }
    ids.forEach(function (id) {
      var a = C.byId(id); if (!a) { if (--S.cardsLeft === 0) then(); return; }
      HS.getJSON(base + a.path + 'jarvis.json').then(function (j) { S.cards[id] = j; if (--S.cardsLeft === 0) then(); });
    });
  }
  function refreshLive() {   // the status lines, once the cards are in (the panel is redrawn on the same tab)
    if (S.tab) pick(S.tab, false);
    drawSee(S.hub);
  }
  function drawSee(H) {
    var box = $('see'), list = $('seeList'); clear(list);
    var see = (H.see || []).map(C.byId).filter(Boolean);
    see.forEach(function (a) { var h = C.hubOf(a.id); list.appendChild(row(a, h ? 'Lives in ' + h.name : '')); });
    box.hidden = !see.length;
  }

  /* ------------------------------------------------------------------------------------------ start */
  /* 3D touch (team FX, 2026-11-15): html[data-g3d] lets hub.css / me.css play two small CSS-only entrances (the best app's icon turns in
     like a coin, the Me hub's four tiles rise into place), on a fresh open (not a reload or a Back); never under reduced motion,
     3D Off / Low (LITE), Battery quality or the battery saver, or in an automated browser. Nothing loops after the entrance. */
  function mark3d(hid) {
    var root = d.documentElement, lvl = '', saver = '', rm = false;
    try { lvl = String(JSON.parse(localStorage.getItem('jfx') || '""')); } catch (e) { try { lvl = String(localStorage.getItem('jfx') || ''); } catch (e2) { lvl = ''; } }
    try { saver = String(localStorage.getItem('olympus.saver') || ''); } catch (e) { saver = ''; }
    try { rm = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { rm = false; }
    if (rm || /on/.test(saver) || lvl === 'off' || lvl === 'low' || root.getAttribute('data-oly-lite') === '1' || navigator.webdriver) return;
    try { var nv = w.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null; if (nv && nv.type !== 'navigate') return; } catch (e) { /* it plays */ }   // not on a reload or a Back
    root.setAttribute('data-g3d', '1');
    w.setTimeout(function () { root.removeAttribute('data-g3d'); }, 2400);
  }
  function boot() {
    try { if (w.OLYMPUS_THEMES && w.OLYMPUS_THEMES.apply) w.OLYMPUS_THEMES.apply('page', { meta: true }); } catch (e) { /* the default look (the hub's own page id 'hub-<id>' lets a Mix give it its hub's look) */ }
    var H = C && Q.h ? (function () { for (var i = 0; i < C.hubs.length; i++) if (C.hubs[i].id === Q.h) return C.hubs[i]; return null; })() : null;
    var chips = d.querySelectorAll('.hb-chip[data-hub]');
    for (var i = 0; i < chips.length; i++) if (H && chips[i].getAttribute('data-hub') === H.id) chips[i].setAttribute('aria-current', 'page');
    if (!C || !H) {   // the list of hubs
      if (C) {
        clear($('hubChips'));
        C.hubs.forEach(function (h) { var a = el('a', 'hb-hubrow'); a.href = 'index.html?h=' + h.id; a.setAttribute('data-hub', h.id); a.appendChild(hubIcon(h.icon)); var t = el('span', 'hb-txt'); t.appendChild(el('b', '', h.name)); t.appendChild(el('small', '', h.line + ' · ' + (h.size || h.count + ' apps'))); a.appendChild(t); a.appendChild(chevron()); $('hubChips').appendChild(a); });
        $('hubChips').className = 'hb-list';
        var home = el('a', 'hb-chip hb-home', 'Home'); home.href = base + 'gate/index.html'; $('hubIndex').appendChild(home);
      }
      $('indexH').textContent = C ? 'Pick a hub' : 'All hubs';
      S.done = true; return;
    }
    S.hub = H;
    try { mark3d(H.id); } catch (e) { /* flat */ }
    d.title = H.name + ' · Olympus';
    d.documentElement.setAttribute('data-oly-district', H.id);
    var title = $('hubName'); clear(title); title.appendChild(hubIcon(H.icon, 'hb-ticon')); title.appendChild(d.createTextNode(H.name));
    $('hubQ').textContent = H.q;
    $('indexH').textContent = 'Other hubs';
    if (H.page) {   // a page hub (Me, docs/ME_HUB.md): no app tabs; hub/me.js draws its tiles and areas from the PC's private me/me.json
      $('tabs').hidden = true;
      drawSee(H);
      var MP = w.OLYMPUS_ME_PAGE, panel = $('panel');
      panel.removeAttribute('role');   // no tabs here, so the panel is not a tab panel
      if (!MP || !MP.mount) { clear(panel); panel.appendChild(el('p', 'hb-blurb', 'This hub did not load. Open it again in a moment.')); panel.hidden = false; S.done = true; return; }
      MP.mount(panel, { base: base, now: nowS, hub: H, done: function () { S.done = true; } });
      return;
    }
    var L = C.layout(H.id);
    drawTabs(H, L);
    pick(Q.t, false);
    drawSee(H);
    if (!HS) { S.done = true; return; }
    var left = 2, fin = function () { if (--left > 0) return; drawNow(); refreshLive(); S.done = true; };
    loadCards(H, fin);
    var t = nowS(), need = { today: 'hkp', bots: 'h', kalshi: 'k', money: 'mk', plan: 'p', research: '' }[H.id] || '';
    if (need.indexOf('p') >= 0) S.P = HS.planOf(lsGet('planner.today.v1'), t);
    var jobs = 1, one = function () { if (--jobs === 0) fin(); };
    if (need.indexOf('k') >= 0) { jobs++; HS.getJSON(base + 'kalshi.json').then(function (j) { S.K = HS.kalshiOf(j, t); one(); }); }
    if (need.indexOf('m') >= 0) { jobs++; HS.getJSON(base + 'money/scoreboard.json').then(function (j) { S.M = HS.moneyOf(j); one(); }); }
    if (need.indexOf('h') >= 0) {
      jobs++;
      HS.getJSON(base + 'home.json').then(function (home) {
        if (!home || typeof home !== 'object') { S.N = { has: false, accts: [], win: HS.nextWindow({}, t) }; one(); return; }
        HS.getTruth(base, function (T) {
          S.N = HS.summarize(home, T, t); one();
          // SYNC (night A 2026-11-16): the PC's ntfy report over home.json when newer (truth.withPcFeed, the same rule as the Gate, NQ and Jarvis)
          if (T && typeof T.withPcFeed === 'function') T.withPcFeed(home).then(function (h2) { if (h2 && h2 !== home) { S.N = HS.summarize(h2, T, nowS()); if (S.done) drawNow(); } }, function () {});
        });
      });
    }
    one();
  }

  w.HUB = { ready: function () { return S.done; }, state: S, pick: function (t) { pick(t, true); } };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
