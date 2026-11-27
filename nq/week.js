/* Week in Review (day-weekreview 2026-11-27): draws week_review.json (tools/week_review.py) with weekcore.js. Read only; text only via textContent;
   no storage, no sends. The only request is the same-origin week_review.json (re-read every 5 min while visible). */
(function () {
  'use strict';
  var C = window.WeekCore;
  var app = document.getElementById('app');
  var state = { doc: null, key: null, err: null };

  function h(tag, cls, text, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null && text !== '') e.textContent = text;
    (kids || []).forEach(function (k) { if (k) e.appendChild(k); });
    return e;
  }
  function empty(sel) { var n = document.querySelector(sel); while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function emptyNote(text) { return h('p', 'wk-empty', text); }
  function card(id, title, chip, kids) {
    var s = h('section', 'wk-card', '', [h('div', 'wk-row', '', [h('h2', '', title), chip ? h('span', 'wk-chip', chip) : null])].concat(kids || []));
    if (id) { s.id = id; s.setAttribute('aria-label', title); }
    return s;
  }

  function picker(w) {
    var box = empty('#picker');
    C.pickerRows(state.doc, state.key).forEach(function (p) {
      var b = h('button', 'wk-pick' + (p.active ? ' on' : ''), '', [h('b', '', p.label), h('span', 'wk-pick-sub ' + p.tone, p.sub)]);
      b.type = 'button';
      b.setAttribute('aria-pressed', p.active ? 'true' : 'false');
      b.addEventListener('click', function () { state.key = p.key; draw(); window.scrollTo(0, 0); });
      box.appendChild(b);
    });
  }

  function drawHero(w) {
    var hv = C.hero(w);
    var el = empty('#hero');
    el.setAttribute('data-tone', hv.tone);
    var top = h('div', 'wk-hero-top', '', [
      h('div', '', '', [h('div', 'wk-label', w ? w.label + (w.current ? ' · so far' : '') : 'No week'), h('div', 'wk-big ' + hv.tone, hv.big), h('div', 'wk-sub', 'live net $ across the 4 accounts')]),
      hv.grade ? (function () { var a = h('a', 'wk-gradechip', '', [h('b', '', hv.grade.letter), h('span', '', hv.grade.emoji)]); a.href = '#grade'; a.setAttribute('aria-label', 'Process grade ' + hv.grade.letter + ': jump to the Grade'); return a; })() : null
    ]);
    el.appendChild(top);
    el.appendChild(h('p', 'wk-line', hv.line));
    var days = h('div', 'wk-days');
    C.dayDots(w).forEach(function (d) {
      days.appendChild(h('div', 'wk-day ' + d.tone, '', [h('span', 'wk-dow', d.dow), h('span', 'wk-glyph', d.glyph), h('span', 'wk-dnote', d.usd || d.note || '')]));
    });
    el.appendChild(days);
    var st = h('div', 'wk-stats');
    hv.stats.forEach(function (s) { st.appendChild(h('div', 'wk-stat', '', [h('span', 'wk-stat-e', s.e), h('b', '', s.v), h('span', 'wk-stat-k', s.k)])); });
    el.appendChild(st);
  }

  function tradeCard(c) {
    var usdT = C.tone(c.usd);
    var head = h('div', 'wk-t-head', '', [h('b', '', C.cardTitle(c)), h('span', 'wk-t-usd ' + usdT, C.usd(c.usd) + (c.r !== null && c.r !== undefined ? ' · ' + C.r(c.r) : ''))]);
    var tag = C.cardTag(c);
    var li = h('li', 'wk-trade ' + usdT, '', [head, h('div', 'wk-t-when', C.cardWhen(c) + (c.exit ? ' · exit ' + String(c.exit).toLowerCase().replace(/_/g, ' ') : '')),
      C.cardPrices(c) ? h('div', 'wk-t-px', C.cardPrices(c)) : null, h('p', 'wk-t-why', c.why || ''), tag ? h('span', 'wk-tag', tag) : null]);
    return li;
  }

  function drawAccounts(w) {
    var host = empty('#accounts');
    var cards = (w.accounts || []).map(function (a) {
      var kids = [h('p', 'wk-acc-line', C.accountLine(a))];
      if (a.now) {
        var nb = [];
        if (a.now.balance != null) nb.push(a.id === 'atlas25' ? 'MFFU profit ' + C.usd(a.now.profit, false) : 'balance ' + C.usd(a.now.balance, false));
        if (a.now.room != null) nb.push('room ' + C.usd(a.now.room, false));
        if (a.now.to_target) nb.push(C.usd(a.now.to_target, false) + ' to pass');
        if (nb.length) kids.push(h('p', 'wk-acc-now', nb.join(' · ')));
      }
      if (a.n && a.note) kids.push(h('p', 'wk-acc-note', a.note));
      if (a.trades && a.trades.length) {
        var ol = h('ol', 'wk-trades');
        a.trades.forEach(function (c) { ol.appendChild(tradeCard(c)); });
        kids.push(ol);
      }
      var d = h('details', 'wk-acc ' + C.tone(a.usd));
      if (a.trades && a.trades.length) d.open = true;
      d.appendChild(h('summary', 'wk-acc-sum', '', [h('span', 'wk-acc-name', '', [h('b', '', a.name), h('small', '', a.plan)]), h('span', 'wk-acc-usd ' + C.tone(a.usd), a.n ? C.usd(a.usd) : '$0')]));
      kids.forEach(function (k) { d.appendChild(k); });
      return d;
    });
    host.appendChild(card('accts', '💼 Accounts', 'this week', cards));
  }

  function drawRejected(w) {
    var rj = w.rejected || {};
    var kids = [h('p', 'wk-note', rj.note || '')];
    var emptyTxt = C.rejectedEmpty(w);
    if (emptyTxt) kids.push(emptyNote(emptyTxt));
    var bars = C.whyBar(rj.why);
    if (bars.length) {
      var ul = h('ul', 'wk-why');
      bars.forEach(function (b) {
        var bar = h('span', 'wk-bar'); bar.style.setProperty('--w', b.pct + '%');
        ul.appendChild(h('li', '', '', [h('div', 'wk-why-top', '', [h('b', '', b.why), h('span', 'wk-n', '×' + b.n)]), bar, b.would ? h('small', 'wk-would', b.would) : null]));
      });
      kids.push(ul);
    }
    if ((rj.live || []).length) {
      kids.push(h('h3', 'wk-h3', 'Seen live by the bots (latest)'));
      var l = h('ul', 'wk-list');
      rj.live.slice(0, 8).forEach(function (g) { l.appendChild(h('li', '', '', [h('b', '', g.day.slice(5).replace('-', '/') + ' ' + g.hm), h('span', '', ' ' + g.bot + ': ' + g.text)])); });
      kids.push(l);
    }
    if ((rj.latest || []).length) {
      kids.push(h('h3', 'wk-h3', 'Latest LIT setups that stopped'));
      var l2 = h('ul', 'wk-list');
      rj.latest.slice(0, 8).forEach(function (g) {
        l2.appendChild(h('li', '', '', [h('b', '', g.day.slice(5).replace('-', '/') + ' ' + g.hm), h('span', '', ' ' + (g.side || '') + ': ' + g.why + (g.would_r !== null && g.would_r !== undefined ? ' (would have made ' + C.r(g.would_r) + ')' : ''))]));
      });
      kids.push(l2);
    }
    empty('#rejected').appendChild(card('rejected', '🚫 Setups that formed but were rejected', String(rj.replay_n || 0), kids));
  }

  function drawTwin(w) {
    var kids = [h('p', 'wk-note', 'Bot = backtest check: every trade the backtest twin took this week, and whether the account took it too.')];
    (w.twin || []).forEach(function (a) {
      var ok = !a.missed;
      var rows = (a.rows || []).map(function (r) {
        var s = C.twinStatus(r.status);
        return h('li', 'wk-tw ' + r.status, '', [h('span', 'wk-tw-e', s.e), h('div', '', '', [h('b', '', r.day.slice(5).replace('-', '/') + (r.hm ? ' ' + r.hm : '') + ' ' + String(r.side || '').toUpperCase() + ' · ' + s.t), h('p', 'wk-tw-t', r.text)])]);
      });
      var d = h('details', 'wk-twin' + (ok ? '' : ' bad'));
      if (!ok) d.open = true;
      d.appendChild(h('summary', 'wk-acc-sum', '', [h('span', 'wk-acc-name', '', [h('b', '', a.name), h('small', '', a.verdict)]), h('span', 'wk-ck', ok ? '✅' : '⚠️ ' + a.missed)]));
      if (rows.length) d.appendChild(h('ul', 'wk-tws', '', rows)); else d.appendChild(emptyNote('No twin trade and no live trade: nothing to compare.'));
      kids.push(d);
    });
    var t = w.totals || {};
    empty('#twin').appendChild(card('twin', '🔁 Missed vs the backtest', t.missed ? t.missed + ' missed' : 'all matched', kids));
  }

  function drawWaiting(w) {
    var host = empty('#waiting');
    if (!w.current) { return; }
    var wt = w.waiting;
    var kids = [];
    if (!wt) kids.push(emptyNote('The live feed was not reachable at build time, so what each bot is waiting for is not known.'));
    else {
      if (wt.model) kids.push(h('p', 'wk-note', wt.model));
      var ul = h('ul', 'wk-list');
      (wt.bots || []).forEach(function (b) {
        ul.appendChild(h('li', 'wk-bot', '', [h('b', '', (b.armed ? '🟢 ' : '🔴 ') + b.bot + (b.stage ? ' · ' + b.stage : '')), h('p', 'wk-bot-t', b.text || (b.on ? 'running' : 'off'))]));
      });
      kids.push(ul);
      var win = wt.windows || {};
      var ks = Object.keys(win);
      if (ks.length) kids.push(h('p', 'wk-note', ks.map(function (k) { return (k === 'lit' ? 'LIT: ' : 'ATLAS: ') + win[k]; }).join(' · ')));
    }
    host.appendChild(card('waiting', '⏳ What each bot is waiting for', 'now', kids));
  }

  function drawClock(w) {
    var host = empty('#clock');
    if (!w.current) return;
    var kids = [h('p', 'wk-note', 'MFFU: an account with no fill for 7 days is closed. Each bot must fill before its date.')];
    var rows = C.clockRows(w.clock);
    if (!rows.length) kids.push(emptyNote('No 7-day clock data in the feed.'));
    var ul = h('ul', 'wk-list');
    rows.forEach(function (k) { ul.appendChild(h('li', 'wk-clk ' + k.tone, '', [h('b', '', (k.tone === 'ok' ? '🟢 ' : k.tone === 'warn' ? '🟠 ' : '🔴 ') + k.name), h('span', '', ' ' + k.text + (k.last ? ' · last fill ' + k.last : ''))])); });
    if (rows.length) kids.push(ul);
    var p = w.payout;
    if (p) {
      var pct = C.payoutPct(p);
      var bar = h('div', 'wk-meter'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Payout progress ' + pct + ' percent'); var f = h('span', 'wk-meter-f'); f.style.width = pct + '%'; bar.appendChild(f);
      kids.push(h('h3', 'wk-h3', '💰 ' + p.name + ' payout'));
      kids.push(bar);
      kids.push(h('p', 'wk-note', 'Profit ' + C.usd(p.profit, false) + ' of ' + C.usd(p.at, false) + ' for the ' + C.usd(p.ask, false) + ' request (' + C.usd(p.need, false) + ' to go). '
        + 'Best day ' + C.usd(p.best_day, false) + (p.best_ratio ? ' = ' + Math.round(p.best_ratio * 100) + '% of profit ' + (p.ratio_ok ? '✅' : '(MFFU wants 50% or less: more profit days fix it)') : '') + '.'));
    } else kids.push(emptyNote('No payout data in the feed.'));
    host.appendChild(card('clock', '🗓️ 7-day clock + payout', '', kids));
  }

  function drawOf(w) {
    var o = w.of || {};
    var kids = [h('p', 'wk-note', 'The order-flow practice lane is PAPER: it never touches money. It reads each swept level and takes at most 1 paper trade a day.')];
    if (!o.rows_n && !(o.today && o.today.trades)) kids.push(emptyNote('No order-flow rows for this week.'));
    else {
      kids.push(h('div', 'wk-of', '', [h('div', 'wk-stat', '', [h('b', '', String(o.taken_n || 0)), h('span', 'wk-stat-k', 'taken (paper)')]), h('div', 'wk-stat', '', [h('b', 'num ' + C.tone(o.taken_r), C.r(o.taken_r) || '0R'), h('span', 'wk-stat-k', 'taken result')]),
        h('div', 'wk-stat', '', [h('b', '', String(o.skipped_n || 0)), h('span', 'wk-stat-k', 'skipped')]), h('div', 'wk-stat', '', [h('b', 'num ' + C.tone(o.skipped_r), C.r(o.skipped_r) || '0R'), h('span', 'wk-stat-k', 'skipped would be')])]));
      if (o.today && o.today.line) kids.push(h('p', 'wk-note', '🧪 Today: ' + o.today.line));
    }
    empty('#of').appendChild(card('of', '🧪 Order-flow practice lane', 'PAPER', kids));
  }

  function drawBlitz(w) {
    var b = w.blitz || {};
    var kids = [h('p', 'wk-note', b.text || 'No BLITZ data.')];
    (b.rules || []).forEach(function (r) { kids.push(h('p', 'wk-note', '• ' + r.desc + ': ' + (r.n || 0) + ' paper trades, ' + (r.status || ''))); });
    kids.push(h('p', 'wk-note', 'State: ' + (b.state || 'unknown') + '.'));
    empty('#blitz').appendChild(card('blitz', '⚡ BLITZ (paper)', 'hidden', kids));
  }

  function drawNext(w) {
    var nx = w.next || {};
    var kids = [];
    var strip = h('div', 'wk-days small');
    (nx.days || []).forEach(function (d) { strip.appendChild(h('div', 'wk-day ' + (d.state === 'closed' ? 'closed' : 'future'), '', [h('span', 'wk-dow', d.dow), h('span', 'wk-glyph', d.state === 'closed' ? '🔒' : '·'), h('span', 'wk-dnote', d.note || '')])); });
    kids.push(strip);
    if (!(nx.events || []).length) kids.push(emptyNote('No Tier-1 US news in the calendar for ' + nx.label + '.' + (nx.source === 'none' ? ' (No news calendar file found.)' : '')));
    else {
      var ul = h('ul', 'wk-list');
      nx.events.forEach(function (e) { ul.appendChild(h('li', 'wk-ev', '', [h('b', '', '🔔 ' + e.date.slice(5).replace('-', '/') + ' ' + (e.time || '') + ' ET'), h('span', '', ' ' + e.title)])); });
      kids.push(ul);
    }
    empty('#next').appendChild(card('next', '📅 Next week', nx.label || '', kids));
  }

  function drawGrade(w) {
    var g = C.gradeView(w.grade);
    var kids = [h('div', 'wk-grade-top', '', [h('div', 'wk-grade-l', g.letter), h('div', '', '', [h('div', 'wk-grade-e', g.emoji), h('p', 'wk-grade-say', g.say)])])];
    var ul = h('ul', 'wk-grows');
    g.rows.forEach(function (r) { ul.appendChild(h('li', '', '', [h('span', 'wk-ge', r.e), h('div', '', '', [h('b', '', r.k + ': ' + r.v), h('p', 'wk-gt', r.t)])])); });
    kids.push(ul);
    kids.push(h('p', 'wk-note', g.note));
    var s = card('grade', '🏅 Grade', g.letter + ' ' + g.emoji, kids);
    s.classList.add('wk-grade');
    empty('#gradeBox').appendChild(s);
  }

  function drawChip() {
    var chip = document.getElementById('src');
    var d = state.doc;
    if (!d) { chip.textContent = state.err ? 'No data' : 'Loading…'; chip.setAttribute('data-level', state.err ? 'bad' : 'warn'); return; }
    var a = C.age(d.built_t);
    chip.textContent = a.text;
    chip.setAttribute('data-level', a.level);
    var miss = (d.sources && d.sources.missing) || [];
    var m = document.getElementById('missing');
    m.hidden = !miss.length;
    m.textContent = miss.length ? 'Not in this build: ' + miss.join('; ') + '.' : '';
  }

  function draw() {
    drawChip();
    var w = C.pick(state.doc, state.key);
    if (!w) {
      app.setAttribute('data-state', state.err ? 'error' : state.doc ? 'empty' : 'loading');
      empty('#hero').appendChild(h('p', 'wk-line', state.err ? 'Could not read week_review.json. Pull to refresh in a minute.' : state.doc ? C.hero(null).line : 'Loading the week…'));
      return;
    }
    state.key = w.key;
    app.setAttribute('data-state', 'ready');
    picker(w); drawHero(w); drawAccounts(w); drawRejected(w); drawTwin(w); drawWaiting(w); drawClock(w); drawOf(w); drawBlitz(w); drawNext(w); drawGrade(w);
  }

  function load() {
    fetch('week_review.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (d) { state.doc = d; state.err = null; draw(); })
      .catch(function (e) { state.err = e; if (!state.doc) draw(); else drawChip(); });
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, 300000);
})();
