/* OLYMPUS Me hub (team ME1, 2026-11-14, docs/ME_HUB.md): hub/?h=me, the one organized place for personal life. Classic script, ES5, no build step.
 * Owner: "get a certain dashboard or area for personal stuff. Make everything very organized, easy to access: connecting to my finances, cards,
 * spending, WiFi, health, Apple Watch. Find more."
 * hub.js calls OLYMPUS_ME_PAGE.mount(panel, { base, now, hub, done }) for the page hub 'me' (olympus/gate-catalog.js: page 'me', its areas). It reads ONE
 * file, ../me/me.json (tools/me_hub.py on the PC, served ONLY by the PC's private Tailscale link, engine/live_site.py /site/me/; the public site has no
 * such file, so there every part says how to connect it), and draws, top to bottom:
 *   1. four status tiles: Money left this month, Health today, Home OK / issue, Next important date. Each says its value, one line, its SOURCE and the
 *      AGE of its data ("Bank exports · 3 d ago"), and is a link to its area; empty = "Not connected" + the one line that connects it
 *   2. the areas as chips (Money, Cards, Health, Home & WiFi, Freedom, Dates, Car, Streaks), then each area: its source and age, its one line, and a
 *      short card stack; one tap on a card opens its detail (a native <details>: rows with a bar, a note)
 * Read only: it fetches me/me.json and nothing else, sends nothing, stores nothing. Text only through textContent; bars are a width in %.
 * view(doc, nowS, areas) is pure (node-tested by tests/test_me_hub.py): what the page shows for a file, a missing file or a broken one. */
