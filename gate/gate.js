/* OLYMPUS HOME v2 (the Gate, 2026-11-14, docs/OLYMPUS_IA_V2.md). Classic script, ES5, no build step, no network but the site's own files.
 * - "Right now": ../home.json through olympus/truth.js (the one source every app uses for drawdown and data age); a light copy of its rules when truth.js
 *   does not load. Bots on / quiet / old numbers with the exact age, then the facts, each a tap to its app: drawdown left per account (Aegis), today's $ (NQ),
 *   the next trade window (Kairos), the Kalshi bot (kalshi.json -> Kalshi), my shift / next on the plan (the Planner's summary on this phone -> Planner).
 *   Older than 6 h: one button "Bring the bots back".
 * - The hubs (olympus/gate-catalog.js HUBS): static links in the page (they work without this script); this script adds each hub's live line
 *   (olympus/hub-status.js) and its app count. Then the search (name, purpose, plain words) and Recent (last 4 apps opened, this phone only).
 *   Me (2026-11-14, docs/ME_HUB.md): its line reads the PC's private me/me.json (a 404 on any other copy: then the plain line stays);
 *   the search also finds it by its words (C.findHubs: health, wifi, cards ...).
 * - Old links: gate/?d=<v1 district or hub> opens that hub page (trading -> Bots & Evals, money -> My Money, life -> Plan & Day, worlds, workshop).
 * - GATE_BASE ('' at the site root as olympus-live.html, '../' at gate/) prefixes every link. Apps missing from a partial copy are marked "not in this link".
 * - Served from the PC (/site/, the private Tailscale link, docs/LIVE_DASHBOARD.md): "Right now" reads the bot's own /api/site/live.json
 *   over home.json (pc_feed.js overlayHome) and refreshes every minute. Any other copy never asks it.
 * - NAV v3 (2026-11-15, docs/OLYMPUS_NAV.md): ONE big search first (C.findAll: page hubs, plain actions, apps, hub tabs), Pinned (the owner's favourites,
 *   'gate.pins.v1', a star on every search row and in the A to Z sheet), Your six (one tap, with a live line each), Recent (last 6), the hubs, and the
 *   All apps A to Z sheet (gate/#az: a filter box, big rows, a letter per group, a star to pin).
 * Text only through textContent / createElementNS. Storage: 'gate.recent.v1' (ids), 'gate.pins.v1' (ids) and 'gate.now.v1' (the last numbers seen), all in try / catch;
 * 'planner.today.v1' is read only (the Planner writes it). */
