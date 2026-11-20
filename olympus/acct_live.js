/* ACCOUNTS LIVE (olympus/acct_live.js, 2026-11-20, night-tradealerts). Owner: "NQ dashboard - I want everything: accounts, info,
 * notifications ... exactly when a trade is taken and closed, results of it. In a clean manner that looks good."
 * The pure part of the ZEUS page's Accounts view (hub/zeus.html), from the PC's public status post (../pc_feed.js lite):
 *   trades(lite, plan)            every real account's newest trades (the ext "at" = engine/feed_trades: [entry_t, exit_t, dir, qty, entry,
 *                                 stop, target, exit kind, $, R]) as rows {key, name, t, xt, side, q, e, s, tg, k, usd, r, open}, the
 *                                 account matched to the plan row by its PC id (business/accounts.json "pc"), never by size; BLITZ / paper out
 *   feed(rows, nowS, n)           the Live feed strip: the newest entries AND exits across the accounts, newest first (one line each:
 *                                 "Zlarior 50K · LONG 4 @ 21,034.25" / "Zlarior 50K · closed LONG +$446 (target)")
 *   open(rows, key, price, nowS)  the account's open trade with its live $ at the PC's last price (MNQ $2 a point a micro), stop and target $
 *   last(rows, key, n)            its last n closed trades, newest first
 * Read only, no DOM, no network: classic script (window.ACCT_LIVE) + CommonJS (tests/test_zeus_hub.py, tests/test_phone_fit.py). */
