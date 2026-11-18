// LEDGER core (ES module, no DOM, no network): the owner's real money record and every number the page shows. Pure, so the tests call it in node.
// What a Ledger number is: money that REALLY moved. Income = payouts RECEIVED + other income. Costs = eval fees, resets, activation, expenses. Net profit = income - costs +
// the Kalshi result (the bot's balance minus what you put in, or the bot's own total P&L when no deposits are recorded). A payout only REQUESTED is pending, not income.
// Simulated eval P&L is performance, not cash: it is shown on the account cards and never counted. Dates are ISO strings (YYYY-MM-DD, New York days); amounts are dollars.
// The state lives on the phone only (localStorage 'ledger.v1'); the page may add AUTO entries it can read from the site (home.json, the rules file) and the public Kalshi feed.

export const VERSION = 1;
export const MAX_ENTRIES = 5000;
export const KINDS = {
  fee: { label: 'Eval fee', dir: -1, cat: 'Eval fees' },
  reset: { label: 'Reset', dir: -1, cat: 'Resets' },
  activation: { label: 'Activation fee', dir: -1, cat: 'Activation' },
  expense: { label: 'Expense', dir: -1, cat: 'Other' },
  payout_in: { label: 'Payout received', dir: 1, cat: 'Payouts' },
  payout_req: { label: 'Payout requested', dir: 0, cat: 'Payouts', pending: true },
  income: { label: 'Other income', dir: 1, cat: 'Other income' },
  deposit: { label: 'Kalshi deposit', dir: 0, cat: 'Kalshi', kalshi: -1 },
  withdrawal: { label: 'Kalshi withdrawal', dir: 0, cat: 'Kalshi', kalshi: 1 },
  tax: { label: 'Tax paid', dir: 0, cat: 'Tax', tax: true },
};
export const KIND_ORDER = ['expense', 'fee', 'payout_in', 'payout_req', 'reset', 'activation', 'income', 'deposit', 'withdrawal', 'tax'];
export const EXPENSE_CATS = ['Data feeds', 'VPS / Azure', 'Subscriptions', 'Voice keys', 'Mini PC / hardware', 'Other'];
export const EVERY = ['week', 'month', 'year'];
export const DEFAULTS = { taxPct: 30 };  // 30% = the Business Taxes page rule (business/taxes.html)

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 200);
const r2 = (x) => Math.round(x * 100) / 100;
export const money = (v, d = 2) => (num(v) == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const moneyS = (v, d = 2) => (num(v) == null ? '-' : (v > 0 ? '+' : '') + money(v, d));

// ------------------------------------------------------------------ dates (ISO strings, pure arithmetic: no time zones inside)
const ETF = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
export const todayET = (ms = Date.now()) => (ETF ? ETF.format(new Date(ms)) : new Date(ms).toISOString().slice(0, 10));
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const dn = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 864e5);
const ofDn = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
export const addDays = (s, n) => ofDn(dn(s) + n);
export const daysBetween = (a, b) => dn(b) - dn(a);
export const ym = (s) => s.slice(0, 7);
export const addMonths = (s, n) => {                                 // the same day of the month, clamped (31 Jan + 1 month = 28 / 29 Feb)
  let [y, m, d] = s.split('-').map(Number);
  m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
export const addYears = (s, n) => addMonths(s, 12 * n);
export const monthsBack = (month, n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(ym(addMonths(month + '-01', -i))); return out; };
export const monthName = (m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m.slice(5, 7) - 1]} '${m.slice(2, 4)}`;

