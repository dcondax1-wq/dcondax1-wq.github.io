/* WHY (2026-11-18): the "Why we win / why we lose" page. Reads ./why.json (python -X utf8 tools/win_loss_anatomy.py page) and
   draws it. Text only through textContent; it reads one file and sends nothing. WHY.model(doc) is the pure part (node-tested in
   tests/test_why_page.py): the page shows exactly what model() returns. Hidden bots never reach this file (the builder scrubs them)
   and model() drops any bot the file itself lists in hidden_bots. */
(function (W) {
  'use strict';

  function num(x) { var v = Number(x); return (x === null || x === undefined || x === '' || !isFinite(v)) ? null : v; }
  function money(x) {
    var v = num(x);
    if (v === null) return '-';
    var s = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '+') + '$' + s;
  }
  function pct(x) { var v = num(x); return v === null ? '-' : Math.round(v) + '%'; }
  function fixed(x, d) { var v = num(x); return v === null ? '-' : v.toFixed(d); }

  function moneyRows(rows) {
    return (rows || []).map(function (r) {
      return [r.span, String(r.n), fixed(r.tpw, 2), pct(r.win), r.pf === null || r.pf === undefined ? '-' : fixed(r.pf, 2),
              money(r.net), money(r.per_month), money(r.dd)];
    });
  }

  function bars(causes) {
    var list = (causes || []).filter(function (c) { return num(c.usd) !== null; });
    var top = Math.max.apply(null, [1].concat(list.map(function (c) { return Math.abs(num(c.usd)); })));
    return list.map(function (c) {
      return { key: c.key, label: c.label, word: c.word, value: money(c.usd) + ' · ' + pct(c.share) + ' · ' + c.n + (c.n === 1 ? ' trade' : ' trades'),
               width: Math.max(0, Math.min(100, Math.round(100 * Math.abs(num(c.usd)) / top))) };
    });
  }

  function ruleView(r) {
    return { title: r.title, status: r.status, word: r.word || r.status, why: r.why || '',
             rows: (r.months || []).map(function (m) {
               return { span: m.span, now: money(m.now), withIt: money(m['with']), diff: money(m.diff), neg: num(m.diff) !== null && num(m.diff) < 0 };
             }) };
  }

  function model(doc) {
    var d = doc && typeof doc === 'object' ? doc : null;
    if (!d || d.kind !== 'olympus-why' || !Array.isArray(d.bots)) return { ok: false, status: 'No study data yet (why.json is missing or broken).' };
    var hide = Array.isArray(d.hidden_bots) ? d.hidden_bots.map(function (x) { return String(x).toLowerCase(); }) : [];
    var bots = d.bots.filter(function (b) { return b && hide.indexOf(String(b.bot).toLowerCase()) < 0; }).map(function (b) {
      var ck = b.careful || {};
      return {
        id: 'bot-' + b.bot, name: b.name, size: b.size, headline: b.headline,
        lose: bars(b.lose), loseRef: b.lose_ref,
        careful: ck.line, carefulRows: (ck.net || []).map(function (n) { return { span: n.span, usd: money(n.usd), month: money(n.per_month), neg: num(n.usd) !== null && num(n.usd) < 0 }; }),
        win: b.win || [], after: b.after || [], chance: b.chance, biggest: (b.biggest || []).map(function (x) { return x.line; }),
        rules: (b.rules || []).map(ruleView), money: moneyRows(b.money)
      };
    });
    var k = d.kalshi && typeof d.kalshi === 'object' && Array.isArray(d.kalshi.lines) ? d.kalshi : null;
    var kalshi = k ? { title: k.title, lines: k.lines, source: k.source || '',
      rows: (k.legs || []).map(function (l) { return [l.leg, String(l.n), pct(l.won), money(l.usd)]; }),
      price: (k.price || []).map(function (l) { return [l.band, String(l.n), pct(l.won), money(l.usd)]; }) } : null;
    return { ok: true, title: d.title, intro: d.intro, verdict: d.verdict, lines: d.lines || [], tested: d.tested, kalshi: kalshi,
             checklist: d.checklist || [], bots: bots, hiddenNote: d.hidden_note || null,
             status: (d.intro || '') + (d.data_to ? ' Data to ' + d.data_to + '.' : ''),
             foot: 'Built ' + (d.built || '?') + ' · ' + (d.source || '') + ' · ' + (d.note || '') };
  }

  // ------------------------------------------------------------------------------------------------ the page (DOM)
  function el(tag, cls, text) {
    var e = W.document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function list(items) { var ul = el('ul', 'lines'); items.forEach(function (t) { ul.appendChild(el('li', null, t)); }); return ul; }
  function table(head, rows, negCol) {
    var wrap = el('div', 'wrap'), t = el('table', 'tbl'), th = el('thead'), tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr');
      r.cells.forEach(function (c, i) { row.appendChild(el('td', i === negCol && r.neg ? 'neg' : (i === negCol ? 'pos' : null), c)); });
      tb.appendChild(row);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  function card(title, nodes) {
    var s = el('section', 'ag-card');
    s.appendChild(el('h2', null, title));
    nodes.forEach(function (n) { if (n) s.appendChild(n); });
    return s;
  }

  function render(m) {
    var $ = function (id) { return W.document.getElementById(id); };
    var st = $('status');
    if (!m.ok) { st.textContent = m.status; st.className = 'note bad'; return; }
    st.textContent = m.status;
    $('verdictText').textContent = m.verdict || '';
    var vl = $('verdictLines');
    m.lines.forEach(function (t) { vl.appendChild(el('li', null, t)); });
    $('tested').textContent = m.tested || '';
    $('verdict').hidden = false;
    var jump = $('jump');
    m.bots.forEach(function (b) { var a = el('a', null, b.name); a.href = '#' + b.id; jump.appendChild(a); });
    jump.hidden = m.bots.length < 2;
    var host = $('bots');
    m.bots.forEach(function (b) {
      var sec = el('section', 'bot');
      sec.id = b.id;
      sec.appendChild(el('h2', 'sect', b.name));
      sec.appendChild(el('p', 'size', 'Dollars ' + (b.size || '') + ', costs in.'));
      sec.appendChild(card('2026 in one line', [el('p', 'lead', b.headline)]));
      var ul = el('ul', 'bars');
      b.lose.forEach(function (x) {
        var li = el('li'), top = el('div', 'bar-top');
        top.appendChild(el('b', null, x.label)); top.appendChild(el('span', null, x.value));
        var tr = el('div', 'track'), f = el('div', 'fill');
        f.style.width = x.width + '%';
        tr.appendChild(f);
        li.appendChild(top); li.appendChild(tr); li.appendChild(el('p', 'bar-word', x.word));
        ul.appendChild(li);
      });
      sec.appendChild(card('Why we lose (2026)', [ul, el('p', 'hint', b.loseRef)]));
      sec.appendChild(card('Good trades that lost, or ones to skip?', [el('p', null, b.careful),
        el('h3', null, 'Skipping every flagged trade would have made'),
        table(['Period', 'In total', 'A month'], b.carefulRows.map(function (r) { return { cells: [r.span, r.usd, r.month], neg: r.neg }; }), 2)]));
      sec.appendChild(card('Why we win', [list(b.win)]));
      sec.appendChild(card('After the exit', [list(b.after)]));
      if (b.biggest.length) sec.appendChild(card('The 3 biggest losers of 2026', [list(b.biggest)]));
      var rc = card('Rules we tested from this', [el('p', 'hint', 'Picked on Jan-Jun 2026, checked on Jul-Oct and 2021-25, costs in. $ a month: today / with the rule / change.')]);
      b.rules.forEach(function (r) {
        var box = el('div', 'rule'), top = el('div', 'rule-top');
        top.appendChild(el('b', null, r.title)); top.appendChild(el('span', 'chip ' + r.status, r.word));
        box.appendChild(top);
        box.appendChild(table(['Period', 'Today', 'With it', 'Change'], r.rows.map(function (x) { return { cells: [x.span, x.now, x.withIt, x.diff], neg: x.neg }; }), 3));
        box.appendChild(el('p', 'hint', r.why));
        rc.appendChild(box);
      });
      if (!b.rules.length) rc.appendChild(el('p', 'hint', 'No rule tested for this bot.'));
      sec.appendChild(rc);
      var det = el('details', 'more'), sum = el('summary', null, 'The numbers (trades a week, PF, $ a month, max drawdown)');
      det.appendChild(sum);
      det.appendChild(table(['Period', 'Trades', 'A week', 'Win', 'PF', 'Net', 'A month', 'Max DD'],
        b.money.map(function (r) { return { cells: r, neg: false }; }), -1));
      det.appendChild(el('p', 'hint', b.chance));
      sec.appendChild(det);
      host.appendChild(sec);
    });
    if (m.kalshi) {
      $('kalshiH').textContent = m.kalshi.title || 'Kalshi';
      m.kalshi.lines.forEach(function (t) { $('kalshiLines').appendChild(el('li', null, t)); });
      var kt = $('kalshiTable');
      kt.appendChild(table(['Leg', 'Bets', 'Won', 'Net'], m.kalshi.rows.map(function (r) { return { cells: r, neg: false }; }), -1));
      kt.appendChild(table(['Price paid', 'Bets', 'Won', 'Net'], m.kalshi.price.map(function (r) { return { cells: r, neg: false }; }), -1));
      $('kalshiSrc').textContent = 'At $15 a bet, fees in. ' + m.kalshi.source;
      $('kalshi').hidden = false;
    }
    var cl = $('checkLines');
    m.checklist.forEach(function (t) { cl.appendChild(el('li', null, t)); });
    $('checklist').hidden = !m.checklist.length;
    if (m.hiddenNote) { $('hiddenNote').textContent = m.hiddenNote; $('hiddenNote').hidden = false; }
    $('foot').textContent = m.foot;
  }

  var WHY = { model: model, money: money, pct: pct, bars: bars };
  W.WHY = WHY;
  if (typeof module !== 'undefined' && module.exports) module.exports = WHY;
  if (W.document && W.fetch) {
    W.fetch('why.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { render(model(d)); })
      .catch(function () { render(model(null)); });
  }
})(typeof window !== 'undefined' ? window : this);
