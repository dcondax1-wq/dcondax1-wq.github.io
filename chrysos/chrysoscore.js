// CHRYSOS core (ES module, no DOM, no network): the gold. The prop-firm eval and payout fleet planner. Pure, so tests/test_chrysos_page.py calls it in node.
// The numbers are computed by tools/money/chrysos.py (published as money/chrysos.json, or the saved fixture.json); this file validates them, picks the case, builds the tower model and the words.
// Every dollar is an ESTIMATE from backtests; nothing here promises income and nothing places or buys anything.

export const CASES = ['stress', 'conservative', 'base', 'optimistic'];
export const CASE_WORD = { stress: 'Stress', conservative: 'Cautious', base: 'Middle', optimistic: 'Hopeful' };
export const CASE_SAY = {
  stress: 'Stress (bot does badly): every account fails its eval twice in a row (you pay all fees three times), then earns like 2021-25, almost nothing.',
  conservative: 'Cautious: every account fails its first eval and is bought again, then pays 40% of what tests showed; every third month is as bad as the worst month of 2026.',
  base: 'Middle: the test results from the second half of 2026, as they are.',
  optimistic: 'Hopeful: the best test run and the firm\'s advertised payout rate. Do not plan on it.',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function price(x) { const v = num(x); return '$' + (v == null ? 0 : v).toFixed(2); }
export function pct(x) { const v = num(x); return (v == null ? 0 : Math.round(v)) + '%'; }
/** "in about 1.4 months", "already", "not within 12 months" */
export function beWords(m) {
  const v = num(m);
  if (v == null) return 'not within 12 months';
  if (v <= 0) return 'already';
  return v < 1 ? 'in under a month' : `in about ${v.toFixed(1).replace(/\.0$/, '')} months`;
}
export function dayWords(d) {
  const v = num(d); if (v == null) return 'unknown';
  if (v < 14) return `${Math.round(v)} days`;
  if (v < 60) return `about ${Math.round(v / 7)} weeks`;
  return `about ${(v / 30).toFixed(1).replace(/\.0$/, '')} months`;
}
/** "2026-12-25" -> "Dec 25" ; "2026-12" -> "December 2026" */
export function dateWords(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${MONTHS[Math.max(0, Math.min(11, +m[2] - 1))]} ${+m[3]}`;
}
export function monthWords(key) {
  const m = /^(\d{4})-(\d{2})/.exec(String(key || ''));
  return m ? `${MONTHS[Math.max(0, Math.min(11, +m[2] - 1))]} ${m[1]}` : String(key || '');
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isNumArr = (a, n) => Array.isArray(a) && a.length >= n && a.every((x) => num(x) != null);

function goodCase(c) {
  return isObj(c) && isNumArr(c.cum, 13) && isNumArr(c.income, 13) && isNumArr(c.fees_all, 13) && ['p_funded', 'cost_expected', 'payout_month', 'net6', 'net12', 'days_to_funded', 'days_to_first_payout'].every((k) => num(c[k]) != null);
}
function goodAccount(a) {
  return isObj(a) && typeof a.name === 'string' && isObj(a.cases) && CASES.every((k) => goodCase(a.cases[k])) && num(a.price) != null;
}

/** validate a published or fixture file. Returns the file when usable, else null (the page then falls back to its fixture). Never throws. */
export function usable(doc) {
  try {
    if (!isObj(doc) || doc.id !== 'chrysos' || !isObj(doc.chrysos)) return null;
    const c = doc.chrysos;
    if (!Array.isArray(c.owned) || !Array.isArray(c.candidates) || !Array.isArray(c.buy_next) || !isObj(c.fleet) || !Array.isArray(c.calendar)) return null;
    if (![...c.owned, ...c.candidates, ...c.buy_next].every(goodAccount)) return null;
    if (!CASES.every((k) => isObj(c.fleet[k]) && isNumArr(c.fleet[k].cum, 13))) return null;
    if (c.owned.length + c.buy_next.length === 0) return null;
    return doc;
  } catch (_) { return null; }
}

/** how stale the file is: 'fresh' | 'old' (> 3 days) | 'stale' (> 10 days) | 'unknown' ; now is a Date or ms */
export function age(doc, now) {
  const t = Date.parse(doc && doc.asof); const n = typeof now === 'number' ? now : (now instanceof Date ? now.getTime() : Date.now());
  if (!Number.isFinite(t) || !Number.isFinite(n)) return 'unknown';
  const d = (n - t) / 864e5;
  return d > 10 ? 'stale' : d > 3 ? 'old' : 'fresh';
}

export function fleetAccounts(doc) { return doc.chrysos.owned.concat(doc.chrysos.buy_next); }

export function headline(doc, key) {
  const f = doc.chrysos.fleet[key], n = fleetAccounts(doc).length;
  return `Estimate, ${CASE_WORD[key].toLowerCase()} case: ${n} account${n === 1 ? '' : 's'} net about ${money(f.net12)} over 12 months (${money(f.net6)} after 6), fees included; break-even ${beWords(f.breakeven_month)}. Not a promise.`;
}

/** one line for an account card */
export function accountLine(a, key) {
  const c = a.cases[key];
  const fund = `${pct(c.p_funded)} become funded`;
  const pay = c.payout_month > 0 ? `about ${money(c.payout_month)} a month expected once funded (${money(c.payout_month_if_funded)} if it is funded)` : 'no payouts expected';
  return `Estimate: ${fund}; first payout in ${dayWords(c.days_to_first_payout)}; ${pay}. Fees ${money(c.cost_expected)}${a.sunk ? ' more (the first fee is already paid)' : ''}; break-even ${beWords(c.breakeven_month)}.`;
}

/** the coin unit so the tallest tower is about 26 coins: 25 / 50 / 100 / 250 / 500 / 1000 */
export function coinUnit(tallest) {
  const raw = Math.max(1, (num(tallest) || 0) / 26);
  for (const u of [10, 25, 50, 100, 250, 500, 1000, 2500]) if (raw <= u) return u;
  return 5000;
}

/** the tower model at a month (0..12): per account a bronze drum (fees paid so far) and a stack of gold coins (payouts received so far). paidBack = the coins have passed the drum. */
export function towers(doc, key, month) {
  const m = Math.max(0, Math.min(12, Math.round(num(month) == null ? 12 : month)));
  const accs = fleetAccounts(doc);
  const rows = accs.map((a) => { const c = a.cases[key]; return { id: a.id, name: a.name, plan: a.plan, sunk: !!a.sunk, fees: Math.max(0, c.fees_all[m]), income: Math.max(0, c.income[m]), net: c.cum[m] }; });
  const finalFees = Math.max(0, ...accs.map((a) => Math.max(...a.cases[key].fees_all)));
  const finalIncome = Math.max(0, ...accs.map((a) => Math.max(...a.cases[key].income)));
  const unit = coinUnit(Math.max(finalFees, finalIncome));
  return { month: m, unit, towers: rows.map((r) => ({ ...r, drum: Math.max(1, Math.round(r.fees / unit * 4) / 4), coins: Math.floor(r.income / unit), paidBack: r.income >= r.fees && r.income > 0 })) };
}

/** the payout calendar, grouped by month: [{key, label, total_expected, total_if, rows:[{date, label, account, usd_if, chance, usd_expected}]}] */
export function calendarGroups(doc) {
  const g = new Map();
  for (const e of doc.chrysos.calendar) {
    if (!isObj(e) || num(e.usd_if_funded) == null) continue;
    const key = String(e.date).slice(0, 7);
    if (!g.has(key)) g.set(key, { key, label: monthWords(key), total_expected: 0, total_if: 0, rows: [] });
    const x = g.get(key); x.total_expected += num(e.usd_expected) || 0; x.total_if += num(e.usd_if_funded) || 0;
    x.rows.push({ date: e.date, label: dateWords(e.date), account: String(e.account), usd_if: e.usd_if_funded, chance: num(e.chance_pct) || 0, usd_expected: num(e.usd_expected) || 0 });
  }
  return [...g.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** "what could go wrong" lines, from the numbers (never empty) */
export function riskLines(doc, key) {
  const f = doc.chrysos.fleet, accs = fleetAccounts(doc), fees = accs.reduce((s, a) => s + (a.paid || a.price || 0), 0);
  const worst = f.stress.net12;
  const L = [];
  if (f.stress.loss_months && f.stress.loss_months.length) L.push(`In the stress case month ${f.stress.loss_months.join(' and ')} are LOSS months (every account is bought again) and the first two months are net negative.`);
  L.push(`All ${accs.length} account${accs.length === 1 ? '' : 's'} trade the same signals, so one bad stretch can fail them together. That would cost the fees, about ${money(fees)}.`);
  L.push(worst >= 0 ? `Even the stress case is only ${moneyS(worst)} over 12 months, and that case is itself a guess.` : `In the stress case the fleet LOSES ${money(-worst)} over 12 months.`);
  const hi = accs.reduce((m, a) => Math.max(m, a.cases[key].fail_pct), 0);
  L.push(`A failed eval means buying a new account: the fail share in this case is up to ${pct(hi)}, and the open ones can still fail later.`);
  L.push('Payouts need you present, a request every two weeks at most, and MFFU can change its rules. Re-check them before the first payout.');
  return L;
}

/** a one-line card for the Jarvis hub */
export function jarvisCard(doc, key) {
  const f = doc.chrysos.fleet[key || 'base'];
  return { name: 'Chrysos', level: doc.status === 'ok' ? 'ok' : 'off', net12: money(f.net12), line: `Estimate: ${money(f.net12)} net over 12 months, break-even ${beWords(f.breakeven_month)}.` };
}

/** "What if I am wrong?": the Stress case in plain sentences, always shown, whatever case is selected */
export function wrongLines(doc) {
  const f = doc.chrysos.fleet.stress, n = fleetAccounts(doc).length;
  const L = [];
  L.push(`Suppose the strategy is not as good as the backtests: all ${n} accounts fail their eval together, are bought again, fail again, and only the third try passes. After that they earn like the 2021-25 line, about nothing.`);
  L.push(`Estimate: after 6 months ${moneyS(f.net6)}, after 12 months ${moneyS(f.net12)}. Fees in this case: ${money(f.cost_expected)}.`);
  L.push(f.loss_months && f.loss_months.length ? `Loss months: ${f.loss_months.join(' and ')} (each time every account is paid for again).` : 'No loss month in this case.');
  L.push(f.net12 < 0 ? `That is a real loss of ${money(-f.net12)}. It is the price of finding out, and it is the number to compare with the plan above.` : `Even then the fleet ends near ${moneyS(f.net12)}. That is the weakest case, not a floor.`);
  return L;
}