// ------------------------------------------------------------------ the state: entries + settings (kept on the phone), validated on the way in
let seq = 0;
export const newId = (nowMs) => `e${(nowMs || Date.now()).toString(36)}${(seq++ % 1296).toString(36)}`;
export function cleanEntry(e, nowMs) {
  if (!isObj(e) || !KINDS[e.kind]) return null;
  const amount = num(e.amount);
  if (amount == null || amount <= 0 || amount > 1e9) return null;
  const date = isDate(e.date) ? e.date : null;
  if (!date) return null;
  const out = { id: str(e.id, 40) || newId(nowMs), kind: e.kind, amount: r2(amount), date, cat: str(e.cat, 40) || KINDS[e.kind].cat, acct: str(e.acct, 40) || 'general', note: str(e.note, 160) };
  if (isObj(e.rec) && EVERY.indexOf(e.rec.every) >= 0) out.rec = { every: e.rec.every, until: isDate(e.rec.until) ? e.rec.until : null };
  return out;
}
export function emptyState() { return { v: VERSION, entries: [], settings: { ...DEFAULTS }, hidden: [] }; }
export function loadState(raw) {                                       // never throws; junk gives an empty ledger
  let o = null;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { o = null; }
  const s = emptyState();
  if (!isObj(o)) return s;
  const seen = new Set();
  for (const e of arr(o.entries).slice(0, MAX_ENTRIES)) { const c = cleanEntry(e); if (c && !seen.has(c.id)) { seen.add(c.id); s.entries.push(c); } }
  if (isObj(o.settings)) { const t = num(o.settings.taxPct); if (t != null) s.settings.taxPct = Math.min(60, Math.max(0, t)); }
  s.hidden = arr(o.hidden).map((x) => str(x, 80)).filter(Boolean).slice(0, 200);
  if (typeof o.lastExport === 'string' && o.lastExport.length <= 40 && Number.isFinite(Date.parse(o.lastExport))) s.lastExport = o.lastExport;     // when the owner last tapped Export JSON (Compass reads it)
  return s;
}
export const serialize = (s) => JSON.stringify({ v: VERSION, entries: s.entries, settings: s.settings, hidden: s.hidden, ...(s.lastExport ? { lastExport: s.lastExport } : {}) });
/** the state with the time of the export (ISO text) written into it */
export const markExported = (s, nowMs) => ({ ...s, lastExport: new Date(nowMs).toISOString() });
/** the JSON file the owner exports (and imports back): what he entered, never the site's auto entries */
export const exportJSON = (s, nowMs) => JSON.stringify({ v: VERSION, app: 'ledger', exported: new Date(nowMs || Date.now()).toISOString(), entries: s.entries, settings: s.settings, hidden: s.hidden }, null, 2);
/** import: { ok, state, added, skipped } | { ok: false, error }. mode 'merge' adds entries whose id is new; 'replace' takes the file's. */
export function importJSON(text, cur, mode) {
  let o = null;
  try { o = JSON.parse(text); } catch (_) { return { ok: false, error: 'That file is not JSON.' }; }
  if (!isObj(o) || !Array.isArray(o.entries)) return { ok: false, error: 'That is not a Ledger export (no entries).' };
  const incoming = loadState({ entries: o.entries, settings: o.settings, hidden: o.hidden });
  const skipped = o.entries.length - incoming.entries.length;
  if (mode === 'replace') return { ok: true, state: incoming, added: incoming.entries.length, skipped };
  const have = new Set(cur.entries.map((e) => e.id)), next = { ...cur, entries: cur.entries.slice(), hidden: cur.hidden.slice() };
  let added = 0;
  for (const e of incoming.entries) if (!have.has(e.id) && next.entries.length < MAX_ENTRIES) { next.entries.push(e); added++; }
  return { ok: true, state: next, added, skipped: skipped + (incoming.entries.length - added) };
}
// pure edits: each returns the new state (the page keeps the old one for Undo)
export const addEntry = (s, e, nowMs) => { const c = cleanEntry({ ...e, id: e.id || newId(nowMs) }, nowMs); return c && s.entries.length < MAX_ENTRIES ? { ...s, entries: s.entries.concat([c]) } : null; };
export const updateEntry = (s, id, patch) => { const i = s.entries.findIndex((x) => x.id === id); if (i < 0) return null; const c = cleanEntry({ ...s.entries[i], ...patch, id }); if (!c) return null; const entries = s.entries.slice(); entries[i] = c; return { ...s, entries }; };
export const removeEntry = (s, id) => (s.entries.some((x) => x.id === id) ? { ...s, entries: s.entries.filter((x) => x.id !== id) } : null);
export const hideAuto = (s, key) => (s.hidden.indexOf(key) >= 0 ? s : { ...s, hidden: s.hidden.concat([key]) });
/** "Keep" an auto entry: it becomes a real one (and the auto copy is suppressed because a manual entry of the same kind and account now exists) */
export const keepAuto = (s, a, nowMs) => addEntry(s, { kind: a.kind, amount: a.amount, date: a.date, cat: a.cat, acct: a.acct, note: a.note }, nowMs);

