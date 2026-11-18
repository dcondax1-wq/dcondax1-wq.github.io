// OIKOS core (ES module, no DOM, no network): the household's money maths. Pure, so tests/test_oikos_page.py runs it in node and checks it
// against tools/money/oikos.py on the same ledger (the two must agree to the cent). Reads the shape the Ledger app exports (entries, settings) and finds leaks.
// Every number is an ESTIMATE from what was recorded. The tax line is a generic set-aside percentage, NOT tax advice. Nothing here moves money.

export const KINDS = { fee: -1, reset: -1, activation: -1, expense: -1, payout_in: 1, payout_req: 0, income: 1, deposit: 0, withdrawal: 0, tax: 0 };
export const LABELS = { fee: 'Eval fee', reset: 'Reset', activation: 'Activation fee', expense: 'Expense', payout_in: 'Payout received', payout_req: 'Payout requested', income: 'Other income', deposit: 'Deposit', withdrawal: 'Withdrawal', tax: 'Tax paid' };
export const EVERY = ['week', 'month', 'year'];
export const DEFAULTS = { tax: 0.30, emergency: 0.25, reinvest: 0.20, living: 2500, em_months: 3, em_saved: 0, cap: 6, proj_re: 0.5, months: 12, account_cost: 0 };
export const SCEN = [['conservative', 0.5], ['base', 1.0], ['optimistic', 1.5]];
export const DEFAULT_ACCOUNT_COST = 91.8;
export const NOTE_TAX = 'Not tax advice. A generic set-aside percentage; ask an accountant what applies to you.';
const NOT_ACCOUNTS = ['general', 'kalshi', ''];

// ------------------------------------------------------------------ small helpers
export const r2 = (x) => Math.floor(x * 100 + 0.5) / 100;
export const r4 = (x) => Math.floor(x * 10000 + 0.5) / 10000;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = v.replace(/[$,]/g, '').trim(); if (t === '') return null; const x = Number(t); return Number.isFinite(x) ? x : null; }
  return null;
};
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export const money = (v) => {
  const x = r2(v), body = Math.abs(x).toLocaleString('en-US', x === Math.trunc(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (x < 0 ? '-$' : '$') + body;
};
export const moneyS = (v) => (r2(v) > 0 ? '+' : '') + money(v);
export const pct = (x) => Math.floor(x * 100 + 0.5) + '%';

// ------------------------------------------------------------------ dates (ISO strings, pure arithmetic)
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const dn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 864e5);
export const addDays = (s, n) => new Date((dn(s) + n) * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => dn(b) - dn(a);
export const addMonths = (s, n) => {
  let [y, m, d] = s.split('-').map(Number);
  m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

// ------------------------------------------------------------------ the ledger in
export function cleanEntry(e, today) {
  if (!isObj(e) || !Object.prototype.hasOwnProperty.call(KINDS, e.kind)) return null;
  const amount = num(e.amount);
  if (amount == null || amount <= 0 || amount > 1e9) return null;
  let date = isDate(e.date) ? e.date : null;
  if (date == null) { const off = num(e.off); if (off != null && Math.abs(off) < 20000) date = addDays(today, Math.trunc(off)); }
  if (date == null) return null;
  const out = { id: text(e.id, 40), kind: e.kind, amount: r2(amount), date, cat: text(e.cat, 40) || e.kind, acct: text(e.acct, 40) || 'general', note: text(e.note, 160) };
  if (isObj(e.rec) && EVERY.indexOf(e.rec.every) >= 0) out.rec = { every: e.rec.every, until: isDate(e.rec.until) ? e.rec.until : null };
  return out;
}
/** Any of: a Ledger export {entries, settings, accounts?}, a bare list of entries, a JSON string. Never throws. */
export function normalize(raw, today) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = null; } }
  if (Array.isArray(o)) o = { entries: o };
  const out = { entries: [], settings: { taxPct: 30 }, accounts: {}, skipped: 0, demo: false, note: '', opts: {} };
  if (!isObj(o) || !Array.isArray(o.entries)) return out;
  const seen = new Set();
  o.entries.slice(0, 5000).forEach((e, i) => {
    const c = cleanEntry(e, today);
    if (!c) { out.skipped++; return; }
    if (!c.id || seen.has(c.id)) c.id = 'n' + i;
    seen.add(c.id); out.entries.push(c);
  });
  if (isObj(o.settings) && num(o.settings.taxPct) != null) out.settings.taxPct = clamp(num(o.settings.taxPct), 0, 60);
  if (Array.isArray(o.accounts)) for (const a of o.accounts.slice(0, 100)) if (isObj(a) && text(a.id, 40)) out.accounts[text(a.id, 40)] = text(a.name, 60) || text(a.id, 40);
  if (isObj(o.opts)) for (const k of Object.keys(o.opts)) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && num(o.opts[k]) != null) out.opts[k] = o.opts[k];
  out.demo = o.demo === true; out.note = text(o.note, 200);
  return out;
}
export function occurrences(e, today) {
  if (!e.rec) return e.date <= today ? [e.date] : [];
  const stop = e.rec.until && e.rec.until < today ? e.rec.until : today, out = [];
  for (let i = 0; i < 1200; i++) {
    const d = e.rec.every === 'week' ? addDays(e.date, 7 * i) : e.rec.every === 'month' ? addMonths(e.date, i) : addMonths(e.date, 12 * i);
    if (d > stop) break;
    out.push(d);
  }
  return out;
}
export const expand = (entries, today) => entries.flatMap((e) => occurrences(e, today).map((d) => ({ ...e, date: d })));
const monthlyOf = (e) => e.amount * (e.rec.every === 'week' ? 52 / 12 : e.rec.every === 'month' ? 1 : 1 / 12);

