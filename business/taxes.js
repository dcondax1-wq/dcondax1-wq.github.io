// TAXES page (classic script, nothing leaves the phone). The next 4 federal estimated-tax due dates from today's date and a
// set-aside calculator (payout -> tax pot -> yours). Drawn with textContent only. Education, not tax advice.
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

  const api = { DEFAULT_PCT, dueDates, split, fmtDate, iso, usd };
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
  }
  function start() {
    drawDates();
    for (const id of ['pay', 'pct']) { const e = $(id); if (e) e.addEventListener('input', drawCalc); }
    if ($('pay')) drawCalc();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