// ------------------------------------------------------------------ recurring items: the dated copies up to today
export function occurrences(e, today) {
  const out = [];
  if (!e.rec) return e.date <= today ? [e.date] : [];
  const stop = e.rec.until && e.rec.until < today ? e.rec.until : today;
  for (let i = 0; i < 1200; i++) {
    const d = e.rec.every === 'week' ? addDays(e.date, 7 * i) : e.rec.every === 'month' ? addMonths(e.date, i) : addYears(e.date, i);
    if (d > stop) break;
    out.push(d);
  }
  return out;
}
export function upcoming(entries, today, days) {                       // the next dated copy of each recurring item inside `days`
  const out = [], end = addDays(today, days);
  for (const e of entries) {
    if (!e.rec) continue;
    for (let i = 0; i < 1200; i++) {
      const d = e.rec.every === 'week' ? addDays(e.date, 7 * i) : e.rec.every === 'month' ? addMonths(e.date, i) : addYears(e.date, i);
      if (d > end || (e.rec.until && d > e.rec.until)) break;
      if (d > today) { out.push({ ...e, date: d, rid: e.id + '@' + d }); break; }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const expand = (entries, today) => entries.flatMap((e) => occurrences(e, today).map((d) => ({ ...e, date: d, rid: e.rec ? e.id + '@' + d : e.id, recurring: !!e.rec })));
export const monthlyBurn = (entries) => r2(entries.filter((e) => e.rec && KINDS[e.kind].dir < 0).reduce((s, e) => s + e.amount * (e.rec.every === 'week' ? 52 / 12 : e.rec.every === 'month' ? 1 : 1 / 12), 0));

// ------------------------------------------------------------------ what the site already knows: AUTO entries (kind, account, amount, date) with a stable key
// ctx = { home: home.json | null, rules: rules.json | null }. Fees come from the OWNER's real prices in rules.json (home.json's price may be a list price); an account the
// rules file does not know uses home.json's own price. A key is suppressed when the owner hid it, or entered a fee for the same account himself.
export function autoEntries(ctx, today) {
  const rules = isObj(ctx && ctx.rules) ? ctx.rules : null, home = isObj(ctx && ctx.home) ? ctx.home : null, out = [];
  const accts = home && isObj(home.goals) ? arr(home.goals.accounts) : home ? arr(home.accounts) : [];
  const seen = new Set();
  for (const a of accts.filter(isObj)) {
    const id = str(a.id, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const known = rules && isObj(rules.accounts) ? rules.accounts[id] : null;
    const price = known ? num(known.price) : num(a.price);
    if (price == null || price <= 0) continue;
    const start = isObj(a.eval) && isDate(a.eval.start) ? a.eval.start : null;
    const date = known && isDate(known.paid) ? known.paid : start || today;
    out.push({ key: `auto:fee:${id}`, kind: 'fee', amount: r2(price), date: date > today ? today : date, cat: 'Eval fees', acct: id, note: `${known ? known.name : str(a.name, 60) || id} (the site's ${known ? 'price list' : 'accounts file'}; confirm the date)`, auto: true });
  }
  return out;
}
export function merge(state, auto, today) {
  const have = new Set(state.entries.filter((e) => e.kind === 'fee' || e.kind === 'reset' || e.kind === 'activation').map((e) => e.kind + ':' + e.acct));
  const shown = [], suppressed = [];
  for (const a of auto) (state.hidden.indexOf(a.key) >= 0 || have.has(a.kind + ':' + a.acct) ? suppressed : shown).push(a);
  return { list: expand(state.entries, today).concat(shown.map((a) => ({ ...a, rid: a.key, id: a.key }))), auto: shown, suppressed };
}

// ------------------------------------------------------------------ Kalshi: the result of the real-money bot
/** feed = kalshi.json | null; list = dated entries. deposits recorded: result = balance + withdrawals - deposits; else the bot's own total P&L; else unknown. */
export function kalshiResult(list, feed) {
  const dep = r2(list.filter((e) => e.kind === 'deposit').reduce((s, e) => s + e.amount, 0)), wd = r2(list.filter((e) => e.kind === 'withdrawal').reduce((s, e) => s + e.amount, 0));
  const bal = isObj(feed) ? num(feed.balance) : null, tot = isObj(feed) ? num(feed.total_pnl) : null;
  const days = isObj(feed) ? arr(feed.days).filter((d) => Array.isArray(d) && isDate(d[0]) && num(d[1]) != null).map((d) => [d[0], num(d[1])]) : [];
  if (bal != null && dep > 0) return { result: r2(bal + wd - dep), basis: 'balance', deposits: dep, withdrawals: wd, balance: bal, total: tot, days };
  if (tot != null) return { result: r2(tot), basis: 'bot', deposits: dep, withdrawals: wd, balance: bal, total: tot, days };
  return { result: null, basis: 'none', deposits: dep, withdrawals: wd, balance: bal, total: tot, days };
}

// ------------------------------------------------------------------ the numbers
const dirOf = (e) => KINDS[e.kind].dir;
/** payout requests still waiting: none of the payouts received for that account since the request matches it (the full amount, or the 80% split) */
export function pendingRequests(list) {
  const got = list.filter((e) => e.kind === 'payout_in');
  return list.filter((e) => e.kind === 'payout_req').filter((r) => !got.some((g) => g.acct === r.acct && g.date >= r.date && (Math.abs(g.amount - r.amount) < 0.01 || Math.abs(g.amount - r.amount * 0.8) < 0.015 * r.amount + 0.01)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function sums(list) {
  const s = { income: 0, costs: 0, pending: 0, tax: 0, byCat: {}, byKind: {} };
  for (const e of list) {
    const d = dirOf(e), k = KINDS[e.kind];
    if (d > 0) s.income += e.amount; else if (d < 0) s.costs += e.amount;
    if (k.tax) s.tax += e.amount;
    s.byKind[e.kind] = (s.byKind[e.kind] || 0) + e.amount;
    if (d !== 0) s.byCat[e.cat] = (s.byCat[e.cat] || 0) + d * e.amount;
  }
  s.pending = r2(pendingRequests(list).reduce((a, e) => a + e.amount, 0));
  s.income = r2(s.income); s.costs = r2(s.costs); s.tax = r2(s.tax);
  return s;
}
/** every Kalshi P&L day of the feed inside [from, to] (the bot's own daily results) */
const kalshiIn = (k, from, to) => r2(k.days.filter((d) => d[0] >= from && d[0] <= to).reduce((s, d) => s + d[1], 0));
export function totals(list, feed, today) {
  const k = kalshiResult(list, feed), s = sums(list), m = ym(today), ml = list.filter((e) => ym(e.date) === m), ms = sums(ml);
  const kMonth = k.basis === 'none' ? 0 : kalshiIn(k, m + '-01', today);
  const kAll = k.result == null ? 0 : k.result;
  return {
    income: s.income, costs: s.costs, pending: s.pending, kalshi: k, kalshiAll: kAll, net: r2(s.income - s.costs + kAll),
    month: { ym: m, income: ms.income, costs: ms.costs, kalshi: kMonth, net: r2(ms.income - ms.costs + kMonth) }, byCat: s.byCat, byKind: s.byKind, taxPaid: s.tax,
  };
}
export function byMonth(list, feed, today, n) {
  const k = kalshiResult(list, feed), months = monthsBack(ym(today), n), rows = [];
  let cum = 0;
  const before = list.filter((e) => ym(e.date) < months[0]), sb = sums(before);
  cum = r2(sb.income - sb.costs + (k.basis === 'none' ? 0 : kalshiIn(k, '0000-01-01', months[0] + '-00')));
  for (const m of months) {
    const s = sums(list.filter((e) => ym(e.date) === m)), kk = k.basis === 'none' ? 0 : kalshiIn(k, m + '-01', m + '-31');
    const net = r2(s.income - s.costs + kk);
    cum = r2(cum + net);
    rows.push({ ym: m, income: s.income, costs: s.costs, kalshi: kk, net, cum });
  }
  return rows;
}
/** net cash per day (for the heat map): entries + the bot's Kalshi days */
export function daily(list, feed, from, to) {
  const k = kalshiResult(list, feed), map = {};
  for (const e of list) if (e.date >= from && e.date <= to && dirOf(e) !== 0) map[e.date] = r2((map[e.date] || 0) + dirOf(e) * e.amount);
  for (const d of k.days) if (d[0] >= from && d[0] <= to) map[d[0]] = r2((map[d[0]] || 0) + d[1]);
  return map;
}
/** per-account cards. known = [{ id, name, stage, price, profit (sim), status }] from home.json + rules; Kalshi and General are always there */
export function accounts(list, feed, known) {
  const ids = [], by = {};
  const slot = (id, name) => { if (!by[id]) { by[id] = { id, name: name || id, stage: '', fees: 0, resets: 0, activation: 0, expenses: 0, payouts: 0, pending: 0, income: 0, sim: null, status: '', entries: 0 }; ids.push(id); } return by[id]; };
  for (const a of arr(known)) { const c = slot(a.id, a.name); c.stage = a.stage || ''; c.sim = num(a.profit); c.status = a.status || ''; }
  for (const e of list) {
    const c = slot(e.acct || 'general');
    c.entries++;
    if (e.kind === 'fee') c.fees += e.amount; else if (e.kind === 'reset') c.resets += e.amount; else if (e.kind === 'activation') c.activation += e.amount; else if (e.kind === 'expense') c.expenses += e.amount;
    else if (e.kind === 'payout_in') c.payouts += e.amount; else if (e.kind === 'income') c.income += e.amount;
  }
  for (const r of pendingRequests(list)) slot(r.acct || 'general').pending += r.amount;
  const k = kalshiResult(list, feed);
  if (k.basis !== 'none') slot('kalshi');                                  // the bot's card is there as soon as its feed is
  return ids.map((id) => {
    const c = by[id];
    c.cost = r2(c.fees + c.resets + c.activation + c.expenses);
    c.in = r2(c.payouts + c.income);
    c.net = r2(c.in - c.cost + (id === 'kalshi' && k.result != null ? k.result : 0));
    c.togo = c.net < 0 ? r2(-c.net) : 0;
    c.payback = c.cost === 0 && id !== 'kalshi' ? 'no cost yet' : c.net >= 0 ? 'paid back' : c.in > 0 ? 'partly paid back' : 'not yet';
    for (const f of ['fees', 'resets', 'activation', 'expenses', 'payouts', 'pending', 'income']) c[f] = r2(c[f]);
    if (id === 'kalshi') c.kalshi = k;
    return c;
  });
}
/** how long until everything is paid back, at the pace of the recent months */
export function breakEven(list, feed, today) {
  const t = totals(list, feed, today), rows = byMonth(list, feed, today, 12);
  const first = list.map((e) => e.date).concat(kalshiResult(list, feed).days.map((d) => d[0])).sort()[0] || today;
  const full = rows.filter((r) => r.ym >= ym(first) && r.ym < ym(today));                  // complete months with data (the running month is partial)
  const recent = full.slice(-3), rate = recent.length >= 2 ? r2(recent.reduce((s, r) => s + r.net, 0) / recent.length) : null;      // a pace needs at least two full months
  const out = { net: t.net, costs: t.costs, income: t.income, rate, monthsOfData: full.length, early: full.length < 3, months: null, state: 'unknown' };
  if (t.costs === 0 && t.kalshiAll >= 0) { out.state = 'nocost'; out.months = 0; return out; }
  if (t.net >= 0) { out.state = 'paid'; out.months = 0; out.surplus = t.net; return out; }
  out.deficit = r2(-t.net);
  if (rate != null && rate > 0) { out.state = 'on_track'; out.months = Math.ceil(out.deficit / rate); } else out.state = rate == null ? 'unknown' : 'stalled';
  return out;
}
export function tax(list, feed, pct, today) {
  const pct1 = Math.min(60, Math.max(0, pct)), y = today.slice(0, 4), yl = list.filter((e) => e.date.slice(0, 4) === y), s = sums(yl), k = kalshiResult(list, feed);
  const kYear = k.basis === 'none' ? 0 : kalshiIn(k, y + '-01-01', today);
  const base = r2(s.income - s.costs + kYear), p = pct1 / 100, set = base > 0 ? r2(base * p) : 0, paid = s.tax, left = r2(Math.max(0, set - paid));
  const q = [1, 2, 3, 4].map((n) => { const a = `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`, b = addDays(addMonths(a, 3), -1); const ql = yl.filter((e) => e.date >= a && e.date <= b), qs = sums(ql); return { q: n, net: r2(qs.income - qs.costs + (k.basis === 'none' ? 0 : kalshiIn(k, a, b))) }; });
  return { year: y, income: s.income, costs: s.costs, kalshi: kYear, base, pct: pct1, setAside: set, paid, left, quarters: q, losing: base < 0 };
}

// ------------------------------------------------------------------ the payout calendar: what you asked for, what came in, MFFU's rules, and the split sum
export function payouts(list, rules, today) {
  const req = list.filter((e) => e.kind === 'payout_req').sort((a, b) => a.date.localeCompare(b.date)), got = list.filter((e) => e.kind === 'payout_in').sort((a, b) => a.date.localeCompare(b.date));
  const pending = pendingRequests(list).map((r) => ({ ...r, waiting: Math.max(0, daysBetween(r.date, today)) }));
  const plans = rules && isObj(rules.plans) ? Object.keys(rules.plans).map((id) => ({ id, name: rules.plans[id].name, ...rules.plans[id].payout })) : [];
  return { requested: req, received: got, pending, plans, countBy: got.reduce((m, g) => { m[g.acct] = (m[g.acct] || 0) + 1; return m; }, {}) };
}
/** what you receive from a payout request under a plan's rules: clamp to min / max, the split, the rule it broke (if any) */
export function payoutMath(amount, plan) {
  const a = num(amount);
  if (a == null || a <= 0 || !plan) return null;
  const min = num(plan.min), max = num(plan.max), split = num(plan.split) != null ? plan.split : 0.8;
  const warn = min != null && a < min ? `Below the minimum request (${money(min, 0)}).` : max != null && a > max ? `Above the maximum request (${money(max, 0)}).` : '';
  const use = max != null ? Math.min(a, max) : a;
  return { request: a, counted: use, receive: r2(use * split), kept: r2(use * (1 - split)), split, warn };
}

// ------------------------------------------------------------------ CSV for an accountant (one row per dated entry; auto entries are marked; amounts signed)
const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function toCSV(list) {
  const rows = [['date', 'type', 'category', 'account', 'amount_usd', 'direction', 'source', 'recurring', 'note']];
  for (const e of list.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.rid || a.id).localeCompare(String(b.rid || b.id)))) {
    const d = dirOf(e), k = KINDS[e.kind];
    rows.push([e.date, k.label, e.cat, e.acct, d * e.amount === 0 ? e.amount : d * e.amount, d > 0 ? 'in' : d < 0 ? 'out' : k.pending ? 'pending' : k.tax ? 'tax' : 'transfer', e.auto ? 'site (auto)' : 'you', e.rec ? e.rec.every : '', e.note]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// ------------------------------------------------------------------ expected vs actual cash against the Money plan (../plutus/roadmap.json, read only)
/** a roadmap file that has what this needs: 12 monthly rows with dates and running totals, for the conservative (H2) and the Jan-Jun (H1) version */
export const roadmapOk = (rm) => !!(rm && isObj(rm.versions) && ['H2', 'H1'].every((k) => rm.versions[k] && Array.isArray(rm.versions[k].months) && rm.versions[k].months.length > 0
  && rm.versions[k].months.every((m) => isDate(m.from) && isDate(m.to) && num(m.cum) != null)) && isDate(rm.first_session));
/** the plan's running total (average, and the 1-in-10 worst and best) on a given day: a month's total is spread evenly over its days */
export function planAt(months, today) {
  const z = { cum: 0, lo: 0, hi: 0 };
  if (!months.length || today < months[0].from) return z;
  const last = months[months.length - 1];
  if (today > last.to) return { cum: last.cum, lo: last.lo, hi: last.hi };
  let i = months.findIndex((m) => today >= m.from && today <= m.to);
  if (i < 0) i = months.findIndex((m) => m.from > today) - 1;                          // a weekend gap between two months: the earlier month is still running
  const m = months[i], prev = i > 0 ? months[i - 1] : z, span = Math.max(1, daysBetween(m.from, m.to) + 1), f = Math.min(1, (daysBetween(m.from, today) + 1) / span);
  const at = (k) => r2((prev[k] || 0) + ((m[k] == null ? m.cum : m[k]) - (prev[k] || 0)) * f);
  return { cum: at('cum'), lo: at('lo'), hi: at('hi') };
}
/** what the plan expected so far against the cash that really moved since the plan started: payouts received minus eval fees, resets and activation (expenses are not in the plan) */
export function roadmapVsActual(list, rm, today) {
  if (!roadmapOk(rm)) return null;
  const start = rm.first_session, v2 = rm.versions.H2.months, v1 = rm.versions.H1.months;
  const state = today < start ? 'before' : today > v2[v2.length - 1].to ? 'after' : 'running';
  const inWin = list.filter((e) => e.date >= start && e.date <= today);
  const got = r2(inWin.filter((e) => e.kind === 'payout_in').reduce((s, e) => s + e.amount, 0));
  const spent = r2(inWin.filter((e) => e.kind === 'fee' || e.kind === 'reset' || e.kind === 'activation').reduce((s, e) => s + e.amount, 0));
  const actual = r2(got - spent), e2 = planAt(v2, today), e1 = planAt(v1, today);
  let verdict;
  if (state === 'before') verdict = `The plan starts ${start}; nothing is expected yet.`;
  else if (actual >= e1.cum) verdict = 'You are at or above the Jan-Jun plan.';
  else if (actual >= e2.cum) verdict = 'You are at or above the conservative plan.';
  else if (actual >= e2.lo) verdict = 'You are behind the conservative plan but inside its normal range (the worst 1 in 10 is lower).';
  else verdict = 'You are below the worst 1 in 10 of the plan. Look at the Drawdown left on each account and at any reset.';
  return { state, start, actual, payouts: got, fees: spent, expected: e2.cum, expectedJanJun: e1.cum, worst: e2.lo, best: e2.hi, gap: r2(actual - e2.cum), verdict };
}
