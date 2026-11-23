/* THE 6 ARENAS + EVERYTHING ELSE (gate/index.html, 2026-11-20 day-manual; owner 17:00 ET: "organize the dashboard, I want like 6 arenas,
 * that's it, then a separate area for the smaller stuff"). The tiles are plain links in the page; this file only:
 *   - writes ONE live line per arena from data this page already reads (gate.js: window.GATE.state; no new request except the small
 *     nq/brief.json for Jarvis):
 *       NQ Bot    today's $ across the real accounts + the tightest drawdown left       (GATE.state.N.cards)
 *       Kalshi    the next K8 window                                                   (GATE.state.extra.K8.next)
 *       Websites  the call-backs due today, else the plan's next step                  (localStorage agency.crm.v1, this phone)
 *       Business  the first payout goal: "$X of $2,100" (MFFU funded starts at $0)     (GATE.state.N.cards, the funded card's to-payout)
 *       Jarvis    the last brief line                                                  (nq/brief.json headline)
 *   night-seedata 2026-11-23 (owner: "seeing my data is hard"): the NQ line also says the bot ON / OFF (+ how many accounts are armed), and the
 *   Money line the next payout's most likely date (business/payday.json, an estimate), so Home's first screen holds both
 *       Cities    a short tagline (static)
 *   - fills "Everything else" from the catalog (olympus/gate-catalog.js): the 10 smaller apps he uses (FIRST, retired ones skipped);
 *     every other app sits behind 'See all apps (A to Z)' (the gate.js sheet).
 * Text only through textContent. No storage written. window.GATE_ARENAS (tests). */
