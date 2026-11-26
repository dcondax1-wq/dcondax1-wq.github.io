/* OLYMPUS hub status (2026-11-14, docs/OLYMPUS_IA_V2.md): the live one-line status of each hub, for the home (gate/) tiles and the hub pages (hub/).
 * Pure functions (no DOM at load, node-tested by tests/test_hubs.py) + two small loaders for the page. Classic script, ES5: window.OLYMPUS_HUB_STATUS.
 * Sources (all published, same origin, read only): home.json through olympus/truth.js (accounts, data age; a light copy of its rules when truth.js
 * does not load), kalshi.json (the Kalshi bot's feed copy), money/scoreboard.json (cash in / out, tools/money_scoreboard.py), each app's jarvis.json
 * (its status card), and on this phone only the Planner's summary for Jarvis, localStorage 'planner.today.v1' (read, never written).
 * The Me hub (2026-11-14, docs/ME_HUB.md): me/me.json (tools/me_hub.py), served ONLY by the PC's private link: meOf() -> its tiles' short words.
 * A missing source gives a plain line ("No Kalshi numbers yet"), never an invented number. Paper P&L is never called cash. */
(function (g) {
  'use strict';
  var STALE_S = 6 * 3600, FRESH_S = 20 * 60;
  function num(v) { var x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && isFinite(x) ? x : null; }
  function obj(x) { return x && typeof x === 'object' && !(x instanceof Array) ? x : {}; }
  function arr(x) { return x instanceof Array ? x : []; }
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
  function shortAge(sec) { var s = Math.max(0, Math.floor(num(sec) || 0)); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; }
  function inWords(sec) { var s = Math.max(0, Math.round(sec / 60)); if (s < 60) return 'in ' + plural(s, 'minute'); var h = Math.floor(s / 60), m = s % 60; return h >= 24 ? 'in ' + plural(Math.floor(h / 24), 'day') + (h % 24 ? ' ' + (h % 24) + ' h' : '') : 'in ' + h + ' h' + (m ? ' ' + m + ' min' : ''); }
  function toS(v) { if (v == null || v === '') return null; var n = num(v); if (n != null && /^\s*\d+(\.\d+)?\s*$/.test(String(v))) return n > 1e12 ? n / 1000 : n; var t = Date.parse(String(v)); return isFinite(t) ? t / 1000 : null; }

  /* ------------------------------------------------------------------ the clock (New York) and the LIT window (02:00-15:30 ET, weekdays) */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function etNow(t) {
    try {
      var p = {}, parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t * 1000));
      parts.forEach(function (x) { p[x.type] = x.value; });
      return { wd: DAYS.indexOf(p.weekday), min: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10), day: p.year + '-' + p.month + '-' + p.day };
    } catch (e) { var dt = new Date((t - 5 * 3600) * 1000); return { wd: dt.getUTCDay(), min: dt.getUTCHours() * 60 + dt.getUTCMinutes(), day: dt.toISOString().slice(0, 10) }; }
  }
  function nextWindow(home, t) {
    var wins = obj(obj(obj(home).board).lit).windows;
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
  function windowLine(W) { return W.open ? 'Trade window open until 15:30 ET' : 'Next trade window ' + W.label.replace(/ 02:00-15:30 ET$/, ' 02:00 ET') + ', ' + inWords(W.inS); }

  /* ------------------------------------------------------------------ the bots: truth.js when it loaded, else the same rules in short */
  function lightAccounts(home) {
    var board = obj(obj(home).board), out = {};
    [['lit', 'Zlarior', '50K', 2000], ['atlas', 'ATLAS', '25K', 1000]].forEach(function (m) {
      var b = obj(board[m[0]]), room = num(b.room);
      out[m[0]] = { has: room != null, name: m[1], size: m[2], room: room, mll: num(b.mll) || m[3], today: num(b.today_pnl) || num(b.today) || 0, paper: false };
    });
    return out;
  }
  function summarize(home, T, t) {
    var h = obj(home), ages = null, A = null;
    if (T) { try { ages = T.agesOf(h, t); A = T.accountsOf(h); } catch (e) { ages = null; A = null; } }
    if (!ages || !A) {
      var pcT = num(obj(obj(h.live).pc).t); if (pcT == null) pcT = num(obj(h.board).data_t);
      ages = { pc: { t: pcT, age: pcT == null ? null : Math.max(0, Math.floor(t - pcT)) } }; A = lightAccounts(h);
    }
    var pc = obj(obj(h.live).pc), board = obj(h.board);
    var running = typeof pc.running === 'boolean' ? pc.running : typeof board.running === 'boolean' ? board.running : null;
    var accts = [], today = 0;
    ['lit', 'atlas'].forEach(function (k) {
      var a = A[k]; if (!a || !a.has) return;
      accts.push({ key: k, name: a.name + ' ' + a.size, short: a.name, room: num(a.room), mll: num(a.mll) });
      today += num(a.today) || 0;
    });
    return { t: t, pcT: ages.pc.t, pcAge: ages.pc.age, running: running, accts: accts, today: today, win: nextWindow(h, t), has: !!home };
  }
  /** the bots' state in one word: on / quiet / stopped / stale / none, with the badge level and its plain label */
  function botState(N) {
    if (!N || !N.has) return { st: 'none', lvl: 'bad', label: 'No numbers' };
    if (N.pcT == null) return { st: 'stale', lvl: 'bad', label: 'No report' };
    if (N.pcAge > STALE_S) return { st: 'stale', lvl: 'bad', label: 'Old numbers' };
    if (N.pcAge > FRESH_S) return { st: 'quiet', lvl: 'warn', label: 'Quiet' };
    if (N.running === false) return { st: 'stopped', lvl: 'warn', label: 'Stopped' };
    return { st: 'on', lvl: 'ok', label: 'Bots on' };
  }

  /* ------------------------------------------------------------------ Kalshi (kalshi.json), money (money/scoreboard.json), the plan (planner.today.v1) */
  function kalshiOf(k, t) {
    var x = obj(k), bal = num(x.balance), tt = toS(x.t);
    if (bal == null && num(x.total_pnl) == null) return { has: false };
    return { has: true, balance: bal, today: num(x.today_pnl), week: num(x.week_pnl), running: typeof x.running === 'boolean' ? x.running : null, open: arr(x.positions).length, t: tt, age: tt == null ? null : Math.max(0, Math.floor(t - tt)) };
  }
  /** the Me hub's file (me/me.json, tools/me_hub.py; the PC's private link only) -> its 4 tiles, or { has: false } (the public site never has it) */
  function meOf(doc, t) {
    var d = obj(doc), tt = toS(d.t);
    if (d.kind !== 'olympus-me' || !(d.tiles instanceof Array)) return { has: false };
    var tiles = d.tiles.filter(function (x) { return x && typeof x === 'object' && !x.empty && x.short; }).map(function (x) {
      return { id: String(x.id || ''), short: String(x.short).slice(0, 28), lvl: x.lvl === 'ok' || x.lvl === 'warn' || x.lvl === 'bad' ? x.lvl : '' };
    });
    return { has: true, tiles: tiles, t: tt, age: tt == null ? null : Math.max(0, Math.floor(t - tt)) };
  }
  function moneyOf(sb) {
    var tot = obj(obj(sb).totals), m = obj(tot.month), a = obj(tot.all), w = obj(tot.week);
    if (num(m.net) == null && num(a.net) == null) return { has: false };
    return { has: true, month: num(m.net), all: num(a.net), week: num(w.net), pending: num(obj(a.pending).amount) };
  }
  var SHIFT_RE = /\bshift\b|\bwork\b|\bjob\b/i;
  function hm(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
  /** the Planner's summary for Jarvis -> today's shift (an event called shift / work / job) and the next event; only when it is today's summary */
  function planOf(pt, t) {
    var p = obj(pt), e = etNow(t);
    if (p.day !== e.day) return { has: false };
    var evs = arr(p.events).filter(function (x) { return x && typeof x.title === 'string'; }), tasks = arr(p.tasks);
    var shift = null, next = null;
    evs.forEach(function (x) {
      var s = hm(x.start), en = hm(x.end);
      if (!shift && SHIFT_RE.test(x.title) && (en == null || en > e.min)) shift = { title: String(x.title).slice(0, 40), start: x.start || '', end: x.end || '', now: s != null && s <= e.min && (en == null || en > e.min) };
      if (!next && !x.allDay && s != null && s >= e.min) next = { title: String(x.title).slice(0, 40), start: x.start };
    });
    var done = tasks.filter(function (x) { return x && x.done; }).length;
    return { has: true, shift: shift, next: next, tasks: tasks.length, done: done };
  }
  function shiftLine(P) { if (!P || !P.has || !P.shift) return null; var s = P.shift; return s.now ? 'On shift now' + (s.end ? ' until ' + s.end : '') : 'Shift ' + s.start + (s.end ? '-' + s.end : ''); }
  /** an app's status card (jarvis.json) in one line, only when it says something real (level ok / warn / bad; never a demo card) */
  function cardLine(card) {
    var c = obj(card), st = obj(c.status), lvl = st.level;
    if (lvl !== 'ok' && lvl !== 'warn' && lvl !== 'bad') return null;
    if (/demo|example|sample/i.test(String(st.label || ''))) return null;
    var k = arr(c.kpis)[0], label = String(st.label || '').slice(0, 48);
    var line = label;
    if (k && k.label && k.value != null && label.indexOf(String(k.value)) < 0) line += (line ? ' · ' : '') + String(k.label).slice(0, 20) + ' ' + String(k.value).slice(0, 24);
    return line ? { text: line, lvl: lvl } : null;
  }

  /** the first n kpis of a real status card as one line: "2026 net (live) $43,820 · Jul-Oct PF 2.91" */
  function kpiLine(card, n) {
    if (!cardLine(card)) return null;
    var ks = arr(obj(card).kpis).slice(0, n || 2).filter(function (k) { return k && k.label != null && k.value != null; });
    return ks.length ? { text: ks.map(function (k) { return String(k.label).slice(0, 20) + ' ' + String(k.value).slice(0, 24); }).join(' · '), lvl: obj(obj(card).status).level } : null;
  }

  /* ------------------------------------------------------------------ one line per hub (ctx = { N, K, M, P, cards: { appId: card }, theme }) */
  function hubLine(hid, ctx) {
    var c = obj(ctx), N = c.N, B = N ? botState(N) : null, K = c.K || { has: false }, M = c.M || { has: false }, P = c.P || { has: false }, cards = obj(c.cards);
    var card = function (id) { return cardLine(cards[id]); };
    switch (hid) {
      case 'today':
        var sl = shiftLine(P), w = N ? windowLine(N.win) : null;
        return { text: (w || 'Do now, the morning brief, the news') + (sl ? ' · ' + sl : ''), lvl: N && N.win && N.win.open ? 'ok' : '' };
      case 'bots':
        if (!N || !N.has) return { text: 'No bot numbers reached this page', lvl: 'bad' };
        if (!N.accts.length) return { text: B.label + ': no account numbers in the report', lvl: B.lvl };
        var rooms = N.accts.map(function (a) { return money(a.room); }).join(' / ');
        var head = plural(N.accts.length, 'eval') + ' active, ' + rooms + ' left';
        return { text: B.st === 'on' ? head : B.label + ' (' + (N.pcAge == null ? 'never' : shortAge(N.pcAge)) + ') · ' + head, lvl: B.lvl };
      case 'kalshi':
        if (!K.has) { var kc = card('kalshicity'); return kc || { text: 'No Kalshi numbers yet', lvl: '' }; }
        return { text: (K.balance != null ? 'Balance ' + money(K.balance) : 'Kalshi bot') + (K.today != null ? ' · today ' + moneyS(K.today) : '') + (K.open ? ' · ' + plural(K.open, 'open bet') : ''),
          lvl: K.age != null && K.age > 36 * 3600 ? 'warn' : K.today != null && K.today < 0 ? 'warn' : 'ok' };
      case 'money':
        if (!M.has) return card('plutus') || { text: 'Fees, payouts, plans and net worth', lvl: '' };
        return { text: 'This month ' + moneyS(M.month) + ' cash · all time ' + moneyS(M.all), lvl: (M.month || 0) < 0 ? 'warn' : 'ok' };
      case 'plan':
        if (!P.has) return { text: 'Calendar, shifts, tasks and habits', lvl: '' };
        var bits = [];
        if (P.shift) bits.push(shiftLine(P));
        if (P.next && (!P.shift || P.next.title !== P.shift.title)) bits.push('Next: ' + P.next.title + ' ' + P.next.start);
        if (P.tasks) bits.push(P.done + ' of ' + P.tasks + ' tasks done');
        return { text: bits.length ? bits.join(' · ') : 'Nothing else planned today', lvl: '' };
      case 'research':
        return kpiLine(cards.hephaestus, 2) || card('archive') || { text: 'Backtests, edges and write-ups', lvl: '' };
      case 'me':
        var ME = c.ME || { has: false };
        if (!ME.has || !ME.tiles.length) return { text: 'Money, cards, health, home: on your PC link', lvl: '' };
        var rank = { bad: 3, warn: 2, ok: 1 }, worst = '';
        ME.tiles.forEach(function (x) { if ((rank[x.lvl] || 0) > (rank[worst] || 0)) worst = x.lvl; });
        return { text: ME.tiles.slice(0, 3).map(function (x) { return x.short; }).join(' · ') + (ME.age != null && ME.age > 36 * 3600 ? ' (' + shortAge(ME.age) + ')' : ''),
          lvl: ME.age != null && ME.age > 36 * 3600 ? 'warn' : worst };
      case 'jarvis':
        return { text: 'Ask anything · your AI team', lvl: '' };
      case 'worlds':
        return { text: 'The 3D city, duels and night cities (optional)', lvl: '' };
      case 'settings':
        return { text: 'Look' + (c.theme ? ': ' + c.theme : '') + ' · start the PC · every app A to Z', lvl: '' };
    }
    return { text: '', lvl: '' };
  }

  /* ------------------------------------------------------------------ loaders (browser only) */
  function getJSON(url) {
    var w = g;
    if (!w.fetch) return { then: function (ok) { ok(null); return { 'catch': function () {} }; } };
    return w.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r && r.ok ? r.json()['catch'](function () { return null; }) : null; })['catch'](function () { return null; });
  }
  /** olympus/truth.js is an ES module: one module tag hands it over; 2.5 s at most, then null (the light rules above) */
  function getTruth(base, cb) {
    var w = g, d = w.document;
    if (w.OLYMPUS_TRUTH) { cb(w.OLYMPUS_TRUTH); return; }
    var done = false, fin = function () { if (done) return; done = true; cb(w.OLYMPUS_TRUTH || null); };
    w.addEventListener('gate-truth', fin);
    try {
      var url = new w.URL(base + 'olympus/truth.js?v=r15', w.location.href).href, s = d.createElement('script');
      s.type = 'module';
      s.textContent = 'import * as T from ' + JSON.stringify(url) + '; window.OLYMPUS_TRUTH = T; window.dispatchEvent(new Event("gate-truth"));';
      d.head.appendChild(s);
    } catch (e) { fin(); return; }
    w.setTimeout(fin, 2500);
  }
  function plannerToday() { try { var v = g.localStorage.getItem('planner.today.v1'); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function themeName() {
    var T = g.OLYMPUS_THEMES; if (!T) return '';
    try { var th = T.get(T.id()); return th && th.name ? String(th.name) : ''; } catch (e) { return ''; }
  }

  var out = { v: 1, STALE_S: STALE_S, FRESH_S: FRESH_S, num: num, money: money, moneyS: moneyS, ageWords: ageWords, shortAge: shortAge, inWords: inWords, etNow: etNow,
    nextWindow: nextWindow, windowLine: windowLine, summarize: summarize, botState: botState, kalshiOf: kalshiOf, moneyOf: moneyOf, meOf: meOf, planOf: planOf, shiftLine: shiftLine,
    cardLine: cardLine, kpiLine: kpiLine, hubLine: hubLine, getJSON: getJSON, getTruth: getTruth, plannerToday: plannerToday, themeName: themeName };
  g.OLYMPUS_HUB_STATUS = out;
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
}(typeof window !== 'undefined' ? window : globalThis));
