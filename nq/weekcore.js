/* Week in Review: the pure model (day-weekreview 2026-11-27). No DOM, no network: week.js draws what this returns; tests/test_nq_week.py runs it in node.
   Input = week_review.json (tools/week_review.py). Every function tolerates a missing / partial doc: an honest empty state, never a throw. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeekCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var num = function (v) { var x = Number(v); return (v === null || v === undefined || v === '' || !isFinite(x)) ? null : x; };

  function usd(v, sign) {
    var x = num(v);
    if (x === null) return '-';
    var s = '$' + Math.abs(Math.round(x)).toLocaleString('en-US');
    if (sign === false) return (x < 0 ? '-' : '') + s;
    return (x < 0 ? '-' : '+') + s;
  }
  function r(v) { var x = num(v); return x === null ? '' : (x >= 0 ? '+' : '') + x.toFixed(1) + 'R'; }
  function tone(v) { var x = num(v); return x === null || x === 0 ? 'flat' : x > 0 ? 'up' : 'dn'; }
  function plural(n, w, p) { return n + ' ' + (n === 1 ? w : (p || w + 's')); }

  function age(builtT, nowS) {
    var b = num(builtT);
    if (b === null) return { text: 'no build time', level: 'warn' };
    var s = Math.max(0, (num(nowS) === null ? Date.now() / 1000 : nowS) - b);
    var t = s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
    return { text: 'built ' + t, level: s < 6 * 3600 ? 'ok' : s < 36 * 3600 ? 'warn' : 'bad' };
  }

  function weeks(doc) { return (doc && Array.isArray(doc.weeks)) ? doc.weeks : []; }
  function pick(doc, key) {
    var ws = weeks(doc);
    if (!ws.length) return null;
    for (var i = 0; i < ws.length; i++) if (ws[i].key === key) return ws[i];
    for (var j = 0; j < ws.length; j++) if (ws[j].current) return ws[j];
    return ws[0];
  }
  function pickerRows(doc, key) {
    var cur = pick(doc, key);
    return weeks(doc).map(function (w, i) {
      var t = w.totals || {};
      return { key: w.key, label: w.current ? 'This week' : (i === 1 ? 'Last week' : w.label), sub: w.current ? w.label : usd(t.usd), active: !!cur && cur.key === w.key, tone: tone(t.usd), grade: (w.grade || {}).letter || '' };
    });
  }

  function dayDots(w) {
    return ((w && w.days) || []).map(function (d) {
      var t = d.state === 'closed' ? 'closed' : d.state === 'future' ? 'future' : d.traded ? (num(d.usd) < 0 ? 'loss' : num(d.usd) > 0 ? 'win' : 'flat') : 'quiet';
      var glyph = t === 'closed' ? '🔒' : t === 'future' ? '·' : t === 'win' ? '🟢' : t === 'loss' ? '🔴' : t === 'flat' ? '🟡' : '⚪';
      return { dow: d.dow, d: d.d, tone: t, glyph: glyph, note: d.note || '', usd: d.traded ? usd(d.usd) : '' };
    });
  }

  function hero(w) {
    if (!w) return { empty: true, big: '$0', tone: 'flat', line: 'No week data yet. The page fills after the next build.', stats: [] };
    var t = w.totals || {};
    return {
      empty: false, big: t.n ? usd(t.usd) : '$0', tone: t.n ? tone(t.usd) : 'flat', line: w.headline || '',
      stats: [
        { k: 'Trades', v: String(t.n || 0), e: '🎯' },
        { k: 'Won / lost', v: (t.wins || 0) + ' / ' + (t.losses || 0), e: '⚖️' },
        { k: 'Setups said no', v: String(t.setups_rejected || 0), e: '🚫' },
        { k: 'Twin trades missed', v: String(t.missed || 0), e: (t.missed ? '⚠️' : '✅') }
      ],
      grade: w.grade || null
    };
  }

  function accountLine(a) {
    if (!a) return '';
    if (!a.n) return 'No trades this week.' + (a.note ? ' ' + a.note : '');
    return plural(a.n, 'trade') + ': ' + (a.wins || 0) + ' won, ' + (a.losses || 0) + ' lost.';
  }
  function cardTitle(c) {
    var side = String(c.side || '').toUpperCase();
    return (side === 'LONG' ? '📈 ' : side === 'SHORT' ? '📉 ' : '') + (side || 'Trade') + (c.qty ? ' ×' + c.qty : '') + (c.setup ? ' · ' + c.setup : '');
  }
  function cardWhen(c) {
    var d = c.day ? c.day.slice(5).replace('-', '/') : '';
    return d + ((c.in_hm || c.out_hm) ? ' ' + (c.in_hm || '?') + (c.out_hm ? '→' + c.out_hm : '') + ' ET' : '');
  }
  function cardPrices(c) {
    var parts = [];
    if (num(c.entry) !== null) parts.push('in ' + Number(c.entry).toLocaleString('en-US', { maximumFractionDigits: 2 }));
    if (num(c.stop) !== null) parts.push('stop ' + Number(c.stop).toLocaleString('en-US', { maximumFractionDigits: 2 }));
    if (num(c.target) !== null) parts.push('target ' + Number(c.target).toLocaleString('en-US', { maximumFractionDigits: 2 }));
    return parts.join(' · ');
  }
  function cardTag(c) {
    if (c.mode === 'paper') return 'PAPER';
    if (c.phase === 'eval') return 'EVAL phase (before funding): not in the funded $';
    if (c.src === 'twin') return 'TWIN prices (the $ is the audited PC day)';
    return '';
  }

  var STATUS = { matched: { e: '✅', t: 'taken' }, missed: { e: '❌', t: 'missed' }, skipped: { e: '↪️', t: 'skipped by design' }, open: { e: '⏳', t: 'pending' }, extra: { e: '➕', t: 'extra' } };
  function twinStatus(s) { return STATUS[s] || { e: '•', t: String(s || '') }; }

  function rejectedEmpty(w) {
    var rj = (w && w.rejected) || {};
    if (rj.replay_n || (rj.live && rj.live.length)) return '';
    return 'No setups formed this week, or the twin file for it is not in the repo yet.';
  }
  function whyBar(rows) {
    var mx = 0;
    (rows || []).forEach(function (x) { mx = Math.max(mx, x.n || 0); });
    return (rows || []).map(function (x) { return { why: x.why, n: x.n, pct: mx ? Math.round(100 * x.n / mx) : 0, would: x.n_would ? (x.would >= 0 ? '+' : '') + x.would.toFixed(1) + 'R if taken (' + x.wins + ' of ' + x.n_would + ' would have won)' : '' }; });
  }

  function payoutPct(p) {
    if (!p) return null;
    var at = num(p.at) || 2100, pr = Math.max(0, num(p.profit) || 0);
    return Math.max(0, Math.min(100, Math.round(100 * pr / at)));
  }
  function clockRows(c) {
    return (c || []).map(function (k) {
      var left = num(k.left);
      return { name: k.name, last: k.last_fill, due: k.due, left: left, lvl: k.lvl, tone: k.lvl === 'ok' || !k.lvl ? 'ok' : (left !== null && left <= 1 ? 'bad' : 'warn'), text: left === null ? 'no clock data' : plural(left, 'day') + ' left (next fill by ' + (k.due || '?') + ')' };
    });
  }

  function gradeView(g) {
    if (!g) return { empty: true, rows: [], letter: '-', emoji: '', say: 'No grade without a week.', note: '' };
    return { empty: false, letter: g.letter, emoji: g.emoji, say: g.say, rows: g.rows || [], note: g.note || '' };
  }

  return { usd: usd, r: r, tone: tone, plural: plural, age: age, pick: pick, pickerRows: pickerRows, dayDots: dayDots, hero: hero, accountLine: accountLine,
           cardTitle: cardTitle, cardWhen: cardWhen, cardPrices: cardPrices, cardTag: cardTag, twinStatus: twinStatus, rejectedEmpty: rejectedEmpty, whyBar: whyBar,
           payoutPct: payoutPct, clockRows: clockRows, gradeView: gradeView };
});