export function mergeOpts(o) {
  const d = { ...DEFAULTS };
  if (isObj(o)) for (const k of Object.keys(d)) { const v = num(o[k]); if (v != null) d[k] = v; }
  d.tax = clamp(d.tax, 0, 0.6); d.emergency = clamp(d.emergency, 0, 1); d.reinvest = clamp(d.reinvest, 0, 1);
  if (d.tax + d.emergency + d.reinvest > 1) { d.reinvest = Math.max(0, 1 - d.tax - d.emergency); d.emergency = Math.max(0, 1 - d.tax - d.reinvest); }
  d.living = clamp(d.living, 0, 1e6); d.em_months = clamp(d.em_months, 0, 36); d.em_saved = clamp(d.em_saved, 0, 1e9);
  d.cap = Math.trunc(clamp(Math.floor(d.cap), 1, 20)); d.proj_re = clamp(d.proj_re, 0, 1); d.months = Math.trunc(clamp(Math.floor(d.months), 1, 36)); d.account_cost = clamp(d.account_cost, 0, 100000);
  return d;
}

// ------------------------------------------------------------------ the leaks
export function analyze(ledger, today, opts) {
  const o = mergeOpts({ tax: (ledger.settings.taxPct != null ? ledger.settings.taxPct : 30) / 100, ...(ledger.opts || {}), ...(opts || {}) });
  const ex = expand(ledger.entries, today), d90 = addDays(today, -90), d365 = addDays(today, -365), mkey = today.slice(0, 7);
  const tot = (kinds, since) => r2(ex.filter((e) => kinds.indexOf(e.kind) >= 0 && (since == null || e.date > since)).reduce((s, e) => s + e.amount, 0));
  const COST = ['fee', 'reset', 'activation', 'expense'], INC = ['payout_in', 'income'];
  const payouts = tot(['payout_in']), otherInc = tot(['income']), fees = tot(['fee']), resets = tot(['reset']), activation = tot(['activation']), expenses = tot(['expense']);
  const income = r2(payouts + otherInc), costs = r2(fees + resets + activation + expenses), net = r2(income - costs);
  const inc90 = tot(INC, d90), cost90 = tot(COST, d90), net90 = r2(inc90 - cost90);
  const monthlyNet = r2(net90 / 3), monthlyIncome = r2(inc90 / 3), net365 = r2(tot(INC, d365) - tot(COST, d365));
  const mtdNet = r2(ex.filter((e) => KINDS[e.kind] !== 0 && e.date.slice(0, 7) === mkey).reduce((s, e) => s + (KINDS[e.kind] > 0 ? 1 : -1) * e.amount, 0));

  const ids = [];
  for (const e of ex) if (NOT_ACCOUNTS.indexOf(e.acct) < 0 && ['fee', 'reset', 'activation', 'payout_in', 'payout_req'].indexOf(e.kind) >= 0 && ids.indexOf(e.acct) < 0) ids.push(e.acct);
  const accounts = ids.map((a) => {
    const mine = ex.filter((e) => e.acct === a), sum = (f) => r2(mine.filter(f).reduce((s, e) => s + e.amount, 0));
    const cost = sum((e) => ['fee', 'reset', 'activation'].indexOf(e.kind) >= 0), got = sum((e) => e.kind === 'payout_in');
    const rs = mine.filter((e) => e.kind === 'reset'), cd = mine.filter((e) => ['fee', 'reset', 'activation'].indexOf(e.kind) >= 0).map((e) => e.date);
    const first = (cd.length ? cd : mine.map((e) => e.date)).reduce((m, d) => (d < m ? d : m)), age = daysBetween(first, today), resetCost = sum((e) => e.kind === 'reset');
    let after = 0;
    if (rs.length) { const fr = rs.map((e) => e.date).reduce((m, d) => (d < m ? d : m)); after = sum((e) => e.kind === 'payout_in' && e.date >= fr); }
    const status = cost > 0 && got >= cost ? 'paid' : cost > 0 && got === 0 && age >= 30 ? 'never' : cost > 0 && got < cost && age >= 60 ? 'behind' : 'young';
    return { id: a, name: ledger.accounts[a] || a, cost, received: got, net: r2(got - cost), first, age, resets: rs.length, reset_cost: resetCost, after_reset: after, status };
  });

  const subs = [];
  for (const e of ledger.entries) {
    if (e.rec && KINDS[e.kind] < 0 && !(e.rec.until && e.rec.until < today) && e.date <= today) {
      const m = r2(monthlyOf(e));
      subs.push({ name: e.note || e.cat, cat: e.cat, monthly: m, annual: r2(m * 12), share: r2(m / Math.max(1, monthlyIncome)) });
    }
  }
  const burn = r2(subs.reduce((s, x) => s + x.monthly, 0));

  const leaks = [], feeAll = r2(fees + resets + activation), ratio = payouts > 0 ? feeAll / payouts : null;
  if (feeAll > 0) {
    let score, risk, det;
    if (ratio == null) { score = 90; risk = 'high'; det = `You paid ${money(feeAll)} in fees and resets and nothing has been paid out yet.`; }
    else {
      score = Math.trunc(clamp(Math.floor(ratio * 80 + 0.5), 0, 100)); risk = ratio < 0.25 ? 'low' : ratio < 0.6 ? 'med' : 'high';
      det = `Fees and resets cost ${money(feeAll)} against ${money(payouts)} of payouts received: $${r2(ratio).toFixed(2)} of every $1 paid out went on fees (estimate).`;
    }
    leaks.push({ id: 'fees', title: 'Fees against payouts', detail: det, usd: feeAll, score, risk });
  }
  for (const a of accounts) {
    if (a.resets > 0) {
      const gap = r2(a.reset_cost - a.after_reset);
      if (gap > 0) leaks.push({ id: 'reset:' + a.id, title: 'Resets that did not pay back: ' + a.name, usd: gap,
        detail: `${a.resets} reset${a.resets === 1 ? '' : 's'} cost ${money(a.reset_cost)}; this account paid out ${money(a.after_reset)} since the first one, so ${money(gap)} is still unrecovered.`,
        score: Math.trunc(clamp(Math.floor(40 + 15 * a.resets + 30 * (gap / a.reset_cost) + 0.5), 0, 100)), risk: a.resets >= 2 ? 'high' : 'med' });
    }
    if (a.status === 'never' || a.status === 'behind') {
      const miss = r2(a.cost - a.received);
      let det, score, risk;
      if (a.status === 'never') { det = `${money(a.cost)} of cost and no payout in ${a.age} days: it has never covered its cost.`; score = 70 + Math.min(30, Math.floor(a.age / 6)); risk = 'high'; }
      else { det = `${money(a.cost)} of cost, ${money(a.received)} paid back in ${a.age} days: ${money(miss)} still to recover.`; score = 45; risk = 'med'; }
      leaks.push({ id: 'never:' + a.id, title: (a.status === 'never' ? 'Never covered its cost: ' : 'Still behind: ') + a.name, detail: det, usd: miss, score: Math.trunc(clamp(score, 0, 100)), risk });
    }
  }
  for (const s of subs) {
    const sc = Math.trunc(clamp(Math.floor(s.share * 400 + 0.5), 0, 100)), risk = s.share < 0.03 ? 'low' : s.share < 0.10 ? 'med' : 'high';
    leaks.push({ id: 'sub:' + s.name, title: 'Subscription: ' + s.name, detail: `${money(s.monthly)} a month (${money(s.annual)} a year) is ${Math.floor(s.share * 100 + 0.5)}% of the ${money(monthlyIncome)} a month coming in.`, usd: s.annual, score: sc, risk });
  }
  leaks.sort((x, y) => (y.score - x.score) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const flagged = r2(subs.filter((s) => s.share >= 0.03).reduce((t, s) => t + s.monthly, 0));
  const lossy90 = r2(ex.filter((e) => ['fee', 'reset', 'activation'].indexOf(e.kind) >= 0 && e.date > d90 && accounts.some((a) => a.id === e.acct && (a.status === 'never' || a.status === 'behind'))).reduce((t, e) => t + e.amount, 0));
  const leakMonth = r2(flagged + lossy90 / 3);

  const base = Math.max(0, net365), setAside = r2(base * o.tax), paid = r2(ex.filter((e) => e.kind === 'tax').reduce((t, e) => t + e.amount, 0));
  const tax = { pct: o.tax, base: r2(base), set_aside: setAside, paid, still: r2(Math.max(0, setAside - paid)), month: r2(Math.max(0, mtdNet) * o.tax), note: NOTE_TAX };

  const M = Math.max(0, monthlyNet), payPct = Math.max(0, 1 - o.tax - o.emergency - o.reinvest);
  const alloc = { tax: r2(M * o.tax), emergency: r2(M * o.emergency), reinvest: r2(M * o.reinvest), pay: r2(M * payPct) };
  const prog = M > 0 ? clamp(mtdNet / M, 0, 1) : 0;
  const feeList = ex.filter((e) => e.kind === 'fee').map((e) => e.amount), acctCost = o.account_cost > 0 ? r2(o.account_cost) : feeList.length ? r2(feeList.reduce((s, x) => s + x, 0) / feeList.length) : DEFAULT_ACCOUNT_COST;
  const rawB = [['tax', 'Tax set-aside', tax.set_aside, paid], ['emergency', 'Emergency fund', r2(o.em_months * o.living), o.em_saved],
    ['pay', 'Pay yourself', alloc.pay, r2(alloc.pay * prog)], ['reinvest', 'Next account', acctCost, r2(Math.max(0, net90) * o.reinvest)]];
  const buckets = rawB.map(([id, label, target, saved]) => { const got = Math.min(saved, target); return { id, label, target: r2(target), saved: r2(got), fill: target > 0 ? r4(got / target) : null }; });
  const tt = buckets.reduce((s, b) => s + b.target, 0), fill = tt > 0 ? r4(buckets.reduce((s, b) => s + b.saved, 0) / tt) : 0;

  const recent = new Set(ex.filter((e) => e.kind === 'fee' && NOT_ACCOUNTS.indexOf(e.acct) < 0 && e.date > addDays(today, -120)).map((e) => e.acct));
  const n0 = Math.max(1, recent.size);
  const proj = { n0, account_cost: acctCost, monthly_profit: r2(M), per_account: r2(M / n0), cap: o.cap, months: o.months, scenarios: [] };
  for (const [name, mult] of SCEN) {
    const y = M / n0 * mult;
    let keptW = 0, nR = n0, keptR = 0, carry = 0;
    const sw = [], sr = [], nr = [];
    for (let i = 0; i < o.months; i++) {
      keptW += y * n0 * (1 - o.tax);
      const after = y * nR * (1 - o.tax), put = after * o.proj_re;
      keptR += after - put;
      let budget = carry + put;
      const room = o.cap - nR, buy = room > 0 ? Math.max(0, Math.trunc(Math.min(room, Math.floor(budget / acctCost + 1e-9)))) : 0;
      budget -= buy * acctCost;
      if (nR + buy >= o.cap) { keptR += budget; budget = 0; }
      carry = budget; nR += buy;
      sw.push(r2(keptW)); sr.push(r2(keptR + carry)); nr.push(Math.trunc(nR));
    }
    proj.scenarios.push({ id: name, mult, withdraw: sw, reinvest: sr, accounts: nr, end_withdraw: sw[sw.length - 1], end_reinvest: sr[sr.length - 1], end_accounts: nr[nr.length - 1],
      monthly_end_withdraw: r2(y * n0 * (1 - o.tax)), monthly_end_reinvest: r2(y * nr[nr.length - 1] * (1 - o.tax)) });
  }
  const totals = { income, payouts, fees, resets, activation, expenses, costs, net, net90, net365, mtd_net: mtdNet };
  return { today, opts: o, totals, monthly: { net: monthlyNet, income: monthlyIncome, burn }, accounts, subs, leaks, leak_month: leakMonth, tax, alloc, buckets, fill, projector: proj };
}

export function headline(a) {
  const n = a.leaks.filter((x) => x.risk === 'med' || x.risk === 'high').length;
  if (!a.leaks.length) return { text: 'No leaks found yet: add fees, payouts and subscriptions to your ledger and OIKOS will check them.', usd_month: 0 };
  return { text: `${n} leak${n === 1 ? '' : 's'} worth watching; about ${money(a.leak_month)} a month is going out without paying back (estimate).`, usd_month: a.leak_month };
}

/** the card Jarvis shows (contract in tests/agora_kit.py) */
export function jarvisCard(a, nowSec) {
  const h = headline(a), worst = a.leaks[0];
  return { v: 1, name: 'Oikos', status: { level: a.leaks.some((x) => x.risk === 'high') ? 'warn' : 'ok', label: a.leaks.length ? `${a.leaks.length} leaks found` : 'No leaks' },
    kpis: [{ label: 'Leak a month', value: money(a.leak_month) }, { label: 'Net a month', value: money(a.monthly.net) }, { label: 'Buckets full', value: pct(a.fill) }],
    lines: [h.text.slice(0, 118), worst ? (worst.title + ': ' + money(worst.usd)).slice(0, 118) : 'Add entries in the Ledger app.'], t: nowSec | 0, open: '#', theme: '#14110e', stale_after: 604800 };
}

/** a plain-words summary of a bucket for the page */
export function bucketWords(b) {
  if (b.target <= 0) return 'Nothing needed yet';
  return `${money(b.saved)} of ${money(b.target)} (${pct(b.fill)})`;
}

/** a file the owner picked or pasted: a Ledger export, an Oikos export ({ledger, opts}) or the feed (oikos.json with a ledger inside) -> a ledger-shaped object */
export function unwrap(raw) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { return null; } }
  if (Array.isArray(o)) return { entries: o };
  if (!isObj(o)) return null;
  if (isObj(o.ledger) && Array.isArray(o.ledger.entries)) return { ...o.ledger, opts: { ...(o.ledger.opts || {}), ...(isObj(o.opts) ? o.opts : {}) } };
  return Array.isArray(o.entries) ? o : null;
}