(function () {
  'use strict';
  var d = document, w = window, base = w.GATE_BASE || '';
  if (w.GATE_ARENAS) return;
  try { w.sessionStorage.setItem('olympus.home.v1', '1'); } catch (e) { /* private mode */ }   // Home opened this launch: Jarvis's tile never bounces back here
  var SIX = ['nq', 'jarvis', 'agency', 'cities', 'business', 'kalshi'];      // the apps the 6 tiles open (2026-11-22 order); Everything else skips them
  var TILES = ['nq', 'jarvis', 'agency', 'data', 'money', 'kalshi'];        // the tiles' ids (= the arenas in olympus/gate-catalog.js)
  var FIRST = ['planner', 'trading', 'ledger', 'board', 'hera', 'inbox', 'widget', 'dionysus', 'helios', 'settings'];   // lead 2026-11-20: only these 10, then 'See all apps (A to Z)'
  var PAYOUT_GOAL = 2100;      // MFFU Builder 25K funded: the first (max) payout request at $2,100 profit (CLAUDE.md, docs/ACCOUNT_RULES.md)
  function $(id) { return d.getElementById(id); }
  function num(x) { var n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : null; }
  function money(n) { return '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function moneyS(n) { return (n > 0.5 ? '+' : n < -0.5 ? '-' : '') + money(n); }
  function set(id, text, cls) { var e = $('arena-' + id); if (!e || !text) return; e.textContent = text; e.className = 'g-aline' + (cls ? ' ' + cls : ''); }
  function getJSON(u) { try { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(null, function () { return null; }); } catch (e) { return Promise.resolve(null); } }
  function localDay() { var t = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()); }

  /** the live lines from gate.js's state (pure: the tests call it) */
  function nextPay(pd) {   // the soonest first payout in the payday plan (H2 = the Jul-Oct-like market): 'Dec 23'
    var A = pd && pd.rows && pd.rows.H2 && pd.rows.H2.accounts, best = null;
    if (!A || typeof A !== 'object') return '';
    Object.keys(A).forEach(function (k) { var x = A[k]; if (x && x.first_pay_med && x.first_pay_usd && (!best || String(x.first_pay_med) < String(best.first_pay_med))) best = x; });
    if (!best) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(best.first_pay_med)); if (!m) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + (+m[3]);
  }
  function lines(S, crm, brief, today, payday) {
    var out = {}, N = S && S.N, X = (S && S.extra) || {};
    var cards = (N && N.cards) || [];
    if (cards.length) {
      var day = 0, has = false, room = null;
      cards.forEach(function (c) {
        var t = num(c.today); if (t != null) { day += t; has = true; }
        var r = num(c.room); if (r != null && c.kind !== 'funded' && (room == null || r < room)) room = r;
      });
      var armed = cards.filter(function (c) { return c.armed === true; }).length;
      var bot = N.running === false ? ' · BOT OFF' : N.running === true ? ' · bot on' + (armed ? ', ' + armed + ' armed' : '') : '';
      out.nq = { text: (has ? 'Today ' + moneyS(day) : 'Today -') + (room != null ? ' · ' + money(room) + ' drawdown left' : '') + bot,
                 cls: N.running === false ? 'down' : has ? (day > 0.5 ? 'up' : day < -0.5 ? 'down' : '') : '' };
      var f = cards.filter(function (c) { return c.kind === 'funded'; })[0];
      if (f) {
        var ask = num(f.toAsk);
        // night-payfirst 2026-11-23: progress to the PLAN's line (f.goal / f.toGoal from gate.js: ATLAS's first payout at MFFU's minimum,
        // $1,350; later $2,100); without it the old $2,100 line
        var G = num(f.goal) != null ? num(f.goal) : PAYOUT_GOAL, left = num(f.toGoal) != null ? num(f.toGoal) : ask;
        out.money = ask != null ? { text: ask <= 0 ? 'Payout ready: ask MFFU' : 'Payout: ' + money(Math.max(0, G - left)) + ' of ' + money(G), cls: ask <= 0 ? 'up' : '' }
          : { text: 'Payout goal ' + money(G) };
        var when = nextPay(payday);
        if (when && out.money.cls !== 'up') out.money.text += ' · ~' + when;
      }
    }
    var K8 = X.K8;
    if (K8) out.kalshi = { text: K8.next ? 'Next K8: ' + K8.next.name + ' ' + K8.next.at : 'No more K8 windows today' };
    var leads = crm && crm.leads && typeof crm.leads === 'object' ? crm.leads : {}, due = 0, won = 0;
    Object.keys(leads).forEach(function (k) {
      var e = leads[k] || {};
      if (e.stage === 'won') won++;
      else if (e.callback && String(e.callback) <= today && e.stage !== 'lost' && e.stage !== 'dnc') due++;
    });
    out.agency = due ? { text: due + ' call-back' + (due === 1 ? '' : 's') + ' due today', cls: 'warn' } : { text: won ? won + ' client' + (won === 1 ? '' : 's') + ' · next: call 5 leads' : 'Next: call 5 leads at lunch' };
    if (brief && brief.headline) out.jarvis = { text: 'Brief: ' + String(brief.headline).split('. ')[0].slice(0, 64) };
    out.data = { text: 'Every idea tested, + the Research hub' };
    return out;
  }

  /** Everything else: the 10 of FIRST that are live (not retired), in that order */
  function others(C) {
    if (!C || !C.apps) return [];
    var ret = C.retired || function () { return false; }, seen = {};
    var live = C.apps.filter(function (a) { return a && a.id && SIX.indexOf(a.id) < 0 && !ret(a.id) && a.section !== 'workshop' && a.id !== 'today' && !a.fold; });
    var first = [];
    FIRST.forEach(function (id) { live.forEach(function (a) { if (a.id === id && !seen[id]) { first.push(a); seen[id] = 1; } }); });
    return first;      // the rest: the 'See all apps (A to Z)' button
  }

  var elseDone = false;
  function drawElse() {
    var C = w.OLYMPUS_GATE, box = $('elseList'); if (elseDone || !C || !box) return;
    var list = others(C); if (!list.length) return;
    elseDone = true;
    box.replaceChildren();
    list.forEach(function (a) {
      var l = d.createElement('a'); l.className = 'g-eapp'; l.href = base + (a.path || 'index.html'); l.setAttribute('data-app', a.id);
      l.textContent = a.label; l.title = a.name + ': ' + (a.line || '');
      box.appendChild(l);
    });
  }

  var brief = null, payday = null;
  function drawLines() {
    var G = w.GATE, crm = null;
    try { crm = JSON.parse(localStorage.getItem('agency.crm.v1') || 'null'); } catch (e) { crm = null; }
    var L = lines(G && G.state, crm, brief, localDay(), payday);
    Object.keys(L).forEach(function (k) { set(k, L[k].text, L[k].cls); });
    return L;
  }

  function boot() {
    drawElse();
    drawLines();
    getJSON(base + 'nq/brief.json').then(function (b) { brief = b; drawLines(); });
    getJSON(base + 'business/payday.json').then(function (p) { payday = p; drawLines(); });
    var tries = 0;
    (function wait() {   // gate.js fills its state once the PC feed / home.json have answered
      var G = w.GATE;
      drawElse();      // the catalog script can arrive after this one
      if (G && G.ready && G.ready() && elseDone) { drawLines(); API.ready = true; return; }
      if (++tries > 60) { API.ready = true; return; }
      w.setTimeout(wait, 250);
    })();
  }
  var API = { SIX: SIX, TILES: TILES, FIRST: FIRST, lines: lines, nextPay: nextPay, others: others, ready: false };
  w.GATE_ARENAS = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();

  /* MORE (2026-11-22, owner: "I want 6 main dashboards", the app opened on More): Home = the 6 tiles; the rest only after a tap on More.
     Nothing is stored, and an old #more address is dropped, so the app always opens on the 6. */
  (function more() {
    var b = $('moreBtn'), r = d.documentElement; if (!b) return;
    if (/^#more\b/.test(w.location.hash || '')) { try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) { /* file:// */ } }
    function set(open) {
      r.classList.toggle('g-more-open', open); b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Back to the 6 dashboards' : 'More: every other app';
    }
    set(false);
    b.addEventListener('click', function () {
      var open = !r.classList.contains('g-more-open'); set(open);
      var t = open ? $('elseSec') : $('arenas');
      if (t && t.scrollIntoView) { try { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { t.scrollIntoView(); } }
    });
    w.GATE_MORE = { open: function () { set(true); }, close: function () { set(false); } };
  }());
}());
