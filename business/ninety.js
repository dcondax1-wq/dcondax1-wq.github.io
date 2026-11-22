// NINETY: the next 90 days on the Fleet Plan page (day-fleet 2026-11-21). Reads fleet_plan.json "ninety" (tools/money/fleet_months.py
// phone(), from research/lab/fleet_90day.json): Dec-Feb cash to you today vs with the 3 buys, the 3 buys with their $, the live-move risk.
// Read only, textContent only, no outside address; a missing block shows one plain line and nothing fails.
(function () {
  'use strict';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function usd(v, sign) {
    v = num(v); if (v == null) return '-';
    var s = '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
    return v < 0 ? '-' + s : (sign && v > 0 ? '+' + s : s);
  }
  function mon(m) { m = String(m || ''); return /^\d{4}-\d{2}/.test(m) ? MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : m; }
  function date(d) { d = String(d || ''); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : d; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }

  function render(box, n) {
    var body = box.querySelector('.nn-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!n || typeof n !== 'object' || !Array.isArray(n.months)) {
      body.appendChild(el('p', 'note', 'The 90-day plan shows here once it is published.'));
      return;
    }
    var t = n.totals || {};
    var hero = el('p', 'mid', usd(t.with_buys) + ' Dec-Feb with the 3 buys');
    body.appendChild(hero);
    body.appendChild(el('p', 'note', 'Today\'s plan: ' + usd(t.today) + '. A normal (Jul-Oct 2026-like) market, the middle run, cash to you after ' +
      'MFFU\'s cut, every fee and the ' + Math.round((num(n.tax) || 0.3) * 100) + '% tax pot. Good run ' + usd(t.good) + ', bad run ' + usd(t.bad) +
      '; if the edge halves ' + usd(t.half) + ', 2021-25-like ' + usd(t.ref) + '.'));
    var tbl = el('table', 'tbl'), th = el('thead'), tr = el('tr');
    ['Month', 'Today', 'With 3 buys', 'Good run'].forEach(function (h, i) { tr.appendChild(el('th', i ? 'n' : '', h)); });
    th.appendChild(tr); tbl.appendChild(th);
    var tb = el('tbody');
    n.months.slice(0, 3).forEach(function (m) {
      var r = el('tr');
      r.appendChild(el('td', '', mon(m.m)));
      r.appendChild(el('td', 'n', usd(m.today)));
      r.appendChild(el('td', 'n', usd(m.with_buys)));
      r.appendChild(el('td', 'n', usd(m.good)));
      tb.appendChild(r);
    });
    tbl.appendChild(tb); body.appendChild(tbl);
    var ol = el('ol', 'buy');
    (Array.isArray(n.buys) ? n.buys : []).slice(0, 3).forEach(function (b) {
      var li = el('li');
      li.appendChild(el('b', '', (b.what || '') + ' - $' + (num(b.price) != null ? b.price.toFixed(2) : '-') + ', ' + (b.when || '')));
      li.appendChild(el('span', '', ': ' + usd(b.gain_feb, true) + ' by Feb, ' + usd(b.gain_jun, true) + ' by June; ' +
        usd(b.half_jun, true) + ' if the edge halves; ' + usd(b.worst_jun, true) + ' in a 2021-25-like market. Decide card: ' + (b.id || '') + '.'));
      ol.appendChild(li);
    });
    body.appendChild(ol);
    var k = n.risk || {};
    body.appendChild(el('p', 'note', 'Biggest risk: MFFU moves a Builder account live at its 5th payout (middle date about ' + date(k.live_move_med) +
      ', ' + (num(k.p_by_mar31) != null ? k.p_by_mar31 : '-') + '% by Mar 31) and the other accounts may go dormant: June money about ' +
      (num(k.jun_drop_pct) != null ? k.jun_drop_pct : '-') + '% lower if so. All accounts trade the same bots, so they lose together. ' +
      'An estimate, not a promise; you buy, Claude never does.'));
  }

  function boot() {
    var box = document.getElementById('ninety'); if (!box) return;
    fetch('fleet_plan.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { render(box, d && d.ninety); }, function () { render(box, null); });
  }
  if (typeof document !== 'undefined') boot();
  if (typeof module !== 'undefined') module.exports = { usd: usd, mon: mon, date: date };
})();
