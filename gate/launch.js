/* THE LAUNCH CARD on the Gate (Monday launch kit, 2026-11-14, docs/LAUNCH_DAY.md). Only when the PC serves the site (/site/, the private
 * Tailscale link, docs/LIVE_DASHBOARD.md): right under "Right now", one card for today. Per bot (Zlarior 50K, ATLAS 25K, BLITZ when its
 * account is on): armed?, feed fresh?, trades today, today's $, drawdown left, the open trade with its $ risk, every flag with its one action
 * (incl. the real-fill check, tools/fill_check.py), then whether the phone alerts work. From the bot server's GET /api/site/launch.json
 * (tools/launch_card.py), every minute. Under it the first-day checklist (gate/launch_day.json, the same as docs/LAUNCH_DAY.md, written by
 * tools/launch_day.py). Classic ES5 script, no build step; text only through textContent; read only (GET only); no storage. */
(function () {
  'use strict';
  var d = document, w = window, base = w.GATE_BASE || '';
  var ON_PC = /^\/site\//.test(w.location.pathname || ''), API = '/api/site/launch.json', EVERY_MS = 60000;
  var S = { done: false, data: null, checklist: null, error: null, draws: 0 };
  var BADGE = { ok: ['ok', 'Ready'], warn: ['warn', 'Check'], bad: ['bad', 'Fix now'] };

  function $(id) { return d.getElementById(id); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function obj(x) { return x && typeof x === 'object' && !(x instanceof Array) ? x : {}; }
  function arr(x) { return x instanceof Array ? x : []; }
  function money(x) { var v = num(x); if (v == null) return '–'; var a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '−' : '') + '$' + a.toLocaleString('en-US'); }
  function moneyS(x) { var v = num(x); return v != null && Math.round(v) > 0 ? '+' + money(v) : money(v); }
  function px(x) { var v = num(x); return v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ago(sec) { var s = Math.max(0, Math.round(num(sec) || 0)); return s < 60 ? 'less than a minute' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h'; }
  function getJSON(url) {
    if (!w.fetch) return { then: function (ok) { ok(null); return { 'catch': function () {} }; } };
    return w.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json()['catch'](function () { return null; }) : null; })['catch'](function () { return null; });
  }

  /* ------------------------------------------------------------------------------------------ the card */
  function shell() {
    var c = $('launch');
    if (c) return c;
    c = el('section', 'g-card g-launch'); c.id = 'launch'; c.setAttribute('aria-labelledby', 'launchH'); c.setAttribute('data-level', 'loading');
    var head = el('div', 'g-nowhead'), h = el('h2', '', 'Launch'), b = el('span', 'g-badge', 'Checking');
    h.id = 'launchH'; b.id = 'launchBadge';
    head.appendChild(h); head.appendChild(b); c.appendChild(head);
    var line = el('p', 'lk-headline', 'Asking the bot server for today...'); line.id = 'launchLine'; line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite');
    c.appendChild(line);
    var g = el('ul', 'lk-flags'); g.id = 'launchGlobal'; c.appendChild(g);
    var bots = el('div', 'lk-bots'); bots.id = 'launchBots'; c.appendChild(bots);
    var rep = el('p', 'lk-report'); rep.id = 'launchReport'; c.appendChild(rep);
    var foot = el('p', 'g-nowfoot'); foot.id = 'launchFoot'; c.appendChild(foot);
    var now = $('now');
    if (now && now.parentNode) now.parentNode.insertBefore(c, now.nextSibling); else (d.getElementById('gate') || d.body).appendChild(c);
    return c;
  }
  function fact(box, label, value, sub, cls) {
    var f = el('div', 'lk-f');
    f.appendChild(el('span', 'lk-fl', label)); f.appendChild(el('span', 'lk-fv' + (cls ? ' ' + cls : ''), value));
    if (sub) f.appendChild(el('span', 'lk-fs', sub));
    box.appendChild(f);
  }
  function flagList(ul, flags) {
    clear(ul);
    arr(flags).forEach(function (f) {
      f = obj(f);
      var li = el('li', 'lk-flag ' + (f.level === 'bad' ? 'bad' : f.level === 'info' ? 'info' : 'warn'));
      li.appendChild(el('span', 'lk-ft', String(f.text || '')));
      if (f.fix) li.appendChild(el('span', 'lk-do', 'Do: ' + f.fix));
      ul.appendChild(li);
    });
    ul.hidden = !ul.firstChild;
  }
  function pillCls(r) { return r.mode === 'LIVE' ? (r.armed ? 'ok' : 'bad') : r.mode === 'OFF' ? 'off' : 'warn'; }
  function drawBot(box, r) {
    var b = el('div', 'lk-bot'); b.setAttribute('data-bot', String(r.id || '')); b.setAttribute('data-level', String(r.level || 'ok'));
    var head = el('div', 'lk-bothead');
    head.appendChild(el('span', 'lk-name', String(r.label || r.name || r.id)));
    head.appendChild(el('span', 'lk-pill ' + pillCls(r), String(r.state || r.mode || '')));
    b.appendChild(head);
    if (r.mode !== 'OFF') {
      var fs = el('div', 'lk-facts'), fd = obj(r.feed), t = num(r.trades), mx = num(r.max_day), used = num(r.used);
      fact(fs, 'Feed', fd.ok === false ? 'STALE' : fd.ok ? (fd.closed ? 'Closed' : 'Fresh') : '?', String(fd.text || ''), fd.ok === false ? 'bad' : fd.ok ? 'ok' : '');
      fact(fs, 'Trades today', t == null ? '–' : String(t) + (mx ? ' of ' + mx : ''), '', '');
      fact(fs, 'Today', moneyS(r.today), '', num(r.today) > 0.5 ? 'up' : num(r.today) < -0.5 ? 'down' : '');
      fact(fs, 'Drawdown left', money(r.room), num(r.mll) != null ? 'of ' + money(r.mll) + (used != null ? ' (' + Math.round(used * 100) + '% used)' : '') : '', used != null && used >= 0.75 ? 'bad' : used != null && used >= 0.5 ? 'warn' : '');
      b.appendChild(fs);
      var p = obj(r.position);
      if (p.side) b.appendChild(el('p', 'lk-pos', 'In a trade: ' + p.side + ' ' + (p.qty != null ? p.qty + ' micros ' : '') + 'at ' + px(p.entry) + ', stop ' + px(p.stop)
        + (p.target != null ? ', target ' + px(p.target) : '') + (p.risk_usd != null ? ', risk ' + money(p.risk_usd) + ' if stopped' : '') + '.'));
    }
    var ul = el('ul', 'lk-flags'); b.appendChild(ul); flagList(ul, r.flags);
    var fl = arr(r.fills);
    if (fl.length) b.appendChild(el('p', 'lk-fill', 'Last fill check: ' + fl[0]));
    box.appendChild(b);
  }
  function draw(D, why) {
    var c = shell(), badge = $('launchBadge'), line = $('launchLine'), bots = $('launchBots'), rep = $('launchReport'), foot = $('launchFoot');
    S.draws++;
    if (!D || D.kind !== 'le-launch') {
      c.setAttribute('data-level', 'none');
      badge.className = 'g-badge'; badge.textContent = 'Not available';
      line.textContent = why === 'old' ? 'The bot server on the PC runs an older version: this card shows after its next restart (when flat: STOP_BOT.bat, then tools/bat/GO_LIVE_EVAL.bat).'
        : 'The bot server did not answer. Right now above still shows the last numbers.';
      clear(bots); flagList($('launchGlobal'), []); rep.textContent = ''; foot.textContent = '';
      return;
    }
    var lv = BADGE[D.level] ? D.level : 'warn';
    c.setAttribute('data-level', lv);
    badge.className = 'g-badge ' + BADGE[lv][0]; badge.textContent = BADGE[lv][1];
    line.textContent = String(D.headline || '');
    flagList($('launchGlobal'), D.global);
    clear(bots);
    arr(D.bots).forEach(function (r) { drawBot(bots, obj(r)); });
    if (!arr(D.bots).length) bots.appendChild(el('p', 'lk-empty', 'No bot numbers in the live report yet.'));
    var R = obj(D.report);
    rep.textContent = R.text ? String(R.text) + (R.level === 'warn' && R.fix ? ' ' + R.fix : '') : '';
    rep.className = 'lk-report' + (R.level === 'warn' ? ' warn' : R.level === 'ok' ? ' ok' : '');
    var age = num(D.live_t) != null ? (Date.now() / 1000 - D.live_t) : null;
    foot.textContent = 'Live from your PC' + (age != null && age >= 60 ? ', ' + ago(age) + ' old' : '') + '. Updates every minute. Read only: nothing here can trade.';
  }

  /* ------------------------------------------------------------------------------------------ the first-day checklist */
  function drawChecklist(C) {
    if (!C || C.kind !== 'le-launch-day' || $('launchDay')) return;
    var c = el('section', 'g-card g-check'); c.id = 'launchDay'; c.setAttribute('aria-labelledby', 'launchDayH');
    var h = el('h2', '', String(C.title || 'First day')); h.id = 'launchDayH'; c.appendChild(h);
    if (C.intro) c.appendChild(el('p', 'lk-intro', String(C.intro)));
    var ol = el('ol', 'lk-steps');
    arr(C.steps).forEach(function (s) { ol.appendChild(el('li', '', String(s))); });
    if (ol.firstChild) c.appendChild(ol);
    arr(C.sections).forEach(function (sec, i) {
      sec = obj(sec);
      var dt = el('details', 'lk-sec'), sm = el('summary', '', String(sec.title || ''));
      if (i === 0) dt.open = true;
      dt.setAttribute('data-sec', String(sec.id || i));
      dt.appendChild(sm);
      var cols = arr(sec.cols);
      arr(sec.rows).forEach(function (row) {
        row = arr(row);
        var it = el('div', 'lk-item');
        it.appendChild(el('b', '', String(row[0] || '')));
        if (row[1]) it.appendChild(el('span', 'lk-mean', (cols[1] ? cols[1] + ': ' : '') + row[1]));
        if (row[2]) it.appendChild(el('span', 'lk-do', (cols[2] || 'Do') + ': ' + row[2]));
        dt.appendChild(it);
      });
      c.appendChild(dt);
    });
    if (C.stop) c.appendChild(el('p', 'lk-stop', String(C.stop)));
    var after = $('launch') || $('now');
    if (after && after.parentNode) after.parentNode.insertBefore(c, after.nextSibling); else (d.getElementById('gate') || d.body).appendChild(c);
  }

  /* ------------------------------------------------------------------------------------------ start */
  /* the card's data: (D, '') when it answers, (null, 'old') when the route is not there (a server started before this code), (null, 'none') else */
  function fetchApi(cb) {
    if (!w.fetch) { cb(null, 'none'); return; }
    w.fetch(API + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) { cb(null, 'old'); return; }
      r.json().then(function (j) { var ok = j && j.kind === 'le-launch'; cb(ok ? j : null, ok ? '' : 'none'); }, function () { cb(null, 'none'); });
    })['catch'](function () { cb(null, 'none'); });
  }
  function load() {
    fetchApi(function (D, why) {
      S.error = why || null;
      if (D) { S.data = D; draw(D); }
      else if (S.data && why === 'none') {            /* a missed refresh keeps the last card and says how old it is */
        var foot = $('launchFoot'), t = num(S.data.t);
        if (foot) foot.textContent = 'The bot server did not answer the last check' + (t != null ? ': these numbers are ' + ago(Date.now() / 1000 - t) + ' old.' : '.');
      } else draw(null, why);
      if (!S.checklist) getJSON(base + 'gate/launch_day.json').then(function (C) { if (C) { S.checklist = C; drawChecklist(C); } S.done = true; });
      else S.done = true;
    });
  }
  function boot() {
    if (!ON_PC) return;                 /* any other copy of the site: nothing (it has no bot server behind it) */
    try {
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'gate/launch.css?v=l1'; (d.head || d.documentElement).appendChild(l);
    } catch (e) { /* the card still draws, unstyled */ }
    shell();
    load();
    if (w.setInterval) w.setInterval(function () { if (d.visibilityState !== 'hidden') load(); }, EVERY_MS);
  }

  w.GATE_LAUNCH = { ready: function () { return S.done; }, state: S, on: ON_PC };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