(function (root) {
  'use strict';
  var isObj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
  var okN = function (v) { return typeof v === 'number' && isFinite(v); };
  var num = function (v) { var x = typeof v === 'string' ? parseFloat(v) : v; return okN(x) ? x : null; };
  var PV = 2;                                   // MNQ: $2 a point a micro (the bots trade micros; a mini row says so with its own q)
  // the owner's names of the PC ids when the plan file is missing (business/accounts.json is the source; tools/live_trades.ACCOUNTS)
  var NAMES = { mffu50k_eval: 'Zlarior 50K', lit: 'Zlarior 50K', zlarior: 'Zlarior 50K', main: 'Zlarior 50K', b25k_2: 'Zlarior 25K #2',
                atlas: 'ATLAS 25K funded', acct_b: 'ATLAS 25K funded', acctb: 'ATLAS 25K funded', rapid: 'Rapid EOD 25K', acctr: 'Rapid EOD 25K' };
  var WORDS = { TARGET: 'target', STOP: 'stop', BE: 'breakeven', TIME: 'time exit', EOD: 'day\'s end', 'TIME SAFETY': 'before the close', KILL: 'kill switch',
                'KILL SWITCH': 'kill switch', FLATTEN: 'flattened', 'LIT PRIORITY': 'for a LIT entry', HEDGE: 'no-hedge rule', CUT: 'cut early', T15: '15-min rule',
                'TIME STOP': 'time stop', BANK: 'banked', NEWS: 'news' };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function usd(v, sign) {
    if (!okN(v)) return '-';
    var s = '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
    return v < 0 ? '-' + s : sign && v > 0 ? '+' + s : sign && Math.round(v) === 0 ? '$0' : s;
  }
  function px(v) { return okN(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'; }
  function why(k) { var u = String(k || '').toUpperCase(); return WORDS[u] || (u ? u.toLowerCase() : ''); }

  var fmt = null;
  function etParts(tS) {
    try {
      if (!fmt) fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      var p = {}; fmt.formatToParts(new Date(tS * 1000)).forEach(function (x) { p[x.type] = x.value; });
      var day = p.year + '-' + p.month + '-' + p.day;
      return { day: day, hm: ('0' + (+p.hour % 24)).slice(-2) + ':' + p.minute, dow: new Date(day + 'T12:00:00Z').getUTCDay() };
    } catch (e) { return null; }
  }
  /** '10:31' today (ET), 'Wed 10:31' another day */
  function when(tS, nowS) {
    var a = etParts(tS), b = etParts(okN(nowS) ? nowS : Date.now() / 1000);
    if (!a) return '';
    return a.day === (b && b.day) ? a.hm : DOW[a.dow] + ' ' + a.hm;
  }

  // the plan row of a PC id: business/accounts.json accounts[] {key, name, pc: [ids]}; BLITZ / paper never
  function planOf(plan, id) {
    var pa = isObj(plan) && Array.isArray(plan.accounts) ? plan.accounts : [];
    id = String(id || '');
    for (var i = 0; i < pa.length; i++) {
      var a = pa[i];
      if (!isObj(a) || /blitz/i.test(String(a.key))) continue;
      if (a.key === id || (Array.isArray(a.pc) && a.pc.indexOf(id) >= 0)) return a;
    }
    return null;
  }

  /** every real account's newest trades from the post (lite.at.a), oldest first */
  function trades(lite, plan) {
    var out = [], a = isObj(lite) && isObj(lite.at) && Array.isArray(lite.at.a) ? lite.at.a : [];
    a.forEach(function (x) {
      if (!isObj(x) || !x.id || /blitz|paper|cloud|acct_?c$/i.test(String(x.id))) return;
      var p = planOf(plan, x.id), key = p ? String(p.key) : String(x.id), name = (p && p.name) || NAMES[x.id] || String(x.id);
      if (p && /^zlarior$/i.test(name)) name = 'Zlarior 50K';                 // the plan's short name of the main 50K
      (Array.isArray(x.tr) ? x.tr : []).forEach(function (v) {
        if (!Array.isArray(v) || num(v[0]) == null) return;
        var xt = num(v[1]), d = num(v[2]);
        out.push({ key: key, id: String(x.id), name: name, t: num(v[0]), xt: xt, side: d != null && d < 0 ? 'SHORT' : 'LONG', dir: d != null && d < 0 ? -1 : 1,
                   q: num(v[3]), e: num(v[4]), s: num(v[5]), tg: num(v[6]), k: v[7] == null ? '' : String(v[7]), usd: num(v[8]), r: num(v[9]), open: xt == null });
      });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /** the Live feed: the newest n entries and exits across every account, newest first */
  function feed(rows, nowS, n) {
    var ev = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      ev.push({ kind: 'entry', t: r.t, key: r.key, name: r.name, side: r.side, when: when(r.t, nowS),
                text: r.side + (r.q != null ? ' ' + r.q : '') + (r.e != null ? ' @ ' + px(r.e) : '') });
      if (!r.open && r.xt != null) {
        ev.push({ kind: 'exit', t: r.xt, key: r.key, name: r.name, side: r.side, usd: r.usd, when: when(r.xt, nowS), cls: r.usd > 0 ? 'pos' : r.usd < 0 ? 'neg' : '',
                  text: 'closed ' + r.side + ' ' + usd(r.usd, true) + (why(r.k) ? ' (' + why(r.k) + ')' : '') });
      }
    });
    ev.sort(function (a, b) { return b.t - a.t || (a.kind === 'exit' ? -1 : 1); });
    return ev.slice(0, n || 6);
  }

  /** the account's open trade (the newest row without an exit) with its live $ at the PC's price; null = flat */
  function open(rows, key, price, priceT, nowS) {
    var o = null;
    (Array.isArray(rows) ? rows : []).forEach(function (r) { if (r.key === key && r.open) o = r; });
    if (!o) return null;
    var q = o.q || 0, p = num(price), fresh = p != null && p > 0 && (!okN(priceT) || !okN(nowS) || nowS - priceT < 20 * 60);
    var live = fresh && o.e != null ? (p - o.e) * o.dir * q * PV : null;
    return { side: o.side, q: o.q, e: o.e, s: o.s, tg: o.tg, t: o.t, when: when(o.t, nowS), live: live, price: fresh ? p : null,
             risk: o.s != null && o.e != null ? -Math.abs(o.e - o.s) * q * PV : null, gain: o.tg != null && o.e != null ? Math.abs(o.tg - o.e) * q * PV : null,
             text: o.side + (o.q != null ? ' ' + o.q : '') + (o.e != null ? ' @ ' + px(o.e) : '') };
  }

  /** the account's last n closed trades, newest first */
  function last(rows, key, n, nowS) {
    return (Array.isArray(rows) ? rows : []).filter(function (r) { return r.key === key && !r.open; }).slice(-(n || 5)).reverse()
      .map(function (r) {
        return { t: r.t, when: when(r.t, nowS), side: r.side, q: r.q, usd: r.usd, r: r.r, why: why(r.k), cls: r.usd > 0 ? 'pos' : r.usd < 0 ? 'neg' : '',
                 text: r.side + (r.q != null ? ' ' + r.q : '') };
      });
  }

  var API = { trades: trades, feed: feed, open: open, last: last, usd: usd, px: px, when: when, why: why, planOf: planOf, NAMES: NAMES };
  root.ACCT_LIVE = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
}(typeof window !== 'undefined' ? window : globalThis));
