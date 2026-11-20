// TAXES page (classic script, nothing leaves the phone). The next 4 federal estimated-tax due dates from today's date and a
// set-aside calculator (payout -> tax pot -> yours) and the payout waterfall (2026-11-20). Drawn with textContent only. Education, not tax advice.
(function (root) {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DEFAULT_PCT = 30;   // the same default as Oikos and the Ledger

  const ymd = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const nthMonday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); const off = (8 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, m, 1 + off + 7 * (n - 1))); };
  // the holidays that can touch a due date: MLK Day (3rd Monday of Jan) and DC Emancipation Day (Apr 16, observed Fri / Mon)
  function holidays(y) {
    const em = new Date(Date.UTC(y, 3, 16)), wd = em.getUTCDay();
    if (wd === 6) em.setUTCDate(15); else if (wd === 0) em.setUTCDate(17);
    return new Set([ymd(nthMonday(y, 0, 3)), ymd(em)]);
  }
  function nextBusinessDay(d) {
    const x = new Date(d.getTime());
    for (let i = 0; i < 7; i++) {
      const wd = x.getUTCDay();
      if (wd !== 0 && wd !== 6 && !holidays(x.getUTCFullYear()).has(ymd(x))) return x;
      x.setUTCDate(x.getUTCDate() + 1);
    }
    return x;
  }
  // the four payments for tax year Y: Apr 15, Jun 15, Sep 15 of Y and Jan 15 of Y+1 (IRS Pub 505)
  function yearDates(y) {
    return [
      { year: y, period: 'Jan - Mar ' + y, raw: new Date(Date.UTC(y, 3, 15)) },
      { year: y, period: 'Apr - May ' + y, raw: new Date(Date.UTC(y, 5, 15)) },
      { year: y, period: 'Jun - Aug ' + y, raw: new Date(Date.UTC(y, 8, 15)) },
      { year: y, period: 'Sep - Dec ' + y, raw: new Date(Date.UTC(y + 1, 0, 15)) },
    ].map((r) => ({ year: r.year, period: r.period, due: nextBusinessDay(r.raw) }));
  }
  // the next n due dates on or after today (a 'YYYY-MM-DD' string or a Date; local calendar day)
  function dueDates(today, n) {
    let t;
    if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)) { const [a, b, c] = today.split('-').map(Number); t = Date.UTC(a, b - 1, c); }
    else { const d = today instanceof Date ? today : new Date(); t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
    const y0 = new Date(t).getUTCFullYear(), out = [];
    for (let y = y0 - 1; y <= y0 + 2 && out.length < (n || 4); y++) {
      for (const r of yearDates(y)) if (r.due.getTime() >= t && out.length < (n || 4)) out.push(r);
    }
    return out;
  }
  const fmtDate = (d) => MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  const iso = (d) => d.toISOString().slice(0, 10);
  const r2 = (v) => Math.round(v * 100) / 100;
  const usd = (v) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  const toNum = (v) => { const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : null; };
  // payout -> tax pot and yours; junk or a negative payout gives 0 / 0; the percent is kept to 0..60 like the Ledger
  function split(payout, pct) {
    const p = toNum(payout), q = toNum(pct);
    const P = p != null && p > 0 ? p : 0, Q = Math.min(60, Math.max(0, q == null ? DEFAULT_PCT : q));
    const pot = r2(P * Q / 100);
    return { payout: r2(P), pct: Q, pot, yours: r2(P - pot) };
  }

  // keep-the-most (2026-11-20, tools/money/keep_most.py -> research/lab/keep_most.json): the set-aside % in MARYLAND
  // (federal + SE + state + the highest county rate, 3.30%) by the year's profit after fees, rounded UP to the next 5,
  // safe default = no QBI. [up to $ a year, only trading, + a $50k day job]
  const POT_TABLE = [[5000, 15, 35], [15000, 20, 35], [30000, 25, 40], [60000, 30, 40], [Infinity, 35, 45]];
  function potPct(yearProfit, dayJob) {
    const y = toNum(yearProfit); const row = POT_TABLE.find((r) => (y == null ? 30000 : y) <= r[0]) || POT_TABLE[POT_TABLE.length - 1];
    return row[dayJob ? 2 : 1];
  }
  const LIVE_TARGET = 5000, RESERVE_TARGET = 320;
  // the day a payout lands: tax pot, eval reserve (10% until $320), retirement 10%, live fund (20% until $5,000), the rest yours
  function waterfall(received, pct, liveBanked, reserveBanked) {
    const s = split(received, pct), P = s.payout;
    const lb = Math.max(0, toNum(liveBanked) || 0), rb = Math.max(0, toNum(reserveBanked) || 0);
    const reserve = r2(Math.min(P * 0.10, Math.max(0, RESERVE_TARGET - rb)));
    const retire = r2(P * 0.10);
    const live = r2(Math.min(P * 0.20, Math.max(0, LIVE_TARGET - lb)));
    return { payout: P, pct: s.pct, pot: s.pot, reserve, retire, live, yours: r2(P - s.pot - reserve - retire - live) };
  }

  const api = { DEFAULT_PCT, dueDates, split, fmtDate, iso, usd, potPct, waterfall, LIVE_TARGET, RESERVE_TARGET };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TAXES = api;
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  function drawDates() {
    const list = $('dates'); if (!list) return;
    const ds = dueDates(new Date(), 4);
    while (list.firstChild) list.removeChild(list.firstChild);
    for (const d of ds) {
      const li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('b');
      s.textContent = d.period; b.textContent = fmtDate(d.due); b.dataset.iso = iso(d.due);
      li.appendChild(s); li.appendChild(b); list.appendChild(li);
    }
    if (ds.length && $('nextDue')) $('nextDue').textContent = fmtDate(ds[0].due);
  }
  function drawCalc() {
    const s = split($('pay').value, $('pct').value), m = split(2800, s.pct);
    $('pot').textContent = usd(s.pot); $('mine').textContent = usd(s.yours);
    $('month').textContent = 'At $2,800 a month: ' + usd(m.pot) + ' to the pot, ' + usd(m.yours) + ' yours, about ' + usd(r2(m.pot * 3)) + ' ready each quarter.';
    if (!$('wfYours')) return;
    const w = waterfall($('pay').value, s.pct, $('liveHave') ? $('liveHave').value : 0, $('resHave') ? $('resHave').value : 0);
    $('wfPot').textContent = usd(w.pot); $('wfRes').textContent = usd(w.reserve); $('wfRet').textContent = usd(w.retire);
    $('wfLive').textContent = usd(w.live); $('wfYours').textContent = usd(w.yours);
    const d = dueDates(new Date(), 1)[0];
    if (d && $('wfDue')) $('wfDue').textContent = 'Pay the ' + usd(w.pot) + ' tax pot to the IRS and Maryland by ' + fmtDate(d.due) + ' (1040-ES, ' + d.period + ').';
  }
  function suggest() {
    const y = $('year'), j = $('job'); if (!y || !$('pct')) return;
    $('pct').value = String(potPct(y.value, j && j.checked));
    drawCalc();
  }
  function start() {
    drawDates();
    for (const id of ['pay', 'pct', 'liveHave', 'resHave']) { const e = $(id); if (e) e.addEventListener('input', drawCalc); }
    for (const id of ['year', 'job']) { const e = $(id); if (e) e.addEventListener('change', suggest); }
    if ($('pay')) drawCalc();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
