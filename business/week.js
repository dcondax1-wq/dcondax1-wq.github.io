// ZEUS THIS WEEK page (classic script, read only). Data: ./week.json from tools/weekly_review.py. Everything is drawn with
// textContent; nothing from the data is parsed as HTML.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
  const usd = (v, sign) => { const x = num(v); if (x == null) return '-'; const s = '$' + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 }); return x < 0 ? '-' + s : (sign && x > 0 ? '+' + s : s); };
  const VERDICT = { 'on track': 'ok', ahead: 'ok', behind: 'bad', unknown: '' };
  const STAGE = { eval: 'warn', funded: 'ok', passed: 'ok', failed: 'bad', locked: 'warn' };
  const md = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return String(d || ''); const t = new Date(+m[1], +m[2] - 1, +m[3]); return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

  function kv(dl, k, v, cls) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', cls || null, v)); }
  function list(box, rows, empty) {
    box.textContent = '';
    for (const r of rows || []) box.appendChild(el('li', null, r));
    if (!(rows || []).length) box.appendChild(el('li', null, empty));
  }

  function account(a) {
    const box = el('div', 'acc');
    const top = el('div', 'row');
    top.appendChild(el('h3', null, a.name + (a.plan ? ' · ' + a.plan : '')));
    const st = String(a.stage || '').split(' ')[0].toLowerCase();
    top.appendChild(el('span', 'pill' + (STAGE[st] ? ' ' + STAGE[st] : ''), a.stage || '-'));
    box.appendChild(top);
    const wk = num(a.usd_week);
    box.appendChild(el('span', 'big' + (wk == null ? '' : wk >= 0 ? ' up' : ' down'), wk == null ? '$ this week: unknown' : usd(wk, true) + ' this week'));
    const dl = el('dl', 'kv');
    kv(dl, 'Start of week', usd(a.start));
    kv(dl, 'Now', usd(a.end));
    kv(dl, 'Trades', a.trades == null ? 'unknown' : String(a.trades) + (a.win_pct == null ? '' : ' · ' + a.win_pct + '% won'));
    kv(dl, 'Room above the floor', a.room == null ? '-' : usd(a.room));
    kv(dl, 'Best day', (a.consistency && a.consistency.line) || '-');
    box.appendChild(dl);
    if (a.status_line) box.appendChild(el('p', 'y', a.status_line));
    box.appendChild(el('p', 'y', 'Strategy: ' + (a.strat || '-') + ' · numbers from ' + (a.src || '-')));
    return box;
  }

  function strategy(s) {
    const box = el('div', 'acc');
    const top = el('div', 'row');
    top.appendChild(el('h3', null, s.name));
    top.appendChild(el('span', 'pill' + (VERDICT[s.verdict] ? ' ' + VERDICT[s.verdict] : ''), s.verdict || 'unknown'));
    box.appendChild(top);
    const dl = el('dl', 'kv');
    const rng = (a) => (Array.isArray(a) && a.length === 2 ? a[0] + ' to ' + a[1] : '-');
    kv(dl, '$ this week', s.usd == null ? 'unknown' : usd(s.usd, true));
    kv(dl, 'Expected a week', s.exp_usd_week == null ? '-' : 'about ' + usd(s.exp_usd_week) + (s.plan_usd_month ? ' (plan ' + usd(s.plan_usd_month) + ' a month)' : ''));
    kv(dl, 'Trades', (s.trades == null ? 'unknown' : String(s.trades)) + ' · target ' + s.target);
    kv(dl, 'Trades a week in 2026', rng(s.exp_tpw));
    kv(dl, 'PF this week', s.pf == null ? '-' : String(s.pf));
    kv(dl, 'PF in 2026', rng(s.exp_pf));
    box.appendChild(dl);
    if (s.why) box.appendChild(el('p', 'why', s.why));
    return box;
  }

  function draw(D) {
    const W = D.week || {};
    $('wk').textContent = 'Week of ' + (W.label || '?') + (W.complete ? '' : ' (so far: ' + (W.sessions_done || '?') + ' of 5 days)');
    $('status').textContent = 'Built ' + (D.built || '?') + '. ' + (D.pc || '');
    $('pace').textContent = (D.pace && D.pace.line) || 'On pace: unknown.';
    const ac = $('accts'); ac.textContent = '';
    for (const a of D.accounts || []) ac.appendChild(account(a));
    if (!(D.accounts || []).length) ac.appendChild(el('p', 'note', 'No account on the board.'));
    const sb = $('strats'); sb.textContent = '';
    for (const s of D.strategies || []) sb.appendChild(strategy(s));
    $('light').textContent = D.light && D.light.line ? D.light.line + '. One week is noise: judge on 4+ weeks.' : 'One week is noise: judge on 4+ weeks.';
    const ch = D.changes || {};
    list($('changes'), ch.items, ch.note || 'No code change this week.');
    const N = D.next || {};
    $('nxWhen').textContent = md(N.from) + ' to ' + md(N.to);
    list($('news'), N.news == null ? null : N.news.map((n) => md(n.date) + ' ' + n.time + ' ET: ' + n.what), N.news == null ? 'News calendar not readable.' : 'No Tier-1 news day.');
    list($('hol'), N.holidays == null ? null : N.holidays.map((h) => md(h.date) + ': ' + h.what), N.holidays == null ? 'Holiday calendar not readable.' : 'A normal week: no holiday.');
    list($('steps'), N.steps, 'Nothing planned: the bots run by themselves.');
    list($('dec'), N.decisions, 'Nothing waiting on you.');
    const miss = D.missing || [];
    $('missBox').hidden = !miss.length;
    list($('miss'), miss, '');
    $('foot').textContent = 'Trades from: ' + ((D.sources && D.sources.trades) || 'none') + '. Rebuilt by ' + (D.built_by || 'tools/weekly_review.py') + ' (the PC every Friday from 16:15 ET).';
  }

  fetch('week.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(draw)
    .catch((e) => { $('status').textContent = 'Could not load this week (' + e.message + '). Pull down to try again.'; });
})();