(function () {
  'use strict';
  var d = document, w = window, C = w.OLYMPUS_GATE || null, base = w.GATE_BASE || '';
  var LS_RECENT = 'gate.recent.v1', LS_PINS = 'gate.pins.v1', LS_NOW = 'gate.now.v1', LS_PLAN = 'planner.today.v1', STALE_S = 6 * 3600, FRESH_S = 20 * 60;
  var NS = 'http://www.w3.org/2000/svg';
  var S = { list: !!C, now: null, nowDone: false, probe: {}, probes: 0, extra: null, hubs: {} };
  var Q = (function () { var o = {}, s = (w.location.search || '').replace(/^\?/, ''); if (!s) return o; s.split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) { try { o[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { /* skip */ } } }); return o; })();

  function $(id) { return d.getElementById(id); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs) { var e = d.createElementNS(NS, tag); for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function lsGet(k) { try { var v = w.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { w.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } }
  function num(v) { var x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && isFinite(x) ? x : null; }
  function obj(x) { return x && typeof x === 'object' && !(x instanceof Array) ? x : {}; }
  function nowS() { var t = Q.now ? Date.parse(Q.now) : NaN; return (isFinite(t) ? t : Date.now()) / 1000; }
  function money(x) { var v = num(x); if (v == null) return '$0'; var a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '−' : '') + '$' + a.toLocaleString('en-US'); }
  function moneyS(x) { var v = num(x); return v != null && Math.round(v) > 0 ? '+' + money(v) : money(v); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function ageWords(sec) {
    var s = Math.max(0, Math.floor(num(sec) || 0));
    if (s < 60) return 'less than a minute';
    if (s < 3600) return plural(Math.floor(s / 60), 'minute');
    if (s < 86400) { var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
    var dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600); return plural(dd, 'day') + (hh ? ' ' + plural(hh, 'hour') : '');
  }
  function inWords(sec) { var s = Math.max(0, Math.round(sec / 60)); if (s < 60) return 'in ' + plural(s, 'minute'); var h = Math.floor(s / 60), m = s % 60; return h >= 24 ? 'in ' + plural(Math.floor(h / 24), 'day') + (h % 24 ? ' ' + (h % 24) + ' h' : '') : 'in ' + h + ' h' + (m ? ' ' + m + ' min' : ''); }

  /* ------------------------------------------------------------------------------------------ links */
  function hrefOf(a) { var p = a.path; if (p === '') return base + 'index.html'; if (/\/$/.test(p)) return base + p + 'index.html'; return base + p; }
  function iconOf(a) { return /\/$/.test(a.path) ? base + a.path + 'icon.svg' : null; }
  function recentIds() { var r = lsGet(LS_RECENT); return r instanceof Array ? r.filter(function (x) { return typeof x === 'string'; }) : []; }
  function remember(id) { var r = recentIds().filter(function (x) { return x !== id; }); r.unshift(id); lsSet(LS_RECENT, r.slice(0, 8)); }
  function pinIds() { var r = lsGet(LS_PINS); return r instanceof Array ? r.filter(function (x) { return typeof x === 'string' && (!C || C.byId(x)); }) : []; }
  function isPinned(id) { return pinIds().indexOf(id) >= 0; }
  function togglePin(id) { var r = pinIds(), i = r.indexOf(id); if (i >= 0) r.splice(i, 1); else r.push(id); lsSet(LS_PINS, r.slice(0, 12)); drawPins(); syncStars(); }
  /* a star next to a row: pin or unpin that app (44 x 44, aria-pressed) */
  function star(a) {
    var b = el('button', 'g-star'), on = isPinned(a.id); b.type = 'button'; b.setAttribute('data-pin', a.id);
    b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + a.label);
    b.textContent = on ? '\u2605' : '\u2606';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); togglePin(a.id); });
    return b;
  }
  function syncStars() {
    var bs = d.querySelectorAll('button.g-star[data-pin]'), P = pinIds();
    for (var i = 0; i < bs.length; i++) {
      var id = bs[i].getAttribute('data-pin'), on = P.indexOf(id) >= 0, a = C && C.byId(id);
      bs[i].setAttribute('aria-pressed', String(on)); bs[i].textContent = on ? '\u2605' : '\u2606'; if (a) bs[i].setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + a.label);
    }
  }
  function withStar(r, a) { var w2 = el('div', 'g-rowp'); w2.appendChild(r); w2.appendChild(star(a)); return w2; }

  function chevron() { var s = sv('svg', { 'class': 'g-chev', viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.appendChild(sv('path', { d: 'M6 3l5 5-5 5' })); return s; }
  function icon(a) {
    var box = el('span', 'g-ico'), src = iconOf(a), glyph = (a.name || a.label || '?').charAt(0);
    box.setAttribute('aria-hidden', 'true');
    if (!src) { box.textContent = glyph; return box; }
    var img = el('img'); img.alt = ''; img.width = 40; img.height = 40; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); box.textContent = glyph; };
    img.src = src; box.appendChild(img); return box;
  }
  function hubName(a) { var h = C && C.hubOf ? C.hubOf(a.id) : null; return h ? h.name : ''; }
  function row(a) {
    var r = el('a', 'g-row'); r.href = hrefOf(a); r.setAttribute('data-app', a.id);
    var t = el('span', 'g-txt'), sm = el('small'), hn = hubName(a);
    t.appendChild(el('b', '', a.label));
    sm.appendChild(el('i', '', a.name && a.name !== a.label ? a.name : ''));
    sm.appendChild(d.createTextNode((a.name && a.name !== a.label ? ' · ' : '') + a.line));
    t.appendChild(sm);
    if (hn) t.appendChild(el('span', 'g-where', 'in ' + hn));
    r.appendChild(icon(a)); r.appendChild(t); r.appendChild(chevron());
    r.addEventListener('click', function () { remember(a.id); });
    probe(a);
    if (S.probe[a.id] === 'gone') r.className += ' g-gone';
    return r;
  }
  /* a partial copy of the site (the artifact link) has only some apps: ask once per app, mark the missing ones; any doubt = present */
  function probe(a) {
    if (S.probe[a.id] || !w.fetch || a.path === '') return;
    S.probe[a.id] = 'asking'; S.probes++;
    w.fetch(hrefOf(a), { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      S.probe[a.id] = res.status === 404 ? 'gone' : 'ok';
      if (S.probe[a.id] !== 'gone') return;
      var rs = d.querySelectorAll('[data-app="' + a.id + '"].g-row');
      for (var i = 0; i < rs.length; i++) if (!/g-gone/.test(rs[i].className)) rs[i].className += ' g-gone';
    }).catch(function () { S.probe[a.id] = 'unknown'; });
  }

  /* ------------------------------------------------------------------------------------------ Recent */
  function drawRecent() {
    var box = $('recent'), sec = $('recentSec'); if (!box || !sec || !C) return;
    clear(box);
    var list = recentIds().map(C.byId).filter(function (a) { return a && a.section !== 'workshop'; }).slice(0, 6);
    sec.hidden = !list.length;
    list.forEach(function (a) {
      var c = el('a', 'g-chip'); c.href = hrefOf(a); c.setAttribute('data-app', a.id);
      var ic = icon(a); ic.className += ' g-chipico';
      c.appendChild(ic); c.appendChild(el('span', '', a.label));
      c.addEventListener('click', function () { remember(a.id); });
      box.appendChild(c);
    });
  }

  function chips(box, list) {
    list.forEach(function (a) {
      var c = el('a', 'g-chip'); c.href = hrefOf(a); c.setAttribute('data-app', a.id);
      var ic = icon(a); ic.className += ' g-chipico';
      c.appendChild(ic); c.appendChild(el('span', '', a.label));
      c.addEventListener('click', function () { remember(a.id); });
      box.appendChild(c);
    });
  }
  /* Pinned: the owner's favourites, at the top (under the search); hidden until he pins one */
  function drawPins() {
    var box = $('pins'), sec = $('pinSec'); if (!box || !sec || !C) return;
    clear(box);
    var list = pinIds().map(C.byId).filter(Boolean);
    sec.hidden = !list.length;
    chips(box, list);
  }

  /* ------------------------------------------------------------------------------------------ Your six: one tap, one live line each */
  function drawQuick() {
    var HS = w.OLYMPUS_HUB_STATUS, N = S.N, X = S.extra || {}, set = function (id, text, lvl) {
      var a = d.querySelector ? d.querySelector('#quick .g-q[data-app="' + id + '"] .g-qline') : null; if (!a || !text) return; a.textContent = text; a.className = 'g-qline' + (lvl ? ' ' + lvl : '');
    };
    if (S.now && S.now.state === 'none') set('nq', 'No bot numbers here', 'bad');
    else if (N && S.now) {
      var rooms = (N.accts || []).map(function (a) { return money(a.room); }).join(' / ');
      set('nq', S.now.label + (S.now.state === 'on' || S.now.state === 'quiet' ? ' · today ' + moneyS(N.today) : ''), S.now.state === 'on' ? 'ok' : S.now.state === 'quiet' || S.now.state === 'stopped' ? 'warn' : 'bad');
      if (rooms) set('aegis', rooms + ' left', '');
    }
    if (!HS) return;
    var ctx = { N: N, K: X.K, M: X.M, P: X.P, cards: X.cards || {} }, L;
    if (N && !N.win) N.win = nextWindow({}, nowS());
    L = HS.hubLine('today', ctx); if (L && L.text && N) set('compass', L.text.split(' · ')[0], L.lvl);
    if (X.M && X.M.has) { L = HS.hubLine('money', ctx); set('ledger', 'Month ' + moneyS(X.M.month) + ' · all ' + moneyS(X.M.all), L && L.lvl); }
    if (X.P && X.P.has) { L = HS.hubLine('plan', ctx); if (L) set('planner', L.text.split(' · ')[0], ''); }
    if (X.K && X.K.has) set('kalshi', (X.K.balance != null ? money(X.K.balance) : 'Bot on') + (X.K.today != null ? ' · today ' + moneyS(X.K.today) : ''), X.K.today != null && X.K.today < 0 ? 'warn' : 'ok');
  }

  /* ------------------------------------------------------------------------------------------ All apps A to Z (gate/#az): one sheet, big rows, a star to pin */
  var AZ = { el: null, opener: null, open: false };
  function buildAZ() {
    var scrim = el('div', 'g-azscrim'), sh = el('section', 'g-azsheet');
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'azH'); sh.id = 'azSheet';
    var head = el('div', 'g-azhead'), h = el('h2', '', 'All apps A to Z'); h.id = 'azH';
    var close = el('button', 'g-btn g-azclose', 'Close'); close.type = 'button'; close.id = 'azClose';
    head.appendChild(h); head.appendChild(close);
    var box = el('div', 'g-search'), inp = el('input'); inp.type = 'search'; inp.id = 'azQ';
    inp.placeholder = 'Filter: type a few letters'; inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('spellcheck', 'false'); inp.setAttribute('aria-label', 'Filter the list of apps');
    var sic = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); sic.appendChild(sv('circle', { cx: '10.5', cy: '10.5', r: '6.5' })); sic.appendChild(sv('path', { d: 'M15.5 15.5 21 21' }));
    box.appendChild(sic); box.appendChild(inp);
    var tip = el('p', 'g-hint g-aztip', 'Tap the star to pin an app to the top of Home.');
    var body = el('div', 'g-azbody'); body.id = 'azList';
    sh.appendChild(head); sh.appendChild(box); sh.appendChild(tip); sh.appendChild(body);
    d.body.appendChild(scrim); d.body.appendChild(sh);
    close.addEventListener('click', closeAZ); scrim.addEventListener('click', closeAZ);
    inp.addEventListener('input', fillAZ);
    d.addEventListener('keydown', function (e) {
      if (!AZ.open) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeAZ(); return; }
      if (e.key !== 'Tab') return;
      var f = sh.querySelectorAll('a[href], button, input'); if (!f.length) return;
      if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    AZ.el = { scrim: scrim, sh: sh, inp: inp, body: body, close: close };
  }
  function fillAZ() {
    var body = AZ.el.body, q = C.norm(AZ.el.inp.value || ''), letter = '', list = null, n = 0; clear(body);
    C.az().forEach(function (a) {
      if (q && C.norm(a.label + ' ' + a.name + ' ' + a.line + ' ' + a.words).indexOf(q) < 0) return;
      var L = a.section === 'workshop' ? 'Workshop' : C.norm(a.label).charAt(0).toUpperCase();
      if (/[0-9]/.test(L)) L = '#';
      if (L !== letter) { letter = L; body.appendChild(el('h3', 'g-azl', L)); list = el('div', 'g-list g-azlist'); body.appendChild(list); }
      list.appendChild(withStar(row(a), a)); n++;
    });
    if (!n) body.appendChild(el('p', 'g-empty', 'No app matches "' + AZ.el.inp.value + '".'));
  }
  function openAZ(opener) {
    if (!C || !C.az) return false;
    if (!AZ.el) buildAZ();
    if (AZ.open) return true;
    AZ.open = true; AZ.opener = opener || null; AZ.el.inp.value = ''; fillAZ();
    AZ.el.scrim.hidden = false; AZ.el.sh.hidden = false; d.documentElement.className += ' g-locked';
    try { AZ.el.close.focus({ preventScroll: true }); } catch (e) { AZ.el.close.focus(); }
    return true;
  }
  function closeAZ() {
    if (!AZ.open) return;
    AZ.open = false; AZ.el.scrim.hidden = true; AZ.el.sh.hidden = true;
    d.documentElement.className = d.documentElement.className.replace(/\s*g-locked/g, '');
    if (/#az$/.test(w.location.hash || '')) { try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) { /* fine */ } }
    drawPins();
    if (AZ.opener && AZ.opener.focus) { try { AZ.opener.focus({ preventScroll: true }); } catch (e) { AZ.opener.focus(); } }
  }

  /* ------------------------------------------------------------------------------------------ search */
  function plainRow(href, label, line, where, glyph, attr, val) {
    var r = el('a', 'g-row'); r.href = href; r.setAttribute(attr, val);
    var t = el('span', 'g-txt'), ic = el('span', 'g-ico', glyph); ic.setAttribute('aria-hidden', 'true');
    t.appendChild(el('b', '', label)); t.appendChild(el('small', '', line)); t.appendChild(el('span', 'g-where', where));
    r.appendChild(ic); r.appendChild(t); r.appendChild(chevron()); return r;
  }
  function drawResults() {
    var box = $('results'), q = ($('q').value || '').replace(/^\s+|\s+$/g, ''); clear(box);
    if (!q || !C) return;
    var F = C.findAll ? C.findAll(q, 8) : { hubs: C.findHubs ? C.findHubs(q) : [], actions: [], apps: C.find(q, 8), tabs: [] };
    if (!F.apps.length && !F.hubs.length && !F.actions.length && !F.tabs.length) { box.appendChild(el('p', 'g-empty', 'Nothing found for "' + q + '". Try a plain word like money, risk or news, or open All apps A to Z.')); return; }
    F.hubs.forEach(function (h) {   // a page hub (Me) has no app of its own: "health", "wifi", "cards" find the hub itself
      box.appendChild(plainRow(base + 'hub/index.html?h=' + h.id, h.name, h.line, 'a hub', h.name.charAt(0), 'data-hub', h.id));
    });
    F.actions.forEach(function (x) {   // a plain thing to do ("Drawdown left", "Change the look", "All apps A to Z")
      var r = plainRow(base + x.path, x.label, x.line, 'a shortcut', '\u203a', 'data-act', x.id);
      if (x.id === 'act-az') r.addEventListener('click', function (e) { if (openAZ(r)) e.preventDefault(); });
      box.appendChild(r);
    });
    F.apps.forEach(function (a) { box.appendChild(withStar(row(a), a)); });
    F.tabs.forEach(function (t) {   // a hub tab ("Bots & Evals > Risk"): every app for that job, best first
      box.appendChild(plainRow(base + t.path, t.label, t.line, 'a hub tab', '\u2261', 'data-tab', t.id));
    });
  }

  /* ------------------------------------------------------------------------------------------ Right now */
  function getJSON(url) {
    if (!w.fetch) return { then: function (ok) { ok(null); return { 'catch': function () {} }; } };
    return w.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json()['catch'](function () { return null; }) : null; })['catch'](function () { return null; });
  }
  function getTruth(cb) {   // olympus/truth.js is an ES module: a one-line module tag hands it over; 2.5 s, then the light copy below
    if (w.OLYMPUS_TRUTH) { cb(w.OLYMPUS_TRUTH); return; }
    var done = false, fin = function () { if (done) return; done = true; cb(w.OLYMPUS_TRUTH || null); };
    w.addEventListener('gate-truth', fin);
    try {
      var url = new w.URL(base + 'olympus/truth.js?v=q6a', w.location.href).href, s = d.createElement('script');
      s.type = 'module';
      s.textContent = 'import * as T from ' + JSON.stringify(url) + '; window.OLYMPUS_TRUTH = T; window.dispatchEvent(new Event("gate-truth"));';
      d.head.appendChild(s);
    } catch (e) { fin(); return; }
    w.setTimeout(fin, 2500);
  }
  /* the light copy of truth.js's rules, used only when truth.js does not load */
  function lightAges(home, t) {
    var pcT = num(obj(obj(home.live).pc).t); if (pcT == null) pcT = num(obj(home.board).data_t);
    var b = Date.parse(String(home.built || '')), cloudT = isFinite(b) ? b / 1000 : num(obj(home.board).t);
    return { pc: { t: pcT, age: pcT == null ? null : Math.max(0, Math.floor(t - pcT)) }, cloud: { t: cloudT, age: cloudT == null ? null : Math.max(0, Math.floor(t - cloudT)) } };
  }
  function lightAccounts(home) {
    var board = obj(home.board), out = {};
    [['lit', 'Zlarior', '50K', 2000], ['atlas', 'ATLAS', '25K', 1000]].forEach(function (m) {
      var b = obj(board[m[0]]), room = num(b.room);
      out[m[0]] = { has: room != null, name: m[1], size: m[2], room: room, mll: num(b.mll) || m[3], today: num(b.today_pnl) || num(b.today) || 0, paper: false };
    });
    return out;
  }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function etNow(t) {
    try {
      var p = {}, parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t * 1000));
      parts.forEach(function (x) { p[x.type] = x.value; });
      return { wd: DAYS.indexOf(p.weekday), min: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10) };
    } catch (e) { var dt = new Date((t - 5 * 3600) * 1000); return { wd: dt.getUTCDay(), min: dt.getUTCHours() * 60 + dt.getUTCMinutes() }; }
  }
  /* LIT takes entries 02:00-15:30 ET on weekdays: the published windows first (they know the holidays), else the clock */
  function nextWindow(home, t) {
    var wins = obj(obj(home.board).lit).windows;
    if (wins instanceof Array) {
      for (var i = 0; i < wins.length; i++) {
        var o = num(obj(wins[i]).open_t), c = num(obj(wins[i]).close_t);
        if (o != null && c != null && c > t) return { open: o <= t, label: String(wins[i].label || ''), inS: o <= t ? c - t : o - t };
      }
    }
    var e = etNow(t), wd = e.wd, OPEN = 120, CLOSE = 930;
    if (wd >= 1 && wd <= 5 && e.min >= OPEN && e.min < CLOSE) return { open: true, label: DAYS[wd] + ' 02:00-15:30 ET', inS: (CLOSE - e.min) * 60 };
    var days = 0, nd = wd;
    if (!(wd >= 1 && wd <= 5 && e.min < OPEN)) { days = 1; nd = (wd + 1) % 7; while (nd === 0 || nd === 6) { days++; nd = (nd + 1) % 7; } }
    return { open: false, label: DAYS[nd] + ' 02:00-15:30 ET', inS: days * 86400 + (OPEN - e.min) * 60 };
  }
  function summarize(home, T) {
    var t = nowS(), ages = null, A = null;
    if (T) { try { ages = T.agesOf(home, t); A = T.accountsOf(home); } catch (e) { ages = null; A = null; } }
    if (!ages || !A) { ages = lightAges(home, t); A = lightAccounts(home); }
    var pc = obj(obj(home.live).pc), board = obj(home.board);
    var running = typeof pc.running === 'boolean' ? pc.running : typeof board.running === 'boolean' ? board.running : null;
    var accts = [], today = 0;
    ['lit', 'atlas'].forEach(function (k) {
      var a = A[k]; if (!a || !a.has) return;
      accts.push({ key: k, name: a.name + ' ' + a.size, room: num(a.room), mll: num(a.mll) });
      today += num(a.today) || 0;
    });
    /* cities3 2026-11-20 (owner: "a one-glance money row"): EVERY real account (Zlarior 50K, ATLAS funded 25K, Zlarior 25K #2, later Rapid) as a card:
       balance, drawdown room, $ to pass (eval) or $ to the payout ask (funded, board.atlas.funded.to_ask), today's $ */
    var cards = [];
    ['lit', 'atlas'].forEach(function (k) {
      var a = A[k]; if (!a || !a.has) return;
      var fd = obj(obj(board[k]).funded), funded = a.kind === 'funded' || obj(board[k]).stage === 'funded';
      cards.push({ key: k, name: a.name, size: a.size, kind: funded ? 'funded' : 'eval', balance: num(a.balance), room: num(a.room), mll: num(a.mll), toPass: funded ? null : num(a.toTarget),
        toAsk: funded ? (num(fd.to_ask) != null ? num(fd.to_ask) : num(a.toTarget)) : null, askAt: funded ? num(fd.ask_at_balance) : null, today: num(a.today) || 0 });
    });
    if (T && T.extraOf) { try { T.extraOf(home).forEach(function (a) { cards.push({ key: a.key, name: a.name, size: a.size, kind: a.kind, balance: num(a.balance), room: num(a.room), mll: num(a.mll), toPass: num(a.toTarget), toAsk: null, askAt: null, today: num(a.today) || 0 }); today += num(a.today) || 0; }); } catch (e) { /* the two bots' rows stay */ } }
    return { t: t, pcT: ages.pc.t, pcAge: ages.pc.age, cloudAge: ages.cloud ? ages.cloud.age : null, running: running, accts: accts, cards: cards, today: today, win: nextWindow(home, t), truth: !!T, has: true };
  }
  /* one fact of the grid: a label, the number, one small line; a tap opens the app that holds the detail */
  function fact(box, label, value, sub, cls, to, key) {
    var cell = el(to ? 'a' : 'div', 'g-fact');
    if (to) { cell.href = base + to; cell.setAttribute('data-go', key || ''); }
    cell.appendChild(el('span', 'g-fl', label)); cell.appendChild(el('span', 'g-fv' + (cls ? ' ' + cls : ''), value));
    if (sub) cell.appendChild(el('span', 'g-fsub', sub));
    box.appendChild(cell);
  }
  function drawNow(N, from) {
    var card = $('now'), badge = $('nowBadge'), line = $('nowLine'), dl = $('nowFacts'), btn = $('bringBack'), foot = $('nowFoot');
    var st, words = N.pcAge == null ? '' : ageWords(N.pcAge);
    if (from === 'none') st = ['none', 'bad', 'No numbers', 'No bot numbers reached this page.'];
    else if (N.pcT == null) st = ['stale', 'bad', 'No report', 'Your PC has not reported yet, so the bots cannot be seen from here.'];
    else if (N.pcAge > STALE_S) st = ['stale', 'bad', 'Old numbers', 'Not hearing from your PC for ' + words + '. These numbers are old.'];
    else if (N.pcAge > FRESH_S) st = ['quiet', 'warn', 'Quiet', 'Last report from your PC ' + words + ' ago. The bots may still be trading.'];
    else if (N.running === false) st = ['stopped', 'warn', 'Stopped', 'Your PC reported ' + words + ' ago: the bots are stopped there.'];
    else st = ['on', 'ok', 'Bots on', 'The bots are on. Last report ' + words + ' ago.'];
    if (from === 'cache') st[3] = 'No new numbers reached this page. The last ones this phone saw are below.';
    card.setAttribute('data-state', st[0]);
    badge.className = 'g-badge ' + st[1]; badge.textContent = st[2]; line.textContent = st[3];
    clear(dl);
    var old = st[0] === 'stale' || from === 'cache';
    drawMoney(N, from, old);
    if (from !== 'none') {
      /* the owner reads these first (lead, round 4): drawdown left per account and today's $, then the window; the money row above adds balances */
      var dd = N.cards && N.cards.length ? N.cards : (N.accts || []);
      dd.forEach(function (a) { fact(dl, 'Drawdown left', money(a.room), 'of ' + money(a.mll) + ' max loss, ' + acctName(a), num(a.room) != null && num(a.mll) && a.room / a.mll < 0.35 ? 'down' : '', 'aegis/index.html', 'aegis'); });
      if (!dd.length) fact(dl, 'Drawdown left', 'Not in the report', '', '', 'nq/index.html', 'nq');
      fact(dl, old ? 'Last report day' : 'Today', moneyS(N.today), dd.length > 1 ? plural(dd.length, 'account') : 'the eval account', N.today > 0.5 ? 'up' : N.today < -0.5 ? 'down' : '', 'nq/index.html', 'nq');
    }
    var W = N.win || nextWindow({}, nowS());
    fact(dl, 'Trade window', W.open ? 'Open now' : W.label.replace(/ 02:00-15:30 ET$/, ' 02:00 ET'), W.open ? 'until 15:30 ET' : inWords(W.inS), '', 'kairos/index.html', 'kairos');
    if (dl.lastChild) { dl.lastChild.setAttribute('data-win', W.open ? 'open' : 'shut'); dl.lastChild.setAttribute('data-ins', String(Math.round(W.inS || 0))); }   /* night-effects: the market-clock ring (olympus/home-fx.js) */
    drawExtra(dl);
    dl.hidden = false; dl.removeAttribute('aria-hidden');
    btn.hidden = !(st[0] === 'stale');
    if (from === 'none') foot.textContent = 'This copy of the site has no live numbers. Bots & Evals shows the full status where it can.';
    else if (from === 'cache') foot.textContent = 'Saved on this phone ' + ageWords(nowS() - (N.saved || nowS())) + ' ago.';
    else if (from === 'pc') foot.textContent = 'Live from your PC. Updates every minute.';
    else foot.textContent = old ? '' : (N.cloudAge != null ? 'Cloud copy ' + ageWords(N.cloudAge) + ' old.' : '');
    S.now = { state: st[0], label: st[2], from: from || 'live', truth: !!N.truth };
    S.N = N;
  }
  /* cities3 2026-11-20: the money row = one swipeable strip of account cards (+ Kalshi), each a tap to its detail. The strip keeps its height
     from the first paint (a placeholder card), so nothing below jumps when the numbers land (CLS 0). */
  function drawMoney(N, from, old) {
    var box = $('money'); if (!box) return;
    clear(box);
    var cards = from === 'none' ? [] : (N.cards || (N.accts || []).map(function (a) {   // a copy this phone saved before the money row: the drawdown it knew
      return { key: a.key, name: a.name, size: '', kind: 'eval', balance: null, room: num(a.room), mll: num(a.mll), toPass: null, toAsk: null, today: null };
    }));
    var strip = el('div', 'g-mstrip'); strip.setAttribute('role', 'list');
    cards.forEach(function (c) {
      var a = el('a', 'g-acct g-acct-' + c.kind); a.setAttribute('role', 'listitem');
      a.href = base + (c.kind === 'funded' ? 'business/mffu.html' : 'aegis/index.html'); a.setAttribute('data-go', c.key);
      a.setAttribute('aria-label', acctName(c) + ', ' + (c.kind === 'funded' ? 'funded' : 'eval') + ': balance ' + (c.balance != null ? money(c.balance) : 'unknown') + '. Drawdown left ' + money(c.room) + ' of ' + money(c.mll) + ' max loss, ' + c.name + '.' + (c.today != null ? ' Today ' + moneyS(c.today) + '.' : ''));
      var top = el('span', 'g-atop'); top.appendChild(el('b', 'g-an', acctName(c))); top.appendChild(el('i', 'g-ak', c.kind === 'funded' ? 'Funded' : 'Eval')); a.appendChild(top);
      a.appendChild(el('span', 'g-mv g-abal', c.balance != null ? money(c.balance) : '—'));
      var frac = c.room != null && c.mll ? Math.max(0, Math.min(1, c.room / c.mll)) : 0;
      var bar = el('span', 'g-abar' + (frac < 0.35 ? ' low' : '')); var fill = el('i'); fill.style.width = Math.round(frac * 100) + '%'; bar.appendChild(fill); a.appendChild(bar);
      var goal = c.kind === 'funded' ? (c.toAsk != null ? (c.toAsk <= 0 ? 'Payout ready' : money(c.toAsk) + ' to payout') : 'Funded') : (c.toPass != null ? (c.toPass <= 0 ? 'Target hit' : money(c.toPass) + ' to pass') : '');
      a.appendChild(el('span', 'g-aln g-agoal', goal || (c.kind === 'funded' ? 'Funded' : '')));
      if (c.today != null) { var ln = el('span', 'g-aln', (old ? 'last day ' : 'today ')); ln.appendChild(el('b', 'g-aday ' + (c.today > 0.5 ? 'up' : c.today < -0.5 ? 'down' : ''), moneyS(c.today))); a.appendChild(ln); }
      strip.appendChild(a);
    });
    var X = S.extra, K = X && X.K;
    if (K && K.has) {
      var k = el('a', 'g-acct g-acct-kalshi'); k.setAttribute('role', 'listitem'); k.href = base + 'kalshi/index.html'; k.setAttribute('data-go', 'kalshi');
      var kt = el('span', 'g-atop'); kt.appendChild(el('b', 'g-an', 'Kalshi')); kt.appendChild(el('i', 'g-ak', K.paper === false ? 'Live' : 'Bot')); k.appendChild(kt);
      k.appendChild(el('span', 'g-mv g-abal', K.balance != null ? money(K.balance) : 'Bot on'));
      k.appendChild(el('span', 'g-aln', K.age != null && HSok() ? 'updated ' + w.OLYMPUS_HUB_STATUS.shortAge(K.age) : 'gold + silver clock bets'));
      if (K.today != null) { var kl = el('span', 'g-aln g-agoal', 'today '); kl.appendChild(el('b', 'g-aday ' + (K.today > 0.5 ? 'up' : K.today < -0.5 ? 'down' : ''), moneyS(K.today))); k.appendChild(kl); }
      strip.appendChild(k);
    }
    if (!strip.firstChild) { var e = el('div', 'g-acct g-aempty'); e.appendChild(el('b', 'g-an', 'No account numbers here')); e.appendChild(el('span', 'g-aln', 'They show when your PC reports.')); strip.appendChild(e); }
    box.appendChild(strip);
    box.setAttribute('data-n', String(cards.length));
  }
  function acctName(a) { var n = String(a.name || ''); return a.size && n.indexOf(a.size) < 0 ? n + ' ' + a.size : n; }   // "Zlarior 25K #2" keeps its own size
  function HSok() { return !!(w.OLYMPUS_HUB_STATUS && w.OLYMPUS_HUB_STATUS.shortAge); }
  /* Kalshi and the plan: only when they have something real (kalshi.json reached the page; the Planner's summary is today's) */
  function drawExtra(box) {
    var X = S.extra, HS = w.OLYMPUS_HUB_STATUS; if (!X || !HS) return;
    var K = X.K, P = X.P;
    if (K && K.has && !$('money')) fact(box, 'Kalshi', K.balance != null ? money(K.balance) : 'Bot on', K.today != null ? 'today ' + moneyS(K.today) : (K.age != null ? 'updated ' + HS.shortAge(K.age) : ''), K.today != null ? (K.today > 0.5 ? 'up' : K.today < -0.5 ? 'down' : '') : '', 'kalshi/index.html', 'kalshi');
    if (P && P.has && P.shift) fact(box, 'My shift', P.shift.now ? 'Now' + (P.shift.end ? ' to ' + P.shift.end : '') : P.shift.start + (P.shift.end ? '-' + P.shift.end : ''), P.shift.title, '', 'planner/index.html', 'planner');
    else if (P && P.has && P.next) fact(box, 'Next on your plan', P.next.start, P.next.title, '', 'planner/index.html', 'planner');
  }
  /* served by the PC's own bot server through the private Tailscale link (engine/live_site.py serves the site at /site/): the bot's live
     numbers from /api/site/live.json, laid over home.json with pc_feed.js (the same rules as every app), refreshed every minute */
  var ON_PC = /^\/site\//.test(w.location.pathname || ''), LIVE_API = '/api/site/live.json', LIVE_EVERY_MS = 60000;
  function liveOver(home, live) {
    if (!live || live.kind !== 'le-live' || num(live.t) == null) return null;
    var h = home && typeof home === 'object' && !(home instanceof Array) ? home : {};
    if (w.PC_FEED && w.PC_FEED.overlayHome) return w.PC_FEED.overlayHome(h, live, nowS());
    var lv = obj(h.live), pc = {}, k, src = obj(live.pc), out = {};   /* pc_feed.js missing: the essentials only */
    for (k in obj(lv.pc)) pc[k] = lv.pc[k];
    for (k in src) pc[k] = src[k];
    pc.present = true; pc.t = num(live.t); pc.live = true;
    for (k in h) out[k] = h[k];
    out.live = {}; for (k in lv) out.live[k] = lv[k];
    out.live.pc = pc; if (live.pc_verdict) out.live.pc_verdict = live.pc_verdict;
    if (live.board && !live.board.error) out.board = live.board;
    return out;
  }
  /* the other sources of the home: Kalshi's feed copy, the money scoreboard, two status cards; the Planner's summary from this phone */
  function loadExtra(then) {
    var HS = w.OLYMPUS_HUB_STATUS;
    if (!HS) { then(); return; }
    var got = { k: null, sb: null, me: null, cards: {} }, left = 5;
    var one = function () { left--; if (left > 0) return; var t = nowS(); S.extra = { K: HS.kalshiOf(got.k, t), M: HS.moneyOf(got.sb), P: HS.planOf(lsGet(LS_PLAN), t), ME: HS.meOf ? HS.meOf(got.me, t) : null, cards: got.cards }; then(); };
    getJSON(base + 'kalshi.json').then(function (j) { got.k = j; one(); });
    getJSON(base + 'me/me.json').then(function (j) { got.me = j; one(); });   // the Me hub's tiles: only the PC's own link serves it (a 404 elsewhere)
    getJSON(base + 'money/scoreboard.json').then(function (j) { got.sb = j; one(); });
    getJSON(base + 'hephaestus/jarvis.json').then(function (j) { got.cards.hephaestus = j; one(); });
    getJSON(base + 'plutus/jarvis.json').then(function (j) { got.cards.plutus = j; one(); });
  }
  function loadNow() {
    var liveP = ON_PC ? getJSON(LIVE_API) : null, extraDone = false, homeArgs = null;
    var go = function () { if (extraDone && homeArgs) show(homeArgs[0], homeArgs[1]); };
    loadExtra(function () { extraDone = true; go(); });
    getJSON(base + 'home.json').then(function (home) {
      if (!liveP) { homeArgs = [home, null]; go(); return; }
      liveP.then(function (live) { homeArgs = [home, live]; go(); });
    });
  }
  function show(home, live) {
    var over = liveOver(home, live);
    if (over) home = over;
    if (!home || typeof home !== 'object' || home instanceof Array) {
      var c = lsGet(LS_NOW);
      if (c && c.N) { c.N.saved = c.saved; c.N.win = null; c.N.has = true; drawNow(c.N, 'cache'); } else drawNow({ accts: [], today: 0, pcT: null, pcAge: null, has: false }, 'none');
      drawHubs(S.now && S.now.from === 'cache' ? c.N : { has: false, accts: [], win: null }, true);
      drawQuick();
      S.nowDone = true; return;
    }
    getTruth(function (T) {
      var paint = function (h, fromPc) {
        var N = summarize(h, T);
        drawNow(N, fromPc ? 'pc' : 'live');
        drawHubs(N, true);
        drawQuick();
        var keep = { pcT: N.pcT, pcAge: N.pcAge, running: N.running, accts: N.accts, cards: N.cards, today: N.today };
        lsSet(LS_NOW, { saved: nowS(), N: keep });
        S.nowDone = true;
      };
      paint(home, !!over);
      /* SYNC (night A 2026-11-16): the PC's ntfy report laid over home.json when newer (truth.withPcFeed, the rule NQ, Aegis, Helios and
         Jarvis use), so the Gate never shows an older drawdown than the apps; drawn first from home.json, again only when the feed is newer */
      if (!over && T && typeof T.withPcFeed === 'function') {
        T.withPcFeed(home).then(function (h2) { if (h2 && h2 !== home) paint(h2, true); }, function () { /* home.json stays */ });
      }
    });
  }

  /* ------------------------------------------------------------------------------------------ Look: the OLYMPUS theme (olympus/themes.js)
     Two tabs. "One look": Agora + the 32 looks in four groups as swatches (a tiny card in the theme's own page, card, accent, gain green and loss
     red); a tap is one look for everything ('olympus.theme', and the mix cleared). "Mix": each of the nine hubs (gate-catalog.js HUBS: the hub page
     hub/?h=<id> and every app filed in it) and this Gate get their own look ('olympus.themeMix' = { district, app, of }; app beats district beats the one look), or one of three ready-made combos. Jarvis's Look
     sheet writes the same keys, so both stay in sync; other tabs follow through the storage event. Hidden when the engine is not served. */
  // the parts a mix can colour: the catalog's own districts (or its hubs, when it has them), never the start row or the workshop, + this Gate
  function parts() {
    var L = (C && (C.hubs || C.districts)) || [{ id: 'trading', name: 'Trading' }, { id: 'money', name: 'Money' }, { id: 'life', name: 'Life' }, { id: 'worlds', name: 'Worlds' }], o = [];
    for (var i = 0; i < L.length; i++) if (L[i].id !== 'start' && L[i].id !== 'workshop') o.push([L[i].id, L[i].name]);
    o.push(['gate', 'This Gate']);
    return o;
  }
  // the combos are written per v1 district; a hub takes its district's look (gate-catalog.js HUBS legacy: Today, Bots, Research -> trading ...)
  function legacyOf(id) { var h = C && C.hub ? C.hub(id) : null; return h && h.legacy ? h.legacy : id; }
  function comboOf(c) { var o = {}, P = parts(); for (var j = 0; j < P.length; j++) { var k = P[j][0], v = c[k] || c[legacyOf(k)]; if (k !== 'gate' && v) o[k] = v; } return o; }
  var COMBOS = [['Trader', 'A trading screen for trading, a clean bank for money', { trading: 'amber', money: 'stocks', life: 'forest', worlds: 'aurora' }],
    ['Luxury', 'Black and gold, navy, rose gold, a sunset', { trading: 'noir', money: 'royal', life: 'rosegold', worlds: 'sunset' }],
    ['Clean', 'Light and calm, a navy night for the worlds', { trading: 'stocks', money: 'ivory', life: 'ivory', worlds: 'midnight' }]];
  function swatch(T, t, small) {
    var k = t.tokens, sty = t.style || null, p = el('span', 'g-swp'), bar = el('i', 'g-swbar'), up = el('i', 'g-swup', '+$'), dn = el('i', 'g-swdn', '−$'), dot = el('i', 'g-swdot');
    p.setAttribute('aria-hidden', 'true');
    p.style.background = sty ? sty.page : k.bg; p.style.borderColor = k.line;
    bar.style.background = sty ? sty.card : k.bg2; bar.style.borderColor = k.accent;
    if (sty && t.feel && t.feel.radius) bar.style.borderRadius = Math.min(parseFloat(t.feel.radius) || 0, 6) + 'px';
    up.style.color = k.ok; dn.style.color = k.bad; dot.style.background = k.accent;
    bar.appendChild(dot); p.appendChild(bar);
    if (!small) { p.appendChild(up); p.appendChild(dn); }
    return p;
  }
  function look() {
    var T = w.OLYMPUS_THEMES;
    if (!T || !T.plain) return false;
    T.apply('page', { meta: true });
    var host = $('looks'), mixHost = $('lookMix'), sec = $('lookSec'), tabs = [$('lookTab1'), $('lookTab2')];
    var mode = T.getMix && T.getMix() ? 'mix' : 'one';
    function ofMap() {   // app -> district (or hub), from the catalog; the dashboard and Jarvis start in the first one that is not 'start' (Trading)
      var o = {}, P = parts(), ok = {}, first = P.length > 1 ? P[0][0] : '';
      for (var j = 0; j < P.length; j++) ok[P[j][0]] = 1;
      if (first) o.today = first;
      if (C) for (var i = 0; i < C.apps.length; i++) { var a = C.apps[i], dd = a.hub || a.district; if (ok[dd] && dd !== 'gate') o[a.id] = dd; }
      for (var q = 0; q < P.length; q++) if (P[q][0] !== 'gate') o['hub-' + P[q][0]] = P[q][0];   // the hub page itself (hub/?h=<id>: <html data-oly-page="hub-<id>">)
      return o;
    }
    function ordered() {   // Agora, then the groups (Dark, Light, Bold, Luxury)
      var gs = T.groups ? T.groups() : [{ id: 'all', name: 'Looks', themes: T.plain().slice(1) }], o = [{ id: 'default', name: 'Default', themes: [T.get(T.DEFAULT)] }];
      return o.concat(gs);
    }
    function current() {   // a mix saved per v1 district (trading / money / life) reads as the hubs that replaced them
      var m = T.getMix(); if (!m) return { district: {}, app: {}, of: {} };
      var dist = m.district || {}, P = parts(), ok = {}, out = {}, k, j;
      for (j = 0; j < P.length; j++) ok[P[j][0]] = 1;
      for (k in dist) if (ok[k]) out[k] = dist[k];
      for (j = 0; j < P.length; j++) { k = P[j][0]; if (!out[k] && k !== 'gate' && dist[legacyOf(k)] && !ok[legacyOf(k)]) out[k] = dist[legacyOf(k)]; }
      return { district: out, app: m.app || {}, of: m.of || {} };
    }
    function setOne(id) { endPreview(); T.set(id); draw(); }
    /* PICKER v2 (2026-11-14, team T2 "lock down the looks"): the look on now in a card at the top (its swatch, name and mood; Surprise me), a search
       by name or mood, a Favourites row (a star on the preview bar keeps a look there: 'olympus.theme.fav', this phone), the groups. A long press
       (or a mouse hover) on a swatch shows that look on this page only (OLYMPUS_THEMES.preview), with a bar at the bottom: Use it, the star,
       Cancel; nothing is stored until Use it. Every target is 44 px+, the bar sits at the bottom where a thumb reaches, one hand at 375 px. */
    var LS_FAV = 'olympus.theme.fav', prev = { id: null, pinned: false, surprise: false }, query = '', rest = null;
    function favs() { var f = lsGet(LS_FAV); return f instanceof Array ? f.filter(function (x) { return typeof x === 'string' && T.get(x).id === x; }) : []; }
    function toggleFav(id) { var f = favs(), i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); lsSet(LS_FAV, f.slice(0, 12)); }
    function preview(id, pinned, surprise) {
      if (!T.preview) return;
      prev.id = id; prev.pinned = !!pinned; prev.surprise = !!surprise;
      T.preview(id);
      if (pinned) bar(); else hideBar();
    }
    function endPreview() { if (prev.id && T.preview) T.preview(null); prev.id = null; prev.pinned = false; prev.surprise = false; hideBar(); }
    function hideBar() { var b = $('lookBar'); if (b) b.hidden = true; }
    function bar() {
      var b = $('lookBar'), t = T.get(prev.id), isFav = favs().indexOf(prev.id) >= 0;
      if (!b) { b = el('div', 'g-lkbar'); b.id = 'lookBar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Look preview'); d.body.appendChild(b); }
      clear(b);
      var txt = el('p', 'g-lkbar-t'); txt.setAttribute('aria-live', 'polite');
      txt.appendChild(el('b', '', (prev.surprise ? 'Surprise: ' : 'Preview: ') + t.name)); txt.appendChild(el('small', '', (t.tag || '').split(' · ')[0] + '. Only this page, until you use it.'));
      var row = el('div', 'g-lkbar-b');
      var use = el('button', 'g-btn primary', 'Use it'); use.type = 'button'; use.id = 'lookUse';
      use.addEventListener('click', function () { setOne(t.id); });
      var star = el('button', 'g-btn g-lkstar', isFav ? '★ Saved' : '☆ Favourite'); star.type = 'button'; star.setAttribute('aria-pressed', String(isFav));
      star.addEventListener('click', function () { toggleFav(t.id); bar(); drawOne(); });
      row.appendChild(use); row.appendChild(star);
      if (prev.surprise) { var again = el('button', 'g-btn', 'Another'); again.type = 'button'; again.addEventListener('click', surprise); row.appendChild(again); }
      var no = el('button', 'g-btn', 'Cancel'); no.type = 'button'; no.addEventListener('click', function () { endPreview(); drawOne(); });
      row.appendChild(no);
      b.appendChild(txt); b.appendChild(row); b.hidden = false;
    }
    function surprise() {
      var all = T.plain(), cur = T.global(), pool = all.filter(function (x) { return x.id !== cur && x.id !== prev.id; });
      if (!pool.length) return;
      preview(pool[Math.floor(Math.random() * pool.length)].id, true, true);
    }
    function nowCard() {
      var mixed = !!T.getMix(), t = T.get(mixed ? T.id() : T.global()), box = el('div', 'g-lknow');
      box.id = 'lookNow';
      var sw = swatch(T, t); sw.className += ' g-lknow-sw';
      var tx = el('p', 'g-lknow-t');
      tx.appendChild(el('small', '', mixed ? 'On now: a mix (this page wears)' : 'On now'));
      tx.appendChild(el('b', '', t.name)); tx.appendChild(el('span', '', t.tag || ''));
      var sb = el('button', 'g-btn g-surprise', 'Surprise me'); sb.type = 'button'; sb.id = 'lookSurprise';
      sb.setAttribute('aria-label', 'Surprise me: preview a look picked at random');
      sb.addEventListener('click', surprise);
      box.appendChild(sw); box.appendChild(tx); box.appendChild(sb);
      return box;
    }
    function matches(t) {
      if (!query) return true;
      var q = query.toLowerCase(), hay = (t.name + ' ' + (t.tag || '') + ' ' + (t.group || '') + ' ' + t.id).toLowerCase();
      return q.split(/\s+/).every(function (w2) { return hay.indexOf(w2) >= 0; });
    }
    function setPart(part, id) {
      var m = current(), o = { district: m.district || {}, app: m.app || {}, of: ofMap() };
      if (part === 'gate') { if (id) o.app.gate = id; else delete o.app.gate; } else if (id) o.district[part] = id; else delete o.district[part];
      T.setMix(o); draw();
    }
    function useCombo(c) { var m = current(); T.setMix({ district: comboOf(c), app: m.app || {}, of: ofMap() }); draw(); }
    function drawOne() {
      var cur = T.getMix() ? '' : T.global(), gs = ordered(), fv = favs(), shown = 0;
      // the top part (the look on now, the search) is drawn once and kept, so typing in the search never loses its focus
      var top = $('lookTop');
      if (!top) {
        top = el('div', 'g-lktop'); top.id = 'lookTop';
        host.parentNode.insertBefore(top, host);
        var sr = el('div', 'g-search g-lksearch'), q = el('input');
        sr.appendChild(searchIcon());
        q.id = 'lookQ'; q.type = 'search'; q.placeholder = 'Find a look: name or mood (navy, light, gold...)'; q.autocomplete = 'off'; q.setAttribute('autocapitalize', 'off');
        q.setAttribute('spellcheck', 'false'); q.setAttribute('aria-label', 'Find a look by name or mood'); q.setAttribute('aria-controls', 'looks'); q.setAttribute('enterkeyhint', 'search');
        q.addEventListener('input', function () { query = q.value.trim(); drawOne(); });
        sr.appendChild(q);
        top.appendChild(el('div', 'g-lknow-slot'));
        top.appendChild(sr);
      }
      var slot = top.querySelector('.g-lknow-slot'); clear(slot); slot.appendChild(nowCard());
      top.hidden = mode !== 'one';
      clear(host);
      var groups = (fv.length ? [{ id: 'fav', name: 'Favourites', themes: fv.map(function (x) { return T.get(x); }) }] : []).concat(gs);
      for (var g = 0; g < groups.length; g++) {
        var list = groups[g].themes.filter(matches);
        if (!list.length) continue;
        var head = el('p', 'g-lookg', groups[g].name), strip = el('div', 'g-swrow');
        if (groups[g].id === 'fav') head.className += ' g-lkfav';
        host.appendChild(head); host.appendChild(strip);
        for (var i = 0; i < list.length; i++) { drawSw(list[i], strip, cur, fv); if (groups[g].id !== 'fav') shown++; }
      }
      if (!shown) {
        var none = el('p', 'g-hint g-lknone', 'No look matches "' + query + '". Try a colour (blue, green, gold), light or dark.');
        host.appendChild(none);
      }
      if (!fv.length && !query) host.appendChild(el('p', 'g-hint g-lktip', 'Tip: press and hold a look to try it on this page first, then Use it or keep it as a favourite.'));
    }
    function searchIcon() { var s = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); s.appendChild(sv('circle', { cx: '10.5', cy: '10.5', r: '6.5' })); s.appendChild(sv('path', { d: 'M15.5 15.5 21 21' })); return s; }
    function drawSw(t, strip, cur, fv) {
      (function (t) {
        var b = el('button', 'g-sw'), held = false, timer = 0, hover = 0;
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t.id === cur)); b.setAttribute('data-theme-id', t.id);
        b.setAttribute('aria-label', t.name + ': ' + (t.tag || '') + (t.id === cur ? ' (on now)' : '') + '. Press and hold to preview.');
        b.appendChild(swatch(T, t)); b.appendChild(el('b', '', t.name)); b.appendChild(el('small', '', (t.tag || '').split(' · ')[0]));
        if (fv && fv.indexOf(t.id) >= 0) { var st = el('i', 'g-swfav', '★'); st.setAttribute('aria-hidden', 'true'); b.appendChild(st); }
        if (t.id === cur) { var on = el('i', 'g-swon', 'On'); on.setAttribute('aria-hidden', 'true'); b.appendChild(on); }
        b.addEventListener('click', function (e) { clearTimeout(hover); clearTimeout(timer); if (held) { held = false; e.preventDefault(); return; } rest = [e.clientX, e.clientY]; setOne(t.id); });
        // a long press: preview it here, with the bar (Use it / Favourite / Cancel)
        b.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          held = false; clearTimeout(timer);
          timer = setTimeout(function () { held = true; preview(t.id, true, false); }, 420);
        });
        var cancel = function () { clearTimeout(timer); };
        b.addEventListener('pointerup', cancel); b.addEventListener('pointercancel', cancel); b.addEventListener('pointerleave', cancel);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        // a mouse hover: the look on this page while the pointer rests there (gone when it leaves, unless the bar is open)
        b.addEventListener('pointerenter', function (e) {
          if (e.pointerType !== 'mouse' || prev.pinned) return;
          // the redraw after a pick puts another swatch under the resting mouse: that is no hover (it would preview a look nobody pointed at)
          if (rest && Math.abs(e.clientX - rest[0]) < 3 && Math.abs(e.clientY - rest[1]) < 3) return;
          rest = null;
          clearTimeout(hover); hover = setTimeout(function () { preview(t.id, false, false); }, 160);
        });
        b.addEventListener('pointerleave', function (e) {
          clearTimeout(hover);
          if (e.pointerType === 'mouse' && !prev.pinned && prev.id === t.id) endPreview();
        });
        strip.appendChild(b);
      })(t);
    }
    function drawMix() {
      var m = current(), list = [], gs = ordered(), P = parts();
      for (var g = 0; g < gs.length; g++) list = list.concat(gs[g].themes);
      clear(mixHost);
      var cs = el('div', 'g-combos');
      for (var c = 0; c < COMBOS.length; c++) (function (cb) {
        var b = el('button', 'g-combo'), on = true, dots = el('span', 'g-cdots'), want = comboOf(cb[2]), k;
        for (k in want) if ((m.district || {})[k] !== want[k]) on = false;
        for (k in cb[2]) { var dt = el('i'), th = T.get(cb[2][k]); dt.style.background = th.style ? th.style.page : th.tokens.bg; dt.style.borderColor = th.tokens.accent; dots.appendChild(dt); }
        b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('data-combo', cb[0].toLowerCase());
        b.appendChild(dots); b.appendChild(el('b', '', cb[0])); b.appendChild(el('small', '', cb[1]));
        b.addEventListener('click', function () { useCombo(cb[2]); });
        cs.appendChild(b);
      })(COMBOS[c]);
      mixHost.appendChild(cs);
      for (var r = 0; r < P.length; r++) (function (dd) {
        var row = el('div', 'g-mixrow'), strip = el('div', 'g-strip'), pick = dd[0] === 'gate' ? (m.app || {}).gate : (m.district || {})[dd[0]];
        var head = el('p', 'g-mixh'); head.appendChild(el('b', '', dd[1])); head.appendChild(el('small', '', pick ? T.get(pick).name : 'Same as one look: ' + T.get(T.global()).name));
        row.appendChild(head);
        strip.setAttribute('role', 'radiogroup'); strip.setAttribute('aria-label', dd[1] + ' look');
        var same = el('button', 'g-mini g-same', 'Same');
        same.type = 'button'; same.setAttribute('role', 'radio'); same.setAttribute('aria-checked', String(!pick)); same.setAttribute('aria-label', dd[1] + ': same as one look');
        same.addEventListener('click', function () { setPart(dd[0], ''); });
        strip.appendChild(same);
        for (var i = 0; i < list.length; i++) (function (t) {
          var b = el('button', 'g-mini');
          b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(pick === t.id)); b.setAttribute('data-theme-id', t.id);
          b.setAttribute('aria-label', dd[1] + ': ' + t.name);
          b.appendChild(swatch(T, t, true)); b.appendChild(el('small', '', t.name));
          b.addEventListener('click', function () { setPart(dd[0], t.id); });
          strip.appendChild(b);
        })(list[i]);
        row.appendChild(strip);
        mixHost.appendChild(row);
      })(P[r]);
    }
    function draw() {
      tabs[0].setAttribute('aria-selected', String(mode === 'one')); tabs[1].setAttribute('aria-selected', String(mode === 'mix'));
      host.hidden = mode !== 'one'; mixHost.hidden = mode !== 'mix';
      if ($('lookTop')) $('lookTop').hidden = mode !== 'one';
      if (mode !== 'one') endPreview();
      $('lookHint').textContent = mode === 'one' ? 'One tap changes the colours and the style everywhere: here, Jarvis and every app. Every word and number stays the same.'
        : 'Give each part its own look. A part left on Same follows the one look. One look clears the mix.';
      if (mode === 'one') drawOne(); else drawMix();
    }
    tabs[0].addEventListener('click', function () { mode = 'one'; draw(); });
    tabs[1].addEventListener('click', function () { mode = 'mix'; draw(); });
    // a new look (here, Jarvis, another tab) redraws the picker; a preview on this page never does (the finger stays on its swatch)
    T.on(function () { if (prev.id || (T.previewing && T.previewing())) return; draw(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && prev.id) { endPreview(); draw(); } });
    draw();
    sec.hidden = false;
    return true;
  }

  /* ------------------------------------------------------------------------------------------ the hubs: one live line each */
  function drawHubs(N, live) {
    var HS = w.OLYMPUS_HUB_STATUS, X = S.extra || {};
    var tiles = d.querySelectorAll('.g-hub[data-hub]');
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i], hid = t.getAttribute('data-hub'), H = C && C.hub ? C.hub(hid) : null;
      var cnt = t.querySelector('.g-hcount'); if (cnt && H) cnt.textContent = H.size || plural(H.count, 'app');
      if (!HS || !live) continue;
      var M = N ? N : null; if (M && !M.win) M.win = nextWindow({}, nowS());
      var L = HS.hubLine(hid, { N: M, K: X.K, M: X.M, P: X.P, ME: X.ME, cards: X.cards || {}, theme: HS.themeName() });
      var line = t.querySelector('.g-hline');
      if (line && L && L.text) { line.textContent = L.text; line.className = 'g-hline' + (L.lvl ? ' ' + L.lvl : ''); }
      S.hubs[hid] = L ? L.text : '';
    }
  }

  /* ------------------------------------------------------------------------------------------ 3D touch (team FX, 2026-11-15)
     The hub tiles are small slabs of stone: on a fresh open (not a reload or a Back) they rise into place in a short stagger (tilted back, then flat),
     and a finger (or a mouse) on a tile tips it toward the touch with a soft gold light where it is pressed. CSS transforms only (no WebGL,
     no frame loop): nothing under reduced motion, 3D Off / Low (LITE), or Battery quality; a scroll cancels the tilt at once. */
  function tilt3d() {
    var root = d.documentElement, grid = $('hubs'); if (!grid) return;
    var lvl = ''; try { lvl = String(JSON.parse(localStorage.getItem('jfx') || '""')); } catch (e) { try { lvl = String(localStorage.getItem('jfx') || ''); } catch (e2) { lvl = ''; } }
    var rm = false; try { rm = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { rm = false; }
    var saver = ''; try { saver = String(localStorage.getItem('olympus.saver') || ''); } catch (e) { saver = ''; }
    if (rm || /on/.test(saver) || lvl === 'off' || lvl === 'low' || root.getAttribute('data-oly-lite') === '1' || /[?&]q=(off|battery|still)(&|$)/.test(w.location.search || '')) return;
    root.setAttribute('data-g3d', '1');
    // the rise plays on a fresh open only: not on a reload, not on Back from a hub or an app (no storage needed)
    var seen = false; try { var nv = w.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null; seen = !!(nv && nv.type !== 'navigate') || (d.referrer || '').indexOf(w.location.host) >= 0; } catch (e) { seen = false; }
    if (!seen && !navigator.webdriver) {
      var tiles = grid.querySelectorAll('.g-hub'), i;
      for (i = 0; i < tiles.length; i++) tiles[i].style.setProperty('--g-rise', (i * 45) + 'ms');
      grid.classList.add('g-rise');
      w.setTimeout(function () { grid.classList.remove('g-rise'); }, 1100);
    }
    var cur = null;
    function off() { if (cur) { cur.classList.remove('g-tilt'); cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); cur = null; } }
    function aim(t, x, y) {
      var r = t.getBoundingClientRect(); if (!r.width || !r.height) return;
      var u = Math.max(0, Math.min(1, (x - r.left) / r.width)), v = Math.max(0, Math.min(1, (y - r.top) / r.height)), k = r.width > 260 ? 3 : 6;   // the wide tiles tip less
      t.style.setProperty('--rx', ((0.5 - v) * k * 1.4).toFixed(2) + 'deg'); t.style.setProperty('--ry', ((u - 0.5) * k).toFixed(2) + 'deg');
      t.style.setProperty('--mx', (u * 100).toFixed(1) + '%'); t.style.setProperty('--my', (v * 100).toFixed(1) + '%');
    }
    grid.addEventListener('pointerdown', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.g-hub') : null; if (!t) return;
      off(); cur = t; aim(t, e.clientX, e.clientY); t.classList.add('g-tilt');
    }, { passive: true });
    grid.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' && !cur) { var h = e.target && e.target.closest ? e.target.closest('.g-hub') : null; if (h) { aim(h, e.clientX, e.clientY); h.classList.add('g-hover'); } return; }
      if (cur) aim(cur, e.clientX, e.clientY);
    }, { passive: true });
    grid.addEventListener('pointerout', function (e) { var h = e.target && e.target.closest ? e.target.closest('.g-hub') : null; if (h && !h.contains(e.relatedTarget)) { h.classList.remove('g-hover'); if (h === cur) off(); } }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (n) { w.addEventListener(n, off, { passive: true }); });
    w.addEventListener('scroll', off, { passive: true });
  }

  /* ------------------------------------------------------------------------------------------ start */
  var OLD_D = { trading: 'bots', money: 'money', life: 'plan', worlds: 'worlds', workshop: 'settings', start: 'today' };
  function boot() {
    if (Q.d) {   // an old "Go to > district" link: the hub that replaced it
      var hid = OLD_D[Q.d] || (C && C.hub && C.hub(Q.d) ? Q.d : '');
      if (hid) { try { w.location.replace(base + 'hub/index.html?h=' + hid + (Q.d === 'workshop' ? '&t=workshop' : '')); return; } catch (e) { /* stay here */ } }
    }
    var looked = false; try { looked = look(); } catch (e) { /* the page works without the picker */ }
    if (!looked) try { if (w.OLYMPUS_THEMES && w.OLYMPUS_THEMES.apply) w.OLYMPUS_THEMES.apply('page', { meta: true }); } catch (e) { /* the default look */ }
    if (C) {
      $('q').addEventListener('input', drawResults);
      $('q').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var first = $('results').querySelector('a.g-row[data-app]') || $('results').querySelector('a.g-row'); if (!first) return;
        e.preventDefault(); if (first.getAttribute('data-app')) remember(first.getAttribute('data-app')); if (first.getAttribute('data-act') === 'act-az' && openAZ()) return; w.location.href = first.href;
      });
      if (Q.q) { $('q').value = Q.q; drawResults(); }
      drawRecent(); drawPins();
      drawHubs(null, false);
      var qs = d.querySelectorAll('#quick .g-q[data-app]');
      for (var qi = 0; qi < qs.length; qi++) (function (a) { a.addEventListener('click', function () { remember(a.getAttribute('data-app')); }); })(qs[qi]);
      [$('azBtn'), $('azWide')].forEach(function (b) { if (b) b.addEventListener('click', function (e) { if (openAZ(b)) e.preventDefault(); }); });
      if (/#az$/.test(w.location.hash || '')) openAZ();
      w.addEventListener('hashchange', function () { if (/#az$/.test(w.location.hash || '')) openAZ(); });
    } else {
      $('findHint').textContent = 'The app list did not load. The hubs above still open every app.';
      $('q').disabled = true;
    }
    w.addEventListener('pageshow', function (e) { if (e.persisted) { drawRecent(); drawPins(); } });
    try { tilt3d(); } catch (e) { /* the tiles work flat */ }
    loadNow();
    if (ON_PC && w.setInterval) w.setInterval(function () { if (d.visibilityState !== 'hidden') loadNow(); }, LIVE_EVERY_MS);
  }

  w.GATE = { ready: function () { return S.nowDone; }, state: S, hrefOf: hrefOf, base: base, openAZ: openAZ, closeAZ: closeAZ, pins: pinIds };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
