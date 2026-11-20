/* ZEUS core (olympus/zeus_core.js, 2026-11-18, night-zcard): the ONE piece every ZEUS view shares, so the ZEUS page (hub/zeus.html)
 * and the two homes (Zenith = index.html, Jarvis = jarvis/index.html) can never disagree about an account.
 *   pure     usd(v, sign) / ago(s) / pcLine(BM, res, nowS) / acctRow(card, nowS) / summary(data, nowS)
 *            summary = the Board's pick for the PC age (BOARD_MODEL.pick, same 30 min STALE_S) + one row per real account from
 *            MFFU_MODEL.cards (matched by PC id / Name, never the plan size), BLITZ left out: { pc, rows, mode, label }
 *   browser  need() loads the models once (../business/payoutcoach.js, mffumodel.js, ../board/boardmodel.js, ../edge_chip.js,
 *            ../pc_feed.js) where a page has not; fetchAll() = PC_FEED.fetchLatest (core + ext merged) + ../board/board.json +
 *            ../business/accounts.json, kept 45 s; card(host) draws the home card; keep(host, {when}) keeps it the host's first child
 *            through every redraw (Zenith's #page); [data-zeus-card] elements mount themselves (Jarvis).
 * Every path is relative to THIS file, so the same calls work from the site root, jarvis/ and hub/.
 * The home card: "ZEUS" + "PC reported 3 min ago" (red PC SILENT when the PC is quiet), one line per real account (name, stage, balance,
 * $ to pass or the payout status, today's $), the ZEUS edge chip; a tap opens hub/zeus.html. Paper / cloud ledgers never show here.
 * Read only: GET only, no write, no order, nothing armed. Text only through textContent. Classic script (window.ZEUS_CORE) + CommonJS. */
