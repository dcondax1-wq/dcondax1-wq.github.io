// MONEY PLAN page (classic script, read only; 2026-11-18 night-money). Data: ./plan.json from tools/money/money_plan.py
// (tonight's accounts + every open decision on the same simulated days) and ./decisions.json (the Decide card's questions and
// the values the same tool wrote). Everything is drawn with textContent / createElementNS; nothing is parsed as HTML.
// window.MONEY_PLAN = the test hook ({ok, mkt, five, hero, accounts, decisions}).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const usd = (v, sign) => (v == null || !Number.isFinite(+v) ? '-' : (+v < 0 ? '-' : sign && +v > 0 ? '+' : '') + '$' + Math.abs(Math.round(+v)).toLocaleString('en-US'));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => (d ? MN[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : 'none');
  const usd2 = (v) => (v == null || !Number.isFinite(+v) ? '-' : '$' + (+v).toLocaleString('en-US', { minimumFractionDigits: Math.round(+v) === +v ? 0 : 2, maximumFractionDigits: 2 }));
  const pct = (v) => (v == null ? '-' : (+v).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%');
  const MKTS = [['H2', 'Jul-Oct 2026 (fair)'], ['H1', 'Jan-Jun 2026 (good)'], ['REF', '2021-25 (bad)']];
  const BYKEY = { H2: 'jul_oct', H1: 'jan_jun', REF: 'y2021_25' };
  const ORDER = ['A25', 'N25', 'Z50', 'R25', 'R2'];
  const STAGE = { funded: ['ok', 'funded'], eval: ['warn', 'eval'], 'buy tonight': ['info', 'buy tonight'] };
  let D = null, DEC = null, mkt = 'H2', five = false;
  try { const s = localStorage.getItem('plan.mkt'); if (MKTS.some((m) => m[0] === s)) mkt = s; } catch (e) { /* default */ }
  const hook = { ok: null };
  window.MONEY_PLAN = hook;

  function kv(dl, rows) {
    dl.textContent = '';
    for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  }
  function seg(box, items, cur, on) {
    box.textContent = '';
    for (const [k, t] of items) {
      const b = el('button', 'btn', t); b.type = 'button'; b.setAttribute('aria-pressed', String(k === cur));
      b.addEventListener('click', () => on(k)); box.appendChild(b);
    }
  }
  function mlabel(m, i, n) {
    const nm = MN[+m.slice(5, 7) - 1];
    if (i === 0) return nm + ' ' + (+D.start.slice(8, 10)) + '-30';
    if (i === n - 1) return nm + ' 1-' + (+D.end.slice(8, 10));
    return nm;
  }

  function fan(rows) {
    const svg = $('fan'), NS = 'http://www.w3.org/2000/svg', W = 340, H = 190, L = 8, R = 100, T = 12, B = 24;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const pts = [{ lo: 0, mid: 0, hi: 0 }].concat(rows.map((r) => ({ lo: r.cum_net_p10, mid: r.cum_net_p50, hi: r.cum_net_p90 })));
    const ymax = Math.max(1, ...pts.map((p) => p.hi)), ymin = Math.min(0, ...pts.map((p) => p.lo));
    const x = (i) => L + (W - L - R) * i / (pts.length - 1), y = (v) => T + (H - T - B) * (ymax - v) / (ymax - ymin || 1);
    const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    mk('line', { class: 'zero', x1: L, x2: W - R, y1: y(0), y2: y(0) });
    const up = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.hi).toFixed(1)), dn = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.lo).toFixed(1)).reverse();
    mk('polygon', { class: 'band', points: up.concat(dn).join(' ') });
    mk('polyline', { class: 'mid2', points: pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.mid).toFixed(1)).join(' ') });
    const lab = (tx, xx, yy, cls, anchor) => { const t = mk('text', { x: xx, y: yy, class: cls || '', 'text-anchor': anchor || 'start' }); t.textContent = tx; };
    const n = pts.length - 1, last = pts[n];
    const ys = [[last.hi, 'good'], [last.mid, 'middle'], [last.lo, 'bad']].map(([v, k]) => [v, k, y(v)]);
    for (let i = 1; i < ys.length; i++) if (ys[i][2] - ys[i - 1][2] < 13) ys[i][2] = ys[i - 1][2] + 13;   // keep end labels apart
    for (const [v, k, yy] of ys) lab(usd(v) + ' ' + k, x(n) + 4, Math.min(H - B, yy) + 4, k === 'middle' ? 'end' : '');
    rows.forEach((r, i) => { if (i % 2 === 1 || i === rows.length - 1) lab(MN[+r.month.slice(5, 7) - 1], x(i + 1), H - 6, '', 'middle'); });
    lab(day(D.start), x(0), H - 6, '', 'start');
  }

  function nowLine(k) {
    const a = (D.now || []).find((r) => r.key === k);
    if (!a) return k === 'R2' ? 'Not bought yet: the next buy, paid from payouts.' : '';
    const bits = [];
    if (a.balance != null) bits.push('Tonight ' + usd(a.balance));
    else if (a.price != null) bits.push('Buy for ' + usd2(a.price) + ' (CLUB)');
    if (a.to_pass != null) bits.push(usd(a.to_pass) + ' to pass');
    if (a.room != null) bits.push(usd(a.room) + ' of room');
    if (a.bots) bits.push(a.bots);
    return bits.join(' · ');
  }

  function accCard(k, a) {
    const s = el('section'); s.dataset.key = k;
    const n = (D.now || []).find((r) => r.key === k) || {};
    const h = el('h3', null, (D.names || {})[k] || k);
    const st = k === 'R2' ? ['', 'next buy'] : (STAGE[n.stage] || ['', n.stage || '']);
    h.appendChild(el('span', 'pill' + (st[0] ? ' ' + st[0] : ''), st[1]));
    s.appendChild(h);
    const nl = nowLine(k);
    if (nl) s.appendChild(el('p', 'now', nl));
    s.appendChild(el('p', 'usd', usd(a.cash_m) + ' a month'));
    const rows = [];
    const e = a.eval;
    if (e) {
      rows.push(['Chance it passes (3 months)', pct(e.p60) + ' (fails ' + pct(e.f60) + ')']);
      if (e.pass_date) rows.push(['Likely pass', '~' + day(e.pass_date) + ' (about ' + Math.round(e.pass_med) + ' trading days)']);
    }
    if (k === 'R2') rows.push(['Bought (likely)', a.buy_med ? '~' + day(a.buy_med) + ' (' + pct(a.p_bought) + ' of runs)' : 'not in 6 months']);
    rows.push(['First payout (likely)', a.first_pay ? '~' + day(a.first_pay) + (a.first_pay_p25 ? ' (' + day(a.first_pay_p25) + ' to ' + day(a.first_pay_p75) + ')' : '') : 'none in 6 months']);
    if (a.first_pay_usd) rows.push(['First payout to you', usd(a.first_pay_usd) + ' (' + usd(a.first_pay_usd * (1 - D.tax)) + ' after the tax pot)']);
    rows.push(['Chance of a payout by Jan 31', pct(a.p_pay_by_jan31)]);
    rows.push(['No payout at all in 6 months', pct(a.p_no_pay_6m)]);
    if (a.lost_6m) rows.push(['Funded account lost in 6 months (then a fresh eval)', pct(a.lost_6m)]);
    const dl = el('dl', 'kv'); kv(dl, rows); s.appendChild(dl);
    return s;
  }

  // the next pocket buy round (<= $150): a fresh Builder 50K next to Zlarior's hole, once MFFU says yes in writing (the Decide
  // card's ask-mffu-parallel; tools/money/money_plan.py; research/writeups/lit-ideas-2026-11-18b.md measured +$50 / +$54)
  function fresh50(x, pr) {
    const d = x || {}, fd = d.first_pay_days;
    return 'Your next $' + D.budget + ' round, once MFFU says yes in writing: a fresh Builder 50K (' + usd2(pr.builder50k) + ') next to Zlarior\'s. Both trade; the first pass is kept. '
      + (d.usd_month != null ? 'About ' + usd(d.usd_month, true) + ' a month after its fee' : 'A small plus')
      + (fd != null && Math.abs(fd) >= 1 ? ', the 50K\'s first payout about ' + Math.round(Math.abs(fd)) + ' trading days ' + (fd < 0 ? 'sooner' : 'later') : '') + '.';
  }

  // Kalshi K8 (gold / silver clock bets): never added to the MFFU totals, never called proven
  function kalshi(k) {
    const box = $('k8'), dl = $('k8kv');
    if (!k) { box.textContent = 'No Kalshi data in this plan.'; dl.textContent = ''; return; }
    box.textContent = k.status + '. Not counted in any number above. Proven only after ' + k.proof_bar + '.';
    const m = Array.isArray(k.month_if_held) ? k.month_if_held : [];
    kv(dl, [['If it holds up, at ' + usd(k.bet) + ' a bet', (m.length ? usd(m[0]) + '-' + usd(m[1]) + ' a month' : '-') + ' (past weeks: ' + usd(k.week_in_sample) + ' a week, the last 4 weeks ' + usd(k.week_last4) + ')'],
      ['Normal bad stretch', usd(k.deepest_dip) + ' (worst day ' + usd(k.worst_day) + ', the newest week ' + usd(k.newest_week) + ')'],
      ['Keep in the Kalshi account', 'at least ' + usd(k.bankroll)]]);
    hook.k8 = true;
  }

  function decisions() {
    const box = $('dec'); box.textContent = '';
    const items = (DEC && Array.isArray(DEC.items) ? DEC.items : []).filter((d) => d && d.id && String(d.status || 'open') === 'open');
    const val = (d) => { const b = d.usd_month_by || {}; const v = b[BYKEY[mkt]]; return v == null ? (d.usd_month == null ? null : d.usd_month) : v; };
    items.sort((a, b) => (val(b) == null ? -1e9 : val(b)) - (val(a) == null ? -1e9 : val(a)));
    hook.decisions = [];
    for (const d of items) {
      const ar = el('article'); ar.dataset.id = d.id;
      ar.appendChild(el('p', 'q', d.question || d.id));
      const v = val(d);
      ar.appendChild(el('p', 'w', v == null ? 'Not valued yet' : (v === 0 ? '$0 a month' : usd(v, true) + ' a month') + (d.unlocks ? ' (what a yes unlocks)' : '')));
      if (d.recommend) {
        const say = el('p', 'say');
        say.appendChild(el('span', 'pill ' + (d.recommend === 'yes' ? 'yes' : d.recommend === 'no' ? 'no' : 'warn'), 'Claude says ' + String(d.recommend).toUpperCase()));
        say.appendChild(document.createTextNode(' ' + (d.recommend_why || '')));
        ar.appendChild(say);
      }
      if (d.risk) ar.appendChild(el('p', 'r', 'Risk: ' + d.risk));
      box.appendChild(ar);
      hook.decisions.push({ id: d.id, usd: v, rec: d.recommend || null });
    }
    if (!items.length) box.appendChild(el('p', 'note', 'Nothing waiting on you.'));
    $('decNote').textContent = 'Each one changes one account; its $ is what a YES adds a month in this market (after fees and MFFU\'s cut, before the tax pot). Answer Yes / No on the Board from your PC link, or tell Claude.';
  }

  function draw() {
    const R = D.rows[mkt], F = R.fleet[five ? 'five' : 'four'], P = (R.picks || {})[five ? 'five' : 'four'], A = R.accounts;
    seg($('mkt'), MKTS, mkt, (k) => { mkt = k; try { localStorage.setItem('plan.mkt', k); } catch (e) { /* no storage */ } draw(); });
    seg($('cnt'), [['4', "Tonight's 4 accounts"], ['5', '+ the next buy (Rapid 50K)']], five ? '5' : '4', (k) => { five = k === '5'; draw(); });
    const big = $('big'); big.textContent = usd(F.cash_m); big.appendChild(el('small', null, ' a month'));
    $('bigNote').textContent = 'Average over the next 6 months (to ' + day(D.end) + '), after every eval fee and MFFU\'s cut. Put 30% of each payout in the tax pot: that leaves ' + usd(F.net_m) + ' a month.';
    const rows = [
      ['By spring (Mar-Apr), a month', usd(F.spring_cash_m) + ' (' + usd(F.spring_net_m) + ' after the tax pot)'],
      ['6 months, after the tax pot: bad 10 in 100 / middle / good 10 in 100', usd(F.net_6m_p10) + ' / ' + usd(F.net_6m_p50) + ' / ' + usd(F.net_6m_p90)]];
    if (P) rows.push(["With Claude's yes / no picks (below)", usd(P.cash_m) + ' a month (' + usd(P.cash_m - F.cash_m, true) + ')']);
    rows.push(['Chance of NO payout at all by Jan 31', pct(F.p_no_pay_by_jan31)], ['Chance you end 6 months down', pct(F.p_net_negative_6m)],
      ['Keep ready for re-buys (9 in 10 / 19 in 20 runs)', usd(F.pocket_p90) + ' / ' + usd(F.pocket_p95)]);
    kv($('sum'), rows);
    // the first payout
    const first = ORDER.filter((k) => A[k] && A[k].first_pay && (five || k !== 'R2')).sort((a, b) => (A[a].first_pay < A[b].first_pay ? -1 : 1))[0];
    $('pay1').textContent = F.first_any ? '~' + day(F.first_any) : 'none likely in 6 months';
    const fa = first ? A[first] : null;
    $('pay1Note').textContent = (fa ? 'Most likely from ' + ((D.names || {})[first] || first) + ': about ' + usd(fa.first_pay_usd) + ' to you (' + usd(fa.first_pay_usd * (1 - D.tax)) + ' after the 30% tax pot). ' : '')
      + 'Chance of a payout by Dec 31: ' + pct(F.p_pay_by_dec31) + '. It reaches your bank about 2-4 business days after you ask.';
    // the accounts
    const box = $('acc'); box.textContent = '';
    hook.accounts = [];
    for (const k of ORDER) {
      const a = A[k]; if (!a || (k === 'R2' && !five)) continue;
      box.appendChild(accCard(k, a)); hook.accounts.push(k);
    }
    // what to buy
    const b = $('buy'); b.textContent = '';
    const r2 = A.R2 || {}, pr = D.prices || {};
    const steps = [
      'Tonight or tomorrow: the Rapid EOD 25K, ' + usd2(pr.rapid_eod25k) + ' with CLUB (leaves ' + usd2(D.budget - pr.rapid_eod25k) + ' of your ' + usd2(D.budget) + '). Add it with ADD_ACCOUNT.bat, option 5. It is added OFF until START BOT and you type the phrase.',
      fresh50(R.decisions && R.decisions['ask-mffu-parallel'], pr),
      'An eval fails: buy the same one again at once (Builder 50K ' + usd2(pr.builder50k) + ', 25K ' + usd2(pr.builder25k) + ', Rapid 25K ' + usd2(pr.rapid_eod25k) + '). Keep ' + usd(F.pocket_p90) + ' ready (' + usd(F.pocket_p95) + ' covers 19 in 20 runs).',
      'Next buy, paid from payouts (not your pocket): a Rapid EOD 50K (' + usd2(pr.rapid_eod50k) + ' with CLUB) once payouts after the tax pot reach ' + usd2(pr.rapid_eod50k) + ': likely ~' + day(r2.buy_med) + ' (' + pct(r2.p_bought) + ' of runs). It is your 5th funded slot and about ' + usd(r2.cash_m) + ' a month. The bot runs one Rapid today: say yes and Claude wires the second.',
      'A funded account can get stuck after a losing streak (under $100 of room: the bot stops trading it). Then a fresh eval of the same size replaces it; that is counted above.'];
    for (const t of steps) b.appendChild(el('li', null, t));
    decisions();
    kalshi(D.kalshi_k8);
    // the running total + month by month
    fan(F.months);
    $('fanNote').textContent = 'Gold line = the middle case; band = bad 10 in 100 to good 10 in 100. Every account trades the same signals, so a bad stretch hits all of them at once.';
    const tb = $('mon').tBodies[0]; tb.textContent = '';
    F.months.forEach((r, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, mlabel(r.month, i, F.months.length)));
      tr.appendChild(el('td', 'n', usd(r.cash_mean)));
      tr.appendChild(el('td', 'n', usd(r.net_mean)));
      const td = el('td', 'n', usd(r.cum_net_p50)); td.appendChild(el('div', 'note', usd(r.cum_net_p10) + ' to ' + usd(r.cum_net_p90))); tr.appendChild(td);
      tb.appendChild(tr);
    });
    $('foot').textContent = 'ESTIMATE from ' + D.n + ' simulated 6-month runs a market, every account on the same days, from tonight\'s balances. '
      + '2026 markets made money; the 2021-25 market made about $0 (most evals never pass), so treat the 2026 numbers as the good case. '
      + 'Every number assumes the PC trades every weekday. Rebuilt by ' + (D.built_by || 'tools/money/money_plan.py') + '. Not tax advice.';
    $('status').textContent = 'Plan made ' + day(D.date) + ' from tonight\'s balances: ' + (D.now || []).filter((r) => r.balance != null).map((r) => r.name + ' ' + usd(r.balance)).join(', ') + '.';
    Object.assign(hook, { ok: true, mkt, five, hero: F.cash_m });
  }

  Promise.all([
    fetch('plan.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('decisions.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)])
    .then(([d, dec]) => {
      if (!d || !d.rows || !d.rows[mkt] || !d.rows[mkt].fleet) { $('status').textContent = 'Plan data missing.'; hook.ok = false; return; }
      D = d; DEC = dec; draw();
    });
})();
