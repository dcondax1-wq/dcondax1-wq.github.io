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
    box.dataset.key = String(a.key || '');
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
    if (a.wins != null) kv(dl, 'Won / lost', a.wins + ' / ' + a.losses + (a.r_week == null ? '' : ' · ' + (a.r_week > 0 ? '+' : '') + a.r_week + 'R'));
    kv(dl, 'Room above the floor', a.room == null ? '-' : (a.room_start != null ? usd(a.room_start) + ' → ' : '') + usd(a.room));
    if (a.to_pass != null) kv(dl, 'To pass', (a.to_pass_start != null ? usd(a.to_pass_start) + ' → ' : '') + usd(a.to_pass));
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

  function trade(t, label) {
    const box = el('div', 'acc');
    const top = el('div', 'row');
    top.appendChild(el('h3', null, label + ': ' + t.bot + ' ' + (t.side || '') + ' ' + md(t.day) + (t.time ? ' ' + t.time + ' ET' : '')));
    const v = num(t.usd);
    top.appendChild(el('span', 'pill' + (v != null && v >= 0 ? ' ok' : ' bad'), usd(v, true) + (t.r != null ? ' · ' + (t.r > 0 ? '+' : '') + t.r + 'R' : '')));
    box.appendChild(top);
    box.appendChild(el('p', 'y', 'Exit: ' + (t.exit || '-') + (t.mfe_r != null ? ' · best it got: +' + t.mfe_r + 'R' : '') + ' · account ' + (t.acct || '-')));
    box.appendChild(el('p', 'why', 'Lesson: ' + (t.lesson || '-')));
    return box;
  }

  function twin(b) {
    const box = el('div', 'acc');
    const top = el('div', 'row');
    top.appendChild(el('h3', null, b.name));
    top.appendChild(el('span', 'pill' + (b.error ? ' warn' : b.verdict === 'same as the twin' ? ' ok' : ' bad'), b.error ? 'not run' : b.verdict));
    box.appendChild(top);
    if (b.error) { box.appendChild(el('p', 'y', b.error)); return box; }
    box.appendChild(el('p', 'y', b.line || ''));
    const rows = b.rows || [];
    if (rows.length) {
      const tb = el('table', 'tw');
      const hr = el('tr');
      for (const h of ['Day', 'Setup', 'Twin', 'Live', 'Status']) hr.appendChild(el('th', null, h));
      tb.appendChild(hr);
      for (const r of rows) {
        const tr = el('tr');
        tr.appendChild(el('td', null, md(r.day).replace(/^(\w+), /, '$1 ') + ' ' + r.time));
        tr.appendChild(el('td', null, (r.who || '-') + ' ' + (r.side || '').toLowerCase()));
        tr.appendChild(el('td', null, r.twin_r == null ? '-' : (r.twin_r > 0 ? '+' : '') + r.twin_r + 'R ' + (r.twin_exit || '')));
        tr.appendChild(el('td', null, r.live_r == null ? (r.live_usd == null ? '-' : usd(r.live_usd, true)) : (r.live_r > 0 ? '+' : '') + r.live_r + 'R'));
        tr.appendChild(el('td', r.status === 'missed' || r.status === 'extra' ? 'down' : null, r.status));
        tb.appendChild(tr);
      }
      box.appendChild(tb);
    } else box.appendChild(el('p', 'y', 'No trade by the twin or live this week.'));
    return box;
  }

  function drawMore(D) {
    const we = D.weekend || [];
    list($('weekend'), we.map((c) => (c.usd_month == null ? '$?' : usd(c.usd_month, true)) + ' a month: ' + c.question), 'Nothing waiting on you.');
    const bw = $('bw'); bw.textContent = '';
    if (D.best) bw.appendChild(trade(D.best, 'Best'));
    if (D.worst) bw.appendChild(trade(D.worst, 'Worst'));
    if (!D.best && !D.worst) bw.appendChild(el('p', 'note', 'No closed live trade this week.'));
    const T = D.twins || {};
    $('twNote').textContent = (T.days && T.days.length ? 'Replayed ' + md(T.days[0]) + ' to ' + md(T.days[T.days.length - 1]) + ' on the same bars. ' : '') + (T.note || '');
    const tw = $('twins'); tw.textContent = '';
    for (const b of T.bots || []) tw.appendChild(twin(b));
    const K = D.kalshi;
    $('k8').textContent = K && K.line ? K.line + ' (from the ' + K.src + ')' : 'No K8 numbers reached here this week.';
    $('k8Mode').textContent = K && K.mode === 'live' ? 'LIVE' : 'PAPER';
    const cal = $('cal'); cal.textContent = '';
    for (const d of D.calendar || []) {
      const li = el('li', d.status === 'open' ? null : d.status);
      li.appendChild(el('b', null, md(d.date) + ': '));
      const nw = (d.news || []).map((n) => n.time + ' ' + n.event + ' (Tier ' + n.tier + ')').join('; ');
      li.appendChild(document.createTextNode(d.text + (nw ? '. News: ' + nw : '')));
      cal.appendChild(li);
    }
    if (!(D.calendar || []).length) cal.appendChild(el('li', null, 'Calendar not readable.'));
  }

  function draw(D) {
    drawMore(D);
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

  // night-feedsA 2026-11-18: this page is a dated snapshot (week.json, built on Fridays / by Claude); under each account the LIVE line from
  // the PC feed, the ZEUS card's own words (../olympus/zeus_core.js), so a stale stage ("PASSED $26,946") never stands alone next to the
  // ZEUS card's "Funded $24,887"
  function liveNow() {
    const go = () => window.ZEUS_CORE.fetchAll().then((d) => {
      const S = window.ZEUS_CORE.summary(d), rows = (S && S.rows) || [];
      for (const r of rows) {
        const box = document.querySelector('#accts .acc[data-key="' + String(r.key).replace(/[^A-Za-z0-9_-]/g, '') + '"]');
        if (!box || r.planOnly || r.balance == null) continue;
        const old = box.querySelector('.live-now'); if (old) old.remove();
        box.insertBefore(el('p', 'y live-now', 'Live now: ' + r.chip + ' · ' + usd(r.balance) + ' · ' + r.goal + ' (' + r.src + ')'), box.children[1] || null);
      }
      if (rows.length && S.pc && !S.pc.silent) $('status').textContent += ' Live now = your PC, ' + window.ZEUS_CORE.ago(S.pc.age_s) + '.';
    }).catch(() => null);
    if (window.ZEUS_CORE) { go(); return; }
    const sc = document.createElement('script'); sc.src = '../olympus/zeus_core.js?v=3'; sc.async = true; sc.onload = () => { if (window.ZEUS_CORE) go(); }; document.head.appendChild(sc);
  }

  fetch('week.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((D) => { draw(D); if (!/[?&]demo=1(&|$)/.test(location.search)) liveNow(); })
    .catch((e) => { $('status').textContent = 'Could not load this week (' + e.message + '). Pull down to try again.'; });
})();
