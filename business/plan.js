// FLEET PLAN page (classic script, read only). Data: ./plan.json from tools/money/fleet_plan.py. Everything is drawn with
// textContent / createElementNS; nothing from the data is parsed as HTML.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const usd = (v) => (v == null || !Number.isFinite(+v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => (d ? MN[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : 'none');
  const MKTS = [['H2', '2026 Jul-Oct'], ['H1', '2026 Jan-Jun'], ['REF', '2021-25']];
  let D = null, mkt = 'H2', five = true;
  try { const s = localStorage.getItem('plan.mkt'); if (MKTS.some((m) => m[0] === s)) mkt = s; } catch (e) { /* default */ }

  function kv(dl, rows) {
    dl.textContent = '';
    for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  }
  function mlabel(m, i, n) {
    const nm = MN[+m.slice(5, 7) - 1];
    if (i === 0) return nm + ' ' + (+D.date.slice(8, 10)) + '-30';
    if (i === n - 1) return nm + ' 1-' + (+D.end.slice(8, 10));
    return nm;
  }
  function seg(box, items, cur, on) {
    box.textContent = '';
    for (const [k, t] of items) {
      const b = el('button', 'btn', t); b.type = 'button'; b.setAttribute('aria-pressed', String(k === cur));
      b.addEventListener('click', () => on(k)); box.appendChild(b);
    }
  }

  function fan(rows) {
    const svg = $('fan'), NS = 'http://www.w3.org/2000/svg', W = 340, H = 190, L = 8, R = 100, T = 12, B = 24;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const pts = [{ lo: 0, mid: 0, hi: 0 }].concat(rows.map((r) => ({ lo: r.cum_net_p10, mid: r.cum_net_p50, hi: r.cum_net_p90 })));
    const ymax = Math.max(1, ...pts.map((p) => p.hi)), ymin = Math.min(0, ...pts.map((p) => p.lo));
    const x = (i) => L + (W - L - R) * i / (pts.length - 1), y = (v) => T + (H - T - B) * (ymax - v) / (ymax - ymin);
    const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    mk('line', { class: 'zero', x1: L, x2: W - R, y1: y(0), y2: y(0) });
    const up = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.hi).toFixed(1)), dn = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.lo).toFixed(1)).reverse();
    mk('polygon', { class: 'band', points: up.concat(dn).join(' ') });
    mk('polyline', { class: 'mid', points: pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.mid).toFixed(1)).join(' ') });
    const lab = (tx, xx, yy, cls, anchor) => { const t = mk('text', { x: xx, y: yy, class: cls || '', 'text-anchor': anchor || 'start' }); t.textContent = tx; };
    const n = pts.length - 1, last = pts[n];
    const ys = [[last.hi, 'good'], [last.mid, 'middle'], [last.lo, 'bad']].map(([v, k]) => [v, k, y(v)]);
    for (let i = 1; i < ys.length; i++) if (ys[i][2] - ys[i - 1][2] < 13) ys[i][2] = ys[i - 1][2] + 13;   // keep end labels apart
    for (const [v, k, yy] of ys) lab(usd(v) + ' ' + k, x(n) + 4, Math.min(H - B, yy) + 4, k === 'middle' ? 'end' : '');
    rows.forEach((r, i) => { if (i % 2 === 1 || i === rows.length - 1) lab(MN[+r.month.slice(5, 7) - 1], x(i + 1), H - 6, '', 'middle'); });
    lab('Nov 17', x(0), H - 6, '', 'start');
  }

  function draw() {
    const R = D.rows[mkt], F = R.fleet[five ? 'five' : 'four'], A = R.accounts, fill = R.fill5, rows = F.months;
    seg($('mkt'), MKTS, mkt, (k) => { mkt = k; try { localStorage.setItem('plan.mkt', k); } catch (e) { /* no storage */ } draw(); });
    seg($('cnt'), [['5', '5 accounts (+ Rapid #2)'], ['4', '4 accounts (1 Rapid)']], five ? '5' : '4', (k) => { five = k === '5'; draw(); });
    $('big').textContent = usd(F.total_net_mean);
    $('bigNote').textContent = 'Average cash you keep in 6 months (to ' + day(D.end) + '), after fees, MFFU splits and the 30% tax pot. Before the tax pot: ' + usd(F.total_cash_mean) + '.';
    kv($('sum'), [
      ['Bad 10 in 100 / middle / good 10 in 100', usd(F.total_net_p10) + ' / ' + usd(F.total_net_p50) + ' / ' + usd(F.total_net_p90)],
      ['First payout of any account (likely)', day(F.first_any_med)],
      ['Chance of a payout by Dec 31', F.p_pay_by_dec31 + '%'],
      ['Chance of NO payout at all by Jan 31', F.p_no_pay_by_jan31 + '%'],
      ['Chance you end 6 months down', F.p_net_negative_6m + '%'],
      ['Cash to keep for buys + re-buys (9 in 10 / 19 in 20)', usd(F.pocket_p90) + ' / ' + usd(F.pocket_p95)],
      ['All eval fees in 6 months (average)', usd(F.fees_mean)]]);
    fan(rows);
    $('fanNote').textContent = 'Gold line = the middle case; band = bad 10 in 100 to good 10 in 100. Every account trades the same signals, so a bad stretch hits all of them at once.';
    const tb = $('mon').tBodies[0]; tb.textContent = '';
    rows.forEach((r, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, mlabel(r.month, i, rows.length)));
      tr.appendChild(el('td', 'n', usd(r.cash_mean)));
      tr.appendChild(el('td', 'n', usd(r.net_mean)));
      const td = el('td', 'n', usd(r.cum_net_p50)); td.appendChild(el('div', 'note', usd(r.cum_net_p10) + ' to ' + usd(r.cum_net_p90))); tr.appendChild(td);
      tb.appendChild(tr);
    });
    const box = $('acc'); box.textContent = '';
    for (const k of ['A25', 'N25', 'R1', 'Z50', 'R2']) {
      const a = A[k]; if (!a || (k === 'R2' && !five)) continue;
      const s = el('section'); s.appendChild(el('h3', null, a.name));
      const dl = el('dl', 'kv');
      kv(dl, [['First payout (likely)', day(a.first_pay_med) + (a.first_pay_p25 ? ' (' + day(a.first_pay_p25) + ' to ' + day(a.first_pay_p75) + ')' : '')],
              ['Chance it pays by Jan 31', a.p_pay_by_jan31 + '%'], ['Funded by (likely)', day(a.funded_med)],
              ['6 months to you, after tax pot', usd(a.cash_net_6m)], ['Eval buys in 6 months', String(a.buys_6m)]]);
      s.appendChild(dl); box.appendChild(s);
    }
    const b = $('buy'); b.textContent = '';
    const r2 = A.R2 || {};
    const steps = [
      'Now: buy the new Builder 25K ($' + D.prices.builder25k + ') and the Rapid EOD 50K ($' + D.prices.rapid_eod50k + ' with CLUB) = ' + usd(D.prices.builder25k + D.prices.rapid_eod50k) + '.',
      'Any eval fails: buy the same one again at once (the bot keeps trading it). Keep ' + usd(F.pocket_p90) + ' ready in this market (' + usd(F.pocket_p95) + ' covers 19 in 20).',
      'When payouts in hand (after the tax pot) reach $' + D.prices.rapid_eod50k + ': buy Rapid EOD 50K #2 = your 5th funded slot. Likely ' + day(r2.buy_med) + ' (' + r2.p_bought + '% of runs get there in 6 months). You said one Rapid for now: your call.',
      'All 5 funded at once (1 Builder 50K, 2 Builder 25K, 2 Rapid EOD 50K): likely ' + day(fill.all5_med) + '; ' + fill.p_all5_6m + '% of runs get there in 6 months.',
      'A funded account is lost: a fresh eval of the same size starts the next day (counted above).'];
    for (const t of steps) b.appendChild(el('li', null, t));
    $('foot').textContent = 'ESTIMATE from ' + D.n + ' simulated 6-month runs a market, all accounts on the same days. 2026 markets made money; the 2021-25 market made about $0 (most evals never pass), so treat the 2026 numbers as the good case. A payout reaches your bank about 2-4 business days after the payout day. Not tax advice.';
    $('status').textContent = 'Plan made ' + day(D.date) + ', 2026 from Zlarior at $49,193 ($3,807 to go, $1,025 room).';
  }

  fetch('plan.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d || !d.rows || !d.rows[mkt]) { $('status').textContent = 'Plan data missing.'; return; }
    D = d; draw();
  }).catch(() => { $('status').textContent = 'Plan data missing.'; });
})();