(function (g) {
  'use strict';
  var AREAS = [['money', 'Money', 'Spending this month vs last, subscriptions, bills due, net worth'], ['cards', 'Cards', 'Use per card, due dates, interest if carried'],
    ['health', 'Health', 'Today, last night, the week, resting heart rate and HRV'], ['home', 'Home & WiFi', 'Internet speed, outages, devices, this PC'],
    ['freedom', 'Freedom', 'Side income against your paycheck, months to quit'], ['dates', 'Dates', 'Birthdays and important days'],
    ['car', 'Car', 'Oil change, registration, mileage'], ['streaks', 'Streaks', 'Days in a row, counted for you']];
  /* how to connect each part, in one line (the same words as tools/me_hub.py CONNECT; the test keeps them equal) */
  var CONNECT = {
    money: 'On the PC: put a bank or card CSV in %USERPROFILE%\\.olympus\\money_inbox\\ and double-click tools/bat/RUN_MONEY.bat (docs/CONNECT_MONEY.md)',
    cards: 'On the PC: python tools\\me_cards.py --add (a nickname, the limit and the due day; never the card number)',
    health: "Make the iPhone Shortcut 'Health to PC' (docs/ME_HUB.md, 5 minutes, no app); it runs each evening",
    home: 'Nothing to type: it runs with the PC report every 15 minutes once this PC has the update (tools/bat/BOTS_BACK.bat set that up)',
    freedom: 'Import your bank exports (tools/bat/RUN_MONEY.bat) or type your pay on the PC: python tools\\me_life.py --paycheck 3200',
    dates: 'On the PC: python tools\\me_life.py --date "Mom\'s birthday=03-14" (calendars connected with tools/bat/CONNECT_DAY.bat count too)',
    car: 'On the PC: python tools\\me_life.py --car-miles 48210 --car-date registration=2027-03-31',
    streaks: "Counted for you once the Apple Watch days arrive (the 'Health to PC' Shortcut)"
  };
  var TILES = [['money', 'Money left this month', 'Bank exports', 'money'], ['health', 'Health today', 'Apple Watch', 'health'], ['home', 'Home', 'PC checks', 'home'],
    ['date', 'Next important date', 'Your dates + calendars', 'dates']];
  /* an empty tile says how in a few words (a half-width tile); its area below holds the exact line (CONNECT), one tap away */
  var SHORT = { money: 'A bank CSV + tools/bat/RUN_MONEY.bat on the PC', health: "The 'Health to PC' Shortcut, 5 minutes", home: 'Runs on the PC by itself',
    dates: 'Type a date on the PC, or link a calendar' };
  var LINK = 'Your numbers show only through your PC\'s own link: on the PC double-click tools/bat/LIVE_LINK.bat, then open Me from that link (docs/ME_HUB.md).';
  var LV = { ok: 1, warn: 1, bad: 1 };

  function obj(x) { return x && typeof x === 'object' && !(x instanceof Array) ? x : {}; }
  function arr(x) { return x instanceof Array ? x : []; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function txt(v, n) { return (typeof v === 'string' ? v : typeof v === 'number' && isFinite(v) ? String(v) : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, n || 160); }
  function lvl(v) { return LV[v] ? v : ''; }
  function shortAge(sec) { var s = Math.max(0, Math.floor(sec)); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; }
  function ageOf(t, nowS) { var x = num(t); if (x == null) return ''; if (x > 1e12) x = x / 1000; return shortAge(nowS - x); }
  function pctOf(v) { var x = num(v); return x == null ? null : Math.max(0, Math.min(100, x)); }

  /* ------------------------------------------------------------------------------------------ the view (pure) */
  function areasOf(a) { var L = arr(a).filter(function (x) { return x instanceof Array && typeof x[0] === 'string'; }); return L.length ? L : AREAS; }
  function emptyTile(t) { return { id: t[0], label: t[1], value: 'Not connected', sub: '', lvl: '', src: t[2], age: '', to: t[3], empty: true, connect: SHORT[t[3]] || CONNECT[t[3]] || '' }; }
  function tileOf(x, nowS) {
    var t = obj(x), base = null;
    for (var i = 0; i < TILES.length; i++) if (TILES[i][0] === t.id) base = TILES[i];
    if (!base) return null;
    if (t.empty) { var e = emptyTile(base); if (t.value && t.value !== 'Not connected') { e.value = txt(t.value, 40); e.sub = txt(t.sub, 120); } return e; }
    return { id: base[0], label: txt(t.label, 40) || base[1], value: txt(t.value, 40) || '-', sub: txt(t.sub, 120), lvl: lvl(t.lvl), src: txt(t.src, 40) || base[2],
      age: ageOf(t.t, nowS), to: txt(t.to, 20) || base[3], empty: false, connect: '' };
  }
  function rowOf(r) { var x = obj(r); return { k: txt(x.k, 60), v: txt(x.v, 60), s: txt(x.s, 160), pct: pctOf(x.pct), lvl: lvl(x.lvl) }; }
  function cardOf(c) {
    var x = obj(c);
    return { id: txt(x.id, 24), title: txt(x.title, 60), value: txt(x.value, 48) || '-', sub: txt(x.sub, 200), lvl: lvl(x.lvl), pct: pctOf(x.pct),
      rows: arr(x.rows).slice(0, 40).map(rowOf).filter(function (r) { return r.k || r.v; }), note: txt(x.note, 300) };
  }
  function emptyArea(a, why) { return { id: a[0], title: a[1], blurb: a[2], state: 'empty', line: '', src: '', age: '', connect: CONNECT[a[0]] || '', note: why || '', cards: [] }; }
  function areaOf(s, a, nowS) {
    var x = obj(s), src = obj(x.src), st = x.state === 'ok' || x.state === 'stale' ? x.state : 'empty';
    if (st === 'empty') { var e = emptyArea(a); e.connect = txt(x.connect, 220) || e.connect; e.line = txt(x.line, 120); return e; }
    return { id: a[0], title: txt(x.title, 40) || a[1], blurb: a[2], state: st, line: txt(x.line, 160), src: txt(src.name, 60), age: ageOf(src.t, nowS),
      connect: txt(x.connect, 220) || CONNECT[a[0]] || '', note: st === 'stale' ? txt(x.stale_note, 220) : '', cards: arr(x.cards).slice(0, 6).map(cardOf) };
  }
  /** the page for a file (or none): { has, built, banner, tiles: [4], areas: [8] } */
  function view(doc, nowS, areas) {
    var d = obj(doc), A = areasOf(areas), has = d.kind === 'olympus-me' && d.tiles instanceof Array && d.sections instanceof Array;
    var tiles = TILES.map(function (t) {
      if (!has) return emptyTile(t);
      for (var i = 0; i < d.tiles.length; i++) if (obj(d.tiles[i]).id === t[0]) return tileOf(d.tiles[i], nowS) || emptyTile(t);
      return emptyTile(t);
    });
    var secs = A.map(function (a) {
      if (!has) return emptyArea(a);
      for (var i = 0; i < d.sections.length; i++) if (obj(d.sections[i]).id === a[0]) return areaOf(d.sections[i], a, nowS);
      return emptyArea(a);
    });
    var age = has ? ageOf(d.t, nowS) : '', old = has && num(d.t) != null && nowS - d.t > 36 * 3600;
    return { has: has, built: age, old: !!old, banner: has ? (old ? 'Built on your PC ' + age + ': the PC may be off, so these numbers are old.' : '') : LINK,
      tiles: tiles, areas: secs, connected: secs.filter(function (s) { return s.state !== 'empty'; }).length };
  }

  /* ------------------------------------------------------------------------------------------ the page (browser only) */
  var d = g.document;
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function bar(p, l) { var b = el('span', 'me-bar' + (l ? ' ' + l : '')), i = el('i'); i.style.width = p + '%'; b.appendChild(i); b.setAttribute('aria-hidden', 'true'); return b; }

  function drawTile(t) {
    var a = el('a', 'me-tile' + (t.lvl ? ' ' + t.lvl : '') + (t.empty ? ' empty' : ''));
    a.href = '#me-' + t.to; a.setAttribute('data-tile', t.id);
    a.appendChild(el('span', 'me-tl', t.label));
    a.appendChild(el('span', 'me-tv', t.value));
    var sub = t.empty ? t.connect : t.sub;
    if (sub) a.appendChild(el('span', 'me-ts', sub));
    var src = el('span', 'me-tsrc', t.empty ? 'How to connect' : t.src + (t.age ? ' · ' + t.age : ''));
    a.appendChild(src);
    a.setAttribute('aria-label', t.label + ': ' + t.value + (sub ? '. ' + sub : '') + (t.empty ? '' : '. From ' + t.src + (t.age ? ', ' + t.age : '')));
    return a;
  }
  function drawCard(c) {
    var det = el('details', 'me-card' + (c.lvl ? ' ' + c.lvl : '')); det.setAttribute('data-card', c.id);
    var sum = el('summary'), left = el('span', 'me-ctxt');
    left.appendChild(el('span', 'me-ct', c.title));
    left.appendChild(el('span', 'me-cv', c.value));
    if (c.sub) left.appendChild(el('span', 'me-cs', c.sub));
    sum.appendChild(left);
    if (c.pct != null) sum.appendChild(bar(c.pct, c.lvl));
    det.appendChild(sum);
    var body = el('div', 'me-cbody');
    if (c.rows.length) {
      var list = el('div', 'me-rows');
      c.rows.forEach(function (r) {
        var row = el('div', 'me-row' + (r.lvl ? ' ' + r.lvl : '')), top = el('span', 'me-rtop');
        top.appendChild(el('span', 'me-rk', r.k)); top.appendChild(el('span', 'me-rv', r.v));
        row.appendChild(top);
        if (r.pct != null) row.appendChild(bar(r.pct, r.lvl));
        if (r.s) row.appendChild(el('span', 'me-rs', r.s));
        list.appendChild(row);
      });
      body.appendChild(list);
    } else body.appendChild(el('p', 'me-cnote', 'Nothing more to show yet.'));
    if (c.note) body.appendChild(el('p', 'me-cnote', c.note));
    det.appendChild(body);
    return det;
  }
  function drawArea(s) {
    var sec = el('section', 'me-sec ' + s.state); sec.id = 'me-' + s.id; sec.setAttribute('data-area', s.id); sec.setAttribute('aria-labelledby', 'me-h-' + s.id);
    var h = el('h2', 'me-h2', s.title); h.id = 'me-h-' + s.id; sec.appendChild(h);
    if (s.state === 'empty') {
      var box = el('div', 'me-empty');
      box.appendChild(el('p', 'me-eb', s.blurb));
      box.appendChild(el('p', 'me-ec', s.connect));
      sec.appendChild(box);
      return sec;
    }
    sec.appendChild(el('p', 'me-src', (s.src ? 'From ' + s.src.replace(/^(Your|What) /, function (m) { return m.toLowerCase(); }) : '') + (s.age ? ' · ' + s.age : '')));
    if (s.line) sec.appendChild(el('p', 'me-line', s.line));
    if (s.note) sec.appendChild(el('p', 'me-warn', s.note));
    var stack = el('div', 'me-stack');
    s.cards.forEach(function (c) { stack.appendChild(drawCard(c)); });
    if (!s.cards.length) stack.appendChild(el('p', 'me-cnote', s.connect));
    sec.appendChild(stack);
    return sec;
  }
  function draw(box, V) {
    clear(box);
    var st = el('p', 'me-status' + (V.has && !V.old ? '' : ' warn'), V.banner || ('Built on your PC ' + V.built + ' · ' + V.connected + ' of ' + V.areas.length + ' areas connected'));
    st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite'); st.id = 'meStatus';
    box.appendChild(st);
    var grid = el('div', 'me-tiles'); grid.id = 'meTiles';
    V.tiles.forEach(function (t) { grid.appendChild(drawTile(t)); });
    box.appendChild(grid);
    var nav = el('nav', 'me-nav'); nav.setAttribute('aria-label', 'Areas of this hub');
    V.areas.forEach(function (s) { var a = el('a', 'me-chip' + (s.state === 'empty' ? ' off' : ''), s.title); a.href = '#me-' + s.id; nav.appendChild(a); });
    box.appendChild(nav);
    V.areas.forEach(function (s) { box.appendChild(drawArea(s)); });
    box.appendChild(el('p', 'me-foot', 'Private: made on your PC from your own files; nothing here can pay, trade or change anything. Estimates, not advice.'));
  }
  function getJSON(url) {
    var HS = g.OLYMPUS_HUB_STATUS;
    if (HS && HS.getJSON) return HS.getJSON(url);
    if (!g.fetch) return { then: function (ok) { ok(null); } };
    return g.fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json()['catch'](function () { return null; }) : null; })['catch'](function () { return null; });
  }
  /** draw the hub into root: first the empty layout (it works with no file), then the PC's file when it answers */
  function mount(root, o) {
    o = o || {};
    var now = typeof o.now === 'function' ? o.now : function () { return Date.now() / 1000; };
    var areas = o.hub && o.hub.areas ? o.hub.areas : AREAS, base = o.base || '../';
    clear(root); root.hidden = false; root.className += ' me-panel';
    var box = el('div', 'me-page'); root.appendChild(box);
    var V0 = view(null, now(), areas); V0.banner = 'Looking for your numbers on your PC...';
    draw(box, V0);
    var load = function (then) {
      getJSON(base + 'me/me.json').then(function (doc) {
        var open = {}, dets = box.querySelectorAll('details[open]');
        for (var i = 0; i < dets.length; i++) open[dets[i].getAttribute('data-card') + '@' + (dets[i].closest ? (dets[i].closest('section') || {}).id : '')] = 1;
        draw(box, view(doc, now(), areas));
        var again = box.querySelectorAll('details[data-card]');
        for (var j = 0; j < again.length; j++) if (open[again[j].getAttribute('data-card') + '@' + (again[j].closest ? (again[j].closest('section') || {}).id : '')]) again[j].open = true;
        if (then) then();
      });
    };
    load(function () {
      var hash = (g.location && g.location.hash) || '';
      if (/^#me-[a-z]+$/.test(hash)) { var t = d.getElementById(hash.slice(1)); if (t && t.scrollIntoView) t.scrollIntoView(); }
      if (o.done) o.done();
    });
    g.addEventListener('pageshow', function (e) { if (e.persisted) load(null); });
  }

  var out = { v: 1, AREAS: AREAS, CONNECT: CONNECT, SHORT: SHORT, TILES: TILES, view: view, mount: mount };
  g.OLYMPUS_ME_PAGE = out;
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
}(typeof window !== 'undefined' ? window : globalThis));