(function (root) {
  'use strict';
  var isObj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
  var okN = function (v) { return typeof v === 'number' && isFinite(v); };

  function usd(v, sign) {
    if (!okN(v)) return '-';
    var s = '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
    return v < 0 ? '-' + s : sign && v > 0 ? '+' + s : s;
  }
  function ago(s) {
    if (s == null || !isFinite(s)) return 'never';
    s = Math.max(0, Math.round(s));
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 2 * 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }

  // the PC line from the Board's pick (same STALE_S = 30 min): {silent, text}
  function pcLine(BM, res, nowS) {
    var b = res && res.board, t = b && b.pc && okN(+b.pc.t) && +b.pc.t > 0 ? +b.pc.t : null;
    var age = t ? nowS - t : null, silent = age == null || age > (BM && BM.STALE_S || 1800);
    return { silent: silent, age_s: age, mode: res ? res.mode : 'none',
             text: !t ? 'PC SILENT: your PC has never reported here. The bots may not be running.'
               : silent ? 'PC SILENT: last report ' + ago(age) + '. On the PC: STOP BOT, then START BOT.' : 'PC reported ' + ago(age) };
  }

  // one account row from an MFFU_MODEL card: {name, chip, cls, balance, goal, today, src}
  function acctRow(c, nowS) {
    var st = String(c.stage || 'eval'), chip = c.status || 'Evaluation', goal;
    var cls = st === 'funded' ? 'funded' : st === 'passed' ? 'passed' : st === 'failed' || chip === 'Failed' ? 'failed' : 'eval';
    if (cls === 'failed') goal = 'Floor reached: this account is done';
    // a funded line says it is about the payout (it read "Not yet: need $1,463 more." alone, phone QA 2026-11-19), like the MFFU center
    else if (st === 'funded') goal = c.payout && c.payout.c && c.payout.c.text ? (/payout/i.test(c.payout.c.text) ? '' : 'Payout · ') + c.payout.c.text : 'Funded: payout status needs the PC\'s payout tracker';
    else if (st === 'passed') goal = 'Passed: waiting for MFFU\'s funded account';
    else goal = c.target && okN(c.target.left) ? usd(c.target.left) + ' to pass' : 'To pass: no live balance yet';
    var today = c.dll && okN(c.dll.today) ? c.dll.today : null;
    var src = c.balance && c.balance.src ? c.balance.src + (c.age_s != null ? ' · ' + ago(c.age_s) : '') : 'no number yet';
    return { key: c.key, name: c.name, chip: chip, cls: cls, balance: c.balance ? c.balance.v : null, goal: goal, today: today,
             todayText: today == null ? 'Today: -' : 'Today: ' + usd(today, true), src: src, planOnly: !!c.planOnly };
  }

  function todayET(nowS) {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(nowS * 1000)).forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { return new Date(nowS * 1000).toISOString().slice(0, 10); }
  }

  // data = {lite, plan, site, BM?, MM?, coach?}: the PC age + one row per real account (no BLITZ, no paper ledger)
  function summary(data, nowS) {
    var o = data || {}, BM = o.BM || root.BOARD_MODEL, MM = o.MM || root.MFFU_MODEL, coach = o.coach || root.PAYOUT_COACH;
    var now = okN(nowS) ? nowS : Math.floor(Date.now() / 1000), res = null, cards = [];
    try { res = BM ? BM.pick({ site: o.site, lite: o.lite, plan: o.plan }, now) : null; } catch (e) { res = null; }
    try { if (MM) cards = MM.cards({ lite: o.lite, plan: o.plan, board: o.site, coach: coach, today: todayET(now) }, now) || []; } catch (e) { cards = []; }
    var rows = cards.filter(function (c) { return isObj(c) && !/blitz|paper|cloud/i.test(String(c.key)); }).map(function (c) { return acctRow(c, now); });
    return { pc: pcLine(BM, res, now), rows: rows, mode: res ? res.mode : 'none', label: res ? res.label : '' };
  }

  var API = { usd: usd, ago: ago, pcLine: pcLine, acctRow: acctRow, summary: summary, todayET: todayET };
  root.ZEUS_CORE = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------------------------------------------ the browser part
  var d = document, me = d.currentScript && d.currentScript.src ? d.currentScript.src : null;
  function url(rel) { try { return new URL(rel, me || d.baseURI).href; } catch (e) { return rel; } }
  // the models this file needs, in the order the ZEUS page loads them (boardmodel after mffumodel)
  var DEPS = [['PC_FEED', '../pc_feed.js?v=n5'], ['PAYOUT_COACH', '../business/payoutcoach.js?v=1'], ['MFFU_MODEL', '../business/mffumodel.js?v=2'],
              ['BOARD_MODEL', '../board/boardmodel.js?v=b6'], ['EDGE_CHIP', '../edge_chip.js?v=1']];
  var needP = null;
  function need() {
    if (needP) return needP;
    needP = DEPS.reduce(function (p, dep) {
      return p.then(function () {
        if (root[dep[0]]) return null;
        return new Promise(function (ok) {
          var s = d.createElement('script'); s.src = url(dep[1]); s.async = false;
          var t = setTimeout(ok, 8000);
          s.onload = s.onerror = function () { clearTimeout(t); ok(); };
          d.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return needP;
  }
  function getJSON(u, ms) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, ms || 6000) : 0;
    return fetch(u, ac ? { cache: 'no-cache', signal: ac.signal } : { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }).then(function (j) { clearTimeout(tm); return j; });
  }
  var got = null, gotAt = 0;
  // {plan, site, lite}: the plan, the published board copy and the PC's newest ntfy status (core + ext merged)
  function fetchAll(opts) {
    var force = opts && opts.force;
    if (got && !force && Date.now() - gotAt < 45000) return got;
    gotAt = Date.now();
    got = need().then(function () {
      var F = root.PC_FEED;
      return Promise.all([getJSON(url('../business/accounts.json')), getJSON(url('../board/board.json')),
        F ? Promise.race([F.fetchLatest({ feedUrl: url('../status_feed.json') }), new Promise(function (r) { setTimeout(function () { r(null); }, 8000); })]).catch(function () { return null; }) : null]);
    }).then(function (v) { return { plan: v[0], site: v[1], lite: v[2] }; }, function () { return { plan: null, site: null, lite: null }; });
    return got;
  }

  // ------------------------------------------------------------------------------------------------ the home card
  var CSS = '.zeus-card{display:block;margin:0 0 12px;padding:0;border-radius:16px;background:rgba(27,23,19,.92);color:#f3ece0;border:1px solid rgba(200,162,74,.45);'
    + 'border-top:3px solid #c8a24a;box-shadow:0 6px 22px rgba(0,0,0,.28);overflow:hidden;font:400 15px/1.4 -apple-system,system-ui,"Helvetica Neue",Arial,sans-serif;text-align:left}'
    + '.zeus-card.bad{border-color:#ff5a4f;border-top-color:#ff5a4f}'
    + '.zeus-go{display:block;padding:10px 14px 6px;color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}.zeus-go:active{background:rgba(255,255,255,.05)}'
    + '.zeus-h{display:flex;align-items:center;gap:10px;min-height:28px}'
    + '.zeus-t{font:700 19px/1 "Iowan Old Style",Palatino,Georgia,serif;letter-spacing:.08em;color:#dcbd6e}'
    + '.zeus-pc{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-weight:600;color:#a9c47e;overflow-wrap:anywhere}'
    + '.zeus-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#8fbf6a}'
    + '.zeus-pc.bad{color:#fff;background:#8f1d1d;border:2px solid #ff5a4f;border-radius:10px;padding:6px 10px;font-size:15px}.zeus-pc.bad .zeus-dot{background:#ff5a4f}'
    + '.zeus-pc.wait{color:#cfc4b2}.zeus-pc.wait .zeus-dot{background:#a89c88}'
    + '.zeus-more{flex:none;color:#cfc4b2;font-size:13px;white-space:nowrap}'
    + '.zeus-rows{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}'
    + '.zeus-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;padding:4px 0 0;line-height:1.3;border-top:1px solid rgba(200,184,150,.16)}'
    + '.zeus-n{font-weight:700;overflow-wrap:anywhere}.zeus-n small{margin-left:6px;font:700 12px/1 system-ui,sans-serif;padding:3px 7px;border-radius:999px;border:1px solid currentColor;vertical-align:2px}'
    + '.zeus-n small.eval{color:var(--ag-aegean-text,#7fa7c2)}.zeus-n small.funded{color:var(--ag-olive-text,#a0ac6e)}.zeus-n small.passed{color:#14110e;background:#c8a24a;border-color:#c8a24a}.zeus-n small.failed{color:#fff;background:#b33a2e;border-color:#b33a2e}'
    + '.zeus-b{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}'
    + '.zeus-g{color:#cfc4b2;font-size:13px;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}'
    + '.zeus-d{font-size:13px;font-weight:600;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#cfc4b2}.zeus-d.pos{color:#8fbf6a}.zeus-d.neg{color:#ff8a7a}'
    + '.zeus-none{margin:8px 0 0;color:#cfc4b2;font-size:13.5px}'
    + '.zeus-edge{padding:0 14px 8px}.zeus-edge:empty,.zeus-edge[hidden]{display:none}'
    // the edge chip on one line per bot here (its light first; the numbers and the help one tap away, on the chip or the ZEUS page)
    + '.zeus-card .zeus-edge.edge-chip{margin:0}.zeus-card .zeus-edge.edge-chip>button{padding:5px 10px;min-height:44px}'
    + '.zeus-card .zeus-edge.edge-chip .ec-row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}';
  function css() {
    if (d.getElementById('zeusCss')) return;
    var s = d.createElement('style'); s.id = 'zeusCss'; s.textContent = CSS; (d.head || d.documentElement).appendChild(s);
  }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }

  // short stage words for one phone line
  function stage(r) { return r.cls === 'funded' ? 'Funded' : r.cls === 'passed' ? 'Passed' : r.cls === 'failed' ? 'Failed' : r.planOnly ? 'Plan' : 'Eval'; }

  function build() {
    css();
    var c = el('section', 'zeus-card'); c.id = 'zeusCardBox'; c.setAttribute('aria-label', 'ZEUS: your trading accounts');
    var a = el('a', 'zeus-go'); a.href = url('../hub/zeus.html'); a.setAttribute('data-zeus-go', '');
    var h = el('span', 'zeus-h');
    h.appendChild(el('b', 'zeus-t', 'ZEUS'));
    var pc = el('span', 'zeus-pc wait'); pc.setAttribute('role', 'status'); pc.appendChild(el('i', 'zeus-dot')); pc.appendChild(el('span', '', 'Asking your PC...'));
    h.appendChild(pc);
    h.appendChild(el('span', 'zeus-more', 'Open ›'));
    a.appendChild(h);
    a.appendChild(el('ul', 'zeus-rows'));
    c.appendChild(a);
    var e = el('div', 'zeus-edge'); e.hidden = true; c.appendChild(e);
    return c;
  }

  function draw(c, s) {
    if (!c || !s) return;
    var pcEl = c.querySelector('.zeus-pc'), rowsEl = c.querySelector('.zeus-rows');
    c.classList.toggle('bad', !!s.pc.silent);
    pcEl.className = 'zeus-pc ' + (s.pc.silent ? 'bad' : 'good');
    pcEl.setAttribute('role', s.pc.silent ? 'alert' : 'status');
    // the card's short form (the fix, STOP BOT then START BOT, is in the aria label and on the ZEUS page)
    pcEl.replaceChildren(el('i', 'zeus-dot'), el('span', '', s.pc.silent ? s.pc.text.replace(/\. On the PC: .*$/, '') : s.pc.text));
    rowsEl.replaceChildren();
    s.rows.forEach(function (r) {
      var li = el('li', 'zeus-row'); li.setAttribute('data-key', r.key);
      var n = el('span', 'zeus-n', r.name); n.appendChild(el('small', r.planOnly ? 'eval' : r.cls, stage(r)));
      li.appendChild(n);
      li.appendChild(el('span', 'zeus-b', usd(r.balance)));
      li.appendChild(el('span', 'zeus-g', r.goal));
      li.appendChild(el('span', 'zeus-d' + (r.today > 0 ? ' pos' : r.today < 0 ? ' neg' : ''), r.today == null ? 'today -' : usd(r.today, true) + ' today'));
      rowsEl.appendChild(li);
    });
    if (!s.rows.length) rowsEl.appendChild(el('li', 'zeus-none', 'No account numbers yet: the PC has not reported and the plan did not load.'));
    var a = c.querySelector('.zeus-go');
    a.setAttribute('aria-label', 'ZEUS. ' + s.pc.text + ' ' + s.rows.map(function (r) { return r.name + ' ' + stage(r) + ' ' + usd(r.balance) + ', ' + r.goal + ', ' + r.todayText; }).join('. ') + '. Opens ZEUS');
    var e = c.querySelector('.zeus-edge');
    try {
      if (root.EDGE_CHIP) { root.EDGE_CHIP.mount(e, { lite: s.lite || null, url: url('../edge.json') }); }
    } catch (err) { /* the chip is optional */ }
  }

  // the card's height on this phone's last visit (phone QA 2026-11-19: on the Jarvis home the card grew from "Asking your PC..." to its
  // account rows, then again for the edge chip, and pushed everything under it down twice after the opening). The space is held from
  // the first frame until the PC's numbers and the chip are in, then the real height is kept for next time. A first visit holds a
  // typical card (3 accounts + the chip). Kept on this phone only: nothing leaves it.
  var HKEY = 'olympus.zeus.cardh', HDEF = 236;
  function memH() { try { var v = +localStorage.getItem(HKEY); return v >= 60 && v <= 640 ? Math.round(v) : 0; } catch (e) { return 0; } }
  function reserve(c) { c.style.minHeight = (memH() || HDEF) + 'px'; c.__res = true; }
  function settle(c) {
    if (!c.__res || c.__settle) return;
    c.__settle = true;
    var t0 = Date.now(), e = c.querySelector('.zeus-edge');
    (function wait() {
      if (!(e && !e.hidden && e.firstChild) && Date.now() - t0 < 5000) { setTimeout(wait, 200); return; }   // the chip, or 5 s
      setTimeout(function () {
        c.style.minHeight = ''; c.__res = false;
        var h = c.offsetHeight;
        try { if (h >= 60 && h <= 640) localStorage.setItem(HKEY, String(Math.round(h))); } catch (x) { /* private mode */ }
      }, 150);
    })();
  }

  var cards = [], last = null, timer = 0;
  function refresh(opts) {
    return fetchAll(opts).then(function (data) {
      var s = summary(data, Math.floor(Date.now() / 1000));
      s.lite = data.lite;
      last = s; API.last = s;
      cards.forEach(function (c) { draw(c, s); settle(c); });
      try { root.dispatchEvent(new CustomEvent('zeus:update', { detail: { silent: s.pc.silent, age_s: s.pc.age_s } })); } catch (e) { /* old browsers */ }
      return s;
    });
  }
  function card(host, opts) {
    var c = build();
    reserve(c);
    if (host) { host.replaceChildren(c); }
    cards.push(c);
    if (last) { draw(c, last); settle(c); }
    refresh(opts);
    if (!timer) timer = setInterval(function () { if (!d.hidden) refresh(); }, 60000);
    return c;
  }
  // keep the card the first child of host (a page that redraws its whole host, like Zenith's #page) while when() says so
  function keep(host, opts) {
    if (!host) return null;
    opts = opts || {};
    var c = null, busy = false, moves = 0, since = 0, mo = null;
    function want() { try { return opts.when ? !!opts.when() : true; } catch (e) { return false; } }
    function ensure() {
      if (busy) return;
      busy = true;
      try {
        if (!want()) { if (c && c.parentNode === host) host.removeChild(c); }
        else {
          if (!c) c = card(null);
          if (host.firstChild !== c) {
            // another piece that insists on being first (a ping-pong of observers) must never freeze the page: after 20 moves a second, stop
            var t = Date.now(); if (t - since > 1000) { since = t; moves = 0; }
            if (++moves > 20) { if (mo) mo.disconnect(); busy = false; return; }
            host.insertBefore(c, host.firstChild);
          }
        }
      } catch (e) { /* never the page */ }
      busy = false;
    }
    ensure();
    if (root.MutationObserver) { mo = new root.MutationObserver(ensure); mo.observe(host, { childList: true }); }
    root.addEventListener('hashchange', ensure);
    return { ensure: ensure };
  }

  API.need = need; API.fetchAll = fetchAll; API.card = card; API.keep = keep; API.refresh = refresh; API.last = null;
  // ?demo=1 = example numbers on the page: the card (real numbers) stays out of it
  function auto() { if (/[?&]demo=1(&|$)/.test(location.search)) { d.querySelectorAll('[data-zeus-card]').forEach(function (n) { n.hidden = true; }); return; }
    d.querySelectorAll('[data-zeus-card]').forEach(function (n) { if (!n.__zc) { n.__zc = true; card(n); } }); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', auto); else auto();
  root.addEventListener('pageshow', function (e) { if (e.persisted && cards.length) refresh({ force: true }); });
}(typeof window !== 'undefined' ? window : globalThis));
